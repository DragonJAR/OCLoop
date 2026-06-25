import { createSignal } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import { Dialog } from "../ui/Dialog";
import { DialogHeader, DialogButton, dialogScrollbarOptions } from "../ui/DialogControls";
import { useTheme } from "../context/ThemeContext";
import { formatDuration } from "../lib/format";
import { glyph } from "../lib/glyphs";
import { t } from "../lib/i18n";

export interface DialogCompletionProps {
  iterations: number;
  totalTime: number;
  summary: string;
  onDismiss: () => void;
  onQuit: () => void;
}

export function DialogCompletion(props: DialogCompletionProps) {
  const { theme, unicode } = useTheme();
  const [activeButton, setActiveButton] = createSignal<"dismiss" | "quit">("dismiss");

  // Fixed height: the summary already lives in a <scrollbox maxHeight={12}>, so
  // sizing the box to the (clamped) summary line count was redundant — the
  // scrollbox caps the visible summary regardless. A fixed height fits the
  // header + summary line + the capped summary box + buttons + padding.
  const dialogHeight = 20;

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
    <Dialog onClose={props.onDismiss} width={72} height={dialogHeight}>
      <box style={{ flexDirection: "column" }}>
        {/* Header — green ✓ glyph before the primary-colored title. The glyph
            goes through the glyph system so it degrades to "+" on non-Unicode
            terminals (OCLOOP_ASCII=1, TERM=dumb) instead of mojibake (REPARAR.md E2). */}
        <DialogHeader
          title={t("dlgPlanComplete")}
          icon={glyph("check", unicode())}
          accent={theme().primary}
          iconColor={theme().success}
          hint={t("dlgEscToQuit")}
        />

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
          verticalScrollbarOptions={dialogScrollbarOptions(theme())}
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
            width: "100%",
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 1,
            gap: 2,
          }}
        >
          <DialogButton
            label={t("dlgDismiss")}
            active={activeButton() === "dismiss"}
            onPress={() => {
              setActiveButton("dismiss");
              props.onDismiss();
            }}
          />
          <DialogButton
            label={t("dlgQuitConfirm")}
            active={activeButton() === "quit"}
            onPress={() => {
              setActiveButton("quit");
              props.onQuit();
            }}
          />
        </box>
      </box>
    </Dialog>
  );
}
