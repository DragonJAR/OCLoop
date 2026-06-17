/**
 * CLI argument parsing for OCLoop.
 *
 * Extracted from index.tsx so it can be unit-tested in isolation (importing
 * index.tsx would execute `main()` and render the TUI). Behavior is identical:
 * `--help`/`--version` print and exit(0); invalid arguments print to stderr and
 * exit(1); everything else fills a CLIArgs object.
 */

import { DEFAULTS } from "./constants"
import type { CLIArgs } from "../types"
import { DEFAULT_RESILIENCE, type ResilienceConfig } from "./config"
import { isLocale } from "./i18n"

// Read version from package.json (repo root, two levels up from src/lib).
// ponytail: `require()` is a CommonJS primitive in this ESM-first project
// (`package.json` has `"type": "module"`, `tsconfig.json` has `"module": "ESNext"`).
// It works today because Bun's runtime resolves CJS in ESM-mode projects
// (no `ERR_REQUIRE_ESM`) and the bundler inlines `package.json` into a
// `__commonJS` wrapper for the published binary, so the bundled output has
// no runtime filesystem dependency. Source: MEJORAS.md Finding 17.8.B. If
// the project ever formalizes strict ESM (`"module": "nodenext"` +
// `"verbatimModuleSyntax": true`), swap to:
//   import { createRequire } from "node:module"
//   const _require = createRequire(import.meta.url)
//   const VERSION = _require("../../package.json").version
const VERSION = require("../../package.json").version
const PORT_RE = /^\d+$/
// ponytail: decimal-only strictness mirrors PORT_RE; Number(raw) alone accepts
// scientific (1e3), hex (0x10), decimal-as-integer (1.0), and leading sign (+5)
// which diverges from --port and silently misreads copied-pasted values.
const NUM_RE = /^\d+$/
const MODEL_RE = /^[^\s/]+\/[^\s/]+$/

/**
 * Display version and exit
 */
export function showVersion(): void {
  console.log(`ocloop ${VERSION}`)
  process.exit(0)
}

/**
 * Display help message and exit
 */
export function showHelp(): void {
  console.log(`
ocloop ${VERSION}

Usage: ocloop [options]

OCLoop is a loop harness that orchestrates opencode to execute tasks from a
PLAN.md file iteratively. Each iteration runs in an isolated session, with
the opencode TUI embedded and visible throughout.

Options:
  -p, --port <number>      Server port (opencode defaults: try 4096, then random)
  -m, --model <provider/model> Model to use (for example openai/gpt-5)
  -a, --agent <string>     Agent to use (passed to opencode)
  -r, --run                Start iterations immediately (default: wait for [S])
  -c, --create-plan        Interactively generate PLAN.md (model zai-coding-plan/glm-5.2, agent plan)
  -d, --debug              Debug/sandbox mode (no plan file validation, manual sessions)
  --verbose                Enable verbose logging (keyboard events, etc.)
  --prompt <path>          Path to loop prompt file (default: ${DEFAULTS.PROMPT_FILE})
  --plan <path>            Path to plan file (default: ${DEFAULTS.PLAN_FILE})
  --lang <en|es>           UI language (default: en; also settable in Ctrl+P)
  --resume                 Reconcile a persisted in-flight session on startup
  --no-caffeinate          Do not keep the system awake while running (macOS)
  --chaos                  Enable chaos fault-injection (debug only)
  --resilience <key=value> Override a resilience threshold (repeatable)
  -v, --version            Show version number
  -h, --help               Show help

Examples:
  ocloop                           # Start, wait for [S] to begin
  ocloop --create-plan             # Generate a PLAN.md interactively, then exit
  ocloop -r                        # Start iterations immediately
  ocloop -m opencode/claude-sonnet-4 # Use specific provider/model
  ocloop -a plan                   # Use specific agent
  ocloop --plan my-plan.md         # Use custom plan file
`)
  process.exit(0)
}

