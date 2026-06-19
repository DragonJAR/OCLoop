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
  // resumedFromIdle is set on the first `running` reached via iteration_resumed
  // (doResume idle branch). The next iteration_started consumes it: the in-flight
  // session's work was already done in the previous run, so the counter does not
  // increment for the resumed iteration. A later session_idle → startIteration cycle
  // increments normally because the flag is cleared.
  | {
      type: "running"
      iteration: number
      sessionId: string
      resumedFromIdle?: boolean
    }
  | { type: "pausing"; iteration: number; sessionId: string }
  | { type: "paused"; iteration: number }
  // Waiting out a provider rate limit (or a transient connection blip) before
  // retrying the SAME iteration. This is a healthy waiting state, deliberately
  // distinct from error, so the watchdog stays quiet and the user sees a
  // countdown instead of a failure. `kind` lets the UI distinguish a real
  // rate-limit from a transient connection issue so we never call a flaky
  // network "rate limit".
  | {
      type: "cooldown"
      iteration: number
      reason: string
      resumeAt: number // monotonic ms when the retry will fire
      attempt: number // consecutive rate-limit attempt number
      kind: "rate_limit" | "transient"
      // If the user had requested a pause (state was pausing) when the cooldown
      // was entered, resume_cooldown returns to paused, not running, so a 429
      // mid-pause doesn't silently auto-resume the loop.
      wasPausing?: boolean
    }
  | { type: "stopping" }
  | { type: "stopped" }
  | { type: "complete"; iterations: number; summary: CompletionSummary }
  // lastIteration is the iteration count the loop had reached BEFORE entering
  // error, carried over from the source state when it had one
  // (running/pausing/paused/cooldown). plan_complete fired while in error uses
  // this to report real progress instead of resetting to 0.
  | {
      type: "error"
      source: ErrorSource
      message: string
      recoverable: boolean
      lastIteration?: number
      /** First-pending task that stalled — enables the "split task" action. */
      decomposableTask?: string
    }
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
  | { type: "error"; source: ErrorSource; message: string; recoverable: boolean; decomposableTask?: string }
  | { type: "retry" }
  // Enter cooldown after a rate limit (or a transient connection blip);
  // resumeAt is monotonic ms. `kind` is optional for backward compat with the
  // chaos path (chaos_429 injects a synthetic 429 and doesn't specify a kind);
  // when absent, the reducer defaults to "rate_limit".
  | {
      type: "rate_limited"
      reason: string
      resumeAt: number
      attempt: number
      kind?: "rate_limit" | "transient"
    }
  // Cooldown elapsed: go back to running and retry the same plan task. The plan
  // progress is preserved; a new session (and thus a new attempt) is created.
  | { type: "resume_cooldown" }
  // Resume after a crash: restore running from a given iteration count. A
  // non-empty sessionId re-attaches to a live session; an empty one lets the
  // iteration-driver start the next session (the attempt counter then advances).
  | { type: "resume_session"; iteration: number; sessionId: string }
  // Like resume_session but signals that the in-flight session was already
  // done in a previous run (the server returned idle during doResume). The
  // reducer tags the resulting running state with resumedFromIdle: true so
  // the next iteration_started does NOT increment the counter — the count
  // represents "iterations of unique work", not "iterations started", here.
  | { type: "iteration_resumed"; iteration: number; sessionId: string }

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
   * Show the model-routing panel at startup, letting the user assign concrete
   * models to roles (heavy/cheap/judge) from the live opencode catalog. Opt-in:
   * when absent, the loop uses the single resolved model for everything.
   */
  routing?: boolean
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
