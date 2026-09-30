import { describe, expect, it } from "bun:test"
import { fetchModelCatalog } from "./fetch-models"
import type { ModelCatalogEntry } from "./fetch-models"
import type { OpencodeBackend } from "./api"

/**
 * Build a mock backend whose `fetchProviderCatalog` returns the given entries
 * (or throws). The flattening of each dialect's provider response lives in
 * the backend (parseV1ProviderCatalog / parseV2ProviderCatalog, pinned by
 * opencode-backend.test.ts); these tests pin the wrapper's fail-safe
 * contract: never crash startup, always return `[]` on failure.
 */
function mockBackend(
  entries: ModelCatalogEntry[] = [],
): OpencodeBackend {
  return {
    version: 1,
    url: "http://test",
    createSession: async () => {
      throw new Error("unused")
    },
    sendPrompt: async () => {},
    abortSession: async () => false,
    getSessionStatus: async () => undefined,
    fetchMessages: async () => [],
    fetchAgents: async () => [],
    fetchConfig: async () => ({}),
    fetchProviderCatalog: async () => entries,
    subscribeEvents: async () => {
      throw new Error("unused")
    },
  } as unknown as OpencodeBackend
}

describe("fetchModelCatalog", () => {
  it("returns the backend's catalog entries", async () => {
    const entries: ModelCatalogEntry[] = [
      { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
      { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "openai" },
    ]
    expect(await fetchModelCatalog(mockBackend(entries))).toEqual(entries)
  })

  it("returns [] when the backend catalog is empty", async () => {
    expect(await fetchModelCatalog(mockBackend([]))).toEqual([])
  })

  it("returns [] when fetchProviderCatalog throws (never crashes startup)", async () => {
    const backend = {
      ...mockBackend([]),
      fetchProviderCatalog: async () => {
        throw new Error("network down")
      },
    } as unknown as OpencodeBackend
    expect(await fetchModelCatalog(backend)).toEqual([])
  })
})
