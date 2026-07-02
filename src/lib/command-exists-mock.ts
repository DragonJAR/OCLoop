/**
 * Partial mocks for `./command-exists` that preserve unmocked exports from the
 * real module. Lives alongside `command-exists.ts` so `mock.module("./command-exists")`
 * resolves to the same specifier consumer tests and production code use.
 */
import { createRequire } from "node:module"
import { mock } from "bun:test"

const require = createRequire(import.meta.url)

export type CommandExistsModule = typeof import("./command-exists")
export type CommandExistsOverrides = Partial<CommandExistsModule>

/**
 * Real export snapshots captured when this helper first loads — before any test
 * file registers a `mock.module` override. Copy the function references (not
 * the module namespace object): `require()` returns live bindings that mock.module
 * later replaces, which would otherwise turn `command-exists.test.ts` into testing
 * another file's stub.
 */
const mod = require("./command-exists.ts") as CommandExistsModule
export const realCommandExists: CommandExistsModule = {
  commandExists: mod.commandExists,
  resolveCommandPath: mod.resolveCommandPath,
  resolveSpawnable: mod.resolveSpawnable,
}

/** Register a partial mock; unlisted exports stay real. */
export function mockCommandExists(overrides: CommandExistsOverrides): void {
  mock.module("./command-exists", () => ({
    ...realCommandExists,
    ...overrides,
  }))
}