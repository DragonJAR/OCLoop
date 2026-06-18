import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, chmodSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  saveLoopState,
  loadLoopState,
  clearLoopState,
  type PersistedLoopState,
} from "./loop-state-store"

// The store reads/writes relative to process.cwd(); run each test in a temp dir.
let dir: string
let prevCwd: string

beforeEach(() => {
  prevCwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), "ocloop-state-"))
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(prevCwd)
  rmSync(dir, { recursive: true, force: true })
})

const sample: PersistedLoopState = {
  version: 1,
  iteration: 3,
  sessionId: "ses_abc",
  stateType: "running",
  rateLimitAttempts: 1,
  updatedAt: "2026-01-01T00:00:00.000Z",
}

describe("loop-state-store", () => {
  it("returns null when no state file exists", async () => {
    expect(await loadLoopState()).toBeNull()
  })

  it("round-trips a saved state", async () => {
    await saveLoopState(sample)
    const loaded = await loadLoopState()
    expect(loaded).toEqual(sample)
  })

  it("overwrites previous state atomically (no leftover temp file)", async () => {
    await saveLoopState(sample)
    await saveLoopState({ ...sample, iteration: 9 })
    const loaded = await loadLoopState()
    expect(loaded?.iteration).toBe(9)
    // After a successful save+rename, NO temp file should remain — neither the
    // legacy fixed name nor a random-suffixed one (the rename consumed it).
    // readdirSync catches any orphan regardless of the suffix scheme, so this
    // stays correct as the tmp-naming strategy evolves.
    const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"))
    expect(leftovers).toEqual([])
  })

  it("clears the state file", async () => {
    await saveLoopState(sample)
    await clearLoopState()
    expect(await loadLoopState()).toBeNull()
  })

  it("clearing a non-existent file does not throw", async () => {
    await clearLoopState()
    expect(await loadLoopState()).toBeNull()
  })

  // The EACCES/EPERM branch of clearLoopState's catch is identical to ENOENT
  // by inspection (the catch is type-agnostic), but the audit (MEJORAS.md
  // Finding 8.3.A) calls out a regression that narrowed the catch to
  // `if (err.code !== "ENOENT") throw` as the kind of silent footgun that
  // would slip past the existing two tests. Pin the contract with a real
  // permission-denied unlink.
  //
  // Cross-platform caveats: Windows ACLs do not map to POSIX chmod, and root
  // bypasses the read-only check entirely. The audit recommends skipIf on both
  // axes; the tempdir is owned by the test process so chmod is permitted
  // (root runs of the suite on CI are the realistic root case to skip).
  it.skipIf(
    process.platform === "win32" ||
      (typeof process.getuid === "function" && process.getuid() === 0),
  )("clearLoopState swallows EACCES on a read-only dir", async () => {
    await saveLoopState(sample)
    // 0o555 = r-xr-xr-x. On the parent dir, this blocks create/rename/unlink
    // inside, so the next clearLoopState's unlink fails with EACCES (macOS) or
    // EPERM (Linux). The store's type-agnostic catch must swallow it.
    chmodSync(dir, 0o555)
    try {
      await clearLoopState() // must not throw
    } finally {
      // Restore so afterEach's rmSync can clean up the tempdir.
      chmodSync(dir, 0o755)
    }
  })

  it("returns null for an unsupported version", async () => {
    await saveLoopState({ ...sample, version: 99 as unknown as 1 })
    expect(await loadLoopState()).toBeNull()
  })

  it("returns null when sessionId is a non-string non-null value", async () => {
    await saveLoopState({ ...sample, sessionId: 42 as unknown as string | null })
    expect(await loadLoopState()).toBeNull()
  })

  it("accepts null sessionId (between iterations is valid)", async () => {
    await saveLoopState({ ...sample, sessionId: null })
    const loaded = await loadLoopState()
    expect(loaded?.sessionId).toBeNull()
  })

  it("returns null when stateType is not a string", async () => {
    await saveLoopState({ ...sample, stateType: 42 as unknown as string })
    expect(await loadLoopState()).toBeNull()
  })

  it("returns null when rateLimitAttempts is not a number", async () => {
    await saveLoopState({
      ...sample,
      rateLimitAttempts: "x" as unknown as number,
    })
    expect(await loadLoopState()).toBeNull()
  })

  it("returns null when updatedAt is not a string", async () => {
    await saveLoopState({ ...sample, updatedAt: 42 as unknown as string })
    expect(await loadLoopState()).toBeNull()
  })

  // The type guard must reject non-integer and negative count fields: a
  // hand-edited .loop-state.json (JSON allows negative + decimal numbers) with
  // a negative `rateLimitAttempts` would otherwise round-trip into
  // `setAttempts(-5)` and the rate-limit circuit breaker could never trip
  // (-5 > maxRateLimitRetries is always false). A decimal iteration would
  // poison iteration+1 forever. NaN/Infinity are also rejected for defense in
  // depth (JSON.parse already rejects those, but the guard is the trust
  // boundary so it validates independently).
  describe("count-field hardening (rejects negative / non-integer / NaN / Infinity)", () => {
    // Write a hand-edited state file directly: saveLoopState would JSON.stringify
    // and coerce, but the realistic threat is a user/tool editing the file raw.
    function writeRawState(json: string): void {
      writeFileSync(join(dir, ".loop-state.json"), json, "utf-8")
    }

    it("rejects a negative iteration", async () => {
      writeRawState(JSON.stringify({ ...sample, iteration: -1 }))
      expect(await loadLoopState()).toBeNull()
    })

    it("rejects a decimal (non-integer) iteration", async () => {
      writeRawState(JSON.stringify({ ...sample, iteration: 1.5 }))
      expect(await loadLoopState()).toBeNull()
    })

    it("rejects a negative rateLimitAttempts (would defeat the circuit breaker)", async () => {
      writeRawState(JSON.stringify({ ...sample, rateLimitAttempts: -3 }))
      expect(await loadLoopState()).toBeNull()
    })

    it("rejects a non-integer rateLimitAttempts", async () => {
      writeRawState(JSON.stringify({ ...sample, rateLimitAttempts: 2.5 }))
      expect(await loadLoopState()).toBeNull()
    })

    it("still accepts a valid zero rateLimitAttempts", async () => {
      // Regression guard: 0 is a legitimate, schema-valid count. The hardening
      // must not over-reject and break the normal fresh-resume path.
      writeRawState(JSON.stringify({ ...sample, rateLimitAttempts: 0 }))
      const loaded = await loadLoopState()
      expect(loaded?.rateLimitAttempts).toBe(0)
    })
  })

  // Regression for the "spurious resume after completion" bug: the completion
  // effect dispatches BOTH a saveLoopState (for the running state just before
  // completion) and a clearLoopState (for the complete state) as un-awaited
  // `void` calls. Writes are serialized through a promise chain and a generation
  // guard so a save enqueued before a clear is DROPPED by the clear (it bumps
  // the generation), instead of resurrecting .loop-state.json after the clear.
  // The outcome the user sees: no resume prompt on the next launch for a run
  // that finished cleanly.
  describe("serialization + generation guard (clear beats a prior save)", () => {
    it("a save dispatched before a clear does NOT leave a state file behind", async () => {
      // Enqueue a save, then immediately a clear — do NOT await the save first
      // (that would mask the ordering bug; the real caller fires both blind).
      const saveP = saveLoopState(sample)
      const clearP = clearLoopState()
      await Promise.all([saveP, clearP])
      expect(await loadLoopState()).toBeNull()
    })

    it("a save dispatched after a clear persists normally (generation only affects prior saves)", async () => {
      await clearLoopState()
      await saveLoopState(sample)
      const loaded = await loadLoopState()
      expect(loaded?.iteration).toBe(sample.iteration)
    })

    it("the latest save wins when several are dispatched rapidly", async () => {
      const p1 = saveLoopState({ ...sample, iteration: 1 })
      const p2 = saveLoopState({ ...sample, iteration: 2 })
      const p3 = saveLoopState({ ...sample, iteration: 3 })
      await Promise.all([p1, p2, p3])
      const loaded = await loadLoopState()
      // Serialized in dispatch order → the last one (iteration 3) is on disk.
      expect(loaded?.iteration).toBe(3)
    })
  })
})
