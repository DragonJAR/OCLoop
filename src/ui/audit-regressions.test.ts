/** Run JSX through the project's Bun preload; bun:test itself skips that transform. */
if (process.env.OCLOOP_UI_SCENARIO !== "1") {
  const { test, expect } = await import("bun:test")
  for (const scenario of ["selection", "routing", "lifetime", "layout", "activity", "tokens"]) {
    test(`audit TUI regression: ${scenario}`, async () => {
      const child = Bun.spawn([process.execPath, "run", import.meta.path, scenario], {
        cwd: new URL("../..", import.meta.url).pathname,
        stdout: "pipe", stderr: "pipe", env: { ...process.env, OCLOOP_UI_SCENARIO: "1" },
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
      ])
      expect({ code, output: stdout + stderr }).toEqual({ code: 0, output: "" })
    }, 15000)
  }
} else {
  try {
    const assert: typeof import("node:assert/strict") = (await import("node:assert/strict")).default
    const { createComponent } = await import("solid-js")
    const { testRender } = await import("@opentui/solid")
    const { DialogProvider, DialogStack, useDialog, createDialogController } = await import("../context/DialogContext")
    const { DialogSelect } = await import("./DialogSelect")
    const { DialogTierPicker, getRoutingTiers, ROUTING_TIERS } = await import("./DialogTierPicker")
    const { setLocale, t } = await import("../lib/i18n")
    const options = Array.from({ length: 30 }, (_, i) => ({ title: `Model ${i}`, value: `model-${i}` }))
    const tick = async (r: Awaited<ReturnType<typeof testRender>>) => { await r.renderOnce(); await Bun.sleep(30); await r.renderOnce(); await r.renderOnce() }
    const scenario = process.argv[2]
    if (scenario === "selection") {
      let selected = ""
      const r = await testRender(() => createComponent(DialogSelect, {
        title: "Models", onClose: () => {}, options, current: "model-24", onSelect: o => { selected = o.value },
      }), { width: 80, height: 35 })
      await tick(r)
      assert.match(r.captureCharFrame(), /Model 24/)
      r.mockInput.pressEnter()
      assert.equal(selected, "model-24")
      await r.mockInput.typeText("Model 2")
      await tick(r)
      r.mockInput.pressEnter()
      assert.equal(selected, "model-2")
      r.renderer.destroy()
    } else if (scenario === "routing") {
      setLocale("en")
      const roles = getRoutingTiers()
      const english = roles[0].label
      setLocale("es")
      assert.notEqual(roles[0].label, english)
      assert.equal(ROUTING_TIERS[0].label, t("routingHeavyLabel"))
      let result: Record<string, string> | undefined
      const r = await testRender(() => createComponent(DialogTierPicker, {
        tiers: [{ id: "heavy", label: "Heavy" }, { id: "judge", label: "Judge", defaultModel: "model-24" }],
        options, onDone: mapping => { result = mapping },
      }), { width: 80, height: 35 })
      await tick(r)
      await r.mockInput.typeText("no-match")
      r.mockInput.pressTab()
      await tick(r)
      assert.match(r.captureCharFrame(), /Judge/)
      assert.match(r.captureCharFrame(), /Model 24/)
      r.mockInput.pressEnter()
      assert.deepEqual(result, { judge: "model-24" })
      r.renderer.destroy()
    } else if (scenario === "lifetime") {
      const { DialogConfirm } = await import("./DialogConfirm")
      const { DialogPrompt } = await import("./DialogPrompt")
      const c = createDialogController()
      for (const remove of [() => c.clear(), () => c.replace(() => null), () => c.pop()]) {
        const result = DialogTierPicker.show(c, getRoutingTiers(), options)
        remove()
        assert.deepEqual(await result, {})
      }
      assert.deepEqual(await DialogTierPicker.show(c, [], options), {})
      let dialog!: ReturnType<typeof useDialog>
      const r = await testRender(() => createComponent(DialogProvider, {
        get children() {
          dialog = useDialog()
          return createComponent(DialogStack, {})
        },
      }), { width: 80, height: 35 })
      const result = DialogTierPicker.show(dialog, [{ id: "heavy", label: "Heavy", defaultModel: "model-24" }], options)
      let settled = false
      void result.then(() => { settled = true })
      await tick(r)
      dialog.show(() => null)
      await tick(r)
      assert.equal(settled, false, "covering a dialog must not cancel it")
      dialog.pop()
      await tick(r)
      r.mockInput.pressEnter()
      assert.deepEqual(await result, { heavy: "model-24" })
      const confirmation = DialogConfirm.show(dialog, "Confirm", "Continue?")
      await tick(r)
      r.mockInput.pressEnter()
      assert.equal(await confirmation, true)
      const prompt = DialogPrompt.show(dialog)
      await tick(r)
      dialog.clear()
      assert.equal(await prompt, null)
      const pending = DialogTierPicker.show(dialog, getRoutingTiers(), options)
      await tick(r)
      r.renderer.destroy()
      assert.deepEqual(await pending, {})
    } else if (scenario === "layout") {
      const { Dashboard } = await import("../components/Dashboard")
      const { useLoopStats } = await import("../hooks/useLoopStats")
      setLocale("es")
      const r = await testRender(() => createComponent(Dashboard, {
        isActive: true, state: { type: "running", iteration: 4, sessionId: "session" },
        progress: { total: 12, completed: 4, manual: 0, blocked: 0, percentComplete: 33, pending: 8, automatable: 8 },
        currentTask: "Tarea", stats: useLoopStats(),
      }), { width: 40, height: 24 })
      await tick(r)
      const frame = r.captureCharFrame()
      assert.match(frame, /EJECUTANDO/)
      assert.match(frame, /\[4\/12\] 33%/)
      assert.match(frame, /Space pausar/)
      assert.match(frame, /Ctrl\+P comandos/)
      assert.match(frame, /Q salir/)
      r.resize(80, 24)
      await tick(r)
      r.resize(32, 24)
      await tick(r)
      assert.match(r.captureCharFrame(), /Ctrl\+P comandos/)
      r.renderer.destroy()
    } else if (scenario === "activity") {
      const { ActivityLog } = await import("../components/ActivityLog")
      const { ScrollBoxRenderable } = await import("@opentui/core")
      let dialog!: ReturnType<typeof useDialog>
      const r = await testRender(() => createComponent(DialogProvider, {
        get children() {
          dialog = useDialog()
          return createComponent(ActivityLog, { events: Array.from({ length: 40 }, (_, i) => ({
            id: i, type: "assistant_message" as const, timestamp: new Date(), message: "A".repeat(65) + "TAIL", 
          })) })
        },
      }), { width: 80, height: 15 })
      await tick(r)
      function find(node: import("@opentui/core").Renderable): import("@opentui/core").ScrollBoxRenderable | undefined {
        if (node instanceof ScrollBoxRenderable) return node
        for (const child of node.getChildren()) { const found = find(child); if (found) return found }
      }
      const scroll = find(r.renderer.root)!
      assert.ok(scroll.focused)
      const before = scroll.scrollTop
      r.mockInput.pressArrow("up")
      await tick(r)
      assert.ok(scroll.scrollTop < before)
      dialog.show(() => null)
      await tick(r)
      assert.equal(scroll.focused, false)
      dialog.clear()
      await tick(r)
      assert.ok(scroll.focused)
      assert.doesNotMatch(r.captureCharFrame(), /TAIL/)
      r.resize(120, 15)
      await tick(r)
      assert.match(r.captureCharFrame(), /TAIL/)
      r.renderer.destroy()
    } else if (scenario === "tokens") {
      const { totalDisplayTokens, BottomPanel } = await import("../components/BottomPanel")
      const { useSessionStats } = await import("../hooks/useSessionStats")
      const { useLoopStats } = await import("../hooks/useLoopStats")
      const stats = useSessionStats()
      stats.addTokens({ input: 100, output: 200, cacheRead: 300, cacheWrite: 400 })
      assert.equal(totalDisplayTokens(stats.tokens()), stats.totalTokens())
      assert.equal(totalDisplayTokens(stats.taskTokens()), 1000)
      const r = await testRender(() => createComponent(BottomPanel, {
        currentTask: "Task", stats: useLoopStats(), get tokens() { return stats.tokens() },
        get taskTokens() { return stats.taskTokens() }, cost: 0,
      }), { width: 100, height: 24 })
      await tick(r)
      assert.match(r.captureCharFrame(), /1,000/)
      stats.resetTaskTokens()
      assert.equal(totalDisplayTokens(stats.taskTokens()), 0)
      assert.equal(totalDisplayTokens(stats.tokens()), 1000)
      r.renderer.destroy()
    }
    process.exit(0)
  } catch (error) { console.error(error); process.exit(1) }
}
