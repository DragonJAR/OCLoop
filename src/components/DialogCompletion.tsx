import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { Dialog } from "../ui/Dialog";
import { useTheme, selectedForeground } from "../context/ThemeContext";
import { formatDuration } from "../hooks/useLoopStats";
import { t } from "../lib/i18n";

export interface DialogCompletionProps {
  iterations: number;
  totalTime: number;
  summary: string;
  onDismiss: () => void;
  onQuit: () => void;
}

export function DialogCompletion(props: DialogCompletionProps) {
  const { theme } = useTheme();
  const [activeButton, setActiveButton] = createSignal<"dismiss" | "quit">("dismiss");

  // Calculate dialog height based on content
  const dialogHeight = () => {
    let height = 15; // Base: header + summary line + footer + padding

    // Summary content
    const lines = props.summary.trim().split("\n").length;
    height += Math.min(lines, 12);

    return Math.max(9, height);
  };

  useKeyboard((key) => {
    if (key.name === "escape") {
      props.onDismiss();
      return;
    }

    if (key.name === "q") {
      props.onQuit();
      return;
    }

    if (key.name === "return") {
      if (activeButton() === "dismiss") {
        props.onDismiss();
      } else {
        props.onQuit();
      }
      return;
    }

    if (key.name === "left" || key.name === "right") {
      setActiveButton((prev) => (prev === "dismiss" ? "quit" : "dismiss"));
      return;
    }
  });

  return (
    <Dialog onClose={props.onDismiss} width={62} height={dialogHeight()}>
      <box style={{ flexDirection: "column" }}>
        {/* Header */}
        <box
          style={{
            width: "100%",
            justifyContent: "space-between",
            marginBottom: 1,
            flexDirection: "row",
          }}
        >
          <text>
            <span style={{ fg: theme().success, bold: true }}>✓</span>
            <span style={{ fg: theme().primary, bold: true }}>
              {" "}
              {t("dlgPlanComplete")}
            </span>
          </text>
          <text>
            <span style={{ fg: theme().textMuted }}>esc</span>
          </text>
        </box>

        {/* Summary line */}
        <text>
          <span style={{ fg: theme().text }}>
            {t("dlgCompletedIn", {
              iterations: props.iterations,
              time: formatDuration(props.totalTime),
            })}
          </span>
        </text>

        {/* Summary Content */}
        <scrollbox
          marginTop={1}
          maxHeight={12}
          verticalScrollbarOptions={{
            visible: true,
            trackOptions: {
              backgroundColor: theme().backgroundPanel,
              foregroundColor: theme().borderSubtle,
            },
          }}
          viewportOptions={{
            paddingRight: 1,
          }}
        >
          <text>
            <span style={{ fg: theme().text }}>{props.summary}</span>
          </text>
        </scrollbox>

        {/* Footer */}
        <box
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 1,
            gap: 1,
          }}
        >
          <box
            style={{
              backgroundColor:
                activeButton() === "dismiss" ? theme().primary : undefined,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text
              style={{
                fg:
                  activeButton() === "dismiss"
                    ? selectedForeground(theme())
                    : theme().text,
              }}
            >
              {t("dlgDismiss")}
            </text>
          </box>
          <box
            style={{
              backgroundColor:
                activeButton() === "quit" ? theme().primary : undefined,
              paddingLeft: 1,
              paddingRight: 1,
            }}
          >
            <text
              style={{
                fg:
                  activeButton() === "quit"
                    ? selectedForeground(theme())
                    : theme().text,
              }}
            >
              {t("dlgQuitConfirm")}
            </text>
          </box>
        </box>
      </box>
    </Dialog>
  );
}
