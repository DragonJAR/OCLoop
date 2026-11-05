import { posix, win32 } from "node:path"

/** Injectable PATH lookup (default `Bun.which`) so tests need no real binaries. */
export type WhichFn = (command: string) => string | null

/** Extensions probed on Windows, in `pickSpawnable` preference order. */
const WIN_LOOKUP_EXTS = [".exe", ".cmd", ".bat", ".ps1"]

const defaultWhich: WhichFn = (command) => Bun.which(command)

/**
 * Absolute path of a GUARANTEED operating-system binary, never resolved
 * through PATH or the cwd (so a planted copy can't run in its place, and an
 * elevated terminal whose cwd is `C:\Windows\System32` — where the PATH
 * lookup's cwd filter would drop the real file — still finds it).
 * - win32: `%SystemRoot%\System32[\<subdirs>]\<name>.exe`
 * - darwin/linux: `/usr/bin/<name>`
 *
 * Only for binaries the OS always ships (taskkill, powershell, clip, cmd,
 * caffeinate). User-installed tools (opencode, git, terminals) must keep
 * going through {@link resolveSpawnable} / {@link resolveCommandPath}.
 */
export function systemBinary(
  name: string,
  platform: string = process.platform,
  subdirs: string[] = [],
): string {
  if (platform === "win32") {
    return win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", ...subdirs, `${name}.exe`)
  }
  return posix.join("/usr/bin", ...subdirs, name)
}

/** True when `file` lives directly in the current working directory. */
function isInCwd(file: string, platform: string): boolean {
  // Platform-specific path flavor keeps this correct for an injected platform.
  const path = platform === "win32" ? win32 : posix
  const norm = (p: string) => (platform === "win32" ? p.toLowerCase() : p)
  return norm(path.resolve(path.dirname(file))) === norm(path.resolve(process.cwd()))
}

/**
 * All PATH matches for `command`, via native `Bun.which` (no subprocess, no
 * `which`/`where.exe` dependency, works on every platform). Matches inside the
 * current directory are dropped: `cmd.exe`/`where.exe` historically resolve
 * from the cwd first, so a planted `opencode.cmd` in the project would
 * otherwise be executed. On win32 several extensions are probed because
 * `Bun.which` returns a single hit and {@link pickSpawnable} ranks them.
 */
function lookupAll(command: string, platform: string, which: WhichFn): string[] {
  const names =
    platform === "win32" && !/\.[a-z0-9]+$/i.test(command)
      ? [command, ...WIN_LOOKUP_EXTS.map((ext) => command + ext)]
      : [command]
  const found: string[] = []
  for (const name of names) {
    const hit = which(name)
    if (hit && !found.includes(hit) && !isInCwd(hit, platform)) found.push(hit)
  }
  return found
}

/**
 * Check whether a command is available on PATH.
 *
 * Uses `Bun.which` (native, cross-platform, never executes the target and never
 * resolves from the cwd). Shared by clipboard and terminal detection.
 *
 * The platform is an injectable parameter (default `process.platform`, the same
 * DI pattern as `power.ts` / `term-caps.ts`) so tests drive the win32-vs-POSIX
 * branch deterministically on any host; `which` is injectable for the same reason.
 */
export async function commandExists(
  command: string,
  platform: string = process.platform,
  which: WhichFn = defaultWhich,
): Promise<boolean> {
  try {
    return lookupAll(command, platform, which).length > 0
  } catch {
    return false
  }
}

/**
 * Resolve a command to its full executable path via {@link lookupAll}, picking
 * the best match. Returns `null` when the command is not found or the lookup
 * fails. Used by the Windows opencode launcher to spawn the resolved path
 * (the SDK's bare-`opencode` spawn can't resolve a `.cmd`/`.ps1` shim).
 *
 * On Windows the PATH often holds a POSIX-style EXTENSIONLESS npm shim
 * (e.g. `…\npm\opencode`) BEFORE the spawnable `opencode.cmd`. CreateProcess
 * can't execute the extensionless file (it only appends `.exe`), so taking the
 * raw first match made `spawn` fail with `ENOENT` even though `opencode` ran
 * fine in a shell. {@link pickSpawnable} deprioritizes that shim — see it for
 * the ranking.
 */
export async function resolveCommandPath(
  command: string,
  platform: string = process.platform,
  which: WhichFn = defaultWhich,
): Promise<string | null> {
  try {
    return pickSpawnable(lookupAll(command, platform, which), platform)
  } catch {
    return null
  }
}

/**
 * Resolve a command to the form to hand `Bun.spawn`, or `null` if it isn't on
 * PATH. Folds the existence-gate AND path-resolution into ONE lookup:
 * - win32: the full resolved path ({@link resolveCommandPath}) — a no-shell
 *   spawn of a bare name isn't PATHEXT-resolved on Windows.
 * - POSIX: the bare command when present ({@link commandExists}) — spawning a
 *   bare name works there, so this stays byte-identical to the old gate.
 * Use at a spawn site instead of calling `commandExists` and then resolving.
 */
export async function resolveSpawnable(
  command: string,
  platform: string = process.platform,
  which: WhichFn = defaultWhich,
): Promise<string | null> {
  if (platform === "win32") return resolveCommandPath(command, platform, which)
  return (await commandExists(command, platform, which)) ? command : null
}

/**
 * Pick the best PATH match to hand to `spawn`.
 *
 * Ranking on Windows (POSIX returns the first/only `which` match unchanged):
 * 1. A native `.exe` — spawned directly with no shell, so the handle in
 *    `opencode-server.ts` IS opencode and `close()` reaps it cleanly.
 * 2. A `.cmd`/`.bat`/`.ps1` shim (npm/bun install) — runnable via a shell.
 * 3. Anything else (the extensionless npm shim) — last resort; CreateProcess
 *    can't launch it, but we surface it rather than `null` so the caller's
 *    error stays the SDK's familiar `ENOENT` instead of a silent "not found".
 */
export const WIN_SHELL_SHIM_RE = /\.(cmd|bat|ps1)$/i
const WIN_NATIVE_RE = /\.exe$/i

/**
 * Check whether a command string refers to a Windows shell shim (.cmd, .bat, .ps1).
 * On Windows, such files cannot be spawned directly via CreateProcess without a shell wrapper.
 * On non-Windows platforms, returns false.
 */
export function isWindowsShellShim(
  command: string,
  platform: string = process.platform,
): boolean {
  return platform === "win32" && WIN_SHELL_SHIM_RE.test(command)
}

function pickSpawnable(matches: string[], platform: string): string | null {
  if (matches.length === 0) return null
  if (platform !== "win32") return matches[0]
  return (
    matches.find((m) => WIN_NATIVE_RE.test(m)) ??
    matches.find((m) => WIN_SHELL_SHIM_RE.test(m)) ??
    matches[0]
  )
}