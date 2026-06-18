import { describe, expect, it, beforeEach } from "bun:test"
import { reconcileSession, getSessionStatus, assertResponse, sendPromptAsync, toSdkModel, createClient, tryGetClient, __resetClientCacheForTests, type OpencodeClient } from "./api"
import type { SessionStatus } from "@opencode-ai/sdk/v2"

describe("assertResponse", () => {
  it("passes through a 2xx response", () => {
    expect(() =>
      assertResponse({ response: { ok: true, status: 200, statusText: "OK" } }, "x"),
    ).not.toThrow()
  })

  it("throws the HTTP status on a non-ok response", () => {
    expect(() =>
      assertResponse({ response: { ok: false, status: 503, statusText: "Service Unavailable" } }, "send prompt"),
    ).toThrow(/send prompt.*503.*Service Unavailable/)
  })

  it("surfaces the transport error when response is undefined (the masked-crash bug)", () => {
    // The SDK returns { error, response: undefined } when fetch THREW. The old
    // code did `res.response.ok` → "undefined is not an object". Now we surface
    // the real cause instead.
    expect(() =>
      assertResponse({ error: new Error("socket hang up"), response: undefined }, "generate plan"),
    ).toThrow(/generate plan.*socket hang up/)
  })

  it("never crashes when both error and response are missing", () => {
    expect(() => assertResponse({}, "op")).toThrow(/op.*no response/)
  })
})

describe("model normalization", () => {
  it("converts provider/model strings to the SDK model object", () => {
    expect(toSdkModel("anthropic/claude-sonnet-4")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4",
    })
  })

  it("omits non-SDK model strings instead of passing an invalid shape", () => {
    expect(toSdkModel("claude-sonnet-4")).toBeUndefined()
  })

  it("returns undefined for 'provider/' (empty modelID)", () => {
    expect(toSdkModel("anthropic/")).toBeUndefined()
  })

  it("returns undefined for '/model' (empty providerID)", () => {
    expect(toSdkModel("/claude-sonnet-4")).toBeUndefined()
  })

  it("returns undefined for '/' alone", () => {
    expect(toSdkModel("/")).toBeUndefined()
  })

  it("returns undefined for empty and whitespace-only strings", () => {
    expect(toSdkModel("")).toBeUndefined()
    expect(toSdkModel("  ")).toBeUndefined()
  })

  it("passes the normalized model through promptAsync", async () => {
    let seen: unknown
    const client = {
      session: {
        promptAsync: async (params: unknown) => {
          seen = params
          return { response: { ok: true, status: 200, statusText: "OK" } }
        },
      },
    } as unknown as OpencodeClient

    await sendPromptAsync(client, {
      sessionID: "s1",
      parts: [{ type: "text", text: "hello" }],
      model: "anthropic/claude-sonnet-4",
    })

    expect(seen).toMatchObject({
      sessionID: "s1",
      model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
    })
  })
})

/**
 * Build a minimal fake OpencodeClient whose `session.status` returns a chosen
 * record (or throws / hangs) so we can drive reconcileSession deterministically.
 */
function fakeClient(opts: {
  data?: Record<string, SessionStatus>
  ok?: boolean
  throws?: boolean
  hangMs?: number
}): OpencodeClient {
  return {
    session: {
      status: async (_params: unknown, _options?: { signal?: AbortSignal }) => {
        if (opts.throws) throw new Error("connection refused")
        if (opts.hangMs) {
          await new Promise((r) => setTimeout(r, opts.hangMs))
        }
        return {
          response: { ok: opts.ok ?? true, status: 200, statusText: "OK" },
          data: opts.data ?? {},
        }
      },
    },
  } as unknown as OpencodeClient
}

