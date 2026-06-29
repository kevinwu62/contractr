# Contractr Build Log

Purpose: track Contractr’s build progress, milestone status, next tasks, blockers, and commit history. This file should be updated by CodeBot after each meaningful change.

---

## Current Status

**Current milestone:** Step 8 — Obligation Tracker  
**Last completed milestone:** Step 7 — Cross-Reference Checker  
**Next task:** Retest the new `Analyze Obligations` flow in Word for Mac with the fake Contractr test agreement, including reload/open behavior and preserving defined-term and cross-reference results.

---

## Milestone Tracker

### Step 0 — Project Foundation

**Status:** Done

Tasks:

- [x] Confirm repo exists locally.
- [x] Create or update `README.md`.
- [x] Create or update `.gitignore`.
- [x] Confirm no secrets, API keys, or `.env` files are committed.
- [x] Commit foundation files to GitHub.

Commit:

- [X] Add commit hash/link if useful.

Notes:

- Foundation docs are intentionally minimal.
- CodeBot’s OpenClaw files remain the source of truth for project rules, architecture, and security context.

---

### Step 1 — Word Add-in Skeleton

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Create the smallest working Word task pane add-in.

Tasks:

- [x] Create `apps/word-addin/`.
- [x] Set up a Microsoft Word Office.js task pane add-in.
- [x] Display the title `Contractr` in the sidebar.
- [x] Add a `Read Selected Text` button.
- [x] Use Office.js to read selected text from the active Word document.
- [x] Display selected text in the sidebar.
- [x] Test in Word on Mac with a dummy document.
- [X] Commit working skeleton.

Definition of done:

- [x] Sidebar opens in Word.
- [x] User can select text in Word.
- [x] Clicking `Read Selected Text` displays the selected text in the sidebar.

Suggested commit message:

`Fix local HTTPS certificate setup`

Notes:

- Created a small React + TypeScript + Vite app in `apps/word-addin/`.
- Uses hosted Office.js from Microsoft and local HTTPS dev server at `https://localhost:3000`.
- No AI, backend, database, authentication, full-document reader, or defined-term detection added.
- Verified locally with `npm run typecheck`, `npm run build`, and `xmllint --noout apps/word-addin/manifest.xml`.
- Blocker found during Word testing: Word blocked the task pane content because the local HTTPS content was not signed by a trusted certificate.
- Fixed the local HTTPS setup by replacing Vite's generic basic SSL certificate with `office-addin-dev-certs`, adding certificate install/verify scripts, and configuring Vite to serve on `https://localhost:3000` to match `manifest.xml` exactly.
- Verified certificate trust with `npm run certs:verify`.
- Verified the manifest URL by starting the dev server and confirming `https://localhost:3000/index.html` returns `HTTP/2 200` when curl uses the Office add-in development CA.
- Kevin confirmed Step 1 opens in Word and `Read Selected Text` works.

---

### Step 2 — Full Document Reader

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Allow the add-in to read the active Word document body.

Tasks:

- [x] Add `Read Full Document` button.
- [x] Read the active document body through Office.js.
- [x] Preserve paragraph breaks where reasonably possible.
- [x] Display a preview and/or character count in the sidebar.
- [x] Add basic error handling.
- [x] Test with a dummy contract.
- [X] Commit working feature.

Definition of done:

- [x] Add-in can read a dummy contract.
- [x] Sidebar shows full-document preview or clear extracted output.

Suggested commit message:

`Add full document reader`

Notes:

- Implemented in the existing React task pane without adding AI, defined-term detection, backend, database, auth, or Next.js.
- `Read Full Document` reads Word body paragraphs through Office.js, joins paragraphs with blank lines, shows a preview, and displays the full character count.
- Full document text is not logged and is not stored outside the current UI flow; only the preview and count are kept in React state.
- Verified with `npm run typecheck`, `npm run build`, and `xmllint --noout manifest.xml`.

---

### Step 3 — Defined-Term Detection

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Create the first useful contract-analysis feature.

Tasks:

- [x] Add `Analyze Defined Terms` button.
- [x] Detect quoted terms.
- [x] Detect likely definition patterns.
- [x] Extract likely definition sentence or paragraph.
- [x] Count term usage.
- [x] Display terms, definitions, and usage counts in sidebar.
- [X] Test with dummy contract.
- [X] Commit working feature.

Definition of done:

