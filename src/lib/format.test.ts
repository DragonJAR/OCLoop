
import { describe, expect, test } from "bun:test";
import { formatTokenCount, truncate, truncateText, getToolPreview, stripMarkdown, tokensPerMin, wrapText, clampLines } from "./format";

describe("format utilities", () => {
  describe("truncate (width-exact, …)", () => {
    test("returns original string if length is less than or equal to limit", () => {
      expect(truncate("hello", 10)).toBe("hello");
      expect(truncate("hello", 5)).toBe("hello");
    });

    test("truncates string and adds ellipsis if length exceeds limit", () => {
      expect(truncate("hello world", 8)).toBe("hello w…");
      expect(truncate("hello world", 5)).toBe("hell…");
    });

    test("never overflows for len <= 0 (negative slice index bug)", () => {
      // A naive slice(0, len-1) with len<=0 is a from-end index that returns a
      // near-full string — longer than the requested width. Must be "".
      expect(truncate("hello world", 0)).toBe("");
      expect(truncate("hello world", -3)).toBe("");
      // len === 1 keeps only the ellipsis, never a negative index.
      expect(truncate("hello world", 1)).toBe("…");
    });
  });

  test("formatTokenCount formats numbers with separators", () => {
    // Note: toLocaleString behavior depends on locale, but standard envs usually default to something that uses commas or spaces
    // We check that it at least changes the string for large numbers or keeps it for small
    expect(formatTokenCount(100)).toBe("100");
    const formatted1000 = formatTokenCount(1000);
    expect(formatted1000.length).toBeGreaterThan(4); // "1,000" or "1 000"
  });

  test("truncateText truncates correctly", () => {
    expect(truncateText("hello world", 11)).toBe("hello world");
    expect(truncateText("hello world", 10)).toBe("hello w...");
    expect(truncateText("hello", 5)).toBe("hello");
    expect(truncateText("hello", 4)).toBe("h...");
  });

  test("truncateText handles maxLen < 3 without exceeding the limit", () => {
    // maxLen = 0: return empty string
    expect(truncateText("hello world", 0)).toBe("");
    // maxLen = 1: truncate to 1 char, no ellipsis (can't fit "...")
    expect(truncateText("hello world", 1)).toBe("h");
    // maxLen = 2: truncate to 2 chars, no ellipsis
    expect(truncateText("hello world", 2)).toBe("he");
    // maxLen = 3: normal behavior with ellipsis
    expect(truncateText("hello world", 3)).toBe("...");
    // Negative maxLen: return empty string
    expect(truncateText("hello world", -1)).toBe("");
  });

  test("truncateText normalizes whitespace", () => {
    expect(truncateText("hello\nworld", 20)).toBe("hello world");
    expect(truncateText("hello   world", 20)).toBe("hello world");
    expect(truncateText("  hello world  ", 20)).toBe("hello world");
    expect(truncateText("line 1\nline 2", 10)).toBe("line 1 ...");
  });

  test("getToolPreview extracts info correctly", () => {
    expect(getToolPreview("bash", { command: "ls -la" })).toBe("ls -la");
    expect(getToolPreview("read", { filePath: "/path/to/file.txt" })).toBe("file.txt");
    expect(getToolPreview("write", { filePath: "C:\\Windows\\System32\\config.sys" })).toBe("config.sys");
    expect(getToolPreview("glob", { pattern: "*.ts" })).toBe("*.ts");
    expect(getToolPreview("unknown", {})).toBe("unknown");
  });

  test("stripMarkdown removes markdown formatting", () => {
    expect(stripMarkdown("**Bold** text")).toBe("Bold text");
    expect(stripMarkdown("*Italic* text")).toBe("Italic text");
    expect(stripMarkdown("_Italic_ text")).toBe("Italic text");
    expect(stripMarkdown("`Code` inline")).toBe("Code inline");
    expect(stripMarkdown("[Link](http://example.com)")).toBe("Link");
    expect(stripMarkdown("# Header")).toBe("Header");
    expect(stripMarkdown("- List item")).toBe("List item");
    expect(stripMarkdown("1. Numbered item")).toBe("Numbered item");
    expect(stripMarkdown("Mixed **bold** and `code`")).toBe("Mixed bold and code");
  });

  test("stripMarkdown preserves snake_case identifiers and code contents", () => {
    // Underscores inside identifiers must NOT be treated as italic markers.
    expect(stripMarkdown("Update user_id_field here")).toBe("Update user_id_field here");
    expect(stripMarkdown("rename src/lib/with_timeout.ts")).toBe("rename src/lib/with_timeout.ts");
    // Code spans are stripped of backticks but their contents are untouched.
    expect(stripMarkdown("Fix `user_id_field` now")).toBe("Fix user_id_field now");
    // Arithmetic with asterisks isn't emphasis.
    expect(stripMarkdown("compute 2 * 3 * 4")).toBe("compute 2 * 3 * 4");
    // Real emphasis still strips.
    expect(stripMarkdown("a _word_ here")).toBe("a word here");
  });

  describe("tokensPerMin (guards div-by-zero)", () => {
    test("returns 0 when no time has elapsed", () => {
      expect(tokensPerMin(1000, 0)).toBe(0);
      expect(tokensPerMin(1000, -5)).toBe(0);
    });
    test("computes tokens per minute", () => {
      expect(tokensPerMin(600, 60000)).toBe(600);
      expect(tokensPerMin(300, 30000)).toBe(600);
    });
  });

  describe("wrapText (full task across N lines, never cut)", () => {
    test("keeps a short string on one line", () => {
      expect(wrapText("hello world", 20)).toEqual(["hello world"]);
    });
    test("wraps at word boundaries without exceeding width", () => {
      const lines = wrapText("the quick brown fox jumps", 10);
      expect(lines.every((l) => l.length <= 10)).toBe(true);
      expect(lines.join(" ")).toBe("the quick brown fox jumps");
    });
    test("hard-splits a word longer than the width", () => {
      const lines = wrapText("supercalifragilistic", 5);
      expect(lines.every((l) => l.length <= 5)).toBe(true);
      expect(lines.join("")).toBe("supercalifragilistic");
    });
    test("returns [] for empty input or non-positive width", () => {
      expect(wrapText("", 10)).toEqual([]);
      expect(wrapText("hi", 0)).toEqual([]);
    });
  });

  describe("clampLines (bottom-panel task budget)", () => {
    test("returns all lines untouched when within max", () => {
      expect(clampLines(["a", "b", "c"], 5)).toEqual({ shown: ["a", "b", "c"], hidden: 0 });
      expect(clampLines(["a", "b"], 2)).toEqual({ shown: ["a", "b"], hidden: 0 });
    });
    test("reserves one slot for the indicator when overflowing (total stays <= max)", () => {
      const r = clampLines(["a", "b", "c", "d", "e"], 3);
      expect(r.shown).toEqual(["a", "b"]); // max-1 shown
      expect(r.hidden).toBe(3); // c, d, e
      expect(r.shown.length + 1).toBeLessThanOrEqual(3); // shown + 1 indicator line
    });
    test("clamps non-positive/odd max to at least 1", () => {
      expect(clampLines(["a", "b"], 0)).toEqual({ shown: [], hidden: 2 });
      expect(clampLines(["a", "b", "c"], 2.9)).toEqual({ shown: ["a"], hidden: 2 });
    });
  });
});
