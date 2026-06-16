import { createSignal, onMount, onCleanup, type Accessor } from "solid-js"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { Event, Todo } from "@opencode-ai/sdk/v2"
import { log } from "../lib/debug-logger"

/** Maximum length for individual string values in logged event data */
const MAX_LOG_VALUE_LENGTH = 200

/**
 * Recursively truncate string values in data for logging.
 * Preserves JSON structure while limiting individual string lengths.
 */
function truncateForLog(data: unknown, maxValueLength = MAX_LOG_VALUE_LENGTH): unknown {
  if (typeof data === "string" && data.length > maxValueLength) {
    return data.substring(0, maxValueLength) + `...[${data.length} chars]`
  }
  if (Array.isArray(data)) {
    return data.map(v => truncateForLog(v, maxValueLength))
  }
  if (data && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, truncateForLog(v, maxValueLength)])
    )
  }
  return data
}

export interface ToolPart {
  type: "tool" | "tool-use"
  id: string
  tool?: string
  state: {
    tool?: string
    input: unknown
    status: string
  }
}

export interface TextPart {
  type: "text"
  id: string
  text: string
}

export interface ReasoningPart {
  type: "reasoning"
  id: string
  text: string
}

export interface StepFinishPart {
  type: "step-finish"
  id: string
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
}

export interface FileDiff {
  file: string
  additions: number
  deletions: number
}

/**
 * SSE connection status
 */
export type SSEStatus = "disconnected" | "connecting" | "connected" | "error"

/**
 * Coarse classification of a session error so callers can react correctly:
 * - `rate_limit` → wait + retry the same iteration (recoverable, expected)
 * - `aborted`    → user/programmatic abort (not a failure)
 * - `auth`       → credential problem (won't fix itself by retrying)
 * - `transient`  → network/5xx/timeout blip (retryable)
 * - `fatal`      → anything else
 */
export type SessionErrorKind =
  | "rate_limit"
  | "aborted"
  | "auth"
  | "transient"
  | "fatal"

export interface SessionError {
  message: string
  name?: string
  isAborted: boolean
  /** Coarse category used to decide recovery strategy. */
  kind: SessionErrorKind
  /** Seconds to wait before retrying (only set for rate limits, when known). */
  retryAfter?: number
}

const RATE_LIMIT_NAMES = new Set(["RateLimitError", "OverloadedError"])
const AUTH_NAMES = new Set([
  "AuthError",
  "AuthenticationError",
  "UnauthorizedError",
])
const ABORTED_NAMES = new Set(["MessageAbortedError", "AbortError"])

const RATE_LIMIT_RE =
  /(\b429\b|rate[\s_-]?limit|ratelimited|too many requests|overloaded|over capacity|quota|insufficient_quota)/i
const AUTH_RE =
  /(\b401\b|\b403\b|unauthorized|forbidden|invalid api key|authentication failed|invalid x-api-key)/i
const TRANSIENT_RE =
  /(\b50\d\b|\b529\b|timeout|timed out|econnreset|etimedout|enotfound|econnrefused|socket hang up|fetch failed|network error|connection\b[^.]{0,24}\b(?:closed|reset|refused|error)|closed unexpectedly)/i

/**
 * Map an error name + message to a {@link SessionErrorKind}.
 * Checked in priority order: aborted → rate_limit → auth → transient → fatal.
 */
function classifyKind(name: string | undefined, message: string): SessionErrorKind {
  const hay = `${name ?? ""} ${message}`
  if ((name && ABORTED_NAMES.has(name)) || /\baborted?\b/i.test(hay)) {
    return "aborted"
  }
  if ((name && RATE_LIMIT_NAMES.has(name)) || RATE_LIMIT_RE.test(hay)) {
    return "rate_limit"
  }
  if ((name && AUTH_NAMES.has(name)) || AUTH_RE.test(hay)) {
    return "auth"
  }
  if (TRANSIENT_RE.test(hay)) {
    return "transient"
  }
  return "fatal"
}

/**
 * Best-effort extraction of a Retry-After hint (in seconds) from an error
 * object: explicit numeric fields, a `retry-after` header, or a duration parsed
 * from the message ("retry after 30s", "try again in 2 minutes").
 */
