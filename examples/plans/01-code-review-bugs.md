# Code Review & Bug Hunt

## Overview
Systematically find and fix logic and coding errors in an existing project, one
module area at a time. Use this when a codebase has grown without review, before
a release, or after inheriting unfamiliar code.

## Architecture context (read first)
Replace these paths with your own. Re-read every iteration, so keep it accurate.
- `src/auth/` - authentication & authorization.
- `src/db/` - data access and persistence.
- `src/api/` - request handlers / routes / controllers.
- `test/` - test suite, run with `<your-test-command>`.

## Phase 1: Baseline & triage
- [ ] **1.1** Capture the current state
  - Run the full test suite; record pass/fail and flaky tests in `docs/review-baseline.md`
  - List modules handling money, auth, external IO, or concurrency
- [ ] **1.2** Triage known issues
  - Review the issue tracker and recent bug reports; group by area
  - Verify: every reported bug is mapped to a Phase 2-4 task or documented as wontfix

## Phase 2: Authentication & authorization
- [ ] **2.1** Review session and token handling in `src/auth/`
  - Check expiry, refresh, revocation, and secure storage
  - Look for: unvalidated redirect targets, missing `await`, timing leaks
- [ ] **2.2** Audit authorization guards across routes
  - Confirm each protected route checks permissions, not just authentication
  - Verify: add a test proving an unauthorized user receives 403, not 200

## Phase 3: Data layer
- [ ] **3.1** Review queries and transactions in `src/db/`
  - Check for injection, missing transactions on multi-step writes, N+1 patterns
  - Verify: add a test for one query that lacked input validation
- [ ] **3.2** Check schema and migration integrity
  - Look for missing constraints, nullable fields that shouldn't be, orphaned rows
  - Verify: migrations run cleanly on a fresh database

## Phase 4: API surface & edge cases
- [ ] **4.1** Review input validation in `src/api/`
  - Confirm every handler validates and sanitizes before use; errors leak no internals
  - Verify: probe one handler with malformed input and confirm a clean 400
- [ ] **4.2** Probe boundary cases
  - Empty/huge/negative/unicode input, concurrent duplicate requests, deep nesting
  - Verify: add a regression test for one edge case that currently misbehaves

## Phase 5: Regression guard
- [ ] **5.1** Confirm the full suite is green
  - Run `<your-test-command>` end-to-end; every Phase 2-4 fix has a covering test
  - Verify: zero failing tests; flaky tests either fixed or documented in `docs/review-baseline.md`
- [MANUAL] **5.2** Final human review of the full diff
  - Skim for UX, naming, and intent issues automated checks would miss

## Testing Notes
- Run the suite with `<your-test-command>` (e.g. `bun test`, `npm test`, `pytest`).
- After each fix, re-run the affected test file, not just the whole suite.

## Acceptance criteria
1. Every module handling auth, data, or external IO has been reviewed and its issues fixed or filed.
2. At least one regression test was added per real bug found in Phases 2-4.
3. The full suite passes with no new failures; flaky tests are documented.
4. `docs/review-baseline.md` records what was reviewed, skipped, and known-flaky.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (key finding or fix decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
