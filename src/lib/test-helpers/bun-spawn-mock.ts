/**
 * Shared `Bun.spawn` mock for tests that need to drive or observe process
 * spawns without actually executing them. Centralizes the
 * `realBunSpawn`-save / `Bun.spawn`-override / per-test-state-reset pattern
 * that was previously duplicated across `terminal-launcher.test.ts` and
 * `power.test.ts`.
 *
 * The production modules touch only three fields of the returned subprocess
 * (`unref`, `kill`, `pid`) so the mock type is the minimum structural
 * subset. Any consumer that needs more (e.g. `stdout`, `stderr`) must
 * extend `FakeProc` in its own file; this helper is the floor.
 *
 * `Bun` is a global, not an importable module, so `mock.module` does not
 * intercept it (the same limitation that drove the inline pattern in
 * `cli-args.test.ts:16-43` for `process.exit`). Direct property assignment
 * is the only way to stub it.
 *
 * State lives in a mutable `spawnState` object (not module-scope `let`s) so
 * consumers can reassign `spawnState.impl` from test bodies. ES module
 * bindings are read-only at the import site, so exporting the state as a
 * `const` wrapper with mutable properties is the standard workaround.
 *
 * Usage:
 *   import {
 *     setupBunSpawnMock,
 *     spawnState,
 *   } from "./test-helpers/bun-spawn-mock"
 *   setupBunSpawnMock()
 *   // then in tests:
 *   spawnState.impl = () => { throw new Error("spawn exploded") }
 *   expect(spawnState.calls).toHaveLength(1)
 */
import { afterEach, beforeEach } from "bun:test"

export type FakeProc = {
  unref: () => void
  kill: () => void
  pid: number
}

export type SpawnCall = { cmd: string[]; opts: unknown }

const defaultImpl = (): FakeProc => ({
  unref: () => {},
  kill: () => {},
  pid: 1234,
})

/**
 * Mutable per-test state. `calls` is appended to by the mock wrapper;
 * `impl` is the factory the wrapper delegates to (override in a test to
 * inject failure). Both are reset by the `afterEach` in
 * `setupBunSpawnMock`.
 */
export const spawnState: {
  calls: SpawnCall[]
  impl: (cmd: string[], opts: unknown) => FakeProc
} = {
  calls: [],
  impl: defaultImpl,
}

let realBunSpawn: typeof Bun.spawn

/**
 * Wires up the mock. Call once at the top of the test file (module scope),
 * after any `mock.module` calls that need to hoist before the SUT import.
 */
export function setupBunSpawnMock(): void {
  beforeEach(() => {
    realBunSpawn = Bun.spawn
    // The cast is needed because the mock's return type is a structural
    // subset of `Bun.Subprocess`. Only `unref` is used by the production
    // paths (terminal-launcher.ts:254, power.ts:43-53).
    Bun.spawn = ((cmd: string[], opts: unknown) => {
      spawnState.calls.push({ cmd, opts })
      return spawnState.impl(cmd, opts)
    }) as typeof Bun.spawn
  })

  afterEach(() => {
    Bun.spawn = realBunSpawn
    spawnState.calls.length = 0
    spawnState.impl = defaultImpl
  })
}
