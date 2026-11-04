/**
 * Bun preload: make sure Solid's CLIENT build is the one that gets loaded.
 *
 * Registered from `bunfig.toml` BEFORE @opentui/solid's own preload so that
 * our separator-agnostic filter wins the match (opentui's filter only matches
 * POSIX paths, which silently left Windows on Solid's SSR build — see
 * `src/lib/solid-client-plugin.ts`).
 *
 * The build path (`build.ts`) registers the same plugin directly.
 */

import { plugin } from "bun"
import { solidClientPlugin } from "./src/lib/solid-client-plugin"

plugin(solidClientPlugin)
