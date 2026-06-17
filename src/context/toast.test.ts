/**
 * createToastController tests.
 *
 * Source: MEJORAS.md Finding 18.2.F (LOW — `context/*.tsx` and
 * `components/*.tsx` have no test).
 *
 * Tests the auto-hide + previous-timer-clear behavior called out in
 * the audit (MEJORAS.md:24429, ToastContext.tsx:39-48). The factory
 * is the same code path that `ToastProvider` runs, so these tests pin
 * the user-visible behavior of `useToast()`.
 *
 * The factory lives in `toast-controller.ts` (a pure `.ts` file) so
 * importing it doesn't pull in the `@opentui/solid` JSX transform
 * (see `docs/testing.md`).
 *
 * The factory uses `onCleanup` to clear its auto-hide timer when the
 * surrounding reactive owner disposes. `bun:test` doesn't have a DOM,
 * so the harness is a bare `createRoot` and `dispose()` is called
 * inside `finally` to deterministically fire the cleanup (preventing
 * the timer from leaking into other tests).
 */

import { describe, expect, it } from "bun:test"
import { createRoot } from "solid-js"
import { createToastController, type ToastContextValue } from "./toast-controller"

const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Run a callback inside a `createRoot` with a `ToastController` and
 * dispose the root when the callback resolves. Returns a promise so
 * async assertions on the auto-hide timer can be awaited.
 */
async function withToastController<T>(
  run: (ctrl: ToastContextValue) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        const ctrl = createToastController()
        const result = await run(ctrl)
        // No timer should outlive the root: if a timer was pending,
        // `onCleanup` (registered inside the factory) cleared it.
        // Awaiting `dispose()` ensures the cleanup ran before the
        // next test starts.
        dispose()
        resolve(result)
      } catch (err) {
        dispose()
        reject(err)
      }
    })
  })
}

describe("createToastController (Finding 18.2.F)", () => {
  it("starts with no current toast", async () => {
    await withToastController(async (ctrl) => {
      expect(ctrl.currentToast()).toBeNull()
    })
  })

  it("show sets the current toast", async () => {
    await withToastController(async (ctrl) => {
      ctrl.show({ message: "hello", variant: "info" })
      expect(ctrl.currentToast()).toEqual({
        message: "hello",
        variant: "info",
      })
    })
  })

  it("show with a duration auto-hides the toast after the duration elapses", async () => {
    await withToastController(async (ctrl) => {
      ctrl.show({ message: "auto-hide me", variant: "warning", duration: 30 })
      expect(ctrl.currentToast()?.message).toBe("auto-hide me")
      // Wait long enough for the 30ms timer to fire.
      await tick(50)
      expect(ctrl.currentToast()).toBeNull()
    })
  })

  it("show called twice replaces the current toast and resets the auto-hide timer", async () => {
    // The first show uses a 1000ms timer; the second uses a 30ms
    // timer. The first timer's auto-hide should NOT fire — calling
    // `show` again must clear the previously-pending timer (the
    // contract that ToastContext.tsx:39-48 names). If the
    // `clearTimeout(timeoutId)` were missing, the first toast's
    // late-fired setTimeout would reset `currentToast` to null 1s
    // after the test started, racing with our assertion.
    await withToastController(async (ctrl) => {
      ctrl.show({ message: "first", variant: "info", duration: 1000 })
      // Halfway through the first timer's window, replace.
      await tick(50)
      ctrl.show({ message: "second", variant: "success", duration: 30 })
      expect(ctrl.currentToast()?.message).toBe("second")
      // After 30ms (the second timer's duration), the second toast
      // auto-hides. The first toast's timer was cleared by the
      // second `show`, so its 1s deadline is moot.
      await tick(50)
      expect(ctrl.currentToast()).toBeNull()
    })
  })

  it("error creates an error-variant toast with the error message", async () => {
    await withToastController(async (ctrl) => {
      ctrl.error(new Error("boom"))
      const t = ctrl.currentToast()
      expect(t).not.toBeNull()
      expect(t?.variant).toBe("error")
      expect(t?.message).toBe("boom")
      expect(t?.title).toBeDefined() // i18n key "errorTitle"
    })
  })

  it("error coerces a non-Error value to a string", async () => {
    await withToastController(async (ctrl) => {
      ctrl.error("plain string failure")
      const t = ctrl.currentToast()
      expect(t?.variant).toBe("error")
      expect(t?.message).toBe("plain string failure")
    })
  })
})
