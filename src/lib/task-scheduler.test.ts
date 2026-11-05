import { describe, expect, it } from "bun:test"
import { markTaskCompleted, parsePlanTasks } from "./plan-parser"
import {
  clampParallelJobs,
  scopePatternsOverlap,
  selectEligibleTasks,
  taskScopesOverlap,
  validateTaskGraph,
} from "./task-scheduler"

describe("parsePlanTasks and markTaskCompleted", () => {
  it("extracts explicit IDs, phase boundaries, inline and sub-bullet depends/files, and recon flags", () => {
    const plan = [
      "## Phase 1: Foundation",
      "- [x] **1.1** Setup base types (files: src/types.ts)",
      "- [ ] **1.2** Build parser (depends: 1.1) (files: src/lib/plan-parser.ts)",
      "  - eval: parser tests pass",
      "- [ ] **1.3** Build scheduler",
      "  - depends: 1.1",
      "  - files: src/lib/task-scheduler.ts, src/lib/task-scheduler.test.ts",
      "",
      "## Phase 2: Recon",
      "- [ ] **2.1** (recon) Audit endpoints",
    ].join("\n")

    const tasks = parsePlanTasks(plan)
    expect(tasks).toHaveLength(4)

    expect(tasks[0]).toMatchObject({
      id: "1.1",
      phaseIndex: 0,
      type: "completed",
      files: ["src/types.ts"],
      dependsOn: [],
      isRecon: false,
    })

    expect(tasks[1]).toMatchObject({
      id: "1.2",
      phaseIndex: 0,
      type: "pending",
      dependsOn: ["1.1"],
      files: ["src/lib/plan-parser.ts"],
      cleanDescription: "**1.2** Build parser",
    })

    expect(tasks[2]).toMatchObject({
      id: "1.3",
      phaseIndex: 0,
      type: "pending",
      dependsOn: ["1.1"],
      files: ["src/lib/task-scheduler.ts", "src/lib/task-scheduler.test.ts"],
    })

    expect(tasks[3]).toMatchObject({
      id: "2.1",
      phaseIndex: 1,
      type: "pending",
      isRecon: true,
    })
  })

  it("marks a specific pending task completed by description and inserts notes and recon subtasks after sub-bullets", () => {
    const plan = [
      "## Phase 1",
      "- [ ] **1.1** First task",
      "- [ ] **1.2** Second task (recon)",
      "  - files: src/api/*",
      "- [ ] **1.3** Third task",
    ].join("\n")

    const updated = markTaskCompleted(plan, "**1.2** Second task (recon)", {
      notes: ["Decision: kept v1 compatibility"],
      reconTasks: ["**1.2a** Fix endpoint A", "**1.2b** Fix endpoint B"],
    })

    expect(updated).toBe(
      [
        "## Phase 1",
        "- [ ] **1.1** First task",
        "- [x] **1.2** Second task (recon)",
        "  - files: src/api/*",
        "  - Decision: kept v1 compatibility",
        "- [ ] **1.2a** Fix endpoint A",
        "- [ ] **1.2b** Fix endpoint B",
        "- [ ] **1.3** Third task",
      ].join("\n"),
    )
  })
})

