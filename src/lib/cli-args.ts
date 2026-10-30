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
import { DEFAULT_RESILIENCE, RESILIENCE_MINS, type ResilienceConfig } from "./config"
import { isLocale, t } from "./i18n"
import { MAX_PARALLEL_JOBS, MIN_PARALLEL_JOBS } from "./task-scheduler"

export const VERSION = require("../../package.json").version
const PORT_RE = /^\d+$/
const NUM_RE = /^\d+$/
const MODEL_RE = /^[^\s/]+\/[^\s/]+$/

/**
 * Display version and exit
 */
export function showVersion(): void {
  console.log(`ocloop ${VERSION}`)
  process.exit(0)
}

const RESILIENCE_GROUPS: ReadonlyArray<
  readonly ["cliResilienceTimeouts" | "cliResilienceRates" | "cliResilienceSleep" | "cliResilienceWatchdog" | "cliResilienceLifecycle" | "cliResilienceStuck" | "cliResilienceSplit", readonly (keyof ResilienceConfig)[]]
> = [
  ["cliResilienceTimeouts", ["createTimeoutMs", "promptTimeoutMs", "abortTimeoutMs", "statusTimeoutMs", "pingTimeoutMs", "planTimeoutMs"]],
  ["cliResilienceRates", ["backoffBaseMs", "backoffMaxMs", "backoffJitter", "maxRateLimitRetries", "minIterationGapMs"]],
  ["cliResilienceSleep", ["sleepTickMs", "sleepThresholdMs", "caffeinate"]],
  ["cliResilienceWatchdog", ["watchdogTickMs", "watchdogSuspectMs", "watchdogConfirmMs", "maxRecoveryAttempts"]],
  ["cliResilienceLifecycle", ["resume", "chaos", "planDrift"]],
  ["cliResilienceStuck", ["noProgressThreshold"]],
  ["cliResilienceSplit", ["decomposeTimeoutMs"]],
]

/**
 * Display help message and exit
 */
export function showHelp(): void {
  const labelPad = Math.max(...RESILIENCE_GROUPS.map(([label]) => t(label).length))
  const resilienceKeys = RESILIENCE_GROUPS.map(
    ([label, keys]) =>
      `  ${t(label).padEnd(labelPad)}  ${keys
        .map((k) => `${k}=${DEFAULT_RESILIENCE[k]}`)
        .join(", ")}`,
  ).join("\n")

  console.log(t("cliHelp", { version: VERSION, resilienceKeys }))
  process.exit(0)
}

/**
 * Apply a single `key=value` resilience override onto a partial config.
 */
export function applyResilienceOverride(
  target: Partial<ResilienceConfig>,
  kv: string,
): void {
  const eq = kv.indexOf("=")
  if (eq < 0) {
    console.error(t("errResilienceNoEquals", { raw: kv }))
    process.exit(1)
  }
  const key = kv.slice(0, eq).trim()
  const raw = kv.slice(eq + 1).trim()

  if (!key) {
    console.error(t("errResilienceEmptyKey", { raw: kv }))
    process.exit(1)
  }

  if (!raw) {
    console.error(t("errResilienceEmptyValue", { key }))
    process.exit(1)
  }

  if (!(key in DEFAULT_RESILIENCE)) {
    console.error(t("errResilienceUnknownKey", { key, keys: Object.keys(DEFAULT_RESILIENCE).join(", ") }))
    process.exit(1)
  }

  const def = (DEFAULT_RESILIENCE as unknown as Record<string, unknown>)[key]
  if (key === "planDrift") {
    if (raw !== "warn" && raw !== "halt") {
      console.error(t("errResiliencePlanDrift", { raw }))
      process.exit(1)
    }
    ;(target as Record<string, unknown>)[key] = raw
    return
  }
  if (typeof def === "boolean") {
    if (raw !== "true" && raw !== "false" && raw !== "1" && raw !== "0") {
      console.error(t("errResilienceBool", { key, raw }))
      process.exit(1)
    }
    ;(target as Record<string, unknown>)[key] = raw === "true" || raw === "1"
  } else {
    if (!NUM_RE.test(raw)) {
      console.error(t("errResilienceInt", { key, raw }))
      process.exit(1)
    }
    const num = Number(raw)
    if (!Number.isSafeInteger(num) || num < 0) {
      console.error(t("errResilienceInt", { key, raw }))
      process.exit(1)
    }
    const min = RESILIENCE_MINS[key as keyof ResilienceConfig]
    if (min !== undefined && num < min) {
      console.error(t("errResilienceMin", { key, min, raw }))
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

function parseJobs(jobsStr: string | undefined): number {
  if (!jobsStr || !NUM_RE.test(jobsStr)) {
    console.error(t("errArgJobsInteger"))
    process.exit(1)
  }
  const jobs = Number(jobsStr)
  if (jobs < MIN_PARALLEL_JOBS || jobs > MAX_PARALLEL_JOBS) {
    console.error(t("errArgJobsRange"))
    process.exit(1)
  }
  return jobs
}

/**
 * Consume the next token as a flag's value.
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

export function preScanLang(argv: string[]): import("./i18n").Locale | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--lang" || a === "--language") {
      const v = argv[i + 1]
      if (v !== undefined && isLocale(v)) return v
      return undefined
    }
  }
  return undefined
}

function rejectDuplicateFlag(seen: Set<string>, flag: string): void {
  if (seen.has(flag)) {
    console.error(t("errArgDuplicate", { flag }))
    process.exit(1)
  }
  seen.add(flag)
}

export function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = {
    promptFile: DEFAULTS.PROMPT_FILE,
    planFile: DEFAULTS.PLAN_FILE,
  }

  const resilience: Partial<ResilienceConfig> = {}
  const seenValueFlags = new Set<string>()

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
      case "--port": {
        rejectDuplicateFlag(seenValueFlags, "--port")
        const portStr = argv[++i]
        args.port = parsePort(portStr)
        break
      }

      case "-j":
      case "--jobs": {
        rejectDuplicateFlag(seenValueFlags, "--jobs")
        const jobsStr = argv[++i]
        args.jobs = parseJobs(jobsStr)
        break
      }

      case "-m":
      case "--model":
        rejectDuplicateFlag(seenValueFlags, "--model")
        args.model = parseModel(argv[++i])
        break

      case "-a":
      case "--agent":
        rejectDuplicateFlag(seenValueFlags, "--agent")
        args.agent = requireValue(argv[++i], "--agent")
        break

      case "--prompt":
        rejectDuplicateFlag(seenValueFlags, "--prompt")
        args.promptFile = requireValue(argv[++i], "--prompt")
        break

      case "--plan":
        rejectDuplicateFlag(seenValueFlags, "--plan")
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
        rejectDuplicateFlag(seenValueFlags, "--lang")
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

      case "--resilience": {
        const kv = argv[++i]
        if (!kv) {
          console.error(t("errResilienceNeedsArg"))
          process.exit(1)
        }
        applyResilienceOverride(resilience, kv)
        break
      }

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
