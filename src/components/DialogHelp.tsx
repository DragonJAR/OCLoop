import { For, createMemo } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "../ui/Dialog"
import { DialogHeader, dialogScrollbarOptions } from "../ui/DialogControls"
import { useTheme } from "../context/ThemeContext"
import { t } from "../lib/i18n"

/**
 * Props for the DialogHelp component
 */
export interface DialogHelpProps {
  onClose: () => void
}

/**
 * A { key, desc } pair in the help listing. `desc` is an already-localized
 * string (the caller passes `t("...")` results in), so the component itself
 * stays free of i18n branching.
 */
interface HelpRow {
  key: string
  desc: string
}

/**
 * Help / keybindings overlay, opened with the `?` key.
 *
 * Lists the direct keyboard shortcuts grouped by context, plus a one-line
 * explanation of what OCLoop does. Doubles as the first-run orientation: a
 * new user pressing `?` gets the full picture in one place, instead of having
 * to guess from the state-specific footer (which only shows ~4 keys for the
 * current state).
 *
 * Any key closes it (in addition to the Dialog backdrop/Escape), so there's
 * no "how do I dismiss this" confusion.
 */
/**
 * Rows the surrounding chrome occupies outside the scrollable sections: the
 * dialog's own vertical padding, the header (title + gap) and the intro line
 * (its text + its gap). Measured against the renderer.
 */
const HELP_CHROME_ROWS = 9

export function DialogHelp(props: DialogHelpProps) {
  const { theme } = useTheme()

  // Any key dismisses the help overlay. Escape is also handled by the Dialog
  // backdrop, but handling every key here means a user who pressed `?` can
  // press anything (incl. `?` again) to leave — no dead keys.
  useKeyboard((key) => {
    props.onClose()
    key.preventDefault()
  })

  // Loop control — the keys that drive the iteration lifecycle.
  const loopKeys: HelpRow[] = [
    { key: "S", desc: t("cmdStart") },
    { key: "Space", desc: t("cmdPause") + " / " + t("cmdResume") },
    { key: "Q", desc: t("cmdQuit") },
    { key: "R", desc: t("hintRetry") + " (" + t("badgeError") + ")" },
  ]

  // Session / terminal — keys that act on the active session.
  const sessionKeys: HelpRow[] = [
    { key: "C", desc: t("cmdCopyAttach") },
    { key: "T", desc: t("cmdChooseTerminal") },
    { key: "Ctrl+P", desc: t("hintCommands") },
    { key: "↑/↓", desc: t("hintScroll") },
  ]

  // Debug-only keys (visible regardless of state, since `?` works in debug).
  const debugKeys: HelpRow[] = [
    { key: "N", desc: t("hintNewSession") },
    { key: "P", desc: t("hintPrompt") },
    { key: "I", desc: t("hintSampleActivity") },
  ]

  const Section = (props: { title: string; rows: HelpRow[] }) => (
    <box style={{ flexDirection: "column", marginBottom: 1 }}>
      <text>
        <span style={{ fg: theme().accent, bold: true }}>{props.title}</span>
      </text>
      <For each={props.rows}>
        {(row) => (
          <text>
            <span style={{ fg: theme().textMuted, bold: true }}>
              {`  ${row.key.padEnd(8)}`}
            </span>
            <span style={{ fg: theme().text }}>{row.desc}</span>
          </text>
        )}
      </For>
    </box>
  )

  /**
   * Rows one section occupies: its title, the gap below it and its key rows.
   * Derived from the row lists so adding a shortcut cannot silently push the
   * last row of the help below the fold.
   */
  const sectionRows = (rows: HelpRow[]) => 2 + rows.length

  const contentRows = createMemo(
    () =>
      sectionRows(loopKeys) + sectionRows(sessionKeys) + sectionRows(debugKeys),
  )

  return (
    <Dialog onClose={props.onClose} width={72} height={HELP_CHROME_ROWS + contentRows()}>
      <box style={{ flexDirection: "column" }}>
        {/* Header */}
        <DialogHeader title={t("helpTitle")} accent={theme().accent} hint={t("helpDismissHint")} />

        {/* Intro */}
        <text style={{ marginBottom: 1 }}>
          <span style={{ fg: theme().text }}>{t("helpIntro")}</span>
        </text>

        {/* Sections in a scrollbox so they fit any terminal height */}
        {/* Explicit height: the sections do not depend on how many rows the
            chrome around them takes, so the last shortcut cannot fall below
            the fold. */}
        <scrollbox
          height={contentRows()}
          flexShrink={0}
          maxHeight={contentRows()}
          verticalScrollbarOptions={dialogScrollbarOptions(theme())}
        >
          <Section title={t("helpSectionLoop")} rows={loopKeys} />
          <Section title={t("helpSectionSession")} rows={sessionKeys} />
          <Section title={t("helpSectionDebug")} rows={debugKeys} />
        </scrollbox>
      </box>
    </Dialog>
  )
}
