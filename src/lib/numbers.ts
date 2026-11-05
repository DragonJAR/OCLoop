/**
 * Numeric helpers for values that arrive from outside the process.
 *
 * The token counters are fed by network payloads: a value that arrives as a
 * string ("1200") would be CONCATENATED instead of added, and a NaN or
 * Infinity poisons every sum downstream (tokens per minute, the cost
 * estimate, the manifest's costUsd).
 *
 * One helper, used by every boundary that touches those numbers, so no
 * caller has to remember to sanitize and no accumulator has to trust its
 * caller.
 */

/**
 * Coerce an untrusted value to a finite number; anything else becomes 0.
 */
export function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}
