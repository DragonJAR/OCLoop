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
import { selectedForeground } from "../lib/theme-resolver"

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
