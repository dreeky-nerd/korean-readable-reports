#!/usr/bin/env node
'use strict';
// 동작 회귀 시험: node scripts/test.js — 임시 폴더에만 쓰고 사용자 보고서는 건드리지 않는다.
// 기본 모드(이 스킬의 문체 규칙)와 --plain 모드(문체 규칙 없이 렌더만, report-team 등 다른 스킬용)를 함께 확인한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {lint} = require('./lint.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krr-test-'));
const renderer = path.join(__dirname, 'render.js');
let passed = 0, failed = 0, skipped = 0, seq = 0;
// 이 OS에서 시험 조건을 만들 수 없으면 실패가 아니라 건너뜀(Windows: 폴더 chmod가 쓰기를 막지 못함, 심볼릭 링크는 관리자 권한 필요)
const skip = reason => { const e = new Error(reason); e.skip = true; throw e; };
const fm = '---\ntitle: 시험 문서\ndate: 2026-09-22\naudience: team\n---\n';
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) {
    if (e.skip) { skipped++; console.log('SKIP ' + name + ' — ' + e.message); return; }
    failed++; console.log('FAIL ' + name + '\n  ' + e.message.split('\n').slice(0, 4).join('\n  '));
  }
}
function render(body, args = [], metadata = fm) {
  const input = path.join(dir, 'case-' + (++seq) + '.md');
  fs.writeFileSync(input, metadata + body);
  const output = input.replace(/\.md$/, '.html');
  const result = spawnSync(process.execPath, [renderer, input, '--offline', ...args], {encoding: 'utf8'});
  return {...result, input, output, html: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : ''};
}
const plain = (body, args = [], metadata) => render(body, ['--plain', ...args], metadata);
const run = (...args) => spawnSync(process.execPath, [renderer, ...args], {encoding: 'utf8'});
const rules = (doc, opts) => lint(doc, opts).map(f => f.rule);

// 스케줄 대기는 빼고, 10배 입력의 CPU 증가율을 본다(선형이면 약 10배, 2차면 약 100배).
// 작은 입력은 1ms 안팎이라 시계 눈금(Windows는 약 15ms)보다 작다 — 누적 50ms가 넘을 때까지
// 반복 횟수를 늘리고, 큰 입력도 같은 횟수만 한 구간에서 잰다. measure(n, reps)는 reps번의 CPU 합(µs).
function cpuTime(fn) {
  const start = process.cpuUsage();
  fn();
  const used = process.cpuUsage(start);
  return used.user + used.system;
}
function assertLinearTime(name, measure, n = 5000) {
  let reps = 1, small;
  while ((small = measure(n, reps)) < 50000 && reps < 1024) reps *= 2;
  let best = Infinity, detail = '';
  for (let round = 0; round < 3 && best >= 25; round++) {   // 부하로 한 번 흔들려도 다시 잰다
    if (round) small = measure(n, reps);
    const large = measure(n * 10, reps);
    if (large / small < best) { best = large / small; detail = `${small}→${large}µs, ${reps}회`; }
  }
  assert.ok(best < 25, `${name}: 입력 10배에 CPU ${best.toFixed(1)}배 (${detail}, 한도 25배)`);
}
const repeat = (reps, fn) => () => { for (let i = 0; i < reps; i++) fn(); };

// ── lint: 기본 모드와 --plain 모드 ─────────────────────────────────────────
test('plain: 개조식·긴 목차·여러 문장 허용', () => {
  const doc = fm + '# 제목\n' + Array.from({length: 9}, (_, i) => '\n## 항목 ' + i + '\n\n- 담당자 배정\n\n확인했다. 예외가 있다.').join('\n');
  assert.deepEqual(lint(doc, {plain: true, renderer: true}), []);
});
test('기본: 같은 문서에 문체 규칙 경고', () => {
  const doc = fm + '# 제목\n' + Array.from({length: 9}, (_, i) => '\n## 항목 ' + i + '\n\n- 담당자 배정\n\n확인했다. 예외가 있다.').join('\n');
  const r = rules(doc);
  for (const id of [2, 4, 8, 11, 13]) assert.ok(r.includes(id), '규칙 ' + id + ' 없음: ' + r);
});
test('plain: 일반 검사는 메타데이터 강제 안 함', () => assert.deepEqual(lint('# 제목\n본문', {plain: true}), []));
test('plain: 렌더 검사에는 제목·기준일·독자 필수', () => assert.equal(lint('# 제목', {plain: true, renderer: true}).filter(f => f.rule === 'fm').length, 3));
test('잘못된 날짜 거부', () => {
  const bad = fm.replace('2026-09-22', '2026-02-30');
  assert.ok(lint(bad).some(f => f.rule === 'fm'));
  assert.ok(lint(bad, {plain: true}).some(f => f.rule === 'fm'));
});
test('닫히지 않은 frontmatter 검출', () => assert.ok(lint('---\ntitle: 시험', {plain: true}).some(f => f.rule === '구조')));
test('접힌 상세 안의 표 오류 검출', () => {
  const doc = fm + '<details>\n<summary>상세</summary>\n\n| A | B |\n| --- | --- |\n| 하나 |\n\n</details>';
  assert.ok(lint(doc, {plain: true, renderer: true}).some(f => /칸/.test(f.msg)));
  assert.ok(lint(doc).some(f => /칸/.test(f.msg)));
});
test('물결표 펜스 안은 코드로 취급', () => {
  const doc = fm + '# 제목\n\n~~~text\n| 깨진 | 표\n~~~\n';
  assert.ok(!lint(doc, {plain: true, renderer: true}).some(f => /칸|구분 행/.test(f.msg)));
});
test('닫히지 않은 물결표 펜스 검출', () => assert.ok(lint(fm + '~~~\n코드', {plain: true}).some(f => /닫히지 않/.test(f.msg))));
test('외부 메타·코드·접힌 상세 식별자 검사, 값은 출력 안 함', () => {
  const doc = fm.replace('team', 'external').replace('title: 시험 문서', 'title: service.internal') + '```\nfeature/private\n```\n<details>\n<summary>상세</summary>\n\n/Users/person/private\n\n</details>';
  for (const opts of [{plain: true}, {}]) {
    const f = lint(doc, opts).filter(x => x.rule === 1);
    assert.equal(f.length, 3, JSON.stringify(f)); assert.ok(!JSON.stringify(f).includes('service.internal')); assert.ok(!JSON.stringify(f).includes('feature/private'));
  }
});
test('redact 지정 문자열은 코드에서도 검출', () => {
  const doc = fm.replace('team', 'external').replace('title:', 'redact: SOME_SECRET\ntitle:') + '```\nSOME_SECRET\n```';
  assert.ok(lint(doc, {plain: true}).some(f => /redact/.test(f.msg)));
});
test('plain: 코드 위치는 --reader-review일 때만', () => {
  const doc = fm + '# 제목\n\nsrc/app.js:42 에서 실패했다.';
  assert.ok(!lint(doc, {plain: true}).some(f => f.rule === 6));
  assert.ok(lint(doc, {plain: true, readerReview: true}).some(f => f.rule === 6));
});
test('flow 역할·빈 블록·초과 칸 검사', () => {
  assert.ok(lint(fm + '```flow\n이름 | 설명 | unknown\n```', {plain: true}).some(f => /역할/.test(f.msg)));
  assert.ok(lint(fm + '```cards\n```', {plain: true}).some(f => /빈/.test(f.msg)));
  assert.ok(lint(fm + '```stats\n라벨 | 값 | 설명 | 완료 | 초과\n```', {plain: true}).some(f => /칸/.test(f.msg)));
});
test('잘못된 테마 값 검사', () => assert.ok(lint(fm.replace('---\n', '---\ntheme: sepia\n'), {plain: true, renderer: true}).some(f => f.rule === 'fm')));

// ── 규칙 2: 빈 예고·제목 반복·수정 과정 ────────────────────────────────────
const bluf = (body, opts) => lint(fm + body, opts)
  .filter(f => f.rule === 2 && !/요약 박스/.test(f.msg));
const blufCases = [
  ['자기 문서 예고', false,
    ['이 섹션에서는 비용을 다룹니다.', '본 보고서에서는 결과를 정리합니다.'],
    ['이 문서에서는 결제 모듈은 다루지 않습니다.', '이 서비스에서는 요청을 처리합니다.']],
  ['표·그림 예고', true,
    ['아래 표는 비용을 비교합니다.', '다음 목록에서는 실패 원인을 정리합니다.'],
    ['아래 표에서 비용이 20% 줄었습니다.', '다음 요청에서는 캐시를 비웁니다.']],
  ['제목 반복', true,
    ['## 오류 처리 현황\n오류 처리는 오류 처리 현황입니다.', '## API 비용\nAPI 비용은 API 비용이다.'],
    ['## 오류 처리\n오류 처리는 재시도를 포함합니다.', '## API 비용\nAPI 비용은 월별 사용량입니다.']],
  ['수정 과정', true,
    ['처음에는 자동이라고 썼다가 바꿨습니다.', '초안에서는 처리 순서를 수정했습니다.'],
    ['처음에는 캐시를 확인했습니다.', '초안에서 정의한 조건을 검증했습니다.']],
];
for (const [name, hint, positives, negatives] of blufCases) {
  test(`규칙 2: ${name} 최소쌍과 hint`, () => {
    for (const body of positives) {
      const found = bluf(body);
      assert.equal(found.length, 1, body);
      assert.equal(found[0].hint, hint, body);
    }
    for (const body of negatives) assert.deepEqual(bluf(body), [], body);
  });
}
test('규칙 2: 지정한 예고·수정 과정 활용형', () => {
  for (const subject of ['이 섹션', '본 절', '이 장', '본 문서', '이 보고서', '본 글']) {
    for (const verb of ['다룹니다', '살펴봅니다', '살펴보겠습니다', '정리합니다', '설명합니다', '알아봅니다', '소개합니다', '다루겠습니다']) {
      assert.equal(bluf(`${subject}에서는 결과를 ${verb}.`)[0]?.hint, false, `${subject} ${verb}`);
    }
  }
  for (const noun of ['표', '그림', '목록', '도표', '다이어그램', '흐름도']) {
    for (const [prefix, particle, verb] of [['아래', '는', '비교합니다'], ['다음', '은', '정리합니다'], ['위', '에서는', '보여 줍니다'], ['위의', '에서', '보여줍니다'], ['아래', '는', '나타냅니다']]) {
      assert.equal(bluf(`${prefix} ${noun}${particle} 결과를 ${verb}.`)[0]?.hint, true);
    }
  }
  for (const verb of ['썼습니다', '적었습니다', '작성했습니다']) assert.equal(bluf(`처음에는 결과를 ${verb}.`)[0]?.hint, true);
  for (const verb of ['고쳤습니다', '바꿨습니다', '수정했습니다']) assert.equal(bluf(`초안에서 결과를 ${verb}.`)[0]?.hint, true);
  for (const body of ['이 문서에서는 결제를 다루지 않습니다.', '본 보고서에서는 비용을 정리하지 않습니다.', '결과를 확인했습니다.', '먼저 결론입니다. 이 문서에서는 결제를 다루지 않습니다.']) assert.deepEqual(bluf(body), [], body);
});
test('규칙 2: plain에서는 네 유형 모두 비활성', () => {
  for (const [, , positives] of blufCases) {
    for (const body of positives) assert.deepEqual(lint(fm + body, {plain: true}).filter(f => f.rule === 2), [], body);
  }
});
test('규칙 2: 코드·인용·근거·글 블록 펜스 제외 및 줄 번호', () => {
  const sentences = blufCases.flatMap(([, , positives]) => positives);
  for (const body of sentences) {
    for (const wrapped of [
      `\`\`\`text\n${body}\n\`\`\``, `~~~\n${body}\n~~~`, `\`${body.replace(/\n/g, ' ')}\``,
      `"${body.replace(/\n/g, ' ')}"`, `'${body.replace(/\n/g, ' ')}'`, `‘${body.replace(/\n/g, ' ')}’`,
      `“\n${body}\n”`, `「\n${body}\n」`, `『\n${body}\n』`,
      body.split('\n').map(l => '근거: ' + l).join('\n'),
      `\`\`\`flow ${body.replace(/\n/g, ' ')}\n노드 | 결과 | done\n\`\`\``,
    ]) assert.deepEqual(bluf(wrapped), [], wrapped);
  }
  const doc = fm + '“인용 시작\n이 섹션에서는 비용을 다룹니다.\n”\n이 섹션에서는 결과를 설명합니다.';
  const found = lint(doc).filter(f => f.rule === 2 && !/요약 박스/.test(f.msg));
  assert.equal(found.length, 1); assert.equal(found[0].line, 9);
});
test('규칙 2: 제목 반복은 H2 첫 문장만, 새 정보·다른 구조 제외', () => {
  for (const body of [
    '## 오류 처리\n오류 처리는 재시도를 포함합니다. 오류 처리는 오류 처리입니다.',
    '## 오류 처리\n재시도를 지원합니다.\n오류 처리는 오류 처리입니다.',
    '## 오류 처리\n### 오류 처리\n오류 처리는 오류 처리입니다.',
    '# 오류 처리\n오류 처리는 오류 처리입니다.',
    '## 오류 처리\n오류 처리는 20ms 빨라졌습니다.',
    '## API 비용\nAPI 비용은 30%입니다.',
    '## 월 비용\n월 비용은 100원입니다.',
    '## 비용\n비용은 20입니다.',
    '## 비용\n비용은 “월별 사용량”입니다.',
    '## 비용\n비용은 `사용량`입니다.',
  ]) assert.deepEqual(bluf(body), [], body);
  assert.equal(bluf('## 오류 처리\n\n오류 처리는 오류 처리입니다. 새 정보가 뒤에 옵니다.')[0]?.hint, true);
});
test('규칙 2: 글 블록은 펜스 줄만 제외하고 본문은 검사', () => {
  for (const kind of ['flow', 'stats', 'cards']) {
    assert.equal(bluf(`\`\`\`${kind}\n이 섹션에서는 비용을 다룹니다.\n\`\`\``)[0]?.hint, false, kind);
  }
});
test('규칙 2: 단순 낱말 비교의 알려진 미검출', () => {
  for (const body of [
    '## 오류 처리\n오류 처리는 다음과 같습니다.', // 서술 틀·불용어까지 해석하지 않는다
    '## 권한 검사\n권한 검사는 권한을 검사합니다.', // 동사 어간을 복원하지 않는다
    '## 오류 처리\n오류 처리에 관하여\n오류 처리는 오류 처리입니다.', // 여러 줄 문장을 합치지 않는다
  ]) assert.deepEqual(bluf(body), [], `알려진 미검출: ${body}`);
});
test('규칙 2: 2자 미만 새 낱말은 제목 반복의 알려진 오탐', () => {
  // 명시한 2자 이상 낱말만 비교하므로 새 정보인 한 글자 "앱"을 구분하지 못한다.
  const found = bluf('## 배포 대상\n배포 대상은 앱입니다.');
  assert.equal(found.length, 1); assert.equal(found[0].hint, true);
});

