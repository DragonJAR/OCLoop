/**
 * Crash-resume flow logic, extracted from useResume.tsx so it is unit-testable
 * without a Solid/JSX mount. (No `.tsx` file is importable under `bun:test` —
 * the `@opentui/solid` JSX runtime does not resolve there — which is why the
 * hook wrapper stays in `useResume.tsx` and only the logic lives here. This
 * mirrors the existing `createWatchdog` vs `useWatchdog`, `createDialogController`
 * vs Provider split used elsewhere in the codebase.)
 *
 * `doResumeFlow` is the verbatim body of the former `useResume::doResume`
 * closure: it reconciles a persisted in-flight session against the server's
 * ground truth and dispatches the loop action that re-attaches or restarts.
 * The three reconcile verdicts (working / idle / missing+unknown) drive three
 * distinct dispatch outcomes; this is the single most crash-sensitive path in
 * the tool (a wrong branch loses accumulated multi-day progress), which is why
 * it is the top test priority.
 *
 * All collaborators are injected via `ResumeFlowDeps` so a test can pin each
 * branch deterministically with stubs — no `mock.module`, no SDK fakes.
 */

import type { t as Tfn } from "./i18n"
import type { PersistedLoopState } from "./loop-state-store"
import type { ReconcileResult } from "./api"
import type { LoopAction } from "../types"

/**
 * Minimal collaborator surface for the resume flow. Each member is exactly
 * what `doResume` called on its closed-over hooks/services — narrowed to the
 * methods actually used so a test stub has the smallest possible surface.
 */
export interface ResumeFlowDeps {
  /** Loop state-machine dispatch. */
  loop: { dispatch: (action: LoopAction) => void }
  /** Restores the rate-limit retry counter from the persisted snapshot. */
  cooldown: { setAttempts: (n: number) => void }
  /** Notified only on the re-attach (working) branch. */
  watchdog: { notifyIterationStart: () => void }
  /** Activity log; receives the resume/continue event line. */
  activityLog: { addEvent: (...args: unknown[]) => void }
  /** i18n function. */
  t: typeof Tfn
  /** Resolves the client for `p.sessionId`; null when the server is gone. */
  resolveClient: () => { reconcile: (sessionId: string) => Promise<ReconcileResult> } | null
  /** Reconcile the persisted session against the server; injected (not
   * imported) so tests stub it without `mock.module`. */
  reconcile: (client: NonNullable<ReturnType<ResumeFlowDeps["resolveClient"]>>, sessionId: string) => Promise<ReconcileResult>
  /** Clears the persisted snapshot; only the idle branch continues with a
   * fresh iteration, so only it clears state. */
  clearLoopState: () => Promise<void>
  /** Called only on the re-attach (working) branch to advance the loop. */
  reconcileAndAdvance: () => Promise<ReconcileResult>
}

/** What `doResumeFlow` did, for assertion. `action` is the dispatched type. */
export interface ResumeOutcome {
  verdict: ReconcileResult
  /** The loop action dispatched: `resume_session` (reattach OR fresh) or
   * `iteration_resumed` (idle — next iteration_started skips the increment). */
  action: "resume_session" | "iteration_resumed"
  /** Preserved from the snapshot (never +1 here). */
  iteration: number
  /** The sessionId carried into the new running state. */
  sessionId: string
}

/**
 * Resume a persisted run. If the old session is still working on the server we
 * re-attach to it; otherwise (the usual case — the embedded server died with
 * us) we continue the loop with a fresh iteration, preserving the count.
 *
 * Behavior is byte-identical to the former inline `doResume` closure.
 */
export async function doResumeFlow(
  deps: ResumeFlowDeps,
  p: PersistedLoopState,
): Promise<ResumeOutcome> {
  const { loop, cooldown, watchdog, activityLog, t, resolveClient, reconcile, clearLoopState, reconcileAndAdvance } = deps

  cooldown.setAttempts(p.rateLimitAttempts || 0)
  const client = resolveClient()
  let verdict: ReconcileResult = "missing"
  if (client && p.sessionId) {
    verdict = await reconcile(client, p.sessionId)
  }

  if (verdict === "working" && p.sessionId) {
    activityLog.addEvent(
      "session_start",
      t("actResuming", { id: p.sessionId.substring(0, 8), iteration: p.iteration }),
    )
    loop.dispatch({
      type: "resume_session",
      iteration: p.iteration,
      sessionId: p.sessionId,
    })
    watchdog.notifyIterationStart()
    void reconcileAndAdvance()
    return { verdict, action: "resume_session", iteration: p.iteration, sessionId: p.sessionId }
  }

  // idle / missing / unknown: start a fresh iteration. The persisted snapshot
  // is cleared (the just-finished-or-dead session should not be resumed again).
  activityLog.addEvent("task", t("actContinuing", { verdict }))
  await clearLoopState()
  // When verdict === "idle", the in-flight session already finished its work
  // in a previous run (the process crashed between the session idling and
  // plan_complete being detected). The upcoming startIteration +
  // iteration_started would otherwise bump the counter to p.iteration + 1,
  // over-counting the work done. Dispatch iteration_resumed (instead of
  // resume_session) so the next iteration_started skips the increment. For
  // missing/unknown verdicts the in-flight session's outcome is unknown, so
  // we use resume_session to start a genuinely new iteration counted as
  // p.iteration + 1.
  const isIdleResume = verdict === "idle"
  loop.dispatch({
    type: isIdleResume ? "iteration_resumed" : "resume_session",
    iteration: p.iteration,
    sessionId: "",
  })
  return { verdict, action: isIdleResume ? "iteration_resumed" : "resume_session", iteration: p.iteration, sessionId: "" }
}
