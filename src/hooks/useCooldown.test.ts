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

      cd.enterCooldown("err1")
      expect(h.dispatched[0].type).toBe("rate_limited")
      cd.enterCooldown("err2")
      expect(h.dispatched[1].type).toBe("rate_limited")

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
