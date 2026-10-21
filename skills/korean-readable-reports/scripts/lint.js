#!/usr/bin/env node
'use strict';
/**
 * 보고서 md lint — SKILL.md 체크리스트 중 기계로 잡히는 항목만 검사.
 *
 *   node lint.js report.md            → 경고 출력, exit 0
 *   node lint.js report.md --strict   → 경고 있으면 exit 1
 *   node lint.js report.md --plain    → 문체 규칙(2·4·6·7·8·11·13·14·15) 없이 구조·안전 검사만.
 *                                       이 스킬의 문체를 따르지 않는 문서(기획서·제안서 등, report-team)용
 *        --renderer      (--plain에서) 렌더용 frontmatter title·date·audience 필수. 기본 모드는 항상 필수
 *        --reader-review (--plain에서) 본문 file:line 검사(규칙 6) 켜기. 기본 모드는 항상 켜짐
 *        --external      audience와 무관하게 외부 공유 검사(규칙 1) 켜기
 *
 * 검사 항목(규칙 번호는 SKILL.md, "fm"/"구조"는 렌더 안전용):
 *   fm  frontmatter 없음·안 닫힘 / title·date·audience 누락 (audience 없으면 외부 공유 검사가 조용히 꺼지므로 필수)
 *       date는 실제 있는 날짜 YYYY-MM-DD / audience·theme 값
 *   1   audience: external(또는 --external) — 브랜치 경로(feature/…)·내부 호스트·개인 로컬 경로·IP·사번 패턴, redact: 목록(쉼표 구분).
 *       frontmatter·코드·접힌 상세까지 전부 보고, 찾은 문자열은 출력하지 않는다(CI 로그에 다시 새지 않게)
 *   2   요약 박스 문장 3개 초과 / 요약이 두 번(frontmatter summary + 같은 내용의 H1 아래 인용문) / 자기 문서 예고 / (힌트) 표·그림 예고·H2 첫 문장의 제목 반복·수정 과정
 *       (힌트) 정합성 — 요약 박스 수치가 본문에 없음, 본문의 추천안([추천]·"추천합니다")이 요약에 없음, 문장 끝 개수 예고("세 가지입니다")와 바로 아래 목록·flow·cards·표 항목 수가 다름, "뒤에서 다루겠습니다" 미룬 약속
 *   4   출처 섹션·URL 불릿 외 서술어 없는 불릿 / 비표준 상태 태그 — 한국어: 다/요/음/함/됨/./: 로 안 끝나는 항목
 *   6   본문 문장 안에 file:line (근거: 줄·코드펜스·표 제외)
 *   7   표 본문 칸 60자 초과·2문장 이상(첫 열·details 포함) / 설명 칸이 코드만 있음
 *   8   H1 두 개 이상 / H2 7개 초과 / 섹션 본문 12줄 초과(코드·표·details 제외) / H2 전에 H3 / 전체 읽을 글 6000자 초과(힌트)
 *       (힌트) 8자 넘는 괄호 단서 12곳 이상 또는 두 개 든 줄 3줄 이상(조건은 근거 줄로) / 유보 두 겹("~고 봅니다 [추정]")
 *   9   <details> 열림/닫힘 짝이 안 맞음
 *   11  한 줄에 문장 2개 이상 (마침표 뒤 공백 없어도 잡음, 말줄임표는 제외)
 *   13  "## 배경" 없음·첫 섹션 아님 / 배경에 요청·현상 라벨 없음 / "비유하자면"·"그래서 이번에" 같은 이야기체 표현
 *   15  flow·mermaid 한 그림에 역할 색(ext…)과 상태 색(done…)을 섞음
 *       (힌트) 그림이 나을 내용을 글로만 씀 — 주어 있는 처리 단계 3개 이상 나열, 화살표 3단계 이상. --strict 실패 사유 아님
 *       (힌트) flow 단계에 실패 조건("실패하면") — 갈라지는 흐름은 Mermaid
 *   14  자연스러운 한국어 — 은유 소제목("요청이 지나가는 길", "~ 지도"), 의인화·번역투 동사(지나가다·조립하다·창구를 열다·뽑아내다),
 *       구어체 강조어(딱·진짜), 예고 문장("나누면 이렇습니다"), 괄호 비유 풀이("기계(코드)"),
 *       번역투(에 의해·되어지다·하기 위해서는·선택적·을 가진·자동 조사 "을(를)"),
 *       업무 관용투(하시기 바랍니다·하는 것이 가능·하도록 하겠습니다·을 진행합니다), 표기(파라메터·어플리케이션),
 *       용어 섞임(오류/에러·반환/리턴·파라미터/매개변수). 힌트: 사물 주어, 영어 낱말+하다, 해당·에 대한·를 통해·로 인해 4회 이상.
 *       (힌트) 인용 표지 없는 따옴표 명사구 5곳 이상(강조용 따옴표), 한 섹션 문두 접속어(다만·그러나·그래서…) 3개 이상
 *       frontmatter summary(요약 상자)도 본문과 같이 본다. 따옴표 안은 인용이라 건너뜀. 기준은 references/ko-terms.md
 *   구조 코드펜스(``` ~~~) 안 닫힘 / 표 구분 행 없음·칸 수가 헤더와 다름(접힌 상세 안 포함) / 허용 안 되는 링크 주소
 *        각주·참조형 링크(미지원) / (힌트) 렌더러가 글자로 보여 주는 태그, (--plain만) 4칸 들여쓴 줄
 *        flow·stats 칸이 정해진 수보다 많음 / 모르는 역할·상태 이름 / 빈 flow·stats·cards 블록
 */
const fs = require('fs');

const ENDERS = /(다|요|음|함|됨|임|것|\.|:|：)\s*[.!?]?\s*$/;   // 문장/서술 끝으로 볼 패턴
const FILE_LINE = /\b[\w./-]+\.(js|ts|tsx|jsx|py|java|kt|go|rs|rb|php|cs|c|cpp|h|xml|yml|yaml|json|sql|sh|md)\s*:\s*\d+/;
const SOURCES_RE = /^\s*(근거|출처|basis|sources)\s*[:：]/i;
const BOM = String.fromCharCode(0xFEFF);
// 렌더러(render.js)가 통과시키는 raw HTML 태그 — 나머지는 텍스트로 이스케이프된다. render.js가 이 목록을 그대로 쓴다
const HTML_TAGS = /^(details|summary|div|span|figure|figcaption|img|p|ul|ol|li|table|thead|tbody|tr|th|td|caption|pre|code|blockquote|section|br|hr|strong|em|b|i|sub|sup|a)$/i;

// 상태 태그의 단일 목록: 렌더·불릿·요약·참조 정의가 함께 쓴다.
// 미확인=찾아봤지만 확인 못 함, 미검증=검증 미실시. 의미는 구별하고 노랑만 공유(2026-10-21).
const STATUS_TAGS = {
  '완료': 'tag-done', '미검증': 'tag-unverified', '미확인': 'tag-unverified',
  '실패': 'tag-fail', '블로커': 'tag-fail', '선재': 'tag-preexisting',
  '주의': 'tag-caution', '정보': 'tag-info', '추천': 'tag-recommend', '추정': 'tag-preexisting',
};
const STATUS_RE = new RegExp('\\[(' + Object.keys(STATUS_TAGS).join('|') + ')\\]', 'g');
const SOURCE_HEADING = /^(?:\d+[.)]\s*)?(?:출처|근거|참고(?:\s*(?:문헌|자료|링크))?|references|sources|basis)(?:\s*(?:및|·|\/|&)\s*(?:출처|근거|참고(?:\s*(?:문헌|자료|링크))?|references|sources|basis))*(?:\s*\([^)]*\))?\s*$/i;

