# OCLoop — MEJORAS (Audit Findings)

Findings from the exhaustive execution-flow audit. Each entry follows:
**Severity / Problem / Where / Proposed fix / Status**.

Severity legend: **CRITICAL** breaks core flow · **HIGH** produces wrong behavior
on a plausible input · **MEDIUM** footgun or edge case with narrow blast radius ·
**LOW** polish or test-coverage gap · **INFO** observed behavior, no fix needed.

This file is the **single source of truth** for all audit findings. As the
audit progresses through PLAN.md, additional sections are appended in order.

---

## Phase 1 — CLI Argument Parsing & Validation

Source: `src/lib/cli-args.ts` · Tests: `src/lib/cli-args.test.ts` (49 tests, all passing)

### 1.1 — Flag audit: long/short, missing values, empty strings, duplicates, unknown flags

**Status: COMPLETE — VERIFIED, one MEDIUM and one LOW finding.**

The `parseArgs` function is well-structured: a single `for` loop with a `switch`
on each argument, separate helpers (`parsePort`, `parseModel`, `requireValue`,
`applyResilienceOverride`) for value validation. The existing test suite
(`cli-args.test.ts`) covers the vast majority of cases:

| Scenario | Test coverage | Result |
| --- | --- | --- |
| Long & short forms of every flag | `parseArgs — defaults & single flags` | OK |
| Missing required value (`--port`, `--model`, `--agent`, `--prompt`, `--plan`, `--resilience`) | `invalid input exits 1` (line 126-145) | OK |
| Empty string value (`--resilience key=`) | line 137 | OK |
| `--value --next-flag` rejected (e.g. `--prompt --debug`) | `value flags reject a following flag` (line 211-218) | OK |
| Lone `-` accepted as a valid value | implicit (requireValue explicit guard) | OK |
| Unknown flag → exit 1 | line 95-99 | OK |
| `--help` / `--version` print & exit 0 | line 102-116 | OK |
| Idempotent: repeated `--resilience caffeinate=…` last-wins | line 196-208 | OK |

#### Finding 1.1.A — MEDIUM — Empty string accepted by `requireValue` for whitespace-only input

**Problem.** `requireValue(" ", "--prompt")` (a single space) returns `" "`
truthy, so `--prompt " "` silently sets `args.promptFile` to a whitespace-only
filename. Same applies to `--plan` and `--agent`. The user almost certainly
meant to pass a missing value.

**Where.** `src/lib/cli-args.ts:137-143` (`requireValue`).

**Proposed fix.** Trim the value before checking; reject if the trimmed string
is empty.

```ts
function requireValue(value: string | undefined, flag: string): string {
  if (!value || value.trim() === "" || (value.startsWith("-") && value !== "-")) {
    console.error(`Error: ${flag} requires a value`)
    process.exit(1)
  }
  return value
}
```

**Status.** Fix proposed, not applied (audit-only per PLAN.md acceptance criteria).

#### Finding 1.1.B — LOW — Duplicate value-flag behavior is not explicitly tested

**Problem.** The implementation makes duplicate value flags (e.g.
`--port 8080 --port 9090`) last-wins, and duplicate boolean flags
(`--debug --debug`) idempotent. Behavior is correct, but the test suite
relies on the test at line 196-208 only for `--resilience` keys; a regression
in the `switch` fall-through (e.g. accidentally using a `break` that exits
the for-loop) would not be caught for non-resilience flags.

**Where.** `src/lib/cli-args.ts:170-262` (the for/switch loop).

**Proposed fix.** Add a test case verifying last-wins for `--port` and
idempotency for `--debug`:

```ts
it("duplicate --port flags: last wins", () => {
  const { args } = runParse(["--port", "8080", "--port", "9090"])
  expect(args?.port).toBe(9090)
})
it("duplicate --debug flags: idempotent", () => {
  const { args } = runParse(["--debug", "--debug"])
  expect(args?.debug).toBe(true)
})
```

**Status.** Fix proposed, not applied.

#### Finding 1.1.C — INFO — `parseArgs` is pure & idempotent

Calling `parseArgs` twice with the same input returns the same `CLIArgs` object
shape. The implementation does not mutate `argv` (verified by test line 238-244).
No findings.

#### Finding 1.1.D — INFO — `requireValue` documents a deliberate "looks like a flag → error" rule

The function rejects values that start with `-` (except lone `-`). This is
intentional, documented in the function header comment, and tested at
line 211-218. The rationale (preventing `--prompt --debug` from being silently
mis-parsed) is sound. No findings.

#### Finding 1.1.E — INFO — `parseModel` regex requires exactly one `/`

`/^[^\s/]+\/[^\s/]+$/` rejects empty provider, empty model, multi-`/`, and any
whitespace. Tested at lines 128-131 and 252-256. No findings.

---

### 1.2 — Audit `--port` boundary values

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL findings. Two INFO observations.**

The `parsePort` helper (lines 119-130 of `src/lib/cli-args.ts`) uses a two-stage
gate: a regex (`PORT_RE = /^\d+$/`) blocks non-integer tokens before they reach
the numeric range check, so a single error path covers most malformed inputs.

