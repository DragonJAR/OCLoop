import { createMemo, For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/ThemeContext"
import type { UseLoopStatsReturn } from "../hooks/useLoopStats"
import type { SessionTokens } from "../hooks/useSessionStats"
import {
  formatDuration,
  formatTokenCount,
  stripMarkdown,
  tokensPerMin,
  wrapText,
} from "../lib/format"
import { getLayout, fitSegments, FILL_ROW } from "../lib/layout"
import { t } from "../lib/i18n"
import { LabelValue } from "./LabelValue"

/**
 * BottomPanel — the second status box, below the activity log.
 *
 * Shows what the Dashboard can't: the FULL current task (wrapped to as many
 * lines as it needs, never cut) plus run-level ("global") metrics — wall-clock
 * since start, total tokens and throughput.
 *
 * No duplication between bars: the task, total time and tokens live ONLY here;
 * the per-task time, Avg, ETA, progress %, model/agent/iter live ONLY in the top.
 *
 * Responsive: only `layout().short` (few ROWS) forces the single-line fallback —
 * a narrow-but-tall terminal still wraps the whole task (more lines). Metric
 * chips flex-wrap and gate the verbose token breakdown by width.
 */
export interface BottomPanelProps {
  /** Full current task text (untruncated). */
  currentTask: string | null
  /** Loop timing stats (provides globalElapsedTime). */
  stats: UseLoopStatsReturn
  /** Global token counters for the run. */
  tokens: SessionTokens
  /** Per-task (current iteration) token counters. */
  taskTokens: SessionTokens
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
  const taskTotal = () =>
    props.taskTokens.input + props.taskTokens.output + props.taskTokens.reasoning
  const rate = () => tokensPerMin(totalTokens(), props.stats.globalElapsedTime())

  const tokenBreakdown = () =>
    `${formatTokenCount(totalTokens())} (${t("logTokenIn")}${formatTokenCount(props.tokens.input)} ${t("logTokenOut")}${formatTokenCount(props.tokens.output)} ${t("logTokenRsn")}${formatTokenCount(props.tokens.reasoning)})`

  // Text width inside the border (1) + padding (1) on each side: inner - 2.
  const textWidth = () => Math.max(8, layout().inner - 2)

  // Wrap only the task CONTENT (deterministic, never cut, reflows on resize).
  // The muted "Task:" prefix is rendered separately on line 1, so line 1's
  // budget excludes the prefix width; one <text> per line, the box grows.
  const taskLines = createMemo(() =>
    wrapText(task() ?? "", Math.max(8, textWidth() - t("lblTaskPrefix").length)),
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
        {/* Full task — wrapped to N lines, never cut. Only the "Task:" prefix is
            muted (gray); the task text itself is white, to keep the hierarchy. */}
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
              {(line, i) => (
                <text>
                  <Show when={i() === 0}>
                    <span style={{ fg: theme().textMuted }}>{t("lblTaskPrefix")}</span>
                  </Show>
                  <span style={{ fg: theme().text }}>{line}</span>
                </text>
              )}
            </For>
          </box>
        </Show>

        {/* Global run metrics — none of these appear in the top bar. */}
        {/* Same "fill the row" rule as the dashboard (space-between), responsive. */}
        <box style={{ ...FILL_ROW, flexWrap: "wrap", marginTop: 1 }}>
          <LabelValue label={t("lblTotal")} value={formatDuration(props.stats.globalElapsedTime()).trim()} />
          {/* Global tokens: total always; full in/out/rsn breakdown only when wide. */}
          <LabelValue
            label={t("logTokens").replace(/:\s*$/, "")}
            value={layout().breakpoint === "wide" ? tokenBreakdown() : formatTokenCount(totalTokens())}
                     />
          {/* Per-task tokens (current iteration). */}
          <LabelValue label={t("lblTaskTokens")} value={formatTokenCount(taskTotal())} />
          <LabelValue label={t("lblRate")} value={formatTokenCount(Math.round(rate()))} />
        </box>
      </Show>
    </box>
  )
}
