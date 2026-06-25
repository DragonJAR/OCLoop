import { createSignal, createMemo, onCleanup } from "solid-js";

// Re-export formatDuration from lib/format. The import is type/usage-free
// here (JSDoc only); the re-export exists so useLoopStats.test.ts can co-locate
// its formatDuration coverage next to the hook it exercises it through.
export { formatDuration } from "../lib/format"

/**
 * Internal state for tracking iteration timing
 */
interface LoopStatsState {
  iterationStartTime: number | null;
  pauseStartTime: number | null;
  accumulatedPauseTime: number;
  history: number[]; // Active times for completed iterations
  runStartTime: number | null; // Wall-clock ms when the run first started (never reset mid-run)
  runEndTime: number | null; // Wall-clock ms when the run ended (freezes the global timer)
}

/**
 * Return type for the useLoopStats hook
 */
export interface UseLoopStatsReturn {
  // Methods
  startIteration: () => void;
  pause: () => void;
  resume: () => void;
  endIteration: () => number; // Returns active duration in ms

  // Computed values (reactive)
  elapsedTime: () => number; // Current iteration elapsed time in ms
  averageTime: () => number | null; // Average iteration time in ms, null if no history
  totalActiveTime: () => number; // Sum of all active time including current iteration
  estimatedTotal: (remaining: number) => number | null; // Estimated time for remaining iterations
  globalElapsedTime: () => number; // Wall-clock ms since the run started (incl. pauses); frozen after markRunEnd
  markRunEnd: () => void; // Freeze the global timer (call on complete/stopped/error)
  unfreezeRun: () => void; // Un-freeze the global timer (call when resuming after a recoverable error)
  /**
   * Debug-only: seed realistic timing so a screenshot preview shows non-zero
   * elapsed/avg/ETA without a real run. Called only by the debug Preview
   * commands (gated to --debug); never on a real path.
   */
  seedForPreview: (opts: {
    history: number[];
    iterationElapsedMs: number;
    runStartedMsAgo: number;
  }) => void;
}

/**
 * Hook to track iteration timing statistics with pause awareness.
 *
 * Tracks active time per iteration (excluding paused time), maintains
 * history of completed iterations, and provides computed statistics
 * like averages and estimates.
 *
 * @example
 * ```tsx
 * const stats = useLoopStats()
 *
 * // When iteration starts
 * stats.startIteration()
 *
 * // When pausing
 * stats.pause()
 *
 * // When resuming
 * stats.resume()
 *
 * // When iteration completes
 * const duration = stats.endIteration()
 *
 * // Access computed values
 * console.log("Elapsed:", formatDuration(stats.elapsedTime()))
 * console.log("Average:", stats.averageTime() ? formatDuration(stats.averageTime()!) : "N/A")
 * ```
 */
