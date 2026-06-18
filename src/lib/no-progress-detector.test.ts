import { describe, expect, it } from "bun:test"
import { NoProgressDetector } from "./no-progress-detector"

describe("NoProgressDetector", () => {
  describe("constructor", () => {
    it("accepts a positive integer threshold", () => {
      expect(() => new NoProgressDetector(1)).not.toThrow()
      expect(() => new NoProgressDetector(3)).not.toThrow()
      expect(() => new NoProgressDetector(1000)).not.toThrow()
    })

    it("rejects non-positive thresholds", () => {
      expect(() => new NoProgressDetector(0)).toThrow(/positive integer/)
      expect(() => new NoProgressDetector(-1)).toThrow(/positive integer/)
    })

    it("rejects non-integer thresholds", () => {
      expect(() => new NoProgressDetector(1.5)).toThrow(/positive integer/)
      expect(() => new NoProgressDetector(Number.NaN)).toThrow(/positive integer/)
      // The threshold is a "positive integer", so 0 must throw. Confirm
      // the message is descriptive enough to point at the offending field.
    })
  })

  describe("recordIterationStart — first call", () => {
    it("seeds the streak at 1 with the first task", () => {
      const d = new NoProgressDetector(3)
      expect(d.recordIterationStart("task A")).toBe(1)
      expect(d.count).toBe(1)
      expect(d.currentTask).toBe("task A")
    })

    it("is not stuck after the first call (threshold > 1)", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(false)
    })

    it("is stuck immediately when threshold is 1", () => {
      // Threshold of 1 is the strictest setting: any single start with
      // a task is considered stuck. Mostly useful for tests, but the
      // contract supports it.
      const d = new NoProgressDetector(1)
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(true)
    })
  })

  describe("recordIterationStart — same task repeated", () => {
    it("increments the streak on repeat", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      expect(d.count).toBe(2)
      expect(d.recordIterationStart("task A")).toBe(3)
      expect(d.count).toBe(3)
    })

    it("trips isStuck at the threshold (3 consecutive)", () => {
      // The headline contract: three iterations with the same task
      // description means the agent is stuck redoing the same work.
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(false)
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(false)
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(true)
    })

    it("counts an extra repeat past the threshold (the trip is sticky)", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      expect(d.count).toBe(4)
      expect(d.isStuck()).toBe(true)
    })

    it("treats tasks as equal by exact string match (no normalisation)", () => {
      // Trailing whitespace, case, and inner whitespace changes are
      // NOT collapsed — the detector compares what PLAN.md returns
      // verbatim. A regression that "helpfully" trimmed would
      // accidentally halt on legitimate work where the same task
      // description has different surrounding whitespace between
      // edits. Pin the strict equality.
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A ") // trailing space
      expect(d.count).toBe(1) // different — reset
      d.recordIterationStart("Task A") // different case
      expect(d.count).toBe(1) // still 1, different again
    })
  })

  describe("recordIterationStart — task changes (progress!)", () => {
    it("resets the streak when the task changes", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.recordIterationStart("task B")
      expect(d.count).toBe(1)
      expect(d.currentTask).toBe("task B")
      expect(d.isStuck()).toBe(false)
    })

    it("a task change after a stuck streak recovers the detector", () => {
      // Recovery path: the agent was stuck on A, then makes progress
      // (B), the detector must reset so future A-repeats get a fresh
      // threshold window.
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(true)
      d.recordIterationStart("task B")
      expect(d.isStuck()).toBe(false)
      expect(d.count).toBe(1)
      d.recordIterationStart("task B")
      d.recordIterationStart("task B")
      expect(d.isStuck()).toBe(true) // fresh threshold reached
    })
  })

  describe("recordIterationStart — null (plan empty / complete)", () => {
    it("resets the streak when the task is null", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.recordIterationStart(null)
      expect(d.count).toBe(0)
      expect(d.currentTask).toBeNull()
      expect(d.isStuck()).toBe(false)
    })

    it("a null call is itself not stuck", () => {
      // Even at threshold=1, a null task is not stuck — the plan has
      // nothing to be stuck on.
      const d = new NoProgressDetector(1)
      expect(d.recordIterationStart(null)).toBe(0)
      expect(d.isStuck()).toBe(false)
    })

    it("a new task after a null resets cleanly to streak=1", () => {
      // Walk: A, A, null, B → count is 1 (B), not a continuation of A.
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.recordIterationStart(null)
      expect(d.recordIterationStart("task B")).toBe(1)
      expect(d.currentTask).toBe("task B")
    })
  })

  describe("reset", () => {
    it("clears the streak and the current task", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(true)
      d.reset()
      expect(d.count).toBe(0)
      expect(d.currentTask).toBeNull()
      expect(d.isStuck()).toBe(false)
    })

    it("after reset, a new task seeds count=1 (not a continuation)", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      d.reset()
      expect(d.recordIterationStart("task A")).toBe(1)
    })
  })

  describe("isStuck — interaction with streak counter", () => {
    it("isStuck is false when the streak is 0 (no iterations yet)", () => {
      const d = new NoProgressDetector(3)
      expect(d.isStuck()).toBe(false)
    })

    it("isStuck is false when the streak is 1 < threshold (one iteration, threshold 3)", () => {
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(false)
    })

    it("isStuck becomes true exactly at the threshold (off-by-one pin)", () => {
      // A regression that used `>` instead of `>=` would let the
      // detector run one extra iteration before tripping. The bug
      // would be invisible to a "isStuck at threshold+1" test, so we
      // pin the exact transition.
      const d = new NoProgressDetector(3)
      d.recordIterationStart("task A")
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(false) // streak=2, threshold=3
      d.recordIterationStart("task A")
      expect(d.isStuck()).toBe(true) // streak=3, threshold=3
    })
  })
})
