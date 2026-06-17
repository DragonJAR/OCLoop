import type { PlanProgress } from "../types"

type TaskType = "completed" | "pending" | "manual" | "blocked" | "not-a-task"

interface ParsedTask {
  type: TaskType
  description: string
  blockedReason?: string
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
  const lines = content.split("\n")
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
  // When denominator is 0 (all tasks are MANUAL or BLOCKED), there are no
  // automatable tasks for the loop to run — it has nothing to do, so 100% is
  // the correct semantic: the plan is complete from the loop's perspective.
  const percentComplete = denominator > 0 ? Math.round((completed / denominator) * 100) : 100

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
  const withoutFences = content
    .replace(/```[\s\S]*?```/g, "") // paired fences
    // An UNTERMINATED trailing fence (malformed markdown) wouldn't match the
    // paired regex, leaving a documented `<plan-complete>` example inside it to
    // trigger a premature completion. Strip from the dangling fence to EOF too:
    // a missed real tag (loop keeps running) is far safer than a false stop.
    //
    // Anchor the fence marker to a LINE START (^ with the m flag, 0-3 spaces of
    // indentation as CommonMark allows). The previous non-anchored `/```[\s\S]*$/`
    // matched a triple-backtick INLINE in prose (e.g. "use ``` for code") and
    // deleted everything from it to EOF — including a genuine <plan-complete>
    // tag written later, which kept the loop spinning at 100% for PLAN.md files
    // that document markdown syntax. A real fence always begins at line start;
    // an inline literal has text before it on the same line and must NOT be
    // treated as an unterminated fence.
    .replace(/^[^\S\r\n]{0,3}```[\s\S]*$/gm, "")
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
 * one isn't already present (idempotent — reuses parsePlanComplete to detect). Lets
 * the TOOLING write the completion marker deterministically instead of the model.
 */
export function withPlanCompleteTag(content: string, summary: string): string {
  if (parsePlanComplete(content) !== null) return content
  const base = content.endsWith("\n") ? content : content + "\n"
  return `${base}\n<plan-complete>${summary}</plan-complete>\n`
}

/**
 * Checks if a plan file contains the completion tag.
 *
 * Defensive against TOCTOU: rather than `await file.exists()` + `await file.text()`
 * (two awaits with a window for the path to be removed, replaced with a directory,
 * or have its permissions flipped between them), the read is wrapped in a single
 * try/catch that returns `false` on any I/O failure. Source: MEJORAS.md Finding 17.4.C.
 *
 * @param planPath - Path to the PLAN.md file
 * @returns true if the plan is marked complete; false on missing file, EISDIR, EACCES, etc.
 */
export async function isPlanComplete(planPath: string): Promise<boolean> {
  try {
    const content = await Bun.file(planPath).text()
    return parsePlanComplete(content) !== null
  } catch {
    return false
  }
}

/**
 * Gets the completion summary from a plan file.
 *
 * Defensive against TOCTOU: see `isPlanComplete` above for the rationale.
 * Returns `null` on any I/O failure (missing file, EISDIR, EACCES) so the
 * caller never has to wrap this in a try/catch for the read itself.
 * Source: MEJORAS.md Finding 17.4.C.
 *
 * @param planPath - Path to the PLAN.md file
 * @returns The summary text or null if not complete / unreadable
 */
export async function getPlanCompleteSummary(planPath: string): Promise<string | null> {
  try {
    const content = await Bun.file(planPath).text()
    return parsePlanComplete(content)
  } catch {
    return null
  }
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
export function getCurrentTaskFromContent(content: string): string | null {
  const lines = content.split("\n")

  for (const line of lines) {
    const task = parseTaskLine(line)
    
    if (task.type === "pending" && task.description) {
      return task.description
    }
  }

  return null
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