describe("task-scheduler", () => {
  it("clamps parallel jobs to [1, 4]", () => {
    expect(clampParallelJobs(undefined)).toBe(1)
    expect(clampParallelJobs(0)).toBe(1)
    expect(clampParallelJobs(-3)).toBe(1)
    expect(clampParallelJobs(2)).toBe(2)
    expect(clampParallelJobs(4)).toBe(4)
    expect(clampParallelJobs(99)).toBe(4)
    expect(clampParallelJobs(Number.NaN)).toBe(1)
  })

  it("detects overlapping file and directory/glob scopes accurately", () => {
    expect(scopePatternsOverlap("src/App.tsx", "src/App.tsx")).toBe(true)
    expect(scopePatternsOverlap("./src/App.tsx", "src/App.tsx")).toBe(true)
    expect(scopePatternsOverlap("src/ui/*", "src/ui/Dialog.tsx")).toBe(true)
    expect(scopePatternsOverlap("src/ui/", "src/ui/Dialog.tsx")).toBe(true)
    expect(scopePatternsOverlap("src/ui/*", "src/lib/api.ts")).toBe(false)
    expect(scopePatternsOverlap("src/lib/format.ts", "src/lib/format.test.ts")).toBe(false)
  })

  it("detects dependency cycles and missing dependencies in validateTaskGraph", () => {
    const cyclicPlan = [
      "- [ ] **1.1** Task A (depends: 1.2)",
      "- [ ] **1.2** Task B (depends: 1.1)",
    ].join("\n")
    const validation = validateTaskGraph(parsePlanTasks(cyclicPlan))
    expect(validation.valid).toBe(false)
    expect(validation.cycles.length).toBeGreaterThan(0)

    const batch = selectEligibleTasks(cyclicPlan, new Set(), 4)
    expect(batch.deadlocked).toBe(true)
    expect(batch.deadlockReason).toContain("Dependency cycle")
  })

  it("schedules up to 4 independent tasks in the same phase while respecting dependsOn and file collisions", () => {
    const plan = [
      "## Phase 1",
      "- [x] **1.1** Base contract (files: src/types.ts)",
      "- [ ] **1.2** Worker runtime (depends: 1.1) (files: src/lib/parallel-run.ts)",
      "- [ ] **1.3** Scheduler (depends: 1.1) (files: src/lib/task-scheduler.ts)",
      "- [ ] **1.4** Worktrees (depends: 1.1) (files: src/lib/workspace-manager.ts)",
      "- [ ] **1.5** Conflicting edit on scheduler (depends: 1.1) (files: src/lib/task-scheduler.ts)",
      "- [ ] **1.6** Needs 1.2 first (depends: 1.2) (files: src/App.tsx)",
      "## Phase 2",
      "- [ ] **2.1** Final check",
    ].join("\n")

    const batch = selectEligibleTasks(plan, new Set(), 4)
    expect(batch.deadlocked).toBe(false)
    // 1.2, 1.3, 1.4 are eligible; 1.5 collides on task-scheduler.ts with 1.3; 1.6 waits on 1.2; 2.1 is in Phase 2
    expect(batch.eligible.map((t) => t.id)).toEqual(["1.2", "1.3", "1.4"])
  })

  it("enforces phase barrier and recon barrier", () => {
    const plan = [
      "## Phase 1",
      "- [ ] **1.1** (recon) Discover modules",
      "- [ ] **1.2** Refactor module A",
      "## Phase 2",
      "- [ ] **2.1** Phase 2 task",
    ].join("\n")

    // Recon task runs alone and blocks 1.2 until it completes
    const batch1 = selectEligibleTasks(plan, new Set(), 4)
    expect(batch1.eligible.map((t) => t.id)).toEqual(["1.1"])

    // While 1.1 is in flight, nothing else starts
    const batchInFlight = selectEligibleTasks(
      plan,
      new Set(["**1.1** (recon) Discover modules"]),
      4,
    )
    expect(batchInFlight.eligible).toEqual([])
    expect(batchInFlight.waitingOnInFlight).toBe(true)
  })

  it("reports deadlock when a pending task depends on a BLOCKED task and nothing is in flight", () => {
    const plan = [
      "- [BLOCKED: missing key] **1.1** Setup auth",
      "- [ ] **1.2** Use auth (depends: 1.1)",
    ].join("\n")

    const batch = selectEligibleTasks(plan, new Set(), 4)
    expect(batch.eligible).toEqual([])
    expect(batch.deadlocked).toBe(true)
    expect(batch.deadlockReason).toContain("1.1 (blocked)")
  })
})

describe("scope overlap is case-insensitive where the file system is (T10-A O-04)", () => {
  it("src/App.tsx and src/app.tsx overlap on win32 and darwin, not on linux", () => {
    expect(scopePatternsOverlap("src/App.tsx", "src/app.tsx", "win32")).toBe(true)
    expect(scopePatternsOverlap("src/App.tsx", "src/app.tsx", "darwin")).toBe(true)
    expect(scopePatternsOverlap("src/App.tsx", "src/app.tsx", "linux")).toBe(false)
  })

  it("folds case for wildcard/directory prefixes too", () => {
    expect(scopePatternsOverlap("SRC/ui/**", "src/UI/Dialog.tsx", "win32")).toBe(true)
    expect(scopePatternsOverlap("Src/", "src/lib/", "darwin")).toBe(true)
    expect(scopePatternsOverlap("SRC/ui/**", "src/UI/Dialog.tsx", "linux")).toBe(false)
  })

  it("taskScopesOverlap forwards the platform", () => {
    expect(taskScopesOverlap(["src/App.tsx"], ["SRC/APP.TSX"], "win32")).toBe(true)
    expect(taskScopesOverlap(["src/App.tsx"], ["SRC/APP.TSX"], "linux")).toBe(false)
  })
})
