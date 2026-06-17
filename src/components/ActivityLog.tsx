import { For, Show, createEffect } from "solid-js";
import { useTerminalDimensions } from "@opentui/solid";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTheme } from "../context/ThemeContext";
import type { ActivityEvent } from "../hooks/useActivityLog";
import { formatActivityLine, formatTime, type ColorKey } from "../lib/activity-format";
import { getLayout } from "../lib/layout";

/**
 * Props for the ActivityLog component
 */
export interface ActivityLogProps {
  /** List of activity events to display */
  events: ActivityEvent[];
  /** Whether to show the scrollbar */
  showScrollbar?: boolean;
}

/**
 * ActivityLog component
 *
 * Displays a scrollable list of activity events. Token/diff stats live in the
 * BottomPanel now, so this is purely the event stream.
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
 *
 * <ActivityLog events={activity.events()} />
 * ```
 */
export function ActivityLog(props: ActivityLogProps) {
  const { theme, unicode } = useTheme();
  const dimensions = useTerminalDimensions();
  // Message width, derived from the real terminal size (re-runs on resize).
  // This is the SINGLE, width-aware truncation point for log lines — upstream
  // previews (getToolPreview) must not pre-truncate to a fixed width.
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

  // Scrollbar auto-hide: OpenTUI shows the vertical bar only when the log
  // overflows (built-in recalculateVisibility). We must NOT force `visible` —
  // that pins the bar on and reserves an empty right column. The user's toggle
  // still hard-hides it: resetVisibilityControl() re-enables auto, visible=false
  // forces it off. (verticalScrollBar is public; see @opentui/core ScrollBox.)
  let sb: ScrollBoxRenderable | undefined;
  createEffect(() => {
    const bar = sb?.verticalScrollBar;
    if (!bar) return;
    if (props.showScrollbar ?? true) bar.resetVisibilityControl();
    else bar.visible = false;
  });

  return (
    <box
      style={{
        backgroundColor: theme().backgroundPanel,
        flexGrow: 1,
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Event list - scrollable, most recent at bottom */}
      <scrollbox
        ref={(r) => (sb = r)}
        stickyScroll={true}
        stickyStart="bottom"
        // Bottom-anchor: content node fills the viewport and pushes rows to the
        // bottom, so few logs hug the panel below (empty space above, terminal-style).
        // Many logs scroll + sticky-to-bottom as before (scroll logic is separate).
        contentOptions={{ flexGrow: 1, justifyContent: "flex-end" }}
        // No `visible` here: OpenTUI auto-hides the bar unless the log overflows,
        // so it never reserves an empty column. Force-hide (toggle) is done via the
        // ref effect above. No viewportOptions.paddingRight — that reserved a column
        // even when the bar was hidden; the bar's own column separates when shown.
        verticalScrollbarOptions={{
          trackOptions: {
            foregroundColor: theme().border,
            backgroundColor: theme().backgroundElement,
          },
        }}
        flexGrow={1}
        // NO flexDirection here: the scrollbox root is `row` ([ content | scrollbar ]).
        // Overriding it to "column" stacked the scrollbar BELOW the logs (the split-screen
        // bug). Log lines still stack vertically — the inner content node is a column.
        style={{
          paddingLeft: 2,
          paddingBottom: 2,
          overflow: "hidden",
        }}
      >
        <For each={props.events}>
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
              unicode(),
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