// ── 규칙 14: HEAD 최상위 대안 9 + BODY 19 + SOFT 2 + COUNTED 4 + MIX 3 = 37 ──
// 각 행은 [패턴 ID, 메시지 식별자, 걸릴 문장, 정상 문장, 힌트 여부]. 다른 규칙의 경고는 제외한다.
test('규칙 14: 37개 패턴별 최소쌍', () => {
  const pairs = [
    ['H1 지나가는 길', /소제목 은유/, '## 요청이 지나가는 길', '## 요청 처리 흐름'],
    ['H2 의 여정', /소제목 은유/, '## 데이터의 여정', '## 데이터 전달 과정'],
    ['H3 이렇게 돌아간다', /소제목 은유/, '## 서비스는 이렇게 돌아간다', '## 서비스 동작 방식'],
    ['H4 어떻게 돌아가', /소제목 은유/, '## 인증은 어떻게 돌아가는가', '## 인증 처리 절차'],
    ['H5 의 모든 것', /소제목 은유/, '## 인증의 모든 것', '## 인증 설정 항목'],
    ['H6 한눈에 보는', /소제목 은유/, '## 한눈에 보는 서버 구성', '## 서버 구성 현황'],
    ['H7 속살', /소제목 은유/, '## API의 속살', '## API 내부 구조'],
    ['H8 해부', /소제목 은유/, '## 인증 모듈 해부', '## 해부학 영상 처리 성능'],
    ['H9 지도', /소제목 은유/, '## 테이블 지도', '## 도로 지도'],
    ['B1 의인화', /의인화/, '요청이 서버를 지나갑니다.', '요청을 서버에서 처리합니다.'],
    ['B2 조립', /번역투 —/, '응답 데이터를 다시 조립합니다.', '조립 라인에서 서버를 조립합니다.'],
    ['B3 창구', /은유 —/, '서비스가 API 창구를 열었습니다.', '서비스가 API를 제공합니다.'],
    ['B4 뽑아내다', /구어체 —/, '로그에서 오류 코드를 뽑아냅니다.', '로그에서 오류 코드를 추출합니다.'],
    ['B5 강조어', /구어체 강조어/, '응답이 진짜 빠릅니다.', '진짜 사용자 데이터로 다시 재현했습니다.'],
    ['B6 예고', /예고 문장/, '역할을 나누면 이렇습니다.', '역할은 인증과 저장으로 나뉩니다.'],
    ['B7 괄호 풀이', /비유를 괄호로 풀이/, '기계(코드)를 교체합니다.', '응답(JSON 데이터)은 그대로 반환합니다.'],
    ['B8 에 의해', /번역투\(3% \/ 29%\)/, '토큰은 서버에 의해 발급됩니다.', '서버가 토큰을 발급합니다.'],
    ['B9 이중 피동', /이중 피동/, '설정이 변경되어집니다.', '설정이 변경됩니다.'],
    ['B10 위해서는', /번역투 —/, '갱신하기 위해서는 인증해야 합니다.', '갱신하려면 인증해야 합니다.'],
    ['B11 선택적', /번역투\(optional\)/, '선택적 파라미터를 생략합니다.', '선택 파라미터를 생략합니다.'],
    ['B12 가지다', /번역투\(have\)/, '권한을 가진 사용자가 호출합니다.', '테스트 서버를 가지고 재현했습니다.'],
    ['B13 자동 조사', /자동 조사/, '파일을(를) 선택합니다.', '파일을 선택합니다.'],
    ['B14 바랍니다', /업무 관용투\(20% \/ 4%\)/, '설정을 확인하시기 바랍니다.', '설정을 확인해 주세요.'],
    ['B15 것이 가능', /업무 관용투 —/, '조회하는 것이 가능합니다.', '조회할 수 있습니다.'],
    ['B16 하도록', /업무 관용투 —/, '확인하도록 하겠습니다.', '확인하겠습니다.'],
    ['B17 진행 수행', /명사를 동사로/, '검증을 진행합니다.', '검증합니다.'],
    ['B18 파라메터', /표기 —/, '파라메터를 전달합니다.', '파라미터를 전달합니다.'],
    ['B19 어플리케이션', /표기 —/, '어플리케이션을 배포합니다.', '애플리케이션을 배포합니다.'],
    ['S1 사물 주어', /사물 주어/, '이 API는 인증을 요구합니다.', '이 API를 호출하려면 인증해야 합니다.', true],
    ['S2 영어 하다', /영어 낱말/, '파일을 Open 하시면 됩니다.', '파일을 열면 됩니다.', true],
    ['C1 해당', /"해당" 4회/, '해당 오류를 확인합니다.\n'.repeat(4), '해당 오류를 확인합니다.\n'.repeat(3), true],
    ['C2 에 대한', /"에 대한" 4회/, '오류에 대한 설명입니다.\n'.repeat(4), '오류에 대한 설명입니다.\n'.repeat(3), true],
    ['C3 를 통해', /"를 통해" 4회/, 'API를 통해 조회합니다.\n'.repeat(4), 'API를 통해 조회합니다.\n'.repeat(3), true],
    ['C4 로 인해', /"로 인해" 4회/, '지연으로 인해 실패했습니다.\n'.repeat(4), '지연으로 인해 실패했습니다.\n'.repeat(3), true],
    ['M1 오류 에러', /용어 섞임/, '오류를 기록합니다.\n에러를 집계합니다.', '오류를 기록합니다.\n오류를 집계합니다.'],
    ['M2 반환 리턴', /용어 섞임/, '응답을 반환합니다.\n결과를 리턴합니다.', '응답을 반환합니다.\n결과를 반환합니다.'],
    ['M3 파라미터 매개변수', /용어 섞임/, '파라미터를 검사합니다.\n매개변수를 전달합니다.', '파라미터를 검사합니다.\n파라미터를 전달합니다.'],
  ];
  assert.equal(pairs.length, 37);
  const errors = [];
  for (const [id, message, positive, negative, hint = false] of pairs) {
    for (const [sentence, expected] of [[positive, true], [negative, false]]) {
      const findings = lint(fm + sentence).filter(f => f.rule === 14);
      try {
        assert.equal(findings.length, expected ? 1 : 0);
        if (expected) { assert.match(findings[0].msg, message); assert.equal(findings[0].hint, hint); }
      } catch (e) { errors.push(`${id}: ${JSON.stringify(sentence)} → ${JSON.stringify(findings)} (${e.message.replace(/\n/g, ' ')})`); }
    }
  }
  assert.equal(errors.length, 0, errors.join(' | '));
});

test('규칙 14: 추가 오탐 반례와 문맥 유지', () => {
  const pairs = [
    ['H8 실제 해부', '## 인증 모듈 해부', '## 인체 해부 영상 처리'],
    ['H9 물리 지도', '## 서비스 지도', '## 지형 지도'],
    ['B1 실제 전송', '메시지가 흘러갑니다.', '패킷은 라우터를 지나갑니다.'],
    ['B2 대상 경계', '쿼리를 조립합니다.', '데이터센터에서 서버를 조립합니다.'],
    ['B5 부사', '진짜 잘 동작합니다.', '진짜 데이터로 검증합니다.'],
    ['B7 단어 경계', '상품(설정값)을 바꿉니다.', '파일(메타데이터)을 보관합니다.'],
    ['B12 가지고 있다', '리프레시 토큰을 가지고 있어야 합니다.', '테스트 서버를 갖고 재현했습니다.'],
    ['B12 단어 경계', '권한을 가진 사용자가 조회합니다.', '시험 신호를 가진기에 입력합니다.'],
    ['B8 논리 근거', '토큰은 서버에 의해 발급됩니다.', '드모르간 법칙에 의해 두 집합이 같습니다.'],
    ['B17 의미 수식', '검증을 수행합니다.', '이진 트리 중위 순회를 수행합니다.'],
    // 허용 목록이 아니라 정상 용법만 빼는 제외 목록 — 잡아야 할 명사가 목록 밖이라 놓치지 않게(Claude 검수 2026-10-17)
    ['H8 제외 목록', '## 요청 흐름 해부', '## 인체 해부학 실습'],
    ['H9 제외 목록', '## 등록 정보 지도', '## 관광 지도'],
    ['B17 제외 목록: 행사', '문서화를 진행합니다.', '주간 회의를 진행합니다.'],
    ['B17 제외 목록: 연산', '작업을 진행했습니다.', '행렬 연산을 수행합니다.'],
    ['M2 다른 개념', '응답을 반환하고 결과를 리턴합니다.', '배열을 반환하고 RF 리턴 로스를 측정합니다.'],
    ['M3 다른 개념', '파라미터와 매개변수를 검사합니다.', '하이퍼파라미터는 3개이며 함수 매개변수는 2개입니다.'],
  ];
  for (const [id, positive, negative] of pairs) {
    for (const [sentence, expected] of [[positive, true], [negative, false]]) {
      assert.equal(lint(fm + sentence).some(f => f.rule === 14), expected, `${id}: ${sentence}`);
    }
  }
});

test('규칙 14: COUNTED 단어 경계와 MIX 각 표기', () => {
  for (const sentence of ['비해당 항목은 제외합니다.', '이 업체에 대한항공 운항 자료를 전달합니다.', '해당 없음', '해당 사항 없음']) {
    assert.deepEqual(lint(fm + (sentence + '\n').repeat(4)).filter(f => f.rule === 14), [], sentence);
  }
  for (const sentence of ['오류를 기록합니다.', '에러를 기록합니다.', '응답을 반환합니다.', '응답을 리턴합니다.', '파라미터를 전달합니다.', '매개변수를 전달합니다.', '매개 변수를 전달합니다.']) {
    assert.deepEqual(lint(fm + sentence).filter(f => f.rule === 14), [], sentence);
  }
  for (const sentence of ['파라미터와 매개 변수를 검사합니다.', '매개변수와 매개 변수를 검사합니다.']) {
    const findings = lint(fm + sentence).filter(f => f.rule === 14);
    assert.ok(findings.length && findings.every(f => !f.hint && /용어 섞임/.test(f.msg)), sentence);
  }
});

test('규칙 14: 인용·코드·링크 주소 제외, 글 블록·링크 표시는 검사', () => {
  for (const sentence of ['## “요청의 여정” 인용 분석', '"데이터를 조립합니다."', '`어플리케이션`', '```text\n어플리케이션\n```', '[설명서](https://example.org/어플리케이션)', '[설명서](https://example.org/(어플리케이션))', '오류 문서는 [참고](https://example.org/리턴)에 있습니다. 반환값을 확인합니다.']) {
    assert.deepEqual(lint(fm + sentence).filter(f => f.rule === 14), [], sentence);
  }
  for (const sentence of ['[어플리케이션](https://example.org)', '```flow\n어플리케이션 | 배포 | done\n```', '```stats\n어플리케이션 | 3개 | 배포 | 완료\n```', '```cards\n어플리케이션\n배포합니다.\n```']) {
    assert.ok(lint(fm + sentence).some(f => f.rule === 14 && /표기/.test(f.msg)), sentence);
  }
});

test('규칙 14: 측정된 한국어 AI 문형 4종은 힌트(경고 아님)', () => {
  const hint = (doc, re) => lint(fm + doc).filter(f => f.rule === 14 && re.test(f.msg));
  // 부정 대구 "A가 아니라 B": 2회부터 힌트, 1회는 정당한 정정일 수 있어 통과. "뿐만 아니라"는 다른 구문
  assert.equal(hint('원인은 캐시가 아니라 DB입니다.', /부정 대구/).length, 0);
  const pair = hint('원인은 캐시가 아니라 DB입니다.\n\n문제는 코드가 아니라 설정이었습니다.', /부정 대구/);
  assert.equal(pair.length, 1); assert.ok(pair[0].hint);
  assert.equal(hint('인증뿐만 아니라 권한도 봅니다.\n\n로그뿐 아니라 지표도 봅니다.', /부정 대구/).length, 0);
  // 역방향 결산 "~하는 이유다": 1회부터 힌트
  for (const s of ['설정을 바꿔도 반영이 안 되는 이유가 이것입니다.', '이것이 재시도가 늘어난 이유다.', '그게 캐시를 끈 이유입니다.']) assert.equal(hint(s, /이유/).length, 1, s);
  for (const s of ['실패 이유는 세 가지입니다.', '이유를 로그에서 확인했습니다.']) assert.equal(hint(s, /이유/).length, 0, s);
  // 분열문 "핵심은 ~이다": 2회부터
  assert.equal(hint('핵심은 재시도 횟수입니다.', /분열문/).length, 0);
  assert.equal(hint('핵심은 재시도 횟수입니다.\n\n문제는 타임아웃 설정입니다.', /분열문/).length, 1);
  assert.equal(hint('문제는 없었습니다.\n\n문제는 없었습니다.', /분열문/).length, 0);
  // 범위 상승 "단순한 X를 넘어": 1회부터
  assert.equal(hint('단순한 목록을 넘어 대출 기록 저장소로 씁니다.', /범위 상승/).length, 1);
  assert.equal(hint('요청 수가 한도를 넘어 실패했습니다.', /범위 상승/).length, 0);
  // 코드·따옴표 안은 남의 말 — 여러 줄 인용과 「」도
  assert.equal(hint('"캐시가 아니라 DB" 라는 제목\n\n`A가 아니라 B`', /부정 대구/).length, 0);
  assert.equal(hint('“원인은 캐시가 아니라 DB입니다.\n문제는 코드가 아니라 설정입니다.”라고 설명했습니다.', /부정 대구/).length, 0);
  assert.equal(hint('담당자는 「원인은 캐시가 아니라 DB입니다. 문제는 코드가 아니라 설정입니다」라고 답했습니다.', /부정 대구/).length, 0);
  // codex 검수(2026-10-17)에서 나온 오탐·미검출
  for (const s of ['실패 이유가 바로 로그에 기록됩니다.', '실패 이유가 여기저기 흩어져 있어 로그를 모았습니다.', '이 필드는 사용자가 선택한 이유입니다.']) assert.equal(hint(s, /이유/).length, 0, s);
  for (const s of ['이것이 캐시를 유지하는 이유였다.', '캐시를 유지하는 이유가 바로 여기에 있다.', '그래서 재시도가 필요한 이유입니다.']) assert.equal(hint(s, /이유/).length, 1, s);
  for (const s of ['단순한 계산으로 구한 값을 넘어선 측정치는 제외했습니다.', '단순히 요청 수가 한도를 넘어서면 연결을 닫습니다.']) assert.equal(hint(s, /범위 상승/).length, 0, s);
  assert.equal(hint('로그뿐  아니라 지표도 확인했습니다.\n\n설정뿐  아니라 환경 변수도 확인했습니다.', /부정 대구/).length, 0);
  assert.equal(hint('원인은 캐시가 아니라\nDB입니다.\n\n문제는 코드가 아니라 설정입니다.', /부정 대구/).length, 1);
  assert.equal(hint('중요한 점은 장애 격리이다.\n\n핵심은 속도다.', /분열문/).length, 1);
  assert.equal(hint('필요한 것은 없는 레코드를 추가하는 일입니다.\n\n핵심은 속도입니다.', /분열문/).length, 1);
});

// ── 2026-10-19 추가: im-not-ai 분류·linkedin-agent-skill li-human에서 가져온 마무리 틀과 횟수 힌트 ──
test('규칙 14: 마무리 틀(1회)과 번역투·보고서 말투(4회부터)는 힌트', () => {
  const hint = (doc, re) => lint(fm + doc).filter(f => f.rule === 14 && re.test(f.msg));
  // 마무리 틀 — 문장 첫머리만. 문장 중간의 "종합하면"·조건의 "요약하면"은 통과
  for (const s of ['결론적으로, 캐시를 켜야 합니다.', '요컨대 연결 수가 모자랐습니다.', '- 종합하면 설정 문제입니다.', '오류가 줄었습니다. 한마디로 성공입니다.']) assert.equal(hint(s, /마무리 틀/).length, 1, s);
  for (const s of ['두 지표를 종합하면 결과가 같습니다.', '요약하면 다음과 같은 표가 됩니다.', '결론을 먼저 씁니다.']) assert.equal(hint(s, /마무리 틀/).length, 0, s);
  assert.equal(hint('이번 장애는 시사하는 바가 큽니다.', /과장 관용구/).length, 1);
  assert.equal(hint('로그가 시사하는 원인은 타임아웃입니다.', /과장 관용구/).length, 0);
  for (const s of ['이제 결정할 때입니다.', '지금이 구조를 바꿀 시점입니다.']) assert.equal(hint(s, /완결 공식/).length, 1, s);
  for (const s of ['배포할 때 이 값을 바꿉니다.', '재시작할 때입니다라는 메시지가 뜹니다.']) assert.equal(hint(s, /완결 공식/).length, 0, s);
  // 횟수 힌트 — 3회까지는 통과, 4회부터
  const pairs = [
    ['에 있어서', '운영에 있어서 중요합니다.\n', '서버에 있어서 지울 수 없습니다.\n'],
    ['라는 점에서', '재현된다는 점에서 의미가 있습니다.\n', '재현되므로 의미가 있습니다.\n'],
    ['와 관련하여', '결제와 관련하여 문의합니다.\n', '결제 관련 문의입니다.\n'],
    ['이루어지다', '배포가 이루어집니다.\n', '배포합니다.\n'],
    ['할 필요가 있다', '재시작할 필요가 있습니다.\n', '재시작해야 합니다.\n'],
    ['이는', '캐시가 꺼졌습니다. 이는 설정 문제입니다.\n', '캐시가 꺼진 것은 설정 문제입니다.\n'],
    ['즉,', '연결이 끊깁니다. 즉, 재시도가 필요합니다.\n', '연결이 끊기면 재시도해야 합니다.\n'],
  ];
  for (const [name, bad, good] of pairs) {
    const re = new RegExp('"' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '" 4회');
    assert.equal(hint(bad.repeat(4), re).length, 1, name + ' 4회');
    assert.ok(hint(bad.repeat(4), re)[0].hint, name + ' 힌트');
    assert.equal(hint(bad.repeat(3), re).length, 0, name + ' 3회');
    assert.equal(hint(good.repeat(4), /회 — 3회 이하로/).length, 0, name + ' 정상 문장: ' + good.trim());
  }
});

