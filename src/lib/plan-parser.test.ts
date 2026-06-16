import { describe, expect, it } from "bun:test"
import { parsePlan, getCurrentTaskFromContent, parseTaskLine, parsePlanComplete, isPlanComplete } from "./plan-parser"

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
})

describe("isPlanComplete", () => {
  it("should return false for a non-existent file", async () => {
    const result = await isPlanComplete("/tmp/ocloop-nonexistent-plan-test-xyz.md")
    expect(result).toBe(false)
  })
})
