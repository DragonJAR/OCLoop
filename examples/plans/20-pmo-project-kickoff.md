# PMO Project Kickoff & Setup

## Overview
Take a project from an approved idea to a fully kicked-off, governed engagement —
charter, scope, plan, risks, and governance docs — one artifact at a time. Use
this at the start of any project so the kickoff pack is complete and consistent,
and the team starts from a shared, documented baseline.

**Methodology (how the pros do it):** Follow **PMI / PMBOK** (7th Edition —
principle-based: 12 principles + 8 performance domains, on top of the legacy 5
process groups). Authorize with a **Project Charter** (objectives, constraints,
sponsor sign-off), define the **scope baseline** (Scope Statement + **WBS** +
WBS Dictionary, decomposed to work packages via the 8/80-hour rule), assign a
**RACI** (one Accountable per deliverable), build a **risk register** scored
**probability × impact** with response strategies (avoid/transfer/mitigate/accept),
and set governance/escalation paths before the kickoff meeting.

**Tools/standards named here:** **PMI / PMBOK Guide**; **Project Charter**;
**Scope Baseline** + **Work Breakdown Structure (WBS)**; **Requirements
Traceability Matrix**; **RACI matrix**; **Risk Register** (probability × impact);
**Stakeholder Register** (power/interest grid); governance/escalation matrix.

## Architecture context (read first)
Replace the project name, dates, and tooling with your own. Re-read every iteration.
- Project: `<project>`; sponsor: `<sponsor>`; target start/end: `<start>` / `<end>`.
- Artifacts live in `projects/<project>/` (charter, plan, risks, RACI, status template).
- PM standards and templates: `docs/pmo-standards.md` (create if missing).
- Task/issue tracker: `<tracker>` (Jira/Linear/Asana) — the loop drafts, a human creates records.

## Phase 1: Charter & scope
- [ ] **1.1** Draft the project charter
  - Write the problem, objectives, **measurable success criteria**, sponsor, and high-level scope in `projects/<project>/charter.md`
  - Verify: the charter names a measurable success criterion and explicit out-of-scope items
- [ ] **1.2 (recon)** Build the scope and WBS
  - Decompose deliverables into WBS work packages (8/80-hour rule) with acceptance criteria; list assumptions and constraints
  - **Recursion:** for each discovered work package insert one `- [ ]` task below to detail/estimate it (e.g. `**1.2a** Detail work package "Auth module"`); for each deliverable insert a RACI-assignment task
  - Verify: every deliverable has an acceptance criterion and an owner role; the WBS decomposes to work-package level

## Phase 2: Plan & resources
- [ ] **2.1** Build the schedule and identify the critical path
  - Sequence the work packages with estimates and dependencies to `<end>`; identify the critical path (CPM)
  - Verify: every milestone has a date and an owner; the critical path is documented
- [ ] **2.2** Define the RACI and team
  - Assign responsible/accountable/consulted/informed per workstream in `projects/<project>/raci.md`
  - Verify: every workstream has exactly one Accountable role; no orphan workstreams
- [ ] **2.3** Draft the resource and budget plan
  - Estimate effort/cost by workstream; identify constraints (roles, availability, budget cap)
  - Verify: the plan fits within `<budget>` and `<end>`; constraints are explicit

## Phase 3: Risks & governance
- [ ] **3.1 (recon)** Build the risk register
  - Brainstorm and identify risks; rate each **probability × impact**; assign a mitigation/response (avoid/transfer/mitigate/accept) and owner in `projects/<project>/risks.md`
  - **Recursion:** for each discovered high/medium risk insert one `- [ ]` task below to plan its response
  - Verify: the top 5 risks each have a concrete response and an owner
- [ ] **3.2** Define the governance and cadence
  - Meeting cadence, decision rights, escalation path, and reporting format in `projects/<project>/governance.md`
  - Verify: the escalation path names who decides at each level and the SLA to escalate
- [ ] **3.3** Create the status-report template
  - A repeatable weekly status template (RAG, progress, risks, decisions needed) in `projects/<project>/status-template.md`
  - Verify: the template covers schedule, risks, decisions, and next-week focus

## Phase 4: Kickoff & baseline
- [ ] **4.1** Assemble the kickoff pack
  - Compile charter + plan + RACI + risks + governance into `projects/<project>/kickoff.md`
  - Verify: the pack is internally consistent (scope, dates, owners align across artifacts)
- [ ] **4.2** Prepare the backlog and tracker import
  - Draft the initial milestone/work-package backlog ready to import into `<tracker>` (with a Requirements Traceability Matrix)
  - Verify: every work package from 2.1 has a tracker-ready item with an owner and estimate
- [MANUAL] **4.3** Kickoff meeting and baseline sign-off
  - Hold the kickoff; capture decisions; sponsor signs off the baseline scope, plan, and budget

## Testing Notes
- There is no code suite; "verify" means the artifact is complete, consistent across docs, and decision-ready.
- The loop drafts artifacts and the tracker import; a human creates live tracker records and runs the kickoff.
- Keep `docs/pmo-standards.md` as the single template source so every project kickoff is consistent.

## Acceptance criteria
1. A charter with measurable success criteria and explicit out-of-scope, signed by the sponsor.
2. A WBS with a dated critical path, a RACI with one Accountable per workstream, and a budget that fits.
3. A risk register with probability×impact scoring and responses for the top risks; a defined governance/escalation path.
4. A kickoff pack and tracker-ready backlog, baseline-signed by the sponsor.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key scope/plan/governance decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- **Self-expanding tasks:** a task marked `(recon)` discovers items (work packages, deliverables, risks, stakeholders); upon completion it inserts one new `- [ ]` task per item, immediately after its `[x]` line, so OCLoop executes each in a later iteration.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
