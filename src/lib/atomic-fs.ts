/**
 * Atomic text writes (tmp + rename) shared by PLAN CAS, loop-state persistence,
 * and config saves. A reader never sees partial bytes when the rename succeeds
 * on the same filesystem.
 */
import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { randomUUID } from "node:crypto"
import { open, rename, rm } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

/** Synchronous atomic write — used by `saveConfig`. */
export function atomicWriteTextSync(path: string, content: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = deterministicTmpPath(path)
  writeFileSync(tmp, content, "utf-8")
  renameSync(tmp, path)
}

/** Best-effort cleanup of a deterministic tmp left by a failed `atomicWriteTextSync`. */
export function cleanupDeterministicTmp(path: string): void {
  const tmp = deterministicTmpPath(path)
  try {
    if (existsSync(tmp)) unlinkSync(tmp)
  } catch {
    // best-effort
  }
}

/**
 * Per-process deterministic tmp path so a failed save is overwritten on the
 * next attempt instead of leaking random `.tmp` orphans (ARREGLAR B5).
 */
export function deterministicTmpPath(path: string): string {
  return `${path}.${process.pid}.tmp`
}

/** Async atomic write with `wx` + fsync — used by PLAN CAS and loop-state. */
export async function atomicWriteText(path: string, content: string): Promise<void> {
  const dir = dirname(path)
  const tmp = join(
    dir,
    `.${basename(path)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`,
  )
  let handle: FileHandle | null = null
  try {
    mkdirSync(dir, { recursive: true })
    handle = await open(tmp, "wx")
    await handle.writeFile(content, "utf8")
    await handle.sync()
    await handle.close()
    handle = null
    await rename(tmp, path)
    await syncDirectoryBestEffort(dir)
  } catch (err) {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // best-effort cleanup
      }
    }
    try {
      await rm(tmp, { force: true })
    } catch {
      // best-effort cleanup
    }
    throw err
  }
}

async function syncDirectoryBestEffort(dir: string): Promise<void> {
  let handle: FileHandle | null = null
  try {
    handle = await open(dir, "r")
    await handle.sync()
  } catch {
    // Directory fsync is not supported everywhere; temp+rename is still the
    // important crash-safety improvement.
  } finally {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // best-effort cleanup
      }
    }
  }
}