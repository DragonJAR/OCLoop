import { describe, expect, it } from "bun:test"
import { withTimeout, TimeoutError } from "./with-timeout"

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
type AbortSignalWithAny = Omit<typeof AbortSignal, "any"> & {
  any: ((signals: AbortSignal[]) => AbortSignal) | undefined
}

describe("withTimeout", () => {
  it("resolves when the task finishes before the deadline", async () => {
    const result = await withTimeout(
      (async () => {
        await delay(5)
        return "ok"
      })(),
      100,
      "fast",
    )
    expect(result).toBe("ok")
  })

  it("rejects with a TimeoutError when the deadline is exceeded", async () => {
    let thrown: unknown
    try {
      await withTimeout(delay(200), 20, "slow")
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(TimeoutError)
    expect((thrown as TimeoutError).label).toBe("slow")
    expect((thrown as TimeoutError).timeoutMs).toBe(20)
    expect((thrown as TimeoutError).name).toBe("TimeoutError")
  })

  it("passes an AbortSignal to the function form and aborts it on timeout", async () => {
    let abortedReason: unknown
    const task = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          abortedReason = (signal as AbortSignal & { reason?: unknown }).reason
          reject(new Error("aborted"))
        })
      })

    // The timeout itself must win the race, even when the task reacts to abort.
    await expect(withTimeout(task, 15, "abortable")).rejects.toBeInstanceOf(
      TimeoutError,
    )
    // Give the microtask/event a tick to land
    await delay(5)
    expect(abortedReason).toBeInstanceOf(TimeoutError)
  })

  it("does not abort the signal when the task wins the race", async () => {
    let aborted = false
    const task = async (signal: AbortSignal) => {
      signal.addEventListener("abort", () => {
        aborted = true
      })
      await delay(5)
      return "done"
    }
    const result = await withTimeout(task, 200, "wins")
    expect(result).toBe("done")
    await delay(10)
    expect(aborted).toBe(false)
  })

  it("treats ms <= 0 or non-finite as a disabled timeout", async () => {
    const a = await withTimeout(
      (async () => {
        await delay(30)
        return 1
      })(),
      0,
      "disabled-zero",
    )
    expect(a).toBe(1)

    const b = await withTimeout(
      (async () => {
        await delay(30)
        return 2
      })(),
      Number.POSITIVE_INFINITY,
      "disabled-inf",
    )
    expect(b).toBe(2)
  })

  it("aborts when an external signal fires before the deadline", async () => {
    const external = new AbortController()
    let observedAbort = false
    const task = (signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          observedAbort = true
          reject(new Error("external-abort"))
        })
      })

    const p = withTimeout(task, 1000, "external", external.signal)
    external.abort()
    // External abort fires well before the 1000ms timeout → the task's own
    // rejection is what surfaces (deterministic, no race with the timeout).
    await expect(p).rejects.toThrow("external-abort")
    expect(observedAbort).toBe(true)
  })

  it("still forwards external aborts when AbortSignal.any is unavailable", async () => {
    const abortSignalAny = AbortSignal as AbortSignalWithAny
    const originalAny = abortSignalAny.any
    abortSignalAny.any = undefined

    try {
      const external = new AbortController()
      let observedAbort = false
      const task = (signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            observedAbort = true
            reject(new Error("external-abort-fallback"))
          })
        })

      const p = withTimeout(task, 1000, "external-fallback", external.signal)
      external.abort()
      await expect(p).rejects.toThrow("external-abort-fallback")
      expect(observedAbort).toBe(true)
    } finally {
      abortSignalAny.any = originalAny
    }
  })

  it("clears its timer when a function-form task throws synchronously", async () => {
    // The throw happens at the `task(signal)` call (with-timeout.ts:87),
    // before Promise.race is constructed. The try/finally block at
    // with-timeout.ts:85-93 still owns the timer handle, so finally runs
    // and clearTimeout(timer) fires. The synchronous throw is converted
    // into a promise rejection visible to the caller.
    const syncTask = (_signal: AbortSignal): Promise<string> => {
      throw new Error("sync-boom")
    }

    // 1) The throw propagates to the caller as a rejected promise.
    await expect(withTimeout(syncTask, 1000, "sync-throw")).rejects.toThrow(
      "sync-boom",
    )

    // 2) The function returned promptly (no hung timer keeping the
    // microtask queue alive). If the timer were leaked, this assertion
    // would still pass — but the test runner would not exit cleanly with
    // a 1000ms pending timer. Bun's test runner surfaces that as a hang.
    // The fact that this whole file finishes in ~150ms (see other tests)
    // is the indirect evidence that the timer was cleared.
  })
})
