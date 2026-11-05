import { spawn } from "node:child_process"
import { resolveSpawnable, isWindowsShellShim } from "./command-exists"
import { killTree } from "./kill-tree"
import { splitLines } from "./text"

export type OpencodeMajor = 1 | 2

/**
 * Parse the supported OpenCode version output forms without accepting another
 * CLI's version string by accident. Supports multi-line output where warnings
 * or shell banners precede or follow the version string.
 */
export function parseOpencodeVersion(raw: string): OpencodeMajor | null {
  for (const line of splitLines(raw)) {
    const value = line.trim().toLowerCase()
    if (!value) continue
    if (/^(?:opencode\s+)?v1\.x$/.test(value)) return 1

    const match = /^(?:opencode\s+)?v?([12])(?:\.\d+)+(?:[-+][0-9a-z.-]+)?$/.exec(value)
    if (match) return Number(match[1]) as OpencodeMajor
  }
  return null
}

const VERSION_TIMEOUT_MS = 5_000

interface SpawnTarget {
  command: string
  shell: boolean
}

/**
 * Resolve how to spawn the `opencode` binary on this platform.
 *
 * Single source of truth shared with `opencode-server.ts` (server launcher):
 * POSIX spawns the bare name on PATH; Windows resolves the shim path and
 * quotes it when the shim needs a shell. Returns `null` on Windows when the
 * binary cannot be resolved — the version detector surfaces that as "not
 * found"; the server launcher falls back to the bare name.
 */
export async function getOpencodeSpawnTarget(): Promise<SpawnTarget | null> {
  if (process.platform !== "win32") {
    return { command: "opencode", shell: false }
  }

  const resolved = await resolveSpawnable("opencode")
  if (!resolved) return null
  const shell = isWindowsShellShim(resolved)
  return {
    command: shell ? `"${resolved}"` : resolved,
    shell,
  }
}

const getSpawnTarget = getOpencodeSpawnTarget

/**
 * Best-effort version detection. A missing binary, unexpected output, spawn
 * error, or timeout returns null and never prevents the server launcher from
 * starting.
 */
export async function detectOpencodeVersion(): Promise<OpencodeMajor | null> {
  try {
    const target = await getSpawnTarget()
    if (!target) return null

    return await new Promise<OpencodeMajor | null>((resolve) => {
      let proc: ReturnType<typeof spawn>
      let stdout = ""
      let stderr = ""
      let settled = false

      const settle = (version: OpencodeMajor | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(version)
      }

      const timer = setTimeout(() => {
        // Tree kill: with a Windows `.cmd` shim, proc.kill() would only end
        // the cmd.exe wrapper and orphan the real opencode process.
        if (proc) killTree(proc)
        settle(null)
      }, VERSION_TIMEOUT_MS)

      try {
        proc = spawn(target.command, ["--version"], {
          shell: target.shell,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        })
      } catch {
        settle(null)
        return
      }

      proc.stdout?.on("data", (chunk: Buffer | string) => {
        if (stdout.length < 4096) stdout += chunk.toString().slice(0, 4096 - stdout.length)
      })
      proc.stderr?.on("data", (chunk: Buffer | string) => {
        if (stderr.length < 4096) stderr += chunk.toString().slice(0, 4096 - stderr.length)
      })
      proc.on("error", () => settle(null))
      proc.on("close", (code) => {
        settle(code === 0 ? parseOpencodeVersion(stdout) ?? parseOpencodeVersion(stderr) : null)
      })
    })
  } catch {
    return null
  }
}