function extractRetryAfter(e: Record<string, any>): number | undefined {
  const candidates = [
    e?.retryAfter,
    e?.retry_after,
    e?.data?.retryAfter,
    e?.data?.retry_after,
  ]
  for (const c of candidates) {
    const n = typeof c === "string" ? Number(c) : c
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n
  }

  const headers = e?.headers ?? e?.response?.headers
  if (headers) {
    const raw =
      typeof headers.get === "function"
        ? headers.get("retry-after")
        : headers["retry-after"] ?? headers["Retry-After"]
    if (raw != null) {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 0) return n
    }
  }

  if (typeof e?.message === "string") {
    const m = e.message.match(
      /(?:retry|try again|wait)[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*(s|sec|secs|seconds|m|min|mins|minutes)?/i,
    )
    if (m) {
      let v = parseFloat(m[1])
      const unit = (m[2] || "s").toLowerCase()
      if (unit.startsWith("m")) v *= 60
      if (Number.isFinite(v) && v >= 0) return v
    }
  }

  return undefined
}

/**
 * Normalize a raw `session.error` payload (object, string, or unknown) into a
 * structured {@link SessionError} with a {@link SessionErrorKind} and, for rate
 * limits, a `retryAfter` hint. Pure and exported for unit testing.
 */
export function classifySessionError(rawError: unknown): SessionError {
  let name: string | undefined
  let message: string
  let retryAfter: number | undefined

  if (typeof rawError === "object" && rawError !== null) {
    const e = rawError as Record<string, any>
    name = typeof e.name === "string" ? e.name : undefined
    message = e.message || e.data?.message || "Unknown error"
    retryAfter = extractRetryAfter(e)
  } else if (typeof rawError === "string") {
    message = rawError
  } else {
    message = "Unknown error"
  }

  const kind = classifyKind(name, message)
  return {
    message,
    name,
    isAborted: kind === "aborted",
    kind,
    retryAfter: kind === "rate_limit" ? retryAfter : undefined,
  }
}

/**
 * SSE event handlers for OCLoop-relevant events
 */
export interface SSEEventHandlers {
  /** Called when a session is created */
  onSessionCreated?: (sessionId: string) => void
  /** Called when a session becomes idle */
  onSessionIdle?: (sessionId: string) => void
  /** Called when todos are updated */
  onTodoUpdated?: (sessionId: string, todos: Todo[]) => void
  /** Called when a file is edited */
  onFileEdited?: (file: string) => void
  /** Called when a session error occurs */
  onSessionError?: (sessionId: string | undefined, error: SessionError) => void
  /** Called for any event (useful for debugging) */
  onAnyEvent?: (event: Event) => void
  /** Called when a tool is used */
  onToolUse?: (part: ToolPart) => void
  /** Called when a message part (text) is received */
  onMessageText?: (part: TextPart, role: "user" | "assistant") => void
  /** Called when reasoning is received */
  onReasoning?: (part: ReasoningPart) => void
  /** Called when a step finishes */
  onStepFinish?: (part: StepFinishPart) => void
  /** Called when session diff is updated */
  onSessionDiff?: (diffs: FileDiff[]) => void
}

/**
 * Options for the useSSE hook
 */
export interface UseSSEOptions {
  /** Server URL to connect to (reactive accessor) */
  url: Accessor<string>
  /** Directory scope for the SSE connection */
  directory?: string
  /** Event handlers */
  handlers: SSEEventHandlers
  /** Session ID to filter events (optional) */
  sessionId?: Accessor<string | undefined>
  /** Whether to auto-connect on mount (default: true) */
  autoConnect?: boolean
  /** Called when an error occurs */
  onError?: (error: Error) => void
}

/**
 * Return type for the useSSE hook
 */
export interface UseSSEReturn {
  /** Current connection status */
  status: Accessor<SSEStatus>
  /** Last error that occurred */
  error: Accessor<Error | undefined>
  /** Consecutive reconnect attempts since the last successful connection. */
  reconnectAttempts: Accessor<number>
  /** Manually reconnect */
  reconnect: () => void
  /** Disconnect from the SSE stream */
  disconnect: () => void
}

/**
 * Hook to subscribe to OpenCode SSE events.
 *
 * Connects to the `/event` endpoint and provides event filtering by session.
 * Automatically handles reconnection on connection loss.
 *
 * @example
 * ```tsx
 * const sse = useSSE({
 *   url: "http://127.0.0.1:4096",
 *   sessionId: () => currentSessionId(),
 *   handlers: {
 *     onSessionIdle: (sessionId) => {
 *       console.log("Session idle:", sessionId)
 *       dispatch({ type: "session_idle" })
 *     },
 *     onTodoUpdated: (sessionId, todos) => {
 *       console.log("Todos updated:", todos)
 *     },
 *   },
 * })
 *
 * createEffect(() => {
 *   if (sse.status() === "connected") {
 *     console.log("SSE connected")
 *   }
 * })
 * ```
 */
