#!/usr/bin/env bun

import { render } from "@opentui/solid"
import { createOpencodeServer } from "@opencode-ai/sdk/server"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { App } from "./App"
import { assertResponse, configureApiTimeouts, reconcileSession, sendPromptAsync, toSdkModel, type OpencodeClient } from "./lib/api"
import { DEFAULTS } from "./lib/constants"
import type { CLIArgs } from "./types"
import { loadConfig, resolveResilience } from "./lib/config"
import { parseArgs } from "./lib/cli-args"
import { bar, titleBar, terminalCols } from "./lib/layout"
import { setLocale, isLocale, t } from "./lib/i18n"
import { log } from "./lib/debug-logger"
import { getIgnoredCreatePlanFlags } from "./lib/create-plan-warning"

/**
 * Defaults for the interactive plan generator (`--create-plan`).
 * Overridable with -m/--model and -a/--agent.
 */
const DEFAULT_PLAN_MODEL = "zai-coding-plan/glm-5.2"
const DEFAULT_PLAN_AGENT = "plan"
// Plan-generation budget is configurable via `resilience.planTimeoutMs`
// (default in DEFAULT_RESILIENCE); resolved per-run in runCreatePlan.

/**
 * Validate that required files exist before starting
 */
async function validatePrerequisites(args: CLIArgs): Promise<void> {
  // Skip validation in debug mode
  if (args.debug) {
    return
  }

  // Check PLAN.md exists
  const planFile = Bun.file(args.planFile)
  const planExists = await planFile.exists()
  if (!planExists) {
    console.error(t("errPlanNotFound", { path: args.planFile }))
    process.exit(1)
  }

  // Loop prompt file. When the DEFAULT path is missing, auto-create it with a
  // starter template (in the active language) so a fresh project just works. A
  // user-supplied --prompt path that's missing stays a hard error — they meant
  // that specific file.
  const promptFile = Bun.file(args.promptFile)
  const promptExists = await promptFile.exists()
  if (!promptExists) {
    if (args.promptFile === DEFAULTS.PROMPT_FILE) {
      await Bun.write(args.promptFile, t("defaultLoopPrompt"))
      console.log(t("promptCreated", { path: args.promptFile }))
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

/** Extract the assistant's text from a message's parts. */
function extractPlanText(
  data: { parts?: Array<{ type?: string; text?: string }> } | undefined,
): string {
  if (!data?.parts) return ""
  return data.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim()
}

/** One session message (info + parts) as returned by `session.messages`. */
type SessionMessage = {
  info?: { role?: string }
  parts?: Array<{ type?: string; text?: string }>
}

/** Fetch a session's messages, surfacing transport/HTTP errors consistently. */
async function fetchMessages(
  client: OpencodeClient,
  sessionID: string,
): Promise<SessionMessage[]> {
  const res = await client.session.messages({ sessionID })
  assertResponse(res, "read plan messages")
  return (res.data ?? []) as SessionMessage[]
}

/** Text of the most recent assistant message (the model's latest reply). */
function extractLastAssistantText(messages: SessionMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.info?.role === "assistant") return extractPlanText(messages[i])
  }
  return ""
}

/** Count assistant messages in a session snapshot. */
function countAssistantMessages(messages: SessionMessage[]): number {
  return messages.filter((message) => message.info?.role === "assistant").length
}

/** True once a new, non-empty assistant reply has landed after the prompt. */
function hasNewAssistantReply(
  messages: SessionMessage[],
  assistantCountBefore: number,
): boolean {
  return (
    countAssistantMessages(messages) > assistantCountBefore &&
    extractLastAssistantText(messages).length > 0
  )
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
  const planPath = args.planFile || DEFAULTS.PLAN_FILE
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
        const verdict = await reconcileSession(client, sessionID)
        messages = await fetchMessages(client, sessionID)
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
      console.error(
        `Note: --create-plan ignores: ${ignored.join(", ")}. ` +
          `These flags only affect the TUI loop, which does not start in plan-generator mode.`,
      )
    }
    await runCreatePlan(args)
    process.exit(process.exitCode ?? 0)
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

  // Log plan file status
  const planPath = args.planFile || DEFAULTS.PLAN_FILE
  const planFileExists = await Bun.file(planPath).exists()
  log.info("startup", "Plan file check", { path: planPath, exists: planFileExists })

  // Validate prerequisites before rendering
  await validatePrerequisites(args)

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
  process.exit(1)
})
