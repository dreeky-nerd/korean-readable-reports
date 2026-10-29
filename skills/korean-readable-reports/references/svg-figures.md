# 손으로 그리는 그림 — ```svg 뼈대 8종

그림을 ```svg로 그리기로 했을 때만 읽는다. 그릴지와 무엇으로 그릴지는 SKILL.md 규칙 15가 정한다.
연결선 규칙과 그림 종류별 배치는 [diagram-design](https://github.com/cathrynlavery/diagram-design)(Cathryn Lavery, MIT)에서 가져와
우리 class와 한글 글자 크기에 맞췄다. 좌표와 예시 내용은 새로 정했다. 고지는 스킬 폴더의 `LICENSE`에 있다.

## 1. Mermaid로 둘까, 손으로 그릴까

순서대로 묻고 처음 "예"에서 멈춘다.

1. **오프라인으로 보내는 문서인가?** `render.js --offline`은 Mermaid를 소스 글자로 보여 준다. 그림이 꼭 있어야 하면 svg로 그린다. 크면 개요 1장과 상세 그림으로 나눈다.
2. **배치가 곧 메시지인가?** 같은 좌표의 전후 그림, 위아래 순서가 위계인 층, 날짜 간격이 실제와 같아야 하는 타임라인, 위치가 판정인 사분면이 해당된다. Mermaid는 상자를 스스로 옮기므로 svg로 그린다.
3. **나머지는 Mermaid.** 분기·반복이 많은 흐름, 메시지 6개 이상인 시퀀스, 전이가 많은 상태는 좌표를 손으로 세면 틀리기 쉽다.

크기 예산은 둘 다 같다. 상자 9개·화살표 12개 안쪽, 시퀀스 참여자 5명, 층 6개, 사분면 항목 12개, 타임라인 사건 8개까지다. 넘으면 먼저 나눈다.

## 2. class

색과 선 모양은 class로만 준다. 렌더러는 `fill`·`stroke`·`style`·`id`·`marker`·`defs`를 지운다(다크 모드에서 색이 안 바뀌기 때문). 모르는 class는 lint가 알린다.

| class | 붙이는 곳 | 모양 |
|---|---|---|
| `node` | `rect`·`polygon`(마름모)·`circle` | 회색 상자 |
| `node ext` · `node data` | 같음 | 외부(흰 바탕 점선) · 저장소(옅은 청록) — 역할이라 강조가 아니다 |
| `node bad` · `node chg` · `node mute` | 같음 | 빨강 점선(문제) · 주황 굵게(바뀌는 곳·핵심) · 빈 점선(그대로·비어 있음). `data chg`처럼 겹치면 강조가 이긴다 |
| `zone` · `zone chg` | `rect` | 묶음 영역(옅은 바탕+얇은 테두리) · 주황 테두리. 상자보다 먼저 그린다 |
| `ln` · `ln bad` · `ln chg` · `ln mute` | `path`·`line` | 회색 화살표 · 빨강 점선 · 주황 굵게 · 회색 점선(응답·선택) |
| `ln bare` | `path`·`line` | 화살촉 없는 연결선 |
| `hair` · `hair mute` | `line`·`path` | 축·생명선·구분선 1단위 · 점선. 관계가 아니라 자리를 알린다 |
| `dot` · `dot chg` · `dot bad` | `circle` | 사건·항목·시작점 |
| `t1` · `t2` | `text` | 이름 17px 굵게 · 설명 13.5px 회색 |
| `lbl` | 선 옆 `text` | 선 라벨 13.5px 굵게. 바탕색 후광이 뒤에 깔린다 |
| `tag` | `text` | 층 번호·영역 이름·축 이름·날짜 12px 굵게 회색 |
| `bad` · `chg` (글자에) | `t2`·`lbl`·`tag`에 덧붙임 | 빨강·주황 굵은 글자 |

## 3. 모든 그림에 통하는 규칙

**그리는 순서는 영역 → 연결선 → 상자 → 글자다.** 선 끝이 상자 테두리 밑으로 숨고, 라벨은 상자에 가리지 않는다.

**연결선 여섯 가지** — qa가 `ln` 선·`node` 상자·`lbl` 라벨만 골라 경고로 알린다(문제 수에는 안 넣지만 고친다). 1번 사선은 lint가 본다.

1. **직각으로만 꺾는다.** `d="M x y H x2 V y2 H x3"`. 사선은 lint가 알린다. 다만 절대좌표 `M`·`L`·`H`·`V`로 쓴 `path`와 `line`·`polyline`만 보고, 상대좌표(`l`·`h`)나 `transform`이 있는 그림은 건너뛴다.
2. **변에 수직으로 나가고 들어온다.** 위·아래 변이면 세로로, 옆 변이면 가로로 출입한다. 연결점은 모서리에서 8 이상 떨어뜨린다. 테두리를 따라 달리면 선이 상자 뒤에 숨는다.
3. **같은 변에 선이 둘이면 연결점을 12 이상 띄운다.** 한 점에서 갈라지면 공통 줄기가 겹쳐 두 선이 하나로 보인다. 변 길이 L에 선 N개면 k번째 점은 변 시작에서 L×k/(N+1)이다.
4. **선끼리 겹치지 않는다.** 나란히 가면 12 이상 띄운다. 겹칠 수밖에 없으면 상자가 너무 가깝거나 예산을 넘은 것이다. 그때는 나눈다.
5. **상자 뒤로 지나가지 않는다.** 시작·끝이 아닌 상자는 돌아간다. 시작·끝 상자라도 선 중간에 다시 들어가면 경고한다.
6. **라벨은 선에서 6~10 띄운다.** 가로선이면 위에, 세로선이면 옆에 둔다. 열린 바탕에 두고 상자에 걸치지 않는다.

**선 끝은 다음 상자 테두리 2 앞에서 멈춘다.** 화살촉 끝이 선 끝에 놓이므로 테두리와 2 떨어진다. 화살촉 크기는 선 굵기와 무관하게 10이다.

**크기**
- viewBox 폭은 1000이다(전후 그림만 1100). 상자 좌표·폭·간격은 되도록 10이나 4의 배수로 둔다. 맞춰 두면 줄이 가지런하다.
- 상자 폭은 가장 긴 줄의 글자 수 × 글자 크기 + 24 이상이다. 한글 한 자는 글자 크기와 폭이 거의 같다.
- 한 상자에 세 줄까지(`t1` 한 줄 + `t2` 두 줄), 줄 간격은 18 이상이다. 상자 안 글자는 상자 가운데 x에 `text-anchor="middle"`로 둔다.
- 상자 높이는 64~72(두 줄)다. 모서리는 상자 `rx="6"`, 영역 `rx="8"`, 시작·끝 `rx`=높이의 절반이다.
- 글자는 12px 아래로 줄이지 않는다. 안 들어가면 상자를 넓히거나 글을 줄인다.

**강조와 설명**
- 강조(`chg`)는 1~2개, 문제(`bad`)는 깨지는 곳만 칠한다. 나머지는 회색이나 역할 색(`ext`·`data`) 그대로 둔다.
- 색의 뜻을 본문이 말하지 않으면 그림 아래에 `hair` 구분선과 `tag` 범례 한 줄을 둔다. 색만으로 구분하지 않고 글자(`t2 bad` "비어 있음")도 쓴다.
- `aria-label`은 그림이 말하는 내용을 한 문장으로 쓴다. "상자 세 개"처럼 모양을 읊지 않는다.
- 교차 기호(선 건너뛰기)는 쓰지 않는다. 선이 교차하면 배치를 바꾼다.

## 4. 뼈대

뼈대를 복사해서 글과 좌표만 바꾼다. 아래 8개는 qa 경고 0으로 확인했다.

### 4-1. 결정 흐름도 — "어느 조건에서 갈리나"

시작·끝은 둥근 상자, 판단은 마름모다. 걸리면(연체 있음·한도 넘음) 오른쪽으로 빠지고, 통과하면 아래로 간다. 갈래마다 라벨을 단다. 마름모 출구는 3개까지만 둔다.

```svg
<svg viewBox="0 0 1000 490" aria-label="대출 신청은 연체와 한도를 차례로 확인해, 둘 다 통과하면 대출이 완료된다">
  <path class="ln" d="M350 68 V98"/>
  <path class="ln" d="M470 150 H588"/>
  <path class="ln" d="M350 200 V248"/>
  <path class="ln" d="M470 300 H588"/>
  <path class="ln chg" d="M350 350 V398"/>

  <rect class="node" x="250" y="20" width="200" height="48" rx="24"/>
  <polygon class="node" points="350,100 470,150 350,200 230,150"/>
  <polygon class="node" points="350,250 470,300 350,350 230,300"/>
  <rect class="node" x="590" y="118" width="200" height="64" rx="32"/>
  <rect class="node" x="590" y="268" width="200" height="64" rx="32"/>
  <rect class="node chg" x="250" y="400" width="200" height="64" rx="32"/>

  <text class="t1" x="350" y="50" text-anchor="middle">대출 신청</text>
  <text class="t1" x="350" y="156" text-anchor="middle">연체가 있나</text>
  <text class="t1" x="350" y="306" text-anchor="middle">한도를 넘나</text>
  <text class="t1" x="690" y="146" text-anchor="middle">연체 안내</text>
  <text class="t2" x="690" y="168" text-anchor="middle">반납한 뒤 다시 신청</text>
  <text class="t1" x="690" y="296" text-anchor="middle">한도 안내</text>
  <text class="t2" x="690" y="318" text-anchor="middle">빌린 책을 먼저 반납</text>
  <text class="t1" x="350" y="428" text-anchor="middle">대출 완료</text>
  <text class="t2" x="350" y="450" text-anchor="middle">반납일 문자 발송</text>
  <text class="lbl" x="529" y="136" text-anchor="middle">있음</text>
  <text class="lbl" x="364" y="230">없음</text>
  <text class="lbl" x="529" y="286" text-anchor="middle">넘음</text>
  <text class="lbl chg" x="364" y="380">안 넘음</text>
