import { describe, expect, it } from "bun:test"
import { runOneShotAgent } from "./one-shot-agent"
import type { OpencodeBackend } from "./api"

describe("runOneShotAgent", () => {
  it("returns the agent's reply once the session goes idle with a new message", async () => {
    let msgCalls = 0
    // Backend-shaped stub: createSession returns {id, title}; status/messages
    // return the verdicts directly (no RequestResult wrappers).
    const backend = {
      version: 1,
      url: "http://test",
      createSession: async () => ({ id: "ses_1", title: "" }),
      sendPrompt: async () => {},
      abortSession: async () => true,
      getSessionStatus: async () => ({ type: "idle" as const }),
      fetchMessages: async () => {
        msgCalls++
        // First call seeds the "before" count (empty); later calls carry the
        // assistant reply so hasNewAssistantReply trips.
        return msgCalls === 1
          ? []
          : [{ info: { role: "assistant" }, parts: [{ type: "text", text: "- [ ] one\n- [ ] two" }] }]
      },
      fetchAgents: async () => [],
      fetchConfig: async () => ({}),
      fetchProviderCatalog: async () => [],
      subscribeEvents: async () => {
        throw new Error("unused")
      },
    } as unknown as OpencodeBackend

    const reply = await runOneShotAgent(backend, "split this", { pollMs: 1, timeoutMs: 2000 })
    expect(reply).toBe("- [ ] one\n- [ ] two")
  })

  it("throws when no reply lands before the deadline", async () => {
    const backend = {
      version: 1,
      url: "http://test",
      createSession: async () => ({ id: "ses_1", title: "" }),
      sendPrompt: async () => {},
      abortSession: async () => true,
      getSessionStatus: async () => ({ type: "busy" as const }),
      fetchMessages: async () => [],
      fetchAgents: async () => [],
      fetchConfig: async () => ({}),
      fetchProviderCatalog: async () => [],
      subscribeEvents: async () => {
        throw new Error("unused")
      },
    } as unknown as OpencodeBackend

    await expect(runOneShotAgent(backend, "x", { pollMs: 1, timeoutMs: 30 })).rejects.toThrow(/timed out/)
  })
})
