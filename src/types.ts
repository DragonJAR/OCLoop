/**
 * Summary of remaining tasks when plan is complete
 */
export interface CompletionSummary {
  summary: string
}

/**
 * Error categories for OCLoop
 */
export type ErrorSource = "server" | "sse" | "pty" | "api" | "plan"

/**
 * State machine type for the OCLoop harness
 */
export type LoopState =
  | { type: "starting" }
  | { type: "ready" }  // Server ready, waiting for user to start iterations
  | { type: "running"; iteration: number; sessionId: string }
  | { type: "pausing"; iteration: number; sessionId: string }
  | { type: "paused"; iteration: number }
  // Waiting out a provider rate limit before retrying the SAME iteration. This
  // is a healthy waiting state, deliberately distinct from `error`, so the
  // watchdog stays quiet and the user sees a countdown instead of a failure.
  | {
      type: "cooldown"
      iteration: number
      reason: string
      resumeAt: number // monotonic ms when the retry will fire
      attempt: number // consecutive rate-limit attempt number
    }
  | { type: "stopping" }
  | { type: "stopped" }
  | { type: "complete"; iterations: number; summary: CompletionSummary }
  | { type: "error"; source: ErrorSource; message: string; recoverable: boolean }
  | { type: "debug"; sessionId: string }

/**
 * Actions that can be dispatched to the loop state machine
 */
export type LoopAction =
  | { type: "server_ready" }
  | { type: "server_ready_debug" }
  | { type: "start" }  // User initiates first iteration
  | { type: "toggle_pause" }
  | { type: "quit" }
  | { type: "session_idle" }
  | { type: "iteration_started"; sessionId: string }
  | { type: "new_session"; sessionId: string }
  | { type: "plan_complete"; summary: CompletionSummary }
  | { type: "error"; source: ErrorSource; message: string; recoverable: boolean }
  | { type: "retry" }
  // Enter cooldown after a rate limit; resumeAt is monotonic ms.
  | { type: "rate_limited"; reason: string; resumeAt: number; attempt: number }
  // Cooldown elapsed: go back to running and retry the same plan task. The plan
  // progress is preserved; a new session (and thus a new attempt) is created.
  | { type: "resume_cooldown" }
  // Resume after a crash: restore running from a given iteration count. A
  // non-empty sessionId re-attaches to a live session; an empty one lets the
  // iteration-driver start the next session (the attempt counter then advances).
  | { type: "resume_session"; iteration: number; sessionId: string }

/**
 * Progress information parsed from PLAN.md
 */
export interface PlanProgress {
  total: number // All tasks
  completed: number // [x] tasks
  pending: number // [ ] tasks (non-manual, non-blocked)
  manual: number // [MANUAL] tasks
  blocked: number // [BLOCKED] tasks
  automatable: number // pending (what the loop will do)
  percentComplete: number // completed / (total - manual)
}

/**
 * CLI arguments for OCLoop
 */
export interface CLIArgs {
  port?: number
  model?: string
  promptFile: string
  planFile: string
  run?: boolean  // Start iterations immediately without waiting for user input
  debug?: boolean  // Enable debug/sandbox mode without plan file validation
  createPlan?: boolean  // Interactively generate PLAN.md, then exit (no TUI)
  lang?: import("./lib/i18n").Locale  // UI language override (en|es)
  verbose?: boolean  // Enable verbose logging (keyboard events, etc.)
  /**
   * Agent to use for all sessions in this run.
   * If not specified, uses the default agent from OpenCode config.
   */
  agent?: string
  /**
   * Resilience overrides parsed from CLI flags (--resume, --no-caffeinate,
   * --chaos, --resilience key=value). Merged over the config file, which is
   * merged over DEFAULT_RESILIENCE.
   */
  resilience?: Partial<import("./lib/config").ResilienceConfig>
}
