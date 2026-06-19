#!/usr/bin/env bun

import { render } from "@opentui/solid"
import { createOpencodeServer } from "@opencode-ai/sdk/server"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { App } from "./App"
import { assertResponse, configureApiTimeouts, reconcileSession, sendPromptAsync, toSdkModel, type OpencodeClient, fetchMessages, extractLastAssistantText, countAssistantMessages, hasNewAssistantReply, type SessionMessage } from "./lib/api"
import { DEFAULTS, DEFAULT_PLAN_MODEL, DEFAULT_PLAN_AGENT } from "./lib/constants"
import { resolvePlanFile } from "./lib/plan-file"
import { parsePlan, isStructurallyComplete } from "./lib/plan-parser"
import type { CLIArgs } from "./types"
import { loadConfig, resolveResilience } from "./lib/config"
import { parseArgs, preScanLang } from "./lib/cli-args"
import { bar, titleBar, terminalCols } from "./lib/layout"
import { setLocale, isLocale, t } from "./lib/i18n"
import { log } from "./lib/debug-logger"
import { getIgnoredCreatePlanFlags } from "./lib/create-plan-warning"
import { randomBytes } from "node:crypto"
import { writeFile, unlink } from "node:fs/promises"

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
        message: err instanceof Error ? err.message : String(err),
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
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Validate that required files exist before starting
 */
