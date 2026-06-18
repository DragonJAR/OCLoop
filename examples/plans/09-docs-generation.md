# Generate & Update Documentation

## Overview
Produce accurate, code-verified documentation for an existing project — README,
API reference, architecture notes, and inline docstrings — one area at a time,
each checked against the real code so the docs never drift from the truth. Use
this when docs are missing, stale, or out of sync with the implementation.

## Architecture context (read first)
Replace these paths with your own. Re-read every iteration.
- `README.md` - project overview, install/run/test instructions.
- `docs/` - long-form docs (create if missing): architecture, decisions, guides.
- `src/` - the source the docs must describe; API surface in `src/api/` or `src/routes/`.
- `AGENTS.md` - project operations and architecture for coding agents.

## Phase 1: Audit & outline
- [ ] **1.1** Inventory existing docs and gaps
  - List every doc file and what it covers; mark stale/missing/contradictory sections in `docs/docs-audit.md`
  - Compare doc claims against the code: wrong commands, renamed files, removed flags
- [ ] **1.2** Define the doc structure
  - Decide the doc set (README, API reference, architecture, getting-started) and the audience for each
  - Verify: the outline in `docs/docs-audit.md` covers every public surface and known gap

## Phase 2: README & getting started
- [ ] **2.1** Rewrite the README for accuracy
  - Update install, run, test, and config instructions; verify each command against the real project
  - Verify: every command in the README runs exactly as written
- [ ] **2.2** Write the getting-started / quickstart
  - A copy-paste path from zero to a running app, including env setup and the first call
  - Verify: follow the quickstart in a clean checkout; it works end-to-end

## Phase 3: API & code reference
- [ ] **3.1** Generate the API reference from the code
  - Document every public route/handler: method, path, params, request/response shape, errors
  - Verify: each documented endpoint matches a live route in `src/api/`; examples are valid
- [ ] **3.2** Add inline docstrings to the public surface
  - Document exported functions/types with purpose, params, returns, and a one-line example
  - Verify: the doc tool / type system reports no undocumented exports on the public surface

## Phase 4: Architecture & decisions
- [ ] **4.1** Write the architecture overview
  - Describe the layers, data flow, key modules, and external dependencies; include a simple diagram (ASCII or mermaid)
  - Verify: the description matches the actual structure in `src/`
- [ ] **4.2** Record key decisions and gotchas
  - Move permanent gotchas into `AGENTS.md`; record significant decisions as ADRs in `docs/`
  - Verify: every recorded decision references the code or issue that prompted it
- [MANUAL] **4.3** Human review of the docs
  - Read for tone, clarity, and correctness; note anything still unclear for a follow-up

## Testing Notes
- There is no code test for docs; "verify" means the claim is checked against the real code or command.
- Never describe behavior the code does not have — if the code lacks a feature, file a task rather than documenting an aspiration.
- Keep docs lean: detail lives in `docs/`, the README points to it.

## Acceptance criteria
1. Every command and path in the README runs exactly as written.
2. The API reference documents every public endpoint, verified against the code.
3. The architecture overview matches the real `src/` structure.
4. Key gotchas live in `AGENTS.md`; decisions are recorded as ADRs in `docs/`.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key doc decision or code fact it recorded) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
