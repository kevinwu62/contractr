# Contractr Build Log

Purpose: track Contractr’s build progress, milestone status, next tasks, blockers, and commit history. This file should be updated by CodeBot after each meaningful change.

---

## Current Status

**Current milestone:** Step 15B — selectR Card Behavior and Layout Cleanup
**Last completed milestone:** Step 15A — selectR/analyzR UI Cleanup
**Next task:** Retest the updated selectR card behavior and analyzR scoping in Word for Mac with the fake Contractr test agreement.

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

**Status:** Done — tested successfully in Word for Mac by Kevin.

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

**Status:** Done

Goal:

Prepare for AI without locking Contractr into one provider.

Tasks:

- [x] Create `packages/ai-adapters/`.
- [x] Define generic `AIProvider` interface.
- [x] Create `MockProvider`.
- [x] Make any AI-style UI call the generic provider interface.
- [x] Do not add real AI calls yet.
- [ ] Commit working interface.

Definition of done:

- [x] App can call `MockProvider`.
- [x] No real contract text is sent to any external service.

Suggested commit message:

`Add AI provider interface`

Notes:

- `packages/ai-adapters/` exists with a generic `AIProvider` interface and `MockProvider` only.
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, `.env`, or API keys were added.
- The adapter package is currently consumed by the Word add-in through local TypeScript/Vite aliases.

---

### Step 10 — Selected-Clause Explanation

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Add first AI-style workflow using selected text only.

Tasks:

- [x] Add `Explain Selected Clause` button.
- [x] Read selected text from Word.
- [x] Send selected text to configured `AIProvider`.
- [x] Display structured explanation.
- [x] Start with `MockProvider`.
- [x] Confirm full-contract AI review is not added.
- [ ] Commit working feature.

Definition of done:

- [x] Selected clause explanation works with `MockProvider` at code/build-validation level.
- [x] Only selected text is used.

Suggested commit message:

`Add selected clause explanation`

Notes:

- Recovery after Kevin's MacBook crash found six Step 10 files modified and no partial `docs/build-log.md` update.
- Added `Explain Selected Clause` to the Word task pane.
- The new action reads only `context.document.getSelection().text`, then calls `MockProvider.explainClause({ selectedText })`.
- Added a separate `Mock Clause Explanation` section with selected text preview, mock summary, mock explanation, mock review points, mock safety notes, and the label `Mock output only — no real AI provider was called.`
- Existing deterministic outputs are not overwritten by the mock explanation flow.
- `Read Selected Text`, `Read Full Document`, `Analyze Defined Terms`, `Analyze Cross-References`, and `Analyze Obligations` remain separate actions.
- Added local TypeScript and Vite aliases for `@contractr/ai-adapters`.
- Extended `ClauseAnalysisResult` with `explanation` and `reviewPoints` so the mock selected-clause response can be displayed as structured output.
- No real AI provider, backend, database, authentication, Next.js, API keys, `.env`, full-document AI review, or external contract-text transmission was added.
- In-place validation passed after recovery:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
  - `../../apps/word-addin/node_modules/.bin/tsc --noEmit -p tsconfig.json` in `packages/ai-adapters`
  - bundled `MockProvider.explainClause` smoke check with `esbuild`
- `npm run typecheck` directly inside `packages/ai-adapters` is not currently self-contained because that package has no local `node_modules`; the shared TypeScript binary from the add-in was used instead.
- Kevin confirmed Step 10 is complete and tested.

---

### Step 11 — selectR/analyzR UI Shell

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Organize the task pane around selection-based and whole-document modes.

Tasks:

- [x] Add a clear top-level mode switch for `selectR` and `analyzR`.
- [x] Move selection-based tools into `selectR`.
- [x] Move whole-document tools into `analyzR`.
- [x] Keep existing result sections working.
- [x] Keep mock clause explanation clearly labelled as mock-only.
- [x] Do not add live selection watching, action cards, routing, backend, database, auth, Next.js, or real AI providers.
- [x] Run local validation.
- [x] Retest in Word with the fake Contractr test agreement.
- [ ] Commit working feature.

