
export function formatTokenCount(n: number): string {
  return n.toLocaleString();
}

export function truncateText(text: string, maxLen: number): string {
  const normalized = text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return normalized.substring(0, Math.max(0, maxLen - 3)) + "...";
}

export function formatDiffSummary(additions: number, deletions: number, files: number): string {
  return `+${additions}/-${deletions} (${files})`;
}

function getBasename(path: string): string {
  // Handle both forward and backward slashes
  return path.split(/[/\\]/).pop() || path;
}

export function getToolPreview(toolName: string, input: Record<string, unknown>): string {
  try {
    switch (toolName) {
      case "bash":
        return truncateText(String(input.command || ""), 50);
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
