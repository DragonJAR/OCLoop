import { describe, expect, it } from "bun:test"
import { TERMINAL_RESTORE_SEQUENCE } from "./terminal-restore"

describe("TERMINAL_RESTORE_SEQUENCE", () => {
  it("disables OpenTUI probe modes that leak on legacy Windows conhost", () => {
    expect(TERMINAL_RESTORE_SEQUENCE).toContain("\x1b[?1004l")
    expect(TERMINAL_RESTORE_SEQUENCE).toContain("\x1b[?2004l")
    expect(TERMINAL_RESTORE_SEQUENCE).toContain("\x1b[?2026l")
    expect(TERMINAL_RESTORE_SEQUENCE).toContain("\x1b[?2027l")
    expect(TERMINAL_RESTORE_SEQUENCE).toContain("\x1b[?1016l")
    expect(TERMINAL_RESTORE_SEQUENCE).toContain("\x1b[?2031l")
    expect(TERMINAL_RESTORE_SEQUENCE).toContain("\x1b[?1049l")
  })
})