# Contractr Build Log

Purpose: track Contractr’s build progress, milestone status, next tasks, blockers, and commit history. This file should be updated by CodeBot after each meaningful change.

---

## Current Status

**Current milestone:** Step 5 — Defined-Term Quality Checks  
**Last completed milestone:** Step 4 — Contract-Core Refactor  
**Next task:** Retest `Analyze Defined Terms` in Word for Mac with the fake Contractr test agreement and confirm the new `Potential Issues` section appears.

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

**Status:** Implemented locally — Word for Mac manual retest still needed.

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

- [ ] Tool flags obvious unused definitions.
- [ ] Tool flags repeated capitalized phrases that may be undefined.
- [ ] Tool flags similar terms.

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

**Status:** Not started

Goal:

Turn the sidebar into a usable contract map.

Tasks:

- [ ] Allow clicking a defined term.
- [ ] Navigate to likely definition location.
- [ ] Show usage locations where feasible.
- [ ] Allow clicking a usage to jump to occurrence.
- [ ] Add basic highlighting or selection if feasible.
- [ ] Test in Word on Mac.
- [ ] Commit working feature.

Definition of done:

- [ ] Clicking a sidebar item moves the user to the relevant part of the Word document.

Suggested commit message:

`Add defined term navigation`

Notes:

-

---

### Step 7 — Cross-Reference Checker

**Status:** Not started

Goal:

Detect likely broken section, schedule, article, or exhibit references.

Tasks:

- [ ] Detect references to sections.
- [ ] Detect references to articles.
- [ ] Detect references to schedules.
- [ ] Detect references to exhibits.
- [ ] Detect actual headings.
- [ ] Compare references against detected headings.
- [ ] Display potential broken references.
- [ ] Test with intentionally broken dummy contract.
- [ ] Commit working feature.

Definition of done:

- [ ] Tool flags intentionally broken references in a dummy contract.

Suggested commit message:

`Add cross-reference checker`

Notes:

-

---

### Step 8 — Obligation Tracker

**Status:** Not started

Goal:

Extract likely contractual obligations into a table.

Tasks:

- [ ] Detect obligation language.
- [ ] Extract likely responsible party.
- [ ] Extract obligation sentence.
- [ ] Extract obvious deadline if present.
- [ ] Extract section/source if available.
- [ ] Display results as `Potential Obligations`.
- [ ] Test with dummy contract.
- [ ] Commit working feature.

Definition of done:

- [ ] Tool creates a rough obligation table from a sample contract.

Suggested commit message:

`Add obligation tracker`

Notes:

-

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
