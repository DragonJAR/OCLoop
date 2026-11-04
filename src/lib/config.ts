/**
 * Configuration file management for OCLoop
 *
 * Handles loading, saving, and validating configuration from
 * ~/.config/ocloop/ocloop.json (or XDG_CONFIG_HOME equivalent).
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { atomicWriteTextSync, cleanupDeterministicTmp } from "./atomic-fs"
import { log } from "./debug-logger"
import { isLocale } from "./i18n"
import { MAX_PARALLEL_JOBS, MIN_PARALLEL_JOBS } from "./task-scheduler"

export interface KnownTerminalConfig {
  type: "known"
  name: string
}

export interface CustomTerminalConfig {
  type: "custom"
  command: string
  args: string
}

export type TerminalConfig = KnownTerminalConfig | CustomTerminalConfig

export interface ResilienceConfig {
  // --- Phase 0: SDK call timeouts ---
  createTimeoutMs: number
  promptTimeoutMs: number
  abortTimeoutMs: number
  statusTimeoutMs: number
  pingTimeoutMs: number
  planTimeoutMs: number

  // --- Phase 1: rate-limit handling ---
  backoffBaseMs: number
  backoffMaxMs: number
  backoffJitter: boolean
  maxRateLimitRetries: number
  minIterationGapMs: number

  // --- Phase 2: sleep / suspension detection ---
  sleepTickMs: number
  sleepThresholdMs: number
  caffeinate: boolean

  // --- Phase 4: watchdog ---
  watchdogTickMs: number
  watchdogSuspectMs: number
  watchdogConfirmMs: number
  maxRecoveryAttempts: number

  // --- Phase 5/6: lifecycle ---
  resume: boolean
  chaos: boolean

  // --- Phase 7: no-progress halt ---
  noProgressThreshold: number

  // --- Phase 8: stalled-task split (decompose) ---
  decomposeTimeoutMs: number

  // --- Plan drift between iterations ---
  planDrift: "warn" | "halt"
}

export const DEFAULT_RESILIENCE: ResilienceConfig = {
  createTimeoutMs: 600_000,
  promptTimeoutMs: 600_000,
  abortTimeoutMs: 10_000,
  statusTimeoutMs: 600_000,
  pingTimeoutMs: 600_000,
  planTimeoutMs: 1_200_000,

  backoffBaseMs: 1_000,
  backoffMaxMs: 60_000,
  backoffJitter: true,
  maxRateLimitRetries: 8,
  minIterationGapMs: 0,

  sleepTickMs: 5_000,
  sleepThresholdMs: 30_000,
  caffeinate: true,

  watchdogTickMs: 15_000,
  watchdogSuspectMs: 90_000,
  watchdogConfirmMs: 1_800_000,
  maxRecoveryAttempts: 3,

  resume: false,
  chaos: false,

  noProgressThreshold: 3,

  decomposeTimeoutMs: 900_000,

  planDrift: "warn",
}

export interface EvalConfig {
  enabled: boolean
  judgeModel?: string
  maxEvalRetries: number
  judgeTimeoutMs: number
  judgeRetries: number
}

export const DEFAULT_EVALS: EvalConfig = {
  enabled: false,
  maxEvalRetries: 1,
  judgeTimeoutMs: 600_000,
  judgeRetries: 1,
}

export const PERMISSION_TOOLS = [
  "edit",
  "bash",
  "webfetch",
  "doom_loop",
  "external_directory",
] as const

export type PermissionTool = (typeof PERMISSION_TOOLS)[number]

export type PermissionsConfig = Record<PermissionTool, boolean>

export const DEFAULT_PERMISSIONS: PermissionsConfig = {
  edit: true,
  bash: true,
  webfetch: true,
  doom_loop: true,
  external_directory: true,
}

export interface OcloopConfig {
  terminal?: TerminalConfig
  scrollbar_visible?: boolean
  theme?: string
  language?: import("./i18n").Locale
  /** Optional number of concurrent agent workers (1..4). Defaults to 1. */
  jobs?: number
  resilience?: Partial<ResilienceConfig>
  evals?: Partial<EvalConfig>
  permissions?: Partial<PermissionsConfig>
}

export function isNonNegativeInteger(v: unknown): boolean {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0
}

export const RESILIENCE_MINS: Partial<Record<keyof ResilienceConfig, number>> = {
  noProgressThreshold: 1,
}

