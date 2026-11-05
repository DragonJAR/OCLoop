/**
 * Kill a child process AND its descendants.
 *
 * `ChildProcess.kill()` only signals the direct child. For the OpenCode server
 * that child is often a shim (`cmd.exe` on Windows, a launcher script on POSIX)
 * so signalling it alone orphans the real server, which keeps its port bound.
 *
 * - win32: `taskkill.exe /pid <pid> /t /f`, invoked by ABSOLUTE path (same
 *   pattern as `terminal-launcher.ts` uses for `powershell.exe`) so a planted
 *   `taskkill.exe` in the cwd/PATH can never be executed in its place.
 * - POSIX: SIGTERM to the whole process group, escalating to SIGKILL after a
 *   grace period. This requires the child to have been spawned with
 *   `detached: true` (own process group, pgid === pid); a non-detached child
 *   has no group of its own, so we fall back to signalling just the child.
 */

import { spawn } from "node:child_process"
import { systemBinary } from "./command-exists"

/** Grace period between SIGTERM and SIGKILL (matches cli-runner's KILL_GRACE_MS). */
export const KILL_GRACE_MS = 2_000
const TASKKILL_TIMEOUT_MS = 3_000

/** The slice of a ChildProcess/Bun subprocess this helper needs. */
export interface KillableProcess {
  pid?: number
  kill: (signal?: NodeJS.Signals | number) => unknown
  /** When set, the child has already exited and its pid may be reused. */
  exitCode?: number | null
  signalCode?: NodeJS.Signals | null
  /** ChildProcess-style exit subscription; lets tracking follow the real exit. */
  once?: (event: "exit", listener: () => void) => unknown
}

const hasExited = (proc: KillableProcess): boolean =>
  proc.exitCode != null || proc.signalCode != null

/** Long-lived children (the OpenCode server) a crash handler must be able to reap. */
const tracked = new Set<KillableProcess>()
/** Children killTree already signalled, so a repeated close() does not re-signal. */
const signalled = new WeakSet<KillableProcess>()

/**
 * Register a child for {@link killAllTrackedSync}. It stays tracked until it
 * actually EXITS (or killTreeSync reaps it), not merely until it is signalled:
 * a child that ignores or is slow on SIGTERM must still be escalated by the
 * exit hook when the app calls process.exit right after killTree().
 */
export function trackProcess(proc: KillableProcess): void {
  if (hasExited(proc) || tracked.has(proc)) return
  tracked.add(proc)
  proc.once?.("exit", () => tracked.delete(proc))
}

export const isTracked = (proc: KillableProcess): boolean => tracked.has(proc)

/** Best-effort synchronous tree kill of every tracked child (crash/exit handlers). */
export function killAllTrackedSync(options: KillTreeOptions = {}): void {
  for (const proc of [...tracked]) killTreeSync(proc, options)
}

export interface KillTreeOptions {
  /** Injectable for tests; defaults to `process.platform`. */
  platform?: string
  graceMs?: number
}

/** Absolute path to taskkill.exe — never resolved through PATH or the cwd. */
export function taskkillPath(): string {
  return systemBinary("taskkill", "win32")
}

function taskkillArgs(pid: number): string[] {
  return ["/pid", String(pid), "/t", "/f"]
}

function bestEffortKill(proc: KillableProcess, signal?: NodeJS.Signals): void {
  try {
    proc.kill(signal)
  } catch {
    // Already gone or not killable — best-effort cleanup only.
  }
}

/**
 * Signal the process group led by `pid`. Returns false when no such group is
 * reachable (not detached, already exited, EPERM) so the caller falls back to
 * the direct handle.
 */
function signalGroup(
  send: typeof process.kill,
  pid: number,
  signal: NodeJS.Signals | 0,
): boolean {
  try {
    send(-pid, signal)
    return true
  } catch {
    return false
  }
}

/** Fire-and-forget tree kill. Never throws. */
export function killTree(proc: KillableProcess, options: KillTreeOptions = {}): void {
  // Without an exit subscription there is no way to learn when it dies, so
  // untrack now (previous behavior); otherwise the 'exit' listener untracks.
  if (!proc.once) tracked.delete(proc)
  // Never signal an exited child: its pid/group may belong to someone else now.
  if (hasExited(proc)) {
    tracked.delete(proc)
    return
  }
  if (signalled.has(proc)) return
  signalled.add(proc)
  const platform = options.platform ?? process.platform
  const pid = proc.pid

  if (platform === "win32") {
    if (!pid) return bestEffortKill(proc)
    try {
      const killer = spawn(taskkillPath(), taskkillArgs(pid), {
        stdio: "ignore",
        windowsHide: true,
      })
      killer.on("error", () => bestEffortKill(proc))
    } catch {
      bestEffortKill(proc)
    }
    return
  }

  // Capture now: the escalation timer must keep using this reference.
  const send = process.kill.bind(process)
  if (!pid || pid <= 1 || !signalGroup(send, pid, "SIGTERM")) {
    bestEffortKill(proc)
    return
  }

  const timer = setTimeout(() => {
    // Only escalate while the group still exists (signal 0 probes it).
    if (signalGroup(send, pid, 0)) signalGroup(send, pid, "SIGKILL")
  }, options.graceMs ?? KILL_GRACE_MS)
  // Never keep the event loop alive just for the escalation.
  timer.unref?.()
}

/**
 * Synchronous best-effort tree kill for crash/exit handlers, where no timer or
 * child-process event can run afterwards. POSIX skips the grace period and
 * sends SIGKILL to the group — which only lands while the group still exists
 * (a dead group answers ESRCH, and an exited child is never signalled). Never
 * throws.
 */
export function killTreeSync(proc: KillableProcess, options: KillTreeOptions = {}): void {
  tracked.delete(proc)
  if (hasExited(proc)) return
  const platform = options.platform ?? process.platform
  const pid = proc.pid

  if (platform === "win32") {
    if (!pid) return bestEffortKill(proc)
    try {
      Bun.spawnSync([taskkillPath(), ...taskkillArgs(pid)], {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
        windowsHide: true,
        timeout: TASKKILL_TIMEOUT_MS,
      })
    } catch {
      bestEffortKill(proc)
    }
    return
  }

  const send = process.kill.bind(process)
  if (!pid || pid <= 1 || !signalGroup(send, pid, "SIGKILL")) {
    bestEffortKill(proc, "SIGKILL")
  }
}
