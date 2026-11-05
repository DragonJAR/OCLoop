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

const RENAME_RETRIES = 3
const RENAME_RETRY_DELAY_MS = 20
const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EBUSY", "EACCES"])

function isTransientRenameError(err: unknown, platform: string): boolean {
  // Only Windows: antivirus / indexers / another handle briefly lock the
  // target. On POSIX these codes are real permission errors — fail fast.
  return (
    platform === "win32" &&
    RETRYABLE_RENAME_CODES.has((err as NodeJS.ErrnoException | undefined)?.code ?? "")
  )
}

/**
 * rename with a bounded retry (3 attempts, ~20ms apart) on Windows lock
 * errors, then rethrow. `op`/`platform` are injectable for deterministic tests.
 */
export async function renameWithRetry(
  from: string,
  to: string,
  op: (from: string, to: string) => Promise<void> = rename,
  platform: string = process.platform,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await op(from, to)
      return
    } catch (err) {
      if (attempt >= RENAME_RETRIES || !isTransientRenameError(err, platform)) throw err
      await new Promise((r) => setTimeout(r, RENAME_RETRY_DELAY_MS))
    }
  }
}

export function renameWithRetrySync(
  from: string,
  to: string,
  op: (from: string, to: string) => void = renameSync,
  platform: string = process.platform,
): void {
  for (let attempt = 1; ; attempt++) {
    try {
      op(from, to)
      return
    } catch (err) {
      if (attempt >= RENAME_RETRIES || !isTransientRenameError(err, platform)) throw err
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_RETRY_DELAY_MS)
    }
  }
}

/** Synchronous atomic write — used by `saveConfig`. */
export function atomicWriteTextSync(path: string, content: string): void {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = deterministicTmpPath(path)
  try {
    writeFileSync(tmp, content, "utf-8")
    renameWithRetrySync(tmp, path)
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      // best-effort
    }
    throw err
  }
}

/**
 * Test whether a filename matches the deterministic temporary file pattern for
 * a target base file.
 *
 * Matches both randomized-suffix temporary files (`${base}.${pid}.*.tmp`) and
 * legacy non-randomized files (`${base}.${pid}.tmp`). When `pid` is given the
 * match is scoped to that PID; without it, any PID matches — the sweep
 * cleanup uses that mode so a tmp orphaned by a crashed previous OCLoop
 * process (its PID is gone, nothing else will ever claim it) is still
 * reclaimed instead of accumulating forever next to the target file.
 */
export function isDeterministicTmpFile(file: string, base: string, pid?: number): boolean {
  if (!file || !base) return false
  if (pid !== undefined) {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false
    const prefix = `${base}.${pid}.`
    return (file.startsWith(prefix) && file.endsWith(".tmp")) || file === `${base}.${pid}.tmp`
  }
  const tmp = file.slice(0, -4)
  if (!file.endsWith(".tmp") || !tmp.startsWith(`${base}.`)) return false
  const tail = tmp.slice(base.length + 1)
  return /^\d+(\..*)?$/.test(tail)
}

/** Extract the owning PID from a deterministic tmp filename, or `null`. */
export function tmpFilePid(file: string): number | null {
  const match = file.match(/\.(\d+)(?:\.[^.]*)?\.tmp$/)
  if (!match) return null
  const pid = Number(match[1])
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

/**
 * Whether a PID still belongs to a live process. A tmp whose owner is gone is
 * an orphan from a crashed write and can be reclaimed; a tmp owned by a live
 * process (possibly another OCLoop instance) must be left alone — deleting it
 * would break that process's pending rename.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means the process exists but is owned by another user.
    return (err as NodeJS.ErrnoException)?.code === "EPERM"
  }
}

/** True when the deterministic tmp file is a reclaimable orphan. */
export function isOrphanTmpFile(file: string): boolean {
  const pid = tmpFilePid(file)
  if (pid === null) return false
  return !isProcessAlive(pid)
}

/**
 * Whether a deterministic tmp may be reclaimed by THIS process's sweep:
 * its own PID's tmps (historical semantics — the error path sweeps the
 * failed write it just made) plus any-PID tmps whose owner is dead (crash
 * orphans). A tmp owned by another LIVE process is left untouched.
 */
function isReclaimableTmp(file: string, base: string): boolean {
  if (!isDeterministicTmpFile(file, base)) return false
  const pid = tmpFilePid(file)
  if (pid === null) return false
  return pid === process.pid || !isProcessAlive(pid)
}

/** Best-effort cleanup of a deterministic tmp left by a failed sync write. */
export function cleanupDeterministicTmp(path: string): void {
  try {
    const dir = dirname(path)
    const base = basename(path)
    if (!existsSync(dir)) return
    for (const file of readdirSync(dir)) {
      // Own-pid tmps (error path) + dead-pid crash orphans; a live sibling
      // OCLoop's in-flight tmp must survive this sweep.
      if (isReclaimableTmp(file, base)) {
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
    const entries = await readdir(dir).catch(() => [] as string[])
    for (const file of entries) {
      // Same reclaim policy as the sync sweep.
      if (isReclaimableTmp(file, base)) {
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
    await renameWithRetry(tmp, path)
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