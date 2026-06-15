/**
 * Sleep / suspension detector by wall-clock drift.
 *
 * A repeating timer is supposed to fire every `tickMs`. While the machine is
 * suspended (lid closed, system sleep) timers don't fire, so when the process
 * wakes the next tick lands much later than scheduled. By comparing the *actual*
 * wall-clock gap between ticks against a threshold we can tell the system was
 * asleep and fire `onWake(gapMs)`.
 *
 * We compare wall-clock readings here on purpose — this is the one place where
 * a wall-clock jump IS the signal (everywhere else we use the monotonic clock so
 * a jump can't fool us). The clock is injectable so the decision is unit-testable
 * without real timers or real sleeping.
 */

import { type Clock, systemClock } from "./clock"

export interface SleepDetectorOptions {
  /** Sampling interval in ms (default 5000). */
  tickMs?: number
  /** Gap beyond which we conclude the system was suspended (default 30000). */
  thresholdMs?: number
  /** Called when a wake (large wall-clock gap) is detected. */
  onWake: (gapMs: number) => void
  /** Injectable clock for tests. Defaults to the real system clock. */
  clock?: Clock
}

export interface SleepDetector {
  /** Begin sampling. Resets the baseline to "now". Idempotent. */
  start(): void
  /** Stop sampling. */
  stop(): void
  /**
   * Evaluate the gap since the last sample once. Called by the internal timer;
   * exposed so tests can drive it deterministically with a fake clock. Returns
   * the observed gap (ms).
   */
  poll(): number
  /** Whether sampling is currently active. */
  isRunning(): boolean
}

export function createSleepDetector(options: SleepDetectorOptions): SleepDetector {
  const clock = options.clock ?? systemClock
  const tickMs = options.tickMs ?? 5000
  const thresholdMs = options.thresholdMs ?? 30000

  let lastSeen = clock.wallClockNow()
  let timer: ReturnType<typeof setInterval> | null = null

  function poll(): number {
    const now = clock.wallClockNow()
    const gap = now - lastSeen
    lastSeen = now
    // A negative gap (clock moved backwards) is not a wake; ignore it.
    if (gap > thresholdMs) {
      options.onWake(gap)
    }
    return gap
  }

  return {
    start() {
      if (timer) return
      lastSeen = clock.wallClockNow()
      timer = setInterval(poll, tickMs)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    poll,
    isRunning() {
      return timer !== null
    },
  }
}
