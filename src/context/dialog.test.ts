/**
 * createDialogController tests.
 *
 * Source: MEJORAS.md Finding 18.2.F (LOW — `context/*.tsx` and
 * `components/*.tsx` have no test) and Finding 18.3.C (LOW —
 * `DialogContext.tsx` top-only render contract is not pinned).
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
 * pinned at the data layer by the `top` accessor tests below. The
 * JSX render of `<Show when={top()} keyed>` itself is structural
 * and code-reviewed; rendering it would require a Solid root with
 * a DOM, which `bun:test` does not provide (per
 * `docs/solid-hook-testing.md`).
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

describe("createDialogController — top accessor (Finding 18.3.C)", () => {
  // The "top-only render contract" of <DialogStack /> is gated on this
  // accessor. <Show when={top()} keyed> renders exactly one dialog at a
  // time, so the rest of the stack's useKeyboard listeners don't fire
  // on Enter/Escape (sibling-listener collision). The render itself
  // needs a Solid root, but the data-layer contract — "top returns the
  // last element, or undefined when empty" — is pin-able here.

  it("returns undefined when the stack is empty", () => {
    withController((ctrl) => {
      expect(ctrl.top()).toBeUndefined()
    })
  })

  it("returns the only dialog after a single show", () => {
    withController((ctrl) => {
      ctrl.show(A)
      expect(ctrl.top()).toBe(A)
    })
  })

  it("returns the most recently pushed dialog (stack of 3 → top is the third)", () => {
    withController((ctrl) => {
      ctrl.show(A)
      ctrl.show(B)
      ctrl.show(C)
      expect(ctrl.top()).toBe(C)
    })
  })

  it("pop removes the top; the new top is the previously-second", () => {
    withController((ctrl) => {
      ctrl.show(A)
      ctrl.show(B)
      ctrl.show(C)
      ctrl.pop()
      expect(ctrl.top()).toBe(B)
      ctrl.pop()
      expect(ctrl.top()).toBe(A)
    })
  })

  it("pop on an empty stack leaves top as undefined (no throw)", () => {
    withController((ctrl) => {
      ctrl.pop()
      expect(ctrl.top()).toBeUndefined()
    })
  })

  it("clear empties; top is undefined after clear", () => {
    withController((ctrl) => {
      ctrl.show(A)
      ctrl.show(B)
      ctrl.clear()
      expect(ctrl.top()).toBeUndefined()
    })
  })

  it("replace: top is the replaced dialog, regardless of previous", () => {
    withController((ctrl) => {
      ctrl.show(A)
      ctrl.show(B)
      ctrl.replace(C)
      expect(ctrl.top()).toBe(C)
      // Stack length is 1, not 3 — `replace` empties first.
      expect(ctrl.stack()).toEqual([C])
    })
  })
})
