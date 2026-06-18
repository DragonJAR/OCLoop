/**
 * terminal-launcher.ts tests.
 *
 * Source: MEJORAS.md Finding 18.2.D (MEDIUM — no test).
 *
 * Covers the testable surface of `src/lib/terminal-launcher.ts`:
 * - `getKnownTerminalByName`: pure lookup + the curated per-OS list pin.
 * - `getAttachCommand`: pure function with throw guards for empty
 *   url / sessionId (Findings 11.3.A + 11.3.B).
 * - `detectInstalledTerminals`: drives the `commandExists` mock and
 *   asserts the filter.
 * - `launchTerminal`: the full code path — token-substituted terminals
 *   (xterm `-e {cmd}`), the osascript/string-substituted macOS Terminal,
 *   the Windows `cmd` window, the custom-terminal branch, the 2
 *   input-validation guards (empty args, no `{cmd}`), the missing-command
 *   branch, the `Bun.spawn` failure branch, and the empty-url throw.
 *
 * `commandExists` is mocked at the module boundary (same pattern as
 * `clipboard.test.ts:19-23`). `Bun.spawn` is stubbed via the shared
 * helper at `./test-helpers/bun-spawn-mock` (same `Bun` global
 * limitation as `cli-args.test.ts:16-43` for `process.exit`).
 */

import { afterEach, describe, expect, it, mock } from "bun:test"

import {
  setupBunSpawnMock,
  spawnState,
} from "./test-helpers/bun-spawn-mock"

// Mutable impl for `commandExists` so individual tests can swap
// behavior. `mock.module` MUST be called before the module under test
// is imported, so the factory is hoisted to the top of the file by
// Bun's bundler.
let commandExistsImpl: (cmd: string) => Promise<boolean> = async () => true

mock.module("./command-exists", () => ({
  commandExists: (cmd: string) => commandExistsImpl(cmd),
}))

setupBunSpawnMock()

const {
  KNOWN_TERMINALS,
  getKnownTerminalByName,
  getAttachCommand,
  detectInstalledTerminals,
  launchTerminal,
} = await import("./terminal-launcher")

afterEach(() => {
  commandExistsImpl = async () => true
})

describe("getKnownTerminalByName (Finding 18.2.D)", () => {
  it("returns the entry for a known terminal name", () => {
    expect(getKnownTerminalByName("xterm")?.command).toBe("xterm")
  })

  it("returns undefined for an unknown name", () => {
    expect(getKnownTerminalByName("nope-not-a-terminal")).toBeUndefined()
  })

  it("KNOWN_TERMINALS is the curated per-OS list (Terminal, cmd, xterm, x-terminal-emulator)", () => {
    // Pin the size + names: one guaranteed/standard terminal per OS
    // (macOS Terminal.app via osascript, Windows cmd.exe, Linux xterm +
    // the Debian default-terminal alias). Any future add/remove is
    // intentional and updates this test.
    expect(KNOWN_TERMINALS.map((t) => t.name).sort()).toEqual([
      "Terminal",
      "cmd",
      "x-terminal-emulator",
      "xterm",
    ])
  })

  it("every KNOWN_TERMINALS entry references the {cmd} placeholder in args", () => {
    // Backstop for Finding 11.2.C: launchTerminal relies on {cmd} to substitute
    // the attach command. Token-style terminals carry it as its own arg
    // (["-e", "{cmd}"]); the osascript terminal embeds it inside a string
    // ('… do script "{cmd}"'). Either form must reference it, or the terminal
    // would open an empty shell.
    for (const t of KNOWN_TERMINALS) {
      expect(t.args.some((a) => a.includes("{cmd}"))).toBe(true)
    }
  })
})

describe("getAttachCommand (Findings 11.3.A + 11.3.B)", () => {
  it("builds the attach command from url + sessionId", () => {
    expect(getAttachCommand("http://127.0.0.1:4096", "ses_abc")).toBe(
      "opencode attach http://127.0.0.1:4096 --session ses_abc",
    )
  })

  it("throws on empty url (Finding 11.3.A)", () => {
    expect(() => getAttachCommand("", "ses_abc")).toThrow("url is required")
  })

  it("throws on empty sessionId (Finding 11.3.B)", () => {
    expect(() => getAttachCommand("http://127.0.0.1:4096", "")).toThrow(
      "sessionId is required",
    )
  })
})

describe("detectInstalledTerminals (Finding 18.2.D)", () => {
  it("returns only the entries for which commandExists returned true", async () => {
    commandExistsImpl = async (cmd) => cmd === "xterm" || cmd === "x-terminal-emulator"
    const installed = await detectInstalledTerminals()
    expect(installed.map((t) => t.name).sort()).toEqual([
      "x-terminal-emulator",
      "xterm",
    ])
  })

  it("returns an empty array when no terminal is on PATH", async () => {
    commandExistsImpl = async () => false
    const installed = await detectInstalledTerminals()
    expect(installed).toEqual([])
  })
})

