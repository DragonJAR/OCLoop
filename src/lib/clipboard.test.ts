import { afterEach, describe, expect, it, mock } from "bun:test"

// `mock.module` MUST be called before importing the module under test, so the
// import is hoisted to the top of the file by Bun's bundler. The factory
// reads from a mutable `commandExistsImpl` so individual tests can swap
// behavior between runs. The factory runs on each import of command-exists
// (cached), so the closure reference is stable.
//
// Bun's `Bun.spawn` does NOT inherit test-time mutations to `process.env`
// (verified: a child spawned in a test sees the original PATH, not the
// one set in beforeEach). That rules out PATH manipulation as a way to
// drive `commandExists` deterministically. The docs/testing.md warning
// about `mock.module` is JSX-transform specific (it bites @opentui/solid);
// clipboard.ts and command-exists.ts contain no JSX, so module-level
// mocking is safe here.
//
// Source: MEJORAS.md Finding 11.4.D.

let commandExistsImpl: (cmd: string) => Promise<boolean> = async () => false

mock.module("./command-exists", () => ({
  commandExists: (cmd: string) => commandExistsImpl(cmd),
}))

const { detectClipboardTool, copyToClipboard } = await import("./clipboard")

describe("detectClipboardTool (Finding 11.4.D)", () => {
  afterEach(() => {
    commandExistsImpl = async () => false
  })

  it.skipIf(process.platform !== "darwin")(
    "returns pbcopy on darwin when pbcopy is on PATH",
    async () => {
      commandExistsImpl = async (cmd) => cmd === "pbcopy"
      expect(await detectClipboardTool()).toEqual({
        command: "pbcopy",
        args: [],
      })
    },
  )

  it.skipIf(process.platform !== "win32")(
    "returns clip on win32 when clip is on PATH",
    async () => {
      commandExistsImpl = async (cmd) => cmd === "clip"
      expect(await detectClipboardTool()).toEqual({
        command: "clip",
        args: [],
      })
    },
  )

  it("returns null when no clipboard tool is on PATH", async () => {
    // All probes miss. Works on every platform because the platform check
    // happens BEFORE the commandExists probes.
    expect(await detectClipboardTool()).toBeNull()
  })
})

describe("copyToClipboard (Finding 11.4.D)", () => {
  afterEach(() => {
    commandExistsImpl = async () => false
  })

  it("returns { success: false } with a platform-specific hint when no tool is available", async () => {
    // Closes Finding 11.4.G (the per-platform hint) as a side-effect of
    // Mejora 39/40 — the error must name the platform's expected tool, not
    // just the Linux list.
    const result = await copyToClipboard("hello")
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    if (process.platform === "darwin") {
      expect(result.error).toContain("pbcopy")
    } else if (process.platform === "win32") {
      expect(result.error).toContain("clip.exe")
    } else {
      expect(result.error).toMatch(/wl-copy|xclip|xsel/)
    }
  })
})
