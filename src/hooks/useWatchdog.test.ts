import { describe, expect, it } from "bun:test"
import {
  createWatchdog,
  type WatchdogDiagnostics,
  type WatchdogHealth,
} from "./useWatchdog"
import type { ReconcileResult } from "../lib/api"
import type { Clock } from "../lib/clock"

const T1 = 90_000 // suspect
const T2 = 300_000 // confirm/wedged

function makeClock(start = 1_000_000) {
  let mono = start
  const clock: Clock = {
    monotonicNow: () => mono,
    wallClockNow: () => mono,
  }
  return {
    clock,
    advance: (ms: number) => {
      mono += ms
    },
  }
}

function setup(initial?: {
  isActive?: boolean
  ping?: boolean
  reconcile?: ReconcileResult
  maxRecoveryAttempts?: number
}) {
  let isActive = initial?.isActive ?? true
  let ping = initial?.ping ?? true
  let reconcile: ReconcileResult = initial?.reconcile ?? "working"

  const calls = {
    reconnectSSE: 0,
    synthesizeIdle: 0,
    abortAndRetry: 0,
    restartServer: 0,
    fail: [] as WatchdogDiagnostics[],
  }
  const healthLog: WatchdogHealth[] = []
  const clk = makeClock()
  // Fired inside the probes so a test can simulate a heartbeat (or anything)
  // landing while a probe round-trip is in flight.
  const hooks: { onPing?: () => void; onReconcile?: () => void } = {}

  const wd = createWatchdog({
    config: () => ({
      suspectMs: T1,
      confirmMs: T2,
      tickMs: 15_000,
      maxRecoveryAttempts: initial?.maxRecoveryAttempts ?? 3,
    }),
    clock: clk.clock,
    log: () => {},
    onHealthChange: (h) => healthLog.push(h),
    probes: {
      isActive: () => isActive,
      pingServer: async () => {
        hooks.onPing?.()
        return ping
      },
      reconcile: async () => {
        hooks.onReconcile?.()
        return reconcile
      },
    },
    actions: {
      reconnectSSE: () => calls.reconnectSSE++,
      synthesizeIdle: () => calls.synthesizeIdle++,
      abortAndRetry: () => {
        calls.abortAndRetry++
      },
      restartServer: () => {
        calls.restartServer++
      },
      fail: (d) => calls.fail.push(d),
    },
  })

  return {
    wd,
    calls,
    healthLog,
    clk,
    hooks,
    setActive: (v: boolean) => (isActive = v),
    setPing: (v: boolean) => (ping = v),
    setReconcile: (v: ReconcileResult) => (reconcile = v),
  }
}

describe("watchdog — the four quadrants", () => {
  it("legitimate long work (heartbeat every 60s, T1=90s) never declares STUCK", async () => {
    const s = setup({ reconcile: "working" })
    for (let i = 0; i < 12; i++) {
      s.wd.recordHeartbeat()
      s.clk.advance(60_000)
      await s.wd.tick()
      expect(s.wd.health()).toBe("HEALTHY")
    }
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.calls.restartServer).toBe(0)
    expect(s.calls.fail.length).toBe(0)
  })

  it("SSE dead but session idle → synthesizes idle, does NOT abort", async () => {
    const s = setup({ reconcile: "idle" })
    s.clk.advance(120_000) // past T1
    await s.wd.tick()
    expect(s.calls.synthesizeIdle).toBe(1)
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.calls.restartServer).toBe(0)
    expect(s.wd.health()).toBe("HEALTHY")
  })

  it("session missing → treated like idle, advances without abort", async () => {
    const s = setup({ reconcile: "missing" })
    s.clk.advance(120_000)
    await s.wd.tick()
    expect(s.calls.synthesizeIdle).toBe(1)
    expect(s.calls.abortAndRetry).toBe(0)
  })

  it("session wedged (working, age ≥ T2) aborts + retries exactly once", async () => {
    const s = setup({ reconcile: "working" })
    s.clk.advance(T2 + 1_000) // past T2
    await s.wd.tick()
    expect(s.wd.health()).toBe("RECOVERING")
    expect(s.calls.abortAndRetry).toBe(1)
    expect(s.calls.restartServer).toBe(0)
    expect(s.calls.reconnectSSE).toBe(1)
    expect(s.calls.fail.length).toBe(0)
  })

  it("server hung (ping fails) restarts; after maxRecoveryAttempts → fail w/ diagnostics", async () => {
    const s = setup({ ping: false, maxRecoveryAttempts: 3 })
    s.clk.advance(120_000) // past T1; ping will fail each confirm

    await s.wd.tick() // attempt 1 → restart
    await s.wd.tick() // attempt 2 → restart
    await s.wd.tick() // attempt 3 → restart
    expect(s.calls.restartServer).toBe(3)
    expect(s.calls.fail.length).toBe(0)

    await s.wd.tick() // attempt 4 → circuit breaker → fail
    expect(s.calls.restartServer).toBe(3)
    expect(s.calls.fail.length).toBe(1)
    expect(s.calls.fail[0].reason).toBe("server_hung")
    expect(s.calls.fail[0].attempts).toBe(3)
    expect(s.calls.fail[0].lastVerdict).toBe("ping_failed")
  })
})