export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const {
    url,
    directory,
    handlers,
    sessionId,
    autoConnect = true,
    onError,
  } = options

  const [status, setStatus] = createSignal<SSEStatus>("disconnected")
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [reconnectAttempts, setReconnectAttempts] = createSignal(0)

  // Abort controller for canceling the SSE connection
  let abortController: AbortController | null = null
  // Flag to track if we should keep trying to reconnect
  let shouldReconnect = true

  // Track message roles: messageID -> role
  const messageRoles = new Map<string, "user" | "assistant">()
  // Track seen part IDs to avoid duplicates
  const seenPartIds = new Set<string>()

  /**
   * Process an incoming SSE event and call appropriate handlers
   */
  function processEvent(event: Event): void {
    log.debug("sse", "Event received", { type: event.type, sessionId: sessionId?.(), data: truncateForLog(event.properties) })

    // Call the generic handler first
    if (handlers.onAnyEvent) {
      handlers.onAnyEvent(event)
    }

    // Get the current session filter
    const filterSessionId = sessionId?.()

    // Handle specific event types
    switch (event.type) {
      case "session.created": {
        // Extract session ID from event.properties.info.id
        const eventSessionId = (event.properties as { info?: { id?: string } })
          .info?.id
        if (eventSessionId) {
          // Filter by session if a filter is set
          if (filterSessionId && eventSessionId !== filterSessionId) {
            return
          }
          // Part/message ids are unique per session and never need cross-session
          // dedup, so reset the dedup maps here. Without this they grow unbounded
          // over a long multi-iteration run (the loop's whole use case).
          seenPartIds.clear()
          messageRoles.clear()
          handlers.onSessionCreated?.(eventSessionId)
        }
        break
      }

      case "session.idle": {
        const eventSessionId = event.properties.sessionID
        // Filter by session if a filter is set
        if (filterSessionId && eventSessionId !== filterSessionId) {
          return
        }
        handlers.onSessionIdle?.(eventSessionId)
        break
      }

      case "session.error": {
        const eventSessionId = (event.properties as { sessionID?: string })
          .sessionID

        const rawError = (event.properties as any).error
        const sessionError = classifySessionError(rawError)

        // Policy: un-attributed session.error events (eventSessionId === undefined)
        // are passed through to handlers. The extra `eventSessionId &&` truthy
        // guard makes this asymmetric vs the session.idle / todo.updated filters,
        // and that asymmetry is deliberate: the App-level onSessionError handler
        // is the authoritative arbiter of which states accept errors
        // (running/pausing/debug only) and already short-circuits on state, so
        // a missing sessionID is not a reason to drop the event here. The
        // sessionID comparison itself is what protects against stale-session
        // events when a sessionID IS present.
        // Source: MEJORAS.md Finding 7.2.A.
        if (
          filterSessionId &&
          eventSessionId &&
          eventSessionId !== filterSessionId
        ) {
          return
        }
        handlers.onSessionError?.(eventSessionId, sessionError)
        break
      }

      case "todo.updated": {
        const eventSessionId = event.properties.sessionID
        // Filter by session if a filter is set
        if (filterSessionId && eventSessionId !== filterSessionId) {
          return
        }
        handlers.onTodoUpdated?.(eventSessionId, event.properties.todos)
        break
      }

      case "file.edited": {
        handlers.onFileEdited?.(event.properties.file)
        break
      }

      case "message.updated": {
        const props = event.properties as any
        const message = props.info || props.message
        if (message?.id && message?.role) {
          messageRoles.set(message.id, message.role)
        }
        break
      }

      case "message.part.updated": {
        const props = event.properties as any
        const part = props.part
        const messageId = part?.messageID
        const eventSessionId = part?.sessionID

        // Filter by session if a filter is set
        if (filterSessionId && eventSessionId && eventSessionId !== filterSessionId) {
          return
        }

        if (!part || !part.id) return

        if (part.type === "tool-use" || part.type === "tool") {
          // Only emit when we have input data (running) and haven't seen this tool call yet
          const status = (part as any).state?.status
          if (status === "running" && !seenPartIds.has(part.id)) {
            seenPartIds.add(part.id)
            handlers.onToolUse?.(part as ToolPart)
          }
        } else if (part.type === "text") {
          if (!seenPartIds.has(part.id)) {
            seenPartIds.add(part.id)
            const role = messageRoles.get(messageId) || "assistant"
            handlers.onMessageText?.(part as TextPart, role)
          }
        } else if (part.type === "reasoning") {
          if (!seenPartIds.has(part.id)) {
            seenPartIds.add(part.id)
            handlers.onReasoning?.(part as ReasoningPart)
          }
        } else if (part.type === "step-finish") {
          if (!seenPartIds.has(part.id)) {
            seenPartIds.add(part.id)
            handlers.onStepFinish?.(part as StepFinishPart)
          }
        }
        break
      }

      case "session.diff": {
        const props = event.properties as any
        const eventSessionId = props.sessionID

        // Filter by session if a filter is set
        if (filterSessionId && eventSessionId && eventSessionId !== filterSessionId) {
          return
        }

        if (props.diff) {
          handlers.onSessionDiff?.(props.diff as FileDiff[])
        }
        break
      }
    }
  }

  /**
   * Connect to the SSE stream
   */
  async function connect(): Promise<void> {
    if (status() === "connecting" || status() === "connected") {
      return
    }

    // Get the current URL value from the accessor
    const currentUrl = url()
    
    // Validate URL before attempting to connect
    if (!currentUrl) {
      log.warn("sse", "Cannot connect: URL is empty")
      return
    }

    setStatus("connecting")
    setError(undefined)

    // Per-invocation controller. `reconnect()`/`disconnect()` replace
    // `abortController`; an old connect() detects it's been superseded by
    // comparing its own controller against the current one and bails WITHOUT
    // mutating shared status — otherwise a stale loop's "disconnected" could
    // clobber a fresh connection (the post-restart reconnect wedge).
    const myController = new AbortController()
    abortController = myController

    log.info("sse", "Connecting", { url: currentUrl, directory })

    try {
      // Create the SDK client
      const client = createOpencodeClient({
        baseUrl: currentUrl,
        directory,
      })

      // Subscribe to events
      const events = await client.event.subscribe(
        { directory },
        { signal: myController.signal },
      )

      // Superseded while awaiting the subscription? Leave status to the winner.
      if (abortController !== myController) return

      // Check if subscription was successful
      if (!events.stream) {
        throw new Error("Failed to subscribe to SSE events: no stream returned")
      }

      setStatus("connected")
      // A successful connection clears the reconnect streak.
      setReconnectAttempts(0)
      log.info("sse", "Connected")

      // Process events from the stream
      for await (const event of events.stream) {
        if (abortController !== myController) return
        processEvent(event)
      }

      // Superseded after the stream ended? The newer connect() owns status.
      if (abortController !== myController) return

      // Stream ended normally (server closed it or it was exhausted). Treat as a
      // disconnect and reconnect — never fall silent.
      setStatus("disconnected")
      log.health("sse", "stream_ended", { willReconnect: shouldReconnect })

      // Attempt reconnection if appropriate
      if (shouldReconnect) {
        scheduleReconnect()
      }
    } catch (err) {
      // Superseded by a newer connect()/disconnect(), or our own controller was
      // aborted: stay silent so we don't fight the current connection.
      if (
        abortController !== myController ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        return
      }

      const connectionError = err instanceof Error ? err : new Error(String(err))
      setError(connectionError)
      setStatus("error")
      log.error("sse", "Connection error", connectionError)

      if (onError) {
        onError(connectionError)
      }

      // Attempt reconnection on error
      if (shouldReconnect) {
        scheduleReconnect()
      }
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  function scheduleReconnect(): void {
    if (!shouldReconnect) {
      return
    }

    // Calculate delay with exponential backoff (max 30 seconds)
    const attempt = reconnectAttempts()
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
    setReconnectAttempts(attempt + 1)
    log.health("sse", "reconnect_scheduled", { attempt: attempt + 1, delayMs: delay })

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null // clear the fired handle so disconnect/reconnect don't race a stale ref
      if (shouldReconnect) {
        connect()
      }
    }, delay)
  }

  /**
   * Disconnect from the SSE stream
   */
  function disconnect(): void {
    log.info("sse", "Disconnecting")
    shouldReconnect = false

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    if (abortController) {
      abortController.abort()
      abortController = null
    }

    setStatus("disconnected")
  }

  /**
   * Manually trigger a reconnection
   */
  function reconnect(): void {
    // Reset reconnection state
    setReconnectAttempts(0)
    shouldReconnect = true

    // Cancel any existing connection
    if (abortController) {
      abortController.abort()
      abortController = null
    }

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    // Reset status so connect()'s "already connecting/connected" guard passes —
    // otherwise reconnecting after a server restart silently no-ops and SSE
    // stays bound to the dead URL.
    setStatus("disconnected")

    // Start fresh connection
    connect()
  }

  // Auto-connect on mount if enabled
  onMount(() => {
    if (autoConnect) {
      connect()
    }
  })

  // Cleanup on unmount
  onCleanup(() => {
    disconnect()
  })

  return {
    status,
    error,
    reconnectAttempts,
    reconnect,
    disconnect,
  }
}
