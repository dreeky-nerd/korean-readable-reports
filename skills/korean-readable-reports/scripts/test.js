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
let passed = 0, failed = 0, seq = 0;
const fm = '---\ntitle: 시험 문서\ndate: 2026-09-22\naudience: team\n---\n';
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + e.message.split('\n').slice(0, 4).join('\n  ')); }
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
  for (const s of ['설정을 바꿔도 반영이 안 되는 이유가 이것입니다.', '재시도가 늘어난 이유다.', '캐시를 끈 이유입니다.']) assert.equal(hint(s, /이유/).length, 1, s);
  for (const s of ['실패 이유는 세 가지입니다.', '이유를 로그에서 확인했습니다.']) assert.equal(hint(s, /이유/).length, 0, s);
  // 분열문 "핵심은 ~이다": 2회부터
  assert.equal(hint('핵심은 재시도 횟수입니다.', /분열문/).length, 0);
  assert.equal(hint('핵심은 재시도 횟수입니다.\n\n문제는 타임아웃 설정입니다.', /분열문/).length, 1);
  assert.equal(hint('문제는 없었습니다.\n\n문제는 없었습니다.', /분열문/).length, 0);
  // 범위 상승 "단순한 X를 넘어": 1회부터
  assert.equal(hint('단순한 캐시를 넘어 세션 저장소로 씁니다.', /범위 상승/).length, 1);
  assert.equal(hint('요청 수가 한도를 넘어 실패했습니다.', /범위 상승/).length, 0);
  // 코드·따옴표 안은 남의 말
  assert.equal(hint('"캐시가 아니라 DB" 라는 제목\n\n`A가 아니라 B`', /부정 대구/).length, 0);
});

test('규칙 14: 좁은 문맥 판별로 남긴 알려진 미검출', () => {
  // 알려진 미검출: 오탐을 줄인 대상/어미/단어 경계 밖의 나쁜 표현. 해소 전까지 검출을 기대하지 않는다.
  const missed = [
    ['B1 패킷 은유', '패킷이 흘러갑니다.'],
    ['B2 대상 생략 — examples.md의 나쁜 예문', '조립합니다.'],
    ['B3 기존 미검출 — 이번 축소와 무관한 활용형', '서비스가 API 창구를 엽니다.'],
    ['B5 관형형 용언', '진짜 등록된 호텔인지 확인합니다.'],
    ['B5 평서형 용언', '응답이 진짜 느리다.'],
    ['B7 복합 풀이 — examples.md의 나쁜 예문', '상품 목록(DB 설정값)을 바꿉니다.'],
    ['B8 피동 어미 미등록', '토큰은 서버에 의해 발급되곤 합니다.'],
    ['B12 있다 없는 속성', '관리자는 권한을 가지고 처리합니다.'],
  ];
  for (const [id, sentence] of missed) {
    assert.deepEqual(lint(fm + sentence).filter(f => f.rule === 14), [], `알려진 미검출 ${id}: ${sentence}`);
  }
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
  assert.ok(r.html.includes('기준일 미기재')); assert.ok(!r.html.includes(new Date().toISOString().slice(0, 10)));
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
  const t = Date.now(); const r = render('# 제목\n\n<div><' + 'a'.repeat(50000) + '"x></div>', ['--no-lint']);
  assert.equal(r.status, 0); assert.ok(Date.now() - t < 1500, (Date.now() - t) + 'ms');
  const t2 = Date.now(); lint(fm + '<' + 'a'.repeat(50000)); lint(fm + '<' + 'a'.repeat(50000), {plain: true}); assert.ok(Date.now() - t2 < 500, 'lint ' + (Date.now() - t2) + 'ms');
});
test('바탕화면 대체 경로도 원본·링크 보호', () => {
  // 쓸 수 없는 위치(-o 대상 폴더가 파일)에서 바탕화면 reports/로 넘어갈 때, 그 경로가 원본 md면 거부
  const home = fs.mkdtempSync(path.join(dir, 'home-')); const reports = path.join(home, 'Desktop', 'reports'); fs.mkdirSync(reports, {recursive: true});
  const input = path.join(reports, 'same.md'); fs.writeFileSync(input, fm + '# 제목\n본문'); const before = fs.readFileSync(input, 'utf8');
  const ro = path.join(dir, 'readonly-' + seq); fs.mkdirSync(ro); fs.chmodSync(ro, 0o555);   // 쓰기 실패 = EACCES → 바탕화면으로
  const r = spawnSync(process.execPath, [renderer, input, '-o', path.join(ro, 'same.md'), '--no-lint'], {encoding: 'utf8', env: {...process.env, HOME: home, USERPROFILE: home}});
  fs.chmodSync(ro, 0o755);
  assert.equal(fs.readFileSync(input, 'utf8'), before, r.stdout + r.stderr); assert.notEqual(r.status, 0);
});

// ── 출력 파일 보호 ──────────────────────────────────────────────────────────
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
  const r = plain('# 제목\n본문', ['--strict']); const target = path.join(dir, 'not-created.html'); const alias = path.join(dir, 'symlink.html'); fs.symlinkSync(target, alias);
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
console.log(`${passed} passed, ${failed} failed; artifacts: ${dir}`);
process.exit(failed ? 1 : 0);
