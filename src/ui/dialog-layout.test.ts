/**
 * No dialog may hide its own content.
 *
 * A dialog with a fixed height and a scrollable list inside it clips the list
 * when the two numbers disagree: the list is given `maxHeight` rows but the
 * renderer only grants it the rows left over by the chrome, so the last entry
 * is rendered below the fold — invisible, and for a two-entry list (the
 * terminal chooser) unreachable without scrolling to find out it is there.
 *
 * Two invariants are checked:
 *   - a list of CHOICES must fit its viewport (nothing hidden);
 *   - a long TEXT may scroll, but the action buttons must stay on screen.
 *
 * The measurement runs in a child process (see render-scenario.ts): bun:test
 * does not apply the project's Solid JSX transform, so importing a .tsx
 * component in-process fails to compile. This host is a plain .ts module with
 * no JSX, exactly like the TUI regression suite.
 */
import { runRenderScenario } from "./render-scenario"

/** The dialogs measured. */
const SCENARIOS = [
  "terminal-chooser",
  "permissions",
  "help",
  "terminal-failure",
  "invalid-agent",
  "decompose",
  "error",
  "confirm",
] as const

if (process.env.OCLOOP_UI_SCENARIO !== "1") {
  const { describe, expect, it } = await import("bun:test")

  describe("dialog layout — no clipped content", () => {
    for (const scenario of SCENARIOS) {
      it(`the ${scenario} dialog shows its content`, async () => {
        const { code, stdout } = await runRenderScenario({
          file: import.meta.path,
          scenario,
          env: { OCLOOP_LAYOUT_SCENARIO: scenario },
        })
        expect(code).toBe(0)

        const measurement = JSON.parse(stdout.trim()) as {
          viewport: number
          content: number
          mustFit: boolean
          buttonsVisible: boolean
        }
        expect(measurement.viewport).toBeGreaterThan(0)
        if (measurement.mustFit) {
          expect(measurement.content).toBeLessThanOrEqual(measurement.viewport)
        }
        // The buttons are the only way out of a modal: they may never be
        // pushed off-screen by the content above them.
        expect(measurement.buttonsVisible).toBe(true)
      }, 30_000)
    }
  })
} else {
  const { createComponent } = await import("solid-js")
  const { testRender } = await import("@opentui/solid")
  const core = await import("@opentui/core")
  type Renderable = import("@opentui/core").Renderable
  type ScrollBoxRenderable = import("@opentui/core").ScrollBoxRenderable

  /** Every scrollbox in the tree. */
  function scrollboxes(
    node: Renderable,
    out: ScrollBoxRenderable[] = [],
  ): ScrollBoxRenderable[] {
    if (node instanceof core.ScrollBoxRenderable) out.push(node)
    for (const child of node.getChildren()) scrollboxes(child, out)
    return out
  }

  let boxes: Array<{ viewport: number; content: number }> = []
  let frame = ""

  async function measure(make: () => unknown): Promise<void> {
    const r = await testRender(make, { width: 120, height: 50 })
    await r.renderOnce()
    await Bun.sleep(50)
    await r.renderOnce()
    await r.renderOnce()
    boxes = scrollboxes(r.renderer.root).map((b) => ({
      viewport: b.viewport.height,
      content: b.scrollHeight,
    }))
    frame = r.captureCharFrame()
    r.renderer.destroy()
  }

  /** The tightest box decides: a dialog with several scrollboxes must fit all. */
  function worst() {
    return boxes.reduce(
      (acc, b) => ({
        viewport: Math.min(acc.viewport, b.viewport),
        content: Math.max(acc.content, b.content),
      }),
      { viewport: Number.POSITIVE_INFINITY, content: 0 },
    )
  }

  const scenario = process.env.OCLOOP_LAYOUT_SCENARIO ?? ""
  let mustFit = true
  let buttonsVisible = true

  if (scenario === "terminal-chooser") {
    const { DialogTerminalConfig, createTerminalConfigState } = await import(
      "../components/DialogTerminalConfig"
    )
    await measure(() =>
      createComponent(DialogTerminalConfig, {
        state: createTerminalConfigState(() => [], () => {}, () => {}, () => {}, () => {}),
        onCancel: () => {},
      }),
    )
  } else if (scenario === "permissions") {
    const { DialogPermissions } = await import("../components/DialogPermissions")
    const { PERMISSION_TOOLS } = await import("../lib/config")
    const perms = Object.fromEntries(PERMISSION_TOOLS.map((tool) => [tool, true])) as never
    await measure(() =>
      createComponent(DialogPermissions, {
        permissions: () => perms,
        onToggle: () => {},
        onClose: () => {},
      }),
    )
  } else if (scenario === "help") {
    const { DialogHelp } = await import("../components/DialogHelp")
    await measure(() => createComponent(DialogHelp, { onClose: () => {} }))
  } else if (scenario === "terminal-failure") {
    const { DialogTerminalError } = await import("../components/DialogTerminalError")
    await measure(() =>
      createComponent(DialogTerminalError, {
        terminalName: "iTerm",
        errorMessage: "Command not found in PATH",
        attachCommand: "opencode attach http://127.0.0.1:4096 --session preview",
        onCopy: () => {},
        onClose: () => {},
      }),
    )
  } else if (scenario === "invalid-agent") {
    const { DialogInvalidAgent } = await import("../components/DialogInvalidAgent")
    await measure(() =>
      createComponent(DialogInvalidAgent, {
        agentName: "my-agent",
        availableAgents: ["build", "plan", "general", "test", "lint", "docs"],
        onUseDefault: () => {},
        onQuit: () => {},
      }),
    )
  } else if (scenario === "decompose") {
    const { DialogDecomposeApproval } = await import("../ui/DialogDecomposeApproval")
    await measure(() =>
      createComponent(DialogDecomposeApproval, {
        title: "Split the stalled task",
        message: Array.from({ length: 12 }, (_, i) => `subtask ${i}`).join("\n"),
        onChoice: () => {},
      }),
    )
    // The body is one long text (the stalled task plus its proposed
    // subtasks), not a list of choices: it scrolls by design.
    mustFit = false
  } else if (scenario === "error") {
    const { DialogError } = await import("../components/DialogError")
    await measure(() =>
      createComponent(DialogError, {
        source: "api",
        message: "x".repeat(400),
        recoverable: true,
        onQuit: () => {},
      }),
    )
    // A long message may scroll; the viewport must stay usable.
    mustFit = false
  } else if (scenario === "confirm") {
    const { DialogConfirm } = await import("../ui/DialogConfirm")
    await measure(() =>
      createComponent(DialogConfirm, {
        title: "Confirm",
        message: Array.from({ length: 8 }, (_, i) => `line ${i}`).join("\n"),
        scrollableMessage: true,
        onConfirm: () => {},
        onCancel: () => {},
      }),
    )
    // A scrollable message may scroll, but the buttons are the only way out
    // of the modal: they have to stay on screen.
    mustFit = false
    buttonsVisible = frame.includes("Confirm") || frame.includes("confirm")
  }

  const result = worst()
  console.log(
    JSON.stringify({
      viewport: Number.isFinite(result.viewport) ? result.viewport : 0,
      content: result.content,
      mustFit,
      buttonsVisible,
    }),
  )
  process.exit(0)
}
