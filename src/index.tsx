#!/usr/bin/env bun

import { render } from "@opentui/solid"
import { startOpencodeServer } from "./lib/opencode-server"
import { isPortAvailable } from "./lib/port"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { App } from "./App"
import {
  assertResponse,
  configureApiTimeouts,
  toSdkModel,
  reconcileSession,
  sendPromptAsync,
  fetchMessages,
} from "./lib/api"
import { DEFAULTS, DEFAULT_PLAN_MODEL, DEFAULT_PLAN_AGENT } from "./lib/constants"
import { resolvePlanFile } from "./lib/plan-file"
import { parsePlan, isStructurallyComplete } from "./lib/plan-parser"
import { runCreatePlanFlow } from "./lib/create-plan-flow"
import type { CLIArgs } from "./types"
import { loadConfig, resolveResilience } from "./lib/config"
import { parseArgs, preScanLang } from "./lib/cli-args"
import { bar, titleBar, terminalCols } from "./lib/layout"
import { setLocale, isLocale, t } from "./lib/i18n"
import { log } from "./lib/debug-logger"
import { toErrorMessage } from "./lib/format"
import { monotonicNow } from "./lib/clock"
import { getIgnoredCreatePlanFlags } from "./lib/create-plan-warning"
import { randomBytes } from "node:crypto"
import { writeFile, unlink } from "node:fs/promises"
import { TERMINAL_RESTORE_SEQUENCE } from "./lib/terminal-restore"
import { ensureWindowsConsoleReady } from "./lib/windows-console"

// DEFAULT_PLAN_MODEL / DEFAULT_PLAN_AGENT now live in ./lib/constants (shared
// with the stalled-task split in App.tsx). Plan-generation budget is
// configurable via `resilience.planTimeoutMs` (default in DEFAULT_RESILIENCE);
// resolved per-run in runCreatePlan.

/**
 * Check a file's existence, printing a localized error and exiting 1 if the
 * Bun.file().exists() call itself throws (EACCES/ENOENT/EISDIR). Without this
 * wrapper the failure would escape to main().catch() as a bare "Fatal error:
 * <stack>" — a confusing UX for a permission-denied or stale-mount case.
 * process.exit(1) is `never`, so the Promise<boolean> return type holds.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    return await Bun.file(path).exists()
  } catch (err) {
    console.error(
      t("errCannotReadFile", {
        path,
        message: toErrorMessage(err),
      }),
    )
    process.exit(1)
  }
}

/**
 * Boot pre-flight: verify process.cwd() is writable with a single probe write
 * of a uniquely-named temp file. The temp name is random (6 bytes → 12 hex) so
 * two ocloop processes on the same cwd never collide on the probe. The probe is
 * unlinked on the success path, so there is no on-disk residue.
 *
 * Why a pre-flight: saveLoopState and the debug logger swallow EACCES/EROFS/
 * ENOSPC for in-loop resilience — a hot-loop ENOSPC or a stale read-only mount
 * shouldn't crash the app, but the user then has no state to resume from after
 * a crash, silently. Catching the unwritable case at boot gives actionable
 * feedback (chmod, change cwd, fix the mount) instead of a confusing downstream
 * "Cannot create .loop-prompt.md" or a resume-broken state.
 */
async function preflightCwdWritable(): Promise<{ ok: true } | { ok: false; message: string }> {
  const probe = `.ocloop-write-probe.${randomBytes(6).toString("hex")}.tmp`
  try {
    await writeFile(probe, "", "utf-8")
    // Best-effort cleanup. The next run will overwrite the probe if
    // unlink fails (e.g. on a directory whose permission we lost
    // mid-flight, which can't happen here because we just successfully
    // wrote to it).
    try {
      await unlink(probe)
    } catch {
      // ignore
    }
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: toErrorMessage(err),
    }
  }
}

/**
 * Ensure the loop prompt file exists. When the DEFAULT path is missing, auto-
 * create it with a starter template (in the active language) so a fresh project
 * just works. A user-supplied --prompt path that's missing stays a hard error —
 * they meant that specific file.
 *
 * Extracted so both validatePrerequisites and the --create-plan "save & run"
 * path can guarantee the prompt before the TUI starts. validatePrerequisites
 * early-returns under --debug, so save & run (run=true) cannot rely on it alone
 * — without this the first auto-run iteration fails with "Prompt file not found".
 */
