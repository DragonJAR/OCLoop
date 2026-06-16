/**
 * Exponential backoff with full jitter.
 *
 * `computeBackoff(attempt, opts)` returns a delay in milliseconds for the given
 * zero-based `attempt` number:
 *
 *   exp        = min(max, base * 2^attempt)
 *   full jitter = random in [0, exp]
 *
 * Full jitter (rather than "equal" or "decorrelated" jitter) is used because it
 * spreads retries the widest, which is what we want when many clients — or many
 * loop iterations — could be backing off against the same rate-limited provider.
 *
 * If the server told us how long to wait (`retryAfterSeconds`, from a
 * `Retry-After` header or an error payload), that value is authoritative and is
 * returned directly: the server knows its own limits better than our formula.
 *
 * `random` is injectable so tests are deterministic; it defaults to
 * `Math.random` (available at runtime, unlike inside workflow scripts).
 */

export interface BackoffOptions {
  /** Base delay in milliseconds (the t=0 unit). */
  base: number
  /** Maximum delay cap in milliseconds (before jitter). */
  max: number
  /** Apply full jitter. Default true. */
  jitter?: boolean
  /** Server-provided Retry-After in seconds; takes priority when present. */
  retryAfterSeconds?: number
  /** Injectable RNG in [0,1) for deterministic tests. Default Math.random. */
  random?: () => number
}

export function computeBackoff(attempt: number, opts: BackoffOptions): number {
  const { base, max, jitter = true, retryAfterSeconds, random = Math.random } =
    opts

  // Server's Retry-After wins outright (converted to ms, never negative).
  if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)) {
    return Math.max(0, Math.round(retryAfterSeconds * 1000))
  }

  const safeAttempt = Math.max(0, Math.floor(attempt))
  const safeBase = Math.max(0, base)
  const safeMax = Math.max(0, max)

  // min(max, base * 2^attempt) — guard against Infinity from large attempts.
  // When uncapped is Infinity (e.g. attempt=100), Number.isFinite catches it
  // and we use safeMax instead. Both the jitter and non-jitter paths are
  // protected: the jitter path clamps to [0, exp] where exp ≤ safeMax, and the
  // non-jitter path returns exp directly (also ≤ safeMax).
  // ponytail: safeAttempt clamps negative/fractional attempts to 0, safeMax
  // caps the exponential, and Number.isFinite(uncapped) handles Infinity — no
  // path can produce a delay > safeMax regardless of input.
  const uncapped = safeBase * Math.pow(2, safeAttempt)
  const exp = Math.min(safeMax, Number.isFinite(uncapped) ? uncapped : safeMax)

  if (!jitter) return Math.round(exp)

  // Full jitter: uniform in [0, exp].
  const r = Math.min(Math.max(random(), 0), 1)
  return Math.round(r * exp)
}
