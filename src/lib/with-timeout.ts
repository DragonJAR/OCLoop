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

/**
 * Combine the timeout's signal with an optional caller-supplied signal so the
 * operation aborts if EITHER fires. Falls back gracefully if `AbortSignal.any`
 * is unavailable.
 */
function combineSignals(
  timeoutSignal: AbortSignal,
  external?: AbortSignal,
): AbortSignal {
  if (!external) return timeoutSignal
  const anyFn = (
    AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }
  ).any
  if (typeof anyFn === "function") {
    return anyFn([timeoutSignal, external])
  }
  return timeoutSignal
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
    const signal = combineSignals(controller.signal, externalSignal)
    return typeof task === "function" ? task(signal) : task
  }

  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new TimeoutError(label, ms))
      reject(new TimeoutError(label, ms))
    }, ms)
  })

  try {
    const signal = combineSignals(controller.signal, externalSignal)
    const work = typeof task === "function" ? task(signal) : task
    return await Promise.race([work, timeout])
  } finally {
    // Timer is always cleared — on success, on task error, and on timeout.
    // No dangling handles keep the process alive.
    if (timer) clearTimeout(timer)
  }
}
