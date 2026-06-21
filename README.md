# Contractr

Contractr is a planned cross-platform Microsoft Word contract-analysis add-in. It will help review contract text inside Word, starting with simple non-AI tools and growing carefully from there.

The first version is intended to work in Kevin's personal Mac Word setup. The project should also stay compatible with future workplace Windows Word use.

## Planned Approach

- Build a Microsoft Word task pane add-in using Office.js.
- Use React and TypeScript for the task pane UI.
- Keep reusable contract-analysis logic separate from the Word UI.
- Start with deterministic, no-AI contract tools before adding any AI features.
- Make AI optional, disabled by default, and swappable by provider.

## Security Principles

- Do not hardcode API keys, credentials, tokens, or secrets.
- Do not send workplace contracts to personal AI accounts.
- Do not store full contract text by default.
- Do not log client names, privileged material, or workplace-confidential contract content.
- Use dummy contracts, public contracts, or sanitized clauses for personal testing.

## Current Status

Step 0 is repo setup only. No application code has been added yet.

Next planned milestone: create the Word add-in skeleton with a task pane titled "Contractr" and a "Read Selected Text" button using Office.js.
