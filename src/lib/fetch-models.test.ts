import { describe, expect, it } from "bun:test"
import { fetchModelCatalog } from "./fetch-models"
import type { OpencodeClient } from "./api"

const OK = { ok: true, status: 200, statusText: "OK" }

/**
 * Build a mock client whose `provider.list` returns the given providers and
 * connected set. Mirrors the mock pattern of one-shot-agent.test.ts.
 */
function mockClient(
  providers: Array<{ id: string; models: Record<string, { name?: string }> }>,
  connected: string[],
): OpencodeClient {
  return {
    provider: {
      list: async () => ({ data: { all: providers, connected, default: {} }, response: OK }),
    },
  } as unknown as OpencodeClient
}

describe("fetchModelCatalog", () => {
  it("flattens connected providers and their models into entries", async () => {
    const client = mockClient(
      [
        {
          id: "anthropic",
          models: {
            "claude-haiku-4-5": { name: "Claude Haiku 4.5" },
            "claude-opus-4-8": { name: "Claude Opus 4.8" },
          },
        },
        {
          id: "openai",
          models: {
            "gpt-5.2": { name: "GPT-5.2" },
          },
        },
      ],
      ["anthropic", "openai"],
    )
    const catalog = await fetchModelCatalog(client)
    expect(catalog).toEqual([
      { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
      { id: "anthropic/claude-opus-4-8", name: "Claude Opus 4.8", provider: "anthropic" },
      { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "openai" },
    ])
  })

  it("excludes providers that are NOT connected (no valid credentials)", async () => {
    const client = mockClient(
      [
        { id: "anthropic", models: { "claude-haiku-4-5": { name: "Haiku" } } },
        { id: "google", models: { "gemini-2.5-pro": { name: "Gemini" } } },
      ],
      ["anthropic"], // google not connected
    )
    const catalog = await fetchModelCatalog(client)
    expect(catalog).toEqual([
      { id: "anthropic/claude-haiku-4-5", name: "Haiku", provider: "anthropic" },
    ])
  })

  it("falls back to the model key as the name when the model has no name field", async () => {
    const client = mockClient(
      [{ id: "zai", models: { "glm-5.2": {} } }],
      ["zai"],
    )
    const catalog = await fetchModelCatalog(client)
    expect(catalog).toEqual([{ id: "zai/glm-5.2", name: "glm-5.2", provider: "zai" }])
  })

  it("returns [] when no providers are connected", async () => {
    const client = mockClient(
      [{ id: "anthropic", models: { "claude-haiku-4-5": { name: "Haiku" } } }],
      [],
    )
    expect(await fetchModelCatalog(client)).toEqual([])
  })

  it("returns [] on a malformed response (no data)", async () => {
    const client = {
      provider: { list: async () => ({ response: OK }) },
    } as unknown as OpencodeClient
    expect(await fetchModelCatalog(client)).toEqual([])
  })

  it("returns [] when provider.list throws (never crashes startup)", async () => {
    const client = {
      provider: { list: async () => { throw new Error("network down") } },
    } as unknown as OpencodeClient
    expect(await fetchModelCatalog(client)).toEqual([])
  })

  it("returns [] when the HTTP response is not ok", async () => {
    const client = {
      provider: {
        list: async () => ({ response: { ok: false, status: 500, statusText: "Server Error" } }),
      },
    } as unknown as OpencodeClient
    expect(await fetchModelCatalog(client)).toEqual([])
  })

  it("tolerates a provider with no models field", async () => {
    const client = mockClient(
      [
        { id: "anthropic", models: { "claude-haiku-4-5": { name: "Haiku" } } },
        // @ts-expect-error — simulating a malformed provider entry
        { id: "broken" },
      ],
      ["anthropic", "broken"],
    )
    const catalog = await fetchModelCatalog(client)
    expect(catalog).toEqual([
      { id: "anthropic/claude-haiku-4-5", name: "Haiku", provider: "anthropic" },
    ])
  })
})
