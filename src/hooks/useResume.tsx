/**
 * Crash-resume flow: initializeSession + doResume.
 *
 * Moves the startup persistence reconciliation out of AppContent. On a fresh
 * boot it loads .loop-state.json, detects a PLAN.md edit between crash and
 * resume, and either auto-resumes (--resume) or prompts the user. doResume
 * re-attaches to a still-working server session or continues with a fresh
 * iteration preserving the count.
 *
 * Behavior unchanged from the inline closures it replaces.
 */

import type { JSX } from "solid-js"

import type { useLoopState } from "./useLoopState"
import type { useCooldown } from "./useCooldown"
import type { useWatchdog } from "./useWatchdog"
import type { useActivityLog } from "./useActivityLog"
import type { DialogContextValue } from "../context/DialogContext"
import type { t as Tfn } from "../lib/i18n"
import type { ResilienceConfig } from "../lib/config"
import type { PersistedLoopState } from "../lib/loop-state-store"
import type { ReconcileResult } from "../lib/api"
import { DialogConfirm } from "../ui/DialogConfirm"
import {
  loadLoopState,
  clearLoopState,
} from "../lib/loop-state-store"
import { describeResumeAttempt } from "../lib/resume-decision"
import { describeResumeAlignment } from "../lib/resume-alignment"
import { resolvePlanFile } from "../lib/plan-file"
import { ensureGitignore } from "../lib/project"
import { tryGetClient, reconcileSession } from "../lib/api"
import { log } from "../lib/debug-logger"

export interface ResumeDeps {
  // CLI flags. `boolean | undefined` matches CLIArgs (the props are optional):
  // an absent flag is `undefined`, a present `--debug`/`--run` is `true`. Every
  // internal use is a truthy check (`if (deps.run)`), so undefined behaves
  // identically to false — the looser type just removes a false type error at
  // the App.tsx call site without changing runtime behavior.
  debug: boolean | undefined
  run: boolean | undefined
  planFile: string | undefined
  // Loop + sibling hooks
  loop: ReturnType<typeof useLoopState>
  cooldown: ReturnType<typeof useCooldown>
  watchdog: ReturnType<typeof useWatchdog>
  activityLog: ReturnType<typeof useActivityLog>
  // Context APIs + reactive accessors
  dialog: DialogContextValue
  t: typeof Tfn
  resilience: () => ResilienceConfig
  // `() => string | null` matches useServer.url (the sole caller source) and
  // tryGetClient's getter contract in api.ts. Was typed `string | undefined`,
  // which diverged from the source and forced the App.tsx call site to pass a
  // `() => string | null` into a `string | undefined` slot — a type error.
  serverUrl: () => string | null
  // Imperative actions owned by AppContent
  createDebugSession: () => Promise<void>
  reconcileAndAdvance: () => Promise<ReconcileResult>
}

export interface ResumeApi {
  initializeSession: () => Promise<void>
}

