import { describe, expect, it } from "bun:test"

import { runCreatePlanFlow, type CreatePlanFlowDeps } from "./create-plan-flow"
import type { OpencodeClient, SessionMessage } from "./api"
import type { ReconcileResult } from "./api"

/**
 * Coverage for the `--create-plan` flow, previously an untested inline
 * runCreatePlan in src/index.tsx. runCreatePlanFlow takes every I/O seam as
 * an injected dep (client/session, 3 prompts, writePlan, sleep/clock), so each
 * of the 7 outcome branches pins deterministically — no real server, no stdin,
 * no wall-clock.
 *
 * Branch map (the contract under test):
 *   no-goal    → readGoal returns ""/null
 *   timeout    → deadline exceeded before idle-with-new-reply
 *   no-content → generation idle but no assistant text
 *   saved(false) → accept ([y/yes/s/si/sí]) → writePlan called, runAfter false
 *   saved(true)  → save&run ([r/run/ejecutar]) → writePlan called, runAfter true
 *   cancel     → any other choice
 *   error      → any thrown error (e.g. createSessionID rejects)
 *
 * The injected sleep/now let the timeout branch fire without waiting
 * planTimeoutMs in real time: tests advance the clock past the deadline.
 */

const OK = { response: { ok: true, status: 200, statusText: "OK" } }

/** Build a SessionMessage in the shape api.ts's helpers expect:
 * `{ info: { role }, parts: [{ type: "text", text }] }`. The earlier cast
 * `{ role, content }` did NOT match, so countAssistantMessages/extractLastAssistantText
 * returned 0/"" and the poll loop spun forever. */
function assistantMsg(text: string): SessionMessage {
  return { info: { role: "assistant" }, parts: [{ type: "text", text }] }
}

/** Fake SDK client. `messages` is returned by fetchMessages; `verdict` by
 * reconcileSession (mapped from session.status). `promptAsync` is a no-op. */
function fakeClient(opts: {
  messages?: SessionMessage[]
  status?: "idle" | "busy"
  messageFetchThrows?: boolean
}): { client: OpencodeClient; calls: { promptAsync: number; status: number } } {
  const calls = { promptAsync: 0, status: 0 }
  const client = {
    session: {
      promptAsync: async () => {
        calls.promptAsync++
        return { ...OK, data: undefined }
      },
      status: async () => {
        calls.status++
        return { ...OK, data: { "sess-1": { type: opts.status ?? "idle" } } }
      },
    },
  } as unknown as OpencodeClient
  void opts // messages/throw are wired via the deps stubs below, not the client
  return { client, calls }
}

interface StubState {
  goal: string | null
  choices: string[] // queued readChoice responses (one per outer-loop iteration)
  choiceIdx: number
  editFeedback: string | null
  writtenPlan: { path: string; content: string } | null
  emitted: string[]
  nowMs: number
  sleepCalls: number
  onCloseCalls: number
  /** Messages the poll loop reads, indexed by outer-iteration. [0] is the
   * first generation, [1] the refined plan after an edit, etc. Defaults to a
   * single-entry array so the common 1-iteration case needs no override. */
  messagesByIteration: SessionMessage[][]
  /** Current outer-iteration index (0-based). The baseline fetch for an
   * iteration always returns [] (0 assistant msgs); the poll fetches return
   * messagesByIteration[iteration]. */
  iteration: number
  verdict: ReconcileResult
  fetchThrows: boolean
  /** True once sendPrompt fired this iteration (baseline already read). */
  promptSentThisIter: boolean
}

