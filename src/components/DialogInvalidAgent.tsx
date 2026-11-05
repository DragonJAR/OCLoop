import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "../ui/Dialog"
import { useTheme } from "../context/ThemeContext"
import { DialogHeader, DialogButton, dialogScrollbarOptions } from "../ui/DialogControls"
import { t } from "../lib/i18n"

export interface DialogInvalidAgentProps {
  agentName: string
  availableAgents: string[]
  defaultAgent?: string
  onUseDefault: () => void
  onQuit: () => void
}

/**
 * Rows the chrome around the agent roster occupies: the dialog's own
 * vertical padding, the header, the message, the "available agents" label and
 * the button row.
 */
const CHROME_ROWS = 9

/** The roster is a list of CHOICES: every one of them has to be reachable. */
const MAX_LIST_ROWS = 12

export function DialogInvalidAgent(props: DialogInvalidAgentProps) {
  const { theme } = useTheme()
  const [activeButton, setActiveButton] = createSignal<"default" | "quit">("default")

  /** Rows the roster needs; the dialog grows with it instead of clipping. */
  const listRows = () => Math.min(props.availableAgents.length, MAX_LIST_ROWS)

  useKeyboard((key) => {
    if (key.name === "escape") {
      props.onQuit()
      return
    }

    if (key.name === "return") {
      if (activeButton() === "default") {
        props.onUseDefault()
      } else {
        props.onQuit()
      }
      return
    }

    if (key.name === "left" || key.name === "right") {
      setActiveButton(prev => prev === "default" ? "quit" : "default")
    }
  })

  return (
    <Dialog 
      onClose={() => props.onQuit()} 
      width={60} 
      height={CHROME_ROWS + listRows()}
    >
      <DialogHeader title={t("dlgInvalidAgent")} hint={t("dlgEscToQuit")} />

      {/* Message */}
      <box style={{ flexGrow: 1, marginBottom: 1, flexDirection: "column" }}>
        <text>
          <span style={{ fg: theme().error }}>{t("dlgAgentNotFound", { agent: props.agentName })}</span>
        </text>

        <box style={{ marginTop: 1, flexDirection: "column" }}>
          <text>
            <span style={{ fg: theme().textMuted }}>{t("dlgAvailableAgents")}</span>
          </text>
          {/* The roster gets an explicit height so it shows every agent: with
              a fixed dialog height the last row of a long roster fell under
              the fold and the agent the user actually wanted was the hidden
              one. A roster longer than the cap still scrolls — the dialog is
              clamped to the terminal, so the buttons stay reachable. */}
          <scrollbox
            height={listRows()}
            flexShrink={0}
            maxHeight={listRows()}
            verticalScrollbarOptions={dialogScrollbarOptions(theme())}
          >
            {props.availableAgents.map(agent => (
              <text>
                <span style={{ fg: theme().text }}>  - {agent}</span>
              </text>
            ))}
          </scrollbox>
        </box>
      </box>

      {/* Buttons */}
      <box style={{ width: "100%", flexDirection: "row", justifyContent: "flex-end", gap: 2 }}>
        <DialogButton
          label={t("dlgQuitConfirm")}
          active={activeButton() === "quit"}
          onPress={() => {
            setActiveButton("quit")
            props.onQuit()
          }}
        />
        <DialogButton
          label={`${t("dlgUseDefault")}${props.defaultAgent ? ` (${props.defaultAgent})` : ""}`}
          active={activeButton() === "default"}
          onPress={() => {
            setActiveButton("default")
            props.onUseDefault()
          }}
        />
      </box>
    </Dialog>
  )
}
