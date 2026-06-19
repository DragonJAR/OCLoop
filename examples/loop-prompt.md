You run EXACTLY ONE iteration of this loop, then stop. Do ONE task (or one coupled batch within a single phase), then end your turn. Do NOT continue to the next task in this session - OCLoop re-invokes you in a fresh session for the next task, and ends the run itself once every task is done.

Working directory: you run in the folder where `ocloop` was launched — that folder is your working directory and project root. Resolve {{PLAN_FILE}} and EVERY file path mentioned in a task relative to it; do not assume another root or search parent/other directories unless a task gives an absolute path.

Before starting:
1. Run `git status`. A previous iteration may have been interrupted.
   - If uncommitted changes complete a task: verify they pass checks, commit them, and mark the task done.
   - If they are partial: continue that task instead of starting a new one.
2. Read {{PLAN_FILE}} fully. Choose the task ONLY from {{PLAN_FILE}} - do not scan the codebase for `[ ]` (tests, examples, and docs contain false positives).
3. Before any web search or consulting reference repos, check AGENTS.md `## Research` for relevant `@` references and read them.

Task selection (CRITICAL):
- If no uncompleted, non-[MANUAL], non-[BLOCKED] tasks remain, go straight to the Completion check. Do not invent work.
- Work through phases IN ORDER - finish Phase N before starting Phase N+1.
- Pick the FIRST uncompleted task in the earliest incomplete phase.
- Skip [MANUAL] and [BLOCKED] items.
- NEVER batch across phases - each phase is a commit boundary.
- Within a SINGLE phase, batch tasks ONLY if they are in the same file AND logically coupled.

Execute:
1. Make the code changes for that one task or coupled batch.
2. Run the project's checks using the exact commands in AGENTS.md `## Project Operations` (e.g. `bun test`). If none are defined and no test files exist, skip this step.
3. Commit ONLY if the checks pass (or there are none).
   - If a check fails and you can fix it this iteration, fix it and re-run.
   - If you cannot fix it this iteration, revert ONLY the files you changed for this task (`git checkout -- <those files>` and delete only the new files you added) — never `git checkout -- .` or `git clean`, which would discard unrelated uncommitted changes in the working tree. Mark the task `[BLOCKED: <reason>]`, and go to "After completion".
   - Never commit failing code. Never use `--no-verify` or bypass hooks.
4. Commit with a descriptive message, following the commit rules in AGENTS.md (one logical change; never `git add .`; respect `.gitignore`). NEVER push.

After completion:
1. In {{PLAN_FILE}}, mark a task `[x]` ONLY when it is definitely complete — its changes verified (checks/tests pass) and committed. Never mark `[x]` preemptively or when unsure; leave it `[ ]`, or use `[BLOCKED: <reason>]` if it cannot proceed.
2. Beneath the `[x]` line, leave a short note (1-3 indented lines) ONLY when it would change a future task's approach: a decision that constrains later work, a non-obvious gotcha, or why you rejected an obvious alternative. Test each line: if the next iteration would reach the same conclusion on its own, cut it. Write it as indented prose or plain sub-bullets (e.g. `  - Decision: ...`) — NEVER as `- [ ]`/`- [x]` lines, which OCLoop's parser counts as tasks even when indented. Write it in the language of {{PLAN_FILE}}. The diff already records what changed — don't repeat it. Plan-only notes — permanent project-wide gotchas go in AGENTS.md (step 5).
3. If the task you just marked `[x]` was a RECONNAISSANCE task — its title contains `(recon)` or `[RECON]` — and it discovered concrete items (files, endpoints, accounts, requirements, findings), then insert one new `- [ ]` task per discovered item IMMEDIATELY AFTER its `[x]` line (not at the end, not indented). This is the ONLY case where you add `- [ ]` lines; OCLoop re-reads {{PLAN_FILE}} each iteration and will execute them in document order. Rules: each inserted task names its specific item (path/endpoint/id) and its action; number them `N.Ma`, `N.Mb`, … inheriting the parent's phase number (e.g. `**1.1a**`); cap at ~20 per recon task (for more, group items or raise it as `[MANUAL]`); never duplicate a task that is already pending; never insert `- [ ]` lines for any other reason.
4. If you discovered EXTERNAL knowledge (API behavior, library quirks, external repo details), write the detail to `docs/<topic>.md` (create `docs/` if missing) and add a one-line `@docs/...` reference under AGENTS.md `## Research` (matching the format already there). Keep AGENTS.md lean - it loads every session; detail stays in `docs/`.
5. If you learned something about THIS PROJECT by trial and error (build/test commands, gotchas), record it concisely under AGENTS.md `## Project Operations`.
6. If you could not complete a task (permissions, external service, needs human input), add `[BLOCKED: <reason>]` to its line in {{PLAN_FILE}} and do not retry it this iteration.

Completion check:
- When every non-[MANUAL] task in {{PLAN_FILE}} is `[x]` or `[BLOCKED]`, just end your turn — OCLoop detects completion automatically (you do NOT need to write any completion marker).
- Otherwise, end your turn now - OCLoop starts the next task in a fresh session.
- Do NOT skip automatable tasks: if a task looks hard but doable, attempt it.

Eval rubrics (optional, opt-in via `evals.enabled` in ocloop.json):
- A task may declare an evaluation rubric as a single indented sub-bullet IMMEDIATELY after its `- [ ]` line: `  - eval: <what "correct" means for this task>`. The rubric is NOT counted as a task (it lacks the `- [` checkbox prefix).
- When `evals.enabled` is on, after your iteration finishes and tests pass, an LM-judge scores your work against the rubric. If it fails, the loop re-runs the SAME task once (default) with the judge's feedback written back as `  - eval feedback: ...` under the task. If it fails again, the task is marked `[BLOCKED: eval failed — <reason>]` and the loop moves on.
- You do NOT write the `eval:` line yourself during execution — it is authored in the plan (by a human or the `--create-plan` generator). You MAY read `  - eval feedback: ...` notes left by a prior eval retry and address them.
- A task with no `eval:` rubric is never evaluated — the loop trusts the test gate as before.
