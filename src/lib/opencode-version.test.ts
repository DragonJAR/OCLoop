import { describe, expect, it } from "bun:test"
import { parseOpencodeVersion } from "./opencode-version"

describe("parseOpencodeVersion", () => {
  it("recognizes the supported OpenCode v1 and v2 forms", () => {
    expect(parseOpencodeVersion("opencode v2.0.18")).toBe(2)
    expect(parseOpencodeVersion("opencode 2.0.18")).toBe(2)
    expect(parseOpencodeVersion("opencode 1.18.33")).toBe(1)
    expect(parseOpencodeVersion("opencode v1.0.0")).toBe(1)
    expect(parseOpencodeVersion("v1.x")).toBe(1)
  })

  it("rejects unrelated, unsupported, empty, and malformed output", () => {
    expect(parseOpencodeVersion("codex-cli 0.159.0")).toBeNull()
    expect(parseOpencodeVersion("")).toBeNull()
    expect(parseOpencodeVersion("garbage")).toBeNull()
    expect(parseOpencodeVersion("opencode v3.0.0")).toBeNull()
    expect(parseOpencodeVersion("opencode 2.x")).toBeNull()
  })

  // `parseOpencodeVersion` calls `.toLowerCase()` on the input before the
  // regex match, so an uppercase output (some shells / wrappers emit
  // "OpenCode V2.0.18" or "OPENCODE 1.18.33") must normalize the same way.
  // Pin the case-folding contract so a future refactor that drops the
  // `.toLowerCase()` (and instead adds the /i flag, or removes the
  // normalization entirely) is caught at `bun test` time.
  it("normalizes input casing before matching (the .toLowerCase() contract)", () => {
    expect(parseOpencodeVersion("OpenCode V2.0.18")).toBe(2)
    expect(parseOpencodeVersion("OPENCODE 1.18.33")).toBe(1)
    expect(parseOpencodeVersion("OPENCODE V1.X")).toBe(1)
    // Whitespace around the input is also stripped via .trim().
    expect(parseOpencodeVersion("  opencode v2.0.18  \n")).toBe(2)
  })
})
