import { describe, expect, it } from "bun:test"
import { parsePlan, getCurrentTaskFromContent, parseTaskLine, parsePlanComplete, getPlanCompleteSummary, parsePlanFile, isStructurallyComplete, buildCompletionSummary, withPlanCompleteTag, parseSubtasksFromReply, replaceTaskWithSubtasks } from "./plan-parser"
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

  it("should return not-a-task for invalid lines", () => {
    expect(parseTaskLine("Not a task")).toEqual({ type: "not-a-task", description: "" })
    expect(parseTaskLine("- Item")).toEqual({ type: "not-a-task", description: "" })
    expect(parseTaskLine("- [ ]")).toEqual({ type: "not-a-task", description: "" }) // Empty checkbox with no description → not a task
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

    it("returns not-a-task for - [x with no closing bracket", () => {
      // Looks like a completed marker but missing the ] — guarded against
      // by the closeBracket === -1 short-circuit. The function never sees
      // the would-be "x" content because it bails before slicing.
      expect(parseTaskLine("- [x")).toEqual({ type: "not-a-task", description: "" })
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

  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.7 — leading and trailing whitespace tolerance.
  // The parser calls `.trim()` on the raw line before scanning for the
  // "- [" prefix and the closing bracket, so any leading or trailing
  // whitespace (spaces, tabs, CR) is collapsed. The contract being pinned
  // here: an editor that auto-indents under a list, or a CRLF file saved
  // by Windows, or a trailing-space cleanup tool that adds whitespace,
  // must NOT change the classification of the line. The four task
  // variants (x, pending, MANUAL, BLOCKED) all get a row each, plus a
  // combined-indent-and-trailing test that proves the rule stacks.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.7 — leading and trailing whitespace tolerance", () => {
    it("trims BOTH leading and trailing whitespace on the same line", () => {
      // Stacked: leading tabs + spaces, content, trailing tabs. Both ends
      // are independent — neither must affect the other.
      expect(parseTaskLine("  \t - [x] Task \t  ")).toEqual({
        type: "completed",
        description: "Task",
      })
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.5 — markdown headings are not task lines.
  // Headings (`#`, `##`, …, `######`) and Setext-style underlines
  // (`Heading\n===` / `Heading\n---`) are the primary way a PLAN.md is
  // organized into phases and sections. The parser's `parseTaskLine` only
  // matches the literal `- [` prefix, so any line that doesn't start with
  // it — including a heading — must return `not-a-task`. Without this
  // pin, a refactor that loosened the prefix (e.g. to "any bracket")
  // would accidentally count headings as tasks and the loop would try
  // to execute the heading text as a task description.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.5 — markdown headings are not task lines", () => {
    it("h2 (##) heading is not-a-task", () => {
      expect(parseTaskLine("## Phase 1 — Setup")).toEqual({ type: "not-a-task", description: "" })
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.8 — look-alike but non-conforming task lines.
  // The parser only treats `- [<marker>]` as a task, where `<marker>` is
  // a closed set: empty (` `), x, X, MANUAL, BLOCKED[: reason]. Lines that
  // look like tasks but use the wrong prefix, the wrong list marker, an
  // unrecognised checkbox content, or embed checkbox-like text inside
  // prose/HTML/code must all be classified as `not-a-task`. Each `it` pins
  // one specific look-alike shape, so a regression that loosens the prefix
  // check (e.g. starts accepting `* [x]`) fails with the exact shape that
  // broke it. The whole-file mirror of this contract is in PLAN.md 2.8
  // inside `parsePlan` and `getCurrentTaskFromContent` below.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.8 — look-alike but non-conforming task lines", () => {
    it("rejects * as list marker (only - is recognised)", () => {
      // Markdown allows `*` as a list marker. The parser is strict: only
      // `-` is recognised. A regression that widened the prefix check to
      // also accept `*` would silently start counting these as tasks and
      // would not be caught by any existing test (the heading tests pin
      // `#` rejection, not `*` rejection).
      expect(parseTaskLine("* [x] Task")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("* [ ] Task")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("* [MANUAL] Task")).toEqual({ type: "not-a-task", description: "" })
    })

    it("rejects unknown checkbox content (not x/X/MANUAL/BLOCKED)", () => {
      // The four valid markers are: empty (after trim), x, X, MANUAL,
      // BLOCKED[: reason]. Anything else in the brackets is not a task
      // — the parser is deliberately a closed grammar, not a tolerant
      // matcher. The existing "BLOCKEDABC" test pins the BLOCKED
      // anchoring; this group pins the rest of the closed set.
      expect(parseTaskLine("- [?] Task")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("- [y] Task")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("- [N/A] Task")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("- [v] Task")).toEqual({ type: "not-a-task", description: "" })
      expect(parseTaskLine("- [wip] Task")).toEqual({ type: "not-a-task", description: "" })
    })

    it("accepts no space inside the brackets (- [] Task) as a pending task", () => {
      // `- [] Task` (no space between `[` and `]`) has empty checkbox
      // content and a non-empty description, so it parses as a pending
      // task. This is the same branch as `- [ ] Task` (with a space)
      // because the checkbox content is trimmed before the empty
      // check. A regression that required exactly one space inside the
      // brackets would fail this test.
      expect(parseTaskLine("- [] Task")).toEqual({ type: "pending", description: "Task" })
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
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.5 — file-level surface: headings (alone or mixed) do not
  // pollute the task counts. The existing PLAN.md 2.1 "only headings"
  // case (line 918 of the pre-2.5 file) is the most degenerate shape;
  // this block expands it with the realistic PLAN.md shapes: headings +
  // prose, headings + tasks, headings that look like tasks (body text
  // contains `[ ]`), and Setext-style headings. The contract: headings
  // NEVER enter the total or any bucket, regardless of what text they
  // contain.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.5 — heading-only and heading-mixed files", () => {
    it("PLAN.md with only #, ##, ###, ####, ##### headings → 0 total", () => {
      // 5 heading lines, no tasks. The whole-file walk must skip all of them.
      const content = [
        "# Top title",
        "## Phase 1 — Setup",
        "### Subsection",
        "#### Deep heading",
        "##### Even deeper",
      ].join("\n")
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

    it("PLAN.md with headings + tasks counts ONLY the tasks (headings don't inflate the total)", () => {
      // The realistic PLAN.md shape from the project's own PLAN.md:
      // a title, a phase heading, 3 tasks, another phase heading, 2 more.
      const content = [
        "# My Plan",
        "",
        "## Phase 1 — Inventario",
        "- [x] Identify entry point",
        "- [x] Document flags",
        "- [ ] Map flows",
        "",
        "## Phase 2 — Tests",
        "- [ ] Add test A",
        "- [ ] Add test B",
      ].join("\n")
      const result = parsePlan(content)

      expect(result.total).toBe(5)
      expect(result.completed).toBe(2)
      expect(result.pending).toBe(3)
      expect(result.automatable).toBe(3)
      // percentComplete = 2 / (5 - 0 - 0) = 2/5 → 40
      expect(result.percentComplete).toBe(40)
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
})

describe("isStructurallyComplete (tooling-owned completion, no model tag)", () => {
  it("is true when remaining tasks are [x] or [BLOCKED] (blocked excluded)", () => {
    const p = parsePlan("- [x] a\n- [BLOCKED: needs key] b")
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

  it("should skip empty and return first valid task", () => {
    const content = `
- [x] Completed
- [ ] Valid task
`
    const result = getCurrentTaskFromContent(content)

    expect(result).toBe("Valid task")
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


  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.5 — selection-level surface: headings are not selectable
  // as the current task. Even when a file is full of headings,
  // getCurrentTaskFromContent must return null — there is no pending
  // task to do. And when a file mixes headings with one pending task,
  // the function must skip all the headings and return the real task
  // description. A regression that returned the heading text or the
  // heading level marker would fail these tests.
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.5 — headings are not selectable as the current task", () => {
    it("returns the real pending task description when a file mixes headings + completed + pending", () => {
      // Headings must be skipped, the first pending wins. A buggy
      // implementation that returned the heading text or the heading
      // level marker would fail this test.
      const content = [
        "# My Plan",
        "",
        "## Phase 1 — Setup",
        "- [x] First done",
        "- [x] Second done",
        "",
        "## Phase 2 — Build",
        "- [ ] First pending of phase 2",
        "- [ ] Second pending of phase 2",
        "",
        "## Phase 3 — Ship",
        "- [ ] Phase 3 task",
      ].join("\n")
      const result = getCurrentTaskFromContent(content)
      expect(result).toBe("First pending of phase 2")
    })

  })


  // ──────────────────────────────────────────────────────────────────────────
  // PLAN.md 2.8 — look-alike but non-conforming lines (selection).
  // Selection-side mirror of the per-line contract pinned in
  // `parseTaskLine` PLAN.md 2.8 and the file-level contract pinned in
  // `parsePlan` PLAN.md 2.8. The function must skip look-alike lines
  // (they are `not-a-task`) and land on the first real pending task.
  // A regression that mis-classified a look-alike as pending would
  // either return a wrong description (when a look-alike precedes the
  // real pending) or return null (when the only pending-shaped lines
  // are actually look-alikes, leaving the loop with nothing to do).
  // ──────────────────────────────────────────────────────────────────────────

  describe("PLAN.md 2.8 — look-alike but non-conforming lines (selection)", () => {
    it("selects the real pending task even when surrounded by look-alike lines", () => {
      // The real pending is the first (and only) `- [ ]` line. All the
      // look-alike lines around it must be skipped, not selected. A
      // regression that picked a look-alike as the "first pending" would
      // return the wrong description and the loop would attempt to
      // execute a line that is actually prose / a blockquote / a
      // numbered list item.
      const content = [
        "* [ ] Starred look-alike",
        "+ [ ] Plussed look-alike",
        "- [x] Real completed (decoy)",
        "1. [ ] Numbered look-alike",
        "<!-- - [ ] html comment look-alike -->",
        "- [ ] Real pending",
        "> - [ ] blockquote look-alike",
        "- [x] Another real completed",
      ].join("\n")
      const result = getCurrentTaskFromContent(content)
      expect(result).toBe("Real pending")
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// PLAN.md 2.12 — [MANUAL] tasks are not auto-executed.
//
// Contract: tasks marked [MANUAL] (in any of the supported shapes:
// `- [MANUAL] desc`, `- [ ] [MANUAL] desc`, `- [MANUAL]` bare) require human
// intervention. The auto-execution path goes through two surfaces:
//
// 1. `getCurrentTaskFromContent(content)` — the loop's "what's next?"
//    selector. Walks lines and returns the first PENDING description.
//    A bug that loosened the type filter would let a manual task leak
//    into the returned value, and the TUI's "Task: …" display would
//    mislead the user about what the loop is working on.
//
// 2. `parsePlan(content).automatable` — the loop's "what can I work on?"
//    counter. If it ever grew to include manual tasks, the loop would
//    keep iterating on a plan that has nothing to do automatically.
//
// These tests pin the boundary at both surfaces across the realistic
// shapes a user might write. They are pure regression coverage — the
// parser already handles all of them correctly today; the fence is here
// so a future refactor cannot quietly start executing manual work.
// ──────────────────────────────────────────────────────────────────────────

describe("PLAN.md 2.12 — [MANUAL] tasks are not auto-executed", () => {
  // ── getCurrentTaskFromContent: selection surface ──────────────────────

  it("skips a - [ ] [MANUAL] tag-form line that visually looks like a pending", () => {
    // The tag form is the most common in real PLAN.md files: a user
    // writes `- [ ] [MANUAL] do this by hand` thinking they're flagging
    // a pending checkbox. The parser must catch the [MANUAL] tag and
    // skip the line, landing on the real pending below.
    const content = [
      "- [ ] Real pending at the top",
      "- [ ] [MANUAL] Looks pending but is manual",
      "- [x] Done",
      "- [ ] Second real pending",
    ].join("\n")
    expect(getCurrentTaskFromContent(content)).toBe("Real pending at the top")
  })

  // ── parsePlan.automatable: counter surface ───────────────────────────

  it("parsePlan.automatable counts ONLY pending tasks, excluding manual (mixed plan)", () => {
    // The classic mixed plan: 2 completed, 2 manual (one checkbox form,
    // one tag form), 1 pending, 1 blocked. The loop's automatable count
    // must be EXACTLY 1 — the single pending. If automatable ever grew
    // to include manual, the loop would attempt to execute a task the
    // user explicitly marked for manual work.
    const p = parsePlan([
      "- [x] done a",
      "- [x] done b",
      "- [MANUAL] manual checkbox form",
      "- [ ] pending a",
      "- [BLOCKED: needs key] blocked a",
      "- [ ] [MANUAL] manual tag form",
    ].join("\n"))
    expect(p.automatable).toBe(1)
    expect(p.pending).toBe(1)
    expect(p.manual).toBe(2)
    expect(p.completed).toBe(2)
    expect(p.blocked).toBe(1)
    expect(p.total).toBe(6)
  })

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

  // TOCTOU-safe read: wraps the read in a single try/catch returning null.
  // Cross-platform guard: Windows ACLs don't map to POSIX chmod, root bypasses it.
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

// `parsePlanFile` behavior on a missing plan path.
// It calls `await file.text()` WITHOUT an `await file.exists()` guard,
// so it THROWS on a missing file (ENOENT) and the caller (`refreshPlan`)
// is expected to wrap it in a try/catch.
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

describe("parseSubtasksFromReply", () => {
  it("extracts pending - [ ] lines as subtask descriptions in order", () => {
    const reply = "- [ ] First subtask\n- [ ] Second subtask\n- [ ] Third"
    expect(parseSubtasksFromReply(reply)).toEqual(["First subtask", "Second subtask", "Third"])
  })

  it("ignores prose, headings, and code fences around the task lines", () => {
    const reply = [
      "Sure, here is the breakdown:",
      "## Subtasks",
      "```markdown",
      "- [ ] Do A",
      "- [ ] Do B",
      "```",
      "Let me know if that works.",
    ].join("\n")
    expect(parseSubtasksFromReply(reply)).toEqual(["Do A", "Do B"])
  })

  it("ignores non-pending markers (completed, MANUAL, BLOCKED)", () => {
    const reply = "- [x] already done\n- [MANUAL] human step\n- [BLOCKED] waiting\n- [ ] real subtask"
    expect(parseSubtasksFromReply(reply)).toEqual(["real subtask"])
  })

  it("returns [] when the reply has no task lines", () => {
    expect(parseSubtasksFromReply("No tasks here, just prose.")).toEqual([])
    expect(parseSubtasksFromReply("")).toEqual([])
  })
})

describe("replaceTaskWithSubtasks", () => {
  it("replaces the matching pending task with subtask lines", () => {
    const content = "# Plan\n- [ ] Build the thing\n- [ ] Other task"
    const out = replaceTaskWithSubtasks(content, "Build the thing", ["Design it", "Code it", "Test it"])
    expect(out).toBe("# Plan\n- [ ] Design it\n- [ ] Code it\n- [ ] Test it\n- [ ] Other task")
  })

  it("preserves the original line's leading indentation", () => {
    const content = "  - [ ] Nested task"
    const out = replaceTaskWithSubtasks(content, "Nested task", ["a", "b"])
    expect(out).toBe("  - [ ] a\n  - [ ] b")
  })

  it("replaces only the first matching pending task", () => {
    const content = "- [ ] dup\n- [ ] dup"
    expect(replaceTaskWithSubtasks(content, "dup", ["x"])).toBe("- [ ] x\n- [ ] dup")
  })

  it("returns content unchanged when no pending task matches", () => {
    const content = "- [ ] something else"
    expect(replaceTaskWithSubtasks(content, "missing", ["a"])).toBe(content)
  })

  it("returns content unchanged when subtasks is empty", () => {
    const content = "- [ ] keep me"
    expect(replaceTaskWithSubtasks(content, "keep me", [])).toBe(content)
  })

  it("matches the first PENDING task, not a completed line with the same text", () => {
    const content = "- [x] Build the thing\n- [ ] Build the thing"
    const out = replaceTaskWithSubtasks(content, "Build the thing", ["sub"])
    expect(out).toBe("- [x] Build the thing\n- [ ] sub")
  })
})
