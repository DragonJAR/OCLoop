/**
 * Embedded OpenCode server launcher.
 *
 * On macOS/Linux this delegates VERBATIM to the SDK's `createOpencodeServer`,
 * so non-Windows behavior is byte-identical to before — this module cannot
 * regress those systems.
 *
 * ONLY on Windows do we take over. The SDK (`@opencode-ai/sdk/dist/server.js`)
 * spawns the bare command `opencode` with no shell and no path option. On
 * Windows that fails with `uv_spawn 'opencode' ENOENT` even when
 * `opencode --version` works in the user's shell, because `spawn` without a
 * shell can't resolve a `.cmd`/`.ps1` shim (CreateProcess only appends `.exe`)
 * the way the shell does. Since the SDK exposes no way to configure its spawn,
 * we mirror its bootstrap exactly but spawn opencode's RESOLVED full path —
 * spawning a native `.exe` directly (so `proc` IS opencode and `close()` kills
 * it cleanly), and using a shell only for a Windows shim.
 *
 * The Windows bootstrap below is a faithful copy of the SDK's
 * `createOpencodeServer` (args, env, the "opencode server listening on <url>"
 * stdout parse, and the timeout/exit/error/abort handlers) — only the spawn
 * differs. If the SDK ever changes that "listening" line, mirror it here.
 */

import { spawn } from "node:child_process"
import { createOpencodeServer, type ServerOptions } from "@opencode-ai/sdk/server"
import type { Config } from "@opencode-ai/sdk"
import { resolveCommandPath } from "./command-exists"
import { PERMISSION_TOOLS, type PermissionsConfig } from "./config"

/** Handle returned by the launcher (matches the SDK's return shape). */
export interface OpencodeServer {
  url: string
  close: () => void
}

const WIN_SHELL_SHIM_RE = /\.(cmd|bat|ps1)$/i

type ServerProcess = ReturnType<typeof spawn>

/**
 * Options for {@link startOpencodeServer}. Extends the SDK's `ServerOptions`
 * with `permissions`, a per-tool autonomous-approval map (true/absent → allow,
 * false → OpenCode's interactive default). Omitted means fully autonomous —
 * used by `--create-plan`, which is headless and must never block.
 */
export interface StartOpencodeServerOptions extends ServerOptions {
  permissions?: Partial<PermissionsConfig>
}

/**
 * Build the OpenCode `permission` block for the autonomous loop.
 *
 * OCLoop is unattended: nothing answers an interactive confirmation, so any
 * tool OpenCode would "ask" about (edit, bash, webfetch, …) hangs the iteration
 * forever. Read-only tools never ask, so the {@link PERMISSION_TOOLS} set is the
 * complete list that can block. For each tool, `true` (or absent, the default)
 * → `"allow"` (auto-approve); `false` → the field is OMITTED so OpenCode falls
 * back to its own policy (`ask`/interactive) for that tool.
 *
 * This is applied via OPENCODE_CONFIG_CONTENT, which OpenCode loads at the
 * HIGHEST precedence (after opencode.json) — so an emitted `"allow"` OVERRIDES
 * the matching permission in the user's opencode.json. A tool dropped to `false`
 * here is OMITTED (no conflicting key), so the user's opencode.json setting for
 * it is preserved — that (not a `deny` in opencode.json while the tool stays
 * enabled here) is how a user keeps a tool interactive/denied under OCLoop.
 */
export function buildPermissionConfig(
  enabled?: Partial<PermissionsConfig>,
): NonNullable<Config["permission"]> {
  const permission: NonNullable<Config["permission"]> = {}
  for (const tool of PERMISSION_TOOLS) {
    // Absent or true → autonomous allow; only an explicit false falls back to
    // OpenCode's interactive default for that tool.
    if (enabled?.[tool] !== false) {
      permission[tool] = "allow"
    }
  }
  return permission
}

/**
 * Merge the autonomous permission policy into `options`. `enabled`, when given,
 * lets a caller drop specific tools back to OpenCode's interactive default;
 * omitted means fully autonomous (all five allowed) — equivalent to
 * `buildPermissionConfig()` with no args.
 */
