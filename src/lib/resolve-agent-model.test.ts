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
})
