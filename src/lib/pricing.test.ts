import { describe, expect, it } from "bun:test"
import { lookupCost, estimateCost, formatCost } from "./pricing"

describe("pricing", () => {
  it("estimateCost: 1M input tokens × sonnet-4-6 price = $3", () => {
    const c = lookupCost("anthropic/claude-sonnet-4-6")
    expect(estimateCost({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, c)).toBeCloseTo(3, 9)
  })

  it("lookupCost: exact match", () => {
    expect(lookupCost("anthropic/claude-opus-4-8")).toEqual({ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 })
  })

  it("lookupCost: case-insensitive exact", () => {
    expect(lookupCost("ZAI/GLM-5")).toEqual({ input: 1, output: 3.2, cacheRead: 0.2, cacheWrite: 1 })
  })

  it("lookupCost: byId fallback for unknown provider", () => {
    expect(lookupCost("openrouter/glm-5")).toEqual({ input: 1, output: 3.2, cacheRead: 0.2, cacheWrite: 1 })
  })

  it("lookupCost: subscription/coding-plan resolves to API price (never $0)", () => {
    expect(lookupCost("zhipuai-coding-plan/glm-5.2")).toEqual({ input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 1.4 })
    expect(lookupCost("minimax-coding-plan/MiniMax-M3")).toEqual({ input: 0.6, output: 2.4, cacheRead: 0.12, cacheWrite: 0 })
  })

  it("lookupCost: unknown → fallback average", () => {
    const fb = { input: 1.5, output: 8, cacheRead: 0.2, cacheWrite: 1 }
    expect(lookupCost("acme/nope-9")).toEqual(fb)
    expect(lookupCost(undefined)).toEqual(fb)
  })

  it("formatCost: always ~, decimals by magnitude", () => {
    expect(formatCost(0.00123)).toBe("~$0.0012")
    expect(formatCost(2.5)).toBe("~$2.50")
    expect(formatCost(0)).toBe("~$0.0000")
  })
})
