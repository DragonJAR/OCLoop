import { createSignal, onMount, onCleanup } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { InputRenderable } from "@opentui/core"
import { Dialog } from "./Dialog"
import { DialogHeader } from "./DialogControls"
import { useTheme } from "../context/ThemeContext"
import { DialogContextValue } from "../context/DialogContext"
import { t } from "../lib/i18n"

export interface DialogPromptProps {
  onSubmit: (text: string) => void
  onCancel: () => void
  /** Optional header label (defaults to the generic "send prompt" title). */
  title?: string
  /** Fires on unmount; used by the static .show() Promise safety net. */
  onUnmount?: () => void
}

export function DialogPrompt(props: DialogPromptProps) {
  const { theme } = useTheme()
  const [value, setValue] = createSignal("")
  let inputRef: InputRenderable | undefined

  onCleanup(() => props.onUnmount?.())

  onMount(() => {
    setTimeout(() => {
      if (inputRef) {
        inputRef.focus()
      }
    }, 10)
  })

  // Handle keyboard input
  useKeyboard((key) => {
    // Escape handled by Dialog backdrop/onClose
    if (key.name === "escape") {
      props.onCancel()
      return true
    }

    if (key.name === "return") {
      props.onSubmit(value())
      return true
    }
  })

  return (
    <Dialog
      onClose={props.onCancel}
      width={60}
      height={8}
    >
      {/* Header */}
      <DialogHeader title={props.title ?? t("dlgSendPrompt")} hint="esc" />

      {/* Input */}
      <box style={{ flexGrow: 1, marginBottom: 1 }}>
        <input
          ref={inputRef}
          value={value()}
          onInput={setValue}
          focusedBackgroundColor={theme().backgroundElement}
          cursorColor={theme().primary}
          focusedTextColor={theme().text}
          width="100%"
        />
      </box>

      {/* Footer hint */}
      <box style={{ width: "100%", flexDirection: "row", justifyContent: "flex-end" }}>
        <text>
          <span style={{ fg: theme().textMuted }}>{t("dlgPromptHint")}</span>
        </text>
      </box>
    </Dialog>
  )
}

/**
 * Static helper: prompt for a line of text. Resolves the entered text, or `null`
 * if cancelled/dismissed. Settles BEFORE pop so the onUnmount safety net can't
 * override a real submit (see DialogConfirm.show for the rationale).
 */
DialogPrompt.show = (
  dialog: DialogContextValue,
  title?: string,
): Promise<string | null> => {
  return new Promise((resolve) => {
    let resolved = false
    const settle = (value: string | null) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }
    dialog.show(() => (
      <DialogPrompt
        title={title}
        onSubmit={(text) => {
          settle(text)
          dialog.pop()
        }}
        onCancel={() => {
          settle(null)
          dialog.pop()
        }}
        onUnmount={() => settle(null)}
      />
    ))
  })
}
