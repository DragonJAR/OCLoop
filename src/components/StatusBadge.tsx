import { createMemo } from "solid-js"
import type { LoopState } from "../types"
import { useTheme } from "../context/ThemeContext"
import { glyph, type GlyphName } from "../lib/glyphs"
import { t } from "../lib/i18n"

type BadgeColorKey = "success" | "warning" | "error" | "info" | "primary"

/** Map a loop state to its glyph, localized label, and semantic color token. */
function badgeFor(state: LoopState): { glyph: GlyphName; text: string; colorKey: BadgeColorKey } {
  switch (state.type) {
    case "starting": return { glyph: "stateStarting", text: t("badgeStarting"), colorKey: "warning" }
    case "ready": return { glyph: "stateReady", text: t("badgeReady"), colorKey: "info" }
    case "running": return { glyph: "stateRunning", text: t("badgeRunning"), colorKey: "success" }
    case "pausing": return { glyph: "statePausing", text: t("badgePausing"), colorKey: "warning" }
    case "paused": return { glyph: "statePaused", text: t("badgePaused"), colorKey: "warning" }
    case "cooldown": return { glyph: "stateCooldown", text: t("badgeCooldown"), colorKey: "warning" }
    case "stopping": return { glyph: "stateStopping", text: t("badgeStopping"), colorKey: "error" }
    case "stopped": return { glyph: "stateStopped", text: t("badgeStopped"), colorKey: "error" }
    case "complete": return { glyph: "stateComplete", text: t("badgeComplete"), colorKey: "success" }
    case "error": return { glyph: "stateError", text: t("badgeError"), colorKey: "error" }
    case "debug": return { glyph: "stateDebug", text: t("badgeDebug"), colorKey: "info" }
    default: return { glyph: "stateUnknown", text: t("badgeUnknown"), colorKey: "info" }
  }
}

export interface StatusBadgeProps {
  state: LoopState
}

/**
 * `[<icon> STATE]` status badge — bold, semantic theme color, with a Unicode
 * glyph that degrades to ASCII when the terminal can't render it.
 */
export function StatusBadge(props: StatusBadgeProps) {
  const { theme, unicode } = useTheme()
  const badge = createMemo(() => badgeFor(props.state))
  return (
    <text>
      <span style={{ fg: theme()[badge().colorKey], bold: true }}>
        [{glyph(badge().glyph, unicode())} {badge().text}]
      </span>
    </text>
  )
}