Definition of done:

- [x] `selectR` shows `Read Selected Text` and `Explain Selected Clause`.
- [x] `analyzR` shows `Read Full Document`, `Analyze Defined Terms`, `Analyze Cross-References`, and `Analyze Obligations`.
- [x] Switching modes does not clear existing React result state.
- [x] Kevin confirms the mode shell works in Word for Mac.

Suggested commit message:

`Add selectR and analyzR mode shell`

Notes:

- Added an `activeMode: "selectR" | "analyzR"` React state value in the Word task pane.
- Added a simple two-button mode switch at the top of the sidebar.
- `selectR` contains the selection-based tools:
  - `Read Selected Text`
  - `Explain Selected Clause`
- `analyzR` contains whole-document tools:
  - `Read Full Document`
  - `Analyze Defined Terms`
  - `Analyze Cross-References`
  - `Analyze Obligations`
- Added the `selectR tools act on the text currently selected in Word.` helper text.
- Existing Office.js handlers were preserved; no contract-analysis logic was moved or rewritten.
- Existing result state is not cleared when switching modes.
- The mock explanation section remains labelled `Mock output only — no real AI provider was called.`
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, Next.js, API keys, `.env`, live selection watching, persistent action cards, or full-document AI review was added.
- In-place validation passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
  - `../../apps/word-addin/node_modules/.bin/tsc --noEmit -p tsconfig.json` in `packages/ai-adapters`
  - bundled `MockProvider.explainClause` smoke check with `esbuild`
- Known limitation: `selectR` does not automatically react to Word selection changes yet.
- Known limitation: the UI shell does not yet include persistent action cards or open-section-in-sidebar behavior.
- Kevin confirmed Step 11 is complete and tested.

---

### Step 12 — Live Selection Preview

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

Show the current Word selection live in `selectR`.

Tasks:

- [x] Add a `Current Selection` section in `selectR`.
- [x] Read the current Word selection into React UI state only.
- [x] Register Office.js document selection change handling where available.
- [x] Add a safe fallback refresh path while `selectR` is active.
- [x] Show selected text preview, character count, and selected-text-only note.
- [x] Show a friendly empty state when no text is selected.
- [x] Keep manual `Read Selected Text` and `Explain Selected Clause` actions working.
- [x] Do not automatically call `MockProvider` or deterministic analyzers.
- [x] Do not add real AI, backend, database, auth, Next.js, API keys, or persistent selected-text storage.
- [x] Run local validation.
- [x] Retest in Word with the fake Contractr test agreement.
- [ ] Commit working feature.

Definition of done:

- [x] `selectR` displays a `Current Selection` section.
- [x] The preview updates through Office.js selection events when supported.
- [x] A guarded fallback keeps the preview refreshable if selection events are unreliable.
- [x] No automatic analysis or AI provider call runs from selection changes.
- [x] Kevin confirms live preview works in Word for Mac.

Suggested commit message:

`Add live selection preview`

Notes:

- Added `currentSelectionText` and `currentSelectionError` state in the Word task pane.
- Added `refreshCurrentSelectionPreview()`, which reads only `context.document.getSelection().text` and stores it in current React UI state.
- Added `Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, ...)` while `selectR` is active.
- Added a guarded 2-second polling fallback while `selectR` is active so the preview can still update if Word for Mac does not reliably fire selection-change events in the local add-in host.
- Selection preview refreshes are skipped if another refresh is already running to avoid noisy overlapping Office.js reads.
- Manual `Read Selected Text` and `Explain Selected Clause` also sync the `Current Selection` preview after reading the selected text.
- The preview shows selected text, character count, and `Actions will use this selected text only.`
- Empty state says `Select text in Word to see context-aware options.`
- Selection changes do not call `MockProvider`, analyze defined terms, analyze obligations, analyze cross-references, or write selected text outside current UI state.
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, Next.js, API keys, `.env`, full-document AI review, or selected-text logging was added.
- In-place validation passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
- Known limitation: if Word selection events are unavailable or delayed, the preview may update on the fallback interval instead of instantly.
- Known limitation: this step does not add automatic analysis, persistent action cards, or open-section-in-sidebar behavior.
- Kevin confirmed Step 12 is complete and tested.

