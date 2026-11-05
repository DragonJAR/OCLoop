import { afterEach, describe, expect, it } from "bun:test"
import {
  ensureWindowsConsoleReady,
  __resetWindowsConsoleCacheForTests,
  enableVtOnHandle,
  prepareConsoleHandles,
  isVtCapableTerm,
  resolveConsoleReadiness,
} from "./windows-console"
import type { Pointer } from "bun:ffi"

describe("ensureWindowsConsoleReady", () => {
  afterEach(() => {
    __resetWindowsConsoleCacheForTests()
  })

  // On Windows the function actually enables the virtual terminal on the
  // console handles, so "no-op" is only true off Windows.
  it.skipIf(process.platform === "win32")("is a no-op success on POSIX", () => {
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

describe("isVtCapableTerm (B5: Git Bash / MSYS2 degrade)", () => {
  it("accepts the mintty/MSYS2 TERM values", () => {
    expect(isVtCapableTerm("xterm-256color")).toBe(true)
    expect(isVtCapableTerm("xterm")).toBe(true)
    expect(isVtCapableTerm("mintty")).toBe(true)
  })

  it("accepts other modern VT terminals", () => {
    expect(isVtCapableTerm("alacritty")).toBe(true)
    expect(isVtCapableTerm("kitty")).toBe(true)
    expect(isVtCapableTerm("wezterm")).toBe(true)
    expect(isVtCapableTerm("screen-256color")).toBe(true)
    expect(isVtCapableTerm("tmux-256color")).toBe(true)
  })

  it("rejects unset, empty, dumb and unknown values", () => {
    expect(isVtCapableTerm(undefined)).toBe(false)
    expect(isVtCapableTerm("")).toBe(false)
    expect(isVtCapableTerm("dumb")).toBe(false)
    expect(isVtCapableTerm("vt100")).toBe(false)
  })
})

describe("resolveConsoleReadiness (B5)", () => {
  it("reports vt-enabled when the FFI setup succeeded", () => {
    expect(resolveConsoleReadiness(true, false, undefined)).toBe("vt-enabled")
    expect(resolveConsoleReadiness(true, true, undefined)).toBe("vt-enabled")
  })

  it("degrades to vt-assumed for non-console stdio with a modern TERM (mintty)", () => {
    expect(resolveConsoleReadiness(false, false, "xterm-256color")).toBe("vt-assumed")
    expect(resolveConsoleReadiness(false, false, "mintty")).toBe("vt-assumed")
  })

  it("stays unsupported for non-console stdio without a modern TERM (plain pipes/CI)", () => {
    expect(resolveConsoleReadiness(false, false, undefined)).toBe("unsupported")
    expect(resolveConsoleReadiness(false, false, "dumb")).toBe("unsupported")
  })

  it("stays unsupported for a real console whose VT could not be enabled (legacy conhost)", () => {
    expect(resolveConsoleReadiness(false, true, "xterm-256color")).toBe("unsupported")
    expect(resolveConsoleReadiness(false, true, undefined)).toBe("unsupported")
  })
})