async function ensureLoopPrompt(args: CLIArgs): Promise<void> {
  const promptExists = await fileExists(args.promptFile)
  if (!promptExists) {
    if (args.promptFile === DEFAULTS.PROMPT_FILE) {
      // Bun.write() can reject on EACCES/EROFS/ENOENT/ENOSPC/EISDIR; wrap so the
      // rejection doesn't escape to main().catch() as a raw stack trace. Mirrors
      // the errPlanNotFound / errPromptNotFound pattern.
      try {
        await Bun.write(args.promptFile, t("defaultLoopPrompt"))
        console.log(t("promptCreated", { path: args.promptFile }))
      } catch (err) {
        console.error(
          t("errCannotCreatePrompt", {
            path: args.promptFile,
            message: toErrorMessage(err),
          }),
        )
        process.exit(1)
      }
    } else {
      console.error(t("errPromptNotFound", { path: args.promptFile }))
      process.exit(1)
    }
  }
}

async function validatePrerequisites(args: CLIArgs): Promise<void> {
  // Debug skips the PLAN.md checks (it runs without a real plan), but still
  // ensure the loop prompt exists: it's read on every iteration, so a debug run
  // that actually loops (S / --run) would otherwise hit "Prompt file not found".
  if (args.debug) {
    await ensureLoopPrompt(args)
    return
  }

  // Check PLAN.md exists
  const planExists = await fileExists(args.planFile)
  if (!planExists) {
    console.error(t("errPlanNotFound", { path: args.planFile }))
    process.exit(1)
  }

  // Check PLAN.md has at least one task. A 0-byte / whitespace-only / headings-
  // only file collapses to parsePlan(...).total === 0 — nothing actionable.
  // The pre-flight exits 1 with a localized "add a task" message instead of
  // segfaulting the non-TTY render path or opening a dashboard that immediately
  // reports "no tasks". try/catch covers the TOCTOU window between the existence
  // check above and this read (a file readable a moment ago can lose perms or
  // vanish on a stale mount); the raw rejection would otherwise escape to
  // main().catch() as a bare "Fatal error: <stack>".
  let planContent: string
  try {
    planContent = await Bun.file(args.planFile).text()
  } catch (err) {
    console.error(
      t("errCannotReadFile", {
        path: args.planFile,
        message: toErrorMessage(err),
      }),
    )
    process.exit(1)
  }
  // Parse the plan once and reuse it for the empty / complete checks below —
  // both branches need the same `parsePlan(content)` result, so call it once
  // and pass the value forward. Single source of truth for the plan stats in
  // this pre-flight.
  const planProgress = parsePlan(planContent)
  if (planProgress.total === 0) {
    console.error(t("errPlanEmpty", { path: args.planFile }))
    process.exit(1)
  }

  // Structural completion: PLAN.md HAS tasks but NONE are automatable (every
  // task is `[x]`, `[MANUAL]`, or `[BLOCKED]`). This is matrix case 51's
  // pre-flight sibling of `errPlanEmpty`: the plan is in a "done" state, not
  // a broken one, so we exit 0 (success) with a clear localized message —
  // mirroring how `App.tsx:checkPlanComplete` (line 724-752) handles the same
  // case from inside the TUI (it shows the completion dialog). Reuses the
  // `planProgress` parsed above — no second `parsePlan(planContent)` call
  // (the same plan file is read once and parsed once for both checks).
  // Exit 0 instead of 1: a CI script that runs `ocloop` after each commit
  // and gates on `$?` doesn't need a special case for "all done"; it's the
  // same success signal as "nothing went wrong". The pre-flight is read-only
  // — we do NOT write the `<plan-complete>` tag here. The TUI's
  // `checkPlanComplete` is the single owner of that mutation (so the
  // completion dialog can run); writing the tag in two places would risk a
  // TOCTOU between the pre-flight and the TUI's first `checkPlanComplete`
  // call. The check sits BEFORE the prompt auto-create so a completed plan
  // doesn't drag in a default `.loop-prompt.md` the user didn't ask for.
  // Source: PLAN.md Phase 3 task 4 (matrix case 51).
  if (isStructurallyComplete(planProgress)) {
    console.error(t("errPlanComplete", { path: args.planFile }))
    process.exit(0)
  }

  // Loop prompt file: auto-create the default when missing (shared helper, also
  // used by the --create-plan "save & run" path).
  await ensureLoopPrompt(args)
}


