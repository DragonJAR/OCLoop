import { describe, expect, it, beforeEach } from "bun:test"
import {
  reconcileSession,
  getSessionStatus,
  assertResponse,
  sendPromptAsync,
  toSdkModel,
  createClient,
  tryGetClient,
  __resetClientCacheForTests,
  type OpencodeBackend,
  type LaunchInfo,
} from "./api"

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

  it("handles null and undefined result safely", () => {
    expect(() => assertResponse(null, "op")).toThrow(/op.*no response/)
    expect(() => assertResponse(undefined, "op")).toThrow(/op.*no response/)
  })

  it("surfaces server error body detail when response is non-ok and error is present", () => {
    expect(() =>
      assertResponse(
        {
          error: { message: "Provider anthropic not connected" },
          response: { ok: false, status: 400, statusText: "Bad Request" },
        },
        "create session",
      ),
    ).toThrow(/create session.*400 Bad Request - Provider anthropic not connected/)
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

  it("passes the prompt params through to the backend verbatim", async () => {
    let seen: unknown
    const backend = {
      sendPrompt: async (params: unknown) => {
        seen = params
      },
    } as unknown as OpencodeBackend

    await sendPromptAsync(backend, {
      sessionID: "s1",
      parts: [{ type: "text", text: "hello" }],
      model: "anthropic/claude-sonnet-4",
    })

    // The facade forwards the params untouched; the model string is
    // normalized to the SDK object INSIDE the backend's dialect paths
    // (toSdkModel itself is fully unit-tested above).
    expect(seen).toMatchObject({
      sessionID: "s1",
      parts: [{ type: "text", text: "hello" }],
      model: "anthropic/claude-sonnet-4",
    })
  })
})

/** The status verdicts reconcileSession maps over, in the backend's shape. */
type StatusVerdict = { type: "idle" | "busy" | "retry" }

/**
 * Build a minimal fake backend whose `getSessionStatus` behaves as chosen
 * (returns a verdict / undefined, throws, or outlives its timeout budget) so
 * we can drive reconcileSession deterministically.
 */
function fakeBackend(opts: {
  status?: StatusVerdict | undefined
  throws?: boolean
  hangMs?: number
}): OpencodeBackend {
  return {
    version: 1,
    url: "http://test",
    createSession: async () => {
      throw new Error("unused")
    },
    sendPrompt: async () => {},
    abortSession: async () => false,
    getSessionStatus: async (_id: string, callOpts?: { timeoutMs?: number }) => {
      if (opts.throws) throw new Error("connection refused")
      if (opts.hangMs) {
        // Model a probe slower than its budget: it "resolves" only after the
        // hang, so a per-call timeout shorter than the hang rejects exactly
        // like the real backend's withTimeout wrapper would.
        const budget = callOpts?.timeoutMs
        await new Promise((r) => setTimeout(r, opts.hangMs))
        if (budget !== undefined && budget < opts.hangMs) {
          throw new Error(`Timed out after ${budget}ms`)
        }
      }
      return opts.status
    },
    fetchMessages: async () => [],
    fetchAgents: async () => [],
    fetchConfig: async () => ({}),
    fetchProviderCatalog: async () => [],
    subscribeEvents: async () => {
      throw new Error("unused")
    },
  } as unknown as OpencodeBackend
}

describe("reconcileSession", () => {
  it("returns 'working' when the session is busy", async () => {
    const backend = fakeBackend({ status: { type: "busy" } })
    expect(await reconcileSession(backend, "s1")).toBe("working")
  })

  it("returns 'working' when the server is retrying (rate limit)", async () => {
    const backend = fakeBackend({ status: { type: "retry" } })
    expect(await reconcileSession(backend, "s1")).toBe("working")
  })

  it("returns 'idle' when the session is idle", async () => {
    const backend = fakeBackend({ status: { type: "idle" } })
    expect(await reconcileSession(backend, "s1")).toBe("idle")
  })

  it("returns 'missing' when the server no longer knows the session", async () => {
    const backend = fakeBackend({ status: undefined })
    expect(await reconcileSession(backend, "s1")).toBe("missing")
  })

  it("returns 'unknown' when the status call throws", async () => {
    const backend = fakeBackend({ throws: true })
    expect(await reconcileSession(backend, "s1")).toBe("unknown")
  })

  it("returns 'unknown' when the status call times out", async () => {
    const backend = fakeBackend({ hangMs: 200 })
    // Force a short timeout so the probe is treated as a hung server.
    expect(await reconcileSession(backend, "s1", { timeoutMs: 20 })).toBe(
      "unknown",
    )
  })
})

