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
 *   - The saved task appears in PLAN.md but as `[x]` (completed) → `completed`.
 *     The work was done; the next iteration will start fresh.
 *   - The saved task is still pending in PLAN.md but is NOT the first pending
 *     task → `reordered`. PLAN.md was edited to insert a task above it; the
 *     next iteration will pick the new top task, skipping the saved one for
 *     now (it will be reached again once the inserted task is done).
 *   - The saved task no longer appears in PLAN.md at all → `removed`. The
 *     next iteration will start from whatever is now first (or halt with
 *     plan_complete if nothing is left).
 */

import { getCurrentTaskFromContent } from "./plan-parser"

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
  // saved task — split the input on lines once, then walk the array.
  // `parseTaskLine` would re-parse the line, but here we only need to know
  // whether the saved task's description appears and what its `[x]/[ ]`
  // status is, so a lightweight scan is enough and keeps the helper
  // dependency-free of the parser's full task type.
  const lines = planContent.split("\n")
  let savedStillPending = false
  for (const line of lines) {
    // Match `- [ ] savedTask` or `- [x] savedTask` (the loop only ever
    // saved a "pending" task, so the completed case below is the one we
    // need to distinguish from "removed").
    const match = line.match(/^[-*]\s+\[(x| )\]\s+(.+?)\s*$/)
    if (!match) continue
    const status = match[1]
    const description = match[2]
    if (description !== savedTask) continue
    if (status === " ") {
      savedStillPending = true
    }
    // `status === "x"` → the saved task is now marked done. We fall
    // through to return "completed" below.
    break
  }
  if (savedStillPending) {
    // The saved task is still pending, just not first anymore. PLAN.md was
    // reordered to put a different task above it.
    return { kind: "reordered", saved: savedTask, current: current ?? "" }
  }
  // The saved task is no longer pending. Two sub-cases:
  //   - It's now `[x]` → "completed" (work was done in some other process,
  //     perhaps a manual edit).
  //   - It no longer appears at all → "removed" (the user deleted/renamed
  //     the line).
  // The scan above only sets `savedStillPending`; the absence of a pending
  // match plus the presence of any match with the description means
  // "completed", and the total absence means "removed".
  const stillPresentAsCompleted = lines.some((line) => {
    const match = line.match(/^[-*]\s+\[x\]\s+(.+?)\s*$/)
    return !!match && match[1] === savedTask
  })
  if (stillPresentAsCompleted) {
    return { kind: "completed", saved: savedTask }
  }
  return { kind: "removed", saved: savedTask, current: current }
}
