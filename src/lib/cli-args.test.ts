import { describe, expect, it } from "bun:test"
import { parseArgs } from "./cli-args"
import { DEFAULTS } from "./constants"

/**
 * parseArgs calls process.exit() on --help/--version and on invalid input.
 * We stub process.exit (throwing a sentinel) and capture console output so the
 * test runner survives and we can assert exit codes + messages.
 */
class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit ${code}`)
  }
}

function runParse(argv: string[]) {
  const origExit = process.exit
  const origErr = console.error
  const origLog = console.log
  const errors: string[] = []
  const logs: string[] = []
  process.exit = ((code?: number) => {
    throw new ExitSignal(code ?? 0)
  }) as typeof process.exit
  console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(" "))
  }
  console.log = (...a: unknown[]) => {
    logs.push(a.map(String).join(" "))
  }
  try {
    const args = parseArgs(argv)
    return { args, errors, logs, exitCode: null as number | null }
  } catch (e) {
    if (e instanceof ExitSignal)
      return { args: null, errors, logs, exitCode: e.code }
    throw e
  } finally {
    process.exit = origExit
    console.error = origErr
    console.log = origLog
  }
}

describe("parseArgs — defaults & single flags", () => {
  it("returns the documented defaults with no args", () => {
    const { args } = runParse([])
    expect(args).toEqual({
      promptFile: DEFAULTS.PROMPT_FILE,
      planFile: DEFAULTS.PLAN_FILE,
    })
  })

  it("each boolean flag sets exactly its field (long & short)", () => {
    expect(runParse(["-r"]).args?.run).toBe(true)
    expect(runParse(["--run"]).args?.run).toBe(true)
    expect(runParse(["-d"]).args?.debug).toBe(true)
    expect(runParse(["--debug"]).args?.debug).toBe(true)
    expect(runParse(["-c"]).args?.createPlan).toBe(true)
    expect(runParse(["--create-plan"]).args?.createPlan).toBe(true)
    expect(runParse(["--verbose"]).args?.verbose).toBe(true)
  })

  it("value flags capture their argument (long & short)", () => {
    expect(runParse(["-p", "0"]).args?.port).toBe(0)
    expect(runParse(["-p", "5000"]).args?.port).toBe(5000)
    expect(runParse(["--port", "65535"]).args?.port).toBe(65535)
    expect(runParse(["--port", "4096"]).args?.port).toBe(4096)
    expect(runParse(["-m", "zai-coding-plan/glm-5.2"]).args?.model).toBe("zai-coding-plan/glm-5.2")
    expect(runParse(["--model", "opencode/claude"]).args?.model).toBe("opencode/claude")
    expect(runParse(["-a", "build"]).args?.agent).toBe("build")
    expect(runParse(["--prompt", "p.md"]).args?.promptFile).toBe("p.md")
    expect(runParse(["--plan", "x.md"]).args?.planFile).toBe("x.md")
    expect(runParse(["--lang", "es"]).args?.lang).toBe("es")
    expect(runParse(["--language", "en"]).args?.lang).toBe("en")
  })

  it("resilience flags collect into args.resilience", () => {
    expect(runParse(["--resume"]).args?.resilience).toEqual({ resume: true })
    expect(runParse(["--no-caffeinate"]).args?.resilience).toEqual({
      caffeinate: false,
    })
    expect(runParse(["--chaos"]).args?.resilience).toEqual({ chaos: true })
  })

  it("--resilience key=value coerces by declared type", () => {
    expect(runParse(["--resilience", "backoffBaseMs=500"]).args?.resilience)
      .toEqual({ backoffBaseMs: 500 })
    expect(runParse(["--resilience", "caffeinate=false"]).args?.resilience)
      .toEqual({ caffeinate: false })
    expect(runParse(["--resilience", "caffeinate=true"]).args?.resilience)
      .toEqual({ caffeinate: true })
  })

  it("unknown flags fail with a clear error", () => {
    const result = runParse(["--totally-unknown", "value"])
    expect(result.exitCode).toBe(1)
    expect(result.errors.join("\n")).toContain("unknown argument")
  })
})

describe("parseArgs — help/version exit", () => {
  it("-h/--help print help and exit 0", () => {
    for (const f of ["-h", "--help"]) {
      const r = runParse([f])
      expect(r.exitCode).toBe(0)
      expect(r.logs.join("\n")).toContain("Usage: ocloop")
    }
  })
  it("-v/--version print version and exit 0", () => {
    for (const f of ["-v", "--version"]) {
      const r = runParse([f])
      expect(r.exitCode).toBe(0)
      expect(r.logs.join("\n")).toContain("ocloop ")
    }
  })
})

describe("parseArgs — invalid input exits 1", () => {
  const bad: Array<[string, string[]]> = [
    ["--port non-numeric", ["--port", "abc"]],
    ["--port partial integer", ["--port", "123abc"]],
    ["--port decimal", ["--port", "123.4"]],
    ["--port negative", ["--port", "-1"]],
    ["--port above TCP range", ["--port", "65536"]],
    ["--port missing arg", ["--port"]],
    ["--model missing arg", ["--model"]],
    ["--model bare model", ["--model", "claude-sonnet-4"]],
    ["--model empty provider", ["--model", "/claude-sonnet-4"]],
    ["--model empty model", ["--model", "anthropic/"]],
    ["--model extra slash", ["--model", "anthropic/family/model"]],
    ["--agent missing arg", ["--agent"]],
    ["--prompt missing arg", ["--prompt"]],
    ["--plan missing arg", ["--plan"]],
    ["--lang invalid", ["--lang", "fr"]],
    ["--resilience no equals", ["--resilience", "foo"]],
    ["--resilience empty value", ["--resilience", "backoffBaseMs="]],
    ["--resilience unknown key", ["--resilience", "bogus=1"]],
    ["--resilience non-number", ["--resilience", "backoffBaseMs=abc"]],
    ["--resilience negative number", ["--resilience", "backoffBaseMs=-1"]],
    ["--resilience decimal count", ["--resilience", "maxRateLimitRetries=1.5"]],
    ["--resilience invalid boolean", ["--resilience", "caffeinate=maybe"]],
    ["--resilience missing arg", ["--resilience"]],
    ["unknown positional arg", ["PLAN.md"]],
  ]
  for (const [name, argv] of bad) {
    it(`${name} → exit 1 with a message`, () => {
      const r = runParse(argv)
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain("Error")
    })
  }

  it("--model bare model explains provider/model format", () => {
    const r = runParse(["--model", "claude-sonnet-4"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("provider/model")
  })
})

describe("parseArgs — pairwise combinations of interacting params", () => {
  it("--debug + --resume", () => {
    const { args } = runParse(["--debug", "--resume"])
    expect(args?.debug).toBe(true)
    expect(args?.resilience).toEqual({ resume: true })
  })

  it("--create-plan + -m + -a", () => {
    const { args } = runParse(["-c", "-m", "zai-coding-plan/glm-5.2", "-a", "plan"])
    expect(args?.createPlan).toBe(true)
    expect(args?.model).toBe("zai-coding-plan/glm-5.2")
    expect(args?.agent).toBe("plan")
  })

  it("--run + custom --prompt + custom --plan (defaults overridden)", () => {
    const { args } = runParse(["-r", "--prompt", "my.md", "--plan", "tasks.md"])
    expect(args?.run).toBe(true)
    expect(args?.promptFile).toBe("my.md")
    expect(args?.planFile).toBe("tasks.md")
  })

  it("--lang + --chaos + numeric --resilience together", () => {
    const { args } = runParse([
      "--lang", "es", "--chaos", "--resilience", "maxRateLimitRetries=3",
    ])
    expect(args?.lang).toBe("es")
    expect(args?.resilience).toEqual({ chaos: true, maxRateLimitRetries: 3 })
  })

  it("adjacent value-consuming flags don't swallow each other", () => {
    const { args } = runParse(["--port", "8080", "--model", "opencode/m1"])
    expect(args?.port).toBe(8080)
    expect(args?.model).toBe("opencode/m1")
  })

  it("repeated --resilience accumulates; last wins on conflict", () => {
    // --no-caffeinate sets caffeinate=false, then explicit override flips it.
    const a = runParse(["--no-caffeinate", "--resilience", "caffeinate=true"])
    expect(a.args?.resilience?.caffeinate).toBe(true)
    // Reverse order: explicit true first, then --no-caffeinate wins.
    const b = runParse(["--resilience", "caffeinate=true", "--no-caffeinate"])
    expect(b.args?.resilience?.caffeinate).toBe(false)
    // Two distinct keys both retained.
    const c = runParse([
      "--resilience", "backoffBaseMs=100", "--resilience", "backoffMaxMs=200",
    ])
    expect(c.args?.resilience).toEqual({ backoffBaseMs: 100, backoffMaxMs: 200 })
  })
})

describe("parseArgs — value flags reject a following flag as their value", () => {
  for (const flag of ["--prompt", "--plan", "--agent"]) {
    it(`${flag} --debug errors instead of swallowing the flag`, () => {
      const r = runParse([flag, "--debug"])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain("requires a value")
    })
  }
  it("still accepts legitimate values", () => {
    expect(runParse(["--prompt", "my.md"]).args?.promptFile).toBe("my.md")
    expect(runParse(["--agent", "plan"]).args?.agent).toBe("plan")
  })
})

describe("parseArgs — planTimeoutMs resilience override", () => {
  it("accepts --resilience planTimeoutMs=<ms>", () => {
    const { args, exitCode } = runParse(["--resilience", "planTimeoutMs=600000"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.planTimeoutMs).toBe(600000)
  })
})
