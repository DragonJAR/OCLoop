#!/usr/bin/env bun

import { render } from "@opentui/solid"
import { App } from "./App"
import { DEFAULTS } from "./lib/constants"
import type { CLIArgs } from "./types"
import { DEFAULT_RESILIENCE, type ResilienceConfig } from "./lib/config"
import { log } from "./lib/debug-logger"

// Read version from package.json at build time
const VERSION = require("../package.json").version

/**
 * Display version and exit
 */
function showVersion(): void {
  console.log(`ocloop ${VERSION}`)
  process.exit(0)
}

/**
 * Display help message and exit
 */
function showHelp(): void {
  console.log(`
ocloop ${VERSION}

Usage: ocloop [options]

OCLoop is a loop harness that orchestrates opencode to execute tasks from a
PLAN.md file iteratively. Each iteration runs in an isolated session, with
the opencode TUI embedded and visible throughout.

Options:
  -p, --port <number>      Server port (opencode defaults: try 4096, then random)
  -m, --model <string>     Model to use (passed to opencode)
  -a, --agent <string>     Agent to use (passed to opencode)
  -r, --run                Start iterations immediately (default: wait for [S])
  -d, --debug              Debug/sandbox mode (no plan file validation, manual sessions)
  --verbose                Enable verbose logging (keyboard events, etc.)
  --prompt <path>          Path to loop prompt file (default: ${DEFAULTS.PROMPT_FILE})
  --plan <path>            Path to plan file (default: ${DEFAULTS.PLAN_FILE})
  --resume                 Reconcile a persisted in-flight session on startup
  --no-caffeinate          Do not keep the system awake while running (macOS)
  --chaos                  Enable chaos fault-injection (debug only)
  --resilience <key=value> Override a resilience threshold (repeatable)
  -v, --version            Show version number
  -h, --help               Show help

Examples:
  ocloop                           # Start, wait for [S] to begin
  ocloop -r                        # Start iterations immediately
  ocloop -m claude-sonnet-4        # Use specific model
  ocloop -a plan                   # Use specific agent
  ocloop --plan my-plan.md         # Use custom plan file
`)
  process.exit(0)
}

/**
 * Apply a single `key=value` resilience override onto a partial config.
 * Validates the key against DEFAULT_RESILIENCE and coerces to the right type.
 */
function applyResilienceOverride(
  target: Partial<ResilienceConfig>,
  kv: string,
): void {
  const eq = kv.indexOf("=")
  if (eq < 0) {
    console.error(`Error: --resilience expects key=value, got "${kv}"`)
    process.exit(1)
  }
  const key = kv.slice(0, eq).trim()
  const raw = kv.slice(eq + 1).trim()

  if (!(key in DEFAULT_RESILIENCE)) {
    console.error(`Error: unknown resilience key "${key}"`)
    console.error(`Valid keys: ${Object.keys(DEFAULT_RESILIENCE).join(", ")}`)
    process.exit(1)
  }

  const def = (DEFAULT_RESILIENCE as unknown as Record<string, unknown>)[key]
  if (typeof def === "boolean") {
    ;(target as Record<string, unknown>)[key] = raw === "true" || raw === "1"
  } else {
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      console.error(`Error: --resilience ${key} expects a number, got "${raw}"`)
      process.exit(1)
    }
    ;(target as Record<string, unknown>)[key] = num
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {
    promptFile: DEFAULTS.PROMPT_FILE,
    planFile: DEFAULTS.PLAN_FILE,
  }

  const resilience: Partial<ResilienceConfig> = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    switch (arg) {
      case "-h":
      case "--help":
        showHelp()
        break

      case "-v":
      case "--version":
        showVersion()
        break

      case "-p":
      case "--port":
        const portStr = argv[++i]
        if (!portStr || isNaN(parseInt(portStr, 10))) {
          console.error("Error: --port requires a numeric argument")
          process.exit(1)
        }
        args.port = parseInt(portStr, 10)
        break

      case "-m":
      case "--model":
        const model = argv[++i]
        if (!model) {
          console.error("Error: --model requires an argument")
          process.exit(1)
        }
        args.model = model
        break

      case "-a":
      case "--agent":
        const agent = argv[++i]
        if (!agent) {
          console.error("Error: --agent requires an argument")
          process.exit(1)
        }
        args.agent = agent
        break

      case "--prompt":
        const promptPath = argv[++i]
        if (!promptPath) {
          console.error("Error: --prompt requires a file path argument")
          process.exit(1)
        }
        args.promptFile = promptPath
        break

      case "--plan":
        const planPath = argv[++i]
        if (!planPath) {
          console.error("Error: --plan requires a file path argument")
          process.exit(1)
        }
        args.planFile = planPath
        break

      case "-r":
      case "--run":
        args.run = true
        break

      case "-d":
      case "--debug":
        args.debug = true
        break

      case "--verbose":
        args.verbose = true
        break

      case "--resume":
        resilience.resume = true
        break

      case "--no-caffeinate":
        resilience.caffeinate = false
        break

      case "--chaos":
        resilience.chaos = true
        break

      case "--resilience":
        const kv = argv[++i]
        if (!kv) {
          console.error("Error: --resilience requires a key=value argument")
          process.exit(1)
        }
        applyResilienceOverride(resilience, kv)
        break

      default:
        // Unknown argument - ignore for now (could warn)
        break
    }
  }

  if (Object.keys(resilience).length > 0) {
    args.resilience = resilience
  }

  return args
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
  const planFile = Bun.file(args.planFile)
  const planExists = await planFile.exists()
  if (!planExists) {
    console.error(`Error: Plan file not found: ${args.planFile}`)
    console.error("")
    console.error(`OCLoop requires a plan file (default: ${DEFAULTS.PLAN_FILE}).`)
    console.error(`Create a ${args.planFile} file with a task list, for example:`)
    console.error("")
    console.error("  ## Backlog")
    console.error("  - [ ] Task one description")
    console.error("  - [ ] Task two description")
    console.error("")
    process.exit(1)
  }

  // Check loop prompt file exists
  const promptFile = Bun.file(args.promptFile)
  const promptExists = await promptFile.exists()
  if (!promptExists) {
    console.error(`Error: Prompt file not found: ${args.promptFile}`)
    console.error("")
    console.error(`OCLoop requires a prompt file (default: ${DEFAULTS.PROMPT_FILE}).`)
    console.error("This file contains the prompt sent to opencode for each iteration.")
    console.error("")
    console.error("Create a prompt file with instructions for executing plan tasks.")
    console.error("")
    process.exit(1)
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = parseArgs(process.argv.slice(2))

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
