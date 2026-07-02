/**
 * One iteration of the OCLoop driver, extracted from App.tsx::startIteration so
 * the race guards and completion paths are unit-testable without a Solid/JSX
 * mount. Mirrors the `createWatchdog` vs `useWatchdog` split: `runIteration`
 * holds the procedural body; the App.tsx wrapper owns the in-flight guard
 * (`startingIteration`) and the mutable bookkeeping fields, passing them in.
 *
 * Behavior is byte-identical to the former inline `startIteration` closure
 * (verified against the original lines 1090-1276 before extraction). The
 * order of steps and every guard condition are preserved exactly:
 *
 *   1. eval gate (runEvalIfPending → false aborts for an eval retry)
 *   2. plan-completion check (dispatches plan_complete, stops the chain)
 *   3. no-progress halt (dispatches recoverable error with the stuck task)
 *   4. minIterationGapMs spacing
 *   5. createSession → dispatch iteration_started
 *   6. RACE GUARD: if the user paused/quit during createSession, the reducer
 *      no-op'd iteration_started so the session is orphaned — abort + bail
 *   7. watchdog.notifyIterationStart
 *   8. read prompt, substitute {{PLAN_FILE}}, guard against empty prompt
 *   9. sendPromptAsync (heavy tier model if routed, else activeModel)
 *  10. refreshPlan
 *
 * `runIteration` does NOT catch: it lets errors propagate so the App.tsx
 * wrapper's single catch stays the error funnel — identical to the original,
 * where the wrapper aborts the half-created session and routes the error.
 */

import type { OpencodeClient } from "./api"
import type { Watchdog } from "../hooks/useWatchdog"
import type { NoProgressDetector } from "./no-progress-detector"
import type { LoopState, LoopAction } from "../types"
import type { ResilienceConfig } from "./config"
import type { t as Tfn } from "./i18n"
import { getActiveSessionId } from "../hooks/useLoopState"
import { createSession, sendPromptAsync, abortSession } from "./api"

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
  client: OpencodeClient
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
  /** Refreshes the progress bar after a prompt is sent. */
  refreshPlan: () => Promise<void>
  /** Plan-complete summary reader (best-effort; may throw). */
  getPlanCompleteSummary: (planPath: string) => Promise<string | null>
}

/** Why `runIteration` returned, for assertion. */
export type IterationResult =
  | "completed" // created a session and sent the prompt
  | "plan_complete" // dispatched plan_complete
  | "no_progress_halt" // dispatched a recoverable errNoProgress
  | "eval_retry" // eval gate asked to retry (no session created)
  | "orphan_aborted" // user paused/quit during createSession; session aborted

/**
 * Run one iteration. Throws on unexpected errors (the App.tsx wrapper's catch
 * handles them via handleIterationError, exactly as the inline version did).
 */
export async function runIteration(deps: IterationDeps): Promise<IterationResult> {
  // --- 1. Eval gate ---
  if (!(await deps.runEvalIfPending())) {
    return "eval_retry"
  }

  // --- 2. Plan completion ---
  if (await deps.checkPlanComplete()) {
    // Best-effort summary read; a FS error must not misclassify completion
    // (the plan IS complete, only the human-readable summary is best-effort).
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

  // --- 3. No-progress halt ---
  let currentTask: string | null = null
  try {
    currentTask = await deps.getCurrentTask(deps.planPath)
  } catch {
    // The task read is best-effort for the detector; treat a throw as "no
    // task" so the detector resets rather than misclassifying as progress.
    currentTask = null
  }
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

  // --- 4. minIterationGapMs spacing ---
  const gap = deps.resilience().minIterationGapMs
  if (gap > 0) {
    const since = deps.monotonicNow() - deps.getLastIterationStartAt()
    if (since < gap) {
      await new Promise((r) => setTimeout(r, gap - since))
    }
  }
  deps.setLastIterationStartAt(deps.monotonicNow())

  // --- 5. Create session + dispatch iteration_started ---
  const session = await createSession(deps.client)
  const newSessionId = session.id
  // Report to the wrapper now (before dispatch) so its catch can abort this
  // session if any later step throws — identical to the original hoist of
  // `newSessionId` above the try in App.tsx::startIteration.
  deps.onSessionCreated(newSessionId)
  deps.loop.dispatch({ type: "iteration_started", sessionId: newSessionId })

  // --- 6. RACE GUARD: orphan if the user paused/quit during createSession ---
  // createSession is async. If the user paused (Space) or quit (Q) DURING the
  // await above, the reducer no-op'd `iteration_started` (state is no longer
  // running/paused), so this session is untracked — nothing would ever abort
  // it and it'd keep running on the server burning tokens. Abort it now and
  // bail before sending the prompt.
  if (getActiveSessionId(deps.loop.state()) !== newSessionId) {
    return abortOrphanSession(deps.client, newSessionId)
  }

  // --- 7. Watchdog baseline for this fresh iteration ---
  deps.watchdog.notifyIterationStart()

  // --- 8. Record the task for the manifest, then read the prompt ---
  deps.setPendingManifestTask(currentTask)
  let promptContent: string
  try {
    const promptFile = Bun.file(deps.promptPath)
    if (!(await promptFile.exists())) {
      throw new Error(deps.t("errPromptNotFound", { path: deps.promptPath }))
    }
    promptContent = await promptFile.text()
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Error:")) throw err
    throw new Error(deps.t("errCannotReadFile", { path: deps.promptPath }))
  }
  const prompt = promptContent.replaceAll("{{PLAN_FILE}}", deps.planPath)
  if (prompt.trim() === "") {
    throw new Error(deps.t("errPromptEmpty", { path: deps.promptPath }))
  }

  // --- 9. Send the prompt (heavy tier overrides activeModel when routed) ---
  // Re-check after prompt I/O: the user may have paused while we read the file.
  const st = deps.loop.state()
  if (st.type !== "running" || st.sessionId !== newSessionId) {
    return abortOrphanSession(deps.client, newSessionId)
  }
  await sendPromptAsync(deps.client, {
    sessionID: newSessionId,
    parts: [{ type: "text", text: prompt }],
    agent: deps.activeAgent(),
    model: deps.tierMapping()?.heavy ?? deps.activeModel(),
  })

  // --- 10. Refresh plan progress ---
  await deps.refreshPlan()
  return "completed"
}

async function abortOrphanSession(
  client: OpencodeClient,
  sessionId: string,
): Promise<IterationResult> {
  try {
    await abortSession(client, sessionId)
  } catch {
    // Best effort — the session may already be gone.
  }
  return "orphan_aborted"
}
