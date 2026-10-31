/**
 * Rate-limit / transient cooldown orchestration.
 *
 * Owns the imperative pieces the loopReducer cannot (timers + the consecutive-
 * attempt counter), keeping AppContent free of the closure-bound `let` timers.
 * The reducer stays the single source of truth for declarative state
 * (`cooldown` variant); this hook only drives the countdown UI and the
 * backoff-resume side effect.
 *
 * Extracted verbatim from App.tsx; behavior unchanged.
 */

import { createSignal, onCleanup } from "solid-js"

import { computeBackoff } from "../lib/backoff"
import { monotonicNow } from "../lib/clock"
import { log } from "../lib/debug-logger"
import { MAX_TIMEOUT_MS } from "../lib/constants"
import type { t as Tfn } from "../lib/i18n"
import type { ResilienceConfig } from "../lib/config"
import type {
  ActivityEventType,
  AddEventOptions,
} from "./useActivityLog"

export interface CooldownDeps {
  /** Resolved resilience thresholds (reactive accessor). */
  resilience: () => ResilienceConfig
  /** Current loop state's type, for the resume guard. */
  stateType: () => string
  /** Dispatch into the loop reducer (rate_limited / resume_cooldown / error). */
  dispatch: (action: CooldownDispatchAction) => void
  /** Activity log writer. */
  addEvent: (type: ActivityEventType, message: string, opts?: AddEventOptions) => void
  t: typeof Tfn
}

/** The subset of LoopAction this hook may dispatch. */
export type CooldownDispatchAction =
  | {
      type: "rate_limited"
      reason: string
      resumeAt: number
      attempt: number
      kind: "rate_limit" | "transient"
    }
  | {
      /** Extend the armed cooldown to a later monotonic deadline (Retry-After). */
      type: "extend_cooldown"
      resumeAt: number
      reason: string
    }
  | { type: "resume_cooldown" }
  | {
      type: "error"
      source: "api"
      message: string
      recoverable: boolean
    }

export interface CooldownApi {
  /** Dashboard countdown (ms remaining), reactive. */
  remainingMs: () => number
  /** Consecutive rate-limit attempt counter. */
  getAttempts: () => number
  /** Restore the counter from a persisted resume (doResume). */
  setAttempts: (n: number) => void
  /** Reset the counter (clean idle / reconcile / completion). */
  resetAttempts: () => void
  /**
   * Enter a cooldown wait, or escalate to an error after maxRateLimitRetries.
   *
   * Duplicate-report absorption: while a cooldown is armed, ANY report is
   * absorbed regardless of its wording — the same incident reaches the loop
   * through two channels (the API call failing AND the backend's session.error
   * event), and classifySessionError can word them differently for the same
   * HTTP response. The armed cooldown already owns the timer, the countdown,
   * and the attempt count; only a genuinely later incident (armed cooldown
   * fired → timer null again) counts a fresh attempt. A duplicate carrying a
   * server Retry-After extends the armed deadline instead of being dropped
   * with its (shorter) formula delay — see applyRetryAfterExtension.
   */
  enterCooldown: (
    reason: string,
    retryAfterSeconds?: number,
    kind?: "rate_limit" | "transient",
  ) => void
  /** Cancel any pending cooldown timers (resume / quit / server-error). */
  clearTimers: () => void
  /** Reconcile cooldown deadline after sleep/wake using wall-clock; returns true if resumed. */
  reconcileWake: (gapMs?: number) => boolean
  /**
   * Debug-only: set the dashboard countdown directly (no timers, no dispatch) so
   * a screenshot preview shows a realistic "retrying in Ns". Called only by the
   * debug Preview commands (gated to --debug); never on a real path.
   */
  previewRemaining: (ms: number) => void
}

