import type { PlanProgress, PlanTaskNode } from "../types"
import { splitLines, normalizeLineEndings, eolOf, preserveEol } from "./text"

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
 * Used by --create-plan to clean the generated plan before saving, and by parseEvalResult
 * to extract JSON verdicts (DRY). Supports CRLF, tildes, language tags with non-alphabetic
 * characters, single-line fences, and closing fences longer than opening per CommonMark §4.5.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const openMatch = trimmed.match(/^(`{3,}|~{3,})(?:[^\r\n]*\r?\n|[a-zA-Z0-9_-]*\s+)/)
  if (!openMatch) return trimmed

  const fenceChar = openMatch[1][0]
  const fenceLen = openMatch[1].length

  const closePattern = new RegExp(`(?:\\r?\\n|\\s+)[^\\S\\r\\n]{0,3}${fenceChar === "`" ? "`" : "~"}{${fenceLen},}\\s*$`)
  const closeMatch = trimmed.slice(openMatch[0].length).match(closePattern)
  if (!closeMatch || closeMatch.index === undefined) return trimmed

  const inner = trimmed.slice(openMatch[0].length, openMatch[0].length + closeMatch.index)
  return inner.trim()
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
  if (checkboxContent === "" && /^\[BLOCKED(?=[:\s\]])/i.test(afterCheckbox)) {
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

/** Walk every task line outside code fences (shared by parsePlan/list/find/getCurrent). */
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
  let total = 0
  let completed = 0
  let manual = 0
  let blocked = 0

  forEachTaskLine(content, (task) => {
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
    }
  })

  const pending = total - completed - manual - blocked
  const automatable = pending
  const denominator = total - manual - blocked
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
  const withoutFences = stripInlineCodeFences(content)
  const matches = [
    ...withoutFences.matchAll(
      /^ {0,3}<plan-complete>([\s\S]*?)<\/plan-complete>/gm,
    ),
  ]

  if (matches.length === 0) return null

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
  // Same EOL policy as the other plan transforms (DRY): the appended tag uses
  // the file's own terminator. `preserveEol` itself is not applicable here —
  // `content` is NOT \n-normalized, so a blanket `\n → \r\n` would corrupt the
  // existing `\r\n`s into `\r\r\n`; only the shared `eolOf` primitive is used.
  const nl = eolOf(content)
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
 */
export async function getPlanCompleteSummary(planPath: string): Promise<string | null> {
  return readPlanFileSafe(planPath, (content) => parsePlanComplete(content), null)
}

/**
 * Reads and parses a PLAN.md file from disk.
 */
export async function parsePlanFile(planPath: string): Promise<PlanProgress> {
  const file = Bun.file(planPath)
  const content = await file.text()
  return parsePlan(content)
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
 * Line index of the first task matching `description` whose status passes
 * `accepts`, or -1. Scans outside code fences only (same grammar as task
 * selection) and normalizes line endings first so the index aligns with
 * `splitLines(normalizeLineEndings(content))`.
 */
function findTaskLineIndexWhere(
  content: string,
  description: string,
  accepts: (type: TaskType) => boolean,
): number {
  const normalized = normalizeLineEndings(content)
  for (const entry of planLinesOutsideCodeFences(normalized)) {
    const task = parseTaskLine(entry.line)
    if (accepts(task.type) && task.description === description) {
      return entry.index
    }
  }
  return -1
}

/**
 * Line index of the first pending task matching `description`, or -1.
 */
export function findPendingLineIndex(content: string, description: string): number {
  return findTaskLineIndexWhere(content, description, (type) => type === "pending")
}

/**
 * Line index of the first BLOCKED task matching `description`, or -1.
 *
 * `findTaskLineIndex` matches a task in ANY status, so it cannot answer
 * "is this task already blocked?". The eval paths need exactly that: a task
 * that is still `[x]` has NOT been blocked yet, and treating its presence as
 * "a prior pass already won the race" silently drops the `[BLOCKED]` mark —
 * the task would look done while its eval failed.
 */
export function findBlockedLineIndex(content: string, description: string): number {
  return findTaskLineIndexWhere(content, description, (type) => type === "blocked")
}

/**
 * Line index of the first task matching `description` regardless of status
 * (pending/completed/manual/blocked), or -1.
 */
export function findTaskLineIndex(content: string, description: string): number {
  return findTaskLineIndexWhere(content, description, (type) => type !== "not-a-task")
}

export function getCurrentTaskFromContent(content: string): string | null {
  const pending = listPendingTaskDescriptions(content)
  return pending[0] ?? null
}

/**
 * Reads a PLAN.md file and returns the current (first unchecked) task.
 */
export async function getCurrentTask(planPath: string): Promise<string | null> {
  const file = Bun.file(planPath)
  const content = await file.text()
  return getCurrentTaskFromContent(content)
}

/**
 * Extracts subtask descriptions from an agent reply.
 */
export function parseSubtasksFromReply(text: string): string[] {
  const out: string[] = []
  for (const raw of splitLines(text)) {
    const line = raw.trim()
    if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("~~~")) continue

    const normalizedMarker = raw.replace(/^(\s*)(?:[-*+]|\d+[.)])\s*\[/, "$1- [")
    const task = parseTaskLine(normalizedMarker)
    if (task.type === "pending" && task.description) {
      const cleanDesc = task.description.replace(/[\r\n]+/g, " ").trim()
      if (cleanDesc) out.push(cleanDesc)
      continue
    }
    if (task.type !== "not-a-task") continue

    const m = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/)
    if (!m) continue
    if (/^\[(?:[xX]\s*\]|MANUAL(?=[:\s\]])|BLOCKED(?=[:\s\]]))/i.test(m[1])) continue
    const desc = m[1].replace(/^\[\s*\]\s*/, "").replace(/[\r\n]+/g, " ").trim()
    if (desc) out.push(desc)
  }
  return out
}

/**
 * Replaces the FIRST pending task (`- [ ]`) or a target task matching `targetTaskDescription`
 * with `subtasks` rendered as pending lines, preserving the original line's leading indentation.
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

  const normalized = normalizeLineEndings(content)
  const lines = splitLines(normalized)
  for (const entry of planLinesOutsideCodeFences(normalized)) {
    const task = parseTaskLine(entry.line)
    if (task.type === "pending") {
      if (targetTaskDescription && task.description !== targetTaskDescription) {
        continue
      }
      const indent = entry.line.match(/^(\s*)/)?.[1] ?? ""
      const replacement = cleanSubtasks.map((s) => `${indent}- [ ] ${s}`)
      lines.splice(entry.index, 1, ...replacement)
      return preserveEol(content, lines.join("\n"))
    }
  }
  return null
}

/**
 * Shared scanner for indented metadata sub-bullets (`- eval:`, `- depends:`, `- files:`)
 * immediately following a task line at `taskLineIdx`. Stops at the next task line
 * (`- [`), fence delimiter, or non-indented non-empty line (DRY).
 */
function scanTaskSubBullets(
  lineStates: PlanLineState[],
  taskLineIdx: number,
): { lines: string[]; endLineIdx: number } {
  const subLines: string[] = []
  let endLineIdx = taskLineIdx
  for (let i = taskLineIdx + 1; i < lineStates.length; i++) {
    const state = lineStates[i]
    if (state.isFenceDelimiter) break
    if (state.isFenced) continue
    const line = state.line
    if (line.trim() === "") continue
    if (/^\s*-\s*\[/.test(line)) break
    if (!/^\s/.test(line)) break
    subLines.push(line)
    endLineIdx = state.index
  }
  return { lines: subLines, endLineIdx }
}

/**
 * Structured sub-bullet directives a task may carry. Single source of truth:
 * `getEvalRubricForTask` matches the `eval` directive, `parsePlanTasks` the
 * `depends`/`files` pair, and `getTaskSubNotes` must exclude ALL of them —
 * adding a directive to any consumer without extending this list would leak
 * the directive line into worker memory notes (extractWorkerPlanEdits →
 * root PLAN.md).
 */
const TASK_DIRECTIVES = ["eval", "depends", "deps", "files", "scope"] as const

const directiveValueRe = (names: readonly string[]): RegExp =>
  new RegExp(`^\\s*-\\s*(?:${names.join("|")}):\\s*(.+?)\\s*$`, "i")

const EVAL_DIRECTIVE_RE = directiveValueRe(["eval"])
const DEPENDS_DIRECTIVE_RE = directiveValueRe(["depends", "deps"])
const FILES_DIRECTIVE_RE = directiveValueRe(["files", "scope"])
const ANY_DIRECTIVE_RE = new RegExp(
  `^\\s*-\\s*(?:${TASK_DIRECTIVES.join("|")}):`,
  "i",
)

/**
 * Extract the eval rubric declared under a pending or completed task, if any.
 */
export function getEvalRubricForTask(
  content: string,
  taskDescription: string,
): string | null {
  const lineStates = splitPlanLinesWithFenceState(content)
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

  const { lines } = scanTaskSubBullets(lineStates, taskLineIdx)
  for (const line of lines) {
    const m = line.match(EVAL_DIRECTIVE_RE)
    if (m) return m[1]
  }
  return null
}

/**
 * Extract indented prose memory notes under `taskDescription` (excluding
 * structured metadata directives `- eval:`, `- depends:`, `- files:`).
 * Shared by `extractWorkerPlanEdits` and plan inspection (DRY).
 */
export function getTaskSubNotes(
  content: string,
  taskDescription: string,
): string[] {
  const normalized = normalizeLineEndings(content)
  const lineStates = splitPlanLinesWithFenceState(normalized)
  const taskLineIdx = findTaskLineIndex(normalized, taskDescription)
  if (taskLineIdx === -1) return []

  const { lines } = scanTaskSubBullets(lineStates, taskLineIdx)
  const out: string[] = []
  for (const line of lines) {
    if (ANY_DIRECTIVE_RE.test(line)) continue
    const cleaned = line.trim().replace(/^[-*+]\s+/, "")
    if (cleaned) out.push(cleaned)
  }
  return out
}

function splitCommaList(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((item) => item.trim().replace(/^`|`$/g, ""))
    .filter(Boolean)
}

function extractTaskIdFromDescription(description: string): string | null {
  // Matches "**1.1** ...", "**1.1a** ...", "**F-01** ...", "[1.1] ...", or "1.1: ..."
  const boldMatch = description.match(/^\*\*([A-Za-z0-9._-]+)\*\*(?:\s+|:\s*|$)/)
  if (boldMatch) return boldMatch[1]
  const bracketMatch = description.match(/^\[([A-Za-z0-9._-]+)\](?:\s+|:\s*|$)/)
  if (bracketMatch && !/^(?:MANUAL|BLOCKED|RECON)$/i.test(bracketMatch[1])) {
    return bracketMatch[1]
  }
  const numPrefix = description.match(/^(\d+\.\d+[a-z]?)(?:\s+|:\s+)/i)
  if (numPrefix) return numPrefix[1]
  return null
}

function extractInlineMetadata(description: string): {
  cleanDescription: string
  dependsOn: string[]
  files: string[]
} {
  const dependsOn: string[] = []
  const files: string[] = []
  let clean = description

  const metaPattern = /(?:\(|\b)\s*(depends|deps|files|scope)\s*:\s*([^)\]]+?)\s*(?:\)|(?=\s*(?:\(|\[|$)))/gi
  clean = clean.replace(metaPattern, (_full, keyRaw: string, valRaw: string) => {
    const key = keyRaw.toLowerCase()
    const items = splitCommaList(valRaw)
    if (key === "depends" || key === "deps") {
      dependsOn.push(...items)
    } else if (key === "files" || key === "scope") {
      files.push(...items)
    }
    return ""
  })

  clean = clean.replace(/\s{2,}/g, " ").trim()
  return { cleanDescription: clean || description, dependsOn, files }
}

/**
 * Parse all tasks in `content` (outside code fences) into structured `PlanTaskNode`
 * entries with phase boundaries, explicit or generated IDs, DAG dependencies,
 * file scopes, and `(recon)` detection.
 */
export function parsePlanTasks(content: string): PlanTaskNode[] {
  const normalized = normalizeLineEndings(content)
  const lineStates = splitPlanLinesWithFenceState(normalized)
  const nodes: PlanTaskNode[] = []

  let currentPhase = 0
  let hasSeenTasksInPhase = false
  let indexInPhase = 0

  const dependsRe = DEPENDS_DIRECTIVE_RE
  const filesRe = FILES_DIRECTIVE_RE

  for (const entry of lineStates) {
    if (entry.isFenced) continue
    const trimmed = entry.line.trim()

    // Markdown heading starts a new phase barrier if we already saw tasks in the current phase
    if (/^#{1,6}\s+\S/.test(trimmed)) {
      if (hasSeenTasksInPhase) {
        currentPhase++
        hasSeenTasksInPhase = false
        indexInPhase = 0
      }
      continue
    }

    const parsed = parseTaskLine(entry.line)
    if (parsed.type === "not-a-task") continue

    hasSeenTasksInPhase = true
    indexInPhase++

    const explicitId = extractTaskIdFromDescription(parsed.description)
    const id = explicitId ?? `${currentPhase + 1}.${indexInPhase}`
    const inlineMeta = extractInlineMetadata(parsed.description)
    const { lines: subLines } = scanTaskSubBullets(lineStates, entry.index)

    const dependsSet = new Set<string>(inlineMeta.dependsOn)
    const filesSet = new Set<string>(inlineMeta.files)

    for (const sub of subLines) {
      const depMatch = sub.match(dependsRe)
      if (depMatch) {
        for (const item of splitCommaList(depMatch[1])) dependsSet.add(item)
      }
      const fileMatch = sub.match(filesRe)
      if (fileMatch) {
        for (const item of splitCommaList(fileMatch[1])) filesSet.add(item)
      }
    }

    const isRecon = /\(\s*recon\s*\)|\[\s*recon\s*\]/i.test(parsed.description)

    nodes.push({
      id,
      phaseIndex: currentPhase,
      lineIndex: entry.index,
      type: parsed.type,
      description: parsed.description,
      cleanDescription: inlineMeta.cleanDescription,
      dependsOn: [...dependsSet],
      files: [...filesSet],
      isRecon,
      ...(parsed.blockedReason !== undefined ? { blockedReason: parsed.blockedReason } : {}),
    })
  }

  return nodes
}

/**
 * Mark a specific task `- [x]` by description (for orchestrator-owned PLAN.md
 * updates in parallel mode), optionally inserting indented memory notes and/or
 * discovered `(recon)` tasks immediately after the task and its existing sub-bullets.
 */
export function markTaskCompleted(
  content: string,
  taskDescription: string,
  options: { notes?: string[]; reconTasks?: string[] } = {},
): string | null {
  const normalized = normalizeLineEndings(content)
  const lineStates = splitPlanLinesWithFenceState(normalized)
  const lines = splitLines(normalized)
  const idx = findTaskLineIndexWhere(
    normalized,
    taskDescription,
    (type) => type === "pending" || type === "completed",
  )
  if (idx === -1) return null

  const indent = lines[idx].match(/^(\s*)/)?.[1] ?? ""
  const parsed = parseTaskLine(lines[idx])
  if (parsed.type === "pending") {
    lines[idx] = `${indent}- [x] ${parsed.description}`
  }

  const { endLineIdx } = scanTaskSubBullets(lineStates, idx)
  const insertions: string[] = []

  if (options.notes) {
    for (const rawNote of options.notes) {
      const clean = rawNote.replace(/[\r\n]+/g, " ").trim()
      if (!clean) continue
      // Ensure note is never formatted as a checkbox task
      const safeNote = clean.replace(/^[-*+]\s*\[[^\]]*\]\s*/, "")
      if (safeNote) {
        insertions.push(`${indent}  - ${safeNote}`)
      }
    }
  }

  if (options.reconTasks) {
    for (const rawRecon of options.reconTasks) {
      const clean = rawRecon
        .replace(/[\r\n]+/g, " ")
        .replace(/^\s*[-*+]\s*\[\s*[xX ]?\s*\]\s*/, "")
        .trim()
      if (clean) {
        insertions.push(`${indent}- [ ] ${clean}`)
      }
    }
  }

  if (insertions.length > 0) {
    lines.splice(endLineIdx + 1, 0, ...insertions)
  }

  return preserveEol(content, lines.join("\n"))
}

/**
 * The single indented prose line recording an eval judge's feedback under a
 * task (never a `- [ ]`). Every line break — `\n`, CRLF or a lone `\r` — is
 * folded to one space, the same rule as the other PLAN.md mutators, so a CRLF
 * feedback never leaves a stray `\r` inside the note. Capped at 200 chars.
 */
export function evalFeedbackNote(feedback: string): string {
  return `  - eval feedback: ${feedback.replace(/[\r\n]+/g, " ").slice(0, 200)}`
}

/**
 * Prepare an eval-driven retry in PLAN.md: insert the judge's feedback note
 * right under the task line, and flip a completed task (`[x]`) back to pending
 * (`[ ]`) so the retry genuinely re-runs the SAME task.
 */
export function reopenTaskForEvalRetry(
  content: string,
  taskDescription: string,
  note: string,
): string | null {
  const normalized = normalizeLineEndings(content)
  const lines = splitLines(normalized)
  const idx = findTaskLineIndex(normalized, taskDescription)
  if (idx === -1) return null
  const task = parseTaskLine(lines[idx])
  if (task.type === "completed") {
    lines[idx] = lines[idx].replace(/^(\s*)-\s*\[\s*[xX]\s*\]/, "$1- [ ]")
  }
  lines.splice(idx + 1, 0, note)
  return preserveEol(content, lines.join("\n"))
}

/**
 * Mark the FIRST pending task (`- [ ]`) as `- [BLOCKED: <reason>]`, preserving
 * the original line's leading indentation and the rest of the description.
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
  return replaceTaskLineWithBlocked(
    content,
    taskDescription,
    reason,
    (type) => type === "pending",
  )
}

/**
 * Mark a specific task `- [BLOCKED: <reason>]` by description, pending OR
 * completed.
 */
export function replaceTaskWithBlocked(
  content: string,
  taskDescription: string,
  reason: string,
): string | null {
  return replaceTaskLineWithBlocked(
    content,
    taskDescription,
    reason,
    (type) => type === "pending" || type === "completed",
  )
}

/**
 * Shared splice core of the blocked-replacement variants.
 */
function replaceTaskLineWithBlocked(
  content: string,
  taskDescription: string,
  reason: string,
  accepts: (type: TaskType) => boolean,
): string | null {
  const cleanReason = reason
    .replace(/[\r\n]+/g, " ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim()
  const normalized = normalizeLineEndings(content)
  const lines = splitLines(normalized)
  const idx = findTaskLineIndexWhere(normalized, taskDescription, accepts)
  if (idx === -1) return null
  const indent = lines[idx].match(/^(\s*)/)?.[1] ?? ""
  const task = parseTaskLine(lines[idx])
  lines[idx] = `${indent}- [BLOCKED: ${cleanReason}] ${task.description}`
  return preserveEol(content, lines.join("\n"))
}
