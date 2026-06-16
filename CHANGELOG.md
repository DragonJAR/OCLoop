# Changelog

All notable changes to OCLoop are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); this project uses semantic versioning.

## [Unreleased]

### Added
- **`resilience.planTimeoutMs`** — the `--create-plan` generation budget (default
  10 min) is now configurable: `--resilience planTimeoutMs=<ms>` or in the config
  file. The timeout message names the parameter and how to raise it.

### Changed
- **The activity log now fills the space between the panels and bottom-anchors.**
  It grows to occupy the full gap between the dashboard and the bottom panel
  (recomputed on every resize) and hugs the bottom panel, so the newest events sit
  next to the current task. The bottom panel caps the current task to a responsive
  number of lines (scales with terminal height) and shows a `+N` indicator when the
  task is longer, so a long task no longer crowds out the log.
- **Dashboard rows rebalanced** into a live-state row (status · tasks+progress ·
  iteration · health) and a details row (model · agent · task time · avg ·
  remaining), so neither row is overloaded.

### Fixed
- **Transient connection errors at iteration start now auto-retry with backoff.**
  A dropped/reset socket (e.g. "The socket connection was closed unexpectedly")
  while creating the session stopped the loop with a manual-retry dialog. It now
  backs off and retries the same iteration like a rate limit (bounded by
  `maxRateLimitRetries`), with a connection-specific message; only auth/fatal
  errors still need the user. The transient classifier also recognizes a
  connection "…was closed…" phrasing (was previously misread as fatal).
- **An invalid `--agent` is now caught before the loop starts.** Agent
  validation was fire-and-forget and raced `initializeSession`, so with
  `-r`/auto-start the first prompt went out with a nonexistent agent and the
  server rejected it mid-iteration with a fatal `agent "…" not found`. Session
  start is now gated on agent validation: an unknown agent shows the
  invalid-agent picker (with the available agents) and never starts a session.
- **Watchdog no longer near-instantly fails after a server restart.** When a
  restart left the session genuinely "working", the stale pre-restart heartbeat
  timestamp tripped STUCK on the next tick, collapsing the recovery ladder into
  an immediate circuit-breaker fail. The restart path now grants a fresh
  heartbeat window (`notifyWake`) on a "working" reconcile; the attempt counter
  still bounds total retries.
- **Rate-limit cooldowns no longer discard iteration timing.** Entering a
  cooldown now pauses the stats timer and the retry resumes it (instead of
  restarting), so a rate-limited iteration's active time still counts and the
  wait itself stays excluded. Abort/normal/pause paths are unchanged.
- **`<plan-complete>` inside an unterminated code fence no longer triggers a
  premature stop** — a dangling fence is now stripped to EOF.
- **Theme color resolution has a recursion depth cap** — a cyclic color def can
  no longer infinite-loop / stack-overflow (falls back to neutral grey).
- **SSE reconnect timer is cleared when it fires** (no stale handle racing
  `disconnect`/`reconnect`); removed dead `onSessionStatus`/`onSessionSummary`
  handlers and their unused types.
- **`locale.truncate(str, len)` no longer overflows for `len <= 0`** (a negative
  slice index returned a near-full string); now clamps to `""`/safe slice.
- **SSE dedup maps (`seenPartIds`/`messageRoles`) are cleared per session** —
  they grew unbounded across a long multi-iteration run.
- **`--prompt`/`--plan`/`--agent` reject a following flag as their value** (e.g.
  `--prompt --debug` now errors instead of silently setting the file to
  `--debug` and dropping `--debug`).
- **`--create-plan` honors `-p/--port`** and applies `--resilience` overrides
  (it previously ignored both in the headless path).
- **Stale aborted `session.error` can no longer wedge the loop** in `pausing("")`
  — `onSessionError` now ignores events for a non-active session, mirroring the
  guard `onSessionIdle` already had.
- **`--create-plan` no longer fails on long generations.** It used the
  synchronous `session.prompt`, which holds a single HTTP request open for the
  entire (multi-minute) generation; on a long hold the connection drops and
  fetch throws — consistently for big plans, on every OS/shell. It now kicks the
  prompt off with `promptAsync` and polls session status until idle (the same
  robust pattern the loop uses), so only short requests are ever in flight. The
  assistant's reply is then read via `session.messages`.