export function useResume(deps: ResumeDeps): ResumeApi {
  const { loop, cooldown, watchdog, activityLog, dialog, t } = deps

  /**
   * Resume a persisted run. If the old session is still working on the server
   * we re-attach to it; otherwise (the usual case — the embedded server died
   * with us) we continue the loop with a fresh iteration, preserving the count.
   */
  async function doResume(p: PersistedLoopState): Promise<void> {
    cooldown.setAttempts(p.rateLimitAttempts || 0)
    // Pass the GETTER (not its invoked value): tryGetClient's contract is
    // `getUrl: () => string | null` and it invokes the getter once internally.
    // The prior `deps.serverUrl()` passed a string where a function was
    // expected — a type hole that would have thrown `serverUrl is not a
    // function` at runtime the moment a resume ran with a live server URL.
    const client = tryGetClient(deps.serverUrl)
    let verdict: ReconcileResult = "missing"
    if (client && p.sessionId) {
      verdict = await reconcileSession(client, p.sessionId)
    }
    log.health("resume", verdict, {
      iteration: p.iteration,
      sessionId: p.sessionId,
    })

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
      void deps.reconcileAndAdvance()
    } else {
      activityLog.addEvent("task", t("actContinuing", { verdict }))
      await clearLoopState()
      // When verdict === "idle", the in-flight session already finished its
      // work in a previous run (the process crashed between the session idling
      // and plan_complete being detected). The upcoming startIteration +
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
    }
  }

  async function initializeSession(): Promise<void> {
    // In debug mode, create a session immediately and return.
    if (deps.debug) {
      await deps.createDebugSession()
      return
    }

    try {
      await ensureGitignore()

      // Resume after a crash: a persisted state means the OCLoop process itself
      // died mid-run. Reconcile/continue automatically with --resume, otherwise
      // offer the choice.
      const persisted = await loadLoopState()
      // When --resume is passed on a clean run (no .loop-state.json or a stale
      // one with iteration=0), the flag is parsed and stored but produces zero
      // observable effect. Log the no-op so .loop.log shows intent + outcome.
      const resumeAttempt = describeResumeAttempt(
        { resilience: deps.resilience() },
        persisted,
      )
      if (resumeAttempt) {
        log.health(resumeAttempt.event, "requested", resumeAttempt.payload)
      }
      if (persisted && persisted.iteration > 0) {
        log.health("resume", "found", {
          iteration: persisted.iteration,
          sessionId: persisted.sessionId,
          stateType: persisted.stateType,
        })
        // If the saved state has a currentTask, compare it against the current
        // PLAN.md: a mismatch means the user edited/reordered/completed tasks
        // between crash and resume, and a naive resume would silently start on a
        // different task. Best-effort — a read failure logs a warn and the loop
        // proceeds (the warning is informational).
        if (persisted.currentTask) {
          try {
            const planPath = resolvePlanFile(deps.planFile)
            const planFile = Bun.file(planPath)
            if (await planFile.exists()) {
              const planContent = await planFile.text()
              const alignment = describeResumeAlignment(
                persisted.currentTask,
                planContent,
              )
              if (alignment) {
                // Both .loop.log and the activity panel get a line so the user
                // sees the warning regardless of where they look.
                log.warn("plan", "Resume misalignment detected", {
                  kind: alignment.kind,
                  saved: alignment.saved,
                  current: "current" in alignment ? alignment.current : null,
                })
                activityLog.addEvent(
                  "error",
                  t("actResumeMisalign", {
                    kind: alignment.kind,
                    saved: alignment.saved,
                    // Resolve to a string here: Params values are `string |
                    // number`, and `alignment.current` is `string | null` for the
                    // `removed` case. Collapsing null → "—" matches the i18n
                    // template's own `?? "—"` fallback, so the rendered message
                    // is identical and the type stays sound.
                    current:
                      ("current" in alignment ? alignment.current : null) ?? "—",
                  }),
                  { level: "warn" },
                )
              }
            }
          } catch (err) {
            // PLAN.md unreadable at resume time: don't fail the resume, just
            // skip the alignment check. The next startIteration re-reads the
            // plan and either proceeds or hits its own error path.
            log.warn(
              "plan",
              "Resume alignment check skipped: cannot read PLAN.md",
              err,
            )
          }
        }
        if (deps.resilience().resume) {
          await doResume(persisted)
        } else {
          dialog.show(() => (
            <DialogConfirm
              title={t("dlgResumeTitle")}
              message={t("dlgResumeMsg", { iteration: persisted.iteration })}
              confirmLabel={t("dlgResumeConfirm")}
              cancelLabel={t("dlgResumeCancel")}
              onConfirm={() => {
                dialog.clear()
                void doResume(persisted)
              }}
              onCancel={() => {
                dialog.clear()
                void clearLoopState()
                if (deps.run) loop.dispatch({ type: "start" })
              }}
            />
          ))
        }
        return
      }

      if (deps.run) {
        // --run flag set: start immediately. The iteration-driver effect picks
        // up the running+empty-session state and kicks off the first iteration.
        loop.dispatch({ type: "start" })
      }
    } catch (err) {
      // Log error but don't block startup.
      log.error("session", "Failed to initialize session", err)
      if (deps.run) {
        loop.dispatch({ type: "start" })
      }
    }
  }

  return { initializeSession }
}

// Marker so the JSX runtime is retained for the DialogConfirm render.
export type _JsxMarker = JSX.Element
