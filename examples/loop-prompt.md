You run EXACTLY ONE iteration of this loop, then stop. Do ONE task (or one coupled batch within a single phase), then end your turn. Do NOT continue to the next task in this session - OCLoop re-invokes you in a fresh session for the next task, and ends the run itself once every task is done.

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
   - If you cannot fix it this iteration, revert your changes for this task (`git checkout -- .` and delete any new files you added), mark the task `[BLOCKED: <reason>]`, and go to "After completion".
   - Never commit failing code. Never use `--no-verify` or bypass hooks.
4. Commit with a descriptive message, following the commit rules in AGENTS.md (one logical change; never `git add .`; respect `.gitignore`). NEVER push.

After completion:
1. In {{PLAN_FILE}}, mark a task `[x]` ONLY when it is definitely complete — its changes verified (checks/tests pass) and committed. Never mark `[x]` preemptively or when unsure; leave it `[ ]`, or use `[BLOCKED: <reason>]` if it cannot proceed.
2. If you discovered EXTERNAL knowledge (API behavior, library quirks, external repo details), write the detail to `docs/<topic>.md` (create `docs/` if missing) and add a one-line `@docs/...` reference under AGENTS.md `## Research` (matching the format already there). Keep AGENTS.md lean - it loads every session; detail stays in `docs/`.
3. If you learned something about THIS PROJECT by trial and error (build/test commands, gotchas), record it concisely under AGENTS.md `## Project Operations`.
4. If you could not complete a task (permissions, external service, needs human input), add `[BLOCKED: <reason>]` to its line in {{PLAN_FILE}} and do not retry it this iteration.

Completion check:
- When every non-[MANUAL] task in {{PLAN_FILE}} is `[x]` or `[BLOCKED]`, just end your turn — OCLoop detects completion automatically (you do NOT need to write any completion marker).
- Otherwise, end your turn now - OCLoop starts the next task in a fresh session.
- Do NOT skip automatable tasks: if a task looks hard but doable, attempt it.