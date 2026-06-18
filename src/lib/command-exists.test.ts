/**
 * `command-exists.ts` tests.
 *
 * The helper is the single gateway clipboard + terminal detection use to ask
 * "is this binary on PATH?". The critical invariant is that it must pick the
 * right lookup binary per platform: `which` on POSIX, `where.exe` on Windows.
 * `which` does not exist on Windows, so a hard-coded `which` would ALWAYS throw
 * on win32, which silently broke both clipboard detection (every probe returned
 * false, so the built-in `clip.exe` was never used) and terminal detection.
 *
 * Both axes are driven deterministically so the suite runs identically on every
 * host (macOS / Linux / Windows):
 * - PLATFORM via `commandExists`'s `platform` parameter (the same DI as
 *   `power.ts` / `term-caps.ts`) — no host-coupling, no `skipIf`.
 * - SPAWN via the shared `./test-helpers/bun-spawn-mock`. `Bun` is a global, not
 *   an importable module, so it can only be stubbed by assignment; the helper
 *   centralizes that save/override/reset (also used by `power.test.ts` and
 *   `terminal-launcher.test.ts`).
 */
import { describe, expect, it } from "bun:test"
import {
  setupBunSpawnMock,
  spawnState,
  type FakeProc,
} from "./test-helpers/bun-spawn-mock"

setupBunSpawnMock()

const { commandExists } = await import("./command-exists")

// The shared FakeProc is the floor (unref/kill/pid); `commandExists` only reads
// `proc.exited`, so extend it here per the helper's documented contract.
const exitWith = (code: number) =>
  ({ exited: Promise.resolve(code) }) as unknown as FakeProc

/** First token of the spawned argv — the lookup binary (`which`/`where.exe`). */
function lookupBinary(): string | undefined {
  return spawnState.calls[0]?.cmd[0]
}

describe("commandExists — platform lookup binary", () => {
  it("uses `which` on POSIX (linux)", async () => {
    spawnState.impl = () => exitWith(0)
    expect(await commandExists("pbcopy", "linux")).toBe(true)
    expect(lookupBinary()).toBe("which")
  })

  it("uses `which` on POSIX (darwin)", async () => {
    spawnState.impl = () => exitWith(0)
    expect(await commandExists("pbcopy", "darwin")).toBe(true)
    expect(lookupBinary()).toBe("which")
  })

  it("uses `where.exe` on win32 so the built-in clip.exe is detected", async () => {
    spawnState.impl = () => exitWith(0)
    expect(await commandExists("clip", "win32")).toBe(true)
    expect(lookupBinary()).toBe("where.exe")
  })

  it("returns false when the lookup exits non-zero (command not on PATH)", async () => {
    spawnState.impl = () => exitWith(1)
    expect(await commandExists("definitely-not-a-real-binary-xyz", "linux")).toBe(false)
    expect(lookupBinary()).toBe("which")
  })

  it("returns false (never throws) when Bun.spawn itself rejects", async () => {
    spawnState.impl = () => {
      throw new Error("ENOENT: lookup binary missing")
    }
    expect(await commandExists("pbcopy", "linux")).toBe(false)
  })

  it("defaults to the host platform when none is passed", async () => {
    spawnState.impl = () => exitWith(0)
    expect(await commandExists("pbcopy")).toBe(true)
    // Assert against whatever the host resolves to (no host-specific value
    // pinned), so this stays green on every OS in the CI matrix.
    const expected = process.platform === "win32" ? "where.exe" : "which"
    expect(lookupBinary()).toBe(expected)
  })
})