export function useLoopStats(): UseLoopStatsReturn {
  const [state, setState] = createSignal<LoopStatsState>({
    iterationStartTime: null,
    pauseStartTime: null,
    accumulatedPauseTime: 0,
    history: [],
    runStartTime: null,
    runEndTime: null,
  });

  const [tick, setTick] = createSignal(0);
  const interval = setInterval(() => setTick((t) => t + 1), 1000);
  onCleanup(() => clearInterval(interval));

  /**
   * Start timing a new iteration
   */
  function startIteration(): void {
    const s = state();
    setState({
      ...s,
      iterationStartTime: Date.now(),
      pauseStartTime: null,
      accumulatedPauseTime: 0,
      // Wall-clock run start: stamped once on the first iteration, never reset.
      runStartTime: s.runStartTime ?? Date.now(),
    });
  }

  /**
   * Pause timing (records when pause started)
   */
  function pause(): void {
    const s = state();
    if (s.pauseStartTime !== null) {
      // Already paused
      return;
    }
    setState({
      ...s,
      pauseStartTime: Date.now(),
    });
  }

  /**
   * Resume timing (adds paused duration to accumulated pause time)
   */
  function resume(): void {
    const s = state();
    if (s.pauseStartTime === null) {
      // Not paused
      return;
    }
    const pausedDuration = Date.now() - s.pauseStartTime;
    setState({
      ...s,
      pauseStartTime: null,
      accumulatedPauseTime: s.accumulatedPauseTime + pausedDuration,
    });
  }

  /**
   * End the current iteration, record active time to history
   * @returns Active duration in milliseconds
   */
  function endIteration(): number {
    const s = state();
    if (s.iterationStartTime === null) {
      return 0;
    }

    const now = Date.now();
    let totalElapsed = now - s.iterationStartTime;

    // If currently paused, include the current pause time
    let pauseTime = s.accumulatedPauseTime;
    if (s.pauseStartTime !== null) {
      pauseTime += now - s.pauseStartTime;
    }

    const activeTime = Math.max(0, totalElapsed - pauseTime);

    setState({
      ...s,
      iterationStartTime: null,
      pauseStartTime: null,
      accumulatedPauseTime: 0,
      history: [...s.history, activeTime],
    });

    return activeTime;
  }


  /**
   * Current iteration elapsed time (active time only, excluding pauses)
   * Updates every second via the tick signal
   */
  const elapsedTime = createMemo(() => {
    // Subscribe to tick for reactive updates
    tick();

    const s = state();
    if (s.iterationStartTime === null) {
      return 0;
    }

    const now = Date.now();
    let totalElapsed = now - s.iterationStartTime;

    // Subtract accumulated pause time
    let pauseTime = s.accumulatedPauseTime;

    // If currently paused, include current pause duration
    if (s.pauseStartTime !== null) {
      pauseTime += now - s.pauseStartTime;
    }

    return Math.max(0, totalElapsed - pauseTime);
  });

  /**
   * Average time per iteration based on history
   * Returns null if no history available
   */
  const averageTime = createMemo(() => {
    const history = state().history;
    if (history.length === 0) {
      return null;
    }
    const sum = history.reduce((acc, val) => acc + val, 0);
    return sum / history.length;
  });

  /**
   * Total active time (sum of history + current iteration active time)
   */
  const totalActiveTime = createMemo(() => {
    const history = state().history;
    const historySum = history.reduce((acc, val) => acc + val, 0);
    return historySum + elapsedTime();
  });

  /**
   * Estimated total time for remaining iterations
   * Returns null if no average available
   */
  function estimatedTotal(remaining: number): number | null {
    const avg = averageTime();
    if (avg === null || remaining <= 0) {
      return null;
    }
    return avg * remaining;
  }

  /**
   * Wall-clock time since the run started ("desde que se dio start").
   * Unlike elapsedTime/totalActiveTime this does NOT subtract pauses/cooldowns —
   * it's real time. Freezes once markRunEnd() captures runEndTime.
   */
  const globalElapsedTime = createMemo(() => {
    tick(); // re-run every second
    const s = state();
    if (s.runStartTime === null) return 0;
    return Math.max(0, (s.runEndTime ?? Date.now()) - s.runStartTime);
  });

  /** Freeze the global timer at the first terminal state (idempotent). */
  function markRunEnd(): void {
    const s = state();
    if (s.runStartTime === null || s.runEndTime !== null) return;
    setState({ ...s, runEndTime: Date.now() });
  }

  /**
   * Un-freeze the global timer — the symmetric counterpart to markRunEnd.
   *
   * When the run hits a recoverable `error`, markRunEnd() stamps runEndTime and
   * globalElapsedTime stops advancing. If the user presses R (retry), the loop
   * goes error → starting → ... → running again — but without clearing runEndTime
   * the timer stays frozen at the error instant for the WHOLE retried run.
   * Call this on the retry transition so the wall-clock clock resumes. A fresh
   * startIteration keeps runStartTime (never reset mid-run), so we only need to
   * drop runEndTime; the elapsed time then continues from runStartTime.
   *
   * No-op when nothing was frozen (idempotent, safe to call unconditionally).
   */
  function unfreezeRun(): void {
    const s = state();
    if (s.runEndTime === null) return;
    setState({ ...s, runEndTime: null });
  }

  /**
   * Debug-only seed for screenshot previews (see interface doc). Backdates the
   * run/iteration start so elapsed + global show realistic values immediately,
   * and fills history so averageTime/estimatedTotal aren't null.
   */
  function seedForPreview(opts: {
    history: number[];
    iterationElapsedMs: number;
    runStartedMsAgo: number;
  }): void {
    const now = Date.now();
    setState({
      iterationStartTime: now - opts.iterationElapsedMs,
      pauseStartTime: null,
      accumulatedPauseTime: 0,
      history: [...opts.history],
      runStartTime: now - opts.runStartedMsAgo,
      runEndTime: null,
    });
  }

  return {
    startIteration,
    pause,
    resume,
    endIteration,
    elapsedTime,
    averageTime,
    totalActiveTime,
    estimatedTotal,
    globalElapsedTime,
    markRunEnd,
    unfreezeRun,
    seedForPreview,
  };
}
