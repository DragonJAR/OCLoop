/**
 * No-progress detector.
 *
 * Tracks consecutive loop iterations that started with the same PLAN.md task
 * description. When the count reaches a configured threshold without progress,
 * the caller halts the loop with a clear error: the agent is stuck redoing
 * the same task.
 *
 * The detector is a small, dependency-free class so it can be unit-tested
 * without wiring up the rest of the loop. The actual halt is the caller's
 * job — recordIterationStart() only reports whether the threshold has been
 * reached.
 *
 * Semantics:
 *   - `recordIterationStart(task)` is called at the start of each iteration,
 *     with `task` being the description of the first pending task in PLAN.md
 *     (or `null` when the plan has no automatable tasks).
 *   - The first call with a non-null task seeds the streak at count = 1.
 *   - Each subsequent call with the SAME task increments the count.
 *   - A call with a DIFFERENT task resets the streak (count = 1 with the new
 *     task).
 *   - A call with `null` resets the streak (plan is done or empty).
 *   - `isStuck()` returns true iff the count has reached the threshold.
 *
 * Threshold of N means: the agent gets N-1 chances to make progress on a
 * single task before the detector trips. A threshold of 3 (the default)
 * gives the agent 2 retries before halting.
 */
export class NoProgressDetector {
  private lastTask: string | null = null
  private streak: number = 0

  constructor(private readonly threshold: number) {
    if (!Number.isInteger(threshold) || threshold < 1) {
      throw new Error(
        `NoProgressDetector threshold must be a positive integer, got ${threshold}`,
      )
    }
  }

  /**
   * Record the start of an iteration with the given current task.
   * Returns the new consecutive-same-task streak count.
   *
   * `task` is the description of the first pending task from PLAN.md, or
   * `null` when there is no pending task (plan is complete or empty).
   */
  recordIterationStart(task: string | null): number {
    if (task === null) {
      // No task to make progress on. Reset the streak so a future
      // pending task starts fresh and the next halt is fair.
      this.lastTask = null
      this.streak = 0
      return 0
    }
    if (task === this.lastTask) {
      this.streak += 1
    } else {
      this.lastTask = task
      this.streak = 1
    }
    return this.streak
  }

  /**
   * True iff the current streak has reached the threshold. The caller
   * should halt the loop when this is true.
   */
  isStuck(): boolean {
    return this.streak >= this.threshold
  }

  /**
   * The current consecutive-same-task streak count. Exposed for tests
   * and for surfacing in the error message.
   */
  get count(): number {
    return this.streak
  }

  /**
   * The task description the streak is currently tracking, or null if
   * the streak is empty. Exposed for surfacing in the error message.
   */
  get currentTask(): string | null {
    return this.lastTask
  }

  /**
   * Reset all state. Useful when the user resumes from pause, or after
   * a manual retry that should not inherit the previous streak.
   */
  reset(): void {
    this.lastTask = null
    this.streak = 0
  }
}
