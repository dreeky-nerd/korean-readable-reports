#!/usr/bin/env node
'use strict';
/**
 * md → HTML 렌더러 (의존성 없음, Node 18+)
 *
 *   node render.js report.md                → report.html (같은 폴더)
 *   node render.js report.md -o out.html
 *   node render.js report.md --no-lint      → lint 건너뜀
 *   node render.js report.md --strict       → lint 경고 있으면 exit 1 (CI·pre-commit 게이트용)
 *   exit 2 = 입력 파일 없음/읽기 실패
 *
 * md 규약(이 스크립트가 알아보는 것):
 *   frontmatter   title / date / project / branch / kind / audience / summary  (전부 선택)
 *                 summary: |  또는  summary: >-  블록 스칼라 지원
 *                 theme: light(기본, OS가 다크여도 라이트) | dark | auto(보는 사람 OS 따름). 상단 토글로 보는 사람이 바꿀 수 있음
 *   # 제목        frontmatter.title 없으면 이걸 제목으로. 두 번째 이후 H1은 섹션(##)으로 강등(버리지 않음)
 *   #### ~ ######  h4
 *   ````lang      백틱 4개 이상 펜스도 됨 — 안의 ``` 는 내용으로 보존
 *   > 인용문      첫 H2 이전의 첫 인용문 = BLUF 요약 박스 (frontmatter.summary 없을 때). 둘 다 없으면 요약 박스 생략
 *   ## 섹션       .sec 카드 (번호 자동)
 *   ### 소제목    .block 카드 (섹션 안 번호 자동 → 배지 "01", "02"…). "TASK 3: 제목"처럼 쓰면 배지에 TASK 3
 *   ```mermaid    <pre class="mermaid">
 *   ```flow       가지 없는 순서 흐름 카드(폭에 맞춰 줄바꿈 + 곡선 화살표). 한 줄 = "제목 | 설명 | 역할"
 *                 역할: ext 외부 · entry 진입점 · logic 처리 · data 데이터 (또는 done/fail/caution/info/neutral)
 *   ```stats      핵심 수치 카드 격자. 한 줄 = "라벨 | 값 | 보조 설명 | 상태"(완료·실패·주의·미검증·중립 또는 영문)
 *                 flow·stats 칸 안의 글자 | 는 \| . 칸이 많거나 모르는 역할·상태 이름은 설명 뒤에 붙여 보여 줌(버리지 않음)
 *   ```cards      항목 카드 격자(같은 높이). 빈 줄로 카드 구분, 첫 줄 제목([완료]·[추천] 태그 가능), 나머지 본문(불릿·근거: 가능)
 *   ```lang       .code-dark 패널 (라벨 = 첫 토큰; shell-session, js title="x" 처럼 하이픈·속성 있어도 됨)
 *   | 표 |        .table-wrap. 헤더가 "상태"인 열 → .status, 첫 열이 짧으면 .key. 셀 안 파이프는 \| 로
 *   - 불릿        들여쓰기(2칸 이상)로 중첩 가능. 폭이 어긋나도 항목이 사라지지 않음
 *   [완료] [미검증] [실패] [블로커] [선재] [주의] [정보]  → 상태 태그 칩
 *   근거: … / 출처: …   줄 시작(들여쓰기 허용) → .sources 박스 (규칙 6)
 *   <details>     짝이 맞는 </details>까지 한 덩어리. 안쪽은 md로 다시 렌더(빈 줄·불릿·표 OK)
 *   raw HTML      허용 태그(details, div, figure, figcaption, img, p, ul, ol, table, pre, blockquote, section, br, hr)만
 *                 통과. 그 밖의 태그(<script> 등)는 텍스트로 이스케이프
 *   문단 안 줄바꿈 = <br> (규칙 11: 한 문장 한 줄)
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) {
  console.error('usage: node render.js <report.md> [-o out.html] [--no-lint] [--strict]');
  process.exit(args.length ? 0 : 1);
}
const inPath = args[0];
const outIdx = args.indexOf('-o');
const outPath = outIdx > -1 ? args[outIdx + 1] : inPath.replace(/\.md$/i, '') + '.html';
if (outIdx > -1 && (!outPath || outPath.startsWith('-'))) { console.error('render: -o 뒤에 출력 파일 경로가 없음'); process.exit(1); }
const doLint = !args.includes('--no-lint');
const strict = args.includes('--strict');

const TEMPLATE = path.join(__dirname, '..', 'references', 'template.html');
let src, tpl;
try { src = fs.readFileSync(inPath, 'utf8'); }
catch (e) { console.error(`render: 입력 파일을 읽을 수 없음 — ${inPath} (${e.code || e.message})`); process.exit(2); }
try { tpl = fs.readFileSync(TEMPLATE, 'utf8'); }
catch (e) { console.error(`render: 템플릿을 읽을 수 없음 — ${TEMPLATE}`); process.exit(2); }

const BOM = String.fromCharCode(0xFEFF);
src = src.replace(/\r\n/g, '\n');
if (src.startsWith(BOM)) src = src.slice(1);

// ── frontmatter (key: value, 들여쓴 연속줄, | / >- 블록 스칼라) ─────────────
let meta = {};
let body = src;
const fm = src.match(/^---\n([\s\S]*?)\n---\n?/);
if (fm) {
  body = src.slice(fm[0].length);
  let key = null, block = null;   // block: '|' 줄 유지, '>' 접기
  for (const line of fm[1].split('\n')) {
    const m = line.match(/^([\w가-힣-]+):\s*(.*)$/);
    if (m) {
      key = m[1]; const v = m[2].trim();
      if (/^[|>][-+]?$/.test(v)) { block = v[0]; meta[key] = ''; }
      else { block = null; meta[key] = v.replace(/^(["'])(.*)\1$/, '$2'); }
    } else if (key && /^\s+\S/.test(line)) {
      const t = line.trim();
      meta[key] = meta[key] ? meta[key] + (block === '>' ? ' ' : '\n') + t : t;
    }
  }
}

// ── inline ─────────────────────────────────────────────────────────────────
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAGS = {
  '완료': 'tag-done', '미검증': 'tag-unverified', '실패': 'tag-fail', '블로커': 'tag-fail',
  '선재': 'tag-preexisting', '주의': 'tag-caution', '정보': 'tag-info', '추천': 'tag-recommend',
};
const TAG_RE = new RegExp('\\[(' + Object.keys(TAGS).join('|') + ')\\]', 'g');
// 인라인 코드 자리표시자: NUL 문자를 소스에 원시 바이트로 박지 않고 실행 시 생성(git이 바이너리로 보지 않게)
const NUL = String.fromCharCode(0);
const NUL_RE = new RegExp(NUL + '(\\d+)' + NUL, 'g');
const safeHref = u => /^(https?:|mailto:|#|\/|\.\.?\/|[\w.-]+(\/|$))/i.test(u) && !/^javascript:/i.test(u) ? u : '#';

function inline(text) {
  const codes = [];
  let s = text.replace(/`([^`]+)`/g, (_, c) => { codes.push('<code>' + esc(c) + '</code>'); return NUL + (codes.length - 1) + NUL; });
  s = esc(s);
  s = s.replace(TAG_RE, (_, t) => `<span class="tag ${TAGS[t]}">${t}</span>`);
  s = s.replace(/\*\*(\S(?:[^*\n]*?\S)?)\*\*/g, '<strong>$1</strong>');
  // 기울임: 여는 *는 앞이 글자가 아니고 뒤가 공백이 아닐 때, 닫는 *는 앞이 공백이 아닐 때만 — "3 * 4 * 5", "*.log" 보호
  s = s.replace(/(^|[^\w*])\*(\S(?:[^*\n]*?\S)?)\*(?![\w*])/g, '$1<em>$2</em>');
  // URL: esc()가 만든 엔티티를 되돌린 뒤 스킴 검사 → 다시 이스케이프. 괄호 한 겹 포함 허용
  const unesc = u => u.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, t, u) => { const h = safeHref(unesc(u)); return h.charAt(0) === '#' ? `<a href="${esc(h)}">${t}</a>` : `<a href="${esc(h)}" target="_blank" rel="noopener noreferrer">${t}</a>`; });
  s = s.replace(NUL_RE, (_, i) => codes[i]);
  return s;
}

