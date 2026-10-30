/**
 * Crash-resilient persistence of the loop's minimal progress to
 * `.loop-state.json` (next to `.loop.log`).
 */

import { readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { atomicWriteText } from "./atomic-fs"
import { log } from "./debug-logger"
import { isNonNegativeInteger } from "./config"

const STATE_FILE = ".loop-state.json"

/** Snapshot of an in-flight parallel worker slot for crash recovery. */
export interface PersistedWorkerSlot {
  slotId: 1 | 2 | 3 | 4
  sessionId: string
  taskDescription: string
  worktreePath: string
}

/** Persisted snapshot. `version` guards against future format changes. */
export interface PersistedLoopState {
  version: 1
  /** Iteration number at save time. */
  iteration: number
  /** Active session id, or null when between iterations. */
  sessionId: string | null
  /** Loop state type at save time (for diagnostics). */
  stateType: string
  /** Consecutive rate-limit attempts, so a resume keeps the circuit breaker. */
  rateLimitAttempts: number
  /** ISO wall-clock timestamp (human-facing). */
  updatedAt: string
  /**
   * Description of the PLAN.md task this iteration was working on (or null when
   * the plan had no pending task at save time).
   */
  currentTask?: string | null
  /**
   * Optional list of active parallel worker slots in flight when the snapshot
   * was written (when running with `--jobs > 1`).
   */
  activeWorkers?: PersistedWorkerSlot[]
}

function statePath(): string {
  return join(process.cwd(), STATE_FILE)
}

let persistChain: Promise<void> = Promise.resolve()
let clearedGeneration = 0

/**
 * Atomically persist the loop state. Never throws — persistence is best-effort
 * and must not crash the app. Serialized: the write is queued after any prior
 * pending write/clear so order matches dispatch order.
 */
export function saveLoopState(state: PersistedLoopState): Promise<void> {
  const myGeneration = clearedGeneration
  persistChain = persistChain
    .catch(() => {})
    .then(() => writeStateIfNotCleared(state, myGeneration))
  return persistChain
}

async function writeStateIfNotCleared(
  state: PersistedLoopState,
  myGeneration: number,
): Promise<void> {
  if (myGeneration < clearedGeneration) return
  try {
    const json = JSON.stringify(state, null, 2)
    await atomicWriteText(statePath(), json)
  } catch (err) {
    log.warn("persist", "Failed to save loop state", err)
  }
}

function isPersistedWorkerSlot(v: unknown): v is PersistedWorkerSlot {
  if (!v || typeof v !== "object") return false
  const w = v as Record<string, unknown>
  return (
    (w.slotId === 1 || w.slotId === 2 || w.slotId === 3 || w.slotId === 4) &&
    typeof w.sessionId === "string" &&
    w.sessionId.length > 0 &&
    typeof w.taskDescription === "string" &&
    typeof w.worktreePath === "string"
  )
}

/**
 * Per-field type guard for PersistedLoopState.
 */
function isPersistedLoopState(p: unknown): p is PersistedLoopState {
  if (!p || typeof p !== "object") return false
  const s = p as Record<string, unknown>
  const currentTaskOk =
    s.currentTask === undefined ||
    s.currentTask === null ||
    typeof s.currentTask === "string"
  const activeWorkersOk =
    s.activeWorkers === undefined ||
    (Array.isArray(s.activeWorkers) && s.activeWorkers.every(isPersistedWorkerSlot))
  return (
    s.version === 1 &&
    isNonNegativeInteger(s.iteration) &&
    (s.sessionId === null || typeof s.sessionId === "string") &&
    typeof s.stateType === "string" &&
    isNonNegativeInteger(s.rateLimitAttempts) &&
    typeof s.updatedAt === "string" &&
    currentTaskOk &&
    activeWorkersOk
  )
}

/**
 * Load the persisted loop state, or null if absent/invalid/unsupported version.
 * Synchronized with persistChain so pending saves or clears are completed first.
 */
export async function loadLoopState(): Promise<PersistedLoopState | null> {
  await persistChain.catch(() => {})
  try {
    const content = await readFile(statePath(), "utf-8")
    const parsed: unknown = JSON.parse(content)
    return isPersistedLoopState(parsed) ? parsed : null
  } catch {
    // Missing file or invalid JSON — nothing to resume.
    return null
  }
}

/**
 * Remove the persisted state (clean shutdown, or after a successful resume
 * decision). Never throws.
 */
export function clearLoopState(): Promise<void> {
  clearedGeneration++
  persistChain = persistChain
    .catch(() => {})
    .then(() => doClear())
  return persistChain
}

async function doClear(): Promise<void> {
  try {
    await unlink(statePath())
  } catch {
    // Already gone — fine.
  }
}
