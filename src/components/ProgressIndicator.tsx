import { createMemo } from "solid-js"
import { useTheme } from "../context/ThemeContext"

/**
 * Props for the ProgressIndicator component
 */
export interface ProgressIndicatorProps {
  completed: number
  total: number
  width: number
}

/**
 * ProgressIndicator component
 *
 * Renders a progress bar with percentage display.
 * Uses block characters for filled and light shade for empty portions.
 * Colors are derived from the current theme.
 *
 * @example
 * ```tsx
 * <ProgressIndicator completed={4} total={10} width={20} />
 * // Renders: ████████░░░░░░░░░░░░ 40%
 * ```
 */
export function ProgressIndicator(props: ProgressIndicatorProps) {
  const { theme } = useTheme()

  // Clamp the ratio to [0,1] so an over-/under-count never produces a bar
  // longer than `width` or a negative repeat() (which throws RangeError).
  const ratio = createMemo(() => {
    if (props.total === 0) return 1
    return Math.min(1, Math.max(0, props.completed / props.total))
  })

  const percentage = createMemo(() => Math.round(ratio() * 100))

  const filledWidth = createMemo(() => Math.round(ratio() * props.width))

  const emptyWidth = createMemo(() => Math.max(0, props.width - filledWidth()))

  const filledChars = createMemo(() => {
    return "█".repeat(filledWidth())
  })

  const emptyChars = createMemo(() => {
    return "░".repeat(emptyWidth())
  })

  return (
    <text>
      <span style={{ fg: theme().primary }}>{filledChars()}</span>
      <span style={{ fg: theme().borderSubtle }}>{emptyChars()}</span>
      <span style={{ fg: theme().text }}> {percentage()}%</span>
    </text>
  )
}
