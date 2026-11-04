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
 * Rows the tool list needs: two rows per tool (its label and its one-line
 * description) plus one separating row between consecutive tools. The last
 * tool adds no trailing row — a trailing blank would read as overflow.
 */
const ROWS_PER_TOOL = 2
const ROWS_PER_GAP = 1

/**
 * Rows the surrounding chrome occupies outside the tool list: the dialog's
 * own vertical padding, the header (title + gap), the hint line (its text
 * wraps to two rows at this width, plus its gap) and the footer (gap + row).
 *
 * Measured against the renderer. The hint's wrap count depends on the
 * locale, so the budget covers its longest form — a dialog one row taller
 * than needed only leaves one blank row, while a row too short hides a tool
 * the user cannot toggle.
 */
const DIALOG_CHROME_ROWS = 10

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

  // Rows the tool list needs. Every tool must be reachable: a tool clipped
  // below the fold cannot be toggled at all.
  const listRows = createMemo(
    () => tools.length * ROWS_PER_TOOL + (tools.length - 1) * ROWS_PER_GAP,
  )
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
    <Dialog onClose={props.onClose} width={68} height={DIALOG_CHROME_ROWS + listRows()}>
      <box style={{ flexDirection: "column" }}>
        <DialogHeader title={t("dlgPermissionsTitle")} />

        {/* One-line explanation of what the toggles do */}
        <text style={{ marginBottom: 1 }}>
          <span style={{ fg: theme().textMuted }}>{t("dlgPermissionsHint")}</span>
        </text>

        {/*
         * Tool rows in a scrollbox: the list is sized to its content and the
         * dialog grows to fit it, so every tool is visible without scrolling.
         * The rows are separated by `gap` rather than a per-row bottom margin:
         * a margin on the LAST row is a trailing blank row, which the
         * scrollbox then reports as overflow and paints a scrollbar for.
         */}
        {/* Explicit height: the list does not depend on how many rows the
            chrome around it takes, so no tool can fall below the fold. */}
        <scrollbox
          height={listRows()}
          flexShrink={0}
          maxHeight={listRows()}
          verticalScrollbarOptions={dialogScrollbarOptions(theme())}
        >
          <box style={{ flexDirection: "column", gap: 1 }}>
            <For each={rows()}>
              {(row) => (
                <DialogToggleRow
                  label={row.meta.label}
                  description={row.meta.description}
                  checked={row.checked}
                  active={row.active}
                  onToggle={() => state.toggle(row.tool)}
                />
              )}
            </For>
          </box>
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
