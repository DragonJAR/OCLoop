/**
 * Parallel Worker Pool Coordinator (`parallel-run.ts`).
 *
 * Orchestrates up to 4 concurrent OpenCode sessions in isolated git worktrees
 * while reusing OCLoop's existing primitives (DRY):
 * - `selectEligibleTasks` (`task-scheduler.ts`) for DAG + file-scope scheduling
 * - `acquireSlotWorkspace` / `cleanupAllWorkspaces` (`workspace-manager.ts`)
 * - `createSerialQueue` + `integrateWorkerResult` (`integration-queue.ts`)
 * - `runIteration` (`start-iteration.ts`) for session creation + prompt dispatch
 * - `NoProgressDetector` (`no-progress-detector.ts`) per task
 */

import type {
  LoopAction,
  LoopState,
  PlanTaskNode,
  WorkerSlotId,
  WorkerSlotInfo,
} from "../types"
import type { ResilienceConfig } from "./config"
import type { OpencodeBackend, ReconcileResult } from "./api"
import { abortSession, reconcileSession } from "./api"
import type { t as Tfn } from "./i18n"
import { NoProgressDetector } from "./no-progress-detector"
import { runIteration, type TierMapping } from "./start-iteration"
import { clampParallelJobs, selectEligibleTasks } from "./task-scheduler"
import {
  acquireSlotWorkspace,
  cleanupAllWorkspaces,
  type GitRunner,
  type WorkerWorkspace,
} from "./workspace-manager"
import {
  createSerialQueue,
  integrateWorkerResult,
  type EvalGateVerdict,
  type IntegrationJob,
  type IntegrationOutcome,
} from "./integration-queue"
import { toErrorMessage } from "./format"
import { log } from "./debug-logger"

const ALL_SLOTS: readonly WorkerSlotId[] = [1, 2, 3, 4]

interface ActiveSlotInternal extends WorkerSlotInfo {
  task: PlanTaskNode
  baseSha: string
  client: OpencodeBackend | null
  streamController?: AbortController
  retryPromptExtra?: string
}

export interface ParallelCoordinatorDeps {
  maxJobs: () => number
  repoRoot?: string
  planPath: string
  promptPath: string
  loop: {
    state: () => LoopState
    dispatch: (action: LoopAction) => void
  }
  resolveClient: (directory?: string) => OpencodeBackend | null
  activeAgent: () => string
  activeModel: () => string | undefined
  tierMapping: () => TierMapping | null
  resilience: () => ResilienceConfig
  monotonicNow: () => number
  t: typeof Tfn
  fallbackSummary: () => string
  readPlanContent: (planPath: string) => Promise<string>
  checkPlanComplete: () => Promise<boolean>
  getPlanCompleteSummary: (planPath: string) => Promise<string | null>
  refreshPlan: () => Promise<void>
  onSlotsChange?: (slots: WorkerSlotInfo[]) => void
  onWorkerSessionCreated?: (sessionId: string, slotId: WorkerSlotId) => void
  onWorkerIntegrated?: (info: {
    slot: WorkerSlotInfo
    durationMs: number
    outcome: Extract<IntegrationOutcome, { status: "integrated" }>
  }) => void
  onWorkerEvent?: (event: import("./api").BackendEvent, slotId: WorkerSlotId) => void
  onIterationError: (err: unknown, slotId: WorkerSlotId) => void
  evalGate?: (job: IntegrationJob) => Promise<EvalGateVerdict>
  runGit?: GitRunner
  acquireWorkspace?: (slotId: WorkerSlotId) => Promise<WorkerWorkspace>
  releaseWorkspace?: (slotId: WorkerSlotId) => Promise<void>
  cleanupWorkspaces?: () => Promise<void>
  integrateWorker?: (job: IntegrationJob) => Promise<IntegrationOutcome>
}

