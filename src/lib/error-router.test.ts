import { describe, expect, it } from "bun:test"
import { routeSessionError } from "./error-router"
import type { SessionError } from "../hooks/useSSE"

const baseError = (overrides: Partial<SessionError> = {}): SessionError => ({
  message: "boom",
  isAborted: false,
  kind: "fatal",
  ...overrides,
})

describe("routeSessionError", () => {
  describe("abort (isAborted: true)", () => {
    it("returns null regardless of state or source (abort is call-site specific)", () => {
      expect(
        routeSessionError(
          baseError({ isAborted: true, kind: "aborted" }),
          "running",
          "sse",
        ),
      ).toBeNull()
      expect(
        routeSessionError(
          baseError({ isAborted: true, kind: "aborted" }),
          "pausing",
          "api",
        ),
      ).toBeNull()
      expect(
        routeSessionError(
          baseError({ isAborted: true, kind: "aborted" }),
          "paused",
          "sse",
        ),
      ).toBeNull()
    })
  })

  describe("rate_limit", () => {
    it("running → cooldown with retryAfter", () => {
      const action = routeSessionError(
        baseError({ kind: "rate_limit", message: "429", retryAfter: 30 }),
        "running",
        "sse",
      )
      expect(action).toEqual({
        type: "cooldown",
        message: "429",
        retryAfter: 30,
        kind: "rate_limit",
      })
    })

    it("pausing → cooldown (so a rate limit mid-pause can't wedge the loop)", () => {
      const action = routeSessionError(
        baseError({ kind: "rate_limit" }),
        "pausing",
        "api",
      )
      expect(action).toEqual({
        type: "cooldown",
        message: "boom",
        kind: "rate_limit",
      })
    })

    it("paused → null (no live iteration to retry)", () => {
      expect(
        routeSessionError(baseError({ kind: "rate_limit" }), "paused", "sse"),
      ).toBeNull()
    })

    it("cooldown → null (already in cooldown; would loop)", () => {
      expect(
        routeSessionError(baseError({ kind: "rate_limit" }), "cooldown", "sse"),
      ).toBeNull()
    })

    it("debug → null (debug sessions have their own error path)", () => {
      expect(
        routeSessionError(baseError({ kind: "rate_limit" }), "debug", "sse"),
      ).toBeNull()
    })

    it("retryAfter is optional (transient / unknown carriers drop it)", () => {
      const action = routeSessionError(
        baseError({ kind: "rate_limit" }),
        "running",
        "sse",
      )
      expect(action).toMatchObject({ type: "cooldown", retryAfter: undefined })
    })
  })

  describe("transient", () => {
    it("running → cooldown with kind: 'transient'", () => {
      const action = routeSessionError(
        baseError({ kind: "transient", message: "5xx" }),
        "running",
        "sse",
      )
      expect(action).toEqual({
        type: "cooldown",
        message: "5xx",
        retryAfter: undefined,
        kind: "transient",
      })
    })

    it("pausing → cooldown (matches the rate_limit state gate)", () => {
      const action = routeSessionError(
        baseError({ kind: "transient" }),
        "pausing",
        "api",
      )
      expect(action).toMatchObject({ type: "cooldown", kind: "transient" })
    })

    it("paused → null (no live iteration to retry)", () => {
      expect(
        routeSessionError(baseError({ kind: "transient" }), "paused", "sse"),
      ).toBeNull()
    })

    it("ignores any retryAfter hint (transient never carries one)", () => {
      const action = routeSessionError(
        baseError({ kind: "transient", retryAfter: 99 }),
        "running",
        "sse",
      )
      expect(action).toMatchObject({ retryAfter: undefined })
    })
  })

  describe("auth", () => {
    it("running → error action with recoverable: false and source: api", () => {
      const action = routeSessionError(
        baseError({ kind: "auth", message: "401" }),
        "running",
        "api",
      )
      expect(action).toEqual({
        type: "error",
        source: "api",
        errorMessage: "401",
        recoverable: false,
      })
    })

    it("pausing → error action (rate-limit-style gate applies)", () => {
      expect(
        routeSessionError(
          baseError({ kind: "auth" }),
          "pausing",
          "sse",
        ),
      ).toMatchObject({ type: "error", source: "sse" })
    })

    it("debug → error action (debug surfaces auth/fatal too)", () => {
      expect(
        routeSessionError(
          baseError({ kind: "auth" }),
          "debug",
          "sse",
        ),
      ).toMatchObject({ type: "error", recoverable: false })
    })

    it("paused → null (debug state isn't the only non-running escape)", () => {
      expect(
        routeSessionError(baseError({ kind: "auth" }), "paused", "sse"),
      ).toBeNull()
    })

    it("cooldown → null (already cooling down; let the cooldown finish)", () => {
      expect(
        routeSessionError(baseError({ kind: "auth" }), "cooldown", "sse"),
      ).toBeNull()
    })
  })

  describe("fatal", () => {
    it("running → error action with recoverable: false", () => {
      const action = routeSessionError(
        baseError({ kind: "fatal", message: "boom" }),
        "running",
        "sse",
      )
      expect(action).toEqual({
        type: "error",
        source: "sse",
        errorMessage: "boom",
        recoverable: false,
      })
    })

    it("debug → error action", () => {
      expect(
        routeSessionError(baseError({ kind: "fatal" }), "debug", "api"),
      ).toMatchObject({ type: "error" })
    })

    it("ready → null (no in-flight iteration, no debug session)", () => {
      expect(
        routeSessionError(baseError({ kind: "fatal" }), "ready", "sse"),
      ).toBeNull()
    })
  })

  describe("recoverable flag (defensive form)", () => {
    it("is false for auth (the only kind that can be called from this branch today)", () => {
      expect(
        routeSessionError(
          baseError({ kind: "auth" }),
          "running",
          "sse",
        ),
      ).toMatchObject({ recoverable: false })
    })

    it("is false for fatal", () => {
      expect(
        routeSessionError(
          baseError({ kind: "fatal" }),
          "running",
          "sse",
        ),
      ).toMatchObject({ recoverable: false })
    })
  })

  describe("source propagation", () => {
    it("propagates 'sse' to the error action's source field", () => {
      expect(
        routeSessionError(
          baseError({ kind: "fatal" }),
          "running",
          "sse",
        ),
      ).toMatchObject({ source: "sse" })
    })

    it("propagates 'api' to the error action's source field", () => {
      expect(
        routeSessionError(
          baseError({ kind: "fatal" }),
          "running",
          "api",
        ),
      ).toMatchObject({ source: "api" })
    })
  })
})
