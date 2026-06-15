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
import {
  getResolvedTheme,
  isValidTheme,
  type ThemeColors,
  type ThemeMode,
} from "../lib/theme-resolver"
import { DEFAULT_THEME } from "../lib/themes"
import { loadConfig } from "../lib/config"

/**
 * Value provided by the ThemeContext
 */
export interface ThemeContextValue {
  /** Resolved theme colors (hex values) */
  theme: () => ThemeColors
  /** Current theme mode (dark/light) */
  mode: () => ThemeMode
  /** Name of the current theme */
  themeName: () => string
}

/**
 * Default theme colors for SSR/initial render
 */
const defaultTheme = getResolvedTheme(DEFAULT_THEME, "dark")

/**
 * The Theme Context
 */
const ThemeContext = createContext<ThemeContextValue>({
  theme: () => defaultTheme,
  mode: () => "dark" as ThemeMode,
  themeName: () => DEFAULT_THEME,
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
 * Uses XDG_STATE_HOME if set, otherwise ~/.local/state
 */
function getKVPath(): string {
  const xdgState = process.env.XDG_STATE_HOME
  const home = process.env.HOME || process.env.USERPROFILE || ""

  const stateDir = xdgState || `${home}/.local/state`
  return `${stateDir}/opencode/kv.json`
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

    const resolvedColors = getResolvedTheme(selectedTheme, selectedMode)

    setTheme(resolvedColors)
    setMode(selectedMode)
    setThemeName(selectedTheme)
  })

  const value: ThemeContextValue = {
    theme,
    mode,
    themeName,
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

/**
 * Calculate appropriate text color for a selected item background
 *
 * Uses basic relative luminance calculation to determine if the background
 * color is light or dark, and returns contrasting text color.
 *
 * @param theme The current theme colors
 * @returns Hex color string for the text (either primary or secondary text color)
 */
export function selectedForeground(theme: ThemeColors): string {
  // Parse hex color to RGB
  const hex = theme.primary.replace("#", "")
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  // Calculate relative luminance (perceived brightness)
  // Formula: 0.299R + 0.587G + 0.114B
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  // If background is light (> 0.5), use dark text
  // If background is dark (<= 0.5), use light text
  return luminance > 0.5 ? "#000000" : "#FFFFFF"
}
