/**
 * Subprocess runner for the OCLoop CLI.
 *
 * Why a subprocess instead of importing `src/index.tsx`:
 * - `index.tsx` runs `main().catch(...)` at module top-level. Importing it
 *   inside `bun test` executes that, which reaches `render(() => <App />)`
 *   and segfaults Bun because the test runner has no TTY (the same panic
 *   documented in PLAN.md task 2 / case 4 of the flow matrix).
 * - The TUI-bound code paths (default loop, `--debug`, `--run`) can't be
 *   exercised in-process today. Headless paths (`--help`, `--version`,
 *   `--create-plan`, `validatePrerequisites` errors) DO run cleanly when
 *   spawned as a child with `stdin: null`, so this helper covers the
 *   pre-TUI behavior we need for Phase 2 / Phase 3.
 *
 * What the helper does NOT do:
 * - It does not emulate a TTY. TUI assertions remain a future problem;
 *   this runner just returns whatever exit code the child produced (139
 *   for SIGSEGV) so tests can pin the current behavior until the Phase 3
 *   non-TTY pre-flight fix lands.
 * - It does not isolate the process group (no setsid). The child shares
 *   the parent's signals; a parent abort will leave a zombie until the
 *   timeout fires. Acceptable for a test helper.
 *
 * ponytail: one `Bun.spawn` call, four knobs (env, cwd, stdin, timeout).
 * The previous inline pattern in `cli-args.test.ts` is for unit-level
 * stubs; this file is its subprocess twin. Keep them separate.
 */

export interface CliRunResult {
  stdout: string
  stderr: string
  exitCode: number
  /** Wall-clock from spawn to child exit (or timeout kill). */
  durationMs: number
}

export interface CliRunOptions {
  /** Extra env vars, merged on top of process.env. */
  env?: Record<string, string>
  /** Working directory. Defaults to process.cwd(). */
  cwd?: string
  /** Stdin payload. Pass `null` to close stdin (triggers EOF for prompt()). */
  stdin?: string | null
  /** Max ms to wait before killing the child. Defaults to 10_000. */
  timeoutMs?: number
  /** Entry point relative to cwd. Defaults to "src/index.tsx". */
  entrypoint?: string
}

const DEFAULT_ENTRYPOINT = "src/index.tsx"
const DEFAULT_TIMEOUT_MS = 10_000
/** Conventional timeout-kill exit code (matches `timeout(1)`). */
const TIMEOUT_EXIT_CODE = 124

export async function runCli(
  argv: string[],
  options: CliRunOptions = {},
): Promise<CliRunResult> {
  const start = Date.now()
  const env = { ...process.env, ...(options.env ?? {}) }
  const cwd = options.cwd ?? process.cwd()
  const entrypoint = options.entrypoint ?? DEFAULT_ENTRYPOINT
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const proc = Bun.spawn({
    cmd: ["bun", "run", entrypoint, ...argv],
    env,
    cwd,
    stdin:
      options.stdin === null
        ? null
        : new Blob([options.stdin ?? ""]).stream(),
    stdout: "pipe",
    stderr: "pipe",
  })

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      proc.kill()
    } catch {
      // Already exited — kill throws on a dead handle, safe to ignore.
    }
  }, timeoutMs)

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return {
      stdout,
      stderr,
      exitCode: timedOut ? TIMEOUT_EXIT_CODE : exitCode,
      durationMs: Date.now() - start,
    }
  } finally {
    clearTimeout(timer)
  }
}
