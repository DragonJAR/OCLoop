import { describe, expect, it } from "bun:test"

import { resolveTierMapping, catalogToOptions, type ResolveTierMappingDeps } from "./resolve-tier-mapping"
import type { ModelCatalogEntry } from "./fetch-models"
import type { TierRole } from "../ui/DialogTierPicker"

/**
 * Coverage for the `--routing` panel orchestration, previously an untested
 * inline IIFE inside App.tsx's server-ready effect. resolveTierMapping takes
 * every collaborator as an injected dep (fetchCatalog, showPicker,
 * setTierMapping, onComplete), so each branch pins deterministically with
 * stubs — no Solid mount, no SDK, no .tsx import.
 *
 * Branch map (the contract under test):
 *   empty catalog  → setTierMapping(null), onComplete called, returns null
 *   success        → setTierMapping(mapping), onComplete called, returns mapping
 *   cancel ({})    → setTierMapping(null), onComplete called, returns null
 *   picker throws  → setTierMapping(null), onComplete called, returns null
 *   fetch throws   → setTierMapping(null), onComplete called, returns null
 *
 * The load-bearing invariant (hardening over the original): onComplete MUST
 * fire on every path — if it doesn't, the loop never starts its session.
 */

const TIERS: TierRole[] = [
  { id: "heavy", label: "Heavy", description: "main worker" },
  { id: "judge", label: "Judge", description: "eval judge" },
  { id: "cheap", label: "Cheap", description: "reserved" },
]

const CATALOG: ModelCatalogEntry[] = [
  { id: "anthropic/claude", name: "Claude", provider: "anthropic" },
  { id: "openai/gpt", name: "GPT", provider: "openai" },
]

interface StubState {
  setMappingCalls: (Record<string, string> | null)[]
  onCompleteCalls: number
  catalog: ModelCatalogEntry[]
  pickerResult: Record<string, string>
  pickerThrows: boolean
  fetchThrows: boolean
}

function makeDeps(over: Partial<StubState> = {}): { deps: ResolveTierMappingDeps<unknown, unknown>; state: StubState } {
  const state: StubState = {
    setMappingCalls: [],
    onCompleteCalls: 0,
    catalog: CATALOG,
    pickerResult: { heavy: "anthropic/claude", judge: "openai/gpt" },
    pickerThrows: false,
    fetchThrows: false,
    ...over,
  }
  const deps: ResolveTierMappingDeps<unknown, unknown> = {
    routing: true,
    client: {},
    dialog: {},
    tiers: TIERS,
    fetchCatalog: async () => {
      if (state.fetchThrows) throw new Error("fetch failed")
      return state.catalog
    },
    showPicker: async () => {
      if (state.pickerThrows) throw new Error("picker crashed")
      return state.pickerResult
    },
    setTierMapping: (m) => {
      state.setMappingCalls.push(m)
    },
    onComplete: () => {
      state.onCompleteCalls++
    },
  }
  return { deps, state }
}

describe("resolveTierMapping", () => {
  describe("success path", () => {
    it("publishes the picked mapping and returns it", async () => {
      const { deps, state } = makeDeps()
      const result = await resolveTierMapping(deps)
      expect(result).toEqual({ heavy: "anthropic/claude", judge: "openai/gpt" })
      expect(state.setMappingCalls).toEqual([{ heavy: "anthropic/claude", judge: "openai/gpt" }])
    })

    it("calls onComplete exactly once", async () => {
      const { deps, state } = makeDeps()
      await resolveTierMapping(deps)
      expect(state.onCompleteCalls).toBe(1)
    })

    it("tolerates a partial mapping (only some tiers picked) — publishes it as-is", async () => {
      // Esc mid-flow returns a partial mapping; it is non-empty so it is NOT
      // collapsed to null (only the fully-empty {} cancels).
      const { deps, state } = makeDeps({ pickerResult: { heavy: "anthropic/claude" } })
      const result = await resolveTierMapping(deps)
      expect(result).toEqual({ heavy: "anthropic/claude" })
      expect(state.setMappingCalls).toEqual([{ heavy: "anthropic/claude" }])
    })
  })

  describe("cancel path (picker returns empty {})", () => {
    it("collapses {} to null so downstream falls back to activeModel", async () => {
      const { deps, state } = makeDeps({ pickerResult: {} })
      const result = await resolveTierMapping(deps)
      expect(result).toBeNull()
      expect(state.setMappingCalls).toEqual([null])
    })

    it("still calls onComplete (loop must start even on cancel)", async () => {
      const { deps, state } = makeDeps({ pickerResult: {} })
      await resolveTierMapping(deps)
      expect(state.onCompleteCalls).toBe(1)
    })
  })

  describe("empty catalog path", () => {
    it("publishes null and returns null without showing the picker", async () => {
      const pickerCalled = { value: false }
      const { deps, state } = makeDeps({ catalog: [] })
      deps.showPicker = async () => {
        pickerCalled.value = true
        return {}
      }
      const result = await resolveTierMapping(deps)
      expect(result).toBeNull()
      expect(state.setMappingCalls).toEqual([null])
      expect(pickerCalled.value).toBe(false)
    })

    it("calls onComplete (loop must start even with no models)", async () => {
      const { deps, state } = makeDeps({ catalog: [] })
      await resolveTierMapping(deps)
      expect(state.onCompleteCalls).toBe(1)
    })
  })

  describe("picker throws", () => {
    it("publishes null and swallows the error", async () => {
      const { deps, state } = makeDeps({ pickerThrows: true })
      const result = await resolveTierMapping(deps)
      expect(result).toBeNull()
      expect(state.setMappingCalls).toEqual([null])
    })

    it("calls onComplete (loop must start even after a picker crash)", async () => {
      const { deps, state } = makeDeps({ pickerThrows: true })
      await resolveTierMapping(deps)
      expect(state.onCompleteCalls).toBe(1)
    })
  })

  describe("catalog fetch throws", () => {
    it("publishes null and swallows the error", async () => {
      const { deps, state } = makeDeps({ fetchThrows: true })
      const result = await resolveTierMapping(deps)
      expect(result).toBeNull()
      expect(state.setMappingCalls).toEqual([null])
    })

    it("calls onComplete (loop must start even after a fetch crash)", async () => {
      const { deps, state } = makeDeps({ fetchThrows: true })
      await resolveTierMapping(deps)
      expect(state.onCompleteCalls).toBe(1)
    })

    it("does NOT call the picker when the fetch failed", async () => {
      const pickerCalled = { value: false }
      const { deps } = makeDeps({ fetchThrows: true })
      deps.showPicker = async () => {
        pickerCalled.value = true
        return {}
      }
      await resolveTierMapping(deps)
      expect(pickerCalled.value).toBe(false)
    })
  })

  describe("catalogToOptions (pure helper)", () => {
    it("maps catalog entries to DialogSelectOption shape", () => {
      const options = catalogToOptions(CATALOG)
      expect(options).toEqual([
        { title: "Claude", value: "anthropic/claude", category: "anthropic" },
        { title: "GPT", value: "openai/gpt", category: "openai" },
      ])
    })

    it("returns an empty array for an empty catalog", () => {
      expect(catalogToOptions([])).toEqual([])
    })
  })
})
