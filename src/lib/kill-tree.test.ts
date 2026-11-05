import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import {
  KILL_GRACE_MS,
  isTracked,
  killAllTrackedSync,
  killTree,
  killTreeSync,
  taskkillPath,
  trackProcess,
} from "./kill-tree"

const realKill = process.kill
let signals: Array<{ pid: number; signal: unknown }> = []
let groupAlive = true

beforeEach(() => {
  signals = []
  groupAlive = true
  process.kill = ((pid: number, signal?: unknown) => {
    signals.push({ pid, signal })
    if (!groupAlive) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" })
    return true
  }) as typeof process.kill
})

afterEach(() => {
  process.kill = realKill
})

const fakeProc = (pid?: number) => ({ pid, kill: mock(() => true) })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("killTree — POSIX", () => {
  it("sends SIGTERM to the process group, not just the child", () => {
    const proc = fakeProc(4242)
    killTree(proc, { platform: "linux", graceMs: 10_000 })
    expect(signals).toEqual([{ pid: -4242, signal: "SIGTERM" }])
    expect(proc.kill).not.toHaveBeenCalled()
  })

  it("escalates to SIGKILL after the grace period while the group lives", async () => {
    const proc = fakeProc(4243)
    killTree(proc, { platform: "linux", graceMs: 5 })
    await sleep(40)
    expect(signals.map((s) => [s.pid, s.signal])).toEqual([
      [-4243, "SIGTERM"],
      [-4243, 0],
      [-4243, "SIGKILL"],
    ])
  })

  it("does not escalate once the group is gone", async () => {
    const proc = fakeProc(4244)
    killTree(proc, { platform: "linux", graceMs: 5 })
    groupAlive = false
    await sleep(40)
    expect(signals.some((s) => s.signal === "SIGKILL")).toBe(false)
  })

  it("falls back to the direct handle when there is no process group", () => {
    groupAlive = false
    const proc = fakeProc(4245)
    killTree(proc, { platform: "linux" })
    expect(proc.kill).toHaveBeenCalledTimes(1)
  })

  it("falls back to the direct handle without a pid, and never signals pid <= 1", () => {
    const noPid = fakeProc(undefined)
    killTree(noPid, { platform: "linux" })
    expect(noPid.kill).toHaveBeenCalledTimes(1)
    const init = fakeProc(1)
    killTree(init, { platform: "linux" })
    expect(init.kill).toHaveBeenCalledTimes(1)
    expect(signals).toEqual([])
  })

  it("never throws when the handle's kill throws", () => {
    const proc = { pid: undefined, kill: () => { throw new Error("dead") } }
    expect(() => killTree(proc, { platform: "linux" })).not.toThrow()
  })

  it("defaults the grace period to 2s", () => {
    expect(KILL_GRACE_MS).toBe(2_000)
  })
})

describe("killTreeSync — POSIX", () => {
  it("SIGKILLs the group immediately", () => {
    const proc = fakeProc(4300)
    killTreeSync(proc, { platform: "linux" })
    expect(signals).toEqual([{ pid: -4300, signal: "SIGKILL" }])
  })

  it("falls back to SIGKILL on the handle when no group exists", () => {
    groupAlive = false
    const proc = fakeProc(4301)
    killTreeSync(proc, { platform: "linux" })
    expect(proc.kill).toHaveBeenCalledWith("SIGKILL")
  })
})

describe("taskkillPath", () => {
  it("is absolute under SystemRoot\\System32", () => {
    const prev = process.env.SystemRoot
    process.env.SystemRoot = "D:\\Win"
    try {
      expect(taskkillPath()).toBe("D:\\Win\\System32\\taskkill.exe")
    } finally {
      if (prev === undefined) delete process.env.SystemRoot
      else process.env.SystemRoot = prev
    }
  })

  it("defaults to C:\\Windows", () => {
    const prev = process.env.SystemRoot
    delete process.env.SystemRoot
    try {
      expect(taskkillPath()).toBe("C:\\Windows\\System32\\taskkill.exe")
    } finally {
      if (prev !== undefined) process.env.SystemRoot = prev
    }
  })
})

describe("tracking and exited guard", () => {
  it("killAllTrackedSync reaps every tracked child once and untracks it", () => {
    const a = fakeProc(4400)
    const b = fakeProc(4401)
    trackProcess(a)
    trackProcess(b)
    killAllTrackedSync()
    // Other test files in this process may have tracked children too.
    const mine = () => signals.filter((s) => s.pid === -4400 || s.pid === -4401)
    expect(mine().map((s) => s.pid)).toEqual([-4400, -4401])
    expect(isTracked(a)).toBe(false)
    killAllTrackedSync()
    expect(mine()).toHaveLength(2)
  })

  it("never signals a child that already exited (pid may be reused)", () => {
    const proc = { ...fakeProc(4500), exitCode: 0 as number | null }
    killTree(proc, { platform: "linux" })
    killTreeSync(proc, { platform: "linux" })
    expect(signals).toEqual([])
    expect(proc.kill).not.toHaveBeenCalled()
  })
})
