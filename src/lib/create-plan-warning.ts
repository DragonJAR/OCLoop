/**
 * Pure helper that lists the CLI flags --create-plan accepts but cannot honor.
 * The TUI never starts in plan-generator mode (index.tsx exits before render),
 * so any flag whose only consumer is the TUI is parsed, stored, then ignored.
 *
 * The warning is non-fatal: the user can still pipe stderr away (2>/dev/null)
 * to silence it. Improves discoverability without breaking the "store everything,
 * decide later" philosophy of parseArgs. Notably covers --resume.
 */

import { DEFAULTS } from "./constants"
import type { CLIArgs } from "../types"

/**
 * Returns the TUI-only CLI flags detected in `args`, in the order they were
 * introduced. Returns an empty array when none are set, so the caller can
 * skip the diagnostic.
 */
export function getIgnoredCreatePlanFlags(args: CLIArgs): string[] {
  const ignored: string[] = []
  if (args.run) ignored.push("--run")
  if (args.debug) ignored.push("--debug")
  if (args.verbose) ignored.push("--verbose")
  if (args.resilience?.resume) ignored.push("--resume")
  if (args.resilience?.chaos) ignored.push("--chaos")
  if (args.resilience?.caffeinate === false) ignored.push("--no-caffeinate")
  // --prompt is reported only when the user actually overrode the path; the
  // default path is auto-created by validatePrerequisites in the TUI branch,
  // so a default --prompt carries no information.
  if (args.promptFile !== DEFAULTS.PROMPT_FILE) ignored.push("--prompt")
  return ignored
}
