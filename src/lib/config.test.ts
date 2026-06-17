import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_RESILIENCE, loadConfig, resolveResilience, saveConfig, getConfigPath, hasTerminalConfig } from "./config"

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

  it("keeps a valid resilience sub-object with all-valid fields", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ resilience: { createTimeoutMs: 30_000 } }),
    )
    const config = loadConfig()
    expect(config.resilience).toEqual({ createTimeoutMs: 30_000 })
  })
})

describe("loadConfig — resilience per-field type validation (Finding 12.3.B)", () => {
  it("drops the whole block when a numeric field holds a string — the audit's central case", () => {
    // `pickDefined` would accept the string (it's defined + not null), and
    // the value would reach `setTimeout("fast", …)` → `NaN` → immediate
    // timeout. The all-or-nothing deep validation catches this and drops
    // the block; the user sees a single warn line in `.loop.log`.
    writeConfig(
      "ocloop.json",
      JSON.stringify({ resilience: { createTimeoutMs: "fast" } }),
    )
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops the whole block when a boolean field holds a number", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({ resilience: { caffeinate: 1 } }),
    )
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops the whole block when a numeric field is negative", () => {
    // `setTimeout(-1, …)` is treated as 0 in Node/Bun → immediate timeout.
    // The CLI path's `num < 0` rejection is mirrored here.
    writeConfig(
      "ocloop.json",
      JSON.stringify({ resilience: { createTimeoutMs: -1 } }),
    )
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops the whole block when a numeric field is non-integer (1.5)", () => {
    // The CLI path rejects `1.5` via `Number.isInteger`; the file path
    // matches to keep both layers' strictness in lock-step.
    writeConfig(
      "ocloop.json",
      JSON.stringify({ resilience: { createTimeoutMs: 1.5 } }),
    )
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops the whole block when a numeric field is null", () => {
    // Per Finding 12.3.A, `null` is now filtered at the `pickDefined` layer
    // too, but a file with a bare `null` value would still spread over the
    // default without this check. Drop the whole block to be safe.
    writeConfig(
      "ocloop.json",
      JSON.stringify({ resilience: { createTimeoutMs: null } }),
    )
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops the whole block when an unknown key is present (all-or-nothing)", () => {
    // `isValidResilienceValue` rejects unknown keys. Even if every other
    // field is valid, the whole block is dropped — the user must fix the
    // config rather than silently inherit a partial set of overrides.
    writeConfig(
      "ocloop.json",
      JSON.stringify({
        resilience: { createTimeoutMs: 30_000, totallyMadeUpKey: 42 },
      }),
    )
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("drops the whole block when valid and invalid fields are mixed", () => {
    // The user has 19 valid fields and 1 bad; the all-or-nothing policy
    // surfaces the bad one in the warn log rather than silently applying
    // 19 overrides + the default for the bad one.
    writeConfig(
      "ocloop.json",
      JSON.stringify({
        resilience: {
          createTimeoutMs: 30_000,
          promptTimeoutMs: "nope",
        },
      }),
    )
    const config = loadConfig()
    expect(config.resilience).toBeUndefined()
  })

  it("keeps the whole block when every field is valid and uses the right type", () => {
    writeConfig(
      "ocloop.json",
      JSON.stringify({
        resilience: {
          createTimeoutMs: 30_000,
          caffeinate: false,
          backoffJitter: true,
        },
      }),
    )
    const config = loadConfig()
    expect(config.resilience).toEqual({
      createTimeoutMs: 30_000,
      caffeinate: false,
      backoffJitter: true,
    })
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

describe("resolveResilience — null skip (Finding 12.3.A)", () => {
  it("returns the defaults when both layers are undefined", () => {
    expect(resolveResilience()).toEqual(DEFAULT_RESILIENCE)
  })

  it("skips null per-field values and falls back to the default (the audit's central case)", () => {
    // Without the fix, `createTimeoutMs: null` would spread over the default
    // and reach `setTimeout(null, …)` → immediate timeout on every
    // `session.create`. With the fix, the null is skipped and the default
    // (15_000ms) survives.
    const result = resolveResilience({ createTimeoutMs: null })
    expect(result.createTimeoutMs).toBe(DEFAULT_RESILIENCE.createTimeoutMs)
  })

  it("skips null in the CLI override layer too", () => {
    // The CLI path is gated by `applyResilienceOverride` and never produces
    // a null, but `resolveResilience` defends itself in case a future
    // call site or a hand-rolled test path passes one.
    const result = resolveResilience(undefined, { promptTimeoutMs: null })
    expect(result.promptTimeoutMs).toBe(DEFAULT_RESILIENCE.promptTimeoutMs)
  })

  it("keeps non-null values mixed in alongside nulls in the same layer", () => {
    const result = resolveResilience({
      createTimeoutMs: 42_000,
      promptTimeoutMs: null,
    })
    expect(result.createTimeoutMs).toBe(42_000)
    expect(result.promptTimeoutMs).toBe(DEFAULT_RESILIENCE.promptTimeoutMs)
  })

  it("still skips undefined values (the pre-existing behavior)", () => {
    const result = resolveResilience({ createTimeoutMs: undefined })
    expect(result.createTimeoutMs).toBe(DEFAULT_RESILIENCE.createTimeoutMs)
  })

  it("lets a non-null CLI override win over a null file value", () => {
    // File says null (skipped → default), CLI says 99_000 → 99_000 wins.
    const result = resolveResilience(
      { createTimeoutMs: null },
      { createTimeoutMs: 99_000 },
    )
    expect(result.createTimeoutMs).toBe(99_000)
  })

  it("treats a null boolean field the same way (uses default)", () => {
    // `caffeinate: null` would short-circuit every `if (caffeinate)` to
    // false; after the fix, the default (`true` on macOS) survives.
    const result = resolveResilience({ caffeinate: null })
    expect(result.caffeinate).toBe(DEFAULT_RESILIENCE.caffeinate)
  })
})

describe("resolveResilience — unknown-key skip (Finding 12.3.C)", () => {
  it("drops unknown keys from the file layer (the audit's central case)", () => {
    // A hand-edited `ocloop.json` with
    // `{"resilience": {"createTimeoutMs": 5000, "totallyMadeUpKey": 42}}`
    // would spread the unknown key over the defaults. With the fix, the
    // unknown key is filtered at the `pickDefined` layer (defense-in-depth
    // on top of `validateConfigShape`'s all-or-nothing deep validation).
    // The known value still wins, and the unknown key never appears in the
    // result — so a future `for (const k of Object.keys(resilience))`
    // consumer never sees it.
    const result = resolveResilience({
      createTimeoutMs: 5_000,
      totallyMadeUpKey: 42,
    } as unknown as Partial<typeof DEFAULT_RESILIENCE>)
    expect(result.createTimeoutMs).toBe(5_000)
    expect("totallyMadeUpKey" in result).toBe(false)
  })

  it("drops unknown keys from the CLI override layer too", () => {
    // The CLI path is gated by `applyResilienceOverride` and never produces
    // an unknown key in practice, but `pickDefined` defends itself in case
    // a future call site, a hand-rolled test path, or a future refactor
    // passes one.
    const result = resolveResilience(undefined, {
      createTimeoutMs: 5_000,
      totallyMadeUpKey: 42,
    } as unknown as Partial<typeof DEFAULT_RESILIENCE>)
    expect(result.createTimeoutMs).toBe(5_000)
    expect("totallyMadeUpKey" in result).toBe(false)
  })

  it("keeps known keys mixed in alongside unknown keys in the same layer", () => {
    // Multiple known overrides + multiple unknown keys: known ones win,
    // unknown ones vanish. Same shape as the central case but with more
    // fields, to confirm the filter composes with itself in one pass.
    const result = resolveResilience({
      createTimeoutMs: 5_000,
      promptTimeoutMs: 99_000,
      totallyMadeUpKey: 42,
      anotherUnknown: "ignored",
    } as unknown as Partial<typeof DEFAULT_RESILIENCE>)
    expect(result.createTimeoutMs).toBe(5_000)
    expect(result.promptTimeoutMs).toBe(99_000)
    expect("totallyMadeUpKey" in result).toBe(false)
    expect("anotherUnknown" in result).toBe(false)
  })
})

describe("resolveResilience — non-object layers (Finding 12.3.A)", () => {
  it("treats an array in the file layer as no override (array rejection)", () => {
    // `Object.entries([100, 200, 300])` returns `[["0", 100], …]`; without
    // the guard, the first three default slots get overwritten with array
    // indices. With the guard, the whole layer is dropped.
    const result = resolveResilience(
      [100, 200, 300] as unknown as Partial<typeof DEFAULT_RESILIENCE>,
    )
    expect(result).toEqual(DEFAULT_RESILIENCE)
  })

  it("treats an array in the CLI layer the same way", () => {
    const result = resolveResilience(
      undefined,
      [42] as unknown as Partial<typeof DEFAULT_RESILIENCE>,
    )
    expect(result).toEqual(DEFAULT_RESILIENCE)
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
    // Finding 12.2.B randomized the tmp suffix, so the old `path + ".tmp"`
    // probe is a tautology. Scan the dir for any leftover tmp file instead —
    // same user-visible intent ("no orphan tmp after a successful save").
    const configDir = join(dir, "ocloop")
    const tmps = readdirSync(configDir).filter((e) => e.endsWith(".tmp"))
    expect(tmps).toEqual([])
    expect(existsSync(path)).toBe(true)
    expect(loadConfig()).toEqual({ language: "es", theme: "opencode" })
  })

  it("uses a randomized tmp suffix per save (Finding 12.2.B)", () => {
    // The tmp path inside saveConfig carries a 12-char hex suffix; we can't
    // intercept `writeFileSync` cleanly, so we exercise the user-observable
    // consequence: two consecutive saves must produce no two tmp files
    // colliding, and the dir is clean afterwards. (The randomized suffix
    // already prevents cross-process clobbering even mid-write; this test
    // pins the post-condition that a successful save leaves no tmp behind.)
    saveConfig({ language: "en" })
    saveConfig({ theme: "opencode" })
    const configDir = join(dir, "ocloop")
    const tmps = readdirSync(configDir).filter((e) => e.endsWith(".tmp"))
    expect(tmps).toEqual([])
  })

  it("returns true and does not throw on the happy path", () => {
    // Pin the contract from Finding 12.2.E + Finding 17.3.B: the function is
    // synchronous (returns immediately, not a Promise) and returns `true`
    // on a successful write so the four `App.tsx` call sites can surface a
    // user-visible error toast when persistence fails. Callers in `App.tsx`
    // MUST NOT `await` it — an `await` on a `boolean` expression silently
    // introduces a microtask delay that couples local-state updates to the
    // wrong tick. If the function is ever refactored to use `fs/promises`,
    // this test will need to be updated to assert the new
    // `Promise<boolean>` shape and the four call sites will need to add
    // `await` back.
    const result = saveConfig({})
    expect(result).toBe(true)
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
  )("returns false (not throws) when the config dir is read-only (Finding 17.3.B)", () => {
    // Pin the second half of the Finding 17.3.B contract: a failed save
    // must surface a `false` to the caller so the call site can show a
    // toast. Pre-create the config dir (so the `mkdirSync` call inside
    // `saveConfig` is a no-op) and then chmod it read-only. The inner
    // `writeFileSync` will fail with EACCES (macOS) or EPERM (Linux); the
    // `try/catch` in `saveConfig` must return `false` (not throw).
    const configDir = join(dir, "ocloop")
    mkdirSync(configDir, { recursive: true })
    chmodSync(configDir, 0o555)
    try {
      const result = saveConfig({ language: "es" })
      expect(result).toBe(false)
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
    // the tmp so a failed `writeFileSync`/`renameSync` doesn't leak
    // `ocloop.json.<randomhex>.tmp` into the user's `~/.config/ocloop/`.
    // The previous `existsSync(path + ".tmp")` probe became a tautology after
    // Finding 12.2.B randomized the suffix; scan the dir for any `*.tmp`
    // leftover instead, matching the convention from the 12.2.B round-trip
    // test above.
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
    const tmps = readdirSync(configDir).filter((e) => e.endsWith(".tmp"))
    expect(tmps).toEqual([]) // no tmp left behind
  })
})

describe("hasTerminalConfig (Finding 18.2.C items 12-13)", () => {
  // The audit's 13-item test inventory for Finding 18.2.C had items 1-11
  // covered by Mejoras 43-53 (loadConfig robustness, resolveResilience
  // merge order, saveConfig atomic write). The two remaining items —
  // hasTerminalConfig accepting both known/custom shapes and rejecting
  // empty values — were the only gaps. Source: MEJORAS.md Finding 18.2.C.

  it("returns false when the config has no terminal field", () => {
    expect(hasTerminalConfig({})).toBe(false)
  })

  it("accepts a valid known terminal (type + non-empty name)", () => {
    expect(
      hasTerminalConfig({ terminal: { type: "known", name: "alacritty" } }),
    ).toBe(true)
  })

  it("rejects a known terminal with an empty name", () => {
    expect(
      hasTerminalConfig({ terminal: { type: "known", name: "" } }),
    ).toBe(false)
  })

  it("accepts a valid custom terminal (type + command + args string)", () => {
    expect(
      hasTerminalConfig({
        terminal: {
          type: "custom",
          command: "x-terminal-emulator",
          args: "-e {cmd}",
        },
      }),
    ).toBe(true)
  })

  it("rejects a custom terminal with an empty command", () => {
    expect(
      hasTerminalConfig({
        terminal: { type: "custom", command: "", args: "-e {cmd}" },
      }),
    ).toBe(false)
  })
})
