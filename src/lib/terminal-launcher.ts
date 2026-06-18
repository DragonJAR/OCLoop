/**
 * Terminal detection and launching utilities for OCLoop
 *
 * Handles detecting installed terminal emulators and launching them
 * with the opencode attach command.
 */

import type { TerminalConfig } from "./config"
import { commandExists } from "./command-exists"
import { log } from "./debug-logger"

/**
 * A known terminal emulator with its launch configuration
 */
export interface KnownTerminal {
  name: string
  command: string
  args: string[] // Args to pass when executing a command, {cmd} is replaced
}

/**
 * Result of a terminal launch attempt
 */
export interface LaunchResult {
  success: boolean
  error?: string
}

/**
 * List of known terminal emulators with their configurations.
 * The args array uses {cmd} as a placeholder for the command to execute.
 */
export const KNOWN_TERMINALS: KnownTerminal[] = [
  // One guaranteed/standard terminal per OS. Each surfaces only where its
  // launcher binary is on PATH (`detectInstalledTerminals` → `commandExists`),
  // so any entry shown to the user is actually launchable. A curated list keeps
  // the chooser predictable; speculative GUI terminals are intentionally out
  // (they only ever showed if installed anyway).
  //
  // macOS — Terminal.app is always installed; launched via the built-in
  // `osascript`. GUI terminals don't accept a command via plain argv (no `-e`),
  // so the attach command is a STRING inside the AppleScript clause and `{cmd}`
  // is embedded in the arg (buildArgs inline-substitutes it). Surfaces only on
  // macOS because `osascript` isn't on PATH elsewhere.
  {
    name: "Terminal",
    command: "osascript",
    args: [
      "-e",
      `tell application "Terminal" to do script "{cmd}"`,
      "-e",
      `tell application "Terminal" to activate`,
    ],
  },
  // Windows — cmd.exe ships with every Windows. `start "" cmd /k <cmd>` opens a
  // new console window that runs the attach command and stays open. Surfaces
  // only on Windows (`cmd` isn't on a POSIX PATH).
  { name: "cmd", command: "cmd", args: ["/c", "start", "", "cmd", "/k", "{cmd}"] },
  // Linux — no terminal is guaranteed on every system, so list the two most
  // standard: `xterm` (classic X terminal) and `x-terminal-emulator`
  // (Debian/Ubuntu default-terminal alias). Each shows only if installed.
  { name: "xterm", command: "xterm", args: ["-e", "{cmd}"] },
  {
    name: "x-terminal-emulator",
    command: "x-terminal-emulator",
    args: ["-e", "{cmd}"],
  },
]

/**
 * Lookup a known terminal by name
 */
export function getKnownTerminalByName(name: string): KnownTerminal | undefined {
  return KNOWN_TERMINALS.find((t) => t.name === name)
}



/**
 * Detect which known terminals are installed on the system.
 * Checks each terminal's command using `which`.
 */
export async function detectInstalledTerminals(): Promise<KnownTerminal[]> {
  const results = await Promise.all(
    KNOWN_TERMINALS.map(async (terminal) => ({
      terminal,
      exists: await commandExists(terminal.command),
    })),
  )

  const installed = results.filter((r) => r.exists).map((r) => r.terminal)
  log.info("terminal", "Detected installed terminals", { 
    count: installed.length, 
    names: installed.map(t => t.name) 
  })
  
  return installed
}

/**
 * Generate the opencode attach command for a session.
 *
 * Defensive guards reject empty url/sessionId: an empty url silently drops to
 * `opencode attach --session <sid>` and opencode errors "missing URL argument";
 * an empty sessionId passes `--session` with no value and opencode errors
 * "argument --session requires a value". Both throws are caught by launchTerminal's
 * try/catch and surface as a clear LaunchResult.error instead of a malformed argv.
 * The App-level call sites already short-circuit on falsy values, so these are
 * strictly defensive for future/test/hand-edited paths.
 */
export function getAttachCommand(url: string, sessionId: string): string {
  return getAttachCommandArgs(url, sessionId).join(" ")
}

/**
 * The argv tokens of the attach command, in order. Single source of truth:
 * {@link getAttachCommand} (the user-facing string) is built by joining these
 * with spaces, and {@link buildArgs} consumes them directly — so neither call
 * site re-parses a pre-joined string (which would mis-split if a token ever
 * contained a space). The url/sessionId here are localhost (`http://127.0.0.1:<port>`)
 * and a hex/alnum session id, neither of which contains spaces, but building
 * from the structured tokens is robust against any future change.
 */
function getAttachCommandArgs(url: string, sessionId: string): string[] {
  if (!url) {
    throw new Error("getAttachCommand: url is required")
  }
  if (!sessionId) {
    throw new Error("getAttachCommand: sessionId is required")
  }
  return ["opencode", "attach", url, "--session", sessionId]
}

