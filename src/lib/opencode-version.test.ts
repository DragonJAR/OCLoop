import { describe, expect, it } from "bun:test"
import { withPlatform } from "./test-helpers/with-platform"
import { mockCommandExists, realCommandExists } from "./command-exists-mock"

// Registered before the module under test loads. Only `resolveSpawnable` is
// stubbed; `isWindowsShellShim` stays real (it is the logic being exercised).
let resolved: string | null = null
mockCommandExists({
  resolveSpawnable: (cmd: string, ...rest: unknown[]) =>
    cmd === "opencode"
      ? Promise.resolve(resolved)
      : (realCommandExists.resolveSpawnable as (...a: unknown[]) => Promise<string | null>)(cmd, ...rest),
})

const { parseOpencodeVersion, getOpencodeSpawnTarget } = await import("./opencode-version")

describe("parseOpencodeVersion", () => {
  it("recognizes the supported OpenCode v1 and v2 forms", () => {
    expect(parseOpencodeVersion("opencode v2.0.18")).toBe(2)
    expect(parseOpencodeVersion("opencode 2.0.18")).toBe(2)
    expect(parseOpencodeVersion("opencode 1.18.33")).toBe(1)
    expect(parseOpencodeVersion("opencode v1.0.0")).toBe(1)
    expect(parseOpencodeVersion("v1.x")).toBe(1)
  })

  it("rejects unrelated, unsupported, empty, and malformed output", () => {
    expect(parseOpencodeVersion("codex-cli 0.159.0")).toBeNull()
    expect(parseOpencodeVersion("")).toBeNull()
    expect(parseOpencodeVersion("garbage")).toBeNull()
    expect(parseOpencodeVersion("opencode v3.0.0")).toBeNull()
    expect(parseOpencodeVersion("opencode 2.x")).toBeNull()
  })

  // `parseOpencodeVersion` calls `.toLowerCase()` on the input before the
  // regex match, so an uppercase output (some shells / wrappers emit
  // "OpenCode V2.0.18" or "OPENCODE 1.18.33") must normalize the same way.
  // Pin the case-folding contract so a future refactor that drops the
  // `.toLowerCase()` (and instead adds the /i flag, or removes the
  // normalization entirely) is caught at `bun test` time.
  it("normalizes input casing before matching (the .toLowerCase() contract)", () => {
    expect(parseOpencodeVersion("OpenCode V2.0.18")).toBe(2)
    expect(parseOpencodeVersion("OPENCODE 1.18.33")).toBe(1)
    expect(parseOpencodeVersion("OPENCODE V1.X")).toBe(1)
    // Whitespace around the input is also stripped via .trim().
    expect(parseOpencodeVersion("  opencode v2.0.18  \n")).toBe(2)
  })

  it("extracts the version when surrounded by multi-line warnings or banners", () => {
    const outputWithPreamble =
      "[WARN] Plugin 'foo' is deprecated\n" +
      "opencode v2.1.0\n" +
      "Use --no-plugins to disable\n"
    expect(parseOpencodeVersion(outputWithPreamble)).toBe(2)

    const outputWithCrlf =
      "Welcome to PowerShell\r\n" +
      "opencode 1.18.33\r\n"
    expect(parseOpencodeVersion(outputWithCrlf)).toBe(1)
  })
})

describe("getOpencodeSpawnTarget", () => {
  // `isWindowsShellShim` reads process.platform, so each case pins it.
  it("returns null when opencode cannot be resolved (no bare-name fallback)", async () => {
    resolved = null
    expect(await getOpencodeSpawnTarget()).toBeNull()
  })

  it("returns the bare name without a shell for a POSIX hit", async () => {
    resolved = "opencode"
    const target = await withPlatform("linux", () => getOpencodeSpawnTarget())
    expect(target).toEqual({ command: "opencode", shell: false })
  })

  it("quotes a .cmd shim and enables the shell on win32", async () => {
    resolved = String.raw`C:\Users\Ana\AppData\Roaming\npm\opencode.cmd`
    const target = await withPlatform("win32", () => getOpencodeSpawnTarget())
    expect(target).toEqual({ command: `"${resolved}"`, shell: true })
  })

  it("spawns a .exe directly (no quotes, no shell) on win32", async () => {
    resolved = String.raw`C:\Program Files\opencode\opencode.exe`
    const target = await withPlatform("win32", () => getOpencodeSpawnTarget())
    expect(target).toEqual({ command: resolved, shell: false })
  })
})
