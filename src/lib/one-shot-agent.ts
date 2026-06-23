/**
 * One-shot agent call: create a throwaway session, send a single prompt, wait
 * for the agent to finish, and return its reply text.
 *
 * Used by in-loop features that need the agent's TEXTUAL output (e.g. splitting
 * a stalled task into subtasks) rather than its file edits. Mirrors the
 * poll-for-reply pattern of `runCreatePlan` (src/index.tsx) but for a single
 * isolated prompt: it owns its session and aborts it on the way out, so it
 * never collides with the main loop's session.
 */

import {
  type OpencodeClient,
  type SessionMessage,
  type ReconcileResult,
  createSession,
  sendPromptAsync,
  reconcileSession,
  fetchMessages,
  countAssistantMessages,
  hasNewAssistantReply,
  extractLastAssistantText,
  abortSession,
} from "./api"
import { log } from "./debug-logger"
import { toErrorMessage } from "./format"

export interface OneShotOptions {
  agent?: string
  /** Explicit model; strings must be `provider/model` for the SDK. */
  model?: string
  /** Overall budget for the call (ms). Default 60s. */
  timeoutMs?: number
  /** Poll interval while waiting for the reply (ms). Default 1500. */
  pollMs?: number
}

/**
 * Run one prompt against a fresh session and return the agent's reply text.
 * Throws on timeout (no non-empty assistant reply before the deadline).
 */
export async function runOneShotAgent(
  client: OpencodeClient,
  promptText: string,
  opts: OneShotOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const pollMs = opts.pollMs ?? 1500
  const session = await createSession(client, { timeoutMs })
  const sessionID = session.id
  try {
    const assistantCountBefore = countAssistantMessages(
      await fetchMessages(client, sessionID),
    )
    await sendPromptAsync(
      client,
      { sessionID, agent: opts.agent, model: opts.model, parts: [{ type: "text", text: promptText }] },
      { timeoutMs },
    )

    const deadline = Date.now() + timeoutMs
    let messages: SessionMessage[] = []
    for (;;) {
      await Bun.sleep(pollMs)
      // Both reconcileSession and fetchMessages hit the SAME localhost opencode
      // server. fetchMessages was already retried on a transient blip, but
      // reconcileSession (one line above, in the original) was awaited
      // unguarded — so a reconcile blip would throw, run the finally (aborting
      // the session), and surface as a hard failure even though the identical
      // failure mode in fetchMessages was tolerated. Merging them into one try
      // applies the same "localhost blips are transient" policy to both: retry
      // next tick, with the deadline as the backstop.
      let verdict: ReconcileResult | undefined
      try {
        verdict = await reconcileSession(client, sessionID)
        messages = await fetchMessages(client, sessionID)
      } catch (err) {
        log.warn("one-shot", "Transient server call failure, will retry", {
          message: toErrorMessage(err),
        })
        if (Date.now() > deadline) throw new Error("One-shot agent timed out")
        continue
      }
      if (
        (verdict === "idle" || verdict === "missing") &&
        hasNewAssistantReply(messages, assistantCountBefore)
      ) {
        return extractLastAssistantText(messages)
      }
      if (Date.now() > deadline) throw new Error("One-shot agent timed out")
    }
  } finally {
    // Best-effort cleanup: the throwaway session must not linger on the server.
    try {
      await abortSession(client, sessionID)
    } catch {
      // ignore
    }
  }
}
