/**
 * Run a rendering scenario in a child process.
 *
 * bun:test does not apply the project's Solid JSX transform: a test that
 * imports a .tsx component in-process fails to compile, because Bun falls
 * back to its own automatic JSX runtime (`jsxDEV`) and @opentui/solid does
 * not export it. A child `bun run` process gets the preload — and with it the
 * transform — so the scenario host stays a plain .ts module (no JSX) and the
 * render happens where the renderer actually works.
 *
 * Both UI suites use this: the TUI regression scenarios and the dialog
 * layout measurements.
 */
import { fileURLToPath } from "node:url"

/** Result of a scenario run in a child process. */
export interface RenderScenarioResult {
  /** Exit code of the child. */
  code: number
  /** Everything the child wrote to stdout. */
  stdout: string
  /** Everything the child wrote to stderr. */
  stderr: string
  /** stdout + stderr, for a single assertion. */
  output: string
  /** The parsed contents of the file the child was asked to write, if any. */
  data?: unknown
}

/** Environment flag that tells the scenario host it runs as a scenario. */
export const SCENARIO_ENV = "OCLOOP_UI_SCENARIO"

/**
 * Absolute path of the repository root, derived from this file's location.
 *
 * The expression was repeated in every test that spawns a process: it is the
 * cwd those children need (the project's bunfig.toml, its node_modules and
 * its source tree all live there), and a copy that drifts is a child that
 * silently starts in the wrong directory.
 */
export function repoRoot(): string {
  return fileURLToPath(new URL("../..", import.meta.url))
}

/**
 * Spawn `file` as a scenario and collect its output.
 *
 * @param opts.file      The .ts module that hosts the scenario.
 * @param opts.scenario  The scenario name; the host reads it from argv[2].
 * @param opts.env       Extra environment variables for the child.
 * @param opts.cwd       Working directory; defaults to the repository root.
 * @param opts.timeoutMs Kill the child after this long (default 30s).
 */
export async function runRenderScenario(opts: {
  file: string
  scenario: string
  env?: Record<string, string>
  cwd?: string
  timeoutMs?: number
  /**
   * File the child should write its result to. Preferred over stdout for
   * structured data: on Windows the native renderer writes its frames to the
   * child's stdout (it writes to the file descriptor, bypassing the JS
   * sink), so anything parsed out of stdout has to survive the frames.
   */
  resultFile?: string
}): Promise<RenderScenarioResult> {
  const child = Bun.spawn([process.execPath, "run", opts.file, opts.scenario], {
    cwd: opts.cwd ?? repoRoot(),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, [SCENARIO_ENV]: "1", ...opts.env },
  })

  const timeoutMs = opts.timeoutMs ?? 30_000
  const killer = setTimeout(() => {
    try {
      child.kill()
    } catch {
      // already gone
    }
  }, timeoutMs)

  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    let data: unknown
    if (opts.resultFile) {
      const text = await Bun.file(opts.resultFile).text().catch(() => "")
      if (text.trim()) {
        try {
          data = JSON.parse(text.trim())
        } catch {
          data = undefined
        }
      }
    }
    return { code, stdout, stderr, output: stdout + stderr, data }
  } finally {
    clearTimeout(killer)
  }
}
