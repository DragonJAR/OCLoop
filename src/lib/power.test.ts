/**
 * power.ts tests.
 *
 * Source: MEJORAS.md Finding 18.2.D (MEDIUM — no test).
 *
 * Covers the testable surface of `src/lib/power.ts`:
 * - `createPowerManager` factory. The `platform` option is used to
 *   drive the darwin/non-darwin branch deterministically, so the
 *   test suite runs the same on every host.
 * - The 3 early-return branches of `start()`: `proc` already set
 *   (line 35), `!options.enabled()` (line 36), non-darwin platform
 *   (line 37-40).
 * - The graceful-degrade path when `Bun.spawn` throws (caffeinate
 *   missing) — `proc` stays null, `isActive` stays false.
 * - `stop()` early-returns when `proc` is null, calls `kill()` when
 *   it isn't, and tolerates `kill()` throwing (already-gone proc).
 * - `proc.unref()` is called exactly once on `start()` so the
 *   caffeinate process does not keep the Bun event loop alive
 *   (audit Finding 18.2.D, line 244).
 * - `isActive()` reflects the proc state across full
 *   start / stop / start cycles.
 *
 * `Bun.spawn` is stubbed via direct property assignment, the same
 * pattern `cli-args.test.ts:16-43` uses for `process.exit`. The
 * global `Bun` is not an importable module so `mock.module` does
 * not intercept it. The mock provides only the three fields the
 * production code touches: `pid`, `unref`, `kill` (power.ts:43-53).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test"

type FakeProc = {
  unref: () => void
  kill: () => void
  pid: number
}
type SpawnCall = { cmd: string[]; opts: unknown }
let spawnCalls: SpawnCall[] = []
let spawnImpl: (cmd: string[], opts: unknown) => FakeProc = () => ({
  unref: () => {},
  kill: () => {},
  pid: 1234,
})
let realBunSpawn: typeof Bun.spawn

beforeEach(() => {
  realBunSpawn = Bun.spawn
  // See terminal-launcher.test.ts for the rationale on the cast.
  Bun.spawn = ((cmd: string[], opts: unknown) => {
    spawnCalls.push({ cmd, opts })
    return spawnImpl(cmd, opts)
  }) as typeof Bun.spawn
})

afterEach(() => {
  Bun.spawn = realBunSpawn
  spawnCalls = []
  spawnImpl = () => ({
    unref: () => {},
    kill: () => {},
    pid: 1234,
  })
})

const { createPowerManager } = await import("./power")

describe("createPowerManager (Finding 18.2.D)", () => {
  it("starts on darwin: spawns caffeinate -dimsu and isActive returns true", () => {
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    pm.start()
    expect(pm.isActive()).toBe(true)
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0].cmd).toEqual(["caffeinate", "-dimsu"])
  })

  it("a second start() is a no-op while a proc is already running (line 35 guard)", () => {
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    pm.start()
    pm.start()
    pm.start()
    expect(spawnCalls).toHaveLength(1)
  })

  it("start() is a no-op on a non-darwin platform (line 37-40 guard)", () => {
    const pm = createPowerManager({ enabled: () => true, platform: "linux" })
    pm.start()
    expect(pm.isActive()).toBe(false)
    expect(spawnCalls).toHaveLength(0)
  })

  it("start() is a no-op on win32 (the documented non-darwin path)", () => {
    const pm = createPowerManager({ enabled: () => true, platform: "win32" })
    pm.start()
    expect(pm.isActive()).toBe(false)
    expect(spawnCalls).toHaveLength(0)
  })

  it("start() is a no-op when enabled() returns false (line 36 guard)", () => {
    const pm = createPowerManager({ enabled: () => false, platform: "darwin" })
    pm.start()
    expect(pm.isActive()).toBe(false)
    expect(spawnCalls).toHaveLength(0)
  })

  it("start() re-evaluates the lazy enabled() on each call", () => {
    // enabled() is a getter, not a captured snapshot. The contract is
    // documented in the PowerManagerOptions.enabled JSDoc: "Reactive/
    // lazy enabled flag (respects --no-caffeinate and config)".
    let enabled = false
    const pm = createPowerManager({
      enabled: () => enabled,
      platform: "darwin",
    })
    pm.start()
    expect(pm.isActive()).toBe(false)

    enabled = true
    pm.start()
    expect(pm.isActive()).toBe(true)
    expect(spawnCalls).toHaveLength(1)
  })

  it("stop() on a started manager calls kill and resets isActive to false", () => {
    let killCalls = 0
    spawnImpl = () => {
      const proc: FakeProc = {
        unref: () => {},
        kill: () => {
          killCalls++
        },
        pid: 4242,
      }
      return proc
    }
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    pm.start()
    expect(pm.isActive()).toBe(true)
    pm.stop()
    expect(killCalls).toBe(1)
    expect(pm.isActive()).toBe(false)
  })

  it("stop() without start is a no-op (does not call kill)", () => {
    let killCalls = 0
    spawnImpl = () => ({
      unref: () => {},
      kill: () => {
        killCalls++
      },
      pid: 1,
    })
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    pm.stop()
    expect(killCalls).toBe(0)
    expect(pm.isActive()).toBe(false)
  })

  it("stop() tolerates kill() throwing (the already-gone proc branch, lines 67-69)", () => {
    // The "already gone" comment in the source is the use-case for the
    // empty catch: ESRCH from a child that already exited. Pin the
    // no-throw contract so a future refactor that adds a throw does
    // not regress the property.
    spawnImpl = () => ({
      unref: () => {},
      kill: () => {
        throw new Error("ESRCH")
      },
      pid: 1,
    })
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    pm.start()
    expect(() => pm.stop()).not.toThrow()
    expect(pm.isActive()).toBe(false)
  })

  it("start() degrades gracefully when Bun.spawn throws (caffeinate missing)", () => {
    // The contract from the source comment (line 55): "caffeinate
    // missing or spawn failed — degrade gracefully." isActive must
    // stay false and the manager must remain re-startable.
    spawnImpl = () => {
      throw new Error("caffeinate not on PATH")
    }
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    pm.start()
    expect(pm.isActive()).toBe(false)

    // A subsequent successful start still works (the catch sets
    // proc = null, not proc = sentinel; the next call proceeds).
    spawnImpl = () => ({
      unref: () => {},
      kill: () => {},
      pid: 1,
    })
    pm.start()
    expect(pm.isActive()).toBe(true)
  })

  it("proc.unref() is called exactly once on start() (line 52)", () => {
    // The unref is load-bearing: without it caffeinate would keep
    // the Bun event loop alive past process exit. Pin the call
    // count so a refactor that drops the unref or moves it does
    // not silently regress.
    let unrefCalls = 0
    spawnImpl = () => ({
      unref: () => {
        unrefCalls++
      },
      kill: () => {},
      pid: 1,
    })
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    pm.start()
    expect(unrefCalls).toBe(1)
  })

  it("isActive() reflects the proc state across start / stop / start cycles", () => {
    const pm = createPowerManager({ enabled: () => true, platform: "darwin" })
    expect(pm.isActive()).toBe(false)

    pm.start()
    expect(pm.isActive()).toBe(true)

    pm.stop()
    expect(pm.isActive()).toBe(false)

    // After stop, the next start must actually re-spawn (a fresh
    // proc, not a stale handle).
    pm.start()
    expect(pm.isActive()).toBe(true)
    expect(spawnCalls).toHaveLength(2)
  })
})
