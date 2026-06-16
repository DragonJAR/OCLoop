import { describe, expect, it } from "bun:test"
import { detectTerminalCapabilities } from "./term-caps"

// All cases inject env/isTTY so they never touch the real environment.
const tty = (env: Record<string, string | undefined>, over: Partial<{ isTTY: boolean; isStdinTTY: boolean; platform: string }> = {}) =>
  detectTerminalCapabilities({ env, isTTY: true, isStdinTTY: true, platform: "linux", ...over })

describe("detectTerminalCapabilities — color level", () => {
  it("NO_COLOR (any value, even empty) disables color", () => {
    expect(tty({ NO_COLOR: "1", TERM: "xterm-256color", COLORTERM: "truecolor" }).color).toBe("none")
    expect(tty({ NO_COLOR: "", TERM: "xterm-256color" }).color).toBe("none")
  })

  it("FORCE_COLOR overrides NO_COLOR and maps levels", () => {
    expect(tty({ NO_COLOR: "1", FORCE_COLOR: "3" }).color).toBe("truecolor")
    expect(tty({ FORCE_COLOR: "0" }).color).toBe("none")
    expect(tty({ FORCE_COLOR: "1" }).color).toBe("ansi16")
    expect(tty({ FORCE_COLOR: "2" }).color).toBe("ansi256")
  })

  it("TERM=dumb is monochrome", () => {
    expect(tty({ TERM: "dumb", COLORTERM: "truecolor" }).color).toBe("none")
  })

  it("non-TTY output is colorless unless forced", () => {
    expect(detectTerminalCapabilities({ env: { TERM: "xterm-256color" }, isTTY: false }).color).toBe("none")
    expect(detectTerminalCapabilities({ env: { FORCE_COLOR: "2" }, isTTY: false }).color).toBe("ansi256")
  })

  it("detects truecolor / 256 / 16 from COLORTERM and TERM", () => {
    expect(tty({ COLORTERM: "truecolor", TERM: "xterm-256color" }).color).toBe("truecolor")
    expect(tty({ TERM: "xterm-256color" }).color).toBe("ansi256")
    expect(tty({ TERM: "xterm" }).color).toBe("ansi16")
  })
})

describe("detectTerminalCapabilities — unicode", () => {
  it("OCLOOP_ASCII forces ASCII; OCLOOP_UNICODE forces unicode", () => {
    expect(tty({ OCLOOP_ASCII: "1" }).unicode).toBe(false)
    expect(tty({ OCLOOP_ASCII: "1", OCLOOP_UNICODE: "1" }).unicode).toBe(false) // ascii wins (checked first)
    expect(tty({ TERM: "dumb", OCLOOP_UNICODE: "1" }).unicode).toBe(true)
  })

  it("TERM=dumb is ASCII", () => {
    expect(tty({ TERM: "dumb" }).unicode).toBe(false)
  })

  it("interactive Unix TTY assumes UTF-8; piped output needs a UTF-8 locale", () => {
    expect(tty({ TERM: "xterm-256color" }).unicode).toBe(true)
    expect(detectTerminalCapabilities({ env: { LANG: "C" }, isTTY: false }).unicode).toBe(false)
    expect(detectTerminalCapabilities({ env: { LANG: "en_US.UTF-8" }, isTTY: false }).unicode).toBe(true)
  })

  it("Windows TTY defaults to unicode", () => {
    expect(tty({}, { platform: "win32" }).unicode).toBe(true)
  })
})

describe("detectTerminalCapabilities — tty / ci", () => {
  it("isInteractive requires both stdin and stdout TTY", () => {
    expect(tty({}).isInteractive).toBe(true)
    expect(detectTerminalCapabilities({ env: {}, isTTY: true, isStdinTTY: false }).isInteractive).toBe(false)
  })
  it("detects CI providers", () => {
    expect(tty({ CI: "true" }).isCI).toBe(true)
    expect(tty({ GITHUB_ACTIONS: "true" }).isCI).toBe(true)
    expect(tty({}).isCI).toBe(false)
  })
})
