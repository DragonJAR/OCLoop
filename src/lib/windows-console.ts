import { dlopen, FFIType, ptr } from "bun:ffi"

const STD_INPUT_HANDLE = -10
const STD_OUTPUT_HANDLE = -11
const STD_ERROR_HANDLE = -12
const ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004

let prepared: boolean | null = null

function enableVtOnHandle(
  getStdHandle: (which: number) => number,
  getConsoleMode: (handle: number, modePtr: number) => boolean,
  setConsoleMode: (handle: number, mode: number) => boolean,
  which: number,
): void {
  const handle = getStdHandle(which)
  if (handle === 0 || handle === 0xffffffff) return

  const modeBuf = new Uint32Array(1)
  if (!getConsoleMode(handle, ptr(modeBuf))) return
  setConsoleMode(handle, modeBuf[0]! | ENABLE_VIRTUAL_TERMINAL_PROCESSING)
}

/**
 * On Windows, enable virtual-terminal processing on the standard console
 * handles before OpenTUI probes capabilities. Without VT, conhost echoes raw
 * DECRPM / CPR / pixel-resolution responses (`?[?1016…`, `[4;…t`) to the
 * screen — the garbage seen after exit in legacy cmd.exe / PowerShell.
 *
 * No-op (returns true) on POSIX so the call site stays unified.
 */
export function ensureWindowsConsoleReady(): boolean {
  if (process.platform !== "win32") return true
  if (prepared !== null) return prepared

  try {
    const kernel32 = dlopen("kernel32.dll", {
      GetStdHandle: { args: [FFIType.i32], returns: FFIType.u32 },
      GetConsoleMode: { args: [FFIType.u32, FFIType.ptr], returns: FFIType.bool },
      SetConsoleMode: { args: [FFIType.u32, FFIType.u32], returns: FFIType.bool },
    })

    const { GetStdHandle, GetConsoleMode, SetConsoleMode } = kernel32.symbols
    for (const which of [STD_OUTPUT_HANDLE, STD_ERROR_HANDLE, STD_INPUT_HANDLE]) {
      enableVtOnHandle(GetStdHandle, GetConsoleMode, SetConsoleMode, which)
    }

    prepared = true
    return true
  } catch {
    prepared = false
    return false
  }
}

/** Test hook: reset the memoized VT-prep flag. */
export function __resetWindowsConsoleCacheForTests(): void {
  prepared = null
}