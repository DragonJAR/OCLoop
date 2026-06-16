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
  { name: "alacritty", command: "alacritty", args: ["-e", "{cmd}"] },
  { name: "kitty", command: "kitty", args: ["{cmd}"] },
  { name: "wezterm", command: "wezterm", args: ["start", "--", "{cmd}"] },
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
 * Generate the opencode attach command for a session
 */
export function getAttachCommand(url: string, sessionId: string): string {
  return `opencode attach ${url} --session ${sessionId}`
}

/**
 * Build the argument list for launching a terminal with a command.
 * Replaces {cmd} placeholder with the actual command parts.
 */
function buildArgs(argsPattern: string[], attachCmd: string): string[] {
  // Split the attach command into parts for proper shell handling.
  // Drop empty tokens so a stray/extra space never yields a blank argv entry.
  const cmdParts = attachCmd.split(" ").filter((p) => p.length > 0)

  // Defensive guard: an empty `attachCmd` produces `cmdParts = []`, so the
  // `{cmd}` placeholder expands to no tokens and `flatMap` returns the
  // literal pattern — for alacritty, `["-e"]` — and `Bun.spawn` launches
  // the terminal with no command, so the user gets an empty shell rather
  // than a clear error. The App-level `if (!url) return` at
  // App.tsx:1356-1357 prevents this in the current call flow, but
  // `buildArgs` does not defend itself: any future caller that bypasses
  // the guard (or any test that passes `""` directly) gets a silent
  // failure. Throwing here surfaces a clear error through the outer
  // `try/catch` in `launchTerminal` (line 212). The known-terminal path
  // is safe: every entry in `KNOWN_TERMINALS` carries a `{cmd}` token,
  // so an empty `cmdParts` would always reach this throw on either call
  // site. Source: MEJORAS.md Finding 11.2.D.
  if (cmdParts.length === 0) {
    throw new Error("attachCmd is empty; cannot construct terminal command")
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
  attachCmd: string,
): Promise<LaunchResult> {
  try {
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
      args = buildArgs(terminal.args, attachCmd)
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
      args = buildArgs(argsPattern, attachCmd)
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
