/**
 * Tiny i18n layer (DRY single source of UI strings).
 *
 * English is the source of truth (`en`); `es` is a type-checked mirror — the
 * compiler guarantees every key exists in both. The active locale is resolved
 * once at startup (CLI `--lang` > ocloop.json `language` > "en") and read via
 * `t(key, params?)`. Parameterized strings are functions so interpolation stays
 * in one place per locale.
 *
 * The active locale is held in a Solid signal so the TUI re-renders live when
 * the language is toggled from the command palette; reading `t()` in a
 * reactive scope tracks it, while plain CLI code just gets the current value.
 */

import { createSignal } from "solid-js"
import { DEFAULTS } from "./constants"

export type Locale = "en" | "es"

type Params = Record<string, string | number>
type Msg = string | ((p: Params) => string)

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "es"
}

// Locale-identical UI strings — written once here and spread into BOTH `en` and
// `es` below. This single-sources values that never differ by language (acronyms,
// short labels, the rate-limit prefix) while `es: Record<MessageKey, Msg>` still
// makes the compiler flag any missing/typo'd key.
const shared = {
  // Dashboard
  badgeError: "ERROR",
  badgeDebug: "DEBUG",
  guardOk: "OK",
  // Keybind hints (same word in both locales)
  hintPrompt: "prompt",
  // Command palette categories
  catTerminal: "Terminal",
  catLoop: "Loop",
  catChaos: "Chaos",
  // Shared titles / dialog labels
  errorTitle: "Error",
  dlgArgsColon: "Args:    ",
  // Activity-log stats header
  logTokens: "Tokens: ",
  logTokenIn: "in:",
  logTokenOut: "out:",
  // BottomPanel metric (same abbrev in both locales)
  lblRate: "Tokens/min",
  // Activity-log event label (same word in both locales)
  logLblError: "error",
  // Runtime
  actRateLimit: (p: Params) => `Rate limit: ${p.message}`,
  // Countdown hint shown on a dialog's default action while it auto-selects
  // (same shape in both locales): "auto 12s".
  autoSelectHint: (p: Params) => `auto ${p.secs}s`,
} satisfies Record<string, Msg>

