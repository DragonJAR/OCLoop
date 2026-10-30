/**
 * DAG Task Scheduler for orchestrated parallel execution in OCLoop (1..4 agents).
 *
 * Responsibilities:
 * 1. Validate task graph integrity (detect dependency cycles and unknown IDs).
 * 2. Enforce phase barriers: tasks in phase N+1 are never scheduled while phase N
 *    still has pending or in-flight tasks.
 * 3. Enforce `(recon)` barriers: a reconnaissance task expands the phase's task list,
 *    so subsequent tasks in the same phase wait until any prior/active `(recon)` task
 *    in that phase completes and integrates.
 * 4. Enforce explicit `dependsOn` edges: all referenced task IDs must be `[x]`.
 * 5. Enforce conflict-free file scopes (`files:`): two tasks whose declared file
 *    paths/globs overlap are never scheduled concurrently.
 */

import type { PlanTaskNode } from "../types"
import { parsePlanTasks } from "./plan-parser"

export const MAX_PARALLEL_JOBS = 4
export const MIN_PARALLEL_JOBS = 1

export interface TaskGraphValidation {
  valid: boolean
  cycles: string[][]
  missingDeps: Array<{ taskId: string; missingDepId: string }>
}

export interface ScheduleBatchResult {
  /** Tasks eligible to start right now (capped by available worker slots). */
  eligible: PlanTaskNode[]
  /** True when pending tasks exist in the active phase but are waiting on in-flight tasks or dependencies. */
  waitingOnInFlight: boolean
  /** True when remaining pending tasks are permanently deadlocked (unsatisfiable dependencies or cycle). */
  deadlocked: boolean
  /** Diagnostic reason when deadlocked is true. */
  deadlockReason?: string
}

/** Clamp a requested job count to the supported integer range [1, 4]. */
export function clampParallelJobs(jobs: number | undefined): number {
  if (typeof jobs !== "number" || !Number.isFinite(jobs)) return MIN_PARALLEL_JOBS
  const int = Math.floor(jobs)
  return Math.max(MIN_PARALLEL_JOBS, Math.min(MAX_PARALLEL_JOBS, int))
}

function normalizeScopePattern(raw: string): { prefix: string; isWildcard: boolean } {
  const cleaned = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
  if (cleaned === "*" || cleaned === "**" || cleaned === "**/*") {
    return { prefix: "", isWildcard: true }
  }
  if (cleaned.endsWith("/**") || cleaned.endsWith("/*")) {
    const base = cleaned.replace(/\/\*\*?$/, "").replace(/\/+$/, "")
    return { prefix: base, isWildcard: true }
  }
  if (cleaned.includes("*")) {
    const starIdx = cleaned.indexOf("*")
    const base = cleaned.slice(0, starIdx).replace(/\/+$/, "")
    return { prefix: base, isWildcard: true }
  }
  if (cleaned.endsWith("/")) {
    return { prefix: cleaned.replace(/\/+$/, ""), isWildcard: true }
  }
  return { prefix: cleaned, isWildcard: false }
}

/**
 * Returns true if two single file/glob scope patterns can touch the same file.
 */
export function scopePatternsOverlap(patternA: string, patternB: string): boolean {
  const a = normalizeScopePattern(patternA)
  const b = normalizeScopePattern(patternB)

  if (a.isWildcard && a.prefix === "") return true
  if (b.isWildcard && b.prefix === "") return true

  if (!a.isWildcard && !b.isWildcard) {
    return a.prefix === b.prefix
  }

  if (a.isWildcard && !b.isWildcard) {
    return b.prefix === a.prefix || b.prefix.startsWith(`${a.prefix}/`)
  }

  if (!a.isWildcard && b.isWildcard) {
    return a.prefix === b.prefix || a.prefix.startsWith(`${b.prefix}/`)
  }

  // Both are wildcards/directories
  return (
    a.prefix === b.prefix ||
    a.prefix.startsWith(`${b.prefix}/`) ||
    b.prefix.startsWith(`${a.prefix}/`)
  )
}

/**
 * Returns true when two tasks' declared `files` lists overlap.
 * Note: if either list is empty, static scope overlap is false (isolation relies
 * on worktrees + integration-queue conflict detection).
 */
export function taskScopesOverlap(filesA: readonly string[], filesB: readonly string[]): boolean {
  if (filesA.length === 0 || filesB.length === 0) return false
  for (const a of filesA) {
    for (const b of filesB) {
      if (scopePatternsOverlap(a, b)) return true
    }
  }
  return false
}

/**
 * Validate the task dependency graph for unknown references and cycles.
 */
export function validateTaskGraph(tasks: readonly PlanTaskNode[]): TaskGraphValidation {
  const byId = new Map<string, PlanTaskNode>()
  for (const t of tasks) {
    if (!byId.has(t.id)) {
      byId.set(t.id, t)
    }
  }

  const missingDeps: Array<{ taskId: string; missingDepId: string }> = []
  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (!byId.has(dep)) {
        missingDeps.push({ taskId: t.id, missingDepId: dep })
      }
    }
  }

  const cycles: string[][] = []
  const state = new Map<string, "visiting" | "visited">()
  const stack: string[] = []

  function dfs(nodeId: string): void {
    state.set(nodeId, "visiting")
    stack.push(nodeId)

    const node = byId.get(nodeId)
    if (node) {
      for (const depId of node.dependsOn) {
        if (!byId.has(depId)) continue
        const depState = state.get(depId)
        if (depState === "visiting") {
          const cycleStart = stack.indexOf(depId)
          cycles.push([...stack.slice(cycleStart), depId])
        } else if (!depState) {
          dfs(depId)
        }
      }
    }

    stack.pop()
    state.set(nodeId, "visited")
  }

  for (const t of tasks) {
    if (!state.has(t.id)) {
      dfs(t.id)
    }
  }

  return {
    valid: missingDeps.length === 0 && cycles.length === 0,
    cycles,
    missingDeps,
  }
}