</svg>
```

### 4-2. 순서도(시퀀스) — "누가 누구에게 언제"

참여자 상자는 위에 한 줄로 두고, 생명선(`hair mute`)을 아래로 내린다. 메시지는 위에서 아래로 시간순이다. 요청은 `ln`, 응답은 `ln mute`(점선)다. 메시지 간격은 50이다. 참여자는 5명까지다.

```svg
<svg viewBox="0 0 1000 400" aria-label="대출 신청이 화면과 서버를 거쳐 회원 DB에서 연체를 확인한 뒤 반납일 안내로 돌아온다">
  <line class="hair mute" x1="130" y1="68" x2="130" y2="390"/>
  <line class="hair mute" x1="380" y1="68" x2="380" y2="390"/>
  <line class="hair mute" x1="630" y1="68" x2="630" y2="390"/>
  <line class="hair mute" x1="880" y1="68" x2="880" y2="390"/>

  <path class="ln" d="M130 120 H378"/>
  <path class="ln" d="M380 170 H628"/>
  <path class="ln" d="M630 220 H878"/>
  <path class="ln mute" d="M880 270 H632"/>
  <path class="ln mute chg" d="M630 320 H382"/>
  <path class="ln mute" d="M380 370 H132"/>

  <rect class="node ext" x="55" y="20" width="150" height="48" rx="6"/>
  <rect class="node" x="305" y="20" width="150" height="48" rx="6"/>
  <rect class="node" x="555" y="20" width="150" height="48" rx="6"/>
  <rect class="node data" x="805" y="20" width="150" height="48" rx="6"/>

  <text class="t1" x="130" y="50" text-anchor="middle">이용자</text>
  <text class="t1" x="380" y="50" text-anchor="middle">대출 화면</text>
  <text class="t1" x="630" y="50" text-anchor="middle">대출 서버</text>
  <text class="t1" x="880" y="50" text-anchor="middle">회원 DB</text>
  <text class="lbl" x="255" y="108" text-anchor="middle">대출 신청</text>
  <text class="lbl" x="505" y="158" text-anchor="middle">대출 요청</text>
  <text class="lbl" x="755" y="208" text-anchor="middle">연체·한도 조회</text>
  <text class="lbl" x="755" y="258" text-anchor="middle">연체 0건</text>
  <text class="lbl chg" x="505" y="308" text-anchor="middle">대출 완료</text>
  <text class="lbl" x="255" y="358" text-anchor="middle">반납일 안내</text>
