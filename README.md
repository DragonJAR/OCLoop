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
- **Interactive plan generator** — `--create-plan` drafts a `PLAN.md` for you from a one-line goal.
- **Live dashboard** — status badge, iteration timing, average, ETA, progress bar, and a watchdog health indicator.
- **Activity log** — real-time tool usage, file edits, token counts, and git diffs.
- **Unattended resilience** — a task guardian that survives rate limits, sleep/suspension, server/session hangs, and total crashes (see [Resilience](#resilience)).
- **Pause / resume** — pause gracefully after the current task, or cancel a pending pause instantly.
- **Command palette** — quick access to every action with `Ctrl+P`.
- **Bilingual UI** — English by default, Spanish on demand (`--lang`, config, or the palette).
- **DragonJAR theme** — branded console theme by default, plus 32 bundled OpenCode themes.
- **Terminal integration** — launch OpenCode in an external terminal to interact mid-iteration.
- **Crash recovery** — minimal progress is persisted; `--resume` continues an interrupted run.

## Requirements

- [Bun](https://bun.sh) runtime (v1.0 or later)
- [OpenCode](https://opencode.ai) installed and configured (API keys, model, agents)

## Installation

### From npm

```bash
# Install globally
bun add -g ocloop

# Or run without installing
bunx ocloop
```

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

Prefer to write the plan yourself? Copy the example instead of step 1:

```bash
cp examples/PLAN.md ./PLAN.md
```

## Recommended workflow

A complete, reliable run from zero:

1. **Install prerequisites** — Bun and OpenCode, with your model/agent/API keys configured in OpenCode.
2. **Customize the loop prompt if needed** — the default `.loop-prompt.md` is auto-created on first run. To customize it before running, copy `examples/loop-prompt.md` to `.loop-prompt.md` and edit it. A custom `--prompt <path>` must already exist.
3. **Create the plan** — either:
   - run **`ocloop --create-plan`**, describe your goal, review the proposed plan, and save it; or
   - write `PLAN.md` by hand using the [plan format](#plan-file-format) (start from `examples/PLAN.md`).
4. **Start the loop** — run `ocloop` and press **`S`** (or `ocloop -r` to start immediately).
5. **Watch it work** — the dashboard shows the current state, task, timing, and guardian health; the activity log streams what OpenCode does. Use **`Space`** to pause, **`Ctrl+P`** for the command palette, **`T`** to open OpenCode in a real terminal.
6. **Leave it running** — rate limits, sleep, and server hiccups are handled automatically. If the whole process dies, relaunch with **`ocloop --resume`** to continue.
7. **Done** — the loop ends when the model marks the plan complete (`<plan-complete>` tag), all automatable tasks are finished, you quit with `Q`, or an unrecoverable error occurs.

## Generating a plan (`--create-plan`)

`ocloop --create-plan` (or `-c`) launches an interactive generator instead of the TUI:

1. It asks what you want OCLoop to build.
2. It uses **zai-coding-plan/glm-5.2** and the **`plan`** agent by default to draft a `PLAN.md` in OCLoop's format.
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
| `-m, --model <provider/model>` | Model to use, for example `openai/gpt-5` |
| `-a, --agent <string>` | Agent to use (passed to OpenCode) |
| `-r, --run` | Start iterations immediately (default: wait for `S`) |
| `-c, --create-plan` | Interactively generate `PLAN.md`, then exit (model zai-coding-plan/glm-5.2, agent plan) |
| `-d, --debug` | Debug/sandbox mode (no plan-file validation, manual sessions) |
| `--verbose` | Enable verbose logging (keyboard events, etc.) |
| `--prompt <path>` | Path to the loop prompt file (default: `.loop-prompt.md`) |
| `--plan <path>` | Path to the plan file (default: `PLAN.md`) |
| `--lang <en\|es>` | UI language (default: `en`; also settable in `Ctrl+P`) |
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

## Keybindings

| Key | State | Action |
| --- | --- | --- |
| `S` | Ready | Start iterations |
| `Space` | Running | Pause after the current task |
| `Space` | Pausing | Cancel the pending pause (keep running) |
| `Space` | Paused | Resume iterations |
| `T` | Running / Paused / Debug | Open OpenCode in an external terminal |
| `Ctrl+P` | Any | Open the command palette |
| `Q` | Most states | Quit (with confirmation) |
| `R` | Error | Retry after a recoverable error |
| `N` | Debug | Create a new session |
| `P` | Debug | Send a prompt to the session |
| `I` | Debug | Insert sample activity (UI testing) |

Pausing is **graceful**: pressing `Space` finishes the current task before pausing, and the dashboard shows `Pausing after current task — Space cancel`. Press `Space` again to cancel and keep running.

## Command palette (`Ctrl+P`)

Every action is also discoverable in the palette, context-aware (commands are disabled when they don't apply):

- **Loop** — Start, Pause, Resume, Cancel pending pause, Restart OpenCode server
- **Terminal** — Copy attach command, Choose default terminal
- **View** — Toggle scrollbar, Quit
- **Language** — switch between English and Español (persists to your config)
- **Chaos** (only with `--chaos` in debug) — kill/revive server, freeze/unfreeze session, inject rate limit

## Language (i18n)

The UI is **English by default** with full Spanish support. The locale resolves as: `--lang` flag → `language` in `ocloop.json` → `en`.

```bash
ocloop --lang es            # this run in Spanish
```

You can also toggle the language live from the command palette (`Ctrl+P` → `Language → Español` / `Idioma → English`); the choice is saved to your config. Generated plans (`--create-plan`) are written in the active language.

## Theme

OCLoop ships with the **DragonJAR** brand theme as the default (red `#C11B05` accent on a near-black background), plus the 32 bundled OpenCode themes. The light/dark mode follows your OpenCode preference. To use a different theme, set it in your config:

```jsonc
// ~/.config/ocloop/ocloop.json
{ "theme": "opencode" }   // any bundled theme id, e.g. dracula, tokyonight, nord
```

## Resilience

OCLoop is designed to keep running unattended. A **task guardian** (watchdog) watches each iteration for a heartbeat and, before ever taking a destructive action, confirms against ground truth (an active server ping plus the session's real status) — so it never aborts a session that is genuinely working, and never leaves a dead loop hanging.

What it handles:

- **Rate limits** — a `429`/overloaded never fails the loop. It enters a `COOLDOWN` state, respects any `Retry-After`, backs off with full jitter, and retries the same task. After `maxRateLimitRetries` consecutive limits it surfaces a recoverable error.
- **Sleep / suspension** — closing the lid is detected on wake; OCLoop reconnects the event stream and reconciles the in-flight session (recovering a missed completion). On macOS it runs `caffeinate` while working to avoid sleeping at all (disable with `--no-caffeinate`).
- **Server / session hangs** — an active health check restarts a hung OpenCode server and reconciles the session; a genuinely wedged session is aborted and retried. A circuit breaker stops after `maxRecoveryAttempts` and reports a full diagnostic instead of looping forever.
- **Total crash** — minimal progress is persisted atomically to `.loop-state.json`. On the next start OCLoop offers to resume (automatic with `--resume`). Shutdown on `SIGINT`/`SIGTERM`/`SIGHUP` aborts the active session so no orphan server is left behind.

The dashboard shows a `Guard ●` indicator (green healthy, yellow checking, red recovering), and all guardian activity is logged to `.loop.log` as structured `[HEALTH]` lines so you can audit exactly why it acted.

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
| `resume` | Auto-resume a persisted run on startup |
| `chaos` | Enable chaos fault-injection |

## Configuration

OCLoop reads optional settings from `~/.config/ocloop/ocloop.json` (or `$XDG_CONFIG_HOME/ocloop/ocloop.json`):

```jsonc
{
  "language": "en",              // "en" | "es"
  "theme": "dragonjar",          // any bundled theme id
  "scrollbar_visible": true,
  "terminal": { "type": "known", "name": "kitty" },
  "resilience": {                // any subset of the Tuning keys
    "watchdogSuspectMs": 120000,
    "maxRateLimitRetries": 12
  }
}
```

OCLoop also respects OpenCode's environment variables for API keys and model configuration — see the [OpenCode docs](https://opencode.ai/docs).

## Files

| File | Purpose |
| --- | --- |
| `PLAN.md` | The task list to execute |
| `.loop-prompt.md` | The prompt sent to OpenCode each iteration |
| `AGENTS.md` | Persistent knowledge for OpenCode across sessions |
| `.loop.log` | Debug log, including `[HEALTH]` watchdog telemetry |
| `.loop-state.json` | Persisted progress for crash recovery (`--resume`) |

All `.loop*` files are git-ignored automatically.

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
