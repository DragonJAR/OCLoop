import { createMemo, For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/ThemeContext"
import type { WorkerSlotInfo } from "../types"
import type { UseLoopStatsReturn } from "../hooks/useLoopStats"
import { totalDisplayTokens, type SessionTokens } from "../hooks/useSessionStats"
import {
  formatDuration,
  formatTokenCount,
  stripMarkdown,
  tokensPerMin,
  truncate,
  wrapText,
  clampLines,
} from "../lib/format"
import { getLayout, fitSegments, FILL_ROW } from "../lib/layout"
import { formatCost } from "../lib/pricing"
import { t } from "../lib/i18n"
import { LabelValue } from "./LabelValue"

export { totalDisplayTokens }

export interface BottomPanelProps {
  /** Full current task text (untruncated). */
  currentTask: string | null
  /** Loop timing stats (provides globalElapsedTime). */
  stats: UseLoopStatsReturn
  /** Global token counters for the run. */
  tokens: SessionTokens
  /** Per-task (current iteration) token counters. */
  taskTokens: SessionTokens
  /** Estimated USD cost for the whole run (shown with ~). */
  cost: number
  /** Active parallel worker slots (when running with --jobs > 1). */
  activeWorkers?: WorkerSlotInfo[]
}

export function BottomPanel(props: BottomPanelProps) {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const layout = createMemo(() => getLayout(dimensions().width, dimensions().height))

  const task = createMemo(() =>
    props.currentTask ? stripMarkdown(props.currentTask) : null,
  )

  const totalTokens = () =>
    totalDisplayTokens(props.tokens)
  const taskTotal = () =>
    totalDisplayTokens(props.taskTokens)
  const rate = () => tokensPerMin(totalTokens(), props.stats.globalElapsedTime())

  const tokenBreakdown = () =>
    `${formatTokenCount(totalTokens())} (${t("logTokenIn")}${formatTokenCount(props.tokens.input)} ${t("logTokenOut")}${formatTokenCount(props.tokens.output)})`

  const textWidth = () => Math.max(8, layout().inner - 2)

  const taskLines = createMemo(() =>
    wrapText(task() ?? "", Math.max(8, textWidth() - t("lblTaskPrefix").length)),
  )

  const clampedTask = createMemo(() => clampLines(taskLines(), layout().maxTaskLines))

  const hasParallelWorkers = createMemo(
    () => Boolean(props.activeWorkers && props.activeWorkers.length > 0),
  )

  const compactLine = () =>
    fitSegments(
      [
        `${t("lblTaskPrefix")}${task() ?? t("lblWaiting")}`,
        `${t("lblTotal")} ${formatDuration(props.stats.globalElapsedTime()).trim()}`,
        `${t("logTokens").replace(/:\s*$/, "")} ${formatTokenCount(totalTokens())}`,
        `${t("lblCost")}${formatCost(props.cost)}`,
      ],
      textWidth(),
    )

  return (
    <box
      border={true}
      borderStyle="single"
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
        <Show
          when={!hasParallelWorkers()}
          fallback={
            <box style={{ flexDirection: "column" }}>
              <For each={props.activeWorkers}>
                {(w) => (
                  <text>
                    <span style={{ fg: theme().primary }}>[W{w.slotId}] </span>
                    <span style={{ fg: theme().text }}>
                      {truncate(stripMarkdown(w.taskDescription), Math.max(12, textWidth() - 6))}
                    </span>
                  </text>
                )}
              </For>
            </box>
          }
        >
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
              <For each={clampedTask().shown}>
                {(line, i) => (
                  <text>
                    <Show when={i() === 0}>
                      <span style={{ fg: theme().textMuted }}>{t("lblTaskPrefix")}</span>
                    </Show>
                    <span style={{ fg: theme().text }}>{line}</span>
                  </text>
                )}
              </For>
              <Show when={clampedTask().hidden > 0}>
                <text>
                  <span style={{ fg: theme().textMuted, italic: true }}>
                    {t("lblTaskMore", { n: clampedTask().hidden })}
                  </span>
                </text>
              </Show>
            </box>
          </Show>
        </Show>

        <box style={{ ...FILL_ROW, flexWrap: "wrap", marginTop: 1 }}>
          <LabelValue label={t("lblTotal")} value={formatDuration(props.stats.globalElapsedTime()).trim()} />
          <LabelValue
            label={t("logTokens").replace(/:\s*$/, "")}
            value={layout().breakpoint === "wide" ? tokenBreakdown() : formatTokenCount(totalTokens())}
          />
          <LabelValue label={t("lblCost")} value={formatCost(props.cost)} />
          <LabelValue label={t("lblTaskTokens")} value={formatTokenCount(taskTotal())} />
          <LabelValue label={t("lblRate")} value={formatTokenCount(Math.round(rate()))} />
        </box>
      </Show>
    </box>
  )
}
