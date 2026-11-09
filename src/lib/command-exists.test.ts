/**
 * `command-exists.ts` tests.
 *
 * The helper is the single gateway clipboard + terminal detection use to ask
 * "is this binary on PATH?". It uses native `Bun.which` (no `which`/`where.exe`
 * subprocess). PLATFORM is injected via the `platform` parameter and the PATH
 * lookup via the `which` parameter, so the suite runs identically on every
 * host (macOS / Linux / Windows) without real binaries.
 */
import { beforeEach, describe, expect, it } from "bun:test"
import { resolve } from "node:path"
import { mockCommandExists, realCommandExists } from "./command-exists-mock"
import { withSystemRoot } from "./test-helpers/with-system-root"

// resolveSpawnable delegates to resolveCommandPath via a live module binding;
// reset any partial mock other files registered so internal calls stay real.
beforeEach(() => {
  mockCommandExists({})
})

const { commandExists, resolveCommandPath, resolveSpawnable, isWindowsShellShim, systemBinary, isInCwd, systemBinaryExists } =
  realCommandExists

/** Fake `Bun.which` over a fixed name -> path table; records every probe. */
function fakeWhich(table: Record<string, string>) {
  const probes: string[] = []
  const which = (name: string): string | null => {
    probes.push(name)
    return table[name] ?? null
  }
  return { which, probes }
}

describe("commandExists", () => {
  it("is true when the lookup finds the command (POSIX)", async () => {
    const { which } = fakeWhich({ pbcopy: "/usr/bin/pbcopy" })
    expect(await commandExists("pbcopy", "darwin", which)).toBe(true)
  })

  it("is false when the command is not on PATH", async () => {
    const { which } = fakeWhich({})
    expect(await commandExists("nope", "linux", which)).toBe(false)
  })

  it("never throws when the lookup itself throws", async () => {
    const which = () => {
      throw new Error("boom")
    }
    expect(await commandExists("pbcopy", "linux", which)).toBe(false)
  })

  it("probes the bare name only on POSIX", async () => {
    const { which, probes } = fakeWhich({})
    await commandExists("pbcopy", "linux", which)
    expect(probes).toEqual(["pbcopy"])
  })

  it("probes executable extensions on win32 so the built-in clip.exe is detected", async () => {
    const { which, probes } = fakeWhich({ "clip.exe": "C:\\Windows\\System32\\clip.exe" })
    expect(await commandExists("clip", "win32", which)).toBe(true)
    expect(probes).toContain("clip.exe")
  })

  it("does not append extensions when the command already has one", async () => {
    const { which, probes } = fakeWhich({})
    await commandExists("powershell.exe", "win32", which)
    expect(probes).toEqual(["powershell.exe"])
  })

  it("ignores a match that lives in the current working directory", async () => {
    const planted = resolve(process.cwd(), "opencode")
    const { which } = fakeWhich({ opencode: planted })
    // Use the host's path flavor: a win32 path is not a valid posix path.
    const platform = process.platform === "win32" ? "win32" : "linux"
    expect(await commandExists("opencode", platform, which)).toBe(false)
    expect(await resolveCommandPath("opencode", platform, which)).toBeNull()
  })

  it("defaults to the real Bun.which (a missing binary is simply false)", async () => {
    expect(await commandExists("definitely-not-a-real-binary-xyz")).toBe(false)
  })

  it("does not resolve a file that only exists in the cwd (real Bun.which)", async () => {
    expect(await commandExists("package.json")).toBe(false)
  })
})

describe("resolveCommandPath — full path resolution", () => {
  it("returns the match on POSIX", async () => {
    const { which } = fakeWhich({ opencode: "/usr/local/bin/opencode" })
    expect(await resolveCommandPath("opencode", "linux", which)).toBe(
      "/usr/local/bin/opencode",
    )
  })

  it("on win32 skips the extensionless npm shim in favor of the .cmd", async () => {
    // The extensionless file can't be launched by CreateProcess (uv_spawn
    // ENOENT), so we must resolve to the .cmd — which opencode-server.ts then
    // runs through a shell.
    const { which } = fakeWhich({
      opencode: "C:\\Users\\dev\\AppData\\Roaming\\npm\\opencode",
      "opencode.cmd": "C:\\Users\\dev\\AppData\\Roaming\\npm\\opencode.cmd",
    })
    expect(await resolveCommandPath("opencode", "win32", which)).toBe(
      "C:\\Users\\dev\\AppData\\Roaming\\npm\\opencode.cmd",
    )
  })

  it("on win32 prefers a native .exe over a .cmd shim when both exist", async () => {
    const { which } = fakeWhich({
      "opencode.cmd": "C:\\npm\\opencode.cmd",
      "opencode.exe": "C:\\Program Files\\opencode\\opencode.exe",
    })
    expect(await resolveCommandPath("opencode", "win32", which)).toBe(
      "C:\\Program Files\\opencode\\opencode.exe",
    )
  })

  it("on win32 falls back to the extensionless match when nothing is spawnable", async () => {
    const { which } = fakeWhich({ opencode: "C:\\bin\\opencode" })
    expect(await resolveCommandPath("opencode", "win32", which)).toBe("C:\\bin\\opencode")
  })

  it("returns null when not on PATH", async () => {
    const { which } = fakeWhich({})
    expect(await resolveCommandPath("nope", "linux", which)).toBeNull()
  })

  it("returns null (never throws) when the lookup throws", async () => {
    const which = () => {
      throw new Error("boom")
    }
    expect(await resolveCommandPath("opencode", "linux", which)).toBeNull()
  })
})

