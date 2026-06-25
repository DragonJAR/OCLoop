/**
 * Shared dialog primitives.
 *
 * Extracted from the header and button blocks that were copy-pasted across the
 * dialogs. These emit the same element tree as the hand-rolled originals (the
 * header's optional `accent`/`icon`/`iconColor` cover the few dialogs whose
 * title carried a color or glyph), so applying them is a de-duplication with no
 * visual change.
 *
 * Dialogs with a genuinely divergent shape (e.g. the terminal dialogs' custom
 * forms) keep their own markup — folding them in here would change behavior.
 */

import { useTheme } from "../context/ThemeContext"
import { selectedForeground, type ThemeColors } from "../lib/theme-resolver"

/**
 * Shared `verticalScrollbarOptions` for dialog scrollboxes.
 *
 * The exact same block (visible bar + panel/borderSubtle track colors) was
 * copy-pasted across 8 dialogs; styling drift was inevitable. Single-sourcing
 * it here means a scrollbar theme change touches one place. Pass the current
 * theme snapshot (each dialog already reads `theme()` from useTheme).
 */
export function dialogScrollbarOptions(theme: ThemeColors): {
  visible: true
  trackOptions: { backgroundColor: string; foregroundColor: string }
} {
  return {
    visible: true,
    trackOptions: {
      backgroundColor: theme.backgroundPanel,
      foregroundColor: theme.borderSubtle,
    },
  }
}

/**
 * Dialog header: bold title on the left, a muted key hint on the right.
 * `hint` defaults to "esc" (the near-universal dismiss key).
 *
 * Optional `accent` overrides the title color (default `theme().text`) and
 * optional `icon` renders a glyph before the title (e.g. "✓"). The icon adopts
 * the title `accent` unless `iconColor` is given, so a header whose glyph has a
 * distinct hue from its title (e.g. a green ✓ before a primary-colored title)
 * keeps that split. With all three absent the output is byte-identical to the
 * original two-element header.
 */
export function DialogHeader(props: {
  title: string
  hint?: string
  accent?: string
  icon?: string
  iconColor?: string
}) {
  const { theme } = useTheme()
  const titleColor = () => props.accent ?? theme().text
  return (
    <box
      style={{
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 1,
      }}
    >
      <text>
        {props.icon ? (
          <span style={{ bold: true, fg: props.iconColor ?? titleColor() }}>
            {`${props.icon} `}
          </span>
        ) : null}
        <span style={{ bold: true, fg: titleColor() }}>{props.title}</span>
      </text>
      <text>
        <span style={{ fg: theme().textMuted }}>{props.hint ?? "esc"}</span>
      </text>
    </box>
  )
}

/**
 * A selectable dialog button. When `active`, it fills with the primary color
 * and uses the selected foreground; otherwise it shows muted text.
 */
export function DialogButton(props: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  return (
    <box
      style={{
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: props.active ? theme().primary : undefined,
      }}
      onMouseUp={() => props.onPress()}
    >
      <text>
        <span
          style={{
            fg: props.active ? selectedForeground(theme()) : theme().textMuted,
          }}
        >
          {props.label}
        </span>
      </text>
    </box>
  )
}

/**
 * A checkbox-style toggle row for settings dialogs. Shows a `[x]`/`[ ]` glyph
 * (driven by `checked`) plus a label and optional description. When `active`
 * (keyboard focus), the row fills with the primary color like `DialogButton`.
 * `onToggle` fires on click; the caller owns the checked state.
 */
export function DialogToggleRow(props: {
  label: string
  description?: string
  checked: boolean
  active: boolean
  onToggle: () => void
}) {
  const { theme } = useTheme()
  const fg = () => (props.active ? selectedForeground(theme()) : theme().text)
  const descFg = () => (props.active ? selectedForeground(theme()) : theme().textMuted)
  // Indent label and description past the 3-char `[x] ` glyph so they align on
  // a clean left edge; without it the description sat flush under the glyph and
  // the row read as one cramped block.
  const indent = "    "
  return (
    <box
      style={{
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: props.active ? theme().primary : undefined,
      }}
      onMouseUp={() => props.onToggle()}
    >
      <text>
        <span style={{ fg: fg(), bold: true }}>
          {props.checked ? "[x]" : "[ ]"}
        </span>
        <span style={{ fg: fg() }}> {props.label}</span>
      </text>
      {props.description ? (
        <text>
          <span style={{ fg: descFg() }}>
            {indent}
            {props.description}
          </span>
        </text>
      ) : null}
    </box>
  )
}
