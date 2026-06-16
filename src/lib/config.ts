/**
 * Configuration file management for OCLoop
 *
 * Handles loading, saving, and validating configuration from
 * ~/.config/ocloop/ocloop.json (or XDG_CONFIG_HOME equivalent).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { log } from "./debug-logger"

/**
 * Terminal configuration for a known terminal emulator
 */
export interface KnownTerminalConfig {
  type: "known"
  name: string // Name of the known terminal (e.g., "alacritty", "kitty")
}

/**
 * Terminal configuration for a custom terminal emulator
 */
export interface CustomTerminalConfig {
  type: "custom"
  command: string // The command to run (e.g., "my-terminal")
  args: string // Args pattern with {cmd} placeholder (e.g., "-e {cmd}")
}

/**
 * Terminal configuration union type
 */
export type TerminalConfig = KnownTerminalConfig | CustomTerminalConfig

/**
 * Resilience thresholds — the single source of truth for every timeout,
 * watchdog window, backoff parameter and recovery limit used across OCLoop.
 *
 * Resolution order (lowest to highest precedence):
 *   DEFAULT_RESILIENCE  <  ~/.config/ocloop/ocloop.json `resilience`  <  CLI flags
 *
 * All durations are milliseconds. A timeout of `0` disables that timeout (see
 * `withTimeout`).
 */
export interface ResilienceConfig {
  // --- Phase 0: SDK call timeouts ---
  /** Timeout for session.create (ms). */
  createTimeoutMs: number
  /** Timeout for session.promptAsync (ms). */
  promptTimeoutMs: number
  /** Timeout for session.abort (ms). */
  abortTimeoutMs: number
  /** Timeout for session.status reconciliation (ms). */
  statusTimeoutMs: number
  /** Timeout for the lightweight server health ping (ms). */
  pingTimeoutMs: number
  /**
   * Overall budget for `--create-plan` to finish generating a plan (ms). The
   * generator polls until the model is done; raise this for big/slow plans.
   * Override via `--resilience planTimeoutMs=<ms>` or the config file.
   */
  planTimeoutMs: number

  // --- Phase 1: rate-limit handling ---
  /** Base delay for exponential backoff (ms). */
  backoffBaseMs: number
  /** Maximum backoff delay cap (ms). */
  backoffMaxMs: number
  /** Whether to apply full jitter to backoff. */
  backoffJitter: boolean
  /** Consecutive rate-limit retries before giving up to a recoverable error. */
  maxRateLimitRetries: number
  /** Minimum spacing enforced between iterations (ms); 0 disables. */
  minIterationGapMs: number

  // --- Phase 2: sleep / suspension detection ---
  /** How often the sleep detector samples the wall clock (ms). */
  sleepTickMs: number
  /** Wall-clock gap beyond the tick that counts as a suspend/resume (ms). */
  sleepThresholdMs: number
  /** Keep the system awake with `caffeinate` while running (macOS only). */
  caffeinate: boolean

  // --- Phase 4: watchdog ---
  /** Watchdog evaluation interval (ms). */
  watchdogTickMs: number
  /** No heartbeat for this long → SUSPECT and begin confirming (T1, ms). */
  watchdogSuspectMs: number
  /**
   * No heartbeat for this long with a "working" session → wedged (T2, ms).
   * This is also the hard ceiling for a single silent operation: a tool that
   * emits no SSE events for longer than this (a long build, test suite, install
   * or download) is indistinguishable from a real wedge and gets aborted+retried.
   * Raise it for workloads with long, output-free tools.
   */
  watchdogConfirmMs: number
  /** Recovery attempts per iteration before escalating to a recoverable error. */
  maxRecoveryAttempts: number

  // --- Phase 5/6: lifecycle ---
  /** Reconcile a persisted in-flight session on startup instead of starting fresh. */
  resume: boolean
  /** Enable the chaos fault-injection module (debug only). */
  chaos: boolean
}

