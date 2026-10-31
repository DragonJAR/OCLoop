import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRoot } from "solid-js"
import { useLoopState } from "../hooks/useLoopState"
import { DEFAULT_RESILIENCE } from "./config"
import { t as T } from "./i18n"
import { markTaskCompleted, parsePlan, isStructurallyComplete } from "./plan-parser"
import { createParallelCoordinator } from "./parallel-run"
import type { OpencodeBackend } from "./api"
import type { WorkerSlotId } from "../types"

let scratchDir = ""
let promptPath = ""

describe("createParallelCoordinator", () => {
  beforeEach(() => {
    scratchDir = mkdtempSync(join(tmpdir(), "ocloop-parallel-"))
    promptPath = join(scratchDir, ".loop-prompt.md")
    writeFileSync(promptPath, "Execute task {{CURRENT_TASK}} in {{PLAN_FILE}}")
  })

  afterEach(() => {
    if (scratchDir) {
      rmSync(scratchDir, { recursive: true, force: true })
    }
  })

  it("dispatches up to 4 independent tasks concurrently across isolated worktree slots and integrates them serially without stepping on each other", async () => {
    let planContent = [
      "## Phase 1: Parallel Wave",
      "- [ ] **1.1** Task One (files: src/a.ts)",
      "- [ ] **1.2** Task Two (files: src/b.ts)",
      "- [ ] **1.3** Task Three (files: src/c.ts)",
      "- [ ] **1.4** Task Four (files: src/d.ts)",
      "- [ ] **1.5** Dependent Task Five (depends: 1.1, 1.2, 1.3, 1.4) (files: src/e.ts)",
    ].join("\n")

    let loop!: ReturnType<typeof useLoopState>
    createRoot((dispose) => {
      loop = useLoopState()
      loop.dispatch({ type: "server_ready" })
      loop.dispatch({ type: "start" })
      dispose()
    })

    let sessionSeq = 0
    const promptsBySession = new Map<string, string>()
    const directoryBySession = new Map<string, string>()
    const sessionCreatedEvents: Array<{ sessionId: string; slotId: WorkerSlotId }> = []
    const integratedOrder: string[] = []

    const coordinator = createParallelCoordinator({
      maxJobs: () => 4,
      repoRoot: scratchDir,
      planPath: "PLAN.md",
      promptPath,
      loop,
      resolveClient: (directory) => {
        const dir = directory ?? scratchDir
        return {
          version: 2,
          url: "http://test",
          createSession: async () => {
            const id = `ses-${++sessionSeq}`
            directoryBySession.set(id, dir)
            return { id, title: "" }
          },
          sendPrompt: async (params: { sessionID: string; parts: Array<{ text: string }> }) => {
            promptsBySession.set(params.sessionID, params.parts[0].text)
          },
          abortSession: async () => true,
          getSessionStatus: async () => ({ type: "idle" }),
          fetchMessages: async () => [],
          fetchAgents: async () => [],
          fetchConfig: async () => ({}),
          fetchProviderCatalog: async () => [],
          subscribeEvents: async () => ({ stream: (async function* () {})() }),
        } as unknown as OpencodeBackend
      },
      activeAgent: () => "build",
      activeModel: () => "anthropic/claude-sonnet-4-5",
      tierMapping: () => null,
      resilience: () => DEFAULT_RESILIENCE,
      monotonicNow: () => Date.now(),
      t: T,
      fallbackSummary: () => "All tasks completed",
      readPlanContent: async () => planContent,
      checkPlanComplete: async () => isStructurallyComplete(parsePlan(planContent)),
      getPlanCompleteSummary: async () => "5/5 tasks done",
      refreshPlan: async () => {},
      onWorkerSessionCreated: (sessionId, slotId) => {
        sessionCreatedEvents.push({ sessionId, slotId })
      },
      onIterationError: (err) => {
        throw err
      },
      acquireWorkspace: async (slotId: WorkerSlotId) => ({
        slotId,
        worktreePath: `/tmp/worktrees/slot-${slotId}`,
        baseSha: "sha-initial",
      }),
      releaseWorkspace: async () => {},
      cleanupWorkspaces: async () => {},
      integrateWorker: async (job) => {
        integratedOrder.push(job.taskId)
        planContent = markTaskCompleted(planContent, job.taskDescription) ?? planContent
        return {
          status: "integrated",
          commitSha: `sha-${job.taskId}`,
          changedFiles: [`src/${job.taskId}.ts`],
          extractedNotes: [],
          extractedReconTasks: [],
        }
      },
    })

    // 1. Kick off initial wave: should launch 1.1, 1.2, 1.3, 1.4 in slots 1..4 concurrently!
    await coordinator.scheduleAvailableSlots()

    const activeWave1 = coordinator.getActiveSlots()
    expect(activeWave1).toHaveLength(4)
    expect(activeWave1.map((s) => s.slotId)).toEqual([1, 2, 3, 4])
    expect(activeWave1.map((s) => s.taskId)).toEqual(["1.1", "1.2", "1.3", "1.4"])
    expect(sessionCreatedEvents.map((e) => e.slotId)).toEqual([1, 2, 3, 4])

    // Verify each session got its own isolated worktree directory and explicit task prompt
    for (const slot of activeWave1) {
      expect(directoryBySession.get(slot.sessionId)).toBe(`/tmp/worktrees/slot-${slot.slotId}`)
      expect(promptsBySession.get(slot.sessionId)).toContain(slot.taskDescription)
    }

    // 2. Complete slots 1, 2, 3: 1.5 still waits on 1.4
    await coordinator.handleSessionIdle(activeWave1[0].sessionId)
    await coordinator.handleSessionIdle(activeWave1[1].sessionId)
    await coordinator.handleSessionIdle(activeWave1[2].sessionId)
    expect(coordinator.getActiveSlots().map((s) => s.taskId)).toEqual(["1.4"])

    // 3. Complete slot 4 (task 1.4): unblocks 1.5, which is automatically scheduled!
    await coordinator.handleSessionIdle(activeWave1[3].sessionId)
    const activeWave2 = coordinator.getActiveSlots()
    expect(activeWave2).toHaveLength(1)
    expect(activeWave2[0].taskId).toBe("1.5")

    // 4. Complete task 1.5: all tasks done -> dispatches plan_complete!
    await coordinator.handleSessionIdle(activeWave2[0].sessionId)
    expect(coordinator.getActiveSlots()).toHaveLength(0)
    expect(integratedOrder).toEqual(["1.1", "1.2", "1.3", "1.4", "1.5"])
    const finalState = loop.state()
    expect(finalState.type).toBe("complete")
    if (finalState.type === "complete") {
      expect(finalState.iterations).toBe(5)
    }
  })

  it("retries a task in the same slot while preserving task file scope and cleans up failed slot reservations", async () => {
    let planContent = "- [ ] **1.1** Shared file edit (files: src/index.tsx)\n"
    let loop!: ReturnType<typeof useLoopState>
    createRoot((dispose) => {
      loop = useLoopState()
      loop.dispatch({ type: "server_ready" })
      loop.dispatch({ type: "start" })
      dispose()
    })

    let attempts = 0
    let failNextAcquire = true
    const errors: Array<{ err: unknown; slotId: WorkerSlotId }> = []
    const prompts: string[] = []

    const coordinator = createParallelCoordinator({
      maxJobs: () => 2,
      repoRoot: scratchDir,
      planPath: "PLAN.md",
      promptPath,
      loop,
      resolveClient: () =>
        ({
          version: 2,
          url: "http://test",
          createSession: async () => ({ id: `ses-attempt-${++attempts}`, title: "" }),
          sendPrompt: async (p: { parts: Array<{ text: string }> }) => {
            prompts.push(p.parts[0].text)
          },
          abortSession: async () => true,
        }) as unknown as OpencodeBackend,
      activeAgent: () => "build",
      activeModel: () => "openai/gpt-test",
      tierMapping: () => null,
      resilience: () => DEFAULT_RESILIENCE,
      monotonicNow: () => Date.now(),
      t: T,
      fallbackSummary: () => "done",
      readPlanContent: async () => planContent,
      checkPlanComplete: async () => isStructurallyComplete(parsePlan(planContent)),
      getPlanCompleteSummary: async () => "done",
      refreshPlan: async () => {},
      onIterationError: (err, slotId) => {
        errors.push({ err, slotId })
      },
      acquireWorkspace: async (slotId) => {
        if (failNextAcquire) {
          failNextAcquire = false
          throw new Error("git worktree transient error")
        }
        return {
          slotId,
          worktreePath: `/tmp/wt-${slotId}`,
          baseSha: "sha-1",
        }
      },
      cleanupWorkspaces: async () => {},
      integrateWorker: async (job) => {
        if (attempts === 1) {
          return {
            status: "conflict_retry",
            conflictingFiles: ["src/index.tsx"],
            newBaseSha: "sha-2",
          }
        }
        planContent = markTaskCompleted(planContent, job.taskDescription) ?? planContent
        return {
          status: "integrated",
          commitSha: "sha-3",
          changedFiles: ["src/index.tsx"],
          extractedNotes: [],
          extractedReconTasks: [],
        }
      },
    })

    // First schedule fails acquireWorkspace -> slot reservation must be cleaned up (0 active slots)
    await coordinator.scheduleAvailableSlots()
    expect(errors).toHaveLength(1)
    expect(coordinator.getActiveSlots()).toHaveLength(0)

    // Second schedule succeeds -> launches attempt 1 in slot 1
    await coordinator.scheduleAvailableSlots()
    expect(attempts).toBe(1)
    expect(coordinator.getActiveSlots()).toHaveLength(1)

    // First attempt hits rebase conflict -> automatically re-launches attempt 2 with conflict context AND original Reserved Scope
    await coordinator.handleSessionIdle("ses-attempt-1")
    expect(attempts).toBe(2)
    expect(prompts[1]).toContain("Rebase conflict on [src/index.tsx]")
    expect(prompts[1]).toContain("Reserved Scope: src/index.tsx")

    // Second attempt integrates cleanly -> plan complete
    await coordinator.handleSessionIdle("ses-attempt-2")
    expect(loop.state().type).toBe("complete")
  })

  it("claims a session synchronously: a duplicate session.idle cannot enqueue a second integration (re-entrancy guard)", async () => {
    let loop!: ReturnType<typeof useLoopState>
    createRoot((dispose) => {
      loop = useLoopState()
      loop.dispatch({ type: "server_ready" })
      loop.dispatch({ type: "start" })
      dispose()
    })

    let sessionSeq = 0
    let integrateCalls = 0
    let releaseIntegration: (() => void) | null = null
    let integratedOrder: string[] = []

    const coordinator = createParallelCoordinator({
      maxJobs: () => 2,
      repoRoot: scratchDir,
      planPath: "PLAN.md",
      promptPath,
      loop,
      resolveClient: () =>
        ({
          version: 2,
          url: "http://test",
          createSession: async () => ({ id: `ses-${++sessionSeq}`, title: "" }),
          sendPrompt: async () => {},
          abortSession: async () => true,
          getSessionStatus: async () => ({ type: "idle" }),
          fetchMessages: async () => [],
          fetchAgents: async () => [],
          fetchConfig: async () => ({}),
          fetchProviderCatalog: async () => [],
          subscribeEvents: async () => ({ stream: (async function* () {})() }),
        }) as unknown as OpencodeBackend,
      activeAgent: () => "build",
      activeModel: () => undefined,
      tierMapping: () => null,
      resilience: () => ({ ...DEFAULT_RESILIENCE }),
      monotonicNow: () => Date.now(),
      t: (k) => k,
      fallbackSummary: () => "done",
      readPlanContent: async () => "- [ ] **1.1** Only Task",
      checkPlanComplete: async () => true,
      getPlanCompleteSummary: async () => null,
      refreshPlan: async () => {},
      onIterationError: () => {},
      acquireWorkspace: async (slotId) => ({
        slotId,
        worktreePath: `/tmp/wt-${slotId}`,
        baseSha: "sha-1",
      }),
      cleanupWorkspaces: async () => {},
      integrateWorker: async (job) => {
        integrateCalls++
        integratedOrder.push(job.taskDescription)
        if (releaseIntegration) {
          await new Promise<void>((resolve) => {
            releaseIntegration = resolve
          })
        }
        releaseIntegration = null
        return {
          status: "integrated",
          commitSha: "sha-9",
          changedFiles: [],
          extractedNotes: [],
          extractedReconTasks: [],
        }
      },
    })

    await coordinator.scheduleAvailableSlots()
    expect(coordinator.getActiveSlots()).toHaveLength(1)
    const sid = coordinator.getActiveSessionIds().values().next().value as string

    // Arm the gate: the first integration blocks inside integrateWorker.
    releaseIntegration = () => {}
    // First idle claims the session and enters the (blocked) integration.
    const first = coordinator.handleSessionIdle(sid)
    // Give the claim a chance to run, then fire the duplicate BEFORE resolving.
    await Bun.sleep(5)
    expect(integrateCalls).toBe(1)
    const secondResult = await coordinator.handleSessionIdle(sid)
    // The duplicate must be absorbed as owned-without-enqueueing.
    expect(secondResult).toBe(true)
    releaseIntegration?.()
    expect(await first).toBe(true)
    expect(integrateCalls).toBe(1)
    expect(integratedOrder).toEqual(["**1.1** Only Task"])
  })

  it("drains a user pause when the last worker is released via session.error", async () => {
    let loop!: ReturnType<typeof useLoopState>
    createRoot((dispose) => {
      loop = useLoopState()
      loop.dispatch({ type: "server_ready" })
      loop.dispatch({ type: "start" })
      dispose()
    })

    let sessionSeq = 0
    const coordinator = createParallelCoordinator({
      maxJobs: () => 1,
      repoRoot: scratchDir,
      planPath: "PLAN.md",
      promptPath,
      loop,
      resolveClient: () =>
        ({
          version: 2,
          url: "http://test",
          createSession: async () => ({ id: `ses-${++sessionSeq}`, title: "" }),
          sendPrompt: async () => {},
          abortSession: async () => true,
          getSessionStatus: async () => ({ type: "busy" }),
          fetchMessages: async () => [],
          fetchAgents: async () => [],
          fetchConfig: async () => ({}),
          fetchProviderCatalog: async () => [],
          subscribeEvents: async () => ({ stream: (async function* () {})() }),
        }) as unknown as OpencodeBackend,
      activeAgent: () => "build",
      activeModel: () => undefined,
      tierMapping: () => null,
      resilience: () => ({ ...DEFAULT_RESILIENCE }),
      monotonicNow: () => Date.now(),
      t: (k) => k,
      fallbackSummary: () => "done",
      readPlanContent: async () => "- [ ] **1.1** Pausing Task",
      checkPlanComplete: async () => false,
      getPlanCompleteSummary: async () => null,
      refreshPlan: async () => {},
      onIterationError: () => {},
      acquireWorkspace: async (slotId) => ({
        slotId,
        worktreePath: `/tmp/wt-${slotId}`,
        baseSha: "sha-1",
      }),
      cleanupWorkspaces: async () => {},
      integrateWorker: async () => ({
        status: "error",
        message: "worker failed",
      }),
    })

    await coordinator.scheduleAvailableSlots()
    const sid = coordinator.getActiveSessionIds().values().next().value as string
    expect(sid).toBeTruthy()

    // User pauses while the worker runs.
    loop.dispatch({ type: "toggle_pause" })
    expect(loop.state().type).toBe("pausing")

    // The worker dies while paused: the drain must complete the pause.
    const releasedSlot = coordinator.handleSessionError(sid)
    expect(releasedSlot).toBeTruthy()
    expect(loop.state().type).toBe("paused")
  })
})