function withAutonomousPermissions(
  options: ServerOptions,
  enabled?: Partial<PermissionsConfig>,
): ServerOptions {
  return {
    ...options,
    config: {
      ...options.config,
      permission: {
        ...options.config?.permission,
        ...buildPermissionConfig(enabled),
      },
    },
  }
}

function isWindowsShellShim(command: string): boolean {
  return WIN_SHELL_SHIM_RE.test(command)
}

function killServerProcess(proc: ServerProcess, killTree: boolean): void {
  if (killTree && process.platform === "win32" && proc.pid) {
    try {
      const killer = spawn("taskkill", ["/pid", String(proc.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      })
      killer.on("error", () => {
        try {
          proc.kill()
        } catch {
          // Best-effort cleanup only.
        }
      })
      return
    } catch {
      // Fall through to killing the direct process handle.
    }
  }

  try {
    proc.kill()
  } catch {
    // Best-effort cleanup only.
  }
}

export async function startOpencodeServer(
  options: StartOpencodeServerOptions = {},
): Promise<OpencodeServer> {
  // Force the autonomous permission policy once, here, so the "never blocks on
  // a confirmation" invariant holds regardless of which caller spawns the
  // server. Both the SDK delegation below and the Windows bootstrap serialize
  // `config` the same way, so merging once covers both paths.
  const merged = withAutonomousPermissions(options, options.permissions)

  // macOS / Linux: go through the SDK exactly as before.
  if (process.platform !== "win32") {
    return createOpencodeServer(merged)
  }

  // --- Windows-only path ---
  const hostname = merged.hostname ?? "127.0.0.1"
  const port = merged.port ?? 4096
  const timeout = merged.timeout ?? 5000
  const config = merged.config

  const args = ["serve", `--hostname=${hostname}`, `--port=${port}`]
  const logLevel = (config as { logLevel?: string } | undefined)?.logLevel
  if (logLevel) args.push(`--log-level=${logLevel}`)

  // Resolve opencode's real path. A native `.exe` (the official installer) is
  // spawned directly (no shell) so the kill in close() reaps opencode itself.
  // A `.cmd`/`.bat`/`.ps1` shim (npm install) needs a shell; quote the path so
  // a directory with spaces still works. Fall back to the bare name if
  // resolution fails — same behavior (and same error) the SDK had.
  const resolved = await resolveCommandPath("opencode")
  const bin = resolved ?? "opencode"
  const useShell = isWindowsShellShim(bin)
  const command = useShell ? `"${bin}"` : bin

  const proc = spawn(command, args, {
    signal: merged.signal,
    shell: useShell,
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(config ?? {}),
    },
  })

  const url = await new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let output = ""
    let settled = false
    let abortHandler = () => {}

    const clearStartupTimer = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    const settle = (): boolean => {
      if (settled) return false
      settled = true
      clearStartupTimer()
      merged.signal?.removeEventListener("abort", abortHandler)
      return true
    }

    const rejectStartup = (error: Error, kill: boolean) => {
      if (!settle()) return
      if (kill) killServerProcess(proc, useShell)
      reject(error)
    }

    const resolveStartup = (serverUrl: string) => {
      if (!settle()) return
      resolve(serverUrl)
    }

    abortHandler = () => {
      rejectStartup(new Error("Aborted"), true)
    }

    timer = setTimeout(() => {
      rejectStartup(
        new Error(`Timeout waiting for server to start after ${timeout}ms`),
        true,
      )
    }, timeout)

    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      for (const line of output.split("\n")) {
        if (line.startsWith("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (!match?.[1]) {
            rejectStartup(
              new Error(`Failed to parse server url from output: ${line}`),
              true,
            )
            return
          }
          resolveStartup(match[1])
          return
        }
      }
    })
    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
    })
    proc.on("exit", (code) => {
      let msg = `Server exited with code ${code}`
      if (output.trim()) msg += `\nServer output: ${output}`
      rejectStartup(new Error(msg), false)
    })
    proc.on("error", (error) => {
      rejectStartup(error, true)
    })
    merged.signal?.addEventListener("abort", abortHandler)
  })

  return { url, close: () => killServerProcess(proc, useShell) }
}
