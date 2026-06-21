import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendManifest, type ManifestEntry } from "./manifest"

// appendManifest writes relative to process.cwd(); run each test in a temp dir.
let dir: string
let prevCwd: string

beforeEach(() => {
  prevCwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), "ocloop-manifest-"))
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(prevCwd)
  rmSync(dir, { recursive: true, force: true })
})

const sample: ManifestEntry = {
  ts: "2026-01-01T00:00:00.000Z",
  iteration: 1,
  task: "Implement X",
  model: "anthropic/claude-sonnet-4",
  durationMs: 1234,
  tokens: { input: 10, output: 20, cacheRead: 5, cacheWrite: 0 },
  costUsd: 0.0042,
}

describe("manifest", () => {
  it("appends one parseable JSON line per entry (JSONL round-trip)", () => {
    appendManifest(sample)
    appendManifest({ ...sample, iteration: 2, task: "Implement Y" })

    const lines = readFileSync(join(dir, ".loop-manifest.jsonl"), "utf-8")
      .trim()
      .split("\n")
    expect(lines.length).toBe(2)

    const first = JSON.parse(lines[0]) as ManifestEntry
    expect(first).toEqual(sample)

    const second = JSON.parse(lines[1]) as ManifestEntry
    expect(second.iteration).toBe(2)
    expect(second.task).toBe("Implement Y")
  })

  it("preserves a null task/model without throwing", () => {
    appendManifest({ ...sample, task: null, model: null })
    const parsed = JSON.parse(
      readFileSync(join(dir, ".loop-manifest.jsonl"), "utf-8").trim(),
    ) as ManifestEntry
    expect(parsed.task).toBeNull()
    expect(parsed.model).toBeNull()
  })

  it("never throws on a write error (best-effort)", () => {
    // Make the target path a directory so appendFileSync fails (EISDIR); the
    // error must be swallowed, not propagated — a manifest write must never
    // crash the loop.
    mkdirSync(join(dir, ".loop-manifest.jsonl"))
    expect(() => appendManifest(sample)).not.toThrow()
  })
})
