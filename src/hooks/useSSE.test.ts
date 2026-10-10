import { describe, expect, it } from "bun:test"
import { classifySessionError, type SessionErrorKind } from "./useSSE"

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

    it("each error kind with a representative error object", () => {
      const cases: Array<[string, unknown, SessionErrorKind]> = [
        ["rate_limit", { message: "429 Too Many Requests" }, "rate_limit"],
        ["aborted", { name: "MessageAbortedError", message: "aborted" }, "aborted"],
        ["auth", { message: "401 Unauthorized" }, "auth"],
        ["transient", { message: "502 Bad Gateway" }, "transient"],
        ["fatal", { message: "something completely unexpected" }, "fatal"],
      ]
      for (const [, input, expected] of cases) {
        expect(classifySessionError(input).kind).toBe(expected)
      }
    })

    it("classifySessionError with a string input detects rate_limit", () => {
      expect(classifySessionError("rate limit exceeded").kind).toBe("rate_limit")
    })

    it("classifySessionError with null returns kind fatal and message 'Unknown error'", () => {
      const e = classifySessionError(null)
      expect(e.kind).toBe("fatal")
      expect(e.message).toBe("Unknown error")
    })
  })

  describe("extractRetryAfter edge cases", () => {
    it("parses retry-after header value in seconds (string number)", () => {
      const e = classifySessionError({
        message: "429 rate limit",
        headers: { "retry-after": "120" },
      })
      expect(e.retryAfter).toBe(120)
    })

    it("parses retry-after header value from a Headers-like object with .get()", () => {
      const headers = new Map([["retry-after", "60"]])
      const e = classifySessionError({
        message: "rate limit",
        headers: { get: (k: string) => headers.get(k) },
      })
      expect(e.retryAfter).toBe(60)
    })

    it("extracts retryAfter from message duration with minutes", () => {
      const e = classifySessionError({ message: "overloaded, try again in 2 minutes" })
      expect(e.retryAfter).toBe(120)
    })

    it("extracts retryAfter from message duration with hours", () => {
      const e = classifySessionError({ message: "rate limit, retry after 1 hour" })
      expect(e.retryAfter).toBe(3600)
    })

    it("extracts retryAfter from message duration with days", () => {
      const e = classifySessionError({ message: "rate limit, try again in 1 day" })
      expect(e.retryAfter).toBe(86400)
    })

    it("extracts retryAfter from message duration with the 'h' unit alias", () => {
      const e = classifySessionError({ message: "rate limit, retry after 2h" })
      expect(e.retryAfter).toBe(7200)
    })

    it("extracts retryAfter from message with seconds unit", () => {
      // "retry after" only surfaces retryAfter when the kind is rate_limit,
      // so the message must also trigger rate_limit classification.
      const e = classifySessionError({ message: "rate limit, retry after 30 seconds" })
      expect(e.retryAfter).toBe(30)
    })

    it("extracts retryAfter from data.retryAfter nested field", () => {
      const e = classifySessionError({
        message: "429",
        data: { retryAfter: 45 },
      })
      expect(e.retryAfter).toBe(45)
    })

    it("uses SDK-shaped data.statusCode and responseHeaders for rate limits", () => {
      const e = classifySessionError({
        name: "APIError",
        data: {
          message: "request failed",
          statusCode: 429,
          responseHeaders: { "retry-after": "2" },
        },
      })
      expect(e.kind).toBe("rate_limit")
      expect(e.retryAfter).toBe(2)
    })

    it("extracts retryAfter from message duration in milliseconds (ms)", () => {
      const e = classifySessionError({ message: "rate limit exceeded, retry in 500ms" })
      expect(e.kind).toBe("rate_limit")
      expect(e.retryAfter).toBe(0.5)
    })

    it("extracts retryAfter from message duration with 'milliseconds' unit", () => {
      const e = classifySessionError({ message: "rate limit exceeded, wait 1500 milliseconds" })
      expect(e.kind).toBe("rate_limit")
      expect(e.retryAfter).toBe(1.5)
    })

    it("classifies rate limit from top-level status and statusCode", () => {
      const e1 = classifySessionError({ status: 429, message: "Resource exhausted" })
      expect(e1.kind).toBe("rate_limit")

      const e2 = classifySessionError({ statusCode: 429, message: "Too many calls" })
      expect(e2.kind).toBe("rate_limit")

      const e3 = classifySessionError({ response: { status: 429 }, message: "Blocked" })
      expect(e3.kind).toBe("rate_limit")
    })

    // RFC 7231 §7.1.3 allows BOTH a delta-seconds form ("120") AND an
    // HTTP-date form ("Wed, 21 Oct 2025 07:28:00 GMT"). Some gateways
    // (Cloudflare, nginx) emit the date form, and classifySessionError
    // falls back to `Date.parse` for that shape (B1 audit fix). The tests
    // below pin the behaviour so the parser cannot silently regress to
    // "header ignored → heuristic backoff".
    it("parses Retry-After header in HTTP-date form (RFC 7231)", () => {
      const future = new Date(Date.now() + 30_000)
      const e = classifySessionError({
        message: "rate limit",
        headers: { "retry-after": future.toUTCString() },
      })
      expect(e.kind).toBe("rate_limit")
      // ±2 s tolerance for test execution time between the parse and the assert.
      expect(e.retryAfter).not.toBeUndefined()
      expect(e.retryAfter).toBeGreaterThanOrEqual(28)
      expect(e.retryAfter).toBeLessThanOrEqual(32)
    })

    it("clamps a past HTTP-date Retry-After to >= 0 (never negative)", () => {
      const past = new Date(Date.now() - 60_000)
      const e = classifySessionError({
        message: "rate limit",
        headers: { "retry-after": past.toUTCString() },
      })
      expect(e.retryAfter).toBe(0)
    })

    it("parses HTTP-date Retry-After from the SDK-shaped data.headers location", () => {
      const future = new Date(Date.now() + 5_000)
      const e = classifySessionError({
        name: "APIError",
        data: {
          message: "request failed",
          statusCode: 429,
          headers: { "retry-after": future.toUTCString() },
        },
      })
      expect(e.kind).toBe("rate_limit")
      expect(e.retryAfter).toBeGreaterThanOrEqual(3)
      expect(e.retryAfter).toBeLessThanOrEqual(7)
    })

    it("falls back to heuristic when Retry-After is an unparseable string", () => {
      // "definitely-not-a-date" is not an RFC 1123 / ISO date and not a
      // numeric string — the parser should fall through to the message
      // regex or to `undefined`. With no message hint, retryAfter is
      // undefined and `kind` falls back to the classifier's default
      // (no 429 → "fatal").
      const e = classifySessionError({
        headers: { "retry-after": "definitely-not-a-date" },
        message: "some random failure",
      })
      expect(e.retryAfter).toBeUndefined()
    })
  })
})
