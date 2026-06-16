import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig, saveConfig, getConfigPath } from "./config"

// `loadConfig` reads from `${XDG_CONFIG_HOME}/ocloop/ocloop.json` (or
// `~/.config/ocloop/ocloop.json` when the env var is unset). Redirect
// `XDG_CONFIG_HOME` to a fresh tempdir per test so suite state never leaks.
let dir: string
let prevXdg: string | undefined

beforeEach(() => {
  prevXdg = process.env.XDG_CONFIG_HOME
  dir = mkdtempSync(join(tmpdir(), "ocloop-cfg-"))
  process.env.XDG_CONFIG_HOME = dir
})

afterEach(() => {
  if (prevXdg === undefined) {
    delete process.env.XDG_CONFIG_HOME
  } else {
    process.env.XDG_CONFIG_HOME = prevXdg
  }
  rmSync(dir, { recursive: true, force: true })
})

function writeConfig(name: string, body: string): string {
  const ocDir = join(dir, "ocloop")
  mkdirSync(ocDir, { recursive: true })
  const path = join(ocDir, name)
  writeFileSync(path, body, "utf-8")
  return path
}

describe("loadConfig — schema robustness", () => {
  it("returns {} when the file does not exist", () => {
    // No file written — loadConfig should fall through to the default.
    expect(loadConfig()).toEqual({})
  })

  it("returns {} on invalid JSON", () => {
    writeConfig("ocloop.json", "{ this is not json")
    expect(loadConfig()).toEqual({})
  })

  it("returns {} when the file contains null", () => {
    writeConfig("ocloop.json", "null")
    expect(loadConfig()).toEqual({})
  })

  it("returns {} when the file contains an array", () => {
    writeConfig("ocloop.json", "[1, 2, 3]")
    expect(loadConfig()).toEqual({})
  })

  it("returns {} for an empty file", () => {
    writeConfig("ocloop.json", "")
    expect(loadConfig()).toEqual({})
  })

  it("returns {} for a primitive JSON value", () => {
    writeConfig("ocloop.json", "42")
    expect(loadConfig()).toEqual({})
  })

  it("returns the parsed object for a partial config", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ terminal: { type: "known", name: "alacritty" } }),
    )
    const config = loadConfig()
    expect(config.terminal).toEqual({ type: "known", name: "alacritty" })
  })
})

describe("loadConfig — per-field type validation (Finding 12.1.A)", () => {
  it("drops a malformed terminal field", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ terminal: "not-an-object" }),
    )
    const config = loadConfig()
    expect(config.terminal).toBeUndefined()
  })

  it("drops a terminal missing required nested fields", () => {
    writeConfig("ocloop.json", JSON.stringify({ terminal: { type: "known" } }))
    const config = loadConfig()
    expect(config.terminal).toBeUndefined()
  })

  it("keeps a valid known terminal", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ terminal: { type: "known", name: "kitty" } }),
    )
    const config = loadConfig()
    expect(config.terminal).toEqual({ type: "known", name: "kitty" })
  })

  it("keeps a valid custom terminal", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({
        terminal: { type: "custom", command: "my-term", args: "-e {cmd}" },
      }),
    )
    const config = loadConfig()
    expect(config.terminal).toEqual({
      type: "custom",
      command: "my-term",
      args: "-e {cmd}",
    })
  })

  it("drops a malformed language field (non-locale string)", () => {
    writeConfig("ocloop.json", JSON.stringify({ language: "fr" }))
    const config = loadConfig()
    expect(config.language).toBeUndefined()
  })

  it("drops a malformed language field (non-string)", () => {
    writeConfig("ocloop.json", JSON.stringify({ language: 42 }))
    const config = loadConfig()
    expect(config.language).toBeUndefined()
  })

  it("keeps a valid language", () => {
    writeConfig("ocloop.json", JSON.stringify({ language: "es" }))
    const config = loadConfig()
    expect(config.language).toBe("es")
  })

  it("drops a malformed theme field (non-string)", () => {
    writeConfig("ocloop.json", JSON.stringify({ theme: 42 }))
    const config = loadConfig()
    expect(config.theme).toBeUndefined()
  })

  it("keeps a string theme (semantic check stays in the consumer)", () => {
    writeConfig("ocloop.json", JSON.stringify({ theme: "opencode" }))
    const config = loadConfig()
    expect(config.theme).toBe("opencode")
  })

  it("drops a malformed scrollbar_visible field (string)", () => {
    writeConfig("ocloop.json", JSON.stringify({ scrollbar_visible: "true" }))
    const config = loadConfig()
    expect(config.scrollbar_visible).toBeUndefined()
  })

  it("drops a malformed scrollbar_visible field (number)", () => {
    writeConfig("ocloop.json", JSON.stringify({ scrollbar_visible: 1 }))
    const config = loadConfig()
    expect(config.scrollbar_visible).toBeUndefined()
  })

  it("keeps a valid scrollbar_visible boolean", () => {
    writeConfig("ocloop.json", JSON.stringify({ scrollbar_visible: false }))
    const config = loadConfig()
    expect(config.scrollbar_visible).toBe(false)
  })

  it("drops a malformed resilience field (string) — the audit's silent-corruption case", () => {
    writeConfig("ocloop.json", JSON.stringify({ resilience: "fast" }))
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops a malformed resilience field (array)", () => {
    writeConfig("ocloop.json", JSON.stringify({ resilience: [] }))
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops a malformed resilience field (null)", () => {
    writeConfig("ocloop.json", JSON.stringify({ resilience: null }))
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("keeps a valid resilience sub-object as-is (deep validation deferred to 12.3.B)", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ resilience: { createTimeoutMs: 30_000 } }),
    )
    const config = loadConfig()
    expect(config.resilience).toEqual({ createTimeoutMs: 30_000 })
  })
})

