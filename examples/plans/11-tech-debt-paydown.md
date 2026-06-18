# Technical Debt Paydown

## Overview
Work through a backlog of known technical debt — `TODO`/`FIXME`/`HACK` markers,
deprecated APIs, and shaky workarounds — one item at a time, keeping the suite
green between each. Use this when debt has accumulated faster than it was repaid
and is starting to slow down feature work.

## Architecture context (read first)
Replace the debt source and command with your own. Re-read every iteration.
- Debt markers: `TODO`, `FIXME`, `HACK`, `@deprecated`, `XXX` scattered across `src/`.
- Issue tracker: link or path to known-debt issues.
- `test/` - the safety net; run with `<your-test-command>`. Must stay green throughout.
- Record what was paid down in `docs/debt-paydown.md` (create `docs/` if missing).

## Phase 1: Inventory & prioritize
- [ ] **1.1** Collect every debt marker
  - Grep for `TODO|FIXME|HACK|XXX|@deprecated` across `src/`; record each (file, line, text) in `docs/debt-paydown.md`
  - Pull the matching issues from the tracker and cross-reference
- [ ] **1.2** Rank by risk and blast radius
  - Prioritize: debt on money/auth/data paths, debt blocking feature work, then the rest
  - Verify: the ranked list in `docs/debt-paydown.md` justifies each priority with a one-line reason

## Phase 2: High-risk debt (money / auth / data)
- [ ] **2.1** Resolve the highest-risk item
  - Address the top item from 1.2 properly (not another workaround); add or update its test
  - Verify: the marker is gone; `<your-test-command>` is green
- [ ] **2.2** Resolve the next high-risk item
  - Repeat for the next priority item; remove the marker and any now-dead workaround code
  - Verify: tests green; grep confirms no lingering references to the old workaround

## Phase 3: Feature-blocking & cleanup debt
- [ ] **3.1** Resolve the items blocking feature work
  - Clear the debt that other tasks/issues are waiting on; update the dependents
  - Verify: the blocked issue can now proceed; tests green
- [ ] **3.2** Sweep the deprecated API usage
  - Replace every `@deprecated` call site with the supported equivalent
  - Verify: build/run shows no new deprecation warnings; tests green
- [ ] **3.3** Remove dead code and stale workarounds
  - Delete unreachable code and workarounds whose condition no longer applies; update imports
  - Verify: build + tests green; grep confirms no orphaned references remain

## Phase 4: Confirm & prevent recurrence
- [ ] **4.1** Confirm the debt count dropped and the suite is green
  - Re-grep; confirm the marker count is down by the items addressed; run the full suite
  - Verify: record the before/after counts in `docs/debt-paydown.md`; zero failing tests
- [ ] **4.2** Add guards against regression
  - Where a debt recurred before, add a lint rule, test, or CI check that catches it
  - Verify: the guard fails on the old pattern and passes on the fix
- [MANUAL] **4.3** Review remaining debt and re-rank
  - Confirm what's left is genuinely low-priority or needs a larger effort (file a plan)

## Testing Notes
- Run `<your-test-command>` after EVERY task. Paying down debt must never break a green suite.
- A debt item is "resolved" only when the marker is removed AND the underlying issue is fixed — not just edited to say "done".
- If an item needs a bigger change than one task (e.g. a rewrite), mark it `[BLOCKED: reason]` and link the follow-up.

## Acceptance criteria
1. Every high-risk (money/auth/data) debt item from the inventory is resolved or blocked with a follow-up.
2. Deprecated API usage is eliminated; no new deprecation warnings remain.
3. The marker count dropped measurably (before/after in `docs/debt-paydown.md`); the suite is green.
4. Guards exist for any debt that previously recurred.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the debt item resolved and why the fix is correct) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
