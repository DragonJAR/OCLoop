/**
 * Clipboard operations for copying text to system clipboard.
 * Detects appropriate clipboard tool based on environment
 * (macOS pbcopy / Windows clip.exe / Linux wl-copy or X11).
 */

import { commandExists } from "./command-exists"

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
 * Platform-native tools (`pbcopy` on macOS, `clip.exe` on Windows) are
 * preferred over cross-platform X11/Wayland tools so the copy lands in
 * the real system pasteboard (Aqua / Windows clipboard), not a fake
 * X11 selection. Returns null if no clipboard tool is available.
 *
 * Source: MEJORAS.md Finding 11.4.A (macOS branch) and 11.4.B (Windows
 * branch — paired with the `where.exe` fallback in `command-exists`).
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
    if (await commandExists("clip")) {
      return { command: "clip", args: [] };
    }
    return null;
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
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  const tool = await detectClipboardTool();

  if (!tool) {
    // Per-platform hint so the error message names the tool the user
    // actually needs (or the built-in they should expect).
    // Source: MEJORAS.md Finding 11.4.A (resolves 11.4.G as a side-effect).
    const hint =
      process.platform === "darwin"
        ? "pbcopy (built-in)"
        : process.platform === "win32"
          ? "clip.exe (built-in)"
          : "wl-copy (Wayland) or xclip/xsel (X11)";
    return {
      success: false,
      error: `No clipboard tool found. ${hint} should be available.`,
    };
  }

  try {
    const proc = Bun.spawn([tool.command, ...tool.args], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "pipe",
    });

    // Write text to stdin, awaiting the flush + close so the child receives
    // the full payload before we wait on its exit (avoids truncation/hangs).
    if (proc.stdin) {
      await proc.stdin.write(text);
      await proc.stdin.end();
    }

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return {
        success: false,
        error: stderr.trim() || `Clipboard command exited with code ${exitCode}`,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}