export function isValidResilienceValue(key: string, v: unknown): boolean {
  if (!(key in DEFAULT_RESILIENCE)) return false
  if (key === "planDrift") return v === "warn" || v === "halt"
  const def = (DEFAULT_RESILIENCE as unknown as Record<string, unknown>)[key]
  if (typeof def === "boolean") return typeof v === "boolean"
  if (typeof def === "string") return typeof v === "string" && v === def
  if (typeof def === "number") {
    if (!isNonNegativeInteger(v)) return false
    const min = RESILIENCE_MINS[key as keyof ResilienceConfig]
    return min === undefined || (v as number) >= min
  }
  return false
}

export function resolveResilience(
  fileConfig?: Partial<ResilienceConfig>,
  cliOverrides?: Partial<ResilienceConfig>,
): ResilienceConfig {
  const pickDefined = <T extends object>(obj?: T): Partial<T> => {
    if (!obj || Array.isArray(obj)) return {}
    return Object.fromEntries(
      Object.entries(obj).filter(
        ([k, v]) => isValidResilienceValue(k, v),
      ),
    ) as Partial<T>
  }
  return {
    ...DEFAULT_RESILIENCE,
    ...pickDefined(fileConfig),
    ...pickDefined(cliOverrides),
  }
}

/**
 * Directory holding the user-level config file.
 *
 * - Windows: `%APPDATA%\ocloop` (`C:\Users\<u>\AppData\Roaming\ocloop`) is
 *   where Windows applications are expected to keep per-user settings.
 *   `XDG_CONFIG_HOME` still wins when it is set: it is an explicit override
 *   (WSL, Git Bash, scoop), not a guess.
 * - Everything else: `$XDG_CONFIG_HOME/ocloop`, falling back to
 *   `~/.config/ocloop`.
 *
 * The platform is injectable so the Windows branch can be tested from any
 * host.
 */
export function getConfigDir(platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") {
    const appData = process.env.APPDATA
    if (appData) {
      return join(appData, "ocloop")
    }
  }
  const xdgConfigHome = process.env.XDG_CONFIG_HOME
  if (xdgConfigHome) {
    return join(xdgConfigHome, "ocloop")
  }
  return join(homedir(), ".config", "ocloop")
}

export function getConfigPath(): string {
  return join(getConfigDir(), "ocloop.json")
}

const ALLOWED_CONFIG_KEYS = new Set([
  "terminal",
  "scrollbar_visible",
  "theme",
  "language",
  "jobs",
  "resilience",
  "evals",
  "permissions",
])

function isValidEvalsValue(key: string, v: unknown): boolean {
  if (key === "judgeModel") return typeof v === "string" && v.trim().length > 0
  if (!(key in DEFAULT_EVALS)) return false
  const def = (DEFAULT_EVALS as unknown as Record<string, unknown>)[key]
  if (typeof def === "boolean") return typeof v === "boolean"
  if (typeof def === "number") {
    return isNonNegativeInteger(v)
  }
  return false
}

function isValidPermissionsValue(key: string, v: unknown): boolean {
  return key in DEFAULT_PERMISSIONS && typeof v === "boolean"
}