- [X] Sidebar lists defined terms.
- [X] Each term shows a likely definition.
- [X] Each term shows usage count.

Suggested commit message:

`Fix overlapping defined term usage counting`

Notes:

- Implemented deterministic detection in the Word task pane, then moved reusable analysis logic to `packages/contract-core` during Step 4; no AI, backend, database, auth, or Next.js added.
- Analyzer reuses the full-document paragraph read flow, detects straight or curly quoted terms followed by `means`, `shall mean`, `has the meaning`, or `refers to`, and labels output as likely/potential.
- Follow-up fix added deterministic detection for preamble-style parenthetical aliases such as `(the "Agreement")`, `("Company")`, and `("Buyer")`; these are labelled as potential defined terms rather than certain definitions.
- Second follow-up fix added a fallback quoted-term pass for terms that appear in quotation marks outside formal definition patterns, including quoted preamble terms that are not the whole parenthetical phrase. These are labelled as potential defined terms with the source paragraph shown.
- Third follow-up fix groups simple singular/plural variants into the same displayed defined term, so examples like `Party`/`Parties`, `Company`/`Companies`, and `Service`/`Services` share one result and one potential usage count. Merged rows show detected variants in the sidebar.
- Fourth follow-up fix corrected overlapping defined-term usage counting. Usage matching is now phrase-boundary aware and case-sensitive, so shorter terms are not counted merely because they appear inside longer capitalized defined terms such as `Service Provider`, `Base Purchase Price`, or `Closing Date`.
- Usage counts now exclude the detected source paragraph for each term so a definition line is not counted as a separate usage of its own term.
- Full document text is used only during the click handler analysis; the UI stores result summaries and character count, not the full document text.
- Validation in the project working tree is currently blocked by local file read errors: `Resource deadlock avoided` on `manifest.xml`, `package-lock.json`, and several `node_modules` files.
- Workaround validation succeeded in a temporary clean add-in copy made from the readable source files: `npm run typecheck` passed and `npm run build` passed after the broader quoted-term fallback fix, after the singular/plural grouping fix, and after the overlapping defined-term usage counting fix.
- In-place manifest validation could not be completed because local tools cannot read `apps/word-addin/manifest.xml`; this feature did not modify the manifest.
- Scratch overlap check confirmed that `Service Provider` is not counted as `Service`, `Base Purchase Price` is not counted as `Purchase Price` unless `Purchase Price` appears separately, and `Closing Date` is not counted as `Closing`.
- Remaining limitation: the overlap guard is deterministic and conservative. It treats immediately adjacent capitalized words as likely part of a longer defined-term phrase, which is appropriate for common contract terms but may undercount unusual prose.
- Suggested commit message: `Fix overlapping defined term usage counting`

---

### Step 4 — Contract-Core Refactor

**Status:** Implemented locally — Word for Mac manual retest still needed after refactor.

Goal:

Move reusable contract logic out of the Word UI.

Tasks:

- [x] Create `packages/contract-core/`.
- [x] Move defined-term logic into reusable TypeScript functions.
- [x] Export functions from `contract-core`.
- [x] Update Word add-in to import from `contract-core`.
- [x] Confirm defined-term detection still works in code-level validation.
- [ ] Commit refactor.

Definition of done:

- [x] Contract parsing logic is no longer trapped inside UI components.
- [ ] Word add-in still works after refactor.

Suggested commit message:

`Refactor contract logic into contract-core`

Notes:

- Created `packages/contract-core` with exported deterministic functions:
  - `extractDefinedTerms(documentText)`
  - `countTermUsages(documentText, term, options)`
  - `findDefinedButUnusedTerms(documentText, definedTerms)`
  - `findPotentialUndefinedTerms(documentText, definedTerms)`, initially added as a Step 5 placeholder and completed during Step 5.
