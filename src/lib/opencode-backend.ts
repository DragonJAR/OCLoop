/**
 * The single translation boundary between OCLoop's v1-shaped API and
 * OpenCode's 1.x and 2.x server dialects.
 */

import { createOpencodeClient, type OpencodeClient, type TextPartInput } from "@opencode-ai/sdk/v2"
import { assertResponse, toSdkModel } from "./sdk-helpers"
import { DEFAULT_RESILIENCE } from "./config"
import type { ModelCatalogEntry } from "./fetch-models"
import type { OcAgent, OcConfig } from "./resolve-agent-model"
import type { OpencodeMajor } from "./opencode-version"
import { withTimeout } from "./with-timeout"

export type BackendEvent = { type: string; properties: Record<string, unknown> }

/** Per-call overrides accepted by every backend operation. */
export interface BackendCallOptions {
  /** Override the default timeout for this call (ms). */
  timeoutMs?: number
  /** Caller signal — aborts the call (combined with the timeout signal). */
  signal?: AbortSignal
}

export interface OpencodeBackend {
  /** For an unknown version this reads as v1 until the first async operation
   * resolves the capability probe; subsequent reads return the verdict. */
  version: OpencodeMajor
  url: string
  createSession(opts?: BackendCallOptions): Promise<{ id: string; title: string }>
  sendPrompt(p: {
    sessionID: string
    parts: TextPartInput[]
    agent?: string
    model?: string | { providerID: string; modelID: string }
  }, opts?: BackendCallOptions): Promise<void>
  abortSession(id: string, opts?: BackendCallOptions): Promise<boolean>
  getSessionStatus(id: string, opts?: BackendCallOptions): Promise<{ type: "idle" | "busy" | "retry" } | undefined>
  fetchMessages(id: string, opts?: BackendCallOptions): Promise<Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }>>
  fetchAgents(opts?: BackendCallOptions): Promise<OcAgent[]>
  fetchConfig(opts?: BackendCallOptions): Promise<OcConfig>
  fetchProviderCatalog(opts?: BackendCallOptions): Promise<ModelCatalogEntry[]>
  subscribeEvents(opts: { directory?: string; signal: AbortSignal; timeoutMs?: number }): Promise<{ stream: AsyncIterable<BackendEvent> }>
}