</svg>
```

### 4-3. 구조도 — "무엇이 무엇에 붙어 있나"

같은 서버·팀 안의 것은 `zone`으로 묶고 영역 이름은 `tag`로 왼쪽 위에 둔다. 외부는 `node ext`, 저장소는 `node data`다. 흐름은 왼쪽에서 오른쪽으로 간다. 한 상자에 들어오는 선이 둘이면 연결점을 띄운다(대출 DB 왼쪽 변 y=132·154).

```svg
<svg viewBox="0 0 1000 300" aria-label="이용자 앱의 대출 신청은 대출 API가 DB에 저장하고, 알림 작업이 DB를 읽어 문자 업체로 보낸다">
  <rect class="zone" x="270" y="24" width="400" height="256" rx="8"/>

  <path class="ln" d="M180 150 H288"/>
  <path class="ln" d="M450 132 H738"/>
  <path class="ln" d="M610 190 V154 H738"/>
  <path class="ln chg" d="M650 236 H738"/>

  <rect class="node ext" x="20" y="114" width="160" height="72" rx="6"/>
  <rect class="node" x="290" y="96" width="160" height="72" rx="6"/>
  <rect class="node chg" x="490" y="190" width="160" height="72" rx="6"/>
  <rect class="node data" x="740" y="96" width="200" height="72" rx="6"/>
  <rect class="node ext" x="740" y="200" width="200" height="72" rx="6"/>

  <text class="tag" x="286" y="48">도서관 서버</text>
  <text class="t1" x="100" y="146" text-anchor="middle">이용자 앱</text>
  <text class="t2" x="100" y="168" text-anchor="middle">웹·모바일</text>
  <text class="t1" x="370" y="128" text-anchor="middle">대출 API</text>
  <text class="t2" x="370" y="150" text-anchor="middle">대출·반납 처리</text>
  <text class="t1" x="570" y="222" text-anchor="middle">알림 작업</text>
  <text class="t2" x="570" y="244" text-anchor="middle">10분마다</text>
  <text class="t1" x="840" y="128" text-anchor="middle">대출 DB</text>
  <text class="t2" x="840" y="150" text-anchor="middle">대출·반납 기록</text>
  <text class="t1" x="840" y="232" text-anchor="middle">문자 발송 업체</text>
  <text class="t2" x="840" y="254" text-anchor="middle">외부</text>
  <text class="lbl" x="226" y="138" text-anchor="middle">대출 신청</text>
  <text class="lbl" x="540" y="120" text-anchor="middle">기록 저장</text>
  <text class="lbl chg" x="694" y="224" text-anchor="middle">문자</text>
