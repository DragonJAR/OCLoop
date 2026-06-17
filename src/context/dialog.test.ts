/**
 * createDialogController tests.
 *
 * Source: MEJORAS.md Finding 18.2.F (LOW — `context/*.tsx` and
 * `components/*.tsx` have no test).
 *
 * Tests the public value of `useDialog()` by exercising the
 * `createDialogController()` factory inside a bare `createRoot`
 * (per `docs/testing.md`, JSX render is not unit-testable without a
 * DOM). The factory is the same code path that `DialogProvider` runs
 * when it sets up the value, so these tests pin the user-visible
 * behavior of `useDialog()`.
 *
 * The factory lives in `dialog-controller.ts` (a pure `.ts` file) so
 * importing it doesn't pull in the `@opentui/solid` JSX transform
 * (see `docs/testing.md`).
 *
 * The "top-only render contract" of `<DialogStack />` (which is
 * what `useKeyboard` sibling-listener collision is gated on) is
 * structural JSX render code that is not unit-testable without
 * a DOM and is covered by the inline comment at DialogContext.tsx:192-196
 * plus code review.
 */

import { describe, expect, it } from "bun:test"
import { createRoot } from "solid-js"
import {
  createDialogController,
  type DialogComponent,
  type DialogContextValue,
} from "./dialog-controller"

// Three distinct components so we can assert identity / ordering
// (each DialogComponent is a `() => JSX.Element` thunk).
const A: DialogComponent = () => null as never
const B: DialogComponent = () => null as never
const C: DialogComponent = () => null as never

function withController<T>(
  run: (ctrl: DialogContextValue) => T,
): T {
  return createRoot((dispose) => {
    try {
      return run(createDialogController())
    } finally {
      dispose()
    }
  }) as T
}

describe("createDialogController (Finding 18.2.F)", () => {
  it("starts with an empty stack and hasDialogs=false", () => {
    withController((ctrl) => {
      expect(ctrl.stack()).toEqual([])
      expect(ctrl.hasDialogs()).toBe(false)
    })
  })

  it("show pushes a dialog onto the stack", () => {
    withController((ctrl) => {
      ctrl.show(A)
      expect(ctrl.stack()).toEqual([A])
      expect(ctrl.hasDialogs()).toBe(true)

      ctrl.show(B)
      expect(ctrl.stack()).toEqual([A, B])
    })
  })

  it("pop removes the top dialog", () => {
    withController((ctrl) => {
      ctrl.show(A)
      ctrl.show(B)
      ctrl.pop()
      expect(ctrl.stack()).toEqual([A])
      ctrl.pop()
      expect(ctrl.stack()).toEqual([])
      expect(ctrl.hasDialogs()).toBe(false)
    })
  })

  it("pop on an empty stack is a no-op (does not throw, length stays 0)", () => {
    withController((ctrl) => {
      ctrl.pop()
      expect(ctrl.stack()).toEqual([])
      // Second pop is also a no-op.
      ctrl.pop()
      expect(ctrl.stack()).toEqual([])
    })
  })

  it("replace empties the stack and pushes a single dialog", () => {
    withController((ctrl) => {
      ctrl.show(A)
      ctrl.show(B)
      ctrl.replace(C)
      expect(ctrl.stack()).toEqual([C])
      expect(ctrl.hasDialogs()).toBe(true)
    })
  })

  it("clear empties the stack", () => {
    withController((ctrl) => {
      ctrl.show(A)
      ctrl.show(B)
      ctrl.show(C)
      ctrl.clear()
      expect(ctrl.stack()).toEqual([])
      expect(ctrl.hasDialogs()).toBe(false)
    })
  })
})