// ── 2026-10-21 추가: "글이 많고 AI가 쓴 느낌" 평을 받은 보고서 한 건에서 잰 네 가지 ──
test('규칙 14: 강조용 따옴표 5곳부터 힌트, 인용 표지·전후 예문·완결 문장은 인용', () => {
  const hint = doc => lint(fm + doc).filter(f => f.rule === 14 && /따옴표/.test(f.msg));
  const scare = ['"가장 큰 영향"을 보장하지는 않습니다.', '"자료를 읽고 추리하는" 게임입니다.', '"PC에서 바로 실행"과 거리가 있습니다.', '"Boxleiter 방식" 배수는 다릅니다.', '"한국어 리뷰"는 작성 언어입니다.'];
  const f = hint(scare.join('\n'));
  assert.equal(f.length, 1); assert.ok(f[0].hint); assert.match(f[0].msg, /5곳/); assert.match(f[0].msg, /가장 큰 영향/);
  assert.equal(hint(scare.slice(0, 4).join('\n')).length, 0, '4곳까지는 통과');
  const quoted = ['회사는 "한 자릿수"라고 밝혔습니다.', '티켓 "로그인 오류"라는 제목입니다.', '담당자는 "내일 배포합니다."라고 했습니다.', '"해당 API" → "주문 조회 API"로 고칩니다.', '> "원문 인용"을 그대로 둡니다.', '화면에 "저장됨"이 뜹니다.'];
  assert.equal(hint([...quoted, ...quoted].join('\n')).length, 0, '인용 표지가 있으면 강조가 아님');
  // 페르소나·사용자 발화는 말끝으로 끝난다(표본 677건 중 걸린 169건의 표본 10건 중 7건)
  const speech = ['페르소나는 "이미 확인했어요" 하고 넘어갔습니다.', '반응은 "어디로 좁혀야 하는지 모르겠다"였습니다.', '"네, 맞아요" 뒤에 멈췄습니다.', '상태는 "확인 안 됨"으로 남았습니다.', '"다음엔 뭘 하죠?" 질문이 나왔습니다.', '"무엇이 무너졌나" 질문입니다.', '라이선스는 "All rights reserved" 표기입니다.'];
  assert.equal(hint(speech.join('\n')).length, 0, '발화 인용');
  assert.equal(hint(Array(5).fill('| 김 대리 | "로그 위치" |').join('\n')).length, 0, '표 칸 전체가 인용');
  assert.equal(hint(scare.map(s => '`' + s + '`').join('\n')).length, 0, '코드 안');
});
test('규칙 8: 괄호 단서가 많으면 힌트 — 조건은 근거 줄로', () => {
  const hint = doc => lint(fm + doc).filter(f => f.rule === 8 && /괄호/.test(f.msg));
  const heavy = '이용자 약 3천만 명(홍보 문구, 측정 시점 미공개)이고 비중은 1.37%(자발적 익명 설문 기준)입니다.';
  const f = hint(Array(3).fill(heavy).join('\n'));
  assert.equal(f.length, 1); assert.ok(f[0].hint); assert.match(f[0].msg, /3줄/);
  assert.equal(hint(Array(2).fill(heavy).join('\n')).length, 0, '두 줄까지는 통과');
  const light = '요청 URL(엔드포인트)을 부릅니다. 기본값(10)이 쓰입니다. 한 페이지 결과 수(기본값 10)입니다.';
  assert.equal(hint(Array(6).fill(light).join('\n')).length, 0, '짧은 풀이·기본값 괄호');
  assert.equal(hint('근거: 홍보 문구(측정 시점 미공개), 설문(자발적 익명 응답 기준)\n'.repeat(5)).length, 0, '근거 줄은 조건을 두는 곳');
  const many = Array.from({length: 12}, (_, k) => `지표 ${k}는 올랐습니다(표본 ${k}명 기준 집계).`).join('\n');
  assert.equal(hint(many).length, 1, '문서 전체 12곳');
});
test('규칙 8: 유보가 두 겹이면 힌트 — 동사와 태그 중 하나만', () => {
  const hint = doc => lint(fm + doc).filter(f => f.rule === 8 && /두 겹/.test(f.msg));
  // "~할 수 있습니다"는 능력인지 가능성인지 글자로 못 가려서 보지 않는다
  for (const s of ['가장 싸고 빨리 모을 수 있다고 봅니다 [추정].', '공유가 줄 것 같습니다 [미확인].', '원인은 캐시로 보입니다 [추정]', '회귀로 추정됩니다. [미검증]'])
    { const f = hint(s); assert.equal(f.length, 1, s); assert.ok(f[0].hint); }
  for (const s of ['가장 싸고 빨리 모을 수 있습니다 [추정].', '원인은 캐시로 봅니다.', '재시작하면 복구할 수 있습니다.', '배포를 마쳤습니다 [완료].']) assert.equal(hint(s).length, 0, s);
});
test('규칙 14: 한 섹션의 문두 접속어 3개부터 힌트', () => {
  const hint = doc => lint(fm + doc).filter(f => f.rule === 14 && /접속어/.test(f.msg));
  const chain = '## 추천\n\nA안을 추천합니다.\n다만 영향은 보장하지 않습니다.\n그러나 수요는 B안에 있습니다.\n그래서 순서를 둡니다.';
  const f = hint(chain); assert.equal(f.length, 1); assert.ok(f[0].hint); assert.match(f[0].msg, /다만·그러나·그래서/);
  assert.equal(hint(chain.replace('그래서 순서를 둡니다.', '순서를 둡니다.')).length, 0, '두 개까지는 통과');
  assert.equal(hint('## 가\n\n다만 하나.\n그러나 둘.\n\n## 나\n\n그래서 셋.\n또한 넷.').length, 0, '섹션마다 따로 센다');
  assert.equal(hint('## 가\n\n다만화 제작사입니다.\n그래서울 지점입니다.\n또한국어 판입니다.').length, 0, '낱말 일부');
});

test('새 문체 힌트 4종: 인용·코드·주석 안은 세지 않고, summary는 셈 (검수 2026-10-21)', () => {
  const rule = (doc, re, f = fm) => lint(f + doc).filter(x => re.test(x.msg));
  assert.equal(rule('담당자는 "원인은 캐시로 보입니다 [추정]"이라고 말했습니다.', /두 겹/).length, 0, '인용 안 유보');
  assert.equal(rule('<code>원인은 캐시로 보입니다 [추정]</code>', /두 겹/).length, 0, 'HTML code 안');
  assert.equal(rule('담당자는 "첫 결과입니다. 다만 적습니다. 그러나 납니다. 그래서 유지합니다."라고 말했습니다.', /접속어/).length, 0, '인용 안 접속어');
  assert.equal(rule('<!--\n다만 하나.\n그러나 둘.\n그래서 셋.\n-->', /접속어/).length, 0, 'HTML 주석');
  const f = rule('', /두 겹/, fm.replace('title: 시험 문서', 'summary: 원인은 캐시로 보입니다 [추정]\ntitle: 시험 문서'));
  assert.equal(f.length, 1, 'frontmatter summary'); assert.equal(f[0].line, 2);
});
test('강조용 따옴표: 명사 말끝은 강조, "~이라 답했다"는 인용', () => {
  const hint = doc => lint(fm + doc).filter(x => /강조용 따옴표/.test(x.msg));
  assert.equal(hint(Array(5).fill('"이미지"를 강조합니다.').join('\n')).length, 1, '이미지');
  assert.equal(hint(Array(5).fill('"데이터"를 봅니다.').join('\n')).length, 1, '데이터');
  assert.equal(hint(Array(5).fill('담당자는 "배포 일정"이라 답했습니다.').join('\n')).length, 0, '이라 답했다');
});
test('괄호 단서: 근거 줄·접힌 칸·출처 절은 조건을 두는 곳이라 세지 않음', () => {
  const hint = doc => lint(fm + doc).filter(x => /괄호 단서/.test(x.msg));
  const p = '(한국어로여덟글자이상)'.repeat(12);
  for (const doc of ['<details>\n<summary>상세</summary>\n\n' + p + '\n\n</details>', '**근거:** ' + p, '- 근거: ' + p, '## 결과\n\n### 출처\n\n' + p])
    assert.equal(hint(doc).length, 0, doc.slice(0, 30));
  assert.equal(hint('본문입니다' + p).length, 1);
});
test('닫는 괄호 없는 유보 반복·긴 경로 토큰도 선형 시간', () => {
  assertLinearTime('유보 두 겹', (n, reps) => cpuTime(repeat(reps, () => lint(fm + '고 봅니다 [추정'.repeat(n / 8)))));
  assertLinearTime('file:line', (n, reps) => cpuTime(repeat(reps, () => lint(fm + 'a/'.repeat(n / 2)))));
});
test('근거 줄이 길면 힌트 — 조건 모음이 새 문단이 되지 않게', () => {
  const hint = doc => lint(fm + doc).filter(x => /근거 줄/.test(x.msg));
  const long = '근거: ' + '이용자 약 3천만 명은 홍보 문구이며 측정 시점은 공개되지 않았습니다. '.repeat(6);
  const f = hint(long); assert.equal(f.length, 1); assert.ok(f[0].hint);
  assert.equal(hint('근거: 홍보 문구, 측정 시점 미공개. 설문 언어 항목, 2026년 9월.').length, 0);
});

// ── 2026-10-19 추가: 날것의 Claude 글 15개와 이 PC 보고서 18건을 비교해 보고서에 0번인 버릇만 ──
test('규칙 14: Claude 버릇 — 이모지·"결국 X입니다"·"중요한 건"은 힌트', () => {
  const hint = (doc, re) => lint(fm + doc).filter(f => f.rule === 14 && re.test(f.msg));
  const e = hint('## 🚀 다음 분기 계획\n\n배포를 마쳤습니다 🎉', /이모지/);
  assert.equal(e.length, 1); assert.ok(e[0].hint); assert.ok(/이모지 2개/.test(e[0].msg));
  assert.ok(/이모지 1개/.test(hint('# 🛠️ 소식', /이모지/)[0].msg), '변형 선택자 붙은 이모지는 1개');
  assert.equal(hint('A ↔ B 비교, ★ 추천, ✓ 완료', /이모지/).length, 0, '글자 모양 기호');
  assert.equal(hint('로그에 "🚀 started"가 찍힙니다.\n\n`🎉`', /이모지/).length, 0, '인용·코드');
  for (const s of ['AI가 쓴 코드를 믿을 근거는 결국 테스트입니다.', '개발은 결국 사람과 함께하는 일이다.']) assert.equal(hint(s, /본질 단정/).length, 1, s);
  for (const s of ['결국 30분 뒤 롤백했습니다.', '결국 캐시 만료가 원인이었습니다.']) assert.equal(hint(s, /본질 단정/).length, 0, s);
  assert.equal(hint('중요한 건 빠른 공유입니다.\n\n필요한 건 재현 절차입니다.', /분열문/).length, 1);
  assert.equal(hint('중요한 건수는 12건입니다.\n\n필요한 건물 목록입니다.', /분열문/).length, 0);
});

test('구조: 보이지 않는 문자 경고 — 코드·frontmatter 안도, 이모지 결합은 제외', () => {
  const inv = doc => lint(doc).filter(f => /보이지 않는 문자/.test(f.msg));
  const zw = String.fromCharCode(0x200B), rlo = String.fromCharCode(0x202E), zwj = String.fromCharCode(0x200D);
  const found = inv(fm + '# 제목\n\n캐시를' + zw + ' 켭니다.');
  assert.equal(found.length, 1); assert.equal(found[0].hint, false); assert.ok(/폭 없는 공백/.test(found[0].msg));
  assert.ok(/방향 제어/.test(inv(fm + '# 제목\n\n파일 이름은 abc' + rlo + 'txt.exe 입니다.')[0].msg));
  assert.equal(inv(fm + '# 제목\n\n```js\nconst a = 1;' + zw + '\n```').length, 1, '코드 안');
  assert.equal(inv('---\ntitle: 제목' + zw + '\ndate: 2026-10-19\naudience: team\n---\n# 제목').length, 1, 'frontmatter');
  assert.equal(inv(fm + '# 제목\n\n가족 이모지 👨' + zwj + '👩' + zwj + '👧 는 그대로 둡니다.').length, 0, '이모지 결합');
  assert.equal(lint('# 제목\n본문' + zw, {plain: true}).filter(f => /보이지 않는 문자/.test(f.msg)).length, 1, '--plain도 검사');
});

test('정합성 힌트: 요약 수치·개수 약속·미룬 약속', () => {
  const doc = (summary, body) => '---\ntitle: t\ndate: 2026-10-17\naudience: team\nsummary: ' + summary + '\n---\n# t\n\n' + body;
  const got = (d, re, opts) => lint(d, opts).filter(f => re.test(f.msg));
  // 요약 수치: 본문에 없는 숫자만, 힌트로. 쉼표·공백 차이는 같은 수
  const miss = got(doc('응답 시간이 340ms에서 120ms로 줄었다.', '## 결과\n\n응답 시간은 340ms였습니다.'), /요약 수치/);
  assert.equal(miss.length, 1); assert.ok(miss[0].hint); assert.ok(/120ms/.test(miss[0].msg));
  assert.equal(got(doc('처리 1,234건을 확인했다.', '## 결과\n\n| 항목 | 값 |\n| --- | --- |\n| 처리 | 1234건 |'), /요약 수치/).length, 0);
  assert.equal(got(doc('2026-10-17 기준 3개 서비스를 바꿨다.', '## 결과\n\n서비스 3개를 바꿨습니다.'), /요약 수치/).length, 0, '날짜는 수치로 보지 않음');
  assert.equal(got(doc('지연이 12% 늘었다.', '## 결과\n\n```stats\n지연 | 12% | 9월 기준 | 주의\n```'), /요약 수치/).length, 0, 'stats 블록도 본문');
  assert.equal(got(doc('90일 결과면 약 4.1점이 된다.', '## 점수\n\n90일 결과로 4/4.5/5(4.10)입니다.'), /요약 수치/).length, 0, '소수 끝 0은 같은 수');
  assert.equal(got(doc('후보 5개를 골랐고 국내만 있는 것은 0개다.', '## 선정\n\n### 해외 (3개)\n\n본문입니다.\n\n### 진출 (2개)\n\n본문입니다.'), /요약 수치/).length, 0, '20 이하 개수는 세거나 더한 값');
  assert.equal(got(doc('처리 1,500건이 밀렸다.', '## 결과\n\n처리가 밀렸습니다.'), /요약 수치/).length, 1, '큰 개수는 계속 검사');
  // 개수 약속: 예고한 수와 바로 아래 목록·카드·흐름의 항목 수
  assert.equal(got(doc('a', '## 원인\n\n원인은 세 가지입니다.\n\n- 캐시가 꺼져 있었습니다.\n- 연결 수가 모자랐습니다.'), /개수 약속/).length, 1);
  assert.equal(got(doc('a', '## 원인\n\n원인은 두 가지입니다.\n\n- 캐시가 꺼져 있었습니다.\n- 연결 수가 모자랐습니다.\n  - 최대 10개였습니다.'), /개수 약속/).length, 0, '하위 항목은 세지 않음');
  assert.equal(got(doc('a', '## 흐름\n\n요청은 4단계로 처리됩니다.\n\n```flow\n사용자 | 요청 | ext\n서버 | 검증 | logic\nDB | 저장 | data\n```'), /개수 약속/).length, 1);
  assert.equal(got(doc('a', '## 선택지\n\n선택지는 2개입니다.\n\n```cards\n수동 [추천]\n운영자가 승인합니다.\n\n자동\n다음 단계에서 봅니다.\n```'), /개수 약속/).length, 0);
  assert.equal(got(doc('a', '## 범위\n\n서비스 3개 중 하나만 바꿨습니다.\n\n다음 절에서 이유를 씁니다.'), /개수 약속/).length, 0, '목록이 이어지지 않으면 비교 안 함');
  // 실제 문서에서 나온 오탐(2026-10-17): 줄 중간 개수 + 바로 아래 표, 목록 항목 안의 개수
  assert.equal(got(doc('a', '## 범위\n\n8개 서비스 중 아래 표의 서비스만 바꿨습니다.\n\n| 서비스 | 상태 |\n| --- | --- |\n| A | 완료 |'), /개수 약속/).length, 0);
  assert.equal(got(doc('a', '## 목록\n\n- 항목은 세 가지입니다.\n- 둘째 항목입니다.'), /개수 약속/).length, 0);
  assert.equal(got(doc('a', '## 단계\n\n배포는 다음 3단계로 진행됩니다.\n\n1. 빌드합니다.\n2. 올립니다.'), /개수 약속/).length, 1);
  // codex 최종 검수(2026-10-17)
  assert.equal(got(doc('지연이 12% 늘었다.', '## 결과\n\n지연은 112% 늘었고 오류는 0.12%입니다.'), /요약 수치/).length, 1, '부분 문자열은 근거 아님');
  assert.equal(got(doc('a', '## 원인\n\n원인은 세 가지입니다.\n\n1. 캐시입니다.\n\n2. 연결 수입니다.\n\n3. 타임아웃입니다.'), /개수 약속/).length, 0, '빈 줄로 띄운 목록');
  assert.equal(got(doc('a', '## 확인\n\n다음 세 가지를 확인했습니다:\n\n- 로그를 봤습니다.\n- 지표를 봤습니다.'), /개수 약속/).length, 1, '콜론 예고');
  assert.equal(got(doc('a', '## 범위\n\n뒤에서 설명하겠다는 약속은 하지 않았습니다.\n\n뒤에서 다루겠다는 문장을 삭제했습니다.'), /미룬 약속/).length, 0);
  assert.equal(got(doc('a', '## 예문\n\n예문 "세\n가지입니다"와 "뒤에서 다루겠습니다"를 인용했다.'), /미룬 약속/).length, 0, '두 줄 곧은따옴표');
  // 줄마다 짝이 맞는 따옴표는 다음 줄과 묶지 않는다(묶으면 뒤 따옴표 짝이 어긋나 인용 예문이 노출됨 — ko-terms.md에서 실제 발생)
  assert.deepEqual(lint(fm + '| 표현 | 예 |\n| --- | --- |\n| 바랍니다 | "확인하시기 바랍니다" → "확인해 주세요" |\n| 진행 | "검증을 진행합니다" → "검증합니다" |').filter(f => f.rule === 14), []);
  { const d = '> 지연은 340ms입니다.\n\n## 결과\n\n수치는 없습니다.'; assert.equal(got(d, /요약 수치/).length, 1, '첫 줄 인용 요약'); }
  { const f = got(doc('지연 340ms.', '## 결과\n\n없음.'), /요약 수치/); assert.equal(f[0].line, 5, 'frontmatter summary 줄을 가리킴'); }
  assertLinearTime('정합성 lint', (n, reps) => cpuTime(repeat(reps, () => lint(doc('a', '1'.repeat(n) + '개x')))));
  // 미룬 약속: 한 번 알림
  const later = got(doc('a', '## 배경\n\n자세한 원인은 뒤에서 다루겠습니다.\n\n## 원인\n\n아래에서 설명하겠습니다.'), /미룬 약속/);
  assert.equal(later.length, 1); assert.ok(later[0].hint);
  // --plain에서는 끔
  assert.equal(got(doc('120ms로 줄었다.', '## 결과\n\n원인은 세 가지입니다.\n\n- 하나입니다.'), /요약 수치|개수 약속/, {plain: true}).length, 0);
});

