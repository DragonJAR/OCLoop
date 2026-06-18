# New Project Scaffold

## Overview
Bootstrap a new project from zero to a working, tested, documented skeleton —
structure, config, CI, and a first vertical slice, one layer per task. Use this
at the start of a greenfield project so the first human commit is already a
runnable, linted, tested baseline.

**Methodology (how the pros do it):** Start with the **"boring" baseline** — the
non-negotiables from day one: VCS + branch protection, CI, linter/formatter, test
runner, a healthcheck endpoint, env-driven config. Apply the **Twelve-Factor App**
principles (config in environment, disposability, logs as streams, backing services
attached, stateless processes). Ship a **walking skeleton** first — one thin
end-to-end slice through every layer — then fatten slices. Lock in **one-command
bootstrap** so a fresh clone just works.

**Tools/standards named here:** **Twelve-Factor App** (12factor.net — 12 factors);
**Walking Skeleton** (Cockburn — one slice touching UI/backend/DB/deploy); official
CLIs (`npm create`, Spring Initializr, `cargo new`, `go mod init`, `cookiecutter`);
GitHub Actions/GitLab CI; Prettier+ESLint/Ruff+Black; Docker/compose; Nx/Turborepo.

## Architecture context (read first)
Replace the stack and names with your own. Re-read every iteration.
- Stack: `<runtime>` + `<framework>` (e.g. Bun + Hono, Node + Express, Python + FastAPI).
- Package manager: `<pm>` (e.g. `bun`, `npm`, `uv`, `cargo`).
- Test command: `<your-test-command>`; lint: `<your-lint-command>`.
- Layout: `src/` (code), `test/` (tests), `docs/` (documentation).

## Phase 1: Foundations
- [ ] **1.1** Initialize the project and tooling
  - `init` the project (`<pm> init`), set the language target/module type, add `.gitignore` (deps, build artifacts, env)
  - Verify: `<pm> install` runs clean; `git status` ignores the right files
- [ ] **1.2** Configure linting, formatting, and the test runner
  - Add the linter, formatter, and test runner configs; add a sample test that passes
  - Verify: `<your-lint-command>` and `<your-test-command>` both pass on the sample

## Phase 2: Structure & config
- [ ] **2.1** Create the source layout, entry point, and healthcheck
  - Scaffold `src/` with the framework entry (`src/index.ts` / `src/main.ts`), env config loader, and a health endpoint/route
  - Verify: the app boots and the healthcheck returns 200
- [ ] **2.2** Add Twelve-Factor configuration and environment handling
  - Load config from env with validation and sensible defaults (Factor III); provide a `.env.example`; logs as streams (Factor XI); disposability/graceful shutdown (Factor IX)
  - Verify: a test asserts required env vars are enforced; missing one fails fast with a clear message
- [ ] **2.3** Add structured logging and error handling
  - Set up a logger (levels, JSON in prod) and a central error handler that never leaks internals
  - Verify: a test triggers an error and asserts the response is generic while the log carries detail

## Phase 3: First vertical slice (walking skeleton)
- [ ] **3.1 (recon)** Inventory the Twelve-Factor compliance and the slice components
  - List each of the 12 factors and mark satisfied/unsatisfied; list the layers the slice must touch (model → service → route → test)
  - **Recursion:** for each unsatisfied factor insert one `- [ ]` task below to satisfy it
- [ ] **3.2** Implement one feature end-to-end with tests and validation
  - Build the smallest real feature through every layer as the pattern to copy; validate input at the boundary
  - Verify: an end-to-end test exercises the slice and returns the expected result; malformed input returns a clean 400

## Phase 4: Automation & docs
- [ ] **4.1** Add CI and pre-commit hooks
  - CI workflow: install, lint, test on every push; pre-commit runs lint/format on staged files
  - Verify: the CI workflow is valid YAML and runs the right commands; hooks fire on commit
- [ ] **4.2** Write the README and AGENTS.md
  - README: what it is, how to install/run/test (one-command bootstrap); AGENTS.md: project operations, architecture, research refs
  - Verify: a newcomer can clone, install, and run `<your-test-command>` using only the README
- [MANUAL] **4.3** Final review of the scaffold
  - Confirm the baseline is clean, the slice is representative, and the conventions are worth copying

## Testing Notes
- Run `<your-test-command>` after EVERY task. The baseline must stay green from the first commit.
- Every slice/feature task must add a test; a scaffold without tests teaches the wrong default.
- Dev/prod parity (Factor X): the same image/process should run locally and deployed.

## Acceptance criteria
1. `init` + install + lint + test all pass from a clean clone (one-command bootstrap).
2. The app boots with a working healthcheck and validated, Twelve-Factor env config.
3. One feature is implemented end-to-end (walking skeleton) with passing tests.
4. CI, pre-commit hooks, README, and AGENTS.md are in place.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key structure or config decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (unsatisfied factors, slice layers); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