</svg>
```

### 4-4. 상태 — "무엇이 상태를 바꾸나"

상태는 `rx="8"` 상자, 시작은 `dot`이다. 전이 라벨은 그 상태를 바꾸는 사건이다. 문제 상태는 `bad`, 눈여겨볼 상태는 `chg`로 칠한다. 다른 상태를 건너뛰는 전이는 아래로 돌아간다. 전이가 많아 선이 엉키면 책임별로 나누거나 Mermaid `stateDiagram-v2`로 그린다.

```svg
<svg viewBox="0 0 1000 224" aria-label="대출 중인 책은 기한 안에 반납하면 바로 반납 완료가 되고, 반납일이 지나면 연체를 거친다">
  <path class="ln" d="M47 110 H98"/>
  <path class="ln bad" d="M280 110 H458"/>
  <path class="ln" d="M640 110 H778"/>
  <path class="ln" d="M190 142 V200 H870 V144"/>

  <circle class="dot" cx="40" cy="110" r="7"/>
  <rect class="node" x="100" y="78" width="180" height="64" rx="8"/>
  <rect class="node bad" x="460" y="78" width="180" height="64" rx="8"/>
  <rect class="node" x="780" y="78" width="180" height="64" rx="8"/>

  <text class="t1" x="190" y="116" text-anchor="middle">대출 중</text>
  <text class="t1" x="550" y="106" text-anchor="middle">연체</text>
  <text class="t2 bad" x="550" y="128" text-anchor="middle">새 대출 막힘</text>
  <text class="t1" x="870" y="116" text-anchor="middle">반납 완료</text>
  <text class="lbl" x="72" y="96" text-anchor="middle">대출</text>
  <text class="lbl bad" x="369" y="96" text-anchor="middle">반납일이 지남</text>
  <text class="lbl" x="709" y="96" text-anchor="middle">반납</text>
  <text class="lbl" x="530" y="188" text-anchor="middle">기한 안에 반납</text>