---

### Step 13 — Selection-Based Action Detection

**Status:** Done — tested successfully in Word for Mac by Kevin; follow-up fixes validated locally.

Goal:

Detect useful context from the current `selectR` selection and show relevant available actions without automatically running them.

Tasks:

- [x] Add reusable deterministic selection-context detection in `packages/contract-core`.
- [x] Detect section, article, schedule, and exhibit references.
- [x] Detect quoted defined-term candidates and repeated capitalized-term candidates.
- [x] Improve selectR defined-term detection by matching selected text against already analyzed whole-document defined terms.
- [x] Keep confirmed known defined terms separate from potential defined-term candidates in the UI.
- [x] Avoid partial known-term matches inside longer capitalized phrases such as `Service Provider`, `Closing Date`, and `Base Purchase Price`.
- [x] Fix overlapping known-term matching so shorter terms are still detected when they appear as separate standalone occurrences.
- [x] Preserve selected text line and paragraph breaks where Office.js exposes enough selection context.
- [x] Detect obligation language such as `shall`, `must`, `will`, `agrees to`, `is required to`, and `shall not`.
- [x] Detect clause-like selected text.
- [x] Add `Detected Elements` under `Current Selection`.
- [x] Add `Available Actions` under `Current Selection`.
- [x] Show `Go to Section/Article` and `Open Section/Article in Sidebar` when section or article references are detected.
- [x] Show `Analyze Defined Terms` when likely defined terms are detected.
- [x] Show `Analyze Relevant Obligations` when obligation language is detected.
- [x] Show `Edit with AI` as a mock-only placeholder when selected text appears clause-like.
- [x] Keep actions as non-running placeholders for this step.
- [x] Keep existing `selectR` and `analyzR` buttons working.
- [x] Do not automatically run analysis or call `MockProvider` on selection changes.
- [x] Do not add real AI, backend, database, authentication, Next.js, API keys, or persistent selected-text storage.
- [x] Run local validation and contract-core smoke checks.
- [x] Retest in Word with the fake Contractr test agreement.
- [ ] Commit working feature.

Definition of done:

- [x] `selectR` displays detected elements for selected text.
- [x] `selectR` displays relevant available action placeholders.
- [x] Detection logic is reusable from `contract-core`, not embedded in the UI.
- [x] Selection changes do not automatically trigger analysis or AI.
- [x] Kevin confirms detection and action placeholders work in Word for Mac.

Suggested commit message:

`Preserve selected text line breaks`

Notes:

- Added `detectSelectionContext(selectedText, options)` in `packages/contract-core/src/selectionContext.ts`.
- The helper returns structured references, confirmed known defined terms, potential defined-term candidates, obligation signals, a clause-like flag, and available actions.
- The Word task pane derives detection output from `currentSelectionText` using `useMemo` and passes the existing analyzR `definedTerms` result when `Analyze Defined Terms` has already been run.
- Known defined-term matching is boundary-aware and now uses span-based overlap filtering. Contractr first finds standalone occurrences for each known defined term, then rejects a shorter-term occurrence only when that specific character span sits inside a longer known-term match. This avoids globally suppressing shorter terms.
- Fixed a selectR overlapping-term bug found after the first Step 13 improvement: `Service` could be suppressed too aggressively when `Service Provider` was also known. The corrected matcher detects `Service` when it appears separately, while still avoiding the embedded `Service` inside `Service Provider`.
- Smoke checks confirmed:
  - `The Buyer shall pay the Purchase Price on the Closing Date.` detects `Buyer`, `Purchase Price`, and `Closing Date` when those are known terms.
  - `The Service Provider shall provide the Service.` detects both `Service Provider` and `Service`.
  - `The Service Provider shall comply with this Agreement.` detects `Service Provider` and `Agreement`, but not `Service` merely because it appears inside `Service Provider`.
  - `The Buyer shall pay the Base Purchase Price and the Purchase Price adjustment.` detects `Base Purchase Price`, `Buyer`, and the separate `Purchase Price` occurrence.
  - `The Closing Date occurs after Closing.` detects both `Closing Date` and the separate `Closing` occurrence.
  - `The Closing Date is July 1.` detects `Closing Date` and does not detect `Closing` merely inside `Closing Date`.
