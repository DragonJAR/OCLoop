import type { SessionError } from "../hooks/useSSE"

/**
 * The two error-source values the loop currently routes through the
 * session-error pipeline. The reducer's `ErrorSource` union
 * (`src/types.ts`) is broader (`server | sse | pty | api | plan`)
 * because it covers all places the harness surfaces an error to the
 * state machine; this helper only handles the two that come through
 * `classifySessionError` (the API path and the SSE path).
 */
export type RouteableErrorSource = "api" | "sse"

/**
 * All non-`aborted` states of the loop state machine. `routeSessionError`
 * gates on these to decide whether there is a live iteration to retry
 * (cooldown) or a recoverable surface to attach an error to (debug).
 */
export type RouteableState =
  | "ready"
  | "starting"
  | "running"
  | "pausing"
  | "paused"
  | "cooldown"
  | "error"
  | "debug"
  | "stopping"
  | "stopped"
  | "complete"

/**
 * What the caller should do. The helper is pure — it decides the
 * policy; the caller executes it (loop.dispatch / enterCooldown /
 * activity-log writes / i18n key choice).
 */
export type ErrorAction =
  | { type: "toggle_pause" }
  | {
      type: "cooldown"
      message: string
      retryAfter?: number
      kind: "rate_limit" | "transient"
    }
  | {
      type: "error"
      source: RouteableErrorSource
      errorMessage: string
      recoverable: boolean
    }

/**
 * Decide which side effect should fire for a classified session error.
 * Centralizes the "which `kind` triggers which action" policy that was
 * duplicated between `handleIterationError` (App.tsx:910, the API
 * path) and the SSE `onSessionError` handler (App.tsx:520, the SSE
 * path). Replaces the asymmetric branches surfaced by Findings 16.1.A
 * (recoverable flag) and 16.1.B (transient path divergence) with a
 * single source of truth.
 *
 * Policy (Source: MEJORAS.md Finding 16.1.D):
 *
 * - `isAborted: true` → returns `null`. The abort policy is
 *   source-specific (SSE does `toggle_pause`, the API does not abort
 *   through this path today) so the call site keeps ownership.
 * - `kind: "rate_limit" | "transient"` + (`running` | `pausing`) →
 *   cooldown. `retryAfter` is propagated for rate_limit; transient
 *   leaves it `undefined`.
 * - `kind: "rate_limit" | "transient"` + other state → `null` (no
 *   live iteration to retry; the error is dormant).
 * - `kind: "auth" | "fatal"` + (`running` | `pausing` | `debug`) →
 *   non-recoverable error. The `recoverable` flag is `false` for
 *   these two kinds; the defensive `classified.kind === "transient"`
 *   is kept so any future branch that adds a new recoverable kind
 *   composes correctly (matches the original SSE handler's defensive
 *   form at App.tsx:584).
 * - `kind: "auth" | "fatal"` + other state → `null`.
 *
 * The rare case `kind: "aborted"` without `isAborted: true` falls
 * through to the auth/fatal branch (treated as a non-recoverable
 * error). `classifySessionError` always sets `isAborted: true` when
 * `kind === "aborted"`, so this fallback is dormant.
 */
export function routeSessionError(
  classified: SessionError,
  stateType: RouteableState,
  source: RouteableErrorSource,
): ErrorAction | null {
  if (classified.isAborted) {
    return null
  }
  if (classified.kind === "rate_limit" || classified.kind === "transient") {
    if (stateType === "running" || stateType === "pausing") {
      // `retryAfter` is only meaningful for `rate_limit`; transient
      // always goes in without one. The original code at App.tsx:561
      // and App.tsx:575 calls `enterCooldown(message, undefined, "transient")`
      // explicitly; the helper preserves that contract.
      return {
        type: "cooldown",
        message: classified.message,
        retryAfter:
          classified.kind === "rate_limit" ? classified.retryAfter : undefined,
        kind: classified.kind,
      }
    }
    return null
  }
  // auth / fatal (and the dormant `aborted` kind without isAborted).
  if (stateType === "running" || stateType === "pausing" || stateType === "debug") {
    return {
      type: "error",
      source,
      errorMessage: classified.message,
      // auth/fatal/aborted are non-recoverable; transient never reaches here.
      recoverable: false,
    }
  }
  return null
}
