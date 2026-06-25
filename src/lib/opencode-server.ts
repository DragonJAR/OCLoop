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
import { PERMISSION_TOOLS } from "./config"

/** Handle returned by the launcher (matches the SDK's return shape). */
export interface OpencodeServer {
  url: string
  close: () => void
}

/**
 * Options for {@link startOpencodeServer}. Extends the SDK's `ServerOptions`
 * with `permissions`, a per-tool autonomous-approval map (true/absent → allow,
 * false → OpenCode's interactive default). Omitted means fully autonomous —
 * used by `--create-plan`, which is headless and must never block.
 */
export interface StartOpencodeServerOptions extends ServerOptions {
  permissions?: Partial<Record<(typeof PERMISSION_TOOLS)[number], boolean>>
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
 * This is applied via OPENCODE_CONFIG_CONTENT, which OpenCode DEEP-MERGES with
 * the user's own opencode.json — so an explicit `deny` the user set (e.g. to
 * forbid `git push`) still wins. The merge keeps a safety net while removing the
 * dead-end of an unanswered prompt.
 */
export function buildPermissionConfig(
  enabled?: Partial<Record<(typeof PERMISSION_TOOLS)[number], boolean>>,
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
 * The fully-autonomous policy (all five tools allowed). The default for callers
 * that don't carry per-tool user overrides — notably `--create-plan`, which is
 * headless and would hang on any confirmation.
 */
export const AUTONOMOUS_PERMISSION_CONFIG: Pick<Config, "permission"> = {
  permission: buildPermissionConfig(),
}

/**
 * Merge the autonomous permission policy into `options`. `enabled`, when given,
 * lets a caller drop specific tools back to OpenCode's interactive default;
 * omitted means fully autonomous (all five allowed).
 */
function withAutonomousPermissions(
  options: ServerOptions,
  enabled?: Partial<Record<(typeof PERMISSION_TOOLS)[number], boolean>>,
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
  const useShell = /\.(cmd|bat|ps1)$/i.test(bin)
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
    const id = setTimeout(() => {
      reject(new Error(`Timeout waiting for server to start after ${timeout}ms`))
    }, timeout)
    let output = ""
    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      for (const line of output.split("\n")) {
        if (line.startsWith("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          clearTimeout(id)
          if (!match?.[1]) {
            reject(new Error(`Failed to parse server url from output: ${line}`))
            return
          }
          resolve(match[1])
          return
        }
      }
    })
    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
    })
    proc.on("exit", (code) => {
      clearTimeout(id)
      let msg = `Server exited with code ${code}`
      if (output.trim()) msg += `\nServer output: ${output}`
      reject(new Error(msg))
    })
    proc.on("error", (error) => {
      clearTimeout(id)
      reject(error)
    })
    merged.signal?.addEventListener("abort", () => {
      clearTimeout(id)
      reject(new Error("Aborted"))
    })
  })

  return { url, close: () => proc.kill() }
}
