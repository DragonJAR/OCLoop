import { describe, expect, it } from "bun:test"
import { glyph } from "./glyphs"

describe("glyph", () => {
  it("returns Unicode when supported, ASCII otherwise", () => {
    expect(glyph("stateRunning", true)).toBe("▶")
    expect(glyph("stateRunning", false)).toBe(">")
    expect(glyph("progressFull", true)).toBe("█")
    expect(glyph("progressFull", false)).toBe("#")
  })

  it("ASCII fallbacks for status/meter glyphs are single-column (keep width math exact)", () => {
    const singleCol: Parameters<typeof glyph>[0][] = [
      "stateStarting", "stateReady", "stateRunning", "statePausing", "statePaused",
      "stateCooldown", "stateStopping", "stateStopped", "stateComplete", "stateError",
      "stateDebug", "stateUnknown", "sevWarn", "sevError", "dot", "progressFull",
      "progressEmpty", "times", "barH",
    ]
    for (const name of singleCol) {
      expect(glyph(name, false)).toHaveLength(1)
    }
  })

  it("info severity is a blank space in both modes (quiet routine lines)", () => {
    expect(glyph("sevInfo", true)).toBe(" ")
    expect(glyph("sevInfo", false)).toBe(" ")
  })
})
