/**
 * `command-exists.ts` tests.
 *
 * The helper is the single gateway clipboard + terminal detection use to ask
 * "is this binary on PATH?". The critical invariant is that it must pick the
 * right lookup binary per platform: `which` on POSIX, `where.exe` on Windows.
 * `which` does not exist on Windows, so the old implementation ALWAYS threw on
 * win32, which silently broke both clipboard detection (every probe returned
 * false, so the built-in `clip.exe` was never used) and terminal detection.
 *
 * The platform branch is read from `process.platform` per-call; we drive it
 * deterministically by stubbing `Bun.spawn` (the lookup binary is the first
 * element of the spawned argv) and asserting on the recorded call. `Bun` is a
 * global, not a module, so it can only be stubbed via direct assignment (same
 * limitation as `cli-args.test.ts` / `bun-spawn-mock.ts`).
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

type SpawnArgs = { cmd: string[]; exitCode: number }

let spawnCalls: SpawnArgs[] = []
let spawnExitCode = 0
let realBunSpawn: typeof Bun.spawn

beforeEach(() => {
  realBunSpawn = Bun.spawn
  spawnCalls = []
  spawnExitCode = 0
  Bun.spawn = ((cmd: string[]): { exited: Promise<number> } => {
    spawnCalls.push({ cmd, exitCode: spawnExitCode })
    return { exited: Promise.resolve(spawnExitCode) }
  }) as typeof Bun.spawn
})

afterEach(() => {
  Bun.spawn = realBunSpawn
})

const { commandExists } = await import("./command-exists")

/** First token of the spawned argv — the lookup binary (`which`/`where.exe`). */
function lookupBinary(): string | undefined {
  return spawnCalls[0]?.cmd[0]
}

describe("commandExists — platform lookup binary", () => {
  it("uses `which` on POSIX (darwin/linux)", async () => {
    // process.platform is darwin on this host; the implementation reads it
    // per-call so no stubbing is needed.
    expect(["darwin", "linux"]).toContain(process.platform)
    spawnExitCode = 0
    expect(await commandExists("pbcopy")).toBe(true)
    expect(lookupBinary()).toBe("which")
  })

  it("returns false when the lookup exits non-zero (command not on PATH)", async () => {
    spawnExitCode = 1
    expect(await commandExists("definitely-not-a-real-binary-xyz")).toBe(false)
    expect(lookupBinary()).toBe("which")
  })

  it("returns false (never throws) when Bun.spawn itself rejects", async () => {
    Bun.spawn = (() => {
      throw new Error("ENOENT: lookup binary missing")
    }) as typeof Bun.spawn
    expect(await commandExists("pbcopy")).toBe(false)
  })
})

describe("commandExists — Windows `where.exe` contract", () => {
  // `process.platform` is read per-call by the implementation. We cannot mutate
  // the real platform value, so this test documents + guards the win32 branch
  // by pinning the source invariant: the implementation MUST branch on
  // `process.platform === "win32"` and select `where.exe`. The darwin/linux
  // test above covers the `which` path; this one runs on every host and fails
  // loudly if someone reverts the platform branch to a hard-coded `which`
  // (which would break clipboard + terminal detection on Windows).
  it("source pins `where.exe` for win32 (regression guard for the Windows clipboard/terminal bug)", () => {
    const source = require("./command-exists")
    // Re-import is cached; assert the module exposes the function and the
    // branch is present in the source text. This is a static guard: the
    // dynamic win32 behavior is exercised by the skipped test below.
    expect(typeof source.commandExists).toBe("function")
    // Read the source to assert the platform branch exists — catches a
    // regression where the branch is removed/reverted.
    const fs = require("node:fs")
    const src = fs.readFileSync(require.resolve("./command-exists"), "utf-8")
    expect(src).toContain('"win32"')
    expect(src).toContain('"where.exe"')
    expect(src).toContain('"which"')
  })

  it.skipIf(process.platform !== "win32")(
    "uses `where.exe` on win32 so the built-in clip.exe is detected",
    async () => {
      spawnExitCode = 0
      expect(await commandExists("clip")).toBe(true)
      expect(lookupBinary()).toBe("where.exe")
    },
  )
})
