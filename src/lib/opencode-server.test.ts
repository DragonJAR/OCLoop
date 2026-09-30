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
import { mockOpencodeServer } from "./opencode-server-mock"
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

let resolveSpawnableImpl: (cmd: string) => Promise<string | null> = async () =>
  null
let versionOutput = "opencode v1.18.33\n"
let versionExitCode = 0
let autoServeOutput: string | null = "opencode server listening on http://127.0.0.1:4096\n"
let autoServeExitCode: number | null = null
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
  const proc = args[0] === "serve" && nextProc ? nextProc : createFakeProcess(1234)
  if (args[0] === "serve") nextProc = null
  spawnCalls.push({ command, args, opts, proc })
  if (args[0] === "--version") {
    queueMicrotask(() => {
      proc.stdout.emit("data", Buffer.from(versionOutput))
      proc.emit("close", versionExitCode)
    })
  } else if (args[0] === "serve" && autoServeOutput !== null) {
    const output = autoServeOutput
    const exitCode = autoServeExitCode
    queueMicrotask(() => {
      proc.stdout.emit("data", Buffer.from(output))
      if (exitCode !== null) proc.emit("exit", exitCode)
    })
  }
  return proc
})

mockCommandExists({
  resolveSpawnable: (cmd: string) => resolveSpawnableImpl(cmd),
})

mock.module("node:child_process", () => ({
  spawn: spawnImpl,
}))

// Restore the real launcher for THIS file's SUT import: a hooks-level test
// (useServer.test.ts) runs earlier in this process and overrides
// `startOpencodeServer` via the partial mock. Same restore pattern
// `command-exists.test.ts` uses with `mockCommandExists({})`.
mockOpencodeServer({})

const {
  buildPermissionConfig,
  startOpencodeServer,
} = await import("./opencode-server")

beforeEach(() => {
  resolveSpawnableImpl = async () => null
  versionOutput = "opencode v1.18.33\n"
  versionExitCode = 0
  autoServeOutput = "opencode server listening on http://127.0.0.1:4096\n"
  autoServeExitCode = null
  nextProc = null
  spawnCalls.length = 0
  spawnImpl.mockClear()
})

afterEach(() => {
  resolveSpawnableImpl = async () => null
})

