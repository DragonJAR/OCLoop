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