export interface CreateBackendOptions {
  url: string
  version: OpencodeMajor | null
  authorization?: string
  directory?: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function authHeader(passwordHeader?: string): string {
  return passwordHeader ?? `Basic ${btoa("opencode:")}`
}

function isMajor(value: unknown): value is OpencodeMajor {
  return value === 1 || value === 2
}

/** Classify capability-probe bodies without doing I/O. */
export function resolveOpencodeMajor(
  apiInfo: unknown,
  legacyConfig: unknown,
): OpencodeMajor | null {
  if (isRecord(apiInfo)) {
    const rawVersion = apiInfo.version
    if (typeof rawVersion === "string") {
      const match = rawVersion.match(/(?:^|\D)([12])(?:\.|$)/)
      if (match) {
        const major = Number(match[1])
        if (isMajor(major)) return major
      }
    }
    // /api/info is a JSON-only v2 capability. Do not mistake a v1 JSON error
    // object for it: a valid info response contains at least one info field.
    if ("pid" in apiInfo || "urls" in apiInfo || "paths" in apiInfo) return 2
  }
  if (isRecord(legacyConfig)) return 1
  return null
}

/** Unwrap the SDK's v2 location/data wrapper. */
export function unwrapV2Data(payload: unknown): unknown {
  if (!isRecord(payload)) return undefined
  return payload.data
}

export interface NormalizedV2Envelope {
  id?: string
  type: string
  data: UnknownRecord
}

/** Normalize a native v2 event envelope. Malformed envelopes are ignored. */
export function normalizeV2Envelope(raw: unknown): NormalizedV2Envelope | undefined {
  if (!isRecord(raw) || typeof raw.type !== "string" || !isRecord(raw.data)) return undefined
  return {
    ...(typeof raw.id === "string" ? { id: raw.id } : {}),
    type: raw.type,
    data: raw.data,
  }
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function makeHeartbeat(sessionID: string, id: string, messageID?: string): BackendEvent {
  const assistantID = messageID ?? `activity:${sessionID}`
  return {
    type: "message.part.updated",
    properties: {
      part: {
        id: `v2-heartbeat:${id}`,
        messageID: assistantID,
        sessionID,
        type: "step-finish",
        state: { status: "completed" },
        tokens: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      },
    },
  }
}

function mapTextEnd(data: UnknownRecord, type: "text" | "reasoning"): BackendEvent[] {
  const sessionID = typeof data.sessionID === "string" ? data.sessionID : undefined
  const messageID = typeof data.assistantMessageID === "string" ? data.assistantMessageID : undefined
  const text = typeof data.text === "string" ? data.text : undefined
  if (!sessionID || !messageID || text === undefined) return []
  return [
    {
      type: "message.updated",
      properties: { info: { id: messageID, role: "assistant", sessionID } },
    },
    {
      type: "message.part.updated",
      properties: {
        part: {
          id: `${messageID}:${String(data.ordinal ?? 0)}:${type}`,
          messageID,
          sessionID,
          type,
          text,
          state: { status: "completed" },
        },
      },
    },
  ]
}

/**
 * Map observed v2 public events to the exact event names and property shapes
 * consumed by useSSE. Unknown v2 events intentionally produce no output.
 */
export function mapV2EnvelopeToV1(raw: unknown): BackendEvent[] {
  const envelope = normalizeV2Envelope(raw)
  if (!envelope) return []
  const { type, data } = envelope
  const sessionID = typeof data.sessionID === "string" ? data.sessionID : undefined
  const id = envelope.id ?? `${type}:${sessionID ?? "server"}`

  if (type === "session.created" && sessionID) {
    return [{ type, properties: { info: { id: sessionID } } }]
  }

  if (type === "session.inbox.enqueued" && sessionID && isRecord(data.item)) {
    const item = data.item
    const payload = isRecord(item.payload) ? item.payload : undefined
    const messageID = typeof data.inboxID === "string" ? data.inboxID : undefined
    const text = typeof payload?.text === "string" ? payload.text : undefined
    if (messageID && text !== undefined) {
      return [
        { type: "message.updated", properties: { info: { id: messageID, role: "user", sessionID } } },
        {
          type: "message.part.updated",
          properties: {
            part: {
              id: messageID,
              messageID,
              sessionID,
              type: "text",
              text,
              state: { status: "completed" },
            },
          },
        },
      ]
    }
    return [makeHeartbeat(sessionID, id)]
  }

  if (type === "session.execution.succeeded" || type === "session.execution.interrupted") {
    return sessionID ? [{ type: "session.idle", properties: { sessionID } }] : []
  }

  if (type === "session.execution.failed") {
    return sessionID
      ? [{ type: "session.error", properties: { sessionID, error: data.error ?? "OpenCode execution failed" } }]
      : []
  }

  if (type === "session.text.ended") return mapTextEnd(data, "text")
  if (type === "session.reasoning.ended") return mapTextEnd(data, "reasoning")

  if (type === "session.step.ended" && sessionID) {
    const messageID = typeof data.assistantMessageID === "string" ? data.assistantMessageID : undefined
    const usage = isRecord(data.tokens) ? data.tokens : {}
    if (!messageID) return [makeHeartbeat(sessionID, id)]
    return [
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: `${messageID}:step:${id}`,
            messageID,
            sessionID,
            type: "step-finish",
            state: { status: "completed" },
            tokens: {
              input: numberValue(usage.input),
              output: numberValue(usage.output),
              cache: {
                read: numberValue(isRecord(usage.cache) ? usage.cache.read : undefined),
                write: numberValue(isRecord(usage.cache) ? usage.cache.write : undefined),
              },
            },
          },
        },
      },
    ]
  }

  if (type === "session.tool.input.started" && sessionID) {
    const callID = typeof data.id === "string" ? data.id : id
    const messageID = typeof data.assistantMessageID === "string" ? data.assistantMessageID : `tool:${sessionID}`
    const tool = typeof data.name === "string" ? data.name : "tool"
    return [
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: callID,
            messageID,
            sessionID,
            type: "tool",
            tool,
            state: { tool, input: {}, status: "running" },
          },
        },
      },
    ]
  }

  if (type === "filesystem.changed" && typeof data.file === "string") {
    return [{ type: "file.edited", properties: { file: data.file } }]
  }

  // Every other session-scoped lifecycle/text/tool event refreshes activity.
  // The synthetic v1 step-finish is stable in shape and cannot create log text.
  const activityTypes = new Set([
    "session.inbox.delivered",
    "session.execution.started",
    "session.instructions.updated",
    "session.step.started",
    "session.step.streamed",
    "session.step.failed",
    "session.reasoning.started",
    "session.reasoning.delta",
    "session.text.started",
    "session.text.delta",
    "session.tool.input.ended",
    "session.tool.called",
    "session.tool.progress",
    "session.tool.success",
    "session.tool.failed",
    "session.usage.updated",
    "session.renamed",
  ])
  return sessionID && activityTypes.has(type) ? [makeHeartbeat(sessionID, id, typeof data.assistantMessageID === "string" ? data.assistantMessageID : undefined)] : []
}

