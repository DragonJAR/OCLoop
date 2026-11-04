import { Dialog } from "../ui/Dialog"
import { DialogHeader, dialogScrollbarOptions } from "../ui/DialogControls"
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

  const configPath = getConfigPath()

  // Rows the dialog needs. The height is DERIVED from the content instead of
  // guessed: a dialog shorter than its content makes the layout engine
  // compress its children and stack them on the same row, and two texts
  // sharing a row corrupt each other — opentui does not paint the blank
  // cells of an overlapping text, so the command rendered as
  // "opencodedattachxhttp://…" with the neighbouring row's glyphs in its
  // spaces. (This dialog was 14 rows tall while its content needed 19.)
  //
  //   header (title + gap)                    2
  //   terminal badge (gap + row)              2
  //   error message (gap + capped area)       5
  //   config hint (gap + wrapped rows)        1 + configRows
  //   attach label (gap + row)                2
  //   attach command (wrapped rows)           commandRows
  //   footer (gap + row)                      2
  //   the dialog's own vertical padding       2
  const DIALOG_WIDTH = 60
  const CONTENT_WIDTH = DIALOG_WIDTH - 2
  const rowsFor = (text: string) => Math.max(1, Math.ceil(text.length / CONTENT_WIDTH))
  const configRows = rowsFor(`${t("dlgEditConfig")}${configPath}`)
  const commandRows = rowsFor(props.attachCommand)
  const dialogHeight =
    2 + 2 + 5 + (1 + configRows) + 2 + commandRows + 2 + 2

  return (
    <Dialog onClose={props.onClose} width={DIALOG_WIDTH} height={dialogHeight}>
      <box style={{ flexDirection: "column" }}>
        {/* Header */}
        <DialogHeader title={t("dlgTerminalFailed")} accent={theme().error} hint={t("dlgEscToQuit")} />

        {/* Terminal name */}
        <text style={{ marginTop: 1 }}>
          <span style={{ fg: theme().backgroundElement, bg: theme().error }}> {props.terminalName} </span>
        </text>

        {/* Error message — scrollbox so a long launch error wraps and scrolls
            instead of overflowing the dialog width on a single line. */}
        <scrollbox
          marginTop={1}
          maxHeight={4}
          verticalScrollbarOptions={dialogScrollbarOptions(theme())}
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
        <text style={{ fg: theme().text }}>{props.attachCommand}</text>

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
