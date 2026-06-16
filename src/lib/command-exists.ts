/**
 * Check whether a command is available on PATH.
 *
 * Uses `which` (POSIX, always available) so the test is fast and doesn't
 * actually execute the target binary. Shared by clipboard and terminal
 * detection to avoid duplicating the same `Bun.spawn(["which", …])` pattern.
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "ignore",
      stderr: "ignore",
    })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}