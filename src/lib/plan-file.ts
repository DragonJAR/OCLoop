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
import { resolve } from "node:path"

export function resolvePlanFile(planFile: string | undefined): string {
  if (!planFile || !planFile.trim()) {
    return DEFAULTS.PLAN_FILE
  }
  return planFile.trim()
}

export function resolvePromptFile(promptFile: string | undefined): string {
  if (!promptFile || !promptFile.trim()) {
    return DEFAULTS.PROMPT_FILE
  }
  return promptFile.trim()
}

/**
 * Absolute repository root the parallel workers and the integration queue
 * operate against. `process.cwd()` is the launch directory (boot pre-flight
 * already guarantees it is the writable project dir); resolving it here —
 * instead of leaving every consumer a `?? process.cwd()` fallback — keeps one
 * canonical root so a OCLoop launched from a subdirectory still rebases and
 * CAS-writes against the real repo root.
 */
export function resolveRepoRoot(): string {
  return resolve(process.cwd())
}

