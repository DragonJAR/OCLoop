import { describe, expect, it } from "bun:test"
import { formatLogEntry, rotateLogFile } from "./debug-logger"

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

describe("rotateLogFile (T10-A O-06)", () => {
  const eperm = () => Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" })

  it("retries a transient Windows lock: fails twice with EPERM, then rotates", () => {
    let calls = 0
    const op = () => {
      calls++
      if (calls <= 2) throw eperm()
    }
    expect(rotateLogFile(".loop.log", ".loop.log.old", op, "win32")).toBe(true)
    expect(calls).toBe(3)
  })

  it("stays best-effort: a persistent failure never throws", () => {
    let calls = 0
    const op = () => {
      calls++
      throw eperm()
    }
    expect(rotateLogFile(".loop.log", ".loop.log.old", op, "win32")).toBe(false)
    expect(calls).toBeGreaterThan(1)
  })

  it("does not retry on POSIX, where EPERM is a real permission error", () => {
    let calls = 0
    const op = () => {
      calls++
      throw eperm()
    }
    expect(rotateLogFile(".loop.log", ".loop.log.old", op, "linux")).toBe(false)
    expect(calls).toBe(1)
  })
})
