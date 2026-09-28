import type { PlanProgress } from "../types"
import { splitLines, normalizeLineEndings } from "./text"

export type TaskType = "completed" | "pending" | "manual" | "blocked" | "not-a-task"
export type TaskLookupStatus = TaskType | "missing"

interface ParsedTask {
  type: TaskType
  description: string
  blockedReason?: string
}

interface PlanLine {
  line: string
  index: number
}

interface PlanLineState extends PlanLine {
  isFenced: boolean
  isFenceDelimiter: boolean
}

interface ActiveFence {
  char: "`" | "~"
  length: number
}

function parseOpeningFence(line: string): ActiveFence | null {
  const m = line.match(/^[^\S\r\n]{0,3}(`{3,}|~{3,})([^`~]*)$/)
  if (!m) return null
  const fence = m[1]
  return { char: fence[0] as "`" | "~", length: fence.length }
}

function isClosingFence(line: string, active: ActiveFence): boolean {
  const escapedChar = active.char === "`" ? "`" : "~"
  const re = new RegExp(`^[^\\S\\r\\n]{0,3}${escapedChar}{${active.length},}\\s*$`)
  return re.test(line)
}

export function splitPlanLinesWithFenceState(content: string): PlanLineState[] {
  const lines = splitLines(content)
  const out: PlanLineState[] = []
  let activeFence: ActiveFence | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (activeFence === null) {
      const opening = parseOpeningFence(line)
      if (opening !== null) {
        activeFence = opening
        out.push({
          line,
          index,
          isFenced: true,
          isFenceDelimiter: true,
        })
      } else {
        out.push({
          line,
          index,
          isFenced: false,
          isFenceDelimiter: false,
        })
      }
    } else {
      if (isClosingFence(line, activeFence)) {
        activeFence = null
        out.push({
          line,
          index,
          isFenced: true,
          isFenceDelimiter: true,
        })
      } else {
        out.push({
          line,
          index,
          isFenced: true,
          isFenceDelimiter: false,
        })
      }
    }
  }
  return out
}

export function planLinesOutsideCodeFences(content: string): PlanLine[] {
  return splitPlanLinesWithFenceState(content)
    .filter((entry) => !entry.isFenced)
    .map(({ line, index }) => ({ line, index }))
}

/**
 * Strip a surrounding ```fence``` or ~~~fence~~~ if the model wrapped its output in one.
 * Used by --create-plan to clean the generated plan before saving. Supports CRLF,
 * tildes, and language tags with non-alphabetic characters (W2-06, W2-07).
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const m = trimmed.match(/^(`{3,}|~{3,})[^\r\n]*\r?\n([\s\S]*?)\r?\n\1$/)
  return m ? m[2].trim() : trimmed
}

/**
 * Remove fenced code blocks from PLAN.md content so task-counting and
 * task-selection NEVER mistake a documented example for a real task.
 *
 * A PLAN.md that documents its own format with a ```markdown block containing
 * `- [ ] example` would otherwise inflate `parsePlan` counts and could make
 * `getCurrentTaskFromContent` pick a documentation line as the "current task".
 * The same problem already forced `parsePlanComplete` to strip fences before
 * scanning for `<plan-complete>` — this is the single source of truth for that
 * heuristic, so every task reader applies it consistently (DRY).
 *
 * Handles paired fences (``` … ```) and an unterminated trailing fence
 * (anchored to line start so an inline ``` literal in prose is NOT mistaken
 * for a fence — that deleted real content and left the loop spinning at 100%).
 */
export function stripInlineCodeFences(content: string): string {
  return planLinesOutsideCodeFences(content).map(({ line }) => line).join("\n")
}

/**
 * Parses a single line from PLAN.md to determine its task type and content.
 * 
 * Handles various formats:
 * - - [x] or - [X] -> completed
 * - - [ ] -> pending
 * - - [MANUAL] or - [ ] [MANUAL] -> manual
 * - - [BLOCKED] or - [ ] [BLOCKED] -> blocked
 */
