import { describe, expect, it } from "bun:test"
import { createChaos } from "./chaos"

describe("createChaos", () => {
  it("passes probes through unchanged when disabled", async () => {
    const chaos = createChaos(() => false)
    chaos.killServer()
    chaos.freezeSession()
    // Even with faults set, a disabled controller is a no-op.
    expect(await chaos.ping(async () => true)).toBe(true)
    expect(await chaos.reconcile(async () => "idle")).toBe("idle")
    expect(chaos.takeRateLimit()).toBeNull()
  })

  it("kills and revives the server (ping + reconcile)", async () => {
    const chaos = createChaos(() => true)
    chaos.killServer()
    expect(await chaos.ping(async () => true)).toBe(false)
    expect(await chaos.reconcile(async () => "working")).toBe("unknown")
    chaos.reviveServer()
    expect(await chaos.ping(async () => true)).toBe(true)
    expect(await chaos.reconcile(async () => "idle")).toBe("idle")
  })

  it("freezes a session so reconcile reports working", async () => {
    const chaos = createChaos(() => true)
    chaos.freezeSession()
    expect(await chaos.reconcile(async () => "idle")).toBe("working")
    chaos.unfreezeSession()
    expect(await chaos.reconcile(async () => "idle")).toBe("idle")
  })

  it("queues a one-shot rate-limit fault", () => {
    const chaos = createChaos(() => true)
    expect(chaos.takeRateLimit()).toBeNull()
    chaos.injectRateLimit(30)
    expect(chaos.takeRateLimit()).toEqual({ retryAfterSeconds: 30 })
    // consumed
    expect(chaos.takeRateLimit()).toBeNull()
  })

  it("exposes a snapshot for the UI/log", () => {
    const chaos = createChaos(() => true)
    chaos.killServer()
    const snap = chaos.snapshot()
    expect(snap.enabled).toBe(true)
    expect(snap.serverDead).toBe(true)
    expect(snap.sessionFrozen).toBe(false)
  })
})
