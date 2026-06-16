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

describe("parseArgs — Phase 3 edge cases", () => {
  it("--resilience caffeinate=0 maps to false", () => {
    const { args, exitCode } = runParse(["--resilience", "caffeinate=0"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.caffeinate).toBe(false)
  })

  it("--resilience backoffBaseMs=0 accepts zero (valid non-negative integer)", () => {
    const { args, exitCode } = runParse(["--resilience", "backoffBaseMs=0"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(0)
  })

  it("parseArgs does not mutate the input argv array", () => {
    const argv = ["--run", "--port", "4096", "--model", "openai/gpt-5"]
    const argvCopy = [...argv]
    runParse(argv)
    expect(argv).toEqual(argvCopy)
    expect(argv.length).toBe(argvCopy.length)
  })

  it("--port 0 is accepted (TCP port 0 means OS-assigned)", () => {
    const { args, exitCode } = runParse(["--port", "0"])
    expect(exitCode).toBeNull()
    expect(args?.port).toBe(0)
  })

  it("--model with extra slash a/b/c is rejected", () => {
    const r = runParse(["--model", "a/b/c"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("provider/model")
  })
})

describe("parseArgs — --model whitespace rejection (Phase 1 Task 1.3)", () => {
  const cases: Array<[string, string]> = [
    ["leading space", " anthropic/claude"],
    ["trailing space", "anthropic/claude "],
    ["internal space (provider side)", "anthropic /claude"],
    ["internal space (model side)", "anthropic/ claude"],
    ["leading tab", "\tanthropic/claude"],
    ["trailing tab", "anthropic/claude\t"],
    ["tab between provider and slash", "anthropic\t/claude"],
    ["tab between slash and model", "anthropic/\tclaude"],
    ["only whitespace after slash", "anthropic/   "],
    ["newline embedded", "anthropic/claude\n"],
  ]
  for (const [name, value] of cases) {
    it(`rejects --model with ${name}`, () => {
      const r = runParse(["--model", value])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain("provider/model")
    })
  }

  it("model regex anchors strictly (no allow-trim semantics)", () => {
    // DOCUMENT: the regex is ^[^\s/]+\/[^\s/]+$ — there is no silent
    // .trim(). A user who pastes " anthropic/claude " from a clipboard
    // gets a hard error, not a silent coercion. This is intentional:
    // trimming would hide typos in CI logs and provider names.
    const r = runParse(["--model", "  openai/gpt-5  "])
    expect(r.exitCode).toBe(1)
  })
})

describe("parseArgs — planTimeoutMs resilience override", () => {
  it("accepts --resilience planTimeoutMs=<ms>", () => {
    const { args, exitCode } = runParse(["--resilience", "planTimeoutMs=600000"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.planTimeoutMs).toBe(600000)
  })
})

describe("parseArgs — --lang locale validation (Phase 1 Task 1.4)", () => {
  it("accepts --lang en and --lang es (the only valid locales)", () => {
    expect(runParse(["--lang", "en"]).args?.lang).toBe("en")
    expect(runParse(["--lang", "es"]).args?.lang).toBe("es")
  })

  it("accepts --language as the long-form alias with identical semantics", () => {
    expect(runParse(["--language", "en"]).args?.lang).toBe("en")
    expect(runParse(["--language", "es"]).args?.lang).toBe("es")
  })

  // Case sensitivity: isLocale is a strict `===` check, so any non-lowercase
  // variant must be rejected. Users on a Spanish keyboard or those who
  // capitalize locales by mistake (common with locale tags like en-US) get a
  // hard error rather than silent coercion.
  const wrongCase: Array<[string, string]> = [
    ["uppercase EN", "EN"],
    ["titlecase En", "En"],
    ["uppercase ES", "ES"],
    ["titlecase Es", "Es"],
  ]
  for (const [name, value] of wrongCase) {
    it(`rejects --lang with ${name}`, () => {
      const r = runParse(["--lang", value])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain("'en' or 'es'")
    })
  }

  // Whitespace around a valid locale: must be rejected, no silent trim.
  // Same rationale as --model (Phase 1.3): a paste from a clipboard or a
  // shell-quoting mistake should fail loudly, not be silently accepted.
  const whitespace: Array<[string, string]> = [
    ["leading space", " en"],
    ["trailing space", "en "],
    ["leading tab", "\ten"],
    ["trailing tab", "en\t"],
    ["leading newline", "\nen"],
    ["trailing newline", "es\n"],
  ]
  for (const [name, value] of whitespace) {
    it(`rejects --lang with ${name}`, () => {
      const r = runParse(["--lang", value])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain("'en' or 'es'")
    })
  }

  // Empty string: an empty shell-quoted arg should not be accepted.
  it("rejects --lang with empty string", () => {
    const r = runParse(["--lang", ""])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("'en' or 'es'")
  })

  // Missing value: --lang with no following arg. (Different from the case
  // where the following arg exists but is invalid.)
  it("rejects --lang with no following arg", () => {
    const r = runParse(["--lang"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("'en' or 'es'")
  })

  // Non-locale values: every other string is rejected with the same message.
  // (Most of these are covered by the existing 'invalid input exits 1'
  // table at --lang invalid, but spelling out the common cases makes the
  // intent of the audit visible.)
  const garbage: Array<[string, string]> = [
    ["French code", "fr"],
    ["English with locale tag", "en-US"],
    ["Spanish with locale tag", "es-MX"],
    ["English with extra letters", "english"],
    ["numeric", "1"],
    ["boolean-shaped", "true"],
  ]
  for (const [name, value] of garbage) {
    it(`rejects --lang with ${name}`, () => {
      const r = runParse(["--lang", value])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain("'en' or 'es'")
    })
  }

  // FINDING 1.4.A — LOW — Inconsistent missing-value error message for --lang.
  // --lang reads its value inline (no requireValue guard), so --lang --debug
  // produces "Error: --lang requires 'en' or 'es'" — the message is technically
  // correct (the value is invalid) but the user almost certainly meant to
  // pass a value, not a locale. The other value flags (--prompt, --plan,
  // --agent) use requireValue and emit "requires a value" instead, which is
  // more diagnostic. Same root cause as if a user typed "--lang en --debug"
  // and meant "--lang es --debug" but swapped positions: the error would
  // currently blame the locale, not the missing value.
  it("--lang --debug fails with the locale error (not the 'requires a value' error)", () => {
    const r = runParse(["--lang", "--debug"])
    expect(r.exitCode).toBe(1)
    // The actual current behavior — documented here so a future fix that
    // switches to requireValue is visible as a behavioral change.
    expect(r.errors.join("\n")).toContain("'en' or 'es'")
    expect(r.errors.join("\n")).not.toContain("requires a value")
  })
})

describe("parseArgs — --resilience key=value edge cases (Phase 1 Task 1.5)", () => {
  // The 5 required cases from PLAN.md 1.5 plus 4 additional edge cases
  // (empty key, just-equals, space-around-equals, multi-= for boolean).
  // The MEDIUM finding (1.5.A — non-decimal numeric values accepted) is
  // pinned in a dedicated describe block below.

  it("rejects an unknown resilience key", () => {
    const r = runParse(["--resilience", "bogus=1"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("unknown resilience key")
    expect(r.errors.join("\n")).toContain("bogus")
  })

  it("rejects a non-numeric value for a numeric key", () => {
    const r = runParse(["--resilience", "backoffBaseMs=abc"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("non-negative integer")
    expect(r.errors.join("\n")).toContain("abc")
  })

  it("rejects an empty value (key= with no value)", () => {
    const r = runParse(["--resilience", "backoffBaseMs="])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a non-empty value")
  })

  it("rejects an empty value trimmed of whitespace (key=   )", () => {
    // raw = "  " after trim() is "" — must fire the empty-value guard, not
    // the integer guard (Number("") is 0, which would otherwise pass).
    const r = runParse(["--resilience", "backoffBaseMs=   "])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a non-empty value")
  })

  // The PLAN.md 1.5 case "value with = signs": indexOf("=") splits on the
  // FIRST =, so `key=10=20` parses as key="key", raw="10=20". For a numeric
  // key, Number("10=20") is NaN and the integer guard fires. The error
  // message embeds the offending value so a user can see the extra `=`.
  it("rejects a numeric value containing an extra `=` sign", () => {
    const r = runParse(["--resilience", "backoffBaseMs=10=20"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("non-negative integer")
    expect(r.errors.join("\n")).toContain("10=20")
  })

  it("rejects a boolean value containing an extra `=` sign", () => {
    const r = runParse(["--resilience", "caffeinate=true=yes"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("boolean")
    expect(r.errors.join("\n")).toContain("true=yes")
  })

  it("rejects a non-boolean value for a boolean key", () => {
    const r = runParse(["--resilience", "caffeinate=maybe"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("boolean")
    expect(r.errors.join("\n")).toContain("maybe")
  })

  // FINDING 1.5.C — empty key (=1) and just-equals (=) are both rejected
  // by the existing `!key` guard. Pin the behavior so a future refactor that
  // re-orders the checks (e.g. moves !raw before !key) is visible.
  it("rejects an empty key (`=1`) with the 'key is empty' error", () => {
    const r = runParse(["--resilience", "=1"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("key is empty")
  })

  it("rejects a bare `=` with the 'key is empty' error", () => {
    const r = runParse(["--resilience", "="])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("key is empty")
  })

  // FINDING 1.5.D — INFO — space around `=` is correctly trimmed by the
  // implementation (kv.slice(0, eq).trim() and kv.slice(eq+1).trim()).
  // Pin the behavior so a future refactor that drops the trim is caught.
  it("tolerates whitespace around the `=` separator", () => {
    const { args, exitCode } = runParse([
      "--resilience", "backoffBaseMs =  500  ",
    ])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(500)
  })
})

describe("parseArgs — --resilience numeric coercion strictness (Phase 1 Task 1.5, finding 1.5.A)", () => {
  // FINDING 1.5.A — MEDIUM. The numeric branch of applyResilienceOverride
  // coerces via `Number(raw)`, which is permissive: it accepts scientific
  // notation (1e3), hex literals (0x10), decimal-as-integer (1.0), and
  // values with a leading sign (+5). The corresponding --port gate uses a
  // strict regex (^\d+$) and rejects all of these. This is a divergence
  // from the project's own convention; the tests below pin the current
  // (permissive) behavior so a future tightening is visible.
  //
  // Pin the permissive behavior with a single acceptance test per shape:
  it("accepts scientific notation `1e3` and coerces to 1000", () => {
    const { args, exitCode } = runParse(["--resilience", "backoffBaseMs=1e3"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(1000)
  })

  it("accepts hex literal `0x10` and coerces to 16", () => {
    const { args, exitCode } = runParse(["--resilience", "backoffBaseMs=0x10"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(16)
  })

  it("accepts decimal-as-integer `1.0` and coerces to 1", () => {
    const { args, exitCode } = runParse(["--resilience", "backoffBaseMs=1.0"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(1)
  })

  it("accepts a leading `+` and coerces to the magnitude", () => {
    const { args, exitCode } = runParse(["--resilience", "backoffBaseMs=+5"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(5)
  })

  // The decimal guard at `1.5` (existing test line 141) still fires for
  // non-integer decimals — pin it here so the asymmetry with `1.0` is
  // visible in the test file.
  it("rejects non-integer decimals (`1.5`) consistently with the integer guard", () => {
    const r = runParse(["--resilience", "maxRateLimitRetries=1.5"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("non-negative integer")
  })
})
