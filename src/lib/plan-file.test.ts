import { describe, expect, it } from "bun:test"
import { resolvePlanFile } from "./plan-file"
import { DEFAULTS } from "./constants"

describe("resolvePlanFile (Finding 16.3.A)", () => {
  it("returns the input when it is a non-empty non-whitespace string", () => {
    expect(resolvePlanFile("PLAN.md")).toBe("PLAN.md")
    expect(resolvePlanFile("plans/weekly.md")).toBe("plans/weekly.md")
    // Lone-dash is a valid filename; only "--" prefixes are rejected by the
    // parser, not the resolver.
    expect(resolvePlanFile("-")).toBe("-")
  })

  it("falls back to DEFAULTS.PLAN_FILE for empty string", () => {
    expect(resolvePlanFile("")).toBe(DEFAULTS.PLAN_FILE)
  })

  it("falls back to DEFAULTS.PLAN_FILE for undefined", () => {
    expect(resolvePlanFile(undefined)).toBe(DEFAULTS.PLAN_FILE)
  })

  it("falls back to DEFAULTS.PLAN_FILE for whitespace-only (Finding 1.1.A downstream)", () => {
    expect(resolvePlanFile("   ")).toBe(DEFAULTS.PLAN_FILE)
    expect(resolvePlanFile("\t\n")).toBe(DEFAULTS.PLAN_FILE)
  })
})
