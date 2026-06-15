import { For, createMemo, Show } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import { useTheme } from "../context/ThemeContext";
import type { ActivityEvent } from "../hooks/useActivityLog";
import type { SessionTokens, SessionDiff } from "../hooks/useSessionStats";
import { formatTokenCount, formatDiffSummary } from "../lib/format";
import { formatActivityLine, formatTime, type ColorKey } from "../lib/activity-format";
import { getLayout } from "../lib/layout";
import { t } from "../lib/i18n";

/**
 * Props for the ActivityLog component
 */
export interface ActivityLogProps {
  /** List of activity events to display */
  events: ActivityEvent[];
  /** Session token statistics */
  tokens?: SessionTokens;
  /** Session diff statistics */
  diff?: SessionDiff;
  /** Whether to show the scrollbar */
  showScrollbar?: boolean;
}

/**
 * ActivityLog component
 *
 * Displays a scrollable list of activity events.
 *
 * Each row shows: `HH:MM:SS  <icon> <message>`
 *
 * Color coding by event type:
 * - session_start/idle: muted text
 * - task: primary color
 * - file_edit: normal text with edit icon
 * - error: error color with warning icon
 * - dimmed events (messages, reasoning): muted text
 *
 * @example
 * ```tsx
 * const activity = useActivityLog()
 * const stats = useSessionStats()
 *
 * <ActivityLog
 *   events={activity.events()}
 *   tokens={stats.tokens()}
 *   diff={stats.diff()}
 * />
 * ```
 */
export function ActivityLog(props: ActivityLogProps) {
  const { theme } = useTheme();
  const dimensions = useTerminalDimensions();
  // Message width, derived from the real terminal size (re-runs on resize).
  const contentWidth = () => getLayout(dimensions().width, dimensions().height).logContentWidth;

  // Map a semantic color key (from the pure formatter) to a theme color.
  const colorOf = (k: ColorKey): string => {
    const th = theme();
    switch (k) {
      case "info": return th.info;
      case "error": return th.error;
      case "warning": return th.warning;
      case "primary": return th.primary;
      case "success": return th.success;
      case "textMuted": return th.textMuted;
      default: return th.text;
    }
  };

  // Reverse events so most recent is at the bottom
  const displayEvents = createMemo(() => props.events);

  return (
    <box
      style={{
        backgroundColor: theme().backgroundPanel,
        flexGrow: 1,
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Stats header */}
      <Show when={props.tokens && props.diff}>
        <box
          style={{
            height: 2,
            flexDirection: "row",
            justifyContent: "space-between",
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 1,
            marginBottom: 1,
            flexShrink: 0,
          }}
        >
          <text>
            <span style={{ fg: theme().textMuted }}>
              {t("logTokens")}{formatTokenCount(props.tokens!.input + props.tokens!.output + props.tokens!.reasoning)}
              {" "}({t("logTokenIn")}{formatTokenCount(props.tokens!.input)} {t("logTokenOut")}{formatTokenCount(props.tokens!.output)} {t("logTokenRsn")}{formatTokenCount(props.tokens!.reasoning)})
            </span>
          </text>
          <text>
            <span style={{ fg: theme().textMuted }}>
              {t("logDiff")}{formatDiffSummary(props.diff!.additions, props.diff!.deletions, props.diff!.files)}
            </span>
          </text>
        </box>
      </Show>

      {/* Event list - scrollable, most recent at bottom */}
      <scrollbox
        stickyScroll={true}
        stickyStart="bottom"
        verticalScrollbarOptions={{
          visible: props.showScrollbar ?? true,
          trackOptions: {
            foregroundColor: theme().border,
            backgroundColor: theme().backgroundElement,
          },
        }}
        viewportOptions={{
          paddingRight: props.showScrollbar ? 1 : 0,
        }}
        flexGrow={1}
        style={{
          flexDirection: "column",
          paddingLeft: 1,
          paddingBottom: 2,
          overflow: "hidden",
        }}
      >
        <For each={displayEvents()}>
          {(event, index) => {
            const f = formatActivityLine(
              {
                type: event.type,
                message: event.message,
                detail: event.detail,
                level: event.level,
                count: event.count,
                progress: event.progress,
              },
              contentWidth(),
            );

            return (
              <>
                <Show when={event.type === "session_start" && index() > 0}>
                  <text> </text>
                </Show>
                <box
                  style={{
                    backgroundColor:
                      event.type === "session_start"
                        ? theme().backgroundElement
                        : undefined,
                  }}
                >
                  <text>
                    <span style={{ fg: theme().textMuted }}>
                      {formatTime(event.timestamp)}
                    </span>
                    {"  "}
                    <span style={{ fg: colorOf(f.glyphColor) }}>{f.glyph} </span>
                    <span style={{ fg: colorOf(f.labelColor) }}>{f.label}</span>
                    <span
                      style={{
                        fg: event.dimmed ? theme().textMuted : theme().text,
                      }}
                    >
                      {f.text}
                    </span>
                  </text>
                </box>
              </>
            );
          }}
        </For>
      </scrollbox>
    </box>
  );
}
