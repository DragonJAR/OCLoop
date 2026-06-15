/**
 * Chaos fault injection — debug-only (`--chaos`).
 *
 * A controllable source of the exact failure modes the resilience work defends
 * against, so they can be triggered on demand (manual soak testing) and exercised
 * deterministically in the integration test:
 *
 *   - kill the OpenCode server  → health pings fail, reconcile returns "unknown"
 *   - freeze a session          → reconcile returns "working" with no heartbeats
 *   - cut the SSE stream         → modeled as the absence of heartbeats
 *   - return a 429              → a one-shot rate-limit injection
 *
 * The controller wraps the real probes (`ping`, `reconcile`) so that, when a
 * fault is active, the wrapped probe reports the failure instead of calling the
 * real one. When disabled (the default) everything passes straight through.
 */

import type { ReconcileResult } from "./api"

export interface ChaosSnapshot {
  enabled: boolean
  serverDead: boolean
  sessionFrozen: boolean
  pendingRateLimit: boolean
}

export interface ChaosController {
  isEnabled(): boolean

  /** Simulate the OpenCode server going away. */
  killServer(): void
  /** Bring the simulated server back. */
  reviveServer(): void
  /** Simulate a wedged session (busy forever, no progress). */
  freezeSession(): void
  unfreezeSession(): void
  /** Queue a one-shot rate-limit fault (consumed by `takeRateLimit`). */
  injectRateLimit(retryAfterSeconds?: number): void
  /** Consume a queued rate-limit fault, if any. */
  takeRateLimit(): { retryAfterSeconds?: number } | null

  /** Wrap a real health ping; reports failure when the server is "dead". */
  ping(real: () => Promise<boolean>): Promise<boolean>
  /** Wrap a real reconcile; reports "unknown"/"working" under active faults. */
  reconcile(real: () => Promise<ReconcileResult>): Promise<ReconcileResult>

  snapshot(): ChaosSnapshot
}

export function createChaos(enabled: () => boolean): ChaosController {
  let serverDead = false
  let sessionFrozen = false
  let pendingRateLimit: { retryAfterSeconds?: number } | null = null

  const on = () => enabled()

  return {
    isEnabled: on,

    killServer() {
      serverDead = true
    },
    reviveServer() {
      serverDead = false
    },
    freezeSession() {
      sessionFrozen = true
    },
    unfreezeSession() {
      sessionFrozen = false
    },
    injectRateLimit(retryAfterSeconds?: number) {
      pendingRateLimit = { retryAfterSeconds }
    },
    takeRateLimit() {
      if (!on()) return null
      const r = pendingRateLimit
      pendingRateLimit = null
      return r
    },

    async ping(real) {
      if (!on()) return real()
      if (serverDead) return false
      return real()
    },
    async reconcile(real) {
      if (!on()) return real()
      if (serverDead) return "unknown"
      if (sessionFrozen) return "working"
      return real()
    },

    snapshot() {
      return {
        enabled: on(),
        serverDead,
        sessionFrozen,
        pendingRateLimit: pendingRateLimit !== null,
      }
    },
  }
}