// 링크·이미지 주소: http(s)·mailto 또는 스킴 없는 상대 경로만. "//host", 공백·따옴표·꺾쇠가 든 주소는 거부(속성 탈출 방지)
const safeUrl = u => !/[\u0000- <>"'`]/.test(u) && !u.startsWith('//') &&
  (/^(https?:|mailto:)/i.test(u) || !/^[^/?#]*:/.test(u));

// 문장 수: 말줄임표·소수점·약어 제거 후, 종결부호 뒤 공백/끝 또는 한글 종결어미+마침표 뒤 바로 글자(공백 없는 타자)
function countSentences(text) {
  const t = text.replace(/\.{2,}|…/g, ' ').replace(/\d\.\d/g, '00').replace(/\b(e\.g|i\.e|vs|etc|Mr|Dr|No|cf)\./gi, 'x');
  return (t.match(/[.!?。](?=\s|$)|(다|요|죠|음|함|됨|임)[.!?](?=\S)/g) || []).length;
}

function parseFrontmatter(lines) {
  const meta = {}; let start = 0, has = false;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end < 0) return { meta, start, has, unclosed: true };
    has = true; start = end + 1;
    let key = null, block = null;
    for (const l of lines.slice(1, end)) {
      const m = l.match(/^([\w가-힣-]+):\s*(.*)$/);
      if (m) {
        key = m[1]; const v = m[2].trim();
        if (/^[|>][-+]?$/.test(v)) { block = v[0]; meta[key] = ''; }
        else { block = null; meta[key] = v.replace(/^(["'])(.*)\1$/, '$2'); }
      } else if (key && /^\s+\S/.test(l)) {
        const t = l.trim();
        meta[key] = meta[key] ? meta[key] + (block === '>' ? ' ' : '\n') + t : t;
      }
    }
  }
  return { meta, start, has, unclosed: false };
}

// 코드펜스 지도: ``` 와 ~~~ (앞 공백 3칸까지), 닫는 펜스는 같은 글자로 같거나 더 길게 + 뒤에 공백만.
// 모든 검사가 이 지도 하나를 쓴다 — 검사마다 펜스를 따로 세면 ~~~ 나 ```` 안의 ``` 에서 서로 어긋난다
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`~]*)\s*(.*)$/;
function scanFences(lines, start) {
  const at = new Array(lines.length).fill(null);   // 펜스 줄(여는·닫는·안쪽)이면 그 블록
  const blocks = [];
  let cur = null;
  for (let i = start; i < lines.length; i++) {
    const m = lines[i].match(FENCE_RE);
    if (!cur) {
      if (m) { cur = { open: i, close: -1, char: m[1][0], len: m[1].length, kind: m[2].toLowerCase(), body: [] }; blocks.push(cur); at[i] = cur; }
      continue;
    }
    at[i] = cur;
    if (m && m[1][0] === cur.char && m[1].length >= cur.len && !m[2] && !m[3]) { cur.close = i; cur = null; }
    else cur.body.push([i, lines[i]]);
  }
  return { at, blocks };
}

// 읽을 글만 센다: 표·접힌 글·요약·렌더용 블록 포함, 일반 코드·출처 제외.
const SOURCES_LINE = /^\s*(?:>\s*)?(?:[-*+]\s*)?(?:\*\*)?(근거|출처|basis|sources)(?:\*\*)?\s*[:：]/i;
// HTML 후보는 한 번만 훑는다. 닫히지 않은 태그·따옴표는 뒤의 <마다 다시 검색하지 않는다.
function htmlTokens(text, literalLines = []) {
  const out = [], start = /<!--|<\/?[a-zA-Z][\w-]*/g;
  let m, line = 0, cursor = 0;
  while ((m = start.exec(text))) {
    line += (text.slice(cursor, m.index).match(/\n/g) || []).length;
    cursor = m.index;
    if (literalLines[line]) {
      const end = text.indexOf('\n', m.index);
      start.lastIndex = end < 0 ? text.length : end;
      continue;
    }
    let end = start.lastIndex, quote = '';
    if (m[0] === '<!--') {
      const close = text.indexOf('-->', end);
      end = close < 0 ? text.length : close + 3;
      out.push({start: m.index, end, line, comment: true});
    } else {
      for (; end < text.length; end++) {
        const c = text[end];
        if (quote) { if (c === quote) quote = ''; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        else if (c === '<') break;
      }
      if (text[end] !== '>') { start.lastIndex = end; continue; }
      end++;
      out.push({start: m.index, end, line, name: m[0].replace(/^<\/?/, '').toLowerCase(), close: m[0][1] === '/'});
    }
    start.lastIndex = end;
  }
  return out;
}
// 제거 후에도 원래 줄 번호를 보존한다. hide는 닫힌 요소 전체, strip은 태그만 가린다.
function maskHtml(text, {tokens = htmlTokens(text), hide = () => false, strip = () => true, comments = () => true} = {}) {
  const opens = new Map(), ends = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.comment) continue;
    if (!opens.has(t.name)) opens.set(t.name, []);
    const stack = opens.get(t.name);
    if (!t.close) stack.push(i);
    else if (stack.length) ends.set(stack.pop(), i);
  }
  const out = []; let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]; let end = t.end;
    if (t.comment ? !comments(t) : !strip(t) && !hide(t)) continue;
    if (!t.close && hide(t) && ends.has(i)) { i = ends.get(i); end = tokens[i].end; }
    out.push(text.slice(cursor, t.start), text.slice(t.start, end).replace(/[^\n]/g, ''));
    cursor = end;
  }
  return out.join('') + text.slice(cursor);
}
// 링크가 아니어도 라벨 후보 전체를 소비해, 닫힘 실패 때 안쪽 [부터 다시 찾지 않는다.
function replaceLinks(text, replace) {
  return text.replace(/(!?)\[([^\]]*)(?:\](?:\(((?:[^()\s]|\([^()\s]*\))*)\))?|$)/g,
    (raw, image, label, url) => url === undefined ? raw : replace(image, label, url));
}
function visibleText(text, literalHtml = false) {
  return replaceLinks((literalHtml ? text : maskHtml(text, {hide: t => /^(pre|code)$/.test(t.name)}))
    .replace(/`[^`]*`/g, ''), (image, label) => image ? '' : label)
    .replace(/<https?:\/\/[^<>]+>/gi, '')
    .replace(/(?:https?:\/\/|mailto:)[^\s<>]+/gi, '')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^\s*(?:>\s*)+(?:[-*+]\s+)?/, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/^\[[ xX]\]\s*/, '')
    .replace(/(?:\*\*|__|~~|(?<!\w)[*_]|[*_](?!\w))/g, '')
    .replace(/\\([|*_`[\]<>])/g, '$1')
    .replace(/\s+/g, ' ').trim();
}
const isSep = l => /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*\|?\s*$/.test(l) && /-/.test(l);
function splitCells(l) {
  return l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(t => visibleText(t, true));
}
const READABLE_BLOCK = /^(cards|browser|flow|stats)$/;
const FLOW_ROLE = /^(ext|entry|logic|data|done|fail|caution|info|neutral)$/;
const BLOCK_STATE = /^(done|완료|fail|실패|블로커|caution|주의|unverified|미검증|info|정보|neutral|중립|선재)$/i;
const HTML_BLOCK = /^<(div|figure|figcaption|img|p|ul|ol|table|pre|blockquote|section|br|hr)(\s|>|\/)/i;
// 읽기량·태그·표 칸이 같은 제외 결과를 쓴다. flow·stats는 HTML도 주석도 글자로 표시한다.
function readingLines(lines, at) {
  const masked = lines.map((l, i) => at[i] && (!READABLE_BLOCK.test(at[i].kind) || at[i].open === i || at[i].close === i) ? '' : l);
  const text = masked.join('\n'), raw = new Array(lines.length).fill(false);
  const detailsAt = Array.from({length: lines.length}, () => []), inline = [];
  let card = null, title = true;
  for (let i = 0; i < lines.length; i++) {
    const fb = at[i];
    if (fb !== card) { card = fb; title = true; }
    inline[i] = !!fb && /^(flow|stats)$/.test(fb.kind);
    if (fb?.kind === 'cards' && fb.open !== i && fb.close !== i) {
      if (!lines[i].trim()) title = true;
      else if (title) { inline[i] = true; title = false; }
    }
  }
  const tokens = htmlTokens(text, inline);
  let block = '', depth = 0, tokenIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const literal = inline[i];
    if (!literal && !block) {
      const m = masked[i].match(HTML_BLOCK);
      if (m) { block = m[1].toLowerCase(); depth = 0; }
    }
    raw[i] = !!block && !literal;
    while (tokenIndex < tokens.length && tokens[tokenIndex].line <= i) {
      const t = tokens[tokenIndex++];
      if (block && t.name === block) depth += t.close ? -1 : 1;
    }
    if (block && (depth <= 0 || /^(img|br|hr)$/.test(block))) block = '';
  }
  const literal = t => inline[t.line];
  const readable = maskHtml(text, {tokens,
    hide: t => raw[t.line] && /^(pre|code)$/.test(t.name),
    strip: t => {
      if (!literal(t) && t.name === 'details') detailsAt[t.line].push(t.close);
      return !literal(t) && (raw[t.line] || /^(details|summary)$/.test(t.name));
    },
    comments: t => !literal(t),
  }).split('\n');
  readable.detailsAt = detailsAt;
  readable.raw = raw;
  readable.inline = inline;
  return readable;
}
// 출처 제목은 자신을 포함한 details 범위에서만 유효하다. 바깥 출처 상태는 스택으로 복원한다.
function sourceLines(lines, at, readable) {
  const result = new Array(lines.length).fill(false), stack = [];
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    if (at[i]) { result[i] = !!depth; continue; }
    for (const close of readable.detailsAt[i]) {
      if (close) depth = stack.length ? stack.pop() : depth;
      else stack.push(depth);
    }
    const h = readable[i].match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      if (depth && h[1].length <= depth) depth = 0;
      if (SOURCE_HEADING.test(visibleText(h[2], true))) depth = h[1].length;
    }
    result[i] = !!depth;
  }
  return result;
}
function measureReading(src) {
  const lines = src.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const {meta, start, unclosed} = parseFrontmatter(lines);
  const {at} = scanFences(lines, start), readable = readingLines(lines, at);
  const chunks = [], cells = [], excluded = {sourceLines: 0, codeLines: 0, evidenceLines: 0};
  const sources = sourceLines(lines, at, readable);
  let table = false;
  if (meta.summary) chunks.push(visibleText(meta.summary, true));
  for (let i = start; i < lines.length; i++) {
    const l = readable[i], fb = at[i];
    if (fb && (fb.open === i || fb.close === i)) { table = false; continue; }
    if (fb && !READABLE_BLOCK.test(fb.kind)) { excluded.codeLines++; continue; }
    if (sources[i]) { excluded.sourceLines++; table = false; continue; }
    if (SOURCES_LINE.test(l)) { excluded.evidenceLines++; table = false; continue; }
    if (fb && /^(flow|stats)$/.test(fb.kind)) {
      const fields = l.split(/(?<!\\)\|/), control = fb.kind === 'flow' ? 2 : 3;
      const known = fb.kind === 'flow' ? FLOW_ROLE : BLOCK_STATE;
      chunks.push(...fields.filter((f, col) => col !== control || !known.test(f.trim())).map(t => visibleText(t, true)));
      continue;
    }
    const ref = l.match(/^\s*\[([^\]]+)\]:\s*\S/);
    if (ref && !Object.hasOwn(STATUS_TAGS, ref[1])) continue;
    if (/^\s*\|/.test(l)) {
      if (isSep(l)) { table = true; continue; }
      const cs = splitCells(l), header = !table && isSep(readable[i + 1] || '');
      chunks.push(...cs);
      if (!header && table) cs.forEach((text, col) => cells.push({line: i + 1, col, text, chars: [...text].length, sentences: countSentences(text)}));
      continue;
    }
    table = false;
    if (/^\s*(?:[-*_]\s*){3,}$/.test(l)) continue;
    chunks.push(visibleText(l, true));
  }
  return {audience: meta.audience || 'missing', chars: chunks.reduce((n, t) => n + [...t].length, 0),
    charsNoSpace: chunks.reduce((n, t) => n + [...t.replace(/\s/g, '')].length, 0), cells, excluded, unclosedFrontmatter: unclosed};
}

function lint(src, opts = {}) {
  src = src.replace(/\r\n/g, '\n');
  if (src.startsWith(BOM)) src = src.slice(1);
  const rawLines = src.split('\n');
  let lines = rawLines;
  const F = [];
  const plain = !!opts.plain;
  // 외부 공유 문서면 어떤 경고 문구에도 민감한 값이 찍히지 않게, 경고를 넣는 이 한 곳에서 가린다(CI 로그로 새지 않게)
  let pats = [];
  const mask = msg => pats.reduce((s, [re]) => s.replace(new RegExp(re.source, re.flags.replace('g', '') + 'g'), '[가림]'), msg);
  // hint=true 는 "판단해서 반영" 제안 — 오탐 가능성이 있어 --strict 실패 사유에서 뺀다
  const warn = (line, rule, msg, hint) => F.push({ line: line + 1, rule, msg: mask(msg), hint: !!hint });

  const { meta, start, has, unclosed } = parseFrontmatter(lines);
  const sharing = /^external$/i.test((meta.audience || '').trim()) || !!opts.external;
  if (sharing) {
    // 긴 것부터 — "SECRET"이 먼저 가려지면 "SECRET-TOKEN"의 나머지가 남는다
    const extra = (meta.redact || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    pats = [
      // 브랜치는 슬래시 경로만(feature/x, release/1.2). dev-server, release-1.2 같은 일상 단어는 안 잡음
      [/\b(feature|fix|bugfix|hotfix|release|stg|dev)\/[\w.-]+/i, '브랜치명'],
      [/\b[\w-]+\.(internal|local|corp|lan|intra)\b/i, '내부 호스트'],
      [/(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^\s)]+/i, '개인 로컬 경로'],
      // IP: 각 옥텟 0~255, 앞에 v/version 이 붙은 버전 표기는 제외
      [/(?<![\w.]|v)\b((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)\b(?![\w.])/, 'IP 주소'],
      [/\b[A-Z]{1,3}\d{5,7}\b/, '사번 형태'],
      ...extra.map(w => [new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'redact 목록']),
    ];
    // 다른 검사는 가린 사본을 본다 — 경고 문구가 줄 일부를 잘라 인용해도 가리기 전 값이 남지 않는다. 규칙 1 검사만 원문을 본다
    lines = rawLines.map(mask);
  }
  if (unclosed) warn(0, '구조', 'frontmatter가 닫히지 않음 — 둘째 --- 줄 필요');
  else if (!has && !plain) warn(0, 'fm', 'frontmatter 없음 — title / date / audience 는 필수');
  else if (!plain || opts.renderer) {
    if (!meta.title) warn(0, 'fm', 'frontmatter title 없음');
    if (!meta.date) warn(0, 'fm', `frontmatter date 없음 — ${plain ? '문서 기준일(YYYY-MM-DD)' : '없으면 렌더 당일이 작업일로 찍힘'}`);
    if (!meta.audience) warn(0, 'fm', 'frontmatter audience 없음 (team | cross-team | leadership | external) — 없으면 외부 공유 검사가 꺼짐');
  }
  if (meta.audience && !/^(team|cross-team|leadership|external)$/i.test(meta.audience.trim())) warn(0, 'fm', `audience "${meta.audience}" — team | cross-team | leadership | external 중 하나`);
  if (meta.date && (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date) || Number.isNaN(Date.parse(meta.date)) || new Date(meta.date).toISOString().slice(0, 10) !== meta.date)) warn(0, 'fm', `date "${meta.date}" — 실제 있는 날짜 YYYY-MM-DD로`);
  if (meta.theme && !/^(light|dark|auto)$/i.test(meta.theme.trim())) warn(0, 'fm', `theme "${meta.theme}" — light | dark | auto 중 하나 (아니면 light로 렌더됨)`);

  const { at: fenceAt, blocks } = scanFences(lines, start);
  const inCode = i => !!fenceAt[i];
  for (const b of blocks) if (b.close < 0) warn(b.open, '구조', `코드펜스(${b.char.repeat(3)})가 닫히지 않음 — 이 뒤 내용이 전부 코드 패널로 들어감`);

  // 보이지 않는 문자(유니코드 서식 문자 Cf): 폭 없는 공백, 글 중간 BOM, 방향 제어, 태그 문자. AI 출력·복사로 섞여 화면엔 안 보이지만
  // 검색·복사·비교를 깨고, 방향 제어 문자는 보이는 글과 실제 글을 다르게 만든다. 코드·frontmatter 안도 본다. 이모지를 잇는 ZWJ는 제외.
  // 사례: linkedin-agent-skill li-human의 FINGERPRINT 검사(Cf 범주를 AI 흔적으로 셈) — 2026-10-19 원문 확인
  {
    const CF_NAME = c => ({ 0x200B: '폭 없는 공백', 0x200C: '폭 없는 비결합자', 0x200D: '폭 없는 결합자', 0x2060: '단어 결합자', 0xFEFF: 'BOM', 0x00AD: '소프트 하이픈' })[c]
      || (c >= 0x202A && c <= 0x202E || c >= 0x2066 && c <= 0x2069 ? '방향 제어' : c >= 0xE0000 && c <= 0xE007F ? '태그 문자' : 'U+' + c.toString(16).toUpperCase().padStart(4, '0'));
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      const found = [...l.matchAll(/\p{Cf}/gu)].filter(m => !(m[0] === '‍' && /\p{Extended_Pictographic}️?$/u.test(l.slice(0, m.index))));
      if (found.length) warn(i, '구조', `보이지 않는 문자 ${[...new Set(found.map(m => CF_NAME(m[0].codePointAt(0))))].join('·')} ${found.length}개 — 지우기 (화면엔 안 보여도 복사·검색·비교를 깨고, 방향 제어 문자는 보이는 글과 실제 글을 다르게 만듦)`);
    }
  }

  const readable = plain ? null : readingLines(lines, fenceAt);
  const checkCell = (i, raw, column = 0, literalHtml = false) => {
    const c = raw.trim(), text = visibleText(c, literalHtml), n = [...text].length, sentences = countSentences(text);
    if (/^`[^`]+`$/.test(c) && column > 0) warn(i, 7, `표 셀이 코드만 있음 "${c}" — 구절로 (예: "가장 오래 안 쓴 것부터 지운다")`);
    if (n > 60 || sentences >= 2) warn(i, 7, `표 칸 ${n}자/문장 ${sentences}개 — 칸은 구절로, 설명은 표 아래나 근거 줄로`);
  };
  // raw HTML도 허용하므로 td는 같은 기준으로 본다(th는 머리글). 코드·주석의 가짜 td는 제외.
  if (!plain) {
    const input = lines.map((l, i) => fenceAt[i] && (fenceAt[i].open === i || fenceAt[i].close === i || !/^(cards|browser)$/.test(fenceAt[i].kind)) ? '' : l).join('\n');
    const html = maskHtml(input, {tokens: htmlTokens(input, readable.inline), hide: t => /^(pre|code|thead)$/.test(t.name), strip: () => false})
      .split('\n').map((l, i) => readable.raw[i] ? l : '').join('\n').replace(/`[^`]*`/g, '');
    let open = null, cursor = 0, line = 0;
    for (const t of htmlTokens(html)) {
      line += (html.slice(cursor, t.start).match(/\n/g) || []).length;
      if (t.name === 'td') {
        if (!t.close && !open) open = {...t, line};
        else if (t.close && open) { checkCell(open.line, html.slice(open.end, t.start)); open = null; }
      }
      cursor = t.start;
    }
  }

  // ── 구조 검사(두 모드 공통): 표·링크·태그·details 짝 — 접힌 상세 안도 본다 ──
  {
    let tableHead = -1, tableStartLine = -1, depth = 0, lastOpen = -1, h1 = 0;
    // 첫 열도 검사: 2026-10-21 실측 첫 열 27110칸 중 135칸이 긴 설명·복수 문장.
    const cellCount = l => l.trim().replace(/\\\|/g, ' ').replace(/^\||\|$/g, '').split('|').length;
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      if (inCode(i)) { tableHead = -1; continue; }
      const plainText = l.replace(/`[^`]*`/g, '');
      for (const lm of l.matchAll(/\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g)) {
        if (!safeUrl(lm[1])) warn(i, '구조', `링크 주소 "${lm[1].slice(0, 40)}" — 허용 안 되는 스킴·문자, 렌더 시 죽은 링크(#)가 됨`);
      }
      for (const tm of htmlTokens(plainText)) {
        if (!tm.comment && !HTML_TAGS.test(tm.name)) { warn(i, '구조', `<${plainText.slice(tm.start, tm.end).match(/^<\/?([\w-]+)/)[1]}> 는 태그가 아니라 글자로 표시됨 — 의도한 태그면 Markdown이나 허용 태그(details·figure·img 등)로`, true); break; }
      }
      // 참조 정의 "[이름]: 주소" — 상태 태그로 시작하는 줄("[완료]: …")은 제외
      if (/^\s*\[\^|\]\[[^\]]*\]/.test(plainText) || (/^\s*\[([^\]]+)\]:\s*\S/.test(plainText) && !Object.hasOwn(STATUS_TAGS, plainText.match(/^\s*\[([^\]]+)\]/)[1]))) warn(i, '구조', '각주·참조형 링크는 지원 안 함 — 인라인 링크 [글](주소)로');
      const opens = (plainText.match(/<details(\s|>)/gi) || []).length, closes = (plainText.match(/<\/details\s*>/gi) || []).length;
      if (opens) lastOpen = i;
      depth += opens;
      for (let c = 0; c < closes; c++) { if (depth) depth--; else warn(i, 9, '열리지 않은 </details> — 짝을 맞추기'); }
      if (plain && opts.renderer && /^#\s/.test(l) && ++h1 === 2) warn(i, '구조', 'H1(#)이 두 번 — 두 번째부터 섹션(##)으로 표시됨');
      if (/^\s*\|/.test(l)) {
        if (tableHead < 0) {
          tableStartLine = i;
          if (!isSep(lines[i + 1] || '')) { warn(i, '구조', '표 헤더 뒤에 | --- | 구분 행 필요 — 없으면 표가 아니라 글로 렌더됨'); tableHead = 0; continue; }
          tableHead = cellCount(l); continue;
        }
        if (tableHead) {
          const n = cellCount(l);
          const where = i === tableStartLine + 1 ? '표 구분 행' : '표';
          if (n !== tableHead) warn(i, '구조', `${where} 칸 ${n}개, 헤더 ${tableHead}개 — 칸 수 맞추기 (셀 안 파이프는 \\| 로)`);
        }
        continue;
      }
      tableHead = -1;
      // --plain 만: 이 스킬의 문서는 번호 목록 안 문단을 4칸 들여 쓰는 게 보통이라 기본 모드에서는 잡음뿐
      if (plain && /^ {4,}\S/.test(l) && !/^\s*([-*]|\d+\.)\s/.test(l)) warn(i, '구조', '4칸 들여쓴 줄 — 코드 블록이 아니라 글로 렌더됨. 코드면 펜스(```)로', true);
    }
    if (depth) warn(lastOpen, 9, `닫히지 않은 <details> ${depth}개 — 이 뒤 내용이 통째로 접힘`);
  }

  if (!plain) {
    let table = false;
    for (let i = start; i < lines.length; i++) {
      const fb = fenceAt[i], l = readable[i];
      if (fb && (fb.open === i || fb.close === i || !/^(cards|browser)$/.test(fb.kind))) { table = false; continue; }
      if (!/^\s*\|/.test(l)) { table = false; continue; }
      if (isSep(l)) { table = true; continue; }
      if (!table) continue;
      l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/)
        .forEach((raw, ci) => checkCell(i, raw, ci, true));
    }
  }

  // ── 블록 검사(flow·stats·cards): 렌더러가 칸을 합치거나 이름을 무시하는 입력을 미리 알린다 ──
  // 역할·상태 목록은 render.js의 FLOW_ROLES·STAT_STATE와 같아야 한다
  {
    const ROLE = FLOW_ROLE, STATE = BLOCK_STATE;
    const split = l => l.trim().replace(/\\\|/g, ' ').split('|').map(c => c.trim());   // 칸 수만 세므로 \| 는 공백으로
    // 한 그림에 역할 색(누가 하나)과 상태 색(어떻게 됐나)을 섞지 않는다 — 분홍(외부)과 연빨강(실패)이 나란히 서면 구분이 안 된다.
    // 사례: 2026-10-21 시나리오 6건 중 2건이 flow에 ext·logic과 fail·done을 섞음. Mermaid는 class A x / A:::x 로 붙인 이름을 본다
    const ROLES = /^(ext|entry|logic|data)$/, STATUSES = /^(done|fail|caution|info|neutral)$/;
    for (const fb of blocks) {
      if (fb.kind !== 'flow' && fb.kind !== 'mermaid') continue;
      const used = fb.kind === 'flow'
        ? fb.body.map(([, l]) => (split(l)[2] || '').toLowerCase())
        : fb.body.flatMap(([, l]) => [...(l.match(/^\s*class\s+\S+\s+([\w-]+)/) || []).slice(1), ...[...l.matchAll(/:::([\w-]+)/g)].map(m => m[1])]);
      if (used.some(t => ROLES.test(t)) && used.some(t => STATUSES.test(t))) warn(fb.open, 15, `${fb.kind}에 역할 색(ext·entry·logic·data)과 상태 색(done·fail·caution·info·neutral)이 섞임 — 한 그림에는 한 종류만`);
    }
    for (const fb of blocks) {
      if (!/^(flow|stats|cards)$/.test(fb.kind)) continue;
      const filled = fb.body.filter(([, l]) => l.trim());
      if (!filled.length) { warn(fb.open, '구조', `빈 \`\`\`${fb.kind} 블록 — 내용이 없으면 지우기`); continue; }
      if (fb.kind === 'cards') continue;
      const flow = fb.kind === 'flow', fixed = flow ? 3 : 4, ok = flow ? ROLE : STATE;
      const name = flow ? '역할' : '상태';
      const allowed = flow ? 'ext·entry·logic·data (또는 done·fail·caution·info·neutral)' : '완료·실패·주의·미검증·정보·중립 (또는 영문)';
      for (const [ln, l] of filled) {
        const f = split(l);
        if (f.length > fixed) warn(ln, '구조', `${fb.kind} 칸 ${f.length}개 — 최대 ${fixed}개. 남는 칸은 설명 뒤에 " | "로 붙어 표시됨 (글자 | 를 쓰려면 \\|)`);
        const t = f[fixed - 1];
        if (t && !ok.test(t)) warn(ln, '구조', `${name} "${t}" — ${allowed} 중 하나. 모르는 이름은 설명 뒤에 글자로 붙어 표시됨`);
      }
    }
  }

  // ── 규칙 1: 외부 공유 문서의 내부 식별자 — frontmatter·코드·접힌 상세까지, 값은 출력하지 않음 ──
  if (sharing) {
    if (meta.branch) warn(0, 1, '외부 공유 문서에 frontmatter branch — 지우기 (메타 pill에 그대로 찍힘)');
    rawLines.forEach((l, i) => {
      if (/^(redact|branch):/.test(l) && i < start) return;
      for (const [re, what] of pats) if (re.test(l)) warn(i, 1, `외부 공유 문서에 ${what} — 제거하거나 일반화 (찾은 문자열은 출력하지 않음)`);
    });
  }

  if (plain) {
    // --plain: 문체 규칙은 끄고, 독자 검토용 file:line만 요청 시
    if (opts.readerReview) for (let i = start; i < lines.length; i++) {
      if (!inCode(i) && !SOURCES_RE.test(lines[i]) && FILE_LINE.test(lines[i])) warn(i, 6, '본문에 코드 위치 — 독자의 판단에 필요한지 검토, 아니면 "근거:" 줄로');
    }
    return F.sort((a, b) => a.line - b.line);
  }

  // ─────────────── 아래는 이 스킬의 문체 규칙(기본 모드만) ───────────────

  // 2026-10-21 corpus.txt: 677경로/내용 고유198종. 고유 중앙4251·P75 6377·P90 10041자.
  // 대부분 AI 초안이라 좋은 글의 분포가 아니다. 6000자는 P75 부근의 검토 힌트, 품질 판정 아님.
  // 계기가 된 보고서(8451자)를 잡는다. leadership 1종·external 0종이라 독자별 차등 근거 부족.
  const reading = measureReading(src);
  if (reading.chars > 6000) warn(start, 8, `전체 읽을 글 ${reading.chars}자 — 6000자 초과, 중복을 줄이거나 별도 문서로 나누기 (표·접힌 글 포함)`, true);

  // 짧은 대괄호 휴리스틱: 한글 시작 또는 README처럼 영문 이름+한글 설명. 뜻은 자동 교정하지 않는다.
  const checkTags = (line, text) => {
    const prose = replaceLinks(text.replace(/`[^`]*`/g, ''), () => '').replace(/!?\[[^\[\]]*\]\[[^\[\]]*\]/g, '')
      .replace(/(?:https?:\/\/|mailto:)[^\s<>]+/gi, '');
    if (/^\s*\[\^?[^\]]+\]:/.test(prose) && !Object.hasOwn(STATUS_TAGS, (prose.match(/^\s*\[([^\]]+)\]/) || [])[1])) return;
    for (const m of prose.matchAll(/(?<!\\)\[([^\]\n]{1,30})\]/g)) {
      const tag = m[1];
      if (Object.hasOwn(STATUS_TAGS, tag) || !/^(?:[가-힣]|[A-Za-z][\w.-]*\s+[가-힣])/.test(tag)) continue;
      const base = Object.keys(STATUS_TAGS).find(t => tag.startsWith(t));
      if (base) warn(line, 4, `태그 변형 — [${base}] 뱃지 하나만 쓰고 설명은 뱃지 밖에`);
      else if (!labels.has(tag)) labels.set(tag, line);
    }
  };
  // 상태 태그로 시작하지 않는 라벨([판단]·[게임제안]·[README 주장])은 문서마다 쓰는 자체 분류라 힌트 한 번.
  // 사례: 2026-10-21 이 PC 보고서 고유 198종에서 상태 접두 변형 2곳, 자체 라벨 691곳 — 줄마다 경고하면 묻힌다
  const labels = new Map();
  const tagLines = readable;
  for (let i = start; i < lines.length; i++) checkTags(i, tagLines[i]);
  if (meta.summary) checkTags(Math.max(0, lines.findIndex(l => /^summary:/.test(l))), meta.summary);
  if (labels.size) warn([...labels.values()][0], 4, `배지 목록 밖 대괄호 라벨 ${labels.size}종(${[...labels.keys()].slice(0, 4).map(t => `[${t}]`).join('·')}) — 배지로 그려지지 않고 글자 그대로 나옴. 상태면 ${Object.keys(STATUS_TAGS).map(t => `[${t}]`).join('')} 중 하나로, 출처 종류면 근거 줄에 글로`, true);

  // 규칙 2·14 공용: 여러 줄 인용도 가리되 줄 번호는 보존한다.
  // 곧은따옴표는 줄바꿈 하나까지(문단을 줄마다 끊어 쓰면 인용이 두 줄에 걸친다), 홑따옴표는 아포스트로피와 겹쳐 한 줄 안에서만.
  const unquoted = lines.join('\n').replace(/“[^”]{0,800}”|「[^」]{0,800}」|『[^』]{0,800}』/g,
    m => '""' + '\n'.repeat((m.match(/\n/g) || []).length)).split('\n');
  // 곧은따옴표가 두 줄에 걸친 인용: 두 줄 모두 따옴표 수가 홀수일 때만 이어 본다(짝이 맞는 줄끼리 묶으면 뒤 짝이 어긋난다)
  const oddQuotes = l => (l.replace(/`[^`]*`/g, '').match(/"/g) || []).length % 2 === 1;
  for (let i = 0; i + 1 < unquoted.length; i++) {
    if (!oddQuotes(unquoted[i]) || !oddQuotes(unquoted[i + 1])) continue;
    unquoted[i] = unquoted[i].slice(0, unquoted[i].lastIndexOf('"')) + '""';
    unquoted[i + 1] = unquoted[i + 1].slice(unquoted[i + 1].indexOf('"') + 1);
    i++;
  }
  const proseLines = unquoted.map(l => l.replace(/`[^`]*`/g, '')
    .replace(/\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, ']()')
    .replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|'[^'\n]*'/g, '""'));

  // 규칙 2: 예고 대신 발견을 앞에 쓴다. 문장 머리를 고정해 긴 줄의 되짚기를 막는다.
  {
    const previews = [
      [/^(?:이|본) (?:섹션|절|장|문서|보고서|글)에서는\s+.*(?:다룹니다|살펴봅니다|살펴보겠습니다|정리합니다|설명합니다|알아봅니다|소개합니다|다루겠습니다)(?=\s|$)/, '자기 문서 예고 — 다룰 주제 대신 발견 자체로 시작하기', false],
      [/^(?:아래|다음|위의?) (?:표|그림|목록|도표|다이어그램|흐름도)(?:는|은|에서는|에서)\s+.*(?:비교합니다|정리합니다|보여 줍니다|보여줍니다|나타냅니다)(?=\s|$)/, '표·그림 예고 — 표 제목 역할인지 검토하고 발견을 먼저 쓰기', true],
      [/^(?:처음에는\s+.*(?:썼|적었|작성했)|초안에서는?\s+.*(?:고쳤|바꿨|수정했))/, '수정 과정 — 고친 과정 대신 최종 발견을 쓰기', true],
    ];
    // shortcut: 조사·서술격만 떼는 낱말 비교. 동사 활용·동의어까지 필요하면 형태소 분석을 검토한다.
    const words = text => [...new Set(text.match(/[가-힣A-Za-z]+/g) || [])]
      .map(w => w.replace(/(?:입니다|이다|에서는|에서|으로|에게|까지|부터|은|는|이|가|을|를|의|에|와|과|도|만|로)$/, '').toLowerCase())
      .filter(w => w.length >= 2);
    let title = null;
    for (let i = start; i < lines.length; i++) {
      const fb = fenceAt[i];
      if (fb && (i === fb.open || i === fb.close || !/^(flow|stats|cards)$/.test(fb.kind))) continue;
      if (SOURCES_RE.test(unquoted[i])) continue;
      const text = proseLines[i].trim();
      const h = text.match(/^(#{1,6})\s+(.*)$/);
      if (h) { title = h[1] === '##' ? new Set(words(h[2])) : null; continue; }
      if (!text || /^\||^<|^[-*_]{3,}$/.test(text) || !/[가-힣A-Za-z]/.test(text)) continue;
      const sentences = text.replace(/^(?:>\s*|(?:[-*]|\d+\.)\s+)?/, '').split(/[.!?。]/);
      for (const sentence of sentences) {
        for (const [re, why, hint] of previews) if (re.test(sentence.trim())) warn(i, 2, why, hint);
      }
      if (title) {
        const first = sentences[0], tokens = words(first);
        // 수치 또는 인용·코드에 새 정보가 있을 수 있으므로 제목 반복으로 판정하지 않는다.
        if (tokens.length && !/\d|""/.test(first) && !lines[i].includes('`') &&
            tokens.every(w => title.has(w))) warn(i, 2, '제목 반복 — 첫 문장에 제목에 없는 발견을 쓰기', true);
        title = null;
      }
    }
  }

  // 요약 박스
  let summary = meta.summary || '', summaryLine = 0;
  if (!summary) {
    for (let i = start; i < lines.length; i++) {
      if (inCode(i)) continue;
      if (/^##\s/.test(lines[i])) break;
      if (/^>/.test(lines[i])) {
        summaryLine = i; const buf = [];
        while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        summary = buf.join(' '); break;
      }
    }
  }
  if (summary) {
    const n = countSentences(summary.replace(/\n/g, ' '));
    if (n > 3) warn(summaryLine, 2, `요약 박스 문장 ${n}개 — 3개 이하로 (무엇을/어떻게/결정할 것)`);
  } else warn(start, 2, '요약 박스 없음 — frontmatter summary: 또는 H1 아래 첫 인용문(>)');
  // 요약이 두 번: frontmatter summary가 요약 상자가 되는데 H1 아래 인용문에 같은 글을 또 쓰면 상자 바로 밑에 인용으로 한 번 더 찍힌다.
  // 사례: 2026-10-21 시나리오 6건 중 2건. 다른 내용의 인용(요청 원문 등)은 그대로 둔다
  if (meta.summary) for (let i = start; i < lines.length; i++) {
    if (inCode(i)) continue;
    if (/^##\s/.test(lines[i])) break;
    if (!/^>/.test(lines[i])) continue;
    const squash = t => t.replace(/[\s>.,·]/g, '');
    let j = i; const q = [];
    while (j < lines.length && /^>/.test(lines[j])) q.push(lines[j++]);
    const head = squash(meta.summary).slice(0, 20);
    if (head && squash(q.join('')).includes(head)) warn(i, 2, '요약이 두 번 — frontmatter summary가 이미 요약 상자. H1 아래 같은 내용의 인용문(>)은 지우기');
    break;
  }

  // 정합성(힌트, 규칙 2): 요약과 본문, 예고와 목록이 서로 맞는지. 문장 품질 검사가 못 보는 내용 모순을 일부 잡는다.
  // 근거: hanlint의 countMismatch·promiseRecall 방식. 정확 일치만 보고 반올림은 사람이 판단
  {
    // 인용 요약이면 그 인용 줄들은 본문에서 뺀다(요약이 자기 근거가 되지 않게). summaryLine 0은 "첫 줄 인용"일 수도 있어 따로 판정
    const quoteSummary = !meta.summary && !!summary;
    const quoteEnd = quoteSummary ? (() => { let j = summaryLine; while (j < lines.length && /^>/.test(lines[j])) j++; return j; })() : -1;
    const summaryAt = meta.summary ? Math.max(0, lines.slice(0, start).findIndex(l => /^summary:/.test(l))) : summaryLine;
    // 소수 끝의 0은 같은 수(4.10 = 4.1, 2.0 = 2) — 실측(2026-10-19): 요약 "약 4.1점"·본문 "(4.10)"을 다른 수로 봤다
    const norm = t => t.replace(/(\d),(?=\d{3})/g, '$1').replace(/(\d)\s+(?=[%A-Za-z가-힣])/g, '$1')
      .replace(/(\d)\.(\d*?)0+(?!\d)/g, (_, a, b) => b ? a + '.' + b : a);
    const body = norm(lines.filter((_, i) => i >= start && !(quoteSummary && i >= summaryLine && i < quoteEnd)).join('\n'));
    // 숫자 경계까지 맞아야 같은 수 — "12%"가 "112%"·"0.12%" 안에 들어 있다고 근거로 치지 않는다
    const inBody = t => new RegExp('(?<![\\d.,])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (/\d$/.test(t) ? '(?![\\d.])' : '')).test(body);
    const NUM = /\d[\d,]*(?:\.\d+)?\s?(?:%|ms|초|분|시간|일|건|개|배|명|회|원|만|억|[KMGT]B|px)?/g;
    // 20 이하의 개수("후보 5개", "14건")는 보지 않는다 — 대개 본문의 표·목록을 세거나 소제목의 수를 더한 값이라
    // 본문에 같은 글자가 없는 게 정상이다(실측 2026-10-19: 주간 보고서 "5개" = 소제목 "(3개)"+"(2개)", "0개" = 없음)
    const smallCount = t => { const m = t.match(/^(\d{1,2})\s?(?:개|건|명|회)$/); return !!m && +m[1] <= 20; };
    const missing = (norm(summary.replace(/\d{4}[-.]\d{1,2}[-.]\d{1,2}/g, '')).match(NUM) || [])
      .map(t => t.trim()).filter(t => /\D$|\.\d|\d{2}/.test(t) && !smallCount(t) && !inBody(t));
    if (missing.length) warn(summaryAt, 2, `요약 수치 ${[...new Set(missing)].map(t => `"${t}"`).join('·')}가 본문에 없음 — 근거 위치를 본문에 두기 (반올림했거나 단위만 바꿔 쓴 값이면 무시)`, true);
    // 추천안이 요약에 없음: 상자만 읽는 독자(리더)는 무엇을 고르라는지 모른다.
    // 사례: 2026-10-21 시나리오(본부장 보고) 요약이 "정해 주셔야 합니다"로 끝나고, B 추천은 둘째 절에서야 나왔다.
    // cards의 [추천]은 보지 않는다 — 요약이 "추천" 없이 고른 안을 이미 쓴 보고서 6건(이 PC 18건 중)이 걸렸다
    if (summary && !/추천/.test(summary) && lines.some((l, i) => i >= start && !inCode(i) && /\[추천\]|추천합니다/.test(l)))
      warn(summaryAt, 2, '본문에 추천안이 있는데 요약 상자에 없음 — 요약에 "B안을 추천합니다"처럼 고른 안을 쓰기', true);

    // 개수 약속: "세 가지입니다" 다음에 바로 오는 목록·flow·cards·표의 항목 수와 비교
    const KO_NUM = { 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
    // 약속 = 문장 끝에서 개수를 예고하는 줄만("원인은 세 가지입니다.", "4단계로 처리됩니다:"). 줄 중간의 "8개 서비스 중"은 약속이 아님
    // 줄 끝 40자만 본다 — 긴 줄 전체에 $ 고정 정규식을 돌리면 되짚기가 길이의 제곱으로 는다
    const PROMISE = /(\d+|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s?(가지|개|단계|곳)(?:입니다|이다|다|예요|이에요|로 (?:나뉩니다|처리됩니다|진행됩니다|정리합니다|나눕니다)|가 있습니다|가 있다)?\s*[.:：]?\s*$/;
    // "다음 세 가지를 확인했습니다:"처럼 콜론으로 목록을 여는 예고
    const COLON_PROMISE = /(?:^|\s)(\d+|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s?(가지|개|단계|곳)[^.!?]{0,30}[:：]\s*$/;
    const itemsAfter = i => {
      let j = i + 1;
      if (j < lines.length && !lines[j].trim()) j++;
      if (j >= lines.length) return null;
      const fb = fenceAt[j];
      if (fb && fb.open === j) {
        const filled = fb.body.filter(([, l]) => l.trim());
        if (fb.kind === 'flow') return filled.length;
        if (fb.kind === 'cards') return fb.body.reduce((n, [, l], k, a) => n + (l.trim() && (k === 0 || !a[k - 1][1].trim()) ? 1 : 0), 0);
        return null;
      }
      const li = lines[j].match(/^(\s*)([-*]|\d+\.)\s/);
      if (li) {
        // 같은 들여쓰기 항목 수. 항목 사이 빈 줄 하나는 같은 목록으로 본다(느슨한 목록)
        const item = l => (l.match(/^(\s*)([-*]|\d+\.)\s/) || [])[1] === li[1];
        let n = 0;
        for (; j < lines.length; j++) {
          if (!lines[j].trim()) { if (j + 1 < lines.length && item(lines[j + 1])) continue; break; }
          if (item(lines[j])) n++;
        }
        return n;
      }
      if (/^\s*\|/.test(lines[j])) { let n = 0; for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) n++; return n - 2; }
      return null;
    };
    const later = [];
    for (let i = start; i < lines.length; i++) {
      if (fenceAt[i] || SOURCES_RE.test(lines[i])) continue;
      const text = proseLines[i];
      if (/(뒤에서|아래에서|다음 (?:절|장|섹션)에서|나중에)[^.!?]{0,30}(다루겠습니다|설명하겠습니다|살펴보겠습니다|다루겠다|설명하겠다)(?![가-힣])/.test(text)) later.push(i);
      const tail = text.slice(-40);
      const promised = tail.match(PROMISE) || tail.match(COLON_PROMISE);
      if (!promised || /^\s*(#|\||[-*]\s|\d+\.\s|>)/.test(text)) continue;
      const want = KO_NUM[promised[1]] || Number(promised[1]), got = itemsAfter(i);
      if (want < 2 || want > 10) continue;
      if (got !== null && got > 0 && got !== want) warn(i, 2, `개수 약속 "${promised[0]}" — 바로 아래 항목은 ${got}개`, true);
    }
    if (later.length) warn(later[0], 2, `미룬 약속 ${later.length}곳("뒤에서 다루겠습니다" 등) — 실제로 다뤘는지 확인하고, 다뤘다면 그 절 이름을 적기`, true);
  }

  // 본문 스캔 (코드·표·접힌 상세는 건너뜀 — 표·details 구조는 위 공통 검사가 본다)
  let htmlDepth = 0, h1Count = 0;
  const sources = sourceLines(lines, fenceAt, readable);
  let h2Count = 0, secLines = 0, secStart = -1, secName = '', h3BeforeH2 = false;
  const flushSec = () => { if (secStart >= 0 && secLines > 12) warn(secStart, 8, `"${secName}" 본문 ${secLines}줄 — 12줄 넘으면 <details>로 접기`); };

  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (inCode(i)) continue;
    for (const close of readable.detailsAt[i]) htmlDepth = Math.max(0, htmlDepth + (close ? -1 : 1));
    if (htmlDepth || readable.detailsAt[i].some(Boolean)) continue;

    if (/^\s*\|/.test(l)) continue;
    if (!l.trim()) continue;

    if (/^#\s/.test(l) && ++h1Count === 2) warn(i, 8, 'H1(#)이 두 번 — 문서 제목은 하나, 나머지는 ##로 (렌더러가 섹션으로 강등함)');
    if (/^##\s/.test(l)) { flushSec(); h2Count++; secStart = i; secName = l.replace(/^##\s+/, ''); secLines = 0; continue; }
    if (/^###\s/.test(l) && h2Count === 0 && !h3BeforeH2) { h3BeforeH2 = true; warn(i, 8, 'H2 없이 H3가 먼저 나옴 — 섹션(##)부터'); }
    if (/^#{1,6}\s/.test(l)) continue;
    if (SOURCES_RE.test(l)) continue;
    if (/^>/.test(l) && i === summaryLine) continue;

    const text = l.replace(/^>\s?/, '').replace(/`[^`]*`/g, '');
    if (secStart >= 0) secLines++;

    // 규칙 6
    if (FILE_LINE.test(l)) warn(i, 6, `본문에 file:line — 섹션 끝 "근거:" 줄로 옮기기`);

    // 규칙 4: 불릿 단편
    const li = l.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (li && !sources[i] && !/(?:https?:\/\/|mailto:)/i.test(l)) {
      const raw = li[2].trim();
      const item = replaceLinks(raw.replace(/`[^`]*`/g, '').replace(/\*\*/g, ''), () => 'x').replace(STATUS_RE, '').trim();
      if (/^`[^`]+`$/.test(raw)) warn(i, 4, `불릿이 코드만 있음 "${raw}" — 무엇을 하는지 문장으로`);
      else if (item.length > 3 && !ENDERS.test(item)) warn(i, 4, `불릿이 서술어 없이 끝남 — 온전한 문장으로: "${item.slice(0, 40)}"`);
    }

    // 규칙 11: 한 줄 여러 문장 (표·불릿 제외)
    if (!li) {
      const n = countSentences(text);
      if (n >= 2) warn(i, 11, `한 줄에 문장 ${n}개 — 문장마다 줄바꿈`);
    }
  }
  flushSec();
  if (h2Count > 7) warn(0, 8, `H2 ${h2Count}개 — 7개 이하로, 나머지는 <details>나 부록으로`);

  // 규칙 13: 배경 섹션은 요청 분석 — "- **요청** — …", "- **현상** — …" 라벨 필수, 비유·서사 표현 경고
  {
    let inBg = false, bgLine = -1, hasReq = false, hasObs = false;
    const label = name => new RegExp('^\\s*(?:[-*]\\s+|\\d+\\.\\s+|\\|\\s*)?(?:\\*\\*)?(?:' + name + ')(?:\\*\\*)?\\s*[—:：|-]', 'i');
    const REQ = label('요청|request'), OBS = label('현상|문제|problem|symptom');
    const STORY = /비유하자면|비유하면|마치 [^.]{1,30} 같|그래서 이번에/;
    const finish = () => {
      if (!hasReq || !hasObs) warn(bgLine, 13, `배경에 ${[!hasReq && '요청', !hasObs && '현상'].filter(Boolean).join('·')} 라벨 없음 — "- **요청** — 누가 무엇을 요청했나" 식으로 요청을 분석해서 쓰기`);
    };
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      if (inCode(i)) continue;
      if (/^##\s/.test(l)) {
        if (inBg) finish();
        inBg = /^##\s+(배경|background)/i.test(l); bgLine = i; hasReq = hasObs = false;
        continue;
      }
      if (!inBg) continue;
      if (REQ.test(l)) hasReq = true;
      if (OBS.test(l)) hasObs = true;
      const s = l.match(STORY);
      if (s) warn(i, 13, `배경에 이야기체 표현 "${s[0]}" — 시간순 서사·비유 대신 요청·현상·원인으로`);
    }
    if (inBg) finish();
  }

  // 규칙 13: 배경 섹션이 있고 첫 H2여야 한다
  {
    let firstH2 = -1, firstH2Text = '', hasBg = false;
    for (let i = start; i < lines.length; i++) {
      if (inCode(i) || !/^##\s/.test(lines[i])) continue;
      const t = lines[i].replace(/^##\s+/, '');
      if (firstH2 < 0) { firstH2 = i; firstH2Text = t; }
      if (/^(배경|background)/i.test(t)) hasBg = true;
    }
    if (firstH2 >= 0 && !hasBg) warn(firstH2, 13, '"## 배경" 섹션 없음 — 첫 섹션은 요청 분석(요청·현상·원인…)');
    else if (hasBg && !/^(배경|background)/i.test(firstH2Text)) warn(firstH2, 13, `첫 섹션이 "${firstH2Text}" — "## 배경"을 맨 앞으로`);
  }

  // 규칙 14: 자연스러운 한국어 — 은유 소제목 / 번역투 동사·구어체 / 번역투(영어 구조) / 업무 관용투 / 용어 섞임.
  // 번역투·업무 관용투 기준은 한국어 API 문서 249건 조사(2026-10-01, 국내 원문 221 · 해외 번역판 28 — references/ko-terms.md).
  // 경고는 오탐이 적은 것만. 흔해서 오탐이 많은 것(해당·에 대한·를 통해·로 인해)은 한 문서에 4번 이상일 때만 힌트.
  // 따옴표 안("…", '…')은 남의 말(티켓 제목·오류 메시지·고치기 전 예문)이라 건너뛴다. flow·stats·cards 블록은 글이라 검사한다
  {
    const HEAD = new RegExp([
      /지나가는 길/, // 사례: examples.md의 실제 보고서 예문
      /의 여정/, // 추정
      /이렇게 돌아간다/, // 추정
      /어떻게 돌아가/, // 추정
      /의 모든 것/, // 추정
      /한눈에 보는/, // 추정
      /속살/, // 추정
      /(?<!인체 )해부(?!학)/, // 추정: 해부학·인체 해부(실제 해부)만 제외 — 허용 목록이면 "요청 흐름 해부"를 놓친다
      /(?<![가-힣A-Za-z·])(?!(?:도로|지형|지리|노선|관광|전자|위치) )[가-힣A-Za-z·]+ 지도$/, // 추정: 실제 지도만 제외
    ].map(re => re.source).join('|'));
    const BODY = [
      [/(요청|데이터|메시지)[은는이가] [^.]{0,12}(지나갑|지나가|흘러갑|흘러가)/, '의인화 — "처리됩니다"'], // 사례: 패킷의 실제 전송은 제외
      [/(데이터|응답|쿼리|문자열)(을|를)\s+(다시\s+)?조립(합니다|해|하고|한)/, '번역투 — "구성합니다"'], // 사례: 소프트웨어 대상만
      [/창구를 열/, '은유 — "제공합니다"'], // 추정
      [/뽑아(냅|내|낸)/, '구어체 — "추출합니다"'], // 사례
      [/(^|\s)(딱\s|엄청\s|진짜\s+(?=[가-힣]+(니다|해요|돼요)(?=[.!?,\s]|$)|(잘|못|너무|매우|다시|빨리|천천히|자주|더|덜)(?=\s)))/, '구어체 강조어 — 빼기'], // 사례(딱·진짜), 추정(엄청·용언/부사 판별)
      [/(나누면|정리하면|요약하면|살펴보면) (이렇습니다|다음과 같습니다)\.?\s*$/, '예고 문장 — 빼고 바로 표·목록'], // 사례
      [/(?<![가-힣])[가-힣]+\((설정값|코드|데이터)\)/, '비유를 괄호로 풀이 — 대상을 바로 이름으로'], // 사례: 괄호 안 정확히 한 단어만
      // 번역투 — 번역판에 몇 배 많은 것(괄호: 그 표현이 나온 문서 비율, 국내 원문 / 번역판)
      [/(?<=[가-힣A-Za-z0-9)])에 의해(?=[^.!?\n]{0,40}(됩|되었|됐|된|되는|됨|받|졌|집니다))/,'번역투(3% / 29%) — 행위자를 주어로: "서버에 의해 발급됩니다" → "서버가 발급합니다"'], // 실측: ko-terms.md의 피동 표현군, 논리 근거만인 문장은 제외
      [/되어(지|진|집|져)/, '이중 피동 — "되어집니다" → "됩니다"'], // 추정
      [/하기 위해서는/, '번역투 — "~하려면"'], // 추정: ko-terms.md에 비율 없음
      [/선택적 (파라미터|매개 ?변수|필드|항목|인자|값|헤더|요소)/, '번역투(optional) — "선택 파라미터", 표에서는 "선택"'], // 실측
      [/(을|를) ((가지고|갖고)(?=\s+있)|가지(는|며|게)|가집니다|가진(?![가-힣A-Za-z0-9])|갖(는|습니다|은|게))/, '번역투(have) — "권한을 가진 사용자" → "권한이 있는 사용자"'], // 실측: 소유·속성 표현군, 수단의 가지고/갖고·가진기 제외
      [/을\(를\)|를\(을\)|이\(가\)|가\(이\)|은\(는\)|는\(은\)|와\(과\)|과\(와\)|\(으\)로/, '기계 번역 자동 조사 — 받침에 맞는 조사 하나로'], // 사례: 번역판에서 관찰, 건수 없음
      // 업무 관용투 — 국내 원문에 오히려 많은 한국 업무 문서 습관
      [/하시기 바랍니다|주시기 바랍니다|부탁드립니다/, '업무 관용투(20% / 4%) — "~해 주세요"'], // 실측: 표현군 비율
      [/하는 것이 가능/, '업무 관용투 — "~할 수 있습니다"'], // 실측
      [/하도록 하겠습니다/, '업무 관용투 — "~하겠습니다"'], // 실측
      [/(?<![가-힣A-Za-z])(?!(?:회의|행사|수업|교육|인터뷰|세미나|면접|순회|연산|명령|계산|역할|임무)(?:을|를) )[가-힣A-Za-z]+(을|를) (진행|수행)(합니다|하고|하여|해서|해야|했습니다|하면|한 뒤|한 후|하는|하기|할)/, '업무 관용투 — 명사를 동사로: "검증을 진행합니다" → "검증합니다"'], // 실측(진행), 추정(제외 목록): 행사를 진행·연산을 수행처럼 동사로 못 바꾸는 것만 제외
      // 표기 — 외래어 표기법
      [/파라메터/, '표기 — "파라미터"'], // 추정: 표기 기준, 권장형 66건은 오표기 빈도가 아님
      [/어플리케이션/, '표기 — "애플리케이션"'], // 추정: 표기 기준, 권장형 22건은 오표기 빈도가 아님
    ];
    // 힌트 — 맞는 문장도 걸릴 수 있어 판단에 맡긴다
    const SOFT = [
      [/(API|메서드|함수|엔드포인트|요청|응답|이 문서|이 기능|서비스|시스템)[는은] [^.]{0,30}(허용|요구)합니다/, '사물 주어(20% / 71%) — 사람·조건으로: "이 API는 인증을 요구합니다" → "이 API를 호출하려면 인증해야 합니다"'], // 실측: 표현군 빈도, 동작의 부적절성 판정은 아님
      [/(^|[^A-Za-z])[A-Za-z]{3,} (하시면|하면|하여|하고|해서|해야|합니다|했습니다|되면|되어|됩니다)/, '영어 낱말 + 하다 — 한국어 동사로: "Open 하시면" → "열면"'], // 추정
    ];
    // 표현군 빈도는 실측, 4회 임계값과 경계 판별은 추정.
    const COUNTED = [
      [/(?<![가-힣A-Za-z0-9])해당 (?!없음|사항 없음)/g, '해당', '"이 ~"나 실제 이름으로'], // 실측
      [/에 대한(?![가-힣A-Za-z])|에 대해/g, '에 대한', '조사로 바로: "A에 대한 설명" → "A 설명", "A에 대해 안내" → "A를 안내"'], // 실측
      [/(을|를) 통해/g, '를 통해', '수단은 "~로", 장소는 "~에서"'], // 실측: 조사는 "를 통해 ~할 수 있습니다" 표현군
      [/로 인해/g, '로 인해', '"~ 때문에", "~해서"'], // 실측
      // im-not-ai 분류(A-3·A-4·A-5·A-12·I-4·H-3·H-4)에서 가져온 것 — 에세이·칼럼 기준이고 기술 보고서에서는 정상 용법도 흔해 4회부터.
      // 추정: 임계값. 사례: 2026-10-19 이 PC 보고서 18건에 돌려 오탐 확인
      [/에 있어(?:서)?(?=[\s,])(?!\s*(?:문제|오류|지울|삭제|못|안 ))/g, '에 있어서', '"~에서", "~할 때": "운영에 있어서 중요한" → "운영에서 중요한"'], // 추정: "서버에 있어서 지울 수 없다"(위치+이유)는 제외
      [/[라다]는 점에서/g, '라는 점에서', '"~라서", "~이므로"로 이유를 바로'], // 추정
      [/(?:와|과) 관련(?:하여|해서|된)/g, '와 관련하여', '"~ 관련", "~의", 또는 동사로 바로'], // 추정
      [/이루어(?:집니다|진다|졌|져|지는|지며|지고|짐)/g, '이루어지다', '행위를 동사로: "배포가 이루어집니다" → "배포합니다"'], // 추정
      [/할 필요가 있(?:다|습니다|었|음|는)/g, '할 필요가 있다', '"~해야 합니다"로 바로 — 필수가 아니면 "~해도 됩니다"'], // 추정
      [/(?:^|[.!?]\s+)(?:[-*]\s+)?이는 /g, '이는', '앞 문장과 합치거나 가리키는 대상을 이름으로'], // 추정
      [/(?:^|[.!?]\s+)(?:[-*]\s+)?즉,/g, '즉,', '앞 문장을 다시 말하는 문장이면 하나로 합치기'], // 추정
    ];
    // 한국어 AI 문형 — 부정 대구·이유다는 서로 다른 두 자료(im-not-ai 대조 코퍼스, hanlint 위키백과·사업보고서 155만 문장 대 기계 글 360편)가
    // 같은 방향을 보고, 분열문·범위 상승은 im-not-ai 소표본만 있다. 모두 에세이·위키 장르라 기술 보고서에서는 미측정 → 전부 힌트,
    // 정당한 용법이 흔한 것은 문서당 횟수 기준. 알려진 오탐: "문제는 재현 가능한 오류입니다" 같은 정의 문장도 분열문으로 센다(2회 기준으로 완화).
    const AFTER_FIX = ' — 고친 문장이 다른 틀(결국·이유다·아니라)을 새로 만들지 않게';
    const TELLS = [
      // 부정 대구: 1회는 가설을 뒤집는 정당한 정정일 수 있어 2회부터. "뿐(만) 아니라"는 다른 구문
      [/(?<!뿐\s*|뿐만\s*)아니라(?=[\s,]|$)|라기보다/g, 2, n => `부정 대구 "A가 아니라 B" ${n}회 — 독자가 실제로 믿던 것을 바로잡을 때만 남기고 나머지는 B를 바로 단언`],
      // 역방향 결산: 결론을 문단 끝에서 "이유"로 뒤집는 틀
      // "이것이·그래서 ~하는 이유다"처럼 결론을 뒤집는 문장만 — "사용자가 선택한 이유입니다"(필드 정의)는 제외
      [/(?:이것이|이게|그것이|그게|이는|그래서)[^.!?]{0,60} 이유(?:다|이다|입니다|였다|였습니다)(?=[.!?\s]|$)|이유가 (?:바로 )?(?:여기에? 있|이것이|이거다|이것입니다|이것이다)/g, 1, () => '역방향 결산 "~하는 이유다" — 결론을 앞에 두고 바로 단언: "그래서 ~합니다"'],
      // 분열문: 문장 머리 "핵심은·문제는 ~이다". "문제는 없었습니다"는 제외
      [/(?:^|[.!?]\s+)(?:[-*]\s+)?(?:핵심은|문제는|관건은|요점은|중요한 (?:것은|점은|건)|필요한 (?:것은|점은|건)) (?!없(?:었|습|다|음))[^.!?]{1,60}(?:이다|다|입니다|였다|였습니다|이었다|이었습니다)(?=[.!?]|$)/g, 2, n => `분열문 "핵심은 ~이다" ${n}회 — 강조 틀 없이 그 내용을 주어로 바로 쓰기`],
      // 범위 상승
      // "넘어서면"(조건), "넘어선"(관형)은 범위 상승이 아님
      [/단순(?:한|히) [^.!?]{0,20}(?:을|를) 넘어(?:서)?(?=[\s,])/g, 1, () => '범위 상승 "단순한 X를 넘어 Y" — Y만 말하기'],
      // 마무리 틀: im-not-ai D-1·D-2·D-6, linkedin-agent-skill li-human의 "in summary" 틀. 결론은 요약 상자와 각 절 첫 문장에 이미 있다(규칙 2).
      // 사례: 두 자료 모두 AI 흔적으로 분류. 추정: 기술 보고서에서의 빈도
      [/(?:^|[.!?]\s+)(?:[-*]\s+)?(?:결론적으로|요컨대|종합하(?:면|자면)|요약하자면|요약하면(?=,)|한마디로)(?=[,\s])/g, 1, () => '마무리 틀 "결론적으로·요컨대·종합하면" — 결론은 요약 상자와 절 첫 문장에, 여기선 빼기'],
      [/시사하는 바가 (?:크|큽|컸|있|많|적지 않)/g, 1, () => '과장 관용구 "시사하는 바가 크다" — 무엇을 뜻하는지 바로 쓰기'],
      [/(?:할|해야 할|나설|바꿀|준비할|움직일|결정할) (?:때|시점)(?:입니다|이다)(?=[.!?]|$)/g, 1, () => '완결 공식 "~할 때입니다" — 할 일을 직접: "~해야 합니다", "~하세요"'],
      // 사례: 2026-10-19 날것의 Claude 글 15개 중 2개, 이 PC 보고서 18건 0개. "결국 롤백했다"(경과)는 서술어가 달라 제외
      [/결국 [^.!?]{0,40}(?:입니다|이다|이죠)(?=[.!?]|$)/g, 1, () => '본질 단정 "X는 결국 Y입니다" — 근거를 쓰거나 "결국" 없이 사실만'],
    ];
    // 이모지 — 날것의 Claude 글 15개 중 6개(제목 머리·마무리 줄), 이 PC 보고서 18건 0개. 소제목도 센다.
    // ↔·★·✓처럼 글자 모양 기호(이모지 표시가 아닌 것)는 제외
    const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu;
    const emoji = { n: 0, line: -1 };
    const tells = TELLS.map(() => ({ n: 0, line: -1 }));
    // 같은 개념의 다른 말 — 첫 단어가 권장어(references/ko-terms.md)
    const MIX = [
      ['오류', '에러'], // 실측: 오류 33건·에러 37건, 오류 고정은 편집 기준
      ['반환', '리턴'], // 실측: 45건·9건
      ['파라미터', '매개변수', '매개 변수'], // 실측: 파라미터 66건·매개변수 계열 1건
    ];
    // 추정: 하이퍼파라미터·RF 리턴 로스는 다른 개념. 실측 빈도가 혼용 판별 정확도를 뜻하지 않는다.
    const mixPatterns = MIX.map(ws => ws.map(w => new RegExp((w === '파라미터' ? '(?<!하이퍼)' : '') + w +
      (w === '리턴' ? '(?!\\s+로스)' : ''), 'g')));
    const counts = COUNTED.map(() => ({ n: 0, line: -1 }));
    const mix = MIX.map(ws => ws.map(() => ({ n: 0, line: -1 })));
    // frontmatter summary(요약 상자)도 본문처럼 검사한다 — 가장 먼저 읽히는 곳.
    // 사례: 2026-10-21 시나리오의 요약 "회신해 주시기 바랍니다"는 통과하고, 같은 문장이 본문에 있으면 경고였다
    const sumAt = lines.slice(0, start).findIndex(l => /^summary:/.test(l));
    const fmSummary = [];
    if (sumAt > 0) { fmSummary.push(sumAt); for (let j = sumAt + 1; j < start - 1 && /^\s+\S/.test(lines[j]); j++) fmSummary.push(j); }
    for (const i of [...fmSummary, ...Array.from({ length: lines.length - start }, (_, k) => start + k)]) {
      const l = unquoted[i], fb = fenceAt[i];
      // 글 블록(flow·stats·cards)의 안쪽은 검사, 펜스 줄 자체와 코드·mermaid는 건너뜀
      if (fb && (i === fb.open || i === fb.close || !/^(flow|stats|cards)$/.test(fb.kind))) continue;
      if (SOURCES_RE.test(l)) continue;
      // 추정: 표시 문구만 검사. 링크 목적지와 인용·코드는 제목/본문에서 같은 방식으로 제외한다.
      const text = i < start ? proseLines[i].replace(/^summary:\s*([|>][-+]?\s*$)?/, '') : proseLines[i];
      const em = text.match(EMOJI);
      if (em) { emoji.n += em.length; if (emoji.line < 0) emoji.line = i; }
      const h = text.match(/^#{2,4}\s+(.*)$/);
      if (h) { const m = h[1].trim().match(HEAD); if (m) warn(i, 14, `소제목 은유 "${m[0]}" — 사실을 말하는 소제목으로 (예: "요청 처리 흐름", "등록 테이블 목록")`); continue; }
      for (const [re, why] of BODY) { const m = text.match(re); if (m) warn(i, 14, `"${m[0].trim()}" — ${why}`); }
      for (const [re, why] of SOFT) { const m = text.match(re); if (m) warn(i, 14, `"${m[0].trim()}" — ${why}`, true); }
      COUNTED.forEach(([re], k) => { const n = (text.match(re) || []).length; if (n) { counts[k].n += n; if (counts[k].line < 0) counts[k].line = i; } });
      TELLS.forEach(([re], k) => { const n = (text.match(re) || []).length; if (n) { tells[k].n += n; if (tells[k].line < 0) tells[k].line = i; } });
      mixPatterns.forEach((rs, k) => rs.forEach((re, j) => { const n = (text.match(re) || []).length; if (n) { mix[k][j].n += n; if (mix[k][j].line < 0) mix[k][j].line = i; } }));
    }
    COUNTED.forEach(([, name, how], k) => { if (counts[k].n > 3) warn(counts[k].line, 14, `"${name}" ${counts[k].n}회 — 3회 이하로: ${how}`, true); });
    TELLS.forEach(([, min, msg], k) => { if (tells[k].n >= min) warn(tells[k].line, 14, msg(tells[k].n) + AFTER_FIX, true); });
    if (emoji.n) warn(emoji.line, 14, `이모지 ${emoji.n}개 — 보고서 제목·문장에서 빼기, 상태는 글자 라벨(확인·추정)로`, true);
    MIX.forEach((ws, k) => {
      const used = ws.map((w, j) => [w, mix[k][j]]).filter(([, c]) => c.n);
      if (used.length < 2) return;
      const desc = used.map(([w, c]) => `"${w}" ${c.n}회`).join('·');
      used.filter(([w]) => w !== ws[0]).forEach(([, c]) => warn(c.line, 14, `용어 섞임 ${desc} — 한 문서에서는 "${ws[0]}" 하나로 (references/ko-terms.md)`));
    });
  }

  // 2026-10-21: "글이 많고 AI가 쓴 느낌"이라는 평을 받은 보고서 한 건(출처 제외 9,350자)에서 잰 네 가지(전부 힌트).
  // 그 문서: 강조용 따옴표 17곳, 8자 넘는 괄호 단서 42곳(두 개 든 줄 6줄), 이중 유보 4곳, 한 섹션 문두 접속어 3개.
  // 임계값은 이 PC 보고서 677건의 상위 10~25% 선 — 대부분 AI가 쓴 글이라 좋은 글의 분포가 아니다(추정)
  {
    const QUOTE_MARK = /^(?:라고|라는|이라고|이라는|라며|이라며|이란|란|이?라\s|하고 (?:말|적|밝|물)|고 (?:말|밝|적|안내|보도|썼|했)|(?:으)?로 (?:표시|적혀|나옵|뜹)|(?:이|가) (?:뜹|나옵|찍|표시))/;
    // 말로 끝나는 따옴표는 발화·문구 인용("이미 확인했어요", "확인 안 됨", "무엇이 무너졌나"). 명사("이미지", "데이터")는 강조로 본다
    const SPOKEN = /(?:습니다|니다|어요|아요|여요|해요|예요|에요|이요|네요|군요|지요|나요|가요|죠|까|다|됨|함|음|는가|은가|인가|[었았였했졌갔왔봤됐]나)[.?!…]*$/;
    // "~할 수 있습니다"는 능력인지 가능성인지 글자로 못 가려서 넣지 않는다
    const HEDGE2 = /(?:고 봅니다|(?:으)?로 보입니다|것 같습니다|추정됩니다|추정합니다|가능성이 (?:있|높)습니다|듯합니다)\.?\s*\[(?:추정|미확인|미검증)[^\]]*\]/;
    const CONN = /(?:^|[.!?]\s+)(?:[-*]\s+)?(다만|그러나|하지만|그래서|따라서|또한|한편|그런데|게다가|더불어)(?=[\s,])/g;
    const scare = [], parenLines = [], longBasis = [];
    let parenN = 0, hedge = null, hedgeN = 0, sec = { conn: [], line: start }, sourceDepth = 0, details = 0, comment = false;
    const flushConn = () => {
      if (sec.conn.length >= 3) warn(sec.line, 14, `문두 접속어 ${sec.conn.length}개(${[...new Set(sec.conn)].join('·')}) — 한 섹션에서 잇달아 쓰지 말고, 앞 문장과 합치거나 접속어 없이 사실만`, true);
    };
    // frontmatter summary(요약 상자)도 본다 — 가장 먼저 읽히는 곳
    const sumAt = lines.slice(0, start).findIndex(l => /^summary:/.test(l)), order = [];
    if (sumAt > 0) { order.push(sumAt); for (let j = sumAt + 1; j < start - 1 && /^\s+\S/.test(lines[j]); j++) order.push(j); }
    for (let i = start; i < lines.length; i++) order.push(i);
    const noCode = t => t.replace(/<code\b[^>]*>.*?<\/code\s*>/gi, '').replace(/`[^`]*`/g, '');
    for (const i of order) {
      const fb = fenceAt[i];
      if (fb && (i === fb.open || i === fb.close || !/^(flow|stats|cards)$/.test(fb.kind))) continue;
      let raw = i < start ? lines[i].replace(/^summary:\s*([|>][-+]?\s*$)?/, '') : lines[i];
      // HTML 주석은 화면에 없다 — 한 줄 안 주석은 지우고, 여러 줄 주석은 건너뛴다
      raw = raw.replace(/<!--.*?-->/g, '');
      if (comment) { if (raw.includes('-->')) comment = false; continue; }
      if (raw.includes('<!--')) { comment = true; raw = raw.slice(0, raw.indexOf('<!--')); }
      const h = raw.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (h) {
        if (h[1].length === 2) { flushConn(); sec = { conn: [], line: i }; }
        if (sourceDepth && h[1].length <= sourceDepth) sourceDepth = 0;
        if (SOURCE_HEADING.test(visibleText(h[2]))) sourceDepth = h[1].length;
        continue;
      }
      const opens = (raw.match(/<details[\s>]/gi) || []).length, closes = (raw.match(/<\/details\s*>/gi) || []).length;
      const inDetails = details > 0 || opens > 0;
      details = Math.max(0, details + opens - closes);
      if (sourceDepth) continue;
      if (SOURCES_LINE.test(raw)) { if (visibleText(raw).length > 200) longBasis.push(i); continue; }
      const l = noCode(raw).replace(/\]\((?:[^()\s]|\([^()\s]*\))*\)/g, ']');
      // 인용을 가린 글: 유보·접속어·괄호는 남의 말 안에서 세지 않는다
      const prose = i < start ? noCode(proseLines[i].replace(/^summary:\s*([|>][-+]?\s*$)?/, '')) : noCode(proseLines[i]);
      // 따옴표: 인용 표지("~라고·~라는·~이라 답했다", "~가 뜹니다")·말로 끝나는 글·표 칸 전체가 인용·
      // 인용문(>)·고치기 전후(→)·한글 없는 원문은 인용으로 본다. 남는 것은 명사구 — 강조나 이름표.
      // 사례: 2026-10-21 이 PC 보고서 677건 중 169건이 걸렸고, 표본 10건 중 7건이 페르소나 발화 인용이라 말끝 조건을 넣었다
      if (!/^\s*>/.test(l) && !/→|->/.test(l)) for (const m of l.matchAll(/"([^"\n]{1,40})"|“([^”\n]{1,40})”/g)) {
        const inner = m[1] ?? m[2], after = l.slice(m.index + m[0].length), before = l.slice(0, m.index);
        if (SPOKEN.test(inner) || !/[가-힣]/.test(inner) || QUOTE_MARK.test(after)) continue;
        if (/\|\s*$/.test(before) && /^\s*\|/.test(after)) continue;
        scare.push([i, inner]);
      }
      // 괄호 단서: 8자 이상, 영어 원어·숫자만 든 풀이("(엔드포인트)", "(기본값 10)")는 제외. 접힌 칸은 조건을 두라는 곳이라 세지 않는다
      if (!inDetails) {
        const ps = [...prose.matchAll(/\(([^()]{8,})\)/g)].filter(m => !/^[A-Za-z0-9 .,'&/:+%-]+$/.test(m[1]));
        parenN += ps.length; if (ps.length >= 2) parenLines.push(i);
      }
      const hd = prose.match(HEDGE2); if (hd) { hedgeN++; if (!hedge) hedge = [i, hd[0]]; }
      if (!/^\s*\|/.test(prose)) for (const m of prose.replace(/\*\*/g, '').matchAll(CONN)) sec.conn.push(m[1]);
    }
    flushConn();
    if (scare.length >= 5) warn(scare[0][0], 14, `강조용 따옴표 ${scare.length}곳 — 남의 말을 옮긴 게 아니면 따옴표를 빼고, 꼭 강조할 말만 **굵게**: ${scare.slice(0, 4).map(([, q]) => `"${q}"`).join(' ')}`, true);
    if (parenLines.length >= 3 || parenN >= 12) warn((parenLines[0] ?? start), 8, `괄호 단서 ${parenN}곳(두 개 이상 든 줄 ${parenLines.length}줄) — 표본·기간·집계 기준 같은 조건은 섹션 끝 "근거:" 줄이나 접힌 칸으로, 문장에는 결론과 수치만`, true);
    if (hedge) warn(hedge[0], 8, `유보가 두 겹 "${hedge[1]}"${hedgeN > 1 ? ` 외 ${hedgeN - 1}곳` : ''} — 동사로 단정하고 [추정] 하나만 두거나, 태그 없이 "~로 봅니다"로`, true);
    // 근거 줄이 조건을 쌓는 새 문단이 되지 않게. 사례: 2026-10-21 재작성본의 한 근거 줄이 7문장·400자를 넘었다
    if (longBasis.length) warn(longBasis[0], 6, `근거 줄 ${longBasis.length}개가 200자를 넘음 — 조건이 많으면 불릿으로 나누거나 <details>로`, true);
  }

  // 규칙 15(힌트): 그림이 나을 내용을 글로만 쓴 섹션
  //  - 주어가 있는 처리 단계("컨트롤러가 …", "서비스가 …") 3개 이상을 번호·서수로 나열했는데 flow/mermaid가 없음
  //  - 한 줄에 화살표(→, ->)로 3단계 이상 이어 씀
  //  사람이 따라 할 절차("~ 넣습니다", "~ 재시작합니다")는 주어가 없어서 걸리지 않고, 제목에 절차·방법이 있으면 건너뛴다
  {
    const ORD = /^\s*(\d+\.|첫째|둘째|셋째|넷째|다섯째|여섯째|먼저|그다음|그 다음|다음으로|이어서|마지막으로)[,\s]/;
    const SUBJ = /^(\S+\s+){0,3}\S*(이|가|은|는)\s/;   // 앞 네 어절 안에 주어·주제 표지
    let sec = null;
    const secs = [];
    const open = (i, name) => {
      sec = { name, steps: 0, subj: 0, diagram: false, first: -1, procedure: /절차|방법|할 일|체크리스트|준비|설치|how to/i.test(name) };
      secs.push(sec);
    };
    open(start, '(머리말)');
    for (let i = start; i < lines.length; i++) {
      const l = lines[i], fb = fenceAt[i];
      if (fb) { if (i === fb.open && /^(flow|mermaid)$/.test(fb.kind)) sec.diagram = true; continue; }
      const h = l.match(/^#{2,3}\s+(.*)$/);
      if (h) { open(i, h[1].trim()); continue; }
      if (ORD.test(l)) {
        sec.steps++; if (sec.first < 0) sec.first = i;
        if (SUBJ.test(l.replace(ORD, '').trim() + ' ')) sec.subj++;
      }
      if ((l.replace(/`[^`]*`/g, '').match(/→|->/g) || []).length >= 3) warn(i, 15, '화살표로 3단계 이상 이어 씀 — ```flow 블록(가지 없음)이나 Mermaid 흐름도로', true);
    }
    for (const s of secs) {
      if (s.diagram || s.procedure || s.steps < 3 || s.subj / s.steps < 0.5) continue;
      warn(s.first, 15, `"${s.name}"에 처리 단계 ${s.steps}개를 글로만 나열 — 시스템이 처리하는 순서면 \`\`\`flow 블록(가지·반복 있으면 Mermaid)으로`, true);
    }
    // 일직선 flow에 실패 조건 단계("실패하면 재시도", "그래도 안 되면 알림")를 이어 붙이면 모든 건이 실패 단계를 거치는 것처럼 읽힌다.
    // 사례: 2026-10-21 시나리오(인수인계)가 저장 → 재시도 → 실패 토픽 → 알림을 한 줄로 그림
    const FAIL_IF = /실패하면|실패 시|실패할 때|안 되면|오류가 (?:나면|발생하면)/;
    for (const fb of blocks) {
      const hit = fb.kind === 'flow' && fb.body.find(([, l]) => FAIL_IF.test(l));
      if (hit) warn(hit[0], 15, '```flow 단계에 실패 조건 — 갈라지는 흐름이면 Mermaid flowchart로 정상 경로와 실패 경로를 나눠 그리기', true);
    }
  }

  return F.sort((a, b) => a.line - b.line);
}

// 출력: 경고는 "lint: N건", 힌트는 따로. 반환값 = 경고 수(--strict 판단용)
function report(file, F) {
  const errs = F.filter(f => !f.hint), hints = F.filter(f => f.hint);
  if (errs.length) {
    console.log(`lint: ${errs.length}건`);
    for (const f of errs) console.log(`  ${file}:${f.line}  [규칙 ${f.rule}] ${f.msg}`);
  } else console.log('lint: 문제 없음');
  if (hints.length) {
    console.log(`힌트: ${hints.length}건 (판단해서 반영 — --strict 실패 사유 아님)`);
    for (const f of hints) console.log(`  ${file}:${f.line}  [규칙 ${f.rule}] ${f.msg}`);
  }
  return errs.length;
}

module.exports = { lint, report, parseFrontmatter, safeUrl, HTML_TAGS, FENCE_RE, STATUS_TAGS, measureReading };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('-'));
  if (!file || args.includes('--help') || args.includes('-h')) { console.error('usage: node lint.js <report.md> [--strict] [--plain [--renderer] [--reader-review]] [--external]'); process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1); }
  let src;
  try { src = fs.readFileSync(file, 'utf8'); }
  catch (e) { console.error(`lint: 입력 파일을 읽을 수 없음 — ${file} (${e.code || e.message})`); process.exit(2); }
  const opts = { plain: args.includes('--plain'), renderer: args.includes('--renderer'), readerReview: args.includes('--reader-review'), external: args.includes('--external') };
  const errors = report(file, lint(src, opts));
  process.exit(args.includes('--strict') && errors ? 1 : 0);
}
