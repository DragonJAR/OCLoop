import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { GitRunner } from "./workspace-manager"
import {
  createSerialQueue,
  extractWorkerPlanEdits,
  integrateWorkerResult,
} from "./integration-queue"

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

  it("reports plan_write_deferred instead of integrated when the [x] CAS cannot write (task gone from root plan)", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-defer-"))
    try {
      const rootPlanPath = join(scratch, "PLAN.md")
      const wtPath = join(scratch, ".loop-worktrees", "slot-3")
      mkdirSync(wtPath, { recursive: true })

      // Another writer rewrote the root plan and the task no longer exists:
      // markTaskCompleted returns null, the CAS defers, and the outcome must
      // NOT claim "integrated" — the commit was already promoted, and a false
      // success would let the scheduler relaunch the task over it.
      const rootPlanOnDisk = "- [ ] **2.1** Brand new task from another writer" + String.fromCharCode(10)
      writeFileSync(rootPlanPath, rootPlanOnDisk)
      writeFileSync(join(wtPath, "PLAN.md"), "- [ ] **1.1** Task A" + String.fromCharCode(10))

      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "show") return { exitCode: 0, stdout: "- [ ] **1.1** Task A" + String.fromCharCode(10), stderr: "" }
        if (args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { exitCode: 0, stdout: "sha-worker-defer\n", stderr: "" }
        }
        if (args[0] === "diff" && args[1] === "--name-only") {
          if (args.includes("--")) return { exitCode: 0, stdout: "", stderr: "" }
          return { exitCode: 0, stdout: "src/feature.ts\n", stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const outcome = await integrateWorkerResult({
        slotId: 3,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-3",
        worktreePath: wtPath,
        baseSha: "sha-base-0",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGit,
      })

      // The task must NOT be reported as integrated while its [x] mark
      // (plus extracted notes) never landed in the root plan — otherwise the
      // scheduler relaunches the task over its own promoted commit.
      expect(outcome.status).toBe("plan_write_deferred")
      if (outcome.status === "plan_write_deferred") {
        expect(outcome.deferred).toBe("integrated_mark")
      }
      // And the root plan must NOT contain the [x] mark.
      const finalPlan = await Bun.file(rootPlanPath).text()
      expect(finalPlan).not.toContain("- [x] **1.1**")
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("treats a [BLOCKED] task as integrated when its description is present (CAS no_change, presence branch)", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-already-"))
    try {
      const wtPath = join(scratch, ".loop-worktrees", "slot-1")
      mkdirSync(wtPath, { recursive: true })
      // The task was evaluated and [BLOCKED]-marked in the root plan (e.g. by
      // a prior recovery pass): the mark transform returns null
      // (skipped:no_change) but the description is still present → benign,
      // the integration must count as done. This exercises the presence
      // branch, not the normal write path.
      writeFileSync(join(scratch, "PLAN.md"), "- [BLOCKED: stale eval] **1.1** Task A\n")
      writeFileSync(join(wtPath, "PLAN.md"), "- [ ] **1.1** Task A\n")

      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "show") return { exitCode: 0, stdout: "- [ ] **1.1** Task A\n", stderr: "" }
        if (args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { exitCode: 0, stdout: "sha-main-1\n", stderr: "" }
        }
        if (args[0] === "diff" && args[1] === "--name-only") {
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const outcome = await integrateWorkerResult({
        slotId: 1,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-1",
        worktreePath: wtPath,
        baseSha: "sha-base-0",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGit,
      })
      expect(outcome.status).toBe("integrated")
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("reports plan_write_deferred instead of eval_blocked when the [BLOCKED] CAS cannot write (task gone from root plan)", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-blockdefer-"))
    try {
      const rootPlanPath = join(scratch, "PLAN.md")
      const wtPath = join(scratch, ".loop-worktrees", "slot-4")
      mkdirSync(wtPath, { recursive: true })

      // The task no longer exists in the root plan (another writer rewrote it):
      // replaceTaskWithBlocked returns null, the CAS defers, and the outcome
      // must NOT claim the task was blocked — the scheduler would treat an
      // unmarked task as done.
      const rootPlanOnDisk = "- [ ] **9.9** Unrelated task" + String.fromCharCode(10)
      writeFileSync(rootPlanPath, rootPlanOnDisk)
      writeFileSync(join(wtPath, "PLAN.md"), "- [ ] **1.1** Task A" + String.fromCharCode(10))

      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "show") return { exitCode: 0, stdout: "- [ ] **1.1** Task A" + String.fromCharCode(10), stderr: "" }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const outcome = await integrateWorkerResult({
        slotId: 4,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-4",
        worktreePath: wtPath,
        baseSha: "sha-base-0",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGit,
        evalGate: async () => ({ pass: false, retry: false, reason: "Missing unit test" }),
      })

      // Without the mark landing, the task is neither blocked nor done — the
      // outcome must surface the deferral, not a false eval_blocked.
      expect(outcome.status).toBe("plan_write_deferred")
      if (outcome.status === "plan_write_deferred") {
        expect(outcome.deferred).toBe("eval_block")
      }
      const finalPlan = await Bun.file(rootPlanPath).text()
      expect(finalPlan).not.toContain("[BLOCKED")
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("does not count a task description quoted inside a code fence as present (parser-aware presence)", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-fence-"))
    try {
      const rootPlanPath = join(scratch, "PLAN.md")
      const wtPath = join(scratch, ".loop-worktrees", "slot-5")
      mkdirSync(wtPath, { recursive: true })

      // The root plan mentions the task description ONLY inside a fenced code
      // block (e.g. a quoted snippet), so the task is NOT actually present.
      // A raw substring check (`planText.includes(taskDescription)`) would
      // report "present" and wrongly claim the integration landed; the
      // parser-aware check must report the deferral instead.
      const rootPlanOnDisk = [
        "# Plan",
        "",
        "```md",
        "- [ ] **1.1** Task A",
        "```",
        "",
      ].join(String.fromCharCode(10))
      writeFileSync(rootPlanPath, rootPlanOnDisk)
      writeFileSync(join(wtPath, "PLAN.md"), "- [ ] **1.1** Task A" + String.fromCharCode(10))

      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "show") {
          return { exitCode: 0, stdout: "- [ ] **1.1** Task A" + String.fromCharCode(10), stderr: "" }
        }
        if (args[0] === "status") return { exitCode: 0, stdout: "", stderr: "" }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { exitCode: 0, stdout: "sha-main-1" + String.fromCharCode(10), stderr: "" }
        }
        if (args[0] === "diff" && args[1] === "--name-only") {
          return { exitCode: 0, stdout: "", stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const outcome = await integrateWorkerResult({
        slotId: 4,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-fence",
        worktreePath: wtPath,
        baseSha: "sha-base-0",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGit,
      })

      // The task is absent from the plan proper → the [x] mark never landed →
      // reporting "integrated" would hide an unchecked task.
      expect(outcome.status).toBe("plan_write_deferred")
      if (outcome.status === "plan_write_deferred") {
        expect(outcome.deferred).toBe("integrated_mark")
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("reports eval_blocked (benign) when the task is already [BLOCKED] and parser-visible", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-alreadyblocked-"))
    try {
      const rootPlanPath = join(scratch, "PLAN.md")
      const wtPath = join(scratch, ".loop-worktrees", "slot-3")
      mkdirSync(wtPath, { recursive: true })

      // A prior block pass already marked the task: the transform finds
      // nothing to block (no pending/completed line) → skipped:no_change,
      // and the parser still sees the [BLOCKED] task line → benign
      // eval_blocked, not a deferral.
      const rootPlanOnDisk = "- [BLOCKED: stale eval] **1.1** Task A" + String.fromCharCode(10)
      writeFileSync(rootPlanPath, rootPlanOnDisk)
      writeFileSync(join(wtPath, "PLAN.md"), "- [ ] **1.1** Task A" + String.fromCharCode(10))

      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "show") {
          return { exitCode: 0, stdout: "- [ ] **1.1** Task A" + String.fromCharCode(10), stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const outcome = await integrateWorkerResult({
        slotId: 3,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-blocked",
        worktreePath: wtPath,
        baseSha: "sha-base-0",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGit,
        evalGate: async () => ({ pass: false, retry: false, reason: "Missing unit test" }),
      })

      expect(outcome.status).toBe("eval_blocked")
      if (outcome.status === "eval_blocked") {
        expect(outcome.reason).toBe("Missing unit test")
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it("defers the eval block when the task line is present but NOT blocked", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-notblocked-"))
    try {
      const rootPlanPath = join(scratch, "PLAN.md")
      const wtPath = join(scratch, ".loop-worktrees", "slot-4")
      mkdirSync(wtPath, { recursive: true })

      // The task line exists but the block transform cannot mark it (the
      // transform only accepts pending/completed lines, so a [MANUAL] task
      // yields nothing to change → skipped:no_change). "The line is present"
      // is NOT the same as "the task is already blocked": counting it as
      // benign would report eval_blocked while the plan never recorded the
      // block — the same defect the integrated path had, fixed by asking the
      // parser for the task's actual status.
      writeFileSync(rootPlanPath, "- [MANUAL] **1.1** Task A" + String.fromCharCode(10))
      writeFileSync(join(wtPath, "PLAN.md"), "- [ ] **1.1** Task A" + String.fromCharCode(10))

      const fakeGit: GitRunner = async (args) => {
        if (args[0] === "show") {
          return { exitCode: 0, stdout: "- [ ] **1.1** Task A" + String.fromCharCode(10), stderr: "" }
        }
        return { exitCode: 0, stdout: "", stderr: "" }
      }

      const outcome = await integrateWorkerResult({
        slotId: 4,
        taskId: "1.1",
        taskDescription: "**1.1** Task A",
        sessionId: "ses-manual",
        worktreePath: wtPath,
        baseSha: "sha-base-0",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: fakeGit,
        evalGate: async () => ({ pass: false, retry: false, reason: "Missing unit test" }),
      })

      expect(outcome.status).toBe("plan_write_deferred")
      if (outcome.status === "plan_write_deferred") {
        expect(outcome.deferred).toBe("eval_block")
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
