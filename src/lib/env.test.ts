import { describe, expect, it } from "bun:test"
import { stripEnvKey } from "./env"

describe("stripEnvKey", () => {
  it("deletes every casing variant and keeps unrelated keys", () => {
    const env: Record<string, string | undefined> = { Foo_Bar: "1", FOO_BAR: "2", foo_bar: "3", PATH: "/bin" }
    expect(stripEnvKey(env, "FOO_BAR")).toEqual({ PATH: "/bin" })
  })
})
