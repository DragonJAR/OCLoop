/**
 * Detect plan transitions between iterations and resume-time misalignment.
 *
 * `describePlanTransition` compares the task the loop just worked on against
 * the current PLAN.md (with an optional pending snapshot from iteration start)
 * to distinguish legitimate expansion (new `- [ ]` lines) from suspicious
 * reordering. `describeResumeAlignment` is the resume-only entry point (no
 * before-snapshot) and delegates to the same primitives.
 */

import {
  getCurrentTaskFromContent,
  listPendingTaskDescriptions,
  findTaskStatusByDescription,
} from "./plan-parser"

/**
 * Structured description of a plan transition between iterations.
 * `null` means no reportable change.
 */
export type PlanTransition =
  | {
      kind: "completed"
      saved: string
    }
  | {
      kind: "expanded"
      saved: string
      current: string
      added: string[]
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

/** @deprecated alias — resume warnings use the same shape minus `expanded`. */
export type ResumeAlignment =
  | { kind: "completed"; saved: string }
  | { kind: "reordered"; saved: string; current: string }
  | { kind: "removed"; saved: string; current: string | null }

function pendingAdded(
  pendingBefore: string[] | null,
  planAfter: string,
): string[] {
  if (!pendingBefore) return []
  const beforeSet = new Set(pendingBefore)
  return listPendingTaskDescriptions(planAfter).filter((d) => !beforeSet.has(d))
}

/**
 * Compare the task worked on in the previous iteration against the current
 * PLAN.md content. When `pendingBefore` is provided (snapshot at the previous
 * iteration's start), distinguishes `expanded` (new pending lines) from
 * `reordered` (same set, different first). When `pendingBefore` is null
 * (resume / first iteration), a still-pending saved task that is no longer
 * first reports `reordered`.
 */
export function describePlanTransition(
  lastWorkedTask: string | null | undefined,
  planAfter: string,
  pendingBefore: string[] | null,
): PlanTransition | null {
  if (lastWorkedTask === null || lastWorkedTask === undefined || lastWorkedTask === "") {
    return null
  }

  const current = getCurrentTaskFromContent(planAfter)
  if (current === lastWorkedTask) {
    return null
  }

  const status = findTaskStatusByDescription(planAfter, lastWorkedTask)
  if (status === "completed") {
    return { kind: "completed", saved: lastWorkedTask }
  }
  if (status === "pending") {
    const added = pendingAdded(pendingBefore, planAfter)
    if (added.length > 0) {
      return {
        kind: "expanded",
        saved: lastWorkedTask,
        current: current ?? "",
        added,
      }
    }
    return { kind: "reordered", saved: lastWorkedTask, current: current ?? "" }
  }
  // missing, manual, blocked, or not-a-task
  return { kind: "removed", saved: lastWorkedTask, current: current }
}

/**
 * Resume-time misalignment (no before-snapshot). See module doc for semantics.
 */
export function describeResumeAlignment(
  savedTask: string | null | undefined,
  planContent: string,
): ResumeAlignment | null {
  const t = describePlanTransition(savedTask, planContent, null)
  if (!t) return null
  if (t.kind === "expanded") {
    // Without a before-snapshot, treat expansion like reorder for resume warn.
    return { kind: "reordered", saved: t.saved, current: t.current }
  }
  return t
}