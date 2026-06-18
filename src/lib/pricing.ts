/**
 * pricing.ts — costo estimado por modelo, tabla ESTÁTICA (sin red, sin tiempo real).
 *
 * Snapshot de models.dev/api.json (2026-06-18). Precios en USD por 1M tokens.
 * Flagship elegido POR TIER, no por número global de versión (p.ej. Gemini flash va
 * en 3.5 pero pro en 3.1; Anthropic opus 4.8 / sonnet 4.6 / haiku 4.5). `cacheWrite`
 * ausente en la fuente → 0; para GLM (Z.ai) se usa `cacheWrite = input`.
 *
 * Todo se muestra con `~` (aproximado) — ver `formatCost`. Refrescable a mano
 * re-corriendo el dump de models.dev.
 */
export interface ModelCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

// Snapshot estático (top-5 por lab, 11 labs). Clave: "provider/model" en minúsculas.
const PRICES: Record<string, ModelCost> = {
  // === OpenAI (cache_write n/a → 0) ===
  "openai/gpt-5.5": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
  "openai/gpt-5.4": { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
  "openai/gpt-5.2": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
  "openai/gpt-5.1": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  "openai/gpt-5": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  // === Anthropic (cache_write 5m) ===
  "anthropic/claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "anthropic/claude-opus-4-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "anthropic/claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "anthropic/claude-fable-5": { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  // === Google / Gemini (cache_write n/a → 0) ===
  "google/gemini-3.1-pro-preview": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
  "google/gemini-3-pro-preview": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
  "google/gemini-3.5-flash": { input: 1.5, output: 9, cacheRead: 0.15, cacheWrite: 0 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10, cacheRead: 0.125, cacheWrite: 0 },
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5, cacheRead: 0.03, cacheWrite: 0 },
  // === xAI / Grok (cache_write n/a → 0) ===
  "xai/grok-4.3": { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  "xai/grok-4.20-0309-reasoning": { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  "xai/grok-4.20-0309-non-reasoning": { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  "xai/grok-4.20-multi-agent-0309": { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  "xai/grok-build-0.1": { input: 1, output: 2, cacheRead: 0.2, cacheWrite: 0 },
  // === DeepSeek (cache_write n/a → 0) ===
  "deepseek/deepseek-v4-pro": { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0 },
  "deepseek/deepseek-chat": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
  "deepseek/deepseek-reasoner": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
  "deepseek/deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
  // === Moonshot / Kimi (cache_write n/a → 0) ===
  "moonshotai/kimi-k2.7-code": { input: 0.95, output: 4, cacheRead: 0.19, cacheWrite: 0 },
  "moonshotai/kimi-k2.6": { input: 0.95, output: 4, cacheRead: 0.16, cacheWrite: 0 },
  "moonshotai/kimi-k2.5": { input: 0.6, output: 3, cacheRead: 0.1, cacheWrite: 0 },
  "moonshotai/kimi-k2-thinking": { input: 0.6, output: 2.5, cacheRead: 0.15, cacheWrite: 0 },
  "moonshotai/kimi-k2-turbo-preview": { input: 2.4, output: 10, cacheRead: 0.6, cacheWrite: 0 },
  // === Z.ai / GLM (cacheWrite = input, regla del usuario; glm-5.2 vía precio público z-ai) ===
  "zai/glm-5.2": { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 1.4 },
  "zai/glm-5.1": { input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 1.4 },
  "zai/glm-5": { input: 1, output: 3.2, cacheRead: 0.2, cacheWrite: 1 },
  "zai/glm-4.7": { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0.6 },
  "zai/glm-4.6": { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0.6 },
  // === MiniMax (cache_write n/a → 0 salvo M2.5/M2.7) ===
  "minimax/minimax-m3": { input: 0.6, output: 2.4, cacheRead: 0.12, cacheWrite: 0 },
  "minimax/minimax-m2.7": { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.375 },
  "minimax/minimax-m2.5": { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
  "minimax/minimax-m2.1": { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
  "minimax/minimax-m2": { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
  // === Qwen / Alibaba ===
  "alibaba/qwen3.7-max": { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
  "alibaba/qwen3.7-plus": { input: 0.5, output: 3, cacheRead: 0.05, cacheWrite: 0.625 },
  "alibaba/qwen3.6-max-preview": { input: 1.3, output: 7.8, cacheRead: 0.13, cacheWrite: 1.625 },
  "alibaba/qwen3-coder-plus": { input: 1, output: 5, cacheRead: 0, cacheWrite: 0 },
  "alibaba/qwen-max": { input: 1.6, output: 6.4, cacheRead: 0, cacheWrite: 0 },
  // === Mistral (cache_write n/a → 0) ===
  "mistral/magistral-medium-latest": { input: 2, output: 5, cacheRead: 0, cacheWrite: 0 },
  "mistral/mistral-large-latest": { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
  "mistral/mistral-medium-latest": { input: 0.4, output: 2, cacheRead: 0, cacheWrite: 0 },
  "mistral/codestral-latest": { input: 0.3, output: 0.9, cacheRead: 0, cacheWrite: 0 },
  "mistral/devstral-medium-latest": { input: 0.4, output: 2, cacheRead: 0, cacheWrite: 0 },
  // === Cohere (cache_write n/a → 0) ===
  "cohere/command-a-03-2025": { input: 2.5, output: 10, cacheRead: 0, cacheWrite: 0 },
  "cohere/command-a-reasoning-08-2025": { input: 2.5, output: 10, cacheRead: 0, cacheWrite: 0 },
  "cohere/command-r-plus-08-2024": { input: 2.5, output: 10, cacheRead: 0, cacheWrite: 0 },
  "cohere/command-r-08-2024": { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
}

// Promedio aproximado para modelos fuera de la tabla (mostrado con ~ igual).
// ponytail: constante fija; recalcular sólo si la tabla crece mucho.
const FALLBACK: ModelCost = { input: 1.5, output: 8, cacheRead: 0.2, cacheWrite: 1 }

// Índice por modelId (case-insensitive) para el match laxo. Sin colisiones de id
// entre labs (GLM sólo va bajo `zai`); el `.reverse()` deja ganar al primero de la tabla.
const BY_ID: Record<string, ModelCost> = Object.fromEntries(
  Object.entries(PRICES)
    .map(([k, v]) => [k.slice(k.lastIndexOf("/") + 1), v] as [string, ModelCost])
    .reverse(),
)

/**
 * Exacto "provider/model" → si no, por modelId (case-insensitive) → si no, promedio.
 * SUSCRIPCIONES / coding-plans (p.ej. "zhipuai-coding-plan/glm-5.2",
 * "minimax-coding-plan/MiniMax-M3") traen cost=0 en models.dev. Como la tabla se
 * llave por modelId con PRECIO DE API, el match laxo cae en ese precio (nunca $0):
 * el usuario ve cuánto costaría ese tramo si fuera llamado a la API.
 */
export function lookupCost(model: string | undefined): ModelCost {
  if (model) {
    const key = model.toLowerCase()
    if (PRICES[key]) return PRICES[key]
    // modelId = último segmento; quita un sufijo "-free" (tier gratis de opencode).
    const id = (key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key).replace(/-free$/, "")
    if (BY_ID[id]) return BY_ID[id]
  }
  return FALLBACK
}

/** USD estimados (precios por 1M tokens). */
export function estimateCost(
  t: { input: number; output: number; cacheRead: number; cacheWrite: number },
  c: ModelCost,
): number {
  return (
    (t.input * c.input + t.output * c.output + t.cacheRead * c.cacheRead + t.cacheWrite * c.cacheWrite) /
    1_000_000
  )
}

/** Siempre con ~ (todo es aproximado). <$1 → 4 decimales; ≥$1 → 2. */
export function formatCost(usd: number): string {
  const v = Number.isFinite(usd) && usd > 0 ? usd : 0
  return `~$${v.toFixed(v >= 1 ? 2 : 4)}`
}
