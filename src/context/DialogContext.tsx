/**
 * Dialog Context Provider
 *
 * Provides a stack-based dialog manager for modal dialogs.
 * Supports showing, replacing, and clearing dialogs.
 *
 * Note: Escape key handling should be implemented in the parent component
 * that manages the input handler (typically App.tsx). Use the `pop()` method
 * to dismiss the top dialog on Escape.
 *
 * The actual controller lives in `dialog-controller.ts` (a pure `.ts`
 * module) so it can be unit-tested without the JSX transform getting
 * in the way (see `docs/testing.md`).
 */

import {
  createContext,
  useContext,
  Show,
  type JSX,
} from "solid-js"
import {
  createDialogController,
  type DialogComponent,
  type DialogContextValue,
} from "./dialog-controller"

export {
  createDialogController,
  type DialogComponent,
  type DialogContextValue,
}

/**
 * The Dialog Context
 */
const DialogContext = createContext<DialogContextValue | undefined>(undefined)

/**
 * Props for DialogProvider
 */
export interface DialogProviderProps {
  children: JSX.Element
}

/**
 * Dialog Provider Component
 *
 * Wraps the application and provides dialog management via context.
 *
 * Note: Escape key handling must be implemented in the component that
 * manages the renderer's input handler. Call `dialog.pop()` when Escape
 * is pressed and `dialog.hasDialogs()` is true.
 *
 * @example
 * ```tsx
 * <DialogProvider>
 *   <App />
 *   <DialogStack />
 * </DialogProvider>
 * ```
 */
export function DialogProvider(props: DialogProviderProps) {
  const value = createDialogController()

  return (
    <DialogContext.Provider value={value}>
      {props.children}
    </DialogContext.Provider>
  )
}

/**
 * Hook to access the dialog manager
 *
 * @returns DialogContextValue with show, replace, clear, pop, and stack
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const dialog = useDialog()
 *
 *   const showConfirmation = () => {
 *     dialog.show(() => (
 *       <Dialog onClose={() => dialog.clear()}>
 *         <text>Are you sure?</text>
 *       </Dialog>
 *     ))
 *   }
 *
 *   return <button onClick={showConfirmation}>Show Dialog</button>
 * }
 * ```
 */
export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext)

  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider")
  }

  return context
}

/**
 * Component to render the dialog stack
 *
 * Place this at the top level of your app to render active dialogs.
 * The DialogStack should be placed after the main content so dialogs
 * render on top.
 *
 * @example
 * ```tsx
 * <DialogProvider>
 *   <App />
 *   <DialogStack />
 * </DialogProvider>
 * ```
 */
export function DialogStack() {
  const { top } = useDialog()

  // Render ONLY the top dialog. The `top` accessor on the controller
  // is the data-layer contract for "which dialog is at the top" —
  // pinned by `dialog.test.ts` (see Finding 18.3.C); the `keyed` prop
  // on `<Show>` is the render-layer contract for "re-mount on identity
  // change". Each dialog registers a global keypress listener via
  // useKeyboard, and `preventDefault()` does not stop sibling listeners
  // — so rendering every stacked dialog would make Enter/Escape fire
  // on all of them. Keeping just the top mounted means exactly one
  // dialog handles input; popping it re-mounts the one beneath.
  return (
    <Show when={top()} keyed>
      {(DialogComponent) => <DialogComponent />}
    </Show>
  )
}
