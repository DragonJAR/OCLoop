/**
 * Smoke test for the real OpenCode server launch.
 *
 * This is the most platform-sensitive path in OCLoop: spawning the `opencode`
 * binary (a bare name that only resolves through PATHEXT on Windows, a `.cmd`
 * shell shim that has to be quoted and invoked through the shell), reading its
 * ready marker out of stdout, and tearing it down again. The unit tests mock
 * all of it, so a real run on each OS is what actually proves the launcher
 * works there.
 *
 * It also exercises the teardown the app performs on every restart and quit:
 * close() then abort(). The abort must not escape as an uncaught exception,
 * and the server must actually die: after close() the smoke polls its URL
 * until the connection is refused and fails if it still answers. Any failure
 * path reaps the server through an exit hook (closeSync).
 *
 * Usage: bun run scripts/smoke-server.ts
 */
import { createClient } from "../src/lib/api"
import { startOpencodeServer, type OpencodeServer } from "../src/lib/opencode-server"

const REQUEST_TIMEOUT_MS = 10_000
const STARTUP_TIMEOUT_MS = 30_000 // cold CI runners are slow; the 5s default flakes
const TEARDOWN_GRACE_MS = 500
const DEATH_TIMEOUT_MS = 5_000
const DEATH_POLL_MS = 100
const PROBE_TIMEOUT_MS = 1_000

// Declared outside the try so every failure path can reap it: this script
// does not import index.tsx, so it has no exit hook of its own otherwise.
let server: OpencodeServer | null = null
process.on("exit", () => server?.closeSync())

// Any exception that escapes (e.g. an unhandled AbortError from the child)
// must fail the smoke instead of being swallowed by the exit(0) below.
process.on("uncaughtException", (err) => {
  console.error("[smoke] FAIL: uncaught exception:", err instanceof Error ? err.message : err)
  process.exit(1)
})

/**
 * Poll `url` until the connection is refused (the server is really dead) or
 * the deadline passes. Any HTTP answer, even an error status, means alive.
 */
async function waitUntilDead(url: string): Promise<boolean> {
  const deadline = Date.now() + DEATH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    } catch (err) {
      // A probe timeout is not a refusal: a hung-but-alive server still holds the port.
      if (!(err instanceof Error && err.name === "TimeoutError")) return true
    }
    await new Promise((resolve) => setTimeout(resolve, DEATH_POLL_MS))
  }
  return false
}

const controller = new AbortController()

try {
  server = await startOpencodeServer({
    port: 0,
    signal: controller.signal,
    timeout: STARTUP_TIMEOUT_MS,
  })
  console.log(`[smoke] server up: ${server.url} (v${server.version})`)

  // v2 servers answer 401 without the launcher-issued Basic credential.
  const res = await fetch(server.url, {
    headers: server.authorization ? { Authorization: server.authorization } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  console.log(`[smoke] GET ${server.url} -> ${res.status}`)
  if (!res.ok) {
    console.error(`[smoke] FAIL: the server answered ${res.status}`)
    process.exit(1)
  }

  // The authenticated API call the app's health ping makes.
  const agents = await createClient(server.url, undefined, {
    version: server.version,
    authorization: server.authorization,
  }).fetchAgents({ timeoutMs: REQUEST_TIMEOUT_MS })
  console.log(`[smoke] authenticated agent list ok (${agents.length} agents)`)

  // Same order as the app: kill the process tree first, then abort the signal
  // (a restart does this); the abort must not throw.
  const { url } = server
  server.close()
  controller.abort()
  console.log("[smoke] close + abort ok (no uncaught exception)")

  // close() is fire-and-forget (taskkill on Windows, SIGTERM on POSIX): prove
  // the whole tree really died and released the port, not just the shim.
  if (!(await waitUntilDead(url))) {
    console.error(`[smoke] FAIL: ${url} still answers ${DEATH_TIMEOUT_MS}ms after close()`)
    process.exit(1)
  }
  console.log("[smoke] server is gone (connection refused)")

  // Give any late 'error' event a moment to surface.
  await new Promise((resolve) => setTimeout(resolve, TEARDOWN_GRACE_MS))
  console.log("[smoke] SMOKE OK")
  process.exit(0)
} catch (err) {
  console.error("[smoke] FAIL:", err instanceof Error ? err.message : err)
  process.exit(1)
}