/**
 * Interactive plan generator (`--create-plan`).
 *
 * Headless CLI flow: asks what you want to build, uses zai-coding-plan/glm-5.2 + the `plan`
 * agent to draft a PLAN.md in OCLoop's format, shows it, and lets you approve,
 * refine, save & run, or cancel before writing the file. Runs instead of the
 * TUI. Returns true only when the user chose "save & run", so the caller boots
 * the TUI with run=true instead of exiting.
 *
 * The flow logic lives in src/lib/create-plan-flow.ts (runCreatePlanFlow),
 * extracted so the timeout/choices/poll branches are unit-testable. This
 * wrapper owns the four I/O seams the flow needs (server spawn + client, the
 * global prompt(), Bun.write, Bun.sleep/Date.now), maps the CreatePlanOutcome
 * to process exit semantics, and renders the title/proposed-plan chrome. The
 * flow itself never calls process.exit.
 */
async function runCreatePlan(args: CLIArgs): Promise<boolean> {
  const planPath = resolvePlanFile(args.planFile)
  const modelStr = args.model || DEFAULT_PLAN_MODEL
  const agent = args.agent || DEFAULT_PLAN_AGENT

  // Resolve resilience for this headless run (App's onMount never runs here):
  // applies --resilience / config overrides to both the SDK call timeouts and
  // the overall plan-generation budget (planTimeoutMs).
  const resilience = resolveResilience(loadConfig().resilience, args.resilience)
  configureApiTimeouts(resilience)
  const planTimeoutMs = resilience.planTimeoutMs

  // toSdkModel here is only for the "invalid model" notice (no provider/model
  // slash → undefined → show the caveat). The flow itself takes the raw string
  // and sendPromptAsync re-runs toSdkModel, so we do NOT pre-convert for it
  // (that was a redundant double-conversion and a type mismatch: CreatePlanFlowDeps.model
  // is string|undefined, not the PromptModel object).
  const modelNote = toSdkModel(modelStr) ? "" : t("cpModelNote")
  console.log(t("cpTitle"))
  console.log(
    t("cpConfig", { model: modelStr, note: modelNote, agent }),
  )
  console.log("")
  console.log(t("cpAskGoal"))

  // Read the goal BEFORE spawning the server, so the server log doesn't
  // interrupt the goal prompt and we don't hold a port while the user thinks.
  const goalLines: string[] = []
  for (;;) {
    const line = prompt("> ")
    if (line === null || line.trim() === ".") break
    goalLines.push(line)
  }
  const goal = goalLines.join("\n").trim()
  if (!goal) {
    console.error(t("cpNoGoal"))
    process.exit(1)
  }

  // Omitted --port → 0: opencode/the OS picks a free port (same as the TUI's
  // launch(port ?? 0)). An explicit --port is pre-checked here, because a busy
  // port makes opencode die with an opaque "ServeError: Unexpected error" that
  // we can't tell apart from any other failure.
  const port = args.port ?? 0
  if (port !== 0 && !(await isPortAvailable(port, "127.0.0.1"))) {
    console.error(t("cpPortBusy", { port: String(port) }))
    process.exitCode = 1
    return false
  }

  console.log("\n" + t("cpStartingServer"))
  let server: { url: string; close: () => void } | null = null
  try {
    server = await startOpencodeServer({
      hostname: "127.0.0.1",
      port,
      timeout: 15000,
    })
    const client = createOpencodeClient({ baseUrl: server.url })
    const created = await client.session.create({})
    assertResponse(created, "create session")
    if (!created.data) throw new Error(t("cpSessionFail"))
    const sessionID = created.data.id

    // Delegate the poll/choices flow to runCreatePlanFlow. The four I/O seams
    // are wired to the real primitives; the outcome maps back to exit semantics.
    const outcome = await runCreatePlanFlow({
      client,
      createSessionID: async () => sessionID,
      onClose: () => {
        try {
          server?.close()
        } catch {
          // ignore
        }
      },
      planPath,
      model: modelStr,
      agent,
      planTimeoutMs,
      // SDK call seams: wire to the real api.ts implementations.
      sendPrompt: (c, params, opts) =>
        sendPromptAsync(c, params, opts).then(() => undefined),
      reconcile: (c, sid) => reconcileSession(c, sid),
      fetchMessages: (c, sid) => fetchMessages(c, sid),
      readGoal: () => goal, // already collected above
      readChoice: () => (prompt(t("cpAskApprove")) || ""),
      readEditFeedback: () => prompt(t("cpAskEdit")),
      writePlan: async (path, content) => {
        await Bun.write(path, content)
      },
      sleep: (ms) => Bun.sleep(ms),
      // Monotonic clock for the plan-generation deadline: a generation can run
      // for several minutes, so a wall-clock `Date.now()` would fire the timeout
      // early (or late) on an NTP correction or system suspend. Mirrors
      // one-shot-agent.ts (REPARAR.md B5). Tests inject a fake `now` anyway.
      now: () => monotonicNow(),
      emit: (line) => {
        // Wrap the proposed plan with the title bar chrome; pass other lines
        // through verbatim.
        if (line === "\n") {
          console.log("")
          return
        }
        console.log(line)
      },
    })

    // Map the outcome to exit semantics.
    if (outcome.type === "saved") {
      if (outcome.runAfter) return true
      const planArg = planPath === DEFAULTS.PLAN_FILE ? "" : ` --plan ${planPath}`
      console.log(t("cpRunHint", { planArg }))
      return false
    }
    if (outcome.type === "cancelled") {
      return false
    }
    // no-content / timeout / error → exit 1 (no-content/timeout were already
    // surfaced via emit; the error case needs the cpError wrapper).
    if (outcome.type === "error") {
      console.error(t("cpError", { message: outcome.message }))
    }
    process.exitCode = 1
    return false
  } catch (err) {
    console.error(
      t("cpError", { message: toErrorMessage(err) }),
    )
    process.exitCode = 1
  } finally {
    try {
      server?.close()
    } catch {
      // ignore
    }
  }
  return false
}

