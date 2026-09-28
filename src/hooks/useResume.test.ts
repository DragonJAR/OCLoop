/**
 * Unit tests for useResume.
 *
 * Runs scenarios through Bun.spawn([process.execPath, "run", ...]) to bypass
 * bun:test's JSX runtime limitations with @opentui/solid.
 */

import type { ResumeDeps } from "./useResume"
import type { PersistedLoopState } from "../lib/loop-state-store"

if (process.env.OCLOOP_RESUME_TEST !== "1") {
  const { test, expect } = await import("bun:test")

  const scenarios = [
    "debug_flag",
    "run_flag",
    "crash_iter_0_running",
    "crash_iter_0_session",
    "cleanup_stale_snapshot",
    "auto_resume",
    "dialog_callbacks",
  ]

  for (const scenario of scenarios) {
    test(`useResume scenario: ${scenario}`, async () => {
      const child = Bun.spawn([process.execPath, "run", import.meta.path, scenario], {
        cwd: new URL("../..", import.meta.url).pathname,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, OCLOOP_RESUME_TEST: "1" },
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      if (code !== 0) {
        console.error(stdout, stderr)
      }
      expect({ code, output: stdout + stderr }).toEqual({ code: 0, output: "" })
    }, 15000)
  }
} else {
  function assertEqual(actual: any, expected: any, msg?: string) {
    if (actual !== expected) throw new Error(`${msg ?? "Assertion failed"}: expected ${expected}, got ${actual}`)
  }
  function assertNotEqual(actual: any, expected: any, msg?: string) {
    if (actual === expected) throw new Error(`${msg ?? "Assertion failed"}: expected not ${expected}, got ${actual}`)
  }
  function assertDeepEqual(actual: any, expected: any) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    }
  }
  function assertTrue(val: boolean, msg?: string) {
    if (!val) throw new Error(`${msg ?? "Assertion failed"}: expected true, got false`)
  }

  const { mkdtempSync, rmSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { mock } = await import("bun:test")
  mock.module("../ui/DialogConfirm", () => ({
    DialogConfirm: (props: any) => ({ type: "DialogConfirm", props }),
  }))

  const { useResume } = await import("./useResume")
  const {
    saveLoopState,
    loadLoopState,
  } = await import("../lib/loop-state-store")
  const { t } = await import("../lib/i18n")
  const type_LoopAction = {} as import("../types").LoopAction

  const prevCwd = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), "ocloop-use-resume-"))
  process.chdir(dir)

  interface TestHarness {
    dispatched: any[]
    dialogShown: any[]
    dialogCleared: boolean
    debugCreated: boolean
    deps: ResumeDeps
  }

  function createHarness(overrides: Partial<ResumeDeps> = {}): TestHarness {
    const harness: TestHarness = {
      dispatched: [],
      dialogShown: [],
      dialogCleared: false,
      debugCreated: false,
      deps: {} as ResumeDeps,
    }

    const deps: ResumeDeps = {
      debug: false,
      run: false,
      planFile: undefined,
      loop: {
        dispatch: (a: any) => {
          harness.dispatched.push(a)
        },
        state: { type: "idle" } as any,
      } as any,
      cooldown: {
        cancel: () => {},
        setAttempts: () => {},
        isActive: () => false,
        remainingSeconds: () => 0,
      } as any,
      watchdog: {
        setAttempts: () => {},
        attempts: () => 0,
        feed: () => {},
        notifyIterationStart: () => {},
      } as any,
      activityLog: {
        addEvent: () => {},
        events: () => [],
        clear: () => {},
      } as any,
      dialog: {
        show: (comp: any) => {
          harness.dialogShown.push(comp)
        },
        replace: () => {},
        clear: () => {
          harness.dialogCleared = true
        },
        pop: () => {},
        stack: (() => []) as any,
        hasDialogs: (() => false) as any,
        top: (() => undefined) as any,
      },
      t,
      resilience: () => ({
        resume: false,
        maxRetries: 3,
        cooldownSeconds: 5,
        watchdogTimeoutMinutes: 10,
      } as any),
      serverUrl: () => null,
      createDebugSession: async () => {
        harness.debugCreated = true
      },
      reconcileAndAdvance: async () => "missing",
      ...overrides,
    }

    harness.deps = deps
    return harness
  }

  const scenario = process.argv[2]

  try {
    if (scenario === "debug_flag") {
      const harness = createHarness({ debug: true })
      const { initializeSession } = useResume(harness.deps)
      await initializeSession()
      assertEqual(harness.debugCreated, true)
      assertEqual(harness.dialogShown.length, 0)
    } else if (scenario === "run_flag") {
      const harness = createHarness({ run: true })
      const { initializeSession } = useResume(harness.deps)
      await initializeSession()
      assertDeepEqual(harness.dispatched, [{ type: "start" }])
      assertEqual(harness.dialogShown.length, 0)
    } else if (scenario === "crash_iter_0_running") {
      const state: PersistedLoopState = {
        version: 1,
        iteration: 0,
        sessionId: null,
        stateType: "running",
        rateLimitAttempts: 0,
        updatedAt: new Date().toISOString(),
      }
      await saveLoopState(state)

      const harness = createHarness()
      const { initializeSession } = useResume(harness.deps)
      await initializeSession()
      assertEqual(harness.dialogShown.length, 1)

      const remaining = await loadLoopState()
      assertNotEqual(remaining, null)
      assertEqual(remaining?.stateType, "running")
    } else if (scenario === "crash_iter_0_session") {
      const state: PersistedLoopState = {
        version: 1,
        iteration: 0,
        sessionId: "sess-crash-0",
        stateType: "idle",
        rateLimitAttempts: 0,
        updatedAt: new Date().toISOString(),
      }
      await saveLoopState(state)

      const harness = createHarness()
      const { initializeSession } = useResume(harness.deps)
      await initializeSession()
      assertEqual(harness.dialogShown.length, 1)
    } else if (scenario === "cleanup_stale_snapshot") {
      const state: PersistedLoopState = {
        version: 1,
        iteration: 0,
        sessionId: null,
        stateType: "stopped",
        rateLimitAttempts: 0,
        updatedAt: new Date().toISOString(),
      }
      await saveLoopState(state)

      const harness = createHarness({ run: true })
      const { initializeSession } = useResume(harness.deps)
      await initializeSession()
      assertEqual(harness.dialogShown.length, 0)
      assertDeepEqual(harness.dispatched, [{ type: "start" }])

      // Wait a microtick for void clearLoopState()
      await Bun.sleep(50)
      const remaining = await loadLoopState()
      assertEqual(remaining, null)
    } else if (scenario === "auto_resume") {
      const state: PersistedLoopState = {
        version: 1,
        iteration: 2,
        sessionId: "sess-auto",
        stateType: "running",
        rateLimitAttempts: 0,
        updatedAt: new Date().toISOString(),
      }
      await saveLoopState(state)

      const harness = createHarness({
        resilience: () => ({
          resume: true,
          maxRetries: 3,
          cooldownSeconds: 5,
          watchdogTimeoutMinutes: 10,
        } as any),
      })
      const { initializeSession } = useResume(harness.deps)
      await initializeSession()
      assertEqual(harness.dialogShown.length, 0)
      assertEqual(harness.dispatched.some((a) => a.type === "resume_session"), true)
    } else if (scenario === "dialog_callbacks") {
      const state: PersistedLoopState = {
        version: 1,
        iteration: 1,
        sessionId: "sess-dlg",
        stateType: "running",
        rateLimitAttempts: 0,
        updatedAt: new Date().toISOString(),
      }
      await saveLoopState(state)

      const harness = createHarness({ run: true })
      const { initializeSession } = useResume(harness.deps)
      await initializeSession()
      assertEqual(harness.dialogShown.length, 1)

      const dialogRenderer = harness.dialogShown[0]
      const dialogEl = dialogRenderer()

      assertNotEqual(dialogEl, undefined)
      assertEqual(typeof dialogEl.props.onConfirm, "function")
      assertEqual(typeof dialogEl.props.onCancel, "function")

      // Execute onConfirm & onCancel without unhandled rejection
      dialogEl.props.onConfirm()
      dialogEl.props.onCancel()
      assertEqual(harness.dispatched.some((a) => a.type === "start"), true)
    }
  } finally {
    process.chdir(prevCwd)
    rmSync(dir, { recursive: true, force: true })
  }
}