test('규칙 14: 좁은 문맥 판별로 남긴 알려진 미검출', () => {
  // 알려진 미검출: 오탐을 줄인 대상/어미/단어 경계 밖의 나쁜 표현. 해소 전까지 검출을 기대하지 않는다.
  const missed = [
    ['B1 패킷 은유', '패킷이 흘러갑니다.'],
    ['B2 대상 생략 — examples.md의 나쁜 예문', '조립합니다.'],
    ['B3 기존 미검출 — 이번 축소와 무관한 활용형', '서비스가 API 창구를 엽니다.'],
    ['B5 관형형 용언', '진짜 등록된 도서관인지 확인합니다.'],
    ['B5 평서형 용언', '응답이 진짜 느리다.'],
    ['B7 복합 풀이 — examples.md의 나쁜 예문', '상품 목록(DB 설정값)을 바꿉니다.'],
    ['B8 피동 어미 미등록', '토큰은 서버에 의해 발급되곤 합니다.'],
    ['B12 있다 없는 속성', '관리자는 권한을 가지고 처리합니다.'],
  ];
  for (const [id, sentence] of missed) {
    assert.deepEqual(lint(fm + sentence).filter(f => f.rule === 14), [], `알려진 미검출 ${id}: ${sentence}`);
  }
  // 알려진 미검출(AI 문형): "아닌 B다"는 "정수가 아닌 값"처럼 정상 용법이 흔해 잡지 않는다
  assert.deepEqual(lint(fm + '병목은 캐시가 아닌 DB다.\n\n원인은 메모리가 아닌 CPU다.').filter(f => f.rule === 14), []);
});

// ── render: 마크다운 해석 ──────────────────────────────────────────────────
test('코드펜스 길이·종류 보존', () => {
  const r = plain('# 제목\n\n````text\n```\n내용\n````\n\n~~~text\n보존\n~~~\n', ['--strict']);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(r.html.includes('```\n내용')); assert.ok(r.html.includes('보존'));
  assert.ok(!r.html.includes('~~~'));
});
test('닫히지 않은 코드로 strict 출력 생성 안 함', () => {
  const r = plain('# 제목\n```js\n실패', ['--strict']); assert.equal(r.status, 1); assert.equal(fs.existsSync(r.output), false);
});
test('기본 모드 strict 실패도 쓰기 전에 멈춤', () => {
  const r = render('# 제목\n\n본문', ['--strict']); assert.equal(r.status, 1); assert.equal(fs.existsSync(r.output), false);
});
test('중첩 details 및 코드 속 닫는 태그 보존', () => {
  const r = plain('# 제목\n\n<details>\n<summary>상세</summary>\n\n```html\n</details>\n```\n\n<details>\n<summary>하위</summary>\n\n끝까지 보존\n\n</details>\n</details>', ['--strict']);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(r.html.includes('&lt;/details&gt;')); assert.ok(r.html.includes('끝까지 보존')); assert.equal((r.html.match(/<details>/g) || []).length, 2);
});
test('번호 목록의 시작값·항목값 보존', () => { const r = plain('# 제목\n\n3. 첫 항목\n7. 다음 항목', ['--strict']); assert.ok(r.html.includes('<ol start="3">')); assert.ok(r.html.includes('<li value="7">')); });
test('한국어 링크·이스케이프 파이프·숫자 보존', () => {
  const r = plain('# 제목\n\n[근거](./근거.md) [상대](근거.md)\n\n| 대상 | 값 |\n| --- | ---: |\n| A\\|B | 1,234.56 |', ['--strict']);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.ok(r.html.includes('href="./근거.md"')); assert.ok(r.html.includes('href="근거.md"')); assert.ok(r.html.includes('A|B')); assert.ok(r.html.includes('1,234.56'));
});
test('이미지 마크다운 렌더, 위험 주소는 무력화', () => {
  const r = plain('# 제목\n\n![구성도](./diagram.svg)\n\n![x](javascript:alert(1))');
  assert.ok(r.html.includes('<img src="./diagram.svg" alt="구성도"')); assert.ok(!r.html.includes('src="javascript:'));
});
test('표 칸: 한국어 문장 끝과 <br>에서 줄바꿈', () => {
  const r = render('# 제목\n\n| 항목 | 설명 |\n| --- | --- |\n| A | 먼저 확인합니다. 그다음 저장합니다. |\n| B | 첫 줄<br>둘째 줄 |', ['--no-lint']);
  assert.ok(r.html.includes('확인합니다.<br>그다음')); assert.ok(r.html.includes('첫 줄<br>둘째 줄'));
});
test('browser 블록은 주소창 있는 창 안에 원문 표시', () => {
  const r = render('# 제목\n\n```browser https://example.com/terms\n#### 이용 약관\n- 원문 한 줄\n```', ['--no-lint']);
  assert.ok(r.html.includes('class="browser-mock"')); assert.ok(r.html.includes('example.com/terms')); assert.ok(r.html.includes('원문 한 줄'));
});
test('flow·stats·cards를 의미 있는 HTML로 렌더', () => {
  const body = '# 제목\n\n```flow\n신청자 | 제출 | ext\n화면 | 확인 | entry\n```\n\n```stats\n처리 | 128건 | 9월 기준 | 완료\n```\n\n```cards\n수동 승인 [추천]\n시범 운영에 적용합니다.\n\n자동 승인\n다음 단계에서 검토합니다.\n```';
  const r = plain(body, ['--strict']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.html.includes('class="flow-step role-ext"'));
  assert.ok(r.html.includes('class="stat s-done"'));
  assert.ok(/class="card is-recommended"/.test(r.html));
});
test('시각 블록도 HTML을 이스케이프', () => {
  const r = plain('# 제목\n\n```flow\n<img src=x onerror=alert(1)> | 설명 | unknown\n```');
  assert.ok(r.html.includes('&lt;img src=x onerror=alert(1)&gt;')); assert.ok(!r.html.includes('<img src=x onerror=alert(1)>'));
});

// ── 기본 모드와 --plain 모드의 차이 ────────────────────────────────────────
test('plain: 인용문을 요약으로 바꾸지 않음 / 기본: 첫 인용문이 요약 상자', () => {
  const p = plain('# 제목\n\n> 인터뷰 발언입니다.', ['--strict']);
  assert.ok(p.html.includes('<blockquote>인터뷰 발언입니다.</blockquote>')); assert.ok(!p.html.includes('<div class="callout">'));
  const d = render('# 제목\n\n> 요약 문장입니다.', ['--no-lint']);
  assert.ok(d.html.includes('<div class="callout">요약 문장입니다.</div>'));
});
test('plain: 자동 줄바꿈·선택 강제 개행 / 기본: 줄마다 <br>', () => {
  const body = '# 제목\n\n첫 문장.\n둘째 문장.';
  assert.ok(plain(body, ['--strict']).html.includes('<p>첫 문장.\n둘째 문장.</p>'));
  assert.ok(plain(body, ['--strict', '--hard-breaks']).html.includes('<p>첫 문장.<br>\n둘째 문장.</p>'));
  assert.ok(render(body, ['--no-lint']).html.includes('<p>첫 문장.<br>\n둘째 문장.</p>'));
});
test('plain: 기준일 없으면 오늘 날짜를 지어내지 않음', () => {
  const r = plain('# 제목\n본문', [], '---\ntitle: 시험\naudience: team\n---\n');
  // 템플릿 CSS·JS 주석의 사례 날짜("2026-10-23 실측")가 오늘이면 걸리므로 보이는 부분만 본다
  const visible = r.html.replace(/<(style|script)\b[\s\S]*?<\/\1>/g, '');
  assert.ok(visible.includes('기준일 미기재')); assert.ok(!visible.includes(new Date().toISOString().slice(0, 10)));
});

// ── 보안 ────────────────────────────────────────────────────────────────────
test('악성 raw HTML은 실행 가능한 태그가 되지 않음', () => {
  for (const r of [render('# 제목\n\n<div><script>window.PWNED=1</script></div>\n\n<img src=x onerror="window.PWNED=2">\n\n<p onclick="x()"><a href="javascript:alert(3)">a</a></p>', ['--no-lint']),
    plain('# 제목\n\n<div><script>window.PWNED=1</script></div>\n\n<img src=x onerror="window.PWNED=2">')]) {
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.html.includes('<script>window.PWNED')); assert.ok(!/<[^>]+\son\w+=/i.test(r.html.replace(/<script[\s\S]*?<\/script>/g, '')));
    assert.ok(!/href="javascript:/i.test(r.html));
  }
});
test('엔티티로 숨긴 javascript: 주소도 차단', () => {
  const r = render('# 제목\n\n<p><a href="javascript&#58;alert(1)">a</a> <a href="&#106;avascript:alert(2)">b</a></p>', ['--no-lint']);
  assert.ok(r.html.includes('<a href="#">a</a> <a href="#">b</a>'), r.html.match(/<p><a[\s\S]*?<\/p>/)?.[0]);
});
test('허용 태그의 안전한 속성은 유지', () => {
  const r = render('# 제목\n\n<figure class="wide"><img src="./a.svg" alt="구성도" width="600"><figcaption>그림 1</figcaption></figure>', ['--no-lint']);
  assert.ok(r.html.includes('<figure class="wide"><img src="./a.svg" alt="구성도" width="600"><figcaption>그림 1</figcaption></figure>'));
});
test('details 제목의 HTML도 이스케이프', () => {
  const r = plain('# 제목\n\n<details>\n<summary><img src=x onerror=alert(1)></summary>\n\n본문\n\n</details>');
  assert.ok(!r.html.includes('<img src=x')); assert.ok(r.html.includes('&lt;img'));
});
test('위험 URL strict 차단', () => { const r = plain('# 제목\n\n[클릭](javascript:alert(1))', ['--strict']); assert.equal(r.status, 1); assert.equal(r.html, ''); });
test('코드가 URL 안에 있어도 속성 탈출 불가', () => {
  const r = plain('# 제목\n\n[링크](`x" onmouseover="alert(1)` )'); assert.ok(!r.html.includes('<a href="<code>'));
});

