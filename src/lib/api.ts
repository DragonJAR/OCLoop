/**
 * API helpers for the OpenCode SDK — the single gateway every OCLoop component
 * uses to talk to the server.
 *
 * Every call here is wrapped in `withTimeout` and forwards an `AbortSignal` to
 * the SDK, so a hung server can never leave the loop waiting forever: a stalled
 * request is torn down and surfaced as a `TimeoutError`. Timeouts are resolved
 * from `ResilienceConfig` once at startup via `configureApiTimeouts`; individual
 * calls may override per-call (used by tests and the watchdog probes).
 */

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2"
import type { SessionStatus } from "@opencode-ai/sdk/v2"
import { withTimeout } from "./with-timeout"
import { DEFAULT_RESILIENCE, type ResilienceConfig } from "./config"

export type { OpencodeClient, SessionStatus }

/**
 * Create an OpenCode SDK client
 */
export function createClient(url: string): OpencodeClient {
  return createOpencodeClient({ baseUrl: url })
}

/**
 * Per-call overrides shared by every wrapper.
 */
export interface ApiCallOptions {
  /** Override the configured timeout for this call (ms). `0` disables it. */
  timeoutMs?: number
  /** Caller signal, combined with the timeout signal (abort if either fires). */
  signal?: AbortSignal
}

/**
 * Resolved, process-wide timeouts. Defaults keep `api.ts` usable with zero
 * setup (and deterministic in tests); `configureApiTimeouts` overrides them
 * once the resilience config is resolved at startup.
 */
let apiTimeouts = {
  create: DEFAULT_RESILIENCE.createTimeoutMs,
  prompt: DEFAULT_RESILIENCE.promptTimeoutMs,
  abort: DEFAULT_RESILIENCE.abortTimeoutMs,
  status: DEFAULT_RESILIENCE.statusTimeoutMs,
  ping: DEFAULT_RESILIENCE.pingTimeoutMs,
}

/**
 * Apply resolved resilience timeouts to every wrapper. Call once at startup.
 */
export function configureApiTimeouts(
  r: Pick<
    ResilienceConfig,
    | "createTimeoutMs"
    | "promptTimeoutMs"
    | "abortTimeoutMs"
    | "statusTimeoutMs"
    | "pingTimeoutMs"
  >,
): void {
  apiTimeouts = {
    create: r.createTimeoutMs,
    prompt: r.promptTimeoutMs,
    abort: r.abortTimeoutMs,
    status: r.statusTimeoutMs,
    ping: r.pingTimeoutMs,
  }
}

/** Read the currently-configured timeouts (used by the server health ping). */
export function getApiTimeouts(): Readonly<typeof apiTimeouts> {
  return apiTimeouts
}

/**
 * Session data returned from session.create
 */
export interface Session {
  id: string
  projectID: string
  directory: string
  parentID?: string
  title: string
  version: string
  time: {
    created: number
    updated: number
    compacting?: number
    archived?: number
  }
}

/** Parameters accepted by the SDK's promptAsync, derived to stay in sync. */
type PromptAsyncParams = Parameters<OpencodeClient["session"]["promptAsync"]>[0]

/**
 * Create a new session
 * @returns The created session data
 */
export async function createSession(
  client: OpencodeClient,
  opts: ApiCallOptions = {},
): Promise<Session> {
  const result = await withTimeout(
    (signal) => client.session.create({}, { signal }),
    opts.timeoutMs ?? apiTimeouts.create,
    "session.create",
    opts.signal,
  )

  if (!result.response.ok || !result.data) {
    throw new Error(
      `Failed to create session: ${result.response.status} ${result.response.statusText}`,
    )
  }

  return result.data
}

/**
 * Send a prompt to a session asynchronously (returns immediately).
 * The session processes the prompt in the background.
 */
export async function sendPromptAsync(
  client: OpencodeClient,
  params: {
    sessionID: string
    parts: NonNullable<PromptAsyncParams["parts"]>
    agent?: string
  },
  opts: ApiCallOptions = {},
): Promise<void> {
  const result = await withTimeout(
    (signal) =>
      client.session.promptAsync(
        { sessionID: params.sessionID, parts: params.parts, agent: params.agent },
        { signal },
      ),
    opts.timeoutMs ?? apiTimeouts.prompt,
    "session.promptAsync",
    opts.signal,
  )

  if (!result.response.ok) {
    throw new Error(
      `Failed to send prompt: ${result.response.status} ${result.response.statusText}`,
    )
  }
}

/**
 * Abort a running session
 * @returns true if the session was successfully aborted
 */
export async function abortSession(
  client: OpencodeClient,
  sessionId: string,
  opts: ApiCallOptions = {},
): Promise<boolean> {
  const result = await withTimeout(
    (signal) => client.session.abort({ sessionID: sessionId }, { signal }),
    opts.timeoutMs ?? apiTimeouts.abort,
    "session.abort",
    opts.signal,
  )

  if (!result.response.ok) {
    throw new Error(
      `Failed to abort session: ${result.response.status} ${result.response.statusText}`,
    )
  }

  return result.data ?? false
}

/**
 * Get the raw status of a single session.
 *
 * The server returns a record keyed by session id (`{ [id]: SessionStatus }`),
 * where a status is `{type:"idle"} | {type:"busy"} | {type:"retry",...}`. We
 * look up our session and return its status, or `undefined` if the server no
 * longer knows about it.
 */
export async function getSessionStatus(
  client: OpencodeClient,
  sessionId: string,
  opts: ApiCallOptions = {},
): Promise<SessionStatus | undefined> {
  const result = await withTimeout(
    (signal) => client.session.status({}, { signal }),
    opts.timeoutMs ?? apiTimeouts.status,
    "session.status",
    opts.signal,
  )

  if (!result.response.ok || !result.data) {
    throw new Error(
      `Failed to get session status: ${result.response.status} ${result.response.statusText}`,
    )
  }

  return result.data[sessionId]
}

/**
 * Ground-truth verdict about a session, used by the watchdog and the
 * sleep/restart recovery paths to decide what to do WITHOUT guessing:
 *
 * - `working` — the server says the session is busy (or server-side retrying a
 *   rate limit). Do not touch it; the model is making progress.
 * - `idle`    — the session finished. We likely missed its `session.idle`
 *   event (SSE dropped during sleep/disconnect); synthesize one and advance.
 * - `missing` — the server no longer knows this session; treat like idle.
 * - `unknown` — the status call itself failed or timed out. That is itself a
 *   signal that the SERVER is hung, distinct from any verdict about the session.
 *
 * This function never throws: a failed/timed-out probe becomes `"unknown"`.
 */
export type ReconcileResult = "working" | "idle" | "missing" | "unknown"

export async function reconcileSession(
  client: OpencodeClient,
  sessionId: string,
  opts: ApiCallOptions = {},
): Promise<ReconcileResult> {
  try {
    const status = await getSessionStatus(client, sessionId, opts)
    if (!status) return "missing"
    switch (status.type) {
      case "idle":
        return "idle"
      case "busy":
      case "retry":
        // "retry" = server is waiting out a provider rate limit. The session is
        // alive and will resume on its own, so it counts as working.
        return "working"
      default:
        return "unknown"
    }
  } catch {
    // Timeout / network / server hung — the probe itself failed.
    return "unknown"
  }
}
