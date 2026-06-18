/**
 * Command-palette registration.
 *
 * Moves the ~200-line command.register(...) block out of AppContent. The
 * option array is built inside an effect so it re-registers when the session
 * id changes (enabling/disabling session-dependent commands and feeding the
 * current id to callbacks).
 *
 * Behavior unchanged from the inline registration it replaces.
 */

import { createEffect } from "solid-js"

import type { useLoopState } from "./useLoopState"
import type { useCooldown } from "./useCooldown"
import type { CommandContextValue, CommandOption } from "../context/CommandContext"
import type { DialogContextValue } from "../context/DialogContext"
import type { ToastContextValue } from "../context/ToastContext"
import type { OcloopConfig } from "../lib/config"
import type { t as Tfn, Locale } from "../lib/i18n"
import type { TerminalConfigState } from "../components"
import { resolveActiveSessionId } from "../lib/active-session-id"
import { saveConfig } from "../lib/config"
import { getLocale, setLocale } from "../lib/i18n"
import type { ChaosController } from "../lib/chaos"
import { DialogTerminalConfig, DialogThemePicker, DialogAbout } from "../components"

export interface CommandPaletteDeps {
  loop: ReturnType<typeof useLoopState>
  cooldown: ReturnType<typeof useCooldown>
  command: CommandContextValue
  dialog: DialogContextValue
  toast: ToastContextValue
  t: typeof Tfn
  // Reactive accessors
  sessionId: () => string | undefined
  lastSessionId: () => string | undefined
  serverUrl: () => string | undefined
  ocloopConfig: () => OcloopConfig
  setOcloopConfig: (c: OcloopConfig) => void
  terminalConfigState: TerminalConfigState
  chaos: ChaosController
  // Imperative actions owned by AppContent
  restartServer: () => Promise<void>
  copyAttachCommand: () => Promise<void>
  showQuitConfirmation: () => void
  onSelectTheme: (name: string) => void
}