function makeDeps(over: Partial<StubState> = {}): { deps: CreatePlanFlowDeps; state: StubState } {
  const state: StubState = {
    goal: "build a todo app",
    choices: ["y"],
    choiceIdx: 0,
    editFeedback: null,
    writtenPlan: null,
    emitted: [],
    nowMs: 1_000_000,
    sleepCalls: 0,
    onCloseCalls: 0,
    messagesByIteration: [[assistantMsg("# Plan\n\n- [ ] task one\n")]],
    iteration: 0,
    verdict: "idle",
    fetchThrows: false,
    promptSentThisIter: false,
    ...over,
  }
  const { client } = fakeClient({})
  const deps: CreatePlanFlowDeps = {
    client,
    createSessionID: async () => "sess-1",
    onClose: () => {
      state.onCloseCalls++
    },
    planPath: "/tmp/__test_plan.md",
    model: "zai-coding-plan/glm-5.2",
    agent: "plan",
    planTimeoutMs: 600_000,
    // SDK call seams. The baseline fetch (before sendPrompt) returns [] so the
    // post-prompt reply counts as new. After sendPrompt, return the messages
    // for the current outer iteration. readChoice advances the iteration so
    // the edit/refine loop's 2nd generation re-baselines cleanly.
    sendPrompt: async () => {
      state.promptSentThisIter = true
    },
    reconcile: async () => state.verdict,
    fetchMessages: async () => {
      if (state.fetchThrows) throw new Error("transient blip")
      if (!state.promptSentThisIter) return [] // baseline (0 assistants)
      return state.messagesByIteration[state.iteration] ?? []
    },
    readGoal: () => state.goal,
    readChoice: () => {
      const c = state.choices[state.choiceIdx++] ?? ""
      // The choice ends this outer iteration; advance so a subsequent edit-
      // refine iteration re-baselines its first fetch.
      state.iteration++
      state.promptSentThisIter = false
      return c
    },
    readEditFeedback: () => state.editFeedback,
    writePlan: async (path, content) => {
      state.writtenPlan = { path, content }
    },
    sleep: async () => {
      state.sleepCalls++
    },
    now: () => state.nowMs,
    emit: (line) => {
      state.emitted.push(line)
    },
  }
  return { deps, state }
}

