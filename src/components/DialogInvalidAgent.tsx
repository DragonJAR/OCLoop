import { createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "../ui/Dialog"
import { useTheme } from "../context/ThemeContext"
import { DialogHeader, DialogButton } from "../ui/DialogControls"
import { t } from "../lib/i18n"

export interface DialogInvalidAgentProps {
  agentName: string
  availableAgents: string[]
  defaultAgent?: string
  onUseDefault: () => void
  onQuit: () => void
}

export function DialogInvalidAgent(props: DialogInvalidAgentProps) {
  const { theme } = useTheme()
  const [activeButton, setActiveButton] = createSignal<"default" | "quit">("default")

  // Handle keyboard input
  useKeyboard((key) => {
    // Escape handled by Dialog backdrop/onClose
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
      height={14}
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
          {/* Scrollbox so a long agent roster (8+) scrolls instead of pushing
              the buttons off the fixed-height dialog. Mirrors DialogError's
              scrollbar styling. */}
          <scrollbox
            maxHeight={5}
            verticalScrollbarOptions={{
              visible: true,
              trackOptions: {
                backgroundColor: theme().backgroundPanel,
                foregroundColor: theme().borderSubtle,
              },
            }}
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
