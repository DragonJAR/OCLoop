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
 * Create (or reuse) an OpenCode SDK client for a URL.
 *
 * Memoized per URL: the client is a thin stateless wrapper, and App.tsx asks for
 * one on nearly every action — caching avoids rebuilding it ~10×. A server
 * restart that reuses the same URL reuses the same client (correct); a restart
 * on a fresh ephemeral port just gets a new entry.
 *
 * The cache is bounded: when it exceeds MAX_CACHE_SIZE entries, the oldest
 * half are evicted so a long session with many server restarts can't leak
 * stateless client wrappers indefinitely.
 */
const MAX_CACHE_SIZE = 10
const clientCache = new Map<string, OpencodeClient>()
export function createClient(url: string): OpencodeClient {
  if (clientCache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest half. Map preserves insertion order, so the first
    // entries are the stalest (from previous server URLs).
    const keysToDelete = [...clientCache.keys()].slice(0, Math.ceil(clientCache.size / 2))
    for (const key of keysToDelete) {
      clientCache.delete(key)
    }
  }
  let client = clientCache.get(url)
  if (!client) {
    client = createOpencodeClient({ baseUrl: url })
    clientCache.set(url, client)
  }
  return client
}

/**
 * Test-only: clear the module-level `clientCache` between tests.
 *
 * The cache is closure-private (not part of the public API) and accumulates
 * across test files in a single `bun test` process. Without a reset, the
 * eviction test in `api.test.ts` would have to rely on URL uniqueness and
 * could silently skip the eviction path if prior tests had already filled
 * the cache.
 *
 * Gated on `NODE_ENV === "test"` so production builds (which bundle this
 * module) cannot accidentally clear the live cache via a stray call. Bun sets
 * `NODE_ENV=test` automatically for `bun test`.
 *
 * Source: MEJORAS.md Finding 16.6.B.
 */
export function __resetClientCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") return
  clientCache.clear()
}

/**
 * Resolve the current server URL and return a cached SDK client, or `null` if
 * the URL is not yet available. Collapses the
 * `const url = server.url(); if (!url) ...; const client = createClient(url)`
 * boilerplate that previously appeared at 10+ call sites in App.tsx into a
 * single line plus a `!client` null-check.
 *
 * Source: MEJORAS.md Finding 16.2.A.
 *
 * The getter is invoked once per call (no caching at this layer — Solid's
 * `server.url` is a signal and reads are O(1)). The `createClient` cache
 * (above) still memoizes per URL.
 */
export function tryGetClient(getUrl: () => string | null): OpencodeClient | null {
  const url = getUrl()
  return url ? createClient(url) : null
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
type PromptModel = PromptAsyncParams["model"]

/** Normalize user/config model strings to the SDK's provider/model object. */
export function toSdkModel(model: string | PromptModel | undefined): PromptModel | undefined {
  if (!model) return undefined
  if (typeof model !== "string") return model
  const slash = model.indexOf("/")
  if (slash <= 0 || slash === model.length - 1) return undefined
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
}

/**
 * Create a new session
 * @returns The created session data
 */
/** Extract a human-readable message from a thrown SDK transport error. */
function sdkErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string" && error) return error
  if (error && typeof error === "object") {
    const m = (error as { message?: unknown }).message
    if (typeof m === "string" && m) return m
    try {
      return JSON.stringify(error)
    } catch {
      /* fall through */
    }
  }
  return "network or connection error (no response)"
}

/**
 * Throw a meaningful error unless an SDK call produced a 2xx response.
 *
 * Single source of truth for SDK result checking. The v2 client returns
 * `response: undefined` when the underlying fetch THREW (timeout/abort,
 * connection drop, network error) — the cause is then in `error`, not in
 * `response`. Reading `result.response.ok` directly crashes with "undefined is
 * not an object" and masks the real failure, so every call site goes through
 * here. Exported so the plan generator (`index.tsx`) uses the same path.
 *
 * NOTE: This only validates the HTTP layer (response exists + ok). The caller
 * owns data-layer validation: `result.data` may be null/undefined even when
 * ok=true. Every consumer handles this consistently — either throws an
 * explicit "empty response body" error (createSession, getSessionStatus,
 * runCreatePlan), uses a safe fallback (abortSession → `?? false`,
 * fetchMessages → `?? []`), or doesn't read data at all (sendPromptAsync, ping).
 */
export function assertResponse(
  result: { error?: unknown; response?: { ok: boolean; status: number; statusText: string } },
  op: string,
): void {
  if (!result.response) {
    throw new Error(`Failed to ${op}: ${sdkErrorMessage(result.error)}`)
  }
  if (!result.response.ok) {
    throw new Error(`Failed to ${op}: ${result.response.status} ${result.response.statusText}`)
  }
}

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

  assertResponse(result, "create session")
  if (!result.data) {
    throw new Error("Failed to create session: empty response body")
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
    /** Optional explicit model; strings must be `provider/model` for the SDK. */
    model?: string | PromptModel
  },
  opts: ApiCallOptions = {},
): Promise<void> {
  const result = await withTimeout(
    (signal) =>
      client.session.promptAsync(
        {
          sessionID: params.sessionID,
          parts: params.parts,
          agent: params.agent,
          model: toSdkModel(params.model),
        },
        { signal },
      ),
    opts.timeoutMs ?? apiTimeouts.prompt,
    "session.promptAsync",
    opts.signal,
  )

  assertResponse(result, "send prompt")
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

  assertResponse(result, "abort session")

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

  assertResponse(result, "get session status")
  if (!result.data) {
    throw new Error("Failed to get session status: empty response body")
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
        // Intentionally "unknown" for unrecognized types: a wrong "idle" could
        // lose in-progress work, a wrong "working" could wait forever. "unknown"
        // triggers the server-hung assessment path — the least dangerous fallback.
        return "unknown"
    }
  } catch {
    // Timeout / network / server hung — the probe itself failed.
    return "unknown"
  }
}
