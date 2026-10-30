/**
 * Serial FIFO Integration Queue for parallel worker slots.
 *
 * Guarantees that even when up to 4 agents finish concurrently:
 * 1. Only one worker integrates at a time (`createSerialQueue`).
 * 2. Double barrier on `PLAN.md`: if the worker edited `PLAN.md` inside its
 *    worktree, any newly added memory notes or `(recon)` subtasks are extracted
 *    and `PLAN.md` is restored to `baseSha` before rebasing — making `PLAN.md`
 *    merge conflicts mathematically impossible.
 * 3. Optional LM-judge (`evalGate`) runs BEFORE promoting commits to `main`.
 *    If the eval fails with retry budget left, `main` remains untouched and
 *    the worker retries in its own worktree.
 * 4. Rebases the worker's code commits onto `repoRoot`'s current `HEAD`,
 *    fast-forwards `repoRoot`, and atomically marks the task `[x]` in the root
 *    `PLAN.md` via `compareAndSwapPlan`.
 */

import { join, relative, resolve } from "node:path"
import { compareAndSwapPlan } from "./plan-cas"
import {
  getTaskSubNotes,
  listPendingTaskDescriptions,
  markTaskCompleted,
  replaceTaskWithBlocked,
} from "./plan-parser"
import { defaultGitRunner, type GitRunner } from "./workspace-manager"
import type { WorkerSlotId } from "../types"

export interface SerialQueue {
  enqueue<T>(fn: () => Promise<T>): Promise<T>
  pendingCount(): number
}

/**
 * Promise-chain FIFO mutex (mirrors `persistChain` in `loop-state-store.ts`, DRY).
 * Every enqueued task runs strictly after all prior tasks settle.
 */
export function createSerialQueue(): SerialQueue {
  let chain: Promise<unknown> = Promise.resolve()
  let count = 0

  return {
    enqueue<T>(fn: () => Promise<T>): Promise<T> {
      count++
      const next = chain
        .catch(() => {})
        .then(async () => {
          try {
            return await fn()
          } finally {
            count--
          }
        })
      chain = next
      return next
    },
    pendingCount(): number {
      return count
    },
  }
}

export interface ExtractedPlanArtifacts {
  notes: string[]
  reconTasks: string[]
}

/**
 * Extract any new indented memory notes (`  - ...`) under `taskDescription` and
 * any new pending tasks (`- [ ] ...`) added by a worker to its local `PLAN.md`
 * copy, compared against `basePlanContent`.
 */
export function extractWorkerPlanEdits(
  basePlanContent: string,
  workerPlanContent: string,
  taskDescription: string,
): ExtractedPlanArtifacts {
  const beforePending = new Set(listPendingTaskDescriptions(basePlanContent))
  const afterPending = listPendingTaskDescriptions(workerPlanContent)
  const reconTasks = afterPending.filter(
    (desc) => !beforePending.has(desc) && desc !== taskDescription,
  )

  const baseNotes = new Set(getTaskSubNotes(basePlanContent, taskDescription))
  const notes = getTaskSubNotes(workerPlanContent, taskDescription).filter(
    (n) => !baseNotes.has(n),
  )

  return { notes, reconTasks }
}

export type EvalGateVerdict =
  | { pass: true }
  | { pass: false; retry: true; feedback: string }
  | { pass: false; retry: false; reason: string }

export interface IntegrationJob {
  slotId: WorkerSlotId
  taskId: string
  taskDescription: string
  sessionId: string
  worktreePath: string
  baseSha: string
  repoRoot?: string
  planPath: string
  runGit?: GitRunner
  readFile?: (path: string) => Promise<string | null>
  evalGate?: (job: IntegrationJob) => Promise<EvalGateVerdict>
}

export type IntegrationOutcome =
  | {
      status: "integrated"
      commitSha: string
      changedFiles: string[]
      extractedNotes: string[]
      extractedReconTasks: string[]
    }
  | {
      status: "eval_retry"
      feedback: string
    }
  | {
      status: "eval_blocked"
      reason: string
    }
  | {
      status: "conflict_retry"
      conflictingFiles: string[]
      newBaseSha: string
    }
  | {
      status: "error"
      message: string
    }

async function defaultReadFile(path: string): Promise<string | null> {
  try {
    return await Bun.file(path).text()
  } catch {
    return null
  }
}

/**
 * Execute a single worker integration step (called inside `createSerialQueue()`).
 */
