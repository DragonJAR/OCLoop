/**
 * Pure helper for the startup resume log emitted at App.tsx:1130.
 *
 * The TUI onMount effect calls `loadLoopState()` and then only consults
 * `resilience().resume` inside the `persisted && persisted.iteration > 0`
 * branch. When the user passes `--resume` on a clean run (no
 * `.loop-state.json`, or a stale one with `iteration === 0`), the flag is
 * parsed and stored on the args object but produces zero observable effect
 * — the loop just starts as a fresh run.
 *
 * Source: MEJORAS.md Finding 1.8.B. The fix is a non-functional improvement:
 * it surfaces the no-op in the startup log so anyone reading `.loop.log` can
 * see it. No behavior change; the decision tree in App.tsx is unchanged.
 *
 * The helper returns the log event to emit (or null when `--resume` was not
 * requested), keeping the side-effect-free part isolated from the call site
 * so the rules can be unit-tested.
 */

import type { CLIArgs } from "../types"
import type { PersistedLoopState } from "./loop-state-store"

export type ResumeAttemptEvent = "resume:requested"

export type ResumeAttemptLog = {
  event: ResumeAttemptEvent
  payload: {
    hasPersisted: boolean
    iteration: number
  }
}

/**
 * Returns the startup resume log to emit, or `null` when `--resume` was
 * not requested by the user.
 *
 * - `args.resilience?.resume === true` → log is emitted.
 * - Persisted state is `null` (no `.loop-state.json`) → `hasPersisted: false`,
 *   `iteration: 0`. This is the silent-no-op case Finding 1.8.B calls out.
 * - Persisted state exists with `iteration === 0` (cleared/stale snapshot) →
 *   `hasPersisted: true`, `iteration: 0`. Same outcome from the user's POV.
 * - Persisted state exists with `iteration > 0` → the existing branch in
 *   App.tsx:1131 will log `resume:found` separately. The `requested` line
 *   here is emitted first so the audit trail shows the user's intent before
 *   the reconcile outcome.
 */
export function describeResumeAttempt(
  args: Pick<CLIArgs, "resilience">,
  persisted: PersistedLoopState | null,
): ResumeAttemptLog | null {
  if (!args.resilience?.resume) return null
  return {
    event: "resume:requested",
    payload: {
      hasPersisted: !!persisted,
      iteration: persisted?.iteration ?? 0,
    },
  }
}