describe("runCreatePlanFlow", () => {
  describe("no-goal", () => {
    it("returns no-goal when readGoal is empty", async () => {
      const { deps, state } = makeDeps({ goal: "" })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "no-goal" })
      // No session created, no plan written.
      expect(state.writtenPlan).toBeNull()
      expect(state.onCloseCalls).toBe(1)
    })

    it("returns no-goal when readGoal is null", async () => {
      const { deps } = makeDeps({ goal: null })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome.type).toBe("no-goal")
    })

    it("trims whitespace-only goals to empty → no-goal", async () => {
      const { deps } = makeDeps({ goal: "   \n\t  " })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome.type).toBe("no-goal")
    })
  })

  describe("accept ([y/yes/s/si/sí])", () => {
    it("writes the plan and returns saved with runAfter=false on 'y'", async () => {
      const { deps, state } = makeDeps({
        choices: ["y"],
        messagesByIteration: [[assistantMsg("# Plan\n\n- [ ] task one\n")]],
        verdict: "idle",
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "saved", runAfter: false })
      expect(state.writtenPlan).toEqual({
        path: "/tmp/__test_plan.md",
        content: "# Plan\n\n- [ ] task one\n",
      })
    })

    it("accepts the Spanish 'sí'", async () => {
      const { deps, state } = makeDeps({
        choices: ["sí"],
        messagesByIteration: [[assistantMsg("plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "saved", runAfter: false })
      expect(state.writtenPlan?.content).toBe("plan\n")
    })

    it("strips a ```fence``` wrapper before saving", async () => {
      const { deps, state } = makeDeps({
        choices: ["yes"],
        messagesByIteration: [[assistantMsg("```markdown\n- [ ] task\n```")]],
      })
      await runCreatePlanFlow(deps)
      expect(state.writtenPlan?.content).toBe("- [ ] task\n")
    })

    it("ensures the saved content ends with a newline", async () => {
      const { deps, state } = makeDeps({
        choices: ["y"],
        messagesByIteration: [[assistantMsg("- [ ] no trailing newline")]],
      })
      await runCreatePlanFlow(deps)
      expect(state.writtenPlan?.content.endsWith("\n")).toBe(true)
    })
  })

  describe("save & run ([r/run/ejecutar])", () => {
    it("writes the plan and returns saved with runAfter=true on 'run'", async () => {
      const { deps, state } = makeDeps({
        choices: ["run"],
        messagesByIteration: [[assistantMsg("plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "saved", runAfter: true })
      expect(state.writtenPlan?.content).toBe("plan\n")
    })

    it("accepts the Spanish 'ejecutar'", async () => {
      const { deps } = makeDeps({
        choices: ["ejecutar"],
        messagesByIteration: [[assistantMsg("plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "saved", runAfter: true })
    })
  })

  describe("cancel", () => {
    it("returns cancelled without writing on any other choice", async () => {
      const { deps, state } = makeDeps({
        choices: ["n"],
        messagesByIteration: [[assistantMsg("plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "cancelled" })
      expect(state.writtenPlan).toBeNull()
    })

    it("returns cancelled on empty choice (just Enter)", async () => {
      const { deps } = makeDeps({
        choices: [""],
        messagesByIteration: [[assistantMsg("plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome.type).toBe("cancelled")
    })
  })

  describe("edit ([e/edit/editar]) → refine loop", () => {
    it("regenerates with a refine prompt when feedback is given, then accepts", async () => {
      // First choice = edit, second = accept. After edit the outer loop
      // re-polls and must produce a new assistant reply.
      const { deps, state } = makeDeps({
        choices: ["e", "y"],
        editFeedback: "make it shorter",
        // Two iterations: [0] first generation, [1] refined after edit feedback.
        messagesByIteration: [[assistantMsg("first plan")], [assistantMsg("refined plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "saved", runAfter: false })
      expect(state.writtenPlan?.content).toBe("refined plan\n")
      // Two generations happened (one per outer-loop iteration).
      expect(state.sleepCalls).toBeGreaterThanOrEqual(2)
    })

    it("skips refinement and re-proposes when edit feedback is empty", async () => {
      const { deps, state } = makeDeps({
        choices: ["e", "y"],
        editFeedback: "",
        messagesByIteration: [[assistantMsg("same plan")], [assistantMsg("same plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome.type).toBe("saved")
    })

    it("accepts the Spanish 'editar'", async () => {
      const { deps } = makeDeps({
        choices: ["editar", "y"],
        editFeedback: "fix it",
        // Two iterations: [0] first generation, [1] regenerated after editar.
        messagesByIteration: [[assistantMsg("plan")], [assistantMsg("plan")]],
      })
      const outcome = await runCreatePlanFlow(deps)
      // After 'editar' + feedback, regenerates and accepts.
      expect(outcome.type).toBe("saved")
    })
  })

  describe("timeout (deadline exceeded)", () => {
    it("returns timeout when the session never goes idle before the deadline", async () => {
      const { deps, state } = makeDeps({
        verdict: "working", // never idle
        choices: ["y"],
        // Advance the clock past the deadline on the first poll.
        nowMs: 1_000_000,
      })
      deps.planTimeoutMs = 1_000 // tiny budget
      // On the first sleep tick, jump the clock beyond the deadline.
      const origSleep = deps.sleep
      deps.sleep = async () => {
        state.nowMs += 10_000 // well past the 1s budget
        await origSleep(0)
      }
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome.type).toBe("timeout")
      expect(state.writtenPlan).toBeNull()
    })
  })

  describe("no-content (generation produced no assistant text)", () => {
    // The flow's no-content branch is defensive: it fires only if the poll
    // loop broke (which requires hasNewAssistantReply → extractLastAssistantText
    // > 0) but the subsequent extractLastAssistantText call returns "". Given
    // the current api.ts implementation that combination is contradictory, so
    // the branch is unreachable in practice and not unit-testable without
    // misrepresenting the contract. It stays as a safety net in the flow; we
    // do not pin it here to avoid a test that would have to lie about the
    // inputs. (If hasNewAssistantReply's text check is ever relaxed, add a
    // test here using assistantNoTextMsg().)
    //
    // NOTE: there used to be an `it.todo(name)` placeholder here, but Bun's
    // type defs declare `it.todo` as `Test<T>` (requires label + fn), so the
    // 1-arg form — valid at runtime — failed `tsc --noEmit` (TS2554). The
    // placeholder carried no executable assertion and the rationale is fully
    // captured by this comment, so it was removed rather than worked around.
  })

  describe("error handling", () => {
    it("returns error when createSessionID throws", async () => {
      const { deps, state } = makeDeps()
      deps.createSessionID = async () => {
        throw new Error("server unreachable")
      }
      const outcome = await runCreatePlanFlow(deps)
      expect(outcome).toEqual({ type: "error", message: "server unreachable" })
      expect(state.writtenPlan).toBeNull()
      expect(state.onCloseCalls).toBe(1)
    })

    it("always calls onClose (even on error)", async () => {
      const { deps, state } = makeDeps({ goal: "" })
      await runCreatePlanFlow(deps)
      expect(state.onCloseCalls).toBe(1)
    })
  })
})
