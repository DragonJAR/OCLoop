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
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
  it("exits 1 with errPlanEmpty when PLAN.md is 0 bytes (matrix case 27, content pre-flight)", async () => {
    // Matrix case 27: PLAN.md exists but is 0 bytes. The Phase 3 content
    // pre-flight in `validatePrerequisites` (index.tsx, after the existence
    // check) reads the file, runs `parsePlan`, and rejects `total === 0`
    // with a localized "add a task" message before the prompt auto-create
    // step or the TTY guard can run.
    writeFileSync(join(dir, DEFAULTS.PLAN_FILE), "")

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file is empty")
    // The default path is echoed in the error (not the absolute cwd-prefixed
    // path) — same convention as errPlanNotFound.
    expect(result.stderr).toContain(DEFAULTS.PLAN_FILE)
    expect(result.stdout).toBe("")

    // Content check ran before the prompt step, so the auto-create MUST NOT
    // have written `.loop-prompt.md` to disk. If the file exists, the order
    // in `validatePrerequisites` regressed.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("exits 1 with errPlanEmpty when PLAN.md has only a heading (no task lines)", async () => {
    // A non-empty file that still has zero task lines (just a markdown
    // heading) is functionally equivalent to a 0-byte file from the loop's
    // perspective: `parsePlan` returns `total === 0` because `parseTaskLine`
    // only counts lines that start with `- [`. The content check must catch
    // it. If it didn't, the TUI's `getCurrentTaskFromContent` would return
    // null and the dashboard would show "esperando…" forever (in TTY) or
    // the segfault (in non-TTY).
    writeFileSync(join(dir, DEFAULTS.PLAN_FILE), "# My Plan\n\nJust a heading, no tasks yet.\n")

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file is empty")
    expect(result.stderr).toContain(DEFAULTS.PLAN_FILE)
    expect(result.stdout).toBe("")

    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("exits 1 with errPlanEmpty when PLAN.md has only whitespace and prose (no task lines)", async () => {
    // Same root cause as the heading-only case: parsePlan returns total=0
    // for any content without `- [...]` lines. Covers the realistic shape
    // of a freshly-created PLAN.md the user started writing notes into but
    // never added a checkbox to yet.
    writeFileSync(
      join(dir, DEFAULTS.PLAN_FILE),
      "\n  \nJust some notes, no checkbox lines yet.\n  \n",
    )

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file is empty")
    expect(result.stdout).toBe("")

    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("exits 1 with errPlanEmpty when --plan points to a 0-byte file (matrix case 27, custom path)", async () => {
    // Matrix case 27 (custom path variant): `--plan empty.md` where empty.md
    // is a 0-byte file. Same fix as the default-path test above, but
    // asserts the custom path is echoed in the error (not the default
    // "PLAN.md"), proving the content check uses `args.planFile` exactly
    // like the existence check.
    const customPath = join(dir, "empty-plan.md")
    writeFileSync(customPath, "")
    expect(existsSync(customPath)).toBe(true) // sanity: the file really is there

    const result = await runCli(["--lang", "en", "--plan", customPath], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file is empty")
    expect(result.stderr).toContain(customPath)
    expect(result.stdout).toBe("")

    // Same as the default-path test: content check fired before the prompt
    // step, so no auto-create on the default `.loop-prompt.md`.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })
})

describe("CLI: ejecución con PLAN.md sin tareas pendientes", () => {
  it("exits 0 with errPlanComplete when all tasks are [x] (matrix case 51, structural-completion pre-flight)", async () => {
    // Matrix case 51: PLAN.md exists, has at least one task, but every
    // task is already marked `[x]` — there is no `- [ ]` line to act on.
    // `isStructurallyComplete` from `plan-parser.ts:161-163` returns true
    // for this content, so the pre-flight exits 0 (success) with the
    // localized `errPlanComplete` message before reaching the prompt
    // auto-create or the TTY guard.
    //
    // The sibling in the TUI is `App.tsx:checkPlanComplete` (line 724-752):
    // it also detects structural completion and either shows the
    // completion dialog (when triggered by `S`/`--run`) or writes the
    // `<plan-complete>` tag deterministically. The CLI pre-flight is the
    // read-only counterpart: it does NOT write the tag (the TUI owns that
    // mutation), and it does NOT auto-create the prompt file (a
    // completed plan doesn't need a fresh `.loop-prompt.md`). Exit 0
    // because the plan IS in a terminal good state — same success signal
    // as "nothing went wrong" for CI scripts gating on `$?`.
    writeFileSync(
      join(dir, DEFAULTS.PLAN_FILE),
      "# Plan\n\n- [x] Done task one\n- [x] Done task two\n",
    )

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
    })

    // Exit 0 (success) — the plan is in a terminal good state.
    expect(result.exitCode).toBe(0)
    // Localized message: the path is echoed so the user can locate the
    // file, and the "no automatable work" line tells them WHY nothing
    // happened. The "To enter the dashboard anyway" hint points at
    // --debug (the only flag that bypasses validatePrerequisites).
    expect(result.stderr).toContain("Plan is already complete")
    expect(result.stderr).toContain(DEFAULTS.PLAN_FILE)
    expect(result.stderr).toContain("Nothing left for OCLoop to do")

    // Pre-flight exited BEFORE the prompt step, so the auto-create MUST
    // NOT have written `.loop-prompt.md` to disk. If the file exists,
    // the order in `validatePrerequisites` regressed (the errPlanComplete
    // check should sit between errPlanEmpty and the prompt step).
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("exits 0 with errPlanComplete when remaining tasks are [x] and [MANUAL] (loop has nothing automatable)", async () => {
    // Same root cause as the all-[x] case: every task is in a terminal
    // state, so `parsePlan().automatable === 0` and the pre-flight fires.
    // A bare `[MANUAL]` line (no `- [ ]` checkbox wrapper) is parsed as
    // type=`manual` and excluded from the `automatable` count
    // (`plan-parser.ts:134`); the pre-flight must treat it the same way
    // as the TUI does. This is the shape matrix case 51 actually calls
    // out: "Todas las tareas `[x]` o `[MANUAL]`".
    writeFileSync(
      join(dir, DEFAULTS.PLAN_FILE),
      "# Plan\n\n- [x] Done\n- [MANUAL] Do by hand\n- [x] Also done\n",
    )

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("Plan is already complete")
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("exits 0 with errPlanComplete when remaining tasks are [x] and [BLOCKED] (blocked excluded from automatable)", async () => {
    // `[BLOCKED]` is also a terminal state per the parser
    // (`plan-parser.ts:135-138` — denominator excludes blocked, so
    // `automatable === 0` when all tasks are done or blocked). The
    // pre-flight must handle this shape identically to `[x]`/`[MANUAL]`:
    // a plan where the only remaining items are blocked is, from the
    // loop's perspective, complete. If a regression changed the
    // pre-flight to only check "no `- [ ]` lines" (a syntactic check
    // instead of `isStructurallyComplete`'s semantic one), this case
    // would pass validation and hit the TTY guard instead of the
    // errPlanComplete branch.
    writeFileSync(
      join(dir, DEFAULTS.PLAN_FILE),
      "# Plan\n\n- [x] Done\n- [BLOCKED: needs API key] Blocked until Q3\n",
    )

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("Plan is already complete")
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("exits 0 with errPlanComplete naming the custom path when --plan points to a completed plan", async () => {
    // Matrix case 51 (custom path variant): `--plan completed.md` where
    // completed.md is all-[x]. The pre-flight must use the CUSTOM path
    // in the message (not the default `PLAN.md`), proving the check
    // reads `args.planFile` exactly like the existence + empty checks
    // do. A regression that hard-coded `DEFAULTS.PLAN_FILE` in the
    // errPlanComplete template would surface the wrong path here.
    const customPath = join(dir, "completed.md")
    writeFileSync(customPath, "- [x] a\n- [x] b\n")

    const result = await runCli(["--lang", "en", "--plan", customPath], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("Plan is already complete")
    // The custom path must be echoed, not the default.
    expect(result.stderr).toContain(customPath)
    expect(result.stdout).toBe("")

    // Same as the default-path test: structural-completion check fired
    // before the prompt step, so no auto-create on the default
    // `.loop-prompt.md`. Also confirms we did NOT write a
    // `.loop-prompt.md` next to the custom plan file — the pre-flight
    // is read-only and only ever touches the prompt path when reaching
    // the auto-create branch.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("localizes errPlanComplete to Spanish when --lang es is set", async () => {
    // The pre-flight is fully localized: same English plan content, but
    // `--lang es` should produce a Spanish-language message. This pins
    // that the new i18n key was added to BOTH the `en` and `es` tables
    // (a missing Spanish entry would have the i18n layer fall back to
    // the English value silently — `i18n.ts:948-949` — and a test
    // asserting on English text would falsely pass). Asserting the
    // Spanish-specific phrasing ("ya está completo", "No queda trabajo")
    // catches that regression.
    writeFileSync(
      join(dir, DEFAULTS.PLAN_FILE),
      "# Plan\n\n- [x] Tarea uno\n- [x] Tarea dos\n",
    )

    const result = await runCli(["--lang", "es"], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("El plan ya está completo")
    expect(result.stderr).toContain("No queda trabajo para OCLoop")
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

// Phase 3 regression: "PLAN.md inexistente" must surface a clean errPlanNotFound
// (or errCannotReadFile, if exists() itself throws) at the CLI layer — no raw
// stack trace, no segfault, no unhandled promise rejection. The `fileExists`
// wrapper at index.tsx:41-53 catches any throw from `Bun.file().exists()` and
// prints errCannotReadFile, and `validatePrerequisites` (index.tsx:58-101)
// exits 1 with errPlanNotFound when exists() returns false. These tests pin
// both branches for the realistic "the file's not really there" shapes:
// a regular non-existent path (covered above), a path that points at an
// existing directory, and a path whose parent directory doesn't exist.
describe("CLI: PLAN.md inexistente — ramas de excepción en fileExists()", () => {
  it("exits 1 with errPlanNotFound when PLAN.md is actually a directory", async () => {
    // Edge case: the user has a folder named `PLAN.md` (or `--plan` points at
    // one). `Bun.file(<dir>).exists()` returns false on a directory (verified
    // in plan-parser.test.ts:1739-1747 EISDIR pattern), so the pre-flight
    // guard sees "not found" and rejects with errPlanNotFound. Without the
    // guard, the TUI would later call `Bun.file(<dir>).text()` and crash with
    // EISDIR; with the guard, we get a clean exit 1 with a clear message.
    mkdirSync(join(dir, DEFAULTS.PLAN_FILE))

    const result = await runCli(["--lang", "en"], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file not found")
    // Default --plan echoes the literal "PLAN.md" (the constant, not the
    // resolved cwd-prefixed path) — the actionable hint is "create a
    // PLAN.md in this folder", and the errPlanNotFound template surfaces
    // exactly that.
    expect(result.stderr).toContain(DEFAULTS.PLAN_FILE)
    expect(result.stdout).toBe("")

    // Plan step aborted at the existence check, so the prompt auto-create
    // (which would write `.loop-prompt.md`) must NOT have run.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })

  it("exits 1 with errPlanNotFound when PLAN.md is in a non-existent parent dir", async () => {
    // Edge case: --plan (or default) points into a subdirectory that was never
    // created. `Bun.file(<missing-parent>/x.md).exists()` returns false (the
    // OS reports ENOENT, which Bun normalizes to "not exists"), so the
    // pre-flight guard rejects with errPlanNotFound. Without the guard, the
    // TUI's `parsePlanFile` would crash with ENOENT inside `file.text()` and
    // bubble out as a bare "Fatal error:" in main().catch().
    const deepPath = join(dir, "does", "not", "exist", DEFAULTS.PLAN_FILE)

    const result = await runCli(["--lang", "en", "--plan", deepPath], {
      entrypoint: ENTRYPOINT,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Error: Plan file not found")
    // The deep path must be echoed verbatim — proves the guard uses the
    // exact `args.planFile` value, not a fallback to the default.
    expect(result.stderr).toContain(deepPath)
    expect(result.stdout).toBe("")

    // Plan step aborted at the existence check, so the prompt auto-create
    // must NOT have run.
    const promptFile = join(dir, DEFAULTS.PROMPT_FILE)
    expect(existsSync(promptFile)).toBe(false)
  })
})

// PLAN.md bug-hunt candidate #3: silent state loss on a non-writable cwd.
// Both `saveLoopState` (.loop-state.json) and the debug logger (.loop.log)
// swallow EACCES/EROFS/ENOSPC so a mid-loop ENOSPC or a stale read-only
// mount wouldn't crash the app — but it also means the user has no state
// to resume from after a crash. The fix is a boot-time pre-flight: probe
// the cwd with a single temp-write, exit 1 with a clear localized
// "working directory is not writable" if the probe fails, BEFORE any
// other pre-flight that might otherwise mislead the user (e.g. the
// prompt-file auto-create branch currently emits "Cannot create
// .loop-prompt.md" if cwd is unwritable — accurate but not actionable).
describe("CLI: cwd no escribible (boot pre-flight de estado silencioso)", () => {
  it.skipIf(
    process.platform === "win32" ||
      (typeof process.getuid === "function" && process.getuid() === 0),
  )("exits 1 with errCwdNotWritable when cwd is chmod 0o555 (read-only)", async () => {
    // Set up a valid PLAN.md. The write happens BEFORE chmod 0o555 so it
    // succeeds; the test then locks the dir to read+execute-only, which
    // blocks every subsequent write inside it (saveLoopState's rename,
    // debug-logger's appendFileSync, prompt auto-create's Bun.write).
    // Reads inside the dir still work, so the plan existence + content
    // checks would otherwise pass.
    writeFileSync(join(dir, DEFAULTS.PLAN_FILE), "- [ ] Only task\n")

    // Lock the cwd to 0o555. On POSIX this denies create/rename/unlink
    // inside the dir to the current user (root bypasses — see the
    // skipIf above, matching the chmod 0o555 pattern already used in
    // src/lib/loop-state-store.test.ts:78-97 for the same reason).
    chmodSync(dir, 0o555)
    try {
      const result = await runCli(["--lang", "en"], {
        entrypoint: ENTRYPOINT,
      })

      // Pre-fix: this used to fall through to the prompt auto-create
      // branch and exit 1 with "Cannot create .loop-prompt.md" — a
      // confusing message that points at the prompt file, not the real
      // problem (cwd is read-only). The fix surfaces the actionable
      // "working directory is not writable" with the path echoed so
      // the user can `cd` out or `chmod` back. The exact phrase is
      // asserted (not just "writable") to catch regressions that emit
      // a generic message.
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("working directory is not writable")
      // The path is echoed so the user can locate the bad cwd.
      expect(result.stderr).toContain(dir)
      // Pin the "this is the writable-pre-flight" exit, not the
      // prompt-auto-create error. A regression that removes the new
      // pre-flight would let the prompt branch fire instead, and this
      // assertion would catch it.
      expect(result.stderr).not.toContain("Cannot create .loop-prompt.md")
    } finally {
      // Restore so afterEach's rmSync can clean up the tempdir.
      chmodSync(dir, 0o755)
    }
  })
})
