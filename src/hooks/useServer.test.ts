/**
 * useServer lifecycle tests.
 *
 * Source: MEJORAS.md Finding 18.2.A (HIGH — `useServer.ts` has no test).
 * Also covers Finding 18.3.B (MEDIUM — `useServer.test.ts` does not exist),
 * which is a cross-reference to 18.2.A: the gap is the same one, just
 * categorized differently ("no test" vs. "the existing test covers
 * recovery *callers* of `useServer`, not the hook itself"). The 9 tests
 * below pin the hook's own surface, so both findings are closed by this
 * file.
 *
 * The hook wraps `createOpencodeServer` and `createOpencodeClient` from the
 * OpenCode SDK. Both are mocked at the module boundary via `mock.module`
 * (the same pattern that `clipboard.test.ts` already uses for
 * `command-exists`). The mock factory reads from a mutable closure so each
 * test can swap behavior between runs.
 *
 * The mock pattern is safe here because:
 * 1. `useServer.ts` has no JSX (so the `docs/testing.md` `@opentui/solid`
 *    `mock.module` warning does not apply — that one is JSX-transform
 *    specific).
 * 2. `createRoot` is the canonical harness for Solid hooks; the existing
 *    `useActivityLog.test.ts` and `useSessionStats.test.ts` already use it.
 *
 * ## Why autoStart is driven via `stop()` + `restart()` instead of `onMount`
 *
 * `useServer` registers its autoStart via Solid's `onMount`, which only
 * fires after the hook is attached to a rendered component (it requires the
 * owner to be "mounted" to a DOM, not just created in a `createRoot`).
 * Verified empirically: registering `onMount` inside a bare `createRoot`
 * (no `render`) does not fire the callback — the effect is queued on the
 * owner but never run.
 *
 * Bun:test does not provide a DOM (`globalThis.document === undefined`), so
 * `solid-js/web`'s `render` / `renderToString` cannot be used. The audit's
 * test (1) for the `startServer` guard therefore cannot be triggered from a
 * pure test harness; it remains an integration-test concern.
 *
 * To exercise the *launch* code path (which is the substantive behavior the
 * audit cares about), each test that needs a "ready" state first calls
 * `server.stop()` (transitions the initial `starting` state to `stopped`,
 * which is one of the two states `startServer` would allow), then
 * `server.restart()` (which calls `launch(preferredPort)` directly with the
 * same logic as the `startServer` → `launch` chain). The resulting state
 * is observably equivalent to a successful autoStart: `status === "ready"`,
 * `url` / `port` set from the launch, `lastHealthyAt > 0`. The restart
 * guard `if (status() === "starting") return` is what allows this to work
 * after the manual stop — that guard is the same kind of "no re-launch
 * while a launch is in flight" check that `startServer`'s guard enforces.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { createRoot } from "solid-js"

// Mutable impls swapped by individual tests. The factory closure makes the
// reference stable across the cache lifetime of the mocked module.
type FakeServer = { url: string; close: () => void }
let serverImpl: (opts: { port?: number; hostname?: string }) => Promise<FakeServer> =
  async (opts) => ({
    url: `http://${opts?.hostname ?? "127.0.0.1"}:${opts?.port ?? 4096}`,
    close: () => {},
  })
let clientAgentsImpl: () => Promise<unknown> = async () => ({
  response: { ok: true, status: 200, statusText: "OK" },
})

// The factory runs once per import of the mocked module. The closure over the
// mutable impls keeps the swap-during-test pattern working.
mock.module("@opencode-ai/sdk/server", () => ({
  createOpencodeServer: (opts: { port?: number; hostname?: string }) =>
    serverImpl(opts),
}))

mock.module("@opencode-ai/sdk/v2", () => ({
  createOpencodeClient: () => ({
    app: { agents: () => clientAgentsImpl() },
  }),
}))

const { useServer } = await import("./useServer")

const tick = (ms = 10) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Build a `useServer` instance inside a `createRoot` and run a callback once
 * any microtasks and the optional `bootServer` cycle have settled. The
 * callback receives the hook return and a `dispose` that the callback MUST
 * call before returning so `onCleanup → stop` runs deterministically.
 *
 * `bootServer` (default true) drives the hook from its initial `starting`
 * state to `ready` via `stop()` + `restart()`. See the file-level comment
 * for why we don't use the production `onMount` path.
 */
async function withServer<T>(
  options: Parameters<typeof useServer>[0],
  run: (server: ReturnType<typeof useServer>, dispose: () => void) => Promise<T>,
  bootServer = true,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    createRoot((dispose) => {
      const server = useServer(options)

      const start = async () => {
        try {
          if (bootServer) {
            await server.stop()
            await server.restart()
            await tick(2)
          }
          await run(server, dispose)
          resolve(undefined as unknown as T)
        } catch (err) {
          reject(err)
        }
      }

      // Defer past onMount (which won't fire here but might in some
      // Solid microtask cycle) before driving the manual launch.
      queueMicrotask(start)
    })
  })
}

