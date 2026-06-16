Now I have a thorough understanding of the codebase. Let me compile the PLAN.md.

# OCLoop — Exhaustive Execution-Flow Audit & Fix Plan

Audit all execution flows (with/without parameters, edge cases, invalid inputs, error scenarios), validate expected behavior, and document all logic bugs, coding errors, unhandled exceptions, code duplication, and inefficiencies. Fixes are documented in MEJORAS.md — not applied.

## Phase 1 — CLI Argument Parsing & Validation

- [x] Audit `parseArgs` for every flag combination: long/short forms, missing required values, empty strings, duplicate flags, unknown flags
- [x] Verify `--port` rejects non-numeric, negative, zero, float, and >65535 values
- [x] Verify `--model` rejects strings without `/`, with multiple `/`, empty provider/model, and whitespace
- [x] Verify `--lang` rejects values other than `en`/`es` (case sensitivity, empty string)
- [x] Verify `--resilience key=value` with: unknown key, non-numeric value for numeric keys, empty value, value with `=` signs, boolean keys with non-boolean values
- [x] Verify `--prompt` and `--plan` with: non-existent paths, directories, empty filenames, relative vs absolute paths
- [x] Verify `--create-plan` combined with `--run`, `--debug`, `--resume`, and other conflicting/combined flags
- [x] Verify `--resume` combined with `--run`, `--create-plan`, and standalone behavior
- [x] Document: `requireValue` treats a value starting with `-` (except lone `-`) as missing — verify this rejects `--plan --debug` correctly but allows `--plan -` (a valid filename)
- [x] Check if `parseArgs` is idempotent — calling it twice should produce the same result

## Phase 2 — Plan File Parsing & Progress Tracking

- [x] Audit `parseTaskLine` for every task marker variant: `- [x]`, `- [X]`, `- [x ]` (trailing space), `- [ ]`, `- [ ] [MANUAL]`, `- [MANUAL]`, `- [BLOCKED:reason]`, `- [ BLOCKED ]`, `- [blocked]` (case)
- [x] Verify `- [MANUAL]` without description is classified correctly (manual vs not-a-task)
- [x] Verify `- [BLOCKED:]` with empty reason vs `- [BLOCKED]` without colon
- [x] Verify `- [BLOCKED: some reason ]` with spaces in reason
- [x] Verify lines that start with `- [` but have no closing bracket
- [x] Verify lines like `- [ ] ` (checkbox with trailing spaces but no description) — currently returns `not-a-task`; confirm this is intentional
- [x] Verify `parsePlan` with an empty file, file with no tasks, file with only headings, file with only completed/blocked/manual tasks
- [x] Verify `percentComplete` math: denominator = total - manual - blocked; what if total = 0? (returns 100% — confirm this is correct)
- [x] Verify `percentComplete` when all tasks are manual/blocked (denominator = 0, returns 100%)
- [x] Verify `percentComplete` with only one pending task (0 completed / 1 automatable = 0%)
- [x] Audit `parsePlanComplete` for: no tags, single-line `<plan-complete>text</plan-complete>`, multi-line with nested content, tags inside code fences, multiple occurrences (should use last), tags with attributes, unclosed `<plan-complete>` tag
- [x] Verify `getCurrentTaskFromContent` returns the FIRST pending task even if tasks are not in order
- [x] Verify `parsePlanFile` with a file that doesn't exist (throws vs returns null)
- [x] Verify `refreshPlan` in App.tsx silently ignores errors — is this correct behavior for all error types?

## Phase 3 — State Machine (useLoopState)

- [x] Audit every state transition in `loopReducer` for every possible current state + action combination
- [x] Verify: `server_ready` from non-starting states is a no-op (correct)
- [x] Verify: `start` from `running`/`paused`/`cooldown`/`debug` states is a no-op (correct)
- [x] Verify: `toggle_pause` from `cooldown`, `error`, `stopped`, `starting`, `complete` states is a no-op
- [x] Verify: `session_idle` from `cooldown`, `stopped`, `error` states is a no-op
- [x] Verify: `rate_limited` from `paused`, `cooldown`, `error`, `debug` states is a no-op
- [x] Verify: `resume_cooldown` from non-cooldown states is a no-op
- [x] Verify: `iteration_started` increments iteration correctly from both `running("")` and `paused` states
- [x] Verify: `plan_complete` from `cooldown` preserves iteration count
- [x] Verify: `plan_complete` from `error` always sets iterations to 0 — is this correct? The plan might have been running for many iterations before erroring
- [x] Verify: `quit` from `stopping`/`complete`/`error` (non-recoverable) is a no-op — user must be able to quit from error state via the quit dialog
- [x] Verify: `retry` only works from `error` with `recoverable=true` — non-recoverable errors are permanent
- [x] Document: `error` action from `cooldown` state transitions to error — does this lose the cooldown timer? The `clearCooldownTimers` is called in `enterCooldown` exhaustion path but NOT when an `error` dispatch comes from an external source while in cooldown
- [x] Verify: `iteration_started` from `paused` state — the paused state has no `sessionId`, so `state.iteration + 1` uses the paused iteration number; confirm this matches `startIteration`'s dispatch

