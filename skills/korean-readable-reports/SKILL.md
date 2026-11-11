---
name: korean-readable-reports
description: >-
  Use only when the user asks for it: (1) a report, analysis, findings, or
  status doc made with this skill ("보고서로 정리해줘 / HTML 보고서"), or
  (2) 윤문만 — polish the Korean of given text in place, keeping its
  structure, line breaks, and tone. Never load it on your own to rewrite or
  lay out other Korean text. Fights AI verbosity/slop.
license: MIT (see LICENSE)
---

# Korean Readable Reports

An AI report defaults to **verbosity and slop**: dense jargon, fragment bullets,
`file:line` dumps in the prose, coined term-of-art, caveats nobody asked for.
The reader becomes the bottleneck. Keep the content deep — make the *reading*
easy.

`<skill-dir>` is this skill's own folder — the "Base directory for this skill"
path shown when the skill loads (a manual install is
`~/.claude/skills/korean-readable-reports`; a plugin install lives in the
plugin cache). Scripts and references are relative to it, never to the
project's working directory.

## Two modes — pick by what the user asked

**보고서** (default): write or rebuild a report with every rule below.

**윤문만** ("윤문해줘", "문장만 다듬어줘", or text in another project): fix
the wording only. Use rule 14 and `references/ko-terms.md` — 번역투, 업무
관용투, 표기, 용어 섞임, 은유 소제목, 강조 따옴표 — plus rule 8's "keep the
source's certainty". Everything else stays as it was:

- Same headings, section order, paragraphs, line breaks, lists, tables, and
  length. Do not split lines (rule 11), add a summary box or 배경, reorder,
  turn bullets into prose or back, or add figures or HTML.
- Same register and voice: 반말 game dialogue stays 반말, a UI label stays a
  label, the project's coined names stay.
- Change a sentence only when a rule-14 item applies; if unsure, leave it.
- Check with `node <skill-dir>/scripts/lint.js <file> --polish` — it reports
  rule 14 only.

Neither mode touches Korean text the user did not hand over: other files, UI
copy, prompts, code comments, commit messages. Text the user wrote and asked
to keep is quoted as is, even inside a report.

## Rules

1. **Reader-first.** Write in the reader's language, at their level (e.g.
   "mid-level dev sharing with the team"). A Korean team gets a Korean report,
   whatever language this skill is written in. Declare the reader in
   frontmatter: `audience: team | cross-team | leadership | external`;
   `external` turns on the internal-identifier lint.
2. **Point first (BLUF).** Each section opens with its takeaway in one plain
   sentence that stands alone — the finding itself, not the heading repeated
   or "This section covers…". The summary box is at most three short
   sentences: what it does / how it's used / what to decide. If the document
   recommends an option, the box names it ("B안을 추천합니다"): a reader who
   stops at the box still knows what to pick. One modifier per noun, no
   analogy, no restated title.
3. **Analogy only beside a hard concept, one clause.** When a mechanism is
   genuinely unfamiliar, one short comparison where it is explained (a cache →
   "reusing a picture you already drew"). Never in the summary box, never
   opening 배경, never a paragraph-long story.
4. **Full sentences, not fragments.** "Method A skips the redraw when nothing
   changed," not "A · time-axis · skip render+send." Source lists (a `## 출처`
   / `참고` / `Sources` section, or a bullet with a URL) are exempt.
5. **Explain or drop jargon.** Gloss each technical term on first use; rewrite
   your own coined names plainly; turn formulas into words.
6. **Evidence to the back.** `file:line`, stack traces, and code go on a line
   starting `근거:` / `Sources:` at the section's end, not mid-sentence. A
   `근거:` line names a source the reader recognises — whose memo, which
   meeting or ticket, its date — never the working file you were handed
   (`input.md`, `notes.txt`). Exception: a number that *is* the finding
   ("layout shift dropped from 0.138 to 0.036") stays in the sentence.
7. **Table cells read as phrases**, not code (`deleteOverBytes(k)` → "removes
   the least-recently-used first"). In Korean a description cell ends as a
   noun phrase with conditions in parentheses — "한 페이지 결과 수(기본값
   10)", not "한 페이지에 표시할 결과의 수입니다." A cell over 60 characters
   or holding two sentences moves its explanation under the table or onto the
   `근거:` line.
