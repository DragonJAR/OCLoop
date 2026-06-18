# Account Reconciliation & Audit Prep

## Overview
Reconcile every balance-sheet account to independent support and assemble an
audit-ready evidence binder — one account (or account group) at a time. Use this
ahead of a year-end audit, or periodically, so reconciliations don't pile up and
every balance is provable.

## Architecture context (read first)
Replace the entity, period, and source paths with your own. Re-read every iteration.
- Entity: `<entity>`; period: `<YYYY>` or `<YYYY-MM>`.
- GL detail: `data/gl/`; bank/loan confirmations: `data/external/`; subledgers: `data/sub/`.
- Reconciliations: `recon/<account>.md`; audit binder index: `recon/INDEX.md`.
- Materiality and risk ratings: `docs/audit-risk.md` (create if missing).

## Phase 1: Scope & risk-rate
- [ ] **1.1** List every balance-sheet account
  - Enumerate all BS accounts from `data/gl/` with ending balances; record in `recon/INDEX.md`
  - Verify: the account list ties to the GL total; no account is missing
- [ ] **1.2** Risk-rate the accounts
  - Assign a risk rating (high/medium/low) by materiality, complexity, and audit history in `docs/audit-risk.md`
  - Verify: high-risk accounts (cash, debt, revenue-related) are flagged to reconcile first

## Phase 2: High-risk reconciliations
- [ ] **2.1** Reconcile cash and debt
  - Tie each cash and debt account to `data/external/` confirmations; list reconciling items and aging
  - Verify: adjusted balance = GL; items over `<aging-days>` are explained and flagged
- [ ] **2.2** Reconcile revenue/AR and the cutoff
  - Tie AR to the subledger and test revenue cutoff (services/goods delivered vs recognized)
  - Verify: AR subledger = GL control; cutoff test shows no period misclassification
- [ ] **2.3** Reconcile inventory (if applicable)
  - Tie inventory to a count or rollforward; reserve for slow-moving/obsolete items
  - Verify: inventory GL = physical/rollforward; reserve methodology is documented

## Phase 3: Remaining accounts & estimates
- [ ] **3.1** Reconcile prepaid, accrued, and deposit accounts
  - Support each balance with a schedule; clear stale items to the P&L
  - Verify: every balance has a support schedule; stale items are listed for write-off
- [ ] **3.2** Document significant estimates and reserves
  - For each estimate (allowance, warranty, bonus accrual), record the methodology and inputs
  - Verify: the methodology is reproducible from documented inputs; changes vs prior period are noted
- [ ] **3.3** Reconcile equity and intercompany
  - Tie equity rollforward (capital, retained earnings, distributions); agree intercompany between entities
  - Verify: equity rollforward foots; intercompany eliminates on consolidation

## Phase 4: Audit binder & sign-off
- [ ] **4.1** Assemble the audit binder index
  - Ensure `recon/INDEX.md` links each account to its recon, support, sign-off, and open items
  - Verify: every BS account has a recon; open items and risks are summarized at the top
- [ ] **4.2** Prepare the PBC (prepared-by-client) list
  - From the open items, build the auditor PBC request list with owners and due dates
  - Verify: every open item maps to a PBC row; nothing material is unassigned
- [MANUAL] **4.3** Controller/owner review and sign-off
  - Reviewer signs off each recon; unresolved items are escalated before the audit fieldwork

## Testing Notes
- "Verify" means the reconciliation ties: GL balance = independent support, with explained differences.
- Never alter the GL from the loop; the loop prepares reconciliations and flags adjustments for review.
- If an account won't reconcile or support is missing, mark it `[BLOCKED: reason]` and add it to the PBC list.

## Acceptance criteria
1. Every balance-sheet account has a reconciliation that ties to independent support.
2. High-risk accounts (cash, debt, AR cutoff, inventory) are reconciled with documented support.
3. Estimates and reserves are documented with reproducible methodologies.
4. An audit binder index and PBC list are produced; the controller has reviewed and signed off.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the reconciliation outcome or estimate methodology) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
