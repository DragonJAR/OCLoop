/**
 * Theme Context Provider
 *
 * Provides theme colors to the GUI. Defaults to the DragonJAR brand theme,
 * overridable via `theme` in ~/.config/ocloop/ocloop.json. The light/dark mode
 * is still synced from OpenCode's ~/.local/state/opencode/kv.json when present.
 *
 * Falls back to the DragonJAR theme in dark mode if anything is missing/invalid.
 */

import { createContext, useContext, createSignal, onMount, type JSX } from "solid-js"
import { join } from "node:path"
import {
  getResolvedTheme,
  isValidTheme,
  toMonochrome,
  type ThemeColors,
  type ThemeMode,
} from "../lib/theme-resolver"
import { DEFAULT_THEME } from "../lib/themes"
import { loadConfig } from "../lib/config"
import { detectTerminalCapabilities, type TerminalCapabilities } from "../lib/term-caps"

/**
 * Terminal capabilities (color depth, Unicode support, TTY) — detected ONCE at
 * startup; they don't change during a run. Drives color degradation and glyph
 * fallbacks across the UI.
 */
const termCaps = detectTerminalCapabilities()

/** Collapse to monochrome when the terminal can't/shouldn't use color. */
function applyCaps(colors: ThemeColors): ThemeColors {
  return termCaps.color === "none" ? toMonochrome(colors) : colors
}

/**
 * Value provided by the ThemeContext
 */
export interface ThemeContextValue {
  /** Resolved theme colors (hex values; monochrome when color is unsupported) */
  theme: () => ThemeColors
  /** Current theme mode (dark/light) */
  mode: () => ThemeMode
  /** Name of the current theme */
  themeName: () => string
  /** Whether to draw Unicode glyphs (else ASCII fallbacks — see glyphs.ts) */
  unicode: () => boolean
  /** Detected terminal capabilities (color level, unicode, TTY, CI) */
  caps: () => TerminalCapabilities
}

/**
 * Default theme colors for SSR/initial render (capability-adjusted)
 */
const defaultTheme = applyCaps(getResolvedTheme(DEFAULT_THEME, "dark"))

/**
 * The Theme Context
 */
const ThemeContext = createContext<ThemeContextValue>({
  theme: () => defaultTheme,
  mode: () => "dark" as ThemeMode,
  themeName: () => DEFAULT_THEME,
  unicode: () => termCaps.unicode,
  caps: () => termCaps,
})

/**
 * OpenCode's kv.json structure (partial - only what we need)
 */
interface OpenCodeKV {
  theme?: string
  theme_mode?: "dark" | "light"
}

/**
 * Get the path to OpenCode's kv.json file
 *
 * Uses XDG_STATE_HOME if set, otherwise ~/.local/state. Built with `path.join`
 * so the separators are correct on every platform: the previous string
 * concatenation (`${home}/.local/state`) produced mixed forward+back slashes
 * on Windows (`C:\Users\foo/.local/state/...`), which Node/Bun tolerate on
 * read but which can confuse other tools and look broken in error messages.
 * `HOME || USERPROFILE` covers Unix and Windows home resolution. OpenCode
 * itself uses the XDG `~/.local/state/opencode` convention on all platforms,
 * so the directory layout is kept consistent with it (we read a file it
 * writes).
 */
function getKVPath(): string {
  const xdgState = process.env.XDG_STATE_HOME
  const home = process.env.HOME || process.env.USERPROFILE || ""

  const stateDir = xdgState || join(home, ".local", "state")
  return join(stateDir, "opencode", "kv.json")
}

/**
 * Read theme preferences from OpenCode's kv.json
 *
 * Returns null if file doesn't exist or can't be parsed
 */
async function readOpenCodePreferences(): Promise<OpenCodeKV | null> {
  try {
    const kvPath = getKVPath()
    const file = Bun.file(kvPath)

    if (!(await file.exists())) {
      return null
    }

    const content = await file.text()
    const data = JSON.parse(content) as OpenCodeKV
    return data
  } catch {
    // File doesn't exist, can't be read, or isn't valid JSON
    return null
  }
}

/**
 * Props for ThemeProvider
 */
export interface ThemeProviderProps {
  children: JSX.Element
}

/**
 * Theme Provider Component
 *
 * Wraps the application and provides theme colors via context.
 * Automatically reads the user's OpenCode theme preferences on mount.
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider(props: ThemeProviderProps) {
  const [theme, setTheme] = createSignal<ThemeColors>(defaultTheme)
  const [mode, setMode] = createSignal<ThemeMode>("dark")
  const [themeName, setThemeName] = createSignal<string>(DEFAULT_THEME)

  onMount(async () => {
    // Brand-first: default to the DragonJAR theme. A user can override the GUI
    // theme via `theme` in ~/.config/ocloop/ocloop.json. We intentionally do NOT
    // inherit OpenCode's theme *name* (that would override the brand), but we DO
    // still respect its light/dark mode so the GUI matches the user's preference.
    const kv = await readOpenCodePreferences()
    const ocloop = loadConfig()

    const requested = ocloop.theme
    const selectedTheme =
      requested && isValidTheme(requested) ? requested : DEFAULT_THEME
    const selectedMode: ThemeMode = kv?.theme_mode || "dark"

    const resolvedColors = applyCaps(getResolvedTheme(selectedTheme, selectedMode))

    setTheme(resolvedColors)
    setMode(selectedMode)
    setThemeName(selectedTheme)
  })

  const value: ThemeContextValue = {
    theme,
    mode,
    themeName,
    unicode: () => termCaps.unicode,
    caps: () => termCaps,
  }

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access the current theme
 *
 * @returns ThemeContextValue with theme colors, mode, and theme name
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { theme, mode } = useTheme()
 *
 *   return (
 *     <box style={{ color: theme().primary }}>
 *       Current mode: {mode()}
 *     </box>
 *   )
 * }
 * ```
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