8. **Cut the slop; keep the source's certainty.**
   - Delete throat-clearing intros, unsupported hedges, restated obviousness.
     A "should", a "may", or a `[미검증]` the source carries stays, and you
     add no hedge the source didn't have. Never pick a stronger verb than the
     work earned: 관찰, 추정, 확인, 검증, 완료 each need their own evidence
     (`references/ko-terms.md` §4), and "관찰 기록 작성 완료, 동작 검증 미실시"
     is a normal state.
   - **Conditions live in one place.** The sentence carries the claim and its
     number; sample, period, and basis go on the `근거:` line (one or two
     short sentences; more go in bullets or `<details>`). One parenthetical
     per sentence.
     Hedge once: the verb ("~로 봅니다") or the tag (`[추정]`), not both.
   - **Limits:** summary ≤ 3 sentences, ≤ 7 H2 sections, ≤ 12 lines of prose
     per section. Past that, first turn prose into a picture, table, or cards
     (rule 15, text mass; a procedure the reader performs stays a numbered
     list), then fold the rest into `<details>`. Folding doesn't shorten the
     document: past about 6,000 readable characters, cut repeats or split it.
   - **Not every fact belongs here.** The report holds what the reader needs
     to decide or act. Research detail that doesn't change that (per-item
     tables, every policy clause, side cases) goes to a companion
     `<name>-근거.md`, linked from the report and rendered too — moved with
     its tags and conditions, not deleted.
   - **Status badges are a fixed set:** `[완료]` `[미검증]` `[미확인]`
     `[실패]` `[블로커]` `[선재]` `[주의]` `[정보]` `[추천]` `[추정]` —
     미검증 = not tested, 미확인 = looked but couldn't confirm, 추정 =
     inferred from evidence. Anything else prints as plain brackets. The
     explanation goes outside: `[추정] 오차가 큽니다.`, not `[추정, 오차 큼]`.
     A label of your own (`[판단]`, `[README 주장]`) becomes a badge if it is
     a status, or the source type in words on the `근거:` line.
9. **Progressive disclosure.** Summary always visible; depth behind
   `<details>` or nested headings.
10. **Tone: teammate, not lecture.** Warm and direct, in the reader's polite
    register.
11. **One sentence per line.** Break the line after every sentence-ending
    period — body prose, callouts, `<details>`; not table cells or code. A
    list item is one point: an item (with its indented follow-on lines) of
    three or more sentences becomes sub-bullets. A line per sentence is not a
    short sentence per line: don't stack three or more short facts about one
    subject with no connecting word. Split where the judgment changes, and
    when joining two sentences add no cause (그래서·때문에) the source doesn't
    state.
12. **Deliver HTML, made by the renderer.** md is the source;
    `node <skill-dir>/scripts/render.js report.md` makes the HTML and runs the
    lint. Fix findings in the md and re-render — never fill the template or
    patch the HTML by hand. The md conventions it understands (`flow`,
    `stats`, `cards`, `bars`, `svg`, `browser` blocks and their line formats)
    are listed at the top of `scripts/render.js`.
