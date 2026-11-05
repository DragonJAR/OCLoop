import { describe, expect, it } from "bun:test"
import { normalizeLineEndings, splitLines, eolOf, preserveEol } from "./text"

describe("normalizeLineEndings", () => {
  it("leaves pure-LF text unchanged", () => {
    expect(normalizeLineEndings("a\nb\nc")).toBe("a\nb\nc")
  })

  it("converts CRLF to LF", () => {
    expect(normalizeLineEndings("a\r\nb\r\nc")).toBe("a\nb\nc")
  })

  it("converts a lone CR (classic Mac) to LF", () => {
    expect(normalizeLineEndings("a\rb\rc")).toBe("a\nb\nc")
  })

  it("handles mixed endings in one document", () => {
    expect(normalizeLineEndings("a\r\nb\rc\nd")).toBe("a\nb\nc\nd")
  })

  it("normalizes a trailing CRLF to a trailing LF", () => {
    expect(normalizeLineEndings("line\r\n")).toBe("line\n")
  })

  it("handles empty string", () => {
    expect(normalizeLineEndings("")).toBe("")
  })
})

describe("splitLines", () => {
  it("splits on LF", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"])
  })

  it("splits on CRLF", () => {
    expect(splitLines("a\r\nb\r\nc")).toEqual(["a", "b", "c"])
  })

  it("splits on lone CR", () => {
    expect(splitLines("a\rb\rc")).toEqual(["a", "b", "c"])
  })

  it("splits mixed endings in one document", () => {
    expect(splitLines("a\r\nb\rc\nd")).toEqual(["a", "b", "c", "d"])
  })

  it("does not include a trailing empty element for a final newline", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b", ""])
  })

  it("handles empty string as a single empty line", () => {
    expect(splitLines("")).toEqual([""])
  })
})

describe("eolOf", () => {
  it("detects CRLF content", () => {
    expect(eolOf("a\r\nb\r\n")).toBe("\r\n")
  })

  it("falls back to LF for pure-LF content", () => {
    expect(eolOf("a\nb\n")).toBe("\n")
  })

  it("falls back to LF for lone-CR (classic Mac) content", () => {
    expect(eolOf("a\rb")).toBe("\n")
  })

  it("falls back to LF for empty content", () => {
    expect(eolOf("")).toBe("\n")
  })
})

describe("preserveEol", () => {
  it("rejoins a normalized transform with CRLF when the original was CRLF", () => {
    expect(preserveEol("- [x] a\r\n- [ ] b\r\n", "- [x] a\n- [ ] s\n")).toBe(
      "- [x] a\r\n- [ ] s\r\n",
    )
  })

  it("keeps the transform as-is (LF) when the original was LF", () => {
    expect(preserveEol("- [x] a\n- [ ] b\n", "- [x] a\n- [ ] s\n")).toBe(
      "- [x] a\n- [ ] s\n",
    )
  })

  it("keeps LF when the original used lone CR", () => {
    expect(preserveEol("a\rb", "a\nb")).toBe("a\nb")
  })

  it("handles an empty transform", () => {
    expect(preserveEol("a\r\nb\r\n", "")).toBe("")
  })

  it("handles an empty original", () => {
    expect(preserveEol("", "a\nb")).toBe("a\nb")
  })
})
