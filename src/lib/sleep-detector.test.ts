import { describe, expect, it } from "bun:test"
import { createSleepDetector } from "./sleep-detector"
import type { Clock } from "./clock"

/** A controllable clock: wall time is whatever we set; monotonic mirrors it. */
function fakeClock(start = 1_000_000): Clock & { wall: number } {
  const c = {
    wall: start,
    monotonicNow() {
      return c.wall
    },
    wallClockNow() {
      return c.wall
    },
  }
  return c
}

describe("createSleepDetector", () => {
  it("does not fire onWake for normal-interval ticks", () => {
    const clock = fakeClock()
    const wakes: number[] = []
    const d = createSleepDetector({
      tickMs: 5000,
      thresholdMs: 30000,
      onWake: (g) => wakes.push(g),
      clock,
    })

    // Simulate several on-time ticks (5s each).
    for (let i = 0; i < 5; i++) {
      clock.wall += 5000
      d.poll()
    }
    expect(wakes).toEqual([])
  })

  it("fires onWake when the wall-clock gap exceeds the threshold", () => {
    const clock = fakeClock()
    const wakes: number[] = []
    const d = createSleepDetector({
      tickMs: 5000,
      thresholdMs: 30000,
      onWake: (g) => wakes.push(g),
      clock,
    })

    // Simulate a 10-minute suspension between ticks.
    clock.wall += 600_000
    const gap = d.poll()

    expect(gap).toBe(600_000)
    expect(wakes).toEqual([600_000])
  })

  it("uses the gap since the last sample, not since start", () => {
    const clock = fakeClock()
    const wakes: number[] = []
    const d = createSleepDetector({
      tickMs: 5000,
      thresholdMs: 30000,
      onWake: (g) => wakes.push(g),
      clock,
    })

    clock.wall += 5000
    d.poll() // normal
    clock.wall += 40_000
    d.poll() // wake
    clock.wall += 5000
    d.poll() // normal again

    expect(wakes).toEqual([40_000])
  })

  it("ignores backwards clock movement", () => {
    const clock = fakeClock()
    const wakes: number[] = []
    const d = createSleepDetector({
      thresholdMs: 30000,
      onWake: (g) => wakes.push(g),
      clock,
    })

    clock.wall -= 100_000
    d.poll()
    expect(wakes).toEqual([])
  })

  it("tracks running state via start/stop", () => {
    const clock = fakeClock()
    const d = createSleepDetector({ onWake: () => {}, clock })
    expect(d.isRunning()).toBe(false)
    d.start()
    expect(d.isRunning()).toBe(true)
    d.stop()
    expect(d.isRunning()).toBe(false)
  })
})
