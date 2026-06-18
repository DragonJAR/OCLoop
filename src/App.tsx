import path from "path"
import {
  createSignal,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  untrack,
} from "solid-js"
import {
  useRenderer,
} from "@opentui/solid"

import { useServer } from "./hooks/useServer"
import { useSSE, classifySessionError } from "./hooks/useSSE"
import { useLoopState, getActiveSessionId } from "./hooks/useLoopState"
import { useKeybindings } from "./hooks/useKeybindings"
import { useCooldown } from "./hooks/useCooldown"
import { useCommandPalette } from "./hooks/useCommandPalette"
import { useTerminalLauncher } from "./hooks/useTerminalLauncher"
import { useResume } from "./hooks/useResume"
import { useWatchdog } from "./hooks/useWatchdog"
import { useLoopStats } from "./hooks/useLoopStats"
import { useSessionStats } from "./hooks/useSessionStats"
import { useActivityLog } from "./hooks/useActivityLog"
import { log } from "./lib/debug-logger"
import { parsePlanFile, getCurrentTask, getPlanCompleteSummary, parsePlan, parsePlanComplete, isStructurallyComplete, buildCompletionSummary, withPlanCompleteTag, parseSubtasksFromReply, replaceFirstPendingTaskWithSubtasks } from "./lib/plan-parser"
import { DEFAULTS } from "./lib/constants"
import { resolvePlanFile } from "./lib/plan-file"
import { resolveActiveSessionId } from "./lib/active-session-id"
import { getToolPreview } from "./lib/format"
import { lookupCost, estimateCost } from "./lib/pricing"
import { shutdownManager } from "./lib/shutdown"
import {
  saveLoopState,
  clearLoopState,
  type PersistedLoopState,
} from "./lib/loop-state-store"
import {
  loadConfig,
  saveConfig,
  resolveResilience,
  type OcloopConfig,
  type ResilienceConfig,
} from "./lib/config"
import {
  createSession,
  sendPromptAsync,
  abortSession,
  configureApiTimeouts,
  reconcileSession,
  tryGetClient,
  type ReconcileResult,
} from "./lib/api"
import { withTimeout } from "./lib/with-timeout"
import { computeBackoff } from "./lib/backoff"
import { monotonicNow } from "./lib/clock"
import { t } from "./lib/i18n"
import { createSleepDetector, type SleepDetector } from "./lib/sleep-detector"
import { createPowerManager } from "./lib/power"
import { createChaos } from "./lib/chaos"
import { NoProgressDetector } from "./lib/no-progress-detector"
import { runOneShotAgent } from "./lib/one-shot-agent"
import { resolveAgentAndModel, type OcAgent, type OcConfig, type ResolvedAgentModel } from "./lib/resolve-agent-model"
import {
  detectInstalledTerminals,
  type KnownTerminal
} from "./lib/terminal-launcher"
import { routeSessionError } from "./lib/error-router"
import { ThemeProvider, useTheme } from "./context/ThemeContext"
import { DialogProvider, DialogStack, useDialog } from "./context/DialogContext"
import { CommandProvider, useCommand } from "./context/CommandContext"
import { ToastProvider, Toast, useToast } from "./context/ToastContext"
import { DialogConfirm } from "./ui/DialogConfirm"
import {
  Dashboard,
  DialogCompletion,
  DialogError,
  ActivityLog,
  BottomPanel,
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
  const { theme } = useTheme()
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
  // Race gate for the server-ready createEffect: resilience is seeded with the
  // CLI layer only; the on-disk config layer lands after onMount awaits
  // loadConfig. Without this gate, if the server becomes ready first the
  // effect would run initializeSession with the default (resume=false),
  // silently overriding a user's config. Flips to true at the end of onMount.
  const [resilienceReady, setResilienceReady] = createSignal(false)

  // --- Rate-limit cooldown orchestration (extracted to useCooldown) ---
  const cooldown = useCooldown({
    resilience,
    stateType: () => loop.state().type,
    dispatch: (action) => loop.dispatch(action),
    addEvent: (type, message, opts) => activityLog.addEvent(type, message, opts),
    t,
  })

  // Trailing debounce for PLAN.md-triggered refreshPlan() calls: a multi-edit
  // tool call fires several file.edited SSE events in quick succession; 150ms
  // coalesces the burst so setPlanProgress doesn't race and flicker the bar.
  let refreshPlanTimer: ReturnType<typeof setTimeout> | null = null
  // Monotonic timestamp of the last iteration kickoff, for minIterationGap.
  let lastIterationStartAt = 0
  // In-flight guard: createSession is async; without this a second trigger
  // mid-flight would create a second session and orphan the first. Not
  // persisted — iteration_started is the source of truth for "we have a session".
  let startingIteration = false
  // Re-entry guard for handleQuit: abortSession is a non-idempotent HTTP call,
  // so a concurrent trigger (quit confirm + Ctrl+C) would fire it twice.
  let isShuttingDown = false
  // Re-entry guard for restartServer: three callers (watchdog, SSE-exhaustion,
  // command palette) can invoke it independently; the duplicate is wasteful not
  // correctness-breaking, but the user-visible duplicate activity entry warrants
  // the guard. Reset in a finally (unlike isShuttingDown) to allow sequential restarts.
  let restartServerInProgress = false

  // --- No-progress detector ---
  // Counts consecutive iterations starting with the same PLAN.md task; halts
  // with errNoProgress when it reaches noProgressThreshold. Without this an
  // agent that idles cleanly without ever editing PLAN.md would loop forever
  // (idle != stuck for the watchdog). Created lazily after resilience resolves
  // so the threshold seed is available; overridden via --resilience noProgressThreshold=N.
  let noProgressDetector: NoProgressDetector | null = null
  function ensureNoProgressDetector(): NoProgressDetector {
    if (!noProgressDetector) {
      noProgressDetector = new NoProgressDetector(
        Math.max(1, resilience().noProgressThreshold | 0),
      )
    }
    return noProgressDetector
  }
  // Tasks already split via the no-progress "split task" recovery this run, so
  // an already-decomposed task is not offered for splitting again.
  // ponytail: in-memory Set; a PLAN.md marker would persist across restarts.
  const decomposedTasks = new Set<string>()

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
        cooldown.clearTimers()
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
      // Reuse getActiveSessionId so a future extension auto-extends the watchdog.
      isActive: () => getActiveSessionId(loop.state()) !== "",
      pingServer: () => chaos.ping(() => server.ping()),
      reconcile: () =>
        chaos.reconcile(async () => {
          const sid = getActiveSessionId(loop.state())
          const client = tryGetClient(server.url)
          if (!client || !sid) return "unknown"
          return reconcileSession(client, sid)
        }),
    },
    actions: {
      reconnectSSE: () => {
        activityLog.addEvent("task", t("actGuardReconnect"))
        sse.reconnect()
      },
      synthesizeIdle: () => {
        activityLog.addEvent("session_idle", t("actGuardSynthIdle"))
        cooldown.resetAttempts()
        loop.dispatch({ type: "session_idle" })
      },
      abortAndRetry: async () => {
        activityLog.addEvent("task", t("actGuardAbort"), { level: "warn" })
        const sid = getActiveSessionId(loop.state())
            const client = tryGetClient(server.url)
        if (client && sid) {
          try {
            await abortSession(client, sid)
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
  // Estimated USD cost for the whole run (accumulated tokens × per-model price).
  const costEstimate = createMemo(() => estimateCost(sessionStats.tokens(), lookupCost(activeModel())))

  // Active agent
  const [activeAgent, setActiveAgent] = createSignal<string | undefined>(props.agent)

  // Track if we've initialized (to prevent double initialization)
  let sessionInitialized = false

  // Track previous state for detecting transitions
  let prevState: LoopState | null = null
  // True between entering a rate-limit cooldown and the retry that resumes the
  // SAME iteration, so stats resume (preserving the timer) instead of restarting
  // it and discarding the pre-cooldown active time.
  let pendingCooldownResume = false

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
      if (pendingCooldownResume) {
        // Retry of the same iteration after a rate-limit cooldown: resume the
        // (paused) timer instead of restarting it, so the pre-cooldown active
        // time isn't discarded and the wait itself stays excluded.
        stats.resume()
        pendingCooldownResume = false
      } else {
        stats.startIteration()
        sessionStats.resetTaskTokens()
      }
      log.iterationStart(state.iteration)
      log.debug("state", "Iteration started", { sessionId: state.sessionId, iteration: state.iteration })
      // Refresh current task from plan file as fallback for SSE todo updates
      refreshCurrentTask()
    }

    // Detect pause: transitioning from running to pausing
    if (state.type === "pausing" && prev.type === "running") {
      stats.pause()
    }

    // Detect rate-limit cooldown: pause the active timer so the wait isn't
    // counted, and mark the next iteration-start as a resume (see above).
    // Only the running→cooldown path needs this: for pausing→cooldown the timer
    // was already paused at running→pausing, and resume_cooldown lands in paused
    // (not running), so setting pendingCooldownResume here would mis-attribute time.
    if (state.type === "cooldown" && prev.type === "running") {
      stats.pause()
      pendingCooldownResume = true
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

    // Run reached a terminal state: freeze the global wall-clock timer (once).
    if (
      (state.type === "complete" || state.type === "stopped" || state.type === "error") &&
      prev.type !== "complete" &&
      prev.type !== "stopped" &&
      prev.type !== "error"
    ) {
      stats.markRunEnd()
    }

    // Recoverable error was retried (R): the run resumes, so un-freeze the
    // global timer that markRunEnd stamped at the error. Without this the
    // wall-clock display stays frozen at the error instant for the whole
    // retried run. complete/stopped are genuinely terminal (no retry), so we
    // only un-freeze when leaving `error` for a non-terminal state.
    if (
      prev.type === "error" &&
      state.type !== "error" &&
      state.type !== "complete" &&
      state.type !== "stopped"
    ) {
      stats.unfreezeRun()
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

    // `detectInstalledTerminals` shells out per entry in KNOWN_TERMINALS
    // via `Bun.spawn`; a rejection here (FD exhaustion, weird $PATH, killed
    // mid-spawn) would propagate out of this onMount body and trigger the
    // unhandledRejection handler in `index.tsx:300-304`, exiting the process
    // before the TUI ever renders. Wrapped following the pattern of
    // detectInstalledTerminals shells out per entry; a rejection here would crash
    // the process before the TUI renders. Wrapped so degraded UX (empty list) is
    // better than a crash. loadConfig keeps its own internal try/catch.
    try {
      const terminals = await detectInstalledTerminals()
      setAvailableTerminals(terminals)
    } catch (err) {
      log.error("terminal", "Failed to detect installed terminals", err)
    }
    // Finding 15.8.A: release the server-ready createEffect now that the
    // on-disk config layer has been merged into `resilience`. The order
    // matters — set AFTER both `setResilience(resolved)` (line 475) and
    // `setAvailableTerminals(terminals)` so the first effect re-run sees
    // the fully-resolved state. Mirrors the timing of the synchronous
    // `setResilience` in `onMount`'s body.
    setResilienceReady(true)
  })

  // SSE subscription (only when server is ready)
  const sse = useSSE({
    url: () => server.url() || "",
    sessionId: sessionId,
    autoConnect: false, // We'll connect when server is ready
    handlers: {
      onSessionCreated: (id) => {
        activityLog.addEvent("session_start", t("actSessionStarted", { id: id.substring(0, 8) }))
        setLastSessionId(id)
      },
      onSessionError: (eventSessionId, error) => {
        const state = loop.state()
        // Ignore errors for a session that is no longer the active one. A stale
        // aborted error from a just-replaced session (arriving in the brief
        // running("") window) would otherwise toggle_pause and wedge the loop in
        // pausing(""). Mirrors the session-id guard onSessionIdle already applies.
        //
        // Policy: the `eventSessionId &&` truthy guard is defense-in-depth
        // here — the hook layer already drops un-attributed events uniformly
        // (see the per-session filter policy at useSSE.ts:359, Finding 7.3.A),
        // so this branch is unreachable in practice. It is kept because the
        // sessionID comparison is what protects against stale-session errors
        // for events that DO carry a sessionID, and the truthy guard makes the
        // policy explicit at the consumer. The state-aware branches below
        // (running/pausing/debug) are the authoritative arbiter of which
        // states accept errors and already drop errors in other states.
        const debugSid = state.type === "debug" ? state.sessionId : undefined
        if (eventSessionId && eventSessionId !== getActiveSessionId(state) && eventSessionId !== debugSid) {
          return
        }
        const st = state.type
        if (error.isAborted) {
          // Abort is call-site specific: SSE toggles pause, the API path does not
          // abort through here. routeSessionError returns null for isAborted so the
          // abort policy stays here.
          activityLog.addEvent("task", t("actSessionAborted"))
          if (st === "running") {
            loop.dispatch({ type: "toggle_pause" })
          }
          return
        }
        // The kind→action policy lives in routeSessionError; this handler owns
        // the activity-log write and the i18n message key, which differ per source.
        const action = routeSessionError(error, st, "sse")
        if (!action) return
        if (action.type === "cooldown") {
          // Per-kind copy: rate_limit uses `actRateLimit` (warn), transient
          // uses `actSessionError` (warn). Both are recoverable, so a
          // `level: "warn"` is correct.
          const logKey = action.kind === "rate_limit" ? "actRateLimit" : "actSessionError"
          activityLog.addEvent("error", t(logKey, { message: action.message }), { level: "warn" })
          cooldown.enterCooldown(action.message, action.retryAfter, action.kind)
          return
        }
        if (action.type !== "error") return
        // action.type === "error" — auth/fatal surfaced mid-iteration.
        activityLog.addEvent("error", t("actSessionError", { message: action.errorMessage }))
        loop.dispatch({
          type: "error",
          source: "sse",
          message: t("actSessionError", { message: action.errorMessage }),
          recoverable: action.recoverable,
        })
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
          cooldown.resetAttempts()
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
        // Re-parse plan if PLAN.md was edited. The activity log entry
        // stays real-time (so the user sees the edit happen as it
        // occurs); only the file read + parse + setPlanProgress is
        // trailing-debounced to coalesce rapid-fire edits from a
        // single multi-edit tool call. Source: MEJORAS.md
        // Finding 15.5.A.
        const planFile = resolvePlanFile(props.planFile)
        const absolutePlanPath = path.resolve(planFile)
        const absoluteFilePath = path.resolve(file)

        if (absoluteFilePath === absolutePlanPath) {
          if (refreshPlanTimer) clearTimeout(refreshPlanTimer)
          refreshPlanTimer = setTimeout(() => {
            refreshPlanTimer = null
            refreshPlan()
            // Also refresh current task as fallback for SSE todo updates
            refreshCurrentTask()
          }, 150)
        }
      },
      onStepFinish: (part) => {
        heartbeat()
        // Map the nested cache shape to the flat SessionTokens fields — passing
        // part.tokens directly left cacheRead/cacheWrite undefined (always 0).
        sessionStats.addTokens({
          input: part.tokens.input,
          output: part.tokens.output,
          cacheRead: part.tokens.cache.read,
          cacheWrite: part.tokens.cache.write,
        })
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
      const progress = await parsePlanFile(resolvePlanFile(props.planFile))
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
      const task = await getCurrentTask(resolvePlanFile(props.planFile))
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
      const planPath = resolvePlanFile(props.planFile)
      const file = Bun.file(planPath)
      if (!(await file.exists())) return false
      const content = await file.text()

      // Already marked complete (tag present, any reasonable format)?
      if (parsePlanComplete(content) !== null) return true

      // Structural completion: NO automatable task remains (every actionable task is
      // already [x]/[BLOCKED]). The tooling owns this — it does not depend on the
      // model writing the tag. Completion needs ALL tasks done, so a single
      // prematurely-marked task can't end the run. When complete, write the
      // <plan-complete> summary ourselves (deterministic) so the completion dialog
      // and restart-resilience work, then report complete.
      const progress = parsePlan(content)
      if (isStructurallyComplete(progress)) {
        // Compare-and-swap against a concurrent PLAN.md edit by the agent: the
        // read above and this write span two awaits, during which the model can
        // legitimately edit PLAN.md (e.g. unchecking the last task, or adding a
        // new one). Re-read and only proceed when the file is byte-identical to
        // what we based the completion decision on — otherwise we'd clobber the
        // agent's edit with stale content + a <plan-complete> tag and false-
        // complete the run. If it changed, don't complete this cycle; the next
        // check (after the edit settles) re-evaluates against fresh content.
        const current = await Bun.file(planPath).text()
        if (current !== content) {
          log.debug("state", "Plan changed during completion check; deferring", {})
          return false
        }
        await Bun.write(planPath, withPlanCompleteTag(content, buildCompletionSummary(progress)))
        return true
      }
      return false
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
    const sid = getActiveSessionId(loop.state())
    const client = tryGetClient(server.url)
    if (!client || !sid) return "unknown"

    const result = await reconcileSession(client, sid)
    log.health("reconcile", result, { sessionId: sid })

    if (result === "idle" || result === "missing") {
      activityLog.addEvent(
        "session_idle",
        t("actReconciled", { result }),
      )
      cooldown.resetAttempts()
      loop.dispatch({ type: "session_idle" })
    }
    return result
  }

  /**
   * Recover from a hung server: restart it, reconnect SSE to the (possibly new)
   * URL, and reconcile the in-flight session. Used by the watchdog and on wake.
   */
  async function restartServer(): Promise<void> {
    if (restartServerInProgress) return
    restartServerInProgress = true
    try {
      log.health("server", "recovery_restart", { url: server.url() })
      activityLog.addEvent("error", t("actGuardRestart"))
      await server.restart()
      sse.reconnect()
      const verdict = await reconcileAndAdvance()
      // If the session survived the restart and is still working, grant it a fresh
      // heartbeat window. Otherwise the watchdog would re-measure silence from the
      // now-stale pre-restart timestamp and trip STUCK again on the very next tick,
      // collapsing the recovery ladder into a near-instant circuit-breaker fail.
      // (recoveryAttempts is NOT reset, so the breaker still bounds total attempts.)
      if (verdict === "working") {
        watchdog.notifyWake()
      }
    } finally {
      restartServerInProgress = false
    }
  }

  /**
   * Route an iteration-start failure. Rate limits AND transient connection blips
   * (dropped socket, reset, timeout, 5xx) both back off and retry the same
   * iteration automatically — an unattended harness shouldn't stop on a flaky
   * network. Only auth/fatal errors (and exhausted retries) surface as a
   * recoverable error needing the user.
   */
  function handleIterationError(err: unknown): void {
    const classified = classifySessionError(err)
    // The kind→action policy lives in routeSessionError (shared with the SSE
    // onSessionError handler). The API path only runs while running, so the
    // helper's state gate always passes here; it returns null for isAborted
    // (API path doesn't abort through this surface) and surfaces auth/fatal as
    // non-recoverable errors.
    const action = routeSessionError(classified, loop.state().type, "api")
    if (!action) return
    if (action.type === "cooldown") {
      cooldown.enterCooldown(action.message, action.retryAfter, action.kind)
      return
    }
    // auth/fatal: the i18n key differs from the SSE path (errIterationStart vs
    // actSessionError), so formatting stays at the call site.
    if (action.type !== "error") return
    loop.dispatch({
      type: "error",
      source: "api",
      message: t("errIterationStart", { message: action.errorMessage }),
      recoverable: action.recoverable,
    })
  }

  /**
   * Create a new session and start an iteration
   */
  async function startIteration(): Promise<void> {
    // In-flight guard: the iteration driver re-runs whenever state becomes
    // running(""), and createSession is async. Without this, a second trigger
    // arriving mid-flight would create a second session and orphan the first
    // (it keeps running on the server, burning tokens, never aborted).
    if (startingIteration) return
    // Resolve once and reuse across the iteration; the catch reuses the same
    // client for the best-effort abort (no second createClient / url resolve).
    const client = tryGetClient(server.url)
    if (!client) {
      log.error("iteration", "Cannot start iteration: server not ready")
      return
    }
    startingIteration = true
    // Hoisted so the catch below can abort the session if sendPromptAsync
    // (or any later step) throws — otherwise the server keeps a session
    // that no client is reading from, and the next iteration orphans it
    // by creating a new one. See Finding 4.1.C.
    let newSessionId: string | undefined

    try {
      // Check for plan completion first
      if (await checkPlanComplete()) {
        const planPath = resolvePlanFile(props.planFile)
        // We know it's complete, but getPlanCompleteSummary re-reads the file
        // to extract the summary text. A FS error between the two awaits
        // (e.g. file replaced with a directory, permission flip) must not
        // be misclassified as an iteration error — the plan IS complete,
        // only the human-readable summary is best-effort. Source: MEJORAS.md
        // Finding 17.4.A.
        let summaryContent: string | null = null
        try {
          summaryContent = await getPlanCompleteSummary(planPath)
        } catch (err) {
          log.warn("plan", "Plan complete but summary unreadable", err)
        }

        // A real completion is itself the strongest "progress" signal
        // possible — drop the streak so the next plan (or a manual
        // resume) starts fresh.
        noProgressDetector?.reset()
        loop.dispatch({
          type: "plan_complete",
          summary: { summary: summaryContent || t("dlgPlanCompleteFallback") }
        })
        return
      }

      // No-progress halt: compare the current first-pending task against the
      // previous iteration's. If they match for N consecutive iterations the
      // agent is stuck redoing the same work without editing PLAN.md, so we halt
      // with an actionable error instead of burning another session. This read
      // is the single source of truth for "what is the loop working on now"; a
      // null task (no pending work) resets the streak — nothing to be stuck on.
      let currentTask: string | null = null
      try {
        currentTask = await getCurrentTask(resolvePlanFile(props.planFile))
      } catch (err) {
        // The task read is best-effort for the detector — the real
        // completion check above already verified the file is readable.
        // If this throws (race with a file replace, perm flip), treat
        // it as "no task" so the detector resets rather than
        // misclassifying the error as progress.
        log.warn("plan", "No-progress detector task read failed", err)
        currentTask = null
      }
      const detector = ensureNoProgressDetector()
      const streak = detector.recordIterationStart(currentTask)
      if (detector.isStuck()) {
        const stuckTask = detector.currentTask ?? ""
        log.error(
          "loop",
          "No-progress halt",
          { streak, threshold: resilience().noProgressThreshold, task: stuckTask },
        )
        loop.dispatch({
          type: "error",
          source: "plan",
          message: t("errNoProgress", { count: streak, task: stuckTask }),
          recoverable: true,
          decomposableTask: stuckTask,
        })
        return
      }

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

      // Create a new session
      const session = await createSession(client)
      newSessionId = session.id

      // Dispatch iteration started
      loop.dispatch({ type: "iteration_started", sessionId: newSessionId })
      // Race guard: `createSession` is async. If the user paused (Space) or
      // quit (Q) DURING the await above, the reducer no-op'd `iteration_started`
      // (state is no longer running/paused, see useLoopState `iteration_started`),
      // so this session is untracked — nothing would ever abort it and it'd keep
      // running on the server burning tokens. Abort it now and bail before sending
      // the prompt. Best-effort, same pattern as the catch block / watchdog.
      if (getActiveSessionId(loop.state()) !== newSessionId) {
        try {
          await abortSession(client, newSessionId)
        } catch {
          // Best effort — the session may already be gone.
        }
        return
      }
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
      const prompt = promptContent.replaceAll("{{PLAN_FILE}}", resolvePlanFile(props.planFile))
      // Guard: an empty / whitespace-only prompt would either 4xx the server
      // (classified fatal) or, worse, idle the session and re-fire the same
      // empty prompt in a tight loop. Fail fast with the same path the
      // missing-file branch uses (top-level catch → fatal → recoverable error).
      if (prompt.trim() === "") {
        throw new Error(
          `Prompt file is empty: ${props.promptFile || DEFAULTS.PROMPT_FILE}`,
        )
      }

      // Send the prompt asynchronously
      await sendPromptAsync(client, {
        sessionID: newSessionId,
        parts: [{ type: "text", text: prompt }],
        agent: activeAgent(),
        model: activeModel(),
      })

      // Refresh plan progress
      await refreshPlan()
    } catch (err) {
      // Best-effort: abort the session we just created so a failure after
      // createSession (e.g. sendPromptAsync) doesn't leave it running on
      // the server. If createSession itself failed, newSessionId is still
      // undefined and we skip. Mirrors the abortAndRetry cleanup at line
      // ~274. Finding 4.1.C.
      if (newSessionId) {
        try {
          await abortSession(client, newSessionId)
        } catch {
          // Best effort — the session may already be gone.
        }
      }
      // Rate limits → cooldown + retry; anything else → recoverable error.
      handleIterationError(err)
    } finally {
      startingIteration = false
    }
  }

  /**
   * Helper to insert localized sample activity for UI testing.
   */
  const insertSampleActivity = () => {
    activityLog.addEvent("session_start", t("sampleSessionStarted"))
    activityLog.addEvent("user_message", t("sampleUserMessage"))
    activityLog.addEvent("assistant_message", t("sampleAssistantMessage"))
    activityLog.addEvent("reasoning", t("sampleReasoning"), { dimmed: true })
    activityLog.addEvent("tool_use", "bash", { detail: "ls -la src/" })
    activityLog.addEvent("file_read", t("sampleFileRead"))
    activityLog.addEvent("tool_use", "edit", { detail: "src/components/Button.tsx" })
    activityLog.addEvent("file_edit", t("sampleFileEdit"))
    activityLog.addEvent("task", t("sampleTask"))
    activityLog.addEvent("error", t("sampleError"))
    activityLog.addEvent("session_idle", t("sampleSessionIdle"))
  }

  /**
   * Create a new session in debug mode (no prompt sent)
   * Just creates a session for manual interaction
   */
  async function createDebugSession(): Promise<void> {
    log.info("session", "Creating debug session...")
    const client = tryGetClient(server.url)
    if (!client) {
      log.error("session", "Cannot create debug session: server not ready")
      return
    }

    try {
      // Create a new session
      const session = await createSession(client)
      const newSessionId = session.id

      log.info("session", "Debug session created", { sessionId: newSessionId })

      // Dispatch new_session to update debug state with session ID
      loop.dispatch({ type: "new_session", sessionId: newSessionId })
      setLastSessionId(newSessionId)
      
      activityLog.addEvent("session_start", t("actDebugSession", { id: newSessionId.substring(0, 8) }))

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
    const sid = resolveActiveSessionId(sessionId(), lastSessionId())
    const client = tryGetClient(server.url)

    if (!client || !sid) {
      toast.show({ variant: "error", message: t("toastNoSessionPrompt") })
      return
    }

    try {
      // Add activity log immediately for feedback
      activityLog.addEvent("user_message", t("actUserMessage", { text }))

      await sendPromptAsync(client, {
        sessionID: sid,
        parts: [{ type: "text", text }],
        agent: activeAgent(),
        model: activeModel(),
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.show({ variant: "error", message: t("toastSendPromptFailed", { message: errorMessage }) })
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
    // Re-entry guard: abortSession is a non-idempotent HTTP call, so a concurrent
    // trigger (quit confirm + Ctrl+C) would re-enter while the first call's awaits
    // are in flight and fire it twice. The other steps are individually idempotent
    // (clearCooldownTimers/watchdog.stop/etc.). ShutdownManager.isShuttingDown
    // closes the parallel race for the SIGINT/SIGTERM path.
    if (isShuttingDown) return
    isShuttingDown = true

    log.info("app", "Quit initiated", { exitCode, currentSessionId: sessionId() })
    loop.dispatch({ type: "quit" })

    // Stop resilience machinery: cooldown timers, watchdog, sleep detector, caffeinate
    cooldown.clearTimers()
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
            const client = tryGetClient(server.url)
        if (client) {
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

    // Clear title and restore terminal. These renderer calls can throw on a
    // half-torn-down renderer; if the throw escaped it would force exit(1) and
    // replace the user's intended exit code, breaking shell/CI pipelines that
    // check $?. We're about to exit anyway, so swallow and proceed.
    try {
      renderer.setTerminalTitle("")
      renderer.destroy()
    } catch (err) {
      log.warn("render", "Cleanup during quit failed", err)
    }

    // Exit process
    process.exit(exitCode)
  }

  // Server ready effect - transition to ready state and connect SSE
  createEffect(() => {
    if (server.status() === "ready" && loop.state().type === "starting" && resilienceReady()) {
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

      // Start the session lifecycle exactly once.
      const startOnce = () => {
        if (!sessionInitialized) {
          sessionInitialized = true
          initializeSession()
        }
      }
      const applyResolved = (r: ResolvedAgentModel) => {
        if (r.agent) setActiveAgent(r.agent)
        if (r.model) setActiveModel(r.model)
      }

      // Resolve the agent + model once the server is up, gating session start on
      // it. With no --agent/--model, OCLoop uses OpenCode's default agent and THAT
      // agent's own model (falling back to the global config model), so a setup
      // that configures the model only per-agent still runs. Single source of
      // truth for the precedence rules: resolveAgentAndModel. We fetch config +
      // agents in parallel, once, and never block startup on an infra failure.
      const client = tryGetClient(server.url)
      if (!client) {
        // No URL yet; the effect re-runs reactively when server.url() resolves.
        startOnce()
      } else {
        Promise.all([
          withTimeout((signal) => client.config.get({}, { signal }), 15_000, "config.get")
            .then((res) => res.data as OcConfig | undefined)
            .catch((err) => {
              log.error("config", "Failed to fetch config", err)
              return undefined
            }),
          withTimeout((signal) => client.app.agents({}, { signal }), 15_000, "app.agents")
            .then((res) => (res.data ?? []) as OcAgent[])
            .catch((err) => {
              log.error("agent", "Failed to fetch agents", err)
              return [] as OcAgent[]
            }),
        ])
          .then(([config, agents]) => {
            const resolved = resolveAgentAndModel(config, agents, props.agent, props.model)
            // An explicit --agent that the server rejects: offer its default
            // (resolved without the CLI agent) before starting, so the first
            // prompt never goes out with a nonexistent agent.
            if (resolved.invalidAgent) {
              const fallback = resolveAgentAndModel(config, agents, undefined, props.model)
              dialog.show(() => (
                <DialogInvalidAgent
                  agentName={resolved.invalidAgent!}
                  availableAgents={resolved.availableAgents}
                  defaultAgent={fallback.agent}
                  onUseDefault={() => {
                    applyResolved(fallback)
                    dialog.clear()
                    startOnce()
                  }}
                  onQuit={() => handleQuit(1)}
                />
              ))
              return
            }
            applyResolved(resolved)
            startOnce()
          })
          .catch((err) => {
            // Never block startup on a resolution-infrastructure failure.
            log.error("resolve", "Agent/model resolution failed", err)
            startOnce()
          })
      }
    }
  })

  /**
   * Initialize session persistence on startup
   * - In debug mode: creates a debug session immediately
   * - In normal mode: ensures .gitignore is updated
   * - Starts immediately if --run is passed
   */
  // --- Crash-resume flow (useResume) ---
  const { initializeSession } = useResume({
    debug: props.debug,
    run: props.run,
    planFile: props.planFile,
    loop,
    cooldown,
    watchdog,
    activityLog,
    dialog,
    t,
    resilience,
    serverUrl: server.url,
    createDebugSession,
    reconcileAndAdvance,
  })

  // Server error effect - transition to error state
  createEffect(() => {
    if (server.status() === "error" && server.error()) {
      // The server-error effect is the only error dispatch site that can fire
      // from cooldown (all others are state-gated). Clear the cooldown timers
      // before dispatch or they'd keep running with a stale resumeAt.
      if (loop.state().type === "cooldown") {
        cooldown.clearTimers()
      }
      loop.dispatch({
        type: "error",
        source: "server",
        message: server.error()?.message || t("errServerStart"),
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
  // Reads s.iteration (local to the already-narrowed s) instead of loop.iteration()
  // to avoid a redundant subscription to the same state signal.
  createEffect(() => {
    if (props.debug) return
    const s = loop.state()
    if (
      s.type === "running" ||
      s.type === "pausing" ||
      s.type === "paused" ||
      s.type === "cooldown"
    ) {
      const sid = getActiveSessionId(s) || null
      const snapshot: PersistedLoopState = {
        version: 1,
        iteration: s.iteration,
        sessionId: sid || null,
        stateType: s.type,
        rateLimitAttempts: cooldown.getAttempts(),
        updatedAt: new Date().toISOString(),
        // Persist the first-pending task so a resume after a crash can detect a
        // PLAN.md edit (insert/reorder/complete/remove) and warn that the saved
        // task is no longer first. currentTask() is refreshed after every plan read.
        currentTask: currentTask() ?? null,
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
      // totalActiveTime subscribes transitively to the per-second tick signal;
      // untrack for a one-shot snapshot, else the effect re-fires every second
      // and dialog.show piles a new entry onto the stack, resetting focus.
      const totalTime = untrack(() => stats.totalActiveTime())

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

  // --- Error dialog + "split the stalled task" recovery ---
  // DialogError is the window the user sees on a halt. For a no-progress halt
  // it carries `decomposableTask`; we offer a "P" action there that asks the
  // agent to split the stalled task into smaller subtasks, shows them for
  // approval, and on approval rewrites PLAN.md and resumes. presentError is
  // shared so the cancel/failure paths can re-show the exact same halt.
  type ErrorView = {
    source: string
    message: string
    recoverable: boolean
    decomposableTask?: string
  }

  function presentError(view: ErrorView): void {
    dialog.show(() => (
      <DialogError
        source={view.source}
        message={view.message}
        recoverable={view.recoverable}
        onRetry={() => {
          dialog.clear()
          if (loop.canRetry()) {
            // Reset the no-progress streak so the next run gets a fresh
            // threshold window. The user explicitly chose to resume.
            noProgressDetector?.reset()
            loop.dispatch({ type: "retry" })
          }
        }}
        onDecompose={
          view.decomposableTask && !decomposedTasks.has(view.decomposableTask)
            ? () => {
                void handleDecompose(view)
              }
            : undefined
        }
        onQuit={() => handleQuit(1)}
      />
    ))
  }

  async function handleDecompose(view: ErrorView): Promise<void> {
    const stuckTask = view.decomposableTask
    if (!stuckTask) return
    // Drop the halt dialog while we work; it's re-shown on cancel/failure so the
    // user always lands back on R/Q. Avoids two stacked dialogs fighting over
    // the keyboard.
    dialog.clear()
    const client = tryGetClient(server.url)
    if (!client) {
      toast.show({ message: t("errDecomposeFailed"), variant: "error" })
      presentError(view)
      return
    }
    toast.show({ message: t("splitGenerating"), variant: "info" })

    let subtasks: string[] = []
    try {
      const reply = await runOneShotAgent(
        client,
        t("splitPromptTemplate", { task: stuckTask }),
        { agent: activeAgent(), model: activeModel(), timeoutMs: resilience().promptTimeoutMs },
      )
      subtasks = parseSubtasksFromReply(reply)
    } catch (err) {
      log.warn("decompose", "subtask generation failed", {
        message: err instanceof Error ? err.message : String(err),
      })
    }

    if (subtasks.length === 0) {
      toast.show({ message: t("errDecomposeFailed"), variant: "error" })
      presentError(view)
      return
    }

    const message =
      `${t("dlgSplitBody")}\n\n"${stuckTask}"\n\n→\n\n` +
      subtasks.map((s) => `• ${s}`).join("\n")
    const approved = await DialogConfirm.show(dialog, t("dlgSplitTitle"), message, {
      width: 72,
      height: 18,
      scrollableMessage: true,
    })
    if (!approved) {
      presentError(view)
      return
    }

    try {
      const planPath = resolvePlanFile(props.planFile)
      const content = await Bun.file(planPath).text()
      const updated = replaceFirstPendingTaskWithSubtasks(content, subtasks)
      if (updated === null) {
        // No pending task to replace (plan changed underfoot, or nothing
        // actionable). Surface a real failure instead of writing an unchanged
        // file and falsely reporting success.
        toast.show({ message: t("errDecomposeFailed"), variant: "error" })
        presentError(view)
        return
      }
      await Bun.write(planPath, updated)
      decomposedTasks.add(stuckTask)
      await refreshPlan()
      // The split IS the progress signal — clear the streak so the first
      // subtask starts on a fresh threshold window.
      noProgressDetector?.reset()
      toast.show({ message: t("splitApplied", { count: subtasks.length }), variant: "success" })
      loop.dispatch({ type: "retry" })
    } catch (err) {
      log.error("decompose", "failed to apply subtasks to PLAN.md", {
        message: err instanceof Error ? err.message : String(err),
      })
      toast.show({ message: t("errDecomposeFailed"), variant: "error" })
      presentError(view)
    }
  }

  // Error effect - show the halt dialog when the loop enters the error state.
  createEffect(() => {
    const state = loop.state()
    if (state.type === "error") {
      presentError({
        source: state.source,
        message: state.message,
        recoverable: state.recoverable,
        decomposableTask: state.decomposableTask,
      })
    }
  })
  
  // --- External-terminal attach + config-dialog handlers (useTerminalLauncher) ---
  const {
    showTerminalError,
    launchConfiguredTerminal,
    onConfigSelect,
    onConfigCustom,
    onConfigCopy,
    onErrorCopy,
    copyAttachCommand,
    terminalConfigState,
  } = useTerminalLauncher({
    dialog,
    toast,
    t,
    sessionId,
    lastSessionId,
    serverUrl: server.url,
    ocloopConfig,
    setOcloopConfig,
    availableTerminals,
  })

  // Persist a theme chosen in the picker. The picker already applied it live
  // (via onMove/onSelect → applyTheme); this only writes it to disk + syncs the
  // in-memory config. Mirrors onConfigSelect's save→toast→setConfig contract.
  const onSelectTheme = (name: string) => {
    const newConfig: OcloopConfig = { ...ocloopConfig(), theme: name }
    if (!saveConfig(newConfig)) {
      toast.show({ variant: "error", message: t("toastConfigSaveFailed") })
      return
    }
    setOcloopConfig(newConfig)
    dialog.clear()
  }

  // Register commands (extracted to useCommandPalette)
  useCommandPalette({
    loop,
    cooldown,
    command,
    dialog,
    toast,
    t,
    sessionId,
    lastSessionId,
    serverUrl: server.url,
    ocloopConfig,
    setOcloopConfig,
    terminalConfigState,
    chaos,
    restartServer,
    copyAttachCommand,
    showQuitConfirmation,
    onSelectTheme,
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
      if (refreshPlanTimer) {
        clearTimeout(refreshPlanTimer)
        refreshPlanTimer = null
      }
    })
  })

  // Input handler for keybindings
  useKeybindings({
    debug: props.debug,
    verbose: props.verbose,
    loop,
    sessionId,
    lastSessionId,
    serverUrl: server.url,
    ocloopConfig,
    terminalConfigState,
    dialog,
    command,
    toast,
    t,
    createDebugSession,
    sendDebugPrompt,
    showQuitConfirmation,
    handleQuit,
    insertSampleActivity,
    copyAttachCommand,
    launchConfiguredTerminal,
  })

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, backgroundColor: theme().background }}>
      {/* Dashboard at the top */}
      <Dashboard
        isActive={true}
        state={loop.state()}
        progress={planProgress()}
        stats={stats}
        currentTask={currentTask() ?? null}
        model={activeModel()}
        agent={activeAgent()}
        cooldownRemainingMs={cooldown.remainingMs()}
        watchdogHealth={watchdog.health()}
      />

      {/* Activity Log takes remaining space */}
      <ActivityLog
        events={activityLog.events()}
        showScrollbar={ocloopConfig().scrollbar_visible ?? true}
      />

      {/* Bottom panel: full current task (wrapped) + global run metrics */}
      <BottomPanel
        currentTask={currentTask() ?? null}
        stats={stats}
        tokens={sessionStats.tokens()}
        taskTokens={sessionStats.taskTokens()}
        cost={costEstimate()}
      />

      {/* Overlays */}

    </box>
  )
}