function deepMerge(target: UnknownRecord, source: UnknownRecord): UnknownRecord {
  const result: UnknownRecord = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const prior = result[key]
    result[key] = isRecord(prior) && isRecord(value) ? deepMerge(prior, value) : value
  }
  return result
}

/** Merge ordered v2 Config.Entry documents into the resolved config view. */
export function parseV2Config(payload: unknown): OcConfig {
  if (!Array.isArray(payload)) return {}
  let merged: UnknownRecord = {}
  for (const entry of payload) {
    if (!isRecord(entry) || entry.type !== "document" || !isRecord(entry.info)) continue
    merged = deepMerge(merged, entry.info)
  }
  return merged as OcConfig
}

function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const first = unwrapV2Data(payload)
  if (Array.isArray(first)) return first
  if (isRecord(first) && Array.isArray(first.data)) return first.data
  return []
}

function activationAllows(provider: UnknownRecord): boolean {
  if (provider.disabled === true) return false
  const activation = provider.activation
  if (activation === undefined) return true // provider.list contains active providers
  if (activation === true || activation === "active" || activation === "enabled") return true
  if (activation === false || activation === "inactive" || activation === "disabled") return false
  if (isRecord(activation)) {
    if (typeof activation.active === "boolean") return activation.active
    if (typeof activation.enabled === "boolean") return activation.enabled
    const states = Object.values(activation)
    if (states.length > 0) return states.some((state) => state === true || state === "active")
  }
  return false
}

/**
 * Flatten the v1 provider-list response (`{connected, all}`) into a pickable
 * catalog of connected models — the v1 sibling of `parseV2ProviderCatalog`.
 * Only providers with valid credentials can actually serve a model.
 */
export function parseV1ProviderCatalog(payload: unknown): ModelCatalogEntry[] {
  if (!isRecord(payload)) return []
  const connected = new Set(
    Array.isArray(payload.connected)
      ? payload.connected.filter((id): id is string => typeof id === "string")
      : [],
  )
  const all = Array.isArray(payload.all) ? payload.all : []
  const entries: ModelCatalogEntry[] = []
  for (const raw of all) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue
    const providerID = raw.id
    if (!connected.has(providerID)) continue
    const models: unknown = raw.models
    if (Array.isArray(models)) {
      for (const item of models) {
        if (typeof item === "string") entries.push({ id: `${providerID}/${item}`, name: item, provider: providerID })
        else if (isRecord(item) && typeof item.id === "string") entries.push({ id: `${providerID}/${item.id}`, name: typeof item.name === "string" ? item.name : item.id, provider: providerID })
      }
      continue
    }
    if (models && typeof models === "object") {
      for (const [modelID, model] of Object.entries(models)) {
        entries.push({ id: `${providerID}/${modelID}`, name: isRecord(model) && typeof model.name === "string" ? model.name : modelID, provider: providerID })
      }
    }
  }
  return entries
}

