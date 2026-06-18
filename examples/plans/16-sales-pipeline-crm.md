# Sales Pipeline Cleanup (CRM)

## Overview
Cleanse, normalize, and re-engage a CRM pipeline — deduplicate accounts, fix data
quality, re-score stale leads against the ICP, and draft re-engagement outreach —
one segment at a time. Use this when the pipeline has decayed (dupes, stale deals,
missing fields) and forecasts can't be trusted.

**Methodology (how the pros do it):** (1) Standardize fields (emails, phones,
company names); (2) **deduplicate** contacts AND accounts by normalized
domain/email; (3) enrich missing firmographics; (4) **score against the ICP**
(industry, size, revenue, geo); (5) **qualify** open deals — **BANT** for
transactional, **MEDDIC/MEDDICC** for complex enterprise; (6) triage stale deals
(re-engage or close-lost); (7) forecast from clean, qualified data.

**Tools/standards named here:** **BANT** (Budget, Authority, Need, Timeline);
**MEDDIC/MEDDICC** (Metrics, Economic buyer, Decision criteria/process, Identify
pain, Champion, Competition); **ICP firmographic scoring**; dedup by
domain/email; enrichment (ZoomInfo, Clearbit, Apollo, Clay); Salesforce/HubSpot.

## Architecture context (read first)
Replace the CRM export path and tooling with your own. Re-read every iteration.
- Pipeline export: `data/pipeline.csv` (exported from the CRM; never edit live records here).
- ICP / scoring rules: `docs/icp.md` (create if missing) — firmographics, disqualifiers.
- Cleaned output: `data/pipeline-clean.csv`; outreach drafts: `outreach/`.
- Never auto-send; the loop drafts and a human sends from the CRM.

## Phase 1 — Export & data-quality audit
- [ ] **1.1** Export and profile the pipeline
  - Profile `data/pipeline.csv`: row count, fill rate per field, duplicate rate; record in `docs/pipeline-audit.md`; flag required fields missing on money-stage deals
- [ ] **1.2 (recon)** Define normalization rules and enumerate the segments
  - Standardize company/domain/region casing; define the "duplicate" key (normalized domain); list duplicate-account groups, stale deals (>N days), and open deals needing qualification
  - **Recursion:** for each discovered group/deal insert one `- [ ]` task below (e.g. `**1.2a** Merge duplicate group on domain "acme.com"`, `**1.2b** Re-engage stale deal #1234`)

## Phase 2 — Deduplicate & normalize
- [ ] **2.1** Deduplicate accounts and contacts
  - Merge on the duplicate key from 1.2; keep the richest record; log merges in `docs/pipeline-audit.md`
  - Verify: `data/pipeline-clean.csv` has one row per account; the merge log explains each merge
- [ ] **2.2** Normalize and enrich required fields
  - Apply casing/region rules; fill blanks from enrichment (firmographics) or mark `[unknown]`
  - Verify: every deal in the money stages has all required fields populated or explicitly `[unknown]`

## Phase 3 — Re-score & segment
- [ ] **3.1** Re-score every open deal against the ICP
  - Apply `docs/icp.md` to assign a score/tier (A/B/C) and a next-action; flag mis-staged deals
  - Verify: every open deal has a tier and a next-action; deals in the wrong stage are listed
- [ ] **3.2** Qualify and segment deals
  - Apply BANT (transactional) or MEDDICC (enterprise) to each open deal; segment stale deals (>N days no activity) for re-engage or close-lost
  - Verify: every open deal has a qualification status and a recommended next action

## Phase 4 — Outreach & forecast
- [ ] **4.1** Draft re-engagement outreach per segment
  - Write personalized first-touch drafts in `outreach/` per segment, referencing the deal context
  - Verify: each draft is specific (not template spam), under the length limit, and has a single CTA
- [ ] **4.2** Produce the cleaned forecast
  - Summarize weighted pipeline by tier and close month in `docs/pipeline-audit.md`
  - Verify: the forecast reconciles to `data/pipeline-clean.csv` (sums match)
- [MANUAL] **4.3** Sales review and import
  - Sales lead reviews merges/scores, imports the clean file, and approves outreach send

## Testing Notes
- Work only on the CSV export; never connect the loop to live CRM write APIs.
- Every transformation must be reproducible from the rules in `docs/pipeline-audit.md`.
- Outreach is drafted, never sent by the loop — a human sends from the CRM.

## Acceptance criteria
1. The pipeline is deduplicated and normalized (`data/pipeline-clean.csv`), with a merge log.
2. Every open deal is re-scored against the ICP and qualified (BANT/MEDDICC) with a next-action.
3. Stale deals are segmented with a recommended action; outreach drafts are personalized.
4. A cleaned forecast reconciles to the data; sales has reviewed and approved.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the data-quality finding or qualification decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (duplicate groups, stale deals, unqualified records); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
