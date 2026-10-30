import { createMemo, For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { LoopState, PlanProgress } from "../types"
import type { UseLoopStatsReturn } from "../hooks/useLoopStats"
import type { WatchdogHealth } from "../hooks/useWatchdog"
import { stripMarkdown, truncate, formatDuration } from "../lib/format"
import { getLayout, fitSegments, FILL_ROW } from "../lib/layout"
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
  /** Configured parallel worker cap (1..4). */
  maxJobs?: number
  /** Number of currently active parallel workers (0..4). */
  activeWorkerCount?: number
}

/**
 * Dashboard component
 */
export function Dashboard(props: DashboardProps) {
  const { theme, unicode } = useTheme()
  const dimensions = useTerminalDimensions()
  const layout = createMemo(() => getLayout(dimensions().width, dimensions().height))

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

  const cooldownText = createMemo(() => {
    const state = props.state
    if (state.type !== "cooldown") return null
    const secs = Math.max(0, Math.ceil((props.cooldownRemainingMs ?? 0) / 1000))
    const key = state.kind === "transient" ? "cooldownRetryText" : "cooldownText"
    return t(key, { secs, attempt: state.attempt })
  })

  const remainingTasks = createMemo(() => {
    const progress = props.progress
    if (!progress) return 0
    return progress.automatable
  })

  const averageDisplay = createMemo(() => {
    const avg = props.stats.averageTime()
    return avg !== null ? formatDuration(avg).trim() : "N/A"
  })

  const estimatedDisplay = createMemo(() => {
    const remaining = remainingTasks()
    const estimate = props.stats.estimatedTotal(remaining)
    return estimate !== null ? formatDuration(estimate).trim() : "N/A"
  })

  const progressText = createMemo(() => {
    const progress = props.progress
    if (!progress) return null
    return `[${progress.completed}/${progress.total - progress.manual}]`
  })

  const keybindHints = createMemo(() => {
    const state = props.state
    const cmdHint = { key: "Ctrl+P", desc: t("hintCommands") }
    const quitHint = { key: "Q", desc: t("hintQuit") }

    switch (state.type) {
      case "starting":
        return [{ key: "", desc: t("hintStartingMsg") }]
      case "ready":
        return [
          { key: "S", desc: t("hintStart") },
          cmdHint,
          quitHint,
        ]
      case "running":
        return [
          { key: "C", desc: t("hintCopy") },
          { key: "T", desc: t("hintTerminal") },
          { key: "Space", desc: t("hintPause") },
          { key: "↑/↓", desc: t("hintScroll") },
          cmdHint,
          quitHint,
        ]
      case "paused":
        return [
          { key: "C", desc: t("hintCopy") },
          { key: "T", desc: t("hintTerminal") },
          { key: "Space", desc: t("hintResume") },
          { key: "↑/↓", desc: t("hintScroll") },
          cmdHint,
          quitHint,
        ]
      case "pausing":
        return [
          { key: "", desc: t("hintPausingMsg") },
          { key: "Space", desc: t("hintCancel") },
          cmdHint,
          quitHint,
        ]
      case "cooldown":
        return [
          { key: "", desc: t("hintCooldownMsg") },
          cmdHint,
          quitHint,
        ]
      case "complete":
        return [{ key: "", desc: t("hintCompleteMsg") }]
      case "error":
        if (state.recoverable) {
          return [
            { key: "R", desc: t("hintRetry") },
            quitHint,
          ]
        }
        return [quitHint]
      case "debug":
        if (state.sessionId) {
          return [
            { key: "P", desc: t("hintPrompt") },
            { key: "T", desc: t("hintTerminal") },
            { key: "N", desc: t("hintNewSession") },
            { key: "I", desc: t("hintSampleActivity") },
            cmdHint,
            quitHint,
          ]
        }
        return [
          { key: "N", desc: t("hintNewSession") },
          { key: "I", desc: t("hintSampleActivity") },
          cmdHint,
          quitHint,
        ]
      default:
        return []
    }
  })

  const truncatedTask = createMemo(() => {
    const state = props.state

    if (state.type === "debug") {
      if (state.sessionId) {
        const maxLen = 20
        const sessionId = state.sessionId
        const prefix = t("lblSessionPrefix")
        if (sessionId.length <= maxLen) return `${prefix}${sessionId}`
        return `${prefix}${sessionId.substring(0, maxLen - 3)}...`
      }
      return null
    }
    
    const task = props.currentTask
    if (!task) return null
    const cleanedTask = stripMarkdown(task)
    const maxLen = Math.max(16, layout().taskWidth - t("lblTaskPrefix").length)
    return truncate(cleanedTask, maxLen)
  })

  const borderColor = createMemo(() =>
    props.isActive ? theme().primary : theme().borderSubtle
  )

  const textWidth = () => Math.max(1, dimensions().width - 4)
  const compactProgress = () => {
    const p = props.progress
    if (!p) return ""
    const total = p.total - p.manual
    const percent = total === 0 ? 100 : Math.round(Math.min(1, Math.max(0, p.completed / total)) * 100)
    return fitSegments([
      `${t("lblTasks")} ${progressText()} ${percent}%`,
      iteration() > 0 ? `${t("lblIter")} ${iteration()}` : "",
      (props.maxJobs ?? 1) > 1 ? `${t("lblWorkers")} ${props.activeWorkerCount ?? 0}/${props.maxJobs}` : "",
    ], textWidth())
  }
  const compactHints = createMemo(() => {
    const hints = keybindHints().filter(h => !["C", "T", "↑/↓", "I"].includes(h.key))
    const rows: string[] = []
    for (const hint of hints) {
      const segment = truncate(`${hint.key}${hint.key ? " " : ""}${hint.desc}`, textWidth())
      const last = rows.length - 1
      if (last >= 0 && rows[last].length + 2 + segment.length <= textWidth()) {
        rows[last] += `  ${segment}`
      } else rows.push(segment)
    }
    return rows
  })

  return (
    <box
      border={true}
      zIndex={props.isActive ? 2 : 1}
      borderStyle="single"
      borderColor={borderColor()}
      style={{
        flexShrink: 0,
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <Show when={dimensions().width <= 40} fallback={
        <>
          <box style={{ ...FILL_ROW }}>
            <StatusBadge state={props.state} />

            <Show when={props.progress && props.state.type !== "debug"}>
              <box style={{ flexDirection: "row" }}>
                <LabelValue label={t("lblTasks")} value={progressText() ?? ""} valueColor={theme().primary} marginRight={1} />
                <ProgressIndicator
                  completed={props.progress!.completed}
                  total={props.progress!.total - props.progress!.manual}
                  width={layout().progressWidth}
                />
              </box>
            </Show>

            <Show when={iteration() > 0}>
              <LabelValue label={t("lblIter")} value={iteration()} />
            </Show>

            <Show when={(props.maxJobs ?? 1) > 1}>
              <LabelValue
                label={t("lblWorkers")}
                value={`${props.activeWorkerCount ?? 0}/${props.maxJobs}`}
                valueColor={theme().primary}
              />
            </Show>

            <Show when={watchdogIndicator() && !layout().compact}>
              <text>
                <span style={{ fg: theme().textMuted }}>{t("lblGuard")}</span>
                <span style={{ fg: theme()[watchdogIndicator()!.colorKey] }}> {glyph("dot", unicode())}</span>
                <span style={{ fg: theme().textMuted }}> {watchdogIndicator()!.label}</span>
              </text>
            </Show>
          </box>

          <box style={{ ...FILL_ROW, marginTop: 1 }}>
            <Show when={props.model && !layout().compact}>
              <LabelValue label={t("lblModel")} value={props.model!} />
            </Show>
            <Show when={props.agent && !layout().compact}>
              <LabelValue label={t("lblAgent")} value={props.agent!} />
            </Show>
            <LabelValue label={t("lblTime")} value={formatDuration(props.stats.elapsedTime()).trim()} />
            <Show when={props.stats.averageTime() !== null}>
              <LabelValue label={t("lblAvg")} value={averageDisplay()} />
            </Show>
            <Show when={estimatedDisplay() !== "N/A"}>
              <LabelValue label={t("lblEta")} value={estimatedDisplay()} />
            </Show>
          </box>
          <Show when={cooldownText() || (props.state.type === "debug" && truncatedTask())}>
            <box style={{ flexDirection: "row", marginTop: 1 }}>
              <Show
                when={cooldownText()}
                fallback={<text><span style={{ fg: theme().textMuted }}>{truncatedTask()}</span></text>}
              >
                <text><span style={{ fg: theme().warning }}>{cooldownText()}</span></text>
              </Show>
            </box>
          </Show>

          <box style={{ ...FILL_ROW, marginTop: 1 }}>
            {keybindHints().map((hint) => (
              <text>
                <Show when={hint.key}>
                  <span style={{ fg: theme().text }}>{hint.key}</span>
                  <span style={{ fg: theme().textMuted }}> {hint.desc}</span>
                </Show>
                <Show when={!hint.key}>
                  <span style={{ fg: theme().textMuted }}>{hint.desc}</span>
                </Show>
              </text>
            ))}
          </box>
        </>
      }>
        <StatusBadge state={props.state} />
        <Show when={props.progress && props.state.type !== "debug"}>
          <text><span style={{ fg: theme().primary }}>{compactProgress()}</span></text>
        </Show>
        <text>
          <span style={{ fg: theme().text }}>{fitSegments([
            `${t("lblTime")} ${formatDuration(props.stats.elapsedTime()).trim()}`,
            props.stats.averageTime() !== null ? `${t("lblAvg")} ${averageDisplay()}` : "",
            estimatedDisplay() !== "N/A" ? `${t("lblEta")} ${estimatedDisplay()}` : "",
          ], textWidth())}</span>
        </text>
        <Show when={cooldownText() || (props.state.type === "debug" && truncatedTask())}>
          <text><span style={{ fg: theme().textMuted }}>{truncate(cooldownText() ?? truncatedTask() ?? "", textWidth())}</span></text>
        </Show>
        <box style={{ flexDirection: "column", marginTop: 1 }}>
          <For each={compactHints()}>
            {(line) => <text><span style={{ fg: theme().textMuted }}>{line}</span></text>}
          </For>
        </box>
      </Show>

    </box>
  )
}
