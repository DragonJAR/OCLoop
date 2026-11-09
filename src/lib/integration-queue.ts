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
  findBlockedLineIndex,
  findTaskLineIndex,
  getTaskSubNotes,
  listPendingTaskDescriptions,
  markTaskCompleted,
  replaceTaskWithBlocked,
} from "./plan-parser"
import { isCaseInsensitiveFs } from "./path-semantics"
import {
  defaultGitRunner,
  GIT_LONG_TIMEOUT_MS,
  GIT_TIMEOUT_EXIT_CODE,
  type GitRunner,
} from "./workspace-manager"
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
  /** Absolute repository root — required so integration never silently runs git against the cwd. */
  repoRoot: string
  planPath: string
  runGit?: GitRunner
  readFile?: (path: string) => Promise<string | null>
  evalGate?: (job: IntegrationJob) => Promise<EvalGateVerdict>
  /** Injectable for tests; defaults to `process.platform`. */
  platform?: string
}

/**
 * Resolve a repo-relative path to the capitalization GIT tracks it under.
 *
 * On a case-insensitive file system `--plan plan.md` opens the tracked
 * `PLAN.md` just fine, but git pathspecs stay case-sensitive even with
 * `core.ignorecase=true`: `git reset -- plan.md` does NOT unstage `PLAN.md`
 * (so the plan leaked into the worker's commit) and `git checkout <sha> --
 * plan.md` fails with "pathspec did not match". Resolve once, here, and use
 * the result in every pathspec of the flow.
 *
 * Only runs on win32/darwin (POSIX keeps the exact path and runs no extra
 * git command). Any failure, no match or an ambiguous match falls back to the
 * given path, so a strange pathspec can never break the integration.
 */
