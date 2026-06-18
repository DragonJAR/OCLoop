<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/DragonJAR/OCLoop@main/assets/logo.jpg" width="300" />
</p>
<p align="center">
  <i>Round and round we go</i>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-0.5.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/runtime-Bun-black" alt="Bun" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
  <a href="https://www.DragonJAR.org"><img src="https://img.shields.io/badge/author-DragonJAR%20SAS-orange.svg" alt="Author" /></a>
  <a href="README.es.md"><img src="https://img.shields.io/badge/read%20in-Espa%C3%B1ol-blue.svg" alt="Español" /></a>
</p>
<p align="center">
  <b>English</b> · <a href="README.es.md">Español</a>
</p>

---

**OCLoop** is a loop harness that orchestrates [OpenCode](https://opencode.ai) to execute the tasks in a `PLAN.md` file **one at a time**, each in its own isolated session, with full visibility into what OpenCode is doing. You write (or generate) a plan; OCLoop works through it task by task and is built to **keep going unattended** — through provider rate limits, laptop sleep, server hangs, and even a full crash.

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Recommended workflow](#recommended-workflow)
- [Generating a plan (`--create-plan`)](#generating-a-plan---create-plan)
- [Command-line options](#command-line-options)
- [Plan file format](#plan-file-format)
- [Keybindings](#keybindings)
- [Command palette (`Ctrl+P`)](#command-palette-ctrlp)
- [Language (i18n)](#language-i18n)
- [Theme](#theme)
- [Resilience](#resilience)
- [Configuration](#configuration)
- [Files](#files)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)
- [Author](#-author)

## Features

- **Automated task execution** — run a plan one task at a time, each in a fresh context window.
- **Inter-task memory** — each completed task carries a short decision note forward to the next iteration (see [Plan file format](#plan-file-format)).
- **Interactive plan generator** — `--create-plan` drafts a `PLAN.md` for you from a one-line goal.
- **Live dashboard** — status badge, iteration timing, average, ETA, progress bar, cost estimate, and a watchdog health indicator.
- **Activity log** — real-time tool usage, file edits, and token counts.
- **Unattended resilience** — a task guardian that survives rate limits, sleep/suspension, server/session hangs, and total crashes (see [Resilience](#resilience)).
- **Stuck-task detection** — halts automatically when the same task starts N times without progress, instead of looping forever.
- **Pause / resume** — pause gracefully after the current task, or cancel a pending pause instantly.
- **Command palette** — quick access to every action with `Ctrl+P`.
- **Live theme picker** — preview any of 33 themes (including the DragonJAR brand theme) with `↑`/`↓` and commit with `Enter`.
- **Bilingual UI** — English by default, Spanish on demand (`--lang`, config, or the palette).
- **Terminal integration** — launch OpenCode in an external terminal, or copy the attach command to your clipboard, to interact mid-iteration.
- **Crash recovery** — minimal progress is persisted; `--resume` continues an interrupted run.

## Requirements

- [Bun](https://bun.sh) runtime (v1.0 or later)
- [OpenCode](https://opencode.ai) installed and configured (API keys, model, agents)

## Installation

### From source

```bash
git clone https://github.com/DragonJAR/OCLoop.git
cd OCLoop
bun install
bun run build
bun link        # makes `ocloop` available globally
```

## Quick start

```bash
# 1. Create a plan interactively
ocloop --create-plan

# 2. Run OCLoop and press S to begin
ocloop
```

Prefer to write the plan yourself? Copy the example, edit it to match your project, and place it as `PLAN.md` in the root of the folder where OCLoop will work:

```bash
cp examples/PLAN.md ./PLAN.md
# then edit ./PLAN.md to describe your own project's tasks
```

## Recommended workflow

A complete, reliable run from zero:

1. **Install prerequisites** — Bun and OpenCode, with your model/agent/API keys configured in OpenCode.
2. **Customize the loop prompt if needed** — the default `.loop-prompt.md` is auto-created on first run. To customize it before running, copy `examples/loop-prompt.md` to `.loop-prompt.md` and edit it. To use a different name or location for the loop prompt, pass `--prompt <path>` — note a custom prompt path must already exist (the auto-create only applies to the default `.loop-prompt.md`).
3. **Create the plan** — either:
   - run **`ocloop --create-plan`**, describe your goal, review the proposed plan, and save it; or
   - write `PLAN.md` by hand using the [plan format](#plan-file-format) (start from `examples/PLAN.md`).
4. **Start the loop** — run `ocloop` and press **`S`** (or `ocloop -r` to start immediately).
5. **Watch it work** — the dashboard shows the current state, task, timing, and guardian health; the activity log streams what OpenCode does. Use **`Space`** to pause, **`Ctrl+P`** for the command palette, **`T`** to open OpenCode in a real terminal.
6. **Leave it running** — rate limits, sleep, and server hiccups are handled automatically. If the whole process dies, relaunch with **`ocloop --resume`** to continue.
7. **Done** — the loop ends when all automatable tasks are finished (OCLoop detects completion structurally and appends a `<plan-complete>` summary to the plan itself — the model isn't relied on to write it), you quit with `Q`, or an unrecoverable error occurs.

## Generating a plan (`--create-plan`)

`ocloop --create-plan` (or `-c`) launches an interactive generator instead of the TUI:

1. It asks what you want OCLoop to build.
2. It uses **zai-coding-plan/glm-5.2** and the **`plan`** agent by default to draft a `PLAN.md` in OCLoop's format. We recommend this provider — it offers the best quality-to-price ratio for OCLoop, and [this link](https://z.ai/subscribe?ic=FXSFEPRECU) gets you 10% off.
3. It shows you the proposed plan and asks to **save**, **edit** (refine with feedback), or **cancel**.
4. On save, it writes the file (to `--plan <path>`, default `PLAN.md`) and tells you how to start.

The generated plan follows the current [UI language](#language-i18n). Override the model/agent with `--model <provider/model>` / `--agent`:

```bash
ocloop --create-plan                       # zai-coding-plan/glm-5.2 + plan agent
ocloop --create-plan --model openai/gpt-5  # custom model
ocloop --create-plan --plan roadmap.md     # write to a custom path
```

## Command-line options

```
Usage: ocloop [options]
```

| Option | Description |
| --- | --- |
| `-p, --port <number>` | Server port (OpenCode default: try 4096, then random) |
| `-m, --model <provider/model>` | Model to use, for example `openai/gpt-5` (default: the chosen agent's own model, else OpenCode's configured model) |
| `-a, --agent <string>` | Agent to use (default: OpenCode's `default_agent`, falling back to `build`) |
| `-r, --run` | Start iterations immediately (default: wait for `S`) |
| `-c, --create-plan` | Interactively generate `PLAN.md`, then exit (model zai-coding-plan/glm-5.2, agent plan) |
| `-d, --debug` | Debug/sandbox mode (no plan-file validation, manual sessions) |
| `--verbose` | Enable verbose logging (keyboard events, etc.) |
| `--prompt <path>` | Path to the loop prompt file (default: `.loop-prompt.md`) |
| `--plan <path>` | Path to the plan file (default: `PLAN.md`) |
| `--lang <en\|es>` | UI language (default: `en`; also settable in `Ctrl+P`; `--language` is an alias) |
| `--resume` | Reconcile/continue a persisted in-flight run on startup |
| `--no-caffeinate` | Do not keep the system awake while running (macOS) |
| `--chaos` | Enable chaos fault-injection (debug only) |
| `--resilience <key=value>` | Override a resilience threshold (repeatable — see [Tuning](#tuning)) |
| `-v, --version` | Show version number |
| `-h, --help` | Show help |

```bash
# Examples
ocloop                              # start, wait for S
ocloop --create-plan                # generate a PLAN.md, then exit
ocloop -r                           # start iterations immediately
ocloop -m opencode/claude-sonnet-4  # use a specific provider/model
ocloop -a plan                      # use the plan agent
ocloop --plan my-plan.md            # use a custom plan file
ocloop --lang es                    # Spanish UI
ocloop --resume                     # continue a run interrupted by a crash
ocloop --resilience watchdogSuspectMs=120000
```

## Plan file format

OCLoop parses `PLAN.md` to track progress. Supported task markers:

```markdown
- [ ] Pending task (will be executed)
- [x] Completed task
- [MANUAL] Task requiring human intervention (skipped by the loop)
- [BLOCKED: reason] Task that cannot proceed (skipped)
```

Group work under headings and keep one actionable step per line:

```markdown
# My project

## Phase 1 — Setup
- [ ] **1.1** Initialize the project structure
- [ ] **1.2** Add the configuration module

## Phase 2 — Features
- [ ] **2.1** Implement the first feature

## Acceptance criteria
- ...
```

### Inter-task memory

When OCLoop re-invokes the agent, the new session starts with a blank context. To bridge iterations, the loop prompt asks the agent to leave a **short note** (1-3 indented lines) under each `[x]` it marks — capturing only what a later task may need: a decision that constrains following work, a non-obvious gotcha, or why an alternative was rejected. The next iteration reads the whole plan (notes included) and inherits that context. No extra files, no index — `PLAN.md` is the single source of truth.

```markdown
- [x] **1.1** Initialize the project structure
  - Decision: Bun runtime + TS strict, no bundler — constrains all later tasks to Bun APIs.
  - Gotcha: OCLoop's parser trims indentation before matching `- [`, so memory notes must be indented prose/sub-bullets, never indented `- [ ]`/`- [x]` lines, or the progress counter breaks.
```

Notes must be **indented prose or plain sub-bullets** (`  - Decision: ...`), never `- [ ]`/`- [x]` lines — the parser trims indentation before matching, so an indented checkbox would still count as a task and corrupt the progress bar. Omit a note when nothing is worth carrying forward; permanent, project-wide gotchas belong in `AGENTS.md` instead.

## Keybindings

| Key | State | Action |
| --- | --- | --- |
| `S` | Ready | Start iterations |
| `Space` | Running | Pause after the current task |
| `Space` | Pausing | Cancel the pending pause (keep running) |
| `Space` | Paused | Resume iterations |
| `T` | Running / Pausing / Paused / Cooldown | Open OpenCode in an external terminal |
| `C` | Running / Pausing / Paused / Cooldown | Copy the attach command to the clipboard |
| `Ctrl+P` | Any | Open the command palette |
| `?` | Any | Open the in-app keybindings/help overlay |
| `Q` | Most states | Quit (with confirmation; **no** confirmation when already `Complete`) |
| `R` | Error | Retry after a recoverable error |
| `P` | Error (`errNoProgress` halt) | Split the stalled task into smaller subtasks (see [Stuck loop](#resilience)) |
| `N` | Debug | Create a new session |
| `P` | Debug | Send a prompt to the session |
| `I` | Debug | Insert sample activity (UI testing) |

Inside any picker (command palette, theme picker, terminal chooser): `↑`/`↓` or `Ctrl+P`/`Ctrl+N` move the selection, `PageUp`/`PageDown` jump by six, `Enter` selects, `Esc` closes. Clicking the backdrop of any dialog also closes it. `Esc` closes dialogs that have no buttons.

Pausing is **graceful**: pressing `Space` finishes the current task before pausing, and the dashboard shows `Pausing after current task — Space cancel`. Press `Space` again to cancel and keep running.

## Command palette (`Ctrl+P`)

Every action is also discoverable in the palette, context-aware (commands are disabled when they don't apply):

- **Loop** — Start, Pause, Resume, Cancel pending pause, Restart OpenCode server
- **Terminal** — Copy attach command, Choose default terminal
- **View** — Toggle scrollbar, Quit
- **Language** — switch between English and Español (persists to your config)
- **Appearance** — Choose theme (live-preview picker, persists to your config)
- **Help** — About (version, author, links)
- **Chaos** (only with `--chaos` in debug) — kill/revive server, freeze/unfreeze session, inject rate limit

## Language (i18n)

The UI is **English by default** with full Spanish support. The locale resolves as: `--lang` flag → `language` in `ocloop.json` → `en`.

```bash
ocloop --lang es            # this run in Spanish
```

You can also toggle the language live from the command palette (`Ctrl+P` → `Language → Español` / `Idioma → English`); the choice is saved to your config. Generated plans (`--create-plan`) are written in the active language.

## Theme

OCLoop ships with **33 themes** — the **DragonJAR** brand theme (red `#C11B05` accent on a near-black background) as the default, plus 32 bundled OpenCode themes (dracula, tokyonight, nord, catppuccin, gruvbox, and more). The light/dark **mode** follows your OpenCode preference (read from OpenCode's `kv.json`); the theme **name** is OCLoop's own.

Pick one live without restarting: `Ctrl+P` → **Choose theme** opens a picker that **previews each theme as you scroll** (`↑`/`↓`), commits on `Enter` (and persists the choice to `ocloop.json`), and reverts on `Esc`. The currently-saved theme is marked with `●`.

You can also set it statically in your config:

```jsonc
// ~/.config/ocloop/ocloop.json
{ "theme": "opencode" }   // any theme id, e.g. dracula, tokyonight, nord
```

If your terminal can't render color, OCLoop degrades automatically: it honors `NO_COLOR`, `TERM=dumb`, non-TTY output, and CI environments, collapsing to a readable monochrome palette. Set `OCLOOP_ASCII=1` to force ASCII glyphs, or `OCLOOP_UNICODE=1` to force Unicode glyphs, on terminals with ambiguous Unicode support.

## Resilience

OCLoop is designed to keep running unattended. A **task guardian** (watchdog) watches each iteration for a heartbeat and, before ever taking a destructive action, confirms against ground truth (an active server ping plus the session's real status) — so it never aborts a session that is genuinely working, and never leaves a dead loop hanging.

What it handles:

- **Rate limits** — a `429`/overloaded never fails the loop. It enters a `COOLDOWN` state, respects any `Retry-After`, backs off with full jitter, and retries the same task. After `maxRateLimitRetries` consecutive limits it surfaces a recoverable error.
- **Sleep / suspension** — closing the lid is detected on wake; OCLoop reconnects the event stream and reconciles the in-flight session (recovering a missed completion). On macOS it runs `caffeinate` while working to avoid sleeping at all (disable with `--no-caffeinate`).
- **Server / session hangs** — an active health check restarts a hung OpenCode server and reconciles the session; a genuinely wedged session is aborted and retried. A circuit breaker stops after `maxRecoveryAttempts` and reports a full diagnostic instead of looping forever.
- **Total crash** — minimal progress is persisted atomically to `.loop-state.json`. On the next start OCLoop offers to resume (automatic with `--resume`). Shutdown on `SIGINT`/`SIGTERM`/`SIGHUP` aborts the active session so no orphan server is left behind.
- **Stuck loop** — if the same task starts `noProgressThreshold` times in a row (default 3) without the plan advancing, the loop halts with a recoverable `errNoProgress` error instead of burning iterations on a task the agent can't finish. The detector resets on any task change, so it only fires on a genuine stall. From the halt you can press **`P`** to have the agent split the stalled task into smaller subtasks — OCLoop shows them for approval and, if you accept, rewrites `PLAN.md` (replacing the stalled task) and resumes.

The dashboard shows a `Health ●` indicator (green `OK` healthy, yellow checking, red recovering), and all guardian activity is logged to `.loop.log` as structured `[HEALTH]` lines so you can audit exactly why it acted. A `COOLDOWN` distinguishes a real rate limit (`COOLDOWN` with a retry counter) from a transient connection blip (`WAITING`).

### Tuning

Resilience thresholds resolve as `defaults` < `~/.config/ocloop/ocloop.json` (`resilience` block) < CLI flags. Override individual values with repeatable `--resilience key=value` flags:

```bash
ocloop --resilience watchdogSuspectMs=120000 --resilience maxRateLimitRetries=12
```

| Key | Meaning |
| --- | --- |
| `createTimeoutMs` | Timeout for creating a session |
| `promptTimeoutMs` | Timeout for sending a prompt |
| `abortTimeoutMs` | Timeout for aborting a session |
| `statusTimeoutMs` | Timeout for session-status reconciliation |
| `pingTimeoutMs` | Timeout for the server health ping |
| `planTimeoutMs` | Overall budget for `--create-plan` to finish generating (default 600000 = 10 min; raise for big/slow plans) |
| `backoffBaseMs` | Base delay for exponential backoff |
| `backoffMaxMs` | Maximum backoff delay |
| `backoffJitter` | Apply full jitter to backoff (`true`/`false`) |
| `maxRateLimitRetries` | Consecutive rate-limit retries before failing |
| `minIterationGapMs` | Minimum spacing between iterations (`0` = off) |
| `sleepTickMs` | Sleep-detector sampling interval |
| `sleepThresholdMs` | Wall-clock gap that counts as a suspend/resume |
| `caffeinate` | Keep the system awake while running (`true`/`false`) |
| `watchdogTickMs` | Watchdog evaluation interval |
| `watchdogSuspectMs` | T1 — no heartbeat before suspecting |
| `watchdogConfirmMs` | T2 — no heartbeat (while "working") before declaring wedged (default 10 min; raise it if your agent runs long, output-free tools like big builds/test suites/installs) |
| `maxRecoveryAttempts` | Recovery attempts before escalating to a recoverable error |
| `noProgressThreshold` | Consecutive iterations that start with the same task before halting with `errNoProgress` (default 3 — gives the agent N-1 retries before halting instead of looping forever) |
| `resume` | Auto-resume a persisted run on startup |
| `chaos` | Enable chaos fault-injection |

## Configuration

OCLoop reads optional settings from `~/.config/ocloop/ocloop.json` (or `$XDG_CONFIG_HOME/ocloop/ocloop.json`):

```jsonc
{
  "language": "en",              // "en" | "es" (default "en")
  "theme": "dragonjar",          // any theme id
  "scrollbar_visible": true,
  "terminal": { "type": "known", "name": "x-terminal-emulator" },
  "resilience": {                // any subset of the Tuning keys
    "watchdogSuspectMs": 120000,
    "maxRateLimitRetries": 12
  }
}
```

The `terminal` block can be a **known** terminal `{ "type": "known", "name": "<name>" }` (one of the four below) or a **custom** one `{ "type": "custom", "command": "<bin>", "args": "<args with {cmd}>" }` for any other terminal — for example `{ "type": "custom", "command": "gnome-terminal", "args": "-- bash -lc '{cmd}'" }`. The `{cmd}` placeholder is replaced with the full `opencode attach <url> --session <id>` command. You can also configure it interactively with `T` (or `Ctrl+P` → Choose default terminal).

**Auto-detected (known) terminals** — only these four are detected automatically; anything else needs the custom form:

| OS | Terminal |
| --- | --- |
| macOS | `Terminal` (Terminal.app, via `osascript`) |
| Windows | `cmd` (cmd.exe) |
| Linux | `xterm`, `x-terminal-emulator` |

> **Clipboard note** — copying the attach command (`C`) needs `pbcopy` (macOS), `clip` (Windows), or `wl-copy`/`xclip`/`xsel` (Linux). On a minimal Linux without any of these, the copy fails with a toast instead of silently doing nothing.

OCLoop also respects OpenCode's environment variables for API keys and model configuration — see the [OpenCode docs](https://opencode.ai/docs).

### Environment variables

OCLoop-specific:

| Variable | Effect |
| --- | --- |
| `OCLOOP_ASCII=1` | Force ASCII glyphs (disables Unicode) |
| `OCLOOP_UNICODE=1` | Force Unicode glyphs (overridden by `OCLOOP_ASCII`) |

It also honors the conventional terminal-capability variables: `NO_COLOR` (disables color), `FORCE_COLOR` (`0`-`3` color level), `TERM` (`dumb` → monochrome), `COLORTERM` (`truecolor`/`24bit`), and the `CI`/`LANG`/`LC_*` locale cascade for UTF-8 detection.

## Files

| File | Purpose |
| --- | --- |
| `PLAN.md` | The task list to execute. Also the inter-task memory store — the agent leaves decision notes under each `[x]` (see [Inter-task memory](#inter-task-memory)). |
| `.loop-prompt.md` | The prompt sent to OpenCode each iteration. Supports one placeholder: `{{PLAN_FILE}}` (replaced with the resolved plan path). |
| `AGENTS.md` | Persistent knowledge for OpenCode across sessions (project-wide gotchas; loaded every session by OpenCode) |
| `.loop.log` | Debug log, including structured `[HEALTH]` watchdog telemetry; rotated to `.loop.log.old` at each session start |
| `.loop-state.json` | Persisted progress for crash recovery (`--resume`) |

All `.loop*` files are git-ignored automatically.

### Dashboard metrics

- **Task Time** — active time for the current iteration, **excluding** pauses.
- **Avg/task** and **ETA** — average completed-iteration time, extrapolated to remaining automatable tasks.
- **Total Time** — wall-clock since start, **including** pauses; frozen once a terminal state is reached.
- **Tokens** — per-iteration (`Task Tokens`, reset each iteration) and whole-run totals (input/output, plus cache read/write on wide terminals).
- **Tokens/min** — throughput.
- **Cost** — `~$X.XX` estimated USD for the whole run, from a static price table covering 53 models across 11 labs (falls back to an average when the model is unknown).

## Troubleshooting

**"Error: Plan file not found"** — create a `PLAN.md` (or run `ocloop --create-plan`). At minimum:

```markdown
## Backlog
- [ ] Your first task
```

**"Error: Prompt file not found"** — this only happens for a custom `--prompt <path>`. Create that file, or omit `--prompt` and let OCLoop auto-create the default `.loop-prompt.md`.

**Server fails to start** — make sure OpenCode is installed and on your `PATH`, your API keys are configured, and check OpenCode's logs.

**The loop seems stuck** — the guardian detects a genuine stall automatically; watch the `Guard ●` indicator and the `[HEALTH]` lines in `.loop.log`. Press `T` to open OpenCode in a terminal and see what's happening. If recovery is exhausted, the error dialog includes a diagnostic (last heartbeat age, probe verdict, attempts).

**It got rate-limited** — that's expected and handled: OCLoop shows a `COOLDOWN` countdown and retries automatically.

**"Error: working directory is not writable"** — OCLoop needs write access to the current directory (for `.loop-state.json`, `.loop.log`, and the auto-created `.loop-prompt.md`). A pre-flight check fails fast with this message if the directory is read-only or lacks write permission. Fix the permissions (e.g. `chmod u+w`) or run from a writable directory.

**The loop halts with `errNoProgress`** — the stuck-task detector fired: the same task started `noProgressThreshold` times (default 3) without the plan advancing. The agent is likely unable to complete that task. Open OpenCode with `T` to inspect, or raise the threshold via `--resilience noProgressThreshold=N` if the task is genuinely hard and needs more retries.

## Development

```bash
bun run dev      # run from source
bun test         # run the test suite
bun run build    # production build
```

## License

MIT

## 👨‍💻 Author

Originally created by **Fayçal Mitidji** ([d3vr](https://github.com/d3vr)). This fork is maintained by **[DragonJAR SAS](https://www.DragonJAR.org)** with several improvements.

[Experts in IT security services, proactive validation, and offensive security.](https://www.dragonjar.org/servicios-de-seguridad-informatica)