// ── codex 검수에서 나온 회귀 ────────────────────────────────────────────────
test('한 줄 details도 무한 재귀 없이 렌더', () => {
  const r = plain('# 제목\n\n<details><summary>S</summary><p>B</p></details>', ['--strict']);
  assert.equal(r.status, 0, r.stderr.slice(0, 300)); assert.ok(r.html.includes('<summary>S</summary>'));
});
test('범위 밖 숫자 엔티티로 죽지 않음', () => { const r = render('# 제목\n\n<p title="&#x110000;">본문</p>', ['--no-lint']); assert.equal(r.status, 0, r.stderr.slice(0, 300)); });
test('따옴표 안 > 는 속성 값으로 보존', () => {
  const r = render('# 제목\n\n<figure><img src="a.svg" alt="A > B"><figcaption>그림</figcaption></figure>', ['--no-lint']);
  assert.ok(r.html.includes('<img src="a.svg" alt="A &gt; B">'), r.html.match(/<figure>[\s\S]*?<\/figure>/)?.[0]);
});
test('속성 있는 summary도 제목으로 유지, 없으면 "상세"', () => {
  const r = render('# 제목\n\n<details>\n<summary class="title">계산 근거</summary>\n\n본문\n\n</details>\n\n<details>\n\n본문2\n\n</details>', ['--no-lint']);
  assert.ok(r.html.includes('<summary class="title">계산 근거</summary>')); assert.ok(r.html.includes('<summary>상세</summary>'));
});
test('plain: H4~H6 단계 유지', () => {
  const r = plain('# 제목\n\n## 장\n\n#### 절\n\n##### 항\n\n###### 목', ['--strict']);
  assert.ok(r.html.includes('<h4>절</h4>') && r.html.includes('<h5>항</h5>') && r.html.includes('<h6>목</h6>'));
});
test('번호 0도 그대로', () => { const r = plain('# 제목\n\n0. 영\n1. 일'); assert.ok(r.html.includes('<ol start="0"><li value="0">')); });
test('표 안의 위험 링크도 lint가 잡음', () => assert.ok(lint(fm + '| A |\n| --- |\n| [x](javascript:alert(1)) |', {plain: true}).some(f => /링크/.test(f.msg))));
test('구분 행 칸 수도 검사', () => assert.ok(lint(fm + '| A | B |\n| --- |\n| 1 | 2 |', {plain: true}).some(f => /칸/.test(f.msg))));
test('plain 렌더 검사: H1 두 개', () => assert.ok(lint(fm + '# 하나\n\n# 둘', {plain: true, renderer: true}).some(f => /H1/.test(f.msg))));
test('붙여 쓴 참조 정의도 검출', () => assert.ok(lint(fm + '[ref]:https://example.com', {plain: true}).some(f => /참조/.test(f.msg))));
test('plain reader-review: 백틱 안 코드 위치도', () => assert.ok(lint(fm + '# 제목\n\n`a.js:2` 확인', {plain: true, readerReview: true}).some(f => f.rule === 6)));
test('외부 문서: 어떤 경고에도 redact 값이 찍히지 않음', () => {
  const doc = '---\ntitle: t\ndate: 2026-09-22\naudience: external\nredact: SECRET\ntheme: SECRET\n---\n[x](javascript:SECRET)\n\n```flow\n가 | 나 | SECRET\n```';
  for (const opts of [{plain: true}, {}]) assert.ok(!JSON.stringify(lint(doc, opts)).includes('SECRET'), JSON.stringify(lint(doc, opts).filter(f => f.msg.includes('SECRET'))));
});
test('lint --help는 도움말 후 0, 입력 없으면 1', () => {
  assert.equal(spawnSync(process.execPath, [path.join(__dirname, 'lint.js'), '--help']).status, 0);
  assert.equal(spawnSync(process.execPath, [path.join(__dirname, 'lint.js'), '--plain']).status, 1);
});
test('짝 안 맞는 details 검출(표 칸 안 포함)', () => {
  for (const opts of [{plain: true}, {}]) {
    assert.ok(lint(fm + '<details>\n<summary>s</summary>\n\n본문', opts).some(f => f.rule === 9));
    assert.ok(lint(fm + '본문\n\n</details>', opts).some(f => f.rule === 9));
    assert.ok(lint(fm + '| A |\n| --- |\n| <details> |', opts).some(f => f.rule === 9));
  }
});
test('참조 정의는 주소 모양과 무관하게 검출, 상태 태그 줄은 제외', () => {
  assert.ok(lint(fm + '[ref]: document', {plain: true}).some(f => /참조/.test(f.msg)));
  assert.ok(!lint(fm + '[완료]: 배포까지 끝났다.', {plain: true}).some(f => /참조/.test(f.msg)));
});
test('외부 문서: 잘린 경고·겹치는 redact에도 값이 안 새어 나감', () => {
  const doc = '---\ntitle: t\ndate: 2026-09-22\naudience: external\nredact: SECRET, SECRET-TOKEN, SECRET123\n---\n[x](javascript:' + 'x'.repeat(25) + 'SECRET123)\n\n[y](javascript:SECRET-TOKEN)';
  const out = JSON.stringify(lint(doc, {plain: true}));
  assert.ok(!/SECR|TOKEN/.test(out), out);
});
test('속성 값에 > 가 있는 summary', () => {
  const r = render('# 제목\n\n<details>\n<summary title="A > B">제목글</summary>\n\n본문\n\n</details>', ['--no-lint']);
  assert.ok(r.html.includes('<summary title="A &gt; B">제목글</summary>'), r.html.match(/<details>[\s\S]*?<\/details>/)?.[0]);
});
test('raw HTML 정리가 긴 입력에서 느려지지 않음', () => {
  // 자식 안에서 재서 Node 시작·스케줄 대기를 제외한다. render.js는 require할 때 한 번 실행되므로 캐시를 지우고 반복한다.
  // 모듈 로드·컴파일(약 60ms)은 입력과 무관한 고정비라 작은 입력이 작으면 2차 증가를 가린다 — 5만 자와 50만 자를 비교한다.
  const benchmark = `const reps = Number(process.env.KRR_REPS), start = process.cpuUsage();
    for (let i = 0; i < reps; i++) { delete require.cache[require.resolve(process.argv[1])]; require(process.argv[1]); }
    const used = process.cpuUsage(start); console.log('KRR_CPU_US ' + (used.user + used.system));`;
  assertLinearTime('raw HTML render', (n, reps) => {
    const input = path.join(dir, 'perf-' + n + '.md');
    fs.writeFileSync(input, fm + '# 제목\n\n<div><' + 'a'.repeat(n) + '"x></div>');
    const r = spawnSync(process.execPath, ['-e', benchmark, renderer, input, '--offline', '--no-lint'],
      {encoding: 'utf8', timeout: 60000, env: {...process.env, KRR_REPS: String(reps)}});
    assert.equal(r.status, 0, r.error?.message || r.stdout + r.stderr);
    const match = r.stdout.match(/^KRR_CPU_US (\d+)$/m);
    assert.ok(match, r.stdout + r.stderr);
    return Number(match[1]);
  }, 50000);
  for (const [name, opts] of [['기본', {}], ['plain', {plain: true}]]) {
    assertLinearTime('raw HTML lint ' + name, (n, reps) => cpuTime(repeat(reps, () => lint(fm + '<' + 'a'.repeat(n), opts))));
  }
});
test('바탕화면 대체 경로도 원본·링크 보호', () => {
  // 쓸 수 없는 위치(-o 대상 폴더가 파일)에서 바탕화면 reports/로 넘어갈 때, 그 경로가 원본 md면 거부
  const home = fs.mkdtempSync(path.join(dir, 'home-')); const reports = path.join(home, 'Desktop', 'reports'); fs.mkdirSync(reports, {recursive: true});
  const input = path.join(reports, 'same.md'); fs.writeFileSync(input, fm + '# 제목\n본문'); const before = fs.readFileSync(input, 'utf8');
  const ro = path.join(dir, 'readonly-' + seq); fs.mkdirSync(ro); fs.chmodSync(ro, 0o555);   // 쓰기 실패 = EACCES → 바탕화면으로
  try { fs.writeFileSync(path.join(ro, 'probe'), 'x'); fs.chmodSync(ro, 0o755); skip('이 OS에서는 chmod로 폴더 쓰기를 막을 수 없음'); } catch (e) { if (e.skip) throw e; }
  const r = spawnSync(process.execPath, [renderer, input, '-o', path.join(ro, 'same.md'), '--no-lint'], {encoding: 'utf8', env: {...process.env, HOME: home, USERPROFILE: home}});
  fs.chmodSync(ro, 0o755);
  assert.equal(fs.readFileSync(input, 'utf8'), before, r.stdout + r.stderr); assert.notEqual(r.status, 0);
});

// ── 출력 파일 보호 ──────────────────────────────────────────────────────────
test('옆 보고서 md 링크는 html로, 없는 파일·외부·이미지는 그대로', () => {
  fs.writeFileSync(path.join(dir, 'case-근거.md'), fm + '# 근거');
  const r = plain('# 제목\n\n[근거](case-근거.md#표) [인코딩](case-%EA%B7%BC%EA%B1%B0.md) [없음](nope.md) [외부](https://example.com/a.md) ![그림](case-근거.md)');
  assert.ok(r.html.includes('href="case-근거.html#표"'), r.html.match(/<a [^>]*>근거/)?.[0]);
  assert.ok(r.html.includes('href="case-%EA%B7%BC%EA%B1%B0.html"'));
  assert.ok(r.html.includes('href="nope.md"')); assert.ok(r.html.includes('href="https://example.com/a.md"'));
  assert.ok(r.html.includes('src="case-근거.md"'));
});
test('기본: 기존 출력 덮어씀 / --keep-existing: 보존, --force로만 교체', () => {
  const r = plain('# 제목\n본문', ['--strict']);
  assert.equal(run(r.input, '--plain', '--strict').status, 0);
  fs.writeFileSync(r.output, 'OLD');
  const kept = run(r.input, '--plain', '--strict', '--keep-existing');
  assert.equal(kept.status, 1); assert.equal(fs.readFileSync(r.output, 'utf8'), 'OLD');
  assert.equal(run(r.input, '--plain', '--strict', '--keep-existing', '--force').status, 0); assert.notEqual(fs.readFileSync(r.output, 'utf8'), 'OLD');
});
test('strict 실패는 기존 출력 보존', () => {
  const r = plain('# 제목\n본문', ['--strict']); fs.appendFileSync(r.input, '\n```\n미완성');
  const result = run(r.input, '--plain', '--strict', '--force');
  assert.equal(result.status, 1); assert.equal(fs.readFileSync(r.output, 'utf8'), r.html);
});
test('원본 덮어쓰기 거부', () => {
  const r = plain('# 제목\n본문', ['--strict']); const before = fs.readFileSync(r.input, 'utf8');
  const result = run(r.input, '-o', r.input, '--force');
  assert.equal(result.status, 1); assert.equal(fs.readFileSync(r.input, 'utf8'), before);
});
test('끊어진 출력 심볼릭 링크도 거부', () => {
  const r = plain('# 제목\n본문', ['--strict']); const target = path.join(dir, 'not-created.html'); const alias = path.join(dir, 'symlink.html');
  try { fs.symlinkSync(target, alias); } catch (e) { if (e.code === 'EPERM') skip('심볼릭 링크를 만들 권한이 없음(Windows 개발자 모드·관리자 필요)'); throw e; }
  const result = run(r.input, '-o', alias, '--force');
  assert.equal(result.status, 1); assert.equal(fs.existsSync(target), false);
});
test('원본의 하드링크 출력도 거부', () => {
  const r = plain('# 제목\n본문', ['--strict']); const alias = path.join(dir, 'hardlink.html'); const before = fs.readFileSync(r.input, 'utf8'); fs.linkSync(r.input, alias);
  const result = run(r.input, '-o', alias, '--force');
  assert.equal(result.status, 1); assert.equal(fs.readFileSync(r.input, 'utf8'), before);
});