/**
 * Set to true only once the TUI render starts (i.e. once mouse tracking and the
 * alternate screen are actually enabled). The quick paths — `--help`,
 * `--version`, `--create-plan` — never set it, so they never need restoration.
 */
let tuiStarted = false

/**
 * Best-effort terminal restoration.
 *
 * OpenTUI restores the terminal on a clean exit, but a crash, an unhandled
 * rejection, or an error-path `process.exit()` would otherwise leave the
 * terminal in raw / alternate-screen / mouse-tracking mode — the classic
 * "garbage and leaked mouse sequences after the program dies" bug, identical on
 * macOS, Linux and Windows terminals. SIGKILL (e.g. an OOM kill) is uncatchable
 * so this can't cover that, but it covers every in-process exit path.
 *
 * Gated on `tuiStarted`: emitting the disable sequences (esp. `?1049l`, leave
 * alternate screen) when the TUI never ran makes some terminals (e.g.
 * Terminal.app) visibly switch/refresh the screen buffer — so `--help` and
 * friends must NOT touch terminal modes they never enabled. Also guarded on
 * isTTY so we never spew escape codes into a pipe/file.
 */
function restoreTerminal(): void {
  if (!tuiStarted || !process.stdout.isTTY) return
  process.stdout.write(TERMINAL_RESTORE_SEQUENCE)
}

process.on("exit", restoreTerminal)
process.on("uncaughtException", (err) => {
  restoreTerminal()
  console.error("Uncaught exception:", err)
  process.exit(1)
})
process.on("unhandledRejection", (reason) => {
  restoreTerminal()
  console.error("Unhandled rejection:", reason)
  process.exit(1)
})

