/**
 * Synchronous-claim mutex for async launch operations.
 *
 * `tryRunExclusive` sets `locked` before the first `await`, so two callers
 * scheduled in the same macrotask (or via back-to-back microtasks before fn
 * yields) cannot both pass the guard — unlike a boolean checked-then-set
 * around an async IIFE where `inFlight = promise` runs after the inner fn
 * has already suspended.
 */
export interface LaunchGate {
  /**
   * Run `fn` if no operation is in flight. Returns `true` when `fn` was
   * invoked (even if it returned early), `false` when skipped because another
   * launch is active.
   */
  tryRunExclusive(fn: () => Promise<void>): Promise<boolean>
}

export function createLaunchGate(): LaunchGate {
  let locked = false

  async function tryRunExclusive(fn: () => Promise<void>): Promise<boolean> {
    if (locked) return false
    locked = true

    try {
      await fn()
      return true
    } finally {
      locked = false
    }
  }

  return { tryRunExclusive }
}