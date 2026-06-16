import { describe, expect, it } from "bun:test"
import { classifySessionError } from "./useSSE"

describe("classifySessionError", () => {
  describe("rate limits", () => {
    it("classifies HTTP 429 messages as rate_limit", () => {
      const e = classifySessionError({ message: "Request failed with status 429" })
      expect(e.kind).toBe("rate_limit")
    })

    it("classifies 'rate limit' / 'rate_limit' text", () => {
      expect(classifySessionError({ message: "rate limit exceeded" }).kind).toBe(
        "rate_limit",
      )
      expect(
        classifySessionError({ message: "you hit the rate_limit" }).kind,
      ).toBe("rate_limit")
    })

    it("classifies 'overloaded' and 'quota' as rate_limit", () => {
      expect(classifySessionError({ message: "Overloaded" }).kind).toBe(
        "rate_limit",
      )
      expect(
        classifySessionError({ message: "insufficient_quota for this key" }).kind,
      ).toBe("rate_limit")
    })

    it("classifies by error name (RateLimitError, OverloadedError)", () => {
      expect(
        classifySessionError({ name: "RateLimitError", message: "slow down" })
          .kind,
      ).toBe("rate_limit")
      expect(
        classifySessionError({ name: "OverloadedError", message: "busy" }).kind,
      ).toBe("rate_limit")
    })

    it("extracts retryAfter from a numeric field", () => {
      const e = classifySessionError({ message: "429 too many requests", retryAfter: 42 })
      expect(e.kind).toBe("rate_limit")
      expect(e.retryAfter).toBe(42)
    })

    it("extracts retryAfter from a retry-after header", () => {
      const e = classifySessionError({
        message: "rate limit",
        headers: { "retry-after": "30" },
      })
      expect(e.retryAfter).toBe(30)
    })

    it("parses retryAfter from the message (seconds and minutes)", () => {
      expect(
        classifySessionError({ message: "rate limit, retry after 15 seconds" })
          .retryAfter,
      ).toBe(15)
      expect(
        classifySessionError({ message: "overloaded, try again in 2 minutes" })
          .retryAfter,
      ).toBe(120)
    })

    it("does not attach retryAfter to non-rate-limit errors", () => {
      const e = classifySessionError({ name: "AuthError", message: "401", retryAfter: 10 })
      expect(e.kind).toBe("auth")
      expect(e.retryAfter).toBeUndefined()
    })
  })

  describe("aborted", () => {
    it("classifies MessageAbortedError as aborted and sets isAborted", () => {
      const e = classifySessionError({ name: "MessageAbortedError", message: "stopped" })
      expect(e.kind).toBe("aborted")
      expect(e.isAborted).toBe(true)
    })

    it("classifies generic 'aborted' messages", () => {
      expect(classifySessionError({ message: "request was aborted" }).kind).toBe(
        "aborted",
      )
    })
  })

  describe("auth", () => {
    it("classifies 401/403 and unauthorized as auth", () => {
      expect(classifySessionError({ message: "401 Unauthorized" }).kind).toBe(
        "auth",
      )
      expect(classifySessionError({ message: "invalid api key" }).kind).toBe(
        "auth",
      )
    })
  })

  describe("transient", () => {
    it("classifies 5xx, timeouts, and network errors as transient", () => {
      expect(classifySessionError({ message: "502 Bad Gateway" }).kind).toBe(
        "transient",
      )
      expect(classifySessionError({ message: "ETIMEDOUT" }).kind).toBe(
        "transient",
      )
      expect(classifySessionError({ message: "fetch failed" }).kind).toBe(
        "transient",
      )
    })

    it("classifies a dropped socket connection as transient (auto-retried, not fatal)", () => {
      // Bun's wording for a closed connection — must be transient so the loop
      // backs off and retries instead of stopping for manual intervention.
      expect(
        classifySessionError({
          message:
            "Failed to create session: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()",
        }).kind,
      ).toBe("transient")
    })
  })

  describe("fatal + edge cases", () => {
    it("defaults unknown errors to fatal", () => {
      expect(classifySessionError({ message: "kaboom" }).kind).toBe("fatal")
    })

    it("handles string and nullish inputs without throwing", () => {
      expect(classifySessionError("rate limit hit").kind).toBe("rate_limit")
      expect(classifySessionError(undefined).kind).toBe("fatal")
      expect(classifySessionError(null).message).toBe("Unknown error")
    })

    it("reads message from data.message when top-level message is absent", () => {
      const e = classifySessionError({ data: { message: "429 rate limit" } })
      expect(e.kind).toBe("rate_limit")
    })
  })
})
