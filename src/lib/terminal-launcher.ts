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
  // --- Cross-platform (buildable from source on any OS) ---
  { name: "alacritty", command: "alacritty", args: ["-e", "{cmd}"] },
  { name: "kitty", command: "kitty", args: ["{cmd}"] },
  { name: "wezterm", command: "wezterm", args: ["start", "--", "{cmd}"] },
  // --- Linux (X11 / Wayland desktop environments) ---
  {
    name: "gnome-terminal",
    command: "gnome-terminal",
    args: ["--", "{cmd}"],
  },
  { name: "konsole", command: "konsole", args: ["-e", "{cmd}"] },
  {
    name: "xfce4-terminal",
    command: "xfce4-terminal",
    args: ["-e", "{cmd}"],
  },
  { name: "foot", command: "foot", args: ["{cmd}"] },
  { name: "tilix", command: "tilix", args: ["-e", "{cmd}"] },
  { name: "terminator", command: "terminator", args: ["-e", "{cmd}"] },
  { name: "xterm", command: "xterm", args: ["-e", "{cmd}"] },
  { name: "urxvt", command: "urxvt", args: ["-e", "{cmd}"] },
  {
    name: "x-terminal-emulator",
    command: "x-terminal-emulator",
    args: ["-e", "{cmd}"],
  },
  // --- Windows ---
  // Windows Terminal (`wt`) is the default on Windows 10/11. `new-tab --`
  // runs the command in a new tab; everything after `--` is forwarded to
  // the launched shell verbatim. Without this entry, `detectInstalledTerminals`
  // found NOTHING on Windows and every user had to hand-configure a Custom
  // terminal — despite the built-in being the obvious first choice.
  // `wt` resolves via PATH on Win10/11; `where.exe wt` confirms it (now that
  // `commandExists` uses `where.exe` instead of the missing `which`).
  { name: "windows-terminal", command: "wt", args: ["new-tab", "--", "{cmd}"] },
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
 * Defensive guard (url): an empty `url` produces
 * `"opencode attach  --session <sid>"` (literal double space), which
 * `buildArgs` then splits and filters, silently dropping the empty URL
 * token. `Bun.spawn` then runs `opencode attach --session <sid>` with
 * no URL argument at all, and the user sees a confusing
 * "opencode: error: missing URL argument" surfaced through the outer
 * `try/catch` in `launchTerminal` — the terminal opened, but the
 * attach command failed for an invisible reason.
 *
 * Defensive guard (sessionId): an empty `sessionId` produces
 * `"opencode attach <url> --session "` (trailing space). `buildArgs`
 * passes the `--session` flag through to `Bun.spawn` with no value
 * following, and opencode errors with
 * `"opencode: error: argument --session requires a value"`.
 *
 * The App-level guards in App.tsx:1356-1357 (`launchConfiguredTerminal`),
 * App.tsx:1425-1426, 1436-1437, 1526-1527, 1462-1464 all short-circuit
 * on falsy `url` / falsy `sessionId` before reaching this function, so
 * both throws are strictly defensive: they catch any future call site,
 * hand-edited config, or test path that passes `""` directly. The
 * throw is caught by the outer `try/catch` in `launchTerminal` (line
 * 250) and surfaces as a clear `LaunchResult.error` instead of a
 * malformed spawn argv. Source: MEJORAS.md Findings 11.3.A + 11.3.B.
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

  return argsPattern.flatMap((arg) => {
    if (arg === "{cmd}") {
      // Replace placeholder with command parts
      return cmdParts
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

      // Defensive guard: an empty `config.args` produces `argsPattern = []`,
      // which `buildArgs` passes through unchanged. `Bun.spawn` would then
      // receive `[command]` and the terminal would open an empty shell with
      // no attach command — the original bug of Finding 11.2.B. The custom
      // dialog is the primary defense (it rejects empty args on save); this
      // guard catches hand-edited configs, programmatic writes, and future
      // call sites that bypass the dialog. The known-terminal path is safe:
      // every entry in `KNOWN_TERMINALS` carries a non-empty `args` array.
      // Source: MEJORAS.md Finding 11.2.B.
      if (argsPattern.length === 0) {
        return {
          success: false,
          error: "Custom terminal args must include the {cmd} placeholder",
        }
      }

      // Defensive guard: a non-empty args pattern that does not contain the
      // `{cmd}` placeholder is silently passed through `buildArgs` unchanged,
      // so `Bun.spawn` would launch the terminal with the literal args
      // (e.g. `wezterm -e bash`) and the user gets a plain shell — the
      // attach command is never substituted. The custom dialog rejects
      // placeholder-less args on save (see DialogTerminalConfig.tsx); this
      // guard is the last-line backstop for hand-edited configs and
      // programmatic writes. The known-terminal path is safe: every entry
      // in `KNOWN_TERMINALS` carries a `{cmd}` token (verified by grep,
      // 12 matches — one per entry). Source: MEJORAS.md Finding 11.2.C.
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

    // Spawn the terminal detached from OCLoop's process group so closing the
    // TUI / SSH session does not SIGHUP the launched terminal. stdio is set
    // to "ignore" because the terminal app owns its own TTY/display; we do
    // not want OCLoop blocked on terminal output. `proc.unref()` keeps the
    // parent from waiting on the child.
    // Source: MEJORAS.md Finding 11.2.A.
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