13. **The first section is what the reader acts on; 배경 follows it.**
    - The first H2 is the decision to make, the to-dos, or — for a status or
      analysis — the conclusion. Every report has a `## 배경` section, and it
      comes after that one (lint warns when it is missing or first); an
      overview of how the system works comes after 배경.
    - When several teams read it (`audience: cross-team`), that first section
      holds one `팀 | 할 일 | 기한` table, so each team finds its share in one
      place. Fill it only with owners, dates, and decisions the source gives:
      an undecided item says who decides, a target date stays 목표, and no
      team gets a task the source didn't give it.
    - 배경 analyses the actual request (ticket, message, meeting note) in
      labeled lines, each a full sentence — never a backstory or a story told
      in order ("until now… so…"):

      ```md
      ## 배경
      - **요청** — who asked for what, restated exactly (source, date).
      - **현상** — the observable problem, with frequency or impact in numbers.
      - **원인** — root cause, or the leading hypothesis marked [추정].
      - **요구사항** — conditions the requester or source stated (incl. what must NOT change).
      - **범위 밖** — what this work deliberately does not cover.
      - **판단 기준** — how success will be judged.
      ```

      `요청` and `현상` are required; drop the others only when they truly
      don't apply. `요청` is the work the document serves, never the request
      to write it: in a handover, what passes to whom and from when ("전임
      담당자가 9/30까지 근무하고, 10/1부터 후임이 분관 대출 연동 서버 운영을
      맡습니다"), with `현상` the state the reader inherits. How you made the
      document ("메모를 바탕으로 문서를 만듭니다", or a 범위 밖 about its own
      sources) is not 배경. `요구사항` holds only stated conditions: a target
      stays a target ("반납 처리 목표 10초"), never "10초 안에 끝나야
      합니다"; with none stated, drop the line. Unknown numbers and sources
      are never filled in (workflow 3, open items).
14. **Write native Korean, not translated English.** State facts in plain
    nouns and verbs. Read `references/ko-terms.md` §1, §2 and §6 before the
    first Korean draft in a session; lint warns or hints on most of what they
    list. In short:
    - Factual headings, not metaphors ("요청이 지나가는 길" → "요청 처리
      흐름"); no announcing sentences ("정리하면 다음과 같습니다") — show the
      table.
    - Plain verbs (돌아가다 → 동작하다, 조립하다 → 구성하다), no colloquial
      intensifiers (딱, 진짜, 엄청), no analogy decoded in parentheses
      ("기계(코드)").
    - No translationese (사물 주어 + 요구, 에 의해, 에 대한, 를 통해, 하기
      위해서는) and no office habits (해당, 진행합니다, 하시기 바랍니다, 하는
      것이 가능합니다).
    - One term per concept — never 오류/에러, 반환/리턴, 파라미터/매개변수 in
      one document; gloss an English term once, at first use.
    - Quotes only around words someone said or wrote; emphasis is **bold**,
      once per paragraph at most.
    - State the conclusion directly: no "A가 아니라 B" unless correcting what
      the reader believed, no "~하는 이유다", "핵심은 ~이다", "결국 Y입니다",
      no wrap-up phrase (결론적으로·요컨대), no chain of sentence-initial
      connectives, no emoji.
15. **Draw when the shape is the content — decide per section, unprompted.**
    While writing each section, check what it describes:

    | The section describes… | Use |
    |---|---|
    | 3+ steps in a fixed order, each done by a component or party | ` ```flow `; Mermaid `flowchart` if it branches or loops |
    | 2+ parties exchanging requests and responses over time | Mermaid `sequenceDiagram` |
    | components and how they connect (architecture) | Mermaid `flowchart LR` with role colors |
    | states and what moves between them | Mermaid `stateDiagram-v2` |
    | durations and dependencies | Mermaid `gantt` |
    | events on dates where the gaps between them matter | ` ```svg ` timeline (svg-figures.md 4-6) |
    | the same flow before and after a fix | ` ```svg 고치기 전 ` and ` ```svg 고친 뒤 ` on the same coordinates: `bad` where it breaks, `chg` what changes, the rest gray (4-7) |
    | layers stacked in order and which layer something happens in | ` ```svg ` layer stack, one `chg` layer (4-5) |
    | items placed by two judgments (효과 × 품) to pick what comes first | ` ```svg ` 2×2 quadrant; say what decided each position (4-8) |
    | parts that add up to a total, or values against a limit | ` ```bars ` with a `기준선` |
    | a number over 3+ points or across 3+ items | ` ```bars ` above the table when the difference is the message; a table alone when the reader only looks values up |
    | what a user receives or sees, before vs after | ` ```cards compare ` |
    | 2–4 key numbers that *are* the finding | ` ```stats ` cards, right after the summary or at the top of the section |
    | 2+ parallel items that each need a sentence (modules, findings, options) | ` ```cards `, short titles; mark the chosen option `[추천]` |
    | 3+ items compared on the same short attributes | table (an impact/effort scale reads well as `●○○`) |
    | the same bold labels repeated under 3+ subjects | subject × label table at the top; the sentences under it in `<details>` |
    | original text from a web page | ` ```browser <URL> `; URL and check date also on the `출처:` line |

    - The picture replaces the list it depicts: one takeaway sentence above
      it, no prose repeating it. A two-step relation and a procedure the
      reader performs ("넣습니다 → 재시작합니다", a numbered list) stay text.
    - **Text mass.** A section of 800+ readable characters with no picture,
      table, or cards reads as a wall. Write a keyword (2–8 characters) and
      one core line (≤ 40 characters) per paragraph, pick the shape from how
      the keywords relate (in order → `flow`, same attributes → table,
      parallel → `cards`, cause → effect → `flow` or `svg`, one choice →
      `cards` with `[추천]`), put one
      takeaway above it, and move the original sentences into `<details>` or
      the companion file. Appendix and source sections are exempt.
    - **One picture, one question.** Name the relation the reader must see and
      draw only what it connects — never an arrow between items whose link
      the text does not state. A flowchart holds ≤ 9 nodes and 12 arrows, a
      sequence ≤ 5 participants; past that, an overview plus one detail
      figure per step. Drop a node the reader doesn't need, merge two that
      always travel together, drop an arrow the layout already says. A
      condition, a failure path, or a state difference is never dropped — it
      moves into the detail figure with its tags. Mark the one or two focal
      boxes `chg`. If a 3-column table says the same, use the table.
    - A failure or retry path is a branch: Mermaid `flowchart`, with the
      failure path leaving from the step that fails — not steps appended to a
      `flow`.
    - A report that finds a cause inside a flow and proposes a fix draws that
      flow twice as ` ```svg ` — before and after. That pair is the default
      for 원인·수정 방안 documents, not an extra.
    - Choosing the tool: Mermaid lays out branches, loops, and architecture,
      colored by role (`ext` `entry` `logic` `data`) or by status (`done`
      `fail` …), never both in one figure (`references/design-guide.md` §6).
      Draw ` ```svg ` by hand when the report goes out `--offline` (Mermaid
      shows as source text there) or the layout is the message (before/after,
      layers, date spacing, quadrant): read `references/svg-figures.md` first
      and copy a skeleton.
    - Before drawing ` ```bars ` or any chart, read `references/design-guide.md`
      §4 (which chart, bars from 0, no pie past three parts, no dual axis) and
      §10 (bars conventions). Colors and other visual details are there too.

## Workflow

1. Name the reader in one line (who, what they already know) → `audience:`.
2. Write the md into a `reports/` folder under the **current working
   directory** (create it), named `YYYY-MM-DD-<topic>.md`. If it can't be
   created or written, use `reports/` on the Desktop; never the skill folder.
   Frontmatter: `title`, `date`, `audience` required; `project`, `branch`,
   `kind`, `summary` (`summary: |` works), `theme` (`light` default | `dark` |
   `auto`) optional. Write the summary in one place — `summary:` or the first
   blockquote after the H1 — or it renders twice.
3. **Lint:** `node <skill-dir>/scripts/lint.js reports/<file>.md`. Fix every
   finding in the md. Judge each hint; a rule-15 hint is not optional — draw
   what it names, or tell the user in one line why that picture would not
   help. What lint checks is listed at the top of `scripts/lint.js`.

   **Open items go to the requester, not the document.** Lint counts
   [미확인], [미검증], and "확인 필요" as `열린 항목 N개`. Sort each:
   - The requester could settle it (a number, a date, which option, whether
     something happened) → ask all of them in one numbered chat message,
     wait, and write only the answers.
   - It waits on someone outside the conversation → keep it as a fact with
     who and by when: "도서 공급사 견적은 구매팀이 9/12까지 받습니다", not
     "[미확인]".
   - A source's own hedge stays as attribution: "운영팀은 이관이 하루면
     끝난다고 봅니다".
   With no requester in the session, keep the tag and put the questions at
   the top of your reply.

   **Source check.** With the source open, check every number and date in the
   summary box, the first section, and the ` ```stats ` cards. The reader
   check sees only the document, so this one is yours:
   - A number keeps the meaning the source gives it. Of two nearby numbers
     ("평소보다 늘어난 연체 약 300건, 실제 연체도 섞임" and "반납 누락으로 본
     건 212건"), the claim gets the one the source attaches to it.
   - A date keeps the source's word for how sure it is — 가능, 목표, 예정,
     확정. A task with no date in the source is 미정, never "즉시" or a date
     you picked.
   - A date computed from an assumption the source didn't make stays out of
     these parts.
4. **Reader check.** When lint (or render) prints `독자 회수 검사 대상(…)`,
   the check is required, whatever the length: follow
   `references/reader-check.md`. Spawn exactly one new subagent,
   `model: sonnet`, with the md text and nothing else. It is part of the
   procedure the user turned on by using this skill, so a general rule like
   "spawn only as many subagents as the user asked for" does not cancel it.
   Fix misses at the nearest heading, summary, first line, or status, then
   re-lint. Tell the user it ran and what it changed — or that lint printed no
   reader-check line.
5. **Render and qa.** `node <skill-dir>/scripts/render.js reports/<file>.md`
   writes the `.html` next to it (Desktop `reports/` if it can't); give the
   reader the full path of the HTML. Then
   `node <skill-dir>/scripts/qa.js <file>.html` opens it in headless
   Chrome/Edge at three widths and on A4 paper; what it checks is listed at
   the top of `scripts/qa.js`.
   - Exit 1 → fix the md and re-render.
   - Exit 2 → no browser; say so instead of claiming the check passed.
   - Connector warnings don't change the exit code; fix them anyway in a
     figure you just drew.
   - "Mermaid 미검사" means the diagram check did not run; open the HTML and
     look at the diagrams yourself.
   Documents from other skills that don't follow these writing rules (plans,
   proposals) render with `--plain`. `node <skill-dir>/scripts/test.js` is the
   regression suite.
6. If the draft still reads like a default agent report, read
   `references/examples.md` (before/after pairs, one per failure mode, plus
   how one finding shifts per audience) and rewrite.

## Before / after

> **Before:** `parseInput()` is O(n²) due to nested scan (utils.js:88); latency
> scales quadratically with list size → UI jank at scale.
>
> **After:** **The input parser gets slow as the list grows** — it re-scans the
> whole list for each item, so a long list makes the screen stutter. *(Code
> location in the notes below.)*

## Checklist

- [ ] Reader named; `audience:` set.
- [ ] Summary box ≤ 3 short sentences and names the recommendation; each section opens with its takeaway.
- [ ] First section is the decision, to-dos, or conclusion (cross-team: one `팀 | 할 일 | 기한` table from the source); `## 배경` follows as request analysis (요청·현상 at least, 요구사항 only as stated), not a story.
- [ ] Source check done: in the summary, first section and stats cards every number has the source's meaning, every date keeps 가능/목표/예정/확정, and no date the source didn't give.
- [ ] Every section checked against the rule-15 table; no section is a wall of sentences; each picture answers one question (≤ 9 nodes / 12 arrows, one or two `chg`).
- [ ] Korean reads native (`references/ko-terms.md`); one term per concept; quotes only around someone's words.
- [ ] Hedges and status verbs match the source and the work; conditions on `근거:` lines; one parenthetical per sentence.
- [ ] No unglossed jargon, coined names, or bare formulas; no `file:line` or code in body prose; table cells read as phrases.
- [ ] Every sentence on its own line, without stacking short facts that need a connecting word; depth behind `<details>`; a teammate's tone.
- [ ] Open items the requester could answer were asked in chat and replaced by the answers.
- [ ] Reader check run whenever lint printed `독자 회수 검사 대상`.
- [ ] Lint clean; HTML rendered with `scripts/render.js`; `scripts/qa.js` exits 0 (or no browser — said so); HTML path given to the reader.

## When NOT to apply

A spec or implementation plan an *agent executes step-by-step* needs precision
over plainness — keep exact `file:line`, signatures, and code inline. Ask: "will
a person read this to understand, or will an agent run it?"
