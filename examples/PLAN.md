# Example Plan — Code Review & Bug Hunt

## Overview
Hunt down logic and coding errors across an existing project, one area at a time.
This file demonstrates the PLAN.md format OCLoop expects: work grouped into
ordered phases, each actionable task on its own `- [ ]` line, executed one per
fresh iteration. Copy it, adapt the areas to your codebase, and run.

## Architecture context (read first)
Replace these paths with your own. The loop re-reads this section every iteration,
so keep it tight and accurate.
- `src/auth/` - authentication & authorization: login, sessions, middleware.
- `src/db/` - data access: queries, schemas, transactions.
- `src/api/` - request handlers / controllers / routes.
- `test/` - test suite, run with `<your-test-command>` (e.g. `bun test`, `npm test`).

## Phase 1: Audit & triage
- [ ] **1.1** Inventory error-prone areas and known issues
  - List every module that handles money, auth, external IO, or concurrency
  - Record the current test coverage gaps in `docs/review-coverage.md`
- [ ] **1.2** Run the full suite and capture the baseline
  - Record pass/fail counts and any flaky tests in `docs/review-coverage.md`
  - Verify: every existing test result is documented, flaky ones flagged

## Phase 2: Authentication & authorization
- [ ] **2.1** Review auth flows in `src/auth/`
  - Check token validation, expiry handling, and role checks
  - Look for: missing `await`, unvalidated redirect targets, timing leaks
- [ ] **2.2** Audit authorization guards
  - Confirm every protected route checks permissions, not just authentication
  - Verify: write a test proving an unauthorized user gets 403, not 200

## Phase 3: Data layer & state
- [ ] **3.1** Review queries and transactions in `src/db/`
  - Check for SQL/NoSQL injection, missing indexes hinted by slow queries, N+1 patterns
  - Confirm every write that should be transactional actually is
- [ ] **3.2** Check state mutations and race conditions
  - Look for shared mutable state, missing locks, off-by-one loops
  - Verify: add or fix a test covering the concurrency case found

## Phase 4: API surface & edge cases
- [ ] **4.1** Review input validation in `src/api/`
  - Confirm every handler validates and sanitizes input before use
  - Check error responses leak no stack traces or internal details
- [ ] **4.2** Probe boundary and edge cases
  - Empty input, huge input, unicode, negative numbers, concurrent duplicate requests
  - Verify: add a test for at least one edge case that currently misbehaves

## Phase 5: Regression guard
- [ ] **5.1** Consolidate fixes and confirm the full suite is green
  - Run `<your-test-command>` end-to-end; every fix from Phases 2-4 is covered
  - Verify: zero failing tests; any flaky test is either fixed or documented
- [MANUAL] **5.2** Final human review of the diff
  - Skim the full diff for anything the automated checks would miss (UX, naming, intent)

## Testing Notes
- Run the suite with `<your-test-command>` (e.g. `bun test` or `npm test`).
- After each fix, re-run the relevant test file, not just the whole suite.
- `[MANUAL]` tasks are verified by a human and excluded from the loop's completion count.

## Acceptance criteria
1. Every module handling auth, data, or external IO has been reviewed and its issues filed or fixed.
2. At least one regression test was added per real bug found in Phases 2-4.
3. The full test suite passes (`<your-test-command>`) with no new failures.
4. `docs/review-coverage.md` records what was reviewed, what was skipped, and known flaky tests.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh OpenCode session, then marks it `[x]` and continues.
- After marking a task `[x]`, the agent leaves a short indented note beneath it (a key finding or fix decision) as memory for the next iteration — written as prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain (every task `[x]` or `[BLOCKED]`, ignoring `[MANUAL]`); OCLoop detects this and appends a `<plan-complete> ... </plan-complete>` summary to the end of this file itself — the model does not need to write it.