/**
 * Join v2's active provider metadata with its separate model list. The v2
 * provider endpoint itself is the connected/active set; explicit disabled or
 * inactive activation records are always excluded.
 */
export function parseV2ProviderCatalog(providerPayload: unknown, modelPayload: unknown): ModelCatalogEntry[] {  const activeProviders = new Map<string, string>()
  for (const item of unwrapList(providerPayload)) {
    if (!isRecord(item) || typeof item.id !== "string" || !activationAllows(item)) continue
    activeProviders.set(item.id, typeof item.name === "string" ? item.name : item.id)
  }

  const entries: ModelCatalogEntry[] = []
  for (const item of unwrapList(modelPayload)) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.providerID !== "string") continue
    const provider = activeProviders.get(item.providerID)
    if (!provider) continue
    entries.push({
      id: `${item.providerID}/${item.id}`,
      name: typeof item.name === "string" && item.name ? item.name : item.id,
      provider: item.providerID,
    })
  }
  return entries
}

function parseV2Agent(item: unknown): OcAgent | undefined {
  if (!isRecord(item) || typeof item.id !== "string") return undefined
  const model = isRecord(item.model) && typeof item.model.providerID === "string" && typeof item.model.id === "string"
    ? { providerID: item.model.providerID, modelID: item.model.id }
    : undefined
  const mode = item.mode === "subagent" || item.mode === "primary" || item.mode === "all" ? item.mode : "primary"
  return {
    name: item.id,
    mode,
    ...(model ? { model } : {}),
    ...(typeof item.profile === "string" ? { profile: item.profile } : {}),
    ...(typeof item.role === "string" ? { role: item.role } : {}),
    ...(typeof item.description === "string" ? { description: item.description } : {}),
    ...(typeof item.hidden === "boolean" ? { hidden: item.hidden } : {}),
    ...(item.permissions !== undefined ? { permission: item.permissions } : {}),
    ...(typeof item.default === "boolean" ? { default: item.default, isDefault: item.default } : {}),
  }
}

/** Map the v2 location/data agent-list response to resolve-agent-model's view. */
export function parseV2Agents(payload: unknown): OcAgent[] {
  return unwrapList(payload).map(parseV2Agent).filter((agent): agent is OcAgent => agent !== undefined)
}

function parseV2Messages(payload: unknown): Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }> {
  const rawMessages = unwrapList(payload)
  const messages: Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }> = []
  for (const raw of rawMessages) {
    if (!isRecord(raw)) continue
    if (raw.type === "user" && typeof raw.id === "string") {
      messages.push({ info: { id: raw.id, role: "user" }, parts: typeof raw.text === "string" ? [{ type: "text", text: raw.text }] : [] })
      continue
    }
    if (raw.type !== "assistant" || typeof raw.id !== "string") continue
    const parts = Array.isArray(raw.content)
      ? raw.content.flatMap((part) => {
          if (!isRecord(part) || (part.type !== "text" && part.type !== "reasoning") || typeof part.text !== "string") return []
          return [{ type: part.type, text: part.text }]
        })
      : []
    messages.push({ info: { id: raw.id, role: "assistant" }, parts })
  }
  return messages
}

function parseV1Event(raw: unknown): BackendEvent | undefined {
  if (!isRecord(raw) || typeof raw.type !== "string" || !isRecord(raw.properties)) return undefined
  return { type: raw.type, properties: raw.properties }
}

