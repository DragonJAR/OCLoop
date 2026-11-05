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
import { startOpencodeServer } from "../src/lib/opencode-server"

const controller = new AbortController()

try {
  const server = await startOpencodeServer({ port: 0, signal: controller.signal })
  console.log(`[smoke] server up: ${server.url} (v${server.version})`)

  const res = await fetch(server.url)
  console.log(`[smoke] GET ${server.url} -> ${res.status}`)
  if (!res.ok) {
    console.error(`[smoke] FAIL: the server answered ${res.status}`)
    process.exit(1)
  }

  // Abort exactly like a restart does: it must not throw.
  controller.abort()
  console.log("[smoke] abort ok (no uncaught exception)")

  server.close()
  console.log("[smoke] SMOKE OK")
  process.exit(0)
} catch (err) {
  console.error("[smoke] FAIL:", err instanceof Error ? err.message : err)
  process.exit(1)
}
