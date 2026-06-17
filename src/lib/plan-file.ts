/**
 * Pure helper that resolves the plan file path. Centralizes the
 * `planFile || DEFAULTS.PLAN_FILE` fallback that previously appeared at 8
 * call sites (6 in App.tsx, 2 in index.tsx) so future resolution changes
 * (whitespace trim, `~` expansion, relative-to-CWD normalization) live in
 * one place.
 *
 * Defense-in-depth: `requireValue` (cli-args.ts:147) already rejects
 * whitespace-only `--plan` values at parse time, so this trim is a
 * backstop for any future call site that bypasses the parser or hand-rolled
 * test path that constructs a raw `CLIArgs` with `planFile: "   "`. See
 * Finding 1.1.A for the upstream fix.
 *
 * Source: MEJORAS.md Finding 16.3.A. Also covers the cross-reference
 * Finding 16.3.C (whitespace-only `planFile` — see the trim guard).
 */

import { DEFAULTS } from "./constants"

export function resolvePlanFile(planFile: string | undefined): string {
  if (!planFile || !planFile.trim()) {
    return DEFAULTS.PLAN_FILE
  }
  return planFile
}
