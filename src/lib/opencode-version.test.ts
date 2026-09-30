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
})