</svg>
```

### 4-5. 층 쌓기 — "어느 층에서 일어나나"

같은 x·같은 폭의 띠를 쌓는다. 한 줄에 왼쪽 번호(`tag`), 이름(`t1`), 오른쪽 끝 설명(`t2`, `text-anchor="end"`)을 둔다. 위계 방향은 왼쪽 여백의 `hair`와 `tag`로 표시한다. 강조 층은 하나만 두고 **맨 마지막에 그린다**. 그래야 이웃 층이 주황 테두리를 덮지 않는다. 층은 6개까지다.

```svg
<svg viewBox="0 0 1000 380" aria-label="도서관 시스템은 화면부터 저장소까지 다섯 층이고, 연체·한도 계산은 업무 규칙 층에서 일어난다">
  <line class="hair" x1="70" y1="50" x2="70" y2="330"/>
  <text class="tag" x="70" y="36" text-anchor="middle">이용자 쪽</text>
  <text class="tag" x="70" y="356" text-anchor="middle">데이터 쪽</text>

  <rect class="node" x="120" y="30" width="840" height="64"/>
  <rect class="node" x="120" y="94" width="840" height="64"/>
  <rect class="node" x="120" y="222" width="840" height="64"/>
  <rect class="node data" x="120" y="286" width="840" height="64"/>
  <rect class="node chg" x="120" y="158" width="840" height="64"/>

  <text class="tag" x="140" y="67">L5</text>
  <text class="t1" x="200" y="68">화면</text>
  <text class="t2" x="940" y="67" text-anchor="end">이용자 앱 · 무인 반납기</text>
  <text class="tag" x="140" y="131">L4</text>
  <text class="t1" x="200" y="132">API</text>
  <text class="t2" x="940" y="131" text-anchor="end">대출 · 반납 · 예약</text>
  <text class="tag chg" x="140" y="195">L3</text>
  <text class="t1" x="200" y="196">업무 규칙</text>
  <text class="t2 chg" x="940" y="195" text-anchor="end">연체 · 한도 계산 — 이번에 바뀜</text>
  <text class="tag" x="140" y="259">L2</text>
  <text class="t1" x="200" y="260">작업</text>
  <text class="t2" x="940" y="259" text-anchor="end">알림 · 정산</text>
  <text class="tag" x="140" y="323">L1</text>
  <text class="t1" x="200" y="324">저장소</text>
  <text class="t2" x="940" y="323" text-anchor="end">회원 · 도서 DB</text>