describe("watchdog — anti-false-positive details", () => {
  it("does nothing when the loop is not in a guarded state", async () => {
    const s = setup({ isActive: false })
    s.clk.advance(10 * T2)
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.calls.restartServer).toBe(0)
  })

  it("working but under T2 stays SUSPECT and does not abort", async () => {
    const s = setup({ reconcile: "working" })
    s.clk.advance(120_000) // between T1 and T2
    await s.wd.tick()
    expect(s.wd.health()).toBe("SUSPECT")
    expect(s.calls.abortAndRetry).toBe(0)
  })

  it("a heartbeat after suspicion restores HEALTHY and resets recovery counter", async () => {
    const s = setup({ reconcile: "working" })
    s.clk.advance(120_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("SUSPECT")
    s.wd.recordHeartbeat()
    expect(s.wd.health()).toBe("HEALTHY")
  })

  it("notifyWake grants a fresh grace window (no false stuck after sleep)", async () => {
    const s = setup({ reconcile: "working" })
    s.clk.advance(10 * T2) // long sleep gap
    s.wd.notifyWake()
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.calls.restartServer).toBe(0)
  })

  it("unknown reconcile verdict (probe timed out) is treated as a hung server", async () => {
    const s = setup({ reconcile: "unknown" })
    s.clk.advance(120_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(1)
    expect(s.calls.abortAndRetry).toBe(0)
  })

  it("escalates a persistent wedge: abort first, then restart on the 2nd attempt", async () => {
    const s = setup({ reconcile: "working" })
    s.clk.advance(T2 + 1_000)
    await s.wd.tick() // attempt 1 → abort
    expect(s.calls.abortAndRetry).toBe(1)
    expect(s.calls.restartServer).toBe(0)
    s.clk.advance(20_000)
    await s.wd.tick() // attempt 2 → restart
    expect(s.calls.abortAndRetry).toBe(1)
    expect(s.calls.restartServer).toBe(1)
  })

  it("notifyIterationStart resets the baseline for the next iteration", async () => {
    const s = setup({ reconcile: "working" })
    s.clk.advance(T2 + 1000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("RECOVERING")
    s.wd.notifyIterationStart()
    expect(s.wd.health()).toBe("HEALTHY")
    // Fresh window: a short gap stays healthy.
    s.clk.advance(60_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
  })

  it("a heartbeat landing mid-reconcile cancels the tick (no abort on a revived session)", async () => {
    const s = setup({ reconcile: "working" })
    s.clk.advance(T2 + 1_000) // wedged on the pre-probe reading...
    // ...but a heartbeat arrives while the reconcile probe is in flight.
    s.hooks.onReconcile = () => s.wd.recordHeartbeat()
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.calls.restartServer).toBe(0)
    expect(s.wd.health()).toBe("HEALTHY")
  })

  it("a heartbeat landing mid-ping cancels the tick (no restart on a revived session)", async () => {
    const s = setup({ ping: false, reconcile: "working" })
    s.clk.advance(T2 + 1_000)
    // The SSE stream is clearly alive (it just delivered a heartbeat), so a
    // same-instant ping failure must not trigger a restart.
    s.hooks.onPing = () => s.wd.recordHeartbeat()
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(0)
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.wd.health()).toBe("HEALTHY")
  })

  it("recovery budget survives an abort+retry iteration restart (re-wedge escalates)", async () => {
    const s = setup({ reconcile: "working" })

    // Wedge #1 → abort + retry (recovery attempt 1).
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(1)
    expect(s.calls.restartServer).toBe(0)

    // In production abortAndRetry advances the loop → startIteration →
    // notifyIterationStart. The recovery budget must NOT reset here, or a
    // chronically wedging task would abort→retry forever, never escalating.
    s.wd.notifyIterationStart()

    // The retried session wedges again → escalate to a restart, not re-abort.
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(1)
    expect(s.calls.restartServer).toBe(1)
  })
})
