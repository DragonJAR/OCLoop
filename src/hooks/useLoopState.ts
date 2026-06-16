import { createSignal, createMemo } from "solid-js"
import type { LoopState, LoopAction } from "../types"

/**
 * Return type for the useLoopState hook
 */
export interface UseLoopStateReturn {
  state: () => LoopState
  dispatch: (action: LoopAction) => void

  // Derived state
  isReady: () => boolean
  isRunning: () => boolean
  isPaused: () => boolean
  isPausing: () => boolean
  isError: () => boolean
  isDebug: () => boolean
  isCooldown: () => boolean
  canStart: () => boolean
  canPause: () => boolean
  canQuit: () => boolean
  canRetry: () => boolean
  iteration: () => number
}

/**
 * The session id of the in-flight iteration, or "" when there is none.
 *
 * Only `running` and `pausing` carry a live iteration session; every other
 * state (cooldown, paused, debug, …) has no session to act on. Single source of
 * truth for the "is there an active session, and what is it" check the
 * watchdog, reconcile, and persistence paths all need.
 */
export function getActiveSessionId(state: LoopState): string {
  return state.type === "running" || state.type === "pausing"
    ? state.sessionId
    : ""
}

/**
 * Reducer function that handles state transitions.
 * Implements the state machine defined in PLAN.md.
 */
export function loopReducer(state: LoopState, action: LoopAction): LoopState {
  switch (action.type) {
    case "server_ready": {
      // Only transition from starting to ready (waiting for user to start)
      if (state.type === "starting") {
        return { type: "ready" }
      }
      return state
    }

    case "server_ready_debug": {
      // Transition from starting to debug mode
      if (state.type === "starting") {
        return { type: "debug", sessionId: "" }
      }
      return state
    }

    case "new_session": {
      // Set session ID in debug mode
      if (state.type === "debug") {
        return { type: "debug", sessionId: action.sessionId }
      }
      return state
    }

    case "start": {
      // User initiates iterations from ready state
      if (state.type === "ready") {
        return { type: "running", iteration: 0, sessionId: "" }
      }
      return state
    }

    case "iteration_started": {
      // Set the session ID when an iteration starts
      if (state.type === "running") {
        return {
          type: "running",
          iteration: state.iteration + 1,
          sessionId: action.sessionId,
        }
      }
      // Can also start iteration from paused state (resume)
      if (state.type === "paused") {
        return {
          type: "running",
          iteration: state.iteration + 1,
          sessionId: action.sessionId,
        }
      }
      return state
    }

    case "toggle_pause": {
      // Toggle pause/resume
      if (state.type === "running") {
        // Transition to pausing - will complete when session becomes idle
        return {
          type: "pausing",
          iteration: state.iteration,
          sessionId: state.sessionId,
        }
      }
      if (state.type === "pausing") {
        // Cancel a pending pause: the session is still running, so go straight
        // back to running with the SAME session (no new iteration is started).
        return {
          type: "running",
          iteration: state.iteration,
          sessionId: state.sessionId,
        }
      }
      if (state.type === "paused") {
        // Resume from paused: sessionId is intentionally "" because the previous
        // session completed when we transitioned pausing→paused (session_idle
        // clears it). The next iteration_started action will set a fresh one.
        return {
          type: "running",
          iteration: state.iteration,
          sessionId: "",
        }
      }
      return state
    }

    case "session_idle": {
      // Handle session completion
      if (state.type === "running") {
        // Already between iterations: return the SAME state so a redundant idle
        // (e.g. watchdog reconcile + wake both synthesizing idle) doesn't emit a
        // new object and re-fire the iteration driver into a second session.
        if (state.sessionId === "") return state
        // Stay in running with empty sessionId, ready for next iteration
        return {
          type: "running",
          iteration: state.iteration,
          sessionId: "",
        }
      }
      if (state.type === "pausing") {
        // Complete the pause transition
        return {
          type: "paused",
          iteration: state.iteration,
        }
      }
      if (state.type === "debug") {
        // In debug mode, clear sessionId and stay in debug (ready for new session)
        return {
          type: "debug",
          sessionId: "",
        }
      }
      return state
    }

    case "rate_limited": {
      // Enter cooldown from running (or pausing) — a healthy wait, not an error.
      if (state.type === "running" || state.type === "pausing") {
        return {
          type: "cooldown",
          iteration: state.iteration,
          reason: action.reason,
          resumeAt: action.resumeAt,
          attempt: action.attempt,
        }
      }
      return state
    }

    case "resume_cooldown": {
      // Cooldown elapsed: back to running with an empty session so the next
      // iteration is re-created and the prompt re-sent (same plan progress).
      if (state.type === "cooldown") {
        return {
          type: "running",
          iteration: state.iteration,
          sessionId: "",
        }
      }
      return state
    }

    case "resume_session": {
      // Resume a persisted run from the ready state. A non-empty sessionId
      // re-attaches to a still-working session; an empty one lets the
      // iteration-driver start a fresh iteration while preserving the count.
      if (state.type === "ready") {
        return {
          type: "running",
          iteration: action.iteration,
          sessionId: action.sessionId,
        }
      }
      return state
    }

    case "quit": {
      // Transition to stopping from any active state
      if (
        state.type === "ready" ||
        state.type === "running" ||
        state.type === "paused" ||
        state.type === "pausing" ||
        state.type === "cooldown" ||
        state.type === "debug"
      ) {
        return { type: "stopping" }
      }
      return state
    }

    case "plan_complete": {
      // Transition to complete state with summary
      if (state.type === "ready" || state.type === "running" || state.type === "paused") {
        const iterations =
          state.type === "running" ? state.iteration : 
          state.type === "paused" ? state.iteration : 0
        return { type: "complete", iterations, summary: action.summary }
      }
      // Allow plan_complete from cooldown/error: the plan can be detected as
      // complete even while waiting out a rate limit or after a transient error.
      // In cooldown, preserve the iteration count for the summary.
      if (state.type === "cooldown") {
        return { type: "complete", iterations: state.iteration, summary: action.summary }
      }
      if (state.type === "error") {
        return { type: "complete", iterations: 0, summary: action.summary }
      }
      return state
    }

    case "error": {
      // Transition to error state from most states
      if (
        state.type === "starting" ||
        state.type === "ready" ||
        state.type === "running" ||
        state.type === "pausing" ||
        state.type === "paused" ||
        state.type === "cooldown" ||
        state.type === "debug"
      ) {
        return {
          type: "error",
          source: action.source,
          message: action.message,
          recoverable: action.recoverable,
        }
      }
      return state
    }

    case "retry": {
      // Retry from error state - go back to starting
      if (state.type === "error" && state.recoverable) {
        return { type: "starting" }
      }
      return state
    }

    default:
      return state
  }
}

