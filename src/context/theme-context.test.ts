/**
 * `selectedForeground` tests.
 *
 * Source: MEJORAS.md Finding 18.2.F (LOW — `context/*.tsx` and
 * `components/*.tsx` have no test).
 *
 * `selectedForeground` is a pure function that picks a contrasting
 * text color for `theme.primary`. The audit calls out the luminance
 * threshold (> 0.5 → black text, else white text) as the contract
 * that downstream consumers (DialogSelect, DialogControls,
 * DialogCompletion) rely on when highlighting the active item.
 *
 * The function lives in `theme-resolver.ts` (a pure `.ts` file, the
 * same module that already exposes the `ThemeColors` type) so it can
 * be unit-tested without pulling in the JSX transform from
 * `ThemeContext.tsx` (see `docs/testing.md`).
 *
 * The function only reads `theme.primary`; the other 14 fields of
 * `ThemeColors` are unused, so a stub is sufficient.
 */

import { describe, expect, it } from "bun:test"
import { selectedForeground, type ThemeColors } from "../lib/theme-resolver"

function makeTheme(primary: string): ThemeColors {
  return {
    primary,
    secondary: "",
    accent: "",
    background: "",
    backgroundPanel: "",
    backgroundElement: "",
    text: "",
    textMuted: "",
    border: "",
    borderActive: "",
    borderSubtle: "",
    success: "",
    warning: "",
    error: "",
    info: "",
  }
}

describe("selectedForeground (Finding 18.2.F)", () => {
  it("returns #000000 for a fully white background (luminance 1.0)", () => {
    // #FFFFFF → R=255 G=255 B=255 → luminance = 1.0 > 0.5 → dark text.
    expect(selectedForeground(makeTheme("#FFFFFF"))).toBe("#000000")
  })

  it("returns #FFFFFF for a fully black background (luminance 0.0)", () => {
    // #000000 → R=0 G=0 B=0 → luminance = 0.0 ≤ 0.5 → light text.
    expect(selectedForeground(makeTheme("#000000"))).toBe("#FFFFFF")
  })

  it("returns #000000 just above the 0.5 threshold (#808080)", () => {
    // #808080 → R=G=B=128 → luminance = 128/255 ≈ 0.5019… > 0.5.
    // This is the boundary case that pins the ">" (not ">=") choice
    // in the threshold comparison.
    expect(selectedForeground(makeTheme("#808080"))).toBe("#000000")
  })

  it("returns #FFFFFF just below the 0.5 threshold (#7F7F7F)", () => {
    // #7F7F7F → R=G=B=127 → luminance = 127/255 ≈ 0.4980… < 0.5.
    // Companion to the previous test — moves the input by one
    // hex step and confirms the threshold direction.
    expect(selectedForeground(makeTheme("#7F7F7F"))).toBe("#FFFFFF")
  })

  it("returns #000000 for pure green (#00FF00 — luminance 0.587)", () => {
    // Green is the brightest of the primaries at 0.587, comfortably
    // above the threshold. Pinned to confirm the per-channel weights
    // (0.299R + 0.587G + 0.114B) are applied correctly.
    expect(selectedForeground(makeTheme("#00FF00"))).toBe("#000000")
  })

  it("returns #FFFFFF for pure red (#FF0000 — luminance 0.299)", () => {
    // Red is below the threshold at 0.299. Companion to the green
    // test — confirms the channels are weighted (not averaged).
    expect(selectedForeground(makeTheme("#FF0000"))).toBe("#FFFFFF")
  })

  it("returns #FFFFFF for pure blue (#0000FF — luminance 0.114)", () => {
    // Blue is the darkest of the primaries at 0.114. Pinned to
    // confirm the blue channel's small weight in the formula.
    expect(selectedForeground(makeTheme("#0000FF"))).toBe("#FFFFFF")
  })
})
