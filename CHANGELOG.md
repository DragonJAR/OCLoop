# Changelog

All notable changes to OCLoop are documented here. Format based on
[Keep a Changelog](https://keepachangelog.com/); this project uses semantic versioning.

## [Unreleased]

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
