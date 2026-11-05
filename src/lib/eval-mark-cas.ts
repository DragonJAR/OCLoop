import { compareAndSwapPlan } from "./plan-cas"
import { toErrorMessage } from "./format"
import { log } from "./debug-logger"

/**
 * Shared CAS policy for the eval-path PLAN.md writers (eval note + [BLOCKED]
 * mark). Extracted from App.tsx so the contract is unit-testable — the
 * resolveTierMapping precedent.
 *
 * Contract (the A4/A9 regression guard): a compareAndSwapPlan result is NEVER
 * ignored.
 *  - `wrote` → onWrote (the mark landed; caller reports success).
 *  - `no_change` → re-read the plan; benign ONLY when `benignStillMatches`
 *    says the intended state is already present (a prior pass won the race).
 *    Otherwise it dispatches — the mark can never be recorded on this plan.
 *  - any other skip (deferred / io_error / transform_error) → dispatch a
 *    recoverable `plan`-source error so the loop halts instead of advancing
 *    on a plan that never recorded the mark (the A4 livelock).
 */
export interface CasDispatchDeps {
  dispatch: (action: {
    type: "error"
    source: "plan"
    message: string
    recoverable: boolean
  }) => void
  t: (key: "errEvalNoteDeferred" | "errBlockMarkDeferred", params: { task: string; cause: string }) => string
}

export interface CasPlanOrDispatchOptions {
  task: string
  planPath: string
  transform: (content: string) => string | null
  benignStillMatches: (planText: string) => boolean
  causeTransformError: string
  errKey: "errEvalNoteDeferred" | "errBlockMarkDeferred"
  onWrote?: () => void
  onBenignNoChange?: () => void
}

export async function casPlanOrDispatch(
  deps: CasDispatchDeps,
  opts: CasPlanOrDispatchOptions,
): Promise<void> {
  try {
    const cas = await compareAndSwapPlan(opts.planPath, opts.transform, "eval")
    if (cas.wrote) {
      opts.onWrote?.()
      return
    }
    if (cas.skipped === "no_change") {
      // Two very different causes: a prior pass already won the race
      // (benign, decided by the parser-aware predicate — a raw substring
      // hit inside a note or fence must not count) vs a plan where the
      // mark can never be recorded.
      const planText = await Bun.file(opts.planPath).text().catch(() => null)
      if (planText !== null && opts.benignStillMatches(planText)) {
        opts.onBenignNoChange?.()
        return
      }
    }
    const cause =
      cas.skipped === "deferred"
        ? "plan changed underfoot"
        : cas.skipped === "transform_error"
          ? opts.causeTransformError
          : cas.skipped === "io_error"
            ? "PLAN.md I/O failed"
            : cas.skipped === "no_change"
              ? "task line no longer present"
              : "unknown CAS skip"
    log.warn("eval", "PLAN.md mark did not land", { skipped: cas.skipped })
    deps.dispatch({
      type: "error",
      source: "plan",
      message: deps.t(opts.errKey, { task: opts.task.slice(0, 40), cause }),
      recoverable: true,
    })
  } catch (err) {
    log.warn("eval", "PLAN.md mark failed", err)
    deps.dispatch({
      type: "error",
      source: "plan",
      message: deps.t(opts.errKey, { task: opts.task.slice(0, 40), cause: toErrorMessage(err) }),
      recoverable: true,
    })
  }
}
