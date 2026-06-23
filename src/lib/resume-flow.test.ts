import { describe, expect, it } from "bun:test"

import { doResumeFlow, type ResumeFlowDeps } from "./resume-flow"
import type { PersistedLoopState } from "./loop-state-store"
import type { ReconcileResult } from "./api"
import type { LoopAction } from "../types"
import { t as T } from "./i18n"

/**
 * Minimal client shape the resume flow exercises: just enough for the injected
 * `reconcile`. `ResumeFlowDeps<C>` is generic in the client so production wires
 * a real `OpencodeClient` and tests wire this stub — both without casts.
 */
type StubClient = { reconcile: (sessionId: string) => Promise<ReconcileResult> }

/**
 * Crash-resume is the most crash-sensitive path: a wrong branch loses
 * accumulated multi-day progress. These tests pin each of the three reconcile
 * verdicts → dispatch outcomes, deterministically, via injected stubs (no
 * `mock.module`, no SDK). The three branches were previously untested because
 * `useResume.tsx` is not importable under bun:test (JSX runtime); extracting
 * the logic to `resume-flow.ts` makes them reachable.
 *
 * Branch map (the contract under test):
 *   working   → resume_session, sessionId preserved, notifyIterationStart + reconcileAndAdvance called
 *   idle      → iteration_resumed, sessionId="", clearLoopState called, NO notifyIterationStart
 *   missing   → resume_session, sessionId="", clearLoopState called, NO notifyIterationStart
 *   unknown   → same as missing (shared else-branch)
 *   no client → verdict defaults to "missing"
 */
type Dispatched = LoopAction

interface StubState {
  dispatched: Dispatched[]
  setAttemptsCalls: number[]
  notifyIterationStartCalls: number
  addEventCalls: unknown[][]
  clearLoopStateCalls: number
  reconcileAndAdvanceCalls: number
  verdictToReturn: ReconcileResult
  clientAvailable: boolean
}

function makeDeps(over: Partial<StubState> = {}): { deps: ResumeFlowDeps<StubClient>; state: StubState } {
  const state: StubState = {
    dispatched: [],
    setAttemptsCalls: [],
    notifyIterationStartCalls: 0,
    addEventCalls: [],
    clearLoopStateCalls: 0,
    reconcileAndAdvanceCalls: 0,
    verdictToReturn: "missing",
    clientAvailable: true,
    ...over,
  }
  const deps: ResumeFlowDeps<StubClient> = {
    loop: {
      dispatch: (a) => {
        state.dispatched.push(a)
      },
    },
    cooldown: {
      setAttempts: (n) => {
        state.setAttemptsCalls.push(n)
      },
    },
    watchdog: {
      notifyIterationStart: () => {
        state.notifyIterationStartCalls++
      },
    },
    activityLog: {
      addEvent: (...args) => {
        state.addEventCalls.push(args)
      },
    },
    t: T,
    resolveClient: () =>
      state.clientAvailable ? { reconcile: async () => state.verdictToReturn } : null,
    reconcile: async (_client, _sessionId) => state.verdictToReturn,
    clearLoopState: async () => {
      state.clearLoopStateCalls++
    },
    reconcileAndAdvance: async () => {
      state.reconcileAndAdvanceCalls++
      return "idle"
    },
  }
  return { deps, state }
}

function snapshot(): PersistedLoopState {
  return {
    version: 1,
    iteration: 7,
    sessionId: "sess-12345678",
    stateType: "running",
    rateLimitAttempts: 3,
    updatedAt: "2026-06-01T00:00:00.000Z",
  }
}

