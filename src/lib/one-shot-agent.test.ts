import { describe, expect, it } from "bun:test"
import { runOneShotAgent } from "./one-shot-agent"
import type { OpencodeClient } from "./api"

const OK = { ok: true, status: 200, statusText: "OK" }

describe("runOneShotAgent", () => {
  it("returns the agent's reply once the session goes idle with a new message", async () => {
    let msgCalls = 0
    const client = {
      session: {
        create: async () => ({ data: { id: "ses_1" }, response: OK }),
        promptAsync: async () => ({ response: OK }),
        status: async () => ({ data: { ses_1: { type: "idle" } }, response: OK }),
        messages: async () => {
          msgCalls++
          // First call seeds the "before" count (empty); later calls carry the
          // assistant reply so hasNewAssistantReply trips.
          const data =
            msgCalls === 1
              ? []
              : [{ info: { role: "assistant" }, parts: [{ type: "text", text: "- [ ] one\n- [ ] two" }] }]
          return { data, response: OK }
        },
        abort: async () => ({ data: true, response: OK }),
      },
    } as unknown as OpencodeClient

    const reply = await runOneShotAgent(client, "split this", { pollMs: 1, timeoutMs: 2000 })
    expect(reply).toBe("- [ ] one\n- [ ] two")
  })

  it("throws when no reply lands before the deadline", async () => {
    const client = {
      session: {
        create: async () => ({ data: { id: "ses_1" }, response: OK }),
        promptAsync: async () => ({ response: OK }),
        status: async () => ({ data: { ses_1: { type: "busy" } }, response: OK }),
        messages: async () => ({ data: [], response: OK }),
        abort: async () => ({ data: true, response: OK }),
      },
    } as unknown as OpencodeClient

    await expect(runOneShotAgent(client, "x", { pollMs: 1, timeoutMs: 30 })).rejects.toThrow(/timed out/)
  })
})
