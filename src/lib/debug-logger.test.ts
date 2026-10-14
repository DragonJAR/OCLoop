import { describe, expect, it } from "bun:test"
import { formatLogEntry } from "./debug-logger"

describe("formatLogEntry", () => {
  it("formats entry without data as simple header and message", () => {
    const entry = formatLogEntry("12:00:00.000", "INFO", "server", "listening")
    expect(entry).toBe("[12:00:00.000] [INFO] [server] listening")
  })

  it("formats serializable plain data with JSON.stringify", () => {
    const entry = formatLogEntry("12:00:00.000", "DEBUG", "api", "payload", { count: 3, flag: true })
    expect(entry).toBe('[12:00:00.000] [DEBUG] [api] payload {"count":3,"flag":true}')
  })

  it("properly JSON-escapes Error name and message containing quotes and newlines", () => {
    const err = new Error('Failed to open "my file.txt":\nfile not found')
    err.name = 'Custom"Error"'
    const entry = formatLogEntry("12:00:00.000", "ERROR", "io", "read failure", err)

    const prefix = "[12:00:00.000] [ERROR] [io] read failure "
    expect(entry.startsWith(prefix)).toBe(true)

    // The remainder of the line MUST be parseable JSON
    const jsonPart = entry.slice(prefix.length)
    const parsed = JSON.parse(jsonPart)

    expect(parsed.name).toBe('Custom"Error"')
    expect(parsed.message).toBe('Failed to open "my file.txt":\nfile not found')
    expect(typeof parsed.stack).toBe("string")
  })

  it("produces a single-line log entry even when Error message contains newlines", () => {
    const err = new Error("Line 1\nLine 2\r\nLine 3")
    const entry = formatLogEntry("12:00:00.000", "ERROR", "worker", "crash", err)

    expect(entry.includes("\n")).toBe(false)
    expect(entry.includes("\r")).toBe(false)
  })

  it("handles circular data gracefully without throwing", () => {
    const circular: Record<string, unknown> = { a: 1 }
    circular.self = circular

    const entry = formatLogEntry("12:00:00.000", "WARN", "state", "dump", circular)
    expect(entry).toBe("[12:00:00.000] [WARN] [state] dump [Circular or Non-Serializable Data]")
  })
})
