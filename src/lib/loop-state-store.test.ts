import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, existsSync, chmodSync } from "node:fs"
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
    expect(existsSync(join(dir, ".loop-state.json.tmp"))).toBe(false)
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
})
