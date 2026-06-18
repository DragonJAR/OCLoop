/**
 * Power management: keep the machine awake while the loop is working so a closed
 * lid or idle-sleep doesn't suspend OCLoop mid-iteration.
 *
 * macOS only — implemented with `caffeinate -dimsu`, spawned while the loop runs
 * and killed when it pauses/stops. On other platforms it is a no-op (so the loop
 * still runs; it just won't prevent system sleep). Disable with `--no-caffeinate`.
 */

import { log } from "./debug-logger"

export interface PowerManager {
  /** Start keeping the system awake (no-op if disabled / unsupported / already on). */
  start(): void
  /** Allow the system to sleep again. */
  stop(): void
  /** Whether a caffeinate process is currently running. */
  isActive(): boolean
}

export interface PowerManagerOptions {
  /** Reactive/lazy enabled flag (respects --no-caffeinate and config). */
  enabled: () => boolean
  /** Override platform detection (tests). Defaults to process.platform. */
  platform?: string
}

export function createPowerManager(options: PowerManagerOptions): PowerManager {
  const platform = options.platform ?? process.platform
  const isMac = platform === "darwin"

  let proc: ReturnType<typeof Bun.spawn> | null = null

  function start(): void {
    if (proc) return
    if (!options.enabled()) return
    if (!isMac) {
      // Documented limitation: only macOS is supported.
      return
    }
    try {
      // -d display, -i idle, -m disk, -s system, -u user-active assertion.
      proc = Bun.spawn(["caffeinate", "-dimsu"], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      })
      // Unref so the caffeinate process doesn't keep the Bun event loop alive.
      // proc.kill() is synchronous on Unix (sends a signal and returns), so it
      // can't hang — but unref ensures the process doesn't block shutdown if
      // kill fails to terminate it immediately.
      proc.unref()
      log.health("power", "caffeinate_start", { pid: proc.pid })
    } catch (err) {
      // caffeinate missing or spawn failed — degrade gracefully.
      log.health("power", "caffeinate_failed", {
        message: err instanceof Error ? err.message : String(err),
      })
      proc = null
    }
  }

  function stop(): void {
    if (!proc) return
    try {
      proc.kill()
    } catch {
      // already gone
    }
    log.health("power", "caffeinate_stop", {})
    proc = null
  }

  function isActive(): boolean {
    return proc !== null
  }

  return { start, stop, isActive }
}
