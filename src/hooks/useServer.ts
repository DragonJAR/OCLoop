import { createSignal, onMount, onCleanup } from "solid-js"
import { createOpencodeServer, type ServerOptions } from "@opencode-ai/sdk/server"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { withTimeout } from "../lib/with-timeout"
import { assertResponse, getApiTimeouts } from "../lib/api"
import { monotonicNow } from "../lib/clock"
import { log } from "../lib/debug-logger"

/**
 * Server status states.
 *
 * `unhealthy` means the server process is still around but a health `ping()`
 * failed — the watchdog uses this as the trigger to `restart()`.
 */
export type ServerStatus =
  | "starting"
  | "ready"
  | "error"
  | "stopped"
  | "unhealthy"

/**
 * Return type for the useServer hook
 */
export interface UseServerReturn {
  url: () => string | null
  port: () => number | null
  status: () => ServerStatus
  error: () => Error | undefined
  /** Monotonic ms of the last successful health check (or server start). */
  lastHealthyAt: () => number
  /** Active, lightweight health probe. Updates status/lastHealthyAt. */
  ping: () => Promise<boolean>
  /** Tear down and start a fresh server, reusing the port when possible. */
  restart: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Options for the useServer hook
 */
export interface UseServerOptions {
  /** Port to use for the server. Default (0) tries 4096, then a random available port. */
  port?: number
  /** Hostname to bind to (default: 127.0.0.1) */
  hostname?: string
  /** Timeout for server startup in ms (default: 10000) */
  timeout?: number
  /** Whether to auto-start the server on mount (default: true) */
  autoStart?: boolean
}

/**
 * Hook to manage the OpenCode server lifecycle.
 *
 * Starts the server on mount and provides reactive state for status, URL, and
 * port. Adds an active health check (`ping`) and a `restart` that the watchdog
 * uses to recover from a hung server. Automatically cleans up on unmount.
 *
 * @example
 * ```tsx
 * const server = useServer({ port: 4096 })
 *
 * createEffect(() => {
 *   if (server.status() === "ready") {
 *     console.log("Server ready at", server.url())
 *   }
 * })
 * ```
 */
export function useServer(options: UseServerOptions = {}): UseServerReturn {
  const {
    port,
    hostname = "127.0.0.1",
    timeout = 10000,
    autoStart = true,
  } = options

  const [url, setUrl] = createSignal<string | null>(null)
  const [serverPort, setServerPort] = createSignal<number | null>(null)
  const [status, setStatus] = createSignal<ServerStatus>("starting")
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [lastHealthyAt, setLastHealthyAt] = createSignal<number>(0)

  // Store reference to the server for cleanup
  let serverRef: { url: string; close: () => void } | null = null
  let abortController: AbortController | null = null

  /**
   * Low-level launch of the OpenCode server on a specific port. Shared by the
   * initial start and restart. Throws on failure so callers can fall back.
   */
  async function launch(targetPort: number): Promise<void> {
    abortController = new AbortController()

    const serverOptions: ServerOptions = {
      hostname,
      timeout,
      signal: abortController.signal,
      port: targetPort,
    }

    serverRef = await createOpencodeServer(serverOptions)

    const parsedUrl = new URL(serverRef.url)
    const actualPort = parseInt(parsedUrl.port, 10)

    setUrl(serverRef.url)
    // Keep null (not NaN) when the URL has no explicit port, so restart()'s
    // `serverPort() ?? port ?? 0` fallback works (?? doesn't catch NaN).
    setServerPort(Number.isFinite(actualPort) ? actualPort : null)
    setStatus("ready")
    setLastHealthyAt(monotonicNow())
  }

  /**
   * Start the OpenCode server (initial start).
   */
  async function startServer(): Promise<void> {
    if (status() !== "starting" && status() !== "stopped") {
      return
    }

    setStatus("starting")
    setError(undefined)

    try {
      // Default to 0: tries port 4096 first, then a random available port.
      await launch(port ?? 0)
    } catch (err) {
      const serverError = err instanceof Error ? err : new Error(String(err))
      setError(serverError)
      setStatus("error")
      serverRef = null
    }
  }

  /**
   * Close the current server instance (best effort, never throws).
   */
  function closeCurrent(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (serverRef) {
      try {
        serverRef.close()
      } catch {
        // ignore — we're tearing it down
      }
      serverRef = null
    }
  }

  /**
   * Active health probe: a lightweight `app.agents()` call with the ping
   * timeout. Marks the server healthy/unhealthy and returns success.
   */
  async function ping(): Promise<boolean> {
    const current = url()
    if (!current) return false

    try {
      const client = createOpencodeClient({ baseUrl: current })
      const result = await withTimeout(
        (signal) => client.app.agents({}, { signal }),
        getApiTimeouts().ping,
        "server.ping",
      )
      assertResponse(result, "server ping")
      setLastHealthyAt(monotonicNow())
      if (status() === "unhealthy") {
        setStatus("ready")
      }
      return true
    } catch (err) {
      log.health("server", "ping_failed", {
        message: err instanceof Error ? err.message : String(err),
      })
      // A failed ping means the process is up but unresponsive.
      if (status() === "ready") {
        setStatus("unhealthy")
      }
      return false
    }
  }

  /**
   * Restart the server: tear down the current instance and launch a new one,
   * preferring the same port so the URL (and thus reconnections) stay stable.
   * Falls back to an ephemeral port if the old one is not yet released.
   */
  async function restart(): Promise<void> {
    // Don't double-restart. status flips to "starting" on entry and back to
    // "ready" / "error" on exit; bail if a restart is mid-flight. Reuses the
    // same guard pattern as startServer() (above) so a concurrent caller
    // (watchdog + SSE-exhaustion effect, or two rapid user commands) can't
    // race two `launch()`s and leak the first server's process handle by
    // overwriting serverRef.
    //
    // This single guard addresses both:
    //   - MEJORAS.md Finding 7.5.A (hook-level restart concurrency) and
    //   - MEJORAS.md Finding 15.7.A (server process leak on overlapping
    //     `launch()`s; URL flip mid-recovery; false "restart_failed" log
    //     on success; lost `setError`).
    // The latter's proposed `restartInProgress` boolean + try/finally is
    // functionally equivalent to the `status() === "starting"` check:
    // `setStatus("starting")` (line below) is the sole flag for an in-flight
    // restart, and the synchronous entry sequence (no awaits between this
    // guard and the set on line 209) preserves mutual exclusion between
    // overlapping callers.
    if (status() === "starting") {
      log.health("server", "restart_in_flight_noop", { url: url() })
      return
    }

    const preferredPort = serverPort() ?? port ?? 0
    log.health("server", "restart_begin", { preferredPort })

    setStatus("starting")
    setError(undefined)
    closeCurrent()
    setUrl(null)

    try {
      await launch(preferredPort)
      log.health("server", "restart_done", { url: url(), port: serverPort() })
    } catch (errPreferred) {
      log.health("server", "restart_retry_ephemeral", {
        message:
          errPreferred instanceof Error
            ? errPreferred.message
            : String(errPreferred),
      })
      try {
        // Old port may still be held; let the OS pick a fresh one.
        await launch(0)
        log.health("server", "restart_done", {
          url: url(),
          port: serverPort(),
          ephemeral: true,
        })
      } catch (err) {
        const serverError = err instanceof Error ? err : new Error(String(err))
        setError(serverError)
        setStatus("error")
        serverRef = null
        log.health("server", "restart_failed", { message: serverError.message })
      }
    }
  }

  /**
   * Stop the server gracefully
   */
  async function stop(): Promise<void> {
    closeCurrent()
    setUrl(null)
    setServerPort(null)
    setError(undefined)
    setStatus("stopped")
  }

  // Auto-start server on mount if enabled
  onMount(() => {
    if (autoStart) {
      startServer()
    }
  })

  // Cleanup on unmount
  onCleanup(() => {
    stop()
  })

  return {
    url,
    port: serverPort,
    status,
    error,
    lastHealthyAt,
    ping,
    restart,
    stop,
  }
}
