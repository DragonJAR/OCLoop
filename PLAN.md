I now have a thorough understanding of the codebase. Let me produce the PLAN.md.

# OCLoop Exhaustive Execution-Flow Audit & Fix Plan

Objective: Analyze every execution path (parameterized, edge-case, error) in the OCLoop codebase, find logic bugs, unhandled exceptions, duplicated code, and inefficiencies, then fix them following DRY and existing architecture.

## Phase 1 — Plan parser edge cases & robustness

- [x] Fix `parseTaskLine` to reject `- [ ]` with only whitespace inside brackets as a task when the description is empty (currently returns `{ type: "pending", description: "" }` for `- [ ]` with trailing spaces)
- [x] Fix `parsePlan` percent calculation: when all tasks are MANUAL, `denominator` becomes 0 and returns 100 — verify this is the intended semantic (it is, but add a comment explaining it; the test already asserts 100)
- [x] Add test for `parseTaskLine` with `- [BLOCKED: multi word reason here] Task` to verify `blockedReason` captures the full multi-word reason
- [x] Add test for `parseTaskLine` with `- [BLOCKED]` (no trailing description) — verify it returns `description: ""`
- [x] Add test for `parsePlanComplete` with nested `<plan-complete>` tags (one real, one inside a blockquote)
- [x] Add test for `getCurrentTaskFromContent` when all tasks are MANUAL or BLOCKED (should return null)
- [x] Verify `isPlanComplete` handles a file that doesn't exist gracefully (returns `false`, which it does — confirm test)

## Phase 2 — State machine gaps & transitions

- [ ] Add test for `session_idle` dispatched on `running` state with `sessionId === ""` — verify it returns the SAME state object (idempotency guard for redundant idles)
- [ ] Add test for `plan_complete` from `cooldown` state — verify iteration is preserved
- [ ] Add test for `plan_complete` from `error` state — verify iterations = 0
- [ ] Add test for `rate_limited` from `paused` state — verify it is ignored (returns same state)
- [ ] Add test for `resume_cooldown` from a non-cooldown state (e.g. `running`) — verify it is ignored
- [ ] Add test for `error` transition from `cooldown` state — verify it works
- [ ] Add test for `error` transition from `debug` state — verify it works
- [ ] Add test for `server_ready_debug` from non-`starting` state — verify it is ignored
- [ ] Add test for `new_session` from non-`debug` state — verify it is ignored
- [ ] Add test for `quit` from `cooldown` state — verify it transitions to `stopping`

## Phase 3 — CLI argument parsing edge cases

- [ ] Add test for `--port 0` — verify it's accepted (port 0 is valid TCP, means "let the OS pick")
- [ ] Add test for `--model` with extra slash like `a/b/c` — verify it's rejected (currently `MODEL_RE` requires exactly one slash, but `slash <= 0` catches no-slash, `slash === model.length - 1` catches trailing-slash — but `a/b/c` has slash at index 1 which is valid per regex `^[^\s/]+/[^\s/]+$`; verify this rejects it since the regex doesn't match three segments)
- [ ] Add test for `--resilience` with boolean key set to `"0"` — verify `caffeinate=0` is accepted and mapped to `false`
- [ ] Add test for `--resilience` with zero numeric value — verify `backoffBaseMs=0` is accepted (0 is a valid non-negative integer)
- [ ] Verify `parseArgs` doesn't mutate `argv` (it uses `let i` incrementing — confirm no side effects)

## Phase 4 — API layer error handling & robustness

- [ ] Add test for `assertResponse` with `result.response` present but `ok: false` — verify it throws with status code
- [ ] Add test for `assertResponse` with `result.response` undefined and `result.error` being a non-Error object — verify message extraction
- [ ] Add test for `reconcileSession` with a session status type that is neither `idle`, `busy`, nor `retry` — verify it returns `"unknown"`
- [ ] Add test for `createClient` cache eviction: after inserting `MAX_CACHE_SIZE + 1` entries, verify the oldest half was evicted
- [ ] Add test for `toSdkModel` with `undefined` input — verify it returns `undefined`
- [ ] Add test for `toSdkModel` with non-string input (already an object) — verify it passes through
- [ ] Verify `sendPromptAsync` handles the case where `assertResponse` passes but the response is otherwise empty (it currently just calls `assertResponse` and returns void — confirm this is correct per the SDK contract)

## Phase 5 — SSE & watchdog edge cases

