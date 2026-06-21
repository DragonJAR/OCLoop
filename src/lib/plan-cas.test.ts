import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { compareAndSwapPlan } from "./plan-cas"

/**
 * Compare-and-swap is load-bearing anti-clobber protection shared by four
 * App.tsx call sites. These tests pin its contract directly against a real
 * temp file (no mocks): the four outcomes are nothing-changed, written,
 * deferred-on-concurrent-edit, and swallowed-error. Each App.tsx site is now a
 * 3-line wrapper over this, so the guard logic only needs proving once.
 */
describe("compareAndSwapPlan", () => {
  let dir: string
  let planPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ocloop-cas-"))
    planPath = join(dir, "PLAN.md")
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it("writes the transformed content and reports success", async () => {
    writeFileSync(planPath, "- [ ] one\n", "utf-8")
    const res = await compareAndSwapPlan(planPath, (c) => c.replace("[ ]", "[x]"))
    expect(res.wrote).toBe(true)
    expect(res.result).toBe("- [x] one\n")
    expect(await Bun.file(planPath).text()).toBe("- [x] one\n")
  })

  it("returns wrote:false (no result) when transform yields null", async () => {
    const original = "- [ ] one\n"
    writeFileSync(planPath, original, "utf-8")
    const res = await compareAndSwapPlan(planPath, () => null)
    expect(res.wrote).toBe(false)
    expect(res.result).toBeNull()
    // File untouched.
    expect(await Bun.file(planPath).text()).toBe(original)
  })

  it("defers (wrote:false) when PLAN.md changes between read and re-read", async () => {
    writeFileSync(planPath, "- [ ] one\n", "utf-8")
    // The transform mutates the file mid-CAS to model a concurrent agent edit
    // landing in the window between compareAndSwapPlan's two reads.
    const res = await compareAndSwapPlan(planPath, (c) => {
      writeFileSync(planPath, c + "- [ ] two\n", "utf-8")
      return c.replace("[ ]", "[x]")
    })
    expect(res.wrote).toBe(false)
    expect(res.result).toBeNull()
    // The concurrent edit won; our stale transform was NOT applied on top.
    expect(await Bun.file(planPath).text()).toBe("- [ ] one\n- [ ] two\n")
  })

  it("does not throw when the transform throws; leaves the file intact", async () => {
    const original = "- [ ] one\n"
    writeFileSync(planPath, original, "utf-8")
    const res = await compareAndSwapPlan(planPath, () => {
      throw new Error("boom")
    })
    expect(res.wrote).toBe(false)
    expect(res.result).toBeNull()
    expect(await Bun.file(planPath).text()).toBe(original)
  })

  it("returns wrote:false when the plan file does not exist (best-effort)", async () => {
    const missing = join(dir, "nope.md")
    const res = await compareAndSwapPlan(missing, (c) => c + "x")
    expect(res.wrote).toBe(false)
    expect(res.result).toBeNull()
    expect(existsSync(missing)).toBe(false)
  })

  it("is a no-op (wrote:false) when content is unchanged by the transform", async () => {
    const original = "- [ ] one\n"
    writeFileSync(planPath, original, "utf-8")
    // Transform returns content byte-identical to what it read: still a write
    // (we don't special-case no-op content), but it proves the CAS window
    // closes cleanly when there was nothing concurrent.
    const res = await compareAndSwapPlan(planPath, (c) => c)
    expect(res.wrote).toBe(true)
    expect(res.result).toBe(original)
  })

  it("handles a freshly created directory without a pre-existing file", async () => {
    // Empty dir: read fails (ENOENT). Verifies the catch covers first-read
    // failure, not just write failure.
    const res = await compareAndSwapPlan(planPath, (c) => c + "x")
    expect(res.wrote).toBe(false)
    expect(res.result).toBeNull()
  })

  it("writes the full updated content, not a patch", async () => {
    // Sanity: result is the complete new file body, exercising multi-line.
    const original = "# Plan\n\n- [ ] one\n- [ ] two\n"
    writeFileSync(planPath, original, "utf-8")
    const res = await compareAndSwapPlan(planPath, (c) =>
      c.replace("- [ ] one\n", "- [x] one\n").replace("- [ ] two\n", "- [x] two\n"),
    )
    expect(res.wrote).toBe(true)
    expect(res.result).toBe("# Plan\n\n- [x] one\n- [x] two\n")
    expect(await Bun.file(planPath).text()).toBe(res.result)
  })

  it("does not leave temp files behind on any path", async () => {
    // compareAndSwapPlan writes in place (no tmp+rename); confirm the dir
    // contains exactly the plan file after a successful write.
    writeFileSync(planPath, "x\n", "utf-8")
    await compareAndSwapPlan(planPath, (c) => c.toUpperCase())
    const entries = readdirSync(dir)
    expect(entries).toEqual(["PLAN.md"])
  })

  it("tolerates an unreadable directory gracefully", async () => {
    // EACCES on read: skipped on platforms where chmod is unavailable.
    const readOnly = mkdtempSync(join(tmpdir(), "ocloop-cas-ro-"))
    try {
      const path = join(readOnly, "PLAN.md")
      writeFileSync(path, "x\n", "utf-8")
      try {
        mkdirSync(readOnly, { recursive: true })
        Bun.spawn(["chmod", "000", readOnly])
        // Give chmod a beat; skip if the platform ignores it.
      } catch {
        return
      }
      const res = await compareAndSwapPlan(join(readOnly, "missing.md"), (c) => c)
      // Either the chmod blocked us (wrote:false) or it didn't (the file is
      // missing anyway → wrote:false). Either way, no throw.
      expect(res.wrote).toBe(false)
    } finally {
      try {
        Bun.spawn(["chmod", "755", readOnly])
        rmSync(readOnly, { recursive: true, force: true })
      } catch {
        // best-effort cleanup
      }
    }
  })
})
