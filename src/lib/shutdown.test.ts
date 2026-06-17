/**
 * shutdown.ts lifecycle tests.
 *
 * Source: MEJORAS.md Finding 18.2.B (HIGH — `shutdown.ts` has no test).
 *
 * The module exports a singleton (`shutdownManager`). Each test resets the
 * singleton's private `isShuttingDown` and `forceExitMs` fields via a
 * typed escape hatch (the fields are `private` for production use; the
 * test needs to reset them because the singleton is shared across the
 * whole process and tests would otherwise leak state).
 *
 * `process.exit` is stubbed via direct property assignment — the global
 * `process` is not a Node ESM module, so `mock.module("node:process", …)`
 * does not intercept it. Direct replacement is the same pattern that
 * `cli-args.test.ts:16-43` uses for the same reason.
 *
 * Implements the 4-phase proposal from the audit (MEJORAS.md:24389):
 *  1. shutdown with a resolving handler → handler fires, process.exit(0).
 *  2. shutdown with no handler         → process.exit(0).
 *  3. re-entrancy: second shutdown is a no-op.
 *  4. shutdown with throwing handler   → process.exit(1).
 *  5. failsafe: wedged handler         → process.exit(1) after forceExitMs.
 *
 * Plus 2 register/unregister coverage tests for the public API surface.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { shutdownManager, type ShutdownHandler } from "./shutdown"

// Captured process.exit calls for the current test.
let exitCalls: number[] = []
let realExit: typeof process.exit

// Reset the singleton's private fields. The fields are `private` for
// production use; the test needs to reset them because the singleton is
// shared across the whole process and tests would otherwise leak state
// (a wedged-handler test, e.g., flips `isShuttingDown` to `true` and
// never resets it).
function resetSingleton(forceExitMs = 10000) {
  const sm = shutdownManager as unknown as {
    isShuttingDown: boolean
    forceExitMs: number
  }
  sm.isShuttingDown = false
  sm.forceExitMs = forceExitMs
}

beforeEach(() => {
  exitCalls = []
  realExit = process.exit
  process.exit = ((code?: number) => {
    exitCalls.push(code ?? 0)
  }) as typeof process.exit
  resetSingleton()
})

afterEach(() => {
  process.exit = realExit
  // Reset for the next test (a wedged-handler test may have flipped
  // isShuttingDown to true via the failsafe path).
  resetSingleton()
})

describe("shutdownManager (Finding 18.2.B)", () => {
  it("calls handler then process.exit(0) when handler resolves", async () => {
    let handlerCalls = 0
    const handler: ShutdownHandler = () => {
      handlerCalls++
    }
    shutdownManager.register(handler)

    await shutdownManager.shutdown()

    expect(handlerCalls).toBe(1)
    expect(exitCalls).toEqual([0])
  })

  it("calls process.exit(0) with no registered handler", async () => {
    shutdownManager.unregister()

    await shutdownManager.shutdown()

    expect(exitCalls).toEqual([0])
  })

  it("re-entrancy guard: second shutdown() is a no-op", async () => {
    let handlerCalls = 0
    const handler: ShutdownHandler = () => {
      handlerCalls++
    }
    shutdownManager.register(handler)

    await shutdownManager.shutdown()
    expect(handlerCalls).toBe(1)
    expect(exitCalls).toEqual([0])

    // The second shutdown is a no-op: the isShuttingDown guard returns
    // early, so the handler is NOT called again and process.exit is NOT
    // invoked a second time.
    await shutdownManager.shutdown()
    expect(handlerCalls).toBe(1)
    expect(exitCalls).toEqual([0])
  })

  it("calls process.exit(1) when handler throws", async () => {
    const handler: ShutdownHandler = async () => {
      throw new Error("cleanup blew up")
    }
    shutdownManager.register(handler)

    // Suppress console.error output from the catch path (visible noise;
    // not part of the contract being tested).
    const origConsoleError = console.error
    console.error = () => {}
    try {
      await shutdownManager.shutdown()
    } finally {
      console.error = origConsoleError
    }

    // The contract is that process.exit(1) is called. In production the
    // call inside the catch block (`shutdown.ts:73`) terminates the
    // runtime, so the trailing `process.exit(0)` on line 83 is never
    // reached. In this test the mock keeps the runtime alive, so the
    // flow continues and we observe a trailing exit(0) too. Assert
    // against the contract (1 was called) rather than the test-mock
    // sequence, so a future refactor that drops the exit(0) line
    // doesn't fail this test.
    expect(exitCalls).toContain(1)
  })

  it("failsafe timer fires process.exit(1) when handler wedges", async () => {
    // Reduce forceExitMs to 50ms so the test runs fast.
    resetSingleton(50)

    // A handler that never resolves — the wedged scenario the failsafe
    // is built for (MEJORAS.md Finding 17.7.B).
    const handler: ShutdownHandler = () => new Promise<void>(() => {})
    shutdownManager.register(handler)

    const origConsoleError = console.error
    console.error = () => {}
    try {
      // Don't await — the handler hangs forever, but the failsafe
      // should fire process.exit(1) after forceExitMs.
      void shutdownManager.shutdown()

      // Wait long enough for the failsafe to fire (50ms timer + slack).
      await new Promise((r) => setTimeout(r, 100))
    } finally {
      console.error = origConsoleError
      resetSingleton()
    }

    expect(exitCalls).toEqual([1])
  })

  it("register replaces a previously-registered handler", async () => {
    let firstCalls = 0
    let secondCalls = 0
    shutdownManager.register(() => {
      firstCalls++
    })
    shutdownManager.register(() => {
      secondCalls++
    })

    await shutdownManager.shutdown()

    expect(firstCalls).toBe(0)
    expect(secondCalls).toBe(1)
    expect(exitCalls).toEqual([0])
  })

  it("unregister removes the handler so shutdown is a clean exit", async () => {
    let handlerCalls = 0
    shutdownManager.register(() => {
      handlerCalls++
    })
    shutdownManager.unregister()

    await shutdownManager.shutdown()

    expect(handlerCalls).toBe(0)
    expect(exitCalls).toEqual([0])
  })
})
