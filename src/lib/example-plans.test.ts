/**
 * The shipped example plans must parse.
 *
 * `examples/plans/` is what a new user copies as their first PLAN.md, and
 * nothing exercised the parser against it: a change to the task grammar could
 * mis-count every example (a wrong total shows as a wrong progress bar) and
 * the suite would stay green.
 *
 * The count here is an INDEPENDENT scan of the file — every task line outside
 * a code fence — so it fails when the parser and the file disagree, not only
 * when the parser disagrees with itself.
 */
import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import {
  getCurrentTaskFromContent,
  listPendingTaskDescriptions,
  parsePlan,
} from "./plan-parser"
import { t, setLocale } from "./i18n"

const EXAMPLES_DIR = join(import.meta.dir, "../../examples/plans")

/** Every task line outside a code fence, counted independently of the parser. */
function countTaskLines(content: string): number {
  let inFence = false
  let count = 0
  for (const line of content.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (/^\s*-\s*\[( |x|X|MANUAL|BLOCKED)[^\]]*\]/.test(line)) count++
  }
  return count
}

describe("shipped example plans", () => {
  const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".md")).sort()

  it("ships example plans to exercise", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${file} parses with the tasks it declares`, () => {
      const content = readFileSync(join(EXAMPLES_DIR, file), "utf8")
      const progress = parsePlan(content)
      const expected = countTaskLines(content)

      expect(progress.total).toBe(expected)
      expect(progress.total).toBeGreaterThan(0)

      // The plan must offer work: an example with nothing pending would
      // start the loop with nothing to do.
      const pending = listPendingTaskDescriptions(content)
      expect(pending.length).toBeGreaterThan(0)
      expect(pending.length + progress.completed).toBeLessThanOrEqual(progress.total)

      // And the first pending task must be selectable — that is the task the
      // loop hands to the agent.
      expect(getCurrentTaskFromContent(content)).toBe(pending[0])
    })
  }
})

/**
 * The plan generator must describe the SAME plan format the example plans
 * use — they are what a new user copies as their first PLAN.md.
 *
 * The two drifted apart, in both directions: the generator asked for fewer
 * sections than the examples carry (no "Architecture context", no "Testing
 * Notes", no "How OCLoop reads this file"), and examples/CREATE_PLAN.md
 * asked for a "File Change Summary" that no example has. Nothing compared
 * them, so each side drifted alone.
 *
 * The examples are the canonical set, so the list is DERIVED from them here
 * rather than restated: a section that every example carries must be one the
 * generator asks for.
 */
describe("the plan generator asks for the format the example plans use", () => {
  const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".md")).sort()

  /** Section headings (not phase headings) that EVERY example plan carries. */
  function canonicalHeadings(): string[] {
    const perFile = files.map((f) => {
      const set = new Set<string>()
      for (const m of readFileSync(join(EXAMPLES_DIR, f), "utf8").matchAll(/^## (.+)$/gm)) {
        if (!/^Phase \d+/.test(m[1])) set.add(m[1].trim())
      }
      return set
    })
    if (perFile.length === 0) return []
    return [...perFile[0]].filter((h) => perFile.every((s) => s.has(h)))
  }

  const canonical = canonicalHeadings()

  it("derives a canonical section set from the shipped plans", () => {
    expect(canonical.length).toBeGreaterThan(0)
  })

  it("asks for every canonical section (en)", () => {
    const prompt = t("cpPrompt", { goal: "some goal" })
    for (const heading of canonical) {
      expect(prompt).toContain(`## ${heading}`)
    }
  })

  it("names as many sections as the English prompt (locale parity)", () => {
    const countSections = (prompt: string) => (prompt.match(/## /g) ?? []).length
    setLocale("en")
    const en = countSections(t("cpPrompt", { goal: "some goal" }))
    setLocale("es")
    const es = countSections(t("cpPrompt", { goal: "some goal" }))
    setLocale("en")
    expect(es).toBe(en)
  })

  it("is the format examples/CREATE_PLAN.md asks for too", () => {
    const template = readFileSync(
      join(import.meta.dir, "../../examples/CREATE_PLAN.md"),
      "utf8",
    )
    for (const heading of canonical) {
      expect(template).toContain(`## ${heading}`)
    }
  })
})