- Moved Step 3 defined-term extraction, parenthetical/quoted term detection, singular/plural grouping, source-paragraph exclusion, and phrase-boundary usage counting into `packages/contract-core/src/definedTerms.ts`.
- Updated the Word add-in to import `extractDefinedTerms` and `DefinedTermResult` from `@contractr/contract-core`.
- Added TypeScript and Vite aliases so the add-in can import the local package without adding a new monorepo manager yet.
- User-facing behavior should be unchanged: `Read Selected Text`, `Read Full Document`, and `Analyze Defined Terms` remain in the Word task pane.
- In-place validation remains blocked by local file read errors: `Resource deadlock avoided` on `node_modules/.bin/tsc` and `manifest.xml`.
- Workaround validation in `/tmp/contractr-step4-check` succeeded: `npm install`, `npm run typecheck`, and `npm run build` passed.
- Direct smoke check of the extracted package functions passed for explicit definitions, parenthetical definitions with straight and smart quotes, quoted preamble terms, singular/plural grouping, and overlapping terms.
- Manifest validation could not be completed in-place because `xmllint --noout manifest.xml` still reports `Resource deadlock avoided` / empty document; this refactor did not modify `manifest.xml`.
- Suggested commit message: `Refactor contract logic into contract-core`

---

### Step 5 — Defined-Term Quality Checks

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Flag common definition-related drafting issues.

Tasks:

- [x] Detect defined but unused terms.
- [x] Detect potentially undefined capitalized terms.
- [x] Detect similar-looking terms.
- [x] Add `Potential Issues` sidebar section.
- [x] Label outputs as potential issues, not definitive errors.
- [x] Test with dummy contract at code/smoke-check level.
- [ ] Commit working feature.

Definition of done:

- [x] Tool flags obvious unused definitions.
- [x] Tool flags repeated capitalized phrases that may be undefined.
- [x] Tool flags similar terms.

Suggested commit message:

`Add defined term quality checks`

Notes:

- Added deterministic issue-checking functions in `packages/contract-core`:
  - `findDefinedButUnusedTerms(documentText, definedTerms)`
  - `findPotentialUndefinedTerms(documentText, definedTerms)`
  - `findSimilarDefinedTerms(definedTerms)`
- Updated the Word task pane so `Analyze Defined Terms` also displays a `Potential Issues` section above the defined-term list.
- Defined-but-unused terms are flagged when the existing usage counter finds no usage outside the detected source paragraph.
- Potentially undefined terms are repeated capitalized words or short capitalized phrases that are not already in the detected defined-term list and are not obvious one-line headings or common section words.
- Similar-looking terms are flagged when singular/plural variants are detected, one defined term appears contained inside another, or terms share a simple word stem.
- All issue output is labelled as potential, not definitive legal drafting errors.
- Known limitation: the potentially undefined-term heuristic is intentionally simple and can still produce false positives for party names, proper nouns, headings, document titles, or ordinary capitalized contract style.
- Known limitation: similar-looking term detection is conservative and string-based; it does not understand legal meaning.
- In-place validation remains affected by local dataless/read issues:
  - `npm run typecheck` is blocked by `Resource deadlock avoided` on `node_modules/.bin/tsc`.
  - `npm run build` is blocked by `Resource deadlock avoided` on `node_modules/.bin/tsc`.
  - `xmllint --noout manifest.xml` is blocked by `Resource deadlock avoided` / empty manifest reads.
- Workaround validation in `/tmp/contractr-step5-check` succeeded:
  - `npm install` passed.
  - `npm run typecheck` passed.
  - `npm run build` passed.
  - Direct `contract-core` smoke check passed for defined-but-unused, potentially undefined, and similar-looking term examples.
- Suggested commit message: `Add defined term quality checks`

---

### Step 6 — Document Navigation

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Turn the sidebar into a usable contract map.

Tasks:

- [x] Allow clicking a defined term.
- [x] Navigate to likely definition location.
- [x] Show usage locations where feasible.
- [x] Allow clicking a usage to jump to occurrence.
- [x] Add basic highlighting or selection if feasible.
- [x] Test in Word on Mac.
- [ ] Commit working feature.

Definition of done:

- [x] Clicking a sidebar item selects the relevant matching text in the Word document at code-validation level.
- [x] Confirm behavior manually in Word for Mac.

Suggested commit message:

`Add defined term navigation`

Notes:

- Added first-version sidebar navigation in the Word task pane.
- Fixed parenthetical defined-term navigation bug on 2026-06-26: clicking `Buyer`, `Seller`, or `Agreement` now tries short definition-shaped snippets before falling back to usage-style term search.
- Defined-term names are now clickable and search for short likely definition snippets first, then fallback source/definition/term text.
- Parenthetical/preamble definitions now add searchable candidates for straight-quote and smart-quote variants, including `(the "Term")`, `("Term")`, `(the “Term”)`, and `(“Term”)`.
- Defined terms with non-definition usage counts now show `Jump to first usage`, which searches for the detected term or variant and selects the first matching range.
- Potential issue terms are clickable where useful:
  - defined-but-unused issues jump to the likely definition;
  - potentially undefined issues jump to the first matching term text;
  - similar-looking term issues jump to the first listed term text.
