import { describe, expect, it } from "bun:test"
import { stripEnvKey, upperCaseEnvKeys } from "./env"

describe("stripEnvKey", () => {
  it("deletes every casing variant and keeps unrelated keys", () => {
    const env: Record<string, string | undefined> = { Foo_Bar: "1", FOO_BAR: "2", foo_bar: "3", PATH: "/bin" }
    // stripEnvKey returns the same generic type it was given, so the expected
    // value has to carry that type even though the keys are gone at runtime.
    expect(stripEnvKey(env, "FOO_BAR")).toEqual({ PATH: "/bin" } as typeof env)
  })
})

describe("upperCaseEnvKeys", () => {
  it("upper-cases keys; the upper-case spelling wins a collision in any order", () => {
    expect(upperCaseEnvKeys({ term: "a", Path: "/x" })).toEqual({ TERM: "a", PATH: "/x" })
    expect(upperCaseEnvKeys({ TERM: "up", term: "low" })).toEqual({ TERM: "up" })
    expect(upperCaseEnvKeys({ term: "low", TERM: "up" })).toEqual({ TERM: "up" })
  })
})
