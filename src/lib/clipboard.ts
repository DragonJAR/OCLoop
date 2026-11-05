/**
 * Clipboard operations for copying text to system clipboard.
 * Detects appropriate clipboard tool based on environment
 * (macOS pbcopy / Windows clip.exe / Linux wl-copy or X11).
 */

import { commandExists, systemBinary } from "./command-exists"
import { toErrorMessage } from "./format"
import { t } from "./i18n"
import { TimeoutError, withTimeout } from "./with-timeout"

/** Upper bound for one copy (spawn + write + exit). */
export const CLIPBOARD_TIMEOUT_MS = 5_000

type ClipboardTool = {
  command: string;
  args: string[];
};

type ClipboardResult = {
  success: boolean;
  error?: string;
};

/**
 * Detects the appropriate clipboard tool for the current environment.
 * Platform-native tools (pbcopy on macOS, clip.exe on Windows) are preferred
 * over cross-platform X11/Wayland tools so the copy lands in the real system
 * pasteboard, not a fake X11 selection. Returns null if none is available.
 */
export async function detectClipboardTool(): Promise<ClipboardTool | null> {
  // macOS — pbcopy is always present on stock installs
  if (process.platform === "darwin") {
    if (await commandExists("pbcopy")) {
      return { command: "pbcopy", args: [] };
    }
    return null;
  }

  // Windows — clip.exe is always present on stock installs
  if (process.platform === "win32") {
    // clip.exe ships with every Windows: spawn it by absolute System32 path.
    // A PATH lookup would miss PATHEXT on a no-shell spawn and, with the cwd
    // in System32 (elevated terminal), its cwd filter would drop the real file.
    return { command: systemBinary("clip", "win32"), args: [] };
  }

  // Linux / BSD — prefer Wayland, fall back to X11
  const isWayland = !!process.env.WAYLAND_DISPLAY;

  if (isWayland) {
    // Try wl-copy first for Wayland
    if (await commandExists("wl-copy")) {
      return { command: "wl-copy", args: [] };
    }
  }

  // Try X11 clipboard tools
  if (await commandExists("xclip")) {
    return { command: "xclip", args: ["-selection", "clipboard"] };
  }

  if (await commandExists("xsel")) {
    return { command: "xsel", args: ["--clipboard", "--input"] };
  }

  // Fallback to wl-copy even on X11 (XWayland compatibility)
  if (await commandExists("wl-copy")) {
    return { command: "wl-copy", args: [] };
  }

  return null;
}

/**
 * Copies text to the system clipboard using the detected clipboard tool.
 */
export async function copyToClipboard(
  text: string,
  timeoutMs: number = CLIPBOARD_TIMEOUT_MS,
): Promise<ClipboardResult> {
  const tool = await detectClipboardTool();

  if (!tool) {
    // Per-platform hint so the error names the tool the user actually needs.
    // The hint text is the binary name(s) — kept literal (not localized) since
    // they're commands, not prose. Only the surrounding sentence goes through
    // i18n (REPARAR.md B4).
    const hint =
      process.platform === "darwin"
        ? "pbcopy (built-in)"
        : process.platform === "win32"
          ? "clip.exe (built-in)"
          : "wl-copy (Wayland) or xclip/xsel (X11)";
    return {
      success: false,
      error: t("errClipboardNotFound", { hint }),
    };
  }

  // The whole operation is bounded: pbcopy/clip.exe can block forever (the
  // clipboard locked by another app, a stuck IPC), and the copy is awaited
  // from the TUI, which would freeze with it.
  const spawned: { proc?: ReturnType<typeof Bun.spawn> } = {};
  try {
    return await withTimeout(
      () => runClipboardTool(tool, text, (proc) => { spawned.proc = proc; }),
      timeoutMs,
      "clipboard",
    );
  } catch (err) {
    // runClipboardTool never rejects, so this is the timeout: reap the hung
    // tool defensively and report it instead of hanging the caller.
    try { spawned.proc?.kill(); } catch { /* already dead */ }
    return {
      success: false,
      error: err instanceof TimeoutError
        ? t("errClipboardTimeout", { secs: String(Math.round(timeoutMs / 1000)) })
        : toErrorMessage(err),
    };
  }
}

/** Spawn the tool, feed it `text` and wait for it. Never rejects. */
async function runClipboardTool(
  tool: ClipboardTool,
  text: string,
  onSpawn: (proc: ReturnType<typeof Bun.spawn>) => void,
): Promise<ClipboardResult> {
  // Hoist proc out of the try so the catch can reap it. If `stdin.write`
  // rejects (EPIPE — the child exited early and closed its stdin mid-write),
  // the child process would otherwise be orphaned: the success path reaps
  // via `await proc.exited`, but a throw before that line leaves the handle
  // dangling until GC. Kill + await the exit best-effort so we never leak.
  let proc: ReturnType<typeof Bun.spawn> | null = null
  let stderrRead: Promise<string> | null = null
  try {
    // xclip / xsel / wl-copy fork a background process that keeps serving the
    // selection and inherits our stderr pipe, so the pipe never reaches EOF
    // and awaiting its text would hang the copy forever. Only capture stderr
    // where the tool exits cleanly (macOS pbcopy, Windows clip.exe).
    const capturesStderr = process.platform === "darwin" || process.platform === "win32"
    proc = Bun.spawn([tool.command, ...tool.args], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: capturesStderr ? "pipe" : "ignore",
    });
    onSpawn(proc);
    if (capturesStderr) {
      stderrRead = new Response(proc.stderr as ReadableStream<Uint8Array>).text();
    }

    // Write text to stdin, awaiting the flush + close so the child receives
    // the full payload before we wait on its exit (avoids truncation/hangs).
    // proc.stdin is number | FileSink | undefined; with stdin:"pipe" it's the FileSink — narrow off the numeric fd.
    if (proc.stdin && typeof proc.stdin !== "number") {
      await proc.stdin.write(text);
      await proc.stdin.end();
    }

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = (await stderrRead) ?? "";
      return {
        success: false,
        error: stderr.trim() || t("errClipboardFailed", { code: String(exitCode), stderr: "" }),
      };
    }

    await stderrRead;
    return { success: true };
  } catch (err) {
    // Reap the child if it's still around (e.g. write threw before we awaited
    // `exited`). kill() on an already-exited process throws in Bun, so guard
    // it; the `await proc.exited` swallows its own rejection if it already
    // exited. Both are best-effort and must never mask the original error.
    if (proc) {
      try { proc.kill(); } catch { /* already dead */ }
      try { await proc.exited; } catch { /* already dead */ }
    }
    try { await stderrRead; } catch { /* preserve the original error */ }
    return {
      success: false,
      error: toErrorMessage(err),
    };
  }
}

