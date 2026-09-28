import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi"

const STD_INPUT_HANDLE = -10
const STD_OUTPUT_HANDLE = -11
const STD_ERROR_HANDLE = -12
const ENABLE_VIRTUAL_TERMINAL_PROCESSING = 0x0004
const ENABLE_VIRTUAL_TERMINAL_INPUT = 0x0200
const INVALID_HANDLE_VALUE_64 = Number(0xffffffffffffffffn)

let prepared: boolean | null = null

export function enableVtOnHandle(
  getStdHandle: (which: number) => Pointer | null,
  getConsoleMode: (handle: Pointer, modePtr: Pointer) => boolean,
  setConsoleMode: (handle: Pointer, mode: number) => boolean,
  which: number,
): boolean {
  const handle = getStdHandle(which)
  if (handle === null || handle === 0 || handle === -1 ||
      handle === 0xffffffff || handle === INVALID_HANDLE_VALUE_64) return false

  const modeBuf = new Uint32Array(1)
  if (!getConsoleMode(handle, ptr(modeBuf))) return false
  const flag = which === STD_INPUT_HANDLE
    ? ENABLE_VIRTUAL_TERMINAL_INPUT
    : ENABLE_VIRTUAL_TERMINAL_PROCESSING
  return setConsoleMode(handle, modeBuf[0]! | flag)
}

export function prepareConsoleHandles(
  getStdHandle: (which: number) => Pointer | null,
  getConsoleMode: (handle: Pointer, modePtr: Pointer) => boolean,
  setConsoleMode: (handle: Pointer, mode: number) => boolean,
  stderrIsTTY: boolean,
): boolean {
  const handles = stderrIsTTY
    ? [STD_OUTPUT_HANDLE, STD_ERROR_HANDLE, STD_INPUT_HANDLE]
    : [STD_OUTPUT_HANDLE, STD_INPUT_HANDLE]
  return handles.every((which) =>
    enableVtOnHandle(getStdHandle, getConsoleMode, setConsoleMode, which))
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
      GetStdHandle: { args: [FFIType.i32], returns: FFIType.ptr },
      GetConsoleMode: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
      SetConsoleMode: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.bool },
    })

    const { GetStdHandle, GetConsoleMode, SetConsoleMode } = kernel32.symbols
    prepared = prepareConsoleHandles(
      GetStdHandle, GetConsoleMode, SetConsoleMode, !!process.stderr.isTTY,
    )
    return prepared
  } catch {
    prepared = false
    return false
  }
}

/** Test hook: reset the memoized VT-prep flag. */
export function __resetWindowsConsoleCacheForTests(): void {
  prepared = null
}
