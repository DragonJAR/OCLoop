/**
 * Activity-log line formatting — pure, no @opentui. Single source of truth for
 * how a log line reads: a severity glyph (info/warn/error), a short descriptive
 * label, the message with optional progress (X/Y · phase) and a collapse
 * counter (×N). Width-fitted from getLayout. Unit-tested and previewable.
 */

import type { ActivityEventType } from "../hooks/useActivityLog"
import { truncateText } from "./format"
import { glyph, type GlyphName } from "./glyphs"
import { getLayout } from "./layout"
import { t, type MessageKey } from "./i18n"

export type Level = "info" | "warn" | "error"

/** Theme color keys (strings; the TUI maps them to real colors). */
export type ColorKey =
  | "info"
  | "error"
  | "primary"
  | "success"
  | "textMuted"
  | "text"
  | "warning"

interface EventMeta {
  level: Level
  /** i18n key for the short, scannable label — says WHAT kind of thing happened. */
  label: MessageKey
  /** Color for the label (semantic by event type). */
  colorKey: ColorKey
}

/** Default level + label i18n key + color per event type. */
const META: Record<ActivityEventType, EventMeta> = {
  session_start: { level: "info", label: "logLblStart", colorKey: "primary" },
  session_idle: { level: "info", label: "logLblIdle", colorKey: "textMuted" },
  task: { level: "info", label: "logLblTask", colorKey: "primary" },
  file_edit: { level: "info", label: "logLblEdit", colorKey: "info" },
  file_read: { level: "info", label: "logLblRead", colorKey: "info" },
  tool_use: { level: "info", label: "logLblTool", colorKey: "primary" },
  user_message: { level: "info", label: "logLblYou", colorKey: "info" },
  assistant_message: { level: "info", label: "logLblAssistant", colorKey: "success" },
  // reasoning was colored as "warning" (false alarm) — de-emphasize to muted.
  reasoning: { level: "info", label: "logLblReason", colorKey: "textMuted" },
  error: { level: "error", label: "logLblError", colorKey: "error" },
}

const DEFAULT_META: EventMeta = { level: "info", label: "logLblEvent", colorKey: "text" }

/** Severity level → semantic glyph name (resolved via glyphs.ts). */
const LEVEL_TO_GLYPH: Record<Level, GlyphName> = { info: "sevInfo", warn: "sevWarn", error: "sevError" }
/** Scannable Unicode glyph per severity — single-sourced from glyphs.ts. */
export const LEVEL_GLYPH: Record<Level, string> = {
  info: glyph("sevInfo", true),
  warn: glyph("sevWarn", true),
  error: glyph("sevError", true),
}
/** Color key for the severity glyph. */
export const LEVEL_COLOR: Record<Level, ColorKey> = {
  info: "textMuted",
  warn: "warning",
  error: "error",
}

/**
 * Bracketed labels are padded to this width so messages align in a column.
 * ponytail: every `logLbl*` translation must fit `[label]` ≤ this — i.e. the label
 * text ≤ 12 chars (e.g. "ejecutando"=10 ⇒ `[ejecutando]`=12 ≤ 14); longer ones
 * break column alignment (padEnd won't shrink them).
 */
export const LABEL_WIDTH = 14

export interface FormatInput {
  type: ActivityEventType
  message: string
  detail?: string
  /** Override the type's default severity (e.g. a rate-limit is a warn). */
  level?: Level
  /** Collapse counter for repeated consecutive events. */
  count?: number
  /** Long-operation progress. */
  progress?: { current?: number; total?: number; phase?: string }
}

export interface FormattedLine {
  glyph: string
  glyphColor: ColorKey
  label: string
  labelColor: ColorKey
  text: string
  level: Level
}

function progressSuffix(p?: FormatInput["progress"]): string {
  if (!p) return ""
  const parts: string[] = []
  if (typeof p.current === "number" && typeof p.total === "number" && p.total > 0) {
    // Clamp the percentage to [0, 100] so an upstream bug (current > total)
    // doesn't render a misleading "150%". The raw current/total counts are
    // shown as-is for diagnosis.
    const pct = Math.max(0, Math.min(100, Math.round((p.current / p.total) * 100)))
    parts.push(`${p.current}/${p.total} (${pct}%)`)
  }
  if (p.phase) parts.push(p.phase)
  return parts.length ? "  " + parts.join(" · ") : ""
}

