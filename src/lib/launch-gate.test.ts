import { describe, expect, it } from "bun:test"
import { createLaunchGate } from "./launch-gate"

const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms))

describe("createLaunchGate", () => {
  it("runs fn exactly once when two callers invoke tryRunExclusive synchronously", async () => {
    const gate = createLaunchGate()
    let executions = 0
    let release!: () => void
    const hold = new Promise<void>((r) => {
      release = r
    })

    const work = async () => {
      executions++
      await hold
    }

    const p1 = gate.tryRunExclusive(work)
    const p2 = gate.tryRunExclusive(work)

    expect(executions).toBe(1)

    release()
    expect(await p1).toBe(true)
    expect(await p2).toBe(false)
    expect(executions).toBe(1)
  })

  it("skips a microtask-delayed caller while the first operation is in flight", async () => {
    const gate = createLaunchGate()
    let executions = 0
    let release!: () => void
    const hold = new Promise<void>((r) => {
      release = r
    })

    const work = async () => {
      executions++
      await hold
    }

    const outcomes: boolean[] = []
    const first = gate.tryRunExclusive(work).then((ok) => {
      outcomes.push(ok)
      return ok
    })

    queueMicrotask(() => {
      void gate.tryRunExclusive(work).then((ok) => {
        outcomes.push(ok)
      })
    })

    await Promise.resolve()
    expect(executions).toBe(1)

    release()
    await first
    await tick(5)

    expect(executions).toBe(1)
    expect(outcomes).toHaveLength(2)
    expect(outcomes.filter(Boolean)).toHaveLength(1)
    expect(outcomes.filter((ok) => !ok)).toHaveLength(1)
  })

  it("allows a new operation after the previous one completes", async () => {
    const gate = createLaunchGate()
    let executions = 0

    expect(
      await gate.tryRunExclusive(async () => {
        executions++
      }),
    ).toBe(true)
    expect(
      await gate.tryRunExclusive(async () => {
        executions++
      }),
    ).toBe(true)

    expect(executions).toBe(2)
  })
})