export function parseTaskLine(line: string): ParsedTask {
  const trimmed = line.trim()
  
  // Must start with "- [" to be a task
  if (!trimmed.startsWith("- [")) {
    return { type: "not-a-task", description: "" }
  }
  
  // Find closing bracket for the checkbox/tag
  // We start searching from index 3 to skip the initial "- ["
  const closeBracket = trimmed.indexOf("]", 3)
  if (closeBracket === -1) {
    return { type: "not-a-task", description: "" }
  }
  
  const checkboxContent = trimmed.slice(3, closeBracket).trim()
  let afterCheckbox = trimmed.slice(closeBracket + 1).trim()
  
  // Check for completed
  if (/^[xX]$/.test(checkboxContent)) {
    return { type: "completed", description: afterCheckbox }
  }
  
  // Check for MANUAL - either in checkbox or as tag after
  if (/^MANUAL$/i.test(checkboxContent)) {
    return { type: "manual", description: afterCheckbox }
  }
  
  // Check for [MANUAL] tag after empty checkbox
  if (checkboxContent === "" && afterCheckbox.toUpperCase().startsWith("[MANUAL]")) {
    const description = afterCheckbox.replace(/^\[MANUAL\]\s*/i, "")
    return { type: "manual", description }
  }
  
  // Check for BLOCKED - either in checkbox or as tag after.
  // Anchor the keyword so "BLOCKEDABC" is not misread as blocked.
  if (/^BLOCKED(?=$|[:\s])/i.test(checkboxContent)) {
    const reason = checkboxContent.replace(/^BLOCKED[:\s]*/i, "")
    return { 
      type: "blocked", 
      description: afterCheckbox,
      blockedReason: reason 
    }
  }
  
  // Check for [BLOCKED] tag after empty checkbox
  if (checkboxContent === "" && /^\[BLOCKED/i.test(afterCheckbox)) {
    const match = afterCheckbox.match(/^\[BLOCKED[:\s]*([^\]]*)\]\s*(.*)$/i)
    if (match) {
      return { 
        type: "blocked", 
        description: match[2] || "", 
        blockedReason: match[1]?.trim() || "" 
      }
    }
  }
  
  // Empty checkbox = pending, but reject if there is no description.
  // A bare `- [ ]` with only whitespace inside brackets and no trailing text
  // is not an actionable task — OCLoop would have nothing to execute.
  if (checkboxContent === "") {
    if (!afterCheckbox) {
      return { type: "not-a-task", description: "" }
    }
    return { type: "pending", description: afterCheckbox }
  }
  
  // Unknown checkbox content - treat as not a task
  return { type: "not-a-task", description: "" }
}

/**
 * Parses a PLAN.md file content and extracts progress information.
 *
 * Recognizes:
 * - `- [x]` or `- [X]` - completed tasks
 * - `- [ ]` - pending tasks
 * - `- [MANUAL]` or `- [ ] [MANUAL]` - manual tasks (excluded from automation)
 * - `- [BLOCKED]` or `- [ ] [BLOCKED]` - blocked tasks
 *
 * @param content - The content of the PLAN.md file
 * @returns PlanProgress object with task counts and percentages
 */
