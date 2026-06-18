/**
 * Centralized keyboard handler for AppContent.
 *
 * Extracted from App.tsx to shrink the god component. Collapses the prior
 * state-keyed if/else cascade into a dispatch-table shape: the `t` (terminal)
 * and `q` (quit) branches are single-sourced — they previously appeared
 * verbatim in both the debug and the detached sections.
 *
 * Behavior is unchanged from the inline handler it replaces; only the
 * location and the dedup differ.
 */

import { useKeyboard } from "@opentui/solid"
import type { JSX } from "solid-js"

import type { useLoopState } from "./useLoopState"
import type { CommandContextValue } from "../context/CommandContext"
import type { DialogContextValue } from "../context/DialogContext"
import type { ToastContextValue } from "../context/ToastContext"
import type { OcloopConfig } from "../lib/config"
import type { t as Tfn } from "../lib/i18n"
import { resolveActiveSessionId } from "../lib/active-session-id"
import { hasTerminalConfig } from "../lib/config"
import { log } from "../lib/debug-logger"
import { DialogHelp, DialogTerminalConfig, type TerminalConfigState } from "../components"
import { DialogPrompt } from "../ui/DialogPrompt"

export interface KeybindingDeps {
  // CLI flags
  debug: boolean
  verbose: boolean
  // Loop state machine
  loop: ReturnType<typeof useLoopState>
  // Reactive accessors
  sessionId: () => string | undefined
  lastSessionId: () => string | undefined
  serverUrl: () => string | undefined
  ocloopConfig: () => OcloopConfig
  terminalConfigState: TerminalConfigState
  // Context APIs
  dialog: DialogContextValue
  command: CommandContextValue
  toast: ToastContextValue
  t: typeof Tfn
  // Imperative actions owned by AppContent
  createDebugSession: () => Promise<void>
  sendDebugPrompt: (text: string) => Promise<void>
  showQuitConfirmation: () => void
  handleQuit: (exitCode?: number) => Promise<void>
  insertSampleActivity: () => void
  copyAttachCommand: () => Promise<void>
  launchConfiguredTerminal: (
    sid: string,
    terminalConfig: OcloopConfig["terminal"],
  ) => Promise<void>
}

/**
 * Open the terminal-config dialog or launch a pre-configured terminal for the
 * current session. Shared by the `t` keybind in both debug and detached states.
 */
function openTerminal(deps: KeybindingDeps): void {
  const sid = resolveActiveSessionId(deps.sessionId(), deps.lastSessionId())
  if (!sid) {
    deps.toast.show({ variant: "info", message: deps.t("toastNoSessionAttach") })
    return
  }
  const config = deps.ocloopConfig()
  if (hasTerminalConfig(config)) {
    void deps.launchConfiguredTerminal(sid, config.terminal)
  } else {
    deps.dialog.show(() => (
      <DialogTerminalConfig
        state={deps.terminalConfigState}
        onCancel={() => deps.dialog.clear()}
      />
    ))
  }
}

/**
 * Open the debug prompt dialog (debug mode only). Shows a toast if there is no
 * session to prompt.
 */
function openDebugPrompt(deps: KeybindingDeps): void {
  const sid = resolveActiveSessionId(deps.sessionId(), deps.lastSessionId())
  if (!sid) {
    deps.toast.show({ variant: "info", message: deps.t("toastNoSessionPrompt") })
    return
  }
  deps.dialog.show(() => (
    <DialogPrompt
      onSubmit={(text) => {
        if (text.trim()) {
          void deps.sendDebugPrompt(text.trim())
        }
        deps.dialog.clear()
      }}
      onCancel={() => deps.dialog.clear()}
    />
  ))
}

/**
 * Install the global keyboard handler. Must be called from inside AppContent
 * (under the renderer provider) — useKeyboard requires it.
 */
export function useKeybindings(deps: KeybindingDeps): void {
  useKeyboard((key) => {
    if (deps.verbose) {
      log.debug("keybinding", "Key pressed", {
        key: key.name,
        sequence: key.sequence,
        state: deps.loop.state().type,
        sessionId: deps.sessionId(),
        lastSessionId: deps.lastSessionId(),
      })
    }

    // If a dialog is open, let the dialog handle all input.
    if (deps.dialog.hasDialogs()) {
      return
    }

    // Ctrl+P — command palette.
    if (key.ctrl && key.name === "p") {
      deps.command.show()
      key.preventDefault()
      return
    }

    // ? — help overlay. Global (any state without an open dialog) so a new user
    // can discover the full keymap in one place.
    if (key.name === "?" || key.sequence === "?") {
      deps.dialog.show(() => <DialogHelp onClose={() => deps.dialog.clear()} />)
      key.preventDefault()
      return
    }

    // Debug mode owns its own detached keymap.
    if (deps.loop.isDebug()) {
      switch (key.name) {
        case "n":
          void deps.createDebugSession()
          key.preventDefault()
          return
        case "q":
          deps.showQuitConfirmation()
          key.preventDefault()
          return
        case "i":
          deps.insertSampleActivity()
          deps.toast.show({ variant: "info", message: deps.t("toastSampleInserted") })
          key.preventDefault()
          return
        case "p":
          openDebugPrompt(deps)
          key.preventDefault()
          return
        case "t":
          openTerminal(deps)
          key.preventDefault()
          return
        default:
          // Consume other input in debug mode when detached.
          key.preventDefault()
          return
      }
    }

    // Ready state — S to start, Q to quit.
    if (deps.loop.canStart()) {
      if (key.name === "s") {
        deps.loop.dispatch({ type: "start" })
      } else if (key.name === "q") {
        deps.showQuitConfirmation()
      }
      key.preventDefault()
      return
    }

    // Complete state — Q to exit.
    if (deps.loop.state().type === "complete") {
      if (key.name === "q") {
        void deps.handleQuit()
      }
      key.preventDefault()
      return
    }

    // Detached (running / pausing / paused / cooldown / error) keymap.
    switch (key.name) {
      case "c":
        // C — copy the attach command. Shares copyAttachCommand with the palette
        // and the terminal-config dialog so all three paths stay in sync.
        if (resolveActiveSessionId(deps.sessionId(), deps.lastSessionId()) && deps.serverUrl()) {
          void deps.copyAttachCommand()
        } else {
          deps.toast.show({ variant: "info", message: deps.t("toastNoSessionAttach") })
        }
        key.preventDefault()
        return
      case "t":
        openTerminal(deps)
        key.preventDefault()
        return
      case "space":
        if (deps.loop.canPause()) {
          deps.loop.dispatch({ type: "toggle_pause" })
        }
        key.preventDefault()
        return
      case "q":
        if (deps.loop.canQuit()) {
          deps.showQuitConfirmation()
        }
        key.preventDefault()
        return
    }

    // Error-state R/Q is handled inside DialogError (it owns the keyboard while
    // open; this global handler already returned early via hasDialogs()).
    // Let opentui handle other input (scrolling, etc.).
  })
}

// Keep JSX runtime happy: this file returns JSX.Element for the dialogs.
export type _JsxMarker = JSX.Element
