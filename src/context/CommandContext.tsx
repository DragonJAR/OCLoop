import { createContext, useContext, createSignal, onCleanup, type JSX } from "solid-js"
import { useDialog } from "./DialogContext"
import { DialogSelect, type DialogSelectOption } from "../ui/DialogSelect"
import { t } from "../lib/i18n"

/**
 * A command-palette option. `keybind` (inherited from DialogSelectOption) is
 * now rendered as a dim badge in the palette row, so the direct shortcut is
 * taught exactly where users discover features. No extra fields today.
 */
export interface CommandOption extends DialogSelectOption {}

export interface CommandContextValue {
  register: (factory: () => CommandOption[]) => void
  show: () => void
}

const CommandContext = createContext<CommandContextValue>()

export function CommandProvider(props: { children: JSX.Element }) {
  const dialog = useDialog()
  const [factories, setFactories] = createSignal<(() => CommandOption[])[]>([])

  const register = (factory: () => CommandOption[]) => {
    setFactories(prev => [...prev, factory])
    try {
      onCleanup(() => {
        setFactories(prev => prev.filter(f => f !== factory))
      })
    } catch {
      // Not in a reactive scope with cleanup support: the factory stays
      // registered for the lifetime of the process. register() is only ever
      // called from reactive owners in this codebase, so this branch is
      // defensive only — no manual unregister handle is exposed.
    }
  }

  const getCommands = () => {
    return factories().flatMap(f => f())
  }

  const show = () => {
    dialog.show(() => (
      <DialogSelect
        title={t("paletteTitle")}
        placeholder={t("palettePlaceholder")}
        options={getCommands()}
        onClose={() => dialog.clear()}
        keybinds={[
          { label: t("kbSelect"), key: "Enter" },
          { label: t("kbNavigate"), key: "↑/↓" }
        ]}
      />
    ))
  }

  // NOTE: the global Ctrl+P keybind is owned solely by useKeybindings (App).
  // A second handler here used to open the palette twice per keypress (sibling
  // useKeyboard listeners are not stopped by preventDefault), so it was
  // removed. Do not re-add a Ctrl+P handler here without a reentry guard in
  // show() — see REPARAR.md A2.

  const value: CommandContextValue = {
    register,
    show,
  }

  return (
    <CommandContext.Provider value={value}>
      {props.children}
    </CommandContext.Provider>
  )
}

export function useCommand() {
  const context = useContext(CommandContext)
  if (!context) throw new Error("useCommand must be used within CommandProvider")
  return context
}
