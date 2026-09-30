/**
 * SDK helpers shared by `api.ts` and `opencode-backend.ts`.
 *
 * These live in a leaf module (no imports from either) because the dependency
 * direction is strictly one way: `api.ts` delegates to the backend, and the
 * backend needs `assertResponse`/`toSdkModel` for its v1 dialect paths. When
 * both needed them from `api.ts` the import graph cycled
 * (`api.ts ⇄ opencode-backend.ts`).
 */

import type { OpencodeClient } from "@opencode-ai/sdk/v2"

/** Parameters accepted by the SDK's promptAsync, derived to stay in sync. */
type PromptAsyncParams = Parameters<OpencodeClient["session"]["promptAsync"]>[0]
export type PromptModel = PromptAsyncParams["model"]

/** Normalize user/config model strings to the SDK's provider/model object. */
export function toSdkModel(model: string | PromptModel | undefined): PromptModel | undefined {
  if (!model) return undefined
  if (typeof model !== "string") return model
  const slash = model.indexOf("/")
  if (slash <= 0 || slash === model.length - 1) return undefined
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
}

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
 * here.
 *
 * NOTE: This only validates the HTTP layer (response exists + ok). The caller
 * owns data-layer validation: `result.data` may be null/undefined even when
 * ok=true. Every consumer handles this consistently — either throws an
 * explicit "empty response body" error (createSession, getSessionStatus,
 * runCreatePlan), uses a safe fallback (abortSession → `?? false`,
 * fetchMessages → `?? []`), or doesn't read data at all (sendPromptAsync, ping).
 */
export function assertResponse(
  result: { error?: unknown; response?: { ok: boolean; status: number; statusText: string } } | null | undefined,
  op: string,
): void {
  if (!result || !result.response) {
    throw new Error(`Failed to ${op}: ${sdkErrorMessage(result?.error)}`)
  }
  if (!result.response.ok) {
    const errorDetail = result.error ? sdkErrorMessage(result.error) : ""
    const message =
      errorDetail && errorDetail !== "network or connection error (no response)"
        ? `Failed to ${op}: ${result.response.status} ${result.response.statusText} - ${errorDetail}`
        : `Failed to ${op}: ${result.response.status} ${result.response.statusText}`
    throw new Error(message)
  }
}
