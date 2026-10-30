import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  acquireSlotWorkspace,
  cleanupAllWorkspaces,
  getSlotWorktreePath,
  releaseSlotWorkspace,
  type GitRunner,
} from "./workspace-manager"
import {
  createSerialQueue,
  extractWorkerPlanEdits,
  integrateWorkerResult,
} from "./integration-queue"

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
      await cleanupAllWorkspaces({ repoRoot: scratch, runGit: fakeGit })
      expect(existsSync(ws.worktreePath)).toBe(false)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe("integration-queue", () => {
  it("executes enqueued jobs strictly in FIFO serial order", async () => {
    const queue = createSerialQueue()
    const order: number[] = []

    const p1 = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 20))
      order.push(1)
      return "first"
    })
    const p2 = queue.enqueue(async () => {
      order.push(2)
      return "second"
    })
    const p3 = queue.enqueue(async () => {
      order.push(3)
      return "third"
    })

    const results = await Promise.all([p1, p2, p3])
    expect(results).toEqual(["first", "second", "third"])
    expect(order).toEqual([1, 2, 3])
    expect(queue.pendingCount()).toBe(0)
  })

  it("extracts worker notes and recon subtasks without conflicting on PLAN.md", () => {
    const basePlan = [
      "## Phase 1",
      "- [ ] **1.1** (recon) Inspect routes",
      "  - files: src/routes/*",
      "- [ ] **1.2** Summary",
    ].join("\n")

    const workerPlan = [
      "## Phase 1",
      "- [x] **1.1** (recon) Inspect routes",
      "  - files: src/routes/*",
      "  - Found 2 legacy routes needing auth",
      "- [ ] **1.1a** Add auth to /users",
      "- [ ] **1.1b** Add auth to /billing",
      "- [ ] **1.2** Summary",
    ].join("\n")

    const artifacts = extractWorkerPlanEdits(
      basePlan,
      workerPlan,
      "**1.1** (recon) Inspect routes",
    )
    expect(artifacts.notes).toEqual(["Found 2 legacy routes needing auth"])
    expect(artifacts.reconTasks).toEqual([
      "**1.1a** Add auth to /users",
      "**1.1b** Add auth to /billing",
    ])
  })

  it("integrates worker commits, runs eval gate before merge, and updates root PLAN.md via CAS", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-"))
    try {
      const rootPlanPath = join(scratch, "PLAN.md")
      const wtPath = join(scratch, ".loop-worktrees", "slot-1")
      mkdirSync(wtPath, { recursive: true })

      const initialPlan = [
        "## Phase 1",
        "- [ ] **1.1** Implement feature A",
        "- [ ] **1.2** Implement feature B",
      ].join("\n")
      writeFileSync(rootPlanPath, initialPlan)
      writeFileSync(
        join(wtPath, "PLAN.md"),
        [
          "## Phase 1",
          "- [x] **1.1** Implement feature A",
          "  - Added helper in feature-a.ts",
          "- [ ] **1.2** Implement feature B",
        ].join("\n"),
      )

      let mergedSha = ""
      const fakeGit: GitRunner = async (args, cwd) => {
        if (args[0] === "show") {
          return { exitCode: 0, stdout: initialPlan, stderr: "" }
        }
        if (args[0] === "status") {
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return {
            exitCode: 0,
            stdout: cwd === wtPath ? "sha-worker-1\n" : "sha-main-1\n",
            stderr: "",
          }
        }
        if (args[0] === "diff" && args[1] === "--name-only") {
          if (args.includes("--")) return { exitCode: 0, stdout: "PLAN.md\n", stderr: "" }
          return { exitCode: 0, stdout: "src/feature-a.ts\n", stderr: "" }
        }
        if (args[0] === "merge" && args[1] === "--ff-only") {
          mergedSha = args[2]
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const outcome = await integrateWorkerResult({
        slotId: 1,
        taskId: "1.1",
        taskDescription: "**1.1** Implement feature A",
        sessionId: "ses-1",
        worktreePath: wtPath,
        baseSha: "sha-base-0",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGit,
        evalGate: async () => ({ pass: true }),
      })

      expect(outcome.status).toBe("integrated")
      if (outcome.status === "integrated") {
        expect(outcome.changedFiles).toEqual(["src/feature-a.ts"])
        expect(outcome.extractedNotes).toEqual(["Added helper in feature-a.ts"])
      }
      expect(mergedSha).toBe("sha-worker-1")

      const finalPlan = await Bun.file(rootPlanPath).text()
      expect(finalPlan).toContain("- [x] **1.1** Implement feature A")
      expect(finalPlan).toContain("  - Added helper in feature-a.ts")
      expect(finalPlan).toContain("- [ ] **1.2** Implement feature B")
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("halts before merging when evalGate requests a retry or returns a rebase conflict", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-conflict-"))
    try {
      const rootPlanPath = join(scratch, "PLAN.md")
      const wtPath = join(scratch, ".loop-worktrees", "slot-2")
      mkdirSync(wtPath, { recursive: true })
      const initialPlan = "- [ ] **1.1** Task A\n"
      writeFileSync(rootPlanPath, initialPlan)
      writeFileSync(join(wtPath, "PLAN.md"), initialPlan)

      const fakeGitConflict: GitRunner = async (args) => {
        if (args[0] === "show") return { exitCode: 0, stdout: initialPlan, stderr: "" }
        if (args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" }
        if (args[0] === "rev-parse") return { exitCode: 0, stdout: "sha-new-main\n", stderr: "" }
        if (args[0] === "diff" && args[1] === "--name-only") {
          if (args[2] === "--diff-filter=U") {
            return { exitCode: 0, stdout: "src/shared.ts\n", stderr: "" }
          }
          if (args.includes("--")) return { exitCode: 0, stdout: "", stderr: "" }
          return { exitCode: 0, stdout: "src/shared.ts\n", stderr: "" }
        }
        if (args[0] === "rebase" && args[1] !== "--abort") {
          return { exitCode: 1, stdout: "", stderr: "CONFLICT (content): Merge conflict in src/shared.ts" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const evalRetryOutcome = await integrateWorkerResult({
        slotId: 2,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-2",
        worktreePath: wtPath,
        baseSha: "sha-old-base",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGitConflict,
        evalGate: async () => ({ pass: false, retry: true, feedback: "Missing unit test" }),
      })
      expect(evalRetryOutcome).toEqual({
        status: "eval_retry",
        feedback: "Missing unit test",
      })

      const conflictOutcome = await integrateWorkerResult({
        slotId: 2,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-2",
        worktreePath: wtPath,
        baseSha: "sha-old-base",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGitConflict,
      })
      expect(conflictOutcome).toEqual({
        status: "conflict_retry",
        conflictingFiles: ["src/shared.ts"],
        newBaseSha: "sha-new-main",
      })
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
