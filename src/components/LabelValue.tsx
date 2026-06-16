import { useTheme } from "../context/ThemeContext"

/**
 * Muted label + value — the atom repeated across the Dashboard rows and the
 * bottom panel. Single source of truth so spacing, color hierarchy (muted label /
 * bright value) and theming stay consistent everywhere.
 */
export interface LabelValueProps {
  label: string
  value: string | number
  /** Value color override (defaults to theme().text). */
  valueColor?: string
  /** Leading gap between inline items (Dashboard rows use 2; first item 0). */
  marginLeft?: number
  /** Trailing gap (bottom-panel chips use 2). */
  marginRight?: number
}

export function LabelValue(props: LabelValueProps) {
  const { theme } = useTheme()
  return (
    <text style={{ marginLeft: props.marginLeft ?? 0, marginRight: props.marginRight ?? 0 }}>
      <span style={{ fg: theme().textMuted }}>{props.label}</span>
      <span style={{ fg: props.valueColor ?? theme().text }}> {props.value}</span>
    </text>
  )
}
