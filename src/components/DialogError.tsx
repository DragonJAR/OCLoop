import { Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "../ui/Dialog"
import { DialogHeader } from "../ui/DialogControls"
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
        <DialogHeader title={t("errorTitle")} accent={theme().error} hint="esc" />

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

        {/* Actions — a flex row so the chips space evenly via `gap` instead of
            literal "  " spacer spans. */}
        <box style={{ flexDirection: "row", gap: 2, marginTop: 1 }}>
          <Show when={props.recoverable}>
            <text>
              <span style={{ bold: true }}>{t("dlgRetry")}</span> R
            </text>
          </Show>
          <Show when={props.onDecompose}>
            <text>
              <span style={{ bold: true }}>{t("dlgSplitTask")}</span> P
            </text>
          </Show>
          <text>
            <span style={{ bold: true }}>{t("dlgQuitConfirm")}</span> Q
          </text>
        </box>
      </box>
    </Dialog>
  )
}
