/**
 * Toast controller factory.
 *
 * Builds the value exposed by useToast() — a single-toast controller with
 * show / error / currentToast and an auto-hide timer.
 *
 * Lives in a pure .ts file (no JSX) so it can be unit-tested inside a bare
 * createRoot: importing a .tsx file under jsxImportSource: "@opentui/solid"
 * fails in bun:test because the @opentui/solid JSX runtime is not loadable
 * without a DOM. ToastContext.tsx re-exports it for the public API.
 *
 * The factory uses onCleanup to clear its auto-hide timer when the surrounding
 * reactive owner disposes; tests must call this from a createRoot and invoke
 * dispose() to deterministically clear the timer (preventing leaks across tests).
 */

import { createSignal, onCleanup, type Accessor } from "solid-js"
import { t } from "../lib/i18n"
import { toErrorMessage } from "../lib/format"

export type ToastVariant = "info" | "success" | "warning" | "error"

export interface ToastOptions {
  title?: string
  message: string
  variant: ToastVariant
  duration?: number
}

export interface ToastContextValue {
  show: (options: ToastOptions) => void
  error: (err: unknown) => void
  currentToast: Accessor<ToastOptions | null>
}

/**
 * Default auto-hide duration (ms). Matches the previous inline default
 * at `ToastContext.tsx:56`.
 */
const DEFAULT_TOAST_DURATION_MS = 5000

/**
 * Build a toast controller.
 *
 * Must be called inside a Solid reactive owner (e.g. inside a
 * `createRoot`, a component body, or the `ToastProvider` factory).
 * The returned `currentToast` accessor is reactive.
 */
export function createToastController(): ToastContextValue {
  const [currentToast, setCurrentToast] = createSignal<ToastOptions | null>(null)
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const show = (options: ToastOptions) => {
    setCurrentToast(options)

    if (timeoutId) clearTimeout(timeoutId)

    const duration = options.duration ?? DEFAULT_TOAST_DURATION_MS
    timeoutId = setTimeout(() => {
      setCurrentToast(null)
    }, duration)
  }

  const error = (err: unknown) => {
    const message = toErrorMessage(err)
    show({
      title: t("errorTitle"),
      message,
      variant: "error",
    })
  }

  // Avoid firing a timer on a disposed signal if the owner unmounts.
  onCleanup(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })

  return {
    show,
    error,
    currentToast,
  }
}
