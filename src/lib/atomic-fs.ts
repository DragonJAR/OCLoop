/**
 * Atomic text writes (tmp + rename) shared by PLAN CAS, loop-state persistence,
 * and config saves. A reader never sees partial bytes when the rename succeeds
 * on the same filesystem.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { mkdir, open, readdir, rename, rm } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

/** Synchronous atomic write — used by `saveConfig`. */
export function atomicWriteTextSync(path: string, content: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = deterministicTmpPath(path)
  try {
    writeFileSync(tmp, content, "utf-8")
    renameSync(tmp, path)
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      // best-effort
    }
    throw err
  }
}

/** Best-effort cleanup of a deterministic tmp left by a failed sync write. */
export function cleanupDeterministicTmp(path: string): void {
  try {
    const dir = dirname(path)
    const base = basename(path)
    const prefix = `${base}.${process.pid}.`
    if (!existsSync(dir)) return
    for (const file of readdirSync(dir)) {
      if ((file.startsWith(prefix) && file.endsWith(".tmp")) || file === `${base}.${process.pid}.tmp`) {
        try {
          unlinkSync(join(dir, file))
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }
}

/** Async best-effort cleanup of a deterministic tmp (B5). */
export async function cleanupDeterministicTmpAsync(path: string): Promise<void> {
  try {
    const dir = dirname(path)
    const base = basename(path)
    const prefix = `${base}.${process.pid}.`
    const entries = await readdir(dir).catch(() => [] as string[])
    for (const file of entries) {
      if ((file.startsWith(prefix) && file.endsWith(".tmp")) || file === `${base}.${process.pid}.tmp`) {
        await rm(join(dir, file), { force: true }).catch(() => {})
      }
    }
  } catch {
    // best-effort
  }
}

/**
 * Per-process deterministic-prefix tmp path with a unique call identifier
 * to prevent concurrent asynchronous writes from colliding or truncating
 * each other's temporary files (W2-01).
 */
export function deterministicTmpPath(path: string): string {
  return `${path}.${process.pid}.${Date.now()}-${crypto.randomUUID().slice(0, 8)}.tmp`
}

/** Async atomic write with fsync — used by PLAN CAS and loop-state. */
export async function atomicWriteText(path: string, content: string): Promise<void> {
  const dir = dirname(path)
  const tmp = deterministicTmpPath(path)
  let handle: FileHandle | null = null
  try {
    await mkdir(dir, { recursive: true })
    handle = await open(tmp, "w")
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