describe("doResumeFlow", () => {
  describe("working verdict (re-attach to live session)", () => {
    it("dispatches resume_session with the preserved iteration and sessionId", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "working" })
      const outcome = await doResumeFlow(deps, snapshot())
      expect(state.dispatched).toHaveLength(1)
      expect(state.dispatched[0]).toEqual({
        type: "resume_session",
        iteration: 7,
        sessionId: "sess-12345678",
      })
      expect(outcome).toEqual({
        verdict: "working",
        action: "resume_session",
        iteration: 7,
        sessionId: "sess-12345678",
      })
    })

    it("notifies the watchdog and triggers reconcileAndAdvance", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "working" })
      await doResumeFlow(deps, snapshot())
      expect(state.notifyIterationStartCalls).toBe(1)
      expect(state.reconcileAndAdvanceCalls).toBe(1)
    })

    it("does NOT clear loop state (we are re-attaching, not restarting)", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "working" })
      await doResumeFlow(deps, snapshot())
      expect(state.clearLoopStateCalls).toBe(0)
    })

    it("logs the resume activity event with the truncated session id", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "working" })
      await doResumeFlow(deps, snapshot())
      expect(state.addEventCalls).toHaveLength(1)
      expect(state.addEventCalls[0][0]).toBe("session_start")
    })
  })

  describe("idle verdict (session already finished before crash)", () => {
    it("dispatches iteration_resumed so the next iteration_started does NOT increment", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "idle" })
      const outcome = await doResumeFlow(deps, snapshot())
      expect(state.dispatched[0]).toEqual({
        type: "iteration_resumed",
        iteration: 7,
        sessionId: "",
      })
      expect(outcome.action).toBe("iteration_resumed")
      expect(outcome.sessionId).toBe("")
    })

    it("clears loop state (fresh iteration, do not resume this snapshot again)", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "idle" })
      await doResumeFlow(deps, snapshot())
      expect(state.clearLoopStateCalls).toBe(1)
    })

    it("does NOT notify the watchdog or reconcileAndAdvance (no live session)", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "idle" })
      await doResumeFlow(deps, snapshot())
      expect(state.notifyIterationStartCalls).toBe(0)
      expect(state.reconcileAndAdvanceCalls).toBe(0)
    })
  })

  describe("missing verdict (server has no record of the session)", () => {
    it("dispatches resume_session with an empty sessionId (fresh iteration, count preserved then +1)", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "missing" })
      const outcome = await doResumeFlow(deps, snapshot())
      expect(state.dispatched[0]).toEqual({
        type: "resume_session",
        iteration: 7,
        sessionId: "",
      })
      expect(outcome.action).toBe("resume_session")
      expect(outcome.sessionId).toBe("")
    })

    it("clears loop state and skips watchdog notification", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "missing" })
      await doResumeFlow(deps, snapshot())
      expect(state.clearLoopStateCalls).toBe(1)
      expect(state.notifyIterationStartCalls).toBe(0)
    })
  })

  describe("unknown verdict", () => {
    it("is treated identically to missing (shared else-branch)", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "unknown" })
      const outcome = await doResumeFlow(deps, snapshot())
      expect(state.dispatched[0]).toEqual({
        type: "resume_session",
        iteration: 7,
        sessionId: "",
      })
      expect(outcome.action).toBe("resume_session")
      expect(state.clearLoopStateCalls).toBe(1)
      expect(state.notifyIterationStartCalls).toBe(0)
    })
  })

  describe("no client available (server gone)", () => {
    it("defaults the verdict to missing without attempting reconcile", async () => {
      const { deps, state } = makeDeps({ clientAvailable: false, verdictToReturn: "working" })
      // verdictToReturn is "working" but resolveClient returns null, so the
      // reconcile must never run and the default "missing" path must win.
      const outcome = await doResumeFlow(deps, snapshot())
      expect(outcome.verdict).toBe("missing")
      expect(outcome.action).toBe("resume_session")
      expect(outcome.sessionId).toBe("")
    })

    it("still clears loop state on the missing path", async () => {
      const { deps, state } = makeDeps({ clientAvailable: false })
      await doResumeFlow(deps, snapshot())
      expect(state.clearLoopStateCalls).toBe(1)
    })
  })

  describe("rate-limit attempt restoration", () => {
    it("restores the persisted rateLimitAttempts on the cooldown counter (any verdict)", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "missing" })
      await doResumeFlow(deps, snapshot())
      expect(state.setAttemptsCalls).toEqual([3])
    })

    it("coerces a missing rateLimitAttempts to 0", async () => {
      const { deps, state } = makeDeps({ verdictToReturn: "missing" })
      const p = snapshot()
      delete (p as Partial<PersistedLoopState>).rateLimitAttempts
      await doResumeFlow(deps, p)
      expect(state.setAttemptsCalls).toEqual([0])
    })
  })

  describe("empty persisted sessionId", () => {
    it("skips reconcile and falls through to the missing path even with a client", async () => {
      // `if (client && p.sessionId)` gates the reconcile call; an empty
      // persisted sessionId means there was no in-flight session to re-attach.
      const { deps, state } = makeDeps({ verdictToReturn: "working" })
      const p = snapshot()
      p.sessionId = ""
      const outcome = await doResumeFlow(deps, p)
      expect(outcome.verdict).toBe("missing")
      expect(state.notifyIterationStartCalls).toBe(0)
    })
  })
})
