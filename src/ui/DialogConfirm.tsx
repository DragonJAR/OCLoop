import { createSignal, onCleanup, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "./Dialog"
import { useTheme } from "../context/ThemeContext"
import { DialogHeader, DialogButton, dialogScrollbarOptions } from "./DialogControls"
import { showDialogResult, type DialogContextValue } from "../context/DialogContext"
import { t } from "../lib/i18n"

export interface DialogConfirmProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  /** Fires on component unmount, including when covered by another modal.
   * Awaitable results use stack membership rather than this notification.
   */
  onUnmount?: () => void
  /** Dialog width (default 60). */
  width?: number
  /** Dialog height (default 10). Use a larger value for long messages. */
  height?: number
  /** Render the message in a scrollbox (for long, multi-line content). */
  scrollableMessage?: boolean
}

export function DialogConfirm(props: DialogConfirmProps) {
  const { theme } = useTheme()
  const [activeButton, setActiveButton] = createSignal<"cancel" | "confirm">("confirm")

  onCleanup(() => props.onUnmount?.())

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (props.onCancel) props.onCancel()
      return
    }

    if (key.name === "return") {
      if (activeButton() === "confirm") {
        if (props.onConfirm) props.onConfirm()
      } else {
        if (props.onCancel) props.onCancel()
      }
      return
    }

    if (key.name === "left" || key.name === "right") {
      setActiveButton(prev => prev === "confirm" ? "cancel" : "confirm")
    }
  })

  return (
    <Dialog
      onClose={() => props.onCancel && props.onCancel()}
      width={props.width ?? 60}
      height={props.height ?? 10}
    >
      <DialogHeader title={props.title} />

      {/* Message — scrollable for long, multi-line content (e.g. a task
          breakdown); plain box otherwise to preserve existing layouts. */}
      <Show
        when={props.scrollableMessage}
        fallback={
          <box style={{ flexGrow: 1, marginBottom: 1 }}>
            <text>
              <span style={{ fg: theme().textMuted }}>{props.message}</span>
            </text>
          </box>
        }
      >
        <scrollbox
          marginTop={1}
          marginBottom={1}
          maxHeight={Math.max(2, (props.height ?? 12) - 5)}
          verticalScrollbarOptions={dialogScrollbarOptions(theme())}
        >
          <text>
            <span style={{ fg: theme().textMuted }}>{props.message}</span>
          </text>
        </scrollbox>
      </Show>

      {/* Buttons */}
      <box style={{ width: "100%", flexDirection: "row", justifyContent: "flex-end", gap: 2 }}>
        <DialogButton
          label={props.cancelLabel || t("dlgCancel")}
          active={activeButton() === "cancel"}
          onPress={() => {
            setActiveButton("cancel")
            if (props.onCancel) props.onCancel()
          }}
        />
        <DialogButton
          label={props.confirmLabel || t("dlgConfirm")}
          active={activeButton() === "confirm"}
          onPress={() => {
            setActiveButton("confirm")
            if (props.onConfirm) props.onConfirm()
          }}
        />
      </box>
    </Dialog>
  )
}

/**
 * Static helper to show a confirmation dialog
 */
DialogConfirm.show = (
  dialog: DialogContextValue,
  title: string,
  message: string,
  options: Partial<Omit<DialogConfirmProps, "title" | "message" | "onConfirm" | "onCancel">> = {}
): Promise<boolean> => {
  return showDialogResult(dialog, (finish) => (
    <DialogConfirm
      title={title}
      message={message}
      {...options}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  ), false)
}
