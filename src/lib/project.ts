import { join } from "node:path";
import { log } from "./debug-logger";
import { atomicWriteText } from "./atomic-fs";
import { splitLines, normalizeLineEndings, preserveEol } from "./text";

const GITIGNORE_FILE = ".gitignore";

/**
 * Ensure .loop* files are in .gitignore
 * Creates .gitignore if it doesn't exist.
 * Best-effort: catches and logs filesystem errors (e.g. read-only mounts)
 * so startup / session initialization is never aborted.
 */
export async function ensureGitignore(baseDir: string = process.cwd()): Promise<void> {
  const gitignorePath = join(baseDir, GITIGNORE_FILE);
  const entry = ".loop*";

  try {
    const gitignoreFile = Bun.file(gitignorePath);
    const exists = await gitignoreFile.exists();

    if (!exists) {
      // Create .gitignore with our entry — atomic (tmp+rename) so a crash
      // mid-write can never truncate the user's file.
      await atomicWriteText(gitignorePath, `${entry}\n`);
      log.info("git", "Created .gitignore", { entry });
      return;
    }

    // Check if entry already exists. Normalize CRLF/lone-CR up front: a Windows
    // .gitignore saved with `\r\n` would otherwise glue the appended entry onto
    // the preceding line's trailing `\r` (because `endsWith("\n")` is true for
    // `\r\n`), producing a malformed `\r.loop*` entry. Normalizing also makes the
    // dedupe check (per-line trim) reliable regardless of the file's endings.
    const raw = await gitignoreFile.text();
    const content = normalizeLineEndings(raw);
    const lines = splitLines(content).map((line) => line.trim());

    if (lines.includes(entry)) {
      // Already listed
      return;
    }

    // Append entry - ensure we start on a new line if file doesn't end with one.
    // content is now `\n`-only, so `endsWith("\n")` is unambiguous. Atomic
    // write: this rewrites the user's whole .gitignore, so a crash mid-write
    // must not destroy the existing rules (same policy as PLAN.md / state).
    // preserveEol: the work is done on the `\n`-normalized copy, but the file
    // is written back in the user's own line endings (a CRLF .gitignore stays
    // CRLF instead of being silently converted to LF).
    const suffix = content.endsWith("\n") ? "" : "\n";
    await atomicWriteText(gitignorePath, preserveEol(raw, `${content}${suffix}${entry}\n`));
    log.info("git", "Updated .gitignore", { entry });
  } catch (err) {
    log.warn("git", "Failed to update .gitignore", err);
  }
}

