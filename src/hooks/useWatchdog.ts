/**
 * useWatchdog — the task guardian.
 *
 * Detects a wedged loop WITHOUT false positives. The core principle: a quiet
 * period (no heartbeat) is only ever a *suspicion*. Before any destructive
 * action the watchdog confirms against ground truth — an active server ping plus
 * the session's real status — and it never aborts while a heartbeat is recent
 * (which would mean the model is actually working).
 *
 * Health machine: HEALTHY → SUSPECT → CONFIRMING → STUCK → RECOVERING → HEALTHY
 *
 *   HEALTHY     heartbeat age < T1, or loop not in a guarded state
 *   CONFIRMING  age ≥ T1; running ground-truth probes this tick
 *   SUSPECT     probes say "working" but age < T2 → wait, re-check, DON'T abort
 *   STUCK       probes say "working" and age ≥ T2 → genuinely wedged
 *   RECOVERING  taking a recovery action (with a circuit breaker)
 *
 * The core is framework-agnostic (injectable clock, probes, actions) so the four
 * decisive quadrants are exhaustively unit-testable; `useWatchdog` is a thin
 * Solid wrapper that exposes `health` as a reactive signal and cleans up.
 */

import { createSignal, onCleanup } from "solid-js"
import { type Clock, systemClock } from "../lib/clock"
import type { ReconcileResult } from "../lib/api"
import { log as defaultLog } from "../lib/debug-logger"
import { toErrorMessage } from "../lib/format"

export type WatchdogHealth =
  | "HEALTHY"
  | "SUSPECT"
  | "CONFIRMING"
  | "STUCK"
  | "RECOVERING"

export interface WatchdogConfig {
  /** T1: no heartbeat for this long → start confirming (ms). */
  suspectMs: number
  /** T2: no heartbeat this long with a "working" session → wedged (ms). */
  confirmMs: number
  /** Watchdog evaluation interval (ms). */
  tickMs: number
  /** Recovery attempts per iteration before escalating to a recoverable error. */
  maxRecoveryAttempts: number
}

export interface WatchdogProbes {
  /** True only when the loop is in a guarded state (running/pausing w/ session). */
  isActive: () => boolean
  /** Lightweight active server health check. Resolves true if healthy. */
  pingServer: () => Promise<boolean>
  /** Ground-truth session status. Never throws (returns "unknown"). */
  reconcile: () => Promise<ReconcileResult>
}

/** What the watchdog last saw when it decided to recover (for diagnostics). */
export type WatchdogVerdict = ReconcileResult | "ping_failed"

export interface WatchdogDiagnostics {
  reason: "server_hung" | "session_wedged"
  lastHeartbeatAgeMs: number
  attempts: number
  lastVerdict?: WatchdogVerdict
}

export interface WatchdogActions {
  /** Cheap first step: reconnect the SSE stream. */
  reconnectSSE: () => void
  /** Session is actually idle/missing: synthesize idle and advance the loop. */
  synthesizeIdle: () => void
  /** Session is wedged: abort it and retry the same iteration. */
  abortAndRetry: () => Promise<void> | void
  /** Server is hung: restart it (caller also reconnects + reconciles). */
  restartServer: () => Promise<void> | void
  /** Circuit breaker tripped: escalate to a recoverable error with diagnostics. */
  fail: (diagnostics: WatchdogDiagnostics) => void
}

export interface WatchdogCoreOptions {
  /** Reactive thresholds (read fresh each tick so config changes apply live). */
  config: () => WatchdogConfig
  probes: WatchdogProbes
  actions: WatchdogActions
  clock?: Clock
  /** Notified on every health transition (the Solid wrapper feeds a signal). */
  onHealthChange?: (health: WatchdogHealth) => void
  /** Health telemetry sink; defaults to the debug logger's health channel. */
  log?: (state: string, metrics: Record<string, unknown>) => void
}

