/**
 * The `--create-plan` headless flow, extracted from src/index.tsx::runCreatePlan
 * so the timeout / accept / save&run / edit-refine / cancel / no-content
 * branches are unit-testable without spawning a real OpenCode server or
 * reading real stdin. Same extraction pattern as runIteration, doResumeFlow,
 * resolveTierMapping: logic in a `.ts` (bun:test-clean), the index.tsx wrapper
 * owns the I/O setup and process.exit/exitCode.
 *
 * Behavior is byte-identical to the former inline runCreatePlan (verified
 * against src/index.tsx lines 213-378 before extraction). The four I/O seams
 * that previously blocked testing are now INJECTED via CreatePlanFlowDeps:
 *
 *   1. session lifecycle — createSessionID() + onClose (replaces the inline
 *      createOpencodeServer + client.session.create).
 *   2. prompts — readGoal(), readChoice(), readEditFeedback() (replaces Bun's
 *      global prompt() at three sites).
 *   3. plan write — writePlan(path, content) (replaces Bun.write).
 *   4. timing — sleep(ms) + now() (replaces Bun.sleep + Date.now, so the
 *      deadline/timeout branches are reachable without wall-clock waits).
 *
 * Everything else (reconcileSession, fetchMessages, sendPromptAsync,
 * hasNewAssistantReply, extractLastAssistantText, countAssistantMessages,
 * stripCodeFences, buildPlanPrompt, buildRefinePrompt, t, log) stays as direct
 * imports/local helpers — they are pure or already take the client explicitly.
 *
 * The function does NOT call process.exit or set process.exitCode. Instead it
 * returns a discriminated CreatePlanOutcome so the wrapper (and tests) decide
 * the exit semantics. This is the one deliberate behavior split: the wrapper
 * maps outcomes to exit codes; the flow itself is pure-ish.
 */

import type { OpencodeClient, SessionMessage, ReconcileResult } from "./api"
import { hasNewAssistantReply, extractLastAssistantText, countAssistantMessages } from "./api"
import { stripCodeFences } from "./plan-parser"
import { t } from "./i18n"
import { log } from "./debug-logger"

/** Outcome of one create-plan run. Discriminated so tests assert without exit. */
export type CreatePlanOutcome =
  | { type: "saved"; runAfter: false } // accept ([y/yes/s/si/sí]) → saved, exit 0
  | { type: "saved"; runAfter: true } // save&run ([r/run/ejecutar]) → saved + boot TUI
  | { type: "cancelled" } // cancel (else) → exit 0
  | { type: "no-goal" } // empty goal → exit 1
  | { type: "no-content" } // generation produced no assistant text → exit 1
  | { type: "timeout" } // planTimeoutMs exhausted → exit 1
  | { type: "error"; message: string } // any other thrown error → exit 1

/** The four I/O seams + config the flow needs. */
export interface CreatePlanFlowDeps {
  /** SDK client bound to the plan-gen server. */
  client: OpencodeClient
  /** Create the plan-generation session; returns its id. */
  createSessionID: () => Promise<string>
  /** Close the server (best-effort; called in finally). */
  onClose: () => void
  /** Plan file path to save to. */
  planPath: string
  /** Model id ("provider/model") to send prompts to. */
  model: string | undefined
  /** Agent name to send prompts to. */
  agent: string
  /** Overall generation budget (default 10 min). */
  planTimeoutMs: number

  // --- SDK call seams (injected so tests stub the catalog/status/messages
  // without modeling the full OpencodeClient surface; production wires them
  // to the real api.ts implementations). ---
  sendPrompt: (client: OpencodeClient, params: {
    sessionID: string
    parts: { type: "text"; text: string }[]
    agent: string
    model: string | undefined
  }, opts: { timeoutMs: number }) => Promise<void>
  reconcile: (client: OpencodeClient, sessionID: string) => Promise<ReconcileResult>
  fetchMessages: (client: OpencodeClient, sessionID: string) => Promise<SessionMessage[]>

  // --- injected I/O seams ---
  /** Read the (possibly multi-line) goal. null/"" → no-goal outcome. */
  readGoal: () => string | null
  /** Read the approve/save&run/edit/cancel choice (lowercased by caller). */
  readChoice: () => string
  /** Read edit feedback on the edit branch. null/"" → no-changes, re-loop. */
  readEditFeedback: () => string | null
  /** Persist the generated plan. */
  writePlan: (path: string, content: string) => Promise<void>
  /** Sleep (injected so tests skip the 1500ms poll interval). */
  sleep: (ms: number) => Promise<void>
  /** Monotonic-ish clock for the deadline (injected; tests advance it). */
  now: () => number

  // --- output sink for human-facing lines (console.log in production;
  // captured/asserted in tests). Kept separate from log (debug-logger). ---
  emit: (line: string) => void
}

