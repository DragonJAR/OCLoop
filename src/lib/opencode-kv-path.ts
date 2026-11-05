/** Location of OpenCode's kv.json (theme preferences OCLoop mirrors). */

import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"

/**
 * Get the path to OpenCode's kv.json file
 *
 * Uses XDG_STATE_HOME if set AND absolute, otherwise ~/.local/state. Built with `path.join`
 * so the separators are correct on every platform: the previous string
 * concatenation (`${home}/.local/state`) produced mixed forward+back slashes
 * on Windows (`C:\Users\foo/.local/state/...`), which Node/Bun tolerate on
 * read but which can confuse other tools and look broken in error messages.
 * `homedir()` resolves the home directory natively on every platform (same
 * pattern as `config.ts`): on Windows it consults USERPROFILE and
 * HOMEDRIVE/HOMEPATH via the Win32 API, so a POSIX-style `HOME` inherited from
 * Git Bash/MSYS2 (`/c/Users/dev`) can no longer produce a garbage path.
 * OpenCode itself uses the XDG `~/.local/state/opencode` convention on all
 * platforms, so the directory layout is kept consistent with it (we read a
 * file it writes).
 */
export function getOpencodeKVPath(env: NodeJS.ProcessEnv = process.env): string {
  const xdgState = env.XDG_STATE_HOME
  // XDG spec: a relative value is invalid and must be ignored — otherwise it
  // would resolve against the CWD (same rule as getConfigDir in config.ts).
  const stateDir =
    xdgState && isAbsolute(xdgState) ? xdgState : join(homedir(), ".local", "state")
  return join(stateDir, "opencode", "kv.json")
}
