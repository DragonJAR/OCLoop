import path from "path"
import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
} from "solid-js"
import {
  useRenderer,
  useKeyboard,
} from "@opentui/solid"

import { useServer } from "./hooks/useServer"
import { useSSE, classifySessionError, type FileDiff } from "./hooks/useSSE"
import { useLoopState } from "./hooks/useLoopState"
import { useWatchdog } from "./hooks/useWatchdog"
import { useLoopStats } from "./hooks/useLoopStats"
import { useSessionStats } from "./hooks/useSessionStats"
import { useActivityLog } from "./hooks/useActivityLog"
import { log } from "./lib/debug-logger"
import { parsePlanFile, getCurrentTask, isPlanComplete, getPlanCompleteSummary } from "./lib/plan-parser"
import { DEFAULTS } from "./lib/constants"
import { getToolPreview } from "./lib/format"
import { shutdownManager } from "./lib/shutdown"
import {
  ensureGitignore,
} from "./lib/project"
import {
  saveLoopState,
  loadLoopState,
  clearLoopState,
  type PersistedLoopState,
} from "./lib/loop-state-store"
import {
  loadConfig,
  saveConfig,
  hasTerminalConfig,
  resolveResilience,
  type OcloopConfig,
  type ResilienceConfig,
} from "./lib/config"
import {
  createClient,
  createSession,
  sendPromptAsync,
  abortSession,
  configureApiTimeouts,
  reconcileSession,
  type ReconcileResult,
} from "./lib/api"
import { withTimeout } from "./lib/with-timeout"
import { computeBackoff } from "./lib/backoff"
import { monotonicNow } from "./lib/clock"
import { t, setLocale, getLocale, type Locale } from "./lib/i18n"
import { createSleepDetector, type SleepDetector } from "./lib/sleep-detector"
import { createPowerManager } from "./lib/power"
import { createChaos } from "./lib/chaos"
import { 
  detectInstalledTerminals, 
  getAttachCommand, 
  launchTerminal, 
  type KnownTerminal 
} from "./lib/terminal-launcher"
import { copyToClipboard } from "./lib/clipboard"
import { ThemeProvider } from "./context/ThemeContext"
import { DialogProvider, DialogStack, useDialog } from "./context/DialogContext"
import { CommandProvider, useCommand, type CommandOption } from "./context/CommandContext"
import { ToastProvider, Toast, useToast } from "./context/ToastContext"
import { DialogConfirm } from "./ui/DialogConfirm"
import { DialogPrompt } from "./ui/DialogPrompt"
import {
  Dashboard,
  DialogCompletion,
  DialogError,
  ActivityLog,
  DialogTerminalConfig,
  createTerminalConfigState,
  DialogTerminalError,
  DialogInvalidAgent,
} from "./components"
import type { CLIArgs, PlanProgress, LoopState } from "./types"

/**
 * Props for the App component
 */
export interface AppProps extends CLIArgs {}

/**
 * Main OCLoop application component
 *
 * Wraps AppContent with ThemeProvider and DialogProvider
 * for consistent theming and modal dialog support.
 */
export function App(props: AppProps) {
  return (
    <ThemeProvider>
      <DialogProvider>
        <CommandProvider>
          <ToastProvider>
            <AppContent {...props} />
            <DialogStack />
            <Toast />
          </ToastProvider>
        </CommandProvider>
      </DialogProvider>
    </ThemeProvider>
  )
}

/**
 * Internal App content component
 *
 * Contains all the application logic:
 * - Server management (useServer)
 * - SSE event subscription (useSSE)
 * - State machine (useLoopState)
 * - Activity Log (useActivityLog)
 *
 * Manages keybindings:
 * - Ctrl+\ to launch external terminal
 * - Space to pause/resume
 * - Q to quit
 * - Y/N for quit confirmation
 */
