#!/usr/bin/env node
'use strict';
/**
 * 보고서 md lint — SKILL.md 체크리스트 중 기계로 잡히는 항목만 검사.
 *
 *   node lint.js report.md            → 경고 출력, exit 0
 *   node lint.js report.md --strict   → 경고 있으면 exit 1
 *
 * 검사 항목(규칙 번호는 SKILL.md, "fm"/"구조"는 렌더 안전용):
 *   fm  frontmatter 없음 / title·date·audience 누락 (audience 없으면 외부 공유 검사가 조용히 꺼지므로 필수)
 *   1   audience: external 일 때만 — 브랜치 경로(feature/…)·내부 호스트·IP·사번 패턴, redact: 목록(쉼표 구분)
 *   2   요약 박스(frontmatter.summary 또는 첫 H2 이전 인용문) 문장 3개 초과
 *   4   불릿이 서술어 없이 끝남(단편 의심) — 한국어: 다/요/음/함/됨/./: 로 안 끝나는 항목
 *   6   본문 문장 안에 file:line (근거: 줄·코드펜스·표 제외)
 *   7   표 셀이 백틱 코드만으로 채워짐
 *   8   H2 7개 초과 / 섹션 본문 12줄 초과(코드·표·details 제외) / H2 전에 H3
 *   9   <details> 열림/닫힘 개수 불일치
 *   11  한 줄에 문장 2개 이상 (마침표 뒤 공백 없어도 잡음, 말줄임표는 제외)
 *   13  "## 배경" 없음·첫 섹션 아님 / 배경에 요청·현상 라벨 없음 / "비유하자면"·"그래서 이번에" 같은 이야기체 표현
 *   15  (힌트) 그림이 나을 내용을 글로만 씀 — 주어 있는 처리 단계 3개 이상 나열, 화살표 3단계 이상. --strict 실패 사유 아님
 *   14  자연스러운 한국어 — 은유 소제목("요청이 지나가는 길", "~ 지도"), 의인화·번역투 동사(지나가다·조립하다·창구를 열다·뽑아내다),
 *       구어체 강조어(딱·진짜), 예고 문장("나누면 이렇습니다"), 괄호 비유 풀이("기계(코드)"),
 *       번역투(에 의해·되어지다·하기 위해서는·선택적·을 가진·자동 조사 "을(를)"),
 *       업무 관용투(하시기 바랍니다·하는 것이 가능·하도록 하겠습니다·을 진행합니다), 표기(파라메터·어플리케이션),
 *       용어 섞임(오류/에러·반환/리턴·파라미터/매개변수). 힌트: 사물 주어, 영어 낱말+하다, 해당·에 대한·를 통해·로 인해 4회 이상.
 *       따옴표 안은 인용이라 건너뜀. 기준은 references/ko-terms.md
 *   구조 코드펜스 안 닫힘 / 표 행의 칸 수가 헤더와 다름 — 렌더러가 조용히 내용을 바꾸는 입력
 *        flow·stats 칸이 정해진 수보다 많음 / 모르는 역할·상태 이름 / 빈 flow·stats·cards 블록
 */
const fs = require('fs');

const ENDERS = /(다|요|음|함|됨|임|것|\.|:|：)\s*[.!?]?\s*$/;   // 문장/서술 끝으로 볼 패턴
const FILE_LINE = /\b[\w./-]+\.(js|ts|tsx|jsx|py|java|kt|go|rs|rb|php|cs|c|cpp|h|xml|yml|yaml|json|sql|sh|md)\s*:\s*\d+/;
const SOURCES_RE = /^\s*(근거|출처|basis|sources)\s*[:：]/i;
const BOM = String.fromCharCode(0xFEFF);

// 문장 수: 말줄임표·소수점·약어 제거 후, 종결부호 뒤 공백/끝 또는 한글 종결어미+마침표 뒤 바로 글자(공백 없는 타자)
function countSentences(text) {
  const t = text.replace(/\.{2,}|…/g, ' ').replace(/\d\.\d/g, '00').replace(/\b(e\.g|i\.e|vs|etc|Mr|Dr|No|cf)\./gi, 'x');
  return (t.match(/[.!?。](?=\s|$)|(다|요|죠|음|함|됨|임)[.!?](?=\S)/g) || []).length;
}

