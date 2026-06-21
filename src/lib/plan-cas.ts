/**
 * Compare-and-swap write for PLAN.md.
 *
 * Unifies the read → transform → re-read → byte-compare → write pattern that
 * was previously copy-pasted across four App.tsx call sites
 * (checkPlanComplete, writeEvalNote, blockTaskWithCompareAndSwap,
 * handleDecompose). The first three already guarded against concurrent edits
 * by the agent; the fourth (handleDecompose) did not, which was a latent
 * clobber bug — it could silently overwrite an agent edit made between the
 * read and the write. Routing all four through here fixes that and keeps the
 * guard logic in exactly one place.
 *
 * Contract:
 *
 * - Reads `planPath`. If unreadable, returns `{ wrote: false, result: null }`
 *   (best-effort; the error is logged, never thrown — persistence-style I/O
 *   mirrors `loop-state-store.ts`).
 * - Calls `transform(content)`. If it returns `null`, there is nothing to
 *   write (e.g. the task to block no longer exists) → `{ wrote: false }`. If
 *   it throws, the error is logged and we return `{ wrote: false }` without
 *   touching the file.
 * - Re-reads `planPath`. If it changed since the first read, another writer
 *   (typically the agent) beat us → defer: `{ wrote: false }`, file untouched.
 * - Otherwise writes the transformed content atomically and returns
 *   `{ wrote: true, result: updated }`.
 *
 * `result` is the new file content on success so callers can branch on it
 * (e.g. handleDecompose distinguishes "nothing to change" from "deferred"
 * from "written", via `wrote`).
 */

import { log } from "./debug-logger"

/** A pure-ish transform of the current content. Return `null` for "no change". */
export type PlanTransform = (content: string) => string | null

export interface CasResult {
  /** Whether the transformed content was written. */
  wrote: boolean
  /** The new content on success, else `null`. */
  result: string | null
}

/**
 * Atomically apply `transform` to PLAN.md via compare-and-swap. Never throws.
 *
 * The `caller` label is used only for log diagnostics so each call site's
 * deferrals are greppable in `.loop.log` (mirrors the per-site log keys the
 * inline versions used: "state", "eval", "decompose").
 */
export async function compareAndSwapPlan(
  planPath: string,
  transform: PlanTransform,
  caller: string = "plan",
): Promise<CasResult> {
  try {
    const before = await Bun.file(planPath).text()
    let updated: string | null
    try {
      updated = transform(before)
    } catch (transformErr) {
      log.warn(caller, "compareAndSwapPlan transform threw", transformErr)
      return { wrote: false, result: null }
    }
    if (updated === null) return { wrote: false, result: null }

    const current = await Bun.file(planPath).text()
    if (current !== before) {
      log.debug(caller, "PLAN.md changed during write; deferring", {})
      return { wrote: false, result: null }
    }
    await Bun.write(planPath, updated)
    return { wrote: true, result: updated }
  } catch (err) {
    // Read or write failed (file missing, EACCES, …). Best-effort: surface in
    // the log and let the caller decide. Persistence I/O never crashes the app.
    log.warn(caller, "compareAndSwapPlan I/O failed", err)
    return { wrote: false, result: null }
  }
}