- The UI now distinguishes `Defined terms found in selection` from `Potential defined-term candidates`.
- If whole-document defined-term analysis has not been run yet, selectR shows `Run Analyze Defined Terms in analyzR for more accurate selectR defined-term detection.`
- The UI renders `Detected Elements` and `Available Actions` below `Current Selection`.
- Available actions are disabled placeholders in this step:
  - `Go to Section/Article` — coming in next step.
  - `Open Section/Article in Sidebar` — coming in next step.
  - `Analyze Defined Terms` — coming in next step.
  - `Analyze Relevant Obligations` — coming in next step.
  - `Edit with AI` — mock-only placeholder.
- This step did not change the existing manual `Read Selected Text`, `Explain Selected Clause`, `Read Full Document`, `Analyze Defined Terms`, `Analyze Cross-References`, or `Analyze Obligations` button behavior.
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, Next.js, API keys, `.env`, full-document AI review, or selected-text logging was added.
- In-place validation passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
  - direct contract-core TypeScript check through the add-in's shared TypeScript binary
  - bundled `detectSelectionContext` smoke check with `esbuild`
- Follow-up validation for the standalone defined-term matching fix passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
  - bundled `detectSelectionContext` smoke check with `esbuild` for the overlapping standalone occurrence cases above
- Fixed a selected-text formatting issue where multi-paragraph selections could appear as one flattened block in `selectR`.
- Added a shared Word selection reader in `apps/word-addin/src/wordSelection.ts`.
- The reader first tries `Office.context.document.getSelectedDataAsync(Office.CoercionType.Text)`, then reads the Word selection range text and selected paragraph collection through `context.document.getSelection()`.
- When the exact selected text appears to match the selected paragraphs safely, Contractr joins selected paragraphs with blank lines for display and downstream selection features.
- For partial selections across paragraphs, Contractr reconstructs paragraph-separated display text only when token-level matching proves the reconstructed text is the same selected content. If that check fails, it falls back to the exact selected range text to avoid over-including unselected paragraph text.
- `definition-text` sidebar blocks now render with `white-space: pre-wrap`, so live Current Selection preview and Mock Clause Explanation selected-text preview show visible line and paragraph breaks.
- Follow-up validation for selected-text formatting passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
  - bundled `wordSelection` smoke check with `esbuild` for full-paragraph reconstruction, partial two-paragraph reconstruction, fallback behavior, and normalized detection text
- Known limitation: first-pass selection detection is regex-based and can miss unusual reference formats or produce false positives from ordinary capitalized prose.
- Known limitation: confirmed selectR defined-term detection depends on running `Analyze Defined Terms` in `analyzR` first; otherwise Contractr only shows lower-confidence candidates.
- Known limitation: candidate defined-term detection remains heuristic. It intentionally avoids confidently treating short standalone headings such as `General Provisions` as defined terms unless they are in the known defined-term list.
- Known limitation: Word may expose selected paragraphs as whole paragraph text. Contractr avoids over-including unselected text, so unusual partial selections may still fall back to the flattened exact range text if safe paragraph reconstruction is not possible.
- Known limitation: action chips were placeholders during Step 13; Step 14 begins turning the safe deterministic/mock actions into persistent cards.

---

### Step 14 — Persistent selectR Action Cards

