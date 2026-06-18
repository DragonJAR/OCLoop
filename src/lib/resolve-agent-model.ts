/**
 * Resolve which agent and model OCLoop should use when launched with no flags.
 *
 * Mirrors OpenCode's own defaulting so a setup that configures the model
 * per-agent (not globally) still runs without an explicit --model:
 *   - agent: --agent > config.default_agent (if a primary agent) > "build"
 *            (OpenCode's documented fallback) > the first primary agent
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
}

/** Subset of the OpenCode `Config` (from `client.config.get()`) we rely on. */
export interface OcConfig {
  /** Global default model in "provider/model" format. */
  model?: string
  /** Default agent name; OpenCode falls back to "build" when unset/invalid. */
  default_agent?: string
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
}

/** OpenCode's hard fallback when no default agent is configured. */
const FALLBACK_AGENT = "build"

function agentModelString(agent: OcAgent | undefined): string | undefined {
  return agent?.model ? `${agent.model.providerID}/${agent.model.modelID}` : undefined
}

export function resolveAgentAndModel(
  config: OcConfig | undefined,
  agents: OcAgent[],
  cliAgent: string | undefined,
  cliModel: string | undefined,
): ResolvedAgentModel {
  const primaryNames = agents.filter((a) => a.mode === "primary").map((a) => a.name)

  // An explicit --agent that isn't among the known primary agents → let the
  // caller offer the default. Only validate when we actually have a list to
  // check against; an empty list means the fetch failed, so trust the CLI.
  if (cliAgent && primaryNames.length > 0 && !primaryNames.includes(cliAgent)) {
    return { agent: cliAgent, model: cliModel, availableAgents: primaryNames, invalidAgent: cliAgent }
  }

  // Resolve the agent: CLI > config.default_agent (if primary) > "build" > first primary.
  const configDefault =
    config?.default_agent && primaryNames.includes(config.default_agent)
      ? config.default_agent
      : undefined
  const agent =
    cliAgent ??
    configDefault ??
    (primaryNames.includes(FALLBACK_AGENT) ? FALLBACK_AGENT : primaryNames[0])

  // Resolve the model: CLI > the chosen agent's own model > global config model.
  const chosen = agent ? agents.find((a) => a.name === agent) : undefined
  const model = cliModel ?? agentModelString(chosen) ?? config?.model ?? undefined

  return { agent, model, availableAgents: primaryNames }
}
