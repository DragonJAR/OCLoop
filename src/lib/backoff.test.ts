import { describe, expect, it } from "bun:test"
import { computeBackoff } from "./backoff"

describe("computeBackoff", () => {
  describe("without jitter (monotonicity + cap)", () => {
    const opts = { base: 1000, max: 60_000, jitter: false }

    it("grows exponentially per attempt", () => {
      expect(computeBackoff(0, opts)).toBe(1000)
      expect(computeBackoff(1, opts)).toBe(2000)
      expect(computeBackoff(2, opts)).toBe(4000)
      expect(computeBackoff(3, opts)).toBe(8000)
    })

    it("is monotonically non-decreasing across attempts", () => {
      let prev = -1
      for (let a = 0; a < 12; a++) {
        const v = computeBackoff(a, opts)
        expect(v).toBeGreaterThanOrEqual(prev)
        prev = v
      }
    })

    it("never exceeds the max cap, even for huge attempts", () => {
      expect(computeBackoff(10, opts)).toBe(60_000)
      expect(computeBackoff(100, opts)).toBe(60_000)
      expect(computeBackoff(1000, opts)).toBe(60_000)
    })
  })

  describe("with full jitter", () => {
    it("stays within [0, exp] for the boundary RNG values", () => {
      const base = 1000
      const max = 60_000
      for (let a = 0; a < 10; a++) {
        const exp = Math.min(max, base * Math.pow(2, a))
        const low = computeBackoff(a, { base, max, jitter: true, random: () => 0 })
        const high = computeBackoff(a, {
          base,
          max,
          jitter: true,
          random: () => 0.999999,
        })
        expect(low).toBe(0)
        expect(high).toBeGreaterThanOrEqual(0)
        expect(high).toBeLessThanOrEqual(exp)
      }
    })

    it("produces a mid value at random()=0.5", () => {
      // attempt 2 → exp = 4000, mid = 2000
      expect(
        computeBackoff(2, { base: 1000, max: 60_000, jitter: true, random: () => 0.5 }),
      ).toBe(2000)
    })

    it("clamps out-of-range RNG output defensively", () => {
      const v = computeBackoff(0, {
        base: 1000,
        max: 60_000,
        jitter: true,
        random: () => 5,
      })
      expect(v).toBeLessThanOrEqual(1000)
      expect(v).toBeGreaterThanOrEqual(0)
    })
  })

  describe("Retry-After priority", () => {
    it("returns the server value (ms) regardless of the formula", () => {
      const v = computeBackoff(0, {
        base: 1000,
        max: 60_000,
        jitter: true,
        retryAfterSeconds: 30,
        random: () => 0.5,
      })
      expect(v).toBe(30_000)
    })

    it("overrides even when it exceeds max", () => {
      const v = computeBackoff(5, {
        base: 1000,
        max: 60_000,
        retryAfterSeconds: 120,
      })
      expect(v).toBe(120_000)
    })

    it("never returns a negative delay", () => {
      const v = computeBackoff(0, {
        base: 1000,
        max: 60_000,
        retryAfterSeconds: -10,
      })
      expect(v).toBe(0)
    })
  })
})
