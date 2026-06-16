import { describe, expect, it } from "bun:test"
import {
  getLayout,
  bar,
  titleBar,
  fitSegments,
  FALLBACK_COLS,
  FALLBACK_ROWS,
} from "./layout"

describe("getLayout — breakpoints & fallback", () => {
  it("falls back to 80x24 when size is unreadable", () => {
    const l = getLayout(undefined, undefined)
    expect(l.cols).toBe(FALLBACK_COLS)
    expect(l.rows).toBe(FALLBACK_ROWS)
    expect(l.breakpoint).toBe("medium")
  })

  it("classifies narrow / medium / wide", () => {
    expect(getLayout(40).breakpoint).toBe("narrow")
    expect(getLayout(80).breakpoint).toBe("medium")
    expect(getLayout(140).breakpoint).toBe("wide")
  })

  it("narrow is compact, wider is not", () => {
    expect(getLayout(40).compact).toBe(true)
    expect(getLayout(100).compact).toBe(false)
  })

  it("short flips at the 18-row threshold", () => {
    expect(getLayout(80, 17).short).toBe(true)
    expect(getLayout(80, 18).short).toBe(false)
    expect(getLayout(80, 60).short).toBe(false)
  })

  it("progress bar grows with width; log content scales", () => {
    expect(getLayout(40).progressWidth).toBeLessThan(getLayout(140).progressWidth)
    expect(getLayout(40).logContentWidth).toBeLessThan(getLayout(140).logContentWidth)
  })

  it("floors widths so a tiny terminal still renders something", () => {
    const l = getLayout(10)
    expect(l.logContentWidth).toBeGreaterThanOrEqual(16)
    expect(l.taskWidth).toBeGreaterThanOrEqual(16)
  })

  it("rejects non-finite / non-positive sizes", () => {
    expect(getLayout(0).cols).toBe(FALLBACK_COLS)
    expect(getLayout(-5).cols).toBe(FALLBACK_COLS)
    expect(getLayout(NaN).cols).toBe(FALLBACK_COLS)
  })
})

describe("bar / titleBar", () => {
  it("bar fills exactly the requested width", () => {
    expect(bar(10)).toHaveLength(10)
    expect(bar(undefined)).toHaveLength(FALLBACK_COLS)
  })
  it("titleBar centers the title and fills to width", () => {
    const t = titleBar("HI", 20)
    expect(t).toHaveLength(20)
    expect(t).toContain(" HI ")
  })
  it("titleBar degrades when width < title", () => {
    expect(titleBar("A very long title", 6)).toHaveLength(6)
  })
})

describe("fitSegments", () => {
  it("keeps all segments when they fit", () => {
    expect(fitSegments(["a", "b", "c"], 40)).toBe("a  b  c")
  })
  it("drops trailing low-priority segments and never overflows", () => {
    const out = fitSegments(["keepme", "second", "third", "fourth"], 14)
    expect(out.length).toBeLessThanOrEqual(14)
    expect(out.startsWith("keepme")).toBe(true)
  })
  it("ignores empty segments", () => {
    expect(fitSegments(["a", "", "b"], 40)).toBe("a  b")
  })
})
