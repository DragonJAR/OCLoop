import { describe, expect, it } from "bun:test"
import { buildJudgePrompt, parseEvalResult, runEval } from "./eval-runner"
import type { OpencodeClient } from "./api"

const OK = { ok: true, status: 200, statusText: "OK" }

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
    const raw = '```json\n{"pass": true, "score": 100, "reasoning": "ok"}\n```'
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

  it("defaults score to 0 when omitted", () => {
    const raw = JSON.stringify({ pass: true, reasoning: "ok" })
    expect(parseEvalResult(raw).score).toBe(0)
  })

  it("defaults rubricFailures to [] when omitted or non-string elements", () => {
    expect(parseEvalResult(JSON.stringify({ pass: true, reasoning: "ok" })).rubricFailures).toEqual([])
    expect(
      parseEvalResult(JSON.stringify({ pass: true, reasoning: "ok", rubricFailures: ["a", 3] })).rubricFailures,
    ).toEqual([])
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

  it("clamps score to [0, 100]", () => {
    const hi = parseEvalResult(JSON.stringify({ pass: true, score: 250, reasoning: "x" }))
    const lo = parseEvalResult(JSON.stringify({ pass: true, score: -5, reasoning: "x" }))
    expect(hi.score).toBe(100)
    expect(lo.score).toBe(0)
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
  // Build a mock client whose one-shot reply is `reply`. The polling loop in
  // runOneShotAgent needs: create → messages(before=[]) → promptAsync →
  // status(idle) → messages(reply) → abort. Mirrors one-shot-agent.test.ts.
  function mockClient(reply: string): OpencodeClient {
    let msgCalls = 0
    return {
      session: {
        create: async () => ({ data: { id: "ses_j" }, response: OK }),
        promptAsync: async () => ({ response: OK }),
        status: async () => ({ data: { ses_j: { type: "idle" } }, response: OK }),
        messages: async () => {
          msgCalls++
          const data =
            msgCalls === 1
              ? []
              : [{ info: { role: "assistant" }, parts: [{ type: "text", text: reply }] }]
          return { data, response: OK }
        },
        abort: async () => ({ data: true, response: OK }),
      },
    } as unknown as OpencodeClient
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
