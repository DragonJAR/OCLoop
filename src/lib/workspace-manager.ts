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

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { lstat, mkdir, rm, symlink, unlink } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { WorkerSlotId } from "../types"
import { resolveCommandPath } from "./command-exists"
import { log } from "./debug-logger"
import { killTree, trackProcess, type KillableProcess } from "./kill-tree"

export const WORKTREES_DIR = ".loop-worktrees"

export interface GitCommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface GitRunOptions {
  /** Deadline for this command in ms (default {@link GIT_TIMEOUT_MS}). */
  timeoutMs?: number
}

export type GitRunner = (
  args: string[],
  cwd: string,
  options?: GitRunOptions,
) => Promise<GitCommandResult>

export interface WorkerWorkspace {
  slotId: WorkerSlotId
  worktreePath: string
  baseSha: string
}

export interface WorkspaceManagerOptions {
  repoRoot?: string
  runGit?: GitRunner
}

/** Exit code reported when git itself cannot be found (shell convention). */
export const GIT_NOT_FOUND_EXIT_CODE = 127

/**
 * Default git subprocess runner using `node:child_process.execFile`.
 * Never rejects; returns `{ exitCode, stdout, stderr }`. git is resolved from
 * PATH first so a missing binary surfaces as an explicit error instead of an
 * ENOENT folded into a generic exit code 1.
 */
export function createGitRunner(
  resolveGit: () => Promise<string | null> = () => resolveCommandPath("git"),
): GitRunner {
  return async (args, cwd, options) => {
    const git = await resolveGit()
    if (!git) {
      return {
        exitCode: GIT_NOT_FOUND_EXIT_CODE,
        stdout: "",
        stderr: "git executable not found on PATH; install git to use parallel worktrees",
      }
    }
    return execGit(git, args, cwd, undefined, options?.timeoutMs)
  }
}

export const defaultGitRunner: GitRunner = createGitRunner()

/** Exit code reported when git is killed for exceeding its deadline (`timeout(1)`). */
export const GIT_TIMEOUT_EXIT_CODE = 124
/** Default deadline for one git command: quick queries (rev-parse, status, prune). */
export const GIT_TIMEOUT_MS = 30_000
/**
 * Deadline for git commands that rewrite a whole working tree (worktree
 * add/remove, reset --hard, clean, rebase): a checkout with LFS or a
 * post-checkout hook in a large repo, or under Windows Defender, easily
 * exceeds {@link GIT_TIMEOUT_MS}.
 */
export const GIT_LONG_TIMEOUT_MS = 300_000
const LONG: GitRunOptions = { timeoutMs: GIT_LONG_TIMEOUT_MS }

export interface ExecGitOptions {
  cwd: string
  maxBuffer: number
  windowsHide: boolean
  env: NodeJS.ProcessEnv
}

/** An execFile-shaped launcher (injectable for tests). */
export type ExecFileFn = (
  file: string,
  args: string[],
  options: ExecGitOptions,
  callback: (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void,
) => KillableProcess | void

/**
 * Default {@link ExecFileFn}: execFile semantics on top of `spawn`, because
 * `execFile` silently drops `detached` (verified on Bun and Node). On POSIX the
 * child leads its own process group (and session, so no tty to prompt on), so
 * killTree reaches hooks, credential helpers and `gc --auto` — not just git.
 * Windows uses taskkill /t instead (detached there would open a console).
 * Tracked so the exit hook (`killAllTrackedSync`) still reaps it: a detached
 * child no longer receives the tty's SIGINT/SIGHUP.
 */
export const spawnExecFile: ExecFileFn = (file, args, options, callback) => {
  const child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    windowsHide: options.windowsHide,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })
  // A spawn that failed (ENOENT) has no pid and nothing to reap.
  if (child.pid) trackProcess(child)
  const out: Buffer[] = []
  const errOut: Buffer[] = []
  let size = 0
  let failure: Error | null = null
  let done = false
  const finish = (err: Error | null) => {
    if (done) return
    done = true
    callback(err, Buffer.concat(out).toString(), Buffer.concat(errOut).toString())
  }
  const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
    if (failure) return
    size += chunk.length
    if (size > options.maxBuffer) {
      failure = Object.assign(new Error("git output exceeded maxBuffer"), {
        code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      })
      killTree(child)
      return
    }
    chunks.push(chunk)
  }
  child.stdout?.on("data", collect(out))
  child.stderr?.on("data", collect(errOut))
  child.on("error", (err) => finish(err))
  child.on("close", (code, signal) => {
    if (failure) return finish(failure)
    if (code === 0) return finish(null)
    finish(Object.assign(new Error(`git exited with ${code ?? signal}`), { code, signal }))
  })
  return child
}

