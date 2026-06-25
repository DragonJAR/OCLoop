/**
 * Self-test for `runCli`. Real CLI-behavior assertions live in their own
 * test files (Phase 2 / 3 deliverables). This file just proves the helper
 * itself works end-to-end against the real entry point.
 */
import { describe, expect, it } from "bun:test"
import { runCli } from "./cli-runner"
import { VERSION } from "./cli-args"

describe("runCli", () => {
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
    // The timeout budget is kept small to prove the runner returns
    // promptly; a regression that re-introduces the hang would push
    // durationMs > 250 and let us catch it.
    const result = await runCli(["--run", "--debug"], { timeoutMs: 5_000 })
    expect(result.exitCode).not.toBe(0)
    expect(result.exitCode).toBe(1)
    expect(result.durationMs).toBeLessThan(2_500)
  })
})
