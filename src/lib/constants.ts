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
