import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureGitignore } from "./project"
import { log } from "./debug-logger"

describe("ensureGitignore", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ocloop-project-test-"))
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("creates .gitignore with .loop* entry when file does not exist", async () => {
    await ensureGitignore(tempDir)

    const gitignore = Bun.file(join(tempDir, ".gitignore"))
    expect(await gitignore.exists()).toBe(true)
    expect(await gitignore.text()).toBe(".loop*\n")
  })

  it("appends .loop* to an existing .gitignore that has no trailing newline", async () => {
    const gitignorePath = join(tempDir, ".gitignore")
    writeFileSync(gitignorePath, "node_modules", "utf-8")

    await ensureGitignore(tempDir)

    const gitignore = Bun.file(gitignorePath)
    expect(await gitignore.text()).toBe("node_modules\n.loop*\n")
  })

  it("appends .loop* to an existing .gitignore that already ends with newline", async () => {
    const gitignorePath = join(tempDir, ".gitignore")
    writeFileSync(gitignorePath, "node_modules\ndist/\n", "utf-8")

    await ensureGitignore(tempDir)

    const gitignore = Bun.file(gitignorePath)
    expect(await gitignore.text()).toBe("node_modules\ndist/\n.loop*\n")
  })

  it("does not duplicate .loop* if already present in .gitignore", async () => {
    const gitignorePath = join(tempDir, ".gitignore")
    const initialContent = "node_modules\n.loop*\ndist/\n"
    writeFileSync(gitignorePath, initialContent, "utf-8")

    await ensureGitignore(tempDir)

    const gitignore = Bun.file(gitignorePath)
    expect(await gitignore.text()).toBe(initialContent)
  })

  it("recognizes existing .loop* with CRLF line endings without duplicating", async () => {
    const gitignorePath = join(tempDir, ".gitignore")
    const initialContent = "node_modules\r\n.loop*\r\ndist/\r\n"
    writeFileSync(gitignorePath, initialContent, "utf-8")

    await ensureGitignore(tempDir)

    const gitignore = Bun.file(gitignorePath)
    expect(await gitignore.text()).toBe(initialContent)
  })

  it("never throws and logs warning when directory or file cannot be written (best-effort)", async () => {
    const warnSpy = mock((..._args: Parameters<typeof log.warn>) => {})
    const originalWarn = log.warn
    log.warn = warnSpy

    try {
      // Passing an invalid or non-writable path (e.g. non-existent nested directory)
      const invalidDir = join(tempDir, "non_existent_folder", "sub")
      await expect(ensureGitignore(invalidDir)).resolves.toBeUndefined()
      expect(warnSpy).toHaveBeenCalled()
    } finally {
      log.warn = originalWarn
    }
  })
})
