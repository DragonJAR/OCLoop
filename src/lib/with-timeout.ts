/**
 * `withTimeout` — race any async operation against a deadline.
 *
 * On expiry it aborts an `AbortController` (so a cooperating operation can stop
 * its in-flight work) and rejects with a `TimeoutError` carrying the `label` and
 * the elapsed budget. The timer is always cleared, on both the success and the
 * failure path, so no dangling handles keep the process alive.
 *
 * Two call forms:
 *
 *   await withTimeout(somePromise, 5000, "thing")
 *   await withTimeout((signal) => fetch(url, { signal }), 5000, "fetch")
 *
 * The function form receives the timeout's `AbortSignal`, letting the underlying
 * call cancel itself instead of merely being abandoned — this is what the SDK
 * wrappers in `api.ts` use so a hung request is genuinely torn down.
 *
 * A non-finite or non-positive `ms` disables the timeout entirely (the operation
 * runs to completion). This lets a config value of `0` mean "no timeout".
 */

export class TimeoutError extends Error {
  /** The label passed to `withTimeout`, identifying which operation timed out. */
  readonly label: string
  /** The timeout budget in milliseconds that was exceeded. */
  readonly timeoutMs: number

  constructor(label: string, timeoutMs: number) {
    super(`Operation "${label}" timed out after ${timeoutMs}ms`)
    this.name = "TimeoutError"
    this.label = label
    this.timeoutMs = timeoutMs
  }
}

type TimeoutTask<T> = Promise<T> | ((signal: AbortSignal) => Promise<T>)

interface CombinedSignal {
  signal: AbortSignal
  cleanup: () => void
}

/**
 * Combine the timeout's signal with an optional caller-supplied signal so the
 * operation aborts if EITHER fires. Falls back gracefully if `AbortSignal.any`
 * is unavailable. Returns a cleanup function to unsubscribe listeners.
 */
function combineSignals(
  timeoutSignal: AbortSignal,
  external?: AbortSignal,
): CombinedSignal {
  const noop = () => {}
  if (!external) return { signal: timeoutSignal, cleanup: noop }
  const anyFn = (
    AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }
  ).any
  if (typeof anyFn === "function") {
    return { signal: anyFn([timeoutSignal, external]), cleanup: noop }
  }
  const controller = new AbortController()
  const relay = (source: AbortSignal) => {
    if (controller.signal.aborted) return
    controller.abort((source as AbortSignal & { reason?: unknown }).reason)
  }
  const onTimeout = () => relay(timeoutSignal)
  const onExternal = () => relay(external)

  if (timeoutSignal.aborted) {
    relay(timeoutSignal)
    return { signal: controller.signal, cleanup: noop }
  }
  if (external.aborted) {
    relay(external)
    return { signal: controller.signal, cleanup: noop }
  }

  let cleanedUp = false
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    timeoutSignal.removeEventListener("abort", onTimeout)
    external.removeEventListener("abort", onExternal)
    controller.signal.removeEventListener("abort", cleanup)
  }

  timeoutSignal.addEventListener("abort", onTimeout, { once: true })
  external.addEventListener("abort", onExternal, { once: true })
  controller.signal.addEventListener("abort", cleanup, { once: true })

  return { signal: controller.signal, cleanup }
}

export async function withTimeout<T>(
  task: TimeoutTask<T>,
  ms: number,
  label: string,
  externalSignal?: AbortSignal,
): Promise<T> {
  // Disabled timeout: run the task to completion with no deadline.
  if (!Number.isFinite(ms) || ms <= 0) {
    const controller = new AbortController()
    const { signal, cleanup } = combineSignals(controller.signal, externalSignal)
    try {
      return await (typeof task === "function" ? task(signal) : task)
    } finally {
      cleanup()
    }
  }

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cleanupSignals = () => {}

  const timeoutError = new TimeoutError(label, ms)
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError)
      queueMicrotask(() => controller.abort(timeoutError))
    }, ms)
  })

  try {
    const combined = combineSignals(controller.signal, externalSignal)
    cleanupSignals = combined.cleanup
    const work = typeof task === "function" ? task(combined.signal) : task
    return await Promise.race([work, timeout])
  } finally {
    // Timer is always cleared — on success, on task error, and on timeout.
    // No dangling handles keep the process alive.
    if (timer) clearTimeout(timer)
    cleanupSignals()
  }
}
