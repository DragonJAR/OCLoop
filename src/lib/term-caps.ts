/**
 * Terminal capability detection (platform-isolated, like power.ts / clipboard.ts).
 *
 * OpenTUI auto-detects some capabilities natively but exposes NO knob to force a
 * color level, disable color, or pick ASCII — and it always emits truecolor ANSI,
 * leaving depth downsampling to the terminal. So this module owns the policy the
 * UI needs: honor NO_COLOR / FORCE_COLOR, TERM=dumb, CI and TTY, derive a color
 * level (none | ansi16 | ansi256 | truecolor) and decide whether Unicode glyphs
 * are safe (else fall back to ASCII).
 *
 * Pure + injectable: pass `DetectInput` to unit-test without touching the real
 * environment. No OS-specific dependency — only `process.env`/`process.platform`/
 * `isTTY`, which Bun provides on macOS, Linux and Windows alike.
 */

export type ColorLevel = "none" | "ansi16" | "ansi256" | "truecolor"

export interface TerminalCapabilities {
  /** Effective color depth after honoring NO_COLOR/FORCE_COLOR/TTY/CI/TERM. */
  color: ColorLevel
  /** Whether Unicode glyphs / box-drawing render correctly (else use ASCII). */
  unicode: boolean
  /** stdout is an interactive TTY. */
  isTTY: boolean
  /** stdin AND stdout are interactive (safe to prompt). */
  isInteractive: boolean
  /** Running under a CI provider. */
  isCI: boolean
}

export interface DetectInput {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>
  /** Defaults to process.stdout?.isTTY. */
  isTTY?: boolean
  /** Defaults to process.stdin?.isTTY. */
  isStdinTTY?: boolean
  /** Defaults to process.platform. */
  platform?: string
}

/** Truthy in the shell sense: set, non-empty, not "0"/"false". */
function truthy(v: string | undefined): boolean {
  return v != null && v !== "" && v !== "0" && v.toLowerCase() !== "false"
}

/** chalk-style FORCE_COLOR: 0=none,1=16,2=256,3=truecolor; other-truthy=auto. */
function forceColorLevel(fc: string | undefined, colorterm: string): ColorLevel | null {
  if (fc == null) return null
  if (fc === "0" || fc.toLowerCase() === "false") return "none"
  if (fc === "1") return "ansi16"
  if (fc === "2") return "ansi256"
  if (fc === "3") return "truecolor"
  if (!truthy(fc)) return "none"
  return colorterm.includes("truecolor") || colorterm.includes("24bit") ? "truecolor" : "ansi256"
}

/**
 * Detect terminal capabilities. Order of precedence for color:
 * FORCE_COLOR > NO_COLOR > TERM=dumb > non-TTY > COLORTERM/TERM heuristic.
 */
export function detectTerminalCapabilities(input: DetectInput = {}): TerminalCapabilities {
  const env = input.env ?? (process.env as Record<string, string | undefined>)
  const isTTY = input.isTTY ?? Boolean((process.stdout as { isTTY?: boolean })?.isTTY)
  const isStdinTTY = input.isStdinTTY ?? Boolean((process.stdin as { isTTY?: boolean })?.isTTY)
  const platform = input.platform ?? process.platform

  const term = (env.TERM ?? "").toLowerCase()
  const colorterm = (env.COLORTERM ?? "").toLowerCase()

  const isCI =
    truthy(env.CI) ||
    "GITHUB_ACTIONS" in env ||
    "GITLAB_CI" in env ||
    "BUILDKITE" in env ||
    truthy(env.TF_BUILD)

  // ----- color level -----
  const forced = forceColorLevel(env.FORCE_COLOR, colorterm)
  const noColor = env.NO_COLOR != null // NO_COLOR spec: presence (any value) disables
  let color: ColorLevel
  if (forced != null) {
    color = forced
  } else if (noColor || term === "dumb") {
    color = "none"
  } else if (!isTTY) {
    // Piped/redirected output: no color unless explicitly forced above.
    color = "none"
  } else if (colorterm.includes("truecolor") || colorterm.includes("24bit")) {
    color = "truecolor"
  } else if (term.includes("256")) {
    color = "ansi256"
  } else if (/color|xterm|screen|tmux|vt100|ansi|rxvt|linux|alacritty|kitty|wezterm|konsole/.test(term)) {
    color = "ansi16"
  } else {
    // Interactive but unknown terminal: assume modern (most are 256+).
    color = "ansi256"
  }

  // ----- unicode (glyphs / box-drawing) -----
  const locale = (env.LC_ALL || env.LC_CTYPE || env.LANG || "").toLowerCase()
  const utf8 = locale.includes("utf-8") || locale.includes("utf8")
  let unicode: boolean
  if (truthy(env.OCLOOP_ASCII)) {
    unicode = false // explicit operator override
  } else if (truthy(env.OCLOOP_UNICODE)) {
    unicode = true
  } else if (term === "dumb") {
    unicode = false
  } else if (!isTTY) {
    unicode = utf8 // piped output: only when the locale advertises UTF-8
  } else if (platform === "win32") {
    // Modern Windows Terminal / conhost render UTF-8; legacy CMD users can set
    // OCLOOP_ASCII=1. WT_SESSION is a definitive Windows Terminal signal.
    unicode = true
  } else {
    // Interactive Unix TTY: assume UTF-8 (overridable via OCLOOP_ASCII=1).
    unicode = true
  }

  return {
    color,
    unicode,
    isTTY,
    isInteractive: isTTY && isStdinTTY,
    isCI,
  }
}
