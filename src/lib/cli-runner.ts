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
 *   timeout fires. On timeout the runner tree-kills the child (killTree:
 *   taskkill /t on Windows) and escalates to SIGKILL after a 1s grace so a
 *   signal-ignoring child cannot hang the await forever. A grandchild that
 *   inherited the stdio pipes can outlive the child and keep them open, so
 *   stdout/stderr are read with a deadline after the child exits instead of
 *   waiting for an EOF that may never come. Acceptable for a test helper.
 *
 * ponytail: one `Bun.spawn` call, four knobs (env, cwd, stdin, timeout).
 * The previous inline pattern in `cli-args.test.ts` is for unit-level
 * stubs; this file is its subprocess twin. Keep them separate.
 */

import { MAX_TIMEOUT_MS } from "./constants"
import { stripEnvKey } from "./env"
import { killTree, killTreeSync } from "./kill-tree"

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
/** Grace period between SIGTERM and SIGKILL escalation on timeout. */
const KILL_GRACE_MS = 1_000
/** Conventional timeout-kill exit code (matches `timeout(1)`). */
const TIMEOUT_EXIT_CODE = 124
/** How long to keep reading a pipe after the child exited before giving up on EOF. */
export const PIPE_DRAIN_MS = 1_000

/**
 * Read `stream` to EOF, but stop `drainMs` after `exited` settles: a
 * grandchild that inherited the pipe can hold it open long after the child
 * died, and awaiting its EOF would hang the caller. Returns what was read.
 */
export async function readUntilExitDrained(
  stream: ReadableStream<Uint8Array>,
  exited: Promise<unknown>,
  drainMs: number = PIPE_DRAIN_MS,
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ""
  let finished = false
  const pump = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        out += decoder.decode(value, { stream: true })
      }
    } catch {
      // Cancelled below or the pipe broke: keep what was read.
    } finally {
      finished = true
    }
  })()
  let drainTimer: ReturnType<typeof setTimeout> | undefined
  const drained = exited.then(
    () => new Promise<void>((resolve) => { drainTimer = setTimeout(resolve, drainMs) }),
  )
  await Promise.race([pump, drained])
  if (drainTimer !== undefined) clearTimeout(drainTimer)
  if (!finished) {
    await reader.cancel().catch(() => {})
  }
  return out + decoder.decode()
}

/**
 * The child env: process.env with `extra` on top. On win32 env keys are
 * case-insensitive but the spread is a plain object, so an override such as
 * `{ path: "..." }` would ship NEXT TO the inherited `Path`; every casing
 * variant of an overridden key is dropped first. POSIX keys are
 * case-sensitive and merge as before.
 */
export function buildChildEnv(
  extra: Record<string, string> = {},
  base: Record<string, string | undefined> = process.env,
  platform: string = process.platform,
): Record<string, string | undefined> {
  const env = { ...base }
  if (platform === "win32") {
    for (const key of Object.keys(extra)) stripEnvKey(env, key)
  }
  return Object.assign(env, extra)
}

export async function runCli(
  argv: string[],
  options: CliRunOptions = {},
): Promise<CliRunResult> {
  const start = Date.now()
  const env = buildChildEnv(options.env)
  const cwd = options.cwd ?? process.cwd()
  const entrypoint = options.entrypoint ?? DEFAULT_ENTRYPOINT
  const rawTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.min(rawTimeout, MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS

  const proc = Bun.spawn({
    cmd: [process.execPath, "run", entrypoint, ...argv],
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
  let killEscalation: ReturnType<typeof setTimeout> | undefined
  const timer = setTimeout(() => {
    timedOut = true
    // Tree kill (never throws; skips an exited child): SIGTERM first so a
    // well-behaved child can flush, taskkill /t on Windows so a shim's
    // descendants die too.
    killTree(proc)
    // Escalation: a child that traps/ignores SIGTERM would otherwise leave
    // `proc.exited` (and the await below) pending forever. SIGKILL cannot be
    // ignored, so the await always settles (with the timeout exit code, not
    // the child's).
    killEscalation = setTimeout(() => killTreeSync(proc), KILL_GRACE_MS)
  }, timeoutMs)

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      readUntilExitDrained(proc.stdout, proc.exited),
      readUntilExitDrained(proc.stderr, proc.exited),
    ])
    return {
      stdout,
      stderr,
      exitCode: timedOut ? TIMEOUT_EXIT_CODE : exitCode,
      durationMs: Date.now() - start,
    }
  } finally {
    clearTimeout(timer)
    if (killEscalation !== undefined) clearTimeout(killEscalation)
  }
}