async function main(): Promise<void> {
  // Pre-scan --lang/--language so argparse errors localize correctly. Without
  // this, a user passing `--lang es` still gets every parseArgs error
  // (including the `--lang` error itself) in English, because parseArgs ran
  // before setLocale. The full resolution (CLI > config > default) happens
  // below; here we only need the CLI value to seed the locale early.
  const cliLang = preScanLang(process.argv.slice(2))
  if (cliLang) setLocale(cliLang)

  // Parse command line arguments
  const args = parseArgs(process.argv.slice(2))

  // Resolve UI language: CLI --lang > ocloop.json language > English default.
  // Done before any output/render so all strings localize from the start.
  const cfgLang = loadConfig().language
  setLocale(isLocale(args.lang) ? args.lang : isLocale(cfgLang) ? cfgLang : "en")

  // Interactive plan generator: runs instead of the TUI and exits. Force the
  // exit so the embedded OpenCode server child can't keep the process alive.
  if (args.createPlan) {
    // Warn about TUI-only flags that will be silently ignored in plan-gen mode
    // (Finding 1.7.A). Non-fatal: user can `2>/dev/null` it away.
    const ignored = getIgnoredCreatePlanFlags(args)
    if (ignored.length > 0) {
      console.error(t("cpIgnoredFlags", { flags: ignored.join(", ") }))
    }
    // "Save & run" returns true: fall through to the TUI with run=true (the
    // generator's OpenCode server is already closed in its finally). Otherwise
    // the generator is terminal — exit so its server child can't outlive us.
    const runAfter = await runCreatePlan(args)
    if (!runAfter) {
      process.exit(process.exitCode ?? 0)
    }
    args.run = true
  }

  // Boot pre-flight: cwd must be writable. The state store and the debug
  // logger both silently swallow write errors (a hot-loop ENOSPC or a
  // stale read-only mount shouldn't crash the app), but a user who lost
  // write access has no state to resume from after a crash. Catching the
  // unwritable case HERE, with a clean localized error, gives the user
  // actionable feedback (chmod, change cwd, fix the mount) before any
  // side-effects run — log.sessionStart, plan-file checks, the prompt
  // auto-create. Sits AFTER the --create-plan branch above because
  // --create-plan can write to a custom `--plan` path that is independent
  // of cwd; the writable-cwd check is for the TUI's state/log/prompt
  // files, not for arbitrary custom paths the user passes in.
  const writable = await preflightCwdWritable()
  if (!writable.ok) {
    console.error(t("errCwdNotWritable", { path: process.cwd(), message: writable.message }))
    process.exit(1)
  }

  // Initialize logging
  log.sessionStart({ debug: !!args.debug, cwd: process.cwd(), model: args.model })
  
  log.info("startup", "CLI arguments", { 
    plan: args.planFile, 
    prompt: args.promptFile, 
    debug: args.debug, 
    run: args.run,
    model: args.model,
    agent: args.agent
  })

  // Log plan file status. Use the safe `fileExists()` wrapper (not a raw
  // `Bun.file().exists()`) so a failing stat — EACCES/ENOENT on a missing
  // parent dir, EISDIR, a stale mount — surfaces a localized error instead of
  // escaping to `main().catch()` as a bare "Fatal error: <stack>". The very
  // next call (`validatePrerequisites`) already uses this wrapper for the same
  // reason; consistency + DRY.
  const planPath = resolvePlanFile(args.planFile)
  const planFileExists = await fileExists(planPath)
  log.info("startup", "Plan file check", { path: planPath, exists: planFileExists })

  // Validate prerequisites before rendering
  await validatePrerequisites(args)

  // Reject non-TTY environments before reaching OpenTUI's render(). Without
  // this guard, any invocation where stdin/stdout is not a real terminal (pipes,
  // redirects, CI runners, editor subprocesses, bun:test) segfaults Bun inside
  // render() or hangs on a closed stdin. The check sits after validatePrerequisites
  // so the PLAN.md / .loop-prompt.md checks still run (the auto-create prompt
  // side effect is preserved), and before tuiStarted = true so the exit handler
  // skips its terminal-mode restore. The --create-plan path never reaches here.
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.error(t("errNoTty"))
    process.exit(1)
  }

  if (!ensureWindowsConsoleReady()) {
    console.error(t("errWinConsole"))
    process.exit(1)
  }

  // Render the application. From here the TUI owns mouse + alternate screen, so
  // mark it started: the exit-time restore must run for this path (and only this
  // path) — quick CLI paths above never enabled those modes.
  tuiStarted = true
  // The render function returns when the app exits
  await render(() => <App {...args} />, {
    targetFps: 60,
    exitOnCtrlC: false, // We handle Ctrl+C ourselves
    useMouse: true,
  })
}

// Run main and handle errors
main().catch((error) => {
  console.error("Fatal error:", error)
  // Explicit restoreTerminal mirrors the handlers above; the process.on("exit")
  // backstop also covers this, but the explicit form keeps every exit path
  // grep-friendly and self-documenting.
  restoreTerminal()
  process.exit(1)
})
