/**
 * Phase 2 base execution tests, updated for the Phase 3 non-TTY guard.
 *
 * Verifies the pre-TUI `validatePrerequisites` path in seven shapes:
 *  - task 1: no PLAN.md at the default path → `errPlanNotFound`, exit 1.
 *  - task 2: valid PLAN.md → past validation, then the non-TTY guard
 *           fires `errNoTty`, exit 1 (Phase 3 fix; pre-fix this used to
 *           segfault at 139 or hang until 124).
 *  - task 3: `--plan <custom-path>` pointing to a missing file → same
 *           `errPlanNotFound`, but with the custom path echoed in the
 *           message and NO prompt-file auto-create (proves validation
 *           aborted before reaching the prompt step).
 *  - task 4: empty PLAN.md (0 bytes) → passes pre-flight (existence-only
 *           check) the same as a valid one; the TTY guard then fires
 *           `errNoTty` before render. Pins that the current pre-flight
 *           does NOT reject content-less files — that content check
 *           is a separate Phase 3 task (matrix case 27).
 *  - task 5: PLAN.md with no pending tasks → passes pre-flight like a
 *           valid one, then the TTY guard fires `errNoTty`. The
 *           "no pending tasks" content check is a separate Phase 3
 *           task (matrix case 51).
 *  - task 6: PLAN.md with exactly one pending task amid completed
 *           tasks above and below → passes pre-flight, TTY guard
 *           fires (matrix case 52; the trailing completed tasks prove
 *           the selection is unambiguous, not just "first line", but
 *           that assertion lives in plan-parser tests, not here).
 *  - task 7: `--prompt <custom-path>` pointing to a missing file with
 *           a valid PLAN.md present → `errPromptNotFound`, NOT the
 *           plan-step error and NOT a silent auto-create. Symmetric
 *           to task 3, exercising the SECOND check in
 *           `validatePrerequisites` (the prompt file). Matrix case 29.
 *
 * ponytail: shared beforeEach/afterEach mkdtemp + chdir scaffolding;
 * one describe per matrix case.
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
  it("exits 1 with errNoTty after pre-TUI validation (non-TTY guard fires before render)", async () => {
    // Minimal valid PLAN.md: a single pending task is enough for
    // validatePrerequisites to accept the file. The TUI render path
    // (matrix case 4 / Phase 3 fix) used to segfault here in non-TTY;
    // the Phase 3 fix inserts an `errNoTty` guard between validation
    // and render so this path now exits cleanly with code 1 and a
    // localized "requires an interactive terminal" message.
    writeFileSync(
      join(dir, "PLAN.md"),
      "# Plan\n\n- [ ] Do something\n",
    )

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
      timeoutMs: 5_000,
    })

    // Side-effect proof: validatePrerequisites ran end-to-end. PLAN.md
    // was found AND, because no .loop-prompt.md existed yet, the
    // default was auto-created with `t("defaultLoopPrompt")`. That
    // `Bun.write` happens BEFORE the TTY guard, so its presence on
    // disk proves the CLI got past validation. If the file is missing,
    // validation aborted earlier than expected (e.g. a regression that
    // re-checks the plan file after the prompt step) and the test
    // would catch it.
    const promptFile = join(dir, ".loop-prompt.md")
    expect(existsSync(promptFile)).toBe(true)

    // Phase 3 fix: clean exit 1 with the localized TTY-required
    // message. The pre-fix behavior (timeout-kill at 124, or SIGSEGV
    // at 139) is gone — the guard fires before `render()` is reached.
    //
    // ponytail: don't assert `stdout === ""` here. The prompt auto-create
    // emits a `promptCreated` notice via console.log (i18n.ts:217 +
    // index.tsx:86) BEFORE the TTY guard runs, so stdout legitimately
    // contains that banner. Asserting it empty would couple the test to
    // a console.log call site that lives in validatePrerequisites, not
    // in the guard we're testing. The stderr check + prompt-file
    // existence + exit code is enough to pin the guard.
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: OCLoop requires an interactive terminal")
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

describe("CLI: ejecución con --prompt apuntando a un archivo inexistente", () => {
  it("exits 1 with errPromptNotFound naming the custom path, no default auto-create", async () => {
    // Matrix case 29: user passes `--prompt my.md` but my.md doesn't exist
    // (and PLAN.md IS valid). The CLI must:
    //   (a) PASS the plan-existence check (PLAN.md is present).
    //   (b) FAIL the prompt-existence check on the custom path.
    //   (c) Emit `errPromptNotFound` with the custom path echoed, NOT
    //       silently fall through to the default `.loop-prompt.md`
    //       auto-create branch. The branch in `validatePrerequisites`
    //       (index.tsx:75-99) is gated on `args.promptFile ===
    //       DEFAULTS.PROMPT_FILE` — any non-default path skips the
    //       auto-create and goes straight to `errPromptNotFound`. A
    //       regression that drops the gate would let the custom path
    //       create a file at that path; we assert it didn't.
    //   (d) NOT enter the render path (no `.loop.log`, no render
    //       timeout/segfault).
    writeFileSync(join(dir, DEFAULTS.PLAN_FILE), "- [ ] Only task\n")

    const customPath = join(dir, "custom-prompt.md")
    expect(existsSync(customPath)).toBe(false) // sanity: the file really is missing

    // Use a generous timeout to distinguish "exited cleanly" (≤ 1 s in
    // practice) from "hung/segfaulted" (would hit the 500 ms window
    // from the render tests). The non-TTY render tests rely on
    // `timeoutMs: 500` to pin the segfault/hang; this test does NOT
    // want to reach the render path at all, so we allow up to 5 s and
    // then assert a clean exit-1 rather than 124/139.
    const result = await runCli(
      ["--lang", "en", "--prompt", customPath],
      { entrypoint: ENTRYPOINT, timeoutMs: 5_000 },
    )

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Prompt file not found")
    // The custom path must be echoed, not the default.
    expect(result.stderr).toContain(customPath)
    expect(result.stdout).toBe("")

    // The plan check passed (PLAN.md exists). The prompt check on the
    // custom path FAILED, exiting before any auto-create could run —
    // so neither the default `.loop-prompt.md` nor the custom path
    // was written to disk.
    const defaultPrompt = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(defaultPrompt)).toBe(false)
    expect(existsSync(customPath)).toBe(false)
  })
})

describe("CLI: ejecución con PLAN.md vacío", () => {
  it("exits 1 with errNoTty after pre-TUI validation (matrix case 27, existence-only pre-flight)", async () => {
    // Matrix case 27: PLAN.md exists but is 0 bytes. Today's `validatePrerequisites`
    // checks `Bun.file(planPath).exists()` (index.tsx:65) and nothing else — it
    // never reads the plan content. So an empty file passes pre-flight exactly
    // like a valid one, the .loop-prompt.md auto-create runs, and the CLI then
    // hits the non-TTY guard (Phase 3 fix) before `render()` segfaults. The
    // content check is a separate Phase 3 task; this test only pins the
    // pre-flight + TTY-guard flow.
    writeFileSync(join(dir, DEFAULTS.PLAN_FILE), "")

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
      timeoutMs: 5_000,
    })

    // Same side-effect proof as the valid-plan test: the pre-TUI validation ran
    // end-to-end, so the missing default `.loop-prompt.md` was auto-created
    // BEFORE the TTY guard. If the file is missing, validation aborted earlier
    // than expected.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(true)

    // Phase 3 fix: clean exit 1 with the localized TTY-required message.
    // (No `stdout === ""` check — see comment in the "PLAN.md mínimo válido"
    // test above for why the promptCreated banner legitimately writes to stdout.)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: OCLoop requires an interactive terminal")
  })
})

describe("CLI: ejecución con PLAN.md sin tareas pendientes", () => {
  it("exits 1 with errNoTty after pre-TUI validation (matrix case 51, existence-only pre-flight)", async () => {
    // Matrix case 51: PLAN.md exists, has at least one task, but every
    // task is already marked `[x]` (or `[MANUAL]`/`[BLOCKED]`) — there is
    // no `- [ ]` line to act on. `isStructurallyComplete` from
    // `plan-parser.ts:161-163` would return true for this content, but
    // `validatePrerequisites` does not call it — it only checks
    // `Bun.file(planPath).exists()` (matrix case 27 is the empty-file
    // twin; this is its "has tasks but nothing to do" sibling).
    //
    // The intended runtime behavior (App.tsx:checkPlanComplete, line 724)
    // is to detect structural completion inside the TUI's iteration
    // flow, write the `<plan-complete>` tag deterministically, and
    // dispatch `plan_complete` so the user sees the completion dialog
    // and the loop ends cleanly (exit 0 on Q). That path lives behind
    // `startIteration` (line 963), which is only triggered by `--run` or
    // the user pressing `S`. In non-TTY mode the user can't press S, so
    // the TUI just shows "esperando…" until the segfault/hang.
    //
    // This test pins the CURRENT pre-flight behavior: a no-pending plan
    // passes validation exactly like a valid one, the prompt auto-create
    // runs, and the CLI then hits the non-TTY guard (Phase 3 fix) before
    // `render()` segfaults. The "no pending tasks" content check is a
    // separate Phase 3 task; this test only pins the pre-flight + TTY-guard
    // flow.
    writeFileSync(
      join(dir, DEFAULTS.PLAN_FILE),
      "# Plan\n\n- [x] Done task one\n- [x] Done task two\n",
    )

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
      timeoutMs: 5_000,
    })

    // Same side-effect proof: pre-TUI validation ran end-to-end, the
    // default `.loop-prompt.md` was auto-created BEFORE the TTY guard.
    // If the file is missing, validation aborted earlier than expected.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(true)

    // Phase 3 fix: clean exit 1 with the localized TTY-required message.
    // (No `stdout === ""` check — see comment in the "PLAN.md mínimo válido"
    // test above for why the promptCreated banner legitimately writes to stdout.)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: OCLoop requires an interactive terminal")
  })
})

describe("CLI: ejecución con una sola tarea pendiente entre varias completadas", () => {
  it("exits 1 with errNoTty after pre-TUI validation (matrix case 52, single pending among many)", async () => {
    // Matrix case 52: PLAN.md has several tasks, exactly one is pending,
    // and it sits in the middle of the file (surrounded by completed
    // tasks above AND below). The TUI's `getCurrentTaskFromContent`
    // (plan-parser.ts:299) returns the FIRST unchecked line, so the
    // pending task here is the unique actionable target — selection is
    // unambiguous. The trailing completed tasks on purpose: a buggy
    // parser that picked the LAST unchecked line, or that re-counted
    // `[x]` as pending, would not have a single unambiguous target, and
    // a buggy selection that walked the plan in reverse would land on
    // "Done task four" instead. This shape exercises both directions.
    //
    // Companion to the "valid PLAN.md" test (which had ONE task total):
    // that test pinned the pre-TUI existence check at the minimum, this
    // test pins it at a representative non-trivial shape where the
    // count matters, not just the existence. After the Phase 3 fix
    // both tests assert the same clean exit 1 with errNoTty.
    writeFileSync(
      join(dir, DEFAULTS.PLAN_FILE),
      [
        "# Plan",
        "",
        "- [x] Done task one",
        "- [x] Done task two",
        "- [x] Done task three",
        "- [ ] Only pending task",
        "- [x] Done task four",
        "",
      ].join("\n"),
    )

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
      timeoutMs: 5_000,
    })

    // Same side-effect proof as the other pre-flight tests: the pre-TUI
    // validation ran end-to-end, the default `.loop-prompt.md` was
    // auto-created BEFORE the TTY guard. If the file is missing,
    // validation aborted earlier than expected.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(true)

    // Phase 3 fix: clean exit 1 with the localized TTY-required message.
    // (No `stdout === ""` check — see comment in the "PLAN.md mínimo válido"
    // test above for why the promptCreated banner legitimately writes to stdout.)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: OCLoop requires an interactive terminal")
  })
})
