/**
 * Pure helper that resolves the session ID the user can act on right now:
 * the live one if the loop state machine has one, otherwise the most recent
 * session ID the app has ever created.
 *
 * Centralizes the sessionId() ?? lastSessionId() expression that previously
 * appeared at 11 call sites (terminal attach, clipboard copy, command
 * enablement, debug prompt, keybindings, error dialog). All consumers used the
 * same expression with no variation, so a future policy change used to require
 * editing 11 sites in lockstep — now lives in one place.
 *
 * Uses ?? (not ||) so a falsy non-empty string is not treated as a fallback
 * trigger. In practice neither accessor ever returns "" (the reducer's
 * sessionId is always a non-empty string or absent), so ?? and || produce the
 * same result today; ?? is the correct operator and future-proofs against a
 * reducer branch that produces "" as a sentinel.
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
