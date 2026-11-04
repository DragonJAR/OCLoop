/**
 * The Solid client build is what the TUI must run on.
 *
 * Bun resolves "solid-js" to Solid's server-side-rendering build under
 * Node-like conditions. @opentui/solid works around that by swapping the file
 * contents at load time — but its path filter only matches POSIX separators,
 * so on Windows the swap never happened and the whole TUI ran against Solid's
 * SSR build: effects never ran, keyboard handlers were never registered, and
 * the reconciler threw "Orphan text error" while building the render tree.
 *
 * These tests pin both halves of the fix: the swap must match a Windows path,
 * and the module that ends up loaded must be the client build.
 */
import { describe, expect, it } from "bun:test"
import { fileURLToPath } from "node:url"
import { solidClientPlugin } from "./solid-client-plugin"

/** Collect the filters the plugin registers. */
function registeredFilters(): RegExp[] {
  const filters: RegExp[] = []
  solidClientPlugin.setup({
    onLoad: (options: { filter: RegExp }) => {
      filters.push(options.filter)
    },
  } as never)
  return filters
}

describe("solid client build plugin", () => {
  it("matches the Solid server build on a Windows path", () => {
    const winPath =
      "D:\\a\\OCLoop\\OCLoop\\node_modules\\solid-js\\dist\\server.js"
    expect(registeredFilters().some((f) => f.test(winPath))).toBe(true)
  })

  it("matches the Solid server build on a POSIX path", () => {
    const posixPath = "/Users/x/OCLoop/node_modules/solid-js/dist/server.js"
    expect(registeredFilters().some((f) => f.test(posixPath))).toBe(true)
  })

  it("matches the store's server build on both path styles", () => {
    const filters = registeredFilters()
    const winStore =
      "D:\\a\\OCLoop\\OCLoop\\node_modules\\solid-js\\store\\dist\\server.js"
    const posixStore =
      "/Users/x/OCLoop/node_modules/solid-js/store/dist/server.js"
    expect(filters.some((f) => f.test(winStore))).toBe(true)
    expect(filters.some((f) => f.test(posixStore))).toBe(true)
  })

  it("does not match unrelated files", () => {
    const filters = registeredFilters()
    expect(filters.some((f) => f.test("/Users/x/OCLoop/src/index.tsx"))).toBe(false)
  })

  it("loads Solid's CLIENT build, not the SSR one", async () => {
    // `cancelCallback` only exists in the client build; the SSR build does not
    // export it. If the swap did not happen, this is where it shows up — and
    // it is the difference between a working TUI and one whose effects never
    // run.
    //
    // Checked in a child process: bun:test does not apply the project's
    // preload (the same reason the TUI regression scenarios run out-of-process).
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        "import('solid-js').then(m => console.log(typeof m.cancelCallback))",
      ],
      {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [code, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
    ])
    expect({ code, out: stdout.trim() }).toEqual({ code: 0, out: "function" })
  })
})
