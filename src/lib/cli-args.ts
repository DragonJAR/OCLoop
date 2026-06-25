/**
 * CLI argument parsing for OCLoop.
 *
 * Extracted from index.tsx so it can be unit-tested in isolation (importing
 * index.tsx would execute `main()` and render the TUI). Behavior is identical:
 * `--help`/`--version` print and exit(0); invalid arguments print to stderr and
 * exit(1); everything else fills a CLIArgs object.
 *
 * ## CLI surface (the authoritative reference)
 *
 * The `parseArgs` switch below is the source of truth for every flag OCLoop
 * accepts. `showHelp` is generated from the same set; the user-facing
 * `README.md` table mirrors it. Keep all three in sync.
 *
 * ### Entry point
 * - Source: `src/index.tsx` (the only file with the `#!/usr/bin/env bun` shebang).
 * - Built binary: `dist/index.js` (Bun bundler + `@opentui/solid` plugin).
 * - Bin name: `ocloop` (see `package.json` `"bin"`).
 *
 * ### Execution modes (decided in `src/index.tsx: main()`)
 * 1. **Help / version** — `-h` / `--help` / `-v` / `--version` print to stdout
 *    and `exit(0)`. Never start the opencode server or the TUI; the
 *    `tuiStarted` flag stays `false` so `restoreTerminal` is a no-op.
 * 2. **Plan generator** — `-c` / `--create-plan` runs `runCreatePlan(args)`
 *    headlessly: spawns an embedded opencode server, drives the `plan` agent
 *    with `zai-coding-plan/glm-5.2` (overridable via `-m` / `-a`), shows the
 *    proposed `PLAN.md`, and writes it on approval. TUI is never started.
 * 3. **TUI loop (default)** — calls `validatePrerequisites` (skipped in
 *    `--debug`) then `render(() => <App {...args} />)`. The same render
 *    call backs both normal and debug TUI; `--debug` only changes the
 *    reducer branch (`server_ready_debug` → `state.type === "debug"`) and
 *    skips plan-file reads.
 *
 * ### Precedence at runtime
 * `DEFAULT_RESILIENCE` / `DEFAULTS.PLAN_FILE` / `DEFAULTS.PROMPT_FILE`
 *   < `ocloop.json` (loaded by `loadConfig`)
 *   < CLI flags (output of `parseArgs`).
 *
 * The CLIArgs type is the post-parse shape; the resilience overrides are
 * collected as a `Partial<ResilienceConfig>` and re-merged in `App.onMount`.
 */

import { DEFAULTS } from "./constants"
import type { CLIArgs } from "../types"
import { DEFAULT_RESILIENCE, type ResilienceConfig } from "./config"
import { isLocale, t } from "./i18n"

// Read version from package.json (repo root, two levels up from src/lib).
// require() is a CommonJS primitive in this ESM-first project, but it works
// because Bun's runtime resolves CJS in ESM-mode projects (no ERR_REQUIRE_ESM)
// and the bundler inlines package.json into a __commonJS wrapper for the
// published binary, so the bundled output has no runtime FS dependency.
// If the project ever formalizes strict ESM (module: nodenext +
// verbatimModuleSyntax: true), swap to:
//   import { createRequire } from "node:module"
//   const _require = createRequire(import.meta.url)
//   const VERSION = _require("../../package.json").version
// Exported so other surfaces (e.g. the About dialog) reuse this single read
// instead of re-importing package.json — keeps the version source DRY.
export const VERSION = require("../../package.json").version
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
 * Ordered grouping of the `--resilience` keys for {@link showHelp}, mirroring the
 * phase grouping of `ResilienceConfig` in config.ts. Only the labels/order live
 * here; each key's DEFAULT is read from `DEFAULT_RESILIENCE` at render time (DRY).
 * Typed as `keyof ResilienceConfig`, so a renamed/removed key fails to compile;
 * a test (cli-args.test.ts) guards against an ADDED key being forgotten here.
 */
const RESILIENCE_GROUPS: ReadonlyArray<
  readonly [string, readonly (keyof ResilienceConfig)[]]
> = [
  ["Timeouts (ms)", ["createTimeoutMs", "promptTimeoutMs", "abortTimeoutMs", "statusTimeoutMs", "pingTimeoutMs", "planTimeoutMs"]],
  ["Rate limits", ["backoffBaseMs", "backoffMaxMs", "backoffJitter", "maxRateLimitRetries", "minIterationGapMs"]],
  ["Sleep/suspend", ["sleepTickMs", "sleepThresholdMs", "caffeinate"]],
  ["Watchdog", ["watchdogTickMs", "watchdogSuspectMs", "watchdogConfirmMs", "maxRecoveryAttempts"]],
  ["Lifecycle", ["resume", "chaos"]],
  ["Stuck-task halt", ["noProgressThreshold"]],
  ["Stalled-task split", ["decomposeTimeoutMs"]],
]

/**
 * Display help message and exit
 */