export function useCommandPalette(deps: CommandPaletteDeps): void {
  createEffect(() => {
    // Re-register when the session id changes so session-dependent commands
    // enable/disable correctly and callbacks get the current id.
    const sid = resolveActiveSessionId(deps.sessionId(), deps.lastSessionId())
    const url = deps.serverUrl()
    const hasSession = !!sid

    deps.command.register(() => {
      const st = deps.loop.state().type
      const opts: CommandOption[] = [
        // --- Loop control (context-aware) ---
        {
          title: deps.t("cmdStart"),
          value: "loop_start",
          category: deps.t("catLoop"),
          keybind: "S",
          disabled: !deps.loop.canStart(),
          onSelect: () => {
            deps.dialog.clear()
            deps.loop.dispatch({ type: "start" })
          },
        },
        {
          title: deps.t("cmdPause"),
          value: "loop_pause",
          category: deps.t("catLoop"),
          keybind: "Space",
          disabled: st !== "running",
          onSelect: () => {
            deps.dialog.clear()
            deps.loop.dispatch({ type: "toggle_pause" })
          },
        },
        {
          title: deps.t("cmdResume"),
          value: "loop_resume",
          category: deps.t("catLoop"),
          keybind: "Space",
          disabled: st !== "paused",
          onSelect: () => {
            deps.dialog.clear()
            deps.loop.dispatch({ type: "toggle_pause" })
          },
        },
        {
          title: deps.t("cmdCancelPause"),
          value: "loop_cancel_pause",
          category: deps.t("catLoop"),
          disabled: st !== "pausing",
          onSelect: () => {
            deps.dialog.clear()
            deps.loop.dispatch({ type: "toggle_pause" })
          },
        },
        {
          title: deps.t("cmdRestartServer"),
          value: "server_restart",
          category: deps.t("catLoop"),
          disabled: !url,
          onSelect: () => {
            deps.dialog.clear()
            deps.toast.show({ variant: "info", message: deps.t("toastRestarting") })
            void deps.restartServer()
          },
        },
        // --- Terminal ---
        {
          title: deps.t("cmdCopyAttach"),
          value: "copy_attach",
          category: deps.t("catTerminal"),
          keybind: "C",
          disabled: !hasSession,
          onSelect: async () => {
            await deps.copyAttachCommand()
          },
        },
        {
          title: deps.t("cmdChooseTerminal"),
          value: "terminal_config",
          category: deps.t("catTerminal"),
          keybind: "T",
          disabled: !hasSession,
          onSelect: () => {
            deps.dialog.clear()
            deps.dialog.show(() => (
              <DialogTerminalConfig
                state={deps.terminalConfigState}
                onCancel={() => deps.dialog.clear()}
              />
            ))
          },
        },
        // --- View / language ---
        {
          title: deps.t("cmdToggleScrollbar"),
          value: "toggle_scrollbar",
          category: deps.t("catView"),
          onSelect: async () => {
            const current = deps.ocloopConfig().scrollbar_visible ?? true
            const newConfig = {
              ...deps.ocloopConfig(),
              scrollbar_visible: !current,
            }
            // saveConfig is synchronous — do not await. On I/O failure it returns
            // false; we roll back the in-memory state and toast so the UI matches
            // what survived to disk.
            if (!saveConfig(newConfig)) {
              deps.toast.show({ variant: "error", message: deps.t("toastConfigSaveFailed") })
              return
            }
            deps.setOcloopConfig(newConfig)
            deps.dialog.clear()
          },
        },
        {
          // Inherently bilingual label: shows the language you'll switch TO.
          title: getLocale() === "en" ? "Language → Español" : "Idioma → English",
          value: "toggle_language",
          category: deps.t("catLanguage"),
          onSelect: async () => {
            const next: Locale = getLocale() === "en" ? "es" : "en"
            setLocale(next)
            const newConfig = { ...deps.ocloopConfig(), language: next }
            // saveConfig is synchronous — do not await. On I/O failure roll back
            // the language switch and toast so the UI matches what survived to disk.
            if (!saveConfig(newConfig)) {
              setLocale(next === "es" ? "en" : "es")
              deps.toast.show({ variant: "error", message: deps.t("toastConfigSaveFailed") })
              return
            }
            deps.setOcloopConfig(newConfig)
            deps.toast.show({ variant: "success", message: deps.t("toastLanguageChanged") })
            deps.dialog.clear()
          },
        },
        // --- Appearance ---
        {
          title: deps.t("cmdChooseTheme"),
          value: "theme_picker",
          category: deps.t("catAppearance"),
          onSelect: () => {
            deps.dialog.clear()
            deps.dialog.show(() => (
              <DialogThemePicker onCommit={deps.onSelectTheme} onClose={() => deps.dialog.clear()} />
            ))
          },
        },
        // --- Help ---
        {
          title: deps.t("cmdAbout"),
          value: "about",
          category: deps.t("catHelp"),
          onSelect: () => {
            deps.dialog.clear()
            deps.dialog.show(() => (
              <DialogAbout onClose={() => deps.dialog.clear()} />
            ))
          },
        },
        // --- General ---
        {
          title: deps.t("cmdQuit"),
          value: "quit",
          category: deps.t("catView"),
          keybind: "Q",
          onSelect: () => {
            deps.dialog.clear()
            deps.showQuitConfirmation()
          },
        },
      ]

      // Chaos fault-injection commands (debug + --chaos only) for soak testing.
      if (deps.chaos.isEnabled()) {
        const chaosCmd = (
          title: string,
          value: string,
          run: () => void,
          done: string,
        ): CommandOption => ({
          title,
          value,
          category: deps.t("catChaos"),
          onSelect: () => {
            run()
            deps.toast.show({ variant: "info", message: done })
            deps.dialog.clear()
          },
        })
        opts.push(
          chaosCmd(deps.t("chaosKill"), "chaos_kill", () => deps.chaos.killServer(), deps.t("chaosKillDone")),
          chaosCmd(deps.t("chaosRevive"), "chaos_revive", () => deps.chaos.reviveServer(), deps.t("chaosReviveDone")),
          chaosCmd(deps.t("chaosFreeze"), "chaos_freeze", () => deps.chaos.freezeSession(), deps.t("chaosFreezeDone")),
          chaosCmd(deps.t("chaosUnfreeze"), "chaos_unfreeze", () => deps.chaos.unfreezeSession(), deps.t("chaosUnfreezeDone")),
          chaosCmd(deps.t("chaosRateLimit"), "chaos_429", () => deps.cooldown.enterCooldown("chaos: injected 429", 5), deps.t("chaosRateLimitDone")),
        )
      }

      return opts
    })
  })
}
