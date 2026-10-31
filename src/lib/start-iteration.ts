/**
 * One iteration of the OCLoop driver, extracted from App.tsx::startIteration so
 * the race guards and completion paths are unit-testable without a Solid/JSX
 * mount. Mirrors the `createWatchdog` vs `useWatchdog` split: `runIteration`
 * holds the procedural body; the App.tsx wrapper owns the in-flight guard
 * (`startingIteration`) and the mutable bookkeeping fields, passing them in.
 *
 * Also supports parallel worker slots (`assignedTask` + `parallelWorker`):
 * when invoked by `parallel-run.ts`, the scheduler has already selected the
 * task and checked plan completion, so `runIteration` reuses the exact same
 * spacing, session creation, race guards, prompt loading, placeholder
 * replacement, tier routing, and `sendPromptAsync` pipeline (DRY).
 */

import type { OpencodeBackend } from "./api"
import type { Watchdog } from "../hooks/useWatchdog"
import type { NoProgressDetector } from "./no-progress-detector"
import type { LoopState, LoopAction } from "../types"
import type { ResilienceConfig } from "./config"
import type { t as Tfn } from "./i18n"
import { getActiveSessionId } from "../hooks/useLoopState"
import { createSession, sendPromptAsync, abortSession } from "./api"
import { toErrorMessage } from "./format"
import { MAX_TIMEOUT_MS } from "./constants"

/** Result of a single PLAN.md read at iteration start (transition + task selection). */
export interface PlanIterationPrep {
  /** When false the iteration must not proceed (e.g. plan drift halt). */
  proceed: boolean
  /** Raw plan text, or null when the read was skipped / failed. */
  content: string | null
  /** First pending automatable task for this iteration. */
  currentTask: string | null
}

/** Tier role → "provider/model" mapping (from the --routing panel). */
export type TierMapping = Record<string, string>

/**
 * Everything `startIteration` closed over, narrowed to the methods used.
 * Grouped by role to keep the surface scannable. The App.tsx wrapper builds
 * this from its live hooks/signals.
 */
export interface IterationDeps {
  // --- prompt + plan resolution ---
  /** Resolved PLAN.md path (resolvePlanFile(props.planFile)). */
  planPath: string
  /** Prompt file path (props.promptFile || DEFAULTS.PROMPT_FILE). */
  promptPath: string

  // --- loop state machine ---
  loop: {
    state: () => LoopState
    dispatch: (action: LoopAction) => void
  }

  // --- collaborators (real instances from App.tsx) ---
  client: OpencodeBackend
  watchdog: Pick<Watchdog, "notifyIterationStart">
  noProgressDetector: NoProgressDetector

  // --- reactive accessors (read fresh each call) ---
  activeAgent: () => string
  activeModel: () => string | undefined
  tierMapping: () => TierMapping | null
  resilience: () => ResilienceConfig
  /** Current monotonic time, for minIterationGapMs spacing. */
  monotonicNow: () => number
  /** i18n function (for the no-progress error message). */
  t: typeof Tfn
  /** Fallback summary when the plan-complete summary read fails. */
  fallbackSummary: () => string

  // --- App.tsx-local mutable bookkeeping (passed as ref-like setters) ---
  /** Called when a session is created, so the wrapper can record the task for
   * the manifest written on session_idle. */
  setPendingManifestTask: (task: string | null) => void
  /** Called with the new sessionId right after createSession succeeds, so the
   * wrapper's catch can abort it if a later step (sendPromptAsync, …) throws.
   * Mirrors the `newSessionId` hoist in the original inline closure. */
  onSessionCreated: (sessionId: string) => void
  /** Reads/updates the last-iteration wall-clock for minIterationGapMs. */
  getLastIterationStartAt: () => number
  setLastIterationStartAt: (n: number) => void