/**
 * Format one activity line into width-fitted, severity-tagged parts. The
 * renderer colors `glyph`/`label`/`text` by the returned color keys.
 */
export function formatActivityLine(e: FormatInput, contentWidth: number, unicode = true): FormattedLine {
  const meta = META[e.type] ?? DEFAULT_META
  const level = e.level ?? meta.level
  // Tool calls read better as "preview: message"; everything else is the message.
  const base = e.type === "tool_use" && e.detail ? `${e.detail}: ${e.message}` : e.message
  const count = e.count && e.count > 1 ? `  (${glyph("times", unicode)}${e.count})` : ""
  const text = truncateText(base + progressSuffix(e.progress) + count, Math.max(8, contentWidth))
  return {
    glyph: glyph(LEVEL_TO_GLYPH[level], unicode),
    glyphColor: LEVEL_COLOR[level],
    label: `[${t(meta.label)}]`.padEnd(LABEL_WIDTH),
    labelColor: meta.colorKey,
    text,
    level,
  }
}

/** HH:MM:SS for a timestamp (shared by the log renderer). */
export function formatTime(date: Date): string {
  const p = (n: number) => n.toString().padStart(2, "0")
  return `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

// --- Preview harness: `bun run src/lib/activity-format.ts` ---------------------
if (import.meta.main) {
  const { bar, titleBar, fitSegments } = await import("./layout")
  const T = new Date(2026, 5, 15, 14, 43, 15)
  const time = formatTime(T)

  // A typical operation: start → tool → reasoning → 3 reconnects → rate limit → fatal.
  const stream: FormatInput[] = [
    { type: "session_start", message: "Session ses_1333 started" },
    { type: "tool_use", message: "implement responsive layout", detail: "bash: bun test" },
    { type: "reasoning", message: "deciding column widths from terminal size" },
    { type: "task", message: "Guardian: reconnecting SSE", count: 3 },
    { type: "error", message: "Rate limit — waiting 30s before retry", level: "warn", progress: { current: 2, total: 8 } },
    { type: "error", message: "Server unreachable at 127.0.0.1:4096 — check it's running, then press R" },
  ]

  // BEFORE: fixed 7-char labels, fixed 40-col truncate, no severity glyph,
  // no progress, repeats NOT collapsed, reasoning shown like a warning.
  const OLD_LABEL: Record<string, string> = {
    session_start: "[start]", tool_use: "[tool] ", reasoning: "[think]",
    task: "[task] ", error: "[error]", file_edit: "[edit] ", file_read: "[read] ",
    user_message: "[user] ", assistant_message: "[ai]   ", session_idle: "[idle] ",
  }
  const oldTrunc = (s: string) => (s.length <= 40 ? s : s.slice(0, 37) + "...")
  console.log("\n===== BEFORE (a typical operation) =====")
  for (const e of stream) {
    const reps = e.count && e.count > 1 ? e.count : 1
    for (let i = 0; i < reps; i++) console.log(`${time}  ${OLD_LABEL[e.type]} ${oldTrunc(e.message)}`)
  }

  const render = (e: FormatInput, w: number) => {
    const f = formatActivityLine(e, w)
    return `${time}  ${f.glyph} ${f.label}${f.text}`
  }
  for (const cols of [40, 120]) {
    const lay = getLayout(cols, 24)
    console.log(`\n===== AFTER · ${cols} cols (${lay.breakpoint}) =====`)
    // Responsive dashboard summary line (most important first).
    const filled = Math.round(0.1 * lay.progressWidth)
    const pbar = "█".repeat(filled) + "░".repeat(lay.progressWidth - filled)
    const segs = ["[▶ RUNNING]", "Iter 1", `Tasks 4/39 ${pbar} 10%`, "Model zai-coding-plan/glm-5.2", "Guard ● OK"]
    console.log(titleBar("dashboard", Math.min(cols, lay.cols)))
    console.log("  " + fitSegments(segs, lay.inner))
    console.log(bar(Math.min(cols, lay.cols)))
    for (const e of stream) console.log(render(e, lay.logContentWidth))
  }
}
