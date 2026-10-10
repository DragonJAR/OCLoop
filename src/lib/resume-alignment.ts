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
      current: string | null
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

/**
 * What `describeResumeAlignment` actually returns: the same union minus the
 * `expanded` variant. The function never yields `expanded` because it calls
 * `describePlanTransition` with `pendingBefore: null` — the path that would
 * produce `expanded` is gated on having a before-snapshot (see W2-13).
 *
 * `Exclude<...>` makes the runtime invariant a compile-time check: any caller
 * that wanted to add `case "expanded"` here would have to widen the return
 * type and revisit the function body, instead of inheriting a stale
 * "backward-compat alias" that hid the gap.
 */
export type ResumeAlignment = Exclude<PlanTransition, { kind: "expanded" }>

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
    return { kind: "completed", saved: lastWorkedTask, current }
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
  if (status === "missing") {
    // When a task is decomposed or replaced by subtasks, lastWorkedTask is no longer
    // in PLAN.md, but new pending tasks were added (W2-12).
    const added = pendingAdded(pendingBefore, planAfter)
    if (added.length > 0) {
      return {
        kind: "expanded",
        saved: lastWorkedTask,
        current: current ?? "",
        added,
      }
    }
  }
  // missing (without newly added tasks), manual, blocked, or not-a-task
  return { kind: "removed", saved: lastWorkedTask, current }
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
  // When pendingBefore is null, `describePlanTransition` never yields
  // 'expanded' (see W2-13). `ResumeAlignment` is `PlanTransition` minus
  // that variant, so an explicit type guard narrows `t` for the compiler
  // AND documents the invariant on the runtime side. If `describePlanTransition`
  // ever drifts to emit 'expanded' on the null-snapshot path, this branch
  // would silently swallow it — preferable to a cast that hides the change.
  if (t.kind === "expanded") return null
  return t
}