/**
 * Default file paths
 */
export const DEFAULTS = {
  PROMPT_FILE: ".loop-prompt.md",
  PLAN_FILE: "PLAN.md",
} as const

/**
 * Defaults for planning-style one-shot agent calls: the `--create-plan`
 * generator and the stalled-task split. A planning agent returns a structured
 * list/plan without executing the work (unlike the active "doing" agent), which
 * is what these features need.
 */
export const DEFAULT_PLAN_MODEL = "zai-coding-plan/glm-5.2"
export const DEFAULT_PLAN_AGENT = "plan"

/**
 * Unattended auto-select delay for the stalled-task split dialogs. If the user
 * touches nothing, the no-progress halt auto-picks "split" and the resulting
 * proposal auto-accepts after this many ms each — so a stall resolves itself.
 * Any keypress in either dialog cancels its timer (the user took control).
 */
export const AUTO_SELECT_MS = 30_000