</svg>
```

### 4-6. 타임라인 — "언제, 얼마나 떨어져"

가운데 `hair` 기준선에 사건을 `dot`으로 찍는다. **x는 날짜에 비례한다.** 시작일~끝일 D일을 폭 W에 펴면 x = 시작 x + W × (날짜 − 시작일) / D다(아래는 3월 1일~7월 1일 122일을 60~940에). 간격이 실제와 다르면 독자가 속도를 잘못 읽는다. 라벨은 위·아래를 번갈아 두고 `hair` 줄기로 점과 잇는다. 달 눈금 글자와 줄기가 겹치지 않게 사건 위치를 본다. 사건은 8개까지다.

```svg
<svg viewBox="0 0 1000 226" aria-label="무인 반납기는 3월에 설치됐고, 4월 27일 반납 목록 누락을 발견해 일주일 뒤 고쳤다">
  <line class="hair" x1="60" y1="120" x2="940" y2="120"/>
  <line class="hair" x1="60" y1="114" x2="60" y2="126"/>
  <line class="hair" x1="284" y1="114" x2="284" y2="126"/>
  <line class="hair" x1="500" y1="114" x2="500" y2="126"/>
  <line class="hair" x1="724" y1="114" x2="724" y2="126"/>
  <line class="hair" x1="940" y1="114" x2="940" y2="126"/>
  <text class="tag" x="60" y="144" text-anchor="middle">3월</text>
  <text class="tag" x="284" y="144" text-anchor="middle">4월</text>
  <text class="tag" x="500" y="144" text-anchor="middle">5월</text>
  <text class="tag" x="724" y="144" text-anchor="middle">6월</text>
  <text class="tag" x="940" y="144" text-anchor="middle">7월</text>

  <line class="hair" x1="118" y1="120" x2="118" y2="166"/>
  <line class="hair" x1="168" y1="74" x2="168" y2="120"/>
  <line class="hair" x1="471" y1="120" x2="471" y2="166"/>
  <line class="hair" x1="522" y1="74" x2="522" y2="120"/>
  <line class="hair" x1="875" y1="120" x2="875" y2="166"/>

  <circle class="dot" cx="118" cy="120" r="5"/>
  <circle class="dot" cx="168" cy="120" r="5"/>
  <circle class="dot bad" cx="471" cy="120" r="6"/>
  <circle class="dot chg" cx="522" cy="120" r="7"/>
  <circle class="dot" cx="875" cy="120" r="5"/>

  <text class="tag" x="118" y="184" text-anchor="middle">3월 9일</text>
  <text class="t1" x="118" y="206" text-anchor="middle">시범 운영</text>
  <text class="tag" x="168" y="42" text-anchor="middle">3월 16일</text>
  <text class="t1" x="168" y="64" text-anchor="middle">무인 반납기 설치</text>
  <text class="tag bad" x="471" y="184" text-anchor="middle">4월 27일</text>
  <text class="t1" x="471" y="206" text-anchor="middle">반납 목록 누락 발견</text>
  <text class="tag chg" x="522" y="42" text-anchor="middle">5월 4일</text>
  <text class="t1" x="522" y="64" text-anchor="middle">수정 배포</text>
  <text class="tag" x="875" y="184" text-anchor="middle">6월 22일</text>
  <text class="t1" x="875" y="206" text-anchor="middle">전 지점 적용</text>
</svg>
```

### 4-7. 전후 비교 — "어디가 깨지고 무엇이 바뀌나"

원인·수정 방안 문서의 기본 그림이다(SKILL.md 규칙 15). 지금 그림을 먼저 그리고, 고친 그림은 **그것을 복사해 바뀐 곳의 class와 글만** 바꾼다. 좌표가 같아야 독자가 차이를 바로 본다. 한 상자에서 두 갈래로 나가면 연결점을 나눈다(아래 y=105·135). 한 점에서 갈라지면 공통 줄기가 겹친다.

```svg
<svg viewBox="0 0 1100 250" aria-label="무인 반납 결과가 대출 기록에만 남고 반납 목록에는 안 남음">
  <path class="ln" d="M190 120 H228"/>
  <path class="ln" d="M400 105 H430 V55 H468"/>
  <path class="ln bad" d="M400 135 H430 V195 H468"/>

  <rect class="node" x="20" y="70" width="170" height="100" rx="6"/>
  <rect class="node" x="230" y="70" width="170" height="100" rx="6"/>
  <rect class="node" x="470" y="10" width="220" height="90" rx="6"/>
  <rect class="node bad" x="470" y="150" width="220" height="90" rx="6"/>

  <text class="t1" x="105" y="108" text-anchor="middle">이용자</text>
  <text class="t2" x="105" y="134" text-anchor="middle">무인 반납기에</text>
  <text class="t2" x="105" y="152" text-anchor="middle">책 1권 반납</text>
  <text class="t1" x="315" y="108" text-anchor="middle">자동 반영</text>
  <text class="t2" x="315" y="134" text-anchor="middle">10분마다</text>
  <text class="t1" x="580" y="50" text-anchor="middle">대출 기록</text>
  <text class="t2" x="580" y="76" text-anchor="middle">반납 완료로 바뀜</text>
  <text class="t1" x="580" y="190" text-anchor="middle">반납 목록</text>
  <text class="t2 bad" x="580" y="216" text-anchor="middle">비어 있음</text>
  <text class="t2 bad" x="250" y="222">반납 목록은 안 만듦</text>
