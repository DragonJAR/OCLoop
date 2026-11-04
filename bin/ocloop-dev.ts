#!/usr/bin/env bun
/**
 * OCLoop dev launcher — runs the TUI from source, from ANY directory.
 *
 * Bun only reads `bunfig.toml` from the current working directory, and the
 * Solid JSX transform that OCLoop's .tsx files need comes from the preload
 * that file declares. Running `bun run <repo>/src/index.tsx` from another
 * project therefore failed with a misleading
 * "Cannot find module 'react/jsx-dev-runtime'" — Bun fell back to React's
 * automatic JSX runtime because the Solid transform was never registered.
 *
 * This launcher resolves the preload relative to ITSELF (so it works from any
 * cwd), registers the transform, and only then imports the app entry — the
 * plugin must be registered before the .tsx modules are loaded.
 */

import { plugin } from "bun"
import solidTransformPlugin from "@opentui/solid/bun-plugin"

plugin(solidTransformPlugin)

await import(new URL("../src/index.tsx", import.meta.url).pathname)
