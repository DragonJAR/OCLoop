# Raise Test Coverage

## Overview
Grow the test suite deliberately, one uncovered module at a time, until it reaches
a target coverage threshold — and prove the tests are *meaningful*, not just
numerical. Use this before a refactor, a release, or onboarding, so there is a
real safety net.

**Methodology (how the pros do it):** Treat line/branch coverage as a **lagging
indicator** — a floor that guards against regressions, never a quality target.
Write **behavior tests** (assert on observable outcomes, not internals) so they
survive refactors. Then validate *meaningful* coverage with **mutation testing**:
inject faults into the code and measure how many the tests catch. The gap between
coverage% and the **mutation score** is the real "oracle gap" — surviving mutants
are concrete, bounded test gaps.

**Tools/standards named here:** Line/branch coverage via **Istanbul/c8** (JS),
**coverage.py** (Python), **JaCoCo** (JVM); mutation testing with **Stryker**
(JS/TS/.NET), **PIT** (Java), **Infection** (PHP); a **coverage gate in CI** (fail
if below threshold, or ratchet so a PR can't *decrease* coverage); the Test
Pyramid / Testing Trophy (Kent C. Dodds) as the strategy frame.

## Architecture context (read first)
Replace the module paths, threshold, and command with your own. Re-read every iteration.
- Target: reach `<target>%` coverage on `src/`, up from the current baseline.
- Coverage tool: `<your-coverage-command>` (e.g. `bun test --coverage`, `pytest --cov`, `go test -cover`).
- Mutation tool (optional but recommended): `stryker` / `mutmut` / `infection`.
- Suite: run with `<your-test-command>`.
- Record progress in `docs/coverage-progress.md` (create `docs/` if missing).

## Phase 1 — Baseline & targeting
- [ ] **1.1 (recon)** Capture the coverage baseline and find the gaps
  - Run `<your-coverage-command>`; rank modules least→most covered, marking hot paths (money, auth, high churn) as priority; record per-file coverage in `docs/coverage-progress.md`
  - **Recursion:** for each discovered below-threshold module, insert one `- [ ]` task below to raise its coverage (e.g. `**1.1a** Cover src/services/payments.ts`)
- [ ] **1.2** Define what "covered" means and run a mutation baseline
  - Note the branch vs line threshold and the intentionally-excluded files (entry points, generated code); if available, run the mutation tool to list surviving mutants
  - Verify: the exclusion list is documented; surviving mutants on hot paths are recorded as targets

## Phase 2 — Lowest-coverage modules
- [ ] **2.1** Test the least-covered, highest-risk module
  - Write behavior tests for its public API + edge cases (not internal collaborators)
  - Verify: that module's coverage is now above `<target>%`; the mutation tool kills its mutants; `<your-test-command>` is green
- [ ] **2.2** Test the next priority module
  - Repeat for the next module on the ranked list from 1.1
  - Verify: coverage rises; no existing test regressed
- [ ] **2.3** Test the remaining low-coverage modules
  - Cover the rest of the backlog below the threshold, one module per commit
  - Verify: every previously-below-threshold module is now above `<target>%`

## Phase 3 — Branch & mutation gaps
- [ ] **3.1** Close branch gaps in the most complex module
  - Target error paths, null/undefined branches, and early returns the line metric missed
  - Verify: branch coverage on that module reaches `<target>%`
- [ ] **3.2** Kill surviving mutants on the hot paths
  - For each surviving mutant the mutation tool reported on a hot path, add/strengthen the test that catches it
  - Verify: the mutation score on the targeted modules rises above the threshold; suite green

## Phase 4 — Confirm & document
- [ ] **4.1** Confirm the overall threshold is met
  - Run `<your-coverage-command>` end-to-end; confirm `src/` is at or above `<target>%`
  - Verify: no module regressed below the threshold; the number and the mutation score are recorded in `docs/coverage-progress.md`
- [MANUAL] **4.2** Review test quality, not just the number
  - Skim for brittle/too-tight tests that assert implementation rather than behavior

## Testing Notes
- Run `<your-coverage-command>` after EVERY task to prove coverage actually moved.
- Write behavior tests over implementation tests: a refactor should not break your suite.
- If a module is genuinely untestable without a larger refactor, mark it `[BLOCKED: reason]` and note it for the refactor plan.

## Acceptance criteria
1. Overall coverage on `src/` is at or above `<target>%`, recorded in `docs/coverage-progress.md`.
2. Every previously-below-threshold module now meets the threshold.
3. The mutation score on hot-path modules meets the target (tests are meaningful, not just numerous).
4. The full suite is green; no test is skipped or marked `todo` just to hit the number.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the module covered, its coverage delta, and mutants killed) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (below-threshold modules, surviving mutants); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