describe("reconcileSession", () => {
  it("returns 'working' when the session is busy", async () => {
    const client = fakeClient({ data: { s1: { type: "busy" } } })
    expect(await reconcileSession(client, "s1")).toBe("working")
  })

  it("returns 'working' when the server is retrying (rate limit)", async () => {
    const client = fakeClient({
      data: { s1: { type: "retry", attempt: 2, message: "rate limit", next: 0 } },
    })
    expect(await reconcileSession(client, "s1")).toBe("working")
  })

  it("returns 'idle' when the session is idle", async () => {
    const client = fakeClient({ data: { s1: { type: "idle" } } })
    expect(await reconcileSession(client, "s1")).toBe("idle")
  })

  it("returns 'missing' when the session is absent from the record", async () => {
    const client = fakeClient({ data: { other: { type: "busy" } } })
    expect(await reconcileSession(client, "s1")).toBe("missing")
  })

  it("returns 'unknown' when the status call throws", async () => {
    const client = fakeClient({ throws: true })
    expect(await reconcileSession(client, "s1")).toBe("unknown")
  })

  it("returns 'unknown' when the status call times out", async () => {
    const client = fakeClient({ hangMs: 200 })
    // Force a short timeout so the probe is treated as a hung server.
    expect(await reconcileSession(client, "s1", { timeoutMs: 20 })).toBe(
      "unknown",
    )
  })

  it("returns 'unknown' on a non-ok response", async () => {
    const client = fakeClient({ ok: false, data: { s1: { type: "idle" } } })
    expect(await reconcileSession(client, "s1")).toBe("unknown")
  })
})

describe("getSessionStatus", () => {
  it("looks up the status for the given session id in the record", async () => {
    const client = fakeClient({
      data: { a: { type: "idle" }, b: { type: "busy" } },
    })
    expect(await getSessionStatus(client, "b")).toEqual({ type: "busy" })
    expect(await getSessionStatus(client, "a")).toEqual({ type: "idle" })
  })

  it("returns undefined for an unknown session id", async () => {
    const client = fakeClient({ data: { a: { type: "idle" } } })
    expect(await getSessionStatus(client, "zzz")).toBeUndefined()
  })
})

