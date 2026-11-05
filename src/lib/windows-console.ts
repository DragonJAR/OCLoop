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
 * How the process should proceed on win32 after probing the standard handles.
 * - `vt-enabled`: the handles are Win32 console buffers and VT processing was
 *   switched on (the conhost case this module was built for).
 * - `vt-assumed`: the handles are NOT Win32 console buffers (MSYS2/Cygwin/Git
 *   Bash mintty ptys are named pipes) but `TERM` names a modern VT-capable
 *   terminal. The pty already speaks VT, so continue without the conhost FFI
 *   setup instead of aborting.
 * - `unsupported`: a real console whose VT mode could not be enabled (legacy
 *   conhost) — the only case that still aborts startup.
 */
export type ConsoleReadiness = "vt-enabled" | "vt-assumed" | "unsupported"

/**
 * TERM values of interactive terminals that already speak VT/xterm sequences.
 * mintty (Git Bash / MSYS2 default) reports `xterm-256color` or `mintty`;
 * `dumb`, unset, and unknown values must NOT unlock the degrade path.
 */
const VT_TERM_RE =
  /^(?:xterm|mintty|alacritty|kitty|wezterm|foot|ghostty|rxvt|st|screen|tmux)/i

/** True when `term` names a VT-capable interactive terminal. */
export function isVtCapableTerm(term: string | undefined): boolean {
  return typeof term === "string" && VT_TERM_RE.test(term)
}

/** Pure decision for {@link ConsoleReadiness} from the probe results. */
export function resolveConsoleReadiness(
  vtEnabled: boolean,
  stdioIsConsole: boolean,
  term: string | undefined,
): ConsoleReadiness {
  if (vtEnabled) return "vt-enabled"
  if (!stdioIsConsole && isVtCapableTerm(term)) return "vt-assumed"
  return "unsupported"
}

/**
 * Probe whether a standard handle is attached to a real Win32 console buffer.
 * `GetConsoleMode` only succeeds on console handles — MSYS pty pipes, ordinary
 * pipes and files all fail it, which is exactly what distinguishes "not a
 * console at all" (degrade gracefully) from "console without VT" (abort).
 */
function stdioIsWin32Console(
  getStdHandle: (which: number) => Pointer | null,
  getConsoleMode: (handle: Pointer, modePtr: Pointer) => boolean,
  which: number,
): boolean {
  const handle = getStdHandle(which)
  if (handle === null || handle === 0 || handle === -1 ||
      handle === 0xffffffff || handle === INVALID_HANDLE_VALUE_64) return false
  const modeBuf = new Uint32Array(1)
  return getConsoleMode(handle, ptr(modeBuf))
}

/** kernel32 symbols the readiness probes need. */
interface ConsoleFFI {
  GetStdHandle: (which: number) => Pointer | null
  GetConsoleMode: (handle: Pointer, modePtr: Pointer) => boolean
  SetConsoleMode: (handle: Pointer, mode: number) => boolean
}

/** dlopen shape for the FFI struct below (kept in one place, DRY). */
const KERNEL32_SYMBOLS = {
  GetStdHandle: { args: [FFIType.i32], returns: FFIType.ptr },
  GetConsoleMode: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.bool },
  SetConsoleMode: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.bool },
} as const

function openKernel32(): ConsoleFFI {
  return dlopen("kernel32.dll", KERNEL32_SYMBOLS).symbols as ConsoleFFI
}

/**
 * True (win32 only) when stdout is not a Win32 console buffer AND `TERM` names
 * a modern VT-capable terminal — the interactive Git Bash / MSYS2 (mintty)
 * shape, where Bun reports isTTY=false because the pty is a pipe. Used by the
 * TTY gate in index.tsx so mintty sessions can run; every other non-TTY
 * invocation (plain pipes, CI, redirects) keeps the hard gate.
 */
export function msysVtTerminalAssumed(): boolean {
  if (process.platform !== "win32") return false
  try {
    const { GetStdHandle, GetConsoleMode } = openKernel32()
    const stdoutIsConsole =
      stdioIsWin32Console(GetStdHandle, GetConsoleMode, STD_OUTPUT_HANDLE)
    return resolveConsoleReadiness(false, stdoutIsConsole, process.env.TERM) === "vt-assumed"
  } catch {
    return false
  }
}

/**
 * On Windows, enable virtual-terminal processing on the standard console
 * handles before OpenTUI probes capabilities. Without VT, conhost echoes raw
 * DECRPM / CPR / pixel-resolution responses (`?[?1016…`, `[4;…t`) to the
 * screen — the garbage seen after exit in legacy cmd.exe / PowerShell.
 *
 * When the handles are not Win32 console buffers at all (Git Bash / MSYS2
 * mintty ptys) and `TERM` names a modern terminal, VT is ASSUMED and the
 * process continues — the FFI setup is meaningless there and used to abort
 * a fully capable terminal (B5). Only a real console whose VT mode cannot be
 * enabled still fails.
 *
 * No-op (returns true) on POSIX so the call site stays unified.
 */
export function ensureWindowsConsoleReady(): boolean {
  if (process.platform !== "win32") return true
  if (prepared !== null) return prepared

  try {
    const { GetStdHandle, GetConsoleMode, SetConsoleMode } = openKernel32()
    const vtEnabled = prepareConsoleHandles(
      GetStdHandle, GetConsoleMode, SetConsoleMode, !!process.stderr.isTTY,
    )
    const stdoutIsConsole =
      stdioIsWin32Console(GetStdHandle, GetConsoleMode, STD_OUTPUT_HANDLE)
    const readiness =
      resolveConsoleReadiness(vtEnabled, stdoutIsConsole, process.env.TERM)
    prepared = readiness !== "unsupported"
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