**Status:** Done — tested successfully in Word for Mac by Kevin.

Goal:

When a user clicks an available `selectR` action, create a closeable result card from a snapshot of the current selection. The card stays visible until closed, even when the Word selection changes.

Tasks:

- [x] Add persistent `selectRCards` state in the Word task pane.
- [x] Give each card a unique ID.
- [x] Snapshot selected text, normalized analysis text, detected elements, action type, and creation time.
- [x] Add close buttons for individual cards.
- [x] Keep cards stable when the Word selection changes.
- [x] Add an `Open Action Cards` section in `selectR`.
- [x] Make `Analyze Defined Terms` create a defined-term card.
- [x] Make `Analyze Relevant Obligations` create an obligation card.
- [x] Make `Edit with AI` create a mock-only card that clearly says no real provider was called.
- [x] Keep section/article actions as placeholder cards for now.
- [x] Keep live selection preview, `Read Selected Text`, and `Explain Selected Clause` working.
- [x] Keep analyzR `Analyze Defined Terms`, `Analyze Cross-References`, and `Analyze Obligations` working.
- [x] Do not add real AI, backend, database, authentication, Next.js, API keys, or persistent selected-text storage.
- [x] Run local validation and smoke checks.
- [x] Retest in Word with the fake Contractr test agreement.
- [ ] Commit working feature.

Definition of done:

- [x] `selectR` action chips create persistent cards.
- [x] Cards can be closed one at a time.
- [x] Existing cards do not change when the Word selection changes.
- [x] Functional cards exist for defined terms, obligations, and mock-only edit.
- [x] Kevin confirms persistent action cards work in Word for Mac.

Suggested commit message:

`Add persistent selectR action cards`

Notes:

- Added a `SelectRCard` model in `apps/word-addin/src/App.tsx`.
- Cards store only current React UI state, including a selected-text snapshot, normalized analysis-text snapshot, detected-elements snapshot, action ID, title, result, and creation time.
- `Analyze Defined Terms` cards show confirmed known defined terms and potential defined-term candidates from the selection snapshot.
- `Analyze Relevant Obligations` cards run the existing deterministic `extractPotentialObligations` function against the normalized selection snapshot and show potential obligations or obligation triggers.
- `Edit with AI` cards are mock-only UI cards. They clearly state that no real AI provider was called and no selected text was sent outside the task pane.
- `Go to Section/Article` and `Open Section/Article in Sidebar` currently create simple placeholder cards for a future navigation/sidebar step.
- Updated `packages/contract-core/src/selectionContext.ts` so the deterministic defined-term and obligation actions are now marked `available`; section/article actions remain `comingSoon`, and `Edit with AI` remains `mockOnly`.
- Existing manual selection workflows are unchanged:
  - `Read Selected Text`
  - `Explain Selected Clause`
- Existing analyzR workflows are unchanged:
  - `Read Full Document`
  - `Analyze Defined Terms`
  - `Analyze Cross-References`
  - `Analyze Obligations`
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, Next.js, API keys, `.env`, full-document AI review, or selected-text logging was added.
- In-place validation passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
  - `./apps/word-addin/node_modules/.bin/tsc --noEmit -p packages/ai-adapters/tsconfig.json`
  - direct contract-core and ai-adapters TypeScript check through the add-in's shared TypeScript binary with Bundler resolution
  - bundled Step 14 smoke check with `esbuild` for selection actions, obligation extraction, and `MockProvider`
- The package-local `npm run typecheck` in `packages/ai-adapters` currently fails because that package does not have its own installed `node_modules/.bin/tsc`; the same TypeScript project passes when run with the add-in's shared TypeScript binary.
- Known limitation: cards are not persisted beyond the current task-pane session. Reloading the add-in clears them.
- Historical Step 14 limitation: section/article action cards were placeholders only during Step 14. Step 15 replaces those placeholders with navigation and sidebar-reference behavior.
- Known limitation: `Edit with AI` is mock-only and does not call a real provider.

---

