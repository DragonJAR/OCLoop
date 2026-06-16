import { createMemo, For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/ThemeContext"
import type { UseLoopStatsReturn } from "../hooks/useLoopStats"
import type { SessionTokens } from "../hooks/useSessionStats"
import type { ActivityEvent } from "../hooks/useActivityLog"
import type { PlanProgress } from "../types"
import {
  formatDuration,
  formatTokenCount,
  truncate,
  stripMarkdown,
  tokensPerMin,
  wrapText,
} from "../lib/format"
import { getLayout, fitSegments } from "../lib/layout"
import { t } from "../lib/i18n"

/**
 * BottomPanel — the second status box, below the activity log.
 *
 * Shows what the Dashboard can't: the FULL current task (wrapped to as many
 * lines as it needs, never cut) plus run-level ("global") metrics — wall-clock
 * since start, total tokens, throughput and projected finish.
 *
 * No duplication with the Dashboard: the task lives ONLY here (removed from the
 * top), while the progress %, ETA and per-iteration Avg live ONLY in the top.
 *
 * Responsive: only `layout().short` (few ROWS) forces the single-line fallback —
 * a narrow-but-tall terminal still wraps the whole task (more lines). Metric
 * chips flex-wrap and gate verbose ones by width.
 */
export interface BottomPanelProps {
  /** Full current task text (untruncated). */
  currentTask: string | null
  /** Loop timing stats (globalElapsedTime/estimatedTotal). */
  stats: UseLoopStatsReturn
  /** Global token counters for the run. */
  tokens: SessionTokens
  /** Plan progress — used only to derive remaining→ETA→finish (not displayed as %). */
  progress: PlanProgress | null
  /** Most recent activity event, echoed as a live status line. */
  lastEvent?: ActivityEvent
}

export function BottomPanel(props: BottomPanelProps) {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const layout = createMemo(() => getLayout(dimensions().width, dimensions().height))

  const task = createMemo(() =>
    props.currentTask ? stripMarkdown(props.currentTask) : null,
  )

  const totalTokens = () =>
    props.tokens.input + props.tokens.output + props.tokens.reasoning
  const remaining = () => props.progress?.automatable ?? 0
  const eta = () => props.stats.estimatedTotal(remaining())
  const rate = () => tokensPerMin(totalTokens(), props.stats.globalElapsedTime())

  // Projected wall-clock finish = now + ETA. Null until an ETA exists.
  const finishClock = createMemo(() => {
    const e = eta()
    if (e === null) return null
    const d = new Date(Date.now() + e)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  })

  const tokenBreakdown = () =>
    `${formatTokenCount(totalTokens())} (${t("logTokenIn")}${formatTokenCount(props.tokens.input)} ${t("logTokenOut")}${formatTokenCount(props.tokens.output)} ${t("logTokenRsn")}${formatTokenCount(props.tokens.reasoning)})`

  // Text width inside the border (1) + padding (1) on each side: inner - 2.
  const textWidth = () => Math.max(8, layout().inner - 2)

  // Full task wrapped into exactly the lines it needs — deterministic, never cut,
  // and recomputed on resize via layout(). One <text> per line; the box grows.
  const taskLines = createMemo(() =>
    wrapText(`${t("lblTaskPrefix")}${task() ?? t("lblWaiting")}`, textWidth()),
  )

  // Single fitted line for short (few-row) terminals — fitSegments never overflows.
  const compactLine = () =>
    fitSegments(
      [
        `${t("lblTaskPrefix")}${task() ?? t("lblWaiting")}`,
        `${t("lblTotal")} ${formatDuration(props.stats.globalElapsedTime()).trim()}`,
        `${t("logTokens").replace(/:\s*$/, "")} ${formatTokenCount(totalTokens())}`,
      ],
      layout().inner,
    )

  const lastActionText = () =>
    props.lastEvent ? truncate(props.lastEvent.message, Math.max(8, layout().inner - 8)) : ""

  return (
    <box
      border={true}
      borderStyle="single"
      // Same border color as the top Dashboard (always-active => primary).
      borderColor={theme().primary}
      style={{
        flexShrink: 0,
        flexDirection: "column",
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <Show
        when={!layout().short}
        fallback={
          <text>
            <span style={{ fg: theme().textMuted }}>{compactLine()}</span>
          </text>
        }
      >
        {/* Full task — wrapped to N lines, never cut ("sin que se corte"). */}
        <Show
          when={task()}
          fallback={
            <text>
              <span style={{ fg: theme().textMuted }}>{t("lblTaskPrefix")}</span>
              <span style={{ fg: theme().textMuted, italic: true }}>{t("lblWaiting")}</span>
            </text>
          }
        >
          <box style={{ flexDirection: "column" }}>
            <For each={taskLines()}>
              {(line) => (
                <text>
                  <span style={{ fg: theme().text }}>{line}</span>
                </text>
              )}
            </For>
          </box>
        </Show>

        {/* Global metrics. Progress %, ETA and Avg are intentionally NOT here —
            they live in the top Dashboard (no duplication between panels). */}
        <box style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 1 }}>
          <Chip label={t("lblTotal")} value={formatDuration(props.stats.globalElapsedTime()).trim()} />
          {/* Total tokens always; full in/out/rsn breakdown only when wide enough. */}
          <Chip
            label={t("logTokens").replace(/:\s*$/, "")}
            value={layout().breakpoint === "wide" ? tokenBreakdown() : formatTokenCount(totalTokens())}
          />
          <Chip label={t("lblRate")} value={formatTokenCount(Math.round(rate()))} />
          <Show when={finishClock()}>
            <Chip label={t("lblFinish")} value={finishClock()!} />
          </Show>
        </box>

        {/* Live last-action line. */}
        <Show when={props.lastEvent}>
          <text>
            <span style={{ fg: theme().textMuted }}>{t("lblLast")} </span>
            <span style={{ fg: theme().text }}>{lastActionText()}</span>
          </text>
        </Show>
      </Show>
    </box>
  )
}

/** A muted-label + value pair with trailing gap; used for the metric row. */
function Chip(props: { label: string; value: string }) {
  const { theme } = useTheme()
  return (
    <text style={{ marginRight: 2 }}>
      <span style={{ fg: theme().textMuted }}>{props.label} </span>
      <span style={{ fg: theme().text }}>{props.value}</span>
    </text>
  )
}
