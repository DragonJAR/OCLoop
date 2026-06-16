import { describe, expect, it } from "bun:test"
import { getIgnoredCreatePlanFlags } from "./create-plan-warning"
import { DEFAULTS } from "./constants"

describe("getIgnoredCreatePlanFlags (Finding 1.7.A)", () => {
  it("returns [] when no TUI-only flag is set (defaults only)", () => {
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: DEFAULTS.PROMPT_FILE,
        planFile: DEFAULTS.PLAN_FILE,
      }),
    ).toEqual([])
  })

  it("flags --run, --debug, --verbose when set", () => {
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: DEFAULTS.PROMPT_FILE,
        planFile: DEFAULTS.PLAN_FILE,
        run: true,
        debug: true,
        verbose: true,
      }),
    ).toEqual(["--run", "--debug", "--verbose"])
  })

  it("flags --resume, --chaos, --no-caffeinate from the resilience partial", () => {
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: DEFAULTS.PROMPT_FILE,
        planFile: DEFAULTS.PLAN_FILE,
        resilience: { resume: true, chaos: true, caffeinate: false },
      }),
    ).toEqual(["--resume", "--chaos", "--no-caffeinate"])
  })

  it("flags --prompt only when the path differs from the default", () => {
    // Default path: silently treated as "no override", no warning.
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: DEFAULTS.PROMPT_FILE,
        planFile: DEFAULTS.PLAN_FILE,
      }),
    ).toEqual([])

    // User-supplied path: validated only in the TUI branch, so the user
    // should know create-plan will not check it.
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: "custom.md",
        planFile: DEFAULTS.PLAN_FILE,
      }),
    ).toEqual(["--prompt"])
  })

  it("does not flag --resilience key=value overrides that ARE honored (e.g. planTimeoutMs)", () => {
    // planTimeoutMs is the only resilience key runCreatePlan reads (it gates
    // the plan-generation budget). The other keys listed here are not TUI-only
    // in the create-plan context either; they have no effect and no warning
    // is warranted.
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: DEFAULTS.PROMPT_FILE,
        planFile: DEFAULTS.PLAN_FILE,
        resilience: { planTimeoutMs: 600000, backoffBaseMs: 500 },
      }),
    ).toEqual([])
  })

  it("does not flag flags that runCreatePlan reads (--port, --model, --agent, --plan, --lang)", () => {
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: DEFAULTS.PROMPT_FILE,
        planFile: "my-plan.md",
        port: 8123,
        model: "anthropic/claude",
        agent: "build",
        lang: "es",
        resilience: { planTimeoutMs: 600000 },
      }),
    ).toEqual([])
  })

  it("emits a stable order regardless of how the flags were parsed", () => {
    // The order is the documented order in MEJORAS.md, not the parse order.
    // Pin it so a future refactor that re-orders the push() calls is visible
    // as a deliberate decision.
    expect(
      getIgnoredCreatePlanFlags({
        promptFile: "x.md",
        planFile: DEFAULTS.PLAN_FILE,
        verbose: true,
        debug: true,
        run: true,
        resilience: { caffeinate: false, chaos: true, resume: true },
      }),
    ).toEqual([
      "--run",
      "--debug",
      "--verbose",
      "--resume",
      "--chaos",
      "--no-caffeinate",
      "--prompt",
    ])
  })
})
