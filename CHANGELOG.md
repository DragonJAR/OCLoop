# Changelog

All notable changes to OCLoop are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); this project uses semantic versioning.

## [Unreleased]

### Fixed
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
