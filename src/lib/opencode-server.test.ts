/**
 * Autonomous permission guarantee for the embedded OpenCode server.
 *
 * OCLoop is an unattended loop: no one is watching to answer an interactive
 * confirmation, so any tool call OpenCode would "ask" about hangs the
 * iteration. These tests pin two invariants:
 *
 * 1. `buildPermissionConfig` — the single source of truth. By default (no arg)
 *    every blocking tool is `"allow"` (fully autonomous — used by
 *    `--create-plan`). With a per-tool map, a `false` drops that tool back to
 *    OpenCode's interactive default (field omitted); `true`/absent stays allow.
 * 2. `startOpencodeServer` always carries the policy into the SDK config,
 *    regardless of what the caller passes.
 *
 * The merge happens before the win32/non-win32 branch in `startOpencodeServer`,
 * and both branches forward `merged.config` the same way. Testing the non-win32
 * path (what runs on this host) covers the invariant; the Windows bootstrap
 * reuses the same `merged.config`.
 */

import { describe, expect, it, mock } from "bun:test"
import { PERMISSION_TOOLS } from "./config"
import {
  buildPermissionConfig,
  startOpencodeServer,
} from "./opencode-server"

/** The five blocking tools — read-only tools never ask, so this is the full set. */
const BLOCKING_TOOLS = [...PERMISSION_TOOLS]

describe("opencode-server — buildPermissionConfig", () => {
  // `buildPermissionConfig()` with no args is the fully-autonomous policy used
  // by --create-plan (all five blocking tools allowed). Covers what the former
  // AUTONOMOUS_PERMISSION_CONFIG constant exposed — the constant was removed
  // (dead in production) and the coverage now goes through the canonical builder.
  it("allows all five tools when called with no args (autonomous default)", () => {
    const permission = buildPermissionConfig()
    for (const tool of BLOCKING_TOOLS) {
      expect(permission[tool]).toBe("allow")
    }
  })

  it("allows a tool when its flag is true", () => {
    const permission = buildPermissionConfig({ bash: true })
    expect(permission.bash).toBe("allow")
  })

  it("OMITS a tool whose flag is false (falls back to OpenCode's ask default)", () => {
    const permission = buildPermissionConfig({ bash: false })
    // false → not present → OpenCode applies its own (interactive) policy.
    expect(permission.bash).toBeUndefined()
    // The other tools are still autonomous.
    expect(permission.edit).toBe("allow")
    expect(permission.webfetch).toBe("allow")
    expect(permission.doom_loop).toBe("allow")
    expect(permission.external_directory).toBe("allow")
  })

  it("treats an absent tool as allow (only an explicit false opts out)", () => {
    const permission = buildPermissionConfig({ bash: false })
    expect(permission.webfetch).toBe("allow")
  })

  it("lets the user opt out of every tool at once", () => {
    const allOff = Object.fromEntries(BLOCKING_TOOLS.map((t) => [t, false]))
    const permission = buildPermissionConfig(allOff)
    for (const tool of BLOCKING_TOOLS) {
      expect(permission[tool]).toBeUndefined()
    }
  })
})

describe("opencode-server — startOpencodeServer carries permissions into config", () => {
  // Capture the opts the SDK launcher receives.
  let lastServerOpts: Record<string, unknown> = {}
  mock.module("@opencode-ai/sdk/server", () => ({
    createOpencodeServer: async (opts: Record<string, unknown>) => {
      lastServerOpts = opts
      return { url: "http://127.0.0.1:4096", close: () => {} }
    },
  }))

  it("defaults to fully-autonomous when no permissions given (compat for --create-plan)", async () => {
    await startOpencodeServer({ port: 4096 })
    const config = lastServerOpts.config as { permission: Record<string, string> }
    for (const tool of BLOCKING_TOOLS) {
      expect(config.permission[tool]).toBe("allow")
    }
  })

  it("honors a per-tool opt-out passed via options.permissions", async () => {
    await startOpencodeServer({ port: 4096, permissions: { bash: false } })
    const config = lastServerOpts.config as { permission: Record<string, string> }
    expect(config.permission.bash).toBeUndefined()
    expect(config.permission.edit).toBe("allow")
  })

  it("merges permissions on top of a caller-supplied config (other keys kept)", async () => {
    await startOpencodeServer({
      port: 4096,
      config: { model: "anthropic/claude-3.5-sonnet" },
    })
    const config = lastServerOpts.config as {
      model: string
      permission: Record<string, string>
    }
    // Caller's non-permission key survives.
    expect(config.model).toBe("anthropic/claude-3.5-sonnet")
    for (const tool of BLOCKING_TOOLS) {
      expect(config.permission[tool]).toBe("allow")
    }
  })

  it("forwards hostname/port/timeout through unchanged", async () => {
    await startOpencodeServer({ hostname: "0.0.0.0", port: 1234, timeout: 7000 })
    expect(lastServerOpts.hostname).toBe("0.0.0.0")
    expect(lastServerOpts.port).toBe(1234)
    expect(lastServerOpts.timeout).toBe(7000)
  })
})
