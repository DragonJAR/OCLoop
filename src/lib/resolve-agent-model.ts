/**
 * Resolve which agent and model OCLoop should use when launched with no flags.
 *
 * Rather than burning/hardcoding a fixed default agent string (e.g. "build"),
 * OCLoop dynamically resolves the default agent from OpenCode:
 *   - agent: --agent > config.default_agent (if primary) > agent with OpenCode "build" profile
 *            > server default agent (first in app.agents()) > first primary agent
 *   - model: --model > the chosen agent's OWN model > config.model (global)
 *
 * Pure function (no I/O) so the precedence rules are unit-testable; the caller
 * fetches `config.get()` + `app.agents()` once and applies the result.
 */

/** Subset of an OpenCode `Agent` (from `client.app.agents()`) we rely on. */
export interface OcAgent {
  name: string
  mode: "subagent" | "primary" | "all" | (string & {})
  model?: { providerID: string; modelID: string }
  profile?: string
  role?: string
  builtIn?: boolean
  description?: string
  hidden?: boolean
  permission?: unknown
  tools?: Record<string, boolean>
  options?: Record<string, unknown>
  isDefault?: boolean
  default?: boolean
}

/** Subset of the OpenCode `Config` (from `client.config.get()`) we rely on. */
export interface OcConfig {
  /** Global default model in "provider/model" format. */
  model?: string
  /** Default agent name configured in OpenCode. */
  default_agent?: string
  /** Per-agent configuration map */
  agent?: Record<string, {
    mode?: string
    profile?: string
    role?: string
    disable?: boolean
    disabled?: boolean
    [key: string]: unknown
  }>
  /** Per-mode configuration map */
  mode?: Record<string, {
    mode?: string
    profile?: string
    role?: string
    agent?: string
    disable?: boolean
    disabled?: boolean
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export interface ResolvedAgentModel {
  /** Agent name to send, or undefined if none could be resolved. */
  agent: string | undefined
  /** "provider/model" string to send, or undefined to let the server decide. */
  model: string | undefined
  /** Primary agent names (for the invalid-agent dialog). */
  availableAgents: string[]
  /** Set when an explicit --agent was given but is not a primary agent. */
  invalidAgent?: string
  /** Resolved planning agent for one-shot plan tasks, if discovered. */
  planAgent?: string
}

function agentModelString(agent: OcAgent | undefined): string | undefined {
  return agent?.model ? `${agent.model.providerID}/${agent.model.modelID}` : undefined
}

/**
 * Check if an agent is an eligible interactive primary agent in OpenCode.
 * Filters out subagents, hidden agents, and agents disabled in config.
 */
export function isEligiblePrimaryAgent(agent: OcAgent, config?: OcConfig): boolean {
  if (agent.mode === "subagent") return false
  if (agent.hidden) return false

  const agentCfg = config?.agent?.[agent.name]
  if (agentCfg?.disable === true || agentCfg?.disabled === true) return false

  const modeCfg = config?.mode?.[agent.name]
  if (modeCfg?.disable === true || modeCfg?.disabled === true) return false

  return true
}

/**
 * Check if an agent explicitly has the "build" profile or role assigned.
 */
function hasBuildProfile(agent: OcAgent, config?: OcConfig): boolean {
  const profile =
    agent.profile ??
    agent.role ??
    (typeof agent.options?.profile === "string" ? agent.options.profile : undefined) ??
    (typeof agent.options?.role === "string" ? agent.options.role : undefined) ??
    config?.agent?.[agent.name]?.profile ??
    config?.agent?.[agent.name]?.role ??
    config?.mode?.[agent.name]?.profile ??
    config?.mode?.[agent.name]?.role

  if (typeof profile === "string" && profile.toLowerCase() === "build") {
    return true
  }

  // Legacy mode: "build"
  if (typeof agent.mode === "string" && agent.mode.toLowerCase() === "build") {
    return true
  }

  return false
}

/**
 * Check if an agent has build/write capabilities (not explicitly denying file edits).
 * Handles both OpenCode v1 (object) and v2 (PermissionRuleset array) permission shapes.
 */
function isBuildCapable(agent: OcAgent): boolean {
  if (Array.isArray(agent.permission)) {
    const editDeny = agent.permission.some(
      (p: unknown) =>
        typeof p === "object" &&
        p !== null &&
        "permission" in p &&
        "action" in p &&
        (p as { permission: string; action: string }).permission === "edit" &&
        (p as { permission: string; action: string }).action === "deny",
    )
    return !editDeny
  }
  if (typeof agent.permission === "object" && agent.permission !== null) {
    return (agent.permission as { edit?: string }).edit !== "deny"
  }
  return true
}

/**
 * Dynamically resolves the agent that has OpenCode's "build" profile activated by default.
 *
 * Rather than burning/hardcoding "build" as an assumed constant, this inspects:
 * 1. OpenCode's explicitly configured `config.default_agent` (if primary).
 * 2. An eligible agent explicitly declaring the "build" profile/role.
 * 3. OpenCode config `mode.build.agent` or `agent.build.agent` mappings.
 * 4. An eligible agent named "build" (case-insensitive) that is active.
 * 5. OpenCode's server default: OpenCode's `/agent` endpoint puts the server's resolved
 *    default agent at index 0 (`agents[0]`). If it is an eligible primary agent, use it.
 * 6. An eligible agent with build capabilities (active edit / bash permissions).
 * 7. Fallback to the first eligible primary agent.
 */
export function findBuildProfileAgent(
  agents: OcAgent[],
  config?: OcConfig,
): string | undefined {
  const primaryAgents = agents.filter((a) => isEligiblePrimaryAgent(a, config))
  const primaryNames = primaryAgents.map((a) => a.name)

  // 1. If OpenCode explicitly configured default_agent:
  if (config?.default_agent) {
    if (primaryNames.includes(config.default_agent)) {
      return config.default_agent
    }
    // If agents list is empty (fetch failed or mock), trust config
    if (primaryAgents.length === 0) {
      return config.default_agent
    }
  }

  // 2. Explicit build profile or role
  const explicitBuild = primaryAgents.find((a) => hasBuildProfile(a, config))
  if (explicitBuild) {
    return explicitBuild.name
  }

  // 3. Config mode/agent mappings pointing to a build agent
  const mappedBuildAgent =
    (typeof config?.mode?.build?.agent === "string" ? config.mode.build.agent : undefined) ??
    (typeof config?.agent?.build?.agent === "string" ? config.agent.build.agent : undefined)
  if (mappedBuildAgent && primaryNames.includes(mappedBuildAgent)) {
    return mappedBuildAgent
  }

  // 4. Eligible primary agent named "build"
  const buildNamed = primaryAgents.find((a) => a.name.toLowerCase() === "build")
  if (buildNamed) {
    return buildNamed.name
  }

  // 5. OpenCode server default: agent with isDefault/default flag or first in app.agents()
  const flaggedDefault = primaryAgents.find((a) => a.isDefault || a.default)
  if (flaggedDefault) {
    return flaggedDefault.name
  }
  if (agents.length > 0 && isEligiblePrimaryAgent(agents[0], config)) {
    return agents[0].name
  }

  // 6. Eligible agent with build capabilities (edit permission not "deny")
  const buildCapable = primaryAgents.find(isBuildCapable)
  if (buildCapable) {
    return buildCapable.name
  }

  // 7. First eligible primary agent
  return primaryAgents[0]?.name
}

/**
 * Dynamically resolves the agent that has OpenCode's "plan" profile, or falls back to undefined.
 */
export function findPlanProfileAgent(
  agents: OcAgent[],
  config?: OcConfig,
): string | undefined {
  const primaryAgents = agents.filter((a) => isEligiblePrimaryAgent(a, config))

  // Explicit plan profile or role
  const explicitPlan = primaryAgents.find((a) => {
    const profile =
      a.profile ??
      a.role ??
      (typeof a.options?.profile === "string" ? a.options.profile : undefined) ??
      (typeof a.options?.role === "string" ? a.options.role : undefined) ??
      config?.agent?.[a.name]?.profile ??
      config?.mode?.[a.name]?.profile
    return typeof profile === "string" && profile.toLowerCase() === "plan"
  })
  if (explicitPlan) return explicitPlan.name

  // Agent named "plan"
  const planNamed = primaryAgents.find((a) => a.name.toLowerCase() === "plan")
  if (planNamed) return planNamed.name

  return undefined
}

export function resolveAgentAndModel(
  config: OcConfig | undefined,
  agents: OcAgent[],
  cliAgent: string | undefined,
  cliModel: string | undefined,
): ResolvedAgentModel {
  const primaryAgents = agents.filter((a) => isEligiblePrimaryAgent(a, config))
  const primaryNames = primaryAgents.map((a) => a.name)

  // An explicit --agent that isn't among the known primary agents → let the
  // caller offer the default. Only validate when we actually have a list to
  // check against; an empty list means the fetch failed, so trust the CLI.
  if (cliAgent && primaryNames.length > 0 && !primaryNames.includes(cliAgent)) {
    return { agent: cliAgent, model: cliModel, availableAgents: primaryNames, invalidAgent: cliAgent }
  }

  // Resolve the default agent dynamically: CLI > dynamically resolved build profile agent.
  const agent = cliAgent ?? findBuildProfileAgent(agents, config)

  // Resolve the model: CLI > the chosen agent's own model > global config model.
  const chosen = agent ? agents.find((a) => a.name === agent) : undefined
  const model = cliModel ?? agentModelString(chosen) ?? config?.model ?? undefined

  // Dynamically resolve plan agent for planning tasks
  const planAgent = findPlanProfileAgent(agents, config)

  return { agent, model, availableAgents: primaryNames, planAgent }
}
