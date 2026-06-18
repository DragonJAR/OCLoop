# Deep Research on a Topic

## Overview
Investigate a technical topic thoroughly and produce a documented, validated
synthesis. Use this to evaluate a technology choice, write a technical design
doc, or run a spike investigation — where each step builds on the findings of the
last, and the inter-task memory notes carry those findings forward.

## Architecture context (read first)
- Output goes to `docs/<topic>.md` (create `docs/` if missing). One living document.
- Each task appends its findings to that doc and leaves a short note under its `[x]`
  capturing the key decision or surprising result for the next iteration.
- Replace `<topic>` below with your actual subject (e.g. `auth-strategy`, `orm-evaluation`).

## Phase 1: Frame the question
- [ ] **1.1** Define scope and success criteria
  - Write the specific question to answer and what "decided" looks like in `docs/<topic>.md`
  - List the 3-5 sub-questions that must be answered to decide
- [ ] **1.2** Inventory existing context
  - Record what the project already assumes or depends on regarding `<topic>`
  - Note constraints: budget, team skills, existing dependencies, deadlines

## Phase 2: Gather evidence
- [ ] **2.1** Survey the primary options/approaches
  - For each viable approach, capture: how it works, maturity, licensing, key risks
  - Append a comparison table to `docs/<topic>.md`
- [ ] **2.2** Investigate the top 2-3 options in depth
  - Read official docs, recent changelogs, and known failure modes
  - Record at least one concrete code/config example per option in `docs/<topic>.md`
- [ ] **2.3** Find real-world usage and benchmarks
  - Search for production postmortems, benchmarks, and migration reports
  - Append links and a one-line summary of each source

## Phase 3: Validate
- [ ] **3.1** Build a minimal proof of concept for the leading option
  - Implement the smallest end-to-end slice that exercises the riskiest assumption
  - Verify: the PoC runs and demonstrates the key capability (or fails — document why)
- [ ] **3.2** Stress-test the runner-up assumption
  - Confirm the leading option's main weakness is tolerable; check the runner-up's strength
  - Record the verdict and reasoning in `docs/<topic>.md`

## Phase 4: Synthesize & decide
- [ ] **4.1** Write the recommendation
  - State the decision, the alternatives rejected, and the reasoning in `docs/<topic>.md`
  - Include migration steps and a rollback path
- [ ] **4.2** Capture open questions and follow-ups
  - List anything that remains uncertain or needs a future decision
- [MANUAL] **4.3** Stakeholder review of the recommendation
  - Present `docs/<topic>.md`; record feedback and the final sign-off

## Testing Notes
- There is no code test suite for research; "verify" means the artifact exists and is coherent.
- After each task, confirm `docs/<topic>.md` is internally consistent and cites its sources.

## Acceptance criteria
1. `docs/<topic>.md` answers the framed question with evidence and a clear recommendation.
2. The leading option has a working proof of concept (or a documented failure).
3. Alternatives are compared on the same axes and their rejection is justified.
4. Open questions and a rollback path are explicitly listed.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key finding or decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
