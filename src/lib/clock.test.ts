import { describe, expect, it } from "bun:test"
import { monotonicNow, wallClockNow, systemClock } from "./clock"

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("clock", () => {
  it("monotonicNow returns a finite, non-negative number", () => {
    const t = monotonicNow()
    expect(Number.isFinite(t)).toBe(true)
    expect(t).toBeGreaterThanOrEqual(0)
  })

  it("monotonicNow never runs backwards and advances with real time", async () => {
    const a = monotonicNow()
    await delay(15)
    const b = monotonicNow()
    expect(b).toBeGreaterThanOrEqual(a)
    // ~15ms should have elapsed; allow generous slack for CI timers.
    expect(b - a).toBeGreaterThan(5)
  })

  it("wallClockNow tracks Date.now()", () => {
    const before = Date.now()
    const w = wallClockNow()
    const after = Date.now()
    expect(w).toBeGreaterThanOrEqual(before)
    expect(w).toBeLessThanOrEqual(after)
  })

  it("systemClock exposes both clocks", () => {
    expect(typeof systemClock.monotonicNow()).toBe("number")
    expect(typeof systemClock.wallClockNow()).toBe("number")
  })
})
