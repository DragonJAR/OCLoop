/**
 * Check whether a command is available on PATH.
 *
 * Uses the platform's native lookup utility — `which` on POSIX (always
 * available) and `where.exe` on Windows — so the test is fast and doesn't
 * actually execute the target binary. Shared by clipboard and terminal
 * detection to avoid duplicating the same `Bun.spawn([<lookup>, …])` pattern.
 *
 * The platform is an injectable parameter (default `process.platform`, the same
 * DI pattern as `power.ts` / `term-caps.ts`) so tests drive the win32-vs-POSIX
 * branch deterministically on any host. In tests, spawn is stubbed via the
 * shared `./test-helpers/bun-spawn-mock`.
 */
export async function commandExists(
  command: string,
  platform: string = process.platform,
): Promise<boolean> {
  // `where.exe` is the Windows equivalent of `which` and ships with every
  // stock install. Without it, `commandExists` always throws on win32 (no
  // `which` binary), which made both clipboard detection (clipboard.ts) and
  // terminal detection (terminal-launcher.ts) silently report "not found"
  // for every probe — the clipboard would always fall through to the
  // "No clipboard tool found" error even though `clip.exe` is built in.
  // The clipboard.ts comment already documented this fallback (Finding
  // 11.4.B); the implementation now matches the documented contract.
  const lookup = platform === "win32" ? "where.exe" : "which"
  try {
    const proc = Bun.spawn([lookup, command], {
      stdout: "ignore",
      stderr: "ignore",
    })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}

/**
 * Resolve a command to its full executable path via the same native lookup as
 * {@link commandExists} (`where.exe` on Windows, `which` on POSIX), capturing
 * the best match. Returns `null` when the command is not found or the lookup
 * fails. Used by the Windows opencode launcher to spawn the resolved path
 * (the SDK's bare-`opencode` spawn can't resolve a `.cmd`/`.ps1` shim).
 *
 * On Windows `where.exe` often lists a POSIX-style EXTENSIONLESS npm shim
 * (e.g. `…\npm\opencode`) BEFORE the spawnable `opencode.cmd`. CreateProcess
 * can't execute the extensionless file (it only appends `.exe`), so taking the
 * raw first match made `spawn` fail with `ENOENT` even though `opencode` ran
 * fine in a shell. {@link pickSpawnable} deprioritizes that shim — see it for
 * the ranking.
 */
export async function resolveCommandPath(
  command: string,
  platform: string = process.platform,
): Promise<string | null> {
  const lookup = platform === "win32" ? "where.exe" : "which"
  try {
    const proc = Bun.spawn([lookup, command], {
      stdout: "pipe",
      stderr: "ignore",
    })
    const out = await new Response(proc.stdout).text()
    if ((await proc.exited) !== 0) return null
    const matches = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    return pickSpawnable(matches, platform)
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
): Promise<string | null> {
  if (platform === "win32") return resolveCommandPath(command, platform)
  return (await commandExists(command, platform)) ? command : null
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
const WIN_NATIVE_RE = /\.exe$/i
const WIN_SHIM_RE = /\.(cmd|bat|ps1)$/i

function pickSpawnable(matches: string[], platform: string): string | null {
  if (matches.length === 0) return null
  if (platform !== "win32") return matches[0]
  return (
    matches.find((m) => WIN_NATIVE_RE.test(m)) ??
    matches.find((m) => WIN_SHIM_RE.test(m)) ??
    matches[0]
  )
}