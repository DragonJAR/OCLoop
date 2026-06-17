/**
 * terminal-launcher.ts tests.
 *
 * Source: MEJORAS.md Finding 18.2.D (MEDIUM — no test).
 *
 * Covers the testable surface of `src/lib/terminal-launcher.ts`:
 * - `getKnownTerminalByName`: pure lookup + the 12-entry structural pin.
 * - `getAttachCommand`: pure function with throw guards for empty
 *   url / sessionId (Findings 11.3.A + 11.3.B).
 * - `detectInstalledTerminals`: drives the `commandExists` mock and
 *   asserts the filter.
 * - `launchTerminal`: the full code path. The 6 known-terminal and
 *   custom-terminal branches, the 2 input-validation guards (empty
 *   args, no `{cmd}` placeholder), the missing-command branch, the
 *   `Bun.spawn` failure branch, and the empty `attachCmd` buildArgs
 *   throw (Finding 11.2.D).
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
    expect(getKnownTerminalByName("alacritty")?.command).toBe("alacritty")
  })

  it("returns undefined for an unknown name", () => {
    expect(getKnownTerminalByName("nope-not-a-terminal")).toBeUndefined()
  })

  it("KNOWN_TERMINALS has 12 entries (the audit's cross-check baseline)", () => {
    // Pin the size: any future add/remove is intentional and gets a
    // matching test update. The audit's "12 matches" baseline is in
    // MEJORAS.md:13529.
    expect(KNOWN_TERMINALS).toHaveLength(12)
  })

  it("every KNOWN_TERMINALS entry has a {cmd} placeholder in args", () => {
    // Backstop for Finding 11.2.C: launchTerminal relies on the
    // {cmd} token to substitute the attach command. A known-terminal
    // entry without it would spawn an empty shell.
    for (const t of KNOWN_TERMINALS) {
      expect(t.args).toContain("{cmd}")
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
    commandExistsImpl = async (cmd) => cmd === "kitty" || cmd === "wezterm"
    const installed = await detectInstalledTerminals()
    expect(installed.map((t) => t.name).sort()).toEqual(["kitty", "wezterm"])
  })

  it("returns an empty array when no terminal is on PATH", async () => {
    commandExistsImpl = async () => false
    const installed = await detectInstalledTerminals()
    expect(installed).toEqual([])
  })
})

describe("launchTerminal (Finding 18.2.D)", () => {
  it("spawns a known terminal with the {cmd} placeholder expanded into argv tokens", async () => {
    commandExistsImpl = async (cmd) => cmd === "alacritty"
    const result = await launchTerminal(
      { type: "known", name: "alacritty" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result).toEqual({ success: true })
    expect(spawnState.calls).toHaveLength(1)
    expect(spawnState.calls[0].cmd).toEqual([
      "alacritty",
      "-e",
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
      { type: "known", name: "alacritty" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("Terminal command not found: alacritty")
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
    // `config.args` is split on `/\s+/` per terminal-launcher.ts:190, so
    // a user-typed "-e    {cmd}" should yield the same argv as "-e {cmd}".
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
      { type: "known", name: "alacritty" },
      "http://127.0.0.1:4096",
      "ses_abc",
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("spawn exploded")
  })

  it("surfaces getAttachCommandArgs's empty-url throw through the outer try/catch", async () => {
    // An empty url reaches getAttachCommandArgs first (before buildArgs), whose
    // `!url` guard throws. The outer catch converts the throw into a
    // { success: false, error } result. (Previously this tested buildArgs's
    // empty-attachCmd guard; the structured-tokens refactor moved the empty
    // input check upstream to getAttachCommandArgs.)
    commandExistsImpl = async () => true
    const result = await launchTerminal({ type: "known", name: "alacritty" }, "", "ses_abc")
    expect(result.success).toBe(false)
    expect(result.error).toContain("url is required")
  })

  it("spawns with detached: true and windowsHide: true (Finding 11.2.A)", async () => {
    // The flags prevent SIGHUP from the parent TUI on POSIX and
    // suppress the console flash on Windows. Pin them so a future
    // refactor that drops them does not silently regress.
    commandExistsImpl = async () => true
    await launchTerminal(
      { type: "known", name: "alacritty" },
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
