
export function formatTokenCount(n: number): string {
  return n.toLocaleString();
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * Padded to 7 chars for TUI column alignment.
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return "0s".padStart(7, " ");

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`.padStart(7, " ");
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`.padStart(7, " ");
  }
  return `${seconds}s`.padStart(7, " ");
}

// Two truncators on purpose: `truncate` is width-exact (1-col "…", no whitespace
// touch) for TUI column fitting; `truncateText` normalizes whitespace and uses
// "..." for log/preview text. Merging them would change one call site's output.
export function truncate(str: string, len: number): string {
  if (len <= 0) return "";
  if (str.length <= len) return str;
  // Guard len === 1 too: slice(0, 0) keeps the ellipsis only, never a negative
  // (from-end) index that would paradoxically return a longer string.
  return str.slice(0, Math.max(0, len - 1)) + "…";
}

export function truncateText(text: string, maxLen: number): string {
  const normalized = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  // ponytail: maxLen < 3 can't fit the "..." ellipsis, so just slice without it.
  if (maxLen < 3) return normalized.substring(0, Math.max(0, maxLen));
  return normalized.substring(0, maxLen - 3) + "...";
}

export function formatDiffSummary(additions: number, deletions: number, files: number): string {
  return `+${additions}/-${deletions} (${files})`;
}

function getBasename(path: string): string {
  // Handle both forward and backward slashes
  return path.split(/[/\\]/).pop() || path;
}

// Generous memory guard for previews — NOT a display width. The activity log is
// the single width-aware truncator (truncates to logContentWidth, which scales
// with the terminal and reflows on resize), so previews must stay full-length
// here; capping them short would waste a wide window and not respond to resize.
const PREVIEW_MAX = 500;

export function getToolPreview(toolName: string, input: Record<string, unknown>): string {
  try {
    switch (toolName) {
      case "bash":
        // Normalize whitespace to a single line; let the log fit it to width.
        return truncateText(String(input.command || ""), PREVIEW_MAX);
      case "read":
        return getBasename(String(input.filePath || ""));
      case "write":
        return getBasename(String(input.filePath || ""));
      case "edit":
        return getBasename(String(input.filePath || ""));
      case "glob":
        return String(input.pattern || "");
      case "grep":
        return String(input.pattern || "");
      case "task":
        return String(input.description || "subtask");
      default:
        return toolName;
    }
  } catch (e) {
    return toolName;
  }
}

/** Token throughput in tokens/min. Guards elapsed<=0 to avoid div-by-zero/Infinity. */
export function tokensPerMin(totalTokens: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return totalTokens / (elapsedMs / 60000);
}

/**
 * Word-wrap `text` into lines no wider than `width` columns. A word longer than
 * `width` is hard-split so a single long token never overflows. Whitespace is
 * collapsed. Returns [] for empty input or non-positive width. Deterministic, so
 * callers can render one line per element and the box grows to fit.
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    let w = word;
    // Hard-split a word that can't fit on a line by itself.
    while (w.length > width) {
      if (line) { lines.push(line); line = ""; }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += " " + w;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Cap already-wrapped `lines` to `max`, reserving the last slot for an overflow
 * indicator when truncating. Returns the lines to render plus how many were hidden
 * (0 when nothing is cut). The caller renders one "+{hidden}" line so the total
 * stays within `max`. ponytail: pure + tiny so the bottom panel's budget math is
 * testable instead of buried inline in JSX.
 */
export function clampLines(lines: string[], max: number): { shown: string[]; hidden: number } {
  const m = Math.max(1, Math.floor(max));
  if (lines.length <= m) return { shown: lines, hidden: 0 };
  const shown = lines.slice(0, m - 1); // reserve one slot for the indicator line
  return { shown, hidden: lines.length - shown.length };
}

export function stripMarkdown(text: string): string {
  if (!text) return "";

  return text
    // Headers
    .replace(/^#{1,6}\s+/gm, "")
    // Inline code first, so emphasis rules don't touch code contents
    .replace(/`([^`]+)`/g, "$1")
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Italic (asterisk) — only at word boundaries, so "2 * 3 * 4" is left alone
    .replace(/(^|\s)\*([^*\s][^*]*?)\*(?=\s|$)/g, "$1$2")
    // Italic (underscore) — boundary-anchored so snake_case identifiers and
    // filenames like user_id_field are NOT mangled
    .replace(/(^|\s)_([^_\s][^_]*?)_(?=\s|$)/g, "$1$2")
    // Links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // List markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    // Numbered lists
    .replace(/^[\s]*\d+\.\s+/gm, "");
}
