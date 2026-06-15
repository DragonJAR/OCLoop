/**
 * Clocks for OCLoop resilience logic.
 *
 * Two distinct notions of time, deliberately kept separate:
 *
 * - `monotonicNow()` — milliseconds from a monotonic source that never runs
 *   backwards and is immune to wall-clock jumps (NTP corrections, manual clock
 *   changes, daylight-saving). Use this for ALL interval / timeout / watchdog /
 *   backoff math. Comparing two monotonic readings always yields a real elapsed
 *   duration, never a phantom jump.
 *
 * - `wallClockNow()` — `Date.now()` in milliseconds. Use this ONLY for (a)
 *   sleep / suspension detection, where the whole point is to notice the wall
 *   clock leaping forward relative to the monotonic clock, and (b) human-facing
 *   timestamps in logs. NEVER use it to measure how much time has passed.
 *
 * A `Clock` interface is exported so watchdog / sleep-detector / backoff timers
 * can be driven by injectable, deterministic clocks in tests instead of mutating
 * global time.
 */

export interface Clock {
  /** Monotonic milliseconds; immune to wall-clock jumps. */
  monotonicNow(): number
  /** Wall-clock milliseconds (Date.now()). Only for sleep detection / display. */
  wallClockNow(): number
}

/**
 * Monotonic time in milliseconds.
 *
 * Prefers `Bun.nanoseconds()` (guaranteed monotonic since process start) and
 * falls back to `performance.now()` (also monotonic) outside Bun.
 */
export function monotonicNow(): number {
  const b = (globalThis as { Bun?: { nanoseconds?: () => number } }).Bun
  if (b && typeof b.nanoseconds === "function") {
    return b.nanoseconds() / 1_000_000
  }
  return performance.now()
}

/**
 * Wall-clock time in milliseconds. Equivalent to `Date.now()`.
 */
export function wallClockNow(): number {
  return Date.now()
}

/**
 * The default, real clock backed by the process clocks.
 */
export const systemClock: Clock = {
  monotonicNow,
  wallClockNow,
}
