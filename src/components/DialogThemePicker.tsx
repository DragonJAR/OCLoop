import { createMemo } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "../ui/DialogSelect"
import { useTheme } from "../context/ThemeContext"
import { themes } from "../lib/themes"
import { t } from "../lib/i18n"

export interface DialogThemePickerProps {
  /** Persist the chosen theme (write config + update in-memory config + close). */
  onCommit: (name: string) => void
  /** Close without persisting (caller clears the dialog). */
  onClose: () => void
}

/**
 * Standalone theme picker, opened from the command palette.
 *
 * Live-previews each theme as the user highlights it (`onMove` → `applyTheme`
 * repaints the whole UI at once), commits + persists on Enter (`onCommit`), and
 * reverts to the originally-active theme on Esc/close. Thin wrapper over
 * `DialogSelect` — no new list/keyboard/scroll code.
 *
 * ponytail: `onMove` doesn't fire for the initial row or while typing the
 * filter, so the live preview starts on the first ↑/↓. The ● marks the saved
 * theme so there's no ambiguity. Force-preview-on-open only if it's missed.
 */
export function DialogThemePicker(props: DialogThemePickerProps) {
  const { themeName, applyTheme } = useTheme()
  // Snapshot the saved theme once at mount: marks ● (current) and is the value
  // restored on cancel. Read once on purpose — not reactive.
  const original = themeName()

  const options = createMemo<DialogSelectOption[]>(() =>
    Object.keys(themes).map((name) => ({
      title: name,
      value: name,
      onSelect: () => {
        applyTheme(name)
        props.onCommit(name)
      },
    })),
  )

  return (
    <DialogSelect
      title={t("cmdChooseTheme")}
      options={options()}
      current={original}
      onMove={(o) => o && applyTheme(o.value)}
      onClose={() => {
        applyTheme(original)
        props.onClose()
      }}
      keybinds={[
        { label: t("kbPreview"), key: "↑/↓" },
        { label: t("kbSelect"), key: "Enter" },
      ]}
    />
  )
}
