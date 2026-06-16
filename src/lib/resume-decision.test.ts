import { describe, expect, it } from "bun:test"
import { describeResumeAttempt } from "./resume-decision"
import type { PersistedLoopState } from "./loop-state-store"

function makePersisted(iteration: number): PersistedLoopState {
  return {
    version: 1,
    iteration,
    sessionId: "sess-abc",
    stateType: "running",
    rateLimitAttempts: 0,
    updatedAt: "2026-06-16T00:00:00.000Z",
  }
}

describe("describeResumeAttempt (Finding 1.8.B)", () => {
  it("returns null when --resume was not passed (no log emitted)", () => {
    // Default args (no resilience partial) → no log.
    expect(describeResumeAttempt({}, null)).toBeNull()
    // Explicit empty resilience partial → no log.
    expect(describeResumeAttempt({ resilience: {} }, null)).toBeNull()
    // resilience with other keys but not resume → no log.
    expect(
      describeResumeAttempt({ resilience: { chaos: true } }, null),
    ).toBeNull()
  })

  it("logs hasPersisted:false when --resume was passed but no .loop-state.json exists", () => {
    // The silent-no-op case Finding 1.8.B documents: a clean run with
    // --resume produces no observable effect otherwise. The log makes the
    // no-op visible in .loop.log.
    const log = describeResumeAttempt({ resilience: { resume: true } }, null)
    expect(log).toEqual({
      event: "resume:requested",
      payload: { hasPersisted: false, iteration: 0 },
    })
  })

  it("logs hasPersisted:true with iteration:0 when persisted state is a cleared snapshot", () => {
    // A snapshot with iteration=0 is structurally valid but the App.tsx:1131
    // gate `persisted.iteration > 0` skips the resume dialog. The log
    // reflects the same outcome the runtime path sees.
    const log = describeResumeAttempt(
      { resilience: { resume: true } },
      makePersisted(0),
    )
    expect(log).toEqual({
      event: "resume:requested",
      payload: { hasPersisted: true, iteration: 0 },
    })
  })

  it("logs hasPersisted:true with iteration:N when a real resume is pending", () => {
    // App.tsx:1131 will log `resume:found` right after this `resume:requested`
    // line, so the audit trail in .loop.log shows intent → outcome.
    const log = describeResumeAttempt(
      { resilience: { resume: true } },
      makePersisted(7),
    )
    expect(log).toEqual({
      event: "resume:requested",
      payload: { hasPersisted: true, iteration: 7 },
    })
  })

  it("does not mutate the persisted state (pure helper)", () => {
    // pinpoints the helper as a side-effect-free decision function so the
    // App.tsx call site can rely on it without snapshotting concerns.
    const p = makePersisted(3)
    const before = JSON.stringify(p)
    describeResumeAttempt({ resilience: { resume: true } }, p)
    expect(JSON.stringify(p)).toBe(before)
  })
})
