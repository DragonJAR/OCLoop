import { describe, expect, it } from "bun:test"
import { getActiveSessionId, loopReducer } from "./useLoopState"
import type { LoopState, LoopAction } from "../types"

describe("loopReducer", () => {
  describe("server_ready action", () => {
    it("should transition from starting to ready", () => {
      const state: LoopState = { type: "starting" }
      const action: LoopAction = { type: "server_ready" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("ready")
    })

    it("should not change state if already running", () => {
      const state: LoopState = {
        type: "running",
        iteration: 5,
        sessionId: "test-session",
      }
      const action: LoopAction = { type: "server_ready" }

      const result = loopReducer(state, action)

      expect(result).toEqual(state)
    })
  })

  describe("debug_preview action", () => {
    it("sets the given state verbatim from any prior state (screenshot staging)", () => {
      const target: LoopState = {
        type: "cooldown",
        iteration: 5,
        reason: "429",
        resumeAt: 0,
        attempt: 3,
        kind: "rate_limit",
      }
      // The escape hatch bypasses transition guards: even from an unrelated
      // state it sets the target directly (used only by debug Preview commands).
      const result = loopReducer(
        { type: "debug", sessionId: "" },
        { type: "debug_preview", state: target },
      )
      expect(result).toEqual(target)
    })
  })

  describe("start action", () => {
    it("should transition from ready to running", () => {
      const state: LoopState = { type: "ready" }
      const action: LoopAction = { type: "start" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(0)
        expect(result.sessionId).toBe("")
      }
    })

    it("should not change state if not in ready state", () => {
      const state: LoopState = {
        type: "running",
        iteration: 5,
        sessionId: "test-session",
      }
      const action: LoopAction = { type: "start" }

      const result = loopReducer(state, action)

      expect(result).toEqual(state)
    })

    it("should not change state if in paused state", () => {
      const state: LoopState = {
        type: "paused",
        iteration: 2,
      }
      const action: LoopAction = { type: "start" }

      const result = loopReducer(state, action)

      expect(result).toEqual(state)
    })
  })

  describe("iteration_started action", () => {
    it("should increment iteration and set sessionId when running", () => {
      const state: LoopState = {
        type: "running",
        iteration: 2,
        sessionId: "",
      }
      const action: LoopAction = {
        type: "iteration_started",
        sessionId: "new-session-123",
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(3)
        expect(result.sessionId).toBe("new-session-123")
      }
    })

    it("should transition from paused to running when resuming", () => {
      const state: LoopState = {
        type: "paused",
        iteration: 3,
      }
      const action: LoopAction = {
        type: "iteration_started",
        sessionId: "resume-session",
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(4)
        expect(result.sessionId).toBe("resume-session")
      }
    })

    it("is a no-op from pausing — the orphan-session race (Bug #2)", () => {
      // running("") → user hits Space → pausing("") → a late iteration_started
      // (createSession resolved AFTER the pause) arrives. The reducer must NOT
      // adopt the session; the App layer detects the dropped id and aborts the
      // orphan so it doesn't keep running on the server burning tokens.
      const pausing = loopReducer(
        { type: "running", iteration: 1, sessionId: "" },
        { type: "toggle_pause" },
      )
      expect(pausing.type).toBe("pausing")
      const after = loopReducer(pausing, {
        type: "iteration_started",
        sessionId: "ses_orphan",
      })
      expect(after).toBe(pausing) // referential no-op
      expect(getActiveSessionId(after)).toBe("") // never "ses_orphan"
    })

    it("is a no-op from a stopping/stopped state (Bug #2)", () => {
      const stopped = loopReducer(
        { type: "running", iteration: 1, sessionId: "" },
        { type: "quit" },
      )
      const after = loopReducer(stopped, {
        type: "iteration_started",
        sessionId: "ses_orphan",
      })
      expect(after).toBe(stopped) // dropped id; App must abort it
      expect(getActiveSessionId(after)).toBe("")
    })
  })

  describe("toggle_pause action", () => {
    it("should transition from running to pausing", () => {
      const state: LoopState = {
        type: "running",
        iteration: 3,
        sessionId: "session-123",
      }
      const action: LoopAction = { type: "toggle_pause" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("pausing")
      if (result.type === "pausing") {
        expect(result.iteration).toBe(3)
        expect(result.sessionId).toBe("session-123")
      }
    })

    it("should resume from paused to running", () => {
      const state: LoopState = {
        type: "paused",
        iteration: 5,
      }
      const action: LoopAction = { type: "toggle_pause" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(5)
        expect(result.sessionId).toBe("")
      }
    })

    it("should cancel a pending pause: pausing → running keeping the same session", () => {
      const state: LoopState = {
        type: "pausing",
        iteration: 3,
        sessionId: "session-123",
      }
      const result = loopReducer(state, { type: "toggle_pause" })

      expect(result.type).toBe("running")
      if (result.type === "running") {
        // Same iteration and same active session — no new iteration started.
        expect(result.iteration).toBe(3)
        expect(result.sessionId).toBe("session-123")
      }
    })
  })

  describe("session_idle action", () => {
    it("should reset sessionId when running", () => {
      const state: LoopState = {
        type: "running",
        iteration: 3,
        sessionId: "completed-session",
      }
      const action: LoopAction = { type: "session_idle" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.sessionId).toBe("")
        expect(result.iteration).toBe(3)
      }
    })

    it("should transition from pausing to paused", () => {
      const state: LoopState = {
        type: "pausing",
        iteration: 4,
        sessionId: "session-to-pause",
      }
      const action: LoopAction = { type: "session_idle" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("paused")
      if (result.type === "paused") {
        expect(result.iteration).toBe(4)
      }
    })
  })

  describe("quit action", () => {
    it("should transition from running to stopping", () => {
      const state: LoopState = {
        type: "running",
        iteration: 2,
        sessionId: "session",
      }
      const action: LoopAction = { type: "quit" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("stopping")
    })

    it("should transition from paused to stopping", () => {
      const state: LoopState = {
        type: "paused",
        iteration: 3,
      }
      const action: LoopAction = { type: "quit" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("stopping")
    })

    it("should transition from pausing to stopping", () => {
      const state: LoopState = {
        type: "pausing",
        iteration: 2,
        sessionId: "session",
      }
      const action: LoopAction = { type: "quit" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("stopping")
    })

    it("should transition from ready to stopping", () => {
      const state: LoopState = { type: "ready" }
      const action: LoopAction = { type: "quit" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("stopping")
    })

    it("should not change state when starting", () => {
      const state: LoopState = { type: "starting" }
      const action: LoopAction = { type: "quit" }

      const result = loopReducer(state, action)

      expect(result).toEqual(state)
    })
  })

  describe("plan_complete action", () => {
    it("should transition from running to complete with summary", () => {
      const state: LoopState = {
        type: "running",
        iteration: 10,
        sessionId: "session",
      }
      const action: LoopAction = {
        type: "plan_complete",
        summary: { summary: "Work done" },
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("complete")
      if (result.type === "complete") {
        expect(result.iterations).toBe(10)
        expect(result.summary.summary).toBe("Work done")
      }
    })

    it("should transition from paused to complete with summary", () => {
      const state: LoopState = {
        type: "paused",
        iteration: 7,
      }
      const action: LoopAction = {
        type: "plan_complete",
        summary: { summary: "Blocked tasks" },
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("complete")
      if (result.type === "complete") {
        expect(result.iterations).toBe(7)
        expect(result.summary.summary).toBe("Blocked tasks")
      }
    })

    it("should transition from ready to complete with summary", () => {
      const state: LoopState = { type: "ready" }
      const action: LoopAction = {
        type: "plan_complete",
        summary: { summary: "Nothing done" },
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("complete")
      if (result.type === "complete") {
        expect(result.iterations).toBe(0)
        expect(result.summary.summary).toBe("Nothing done")
      }
    })
  })

  describe("error action", () => {
    it("should transition from starting to error", () => {
      const state: LoopState = { type: "starting" }
      const action: LoopAction = {
        type: "error",
        source: "server",
        message: "Failed to start server",
        recoverable: true,
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect(result.source).toBe("server")
        expect(result.message).toBe("Failed to start server")
        expect(result.recoverable).toBe(true)
      }
    })

    it("should transition from ready to error", () => {
      const state: LoopState = { type: "ready" }
      const action: LoopAction = {
        type: "error",
        source: "api",
        message: "Something failed",
        recoverable: true,
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect(result.source).toBe("api")
        expect(result.message).toBe("Something failed")
        expect(result.recoverable).toBe(true)
      }
    })

    it("should transition from running to error", () => {
      const state: LoopState = {
        type: "running",
        iteration: 3,
        sessionId: "session",
      }
      const action: LoopAction = {
        type: "error",
        source: "api",
        message: "API request failed",
        recoverable: true,
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect(result.source).toBe("api")
        expect(result.message).toBe("API request failed")
        expect(result.recoverable).toBe(true)
      }
    })

    it("should transition from paused to error", () => {
      const state: LoopState = {
        type: "paused",
        iteration: 2,
      }
      const action: LoopAction = {
        type: "error",
        source: "pty",
        message: "Terminal crashed",
        recoverable: false,
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect(result.source).toBe("pty")
        expect(result.message).toBe("Terminal crashed")
        expect(result.recoverable).toBe(false)
      }
    })

    it("should transition from pausing to error", () => {
      const state: LoopState = {
        type: "pausing",
        iteration: 4,
        sessionId: "session",
      }
      const action: LoopAction = {
        type: "error",
        source: "sse",
        message: "Connection lost",
        recoverable: true,
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect(result.source).toBe("sse")
        expect(result.message).toBe("Connection lost")
      }
    })

    it("should not change state when already stopped", () => {
      const state: LoopState = { type: "stopped" }
      const action: LoopAction = {
        type: "error",
        source: "server",
        message: "Some error",
        recoverable: true,
      }

      const result = loopReducer(state, action)

      expect(result).toEqual(state)
    })
  })

  describe("retry action", () => {
    it("should transition from recoverable error to starting", () => {
      const state: LoopState = {
        type: "error",
        source: "server",
        message: "Server failed",
        recoverable: true,
      }
      const action: LoopAction = { type: "retry" }

      const result = loopReducer(state, action)

      expect(result.type).toBe("starting")
    })

    it("should not transition from non-recoverable error", () => {
      const state: LoopState = {
        type: "error",
        source: "pty",
        message: "Terminal crashed",
        recoverable: false,
      }
      const action: LoopAction = { type: "retry" }

      const result = loopReducer(state, action)

      expect(result).toEqual(state)
    })

    it("should not change state when not in error state", () => {
      const state: LoopState = {
        type: "running",
        iteration: 1,
        sessionId: "session",
      }
      const action: LoopAction = { type: "retry" }

      const result = loopReducer(state, action)

      expect(result).toEqual(state)
    })
  })

  describe("rate_limited / cooldown actions", () => {
    it("transitions from running to cooldown preserving the iteration", () => {
      const state: LoopState = {
        type: "running",
        iteration: 4,
        sessionId: "session-x",
      }
      const action: LoopAction = {
        type: "rate_limited",
        reason: "429 too many requests",
        resumeAt: 12345,
        attempt: 2,
      }

      const result = loopReducer(state, action)

      expect(result.type).toBe("cooldown")
      if (result.type === "cooldown") {
        expect(result.iteration).toBe(4)
        expect(result.reason).toBe("429 too many requests")
        expect(result.resumeAt).toBe(12345)
        expect(result.attempt).toBe(2)
      }
    })

    it("transitions from pausing to cooldown", () => {
      const state: LoopState = {
        type: "pausing",
        iteration: 1,
        sessionId: "s",
      }
      const result = loopReducer(state, {
        type: "rate_limited",
        reason: "overloaded",
        resumeAt: 999,
        attempt: 1,
      })
      expect(result.type).toBe("cooldown")
    })

    it("propagates kind=\"transient\" from rate_limited into the cooldown state (Finding 5.1.A)", () => {
      const result = loopReducer(
        { type: "running", iteration: 2, sessionId: "s" },
        {
          type: "rate_limited",
          reason: "connection reset",
          resumeAt: 5000,
          attempt: 1,
          kind: "transient",
        },
      )
      expect(result.type).toBe("cooldown")
      if (result.type === "cooldown") {
        expect(result.kind).toBe("transient")
      }
    })

    it("defaults kind to \"rate_limit\" when the action omits it (chaos_429 compat, Finding 5.1.A)", () => {
      const result = loopReducer(
        { type: "running", iteration: 2, sessionId: "s" },
        {
          type: "rate_limited",
          reason: "429",
          resumeAt: 5000,
          attempt: 1,
        },
      )
      expect(result.type).toBe("cooldown")
      if (result.type === "cooldown") {
        expect(result.kind).toBe("rate_limit")
      }
    })

    it("does not enter cooldown from ready/paused", () => {
      expect(
        loopReducer({ type: "ready" }, {
          type: "rate_limited",
          reason: "x",
          resumeAt: 1,
          attempt: 1,
        }).type,
      ).toBe("ready")
      expect(
        loopReducer({ type: "paused", iteration: 2 }, {
          type: "rate_limited",
          reason: "x",
          resumeAt: 1,
          attempt: 1,
        }).type,
      ).toBe("paused")
    })

    it("preserves a pause across a cooldown: pausing → rate_limited → resume_cooldown ⇒ paused (Bug #4)", () => {
      let state: LoopState = { type: "pausing", iteration: 4, sessionId: "ses-x" }
      state = loopReducer(state, {
        type: "rate_limited", reason: "429", resumeAt: 999, attempt: 1, kind: "rate_limit",
      })
      expect(state.type).toBe("cooldown")
      if (state.type === "cooldown") expect(state.wasPausing).toBe(true)
      // Cooldown elapses → must return to PAUSED (not running), honoring the pause.
      state = loopReducer(state, { type: "resume_cooldown" })
      expect(state.type).toBe("paused")
      if (state.type === "paused") expect(state.iteration).toBe(4)
    })

    it("running → rate_limited → resume_cooldown still resumes to running (no false pause, Bug #4)", () => {
      let state: LoopState = { type: "running", iteration: 2, sessionId: "ses-y" }
      state = loopReducer(state, {
        type: "rate_limited", reason: "429", resumeAt: 999, attempt: 1, kind: "rate_limit",
      })
      if (state.type === "cooldown") expect(state.wasPausing).toBeUndefined()
      state = loopReducer(state, { type: "resume_cooldown" })
      expect(state.type).toBe("running")
      if (state.type === "running") expect(state.sessionId).toBe("")
    })

    it("resume_cooldown returns to running with an empty session, same iteration", () => {
      const state: LoopState = {
        type: "cooldown",
        iteration: 7,
        reason: "rate limit",
        resumeAt: 555,
        attempt: 3,
        kind: "rate_limit",
      }
      const result = loopReducer(state, { type: "resume_cooldown" })
      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(7)
        expect(result.sessionId).toBe("")
      }
    })

    it("can quit from cooldown", () => {
      const state: LoopState = {
        type: "cooldown",
        iteration: 1,
        reason: "r",
        resumeAt: 1,
        attempt: 1,
        kind: "rate_limit",
      }
      expect(loopReducer(state, { type: "quit" }).type).toBe("stopping")
    })

    it("can escalate from cooldown to a recoverable error", () => {
      const state: LoopState = {
        type: "cooldown",
        iteration: 1,
        reason: "r",
        resumeAt: 1,
        attempt: 8,
        kind: "rate_limit",
      }
      const result = loopReducer(state, {
        type: "error",
        source: "api",
        message: "Rate limit persistente",
        recoverable: true,
      })
      expect(result.type).toBe("error")
    })
  })

  describe("resume_session action", () => {
    it("re-attaches to a working session from ready", () => {
      const result = loopReducer({ type: "ready" }, {
        type: "resume_session",
        iteration: 5,
        sessionId: "ses_live",
      })
      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(5)
        expect(result.sessionId).toBe("ses_live")
      }
    })

    it("with an empty session id, preserves iteration for a fresh start", () => {
      const result = loopReducer({ type: "ready" }, {
        type: "resume_session",
        iteration: 8,
        sessionId: "",
      })
      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(8)
        expect(result.sessionId).toBe("")
      }
    })

    it("is ignored from non-ready states", () => {
      const state: LoopState = { type: "running", iteration: 1, sessionId: "x" }
      expect(
        loopReducer(state, { type: "resume_session", iteration: 9, sessionId: "y" }),
      ).toEqual(state)
    })
  })

  describe("iteration_resumed action (Finding 8.5.A)", () => {
    it("from ready, sets running with resumedFromIdle=true and preserves iteration", () => {
      const result = loopReducer({ type: "ready" }, {
        type: "iteration_resumed",
        iteration: 8,
        sessionId: "",
      })
      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(8)
        expect(result.sessionId).toBe("")
        expect(result.resumedFromIdle).toBe(true)
      }
    })

    it("from ready with a live sessionId re-attaches and tags resumedFromIdle=true", () => {
      // Defensive: even if a future caller passes a non-empty sessionId, the
      // resumedFromIdle flag is set so the next iteration_started (if it ever
      // fires) does not double-count.
      const result = loopReducer({ type: "ready" }, {
        type: "iteration_resumed",
        iteration: 3,
        sessionId: "ses_live",
      })
      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(3)
        expect(result.sessionId).toBe("ses_live")
        expect(result.resumedFromIdle).toBe(true)
      }
    })

    it("is ignored from non-ready states (mirrors resume_session guard)", () => {
      const state: LoopState = { type: "running", iteration: 1, sessionId: "x" }
      expect(
        loopReducer(state, { type: "iteration_resumed", iteration: 9, sessionId: "y" }),
      ).toEqual(state)
    })
  })

  describe("iteration_started with resumedFromIdle flag (Finding 8.5.A)", () => {
    it("does NOT increment iteration when the source state has resumedFromIdle=true", () => {
      // The in-flight work was already done in a previous run. The counter
      // represents "iterations of unique work" — the resumed iteration is a
      // redo, not new work, so the count stays at p.iteration.
      const state: LoopState = {
        type: "running",
        iteration: 8,
        sessionId: "",
        resumedFromIdle: true,
      }
      const result = loopReducer(state, {
        type: "iteration_started",
        sessionId: "ses_new",
      })
      expect(result.type).toBe("running")
      if (result.type === "running") {
        expect(result.iteration).toBe(8)
        expect(result.sessionId).toBe("ses_new")
        expect(result.resumedFromIdle).toBeUndefined() // one-shot: flag is cleared
      }
    })

    it("increments iteration normally when resumedFromIdle is absent or false (regression)", () => {
      // Sanity: the new behavior is opt-in via the flag. Fresh iterations
      // (no flag) still bump from N to N+1. The reducer only short-circuits
      // the increment when the flag is truthy; false/undefined both take the
      // normal path and the field is dropped from the result (it was never
      // set in the first place).
      const fresh: LoopState = { type: "running", iteration: 8, sessionId: "" }
      const result1 = loopReducer(fresh, { type: "iteration_started", sessionId: "ses_a" })
      if (result1.type !== "running") throw new Error("expected running")
      expect(result1.iteration).toBe(9)
      expect(result1.resumedFromIdle).toBeUndefined()

      const flagged: LoopState = {
        type: "running",
        iteration: 8,
        sessionId: "",
        resumedFromIdle: false, // explicit false behaves like absent
      }
      const result2 = loopReducer(flagged, { type: "iteration_started", sessionId: "ses_b" })
      if (result2.type !== "running") throw new Error("expected running")
      expect(result2.iteration).toBe(9)
      expect(result2.resumedFromIdle).toBeUndefined()
    })

    it("a SECOND iteration_started after the flag was cleared increments normally (one-shot semantics)", () => {
      // After the resumed iteration's session_idle fires, the next genuine
      // iteration (started by the iteration-driver) should increment to
      // p.iteration + 1. The flag must be one-shot.
      const state: LoopState = {
        type: "running",
        iteration: 8,
        sessionId: "",
        // resumedFromIdle already cleared by the previous iteration_started
      }
      const result = loopReducer(state, {
        type: "iteration_started",
        sessionId: "ses_next",
      })
      if (result.type !== "running") throw new Error("expected running")
      expect(result.iteration).toBe(9)
    })

    it("from paused, increments normally (paused → running via iteration_started is unaffected)", () => {
      // The flag is only set by `iteration_resumed` from ready, which can
      // only land us in running. paused → running via iteration_started
      // (the resume-from-pause path) must increment as before.
      const state: LoopState = { type: "paused", iteration: 5 }
      const result = loopReducer(state, {
        type: "iteration_started",
        sessionId: "ses_resume",
      })
      if (result.type !== "running") throw new Error("expected running")
      expect(result.iteration).toBe(6)
    })
  })

  describe("Phase 2 — state machine edge cases", () => {
    it("session_idle on running with sessionId === '' returns the SAME state object (idempotency guard)", () => {
      const state: LoopState = {
        type: "running",
        iteration: 3,
        sessionId: "",
      }
      const result = loopReducer(state, { type: "session_idle" })
      expect(result).toBe(state)
    })

    it("plan_complete from cooldown preserves iteration", () => {
      const state: LoopState = {
        type: "cooldown",
        iteration: 5,
        reason: "rate limit",
        resumeAt: 12345,
        attempt: 2,
        kind: "rate_limit",
      }
      const result = loopReducer(state, {
        type: "plan_complete",
        summary: { summary: "All done" },
      })
      expect(result.type).toBe("complete")
      if (result.type === "complete") {
        expect(result.iterations).toBe(5)
        expect(result.summary.summary).toBe("All done")
      }
    })

    it("plan_complete from error state without lastIteration falls back to 0", () => {
      // Regression: callers that construct an error state directly (tests, mocks)
      // without `lastIteration` still get the old default of 0. The fix only
      // preserves a count when the error state was reached from a state that
      // had one. See MEJORAS.md Finding 3.1.A.
      const state: LoopState = {
        type: "error",
        source: "server",
        message: "crashed",
        recoverable: true,
      }
      const result = loopReducer(state, {
        type: "plan_complete",
        summary: { summary: "Done despite error" },
      })
      expect(result.type).toBe("complete")
      if (result.type === "complete") {
        expect(result.iterations).toBe(0)
        expect(result.summary.summary).toBe("Done despite error")
      }
    })

    it("plan_complete from error state with lastIteration preserves the count (Finding 3.1.A)", () => {
      // When the error was reached from a state that had an `iteration` field
      // (running/pausing/paused/cooldown), the reducer now carries that count
      // into `lastIteration` so a later `plan_complete` can report real
      // progress instead of resetting to 0.
      const state: LoopState = {
        type: "error",
        source: "api",
        message: "transient",
        recoverable: true,
        lastIteration: 12,
      }
      const result = loopReducer(state, {
        type: "plan_complete",
        summary: { summary: "Plan finished after error" },
      })
      expect(result.type).toBe("complete")
      if (result.type === "complete") {
        expect(result.iterations).toBe(12)
        expect(result.summary.summary).toBe("Plan finished after error")
      }
    })

    it("rate_limited from paused state is ignored (returns same state)", () => {
      const state: LoopState = { type: "paused", iteration: 2 }
      const result = loopReducer(state, {
        type: "rate_limited",
        reason: "429",
        resumeAt: 999,
        attempt: 1,
      })
      expect(result).toEqual(state)
    })

    it("resume_cooldown from non-cooldown state (running) is ignored", () => {
      const state: LoopState = {
        type: "running",
        iteration: 1,
        sessionId: "abc",
      }
      const result = loopReducer(state, { type: "resume_cooldown" })
      expect(result).toEqual(state)
    })

    it("error transition from cooldown state works", () => {
      const state: LoopState = {
        type: "cooldown",
        iteration: 3,
        reason: "429",
        resumeAt: 5000,
        attempt: 2,
        kind: "rate_limit",
      }
      const result = loopReducer(state, {
        type: "error",
        source: "api",
        message: "Rate limit escalated",
        recoverable: true,
      })
      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect(result.source).toBe("api")
        expect(result.recoverable).toBe(true)
      }
    })

    it("error transition from debug state works", () => {
      const state: LoopState = { type: "debug", sessionId: "dbg-1" }
      const result = loopReducer(state, {
        type: "error",
        source: "sse",
        message: "Connection lost",
        recoverable: false,
      })
      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect(result.source).toBe("sse")
        expect(result.recoverable).toBe(false)
      }
    })

    it("server_ready_debug from non-starting state is ignored", () => {
      const state: LoopState = {
        type: "running",
        iteration: 1,
        sessionId: "abc",
      }
      const result = loopReducer(state, { type: "server_ready_debug" })
      expect(result).toEqual(state)
    })

    it("new_session from non-debug state is ignored", () => {
      const state: LoopState = {
        type: "running",
        iteration: 1,
        sessionId: "abc",
      }
      const result = loopReducer(state, {
        type: "new_session",
        sessionId: "new",
      })
      expect(result).toEqual(state)
    })

    it("quit from cooldown state transitions to stopping", () => {
      const state: LoopState = {
        type: "cooldown",
        iteration: 2,
        reason: "rate limit",
        resumeAt: 9999,
        attempt: 1,
        kind: "rate_limit",
      }
      const result = loopReducer(state, { type: "quit" })
      expect(result.type).toBe("stopping")
    })
  })

  describe("state machine flow scenarios", () => {
    it("should handle a complete lifecycle: start → ready → run → pause → resume → complete", () => {
      let state: LoopState = { type: "starting" }

      // Server becomes ready
      state = loopReducer(state, { type: "server_ready" })
      expect(state.type).toBe("ready")

      // User starts the loop
      state = loopReducer(state, { type: "start" })
      expect(state.type).toBe("running")

      // First iteration starts
      state = loopReducer(state, {
        type: "iteration_started",
        sessionId: "session-1",
      })
      if (state.type === "running") {
        expect(state.iteration).toBe(1)
      }

      // Session completes
      state = loopReducer(state, { type: "session_idle" })
      expect(state.type).toBe("running")

      // Second iteration starts
      state = loopReducer(state, {
        type: "iteration_started",
        sessionId: "session-2",
      })
      if (state.type === "running") {
        expect(state.iteration).toBe(2)
      }

      // User pauses
      state = loopReducer(state, { type: "toggle_pause" })
      expect(state.type).toBe("pausing")

      // Session completes while pausing
      state = loopReducer(state, { type: "session_idle" })
      expect(state.type).toBe("paused")

      // User resumes
      state = loopReducer(state, { type: "toggle_pause" })
      expect(state.type).toBe("running")

      // Third iteration starts
      state = loopReducer(state, {
        type: "iteration_started",
        sessionId: "session-3",
      })
      if (state.type === "running") {
        expect(state.iteration).toBe(3)
      }

      // Plan is complete
      state = loopReducer(state, {
        type: "plan_complete",
        summary: { summary: "Done" },
      })
      expect(state.type).toBe("complete")
      if (state.type === "complete") {
        expect(state.iterations).toBe(3)
        expect(state.summary.summary).toBe("Done")
      }
    })
  })

  // ==========================================================================
  // Phase 3.1 — Full state machine matrix audit
  // ==========================================================================
  // 11 states × 13 actions = 143 combinations. The matrix below systematically
  // covers the FULL (state, action) grid. The earlier tests cover the "happy
  // path" for each action; the new tests below pin down the "no-op" (or
  // transition) cases for every OTHER state so the contract is explicit and
  // not silently lost in a future refactor.
  // --------------------------------------------------------------------------
  describe("Phase 3.1 — full state machine matrix audit", () => {
    // Reference states — one per LoopState variant. The "starting" state is
    // the initial state and "stopped"/"stopping" are reached via the
    // `stopped` action which is not dispatched by the reducer (handleQuit
    // does process.exit) but they exist in the type system and must be
    // covered.
    const reference: Record<LoopState["type"], LoopState> = {
      starting: { type: "starting" },
      ready: { type: "ready" },
      running: { type: "running", iteration: 3, sessionId: "ses-3" },
      pausing: { type: "pausing", iteration: 3, sessionId: "ses-3" },
      paused: { type: "paused", iteration: 3 },
      cooldown: { type: "cooldown", iteration: 3, reason: "r", resumeAt: 1, attempt: 1, kind: "rate_limit" },
      stopping: { type: "stopping" },
      stopped: { type: "stopped" },
      complete: { type: "complete", iterations: 3, summary: { summary: "x" } },
      error: { type: "error", source: "server", message: "x", recoverable: true },
      debug: { type: "debug", sessionId: "ses-3" },
    }

    /**
     * For an action, verify that the specified set of state types is a
     * deep-equal no-op. Used to pin the contract for "this action only
     * affects these states, everything else is ignored".
     */
    function expectNoOp(action: LoopAction, types: LoopState["type"][]) {
      for (const t of types) {
        const result = loopReducer(reference[t], action)
        expect(result).toEqual(reference[t])
      }
    }

    // --- server_ready: only "starting" transitions ---
    it("server_ready: from ready, running, pausing, paused, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "server_ready" },
        ["ready", "running", "pausing", "paused", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })

    // --- server_ready_debug: only "starting" transitions ---
    it("server_ready_debug: from ready, running, pausing, paused, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "server_ready_debug" },
        ["ready", "running", "pausing", "paused", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })
    it("server_ready_debug: from starting → debug (success case)", () => {
      const result = loopReducer(reference.starting, { type: "server_ready_debug" })
      expect(result.type).toBe("debug")
      if (result.type === "debug") expect(result.sessionId).toBe("")
    })

    // --- new_session: only "debug" transitions ---
    it("new_session: from starting, ready, running, pausing, paused, cooldown, stopping, stopped, complete, error → no-op", () => {
      expectNoOp(
        { type: "new_session", sessionId: "new" },
        ["starting", "ready", "running", "pausing", "paused", "cooldown", "stopping", "stopped", "complete", "error"],
      )
    })
    it("new_session: from debug → debug (success case, with new sessionId)", () => {
      const result = loopReducer(reference.debug, { type: "new_session", sessionId: "new" })
      expect(result.type).toBe("debug")
      if (result.type === "debug") expect(result.sessionId).toBe("new")
    })

    // --- start: only "ready" transitions ---
    it("start: from starting, running, pausing, paused, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "start" },
        ["starting", "running", "pausing", "paused", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })

    // --- iteration_started: only "running" and "paused" transition ---
    it("iteration_started: from starting, ready, pausing, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "iteration_started", sessionId: "ses-new" },
        ["starting", "ready", "pausing", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })
    it("iteration_started: from running(empty session) increments from state.iteration (3 → 4)", () => {
      const before: LoopState = { type: "running", iteration: 3, sessionId: "" }
      const result = loopReducer(before, { type: "iteration_started", sessionId: "ses-4" })
      if (result.type !== "running") throw new Error("expected running")
      expect(result.iteration).toBe(4)
      expect(result.sessionId).toBe("ses-4")
    })
    it("iteration_started: from paused(3) → running(4) with new sessionId (matches startIteration contract)", () => {
      const result = loopReducer(
        { type: "paused", iteration: 3 },
        { type: "iteration_started", sessionId: "ses-4" },
      )
      if (result.type !== "running") throw new Error("expected running")
      expect(result.iteration).toBe(4)
      expect(result.sessionId).toBe("ses-4")
    })

    // --- toggle_pause: only "running", "pausing", "paused" transition ---
    it("toggle_pause: from starting, ready, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "toggle_pause" },
        ["starting", "ready", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })

    // --- session_idle: only "running", "pausing", "debug" transition ---
    it("session_idle: from starting, ready, paused, cooldown, stopping, stopped, complete, error → no-op", () => {
      expectNoOp(
        { type: "session_idle" },
        ["starting", "ready", "paused", "cooldown", "stopping", "stopped", "complete", "error"],
      )
    })
    it("session_idle: from debug → debug (clears sessionId, ready for new session)", () => {
      const result = loopReducer(reference.debug, { type: "session_idle" })
      expect(result.type).toBe("debug")
      if (result.type === "debug") expect(result.sessionId).toBe("")
    })

    // --- rate_limited: only "running" and "pausing" transition ---
    it("rate_limited: from starting, ready, paused, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "rate_limited", reason: "x", resumeAt: 1, attempt: 1 },
        ["starting", "ready", "paused", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })
    it("rate_limited: from pausing → cooldown (preserves iteration, drops sessionId)", () => {
      const result = loopReducer(
        { type: "pausing", iteration: 5, sessionId: "ses-5" },
        { type: "rate_limited", reason: "429", resumeAt: 999, attempt: 2 },
      )
      if (result.type !== "cooldown") throw new Error("expected cooldown")
      expect(result.iteration).toBe(5)
      expect(result.reason).toBe("429")
      expect(result.resumeAt).toBe(999)
      expect(result.attempt).toBe(2)
    })

    // --- resume_cooldown: only "cooldown" transitions ---
    it("resume_cooldown: from starting, ready, running, pausing, paused, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "resume_cooldown" },
        ["starting", "ready", "running", "pausing", "paused", "stopping", "stopped", "complete", "error", "debug"],
      )
    })

    // --- resume_session: only "ready" transitions ---
    it("resume_session: from starting, running, pausing, paused, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "resume_session", iteration: 1, sessionId: "x" },
        ["starting", "running", "pausing", "paused", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })

    // --- iteration_resumed: only "ready" transitions (Finding 8.5.A) ---
    it("iteration_resumed: from starting, running, pausing, paused, cooldown, stopping, stopped, complete, error, debug → no-op", () => {
      expectNoOp(
        { type: "iteration_resumed", iteration: 1, sessionId: "x" },
        ["starting", "running", "pausing", "paused", "cooldown", "stopping", "stopped", "complete", "error", "debug"],
      )
    })

    // --- quit: from "ready", "running", "pausing", "paused", "cooldown", "debug" → stopping ---
    it("quit: from starting, stopping, stopped, complete, error → no-op", () => {
      expectNoOp(
        { type: "quit" },
        ["starting", "stopping", "stopped", "complete", "error"],
      )
    })
    it("quit: from error is a no-op (canQuit=true in UI, but reducer is no-op; actual quit happens via process.exit in handleQuit)", () => {
      const state: LoopState = { type: "error", source: "server", message: "x", recoverable: false }
      const result = loopReducer(state, { type: "quit" })
      expect(result).toEqual(state)
    })

    // --- plan_complete: from "ready", "running", "paused", "cooldown", "error" → complete ---
    it("plan_complete: from starting, pausing, stopping, stopped, complete, debug → no-op", () => {
      expectNoOp(
        { type: "plan_complete", summary: { summary: "x" } },
        ["starting", "pausing", "stopping", "stopped", "complete", "debug"],
      )
    })
    it("plan_complete: from running(7, 'ses-7') → complete(7, summary)", () => {
      const result = loopReducer(
        { type: "running", iteration: 7, sessionId: "ses-7" },
        { type: "plan_complete", summary: { summary: "all done" } },
      )
      if (result.type !== "complete") throw new Error("expected complete")
      expect(result.iterations).toBe(7)
      expect(result.summary.summary).toBe("all done")
    })
    it("plan_complete: from cooldown(4) preserves iteration (does NOT reset to 0)", () => {
      const result = loopReducer(
        { type: "cooldown", iteration: 4, reason: "r", resumeAt: 1, attempt: 1, kind: "rate_limit" },
        { type: "plan_complete", summary: { summary: "x" } },
      )
      if (result.type !== "complete") throw new Error("expected complete")
      expect(result.iterations).toBe(4)
    })
    it("plan_complete: from error with lastIteration preserves the count (Finding 3.1.A)", () => {
      // When the error state was reached from a source that had an `iteration`
      // field (running/pausing/paused/cooldown), the reducer carries it into
      // `lastIteration` so `plan_complete` here reports the real progress
      // instead of resetting to 0. See MEJORAS.md Finding 3.1.A.
      const result = loopReducer(
        { type: "error", source: "api", message: "x", recoverable: true, lastIteration: 9 },
        { type: "plan_complete", summary: { summary: "plan done anyway" } },
      )
      if (result.type !== "complete") throw new Error("expected complete")
      expect(result.iterations).toBe(9)
    })
    it("plan_complete: from error without lastIteration falls back to 0 (Finding 3.1.A default)", () => {
      // Regression: callers (tests, mocks) that construct an error state
      // directly without `lastIteration` still get the default 0. The carry
      // is only triggered when the error transition itself comes from a state
      // that had an iteration. See MEJORAS.md Finding 3.1.A.
      const result = loopReducer(
        { type: "error", source: "api", message: "x", recoverable: true },
        { type: "plan_complete", summary: { summary: "plan done anyway" } },
      )
      if (result.type !== "complete") throw new Error("expected complete")
      expect(result.iterations).toBe(0)
    })

    // --- error: from "starting", "ready", "running", "pausing", "paused", "cooldown", "debug" → error ---
    it("error: from stopping, stopped, complete, error → no-op", () => {
      expectNoOp(
        { type: "error", source: "server", message: "x", recoverable: true },
        ["stopping", "stopped", "complete", "error"],
      )
    })
    it("error: from running(N) carries N into lastIteration (Finding 3.1.A)", () => {
      // The `error` reducer must preserve the iteration count from the source
      // state when the source had one, so a later `plan_complete` can report
      // real progress. See MEJORAS.md Finding 3.1.A.
      const result = loopReducer(
        { type: "running", iteration: 7, sessionId: "ses-7" },
        { type: "error", source: "api", message: "x", recoverable: true },
      )
      expect(result.type).toBe("error")
      if (result.type === "error") expect(result.lastIteration).toBe(7)
    })
    it("error: from paused(N) carries N into lastIteration (Finding 3.1.A)", () => {
      const result = loopReducer(
        { type: "paused", iteration: 3 },
        { type: "error", source: "api", message: "x", recoverable: true },
      )
      expect(result.type).toBe("error")
      if (result.type === "error") expect(result.lastIteration).toBe(3)
    })
    it("error: from cooldown(N) carries N into lastIteration (Finding 3.1.A)", () => {
      const result = loopReducer(
        { type: "cooldown", iteration: 5, reason: "r", resumeAt: 1, attempt: 1, kind: "rate_limit" },
        { type: "error", source: "api", message: "x", recoverable: true },
      )
      expect(result.type).toBe("error")
      if (result.type === "error") expect(result.lastIteration).toBe(5)
    })
    it("error: from starting does NOT set lastIteration (Finding 3.1.A)", () => {
      // `starting` has no `iteration` field, so the carry must be absent (not
      // `undefined` as a value — the field is simply omitted from the new
      // state object, matching the project's "optional = omit" convention).
      const result = loopReducer(
        { type: "starting" },
        { type: "error", source: "api", message: "x", recoverable: true },
      )
      expect(result.type).toBe("error")
      if (result.type === "error") {
        expect("lastIteration" in result).toBe(false)
      }
    })

    // --- retry: from "error (recoverable)" → starting ---
    it("retry: from starting, ready, running, pausing, paused, cooldown, stopping, stopped, complete, debug → no-op", () => {
      expectNoOp(
        { type: "retry" },
        ["starting", "ready", "running", "pausing", "paused", "cooldown", "stopping", "stopped", "complete", "debug"],
      )
    })
    it("retry: from error(recoverable=false) is a no-op (non-recoverable errors are permanent)", () => {
      const state: LoopState = { type: "error", source: "pty", message: "x", recoverable: false }
      const result = loopReducer(state, { type: "retry" })
      expect(result).toEqual(state)
    })
  })

  // --- getActiveSessionId truth table (Task 6.2) ---
  // The watchdog `isActive` probe in App.tsx:242-247 inlines this same
  // predicate. Pin the truth table here so any future refactor that touches
  // either side will fail this test, not the watchdog.
  describe("getActiveSessionId", () => {
    it("returns '' for non-guarded states (starting, ready, paused, cooldown, stopping, stopped, complete, error)", () => {
      const states: LoopState[] = [
        { type: "starting" },
        { type: "ready" },
        { type: "paused", iteration: 0 },
        {
          type: "cooldown",
          iteration: 0,
          reason: "x",
          resumeAt: 0,
          attempt: 1,
          kind: "rate_limit",
        },
        { type: "stopping" },
        { type: "stopped" },
        { type: "complete", iterations: 0, summary: { summary: "" } },
        { type: "error", source: "api", message: "x", recoverable: true },
      ]
      for (const s of states) {
        expect(getActiveSessionId(s)).toBe("")
      }
    })

    it("returns '' for running/pausing with empty sessionId (pre-iteration_start window)", () => {
      expect(getActiveSessionId({ type: "running", iteration: 0, sessionId: "" })).toBe("")
      expect(getActiveSessionId({ type: "pausing", iteration: 0, sessionId: "" })).toBe("")
    })

    it("returns the sessionId for running/pausing with a non-empty sessionId", () => {
      expect(getActiveSessionId({ type: "running", iteration: 3, sessionId: "abc" })).toBe("abc")
      expect(getActiveSessionId({ type: "pausing", iteration: 3, sessionId: "abc" })).toBe("abc")
    })

    it("returns '' for debug (debug is user-driven, not watchdog-guarded)", () => {
      expect(getActiveSessionId({ type: "debug", sessionId: "" })).toBe("")
      // Even with a session attached, debug is NOT a guarded state. This
      // matches the inlined probe at App.tsx:244-246, which excludes debug.
      expect(getActiveSessionId({ type: "debug", sessionId: "abc" })).toBe("")
    })
  })
})