function AppContent(props: AppProps) {
  const renderer = useRenderer()
  const dialog = useDialog()
  const toast = useToast()
  const command = useCommand()

  // Server management
  const server = useServer({
    port: props.port,
    autoStart: true,
  })

  // Loop state machine
  const loop = useLoopState()

  // Loop timing statistics
  const stats = useLoopStats()

  // Session statistics (tokens, diff)
  const sessionStats = useSessionStats()

  // Activity Log
  const activityLog = useActivityLog()

  // Configuration & Terminal State
  const [ocloopConfig, setOcloopConfig] = createSignal<OcloopConfig>({})
  const [availableTerminals, setAvailableTerminals] = createSignal<KnownTerminal[]>([])
  const [lastSessionId, setLastSessionId] = createSignal<string | undefined>(undefined)

  // Resolved resilience thresholds (DEFAULT_RESILIENCE < config file < CLI flags).
  // Seeded with defaults so api.ts timeouts are sane before onMount resolves them.
  const [resilience, setResilience] = createSignal<ResilienceConfig>(
    resolveResilience(undefined, props.resilience),
  )

  // --- Rate-limit cooldown bookkeeping (Phase 1) ---
  // Consecutive rate-limit attempts; reset whenever an iteration completes ok.
  let rateLimitAttempts = 0
  // Timers for the cooldown wait and the dashboard countdown.
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null
  let cooldownTicker: ReturnType<typeof setInterval> | null = null
  // Monotonic timestamp of the last iteration kickoff, for minIterationGap.
  let lastIterationStartAt = 0
  // Remaining cooldown time (ms) for the dashboard countdown.
  const [cooldownRemainingMs, setCooldownRemainingMs] = createSignal(0)

  /** Clear any pending cooldown timers (on resume, quit, or success). */
  function clearCooldownTimers(): void {
    if (cooldownTimer) {
      clearTimeout(cooldownTimer)
      cooldownTimer = null
    }
    if (cooldownTicker) {
      clearInterval(cooldownTicker)
      cooldownTicker = null
    }
  }

  // --- Sleep/suspension survival (Phase 2) ---
  // Keep the Mac awake while the loop is doing or waiting on work.
  const power = createPowerManager({ enabled: () => resilience().caffeinate })
  let sleepDetector: SleepDetector | null = null

  /**
   * Handle waking from a system suspension. The SSE stream almost always died
   * while asleep, so reconnect it; then reconcile the in-flight session in case
   * we slept through its `session.idle`. If a rate-limit cooldown elapsed during
   * sleep, resume it immediately rather than waiting for the (now-late) timer.
   */
  function handleWake(gapMs: number): void {
    log.health("sleep", "wake", { gapMs })
    activityLog.addEvent(
      "task",
      t("actWake", { secs: Math.round(gapMs / 1000) }),
    )

    // Reconnect SSE (heartbeat) and re-evaluate the watchdog now.
    sse.reconnect()
    watchdog.notifyWake()

    const st = loop.state()
    if (st.type === "cooldown") {
      // Cooldown deadline may have passed while we slept.
      if (monotonicNow() >= st.resumeAt) {
        clearCooldownTimers()
        loop.dispatch({ type: "resume_cooldown" })
      }
    } else {
      // Recover a possibly-missed session.idle.
      void reconcileAndAdvance()
    }
  }

  // --- Chaos fault injection (Phase 6, debug + --chaos only) ---
  // Wraps the watchdog probes so faults can be triggered for manual soak tests.
  const chaos = createChaos(() => resilience().chaos && !!props.debug)

  // --- Task guardian / watchdog (Phase 4) ---
  // Created before useSSE so SSE progress handlers can feed it heartbeats.
  // Probes read ground truth; actions are the recovery levers. All closures are
  // invoked at tick time, after the rest of setup has run.
  const watchdog = useWatchdog({
    config: () => {
      const r = resilience()
      return {
        suspectMs: r.watchdogSuspectMs,
        confirmMs: r.watchdogConfirmMs,
        tickMs: r.watchdogTickMs,
        maxRecoveryAttempts: r.maxRecoveryAttempts,
      }
    },
    probes: {
      isActive: () => {
        const s = loop.state()
        return (
          (s.type === "running" || s.type === "pausing") && s.sessionId !== ""
        )
      },
      pingServer: () => chaos.ping(() => server.ping()),
      reconcile: () =>
        chaos.reconcile(async () => {
          const url = server.url()
          const s = loop.state()
          const sid =
            s.type === "running" || s.type === "pausing" ? s.sessionId : ""
          if (!url || !sid) return "unknown"
          return reconcileSession(createClient(url), sid)
        }),
    },
    actions: {
      reconnectSSE: () => {
        activityLog.addEvent("task", t("actGuardReconnect"))
        sse.reconnect()
      },
      synthesizeIdle: () => {
        activityLog.addEvent("session_idle", t("actGuardSynthIdle"))
        rateLimitAttempts = 0
        loop.dispatch({ type: "session_idle" })
      },
      abortAndRetry: async () => {
        activityLog.addEvent("task", t("actGuardAbort"))
        const url = server.url()
        const s = loop.state()
        const sid =
          s.type === "running" || s.type === "pausing" ? s.sessionId : ""
        if (url && sid) {
          try {
            await abortSession(createClient(url), sid)
          } catch {
            // Best effort — the session may already be gone.
          }
        }
        // Advance so the iteration-driver re-creates the session and re-sends
        // the prompt (same iteration; plan progress untouched).
        loop.dispatch({ type: "session_idle" })
      },
      restartServer: () => restartServer(),
      fail: (d) => {
        loop.dispatch({
          type: "error",
          source: "api",
          message: t("errGuardExhausted", {
            reason: d.reason,
            attempts: d.attempts,
            secs: Math.round(d.lastHeartbeatAgeMs / 1000),
            verdict: d.lastVerdict ?? "?",
          }),
          recoverable: true,
        })
      },
    },
  })

  /** Feed the watchdog a heartbeat from any real session-progress SSE event. */
  const heartbeat = () => watchdog.recordHeartbeat()

  // Active model
  const [activeModel, setActiveModel] = createSignal<string | undefined>(props.model)
  
  // Active agent
  const [activeAgent, setActiveAgent] = createSignal<string | undefined>(props.agent)

  // Track if we've initialized (to prevent double initialization)
  let sessionInitialized = false

  // Track previous state for detecting transitions
  let prevState: LoopState | null = null

  // Wire stats hook to loop state transitions
  createEffect(() => {
    const state = loop.state()
    const prev = prevState
    prevState = state

    // Skip initial render (no previous state)
    if (prev === null) {
      return
    }

    // Detect iteration_started: transitioning from running with no sessionId to running with sessionId
    // OR from paused to running with a new session
    if (
      state.type === "running" &&
      state.sessionId &&
      ((prev.type === "running" && !prev.sessionId) ||
        prev.type === "paused" ||
        prev.type === "ready")
    ) {
      stats.startIteration()
      log.iterationStart(state.iteration)
      log.debug("state", "Iteration started", { sessionId: state.sessionId, iteration: state.iteration })
      // Refresh current task from plan file as fallback for SSE todo updates
      refreshCurrentTask()
    }

    // Detect pause: transitioning from running to pausing
    if (state.type === "pausing" && prev.type === "running") {
      stats.pause()
    }

    // Detect resume: transitioning from paused to running
    if (state.type === "running" && prev.type === "paused") {
      stats.resume()
    }

    // Detect session_idle: transitioning from running/pausing with sessionId to running without
    // or from pausing to paused
    if (
      (state.type === "running" && !state.sessionId && prev.type === "running" && prev.sessionId) ||
      (state.type === "paused" && prev.type === "pausing")
    ) {
      log.iterationEnd(state.iteration)
      log.debug("state", "Iteration ended", { iteration: state.iteration })
      stats.endIteration()
    }
  })

  // Plan progress tracking
  const [planProgress, setPlanProgress] = createSignal<PlanProgress | null>(
    null,
  )
  const [currentTask, setCurrentTask] = createSignal<string | undefined>(
    undefined,
  )

  // Current session ID (for SSE filtering)
  const sessionId = createMemo(() => {
    const state = loop.state()
    if (state.type === "running" && state.sessionId) {
      return state.sessionId
    }
    if (state.type === "pausing" && state.sessionId) {
      return state.sessionId
    }
    if (state.type === "debug" && state.sessionId) {
      return state.sessionId
    }
    return undefined
  })

  // Apply CLI-aware timeouts immediately so any early SDK call is bounded,
  // even before onMount resolves the on-disk config.
  configureApiTimeouts(resilience())

  // On Mount: Load config and detect terminals
  onMount(async () => {
    const config = await loadConfig()
    setOcloopConfig(config)

    // Resolve resilience thresholds: defaults < config file < CLI flags.
    const resolved = resolveResilience(config.resilience, props.resilience)
    setResilience(resolved)
    configureApiTimeouts(resolved)
    log.info("config", "Resolved resilience config", resolved as unknown as Record<string, unknown>)

    // Sleep/suspension detector — always on while the app runs.
    sleepDetector = createSleepDetector({
      tickMs: resolved.sleepTickMs,
      thresholdMs: resolved.sleepThresholdMs,
      onWake: handleWake,
    })
    sleepDetector.start()

    const terminals = await detectInstalledTerminals()
    setAvailableTerminals(terminals)
  })

  // SSE subscription (only when server is ready)
  const sse = useSSE({
    url: () => server.url() || "",
    sessionId: sessionId,
    autoConnect: false, // We'll connect when server is ready
    handlers: {
      onSessionCreated: (id) => {
        activityLog.addEvent("session_start", `Session started: ${id.substring(0, 8)}`)
        setLastSessionId(id)
        sessionStats.reset()
      },
      onSessionError: (_id, error) => {
        const st = loop.state().type
        if (error.isAborted) {
          activityLog.addEvent("task", t("actSessionAborted"))
          if (st === "running") {
            loop.dispatch({ type: "toggle_pause" })
          }
        } else if (error.kind === "rate_limit") {
          // Provider rate limit surfaced mid-iteration: wait + retry, don't fail.
          // Cover `pausing` too (the reducer accepts it) so a rate limit while
          // pausing can't wedge the loop waiting for a session.idle that the
          // errored session will never emit.
          activityLog.addEvent("error", t("actRateLimit", { message: error.message }))
          if (st === "running" || st === "pausing") {
            enterCooldown(error.message, error.retryAfter)
          }
        } else {
          activityLog.addEvent("error", t("actSessionError", { message: error.message }))
        }
      },
      onSessionIdle: (eventSessionId) => {
        // Only handle if it's our current session
        const currentSession = sessionId()
        const state = loop.state()
        // Also check debug state's sessionId
        const debugSessionId = state.type === "debug" ? state.sessionId : undefined
        
        if (eventSessionId === currentSession || eventSessionId === debugSessionId) {
          // A clean idle means the iteration succeeded: clear the rate-limit
          // streak so a past cooldown doesn't penalize future iterations, and
          // reset the watchdog for the next iteration.
          rateLimitAttempts = 0
          watchdog.notifyIdle()
          loop.dispatch({ type: "session_idle" })
          activityLog.addEvent("session_idle", t("actSessionIdle"))
        }
      },
      onTodoUpdated: (_eventSessionId, todos) => {
        heartbeat()
        // Update current task display from todos
        const inProgress = todos.find((t) => t.status === "in_progress")
        if (inProgress) {
          setCurrentTask(inProgress.content)
          activityLog.addEvent("task", inProgress.content)
        }
      },
      onFileEdited: (file) => {
        heartbeat()
        activityLog.addEvent("file_edit", file)
        // Re-parse plan if PLAN.md was edited
        const planFile = props.planFile || DEFAULTS.PLAN_FILE
        const absolutePlanPath = path.resolve(planFile)
        const absoluteFilePath = path.resolve(file)
        
        if (absoluteFilePath === absolutePlanPath) {
          refreshPlan()
          // Also refresh current task as fallback for SSE todo updates
          refreshCurrentTask()
        }
      },
      onStepFinish: (part) => {
        heartbeat()
        sessionStats.addTokens(part.tokens)
      },
      onSessionDiff: (diffs: FileDiff[]) => {
        // Filter out .loop.log files
        const filtered = diffs.filter(d => !d.file.endsWith('.loop.log'))
        
        // Aggregate stats
        const additions = filtered.reduce((acc, d) => acc + d.additions, 0)
        const deletions = filtered.reduce((acc, d) => acc + d.deletions, 0)
        const files = filtered.length
        
        sessionStats.setDiff({ additions, deletions, files })
      },
      onToolUse: (part) => {
        heartbeat()
        const toolName = part.tool || part.state.tool || "unknown"
        const input = part.state.input as Record<string, unknown>
        const preview = getToolPreview(toolName, input)
        
        if (toolName === "read") {
          activityLog.addEvent("file_read", preview)
        } else {
          activityLog.addEvent("tool_use", `${toolName}: ${preview}`)
        }
      },
      onMessageText: (part, role) => {
        heartbeat()
        const type = role === "user" ? "user_message" : "assistant_message"
        activityLog.addEvent(type, part.text, { dimmed: true })
      },
      onReasoning: (part) => {
        heartbeat()
        activityLog.addEvent("reasoning", part.text, { dimmed: true })
      },
    },
  })

  /**
   * Parse the plan file and update progress
   */
  async function refreshPlan(): Promise<void> {
    // Skip in debug mode - no plan file required
    if (props.debug) {
      return
    }
    try {
      const progress = await parsePlanFile(props.planFile || DEFAULTS.PLAN_FILE)
      setPlanProgress(progress)
    } catch (err) {
      log.error("plan", "Failed to parse plan file", err)
    }
  }

  /**
   * Refresh current task from plan file (fallback when SSE doesn't provide todo update)
   */
  async function refreshCurrentTask(): Promise<void> {
    // Skip in debug mode - no plan file required
    if (props.debug) {
      return
    }
    try {
      const task = await getCurrentTask(props.planFile || DEFAULTS.PLAN_FILE)
      if (task) {
        setCurrentTask(task)
      }
    } catch {
      // Silently ignore errors - current task display is non-critical
    }
  }

  /**
   * Check if plan is marked complete
   */
  async function checkPlanComplete(): Promise<boolean> {
    // Skip check in debug mode
    if (props.debug) return false
    
    try {
      const planPath = props.planFile || DEFAULTS.PLAN_FILE
      return await isPlanComplete(planPath)
    } catch {
      return false
    }
  }

  /**
   * Reconcile the active session against the server's ground truth and advance
   * the loop if we missed its completion. Returns the reconcile verdict.
   *
   * This is the single source of truth shared by the watchdog (Phase 4) and the
   * sleep/wake handler (Phase 2): if the server says the session is `idle` or
   * `missing` while we still think it's running, we lost the `session.idle`
   * event (SSE dropped during sleep/disconnect) — so we synthesize it here.
   */
  async function reconcileAndAdvance(): Promise<ReconcileResult> {
    const url = server.url()
    const state = loop.state()
    const sid =
      state.type === "running" || state.type === "pausing"
        ? state.sessionId
        : ""
    if (!url || !sid) return "unknown"

    const client = createClient(url)
    const result = await reconcileSession(client, sid)
    log.health("reconcile", result, { sessionId: sid })

    if (result === "idle" || result === "missing") {
      activityLog.addEvent(
        "session_idle",
        t("actReconciled", { result }),
      )
      rateLimitAttempts = 0
      loop.dispatch({ type: "session_idle" })
    }
    return result
  }

  /**
   * Recover from a hung server: restart it, reconnect SSE to the (possibly new)
   * URL, and reconcile the in-flight session. Used by the watchdog and on wake.
   */
  async function restartServer(): Promise<void> {
    log.health("server", "recovery_restart", { url: server.url() })
    activityLog.addEvent("error", t("actGuardRestart"))
    await server.restart()
    sse.reconnect()
    await reconcileAndAdvance()
  }

  /**
   * Enter a rate-limit cooldown: wait out a backoff (honoring Retry-After) and
   * then retry the SAME iteration. A circuit breaker escalates to a recoverable
   * error after `maxRateLimitRetries` consecutive rate limits so we never loop
   * forever against a provider that is down.
   */
  function enterCooldown(reason: string, retryAfterSeconds?: number): void {
    const r = resilience()
    rateLimitAttempts++

    if (rateLimitAttempts > r.maxRateLimitRetries) {
      const tried = rateLimitAttempts - 1
      log.health("ratelimit", "exhausted", { attempts: tried, reason })
      activityLog.addEvent("error", t("actRateExhausted", { attempts: tried }))
      loop.dispatch({
        type: "error",
        source: "api",
        message: t("errRatePersistent", { attempts: tried, reason }),
        recoverable: true,
      })
      rateLimitAttempts = 0
      clearCooldownTimers()
      return
    }

    const delayMs = computeBackoff(rateLimitAttempts - 1, {
      base: r.backoffBaseMs,
      max: r.backoffMaxMs,
      jitter: r.backoffJitter,
      retryAfterSeconds,
    })
    const resumeAt = monotonicNow() + delayMs

    log.health("ratelimit", "cooldown", {
      attempt: rateLimitAttempts,
      delayMs,
      retryAfterSeconds: retryAfterSeconds ?? null,
      reason,
    })
    activityLog.addEvent(
      "error",
      t("cooldownText", { secs: Math.ceil(delayMs / 1000), attempt: rateLimitAttempts }),
    )

    loop.dispatch({ type: "rate_limited", reason, resumeAt, attempt: rateLimitAttempts })

    // Countdown for the dashboard, driven by the monotonic clock.
    clearCooldownTimers()
    setCooldownRemainingMs(delayMs)
    cooldownTicker = setInterval(() => {
      const remaining = Math.max(0, resumeAt - monotonicNow())
      setCooldownRemainingMs(remaining)
      if (remaining <= 0 && cooldownTicker) {
        clearInterval(cooldownTicker)
        cooldownTicker = null
      }
    }, 250)

    // Resume after the backoff. The idle effect (running + empty session) then
    // re-creates the session and re-sends the prompt for the same iteration.
    cooldownTimer = setTimeout(() => {
      cooldownTimer = null
      if (loop.state().type === "cooldown") {
        loop.dispatch({ type: "resume_cooldown" })
      }
    }, delayMs)
  }

  /**
   * Route an iteration-start failure: rate limits go to cooldown (retry the same
   * iteration), everything else becomes a recoverable error.
   */
  function handleIterationError(err: unknown): void {
    const classified = classifySessionError(err)
    if (classified.kind === "rate_limit") {
      enterCooldown(classified.message, classified.retryAfter)
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    loop.dispatch({
      type: "error",
      source: "api",
      message: t("errIterationStart", { message }),
      recoverable: true,
    })
  }

  /**
   * Create a new session and start an iteration
   */
  async function startIteration(): Promise<void> {
    const url = server.url()
    if (!url) {
      console.error("Cannot start iteration: server not ready")
      return
    }

    // Check for plan completion first
    if (await checkPlanComplete()) {
      const planPath = props.planFile || DEFAULTS.PLAN_FILE
      // We know it's complete, but getPlanCompleteSummary returns string | null
      const summaryContent = await getPlanCompleteSummary(planPath)
      
      loop.dispatch({ 
        type: "plan_complete", 
        summary: { summary: summaryContent || "Plan marked as complete." } 
      })
      return
    }

    try {
      // Enforce a minimum spacing between iterations so very short iterations
      // don't hammer the provider. Uses the monotonic clock; default 0 = off.
      const gap = resilience().minIterationGapMs
      if (gap > 0) {
        const since = monotonicNow() - lastIterationStartAt
        if (since < gap) {
          await new Promise((r) => setTimeout(r, gap - since))
        }
      }
      lastIterationStartAt = monotonicNow()

      // Create SDK client (all calls below are timeout-wrapped via api.ts)
      const client = createClient(url)

      // Create a new session
      const session = await createSession(client)
      const newSessionId = session.id

      // Dispatch iteration started
      loop.dispatch({ type: "iteration_started", sessionId: newSessionId })
      // Reset the watchdog's heartbeat baseline for this fresh iteration.
      watchdog.notifyIterationStart()

      // Read the prompt file
      const promptFile = Bun.file(props.promptFile || DEFAULTS.PROMPT_FILE)
      const promptExists = await promptFile.exists()

      if (!promptExists) {
        throw new Error(
          `Prompt file not found: ${props.promptFile || DEFAULTS.PROMPT_FILE}`,
        )
      }

      const promptContent = await promptFile.text()
      // Replace {{PLAN_FILE}} placeholder with actual plan file path
      const prompt = promptContent.replaceAll("{{PLAN_FILE}}", props.planFile || DEFAULTS.PLAN_FILE)

      // Send the prompt asynchronously
      await sendPromptAsync(client, {
        sessionID: newSessionId,
        parts: [{ type: "text", text: prompt }],
        agent: activeAgent(),
      })

      // Refresh plan progress
      await refreshPlan()
    } catch (err) {
      // Rate limits → cooldown + retry; anything else → recoverable error.
      handleIterationError(err)
    }
  }

  /**
   * Helper to insert sample activity for UI testing
   */
  const insertSampleActivity = () => {
    activityLog.addEvent("session_start", "Session started")
    activityLog.addEvent("user_message", "User: Implement feature X")
    activityLog.addEvent("assistant_message", "Assistant: I'll help with that")
    activityLog.addEvent("reasoning", "Analyzing the codebase structure...", { dimmed: true })
    activityLog.addEvent("tool_use", "bash", { detail: "ls -la src/" })
    activityLog.addEvent("file_read", "Reading src/App.tsx")
    activityLog.addEvent("tool_use", "edit", { detail: "src/components/Button.tsx" })
    activityLog.addEvent("file_edit", "Modified src/components/Button.tsx (+15, -3)")
    activityLog.addEvent("task", "Implementing dark mode toggle")
    activityLog.addEvent("error", "Build failed: Type error in Button.tsx")
    activityLog.addEvent("session_idle", "Session idle - waiting for input")
  }

  /**
   * Create a new session in debug mode (no prompt sent)
   * Just creates a session for manual interaction
   */
  async function createDebugSession(): Promise<void> {
    log.info("session", "Creating debug session...")
    const url = server.url()
    if (!url) {
      log.error("session", "Cannot create debug session: server not ready")
      console.error("Cannot create debug session: server not ready")
      return
    }

    try {
      // Create SDK client (timeout-wrapped via api.ts)
      const client = createClient(url)

      // Create a new session
      const session = await createSession(client)
      const newSessionId = session.id

      log.info("session", "Debug session created", { sessionId: newSessionId })

      // Dispatch new_session to update debug state with session ID
      loop.dispatch({ type: "new_session", sessionId: newSessionId })
      setLastSessionId(newSessionId)
      
      activityLog.addEvent("session_start", `Debug session: ${newSessionId.substring(0, 8)}`)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      log.error("session", "Failed to create debug session", errorMessage)
      loop.dispatch({
        type: "error",
        source: "api",
        message: `Failed to create debug session: ${errorMessage}`,
        recoverable: true,
      })
    }
  }

  /**
   * Send a prompt in debug mode
   */
  async function sendDebugPrompt(text: string): Promise<void> {
    const url = server.url()
    const sid = sessionId() || lastSessionId()

    if (!url || !sid) {
      toast.show({ variant: "error", message: t("toastNoSessionPrompt") })
      return
    }

    try {
      // Add activity log immediately for feedback
      activityLog.addEvent("user_message", `User: ${text}`)

      const client = createClient(url)
      await sendPromptAsync(client, {
        sessionID: sid,
        parts: [{ type: "text", text }],
        agent: activeAgent(),
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.show({ variant: "error", message: `Failed to send prompt: ${errorMessage}` })
    }
  }

  /**
   * Show quit confirmation dialog
   */
  const showQuitConfirmation = () => {
    dialog.show(() => (
      <DialogConfirm
        title={t("dlgQuitTitle")}
        message={t("dlgQuitMsg")}
        confirmLabel={t("dlgQuitConfirm")}
        cancelLabel={t("dlgCancel")}
        onConfirm={() => {
          dialog.clear()
          handleQuit()
        }}
        onCancel={() => dialog.clear()}
      />
    ))
  }

  /**
   * Handle quit - abort session and cleanup gracefully
   * @param exitCode - Exit code to use (default: 0)
   */
  async function handleQuit(exitCode: number = 0): Promise<void> {
    log.info("app", "Quit initiated", { exitCode, currentSessionId: sessionId() })
    
    loop.dispatch({ type: "quit" })

    // Stop resilience machinery: cooldown timers, watchdog, sleep detector, caffeinate
    clearCooldownTimers()
    watchdog.stop()
    sleepDetector?.stop()
    power.stop()

    // Clean exit: drop the persisted state so we don't offer to resume next time.
    if (!props.debug) {
      await clearLoopState()
    }

    // Abort current session if running
    const currentSessionId = sessionId()
    if (currentSessionId) {
      try {
        const url = server.url()
        if (url) {
          const client = createClient(url)
          await abortSession(client, currentSessionId)
        }
      } catch {
        // Ignore errors when aborting - we're shutting down anyway
      }
    }

    // Disconnect SSE
    sse.disconnect()

    // Stop server
    await server.stop()

    // Clear title and restore terminal
    renderer.setTerminalTitle("")
    renderer.destroy()

    // Exit process
    process.exit(exitCode)
  }

  // Server ready effect - transition to ready state and connect SSE
  createEffect(() => {
    if (server.status() === "ready" && loop.state().type === "starting") {
      log.info("server", "Ready", { url: server.url(), debug: props.debug })
      // Server is ready, transition to appropriate state
      if (props.debug) {
        // Debug mode - transition to debug state
        loop.dispatch({ type: "server_ready_debug" })
      } else {
        // Normal mode - transition to ready state (waiting for user to start)
        loop.dispatch({ type: "server_ready" })
      }

      // Connect SSE
      sse.reconnect()

      // Fetch active model from config if not already set via CLI
      if (!activeModel()) {
        const url = server.url()
        if (url) {
          const client = createClient(url)
          withTimeout((signal) => client.config.get({}, { signal }), 15_000, "config.get")
            .then(res => {
              if (res.data?.model) {
                setActiveModel(res.data.model)
              }
            })
            .catch(err => {
              log.error("config", "Failed to fetch model from config", err)
            })
        }
      }

      // Validate agent if specified
      if (props.agent) {
        const url = server.url()
        if (url) {
          const client = createClient(url)
          withTimeout((signal) => client.app.agents({}, { signal }), 15_000, "app.agents")
            .then(res => {
              const primaryAgents = res.data?.filter((a: any) => a.mode === "primary").map((a: any) => a.name) || []
              if (!primaryAgents.includes(props.agent!)) {
                dialog.show(() => (
                  <DialogInvalidAgent
                    agentName={props.agent!}
                    availableAgents={primaryAgents}
                    onUseDefault={() => {
                      setActiveAgent(undefined)
                      dialog.clear()
                    }}
                    onQuit={() => handleQuit(1)}
                  />
                ))
              }
            })
            .catch(err => {
              log.error("agent", "Failed to validate agent", err)
            })
        }
      }

      // Initialize session persistence (only once)
      if (!sessionInitialized) {
        sessionInitialized = true
        initializeSession()
      }
    }
  })

  /**
   * Initialize session persistence on startup
   * - In debug mode: creates a debug session immediately
   * - In normal mode: ensures .gitignore is updated
   * - Starts immediately if --run is passed
   */
  async function initializeSession(): Promise<void> {
    // In debug mode, create a session immediately and return
    if (props.debug) {
      await createDebugSession()
      return
    }

    try {
      // Ensure .loop* is in .gitignore
      await ensureGitignore()

      // Resume after a crash: a persisted state means the OCLoop process itself
      // died mid-run. Reconcile/continue automatically with --resume, otherwise
      // offer the choice.
      const persisted = await loadLoopState()
      if (persisted && persisted.iteration > 0) {
        log.health("resume", "found", {
          iteration: persisted.iteration,
          sessionId: persisted.sessionId,
          stateType: persisted.stateType,
        })
        if (resilience().resume) {
          await doResume(persisted)
        } else {
          dialog.show(() => (
            <DialogConfirm
              title={t("dlgResumeTitle")}
              message={t("dlgResumeMsg", { iteration: persisted.iteration })}
              confirmLabel={t("dlgResumeConfirm")}
              cancelLabel={t("dlgResumeCancel")}
              onConfirm={() => {
                dialog.clear()
                void doResume(persisted)
              }}
              onCancel={() => {
                dialog.clear()
                void clearLoopState()
                if (props.run) loop.dispatch({ type: "start" })
              }}
            />
          ))
        }
        return
      }

      if (props.run) {
        // --run flag set: start immediately. The iteration-driver effect picks
        // up the running+empty-session state and kicks off the first iteration.
        loop.dispatch({ type: "start" })
      }
    } catch (err) {
      // Log error but don't block startup
      console.error("Failed to initialize session:", err)

      // If --run flag is set, start anyway
      if (props.run) {
        loop.dispatch({ type: "start" })
      }
    }
  }

  /**
   * Resume a persisted run. If the old session is still working on the server we
   * re-attach to it; otherwise (the usual case — the embedded server died with
   * us) we continue the loop with a fresh iteration, preserving the count.
   */
  async function doResume(p: PersistedLoopState): Promise<void> {
    rateLimitAttempts = p.rateLimitAttempts || 0
    const url = server.url()
    let verdict: ReconcileResult = "missing"
    if (url && p.sessionId) {
      verdict = await reconcileSession(createClient(url), p.sessionId)
    }
    log.health("resume", verdict, {
      iteration: p.iteration,
      sessionId: p.sessionId,
    })

    if (verdict === "working" && p.sessionId) {
      activityLog.addEvent(
        "session_start",
        t("actResuming", { id: p.sessionId.substring(0, 8), iteration: p.iteration }),
      )
      loop.dispatch({
        type: "resume_session",
        iteration: p.iteration,
        sessionId: p.sessionId,
      })
      watchdog.notifyIterationStart()
      void reconcileAndAdvance()
    } else {
      activityLog.addEvent(
        "task",
        t("actContinuing", { verdict }),
      )
      await clearLoopState()
      // Fresh iteration, iteration count preserved.
      loop.dispatch({ type: "resume_session", iteration: p.iteration, sessionId: "" })
    }
  }

  // Server error effect - transition to error state
  createEffect(() => {
    if (server.status() === "error" && server.error()) {
      loop.dispatch({
        type: "error",
        source: "server",
        message: server.error()?.message || "Failed to start server",
        recoverable: true,
      })
    }
  })

  // Single iteration-driver: any time we are in `running` with no active
  // session, kick off (or retry) an iteration. This is the ONE place
  // iterations start, covering the first start, the next-after-idle, resume
  // from pause, and resume from a rate-limit cooldown — including the very
  // first iteration (iteration 0), so a rate limit on the first session
  // creation can never leave the loop wedged.
  createEffect(() => {
    const state = loop.state()
    if (state.type === "running" && state.sessionId === "") {
      startIteration()
    }
  })

  // If SSE cannot reconnect after several attempts the server's event stream is
  // likely broken (not just a blip). Escalate to a server restart — which brings
  // up a fresh stream and reconciles — rather than letting heartbeats silently
  // stop. Fires once per failure streak; resets when a connection succeeds.
  const SSE_RECONNECT_RESTART_THRESHOLD = 6
  let sseRecoveryFired = false
  createEffect(() => {
    const attempts = sse.reconnectAttempts()
    if (attempts === 0) {
      sseRecoveryFired = false
      return
    }
    if (
      attempts >= SSE_RECONNECT_RESTART_THRESHOLD &&
      loop.isRunning() &&
      !sseRecoveryFired
    ) {
      sseRecoveryFired = true
      log.health("sse", "reconnect_exhausted", { attempts })
      void restartServer()
    }
  })

  // Lifecycle of the guardian and power assertion:
  // - Watchdog runs while iterating (running/pausing); it's silent otherwise.
  // - caffeinate runs while iterating OR waiting out a cooldown, so a rate-limit
  //   wait can't get suspended either.
  createEffect(() => {
    if (loop.isRunning()) {
      watchdog.start()
    } else {
      watchdog.stop()
    }

    if (loop.isRunning() || loop.isCooldown()) {
      power.start()
    } else {
      power.stop()
    }
  })

  // Persist minimal progress on every meaningful transition so a hard crash of
  // the OCLoop process (not just OpenCode) can be resumed. Atomic write. Skipped
  // in debug mode; cleared on terminal states.
  createEffect(() => {
    if (props.debug) return
    const s = loop.state()
    if (
      s.type === "running" ||
      s.type === "pausing" ||
      s.type === "paused" ||
      s.type === "cooldown"
    ) {
      const sid =
        s.type === "running" || s.type === "pausing" ? s.sessionId : null
      const snapshot: PersistedLoopState = {
        version: 1,
        iteration: loop.iteration(),
        sessionId: sid || null,
        stateType: s.type,
        rateLimitAttempts,
        updatedAt: new Date().toISOString(),
      }
      void saveLoopState(snapshot)
    } else if (s.type === "complete") {
      void clearLoopState()
    }
  })

  // Completion effect - show dialog when plan is complete
  createEffect(() => {
    const state = loop.state()
    if (state.type === "complete") {
      // Calculate total time from stats
      const totalTime = stats.totalActiveTime()
      
      dialog.show(() => (
        <DialogCompletion
          iterations={state.iterations}
          totalTime={totalTime}
          summary={state.summary.summary}
          onDismiss={() => dialog.clear()}
          onQuit={() => handleQuit()}
        />
      ))
    }
  })

  // Error effect - show dialog when error occurs
  createEffect(() => {
    const state = loop.state()
    if (state.type === "error") {
      dialog.show(() => (
        <DialogError
          source={state.source}
          message={state.message}
          recoverable={state.recoverable}
          onRetry={() => {
            dialog.clear()
            if (loop.canRetry()) {
              loop.dispatch({ type: "retry" })
            }
          }}
          onQuit={() => handleQuit(1)}
        />
      ))
    }
  })
  
  /**
   * Helper to show terminal error dialog
   */
  const showTerminalError = (name: string, error: string) => {
    const attachCmd = (sessionId() || lastSessionId()) && server.url() 
      ? getAttachCommand(server.url()!, (sessionId() || lastSessionId())!) 
      : ""
    dialog.show(() => (
      <DialogTerminalError
        terminalName={name}
        errorMessage={error}
        attachCommand={attachCmd}
        onCopy={onErrorCopy}
        onClose={() => dialog.clear()}
      />
    ))
  }

  /**
   * Execute launch and handle errors
   */
  async function launchConfiguredTerminal(sid: string, terminalConfig: OcloopConfig['terminal']) {
     if (!terminalConfig) return
     
     const url = server.url()
     if (!url) return
     
     const attachCmd = getAttachCommand(url, sid)
     log.info("terminal", "Launching", { 
        sessionId: sid, 
        terminal: terminalConfig, 
        command: attachCmd 
     })

     const result = await launchTerminal(terminalConfig, attachCmd)
     
     log.info("terminal", "Launch result", result)

     if (!result.success) {
        showTerminalError(
           terminalConfig.type === 'known' ? terminalConfig.name : 'Custom',
           result.error || "Unknown error"
        )
     }
  }
  
  // Handlers for Terminal Config Dialog
  const onConfigSelect = async (terminal: KnownTerminal) => {
     // Save config
     const newConfig: OcloopConfig = {
        ...ocloopConfig(),
        terminal: {
           type: 'known',
           name: terminal.name
        }
     }
     
     await saveConfig(newConfig)
     setOcloopConfig(newConfig)
     dialog.clear()
     
     // Launch!
     const sid = sessionId() || lastSessionId()
     if (sid) {
        launchConfiguredTerminal(sid, newConfig.terminal)
     }
  }
  
  const onConfigCustom = async (command: string, args: string) => {
     // Save config
     const newConfig: OcloopConfig = {
        ...ocloopConfig(),
        terminal: {
           type: 'custom',
           command,
           args
        }
     }
     
     await saveConfig(newConfig)
     setOcloopConfig(newConfig)
     dialog.clear()
     
     // Launch!
     const sid = sessionId() || lastSessionId()
     if (sid) {
        launchConfiguredTerminal(sid, newConfig.terminal)
     }
  }
  
  const onConfigCopy = () => {
     const sid = sessionId() || lastSessionId()
     const url = server.url()
     if (sid && url) {
        const cmd = getAttachCommand(url, sid)
        copyToClipboard(cmd)
        toast.show({ variant: "success", message: t("toastCopied") })
     }
     dialog.clear()
  }
  
  const onErrorCopy = () => {
     const sid = sessionId() || lastSessionId()
     const url = server.url()
     if (sid && url) {
        const cmd = getAttachCommand(url, sid)
        copyToClipboard(cmd)
        toast.show({ variant: "success", message: t("toastCopied") })
     }
  }

  // Create state for terminal config dialog
  const terminalConfigState = createTerminalConfigState(
    availableTerminals,
    onConfigSelect,
    onConfigCustom,
    onConfigCopy,
    () => dialog.clear()
  )

  // Register commands
  createEffect(() => {
    // Re-register commands when session ID changes so we can enable/disable them
    // and provide current session ID to callbacks
    const sid = sessionId() || lastSessionId()
    const url = server.url()
    const hasSession = !!sid

    command.register(() => {
      const st = loop.state().type
      const opts: CommandOption[] = [
      // --- Loop control (context-aware) ---
      {
        title: t("cmdStart"),
        value: "loop_start",
        category: t("catLoop"),
        keybind: "S",
        disabled: !loop.canStart(),
        onSelect: () => {
          dialog.clear()
          loop.dispatch({ type: "start" })
        },
      },
      {
        title: t("cmdPause"),
        value: "loop_pause",
        category: t("catLoop"),
        keybind: "Space",
        disabled: st !== "running",
        onSelect: () => {
          dialog.clear()
          loop.dispatch({ type: "toggle_pause" })
        },
      },
      {
        title: t("cmdResume"),
        value: "loop_resume",
        category: t("catLoop"),
        keybind: "Space",
        disabled: st !== "paused",
        onSelect: () => {
          dialog.clear()
          loop.dispatch({ type: "toggle_pause" })
        },
      },
      {
        title: t("cmdCancelPause"),
        value: "loop_cancel_pause",
        category: t("catLoop"),
        disabled: st !== "pausing",
        onSelect: () => {
          dialog.clear()
          loop.dispatch({ type: "toggle_pause" })
        },
      },
      {
        title: t("cmdRestartServer"),
        value: "server_restart",
        category: t("catLoop"),
        disabled: !url,
        onSelect: () => {
          dialog.clear()
          toast.show({ variant: "info", message: t("toastRestarting") })
          void restartServer()
        },
      },
      // --- Terminal ---
      {
        title: t("cmdCopyAttach"),
        value: "copy_attach",
        category: t("catTerminal"),
        keybind: "C",
        disabled: !hasSession,
        onSelect: () => {
          if (sid && url) {
            const cmd = getAttachCommand(url, sid)
            copyToClipboard(cmd)
            toast.show({ variant: "success", message: t("toastCopied") })
          }
        },
      },
      {
        title: t("cmdChooseTerminal"),
        value: "terminal_config",
        category: t("catTerminal"),
        keybind: "T",
        disabled: !hasSession,
        onSelect: () => {
          dialog.clear()
          dialog.show(() => (
            <DialogTerminalConfig
              state={terminalConfigState}
              onCancel={() => dialog.clear()}
            />
          ))
        },
      },
      // --- View / language ---
      {
        title: t("cmdToggleScrollbar"),
        value: "toggle_scrollbar",
        category: t("catView"),
        onSelect: async () => {
          const current = ocloopConfig().scrollbar_visible ?? true
          const newConfig = {
            ...ocloopConfig(),
            scrollbar_visible: !current
          }
          setOcloopConfig(newConfig)
          await saveConfig(newConfig)
          dialog.clear()
        },
      },
      {
        // Inherently bilingual label: shows the language you'll switch TO.
        title: getLocale() === "en" ? "Language → Español" : "Idioma → English",
        value: "toggle_language",
        category: t("catLanguage"),
        onSelect: async () => {
          const next: Locale = getLocale() === "en" ? "es" : "en"
          setLocale(next)
          const newConfig = { ...ocloopConfig(), language: next }
          setOcloopConfig(newConfig)
          await saveConfig(newConfig)
          toast.show({ variant: "success", message: t("toastLanguageChanged") })
          dialog.clear()
        },
      },
      // --- General ---
      {
        title: t("cmdQuit"),
        value: "quit",
        category: t("catView"),
        keybind: "Q",
        onSelect: () => {
          dialog.clear()
          showQuitConfirmation()
        },
      },
      ]

      // Chaos fault-injection commands (debug + --chaos only) for soak testing.
      if (chaos.isEnabled()) {
        const chaosCmd = (
          title: string,
          value: string,
          run: () => void,
          message: string,
        ): CommandOption => ({
          title,
          value,
          category: "Chaos",
          onSelect: () => {
            run()
            toast.show({ variant: "info", message })
            dialog.clear()
          },
        })
        opts.push(
          chaosCmd("Chaos: kill server", "chaos_kill", () => chaos.killServer(), "Chaos: server killed"),
          chaosCmd("Chaos: revive server", "chaos_revive", () => chaos.reviveServer(), "Chaos: server revived"),
          chaosCmd("Chaos: freeze session", "chaos_freeze", () => chaos.freezeSession(), "Chaos: session frozen"),
          chaosCmd("Chaos: unfreeze session", "chaos_unfreeze", () => chaos.unfreezeSession(), "Chaos: session unfrozen"),
          chaosCmd("Chaos: inject rate limit", "chaos_429", () => enterCooldown("chaos: injected 429", 5), "Chaos: rate limit injected"),
        )
      }

      return opts
    })
  })

  // Register shutdown handler for SIGINT/SIGTERM signals
  onMount(() => {
    shutdownManager.register(handleQuit)
    // Initial plan parsing
    refreshPlan()

    onCleanup(() => {
      shutdownManager.unregister()
      sleepDetector?.stop()
      power.stop()
    })
  })

  // Input handler for keybindings
  useKeyboard((key) => {
    // Log key press (only if verbose mode is enabled)
    if (props.verbose) {
      log.debug("keybinding", "Key pressed", { 
        key: key.name, 
        sequence: key.sequence,
        state: loop.state().type,
        sessionId: sessionId(),
        lastSessionId: lastSessionId()
      })
    }

    // If a dialog is open, let the dialog handle all input
    if (dialog.hasDialogs()) {
      return
    }

    // Ctrl+P - open command palette
    if (key.ctrl && key.name === "p") {
      command.show()
      key.preventDefault()
      return
    }

    // Debug mode handling
    if (loop.isDebug()) {
      // Detached in debug mode - handle our keybindings
      if (key.name === "n") {
        // N - create new session
        createDebugSession()
        key.preventDefault()
        return
      }
      
      if (key.name === "q") {
        // Q - show quit confirmation
        showQuitConfirmation()
        key.preventDefault()
        return
      }

      if (key.name === "i") {
        // I - insert sample activity for UI testing
        insertSampleActivity()
        toast.show({ variant: "info", message: t("toastSampleInserted") })
        key.preventDefault()
        return
      }

      if (key.name === "p") {
        // P - prompt dialog
        const sid = sessionId() || lastSessionId()
        if (!sid) {
          toast.show({ variant: "info", message: t("toastNoSessionPrompt") })
          key.preventDefault()
          return
        }

        dialog.show(() => (
          <DialogPrompt
            onSubmit={(text) => {
              if (text.trim()) {
                sendDebugPrompt(text.trim())
              }
              dialog.clear()
            }}
            onCancel={() => dialog.clear()}
          />
        ))
        key.preventDefault()
        return
      }

      if (key.name === "t") {
         const sid = sessionId() || lastSessionId()
         if (sid) {
            const config = ocloopConfig()
            if (hasTerminalConfig(config)) {
               launchConfiguredTerminal(sid, config.terminal)
            } else {
               dialog.show(() => (
                  <DialogTerminalConfig
                     state={terminalConfigState}
                     onCancel={() => dialog.clear()}
                  />
               ))
            }
         } else {
            toast.show({ variant: "info", message: t("toastNoSessionAttach") })
         }
         key.preventDefault()
         return
      }
      
      // Consume other input in debug mode when detached
      key.preventDefault()
      return
    }

    // Ready state - handle S to start iterations
    if (loop.canStart()) {
      if (key.name === "s") {
        // The iteration-driver effect starts the first iteration once we enter
        // running with an empty session.
        loop.dispatch({ type: "start" })
        key.preventDefault()
        return
      }
      if (key.name === "q") {
        showQuitConfirmation()
        key.preventDefault()
        return
      }
      // Consume other input in ready state
      key.preventDefault()
      return
    }

    // Complete state - Q to exit
    if (loop.state().type === "complete") {
      if (key.name === "q") {
        handleQuit()
      }
      key.preventDefault()
      return
    }

    // Detached - handle our keybindings
    if (key.name === "t") {
       const sid = sessionId() || lastSessionId()
       if (sid) {
          const config = ocloopConfig()
          if (hasTerminalConfig(config)) {
             launchConfiguredTerminal(sid, config.terminal)
          } else {
             dialog.show(() => (
                <DialogTerminalConfig
                   state={terminalConfigState}
                   onCancel={() => dialog.clear()}
                />
             ))
          }
       } else {
          toast.show({ variant: "info", message: t("toastNoSessionAttach") })
       }
       key.preventDefault()
       return
    }

    if (key.name === "space") {
      if (loop.canPause()) {
        loop.dispatch({ type: "toggle_pause" })
      }
      key.preventDefault()
      return
    }

    if (key.name === "q") {
      if (loop.canQuit()) {
        showQuitConfirmation()
      }
      key.preventDefault()
      return
    }

    // Error state - handle R for retry and Q for quit
    if (loop.isError()) {
      if (key.name === "r") {
        if (loop.canRetry()) {
          loop.dispatch({ type: "retry" })
        }
        key.preventDefault()
        return
      }
      if (key.name === "q") {
        handleQuit(1)
      }
      // consume other input in error state
      key.preventDefault()
      return
    }

    // Let opentui handle other input (scrolling, etc.)
  })

  return (
    <box style={{ flexDirection: "column", flexGrow: 1 }}>
      {/* Dashboard at the top */}
      <Dashboard
        isActive={true}
        state={loop.state()}
        progress={planProgress()}
        stats={stats}
        currentTask={currentTask() ?? null}
        model={activeModel()}
        agent={activeAgent()}
        cooldownRemainingMs={cooldownRemainingMs()}
        watchdogHealth={watchdog.health()}
      />

      {/* Activity Log takes remaining space */}
      <ActivityLog 
        events={activityLog.events()} 
        tokens={sessionStats.tokens()}
        diff={sessionStats.diff()}
        showScrollbar={ocloopConfig().scrollbar_visible ?? true}
      />

      {/* Overlays */}

    </box>
  )
}
