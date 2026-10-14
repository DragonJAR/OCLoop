import { describe, expect, it } from "bun:test"
import { resolvePlanFile, resolvePromptFile } from "./plan-file"
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

  it("trims surrounding whitespace from a valid path", () => {
    expect(resolvePlanFile("  PLAN.md  ")).toBe("PLAN.md")
    expect(resolvePlanFile("\tplans/weekly.md\n")).toBe("plans/weekly.md")
  })
})

describe("resolvePromptFile", () => {
  it("returns the input when it is a non-empty non-whitespace string", () => {
    expect(resolvePromptFile(".loop-prompt.md")).toBe(".loop-prompt.md")
    expect(resolvePromptFile("prompts/custom.md")).toBe("prompts/custom.md")
  })

  it("falls back to DEFAULTS.PROMPT_FILE for empty string", () => {
    expect(resolvePromptFile("")).toBe(DEFAULTS.PROMPT_FILE)
  })

  it("falls back to DEFAULTS.PROMPT_FILE for undefined", () => {
    expect(resolvePromptFile(undefined)).toBe(DEFAULTS.PROMPT_FILE)
  })

  it("falls back to DEFAULTS.PROMPT_FILE for whitespace-only", () => {
    expect(resolvePromptFile("   ")).toBe(DEFAULTS.PROMPT_FILE)
    expect(resolvePromptFile("\t\n")).toBe(DEFAULTS.PROMPT_FILE)
  })

  it("trims surrounding whitespace from a valid path", () => {
    expect(resolvePromptFile("  .loop-prompt.md  ")).toBe(".loop-prompt.md")
    expect(resolvePromptFile("\tprompts/custom.md\n")).toBe("prompts/custom.md")
  })
})

