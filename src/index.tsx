#!/usr/bin/env bun

import { render } from "@opentui/solid"
import { createOpencodeServer } from "@opencode-ai/sdk/server"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { App } from "./App"
import { DEFAULTS } from "./lib/constants"
import type { CLIArgs } from "./types"
import { loadConfig } from "./lib/config"
import { parseArgs } from "./lib/cli-args"
import { bar, titleBar, terminalCols } from "./lib/layout"
import { withTimeout } from "./lib/with-timeout"
import { setLocale, isLocale, t } from "./lib/i18n"
import { log } from "./lib/debug-logger"

/**
 * Defaults for the interactive plan generator (`--create-plan`).
 * Overridable with -m/--model and -a/--agent.
 */
const DEFAULT_PLAN_MODEL = "zai-coding-plan/glm-5.2"
const DEFAULT_PLAN_AGENT = "plan"
/** Plan generation can take a while; bound it so it can never hang forever. */
const PLAN_GEN_TIMEOUT_MS = 240_000

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

/** Parse a "provider/model" string into the SDK model param, or undefined. */
function parsePlanModel(
  model: string,
): { providerID: string; modelID: string } | undefined {
  const slash = model.indexOf("/")
  if (slash <= 0 || slash === model.length - 1) return undefined
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
}

/** Strip a surrounding ```fence``` if the model wrapped its output in one. */
function stripCodeFences(text: string): string {
  const t = text.trim()
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return m ? m[1].trim() : t
}

/** Extract the assistant's text from a session.prompt response. */
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
 * Headless CLI flow: asks what you want to build, uses glm-5.2 + the `plan`
 * agent to draft a PLAN.md in OCLoop's format, shows it, and lets you approve,
 * refine, or cancel before writing the file. Runs instead of the TUI.
 */
async function runCreatePlan(args: CLIArgs): Promise<void> {
  const planPath = args.planFile || DEFAULTS.PLAN_FILE
  const modelStr = args.model || DEFAULT_PLAN_MODEL
  const agent = args.agent || DEFAULT_PLAN_AGENT
  const model = parsePlanModel(modelStr)

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
    server = await createOpencodeServer({ hostname: "127.0.0.1", timeout: 15000 })
    const client = createOpencodeClient({ baseUrl: server.url })

    const created = await client.session.create({})
    if (!created.response.ok || !created.data) {
      throw new Error(t("cpSessionFail"))
    }
    const sessionID = created.data.id

    let currentPrompt = buildPlanPrompt(goal.trim())
    let plan = ""

    for (;;) {
      console.log("\n" + t("cpGenerating"))
      const res = await withTimeout(
        (signal) =>
          client.session.prompt(
            { sessionID, model, agent, parts: [{ type: "text", text: currentPrompt }] },
            { signal },
          ),
        PLAN_GEN_TIMEOUT_MS,
        "session.prompt",
      )
      if (!res.response.ok) {
        throw new Error(
          t("cpGenFail", {
            status: res.response.status,
            statusText: res.response.statusText,
          }),
        )
      }

      const text = extractPlanText(res.data as { parts?: Array<{ type?: string; text?: string }> })
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
 * Best-effort terminal restoration.
 *
 * OpenTUI restores the terminal on a clean exit, but a crash, an unhandled
 * rejection, or an error-path `process.exit()` would otherwise leave the
 * terminal in raw / alternate-screen / mouse-tracking mode — the classic
 * "garbage and leaked mouse sequences after the program dies" bug, identical on
 * macOS, Linux and Windows terminals. SIGKILL (e.g. an OOM kill) is uncatchable
 * so this can't cover that, but it covers every in-process exit path.
 *
 * The disable sequences are idempotent: emitting them when the modes are
 * already off is a harmless no-op, so running this after OpenTUI's own teardown
 * is safe. Guarded on isTTY so we never spew escape codes into a pipe/file.
 */
function restoreTerminal(): void {
  if (!process.stdout.isTTY) return
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

  // Render the application
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
