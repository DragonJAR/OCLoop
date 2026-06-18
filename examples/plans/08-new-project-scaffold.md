# New Project Scaffold

## Overview
Bootstrap a new project from zero to a working, tested, documented skeleton —
structure, config, CI, and a first vertical slice, one layer per task. Use this
at the start of a greenfield project so the first human commit is already a
runnable, linted, tested baseline rather than a folder of loose files.

## Architecture context (read first)
Replace the stack and names with your own. Re-read every iteration.
- Stack: `<runtime>` + `<framework>` (e.g. Bun + Hono, Node + Express, Python + FastAPI).
- Package manager: `<pm>` (e.g. `bun`, `npm`, `uv`, `cargo`).
- Test command: `<your-test-command>`; lint: `<your-lint-command>`.
- Layout: `src/` (code), `test/` (tests), `docs/` (documentation).

## Phase 1: Foundations
- [ ] **1.1** Initialize the project and tooling
  - `init` the project (`<pm> init`), set the language target/module type, add `.gitignore` (node_modules, build artifacts, env)
  - Verify: `<pm> install` runs clean; `git status` ignores the right files
- [ ] **1.2** Configure linting, formatting, and the test runner
  - Add the linter, formatter, and test runner configs; add a sample test that passes
  - Verify: `<your-lint-command>` and `<your-test-command>` both pass on the sample

## Phase 2: Structure & config
- [ ] **2.1** Create the source layout and entry point
  - Scaffold `src/` with the framework entry (`src/index.ts` / `src/main.ts`), env config loader, and a health endpoint/route
  - Verify: the app boots and the health endpoint returns 200
- [ ] **2.2** Add configuration and environment handling
  - Load config from env with validation and sensible defaults; provide a `.env.example`
  - Verify: a test asserts required env vars are enforced; missing one fails fast with a clear message
- [ ] **2.3** Add structured logging and error handling
  - Set up a logger (levels, JSON in prod) and a central error handler that never leaks internals
  - Verify: a test triggers an error and asserts the response is generic while the log carries detail

## Phase 3: First vertical slice
- [ ] **3.1** Implement one feature end-to-end
  - Build the smallest real feature (model → service → route/handler) as the pattern to copy
  - Verify: an end-to-end test exercises the slice and returns the expected result
- [ ] **3.2** Cover the slice with tests and validation
  - Add happy-path + error-case tests; validate input at the boundary
  - Verify: `<your-test-command>` is green; malformed input returns a clean 400

## Phase 4: Automation & docs
- [ ] **4.1** Add CI and pre-commit hooks
  - CI workflow: install, lint, test on every push; pre-commit runs lint/format on staged files
  - Verify: the CI workflow is valid YAML and runs the right commands; hooks fire on commit
- [ ] **4.2** Write the README and AGENTS.md
  - README: what it is, how to install/run/test; AGENTS.md: project operations, architecture, research refs
  - Verify: a newcomer can clone, install, and run `<your-test-command>` using only the README
- [MANUAL] **4.3** Final review of the scaffold
  - Confirm the baseline is clean, the slice is representative, and the conventions are worth copying

## Testing Notes
- Run `<your-test-command>` after EVERY task. The baseline must stay green from the first commit.
- Every slice/feature task must add a test; a scaffold without tests teaches the wrong default.

## Acceptance criteria
1. `init` + install + lint + test all pass from a clean clone.
2. The app boots with a working health endpoint and validated env config.
3. One feature is implemented end-to-end (model → service → handler) with passing tests.
4. CI, pre-commit hooks, README, and AGENTS.md are in place.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key structure or config decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
