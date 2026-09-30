import { describe, expect, it } from "bun:test"
import { buildJudgePrompt, parseEvalResult, runEval } from "./eval-runner"
import type { OpencodeBackend } from "./api"

describe("parseEvalResult", () => {
  it("parses a passing verdict with all fields", () => {
    const raw = JSON.stringify({
      pass: true,
      score: 92,
      rubricFailures: [],
      reasoning: "All checks satisfied.",
    })
    const r = parseEvalResult(raw)
    expect(r.pass).toBe(true)
    expect(r.score).toBe(92)
    expect(r.rubricFailures).toEqual([])
    expect(r.reasoning).toBe("All checks satisfied.")
  })

  it("parses a failing verdict with listed failures", () => {
    const raw = JSON.stringify({
      pass: false,
      score: 40,
      rubricFailures: ["missing edge case", "no error handling"],
      reasoning: "Two dimensions failed.",
    })
    const r = parseEvalResult(raw)
    expect(r.pass).toBe(false)
    expect(r.score).toBe(40)
    expect(r.rubricFailures).toEqual(["missing edge case", "no error handling"])
  })

  it("tolerates a ```json fenced wrapper", () => {
    const raw = '```json\n{"pass": true, "score": 100, "rubricFailures": [], "reasoning": "ok"}\n```'
    const r = parseEvalResult(raw)
    expect(r.pass).toBe(true)
    expect(r.score).toBe(100)
    expect(r.rubricFailures).toEqual([])
  })

  it("tolerates snake_case rubric_failures", () => {
    const raw = JSON.stringify({
      pass: false,
      score: 10,
      rubric_failures: ["x"],
      reasoning: "nope",
    })
    expect(parseEvalResult(raw).rubricFailures).toEqual(["x"])
  })

  it("fails closed when score is omitted", () => {
    const raw = JSON.stringify({ pass: true, reasoning: "ok" })
    expect(parseEvalResult(raw).rubricFailures).toEqual(["judge_parse_error"])
  })

  it("fails closed when rubricFailures is omitted or has non-string elements", () => {
    expect(parseEvalResult(JSON.stringify({ pass: true, score: 90, reasoning: "ok" })).rubricFailures).toEqual(["judge_parse_error"])
    expect(
      parseEvalResult(JSON.stringify({ pass: true, score: 90, reasoning: "ok", rubricFailures: ["a", 3] })).rubricFailures,
    ).toEqual(["judge_parse_error"])
  })

  it("is fail-closed on malformed JSON", () => {
    const r = parseEvalResult("not json at all")
    expect(r.pass).toBe(false)
    expect(r.score).toBe(0)
    expect(r.rubricFailures).toEqual(["judge_parse_error"])
    expect(r.reasoning).toBe("not json at all")
  })

  it("is fail-closed when pass is not a boolean", () => {
    const r = parseEvalResult(JSON.stringify({ pass: "yes", reasoning: "ok" }))
    expect(r.pass).toBe(false)
    expect(r.rubricFailures).toEqual(["judge_parse_error"])
  })

  it("is fail-closed when reasoning is missing", () => {
    const r = parseEvalResult(JSON.stringify({ pass: true, score: 90 }))
    expect(r.pass).toBe(false)
    expect(r.rubricFailures).toEqual(["judge_parse_error"])
  })

  it("is fail-closed on an array (not an object)", () => {
    const r = parseEvalResult("[1,2,3]")
    expect(r.pass).toBe(false)
    expect(r.rubricFailures).toEqual(["judge_parse_error"])
  })

  it("fails closed for scores outside [0, 100]", () => {
    const hi = parseEvalResult(JSON.stringify({ pass: true, score: 250, rubricFailures: [], reasoning: "x" }))
    const lo = parseEvalResult(JSON.stringify({ pass: true, score: -5, rubricFailures: [], reasoning: "x" }))
    expect(hi.pass).toBe(false)
    expect(lo.pass).toBe(false)
    expect(hi.rubricFailures).toEqual(["judge_parse_error"])
  })

  it("fails closed when pass conflicts with nonempty rubric failures", () => {
    const result = parseEvalResult(JSON.stringify({ pass: true, score: 80, rubricFailures: ["missing"], reasoning: "x" }))
    expect(result.rubricFailures).toEqual(["judge_parse_error"])
  })
})

describe("buildJudgePrompt", () => {
  it("includes the rubric, the evidence, and the required JSON shape", () => {
    const p = buildJudgePrompt("must handle null", "agent did X then Y")
    expect(p).toContain("must handle null")
    expect(p).toContain("agent did X then Y")
    expect(p).toContain('"pass": boolean')
    expect(p).toContain("rubricFailures")
  })
})

describe("runEval", () => {
  // Build a mock backend whose one-shot reply is `reply`. The polling loop in
  // runOneShotAgent needs: create → messages(before=[]) → prompt →
  // status(idle) → messages(reply) → abort. Mirrors one-shot-agent.test.ts.
  function mockClient(reply: string): OpencodeBackend {
    let msgCalls = 0
    return {
      version: 1,
      url: "http://test",
      createSession: async () => ({ id: "ses_j", title: "" }),
      sendPrompt: async () => {},
      abortSession: async () => true,
      getSessionStatus: async () => ({ type: "idle" as const }),
      fetchMessages: async () => {
        msgCalls++
        return msgCalls === 1
          ? []
          : [{ info: { role: "assistant" }, parts: [{ type: "text", text: reply }] }]
      },
      fetchAgents: async () => [],
      fetchConfig: async () => ({}),
      fetchProviderCatalog: async () => [],
      subscribeEvents: async () => {
        throw new Error("unused")
      },
    } as unknown as OpencodeBackend
  }

  it("returns a parsed passing verdict from the judge", async () => {
    const reply = JSON.stringify({ pass: true, score: 88, rubricFailures: [], reasoning: "Good." })
    const r = await runEval({
      client: mockClient(reply),
      rubric: "r",
      evidence: "e",
      timeoutMs: 2000,
      pollMs: 1,
    })
    expect(r.pass).toBe(true)
    expect(r.score).toBe(88)
  })

  it("returns fail-closed when the judge emits prose instead of JSON", async () => {
    const r = await runEval({
      client: mockClient("I think it passed!"),
      rubric: "r",
      evidence: "e",
      timeoutMs: 2000,
      pollMs: 1,
    })
    expect(r.pass).toBe(false)
    expect(r.rubricFailures).toEqual(["judge_parse_error"])
  })
})
