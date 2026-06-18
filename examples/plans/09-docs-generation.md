# Generate & Update Documentation

## Overview
Produce accurate, code-verified documentation for an existing project — README,
API reference, architecture notes, and inline docstrings — one area at a time,
each checked against the real code so the docs never drift from the truth. Use
this when docs are missing, stale, or out of sync with the implementation.

**Methodology (how the pros do it):** Structure docs by **Diátaxis** — four modes,
each with a single purpose: **Tutorials** (learning), **How-to guides** (task),
**Reference** (information, e.g. generated API docs), **Explanation**
(understanding). Never mix them on one page. Treat docs as code: Markdown in the
repo, reviewed via PR, built in CI. Keep docs honest with code — generate the API
reference from source, lint prose (**Vale**), and check links on every PR so stale
or broken docs fail the build.

**Tools/standards named here:** **Diátaxis** (diataxis.fr); docs-as-code on
Sphinx/MkDocs/Docusaurus/Starlight; **Vale** (vale.sh) prose linter; generated API
docs (TypeDoc, JSDoc, sphinx-autodoc, Doxygen); link checkers (lychee,
markdown-link-check).

## Architecture context (read first)
Replace these paths with your own. Re-read every iteration.
- `README.md` - project overview, install/run/test instructions.
- `docs/` - long-form docs (create if missing): architecture, decisions, guides.
- `src/` - the source the docs must describe; API surface in `src/api/` or `src/routes/`.
- `AGENTS.md` - project operations and architecture for coding agents.

## Phase 1 — Audit & outline
- [ ] **1.1 (recon)** Inventory existing docs and gaps
  - List every doc file; classify each into a Diátaxis mode; mark stale/missing/contradictory sections in `docs/docs-audit.md`; compare doc claims against the code (wrong commands, renamed files, removed flags)
  - **Recursion:** for each discovered gap (missing page, broken link, undocumented symbol, mis-classified doc) insert one `- [ ]` task below to fix it
- [ ] **1.2** Define the doc structure
  - Decide the doc set (README, API reference, architecture, getting-started) and the Diátaxis mode + audience for each
  - Verify: the outline in `docs/docs-audit.md` covers every public surface and known gap

## Phase 2 — README & getting started
- [ ] **2.1** Rewrite the README for accuracy
  - Update install, run, test, and config instructions; verify each command against the real project
  - Verify: every command in the README runs exactly as written
- [ ] **2.2** Write the getting-started / quickstart (a How-to guide)
  - A copy-paste path from zero to a running app, including env setup and the first call
  - Verify: follow the quickstart in a clean checkout; it works end-to-end

## Phase 3 — API & code reference
- [ ] **3.1** Generate the API reference from the code (Reference mode)
  - Document every public route/handler: method, path, params, request/response shape, errors; generate from source so it can't drift
  - Verify: each documented endpoint matches a live route in `src/api/`; examples are valid
- [ ] **3.2** Add inline docstrings to the public surface
  - Document exported functions/types with purpose, params, returns, and a one-line example
  - Verify: the doc tool reports no undocumented exports on the public surface

## Phase 4 — Architecture & decisions
- [ ] **4.1** Write the architecture overview (Explanation mode)
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
- Add Vale + link checks to CI so future docs can't silently rot.

## Acceptance criteria
1. Every command and path in the README runs exactly as written.
2. The API reference documents every public endpoint, generated from the code.
3. Every doc is classified into exactly one Diátaxis mode; the architecture overview matches `src/`.
4. Key gotchas live in `AGENTS.md`; decisions are recorded as ADRs; Vale + link checks pass in CI.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key doc decision or code fact it recorded) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (undocumented symbols, broken links, mis-classified pages); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
