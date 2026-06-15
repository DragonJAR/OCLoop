import { describe, expect, it } from "bun:test"
import { reconcileSession, getSessionStatus, type OpencodeClient } from "./api"
import type { SessionStatus } from "@opencode-ai/sdk/v2"

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