- Navigation uses Office.js `body.search(...)` and selects the first matching range. No persistent anchors, comments, bookmarks, backend, database, AI, or full-document logging were added.
- Kevin confirmed on 2026-06-29 that defined-term navigation works, including parenthetical and preamble definitions.
- Known limitation: navigation re-searches the current Word document and can choose the first matching text if the same term appears many times.
- Known limitation: first-version usage navigation does not list every usage location; it provides a safe `Jump to first usage` action only.
- Known limitation: exact source-paragraph search may fail if Word normalizes punctuation, spacing, fields, or tracked-change text differently from the paragraph text read by Office.js; short definition snippets and fallback term search are used after that.
- In-place validation was unreliable because iCloud had offloaded local repo and `node_modules` files as dataless placeholders, causing intermittent `Resource deadlock avoided` reads.
- Validation succeeded in `/tmp/contractr-step6-check`, a clean temporary copy outside iCloud:
  - `npm install` passed.
  - `npm run typecheck` passed.
  - `npm run build` passed.
  - `xmllint --noout manifest.xml` passed.
  - Direct `contract-core` smoke check passed for defined terms, unused terms, potentially undefined terms, and similar-term function execution.
- 2026-06-26 parenthetical navigation validation:
  - In-place `npm run typecheck` and `npm run build` were still blocked by local dataless/read errors on repo `node_modules`.
  - In-place `xmllint --noout manifest.xml` passed.
  - Clean temporary copy in `/tmp/contractr-validate` passed `npm ci`, `npm run typecheck`, and `npm run build`.
  - Direct `contract-core` smoke check confirmed parenthetical `Buyer`, `Seller`, smart-quote `Agreement`, and normal `"Closing Date" means` definitions are still extracted with source paragraphs.
- Suggested commit message: `Fix parenthetical defined term navigation`

---

### Step 7 — Cross-Reference Checker

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Detect likely broken section, schedule, article, or exhibit references.

Tasks:

- [x] Detect references to sections.
- [x] Detect references to articles.
- [x] Detect references to schedules.
- [x] Detect references to exhibits.
- [x] Detect actual headings.
- [x] Compare references against detected headings.
- [x] Display potential broken references.
- [x] Separate cross-reference checking into its own `Analyze Cross-References` action.
- [x] Improve Office readiness/error handling so initialization failures are visible.
- [x] Test with intentionally broken dummy contract in Word.
- [ ] Commit working feature.

Definition of done:

- [x] Tool flags intentionally broken references in a code-level dummy contract.
- [x] Tool flags intentionally broken references in the fake Contractr test agreement in Word.

Suggested commit message:

`Add cross-reference checker`

Notes:

- Added deterministic cross-reference logic in `packages/contract-core/src/crossReferences.ts`.
- Exported reusable functions and types from `packages/contract-core/src/index.ts`.
- Updated the Word task pane to display separate `Defined Terms`, `Potential Issues`, and `Cross-Reference Issues` result sections.
- Cross-reference checking now runs from a separate `Analyze Cross-References` button instead of automatically running with `Analyze Defined Terms`.
- `Analyze Defined Terms` now refreshes only defined-term results and defined-term potential issues.
- `Analyze Cross-References` now refreshes only cross-reference issues and preserves existing defined-term results.
- Detected references include `Section 2.1`, `Section 5.4(a)`, `Article VII`, `Schedule A`, and `Exhibit B`.
- Detected headings include likely paragraph-start headings such as `2.1 Services`, `Section 5.4(a) Payment`, `ARTICLE VII`, `Schedule A`, and `Exhibit B`.
- References and headings are normalized into simple keys like `section:2.1`, `section:5.4(a)`, `article:vii`, `schedule:a`, and `exhibit:b`, then compared exactly.
- Results are labelled as `Potential Broken References`, not definitive legal errors.
- Added per-action loading state for task pane buttons, so one failed/read/analyze action should not permanently grey out the entire UI.
- Office initialization now uses the `Office.onReady()` promise path with a visible waiting/error message when Word or Office.js is not ready.
- Likely cause of the intermittent greyed-out buttons issue: the UI only tracked broad Office readiness, so if Office startup hung, loaded slowly, or failed before `Office.onReady` reported Word, all buttons stayed disabled with limited visible explanation.
- No AI, backend, database, authentication, persistent storage, or full-document logging was added.
- In-place validation remains blocked by local dataless/offloaded-file reads:
  - `npm run typecheck` is blocked by `Resource deadlock avoided` on `node_modules/.bin/tsc`.
  - `npm run build` is blocked by `Resource deadlock avoided` on `node_modules/.bin/tsc`.
  - `xmllint --noout manifest.xml` is blocked by `Resource deadlock avoided` / empty manifest reads.
