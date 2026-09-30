/**
 * Partial mocks for `./opencode-server` that preserve unmocked exports from
 * the real module. Lives alongside `opencode-server.ts` so
 * `mock.module("./opencode-server")` resolves to the same specifier consumer
 * tests and production code use (the `command-exists-mock.ts` pattern).
 *
 * Why: `bun test` runs every file in one process and `mock.module` persists
 * across files. A hooks-level test (useServer) overrides `startOpencodeServer`
 * to drive the hook lifecycle; the real module's own test restores the real
 * exports by calling `mockOpencodeServer({})` before its SUT import, exactly
 * like `command-exists.test.ts` does with `mockCommandExists({})`.
 */
import { createRequire } from "node:module"
import { mock } from "bun:test"

const require = createRequire(import.meta.url)

export type OpencodeServerModule = typeof import("./opencode-server")
export type OpencodeServerOverrides = Partial<OpencodeServerModule>

/**
 * Real export snapshots captured when this helper first loads — before any
 * test file registers a `mock.module` override. Copy the function references
 * (not the module namespace object): `require()` returns live bindings that
 * mock.module later replaces, which would otherwise turn
 * `opencode-server.test.ts` into testing another file's stub.
 */
const mod = require("./opencode-server.ts") as OpencodeServerModule
export const realOpencodeServer: OpencodeServerModule = {
  startOpencodeServer: mod.startOpencodeServer,
  buildPermissionConfig: mod.buildPermissionConfig,
}

/** Register a partial mock; unlisted exports stay real. */
export function mockOpencodeServer(overrides: OpencodeServerOverrides): void {
  mock.module("./opencode-server", () => ({
    ...realOpencodeServer,
    ...overrides,
  }))
}
