---
name: korean-readable-reports
description: >-
  Use when writing an analysis, report, findings, or status doc for humans to
  read and share — not a spec an agent executes. Fights AI verbosity/slop and
  makes deep content easy to read.
license: MIT (see LICENSE)
---

# Korean Readable Reports

An AI report defaults to **verbosity and slop**: dense jargon, fragment bullets,
`file:line` dumps in the prose, coined term-of-art, caveats nobody asked for.
The reader becomes the bottleneck. Keep the content deep — make the *reading*
easy.

## Rules

1. **Reader-first.** Write in the reader's language, at their level. Know who
   they are (e.g. "mid-level dev sharing with the team"). The document's
   language follows the reader's language (a Korean team gets a Korean report),
   never the language this skill happens to be written in. Declare the reader
   in frontmatter (`audience: team | cross-team | leadership | external`);
   `external` turns on the internal-identifier lint.
2. **Point first (BLUF).** Each section opens with the takeaway in one plain
   sentence — understandable from that line alone. The document-level summary
   box is at most three short sentences: what it does / how it's used / what
   to decide. If the document recommends an option, the box names it ("B안을
   추천합니다") — a reader who stops at the box must still know what to pick.
   One modifier per noun — no stacked qualifiers ("with evidence
   and reference links and…"), no analogy, no restating the title.
   Open with the finding itself; do not repeat the heading or announce
   "This section covers…".
3. **Analogy only where a concept is hard — one clause, beside that concept.**
   When a mechanism is genuinely unfamiliar to the reader, add one short
   comparison right where it is explained (e.g. a cache → "reusing a picture
   you already drew"). Never open the Background with it, never stretch it
   into a paragraph-long story, never put it in the summary box. No hard
   concept, no analogy.
4. **Full sentences, not fragments.** "Method A skips the redraw when nothing
   changed," not "A · time-axis · skip render+send." Source lists (a `## 출처`
   / `참고` / `Sources` section, or a bullet with a URL) are exempt.
5. **Explain or drop jargon.** Gloss each technical term on first use; never
   ship your own coined names without a plain rewrite; turn formulas into words.
6. **Evidence to the back.** No `file:line`, stack traces, or code mid-sentence.
   Put them in a small "basis/sources" note at the section's end (in md: a line
   starting with `근거:` / `Sources:`). Exception: when a number *is* the
   finding ("layout shift dropped from 0.138 to 0.036"), it stays in the
   sentence — the rule moves supporting evidence, not conclusions.
7. **Table cells read as phrases**, not code (`deleteOverBytes(k)` → "removes
   the least-recently-used first"). In Korean, a description cell ends as a
   noun phrase with conditions in parentheses — "한 페이지 결과 수(기본값 10)",
   not "한 페이지에 표시할 결과의 수입니다." (Korean-written API docs do this in
   63% of tables, translated docs in 11%.) Lint warns on a body cell over 60
   characters or holding two sentences, `<details>` tables included: the
   explanation goes under the table or on the `근거:` line.
8. **Cut the slop.** Delete throat-clearing intros, hedging caveats, restated
   obviousness. Shorter is kinder. Cut only *unsupported* hedges: a "should",
   a "may", or a `[미검증]` that the source or evidence carries stays — and
   don't add hedges the source didn't have. Never pick a stronger verb than
   the work earned — 관찰, 추정, 확인, 검증, 완료 each need their own
   evidence (table in `references/ko-terms.md` §4). They are not one ranking:
   "관찰 기록 작성 완료, 동작 검증 미실시" is a normal state.
   **Conditions live in one place.** The sentence carries the claim and its
   number; the sample, period, and basis behind it go on the section's
   `근거:` line or into `<details>` — not a parenthesis after every number.
   One parenthetical per sentence at most. Hedge once: either the verb ("~로
   봅니다") or the tag (`[추정]`), not "~라고 봅니다 [추정]". Lint hints
   when a document carries 12+ long parentheticals or 3+ lines holding two,
   and on every doubled hedge. Hard limits: summary ≤ 3 sentences, ≤ 7 H2
   sections, ≤ 12 lines of prose per section — anything past that goes behind
   `<details>` or into an appendix. Folding hides text but doesn't shorten
   the document: lint hints past 6,000 readable characters (tables and
   `<details>` counted; sources, `근거:` lines, and code not) — cut repeats or
   split the document. (6,000 is about the 75th percentile of 198 reports on
   one PC, mostly AI-written — a review point, not a measured ideal.)
   **Status badges are a fixed set:** `[완료]` `[미검증]` `[미확인]` `[실패]`
   `[블로커]` `[선재]` `[주의]` `[정보]` `[추천]` `[추정]` — 미검증 = not
   tested, 미확인 = looked but couldn't confirm, 추정 = inferred from
   evidence. Anything else prints as plain brackets. Keep the explanation
   outside: `[추정] 오차가 큽니다.`, not `[추정, 오차 큼]` (lint warns). A
   document's own labels (`[판단]`, `[README 주장]`) get one hint: use a badge
   if it is a status, or say the source type in words on the `근거:` line.
9. **Progressive disclosure.** Hide depth behind expandable sections (collapsible
   `<details>` or nested headings): summary always visible, detail on demand.
10. **Tone: teammate, not lecture.** Warm and direct, in the reader's polite
    register — like talking a colleague through it, not a manual.
11. **One sentence per line.** Break the line after every sentence-ending
    period (md: literal newline; HTML: `<br>` after each sentence inside a
    `<p>`). A paragraph of three sentences is three lines. Applies to body
    prose, callouts, and `<details>` — not to table cells or code.
    A line per sentence is not a short sentence per line: don't stack three
    or more short facts about the same subject with no connecting word. Split
    where the judgment changes, not by length — and when joining two
    sentences, don't add a cause (그래서·때문에) the source doesn't state.
12. **Deliver HTML too.** md is the source; always render an HTML copy and
    hand the reader the HTML. Use the renderer — never fill the template by
    hand:

    ```bash
    node <skill-dir>/scripts/render.js report.md
    ```

    `<skill-dir>` is this skill's own folder — the "Base directory for this
    skill" path shown when the skill loads (a manual install is
    `~/.claude/skills/korean-readable-reports`; a plugin install lives in the
    plugin cache). Scripts and references below are relative to it; never
    resolve them against the project's working directory.

    It also runs the lint (below) and prints findings. Fix them in the md and
    re-render; do not patch the HTML. md conventions the renderer understands
    are listed at the top of `scripts/render.js`.
13. **Background is an analysis of the request, not a story.** Work from the
    actual request (ticket, message, meeting note) and restate it precisely —
    never invent a backstory or narrate chronologically ("until now… so…").
    Write it as labeled lines, each a full sentence:

    ```md
    ## 배경
    - **요청** — who asked for what, restated exactly (source, date).
    - **현상** — the observable problem, with frequency or impact in numbers.
    - **원인** — root cause, or the leading hypothesis marked [추정].
    - **요구사항** — conditions the result must meet (incl. what must NOT change).
    - **범위 밖** — what this work deliberately does not cover.
    - **판단 기준** — how success will be judged.
    ```

    `요청` and `현상` are required; drop the others only when they truly don't
    apply. Unknown numbers or sources are never filled in: [미확인] after a
    check that came up empty, [미검증] when nothing was checked.
    Every report has a `## 배경` section and it comes first — an overview of
    how the system works belongs in the next section, not in its place.
14. **Write native Korean, not translated English.** A professional Korean
    tech doc states facts in plain nouns and verbs. Avoid:
    - Metaphor or personified headings — "요청이 지나가는 길", "~의 여정",
      "~는 이렇게 돌아간다", "테이블 지도". Use a factual heading instead:
      "요청 처리 흐름", "등록 테이블 목록", or a conclusion sentence.
    - Translated verbs — 요청이 지나가다 → 처리되다, 데이터를 조립하다 →
      구성하다, 창구를 열다 → 제공하다, 뽑아내다 → 추출하다,
      돌아가다 → 동작하다.
    - Colloquial intensifiers — 딱, 진짜, 전부 다, 엄청.
    - Analogies decoded in parentheses — "기계(코드)", "상품(DB 설정값)"; if a
      thing needs a parenthetical to be understood, name it directly.
    - Announcing sentences — "역할을 나누면 이렇습니다.", "정리하면 다음과
      같습니다." Just show the table.
    - Smoothing that breaks facts — "두 서비스가 각각 A하고 B하고 C합니다"
      when the services do different things. Split the sentence instead.

    Two more families, measured on 249 Korean API docs (221 written in Korean
    by Naver, Kakao, Toss, public agencies… vs 28 Korean translations of
    Google/AWS/Microsoft/GitHub docs, 2026-10-01). They come from different
    places, so check both:
    - **Translationese** (from English structure; 2–10× more common in the
      translations): a thing as subject ("이 API는 인증을 요구합니다" → "이 API를
      호출하려면 인증해야 합니다"), "에 의해 ~됩니다" → active voice, "A에 대한 B"
      → "A B" / "A를 ~", "를 통해 ~할 수 있습니다" → "~로 ~합니다", "하기
      위해서는" → "하려면", "가지다" for *have* → "있다", "선택적" → "선택",
      "구성하다" for *configure* → "설정하다", auto-particles like "을(를)".
    - **Korean office habits** (more common in Korean-written docs than in the
      translations, so a translationese check alone misses them): "해당 ~" →
      "이 ~" or the actual name, "~을 진행/수행합니다" → the verb itself
      ("검증을 진행합니다" → "검증합니다"), "하시기 바랍니다·부탁드립니다" →
      "~해 주세요", "하는 것이 가능합니다" → "~할 수 있습니다", "하도록
      하겠습니다" → "하겠습니다".
    - **One term per concept.** Never mix 오류/에러, 반환/리턴, 파라미터/매개변수
      in one document, and gloss an English term once, at first use. The
      default terms — what Korean dev docs actually use, not dictionary
      purism — are in `references/ko-terms.md` (파라미터, 호출, 반환,
      기본값, 오류, 설정, 타임아웃, 재시도…).

    Lint warns on the low-false-positive patterns and term mixing, and hints
    when 해당 / 에 대한 / 를 통해 / 로 인해 — or 에 있어서 / 라는 점에서 /
    와 관련하여 / 이루어지다 / 할 필요가 있다 / sentence-initial 이는 and 즉, —
    appear four or more times. Text in
    quotes ("…") is someone else's words and is skipped — quote a ticket title
    or a before-example instead of rewording it.

    That is the only job of quotes: words someone said or wrote, with the
    marker that says so ("~라고 밝혔습니다", "~라는 제목"). Not emphasis, not
    a label, not a coined phrase — "가장 큰 영향"을 보장하지 않습니다 reads as
    sarcasm or doubt. Drop the quotes; if one phrase in a paragraph truly
    needs weight, make it **bold**. Lint hints at five or more quoted noun
    phrases without a quote marker (spoken lines such as "이미 확인했어요",
    table cells that are wholly a quote, and English source text don't
    count).

    Four sentence frames are flagged as Korean AI tells — the first two
    reported in the same direction by two independent corpora, the last two
    from one small sample, all on essays and wiki text and none yet measured
    on tech reports, so lint only hints: the negative contrast "A가 아니라 B"
    (keep it only when correcting something the reader actually believed),
    the reverse wrap-up "~하는 이유다", the cleft "핵심은 ~이다", and the scope
    climb "단순한 X를 넘어 Y". State the conclusion directly instead, and check
    that the rewrite didn't swap in another frame (결국·이유다·아니라).
    Wrap-up stock phrases are hinted on first use too: sentence-initial
    "결론적으로·요컨대·종합하면", "시사하는 바가 크다", "~할 때입니다" — the
    conclusion already lives in the summary box and each section's first line.
    So is a chain of sentence-initial connectives in one section (three or
    more of 다만·그러나·하지만·그래서·따라서·또한·한편…): "다만 A. 그러나 B.
    그래서 C." walks the reader through the writer's reasoning. State the
    conclusion, then the facts; merge a sentence into the one before it
    rather than linking it with a connective.
    Two Claude habits are hinted on first use — measured in 15 raw Claude
    drafts against 18 real reports, where they never appeared: emoji in
    headings or sentences (use text labels such as 확인·추정 for status), and
    the essence claim "X는 결국 Y입니다" (give the evidence, or state the fact
    without 결국).
    Invisible characters (zero-width space, stray BOM, bidi controls) are a
    warning in every mode: they break copy, search, and diff.

    For a deeper pass on a Korean draft, the `humanize-korean` skill (if
    installed) targets exactly these translationese patterns. Use it only if
    its `references/quick-rules.md` has the 서법 보존 (modality-preserving)
    section — a copy without it has no explicit rule to keep the hedges and
    `[미검증]` tags that rule 8 keeps.
15. **Draw when the shape is the content — decide per section, unprompted.**
    Models default to prose and numbered lists; the reader should not have to
    ask for a picture. While writing each section, check what it describes:

    | The section describes… | Use |
    |---|---|
    | 3+ steps in a fixed order, each done by a component or party ("컨트롤러가 → 서비스가 → DB에") | ` ```flow ` block; Mermaid `flowchart` if it branches or loops |
    | 2+ parties exchanging requests and responses over time | Mermaid `sequenceDiagram` |
    | components and how they connect (architecture) | Mermaid `flowchart LR` with role colors |
    | states and what moves between them | Mermaid `stateDiagram-v2` |
    | dates, durations, dependencies | Mermaid `gantt` |
    | 3+ items compared on the same short attributes | table |
    | 2–4 key numbers that *are* the finding (rule 6 exception) | ` ```stats ` cards — `label \| value \| note \| status`, placed right after the summary or at the top of the section |
    | 2+ parallel items that each need a sentence or bullets (modules, findings, options) | ` ```cards ` — blank line between cards, first line is the title; mark the chosen option `[추천]`. Layout adapts to text length (short → grid, medium → 2 columns, long → one card per row), so keep titles short and put detail in the body |
    | a number over 3+ points or across 3+ items | table; a chart only when the trend itself is the finding (design-guide §4) |
    | original text quoted from a web page (official doc, license terms) | ` ```browser <URL> ` — the page text verbatim inside a browser-window frame; URL and check date also go on the `출처:` line |

    The picture replaces the list it depicts: one takeaway sentence above it,
    no step-by-step prose repeating it. Keep as text: a two-step relation (one
    sentence says it), and a procedure the reader performs ("넣습니다 →
    재시작합니다") — that stays a numbered list. Lint prints a hint when a
    section lists 3+ processing steps with subjects but has no diagram.

    A failure or retry path is a branch. "저장에 실패하면 재시도하고, 그래도
    실패하면 알림" is a Mermaid `flowchart`: the normal path ends at its last
    success step, and the failure path leaves from the step that fails.
    Appending the failure steps to a ` ```flow ` makes every item look like
    it goes through them (lint hints when a flow step says "실패하면").

## Workflow

1. Name the reader in one line (who, what they already know) → `audience:`.
2. Write the md into a `reports/` folder under the **current working directory**
   (create it), named `YYYY-MM-DD-<topic>.md`. If that folder can't be created
   or written (permission error), use `reports/` on the Desktop instead. Never
   write reports into the skill folder itself. Frontmatter: `title`, `date`, `audience` (required — lint
   fails without them), plus `project`, `branch`, `kind`, `summary` (optional;
   `summary: |` block scalar works), `theme` (`light` default | `dark` |
   `auto`; readers can still toggle). First blockquote after the H1 = summary
   box when `summary` is absent — write the summary in one place only, or it
   renders twice.
3. `node <skill-dir>/scripts/lint.js report.md` — machine checks for rules 1 (external),
   2, 4, 6, 7, 8, 9, 11, 13, 14, required frontmatter, and structural traps the
   renderer would otherwise swallow silently (unclosed fence, table column
   mismatch). Fix every finding in the md. Hints are printed separately;
   judge each one. They cover rule 15 ("this looks like a flow — draw it?")
   and consistency: a summary number missing from the body,
   "세 가지입니다" above a list of two, a "뒤에서 다루겠습니다" to follow up.
4. **Reader check** — for a report with 4+ H2 sections, `audience:
   leadership | external`, or a decision request: give a fresh subagent the
   md and nothing else from this conversation, and have it answer the five
   common questions plus the one for its `audience` in
   `references/reader-check.md`, quoting the line behind each answer. Where
   an answer is partial, wrong, or "not in the document" but should be, fix
   the nearest heading, summary, first line, or status before reaching for a
   new paragraph, then re-lint. No subagent → compare your own answers
   from the summary box alone against answers from the body. It shows the
   point is in the document, not that the document reads well. Tell the user
   whether it ran (skipped for short reports — say so).
5. `node <skill-dir>/scripts/render.js reports/<file>.md` — produces the `.html` next to it
   (falls back to Desktop `reports/` if it can't write there) and runs lint first.
   Tell the reader the full path of the HTML. `--strict` exits 1 on any finding without writing
   the HTML (CI / pre-commit gate). Raw HTML is cleaned: only allowlisted tags and
   attributes survive, so `<script>` and `on…=` never reach the page.
   Other skills whose documents don't follow these writing rules (plans,
   proposals) render with `--plain` — structure/safety lint only, quotes stay
   quotes, soft line breaks. Flags are listed at the top of `scripts/render.js`;
   `node <skill-dir>/scripts/test.js` is the regression suite.
   Then run `node <skill-dir>/scripts/qa.js <file>.html`: it opens the HTML in
   headless Chrome/Edge at 1280, 768 and 390px and reports text spilling out of
   (or clipped inside) its box, `#links` with no target, and images that failed
   to load. Exit 1 → fix the md (usually a long unbroken name in a card) and
   re-render; exit 2 means no browser was found — say so instead of claiming the
   check passed.
6. If the draft still reads like a default agent report, read
   `references/examples.md` (thirteen before/after pairs, one per failure mode,
   plus how the same finding shifts per audience) and rewrite.
   `references/design-guide.md` holds the visual details (colors, chart
   types, Mermaid quirks) — *whether* to draw is decided by rule 15, not there.
7. Diagrams: a straight sequence with no branches (A→B→C…) is a ` ```flow `
   block (one step per line: `title | description | role`), not Mermaid — it
   wraps to the page width with curved arrows. Use Mermaid for branches,
   loops, or architecture. Color flow/architecture nodes by role —
   `ext` external, `entry` entry point, `logic` processing, `data` storage
   (Mermaid: `class A ext`) — or by status (`done`/`fail`/`caution`/`info`/
   `neutral`), never both in one diagram.

## Before / after

> **Before:** `parseInput()` is O(n²) due to nested scan (utils.js:88); latency
> scales quadratically with list size → UI jank at scale.
>
> **After:** **The input parser gets slow as the list grows** — it re-scans the
> whole list for each item, so a long list makes the screen stutter. *(Code
> location in the notes below.)*

## Checklist

- [ ] Reader and level are known.
- [ ] Each section's first line is the plain takeaway.
- [ ] Summary box is ≤3 short sentences, no analogy, no stacked modifiers.
- [ ] `## 배경` comes first and is labeled request analysis (요청·현상 at least), not a story; any analogy is one clause beside a hard concept.
- [ ] Korean reads native: no metaphor headings, translated verbs, colloquial intensifiers, announcing sentences, translationese (에 의해·하기 위해서는), or office habits (해당·진행합니다·하시기 바랍니다); one term per concept (references/ko-terms.md).
- [ ] Every section was checked against the rule-15 table; ordered processing steps, exchanges, and architecture are drawn, not listed.
- [ ] Quotes only around someone else's words; emphasis is bold, once per paragraph at most.
- [ ] Conditions (sample, period, basis) sit on `근거:` lines or in `<details>`; one parenthetical per sentence; each hedge said once.
- [ ] No unglossed jargon / coined names / bare formulas.
- [ ] No `file:line` or code in body prose (moved to end-notes).
- [ ] Table cells read as sentences; slop removed.
- [ ] Depth is behind progressive disclosure.
- [ ] Tone reads like explaining to a teammate.
- [ ] Every sentence sits on its own line, without stacking short facts that need a connecting word.
- [ ] Reader check run (or skipped as a short report — said so); misses fixed at the nearest heading, summary, first line, or status first.
- [ ] Lint run and clean; HTML rendered with `scripts/render.js`, `scripts/qa.js` exits 0 (or no browser — said so), and delivered.

## When NOT to apply

A spec or implementation plan an *agent executes step-by-step* needs precision
over plainness — keep exact `file:line`, signatures, and code inline. Ask: "will
a person read this to understand, or will an agent run it?"