function parseFrontmatter(lines) {
  const meta = {}; let start = 0, has = false;
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
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
  }
  return { meta, start, has };
}

function lint(src) {
  src = src.replace(/\r\n/g, '\n');
  if (src.startsWith(BOM)) src = src.slice(1);
  const lines = src.split('\n');
  const F = [];
  // hint=true 는 "판단해서 반영" 제안 — 오탐 가능성이 있어 --strict 실패 사유에서 뺀다
  const warn = (line, rule, msg, hint) => F.push({ line: line + 1, rule, msg, hint: !!hint });

  const { meta, start, has } = parseFrontmatter(lines);
  if (!has) warn(0, 'fm', 'frontmatter 없음 — title / date / audience 는 필수');
  else {
    if (!meta.title) warn(0, 'fm', 'frontmatter title 없음');
    if (!meta.date) warn(0, 'fm', 'frontmatter date 없음 — 없으면 렌더 당일이 작업일로 찍힘');
    if (!meta.audience) warn(0, 'fm', 'frontmatter audience 없음 (team | cross-team | leadership | external) — 없으면 외부 공유 검사가 꺼짐');
    else if (!/^(team|cross-team|leadership|external)$/i.test(meta.audience.trim())) warn(0, 'fm', `audience "${meta.audience}" — team | cross-team | leadership | external 중 하나`);
    if (meta.theme && !/^(light|dark|auto)$/i.test(meta.theme.trim())) warn(0, 'fm', `theme "${meta.theme}" — light | dark | auto 중 하나 (아니면 light로 렌더됨)`);
  }

  // 요약 박스
  let summary = meta.summary || '', summaryLine = 0;
  if (!summary) {
    for (let i = start; i < lines.length; i++) {
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

  // 본문 스캔
  let inCode = false, codeStart = -1, fenceLen = 0, inHtml = false, h1Count = 0;
  let h2Count = 0, secLines = 0, secStart = -1, secName = '', h3BeforeH2 = false;
  let tableHead = -1, tableStartLine = -1;
  const flushSec = () => { if (secStart >= 0 && secLines > 12) warn(secStart, 8, `"${secName}" 본문 ${secLines}줄 — 12줄 넘으면 <details>로 접기`); };
  const cellCount = l => l.trim().replace(/\\\|/g, ' ').replace(/^\||\|$/g, '').split('|').length;

  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    const fence = l.match(/^(`{3,})/);
    if (fence) {
      if (!inCode) { inCode = true; codeStart = i; fenceLen = fence[1].length; continue; }
      if (fence[1].length >= fenceLen && /^`{3,}\s*$/.test(l)) { inCode = false; codeStart = -1; continue; }
    }
    if (inCode) continue;
    if (/^<details/i.test(l)) inHtml = true;
    if (inHtml) { if (/<\/details>/i.test(l)) inHtml = false; continue; }

    if (/^\s*\|/.test(l)) {
      if (tableHead < 0) { tableHead = cellCount(l); tableStartLine = i; continue; }
      if (i === tableStartLine + 1) continue;   // 정렬 행
      const n = cellCount(l);
      if (n !== tableHead) warn(i, '구조', `표 칸 ${n}개, 헤더 ${tableHead}개 — 칸 수 맞추기 (셀 안 파이프는 \\| 로)`);
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      cells.forEach((c, ci) => { if (/^`[^`]+`$/.test(c) && ci > 0) warn(i, 7, `표 셀이 코드만 있음 "${c}" — 구절로 (예: "가장 오래 안 쓴 것부터 지운다")`); });
      continue;
    }
    tableHead = -1;
    if (!l.trim()) continue;

    if (/^#\s/.test(l) && ++h1Count === 2) warn(i, 8, 'H1(#)이 두 번 — 문서 제목은 하나, 나머지는 ##로 (렌더러가 섹션으로 강등함)');
    if (/^##\s/.test(l)) { flushSec(); h2Count++; secStart = i; secName = l.replace(/^##\s+/, ''); secLines = 0; continue; }
    if (/^###\s/.test(l) && h2Count === 0 && !h3BeforeH2) { h3BeforeH2 = true; warn(i, 8, 'H2 없이 H3가 먼저 나옴 — 섹션(##)부터'); }
    if (/^#{1,6}\s/.test(l)) continue;
    if (SOURCES_RE.test(l)) continue;
    if (/^>/.test(l) && i === summaryLine) continue;

    const text = l.replace(/^>\s?/, '').replace(/`[^`]*`/g, '');
    if (secStart >= 0) secLines++;

    // 링크 스킴: 렌더러가 # 으로 죽이는 링크를 미리 알린다
    for (const lm of l.matchAll(/\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g)) {
      const u = lm[1];
      if (/^javascript:/i.test(u) || !/^(https?:|mailto:|#|\/|\.\.?\/|[\w.-]+(\/|$))/i.test(u)) warn(i, '구조', `링크 "${u.slice(0, 40)}" — 허용 안 되는 스킴, 렌더 시 죽은 링크(#)가 됨`);
    }

    // 규칙 6
    if (FILE_LINE.test(l)) warn(i, 6, `본문에 file:line — 섹션 끝 "근거:" 줄로 옮기기`);

    // 규칙 4: 불릿 단편
    const li = l.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      const raw = li[2].trim();
      const item = raw.replace(/`[^`]*`/g, '').replace(/\*\*/g, '').replace(/\[[^\]]+\]\([^)]*\)/g, 'x').replace(/\[(완료|미검증|실패|블로커|선재|주의|정보|추천)\]/g, '').trim();
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
  if (inCode) warn(codeStart, '구조', '코드펜스(```)가 닫히지 않음 — 이 뒤 내용이 전부 코드 패널로 들어감');
  if (h2Count > 7) warn(0, 8, `H2 ${h2Count}개 — 7개 이하로, 나머지는 <details>나 부록으로`);

  // 규칙 9: <details> 열림/닫힘 짝 (코드펜스 밖만) — 안 맞으면 렌더 결과가 통째로 접힌다
  {
    let code = false, opens = 0, closes = 0, lastOpen = 0;
    for (let i = start; i < lines.length; i++) {
      if (/^`{3,}/.test(lines[i])) { code = !code; continue; }
      if (code) continue;
      const o = (lines[i].match(/<details(\s|>)/gi) || []).length, c = (lines[i].match(/<\/details\s*>/gi) || []).length;
      if (o) lastOpen = i;
      opens += o; closes += c;
    }
    if (opens !== closes) warn(lastOpen, 9, `<details> 열림 ${opens}개 / 닫힘 ${closes}개 — 짝을 맞추기`);
  }

  // 규칙 13: 배경 섹션은 요청 분석 — "- **요청** — …", "- **현상** — …" 라벨 필수, 비유·서사 표현 경고
  {
    let code = false, inBg = false, bgLine = -1, hasReq = false, hasObs = false;
    const label = name => new RegExp('^\\s*(?:[-*]\\s+|\\d+\\.\\s+|\\|\\s*)?(?:\\*\\*)?(?:' + name + ')(?:\\*\\*)?\\s*[—:：|-]', 'i');
    const REQ = label('요청|request'), OBS = label('현상|문제|problem|symptom');
    const STORY = /비유하자면|비유하면|마치 [^.]{1,30} 같|그래서 이번에/;
    const finish = () => {
      if (!hasReq || !hasObs) warn(bgLine, 13, `배경에 ${[!hasReq && '요청', !hasObs && '현상'].filter(Boolean).join('·')} 라벨 없음 — "- **요청** — 누가 무엇을 요청했나" 식으로 요청을 분석해서 쓰기`);
    };
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      if (/^`{3,}/.test(l)) { code = !code; continue; }
      if (code) continue;
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
    let code = false, firstH2 = -1, firstH2Text = '', hasBg = false;
    for (let i = start; i < lines.length; i++) {
      if (/^`{3,}/.test(lines[i])) { code = !code; continue; }
      if (code || !/^##\s/.test(lines[i])) continue;
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
    const HEAD = /지나가는 길|의 여정|이렇게 돌아간다|어떻게 돌아가|의 모든 것|한눈에 보는|속살|해부|[가-힣A-Za-z·]+ 지도$/;
    const BODY = [
      [/(요청|데이터|메시지|패킷)[은는이가] [^.]{0,12}(지나갑|지나가|흘러갑|흘러가)/, '의인화 — "처리됩니다"'],
      [/조립(합니다|해|하고|한)/, '번역투 — "구성합니다"'],
      [/창구를 열/, '은유 — "제공합니다"'],
      [/뽑아(냅|내|낸)/, '구어체 — "추출합니다"'],
      [/(^|\s)(딱|진짜|엄청)\s/, '구어체 강조어 — 빼기'],
      [/(나누면|정리하면|요약하면|살펴보면) (이렇습니다|다음과 같습니다)\.?\s*$/, '예고 문장 — 빼고 바로 표·목록'],
      [/[가-힣]+\([가-힣A-Za-z ]*(설정값|코드|데이터)\)/, '비유를 괄호로 풀이 — 대상을 바로 이름으로'],
      // 번역투 — 번역판에 몇 배 많은 것(괄호: 그 표현이 나온 문서 비율, 국내 원문 / 번역판)
      [/(?<=[가-힣A-Za-z0-9)])에 의해/,'번역투(3% / 29%) — 행위자를 주어로: "서버에 의해 발급됩니다" → "서버가 발급합니다"'],
      [/되어(지|진|집|져)/, '이중 피동 — "되어집니다" → "됩니다"'],
      [/하기 위해서는/, '번역투 — "~하려면"'],
      [/선택적 (파라미터|매개 ?변수|필드|항목|인자|값|헤더|요소)/, '번역투(optional) — "선택 파라미터", 표에서는 "선택"'],
      [/(을|를) (가지(는|고|며|게)|가집니다|가진|갖(는|고|습니다|은|게))/, '번역투(have) — "권한을 가진 사용자" → "권한이 있는 사용자"'],
      [/을\(를\)|를\(을\)|이\(가\)|가\(이\)|은\(는\)|는\(은\)|와\(과\)|과\(와\)|\(으\)로/, '기계 번역 자동 조사 — 받침에 맞는 조사 하나로'],
      // 업무 관용투 — 국내 원문에 오히려 많은 한국 업무 문서 습관
      [/하시기 바랍니다|주시기 바랍니다|부탁드립니다/, '업무 관용투(20% / 4%) — "~해 주세요"'],
      [/하는 것이 가능/, '업무 관용투 — "~할 수 있습니다"'],
      [/하도록 하겠습니다/, '업무 관용투 — "~하겠습니다"'],
      [/(을|를) (진행|수행)(합니다|하고|하여|해서|해야|했습니다|하면|한 뒤|한 후|하는|하기|할)/, '업무 관용투 — 명사를 동사로: "검증을 진행합니다" → "검증합니다"'],
      // 표기 — 외래어 표기법
      [/파라메터/, '표기 — "파라미터"'],
      [/어플리케이션/, '표기 — "애플리케이션"'],
    ];
    // 힌트 — 맞는 문장도 걸릴 수 있어 판단에 맡긴다
    const SOFT = [
      [/(API|메서드|함수|엔드포인트|요청|응답|이 문서|이 기능|서비스|시스템)[는은] [^.]{0,30}(허용|요구)합니다/, '사물 주어(20% / 71%) — 사람·조건으로: "이 API는 인증을 요구합니다" → "이 API를 호출하려면 인증해야 합니다"'],
      [/(^|[^A-Za-z])[A-Za-z]{3,} (하시면|하면|하여|하고|해서|해야|합니다|했습니다|되면|되어|됩니다)/, '영어 낱말 + 하다 — 한국어 동사로: "Open 하시면" → "열면"'],
    ];
    const COUNTED = [
      [/해당 (?!없음|사항 없음)/g, '해당', '"이 ~"나 실제 이름으로'],
      [/에 대한|에 대해/g, '에 대한', '조사로 바로: "A에 대한 설명" → "A 설명", "A에 대해 안내" → "A를 안내"'],
      [/(을|를) 통해/g, '를 통해', '수단은 "~로", 장소는 "~에서"'],
      [/로 인해/g, '로 인해', '"~ 때문에", "~해서"'],
    ];
    // 같은 개념의 다른 말 — 첫 단어가 권장어(references/ko-terms.md)
    const MIX = [['오류', '에러'], ['반환', '리턴'], ['파라미터', '매개변수', '매개 변수']];
    const counts = COUNTED.map(() => ({ n: 0, line: -1 }));
    const mix = MIX.map(ws => ws.map(() => ({ n: 0, line: -1 })));
    let fence = null;   // { len, prose } — 글 블록(flow·stats·cards)은 검사, 코드·mermaid는 건너뜀
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      const fm = l.match(/^\s*(`{3,})\s*([^\s`]*)/);
      if (fm) {
        if (!fence) { fence = { len: fm[1].length, prose: /^(flow|stats|cards)$/.test(fm[2]) }; continue; }
        if (fm[1].length >= fence.len && !fm[2]) { fence = null; continue; }
      }
      if (fence && !fence.prose) continue;
      if (SOURCES_RE.test(l)) continue;
      const h = l.match(/^#{2,4}\s+(.*)$/);
      if (h) { const m = h[1].trim().match(HEAD); if (m) warn(i, 14, `소제목 은유 "${m[0]}" — 사실을 말하는 소제목으로 (예: "요청 처리 흐름", "등록 테이블 목록")`); continue; }
      const text = l.replace(/`[^`]*`/g, '').replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|'[^'\n]*'/g, '""');
      for (const [re, why] of BODY) { const m = text.match(re); if (m) warn(i, 14, `"${m[0].trim()}" — ${why}`); }
      for (const [re, why] of SOFT) { const m = text.match(re); if (m) warn(i, 14, `"${m[0].trim()}" — ${why}`, true); }
      COUNTED.forEach(([re], k) => { const n = (text.match(re) || []).length; if (n) { counts[k].n += n; if (counts[k].line < 0) counts[k].line = i; } });
      MIX.forEach((ws, k) => ws.forEach((w, j) => { const n = text.split(w).length - 1; if (n) { mix[k][j].n += n; if (mix[k][j].line < 0) mix[k][j].line = i; } }));
    }
    COUNTED.forEach(([, name, how], k) => { if (counts[k].n > 3) warn(counts[k].line, 14, `"${name}" ${counts[k].n}회 — 3회 이하로: ${how}`, true); });
    MIX.forEach((ws, k) => {
      const used = ws.map((w, j) => [w, mix[k][j]]).filter(([, c]) => c.n);
      if (used.length < 2) return;
      const desc = used.map(([w, c]) => `"${w}" ${c.n}회`).join('·');
      used.filter(([w]) => w !== ws[0]).forEach(([, c]) => warn(c.line, 14, `용어 섞임 ${desc} — 한 문서에서는 "${ws[0]}" 하나로 (references/ko-terms.md)`));
    });
  }

  // 규칙 15(힌트): 그림이 나을 내용을 글로만 쓴 섹션
  //  - 주어가 있는 처리 단계("컨트롤러가 …", "서비스가 …") 3개 이상을 번호·서수로 나열했는데 flow/mermaid가 없음
  //  - 한 줄에 화살표(→, ->)로 3단계 이상 이어 씀
  //  사람이 따라 할 절차("~ 넣습니다", "~ 재시작합니다")는 주어가 없어서 걸리지 않고, 제목에 절차·방법이 있으면 건너뛴다
  {
    const ORD = /^\s*(\d+\.|첫째|둘째|셋째|넷째|다섯째|여섯째|먼저|그다음|그 다음|다음으로|이어서|마지막으로)[,\s]/;
    const SUBJ = /^(\S+\s+){0,3}\S*(이|가|은|는)\s/;   // 앞 네 어절 안에 주어·주제 표지
    let code = false, sec = null;
    const secs = [];
    const open = (i, name) => {
      sec = { name, steps: 0, subj: 0, diagram: false, first: -1, procedure: /절차|방법|할 일|체크리스트|준비|설치|how to/i.test(name) };
      secs.push(sec);
    };
    open(start, '(머리말)');
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      const fence = l.match(/^`{3,}\s*(\w*)/);
      if (fence) { if (!code && /^(flow|mermaid)$/.test(fence[1])) sec.diagram = true; code = !code; continue; }
      if (code) continue;
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
  }

  // 블록 검사(flow·stats·cards): 렌더러가 칸을 합치거나 이름을 무시하는 입력을 미리 알린다.
  // 역할·상태 목록은 render.js의 FLOW_ROLES·STAT_STATE와 같아야 한다
  {
    const ROLE = /^(ext|entry|logic|data|done|fail|caution|info|neutral)$/;
    const STATE = /^(done|완료|fail|실패|블로커|caution|주의|unverified|미검증|info|정보|neutral|중립|선재)$/i;
    const split = l => l.trim().replace(/\\\|/g, ' ').split('|').map(c => c.trim());   // 칸 수만 세므로 \| 는 공백으로
    const check = fb => {
      if (!/^(flow|stats|cards)$/.test(fb.kind)) return;
      const filled = fb.body.filter(([, l]) => l.trim());
      if (!filled.length) { warn(fb.open, '구조', `빈 \`\`\`${fb.kind} 블록 — 내용이 없으면 지우기`); return; }
      if (fb.kind === 'cards') return;
      const flow = fb.kind === 'flow', fixed = flow ? 3 : 4, ok = flow ? ROLE : STATE;
      const name = flow ? '역할' : '상태';
      const allowed = flow ? 'ext·entry·logic·data (또는 done·fail·caution·info·neutral)' : '완료·실패·주의·미검증·정보·중립 (또는 영문)';
      for (const [ln, l] of filled) {
        const f = split(l);
        if (f.length > fixed) warn(ln, '구조', `${fb.kind} 칸 ${f.length}개 — 최대 ${fixed}개. 남는 칸은 설명 뒤에 " | "로 붙어 표시됨 (글자 | 를 쓰려면 \\|)`);
        const t = f[fixed - 1];
        if (t && !ok.test(t)) warn(ln, '구조', `${name} "${t}" — ${allowed} 중 하나. 모르는 이름은 설명 뒤에 글자로 붙어 표시됨`);
      }
    };
    let fb = null;
    for (let i = start; i < lines.length; i++) {
      const l = lines[i], fm = l.match(/^(`{3,})\s*([^\s`]*)/);
      if (!fb) { if (fm) fb = { len: fm[1].length, kind: fm[2], open: i, body: [] }; continue; }
      if (fm && fm[1].length >= fb.len && /^`{3,}\s*$/.test(l)) { check(fb); fb = null; continue; }
      fb.body.push([i, l]);
    }
  }

  // 규칙 1: audience: external 이면 내부 식별자 검사
  if (/^external$/i.test((meta.audience || '').trim())) {
    const extra = (meta.redact || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    const pats = [
      // 브랜치는 슬래시 경로만(feature/x, release/1.2). dev-server, release-1.2 같은 일상 단어는 안 잡음
      [/\b(feature|fix|bugfix|hotfix|release|stg|dev)\/[\w.-]+/i, '브랜치명'],
      [/\bstg-v\d+\b/i, '브랜치명'],
      [/\b[\w-]+\.(internal|local|corp|lan|intra)\b/i, '내부 호스트'],
      // IP: 각 옥텟 0~255, 앞에 v/version 이 붙은 버전 표기는 제외
      [/(?<![\w.]|v)\b((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)\b(?![\w.])/, 'IP 주소'],
      [/\b[A-Z]{1,3}\d{5,7}\b/, '사번 형태'],
      ...extra.map(w => [new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), 'redact 목록']),
    ];
    if (meta.branch) warn(0, 1, `외부 공유 문서에 frontmatter branch "${meta.branch}" — 지우기 (메타 pill에 그대로 찍힘)`);
    let code = false;
    for (let i = start; i < lines.length; i++) {
      const l = lines[i];
      if (/^`{3,}/.test(l)) { code = !code; continue; }
      if (code) continue;
      for (const [re, what] of pats) { const m = l.match(re); if (m) warn(i, 1, `외부 공유 문서에 ${what} "${m[0]}" — 제거하거나 일반화`); }
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

module.exports = { lint, report };

if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('-'));
  if (!file) { console.error('usage: node lint.js <report.md> [--strict]'); process.exit(1); }
  let src;
  try { src = fs.readFileSync(file, 'utf8'); }
  catch (e) { console.error(`lint: 입력 파일을 읽을 수 없음 — ${file} (${e.code || e.message})`); process.exit(2); }
  const errors = report(file, lint(src));
  process.exit(args.includes('--strict') && errors ? 1 : 0);
}