</svg>
```

고친 그림은 바뀐 곳의 칠과 글만 바꾼다. 고쳐서 문제가 사라진 상자·선은 `bad`를 떼고(손대지 않고 그대로 두면 `mute`), 새로 바뀌는 상자·선은 `chg`로 칠한다. 바뀐 상자가 없으면 그 자리에 하나 더하되, 다른 상자의 좌표는 옮기지 않는다. examples.md의 전후 예시는 이 그림 오른쪽에 알림 문자 상자를 더한다. 반납 목록은 그대로 두고(`mute`), 알림 문자가 대출 기록도 읽게 고친다(`chg`).

### 4-8. 2×2 사분면 — "무엇부터 하나"

가로·세로 축(`hair`) 끝에 축 이름과 방향(`tag`, ←·→·↑·↓)을 단다. 네 칸 모서리에 칸 이름(`tag`)을 둔다. 먼저 볼 칸 하나만 `zone chg`로 깐다. 항목은 `dot` + 오른쪽 12에 `t2`다. **위치가 판정이므로 무엇으로 정했는지(측정값인지 팀 평가인지)를 그림 위 문장이나 출처 줄에 쓴다.** 항목은 12개까지다.

```svg
<svg viewBox="0 0 1000 440" aria-label="반납 목록 자동 생성은 효과가 크고 품이 적어 먼저 할 일이다">
  <rect class="zone chg" x="120" y="30" width="380" height="190"/>
  <line class="hair" x1="120" y1="220" x2="880" y2="220"/>
  <line class="hair" x1="500" y1="30" x2="500" y2="410"/>

  <text class="tag" x="512" y="46">효과 큼 ↑</text>
  <text class="tag" x="512" y="404">효과 작음 ↓</text>
  <text class="tag" x="124" y="240">← 품 적음</text>
  <text class="tag" x="876" y="240" text-anchor="end">품 많음 →</text>
  <text class="tag chg" x="136" y="56">먼저 할 일</text>
  <text class="tag" x="864" y="56" text-anchor="end">큰 과제</text>
  <text class="tag" x="136" y="396">틈날 때</text>
  <text class="tag" x="864" y="396" text-anchor="end">미룰 일</text>

  <circle class="dot chg" cx="230" cy="100" r="7"/>
  <text class="t2 chg" x="244" y="105">반납 목록 자동 생성</text>
  <circle class="dot" cx="300" cy="170" r="5"/>
  <text class="t2" x="312" y="175">연체 문자 문구 수정</text>
  <circle class="dot" cx="620" cy="100" r="5"/>
  <text class="t2" x="632" y="105">키오스크 교체</text>
  <circle class="dot" cx="720" cy="160" r="5"/>
  <text class="t2" x="732" y="165">회원 DB 이전</text>
  <circle class="dot" cx="250" cy="300" r="5"/>
  <text class="t2" x="262" y="305">안내문 오탈자</text>
  <circle class="dot" cx="640" cy="330" r="5"/>
  <text class="t2" x="652" y="335">대출 화면 색 변경</text>
</svg>
```
