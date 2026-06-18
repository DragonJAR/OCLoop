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
 *
 * Writes are SERIALIZED through a single promise chain (`persistChain`). This is
 * not for atomicity (tmp+rename already gives that) — it's for ORDERING: the
 * completion effect dispatches both `saveLoopState` (running) and `clearLoopState`
 * (complete) as un-awaited `void` calls with no enforced order, and Node does not
 * guarantee resolve order across independent promises. A `saveLoopState` in flight
 * at the moment of completion could resolve AFTER the clear, re-creating the file
 * and making the next launch offer a spurious resume. Serializing means the clear
 * is queued strictly after any save dispatched before it, and a generation guard
 * makes any save enqueued BEFORE the clear a no-op once the clear has run.
 */

import { rename, writeFile, readFile, unlink } from "node:fs/promises"
import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { log } from "./debug-logger"

const STATE_FILE = ".loop-state.json"

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
   * the plan had no pending task at save time). Used at resume to detect a
   * misalignment: if PLAN.md was edited between crash and resume, the saved task
   * may no longer be the first pending task.
   *
   * Optional for backward compat with state files written before this field was
   * added — loadLoopState accepts files without it and the resume flow treats
   * the missing field as "no alignment check".
   */
  currentTask?: string | null
}

function statePath(): string {
  return join(process.cwd(), STATE_FILE)
}

/**
 * Per-save random tmp path. A fixed tmp name let two ocloop processes sharing
 * the same cwd race on the same file and interleave each other's mid-write
 * bytes. The rename to .loop-state.json is still last-writer-wins (atomic on
 * POSIX); the random suffix only prevents intermediate-state clobbering of the
 * tmp. Mirrors saveConfig in config.ts for consistency.
 */
function tmpPath(): string {
  return `${statePath()}.${randomBytes(6).toString("hex")}.tmp`
}

// --- Serialized write queue + generation guard ---
//
// persistChain: a tail of resolved promises; each write `.then()`s onto it so
// writes execute strictly in dispatch order (save ... save ... clear all run
// sequentially, not concurrently).
//
// clearedGeneration: bumped by clearLoopState. A save captures the generation at
// enqueue time and, before writing, checks it is still >= the cleared
// generation — if a clear has since run, the save is dropped. Belt-and-suspenders
// with the chain ordering (which already runs the clear last): protects against
// any future caller that awaits a save out-of-band.
let persistChain: Promise<void> = Promise.resolve()
let clearedGeneration = 0

/**
 * Atomically persist the loop state. Never throws — persistence is best-effort
 * and must not crash the app. Serialized: the write is queued after any prior
 * pending write/clear so order matches dispatch order.
 */
export function saveLoopState(state: PersistedLoopState): Promise<void> {
  // Capture the generation NOW (at dispatch time). If clearLoopState runs before
  // this save's turn comes, the generation check inside will drop it.
  const myGeneration = clearedGeneration
  persistChain = persistChain.then(() => writeStateIfNotCleared(state, myGeneration))
  return persistChain
}

async function writeStateIfNotCleared(
  state: PersistedLoopState,
  myGeneration: number,
): Promise<void> {
  // A clear dispatched after this save (but before its turn) raised the
  // generation: writing now would resurrect a completed run's state file.
  if (myGeneration < clearedGeneration) return
  // Capture the random tmp name once and reuse it across write/rename/unlink.
  // Each tmpPath() call returns a fresh random suffix; calling it twice would
  // produce two different names, so rename would target a file that writeFile
  // never wrote (and the cleanup unlink would miss it). Mirrors saveConfig.
  const tmp = tmpPath()
  try {
    const json = JSON.stringify(state, null, 2)
    await writeFile(tmp, json, "utf-8")
    try {
      await rename(tmp, statePath())
    } catch (renameErr) {
      // Best-effort cleanup of the orphan tmp: the rename failed (read-only dir,
      // ENOSPC, EPERM) but the tmp is still in our control — unlink it so the
      // next save starts clean. The unlink is itself best-effort.
      try {
        await unlink(tmp)
      } catch {
        // Nothing more we can do; the next saveLoopState overwrites the tmp.
      }
      throw renameErr
    }
  } catch (err) {
    log.warn("persist", "Failed to save loop state", err)
  }
}

/**
 * A finite, non-negative integer — the shape every count field
 * (`iteration`, `rateLimitAttempts`) must have. `typeof === "number"` alone
 * admits `NaN`, `Infinity`, and negatives, which would otherwise round-trip
 * through the reducer: `iteration: NaN` poisons `iteration + 1` forever, and a
 * negative `rateLimitAttempts` can never exceed `maxRateLimitRetries`, so the
 * circuit breaker never trips. Mirrors `isValidResilienceValue` in config.ts
 * (the same "valid count" notion, kept DRY by matching its checks).
 */
function isNonNegInt(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0
}

/**
 * Per-field type guard for PersistedLoopState. Validates every field so a
 * hand-edited or partially-written file with a wrong-typed sessionId/stateType/
 * rateLimitAttempts/updatedAt is rejected at the trust boundary, rather than
 * slipping through and being serialized into a server URL by the consumer.
 */
function isPersistedLoopState(p: unknown): p is PersistedLoopState {
  if (!p || typeof p !== "object") return false
  const s = p as Record<string, unknown>
  // `currentTask` is optional for backward compat with pre-#4 state files:
  // older snapshots were saved without it, and `loadLoopState` must keep
  // returning them. When present, validate the type so a hand-edited file
  // with a wrong-typed value (e.g. an array) is rejected at the trust
  // boundary — same defense-in-depth pattern as the other fields.
  const currentTaskOk =
    s.currentTask === undefined ||
    s.currentTask === null ||
    typeof s.currentTask === "string"
  return (
    s.version === 1 &&
    isNonNegInt(s.iteration) &&
    (s.sessionId === null || typeof s.sessionId === "string") &&
    typeof s.stateType === "string" &&
    isNonNegInt(s.rateLimitAttempts) &&
    typeof s.updatedAt === "string" &&
    currentTaskOk
  )
}

/**
 * Load the persisted loop state, or null if absent/invalid/unsupported version.
 */
export async function loadLoopState(): Promise<PersistedLoopState | null> {
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
 * decision). Never throws. Bumps the generation so any save enqueued BEFORE
 * this clear (and still in flight on the chain) is dropped instead of
 * resurrecting the file. Serialized onto the same chain as saves so the clear
 * runs strictly after all writes dispatched before it.
 */
export function clearLoopState(): Promise<void> {
  clearedGeneration++
  persistChain = persistChain.then(() => doClear())
  return persistChain
}

async function doClear(): Promise<void> {
  try {
    await unlink(statePath())
  } catch {
    // Already gone — fine.
  }
}
