import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { casPlanOrDispatch } from "./eval-mark-cas"
import { t } from "./i18n"

/**
 * Regression tests for the shared eval-path CAS policy — the A4/A9 class
 * ("CAS result ignored → loop advances on a plan that never recorded the
 * mark"). Each test drives the REAL compareAndSwapPlan against a REAL file in
 * a tmpdir; only dispatch/t are injected. A revert to "ignore the CasResult"
 * makes the dispatch-branch tests fail (no error dispatched) and the
 * benign-branch tests fail (error dispatched where none belongs).
 */
describe("casPlanOrDispatch (A4/A9: CAS result never ignored)", () => {
  let dir: string
  let planPath: string
  let dispatched: Array<{ type: string; source: string; message: string; recoverable: boolean }>
  let wroteCalled: boolean
  let benignCalled: boolean

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ocloop-cas-test-"))
    planPath = join(dir, "PLAN.md")
    dispatched = []
    wroteCalled = false
    benignCalled = false
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const deps = {
    dispatch: (a: (typeof dispatched)[number]) => dispatched.push(a),
    t: (key: "errEvalNoteDeferred" | "errBlockMarkDeferred", p: { task: string; cause: string }) =>
      t(key, p),
  }

  const run = (opts: Partial<Parameters<typeof casPlanOrDispatch>[1]> = {}) =>
    casPlanOrDispatch(deps, {
      task: "Implement feature X",
      planPath,
      transform: (c) => c.replace("- [ ] Implement feature X", "- [x] Implement feature X"),
      benignStillMatches: (text) => text.includes("[x] Implement feature X"),
      causeTransformError: "mark transform threw",
      errKey: "errEvalNoteDeferred",
      onWrote: () => (wroteCalled = true),
      onBenignNoChange: () => (benignCalled = true),
      ...opts,
    })

  it("wrote=true → onWrote, no dispatch (the mark landed)", async () => {
    writeFileSync(planPath, "- [ ] Implement feature X\n", "utf-8")
    await run()
    expect(wroteCalled).toBe(true)
    expect(benignCalled).toBe(false)
    expect(dispatched).toHaveLength(0)
  })

  it("no_change with the intended state already present → benign, no dispatch", async () => {
    // Transform returns null (parser found nothing to change) but the target
    // state is already in the file: a prior pass won the race.
    writeFileSync(planPath, "- [x] Implement feature X\n", "utf-8")
    await run({
      transform: () => null,
      benignStillMatches: (text) => text.includes("[x] Implement feature X"),
    })
    expect(benignCalled).toBe(true)
    expect(dispatched).toHaveLength(0)
  })

  it("no_change with the task GONE → recoverable plan error dispatched (A4 livelock guard)", async () => {
    // The task line no longer exists: the mark can never be recorded, yet the
    // pre-fix caller advanced as if it had.
    writeFileSync(planPath, "- [ ] Some other task\n", "utf-8")
    await run({ transform: () => null })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].type).toBe("error")
    expect(dispatched[0].source).toBe("plan")
    expect(dispatched[0].recoverable).toBe(true)
    expect(dispatched[0].message).toContain("Implement feature X")
    expect(dispatched[0].message).toContain("task line no longer present")
  })

  it("no_change benign ONLY on pending predicate: a [x] line is not benign for a reopen", async () => {
    // The writeEvalNote contract: benign requires the task PENDING (the
    // reopen would re-run it). A completed line is NOT benign — the note can
    // never land on a task the parser will skip.
    writeFileSync(planPath, "- [x] Implement feature X\n", "utf-8")
    await run({
      transform: () => null,
      benignStillMatches: (text) => text.includes("- [ ] Implement feature X"),
    })
    expect(benignCalled).toBe(false)
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].message).toContain("task line no longer present")
  })

  it("io_error (plan file missing) → recoverable plan error dispatched", async () => {
    // No PLAN.md written: the CAS read fails → io_error.
    await run()
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].source).toBe("plan")
    expect(dispatched[0].recoverable).toBe(true)
    expect(dispatched[0].message).toContain("PLAN.md I/O failed")
  })

  it("transform_error → recoverable plan error with the caller's cause label", async () => {
    writeFileSync(planPath, "- [ ] Implement feature X\n", "utf-8")
    await run({
      transform: () => {
        throw new Error("boom")
      },
      causeTransformError: "note transform threw",
    })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].message).toContain("note transform threw")
  })

  it("deferred (plan changes underfoot between read and write) → recoverable plan error", async () => {
    writeFileSync(planPath, "- [ ] Implement feature X\n", "utf-8")
    // Mutate the file AFTER compareAndSwapPlan reads `before` but BEFORE it
    // re-reads for the byte-compare — the race window the deferred label
    // describes.
    await run({
      transform: (c) => {
        writeFileSync(planPath, c + "- [ ] sneaky concurrent edit\n", "utf-8")
        return c.replace("- [ ] Implement feature X", "- [x] Implement feature X")
      },
    })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].message).toContain("plan changed underfoot")
  })
})
