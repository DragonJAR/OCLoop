/**
 * Theme color resolution utility
 *
 * Ported from OpenCode's theme resolution logic.
 * Handles color resolution: hex strings, def references, dark/light variants.
 */

import { type ThemeDefinition, themes, DEFAULT_THEME } from "./themes";
// Re-export so consumers/tests can import the theme shape from this module too.
export type { ThemeDefinition } from "./themes";

/**
 * Resolved theme colors with all semantic tokens as hex strings
 */
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  backgroundPanel: string;
  backgroundElement: string;
  text: string;
  textMuted: string;
  border: string;
  borderActive: string;
  borderSubtle: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export type ThemeMode = "dark" | "light";

/**
 * All semantic color tokens that we need to resolve
 */
const REQUIRED_TOKENS: (keyof ThemeColors)[] = [
  "primary",
  "secondary",
  "accent",
  "background",
  "backgroundPanel",
  "backgroundElement",
  "text",
  "textMuted",
  "border",
  "borderActive",
  "borderSubtle",
  "success",
  "warning",
  "error",
  "info",
];

/**
 * Resolve a single color value from a theme.
 *
 * Values can be:
 * 1. Direct hex strings (e.g., "#282a36")
 * 2. References to defs (e.g., "purple" -> defs.purple)
 * 3. Objects with dark/light variants
 */
function resolveColor(
  value: string | { dark: string; light: string } | undefined,
  defs: Record<string, string>,
  mode: ThemeMode
): string {
  if (!value) {
    return "#808080"; // Fallback gray
  }

  // Handle dark/light variant objects
  if (typeof value === "object" && value !== null) {
    const modeValue = value[mode];
    // The mode value could also be a def reference or hex
    return resolveColorString(modeValue, defs);
  }

  return resolveColorString(value, defs);
}

/**
 * Resolve a color string which can be a hex color or a def reference
 */
function resolveColorString(
  value: string,
  defs: Record<string, string>,
  depth = 0
): string {
  // Depth cap: a cyclic def (a→b→a) would otherwise recurse forever / overflow.
  // 8 is far beyond any legitimate def chain; fall back to neutral grey instead.
  if (!value || depth > 8) {
    return "#808080";
  }

  // If it starts with #, it's already a hex color
  if (value.startsWith("#")) {
    return value;
  }

  // Otherwise, look it up in defs
  const defValue = defs[value];
  if (defValue) {
    // Defs should always be hex values, but handle recursion just in case
    if (defValue.startsWith("#")) {
      return defValue;
    }
    // Recursive lookup (shouldn't normally happen, but be safe)
    return resolveColorString(defValue, defs, depth + 1);
  }

  // Fallback if not found
  return "#808080";
}

/**
 * Resolve a full theme definition into concrete hex colors
 */
export function resolveTheme(
  themeDef: ThemeDefinition,
  mode: ThemeMode = "dark"
): ThemeColors {
  const { defs, theme } = themeDef;

  const resolved: Partial<ThemeColors> = {};

  for (const token of REQUIRED_TOKENS) {
    const value = theme[token];
    resolved[token] = resolveColor(value, defs, mode);
  }

  return resolved as ThemeColors;
}

/**
 * Get a resolved theme by name and mode
 *
 * Falls back to the default theme if the requested theme is not found.
 */
export function getResolvedTheme(
  themeName: string,
  mode: ThemeMode = "dark"
): ThemeColors {
  const themeDef = themes[themeName] ?? themes[DEFAULT_THEME];
  return resolveTheme(themeDef, mode);
}

/**
 * Check if a theme name is valid
 */
export function isValidTheme(themeName: string): boolean {
  return themeName in themes;
}

/**
 * Collapse a resolved theme to monochrome: every foreground token becomes the
 * theme's text color and every background its base background, so color stops
 * conveying meaning. Used when the terminal can't (or shouldn't) use color
 * (NO_COLOR, TERM=dumb, non-interactive output — see term-caps.ts).
 *
 * Caveat: OpenTUI still emits truecolor ANSI for the single fg/bg, so this is
 * "no color *differentiation*", not "no ANSI at all" (OpenTUI exposes no knob to
 * suppress color emission). It satisfies the intent of NO_COLOR for accessibility.
 */
export function toMonochrome(t: ThemeColors): ThemeColors {
  const fg = t.text;
  const bg = t.background;
  return {
    primary: fg,
    secondary: fg,
    accent: fg,
    background: bg,
    backgroundPanel: bg,
    backgroundElement: bg,
    text: fg,
    textMuted: fg,
    border: fg,
    borderActive: fg,
    borderSubtle: fg,
    success: fg,
    warning: fg,
    error: fg,
    info: fg,
  };
}

/**
 * Calculate appropriate text color for a selected item background.
 *
 * Uses basic relative luminance calculation to determine if the background
 * color is light or dark, and returns a contrasting text color
 * (`#000000` for light backgrounds, `#FFFFFF` for dark backgrounds).
 *
 * Lives in `theme-resolver.ts` (a pure `.ts` module) so it can be
 * unit-tested without pulling in the JSX transform from `ThemeContext.tsx`
 * (see `docs/testing.md`: importing a `.tsx` file under
 * `jsxImportSource: "@opentui/solid"` fails in `bun:test` because
 * `solid-js/web`'s JSX runtime is not loadable without a DOM).
 *
 * @param theme The current theme colors
 * @returns Hex color string for the text (either `#000000` or `#FFFFFF`)
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
