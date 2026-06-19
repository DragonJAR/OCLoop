/**
 * Configuration file management for OCLoop
 *
 * Handles loading, saving, and validating configuration from
 * ~/.config/ocloop/ocloop.json (or XDG_CONFIG_HOME equivalent).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { homedir } from "node:os"
import { join } from "node:path"
import { log } from "./debug-logger"
import { isLocale } from "./i18n"

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

  // --- Phase 7: no-progress halt ---
  /**
   * Number of consecutive iterations that start with the same PLAN.md task
   * description before the loop halts with `errNoProgress`. The detector
   * resets on any task change (i.e. real progress), so this only fires when
   * the agent is stuck redoing the same task — the classic "idle but not
   * making progress" failure mode. A value of N gives the agent N-1 retries
   * on a single task before halting. Must be >= 1.
   */
  noProgressThreshold: number
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

  noProgressThreshold: 3,
}

/**
 * Eval-layer configuration — the LM-judge that runs after each task (opt-in).
 *
 * Resolution + defaults live here so the validation all-or-nothing policy can
 * mirror `resilience`: `DEFAULT_EVALS` is the single source of truth for field
 * types (truth-in-defaults, the same DRY pattern as `DEFAULT_RESILIENCE`).
 *
 * Safety invariant: `maxEvalRetries` MUST stay `≤ noProgressThreshold - 1`, or
 * an eval-retry loop would trip `NoProgressDetector` before the budget is
 * spent. With defaults (1 ≤ 3-1=2) this holds; `resolveResilience`/App log a
 * warn if a user configures a value that breaks it.
 */
export interface EvalConfig {
  /** Master switch. Default false — the loop is byte-identical to today when off. */
  enabled: boolean
  /** Optional judge model ("provider/model"); falls back to the active model. */
  judgeModel?: string
  /** Max eval-driven retries of the SAME task before marking it [BLOCKED]. */
  maxEvalRetries: number
  /** Per-call judge budget (ms). Default 60s. */
  judgeTimeoutMs: number
  /** Judge-call retries on timeout/network failure before declaring an eval failure. */
  judgeRetries: number
}

/**
 * Sensible defaults for the eval layer. `enabled: false` by design — the loop
 * must not change behavior unless the user opts in.
 */
export const DEFAULT_EVALS: EvalConfig = {
  enabled: false,
  maxEvalRetries: 1,
  judgeTimeoutMs: 60_000,
  judgeRetries: 1,
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
  /** Optional eval-layer (LM-judge) overrides (partial; merged over defaults). */
  evals?: Partial<EvalConfig>
}

/**
 * Merge resilience config from defaults, the config file, and CLI overrides.
 *
 * `undefined`/`null` in either override layer are ignored so a partial file
 * inherits the lower layer. A null field ("createTimeoutMs": null) is treated
 * as "use the default" rather than overwriting with null, which would coerce
 * to 0 in setTimeout/setInterval and burn through retries in milliseconds.
 * Arrays are rejected (Object.entries would yield numeric keys and corrupt the
 * defaults). Unknown keys are dropped so they don't leak into the merged result
 * as a latent footgun for future consumers.
 */