/**
 * Build the argument list for launching a terminal with a command.
 * Replaces {cmd} placeholder with the actual command parts.
 *
 * Takes the attach-command tokens directly (not a pre-joined string), so
 * there is no `split(" ")` step that could mis-tokenize a value containing a
 * space.
 */
function buildArgs(argsPattern: string[], cmdParts: string[]): string[] {
  // Defensive guard: an empty `cmdParts` would expand `{cmd}` to no tokens and
  // `flatMap` would return the literal pattern — for alacritty, `["-e"]` — and
  // `Bun.spawn` would launch the terminal with no command (an empty shell).
  // Throwing surfaces a clear error through the outer `try/catch` in
  // `launchTerminal`. Every entry in KNOWN_TERMINALS carries a `{cmd}` token,
  // so an empty `cmdParts` always reaches this throw.
  if (cmdParts.length === 0) {
    throw new Error("attach command is empty; cannot construct terminal command")
  }

  // For terminals launched via a wrapper that takes the command as a single
  // STRING rather than separate argv tokens (macOS `osascript … do script
  // "{cmd}"`), `{cmd}` appears INSIDE an arg instead of as its own token. Join
  // the parts and escape for embedding in an AppleScript double-quoted string
  // (`\` then `"`). The attach tokens are PATH-safe today (no spaces/quotes), so
  // the join round-trips cleanly; the escape is a defensive guard.
  const joinedCmd = cmdParts
    .join(" ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')

  return argsPattern.flatMap((arg) => {
    // Standalone token → expand to the attach argv tokens (alacritty `-e {cmd}`).
    if (arg === "{cmd}") {
      return cmdParts
    }
    // Embedded placeholder → inline-substitute the joined command string
    // (osascript `… do script "{cmd}"`).
    if (arg.includes("{cmd}")) {
      return [arg.replaceAll("{cmd}", joinedCmd)]
    }
    // Keep other args as-is
    return [arg]
  })
}

/**
 * Launch a terminal with the attach command.
 * The terminal is spawned as a detached process.
 */
export async function launchTerminal(
  config: TerminalConfig,
  url: string,
  sessionId: string,
): Promise<LaunchResult> {
  try {
    // Build the attach-command tokens once, from structured inputs. Avoids the
    // previous "join into a string, then split(" ") back into tokens" round
    // trip, which mis-tokenized if a value contained a space.
    const cmdParts = getAttachCommandArgs(url, sessionId)

    let command: string
    let args: string[]

    if (config.type === "known") {
      const terminal = getKnownTerminalByName(config.name)
      if (!terminal) {
        return {
          success: false,
          error: `Unknown terminal: ${config.name}`,
        }
      }
      command = terminal.command
      args = buildArgs(terminal.args, cmdParts)
    } else {
      // Custom terminal
      command = config.command

      // Parse the args pattern, replacing {cmd}
      const argsPattern = config.args.split(/\s+/).filter((a) => a.length > 0)

      // Defensive guard: empty config.args would pass [] to Bun.spawn and open
      // an empty shell with no attach command. The custom dialog rejects empty
      // args on save; this catches hand-edited configs and programmatic writes.
      // The known-terminal path is safe: every KNOWN_TERMINALS entry has args.
      if (argsPattern.length === 0) {
        return {
          success: false,
          error: "Custom terminal args must include the {cmd} placeholder",
        }
      }

      // Defensive guard: a non-empty args pattern without the {cmd} placeholder
      // is passed through unchanged, so Bun.spawn would launch the terminal with
      // literal args (e.g. `wezterm -e bash`) and the user gets a plain shell —
      // the attach command is never substituted. The custom dialog rejects
      // placeholder-less args on save; this is the last-line backstop for
      // hand-edited configs. The known-terminal path is safe: every KNOWN_TERMINALS
      // entry carries a {cmd} token.
      if (!argsPattern.includes("{cmd}")) {
        return {
          success: false,
          error: "Custom terminal args must include the {cmd} placeholder",
        }
      }
      args = buildArgs(argsPattern, cmdParts)
    }

    // Verify the command exists
    const exists = await commandExists(command)
    if (!exists) {
      log.warn("terminal", "Command not found", { command })
      return {
        success: false,
        error: `Terminal command not found: ${command}`,
      }
    }

    log.info("terminal", "Spawning terminal", { command, args })

    // Spawn detached from OCLoop's process group so closing the TUI/SSH session
    // does not SIGHUP the launched terminal. stdio: "ignore" because the terminal
    // owns its own TTY/display and we don't want OCLoop blocked on its output.
    // proc.unref() keeps the parent from waiting on the child.
    const proc = Bun.spawn([command, ...args], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
      detached: true,
      windowsHide: true,
    })

    // Unref the process so it doesn't keep the parent alive
    proc.unref()
    
    log.info("terminal", "Terminal spawned successfully")

    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error("terminal", "Failed to launch terminal", error)
    return {
      success: false,
      error,
    }
  }
}
