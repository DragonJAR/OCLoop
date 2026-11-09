import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GIT_LONG_TIMEOUT_MS, type GitRunner } from "./workspace-manager"
import {
  createSerialQueue,
  extractWorkerPlanEdits,
  GIT_COMMIT_TIMEOUT_MS,
  integrateWorkerResult,
  internalCommitConfig,
  resolveGitPathCase,
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
        if (args.includes("rebase") && !args.includes("--abort")) {
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

describe("plan path casing vs git pathspecs (T10-A O-05)", () => {
  const ok = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" })

  describe("resolveGitPathCase", () => {
    it("returns git's canonical capitalization on win32/darwin", async () => {
      const calls: string[][] = []
      const git: GitRunner = async (args) => {
        calls.push(args)
        return ok("PLAN.md\0")
      }
      expect(await resolveGitPathCase("plan.md", "/repo", git, "darwin")).toBe("PLAN.md")
      expect(await resolveGitPathCase("plan.md", "/repo", git, "win32")).toBe("PLAN.md")
      expect(calls[0]).toEqual(["ls-files", "-z", "--full-name", "--", ":(icase)plan.md"])
    })

    it("falls back to the given path on failure, no match, ambiguity or a throw", async () => {
      const failing: GitRunner = async () => ({ exitCode: 128, stdout: "", stderr: "boom" })
      const none: GitRunner = async () => ok("")
      const ambiguous: GitRunner = async () => ok("PLAN.md\0Plan.md\0")
      const throwing: GitRunner = async () => {
        throw new Error("spawn git ENOENT")
      }
      for (const git of [failing, none, ambiguous, throwing]) {
        expect(await resolveGitPathCase("plan.md", "/repo", git, "darwin")).toBe("plan.md")
      }
      // An exact tracked match always wins over a casing variant.
      const both: GitRunner = async () => ok("PLAN.md\0plan.md\0")
      expect(await resolveGitPathCase("plan.md", "/repo", both, "win32")).toBe("plan.md")
    })

    it("POSIX/Linux keeps the exact path and runs no git command", async () => {
      let called = false
      const git: GitRunner = async () => {
        called = true
        return ok("PLAN.md\0")
      }
      expect(await resolveGitPathCase("plan.md", "/repo", git, "linux")).toBe("plan.md")
      expect(called).toBe(false)
    })
  })

  async function integrateWithDivergentCase(platform: string, lsFiles: { exitCode: number; stdout: string }) {
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-case-"))
    const wtPath = join(scratch, ".loop-worktrees", "slot-1")
    mkdirSync(wtPath, { recursive: true })
    const plan = ["## Phase 1", "- [ ] **1.1** Do A", "- [ ] **1.2** Do B"].join("\n")
    // The user passed `--plan plan.md`; git tracks it as `PLAN.md`.
    writeFileSync(join(scratch, "plan.md"), plan)
    writeFileSync(join(wtPath, "PLAN.md"), plan.replace("- [ ] **1.1**", "- [x] **1.1**"))
    writeFileSync(join(wtPath, "plan.md"), plan.replace("- [ ] **1.1**", "- [x] **1.1**"))
    const calls: string[][] = []
    const git: GitRunner = async (args, cwd) => {
      calls.push(args)
      if (args[0] === "ls-files") return { ...lsFiles, stderr: "" }
      if (args[0] === "show") return ok(plan)
      if (args[0] === "status") return ok(" M src/a.ts\n M PLAN.md\n")
      if (args[0] === "rev-parse") return ok(cwd === wtPath ? "sha-worker\n" : "sha-main\n")
      if (args[0] === "diff" && args.includes("--cached")) return ok("src/a.ts\n")
      if (args[0] === "diff" && args[1] === "--name-only") return ok("PLAN.md\nsrc/a.ts\n")
      return ok()
    }
    try {
      const outcome = await integrateWorkerResult({
        slotId: 1,
        taskId: "1.1",
        taskDescription: "**1.1** Do A",
        sessionId: "ses-1",
        worktreePath: wtPath,
        baseSha: "sha-base",
        repoRoot: scratch,
        planPath: "plan.md",
        runGit: git,
        platform,
        evalGate: async () => ({ pass: true }),
      })
      return { outcome, calls }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  const pathspecs = (calls: string[][]) =>
    calls
      .filter((c) => c[0] !== "ls-files" && c.includes("--"))
      .map((c) => [c[0], ...c.slice(c.indexOf("--") + 1)].join(" "))

  it("uses git's casing in EVERY pathspec of the flow and keeps PLAN.md out of the commit (darwin)", async () => {
    const { outcome, calls } = await integrateWithDivergentCase("darwin", { exitCode: 0, stdout: "PLAN.md\0" })
    expect(calls.find((c) => c[0] === "show")).toEqual(["show", "sha-base:PLAN.md"])
    const specs = pathspecs(calls)
    expect(specs).toContain("reset PLAN.md")
    expect(specs).toContain("checkout PLAN.md")
    for (const spec of specs) expect(spec.endsWith(" PLAN.md")).toBe(true)
    expect(outcome.status).toBe("integrated")
    if (outcome.status === "integrated") expect(outcome.changedFiles).toEqual(["src/a.ts"])
  })

  it("defensive filter still drops a casing variant when the resolution falls back (win32)", async () => {
    const { outcome } = await integrateWithDivergentCase("win32", { exitCode: 128, stdout: "" })
    expect(outcome.status).toBe("integrated")
    if (outcome.status === "integrated") expect(outcome.changedFiles).toEqual(["src/a.ts"])
  })

  it("linux stays byte-identical: exact path, no ls-files, case-sensitive filter", async () => {
    const { outcome, calls } = await integrateWithDivergentCase("linux", { exitCode: 0, stdout: "PLAN.md\0" })
    expect(calls.some((c) => c[0] === "ls-files")).toBe(false)
    expect(calls.find((c) => c[0] === "show")).toEqual(["show", "sha-base:plan.md"])
    if (outcome.status === "integrated") expect(outcome.changedFiles).toEqual(["PLAN.md", "src/a.ts"])
  })
})

describe("every integration git step fails loudly (T13 R-01/R-02/R-04/R-06/R-09)", () => {
  type Step =
    | "status" | "add" | "unstage" | "cached" | "changed" | "commit" | "amend" | "rebase" | "restore"
    | "diffPlan" | "unmerged" | "workerHead"
  const PLAN = ["## Phase 1", "- [ ] **1.1** Do A", "- [ ] **1.2** Do B"].join("\n")
  const okRes = (stdout = "") => ({ exitCode: 0, stdout, stderr: "" })

  /** The git subcommand, skipping leading `-c key=value` pairs. */
  const sub = (args: string[]) => {
    let i = 0
    while (args[i] === "-c") i += 2
    return args.slice(i)
  }

  function classify(args: string[]): Step | "other" {
    const a = sub(args)
    if (a[0] === "status") return "status"
    if (a[0] === "add") return "add"
    if (a[0] === "reset" && a[1] === "HEAD") return "unstage"
    if (a[0] === "checkout") return "restore"
    if (a[0] === "diff" && a.includes("--cached")) return "cached"
    if (a[0] === "diff" && a[2] === "--diff-filter=U") return "unmerged"
    if (a[0] === "diff" && a[1] === "--name-only" && a.includes("--")) return "diffPlan"
    if (a[0] === "diff" && a[1] === "--name-only") return "changed"
    if (a[0] === "commit") return a.includes("--amend") ? "amend" : "commit"
    if (a[0] === "rebase" && a[1] !== "--abort") return "rebase"
    return "other"
  }

  async function run(opts: {
    fail?: Step | Step[]
    exitCode?: number
    /** "dirty": uncommitted changes (commit path). "amend": worker committed PLAN.md. */
    mode?: "dirty" | "amend"
    platform?: string
    /** stdout of `diff --diff-filter=U` after a failed rebase. */
    unmerged?: string
  }) {
    const { fail, exitCode = 1, mode = "dirty", platform = "linux", unmerged = "" } = opts
    const scratch = mkdtempSync(join(tmpdir(), "ocloop-int-fail-"))
    const wtPath = join(scratch, ".loop-worktrees", "slot-1")
    mkdirSync(wtPath, { recursive: true })
    const rootPlanPath = join(scratch, "PLAN.md")
    writeFileSync(rootPlanPath, PLAN)
    writeFileSync(join(wtPath, "PLAN.md"), PLAN)
    const calls: { args: string[]; timeoutMs?: number }[] = []
    const git: GitRunner = async (args, cwd, o) => {
      calls.push({ args, timeoutMs: o?.timeoutMs })
      let step = classify(args)
      if (sub(args)[0] === "rev-parse" && cwd === wtPath) step = "workerHead"
      if ((Array.isArray(fail) ? fail : [fail]).includes(step as Step)) return { exitCode, stdout: "", stderr: `boom ${step}` }
      const a = sub(args)
      if (a[0] === "show") return okRes(PLAN)
      if (step === "status") return okRes(mode === "dirty" ? " M src/a.ts\n" : "")
      if (step === "cached") return okRes("src/a.ts\n")
      if (step === "unmerged") return okRes(unmerged)
      if (a[0] === "diff" && a.includes("--")) return okRes(mode === "amend" ? "PLAN.md\n" : "")
      if (step === "changed") return okRes("src/a.ts\n")
      if (a[0] === "rev-parse") return okRes(cwd === wtPath ? "sha-worker\n" : "sha-main\n")
      return okRes()
    }
    try {
      const outcome = await integrateWorkerResult({
        slotId: 1,
        taskId: "1.1",
        taskDescription: "**1.1** Do A",
        sessionId: "ses-1",
        worktreePath: wtPath,
        baseSha: "sha-base",
        repoRoot: scratch,
        planPath: "PLAN.md",
        runGit: git,
        platform,
      })
      const plan = await Bun.file(rootPlanPath).text()
      return { outcome, calls, plan }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  const expectErrorNoMark = (r: Awaited<ReturnType<typeof run>>, step: string) => {
    expect(r.outcome.status).toBe("error")
    if (r.outcome.status === "error") {
      expect(r.outcome.message).toContain("task 1.1")
      expect(r.outcome.message).toContain(`boom ${step}`)
    }
    expect(r.plan).not.toContain("- [x]")
    expect(r.calls.some((c) => sub(c.args)[0] === "merge")).toBe(false)
  }

  it("baseline: with no failure the task integrates and is marked [x]", async () => {
    const r = await run({})
    expect(r.outcome.status).toBe("integrated")
    expect(r.plan).toContain("- [x] **1.1** Do A")
  })

  it("(a) add -A exit 1 => error and PLAN.md has no [x]", async () => {
    expectErrorNoMark(await run({ fail: "add" }), "add")
  })

  it("(b) status --porcelain exit 1 => error", async () => {
    expectErrorNoMark(await run({ fail: "status" }), "status")
  })

  it("(c) diff base..HEAD exit 1 => error", async () => {
    expectErrorNoMark(await run({ fail: "changed" }), "changed")
  })

  it("(d) diff --cached exit 1 => error", async () => {
    expectErrorNoMark(await run({ fail: "cached" }), "cached")
  })

  it("reset HEAD -- plan and the plan checkout abort the integration on failure", async () => {
    expectErrorNoMark(await run({ fail: "unstage" }), "unstage")
    expectErrorNoMark(await run({ fail: "restore" }), "restore")
  })

  it("(e) commit exit 1 and exit 124 => error without [x]", async () => {
    expectErrorNoMark(await run({ fail: "commit", exitCode: 1 }), "commit")
    expectErrorNoMark(await run({ fail: "commit", exitCode: 124 }), "commit")
  })

  it("(f) commit --amend exit != 0 => error without [x]", async () => {
    const ok = await run({ mode: "amend" })
    expect(ok.calls.some((c) => classify(c.args) === "amend")).toBe(true)
    expectErrorNoMark(await run({ mode: "amend", fail: "amend", exitCode: 128 }), "amend")
  })

  it("(g) rebase timeout (124) => error, rebase --abort, never reset --hard", async () => {
    const r = await run({ fail: "rebase", exitCode: 124 })
    expectErrorNoMark(r, "rebase")
    const abort = r.calls.find((c) => c.args[0] === "rebase" && c.args[1] === "--abort")
    expect(abort).toBeDefined()
    expect(abort?.timeoutMs).toBe(GIT_LONG_TIMEOUT_MS)
    expect(r.calls.some((c) => c.args[0] === "reset" && c.args.includes("--hard"))).toBe(false)
  })

  it("internal commits skip user hooks and GPG signing (POSIX /dev/null, win32 NUL)", async () => {
    for (const [platform, nul] of [["linux", "/dev/null"], ["win32", "NUL"]] as const) {
      for (const mode of ["dirty", "amend"] as const) {
        const r = await run({ mode, platform })
        const commit = r.calls.find((c) => sub(c.args)[0] === "commit")
        expect(commit?.args.slice(0, 4)).toEqual(["-c", `core.hooksPath=${nul}`, "-c", "commit.gpgsign=false"])
        expect(commit?.timeoutMs).toBe(GIT_COMMIT_TIMEOUT_MS)
      }
    }
    expect(internalCommitConfig("darwin")).toContain("core.hooksPath=/dev/null")
  })

  it("add -A and merge --ff-only get the long git deadline", async () => {
    const r = await run({})
    expect(r.calls.find((c) => c.args[0] === "add")?.timeoutMs).toBe(GIT_LONG_TIMEOUT_MS)
    expect(r.calls.find((c) => c.args[0] === "merge")?.timeoutMs).toBe(GIT_LONG_TIMEOUT_MS)
  })

  it("(h) worker rev-parse HEAD failing => error and PLAN.md has no [x] (R-15)", async () => {
    expectErrorNoMark(await run({ fail: "workerHead", exitCode: 124 }), "workerHead")
    expectErrorNoMark(await run({ fail: "workerHead", exitCode: 128 }), "workerHead")
  })

  it("diff base..HEAD -- plan failing on the amend branch => error, no merge (R-15)", async () => {
    expectErrorNoMark(await run({ mode: "amend", fail: "diffPlan" }), "diffPlan")
  })

  it("(i) rebase exit 1 with no unmerged files => error, not conflict_retry, no reset --hard (R-16)", async () => {
    const r = await run({ fail: "rebase", exitCode: 1 })
    expectErrorNoMark(r, "rebase")
    expect(r.calls.some((c) => c.args[0] === "rebase" && c.args[1] === "--abort")).toBe(true)
    expect(r.calls.some((c) => c.args[0] === "reset" && c.args.includes("--hard"))).toBe(false)
  })

  it("a rebase with real unmerged files still reports conflict_retry with those files", async () => {
    const r = await run({ fail: "rebase", exitCode: 1, unmerged: "src/a.ts\n" })
    expect(r.outcome).toEqual({ status: "conflict_retry", conflictingFiles: ["src/a.ts"], newBaseSha: "sha-main" })
    expect(r.plan).not.toContain("- [x]")
  })

  it("a failing diff --diff-filter=U after a failed rebase => error, no reset --hard", async () => {
    const r = await run({ fail: ["rebase", "unmerged"], exitCode: 1 })
    expectErrorNoMark(r, "unmerged")
    expect(r.calls.some((c) => c.args[0] === "rebase" && c.args[1] === "--abort")).toBe(true)
    expect(r.calls.some((c) => c.args[0] === "reset" && c.args.includes("--hard"))).toBe(false)
  })

  it("the rebase runs with the hook/gpg bypass (R-16)", async () => {
    const r = await run({})
    const rebase = r.calls.find((c) => classify(c.args) === "rebase")
    expect(rebase?.args.slice(0, 5)).toEqual(["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "rebase"])
  })
})
