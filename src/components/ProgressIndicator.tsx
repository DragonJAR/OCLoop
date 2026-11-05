import { createMemo } from "solid-js"
import { useTheme } from "../context/ThemeContext"
import { glyph } from "../lib/glyphs"

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
  const { theme, unicode } = useTheme()

  // Clamp the ratio to [0,1] so an over-/under-count never produces a bar
  // longer than `width` or a negative repeat() (which throws RangeError).
  // Non-finite total (NaN/Infinity) or width falls back to the empty/1-ratio
  // path instead of propagating NaN (Math.max(0, NaN) === NaN).
  const ratio = createMemo(() => {
    if (!Number.isFinite(props.total) || !Number.isFinite(props.completed)) return 0
    if (props.total === 0) return 1
    return Math.min(1, Math.max(0, props.completed / props.total))
  })

  const percentage = createMemo(() => Math.round(ratio() * 100))

  const filledWidth = createMemo(() =>
    Number.isFinite(props.width) ? Math.round(ratio() * props.width) : 0,
  )

  const emptyWidth = createMemo(() =>
    Number.isFinite(props.width) ? Math.max(0, props.width - filledWidth()) : props.width,
  )

  const filledChars = createMemo(() => {
    return glyph("progressFull", unicode()).repeat(filledWidth())
  })

  const emptyChars = createMemo(() => {
    return glyph("progressEmpty", unicode()).repeat(emptyWidth())
  })

  return (
    <text>
      <span style={{ fg: theme().primary }}>{filledChars()}</span>
      <span style={{ fg: theme().borderSubtle }}>{emptyChars()}</span>
      <span style={{ fg: theme().text }}> {percentage()}%</span>
    </text>
  )
}
