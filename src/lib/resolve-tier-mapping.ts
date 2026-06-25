/**
 * The `--routing` panel orchestration, extracted from App.tsx so the four
 * branches (empty catalog / success / cancel / failure) are unit-testable
 * without a Solid/JSX mount. Mirrors the createWatchdog/useWatchdog,
 * start-iteration/runIteration, resume-flow/doResumeFlow splits already used
 * in the codebase.
 *
 * Behavior is byte-identical to the former inline IIFE in the server-ready
 * effect (App.tsx, the `if (props.routing && !routingPanelShown)` block), with
 * ONE hardening improvement: `onComplete` (the caller's `startOnce`) is invoked
 * exactly once in a `finally`. The original called it explicitly in three
 * places (empty, success, catch) — a fourth silent path (e.g. an unhandled
 * rejection) would have stalled the loop forever, never starting the session.
 * Routing it through `finally` makes "forgot to start the session on some
 * branch" structurally impossible.
 *
 * The JSX boundary (`DialogTierPicker.show`) and the catalog fetch
 * (`fetchModelCatalog`) are INJECTED via deps so this `.ts` file imports no
 * `.tsx` and no SDK client — keeping it bun:test-clean.
 */

import type { ModelCatalogEntry } from "./fetch-models"
import type { TierMapping } from "./start-iteration"
import type { DialogSelectOption } from "../ui/DialogSelect"
import type { TierRole } from "../ui/DialogTierPicker"
import { log } from "./debug-logger"

/**
 * Fetches the connected-provider catalog; injected so no SDK import here.
 *
 * Generic in the client type so a concrete `OpencodeClient` (App.tsx) and a
 * stub `{}` (tests) are both assignable. This fixes a real type error: an
 * earlier hard-coded `unknown` parameter made the slot *contravariant*, so a
 * real `(client: OpencodeClient) => ...` was NOT assignable (TS2322). `C` is
 * inferred from the call site, so the `.ts` still imports no SDK type.
 */
type CatalogFetcher<C> = (client: C) => Promise<ModelCatalogEntry[]>

/**
 * Awaitable tier picker. Structurally identical to
 * `DialogTierPicker.show(dialog, tiers, options): Promise<Record<string,string>>`.
 * Injected so this file never imports the `.tsx`. Returns `{}` on cancel/Esc
 * at step 0, a partial mapping on Esc mid-flow, or the full mapping on finish.
 *
 * Generic in the dialog type for the same reason as `CatalogFetcher`: a real
 * `DialogContextValue` and a stub `{}` both satisfy the slot without importing
 * the `.tsx`.
 */
type TierPicker<D> = (
  dialog: D,
  tiers: TierRole[],
  options: DialogSelectOption[],
) => Promise<Record<string, string>>

/**
 * Everything the routing block closed over, narrowed to what it uses.
 * `dialog`, `client` and `tiers` are passed through to the injected fetcher /
 * picker; `setTierMapping` is the output sink; `onComplete` is the session-init
 * gate (`startOnce` in App.tsx).
 *
 * Generic in the two injected-collaborator types so production (real SDK client
 * + real DialogContext) and tests (stubs) both type-check against the same
 * contract, inferred from the call site — preserving the no-`.tsx`-import rule.
 */
export interface ResolveTierMappingDeps<C, D> {
  /** `props.routing` — feature gate. When false the caller must NOT call this. */
  routing: boolean
  /** SDK client (from tryGetClient(server.url)). */
  client: C
  /** Dialog context (passed to showPicker). */
  dialog: D
  /** The fixed role list (ROUTING_TIERS). */
  tiers: TierRole[]
  /** = fetchModelCatalog. */
  fetchCatalog: CatalogFetcher<C>
  /** = DialogTierPicker.show. */
  showPicker: TierPicker<D>
  /** Signal setter for the tier mapping. */
  setTierMapping: (mapping: TierMapping | null) => void
  /** Called exactly once when resolution finishes (success or failure), so the
   * loop always proceeds to session init. = startOnce in App.tsx. */
  onComplete: () => void
}

/** Map a model catalog to the DialogSelectOption shape the picker consumes. */
export function catalogToOptions(catalog: ModelCatalogEntry[]): DialogSelectOption[] {
  return catalog.map((m) => ({ title: m.name, value: m.id, category: m.provider }))
}

/**
 * Resolve the tier mapping: fetch the connected-model catalog, show the picker,
 * publish the result (or null on empty/cancel/failure), then signal completion.
 *
 * The caller is responsible for the once-guard (`routingPanelShown`) and the
 * `routing` gate — this function assumes it should run.
 *
 * Returns the mapping it published (or null) so tests can assert the outcome
 * directly; the production caller ignores the return value.
 */
export async function resolveTierMapping<C, D>(deps: ResolveTierMappingDeps<C, D>): Promise<TierMapping | null> {
  // `onComplete` in finally: guarantees the loop advances to session init on
  // EVERY path. The original called it in three explicit spots; this collapses
  // them to one guaranteed call.
  try {
    const catalog = await deps.fetchCatalog(deps.client)
    if (catalog.length === 0) {
      log.warn("routing", "No connected models found; skipping routing panel")
      deps.setTierMapping(null)
      return null
    }

    const options = catalogToOptions(catalog)
    const mapping = await deps.showPicker(deps.dialog, deps.tiers, options)
    // {} (cancel/Esc at step 0) → null, so downstream `tierMapping()?.heavy`
    // falls back to activeModel byte-identically to no routing.
    const resolved: TierMapping | null = Object.keys(mapping).length > 0 ? mapping : null
    deps.setTierMapping(resolved)
    if (mapping.heavy) {
      log.info("routing", "Routing enabled", mapping as unknown as Record<string, unknown>)
    }
    return resolved
  } catch (err) {
    log.error("routing", "Tier picker failed; continuing without routing", err)
    deps.setTierMapping(null)
    return null
  } finally {
    deps.onComplete()
  }
}
