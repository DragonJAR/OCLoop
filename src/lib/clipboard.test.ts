import { afterEach, describe, expect, it, mock } from "bun:test"
import { mockCommandExists } from "./command-exists-mock"
import { withPlatform } from "./test-helpers/with-platform"
import { withSystemRoot } from "./test-helpers/with-system-root"

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

// clip.exe is gated by an absolute System32 existence check, never PATH.
// Default false so "no clipboard tool" means the same on every host (a real
// Windows runner has C:\Windows\System32\clip.exe).
let systemBinaryExistsImpl: (name: string) => boolean = () => false

mockCommandExists({
  commandExists: (cmd: string) => commandExistsImpl(cmd),
  resolveSpawnable: (cmd: string) => resolveSpawnableImpl(cmd),
  systemBinaryExists: (name: string) => systemBinaryExistsImpl(name),
})

const { detectClipboardTool, copyToClipboard } = await import("./clipboard")

describe("detectClipboardTool (Finding 11.4.D)", () => {
  afterEach(() => {
    commandExistsImpl = async () => false
    resolveSpawnableImpl = defaultResolveSpawnableImpl
    systemBinaryExistsImpl = () => false
  })

  it("returns pbcopy on darwin when pbcopy is on PATH", async () => {
    commandExistsImpl = async (cmd) => cmd === "pbcopy"
    expect(await withPlatform("darwin", () => detectClipboardTool())).toEqual({
      command: "pbcopy",
      args: [],
    })
  })

  it("returns clip.exe by absolute System32 path on win32 (no PATH lookup)", async () => {
    await withSystemRoot("C:\\Windows", async () => {
      // Even when the PATH lookup would drop it (cwd = System32, elevated).
      resolveSpawnableImpl = async () => null
      systemBinaryExistsImpl = (name) => name === "clip"
      expect(await withPlatform("win32", () => detectClipboardTool())).toEqual({
        command: String.raw`C:\Windows\System32\clip.exe`,
        args: [],
      })
    })
  })

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
    systemBinaryExistsImpl = () => false
  })

  // Closes Finding 11.4.G (the per-platform hint) as a side-effect of
  // Mejora 39/40 — the error must name the platform's expected tool, not just
  // the Linux list. Pinned per platform so every host checks all three hints.
  it("darwin: no tool -> { success: false } naming pbcopy", async () => {
    const result = await withPlatform("darwin", () => copyToClipboard("hello"))
    expect(result.success).toBe(false)
    expect(result.error).toContain("pbcopy")
  })

  it("win32: System32 clip.exe missing -> { success: false } naming clip.exe", async () => {
    const result = await withPlatform("win32", () => copyToClipboard("hello"))
    expect(result.success).toBe(false)
    expect(result.error).toContain("clip.exe")
  })

  it("win32: spawns System32 clip.exe by absolute path and reports its failure", async () => {
    systemBinaryExistsImpl = (name) => name === "clip"
    const originalSpawn = Bun.spawn
    const spawned: string[][] = []
    Bun.spawn = ((cmd: string[]) => {
      spawned.push(cmd)
      throw new Error("spawn clip failed")
    }) as unknown as typeof Bun.spawn
    try {
      const result = await withPlatform("win32", () => copyToClipboard("hello"))
      expect(result).toEqual({ success: false, error: "spawn clip failed" })
      expect(spawned[0]?.[0]).toMatch(/[\\/]System32[\\/]clip\.exe$/)
    } finally {
      Bun.spawn = originalSpawn
    }
  })

  it("linux: no tool -> { success: false } naming wl-copy/xclip/xsel", async () => {
    const result = await withPlatform("linux", () => copyToClipboard("hello"))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/wl-copy|xclip|xsel/)
  })

  it("drains a full stderr stream before waiting for child exit", async () => {
    commandExistsImpl = async () => true
    resolveSpawnableImpl = async (cmd) => cmd
    const originalSpawn = Bun.spawn
    // stderr is only captured (hence drained) on darwin/win32; force it so the
    // test is host-independent (on Linux the impl uses stderr:"ignore").
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
        withPlatform("darwin", () => copyToClipboard("hello")),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("clipboard deadlock")), 1000)
        }),
      ])
      expect(result.success).toBe(false)
    } finally {
      if (timeout) clearTimeout(timeout)
      Bun.spawn = originalSpawn
    }
  })

  it("does not capture stderr on Linux (xclip/wl-copy keep the pipe open in the background)", async () => {
    commandExistsImpl = async () => true
    resolveSpawnableImpl = async (cmd) => cmd
    const originalSpawn = Bun.spawn
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
    try {
      const result = await Promise.race([
        withPlatform("linux", () => copyToClipboard("hello")),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("clipboard hang")), 1000).unref?.(),
        ),
      ])
      expect(result.success).toBe(true)
      expect(captured?.stderr).toBe("ignore")
    } finally {
      Bun.spawn = originalSpawn
    }
  })
})

describe("copyToClipboard timeout (T10-B P9)", () => {
  afterEach(() => {
    commandExistsImpl = async () => false
    resolveSpawnableImpl = defaultResolveSpawnableImpl
    systemBinaryExistsImpl = () => false
  })

  it("a hung tool is killed and reported instead of freezing the caller", async () => {
    commandExistsImpl = async () => true
    const originalSpawn = Bun.spawn
    const kill = mock(() => {})
    Bun.spawn = (() => ({
      // stdin accepts the write, but the tool never exits.
      stdin: { write: async () => 5, end: async () => {} },
      stderr: new ReadableStream<Uint8Array>({ start() {} }),
      exited: new Promise<number>(() => {}),
      kill,
    })) as unknown as typeof Bun.spawn
    try {
      const started = Date.now()
      const result = await withPlatform("darwin", () => copyToClipboard("hello", 50))
      expect(result.success).toBe(false)
      expect(result.error).toContain("did not finish")
      expect(kill).toHaveBeenCalled()
      expect(Date.now() - started).toBeLessThan(2_000)
    } finally {
      Bun.spawn = originalSpawn
    }
  })
})