// ── 템플릿 ──────────────────────────────────────────────────────────────────
test('템플릿 자리표시자 잔존 없음', () => { const r = plain('# 제목\n본문', ['--strict']); assert.ok(!/\{\{[^}]*\}\}/.test(r.html)); });
test('오프라인 템플릿 CDN 없음·Mermaid 원문 표시', () => {
  const r = plain('# 제목\n\n```mermaid\ngraph LR\nA --> B\n```', ['--strict']);
  assert.ok(!r.html.includes('<script type="module">')); assert.ok(!/<link[^>]*cdn/.test(r.html)); assert.ok(r.html.includes('class="mermaid fallback"'));
});
test('인쇄 시 상세 펼침·복원 기능 존재', () => { const r = plain('# 제목\n본문', ['--strict']); assert.ok(r.html.includes("addEventListener('beforeprint'")); assert.ok(r.html.includes("addEventListener('afterprint'")); assert.ok(r.html.includes('@media print')); });
test('라이트 기본·수동 다크 전환·설정 보존', () => {
  const r = plain('# 제목\n본문', ['--strict']);
  assert.ok(r.html.includes('data-theme-default="light"'));
  assert.ok(r.html.includes('id="theme-toggle"'));
  assert.ok(r.html.includes('localStorage.setItem('));
  assert.ok(!r.html.includes('@media (prefers-color-scheme: dark)'));
  assert.ok(r.html.includes('[data-theme="dark"]'));
});
test('문서별 테마 기본값', () => {
  const dark = plain('# 제목\n본문', ['--strict'], fm.replace('---\n', '---\ntheme: dark\n'));
  assert.equal(dark.status, 0, dark.stdout + dark.stderr); assert.ok(dark.html.includes('data-theme-default="dark"'));
});
// 2026-10-21: 링크색 #3182f6이 회색 바탕에서 2.67:1이었다(design-guide §1의 AA 규칙 위반). 글자로 쓰는 파랑은 --blue-7만
test('글자색 대비 4.5:1 이상(라이트·다크), 파랑 글자는 --blue-7', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'references', 'template.html'), 'utf8');
  const block = sel => { const i = css.indexOf(sel + ' {'); return css.slice(i, css.indexOf('}', i)); };
  const tok = (b, name) => (b.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i')) || [])[1];
  const lum = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const light = block(':root'), dark = block(':root[data-theme="dark"]');
  for (const [name, b, fb] of [['라이트', light, light], ['다크', dark, light]]) {
    const t = n => tok(b, n) || tok(fb, n);
    for (const fg of ['ink', 'blue-7']) for (const bg of ['bg', 'surface', 'surface-2']) {
      assert.ok(ratio(t(fg), t(bg)) >= 4.5, `${name} --${fg} on --${bg}: ${ratio(t(fg), t(bg)).toFixed(2)}`);
    }
  }
  assert.ok(!/[\s;{]color:\s*var\(--blue\)/.test(css), '글자색에 --blue(채움용) 사용');
});
// 시나리오 시험(2026-10-21, 독자·문서 종류가 다른 6건)에서 lint·qa를 통과했지만 화면·본문에 남은 것
test('규칙 2: frontmatter summary와 같은 인용문을 H1 아래 또 쓰면 경고, 다른 인용은 통과', () => {
  const meta = fm.replace('---\n', '---\nsummary: |\n  배치가 평일마다 실패합니다.\n  시각을 되돌립니다.\n');
  const dup = doc => lint(doc).filter(f => /요약이 두 번/.test(f.msg)).length;
  assert.equal(dup(meta + '# 제목\n\n> 배치가 평일마다 실패합니다.\n> 시각을 되돌립니다.\n\n## 배경\n'), 1);
  assert.equal(dup(meta + '# 제목\n\n> "검색이 느리다"는 요청입니다.\n\n## 배경\n'), 0);
  assert.equal(dup(fm + '# 제목\n\n> 배치가 평일마다 실패합니다.\n\n## 배경\n'), 0);
});
test('규칙 14: frontmatter summary도 문체 검사(블록·한 줄), 줄 번호는 요약 줄', () => {
  const block = fm.replace('---\n', '---\nsummary: |\n  회신해 주시기 바랍니다.\n');
  const one = fm.replace('---\n', '---\nsummary: 회신해 주시기 바랍니다.\n');
  for (const [doc, line] of [[block, 3], [one, 2]]) {
    const hit = lint(doc + '# 제목\n').filter(f => f.rule === 14 && /주시기 바랍니다/.test(f.msg));
    assert.deepEqual(hit.map(f => f.line), [line]);
  }
});
test('규칙 15: 한 그림에 역할 색과 상태 색을 섞으면 경고(flow·mermaid)', () => {
  const mixed = body => lint(fm + body, {plain: true}).filter(f => /섞임/.test(f.msg)).length;
  assert.equal(mixed('```flow\n백업 | 잠금 | ext\n배치 | 실패 | fail\n```'), 1);
  assert.equal(mixed('```flow\n백업 | 잠금 | ext\n배치 | 처리 | logic\n```'), 0);
  assert.equal(mixed('```flow\n접수 | 제출 | done\n심사 | 반려 | fail\n```'), 0);
  assert.equal(mixed('```mermaid\nflowchart LR\nA --> B\nclass A ext\nB:::fail\n```'), 1);
  assert.equal(mixed('```mermaid\nflowchart LR\nA --> B\nclassDef x fill:#fff\nclass A,B ext\n```'), 0);
});
// 2026-10-29 "머메이드 다이어그램이 너무 못생겼다" — diagram-design(MIT)의 그림 예산·강조·직각 연결선을 힌트로
test('규칙 15 힌트: 흐름도 노드·연결 예산, 강조(chg) 수, svg 사선 연결선 — 못 읽는 그림은 세지 않음', () => {
  const hints = body => lint(fm + '# 제목\n\n## 그림\n\n' + body).filter(f => f.rule === 15).map(f => f.msg.split(' — ')[0]);
  const mm = b => '```mermaid\nflowchart TD\n' + b + '\n```\n';
  const sv = b => '```svg\n<svg viewBox="0 0 400 200" aria-label="x">\n' + b + '\n</svg>\n```\n';
  const chainOf = n => Array.from({length: n}, (_, i) => `  N${i}[단계 ${i}] --> N${i + 1}`).join('\n');
  assert.deepEqual(hints(mm(chainOf(12))), ['흐름도 노드 13개·연결 12개']);
  assert.deepEqual(hints(mm(chainOf(11))), []);
  // A & B --> C & D 는 연결 4개, 따옴표·도형 글자 속 --> 와 :::chg 는 세지 않음, edge id(e1@)는 노드가 아님
  assert.deepEqual(hints(mm([0, 1, 2, 3, 4].map(i => `  A${i} & B${i} --> C${i} & D${i}`).join('\n'))), ['흐름도 노드 20개·연결 20개']);
  assert.deepEqual(hints(mm('  A["문구 --> :::chg"] --> B["x:::chg"] --> C{"y:::chg"}')), []);
  assert.deepEqual(hints(mm(Array.from({length: 7}, (_, i) => `  A${i}([시작]) e${i}@-->|예| B${i}>표시] -.-> C${i}[(DB)]`).join('\n'))), ['흐름도 노드 21개·연결 14개']);
  assert.deepEqual(hints(mm(chainOf(12) + '\n  X@{ shape: rect }')), []);
  assert.deepEqual(hints(mm('  subgraph G [묶음]\n  A -- 예 --> B\n  end\n  class A,B,C chg')), ['흐름도 강조(chg) 3개']);
  assert.deepEqual(hints(mm('  A:::chg --> B:::chg --> C')), []);
  // 주석 속 강조·선은 세지 않고, 겹괄호 도형 뒤 :::chg 는 센다
  assert.deepEqual(hints(mm('%% A:::chg B:::chg C:::chg\n  A --> B')), []);
  for (const shape of ['[[가]]', '((가))', '{{가}}', '>가]', '([가])', '[(가)]', '["a]b"]'])
    assert.deepEqual(hints(mm(`  A${shape}:::chg --> B${shape}:::chg --> C${shape}:::chg`)), ['흐름도 강조(chg) 3개'], shape);
  assert.deepEqual(hints(mm('  X --o Y --x Z\n  P <--> Q ~~~ R\n  S -. 아마 .-> T == 굵게 ==> U')), []);
  assert.deepEqual(hints(sv('<line class="ln" x1="0" y1="0" x2="10" y2="10"/>\n<path class="ln" d="M0 0 10 10"/>\n<path class="ln" d="M0 0 L0 10 20 20"/>')), ['svg 연결선(class="ln") 사선 3구간']);
  assert.deepEqual(hints(sv('<path class="ln" d="M400 120 H430 V55 H468"/>\n<path class="ln" d="M0 0 M10 10"/>\n<path class="ln" d="M0 0 Q10 0 10 10"/>\n<path class="node" d="M0 0 L10 10"/>')), []);
  assert.deepEqual(hints(sv('<g transform="rotate(-45)"><line class="ln" x1="0" y1="0" x2="10" y2="10"/></g>')), []);
  assert.deepEqual(hints(sv('<!-- <line class="ln chg" x2="10" y2="10"/><rect class="chg"/><rect class="chg"/> -->')), []);
  const box = c => `<rect class="node ${c}" x="1" y="1" width="5" height="5"/>`;
  // 렌더러와 같은 엔티티 풀기: class="c&#104;g" 는 chg
  assert.deepEqual(hints(sv(box('c&#104;g').repeat(3))), ['svg 강조색(chg) 도형·선 3개']);
  assert.deepEqual(hints(sv(box('chg') + box('chg') + '<path class="ln chg" d="M5 3 H10"/>')), ['svg 강조색(chg) 도형·선 3개']);
  assert.deepEqual(hints(sv(box('chg') + '<path class="ln chg" d="M5 3 H10"/><text class="chg" x="1" y="1">a</text>')), []);
  assert.equal(lint(fm + mm(chainOf(12)), {plain: true}).filter(f => f.rule === 15).length, 0);
});
// 편집형 그림(그림자 없음·가는 테두리)과 렌더 안정성: 그림마다 고유 id(겹쳐 그려지던 버그), ELK 직각 배치 + dagre 복구
test('템플릿: Mermaid는 고유 id로 하나씩 그리고 ELK 실패·문법 오류를 복구, 그림자 없는 편집형 스타일', () => {
  const r = render('# 제목\n\n```mermaid\nflowchart LR\nA --> B\nclass B chg\n```\n\n```flow\n하나 | 설명 | entry\n둘 | 설명 | ext\n```\n', ['--no-lint']);
  const live = spawnSync(process.execPath, [renderer, r.input, '-o', r.input.replace(/\.md$/, '-live.html'), '--no-lint', '--force'], {encoding: 'utf8'});
  assert.equal(live.status, 0, live.stderr);
  const html = fs.readFileSync(r.input.replace(/\.md$/, '-live.html'), 'utf8');
  assert.ok(html.includes("mermaid.render(id, p.dataset.src)") && !html.includes('await mermaid.run('), '고유 id 렌더');
  assert.ok(html.includes("const id = 'krr-mmd-' + (++seq)") && html.includes('let queue = Promise.resolve()'), 'id·줄 세우기');
  assert.ok(html.includes('@mermaid-js/layout-elk@0.2.3') && html.includes("cycleBreakingStrategy: 'DEPTH_FIRST'"), 'ELK');
  assert.ok(/if \(useElk\) \{ useElk = false; continue; \}/.test(html) && html.includes("p.classList.add('fallback', 'mermaid-error')"), '복구');
  assert.ok(html.includes("keys = ['bad', 'fail', 'chg'"), 'class 우선순위');
  assert.ok(!/drop-shadow\(4px|flow-shadow|stroke-width: 2\.5px/.test(html), '브루탈리스트 그림자·굵은 테두리 없음');
  assert.ok(/\.flow-step \{[^}]*border: 1\.25px solid var\(--ink\); border-radius: 6px;/.test(html) && !/\.flow-step \{[^}]*box-shadow/.test(html), html.match(/\.flow-step \{[^}]*\}/)[0]);
  assert.ok(/\.flow-step\.role-ext \{ background: var\(--role-ext\); border-style: dashed; \}/.test(html));
  // --offline은 Mermaid·ELK 모듈을 모두 뺀다
  assert.ok(!r.html.includes('layout-elk') && r.html.includes('class="mermaid fallback"'));
});
test('[추정]은 [미검증]처럼 태그 칩(본문·카드 제목)', () => {
  const r = plain('# 제목\n\n원인은 업체 변경으로 보입니다 [추정].\n\n```cards\nH1. 업체 변경 [추정]\n본문입니다.\n```');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((r.html.match(/<span class="tag tag-preexisting">추정<\/span>/g) || []).length, 2);
  assert.ok(!r.html.includes('[추정]'));
});
test('규칙 2(힌트): 본문의 추천안이 요약 상자에 없음', () => {
  const rec = (summary, body) => lint(fm.replace('---\n', `---\nsummary: ${summary}\n`) + '# 제목\n\n' + body)
    .filter(f => /추천안이 있는데/.test(f.msg));
  assert.equal(rec('세 방안을 비교했습니다.', '팀은 B안을 추천합니다.').length, 1);
  assert.ok(rec('세 방안을 비교했습니다.', '팀은 B안을 추천합니다.')[0].hint);
  assert.equal(rec('세 방안을 비교했습니다.', '- B안 [추천]').length, 1);
  assert.equal(rec('B안을 추천합니다.', '팀은 B안을 추천합니다.').length, 0);
  // cards의 [추천]은 보지 않는다(요약이 "추천" 없이 고른 안을 쓰는 경우가 흔함), 코드 안도 제외
  assert.equal(rec('1위는 B안입니다.', '```cards\nA안\n본문입니다.\n\nB안 [추천]\n본문입니다.\n```').length, 0);
  assert.equal(rec('세 방안을 비교했습니다.', '```text\n추천합니다\n```').length, 0);
});
test('규칙 15(힌트): flow 단계에 실패 조건이 있으면 Mermaid 권유', () => {
  const branch = body => lint(fm + body).filter(f => /실패 조건/.test(f.msg));
  assert.equal(branch('```flow\n저장 | 주문을 저장합니다 | data\n재시도 | 저장에 실패하면 3번 재시도합니다 | logic\n```').length, 1);
  assert.equal(branch('```flow\n저장 | 주문을 저장합니다 | data\n알림 | 실패 건을 알립니다 | logic\n```').length, 0);
});
// ── 표 칸·분량·태그·출처 목록 회귀(2026-10-21) ─────────────────────────
const cellFindings = body => lint(fm + body).filter(f => /표 칸 \d+자/.test(f.msg));
const table = cells => '| 항목 | 설명 |\n| --- | --- |\n| ' + cells.join(' | ') + ' |';
test('표 칸: 60자는 허용, 61자·두 문장은 경고', () => {
  assert.equal(cellFindings(table(['이름', '가'.repeat(60)])).length, 0);
  assert.equal(cellFindings(table(['이름', '가'.repeat(61)])).length, 1);
  assert.match(cellFindings(table(['이름', '확인했다. 다시 본다.']))[0].msg, /문장 2개/);
  assert.equal(cellFindings(table(['이름', '확인했다.'])).length, 0);
});
test('표 칸: details·첫 열도 검사하고 헤더·코드·URL은 제외', () => {
  assert.equal(cellFindings('<details>\n<summary>상세</summary>\n\n' + table(['가'.repeat(61), '짧음']) + '\n</details>').length, 1);
  assert.equal(cellFindings('| ' + '가'.repeat(70) + ' | 설명 |\n| --- | --- |\n| 이름 | 짧음 |').length, 0);
  for (const value of ['`' + '가'.repeat(100) + '`', 'https://example.com/' + 'a'.repeat(100), '[주소](https://example.com/' + 'a'.repeat(100) + ')'])
    assert.equal(cellFindings(table(['이름', value])).length, 0);
  assert.equal(cellFindings('```md\n' + table(['이름', '가'.repeat(61)]) + '\n```').length, 0);
  assert.equal(cellFindings(table(['이름', '가'.repeat(30) + '\\| ' + '나'.repeat(29)])).length, 1);
});
test('표 칸: 기본 규칙7 코드 전용 칸은 details에서도 검사', () => {
  const hits = body => lint(fm + body).filter(f => /표 셀이 코드만/.test(f.msg));
  assert.equal(hits('<details>\n<summary>상세</summary>\n\n' + table(['항목', '`call()`']) + '\n</details>').length, 1);
  assert.equal(hits(table(['`key`', '일반 설명'])).length, 0);
});
test('출처 목록: 여섯 섹션·하위절 제외, 다음 동급 절부터 재검사', () => {
  const hits = body => lint(fm + body).filter(f => f.rule === 4);
  for (const name of ['출처', '참고', '근거', '참고 자료', 'Sources', 'References']) {
    assert.equal(hits('## ' + name + '\n- 문서 제목\n### 세부\n- 다른 자료').length, 0, name);
    assert.equal(hits('## ' + name + '\n- 문서 제목\n## 판단\n- 담당자 배정').length, 1, name);
  }
  assert.equal(hits('## 참고할 사항\n- 담당자 배정').length, 1);
});
test('출처 목록: URL 불릿은 규칙4만 제외, 일반 불릿은 유지', () => {
  assert.equal(lint(fm + '- [문서](https://example.com) 문서 제목\n- 원문 https://example.com 문서 제목').filter(f => f.rule === 4).length, 0);
  assert.ok(lint(fm + '## 출처\n- index.js:12 https://example.com 문서 제목').some(f => f.rule === 6));
  assert.equal(lint(fm + '- 담당자 배정').filter(f => f.rule === 4).length, 1);
});
test('새 문체 검사: plain에서는 칸·분량·태그·불릿 경고 없음', () => {
  const doc = fm + table(['이름', '가'.repeat(61)]) + '\n' + '글'.repeat(20000) + '\n[추정, 오차 큼]\n- 담당자 배정';
  assert.deepEqual(lint(doc, {plain: true, renderer: true}), []);
});
const volumeFindings = body => lint(fm + body).filter(f => /전체 읽을 글/.test(f.msg));
test('분량: 6000자 이하 허용, 6001자부터 힌트', () => {
  assert.equal(volumeFindings('가'.repeat(6000)).length, 0);
  const hits = volumeFindings('가'.repeat(6001));
  assert.equal(hits.length, 1);
  assert.match(hits[0].msg, /6001자/);
  assert.equal(hits[0].hint, true);
});
test('분량: 표·details·요약·렌더용 블록을 합산', () => {
  for (const body of [table(['항목', '글'.repeat(6001)]), '<details>\n<summary>상세</summary>\n' + '글'.repeat(6001) + '\n</details>',
    '```cards\n제목\n' + '글'.repeat(6001) + '\n```', '```flow\n제목 | ' + '글'.repeat(6001) + ' | logic\n```'])
    assert.equal(volumeFindings(body).length, 1);
  assert.equal(lint(fm.replace('---\n', '---\nsummary: ' + '글'.repeat(6001) + '\n')).filter(f => /전체 읽을 글/.test(f.msg)).length, 1);
});
test('분량: 카드 안 근거 줄도 제외하고 펜스 안 HTML 주석은 코드로 보존', () => {
  assert.equal(volumeFindings('```cards\n항목\n근거: ' + '글'.repeat(6001) + '\n```').length, 0);
  assert.equal(volumeFindings('```js\n<!--\n```\n' + '글'.repeat(6001)).length, 1);
});
test('분량: 출처·근거·코드·주소·마크업 제외, 링크 이름은 포함', () => {
  const long = '글'.repeat(6001);
  for (const body of ['## 출처\n' + long, '## 참고\n' + long, '근거: ' + long, '```js\n' + long + '\n```', '`' + long + '`', 'https://example.com/' + long,
    '[이름](https://example.com/' + long + ')', '<!--\n' + long + '\n-->', '<div class="' + long + '">짧음</div>'])
    assert.equal(volumeFindings(body).length, 0, body.slice(0, 20));
  assert.equal(volumeFindings('[' + long + '](https://example.com)').length, 1);
  assert.equal(volumeFindings('## 출처\n' + long + '\n## 판단\n' + long).length, 1);
  assert.equal(volumeFindings('가'.repeat(5999) + '😀').length, 0);
});
// C: 상태 태그는 고정 목록만 쓰고 설명을 괄호 밖에 둔다.
test('태그 변형: 경고와 최소쌍, 원문 줄 번호', () => {
  const cases = [
    ['원인은 아직 모릅니다 [추정, 오차 큼].', '원인은 아직 모릅니다 [추정]. 오차가 큽니다.'],
    ['응답은 3초입니다 [추정·실측 아님].', '응답은 3초입니다 [추정]. 실측하지 않았습니다.'],
  ];
  for (const [bad, good] of cases) {
    const hits = body => lint(fm + '# 제목\n\n' + body).filter(f => /태그 변형/.test(f.msg));
    assert.equal(hits(bad).length, 1, bad);
    assert.equal(hits(bad)[0].hint, false, bad);
    assert.equal(hits(bad)[0].line, 8, bad);
    assert.equal(hits(good).length, 0, good);
    assert.equal(lint(fm + '# 제목\n\n' + bad, {plain: true}).filter(f => /태그 변형/.test(f.msg)).length, 0, bad);
  }
});
test('목록 밖 라벨: 문서당 힌트 한 번, 종류 수와 첫 줄', () => {
  const hits = body => lint(fm + '# 제목\n\n' + body).filter(f => /라벨/.test(f.msg));
  const f = hits('복구를 지원합니다 [README 주장].\n\n출시는 [판단] 다음 주입니다.\n\n[판단] 한 번 더.');
  assert.equal(f.length, 1); assert.ok(f[0].hint); assert.equal(f[0].line, 8); assert.match(f[0].msg, /2종/);
  assert.equal(hits('README에는 복구를 지원한다고 적혀 있습니다 [미확인].').length, 0);
  assert.equal(lint(fm + '[판단] 다음 주입니다.', {plain: true}).filter(f => /라벨/.test(f.msg)).length, 0, 'plain');
});
test('태그 변형: 링크·각주·체크박스·코드는 대상 아님', () => {
  const body = [
    '[추정, 오차 큼](https://example.com)',
    '[README 주장](https://example.com/readme)',
    '![그림 설명](https://example.com/image.png)',
    '각주입니다[^주석].',
    '[^주석]: 각주 설명입니다.',
    '- [ ] 확인합니다.',
    '- [x] 완료했습니다.',
    '`[추정, 오차 큼]`',
    '```text\n[추정·실측 아님]\n```',
  ].join('\n\n');
  assert.equal(lint(fm + '# 제목\n\n' + body).filter(f => /태그 변형/.test(f.msg)).length, 0);
});
test('공용 상태 태그: 모든 이름은 배지, 미확인도 본문·카드에 렌더', () => {
  const {STATUS_TAGS} = require('./lint.js');
  assert.deepEqual(Object.keys(STATUS_TAGS), ['완료', '미검증', '미확인', '실패', '블로커', '선재', '주의', '정보', '추천', '추정']);
  const tags = Object.keys(STATUS_TAGS).map(t => `[${t}]`).join(' ');
  const r = plain('# 제목\n\n' + tags + '\n\n```cards\n검토 결과 ' + tags + '\n설명입니다.\n```');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const [tag, cls] of Object.entries(STATUS_TAGS)) {
    assert.equal(r.html.split(`<span class="tag ${cls}">${tag}</span>`).length - 1, 2, tag);
    assert.ok(!r.html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)[1].includes(`[${tag}]`), tag);
    assert.ok(!lint(fm + `[${tag}]: 설명입니다.`, {plain: true}).some(f => /참조/.test(f.msg)), tag);
  }
});
test('공용 상태 태그: 코드·목록 밖 대괄호는 배지로 바꾸지 않음', () => {
  const r = plain('# 제목\n\n`[미확인]`\n\n[임의상태]');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.html.includes('<code>[미확인]</code>'));
  assert.ok(r.html.includes('[임의상태]'));
  assert.ok(!r.html.includes('<span class="tag tag-unverified">미확인</span>'));
});
test('분량: 상태 뱃지로 시작하는 문장은 참조 정의와 구별', () => {
  assert.equal(volumeFindings('[완료]: ' + '글'.repeat(6001)).length, 1);
  assert.equal(volumeFindings('[문서]: https://example.com/' + 'a'.repeat(6001)).length, 0);
});
test('태그 변형: HTML 주석·속성·주소 제외, 실제 글과 요약·카드는 검사', () => {
  const hits = body => lint(fm + body).filter(f => /태그 변형/.test(f.msg));
  for (const body of ['<div title="[추정, 오차 큼]">본문입니다.</div>', '<!--\n[README 주장]\n-->', 'https://example.com/[추정]'])
    assert.equal(hits(body).length, 0);
  for (const body of ['<div>[추정, 오차 큼]</div>', '<details>\n<summary>상세</summary>\n[추정·실측 아님]\n</details>', '```cards\n제목 [추정, 오차 큼]\n내용\n```'])
    assert.equal(hits(body).length, 1);
  assert.equal(lint(fm.replace('title: 시험 문서', 'summary: "[추정, 오차 큼]"\ntitle: 시험 문서')).filter(f => /태그 변형/.test(f.msg)).length, 1);
});
test('표 칸: raw HTML 본문도 검사, th·코드·주석은 제외', () => {
  assert.equal(cellFindings('<table><tr><td>' + '글'.repeat(61) + '</td></tr></table>').length, 1);
  assert.equal(cellFindings('<table><thead><tr><td>' + '글'.repeat(61) + '</td></tr></thead></table>').length, 0);
  assert.equal(cellFindings('<table><tr><td><code>' + '글'.repeat(61) + '</code></td></tr></table>').length, 0);
  assert.equal(cellFindings('<table><tr><th>' + '글'.repeat(61) + '</th></tr><tr><td>짧음</td></tr></table>').length, 0);
  assert.equal(cellFindings('<details>\n<summary>상세</summary>\n<table><tr><td>확인했다.\n다시 본다.</td></tr></table>\n</details>').length, 1);
  assert.equal(cellFindings('```html\n<table><tr><td>' + '글'.repeat(61) + '</td></tr></table>\n```').length, 0);
  assert.equal(cellFindings('<!-- <table><tr><td>' + '글'.repeat(61) + '</td></tr></table> -->').length, 0);
});
// 구조 검사 결함 회귀: 렌더러와 같은 문맥에서 읽을 글·표를 검사한다.
test('출처 범위: details가 닫히면 복원하고 바깥 출처는 유지', () => {
  const {measureReading} = require('./lint.js');
  const hits = body => lint(fm + body).filter(f => /불릿이 서술어/.test(f.msg));
  for (const inner of ['## 출처\n- 문서 제목', '<details>\n<summary>안쪽</summary>\n## 출처\n- 문서 제목\n</details>']) {
    const body = '<details>\n<summary>근거</summary>\n' + inner + '\n</details>\n- 담당자 배정';
    assert.equal(hits(body).length, 1, inner);
    assert.ok(measureReading(fm + body).chars >= 6);
    assert.equal(volumeFindings(body + '\n' + '글'.repeat(6001)).length, 1);
  }
  assert.equal(hits('## 출처\n<details>\n<summary>상세</summary>\n### 설명\n</details>\n- 문서 제목').length, 0);
  assert.equal(measureReading(fm + '## 출처\n<details>\n<summary>상세</summary>\n## 판단\n</details>\n' + '글'.repeat(6001)).chars, 2);
});
test('표 칸: cards·browser의 두 펜스, HTML 표도 검사하고 flow·stats는 표 아님', () => {
  const long = '글'.repeat(61), md = table(['항목', long]);
  for (const fence of ['```', '~~~']) for (const kind of ['cards', 'browser']) {
    const body = fence + kind + '\n' + (kind === 'cards' ? '제목\n' : '') + md + '\n' + fence;
    assert.equal(cellFindings(body).length, 1, body.slice(0, 20));
    const r = render(body, ['--no-lint']);
    assert.equal(r.status, 0, r.stderr); assert.ok(r.html.includes('<table>'));
    assert.equal(cellFindings(fence + kind + '\n제목\n<table><tr><td>' + long + '</td></tr></table>\n' + fence).length, 1);
  }
  for (const kind of ['flow', 'stats', 'text']) assert.equal(cellFindings('~~~' + kind + '\n' + md + '\n~~~').length, 0);
});
test('표 칸: 주석의 같은 제외 결과를 읽기량과 공유하고 줄 번호 유지', () => {
  const {measureReading} = require('./lint.js'), md = table(['항목', '글'.repeat(61)]);
  for (const body of ['<!--\n' + md + '\n-->', '<!--\n' + md, '~~~cards\n제목\n<!--\n' + md + '\n-->\n~~~']) {
    assert.deepEqual(cellFindings(body), []);
    assert.deepEqual(measureReading(fm + body).cells, []);
  }
  const body = '<!--\n' + md + '\n-->\n' + md;
  assert.deepEqual(cellFindings(body).map(f => f.line), [13]);
  assert.deepEqual(measureReading(fm + body).cells.filter(c => c.chars > 60).map(c => c.line), [13]);
});
test('읽을 글: inline code 태그는 글자, raw HTML code만 제외', () => {
  const {measureReading} = require('./lint.js'), value = '<code>[추정, 오차 큼]</code>';
  for (const body of [value, '~~~flow\n제목 | ' + value + ' | logic\n~~~', '~~~stats\n제목 | 값 | ' + value + ' | 완료\n~~~',
    '~~~cards\n제목\n' + value + '\n~~~', '~~~cards\n<div>' + value + '</div>\n본문\n~~~',
    '~~~browser\n' + value + '\n~~~', table(['항목', value])]) {
    const hits = lint(fm + body).filter(f => /태그 변형/.test(f.msg));
    assert.equal(hits.length, 1, body);
    assert.ok(measureReading(fm + body).chars >= [...value].length, body);
    assert.equal(volumeFindings(body.replace('[추정, 오차 큼]', '글'.repeat(6001))).length, 1, body);
    const r = render(body, ['--no-lint']);
    assert.ok(r.html.includes('&lt;code&gt;'), body);
  }
  for (const body of ['<pre><code>' + value + '</code></pre>', '<div><code>' + value + '</code></div>']) {
    assert.equal(lint(fm + body).filter(f => /태그 변형/.test(f.msg)).length, 0);
    assert.equal(measureReading(fm + body).chars, 0);
  }
  assert.equal(measureReading(fm + '<div><code>바깥<code>안쪽</code>' + '글'.repeat(6001) + '</code></div>').chars, 0);
});
test('링크: 긴 라벨·대괄호 주소는 보존하고 닫힘 실패도 한 번 소비', () => {
  const {measureReading} = require('./lint.js');
  assert.equal(lint(fm + '[추정, 오차 큼](http://[::1])').filter(f => /태그 변형/.test(f.msg)).length, 0);
  assert.equal(measureReading(fm + '[이름](http://[::1])').chars, 2);
  assert.equal(measureReading(fm + '[' + '['.repeat(1000) + '](x)').chars, 1000);
});
test('렌더 문맥: overflow 필드의 code도 읽고 inline td는 표가 아님', () => {
  const {measureReading} = require('./lint.js'), value = '<code>' + '글'.repeat(6001) + '</code>';
  for (const row of ['제목 | 설명 | ' + value, '제목 | 설명 | logic | ' + value]) {
    assert.ok(measureReading(fm + '~~~flow\n' + row + '\n~~~').chars > 6000);
  }
  for (const row of ['제목 | 값 | 설명 | ' + value, '제목 | 값 | 설명 | 완료 | ' + value]) {
    assert.ok(measureReading(fm + '~~~stats\n' + row + '\n~~~').chars > 6000);
  }
  assert.deepEqual(cellFindings('문장 <td>' + '글'.repeat(61) + '</td>'), []);
});
test('렌더 문맥: literal의 미완성 HTML은 다음 블록 주석을 삼키지 않음', () => {
  const {measureReading} = require('./lint.js');
  for (const start of ['~~~flow\n제목 | <!-- | logic\n~~~', '~~~cards\n<!--\n본문\n~~~']) {
    const body = start + '\n<!--\n[추정, 오차 큼]\n' + '글'.repeat(6001) + '\n-->\n' + table(['항목', '글'.repeat(61)]);
    assert.equal(lint(fm + body).filter(f => /태그 변형/.test(f.msg)).length, 0);
    assert.ok(measureReading(fm + body).chars < 100);
    assert.equal(cellFindings(body).length, 1);
  }
});
for (const token of ['[', '<a ', '<a "', '<code>', '<pre>', '<!--', '`', '[x](', '![](', ']((', '<td>', '<thead>', '글']) {
  test('닫힘 없는 마크업 CPU 증가율: ' + token, () => {
    assertLinearTime(token, (n, reps) => {
      const doc = fm + token.repeat(Math.ceil(n / token.length));
      return cpuTime(repeat(reps, () => lint(doc)));
    });
  });
}
// 그림 예산 힌트(규칙 15)의 Mermaid·svg 스캐너 — 닫히지 않은 괄호·따옴표·태그가 반복된 긴 줄(Codex 검수 2026-10-29: 강조 정규식이 8만 자에 5.2초)
for (const [kind, token, pre = ''] of [['mermaid', 'A'], ['mermaid', 'A['], ['mermaid', 'A["'], ['mermaid', 'A -- x '], ['mermaid', 'A:::chg '], ['mermaid', 'A --> '], ['svg', '<rect '], ['svg', '<!--'], ['svg', '<path class="ln" d="M0 0 1 1 '], ['mermaid', 'A -- 예 --> '], ['svg', 'A', '<rect aria-label=">" ']]) {
  test('그림 예산 힌트 CPU 증가율: ' + kind + ' ' + pre + token, () => {
    assertLinearTime(token, (n, reps) => {
      const head = kind === 'mermaid' ? 'flowchart TD\n' : '<svg viewBox="0 0 9 9" aria-label="x">\n';
      const doc = fm + '# 제목\n\n```' + kind + '\n' + head + pre + token.repeat(Math.ceil(n / token.length)) + '\n```\n';
      return cpuTime(repeat(reps, () => lint(doc)));
    });
  });
}
// 렌더 후 검사 — 브라우저가 없는 PC에서는 건너뜀
const qa = path.join(__dirname, 'qa.js');
const runQa = file => spawnSync(process.execPath, [qa, file], {encoding: 'utf8', timeout: 120000});
test('qa: 렌더한 보고서는 세 폭 모두 넘침 없음', () => {
  if (!require('./qa.js').findBrowser()) skip('Chrome·Edge 없음');
  const r = render('# 제목\n\n## 배경\n\n**요청** — 확인.\n\n```cards\n[추천] 긴 이름 카드\n`InvoiceMailStatusNotifyTasklet`의 INV_ITEM_HIST_DETAIL_BACKUP 테이블을 본다.\n\n둘째 카드\n짧은 본문.\n```\n\n```stats\n대상 | INV317_K42P_LONG | 근거 InvoiceBatchJob.xml:11-23 | 완료\n건수 | 12건 | | 중립\n```\n');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const q = runQa(r.output);
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.equal((q.stdout.match(/넘침 0곳/g) || []).length, 3, q.stdout);
});
// 2026-10-23 사용자가 고른 보고서(손그림 흐름도·기준선 막대·전후 말풍선)를 따라 그림 블록을 넣었다
const svgFig = t => '```svg\n<svg viewBox="0 0 600 200" aria-label="시험 흐름">\n<rect class="node" x="10" y="10" width="160" height="80" rx="12"/>\n' + t
  + '\n<rect class="node" x="300" y="10" width="160" height="80" rx="12"/>\n<text class="t1" x="380" y="55" text-anchor="middle">둘째</text>\n<path class="ln" d="M170 50 H298"/>\n</svg>\n```\n';
