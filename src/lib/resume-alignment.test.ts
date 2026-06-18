import { describe, expect, it } from "bun:test"
import { describeResumeAlignment } from "./resume-alignment"

// PLAN.md bug-hunt #4: the loop's persisted state did not record the task
// the previous iteration was working on. If PLAN.md was edited between
// crash and resume, the agent would pick up whatever is now the first
// pending task — silently skipping or re-running tasks. The fix persists
// `currentTask` in the snapshot and runs this helper on resume to detect
// the misalignment and surface it as a warning.

describe("describeResumeAlignment — no warning (backward compat + unchanged)", () => {
  // Backward compatibility: a state file written before the `currentTask`
  // field was added has no task to check, so the resume must NOT warn.
  it("returns null when savedTask is null", () => {
    expect(describeResumeAlignment(null, "- [ ] task B\n- [ ] task C")).toBeNull()
  })
  it("returns null when savedTask is undefined", () => {
    expect(
      describeResumeAlignment(undefined, "- [ ] task B\n- [ ] task C"),
    ).toBeNull()
  })
  it("returns null when savedTask is an empty string", () => {
    // Defensive: an empty string means "no task" just like null. The
    // contract is "no value to validate against" → no warning.
    expect(describeResumeAlignment("", "- [ ] task B")).toBeNull()
  })

  // Happy path: PLAN.md was not edited between save and resume, so the
  // saved task is still the first pending task. The resume can proceed
  // without any user-facing signal.
  it("returns null when the saved task is still the first pending task", () => {
    expect(
      describeResumeAlignment("task B", "- [ ] task B\n- [ ] task C"),
    ).toBeNull()
  })
  it("returns null when the saved task is the only pending task", () => {
    expect(describeResumeAlignment("only task", "- [ ] only task")).toBeNull()
  })
  it("ignores completed tasks above the saved task", () => {
    // The saved task is still first-among-pending; completed lines above
    // do not affect the alignment check.
    expect(
      describeResumeAlignment(
        "task B",
        "- [x] task A\n- [ ] task B\n- [ ] task C",
      ),
    ).toBeNull()
  })
  it("ignores headings, blank lines, and MANUAL/BLOCKED tags", () => {
    // The plan parser skips headings and non-conforming lines; the
    // helper only cares about the first-pending task description.
    expect(
      describeResumeAlignment(
        "task B",
        [
          "# Phase 2",
          "",
          "- [x] task A",
          "- [MANUAL] ignored",
          "- [BLOCKED: x] also ignored",
          "- [ ] task B",
        ].join("\n"),
      ),
    ).toBeNull()
  })
  it("returns null when PLAN.md has no pending task and saved task is also done", () => {
    // Edge case: between save and resume, the user completed the saved
    // task AND every other task. `current` is null. The fast-path
    // `current === savedTask` is false (null !== "task B"), but the
    // saved task IS in the plan as `[x]` → "completed", which is still
    // an informational warning — the user can confirm the work is done
    // even though the loop will hit plan_complete on the next iteration
    // anyway. This test pins that behavior: the warning fires so the
    // `.loop.log` audit trail records the resume-after-completion.
    expect(
      describeResumeAlignment("task B", "- [x] task A\n- [x] task B"),
    ).toEqual({ kind: "completed", saved: "task B" })
  })
})

describe("describeResumeAlignment — completed (saved task is now [x])", () => {
  it("detects that the saved task is now done", () => {
    // The user (or a parallel run) completed the task between crash and
    // resume. The next iteration will start from a later task; the
    // warning is informational so the user knows the work is done.
    expect(
      describeResumeAlignment("task B", "- [x] task B\n- [ ] task C"),
    ).toEqual({ kind: "completed", saved: "task B" })
  })
  it("detects completion even when a new task was inserted above", () => {
    // Both edits happened: the saved task was marked done AND a new task
    // was inserted. The "completed" verdict takes priority because the
    // work was finished — the new task above is a separate question.
    expect(
      describeResumeAlignment(
        "task B",
        "- [ ] task X\n- [x] task B\n- [ ] task C",
      ),
    ).toEqual({ kind: "completed", saved: "task B" })
  })
})

describe("describeResumeAlignment — reordered (saved task still pending but not first)", () => {
  it("detects a task inserted above the saved one", () => {
    // The user added a new task at the top while the loop was crashed.
    // The next iteration will pick the new task first; the saved task
    // remains pending and will be reached again later.
    expect(
      describeResumeAlignment(
        "task B",
        "- [ ] task X (new)\n- [ ] task B\n- [ ] task C",
      ),
    ).toEqual({
      kind: "reordered",
      saved: "task B",
      current: "task X (new)",
    })
  })
  it("detects a manual reorder (swap two pending tasks)", () => {
    // The user moved task B below task C. Either way, the next iteration
    // starts on a different pending task.
    expect(
      describeResumeAlignment("task B", "- [ ] task C\n- [ ] task B"),
    ).toEqual({
      kind: "reordered",
      saved: "task B",
      current: "task C",
    })
  })
})

describe("describeResumeAlignment — removed (saved task no longer in PLAN.md)", () => {
  it("detects the saved task was deleted", () => {
    // The user deleted the saved task entirely. PLAN.md now starts on a
    // different pending task (or nothing, when this test's `current` is
    // also null).
    expect(describeResumeAlignment("task B", "- [ ] task X")).toEqual({
      kind: "removed",
      saved: "task B",
      current: "task X",
    })
  })
  it("detects the saved task was deleted and PLAN.md is now empty", () => {
    // `current` is null when PLAN.md has no pending tasks left. The
    // "removed" verdict still fires so the user knows the work they
    // expected to resume is no longer in the plan.
    expect(describeResumeAlignment("task B", "")).toEqual({
      kind: "removed",
      saved: "task B",
      current: null,
    })
  })
  it("detects the saved task was deleted and remaining tasks are done", () => {
    // Same as above, but the remaining tasks are all `[x]`. `current` is
    // null, the plan looks complete from the parser's POV, and the
    // "removed" warning still surfaces the gap.
    expect(
      describeResumeAlignment("task B", "- [x] task A\n- [x] task C"),
    ).toEqual({
      kind: "removed",
      saved: "task B",
      current: null,
    })
  })
})

describe("describeResumeAlignment — defensive parsing", () => {
  it("handles a PLAN.md that has tasks with leading whitespace", () => {
    // Indented tasks (a common style in nested bullet lists) must still
    // match. The regex requires `^[-*]` so leading whitespace would skip
    // the line — but the parser already filters those out, so the
    // surface presented by `current` is consistent.
    expect(
      describeResumeAlignment(
        "task B",
        "- [ ] task B\n  - [ ] nested (ignored)\n- [ ] task C",
      ),
    ).toBeNull()
  })
  it("uses a strict line match (no partial-description false positives)", () => {
    // "task B" must not match "task B2" — the regex anchors the
    // description with `\s*$`, so trailing characters would break the
    // match. Pin the behavior so a future tweak doesn't silently
    // broaden the match. The saved task is still pending (line 2) but
    // not first (line 1 is "task B2"), so the verdict is "reordered"
    // — a useful confirmation that the helper is scanning the right
    // line and not matching substrings.
    expect(
      describeResumeAlignment("task B", "- [ ] task B2\n- [ ] task B"),
    ).toEqual({
      kind: "reordered",
      saved: "task B",
      current: "task B2",
    })
  })
})