describe("launchTerminal (Finding 18.2.D)", () => {
  it("spawns a token-style terminal with the {cmd} placeholder expanded into argv tokens", async () => {
    commandExistsImpl = async (cmd) => cmd === "xterm"
    const result = await launchTerminal(
      { type: "known", name: "xterm" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result).toEqual({ success: true })
    expect(spawnState.calls).toHaveLength(1)
    expect(spawnState.calls[0].cmd).toEqual([
      "xterm",
      "-e",
      "opencode",
      "attach",
      "http://127.0.0.1:4096",
      "--session",
      "ses_abc",
    ])
  })

  it("spawns the macOS Terminal via osascript with the attach command inlined", async () => {
    // osascript takes the command as a single STRING inside `do script "…"`,
    // so {cmd} is embedded in the arg (not a standalone token) and must be
    // inline-substituted with the space-joined attach command.
    commandExistsImpl = async (cmd) => cmd === "osascript"
    const result = await launchTerminal(
      { type: "known", name: "Terminal" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result).toEqual({ success: true })
    expect(spawnState.calls[0].cmd).toEqual([
      "osascript",
      "-e",
      `tell application "Terminal" to do script "opencode attach http://127.0.0.1:4096 --session ses_abc"`,
      "-e",
      `tell application "Terminal" to activate`,
    ])
  })

  it("spawns the Windows cmd window with the {cmd} placeholder expanded", async () => {
    commandExistsImpl = async (cmd) => cmd === "cmd"
    const result = await launchTerminal(
      { type: "known", name: "cmd" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result).toEqual({ success: true })
    expect(spawnState.calls[0].cmd).toEqual([
      "cmd",
      "/c",
      "start",
      "",
      "cmd",
      "/k",
      "opencode",
      "attach",
      "http://127.0.0.1:4096",
      "--session",
      "ses_abc",
    ])
  })

  it("returns { success: false, error } for an unknown terminal name", async () => {
    const result = await launchTerminal(
      { type: "known", name: "nope" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("Unknown terminal: nope")
  })

  it("returns { success: false, error } when the known terminal command is not on PATH", async () => {
    commandExistsImpl = async () => false
    const result = await launchTerminal(
      { type: "known", name: "xterm" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("Terminal command not found: xterm")
  })

  it("spawns a custom terminal with the {cmd} placeholder expanded", async () => {
    commandExistsImpl = async (cmd) => cmd === "my-term"
    const result = await launchTerminal(
      { type: "custom", command: "my-term", args: "-e {cmd}" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result).toEqual({ success: true })
    expect(spawnState.calls).toHaveLength(1)
    expect(spawnState.calls[0].cmd).toEqual([
      "my-term",
      "-e",
      "opencode",
      "attach",
      "http://127.0.0.1:4096",
      "--session",
      "ses_abc",
    ])
  })

  it("collapses multi-space whitespace in the custom args pattern", async () => {
    // `config.args` is split on `/\s+/`, so a user-typed "-e    {cmd}" should
    // yield the same argv as "-e {cmd}".
    commandExistsImpl = async (cmd) => cmd === "my-term"
    const result = await launchTerminal(
      { type: "custom", command: "my-term", args: "-e    {cmd}" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result).toEqual({ success: true })
    expect(spawnState.calls[0].cmd).toEqual([
      "my-term",
      "-e",
      "opencode",
      "attach",
      "http://127.0.0.1:4096",
      "--session",
      "ses_abc",
    ])
  })

  it("returns { success: false, error } for custom terminal with empty args (Finding 11.2.B)", async () => {
    const result = await launchTerminal(
      { type: "custom", command: "my-term", args: "" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("{cmd} placeholder")
  })

  it("returns { success: false, error } for custom terminal args missing {cmd} (Finding 11.2.C)", async () => {
    const result = await launchTerminal(
      { type: "custom", command: "my-term", args: "-e bash" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("{cmd} placeholder")
  })

  it("returns { success: false, error } when the custom terminal command is not on PATH", async () => {
    commandExistsImpl = async () => false
    const result = await launchTerminal(
      { type: "custom", command: "my-term", args: "-e {cmd}" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("Terminal command not found: my-term")
  })

  it("swallows Bun.spawn failures as { success: false, error }", async () => {
    commandExistsImpl = async () => true
    spawnState.impl = () => {
      throw new Error("spawn exploded")
    }
    const result = await launchTerminal(
      { type: "known", name: "xterm" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("spawn exploded")
  })

  it("surfaces getAttachCommandArgs's empty-url throw through the outer try/catch", async () => {
    commandExistsImpl = async () => true
    const result = await launchTerminal({ type: "known", name: "xterm" }, "", "ses_abc")
    expect(result.success).toBe(false)
    expect(result.error).toContain("url is required")
  })

  it("spawns with detached: true and windowsHide: true (Finding 11.2.A)", async () => {
    // The flags prevent SIGHUP from the parent TUI on POSIX and suppress the
    // console flash on Windows. Pin them so a future refactor that drops them
    // does not silently regress.
    commandExistsImpl = async () => true
    await launchTerminal(
      { type: "known", name: "xterm" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(spawnState.calls).toHaveLength(1)
    const opts = spawnState.calls[0].opts as {
      detached?: boolean
      windowsHide?: boolean
    }
    expect(opts.detached).toBe(true)
    expect(opts.windowsHide).toBe(true)
  })
})
