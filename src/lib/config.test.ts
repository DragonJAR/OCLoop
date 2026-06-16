import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadConfig, getConfigPath } from "./config"

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