function validateConfigShape(raw: unknown): OcloopConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    log.warn("config", "Config file did not contain a JSON object, using default", raw)
    return {}
  }
  const r = raw as Record<string, unknown>
  const out: OcloopConfig = {}

  if ("terminal" in r) {
    if (hasTerminalConfig(r as unknown as OcloopConfig)) {
      out.terminal = (r as unknown as OcloopConfig).terminal
    } else {
      log.warn("config", "Ignoring malformed 'terminal' field", r.terminal)
    }
  }
  if ("language" in r) {
    if (typeof r.language === "string" && isLocale(r.language)) {
      out.language = r.language
    } else {
      log.warn("config", "Ignoring malformed 'language' field", r.language)
    }
  }
  if ("theme" in r) {
    if (typeof r.theme === "string" && r.theme.trim().length > 0) {
      out.theme = r.theme.trim()
    } else {
      log.warn("config", "Ignoring malformed 'theme' field", r.theme)
    }
  }
  if ("scrollbar_visible" in r) {
    if (typeof r.scrollbar_visible === "boolean") {
      out.scrollbar_visible = r.scrollbar_visible
    } else {
      log.warn("config", "Ignoring malformed 'scrollbar_visible' field", r.scrollbar_visible)
    }
  }
  if ("jobs" in r) {
    if (
      isNonNegativeInteger(r.jobs) &&
      (r.jobs as number) >= MIN_PARALLEL_JOBS &&
      (r.jobs as number) <= MAX_PARALLEL_JOBS
    ) {
      out.jobs = r.jobs as number
    } else {
      log.warn("config", "Ignoring malformed 'jobs' field", r.jobs)
    }
  }
  if ("resilience" in r) {
    if (typeof r.resilience !== "object" || r.resilience === null || Array.isArray(r.resilience)) {
      log.warn("config", "Ignoring malformed 'resilience' field", r.resilience)
    } else {
      const entries = Object.entries(r.resilience as Record<string, unknown>)
      const invalid = entries.filter(([k, v]) => !isValidResilienceValue(k, v))
      if (invalid.length > 0) {
        log.warn(
          "config",
          `Ignoring 'resilience' block — contains ${invalid.length} invalid field(s)`,
          invalid.map(([k, v]) => ({ key: k, value: v })),
        )
      } else {
        out.resilience = r.resilience as Partial<ResilienceConfig>
      }
    }
  }
  if ("evals" in r) {
    if (typeof r.evals !== "object" || r.evals === null || Array.isArray(r.evals)) {
      log.warn("config", "Ignoring malformed 'evals' field", r.evals)
    } else {
      const entries = Object.entries(r.evals as Record<string, unknown>)
      const invalid = entries.filter(([k, v]) => !isValidEvalsValue(k, v))
      if (invalid.length > 0) {
        log.warn(
          "config",
          `Ignoring 'evals' block — contains ${invalid.length} invalid field(s)`,
          invalid.map(([k, v]) => ({ key: k, value: v })),
        )
      } else {
        out.evals = r.evals as Partial<EvalConfig>
      }
    }
  }
  if ("permissions" in r) {
    if (typeof r.permissions !== "object" || r.permissions === null || Array.isArray(r.permissions)) {
      log.warn("config", "Ignoring malformed 'permissions' field", r.permissions)
    } else {
      const entries = Object.entries(r.permissions as Record<string, unknown>)
      const invalid = entries.filter(([k, v]) => !isValidPermissionsValue(k, v))
      if (invalid.length > 0) {
        log.warn(
          "config",
          `Ignoring 'permissions' block — contains ${invalid.length} invalid field(s)`,
          invalid.map(([k, v]) => ({ key: k, value: v })),
        )
      } else {
        out.permissions = r.permissions as Partial<PermissionsConfig>
      }
    }
  }

  const unknown = Object.keys(r).filter((k) => !ALLOWED_CONFIG_KEYS.has(k))
  if (unknown.length > 0) {
    log.warn("config", `Unknown config keys ignored: ${unknown.join(", ")}`, unknown)
  }

  return out
}

let cachedConfig: OcloopConfig | null = null

export function __resetConfigCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") return
  cachedConfig = null
}

export function loadConfig(): OcloopConfig {
  if (cachedConfig) return cachedConfig

  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    log.debug("config", "No config file found, using default")
    cachedConfig = {}
    return cachedConfig
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(content)
    const validated = validateConfigShape(parsed)
    log.info("config", "Loaded config", validated)
    cachedConfig = validated
    return validated
  } catch (err) {
    log.warn("config", "Failed to load config, using default", err)
    cachedConfig = {}
    return {}
  }
}

export function saveConfig(config: OcloopConfig): boolean {
  const configPath = getConfigPath()

  try {
    atomicWriteTextSync(configPath, JSON.stringify(config, null, 2) + "\n")
    cachedConfig = config
    log.info("config", "Saved config", config)
    return true
  } catch (err) {
    log.warn("config", "Failed to save config", err)
    cleanupDeterministicTmp(configPath)
    return false
  }
}

export function hasTerminalConfig(
  config: OcloopConfig,
): config is OcloopConfig & { terminal: TerminalConfig } {
  if (!config.terminal) {
    return false
  }

  const terminal = config.terminal

  if (terminal.type === "known") {
    return typeof terminal.name === "string" && terminal.name.trim().length > 0
  }

  if (terminal.type === "custom") {
    return (
      typeof terminal.command === "string" &&
      terminal.command.trim().length > 0 &&
      typeof terminal.args === "string" &&
      terminal.args.trim().length > 0
    )
  }

  return false
}
