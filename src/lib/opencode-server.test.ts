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
 * The Windows bootstrap also owns process cleanup because shell shims
 * (`.cmd`/`.bat`/`.ps1`) are launched through a shell. Tests below pin timeout
 * cleanup and process-tree cleanup for those shims.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { mockCommandExists } from "./command-exists-mock"
import { EventEmitter } from "node:events"
import { PERMISSION_TOOLS } from "./config"

type FakeChildProcess = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: ReturnType<typeof mock>
}

type SpawnCall = {
  command: string
  args: string[]
  opts: unknown
  proc: FakeChildProcess
}

/** The five blocking tools — read-only tools never ask, so this is the full set. */
const BLOCKING_TOOLS = [...PERMISSION_TOOLS]

let lastServerOpts: Record<string, unknown> = {}
let resolveCommandPathImpl: (cmd: string) => Promise<string | null> = async () =>
  null
let nextProc: FakeChildProcess | null = null
const spawnCalls: SpawnCall[] = []

function createFakeProcess(pid: number): FakeChildProcess {
  const proc = new EventEmitter() as FakeChildProcess
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.pid = pid
  proc.kill = mock(() => true)
  return proc
}

const spawnImpl = mock((command: string, args: string[], opts: unknown) => {
  const proc = nextProc ?? createFakeProcess(1234)
  nextProc = null
  spawnCalls.push({ command, args, opts, proc })
  return proc
})

mock.module("@opencode-ai/sdk/server", () => ({
  createOpencodeServer: async (opts: Record<string, unknown>) => {
    lastServerOpts = opts
    return { url: "http://127.0.0.1:4096", close: () => {} }
  },
}))

mockCommandExists({
  resolveCommandPath: (cmd: string) => resolveCommandPathImpl(cmd),
})

mock.module("node:child_process", () => ({
  spawn: spawnImpl,
}))

const {
  buildPermissionConfig,
  startOpencodeServer,
} = await import("./opencode-server")

beforeEach(() => {
  lastServerOpts = {}
  resolveCommandPathImpl = async () => null
  nextProc = null
  spawnCalls.length = 0
  spawnImpl.mockClear()
})

afterEach(() => {
  resolveCommandPathImpl = async () => null
})

async function withPlatform<T>(
  platform: NodeJS.Platform,
  fn: () => Promise<T>,
): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform")
  Object.defineProperty(process, "platform", { value: platform })
  try {
    return await fn()
  } finally {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor)
    }
  }
}

async function waitForSpawnCalls(count: number): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (spawnCalls.length >= count) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Expected ${count} spawn call(s), got ${spawnCalls.length}`)
}

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

describe("opencode-server — Windows process cleanup", () => {
  it("kills the spawned process when Windows startup times out", async () => {
    const proc = createFakeProcess(4321)
    nextProc = proc
    resolveCommandPathImpl = async () => String.raw`C:\Program Files\opencode\opencode.exe`

    await withPlatform("win32", async () => {
      await expect(startOpencodeServer({ timeout: 1 })).rejects.toThrow(
        "Timeout waiting for server to start",
      )
    })

    expect(proc.kill).toHaveBeenCalled()
  })

  it("closes Windows shell shims by killing the process tree", async () => {
    const proc = createFakeProcess(5555)
    nextProc = proc
    resolveCommandPathImpl = async () =>
      String.raw`C:\Users\dev\AppData\Roaming\npm\opencode.cmd`

    await withPlatform("win32", async () => {
      const serverPromise = startOpencodeServer({ timeout: 1000 })
      await waitForSpawnCalls(1)
      proc.stdout.emit(
        "data",
        Buffer.from("opencode server listening on http://127.0.0.1:4096\n"),
      )

      const server = await serverPromise
      server.close()
    })

    expect(spawnCalls[0].command).toBe(
      String.raw`"C:\Users\dev\AppData\Roaming\npm\opencode.cmd"`,
    )
    expect((spawnCalls[0].opts as { shell?: boolean }).shell).toBe(true)
    expect(spawnCalls[1].command).toBe("taskkill")
    expect(spawnCalls[1].args).toEqual(["/pid", "5555", "/t", "/f"])
    expect(proc.kill).not.toHaveBeenCalled()
  })
})
