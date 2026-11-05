import { describe, expect, it } from "bun:test"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { getOpencodeKVPath } from "./opencode-kv-path"

describe("getOpencodeKVPath", () => {
  const fallback = join(homedir(), ".local", "state", "opencode", "kv.json")

  it("uses an absolute XDG_STATE_HOME", () => {
    const state = resolve("/xdg-state")
    expect(getOpencodeKVPath({ XDG_STATE_HOME: state })).toBe(join(state, "opencode", "kv.json"))
  })

  it("ignores a relative XDG_STATE_HOME (never resolves against the cwd)", () => {
    expect(getOpencodeKVPath({ XDG_STATE_HOME: "state" })).toBe(fallback)
  })

  it("falls back to ~/.local/state when unset or empty", () => {
    expect(getOpencodeKVPath({})).toBe(fallback)
    expect(getOpencodeKVPath({ XDG_STATE_HOME: "" })).toBe(fallback)
  })
})
