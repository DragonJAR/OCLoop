/**
 * `isPortAvailable` tests — real `node:net` binds (deterministic locally): a
 * port held by a live server reads as unavailable; once closed, available.
 */
import { describe, expect, it } from "bun:test"
import net from "node:net"
import { isPortAvailable } from "./port"

const HOST = "127.0.0.1"

/** Bind an ephemeral port; resolve to [port, closeFn]. */
function occupy(): Promise<[number, () => Promise<void>]> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once("error", reject)
    srv.listen(0, HOST, () => {
      const addr = srv.address()
      if (addr === null || typeof addr === "string") {
        reject(new Error("no port assigned"))
        return
      }
      resolve([addr.port, () => new Promise<void>((res) => srv.close(() => res()))])
    })
  })
}

describe("isPortAvailable", () => {
  it("returns false for a port held by a live server", async () => {
    const [port, close] = await occupy()
    try {
      expect(await isPortAvailable(port, HOST)).toBe(false)
    } finally {
      await close()
    }
  })

  it("returns true once that port is freed", async () => {
    const [port, close] = await occupy()
    await close()
    expect(await isPortAvailable(port, HOST)).toBe(true)
  })
})
