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
  })

  // Calculate dialog height based on content
  const dialogHeight = () => {
    // Base: header + source badge + message + actions + padding
    let height = 8

    // Add extra height for longer messages (rough estimate)
    const messageLines = Math.ceil(props.message.length / 50)
    if (messageLines > 1) {
      height += messageLines - 1
    }

    return Math.max(9, height)
  }

  return (
    <Dialog onClose={props.onQuit} width={60} height={dialogHeight()}>
      <box style={{ flexDirection: "column" }}>
        {/* Header */}
        <box style={{ width: "100%", justifyContent: "space-between", marginBottom: 1 }}>
          <text>
            <span style={{ fg: theme().error, bold: true }}>{t("dlgErrorTitle")}</span>
          </text>
          <text>
            <span style={{ fg: theme().textMuted }}>esc</span>
          </text>
        </box>

        {/* Source badge and message */}
        <text style={{ marginTop: 1 }}>
          <span style={{ fg: theme().backgroundElement, bg: theme().error }}> {props.source} </span>
          <span style={{ fg: theme().text }}> {props.message}</span>
        </text>

        {/* Actions */}
        <text style={{ marginTop: 2 }}>
          <Show when={props.recoverable}>
            <span style={{ bold: true }}>{t("dlgRetry")}</span> R
            <span style={{ fg: theme().textMuted }}>  </span>
          </Show>
          <span style={{ bold: true }}>{t("dlgQuitConfirm")}</span> Q
        </text>
      </box>
    </Dialog>
  )
}
