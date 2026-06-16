/**
 * Semantic glyphs with ASCII fallbacks.
 *
 * Single source of truth for every non-ASCII status icon / meter / separator the
 * TUI draws, so a terminal without UTF-8 (TERM=dumb, legacy CMD, or OCLOOP_ASCII=1)
 * degrades to plain ASCII instead of mojibake. Callers pass the resolved `unicode`
 * flag from the terminal capabilities (see term-caps.ts / ThemeContext).
 *
 * ASCII fallbacks are deliberately single-column (status icons, meters, dot) so
 * width math in layout.ts stays exact; multi-char fallbacks (ellipsis) are only
 * used where width is recomputed.
 *
 * NOTE: box-drawing for `<box border>` is rendered by OpenTUI itself (borderStyle),
 * not here — those characters are outside our control.
 */

export type GlyphName =
  // Dashboard state badges (one per LoopState)
  | "stateStarting"
  | "stateReady"
  | "stateRunning"
  | "statePausing"
  | "statePaused"
  | "stateCooldown"
  | "stateStopping"
  | "stateStopped"
  | "stateComplete"
  | "stateError"
  | "stateDebug"
  | "stateUnknown"
  // Activity-log severity glyphs
  | "sevInfo"
  | "sevWarn"
  | "sevError"
  // Meters / misc
  | "dot"
  | "progressFull"
  | "progressEmpty"
  | "times"
  | "barH"

const GLYPHS: Record<GlyphName, { u: string; a: string }> = {
  stateStarting: { u: "◐", a: "*" },
  stateReady: { u: "●", a: "o" },
  stateRunning: { u: "▶", a: ">" },
  statePausing: { u: "◑", a: "*" },
  statePaused: { u: "⏸", a: "=" },
  stateCooldown: { u: "◴", a: "~" },
  stateStopping: { u: "◌", a: "x" },
  stateStopped: { u: "⏹", a: "#" },
  stateComplete: { u: "✓", a: "+" },
  stateError: { u: "!", a: "!" },
  stateDebug: { u: "⚙", a: "%" },
  stateUnknown: { u: "?", a: "?" },
  sevInfo: { u: " ", a: " " },
  sevWarn: { u: "▲", a: "!" },
  sevError: { u: "✖", a: "x" },
  dot: { u: "●", a: "*" },
  progressFull: { u: "█", a: "#" },
  progressEmpty: { u: "░", a: "-" },
  times: { u: "×", a: "x" },
  barH: { u: "═", a: "=" },
}

/** Resolve a semantic glyph to Unicode or its ASCII fallback. */
export function glyph(name: GlyphName, unicode: boolean): string {
  const g = GLYPHS[name]
  return unicode ? g.u : g.a
}
