import { describe, expect, it } from "bun:test"
import { normalizeLineEndings, splitLines } from "./text"

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