const barsBlock = '```bars\n기준선 50 | 기준 50\n가 | 값 40 + 값 30:chg | 보조 | 결과\n```\n';
test('svg 블록: 허용 태그·속성만 남기고 / 와 role을 붙여 .fig에 넣음, 안 닫은 <svg>는 닫음', () => {
  const r = render('# 제목\n\n```svg\n<svg viewBox="0 0 400 100" aria-label="흐름" onload="alert(1)" style="x">\n<!-- 주석 -->\n'
    + '<rect class="node bad" x="0" y="0" width="100" height="50" fill="red"/>\n<script>alert(1)</script>\n<text class="t1" x="50" y="30">A &lt; B</text>\n```\n\n본문입니다.\n');
  const fig = r.html.match(/<div class="fig">[\s\S]*?<\/div>/)[0];
  assert.ok(fig.includes('<svg role="img" viewbox="0 0 400 100" aria-label="흐름">'), fig);
  assert.ok(fig.includes('<rect class="node bad" x="0" y="0" width="100" height="50" />'), fig);
  assert.ok(!/onload|style=|fill=|<script|주석/.test(fig), fig);
  assert.ok(/<\/svg>\n<\/div>$/.test(fig), fig);
  assert.ok(r.html.includes('<p>본문입니다.</p>'));
});
test('svg 블록 lint: viewBox·aria-label 없음, 지우는 태그·속성, 모르는 class', () => {
  const struct = doc => lint(fm + '# 제목\n\n' + doc).filter(f => f.rule === '구조').map(f => f.msg).join('\n');
  const msgs = struct('```svg\n<svg>\n<defs><marker id="a"/></defs>\n<rect class="node box" fill="red" x="0"/>\n</svg>\n```\n');
  for (const re of [/viewBox 없음/, /aria-label 없음/, /지우는 태그: defs, marker/, /지우는 속성: id, fill/, /모르는 class: box/]) assert.ok(re.test(msgs), msgs);
  assert.equal(struct(svgFig('<text class="t1 chg" x="90" y="55">첫째</text>')), '');
});
test('bars 블록: 누적 막대 길이·기준선·결과 색, 좁은 조각은 값을 title로, 설명(aria-label)', () => {
  const r = render('# 제목\n\n```bars\n기준선 80 | 기준 80일\n지금 | 대출 70 + 연장 30:chg | 연장함 | 100일:chg\n바꾸면 | 대출 100:bad | | 연체:bad\n작은 값 | 큰 조각 99 + 작은 조각 1\n```\n');
  const fig = r.html.match(/<div class="fig"><svg[\s\S]*?<\/svg><\/div>/)[0];
  const w = [...fig.matchAll(/<rect class="seg[^"]*" x="[\d.]+" y="\d+" width="([\d.]+)"/g)].map(m => +m[1]);
  assert.equal(w.length, 5);
  assert.ok(Math.abs(w[0] / (w[0] + w[1]) - 0.7) < 0.01 && Math.abs(w[2] - w[0] - w[1]) < 0.2, JSON.stringify(w));
  assert.ok(/<line class="thr"/.test(fig) && fig.includes('>기준 80일</text>'), fig);
  assert.ok(fig.includes('class="b-res chg"') && fig.includes('class="b-res bad"'), fig);
  assert.ok(!fig.includes('>작은 조각 1</text>') && fig.includes('<title>작은 조각 1</title>'), fig);
  assert.ok(fig.includes('aria-label="막대그래프: 지금(연장함) 대출 70 + 연장 30 → 100일; '), fig);
  // 시나리오(2026-10-23): 기준선이 결과 글자 숫자를 가로지름, 32000원이 쉼표 없이 나옴
  const r2 = render('# 제목\n\n```bars\n기준선 30000 | 무료 배송 기준\n메일 금액 | 32000원:bad | | 오해\n실제 결제 | 27000원:chg | | 배송비 3,000원 부과\n```\n');
  const thr = +r2.html.match(/<line class="thr" x1="([\d.]+)"/)[1], res = +r2.html.match(/<text class="b-res" x="([\d.]+)"[^>]*>배송비/)[1];
  assert.ok(res > thr, `결과 글자 x ${res}가 기준선 x ${thr} 뒤여야 함`);
  assert.ok(r2.html.includes('>32,000원</text>') && r2.html.includes('<title>27,000원</title>'));
  // 합이 0인 줄은 막대가 없으니 값 글자를 막대 자리에 쓴다(작업 보고서 "새 그림 0개"가 안 보이던 것)
  const r3 = render('# 제목\n\n```bars\n1차 | 새 그림 0개 | | 없음\n3차 | 새 그림 3개 | | 있음\n```\n');
  assert.ok(/<text class="b-sub" x="[\d.]+" y="\d+">새 그림 0개<\/text>/.test(r3.html), r3.html.match(/<div class="fig">[\s\S]*?<\/svg>/)[0]);
});
// 2026-10-23 시나리오 2건이 그림 블록을 안 씀 → 힌트로 짚는다. 실제 보고서 오탐("지급액 기준으로는 8.8%")은 막는다
test('힌트: 흐름+고치는 이야기 → svg, 기준값과 숫자 → bars, 숫자 나란히 표 → bars (이미 그렸으면 안 냄)', () => {
  const hint = doc => lint(fm + '# 제목\n\n' + doc).filter(f => f.hint && f.rule === 15).map(f => f.msg).join('\n');
  const flow = '## 원인\n\n```flow\n주문 | 생성 | logic\n메일 | 발송 | logic\n```\n\n## 수정 방안\n\n메일만 고치면 됩니다.\n';
  assert.ok(/고치기 전·후를 ```svg/.test(hint(flow)));
  assert.ok(!/고치기 전·후/.test(hint(flow + '\n' + svgFig('<text class="t1" x="90" y="55">첫째</text>'))));
  const limit = '## 배송비\n\n무료 배송 기준은 30,000원입니다.\n할인 전 32,000원, 할인 후 27,000원입니다.\n';
  assert.ok(/기준값\(30,000원\)과 비교하는 숫자 2개/.test(hint(limit)), hint(limit));
  assert.ok(!/기준값/.test(hint('## 세금\n\n세율은 22%, 3.3%이고 지급액 기준으로는 8.8%입니다.\n카드결제 기준 5,000원 상품 115건, 9,900원 상품 58건입니다.\n')));
  const table = '## 단계\n\n| 단계 | 9/8 주 | 10/13 주 |\n|---|---|---|\n| 시작 | 14.8% | 14.6% |\n| 인증 | 78% | 61% |\n| 완료 | 72% | 71% |\n';
  assert.ok(/숫자를 나란히 비교하는 표/.test(hint(table)));
  assert.ok(!/숫자를 나란히/.test(hint(table + '\n' + barsBlock)));
});
// 2026-10-29: "글씨가 많으면 못생기게 나온다" — 최근 보고서 157건 중 41건에 그림·표 없이 800자 넘는 섹션.
// 가장 큰 사례는 대상 6개마다 같은 굵은 항목 5개를 번호 목록 문장으로 반복한 조사 보고서였다
test('힌트: 그림·표 없는 글 덩어리 → 키워드 뽑아 모양 고르기, 대상마다 같은 항목 반복 → 비교표', () => {
  const hint = doc => lint(fm + '# 제목\n\n' + doc).filter(f => f.hint && f.rule === 15).map(f => f.msg).join('\n');
  const para = '반납 알림은 대출 기간이 끝나기 사흘 전에 문자로 나가며 연체가 생기면 하루 단위로 다시 보냅니다.\n';
  const dense = '## 알림 정책\n\n' + para.repeat(16);
  assert.ok(/"알림 정책" 글 \d+자에 그림·표 없음/.test(hint(dense)), hint(dense));
  assert.ok(!/글 \d+자에 그림/.test(hint(dense + '\n```cards\n알림\n사흘 전\n```\n')), '카드가 있으면 조용');
  assert.ok(!/글 \d+자에 그림/.test(hint('## 알림 정책\n\n요약입니다.\n\n<details>\n<summary>상세</summary>\n\n' + para.repeat(16) + '\n</details>\n')), '접힌 글은 세지 않음');
  assert.ok(!/글 \d+자에 그림/.test(hint('## 알림 정책\n\n' + para.repeat(5))), '짧으면 조용');
  const lib = name => `### ${name}\n\n1. **연장:** ${name}는 대출을 한 번 연장합니다.\n2. **예약:** ${name}는 대기 순번을 문자로 알립니다.\n3. **요금:** 연체료는 하루 100원입니다.\n\n`;
  const rep = '## 도서관별 비교\n\n' + ['가 도서관', '나 도서관', '다 도서관'].map(lib).join('');
  const h = hint(rep);
  assert.ok(/대상 3개가 같은 항목 3개\(연장, 예약, 요금\)를 글로 반복/.test(h), h);
  assert.ok(!/처리 단계/.test(h), '굵은 항목 이름으로 시작하는 번호 목록은 처리 순서가 아님: ' + h);
  assert.ok(!/같은 항목/.test(hint('## 도서관별 비교\n\n' + ['가 도서관', '나 도서관'].map(lib).join(''))), '대상 2개면 조용');
  assert.ok(!/같은 항목/.test(hint(rep.replace('### 가 도서관', '| 도서관 | 연장 |\n|---|---|\n| 가 | 1회 |\n\n### 가 도서관'))), '비교표가 있으면 조용');
  assert.ok(!/글 \d+자에 그림|같은 항목/.test(lint(fm + '# 제목\n\n' + dense + rep, {plain: true}).map(f => f.msg).join('\n')), '--plain은 문체 힌트 없음');
  const long = lint(fm + '# 제목\n\n## 긴 섹션\n\n' + '가나다라마바사.\n'.repeat(13)).find(f => /본문 13줄/.test(f.msg));
  assert.ok(long && /그림·표·카드로/.test(long.msg), long?.msg);
  // Codex 검수(2026-10-29)가 실제로 재현한 입력들
  const T = '## 분석\n\n' + '가'.repeat(800) + '\n';
  assert.ok(/처리 단계 3개/.test(hint('## 요청 처리\n\n1. **수신:** 서버가 요청을 받습니다.\n2. **검증:** 서비스가 요청을 검사합니다.\n3. **저장:** 저장소가 결과를 기록합니다.\n')), '한 번만 쓴 굵은 단계 이름은 처리 단계');
  assert.ok(/글 800자/.test(hint(T + '\n<details>\n<summary>상세</summary>\n\n~~~flow\n요청 | 처리\n~~~\n\n</details>\n')), '접힌 그림은 본문 그림이 아님');
  assert.ok(/글 800자/.test(hint(T + '\n### 출처\n\n| 출처 | 설명 |\n|---|---|\n| 공식 | 안내 |\n')), '출처 표는 본문 표가 아님');
  assert.ok(/"분석" 글 \d+자/.test(hint('## 분석\n\n<p>' + '가'.repeat(800) + '</p>\n')), 'raw HTML 글도 셈');
  assert.ok(!/HTML 글자/.test(hint('## 분석\n\n<div>\n## HTML 글자\n</div>\n\n' + '가'.repeat(800) + '\n')), 'raw HTML 안 ## 는 제목 아님');
  assert.ok(!/글 \d+자에 그림/.test(hint('## 분석\n\n![관계도](./diagram.png)\n\n' + '가'.repeat(800) + '\n')), 'Markdown 이미지는 그림');
  assert.ok(!/같은 항목/.test(hint('## 도서관별 비교\n\n<table><tr><th>도서관</th><th>연장</th></tr><tr><td>가</td><td>1회</td></tr></table>\n\n' + ['가 도서관', '나 도서관', '다 도서관'].map(lib).join(''))), 'raw 표도 표');
  const folded = '## 도서관별 비교\n\n| 도서관 | 연장 |\n|---|---|\n| 가 | 1회 |\n\n<details>\n<summary>원문</summary>\n\n' + ['가 도서관', '나 도서관', '다 도서관'].map(lib).join('') + '</details>\n';
  assert.ok(!/처리 단계/.test(hint(folded)), '표로 바꾸고 원문을 접어도 속성 목록은 처리 단계가 아님: ' + hint(folded));
  const one = (names, k) => names.map(n => `### ${n}\n\n1. **${k}:** 값입니다.\n\n`).join('');
  assert.ok(!/같은 항목/.test(hint('## 비교\n\n' + one(['A', 'B', 'C'], '비용') + one(['D', 'E', 'F'], '속도'))), '항목 둘을 함께 가진 대상이 없으면 조용');
  assert.ok(!/같은 항목/.test(hint('## 부록\n\n' + ['가 도서관', '나 도서관', '다 도서관'].map(lib).join(''))), '부록은 조용');
  // 재검수(2026-10-29)
  const R2 = (names, ks) => names.map(n => `### ${n}\n\n` + ks.map((k, i) => `${i + 1}. **${k}:** 값입니다.\n`).join('') + '\n').join('');
  assert.ok(!/같은 항목/.test(hint('## 비교\n\n' + R2(['A', 'B'], ['비용', '속도']) + R2(['C', 'D'], ['비용', '보안']) + R2(['E', 'F'], ['속도', '보안']))), '같은 항목 쌍을 가진 대상이 2개뿐이면 조용');
  const steps3 = '## 요청 처리\n\n1. **수신:** 서버가 요청을 받습니다.\n2. **검증:** 서비스가 요청을 검사합니다.\n3. **저장:** 저장소가 결과를 기록합니다.\n';
  assert.ok(/처리 단계 3개/.test(hint(steps3 + '\n## 부록\n\n<details>\n<summary>원문</summary>\n\n' + R2(['A', 'B', 'C'], ['수신', '검증', '저장']) + '</details>\n')), '다른 섹션의 반복 항목이 처리 단계를 숨기지 않음');
  assert.ok(/글 \d+자에 그림/.test(hint(T + '\n`![그림](./x.png)`\n')), '코드 안 이미지 문법은 그림 아님');
  assert.ok(/글 \d+자에 그림/.test(hint(T + "\n<div title='<img src=x>'>설명</div>\n")), 'HTML 속성 안 <img>는 그림 아님');
  assertLinearTime('닫히지 않은 이미지 문법', (n, reps) => cpuTime(repeat(reps, () => lint(fm + '## 분석\n\n' + '![foo'.repeat(n / 5)))));
  assertLinearTime('반복 항목 H3 많음', (n, reps) => cpuTime(repeat(reps, () => lint(fm + '## 비교\n\n' + Array.from({length: n / 50}, (_, i) => [0, 1, 2].map(j => `### 대상${i}-${j}\n1. **항목${i}:** 설명입니다.\n`).join('')).join('')))));
  assertLinearTime('글 덩어리·반복 항목',(n, reps) => cpuTime(repeat(reps, () => lint(fm + '## 가\n\n### 나\n\n1. **' + '가'.repeat(n) + '\n'))));
});
test('bars 블록 lint: 숫자 없는 값·모르는 색·칸 5개', () => {
  const msgs = lint(fm + '# 제목\n\n```bars\n가 | 많음\n나 | 대출 14일:red\n다 | 1 | 2 | 3 | 4\n```\n').filter(f => f.rule === '구조').map(f => f.msg).join('\n');
  assert.ok(/막대 값 "많음"/.test(msgs) && /색 ":red"/.test(msgs) && /bars 칸 5개/.test(msgs), msgs);
});
test('cards compare는 말풍선(실패 빨강·추천 주황, 태그 글자 유지), ●○○는 정도 표시, 우측 목차 없음', () => {
  const r = render('# 제목\n\n```cards compare\n받는 문자 [실패]\n1권 중 0권 반납\n\n고친 뒤 [추천]\n1권 중 1권 반납\n\n영향 없음\n그대로입니다.\n```\n\n영향 범위 ●○○ 한 곳입니다.\n');
  assert.ok(r.html.includes('<div class="bubble bad"><small><span class="tag tag-fail">실패</span>받는 문자</small>'), r.html.match(/<div class="pair">[\s\S]{0,400}/)[0]);
  assert.ok(r.html.includes('<div class="bubble chg"><small><span class="tag tag-recommend">추천</span>고친 뒤</small>'));
  assert.ok(r.html.includes('<div class="bubble"><small>영향 없음</small>'));
  assert.ok(r.html.includes('<span class="dots">●○○</span>'));
  assert.ok(!/class="toc"|toc-list/.test(r.html) && /--content-w: 1060px/.test(r.html));
});
test('qa: 그림 안 글자가 상자 밖으로 나가거나 겹치면 exit 1, 고친 그림·막대는 통과', () => {
  if (!require('./qa.js').findBrowser()) skip('Chrome·Edge 없음');
  const bad = render('# 제목\n\n' + svgFig('<text class="t1" x="90" y="55" text-anchor="middle">상자보다 훨씬 긴 첫째 단계 이름</text>\n<text class="lbl" x="380" y="57">겹침</text>'));
  let q = runQa(bad.output);
  assert.equal(q.status, 1, q.stdout + q.stderr);
  assert.ok(/상자 밖으로 나감 \d+px\s+"상자보다 훨씬 긴/.test(q.stdout) && /글자끼리 겹침 \d+px\s+"겹침 \/ 둘째"/.test(q.stdout), q.stdout.split('\n').slice(4).join('\n'));
  const good = render('# 제목\n\n' + svgFig('<text class="t1" x="90" y="55" text-anchor="middle">첫째</text>') + '\n' + barsBlock);
  q = runQa(good.output);
  assert.equal(q.status, 0, q.stdout + q.stderr);
});
test('qa: 화면보다 넓은 md 그림도 칸 폭에 맞춰 줄어 넘침 없음', () => {
  if (!require('./qa.js').findBrowser()) skip('Chrome·Edge 없음');
  fs.writeFileSync(path.join(dir, 'wide.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="2200" height="300"><rect width="2200" height="300" fill="#ccc"/></svg>');
  const r = render('# 제목\n\n## 그림\n\n![넓은 그림](wide.svg)\n');
  const q = runQa(r.output);
  assert.equal(q.status, 0, q.stdout + q.stderr);
});
test('qa: 칸 밖으로 나간 글자·대상 없는 #링크는 exit 1', () => {
  if (!require('./qa.js').findBrowser()) skip('Chrome·Edge 없음');
  const f = path.join(dir, 'qa-bad.html');
  fs.writeFileSync(f, '<!doctype html><html><head><meta charset="utf-8"></head><body><main>' +
    '<div class="box" style="width:120px;white-space:nowrap">줄바꿈 없이 아주 길게 이어지는 문장이 상자 밖으로 나간다</div>' +
    '<p id="here"><a href="#here">있음</a> <a href="#없는곳">없음</a></p></main></body></html>');
  const q = runQa(f);
  assert.equal(q.status, 1, q.stdout + q.stderr);
  assert.ok(/div\.box/.test(q.stdout) && /#없는곳/.test(q.stdout) && !/#here/.test(q.stdout), q.stdout);
});
// 2026-10-22 시나리오 재실행: 대상 문서 3건이 독자 검사를 "짧은 문서"라며 건너뜀, 근거 파일 링크는 렌더하지 않으면 깨짐
test('독자 회수 검사 대상은 lint가 판정해 출력(H2 4개·리더·외부·결정 요청), --plain은 출력 안 함', () => {
  const {readerCheckNeed} = require('./lint.js');
  const h2 = n => Array.from({length: n}, (_, i) => `\n## 절 ${i}\n\n내용입니다.\n`).join('');
  assert.deepEqual(readerCheckNeed(fm + '# 제목\n' + h2(3)), []);
  assert.deepEqual(readerCheckNeed(fm + '# 제목\n' + h2(4)), ['H2 4개']);
  assert.deepEqual(readerCheckNeed(fm.replace('team', 'leadership') + '# 제목\n'), ['audience leadership']);
  assert.deepEqual(readerCheckNeed(fm + '# 제목\n\n> 11/1까지 결정해 주세요.\n' + h2(1)), ['결정 요청']);
  assert.deepEqual(readerCheckNeed(fm + '# 제목\n\n```cards\nB안 [추천]\n본문입니다.\n```\n'), ['결정 요청']);
  assert.deepEqual(readerCheckNeed(fm + '# 제목\n\n```text\n## 코드 안 제목\n[추천]\n```\n'), []);
  assert.ok(/독자 회수 검사 대상\(H2 4개\)/.test(render('# 제목\n' + h2(4)).stdout));
  assert.ok(!/독자 회수 검사/.test(plain('# 제목\n' + h2(4)).stdout));
});
// Mermaid는 폭 검사와 따로, 원래 페이지에서 그려지기를 기다려 본다. CDN을 못 받으면(폐쇄망·샌드박스) 건너뜀
test('qa: Mermaid 문법 오류는 exit 1, 고치면 통과', () => {
  if (!require('./qa.js').findBrowser()) skip('Chrome·Edge 없음');
  const live = body => { const r = render('# 제목\n\n' + body); const out = r.input.replace(/\.md$/, '-live.html');
    assert.equal(run(r.input, '-o', out, '--no-lint').status, 0); return out; };
  let q = runQa(live('```mermaid\nflowchart TD\n  A[시작 -->\n```\n'));
  if (/Mermaid 미검사|그려지지 않음/.test(q.stdout)) skip('Mermaid CDN에 닿지 않음');
  assert.equal(q.status, 1, q.stdout + q.stderr);
  assert.ok(/Mermaid 문법 오류 1개/.test(q.stdout), q.stdout);
  q = runQa(live('```mermaid\nflowchart TD\n  A[시작] --> B[끝]\n```\n\n```mermaid\nsequenceDiagram\n  A->>B: 요청\n```\n'));
  assert.equal(q.status, 0, q.stdout + q.stderr);
  assert.ok(!/Mermaid/.test(q.stdout), q.stdout);
});
test('qa: 렌더하지 않은 옆 보고서로 가는 링크는 exit 1, 렌더하면 통과', () => {
  if (!require('./qa.js').findBrowser()) skip('Chrome·Edge 없음');
  const side = path.join(dir, 'case-side-근거.md');
  fs.writeFileSync(side, fm + '# 근거\n\n## 배경\n\n- **요청** — 요청입니다.\n- **현상** — 현상입니다.\n');
  const r = render('# 제목\n\n본문입니다.\n\n근거: [상세 근거](case-side-근거.md)\n');
  assert.ok(r.html.includes('href="case-side-근거.html"'), r.html.match(/href="[^"]*근거[^"]*"/g));
  let q = runQa(r.output);
  assert.equal(q.status, 1, q.stdout + q.stderr);
  assert.ok(/없는 파일로 가는 링크 1개: case-side-근거\.html/.test(q.stdout), q.stdout);
  assert.equal(run(side, '--offline').status, 0);
  q = runQa(r.output);
  assert.equal(q.status, 0, q.stdout + q.stderr);
});
console.log(`${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}; artifacts: ${dir}`);
process.exit(failed ? 1 : 0);
