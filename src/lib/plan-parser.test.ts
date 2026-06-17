import { describe, expect, it } from "bun:test"
import { parsePlan, getCurrentTaskFromContent, parseTaskLine, parsePlanComplete, isPlanComplete, getPlanCompleteSummary, parsePlanFile, isStructurallyComplete, buildCompletionSummary, withPlanCompleteTag } from "./plan-parser"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("parseTaskLine", () => {
  it("should parse completed tasks", () => {
    expect(parseTaskLine("- [x] Task")).toEqual({ type: "completed", description: "Task" })
    expect(parseTaskLine("- [X] Task")).toEqual({ type: "completed", description: "Task" })
  })

  it("should parse pending tasks", () => {
    expect(parseTaskLine("- [ ] Task")).toEqual({ type: "pending", description: "Task" })
  })

  it("should parse MANUAL tasks in checkbox", () => {
    expect(parseTaskLine("- [MANUAL] Task")).toEqual({ type: "manual", description: "Task" })
    expect(parseTaskLine("- [manual] Task")).toEqual({ type: "manual", description: "Task" })
  })

  it("should parse MANUAL tasks as tag after checkbox", () => {
    expect(parseTaskLine("- [ ] [MANUAL] Task")).toEqual({ type: "manual", description: "Task" })
    expect(parseTaskLine("- [ ] [manual] Task")).toEqual({ type: "manual", description: "Task" })
  })

  it("should parse BLOCKED tasks in checkbox", () => {
    expect(parseTaskLine("- [BLOCKED: reason] Task")).toEqual({ 
      type: "blocked", 
      description: "Task", 
      blockedReason: "reason" 
    })
    expect(parseTaskLine("- [BLOCKED] Task")).toEqual({ 
      type: "blocked", 
      description: "Task", 
      blockedReason: "" 
    })
  })

  it("should not misclassify words starting with BLOCKED as blocked", () => {
    // The keyword must be anchored: "BLOCKEDABC" is not a blocked marker.
    expect(parseTaskLine("- [BLOCKEDABC] Task")).toEqual({
      type: "not-a-task",
      description: "",
    })
  })

  it("should capture full multi-word BLOCKED reason in checkbox", () => {
    expect(parseTaskLine("- [BLOCKED: multi word reason here] Task")).toEqual({
      type: "blocked",
      description: "Task",
      blockedReason: "multi word reason here",
    })
  })

  it("should handle BLOCKED with no trailing description", () => {
    expect(parseTaskLine("- [BLOCKED]")).toEqual({
      type: "blocked",
      description: "",
      blockedReason: "",
    })
    expect(parseTaskLine("- [BLOCKED: reason]")).toEqual({
      type: "blocked",
      description: "",
      blockedReason: "reason",
    })
  })

  it("should parse BLOCKED tasks as tag after checkbox", () => {
    expect(parseTaskLine("- [ ] [BLOCKED: reason] Task")).toEqual({ 
      type: "blocked", 
      description: "Task", 
      blockedReason: "reason" 
    })
    expect(parseTaskLine("- [ ] [BLOCKED] Task")).toEqual({ 
      type: "blocked", 
      description: "Task", 
      blockedReason: "" 
    })
  })

  it("should return not-a-task for invalid lines", () => {
    expect(parseTaskLine("Not a task")).toEqual({ type: "not-a-task", description: "" })
    expect(parseTaskLine("- Item")).toEqual({ type: "not-a-task", description: "" })
    expect(parseTaskLine("- [ ]")).toEqual({ type: "not-a-task", description: "" }) // Empty checkbox with no description → not a task
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.1 — exhaustive variant audit of parseTaskLine markers.
  // Each `it` pins one specific surface of the marker grammar.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.1 — completed-marker variants", () => {
    it("accepts - [x] with no trailing description", () => {
      expect(parseTaskLine("- [x]")).toEqual({ type: "completed", description: "" })
    })

    it("accepts - [X] with no trailing description", () => {
      expect(parseTaskLine("- [X]")).toEqual({ type: "completed", description: "" })
    })

    it("accepts - [x ] (trailing space inside brackets) with description", () => {
      // The .trim() on checkboxContent normalises internal whitespace.
      expect(parseTaskLine("- [x ] Task")).toEqual({ type: "completed", description: "Task" })
    })

    it("accepts - [X ] (trailing space inside brackets, uppercase) with description", () => {
      expect(parseTaskLine("- [X ] Task")).toEqual({ type: "completed", description: "Task" })
    })

    it("accepts - [x ] (trailing space, no description) — empty description kept", () => {
      // Completed marker with no description is still a real task — counted in total.
      expect(parseTaskLine("- [x ]")).toEqual({ type: "completed", description: "" })
    })

    it("accepts - [X ] (uppercase, trailing space, no description)", () => {
      expect(parseTaskLine("- [X ]")).toEqual({ type: "completed", description: "" })
    })

    it("strips trailing whitespace on the line, not the description", () => {
      expect(parseTaskLine("- [x] Task   ")).toEqual({ type: "completed", description: "Task" })
    })

    it("handles internal whitespace in the x-marker (- [ x ]) — still not a valid x-marker", () => {
      // The regex /^[xX]$/ requires exactly one x/X. " x " after .trim() becomes "x"
      // because the leading/trailing spaces are stripped, but the slice here only
      // covers the first close-bracket, so the raw content is " x " which trims to "x".
      expect(parseTaskLine("- [ x ] Task")).toEqual({ type: "completed", description: "Task" })
    })
  })

  describe("PLAN.md 2.1 — empty-checkbox variants", () => {
    it("returns not-a-task for bare - [ ] (no description)", () => {
      // Documented behavior: a bare checkbox with no description is not actionable.
      expect(parseTaskLine("- [ ]")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [ ] followed by only whitespace", () => {
      // After trim of the line, afterCheckbox becomes "" → not-a-task.
      expect(parseTaskLine("- [ ]   ")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [  ] (extra spaces inside brackets, no description)", () => {
      // checkboxContent = "  ", trimmed = "", afterCheckbox = "" → not-a-task.
      expect(parseTaskLine("- [  ]")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [] (no space inside brackets, no description)", () => {
      // checkboxContent = "", afterCheckbox = "" → not-a-task.
      expect(parseTaskLine("- []")).toEqual({ type: "not-a-task", description: "" })
    })

    it("treats - [ ] followed by a real description as pending", () => {
      expect(parseTaskLine("- [ ] Real work to do")).toEqual({ type: "pending", description: "Real work to do" })
    })

    it("trims leading indentation on a pending task", () => {
      expect(parseTaskLine("    - [ ] Indented pending task")).toEqual({
        type: "pending",
        description: "Indented pending task",
      })
    })
  })

  describe("PLAN.md 2.1 — MANUAL-marker variants", () => {
    it("accepts - [MANUAL] with no trailing description", () => {
      expect(parseTaskLine("- [MANUAL]")).toEqual({ type: "manual", description: "" })
    })

    it("accepts - [manual] (lowercase) with no trailing description", () => {
      expect(parseTaskLine("- [manual]")).toEqual({ type: "manual", description: "" })
    })

    it("accepts - [Manual] (mixed case) with no trailing description", () => {
      expect(parseTaskLine("- [Manual]")).toEqual({ type: "manual", description: "" })
    })

    it("accepts - [MANUAL] followed by only whitespace", () => {
      // After .trim() the trailing whitespace vanishes, leaving empty description.
      expect(parseTaskLine("- [MANUAL]   ")).toEqual({ type: "manual", description: "" })
    })

    it("accepts - [ ] [MANUAL] (tag form, no trailing description)", () => {
      // The tag-form path also returns manual with empty description.
      expect(parseTaskLine("- [ ] [MANUAL]")).toEqual({ type: "manual", description: "" })
    })

    it("accepts - [ ][MANUAL] (no space between brackets and tag)", () => {
      // closeBracket still finds the first ], and afterCheckbox is "[MANUAL]".
      expect(parseTaskLine("- [ ][MANUAL]")).toEqual({ type: "manual", description: "" })
    })

    it("accepts - [ ] [manual] (lowercase tag, no description)", () => {
      expect(parseTaskLine("- [ ] [manual]")).toEqual({ type: "manual", description: "" })
    })

    it("does NOT match - [MANUALSOMETHING] as a manual marker (anchored keyword)", () => {
      // Same anchoring discipline as BLOCKED: must end, `:`, or whitespace.
      expect(parseTaskLine("- [MANUALSOMETHING] Task")).toEqual({
        type: "not-a-task",
        description: "",
      })
    })
  })

  describe("PLAN.md 2.1 — BLOCKED-marker variants", () => {
    it("accepts - [BLOCKED] (no description, no reason)", () => {
      expect(parseTaskLine("- [BLOCKED]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [BLOCKED:] (empty reason with colon, no description)", () => {
      // Lookahead matches the colon, reason is "" after stripping "BLOCKED:".
      expect(parseTaskLine("- [BLOCKED:]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [BLOCKED: ] (empty reason with colon+space, no description)", () => {
      expect(parseTaskLine("- [BLOCKED: ]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [ BLOCKED ] (spaces inside brackets, no description)", () => {
      // checkboxContent = " BLOCKED ", .trim() = "BLOCKED" → matches.
      expect(parseTaskLine("- [ BLOCKED ]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [ blocked ] (lowercase + spaces)", () => {
      expect(parseTaskLine("- [ blocked ]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [BLOCKED]   (trailing whitespace on line)", () => {
      expect(parseTaskLine("- [BLOCKED]   ")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [blocked] (lowercase) with description", () => {
      expect(parseTaskLine("- [blocked] Task")).toEqual({ type: "blocked", description: "Task", blockedReason: "" })
    })

    it("accepts - [Blocked] (mixed case) with description", () => {
      expect(parseTaskLine("- [Blocked] Task")).toEqual({ type: "blocked", description: "Task", blockedReason: "" })
    })

    it("accepts - [ ] [BLOCKED] (tag form, no description)", () => {
      expect(parseTaskLine("- [ ] [BLOCKED]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [ ][BLOCKED] (no space between brackets and tag, no description)", () => {
      expect(parseTaskLine("- [ ][BLOCKED]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("accepts - [ ] [blocked: reason] (lowercase tag form)", () => {
      expect(parseTaskLine("- [ ] [blocked: reason] Task")).toEqual({
        type: "blocked",
        description: "Task",
        blockedReason: "reason",
      })
    })

    it("captures space-separated text as the reason when no colon is used (- [BLOCKED extra text])", () => {
      // The lookahead /^BLOCKED(?=$|[:\s])/i accepts whitespace, so the rest of the
      // brackets is parsed as the reason. Documented but worth pinning: a user who
      // writes `- [BLOCKED some reason]` gets reason="some reason" and description="".
      expect(parseTaskLine("- [BLOCKED some reason]")).toEqual({
        type: "blocked",
        description: "",
        blockedReason: "some reason",
      })
    })

    it("keeps a trailing description when reason is space-separated (- [BLOCKED text] Real desc)", () => {
      expect(parseTaskLine("- [BLOCKED some reason] Real description")).toEqual({
        type: "blocked",
        description: "Real description",
        blockedReason: "some reason",
      })
    })
  })

  describe("PLAN.md 2.1 — combined / mixed markers", () => {
    it("treats a completed line with a trailing [MANUAL] tag as completed (x wins)", () => {
      // The x-marker short-circuits before any tag parsing — the rest of the line
      // becomes part of the description.
      expect(parseTaskLine("- [x] [MANUAL] Task")).toEqual({
        type: "completed",
        description: "[MANUAL] Task",
      })
    })

    it("treats a pending line with both [MANUAL] and [BLOCKED] tags as manual (first tag wins)", () => {
      // parseTaskLine checks for [MANUAL] before [BLOCKED] when the checkbox is
      // empty. The [BLOCKED] tag is left in the description.
      expect(parseTaskLine("- [ ] [MANUAL] [BLOCKED: x] Task")).toEqual({
        type: "manual",
        description: "[BLOCKED: x] Task",
      })
    })

    it("captures only up to the first ] for the close bracket (- [BLOCKED] extra] keeps 'extra]' in description)", () => {
      // closeBracket = first ]; everything after stays in the trimmed description.
      // Not a bug, but a footgun: a user who puts a stray ] in the description
      // can't get it back. Pin the behavior so it doesn't drift.
      expect(parseTaskLine("- [BLOCKED] extra]")).toEqual({
        type: "blocked",
        description: "extra]",
        blockedReason: "",
      })
    })

    it("returns not-a-task for - [ with no closing bracket", () => {
      // closeBracket is -1, so we bail early.
      expect(parseTaskLine("- [ x")).toEqual({ type: "not-a-task", description: "" })
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.6 — unclosed-bracket edge cases.
  // The plan-parser checks for the first `]` at index >= 3. If no `]` exists,
  // the line is treated as not-a-task. This is the correct behavior for any
  // garbage that looks like the start of a checkbox but never finishes the
  // bracket pair — the parser cannot know what was intended and silently
  // dropping the line is safer than guessing.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.6 — unclosed-bracket edge cases", () => {
    it("returns not-a-task for bare - [ (prefix only, no body, no close)", () => {
      // The line is just the prefix "- [" with nothing after it. The
      // indexOf search from position 3 finds no ] before EOF → -1.
      expect(parseTaskLine("- [")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [ followed by a single space only", () => {
      // After the .trim() on the line, the body is empty. Still no ] to find.
      expect(parseTaskLine("- [ ")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [x with no closing bracket", () => {
      // Looks like a completed marker but missing the ] — guarded against
      // by the closeBracket === -1 short-circuit. The function never sees
      // the would-be "x" content because it bails before slicing.
      expect(parseTaskLine("- [x")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [X (uppercase, no close)", () => {
      // Same as above for the uppercase variant.
      expect(parseTaskLine("- [X")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [ ] (no description after close bracket)", () => {
      // NOTE: this case is NOT the unclosed-bracket path — the `]` is present
      // at index 4. It exercises the "empty checkbox, no description" branch
      // (plan-parser.ts:80-83) which also returns not-a-task. Pinned here so
      // the unclosed-bracket set doesn't grow accidental false positives: if
      // this test ever starts failing, the unclosed-bracket hypothesis is
      // wrong; the failure is in the empty-checkbox branch instead.
      expect(parseTaskLine("- [ ] ")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [MANUAL with no closing bracket", () => {
      // Same shape: the keyword is visible but the ] is missing. Without
      // the close bracket, the function bails at the indexOf check before
      // any keyword matching runs.
      expect(parseTaskLine("- [MANUAL")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [BLOCKED with no closing bracket", () => {
      // The BLOCKED branch is also unreachable when ] is missing.
      expect(parseTaskLine("- [BLOCKED")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [BLOCKED: reason with no closing bracket", () => {
      // Even the colon + reason variant is unrecognised without ].
      expect(parseTaskLine("- [BLOCKED: reason")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [ with arbitrary body text but no close bracket", () => {
      // Long body, no close bracket. The .indexOf search from position 3
      // walks the whole string and returns -1.
      expect(parseTaskLine("- [ this is a long task description with no close bracket")).toEqual({
        type: "not-a-task",
        description: "",
      })
    })

    it("returns not-a-task for indented - [ with no closing bracket", () => {
      // Leading whitespace is stripped by .trim() so the parsing path is
      // identical to the no-indent case.
      expect(parseTaskLine("    - [ ")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("    - [x")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [ with content and trailing whitespace but no close", () => {
      // .trim() removes trailing whitespace; the ] is still missing.
      expect(parseTaskLine("- [x   ")).toEqual({ type: "not-a-task", description: "" })
    })

    it("returns not-a-task for - [ with an OPENING bracket inside but no closing", () => {
      // An unbalanced [ inside the body does not satisfy the ] check.
      // The parser is looking for a close bracket, not a balanced pair.
      expect(parseTaskLine("- [ [nested")).toEqual({ type: "not-a-task", description: "" })
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.2 — no-description classification contrast.
  // Pins the asymmetry: a bare `- [ ]` (empty checkbox) is not-a-task, but a
  // bare `- [MANUAL]` / `- [x]` / `- [BLOCKED]` is a real task. The marker
  // keyword IS the task declaration; only the empty `[ ]` slot needs a
  // description to be actionable.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.2 — no-description classification contrast", () => {
    it("classifies bare - [ ] as not-a-task and bare - [MANUAL] as manual", () => {
      // The asymmetry is intentional: empty-checkbox content is anonymous
      // and needs a description to mean anything; a keyword marker
      // (x, MANUAL, BLOCKED) is itself the task declaration.
      expect(parseTaskLine("- [ ]")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("- [MANUAL]")).toEqual({ type: "manual", description: "" })
    })

    it("classifies tag-form bare - [ ] [MANUAL] as manual (marker is in the tag)", () => {
      // The tag form is also valid: the user wrote a [MANUAL] marker, so the
      // marker alone is the task even with no description text after it.
      expect(parseTaskLine("- [ ] [MANUAL]")).toEqual({ type: "manual", description: "" })
    })

    it("keyword markers x, BLOCKED, MANUAL all accept bare (no description) form", () => {
      // These three are pinned together to make the rule explicit:
      // keyword = task, no description required. The empty `[ ]` checkbox
      // is the ONLY marker that requires a description.
      expect(parseTaskLine("- [x]")).toEqual({ type: "completed", description: "" })
      expect(parseTaskLine("- [MANUAL]")).toEqual({ type: "manual", description: "" })
      expect(parseTaskLine("- [BLOCKED]")).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("trailing whitespace on a bare - [MANUAL] still returns manual", () => {
      // .trim() on the line collapses trailing whitespace, so the description
      // stays empty and the classification is still manual.
      expect(parseTaskLine("- [MANUAL]   ")).toEqual({ type: "manual", description: "" })
    })

    it("trailing whitespace on a bare - [ ] still returns not-a-task", () => {
      // Mirror of the above: same .trim() rule, opposite outcome.
      expect(parseTaskLine("- [ ]   ")).toEqual({ type: "not-a-task", description: "" })
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.3 — BLOCKED reason extraction: empty-reason contrast and
  // spaces-in-reason handling. Pinned as a single block because the same
  // regex (`/^BLOCKED[:\s]*/i` in the checkbox form, `/^\[BLOCKED[:\s]*...
  // ([^\]]*)\]/i` in the tag form) handles both surfaces.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.3 — BLOCKED reason extraction (empty-reason + spaces)", () => {
    it("returns identical blockedReason='' for - [BLOCKED] vs - [BLOCKED:] vs - [BLOCKED: ] (empty-reason contrast)", () => {
      // All three forms are the same from the parser's perspective: the colon
      // and any whitespace are stripped by `^BLOCKED[:\s]*`, leaving an empty
      // reason. The user can write whichever form reads more naturally; the
      // semantic result is identical.
      const a = parseTaskLine("- [BLOCKED]")
      const b = parseTaskLine("- [BLOCKED:]")
      const c = parseTaskLine("- [BLOCKED: ]")
      expect(a).toEqual({ type: "blocked", description: "", blockedReason: "" })
      expect(b).toEqual({ type: "blocked", description: "", blockedReason: "" })
      expect(c).toEqual({ type: "blocked", description: "", blockedReason: "" })
    })

    it("captures single-space reason in the checkbox form (- [BLOCKED: some reason])", () => {
      // Colon + single space + reason: `^BLOCKED[:\s]*` strips "BLOCKED:"
      // (colon only, since `*` is greedy but `[:\s]*` prefers the colon first
      // then any leading spaces). The reason is the rest of checkboxContent.
      expect(parseTaskLine("- [BLOCKED: some reason]")).toEqual({
        type: "blocked",
        description: "",
        blockedReason: "some reason",
      })
    })

    it("captures single-space reason in the tag form (- [ ] [BLOCKED: some reason ])", () => {
      // Tag form: the regex /^\[BLOCKED[:\s]*([^\]]*)\]\s*(.*)$/i captures
      // the inner `[^]]*` (any non-`]` chars, spaces included) and trims it
      // for blockedReason. Internal spaces in the reason are preserved.
      expect(parseTaskLine("- [ ] [BLOCKED: some reason ]")).toEqual({
        type: "blocked",
        description: "",
        blockedReason: "some reason",
      })
    })

    it("preserves multiple internal spaces in the reason (- [BLOCKED:  word  word ])", () => {
      // The strip regex is `[:\s]*` after BLOCKED, which consumes the colon
      // and the spaces IMMEDIATELY after it. Any further spaces in the reason
      // are NOT touched — they belong to the reason text. This is the rule
      // the task description asks us to pin: "spaces in reason" survive.
      expect(parseTaskLine("- [BLOCKED:  word  word ]")).toEqual({
        type: "blocked",
        description: "",
        blockedReason: "word  word",
      })
    })

    it("preserves multiple internal spaces in the tag-form reason", () => {
      // Same rule, applied to the tag form regex. match[1] is trimmed only at
      // the edges; the interior keeps its whitespace.
      expect(parseTaskLine("- [ ] [BLOCKED:  word  word ]")).toEqual({
        type: "blocked",
        description: "",
        blockedReason: "word  word",
      })
    })

    it("preserves colons inside the reason text (- [BLOCKED: needs foo:bar baz])", () => {
      // The colon is only consumed when it directly follows BLOCKED. A colon
      // appearing later in the reason is part of the reason text and is
      // preserved verbatim.
      expect(parseTaskLine("- [BLOCKED: needs foo:bar baz]")).toEqual({
        type: "blocked",
        description: "",
        blockedReason: "needs foo:bar baz",
      })
    })

    it("keeps a trailing description when the checkbox-form reason contains spaces", () => {
      // Mirrors the line-265 test (space-separated reason), but with the
      // colon variant that the task asks about.
      expect(parseTaskLine("- [BLOCKED: some reason here] Real desc")).toEqual({
        type: "blocked",
        description: "Real desc",
        blockedReason: "some reason here",
      })
    })
  })
})

describe("parsePlan", () => {
  it("should return empty progress for empty content", () => {
    const result = parsePlan("")

    expect(result.total).toBe(0)
    expect(result.completed).toBe(0)
    expect(result.pending).toBe(0)
    expect(result.manual).toBe(0)
    expect(result.blocked).toBe(0)
    expect(result.automatable).toBe(0)
    expect(result.percentComplete).toBe(100) // edge case: no tasks = 100% complete
  })

  it("should parse completed tasks with lowercase x", () => {
    const content = `
- [x] Task one
- [x] Task two
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.completed).toBe(2)
    expect(result.pending).toBe(0)
    expect(result.percentComplete).toBe(100)
  })

  it("should parse completed tasks with uppercase X", () => {
    const content = `
- [X] Task one
- [X] Task two
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.completed).toBe(2)
    expect(result.pending).toBe(0)
    expect(result.percentComplete).toBe(100)
  })

  it("should parse pending tasks", () => {
    const content = `
- [ ] Task one
- [ ] Task two
- [ ] Task three
`
    const result = parsePlan(content)

    expect(result.total).toBe(3)
    expect(result.completed).toBe(0)
    expect(result.pending).toBe(3)
    expect(result.automatable).toBe(3)
    expect(result.percentComplete).toBe(0)
  })

  it("should parse MANUAL tasks", () => {
    const content = `
- [MANUAL] Manual testing task
- [MANUAL] Another manual task
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.manual).toBe(2)
    expect(result.pending).toBe(0)
    expect(result.percentComplete).toBe(100) // manual tasks excluded from percentage
  })

  it("should parse MANUAL tasks with checkbox tag", () => {
    const content = `
- [ ] [MANUAL] Manual testing task
- [ ] [MANUAL] Another manual task
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.manual).toBe(2)
    expect(result.pending).toBe(0)
    expect(result.percentComplete).toBe(100)
  })

  it("should parse BLOCKED tasks", () => {
    const content = `
- [BLOCKED: waiting for API] Blocked task one
- [BLOCKED: needs review] Blocked task two
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.blocked).toBe(2)
    expect(result.pending).toBe(0)
  })

  it("should parse BLOCKED tasks with checkbox tag", () => {
    const content = `
- [ ] [BLOCKED: waiting for API] Blocked task one
- [ ] [BLOCKED] Blocked task two
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.blocked).toBe(2)
    expect(result.pending).toBe(0)
  })

  it("should parse BLOCKED tasks case-insensitively", () => {
    const content = `
- [blocked: reason] Task one
- [Blocked: reason] Task two
- [BLOCKED: reason] Task three
`
    const result = parsePlan(content)

    expect(result.total).toBe(3)
    expect(result.blocked).toBe(3)
  })

  it("should parse a mixed plan correctly", () => {
    const content = `
## Backlog

- [x] **1.1** Completed task
- [x] **1.2** Another completed
- [ ] **1.3** Pending task
- [ ] **1.4** Another pending
- [MANUAL] **2.1** Manual testing task
- [BLOCKED: needs API] **2.2** Blocked task
- [ ] [MANUAL] **2.3** Tagged manual task
`
    const result = parsePlan(content)

    expect(result.total).toBe(7)
    expect(result.completed).toBe(2)
    expect(result.pending).toBe(2)
    expect(result.manual).toBe(2)
    expect(result.blocked).toBe(1)
    expect(result.automatable).toBe(2)
    // percentComplete = completed / (total - manual - blocked) = 2 / 4 = 50%
    expect(result.percentComplete).toBe(50)
  })

  it("should handle indented checkboxes", () => {
    const content = `
  - [x] Indented completed
    - [ ] Double indented pending
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.completed).toBe(1)
    expect(result.pending).toBe(1)
  })

  it("should ignore non-checkbox lines", () => {
    const content = `
# Header

Some description text.

- [x] A real task

More text here.

- Regular list item without checkbox
`
    const result = parsePlan(content)

    expect(result.total).toBe(1)
    expect(result.completed).toBe(1)
  })

  it("should calculate correct percentage", () => {
    const content = `
- [x] Task 1
- [x] Task 2
- [x] Task 3
- [ ] Task 4
- [ ] Task 5
- [MANUAL] Manual task
`
    const result = parsePlan(content)

    expect(result.total).toBe(6)
    expect(result.completed).toBe(3)
    expect(result.pending).toBe(2)
    expect(result.manual).toBe(1)
    // percentComplete = 3 / (6 - 1) = 3/5 = 60%
    expect(result.percentComplete).toBe(60)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.2 — downstream impact of bare - [MANUAL] on parsePlan.
  // Pins the asymmetry at the plan level: bare `- [ ]` lines are excluded
  // from `total`; bare `- [MANUAL]` lines are counted as manual tasks. A
  // bare manual task does NOT contribute to the percentComplete denominator
  // (manual is excluded from `automatable`), so a plan full of bare manual
  // markers still resolves to 100%.
  // ──────────────────────────────────────────────────────────────────────────

  it("counts bare - [MANUAL] lines as manual tasks (no description required)", () => {
    const content = `
- [MANUAL]
- [MANUAL] Real manual task
- [ ] [MANUAL]
- [ ] [MANUAL] Real tagged manual task
`
    const result = parsePlan(content)

    expect(result.total).toBe(4)
    expect(result.manual).toBe(4)
    expect(result.completed).toBe(0)
    expect(result.pending).toBe(0)
    expect(result.blocked).toBe(0)
    expect(result.percentComplete).toBe(100) // manual is excluded from denominator
  })

  it("excludes bare - [ ] but INCLUDES bare - [MANUAL] from total — explicit asymmetry", () => {
    // The first two lines are bare pending (not-a-task, skipped). The third
    // is a bare manual (counted). The asymmetry is pinned at the plan level.
    const content = `
- [ ]
- [ ]
- [MANUAL]
- [x]
`
    const result = parsePlan(content)

    expect(result.total).toBe(2)
    expect(result.completed).toBe(1)
    expect(result.manual).toBe(1)
    expect(result.pending).toBe(0)
    expect(result.blocked).toBe(0)
    // percentComplete = 1 / (2 - 1) = 1/1 = 100%
    expect(result.percentComplete).toBe(100)
  })

  it("a plan of only bare - [MANUAL] lines resolves to 100% (no automatable work)", () => {
    // The semantic: the loop has no work to do (all manual), so 100% is correct.
    const content = `
- [MANUAL]
- [MANUAL]
- [ ] [MANUAL]
`
    const result = parsePlan(content)

    expect(result.total).toBe(3)
    expect(result.manual).toBe(3)
    expect(result.automatable).toBe(0)
    expect(result.percentComplete).toBe(100)
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.1 — parsePlan whole-file edge cases.
  // The task asks us to verify parsePlan against degenerate whole-file
  // inputs: empty file, no tasks, headings only, and plans that contain
  // only one of the terminal categories (completed / blocked / manual).
  // Each case is pinned with the full PlanProgress shape so the contract
  // of "no work to do" (denominator=0 → 100%) is enforced end-to-end.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.1 — whole-file edge cases", () => {
    it("empty file → 0 total / 0 in every bucket / 100% (denominator=0, nothing to do)", () => {
      const result = parsePlan("")

      expect(result).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        manual: 0,
        blocked: 0,
        automatable: 0,
        percentComplete: 100,
      })
    })

    it("file with prose but no checkbox lines → 0 total / 100% (no tasks to do)", () => {
      // Confirms that random prose / paragraphs are silently ignored by
      // parseTaskLine (returns not-a-task) and never enter the total.
      const content = `Some intro paragraph.
Another paragraph with no checkboxes at all.
Just plain text — not a task list.`
      const result = parsePlan(content)

      expect(result).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        manual: 0,
        blocked: 0,
        automatable: 0,
        percentComplete: 100,
      })
    })

    it("file with only headings → 0 total / 100% (no actionable lines)", () => {
      // Markdown headers are not task lines — parseTaskLine requires the
      // "- [" prefix. Headings of any depth (##, ###, ####) are all ignored.
      const content = `# Top-level title
## Phase 1 — Setup
### Subsection
#### Deep heading
##### Even deeper
## Phase 2 — Run`
      const result = parsePlan(content)

      expect(result).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        manual: 0,
        blocked: 0,
        automatable: 0,
        percentComplete: 100,
      })
    })

    it("file with only completed tasks → 100% (every automatable task is done)", () => {
      // Denominator = total - manual - blocked = 2 - 0 - 0 = 2.
      // 2 completed / 2 denominator = 100%.
      const content = `
- [x] First done
- [X] Second done
- [x] Third done
`
      const result = parsePlan(content)

      expect(result.total).toBe(3)
      expect(result.completed).toBe(3)
      expect(result.pending).toBe(0)
      expect(result.manual).toBe(0)
      expect(result.blocked).toBe(0)
      expect(result.automatable).toBe(0)
      expect(result.percentComplete).toBe(100)
    })

    it("file with only blocked tasks → 100% (denominator=0, loop has nothing automatable to do)", () => {
      // Denominator = total - manual - blocked = 2 - 0 - 2 = 0 → 100%.
      // The loop treats [BLOCKED] as terminal — it is NOT pending work.
      const content = `
- [BLOCKED: reason one] Task A
- [BLOCKED] Task B
`
      const result = parsePlan(content)

      expect(result.total).toBe(2)
      expect(result.completed).toBe(0)
      expect(result.pending).toBe(0)
      expect(result.manual).toBe(0)
      expect(result.blocked).toBe(2)
      expect(result.automatable).toBe(0)
      expect(result.percentComplete).toBe(100)
    })

    it("file with only manual tasks → 100% (denominator=0, all work is human-driven)", () => {
      // Denominator = total - manual - blocked = 2 - 2 - 0 = 0 → 100%.
      // Same semantic: loop has no automatable work, 100% is correct.
      const content = `
- [MANUAL] Manual task one
- [ ] [MANUAL] Tagged manual task two
`
      const result = parsePlan(content)

      expect(result.total).toBe(2)
      expect(result.completed).toBe(0)
      expect(result.pending).toBe(0)
      expect(result.manual).toBe(2)
      expect(result.blocked).toBe(0)
      expect(result.automatable).toBe(0)
      expect(result.percentComplete).toBe(100)
    })

    it("file with only blocked + manual tasks (no completed, no pending) → 100%", () => {
      // Mixed terminal categories: denominator=0, no automatable work.
      // Confirms that the 100%-when-denominator=0 rule holds regardless
      // of which terminal categories fill the plan.
      const content = `
- [MANUAL] Manual A
- [MANUAL] Manual B
- [BLOCKED: x] Blocked A
- [ ] [BLOCKED] Blocked B
`
      const result = parsePlan(content)

      expect(result.total).toBe(4)
      expect(result.completed).toBe(0)
      expect(result.manual).toBe(2)
      expect(result.blocked).toBe(2)
      expect(result.automatable).toBe(0)
      expect(result.percentComplete).toBe(100)
    })

    it("file with only one pending task → 0 total? no — total=1, percentComplete=0", () => {
      // The PLAN.md 2.1 task asks us to verify the single-pending edge.
      // total=1, completed=0, denominator=1, 0/1 = 0%.
      const content = `
# A plan with a single task

Some intro.

- [ ] The only thing to do
`
      const result = parsePlan(content)

      expect(result.total).toBe(1)
      expect(result.completed).toBe(0)
      expect(result.pending).toBe(1)
      expect(result.manual).toBe(0)
      expect(result.blocked).toBe(0)
      expect(result.automatable).toBe(1)
      expect(result.percentComplete).toBe(0)
    })

    it("whitespace-only file → 0 total / 100% (no parseable task lines)", () => {
      // A file containing only blank lines and whitespace must behave
      // like an empty file — no parseable tasks, denominator=0, 100%.
      const content = `

   

`
      const result = parsePlan(content)

      expect(result.total).toBe(0)
      expect(result.percentComplete).toBe(100)
    })

    it("file with only bare - [ ] checkboxes (no descriptions) → 0 total / 100%", () => {
      // Bare - [ ] is classified as not-a-task (no description), so the
      // total stays 0 and percentComplete stays at 100%. This is the
      // intended asymmetry: only bare [MANUAL] / [x] / [BLOCKED] count
      // toward total, not bare - [ ].
      const content = `
- [ ]
- [ ]
- [ ]
`
      const result = parsePlan(content)

      expect(result.total).toBe(0)
      expect(result.completed).toBe(0)
      expect(result.pending).toBe(0)
      expect(result.manual).toBe(0)
      expect(result.blocked).toBe(0)
      expect(result.percentComplete).toBe(100)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.4 — percentComplete math.
  // The formula in plan-parser.ts:138-142 is:
  //
  //   denominator       = total - manual - blocked
  //   percentComplete   = denominator > 0
  //                         ? Math.round((completed / denominator) * 100)
  //                         : 100
  //
  // Pin every boundary the audit walks:
  //   - total = 0                       → denominator = 0 → 100%
  //   - all tasks are MANUAL            → denominator = 0 → 100%
  //   - all tasks are BLOCKED           → denominator = 0 → 100%
  //   - mix of MANUAL + BLOCKED only    → denominator = 0 → 100%
  //   - single pending task             → 1/1 = 0%  (rounded)
  //   - single completed task           → 1/1 = 100%
  //   - half completed                  → exact 50% (no rounding bias)
  //   - 1/3, 2/3                        → 33% / 67% (Math.round behaviour)
  //   - manual and blocked tasks NEVER
  //     penalise the percentage — they
  //     leave the denominator entirely.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.4 — percentComplete math", () => {
    it("denominator is total - manual - blocked (manual + blocked leave the denominator)", () => {
      // 2 completed, 1 pending, 1 manual, 1 blocked.
      // denominator = 5 - 1 - 1 = 3.  completed / denominator = 2/3 → 67%.
      // The manual and blocked tasks must NOT reduce the denominator against
      // completed: a 1/5 plan would be wrong (20%); the correct semantic is
      // 2/3 (67%) because the loop has 3 automatable tasks and 2 are done.
      const content = `
- [x] Done 1
- [x] Done 2
- [ ] Pending
- [MANUAL] Manual
- [BLOCKED: x] Blocked
`
      const result = parsePlan(content)

      expect(result.total).toBe(5)
      expect(result.completed).toBe(2)
      expect(result.pending).toBe(1)
      expect(result.manual).toBe(1)
      expect(result.blocked).toBe(1)
      // 2 / (5 - 1 - 1) = 2/3 = 66.666… → Math.round → 67
      expect(result.percentComplete).toBe(67)
    })

    it("total=0 (empty file) → denominator=0 → percentComplete=100 (nothing to do)", () => {
      // PLAN.md 2.4 line 29: confirm total=0 returns 100%, not NaN/0/throw.
      const result = parsePlan("")

      expect(result.total).toBe(0)
      expect(result.manual).toBe(0)
      expect(result.blocked).toBe(0)
      // denominator = 0 - 0 - 0 = 0 → ternary picks the :100 branch
      expect(result.percentComplete).toBe(100)
    })

    it("all tasks are MANUAL (denominator=0) → percentComplete=100", () => {
      // PLAN.md 2.4 line 30: confirm all-manual resolves to 100%, not 0%.
      const content = `
- [MANUAL] Manual A
- [MANUAL] Manual B
- [ ] [MANUAL] Tagged manual
`
      const result = parsePlan(content)

      expect(result.total).toBe(3)
      expect(result.manual).toBe(3)
      expect(result.blocked).toBe(0)
      expect(result.automatable).toBe(0)
      // denominator = 3 - 3 - 0 = 0 → 100
      expect(result.percentComplete).toBe(100)
    })

    it("all tasks are BLOCKED (denominator=0) → percentComplete=100", () => {
      // PLAN.md 2.4 line 30: confirm all-blocked resolves to 100%, not 0%.
      const content = `
- [BLOCKED: needs API] Blocked A
- [BLOCKED] Blocked B
- [ ] [BLOCKED: x] Tagged blocked
`
      const result = parsePlan(content)

      expect(result.total).toBe(3)
      expect(result.manual).toBe(0)
      expect(result.blocked).toBe(3)
      expect(result.automatable).toBe(0)
      // denominator = 3 - 0 - 3 = 0 → 100
      expect(result.percentComplete).toBe(100)
    })

    it("only MANUAL + BLOCKED tasks (no completed, no pending) → percentComplete=100", () => {
      // PLAN.md 2.4 line 30: confirm the mixed-terminal-category case
      // also resolves to 100% (denominator=0 from any combination of
      // MANUAL+BLOCKED).
      const content = `
- [MANUAL] Manual A
- [MANUAL] Manual B
- [BLOCKED: reason] Blocked A
- [ ] [BLOCKED] Tagged blocked
`
      const result = parsePlan(content)

      expect(result.total).toBe(4)
      expect(result.manual).toBe(2)
      expect(result.blocked).toBe(2)
      expect(result.automatable).toBe(0)
      expect(result.percentComplete).toBe(100)
    })

    it("single pending task (1 automatable, 0 completed) → percentComplete=0", () => {
      // PLAN.md 2.4 line 31: confirm 0/1 = 0%, not 100% (which would be the
      // denominator=0 fallback). This pins that the ternary on denominator>0
      // is the ONLY thing that drives the 100% branch — a single-pending
      // plan has denominator=1 and must compute 0/1, not the fallback.
      const content = `
- [ ] The only thing to do
`
      const result = parsePlan(content)

      expect(result.total).toBe(1)
      expect(result.completed).toBe(0)
      expect(result.pending).toBe(1)
      expect(result.manual).toBe(0)
      expect(result.blocked).toBe(0)
      expect(result.automatable).toBe(1)
      // denominator = 1 - 0 - 0 = 1, completed/denominator = 0/1 = 0
      expect(result.percentComplete).toBe(0)
    })

    it("single completed task (1 automatable, 1 completed) → percentComplete=100", () => {
      // Mirror of the single-pending test: 1/1 = 100% via the computed
      // branch, not the fallback. Confirms denominator=1 does NOT trip
      // the :100 branch.
      const content = `
- [x] The only thing that was done
`
      const result = parsePlan(content)

      expect(result.total).toBe(1)
      expect(result.completed).toBe(1)
      expect(result.automatable).toBe(0)
      // denominator = 1 - 0 - 0 = 1, completed/denominator = 1/1 = 100
      expect(result.percentComplete).toBe(100)
    })

    it("half completed (2/4 automatable) → percentComplete=50 (no rounding bias on exact halves)", () => {
      // Exact-half case: 2/4 = 0.5 → 50.0 → Math.round → 50. Pins that
      // the rounding rule (Math.round, NOT floor/ceil/truncate) does
      // not bias this clean case.
      const content = `
- [x] Done 1
- [x] Done 2
- [ ] Pending 1
- [ ] Pending 2
`
      const result = parsePlan(content)

      expect(result.total).toBe(4)
      expect(result.completed).toBe(2)
      expect(result.automatable).toBe(2)
      // 2/4 = 0.5 → 50
      expect(result.percentComplete).toBe(50)
    })

    it("1/3 completed → percentComplete=33 (Math.round: 33.33… → 33, not 34)", () => {
      // 1/3 = 0.333… → 33.33… → Math.round → 33. Pins that rounding is
      // ROUND-HALF-AWAY-FROM-ZERO (JS default), not ceiling.
      const content = `
- [x] Done
- [ ] Pending 1
- [ ] Pending 2
`
      const result = parsePlan(content)

      expect(result.total).toBe(3)
      expect(result.completed).toBe(1)
      expect(result.automatable).toBe(2)
      // 1/3 = 33.333… → 33
      expect(result.percentComplete).toBe(33)
    })

    it("2/3 completed → percentComplete=67 (Math.round: 66.66… → 67, not 66)", () => {
      // 2/3 = 0.666… → 66.66… → Math.round → 67. Pins that 0.66 rounds
      // UP, not down. This is the rule JS Math.round applies for
      // positive numbers (banker's rounding is NOT used).
      const content = `
- [x] Done 1
- [x] Done 2
- [ ] Pending
`
      const result = parsePlan(content)

      expect(result.total).toBe(3)
      expect(result.completed).toBe(2)
      expect(result.automatable).toBe(1)
      // 2/3 = 66.666… → 67
      expect(result.percentComplete).toBe(67)
    })

    it("3/7 completed → percentComplete=43 (rounding of 42.857… → 43)", () => {
      // 3/7 = 0.42857… → 42.857… → Math.round → 43. Pins another
      // non-trivial rounding case (not at 0.5) to confirm the round
      // direction is consistent: anything ≥ x.5 rounds up.
      const content = `
- [x] Done 1
- [x] Done 2
- [x] Done 3
- [ ] Pending 1
- [ ] Pending 2
- [ ] Pending 3
- [ ] Pending 4
`
      const result = parsePlan(content)

      expect(result.total).toBe(7)
      expect(result.completed).toBe(3)
      expect(result.automatable).toBe(4)
      // 3/7 = 42.857… → 43
      expect(result.percentComplete).toBe(43)
    })

    it("all completed → percentComplete=100 via the computed branch, not the fallback", () => {
      // 6/6 = 100.0 → 100. The denominator is non-zero (6 - 0 - 0 = 6)
      // so the computed branch fires; this test pins that the 100%
      // result here is the COMPUTED path, not the denominator=0 fallback.
      // If the ternary were ever inverted (denominator <= 0), this test
      // would still pass by accident — the next test (4/6 = 67) fences
      // off that case so a future inversion is caught immediately.
      const content = `
- [x] Done 1
- [x] Done 2
- [x] Done 3
- [x] Done 4
- [x] Done 5
- [x] Done 6
`
      const result = parsePlan(content)

      expect(result.total).toBe(6)
      expect(result.completed).toBe(6)
      expect(result.automatable).toBe(0)
      // 6/6 = 100
      expect(result.percentComplete).toBe(100)
    })

    it("completed tasks with a tail of pending tasks never collapse to the fallback (4/6 → 67)", () => {
      // Companion to the previous test: 4/6 = 66.66… → 67. If the
      // ternary were ever changed to denominator >= 0 (i.e. the
      // fallback fires for denominator=0 AND the 100%-completion
      // case), this test would also return 100 (wrong). With the
      // current `denominator > 0` check, this test pins 4/6 = 67
      // and proves the computed branch is reachable for non-zero
      // denominators.
      const content = `
- [x] Done 1
- [x] Done 2
- [x] Done 3
- [x] Done 4
- [ ] Pending 1
- [ ] Pending 2
`
      const result = parsePlan(content)

      expect(result.total).toBe(6)
      expect(result.completed).toBe(4)
      expect(result.automatable).toBe(2)
      // 4/6 = 66.666… → 67
      expect(result.percentComplete).toBe(67)
    })

    it("completed=0 with denominator>0 → percentComplete=0 (not the 100% fallback)", () => {
      // The negative-control for the denominator=0 fallback: a plan
      // with PENDING tasks only (no completed) must return 0%, NOT 100%.
      // If the formula were ever changed to `denominator >= 0 ? 100 :
      // ...`, this test would fail. Pins the strict-greater-than check.
      const content = `
- [ ] Pending 1
- [ ] Pending 2
- [ ] Pending 3
`
      const result = parsePlan(content)

      expect(result.total).toBe(3)
      expect(result.completed).toBe(0)
      expect(result.automatable).toBe(3)
      // denominator = 3, completed/denominator = 0/3 = 0
      expect(result.percentComplete).toBe(0)
    })

    it("MANUAL count larger than completed (denominator=0) → percentComplete=100", () => {
      // Boundary stress: 3 completed, 5 manual, 2 blocked. denominator
      // = 10 - 5 - 2 = 3. completed/denominator = 3/3 = 100. Confirms
      // a fully-automated plan with a long manual/blocked tail still
      // resolves to 100% via the computed branch.
      const content = `
- [x] Done 1
- [x] Done 2
- [x] Done 3
- [MANUAL] Manual 1
- [MANUAL] Manual 2
- [MANUAL] Manual 3
- [MANUAL] Manual 4
- [MANUAL] Manual 5
- [BLOCKED: a] Blocked 1
- [BLOCKED: b] Blocked 2
`
      const result = parsePlan(content)

      expect(result.total).toBe(10)
      expect(result.completed).toBe(3)
      expect(result.manual).toBe(5)
      expect(result.blocked).toBe(2)
      // denominator = 10 - 5 - 2 = 3, completed/denominator = 3/3 = 100
      expect(result.percentComplete).toBe(100)
    })

    it("interleaved completed/pending/manual/blocked at a non-round ratio (3/8 → 38)", () => {
      // Realistic mixed plan: 3 completed, 5 pending, 2 manual, 1 blocked.
      // denominator = 11 - 2 - 1 = 8. 3/8 = 37.5 → Math.round → 38
      // (0.5 rounds UP for positive numbers in JS). Pins the rule on
      // an exact .5 boundary in a realistic shape.
      const content = `
- [x] Done 1
- [x] Done 2
- [x] Done 3
- [ ] Pending 1
- [ ] Pending 2
- [ ] Pending 3
- [ ] Pending 4
- [ ] Pending 5
- [MANUAL] Manual 1
- [MANUAL] Manual 2
- [BLOCKED: x] Blocked
`
      const result = parsePlan(content)

      expect(result.total).toBe(11)
      expect(result.completed).toBe(3)
      expect(result.manual).toBe(2)
      expect(result.blocked).toBe(1)
      // denominator = 11 - 2 - 1 = 8, completed/denominator = 3/8 = 0.375 → 38
      expect(result.percentComplete).toBe(38)
    })

    it("rounding: 1/8 completed → 13 (12.5 rounds UP for positives)", () => {
      // 1/8 = 0.125 → 12.5 → Math.round → 13. Pins that the half-point
      // in the rounding rule (≥ 0.5 → up) is the JS default for
      // positive numbers. (Negative would round toward zero, but the
      // percentage can never be negative here.)
      const content = `
- [x] Done
- [ ] Pending 1
- [ ] Pending 2
- [ ] Pending 3
- [ ] Pending 4
- [ ] Pending 5
- [ ] Pending 6
- [ ] Pending 7
`
      const result = parsePlan(content)

      expect(result.total).toBe(8)
      expect(result.completed).toBe(1)
      expect(result.automatable).toBe(7)
      // 1/8 = 12.5 → 13
      expect(result.percentComplete).toBe(13)
    })
  })
})

describe("parsePlanComplete", () => {
  it("should return null when no tag present", () => {
    const content = "Just some content"
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("should extract content between tags", () => {
    const content = "<plan-complete>Summary text</plan-complete>"
    expect(parsePlanComplete(content)).toBe("Summary text")
  })

  it("should handle multiline content", () => {
    const content = `
Start
<plan-complete>
Line 1
Line 2
</plan-complete>
End
`
    expect(parsePlanComplete(content)).toBe("Line 1\nLine 2")
  })

  it("should handle tag at end of file", () => {
    const content = "Tasks...\n<plan-complete>Done</plan-complete>"
    expect(parsePlanComplete(content)).toBe("Done")
  })

  it("should allow zero to three leading spaces before completion tags", () => {
    for (const spaces of ["", " ", "  ", "   "]) {
      const content = [
        "Tasks...",
        `${spaces}<plan-complete>`,
        `Done with ${spaces.length} leading spaces`,
        `${spaces}</plan-complete>`,
      ].join("\n")
      expect(parsePlanComplete(content)).toBe(`Done with ${spaces.length} leading spaces`)
    }
  })

  it("should ignore completion tags indented as Markdown code blocks", () => {
    const content = [
      "Tasks...",
      "    <plan-complete>",
      "Indented code block, not completion",
      "    </plan-complete>",
    ].join("\n")
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("should ignore completion tags indented with tabs", () => {
    const content = [
      "Tasks...",
      "\t<plan-complete>",
      "Tabbed code block, not completion",
      "\t</plan-complete>",
    ].join("\n")
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("should ignore a tag documented inside a fenced code block", () => {
    const content = [
      "## How it works",
      "When the plan is done, write:",
      "```",
      "<plan-complete>example summary</plan-complete>",
      "```",
      "- [ ] Real task still pending",
    ].join("\n")
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("should still find a real tag alongside a documented one", () => {
    const content = [
      "```",
      "<plan-complete>doc example</plan-complete>",
      "```",
      "<plan-complete>actually done</plan-complete>",
    ].join("\n")
    expect(parsePlanComplete(content)).toBe("actually done")
  })

  it("ignores a documented tag inside an UNTERMINATED fence (no premature stop)", () => {
    // Malformed markdown: the fence is never closed. The paired-fence strip
    // can't match it, so without the trailing-fence strip this example tag would
    // leak and stop the loop early. A missed completion is far safer here.
    const content = [
      "## How it works",
      "```",
      "<plan-complete>example summary</plan-complete>",
      "- [ ] Real task still pending",
    ].join("\n")
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("finds a real tag after prose containing an INLINE triple-backtick literal", () => {
    // Regression: an inline ``` in prose (e.g. "use ``` for code blocks") is
    // NOT a line-start fence. The unterminated-fence strip must only match a
    // fence marker at line start (0-3 spaces); an inline literal has text
    // before it on the same line. Previously the non-anchored /```[\s\S]*$/
    // matched the inline literal and deleted everything to EOF, including a
    // genuine <plan-complete> written later — which kept the loop spinning at
    // 100% for PLAN.md files that document markdown syntax.
    const content = [
      "## Notes",
      'To mark code, use ``` around the snippet in your PLAN.md.',
      "This is just documentation, not a real fence.",
      "<plan-complete>actually done</plan-complete>",
    ].join("\n")
    expect(parsePlanComplete(content)).toBe("actually done")
  })

  it("ignores a documented tag inside a blockquote (nested, not top-level)", () => {
    const content = [
      "> <plan-complete>nested inside blockquote</plan-complete>",
      "- [ ] Real task still pending",
    ].join("\n")
    // The `> ` prefix makes the line start with "> ", not 0-3 spaces + "<plan-complete>",
    // so the regex anchored to ^ {0,3}<plan-complete> won't match.
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("finds a real tag alongside one nested in a blockquote", () => {
    const content = [
      "> <plan-complete>nested inside blockquote</plan-complete>",
      "<plan-complete>actually done</plan-complete>",
    ].join("\n")
    expect(parsePlanComplete(content)).toBe("actually done")
  })

  // PLAN.md 2.7 — attributes on the completion tag are not supported.
  // The regex is literal: `^ {0,3}<plan-complete>(?:...)`, so a tag
  // like `<plan-complete foo="bar">` is NOT matched (the `>` is followed
  // by `f`, not the start of the body capture). An attribute-bearing
  // completion tag is therefore treated as if no completion tag exists.
  // This is a deliberate, documented design choice — completion is a
  // private signal from the agent to the loop, not a public HTML-like
  // element that needs to carry metadata.
  it("ignores a tag that carries attributes (e.g. <plan-complete foo=\"bar\">)", () => {
    const content = `<plan-complete foo="bar">summary</plan-complete>`
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("ignores a tag with attributes alongside a real one (real wins, not the attribute one)", () => {
    const content = [
      `<plan-complete data-meta="x">with attributes</plan-complete>`,
      `<plan-complete>real completion</plan-complete>`,
    ].join("\n")
    expect(parsePlanComplete(content)).toBe("real completion")
  })

  // PLAN.md 2.7 — an unclosed <plan-complete> tag must NOT trigger
  // completion. The regex requires `</plan-complete>` (either inline
  // or on its own line), so a stray open tag with no close is ignored.
  // This pins the "loop keeps running" invariant: a malformed completion
  // signal is never treated as a real one.
  it("ignores an unclosed <plan-complete> tag (no closing tag present)", () => {
    const content = [
      "Tasks...",
      "- [x] Done task",
      "<plan-complete>summary without close",
    ].join("\n")
    expect(parsePlanComplete(content)).toBeNull()
  })

  it("ignores a single-line unclosed tag (no newline, no close)", () => {
    const content = `<plan-complete>summary without close`
    expect(parsePlanComplete(content)).toBeNull()
  })

  // Regression: the opener is on its own line but the closer is GLUED to the end of
  // the last content line (`...remain.</plan-complete>`) — the format models actually
  // emit. The old two-branch regex required the closer on the same line as the opener
  // OR at the start of its own line, so this returned null and the loop never stopped.
  it("matches a multi-line tag whose closing is glued to the end of the last line", () => {
    const content = [
      "Tasks...",
      "<plan-complete>All 18 phases complete.",
      "",
      "Summary:",
      "- did X",
      "No manual tasks remain.</plan-complete>",
    ].join("\n")
    expect(parsePlanComplete(content)).toBe(
      "All 18 phases complete.\n\nSummary:\n- did X\nNo manual tasks remain.",
    )
  })
})

describe("isStructurallyComplete (tooling-owned completion, no model tag)", () => {
  it("is true when every task is [x]", () => {
    const p = parsePlan("- [x] a\n- [x] b\n- [x] c")
    expect(isStructurallyComplete(p)).toBe(true)
  })
  it("is true when remaining tasks are [x] or [BLOCKED] (blocked excluded)", () => {
    const p = parsePlan("- [x] a\n- [BLOCKED: needs key] b")
    expect(isStructurallyComplete(p)).toBe(true)
  })
  it("is true when all tasks are [MANUAL] (loop has nothing to do)", () => {
    const p = parsePlan("- [MANUAL] a\n- [MANUAL] b")
    expect(isStructurallyComplete(p)).toBe(true)
  })
  it("is false while a pending automatable task remains", () => {
    const p = parsePlan("- [x] a\n- [ ] b still pending")
    expect(isStructurallyComplete(p)).toBe(false)
  })
  it("is false for an empty plan (no tasks at all)", () => {
    const p = parsePlan("# Title\njust prose, no tasks")
    expect(isStructurallyComplete(p)).toBe(false)
  })
})

describe("buildCompletionSummary", () => {
  it("summarizes a plain all-done plan", () => {
    const p = parsePlan("- [x] a\n- [x] b\n- [x] c")
    expect(buildCompletionSummary(p)).toBe("All tasks complete: 3/3.")
  })
  it("notes manual and blocked counts", () => {
    const p = parsePlan("- [x] a\n- [MANUAL] b\n- [BLOCKED: x] c")
    // denominator = total(3) - manual(1) - blocked(1) = 1; completed = 1
    expect(buildCompletionSummary(p)).toBe("All tasks complete: 1/1 (1 manual, 1 blocked).")
  })
})

describe("withPlanCompleteTag (idempotent)", () => {
  it("appends the tag when none is present", () => {
    const out = withPlanCompleteTag("- [x] a\n", "done")
    expect(out).toBe("- [x] a\n\n<plan-complete>done</plan-complete>\n")
    expect(parsePlanComplete(out)).toBe("done")
  })
  it("adds a trailing newline before appending when missing", () => {
    const out = withPlanCompleteTag("- [x] a", "done")
    expect(out).toBe("- [x] a\n\n<plan-complete>done</plan-complete>\n")
  })
  it("is a no-op when a tag already exists", () => {
    const content = "- [x] a\n<plan-complete>already</plan-complete>\n"
    expect(withPlanCompleteTag(content, "new")).toBe(content)
  })
})

describe("getCurrentTaskFromContent", () => {
  it("should return null for empty content", () => {
    const result = getCurrentTaskFromContent("")

    expect(result).toBeNull()
  })

  it("should return null when no unchecked tasks exist", () => {
    const content = `
- [x] Completed task
- [x] Another completed
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBeNull()
  })

  it("should return first unchecked task", () => {
    const content = `
- [x] Completed task
- [ ] First pending task
- [ ] Second pending task
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBe("First pending task")
  })

  it("should handle task with bold formatting", () => {
    const content = `
- [ ] **Add current task detection**
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBe("**Add current task detection**")
  })

  it("should skip MANUAL and BLOCKED tasks", () => {
    const content = `
- [MANUAL] Manual task
- [BLOCKED: reason] Blocked task
- [ ] [MANUAL] Tagged manual task
- [ ] [BLOCKED] Tagged blocked task
- [ ] First automatable task
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBe("First automatable task")
  })

  it("should handle indented checkboxes", () => {
    const content = `
## Section
  - [ ] Indented pending task
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBe("Indented pending task")
  })

  it("should return null when all tasks are MANUAL or BLOCKED", () => {
    const content = `
- [MANUAL] Manual task one
- [MANUAL] Manual task two
- [BLOCKED: reason] Blocked task
- [ ] [MANUAL] Tagged manual
- [ ] [BLOCKED] Tagged blocked
`
    const result = getCurrentTaskFromContent(content)
    expect(result).toBeNull()
  })

  it("should return null for empty task description", () => {
    const content = `
- [ ] 
- [ ] Next task
`
    const result = getCurrentTaskFromContent(content)

    // First one has no description, so parseTaskLine returns not-a-task (skipped).
    // getCurrentTaskFromContent returns "Next task" from the second line.
    
    expect(result).toBe("Next task")
  })

  it("should skip empty and return first valid task", () => {
    const content = `
- [x] Completed
- [ ] Valid task
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBe("Valid task")
  })

  it("should handle complex task descriptions", () => {
    const content = `
- [ ] Create \`src/components/Dashboard.tsx\` with props
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBe("Create `src/components/Dashboard.tsx` with props")
  })

  // PLAN.md 2.8 — "returns the FIRST pending task even if tasks are not in
  // order" is the contract. This test fences it off: even when the first
  // pending is followed by completed/manual/blocked/pending rows, the
  // function must still return that first pending and never a later one.
  // (The existing "skip MANUAL and BLOCKED" test already pins a pending
  // buried under non-pending rows; this test pins the FIRST-PENDING
  // selection specifically when later pendings exist.)
  it("returns the FIRST pending even when later pendings exist", () => {
    const content = [
      "- [ ] first pending",
      "- [x] done",
      "- [MANUAL] manual",
      "- [ ] second pending",
      "- [BLOCKED: r] blocked",
      "- [ ] third pending",
    ].join("\n")
    const result = getCurrentTaskFromContent(content)
    expect(result).toBe("first pending")
  })

  it("returns the first pending when completed rows are interleaved BEFORE and AFTER", () => {
    const content = [
      "- [x] done a",
      "- [ ] pending a",
      "- [x] done b",
      "- [ ] pending b",
    ].join("\n")
    const result = getCurrentTaskFromContent(content)
    expect(result).toBe("pending a")
  })
})

describe("isPlanComplete", () => {
  it("should return false for a non-existent file", async () => {
    const result = await isPlanComplete("/tmp/ocloop-nonexistent-plan-test-xyz.md")
    expect(result).toBe(false)
  })

  // Source: MEJORAS.md Finding 17.4.C. The pre-fix implementation did
  // `await file.exists()` + `await file.text()` — two awaits with a
  // window for the path to be removed, replaced with a directory, or
  // have its permissions flipped. The fix wraps the read in a single
  // try/catch that returns `false` on any I/O failure.
  it("should return false when the path is a directory (EISDIR)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ocloop-isPlanComplete-dir-"))
    try {
      const result = await isPlanComplete(dir)
      expect(result).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Source: MEJORAS.md Finding 17.4.C. Cross-platform: Windows ACLs
  // don't map to POSIX `chmod`, and root bypasses the read-only check.
  // The pattern mirrors `loop-state-store.test.ts:71-92` (Mejora 30).
  it.skipIf(process.platform === "win32" || (typeof process.getuid === "function" && process.getuid() === 0))(
    "should return false when the file is unreadable (EACCES)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "ocloop-isPlanComplete-eacces-"))
      const filePath = join(dir, "plan.md")
      try {
        writeFileSync(filePath, "<plan-complete>done</plan-complete>\n", { mode: 0o000 })
        const result = await isPlanComplete(filePath)
        expect(result).toBe(false)
      } finally {
        // Restore permissions so the tempdir can be cleaned up.
        chmodSync(filePath, 0o644)
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
})

describe("getPlanCompleteSummary", () => {
  it("should return null for a non-existent file", async () => {
    const result = await getPlanCompleteSummary("/tmp/ocloop-nonexistent-plan-summary-test-xyz.md")
    expect(result).toBeNull()
  })

  it("should return the summary when the plan is complete", async () => {
    const tmp = "/tmp/ocloop-getPlanCompleteSummary-test.md"
    try {
      await Bun.write(tmp, "Some preamble\n<plan-complete>the summary text</plan-complete>\n")
      const result = await getPlanCompleteSummary(tmp)
      expect(result).toBe("the summary text")
    } finally {
      await Bun.$`rm -f ${tmp}`.quiet()
    }
  })

  it("should return null when the plan is not complete", async () => {
    const tmp = "/tmp/ocloop-getPlanCompleteSummary-incomplete-test.md"
    try {
      await Bun.write(tmp, "- [ ] pending task\n")
      const result = await getPlanCompleteSummary(tmp)
      expect(result).toBeNull()
    } finally {
      await Bun.$`rm -f ${tmp}`.quiet()
    }
  })

  // Source: MEJORAS.md Finding 17.4.C. See the parallel `isPlanComplete`
  // test for the rationale.
  it("should return null when the path is a directory (EISDIR)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ocloop-getPlanCompleteSummary-dir-"))
    try {
      const result = await getPlanCompleteSummary(dir)
      expect(result).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Source: MEJORAS.md Finding 17.4.C. See the parallel `isPlanComplete`
  // test for the rationale and the cross-platform guard rationale.
  it.skipIf(process.platform === "win32" || (typeof process.getuid === "function" && process.getuid() === 0))(
    "should return null when the file is unreadable (EACCES)",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "ocloop-getPlanCompleteSummary-eacces-"))
      const filePath = join(dir, "plan.md")
      try {
        writeFileSync(filePath, "<plan-complete>the summary</plan-complete>\n", { mode: 0o000 })
        const result = await getPlanCompleteSummary(filePath)
        expect(result).toBeNull()
      } finally {
        chmodSync(filePath, 0o644)
        rmSync(dir, { recursive: true, force: true })
      }
    },
  )
})

// PLAN.md 2.9 — `parsePlanFile` behavior on a missing plan path.
// The function signature (line 226-230 of plan-parser.ts) is:
//   async function parsePlanFile(planPath: string): Promise<PlanProgress>
// It calls `await file.text()` WITHOUT an `await file.exists()` guard.
// Compare with `isPlanComplete` (line 199-204) which DOES check exists()
// first and returns false. So `parsePlanFile` THROWS on a missing file
// (Node-style ENOENT) and the caller (App.tsx:576, `refreshPlan`) is
// expected to wrap it in a try/catch — which it does, at line 578.
//
// The contract being pinned here: "parsePlanFile does NOT silently return
// null/empty on a missing file — it throws, and that throw is what
// triggers the refreshPlan error path (logged via log.error)." If a
// future refactor changes parsePlanFile to "be safe and return null",
// the App.tsx refreshPlan error log would never fire for ENOENT —
// this test catches that regression by asserting the throw.
describe("parsePlanFile", () => {
  it("throws on a non-existent file (does not silently return null/empty)", async () => {
    const missingPath = "/tmp/ocloop-no-such-plan-file-xyz-12345.md"
    // Sanity: the file really must not exist for this test to be meaningful.
    const exists = await Bun.file(missingPath).exists()
    expect(exists).toBe(false)

    let threw = false
    try {
      await parsePlanFile(missingPath)
    } catch (err) {
      threw = true
      // The error is a Node-style ENOENT, but we don't pin the exact
      // message — just that it threw something.
      expect(err).toBeInstanceOf(Error)
    }
    expect(threw).toBe(true)
  })

  it("parses a real file and returns PlanProgress", async () => {
    const tmp = "/tmp/ocloop-parse-plan-file-test.md"
    await Bun.write(tmp, "- [x] done\n- [ ] pending\n")
    try {
      const result = await parsePlanFile(tmp)
      expect(result.total).toBe(2)
      expect(result.completed).toBe(1)
      expect(result.pending).toBe(1)
    } finally {
      await Bun.$`rm -f ${tmp}`.quiet()
    }
  })
})