export async function integrateWorkerResult(
  job: IntegrationJob,
): Promise<IntegrationOutcome> {
  const repoRoot = resolve(job.repoRoot ?? process.cwd())
  const runGit = job.runGit ?? defaultGitRunner
  const readFile = job.readFile ?? defaultReadFile
  const absPlanPath = resolve(repoRoot, job.planPath)
  const relPlanPath = relative(repoRoot, absPlanPath).replace(/\\/g, "/")
  const worktreePlanPath = join(job.worktreePath, relPlanPath)

  // 1. Read base PLAN.md vs worktree PLAN.md to extract any agent-written notes/recon tasks
  const basePlanRes = await runGit(["show", `${job.baseSha}:${relPlanPath}`], repoRoot)
  const basePlanContent =
    basePlanRes.exitCode === 0
      ? basePlanRes.stdout
      : (await readFile(absPlanPath)) ?? ""
  const workerPlanContent = (await readFile(worktreePlanPath)) ?? basePlanContent

  const { notes: extractedNotes, reconTasks: extractedReconTasks } =
    extractWorkerPlanEdits(basePlanContent, workerPlanContent, job.taskDescription)

  // 2. Restore PLAN.md in the worktree to baseSha so it never conflicts on rebase
  await runGit(["checkout", job.baseSha, "--", relPlanPath], job.worktreePath)

  // 3. Check if the worker left uncommitted code changes (excluding .loop* and PLAN.md)
  const statusRes = await runGit(["status", "--porcelain"], job.worktreePath)
  if (statusRes.exitCode === 0 && statusRes.stdout.trim() !== "") {
    await runGit(["add", "-A"], job.worktreePath)
    await runGit(["reset", "HEAD", "--", relPlanPath], job.worktreePath)
    const stagedRes = await runGit(["diff", "--cached", "--name-only"], job.worktreePath)
    if (stagedRes.stdout.trim() !== "") {
      await runGit(
        ["commit", "-m", `chore(ocloop): complete task ${job.taskId}`],
        job.worktreePath,
      )
    }
  } else {
    // If the worker already committed changes that included PLAN.md, strip PLAN.md from the commit
    const diffPlan = await runGit(
      ["diff", "--name-only", `${job.baseSha}..HEAD`, "--", relPlanPath],
      job.worktreePath,
    )
    if (diffPlan.exitCode === 0 && diffPlan.stdout.trim() !== "") {
      await runGit(["checkout", job.baseSha, "--", relPlanPath], job.worktreePath)
      await runGit(["commit", "--amend", "--no-edit", "--allow-empty"], job.worktreePath)
    }
  }

  // 4. Run optional LM-judge evaluation gate BEFORE rebasing/merging to main
  if (job.evalGate) {
    const verdict = await job.evalGate(job)
    if (!verdict.pass) {
      if (verdict.retry) {
        return { status: "eval_retry", feedback: verdict.feedback }
      }
      await compareAndSwapPlan(
        absPlanPath,
        (c) => replaceTaskWithBlocked(c, job.taskDescription, verdict.reason),
        "eval",
      )
      return { status: "eval_blocked", reason: verdict.reason }
    }
  }

  // 5. Inspect changed files and rebase worktree commits onto current main HEAD
  const mainHeadRes = await runGit(["rev-parse", "HEAD"], repoRoot)
  if (mainHeadRes.exitCode !== 0 || !mainHeadRes.stdout.trim()) {
    return {
      status: "error",
      message: `Failed to read main HEAD: ${mainHeadRes.stderr.trim()}`,
    }
  }
  const mainHead = mainHeadRes.stdout.trim()

  const changedRes = await runGit(
    ["diff", "--name-only", `${job.baseSha}..HEAD`],
    job.worktreePath,
  )
  const changedFiles = changedRes.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== relPlanPath)

  if (changedFiles.length > 0 && mainHead !== job.baseSha) {
    const rebaseRes = await runGit(["rebase", mainHead], job.worktreePath)
    if (rebaseRes.exitCode !== 0) {
      const conflictRes = await runGit(
        ["diff", "--name-only", "--diff-filter=U"],
        job.worktreePath,
      )
      const conflictingFiles = conflictRes.stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
      await runGit(["rebase", "--abort"], job.worktreePath)
      await runGit(["reset", "--hard", mainHead], job.worktreePath)
      return {
        status: "conflict_retry",
        conflictingFiles:
          conflictingFiles.length > 0 ? conflictingFiles : changedFiles,
        newBaseSha: mainHead,
      }
    }
  }

  // 6. Fast-forward main repo to the rebased worktree HEAD if new commits exist
  const workerHeadRes = await runGit(["rev-parse", "HEAD"], job.worktreePath)
  const workerHead = workerHeadRes.stdout.trim() || mainHead

  if (changedFiles.length > 0 && workerHead !== mainHead) {
    const ffRes = await runGit(["merge", "--ff-only", workerHead], repoRoot)
    if (ffRes.exitCode !== 0) {
      return {
        status: "error",
        message: `Fast-forward merge failed for task ${job.taskId}: ${ffRes.stderr.trim()}`,
      }
    }
  }

  // 7. Mark the task [x] (and append extracted notes/recon tasks) in root PLAN.md via CAS
  await compareAndSwapPlan(
    absPlanPath,
    (content) =>
      markTaskCompleted(content, job.taskDescription, {
        notes: extractedNotes,
        reconTasks: extractedReconTasks,
      }),
    "integration",
  )

  return {
    status: "integrated",
    commitSha: workerHead,
    changedFiles,
    extractedNotes,
    extractedReconTasks,
  }
}
