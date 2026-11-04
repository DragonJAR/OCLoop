/**
 * Bun plugin: serve Solid's CLIENT build where Bun would serve the SSR one.
 *
 * Bun resolves "solid-js" to `dist/server.js` — Solid's server-side-rendering
 * build — under Node-like resolution conditions. @opentui/solid's own plugin
 * works around that by replacing that file's contents with `dist/solid.js`,
 * but its path filter only matches POSIX separators:
 *
 *     /\/node_modules\/solid-js\/dist\/server\.js$/
 *
 * On Windows the path is `D:\...\node_modules\solid-js\dist\server.js`, the
 * filter never matches, and the whole TUI runs against Solid's SSR build.
 * That build has different semantics (`children()` returns strings instead of
 * elements), so the reconciler receives text where it expects an element and
 * throws:
 *
 *     Orphan text error: "" must have a <text> as a parent: box-7 above text-node-4
 *
 * — which is exactly how the Windows CI job failed while macOS and Linux
 * passed the same code.
 *
 * This plugin performs the same swap with a separator-agnostic filter, and is
 * registered BEFORE @opentui/solid's so that it wins the match on every OS.
 */

import type { BunPlugin } from "bun"

/** Server build → client build, for solid-js and its store sub-package. */
const SWAPS: Array<[RegExp, string]> = [
  [/[\\/]node_modules[\\/]solid-js[\\/]dist[\\/]server\.js$/, "solid.js"],
  [/[\\/]node_modules[\\/]solid-js[\\/]store[\\/]dist[\\/]server\.js$/, "store.js"],
]

export const solidClientPlugin: BunPlugin = {
  name: "ocloop-solid-client-build",
  setup(build) {
    for (const [filter, replacement] of SWAPS) {
      build.onLoad({ filter }, async (args) => {
        const path = args.path.replace(/server\.js$/, replacement)
        const file = Bun.file(path)
        if (!(await file.exists())) return undefined
        return { contents: await file.text(), loader: "js" as const }
      })
    }
  },
}