/**
 * Select the next batch of eligible tasks from `content` given the set of
 * currently in-flight task descriptions and `maxJobs` (1..4).
 */
export function selectEligibleTasks(
  content: string,
  inFlightDescriptions: ReadonlySet<string>,
  maxJobs: number,
): ScheduleBatchResult {
  const clampedJobs = clampParallelJobs(maxJobs)
  const tasks = parsePlanTasks(content)
  const pendingTasks = tasks.filter((t) => t.type === "pending")

  if (pendingTasks.length === 0) {
    return {
      eligible: [],
      waitingOnInFlight: inFlightDescriptions.size > 0,
      deadlocked: false,
    }
  }

  const validation = validateTaskGraph(tasks)
  if (validation.cycles.length > 0) {
    const cycleStr = validation.cycles[0].join(" -> ")
    return {
      eligible: [],
      waitingOnInFlight: false,
      deadlocked: true,
      deadlockReason: `Dependency cycle detected: ${cycleStr}`,
    }
  }

  // Build status lookup by task ID. If multiple tasks share an ID, all must be completed.
  const completedIds = new Set<string>()
  const byId = new Map<string, PlanTaskNode>()
  for (const t of tasks) {
    byId.set(t.id, t)
    if (t.type === "completed") {
      completedIds.add(t.id)
    }
  }
  for (const t of tasks) {
    if (t.type !== "completed") {
      completedIds.delete(t.id)
    }
  }

  // Identify in-flight task nodes
  const inFlightNodes = tasks.filter((t) => inFlightDescriptions.has(t.description))

  // Phase barrier: find the earliest phase that has either a pending task or an in-flight task.
  let activePhase = pendingTasks[0].phaseIndex
  for (const t of pendingTasks) {
    if (t.phaseIndex < activePhase) activePhase = t.phaseIndex
  }
  for (const t of inFlightNodes) {
    if (t.phaseIndex < activePhase) activePhase = t.phaseIndex
  }

  const availableSlots = Math.max(0, clampedJobs - inFlightDescriptions.size)
  if (availableSlots === 0) {
    return {
      eligible: [],
      waitingOnInFlight: true,
      deadlocked: false,
    }
  }

  // If an in-flight task belongs to an earlier phase than the earliest pending task,
  // wait for that earlier phase to finish before starting the new phase.
  if (inFlightNodes.some((t) => t.phaseIndex < pendingTasks[0].phaseIndex)) {
    return {
      eligible: [],
      waitingOnInFlight: true,
      deadlocked: false,
    }
  }

  // If a (recon) task is currently in-flight in the active phase, wait for it to finish
  // because it will expand the phase's task list on integration.
  if (inFlightNodes.some((t) => t.phaseIndex === activePhase && t.isRecon)) {
    return {
      eligible: [],
      waitingOnInFlight: true,
      deadlocked: false,
    }
  }

  const phasePending = pendingTasks.filter((t) => t.phaseIndex === activePhase)
  const eligible: PlanTaskNode[] = []
  const reservedFiles: string[][] = inFlightNodes.map((t) => t.files)

  for (const candidate of phasePending) {
    if (eligible.length >= availableSlots) break
    if (inFlightDescriptions.has(candidate.description)) continue

    // Check explicit dependencies
    const depsSatisfied = candidate.dependsOn.every((depId) => completedIds.has(depId))
    if (!depsSatisfied) continue

    // If candidate is a (recon) task, only run it if no other task is running or queued after it
    if (candidate.isRecon) {
      if (inFlightNodes.length === 0 && eligible.length === 0) {
        eligible.push(candidate)
      }
      // Always stop scanning past an incomplete (recon) task in the same phase
      break
    }

    // Check file-scope collision against in-flight tasks and already-selected batch tasks
    const hasFileCollision = reservedFiles.some((existingFiles) =>
      taskScopesOverlap(existingFiles, candidate.files),
    )
    if (hasFileCollision) continue

    eligible.push(candidate)
    reservedFiles.push(candidate.files)
  }

  if (eligible.length === 0) {
    if (inFlightDescriptions.size > 0) {
      return {
        eligible: [],
        waitingOnInFlight: true,
        deadlocked: false,
      }
    }
    // Nothing in flight and nothing in the active phase is eligible -> deadlock!
    const blockedReasons: string[] = []
    for (const t of phasePending) {
      const unmet = t.dependsOn.filter((depId) => !completedIds.has(depId))
      if (unmet.length > 0) {
        blockedReasons.push(
          `${t.id} waits on [${unmet
            .map((d) => {
              const target = byId.get(d)
              return target ? `${d} (${target.type})` : `${d} (missing)`
            })
            .join(", ")}]`,
        )
      }
    }
    return {
      eligible: [],
      waitingOnInFlight: false,
      deadlocked: true,
      deadlockReason:
        blockedReasons.join("; ") || "No eligible tasks in active phase",
    }
  }

  return {
    eligible,
    waitingOnInFlight: inFlightDescriptions.size > 0,
    deadlocked: false,
  }
}
