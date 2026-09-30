import { spawn } from "node:child_process"
import { resolveSpawnable } from "./command-exists"

export type OpencodeMajor = 1 | 2

/**
 * Parse the supported OpenCode version output forms without accepting another
 * CLI's version string by accident.
 */
export function parseOpencodeVersion(raw: string): OpencodeMajor | null {
  const value = raw.trim().toLowerCase()
  if (/^(?:opencode\s+)?v1\.x$/.test(value)) return 1

  const match = /^(?:opencode\s+)?v?([12])(?:\.\d+)+(?:[-+][0-9a-z.-]+)?$/.exec(value)
  if (!match) return null
  return Number(match[1]) as OpencodeMajor
}

const VERSION_TIMEOUT_MS = 5_000
const WINDOWS_SHELL_SHIM_RE = /\.(cmd|bat|ps1)$/i

interface SpawnTarget {
  command: string
  shell: boolean
}

async function getSpawnTarget(): Promise<SpawnTarget | null> {
  if (process.platform !== "win32") {
    return { command: "opencode", shell: false }
  }

  const resolved = await resolveSpawnable("opencode")
  if (!resolved) return null
  const shell = WINDOWS_SHELL_SHIM_RE.test(resolved)
  return {
    command: shell ? `"${resolved}"` : resolved,
    shell,
  }
}

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
      let output = ""
      let settled = false

      const settle = (version: OpencodeMajor | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(version)
      }

      const timer = setTimeout(() => {
        try {
          proc.kill()
        } catch {
          // Best-effort cleanup of a version probe that exceeded its deadline.
        }
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
        if (output.length < 4096) output += chunk.toString().slice(0, 4096 - output.length)
      })
      proc.stderr?.on("data", (chunk: Buffer | string) => {
        if (output.length < 4096) output += chunk.toString().slice(0, 4096 - output.length)
      })
      proc.on("error", () => settle(null))
      proc.on("close", (code) => {
        settle(code === 0 ? parseOpencodeVersion(output) : null)
      })
    })
  } catch {
    return null
  }
}