export interface Watchdog {
  /** Current health (reactive accessor in the hook form). */
  health: () => WatchdogHealth
  /** Record any sign of real progress from the active session. */
  recordHeartbeat: () => void
  /** A new iteration began: reset the heartbeat baseline (not the recovery budget). */
  notifyIterationStart: () => void
  /** A legitimate session.idle arrived: reset counters. */
  notifyIdle: () => void
  /** The system just woke from sleep: grant a fresh grace window. */
  notifyWake: () => void
  /** Run one evaluation (exposed for deterministic tests). */
  tick: () => Promise<void>
  start: () => void
  stop: () => void
  isRunning: () => boolean
}

export function createWatchdog(options: WatchdogCoreOptions): Watchdog {
  const clock = options.clock ?? systemClock
  const log =
    options.log ??
    ((state: string, metrics: Record<string, unknown>) =>
      defaultLog.health("watchdog", state, metrics))

  let health: WatchdogHealth = "HEALTHY"
  let lastHeartbeatAt = clock.monotonicNow()
  let recoveryAttempts = 0
  let ticking = false
  let timer: ReturnType<typeof setInterval> | null = null

  function setHealth(next: WatchdogHealth): void {
    if (next !== health) {
      health = next
      options.onHealthChange?.(next)
    }
  }

  function recordHeartbeat(): void {
    lastHeartbeatAt = clock.monotonicNow()
    // Reset recoveryAttempts on every heartbeat, including during CONFIRMING —
    // a heartbeat is proof of life, so any recovery tracking is obsolete.
    // When already HEALTHY, recoveryAttempts is already 0 (no-op).
    recoveryAttempts = 0
    if (health !== "HEALTHY") {
      log("recovered", { via: "heartbeat" })
      setHealth("HEALTHY")
    }
  }

  function notifyIterationStart(): void {
    // Fresh silence window for the new session, but DELIBERATELY do not reset
    // recoveryAttempts: an abort+retry advances the loop into a new iteration
    // (which calls this), so resetting here would hand a chronically wedging
    // task an unlimited abort/retry budget — it would never escalate to a
    // restart or trip the circuit breaker. The budget is cleared only by genuine
    // progress (recordHeartbeat / notifyIdle) or by the breaker firing.
    lastHeartbeatAt = clock.monotonicNow()
    setHealth("HEALTHY")
  }

  function notifyIdle(): void {
    recoveryAttempts = 0
    setHealth("HEALTHY")
  }

  function notifyWake(): void {
    // Don't judge the session on the sleep gap. Reset the baseline so the model
    // gets a fresh T1 window to prove it's alive; the wake handler does the
    // ground-truth reconcile separately.
    // Note: if a tick() is in progress (ticking=true), it will complete with
    // the old lastHeartbeatAt. This is safe — the next tick will see the reset
    // timestamp and evaluate correctly. The ticking guard only prevents overlap,
    // it doesn't cause stale decisions.
    lastHeartbeatAt = clock.monotonicNow()
    setHealth("HEALTHY")
    log("wake_reset", {})
  }

  async function recover(
    reason: WatchdogDiagnostics["reason"],
    dt: number,
    lastVerdict?: WatchdogVerdict,
  ): Promise<void> {
    const cfg = options.config()
    recoveryAttempts++
    setHealth("RECOVERING")
    log("recovering", {
      reason,
      lastHeartbeatAgeMs: Math.round(dt),
      attempt: recoveryAttempts,
      lastVerdict,
    })

    // Circuit breaker: stop trying after maxRecoveryAttempts and surface a
    // recoverable error with full diagnostics rather than looping forever.
    // Semantics: recoveryAttempts increments before this check (1-indexed),
    // so `> maxRecoveryAttempts` means exactly maxRecoveryAttempts attempts
    // were allowed (attempts 1..N), and attempt N+1 triggers the fail.
    if (recoveryAttempts > cfg.maxRecoveryAttempts) {
      log("exhausted", { reason, attempts: recoveryAttempts - 1, lastVerdict })
      options.actions.fail({
        reason,
        lastHeartbeatAgeMs: Math.round(dt),
        attempts: recoveryAttempts - 1,
        lastVerdict,
      })
      recoveryAttempts = 0
      return
    }

    // Escalation ladder. Always reconnect SSE first (cheap). A hung server (or a
    // wedge that a prior abort+retry didn't clear) escalates to a server restart.
    options.actions.reconnectSSE()
    if (reason === "server_hung" || recoveryAttempts >= 2) {
      await options.actions.restartServer()
    } else {
      await options.actions.abortAndRetry()
    }
  }

  async function tick(): Promise<void> {
    if (ticking) return // never overlap probes
    ticking = true
    try {
      // Quiet is EXPECTED outside guarded states — never act.
      if (!options.probes.isActive()) {
        setHealth("HEALTHY")
        return
      }

      const cfg = options.config()
      const dt = clock.monotonicNow() - lastHeartbeatAt

      // Recent heartbeat → the model is working. Hands off.
      if (dt < cfg.suspectMs) {
        setHealth("HEALTHY")
        return
      }

      // Suspicion: confirm against ground truth before doing anything.
      setHealth("CONFIRMING")
      log("confirming", { lastHeartbeatAgeMs: Math.round(dt) })

      // The probes below are network round-trips. A heartbeat can land while
      // they're in flight; recordHeartbeat() then resets us to HEALTHY. Honor
      // that over the `dt` we sampled above — otherwise we could abort/restart a
      // session that just proved it's alive. Closes the read-then-act (TOCTOU)
      // gap between measuring `dt` and acting on it.
      const rescuedByHeartbeat = () =>
        clock.monotonicNow() - lastHeartbeatAt < cfg.suspectMs

      const alive = await options.probes.pingServer()
      if (rescuedByHeartbeat()) {
        setHealth("HEALTHY")
        return
      }
      if (!alive) {
        // Server not answering → hung. Restart.
        await recover("server_hung", dt, "ping_failed")
        return
      }

      const verdict = await options.probes.reconcile()
      if (rescuedByHeartbeat()) {
        setHealth("HEALTHY")
        return
      }

      if (verdict === "idle" || verdict === "missing") {
        // Not stuck — we just missed session.idle. Advance, no abort.
        log("desync_recovered", { verdict })
        options.actions.synthesizeIdle()
        recoveryAttempts = 0
        setHealth("HEALTHY")
        return
      }

      if (verdict === "unknown") {
        // Status probe itself failed/timed out → treat as a hung server.
        await recover("server_hung", dt, "unknown")
        return
      }

      // verdict === "working"
      if (dt >= cfg.confirmMs) {
        // Working but silent past T2 → genuinely wedged.
        setHealth("STUCK")
        log("stuck", { lastHeartbeatAgeMs: Math.round(dt), verdict })
        await recover("session_wedged", dt, verdict)
      } else {
        // Working and silent but under T2 → maybe a long quiet step. Wait.
        setHealth("SUSPECT")
        log("suspect_working", { lastHeartbeatAgeMs: Math.round(dt) })
      }
    } finally {
      ticking = false
    }
  }

  return {
    health: () => health,
    recordHeartbeat,
    notifyIterationStart,
    notifyIdle,
    notifyWake,
    tick,
    start() {
      if (timer) return
      timer = setInterval(() => {
        // Never let a recovery action's rejection become an unhandled rejection.
        tick().catch((err) => {
          log("tick_error", {
            message: toErrorMessage(err),
          })
        })
      }, options.config().tickMs)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    isRunning() {
      return timer !== null
    },
  }
}

/**
 * Solid hook wrapper: exposes `health` as a reactive signal and stops the
 * watchdog on cleanup.
 */
export function useWatchdog(
  options: Omit<WatchdogCoreOptions, "onHealthChange">,
): Watchdog {
  const [health, setHealth] = createSignal<WatchdogHealth>("HEALTHY")
  const core = createWatchdog({ ...options, onHealthChange: setHealth })
  onCleanup(() => core.stop())
  return { ...core, health }
}
