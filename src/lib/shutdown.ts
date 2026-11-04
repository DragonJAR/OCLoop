/**
 * Graceful shutdown manager for OCLoop
 *
 * Provides centralized signal handling and cleanup coordination
 * for SIGINT (Ctrl+C), SIGTERM, and SIGHUP (terminal closed) signals, so the
 * embedded OpenCode server and active session are always torn down — never
 * left orphaned — when OCLoop is terminated.
 */

export type ShutdownHandler = (exitCode?: number) => Promise<void> | void

/**
 * Conventional `128 + n` exit codes for the terminating signals.
 *
 * A process killed by SIGTERM is expected by shells and CI to report 143, not
 * 0 — the exit code is part of the contract with whatever launched us.
 */
const SIGNAL_EXIT_CODES: Record<string, number> = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGBREAK: 131,
  SIGTERM: 143,
}

/**
 * Global shutdown manager instance
 */
class ShutdownManager {
  private handler: ShutdownHandler | null = null
  private isShuttingDown = false
  /** Hard cap on cleanup before we force-exit, so shutdown can never hang. */
  private forceExitMs = 10000

  constructor() {
    // Register signal handlers. SIGHUP fires when the controlling terminal is
    // closed (window closed, SSH dropped) — handling it prevents an orphaned
    // OpenCode server in exactly the kind of unattended scenario this harness
    // is built for. Node/Bun also generate SIGHUP on Windows when the console
    // window closes, so this one line covers "terminal gone" on every OS.
    process.on("SIGINT", () => this.handleSignal("SIGINT"))
    process.on("SIGTERM", () => this.handleSignal("SIGTERM"))
    process.on("SIGHUP", () => this.handleSignal("SIGHUP"))
    // Windows-only: Ctrl+Break (SIGBREAK) is a native Windows console signal
    // that Node/Bun deliver there but not on POSIX. Registering it is a no-op
    // on macOS/Linux (the signal simply never arrives), and on Windows it
    // gives Ctrl+Break the same clean shutdown Ctrl+C already gets. The
    // registration itself is always safe — process.on never throws for these
    // standard names (verified on darwin; Bun mirrors Node's win32 behavior).
    process.on("SIGBREAK", () => this.handleSignal("SIGBREAK"))
  }

  /**
   * Register a shutdown handler to be called when a termination signal is received.
   * Only one handler can be registered at a time; subsequent calls replace the previous handler.
   */
  register(handler: ShutdownHandler): void {
    this.handler = handler
  }

  unregister(): void {
    this.handler = null
  }

  private async handleSignal(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      if (signal !== "programmatic") {
        console.error(`\nForced exit on repeated ${signal}.`)
        process.exit(1)
      }
      return
    }
    this.isShuttingDown = true

    // The exit code the process reports: the conventional 128+n for a signal,
    // 0 for a programmatic shutdown.
    const exitCode = signal === "programmatic" ? 0 : (SIGNAL_EXIT_CODES[signal] ?? 1)

    // Failsafe: if cleanup stalls (e.g. a wedged server.close or a hung abort),
    // force the process to exit so the user is never stuck on Ctrl+C.
    const failsafe = setTimeout(() => {
      console.error(
        `Shutdown timed out after ${signal}; forcing exit to avoid hanging.`,
      )
      process.exit(1)
    }, this.forceExitMs)
    // Don't let the failsafe timer itself keep the process alive.
    failsafe.unref?.()

    if (this.handler) {
      try {
        // The handler owns the teardown (state file, session abort, embedded
        // server) and exits with this code once it is done.
        await this.handler(exitCode)
      } catch (error) {
        // Log error but still exit
        console.error(`Error during shutdown (${signal}):`, error)
        process.exit(1)
        return
      } finally {
        // Normal-completion path: clear the failsafe now that the handler
        // returned. The catch-block path is past the point of needing cleanup
        // (process.exit(1) terminates the runtime).
        clearTimeout(failsafe)
      }
      // Handler finished without exiting (e.g. programmatic shutdown): make sure
      // we terminate rather than hang now that the failsafe is cleared.
      process.exit(exitCode)
    } else {
      // No handler registered, exit immediately
      clearTimeout(failsafe)
      process.exit(exitCode)
    }
  }

  async shutdown(): Promise<void> {
    await this.handleSignal("programmatic")
  }
}

export const shutdownManager = new ShutdownManager()
