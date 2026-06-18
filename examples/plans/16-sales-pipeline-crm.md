# Sales Pipeline Cleanup (CRM)

## Overview
Cleanse, normalize, and re-engage a CRM pipeline — deduplicate accounts, fix
data quality, re-score stale leads, and draft re-engagement outreach — one
segment at a time. Use this when the pipeline has decayed (dupes, stale deals,
missing fields) and forecasts can't be trusted.

## Architecture context (read first)
Replace the CRM export path and tooling with your own. Re-read every iteration.
- Pipeline export: `data/pipeline.csv` (exported from the CRM; never edit live records here).
- ICP / scoring rules: `docs/icp.md` (create if missing) — firmographics, disqualifiers.
- Cleaned output: `data/pipeline-clean.csv`; outreach drafts: `outreach/`.
- Never auto-send; the loop drafts and a human sends from the CRM.

## Phase 1: Export & data-quality audit
- [ ] **1.1** Export and profile the pipeline
  - Profile `data/pipeline.csv`: row count, fill rate per field, duplicate rate; record in `docs/pipeline-audit.md`
  - Flag required fields that are missing on money-stage deals
- [ ] **1.2** Define normalization rules
  - Standardize company/domain/region casing; define the "duplicate" key (e.g. normalized domain)
  - Verify: the rules in `docs/pipeline-audit.md` are unambiguous and testable against a sample

## Phase 2: Deduplicate & normalize
- [ ] **2.1** Deduplicate accounts and contacts
  - Merge on the duplicate key from 1.2; keep the richest record; log merges in `docs/pipeline-audit.md`
  - Verify: `data/pipeline-clean.csv` has one row per account; merge log explains each merge
- [ ] **2.2** Normalize and fill required fields
  - Apply casing/region rules; fill blanks from secondary fields or mark `[unknown]`
  - Verify: every deal in the money stages has all required fields populated or explicitly `[unknown]`

## Phase 3: Re-score & segment
- [ ] **3.1** Re-score every open deal against the ICP
  - Apply `docs/icp.md` to assign a score/tier (A/B/C) and a next-action; flag mis-stage deals
  - Verify: every open deal has a tier and a next-action; deals in the wrong stage are listed
- [ ] **3.2** Segment stale deals for re-engagement or close-lost
  - Deals with no activity in `<stale-days>` get a re-engage task or a close-lost recommendation
  - Verify: the stale segment is listed with a recommended action per deal

## Phase 4: Outreach & forecast
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
2. Every open deal is re-scored against the ICP with a tier and next-action.
3. Stale deals are segmented with a recommended action; outreach drafts are personalized.
4. A cleaned forecast reconciles to the data; sales has reviewed and approved.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the data-quality finding or scoring rule applied) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
