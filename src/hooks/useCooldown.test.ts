import { describe, expect, it } from "bun:test"
import { createRoot } from "solid-js"
import { useCooldown, type CooldownDeps, type CooldownDispatchAction } from "./useCooldown"
import { DEFAULT_RESILIENCE, type ResilienceConfig } from "../lib/config"
import { t } from "../lib/i18n"

function makeTestDeps(overrides: Partial<CooldownDeps> = {}) {
  const dispatched: CooldownDispatchAction[] = []
  const events: Array<{ type: string; message: string; opts?: unknown }> = []
  let stateType = "running"

  const resilience: ResilienceConfig = {
    ...DEFAULT_RESILIENCE,
    maxRateLimitRetries: 3,
    backoffBaseMs: 100,
    backoffMaxMs: 1000,
    backoffJitter: false,
  }

  const deps: CooldownDeps = {
    resilience: () => resilience,
    stateType: () => stateType,
    dispatch: (action) => dispatched.push(action),
    addEvent: (type, message, opts) => events.push({ type, message, opts }),
    t,
    ...overrides,
  }

  return {
    deps,
    dispatched,
    events,
    setStateType: (st: string) => {
      stateType = st
    },
    resilience,
  }
}

describe("useCooldown (W3-07)", () => {
  it("initializes with 0 attempts and 0 remainingMs", () => {
    createRoot((dispose) => {
      const { deps } = makeTestDeps()
      const cd = useCooldown(deps)
      expect(cd.getAttempts()).toBe(0)
      expect(cd.remainingMs()).toBe(0)
      dispose()
    })
  })

  it("getAttempts, setAttempts, resetAttempts manage attempt counter", () => {
    createRoot((dispose) => {
      const { deps } = makeTestDeps()
      const cd = useCooldown(deps)
      cd.setAttempts(4)
      expect(cd.getAttempts()).toBe(4)
      cd.resetAttempts()
      expect(cd.getAttempts()).toBe(0)
      dispose()
    })
  })

  it("enterCooldown enters cooldown and dispatches rate_limited", async () => {
    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        const h = makeTestDeps()
        const cd = useCooldown(h.deps)

        cd.enterCooldown("429 Too Many Requests", 1, "rate_limit")
        expect(cd.getAttempts()).toBe(1)
        expect(h.dispatched).toHaveLength(1)
        expect(h.dispatched[0].type).toBe("rate_limited")
        if (h.dispatched[0].type === "rate_limited") {
          expect(h.dispatched[0].kind).toBe("rate_limit")
          expect(h.dispatched[0].attempt).toBe(1)
        }
        expect(cd.remainingMs()).toBeGreaterThan(0)

        cd.clearTimers()
        expect(cd.remainingMs()).toBe(0)
        dispose()
        resolve()
      })
    })
  })

  it("escalates to error when attempts exceed maxRateLimitRetries", () => {
    createRoot((dispose) => {
      const h = makeTestDeps()
      h.resilience.maxRateLimitRetries = 2
      const cd = useCooldown(h.deps)

      // Each clearTimers() ends the previous incident's armed window so the
      // next enterCooldown counts a fresh attempt (the duplicate-report guard
      // is scoped to the armed cooldown; see the absorption tests).
      cd.enterCooldown("err1")
      expect(h.dispatched[0].type).toBe("rate_limited")
      cd.clearTimers()
      cd.enterCooldown("err2")
      expect(h.dispatched[1].type).toBe("rate_limited")
      cd.clearTimers()

      // 3rd attempt exceeds max 2
      cd.enterCooldown("err3")
      expect(h.dispatched[2].type).toBe("error")
      if (h.dispatched[2].type === "error") {
        expect(h.dispatched[2].recoverable).toBe(true)
        expect(h.dispatched[2].source).toBe("api")
      }
      expect(cd.getAttempts()).toBe(0)
      dispose()
    })
  })

  it("reconcileWake reconciles cooldown when deadline passed (W3-04)", () => {
    createRoot((dispose) => {
      const h = makeTestDeps()
      h.setStateType("cooldown")
      const cd = useCooldown(h.deps)

      // When not in cooldown state, returns false
      h.setStateType("running")
      expect(cd.reconcileWake(1000)).toBe(false)

      // Enter cooldown with very small delay (0 retryAfter)
      h.setStateType("cooldown")
      cd.enterCooldown("short", 0)

      // Simulate wake after deadline
      const resumed = cd.reconcileWake(5000)
      expect(resumed).toBe(true)
      expect(h.dispatched.some((a) => a.type === "resume_cooldown")).toBe(true)
      dispose()
    })
  })

  it("absorbs a duplicate rate-limit report for the same incident and counts a new incident after the cooldown fires", () => {
    createRoot(async (dispose) => {
      const h = makeTestDeps()
      h.resilience.maxRateLimitRetries = 5
      h.resilience.backoffBaseMs = 20
      const cd = useCooldown(h.deps)

      // First report arms the cooldown: attempts 1, one dispatch.
      cd.enterCooldown("429 Too Many Requests")
      expect(cd.getAttempts()).toBe(1)
      expect(h.dispatched).toHaveLength(1)

      // The same incident arrives again via the second channel (SSE after API)
      // while the cooldown timer is still armed → absorbed, not double-counted.
      cd.enterCooldown("429 Too Many Requests")
      expect(cd.getAttempts()).toBe(1)
      expect(h.dispatched).toHaveLength(1)

      // Once the armed cooldown fires, the next report is a NEW incident and
      // counts a fresh attempt (the guard is scoped to the armed window).
      await new Promise((resolve) => setTimeout(resolve, 60))
      cd.enterCooldown("network timeout")
      expect(cd.getAttempts()).toBe(2)
      expect(h.dispatched).toHaveLength(2)
      if (h.dispatched[1].type === "rate_limited") {
        expect(h.dispatched[1].attempt).toBe(2)
      }

      cd.clearTimers()
      dispose()
    })
  })

  it("absorbs a re-worded duplicate report of the same incident (API vs SSE wording)", () => {
    createRoot((dispose) => {
      const h = makeTestDeps()
      h.resilience.maxRateLimitRetries = 5
      const cd = useCooldown(h.deps)

      // Channel 1 (API path): the raw API error text.
      cd.enterCooldown("Error: 429 Too Many Requests")
      expect(cd.getAttempts()).toBe(1)
      expect(h.dispatched).toHaveLength(1)

      // Channel 2 (SSE path): the session.error payload words the SAME HTTP
      // 429 differently. The armed cooldown owns the incident, so this is a
      // duplicate and must be absorbed — not counted as a second attempt.
      cd.enterCooldown("session error: rate limit exceeded (retry after 60s)")
      expect(cd.getAttempts()).toBe(1)
      expect(h.dispatched).toHaveLength(1)

      cd.clearTimers()
      dispose()
    })
  })

  it("extends the armed cooldown when a duplicate carries a longer server Retry-After", () => {
    createRoot((dispose) => {
      const h = makeTestDeps()
      h.resilience.maxRateLimitRetries = 5
      const cd = useCooldown(h.deps)

      // First report: formula backoff only (no Retry-After) → attempt 1.
      cd.enterCooldown("429 Too Many Requests")
      expect(cd.getAttempts()).toBe(1)
      const armed = h.dispatched[0]
      if (armed.type !== "rate_limited") throw new Error("expected rate_limited")
      const armedResumeAt = armed.resumeAt

      // The duplicate (second channel) carries the server's Retry-After: the
      // authoritative window must extend the armed deadline — not be dropped
      // alongside its (shorter) formula delay.
      cd.enterCooldown("429 Too Many Requests", 60)
      expect(cd.getAttempts()).toBe(1) // still the same incident
      const ext = h.dispatched[h.dispatched.length - 1]
      if (ext.type !== "extend_cooldown") throw new Error("expected extend_cooldown")
      expect(ext.resumeAt).toBeGreaterThan(armedResumeAt)

      // A shorter Retry-After must NOT shorten the extended deadline: the
      // extension guard rejects it, so no new dispatch is emitted at all.
      const dispatchedBefore = h.dispatched.length
      cd.enterCooldown("429 Too Many Requests", 1)
      expect(h.dispatched.length).toBe(dispatchedBefore)

      cd.clearTimers()
      dispose()
    })
  })

  it("previewRemaining updates remainingMs without timers or dispatch", () => {
    createRoot((dispose) => {
      const h = makeTestDeps()
      const cd = useCooldown(h.deps)
      cd.previewRemaining(12345)
      expect(cd.remainingMs()).toBe(12345)
      expect(h.dispatched).toHaveLength(0)
      dispose()
    })
  })
})