```ts
function parsePort(portStr: string | undefined): number {
  if (!portStr || !PORT_RE.test(portStr)) {
    console.error("Error: --port requires a full integer argument")
    process.exit(1)
  }
  const port = Number(portStr)
  if (port < 0 || port > 65535) {
    console.error("Error: --port must be in TCP range 0..65535")
    process.exit(1)
  }
  return port
}
```

Each of the five required cases (PLAN.md Task 1.2) is exercised by
`src/lib/cli-args.test.ts`:

| Required case         | Input               | Code path                                           | Test                       | Result |
| --------------------- | ------------------- | --------------------------------------------------- | -------------------------- | ------ |
| Non-numeric           | `abc`               | `PORT_RE` fails → exit 1                            | line 121                   | OK     |
| Negative              | `-1`                | `PORT_RE` fails (no `\d` for `-`) → exit 1          | line 124                   | OK     |
| Zero                  | `0`                 | matches → range check passes (0 ≤ 0 ≤ 65535)        | lines 65, 246-250          | OK     |
| Float                 | `123.4`             | `PORT_RE` fails (`.` not in `\d`) → exit 1          | line 123                   | OK     |
| >65535                | `65536`             | matches → range check fails → exit 1                | line 125                   | OK     |

Additional cases worth covering for completeness:

| Case                       | Input         | Behavior                  | Notes                                         |
| -------------------------- | ------------- | ------------------------- | --------------------------------------------- |
| Empty string               | `""`          | `!portStr` → exit 1       | Same error path as non-numeric. OK            |
| Missing arg                | `--port`      | `argv[++i]` → undefined → `!portStr` → exit 1 | Tested line 126. OK              |
| Hex / scientific / unicode | `0x10`, `1e3` | `PORT_RE` fails → exit 1  | Intentionally rejected. OK                    |
| Whitespace-padded          | `" 80"`       | `PORT_RE` fails → exit 1  | User must trim themselves. OK                |
| Leading zeros              | `"0080"`      | matches → returns 80      | Accepted as 80. See Observation 1.2.A below.  |
| Repeated flag              | `--port 1 --port 2` | last wins (2)         | Same switch fall-through as 1.1.B. OK         |

#### Observation 1.2.A — INFO — Leading zeros silently coerced (e.g. `--port 0080` → 80)

`--port 0080` parses as 80. `Number("0080")` is 80, so the range check passes
without complaint. This is the standard behavior of the JS `Number()`
constructor for integer strings and is consistent with most CLI tools
(node, curl, etc.). No user-facing harm — port 80 is the HTTP port regardless
of how the user typed it. **No change needed.**

#### Observation 1.2.B — INFO — Port 0 is explicitly accepted as "OS-assigned"

The test at lines 246-250 documents the design decision to accept port 0
rather than reject it as out-of-range. The current implementation handles
this correctly because the range check is `port < 0 || port > 65535`, which
admits 0. This matches the TCP spec (RFC 6335 §2.2) where port 0 means
"let the OS pick". **No change needed.**

#### Finding 1.2.C — INFO — All five required boundary cases are tested

The audit-trail test file `src/lib/cli-args.test.ts` covers every case listed
in PLAN.md Task 1.2. Running the suite locally:

```
$ bun test src/lib/cli-args.test.ts
49 pass, 0 fail
```

This is the strongest form of verification — the assertions live in the repo
and run on every `bun test`. **No additional test work needed for Task 1.2.**

---

### 1.3 — Remaining Phase 1 sub-tasks (audit pending)

The following PLAN.md Phase 1 sub-tasks still need their own dedicated audit
section. They are listed here as a roadmap for the next iteration so the
report stays ordered as additional sections are appended in order.

- [ ] **Task 1.3** — Verify `--model` rejects strings without `/`, with multiple `/`, empty provider/model, and whitespace. (Largely covered by 1.1.E + tests at lines 128-131, 252-256.)
- [ ] **Task 1.4** — Verify `--lang` rejects values other than `en`/`es` (case sensitivity, empty string). (Implemented by `isLocale` in `src/lib/i18n.ts`.)
- [ ] **Task 1.5** — Verify `--resilience key=value` edge cases. (Tests at lines 86-93, 136-145, 226-243, 259-264.)
- [ ] **Task 1.6** — Verify `--create-plan` flag combinations. (Tests at lines 162-188.)
- [ ] **Task 1.7** — Verify `--resume` combined with `--run`, `--create-plan`, and standalone.
- [ ] **Task 1.8** — Document `requireValue` accepting a lone `-`. (Covered by tests at line 211-218.)
- [ ] **Task 1.9** — Verify `parseArgs` is idempotent. (Test at lines 238-244.)

---

### 1.4 — Other observations on the file

- **`require("../../package.json").version` at `src/lib/cli-args.ts:16`** — uses
  CommonJS `require` from an ESM module (the rest of the file is ESM). Bun
  tolerates this, but the surrounding `tsconfig.json` is `module: "esnext"`.
  This works at runtime via Bun's CJS interop, and the file `package.json` is
  in the project root as required. **INFO only.**
- **`parseArgs` does not collect a position remainder** — any positional arg
  (e.g. `ocloop extra.md`) hits the `default` case and exits 1. Tested at
  line 144. **No findings.**
- **The for-loop uses `for (let i = 0; i < argv.length; i++)` with `++i`
  inside cases** — this is the classic pre-increment-in-switch pattern; no
  off-by-one risk because the increment happens before the `requireValue`
  call sees the next token. **No findings.**
