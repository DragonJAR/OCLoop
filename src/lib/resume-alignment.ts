/**
 * Detect a misalignment between the task the loop was working on at save time
 * and the first-pending task in PLAN.md at resume time. When the two differ,
 * the user has edited/reordered PLAN.md between crash and resume, and a naive
 * resume would silently skip the original task. The fix does NOT change the
 * resume flow — the agent still picks the first pending task, as its prompt
 * instructs — it just surfaces the misalignment as a warning in .loop.log and
 * as an activity event so the user can confirm the change was intentional.
 *
 * The helper is pure: it takes the saved task and the current PLAN.md text and
 * returns a structured ResumeAlignment (or null when nothing to report). Keeping
 * it pure lets the same rules be unit-tested without touching the loop or FS.
 *
 * Semantics:
 *   - `savedTask` is `null`/`undefined`/empty → `null`. Backward-compat: a
 *     state file written before this field was added has no task to check.
 *   - The saved task is still the first pending task in PLAN.md → `null`.
 *   - The saved task appears in PLAN.md but as `[x]`/`[X]` (completed) →
 *     `completed`. The work was done; the next iteration will start fresh.
 *   - The saved task is still pending in PLAN.md but is NOT the first pending
 *     task → `reordered`. PLAN.md was edited to insert a task above it; the
 *     next iteration will pick the new top task, skipping the saved one for
 *     now (it will be reached again once the inserted task is done).
 *   - The saved task no longer appears in PLAN.md at all → `removed`. The
 *     next iteration will start from whatever is now first (or halt with
 *     plan_complete if nothing is left). A task re-tagged `[MANUAL]` or
 *     `[BLOCKED]` (no longer pending nor completed) also reports `removed`,
 *     surfacing the edit so the user can confirm it was intentional.
 */

import { getCurrentTaskFromContent, parseTaskLine } from "./plan-parser"
import { splitLines } from "./text"

/**
 * Structured description of a misalignment between the saved task and the
 * current PLAN.md content. `null` means "no misalignment, no warning".
 */
export type ResumeAlignment =
  | {
      kind: "completed"
      saved: string
    }
  | {
      kind: "reordered"
      saved: string
      current: string
    }
  | {
      kind: "removed"
      saved: string
      current: string | null
    }

/**
 * Pure helper. Returns a `ResumeAlignment` describing the misalignment
 * between the loop's saved task and the current PLAN.md content, or `null`
 * when there is nothing to warn about.
 *
 * `savedTask` is the value persisted in `PersistedLoopState.currentTask` —
 * the description of the first pending task at save time, or `null` if
 * PLAN.md had no pending task at save time.
 *
 * `planContent` is the raw text of PLAN.md at resume time.
 */
export function describeResumeAlignment(
  savedTask: string | null | undefined,
  planContent: string,
): ResumeAlignment | null {
  // Backward-compat: no saved task → no check. Older state files (pre-#4)
  // simply don't have the field, and the resume flow has no point of
  // reference to validate against.
  if (savedTask === null || savedTask === undefined || savedTask === "") {
    return null
  }
  const current = getCurrentTaskFromContent(planContent)
  // Fast path: the first-pending task still matches what was being worked
  // on. PLAN.md is unchanged (or only completed-tasks were touched), so the
  // resume can proceed silently.
  if (current === savedTask) {
    return null
  }
  // Slow path: the first-pending task is now something else. Decide what
  // kind of edit the user made by scanning every line of PLAN.md for the
  // saved task. We reuse `parseTaskLine` (the canonical PLAN.md line
  // parser) instead of a hand-rolled regex: the two grammars had diverged
  // (the old scan regex only matched lowercase `[x]`, not `[X]`, and did
  // not handle indented sub-tasks or `[MANUAL]`/`[BLOCKED]` tagging the way
  // `parseTaskLine` does — `getCurrentTaskFromContent` already uses it, so
  // the saved `currentTask` and the scan here now share one grammar).
  // splitLines tolerates CRLF/lone-CR so a Windows-edited PLAN.md scans the
  // same as a Unix one (parseTaskLine trims per-line, but be consistent with
  // the rest of the plan readers).
  const lines = splitLines(planContent)
  let savedStillPending = false
  let savedNowCompleted = false
  for (const line of lines) {
    const task = parseTaskLine(line)
    if (task.type === "not-a-task") continue
    if (task.description !== savedTask) continue
    // First line whose description matches the saved task decides its
    // current status. (A pending + completed duplicate of the same
    // description is pathological markdown; matching the first keeps the
    // verdict deterministic.)
    if (task.type === "pending") {
      savedStillPending = true
    } else if (task.type === "completed") {
      savedNowCompleted = true
    }
    // manual/blocked matches are intentionally neither: the task is
    // present but no longer actionable, so it is neither "still pending"
    // (reordered) nor "completed" — it falls through to "removed" below,
    // which surfaces the edit to the user.
    break
  }
  if (savedStillPending) {
    // The saved task is still pending, just not first anymore. PLAN.md was
    // reordered to put a different task above it.
    return { kind: "reordered", saved: savedTask, current: current ?? "" }
  }
  if (savedNowCompleted) {
    // The saved task is now `[x]`/`[X]` → "completed" (work was done in
    // some other process, perhaps a manual edit).
    return { kind: "completed", saved: savedTask }
  }
  // The saved task no longer appears as pending or completed → "removed"
  // (the user deleted/renamed the line, or re-tagged it MANUAL/BLOCKED).
  return { kind: "removed", saved: savedTask, current: current }
}
