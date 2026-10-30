/**
 * Git worktree workspace manager for isolated parallel agent execution (slots 1..4).
 *
 * Each worker slot gets a deterministic directory under `.loop-worktrees/slot-<N>`
 * (automatically ignored by OCLoop's `.loop*` rule in `.gitignore`).
 *
 * Responsibilities:
 * - Create or reset a detached git worktree at the current `HEAD` of the root repo.
 * - Symlink `node_modules` from the root repo into the worktree so `bun test` and
 *   `tsc --noEmit` work immediately without running `bun install` per worker.
 * - Tear down worktrees cleanly on session completion or process shutdown.
 */

import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { lstat, mkdir, rm, symlink, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { WorkerSlotId } from "../types"
import { log } from "./debug-logger"

export const WORKTREES_DIR = ".loop-worktrees"

export interface GitCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type GitRunner = (args: string[], cwd: string) => Promise<GitCommandResult>

export interface WorkerWorkspace {
  slotId: WorkerSlotId
  worktreePath: string
  baseSha: string
}

export interface WorkspaceManagerOptions {
  repoRoot?: string
  runGit?: GitRunner
}

/**
 * Default git subprocess runner using `node:child_process.execFile`.
 * Never rejects; returns `{ exitCode, stdout, stderr }`.
 */
export const defaultGitRunner: GitRunner = (args: string[], cwd: string): Promise<GitCommandResult> =>
  new Promise((resolvePromise) => {
    execFile(
      "git",
      args,
      { cwd, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code: number }).code)
            : err
              ? 1
              : 0
        resolvePromise({
          exitCode: code,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
        })
      },
    )
  })

export function getSlotWorktreePath(repoRoot: string, slotId: WorkerSlotId): string {
  return join(resolve(repoRoot), WORKTREES_DIR, `slot-${slotId}`)
}

async function removeNodeModulesSymlink(worktreePath: string): Promise<void> {
  const nmPath = join(worktreePath, "node_modules")
  try {
    const st = await lstat(nmPath)
    if (st.isSymbolicLink()) {
      await unlink(nmPath)
    }
  } catch {
    // Absent — nothing to unlink
  }
}

async function ensureNodeModulesSymlink(repoRoot: string, worktreePath: string): Promise<void> {
  const rootNm = join(resolve(repoRoot), "node_modules")
  const targetNm = join(worktreePath, "node_modules")
  if (!existsSync(rootNm) || existsSync(targetNm)) return
  try {
    await symlink(
      rootNm,
      targetNm,
      process.platform === "win32" ? "junction" : "dir",
    )
  } catch (err) {
    log.debug("git", "Could not symlink node_modules into worktree", {
      worktreePath,
      error: String(err),
    })
  }
}

/**
 * Acquire and prepare an isolated git worktree for `slotId` at `repoRoot`'s current `HEAD`.
 */
export async function acquireSlotWorkspace(
  slotId: WorkerSlotId,
  options: WorkspaceManagerOptions = {},
): Promise<WorkerWorkspace> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd())
  const runGit = options.runGit ?? defaultGitRunner
  const worktreesRoot = join(repoRoot, WORKTREES_DIR)
  const worktreePath = getSlotWorktreePath(repoRoot, slotId)

  await mkdir(worktreesRoot, { recursive: true })

  const headRes = await runGit(["rev-parse", "HEAD"], repoRoot)
  if (headRes.exitCode !== 0 || !headRes.stdout.trim()) {
    throw new Error(
      `Failed to resolve HEAD in ${repoRoot}: ${headRes.stderr.trim() || "empty SHA"}`,
    )
  }
  const baseSha = headRes.stdout.trim()

  const gitFileInWorktree = join(worktreePath, ".git")
  if (existsSync(gitFileInWorktree)) {
    // Worktree already registered — abort any lingering rebase/merge and reset to baseSha
    await runGit(["rebase", "--abort"], worktreePath)
    await runGit(["merge", "--abort"], worktreePath)
    const resetRes = await runGit(["reset", "--hard", baseSha], worktreePath)
    if (resetRes.exitCode === 0) {
      await runGit(["clean", "-fd", "-e", "node_modules"], worktreePath)
      await ensureNodeModulesSymlink(repoRoot, worktreePath)
      return { slotId, worktreePath, baseSha }
    }
    // If reset failed (corrupted worktree), tear it down and re-create below
    await releaseSlotWorkspace(slotId, { repoRoot, runGit })
  } else if (existsSync(worktreePath)) {
    await removeNodeModulesSymlink(worktreePath)
    await rm(worktreePath, { recursive: true, force: true })
  }

  await runGit(["worktree", "prune"], repoRoot)
  const addRes = await runGit(
    ["worktree", "add", "--force", "--detach", worktreePath, baseSha],
    repoRoot,
  )
  if (addRes.exitCode !== 0) {
    throw new Error(
      `Failed to create worktree for slot ${slotId}: ${addRes.stderr.trim() || addRes.stdout.trim()}`,
    )
  }

  await ensureNodeModulesSymlink(repoRoot, worktreePath)
  return { slotId, worktreePath, baseSha }
}

/**
 * Release a single worker slot worktree cleanly. Best-effort, never throws.
 */
export async function releaseSlotWorkspace(
  slotId: WorkerSlotId,
  options: WorkspaceManagerOptions = {},
): Promise<void> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd())
  const runGit = options.runGit ?? defaultGitRunner
  const worktreePath = getSlotWorktreePath(repoRoot, slotId)

  try {
    await removeNodeModulesSymlink(worktreePath)
    await runGit(["worktree", "remove", "--force", worktreePath], repoRoot)
    if (existsSync(worktreePath)) {
      await rm(worktreePath, { recursive: true, force: true })
    }
    await runGit(["worktree", "prune"], repoRoot)
  } catch (err) {
    log.warn("git", `Failed to release worktree for slot ${slotId}`, err)
  }
}

/**
 * Release all 4 worker worktrees and remove `.loop-worktrees` if empty.
 */
export async function cleanupAllWorkspaces(
  options: WorkspaceManagerOptions = {},
): Promise<void> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd())
  const runGit = options.runGit ?? defaultGitRunner
  const slots: WorkerSlotId[] = [1, 2, 3, 4]

  for (const slotId of slots) {
    await releaseSlotWorkspace(slotId, { repoRoot, runGit })
  }

  try {
    const worktreesRoot = join(repoRoot, WORKTREES_DIR)
    if (existsSync(worktreesRoot)) {
      await rm(worktreesRoot, { recursive: true, force: true })
    }
  } catch {
    // ignore
  }
}
