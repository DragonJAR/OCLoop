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
  /** Enter a cooldown wait, or escalate to an error after maxRateLimitRetries. */
  enterCooldown: (
    reason: string,
    retryAfterSeconds?: number,
    kind?: "rate_limit" | "transient",
  ) => void
  /** Cancel any pending cooldown timers (resume / quit / server-error). */
  clearTimers: () => void
}

export function useCooldown(deps: CooldownDeps): CooldownApi {
  let rateLimitAttempts = 0
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
  }

  onCleanup(clearTimers)

  function enterCooldown(
    reason: string,
    retryAfterSeconds?: number,
    kind: "rate_limit" | "transient" = "rate_limit",
  ): void {
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

    deps.dispatch({ type: "rate_limited", reason, resumeAt, attempt: rateLimitAttempts, kind })

    // Seed the countdown with the same formula the ticker uses so the dashboard
    // doesn't briefly show the full delayMs if the renderer stalls before the first tick.
    setCooldownRemainingMs(Math.max(0, resumeAt - monotonicNow()))
    // Capture the interval ID locally so the self-stop branch clears the exact
    // timer it was scheduled by, independent of any concurrent clearTimers.
    const tickerId = setInterval(() => {
      const remaining = Math.max(0, resumeAt - monotonicNow())
      setCooldownRemainingMs(remaining)
      if (remaining <= 0) {
        clearInterval(tickerId)
        cooldownTicker = null
      }
    }, 250)
    cooldownTicker = tickerId

    // Resume after the backoff. The idle effect (running + empty session) then
    // re-creates the session and re-sends the prompt for the same iteration.
    cooldownTimer = setTimeout(() => {
      cooldownTimer = null
      // Invariant: all cooldown timers are cleared before leaving cooldown —
      // holds for every dispatch path, not just the externally-driven one.
      clearTimers()
      if (deps.stateType() === "cooldown") {
        deps.dispatch({ type: "resume_cooldown" })
      }
    }, delayMs)
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
  }
}
