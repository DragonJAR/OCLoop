/**
 * Pure helper that resolves the plan file path. Centralizes the
 * planFile || DEFAULTS.PLAN_FILE fallback that previously appeared at 8 call
 * sites so future resolution changes (whitespace trim, ~ expansion,
 * relative-to-CWD normalization) live in one place.
 *
 * Defense-in-depth: requireValue (cli-args.ts) already rejects whitespace-only
 * --plan values at parse time, so this trim is a backstop for any future call
 * site that bypasses the parser or a test path that constructs a raw CLIArgs
 * with planFile: "   ".
 */

import { DEFAULTS } from "./constants"

export function resolvePlanFile(planFile: string | undefined): string {
  if (!planFile || !planFile.trim()) {
    return DEFAULTS.PLAN_FILE
  }
  return planFile
}
