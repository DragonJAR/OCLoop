/**
 * The server's abort must not take the whole app down.
 *
 * The OpenCode server is spawned with the caller's AbortSignal. Aborting it
 * is routine: every server restart (the palette command, a permission toggle)
 * and every quit does it. Bun's node:child_process reacts by emitting an
 * 'error' event with an AbortError on the child — and a ChildProcess with no
 * 'error' listener left re-throws that as an uncaught exception.
 *
 * The startup handshake removes its own 'error' listener once the server is
 * up, so without a permanent one the abort killed the process: the server was
 * never stopped, the renderer was never released and the terminal was left in
 * raw mode. This pins the behaviour that the listener outlives the handshake.
 */
import { describe, expect, it, mock } from "bun:test"
import { EventEmitter } from "node:events"
import type { ChildProcess } from "node:child_process"

/**
 * A ChildProcess stand-in that behaves like Bun's: aborting the spawn signal
 * emits an 'error' event with an AbortError.
 */
function createFakeChild(signal: AbortSignal | undefined) {
  const proc = new EventEmitter() as EventEmitter & {
    pid: number
    stdout: EventEmitter & { resume?: () => void }
    stderr: EventEmitter & { resume?: () => void }
    kill: () => boolean
  }
  proc.pid = 4242
  proc.stdout = Object.assign(new EventEmitter(), { resume: () => {} }) as never
  proc.stderr = Object.assign(new EventEmitter(), { resume: () => {} }) as never
  proc.kill = () => true
  signal?.addEventListener("abort", () => {
    const error = new Error("The operation was aborted.")
    error.name = "AbortError"
    proc.emit("error", error)
  })
  return proc
}

let lastChild: EventEmitter | undefined

const spawnMock = mock((command: string, args: string[], opts: Record<string, unknown>) => {
  const signal = opts.signal as AbortSignal | undefined
  const proc = createFakeChild(signal)
  lastChild = proc
  queueMicrotask(() => {
    if (args[0] === "--version") {
      // The version probe waits for the child to EXIT; answer it and close.
      proc.stdout.emit("data", Buffer.from("opencode v2.0.0\n"))
      proc.emit("exit", 0)
      proc.emit("close", 0)
      return
    }
    proc.stdout.emit(
      "data",
      Buffer.from("opencode server listening on http://127.0.0.1:4096\n"),
    )
  })
  return proc as unknown as ChildProcess
})

mock.module("node:child_process", () => ({ spawn: spawnMock }))

const { startOpencodeServer } = await import("./opencode-server")

describe("server abort", () => {
  it("does not throw when the spawn signal is aborted after startup", async () => {
    const controller = new AbortController()
    const server = await startOpencodeServer({
      port: 4096,
      signal: controller.signal,
    })
    expect(server.url).toBe("http://127.0.0.1:4096")

    // With no 'error' listener left on the child, this emit re-throws as an
    // uncaught exception and takes the process down.
    expect(() => controller.abort()).not.toThrow()
  }, 20000)

  it("keeps listening for errors after the startup handshake resolved", async () => {
    const controller = new AbortController()
    const server = await startOpencodeServer({
      port: 4096,
      signal: controller.signal,
    })
    // The child must still have an 'error' listener once startup is done.
    expect(lastChild).toBeDefined()
    expect(lastChild!.listenerCount("error")).toBeGreaterThan(0)
    expect(server.url).toContain("127.0.0.1")
  }, 20000)
})
