/**
 * Fetch the live model catalog from the opencode server.
 *
 * The `--routing` panel needs the real, connected models the user can actually
 * call — not a static snapshot. `client.provider.list()` returns every provider
 * with its nested model map plus a `connected` array naming the providers that
 * have valid credentials. We flatten that into a simple list and keep ONLY
 * connected providers: showing a model the user can't auth would let them pick
 * a model that 401s on the first prompt.
 *
 * Fail-safe: any error (network, malformed response, timeout) returns `[]`. A
 * routing panel with nothing to show is handled by the caller (skip routing,
 * fall back to the single resolved model) — it must NEVER crash startup.
 */

import { assertResponse, type OpencodeClient } from "./api"
import { withTimeout } from "./with-timeout"
import { log } from "./debug-logger"

/** One pickable model in the routing panel. */
export interface ModelCatalogEntry {
  /** Canonical "provider/model" id (e.g. "anthropic/claude-haiku-4-5"). */
  id: string
  /** Human-readable model name for the list (falls back to the id). */
  name: string
  /** Provider id (e.g. "anthropic") — used for grouping/category. */
  provider: string
}

/** Fetch timeout: the catalog must not block startup for long. */
const FETCH_MODELS_TIMEOUT_MS = 15_000

/**
 * Flatten the provider-list response into a pickable catalog of connected
 * models. Returns `[]` on any failure so the caller can skip routing.
 */
export async function fetchModelCatalog(
  client: OpencodeClient,
): Promise<ModelCatalogEntry[]> {
  try {
    const result = await withTimeout(
      (signal) => client.provider.list({}, { signal }),
      FETCH_MODELS_TIMEOUT_MS,
      "provider.list",
    )
    assertResponse(result, "list providers")
    const data = result.data
    if (!data) return []

    const connected = new Set(data.connected ?? [])
    const entries: ModelCatalogEntry[] = []

    for (const provider of data.all ?? []) {
      // Only providers with valid credentials can actually serve a model.
      if (!connected.has(provider.id)) continue
      const models = provider.models
      if (!models || typeof models !== "object") continue
      if (Array.isArray(models)) {
        for (const item of models) {
          if (!item) continue
          if (typeof item === "string") {
            entries.push({
              id: `${provider.id}/${item}`,
              name: item,
              provider: provider.id,
            })
          } else if (typeof item === "object") {
            const mId = "id" in item && typeof item.id === "string" ? item.id : undefined
            if (!mId) continue
            const name = "name" in item && typeof item.name === "string" ? item.name : mId
            entries.push({
              id: `${provider.id}/${mId}`,
              name,
              provider: provider.id,
            })
          }
        }
        continue
      }
      for (const [modelKey, model] of Object.entries(models)) {
        // modelKey is the model id (e.g. "claude-haiku-4-5"); the canonical
        // "provider/model" composite is provider.id + "/" + modelKey.
        const name =
          model && typeof model === "object" && "name" in model && typeof (model as { name?: unknown }).name === "string"
            ? (model as { name: string }).name
            : modelKey
        entries.push({
          id: `${provider.id}/${modelKey}`,
          name,
          provider: provider.id,
        })
      }
    }

    return entries
  } catch (err) {
    // Never crash startup over a catalog fetch failure — routing is opt-in and
    // best-effort. The caller falls back to the single resolved model.
    log.warn("routing", "Failed to fetch model catalog", err)
    return []
  }
}