export function createBackend(init: CreateBackendOptions): OpencodeBackend {
  const authorization = authHeader(init.authorization)
  const client: OpencodeClient = createOpencodeClient({
    baseUrl: init.url,
    headers: { Authorization: authorization },
    ...(init.directory ? { directory: init.directory } : {}),
  })
  let resolvedVersion = init.version
  let versionProbe: Promise<OpencodeMajor> | undefined

  async function request(path: string, label: string, options: RequestInit = {}, timeoutMs = DEFAULT_RESILIENCE.statusTimeoutMs, callerSignal?: AbortSignal): Promise<Response> {
    const response = await withTimeout(
      (signal) => fetch(`${init.url.replace(/\/$/, "")}${path}`, {
        ...options,
        signal,
        headers: {
          Authorization: authorization,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      }),
      timeoutMs,
      label,
      callerSignal,
    )
    assertResponse({ response }, label)
    return response
  }

  async function requestJson(path: string, label: string, options: RequestInit = {}, timeoutMs?: number, callerSignal?: AbortSignal): Promise<unknown> {
    return withTimeout(async (signal) => {
      const response = await fetch(`${init.url.replace(/\/$/, "")}${path}`, {
        ...options,
        signal,
        headers: {
          Authorization: authorization,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      })
      assertResponse({ response }, label)
      try {
        return await response.json() as unknown
      } catch {
        throw new Error(`Failed to ${label}: response was not valid JSON`)
      }
    }, timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs, label, callerSignal)
  }

  async function verifyEventHandshake(
    path: string,
    label: string,
    timeoutMs: number,
    callerSignal: AbortSignal,
  ): Promise<void> {
    await withTimeout(async (signal) => {
      const response = await fetch(`${init.url.replace(/\/$/, "")}${path}`, {
        headers: {
          Authorization: authorization,
          Accept: "text/event-stream",
        },
        signal,
      })
      try {
        assertResponse({ response }, label)
      } finally {
        try {
          await response.body?.cancel()
        } catch {
          // Cancelling the short-lived probe is best-effort; preserve the
          // handshake status or transport error for the caller.
        }
      }
    }, timeoutMs, label, callerSignal)
  }

  async function probeVersion(opts?: BackendCallOptions): Promise<OpencodeMajor> {
    const probeBudgetMs = opts?.timeoutMs ?? DEFAULT_RESILIENCE.pingTimeoutMs
    // Split one probe budget evenly: /api/info gets the first half and /config
    // gets the second half if the first response is absent or unrecognized.
    const perProbeTimeoutMs = probeBudgetMs / 2
    let apiInfo: unknown
    try {
      apiInfo = await withTimeout(
        async (signal) => {
          const response = await fetch(`${init.url.replace(/\/$/, "")}/api/info`, { signal, headers: { Authorization: authorization } })
          if (!response.ok) return undefined
          try { return await response.json() as unknown } catch { return undefined }
        },
        perProbeTimeoutMs,
        "probe OpenCode /api/info",
        opts?.signal,
      )
    } catch (error) {
      if (opts?.signal?.aborted) throw error
      /* Try the v1 route after a missing/invalid v2 probe. */
    }
    const fromInfo = resolveOpencodeMajor(apiInfo, undefined)
    if (fromInfo) return fromInfo

    let legacyConfig: unknown
    try {
      legacyConfig = await withTimeout(
        async (signal) => {
          const response = await fetch(`${init.url.replace(/\/$/, "")}/config`, { signal, headers: { Authorization: authorization } })
          if (!response.ok) return undefined
          try { return await response.json() as unknown } catch { return undefined }
        },
        perProbeTimeoutMs,
        "probe OpenCode /config",
        opts?.signal,
      )
    } catch (error) {
      if (opts?.signal?.aborted) throw error
      /* A failed JSON parse means this was likely the v2 SPA route. */
    }
    const fromConfig = resolveOpencodeMajor(apiInfo, legacyConfig)
    if (fromConfig) return fromConfig
    throw new Error("Failed to detect OpenCode server version: /api/info and /config did not return a recognized JSON response")
  }

  function ensureVersion(opts?: BackendCallOptions): Promise<OpencodeMajor> {
    if (resolvedVersion !== null) return Promise.resolve(resolvedVersion)
    if (!versionProbe) {
      versionProbe = probeVersion(opts).then((version) => {
        resolvedVersion = version
        return version
      }).catch((error: unknown) => {
        versionProbe = undefined
        throw error
      })
    }
    return versionProbe
  }

  async function v1CreateSession(opts?: BackendCallOptions): Promise<{ id: string; title: string }> {
    const result = await withTimeout(
      (signal) => client.session.create({ directory: init.directory }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.createTimeoutMs,
      "session.create",
      opts?.signal,
    )
    assertResponse(result, "create session")
    if (!result.data || typeof result.data.id !== "string") throw new Error("Failed to create session: empty response body")
    return { id: result.data.id, title: result.data.title ?? "" }
  }

  async function v2CreateSession(opts?: BackendCallOptions): Promise<{ id: string; title: string }> {
    const result = await withTimeout(
      (signal) => client.v2.session.create({ location: init.directory ? { directory: init.directory } : undefined }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.createTimeoutMs,
      "v2 session.create",
      opts?.signal,
    )
    assertResponse(result, "create session")
    const data = unwrapV2Data(result.data)
    if (!isRecord(data) || typeof data.id !== "string") throw new Error("Failed to create session: empty response body")
    return { id: data.id, title: typeof data.title === "string" ? data.title : "" }
  }

  async function v1SendPrompt(params: { sessionID: string; parts: TextPartInput[]; agent?: string; model?: string | { providerID: string; modelID: string } }, opts?: BackendCallOptions): Promise<void> {
    const result = await withTimeout(
      (signal) => client.session.promptAsync({
        sessionID: params.sessionID,
        parts: params.parts,
        agent: params.agent,
        model: toSdkModel(params.model),
        directory: init.directory,
      }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.promptTimeoutMs,
      "session.promptAsync",
      opts?.signal,
    )
    assertResponse(result, "send prompt")
  }

  async function v2SendPrompt(params: { sessionID: string; parts: TextPartInput[]; agent?: string; model?: string | { providerID: string; modelID: string } }, opts?: BackendCallOptions): Promise<void> {
    const text = params.parts.map((part) => part.text).join("")
    const body: UnknownRecord = { text, resume: true }
    if (params.agent) body.agent = params.agent
    const model = toSdkModel(params.model)
    if (model) body.model = { id: model.modelID, providerID: model.providerID }
    await request(
      `/api/session/${encodeURIComponent(params.sessionID)}/prompt`,
      "send v2 prompt",
      { method: "POST", body: JSON.stringify(body) },
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.promptTimeoutMs,
      opts?.signal,
    )
  }

  async function v1AbortSession(id: string, opts?: BackendCallOptions): Promise<boolean> {
    const result = await withTimeout(
      (signal) => client.session.abort({ sessionID: id, directory: init.directory }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.abortTimeoutMs,
      "session.abort",
      opts?.signal,
    )
    assertResponse(result, "abort session")
    return result.data ?? false
  }

  async function v2AbortSession(id: string, opts?: BackendCallOptions): Promise<boolean> {
    const result = await withTimeout(
      (signal) => client.v2.session.interrupt({ sessionID: id }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.abortTimeoutMs,
      "v2 session.interrupt",
      opts?.signal,
    )
    assertResponse(result, "interrupt session")
    const data = isRecord(result.data) && typeof result.data.interrupted === "boolean"
      ? result.data
      : unwrapV2Data(result.data)
    return isRecord(data) && typeof data.interrupted === "boolean" ? data.interrupted : false
  }

  async function v1Status(id: string, opts?: BackendCallOptions): Promise<{ type: "idle" | "busy" | "retry" } | undefined> {
    const result = await withTimeout(
      (signal) => client.session.status({ directory: init.directory }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
      "session.status",
      opts?.signal,
    )
    assertResponse(result, "get session status")
    if (!result.data) throw new Error("Failed to get session status: empty response body")
    const status = result.data[id]
    return status && (status.type === "idle" || status.type === "busy" || status.type === "retry") ? status : undefined
  }

  async function v2Status(id: string, opts?: BackendCallOptions): Promise<{ type: "idle" | "busy" } | undefined> {
    const result = await withTimeout(
      (signal) => client.v2.session.active({ signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
      "v2 session.active",
      opts?.signal,
    )
    assertResponse(result, "get active sessions")
    const data = unwrapV2Data(result.data)
    if (!isRecord(data)) throw new Error("Failed to get active sessions: empty response body")
    if (Object.prototype.hasOwnProperty.call(data, id)) return { type: "busy" }

    const session = await withTimeout(
      (signal) => client.v2.session.get({ sessionID: id }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
      "v2 session.get",
      opts?.signal,
    )
    if (session.response?.status === 404) return undefined
    assertResponse(session, "get session")
    if (!isRecord(unwrapV2Data(session.data))) throw new Error("Failed to get session: empty response body")
    return { type: "idle" }
  }

  async function v1Messages(id: string, opts?: BackendCallOptions): Promise<Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }>> {
    const result = await withTimeout(
      (signal) => client.session.messages({ sessionID: id, directory: init.directory }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
      "session.messages",
      opts?.signal,
    )
    assertResponse(result, "read session messages")
    return Array.isArray(result.data) ? result.data : []
  }

  async function v2Messages(id: string, opts?: BackendCallOptions): Promise<Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }>> {
    const messages: unknown[] = []
    let cursor: string | undefined
    const seenCursors = new Set<string>()
    while (messages.length < 200) {
      const result = await withTimeout(
        (signal) => client.v2.session.messages({
          sessionID: id,
          limit: Math.min(100, 200 - messages.length),
          ...(!cursor ? { order: "asc" as const } : {}),
          ...(cursor ? { cursor } : {}),
        }, { signal }),
        opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
        "v2 session.messages",
        opts?.signal,
      )
      assertResponse(result, "read session messages")
      let page: unknown = result.data
      if (isRecord(page) && isRecord(page.data) && Array.isArray(page.data.data)) page = page.data
      if (Array.isArray(page)) {
        messages.push(...page)
        break
      }
      if (!isRecord(page) || !Array.isArray(page.data)) break
      messages.push(...page.data)
      const next = isRecord(page.cursor) && typeof page.cursor.next === "string" ? page.cursor.next : undefined
      if (!next || seenCursors.has(next) || page.data.length === 0) break
      seenCursors.add(next)
      cursor = next
    }
    return parseV2Messages(messages.slice(0, 200))
  }

  async function v1Agents(opts?: BackendCallOptions): Promise<OcAgent[]> {
    const result = await withTimeout(
      (signal) => client.app.agents({ directory: init.directory }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
      "app.agents",
      opts?.signal,
    )
    assertResponse(result, "list agents")
    return Array.isArray(result.data) ? result.data as OcAgent[] : []
  }

  async function v2Agents(opts?: BackendCallOptions): Promise<OcAgent[]> {
    const result = await withTimeout(
      (signal) => client.v2.agent.list({ location: init.directory ? { directory: init.directory } : undefined }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
      "v2 agent.list",
      opts?.signal,
    )
    assertResponse(result, "list agents")
    return parseV2Agents(result.data)
  }

  async function v1Config(opts?: BackendCallOptions): Promise<OcConfig> {
    const result = await withTimeout(
      (signal) => client.config.get({ directory: init.directory }, { signal }),
      opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
      "config.get",
      opts?.signal,
    )
    assertResponse(result, "get config")
    return isRecord(result.data) ? result.data as OcConfig : {}
  }

  async function v2Config(opts?: BackendCallOptions): Promise<OcConfig> {
    const payload = await requestJson("/api/config", "get v2 config", {}, opts?.timeoutMs, opts?.signal)
    return parseV2Config(payload)
  }

  async function v1ProviderCatalog(opts?: BackendCallOptions): Promise<ModelCatalogEntry[]> {
    try {
      const result = await withTimeout(
        (signal) => client.provider.list({ directory: init.directory }, { signal }),
        opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
        "provider.list",
        opts?.signal,
      )
      assertResponse(result, "list providers")
      return parseV1ProviderCatalog(result.data)
    } catch {
      return []
    }
  }

  async function v2ProviderCatalog(opts?: BackendCallOptions): Promise<ModelCatalogEntry[]> {
    try {
      const [providers, models] = await Promise.all([
        withTimeout(
          (signal) => client.v2.provider.list({ location: init.directory ? { directory: init.directory } : undefined }, { signal }),
          opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
          "v2 provider.list",
          opts?.signal,
        ),
        withTimeout(
          (signal) => client.v2.model.list({ location: init.directory ? { directory: init.directory } : undefined }, { signal }),
          opts?.timeoutMs ?? DEFAULT_RESILIENCE.statusTimeoutMs,
          "v2 model.list",
          opts?.signal,
        ),
      ])
      assertResponse(providers, "list providers")
      assertResponse(models, "list models")
      return parseV2ProviderCatalog(providers.data, models.data)
    } catch {
      return []
    }
  }

  /**
   * Subscribe handshake-first (mirrors the SDK's `{stream}` shape): the
   * returned promise resolves only once the server accepted the subscription,
   * so a consumer can report "connected" only after the stream is live — a
   * failed handshake rejects before any event is expected.
   */
  async function subscribeV1(opts: { directory?: string; signal: AbortSignal; timeoutMs?: number }): Promise<{ stream: AsyncIterable<BackendEvent> }> {
    const directory = opts.directory ?? init.directory
    const query = directory === undefined ? "" : `?${new URLSearchParams({ directory }).toString()}`
    const timeoutMs = opts.timeoutMs ?? DEFAULT_RESILIENCE.pingTimeoutMs
    await verifyEventHandshake(`/event${query}`, "subscribe to v1 events", timeoutMs, opts.signal)
    const result = await withTimeout(
      (signal) => client.event.subscribe({ directory: opts.directory ?? init.directory }, { signal }),
      timeoutMs,
      "event.subscribe",
      opts.signal,
    )
    if (!result.stream) throw new Error("Failed to subscribe to events: no stream returned")
    return {
      stream: (async function* (): AsyncGenerator<BackendEvent> {
        for await (const raw of result.stream) {
          const event = parseV1Event(raw)
          if (event) yield event
        }
      })(),
    }
  }

  async function subscribeV2(opts: { signal: AbortSignal; timeoutMs?: number }): Promise<{ stream: AsyncIterable<BackendEvent> }> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_RESILIENCE.pingTimeoutMs
    await verifyEventHandshake("/api/event", "subscribe to v2 events", timeoutMs, opts.signal)
    const result = await withTimeout(
      (signal) => client.v2.event.subscribe({ signal }),
      timeoutMs,
      "v2 event.subscribe",
      opts.signal,
    )
    if (!result.stream) throw new Error("Failed to subscribe to v2 events: no stream returned")
    return {
      stream: (async function* (): AsyncGenerator<BackendEvent> {
        for await (const raw of result.stream) {
          for (const event of mapV2EnvelopeToV1(raw)) yield event
        }
      })(),
    }
  }

  return {
    get version() { return resolvedVersion ?? 1 },
    url: init.url,
    async createSession(opts) {
      return (await ensureVersion(opts)) === 2 ? v2CreateSession(opts) : v1CreateSession(opts)
    },
    async sendPrompt(params, opts) {
      if ((await ensureVersion(opts)) === 2) return v2SendPrompt(params, opts)
      return v1SendPrompt(params, opts)
    },
    async abortSession(id, opts) {
      return (await ensureVersion(opts)) === 2 ? v2AbortSession(id, opts) : v1AbortSession(id, opts)
    },
    async getSessionStatus(id, opts) {
      return (await ensureVersion(opts)) === 2 ? v2Status(id, opts) : v1Status(id, opts)
    },
    async fetchMessages(id, opts) {
      return (await ensureVersion(opts)) === 2 ? v2Messages(id, opts) : v1Messages(id, opts)
    },
    async fetchAgents(opts) {
      return (await ensureVersion(opts)) === 2 ? v2Agents(opts) : v1Agents(opts)
    },
    async fetchConfig(opts) {
      return (await ensureVersion(opts)) === 2 ? v2Config(opts) : v1Config(opts)
    },
    async fetchProviderCatalog(opts) {
      return (await ensureVersion(opts)) === 2 ? v2ProviderCatalog(opts) : v1ProviderCatalog(opts)
    },
    async subscribeEvents(opts) {
      return (await ensureVersion(opts)) === 2 ? subscribeV2(opts) : subscribeV1(opts)
    },
  }
}
