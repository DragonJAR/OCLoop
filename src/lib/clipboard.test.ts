import { afterEach, describe, expect, it } from "bun:test"
import { mockCommandExists } from "./command-exists-mock"

// `mock.module` MUST be called before importing the module under test, so the
// import is hoisted to the top of the file by Bun's bundler. The factory
// reads from a mutable `commandExistsImpl` so individual tests can swap
// behavior between runs. The factory runs on each import of command-exists
// (cached), so the closure reference is stable.
//
// Bun's `Bun.spawn` does NOT inherit test-time mutations to `process.env`
// (verified: a child spawned in a test sees the original PATH, not the
// one set in beforeEach). That rules out PATH manipulation as a way to
// drive `commandExists` deterministically. The AGENTS.md § Testing
// constraints note about `mock.module` is JSX-transform specific (it bites
// @opentui/solid); clipboard.ts and command-exists.ts contain no JSX, so
// module-level mocking is safe here.
//
// Source: MEJORAS.md Finding 11.4.D.

let commandExistsImpl: (cmd: string) => Promise<boolean> = async () => false
const defaultResolveSpawnableImpl = async (cmd: string) =>
  (await commandExistsImpl(cmd)) ? cmd : null
let resolveSpawnableImpl: (cmd: string) => Promise<string | null> =
  defaultResolveSpawnableImpl

mockCommandExists({
  commandExists: (cmd: string) => commandExistsImpl(cmd),
  resolveSpawnable: (cmd: string) => resolveSpawnableImpl(cmd),
})

const { detectClipboardTool, copyToClipboard } = await import("./clipboard")

describe("detectClipboardTool (Finding 11.4.D)", () => {
  afterEach(() => {
    commandExistsImpl = async () => false
    resolveSpawnableImpl = defaultResolveSpawnableImpl
  })

  it(
    "returns pbcopy on darwin when pbcopy is on PATH",
    async () => {
      const descriptor = Object.getOwnPropertyDescriptor(process, "platform")
      Object.defineProperty(process, "platform", { value: "darwin" })
      try {
        commandExistsImpl = async (cmd) => cmd === "pbcopy"
        expect(await detectClipboardTool()).toEqual({ command: "pbcopy", args: [] })
      } finally {
        if (descriptor) Object.defineProperty(process, "platform", descriptor)
      }
    },
  )

  it(
    "returns clip on win32 when clip is on PATH",
    async () => {
      const descriptor = Object.getOwnPropertyDescriptor(process, "platform")
      Object.defineProperty(process, "platform", { value: "win32" })
      try {
        resolveSpawnableImpl = async (cmd) => cmd === "clip" ? String.raw`C:\Windows\System32\clip.exe` : null
        expect(await detectClipboardTool()).toEqual({
          command: String.raw`C:\Windows\System32\clip.exe`,
          args: [],
        })
      } finally {
        if (descriptor) Object.defineProperty(process, "platform", descriptor)
      }
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
    resolveSpawnableImpl = defaultResolveSpawnableImpl
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

  it("drains a full stderr stream before waiting for child exit", async () => {
    commandExistsImpl = async () => true
    resolveSpawnableImpl = async (cmd) => cmd
    const originalSpawn = Bun.spawn
    // stderr is only captured (hence drained) on darwin/win32; force it so the
    // test is host-independent (on Linux the impl uses stderr:"ignore").
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform")
    Object.defineProperty(process, "platform", { value: "darwin" })
    let finish!: (code: number) => void
    const exited = new Promise<number>((resolve) => { finish = resolve })
    let chunks = 0
    const stderr = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunks++ < 80) controller.enqueue(new Uint8Array(4096))
        else { controller.close(); finish(1) }
      },
    })
    Bun.spawn = (() => ({
      stdin: { write: async () => 5, end: async () => {} },
      stderr,
      exited,
      kill: () => {},
    })) as unknown as typeof Bun.spawn
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        copyToClipboard("hello"),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("clipboard deadlock")), 1000)
        }),
      ])
      expect(result.success).toBe(false)
    } finally {
      if (timeout) clearTimeout(timeout)
      if (descriptor) Object.defineProperty(process, "platform", descriptor)
      Bun.spawn = originalSpawn
    }
  })

  it("does not capture stderr on Linux (xclip/wl-copy keep the pipe open in the background)", async () => {
    commandExistsImpl = async () => true
    resolveSpawnableImpl = async (cmd) => cmd
    const originalSpawn = Bun.spawn
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform")
    let captured: { stderr?: unknown } | undefined
    Bun.spawn = ((_cmd: string[], opts: { stderr?: unknown }) => {
      captured = opts
      return {
        stdin: { write: async () => 5, end: async () => {} },
        // A pipe that never closes: reading it would hang forever.
        stderr: new ReadableStream<Uint8Array>({ start() {} }),
        exited: Promise.resolve(0),
        kill: () => {},
      }
    }) as unknown as typeof Bun.spawn
    Object.defineProperty(process, "platform", { value: "linux" })
    try {
      const result = await Promise.race([
        copyToClipboard("hello"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("clipboard hang")), 1000).unref?.(),
        ),
      ])
      expect(result.success).toBe(true)
      expect(captured?.stderr).toBe("ignore")
    } finally {
      if (descriptor) Object.defineProperty(process, "platform", descriptor)
      Bun.spawn = originalSpawn
    }
  })
})