  // --- delegated App.tsx closures (each stays owned by App.tsx) ---
  /** Eval gate; returns false to abort this iteration for an eval retry. */
  runEvalIfPending: () => Promise<boolean>
  /** Returns true if the plan is structurally complete. */
  checkPlanComplete: () => Promise<boolean>
  /** Reads the current first-pending task from PLAN.md; may throw (best-effort). */
  getCurrentTask: (planPath: string) => Promise<string | null>
  /**
   * Single PLAN.md read per iteration: drift check, snapshot update, and
   * first-pending resolution. When omitted, falls back to `getCurrentTask`.
   */
  preparePlanForIteration?: (planPath: string) => Promise<PlanIterationPrep>
  /** Refreshes the progress bar after a prompt is sent. */
  refreshPlan: () => Promise<void>
  /** Plan-complete summary reader (best-effort; may throw). */
  getPlanCompleteSummary: (planPath: string) => Promise<string | null>
  /** Optional callback or scheduler when an eval requires a retry. */
  scheduleRetry?: () => void
  /**
   * Error sink for the internal eval-retry re-entry. The outer invocation is
   * wrapped by App.tsx's catch; the re-entry is not, so it needs its own
   * handler — without it a throw becomes an unhandledRejection that kills the
   * TUI via the global handler.
   */
  handleIterationError?: (err: unknown) => void

  // --- Optional parallel-worker extensions ---
  /** Pre-assigned task description selected by the DAG scheduler. */
  assignedTask?: string
  /** Extra instructions appended to the prompt for an isolated worktree slot. */
  parallelPromptSuffix?: string
  /** When true, multiple sessions may run concurrently; skip single-session ID equality guard. */
  parallelWorker?: boolean
}

/** Why `runIteration` returned, for assertion. */
export type IterationResult =
  | "completed" // created a session and sent the prompt
  | "plan_complete" // dispatched plan_complete
  | "no_progress_halt" // dispatched a recoverable errNoProgress
  | "eval_retry" // eval gate asked to retry (no session created)
  | "orphan_aborted" // user paused/quit during createSession; session aborted
  | "plan_drift_halt" // recoverable halt: suspicious plan reorder without expansion

/**
 * Run one iteration. Throws on unexpected errors (the App.tsx wrapper's catch
 * handles them via handleIterationError, exactly as the inline version did).
 */
