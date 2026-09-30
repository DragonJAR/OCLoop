/**
 * Fetch the live model catalog from the opencode server.
 *
 * The `--routing` panel needs the real, connected models the user can actually
 * call — not a static snapshot. The catalog comes from the version-aware
 * backend (`opencode-backend.ts`), which flattens each dialect's provider
 * response and keeps ONLY connected/active providers: showing a model the user
 * can't auth would let them pick a model that 401s on the first prompt.
 *
 * Fail-safe: any error (network, malformed response, timeout) returns `[]`. A
 * routing panel with nothing to show is handled by the caller (skip routing,
 * fall back to the single resolved model) — it must NEVER crash startup.
 */

import type { OpencodeBackend } from "./api"
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
 * Fetch the pickable catalog of connected models. Returns `[]` on any failure
 * so the caller can skip routing.
 */
export async function fetchModelCatalog(
  backend: OpencodeBackend,
): Promise<ModelCatalogEntry[]> {
  try {
    return await backend.fetchProviderCatalog({ timeoutMs: FETCH_MODELS_TIMEOUT_MS })
  } catch (err) {
    // Never crash startup over a catalog fetch failure — routing is opt-in and
    // best-effort. The caller falls back to the single resolved model.
    log.warn("routing", "Failed to fetch model catalog", err)
    return []
  }
}