describe("Phase 4 — API layer edge cases", () => {
  describe("assertResponse — non-Error error objects", () => {
    it("extracts message from a plain object with .message", () => {
      expect(() =>
        assertResponse({ error: { message: "custom error" }, response: undefined }, "test op"),
      ).toThrow(/test op.*custom error/)
    })

    it("falls back to JSON for error objects without .message", () => {
      expect(() =>
        assertResponse({ error: { code: 42, detail: "bad" }, response: undefined }, "op"),
      ).toThrow(/op/)
    })

    it("handles non-ok response with status code", () => {
      expect(() =>
        assertResponse({ response: { ok: false, status: 429, statusText: "Too Many Requests" } }, "rate-limited call"),
      ).toThrow(/rate-limited call.*429.*Too Many Requests/)
    })
  })

  describe("reconcileSession — unknown status type", () => {
    it("returns 'unknown' for an unrecognized session status type", async () => {
      const client = fakeClient({ data: { s1: { type: "suspended" } as unknown as SessionStatus } })
      expect(await reconcileSession(client, "s1")).toBe("unknown")
    })
  })

  describe("createClient — cache eviction", () => {
    // Reset the module-level `clientCache` between tests so the eviction
    // path is exercised deterministically. Without this reset, entries from
    // prior tests (or prior runs in the same process) could fill the cache
    // and the test would only verify "the newest URL is cached" — a
    // necessary-but-not-sufficient check of the eviction policy.
    //
    // Source: MEJORAS.md Finding 16.6.B.
    beforeEach(() => __resetClientCacheForTests())

    it("evicts the oldest half when cache exceeds MAX_CACHE_SIZE", () => {
      // Fill the cache past MAX_CACHE_SIZE (10) with unique URLs.
      const clients: OpencodeClient[] = []
      for (let i = 0; i < 12; i++) {
        clients.push(createClient(`http://localhost:${10000 + i}`))
      }
      // After 12 inserts (MAX_CACHE_SIZE=10), the oldest ~6 should have
      // been evicted. Verify both: the newest is still cached, AND the
      // very first URL is gone (a fresh client is built on the next
      // lookup for that URL).
      const newest = createClient(`http://localhost:10011`)
      const originalFirst = createClient(`http://localhost:10000`)
      expect(newest).toBe(clients[11])
      expect(originalFirst).not.toBe(clients[0])
    })

    it("returns the cached client on a HIT even when the cache is full (no eviction on HIT)", () => {
      // Regression guard: a cache HIT must never trigger eviction. Previously
      // eviction ran BEFORE the cache lookup, so asking for an already-cached
      // URL with a full cache would delete the oldest half (and rebuild the
      // requested URL if it was among the old ones). Now eviction only runs on
      // a MISS, so a HIT returns the same instance untouched.
      const first = createClient("http://localhost:30000")
      // Fill the rest up to MAX_CACHE_SIZE so the cache is full.
      for (let i = 1; i < 10; i++) {
        createClient(`http://localhost:${30000 + i}`)
      }
      // The very first URL is the oldest entry. On a full cache, a HIT for it
      // must return the exact same client — not a rebuilt one, and eviction
      // must not have touched it.
      const hit = createClient("http://localhost:30000")
      expect(hit).toBe(first)
    })
  })

  describe("tryGetClient — server.url() + createClient() collapse", () => {
    // tryGetClient is the helper introduced for Finding 16.2.A: it replaces
    // the repeated `const url = server.url(); if (!url) ...; const client =
    // createClient(url)` boilerplate at 10+ call sites in App.tsx.
    it("returns null when the URL getter returns null (server not ready)", () => {
      expect(tryGetClient(() => null)).toBeNull()
    })

    it("returns a client when the URL getter returns a URL", () => {
      // Use a unique URL so we don't share cache state with the eviction test.
      const client = tryGetClient(() => "http://localhost:20001")
      expect(client).not.toBeNull()
    })

    it("returns null when the URL getter returns an empty string", () => {
      // Defensive: an empty string is treated as "not ready" (matches the
      // `if (!url) return` guards that the helper replaces).
      expect(tryGetClient(() => "")).toBeNull()
    })

    it("memoizes the client per URL (cache hit on repeated call)", () => {
      const a = tryGetClient(() => "http://localhost:20002")
      const b = tryGetClient(() => "http://localhost:20002")
      expect(a).toBe(b)
    })

    it("invokes the getter exactly once per call (no re-reads)", () => {
      let calls = 0
      const getter = () => {
        calls++
        return "http://localhost:20003"
      }
      tryGetClient(getter)
      expect(calls).toBe(1)
    })
  })

  describe("toSdkModel — undefined and non-string inputs", () => {
    it("returns undefined for undefined input", () => {
      expect(toSdkModel(undefined)).toBeUndefined()
    })

    it("passes through an already-normalized model object", () => {
      const obj = { providerID: "anthropic", modelID: "claude-sonnet-4" }
      expect(toSdkModel(obj)).toBe(obj)
    })

    it("passes through a non-string truthy value (type-unsafe edge case)", () => {
      // toSdkModel accepts string | PromptModel | undefined. A number leaks
      // through because `typeof model !== "string"` is true for numbers, and
      // the function returns it as-is. This is a known type-safety gap that
      // the TypeScript type system prevents at compile time.
      expect(toSdkModel(42 as unknown as string) as unknown).toBe(42)
    })
  })

  describe("sendPromptAsync — empty but ok response", () => {
    it("returns void when assertResponse passes (no data read)", async () => {
      const client = {
        session: {
          promptAsync: async () => ({
            response: { ok: true, status: 200, statusText: "OK" },
          }),
        },
      } as unknown as OpencodeClient

      // Should not throw — sendPromptAsync only calls assertResponse and returns.
      await expect(
        sendPromptAsync(client, {
          sessionID: "s1",
          parts: [{ type: "text", text: "go" }],
        }),
      ).resolves.toBeUndefined()
    })
  })
})
