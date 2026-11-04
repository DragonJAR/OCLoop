import { afterEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  atomicWriteText,
  atomicWriteTextSync,
  cleanupDeterministicTmp,
  cleanupDeterministicTmpAsync,
  deterministicTmpPath,
  isDeterministicTmpFile,
  isOrphanTmpFile,
  tmpFilePid,
} from "./atomic-fs"

let dir = ""

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ""
})

describe("atomic-fs", () => {
  it("deterministicTmpPath uses pid and unique call suffix (B5, W2-01)", () => {
    const target = join("/tmp", "plan.md")
    const tmp1 = deterministicTmpPath(target)
    const tmp2 = deterministicTmpPath(target)
    const pattern = new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.${process.pid}\\.\\d+-[a-f0-9]{8}\\.tmp$`)
    expect(tmp1).toMatch(pattern)
    expect(tmp2).toMatch(pattern)
    expect(tmp1).not.toBe(tmp2)
  })

  it("atomicWriteTextSync leaves no tmp on success", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "cfg.json")
    atomicWriteTextSync(path, '{"ok":true}\n')
    expect(readFileSync(path, "utf-8")).toBe('{"ok":true}\n')
    const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"))
    expect(leftovers).toEqual([])
  })

  it("atomicWriteText uses deterministic tmp and leaves no orphan after success", async () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "state.json")
    await atomicWriteText(path, "v1\n")
    await atomicWriteText(path, "v2\n")
    expect(readFileSync(path, "utf-8")).toBe("v2\n")
    const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"))
    expect(leftovers).toEqual([])
  })

  it("atomicWriteText handles concurrent writes without clobbering tmp files", async () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "concurrent.json")
    await Promise.all([
      atomicWriteText(path, "content-1"),
      atomicWriteText(path, "content-2"),
      atomicWriteText(path, "content-3"),
    ])
    const finalContent = readFileSync(path, "utf-8")
    expect(["content-1", "content-2", "content-3"]).toContain(finalContent)
    const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"))
    expect(leftovers).toEqual([])
  })

  it.skipIf(process.platform === "win32")(
    "atomicWriteText cleans deterministic tmp when rename fails",
    async () => {
      dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
      chmodSync(dir, 0o555)
      const path = join(dir, "state.json")
      await expect(atomicWriteText(path, '{"v":2}\n')).rejects.toThrow()
      chmodSync(dir, 0o755)
      const leftovers = readdirSync(dir).filter((f) => f.endsWith(".tmp"))
      expect(leftovers).toEqual([])
      await cleanupDeterministicTmpAsync(path)
      expect(readdirSync(dir).filter((f) => f.endsWith(".tmp"))).toEqual([])
    },
  )

  it("cleanupDeterministicTmp removes a sync orphan", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "x.txt")
    const tmp = deterministicTmpPath(path)
    writeFileSync(tmp, "orphan")
    expect(existsSync(tmp)).toBe(true)
    cleanupDeterministicTmp(path)
    expect(existsSync(tmp)).toBe(false)
  })

  it("cleanupDeterministicTmp reclaims a tmp orphaned by a dead process", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "PLAN.md")
    // PID 2^22 is above the default pid_max on macOS/Linux and is never alive.
    const deadPid = 4194303
    const orphan = `${path}.${deadPid}.1700000000-abcdef12.tmp`
    writeFileSync(orphan, "stale")
    cleanupDeterministicTmp(path)
    expect(existsSync(orphan)).toBe(false)
  })

  // `sleep` is a coreutils binary; Windows has no `sleep.exe` and Bun.spawn
  // throws ENOENT synchronously for a missing binary, which would take the
  // whole file down instead of skipping this case.
  it.skipIf(process.platform === "win32")("cleanupDeterministicTmp keeps a tmp owned by another live process", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "PLAN.md")
    // A pid that is guaranteed alive but is not this test process: spawn a
    // real child and use its pid. The sweep must not touch its in-flight tmp.
    const child = Bun.spawn(["sleep", "10"])
    try {
      const foreign = `${path}.${child.pid}.1700000000-abcdef12.tmp`
      writeFileSync(foreign, "in-flight")
      cleanupDeterministicTmp(path)
      expect(existsSync(foreign)).toBe(true)
    } finally {
      child.kill()
    }
  })

  describe("orphan detection", () => {
    it("extracts the owning pid from both tmp shapes", () => {
      expect(tmpFilePid("PLAN.md.1234.1700000000-abcdef12.tmp")).toBe(1234)
      expect(tmpFilePid("PLAN.md.1234.tmp")).toBe(1234)
      expect(tmpFilePid("PLAN.md.tmp")).toBeNull()
      expect(tmpFilePid("other.txt")).toBeNull()
    })

    it("treats a dead owner as an orphan and a live owner as not", () => {
      expect(isOrphanTmpFile(`PLAN.md.${process.pid}.1700000000-abcdef12.tmp`)).toBe(false)
      expect(isOrphanTmpFile("PLAN.md.4194303.1700000000-abcdef12.tmp")).toBe(true)
      expect(isOrphanTmpFile("PLAN.md.tmp")).toBe(false)
    })

    it("matches any-pid tmp files only when the pid is given", () => {
      expect(isDeterministicTmpFile("PLAN.md.1234.1700000000-abcdef12.tmp", "PLAN.md")).toBe(true)
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp", "PLAN.md")).toBe(true)
      expect(isDeterministicTmpFile("PLAN.md.notapid.tmp", "PLAN.md")).toBe(false)
      expect(isDeterministicTmpFile("other.md.1234.tmp", "PLAN.md")).toBe(false)
    })
  })

  describe("isDeterministicTmpFile", () => {
    it("matches current randomized tmp file for target and pid", () => {
      expect(isDeterministicTmpFile("PLAN.md.1234.1700000000-abcdef12.tmp", "PLAN.md", 1234)).toBe(true)
    })

    it("matches legacy fixed tmp file for target and pid", () => {
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp", "PLAN.md", 1234)).toBe(true)
    })

    it("defaults pid to process.pid", () => {
      expect(isDeterministicTmpFile(`PLAN.md.${process.pid}.1700000000-abcdef12.tmp`, "PLAN.md")).toBe(true)
      expect(isDeterministicTmpFile(`PLAN.md.${process.pid}.tmp`, "PLAN.md")).toBe(true)
    })

    it("rejects file from different pid", () => {
      expect(isDeterministicTmpFile("PLAN.md.9999.1700000000-abcdef12.tmp", "PLAN.md", 1234)).toBe(false)
      expect(isDeterministicTmpFile("PLAN.md.12345.tmp", "PLAN.md", 123)).toBe(false)
    })

    it("rejects file from different base name", () => {
      expect(isDeterministicTmpFile("other.md.1234.1700000000-abcdef12.tmp", "PLAN.md", 1234)).toBe(false)
    })

    it("rejects file not ending with .tmp", () => {
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp.bak", "PLAN.md", 1234)).toBe(false)
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp~", "PLAN.md", 1234)).toBe(false)
    })

    it("safely rejects invalid inputs (empty strings, non-safe/non-positive pid)", () => {
      expect(isDeterministicTmpFile("", "PLAN.md", 1234)).toBe(false)
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp", "", 1234)).toBe(false)
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp", "PLAN.md", -1)).toBe(false)
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp", "PLAN.md", 0)).toBe(false)
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp", "PLAN.md", NaN)).toBe(false)
      expect(isDeterministicTmpFile("PLAN.md.1234.tmp", "PLAN.md", Infinity)).toBe(false)
    })
  })
})