- 2026-06-29 UI-flow validation:
  - In-place `npm run typecheck`, `npm run build`, and `xmllint --noout manifest.xml` are still blocked by local dataless/offloaded-file reads.
  - Workaround validation in `/tmp/contractr-step7-ui-check` passed `npm run typecheck` against the edited UI wiring, using a temporary defined-term stub because local `definedTerms.ts` was offloaded during validation.
  - Workaround validation in `/tmp/contractr-step7-ui-check` passed `npm run build` against the edited UI wiring, using the same temporary defined-term stub and a temporary Vite `index.html`/`main.tsx` because local entry files were offloaded during validation.
  - Direct cross-reference smoke check passed: broken `Section 9.9`, `Schedule C`, and `Exhibit D` were flagged, while valid `Section 2.1`, `Section 5.4(a)`, `Schedule A`, and `Exhibit B` were not flagged.
- Workaround validation in `/tmp/contractr-step7-check` passed:
  - `npm install` passed.
  - `npm run typecheck` passed against the Step 7 UI wiring and cross-reference module, using a temporary defined-term stub because the existing `definedTerms.ts` file was offloaded during validation.
  - `npm run build` passed against the Step 7 UI wiring and cross-reference module, using the same temporary defined-term stub.
  - Direct cross-reference smoke check passed: broken `Section 9.9`, `Schedule C`, and `Exhibit D` were flagged, while valid `Section 2.1`, `Section 5.4(a)`, `Schedule A`, and `Exhibit B` were not flagged.
- Known limitation: first-version heading detection is paragraph/line based and may miss headings inside tables, headers, footers, fields, or heavily formatted Word structures if Office.js does not expose them as normal paragraph text.
- Known limitation: cross-reference matching is exact after simple normalization; it does not yet understand ranges, grouped references, cross-document references, renamed attachments, or parent/child fallback logic.
- Known limitation: legal documents with prose lines that look like headings, or headings that contain verbs/punctuation, may produce false positives or false negatives.
- Known limitation: the readiness fix makes startup failures visible and recoverable in the UI, but Kevin still needs to retest repeated Word reload/open behavior because local iCloud/offloaded files are currently interfering with in-place dev-server validation.
- Suggested commit message: `Separate cross-reference action and fix add-in readiness`

---

### Step 8 — Obligation Tracker

**Status:** Implemented locally — Word for Mac manual retest still needed.

Goal:

Extract likely contractual obligations into a table.

Tasks:

- [x] Detect obligation language.
- [x] Extract likely responsible party.
- [x] Extract obligation sentence.
- [x] Extract obvious deadline if present.
- [x] Extract section/source if available.
- [x] Display results as `Potential Obligations`.
- [x] Test with dummy contract at code/smoke-check level.
- [ ] Test with fake Contractr agreement in Word.
- [ ] Commit working feature.

Definition of done:

- [x] Tool creates a rough obligation table from a sample contract at code/smoke-check level.
- [ ] Tool creates a rough obligation table from the fake Contractr agreement in Word.

Suggested commit message:

`Add obligation tracker`

Notes:

- Added deterministic obligation extraction in `packages/contract-core/src/obligations.ts`.
- Exported `extractPotentialObligations(documentText)` and the `PotentialObligation` type from `packages/contract-core/src/index.ts`.
- Updated the Word task pane with a separate `Analyze Obligations` button and a separate `Potential Obligations` results section.
- `Analyze Obligations` refreshes only obligation results and preserves existing defined-term, potential issue, and cross-reference results.
- Detected obligation triggers include `shall`, `must`, `will`, `is required to`, `agrees to`, `covenants to`, `shall not`, and `must not`.
- The first-version extractor splits document text into blank-line paragraphs, then sentence-like candidates, and labels each match as a potential obligation rather than a definitive legal conclusion.
- Likely responsible party is extracted from the text before the obligation trigger where possible.
- Timing extraction looks for simple phrases such as `within`, `no later than`, `on or before`, `prior to`, `before`, `after`, `by`, `upon`, `promptly`, `immediately`, `during`, `until`, and `following`.
- Source reference extraction carries forward simple headings such as `Section 2.1`, `Article VII`, `Schedule A`, and `Exhibit B` when detected from paragraph starts.
- No AI, backend, database, authentication, persistent storage, or full-document logging was added.
- In-place validation remains blocked by local dataless/offloaded-file reads:
  - `npm run typecheck` is blocked by `Resource deadlock avoided` on `node_modules/.bin/tsc`.
  - `npm run build` is blocked by `Resource deadlock avoided` on `node_modules/.bin/tsc`.
  - `xmllint --noout manifest.xml` is blocked by `Resource deadlock avoided` / empty manifest reads.
- Workaround validation in `/tmp/contractr-step8-check` passed:
  - `npm install` passed.
  - `npm run typecheck` passed.
  - `npm run build` passed.
  - Direct obligation smoke check passed for `shall`, `must`, `shall not`, and `agrees to`, including responsible-party, timing, and section-source extraction.
- Known limitation: first-version obligation extraction is deterministic and sentence-based; it can miss obligations split across multiple sentences, tables, schedules, headers, footers, or heavily formatted Word structures.
- Known limitation: party extraction is simple text-before-trigger parsing and can be wrong for passive voice, long clauses, nested provisos, or party names introduced in prior sentences.
- Known limitation: timing extraction only catches obvious timing phrases and does not normalize dates or calculate deadlines.
- Known limitation: the `will` trigger may produce false positives where future-tense drafting is descriptive rather than an obligation.
- Suggested commit message: `Add obligation tracker`

---

### Step 9 — AI Adapter Layer

**Status:** Not started

Goal:

Prepare for AI without locking Contractr into one provider.

Tasks:

- [ ] Create `packages/ai-adapters/`.
- [ ] Define generic `AIProvider` interface.
- [ ] Create `MockProvider`.
- [ ] Make any AI-style UI call the generic provider interface.
- [ ] Do not add real AI calls yet.
- [ ] Commit working interface.

Definition of done:

- [ ] App can call `MockProvider`.
- [ ] No real contract text is sent to any external service.

Suggested commit message:

`Add AI provider interface`

Notes:

-

---

### Step 10 — Selected-Clause Explanation

**Status:** Not started

Goal:

Add first AI-style workflow using selected text only.

Tasks:

- [ ] Add `Explain Selected Clause` button.
- [ ] Read selected text from Word.
- [ ] Send selected text to configured `AIProvider`.
- [ ] Display structured explanation.
- [ ] Start with `MockProvider`.
- [ ] Confirm full-contract AI review is not added.
- [ ] Commit working feature.

Definition of done:

- [ ] Selected clause explanation works with `MockProvider`.
- [ ] Only selected text is used.

Suggested commit message:

`Add selected clause explanation`

Notes:

-

---

### Step 11 — First Real AI Provider

**Status:** Not started

Goal:

Connect one real provider for non-confidential testing only.

Tasks:

- [ ] Choose provider: Ollama or OpenAI.
- [ ] Keep `MockProvider`.
- [ ] Keep AI-disabled mode available.
- [ ] Use environment variables for any credentials.
- [ ] Confirm no secrets are committed.
- [ ] Test only with dummy, public, or sanitized text.
- [ ] Commit working provider.

Definition of done:

- [ ] User can switch between mock and real test provider.
- [ ] No secrets are hardcoded.

Suggested commit message:

`Add first real AI provider`

Notes:

-

---

### Step 12 — Workplace-Safe Settings

**Status:** Not started

Goal:

Add visible settings for safe/default operation.

Tasks:

- [ ] Add settings panel.
- [ ] Show current AI provider.
- [ ] Support AI-disabled mode.
- [ ] Support selected-text-only mode.
- [ ] Keep full-document AI off by default.
- [ ] Keep full-document logging off by default.
- [ ] Commit working settings.

Definition of done:

- [ ] App starts in safe/default mode.
- [ ] User can clearly see whether AI is on or off.

Suggested commit message:

`Add workplace-safe settings`

Notes:

-

---

### Step 13 — Demo Materials

**Status:** Not started

Goal:

Create non-confidential materials for testing and demo.

Tasks:

- [ ] Create dummy demo contract.
- [ ] Create short demo script.
- [ ] Demonstrate defined-term map.
- [ ] Demonstrate potential undefined terms.
- [ ] Demonstrate unused definitions.
- [ ] Demonstrate broken references.
- [ ] Demonstrate potential obligations.
- [ ] Keep AI optional/off by default.
- [ ] Commit demo materials.

Definition of done:

- [ ] Contractr can be demoed without workplace confidential documents.

Suggested commit message:

`Add demo materials`

Notes:

-

---

### Step 14 — Cross-Platform Testing

**Status:** Not started

Goal:

Track whether the add-in works across target Word environments.

Tasks:

- [ ] Test on Mac Word.
- [ ] Test on Word on the Web if feasible.
- [ ] Test on non-work Windows Word if feasible.
- [ ] Record known issues.
- [ ] Do not test with workplace documents unless approved.
- [ ] Commit test checklist/results.

Definition of done:

- [ ] Test results are recorded below.

Suggested commit message:

`Add cross-platform test results`

Notes:

-

#### Test Matrix

| Test | Mac Word | Word on Web | Windows Word | Notes |
|---|---:|---:|---:|---|
| Add-in opens | ☐ | ☐ | ☐ |  |
| Read selected text | ☐ | ☐ | ☐ |  |
| Read full document | ☐ | ☐ | ☐ |  |
| Defined-term extraction | ☐ | ☐ | ☐ |  |
| Defined-term navigation | ☐ | ☐ | ☐ |  |
| Quality checks | ☐ | ☐ | ☐ |  |
| Cross-reference checker | ☐ | ☐ | ☐ |  |
| Obligation tracker | ☐ | ☐ | ☐ |  |
| AI-disabled mode | ☐ | ☐ | ☐ |  |
| No full-document logging by default | ☐ | ☐ | ☐ |  |

---

### Step 15 — Enterprise Prep

**Status:** Not started

Goal:

Prepare materials for possible IT/security discussion later.

Tasks:

- [ ] Create data-flow notes.
- [ ] Create deployment notes.
- [ ] Create AI-provider options notes.
- [ ] Explain AI-disabled mode.
- [ ] Explain data retention defaults.
- [ ] Explain logging defaults.
- [ ] Commit materials if appropriate.

Definition of done:

- [ ] Contractr can be explained as a contract navigation/mechanical review tool first, with optional configurable AI.

Suggested commit message:

`Add enterprise deployment notes`

Notes:

-

---

## Active Tasks

Move only the current milestone’s tasks here when work starts.

- [ ] Step 1: Create `apps/word-addin/`.
- [ ] Step 1: Generate initial Word task pane add-in.
- [ ] Step 1: Add `Read Selected Text`.
- [ ] Step 1: Test in Word on Mac.
- [ ] Step 1: Commit working skeleton.

---

## Blockers

- None currently.

---

## Decisions Log

Add durable implementation decisions here.

| Date | Decision | Reason |
|---|---|---|
| 2026-06-21 | Keep repo docs minimal for now. | CodeBot’s OpenClaw files already hold broader context, rules, and project memory. |
| 2026-06-21 | Do not create separate implementation-plan or ai-prompts docs in repo yet. | User will keep those separately in Google Drive. |

---

## Commit Log

Add commits after each working milestone.

| Date | Commit Message | Notes |
|---|---|---|
| 2026-06-21 | Add Contractr README and gitignore | Step 0 foundation. |

---

## Next Prompt for CodeBot

Use this for Step 1:

```text
You are CodeBot. Start Step 1 for Contractr.

Create the smallest working Microsoft Word Office.js task pane add-in inside apps/word-addin.

The add-in should:
- open as a sidebar in Word;
- show the title Contractr;
- include a button called Read Selected Text;
- use Office.js to read the selected text from the active Word document;
- display the selected text in the sidebar.

Do not add AI, full-document reading, defined-term detection, backend code, database code, or authentication yet.

Before coding, inspect the repo and tell me:
1. where you plan to create the add-in;
2. which files you plan to create or edit;
3. whether any setup commands are needed.

After implementation, explain how I can test it and suggest a GitHub Desktop commit message.
```
