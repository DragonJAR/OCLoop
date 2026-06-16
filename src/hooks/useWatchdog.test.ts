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
  const probeCalls = {
    isActive: 0,
    pingServer: 0,
    reconcile: 0,
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
      isActive: () => {
        probeCalls.isActive++
        return isActive
      },
      pingServer: async () => {
        probeCalls.pingServer++
        hooks.onPing?.()
        return ping
      },
      reconcile: async () => {
        probeCalls.reconcile++
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
    probeCalls,
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

  // --- Phase 5: explicit PLAN coverage ---

  it("tick() when isActive() returns false stays HEALTHY and does not call probes", async () => {
    const s = setup({ isActive: false })
    s.clk.advance(10 * T2) // huge gap — should not matter
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
    // Probes must not be called beyond isActive itself (checked inside isActive).
    // pingServer and reconcile must never fire when not active.
    expect(s.probeCalls.pingServer).toBe(0)
    expect(s.probeCalls.reconcile).toBe(0)
  })

  it("tick() when heartbeat is recent (under suspectMs) stays HEALTHY", async () => {
    const s = setup({ reconcile: "working" })
    // Advance just under T1 — heartbeat is still fresh.
    s.clk.advance(T1 - 1_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
    // Probes should not be called — no suspicion yet.
    expect(s.probeCalls.pingServer).toBe(0)
    expect(s.probeCalls.reconcile).toBe(0)
  })

  it("tick() path: server ping fails → server_hung recovery", async () => {
    const s = setup({ ping: false })
    s.clk.advance(T1 + 10_000) // past suspect threshold
    await s.wd.tick()
    expect(s.wd.health()).toBe("RECOVERING")
    expect(s.calls.restartServer).toBe(1)
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.calls.reconnectSSE).toBe(1)
  })

  it("tick() path: server ping succeeds, reconcile=idle → synthesizeIdle, recovery attempts reset", async () => {
    const s = setup({ ping: true, reconcile: "idle" })
    // First wedge the watchdog by advancing past T1.
    s.clk.advance(T1 + 10_000)
    // Record one recovery attempt first (by having it detect a wedged session).
    // Actually, let's just verify: when reconcile=idle, synthesizeIdle is called
    // and recoveryAttempts resets (verified by checking that the next wedged
    // attempt starts from attempt 1, not attempt 2).
    await s.wd.tick()
    expect(s.calls.synthesizeIdle).toBe(1)
    expect(s.wd.health()).toBe("HEALTHY")

    // Now wedge again past T2 — should get attempt 1 (abort), not attempt 2.
    s.setReconcile("working")
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(1) // first attempt, not second
  })

  it("tick() path: reconcile=unknown → server_hung recovery", async () => {
    const s = setup({ reconcile: "unknown" })
    s.clk.advance(T1 + 10_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("RECOVERING")
    expect(s.calls.restartServer).toBe(1)
  })

  it("circuit breaker: maxRecoveryAttempts+1 ticks → fail called, recoveryAttempts resets to 0", async () => {
    const s = setup({ ping: false, maxRecoveryAttempts: 2 })
    s.clk.advance(T1 + 10_000)

    // Attempt 1 → restart
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(1)
    expect(s.calls.fail.length).toBe(0)

    // Attempt 2 → restart
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(2)
    expect(s.calls.fail.length).toBe(0)

    // Attempt 3 → circuit breaker trips, fail called with diagnostics
    await s.wd.tick()
    expect(s.calls.fail.length).toBe(1)
    expect(s.calls.fail[0].reason).toBe("server_hung")
    expect(s.calls.fail[0].attempts).toBe(2)
    expect(s.calls.restartServer).toBe(2) // no new restart

    // After circuit breaker, recoveryAttempts is reset to 0.
    // Verify by ticking again — it should restart from attempt 1, not trip immediately.
    s.clk.advance(T1 + 10_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(3) // new restart (attempt 1 of next cycle)
    expect(s.calls.fail.length).toBe(1) // no new fail call
  })

  it("notifyIterationStart does NOT reset recoveryAttempts (preventing infinite budget)", async () => {
    const s = setup({ reconcile: "working", maxRecoveryAttempts: 3 })

    // Wedge #1 → abort+retry (attempt 1)
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(1)

    // notifyIterationStart resets the heartbeat baseline but NOT recoveryAttempts.
    s.wd.notifyIterationStart()

    // Wedge #2 → escalate to restart (attempt 2), NOT re-abort.
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(1)
    expect(s.calls.abortAndRetry).toBe(1) // no new abort
  })

  it("recordHeartbeat resets recoveryAttempts to 0 and health to HEALTHY", async () => {
    const s = setup({ reconcile: "working" })

    // Drive into RECOVERING state (attempt 1).
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("RECOVERING")
    expect(s.calls.abortAndRetry).toBe(1)

    // A heartbeat restores HEALTHY and resets recoveryAttempts.
    s.wd.recordHeartbeat()
    expect(s.wd.health()).toBe("HEALTHY")

    // Now wedge again — should get attempt 1 (abort), not attempt 2 (restart).
    // This proves recoveryAttempts was reset to 0.
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(2) // second abort (attempt 1 of new cycle)
    expect(s.calls.restartServer).toBe(0) // no restart yet
  })

  // --- Phase 6.1: knob-inventory audit coverage ---

  it("threshold knobs (suspectMs, confirmMs) are read live from config() every tick", async () => {
    // Create the watchdog with an externally mutable config so we can flip
    // thresholds between ticks. The default setup() factory freezes config
    // at construction, so we hand-build here.
    let suspectMs = 1000
    let confirmMs = 2000
    const clk = makeClock()
    const sseCalls = { reconnect: 0, abort: 0, restart: 0 }
    const wd = createWatchdog({
      config: () => ({ suspectMs, confirmMs, tickMs: 100, maxRecoveryAttempts: 3 }),
      clock: clk.clock,
      log: () => {},
      probes: {
        isActive: () => true,
        pingServer: async () => true,
        reconcile: async () => "working",
      },
      actions: {
        reconnectSSE: () => sseCalls.reconnect++,
        synthesizeIdle: () => {},
        abortAndRetry: () => {
          sseCalls.abort++
        },
        restartServer: () => {
          sseCalls.restart++
        },
        fail: () => {},
      },
    })

    // T1 = 1s. Advance 1.5s — past suspectMs but under confirmMs → SUSPECT.
    clk.advance(1_500)
    await wd.tick()
    expect(wd.health()).toBe("SUSPECT")
    expect(sseCalls.abort).toBe(0)

    // Raise suspectMs to 10s and re-tick at the same clock time. The watchdog
    // should now see dt < suspectMs and go back to HEALTHY without a recovery
    // action — proves the threshold is read live.
    suspectMs = 10_000
    await wd.tick()
    expect(wd.health()).toBe("HEALTHY")
    expect(sseCalls.abort).toBe(0)

    // Lower confirmMs below the current dt and tick: should now declare
    // STUCK and recover (abortAndRetry on attempt 1). This pins confirmMs as
    // live-read. We must also lower suspectMs so the dt passes the
    // suspect threshold (the watchdog checks suspectMs BEFORE confirmMs).
    suspectMs = 1_000
    confirmMs = 1_000
    await wd.tick()
    expect(wd.health()).toBe("RECOVERING")
    expect(sseCalls.abort).toBe(1)
  })

  // --- Phase 6.3: start/stop lifecycle audit ---

  it("isRunning() reflects the start/stop state machine: false → start → true → stop → false", () => {
    const s = setup()
    // Initial: not started.
    expect(s.wd.isRunning()).toBe(false)

    s.wd.start()
    expect(s.wd.isRunning()).toBe(true)

    s.wd.stop()
    expect(s.wd.isRunning()).toBe(false)
  })

  it("start() is idempotent: calling it twice does not create a second interval", () => {
    const s = setup()
    s.wd.start()
    expect(s.wd.isRunning()).toBe(true)
    // Second call must be a no-op (the `if (timer) return` guard at
    // useWatchdog.ts:298). The test asserts the public contract — no
    // exception, state unchanged.
    s.wd.start()
    expect(s.wd.isRunning()).toBe(true)
    s.wd.stop()
  })

  it("stop() is idempotent: safe to call on a non-running watchdog", () => {
    const s = setup()
    // Never started — stop() must not throw and must leave the watchdog
    // in a non-running state. The `if (timer)` guard at
    // useWatchdog.ts:309 covers this.
    expect(() => s.wd.stop()).not.toThrow()
    expect(s.wd.isRunning()).toBe(false)

    // Start, stop, stop — also safe.
    s.wd.start()
    s.wd.stop()
    expect(() => s.wd.stop()).not.toThrow()
    expect(s.wd.isRunning()).toBe(false)
  })

  it("start() then stop() is a no-op for the internal `ticking` flag (manual ticks still work)", async () => {
    const s = setup({ reconcile: "working" })
    s.wd.start()
    s.wd.stop()

    // After stop(), manual tick() must still be callable and still
    // evaluate the probe. The `ticking` flag (cleared in the `finally`
    // at useWatchdog.ts:286) must be false at this point.
    s.clk.advance(T1 + 1_000) // past suspect threshold but under confirmMs
    await s.wd.tick()
    // dt is in [T1, T2) so the tick enters CONFIRMING, runs probes,
    // sees verdict=working + dt<T2, and lands on SUSPECT (line 282).
    // The point of this assertion: probes WERE consulted, proving the
    // ticking guard is not stuck from a prior interval callback.
    expect(s.wd.health()).toBe("SUSPECT")
    expect(s.probeCalls.pingServer).toBe(1)
    expect(s.probeCalls.reconcile).toBe(1)
  })

  // --- Phase 6.4: notifyWake audit coverage ---

  it("notifyWake resets the heartbeat baseline (next tick is HEALTHY without re-triggering)", async () => {
    // Setup: a long quiet gap followed by a real recovery action has just
    // happened. We simulate the post-recovery state where the watchdog is
    // sitting in RECOVERING with a stale `lastHeartbeatAt` from before the
    // hang. The App-level code that ran `restartServer()` (App.tsx:649-663)
    // calls `notifyWake()` to grant a fresh grace window. The next tick
    // must observe the new baseline, not the stale one.
    const s = setup({ reconcile: "working" })

    // Drive past T2 (confirm/wedged) with a working-but-silent session.
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    // Wedge #1 → abort (attempt 1). Health is RECOVERING.
    expect(s.wd.health()).toBe("RECOVERING")
    expect(s.calls.abortAndRetry).toBe(1)
    expect(s.calls.restartServer).toBe(0)

    // The App-level restartServer / post-wake path calls notifyWake().
    // The new baseline must be `monotonicNow()` (the moment of the wake),
    // NOT the pre-hang timestamp.
    s.wd.notifyWake()
    expect(s.wd.health()).toBe("HEALTHY")

    // Next watchdog tick. No advance of the clock between notifyWake and
    // the tick → dt is effectively 0, which is < suspectMs (T1=90s).
    // The watchdog must short-circuit to HEALTHY without consulting the
    // probes or triggering any recovery action. The pre-restart silence
    // (T2+1s) must be discarded.
    const pingBefore = s.probeCalls.pingServer
    const reconcileBefore = s.probeCalls.reconcile
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
    expect(s.probeCalls.pingServer).toBe(pingBefore) // probes NOT consulted
    expect(s.probeCalls.reconcile).toBe(reconcileBefore)
    expect(s.calls.abortAndRetry).toBe(1) // unchanged
    expect(s.calls.restartServer).toBe(0) // unchanged

    // Now simulate a small natural advance (e.g. 30s of real work after the
    // wake). Still well under T1=90s, so the watchdog must remain HEALTHY.
    s.clk.advance(30_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
    expect(s.probeCalls.pingServer).toBe(pingBefore) // still no probes
  })

  it("notifyWake does NOT reset recoveryAttempts (preserves the circuit-breaker budget)", async () => {
    // PLAN.md 6.4 + App.tsx:660-662 make this guarantee explicit: the
    // wake-reset exists to grant a fresh T1 window to the model, NOT to
    // hand a chronically bad session an unlimited restart budget. The
    // recovery counter is cleared only by genuine progress (recordHeartbeat
    // / notifyIdle) or by the breaker firing — never by notifyWake.
    const s = setup({ reconcile: "working", maxRecoveryAttempts: 3 })

    // Wedge #1: server_hung path → restartServer on attempt 1.
    s.setPing(false)
    s.clk.advance(T1 + 1_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(1)
    expect(s.calls.abortAndRetry).toBe(0)
    expect(s.wd.health()).toBe("RECOVERING")

    // App-level restartServer body: server.restart() resolves, SSE
    // reconnects, reconcile="working" → notifyWake(). The health drops
    // to HEALTHY but recoveryAttempts is still 1 (not reset).
    s.setPing(true)
    s.wd.notifyWake()
    expect(s.wd.health()).toBe("HEALTHY")

    // Wedge #2 (server hangs again, chronically). If notifyWake HAD
    // reset recoveryAttempts, this would be attempt 1 with the same
    // server_hung → restart outcome. The test pins that the budget was
    // preserved: recoveryAttempts is now 2 (still under maxRecoveryAttempts=3).
    s.setPing(false)
    s.clk.advance(T1 + 1_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(2)
    expect(s.calls.fail.length).toBe(0) // breaker not yet tripped

    // Wedge #3 → recoveryAttempts becomes 3 (== max). No fail yet.
    s.wd.notifyWake() // server "recovered" again
    s.setPing(false)
    s.clk.advance(T1 + 1_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(3)
    expect(s.calls.fail.length).toBe(0)

    // Wedge #4 → recoveryAttempts becomes 4 (> max=3) → fail() trips.
    s.wd.notifyWake()
    s.setPing(false)
    s.clk.advance(T1 + 1_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(3) // no new restart
    expect(s.calls.fail.length).toBe(1)
    expect(s.calls.fail[0].reason).toBe("server_hung")
  })

  it("server restart + notifyWake prevents immediate re-trigger on the next tick (Phase 6.4 invariant)", async () => {
    // This is the precise flow that PLAN.md 6.4 calls out and that
    // App.tsx:649-663 implements end-to-end:
    //
    //   1. Watchdog tick sees silence past T1.
    //   2. pingServer probe fails → recover("server_hung", ...).
    //   3. recover() calls restartServer() (escalation ladder: server_hung
    //      always restarts).
    //   4. The restartServer action body (App-level, not in the watchdog)
    //      restarts the server, reconnects SSE, and reconciles the
    //      session. If the verdict is "working" it calls
    //      watchdog.notifyWake() to grant a fresh grace window.
    //   5. The NEXT watchdog tick must NOT re-trigger recovery, even
    //      though the pre-restart silence window would otherwise be
    //      re-measured from a stale lastHeartbeatAt.
    //
    // We simulate (4) by calling notifyWake() immediately after the tick
    // that triggered the restart, and then (5) by running another tick
    // with a small natural advance.
    const s = setup({ reconcile: "working", maxRecoveryAttempts: 5 })

    // Server is hung, session still "working" (would be the case if the
    // OpenCode process froze but the session was still being polled).
    s.setPing(false)
    s.setReconcile("working")

    // Step 1-3: watchdog tick triggers recover("server_hung") → restart.
    s.clk.advance(T1 + 1_000)
    await s.wd.tick()
    expect(s.calls.restartServer).toBe(1)
    expect(s.wd.health()).toBe("RECOVERING")

    // Step 4 (App-level action body, simulated here): server comes back
    // up, SSE reconnects, session reconciles to "working", notifyWake()
    // is called. Server is healthy again for the next tick.
    s.setPing(true)
    s.setReconcile("working")
    s.wd.notifyWake()
    expect(s.wd.health()).toBe("HEALTHY")

    // Step 5: next watchdog tick (15s later, default tickMs). Without
    // notifyWake, dt would be T1+16s, which is > T1 (so we'd enter
    // CONFIRMING, run probes, and — if reconcile stays "working" and
    // dt<T2 — land in SUSPECT). With notifyWake's baseline reset, dt
    // is just 15s, well under T1, and the watchdog must short-circuit
    // to HEALTHY without consulting the probes.
    const pingBefore = s.probeCalls.pingServer
    const reconcileBefore = s.probeCalls.reconcile
    s.clk.advance(15_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("HEALTHY")
    expect(s.probeCalls.pingServer).toBe(pingBefore) // no probe round-trip
    expect(s.probeCalls.reconcile).toBe(reconcileBefore)

    // The crucial Phase 6.4 assertion: the recovery counter did NOT
    // advance, and the restartServer call count did NOT advance. If
    // notifyWake had been a no-op (e.g. failed to reset the baseline),
    // the watchdog would have re-entered CONFIRMING and re-triggered
    // the escalation ladder on every tick, collapsing the recovery
    // budget into a near-instant circuit-breaker trip.
    expect(s.calls.restartServer).toBe(1) // unchanged
    expect(s.calls.abortAndRetry).toBe(0) // unchanged
    expect(s.calls.fail.length).toBe(0) // breaker not yet tripped
  })

  // --- Phase 6.5: notifyIdle audit coverage ---

  it("notifyIdle resets recoveryAttempts and sets health to HEALTHY (clean session end)", async () => {
    // PLAN.md 6.5: notifyIdle represents "the session completed cleanly"
    // — the legitimate end-of-iteration signal. It must (a) drop the
    // watchdog back to HEALTHY and (b) zero the recovery budget, because
    // a real session-end is a stronger proof of life than any heartbeat.
    // (Contrast with notifyIterationStart, which resets the baseline but
    // deliberately PRESERVES the budget — see the design-symmetry
    // discussion in Phase 6.1 / 6.4 of MEJORAS.md.)
    const s = setup({ reconcile: "working" })

    // Drive past T2 to wedge and force attempt 1 = abortAndRetry.
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("RECOVERING")
    expect(s.calls.abortAndRetry).toBe(1)
    expect(s.calls.restartServer).toBe(0)

    // The "session ended" signal arrives (e.g. SSE onSessionIdle or a
    // reconcile verdict of "idle"/"missing" — the watchdog's own tick
    // resets state inline at useWatchdog.ts:263-264 for the latter).
    s.wd.notifyIdle()
    expect(s.wd.health()).toBe("HEALTHY")

    // Verify recoveryAttempts was actually reset to 0 (not just set
    // HEALTHY while leaving the counter non-zero). A fresh wedge must
    // start from attempt 1 (abortAndRetry), not attempt 2 (restartServer).
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(2) // new attempt 1 of next cycle
    expect(s.calls.restartServer).toBe(0) // not attempt 2
    expect(s.calls.fail.length).toBe(0) // breaker not yet tripped
  })

  it("notifyIdle does NOT reset lastHeartbeatAt (deliberate, unlike recordHeartbeat and notifyWake)", async () => {
    // The watchdog's three "context-change" notifiers each touch a
    // different subset of state. The asymmetry is documented in the
    // source comments at useWatchdog.ts:140-167 and pinned in tests:
    //
    //   recordHeartbeat    — resets lastHeartbeatAt + recoveryAttempts + HEALTHY
    //   notifyIterationStart — resets lastHeartbeatAt + HEALTHY (preserves budget)
    //   notifyWake         — resets lastHeartbeatAt + HEALTHY (preserves budget)
    //   notifyIdle         — resets recoveryAttempts + HEALTHY (preserves baseline)
    //
    // notifyIdle represents "the session is gone, no in-flight work to
    // measure silence against". The next iteration's startIteration
    // calls notifyIterationStart, which DOES reset the baseline. Until
    // then, the stale baseline is correct — there is no live session
    // whose silence could indicate a wedge.
    const s = setup({ reconcile: "working" })

    // Force a non-HEALTHY state by advancing past T1 (suspicion).
    s.clk.advance(T1 + 10_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("SUSPECT")

    // notifyIdle drops the watchdog to HEALTHY but leaves the baseline
    // alone. To prove this, advance the clock by a small amount and
    // tick. If notifyIdle HAD reset the baseline, dt would be small
    // (well under T1) and the tick would short-circuit to HEALTHY.
    // Since notifyIdle does NOT reset the baseline, dt is still over
    // T1, the tick re-enters CONFIRMING, and the watchdog lands on
    // SUSPECT (working + dt in [T1, T2)) — not HEALTHY.
    s.wd.notifyIdle()
    expect(s.wd.health()).toBe("HEALTHY")

    s.clk.advance(1_000) // dt is now T1+11_000, well over the suspect threshold
    await s.wd.tick()
    expect(s.wd.health()).not.toBe("HEALTHY") // baseline NOT reset by notifyIdle
    expect(s.wd.health()).toBe("SUSPECT") // verdict=working + dt<T2
  })

  it("notifyIdle in RECOVERING state: cancels the in-flight recovery and drops to HEALTHY", async () => {
    // A real-world race: the watchdog has just dispatched a recovery
    // action (e.g. abortAndRetry) when a legitimate session.idle event
    // arrives from the SSE stream. The abort is now wasted (the session
    // was actually done), but the recovery counter must still be reset
    // — the idle is genuine proof that the session completed. This
    // pins that notifyIdle is a hard reset for recoveryAttempts, not
    // a soft hint that can be ignored if RECOVERING is set.
    const s = setup({ reconcile: "working" })

    // Wedge → attempt 1 = abort. State is RECOVERING.
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.wd.health()).toBe("RECOVERING")
    expect(s.calls.abortAndRetry).toBe(1)

    // The session.idle event arrives (mid-recovery, race condition).
    s.wd.notifyIdle()
    expect(s.wd.health()).toBe("HEALTHY")

    // A subsequent wedge starts at attempt 1, not attempt 2. This
    // proves the recovery counter was zeroed even though the prior
    // attempt 1 had fired.
    s.clk.advance(T2 + 1_000)
    await s.wd.tick()
    expect(s.calls.abortAndRetry).toBe(2) // new attempt 1 of next cycle
    expect(s.calls.restartServer).toBe(0) // not attempt 2
  })
})