### Step 15 — selectR Section Navigation Cards

**Status:** Implemented locally — Word for Mac manual retest still needed.

Goal:

Turn the section/article selectR placeholders into useful navigation or sidebar cards.

Tasks:

- [x] Decide whether `Go to Section/Article` should navigate immediately, create a card, or both.
- [x] Use existing Word search/navigation helpers where possible.
- [x] Make `Go to Section/Article` select the referenced section/article when Word can find it.
- [x] Make `Open Section/Article in Sidebar` create a persistent card with the referenced text when feasible.
- [x] Keep cards snapshot-based and closeable.
- [x] Preserve existing selectR cards and analyzR tools.
- [x] Do not add AI, backend, database, authentication, or Next.js.
- [x] Run local validation and smoke checks.
- [ ] Retest in Word with the fake Contractr test agreement.
- [ ] Commit working feature.

Definition of done:

- [x] Section/article actions are no longer placeholder-only.
- [x] User can navigate to or open a referenced section/article from selectR.
- [x] Existing persistent cards still work at code/UI level.
- [ ] Kevin confirms section/article actions work in Word for Mac.

Suggested commit message:

`Add selectR section navigation cards`

Notes:

- `Go to Section/Article` now runs immediately instead of creating a placeholder card.
- `Open Section/Article in Sidebar` now creates a persistent `sectionReference` card from a snapshot of the current selection context.
- Updated `packages/contract-core/src/crossReferences.ts` with reusable deterministic helpers for resolving a selected reference to a heading target:
  - parses `Section`, `Article`, `Schedule`, and `Exhibit` references;
  - normalizes references using the same key style as the cross-reference checker;
  - finds the matching heading-like paragraph;
  - returns Word search candidates that prefer the matched heading text;
  - extracts an approximate snippet beginning at the matched heading and ending before the next detected heading or the snippet limit.
- Updated `packages/contract-core/src/selectionContext.ts` so the reference actions are available for detected section, article, schedule, and exhibit references.
- The Word task pane now uses the new target helper to navigate by selecting the best heading match through Office.js search/selection APIs.
- Sidebar section cards show the selected reference, reference type, matched heading, approximate extraction label, and extracted text where feasible.
- Missing or broken references fail gracefully with a clear not-found message or a persistent card explaining that no matching heading was detected.
- Existing persistent cards remain unchanged:
  - `Analyze Defined Terms`
  - `Analyze Relevant Obligations`
  - `Edit with AI` mock-only
