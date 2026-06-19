/**
 * Eval layer — LM-judge for non-deterministic verification.
 *
 * The paper *The New SDLC With Vibe Coding* frames the central differentiator:
 *
 *   "Tests verify the deterministic parts of the system. Evaluations, or
 *    evals, verify the parts that are not deterministic: did the agent take
 *    the right trajectory of steps, choose the right tools, and produce a
 *    final response that meets the quality bar. Without both, the practice is
 *    always vibe coding."
 *
 * `runEval` calls an LM-judge over the iteration's evidence against a declared
 * rubric, and returns a structured verdict. It is a thin wrapper over
 * `runOneShotAgent` (which owns a throwaway session and aborts it on exit, so
 * the judge never collides with the main loop's session).
 *
 * Fail-closed contract: the judge's reply is parsed strictly. ANY failure to
 * produce a well-formed verdict — malformed JSON, missing fields, wrong types
 * — returns `{ pass: false, rubricFailures: ["judge_parse_error"], ... }`. We
 * never trust an output we cannot understand; a fluent but unparseable reply
 * is treated as a failed eval, not a passed one (mirrors the paper's "a fluent
 * output that skipped its verification steps is a more dangerous failure than
 * one with a visible error").
 *
 * The caller owns: what `evidence` to assemble (the activity-log slice for the
 * iteration), what `rubric` to declare (read from PLAN.md via
 * `getEvalRubricForTask`), and what to do with a failure (retry vs block).
 */

import { type OpencodeClient } from "./api"
import { runOneShotAgent } from "./one-shot-agent"

/** Structured verdict from the LM-judge over one iteration's evidence. */
export interface EvalResult {
  /** True iff the evidence satisfies the rubric. Fail-closed on parse error. */
  pass: boolean
  /** 0–100 quality score (0 when fail-closed or judge omitted it). */
  score: number
  /** Human-readable list of rubric dimensions the judge found unsatisfied. */
  rubricFailures: string[]
  /** The judge's reasoning (or the raw reply when fail-closed). */
  reasoning: string
}

export interface RunEvalOptions {
  client: OpencodeClient
  /** The rubric the evidence is scored against (free-form prose). */
  rubric: string
  /**
   * The evidence text — what the iteration actually did (tool calls, diffs,
   * messages). The caller assembles this; an empty evidence string should
   * cause the caller to SKIP the eval (judging on nothing yields noise).
   */
  evidence: string
  /** Model to use as the judge. Defaults to the caller's active model. */
  model?: string
  /** Overall budget for the judge call (ms). Default 60s. */
  timeoutMs?: number
  /** Poll interval while waiting for the judge (ms). Default 1500. */
  pollMs?: number
}

/** The fail-closed verdict returned whenever the judge cannot be trusted. */
function failClosed(raw: string): EvalResult {
  return {
    pass: false,
    score: 0,
    rubricFailures: ["judge_parse_error"],
    reasoning: raw,
  }
}

/**
 * Strictly parse the judge's reply into an `EvalResult`. Returns fail-closed
 * for anything that is not a well-formed object with the expected fields.
 *
 * `rubricFailures` defaults to `[]` when the judge omits it; `score` defaults
 * to 0. `pass` and `reasoning` are required. We do not coerce: a `pass` that
 * is not a boolean is a parse error (fail-closed), not a silent default.
 * Tolerates a ```json``` fence wrapper defensively, though the prompt asks
 * for raw JSON.
 */
export function parseEvalResult(raw: string): EvalResult {
  const trimmed = raw.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  const jsonSrc = fenceMatch ? fenceMatch[1] : trimmed

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonSrc)
  } catch {
    return failClosed(raw)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return failClosed(raw)
  }
  const o = parsed as Record<string, unknown>

  const pass = o.pass
  const score = o.score
  const reasoning = o.reasoning
  // Tolerate camelCase or snake_case for rubricFailures.
  const rubricFailures = o.rubricFailures ?? o.rubric_failures

  if (typeof pass !== "boolean") return failClosed(raw)
  if (typeof reasoning !== "string") return failClosed(raw)

  const safeScore =
    typeof score === "number" && Number.isFinite(score)
      ? Math.max(0, Math.min(100, score))
      : 0
  const safeFailures =
    Array.isArray(rubricFailures) && rubricFailures.every((f) => typeof f === "string")
      ? (rubricFailures as string[])
      : []

  return {
    pass,
    score: safeScore,
    rubricFailures: safeFailures,
    reasoning,
  }
}

/**
 * Build the judge prompt. Kept separate so the prompt is unit-testable without
 * a client: the judge is told EXACTLY what shape to emit and that it must emit
 * JSON only (no prose, no fences — though `parseEvalResult` tolerates fences
 * defensively).
 */
export function buildJudgePrompt(rubric: string, evidence: string): string {
  return [
    "You are an evaluation judge for an autonomous coding agent's iteration.",
    "Score the EVIDENCE below against the RUBRIC. Be strict and fair.",
    "",
    "RUBRIC:",
    rubric,
    "",
    "EVIDENCE:",
    evidence,
    "",
    "Respond with ONLY a JSON object of this exact shape (no prose, no fences):",
    '{"pass": boolean, "score": number (0-100), "rubricFailures": string[], "reasoning": string}',
    "- pass: true iff the evidence satisfies the rubric.",
    "- score: 0-100 quality score.",
    "- rubricFailures: list of rubric dimensions the evidence failed (empty if pass).",
    "- reasoning: one or two sentences justifying the verdict.",
  ].join("\n")
}

/**
 * Run the LM-judge and return a structured verdict. Fail-closed on any
 * unparseable reply. Throws on judge timeout/network failure — the caller
 * decides whether to treat that as a block (don't loop on a broken judge).
 */
export async function runEval(opts: RunEvalOptions): Promise<EvalResult> {
  const prompt = buildJudgePrompt(opts.rubric, opts.evidence)
  const raw = await runOneShotAgent(opts.client, prompt, {
    model: opts.model,
    timeoutMs: opts.timeoutMs ?? 60_000,
    pollMs: opts.pollMs,
  })
  return parseEvalResult(raw)
}
