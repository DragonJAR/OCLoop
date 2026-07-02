/**
 * End-to-end resilience integration test.
 *
 * Wires the REAL watchdog, error classifier, backoff calculator and loop reducer
 * against a chaos-controlled fake server/session, and verifies the four headline
 * recovery behaviors from the acceptance criteria:
 *
 *   1. rate limit  → cooldown → resume
 *   2. SSE cut     → reconcile recovers a missed idle (no abort)
 *   3. server dead → restart + reconcile
 *   4. session frozen → guardian aborts + retries
 *
 * The watchdog's recovery actions feed back into the chaos controller (abort
 * clears a wedge, restart revives the server) to model a real recovery loop.
 */

import { describe, expect, it } from "bun:test"
import { createWatchdog } from "./hooks/useWatchdog"
import { createChaos } from "./lib/chaos"
import { classifySessionError } from "./hooks/useSSE"
import { computeBackoff } from "./lib/backoff"
import { loopReducer } from "./hooks/useLoopState"
import type { LoopState } from "./types"
import type { Clock } from "./lib/clock"
import type { ReconcileResult } from "./lib/api"

const T1 = 90_000
const T2 = 300_000

function harness() {
  let mono = 1_000_000
  const clock: Clock = {
    monotonicNow: () => mono,
    wallClockNow: () => mono,
  }
  const chaos = createChaos(() => true)
  let realPing = true
  let realReconcile: ReconcileResult = "working"

  const calls = {
    reconnectSSE: 0,
    synthesizeIdle: 0,
    abortAndRetry: 0,
    restartServer: 0,
    fail: 0,
  }

  const wd = createWatchdog({
    config: () => ({
      suspectMs: T1,
      confirmMs: T2,
      tickMs: 15_000,
      maxRecoveryAttempts: 3,
    }),
    clock,
    log: () => {},
    probes: {
      isActive: () => true,
      pingServer: () => chaos.ping(async () => realPing),
      reconcile: () => chaos.reconcile(async () => realReconcile),
    },
    actions: {
      reconnectSSE: () => calls.reconnectSSE++,
      synthesizeIdle: () => calls.synthesizeIdle++,
      abortAndRetry: () => {
        calls.abortAndRetry++
        // Aborting clears the wedge in the real system.
        chaos.unfreezeSession()
      },
      restartServer: async () => {
        calls.restartServer++
        // Restarting brings the server back.
        chaos.reviveServer()
      },
      fail: () => calls.fail++,
    },
  })

  return {
    wd,
    chaos,
    calls,
    advance: (ms: number) => (mono += ms),
    setReconcile: (v: ReconcileResult) => (realReconcile = v),
    setPing: (v: boolean) => (realPing = v),
  }
}

describe("resilience integration (chaos-driven)", () => {
  it("1. rate limit → cooldown → resume", () => {
    // Classify a 429 the server surfaced, honoring its Retry-After.
    const err = classifySessionError({
      message: "Request failed: 429 too many requests",
      retryAfter: 2,
    })
    expect(err.kind).toBe("rate_limit")

    const delay = computeBackoff(0, {
      base: 1000,
      max: 60_000,
      retryAfterSeconds: err.retryAfter,
    })
    expect(delay).toBe(2000)

    // Loop enters cooldown (not error), then resumes the same iteration.
    let state: LoopState = { type: "running", iteration: 3, sessionId: "s" }
    state = loopReducer(state, {
      type: "rate_limited",
      reason: err.message,
      resumeAt: 999,
      attempt: 1,
    })
    expect(state.type).toBe("cooldown")
    state = loopReducer(state, { type: "resume_cooldown" })
    expect(state).toEqual({ type: "running", iteration: 3, sessionId: "s" })
  })

  it("2. SSE cut but session finished → watchdog reconciles, no abort", async () => {
    const h = harness()
    // SSE cut == no heartbeats arrive. The session actually finished, so the
    // server's ground truth is idle.
    h.setReconcile("idle")
    h.advance(T1 + 5_000)
    await h.wd.tick()
    expect(h.calls.synthesizeIdle).toBe(1)
    expect(h.calls.abortAndRetry).toBe(0)
    expect(h.calls.restartServer).toBe(0)
    expect(h.wd.health()).toBe("HEALTHY")
  })

  it("3. server dead → watchdog restarts and recovers", async () => {
    const h = harness()
    h.chaos.killServer()
    h.advance(T1 + 5_000)
    await h.wd.tick() // ping fails → restart (which revives the server)
    expect(h.calls.restartServer).toBe(1)
    expect(h.calls.fail).toBe(0)
    // Server is back; a heartbeat returns the watchdog to healthy.
    h.wd.recordHeartbeat()
    expect(h.wd.health()).toBe("HEALTHY")
  })

  it("4. session frozen → guardian aborts and retries exactly once", async () => {
    const h = harness()
    h.chaos.freezeSession() // reconcile → working, but no heartbeats
    h.advance(T2 + 1_000)
    await h.wd.tick() // working + age ≥ T2 → abort (which unfreezes)
    expect(h.calls.abortAndRetry).toBe(1)
    expect(h.calls.restartServer).toBe(0)
    // The retry starts a fresh iteration; the watchdog resets.
    h.wd.notifyIterationStart()
    expect(h.wd.health()).toBe("HEALTHY")
  })

  it("recovers across a sequence of faults without giving up", async () => {
    const h = harness()

    // Freeze → abort recovers.
    h.chaos.freezeSession()
    h.advance(T2 + 1_000)
    await h.wd.tick()
    expect(h.calls.abortAndRetry).toBe(1)
    h.wd.notifyIterationStart()

    // Then the server dies → restart recovers.
    h.chaos.killServer()
    h.advance(T1 + 1_000)
    await h.wd.tick()
    expect(h.calls.restartServer).toBe(1)
    h.wd.recordHeartbeat()

    // Never escalated to a hard failure.
    expect(h.calls.fail).toBe(0)
    expect(h.wd.health()).toBe("HEALTHY")
  })
})