export function showHelp(): void {
  // Enumerate the --resilience keys (grouped) with their live defaults from
  // DEFAULT_RESILIENCE so they're discoverable from the CLI, not just the README.
  const labelPad = Math.max(...RESILIENCE_GROUPS.map(([label]) => label.length))
  const resilienceKeys = RESILIENCE_GROUPS.map(
    ([label, keys]) =>
      `  ${label.padEnd(labelPad)}  ${keys
        .map((k) => `${k}=${DEFAULT_RESILIENCE[k]}`)
        .join(", ")}`,
  ).join("\n")

  console.log(`
ocloop ${VERSION}

Usage: ocloop [options]

OCLoop is a loop harness that orchestrates opencode to execute tasks from a
PLAN.md file iteratively. Each iteration runs in an isolated session, with
the opencode TUI embedded and visible throughout.

Getting started:
  First time here? Generate a plan interactively, then start the loop:
    ocloop --create-plan
    ocloop                 # then press [S] to begin (or: ocloop -r to auto-start)

  Tip: press Ctrl+P in the TUI for the command palette; --lang es switches the UI to Spanish.

Options:
  -p, --port <number>      OpenCode server port (if omitted, opencode picks 4096 or a random free port)
  -m, --model <provider/model> Model to use (for example openai/gpt-5)
  -a, --agent <string>     Agent to use (passed to opencode)
  -r, --run                Start iterations immediately (default: wait for [S])
  -c, --create-plan        Interactively generate PLAN.md (model zai-coding-plan/glm-5.2, agent plan)
  -d, --debug              Debug/sandbox mode (no plan file validation, manual sessions)
  --verbose                Enable verbose logging (keyboard events, etc.)
  --routing                Show the model-routing panel at startup (assign models to heavy/cheap/judge roles)
  --prompt <path>          Path to loop prompt file (default: ${DEFAULTS.PROMPT_FILE})
  --plan <path>            Path to plan file (default: ${DEFAULTS.PLAN_FILE})
  --lang <en|es>           UI language (default: en; also settable in Ctrl+P; --language is an alias)
  --resume                 Reconcile a persisted in-flight session on startup
  --no-caffeinate          Do not keep the system awake while running (macOS)
  --chaos                  Enable chaos fault-injection (debug only)
  --resilience <key=value> Override a resilience threshold (repeatable; keys + defaults below)
  -v, --version            Show version number
  -h, --help               Show help

Resilience keys (--resilience <key>=<value>, repeatable; defaults shown):
${resilienceKeys}

Config file (~/.config/ocloop/ocloop.json): also sets evals, theme, terminal, scrollbar_visible — see README.

Examples:
  ocloop                           # Start, wait for [S] to begin
  ocloop --create-plan             # Generate a PLAN.md interactively, then exit
  ocloop -r                        # Start iterations immediately
  ocloop -m opencode/claude-sonnet-4 # Use specific provider/model
  ocloop -a plan                   # Use specific agent
  ocloop --plan my-plan.md         # Use custom plan file
  ocloop --lang es                 # Run the UI in Spanish
  ocloop -c && ocloop -r           # Generate a plan, then auto-start
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
    console.error(t("errArgPortInteger"))
    process.exit(1)
  }
  const port = Number(portStr)
  if (port < 0 || port > 65535) {
    console.error(t("errArgPortRange"))
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
    console.error(t("errArgValueRequired", { flag }))
    process.exit(1)
  }
  return value
}

function parseModel(model: string | undefined): string {
  if (!model) {
    console.error(t("errArgModelArg"))
    process.exit(1)
  }
  if (!MODEL_RE.test(model)) {
    console.error(t("errArgModelFormat", { model }))
    process.exit(1)
  }
  return model
}

/**
 * Lightweight pre-scan for `--lang`/`--language` so the locale can be resolved
 * BEFORE {@link parseArgs} runs. argparse errors are localized, but parseArgs
 * itself runs before setLocale() in main() — without this pre-scan, a user who
 * passes `--lang es` would still get every argparse error (including the
 * `--lang` error itself) in English.
 *
 * Returns the locale value if `--lang <locale>` (or `--language <locale>`) is
 * present and valid, else undefined. Does NOT validate the rest of argv, does
 * NOT error on anything else — it's a best-effort peek, not a parser.
 */
export function preScanLang(argv: string[]): import("./i18n").Locale | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--lang" || a === "--language") {
      const v = argv[i + 1]
      if (v !== undefined && isLocale(v)) return v
      return undefined // present but invalid/missing — let parseArgs error properly
    }
  }
  return undefined
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

      case "--routing":
        args.routing = true
        break

      case "--lang":
      case "--language": {
        const lang = requireValue(argv[++i], "--lang")
        if (!isLocale(lang)) {
          console.error(t("errArgLang"))
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
        console.error(t("errArgUnknown", { arg }))
        process.exit(1)
    }
  }

  if (Object.keys(resilience).length > 0) {
    args.resilience = resilience
  }

  return args
}
