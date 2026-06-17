/**
 * Dialog controller factory.
 *
 * Builds the value exposed by `useDialog()` — a stack-based modal manager
 * with `show` / `replace` / `clear` / `pop` / `stack` / `hasDialogs`.
 *
 * Lives in a pure `.ts` file (no JSX) so it can be unit-tested inside
 * a bare `createRoot` (per `docs/testing.md`, importing a `.tsx` file
 * under `jsxImportSource: "@opentui/solid"` fails in `bun:test` because
 * the `@opentui/solid` JSX runtime is not loadable without a DOM).
 * `DialogContext.tsx` re-exports it for the public API.
 *
 * Source: MEJORAS.md Finding 18.2.F.
 */

import { createSignal, type Accessor } from "solid-js"
import type { JSX } from "solid-js"

/**
 * A dialog component in the stack
 */
export type DialogComponent = () => JSX.Element

/**
 * Value provided by the DialogContext
 */
export interface DialogContextValue {
  /** Push a dialog onto the stack */
  show: (component: DialogComponent) => void
  /** Clear all dialogs and push a new one */
  replace: (component: DialogComponent) => void
  /** Pop all dialogs from the stack */
  clear: () => void
  /** Pop the top dialog from the stack (use for Escape key handling) */
  pop: () => void
  /** Current dialog stack accessor */
  stack: Accessor<DialogComponent[]>
  /** Check if any dialogs are open */
  hasDialogs: Accessor<boolean>
  /**
   * Top of the stack — the dialog currently mounted by `DialogStack`,
   * or `undefined` when the stack is empty.
   *
   * Pins the "top-only render contract" of `DialogStack` at the data
   * layer: the JSX render of `<Show when={top()} keyed>` depends on
   * this returning the correct value, and the `keyed` prop is what
   * causes the child to re-mount when the top's identity changes.
   *
   * Source: MEJORAS.md Finding 18.3.C.
   */
  top: Accessor<DialogComponent | undefined>
}

/**
 * Build a dialog controller.
 *
 * Must be called inside a Solid reactive owner (e.g. inside a
 * `createRoot`, a component body, or the `DialogProvider` factory).
 * The returned `stack` and `hasDialogs` accessors are reactive.
 */
export function createDialogController(): DialogContextValue {
  const [stack, setStack] = createSignal<DialogComponent[]>([])

  /**
   * Push a dialog onto the stack
   */
  const show = (component: DialogComponent) => {
    setStack((prev) => [...prev, component])
  }

  /**
   * Clear all dialogs and push a new one
   */
  const replace = (component: DialogComponent) => {
    setStack([component])
  }

  /**
   * Pop all dialogs from the stack
   */
  const clear = () => {
    setStack([])
  }

  /**
   * Pop the top dialog from the stack
   */
  const pop = () => {
    setStack((prev) => {
      if (prev.length === 0) return prev
      return prev.slice(0, -1)
    })
  }

  /**
   * Check if any dialogs are open
   */
  const hasDialogs = () => stack().length > 0

  /**
   * Return the top of the stack (the dialog currently mounted by
   * `DialogStack`), or `undefined` if the stack is empty.
   *
   * Reads `stack()` once into a local and indexes into the copy, so
   * the JSX consumer subscribes to the stack signal a single time
   * per change (not twice via `stack()[stack().length - 1]`).
   *
   * Source: MEJORAS.md Finding 18.3.C.
   */
  const top = (): DialogComponent | undefined => {
    const s = stack()
    return s.length > 0 ? s[s.length - 1] : undefined
  }

  return {
    show,
    replace,
    clear,
    pop,
    stack,
    hasDialogs,
    top,
  }
}