function serverSpawnCall(): SpawnCall {
  const call = spawnCalls.find(({ args, command }) => command !== "taskkill" && args[0] === "serve")
  if (!call) throw new Error("Expected opencode server process to be spawned")
  return call
}

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
    if (spawnCalls.filter(({ args }) => args[0] === "serve").length >= count) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Expected ${count} spawn call(s), got ${spawnCalls.length}`)
}

async function failureFrom(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }
  throw new Error("Expected startup to fail")
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
    const env = (serverSpawnCall().opts as { env: NodeJS.ProcessEnv }).env
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}") as {
      permission: Record<string, string>
    }
    for (const tool of BLOCKING_TOOLS) {
      expect(config.permission[tool]).toBe("allow")
    }
  })

  it("honors a per-tool opt-out passed via options.permissions", async () => {
    await startOpencodeServer({ port: 4096, permissions: { bash: false } })
    const env = (serverSpawnCall().opts as { env: NodeJS.ProcessEnv }).env
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}") as {
      permission: Record<string, string>
    }
    expect(config.permission.bash).toBeUndefined()
    expect(config.permission.edit).toBe("allow")
  })

  it("merges permissions on top of a caller-supplied config (other keys kept)", async () => {
    await startOpencodeServer({
      port: 4096,
      config: { model: "anthropic/claude-3.5-sonnet" },
    })
    const env = (serverSpawnCall().opts as { env: NodeJS.ProcessEnv }).env
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? "{}") as {
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
    await startOpencodeServer({
      hostname: "0.0.0.0",
      port: 1234,
      timeout: 7000,
      config: { logLevel: "DEBUG" },
    })
    const call = serverSpawnCall()
    expect(call.command).toBe("opencode")
    expect(call.args).toEqual([
      "serve",
      "--hostname=0.0.0.0",
      "--port=1234",
      "--log-level=DEBUG",
    ])
  })

  it("accepts the v2 ready marker and returns v2 version plus Basic auth", async () => {
    versionOutput = "opencode v2.0.18\n"
    autoServeOutput = "server listening on http://127.0.0.1:4096\nserver password hidden\n"

    const server = await startOpencodeServer({ port: 4096 })
    const env = (serverSpawnCall().opts as { env: NodeJS.ProcessEnv }).env

    expect(server.url).toBe("http://127.0.0.1:4096")
    expect(server.version).toBe(2)
    expect(server.authorization).toMatch(/^Basic /)
    expect(env.OPENCODE_SERVER_PASSWORD).toBeTruthy()
    expect(Buffer.from(server.authorization!.slice("Basic ".length), "base64").toString()).toBe(
      `opencode:${env.OPENCODE_SERVER_PASSWORD}`,
    )
  })

  it("accepts the v1 ready marker and omits auth and password env for v1", async () => {
    versionOutput = "opencode 1.18.33\n"
    autoServeOutput = "opencode server listening on http://127.0.0.1:4096\n"

    const server = await startOpencodeServer({ port: 4096 })
    const env = (serverSpawnCall().opts as { env: NodeJS.ProcessEnv }).env

    expect(server.version).toBe(1)
    expect(server.authorization).toBeUndefined()
    expect(env.OPENCODE_SERVER_PASSWORD).toBeUndefined()
  })

  it("provisions auth when version detection fails", async () => {
    versionExitCode = 1
    const prior = process.env.OPENCODE_SERVER_PASSWORD
    process.env.OPENCODE_SERVER_PASSWORD = "do-not-forward"
    try {
      const server = await startOpencodeServer({ port: 4096 })
      const env = (serverSpawnCall().opts as { env: NodeJS.ProcessEnv }).env
      expect(server.version).toBeNull()
      expect(server.authorization).toMatch(/^Basic /)
      expect(env.OPENCODE_SERVER_PASSWORD).toBeTruthy()
      expect(Buffer.from(server.authorization!.slice("Basic ".length), "base64").toString()).toBe(
        `opencode:${env.OPENCODE_SERVER_PASSWORD}`,
      )
    } finally {
      if (prior === undefined) delete process.env.OPENCODE_SERVER_PASSWORD
      else process.env.OPENCODE_SERVER_PASSWORD = prior
    }
  })
})

describe("opencode-server — startup output redaction", () => {
  it("redacts server password lines with supported prefixes and casing", () => {
    const output = [
      "starting",
      "server password generated-one",
      "OpenCode SERVER PASSWORD generated-two",
      "server listening on http://127.0.0.1:4096",
    ].join("\r\n")

    expect(startOpencodeServer.redactSensitiveOutput!(output)).toBe([
      "starting",
      "<redacted>",
      "<redacted>",
      "server listening on http://127.0.0.1:4096",
    ].join("\r\n"))
  })

  it("does not throw for an unexpected runtime input", () => {
    expect(() => startOpencodeServer.redactSensitiveOutput!(null as unknown as string)).not.toThrow()
    expect(startOpencodeServer.redactSensitiveOutput!(null as unknown as string)).toBe("")
  })

  it("redacts password lines from timeout diagnostics", async () => {
    versionExitCode = 1
    autoServeOutput = "server password timeout-secret\n"
    const error = await failureFrom(startOpencodeServer({ timeout: 10 }))

    expect(error.message).toContain("<redacted>")
    expect(error.message).not.toContain("timeout-secret")
  })

  it("redacts password lines from exit diagnostics", async () => {
    versionExitCode = 1
    autoServeOutput = "opencode server password exit-secret\n"
    autoServeExitCode = 1
    const error = await failureFrom(startOpencodeServer({ timeout: 1000 }))

    expect(error.message).toContain("<redacted>")
    expect(error.message).not.toContain("exit-secret")
  })

  it("redacts password lines from URL parse diagnostics", async () => {
    versionExitCode = 1
    autoServeOutput = "server password parse-secret\nserver listening without a URL\n"
    const error = await failureFrom(startOpencodeServer({ timeout: 1000 }))

    expect(error.message).toContain("<redacted>")
    expect(error.message).not.toContain("parse-secret")
  })
})

describe("opencode-server — Windows process cleanup", () => {
  it("kills the spawned process tree when Windows startup times out", async () => {
    const proc = createFakeProcess(4321)
    nextProc = proc
    autoServeOutput = null
    resolveSpawnableImpl = async () => String.raw`C:\Program Files\opencode\opencode.exe`

    await withPlatform("win32", async () => {
      await expect(startOpencodeServer({ timeout: 1 })).rejects.toThrow(
        "Timeout waiting for server to start",
      )
    })

    expect(spawnCalls.some((c) => c.command === "taskkill" && c.args.includes("4321"))).toBe(true)
  })

  it("closes Windows shell shims by killing the process tree", async () => {
    const proc = createFakeProcess(5555)
    nextProc = proc
    resolveSpawnableImpl = async () =>
      String.raw`C:\Users\dev\AppData\Roaming\npm\opencode.cmd`
    autoServeOutput = null

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

    expect(serverSpawnCall().command).toBe(
      String.raw`"C:\Users\dev\AppData\Roaming\npm\opencode.cmd"`,
    )
    expect((serverSpawnCall().opts as { shell?: boolean }).shell).toBe(true)
    const taskkill = spawnCalls.find(({ command }) => command === "taskkill")
    expect(taskkill?.args).toEqual(["/pid", "5555", "/t", "/f"])
    expect(proc.kill).not.toHaveBeenCalled()
  })

  it("closes Windows native binaries by killing the process tree", async () => {
    const proc = createFakeProcess(6666)
    nextProc = proc
    resolveSpawnableImpl = async () =>
      String.raw`C:\Program Files\opencode\opencode.exe`
    autoServeOutput = null

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

    expect(spawnCalls.some((c) => c.command === "taskkill" && c.args.includes("6666"))).toBe(true)
    expect(proc.kill).not.toHaveBeenCalled()
  })
})