export interface ParallelCoordinator {
  /** Schedule and launch eligible tasks into available worker slots. */
  scheduleAvailableSlots: () => Promise<void>
  /** Handle `session.idle` for a specific session ID. Returns true if owned by a slot. */
  handleSessionIdle: (sessionId: string) => Promise<boolean>
  /** Handle `session.error` for a specific session ID. */
  handleSessionError: (sessionId: string | undefined) => WorkerSlotId | undefined
  /** Map a session ID to its active worker slot (1..4), if any. */
  getSlotBySessionId: (sessionId: string | undefined) => WorkerSlotInfo | undefined
  /** Snapshot of all currently active worker slots, sorted by slotId. */
  getActiveSlots: () => WorkerSlotInfo[]
  /** Set of all active session IDs across all slots. */
  getActiveSessionIds: () => ReadonlySet<string>
  /** Reconcile all active worker sessions against server ground truth (wake / watchdog). */
  reconcileAllSlots: () => Promise<ReconcileResult>
  /** Abort all active sessions and tear down all worktrees (shutdown / quit). */
  abortAllAndCleanup: () => Promise<void>
  /** Reset per-task no-progress detectors (e.g. on manual retry). */
  resetDetectors: () => void
}

export function buildParallelPromptSuffix(
  slotId: WorkerSlotId,
  task: PlanTaskNode,
  worktreePath: string,
  extraFeedback?: string,
): string {
  const lines = [
    "---",
    `[OCLoop Parallel Worker W${slotId}]`,
    `Assigned Task (${task.id}): ${task.description}`,
    `Isolated Worktree: ${worktreePath}`,
    ...(task.files.length > 0 ? [`Reserved Scope: ${task.files.join(", ")}`] : []),
    "CRITICAL PARALLEL RULES:",
    `1. Execute ONLY the assigned task above ("${task.description}"). Do NOT pick any other task from PLAN.md.`,
    "2. Work strictly inside this worktree directory and commit your code/test changes when checks pass.",
    "3. Do NOT stage or commit edits to PLAN.md — OCLoop's central integration queue marks your task [x] in the root PLAN.md after rebasing your commit cleanly.",
  ]
  if (extraFeedback) {
    lines.push("", `RETRY CONTEXT: ${extraFeedback}`)
  }
  return lines.join("\n")
}

