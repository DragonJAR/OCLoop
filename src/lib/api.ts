/**
 * API facade for the OpenCode server — the single gateway every OCLoop
 * component uses to talk to it.
 *
 * Since the OpenCode v1→v2 migration every call here delegates to the
 * version-aware backend (`opencode-backend.ts`, the single translation
 * boundary that normalizes both server dialects). The classic SDK client is
 * the backend's internal detail; what this module threads through the app is
 * the `OpencodeBackend` token itself.
 *
 * Timeouts: every backend op accepts per-call `{timeoutMs, signal}`; this
 * facade resolves the process-wide defaults from `ResilienceConfig` once at
 * startup via `configureApiTimeouts` and threads them (plus per-call
 * overrides) into the backend, so a hung server can never leave the loop
 * waiting forever: a stalled request is torn down and surfaced as a
 * `TimeoutError`.
 */

import { createBackend, type BackendCallOptions, type BackendEvent, type OpencodeBackend } from "./opencode-backend"
import type { OpencodeMajor } from "./opencode-version"
import { assertResponse, toSdkModel } from "./sdk-helpers"
import { DEFAULT_RESILIENCE, type ResilienceConfig } from "./config"

// Re-exported seams shared with the backend (single source of truth) and the
// compat type surface consumers still import from this module.
export { assertResponse, toSdkModel }
export type { OpencodeClient, SessionStatus } from "@opencode-ai/sdk/v2"
export type { PromptModel } from "./sdk-helpers"
export type { OpencodeBackend, BackendCallOptions, BackendEvent }

/**
 * Everything the backend needs to talk to a just-launched server: the URL,
 * the detected major (null → the backend capability-probes on first use), and
 * the launcher-issued Authorization header (v2 servers require Basic auth;
 * v1 servers ignore it harmlessly).
 */
export interface LaunchInfo {
  url: string | null
  version?: OpencodeMajor | null
  authorization?: string
}

/** Init fields `createClient` accepts (the non-URL part of {@link LaunchInfo}). */
export interface ClientInit {
  version?: OpencodeMajor | null
  authorization?: string
}

/**
 * Create (or reuse) the OpenCode backend for a server.
 *
 * Memoized per url+directory+authorization: App.tsx asks for one on nearly
 * every action — caching avoids rebuilding it ~10×. A server restart that
 * reuses the same URL reuses the same backend (correct); a v2 restart issues
 * a fresh random password, so the authorization participates in the key and
 * the new launch gets a new entry rather than a stale 401-ing one.
 *
 * The cache is bounded: when it exceeds MAX_CACHE_SIZE entries, the oldest
 * half are evicted so a long session with many server restarts can't leak
 * stateless backends indefinitely.
 */
const MAX_CACHE_SIZE = 10
const backendCache = new Map<string, OpencodeBackend>()
export function createClient(
  url: string,
  directory?: string,
  init: ClientInit = {},
): OpencodeBackend {
  // Check for a cache HIT first. A HIT must never trigger eviction — otherwise
  // asking for an already-cached URL when the cache is full would delete the
  // oldest half (potentially including the requested URL itself if it's old,
  // forcing a needless rebuild), even though we're not inserting anything new.
  // Eviction only makes room for an insertion, so it belongs on the MISS path.
  const cacheKey = `${url}::${directory ?? ""}::${init.authorization ?? ""}`
  const cached = backendCache.get(cacheKey)
  if (cached) return cached

  // MISS: make room before inserting so the cache stays bounded.
  if (backendCache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest half. Map preserves insertion order, so the first
    // entries are the stalest (from previous server launches).
    const keysToDelete = [...backendCache.keys()].slice(0, Math.ceil(backendCache.size / 2))
    for (const key of keysToDelete) {
      backendCache.delete(key)
    }
  }
  const backend = createBackend({
    url,
    version: init.version ?? null,
    ...(init.authorization ? { authorization: init.authorization } : {}),
    ...(directory ? { directory } : {}),
  })
  backendCache.set(cacheKey, backend)
  return backend
}

/**
 * Test-only: clear the module-level `backendCache` between tests.
 *
 * The cache is closure-private (not part of the public API) and accumulates
 * across test files in a single `bun test` process. Gated on
 * `NODE_ENV === "test"` so production builds cannot accidentally clear the
 * live cache via a stray call. Bun sets `NODE_ENV=test` for `bun test`.
 */
export function __resetClientCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") return
  backendCache.clear()
}

