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
import { resolveCommandPath } from "./command-exists"

/** Handle returned by the launcher (matches the SDK's return shape). */
export interface OpencodeServer {
  url: string
  close: () => void
}

export async function startOpencodeServer(
  options: ServerOptions = {},
): Promise<OpencodeServer> {
  // macOS / Linux: unchanged — go through the SDK exactly as before.
  if (process.platform !== "win32") {
    return createOpencodeServer(options)
  }

  // --- Windows-only path ---
  const hostname = options.hostname ?? "127.0.0.1"
  const port = options.port ?? 4096
  const timeout = options.timeout ?? 5000
  const config = options.config

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
    signal: options.signal,
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
    options.signal?.addEventListener("abort", () => {
      clearTimeout(id)
      reject(new Error("Aborted"))
    })
  })

  return { url, close: () => proc.kill() }
}