async function validatePrerequisites(args: CLIArgs): Promise<void> {
  // Skip validation in debug mode
  if (args.debug) {
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
        message: err instanceof Error ? err.message : String(err),
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

  // Loop prompt file. When the DEFAULT path is missing, auto-create it with a
  // starter template (in the active language) so a fresh project just works. A
  // user-supplied --prompt path that's missing stays a hard error — they meant
  // that specific file.
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
            message: err instanceof Error ? err.message : String(err),
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


/** Strip a surrounding ```fence``` if the model wrapped its output in one. */
function stripCodeFences(text: string): string {
  const t = text.trim()
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return m ? m[1].trim() : t
}

/** Build the plan-generation prompt for a fresh goal (localized via i18n). */
function buildPlanPrompt(goal: string): string {
  return t("cpPrompt", { goal })
}

/** Build a refinement prompt given the previous plan and user feedback. */
function buildRefinePrompt(previousPlan: string, feedback: string): string {
  return t("cpRefine", { feedback, plan: previousPlan })
}

/**
 * Interactive plan generator (`--create-plan`).
 *
 * Headless CLI flow: asks what you want to build, uses zai-coding-plan/glm-5.2 + the `plan`
 * agent to draft a PLAN.md in OCLoop's format, shows it, and lets you approve,
 * refine, or cancel before writing the file. Runs instead of the TUI.
 */
async function runCreatePlan(args: CLIArgs): Promise<void> {
  const planPath = resolvePlanFile(args.planFile)
  const modelStr = args.model || DEFAULT_PLAN_MODEL
  const agent = args.agent || DEFAULT_PLAN_AGENT
  const model = toSdkModel(modelStr)

  // Resolve resilience for this headless run (App's onMount never runs here):
  // applies --resilience / config overrides to both the SDK call timeouts and
  // the overall plan-generation budget (planTimeoutMs).
  const resilience = resolveResilience(loadConfig().resilience, args.resilience)
  configureApiTimeouts(resilience)
  const planTimeoutMs = resilience.planTimeoutMs

  console.log(t("cpTitle"))
  console.log(
    t("cpConfig", { model: modelStr, note: model ? "" : t("cpModelNote"), agent }),
  )
  console.log("")

  const goal = prompt(t("cpAskGoal"))
  if (!goal || !goal.trim()) {
    console.error(t("cpNoGoal"))
    process.exit(1)
  }

  console.log("\n" + t("cpStartingServer"))
  let server: { url: string; close: () => void } | null = null
  try {
    server = await createOpencodeServer({ hostname: "127.0.0.1", port: args.port, timeout: 15000 })
    const client = createOpencodeClient({ baseUrl: server.url })

    const created = await client.session.create({})
    assertResponse(created, "create session")
    if (!created.data) {
      throw new Error(t("cpSessionFail"))
    }
    const sessionID = created.data.id

    let currentPrompt = buildPlanPrompt(goal.trim())
    let plan = ""

    for (;;) {
      console.log("\n" + t("cpGenerating"))

      // Kick off asynchronously and poll for completion. The synchronous
      // `session.prompt` holds ONE HTTP request open for the whole (multi-minute)
      // generation; on a long hold the connection drops and fetch throws. Doing
      // it async means only short requests, robust on every OS / shell.
      const assistantCountBefore = countAssistantMessages(
        await fetchMessages(client, sessionID),
      )
      await sendPromptAsync(
        client,
        { sessionID, agent, model, parts: [{ type: "text", text: currentPrompt }] },
        { timeoutMs: 30_000 },
      )

      const deadline = Date.now() + planTimeoutMs
      let messages: SessionMessage[] = []
      for (;;) {
        await Bun.sleep(1500)
        // reconcileSession never throws (it returns "unknown" on any error),
        // but fetchMessages can throw on a transient localhost blip — a 5xx
        // momentáneo, a GC pause in the opencode child, or assertResponse
        // failing on a half-formed reply. A generation can run up to
        // planTimeoutMs (default 10 min); aborting the whole run on a single
        // flaky poll would discard minutes of model work. Swallow the failure
        // for this tick and retry next interval; the deadline below is the
        // real backstop. Matches the resilience already built into
        // reconcileSession and the SSE reconnect path in the TUI.
        const verdict = await reconcileSession(client, sessionID)
        try {
          messages = await fetchMessages(client, sessionID)
        } catch (err) {
          log.warn("create-plan", "Transient fetchMessages failure, will retry", {
            message: err instanceof Error ? err.message : String(err),
          })
          if (Date.now() > deadline) {
            throw new Error(t("cpTimeout", { secs: Math.round(planTimeoutMs / 1000) }))
          }
          continue
        }
        // Done only when the session is idle AND a new non-empty assistant
        // reply landed. Counting assistant messages avoids mistaking the newly
        // added user prompt for a completed generation.
        if (
          (verdict === "idle" || verdict === "missing") &&
          hasNewAssistantReply(messages, assistantCountBefore)
        ) {
          break
        }
        if (Date.now() > deadline) {
          throw new Error(t("cpTimeout", { secs: Math.round(planTimeoutMs / 1000) }))
        }
      }

      const text = extractLastAssistantText(messages)
      if (!text) {
        console.error(t("cpNoContent"))
        process.exitCode = 1
        break
      }
      plan = stripCodeFences(text)

      const w = terminalCols()
      console.log("\n" + titleBar(t("cpProposedTitle"), w) + "\n")
      console.log(plan)
      console.log("\n" + bar(w))

      const choice = (prompt(t("cpAskApprove")) || "").trim().toLowerCase()

      // Accept both English and Spanish letters regardless of UI language.
      if (["y", "yes", "s", "si", "sí"].includes(choice)) {
        await Bun.write(planPath, plan.endsWith("\n") ? plan : plan + "\n")
        console.log(t("cpSaved", { path: planPath }))
        const planArg = planPath === DEFAULTS.PLAN_FILE ? "" : ` --plan ${planPath}`
        console.log(t("cpRunHint", { planArg }))
        break
      }
      if (["e", "edit", "editar"].includes(choice)) {
        const feedback = prompt(t("cpAskEdit"))
        if (!feedback || !feedback.trim()) {
          console.log(t("cpNoChanges"))
          continue
        }
        currentPrompt = buildRefinePrompt(plan, feedback.trim())
        continue
      }

      console.log(t("cpCancelled"))
      break
    }
  } catch (err) {
    console.error(
      t("cpError", { message: err instanceof Error ? err.message : String(err) }),
    )
    process.exitCode = 1
  } finally {
    try {
      server?.close()
    } catch {
      // ignore
    }
  }
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
  // disable mouse (1000/1002/1003 + SGR 1006/1015) · reset SGR · show cursor · leave alt-screen
  process.stdout.write(
    "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l\x1b[0m\x1b[?25h\x1b[?1049l",
  )
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

/**
 * Main entry point
 */
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
    await runCreatePlan(args)
    process.exit(process.exitCode ?? 0)
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
