<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/d3vr/ocloop@main/assets/logo.jpg" width="300" />
</p>
<p align="center">
  <i>Round and round we go</i>
</p>

---

OCLoop is a loop harness that orchestrates [OpenCode](https://opencode.ai) to execute tasks from a PLAN.md file iteratively. Each iteration runs in an isolated session, with full visibility into what OpenCode is doing.

## Features

- **Automated task execution** — Execute a plan one task at a time, each in a fresh context window
- **Live dashboard** — Visual status with iteration timing, averages, ETA, and progress bar
- **Activity log** — Real-time view of tool usage, file edits, token counts, and git diffs
- **Terminal integration** — Launch OpenCode in an external terminal to interact mid-iteration
- **Command palette** — Quick access to actions via `Ctrl+P`
- **Knowledge persistence** — Learnings documented in AGENTS.md and docs/ across iterations
- **Theme sync** — Automatically inherits your OpenCode theme (32 themes bundled)
- **Debug mode** — Sandbox for manual session creation without a plan file

## Requirements

- [Bun](https://bun.sh) runtime (v1.0 or later)
- [OpenCode](https://opencode.ai) installed and configured

## Installation

### From npm

```bash
# Install globally
bun add -g ocloop

# Or run directly without installing
bunx ocloop
```

### From Source

```bash
# Clone the repository
git clone https://github.com/d3vr/ocloop.git
cd ocloop

# Install dependencies
bun install

# Build the project
bun run build

# Link globally
bun link
```

## Quick Start

1. **Create a plan file** (`PLAN.md`) and **loop prompt file** (`.loop-prompt.md`):

```bash
cp examples/PLAN.md ./PLAN.md
cp examples/loop-prompt.md ./.loop-prompt.md  # Note the leading dot
```

See `examples/CREATE_PLAN.md` for a prompt to help generate plans for your project.

2. **Run OCLoop**:

```bash
ocloop
```

3. **Press `S`** to start executing tasks (or use `-r` to start immediately)

## Usage

```
Usage: ocloop [options]

Options:
  -p, --port <number>      Server port (default: 4096, falls back to random)
  -m, --model <string>     Model to use (passed to opencode)
  -a, --agent <string>     Agent to use (default: build)
  -r, --run                Start iterations immediately (skip the ready screen)
  -d, --debug              Debug/sandbox mode (no plan file required)
  --verbose                Enable verbose logging to .loop.log
  --prompt <path>          Path to loop prompt file (default: .loop-prompt.md)
  --plan <path>            Path to plan file (default: PLAN.md)
  --resume                 Reconcile/continue an interrupted run on startup
  --no-caffeinate          Don't keep the system awake while running (macOS)
  --chaos                  Enable chaos fault-injection (debug only)
  --resilience <key=value> Override a resilience threshold (repeatable)
  -v, --version            Show version number
  -h, --help               Show help

Examples:
  ocloop                           # Start with defaults
  ocloop -r                        # Start immediately without waiting
  ocloop -m claude-sonnet-4        # Use specific model
  ocloop -a plan                   # Use the plan agent
  ocloop --plan my-plan.md         # Use custom plan file
  ocloop -d                        # Debug mode for experimentation
  ocloop --resume                  # Continue a run interrupted by a crash
  ocloop --resilience watchdogSuspectMs=120000   # Tune a threshold
```

## Keybindings

| Key     | State        | Action                          |
| ------- | ------------ | ------------------------------- |
| `S`     | Ready        | Start iterations                |
| `Space` | Running      | Pause after current task        |
| `Space` | Paused       | Resume iterations               |
| `T`     | Running/Paused/Debug | Open terminal launcher  |
| `Ctrl+P`| Any          | Open command palette            |
| `Q`     | Most states  | Show quit confirmation          |
| `R`     | Error        | Retry after recoverable error   |
| `N`     | Debug mode   | Create new session              |

## Plan File Format

OCLoop parses your PLAN.md to track progress. Supported task formats:

```markdown
- [ ] Pending task (will be executed)
- [x] Completed task
- [MANUAL] Task requiring human intervention (skipped)
- [BLOCKED: reason] Task that cannot proceed (skipped)
```

### Task Naming Convention

Using bold task IDs helps with organization:

```markdown
- [ ] **1.1** First task in phase 1
- [ ] **1.2** Second task in phase 1
- [ ] **2.1** First task in phase 2
```

## Loop Lifecycle

1. OCLoop starts the OpenCode server
2. Creates a new session for each iteration
3. Sends your loop prompt to the session
4. Waits for the session to become idle (task complete)
5. Checks for `<plan-complete>` tag in plan file
6. If not complete, starts the next iteration

### Completion

The loop ends when:
- Model appends `<plan-complete>summary</plan-complete>` to the plan file (all automatable tasks done)
- You quit manually with `Q`
- An unrecoverable error occurs

## Resilience

OCLoop is designed to keep running unattended through provider rate limits,
laptop sleep, server hangs, and outright crashes. A **task guardian** (watchdog)
watches each iteration for a heartbeat and, before ever taking a destructive
action, confirms against ground truth (an active server ping plus the session's
real status) — so it never aborts a session that is genuinely working, and never
leaves a dead loop hanging.

What it handles:

- **Rate limits** — a `429`/overloaded never fails the loop. It enters a
  `cooldown` state, respects any `Retry-After`, backs off with full jitter, and
  retries the same iteration. After `maxRateLimitRetries` consecutive limits it
  surfaces a recoverable error.
- **Sleep / suspension** — closing the lid is detected on wake; OCLoop reconnects
  the event stream and reconciles the in-flight session (recovering a missed
  completion). On macOS it runs `caffeinate` while working to avoid sleeping at
  all (disable with `--no-caffeinate`).
- **Server / session hangs** — an active health check restarts a hung OpenCode
  server and reconciles the session; a genuinely wedged session is aborted and
  retried. A circuit breaker stops after `maxRecoveryAttempts` and reports a full
  diagnostic instead of looping forever.
- **Total crash** — minimal progress is persisted atomically to `.loop-state.json`.
  On the next start OCLoop offers to resume (automatic with `--resume`).

All watchdog activity is logged to `.loop.log` as structured `[HEALTH]` lines, so
you can audit exactly why the guardian acted.

### Tuning

Thresholds live in a `resilience` block and resolve as
`defaults < ~/.config/ocloop/ocloop.json < CLI flags`. Override individual values
with repeatable `--resilience key=value` flags, for example:

```bash
ocloop --resilience watchdogSuspectMs=120000 --resilience maxRateLimitRetries=12
```

Keys include `createTimeoutMs`, `promptTimeoutMs`, `pingTimeoutMs`,
`backoffBaseMs`, `backoffMaxMs`, `maxRateLimitRetries`, `minIterationGapMs`,
`sleepTickMs`, `sleepThresholdMs`, `watchdogSuspectMs` (T1), `watchdogConfirmMs`
(T2), `watchdogTickMs`, and `maxRecoveryAttempts`.

## Files

| File                | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `PLAN.md`           | Task list to execute                             |
| `.loop-prompt.md`   | Prompt sent to OpenCode each iteration           |
| `AGENTS.md`         | Persistent knowledge for OpenCode across sessions|
| `.loop.log`         | Debug log (with `[HEALTH]` watchdog telemetry)   |
| `.loop-state.json`  | Persisted progress for crash recovery (`--resume`)|

## Configuration

### Environment Variables

OCLoop respects OpenCode's environment variables for API keys and configuration. See [OpenCode documentation](https://opencode.ai/docs) for details.

### Theming

OCLoop automatically detects your OpenCode theme from `~/.local/state/opencode/kv.json` and applies it to the dashboard. Includes all 32 bundled OpenCode themes.

### Terminal Preferences

On first use of `T` (terminal launcher), OCLoop detects installed terminals and saves your preference to `~/.config/ocloop/ocloop.json`. Supports: Alacritty, Kitty, WezTerm, GNOME Terminal, Konsole, and more.

## Examples

The `examples/` directory contains starter templates:

- `PLAN.md` — Example task plan demonstrating all supported markers
- `loop-prompt.md` — Example loop prompt with best practices
- `CREATE_PLAN.md` — Prompt to help generate a plan for your project

To use them:

```bash
cp examples/PLAN.md ./PLAN.md
cp examples/loop-prompt.md ./.loop-prompt.md  # Note the leading dot
```

## Development

```bash
# Run in development mode
bun run dev

# Run tests
bun test

# Build for production
bun run build
```

## Troubleshooting

### "Error: Prompt file not found"

Create a `.loop-prompt.md` file with instructions for executing plan tasks. See Quick Start above.

### "Error: Plan file not found"

Create a `PLAN.md` file with tasks. At minimum:

```markdown
## Backlog
- [ ] Your first task
```

### Server fails to start

- Ensure OpenCode is properly installed and available in your PATH
- Check OpenCode logs for errors (usually in `.opencode/` directory)
- Verify your API keys are configured correctly

### Loop seems stuck

- The task guardian detects a genuinely stalled loop automatically: watch the
  `Guard ●` indicator in the dashboard (green healthy, yellow checking, red
  recovering) and the `[HEALTH]` lines in `.loop.log`.
- Press `T` to launch OpenCode in an external terminal and see what's happening
- Check if OpenCode is waiting for input or confirmation
- Look at the activity log for recent events
- If a recovery loop reports persistent failure, the error dialog includes a
  diagnostic (last heartbeat age, probe verdict, attempts)

## License

MIT
