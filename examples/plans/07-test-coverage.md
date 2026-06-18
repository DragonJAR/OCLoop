# Raise Test Coverage

## Overview
Grow the test suite deliberately, one uncovered module at a time, until it reaches
a target coverage threshold. Use this when a codebase has grown faster than its
tests — before a refactor, a release, or onboarding — so there is a real safety
net. Each task picks one module, writes meaningful tests, and proves coverage moved.

## Architecture context (read first)
Replace the module paths, threshold, and command with your own. Re-read every iteration.
- Target: reach `<target>%` coverage on `src/`, up from the current baseline.
- Coverage tool: `<your-coverage-command>` (e.g. `bun test --coverage`, `pytest --cov`, `go test -cover`).
- Suite: run with `<your-test-command>`.
- Record progress in `docs/coverage-progress.md` (create `docs/` if missing).

## Phase 1: Baseline & targeting
- [ ] **1.1** Capture the coverage baseline
  - Run `<your-coverage-command>`; record per-file coverage in `docs/coverage-progress.md`
  - Rank modules from least to most covered; mark the hot paths (most changed, money, auth) as priority
- [ ] **1.2** Define what "covered" means for this project
  - Note the branch vs line threshold, and which files are intentionally excluded (e.g. `index.ts`, generated code)
  - Verify: the exclusion list is documented so the agent doesn't write tests for generated entry points

## Phase 2: Lowest-coverage modules
- [ ] **2.1** Test the least-covered, highest-risk module
  - Pick the priority module with the lowest coverage; write tests for its public API + edge cases
  - Verify: that module's coverage is now above `<target>%`; `<your-test-command>` is green
- [ ] **2.2** Test the next priority module
  - Repeat for the next module on the ranked list from 1.1
  - Verify: coverage rises; no existing test regressed
- [ ] **2.3** Test the remaining low-coverage modules
  - Cover the rest of the backlog below the threshold, one module per commit
  - Verify: every previously-below-threshold module is now above `<target>%`

## Phase 3: Branch & edge coverage
- [ ] **3.1** Close branch gaps in the most complex module
  - Target error paths, null/undefined branches, and early returns the line metric missed
  - Verify: branch coverage on that module reaches `<target>%`
- [ ] **3.2** Add tests for error and boundary conditions across the suite
  - Empty/huge/negative/unicode input, concurrent calls, permission failures
  - Verify: at least one regression-style test per condition; suite green

## Phase 4: Confirm & document
- [ ] **4.1** Confirm the overall threshold is met
  - Run `<your-coverage-command>` end-to-end; confirm `src/` is at or above `<target>%`
  - Verify: no module regressed below the threshold; the number is recorded in `docs/coverage-progress.md`
- [MANUAL] **4.2** Review test quality, not just the number
  - Skim for brittle/too-tight tests that assert implementation rather than behavior

## Testing Notes
- Run `<your-coverage-command>` after EVERY task to prove coverage actually moved.
- Write behavior tests over implementation tests: a refactor should not break your suite.
- If a module is genuinely untestable without a larger refactor, mark it `[BLOCKED: reason]` and note it for the refactor plan.

## Acceptance criteria
1. Overall coverage on `src/` is at or above `<target>%`, recorded in `docs/coverage-progress.md`.
2. Every previously-below-threshold module now meets the threshold.
3. The full suite is green; no test is skipped or marked `todo` just to hit the number.
4. Branch and error-path coverage was improved, not just line coverage.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the module covered and its coverage delta) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