/** Build the initial plan-generation prompt (localized via i18n). */
export function buildPlanPrompt(goal: string): string {
  return t("cpPrompt", { goal })
}

/** Build a refinement prompt given the previous plan and user feedback. */
export function buildRefinePrompt(previousPlan: string, feedback: string): string {
  return t("cpRefine", { feedback, plan: previousPlan })
}

/**
 * Run the create-plan flow. Returns the outcome; never calls process.exit.
 *
 * The outer for-loop is regenerate-on-edit; the inner for-loop is the poll to
 * completion. Both loops and every branch mirror the original exactly.
 */
export async function runCreatePlanFlow(deps: CreatePlanFlowDeps): Promise<CreatePlanOutcome> {
  const { client, createSessionID, planPath, model, agent, planTimeoutMs } = deps

  try {
    // --- Read goal (possibly multi-line) ---
    const goal = (deps.readGoal() ?? "").trim()
    if (!goal) {
      deps.emit(t("cpNoGoal"))
      return { type: "no-goal" }
    }

    // --- Create session ---
    const sessionID = await createSessionID()

    let currentPrompt = buildPlanPrompt(goal)
    let plan = ""

    // Outer loop: generate → propose → accept/save&run/edit-refine/cancel.
    for (;;) {
      deps.emit("\n" + t("cpGenerating"))

      // Kick off async and poll. The synchronous session.prompt holds ONE HTTP
      // request open for the whole multi-minute generation; on a long hold the
      // connection drops. Doing it async means only short requests.
      const assistantCountBefore = countAssistantMessages(await deps.fetchMessages(client, sessionID))
      await deps.sendPrompt(
        client,
        { sessionID, agent, model, parts: [{ type: "text", text: currentPrompt }] },
        { timeoutMs: 30_000 },
      )

      const deadline = deps.now() + planTimeoutMs
      let messages: SessionMessage[] = []
      // Inner loop: poll until idle-with-new-reply or deadline.
      for (;;) {
        await deps.sleep(1500)
        // reconcile never throws (returns "unknown" on any error), but
        // fetchMessages can throw on a transient localhost blip. Swallow for
        // this tick and retry; the deadline is the real backstop. Matches the
        // resilience in reconcileSession and the TUI's SSE reconnect path.
        const verdict = await deps.reconcile(client, sessionID)
        try {
          messages = await deps.fetchMessages(client, sessionID)
        } catch (err) {
          log.warn("create-plan", "Transient fetchMessages failure, will retry", {
            message: err instanceof Error ? err.message : String(err),
          })
          if (deps.now() > deadline) {
            return { type: "timeout" }
          }
          continue
        }
        // Done only when idle AND a new non-empty assistant reply landed.
        if (
          (verdict === "idle" || verdict === "missing") &&
          hasNewAssistantReply(messages, assistantCountBefore)
        ) {
          break
        }
        if (deps.now() > deadline) {
          return { type: "timeout" }
        }
      }

      const text = extractLastAssistantText(messages)
      if (!text) {
        deps.emit(t("cpNoContent"))
        return { type: "no-content" }
      }
      plan = stripCodeFences(text)

      deps.emit(plan)

      const choice = deps.readChoice().trim().toLowerCase()

      // Accept ([y/yes/s/si/sí]) → save, exit 0 (do not auto-run).
      if (["y", "yes", "s", "si", "sí"].includes(choice)) {
        await deps.writePlan(planPath, plan.endsWith("\n") ? plan : plan + "\n")
        deps.emit(t("cpSaved", { path: planPath }))
        return { type: "saved", runAfter: false }
      }
      // Save & run ([r/run/ejecutar]) → save, boot TUI with run=true.
      if (["r", "run", "ejecutar"].includes(choice)) {
        await deps.writePlan(planPath, plan.endsWith("\n") ? plan : plan + "\n")
        deps.emit(t("cpSaved", { path: planPath }))
        deps.emit(t("cpStarting"))
        return { type: "saved", runAfter: true }
      }
      // Edit ([e/edit/editar]) → refine prompt and regenerate.
      if (["e", "edit", "editar"].includes(choice)) {
        const feedback = deps.readEditFeedback()
        if (!feedback || !feedback.trim()) {
          deps.emit(t("cpNoChanges"))
          continue
        }
        currentPrompt = buildRefinePrompt(plan, feedback.trim())
        continue
      }

      // Anything else → cancel.
      deps.emit(t("cpCancelled"))
      return { type: "cancelled" }
    }
  } catch (err) {
    return { type: "error", message: err instanceof Error ? err.message : String(err) }
  } finally {
    try {
      deps.onClose()
    } catch {
      // ignore
    }
  }
}