export function resolveResilience(
  fileConfig?: Partial<ResilienceConfig>,
  cliOverrides?: Partial<ResilienceConfig>,
): ResilienceConfig {
  const pickDefined = <T extends object>(obj?: T): Partial<T> => {
    if (!obj || Array.isArray(obj)) return {}
    return Object.fromEntries(
      Object.entries(obj).filter(
        ([k, v]) => k in DEFAULT_RESILIENCE && v !== undefined && v !== null,
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
 * Top-level config keys accepted by validateConfigShape. Any other key is
 * dropped (and a warn logged) so a typo like `languaje: "es"` surfaces instead
 * of silently falling back to English.
 */
const ALLOWED_CONFIG_KEYS = new Set([
  "terminal",
  "scrollbar_visible",
  "theme",
  "language",
  "resilience",
  "evals",
])

/**
 * Per-field type guard for a single ResilienceConfig entry. Returns true iff
 * key is known in DEFAULT_RESILIENCE and v has the expected runtime type and
 * range. Shared by the file and CLI paths so neither can silently accept a
 * hand-edited "createTimeoutMs": "fast" (which would reach setTimeout and
 * coerce to NaN, burning retries in milliseconds).
 */
function isValidResilienceValue(key: string, v: unknown): boolean {
  if (!(key in DEFAULT_RESILIENCE)) return false
  const def = (DEFAULT_RESILIENCE as unknown as Record<string, unknown>)[key]
  if (typeof def === "boolean") return typeof v === "boolean"
  if (typeof def === "number") {
    return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0
  }
  return false
}

/**
 * Per-field type guard for a single EvalConfig entry. Mirrors
 * `isValidResilienceValue` (truth-in-defaults) but handles the `judgeModel`
 * string field that resilience never needs. `judgeModel` is OPTIONAL, so a
 * valid config may omit it; when present it must be a non-empty string.
 */
function isValidEvalsValue(key: string, v: unknown): boolean {
  if (key === "judgeModel") return typeof v === "string" && v.length > 0
  if (!(key in DEFAULT_EVALS)) return false
  const def = (DEFAULT_EVALS as unknown as Record<string, unknown>)[key]
  if (typeof def === "boolean") return typeof v === "boolean"
  if (typeof def === "number") {
    return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && v >= 0
  }
  return false
}

/**
 * Per-field type validation for the parsed config. Returns a clean OcloopConfig
 * with only fields that pass type checks; any malformed field is dropped and a
 * warn logged. resilience is deep-validated via isValidResilienceValue (all-or-
 * nothing: one bad key drops the whole block, matching the terminal/language/
 * theme policy). The unknown-key check fires after per-field validation so
 * every unrecognized top-level key (e.g. languaje) surfaces in a single warn.
 */
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
    if (typeof r.theme === "string") {
      out.theme = r.theme
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
  if ("resilience" in r) {
    if (typeof r.resilience !== "object" || r.resilience === null || Array.isArray(r.resilience)) {
      log.warn("config", "Ignoring malformed 'resilience' field", r.resilience)
    } else {
      // All-or-nothing: if any field is unknown, wrong-typed, or out of
      // range, drop the whole block. Per-field truth in `DEFAULT_RESILIENCE`
      // is the single source of truth — a hand-edited
      // `{"createTimeoutMs": "fast"}` would otherwise flow through
      // `pickDefined` and reach `setTimeout("fast", …)` as `NaN`.
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
      // All-or-nothing, mirroring resilience: one bad field drops the whole
      // block so a hand-edited `{"maxEvalRetries": "lots"}` can't reach the
      // loop as NaN and burn through the retry budget.
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

  const unknown = Object.keys(r).filter((k) => !ALLOWED_CONFIG_KEYS.has(k))
  if (unknown.length > 0) {
    log.warn("config", `Unknown config keys ignored: ${unknown.join(", ")}`, unknown)
  }

  return out
}

/**
 * Process-wide cache of the parsed config. `loadConfig()` is called from up to
 * four places during a single startup (main() for the language, main() for
 * --create-plan, App.onMount, and ThemeContext) — each doing existsSync +
 * readFileSync + JSON.parse + validateConfigShape. Caching collapses them to a
 * single disk read; `saveConfig` invalidates on write (write-through), so the
 * round-trip contract (save → load sees the new value) holds.
 *
 * Gated reset for tests: `__resetConfigCacheForTests()` mirrors
 * `api.ts:__resetClientCacheForTests` so config.test.ts (which writes files and
 * re-reads) can flush the cache between cases. Bun sets NODE_ENV=test.
 */
let cachedConfig: OcloopConfig | null = null

export function __resetConfigCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") return
  cachedConfig = null
}

/**
 * Load and parse the configuration file.
 * Returns an empty config object if the file doesn't exist.
 */
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
    // If parsing fails, return empty config
    log.warn("config", "Failed to load config, using default", err)
    cachedConfig = {}
    return {}
  }
}

/**
 * Save the configuration to disk. Creates the config directory if missing.
 *
 * Synchronous — callers MUST NOT await it (it returns boolean, not a Promise).
 * If refactored to async, the App.tsx call sites must be updated to match.
 *
 * Returns true on success, false on I/O failure. Never throws: persistence is
 * best-effort and must not crash the app (mirrors saveLoopState). Any I/O
 * failure is logged as warn; the boolean lets call sites surface a toast.
 */
export function saveConfig(config: OcloopConfig): boolean {
  const configDir = getConfigDir()
  const configPath = getConfigPath()
  // Random hex suffix on the tmp: two ocloop processes sharing the same
  // $XDG_CONFIG_HOME (e.g. TUI + --create-plan) would otherwise race on a fixed
  // .tmp name and interleave each other's mid-write bytes. The rename is still
  // last-writer-wins (atomic on POSIX); this only prevents intermediate-state
  // clobbering of the tmp.
  const tmpPath = `${configPath}.${randomBytes(6).toString("hex")}.tmp`

  try {
    // mkdirSync with recursive is idempotent — no existsSync guard needed, and
    // a guard would add a wasted syscall plus a TOCTOU window.
    mkdirSync(configDir, { recursive: true })

    // Write atomically: tmp file then rename (rename is atomic on the same
    // filesystem, so a reader never sees a half-written config).
    writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8")
    renameSync(tmpPath, configPath)
    // Invalidate the load cache so a subsequent loadConfig() sees the new
    // value (write-through). Round-trip (save → load) contract holds.
    cachedConfig = config
    log.info("config", "Saved config", config)
    return true
  } catch (err) {
    log.warn("config", "Failed to save config", err)
    // Best-effort cleanup of the orphan tmp file. The unlink can fail (the
    // tmp may not exist if `writeFileSync` failed before creating it); the
    // `existsSync` guard short-circuits the common pre-write case, and the
    // outer swallow catches the race where the file vanishes between the
    // check and the unlink.
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath)
    } catch {
      // Nothing more we can do; the next saveConfig overwrites the tmp.
    }
    return false
  }
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
