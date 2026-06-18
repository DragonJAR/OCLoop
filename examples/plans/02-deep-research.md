# Deep Research on a Topic

## Overview
Investigate a technical topic thoroughly and produce a documented, validated
decision — where each step builds on the findings of the last, and the inter-task
memory notes carry those findings forward. Use this to evaluate a technology
choice, write a technical design doc, or run a spike investigation.

**Methodology (how the pros do it):** Frame the spike as a single *question* that
unblocks a *decision* (a spike with no decision is a failure), set a hard timebox,
then build the smallest experiment that falsifies the leading hypothesis. Output
is an **Architecture Decision Record (ADR)** using the **Nygard template**
(Context → Decision → Status → Consequences + alternatives considered). Keep the
code disposable: a **spike** answers "can we?", a **PoC** proves feasibility, a
**prototype** explores design — all distinct from production code.

**Tools/standards named here:** ADR (Michael Nygard, *Documenting Architecture
Decisions*); MADR / Y-Statement variants; `adr-tools` / `log4brains` for in-repo
ADR versioning in `doc/adr/`; the XP/SAFe "spike" enabler pattern.

## Architecture context (read first)
- Output goes to `docs/<topic>.md` (the synthesis) and `doc/adr/NNNN-<topic>.md` (the decision record). Create both dirs if missing.
- Each task appends findings to the synthesis and leaves a short note under its `[x]`.
- Replace `<topic>` below with your actual subject (e.g. `auth-strategy`, `orm-evaluation`).

## Phase 1: Frame the question
- [ ] **1.1 (recon)** Define scope, the decision, and the candidate options
  - Write the specific question, what "decided" looks like, and the constraints (budget, team skills, existing deps, deadlines) in `docs/<topic>.md`
  - **Recursion:** list every viable option/approach; for each discovered option insert one `- [ ]` task below to investigate it in depth (e.g. `**1.1a** Evaluate <option A>`)
- [ ] **1.2** Inventory existing context
  - Record what the project already assumes or depends on regarding `<topic>`; note the 3-5 sub-questions that must be answered to decide

## Phase 2: Gather evidence
- [ ] **2.1** Investigate the top 2-3 options in depth
  - For each: read official docs and recent changelogs, capture maturity/licensing/key risks, and record at least one concrete code/config example in `docs/<topic>.md`
  - Verify: each option has a worked example and a documented failure mode
- [ ] **2.2** Find real-world usage and benchmarks
  - Search for production postmortems, benchmarks, and migration reports; append links and a one-line summary of each source

## Phase 3: Validate
- [ ] **3.1** Build a minimal proof of concept for the leading option
  - Implement the smallest end-to-end slice that exercises the riskiest assumption; keep the code disposable
  - Verify: the PoC runs and demonstrates the key capability (or fails — document exactly why)
- [ ] **3.2** Stress-test the runner-up assumption
  - Confirm the leading option's main weakness is tolerable; check the runner-up's strength on that axis
  - Record the verdict and reasoning in `docs/<topic>.md`

## Phase 4: Synthesize & decide
- [ ] **4.1** Write the ADR and the recommendation
  - In `doc/adr/NNNN-<topic>.md`: Context, Decision, Status (Accepted/Rejected), Consequences, and alternatives rejected; in `docs/<topic>.md`: migration steps and a rollback path
  - Verify: the decision answers the framed question with cited evidence (benchmark, working PoC, or load-test result)
- [ ] **4.2** Capture open questions and follow-ups
  - List anything that remains uncertain or needs a future decision
- [MANUAL] **4.3** Stakeholder review of the recommendation
  - Present the ADR; record feedback and the final GO/NO-GO sign-off

## Testing Notes
- There is no code test suite for research; "verify" means the artifact exists, is coherent, and cites its sources.
- Honor the timebox: if the question isn't answerable in one sprint, it was too big — split it.
- After each task, confirm `docs/<topic>.md` is internally consistent and cites its sources.

## Acceptance criteria
1. `docs/<topic>.md` answers the framed question with evidence and a clear recommendation.
2. The leading option has a working proof of concept (or a documented failure).
3. A committed ADR records Context/Decision/Status/Consequences with alternatives considered.
4. Open questions and a rollback path are explicitly listed.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key finding or decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (options, unknowns); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
