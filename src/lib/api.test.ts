import { describe, expect, it } from "bun:test"
import { reconcileSession, getSessionStatus, assertResponse, sendPromptAsync, toSdkModel, type OpencodeClient } from "./api"
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
