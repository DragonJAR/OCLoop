/**
 * Responsive layout primitives — pure, no @opentui dependency so they can be
 * unit-tested and previewed at any width (see docs/testing.md). Every width in
 * the UI (separator bars, progress bar, column/truncation budgets, compact vs
 * full) is derived from the real terminal size through here — nothing hardcoded.
 */

import { truncate } from "./locale"

export type Breakpoint = "narrow" | "medium" | "wide"

/** Sensible fallback when the terminal size can't be read (pipe, no TTY). */
export const FALLBACK_COLS = 80
export const FALLBACK_ROWS = 24

export interface Layout {
  cols: number
  rows: number
  breakpoint: Breakpoint
  /** Usable inner width after the panel's 1-char left+right padding. */
  inner: number
  /** Width of the dashboard progress bar (grows with the terminal). */
  progressWidth: number
  /** Message width on an activity-log line, after the timestamp/level/label prefix. */
  logContentWidth: number
  /** Width budget for the dashboard current-task line. */
  taskWidth: number
  /** Narrow terminals drop secondary fields and shorten hints. */
  compact: boolean
}

function clampInt(v: number | undefined, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback
}

/**
 * Derive a layout from the current terminal size. Re-call on every render so it
 * tracks resizes. `narrow (<60) | medium | wide (>100)`.
 */
export function getLayout(cols?: number, rows?: number): Layout {
  const c = clampInt(cols, FALLBACK_COLS)
  const r = clampInt(rows, FALLBACK_ROWS)
  const breakpoint: Breakpoint = c < 60 ? "narrow" : c > 100 ? "wide" : "medium"
  const inner = Math.max(10, c - 2)
  // Progress bar scales with space: tiny when cramped, generous when wide.
  const progressWidth = breakpoint === "narrow" ? 6 : breakpoint === "wide" ? 24 : 12
  // Log prefix: "HH:MM:SS"(8) + "  "(2) + level glyph+space(2) + label(~9) + pad(1) ≈ 22.
  const logContentWidth = Math.max(16, inner - 22)
  const taskWidth = Math.max(16, inner - 8) // minus the "Task: " prefix + slack
  return {
    cols: c,
    rows: r,
    breakpoint,
    inner,
    progressWidth,
    logContentWidth,
    taskWidth,
    compact: breakpoint === "narrow",
  }
}

/** A separator bar sized to a width (defaults to the real terminal width). */
export function bar(width?: number, ch = "═"): string {
  return ch.repeat(Math.max(1, clampInt(width, FALLBACK_COLS)))
}

/** A centered title inside a separator bar, sized to the given width. */
export function titleBar(title: string, width?: number, ch = "═"): string {
  const w = clampInt(width, FALLBACK_COLS)
  const label = ` ${title} `
  if (label.length >= w) return label.slice(0, w)
  const side = Math.floor((w - label.length) / 2)
  return ch.repeat(side) + label + ch.repeat(w - side - label.length)
}

/** Current terminal column count for plain-text (non-TUI) output, with fallback. */
export function terminalCols(): number {
  return clampInt(process.stdout?.columns, FALLBACK_COLS)
}

/**
 * Join labelled segments to a target width, dropping trailing low-priority ones
 * and truncating the result so it never overflows. Segments are ordered by
 * importance (most important first) — inverted-pyramid friendly.
 */
export function fitSegments(segments: string[], width: number, sep = "  "): string {
  const kept: string[] = []
  for (const s of segments) {
    if (!s) continue
    const next = kept.length ? kept.join(sep) + sep + s : s
    if (next.length > width && kept.length) break
    kept.push(s)
  }
  return truncate(kept.join(sep), width)
}
