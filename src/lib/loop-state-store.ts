/**
 * Crash-resilient persistence of the loop's minimal progress to
 * `.loop-state.json` (next to `.loop.log`).
 *
 * The point is to survive the OCLoop *process itself* dying — not just OpenCode.
 * On every meaningful transition we write a tiny snapshot atomically (write to a
 * temp file, then rename — rename is atomic on the same filesystem, so a reader
 * never sees a half-written file). On startup we can read it back and decide
 * whether to reconcile/continue.
 *
 * `.loop-state.json` (and its `.tmp`) match the existing `.loop*` gitignore rule,
 * so they are never committed.
 */

import { rename, writeFile, readFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { log } from "./debug-logger"

const STATE_FILE = ".loop-state.json"
const TMP_FILE = ".loop-state.json.tmp"

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
}

function statePath(): string {
  return join(process.cwd(), STATE_FILE)
}

function tmpPath(): string {
  return join(process.cwd(), TMP_FILE)
}

/**
 * Atomically persist the loop state. Never throws — persistence is best-effort
 * and must not crash the app.
 */
export async function saveLoopState(state: PersistedLoopState): Promise<void> {
  try {
    const json = JSON.stringify(state, null, 2)
    await writeFile(tmpPath(), json, "utf-8")
    await rename(tmpPath(), statePath())
  } catch (err) {
    log.warn("persist", "Failed to save loop state", err)
  }
}

/**
 * Load the persisted loop state, or null if absent/invalid/unsupported version.
 */
export async function loadLoopState(): Promise<PersistedLoopState | null> {
  try {
    const content = await readFile(statePath(), "utf-8")
    const parsed = JSON.parse(content) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as PersistedLoopState).version === 1 &&
      typeof (parsed as PersistedLoopState).iteration === "number"
    ) {
      return parsed as PersistedLoopState
    }
    return null
  } catch {
    // Missing file or invalid JSON — nothing to resume.
    return null
  }
}

/**
 * Remove the persisted state (clean shutdown, or after a successful resume
 * decision). Never throws.
 */
export async function clearLoopState(): Promise<void> {
  try {
    await unlink(statePath())
  } catch {
    // Already gone — fine.
  }
}