## Phase 4 — Session Lifecycle & Iteration Driver

- [x] Audit `startIteration` for: server not ready, createSession failure, sendPromptAsync failure, prompt file missing, prompt file empty
- [x] Verify: `startingIteration` guard prevents double-creation on rapid state transitions — what if the guard is true but the effect fires again before it's cleared?
- [x] Verify: `checkPlanComplete` is called before creating a session — if plan is already complete, does it dispatch `plan_complete` and return without creating a session?
- [x] Verify: `minIterationGapMs` uses monotonic clock — confirm `lastIterationStartAt` is set with `monotonicNow()` and gap calculation uses `monotonicNow()`
- [x] Verify: `sendPromptAsync` failure path calls `handleIterationError` — does this cover rate limits, timeouts, and network errors?
- [x] Verify: `refreshPlan()` is called after prompt is sent — what if the plan file is being written by OpenCode at the same time (partial read)?
- [x] Document: `startIteration` reads the prompt file but does NOT read the plan file for the prompt content — only the `{{PLAN_FILE}}` placeholder is replaced. Verify the default `.loop-prompt.md` references this placeholder

## Phase 5 — Rate Limit & Cooldown Handling

- [x] Audit `enterCooldown` for: `rateLimitAttempts` counter increment and reset, `computeBackoff` with various attempt numbers, `Retry-After` header handling
- [x] Verify: `clearCooldownTimers` is called in `handleQuit` and in the exhaustion path — is it also called when a cooldown is interrupted by an `error` dispatch?
- [x] Verify: `cooldownTicker` interval is cleaned up on cooldown resume — what if `resume_cooldown` dispatch happens before the `setTimeout(cooldownTimer)` fires? Both are cleared in `clearCooldownTimers`
- [x] Verify: `cooldownRemainingMs` signal updates every 250ms — confirm the countdown displays correctly when `monotonicNow()` is used
- [x] Verify: rate limit that arrives during pausing state is handled — `enterCooldown` is called for `pausing` state in SSE handler, and the reducer accepts `rate_limited` from `pausing`
- [x] Verify: transient errors (not rate limits) also enter cooldown via `handleIterationError` — confirm the cooldown state display shows "retry" instead of "rate limit"
- [x] Verify: `maxRateLimitRetries` exhaustion resets `rateLimitAttempts` to 0 after dispatching error — is this correct? The error state is recoverable, so retry would start fresh

## Phase 6 — Watchdog & Health Probes

- [x] Audit `useWatchdog` hook for: tick interval, suspect/confirm thresholds, recovery actions, max recovery attempts
- [x] Verify: watchdog `isActive` probe returns true only for `running`/`pausing` states with a non-empty sessionId — confirm this matches `getActiveSessionId`
- [x] Verify: watchdog stops and starts correctly based on `loop.isRunning()` — paused and cooldown states should NOT have the watchdog running
- [x] Verify: `notifyWake` resets the heartbeat baseline — confirm this prevents immediate re-triggering after a server restart
- [x] Verify: `notifyIdle` resets the watchdog — called on `session_idle` and on `reconcileAndAdvance` returning `idle`/`missing`
- [x] Verify: `abortAndRetry` in watchdog actions dispatches `session_idle` — this re-enters the iteration driver; confirm there's no infinite loop if the session keeps failing
- [x] Verify: `restartServer` in watchdog actions — if the server fails to restart, does the watchdog escalate to `fail`?

## Phase 7 — SSE Event Handling

- [x] Audit `useSSE` for: connection lifecycle, reconnection logic, event filtering by sessionId, error classification
- [x] Verify: `classifySessionError` correctly categorizes rate limits (429), transient errors (5xx, timeouts), auth errors, and fatal errors
- [x] Verify: SSE `onSessionError` ignores errors from stale sessions — confirm the sessionId comparison is correct
- [x] Verify: SSE `onSessionIdle` ignores idle events from stale sessions — confirm this matches the behavior in `onSessionError`
- [x] Verify: SSE reconnection threshold (6 attempts) triggers a server restart — is this configurable?
- [x] Verify: `sse.reconnect()` is called on wake, on watchdog recovery, and on server restart — no double-reconnection issues?
- [x] Verify: heartbeat is recorded on every SSE event type (todo_updated, file_edited, step_finish, tool_use, message_text, reasoning) — confirm no events are missed