export function parsePlan(content: string): PlanProgress {
  // Strip fenced code blocks so a documented example (a ```markdown block with
  // `- [ ] example` lines) is NOT counted as a real task — otherwise total/
  // completed/percentComplete are inflated and the pre-flight completion check
  // (isStructurallyComplete) can misfire. See stripInlineCodeFences.
  const lines = splitLines(stripInlineCodeFences(content))
  let total = 0
  let completed = 0
  let manual = 0
  let blocked = 0

  for (const line of lines) {
    const task = parseTaskLine(line)
    
    if (task.type === "not-a-task") {
      continue
    }

    total++
    
    switch (task.type) {
      case "completed":
        completed++
        break
      case "manual":
        manual++
        break
      case "blocked":
        blocked++
        break
      // pending counts towards total but not specific buckets here
    }
  }

  const pending = total - completed - manual - blocked
  const automatable = pending
  // Blocked tasks are terminal (the loop treats [x] OR [BLOCKED] as done), so
  // they must leave the denominator — otherwise a fully-resolved plan with
  // blocked items never reaches 100%.
  const denominator = total - manual - blocked
  // When denominator is 0 and total > 0 (all tasks are MANUAL or BLOCKED), there are no
  // automatable tasks for the loop to run — it has nothing to do, so 100% is
  // the correct semantic: the plan is complete from the loop's perspective.
  // When total is 0 (empty plan / no tasks), percentComplete is 0 (W2-04).
  const percentComplete =
    total === 0
      ? 0
      : denominator > 0
        ? Math.round((completed / denominator) * 100)
        : 100

  return {
    total,
    completed,
    pending,
    manual,
    blocked,
    automatable,
    percentComplete,
  }
}

/**
 * Structural completion: the loop has nothing left to do. True when the plan has at
 * least one task and NO automatable tasks remain (pending = automatable = 0; MANUAL
 * and BLOCKED don't count, same as the progress denominator). This is owned by the
 * tooling — it does NOT depend on the model writing a <plan-complete> tag.
 */
export function isStructurallyComplete(p: PlanProgress): boolean {
  return p.total > 0 && p.automatable === 0
}

/** Deterministic completion summary from the plan counts (no model needed). */
export function buildCompletionSummary(p: PlanProgress): string {
  const extra: string[] = []
  if (p.manual > 0) extra.push(`${p.manual} manual`)
  if (p.blocked > 0) extra.push(`${p.blocked} blocked`)
  const tail = extra.length ? ` (${extra.join(", ")})` : ""
  return `All tasks complete: ${p.completed}/${p.total - p.manual - p.blocked}${tail}.`
}

/**
 * Extracts content between <plan-complete> tags.
 * 
 * @param content - The content of the PLAN.md file
 * @returns The summary content between tags or null if not found
 */
export function parsePlanComplete(content: string): string | null {
  // Use matchAll to find all occurrences
  // Regex explanation:
  // ^ {0,3}<plan-complete> : Match a top-level start tag with Markdown-safe indentation
  // ([\s\S]*?)       : Capture content non-greedily
  // <\/plan-complete>: Match end tag
  // m                : Multiline flag to allow ^ to match start of lines
  // g                : Global flag for matchAll
  //
  // Strip fenced code blocks first: a ```fence``` documenting the mechanism can
  // put <plan-complete> at column 0, which ^ would otherwise match and trigger a
  // premature completion. Real completion tags live at the document's top level.
  const withoutFences = stripInlineCodeFences(content)
  const matches = [
    ...withoutFences.matchAll(
      // Opening anchored to line start (0-3 spaces) so mid-line / 4+-indented / fenced
      // examples never match. The closing tag may sit ANYWHERE after it: on the same
      // line, at the start of its own line, OR glued to the end of the last content
      // line (`...done.</plan-complete>`) — the form models actually emit, which the
      // old two-branch regex rejected, leaving the loop spinning at 100%.
      /^ {0,3}<plan-complete>([\s\S]*?)<\/plan-complete>/gm,
    ),
  ]

  if (matches.length === 0) return null

  // Return the last match found
  const last = matches[matches.length - 1]
  return (last[1] ?? "").trim()
}

/**
 * Append a `<plan-complete>` tag with `summary` to the end of `content`, but only if
 * one isn't already present and the plan is structurally complete (idempotent, C2-12, W2-15).
 * Lets the TOOLING write the completion marker deterministically instead of the model.
 */
export function withPlanCompleteTag(content: string, summary: string): string {
  if (parsePlanComplete(content) !== null) return content
  if (!isStructurallyComplete(parsePlan(content))) return content
  const isCrlf = content.includes("\r\n")
  const nl = isCrlf ? "\r\n" : "\n"
  const base = content.endsWith("\n") ? content : content + nl
  return `${base}${nl}<plan-complete>${summary}</plan-complete>${nl}`
}

