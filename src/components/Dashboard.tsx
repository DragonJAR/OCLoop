import { createMemo, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { LoopState, PlanProgress } from "../types"
import type { UseLoopStatsReturn } from "../hooks/useLoopStats"
import type { WatchdogHealth } from "../hooks/useWatchdog"
import { stripMarkdown, truncate, formatDuration } from "../lib/format"
import { getLayout } from "../lib/layout"
import { glyph } from "../lib/glyphs"
import { t } from "../lib/i18n"
import { useTheme } from "../context/ThemeContext"
import { ProgressIndicator } from "./ProgressIndicator"
import { StatusBadge } from "./StatusBadge"
import { LabelValue } from "./LabelValue"

/**
 * Props for the Dashboard component
 */
export interface DashboardProps {
  isActive: boolean
  state: LoopState
  progress: PlanProgress | null
  stats: UseLoopStatsReturn
  currentTask: string | null
  model?: string
  agent?: string
  /** Remaining cooldown time (ms) shown as a countdown during rate limits. */
  cooldownRemainingMs?: number
  /** Current watchdog health, shown as a colored indicator while iterating. */
  watchdogHealth?: WatchdogHealth
}

/**
 * Dashboard component
 *
 * Fixed 4-row header that displays:
 * - Row 1: State badge + Iteration + Tasks progress bar
 * - Row 2: Timer (current) + Average + Estimated total
 * - Row 3: Current task (truncated if needed)
 * - Row 4: Keybind hints
 *
 * Uses theme colors and indicates active/inactive state via border styling.
 *
 * @example
 * ```tsx
 * <Dashboard
 *   isActive={true}
 *   state={loop.state()}
 *   progress={planProgress()}
 *   stats={stats}
 *   currentTask={currentTask()}
 * />
 * ```
 */
export function Dashboard(props: DashboardProps) {
  const { theme, unicode } = useTheme()
  const dimensions = useTerminalDimensions()
  // Responsive layout, recomputed on every resize.
  const layout = createMemo(() => getLayout(dimensions().width, dimensions().height))

  // Get iteration number
  const iteration = createMemo(() => {
    const state = props.state
    if (state.type === "running") return state.iteration
    if (state.type === "pausing") return state.iteration
    if (state.type === "paused") return state.iteration
    if (state.type === "cooldown") return state.iteration
    if (state.type === "complete") return state.iterations
    if (state.type === "debug") return 0
    return 0
  })

  // Watchdog health indicator (only meaningful while iterating).
  const watchdogIndicator = createMemo(() => {
    const h = props.watchdogHealth
    const s = props.state
    if (!h || (s.type !== "running" && s.type !== "pausing")) return null
    switch (h) {
      case "HEALTHY":
        return { colorKey: "success" as const, label: t("guardOk") }
      case "SUSPECT":
        return { colorKey: "warning" as const, label: t("guardSuspect") }
      case "CONFIRMING":
        return { colorKey: "warning" as const, label: t("guardCheck") }
      case "STUCK":
        return { colorKey: "error" as const, label: t("guardStuck") }
      case "RECOVERING":
        return { colorKey: "error" as const, label: t("guardRecover") }
      default:
        return null
    }
  })

  // Cooldown countdown line shown on Row 3 during a rate limit.
  const cooldownText = createMemo(() => {
    const state = props.state
    if (state.type !== "cooldown") return null
    const secs = Math.max(0, Math.ceil((props.cooldownRemainingMs ?? 0) / 1000))
    return t("cooldownText", { secs, attempt: state.attempt })
  })

  // Calculate remaining tasks for ETA
  const remainingTasks = createMemo(() => {
    const progress = props.progress
    if (!progress) return 0
    return progress.automatable
  })

  // Format average time or return N/A
  const averageDisplay = createMemo(() => {
    const avg = props.stats.averageTime()
    return avg !== null ? formatDuration(avg) : "N/A"
  })

  // Format estimated total time or return N/A
  const estimatedDisplay = createMemo(() => {
    const remaining = remainingTasks()
    const estimate = props.stats.estimatedTotal(remaining)
    return estimate !== null ? formatDuration(estimate) : "N/A"
  })

  // Progress text: [4/12]
  const progressText = createMemo(() => {
    const progress = props.progress
    if (!progress) return null
    return `[${progress.completed}/${progress.total - progress.manual}]`
  })

  // Keybinding hints based on state
  const keybindHints = createMemo(() => {
    const state = props.state

    switch (state.type) {
      case "ready":
        return [
          { key: "S", desc: t("hintStart") },
          { key: "^P", desc: t("hintCommands") },
          { key: "Q", desc: t("hintQuit") },
        ]
      case "running":
        return [
          { key: "T", desc: t("hintTerminal") },
          { key: "Space", desc: t("hintPause") },
          { key: "^P", desc: t("hintCommands") },
          { key: "Q", desc: t("hintQuit") },
        ]
      case "paused":
        return [
          { key: "T", desc: t("hintTerminal") },
          { key: "Space", desc: t("hintResume") },
          { key: "^P", desc: t("hintCommands") },
          { key: "Q", desc: t("hintQuit") },
        ]
      case "pausing":
        return [
          { key: "", desc: t("hintPausingMsg") },
          { key: "Space", desc: t("hintCancel") },
          { key: "Q", desc: t("hintQuit") },
        ]
      case "cooldown":
        return [
          { key: "", desc: t("hintCooldownMsg") },
          { key: "Q", desc: t("hintQuit") },
        ]
      case "complete":
        return [{ key: "", desc: t("hintCompleteMsg") }]
      case "error":
        if (state.recoverable) {
          return [
            { key: "R", desc: t("hintRetry") },
            { key: "Q", desc: t("hintQuit") },
          ]
        }
        return [{ key: "Q", desc: t("hintQuit") }]
      case "debug":
        // Detached in debug mode
        if (state.sessionId) {
          return [
            { key: "P", desc: t("hintPrompt") },
            { key: "T", desc: t("hintTerminal") },
            { key: "N", desc: t("hintNewSession") },
            { key: "I", desc: t("hintSampleActivity") },
            { key: "^P", desc: t("hintCommands") },
            { key: "Q", desc: t("hintQuit") },
          ]
        }
        // No active session
        return [
          { key: "N", desc: t("hintNewSession") },
          { key: "I", desc: t("hintSampleActivity") },
          { key: "^P", desc: t("hintCommands") },
          { key: "Q", desc: t("hintQuit") },
        ]
      default:
        return []
    }
  })

  // Truncate current task if needed (rough estimate for terminal width)
  // In debug mode, show the session ID instead
  const truncatedTask = createMemo(() => {
    const state = props.state
    
    // In debug mode, show session ID if available
    if (state.type === "debug") {
      if (state.sessionId) {
        // Truncate session ID if too long
        const maxLen = 20
        const sessionId = state.sessionId
        if (sessionId.length <= maxLen) return `Session: ${sessionId}`
        return `Session: ${sessionId.substring(0, maxLen - 3)}...`
      }
      return null
    }
    
    const task = props.currentTask
    if (!task) return null
    const cleanedTask = stripMarkdown(task)
    // Fit to the responsive task budget minus the "Task: " prefix. Re-runs on
    // resize via layout(); floored so a very narrow terminal still shows text.
    const maxLen = Math.max(16, layout().taskWidth - t("lblTaskPrefix").length)
    return truncate(cleanedTask, maxLen)
  })

  // Border color based on active state
  const borderColor = createMemo(() =>
    props.isActive ? theme().primary : theme().borderSubtle
  )

  return (
    <box
      height={6}
      border={true}
      zIndex={props.isActive ? 2 : 1}
      borderStyle="single"
      borderColor={borderColor()}
      style={{
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {/* Row 1: State badge + Iteration + Progress */}
      <box style={{ flexDirection: "row" }}>
        <StatusBadge state={props.state} />

        {/* Model display — dropped on narrow terminals to save space */}
        <Show when={props.model && !layout().compact}>
          <LabelValue label={t("lblModel")} value={props.model!} marginLeft={2} />
        </Show>

        {/* Agent display — dropped on narrow terminals to save space */}
        <Show when={props.agent && !layout().compact}>
          <LabelValue label={t("lblAgent")} value={props.agent!} marginLeft={2} />
        </Show>

        {/* Iteration counter */}
        <Show when={iteration() > 0}>
          <LabelValue label={t("lblIter")} value={iteration()} marginLeft={2} />
        </Show>

        {/* Plan progress - hide in debug mode */}
        <Show when={props.progress && props.state.type !== "debug"}>
          <LabelValue label={t("lblTasks")} value={progressText() ?? ""} valueColor={theme().primary} marginLeft={2} />
          <box style={{ marginLeft: 1 }}>
            <ProgressIndicator
              completed={props.progress!.completed}
              total={props.progress!.total - props.progress!.manual}
              width={layout().progressWidth}
            />
          </box>
        </Show>

        {/* Watchdog health indicator — dropped on narrow terminals */}
        <Show when={watchdogIndicator() && !layout().compact}>
          <text style={{ marginLeft: 2 }}>
            <span style={{ fg: theme().textMuted }}>{t("lblGuard")}</span>
            <span style={{ fg: theme()[watchdogIndicator()!.colorKey] }}> {glyph("dot", unicode())}</span>
            <span style={{ fg: theme().textMuted }}> {watchdogIndicator()!.label}</span>
          </text>
        </Show>
      </box>

      {/* Row 2: Timing stats (current task) */}
      <box style={{ flexDirection: "row" }}>
        <LabelValue label={t("lblTime")} value={formatDuration(props.stats.elapsedTime())} />

        {/* Avg/ETA only once they're meaningful (≥2 iterations) — no "N/A" noise. */}
        <Show when={props.stats.averageTime() !== null}>
          <LabelValue label={t("lblAvg")} value={averageDisplay()} marginLeft={2} />
        </Show>

        <Show when={estimatedDisplay() !== "N/A"}>
          <LabelValue label={t("lblEta")} value={estimatedDisplay()} marginLeft={2} />
        </Show>
      </box>

      {/* Row 3: Cooldown countdown (during rate limits). The current task now
          lives ONLY in the bottom panel (no duplication between bars); debug
          mode keeps its session id here. */}
      <box style={{ flexDirection: "row" }}>
        <Show
          when={cooldownText()}
          fallback={
            <Show when={props.state.type === "debug" && truncatedTask()}>
              <text>
                <span style={{ fg: theme().textMuted }}>{truncatedTask()}</span>
              </text>
            </Show>
          }
        >
          <text>
            <span style={{ fg: theme().warning }}>{cooldownText()}</span>
          </text>
        </Show>
      </box>

      {/* Row 4: Keybind hints */}
      <box style={{ flexDirection: "row" }}>
        {keybindHints().map((hint, i) => (
          <>
            {i > 0 && <text style={{ marginLeft: 2 }}> </text>}
            <text>
              <Show when={hint.key}>
                <span style={{ fg: theme().text }}>{hint.key}</span>
                <span style={{ fg: theme().textMuted }}> {hint.desc}</span>
              </Show>
              <Show when={!hint.key}>
                <span style={{ fg: theme().textMuted }}>{hint.desc}</span>
              </Show>
            </text>
          </>
        ))}
      </box>
    </box>
  )
}
