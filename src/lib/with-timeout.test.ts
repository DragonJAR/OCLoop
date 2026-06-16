import { describe, expect, it } from "bun:test"
import { withTimeout, TimeoutError, isTimeoutError } from "./with-timeout"

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
    expect(isTimeoutError(thrown)).toBe(true)
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

    // The task rejects with its own "aborted" error once the timeout fires the
    // signal (it wins the race against the timeout's own rejection).
    await expect(withTimeout(task, 15, "abortable")).rejects.toThrow("aborted")
    // Give the microtask/event a tick to land
    await delay(5)
    expect(isTimeoutError(abortedReason)).toBe(true)
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
})
