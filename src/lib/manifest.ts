import fs from "node:fs"
import path from "node:path"
import type { SessionTokens } from "../hooks/useSessionStats"
import { log } from "./debug-logger"

const MANIFEST_FILE = ".loop-manifest.jsonl"

/** One record per completed iteration, appended as a single JSON line. */
export interface ManifestEntry {
  /** ISO wall-clock timestamp at iteration end. */
  ts: string
  /** Iteration number (matches the dashboard and `.loop.log`). */
  iteration: number
  /** First-pending PLAN.md task this iteration ran, or null if unknown. */
  task: string | null
  /** Model used (matches the dashboard's cost accounting), or null. */
  model: string | null
  /** Active duration in ms (excludes pauses) — from `stats.endIteration()`. */
  durationMs: number
  /** Per-iteration token counts. */
  tokens: SessionTokens
  /** Estimated USD cost for this iteration's tokens. */
  costUsd: number
}

function manifestPath(): string {
  return path.resolve(process.cwd(), MANIFEST_FILE)
}

/**
 * Append one JSON line per completed iteration to `.loop-manifest.jsonl` — a
 * durable, machine-readable run record for post-run reports and cost attribution
 * (the live dashboard shows the same numbers but loses them when the run ends).
 *
 * Append-only (JSONL) and best-effort: it never throws — a manifest write must
 * never crash or stall the loop. Mirrors the project-relative, best-effort file
 * handling of `debug-logger` (`.loop.log`); the file matches the `.loop*`
 * gitignore rule, so it is never committed.
 */
export function appendManifest(entry: ManifestEntry): void {
  try {
    fs.appendFileSync(manifestPath(), JSON.stringify(entry) + "\n")
  } catch (err) {
    log.warn("manifest", "Failed to append manifest entry", err)
  }
}
