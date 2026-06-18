# Monthly Accounting Close

## Overview
Run the month-end close checklist — one workpaper at a time — from pre-close
preparation through reconciliations, accruals, and the final close package. Use
this to make a repetitive, multi-step close systematic and auditable. The loop
prepares and checks each workpaper; a human reviews and posts to the GL.

**Methodology (how the pros do it):** Follow the **fast-close / continuous
accounting** model — pull work forward (recurring accruals, prepaid amortization,
subledger verification done *before* period-end) so 60-80% of the close is done by
day 0. The core control is the **three-way tie**: subledger total = GL control
account = independent supporting schedule. Maintain a **close checklist** (task,
owner, dependency, due-day, prep/review segregation of duties) and produce a
standard **close package** with variance analysis. Target 3-5 close days.

**Tools/standards named here:** **Fast-close / continuous accounting** maturity
model; the **close checklist**; **three-way tie** (subledger = GL control =
independent schedule); accrual reversal/rebooking; close-automation platforms
(BlackLine, Trintech, FloQast, Numeric) integrated to ERPs (NetSuite, SAP,
Oracle).

## Architecture context (read first)
Replace the entity, period, and source paths with your own. Re-read every iteration.
- Entity: `<entity>`; closing period: `<YYYY-MM>`.
- Source data: trial balance `data/tb-<YYYY-MM>.csv`, bank statements `data/bank/`, subledgers `data/sub/`.
- Output workpapers: `close/<YYYY-MM>/`; close package: `close/<YYYY-MM>/close-package.md`.
- Chart of accounts and close checklist: `docs/coa.md` and `docs/close-checklist.md`.

## Phase 1 — Pre-close preparation
- [ ] **1.1** Lock the period and capture the trial balance
  - Confirm all expected source files are present; import `data/tb-<YYYY-MM>.csv`; record totals in the close package
  - Verify: TB debits = credits; every expected source file is present or flagged missing
- [ ] **1.2 (recon)** Review the close checklist and enumerate the workpapers
  - Walk `docs/close-checklist.md`; note recurring JEs, accruals, and last month's open items; list every BS account, subledger, and accrual category to process
  - **Recursion:** for each discovered account/subledger/category insert one `- [ ]` task below (e.g. `**1.2a** Reconcile account 1010 Cash - Operating`, `**1.2b** Three-way tie for AR subledger`)

## Phase 2 — Reconciliations
- [ ] **2.1** Reconcile the cash accounts
  - Match each bank account in `data/bank/` to the GL; list and explain every reconciling item
  - Verify: adjusted bank = GL cash per account; unreconciled differences are explained, not hidden
- [ ] **2.2** Reconcile credit cards and intercompany
  - Reconcile cards and intercompany accounts; clear suspense entries
  - Verify: suspense is zero; intercompany balances agree between entities
- [ ] **2.3** Three-way tie AR and AP subledgers to the GL
  - Tie AR/AP aging in `data/sub/` to the control accounts; investigate variances (subledger = GL control = independent schedule)
  - Verify: subledger total = GL control account; variances are listed with a cause

## Phase 3 — Accruals, prepaids & adjustments
- [ ] **3.1** Post period accruals and deferrals
  - Compute and draft the JEs for accrued expenses, deferred revenue, and prepaid amortization
  - Verify: each draft JE references its support and a recomputation that ties to the source
- [ ] **3.2** Review fixed-asset depreciation and amortization
  - Run the depreciation schedule; draft the period JE; check for disposals/additions
  - Verify: the JE ties to the fixed-asset register rollforward
- [ ] **3.3** Draft other period adjustments
  - Draft any remaining adjustments (reserve true-ups, FX revaluation) with support
  - Verify: every adjustment has a reviewer-ready support file

## Phase 4 — Close package & review
- [ ] **4.1** Produce the close package and variance analysis
  - Assemble `close/<YYYY-MM>/close-package.md`: P&L vs budget/prior, variance explanations, metrics
  - Verify: every material variance has a written explanation tied to a workpaper
- [MANUAL] **4.2** Controller review and posting
  - Controller reviews the package, approves JEs, and posts the final close to the GL
- [MANUAL] **4.3** Sign-off and lock
  - Final sign-off; lock the period against further changes

## Testing Notes
- The loop never posts to the GL; it prepares workpapers and draft JEs for human review/posting.
- "Verify" means the workpaper ties out: control accounts reconcile, debits = credits, the three-way tie passes, variances explained.
- If a source file is missing or a reconciliation won't tie, mark it `[BLOCKED: reason]` with the owner.

## Acceptance criteria
1. The trial balance is captured and balanced; the close checklist is fully walked.
2. Cash, cards, intercompany, AR, and AP reconcile to the GL (three-way tie) with explained variances.
3. All period accruals, depreciation, and adjustments are drafted with support.
4. A close package with variance analysis is produced; the controller reviews, posts, and locks.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key reconciliation finding or JE decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (accounts, subledgers, accrual categories); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
