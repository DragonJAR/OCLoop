import { afterEach, describe, expect, it } from "bun:test"
import {
  ensureWindowsConsoleReady,
  __resetWindowsConsoleCacheForTests,
} from "./windows-console"

describe("ensureWindowsConsoleReady", () => {
  afterEach(() => {
    __resetWindowsConsoleCacheForTests()
  })

  it("is a no-op success on POSIX", () => {
    expect(ensureWindowsConsoleReady()).toBe(true)
    expect(ensureWindowsConsoleReady()).toBe(true)
  })
})