- Existing analyzR workflows remain unchanged:
  - `Analyze Defined Terms`
  - `Analyze Cross-References`
  - `Analyze Obligations`
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, Next.js, API keys, `.env`, document edits, auto-inserted links, or selected/full-document logging was added.
- In-place validation passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout manifest.xml` in `apps/word-addin`
  - bundled Step 15 smoke check for selection reference detection, section/article/schedule target lookup, approximate extraction, missing-reference handling, and existing broken-reference checking
- Known limitation: navigation and extraction are deterministic and heading-based. Unusual formatting, tables, headers/footers, or references whose headings do not appear as paragraph text may not resolve.
- Known limitation: if a selection contains multiple references, the first detected reference is used for navigation/open-sidebar in this first version.
- Known limitation: sidebar extraction is approximate and intentionally labelled that way. It stops at the next detected heading or a snippet limit; it does not yet model nested clause hierarchy.
- Known limitation: the action labels still say `Section/Article` even though the underlying helper also supports schedules and exhibits.

---

### Step 15A — selectR/analyzR UI Cleanup

**Status:** Implemented locally — Word for Mac manual retest still needed.

Goal:

Simplify the selectR and analyzR workflows while preserving the existing deterministic analysis and mock-only AI behavior.

Tasks:

- [x] Remove the visible `Current Selection` preview box from `selectR` while keeping internal live selection tracking.
- [x] Move `Available Actions` to the top of `selectR`, directly under the `selectR` heading.
- [x] Remove standalone `Read Selected Text` and `Explain Selected Clause` buttons from `selectR`.
- [x] Add `Explain Selected Clause` to the `Available Actions` flow for clause-like selections.
- [x] Make `Explain Selected Clause` create a persistent closeable mock-only selectR card.
- [x] Replace separate analyzR buttons with one `Analyze Contract` button.
- [x] Run full-document reading, defined-term analysis, defined-term issue checks, cross-reference checks, and obligation checks from `Analyze Contract`.
- [x] Group analyzR output under `Contract Analysis Results`.
- [x] Simplify selectR `Analyze Defined Terms` cards so they show only selection-relevant terms and definitions or a clear no-definition-found message.
- [x] Run local validation and smoke checks.
- [ ] Retest in Word for Mac with the fake Contractr test agreement.
- [ ] Commit working UI cleanup.

Definition of done:

- [x] selectR no longer shows the Current Selection preview box.
- [x] Available Actions is the first selectR content section.
- [x] selectR standalone buttons are removed from the rendered UI.
- [x] Clause explanation remains mock-only and persistent until the user closes its card.
- [x] analyzR exposes one user-facing `Analyze Contract` action.
- [x] Existing deterministic and mock-provider logic remains local.
- [ ] Kevin confirms the cleaned flows work in Word for Mac.

Suggested commit message:

`Refine selectR and analyzR workflows`

Notes:

- `packages/contract-core/src/selectionContext.ts` now includes `Explain Selected Clause` as a mock-only available action when the current selection is clause-like.
- `apps/word-addin/src/App.tsx` keeps live selection state for detection, but removes the visible Current Selection text/character-count preview from selectR.
- `Available Actions` now appears directly below the selectR title/description and before detected elements or action cards.
- Removed the rendered standalone selectR buttons:
  - `Read Selected Text`
  - `Explain Selected Clause`
- `Explain Selected Clause` now reads the current Word selection at click time, calls only `MockProvider.explainClause`, and creates a persistent closeable selectR card labelled as mock-only with no real AI provider called.
- analyzR now renders one `Analyze Contract` button. It reads the full document once, then refreshes:
  - defined terms;
  - defined-term potential issues;
  - potential broken cross-references;
  - potential obligations.
- analyzR results are grouped under `Contract Analysis Results` with a deterministic-local/no-real-AI label.
- selectR defined-term cards no longer show broad whole-document issue output, cross-reference output, obligation output, usage-count details, or unrelated potential issues. They now show only selected confirmed terms with definitions, plus selected candidate terms with a no-definition-found note.
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, Next.js, API keys, `.env`, real AI provider, document edits, selected-text logging, or full-document logging was added.
- In-place validation passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout apps/word-addin/manifest.xml`
  - bundled smoke check for defined-term extraction, cross-reference checking, obligation extraction, `Explain Selected Clause` action detection, and `MockProvider.explainClause`
- Validation note: `npm run typecheck` from `packages/ai-adapters` did not run directly because that package does not have its own installed `tsc` binary. The adapter source was typechecked through the Word add-in TypeScript project and covered by the bundled smoke check.
- Known limitation: manual Word retesting is still needed for the cleaned flows.
- Known limitation: selectR confirmed defined-term cards can show definitions only after analyzR `Analyze Contract` has populated whole-document defined-term results. Otherwise candidate terms are shown with the no-definition-found message.
- Known limitation: clause suitability still uses the existing deterministic clause-like heuristic; unusual short clauses may not surface `Explain Selected Clause`.

---

### Step 15B — selectR Card Behavior and Layout Cleanup

**Status:** Implemented locally — Word for Mac manual retest still needed.

Goal:

Clean up selectR card behavior and display scope while preserving deterministic analysis and mock-only AI behavior.

Tasks:

