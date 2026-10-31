/** Embedded OpenCode server launcher with v1/v2 startup and auth handling. */

import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import type { Config } from "@opencode-ai/sdk"
import type { ServerOptions } from "@opencode-ai/sdk/server"
import { detectOpencodeVersion, getOpencodeSpawnTarget, type OpencodeMajor } from "./opencode-version"
import { PERMISSION_TOOLS, type PermissionsConfig } from "./config"

export interface OpencodeServer {
  url: string
  version: OpencodeMajor | null
  /** Present for v2 and unknown-version launches so capability probes can authenticate. */
  authorization?: string
  close: () => void
}

const READY_PREFIX_RE = /^(?:opencode\s+)?server\s+listening\b/
const READY_URL_RE = /^(?:opencode\s+)?server\s+listening\s+on\s+(https?:\/\/\S+)/
const V2_USERNAME = "opencode"
const PASSWORD_OUTPUT_LINE_RE = /^(?:opencode[ \t]+)?server[ \t]+password\b[^\r\n]*$/gim

/** Remove server-generated password lines before startup output reaches errors or logs. */
function redactSensitiveOutputImpl(output: string): string {
  if (typeof output !== "string") return ""
  return output.replace(PASSWORD_OUTPUT_LINE_RE, "<redacted>")
}

type ServerProcess = ReturnType<typeof spawn>

export interface StartOpencodeServerOptions extends ServerOptions {
  permissions?: Partial<PermissionsConfig>
}

/** Build the autonomous OpenCode permission block consumed through config. */
export function buildPermissionConfig(
  enabled?: Partial<PermissionsConfig>,
): NonNullable<Config["permission"]> {
  const permission: NonNullable<Config["permission"]> = {}
  for (const tool of PERMISSION_TOOLS) {
    if (enabled?.[tool] !== false) permission[tool] = "allow"
  }
  return permission
}

/**
 * Merge OCLoop's autonomous permissions over the caller's config. OpenCode v2
 * loads OPENCODE_CONFIG_CONTENT last and applies the last matching permission
 * rule, so an injected allow can override a deny from a lower-priority config.
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

function killServerProcess(proc: ServerProcess, killTree = true): void {
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

async function getServerSpawnTarget(): Promise<{ command: string; shell: boolean }> {
  // Shared resolution with the version detector (DRY): POSIX bare name,
  // Windows resolved+quoted shim. Falls back to the bare name when the
  // Windows lookup fails — the launcher must still try PATH.
  const target = await getOpencodeSpawnTarget()
  if (target) return target
  return { command: "opencode", shell: false }
}

type StartOpencodeServerFunction = {
  (options?: StartOpencodeServerOptions): Promise<OpencodeServer>
  readonly redactSensitiveOutput?: (output: string) => string
}

const startOpencodeServerImpl = async function startOpencodeServer(
  options: StartOpencodeServerOptions = {},
): Promise<OpencodeServer> {
  const merged = withAutonomousPermissions(options, options.permissions)
  const version = await detectOpencodeVersion()
  const hostname = merged.hostname ?? "127.0.0.1"
  const port = merged.port ?? 4096
  const timeout = merged.timeout ?? 5000
  const config = merged.config

  const args = ["serve", `--hostname=${hostname}`, `--port=${port}`]
  const logLevel = (config as { logLevel?: string } | undefined)?.logLevel
  if (logLevel) args.push(`--log-level=${logLevel}`)

  const target = await getServerSpawnTarget()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config ?? {}),
  }
  // Use our own credential for v2 and unknown versions. Unknown launches may
  // be v2 and need this header for the backend's capability probe; older v1
  // servers ignore the env override, while newer v1 builds honor this same
  // credential.
  delete env.OPENCODE_SERVER_PASSWORD

  let authorization: string | undefined
  if (version === 2 || version === null) {
    const password = randomBytes(32).toString("hex")
    env.OPENCODE_SERVER_PASSWORD = password
    authorization = `Basic ${Buffer.from(`${V2_USERNAME}:${password}`, "utf8").toString("base64")}`
  }

  const spawnOptions: Parameters<typeof spawn>[2] = {
    signal: merged.signal,
    env,
  }
  if (target.shell) spawnOptions.shell = true

  const proc = spawn(target.command, args, spawnOptions)

  const url = await new Promise<string>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let output = ""
    let stdoutBuffer = ""
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
      if (proc.stdout) {
        proc.stdout.removeListener("data", onStdout)
        ;(proc.stdout as { resume?: () => void }).resume?.()
      }
      if (proc.stderr) {
        proc.stderr.removeListener("data", onStderr)
        ;(proc.stderr as { resume?: () => void }).resume?.()
      }
      proc.removeListener("exit", onExit)
      proc.removeListener("error", onError)
      output = ""
      stdoutBuffer = ""
      return true
    }

    const rejectStartup = (error: Error, kill: boolean) => {
      if (!settle()) return
      if (kill) killServerProcess(proc, true)
      reject(error)
    }

    const resolveStartup = (serverUrl: string) => {
      if (!settle()) return
      resolve(serverUrl)
    }

    abortHandler = () => rejectStartup(new Error("Aborted"), true)

    timer = setTimeout(() => {
      const safeOutput = redactSensitiveOutputImpl(output)
      const outputDetail = safeOutput.trim() ? `\nServer output: ${safeOutput}` : ""
      rejectStartup(
        new Error(`Timeout waiting for server to start after ${timeout}ms${outputDetail}`),
        true,
      )
    }, timeout)

    const onStdout = (chunk: Buffer | string) => {
      const text = chunk.toString()
      output += text
      stdoutBuffer += text
      const lines = stdoutBuffer.split("\n")
      stdoutBuffer = lines.pop() ?? ""
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!READY_PREFIX_RE.test(line)) continue
        const match = READY_URL_RE.exec(line)
        if (!match?.[1]) {
          rejectStartup(
            new Error(`Failed to parse server url from output: ${redactSensitiveOutputImpl(output)}`),
            true,
          )
          return
        }
        resolveStartup(match[1])
        return
      }
    }

    const onStderr = (chunk: Buffer | string) => {
      output += chunk.toString()
    }

    const onExit = (code: number | null) => {
      let msg = `Server exited with code ${code}`
      const safeOutput = redactSensitiveOutputImpl(output)
      if (safeOutput.trim()) msg += `\nServer output: ${safeOutput}`
      rejectStartup(new Error(msg), false)
    }

    const onError = (error: Error) => rejectStartup(error, true)

    proc.stdout?.on("data", onStdout)
    proc.stderr?.on("data", onStderr)
    proc.on("exit", onExit)
    proc.on("error", onError)
    merged.signal?.addEventListener("abort", abortHandler)
  })

  return {
    url,
    version,
    ...(authorization ? { authorization } : {}),
    close: () => killServerProcess(proc, true),
  }
}

export const startOpencodeServer: StartOpencodeServerFunction = Object.assign(
  startOpencodeServerImpl,
  { redactSensitiveOutput: redactSensitiveOutputImpl },
)