/**
 * Read a plan file, run `transform` on its content, and return the result.
 * Returns `fallback` if the read fails (missing file, EISDIR, EACCES, etc.).
 * The single try/catch avoids the TOCTOU window of `exists()` + `text()`.
 */
async function readPlanFileSafe<T>(
  planPath: string,
  transform: (content: string) => T,
  fallback: T,
): Promise<T> {
  try {
    const content = await Bun.file(planPath).text()
    return transform(content)
  } catch {
    return fallback
  }
}

/**
 * Gets the completion summary from a plan file.
 *
 * TOCTOU-safe: wraps the read in a single try/catch and returns null on any
 * I/O failure (missing file, EISDIR, EACCES), so the caller never has to wrap
 * this in a try/catch for the read itself.
 *
 * @param planPath - Path to the PLAN.md file
 * @returns The summary text or null if not complete / unreadable
 */
export async function getPlanCompleteSummary(planPath: string): Promise<string | null> {
  return readPlanFileSafe(planPath, (content) => parsePlanComplete(content), null)
}

/**
 * Reads and parses a PLAN.md file from disk.
 *
 * @param planPath - Path to the PLAN.md file
 * @returns PlanProgress object with task counts and percentages
 * @throws Error if the file cannot be read
 */
export async function parsePlanFile(planPath: string): Promise<PlanProgress> {
  const file = Bun.file(planPath)
  const content = await file.text()
  return parsePlan(content)
}

/**
 * Extracts the current task text from plan content.
 *
 * Finds the first unchecked task (- [ ]) that isn't MANUAL or BLOCKED
 * and returns its description.
 *
 * @param content - The content of the PLAN.md file
 * @returns The task description or null if no unchecked tasks found
 */
/** Walk every task line outside code fences (shared by list/find/getCurrent). */
function forEachTaskLine(
  content: string,
  visit: (task: ParsedTask, line: string) => void,
): void {
  for (const { line } of planLinesOutsideCodeFences(content)) {
    const task = parseTaskLine(line)
    if (task.type === "not-a-task") continue
    visit(task, line)
  }
}

/**
 * All pending task descriptions in document order (outside code fences).
 * Single source of truth for plan-transition snapshot diffs.
 */
export function listPendingTaskDescriptions(content: string): string[] {
  const out: string[] = []
  forEachTaskLine(content, (task) => {
    if (task.type === "pending" && task.description) out.push(task.description)
  })
  return out
}

/**
 * Status of the first task line whose description matches `description`.
 * Returns `missing` when no matching task line exists.
 */
export function findTaskStatusByDescription(
  content: string,
  description: string,
): TaskLookupStatus {
  for (const { line } of planLinesOutsideCodeFences(content)) {
    const task = parseTaskLine(line)
    if (task.type === "not-a-task" || task.description !== description) continue
    return task.type
  }
  return "missing"
}

/**
 * Line index of the first pending task matching `description`, or -1.
 * Scans outside code fences only (same grammar as task selection).
 */
export function findPendingLineIndex(content: string, description: string): number {
  const normalized = normalizeLineEndings(content)
  for (const entry of planLinesOutsideCodeFences(normalized)) {
    const task = parseTaskLine(entry.line)
    if (task.type === "pending" && task.description === description) {
      return entry.index
    }
  }
  return -1
}

export function getCurrentTaskFromContent(content: string): string | null {
  const pending = listPendingTaskDescriptions(content)
  return pending[0] ?? null
}

/**
 * Reads a PLAN.md file and returns the current (first unchecked) task.
 *
 * @param planPath - Path to the PLAN.md file
 * @returns The task description or null if no unchecked tasks found
 * @throws Error if the file cannot be read
 */
export async function getCurrentTask(planPath: string): Promise<string | null> {
  const file = Bun.file(planPath)
  const content = await file.text()
  return getCurrentTaskFromContent(content)
}

