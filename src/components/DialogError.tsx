import { Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "../ui/Dialog"
import { useTheme } from "../context/ThemeContext"
import { t } from "../lib/i18n"

export interface DialogErrorProps {
  source: string
  message: string
  recoverable: boolean
  onRetry?: () => void
  /** When set, offers a "P" action to split the stalled task into subtasks. */
  onDecompose?: () => void
  onQuit: () => void
}

export function DialogError(props: DialogErrorProps) {
  const { theme } = useTheme()

  // Own the keyboard while open. The global handler in App ignores input when a
  // dialog is shown, so retry/quit MUST be handled here (R only when recoverable).
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "q") {
      props.onQuit()
      return
    }
    if (props.recoverable && key.name === "r") {
      props.onRetry?.()
      return
    }
    if (props.onDecompose && key.name === "p") {
      props.onDecompose()
      return
    }
  })

  // Fixed dialog height: header + source badge + a capped message area +
  // actions + padding. The message lives in a scrollbox (below) that wraps and
  // scrolls, so the height no longer depends on guessing wrap-line counts from
  // message length — that guess previously inflated the box while the message
  // rendered as a single unwrapped line that overflowed horizontally.
  const dialogHeight = 14

  return (
    <Dialog onClose={props.onQuit} width={60} height={dialogHeight}>
      <box style={{ flexDirection: "column" }}>
        {/* Header */}
        <box style={{ width: "100%", justifyContent: "space-between", marginBottom: 1 }}>
          <text>
            <span style={{ fg: theme().error, bold: true }}>{t("errorTitle")}</span>
          </text>
          <text>
            <span style={{ fg: theme().textMuted }}>esc</span>
          </text>
        </box>

        {/* Source badge */}
        <text style={{ marginTop: 1 }}>
          <span style={{ fg: theme().backgroundElement, bg: theme().error }}> {props.source} </span>
        </text>

        {/* Message — scrollbox so a long error (API JSON, stack trace, SSE
            body) wraps and scrolls instead of overflowing the dialog width
            on a single line. Mirrors DialogCompletion's summary handling. */}
        <scrollbox
          marginTop={1}
          maxHeight={6}
          verticalScrollbarOptions={{
            visible: true,
            trackOptions: {
              backgroundColor: theme().backgroundPanel,
              foregroundColor: theme().borderSubtle,
            },
          }}
        >
          <text>
            <span style={{ fg: theme().text }}>{props.message}</span>
          </text>
        </scrollbox>

        {/* Actions */}
        <text style={{ marginTop: 2 }}>
          <Show when={props.recoverable}>
            <span style={{ bold: true }}>{t("dlgRetry")}</span> R
            <span style={{ fg: theme().textMuted }}>  </span>
          </Show>
          <Show when={props.onDecompose}>
            <span style={{ bold: true }}>{t("dlgSplitTask")}</span> P
            <span style={{ fg: theme().textMuted }}>  </span>
          </Show>
          <span style={{ bold: true }}>{t("dlgQuitConfirm")}</span> Q
        </text>
      </box>
    </Dialog>
  )
}