export function useCooldown(deps: CooldownDeps): CooldownApi {
  let rateLimitAttempts = 0
  let wallClockResumeAt = 0
  /** Monotonic deadline of the armed cooldown (for Retry-After comparisons). */
  let armedResumeAt = 0
  let lastCooldownReason: string | null = null
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null
  let cooldownTicker: ReturnType<typeof setInterval> | null = null
  const [cooldownRemainingMs, setCooldownRemainingMs] = createSignal(0)

  function clearTimers(): void {
    if (cooldownTimer) {
      clearTimeout(cooldownTimer)
      cooldownTimer = null
    }
    if (cooldownTicker) {
      clearInterval(cooldownTicker)
      cooldownTicker = null
    }
    setCooldownRemainingMs(0)
    wallClockResumeAt = 0
    armedResumeAt = 0
    lastCooldownReason = null
  }

  onCleanup(clearTimers)

  /**
   * A duplicate report carrying a server Retry-After must not be dropped
   * alongside its formula delay: the server's window is authoritative
   * (computeBackoff honors it for fresh entries). Extend the armed cooldown
   * only when the new deadline is LATER — an earlier Retry-After must not
   * shorten a backoff already armed. Re-arms timers/countdown/reducer deadline
   * without touching the attempt counter.
   */
  function applyRetryAfterExtension(
    retryAfterSeconds: number,
    reason: string,
    kind: "rate_limit" | "transient",
  ): void {
    const extensionMs = Math.min(MAX_TIMEOUT_MS, Math.max(0, Math.round(retryAfterSeconds * 1000)))
    const newResumeAt = monotonicNow() + extensionMs
    if (newResumeAt <= armedResumeAt) return
    log.health("ratelimit", "cooldown extended by duplicate Retry-After", {
      reason,
      kind,
      retryAfterSeconds,
    })
    rearmCooldownTimers(newResumeAt)
    deps.dispatch({ type: "extend_cooldown", resumeAt: newResumeAt, reason })
  }

  /** Swap the countdown ticker and resume timer to a new deadline, in place. */
  function rearmCooldownTimers(resumeAt: number): void {
    if (cooldownTimer) clearTimeout(cooldownTimer)
    if (cooldownTicker) clearInterval(cooldownTicker)
    armedResumeAt = resumeAt
    wallClockResumeAt = Date.now() + Math.max(0, resumeAt - monotonicNow())
    setCooldownRemainingMs(Math.max(0, resumeAt - monotonicNow()))
    const tickerId = setInterval(() => {
      const remaining = Math.max(0, resumeAt - monotonicNow())
      setCooldownRemainingMs(remaining)
      if (remaining <= 0) {
        clearInterval(tickerId)
        if (cooldownTicker === tickerId) {
          cooldownTicker = null
        }
      }
    }, 250)
    cooldownTicker = tickerId
    cooldownTimer = setTimeout(() => {
      cooldownTimer = null
      // Invariant: all cooldown timers are cleared before leaving cooldown —
      // holds for every dispatch path, not just the externally-driven one.
      clearTimers()
      if (deps.stateType() === "cooldown") {
        deps.dispatch({ type: "resume_cooldown" })
      }
    }, Math.max(0, resumeAt - monotonicNow()))
  }

  function enterCooldown(
    reason: string,
    retryAfterSeconds?: number,
    kind: "rate_limit" | "transient" = "rate_limit",
  ): void {
    // Re-entrance guard: the same incident can reach us through two channels
    // (the API call failing AND the subsequent SSE session.error event), and
    // each unguarded entry double-counts `rateLimitAttempts`, falsely
    // accelerating the escalation to errRatePersistent. While a cooldown is
    // armed, ANY duplicate report is absorbed regardless of wording: the
    // cooldown in flight already owns the timer, the countdown, and the
    // attempt count. classifySessionError can word the same HTTP 429
    // differently per channel (raw API error vs session.error payload), so an
    // exact reason comparison would miss the duplicate. Only a genuinely
    // later incident re-arms — after the armed cooldown fired, cooldownTimer
    // is null again and the next enterCooldown counts a fresh attempt.
    if (cooldownTimer) {
      if (reason === lastCooldownReason) {
        log.health("ratelimit", "duplicate rate-limit report absorbed", { reason, kind })
      } else {
        log.health("ratelimit", "duplicate rate-limit report absorbed (incident match)", {
          reason,
          lastCooldownReason,
          kind,
        })
      }
      if (retryAfterSeconds !== undefined) {
        applyRetryAfterExtension(retryAfterSeconds, reason, kind)
      }
      return
    }
    lastCooldownReason = reason
    const r = deps.resilience()
    rateLimitAttempts++

    if (rateLimitAttempts > r.maxRateLimitRetries) {
      const tried = rateLimitAttempts - 1
      log.health("ratelimit", "exhausted", {
        attempts: tried,
        reason,
        kind,
        retryAfterSeconds: retryAfterSeconds ?? null,
      })
      deps.addEvent(
        "error",
        deps.t(kind === "transient" ? "actRetryExhausted" : "actRateExhausted", { attempts: tried }),
      )
      deps.dispatch({
        type: "error",
        source: "api",
        message: deps.t(kind === "transient" ? "errRetryPersistent" : "errRatePersistent", {
          attempts: tried,
          reason,
        }),
        recoverable: true,
      })
      rateLimitAttempts = 0
      lastCooldownReason = null
      clearTimers()
      return
    }

    const delayMs = computeBackoff(rateLimitAttempts - 1, {
      base: r.backoffBaseMs,
      max: r.backoffMaxMs,
      jitter: r.backoffJitter,
      retryAfterSeconds,
    })
    const resumeAt = monotonicNow() + delayMs

    log.health("ratelimit", "cooldown", {
      attempt: rateLimitAttempts,
      delayMs,
      retryAfterSeconds: retryAfterSeconds ?? null,
      reason,
    })
    deps.addEvent(
      "error",
      deps.t(kind === "transient" ? "cooldownRetryText" : "cooldownText", {
        secs: Math.ceil(delayMs / 1000),
        attempt: rateLimitAttempts,
      }),
      { level: "warn", progress: { current: rateLimitAttempts, total: r.maxRateLimitRetries } },
    )

    // Clear stale timers before dispatching so no Solid effect can observe a
    // window where stale timers are still alive after the reducer moved to cooldown.
    clearTimers()
    // Record AFTER clearTimers (which resets the guard state) so the duplicate-
    // report guard sees this reason for as long as the cooldown timer is armed.
    lastCooldownReason = reason
    armedResumeAt = resumeAt
    wallClockResumeAt = Date.now() + delayMs

    deps.dispatch({ type: "rate_limited", reason, resumeAt, attempt: rateLimitAttempts, kind })

    // Arm the countdown ticker and the resume timer. The countdown is seeded
    // with the same formula the ticker uses so the dashboard doesn't briefly
    // show the full delayMs if the renderer stalls before the first tick.
    // Capture the interval ID locally so the self-stop branch clears the exact
    // timer it was scheduled by, independent of any concurrent clearTimers.
    rearmCooldownTimers(resumeAt)
  }

  function reconcileWake(gapMs = 0): boolean {
    if (deps.stateType() !== "cooldown") return false
    const now = Date.now()
    if (wallClockResumeAt > 0 && now >= wallClockResumeAt) {
      clearTimers()
      deps.dispatch({ type: "resume_cooldown" })
      return true
    }
    if (wallClockResumeAt > 0) {
      setCooldownRemainingMs(Math.max(0, wallClockResumeAt - now))
    }
    return false
  }

  return {
    remainingMs: cooldownRemainingMs,
    getAttempts: () => rateLimitAttempts,
    setAttempts: (n: number) => {
      rateLimitAttempts = n
    },
    resetAttempts: () => {
      rateLimitAttempts = 0
    },
    enterCooldown,
    clearTimers,
    reconcileWake,
    previewRemaining: (ms: number) => setCooldownRemainingMs(ms),
  }
}
