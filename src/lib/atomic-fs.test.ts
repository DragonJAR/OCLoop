import { afterEach, describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
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
  it("deterministicTmpPath uses pid suffix (B5)", () => {
    const target = join("/tmp", "plan.md")
    expect(deterministicTmpPath(target)).toBe(`${target}.${process.pid}.tmp`)
  })

  it("atomicWriteTextSync leaves no tmp on success", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "cfg.json")
    atomicWriteTextSync(path, '{"ok":true}\n')
    expect(readFileSync(path, "utf-8")).toBe('{"ok":true}\n')
    expect(existsSync(deterministicTmpPath(path))).toBe(false)
  })

  it("atomicWriteText uses deterministic tmp and leaves no orphan after success", async () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "state.json")
    await atomicWriteText(path, "v1\n")
    await atomicWriteText(path, "v2\n")
    expect(readFileSync(path, "utf-8")).toBe("v2\n")
    expect(existsSync(deterministicTmpPath(path))).toBe(false)
  })

  it.skipIf(process.platform === "win32")(
    "atomicWriteText cleans deterministic tmp when rename fails",
    async () => {
      dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
      chmodSync(dir, 0o555)
      const path = join(dir, "state.json")
      const tmp = deterministicTmpPath(path)
      await expect(atomicWriteText(path, '{"v":2}\n')).rejects.toThrow()
      chmodSync(dir, 0o755)
      expect(existsSync(tmp)).toBe(false)
      await cleanupDeterministicTmpAsync(path)
      expect(existsSync(tmp)).toBe(false)
    },
  )

  it("cleanupDeterministicTmp removes a sync orphan", () => {
    dir = mkdtempSync(join(tmpdir(), "atomic-fs-"))
    const path = join(dir, "x.txt")
    const tmp = deterministicTmpPath(path)
    writeFileSync(tmp, "orphan")
    cleanupDeterministicTmp(path)
    expect(existsSync(tmp)).toBe(false)
  })
})