const en = {
  ...shared,

  // --- Plan generator (CLI: --create-plan) ---
  cpTitle: "OCLoop — plan generator",
  cpConfig: (p: Params) => `Model: ${p.model}${p.note} · Agent: ${p.agent}`,
  cpModelNote:
    " (not 'provider/model' → opencode's default model will be used)",
  cpAskGoal: "What do you want OCLoop to build? Describe your goal — end with a line containing only '.' (or press Ctrl-D):",
  cpNoGoal: "No goal provided. Cancelled.",
  cpStartingServer: "Starting the OpenCode server…",
  cpPortBusy: (p: Params) =>
    `Port ${p.port} is already in use — another opencode may be running. Free it, or omit --port to auto-pick a free port.`,
  cpSessionFail:
    "Could not create the planning session. Make sure opencode is installed and the port isn't in use (try --port <number>).",
  cpGenerating: "Generating plan… (this may take a few minutes — please be patient)\n",
  cpTimeout: (p: Params) =>
    `Plan generation timed out after ${p.secs}s (~${Math.round(Number(p.secs) / 60)} min). Increase the budget with --resilience planTimeoutMs=<ms> (e.g. planTimeoutMs=1800000 for 30 min), or set "resilience": { "planTimeoutMs": <ms> } in ~/.config/ocloop/ocloop.json — or simplify the goal.`,
  cpNoContent:
    "The model returned no content. Try again with a different goal.",
  cpProposedTitle: "PROPOSED PLAN",
  cpAskApprove: "\nApprove this plan? [y = save · r = save & run · e = edit · n = cancel]: ",
  cpSaved: (p: Params) => `\n✓ Saved to ${p.path}`,
  cpRunHint: (p: Params) => `Now run 'ocloop'${p.planArg} to start.`,
  cpStarting: "Starting OCLoop…",
  cpAskEdit: "What would you like to change or add?\n> ",
  cpNoChanges: "No changes.",
  cpCancelled: "Cancelled. No file was written.",
  cpError: (p: Params) => `\nError generating the plan: ${p.message}`,
  cpPrompt: (p: Params) =>
    [
      "You are a senior technical planner. Generate the contents of a PLAN.md file",
      "for the OCLoop tool, which executes tasks ONE BY ONE from that file, each in",
      "an isolated AI-agent iteration.",
      "",
      "User goal:",
      String(p.goal),
      "",
      "REQUIRED response format:",
      "- Return ONLY the markdown content of PLAN.md — no intro text, explanations,",
      "  or code fences around it.",
      "- First line: a '# ...' title. Then a short objective line.",
      "- Group work under '## Phase N — title' headings.",
      "- Each actionable task on its own line: '- [ ] concrete, verifiable description'.",
      "- One task = a small, atomic step an agent completes in one iteration.",
      "- Use '- [MANUAL] ...' for tasks needing human intervention.",
      "- End with an '## Acceptance criteria' section.",
      "- Do NOT implement anything or use tools; only write the plan.",
      "- Write the plan in English.",
    ].join("\n"),
  cpRefine: (p: Params) =>
    [
      "Revise and improve the following PLAN.md according to the user's feedback.",
      "Keep EXACTLY the same format (markdown only; '## Phase N — title' headings;",
      "'- [ ]' / '- [MANUAL]' tasks; '## Acceptance criteria'). Return ONLY the",
      "updated PLAN.md markdown. Write it in English.",
      "",
      "User feedback:",
      String(p.feedback),
      "",
      "Current PLAN.md:",
      String(p.plan),
    ].join("\n"),

  // --- argparse errors (cli-args.ts). Localized because the locale is now
  // pre-scanned from --lang before parseArgs runs, so a user passing --lang es
  // gets argparse errors in Spanish too. ---
  errArgValueRequired: (p: Params) => `Error: ${p.flag} requires a value`,
  errArgUnknown: (p: Params) => `Error: unknown argument "${p.arg}"`,
  errArgLang: "Error: --lang requires 'en' or 'es'",
  errArgPortInteger: "Error: --port requires a full integer argument",
  errArgPortRange: "Error: --port must be in TCP range 0..65535",
  errArgModelArg: "Error: --model requires an argument",
  errArgModelFormat: (p: Params) =>
    `Error: --model expects provider/model (for example openai/gpt-5), got "${p.model}"`,

  // --- --resilience parsing errors (CLI) ---
  // Localized like the other argparse errors above so a user passing --lang es
  // gets these in Spanish too (preScanLang runs before parseArgs). See
  // REPARAR.md B3. Keys take {raw}/{key}/{keys} params as noted.
  errResilienceNeedsArg: "Error: --resilience requires a key=value argument",
  errResilienceNoEquals: (p: Params) =>
    `Error: --resilience expects key=value, got "${p.raw}"`,
  errResilienceEmptyKey: (p: Params) =>
    `Error: --resilience key is empty in "${p.raw}"`,
  errResilienceEmptyValue: (p: Params) =>
    `Error: --resilience ${p.key} requires a non-empty value`,
  errResilienceUnknownKey: (p: Params) =>
    `Error: unknown resilience key "${p.key}" (valid: ${p.keys})`,
  errResilienceBool: (p: Params) =>
    `Error: --resilience ${p.key} expects a boolean (true|false), got "${p.raw}"`,
  errResilienceInt: (p: Params) =>
    `Error: --resilience ${p.key} expects a non-negative integer (decimal only), got "${p.raw}"`,
  errResilienceMin: (p: Params) =>
    `Error: --resilience ${p.key} must be >= ${p.min}, got "${p.raw}"`,

  // --- Pre-flight file errors (CLI, after locale is resolved) ---
  // Checkbox markers ('- [ ]') stay literal — they're language-agnostic.
  errPlanNotFound: (p: Params) =>
    [
      `Error: Plan file not found: ${p.path}`,
      "",
      `OCLoop requires a plan file (default: ${DEFAULTS.PLAN_FILE}).`,
      `Create a ${p.path} file with a task list, for example:`,
      "",
      "  ## Backlog",
      "  - [ ] Task one description",
      "  - [ ] Task two description",
      "",
      "Alternatively, generate one interactively with:",
      "  ocloop -c          (or: ocloop --create-plan)",
      "",
    ].join("\n"),
  errPromptNotFound: (p: Params) =>
    [
      `Error: Prompt file not found: ${p.path}`,
      "",
      `OCLoop requires a prompt file (default: ${DEFAULTS.PROMPT_FILE}).`,
      "This file contains the prompt sent to opencode for each iteration.",
      "Create it with, for example:",
      "",
      "    You run ONE iteration of this loop, then stop.",
      "    Read {{PLAN_FILE}}, pick the first uncompleted task, do it, commit, and stop.",
      "",
      `Or omit --prompt to auto-generate a default ${DEFAULTS.PROMPT_FILE} in this folder.`,
      "",
    ].join("\n"),
  // Surfaces a PLAN.md that exists but has no task lines (0-byte, whitespace-
  // only, or headings/prose-only — parsePlan returns total === 0). The pre-flight
  // sits between the existence check and the prompt-file auto-create, so the
  // prompt is NOT created when the plan is unusable.
  errPlanEmpty: (p: Params) =>
    [
      `Error: Plan file is empty: ${p.path}`,
      "",
      "OCLoop requires a plan file with at least one task.",
      `The file at ${p.path} contains no task lines (lines starting with "- [ ]").`,
      "",
      `Add a task to ${p.path}, for example:`,
      "",
      "  ## Backlog",
      "  - [ ] Task one description",
      "  - [ ] Task two description",
      "",
      "Alternatively, generate one interactively with:",
      "  ocloop -c          (or: ocloop --create-plan)",
      "",
    ].join("\n"),
  // Surfaces a loop-prompt file that exists but is empty/whitespace-only. The
  // runtime reads the prompt on every iteration, so a blank file produces an
  // empty send. Mirrors errPromptNotFound's shape. Used by start-iteration.ts
  // (runIteration) — see REPARAR.md B2.
  errPromptEmpty: (p: Params) =>
    [
      `Error: Prompt file is empty: ${p.path}`,
      "",
      "The prompt file exists but contains no text.",
      "Add the instructions to send to opencode on each iteration,",
      `or recreate ${p.path} from the default template.`,
      "",
    ].join("\n"),
  // Surfaces a PLAN.md that HAS tasks but NO automatable work for OCLoop:
  // every task is already `[x]`, or is `[MANUAL]`/`[BLOCKED]` (terminal
  // states). This is the matrix case 51 sibling of `errPlanEmpty` — same
  // exit path (clean `process.exit(0)`), but the plan is in a "done"
  // state, not a broken one. Exits 0 because the plan IS in a terminal
  // good state: a CI script that runs `ocloop` after each commit and
  // checks `$?` doesn't need a special case for "all done"; it's the
  // same success signal as "nothing went wrong". The check sits AFTER
  // `errPlanEmpty` (a plan with zero tasks is broken, not complete) and
  // BEFORE the prompt auto-create (so a completed plan doesn't drag in
  // a default `.loop-prompt.md` the user didn't ask for). The pre-flight
  // is read-only — it does NOT write the `<plan-complete>` tag; that's
  // the TUI's job (`App.tsx:checkPlanComplete`, line 724-752). The
  // breakdown (X/Y + manual + blocked counts) is NOT included here
  // because `buildCompletionSummary` is English-only by design (it gets
  // persisted into PLAN.md by the TUI's tag-writing path, where
  // localization would corrupt the deterministic format). The user can
  // read their own PLAN.md to see the breakdown; the TUI's completion
  // dialog shows the full summary in `App.tsx:checkPlanComplete`. Source:
  // PLAN.md Phase 3 task 4 (matrix case 51).
  errPlanComplete: (p: Params) =>
    [
      `Plan is already complete: ${p.path}`,
      "",
      "Nothing left for OCLoop to do (every task is [x], [MANUAL], or [BLOCKED]).",
      "",
      "To enter the dashboard anyway (skipping this check), run: ocloop --debug",
      "To add more work, edit the plan file and add a new task (or run `ocloop -c`).",
      "",
    ].join("\n"),
  // Wraps `Bun.file().exists()` when the call itself throws (EACCES, ENOENT
  // on a missing parent dir, EISDIR, etc.) so the user gets a clean,
  // localized "Cannot read <path>: <reason>" instead of a raw stack trace
  // bubbled up through main().catch().
  errCannotReadFile: (p: Params) =>
    [
      `Error: Cannot read ${p.path}: ${p.message}`,
      "",
      "The file's directory may be inaccessible, or the file may have been moved or removed.",
      "Verify the path exists and is readable, then try again.",
      "",
    ].join("\n"),
  // Wraps `Bun.write()` in the default-path auto-create branch of
  // `validatePrerequisites` when the write itself throws (EACCES, EROFS,
  // ENOENT on a missing parent dir, ENOSPC, EISDIR, etc.) so the user gets
  // a clean, localized "Cannot create <path>: <message>" instead of a raw
  // stack trace bubbled up through main().catch(). The non-default path
  // (custom --prompt) keeps its hard error pre-create (errPromptNotFound)
  // and never enters this branch.
  errCannotCreatePrompt: (p: Params) =>
    [
      `Error: Cannot create ${p.path}: ${p.message}`,
      "",
      "The file's directory may be inaccessible, on a read-only filesystem, or full.",
      "Verify the path is writable, then try again.",
      "",
    ].join("\n"),
  // Emitted when stdin or stdout is not a TTY (pipe, redirect, CI runner,
  // editor-launched subprocess) right before the TUI render path. OpenTUI
  // cannot render outside an interactive terminal and segfaults in that
  // case, so this is a clean process.exit(1) with a localized message
  // instead of a SIGSEGV (139) or a hung render loop. The check sits after
  // validatePrerequisites (so PLAN.md/.loop-prompt.md validation still runs,
  // mirroring the real TTY path) and before tuiStarted = true (so the exit
  // handler doesn't try to restore a terminal mode it never enabled).
  errNoTty: [
    `Error: OCLoop requires an interactive terminal (TTY).`,
    "",
    "The current stdin or stdout is not connected to a real terminal",
    "(detected: stdin.isTTY=false or stdout.isTTY=false).",
    "",
    "This typically happens when:",
    "  - You pipe the command (e.g. `ocloop | less`)",
    "  - You redirect output (e.g. `ocloop > out.log`)",
    "  - You run from a CI runner or sandbox without a TTY",
    "  - You launch from an editor / IDE that doesn't expose a TTY",
    "",
    "Open a real terminal (Terminal.app, iTerm, gnome-terminal, Windows Terminal, etc.)",
    "and run the command there.",
    "",
  ].join("\n"),
  // Boot pre-flight: a single probe-write to process.cwd() failed, so
  // .loop-state.json (resume), .loop.log (trace), and the default
  // .loop-prompt.md (auto-create) cannot be created. Without this check the
  // user would see a misleading "Cannot create .loop-prompt.md" or a silent
  // resume-broken state after a crash. The probe is unlinked on success, so
  // there is no on-disk residue between runs.
  errCwdNotWritable: (p: Params) =>
    [
      `Error: working directory is not writable: ${p.path}`,
      "",
      "OCLoop needs to write to this directory to:",
      "  - save the loop state (.loop-state.json) so it can resume after a crash",
      "  - write the debug log (.loop.log)",
      "  - auto-create the default .loop-prompt.md if it doesn't exist",
      "",
      "The directory is not writable for the current user, or the underlying",
      "filesystem is read-only / out of space. Check permissions (e.g. `ls -ld`,",
      "`chmod u+w`) or change to a writable directory, then run the command again.",
      "",
    ].join("\n"),

  // --- Default .loop-prompt.md (auto-created when missing) ---
  // Announced to the user; the body below is written to disk verbatim.
  promptCreated: (p: Params) =>
    `No ${p.path} found in this folder — created a default loop prompt. Edit it to customize what runs each iteration.`,
  // Literal tokens ({{PLAN_FILE}}, [MANUAL], [BLOCKED], commands, paths, tags)
  // are NOT translated: they are substituted/matched downstream, language-agnostic.
  defaultLoopPrompt:
    [
      "You run EXACTLY ONE iteration of this loop, then stop. Do ONE task (or one coupled batch within a single phase), then end your turn. Do NOT continue to the next task in this session - OCLoop re-invokes you in a fresh session for the next task, and ends the run itself once every task is done.",
      "",
      "Working directory: you run in the folder where `ocloop` was launched — that folder is your working directory and project root. Resolve {{PLAN_FILE}} and EVERY file path mentioned in a task relative to it; do not assume another root or search parent/other directories unless a task gives an absolute path.",
      "",
      "Before starting:",
      "1. Run `git status`. A previous iteration may have been interrupted.",
      "   - If uncommitted changes complete a task: verify they pass checks, commit them, and mark the task done.",
      "   - If they are partial: continue that task instead of starting a new one.",
      "2. Read {{PLAN_FILE}} fully. Choose the task ONLY from {{PLAN_FILE}} - do not scan the codebase for `[ ]` (tests, examples, and docs contain false positives).",
      "3. Before any web search or consulting reference repos, check AGENTS.md `## Research` for relevant `@` references and read them.",
      "",
      "Task selection (CRITICAL):",
      "- If no uncompleted, non-[MANUAL], non-[BLOCKED] tasks remain, go straight to the Completion check. Do not invent work.",
      "- Work through phases IN ORDER - finish Phase N before starting Phase N+1.",
      "- Pick the FIRST uncompleted task in the earliest incomplete phase.",
      "- Skip [MANUAL] and [BLOCKED] items.",
      "- NEVER batch across phases - each phase is a commit boundary.",
      "- Within a SINGLE phase, batch tasks ONLY if they are in the same file AND logically coupled.",
      "",
      "Execute:",
      "1. Make the code changes for that one task or coupled batch.",
      "2. Run the project's checks using the exact commands in AGENTS.md `## Project Operations` (e.g. `bun test`). If none are defined and no test files exist, skip this step.",
      "3. Commit ONLY if the checks pass (or there are none).",
      "   - If a check fails and you can fix it this iteration, fix it and re-run.",
      "   - If you cannot fix it this iteration, revert ONLY the files you changed for this task (`git checkout -- <those files>` and delete only the new files you added) — never `git checkout -- .` or `git clean`, which would discard unrelated uncommitted changes in the working tree. Mark the task `[BLOCKED: <reason>]`, and go to \"After completion\".",
      "   - Never commit failing code. Never use `--no-verify` or bypass hooks.",
      "4. Commit with a descriptive message, following the commit rules in AGENTS.md (one logical change; never `git add .`; respect `.gitignore`). NEVER push.",
      "",
      "After completion:",
      "1. In {{PLAN_FILE}}, mark a task `[x]` ONLY when it is definitely complete — its changes verified (checks/tests pass) and committed. Never mark `[x]` preemptively or when unsure; leave it `[ ]`, or use `[BLOCKED: <reason>]` if it cannot proceed.",
      "2. Beneath the `[x]` line, leave a short note (1-3 indented lines) ONLY when it would change a future task's approach: a decision that constrains later work, a non-obvious gotcha, or why you rejected an obvious alternative. Test each line: if the next iteration would reach the same conclusion on its own, cut it. Write it as indented prose or plain sub-bullets (e.g. `  - Decision: ...`) — NEVER as `- [ ]`/`- [x]` lines, which OCLoop's parser counts as tasks even when indented. Write it in the language of {{PLAN_FILE}}. The diff already records what changed — don't repeat it. Plan-only notes — permanent project-wide gotchas go in AGENTS.md (step 5).",
      "3. If the task you just marked `[x]` was a RECONNAISSANCE task — its title contains `(recon)` or `[RECON]` — and it discovered concrete items (files, endpoints, accounts, requirements, findings), then insert one new `- [ ]` task per discovered item IMMEDIATELY AFTER its `[x]` line (not at the end, not indented). This is the ONLY case where you add `- [ ]` lines; OCLoop re-reads {{PLAN_FILE}} each iteration and will execute them in document order. Rules: each inserted task names its specific item (path/endpoint/id) and its action; number them `N.Ma`, `N.Mb`, … inheriting the parent's phase number (e.g. `**1.1a**`); cap at ~20 per recon task (for more, group items or raise it as `[MANUAL]`); never duplicate a task that is already pending; never insert `- [ ]` lines for any other reason.",
      "4. If you discovered EXTERNAL knowledge (API behavior, library quirks, external repo details), write the detail to `docs/<topic>.md` (create `docs/` if missing) and add a one-line `@docs/...` reference under AGENTS.md `## Research` (matching the format already there). Keep AGENTS.md lean - it loads every session; detail stays in `docs/`.",
      "5. If you learned something about THIS PROJECT by trial and error (build/test commands, gotchas), record it concisely under AGENTS.md `## Project Operations`.",
      "6. If you could not complete a task (permissions, external service, needs human input), add `[BLOCKED: <reason>]` to its line in {{PLAN_FILE}} and do not retry it this iteration.",
      "",
      "Completion check:",
      "- When every non-[MANUAL] task in {{PLAN_FILE}} is `[x]` or `[BLOCKED]`, just end your turn — OCLoop detects completion automatically (you do NOT need to write any completion marker).",
      "- Otherwise, end your turn now - OCLoop starts the next task in a fresh session.",
      "- Do NOT skip automatable tasks: if a task looks hard but doable, attempt it.",
    ].join("\n") + "\n",

  // --- Dashboard: state badges ---
  badgeStarting: "STARTING",
  badgeReady: "READY",
  badgeRunning: "RUNNING",
  badgePausing: "PAUSING",
  badgePaused: "PAUSED",
  badgeCooldown: "WAITING",
  badgeStopping: "STOPPING",
  badgeStopped: "STOPPED",
  badgeComplete: "COMPLETE",
  badgeUnknown: "UNKNOWN",

  // --- Dashboard: labels ---
  lblModel: "Model",
  lblAgent: "Agent",
  lblIter: "Iteration",
  lblTasks: "Tasks",
  lblTime: "Task Time",
  lblAvg: "Avg/task",
  lblEta: "Remaining",
  lblTaskPrefix: "Task: ",
  lblSessionPrefix: "Session: ",
  lblWaiting: "waiting...",
  lblGuard: "Health",
  // --- BottomPanel labels ---
  lblTotal: "Total Time",
  lblTaskTokens: "Task Tokens",
  lblCost: "Cost: ",
  // Overflow indicator when the bottom-panel task is capped to maxTaskLines.
  lblTaskMore: (p: Params) => `+${p.n} more`,

  // --- Dashboard: keybind hints ---
  hintStart: "start",
  hintPause: "pause",
  hintResume: "resume",
  hintCancel: "cancel",
  hintCommands: "commands",
  hintQuit: "quit",
  hintRetry: "retry",
  hintCopy: "copy attach",
  hintTerminal: "open terminal",
  hintScroll: "scroll log",
  hintNewSession: "new session",
  hintSampleActivity: "sample activity",
  hintStartingMsg: "Starting the OpenCode server…",
  hintPausingMsg: "Pausing after current task —",
  hintCooldownMsg: "Rate limited — auto-retrying, just wait",
  hintCompleteMsg: "Press any key to exit",

  // --- Watchdog health labels ---
  guardSuspect: "Suspect",
  guardCheck: "Checking",
  guardStuck: "Stuck",
  guardRecover: "Recovering",

  // --- Cooldown / dashboard countdown ---
  cooldownText: (p: Params) =>
    `Rate limited — retrying in ${p.secs}s (attempt ${p.attempt})`,
  cooldownRetryText: (p: Params) =>
    `Connection issue — retrying in ${p.secs}s (attempt ${p.attempt})`,

  // --- Runtime / activity log messages ---
  actSessionAborted: "Session aborted by user",
  actSessionError: (p: Params) => `Session error: ${p.message}`,
  actSessionIdle: "Session idle",
  actSessionStarted: (p: Params) => `Session started: ${p.id}`,
  actDebugSession: (p: Params) => `Debug session: ${p.id}`,
  actUserMessage: (p: Params) => `User: ${p.text}`,
  cpIgnoredFlags: (p: Params) =>
    `Note: --create-plan ignores: ${p.flags}. These flags only affect the TUI loop, which does not start in plan-generator mode.`,
  actRateExhausted: (p: Params) =>
    `Persistent rate limit after ${p.attempts} attempts — wait for quota to reset, then press R; if it recurs, lower the rate via --resilience or check your API key/plan`,
  errRatePersistent: (p: Params) =>
    [
      `Persistent rate limit after ${p.attempts} attempts: ${p.reason}`,
      "Wait for your provider quota to reset, then press R to retry.",
      "If this recurs, lower the iteration rate via --resilience, or verify your API key/plan.",
      "",
    ].join("\n"),
  actRetryExhausted: (p: Params) =>
    `Persistent connection error after ${p.attempts} attempts — the opencode server may have crashed; restart it from the palette (Ctrl+P) or press R`,
  errRetryPersistent: (p: Params) =>
    [
      `Persistent connection error after ${p.attempts} attempts: ${p.reason}`,
      "The opencode server may have crashed. Restart it from the command palette (Ctrl+P), or press R to retry.",
      "",
    ].join("\n"),
  errIterationStart: (p: Params) => `Failed to start iteration: ${p.message}`,
  errCreateDebugSession: (p: Params) => `Failed to create debug session: ${p.message}`,
  errNoProgress: (p: Params) =>
    [
      `Loop halted: ${p.count} consecutive iterations started on the same task without progress.`,
      `Task: "${p.task}"`,
      `The agent is stuck redoing the same work — PLAN.md was not advanced.`,
      "Inspect the plan, fix the blocking issue, then press R to resume.",
      "",
    ].join("\n"),
  errDecomposeFailed:
    "Couldn't generate subtasks — the agent returned nothing usable. The plan was left unchanged.",
  splitGenerating: "Splitting the stalled task into subtasks…",
  splitApplied: (p: Params) => `Task split into ${p.count} subtasks — resuming.`,
  dlgSplitTask: "Split task",
  dlgSplitTitle: "Split stalled task?",
  dlgSplitBody: "Replace the stalled task with these subtasks:",
  dlgSplitAccept: "Accept",
  dlgSplitEdit: "Edit",
  dlgSplitReject: "Reject",
  dlgSplitEditPrompt: "What should change? Describe how to adjust the subtasks:",
  splitRefinePrompt: (p: Params) =>
    [
      "You previously broke this stalled PLAN.md task into subtasks:",
      "",
      `    ${p.task}`,
      "",
      "Current subtasks:",
      String(p.subtasks),
      "",
      "Revise them according to this feedback:",
      String(p.feedback),
      "",
      'Reply with ONLY the revised subtasks, one per line as "- [ ] <subtask>". No prose, no numbering, no commentary. Do NOT edit any files.',
    ].join("\n"),
  splitPromptTemplate: (p: Params) =>
    [
      "The following PLAN.md task has stalled — repeated attempts finished without completing it, most likely because it is too large or too vague:",
      "",
      `    ${p.task}`,
      "",
      "Break it into 2-5 smaller, ordered subtasks that DISTRIBUTE the work into independently completable pieces and together fully accomplish the original task. Each subtask must be concrete, clearly smaller in scope than the original, and independently checkable.",
      "Do NOT edit any files and do NOT run any tools — only output the list.",
      'Reply with ONLY the subtasks, one per line, each as a markdown checkbox: "- [ ] <subtask>". No headings, no prose, no numbering, no commentary.',
    ].join("\n"),
  errServerStart:
    "OpenCode server failed to start — check the port isn't already in use (try --port) and that opencode is installed, then press R to retry.",
  errUnknown:
    "Unknown error — if this was a terminal launch, check your terminal command in ocloop.json (Ctrl+P → Choose default terminal) or pick an installed terminal.",
  dlgPlanCompleteFallback: "Plan marked as complete.",
  toastSendPromptFailed: (p: Params) => `Failed to send prompt: ${p.message}`,
  toastCopyFailed: (p: Params) => `Copy failed: ${p.error}`,
  // Clipboard tool detection failures surfaced from clipboard.ts (REPARAR.md B4).
  errClipboardNotFound: (p: Params) =>
    `No clipboard tool found. ${p.hint} should be available.`,
  errClipboardFailed: (p: Params) =>
    `Clipboard command failed (exit ${p.code}${p.stderr ? ": " + p.stderr : ""})`,
  actWake: (p: Params) => `Woke after ${p.secs}s suspended — reconnecting`,
  actReconciled: (p: Params) => `Reconciled: session ${p.result}, advancing`,
  actGuardRestart: "Guardian: server unresponsive, restarting",
  actGuardReconnect: "Guardian: reconnecting SSE",
  actGuardSynthIdle: "Guardian: session idle/missing, advancing",
  actGuardAbort: "Guardian: session wedged, aborting and retrying",
  actEvalRetry: (p: Params) => `Eval failed for "${p.task}" — retrying with feedback`,
  actEvalBlocked: (p: Params) => `Eval failed for "${p.task}" — marked [BLOCKED]`,
  errGuardExhausted: (p: Params) =>
    [
      `OCLoop could not recover the stuck session after ${p.attempts} attempts.`,
      `(No activity for ${p.secs}s; last status: ${p.verdict}; reason: ${p.reason})`,
      "Restart the OpenCode server from the command palette (Ctrl+P), or press R, then resume.",
      "",
    ].join("\n"),
  actResuming: (p: Params) => `Resuming session ${p.id} (iter ${p.iteration})`,
  actContinuing: (p: Params) =>
    `Previous session ${p.verdict}; continuing the loop`,
  // PLAN.md was edited between crash and resume, so the task the loop was
  // working on no longer matches the first pending task. The warning is
  // informational; the loop still proceeds (the agent picks the first pending
  // task), but the user gets a line in the activity log and .loop.log to
  // confirm the change was intentional. The "kind" disambiguates the
  // three sub-cases the helper returns (completed, reordered, removed).
  actResumeMisalign: (p: Params) =>
    `Resume: PLAN.md changed since crash (${p.kind}) — was on "${p.saved}", now starts on "${p.current ?? "—"}"`,

  // --- Command palette ---
  cmdCopyAttach: "Copy attach command",
  cmdChooseTerminal: "Choose default terminal",
  cmdChooseTheme: "Choose theme",
  cmdToggleScrollbar: "Toggle scrollbar",
  cmdStart: "Start iterations",
  cmdPause: "Pause loop",
  cmdResume: "Resume loop",
  cmdCancelPause: "Cancel pending pause",
  cmdRestartServer: "Restart OpenCode server",
  cmdPermissions: "Permissions",
  cmdQuit: "Quit OCLoop",
  cmdAbout: "About",
  // --- Help overlay (opened with the ? key) ---
  helpTitle: "Keybindings & Help",
  helpDismissHint: "press any key to close",
  helpIntro:
    "OCLoop runs an AI agent once per task in your PLAN.md, then stops. Press S to start a loop iteration; press Ctrl+P anytime for the full command palette.",
  helpSectionLoop: "Loop control",
  helpSectionSession: "Session & terminal",
  helpSectionDebug: "Debug mode",
  // --- About overlay ---
  aboutTitle: "About OCLoop",
  aboutTagline: "An unattended loop harness for OpenCode: runs your PLAN.md one task at a time, survives rate limits, sleep, and crashes, and keeps going until the plan is done.",
  aboutRuntime: "Runtime: Bun + TypeScript · 20 example plans included",
  aboutCreatedBy: "Originally created by Fayçal Mitidji (d3vr)",
  aboutMaintainedBy: "Fork maintained by DragonJAR SAS",
  aboutServices: "Experts in IT security, proactive validation, and offensive security",
  aboutRepo: "Source, docs, and example plans",
  catView: "View",
  catAppearance: "Appearance",
  catLanguage: "Language",
  catHelp: "Help",
  catPreview: "Preview",
  toastLanguageChanged: "Language changed",
  toastRestarting: "Restarting OpenCode server…",
  // Surfaced when saveConfig returns false (EACCES/ENOSPC/EROFS/EXDEV). The
  // on-disk state is stale and the user needs to know the change won't survive
  // a restart.
  toastConfigSaveFailed:
    "Failed to save config — change will not persist. Check that ~/.config/ocloop/ocloop.json is writable.",
  // Chaos fault-injection (debug + --chaos). One label + one "done" per action,
  // so the command title and its toast are single-sourced.
  chaosKill: "Chaos: kill server",
  chaosKillDone: "Chaos: server killed",
  chaosRevive: "Chaos: revive server",
  chaosReviveDone: "Chaos: server revived",
  chaosFreeze: "Chaos: freeze session",
  chaosFreezeDone: "Chaos: session frozen",
  chaosUnfreeze: "Chaos: unfreeze session",
  chaosUnfreezeDone: "Chaos: session unfrozen",
  chaosRateLimit: "Chaos: inject rate limit",
  chaosRateLimitDone: "Chaos: rate limit injected",
  // Debug "Preview" commands (debug only) — stage a state/dialog for a screenshot.
  previewRunning: "Preview: running dashboard",
  previewPaused: "Preview: paused",
  previewCooldown: "Preview: rate-limit cooldown",
  previewComplete: "Preview: plan complete",
  previewError: "Preview: error / halt",
  previewDecompose: "Preview: split stalled task",
  previewInvalidAgent: "Preview: invalid agent",
  previewTerminalError: "Preview: terminal launch failed",
  previewCompleteSummary:
    "Implemented the rate-limit backoff, sleep/wake reconciliation, and the watchdog recovery path. All 12 plan tasks complete; tests green.",
  previewErrorMessage:
    "401 Unauthorized — the provider rejected the API key. Check your OpenCode auth and retry.",

  // --- Dialogs ---
  dlgQuitTitle: "Quit OCLoop?",
  dlgQuitMsg: "Are you sure you want to quit?",
  dlgQuitConfirm: "Quit",
  dlgCancel: "Cancel",
  dlgResumeTitle: "Resume previous run?",
  dlgResumeMsg: (p: Params) =>
    `Found an interrupted run at iteration ${p.iteration}. Resume it?`,
  dlgResumeConfirm: "Resume",
  dlgResumeCancel: "Start fresh",
  dlgConfirm: "Confirm",
  dlgRetry: "Retry",
  dlgEscToQuit: "esc to quit",
  dlgNoResults: "No results found",
  dlgSearchPlaceholder: "Search...",
  dlgSendPrompt: "Send Prompt",
  dlgPromptHint: "Enter send · Esc cancel",
  dlgPlanComplete: "Plan Complete",
  dlgCompletedIn: (p: Params) =>
    `Completed in ${p.iterations} iteration${Number(p.iterations) !== 1 ? "s" : ""} (${p.time})`,
  dlgDismiss: "Dismiss",
  dlgInvalidAgent: "Invalid Agent",
  dlgAgentNotFound: (p: Params) => `Agent "${p.agent}" not found.`,
  dlgAvailableAgents: "Available agents:",
  dlgUseDefault: "Use Default",
  dlgTerminalFailed: "Terminal Launch Failed",
  dlgEditConfig: "Edit config: ",
  dlgAttachCommand: "Attach command:",
  dlgCopy: "Copy",
  dlgClose: "Close",
  dlgConfigureTerminal: "Configure Terminal",
  dlgCustomTerminal: "Custom Terminal",
  dlgCommandColon: "Command: ",
  dlgInstalledTerminals: "Installed Terminals",
  dlgCustomEllipsis: "Custom...",
  dlgManualConfig: "Manual Configuration",
  dlgTerminalOptHint: "Opens a terminal attached to your session",
  dlgCustomOptHint: "Define a custom terminal command",
  // --- Permissions dialog ---
  dlgPermissionsTitle: "Permissions",
  dlgPermissionsHint: "Auto-approved so the loop never hangs. Untick to make OpenCode ask.",
  dlgPermissionsRestart: "Permissions changed — restarting server",
  permEdit: "Edit files",
  permEditDesc: "Write or modify project files",
  permBash: "Run shell commands",
  permBashDesc: "Execute bash / terminal commands",
  permWebfetch: "Fetch from the web",
  permWebfetchDesc: "Download URLs with webfetch",
  permDoomLoop: "Doom loop",
  permDoomLoopDesc: "OpenCode's internal looping tool",
  permExternalDirectory: "External directories",
  permExternalDirectoryDesc: "Reach paths outside the project root",
  paletteTitle: "Command Palette",
  palettePlaceholder: "Type a command...",
  kbSelect: "Select",
  kbNavigate: "Navigate",
  kbPreview: "Preview",
  kbSave: "save",
  routingStepTitle: (p: Params) => `Step ${p.n}/${p.total} — ${p.label}`,
  routingPlaceholder: "Search models...",
  routingSkip: "Skip",
  routingHeavyLabel: "Main model (heavy)",
  routingJudgeLabel: "Judge model (judge)",
  routingCheapLabel: "Cheap model (cheap)",
  kbSwitch: "switch",
  kbBack: "back",
  dlgCmdPlaceholderHelp: "Use {cmd} as placeholder for the attach command",
  toastNoSessionPrompt: "No active session to send prompt",
  toastCopied: "Copied to clipboard",
  toastSampleInserted: "Sample activity inserted",
  toastNoSessionAttach: "No active session to attach to",
  sampleSessionStarted: "Session started",
  sampleUserMessage: "User: Implement feature X",
  sampleAssistantMessage: "Assistant: I'll help with that",
  sampleReasoning: "Analyzing the codebase structure...",
  sampleFileRead: "Reading src/App.tsx",
  sampleFileEdit: "Modified src/components/Button.tsx (+15, -3)",
  sampleTask: "Implementing dark mode toggle",
  sampleError: "Build failed: Type error in Button.tsx",
  sampleSessionIdle: "Session idle - waiting for input",

  // --- Activity-log event labels (bracketed [tag] in the log stream) ---
  logLblStart: "starting",
  logLblIdle: "waiting",
  logLblTask: "working",
  logLblEdit: "editing",
  logLblRead: "reading",
  logLblTool: "running",
  logLblYou: "asking",
  logLblAssistant: "responding",
  logLblReason: "reasoning",
  logLblEvent: "processing",
} satisfies Record<string, Msg>