describe("loadConfig — unknown top-level keys (Finding 12.1.B)", () => {
  it("drops a typo'd language key and keeps the rest", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ languaje: "es", theme: "opencode" }),
    )
    const config = loadConfig()
    // No `languaje` field on OcloopConfig; `theme` must survive.
    expect(config.theme).toBe("opencode")
    expect(Object.keys(config)).toEqual(["theme"])
  })

  it("drops multiple unknown keys in one pass", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ themee: "x", resillience: {}, extra: 1 }),
    )
    const config = loadConfig()
    expect(config).toEqual({})
  })

  it("preserves all known fields when no unknown keys are present", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({
        language: "en",
        theme: "opencode",
        scrollbar_visible: true,
      }),
    )
    const config = loadConfig()
    expect(config.language).toBe("en")
    expect(config.theme).toBe("opencode")
    expect(config.scrollbar_visible).toBe(true)
  })
})

describe("getConfigPath", () => {
  it("joins the config dir with ocloop.json", () => {
    // Sanity check — the test setup pins XDG_CONFIG_HOME to a fresh dir,
    // so getConfigPath should resolve under it.
    const path = getConfigPath()
    expect(path).toBe(join(dir, "ocloop", "ocloop.json"))
  })
})

describe("saveConfig — round-trip (Finding 12.2.A)", () => {
  it("writes the config and loadConfig reads it back", () => {
    saveConfig({ language: "es" })
    expect(loadConfig()).toEqual({ language: "es" })
  })

  it("overwrites an existing config atomically (no leftover .tmp)", () => {
    saveConfig({ language: "en" })
    saveConfig({ language: "es", theme: "opencode" })
    const path = getConfigPath()
    expect(existsSync(path + ".tmp")).toBe(false)
    expect(loadConfig()).toEqual({ language: "es", theme: "opencode" })
  })

  it("returns void and does not throw on the happy path", () => {
    // Pin the contract from Finding 12.2.E: callers `await` this sync
    // function, so the return value must be `void` (i.e., `undefined`).
    const result = saveConfig({})
    expect(result).toBeUndefined()
  })
})

describe("saveConfig — error swallowing (Finding 12.2.A)", () => {
  // Cross-platform caveats: Windows ACLs do not map to POSIX chmod, and root
  // bypasses the read-only check entirely. The audit's recommended pattern
  // for the parallel finding on `clearLoopState` (loop-state-store.test.ts)
  // is to skip on both axes; we mirror it here. The tempdir is owned by the
  // test process so chmod is permitted (root runs of the suite on CI are the
  // realistic root case to skip).
  it.skipIf(
    process.platform === "win32" ||
      (typeof process.getuid === "function" && process.getuid() === 0),
  )("does not throw when the config dir is read-only (EACCES / EPERM)", () => {
    // Pre-create the config dir (so the `mkdirSync` call inside `saveConfig`
    // is a no-op) and then chmod it read-only. The inner `writeFileSync` will
    // fail with EACCES (macOS) or EPERM (Linux); the `try/catch` in
    // `saveConfig` must swallow it.
    const configDir = join(dir, "ocloop")
    mkdirSync(configDir, { recursive: true })
    chmodSync(configDir, 0o555)
    try {
      expect(() => saveConfig({ language: "es" })).not.toThrow()
    } finally {
      // Restore so afterEach's rmSync can clean up the tempdir.
      chmodSync(configDir, 0o755)
    }
  })

  it.skipIf(
    process.platform === "win32" ||
      (typeof process.getuid === "function" && process.getuid() === 0),
  )("cleans up the orphan .tmp file on a failed save (Finding 12.2.C)", () => {
    // Side effect: the `catch` block in `saveConfig` best-effort `unlinkSync`s
    // the tmp so a failed `writeFileSync`/`renameSync` doesn't leak `ocloop.json.tmp`
    // into the user's `~/.config/ocloop/`.
    const configDir = join(dir, "ocloop")
    mkdirSync(configDir, { recursive: true })
    chmodSync(configDir, 0o555)
    try {
      saveConfig({ language: "es" })
    } finally {
      chmodSync(configDir, 0o755)
    }
    const path = getConfigPath()
    expect(existsSync(path)).toBe(false) // no main file created
    expect(existsSync(path + ".tmp")).toBe(false) // no tmp left behind
  })
})
