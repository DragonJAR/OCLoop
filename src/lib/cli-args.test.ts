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

// Finding 1.1.B (LOW) — non-resilience duplicate flag behavior was only
// implicitly covered. Pin the contract explicitly so a switch fall-through
// regression (e.g. an accidental `break` outside the case) is caught for
// value flags (last-wins) and boolean flags (idempotent).
describe("parseArgs — duplicate flag behavior (Finding 1.1.B)", () => {
  it("duplicate --port flags: last wins", () => {
    const { args } = runParse(["--port", "8080", "--port", "9090"])
    expect(args?.port).toBe(9090)
  })

  it("duplicate --debug flags: idempotent", () => {
    const { args } = runParse(["--debug", "--debug"])
    expect(args?.debug).toBe(true)
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

  // ---- Idempotency (Phase 1 Task 1.10) -----------------------------------
  //
  // The "does not mutate argv" check above proves the input is preserved. This
  // group proves the stronger claim: the OUTPUT is also a pure function of the
  // input. Calling parseArgs twice with the same argv must produce two CLIArgs
  // objects that are deeply equal. This matters because every consumer of
  // parseArgs (index.tsx, tests, subshells, replays) shares the contract that
  // "same argv → same result", and a future refactor that introduces a
  // counter, cache, or external state would be invisible without this test.

  it("parseArgs is idempotent on an empty argv (PLAN.md 1.10)", () => {
    const a = runParse([]).args
    const b = runParse([]).args
    expect(a).toEqual(b)
    // Distinct object identity — each call allocates a fresh CLIArgs literal.
    expect(a).not.toBe(b)
  })

  it("parseArgs is idempotent on a single boolean flag (PLAN.md 1.10)", () => {
    const argv = ["--run"]
    const a = runParse([...argv]).args
    const b = runParse([...argv]).args
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it("parseArgs is idempotent on the full flag set (PLAN.md 1.10)", () => {
    // Every value flag + every boolean flag + every resilience flag, so the
    // idempotency claim covers every code path in the switch.
    const argv = [
      "--run",
      "--debug",
      "--create-plan",
      "--verbose",
      "--chaos",
      "--resume",
      "--no-caffeinate",
      "--port", "4096",
      "--model", "openai/gpt-5",
      "--agent", "build",
      "--prompt", "p.md",
      "--plan", "x.md",
      "--lang", "es",
      "--resilience", "backoffBaseMs=500",
    ]
    const a = runParse([...argv]).args
    const b = runParse([...argv]).args
    expect(a).toEqual(b)
  })

  it("parseArgs repeated calls keep the input argv identical (PLAN.md 1.10)", () => {
    // Stronger than line 238: even after MANY calls in a row, argv must be
    // exactly as it started. This guards against an accumulation bug (e.g.
    // a future refactor that `argv.shift()`s or appends to argv).
    const argv = ["--run", "--port", "4096", "--model", "openai/gpt-5", "--lang", "es"]
    const argvSnapshot = [...argv]
    for (let i = 0; i < 5; i++) runParse(argv)
    expect(argv).toEqual(argvSnapshot)
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

  // Empty string: an empty shell-quoted arg is rejected as a missing value
  // (handled by requireValue — same as --prompt/--plan/--agent).
  it("rejects --lang with empty string", () => {
    const r = runParse(["--lang", ""])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  // Missing value: --lang with no following arg is rejected by requireValue
  // (Finding 1.4.A fix — the error names the missing value, not the locale).
  it("rejects --lang with no following arg", () => {
    const r = runParse(["--lang"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
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

  // FINDING 1.4.A — LOW — --lang now uses requireValue so the missing-value
  // error names the value, not the locale. --lang --debug is rejected with
  // "Error: --lang requires a value" (consistent with --prompt/--plan/--agent).
  // --lang fr is still rejected with the locale error (Finding 1.4.A fix).
  it("--lang --debug fails with the 'requires a value' error (Finding 1.4.A fix)", () => {
    const r = runParse(["--lang", "--debug"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
    expect(r.errors.join("\n")).not.toContain("'en' or 'es'")
  })
})

describe("parseArgs — --prompt / --plan path handling (Phase 1 Task 1.6)", () => {
  // parseArgs does NOT validate that the path exists, is a file (not a
  // directory), or has a sensible shape. It just stores the raw string into
  // args.promptFile / args.planFile and lets validatePrerequisites() in
  // src/index.tsx surface the error to the user. The tests below pin the
  // parseArgs contract: any non-empty, non-flag-shaped string is accepted.

  // --- --prompt ---------------------------------------------------------

  it("--prompt accepts a relative path verbatim (no path normalization)", () => {
    const { args, exitCode } = runParse(["--prompt", "my-prompts/loop.md"])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("my-prompts/loop.md")
  })

  it("--prompt accepts an absolute path verbatim (no path normalization)", () => {
    const { args, exitCode } = runParse(["--prompt", "/tmp/absolute-prompt.md"])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("/tmp/absolute-prompt.md")
  })

  it("--prompt accepts a non-existent path (parseArgs does not check existence)", () => {
    // Existence checking is the job of validatePrerequisites(), not parseArgs.
    // Pin the contract so a future refactor that adds an early fs.existsSync
    // check here (duplicating the validation in index.tsx) is visible.
    const { args, exitCode } = runParse(["--prompt", "definitely-does-not-exist-12345.md"])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("definitely-does-not-exist-12345.md")
  })

  it("--prompt accepts a path that happens to be a directory (parseArgs does not check kind)", () => {
    // /tmp exists and is a directory on every Unix-like dev machine, including
    // macOS. parseArgs stores it as-is; validatePrerequisites() will surface
    // the error via Bun.file().exists() which returns false for directories
    // (Bun follows the POSIX file-vs-directory distinction).
    const { args, exitCode } = runParse(["--prompt", "/tmp"])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("/tmp")
  })

  it("--prompt accepts a path with a directory-traversal segment (..)", () => {
    // parseArgs does not resolve `..`. Resolving is the OS's job at file-open
    // time. Document the current contract.
    const { args, exitCode } = runParse(["--prompt", "../../../etc/passwd"])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("../../../etc/passwd")
  })

  it("--prompt accepts a path containing whitespace in the middle", () => {
    // parseArgs is the only place in the CLI that allows whitespace in a
    // value, because the path is the LAST positional token on the line and
    // the shell has already split on the surrounding spaces. requireValue
    // only rejects leading-flag-shaped tokens, not embedded spaces.
    const { args, exitCode } = runParse(["--prompt", "my prompts/loop prompt.md"])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("my prompts/loop prompt.md")
  })

  // --- --plan -----------------------------------------------------------

  it("--plan accepts a relative path verbatim", () => {
    const { args, exitCode } = runParse(["--plan", "plans/weekly.md"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("plans/weekly.md")
  })

  it("--plan accepts an absolute path verbatim", () => {
    const { args, exitCode } = runParse(["--plan", "/var/folders/plan.md"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("/var/folders/plan.md")
  })

  it("--plan accepts a non-existent path (parseArgs does not check existence)", () => {
    const { args, exitCode } = runParse(["--plan", "no-such-plan-67890.md"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("no-such-plan-67890.md")
  })

  it("--plan accepts a directory path (parseArgs does not check kind)", () => {
    const { args, exitCode } = runParse(["--plan", "/var/folders"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("/var/folders")
  })

  // --- rejections: only the value-grammar guards fire in parseArgs -------

  it("rejects --prompt with no following arg (requireValue: undefined)", () => {
    const r = runParse(["--prompt"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  it("rejects --plan with no following arg (requireValue: undefined)", () => {
    const r = runParse(["--plan"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  it("rejects --prompt '' (requireValue: empty string)", () => {
    const r = runParse(["--prompt", ""])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  it("rejects --plan '' (requireValue: empty string)", () => {
    const r = runParse(["--plan", ""])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  it("rejects --prompt --debug (requireValue: value looks like a flag)", () => {
    const r = runParse(["--prompt", "--debug"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  it("rejects --plan --create-plan (requireValue: value looks like a flag)", () => {
    const r = runParse(["--plan", "--create-plan"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  // --- accepted edge values (deliberate) --------------------------------

  it("accepts --prompt - (lone dash is a valid filename per requireValue)", () => {
    // The lone-dash escape hatch was added so a user with a file literally
    // named `-` (legal on Unix) can reference it. Pin that --prompt honors
    // the same convention as --agent.
    const { args, exitCode } = runParse(["--prompt", "-"])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("-")
  })

  it("accepts --plan - (lone dash is a valid filename per requireValue)", () => {
    const { args, exitCode } = runParse(["--plan", "-"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("-")
  })

  // FINDING 1.1.A — MEDIUM. requireValue now treats a whitespace-only
  // string (e.g. " ", "\t", "   ") as missing, because trimming-then-empty
  // catches every shell-quoting mistake the user is likely to make without
  // rejecting the embedded-whitespace path that a real filename needs
  // (tested at the "--prompt accepts a path containing whitespace in the
  // middle" block above). Reject with the same "requires a value" error
  // used for the empty-string case so the failure mode is uniform.
  it("rejects --prompt with a single space (Finding 1.1.A — whitespace-only)", () => {
    const r = runParse(["--prompt", " "])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  it("rejects --plan with multiple spaces (Finding 1.1.A — whitespace-only)", () => {
    const r = runParse(["--plan", "   "])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("requires a value")
  })

  it("rejects --agent with a tab (Finding 1.1.A — whitespace-only, --agent parity)", () => {
    // requireValue is shared by --prompt / --plan / --agent; pin the third
    // caller's behavior so a future refactor that re-orders the rejection
    // condition is visible.
    const r = runParse(["--agent", "\t"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("--agent requires a value")
  })

  // --- interaction with other flags -------------------------------------

  it("--prompt and --plan with absolute paths override defaults independently", () => {
    const { args, exitCode } = runParse([
      "--prompt", "/etc/loop-prompt.md",
      "--plan", "/etc/PLAN.md",
    ])
    expect(exitCode).toBeNull()
    expect(args?.promptFile).toBe("/etc/loop-prompt.md")
    expect(args?.planFile).toBe("/etc/PLAN.md")
  })

  it("--prompt does not affect --plan and vice versa (no cross-contamination)", () => {
    const a = runParse(["--prompt", "p.md"]).args
    expect(a?.planFile).toBe(DEFAULTS.PLAN_FILE)
    const b = runParse(["--plan", "x.md"]).args
    expect(b?.promptFile).toBe(DEFAULTS.PROMPT_FILE)
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

describe("parseArgs — --resilience numeric coercion strictness (Finding 1.5.A)", () => {
  // FINDING 1.5.A — MEDIUM. The numeric branch of applyResilienceOverride
  // used to coerce via `Number(raw)`, which is permissive: it accepted
  // scientific notation (1e3), hex literals (0x10), decimal-as-integer (1.0),
  // and values with a leading sign (+5). The corresponding --port gate uses
  // a strict regex (^\d+$) and rejects all of these — a divergence from the
  // project's own convention. The fix adds NUM_RE = /^\d+$/ as the primary
  // gate (mirroring PORT_RE), turning the existing isInteger/isFinite checks
  // into defense-in-depth. The tests below pin the new (strict) behavior.
  //
  // Reject the permissive shapes with the new "decimal only" diagnostic:
  it("rejects scientific notation `1e3` (decimal only)", () => {
    const r = runParse(["--resilience", "backoffBaseMs=1e3"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("decimal only")
    expect(r.errors.join("\n")).toContain("1e3")
  })

  it("rejects hex literal `0x10` (decimal only)", () => {
    const r = runParse(["--resilience", "backoffBaseMs=0x10"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("decimal only")
    expect(r.errors.join("\n")).toContain("0x10")
  })

  it("rejects decimal-as-integer `1.0` (decimal only)", () => {
    const r = runParse(["--resilience", "backoffBaseMs=1.0"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("decimal only")
    expect(r.errors.join("\n")).toContain("1.0")
  })

  it("rejects a leading `+` (decimal only)", () => {
    const r = runParse(["--resilience", "backoffBaseMs=+5"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("decimal only")
    expect(r.errors.join("\n")).toContain("+5")
  })

  // Plain decimal still works after the gate.
  it("accepts a plain decimal `500` (the canonical shape)", () => {
    const { args, exitCode } = runParse(["--resilience", "backoffBaseMs=500"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(500)
  })

  // Zero is a valid non-negative integer; pin that the new regex doesn't
  // accidentally reject it.
  it("accepts zero as a valid non-negative integer", () => {
    const { args, exitCode } = runParse(["--resilience", "backoffBaseMs=0"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.backoffBaseMs).toBe(0)
  })

  // The non-integer decimal guard still fires — just with the new wording.
  it("rejects non-integer decimals (`1.5`) with the decimal-only diagnostic", () => {
    const r = runParse(["--resilience", "maxRateLimitRetries=1.5"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("decimal only")
  })
})

describe("parseArgs — --create-plan + other flag combinations (Phase 1 Task 1.7)", () => {
  // parseArgs is a pure tokenizer; it accepts every combination of flags
  // without checking semantic compatibility. The compatibility lives in
  // src/index.tsx (line 320-323): when `args.createPlan` is true, main()
  // short-circuits into runCreatePlan() and never reaches the TUI. So
  // flags that only matter to the TUI (--run, --debug, --verbose,
  // --resume, --chaos, --no-caffeinate, --prompt) are parsed and stored
  // on the args object but never read by runCreatePlan. The tests below
  // pin both the parseArgs contract and the "stores but does not validate"
  // behavior so a future refactor that either (a) rejects the combination
  // up-front, or (b) actually wires the TUI-only flags into the plan-gen
  // flow, is visible as a behavioral change.

  // --- flags that runCreatePlan reads -----------------------------------

  it("--create-plan + --port: stored verbatim, used by runCreatePlan", () => {
    const { args, exitCode } = runParse(["--create-plan", "--port", "8123"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.port).toBe(8123)
  })

  it("--create-plan + --plan X: stored, used as the output path", () => {
    const { args, exitCode } = runParse(["--create-plan", "--plan", "my-plan.md"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.planFile).toBe("my-plan.md")
  })

  it("--create-plan + --resilience planTimeoutMs=N: stored, used as the budget", () => {
    const { args, exitCode } = runParse([
      "--create-plan", "--resilience", "planTimeoutMs=300000",
    ])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.resilience?.planTimeoutMs).toBe(300000)
  })

  // --- flags parsed but NOT read by runCreatePlan (TUI-only) ------------

  it("--create-plan + --run: --run is parsed but ignored by the plan-gen flow", () => {
    // The TUI never starts in create-plan mode, so the TUI's
    // `if (props.run) loop.dispatch({ type: "start" })` never fires.
    // parseArgs stores both flags independently — no conflict detected.
    const { args, exitCode } = runParse(["--create-plan", "--run"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.run).toBe(true)
  })

  it("--create-plan + --debug: --debug is parsed but ignored by the plan-gen flow", () => {
    // runCreatePlan has no debug branch; the TUI's debug-only effects
    // (props.debug at App.tsx:572, 588, 606, 980, 1017, 1100, 1269) never
    // run because main() exits before render().
    const { args, exitCode } = runParse(["--create-plan", "--debug"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.debug).toBe(true)
  })

  it("--create-plan + --resume: --resume is parsed but ignored by the plan-gen flow", () => {
    // resilience().resume is read only at App.tsx:1119 (TUI onMount). In
    // create-plan mode that effect never runs. The session reconcile
    // path that --resume unlocks is for the loop, not the plan generator.
    const { args, exitCode } = runParse(["--create-plan", "--resume"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.resilience?.resume).toBe(true)
  })

  it("--create-plan + --chaos: parsed into resilience.chaos, ignored by plan-gen", () => {
    // createChaos is constructed only inside App.tsx (line 225); the
    // `resilience().chaos && props.debug` gate never evaluates.
    const { args, exitCode } = runParse(["--create-plan", "--chaos"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.resilience?.chaos).toBe(true)
  })

  it("--create-plan + --no-caffeinate: parsed, ignored by plan-gen", () => {
    // createPowerManager is constructed only inside App.tsx (line 190);
    // the macOS caffeinate process never starts in create-plan mode.
    const { args, exitCode } = runParse(["--create-plan", "--no-caffeinate"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.resilience?.caffeinate).toBe(false)
  })

  it("--create-plan + --verbose: parsed, ignored by plan-gen (TUI-only logging)", () => {
    // props.verbose is read only at App.tsx:1639 (the TUI keyboard
    // listener for verbose event logging). plan-gen has no verbose path.
    const { args, exitCode } = runParse(["--create-plan", "--verbose"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.verbose).toBe(true)
  })

  it("--create-plan + --prompt: parsed but not validated (validatePrerequisites is skipped)", () => {
    // src/index.tsx:343 calls validatePrerequisites() ONLY in the
    // non-create-plan branch. A user who runs
    // `ocloop --create-plan --prompt does-not-exist.md` gets the plan
    // generator without any error about the missing --prompt path —
    // args.promptFile is stored on the object but never read by
    // runCreatePlan. The user only sees the prompt-path error after the
    // plan is approved and the TUI starts (which it does NOT in
    // create-plan mode — process exits at index.tsx:322).
    const { args, exitCode } = runParse([
      "--create-plan", "--prompt", "does-not-exist.md",
    ])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.promptFile).toBe("does-not-exist.md")
  })

  // --- flag that is read indirectly (locale drives plan-gen strings) -----

  it("--create-plan + --lang es: stored, runCreatePlan uses it via t()", () => {
    // The locale is resolved in main() (index.tsx:316) BEFORE the
    // create-plan branch runs (line 320). runCreatePlan uses t() for
    // every user-facing string, so --lang es does affect the plan-gen
    // output. parseArgs does not need to know this — it just stores.
    const { args, exitCode } = runParse(["--create-plan", "--lang", "es"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
    expect(args?.lang).toBe("es")
  })

  // --- idempotency and order independence --------------------------------

  it("--create-plan twice is idempotent (last-wins = same value)", () => {
    const { args, exitCode } = runParse(["--create-plan", "--create-plan"])
    expect(exitCode).toBeNull()
    expect(args?.createPlan).toBe(true)
  })

  it("--create-plan order does not matter relative to other flags", () => {
    // No flag in parseArgs consumes the next token, so all orderings
    // produce the same args shape.
    const a = runParse(["--create-plan", "--run", "--debug", "--port", "8080"]).args
    const b = runParse(["--port", "8080", "--debug", "--run", "--create-plan"]).args
    expect(a).toEqual(b)
  })

  // --- short + long forms produce identical args ------------------------

  it("-c + -r + -d + -p + -m + -a is equivalent to their long forms", () => {
    const short = runParse([
      "-c", "-r", "-d", "-p", "8080", "-m", "anthropic/claude", "-a", "build",
    ]).args
    const long = runParse([
      "--create-plan", "--run", "--debug", "--port", "8080",
      "--model", "anthropic/claude", "--agent", "build",
    ]).args
    expect(short).toEqual(long)
  })

  // --- --help / --version always win (even combined with --create-plan) --

  it("--help wins over --create-plan (exits 0, prints usage)", () => {
    const r = runParse(["--create-plan", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.logs.join("\n")).toContain("Usage: ocloop")
  })

  it("--version wins over --create-plan (exits 0, prints version)", () => {
    const r = runParse(["--create-plan", "--version"])
    expect(r.exitCode).toBe(0)
    expect(r.logs.join("\n")).toContain("ocloop ")
  })
})

describe("parseArgs — --resume combined with --run, --create-plan, standalone (Phase 1 Task 1.8)", () => {
  // --resume is a boolean flag: cli-args.ts:237-239 sets resilience.resume = true
  // with no value consumption. The only consumer of args.resilience.resume is
  // App.tsx:1119 (TUI onMount, after loadLoopState()). The cross-flag
  // combinations below exercise the parseArgs contract and pin the silent
  // behaviors that would otherwise hide in the runtime.

  // --- standalone ---------------------------------------------------------

  it("--resume alone: sets only resilience.resume = true", () => {
    const { args, exitCode } = runParse(["--resume"])
    expect(exitCode).toBeNull()
    expect(args).toEqual({
      promptFile: DEFAULTS.PROMPT_FILE,
      planFile: DEFAULTS.PLAN_FILE,
      resilience: { resume: true },
    })
  })

  it("--resume does not consume the next token (it's a pure boolean)", () => {
    // parseArgs must NOT do `args.someValue = argv[++i]` for --resume.
    // If it did, the value-less flag would steal the next token and either
    // set resume to "--debug" (a string) or crash on undefined at the end.
    // The pattern below proves --resume stores a boolean and the next flag
    // is still parsed as a separate switch.
    const { args, exitCode } = runParse(["--resume", "--debug"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.debug).toBe(true)
    expect(typeof args?.resilience?.resume).toBe("boolean")
  })

  it("--resume as the last token (no following value) does not error", () => {
    // Edge case: --resume is the final token in argv. There is no next
    // token to consume. parseArgs must not try to read argv[++i] and
    // crash on undefined. The existing flag's case body has no argv[++i],
    // so this is a true no-op — but the test pins it.
    const { args, exitCode } = runParse(["--run", "--resume"])
    expect(exitCode).toBeNull()
    expect(args?.run).toBe(true)
    expect(args?.resilience?.resume).toBe(true)
  })

  // --- --resume + --run (TUI: start iterating AND auto-resume) ------------

  it("--resume + --run: both flags stored, no conflict in parseArgs", () => {
    // App.tsx:1119 reads resilience().resume; App.tsx:1135 reads props.run
    // and dispatches { type: "start" }. Both effects run in the TUI when
    // the onMount branch is reached. parseArgs has no way to know that
    // these two flags interact at runtime — it just stores both.
    const { args, exitCode } = runParse(["--resume", "--run"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.run).toBe(true)
  })

  it("--run --resume order matches --resume --run (order independence)", () => {
    // No flag consumes the next token in either case, so both orderings
    // produce deep-equal args.
    const a = runParse(["--run", "--resume"]).args
    const b = runParse(["--resume", "--run"]).args
    expect(a).toEqual(b)
  })

  it("--resume + --run + --debug: all three flags stored independently", () => {
    // The TUI runs in debug mode (props.debug), starts immediately
    // (props.run), and auto-resumes (resilience().resume). parseArgs
    // stores all three.
    const { args, exitCode } = runParse(["--resume", "--run", "--debug"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.run).toBe(true)
    expect(args?.debug).toBe(true)
  })

  it("--resume + short forms -r -d: same shape as long forms", () => {
    const short = runParse(["--resume", "-r", "-d"]).args
    const long = runParse(["--resume", "--run", "--debug"]).args
    expect(short).toEqual(long)
  })

  // --- --resume + --create-plan (create-plan short-circuit swallows --resume) ---

  it("--resume + --create-plan: both parsed, --resume is silently ignored", () => {
    // src/index.tsx:320-323 short-circuits into runCreatePlan() when
    // args.createPlan is true and process.exit()s. The TUI onMount that
    // would have read resilience().resume (App.tsx:1119) never runs.
    // parseArgs stores both — the silent swallow is the same class of
    // issue as Finding 1.7.A. This test pins the parseArgs contract.
    const { args, exitCode } = runParse(["--resume", "--create-plan"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.createPlan).toBe(true)
  })

  it("--create-plan --resume order: same args as --resume --create-plan", () => {
    const a = runParse(["--create-plan", "--resume"]).args
    const b = runParse(["--resume", "--create-plan"]).args
    expect(a).toEqual(b)
  })

  it("--create-plan -c --resume: short form -c, long form --resume, same as long/long", () => {
    const short = runParse(["--create-plan", "-c", "--resume"]).args
    const long = runParse(["--create-plan", "--create-plan", "--resume"]).args
    // parseArgs has no way to enforce "max one --create-plan" — the second
    // --create-plan just overwrites the first with the same value. The
    // result is the same shape either way. (If a future refactor added
    // a duplicate-flag warning, this test would need updating.)
    expect(short).toEqual(long)
  })

  // --- --resume + other resilience flags (all merge into resilience) ------

  it("--resume + --chaos: both keys coexist on resilience object", () => {
    const { args, exitCode } = runParse(["--resume", "--chaos"])
    expect(exitCode).toBeNull()
    expect(args?.resilience).toEqual({ resume: true, chaos: true })
  })

  it("--resume + --no-caffeinate: caffeinate=false and resume=true coexist", () => {
    const { args, exitCode } = runParse(["--resume", "--no-caffeinate"])
    expect(exitCode).toBeNull()
    expect(args?.resilience).toEqual({ resume: true, caffeinate: false })
  })

  it("--resume + --chaos + --no-caffeinate: all three merge on resilience", () => {
    const { args, exitCode } = runParse([
      "--resume", "--chaos", "--no-caffeinate",
    ])
    expect(exitCode).toBeNull()
    expect(args?.resilience).toEqual({
      resume: true,
      chaos: true,
      caffeinate: false,
    })
  })

  it("--resume + --resilience resume=false: explicit override flips the boolean", () => {
    // Last-wins on the same key, same as --no-caffeinate + --resilience
    // caffeinate=true (test at line 198). Explicit false clears the
    // implicit true from --resume.
    const { args, exitCode } = runParse([
      "--resume", "--resilience", "resume=false",
    ])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(false)
  })

  it("--resilience resume=true + --resume: explicit true first, --resume is also true", () => {
    // Same value, last-wins, no observable change.
    const { args, exitCode } = runParse([
      "--resilience", "resume=true", "--resume",
    ])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
  })

  // --- --resume + value flags (must not steal each other) -----------------

  it("--port --resume: --port's value is not stolen by --resume", () => {
    // --port is a value flag (consumes argv[++i]). --resume is a boolean
    // (consumes nothing). When --port comes first, parseArgs reads
    // argv[++i] = "--resume" and passes it to parsePort, which exits 1
    // because "--resume" is not a numeric token. This is the intended
    // requireValue-style failure for --port.
    const r = runParse(["--port", "--resume"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("--port")
  })

  it("--resume --port 4096: --resume stores true, --port gets 4096", () => {
    const { args, exitCode } = runParse(["--resume", "--port", "4096"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.port).toBe(4096)
  })

  it("--resume --prompt X --plan Y: all three stored independently", () => {
    const { args, exitCode } = runParse([
      "--resume", "--prompt", "my.md", "--plan", "tasks.md",
    ])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.promptFile).toBe("my.md")
    expect(args?.planFile).toBe("tasks.md")
  })

  it("--resume --model --agent: both value flags get their values", () => {
    const { args, exitCode } = runParse([
      "--resume", "--model", "anthropic/claude", "--agent", "build",
    ])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.model).toBe("anthropic/claude")
    expect(args?.agent).toBe("build")
  })

  it("--resume --lang es: --resume stored, --lang stored, no interaction", () => {
    const { args, exitCode } = runParse(["--resume", "--lang", "es"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
    expect(args?.lang).toBe("es")
  })

  // --- idempotency and the last-wins rule ---------------------------------

  it("--resume --resume is idempotent (last-wins on same value)", () => {
    const { args, exitCode } = runParse(["--resume", "--resume"])
    expect(exitCode).toBeNull()
    expect(args?.resilience?.resume).toBe(true)
  })

  it("--resume + --resilience resume=true: same value, no observable change", () => {
    // The redundant form must not produce a different shape — same key,
    // same boolean, same resilience object.
    const a = runParse(["--resume", "--resilience", "resume=true"]).args
    const b = runParse(["--resume"]).args
    expect(a).toEqual(b)
  })

  it("--resume with every other flag combined: stores all of them", () => {
    // The "kitchen sink" case: combine --resume with every other flag the
    // parseArgs contract documents. This is the test that would fail loudest
    // if a future refactor ever made --resume accidentally consume a token
    // or rejected one of these combinations.
    const { args, exitCode } = runParse([
      "--resume",
      "--run",
      "--debug",
      "--chaos",
      "--no-caffeinate",
      "--port", "4096",
      "--model", "anthropic/claude",
      "--agent", "build",
      "--prompt", "my.md",
      "--plan", "tasks.md",
      "--lang", "en",
      "--verbose",
      "--resilience", "maxRateLimitRetries=7",
    ])
    expect(exitCode).toBeNull()
    expect(args).toEqual({
      promptFile: "my.md",
      planFile: "tasks.md",
      port: 4096,
      model: "anthropic/claude",
      agent: "build",
      run: true,
      debug: true,
      verbose: true,
      lang: "en",
      resilience: {
        resume: true,
        chaos: true,
        caffeinate: false,
        maxRateLimitRetries: 7,
      },
    })
  })

  it("--help wins over --resume (exits 0, prints usage)", () => {
    const r = runParse(["--resume", "--help"])
    expect(r.exitCode).toBe(0)
    expect(r.logs.join("\n")).toContain("Usage: ocloop")
  })

  it("--version wins over --resume (exits 0, prints version)", () => {
    const r = runParse(["--resume", "--version"])
    expect(r.exitCode).toBe(0)
    expect(r.logs.join("\n")).toContain("ocloop ")
  })

  it("parseArgs does not mutate argv when --resume is present", () => {
    // Extends the existing line-238 invariant to a --resume-containing argv.
    // parseArgs is a pure function of its input — adding a new boolean
    // case body must not introduce any write to argv.
    const argv = ["--resume", "--run", "--port", "4096"]
    const argvCopy = [...argv]
    runParse(argv)
    expect(argv).toEqual(argvCopy)
    expect(argv.length).toBe(argvCopy.length)
  })
})

describe("parseArgs — requireValue lone-dash and flag-shaped semantics (Phase 1 Task 1.9)", () => {
  // The function under test (src/lib/cli-args.ts:137-143):
  //
  //   function requireValue(value: string | undefined, flag: string): string {
  //     if (!value || (value.startsWith("-") && value !== "-")) {
  //       console.error(`Error: ${flag} requires a value`)
  //       process.exit(1)
  //     }
  //     return value
  //   }
  //
  // The rule is: a value is rejected iff it is falsy OR it starts with `-`
  // and is longer than one character. The lone `-` (length 1, starts with `-`)
  // is the explicit escape hatch — `-` is a legal filename on every Unix-like
  // filesystem (the standard `stdin`/`stdout` convention), and a user with a
  // file literally named `-` must be able to reference it.
  //
  // The tests below pin BOTH halves of the rule (reject && accept) for every
  // value flag that uses requireValue, plus a matrix of "looks like a flag"
  // rejections (short `-X`, long `--X`, with a mix of unrelated flags). The
  // existing tests at line 211-218 (--flag --debug) and line 524-537
  // (--flag -) cover the two extreme cases; the matrix here proves the rule
  // is uniformly applied across all three value flags AND across the full
  // alphabet of other flags the user might accidentally chain.

  // --- The lone-dash ACCEPT case for every value flag -------------------

  it("accepts --agent - (lone dash is a valid filename per requireValue)", () => {
    // Mirror of the --prompt / --plan lone-dash tests (line 524-537). The
    // function is shared, so the behavior must be identical across all
    // three callers. Pin the third caller's behavior here.
    const { args, exitCode } = runParse(["--agent", "-"])
    expect(exitCode).toBeNull()
    expect(args?.agent).toBe("-")
  })

  // --- The "looks like a flag" REJECT matrix ----------------------------

  // Every value flag must reject a single-dash short form (e.g. `-d`). The
  // user typed `--plan -d` and almost certainly meant `--plan` (value) and
  // `-d` (debug) as separate flags; silently consuming `-d` as the plan
  // filename would set args.planFile = "-d" and drop -d.
  const shortReject: Array<[string, string, string]> = [
    ["--prompt", "-d", "debug"],
    ["--prompt", "-r", "run"],
    ["--prompt", "-c", "create-plan"],
    ["--prompt", "-h", "help"],
    ["--plan", "-d", "debug"],
    ["--plan", "-r", "run"],
    ["--plan", "-c", "create-plan"],
    ["--plan", "-a", "agent"],
    ["--agent", "-d", "debug"],
    ["--agent", "-c", "create-plan"],
    ["--agent", "-p", "port"],
    ["--agent", "-m", "model"],
  ]
  for (const [flag, value, label] of shortReject) {
    it(`rejects ${flag} ${value} (single-dash short flag ${label})`, () => {
      const r = runParse([flag, value])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain(`${flag} requires a value`)
    })
  }

  // Every value flag must reject a long-form flag-shaped value. The
  // existing line-211-218 block covers --debug; extend to the other
  // unrelated flags. The error must come from requireValue (not from
  // the inner helper for the next flag), confirming the value was
  // rejected as a missing value rather than mis-parsed.
  const longReject: Array<[string, string]> = [
    ["--prompt", "--chaos"],
    ["--prompt", "--verbose"],
    ["--prompt", "--resume"],
    ["--prompt", "--no-caffeinate"],
    ["--prompt", "--create-plan"],
    ["--prompt", "--lang"],
    ["--plan", "--chaos"],
    ["--plan", "--verbose"],
    ["--plan", "--resume"],
    ["--plan", "--no-caffeinate"],
    ["--plan", "--lang"],
    ["--plan", "--model"],
    ["--agent", "--chaos"],
    ["--agent", "--verbose"],
    ["--agent", "--resume"],
    ["--agent", "--no-caffeinate"],
    ["--agent", "--resilience"],
  ]
  for (const [flag, value] of longReject) {
    it(`rejects ${flag} ${value} (long-form flag-shaped value)`, () => {
      const r = runParse([flag, value])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain(`${flag} requires a value`)
    })
  }

  // --- The required PLAN.md cases: --plan --debug rejects, --plan - accepts ---

  it("PLAN.md 1.9: --plan --debug is rejected (the diagnostic case)", () => {
    // The case that motivated the rule. A user who types
    //   ocloop --plan --debug
    // almost certainly meant two flags, not a plan file named "--debug".
    // requireValue catches this; without it, parseArgs would set
    // args.planFile = "--debug" and silently drop --debug.
    const r = runParse(["--plan", "--debug"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("--plan requires a value")
  })

  it("PLAN.md 1.9: --plan - is accepted (the lone-dash escape hatch)", () => {
    // The case that motivated the lone-dash exception. A user with a file
    // literally named `-` in the working directory needs to be able to
    // reference it without being told "looks like a flag, try again".
    const { args, exitCode } = runParse(["--plan", "-"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("-")
  })

  // --- Cross-flag interactions: --plan and --prompt both reject --debug ---

  it("the same --debug rejection fires for every value flag (uniformity)", () => {
    // Both --prompt and --agent use the same requireValue helper; verify
    // they all fire the same error message format ("<flag> requires a value").
    const r1 = runParse(["--prompt", "--debug"])
    expect(r1.exitCode).toBe(1)
    expect(r1.errors.join("\n")).toContain("--prompt requires a value")
    const r2 = runParse(["--plan", "--debug"])
    expect(r2.exitCode).toBe(1)
    expect(r2.errors.join("\n")).toContain("--plan requires a value")
    const r3 = runParse(["--agent", "--debug"])
    expect(r3.exitCode).toBe(1)
    expect(r3.errors.join("\n")).toContain("--agent requires a value")
  })

  // --- requireValue does not run for value flags that read inline (--port, --model) ---

  it("--port --debug is rejected by parsePort, not by requireValue (different error path)", () => {
    // --port reads its value inline (parsePort at line 119-130) and the
    // PORT_RE check fires first. The error message is "--port requires
    // a full integer argument", not "--port requires a value". The
    // requireValue rule is for --prompt/--plan/--agent; --port and
    // --model use stricter per-flag helpers. Pin the boundary so a
    // future refactor that unifies them is visible as a behavioral
    // change (the same input would then produce "requires a value").
    const r = runParse(["--port", "--debug"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("--port")
    expect(r.errors.join("\n")).not.toContain("--port requires a value")
  })

  it("--model --debug is rejected by parseModel, not by requireValue (different error path)", () => {
    const r = runParse(["--model", "--debug"])
    expect(r.exitCode).toBe(1)
    expect(r.errors.join("\n")).toContain("--model")
    expect(r.errors.join("\n")).not.toContain("--model requires a value")
  })

  // --- The error message embeds the requesting flag, not a generic word ---

  it("error message names the requesting flag (helps the user locate the typo)", () => {
    // The user pasted a long command and got an error; the message must
    // point at the specific flag, not a generic "an argument requires a
    // value". Pin this so a future refactor that simplifies the message
    // is visible.
    const r = runParse(["--plan", "--debug"])
    expect(r.errors.join("\n")).toBe("Error: --plan requires a value")
  })

  // --- Negative tests: legitimate values that LOOK like they could trip the rule ---

  it("accepts a value that starts with letters but contains a dash mid-string", () => {
    // The rule is `value.startsWith("-")`, not `value.includes("-")`. A
    // filename like "build-artifacts/v1.md" must be accepted.
    const { args, exitCode } = runParse(["--plan", "build-artifacts/v1.md"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("build-artifacts/v1.md")
  })

  it("accepts a value that starts with `--` in the middle (not the first char)", () => {
    // "x--debug" starts with "x", not "-". The flag-shape guard does
    // not fire. The value is stored verbatim. (Whether the OS can
    // actually open such a file is a downstream concern, not a
    // parseArgs concern.)
    const { args, exitCode } = runParse(["--plan", "x--debug"])
    expect(exitCode).toBeNull()
    expect(args?.planFile).toBe("x--debug")
  })
})