describe("resolveSpawnable — gate + spawn-form in one lookup", () => {
  it("win32 returns the resolved full path", async () => {
    const { which } = fakeWhich({ "clip.exe": "C:\\Windows\\System32\\clip.exe" })
    expect(await resolveSpawnable("clip", "win32", which)).toBe(
      "C:\\Windows\\System32\\clip.exe",
    )
  })

  it("win32 returns null when the command is not on PATH", async () => {
    const { which } = fakeWhich({})
    expect(await resolveSpawnable("nope", "win32", which)).toBeNull()
  })

  it("POSIX returns the BARE command when present (spawning it directly works)", async () => {
    const { which } = fakeWhich({ pbcopy: "/usr/bin/pbcopy" })
    expect(await resolveSpawnable("pbcopy", "linux", which)).toBe("pbcopy")
  })

  it("POSIX returns null when the command is not on PATH", async () => {
    const { which } = fakeWhich({})
    expect(await resolveSpawnable("nope", "linux", which)).toBeNull()
  })
})

describe("isInCwd — cwd filter with an injectable cwd (any host)", () => {
  it("win32 matches the cwd case-insensitively", () => {
    expect(isInCwd("C:\\Proj\\opencode.cmd", "win32", "c:\\proj")).toBe(true)
    expect(isInCwd("c:\\PROJ\\opencode.exe", "win32", "C:\\Proj\\")).toBe(true)
    expect(isInCwd("C:\\Tools\\opencode.cmd", "win32", "c:\\proj")).toBe(false)
  })

  it("POSIX stays case-sensitive", () => {
    expect(isInCwd("/proj/opencode", "linux", "/proj")).toBe(true)
    expect(isInCwd("/Proj/opencode", "linux", "/proj")).toBe(false)
  })

  it("resolveSpawnable drops a planted win32 shim whose case differs from the cwd", async () => {
    const { which } = fakeWhich({
      "opencode.cmd": "C:\\Proj\\opencode.cmd",
    })
    expect(await resolveSpawnable("opencode", "win32", which, "c:\\proj")).toBeNull()
    expect(await resolveSpawnable("opencode", "win32", which, "c:\\other")).toBe(
      "C:\\Proj\\opencode.cmd",
    )
  })
})

describe("systemBinary — absolute paths for guaranteed OS binaries", () => {
  it("win32: %SystemRoot%\\System32\\<name>.exe, defaulting to C:\\Windows", async () => {
    await withSystemRoot("D:\\Win", () => {
      expect(systemBinary("clip", "win32")).toBe("D:\\Win\\System32\\clip.exe")
    })
    await withSystemRoot(undefined, () => {
      expect(systemBinary("cmd", "win32")).toBe("C:\\Windows\\System32\\cmd.exe")
      expect(systemBinary("powershell", "win32", ["WindowsPowerShell", "v1.0"])).toBe(
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      )
    })
  })

  it("systemBinaryExists checks exactly the absolute systemBinary path", () => {
    const seen: string[] = []
    const exists = (p: string) => {
      seen.push(p)
      return p.endsWith("caffeinate")
    }
    expect(systemBinaryExists("caffeinate", "darwin", [], exists)).toBe(true)
    expect(systemBinaryExists("nope", "darwin", [], exists)).toBe(false)
    expect(seen).toEqual(["/usr/bin/caffeinate", "/usr/bin/nope"])
    const throws = () => {
      throw new Error("EACCES")
    }
    expect(systemBinaryExists("clip", "win32", [], throws)).toBe(false)
  })

  it("darwin/linux: /usr/bin/<name>", () => {
    expect(systemBinary("caffeinate", "darwin")).toBe("/usr/bin/caffeinate")
    expect(systemBinary("true", "linux")).toBe("/usr/bin/true")
  })
})

describe("isWindowsShellShim — unified Windows shell shim detection (DRY)", () => {
  it("identifies .cmd, .bat, and .ps1 as shell shims on win32", () => {
    expect(isWindowsShellShim("C:\\npm\\opencode.cmd", "win32")).toBe(true)
    expect(isWindowsShellShim("C:\\npm\\opencode.CMD", "win32")).toBe(true)
    expect(isWindowsShellShim("runner.bat", "win32")).toBe(true)
    expect(isWindowsShellShim("script.ps1", "win32")).toBe(true)
  })

  it("returns false for native executables and other extensions on win32", () => {
    expect(isWindowsShellShim("C:\\bin\\opencode.exe", "win32")).toBe(false)
    expect(isWindowsShellShim("opencode", "win32")).toBe(false)
    expect(isWindowsShellShim("script.sh", "win32")).toBe(false)
  })

  it("returns false on POSIX platforms even for .cmd / .bat / .ps1 filenames", () => {
    expect(isWindowsShellShim("/usr/local/bin/opencode.cmd", "linux")).toBe(false)
    expect(isWindowsShellShim("/usr/local/bin/opencode.cmd", "darwin")).toBe(false)
    expect(isWindowsShellShim("script.bat", "linux")).toBe(false)
  })
})

