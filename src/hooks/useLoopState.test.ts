import { describe, expect, it } from "bun:test"
import { loopReducer } from "./useLoopState"
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

    it("resume_cooldown returns to running with an empty session, same iteration", () => {
      const state: LoopState = {
        type: "cooldown",
        iteration: 7,
        reason: "rate limit",
        resumeAt: 555,
        attempt: 3,
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
})