// ── helpers ────────────────────────────────────────────────────────────────
const usedIds = new Set();
function slug(t) {
  let base = t.replace(/[^\w가-힣]+/g, '-').replace(/^-|-$/g, '') || 'sec', id = base, n = 1;
  while (usedIds.has(id)) id = `${base}-${++n}`;
  usedIds.add(id); return id;
}

const PIPE = NUL + 'P' + NUL;
function renderTable(rows) {
  const cells = r => r.trim().replace(/\\\|/g, PIPE).replace(/^\||\|$/g, '').split('|').map(c => c.trim().split(PIPE).join('|'));
  const head = cells(rows[0]);
  const alignCells = cells(rows[1]);
  const bodyRows = rows.slice(2).map(cells);
  // 헤더보다 셀이 많은 행이 있으면 열을 늘려서(빈 헤더) 내용이 사라지지 않게
  const ncol = Math.max(head.length, ...bodyRows.map(r => r.length));
  while (head.length < ncol) head.push('');
  const align = Array.from({ length: ncol }, (_, ci) => { const c = alignCells[ci] || ''; return /^:?-+:$/.test(c) ? (c.startsWith(':') ? 'center' : 'right') : 'left'; });
  const statusCol = head.map(h => /^(상태|status)$/i.test(h));
  const keyCol = head.map((_, ci) => ci === 0 && bodyRows.every(r => (r[ci] || '').length <= 14));
  const cls = ci => [statusCol[ci] ? 'status' : '', keyCol[ci] && !statusCol[ci] ? 'key' : '', align[ci] === 'right' ? 'num' : ''].filter(Boolean).join(' ');
  const th = head.map((h, ci) => `<th${cls(ci) ? ` class="${cls(ci)}"` : ''}>${inline(h)}</th>`).join('');
  const trs = bodyRows.map(r => '<tr>' + head.map((_, ci) => `<td${cls(ci) ? ` class="${cls(ci)}"` : ''}>${inline(r[ci] || '')}</td>`).join('') + '</tr>').join('\n');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>\n${trs}\n</tbody></table></div>`;
}

// 좁은 카드(flow·stats·cards) 안의 긴 영문 식별자에 줄바꿈 지점(<wbr>)을 넣는다 — _ . / :: 뒤, 소문자→대문자(camelCase) 사이.
// 그대로 두면 "TaskEduTimeSetAnnounceTasklet의"가 쪼개질 곳이 없어 카드 밖으로 삐져나오거나(2026-09-30 실측 flow),
// 브라우저가 아무 글자에서나 끊는다("SEM904_B|01P"). <wbr>는 폭이 모자랄 때만 쓰이고 복사해도 글자가 늘지 않는다.
// 태그 속성·<pre>(코드·Mermaid 소스)는 건드리지 않는다
function softBreak(html) {
  return html.split(/(<pre[\s\S]*?<\/pre>|<[^>]+>)/).map((part, i) => i % 2 ? part
    : part.replace(/[^\s<>]{10,}/g, tok => tok
      .replace(/(::|[_./])(?=[^\s])/g, '$1<wbr>')
      .replace(/([a-z])(?=[A-Z])/g, '$1<wbr>'))).join('');
}

// flow·stats 줄 나누기: 표와 똑같이 \| 는 칸 구분이 아니라 글자 "|"(유니온 타입 A | B 등)
function splitFields(line) {
  return line.trim().replace(/\\\|/g, PIPE).split('|').map(c => c.trim().split(PIPE).join('|'));
}
// 칸이 정해진 개수보다 많거나, 역할·상태 칸에 모르는 이름이 오면 버리지 않고 글자로 살린다(lint가 따로 알림)
function spillOver(fields, fixed, known) {
  const head = fields.slice(0, fixed - 1);                 // 역할·상태 칸 앞까지
  let tag = fields[fixed - 1];
  const extra = fields.slice(fixed);
  const spill = [];
  if (tag !== undefined && tag !== '' && !known(tag)) { spill.push(tag); tag = ''; }
  spill.push(...extra.filter(s => s !== ''));
  return { head, tag: tag || '', spill };
}

// ```flow 블록: 가지 없는 순서 흐름. 한 줄 = 한 단계 "제목 | 설명 | 역할"(설명·역할 생략 가능)
// 카드가 폭에 맞춰 줄바꿈되고, 템플릿 JS가 단계 사이를 화살표(줄 바뀜은 곡선)로 잇는다
const FLOW_ROLES = /^(ext|entry|logic|data|done|fail|caution|info|neutral)$/;
function renderFlow(lines) {
  const steps = lines.map(l => l.trim()).filter(Boolean).map(splitFields);
  if (!steps.length) return '';
  const cards = steps.map((f, i) => {
    const { head: [title, desc], tag: role, spill } = spillOver(f, 3, r => FLOW_ROLES.test(r));
    const d = [desc, ...spill].filter(Boolean).join(' | ');
    return `<li class="flow-step${role ? ` role-${role}` : ''}"><span class="flow-no">${String(i + 1).padStart(2, '0')}</span>`
      + `<strong>${inline(title || '')}</strong>${d ? `<span class="flow-desc">${inline(d)}</span>` : ''}</li>`;
  });
  return `<div class="flow"><ol class="flow-list" aria-label="처리 순서">\n${cards.join('\n')}\n</ol></div>`;
}

// ```stats 블록: 핵심 수치 카드. 한 줄 = "라벨 | 값 | 보조 설명 | 상태"(보조 설명·상태 생략 가능)
// 상태는 왼쪽 색 띠 + 글자 배지(색만으로 상태를 구분하지 않는다 — design-guide §1·§5, 흑백 인쇄·색각 이상 대비)
const STAT_STATE = { done: 'done', '완료': 'done', fail: 'fail', '실패': 'fail', '블로커': 'fail', caution: 'caution', '주의': 'caution',
  unverified: 'unverified', '미검증': 'unverified', info: 'info', '정보': 'info', neutral: 'neutral', '중립': 'neutral', '선재': 'neutral' };
const STAT_LABEL = { done: '완료', fail: '실패', caution: '주의', unverified: '미검증', info: '정보', neutral: '중립' };
const STAT_TAG = { done: 'tag-done', fail: 'tag-fail', caution: 'tag-caution', unverified: 'tag-unverified', info: 'tag-info', neutral: 'tag-preexisting' };
const statKey = s => STAT_STATE[(s || '').toLowerCase()] || STAT_STATE[s || ''];
function renderStats(lines) {
  const items = lines.map(l => l.trim()).filter(Boolean).map(splitFields);
  if (!items.length) return '';
  const cards = items.map(f => {
    const { head: [label, value, note], tag: state, spill } = spillOver(f, 4, s => !!statKey(s));
    const st = statKey(state);
    const n = [note, ...spill].filter(Boolean).join(' | ');
    // 상태를 적었으면 원래 적은 글자(예: "블로커")로 배지를 단다. 안 적었으면 파랑 띠만(상태 없음)
    const chip = st ? `<span class="tag ${STAT_TAG[st]}">${esc(/^[a-z]+$/i.test(state) ? STAT_LABEL[st] : state)}</span>` : '';
    return `<div class="stat s-${st || 'info'}"><span class="stat-head"><span class="stat-label">${inline(label || '')}</span>${chip}</span>`
      + `<span class="stat-value">${inline(value || '')}</span>${n ? `<span class="stat-note">${inline(n)}</span>` : ''}</div>`;
  });
  // 열 수: 항목 카드와 같은 규칙 — 4개 이하면 개수만큼, 그 이상은 4로 나눠떨어지면 4, 아니면 3(6개가 4+2로 쪼개지지 않게)
  const n = cards.length, cols = n <= 4 ? n : n % 4 === 0 ? 4 : 3;
  // 값 글자 크기: 숫자 카드(1.85em)는 "42건"처럼 짧은 값용. 값에 긴 이름("PLM_LPATH_BS")이 오면 그 크기로는 카드 폭을 넘어
  // 글자 중간에서 잘린다(2026-09-30 실측: 4열 카드 본문 폭 약 167px). 가장 긴 단어의 폭을 어림해 한 개라도 넘으면
  // 블록 전체를 작은 글자(is-text)로 — 한 줄 안에서 값 크기가 들쭉날쭉하지 않게
  const inner = (860 - 14 * (cols - 1)) / cols - 37;                 // 본문 최대 폭 860px 기준 카드 안쪽 폭
  const wordEm = w => [...w].reduce((a, c) => a + (/[가-힣ㄱ-ㅎ一-鿿]/.test(c) ? 1 : /[A-Z0-9%]/.test(c) ? 0.7 : /[a-z]/.test(c) ? 0.6 : 0.5), 0);
  const values = items.map(f => (f[1] || '').replace(/[`*]/g, ''));
  const widest = Math.max(0, ...values.flatMap(v => v.split(/\s+/)).map(wordEm));
  const textMode = widest * 1.85 * 16 > inner * 0.9;                 // 폭 어림 오차·좁은 화면 여유 10%
  return `<div class="stats${textMode ? ' is-text' : ''}" style="--cols:${cols}">\n${cards.join('\n')}\n</div>`;
}

// ```cards 블록: 나란히 놓는 항목 카드. 빈 줄로 카드를 나누고, 첫 줄 = 제목([완료] 같은 태그 가능, [추천]이면 강조 테두리),
// 나머지 줄 = 본문(문장·불릿·"근거:" 줄 그대로 됨)
// 배치는 본문 길이로 자동 결정(2026-09-23 실측: 200자 넘는 글을 3열 276px 카드에 넣으니 문장이 서너 줄로 쪼개지고
// 근거 파일명이 중간에서 잘리고, 짧은 카드 아래가 비었다). 카드는 짧은 내용용이라 길면 한 줄에 하나로 편다.
//   짧음(본문 60자 이하) grid 3열 · 중간(140자 이하, 또는 근거 줄 있음) half 2열 · 긺(140자 초과) wide 한 줄 하나(왼쪽 번호·제목, 오른쪽 본문)
//   ```cards wide|half|grid 로 직접 고를 수도 있다
const CARD_TAG_RE = /\[(완료|미검증|실패|블로커|선재|주의|정보|추천)\]/g;
function renderCards(lines, info) {
  const groups = [];
  let cur = null;
  for (const l of lines) {
    if (!l.trim()) { cur = null; continue; }
    if (!cur) { cur = []; groups.push(cur); }
    cur.push(l);
  }
  const plainLen = g => g.slice(1).filter(l => !SOURCES_RE.test(l)).join(' ')
    .replace(/`([^`]*)`/g, '$1').replace(/\*\*|^\s*[-*]\s+/gm, '').replace(/\s+/g, ' ').trim().length;
  const maxLen = Math.max(0, ...groups.map(plainLen));
  const hasSources = groups.some(g => g.slice(1).some(l => SOURCES_RE.test(l)));
  const forced = (info.match(/\b(wide|half|grid)\b/) || [])[1];
  const n = groups.length;
  if (!n) return '';   // 빈 블록 — --cols:0 으로 CSS가 무효가 되지 않게 아예 안 만든다(lint가 알림)
  let layout = forced || (maxLen > 140 ? 'wide' : (maxLen > 60 || hasSources) ? 'half' : 'grid');
  // 마지막 줄에 카드 하나만 남지 않게(실측: 2열에 3개면 세 번째가 혼자 반쪽). half는 짝수일 때만, 홀수·1개면 wide
  if (!forced && layout === 'half' && n % 2 === 1) layout = 'wide';
  if (!forced && n === 1) layout = 'wide';
  // grid 열 수: 4개 이하면 개수만큼, 그 이상은 4로 나눠떨어지면 4, 아니면 3
  const cols = layout === 'grid' ? (n <= 4 ? n : n % 4 === 0 ? 4 : 3) : 2;

  const cards = groups.map((g, i) => {
    const raw = g[0].trim();
    const rec = /\[추천\]/.test(raw) ? ' is-recommended' : '';
    // 상태 배지는 제목 위 작은 줄로 — 제목 끝에 붙이면 긴 제목일 때 배지만 다음 줄로 떨어진다
    const tags = (raw.match(CARD_TAG_RE) || []).map(t => inline(t)).join('');
    const name = raw.replace(CARD_TAG_RE, '').replace(/\s{2,}/g, ' ').trim();
    const no = layout === 'wide' ? `<span class="card-no">${String(i + 1).padStart(2, '0')}</span>` : '';
    const head = `<div class="card-head">${no}${tags ? `<span class="card-tags">${tags}</span>` : ''}<h4 class="card-title">${inline(name)}</h4></div>`;
    const body = g.length > 1 ? renderBlocks(g.slice(1), true).join('\n') : '';
    return `<article class="card${rec}">${head}${body ? `<div class="card-body">${body}</div>` : ''}</article>`;
  });
  return `<div class="cards is-${layout}" style="--cols:${cols}">\n${cards.join('\n')}\n</div>`;
}

// 불릿 목록: 들여쓰기로 중첩. items = [{indent, ordered, text}]
function renderList(items) {
  // 들여쓰기 칸 수를 깊이(0,1,2…)로 정규화 — 폭이 들쭉날쭉해도(3칸→1칸) 항목이 조용히 사라지지 않게
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1]) stack.pop();
    if (!stack.length || it.indent > stack[stack.length - 1]) stack.push(it.indent);
    it.indent = stack.length - 1;
  }
  let k = 0;
  function level(indent) {
    let html = '';
    while (k < items.length && items[k].indent === indent) {
      // 같은 깊이에서 마커가 바뀌면(- → 1.) 목록을 새로 연다
      const ordered = items[k].ordered;
      html += ordered ? '<ol>' : '<ul>';
      while (k < items.length && items[k].indent === indent && items[k].ordered === ordered) {
        html += '<li>' + inline(items[k].text);
        k++;
        if (k < items.length && items[k].indent > indent) html += level(items[k].indent);
        html += '</li>';
      }
      html += ordered ? '</ol>' : '</ul>';
    }
    return html;
  }
  return level(items[0].indent);
}

const FENCE_RE = /^(`{3,})\s*([^\s`]*)\s*(.*)$/;  // [3]=언어 뒤 나머지(예: ```cards wide 의 "wide")         // [1]=백틱 런(3개 이상), [2]=언어. 닫는 펜스는 같거나 더 긴 백틱 런만              // 언어 = 첫 토큰(하이픈·속성 허용). ``` 로 시작하면 무조건 펜스
const LIST_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const SOURCES_RE = /^\s*(근거|출처|basis|sources)\s*[:：]/i;
const HTML_ALLOW = /^<(details|div|figure|figcaption|img|p|ul|ol|table|pre|blockquote|section|br|hr)(\s|>|\/)/i;
const tableStart = (lines, i) => /^\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1]);
const isBlockStart = l => /^(#{1,6}\s|`{3,}|>|\s*\||\s*([-*]|\d+\.)\s|---+\s*$)/.test(l) || SOURCES_RE.test(l) || HTML_ALLOW.test(l);

// raw HTML 덩어리: 첫 줄 태그의 열림/닫힘 짝이 맞을 때까지 모은다(빈 줄에 끊지 않음)
function collectHtml(lines, i) {
  const tag = lines[i].match(/^<([a-zA-Z][\w-]*)/)[1].toLowerCase();
  const VOID = /^(img|hr|br)$/i;
  const open = new RegExp('<' + tag + '(\\s|>|/)', 'gi'), close = new RegExp('</' + tag + '\\s*>', 'gi');
  const buf = []; let depth = 0;
  do {
    const l = lines[i++]; buf.push(l);
    depth += (l.match(open) || []).length - (l.match(close) || []).length;
    if (VOID.test(tag)) break;
  } while (i < lines.length && depth > 0);
  return { buf, next: i, tag };
}

// <details> 안쪽: summary 줄 다음부터 닫는 태그 전까지를 md로 다시 렌더
function renderDetails(buf) {
  const first = buf[0], last = buf[buf.length - 1];
  const inner = buf.slice(1, -1);
  const closeIdx = last.lastIndexOf('</details>');
  const tail = closeIdx > -1 ? last.slice(0, closeIdx) : last;
  if (tail.trim()) inner.push(tail);
  // </details> 뒤에 같은 줄로 이어 쓴 글자는 버리지 않고 뒤따르는 문단으로
  const after = closeIdx > -1 ? last.slice(closeIdx + '</details>'.length).trim() : '';
  let summary = '';
  if (inner.length && /^\s*<summary/i.test(inner[0])) summary = inner.shift();
  return [first, summary, ...renderBlocks(inner, true), '</details>', after ? `<p>${inline(after)}</p>` : ''].filter(Boolean).join('\n');
}

// ── block parser (nested=true 면 섹션/블록 카드 안 만들고 제목은 h4) ───────────
let seenH1 = false, seenH2 = false, summary = meta.summary || '', title = meta.title || '';
let blockNo = 0;

function renderBlocks(lines, nested) {
  const out = [];
  let i = 0, secOpen = false, blockOpen = false;
  const closeBlock = () => { if (blockOpen) { out.push('</div>'); blockOpen = false; } };
  const closeSec = () => { closeBlock(); if (secOpen) { out.push('</section>'); secOpen = false; } };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;

    if ((m = line.match(FENCE_RE))) {
      const fenceLen = m[1].length, lang = m[2], info = (m[3] || '').trim(); const buf = []; i++;
      // ```` 네 개짜리 펜스 안의 ``` 는 내용이다 — 여는 것과 같거나 긴 백틱 런 + 뒤에 공백만 있을 때만 닫힘
      const isClose = l => { const c = l.match(/^(`{3,})\s*$/); return !!c && c[1].length >= fenceLen; };
      while (i < lines.length && !isClose(lines[i])) buf.push(lines[i++]);
      i++;
      if (lang === 'mermaid') out.push('<pre class="mermaid">\n' + esc(buf.join('\n')) + '\n</pre>');
      else if (lang === 'flow') out.push(softBreak(renderFlow(buf)));
      else if (lang === 'stats') out.push(softBreak(renderStats(buf)));
      else if (lang === 'cards') out.push(softBreak(renderCards(buf, info)));
      else out.push(`<div class="code-dark"><div class="panel-label">${esc(lang || 'code')}</div><pre>${esc(buf.join('\n'))}</pre></div>`);
      continue;
    }

    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      let lv = m[1].length; const t = m[2].trim(); i++;
      if (nested) { out.push(`<h4>${inline(t)}</h4>`); continue; }
      // 본문 첫 H1 = 문서 제목(frontmatter title 이 있으면 그쪽 우선). 두 번째 이후 H1은 버리지 않고 섹션(H2)으로 강등
      if (lv === 1) { if (!seenH1) { seenH1 = true; if (!title) title = t; continue; } lv = 2; }
      if (lv === 2) { closeSec(); seenH2 = true; blockNo = 0; out.push(`<section class="sec" id="${slug(t)}">\n<h2>${inline(t)}</h2>`); secOpen = true; continue; }
      if (lv === 3) {
        // H2 없이 H3가 먼저 오면 제목 없는 섹션을 열어 카드 스타일·목차 흐름을 유지
        if (!secOpen) { out.push(`<section class="sec" id="${slug(t)}">`); secOpen = true; }
        closeBlock(); blockNo++;
        let tt = t, badge = String(blockNo).padStart(2, '0');
        const bm = tt.match(/^([A-Za-z가-힣]+\s*\d+)\s*[:：]\s*(.+)$/);
        if (bm) { badge = bm[1].toUpperCase(); tt = bm[2]; }
        out.push(`<div class="block">\n<span class="block-badge">${esc(badge)}</span>\n<h3>${inline(tt)}</h3>`);
        blockOpen = true; continue;
      }
      out.push(`<h4>${inline(t)}</h4>`); continue;
    }

    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const text = buf.join('\n').trim();
      if (!nested && !seenH2 && !summary) summary = text;
      else out.push(`<blockquote>${inline(text).replace(/\n/g, '<br>')}</blockquote>`);
      continue;
    }

    if (tableStart(lines, i)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out.push(renderTable(rows)); continue;
    }

    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && (m = lines[i].match(LIST_RE))) {
        const it = { indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }; i++;
        while (i < lines.length && lines[i].trim() && !LIST_RE.test(lines[i]) && /^\s{2,}/.test(lines[i])) it.text += ' ' + lines[i++].trim();
        items.push(it);
      }
      out.push(renderList(items)); continue;
    }

    if (SOURCES_RE.test(line)) { out.push(`<div class="sources">${inline(line.trim())}</div>`); i++; continue; }

    if (HTML_ALLOW.test(line)) {
      const { buf, next, tag } = collectHtml(lines, i); i = next;
      out.push(tag === 'details' ? renderDetails(buf) : buf.join('\n')); continue;
    }

    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // 문단 (허용 목록에 없는 <script> 같은 태그는 여기로 와서 텍스트로 이스케이프됨)
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    out.push('<p>' + buf.map(inline).join('<br>\n') + '</p>');
  }
  closeSec();
  return out;
}

const out = renderBlocks(body.split('\n'), false);

// ── template fill ──────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const date = meta.date || today;
const proj = meta.project || '';
const branch = meta.branch || '';
const kind = meta.kind || '보고서';
// 화면 테마 기본값: light(기본, OS 무관 고정) | dark | auto(보는 사람 OS 따름). 보는 사람이 토글하면 그쪽이 우선
const theme = /^(light|dark|auto)$/i.test((meta.theme || '').trim()) ? meta.theme.trim().toLowerCase() : 'light';
if (!title) title = path.basename(inPath, '.md');

const pills = [
  `<span class="pill">작업일 <b>${esc(date)}</b></span>`,
  proj ? `<span class="pill">대상 <b>${esc(proj)}</b></span>` : '',
  branch ? `<span class="pill">브랜치 <b>${esc(branch)}</b></span>` : '',
].filter(Boolean).join('\n      ');

let html = tpl;
const between = (s, a, b) => { const x = s.indexOf(a), y = s.indexOf(b, x); return [x, y + b.length]; };
{
  const [a, b] = between(html, '<main>', '</main>');
  html = html.slice(0, a) + '<main>\n' + out.join('\n\n') + '\n</main>' + html.slice(b);
}
{
  const [a, b] = between(html, '<div class="meta-row">', '</div>');
  html = html.slice(0, a) + '<div class="meta-row">\n      ' + pills + '\n    </div>' + html.slice(b);
}
{
  // 요약 없으면 빈 "요약" 상자를 남기지 않고 통째로 뺀다
  const [a, b] = between(html, '<div class="callout">', '</div>');
  html = html.slice(0, a) + (summary ? '<div class="callout">' + inline(summary).replace(/\n/g, '<br>\n') + '</div>' : '') + html.slice(b);
}
// 치환값에 $& 같은 패턴이 있어도 그대로 들어가게 함수 replacer 사용
html = html
  .replace('data-theme-default="light"', () => `data-theme-default="${theme}"`)
  .split('{{TITLE}}').join(esc(title))
  .split('{{작업일}}').join(esc(date))
  .replace('{{문서 종류 — 예: 작업기록 · 이슈정리 · 핸드오프}}', () => esc(kind))
  .replace(/\{\{작성자·생성 도구 한 줄[^}]*\}\}/, () => `작성 ${esc(date)}${meta.author ? ' · ' + esc(meta.author) : ''} · human-readable-reports/render.js`);

// 출력: 기본은 md 옆(= 실행 위치의 reports/). 쓰기 권한이 없으면 바탕화면 reports/ 로 넘긴다
function desktopDir() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const cands = [path.join(home, 'Desktop'), path.join(home, 'OneDrive', 'Desktop'), path.join(home, 'OneDrive', '바탕 화면'), path.join(home, '바탕 화면')];
  return cands.find(d => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } }) || home;
}
let written = outPath;
try {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, html);
} catch (e) {
  if (!/^(EACCES|EPERM|EROFS|ENOENT|EBUSY)$/.test(e.code)) throw e;
  const dir = path.join(desktopDir(), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  written = path.join(dir, path.basename(outPath));
  fs.writeFileSync(written, html);
  console.log(`render: ${outPath} 에 쓸 수 없어서(${e.code}) 바탕화면으로 저장`);
}
console.log('rendered → ' + path.resolve(written));

if (doLint) {
  const { lint, report } = require('./lint.js');
  console.log('');
  const errors = report(inPath, lint(src));
  if (strict && errors) process.exit(1);
}
