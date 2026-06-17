/**
 * Pure helper that resolves the session ID the user can act on right now:
 * the live one if the loop state machine has one, otherwise the most
 * recent session ID the app has ever created.
 *
 * Centralizes the `sessionId() || lastSessionId()` expression that
 * previously appeared at 11 call sites in App.tsx (terminal attach,
 * clipboard copy, command enablement, debug prompt, keybinding handlers,
 * and the show-terminal-error dialog). All consumers used the same
 * 1-line expression with no variation, so a future policy change
 * (e.g. "if the session was created more than 24h ago, return
 * `undefined`" or "if the loop is in `error`, do not fall back to
 * `lastSessionId`") used to require editing 11 sites in lockstep —
 * now lives in one place.
 *
 * Operator precedence note: this helper uses `??` (nullish coalescing)
 * rather than `||` so a falsy non-empty string is NOT treated as a
 * fallback trigger. In practice neither `sessionId()` nor
 * `lastSessionId()` ever returns `""` (the loop reducer's `sessionId`
 * field is always either a non-empty string or absent), so `??` and
 * `||` produce the same result for the current codebase. `??` is
 * still preferred because it is the correct operator for
 * "the field is null/undefined, not falsy", and it future-proofs
 * against any future reducer branch that produces `""` as a sentinel.
 *
 * Source: MEJORAS.md Finding 16.4.A. The double-evaluation at
 * `showTerminalError` (the same expression twice on consecutive
 * lines) is resolved as a side-effect: callers can assign the result
 * to a local and use it twice, see Finding 16.4.B.
 *
 * This helper is intentionally a plain function (not a Solid memo):
 * the caller reads `sessionId()` and `lastSessionId()` in its own
 * reactive context, so the underlying subscriptions are already
 * tracked by the caller. The helper itself is a pure collapse of
 * the resolution rule and stays unit-testable without a Solid harness.
 */

export function resolveActiveSessionId(
  liveSessionId: string | undefined,
  lastSessionId: string | undefined,
): string | undefined {
  return liveSessionId ?? lastSessionId ?? undefined
}
