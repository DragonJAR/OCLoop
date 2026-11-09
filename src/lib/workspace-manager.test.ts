import { describe, expect, it, mock, spyOn } from "bun:test"
import { mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  GIT_NOT_FOUND_EXIT_CODE,
  acquireSlotWorkspace,
  createGitRunner,
  execGit,
  GIT_LONG_TIMEOUT_MS,
  GIT_TIMEOUT_EXIT_CODE,
  defaultGitRunner,
  spawnExecFile,
  cleanupAllWorkspaces,
  getSlotWorktreePath,
  releaseSlotWorkspace,
  type GitRunner,
} from "./workspace-manager"

describe("workspace-manager", () => {
  it("acquires a slot worktree, symlinks node_modules, and cleans up all slots", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-"))
    try {
      mkdirSync(join(scratch, "node_modules", "dummy-pkg"), { recursive: true })
      const calls: Array<{ args: string[]; cwd: string }> = []

      const fakeGit: GitRunner = async (args, cwd) => {
        calls.push({ args, cwd })
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { exitCode: 0, stdout: "abc1234567890\n", stderr: "" }
        }
        if (args[0] === "worktree" && args[1] === "add") {
          const targetDir = args[4]
          mkdirSync(targetDir, { recursive: true })
          writeFileSync(join(targetDir, ".git"), "gitdir: ../../.git/worktrees/slot-1\n")
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const ws = await acquireSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      expect(ws.slotId).toBe(1)
      expect(ws.baseSha).toBe("abc1234567890")
      expect(ws.worktreePath).toBe(getSlotWorktreePath(scratch, 1))
      expect(existsSync(join(ws.worktreePath, "node_modules"))).toBe(true)

      // Acquiring again reuses and resets existing worktree instead of re-adding
      const ws2 = await acquireSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      expect(ws2.worktreePath).toBe(ws.worktreePath)
      expect(calls.some((c) => c.args[0] === "reset" && c.args[1] === "--hard")).toBe(true)

      await releaseSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      expect(existsSync(ws.worktreePath)).toBe(false)

      await cleanupAllWorkspaces({ repoRoot: scratch, runGit: fakeGit })
      expect(existsSync(join(scratch, ".loop-worktrees"))).toBe(false)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("fails fast with a clear error when HEAD cannot be resolved", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-nohead-"))
    try {
      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "rev-parse") return { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" }
        return { exitCode: 0, stdout: "", stderr: "" }
      }
      await expect(
        acquireSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit }),
      ).rejects.toThrow("Failed to resolve HEAD")
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("tears down and re-creates a registered worktree whose reset --hard fails (corrupted)", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-corrupt-"))
    try {
      const wtPath = getSlotWorktreePath(scratch, 1)
      // Registered worktree (has .git) that reset --hard cannot fix.
      mkdirSync(wtPath, { recursive: true })
      writeFileSync(join(wtPath, ".git"), "gitdir: ../../.git/worktrees/slot-1\n")

      const calls: Array<{ args: string[] }> = []
      const fakeGit: GitRunner = async (args) => {
        calls.push({ args: [...args] })
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { exitCode: 0, stdout: "sha-recovered\n", stderr: "" }
        }
        if (args[0] === "reset") return { exitCode: 1, stdout: "", stderr: "fatal: corrupted worktree" }
        if (args[0] === "worktree" && args[1] === "add") {
          mkdirSync(args[4], { recursive: true })
          writeFileSync(join(args[4], ".git"), "gitdir: ../../.git/worktrees/slot-1\n")
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const ws = await acquireSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      expect(ws.baseSha).toBe("sha-recovered")

      // Destructive recovery path: reset attempted → worktree removed → re-added.
      expect(calls.some((c) => c.args[0] === "reset")).toBe(true)
      expect(calls.some((c) => c.args[0] === "worktree" && c.args[1] === "remove")).toBe(true)
      expect(calls.some((c) => c.args[0] === "worktree" && c.args[1] === "add")).toBe(true)
      expect(existsSync(join(wtPath, ".git"))).toBe(true)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("removes an orphan worktree directory without a .git registration before re-adding", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-orphan-"))
    try {
      const wtPath = getSlotWorktreePath(scratch, 2)
      // Orphan: directory left behind by a crashed teardown — no .git file,
      // so it is not a registered worktree and must be rm'd, not reset.
      mkdirSync(wtPath, { recursive: true })
      writeFileSync(join(wtPath, "orphan.txt"), "stale")

      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { exitCode: 0, stdout: "sha-orphan\n", stderr: "" }
        }
        if (args[0] === "worktree" && args[1] === "add") {
          mkdirSync(args[4], { recursive: true })
          writeFileSync(join(args[4], ".git"), "gitdir: ../../.git/worktrees/slot-2\n")
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const ws = await acquireSlotWorkspace(2, { repoRoot: scratch, runGit: fakeGit })
      expect(ws.baseSha).toBe("sha-orphan")
      expect(existsSync(join(wtPath, "orphan.txt"))).toBe(false)
      expect(existsSync(join(wtPath, ".git"))).toBe(true)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("throws with the git stderr when worktree add fails", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-addfail-"))
    try {
      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { exitCode: 0, stdout: "sha-x\n", stderr: "" }
        }
        if (args[0] === "worktree" && args[1] === "add") {
          return { exitCode: 1, stdout: "", stderr: "fatal: 'not-a-repo' is not a working tree" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }
      await expect(
        acquireSlotWorkspace(3, { repoRoot: scratch, runGit: fakeGit }),
      ).rejects.toThrow("Failed to create worktree for slot 3")
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("gives tree-rewriting git commands the long deadline and quick queries the default (N-6)", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-timeouts-"))
    try {
      const seen = new Map<string, number | undefined>()
      const fakeGit: GitRunner = async (args, _cwd, options) => {
        seen.set(args.slice(0, 2).join(" "), options?.timeoutMs)
        if (args[0] === "rev-parse") return { exitCode: 0, stdout: "sha-t\n", stderr: "" }
        if (args[0] === "worktree" && args[1] === "add") {
          mkdirSync(args[4], { recursive: true })
          writeFileSync(join(args[4], ".git"), "gitdir: x\n")
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }
      await acquireSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      await acquireSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      await releaseSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      for (const op of ["worktree add", "worktree remove", "reset --hard", "clean -fd", "rebase --abort", "merge --abort"]) {
        expect(seen.get(op)).toBe(GIT_LONG_TIMEOUT_MS)
      }
      expect(seen.get("rev-parse HEAD")).toBeUndefined()
      expect(seen.get("worktree prune")).toBeUndefined()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("re-creates a reused worktree whose clean fails instead of keeping stale files", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-cleanfail-"))
    try {
      const wtPath = getSlotWorktreePath(scratch, 1)
      mkdirSync(wtPath, { recursive: true })
      writeFileSync(join(wtPath, ".git"), "gitdir: x\n")
      writeFileSync(join(wtPath, "stale-untracked.txt"), "previous worker")
      const calls: string[] = []
      const fakeGit: GitRunner = async (args) => {
        calls.push(args.slice(0, 2).join(" "))
        if (args[0] === "rev-parse") return { exitCode: 0, stdout: "sha-c\n", stderr: "" }
        if (args[0] === "clean") return { exitCode: GIT_TIMEOUT_EXIT_CODE, stdout: "", stderr: "timed out" }
        if (args[0] === "worktree" && args[1] === "add") {
          mkdirSync(args[4], { recursive: true })
          writeFileSync(join(args[4], ".git"), "gitdir: x\n")
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }
      await acquireSlotWorkspace(1, { repoRoot: scratch, runGit: fakeGit })
      expect(calls).toContain("worktree remove")
      expect(calls).toContain("worktree add")
      expect(existsSync(join(wtPath, "stale-untracked.txt"))).toBe(false)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("releaseSlotWorkspace never throws even when git itself fails", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-release-"))
    try {
      const wtPath = getSlotWorktreePath(scratch, 4)
      mkdirSync(wtPath, { recursive: true })
      // A GitRunner that rejects (git binary missing, spawn error) must not
      // propagate: release is best-effort and never crashes shutdown.
      const throwingGit: GitRunner = async () => {
        throw new Error("spawn git ENOENT")
      }
      await expect(
        releaseSlotWorkspace(4, { repoRoot: scratch, runGit: throwingGit }),
      ).resolves.toBeUndefined()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe("git runner", () => {
  it("reports an explicit exit code and message when git is not on PATH", async () => {
    const run = createGitRunner(async () => null)
    const res = await run(["status"], process.cwd())
    expect(res.exitCode).toBe(GIT_NOT_FOUND_EXIT_CODE)
    expect(res.stderr).toContain("git executable not found")
  })

  it.skipIf(process.platform === "win32")("honors a per-call timeoutMs (N-6)", async () => {
    const run = createGitRunner(async () => "/bin/sh")
    const started = Date.now()
    const res = await run(["-c", "sleep 5"], process.cwd(), { timeoutMs: 100 })
    expect(res.exitCode).toBe(GIT_TIMEOUT_EXIT_CODE)
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it("runs the resolved git (real PATH)", async () => {
    const res = await defaultGitRunner(["--version"], process.cwd())
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain("git version")
  })
})

describe("execGit", () => {
  it("spawns git with windowsHide so no console window flashes on Windows (T10-B P8)", async () => {
    let options: unknown
    const exec: Parameters<typeof execGit>[3] = (_file, _args, opts, cb) => {
      options = opts
      cb(null, "ok\n", "")
    }
    const res = await execGit("/usr/bin/git", ["status"], "/repo", exec)
    expect(res).toEqual({ exitCode: 0, stdout: "ok\n", stderr: "" })
    expect(options).toMatchObject({ cwd: "/repo", windowsHide: true })
  })

  it("kills a hung git and resolves with the timeout code (T10-B P9)", async () => {
    const kill = mock(() => true)
    // Never calls back: a credential prompt / stuck index.lock.
    const exec: Parameters<typeof execGit>[3] = () => ({ pid: undefined, kill })
    const res = await execGit("/usr/bin/git", ["fetch"], "/repo", exec, 20)
    expect(res.exitCode).toBe(GIT_TIMEOUT_EXIT_CODE)
    expect(res.stderr).toContain("timed out")
    expect(kill).toHaveBeenCalled()
  })

  it("disables git's terminal credential prompt (N-4)", async () => {
    let prompt: string | undefined
    let path: string | undefined
    const exec: Parameters<typeof execGit>[3] = (_f, _a, opts, cb) => {
      prompt = opts.env.GIT_TERMINAL_PROMPT
      path = opts.env.PATH
      cb(null, "", "")
    }
    const previous = process.env.GIT_TERMINAL_PROMPT
    process.env.GIT_TERMINAL_PROMPT = "1" // the override must win over the user's env
    try {
      await execGit("/usr/bin/git", ["fetch"], "/repo", exec)
    } finally {
      if (previous === undefined) delete process.env.GIT_TERMINAL_PROMPT
      else process.env.GIT_TERMINAL_PROMPT = previous
    }
    expect(prompt).toBe("0")
    expect(path).toBe(process.env.PATH)
  })

  it("resolves (never rejects, no stray timer) when exec throws synchronously (N-7)", async () => {
    const exec: Parameters<typeof execGit>[3] = () => {
      throw new TypeError("The \"cwd\" argument must be of type string")
    }
    const clearSpy = spyOn(globalThis, "clearTimeout")
    let res: Awaited<ReturnType<typeof execGit>>
    try {
      res = await execGit("/usr/bin/git", ["status"], "/repo", exec, 20)
      expect(clearSpy).toHaveBeenCalled()
    } finally {
      clearSpy.mockRestore()
    }
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain("failed to start")
    // The deadline was cleared: past it, nothing fires (a stray timer would
    // have read `child` in its TDZ and crashed the process).
    await new Promise((r) => setTimeout(r, 40))
  })

  it("a git that answers in time is not killed", async () => {
    const kill = mock(() => true)
    const exec: Parameters<typeof execGit>[3] = (_f, _a, _o, cb) => {
      cb(null, "", "")
      return { pid: undefined, kill }
    }
    const res = await execGit("/usr/bin/git", ["status"], "/repo", exec, 20)
    expect(res.exitCode).toBe(0)
    await new Promise((r) => setTimeout(r, 40))
    expect(kill).not.toHaveBeenCalled()
  })
})

describe.skipIf(process.platform === "win32")("spawnExecFile (POSIX)", () => {
  it("reports stdout, stderr and the numeric exit code", async () => {
    const res = await execGit("/bin/sh", ["-c", "echo out; echo err >&2; exit 3"], process.cwd(), spawnExecFile)
    expect(res).toEqual({ exitCode: 3, stdout: "out\n", stderr: "err\n" })
  })

  it("runs git as the leader of its own process group (N-4)", async () => {
    const probe = await execGit("/bin/sh", ["-c", "echo $$; ps -o pgid= -p $$"], process.cwd(), spawnExecFile)
    const [pid, pgid] = probe.stdout.trim().split(/\s+/)
    expect(pgid).toBe(pid)
  })

  it("kills a grandchild (hook / credential helper) on timeout (N-4)", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-wt-tree-"))
    try {
      const pidFile = join(scratch, "grandchild.pid")
      const res = await execGit(
        "/bin/sh",
        ["-c", `sleep 30 & echo "$!" > '${pidFile}'; wait`],
        scratch,
        spawnExecFile,
        300,
      )
      expect(res.exitCode).toBe(GIT_TIMEOUT_EXIT_CODE)
      const grandchild = Number(readFileSync(pidFile, "utf8").trim())
      let alive = true
      for (let i = 0; i < 40 && alive; i++) {
        await new Promise((r) => setTimeout(r, 50))
        try {
          process.kill(grandchild, 0)
        } catch {
          alive = false
        }
      }
      expect(alive).toBe(false)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
