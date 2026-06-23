import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "./Dialog"
import { useTheme } from "../context/ThemeContext"
import { DialogHeader, DialogButton, dialogScrollbarOptions } from "./DialogControls"
import { DialogContextValue } from "../context/DialogContext"
import { AUTO_SELECT_MS } from "../lib/constants"
import { t } from "../lib/i18n"

export type DecomposeChoice = "accept" | "edit" | "reject"

export interface DialogDecomposeApprovalProps {
  title: string
  /** Body text (the stalled task + the proposed subtasks); rendered scrollable. */
  message: string
  onChoice: (choice: DecomposeChoice) => void
  /**
   * Fires on unmount (button press OR external clear/replace/teardown). Used by
   * the static {@link DialogDecomposeApproval.show} Promise to settle on
   * dismissal paths that bypass onChoice, so the awaiter never hangs.
   */
  onUnmount?: () => void
}

// Left-to-right visual order of the buttons; arrow keys navigate within it.
const ORDER: DecomposeChoice[] = ["reject", "edit", "accept"]

/**
 * Three-way approval for a stalled-task split: Accept / Edit / Reject.
 *
 * Mirrors DialogConfirm's keyboard + button conventions but returns a 3-way
 * choice and shows the (potentially long) subtask list in a scrollbox. Accept
 * is the default highlighted action (Enter accepts).
 */
export function DialogDecomposeApproval(props: DialogDecomposeApprovalProps) {
  const { theme } = useTheme()
  const [active, setActive] = createSignal<DecomposeChoice>("accept")
  const [remaining, setRemaining] = createSignal(Math.ceil(AUTO_SELECT_MS / 1000))

  // Unattended auto-accept: if nobody chooses within AUTO_SELECT_MS, accept the
  // proposal so a stall resolves itself. Any keypress (below) cancels it.
  let autoTimer: ReturnType<typeof setInterval> | null = null
  const cancelAuto = () => {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
    setRemaining(0)
  }
  onMount(() => {
    autoTimer = setInterval(() => {
      const next = remaining() - 1
      if (next <= 0) { cancelAuto(); props.onChoice("accept") }
      else setRemaining(next)
    }, 1000)
  })
  onCleanup(cancelAuto)
  onCleanup(() => props.onUnmount?.())

  useKeyboard((key) => {
    cancelAuto() // user took control — stop the auto-accept countdown
    if (key.name === "escape") {
      props.onChoice("reject")
      return
    }
    if (key.name === "return") {
      props.onChoice(active())
      return
    }
    if (key.name === "left") {
      setActive((c) => ORDER[(ORDER.indexOf(c) + ORDER.length - 1) % ORDER.length])
      return
    }
    if (key.name === "right") {
      setActive((c) => ORDER[(ORDER.indexOf(c) + 1) % ORDER.length])
      return
    }
  })

  return (
    <Dialog onClose={() => props.onChoice("reject")} width={72} height={18}>
      <DialogHeader title={props.title} />

      <scrollbox
        marginTop={1}
        marginBottom={1}
        maxHeight={11}
        verticalScrollbarOptions={dialogScrollbarOptions(theme())}
      >
        <text>
          <span style={{ fg: theme().textMuted }}>{props.message}</span>
        </text>
      </scrollbox>

      <box style={{ width: "100%", flexDirection: "row", alignItems: "center", gap: 2 }}>
        {/* flexGrow spacer holds the auto-accept countdown, left of the buttons */}
        <box style={{ flexGrow: 1 }}>
          <Show when={remaining() > 0}>
            <text>
              <span style={{ fg: theme().textMuted }}>{t("autoSelectHint", { secs: remaining() })}</span>
            </text>
          </Show>
        </box>
        <DialogButton
          label={t("dlgSplitReject")}
          active={active() === "reject"}
          onPress={() => props.onChoice("reject")}
        />
        <DialogButton
          label={t("dlgSplitEdit")}
          active={active() === "edit"}
          onPress={() => props.onChoice("edit")}
        />
        <DialogButton
          label={t("dlgSplitAccept")}
          active={active() === "accept"}
          onPress={() => props.onChoice("accept")}
        />
      </box>
    </Dialog>
  )
}

/**
 * Static helper: show the approval and resolve to the chosen action.
 * Settles BEFORE pop so the onUnmount safety net can't override the real choice
 * (see DialogConfirm.show for the synchronous-unmount rationale).
 */
DialogDecomposeApproval.show = (
  dialog: DialogContextValue,
  title: string,
  message: string,
): Promise<DecomposeChoice> => {
  return new Promise((resolve) => {
    let resolved = false
    const settle = (value: DecomposeChoice) => {
      if (resolved) return
      resolved = true
      resolve(value)
    }
    dialog.show(() => (
      <DialogDecomposeApproval
        title={title}
        message={message}
        onChoice={(choice) => {
          settle(choice)
          dialog.pop()
        }}
        onUnmount={() => settle("reject")}
      />
    ))
  })
}
