import { describe, expect, it } from "bun:test"
import {
  formatActivityLine,
  formatTime,
  LEVEL_GLYPH,
  LABEL_WIDTH,
} from "./activity-format"

describe("formatActivityLine — label & level", () => {
  it("derives a descriptive, bracketed, padded label from the type", () => {
    const f = formatActivityLine({ type: "assistant_message", message: "hi" }, 80)
    expect(f.label).toBe("[responding]".padEnd(LABEL_WIDTH))
    expect(f.label.length).toBe(LABEL_WIDTH)
  })

  it("defaults severity from type (error → error) and shows its glyph", () => {
    const f = formatActivityLine({ type: "error", message: "boom" }, 80)
    expect(f.level).toBe("error")
    expect(f.glyph).toBe(LEVEL_GLYPH.error)
  })

  it("honors an explicit level override (rate limit is a warn, not error)", () => {
    const f = formatActivityLine({ type: "error", message: "rate limited", level: "warn" }, 80)
    expect(f.level).toBe("warn")
    expect(f.glyph).toBe(LEVEL_GLYPH.warn)
  })

  it("info lines carry a blank glyph (low noise)", () => {
    expect(formatActivityLine({ type: "task", message: "x" }, 80).glyph).toBe(LEVEL_GLYPH.info)
  })

  it("reasoning is de-emphasized (muted), not colored as a warning", () => {
    expect(formatActivityLine({ type: "reasoning", message: "thinking" }, 80).labelColor).toBe("textMuted")
  })
})

describe("formatActivityLine — content, progress, collapse, width", () => {
  it("renders tool calls as 'preview: message'", () => {
    const f = formatActivityLine({ type: "tool_use", message: "run tests", detail: "bash" }, 80)
    expect(f.text).toBe("bash: run tests")
  })

  it("appends progress X/Y (pct) and phase", () => {
    const f = formatActivityLine(
      { type: "task", message: "work", progress: { current: 4, total: 8, phase: "Phase 2" } },
      80,
    )
    expect(f.text).toContain("4/8 (50%)")
    expect(f.text).toContain("Phase 2")
  })

  it("appends a (×N) counter for collapsed repeats", () => {
    const f = formatActivityLine({ type: "task", message: "retry", count: 3 }, 80)
    expect(f.text).toContain("(×3)")
  })

  it("omits the counter when count <= 1", () => {
    expect(formatActivityLine({ type: "task", message: "x", count: 1 }, 80).text).not.toContain("×")
  })

  it("truncates to the given content width", () => {
    const f = formatActivityLine({ type: "task", message: "x".repeat(200) }, 20)
    expect(f.text.length).toBeLessThanOrEqual(20)
  })

  it("handles non-finite contentWidth safely with fallback", () => {
    const f = formatActivityLine({ type: "task", message: "important message" }, Number.NaN)
    expect(f.text).not.toBe("")
    expect(f.text.length).toBeGreaterThan(0)
  })

  it("ignores NaN, non-finite, and negative progress values", () => {
    const f1 = formatActivityLine(
      { type: "task", message: "work", progress: { current: Number.NaN, total: 10 } },
      80,
    )
    expect(f1.text).not.toContain("NaN")

    const f2 = formatActivityLine(
      { type: "task", message: "work", progress: { current: -1, total: 10 } },
      80,
    )
    expect(f2.text).not.toContain("-1/10")

    const f3 = formatActivityLine(
      { type: "task", message: "work", progress: { current: 5, total: Number.POSITIVE_INFINITY } },
      80,
    )
    expect(f3.text).not.toContain("Infinity")
  })
})

describe("formatTime", () => {
  it("formats HH:MM:SS zero-padded", () => {
    expect(formatTime(new Date(2026, 0, 1, 9, 4, 7))).toBe("09:04:07")
  })
})
