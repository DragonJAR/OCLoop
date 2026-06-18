/**
 * Phase 2 base execution tests.
 *
 * Verifies the pre-TUI `validatePrerequisites` path in four shapes:
 *  - task 1: no PLAN.md at the default path → `errPlanNotFound`, exit 1.
 *  - task 2: valid PLAN.md → past validation, into render (current bug:
 *           non-TTY hangs/segfaults; pinned with a 500 ms timeout).
 *  - task 3: `--plan <custom-path>` pointing to a missing file → same
 *           `errPlanNotFound`, but with the custom path echoed in the
 *           message and NO prompt-file auto-create (proves validation
 *           aborted before reaching the prompt step).
 *  - task 4: empty PLAN.md (0 bytes) → passes pre-flight (existence-only
 *           check) the same as a valid one; the render path then
 *           hits the same non-TTY hang/segfault. Pins that the current
 *           pre-flight does NOT reject content-less files — Phase 3
 *           owns the fix to add a content check (matrix case 27).
 *
 * ponytail: shared beforeEach/afterEach mkdtemp + chdir scaffolding;
 * one describe per matrix case. The TUI segfault case (matrix case 4)
 * lives in cli-runner.test.ts's `--run --debug` timeout test; it is
 * owned by Phase 3's non-TTY pre-flight fix, not here.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCli } from "./cli-runner"
import { DEFAULTS } from "./constants"

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

describe("CLI: ejecución con PLAN.md mínimo válido", () => {
  it("passes pre-TUI validation and enters the render path (current bug: non-TTY hangs/segfaults)", async () => {
    // Minimal valid PLAN.md: a single pending task is enough for
    // validatePrerequisites to accept the file. We don't care about the
    // content of the task here — this test pins the CLI's BEHAVIOR at
    // the boundary between pre-flight validation and TUI render, not
    // task semantics (those are covered by the parser unit tests).
    writeFileSync(
      join(dir, "PLAN.md"),
      "# Plan\n\n- [ ] Do something\n",
    )

    // Short timeout: validatePrerequisites + render start take <500 ms
    // in this environment, so 500 ms is enough for the side effect
    // (.loop-prompt.md auto-create) to land on disk before the timeout
    // kills the hung TUI input loop. Mirrors cli-runner.test.ts's
    // 250 ms TUI hang test but with a bit more headroom because the
    // non-debug path also has to validate the plan file and resolve
    // locale.
    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
      timeoutMs: 500,
    })

    // Side-effect proof: validatePrerequisites ran end-to-end. PLAN.md
    // was found AND, because no .loop-prompt.md existed yet, the
    // default was auto-created with `t("defaultLoopPrompt")`. That
    // `Bun.write` happens BEFORE `tuiStarted = true`, so its presence
    // on disk proves the CLI got past validation into the render path.
    // If the file is missing, validation aborted earlier than expected
    // (e.g. a regression that re-checks the plan file after the prompt
    // step) and the test would catch it.
    const promptFile = join(dir, ".loop-prompt.md")
    expect(existsSync(promptFile)).toBe(true)

    // Current non-TTY behavior (matrix case 4 / Phase 3 fix target):
    // the TUI input loop hangs on a closed stdin and gets killed by the
    // timeout (124) — or, less often, Bun segfaults mid-render (139)
    // when the input loop finally touches the dead handle. Either is
    // acceptable for this "pin the current behavior" test. Phase 3
    // replaces both with a clean `process.exit(1)` plus a friendly
    // "OCLoop requires an interactive terminal" message — at which
    // point this assertion tightens to `expect(result.exitCode).toBe(1)`
    // and the prompt-file check stays.
    expect([124, 139]).toContain(result.exitCode)
  })
})

describe("CLI: ejecución con --plan apuntando a un archivo inexistente", () => {
  it("exits 1 with errPlanNotFound naming the custom path, no prompt auto-create", async () => {
    // Matrix case 26: user passes `--plan my.md` but my.md doesn't exist.
    // The CLI must reject the file via the SAME pre-TUI `errPlanNotFound`
    // path as the default case, but the error message must echo the
    // custom path the user actually typed (not the default `PLAN.md`).
    // Also asserts the prompt-file auto-create step did NOT run — if it
    // did, the test cwd would have a `.loop-prompt.md` and we would know
    // validation reached the prompt step instead of stopping at the plan
    // step. The order in `validatePrerequisites` is: plan first, prompt
    // second (`index.tsx:65-100`).
    const customPath = join(dir, "custom-plan.md")
    expect(existsSync(customPath)).toBe(false) // sanity: the file really is missing

    const result = await runCli(["--lang", "en", "--plan", customPath], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file not found")
    // The custom path must be echoed, not the default.
    expect(result.stderr).toContain(customPath)
    expect(result.stdout).toBe("")

    // The plan check ran first and aborted; the prompt auto-create
    // step (which would write `.loop-prompt.md`) must NOT have run.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })
})

describe("CLI: ejecución con PLAN.md vacío", () => {
  it("passes pre-TUI validation (existence-only) and enters the render path (matrix case 27)", async () => {
    // Matrix case 27: PLAN.md exists but is 0 bytes. Today's `validatePrerequisites`
    // checks `Bun.file(planPath).exists()` (index.tsx:65) and nothing else — it
    // never reads the plan content. So an empty file passes pre-flight exactly
    // like a valid one, the .loop-prompt.md auto-create runs, and the CLI enters
    // the render path. That render then hits the same non-TTY hang/segfault
    // pinned in the "valid PLAN.md" test above.
    //
    // This is the CURRENT (buggy) behavior. Phase 3 will tighten
    // `validatePrerequisites` to also reject content-less plans with a clear
    // error (`errPlanEmpty` or similar), at which point this test tightens to:
    //   expect(result.exitCode).toBe(1)
    //   expect(result.stderr).toContain("Error: ...")
    //   expect(existsSync(promptFile)).toBe(false)  // auto-create didn't run
    writeFileSync(join(dir, DEFAULTS.PLAN_FILE), "")

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
      timeoutMs: 500,
    })

    // Same side-effect proof as the valid-plan test: the pre-TUI validation ran
    // end-to-end, so the missing default `.loop-prompt.md` was auto-created
    // BEFORE `tuiStarted = true`. If the file is missing, validation aborted
    // earlier than expected (e.g. a regression that rejects empty plans
    // pre-emptively, before the prompt step).
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(true)

    // Same non-TTY behavior pinned as the valid-plan case: timeout-kill (124)
    // or segfault (139) — either is acceptable for this "pin current behavior"
    // test. Phase 3's non-TTY pre-flight fix replaces both with a clean
    // `process.exit(1)` plus a friendly error message, and the assertion
    // above (`existsSync(promptFile)`) will then need to flip to
    // `expect(existsSync(promptFile)).toBe(false)` because validation will
    // abort at the plan-content step before reaching the prompt step.
    expect([124, 139]).toContain(result.exitCode)
  })
})