- [ ] Add test for `classifySessionError` with each error kind (`rate_limit`, `aborted`, `auth`, `transient`, `fatal`) using representative error objects
- [ ] Add test for `classifySessionError` with a string error — verify kind detection
- [ ] Add test for `classifySessionError` with `null` — verify it returns kind `fatal`
- [ ] Add test for `extractRetryAfter` with `retry-after` header in seconds — verify conversion to ms
- [ ] Add test for `extractRetryAfter` with a duration string in the message ("retry after 2 minutes") — verify it returns 120 seconds
- [ ] Add test for watchdog `tick()` when `isActive()` returns false — verify health stays `HEALTHY` and no probes run
- [ ] Add test for watchdog `tick()` when heartbeat is recent (under suspectMs) — verify health stays `HEALTHY`
- [ ] Add test for watchdog `tick()` confirming path: server ping fails → `server_hung` recovery
- [ ] Add test for watchdog `tick()` confirming path: server ping succeeds, reconcile returns `idle` → `synthesizeIdle` called, recovery attempts reset
- [ ] Add test for watchdog `tick()` confirming path: reconcile returns `unknown` → `server_hung` recovery
- [ ] Add test for watchdog circuit breaker: after `maxRecoveryAttempts + 1` ticks, `actions.fail` is called and `recoveryAttempts` resets to 0
- [ ] Add test for watchdog `notifyIterationStart` NOT resetting `recoveryAttempts` (preventing infinite budget)
- [ ] Add test for watchdog `recordHeartbeat` resetting recovery attempts to 0 and health to HEALTHY

## Phase 6 — Backoff & timeout edge cases

- [ ] Add test for `computeBackoff` with `retryAfterSeconds` — verify it returns exactly `retryAfterSeconds * 1000` (ignoring base/max/jitter)
- [ ] Add test for `computeBackoff` with `retryAfterSeconds = 0` — verify it returns 0
- [ ] Add test for `computeBackoff` with `retryAfterSeconds = NaN` — verify it falls through to exponential backoff
- [ ] Add test for `computeBackoff` with very large `attempt` (e.g. 100) — verify it caps at `max` instead of overflowing to Infinity
- [ ] Add test for `computeBackoff` with `jitter: false` — verify it returns `Math.round(min(max, base * 2^attempt))`
- [ ] Add test for `computeBackoff` with negative `attempt` — verify it's clamped to 0
- [ ] Add test for `computeBackoff` with negative `base` — verify it's clamped to 0
- [ ] Add test for `withTimeout` with `ms = 0` — verify timeout is disabled and the task runs to completion
- [ ] Add test for `withTimeout` with `ms = Infinity` — verify timeout is disabled
- [ ] Add test for `withTimeout` where the task completes before timeout — verify the timer is cleaned up
- [ ] Add test for `withTimeout` where the task throws before timeout — verify the timer is cleaned up and the error propagates
- [ ] Add test for `TimeoutError` type guard `isTimeoutError` — verify it works cross-realm

## Phase 7 — Loop state persistence & crash recovery

- [ ] Add test for `saveLoopState` / `loadLoopState` roundtrip with valid data
- [ ] Add test for `loadLoopState` with a malformed JSON file — verify it returns `null`
- [ ] Add test for `loadLoopState` with version !== 1 — verify it returns `null`
- [ ] Add test for `loadLoopState` with a file that doesn't exist — verify it returns `null`
- [ ] Add test for `clearLoopState` when the file doesn't exist — verify it doesn't throw
- [ ] Add test that `saveLoopState` writes to `.tmp` then renames (atomic write pattern) — verify the temp file is cleaned up after rename

## Phase 8 — Config loading & resilience resolution

- [ ] Add test for `loadConfig` with a config file containing `null` — verify it returns `{}`
- [ ] Add test for `loadConfig` with a config file containing an array — verify it returns `{}`
- [ ] Add test for `resolveResilience` with all three layers (defaults, config, CLI) — verify CLI wins on conflict, config fills gaps
- [ ] Add test for `resolveResilience` with `undefined` values in config — verify they don't override defaults
- [ ] Add test for `hasTerminalConfig` with `type: "known"` and empty `name` — verify it returns `false`
- [ ] Add test for `hasTerminalConfig` with `type: "custom"` and empty `command` — verify it returns `false`
- [ ] Add test for `saveConfig` creating the config directory if it doesn't exist
- [ ] Verify `getConfigDir` respects `$XDG_CONFIG_HOME` environment variable

## Phase 9 — Sleep detector & power management

- [ ] Add test for `createSleepDetector` with a threshold shorter than the tick interval — verify it doesn't trigger false wakes
- [ ] Add test for `createSleepDetector` detecting a gap larger than threshold — verify `onWake` is called with the correct `gapMs`
- [ ] Add test for sleep detector `stop()` preventing further wake callbacks
- [ ] Verify `createPowerManager` on non-macOS platforms gracefully handles the absence of `caffeinate`

## Phase 10 — Chaos fault injection

- [ ] Add test for `createChaos` with `enabled` returning `false` — verify all chaos methods are no-ops
- [ ] Add test for `createChaos` with `enabled` returning `true` — verify `killServer`, `reviveServer`, `freezeSession`, `unfreezeSession` work
- [ ] Add test for `createChaos.isEnabled()` reflecting the current state of the `enabled` function

## Phase 11 — App.tsx integration logic audit

