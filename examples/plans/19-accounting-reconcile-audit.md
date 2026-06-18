# Account Reconciliation & Audit Prep

## Overview
Reconcile every balance-sheet account to independent support and assemble an
audit-ready evidence binder — one account (or account group) at a time. Use this
ahead of a year-end audit, or periodically, so reconciliations don't pile up and
every balance is provable.

**Methodology (how the pros do it):** (1) Build a complete inventory of BS
accounts; (2) **risk-rate each account** by materiality × transaction volume ×
complexity → set cadence (**high-risk monthly, medium quarterly, low annual**);
(3) prepare recs to standard with prep/review (segregation of duties); (4) clear
reconciling items by aging; (5) assemble the **audit binder** and the **PBC
(Prepared-By-Client) list**. Evidence must be sufficient, competent, timely, and
attributable to the balance. Aligns with COSO/SOX 404 where BS recs are a key control.

**Tools/standards named here:** **Risk-based reconciliation** cadence
(materiality × volume × complexity); the **three-way tie** (subledger = GL control
= independent schedule); the **PBC list**; **audit binder**; rec platforms
(Trintech, BlackLine, FloQast); COSO internal control / SOX 404 expectations.

## Architecture context (read first)
Replace the entity, period, and source paths with your own. Re-read every iteration.
- Entity: `<entity>`; period: `<YYYY>` or `<YYYY-MM>`.
- GL detail: `data/gl/`; bank/loan confirmations: `data/external/`; subledgers: `data/sub/`.
- Reconciliations: `recon/<account>.md`; audit binder index: `recon/INDEX.md`.
- Materiality and risk ratings: `docs/audit-risk.md` (create if missing).

## Phase 1: Scope & risk-rate
- [ ] **1.1 (recon)** List every balance-sheet account and risk-rate it
  - Enumerate all BS accounts from `data/gl/` with ending balances; assign a risk rating (high/medium/low) by materiality, volume, and complexity → set the cadence (monthly/quarterly/annual); record in `recon/INDEX.md` and `docs/audit-risk.md`
  - **Recursion:** for each discovered account insert one `- [ ]` task below to reconcile it (e.g. `**1.1a** Reconcile 1010 Cash - Operating (high-risk, monthly)`)
  - Verify: the account list ties to the GL total; high-risk accounts (cash, debt, revenue-related) are flagged to reconcile first
- [ ] **1.2** Confirm the inventory is complete
  - Cross-check the account list against the GL and prior-period binders
  - Verify: no account is missing; the list foots to the GL total

## Phase 2: High-risk reconciliations
- [ ] **2.1** Reconcile cash and debt
  - Tie each cash and debt account to `data/external/` confirmations; list reconciling items and aging
  - Verify: adjusted balance = GL; items over `<aging-days>` are explained and flagged
- [ ] **2.2** Reconcile revenue/AR and the cutoff
  - Tie AR to the subledger (three-way tie) and test revenue cutoff (services/goods delivered vs recognized)
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
  - Tie the equity rollforward (capital, retained earnings, distributions); agree intercompany between entities
  - Verify: equity rollforward foots; intercompany eliminates on consolidation

## Phase 4: Audit binder & sign-off
- [ ] **4.1** Assemble the audit binder index
  - Ensure `recon/INDEX.md` links each account to its recon, support, sign-off, and open items; summarize open items and risks at the top
  - Verify: every BS account has a recon; the index is complete
- [ ] **4.2** Prepare the PBC (prepared-by-client) list
  - From the open items, build the auditor PBC request list with owners and due dates
  - Verify: every open item maps to a PBC row; nothing material is unassigned
- [MANUAL] **4.3** Controller/owner review and sign-off
  - Reviewer signs off each recon; unresolved items are escalated before the audit fieldwork

## Testing Notes
- "Verify" means the reconciliation ties: GL balance = independent support, with explained differences, and the three-way tie passes.
- Never alter the GL from the loop; the loop prepares reconciliations and flags adjustments for review.
- If an account won't reconcile or support is missing, mark it `[BLOCKED: reason]` and add it to the PBC list.

## Acceptance criteria
1. Every balance-sheet account is risk-rated and reconciled to independent support on its cadence.
2. High-risk accounts (cash, debt, AR cutoff, inventory) are reconciled with documented support.
3. Estimates and reserves are documented with reproducible methodologies.
4. An audit binder index and PBC list are produced; the controller has reviewed and signed off.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the reconciliation outcome or estimate methodology) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (accounts to reconcile, PBC rows); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
