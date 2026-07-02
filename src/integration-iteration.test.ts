import { afterEach, describe, expect, it } from "bun:test"

import { runIteration, type IterationDeps } from "./lib/start-iteration"
import {
  useLoopState,
  getActiveSessionId,
  shouldDriveIteration,
} from "./hooks/useLoopState"
import { NoProgressDetector } from "./lib/no-progress-detector"
import { DEFAULT_RESILIENCE, type ResilienceConfig } from "./lib/config"
import { createRoot } from "solid-js"
import type { OpencodeClient } from "./lib/api"
import type { LoopState } from "./types"
import { t as T } from "./lib/i18n"
import { rmSync } from "node:fs"

/** Path of the scratch prompt file makeHarness writes; cleaned after each test
 * so no temp artifact leaks into the working tree. */
const SCRATCH_PROMPT = `${import.meta.dir}/__it_prompt.tmp`

afterEach(() => {
  // Best-effort: a test may have redirected promptPath, so force+ignore.
  rmSync(SCRATCH_PROMPT, { force: true })
})

/**
 * Integration coverage for the extracted iteration body. Mirrors the
 * resilience-integration.test.ts mold: real production pieces wired together
 * (the loop reducer, the no-progress detector, getActiveSessionId) against
 * fake collaborators (the SDK client, the eval gate, the plan-completion
 * check). No Solid mount, no mock.module — `runIteration` takes everything as
 * explicit deps, which is what the extraction unlocked.
 *
 * Scenarios pinned (the high-risk paths that were previously dark):
 *   1. happy path — eval ok, plan not complete, no progress stall → session
 *      created, iteration_started dispatched, prompt sent, completed
 *   2. eval retry — runEvalIfPending returns false → no session, eval_retry
 *   3. plan complete — checkPlanComplete true → plan_complete dispatched, no session
 *   4. no-progress halt — same task for N iterations → recoverable error, no session
 *   5. race guard — user pauses during createSession → orphan aborted, orphan_aborted
 */

/** Minimal SDK client shape: only what runIteration calls. The shapes returned
 * must satisfy api.ts's `assertResponse` (which requires `{ response: { ok,
 * status, statusText } }`) and unwrap `result.data` — so the fakes return the
 * full SDK envelope, not bare payloads. */
function fakeClient(opts: {
  sessionId?: string
  createThrows?: boolean
  createDelayMs?: number
}): { client: OpencodeClient; calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { createSession: [], sendPromptAsync: [], abortSession: [] }
  const ok = { ok: true, status: 200, statusText: "OK" }
  const client = {
    session: {
      create: async () => {
        if (opts.createDelayMs) await new Promise((r) => setTimeout(r, opts.createDelayMs))
        if (opts.createThrows) throw new Error("create failed")
        const id = opts.sessionId ?? "sess-created-1"
        calls.createSession.push(id)
        return { response: ok, data: { id } }
      },
      promptAsync: async (params: unknown) => {
        calls.sendPromptAsync.push(params)
        return { response: ok, data: undefined }
      },
      abort: async (params: unknown) => {
        calls.abortSession.push(params)
        return { response: ok, data: undefined }
      },
    },
  } as unknown as OpencodeClient
  return { client, calls }
}

interface Harness {
  deps: IterationDeps
  loop: ReturnType<typeof useLoopState>
  calls: Record<string, unknown[]>
  /** mutate to control the next createSession/promptAsync/abort behavior */
  clientOpts: { sessionId?: string; createThrows?: boolean; createDelayMs?: number }
  noProgressDetector: NoProgressDetector
  /** captured by onSessionCreated */
  createdSessionId: () => string | undefined
  pendingManifestTask: () => string | null
  dispatched: () => import("./types").LoopAction[]
}

/**
 * Build an IterationDeps wired to a real reducer + real detector + fake client.
 * The `over` overrides let each scenario pin one knob (verdict of
 * runEvalIfPending, checkPlanComplete, getCurrentTask, resilience).
 */
