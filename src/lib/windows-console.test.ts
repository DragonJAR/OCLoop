import { afterEach, describe, expect, it } from "bun:test"
import {
  ensureWindowsConsoleReady,
  __resetWindowsConsoleCacheForTests,
  enableVtOnHandle,
  prepareConsoleHandles,
} from "./windows-console"
import type { Pointer } from "bun:ffi"

describe("ensureWindowsConsoleReady", () => {
  afterEach(() => {
    __resetWindowsConsoleCacheForTests()
  })

  it("is a no-op success on POSIX", () => {
    expect(ensureWindowsConsoleReady()).toBe(true)
    expect(ensureWindowsConsoleReady()).toBe(true)
  })

  it("uses distinct VT bits for output and input handles", () => {
    const modes: number[] = []
    const getHandle = () => 123 as Pointer
    const getMode = () => true
    const setMode = (_handle: Pointer, mode: number) => { modes.push(mode); return true }
    expect(enableVtOnHandle(getHandle, getMode, setMode, -11)).toBe(true)
    expect(enableVtOnHandle(getHandle, getMode, setMode, -12)).toBe(true)
    expect(enableVtOnHandle(getHandle, getMode, setMode, -10)).toBe(true)
    expect(modes).toEqual([0x0004, 0x0004, 0x0200])
  })

  it("reports SetConsoleMode failure", () => {
    expect(enableVtOnHandle(() => 123 as Pointer, () => true, () => false, -11)).toBe(false)
  })

  it("does not report ready when a required handle cannot be prepared", () => {
    expect(prepareConsoleHandles(
      () => 123 as Pointer, () => true,
      (_handle, mode) => mode !== 0x0200,
      true,
    )).toBe(false)
  })

  it("skips redirected stderr while preparing stdout and stdin", () => {
    const handles: number[] = []
    expect(prepareConsoleHandles(
      (which) => { handles.push(which); return 123 as Pointer },
      () => true, () => true, false,
    )).toBe(true)
    expect(handles).toEqual([-11, -10])
  })
})
