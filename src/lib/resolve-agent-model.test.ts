import { describe, expect, it } from "bun:test"
import { resolveAgentAndModel, type OcAgent } from "./resolve-agent-model"

const build: OcAgent = { name: "build", mode: "primary", model: { providerID: "anthropic", modelID: "claude-sonnet-4" } }
const plan: OcAgent = { name: "plan", mode: "primary", model: { providerID: "openai", modelID: "gpt-5" } }
const sub: OcAgent = { name: "helper", mode: "subagent", model: { providerID: "x", modelID: "y" } }

describe("resolveAgentAndModel", () => {
  it("no flags: uses config.default_agent and THAT agent's own model", () => {
    const r = resolveAgentAndModel({ default_agent: "plan" }, [build, plan], undefined, undefined)
    expect(r.agent).toBe("plan")
    expect(r.model).toBe("openai/gpt-5")
  })

  it("no flags, no default_agent: falls back to 'build' and build's model", () => {
    const r = resolveAgentAndModel({}, [build, plan], undefined, undefined)
    expect(r.agent).toBe("build")
    expect(r.model).toBe("anthropic/claude-sonnet-4")
  })

  it("no flags, no default_agent, no build: uses the first primary agent", () => {
    const r = resolveAgentAndModel(undefined, [plan, sub], undefined, undefined)
    expect(r.agent).toBe("plan")
    expect(r.model).toBe("openai/gpt-5")
  })

  it("chosen agent has no model: falls back to the global config model", () => {
    const noModelBuild: OcAgent = { name: "build", mode: "primary" }
    const r = resolveAgentAndModel({ model: "anthropic/claude-opus-4" }, [noModelBuild], undefined, undefined)
    expect(r.agent).toBe("build")
    expect(r.model).toBe("anthropic/claude-opus-4")
  })

  it("no agent model and no config model: model is undefined (server decides)", () => {
    const noModelBuild: OcAgent = { name: "build", mode: "primary" }
    expect(resolveAgentAndModel({}, [noModelBuild], undefined, undefined).model).toBeUndefined()
  })

  it("--model wins over the agent's own model", () => {
    const r = resolveAgentAndModel({}, [build], undefined, "cohere/command-r")
    expect(r.model).toBe("cohere/command-r")
  })

  it("valid --agent is used along with its own model", () => {
    const r = resolveAgentAndModel({ default_agent: "build" }, [build, plan], "plan", undefined)
    expect(r.agent).toBe("plan")
    expect(r.model).toBe("openai/gpt-5")
  })

  it("invalid --agent flags invalidAgent and lists primary agents", () => {
    const r = resolveAgentAndModel({}, [build, plan], "nope", undefined)
    expect(r.invalidAgent).toBe("nope")
    expect(r.availableAgents).toEqual(["build", "plan"])
  })

  it("config.default_agent that is not primary is ignored (falls back to build)", () => {
    const r = resolveAgentAndModel({ default_agent: "helper" }, [build, sub], undefined, undefined)
    expect(r.agent).toBe("build")
  })

  it("empty agents list (fetch failed) trusts an explicit --agent instead of flagging it", () => {
    const r = resolveAgentAndModel({ model: "anthropic/claude-sonnet-4" }, [], "build", undefined)
    expect(r.invalidAgent).toBeUndefined()
    expect(r.agent).toBe("build")
    expect(r.model).toBe("anthropic/claude-sonnet-4")
  })

  it("empty agents list trusts config.default_agent when no CLI agent given", () => {
    const r = resolveAgentAndModel({ default_agent: "remote-worker" }, [], undefined, undefined)
    expect(r.agent).toBe("remote-worker")
  })

  it("resolves dynamic agent with profile 'build' when not named 'build'", () => {
    const devAgent: OcAgent = { name: "developer", mode: "primary", profile: "build" }
    const r = resolveAgentAndModel({}, [plan, devAgent], undefined, undefined)
    expect(r.agent).toBe("developer")
  })

  it("resolves dynamic agent with role 'build'", () => {
    const worker: OcAgent = { name: "worker-ai", mode: "primary", role: "build" }
    const r = resolveAgentAndModel({}, [plan, worker], undefined, undefined)
    expect(r.agent).toBe("worker-ai")
  })

  it("resolves dynamic agent with options.profile 'build'", () => {
    const optAgent: OcAgent = { name: "custom-coder", mode: "primary", options: { profile: "build" } }
    const r = resolveAgentAndModel({}, [plan, optAgent], undefined, undefined)
    expect(r.agent).toBe("custom-coder")
  })

  it("resolves dynamic agent with config.agent profile 'build'", () => {
    const dev: OcAgent = { name: "dev-bot", mode: "primary" }
    const cfg = { agent: { "dev-bot": { profile: "build" } } }
    const r = resolveAgentAndModel(cfg, [plan, dev], undefined, undefined)
    expect(r.agent).toBe("dev-bot")
  })

  it("resolves dynamic agent mapped via config.mode.build.agent", () => {
    const customBuilder: OcAgent = { name: "my-builder", mode: "primary" }
    const cfg = { mode: { build: { agent: "my-builder" } } }
    const r = resolveAgentAndModel(cfg, [plan, customBuilder], undefined, undefined)
    expect(r.agent).toBe("my-builder")
  })

  it("ignores disabled agent in config even if named 'build'", () => {
    const customCoder: OcAgent = { name: "coder", mode: "primary" }
    const cfg = { agent: { build: { disable: true } } }
    const r = resolveAgentAndModel(cfg, [build, customCoder], undefined, undefined)
    expect(r.agent).toBe("coder")
    expect(r.availableAgents).toEqual(["coder"])
  })

  it("treats mode 'all' as an eligible primary agent", () => {
    const omniAgent: OcAgent = { name: "omni-worker", mode: "all", profile: "build" }
    const r = resolveAgentAndModel({}, [omniAgent], undefined, undefined)
    expect(r.agent).toBe("omni-worker")
    expect(r.availableAgents).toEqual(["omni-worker"])
  })

  it("dynamically resolves planAgent for planning tasks", () => {
    const customPlanner: OcAgent = { name: "architect", mode: "primary", profile: "plan" }
    const r = resolveAgentAndModel({}, [build, customPlanner], undefined, undefined)
    expect(r.planAgent).toBe("architect")
  })

  it("dynamically resolves planAgent via config.agent role 'plan' (same chain as build)", () => {
    // Regression: the plan chain previously omitted the config `role` links
    // its build twin consulted, so this config resolved for build but the
    // split/decompose one-shot fell back to the "plan" agent name.
    const architect: OcAgent = { name: "architect", mode: "primary" }
    const cfg = { agent: { architect: { role: "plan" } } }
    const r = resolveAgentAndModel(cfg, [build, architect], undefined, undefined)
    expect(r.planAgent).toBe("architect")
  })

  it("dynamically resolves planAgent via config.mode role 'plan'", () => {
    const planner: OcAgent = { name: "planner-x", mode: "primary" }
    const cfg = { mode: { "planner-x": { role: "plan" } } }
    const r = resolveAgentAndModel(cfg, [build, planner], undefined, undefined)
    expect(r.planAgent).toBe("planner-x")
  })

  it("falls back to server default (first agent in list) when no explicit build profile", () => {
    const agentA: OcAgent = { name: "alpha", mode: "primary" }
    const agentB: OcAgent = { name: "beta", mode: "primary" }
    const r = resolveAgentAndModel({}, [agentA, agentB], undefined, undefined)
    expect(r.agent).toBe("alpha")
  })
})

