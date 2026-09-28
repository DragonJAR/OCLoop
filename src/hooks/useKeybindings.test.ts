import type { LoopState } from "../types"

// Child process uses the real OpenTUI renderer and the application's JSX preload.
if (process.env.OCLOOP_KEY_TEST !== "1") {
  const { test, expect } = await import("bun:test")
  test("Ctrl+C exits every loop state and modal without invoking plain c", async () => {
    const child = Bun.spawn([process.execPath, "run", import.meta.path], {
      cwd: new URL("../..", import.meta.url).pathname,
      env: { ...process.env, OCLOOP_KEY_TEST: "1" }, stdout: "pipe", stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ])
    expect({ code, output: stdout + stderr }).toEqual({ code: 0, output: "" })
  }, 15000)
} else {
  try {
    const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default
    const { testRender } = await import("@opentui/solid")
    const { useKeybindings } = await import("./useKeybindings")
    const { useLoopState } = await import("./useLoopState")
    const { createDialogController } = await import("../context/dialog-controller")
    const { createToastController } = await import("../context/toast-controller")
    const { createTerminalConfigState } = await import("../components/DialogTerminalConfig")
    const { t } = await import("../lib/i18n")
    let loop!: ReturnType<typeof useLoopState>
    const dialog = createDialogController()
    let quits = 0, copies = 0, palettes = 0
    const noop = () => {}
    const r = await testRender(() => {
      loop = useLoopState()
      useKeybindings({
        debug: false, verbose: false, loop, sessionId: () => "session", lastSessionId: () => undefined,
        serverUrl: () => "http://localhost:4096", ocloopConfig: () => ({}), dialog,
        terminalConfigState: createTerminalConfigState(() => [], noop, noop, noop, noop),
        command: { register: noop, show: () => { palettes++ } }, toast: createToastController(), t,
        createDebugSession: async () => {}, sendDebugPrompt: async () => {}, showQuitConfirmation: noop,
        handleQuit: async () => { quits++ }, insertSampleActivity: noop,
        copyAttachCommand: async () => { copies++ }, launchConfiguredTerminal: async () => {},
      })
      return null
    }, { width: 80, height: 24, exitOnCtrlC: false })
    const states: LoopState[] = [
      { type: "starting" }, { type: "ready" }, { type: "running", iteration: 1, sessionId: "session" },
      { type: "paused", iteration: 1 }, { type: "pausing", iteration: 1, sessionId: "session" },
      { type: "cooldown", iteration: 1, sessionId: "session", reason: "rate", resumeAt: 0, attempt: 1, kind: "rate_limit" },
      { type: "stopping" }, { type: "stopped" }, { type: "debug", sessionId: "session" },
      { type: "error", source: "api", message: "error", recoverable: true },
      { type: "complete", iterations: 1, summary: { summary: "done" } },
    ]
    for (const state of states) {
      loop.dispatch({ type: "debug_preview", state })
      for (const modal of [false, true]) {
        if (modal) dialog.show(() => null)
        const before = quits
        r.mockInput.pressCtrlC()
        assert.equal(quits, before + 1, `${state.type}, modal=${modal}`)
        assert.equal(copies, 0)
        dialog.clear()
      }
    }
    loop.dispatch({ type: "debug_preview", state: { type: "running", iteration: 1, sessionId: "session" } })
    r.mockInput.pressKey("c")
    assert.equal(copies, 1)
    r.mockInput.pressKey("c", { meta: true })
    assert.equal(copies, 1)
    r.mockInput.pressKey("p", { ctrl: true })
    assert.equal(palettes, 1)
    dialog.show(() => null)
    r.mockInput.pressKey("p", { ctrl: true })
    assert.equal(palettes, 1)
    r.renderer.destroy()
    process.exit(0)
  } catch (error) { console.error(error); process.exit(1) }
}