## Phase 8 — Crash Recovery & Persistence

- [x] Audit `saveLoopState` for: atomic write (tmp + rename), data completeness, error handling
- [x] Verify: `loadLoopState` returns null for: missing file, invalid JSON, wrong version, missing fields
- [x] Verify: `clearLoopState` never throws — even on permission errors or missing files
- [x] Verify: persistence happens on every state transition to `running`/`pausing`/`paused`/`cooldown` — confirm this is frequent enough for crash recovery
- [x] Verify: `doResume` correctly handles: session still working, session idle, session missing, session rate-limiting
- [x] Verify: `doResume` restores `rateLimitAttempts` from persisted state — confirm the circuit breaker continues from where it left off
- [x] Verify: `--resume` flag sets `resilience.resume = true` which triggers auto-resume in `initializeSession` — what if there's no persisted state?
- [x] Document: `clearLoopState` is called on clean quit AND on plan completion — verify this is intentional (prevents accidental re-resume after a successful run)

## Phase 9 — Sleep Detection & Power Management

- [x] Audit `createSleepDetector` for: threshold detection accuracy, negative gap handling, timer cleanup
- [x] Verify: `handleWake` correctly reconnects SSE, reconciles session, and handles cooldown state
- [x] Verify: sleep detector stops on cleanup — `onCleanup` calls `sleepDetector?.stop()`
- [x] Verify: `caffeinate` starts/stops based on `loop.isRunning() || loop.isCooldown()` — confirm this covers all active states
- [x] Verify: power manager (`createPowerManager`) correctly calls `caffeinate` on macOS and is a no-op on other platforms

## Phase 10 — Plan Generator (`--create-plan`)

