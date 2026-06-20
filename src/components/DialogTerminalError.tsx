import { Dialog } from "../ui/Dialog"
import { DialogHeader } from "../ui/DialogControls"
import { useTheme } from "../context/ThemeContext"
import { getConfigPath } from "../lib/config"
import { t } from "../lib/i18n"
import { useKeyboard } from "@opentui/solid"

/**
 * Props for the DialogTerminalError component
 */
export interface DialogTerminalErrorProps {
  /** Name of the terminal that failed to launch */
  terminalName: string
  /** Error message from the launch attempt */
  errorMessage: string
  /** The attach command for manual use */
  attachCommand: string
  /** Callback when copy command is requested */
  onCopy: () => void
  /** Callback when dialog should close */
  onClose: () => void
}

/**
 * DialogTerminalError Component
 *
 * Shows an error dialog when terminal launch fails,
 * suggesting fixes and providing the attach command.
 */
export function DialogTerminalError(props: DialogTerminalErrorProps) {
  const { theme } = useTheme()

  useKeyboard((key) => {
    // C - copy
    if (key.name === "c" || key.sequence === "C") {
      props.onCopy()
      return
    }
    // Escape or Enter - close
    if (key.name === "escape" || key.name === "return") {
      props.onClose()
      return
    }
  })

  // Fixed dialog height: header + terminal badge + a capped error area +
  // config hint + command + footer + padding. The error message lives in a
  // scrollbox (below) that wraps and scrolls, so the height no longer depends
  // on guessing wrap-line counts from message length — that guess previously
  // inflated the box while the error rendered as a single unwrapped line that
  // overflowed horizontally. Shares the error-family height with DialogError.
  const dialogHeight = 14

  const configPath = getConfigPath()

  return (
    <Dialog onClose={props.onClose} width={60} height={dialogHeight}>
      <box style={{ flexDirection: "column" }}>
        {/* Header */}
        <DialogHeader title={t("dlgTerminalFailed")} accent={theme().error} hint="esc" />

        {/* Terminal name */}
        <text style={{ marginTop: 1 }}>
          <span style={{ fg: theme().backgroundElement, bg: theme().error }}> {props.terminalName} </span>
        </text>

        {/* Error message — scrollbox so a long launch error wraps and scrolls
            instead of overflowing the dialog width on a single line. */}
        <scrollbox
          marginTop={1}
          maxHeight={4}
          verticalScrollbarOptions={{
            visible: true,
            trackOptions: {
              backgroundColor: theme().backgroundPanel,
              foregroundColor: theme().borderSubtle,
            },
          }}
        >
          <text>
            <span style={{ fg: theme().text }}>{props.errorMessage}</span>
          </text>
        </scrollbox>

        {/* Config hint */}
        <text style={{ marginTop: 1 }}>
          <span style={{ fg: theme().textMuted }}>{t("dlgEditConfig")}</span>
          <span style={{ fg: theme().accent }}>{configPath}</span>
        </text>

        {/* Attach command */}
        <text style={{ marginTop: 1 }}>
          <span style={{ fg: theme().textMuted }}>{t("dlgAttachCommand")}</span>
        </text>
        <text>
          <span style={{ fg: theme().text }}>{props.attachCommand}</span>
        </text>

        {/* Footer — a flex row so the chips space via `gap` instead of literal
            "  " spacer spans. */}
        <box style={{ flexDirection: "row", gap: 2, marginTop: 1 }}>
          <text>
            <span style={{ bold: true }}>{t("dlgCopy")}</span> C
          </text>
          <text>
            <span style={{ bold: true }}>{t("dlgClose")}</span> esc
          </text>
        </box>
      </box>
    </Dialog>
  )
}