/**
 * Resolve the current launch info and return a cached backend, or `null` if
 * the server is not ready yet. Collapses the
 * `const url = server.url(); if (!url) ...; const client = createClient(url)`
 * boilerplate that previously appeared at 10+ call sites in App.tsx into a
 * single line plus a `!client` null-check.
 *
 * The getter is invoked once per call (no caching at this layer — Solid's
 * signals are O(1) reads). The `createClient` cache (above) still memoizes
 * per launch.
 */
export function tryGetClient(
  getInfo: () => LaunchInfo,
  directory?: string,
): OpencodeBackend | null {
  const info = getInfo()
  return info.url ? createClient(info.url, directory, info) : null
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

/** Resolved per-call options threading the configured timeout + caller signal. */
function callOpts(
  opts: ApiCallOptions,
  timeoutMs: number,
): BackendCallOptions {
  return { timeoutMs: opts.timeoutMs ?? timeoutMs, ...(opts.signal ? { signal: opts.signal } : {}) }
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

/** Parameters accepted for a prompt, in the SDK's `TextPartInput` shape. */
export type PromptParts = NonNullable<
  Parameters<OpencodeBackend["sendPrompt"]>[0]["parts"]
>

/**
 * Create a new session.
 * @returns The created session's id and title.
 */
export async function createSession(
  backend: OpencodeBackend,
  opts: ApiCallOptions = {},
): Promise<{ id: string; title: string }> {
  return backend.createSession(callOpts(opts, apiTimeouts.create))
}

/**
 * Send a prompt to a session asynchronously (returns immediately).
 * The session processes the prompt in the background.
 */
export async function sendPromptAsync(
  backend: OpencodeBackend,
  params: {
    sessionID: string
    parts: PromptParts
    agent?: string
    /** Optional explicit model; strings must be `provider/model`. */
    model?: string | { providerID: string; modelID: string }
  },
  opts: ApiCallOptions = {},
): Promise<void> {
  await backend.sendPrompt(params, callOpts(opts, apiTimeouts.prompt))
}

/**
 * Abort a running session
 * @returns true if the session was successfully aborted
 */
export async function abortSession(
  backend: OpencodeBackend,
  sessionId: string,
  opts: ApiCallOptions = {},
): Promise<boolean> {
  return backend.abortSession(sessionId, callOpts(opts, apiTimeouts.abort))
}

/**
 * Get the raw status of a single session.
 *
 * The server returns a verdict keyed by session id where a status is
 * `{type:"idle"} | {type:"busy"} | {type:"retry",...}`. We return our
 * session's status, or `undefined` if the server no longer knows about it.
 */
export async function getSessionStatus(
  backend: OpencodeBackend,
  sessionId: string,
  opts: ApiCallOptions = {},
): Promise<{ type: "idle" | "busy" | "retry" } | undefined> {
  return backend.getSessionStatus(sessionId, callOpts(opts, apiTimeouts.status))
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
  backend: OpencodeBackend,
  sessionId: string,
  opts: ApiCallOptions = {},
): Promise<ReconcileResult> {
  try {
    const status = await getSessionStatus(backend, sessionId, opts)
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

/** One session message (info + parts) as returned by `fetchMessages`. */
export type SessionMessage = {
  info?: { role?: string }
  parts?: Array<{ type?: string; text?: string }>
}

/** Concatenated text parts of a single message. */
function extractMessageText(
  data: { parts?: Array<{ type?: string; text?: string }> } | undefined,
): string {
  if (!data?.parts) return ""
  return data.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim()
}

/** Fetch a session's messages, surfacing transport/HTTP errors consistently. */
export async function fetchMessages(
  backend: OpencodeBackend,
  sessionID: string,
  opts: ApiCallOptions = {},
): Promise<SessionMessage[]> {
  return backend.fetchMessages(sessionID, callOpts(opts, apiTimeouts.status))
}

/** Text of the most recent assistant message (the model's latest reply). */
export function extractLastAssistantText(messages: SessionMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.info?.role === "assistant") return extractMessageText(messages[i])
  }
  return ""
}

/** Count assistant messages in a session snapshot. */
export function countAssistantMessages(messages: SessionMessage[]): number {
  return messages.filter((message) => message.info?.role === "assistant").length
}

/** True once a new, non-empty assistant reply has landed after the prompt. */
export function hasNewAssistantReply(
  messages: SessionMessage[],
  assistantCountBefore: number,
): boolean {
  return (
    countAssistantMessages(messages) > assistantCountBefore &&
    extractLastAssistantText(messages).length > 0
  )
}