export async function resolveGitPathCase(
  relPath: string,
  repoRoot: string,
  runGit: GitRunner,
  platform: string = process.platform,
): Promise<string> {
  if (!isCaseInsensitiveFs(platform)) return relPath
  try {
    const res = await runGit(["ls-files", "-z", "--full-name", "--", `:(icase)${relPath}`], repoRoot)
    if (res.exitCode !== 0) return relPath
    const matches = res.stdout.split("\0").filter((m) => m.length > 0)
    if (matches.includes(relPath)) return relPath
    return matches.length === 1 ? matches[0] : relPath
  } catch {
    return relPath
  }
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
      status: "plan_write_deferred"
      /** Which root PLAN.md CAS write was deferred (integration mark or eval block). */
      deferred: "integrated_mark" | "eval_block"
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
  const repoRoot = resolve(job.repoRoot)
  const runGit = job.runGit ?? defaultGitRunner
  const readFile = job.readFile ?? defaultReadFile
  const platform = job.platform ?? process.platform
  const absPlanPath = resolve(repoRoot, job.planPath)
  // Git's own capitalization of the plan (see resolveGitPathCase): every git
  // pathspec below must use it, or PLAN.md leaks into the worker's commit.
  const relPlanPath = await resolveGitPathCase(
    relative(repoRoot, absPlanPath).replace(/\\/g, "/"),
    repoRoot,
    runGit,
    platform,
  )
  const worktreePlanPath = join(job.worktreePath, relPlanPath)
  // Second, defensive barrier (the canonical pathspec above is the real fix):
  // never let a casing variant of the plan count as a changed code file.
  const foldCase = (p: string) => (isCaseInsensitiveFs(platform) ? p.toLowerCase() : p)
  const isPlanPath = (p: string) => foldCase(p) === foldCase(relPlanPath)

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
      const commitRes = await runGit(
        ["commit", "-m", `chore(ocloop): complete task ${job.taskId}`],
        job.worktreePath,
        { timeoutMs: 120000 },
      )
      if (commitRes.exitCode !== 0) {
        return { status: "error", message: commitRes.stderr }
      }
    }
  } else {
    // If the worker already committed changes that included PLAN.md, strip PLAN.md from the commit
    const diffPlan = await runGit(
      ["diff", "--name-only", `${job.baseSha}..HEAD`, "--", relPlanPath],
      job.worktreePath,
    )
    if (diffPlan.exitCode === 0 && diffPlan.stdout.trim() !== "") {
      await runGit(["checkout", job.baseSha, "--", relPlanPath], job.worktreePath)
      const amendRes = await runGit(
        ["commit", "--amend", "--no-edit", "--allow-empty"],
        job.worktreePath,
        { timeoutMs: 120000 },
      )
      if (amendRes.exitCode !== 0) {
        return { status: "error", message: amendRes.stderr }
      }
    }
  }

  // 4. Run optional LM-judge evaluation gate BEFORE rebasing/merging to main
  if (job.evalGate) {
    const verdict = await job.evalGate(job)
    if (!verdict.pass) {
      if (verdict.retry) {
        return { status: "eval_retry", feedback: verdict.feedback }
      }
      // Honor the CAS result: `no_change` means the task is already [BLOCKED]
      // (benign — treat as blocked); `deferred`/`io_error` mean the mark never
      // landed, and reporting eval_blocked would treat an unmarked task as done.
      const cas = await compareAndSwapPlan(
        absPlanPath,
        (c) => replaceTaskWithBlocked(c, job.taskDescription, verdict.reason),
        "eval",
      )
      if (!cas.wrote) {
        if (cas.skipped === "no_change") {
          // Already [BLOCKED] (benign) vs task gone from the root plan (the
          // block will never be recorded): the line must really be [BLOCKED],
          // not merely present. A task that is still [x] has NOT been
          // blocked, and calling that benign would drop the [BLOCKED] mark
          // silently — the task would read as done while its eval failed.
          const planText = await Bun.file(absPlanPath).text().catch(() => null)
          if (
            planText !== null &&
            findBlockedLineIndex(planText, job.taskDescription) !== -1
          ) {
            return { status: "eval_blocked", reason: verdict.reason }
          }
          return {
            status: "plan_write_deferred",
            deferred: "eval_block",
            reason: `Task ${job.taskId} no longer present in root PLAN.md for eval block`,
          }
        }
        return { status: "plan_write_deferred", deferred: "eval_block", reason: verdict.reason }
      }
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
    .filter((s) => s.length > 0 && !isPlanPath(s))

  if (changedFiles.length > 0 && mainHead !== job.baseSha) {
    const rebaseRes = await runGit(["rebase", mainHead], job.worktreePath, {
      timeoutMs: GIT_LONG_TIMEOUT_MS,
    })
    if (rebaseRes.exitCode === GIT_TIMEOUT_EXIT_CODE) {
      return { status: "error", message: rebaseRes.stderr }
    }
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
  const markCas = await compareAndSwapPlan(
    absPlanPath,
    (content) =>
      markTaskCompleted(content, job.taskDescription, {
        notes: extractedNotes,
        reconTasks: extractedReconTasks,
      }),
    "integration",
  )
  // Honor the CAS result: main was already fast-forwarded, but the [x] mark
  // must have landed for the task to count as done.
  if (!markCas.wrote) {
    if (markCas.skipped === "no_change") {
      // The transform found nothing to mark. Two very different causes:
      // (a) the task is no longer markable in the root plan (the agent
      //     checked it off itself, or a prior pass already [BLOCKED]-marked
      //     it) — the commit is already merged, so the integration counts as
      //     done; nothing is left to record.
      // (b) the task description is gone entirely (another writer rewrote
      //     the plan) — the plan will never record this integration, and a
      //     false "integrated" would hide it. Distinguish via parser-aware
      //     presence (task-line matching outside code fences): a raw
      //     substring hit inside a note or fence must not count.
      const planText = await Bun.file(absPlanPath).text().catch(() => null)
      if (planText !== null && findTaskLineIndex(planText, job.taskDescription) !== -1) {
        return {
          status: "integrated",
          commitSha: workerHead,
          changedFiles,
          extractedNotes,
          extractedReconTasks,
        }
      }
      return {
        status: "plan_write_deferred",
        deferred: "integrated_mark",
        reason: `Task ${job.taskId} no longer present in root PLAN.md after integration`,
      }
    }
    // deferred (root PLAN.md changed underfoot) or io_error: reporting
    // "integrated" would leave the task unchecked and the scheduler could
    // relaunch it over the promoted commit. Surface the deferral.
    return {
      status: "plan_write_deferred",
      deferred: "integrated_mark",
      reason: `Root PLAN.md mark skipped (${markCas.skipped ?? "unknown"}) for task ${job.taskId}`,
    }
  }

  return {
    status: "integrated",
    commitSha: workerHead,
    changedFiles,
    extractedNotes,
    extractedReconTasks,
  }
}
