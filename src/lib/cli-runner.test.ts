/**
 * Self-test for `runCli`. Real CLI-behavior assertions live in their own
 * test files (Phase 2 / 3 deliverables). This file just proves the helper
 * itself works end-to-end against the real entry point.
 */
import { describe, expect, it } from "bun:test"
import { buildChildEnv, readUntilExitDrained, runCli } from "./cli-runner"
import { VERSION } from "./cli-args"

describe("runCli", () => {
  it("runs with a PATH that cannot resolve a bare bun name", async () => {
    const result = await runCli(["--version"], { env: { PATH: "/definitely-not-a-bin-directory" } })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("ocloop ")
  })
  it("--version prints the version string on stdout and exits 0", async () => {
    const result = await runCli(["--version"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(`ocloop ${VERSION}`)
    expect(result.stderr).toBe("")
  })

  it("--help prints usage to stdout, exits 0, does not write to stderr", async () => {
    const result = await runCli(["--help"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Usage: ocloop")
    expect(result.stdout).toContain("--help")
    expect(result.stderr).toBe("")
  })

  it("captures stderr and exit 1 for an unknown flag", async () => {
    const result = await runCli(["--totally-unknown"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("unknown argument")
    expect(result.stderr).toContain("--totally-unknown")
  })

  it("closes stdin when stdin: null (--create-plan with EOF exits non-zero)", async () => {
    // --create-plan calls `prompt()` which reads stdin; with stdin closed
    // it returns null → the no-goal path runs. Exact exit code is whatever
    // the no-goal branch produces (1 today); we just need the helper to
    // not hang and to deliver EOF correctly.
    const result = await runCli(["--create-plan", "--lang", "en"], { stdin: null })
    expect(result.exitCode).not.toBe(0)
  })

  it("respects the timeout option when the child hangs", async () => {
    // Before the Phase 3 non-TTY guard, `--run --debug` in a non-TTY
    // helper would segfault (139) or hang until the timeout killed it
    // (124). The guard now makes that path exit 1 cleanly with an
    // `errNoTty` message before the timeout ever fires. We assert the
    // child still does NOT exit 0 within the timeout budget, but the
    // exact code is now 1 (clean exit) rather than 124/139 (timeout/segv).
    const timeoutMs = 5_000
    const result = await runCli(["--run", "--debug"], { timeoutMs })
    expect(result.exitCode).not.toBe(0)
    expect(result.exitCode).toBe(1)
    // A hang reaches this exact timeout budget; startup latency may vary under load.
    expect(result.durationMs).toBeLessThan(timeoutMs)
  })

  it("clamps delays > 2^31 - 1 to MAX_TIMEOUT_MS avoiding premature kill", async () => {
    const result = await runCli(["--version"], { timeoutMs: 1e12 })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("ocloop ")
  })
})

describe("buildChildEnv (T10-B P4)", () => {
  it("win32: an override replaces every casing of the inherited key", () => {
    const env = buildChildEnv({ path: "C:\\new" }, { Path: "C:\\old", HOME: "h" }, "win32")
    expect(env).toEqual({ path: "C:\\new", HOME: "h" })
  })

  it("POSIX: keys are case-sensitive, so both spellings are kept", () => {
    const env = buildChildEnv({ path: "/new" }, { PATH: "/old" }, "linux")
    expect(env).toEqual({ PATH: "/old", path: "/new" })
  })
})

describe("readUntilExitDrained (T10-B P9/P2)", () => {
  const encode = (text: string) => new TextEncoder().encode(text)

  it("returns what was read once the child exited, even if the pipe never closes", async () => {
    // A grandchild that inherited the pipe keeps it open forever.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode("partial output"))
      },
    })
    const started = Date.now()
    const text = await readUntilExitDrained(stream, Promise.resolve(0), 30)
    expect(text).toBe("partial output")
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it("reads to EOF normally when the pipe closes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encode("all "))
        controller.enqueue(encode("of it"))
        controller.close()
      },
    })
    expect(await readUntilExitDrained(stream, new Promise(() => {}), 30)).toBe("all of it")
  })
})
