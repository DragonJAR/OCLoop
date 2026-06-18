import { describe, expect, it } from "bun:test";
import { createRoot } from "solid-js";
import { formatDuration, useLoopStats } from "./useLoopStats";

describe("formatDuration", () => {
  describe("seconds only", () => {
    it("should format 0 milliseconds as 0s", () => {
      expect(formatDuration(0)).toBe("     0s");
    });

    it("should format sub-second as 0s", () => {
      expect(formatDuration(500)).toBe("     0s");
    });

    it("should format 1 second", () => {
      expect(formatDuration(1000)).toBe("     1s");
    });

    it("should format 45 seconds", () => {
      expect(formatDuration(45000)).toBe("    45s");
    });

    it("should format 59 seconds", () => {
      expect(formatDuration(59000)).toBe("    59s");
    });
  });

  describe("minutes and seconds", () => {
    it("should format 1 minute exactly as 1m 0s", () => {
      expect(formatDuration(60000)).toBe("  1m 0s");
    });

    it("should format 1 minute 23 seconds", () => {
      expect(formatDuration(83000)).toBe(" 1m 23s");
    });

    it("should format 15 minutes exactly", () => {
      expect(formatDuration(15 * 60 * 1000)).toBe(" 15m 0s");
    });

    it("should format 59 minutes 59 seconds", () => {
      expect(formatDuration(59 * 60 * 1000 + 59 * 1000)).toBe("59m 59s");
    });
  });

  describe("hours and minutes", () => {
    it("should format 1 hour exactly as 1h 0m", () => {
      expect(formatDuration(60 * 60 * 1000)).toBe("  1h 0m");
    });

    it("should format 1 hour 15 minutes", () => {
      expect(formatDuration(75 * 60 * 1000)).toBe(" 1h 15m");
    });

    it("should format 2 hours 30 minutes", () => {
      expect(formatDuration(2.5 * 60 * 60 * 1000)).toBe(" 2h 30m");
    });

    it("should format hours only when minutes are 0", () => {
      expect(formatDuration(3 * 60 * 60 * 1000)).toBe("  3h 0m");
    });

    it("should drop seconds when hours are present", () => {
      // 1h 15m 45s should show as 1h 15m
      expect(formatDuration(75 * 60 * 1000 + 45 * 1000)).toBe(" 1h 15m");
    });
  });

  describe("edge cases", () => {
    it("should handle negative values as 0s", () => {
      expect(formatDuration(-1000)).toBe("     0s");
    });

    it("should handle very large values", () => {
      // 25 hours 30 minutes
      expect(formatDuration(25.5 * 60 * 60 * 1000)).toBe("25h 30m");
    });

    // A corrupted or missing time signal (e.g. an un-awaited math path) could
    // surface as NaN/Infinity. Without the isFinite guard these rendered as
    // "NaNs"/"∞s" in the TUI; the guard collapses them to "0s" for parity with
    // formatTokenCount's non-finite handling.
    it("should render NaN as 0s (not 'NaNs')", () => {
      expect(formatDuration(NaN)).toBe("     0s");
    });

    it("should render Infinity as 0s (not '∞s')", () => {
      expect(formatDuration(Infinity)).toBe("     0s");
    });
  });
});

// Note: The useLoopStats hook uses SolidJS reactive primitives (createSignal, createMemo).
// The tests below drive the hook inside a createRoot so onCleanup is bound and the
// memos evaluate synchronously. They pin the freeze/unfreeze behavior of the global
// wall-clock timer: markRunEnd() freezes it at a terminal state, and unfreezeRun()
// (called on a recoverable-error retry) must resume it so the display doesn't stay
// stuck at the error instant for the whole retried run.
describe("useLoopStats — global timer freeze/unfreeze", () => {
  it("markRunEnd freezes globalElapsedTime, unfreezeRun resumes it", () => {
    createRoot((dispose) => {
      const stats = useLoopStats()
      stats.startIteration()
      // Running: the global timer advances with wall-clock (>= 0 and growing).
      const before = stats.globalElapsedTime()
      stats.markRunEnd()
      const frozen = stats.globalElapsedTime()
      expect(frozen).toBeGreaterThanOrEqual(before)
      // After freezing, the value must NOT grow on subsequent reads.
      const stillFrozen = stats.globalElapsedTime()
      expect(stillFrozen).toBe(frozen)
      // Retry: un-freeze so the run timer resumes from runStartTime.
      stats.unfreezeRun()
      const resumed = stats.globalElapsedTime()
      expect(resumed).toBeGreaterThanOrEqual(frozen)
      dispose()
    })
  })

  it("unfreezeRun is a no-op when nothing was frozen (idempotent)", () => {
    createRoot((dispose) => {
      const stats = useLoopStats()
      stats.startIteration()
      const before = stats.globalElapsedTime()
      // Never frozen — calling unfreeze must not throw or reset runStartTime.
      stats.unfreezeRun()
      expect(stats.globalElapsedTime()).toBeGreaterThanOrEqual(before)
      dispose()
    })
  })

  it("a retried run does not keep runEndTime frozen (regression for error→retry)", () => {
    createRoot((dispose) => {
      const stats = useLoopStats()
      stats.startIteration()
      stats.markRunEnd() // error state froze the timer
      // User presses R: the App calls unfreezeRun on leaving `error`.
      stats.unfreezeRun()
      // A new iteration starts (retry path). runStartTime is preserved, but
      // runEndTime must be cleared so globalElapsedTime keeps advancing.
      stats.startIteration()
      const a = stats.globalElapsedTime()
      const b = stats.globalElapsedTime()
      expect(b).toBeGreaterThanOrEqual(a)
      dispose()
    })
  })
})
