# Sales Proposal / RFP Response

## Overview
Produce a complete, tailored proposal or RFP response — one section at a time —
reusing approved boilerplate and customizing it to the prospect's requirements,
with a compliance matrix that proves every requirement is addressed. Use this
when responses are large, repetitive, and error-prone to assemble by hand.

## Architecture context (read first)
Replace the prospect and source material with your own. Re-read every iteration.
- RFP / prospect brief: `docs/rfp-<prospect>.md` (the questions/requirements to answer).
- Approved boilerplate library: `proposals/library/` (security, compliance, case studies — pre-approved text).
- Output: `proposals/<prospect>/proposal.md` and `proposals/<prospect>/compliance-matrix.md`.
- Pricing/approvals must come from a human; the loop never invents numbers or commitments.

## Phase 1: Parse requirements & plan
- [ ] **1.1** Extract the requirement list
  - Read `docs/rfp-<prospect>.md`; enumerate every explicit requirement/question in the compliance matrix
  - Verify: the matrix has a row per requirement with a status (addressed / needs-custom / missing)
- [ ] **1.2** Map requirements to boilerplate and gaps
  - For each requirement, find the matching library section or flag it for custom drafting
  - Verify: every row points to a source (library file or a `needs-custom` task below)

## Phase 2: Executive summary & approach
- [ ] **2.1** Draft the executive summary
  - Write the tailored summary: prospect pain, proposed value, why us — grounded in the brief
  - Verify: the summary references the prospect's stated goals and avoids unapproved claims
- [ ] **2.2** Draft the proposed solution and approach
  - Describe the solution, scope, methodology, and timeline at a high level
  - Verify: every scope item maps to a requirement; out-of-scope items are listed explicitly

## Phase 3: Fill the body sections
- [ ] **3.1** Draft the custom sections
  - Write each `needs-custom` section from 1.2, pulling facts from the brief and library
  - Verify: each section answers its requirement and is marked `addressed` in the matrix
- [ ] **3.2** Insert and localize the boilerplate sections
  - Pull the approved library sections, customizing only the prospect-specific hooks
  - Verify: boilerplate is unmodified except for the allowed placeholders (no silent legal/commercial edits)
- [ ] **3.3** Assemble the case studies and proof
  - Select 2-3 relevant case studies from the library and tailor the relevance to the prospect
  - Verify: each case study maps to a prospect pain point in the brief

## Phase 4: Compliance, pricing, review
- [ ] **4.1** Complete the compliance matrix
  - Confirm every requirement row is `addressed` with a proposal section reference
  - Verify: zero rows are `missing` or `needs-custom`; the matrix is internally consistent
- [MANUAL] **4.2** Pricing, legal, and final approvals
  - Human sets pricing, signs off on commercial/legal terms, and approves the final document
- [MANUAL] **4.3** Final read-through and submission
  - Human does a full read for tone, consistency, and submission readiness

## Testing Notes
- There is no code suite; "verify" means the section meets its requirement and the matrix stays accurate.
- Never invent pricing, SLAs, or legal commitments — flag those as `[MANUAL]` for human entry.
- Re-read the brief each iteration so every section stays grounded in the prospect's actual requirements.

## Acceptance criteria
1. Every requirement from the brief has a row in the compliance matrix, all `addressed`.
2. An executive summary and approach are drafted, grounded in the prospect's goals.
3. Custom sections are written; boilerplate is reused unmodified except approved placeholders.
4. Pricing, legal, and final submission are human-approved.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the requirement-to-section mapping or customization chosen) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