export function createParallelCoordinator(
  deps: ParallelCoordinatorDeps,
): ParallelCoordinator {
  const slots = new Map<WorkerSlotId, ActiveSlotInternal>()
  const sessionToSlot = new Map<string, WorkerSlotId>()
  const detectors = new Map<string, NoProgressDetector>()
  const dispatchQueue = createSerialQueue()
  const integrationQueue = createSerialQueue()
  let lastIterationStartAt = 0
  let shuttingDown = false

  function notifySlotsChanged(): void {
    deps.onSlotsChange?.(getActiveSlots())
  }

  function getActiveSlots(): WorkerSlotInfo[] {
    return [...slots.values()]
      .sort((a, b) => a.slotId - b.slotId)
      .map((s) => ({
        slotId: s.slotId,
        taskId: s.taskId,
        taskDescription: s.taskDescription,
        sessionId: s.sessionId,
        worktreePath: s.worktreePath,
        status: s.status,
        startedAt: s.startedAt,
      }))
  }

  function getActiveSessionIds(): ReadonlySet<string> {
    return new Set(sessionToSlot.keys())
  }

  function getSlotBySessionId(sessionId: string | undefined): WorkerSlotInfo | undefined {
    if (!sessionId) return undefined
    const slotId = sessionToSlot.get(sessionId)
    if (!slotId) return undefined
    const slot = slots.get(slotId)
    return slot ? { ...slot } : undefined
  }

  function getDetectorForTask(taskDescription: string): NoProgressDetector {
    const threshold = Math.max(1, deps.resilience().noProgressThreshold | 0)
    let det = detectors.get(taskDescription)
    if (!det) {
      det = new NoProgressDetector(threshold)
      detectors.set(taskDescription, det)
    } else {
      det.setThreshold(threshold)
    }
    return det
  }

  function findFreeSlotId(maxJobs: number): WorkerSlotId | null {
    const limit = clampParallelJobs(maxJobs)
    for (const id of ALL_SLOTS) {
      if (id > limit) break
      if (!slots.has(id)) return id
    }
    return null
  }

  function stopSlotStream(slot: ActiveSlotInternal): void {
    if (slot.streamController) {
      try {
        slot.streamController.abort()
      } catch {
        // ignore
      }
      slot.streamController = undefined
    }
  }

  function startPerWorktreeStreamIfNeeded(slot: ActiveSlotInternal): void {
    // OpenCode v1 partitions `/event?directory=...` per directory, so a worktree
    // session needs its own directory-scoped event stream when version === 1.
    const client = slot.client
    if (!client || client.version !== 1 || !deps.onWorkerEvent) return
    stopSlotStream(slot)
    const controller = new AbortController()
    slot.streamController = controller

    void (async () => {
      try {
        const sub = await client.subscribeEvents({
          directory: slot.worktreePath,
          signal: controller.signal,
          timeoutMs: deps.resilience().pingTimeoutMs,
        })
        for await (const ev of sub.stream) {
          if (controller.signal.aborted) break
          deps.onWorkerEvent?.(ev, slot.slotId)
        }
      } catch {
        // Ignore stream termination when slot closes or aborts
      }
    })()
  }

  async function launchTaskInSlot(
    slotId: WorkerSlotId,
    task: PlanTaskNode,
    existingWorkspace?: WorkerWorkspace,
    extraFeedback?: string,
  ): Promise<void> {
    if (shuttingDown || deps.loop.state().type !== "running") return

    // Reserve the slot synchronously BEFORE the first `await` so concurrent
    // launches in `scheduleAvailableSlots` pick distinct slot IDs (single DRY reservation).
    const placeholderSlot: ActiveSlotInternal = {
      slotId,
      task,
      taskId: task.id,
      taskDescription: task.description,
      sessionId: "",
      worktreePath: existingWorkspace?.worktreePath ?? "",
      baseSha: existingWorkspace?.baseSha ?? "",
      status: "starting",
      startedAt: deps.monotonicNow(),
      client: null,
      retryPromptExtra: extraFeedback,
    }
    slots.set(slotId, placeholderSlot)
    notifySlotsChanged()

    let createdSid: string | undefined
    let handedOffToActiveSession = false

    try {
      const workspace = existingWorkspace
        ? existingWorkspace
        : deps.acquireWorkspace
          ? await deps.acquireWorkspace(slotId)
          : await acquireSlotWorkspace(slotId, {
              repoRoot: deps.repoRoot,
              runGit: deps.runGit,
            })

      if (shuttingDown || deps.loop.state().type !== "running") return

      const client = deps.resolveClient(workspace.worktreePath)
      if (!client) return

      placeholderSlot.worktreePath = workspace.worktreePath
      placeholderSlot.baseSha = workspace.baseSha
      placeholderSlot.client = client
      notifySlotsChanged()

      const detector = getDetectorForTask(task.description)
      const suffix = buildParallelPromptSuffix(
        slotId,
        task,
        workspace.worktreePath,
        extraFeedback,
      )

      const result = await runIteration({
        planPath: deps.planPath,
        promptPath: deps.promptPath,
        loop: deps.loop,
        client,
        watchdog: { notifyIterationStart: () => {} },
        noProgressDetector: detector,
        activeAgent: deps.activeAgent,
        activeModel: deps.activeModel,
        tierMapping: deps.tierMapping,
        resilience: deps.resilience,
        monotonicNow: deps.monotonicNow,
        t: deps.t,
        fallbackSummary: deps.fallbackSummary,
        setPendingManifestTask: () => {},
        onSessionCreated: (sid) => {
          createdSid = sid
          placeholderSlot.sessionId = sid
          placeholderSlot.status = "running"
          sessionToSlot.set(sid, slotId)
          deps.onWorkerSessionCreated?.(sid, slotId)
          startPerWorktreeStreamIfNeeded(placeholderSlot)
          notifySlotsChanged()
        },
        getLastIterationStartAt: () => lastIterationStartAt,
        setLastIterationStartAt: (n) => {
          lastIterationStartAt = n
        },
        runEvalIfPending: async () => true,
        checkPlanComplete: async () => false,
        getCurrentTask: async () => task.description,
        refreshPlan: deps.refreshPlan,
        getPlanCompleteSummary: deps.getPlanCompleteSummary,
        assignedTask: task.description,
        parallelPromptSuffix: suffix,
        parallelWorker: true,
      })

      if (result === "completed" && createdSid) {
        handedOffToActiveSession = true
      }
    } catch (err) {
      if (createdSid && placeholderSlot.client) {
        try {
          await abortSession(placeholderSlot.client, createdSid)
        } catch {
          // ignore
        }
      } else {
        detectors.get(task.description)?.reset()
      }
      deps.onIterationError(err, slotId)
    } finally {
      if (!handedOffToActiveSession) {
        stopSlotStream(placeholderSlot)
        if (createdSid) sessionToSlot.delete(createdSid)
        if (slots.get(slotId) === placeholderSlot) {
          slots.delete(slotId)
          notifySlotsChanged()
        }
      }
    }
  }

  async function scheduleAvailableSlots(): Promise<void> {
    return dispatchQueue.enqueue(async () => {
      if (shuttingDown) return
      const st = deps.loop.state()
      if (st.type !== "running") return

      const maxJobs = clampParallelJobs(deps.maxJobs())
      if (slots.size >= maxJobs) return

      let content: string
      try {
        content = await deps.readPlanContent(deps.planPath)
      } catch (err) {
        log.error("plan", "Failed to read PLAN.md in parallel scheduler", err)
        return
      }

      const inFlightDescriptions = new Set<string>(
        [...slots.values()].map((s) => s.taskDescription),
      )

      const batch = selectEligibleTasks(content, inFlightDescriptions, maxJobs)

      if (batch.eligible.length === 0) {
        if (slots.size === 0 && integrationQueue.pendingCount() === 0) {
          if (await deps.checkPlanComplete()) {
            let summaryContent: string | null = null
            try {
              summaryContent = await deps.getPlanCompleteSummary(deps.planPath)
            } catch {
              // ignore
            }
            deps.loop.dispatch({
              type: "plan_complete",
              summary: { summary: summaryContent ?? deps.fallbackSummary() },
            })
            return
          }
          if (batch.deadlocked) {
            deps.loop.dispatch({
              type: "error",
              source: "plan",
              message: batch.deadlockReason ?? "Plan tasks are deadlocked",
              recoverable: true,
            })
          }
        }
        return
      }

      // Launch all eligible tasks concurrently across available slots.
      // `launchTaskInSlot` reserves its slot synchronously before its first `await`.
      const launches: Promise<void>[] = []
      for (const task of batch.eligible) {
        if (deps.loop.state().type !== "running") break
        const freeSlotId = findFreeSlotId(maxJobs)
        if (!freeSlotId) break
        launches.push(launchTaskInSlot(freeSlotId, task))
      }
      await Promise.all(launches)
    })
  }

  async function handleSessionIdle(sessionId: string): Promise<boolean> {
    const slotId = sessionToSlot.get(sessionId)
    if (!slotId) return false
    const slot = slots.get(slotId)
    if (!slot) return false

    slot.status = "integrating"
    notifySlotsChanged()

    let shouldScheduleNext = false
    let pendingRetry: { workspace: WorkerWorkspace; feedback: string } | null = null

    await integrationQueue.enqueue(async () => {
      if (shuttingDown) return
      const durationMs = Math.max(0, deps.monotonicNow() - slot.startedAt)

      const job: IntegrationJob = {
        slotId: slot.slotId,
        taskId: slot.taskId,
        taskDescription: slot.taskDescription,
        sessionId: slot.sessionId,
        worktreePath: slot.worktreePath,
        baseSha: slot.baseSha,
        repoRoot: deps.repoRoot,
        planPath: deps.planPath,
        runGit: deps.runGit,
        evalGate: deps.evalGate,
      }

      const outcome = deps.integrateWorker
        ? await deps.integrateWorker(job)
        : await integrateWorkerResult(job)

      stopSlotStream(slot)
      sessionToSlot.delete(sessionId)
      slots.delete(slotId)
      notifySlotsChanged()

      if (outcome.status === "integrated") {
        detectors.delete(slot.taskDescription)

        deps.onWorkerIntegrated?.({
          slot: {
            slotId: slot.slotId,
            taskId: slot.taskId,
            taskDescription: slot.taskDescription,
            sessionId: slot.sessionId,
            worktreePath: slot.worktreePath,
            status: "integrating",
            startedAt: slot.startedAt,
          },
          durationMs,
          outcome,
        })

        await deps.refreshPlan()
        shouldScheduleNext = true
      } else if (outcome.status === "eval_retry" || outcome.status === "conflict_retry") {
        const det = getDetectorForTask(slot.taskDescription)
        det.notifyEvalRetry()
        pendingRetry =
          outcome.status === "eval_retry"
            ? {
                workspace: {
                  slotId,
                  worktreePath: slot.worktreePath,
                  baseSha: slot.baseSha,
                },
                feedback: `Evaluation judge feedback: ${outcome.feedback}`,
              }
            : {
                workspace: {
                  slotId,
                  worktreePath: slot.worktreePath,
                  baseSha: outcome.newBaseSha,
                },
                feedback: `Rebase conflict on [${outcome.conflictingFiles.join(", ")}] after a parallel task merged to main. Your worktree is now reset to the latest HEAD (${outcome.newBaseSha.slice(0, 8)}); re-apply your task changes cleanly on top of this updated base.`,
              }
      } else if (outcome.status === "eval_blocked") {
        detectors.delete(slot.taskDescription)
        await deps.refreshPlan()
        shouldScheduleNext = true
      } else if (outcome.status === "error") {
        deps.loop.dispatch({
          type: "error",
          source: "plan",
          message: outcome.message,
          recoverable: true,
        })
      }
    })

    if (shuttingDown) return true

    // Execute retry or next-wave scheduling OUTSIDE `integrationQueue.enqueue` so
    // session creation / minIterationGapMs never blocks other workers from integrating
    // and `integrationQueue.pendingCount()` reflects only remaining integrations.
    const currentState = deps.loop.state()
    if (pendingRetry && currentState.type === "running") {
      const retrySpec: { workspace: WorkerWorkspace; feedback: string } = pendingRetry
      await launchTaskInSlot(slotId, slot.task, retrySpec.workspace, retrySpec.feedback)
      return true
    }

    if (currentState.type === "pausing" && slots.size === 0 && integrationQueue.pendingCount() === 0) {
      deps.loop.dispatch({ type: "session_idle" })
      return true
    }

    if (shouldScheduleNext && currentState.type === "running") {
      await scheduleAvailableSlots()
    }

    return true
  }

  function handleSessionError(sessionId: string | undefined): WorkerSlotId | undefined {
    if (!sessionId) return undefined
    const slotId = sessionToSlot.get(sessionId)
    if (!slotId) return undefined
    const slot = slots.get(slotId)
    if (slot) {
      stopSlotStream(slot)
      sessionToSlot.delete(sessionId)
      slots.delete(slotId)
      notifySlotsChanged()
    }
    return slotId
  }

  async function reconcileAllSlots(): Promise<ReconcileResult> {
    const active = [...slots.values()].filter(
      (s): s is ActiveSlotInternal & { client: OpencodeBackend } =>
        s.sessionId !== "" && s.client !== null,
    )
    if (active.length === 0) {
      if (deps.loop.state().type === "running") {
        await scheduleAvailableSlots()
      }
      return "idle"
    }

    const verdicts = await Promise.all(
      active.map(async (slot) => ({
        slot,
        verdict: await reconcileSession(slot.client, slot.sessionId),
      })),
    )

    let anyWorking = false
    let anyUnknown = false

    for (const { slot, verdict } of verdicts) {
      if (verdict === "idle" || verdict === "missing") {
        await handleSessionIdle(slot.sessionId)
      } else if (verdict === "working") {
        anyWorking = true
      } else {
        anyUnknown = true
      }
    }

    if (anyWorking) return "working"
    if (anyUnknown) return "unknown"
    return "idle"
  }

  async function abortAllAndCleanup(): Promise<void> {
    shuttingDown = true
    const active = [...slots.values()]
    slots.clear()
    sessionToSlot.clear()
    notifySlotsChanged()

    await Promise.allSettled(
      active.map(async (slot) => {
        stopSlotStream(slot)
        if (slot.sessionId && slot.client) {
          try {
            await abortSession(slot.client, slot.sessionId)
          } catch {
            // ignore
          }
        }
        if (deps.releaseWorkspace) {
          await deps.releaseWorkspace(slot.slotId)
        }
      }),
    )

    try {
      if (deps.cleanupWorkspaces) {
        await deps.cleanupWorkspaces()
      } else {
        await cleanupAllWorkspaces({ repoRoot: deps.repoRoot, runGit: deps.runGit })
      }
    } catch (err) {
      log.warn("git", "Failed to cleanup parallel workspaces on shutdown", {
        message: toErrorMessage(err),
      })
    }
  }

  function resetDetectors(): void {
    detectors.clear()
  }

  return {
    scheduleAvailableSlots,
    handleSessionIdle,
    handleSessionError,
    getSlotBySessionId,
    getActiveSlots,
    getActiveSessionIds,
    reconcileAllSlots,
    abortAllAndCleanup,
    resetDetectors,
  }
}