/**
 * Apply a single `key=value` resilience override onto a partial config.
 * Validates the key against DEFAULT_RESILIENCE and coerces to the right type.
 */
export function applyResilienceOverride(
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

  if (!key) {
    console.error(`Error: --resilience key is empty in "${kv}"`)
    process.exit(1)
  }

  if (!raw) {
    console.error(`Error: --resilience ${key} requires a non-empty value`)
    process.exit(1)
  }

  if (!(key in DEFAULT_RESILIENCE)) {
    console.error(`Error: unknown resilience key "${key}"`)
    console.error(`Valid keys: ${Object.keys(DEFAULT_RESILIENCE).join(", ")}`)
    process.exit(1)
  }

  const def = (DEFAULT_RESILIENCE as unknown as Record<string, unknown>)[key]
  if (typeof def === "boolean") {
    if (raw !== "true" && raw !== "false" && raw !== "1" && raw !== "0") {
      console.error(`Error: --resilience ${key} expects a boolean (true/false/1/0), got "${raw}"`)
      process.exit(1)
    }
    ;(target as Record<string, unknown>)[key] = raw === "true" || raw === "1"
  } else {
    if (!NUM_RE.test(raw)) {
      console.error(
        `Error: --resilience ${key} expects a non-negative integer (decimal only), got "${raw}"`,
      )
      process.exit(1)
    }
    const num = Number(raw)
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) {
      console.error(`Error: --resilience ${key} expects a non-negative integer, got "${raw}"`)
      process.exit(1)
    }
    ;(target as Record<string, unknown>)[key] = num
  }
}

function parsePort(portStr: string | undefined): number {
  if (!portStr || !PORT_RE.test(portStr)) {
    console.error("Error: --port requires a full integer argument")
    process.exit(1)
  }
  const port = Number(portStr)
  if (port < 0 || port > 65535) {
    console.error("Error: --port must be in TCP range 0..65535")
    process.exit(1)
  }
  return port
}

/**
 * Consume the next token as a flag's value. Errors if it's missing OR looks like
 * another flag (starts with `-`, except a lone `-`), so `--prompt --debug` fails
 * loudly instead of setting promptFile to "--debug" and silently dropping --debug.
 */
function requireValue(value: string | undefined, flag: string): string {
  if (
    !value ||
    value.trim() === "" ||
    (value.startsWith("-") && value !== "-")
  ) {
    console.error(`Error: ${flag} requires a value`)
    process.exit(1)
  }
  return value
}

function parseModel(model: string | undefined): string {
  if (!model) {
    console.error("Error: --model requires an argument")
    process.exit(1)
  }
  if (!MODEL_RE.test(model)) {
    console.error(
      `Error: --model expects provider/model (for example openai/gpt-5), got "${model}"`,
    )
    process.exit(1)
  }
  return model
}

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[]): CLIArgs {
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
        args.port = parsePort(portStr)
        break

      case "-m":
      case "--model":
        args.model = parseModel(argv[++i])
        break

      case "-a":
      case "--agent":
        args.agent = requireValue(argv[++i], "--agent")
        break

      case "--prompt":
        args.promptFile = requireValue(argv[++i], "--prompt")
        break

      case "--plan":
        args.planFile = requireValue(argv[++i], "--plan")
        break

      case "-r":
      case "--run":
        args.run = true
        break

      case "-d":
      case "--debug":
        args.debug = true
        break

      case "-c":
      case "--create-plan":
        args.createPlan = true
        break

      case "--verbose":
        args.verbose = true
        break

      case "--lang":
      case "--language": {
        const lang = requireValue(argv[++i], "--lang")
        if (!isLocale(lang)) {
          console.error("Error: --lang requires 'en' or 'es'")
          process.exit(1)
        }
        args.lang = lang
        break
      }

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
        console.error(`Error: unknown argument "${arg}"`)
        process.exit(1)
    }
  }

  if (Object.keys(resilience).length > 0) {
    args.resilience = resilience
  }

  return args
}
