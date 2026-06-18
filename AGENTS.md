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
- **`PLAN.md` is a working file, not a tracked artifact** — it's intentionally
  gitignored (`*.md` allowlist excludes it). OCLoop reads it from disk each
  run; mark tasks done locally, do not try to commit it.
- **`docs/` is closed for new files** — the `/docs` rule in `.gitignore`
  (commit `c62e5ef`, "prevent tracking new audit-style docs") blocks new
  untracked files there. Project knowledge belongs in source docblocks,
  `README.md`, or `AGENTS.md`. The two existing files (`build-process.md`,
  `terminal-compat.md`) are tracked from an earlier allowlist and should not
  be taken as license to add more.
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