function makeHarness(over: {
  runEvalIfPending?: () => Promise<boolean>
  checkPlanComplete?: () => Promise<boolean>
  getCurrentTask?: (planPath: string) => Promise<string | null>
  getPlanCompleteSummary?: (planPath: string) => Promise<string | null>
  resilience?: Partial<ResilienceConfig>
  clientOpts?: { sessionId?: string; createThrows?: boolean; createDelayMs?: number }
  promptContent?: string
} = {}): Harness {
  // Solid reducer must live inside a root so signals/disposers behave.
  let loop!: ReturnType<typeof useLoopState>
  createRoot((dispose) => {
    loop = useLoopState()
    // Drive it to running("") so iteration_started has a valid source state.
    loop.dispatch({ type: "server_ready" })
    loop.dispatch({ type: "start" })
    dispose()
  })

  const clientOpts = { sessionId: "sess-created-1", ...over.clientOpts }
  const { client, calls } = fakeClient(clientOpts)
  const noProgressDetector = new NoProgressDetector(over.resilience?.noProgressThreshold ?? 3)

  let manifestTask: string | null = null
  let lastStart = 0
  let sessionId: string | undefined

  const resilienceFn = (): ResilienceConfig => ({ ...DEFAULT_RESILIENCE, ...over.resilience })

  // Use a temp file so the prompt read succeeds; write it once.
  const promptPath = SCRATCH_PROMPT
  Bun.write(promptPath, over.promptContent ?? "do task {{PLAN_FILE}}")

  const dispatched: import("./types").LoopAction[] = []
  const realDispatch = loop.dispatch
  loop.dispatch = (a) => {
    dispatched.push(a)
    realDispatch(a)
  }

  const deps: IterationDeps = {
    planPath: "/tmp/__it_plan.md",
    promptPath,
    loop,
    client,
    watchdog: { notifyIterationStart: () => {} },
    noProgressDetector,
    activeAgent: () => "build",
    activeModel: () => "openai/gpt-test",
    tierMapping: () => null,
    resilience: resilienceFn,
    monotonicNow: () => Date.now(),
    t: T,
    fallbackSummary: () => "fallback",
    setPendingManifestTask: (task) => {
      manifestTask = task
    },
    onSessionCreated: (id) => {
      sessionId = id
    },
    getLastIterationStartAt: () => lastStart,
    setLastIterationStartAt: (n) => {
      lastStart = n
    },
    runEvalIfPending: over.runEvalIfPending ?? (async () => true),
    checkPlanComplete: over.checkPlanComplete ?? (async () => false),
    getCurrentTask:
      over.getCurrentTask ??
      (async () => "task one"),
    refreshPlan: async () => {},
    getPlanCompleteSummary:
      over.getPlanCompleteSummary ?? (async () => "done summary"),
  }

  return {
    deps,
    loop,
    calls,
    clientOpts,
    noProgressDetector,
    createdSessionId: () => sessionId,
    pendingManifestTask: () => manifestTask,
    dispatched: () => dispatched,
  }
}

