/**
 * Graceful shutdown manager for OCLoop
 *
 * Provides centralized signal handling and cleanup coordination
 * for SIGINT (Ctrl+C), SIGTERM, and SIGHUP (terminal closed) signals, so the
 * embedded OpenCode server and active session are always torn down — never
 * left orphaned — when OCLoop is terminated.
 */

export type ShutdownHandler = () => Promise<void> | void

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
    // is built for.
    process.on("SIGINT", () => this.handleSignal("SIGINT"))
    process.on("SIGTERM", () => this.handleSignal("SIGTERM"))
    process.on("SIGHUP", () => this.handleSignal("SIGHUP"))
  }

  /**
   * Register a shutdown handler to be called when a termination signal is received.
   * Only one handler can be registered at a time; subsequent calls replace the previous handler.
   */
  register(handler: ShutdownHandler): void {
    this.handler = handler
  }

  /**
   * Unregister the current shutdown handler
   */
  unregister(): void {
    this.handler = null
  }

  /**
   * Handle a signal by calling the registered shutdown handler
   */
  private async handleSignal(signal: string): Promise<void> {
    // Prevent multiple concurrent shutdowns
    if (this.isShuttingDown) {
      return
    }
    this.isShuttingDown = true

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
        await this.handler()
      } catch (error) {
        // Log error but still exit
        console.error(`Error during shutdown (${signal}):`, error)
        process.exit(1)
      } finally {
        clearTimeout(failsafe)
      }
      // Handler finished without exiting (e.g. programmatic shutdown): make sure
      // we terminate rather than hang now that the failsafe is cleared.
      process.exit(0)
    } else {
      // No handler registered, exit immediately
      clearTimeout(failsafe)
      process.exit(0)
    }
  }

  /**
   * Trigger a programmatic shutdown (useful for testing or explicit shutdown)
   */
  async shutdown(): Promise<void> {
    await this.handleSignal("programmatic")
  }
}

/**
 * Global shutdown manager instance - singleton
 */
export const shutdownManager = new ShutdownManager()