export type MessageKey = keyof typeof en

/** Spanish mirror — the type forces every English key to be present here. */
const es: Record<MessageKey, Msg> = {
  ...shared,
  cpTitle: "OCLoop — generador de planes",
  cpConfig: (p) => `Modelo: ${p.model}${p.note} · Agente: ${p.agent}`,
  cpModelNote:
    " (no es 'provider/model' → se usará el modelo por defecto de opencode)",
  cpAskGoal: "¿Qué quieres que OCLoop construya? Describe tu objetivo — termina con una línea que contenga solo '.' (o pulsa Ctrl-D):",
  cpNoGoal: "No se indicó ningún objetivo. Cancelado.",
  cpStartingServer: "Arrancando el servidor OpenCode…",
  cpPortBusy: (p) =>
    `El puerto ${p.port} ya está en uso — puede haber otro opencode corriendo. Liberalo, u omití --port para elegir uno libre automáticamente.`,
  cpSessionFail:
    "No se pudo crear la sesión de planificación. Verifica que opencode esté instalado y que el puerto no esté en uso (usa --port <número>).",
  cpGenerating: "Generando plan… (esto puede tardar unos minutos, ten paciencia)\n",
  cpTimeout: (p) =>
    `La generación del plan superó el tiempo límite (${p.secs}s, ~${Math.round(Number(p.secs) / 60)} min). Auméntalo con --resilience planTimeoutMs=<ms> (p. ej. planTimeoutMs=1800000 para 30 min), o pon "resilience": { "planTimeoutMs": <ms> } en ~/.config/ocloop/ocloop.json — o simplifica el objetivo.`,
  cpNoContent:
    "El modelo no devolvió contenido. Intenta de nuevo con otro objetivo.",
  cpProposedTitle: "PLAN PROPUESTO",
  cpAskApprove: "\n¿Apruebas el plan? [s = guardar · r = guardar y ejecutar · e = editar · n = cancelar]: ",
  cpSaved: (p) => `\n✓ Guardado en ${p.path}`,
  cpRunHint: (p) => `Ahora ejecuta 'ocloop'${p.planArg} para empezar.`,
  cpStarting: "Iniciando OCLoop…",
  cpAskEdit: "¿Qué quieres cambiar o añadir?\n> ",
  cpNoChanges: "Sin cambios.",
  cpCancelled: "Cancelado. No se guardó ningún archivo.",
  cpError: (p) => `\nError generando el plan: ${p.message}`,
  cpPrompt: (p) =>
    [
      "Eres un planificador técnico senior. Genera el contenido de un archivo PLAN.md",
      "para la herramienta OCLoop, que ejecuta las tareas UNA POR UNA desde ese archivo,",
      "cada una en una iteración aislada de un agente de IA.",
      "",
      "Objetivo del usuario:",
      String(p.goal),
      "",
      "Formato OBLIGATORIO de tu respuesta:",
      "- Devuelve SOLO el contenido markdown del PLAN.md, sin texto introductorio ni",
      "  explicaciones ni fences de código alrededor.",
      "- Primera línea: un título '# ...'. Luego una línea breve con el objetivo.",
      "- Agrupa el trabajo en encabezados '## Fase N — título'.",
      "- Cada tarea accionable en su propia línea: '- [ ] descripción concreta y verificable'.",
      "- Una tarea = un paso pequeño y atómico que un agente complete en una iteración.",
      "- Usa '- [MANUAL] ...' para tareas que requieran intervención humana.",
      "- Termina con una sección '## Criterios de aceptación'.",
      "- NO implementes nada ni uses herramientas; solo redacta el plan.",
      "- Escribe el plan en español.",
    ].join("\n"),
  cpRefine: (p) =>
    [
      "Revisa y mejora el siguiente PLAN.md según el feedback del usuario.",
      "Conserva EXACTAMENTE el mismo formato (solo markdown; encabezados",
      "'## Fase N — título'; tareas '- [ ]' / '- [MANUAL]'; '## Criterios de aceptación').",
      "Devuelve SOLO el markdown del PLAN.md actualizado. Escríbelo en español.",
      "",
      "Feedback del usuario:",
      String(p.feedback),
      "",
      "PLAN.md actual:",
      String(p.plan),
    ].join("\n"),

  // --- errores de argparse (cli-args.ts). Localizados porque el locale se
  // pre-scanea de --lang antes de que parseArgs corra. ---
  errArgValueRequired: (p) => `Error: ${p.flag} requiere un valor`,
  errArgUnknown: (p) => `Error: argumento desconocido "${p.arg}"`,
  errArgLang: "Error: --lang requiere 'en' o 'es'",
  errArgPortInteger: "Error: --port requiere un argumento entero",
  errArgPortRange: "Error: --port debe estar en el rango TCP 0..65535",
  errArgModelArg: "Error: --model requiere un argumento",
  errArgModelFormat: (p) =>
    `Error: --model espera proveedor/modelo (por ejemplo openai/gpt-5), se obtuvo "${p.model}"`,

  // --- Errores de parseo de --resilience (CLI) — espejos de `en`. REPARAR.md B3. ---
  errResilienceNeedsArg: "Error: --resilience requiere un argumento key=value",
  errResilienceNoEquals: (p) =>
    `Error: --resilience espera key=value, se obtuvo "${p.raw}"`,
  errResilienceEmptyKey: (p) =>
    `Error: la clave de --resilience está vacía en "${p.raw}"`,
  errResilienceEmptyValue: (p) =>
    `Error: --resilience ${p.key} requiere un valor no vacío`,
  errResilienceUnknownKey: (p) =>
    `Error: clave de resilience desconocida "${p.key}" (válidas: ${p.keys})`,
  errResilienceBool: (p) =>
    `Error: --resilience ${p.key} espera un booleano (true|false), se obtuvo "${p.raw}"`,
  errResilienceInt: (p) =>
    `Error: --resilience ${p.key} espera un entero no negativo (solo decimal), se obtuvo "${p.raw}"`,
  errResilienceMin: (p) =>
    `Error: --resilience ${p.key} debe ser >= ${p.min}, se obtuvo "${p.raw}"`,

  errPlanNotFound: (p) =>
    [
      `Error: archivo de plan no encontrado: ${p.path}`,
      "",
      `OCLoop requiere un archivo de plan (por defecto: ${DEFAULTS.PLAN_FILE}).`,
      `Crea un archivo ${p.path} con una lista de tareas, por ejemplo:`,
      "",
      "  ## Backlog",
      "  - [ ] Descripción de la tarea uno",
      "  - [ ] Descripción de la tarea dos",
      "",
      "Alternativamente, genéralo de forma interactiva con:",
      "  ocloop -c          (o: ocloop --create-plan)",
      "",
    ].join("\n"),
  errPromptNotFound: (p) =>
    [
      `Error: archivo de prompt no encontrado: ${p.path}`,
      "",
      `OCLoop requiere un archivo de prompt (por defecto: ${DEFAULTS.PROMPT_FILE}).`,
      "Este archivo contiene el prompt que se envía a opencode en cada iteración.",
      "Créalo, por ejemplo:",
      "",
      "    Ejecutas UNA iteración de este loop y luego paras.",
      "    Lee {{PLAN_FILE}}, elige la primera tarea sin completar, hazla, haz commit y para.",
      "",
      `O omite --prompt para generar un ${DEFAULTS.PROMPT_FILE} por defecto en esta carpeta.`,
      "",
    ].join("\n"),
  // Espejo de `errPlanEmpty` (en). Ver bloque en `en` para la nota de source.
  errPlanEmpty: (p) =>
    [
      `Error: el archivo de plan está vacío: ${p.path}`,
      "",
      "OCLoop requiere un archivo de plan con al menos una tarea.",
      `El archivo en ${p.path} no contiene líneas de tarea (líneas que empiecen con "- [ ]").`,
      "",
      `Añade una tarea a ${p.path}, por ejemplo:`,
      "",
      "  ## Backlog",
      "  - [ ] Descripción de la tarea uno",
      "  - [ ] Descripción de la tarea dos",
      "",
      "Alternativamente, genéralo de forma interactiva con:",
      "  ocloop -c          (o: ocloop --create-plan)",
      "",
    ].join("\n"),
  // Espejo de `errPromptEmpty` (en). REPARAR.md B2.
  errPromptEmpty: (p) =>
    [
      `Error: el archivo de prompt está vacío: ${p.path}`,
      "",
      "El archivo de prompt existe pero no contiene texto.",
      "Añade las instrucciones a enviar a opencode en cada iteración,",
      `o recrea ${p.path} desde la plantilla por defecto.`,
      "",
    ].join("\n"),
  // Espejo de `errPlanComplete` (en). Ver bloque en `en` para la nota de source
  // completa (rationale del exit 0, no-escritura del tag, etc.).
  errPlanComplete: (p) =>
    [
      `El plan ya está completo: ${p.path}`,
      "",
      "No queda trabajo para OCLoop (cada tarea es [x], [MANUAL] o [BLOCKED]).",
      "",
      "Para entrar al dashboard de todas formas (omitiendo esta comprobación), ejecuta: ocloop --debug",
      "Para añadir más trabajo, edita el archivo de plan y añade una nueva tarea (o ejecuta `ocloop -c`).",
      "",
    ].join("\n"),
  // Espejo de `errCannotReadFile` (en). Ver bloque en `en` para la nota de source.
  errCannotReadFile: (p) =>
    [
      `Error: No se puede leer ${p.path}: ${p.message}`,
      "",
      "El directorio del archivo puede ser inaccesible, o el archivo puede haber sido movido o eliminado.",
      "Verifica que la ruta exista y sea legible, luego inténtalo de nuevo.",
      "",
    ].join("\n"),
  // Espejo de `errCannotCreatePrompt` (en). Ver bloque en `en` para la nota de source.
  errCannotCreatePrompt: (p) =>
    [
      `Error: No se puede crear ${p.path}: ${p.message}`,
      "",
      "El directorio del archivo puede ser inaccesible, estar en un sistema de archivos de solo lectura, o estar lleno.",
      "Verifica que la ruta sea escribible, luego inténtalo de nuevo.",
      "",
    ].join("\n"),
  // Espejo de `errNoTty` (en). Ver bloque en `en` para la nota de source.
  errNoTty: [
    `Error: OCLoop requiere una terminal interactiva (TTY).`,
    "",
    "El stdin o stdout actual no está conectado a una terminal real",
    "(detectado: stdin.isTTY=false o stdout.isTTY=false).",
    "",
    "Esto ocurre normalmente cuando:",
    "  - Canalizas la salida (p. ej. `ocloop | less`)",
    "  - Rediriges la salida (p. ej. `ocloop > out.log`)",
    "  - Ejecutas desde un runner de CI o un sandbox sin TTY",
    "  - Lanzas desde un editor / IDE que no expone una TTY",
    "",
    "Abre una terminal real (Terminal.app, iTerm, gnome-terminal, Windows Terminal, etc.)",
    "y ejecuta el comando allí.",
    "",
  ].join("\n"),
  // Espejo de `errCwdNotWritable` (en). Ver bloque en `en` para la nota de source.
  errCwdNotWritable: (p) =>
    [
      `Error: directorio de trabajo no escribible: ${p.path}`,
      "",
      "OCLoop necesita escribir en este directorio para:",
      "  - guardar el estado del loop (.loop-state.json) para reanudar tras un crash",
      "  - escribir el log de depuración (.loop.log)",
      "  - auto-crear el .loop-prompt.md por defecto si no existe",
      "",
      "El directorio no es escribible para el usuario actual, o el sistema de",
      "archivos subyacente es de solo lectura / está sin espacio. Verifica los",
      "permisos (p. ej. `ls -ld`, `chmod u+w`) o cambia a un directorio escribible,",
      "luego ejecuta el comando de nuevo.",
      "",
    ].join("\n"),

  promptCreated: (p) =>
    `No se encontró ${p.path} en esta carpeta — se creó un prompt de loop por defecto. Edítalo para personalizar lo que se ejecuta en cada iteración.`,
  // Los tokens literales ({{PLAN_FILE}}, [MANUAL], [BLOCKED], comandos, rutas,
  // etiquetas) NO se traducen: se sustituyen/buscan aguas abajo, agnósticos al idioma.
  defaultLoopPrompt:
    [
      "Ejecutas EXACTAMENTE UNA iteración de este loop y luego paras. Haz UNA tarea (o un lote acoplado dentro de una sola fase) y termina tu turno. NO continúes a la siguiente tarea en esta sesión - OCLoop te vuelve a invocar en una sesión nueva para la siguiente tarea, y termina la ejecución por sí mismo una vez que todas las tareas estén hechas.",
      "",
      "Directorio de trabajo: te ejecutas en la carpeta desde donde se lanzó `ocloop` — esa carpeta es tu directorio de trabajo y la raíz del proyecto. Resuelve {{PLAN_FILE}} y CUALQUIER ruta de archivo mencionada en una tarea relativa a ella; no asumas otra raíz ni busques en carpetas superiores u otras a menos que una tarea dé una ruta absoluta.",
      "",
      "Antes de empezar:",
      "1. Ejecuta `git status`. Una iteración anterior pudo haber sido interrumpida.",
      "   - Si hay cambios sin commitear que completan una tarea: verifica que pasan las comprobaciones, haz commit y marca la tarea como hecha.",
      "   - Si son parciales: continúa esa tarea en lugar de empezar una nueva.",
      "2. Lee {{PLAN_FILE}} por completo. Elige la tarea SOLO de {{PLAN_FILE}} - no escanees el código en busca de `[ ]` (los tests, ejemplos y docs contienen falsos positivos).",
      "3. Antes de cualquier búsqueda web o de consultar repos de referencia, revisa `## Research` en AGENTS.md por referencias `@` relevantes y léelas.",
      "",
      "Selección de tarea (CRÍTICO):",
      "- Si no quedan tareas sin completar, no-[MANUAL] y no-[BLOCKED], ve directo a la verificación de Finalización. No inventes trabajo.",
      "- Avanza por las fases EN ORDEN - termina la Fase N antes de empezar la Fase N+1.",
      "- Elige la PRIMERA tarea sin completar de la fase incompleta más temprana.",
      "- Omite los elementos [MANUAL] y [BLOCKED].",
      "- NUNCA agrupes tareas entre fases - cada fase es un límite de commit.",
      "- Dentro de una MISMA fase, agrupa tareas SOLO si están en el mismo archivo Y lógicamente acopladas.",
      "",
      "Ejecuta:",
      "1. Haz los cambios de código para esa única tarea o lote acoplado.",
      "2. Ejecuta las comprobaciones del proyecto usando los comandos exactos de `## Project Operations` en AGENTS.md (p. ej. `bun test`). Si no hay ninguno definido y no existen archivos de test, omite este paso.",
      "3. Haz commit SOLO si las comprobaciones pasan (o si no hay ninguna).",
      "   - Si una comprobación falla y puedes arreglarla en esta iteración, arréglala y vuelve a ejecutarla.",
      "   - Si no puedes arreglarla en esta iteración, revierte SOLO los archivos que cambiaste en esta tarea (`git checkout -- <esos archivos>` y borra solo los archivos nuevos que hayas añadido) — nunca `git checkout -- .` ni `git clean`, que descartarían cambios sin commitear ajenos a la tarea. Marca la tarea `[BLOCKED: <reason>]` y ve a \"Después de completar\".",
      "   - Nunca hagas commit de código que falla. Nunca uses `--no-verify` ni evites los hooks.",
      "4. Haz commit con un mensaje descriptivo, siguiendo las reglas de commit de AGENTS.md (un cambio lógico; nunca `git add .`; respeta `.gitignore`). NUNCA hagas push.",
      "",
      "Después de completar:",
      "1. En {{PLAN_FILE}}, marca una tarea como `[x]` SOLO cuando esté definitivamente completa — sus cambios verificados (las comprobaciones/tests pasan) y commiteados. Nunca marques `[x]` de forma preventiva ni si tienes dudas; déjala en `[ ]`, o usa `[BLOCKED: <reason>]` si no puede avanzar.",
      "2. Debajo de la línea `[x]`, deja una nota corta (1-3 líneas indentadas) SOLO cuando cambiaría el enfoque de una tarea futura: una decisión que restrinja trabajo posterior, un gotcha no obvio, o por qué rechazaste una alternativa obvia. Pon a prueba cada línea: si la siguiente iteración llegaría a la misma conclusión por sí sola, córtala. Escríbela como prosa indentada o sub-bullets simples (p. ej. `  - Decisión: ...`) — NUNCA como líneas `- [ ]`/`- [x]`, que el parser de OCLoop cuenta como tareas incluso indentadas. Escríbela en el idioma de {{PLAN_FILE}}. El diff ya registra qué cambió — no lo repitas. Estas notas son solo del plan; los gotchas permanentes del proyecto van a AGENTS.md (paso 5).",
      "3. Si la tarea que acabas de marcar `[x]` era de RECONOCIMIENTO — su título contiene `(recon)` o `[RECON]` — y descubrió ítems concretos (archivos, endpoints, cuentas, requisitos, hallazgos), inserta una nueva tarea `- [ ]` por ítem descubierto INMEDIATAMENTE DESPUÉS de su línea `[x]` (no al final, no indentada). Este es el ÚNICO caso en que añades líneas `- [ ]`; OCLoop relee {{PLAN_FILE}} en cada iteración y las ejecutará en orden del documento. Reglas: cada tarea insertada nombra su ítem específico (ruta/endpoint/id) y su acción; numéralas `N.Ma`, `N.Mb`, … heredando el número de fase del padre (p. ej. `**1.1a**`); límite de ~20 por tarea recon (para más, agrupa ítems o márcalo como `[MANUAL]`); nunca dupliques una tarea que ya esté pendiente; nunca insertes líneas `- [ ]` por ninguna otra razón.",
      "4. Si descubriste conocimiento EXTERNO (comportamiento de una API, peculiaridades de una librería, detalles de un repo externo), escribe el detalle en `docs/<topic>.md` (crea `docs/` si no existe) y añade una referencia `@docs/...` de una línea bajo `## Research` en AGENTS.md (con el mismo formato que ya tiene). Mantén AGENTS.md ligero - se carga en cada sesión; el detalle vive en `docs/`.",
      "5. Si aprendiste algo sobre ESTE PROYECTO por prueba y error (comandos de build/test, gotchas), regístralo de forma concisa bajo `## Project Operations` en AGENTS.md.",
      "6. Si no pudiste completar una tarea (permisos, servicio externo, necesita intervención humana), añade `[BLOCKED: <reason>]` a su línea en {{PLAN_FILE}} y no la reintentes en esta iteración.",
      "",
      "Verificación de Finalización:",
      "- Cuando cada tarea no-[MANUAL] en {{PLAN_FILE}} esté en `[x]` o `[BLOCKED]`, simplemente termina tu turno — OCLoop detecta la finalización automáticamente (NO necesitas escribir ningún marcador de finalización).",
      "- En caso contrario, termina tu turno ahora - OCLoop inicia la siguiente tarea en una sesión nueva.",
      "- NO omitas tareas automatizables: si una tarea parece difícil pero factible, inténtala.",
    ].join("\n") + "\n",

  badgeStarting: "INICIANDO",
  badgeReady: "LISTO",
  badgeRunning: "EJECUTANDO",
  badgePausing: "PAUSANDO",
  badgePaused: "PAUSADO",
  badgeCooldown: "EN ESPERA",
  badgeStopping: "DETENIENDO",
  badgeStopped: "DETENIDO",
  badgeComplete: "COMPLETO",
  badgeUnknown: "DESCONOCIDO",

  lblModel: "Modelo",
  lblAgent: "Agente",
  lblIter: "Iteración",
  lblTasks: "Tareas",
  lblTime: "Tiempo de Tarea",
  lblAvg: "Prom/tarea",
  lblEta: "Restante",
  lblTaskPrefix: "Tarea: ",
  lblSessionPrefix: "Sesión: ",
  lblWaiting: "esperando...",
  lblGuard: "Salud",
  lblTotal: "Tiempo total",
  lblTaskTokens: "Tokens de Tarea",
  lblCost: "Costo: ",
  lblTaskMore: (p: Params) => `+${p.n} líneas`,

  hintStart: "iniciar",
  hintPause: "pausar",
  hintResume: "reanudar",
  hintCancel: "cancelar",
  hintCommands: "comandos",
  hintQuit: "salir",
  hintRetry: "reintentar",
  hintCopy: "copiar attach",
  hintTerminal: "abrir terminal",
  hintScroll: "mover log",
  hintNewSession: "nueva sesión",
  hintSampleActivity: "actividad de ejemplo",
  hintStartingMsg: "Iniciando el servidor OpenCode…",
  hintPausingMsg: "Pausando tras la tarea actual —",
  hintCooldownMsg: "Rate limit — reintentando, solo espera",
  hintCompleteMsg: "Pulsa cualquier tecla para salir",

  guardSuspect: "Sospechoso",
  guardCheck: "Verificando",
  guardStuck: "Atascado",
  guardRecover: "Recuperando",

  cooldownText: (p) =>
    `Rate limited — reintentando en ${p.secs}s (intento ${p.attempt})`,
  cooldownRetryText: (p) =>
    `Problema de conexión — reintentando en ${p.secs}s (intento ${p.attempt})`,

  actSessionAborted: "Sesión abortada por el usuario",
  actSessionError: (p) => `Error de sesión: ${p.message}`,
  actSessionIdle: "Sesión inactiva",
  actSessionStarted: (p) => `Sesión iniciada: ${p.id}`,
  actDebugSession: (p) => `Sesión de depuración: ${p.id}`,
  actUserMessage: (p) => `Usuario: ${p.text}`,
  cpIgnoredFlags: (p) =>
    `Nota: --create-plan ignora: ${p.flags}. Estos flags solo afectan al bucle del TUI, que no arranca en modo generador de planes.`,
  actRateExhausted: (p) =>
    `Rate limit persistente tras ${p.attempts} intentos — espera al reset de cuota y pulsa R; si reincide, baja el ritmo con --resilience o verifica tu API key/plan`,
  errRatePersistent: (p) =>
    [
      `Rate limit persistente tras ${p.attempts} intentos: ${p.reason}`,
      "Espera a que se renueve la cuota de tu proveedor y pulsa R para reintentar.",
      "Si se repite, baja el ritmo de iteraciones con --resilience, o verifica tu API key/plan.",
      "",
    ].join("\n"),
  actRetryExhausted: (p) =>
    `Error de conexión persistente tras ${p.attempts} intentos — el servidor de opencode pudo haber fallado; reníncialo desde la paleta (Ctrl+P) o pulsa R`,
  errRetryPersistent: (p) =>
    [
      `Error de conexión persistente tras ${p.attempts} intentos: ${p.reason}`,
      "Puede que el servidor de opencode haya fallado. Reinícialo desde la paleta de comandos (Ctrl+P), o pulsa R para reintentar.",
      "",
    ].join("\n"),
  errIterationStart: (p) => `Fallo al iniciar la iteración: ${p.message}`,
  errCreateDebugSession: (p) => `Fallo al crear la sesión de depuración: ${p.message}`,
  errNoProgress: (p) =>
    [
      `Bucle detenido: ${p.count} iteraciones consecutivas comenzaron en la misma tarea sin progreso.`,
      `Tarea: "${p.task}"`,
      `El agente está atrapado reintentando la misma tarea — PLAN.md no avanzó.`,
      "Revisa el plan, corrige el bloqueo, y pulsa R para reanudar.",
      "",
    ].join("\n"),
  errDecomposeFailed:
    "No se pudieron generar subtareas — el agente no devolvió nada utilizable. El plan quedó sin cambios.",
  splitGenerating: "Partiendo la tarea estancada en subtareas…",
  splitApplied: (p) => `Tarea dividida en ${p.count} subtareas — reanudando.`,
  dlgSplitTask: "Partir tarea",
  dlgSplitTitle: "¿Partir la tarea estancada?",
  dlgSplitBody: "Reemplazar la tarea estancada con estas subtareas:",
  dlgSplitAccept: "Aceptar",
  dlgSplitEdit: "Editar",
  dlgSplitReject: "Rechazar",
  dlgSplitEditPrompt: "¿Qué cambiar? Describe cómo ajustar las subtareas:",
  splitRefinePrompt: (p) =>
    [
      "Antes dividiste esta tarea estancada de PLAN.md en subtareas:",
      "",
      `    ${p.task}`,
      "",
      "Subtareas actuales:",
      String(p.subtasks),
      "",
      "Revísalas según este feedback:",
      String(p.feedback),
      "",
      'Responde SOLO con las subtareas revisadas, una por línea como "- [ ] <subtarea>". Sin prosa, sin numeración, sin comentarios. NO edites ningún archivo.',
    ].join("\n"),
  splitPromptTemplate: (p) =>
    [
      "La siguiente tarea de PLAN.md se estancó — varios intentos terminaron sin completarla, probablemente porque es demasiado grande o demasiado vaga:",
      "",
      `    ${p.task}`,
      "",
      "Divídela en 2-5 subtareas más pequeñas y ordenadas que DISTRIBUYAN el trabajo en piezas completables de forma independiente y que en conjunto completen la tarea original. Cada subtarea debe ser concreta, claramente de menor alcance que la original y verificable por separado.",
      "NO edites ningún archivo y NO ejecutes herramientas — solo devuelve la lista.",
      'Responde SOLO con las subtareas, una por línea, cada una como checkbox markdown: "- [ ] <subtarea>". Sin encabezados, sin prosa, sin numeración, sin comentarios.',
    ].join("\n"),
  errServerStart:
    "El servidor de OpenCode no arrancó — verifica que el puerto no esté en uso (usa --port) y que opencode esté instalado, luego pulsa R para reintentar.",
  errUnknown:
    "Error desconocido — si fue un lanzamiento de terminal, revisa el comando de terminal en ocloop.json (Ctrl+P → Elegir terminal por defecto) o elige una terminal instalada.",
  dlgPlanCompleteFallback: "Plan marcado como completado.",
  toastSendPromptFailed: (p) => `Fallo al enviar el prompt: ${p.message}`,
  toastCopyFailed: (p) => `Fallo al copiar: ${p.error}`,
  // Espejos de clipboard (en). REPARAR.md B4.
  errClipboardNotFound: (p) =>
    `No se encontró herramienta de portapapeles. ${p.hint} debería estar disponible.`,
  errClipboardFailed: (p) =>
    `El comando de portapapeles falló (salida ${p.code}${p.stderr ? ": " + p.stderr : ""})`,
  actWake: (p) => `Despertar tras ${p.secs}s suspendido — reconectando`,
  actReconciled: (p) => `Reconciliado: sesión ${p.result}, avanzando`,
  actGuardRestart: "Guardián: servidor sin respuesta, reiniciando",
  actGuardReconnect: "Guardián: reconectando SSE",
  actGuardSynthIdle: "Guardián: sesión inactiva/ausente, avanzando",
  actGuardAbort: "Guardián: sesión bloqueada, abortando y reintentando",
  actEvalRetry: (p) => `Eval falló para "${p.task}" — reintentando con retroalimentación`,
  actEvalBlocked: (p) => `Eval falló para "${p.task}" — marcada [BLOCKED]`,
  errGuardExhausted: (p) =>
    [
      `OCLoop no pudo recuperar la sesión atascada tras ${p.attempts} intentos.`,
      `(Sin actividad ${p.secs}s; último estado: ${p.verdict}; motivo: ${p.reason})`,
      "Reinicia el servidor OpenCode desde la paleta de comandos (Ctrl+P), o pulsa R, y luego reanuda.",
      "",
    ].join("\n"),
  actResuming: (p) => `Reanudando sesión ${p.id} (iter ${p.iteration})`,
  actContinuing: (p) => `Sesión previa ${p.verdict}; continuando el loop`,
  // PLAN.md fue editado entre el crash y la reanudación. La advertencia es
  // informativa; el loop continúa, pero el usuario ve una línea en el log de
  // actividad y en .loop.log para confirmar que el cambio fue intencional.
  // "kind" distingue los tres sub-casos (completed, reordered, removed).
  actResumeMisalign: (p) =>
    `Reanudación: PLAN.md cambió desde el crash (${p.kind}) — estaba en "${p.saved}", ahora empieza en "${p.current ?? "—"}"`,

  cmdCopyAttach: "Copiar comando de conexión",
  cmdChooseTerminal: "Elegir terminal por defecto",
  cmdChooseTheme: "Elegir tema",
  cmdToggleScrollbar: "Alternar barra de desplazamiento",
  cmdStart: "Iniciar iteraciones",
  cmdPause: "Pausar el loop",
  cmdResume: "Reanudar el loop",
  cmdCancelPause: "Cancelar la pausa pendiente",
  cmdRestartServer: "Reiniciar el servidor OpenCode",
  cmdPermissions: "Permisos",
  cmdQuit: "Salir de OCLoop",
  cmdAbout: "Acerca de",
  // --- Overlay de ayuda (se abre con la tecla ?) ---
  helpTitle: "Atajos y ayuda",
  helpDismissHint: "pulsa cualquier tecla para cerrar",
  helpIntro:
    "OCLoop ejecuta un agente de IA una vez por tarea de tu PLAN.md y luego para. Pulsa S para iniciar una iteración del loop; pulsa Ctrl+P en cualquier momento para la paleta de comandos completa.",
  helpSectionLoop: "Control del loop",
  helpSectionSession: "Sesión y terminal",
  helpSectionDebug: "Modo debug",
  // --- Overlay Acerca de ---
  aboutTitle: "Acerca de OCLoop",
  aboutTagline: "Un loop desatendido para OpenCode: ejecuta tu PLAN.md una tarea a la vez, sobrevive a rate limits, suspensión y caídas, y sigue hasta terminar el plan.",
  aboutRuntime: "Runtime: Bun + TypeScript · 20 planes de ejemplo incluidos",
  aboutCreatedBy: "Creado originalmente por Fayçal Mitidji (d3vr)",
  aboutMaintainedBy: "Fork mantenido por DragonJAR SAS",
  aboutServices: "Expertos en seguridad informática, validación proactiva y seguridad ofensiva",
  aboutRepo: "Código, documentación y planes de ejemplo",
  catView: "Vista",
  catPreview: "Vista previa",
  catAppearance: "Apariencia",
  catLanguage: "Idioma",
  catHelp: "Ayuda",
  toastLanguageChanged: "Idioma cambiado",
  toastRestarting: "Reiniciando el servidor OpenCode…",
  // Spanish mirror of toastConfigSaveFailed above.
  toastConfigSaveFailed:
    "Fallo al guardar la configuración — el cambio no se mantendrá. Verifica que ~/.config/ocloop/ocloop.json sea escribible.",
  chaosKill: "Chaos: matar servidor",
  chaosKillDone: "Chaos: servidor terminado",
  chaosRevive: "Chaos: revivir servidor",
  chaosReviveDone: "Chaos: servidor revivido",
  chaosFreeze: "Chaos: congelar sesión",
  chaosFreezeDone: "Chaos: sesión congelada",
  chaosUnfreeze: "Chaos: descongelar sesión",
  chaosUnfreezeDone: "Chaos: sesión descongelada",
  chaosRateLimit: "Chaos: inyectar rate limit",
  chaosRateLimitDone: "Chaos: rate limit inyectado",
  // Comandos "Vista previa" (solo debug) — montan un estado/diálogo para captura.
  previewRunning: "Vista previa: dashboard en marcha",
  previewPaused: "Vista previa: en pausa",
  previewCooldown: "Vista previa: cooldown por rate-limit",
  previewComplete: "Vista previa: plan completo",
  previewError: "Vista previa: error / detención",
  previewDecompose: "Vista previa: dividir tarea atascada",
  previewInvalidAgent: "Vista previa: agente inválido",
  previewTerminalError: "Vista previa: fallo al abrir la terminal",
  previewCompleteSummary:
    "Se implementó el backoff de rate-limit, la reconciliación de suspensión/despertar y la recuperación del watchdog. Las 12 tareas del plan están completas; tests en verde.",
  previewErrorMessage:
    "401 Unauthorized — el proveedor rechazó la API key. Revisá la autenticación de OpenCode y reintentá.",

  dlgQuitTitle: "¿Salir de OCLoop?",
  dlgQuitMsg: "¿Seguro que quieres salir?",
  dlgQuitConfirm: "Salir",
  dlgCancel: "Cancelar",
  dlgResumeTitle: "¿Reanudar la ejecución anterior?",
  dlgResumeMsg: (p) =>
    `Se encontró una ejecución interrumpida en la iteración ${p.iteration}. ¿Reanudarla?`,
  dlgResumeConfirm: "Reanudar",
  dlgResumeCancel: "Empezar de cero",
  dlgConfirm: "Confirmar",
  dlgRetry: "Reintentar",
  dlgEscToQuit: "esc para salir",
  dlgNoResults: "Sin resultados",
  dlgSearchPlaceholder: "Buscar...",
  dlgSendPrompt: "Enviar prompt",
  dlgPromptHint: "Enter enviar · Esc cancelar",
  dlgPlanComplete: "Plan completado",
  dlgCompletedIn: (p) =>
    `Completado en ${p.iterations} ${Number(p.iterations) === 1 ? "iteración" : "iteraciones"} (${p.time})`,
  dlgDismiss: "Descartar",
  dlgInvalidAgent: "Agente inválido",
  dlgAgentNotFound: (p) => `Agente "${p.agent}" no encontrado.`,
  dlgAvailableAgents: "Agentes disponibles:",
  dlgUseDefault: "Usar por defecto",
  dlgTerminalFailed: "Fallo al abrir la terminal",
  dlgEditConfig: "Editar config: ",
  dlgAttachCommand: "Comando de conexión:",
  dlgCopy: "Copiar",
  dlgClose: "Cerrar",
  dlgConfigureTerminal: "Configurar terminal",
  dlgCustomTerminal: "Terminal personalizada",
  dlgCommandColon: "Comando: ",
  dlgInstalledTerminals: "Terminales instaladas",
  dlgCustomEllipsis: "Personalizada...",
  dlgManualConfig: "Configuración manual",
  dlgTerminalOptHint: "Abre una terminal conectada a tu sesión",
  dlgCustomOptHint: "Define un comando de terminal personalizado",
  // --- Permisos (diálogo) ---
  dlgPermissionsTitle: "Permisos",
  dlgPermissionsHint: "Se aprueban solos para que el bucle no se cuelgue. Desmarca para que OpenCode pregunte.",
  dlgPermissionsRestart: "Permisos cambiados — reiniciando el servidor",
  permEdit: "Editar archivos",
  permEditDesc: "Escribir o modificar archivos del proyecto",
  permBash: "Ejecutar comandos",
  permBashDesc: "Ejecutar comandos de bash / terminal",
  permWebfetch: "Consultar la web",
  permWebfetchDesc: "Descargar URLs con webfetch",
  permDoomLoop: "Doom loop",
  permDoomLoopDesc: "Herramienta interna de iteración de OpenCode",
  permExternalDirectory: "Directorios externos",
  permExternalDirectoryDesc: "Alcanzar rutas fuera de la raíz del proyecto",
  paletteTitle: "Paleta de comandos",
  palettePlaceholder: "Escribe un comando...",
  kbSelect: "Seleccionar",
  kbNavigate: "Navegar",
  kbPreview: "Vista previa",
  kbSave: "guardar",
  routingStepTitle: (p) => `Paso ${p.n}/${p.total} — ${p.label}`,
  routingPlaceholder: "Buscar modelos...",
  routingSkip: "Saltar",
  routingHeavyLabel: "Modelo principal (heavy)",
  routingJudgeLabel: "Modelo juez (judge)",
  routingCheapLabel: "Modelo económico (cheap)",
  kbSwitch: "cambiar",
  kbBack: "atrás",
  dlgCmdPlaceholderHelp: "Usa {cmd} como marcador del comando de conexión",
  toastNoSessionPrompt: "No hay sesión activa para enviar el prompt",
  toastCopied: "Copiado al portapapeles",
  toastSampleInserted: "Actividad de ejemplo insertada",
  toastNoSessionAttach: "No hay sesión activa para conectar",
  sampleSessionStarted: "Sesión iniciada",
  sampleUserMessage: "Usuario: Implementar la funcionalidad X",
  sampleAssistantMessage: "Asistente: Puedo ayudarte con eso",
  sampleReasoning: "Analizando la estructura del código...",
  sampleFileRead: "Leyendo src/App.tsx",
  sampleFileEdit: "Modificado src/components/Button.tsx (+15, -3)",
  sampleTask: "Implementando selector de modo oscuro",
  sampleError: "Falló el build: error de tipos en Button.tsx",
  sampleSessionIdle: "Sesión inactiva: esperando entrada",

  logLblStart: "iniciando",
  logLblIdle: "esperando",
  logLblTask: "trabajando",
  logLblEdit: "editando",
  logLblRead: "leyendo",
  logLblTool: "ejecutando",
  logLblYou: "preguntando",
  logLblAssistant: "respondiendo",
  logLblReason: "razonando",
  logLblEvent: "procesando",
}

// Reactive locale: a Solid signal so the TUI re-renders live when the language
// is toggled from the command palette. Reading `t()` inside a component's
// reactive scope tracks this; reading it from plain CLI code just returns the
// current value.
const [localeSignal, setLocaleSignal] = createSignal<Locale>("en")

/** Set the active locale (reactive — switches the whole UI live). */
export function setLocale(locale: Locale): void {
  setLocaleSignal(locale)
}

/** Get the active locale (reactive accessor read). */
export function getLocale(): Locale {
  return localeSignal()
}

/** Translate a key for the active locale, with optional interpolation params. */
export function t(key: MessageKey, params?: Params): string {
  const table = localeSignal() === "es" ? es : en
  const value = table[key]
  return typeof value === "function" ? value(params ?? {}) : value
}
