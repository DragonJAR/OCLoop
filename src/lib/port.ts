/**
 * Port availability check.
 *
 * The embedded `opencode serve` reports a bind failure only as an opaque
 * `ServeError: Unexpected error` (no parseable EADDRINUSE), so the one reliable
 * way to tell a user "that port is taken" is to try binding it ourselves first.
 * Used by the --create-plan path to validate an explicit --port before spawning
 * opencode; an omitted --port uses 0 (the OS picks a free port) and skips this
 * check. Stdlib only — no new dependency.
 */
import net from "node:net"

export function isPortAvailable(
  port: number,
  hostname = "127.0.0.1",
): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once("error", () => resolve(false)) // EADDRINUSE (or perms) → not free
    srv.once("listening", () => srv.close(() => resolve(true)))
    srv.listen(port, hostname)
  })
}
