/**
 * Shared dialog primitives.
 *
 * Extracted from the byte-identical header and button blocks that were
 * copy-pasted across DialogAlert / DialogConfirm / DialogInvalidAgent. These
 * emit exactly the same element tree as the originals, so applying them is a
 * pure de-duplication with no visual change.
 *
 * Dialogs with a divergent button/header shape (e.g. DialogCompletion's
 * span-less buttons, the terminal dialogs' custom forms) intentionally keep
 * their own markup — folding them in here would change their behavior.
 */

import { useTheme } from "../context/ThemeContext"
import { selectedForeground } from "../lib/theme-resolver"

/**
 * Dialog header: bold title on the left, a muted key hint on the right.
 * `hint` defaults to "esc" (the near-universal dismiss key).
 */
export function DialogHeader(props: { title: string; hint?: string }) {
  const { theme } = useTheme()
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
        <span style={{ bold: true, fg: theme().text }}>{props.title}</span>
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
