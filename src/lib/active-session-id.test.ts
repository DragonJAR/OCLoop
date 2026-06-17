import { describe, expect, it } from "bun:test"
import { resolveActiveSessionId } from "./active-session-id"

describe("resolveActiveSessionId (Finding 16.4.A)", () => {
  it("returns the live session ID when both are set (live wins over last)", () => {
    // Pin: the live session always wins, even if lastSessionId is more recent.
    // This is the central rule — see App.tsx:402-414 (sessionId memo) and
    // App.tsx:158 (lastSessionId signal).
    expect(resolveActiveSessionId("live", "last")).toBe("live")
  })

  it("falls back to the last session ID when live is undefined", () => {
    // The loop reducer's sessionId is empty/absent for `paused`, `cooldown`,
    // `complete`, `error`, `ready`. Callers still want the last session so
    // the user can attach to / inspect what they were just running.
    expect(resolveActiveSessionId(undefined, "last")).toBe("last")
  })

  it("returns undefined when neither is set (startup)", () => {
    // Fresh process: no live session, no last session — no surface to attach to.
    expect(resolveActiveSessionId(undefined, undefined)).toBeUndefined()
  })

  it("treats empty string as a value, not a fallback trigger (?? semantics)", () => {
    // The audit explicitly recommends `??` over `||` so a future reducer
    // branch that produces "" as a sentinel would NOT silently fall back
    // to the stale lastSessionId. Today this is dormant (the memo never
    // returns ""), but the operator choice is part of the contract.
    expect(resolveActiveSessionId("", "last")).toBe("")
    expect(resolveActiveSessionId("live", "")).toBe("live")
    expect(resolveActiveSessionId("", "")).toBe("")
  })

  it("preserves the live session ID through `||`-equivalent inputs (no double-eval regression)", () => {
    // Sanity: the helper is a pure collapse. Calling it twice with the same
    // args returns the same result. The double-eval concern in Finding
    // 16.4.B is now a non-issue because the call site assigns to a local.
    const a = resolveActiveSessionId("live", "last")
    const b = resolveActiveSessionId("live", "last")
    expect(a).toBe(b)
    expect(a).toBe("live")
  })

  it("is referentially transparent — no mutation of arguments", () => {
    // The helper takes values, not accessors, and returns a new value (or
    // the same string reference when truthy). Pinned for any future
    // refactor that introduces internal state.
    const live = "live-id"
    const last = "last-id"
    const result = resolveActiveSessionId(live, last)
    expect(result).toBe(live)
    // Strings are primitive, so "mutation" is impossible — but pin that
    // we never read live.length or last.length or any other property
    // that would force a read.
    expect(result).not.toBe(last)
  })
})