- **SDK transport errors no longer crash with a misleading message.** When the
  underlying fetch threw (timeout/abort, dropped connection, network error) the
  v2 SDK returns `response: undefined`, but every call site read
  `result.response.ok` directly — crashing with `undefined is not an object
  (evaluating 'res.response.ok')` and hiding the real cause. All eight call sites
  (loop + plan generator) now go through one shared `assertResponse()` that
  surfaces the actual error from `result.error` on a transport failure and the
  HTTP status on a non-2xx response. Removed the now-dead `cpGenFail` i18n
  string; added `cpTimeout`.
- **Terminal restoration now runs on every catchable in-process exit path.**
  OpenTUI normally restores the terminal on clean exits, but crashes, unhandled
  rejections, and explicit error-path exits could leave raw / alternate-screen /
  mouse-tracking modes enabled. OCLoop now installs idempotent `exit`,
  `uncaughtException`, and `unhandledRejection` handlers that restore terminal
  modes before the process terminates. SIGKILL / OOM kills remain uncatchable by
  definition.

### Changed
- **Watchdog T2 default raised 5 min → 10 min** (`watchdogConfirmMs`). A single
  silent, output-free tool (large build, test suite, install, download, or a
  server-side rate-limit wait) emits no heartbeat for its whole duration and was
  being aborted+retried at 5 min as if wedged. 10 min gives long tools room while
  still catching a genuine wedge promptly. Still configurable per run.

## [0.5.0]

Full-codebase audit (logic, dead code, functional behavior, ES/EN parity) plus
reliability and i18n hardening.

### Fixed
- **Phase 6 audit corrections:** strict CLI validation (`--port`, unknown
  flags, resilience overrides), model propagation for normal/debug prompts,
  non-rate-limit `session.error` escalation, non-OK health ping handling,
  indented `<plan-complete>` parsing, and Spanish documentation/i18n polish.
- **Recoverable errors can now be retried from the UI.** `DialogError` had no
  keyboard handler, and the global handler returns early while a dialog is open,
  so `R` (retry) / `Q` were dead. `DialogError` now owns its keyboard.
- **Progress percentage reaches 100% on fully-resolved plans.** `percentComplete`
  excluded `[MANUAL]` but not `[BLOCKED]` tasks from the denominator, even though
  the completion contract treats `[x]` or `[BLOCKED]` as terminal.
- **Cache token counters are no longer always 0** — the nested `tokens.cache`
  shape was passed to a flat `cacheRead`/`cacheWrite` consumer.
- **Server port can no longer become `NaN`** when the server URL has no explicit
  port, which broke `restart()`'s port-reuse fallback.
- **Programmatic shutdown always terminates** instead of hanging after the
  failsafe timer is cleared.

### Changed
- User-facing fallback/error strings that bypassed i18n are now localized
  (send-prompt failure, server-start failure, unknown error, plan-complete
  fallback summary) — correct in both English and Spanish.

### Removed
- Dead code: `DialogAlert` component, unused `getKnownTerminals`, `COLORS`,
  `getTheme`, `getHistory`, and the unused `hintWaitingTask` i18n key.

### Earlier in this cycle
- Auto-create `.loop-prompt.md` (localized EN/ES) when missing, instead of
  erroring; literal tokens (`{{PLAN_FILE}}`, `[MANUAL]`, `[BLOCKED]`, commands)
  are never translated.
- Dashboard task line and activity log now fit the real terminal width instead
  of fixed 60/40-character caps.
- Terminal is restored on crash/error exits (mouse tracking, alt-screen, cursor).
- SSE reconnect generation guard, redundant-`session_idle` no-op, and an
  in-flight guard on `startIteration` to prevent orphaned sessions.
- `<plan-complete>` detection ignores tags inside fenced code blocks.
- Dependencies pinned (OpenTUI `0.1.68`) for reproducible cross-platform builds.
- DRY: shared dialog primitives, memoized SDK client, `getActiveSessionId` helper.
