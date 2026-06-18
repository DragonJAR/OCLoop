/**
 * text.ts — shared, platform-agnostic string helpers for reading user-authored
 * files (PLAN.md, .gitignore, agent replies, prompts).
 *
 * The problem these solve: Windows editors commonly save files with CRLF
 * (`\r\n`) line endings, and a stray lone `\r` can appear inside a file.
 * Naive `content.split("\n")` leaves a trailing `\r` on every line. Most call
 * sites trim per-line (so detection survives), but transforms that preserve
 * original line content (e.g. the subtask-split splice → `join("\n")`) then
 * produce a file with MIXED line endings, and append-after-checks (e.g.
 * .gitignore dedupe) can glue a new entry onto the preceding line's `\r`.
 *
 * Centralizing the normalization here keeps every reader consistent (DRY) and
 * makes the one place to reason about line-ending correctness.
 */

/**
 * Normalize all line endings to `\n`: CRLF (`\r\n`) and a lone `\r` (classic
 * Mac) both collapse to `\n`. Apply this once at a read boundary, then the rest
 * of the code can assume `\n`-only content.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

/**
 * Split text into lines using any line-ending style (`\r\n`, `\r`, or `\n`),
 * returning the lines WITHOUT their terminators. Equivalent to
 * `normalizeLineEndings(text).split("\n")` but in a single pass with no
 * intermediate string — the common case for line-oriented parsers.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}
