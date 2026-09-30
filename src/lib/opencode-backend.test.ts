import { describe, expect, it } from "bun:test"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import {
  createBackend,
  mapV2EnvelopeToV1,
  normalizeV2Envelope,
  parseV2Agents,
  parseV2Config,
  parseV2ProviderCatalog,
  parseV1ProviderCatalog,
  resolveOpencodeMajor,
  unwrapV2Data,
} from "./opencode-backend"

const hasV2SessionGet = (() => {
  const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" })
  return typeof client.v2?.session?.active === "function" && typeof client.v2.session.get === "function"
})()

type FetchMockImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit | BunFetchRequestInit,
) => Promise<Response>

function makeFetchMock(implementation: FetchMockImplementation): typeof fetch {
  return Object.assign(implementation, { preconnect: globalThis.fetch.preconnect })
}

async function withMockFetch<T>(mockedFetch: typeof fetch, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = mockedFetch
  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

describe("OpenCode backend v2 normalization", () => {
  it("uses the JSON capability probe first and falls back to the legacy JSON config", () => {
    expect(resolveOpencodeMajor({ version: "2.0.19", pid: 42 }, { model: "old/model" })).toBe(2)
    expect(resolveOpencodeMajor({ version: "1.18.33" }, undefined)).toBe(1)
    expect(resolveOpencodeMajor({ name: "NotFoundError" }, { default_agent: "build" })).toBe(1)
    expect(resolveOpencodeMajor({ name: "NotFoundError" }, "<html>SPA</html>")).toBeNull()
    expect(resolveOpencodeMajor({ pid: 42, urls: [] }, undefined)).toBe(2)
  })

  it("unwraps the v2 data wrapper and rejects malformed event envelopes", () => {
    expect(unwrapV2Data({ location: {}, data: [{ id: "build" }] })).toEqual([{ id: "build" }])
    expect(unwrapV2Data(undefined)).toBeUndefined()
    expect(normalizeV2Envelope({ id: "evt-1", type: "session.created", data: { sessionID: "ses-1" } })).toEqual({
      id: "evt-1",
      type: "session.created",
      data: { sessionID: "ses-1" },
    })
    expect(normalizeV2Envelope({ type: "session.created", data: [] })).toBeUndefined()
    expect(normalizeV2Envelope({ type: 12, data: {} })).toBeUndefined()
  })

  it("maps natural completion and assistant output into the exact v1 SSE properties", () => {
    expect(mapV2EnvelopeToV1({
      id: "evt-created",
      type: "session.created",
      data: { sessionID: "ses-1", projectID: "project-1" },
    })).toEqual([{ type: "session.created", properties: { info: { id: "ses-1" } } }])

    expect(mapV2EnvelopeToV1({
      id: "evt-text",
      type: "session.text.ended",
      data: { sessionID: "ses-1", assistantMessageID: "msg-1", ordinal: 0, text: "OK" },
    })).toEqual([
      { type: "message.updated", properties: { info: { id: "msg-1", role: "assistant", sessionID: "ses-1" } } },
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "msg-1:0:text",
            messageID: "msg-1",
            sessionID: "ses-1",
            type: "text",
            text: "OK",
            state: { status: "completed" },
          },
        },
      },
    ])

    expect(mapV2EnvelopeToV1({
      id: "evt-finished",
      type: "session.execution.succeeded",
      data: { sessionID: "ses-1" },
    })).toEqual([{ type: "session.idle", properties: { sessionID: "ses-1" } }])
  })

  it("maps tool starts and session activity to v1 part heartbeats", () => {
    const tool = mapV2EnvelopeToV1({
      id: "evt-tool-start",
      type: "session.tool.input.started",
      data: { sessionID: "ses-1", assistantMessageID: "msg-2", id: "call-1", name: "read" },
    })
    expect(tool).toHaveLength(1)
    expect(tool[0]).toMatchObject({
      type: "message.part.updated",
      properties: {
        part: {
          id: "call-1",
          messageID: "msg-2",
          sessionID: "ses-1",
          type: "tool",
          tool: "read",
          state: { tool: "read", input: {}, status: "running" },
        },
      },
    })

    const heartbeat = mapV2EnvelopeToV1({
      id: "evt-delta",
      type: "session.reasoning.delta",
      data: { sessionID: "ses-1", assistantMessageID: "msg-2", delta: "thinking" },
    })
    expect(heartbeat[0]).toMatchObject({
      type: "message.part.updated",
      properties: { part: { sessionID: "ses-1", type: "step-finish", id: "v2-heartbeat:evt-delta" } },
    })

    expect(mapV2EnvelopeToV1({
      id: "evt-step",
      type: "session.step.ended",
      data: {
        sessionID: "ses-1",
        assistantMessageID: "msg-2",
        tokens: { input: 12, output: 3, cache: { read: 5, write: 1 } },
      },
    })[0]).toMatchObject({
      type: "message.part.updated",
      properties: {
        part: {
          messageID: "msg-2",
          sessionID: "ses-1",
          type: "step-finish",
          state: { status: "completed" },
          tokens: { input: 12, output: 3, cache: { read: 5, write: 1 } },
        },
      },
    })
  })

  it("silently drops unmapped events and adapts v2 execution failures", () => {
    expect(mapV2EnvelopeToV1({ type: "server.connected", data: {} })).toEqual([])
    expect(mapV2EnvelopeToV1({ type: "session.execution.interrupted", data: { sessionID: "ses-1" } })).toEqual([
      { type: "session.idle", properties: { sessionID: "ses-1" } },
    ])
    expect(mapV2EnvelopeToV1({ type: "filesystem.changed", data: { file: "src/file.ts", event: "change" } })).toEqual([
      { type: "file.edited", properties: { file: "src/file.ts" } },
    ])
    expect(mapV2EnvelopeToV1({ type: "session.inbox.enqueued", data: { sessionID: "ses-1", inboxID: "msg-user", item: { type: "user", payload: { text: "run" } } } })).toEqual([
      { type: "message.updated", properties: { info: { id: "msg-user", role: "user", sessionID: "ses-1" } } },
      { type: "message.part.updated", properties: { part: { id: "msg-user", messageID: "msg-user", sessionID: "ses-1", type: "text", text: "run", state: { status: "completed" } } } },
    ])
    expect(mapV2EnvelopeToV1({ type: "session.execution.failed", data: { sessionID: "ses-1", error: { message: "failed" } } })).toEqual([
      { type: "session.error", properties: { sessionID: "ses-1", error: { message: "failed" } } },
    ])
  })

  it("merges ordered config documents with deep object merges and last scalar wins", () => {
    const config = parseV2Config([
      { type: "directory", path: "/tmp/project" },
      { type: "document", path: "global", info: { default_agent: "plan", model: "one/model", agent: { build: { profile: "build", mode: "primary" } } } },
      { type: "document", path: "project", info: { default_agent: "build", agent: { build: { model: "provider/model" } }, mode: { build: { agent: "build" } } } },
    ])
    expect(config).toEqual({
      default_agent: "build",
      model: "one/model",
      agent: { build: { profile: "build", mode: "primary", model: "provider/model" } },
      mode: { build: { agent: "build" } },
    })
    expect(parseV2Config([{ type: "document", info: { permissions: [{ action: "edit", resource: "*", effect: "allow" }] } }])).toEqual({
      permissions: [{ action: "edit", resource: "*", effect: "allow" }],
    })
    expect(parseV2Config("not an entry list")).toEqual({})
  })

  it("joins active v2 providers with model metadata and skips inactive providers", () => {
    const providers = {
      location: { directory: "/tmp/project" },
      data: [
        { id: "anthropic", name: "Anthropic", activation: { env: true } },
        { id: "missing-auth", name: "Missing auth", activation: false },
        { id: "disabled", name: "Disabled", disabled: true },
        { id: "opencode", name: "OpenCode", activation: "enabled" },
      ],
    }
    const models = {
      location: { directory: "/tmp/project" },
      data: [
        { id: "claude-haiku", providerID: "anthropic", name: "Claude Haiku" },
        { id: "hidden", providerID: "missing-auth", name: "Hidden" },
        { id: "disabled-model", providerID: "disabled", name: "Disabled model" },
        { id: "free", providerID: "opencode", name: "Free model" },
        { id: "unlisted", providerID: "unknown", name: "Unlisted" },
      ],
    }
    expect(parseV2ProviderCatalog(providers, models)).toEqual([
      { id: "anthropic/claude-haiku", name: "Claude Haiku", provider: "anthropic" },
      { id: "opencode/free", name: "Free model", provider: "opencode" },
    ])
    expect(parseV2ProviderCatalog({ data: [] }, { data: [{ id: "m", providerID: "p", name: "M" }] })).toEqual([])
  })

  it("maps the v2 location/data agent list using ids as the agent names", () => {
    expect(parseV2Agents({
      location: { directory: "/tmp/project" },
      data: [
        { id: "build", name: "Build", mode: "primary", hidden: false, model: { id: "model-a", providerID: "opencode" }, permissions: [] },
        { id: "explore", name: "Explore", mode: "subagent", hidden: false, permissions: [] },
        { name: "malformed" },
      ],
    })).toEqual([
      { name: "build", mode: "primary", hidden: false, model: { providerID: "opencode", modelID: "model-a" }, permission: [] },
      { name: "explore", mode: "subagent", hidden: false, permission: [] },
    ])
  })

  it("flattens the v1 provider list: only connected providers, map-shaped models", () => {
    // Ported from fetch-models.test.ts when the flattening moved into the
    // backend (the fetch-models wrapper now delegates to fetchProviderCatalog).
    expect(parseV1ProviderCatalog({
      all: [
        {
          id: "anthropic",
          models: {
            "claude-haiku-4-5": { name: "Claude Haiku 4.5" },
            "claude-opus-4-8": { name: "Claude Opus 4.8" },
          },
        },
        { id: "openai", models: { "gpt-5.2": { name: "GPT-5.2" } } },
        // Excluded: not connected (no valid credentials — would 401 on prompt).
        { id: "google", models: { "gemini-2.5-pro": { name: "Gemini" } } },
        // No models field → nothing to add.
        { id: "broken", models: undefined },
      ],
      connected: ["anthropic", "openai", "broken"],
    })).toEqual([
      { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
      { id: "anthropic/claude-opus-4-8", name: "Claude Opus 4.8", provider: "anthropic" },
      { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "openai" },
    ])
  })

  it("flattens the v1 provider list: array-shaped models, key-as-name fallback, malformed payload", () => {
    // Ported from fetch-models.test.ts (W1-11 + the fail-safe shape cases).
    expect(parseV1ProviderCatalog({
      all: [
        {
          id: "custom",
          models: [
            { id: "model-alpha", name: "Model Alpha" },
            { id: "model-beta" },
            "model-gamma",
            null,
          ],
        },
        { id: "zai", models: { "glm-5.2": {} } },
      ],
      connected: ["custom", "zai"],
    })).toEqual([
      { id: "custom/model-alpha", name: "Model Alpha", provider: "custom" },
      { id: "custom/model-beta", name: "model-beta", provider: "custom" },
      { id: "custom/model-gamma", name: "model-gamma", provider: "custom" },
      { id: "zai/glm-5.2", name: "glm-5.2", provider: "zai" },
    ])
    // No connected providers → nothing pickable.
    expect(parseV1ProviderCatalog({ all: [{ id: "anthropic", models: { m: {} } }], connected: [] })).toEqual([])
    // Malformed payloads (non-record / missing fields) degrade to [].
    expect(parseV1ProviderCatalog(undefined)).toEqual([])
    expect(parseV1ProviderCatalog("not json")).toEqual([])
    expect(parseV1ProviderCatalog({ all: "nope", connected: null })).toEqual([])
  })

  it("rejects unauthorized event handshakes for v1 and v2 and cancels each probe body", async () => {
    for (const version of [1, 2] as const) {
      let requestedUrl: URL | undefined
      let authorization: string | null = null
      let bodyCancelled = false
      const mockedFetch = makeFetchMock(async (input, init) => {
        requestedUrl = new URL(String(input))
        authorization = new Headers(init?.headers).get("Authorization")
        const body = new ReadableStream<Uint8Array>({
          cancel() {
            bodyCancelled = true
          },
        })
        return new Response(body, { status: 401, statusText: "Unauthorized" })
      })

      await withMockFetch(mockedFetch, async () => {
        const backend = createBackend({
          url: "http://127.0.0.1:4096",
          version,
          authorization: "Basic test-password",
        })
        await expect(backend.subscribeEvents({
          directory: "/tmp/project with spaces",
          signal: new AbortController().signal,
          timeoutMs: 100,
        })).rejects.toThrow(/401 Unauthorized/)
      })

      expect(requestedUrl?.pathname).toBe(version === 1 ? "/event" : "/api/event")
      expect(requestedUrl?.searchParams.get("directory")).toBe(
        version === 1 ? "/tmp/project with spaces" : null,
      )
      expect(authorization as string | null).toBe("Basic test-password")
      expect(bodyCancelled).toBe(true)
    }
  })

  it("uses subscribe timeoutMs for the handshake and aborts its probe fetch", async () => {
    let probeSignal: AbortSignal | undefined
    const mockedFetch = makeFetchMock(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      probeSignal = init?.signal ?? undefined
      probeSignal?.addEventListener("abort", () => reject(probeSignal?.reason), { once: true })
    }))

    await withMockFetch(mockedFetch, async () => {
      const backend = createBackend({ url: "http://127.0.0.1:4096", version: 1 })
      await expect(backend.subscribeEvents({
        signal: new AbortController().signal,
        timeoutMs: 10,
      })).rejects.toThrow(/timed out after 10ms/)
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(probeSignal?.aborted).toBe(true)
  })

  it("threads caller cancellation into lazy version detection and skips the fallback probe", async () => {
    let requests = 0
    let probeSignal: AbortSignal | undefined
    const mockedFetch = makeFetchMock(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      requests++
      probeSignal = init?.signal ?? undefined
      probeSignal?.addEventListener("abort", () => reject(probeSignal?.reason), { once: true })
    }))

    await withMockFetch(mockedFetch, async () => {
      const backend = createBackend({ url: "http://127.0.0.1:4096", version: null })
      const controller = new AbortController()
      const pending = backend.fetchAgents({ timeoutMs: 1_000, signal: controller.signal })
      controller.abort(new Error("caller cancelled"))
      await expect(pending).rejects.toThrow("caller cancelled")
    })

    expect(probeSignal?.aborted).toBe(true)
    expect(requests).toBe(1)
  })

  it.skipIf(!hasV2SessionGet)("returns missing for a v2 session absent from active and the session lookup", async () => {
    const requests: string[] = []
    const mockedFetch = makeFetchMock(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      const path = new URL(url).pathname
      requests.push(path)
      if (path === "/api/session/active") {
        return new Response(JSON.stringify({ data: { "ses-busy": { status: "running" } } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (path === "/api/session/ses-missing") {
        return new Response(JSON.stringify({ errors: [{ message: "Session not found" }] }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
      return new Response("unexpected route", { status: 500 })
    })

    await withMockFetch(mockedFetch, async () => {
      const backend = createBackend({ url: "http://127.0.0.1:4096", version: 2 })
      const busy = await backend.getSessionStatus("ses-busy", { timeoutMs: 100 })
      expect(busy).toEqual({ type: "busy" })
      const missing = await backend.getSessionStatus("ses-missing", { timeoutMs: 100 })
      expect(missing).toBeUndefined()
    })

    expect(requests).toEqual([
      "/api/session/active",
      "/api/session/active",
      "/api/session/ses-missing",
    ])
  })
})
