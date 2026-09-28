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
})