describe("getSessionStatus", () => {
  it("returns the backend's verdict for the given session id", async () => {
    const backend = fakeBackend({ status: { type: "busy" } })
    expect(await getSessionStatus(backend, "b")).toEqual({ type: "busy" })
  })

  it("returns undefined for an unknown session id", async () => {
    const backend = fakeBackend({ status: undefined })
    expect(await getSessionStatus(backend, "zzz")).toBeUndefined()
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
      // The backend's contract narrows to idle/busy/retry; an unrecognized
      // verdict still degrades to "unknown" rather than guessing.
      const backend = fakeBackend({ status: { type: "suspended" } as unknown as StatusVerdict })
      expect(await reconcileSession(backend, "s1")).toBe("unknown")
    })
  })

  describe("createClient — cache eviction", () => {
    // Reset the module-level `backendCache` between tests so the eviction
    // path is exercised deterministically. Without this reset, entries from
    // prior tests (or prior runs in the same process) could fill the cache
    // and the test would only verify "the newest URL is cached" — a
    // necessary-but-not-sufficient check of the eviction policy.
    //
    // Source: MEJORAS.md Finding 16.6.B.
    beforeEach(() => __resetClientCacheForTests())

    it("evicts the oldest half when cache exceeds MAX_CACHE_SIZE", () => {
      // Fill the cache past MAX_CACHE_SIZE (10) with unique URLs.
      const clients: OpencodeBackend[] = []
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

  describe("tryGetClient — launchInfo() + createClient() collapse", () => {
    // tryGetClient replaces the repeated
    // `const url = server.url(); if (!url) ...; const client = createClient(url)`
    // boilerplate at 10+ call sites in App.tsx with a single LaunchInfo getter.
    it("returns null when the launch info getter has no URL (server not ready)", () => {
      expect(tryGetClient(() => ({ url: null }))).toBeNull()
    })

    it("returns a backend when the launch info getter has a URL", () => {
      // Use a unique URL so we don't share cache state with the eviction test.
      const client = tryGetClient(() => ({ url: "http://localhost:20001", version: 1 }))
      expect(client).not.toBeNull()
    })

    it("returns null when the launch info getter has an empty URL", () => {
      // Defensive: an empty URL is treated as "not ready" (matches the
      // `if (!url) return` guards that the helper replaces).
      expect(tryGetClient(() => ({ url: "" }))).toBeNull()
    })

    it("memoizes the backend per launch identity (cache hit on repeated call)", () => {
      const info = (): LaunchInfo => ({ url: "http://localhost:20002", version: 1 })
      const a = tryGetClient(info)
      const b = tryGetClient(info)
      expect(a).toBe(b)
    })

    it("rebuilds the backend when the launch's authorization changes (v2 restart password)", () => {
      // A v2 restart issues a fresh random password; the auth participates in
      // the cache key so the new launch never reuses the stale 401-ing backend.
      const a = tryGetClient(() => ({ url: "http://localhost:20004", version: 2, authorization: "Basic one" }))
      const b = tryGetClient(() => ({ url: "http://localhost:20004", version: 2, authorization: "Basic two" }))
      expect(a).not.toBe(b)
    })

    it("invokes the getter exactly once per call (no re-reads)", () => {
      let calls = 0
      const getter = (): LaunchInfo => {
        calls++
        return { url: "http://localhost:20003" }
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
    it("resolves without reading data (the backend owns response validation)", async () => {
      const backend = {
        sendPrompt: async () => {},
      } as unknown as OpencodeBackend

      // Should not throw — the facade only forwards; validation lives in the
      // backend.
      await expect(
        sendPromptAsync(backend, {
          sessionID: "s1",
          parts: [{ type: "text", text: "go" }],
        }),
      ).resolves.toBeUndefined()
    })
  })
})
