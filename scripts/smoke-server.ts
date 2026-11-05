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
 * It also exercises the abort: the signal is aborted the way a server restart
 * does, and the abort must not escape as an uncaught exception (Bun emits an
 * 'error' with an AbortError on the child, and a ChildProcess with no
 * 'error' listener re-throws it).
 *
 * Usage: bun run scripts/smoke-server.ts
 */
import { createClient } from "../src/lib/api"
import { startOpencodeServer } from "../src/lib/opencode-server"

const REQUEST_TIMEOUT_MS = 10_000
const STARTUP_TIMEOUT_MS = 30_000 // cold CI runners are slow; the 5s default flakes
const TEARDOWN_GRACE_MS = 500

// Any exception that escapes (e.g. an unhandled AbortError from the child)
// must fail the smoke instead of being swallowed by the exit(0) below.
process.on("uncaughtException", (err) => {
  console.error("[smoke] FAIL: uncaught exception:", err instanceof Error ? err.message : err)
  process.exit(1)
})

const controller = new AbortController()

try {
  const server = await startOpencodeServer({
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
    server.close()
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
  server.close()
  controller.abort()
  console.log("[smoke] close + abort ok (no uncaught exception)")

  // Give the tree kill and any late 'error' event a moment to surface.
  await new Promise((resolve) => setTimeout(resolve, TEARDOWN_GRACE_MS))
  console.log("[smoke] SMOKE OK")
  process.exit(0)
} catch (err) {
  console.error("[smoke] FAIL:", err instanceof Error ? err.message : err)
  process.exit(1)
}
