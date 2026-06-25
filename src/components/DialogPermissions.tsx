import { For, createMemo } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { Dialog } from "../ui/Dialog"
import { DialogHeader, dialogScrollbarOptions } from "../ui/DialogControls"
import { DialogToggleRow } from "../ui/DialogControls"
import { useTheme } from "../context/ThemeContext"
import { t } from "../lib/i18n"
import { PERMISSION_TOOLS, type PermissionTool } from "../lib/config"
import type { PermissionsConfig } from "../lib/config"
import { createPermissionsState } from "../lib/permissions-state"

/**
 * Per-tool label + one-line description, keyed by {@link PermissionTool}. The
 * label tells the user WHAT the tool does so they can decide which autonomous
 * approvals to turn off. Derived once from the single source of truth
 * ({@link PERMISSION_TOOLS}); the dialog maps over this, so adding a tool is a
 * config + i18n change, not a UI change.
 */
function toolMeta(tool: PermissionTool): { label: string; description: string } {
  switch (tool) {
    case "edit":
      return { label: t("permEdit"), description: t("permEditDesc") }
    case "bash":
      return { label: t("permBash"), description: t("permBashDesc") }
    case "webfetch":
      return { label: t("permWebfetch"), description: t("permWebfetchDesc") }
    case "doom_loop":
      return { label: t("permDoomLoop"), description: t("permDoomLoopDesc") }
    case "external_directory":
      return { label: t("permExternalDirectory"), description: t("permExternalDirectoryDesc") }
  }
}

export interface DialogPermissionsProps {
  /** Reactive source of truth (the App signal). */
  permissions: () => PermissionsConfig
  /** Commit a toggle; App persists + restarts the server. */
  onToggle: (tool: PermissionTool, value: boolean) => void
  onClose: () => void
}

export function DialogPermissions(props: DialogPermissionsProps) {
  const { theme } = useTheme()
  const state = createPermissionsState(props.permissions, props.onToggle)
  const tools = PERMISSION_TOOLS

  const move = (delta: number) => {
    const n = tools.length
    state.setActiveIndex((prev) => (prev + delta + n) % n)
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      props.onClose()
      return
    }
    if (key.name === "up") {
      move(-1)
      return
    }
    if (key.name === "down") {
      move(1)
      return
    }
    // Space or Enter toggles the focused row (Enter is conventional; Space is
    // the checkbox idiom).
    if (key.name === "space" || key.name === "return") {
      state.toggle(tools[state.activeIndex()])
      return
    }
  })

  const rows = createMemo(() =>
    tools.map((tool, i) => ({
      tool,
      meta: toolMeta(tool),
      active: i === state.activeIndex(),
      checked: state.working()[tool],
    })),
  )

  return (
    <Dialog onClose={props.onClose} width={68} height={20}>
      <box style={{ flexDirection: "column" }}>
        <DialogHeader title={t("dlgPermissionsTitle")} />

        {/* One-line explanation of what the toggles do */}
        <text style={{ marginBottom: 1 }}>
          <span style={{ fg: theme().textMuted }}>{t("dlgPermissionsHint")}</span>
        </text>

        {/*
         * Tool rows in a scrollbox: 5 tools × 2 lines + gaps can exceed a fixed
         * dialog height, so (like DialogHelp) we cap the inner area with
         * maxHeight and let it scroll on short terminals. Each row carries its
         * own marginBottom so they don't read as one cramped block.
         */}
        <scrollbox
          maxHeight={13}
          verticalScrollbarOptions={dialogScrollbarOptions(theme())}
        >
          <For each={rows()}>
            {(row) => (
              <box style={{ marginBottom: 1 }}>
                <DialogToggleRow
                  label={row.meta.label}
                  description={row.meta.description}
                  checked={row.checked}
                  active={row.active}
                  onToggle={() => state.toggle(row.tool)}
                />
              </box>
            )}
          </For>
        </scrollbox>

        {/* Footer keybind hints */}
        <text style={{ marginTop: 1 }}>
          <span style={{ fg: theme().text }}>↑/↓</span>
          <span style={{ fg: theme().textMuted }}> {t("kbNavigate")}  </span>
          <span style={{ fg: theme().text }}>Space</span>
          <span style={{ fg: theme().textMuted }}> {t("kbSwitch")}  </span>
          <span style={{ fg: theme().text }}>Esc</span>
          <span style={{ fg: theme().textMuted }}> {t("kbBack")}</span>
        </text>
      </box>
    </Dialog>
  )
}