export async function runIteration(deps: IterationDeps): Promise<IterationResult> {
  let currentTask: string | null = null

  if (deps.assignedTask !== undefined) {
    currentTask = deps.assignedTask
  } else {
    // --- 1. Eval gate ---
    if (!(await deps.runEvalIfPending())) {
      if (deps.scheduleRetry) {
        deps.scheduleRetry()
      } else {
        setTimeout(() => {
          const state = deps.loop.state()
          if (state.type === "running" && state.sessionId === "") {
            // The App.tsx wrapper's catch handles throws from the original
            // invocation; this re-entry has no such wrapper — without a catch
            // here, a throw surfaces as unhandledRejection and the global
            // handler exits the whole TUI.
            runIteration(deps).catch((err) => {
              deps.handleIterationError?.(err)
            })
          }
        }, 0)
      }
      return "eval_retry"
    }

    // --- 2. Single PLAN.md read (drift check + task for this iteration) ---
    if (deps.preparePlanForIteration) {
      const prep = await deps.preparePlanForIteration(deps.planPath)
      if (!prep.proceed) return "plan_drift_halt"
      currentTask = prep.currentTask
    } else {
      try {
        currentTask = await deps.getCurrentTask(deps.planPath)
      } catch {
        currentTask = null
      }
    }

    // --- 3. Plan completion ---
    if (await deps.checkPlanComplete()) {
      let summaryContent: string | null = null
      try {
        summaryContent = await deps.getPlanCompleteSummary(deps.planPath)
      } catch {
        // Mirrors the original: swallow, completion still holds.
      }
      deps.loop.dispatch({
        type: "plan_complete",
        summary: { summary: summaryContent ?? deps.fallbackSummary() },
      })
      return "plan_complete"
    }
  }

  // --- 4. No-progress halt ---
  const streak = deps.noProgressDetector.recordIterationStart(currentTask)
  if (deps.noProgressDetector.isStuck()) {
    const stuckTask = deps.noProgressDetector.currentTask ?? ""
    deps.loop.dispatch({
      type: "error",
      source: "plan",
      message: deps.t("errNoProgress", { count: streak, task: stuckTask }),
      recoverable: true,
      decomposableTask: stuckTask,
    })
    return "no_progress_halt"
  }

  // --- 5. minIterationGapMs spacing ---
  const gap = deps.resilience().minIterationGapMs
  if (gap > 0) {
    const since = deps.monotonicNow() - deps.getLastIterationStartAt()
    if (since < gap) {
      await new Promise((r) => setTimeout(r, Math.min(gap - since, MAX_TIMEOUT_MS)))
    }
  }
  deps.setLastIterationStartAt(deps.monotonicNow())

  // --- 6. Create session + dispatch iteration_started ---
  const session = await createSession(deps.client)
  const newSessionId = session.id
  deps.onSessionCreated(newSessionId)
  deps.loop.dispatch({ type: "iteration_started", sessionId: newSessionId })

  // --- 7. RACE GUARD: orphan if the user paused/quit during createSession ---
  if (deps.parallelWorker) {
    if (deps.loop.state().type !== "running") {
      return abortOrphanSession(deps.client, newSessionId, deps.loop)
    }
  } else if (getActiveSessionId(deps.loop.state()) !== newSessionId) {
    return abortOrphanSession(deps.client, newSessionId, deps.loop)
  }

  // --- 8. Watchdog baseline for this fresh iteration ---
  deps.watchdog.notifyIterationStart()

  // --- 9. Record the task for the manifest, then read the prompt ---
  deps.setPendingManifestTask(currentTask)
  const promptFile = Bun.file(deps.promptPath)
  if (!(await promptFile.exists())) {
    throw new Error(deps.t("errPromptNotFound", { path: deps.promptPath }))
  }
  let promptContent: string
  try {
    promptContent = await promptFile.text()
  } catch (err) {
    throw new Error(
      deps.t("errCannotReadFile", {
        path: deps.promptPath,
        message: toErrorMessage(err),
      }),
    )
  }
  const taskLabel = currentTask ?? ""
  const basePrompt = promptContent
    .replaceAll("{{PLAN_FILE}}", deps.planPath)
    .replaceAll("{{CURRENT_TASK}}", taskLabel)
  if (basePrompt.trim() === "") {
    throw new Error(deps.t("errPromptEmpty", { path: deps.promptPath }))
  }
  const prompt = deps.parallelPromptSuffix
    ? `${basePrompt}\n\n${deps.parallelPromptSuffix}`
    : basePrompt

  // --- 10. Send the prompt (heavy tier overrides activeModel when routed) ---
  const st = deps.loop.state()
  if (
    st.type !== "running" ||
    (!deps.parallelWorker && st.sessionId !== newSessionId)
  ) {
    return abortOrphanSession(deps.client, newSessionId, deps.loop)
  }
  await sendPromptAsync(deps.client, {
    sessionID: newSessionId,
    parts: [{ type: "text", text: prompt }],
    agent: deps.activeAgent(),
    model: deps.tierMapping()?.heavy ?? deps.activeModel(),
  })

  // --- 11. Refresh plan progress ---
  await deps.refreshPlan()
  return "completed"
}

async function abortOrphanSession(
  client: OpencodeBackend,
  sessionId: string,
  loop?: { state: () => LoopState; dispatch: (action: LoopAction) => void },
): Promise<IterationResult> {
  try {
    await abortSession(client, sessionId)
  } catch {
    // Best effort — the session may already be gone.
  }
  if (loop && loop.state().type === "pausing") {
    loop.dispatch({ type: "session_idle" })
  }
  return "orphan_aborted"
}
