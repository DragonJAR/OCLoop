You are a senior technical planner. Generate the contents of a `PLAN.md` file for the OCLoop tool, which executes tasks ONE BY ONE from that file, each in its own isolated AI-agent iteration (one task = one commit). Base the plan on everything discussed in this conversation.

Return ONLY the markdown content of PLAN.md - no preamble, no explanations, and no code fences around it. Do not use tools or implement anything; only write the plan.

Structure (in this order):

1. First line: a `# <title>` for the effort.
2. A short objective (1-3 sentences) describing what we're implementing and why. An `## Overview` heading for it is fine.
3. For non-trivial work, an `## Architecture context (read first)` section: the key files, entry points, and constraints an implementer must know - with exact paths (e.g. `src/hooks/useServer.ts`) and the core problem each phase solves. This is re-read every iteration, so keep it tight.
4. `## Phase N — <title>` headings that group the work into ordered, independently shippable milestones. Phases run IN ORDER; each phase is a natural commit/checkpoint boundary.
5. `## Testing Notes`: how to verify the implementation - the exact test command (`bun test`) plus any manual steps. This project has NO lint script, so do not add lint steps.
6. `## File Change Summary`: a markdown table of files created/modified and the purpose of each.
7. `## Acceptance criteria`: a numbered definition of done - the concrete, checkable conditions that mean the whole plan is complete.

Task rules (CRITICAL - OCLoop parses these literally):
- Every actionable task is ONE line: `- [ ] <concrete, verifiable description>`. OCLoop counts every line that starts with `- [` as a task and runs one per iteration.
- Put detail as plain sub-bullets WITHOUT brackets (`  - <detail>`). NEVER put `- [ ]` on a sub-bullet - each checkbox becomes a separate iteration and commit.
- One logical change per task. Group work that touches the same file/function area into ONE task with sub-bullets:
  - BAD: 4 separate `- [ ]` tasks to create 4 related functions in the same file.
  - GOOD: 1 `- [ ]` task to create the function group, with a sub-bullet for each function.
- Include exact file paths and locations (and line ranges when known), plus specific default values/thresholds, so a new engineer can implement immediately without extra context.
- Order tasks within a phase so each builds on the previous; order phases so phase N can be finished and committed before N+1 starts.
- For any task touching an external dependency or API, add a verification sub-bullet.
- Check for existing tests on the code being changed; include explicit tasks to update or add tests, naming the test file (e.g. `src/lib/backoff.test.ts`). "Verify end-to-end": a task that says "test X" must actually run and check X, never assume it works.
- When a change touches a shared value (config key, package name, endpoint), add a sub-bullet to update every other occurrence and any docs (README.md) that reference it.
- Prefix tasks needing human action with `- [MANUAL]` (device testing, UI verification, external service or credential setup). MANUAL tasks are skipped by the loop and excluded from completion.
- Do NOT pre-mark tasks `[x]`, and do NOT add `[BLOCKED]` (the loop adds that at runtime). Do NOT write any line that begins with `<plan-complete>`.
- When the loop later marks a task `[x]`, it may leave a short indented note beneath it (prose or plain sub-bullets like `  - Decision: ...`, NEVER `- [ ]`/`- [x]` lines) as inter-task memory. Do not pre-write these notes; they are added during execution. Plan the structure so each `[ ]` task stands alone and is readable without such notes.
- Optional: for tasks whose correctness is non-deterministic (not fully covered by tests), declare an evaluation rubric as a single indented sub-bullet IMMEDIATELY after the task line: `  - eval: <what "correct" means>`. Example: a task implementing a parser may carry `  - eval: must reject malformed input and return null, never throw`. When `evals.enabled` is set in ocloop.json, an LM-judge scores the iteration against this rubric after tests pass; a failure re-runs the task once with feedback, then marks it `[BLOCKED]`. Tasks without an `eval:` line are never evaluated. Use rubrics sparingly — only where tests alone cannot verify quality (API design, error-message clarity, trajectory correctness).

Write the plan in English (or the repository's working language).