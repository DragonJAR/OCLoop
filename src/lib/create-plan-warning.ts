/**
 * Pure helper that lists the CLI flags --create-plan accepts but cannot honor.
 */

import { DEFAULTS } from "./constants"
import { resolvePromptFile } from "./plan-file"
import type { CLIArgs } from "../types"

export function getIgnoredCreatePlanFlags(args: CLIArgs): string[] {
  const ignored: string[] = []
  if (args.run) ignored.push("--run")
  if (args.debug) ignored.push("--debug")
  if (args.verbose) ignored.push("--verbose")
  if (args.jobs !== undefined) ignored.push("--jobs")
  if (args.resilience?.resume) ignored.push("--resume")
  if (args.resilience?.chaos) ignored.push("--chaos")
  if (args.resilience?.caffeinate === false) ignored.push("--no-caffeinate")
  if (resolvePromptFile(args.promptFile) !== DEFAULTS.PROMPT_FILE) ignored.push("--prompt")
  return ignored
}
