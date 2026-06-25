/**
 * Pure view-state logic for the permissions dialog — unit-testable without the
 * `@opentui/solid` JSX runtime (Bun's test loader can't resolve `jsxDEV` from
 * that module, per useServer.test.ts). The state factory lives in this JSX-free
 * module so importing it never pulls in the TUI renderer.
 */

import { describe, expect, it } from "bun:test"
import { createSignal } from "solid-js"
import { createPermissionsState } from "./permissions-state"
import { DEFAULT_PERMISSIONS, type PermissionTool } from "./config"

describe("createPermissionsState", () => {
  it("seeds the working copy from the source accessor", () => {
    const [src] = createSignal({ ...DEFAULT_PERMISSIONS, bash: false })
    const state = createPermissionsState(src, () => {})
    expect(state.working().bash).toBe(false)
    expect(state.working().edit).toBe(true)
  })

  it("toggle flips a flag and forwards the new value via onToggle", () => {
    const [src] = createSignal(DEFAULT_PERMISSIONS)
    // Capture in an array so TS doesn't narrow a `let` to its initial `null`.
    const calls: Array<{ tool: PermissionTool; value: boolean }> = []
    const state = createPermissionsState(src, (tool, value) =>
      calls.push({ tool, value }),
    )

    expect(state.working().bash).toBe(true)
    state.toggle("bash")
    expect(state.working().bash).toBe(false)
    expect(calls).toEqual([{ tool: "bash", value: false }])

    // Toggle back.
    state.toggle("bash")
    expect(state.working().bash).toBe(true)
    expect(calls).toEqual([
      { tool: "bash", value: false },
      { tool: "bash", value: true },
    ])
  })

  it("toggle on one tool does not affect the others", () => {
    const [src] = createSignal(DEFAULT_PERMISSIONS)
    const state = createPermissionsState(src, () => {})
    state.toggle("edit")
    expect(state.working().edit).toBe(false)
    expect(state.working().bash).toBe(true)
    expect(state.working().webfetch).toBe(true)
  })

  it("setActiveIndex moves keyboard focus", () => {
    const [src] = createSignal(DEFAULT_PERMISSIONS)
    const state = createPermissionsState(src, () => {})
    expect(state.activeIndex()).toBe(0)
    state.setActiveIndex(2)
    expect(state.activeIndex()).toBe(2)
  })
})