- [ ] Verify the `startingIteration` guard prevents double session creation when the iteration-driver effect fires twice in the same Solid reactive cycle
- [ ] Verify the `pendingCooldownResume` flag correctly causes `stats.resume()` instead of `stats.startIteration()` after a rate-limit cooldown
- [ ] Verify `handleWake` correctly handles waking from cooldown (clears timers, dispatches `resume_cooldown`) vs. waking from running (reconciles and advances)
- [ ] Verify `enterCooldown` clears any previous cooldown timers before setting new ones (preventing timer leaks on consecutive rate limits)
- [ ] Verify `handleQuit` aborts the current session, disconnects SSE, stops the server, and clears loop state — in that order
- [ ] Verify `doResume` correctly handles the case where `reconcileSession` returns `"working"` (re-attaches to existing session) vs. `"missing"` (starts fresh iteration)
- [ ] Verify agent validation on startup: if `--agent` is specified but not found in the server's primary agents, the `DialogInvalidAgent` is shown and the session is NOT started until the user resolves it
- [ ] Verify the SSE reconnect threshold (`SSE_RECONNECT_RESTART_THRESHOLD = 6`) triggers a server restart after 6 consecutive failed reconnects
- [ ] Verify `reconcileAndAdvance` correctly synthesizes `session_idle` when the server says the session is `"idle"` or `"missing"`
- [ ] Verify `restoreTerminal()` only runs when `tuiStarted` is true AND `process.stdout.isTTY` is true — preventing escape code leaks on `--help`/`--version`/`--create-plan` paths
- [ ] Verify the `--create-plan` flow exits with `process.exitCode = 1` when the model returns empty content
- [ ] Verify the `--create-plan` refinement loop correctly passes the previous plan and feedback to `buildRefinePrompt`

## Phase 12 — DRY & code quality fixes

- [ ] Extract the repeated `path.resolve(planFile)` / `path.resolve(file)` pattern in `App.tsx` file-edit handler and `refreshPlan`/`refreshCurrentTask`/`checkPlanComplete` into a shared utility that resolves the plan file path once
- [ ] Extract the repeated `server.url()` + `createClient(url)` pattern (appears ~8 times in App.tsx) into a helper `getClient()` that returns `null` if the server isn't ready
- [ ] Deduplicate the terminal-launch + error-showing pattern in `onConfigSelect`, `onConfigCustom`, and the `T` key handler — extract a shared `launchTerminalOrShowDialog(sid)` function
- [ ] Consolidate the two separate `clearCooldownTimers` / timer-management blocks: `cooldownTimer` and `cooldownTicker` are always managed together; extract a `CooldownManager` class or at least a single `startCooldown(ms, onExpire)` / `clearCooldown()` pair
- [ ] The `startingIteration` flag is a mutable `let` in the component scope — verify it's correctly reset in the `finally` block of `startIteration` and add a defensive check that logs if it's still `true` when a new iteration attempt begins
- [ ] The `rateLimitAttempts` counter is reset in multiple places (`session_idle` handler, `reconcileAndAdvance`, `enterCooldown` exhaustion path) — verify all paths are covered and none double-reset
- [ ] Add a JSDoc comment to `extractPlanText` and `extractLastAssistantText` in `index.tsx` clarifying that they operate on the plan-generator's session messages, not the loop's SSE stream

## Phase 13 — Potential runtime exceptions & unhandled paths

- [ ] Verify that `Bun.file(args.planFile).exists()` in `validatePrerequisites` correctly handles permission errors (does `exists()` throw on EACCES? Bun's `File.exists()` resolves to `false` on any error — confirm)
- [ ] Verify `refreshPlan` / `refreshCurrentTask` / `checkPlanComplete` don't crash when the plan file is deleted mid-run (the `catch` in `refreshPlan` logs and swallows; `checkPlanComplete` returns `false`; confirm)
- [ ] Verify `startIteration` handles the case where `Bun.file(promptFile).text()` returns an empty string — the prompt would be empty, which is technically valid but likely useless. Consider adding a warning log.
- [ ] Verify the `{{PLAN_FILE}}` replacement in the prompt content handles edge cases: what if the plan file path contains special regex characters? (It uses `replaceAll` with a plain string, not regex — safe.)
- [ ] Verify `classifySessionError` handles circular references in the error object without crashing (`extractRetryAfter` accesses nested properties but doesn't serialize — safe as long as it doesn't call `JSON.stringify` on a circular ref)
- [ ] Verify `process.on("uncaughtException")` and `process.on("unhandledRejection")` in `index.tsx` call `restoreTerminal()` before `process.exit()` — confirmed, but verify they don't double-restore when `process.exit()` triggers the `"exit"` handler again

## Acceptance criteria

- All existing tests continue to pass (`bun test`)
- All new tests added in phases 1–10 pass
- No unhandled exceptions in any execution flow (parameterized, edge-case, error)
- DRY violations identified in phase 12 are refactored
- Each change is documented with a brief explanation of the problem and the fix applied
- `bun run build` succeeds with no type errors