describe("runIteration", () => {
  it("happy path: creates a session, dispatches iteration_started, sends the prompt, completes", async () => {
    const h = makeHarness()
    const result = await runIteration(h.deps)

    expect(result).toBe("completed")
    // Session created and reported.
    expect(h.createdSessionId()).toBe("sess-created-1")
    // iteration_started dispatched with that sessionId.
    const started = h.dispatched().find((a) => a.type === "iteration_started")
    expect(started && started.type === "iteration_started" && started.sessionId).toBe("sess-created-1")
    // Prompt sent with the heavy-tier-fallback model (activeModel, no routing).
    expect(h.calls.sendPromptAsync).toHaveLength(1)
    // The {{PLAN_FILE}} placeholder was substituted.
    expect((h.calls.sendPromptAsync[0] as { parts: { text: string }[] }).parts[0].text).toBe(
      "do task /tmp/__it_plan.md",
    )
    // Manifest task captured (same task the no-progress detector read).
    expect(h.pendingManifestTask()).toBe("task one")
    // Loop state advanced to running(sessionId).
    const st = h.loop.state()
    expect(st.type === "running" && st.sessionId).toBe("sess-created-1")
  })

  it("eval retry: runEvalIfPending=false → no session created, returns eval_retry", async () => {
    const h = makeHarness({ runEvalIfPending: async () => false })
    const result = await runIteration(h.deps)

    expect(result).toBe("eval_retry")
    expect(h.createdSessionId()).toBeUndefined()
    expect(h.calls.createSession).toHaveLength(0)
    expect(h.calls.sendPromptAsync).toHaveLength(0)
    // No iteration_started dispatched.
    expect(h.dispatched().some((a) => a.type === "iteration_started")).toBe(false)
  })

  it("plan complete: checkPlanComplete=true → dispatches plan_complete, no session", async () => {
    const h = makeHarness({ checkPlanComplete: async () => true })
    const result = await runIteration(h.deps)

    expect(result).toBe("plan_complete")
    expect(h.createdSessionId()).toBeUndefined()
    expect(h.calls.createSession).toHaveLength(0)
    // plan_complete dispatched with the best-effort summary.
    const pc = h.dispatched().find((a) => a.type === "plan_complete")
    expect(pc).toBeDefined()
    expect(pc && pc.type === "plan_complete" && pc.summary.summary).toBe("done summary")
  })

  it("plan complete summary fallback: getPlanCompleteSummary throws → fallback summary used", async () => {
    const h = makeHarness({
      checkPlanComplete: async () => true,
      getPlanCompleteSummary: async () => {
        throw new Error("fs gone")
      },
    })
    const result = await runIteration(h.deps)

    expect(result).toBe("plan_complete")
    const pc = h.dispatched().find((a) => a.type === "plan_complete")
    expect(pc && pc.type === "plan_complete" && pc.summary.summary).toBe("fallback")
  })

  it("no-progress halt: same task for `threshold` iterations → recoverable error, no session", async () => {
    // threshold=3 → after 3 same-task records the detector is stuck.
    const h = makeHarness({
      getCurrentTask: async () => "stuck task",
      resilience: { noProgressThreshold: 3 },
    })
    // Pre-warm the detector so THIS runIteration is the triggering one.
    h.noProgressDetector.recordIterationStart("stuck task")
    h.noProgressDetector.recordIterationStart("stuck task")

    const result = await runIteration(h.deps)

    expect(result).toBe("no_progress_halt")
    expect(h.createdSessionId()).toBeUndefined()
    expect(h.calls.createSession).toHaveLength(0)
    const err = h.dispatched().find((a) => a.type === "error")
    expect(err).toBeDefined()
    expect(err && err.type === "error" && err.recoverable).toBe(true)
    expect(err && err.type === "error" && err.decomposableTask).toBe("stuck task")
  })

  it("race guard: user quits during createSession → orphan session aborted, orphan_aborted", async () => {
    const h = makeHarness({
      clientOpts: { sessionId: "sess-race", createDelayMs: 10 },
    })
    const origCreate = (h.deps.client as unknown as { session: { create: () => Promise<{ id: string }> } }).session.create
      ; (h.deps.client as unknown as { session: { create: () => Promise<{ id: string }> } }).session.create = async () => {
        const r = await origCreate()
        h.loop.dispatch({ type: "quit" })
        return r
      }

    const result = await runIteration(h.deps)

    expect(result).toBe("orphan_aborted")
    expect(h.calls.abortSession).toHaveLength(1)
    expect(h.calls.sendPromptAsync).toHaveLength(0)
  })

  it("rate-limit cooldown resume drives startIteration via running(\"\") (C2)", async () => {
    const h = makeHarness({ clientOpts: { sessionId: "sess-retry" } })
    h.loop.dispatch({ type: "iteration_started", sessionId: "sess-pre-429" })
    h.loop.dispatch({
      type: "rate_limited",
      reason: "429",
      resumeAt: 999,
      attempt: 1,
      kind: "rate_limit",
    })
    const cd = h.loop.state()
    expect(cd.type).toBe("cooldown")
    if (cd.type === "cooldown") expect(cd.sessionId).toBe("sess-pre-429")

    h.loop.dispatch({ type: "resume_cooldown" })
    const running = h.loop.state()
    expect(running.type).toBe("running")
    expect(shouldDriveIteration(running)).toBe(true)

    const result = await runIteration(h.deps)
    expect(result).toBe("completed")
    expect(h.calls.sendPromptAsync).toHaveLength(1)
  })

  it("post-session pause before prompt send aborts orphan (start-iteration race)", async () => {
    const h = makeHarness({ clientOpts: { sessionId: "sess-late-pause" } })
    const origText = Bun.file
    const fileSpy = (path: string) => {
      const f = origText(path)
      return {
        ...f,
        exists: async () => {
          h.loop.dispatch({ type: "toggle_pause" })
          return true
        },
        text: f.text.bind(f),
      }
    }
    ;(Bun as { file: typeof Bun.file }).file = fileSpy as typeof Bun.file

    try {
      const result = await runIteration(h.deps)
      expect(result).toBe("orphan_aborted")
      expect(h.calls.abortSession).toHaveLength(1)
      expect(h.calls.sendPromptAsync).toHaveLength(0)
    } finally {
      ;(Bun as { file: typeof Bun.file }).file = origText
    }
  })

  it("running(\"\") pause during createSession is a no-op — iteration completes (C1)", async () => {
    const h = makeHarness({
      clientOpts: { sessionId: "sess-race", createDelayMs: 10 },
    })
    const origCreate = (h.deps.client as unknown as { session: { create: () => Promise<{ id: string }> } }).session.create
      ; (h.deps.client as unknown as { session: { create: () => Promise<{ id: string }> } }).session.create = async () => {
        const r = await origCreate()
        h.loop.dispatch({ type: "toggle_pause" })
        return r
      }

    const result = await runIteration(h.deps)

    expect(result).toBe("completed")
    expect(h.calls.abortSession).toHaveLength(0)
    expect(h.calls.sendPromptAsync).toHaveLength(1)
  })

  it("empty prompt throws (guarded), propagated to the wrapper catch", async () => {
    const h = makeHarness({ promptContent: "   \n   \t  " })
    // runIteration does NOT catch — it throws so the App.tsx wrapper's catch
    // can abort + route. Here we assert the throw surfaces.
    await expect(runIteration(h.deps)).rejects.toThrow(/Prompt file is empty/)
    // The session was created and reported before the throw, so the wrapper
    // would abort it. Verify onSessionCreated fired.
    expect(h.createdSessionId()).toBe("sess-created-1")
  })

  it("missing prompt file throws (guarded)", async () => {
    const h = makeHarness()
    // Point promptPath at a file that does not exist.
    h.deps.promptPath = "/tmp/__it_definitely_missing_prompt.md"
    await expect(runIteration(h.deps)).rejects.toThrow(/Prompt file not found/)
  })

  it("minIterationGapMs spacing: enforces a delay when the previous iteration was too recent", async () => {
    // gap=50ms; set lastStart to "just now" so the spacing branch waits.
    const h = makeHarness({ resilience: { minIterationGapMs: 50 } })
    // Force getLastIterationStartAt to a value within the gap window by
    // pre-setting it via a run that completes immediately (no gap the first
    // time because lastStart starts at 0). Easier: directly drive the setter.
    let last = 0
    h.deps.getLastIterationStartAt = () => last
    h.deps.setLastIterationStartAt = (n) => {
      last = n
    }
    last = Date.now() // pretend an iteration just ran

    const start = Date.now()
    await runIteration(h.deps)
    const elapsed = Date.now() - start
    // The spacing branch slept ~50ms; allow scheduling slack.
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })
})

// getActiveSessionId is imported for parity with the race-guard scenario docs;
// the reducer is the ground truth the guard reads via loop.state().
void getActiveSessionId
void (null as unknown as LoopState)
