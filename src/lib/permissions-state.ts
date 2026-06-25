/**
 * Pure view-state for the permissions dialog — extracted to a JSX-free module
 * so it's unit-testable without the `@opentui/solid` JSX runtime (which Bun's
 * test loader can't resolve, per useServer.test.ts). Mirrors the
 * `createTerminalConfigState` pattern but kept here, separate from the dialog
 * component, so importing the state logic never pulls in the TUI renderer.
 */

import { createSignal } from "solid-js"
import type { PermissionsConfig, PermissionTool } from "./config"

export function createPermissionsState(
  initial: () => PermissionsConfig,
  onToggle: (tool: PermissionTool, value: boolean) => void,
) {
  const [activeIndex, setActiveIndex] = createSignal(0)
  const [working, setWorking] = createSignal<PermissionsConfig>({ ...initial() })

  const toggle = (tool: PermissionTool) => {
    const value = !working()[tool]
    setWorking((prev) => ({ ...prev, [tool]: value }))
    onToggle(tool, value)
  }

  return { activeIndex, setActiveIndex, working, toggle }
}

export type PermissionsState = ReturnType<typeof createPermissionsState>