- [x] Audit `runCreatePlan` for: server startup failure, session creation failure, prompt send failure, timeout handling
- [x] Verify: `stripCodeFences` correctly strips ````markdown\n...\n`````, ````\n...\n````, and non-fenced content
- [x] Verify: `extractLastAssistantText` returns empty string for: no messages, no assistant messages, messages with empty parts
- [x] Verify: `hasNewAssistantReply` correctly distinguishes new replies from pre-existing ones using `assistantCountBefore`
- [x] Verify: The plan generator polling loop exits on: timeout, user cancel, user approve, and all error paths
- [x] Verify: `planTimeoutMs` is configurable via `--resilience planTimeoutMs=<ms>` — confirm this overrides the default 10 minutes
- [x] Verify: The generator correctly closes the server in the `finally` block — even on timeout or error
- [x] Verify: Empty goal (`prompt()` returns empty string) exits with code 1 and shows an error

## Phase 11 — Terminal Launcher & Clipboard

- [x] Audit `detectInstalledTerminals` for: platform differences (macOS/Linux/Windows), PATH detection, terminal name matching
- [x] Verify: `launchTerminal` correctly constructs commands for each terminal type and handles launch failures
- [x] Verify: `getAttachCommand` produces valid commands for different server URLs (localhost, 127.0.0.1, custom ports)
- [x] Verify: `copyToClipboard` works on macOS, Linux, and Windows — falls back gracefully if no clipboard utility is available

## Phase 12 — Configuration & i18n

- [x] Audit `loadConfig` for: missing file, invalid JSON, null JSON, array JSON, partial config, unknown keys
- [x] Verify: `saveConfig` writes atomically (tmp + rename) and creates directory if needed
- [x] Verify: `resolveResilience` merges correctly: defaults < file config < CLI overrides — undefined values in any layer are skipped
- [x] Verify: `isLocale` accepts only `en` and `es` — confirm case sensitivity
- [x] Audit i18n strings for: missing keys, mismatched interpolation variables between en and es, empty strings
- [x] Verify: `setLocale` persists to config file on toggle — confirm the config is saved and reloaded correctly

## Phase 13 — Chaos Module & Debug Mode

- [x] Audit `createChaos` for: enable/disable conditions (`--chaos` flag AND `--debug` flag required)
- [x] Verify: Chaos fault injection (`killServer`, `reviveServer`, `freezeSession`, `unfreezeSession`, injected 429) only activates when both flags are set
- [x] Verify: Debug mode (`--debug`) skips plan file validation, creates sessions without prompts, and allows manual interaction
- [x] Verify: Debug keybindings (N, P, I, Q, T) work correctly in debug state
- [x] Verify: Debug mode does NOT persist loop state (`if (props.debug) return` in persistence effect)

## Phase 14 — Error Classification & Recovery

- [x] Audit `classifySessionError` (in `useSSE`) for all error types: rate limit (429), transient (5xx, timeout, network), auth (401/403), fatal (other)
- [x] Verify: Rate limit errors during pausing state are handled — `enterCooldown` is called, not just for running state
- [x] Verify: Auth errors (401/403) are NOT recoverable — they surface as permanent errors requiring user intervention
- [x] Verify: Server startup errors transition to error state with `recoverable: true` — user can retry
- [x] Verify: SSE connection errors that exceed the reconnection threshold trigger a server restart
- [x] Verify: `handleIterationError` classifies errors correctly before dispatching — rate limit vs transient vs permanent

## Phase 15 — Edge Cases & Race Conditions

- [x] Verify: No race between `startIteration` guard and effect re-trigger — `startingIteration` is set before async work and cleared in `finally`
- [x] Verify: No race between `session_idle` SSE event and `reconcileAndAdvance` — both can trigger the same dispatch
- [x] Verify: Double `session_idle` events (from watchdog reconcile AND from SSE) don't create duplicate iterations — the `running("")` check prevents this
- [x] Verify: `handleQuit` is idempotent — called from both SIGINT handler and Q key; confirm it doesn't double-abort or double-disconnect
- [x] Verify: Plan file edits by OpenCode trigger `refreshPlan()` — what if the edit is in-progress (partial file)?
- [x] Verify: `sse.reconnect()` called from multiple places (wake, watchdog, SSE exhaustion) — no double-connection
- [x] Verify: `server.restart()` called during an ongoing restart — is it idempotent?
- [x] Verify: `onMount` vs `createEffect` ordering — server ready effect fires before session initialization completes

## Phase 16 — Code Duplication & Inefficiency

- [ ] Identify and document duplicated error handling patterns in `handleIterationError` and SSE `onSessionError`
- [ ] Identify and document duplicated client creation pattern (`createClient(url)` called in many places)
- [ ] Identify and document duplicated plan file path resolution (`props.planFile || DEFAULTS.PLAN_FILE` appears multiple times)
- [ ] Identify and document duplicated session ID resolution (`sessionId() || lastSessionId()`)
- [ ] Identify and document any unnecessary re-renders caused by signal reads in effects that don't depend on those signals
- [ ] Audit `createClient` cache: verify the eviction policy (oldest half) is correct and the cache doesn't grow unbounded in long sessions with many server restarts
- [ ] Document any `console.log`/`console.error` calls that should use `log` instead for consistency

## Phase 17 — Unhandled Exceptions & Missing Guards

- [ ] Verify: `main().catch()` handles all unhandled promise rejections — confirm the `unhandledRejection` handler in index.tsx covers TUI mode
- [ ] Verify: `restoreTerminal()` is called on every exit path including `process.exit(1)` in error handlers
- [ ] Verify: No unguarded `await` calls that could reject without a try/catch in App.tsx effect handlers
- [ ] Verify: `Bun.file().exists()` and `Bun.file().text()` calls are properly awaited and error-handled
- [ ] Verify: `Bun.write()` in `validatePrerequisites` handles permission errors
- [ ] Verify: `withTimeout` always cleans up its timer even if the task throws synchronously
- [ ] Verify: `shutdownManager` handles the case where `handler` throws AND the failsafe timer fires simultaneously
- [ ] Verify: The `require("../../package.json").version` in cli-args.ts works correctly in the built output (Bun bundling)

## Phase 18 — Test Coverage Gaps

- [ ] Review existing test files (api.test.ts, cli-args.test.ts, plan-parser.test.ts, etc.) for coverage of: error paths, edge cases, boundary values
- [ ] Identify flows with NO test coverage: sleep-detector (has test), backoff (has test), loop-state-store (has test), layout (has test)
- [ ] Identify flows with INCOMPLETE test coverage: useLoopState (state machine transitions), useSSE (reconnection, error classification)
- [ ] Document which integration scenarios are untestable without a real OpenCode server mock

## Acceptance Criteria

- Every execution flow (normal, error, edge case) has been traced through the code and documented
- All logic bugs, coding errors, and potential unhandled exceptions are listed with file:line references
- All code duplication and inefficiency patterns are identified
- All fixes are documented in MEJORAS.md with: problem description, affected files/lines, proposed solution, and severity
- No code changes are applied — this is audit-only with documentation output
