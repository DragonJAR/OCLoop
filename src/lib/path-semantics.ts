/**
 * path-semantics.ts — shared, platform-aware filesystem path utilities.
 *
 * Windows (NTFS) and macOS (APFS / HFS+) are case-insensitive by default,
 * so e.g. `C:\repo\PLAN.md` and `C:\repo\plan.md` (or `PLAN.md` vs `plan.md` on
 * macOS) identify the same file on disk. Linux filesystems are case-sensitive.
 *
 * Centralizing platform detection, case-folding, and path equality here ensures
 * consistent filesystem semantics across the TUI dashboard, task scheduler,
 * integration queue, and command resolution.
 */

import { posix, win32 } from "node:path"

/**
 * Returns true if the filesystem on `platform` ignores case by default
 * (Windows NTFS and macOS APFS/HFS+). Linux and other POSIX variants remain
 * case-sensitive.
 */
export function isCaseInsensitiveFs(platform: NodeJS.Platform | string = process.platform): boolean {
  return platform === "win32" || platform === "darwin"
}

/**
 * Fold path casing according to `platform`'s filesystem semantics:
 * lowercases on win32 and darwin; leaves untouched on linux/posix.
 */
export function foldPathCase(path: string, platform: NodeJS.Platform | string = process.platform): string {
  return isCaseInsensitiveFs(platform) ? path.toLowerCase() : path
}

function stripTrailingSep(p: string, isWin: boolean): string {
  if (isWin) {
    if (/^[a-zA-Z]:\\?$/.test(p) || p === "\\") return p
    return p.replace(/\\+$/, "")
  }
  if (p === "/") return p
  return p.replace(/\/+$/, "")
}

/**
 * Normalizes a path for comparison on `platform`, normalizing directory separators,
 * resolving relative segments (`.` and `..`), stripping non-root trailing separators,
 * and applying case-folding on case-insensitive filesystems (win32 and darwin).
 */
export function normalizePathForComparison(
  path: string,
  platform: NodeJS.Platform | string = process.platform,
): string {
  const isWin = platform === "win32"
  const pathMod = isWin ? win32 : posix
  const normalized = pathMod.normalize(path)
  const stripped = stripTrailingSep(normalized, isWin)
  return foldPathCase(stripped, platform)
}

/**
 * Returns true if two paths refer to the same filesystem location on `platform`,
 * accounting for separator normalization (`/` vs `\`), redundant segments,
 * trailing slashes, and case-insensitivity on win32 and darwin.
 */
export function pathsEqual(
  a: string,
  b: string,
  platform: NodeJS.Platform | string = process.platform,
): boolean {
  if (a === b) return true
  return normalizePathForComparison(a, platform) === normalizePathForComparison(b, platform)
}