/**
 * Run git once. Never rejects. Exported (with an injectable exec/deadline)
 * for tests.
 *
 * Bounded: a credential prompt (SSH passphrase, Git Credential Manager) or a
 * stuck `.git/index.lock` would otherwise never settle, freezing a worker slot
 * or the serial integration queue forever. On the deadline the git tree is
 * killed and the promise resolves at once with GIT_TIMEOUT_EXIT_CODE — it does
 * not wait for pipes a credential-helper grandchild may still hold.
 */
export function execGit(
  git: string,
  args: string[],
  cwd: string,
  exec: ExecFileFn = spawnExecFile,
  timeoutMs: number = GIT_TIMEOUT_MS,
): Promise<GitCommandResult> {
  return new Promise((resolvePromise) => {
    // Declared before the timer reads it (no TDZ if exec throws synchronously).
    let child: KillableProcess | void = undefined
    let settled = false
    const settle = (result: GitCommandResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }
    const timer = setTimeout(() => {
      if (child) killTree(child)
      settle({
        exitCode: GIT_TIMEOUT_EXIT_CODE,
        stdout: "",
        stderr: `git ${args[0] ?? ""} timed out after ${timeoutMs}ms (credential prompt or a stuck .git/index.lock?)`,
      })
    }, timeoutMs)
    try {
      child = exec(
        git,
        args,
        {
          cwd,
          maxBuffer: 10 * 1024 * 1024,
          // windowsHide: background git must not flash a console window (or
          // steal focus) on Windows while worktrees are created in parallel.
          windowsHide: true,
          // Fail a credential prompt at once instead of burning the deadline.
          env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        },
        (err, stdout, stderr) => {
          const code =
            err && typeof (err as { code?: unknown }).code === "number"
              ? ((err as unknown as { code: number }).code)
              : err
                ? 1
                : 0
          settle({
            exitCode: code,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
          })
        },
      )
    } catch (err) {
      settle({ exitCode: 1, stdout: "", stderr: `git ${args[0] ?? ""} failed to start: ${String(err)}` })
    }
  })
}

export function getSlotWorktreePath(repoRoot: string, slotId: WorkerSlotId): string {
  return join(resolve(repoRoot), WORKTREES_DIR, `slot-${slotId}`)
}

async function removeNodeModulesSymlink(worktreePath: string): Promise<void> {
  const nmPath = join(worktreePath, "node_modules")
  try {
    const st = await lstat(nmPath)
    if (st.isSymbolicLink()) {
      try {
        await unlink(nmPath)
      } catch (err) {
        // NTFS junctions can refuse unlink (EPERM/EBUSY/EISDIR). rm removes the
        // link itself without following it.
        const code = (err as NodeJS.ErrnoException).code
        if (code !== "EPERM" && code !== "EBUSY" && code !== "EISDIR") throw err
        await rm(nmPath, { recursive: true, force: true })
      }
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
    // Worktree already registered — abort any lingering rebase/merge and reset to baseSha.
    // The aborts fail harmlessly when nothing is in progress; both may rewrite the tree.
    await runGit(["rebase", "--abort"], worktreePath, LONG)
    await runGit(["merge", "--abort"], worktreePath, LONG)
    const resetRes = await runGit(["reset", "--hard", baseSha], worktreePath, LONG)
    // A failed clean leaves the previous worker's untracked files behind, which
    // the next integration's `add -A` would commit: treat it like a failed reset.
    const cleanRes =
      resetRes.exitCode === 0
        ? await runGit(["clean", "-fd", "-e", "node_modules"], worktreePath, LONG)
        : resetRes
    if (cleanRes.exitCode === 0) {
      await ensureNodeModulesSymlink(repoRoot, worktreePath)
      return { slotId, worktreePath, baseSha }
    }
    // If reset or clean failed (corrupted worktree), tear it down and re-create below
    await releaseSlotWorkspace(slotId, { repoRoot, runGit })
  } else if (existsSync(worktreePath)) {
    await removeNodeModulesSymlink(worktreePath)
    await rm(worktreePath, { recursive: true, force: true })
  }

  await runGit(["worktree", "prune"], repoRoot)
  const addRes = await runGit(
    ["worktree", "add", "--force", "--detach", worktreePath, baseSha],
    repoRoot,
    LONG,
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
    await runGit(["worktree", "remove", "--force", worktreePath], repoRoot, LONG)
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
