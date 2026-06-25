/**
 * External-terminal attach + config-dialog handlers.
 *
 * Groups the terminal-related closures that previously lived inline in
 * AppContent: launching a configured terminal, surfacing launch errors,
 * the config-dialog save handlers (known/custom terminal, copy), and the
 * shared copy-attach-command pipeline. The terminalConfigState factory is
 * wired here too.
 *
 * Behavior unchanged from the inline closures it replaces.
 */

import type { DialogContextValue } from "../context/DialogContext"
import type { ToastContextValue } from "../context/ToastContext"
import type { t as Tfn } from "../lib/i18n"
import type { OcloopConfig } from "../lib/config"
import type { KnownTerminal } from "../lib/terminal-launcher"
import {
  getAttachCommand,
  launchTerminal,
} from "../lib/terminal-launcher"
import { copyToClipboard } from "../lib/clipboard"
import { saveConfig } from "../lib/config"
import { resolveActiveSessionId } from "../lib/active-session-id"
import { log } from "../lib/debug-logger"
import {
  createTerminalConfigState,
  DialogTerminalError,
  type TerminalConfigState,
} from "../components"

export interface TerminalLauncherDeps {
  dialog: DialogContextValue
  toast: ToastContextValue
  t: typeof Tfn
  sessionId: () => string | undefined
  lastSessionId: () => string | undefined
  // `() => string | null` matches useServer.url (the source) and tryGetClient.
  serverUrl: () => string | null
  ocloopConfig: () => OcloopConfig
  setOcloopConfig: (c: OcloopConfig) => void
  availableTerminals: () => KnownTerminal[]
}

export interface TerminalLauncherApi {
  showTerminalError: (name: string, error: string) => void
  launchConfiguredTerminal: (
    sid: string,
    terminalConfig: OcloopConfig["terminal"],
  ) => Promise<void>
  onConfigSelect: (terminal: KnownTerminal) => Promise<void>
  onConfigCustom: (command: string, args: string) => Promise<void>
  onConfigCopy: () => Promise<void>
  onErrorCopy: () => Promise<void>
  copyAttachCommand: () => Promise<void>
  terminalConfigState: TerminalConfigState
}

export function useTerminalLauncher(deps: TerminalLauncherDeps): TerminalLauncherApi {
  const { dialog, toast, t } = deps

  const showTerminalError = (name: string, error: string): void => {
    const sid = resolveActiveSessionId(deps.sessionId(), deps.lastSessionId())
    const url = deps.serverUrl()
    const attachCmd = sid && url ? getAttachCommand(url, sid) : ""
    dialog.show(() => (
      <DialogTerminalError
        terminalName={name}
        errorMessage={error}
        attachCommand={attachCmd}
        onCopy={onErrorCopy}
        onClose={() => dialog.clear()}
      />
    ))
  }

  async function launchConfiguredTerminal(
    sid: string,
    terminalConfig: OcloopConfig["terminal"],
  ): Promise<void> {
    if (!terminalConfig) return
    const url = deps.serverUrl()
    if (!url) return

    const attachCmd = getAttachCommand(url, sid)
    log.info("terminal", "Launching", {
      sessionId: sid,
      terminal: terminalConfig,
      command: attachCmd,
    })

    const result = await launchTerminal(terminalConfig, url, sid)
    log.info("terminal", "Launch result", result)

    if (!result.success) {
      showTerminalError(
        terminalConfig.type === "known" ? terminalConfig.name : "Custom",
        result.error || t("errUnknown"),
      )
    }
  }

  const onConfigSelect = async (terminal: KnownTerminal): Promise<void> => {
    const newConfig: OcloopConfig = {
      ...deps.ocloopConfig(),
      terminal: { type: "known", name: terminal.name },
    }
    // saveConfig is synchronous — do not await it. On I/O failure it returns
    // false and logs a warn; we surface that so the user knows the change
    // won't survive a restart.
    if (!saveConfig(newConfig)) {
      toast.show({ variant: "error", message: t("toastConfigSaveFailed") })
      return
    }
    deps.setOcloopConfig(newConfig)
    dialog.clear()

    const sid = resolveActiveSessionId(deps.sessionId(), deps.lastSessionId())
    if (sid) {
      void launchConfiguredTerminal(sid, newConfig.terminal)
    }
  }

  const onConfigCustom = async (command: string, args: string): Promise<void> => {
    const newConfig: OcloopConfig = {
      ...deps.ocloopConfig(),
      terminal: { type: "custom", command, args },
    }
    if (!saveConfig(newConfig)) {
      toast.show({ variant: "error", message: t("toastConfigSaveFailed") })
      return
    }
    deps.setOcloopConfig(newConfig)
    dialog.clear()

    const sid = resolveActiveSessionId(deps.sessionId(), deps.lastSessionId())
    if (sid) {
      void launchConfiguredTerminal(sid, newConfig.terminal)
    }
  }

  const onConfigCopy = async (): Promise<void> => {
    await copyAttachCommand()
    dialog.clear()
  }

  const onErrorCopy = async (): Promise<void> => {
    await copyAttachCommand()
  }

  /**
   * Copy the current session's attach command to the clipboard and toast the
   * outcome. Single-sources the resolveActiveSessionId → getAttachCommand →
   * copyToClipboard → toast pipeline shared by onConfigCopy, onErrorCopy, the
   * copy_attach command, and the C keybind. No-ops when there is no active
   * session or server URL; callers own any dialog clearing.
   */
  async function copyAttachCommand(): Promise<void> {
    const sid = resolveActiveSessionId(deps.sessionId(), deps.lastSessionId())
    const url = deps.serverUrl()
    if (!sid || !url) return
    const cmd = getAttachCommand(url, sid)
    const result = await copyToClipboard(cmd)
    if (result.success) {
      toast.show({ variant: "success", message: t("toastCopied") })
    } else {
      // Surface the actual error instead of a misleading "Copied" toast when
      // the clipboard command failed (e.g. empty pasteboard).
      toast.show({ variant: "error", message: t("toastCopyFailed", { error: result.error ?? "" }) })
    }
  }

  const terminalConfigState = createTerminalConfigState(
    deps.availableTerminals,
    onConfigSelect,
    onConfigCustom,
    onConfigCopy,
    () => dialog.clear(),
  )

  return {
    showTerminalError,
    launchConfiguredTerminal,
    onConfigSelect,
    onConfigCustom,
    onConfigCopy,
    onErrorCopy,
    copyAttachCommand,
    terminalConfigState,
  }
}

// (No _JsxMarker export needed: the JSX runtime is retained by the
// <DialogTerminalError .../> render in onConfigCustom above.)