/**
 * Extracts subtask descriptions from an agent reply.
 *
 * The split agent is asked for `- [ ]` checkbox lines, but models routinely
 * reply with plain bullets (`-`, `*`, `+`) or numbered items (`1.`, `2)`), and
 * may wrap the list in a ``` fence or pad it with prose. To be robust we accept
 * any of those list shapes: strip the leading marker (and any leftover
 * `[ ]`/`[x]` checkbox) and take the remainder as the description. Blank lines,
 * markdown headings (`#`), fence delimiters, prose without a list marker, and
 * already-`[x]`/`[MANUAL]`/`[BLOCKED]` checkboxes are skipped. Returns [] when
 * no list items are found.
 */
export function parseSubtasksFromReply(text: string): string[] {
  const out: string[] = []
  for (const raw of splitLines(text)) {
    const line = raw.trim()
    // Skip blank lines, markdown headings, and fence delimiters themselves —
    // but DO parse content "inside" a fence: agents often wrap the whole list
    // in a ```markdown block, so the subtasks live between the delimiters.
    if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("~~~")) continue

    // Normalize alternate bullet styles (*, +, 1., 1)) into standard "- [" so parseTaskLine can inspect them (W2-02)
    const normalizedMarker = raw.replace(/^(\s*)(?:[-*+]|\d+[.)])\s*\[/, "$1- [")
    const task = parseTaskLine(normalizedMarker)
    if (task.type === "pending" && task.description) {
      const cleanDesc = task.description.replace(/[\r\n]+/g, " ").trim()
      if (cleanDesc) out.push(cleanDesc)
      continue
    }
    // A completed/manual/blocked checkbox is not a fresh subtask — skip it.
    if (task.type !== "not-a-task") continue

    // Lenient: a bullet (-, *, +) or numbered (`1.` / `1)`) list item.
    const m = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/)
    if (!m) continue
    // If the bullet carried an explicit manual/blocked/done tag that wasn't standard, skip it
    if (/^\[(?:[xX]|MANUAL|BLOCKED)/i.test(m[1])) continue
    // Strip a leftover empty checkbox if the bullet still carried one (e.g. `* [ ] x`).
    const desc = m[1].replace(/^\[\s*\]\s*/, "").replace(/[\r\n]+/g, " ").trim()
    if (desc) out.push(desc)
  }
  return out
}

/**
 * Replaces the FIRST pending task (`- [ ]`) or a target task matching `targetTaskDescription`
 * with `subtasks` rendered as pending lines, preserving the original line's leading indentation.
 *
 * Returns the new content, or `null` when there is no pending task to replace
 * or `subtasks` is empty — so the caller can surface a real failure instead of
 * silently writing an unchanged file.
 *
 * Pure string transform (mirrors withPlanCompleteTag); the caller persists the
 * result with Bun.write.
 */
export function replaceFirstPendingTaskWithSubtasks(
  content: string,
  subtasks: string[],
  targetTaskDescription?: string,
): string | null {
  const cleanSubtasks = subtasks
    .map((s) => s.replace(/[\r\n]+/g, " ").trim())
    .filter(Boolean)
  if (cleanSubtasks.length === 0) return null

  // Normalize endings up front: we rebuild the file with `join("\n")` below,
  // so leaving a `\r` on original lines (CRLF file) would mix `\r\n` and `\n`.
  // Normalizing first guarantees the written file is consistently `\n`.
  const normalized = normalizeLineEndings(content)
  const lines = splitLines(normalized)
  for (const entry of planLinesOutsideCodeFences(normalized)) {
    const task = parseTaskLine(entry.line)
    if (task.type === "pending") {
      // If a target task description is specified, ensure we match it (C2-11)
      if (targetTaskDescription && task.description !== targetTaskDescription) {
        continue
      }
      const indent = entry.line.match(/^(\s*)/)?.[1] ?? ""
      const replacement = cleanSubtasks.map((s) => `${indent}- [ ] ${s}`)
      lines.splice(entry.index, 1, ...replacement)
      return lines.join("\n")
    }
  }
  return null
}