describe("useServer (Finding 18.2.A)", () => {
  beforeEach(() => {
    serverImpl = async (opts) => ({
      url: `http://${opts?.hostname ?? "127.0.0.1"}:${opts?.port ?? 4096}`,
      close: () => {},
    })
    clientAgentsImpl = async () => ({
      response: { ok: true, status: 200, statusText: "OK" },
    })
  })

  afterEach(() => {
    serverImpl = async (opts) => ({
      url: `http://${opts?.hostname ?? "127.0.0.1"}:${opts?.port ?? 4096}`,
      close: () => {},
    })
    clientAgentsImpl = async () => ({
      response: { ok: true, status: 200, statusText: "OK" },
    })
  })

  it("initial state: no autoStart leaves status=starting with null url/port", async () => {
    await withServer(
      { autoStart: false },
      async (server, dispose) => {
        expect(server.status()).toBe("starting")
        expect(server.url()).toBeNull()
        expect(server.port()).toBeNull()
        expect(server.error()).toBeUndefined()
        expect(server.lastHealthyAt()).toBe(0)
        dispose()
      },
      false, // don't boot
    )
  })

  it("stop + restart reaches status=ready on the preferred port", async () => {
    let launches = 0
    serverImpl = async (opts) => {
      launches++
      return {
        url: `http://127.0.0.1:${opts?.port ?? 4096}`,
        close: () => {},
      }
    }

    await withServer({ port: 4096 }, async (server, dispose) => {
      // withServer's bootServer did one launch via stop+restart.
      expect(launches).toBe(1)
      expect(server.status()).toBe("ready")
      expect(server.url()).toBe("http://127.0.0.1:4096")
      expect(server.port()).toBe(4096)
      expect(server.lastHealthyAt()).toBeGreaterThan(0)
      dispose()
    })
  })

  it("ping happy path: ready → ready with lastHealthyAt updated", async () => {
    let calls = 0
    clientAgentsImpl = async () => {
      calls++
      return { response: { ok: true, status: 200, statusText: "OK" } }
    }

    await withServer({ port: 4096 }, async (server, dispose) => {
      const before = server.lastHealthyAt()
      await tick(2)

      const result = await server.ping()
      expect(result).toBe(true)
      expect(server.status()).toBe("ready")
      expect(calls).toBe(1)
      expect(server.lastHealthyAt()).toBeGreaterThanOrEqual(before)
      dispose()
    })
  })

  it("ping failure on a ready server flips status to unhealthy", async () => {
    clientAgentsImpl = async () => {
      throw new Error("ping failed")
    }

    await withServer({ port: 4096 }, async (server, dispose) => {
      expect(server.status()).toBe("ready")

      const result = await server.ping()
      expect(result).toBe(false)
      expect(server.status()).toBe("unhealthy")
      dispose()
    })
  })

  it("restart reuses the preferred port on a second call", async () => {
    let launches = 0
    serverImpl = async (opts) => {
      launches++
      return {
        url: `http://127.0.0.1:${opts?.port ?? 4096}`,
        close: () => {},
      }
    }

    await withServer({ port: 4096 }, async (server, dispose) => {
      const initial = server.url()
      // 1 launch from withServer's bootServer.
      expect(launches).toBe(1)
      await tick(2)

      await server.restart()
      // 2nd launch from the explicit restart.
      expect(launches).toBe(2)
      expect(server.status()).toBe("ready")
      expect(server.url()).toBe(initial)
      expect(server.port()).toBe(4096)
      dispose()
    })
  })

  it("restart falls back to ephemeral port when the preferred port fails", async () => {
    let launches = 0
    serverImpl = async (opts) => {
      launches++
      // 1st launch: bootServer's restart with preferredPort=4096 → fail
      // 2nd launch: ephemeral fallback (port 0) → success
      if (opts?.port === 4096) {
        throw new Error("port 4096 in use")
      }
      if (opts?.port === 0) {
        return { url: "http://127.0.0.1:54321", close: () => {} }
      }
      return {
        url: `http://127.0.0.1:${opts?.port ?? 4096}`,
        close: () => {},
      }
    }

    await withServer({ port: 4096 }, async (server, dispose) => {
      // bootServer did: stop → restart (preferred fail → ephemeral success)
      expect(launches).toBe(2)
      expect(server.status()).toBe("ready")
      expect(server.url()).toBe("http://127.0.0.1:54321")
      expect(server.port()).toBe(54321)
      dispose()
    })
  })

  it("restart on both ports failing flips status to error and records the error", async () => {
    let launches = 0
    serverImpl = async (_opts) => {
      launches++
      throw new Error(`launch ${launches} failed`)
    }

    await withServer({ port: 4096 }, async (server, dispose) => {
      // bootServer did: stop → restart (both ports fail)
      expect(launches).toBe(2)
      expect(server.status()).toBe("error")
      expect(server.error()).toBeDefined()
      // The last-failed launch is launch 2 (ephemeral fallback).
      expect(server.error()?.message).toContain("launch 2 failed")
      dispose()
    })
  })

  it("stop sets status=stopped and nulls url/port", async () => {
    await withServer({ port: 4096 }, async (server, dispose) => {
      expect(server.status()).toBe("ready")
      expect(server.url()).not.toBeNull()

      await server.stop()
      expect(server.status()).toBe("stopped")
      expect(server.url()).toBeNull()
      expect(server.port()).toBeNull()
      dispose()
    })
  })

  it("closeCurrent swallows serverRef.close() throwing on restart", async () => {
    let closeCalls = 0
    serverImpl = async (_opts) => ({
      url: "http://127.0.0.1:4096",
      close: () => {
        closeCalls++
        throw new Error("close blew up")
      },
    })

    await withServer({ port: 4096 }, async (server, dispose) => {
      // bootServer did: stop() (close is no-op on a null serverRef) then
      // restart() (closeCurrent() is called on a null serverRef again
      // because the bootServer's stop+restart cycle never attached a
      // real closeable). To actually exercise the swallow, do an explicit
      // restart on the now-ready server so closeCurrent runs against a
      // live serverRef.
      expect(server.status()).toBe("ready")
      const before = closeCalls
      await server.restart()
      expect(closeCalls).toBeGreaterThan(before)
      expect(server.status()).toBe("ready")
      dispose()
    })
  })
})
