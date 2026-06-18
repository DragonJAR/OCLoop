# PMO Project Kickoff & Setup

## Overview
Take a project from an approved idea to a fully kicked-off, governed engagement —
charter, scope, plan, risks, and governance docs — one artifact at a time. Use
this at the start of any project so the kickoff pack is complete and consistent,
and the team starts from a shared, documented baseline.

## Architecture context (read first)
Replace the project name, dates, and tooling with your own. Re-read every iteration.
- Project: `<project>`; sponsor: `<sponsor>`; target start/end: `<start>` / `<end>`.
- Artifacts live in `projects/<project>/` (charter, plan, risks, RACI, status template).
- PM standards and templates: `docs/pmo-standards.md` (create if missing).
- Task/issue tracker: `<tracker>` (Jira/Linear/Asana) — the loop drafts, a human creates records.

## Phase 1: Charter & scope
- [ ] **1.1** Draft the project charter
  - Write the problem, objectives, success criteria, sponsor, and high-level scope in `projects/<project>/charter.md`
  - Verify: the charter names a measurable success criterion and explicit out-of-scope items
- [ ] **1.2** Build the scope and deliverables breakdown
  - Decompose into deliverables and acceptance criteria; list assumptions and constraints
  - Verify: every deliverable has an acceptance criterion and an owner role

## Phase 2: Plan & resources
- [ ] **2.1** Build the work breakdown and schedule
  - Break deliverables into work packages with estimates, dependencies, and milestones to `<end>`
  - Verify: the critical path is identified; every milestone has a date and an owner
- [ ] **2.2** Define the RACI and team
  - Assign responsible/accountable/consulted/informed per workstream in `projects/<project>/raci.md`
  - Verify: every workstream has exactly one Accountable role; no orphan workstreams
- [ ] **2.3** Draft the resource and budget plan
  - Estimate effort/cost by workstream; identify constraints (roles, availability, budget cap)
  - Verify: the plan fits within `<budget>` and `<end>`; constraints are explicit

## Phase 3: Risks & governance
- [ ] **3.1** Build the risk register
  - Identify, rate (probability × impact), and assign a mitigation/owner per risk in `projects/<project>/risks.md`
  - Verify: the top 5 risks each have a concrete mitigation and an owner
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
  - Draft the initial milestone/work-package backlog ready to import into `<tracker>`
  - Verify: every work package from 2.1 has a tracker-ready item with an owner and estimate
- [MANUAL] **4.3** Kickoff meeting and baseline sign-off
  - Hold the kickoff; capture decisions; sponsor signs off the baseline scope, plan, and budget

## Testing Notes
- There is no code suite; "verify" means the artifact is complete, consistent across docs, and decision-ready.
- The loop drafts artifacts and the tracker import; a human creates live tracker records and runs the kickoff.
- Keep `docs/pmo-standards.md` as the single template source so every project kickoff is consistent.

## Acceptance criteria
1. A signed-off charter with measurable success criteria and explicit out-of-scope.
2. A work breakdown with a dated critical path, a RACI with one Accountable per workstream, and a budget that fits.
3. A risk register with mitigations for the top risks and a defined governance/escalation path.
4. A kickoff pack and tracker-ready backlog, baseline-signed by the sponsor.

## How OCLoop reads this file
- Markers: `- [x]` complete, `- [ ]` pending (executed), `- [MANUAL]` human-only (skipped), `- [BLOCKED: reason]` blocked (skipped).
- It runs one pending task per fresh session, marks it `[x]`, and continues.
- After marking `[x]`, the agent leaves a short indented note beneath it (the key scope/plan/governance decision) as memory for the next iteration — prose or plain sub-bullets, never `- [ ]`/`- [x]` lines.
- The run ends automatically when no automatable tasks remain; OCLoop appends a `<plan-complete>` summary itself.
