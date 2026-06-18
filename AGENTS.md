# AGENTS.md — Project guidance for OCLoop

## Project Operations

- **Runtime:** Bun 1.3.x (ESM, `"type": "module"`). No Node fallback.
- **Build:** `bun run build` — runs `build.ts` (Bun bundler + `@opentui/solid`
  plugin). Output: `dist/index.js` (shebang preserved).
- **Dev (TUI):** `bun run dev` — runs `src/index.tsx` directly.
- **Tests:** `bun test` — **mandatory check before any commit**. Suite runs in
  ~280 ms (655 tests, 21 files). No separate lint / typecheck / format script.
- **Typecheck:** not wired up. `tsconfig.json` is `strict: true`; errors only
  surface at the first `bun run dev` or `bun test`.
- **No `--no-verify`**: pre-commit expectation is `bun test` passes.
- **No `git add .`**: stage only the files the commit touches. `.loop*` is
  gitignored; never commit `.loop-state.json` / `.loop.log`.
- **Full project context (stack, layout, conventions, risks):** see the
  remaining docs under `docs/` (`build-process.md`, `terminal-compat.md`).

## Research

- `@docs/build-process.md` — `bun run build.ts` is required (plain
  `bun build` CLI uses the React JSX transform and fails on SolidJS). The
  entrypoint must keep the `#!/usr/bin/env bun` shebang.
- `@docs/terminal-compat.md` — terminal capability detection (color depth,
  Unicode vs ASCII, TTY/CI), glyph fallbacks, and the DRY primitives
  (`LabelValue`, `StatusBadge`, `ProgressIndicator`) that keep the TUI look
  consistent across terminals.