- [x] Move `Detected Elements` to the bottom of selectR.
- [x] Rename the box to `Detected Elements — for bug fixing only`.
- [x] Change selectR cards to temporary-by-default behavior.
- [x] Keep temporary cards open during selection changes.
- [x] Replace old unpinned cards only when a new action is run after a changed selection.
- [x] Add `Pin` behavior to selectR cards.
- [x] Keep pinned cards until `Close` is clicked.
- [x] Scope `Analyze Contract` results to the analyzR tab only.
- [x] Simplify selectR action card content by removing selected-text snapshots, creation times, repeated labels, and debug filler.
- [x] Keep mock-only warning text on mock provider cards.
- [x] Run local validation and smoke checks.
- [ ] Retest in Word for Mac with the fake Contractr test agreement.
- [ ] Commit working card/layout cleanup.

Definition of done:

- [x] selectR shows only Available Actions, selectR action cards, and `Detected Elements — for bug fixing only`.
- [x] analyzR results are not visible while selectR is active.
- [x] analyzR results remain in state and reappear when switching back to analyzR.
- [x] Unpinned cards from old selections are removed only when an action is run for a newer selection.
- [x] Pinned cards survive newer actions and close only through `Close`.
- [ ] Kevin confirms the behavior in Word for Mac.

Suggested commit message:

`Refine selectR card behavior and layout`

Notes:

- `apps/word-addin/src/App.tsx` now tracks a simple `selectionVersion` that increments only when the selected text changes.
- New selectR cards store `selectionVersion` and `isPinned`.
- `addSelectRCard` keeps pinned cards and same-selection cards, but removes unpinned cards from older selections when a new card is created for a newer selection.
- Selection changes alone do not close cards.
- Clicking an action again without a changed selection does not clear prior cards from that same selection.
- Each card now has `Pin` and `Close` controls. `Pin` toggles `isPinned`; `Close` removes the card whether pinned or unpinned.
- `Detected Elements — for bug fixing only` now renders after Available Actions and Open Action Cards.
- The shared output area now renders only while `activeMode === "analyzR"`, so full contract analysis results do not appear in selectR.
- Card content was simplified: selected-text snapshots, created-at timestamps, repeated action labels, and generic debug filler were removed from selectR card rendering.
- Mock cards still show `Mock output only - no real AI provider was called.`
- No OpenAI, Copilot, Claude, Gemini, Ollama, Azure OpenAI, backend, database, authentication, Next.js, API keys, `.env`, real AI provider, document edits, selected-text logging, or full-document logging was added.
- In-place validation passed:
  - `npm run typecheck` in `apps/word-addin`
  - `npm run build` in `apps/word-addin`
  - `xmllint --noout apps/word-addin/manifest.xml`
  - bundled Step 15B smoke check for selection action detection, defined-term extraction, obligation extraction, broken-reference checking, and `MockProvider.explainClause`
- Validation note: `npm run typecheck` from `packages/ai-adapters` still does not run directly because that package does not have its own installed `tsc` binary. The adapter source was typechecked through the Word add-in TypeScript project and covered by the bundled smoke check.
- Known limitation: manual Word retesting is still needed for card cleanup, pin behavior, and analyzR scoping.
- Known limitation: selectR confirmed defined-term cards can show definitions only after analyzR `Analyze Contract` has populated whole-document defined-term results.
- Known limitation: clause suitability still uses the existing deterministic clause-like heuristic; unusual short clauses may not surface `Explain Selected Clause`.

---

### Step 16 — Demo Materials

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

### Step 17 — Cross-Platform Testing

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

### Step 18 — Enterprise Prep

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

- [x] Step 15B: Move and rename `Detected Elements — for bug fixing only`.
- [x] Step 15B: Add temporary-by-default selectR card cleanup.
- [x] Step 15B: Add selectR card Pin behavior.
- [x] Step 15B: Scope analyzR results to analyzR only.
- [x] Step 15B: Simplify selectR card content.
- [x] Step 15B: Run local validation and smoke checks.
- [ ] Step 15B: Retest in Word on Mac with the fake Contractr test agreement.
- [ ] Step 15B: Commit working card/layout cleanup.

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
