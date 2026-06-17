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

  return {
    show,
    replace,
    clear,
    pop,
    stack,
    hasDialogs,
  }
}
