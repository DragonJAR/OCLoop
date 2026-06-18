import { describe, expect, it } from "bun:test"
import {
  getResolvedTheme,
  isValidTheme,
  resolveTheme,
  toMonochrome,
  type ThemeColors,
  type ThemeDefinition,
} from "./theme-resolver"
import { themes } from "./themes"

function makeTheme(theme: Record<string, string>): ThemeDefinition {
  return { defs: {}, theme }
}

describe("theme-resolver (Finding 18.2.E)", () => {
  it("resolves direct hex strings to themselves", () => {
    // Pin: the happy path — a token whose value is already a hex color is
    // returned as-is, no defs lookup, no recursion. This is the contract
    // that the 32 vendored theme.json files rely on.
    const t = resolveTheme(
      makeTheme({
        primary: "#abcdef",
        secondary: "#000000",
        accent: "#ffffff",
        background: "#111111",
        backgroundPanel: "#222222",
        backgroundElement: "#333333",
        text: "#444444",
        textMuted: "#555555",
        border: "#666666",
        borderActive: "#777777",
        borderSubtle: "#888888",
        success: "#999999",
        warning: "#aaaaaa",
        error: "#bbbbbb",
        info: "#cccccc",
      }),
    )
    expect(t.primary).toBe("#abcdef")
    expect(t.secondary).toBe("#000000")
    expect(t.accent).toBe("#ffffff")
  })

  it("resolves a def reference through the defs table", () => {
    // Pin: a token that names a def in `defs:` should look up that def and
    // return its hex value. This is the main mechanism the vendored themes
    // use (e.g. dragonjar.json: `primary -> darkRed -> #c11b05`).
    const t = resolveTheme(
      {
        defs: { myRed: "#c11b05" },
        theme: { primary: "myRed" } as never,
      },
      "dark",
    )
    expect(t.primary).toBe("#c11b05")
  })

  it("falls back to #808080 for an undefined value (missing token)", () => {
    // Pin: a custom theme that omits one of the 15 required tokens still
    // produces a ThemeColors object where the missing token is the
    // neutral-grey fallback. Without this guarantee, the renderer would
    // get `undefined` and break the TUI palette.
    const t = resolveTheme(makeTheme({ primary: "#abcdef" }))
    expect(t.primary).toBe("#abcdef")
    // 14 of the 15 tokens are missing — all should be the fallback.
    expect(t.secondary).toBe("#808080")
    expect(t.accent).toBe("#808080")
    expect(t.background).toBe("#808080")
    expect(t.text).toBe("#808080")
    expect(t.success).toBe("#808080")
    expect(t.error).toBe("#808080")
  })

  it("falls back to #808080 for a def reference that does not exist", () => {
    // Pin: a token that names a def that isn't in `defs:` is treated the
    // same as a missing token — neutral-grey fallback. The renderer's
    // downstream code can rely on every entry of ThemeColors being a
    // valid hex string.
    const t = resolveTheme(
      {
        defs: {},
        theme: { primary: "undefined-def" } as never,
      },
      "dark",
    )
    expect(t.primary).toBe("#808080")
  })

  it("depth cap: cyclic defs fall back to #808080 (defense against stack overflow)", () => {
    // The depth cap at theme-resolver.ts:91 is the cyclic-def defense: a
    // malicious or hand-rolled theme with `defs: { a: "b", b: "a" }` would
    // recurse forever without it. The cap is 8, which is far beyond any
    // legitimate def chain. We exercise a 2-cycle (a→b→a→b→…) and assert
    // the function returns rather than stack-overflowing.
    const t = resolveTheme(
      {
        defs: { a: "b", b: "a" },
        theme: { primary: "a" } as never,
      },
      "dark",
    )
    expect(t.primary).toBe("#808080")
  })

  it("depth cap: long non-cyclic chains resolve normally when within the cap", () => {
    // Sanity companion to the cycle test — a chain of 4 defs is well
    // within the depth-8 cap and resolves to the final hex value. This
    // pins that the cap doesn't truncate legitimate multi-step defs.
    const t = resolveTheme(
      {
        defs: { a: "b", b: "c", c: "d", d: "#deadbe" },
        theme: { primary: "a" } as never,
      },
      "dark",
    )
    expect(t.primary).toBe("#deadbe")
  })

  it("resolves dark/light variant objects to the mode-matched variant", () => {
    // Pin: a token whose value is `{ dark: "...", light: "..." }` is
    // resolved by reading the variant for the requested mode. This is
    // how every vendored theme.json ships its color tokens.
    const t = resolveTheme(
      {
        defs: {},
        theme: {
          primary: { dark: "#111111", light: "#eeeeee" },
        } as never,
      },
      "light",
    )
    expect(t.primary).toBe("#eeeeee")
  })

  it("getResolvedTheme returns the named theme's colors", () => {
    // Pin: getResolvedTheme is a thin wrapper around resolveTheme that
    // looks up the named theme in the themes map. Using `dragonjar`
    // (the DEFAULT_THEME) gives us a known-good reference: the dark
    // primary is the DragonJAR red `#c11b05` per brand-identity comment
    // in themes/index.ts:93.
    const t = getResolvedTheme("dragonjar", "dark")
    expect(t.primary).toBe("#c11b05")
  })

  it("getResolvedTheme falls back to DEFAULT_THEME for an unknown name", () => {
    // Pin: typo'd theme names in ocloop.json should not crash the TUI —
    // they should silently fall back to the default theme. The user
    // sees a working color palette; the audit trail is the only place
    // the typo is observable (via ThemeContext's separate log).
    const t = getResolvedTheme("nonexistent-theme", "dark")
    expect(t.primary).toBe("#c11b05") // dragonjar dark primary
  })

  it("isValidTheme returns true for a known theme and false for an unknown one", () => {
    // Pin: the public guard for the theme-selection command palette and
    // the ocloop.json `theme:` field. Returns true for any key in the
    // themes map, false otherwise.
    expect(isValidTheme("dragonjar")).toBe(true)
    expect(isValidTheme("nonexistent-theme")).toBe(false)
  })

  it("toMonochrome collapses every fg token to text and every bg to background", () => {
    // Pin: when the terminal can't use color (NO_COLOR, TERM=dumb), every
    // semantic token should become the base text/background — color stops
    // conveying meaning. The exact pairing (fg→text, bg→background) is
    // load-bearing for accessibility: it satisfies the intent of
    // NO_COLOR even though OpenTUI still emits truecolor ANSI for the
    // single fg/bg (see term-caps.ts).
    const original = {
      primary: "#111111",
      secondary: "#222222",
      accent: "#333333",
      background: "#aaaaaa",
      backgroundPanel: "#bbbbbb",
      backgroundElement: "#cccccc",
      text: "#dddddd",
      textMuted: "#eeeeee",
      border: "#000001",
      borderActive: "#000002",
      borderSubtle: "#000003",
      success: "#000004",
      warning: "#000005",
      error: "#000006",
      info: "#000007",
    }
    const mono = toMonochrome(original)
    // Every fg token collapses to text.
    expect(mono.primary).toBe("#dddddd")
    expect(mono.secondary).toBe("#dddddd")
    expect(mono.accent).toBe("#dddddd")
    expect(mono.text).toBe("#dddddd")
    expect(mono.textMuted).toBe("#dddddd")
    expect(mono.border).toBe("#dddddd")
    expect(mono.borderActive).toBe("#dddddd")
    expect(mono.borderSubtle).toBe("#dddddd")
    expect(mono.success).toBe("#dddddd")
    expect(mono.warning).toBe("#dddddd")
    expect(mono.error).toBe("#dddddd")
    expect(mono.info).toBe("#dddddd")
    // Every bg token collapses to background.
    expect(mono.background).toBe("#aaaaaa")
    expect(mono.backgroundPanel).toBe("#aaaaaa")
    expect(mono.backgroundElement).toBe("#aaaaaa")
  })

  it("every registered theme resolves to a complete 15-token palette (dark + light)", () => {
    // Pin: the live theme picker (DialogThemePicker) iterates Object.keys(themes)
    // and calls getResolvedTheme for each theme as the user navigates, in the
    // active mode. Every vendored theme must resolve to all 15 ThemeColors tokens
    // as valid hex strings in BOTH modes — a missing/garbage token would paint a
    // broken palette mid-preview. Collect-then-assert so a failure names the
    // exact theme/mode/token instead of stopping at the first.
    const TOKENS: (keyof ThemeColors)[] = [
      "primary", "secondary", "accent", "background", "backgroundPanel",
      "backgroundElement", "text", "textMuted", "border", "borderActive",
      "borderSubtle", "success", "warning", "error", "info",
    ]
    const hex = /^#[0-9a-fA-F]{3,8}$/
    const bad: string[] = []
    for (const name of Object.keys(themes)) {
      for (const mode of ["dark", "light"] as const) {
        const resolved = getResolvedTheme(name, mode)
        for (const token of TOKENS) {
          if (!hex.test(resolved[token])) {
            bad.push(`${name}/${mode}.${token}=${JSON.stringify(resolved[token])}`)
          }
        }
      }
    }
    expect(bad).toEqual([])
  })
})
