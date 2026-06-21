import { createSignal, onCleanup, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "./Dialog"
import { useTheme } from "../context/ThemeContext"
import { DialogHeader, DialogButton } from "./DialogControls"
import { DialogContextValue } from "../context/DialogContext"
import { t } from "../lib/i18n"

export interface DialogConfirmProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  /**
   * Fires when the component unmounts (the dialog is removed for any reason —
   * button press, external clear()/replace(), teardown). Used by the static
   * {@link DialogConfirm.show} Promise helper to settle on dismissal paths that
   * bypass onConfirm/onCancel, so an awaiter never hangs. Optional for direct
   * <DialogConfirm> usage.
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

  // Release the static .show() Promise if the dialog unmounts without a button
  // press (external clear/replace/teardown). No-op for direct <DialogConfirm>
  // usage where onUnmount is undefined.
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
          maxHeight={(props.height ?? 12) - 5}
          verticalScrollbarOptions={{
            visible: true,
            trackOptions: {
              backgroundColor: theme().backgroundPanel,
              foregroundColor: theme().borderSubtle,
            },
          }}
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
  return new Promise((resolve) => {
    // Guard against double-resolve: the button callbacks (true/false) and the
    // unmount cleanup (false) can race if the dialog is dismissed by an
    // external clear()/replace()/teardown right as the user clicks. Once
    // resolved, further calls are no-ops — a Promise only settles once.
    let resolved = false
    const settle = (value: boolean) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }
    dialog.show(() => (
      <DialogConfirm
        title={title}
        message={message}
        {...options}
        onConfirm={() => {
          // Settle BEFORE pop: pop() unmounts this dialog synchronously
          // (DialogStack renders only the top via <Show keyed>), which fires
          // onCleanup -> onUnmount -> settle(false). Settling true first makes
          // that a no-op; otherwise "confirm" would resolve false.
          settle(true)
          dialog.pop()
        }}
        onCancel={() => {
          settle(false)
          dialog.pop()
        }}
        // If the dialog is removed by anything other than the confirm/cancel
        // buttons (an external dialog.clear()/replace(), app teardown, the
        // stack being popped by another path), the Promise would otherwise hang
        // forever. onCleanup fires on unmount in every one of those cases, so
        // settle as "not confirmed" (false) to release the awaiter.
        onUnmount={() => settle(false)}
      />
    ))
  })
}