/**
 * Extract the eval rubric declared under a pending or completed task, if any.
 *
 * The rubric is a single sub-bullet of the form `  - eval: <rubric prose>`
 * placed immediately after the `- [ ] <task>` or `- [x] <task>` line (and before the next task).
 * That syntax is NOT counted as a task by `parseTaskLine` (it lacks the `- [`
 * checkbox prefix), so it is safe to use as metadata — the plan's task counts
 * are unaffected.
 *
 * Returns the trimmed rubric text, or `null` when the task has no `eval:`
 * sub-bullet (the caller skips the eval in that case).
 */
export function getEvalRubricForTask(
  content: string,
  taskDescription: string,
): string | null {
  const lineStates = splitPlanLinesWithFenceState(content)
  // Find the task matching the description (pending or completed: C2-10).
  let taskLineIdx = -1
  for (const entry of lineStates) {
    if (entry.isFenced) continue
    const task = parseTaskLine(entry.line)
    if (task.type !== "not-a-task" && task.description === taskDescription) {
      taskLineIdx = entry.index
      break
    }
  }
  if (taskLineIdx === -1) return null

  // Scan the indented sub-bullets immediately following the task line. Stop at
  // the next top-level task (a `- [` line) or a non-indented, non-empty line.
  const evalRe = /^\s*-\s*eval:\s*(.+?)\s*$/i
  for (let i = taskLineIdx + 1; i < lineStates.length; i++) {
    const state = lineStates[i]
    if (state.isFenceDelimiter) break
    if (state.isFenced) continue
    const line = state.line
    if (line.trim() === "") continue // blank lines between a task and its notes are tolerated
    // A new task line ends the rubric window.
    if (/^\s*-\s*\[/.test(line)) break
    const m = line.match(evalRe)
    if (m) return m[1]
    // Any other non-indented content also closes the window.
    if (!/^\s/.test(line)) break
  }
  return null
}

/**
 * Mark the FIRST pending task (`- [ ]`) as `- [BLOCKED: <reason>]`, preserving
 * the original line's leading indentation and the rest of the description.
 *
 * The eval layer calls this when an eval has failed and the retry budget is
 * exhausted — the task is halted rather than looped forever. Mirrors the
 * pattern of `replaceFirstPendingTaskWithSubtasks` (splice the first pending
 * line, keep everything else byte-identical).
 *
 * Returns the new content, or `null` when there is no pending task to block —
 * so the caller can surface a real failure instead of writing an unchanged
 * file. The caller MUST persist with a compare-and-swap (re-read + byte
 * compare before `Bun.write`) to avoid clobbering a concurrent agent edit of
 * PLAN.md — see `checkPlanComplete` in App.tsx for the established pattern.
 */
export function replaceFirstPendingTaskWithBlocked(
  content: string,
  reason: string,
): string | null {
  const pending = listPendingTaskDescriptions(content)
  const first = pending[0]
  return first ? replacePendingTaskWithBlocked(content, first, reason) : null
}

/**
 * Mark a specific pending task as `- [BLOCKED: <reason>]` by description.
 * Returns `null` when the task is not found or not pending.
 */
export function replacePendingTaskWithBlocked(
  content: string,
  taskDescription: string,
  reason: string,
): string | null {
  const cleanReason = reason
    .replace(/[\r\n]+/g, " ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim()
  const normalized = normalizeLineEndings(content)
  const lines = splitLines(normalized)
  const idx = findPendingLineIndex(normalized, taskDescription)
  if (idx === -1) return null
  const indent = lines[idx].match(/^(\s*)/)?.[1] ?? ""
  const task = parseTaskLine(lines[idx])
  if (task.type !== "pending") return null
  lines[idx] = `${indent}- [BLOCKED: ${cleanReason}] ${task.description}`
  return lines.join("\n")
}