/**
 * Sensible defaults for every resilience threshold.
 */
export const DEFAULT_RESILIENCE: ResilienceConfig = {
  createTimeoutMs: 15_000,
  promptTimeoutMs: 30_000,
  abortTimeoutMs: 15_000,
  statusTimeoutMs: 15_000,
  pingTimeoutMs: 5_000,
  planTimeoutMs: 600_000,

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
  watchdogConfirmMs: 600_000,
  maxRecoveryAttempts: 3,

  resume: false,
  chaos: false,
}

/**
 * OCLoop configuration file structure
 */
export interface OcloopConfig {
  terminal?: TerminalConfig
  scrollbar_visible?: boolean
  /**
   * Theme name override for the OCLoop GUI. Defaults to the DragonJAR brand
   * theme. Set to any bundled theme id (e.g. "opencode", "dracula") to change it.
   */
  theme?: string
  /** UI language. Defaults to English; "es" for Spanish. */
  language?: import("./i18n").Locale
  /** Optional persisted resilience overrides (partial; merged over defaults). */
  resilience?: Partial<ResilienceConfig>
}

/**
 * Merge resilience config from defaults, the config file, and CLI overrides.
 *
 * `undefined` values in either override layer are ignored so a partially
 * specified file or a flagless run inherits the lower layer.
 */
export function resolveResilience(
  fileConfig?: Partial<ResilienceConfig>,
  cliOverrides?: Partial<ResilienceConfig>,
): ResilienceConfig {
  const pickDefined = <T extends object>(obj?: T): Partial<T> => {
    if (!obj) return {}
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as Partial<T>
  }
  return {
    ...DEFAULT_RESILIENCE,
    ...pickDefined(fileConfig),
    ...pickDefined(cliOverrides),
  }
}

/**
 * Get the configuration directory path.
 * Uses $XDG_CONFIG_HOME/ocloop if set, otherwise ~/.config/ocloop
 */
export function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME
  if (xdgConfigHome) {
    return join(xdgConfigHome, "ocloop")
  }
  return join(homedir(), ".config", "ocloop")
}

/**
 * Get the full path to the configuration file.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), "ocloop.json")
}

/**
 * Load and parse the configuration file.
 * Returns an empty config object if the file doesn't exist.
 */
export function loadConfig(): OcloopConfig {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    log.debug("config", "No config file found, using default")
    return {}
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(content)
    // JSON.parse("null") succeeds but yields null; treat as missing config.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      log.warn("config", "Config file did not contain a JSON object, using default", parsed)
      return {}
    }
    const config = parsed as OcloopConfig
    log.info("config", "Loaded config", config)
    return config
  } catch (err) {
    // If parsing fails, return empty config
    log.warn("config", "Failed to load config, using default", err)
    return {}
  }
}

/**
 * Save the configuration to disk.
 * Creates the config directory if it doesn't exist.
 */
export function saveConfig(config: OcloopConfig): void {
  const configDir = getConfigDir()
  const configPath = getConfigPath()

  // Create directory if needed
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Write atomically: tmp file then rename (rename is atomic on the same
  // filesystem, so a reader never sees a half-written config).
  const tmpPath = configPath + ".tmp"
  writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8")
  renameSync(tmpPath, configPath)
  log.info("config", "Saved config", config)
}

/**
 * Type guard to check if the config has a valid terminal configuration
 */
export function hasTerminalConfig(
  config: OcloopConfig,
): config is OcloopConfig & { terminal: TerminalConfig } {
  if (!config.terminal) {
    return false
  }

  const terminal = config.terminal

  if (terminal.type === "known") {
    return typeof terminal.name === "string" && terminal.name.length > 0
  }

  if (terminal.type === "custom") {
    return (
      typeof terminal.command === "string" &&
      terminal.command.length > 0 &&
      typeof terminal.args === "string"
    )
  }

  return false
}