/**
 * Hook to manage the OCLoop state machine.
 *
 * Provides reactive state, dispatch function, and derived state helpers
 * for the main loop lifecycle.
 *
 * @example
 * ```tsx
 * const loop = useLoopState()
 *
 * createEffect(() => {
 *   if (loop.isRunning()) {
 *     console.log("Loop is running, iteration:", loop.iteration())
 *   }
 * })
 *
 * // Handle events
 * loop.dispatch({ type: "server_ready" })
 * loop.dispatch({ type: "toggle_pause" })
 * ```
 */
export function useLoopState(): UseLoopStateReturn {
  const [state, setState] = createSignal<LoopState>({ type: "starting" })

  /**
   * Dispatch an action to the state machine
   */
  function dispatch(action: LoopAction): void {
    setState((current) => loopReducer(current, action))
  }

  // Derived state helpers using memos for efficiency
  const isReady = createMemo(() => {
    return state().type === "ready"
  })

  const isRunning = createMemo(() => {
    const s = state()
    return s.type === "running" || s.type === "pausing"
  })

  const isPaused = createMemo(() => {
    return state().type === "paused"
  })

  const isPausing = createMemo(() => {
    return state().type === "pausing"
  })

  const isError = createMemo(() => {
    return state().type === "error"
  })

  const isDebug = createMemo(() => {
    return state().type === "debug"
  })

  const isCooldown = createMemo(() => {
    return state().type === "cooldown"
  })

  const canPause = createMemo(() => {
    const s = state()
    // Can pause when running
    if (s.type === "running") return true
    // Can cancel a pending pause while pausing
    if (s.type === "pausing") return true
    // Can resume when paused
    if (s.type === "paused") return true
    return false
  })

  const canStart = createMemo(() => {
    return state().type === "ready"
  })

  const canQuit = createMemo(() => {
    const s = state()
    // Can quit from ready state (before iterations start)
    if (s.type === "ready") return true
    // Can quit from running, pausing, or paused states
    if (s.type === "running") return true
    if (s.type === "pausing") return true
    if (s.type === "paused") return true
    // Can quit while waiting out a rate-limit cooldown
    if (s.type === "cooldown") return true
    // Can quit from debug state
    if (s.type === "debug") return true
    // Can quit from error state
    if (s.type === "error") return true
    return false
  })

  const canRetry = createMemo(() => {
    const s = state()
    return s.type === "error" && s.recoverable
  })

  const iteration = createMemo(() => {
    const s = state()
    if (s.type === "running") return s.iteration
    if (s.type === "pausing") return s.iteration
    if (s.type === "paused") return s.iteration
    if (s.type === "cooldown") return s.iteration
    if (s.type === "complete") return s.iterations
    return 0
  })

  return {
    state,
    dispatch,
    isReady,
    isRunning,
    isPaused,
    isPausing,
    isError,
    isDebug,
    isCooldown,
    canStart,
    canPause,
    canQuit,
    canRetry,
    iteration,
  }
}
