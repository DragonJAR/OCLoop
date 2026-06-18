/**
 * Phase 2 base execution tests — first deliverable.
 *
 * Scope (PLAN.md Fase 2, task 1): "ejecución sin parámetros con salida y
 * código de salida esperados". Verifies that invoking the CLI with no
 * arguments, in a directory with no PLAN.md, fails cleanly through the
 * `validatePrerequisites` pre-TUI path:
 *
 *   - exit code 1
 *   - localized `errPlanNotFound` on stderr (NOT a stack trace)
 *   - empty stdout
 *
 * This pins the documented matrix case 3 (pre-TUI validation). The TUI
 * segfault case (matrix case 4) lives in cli-runner.test.ts's existing
 * `--run --debug` timeout test; it is owned by Phase 3's non-TTY pre-flight
 * fix, not here.
 *
 * ponytail: one describe, one test, mkdtemp + chdir + rmSync. Future
 * Phase 2 tasks (valid PLAN, missing PLAN, empty PLAN, no pending tasks,
 * single pending task) will live in the same file and reuse the same
 * beforeEach/afterEach scaffolding.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCli } from "./cli-runner"

let dir: string
let prevCwd: string
const PROJECT_ROOT = process.cwd()
const ENTRYPOINT = join(PROJECT_ROOT, "dist/index.js")

beforeEach(() => {
  prevCwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), "ocloop-noargs-"))
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(prevCwd)
  rmSync(dir, { recursive: true, force: true })
})

describe("CLI: ejecución sin parámetros", () => {
  it("exits 1 with errPlanNotFound on stderr when no PLAN.md is present", async () => {
    // No args, no flags, no PLAN.md in cwd. Expected: the pre-TUI
    // `validatePrerequisites` rejects the missing plan file with a
    // localized, user-facing error and exit code 1. Anything else
    // (stack trace, segfault, hang, exit 0) means the pre-flight guard
    // regressed.
    // Use --lang en to force English locale. Config file (~/.config/ocloop/ocloop.json)
    // takes precedence over env vars, so CLI flag is the reliable way.
    const result = await runCli(["--lang", "en"], { entrypoint: ENTRYPOINT })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file not found")
    expect(result.stderr).toContain("PLAN.md")
    expect(result.stdout).toBe("")
  })
})
