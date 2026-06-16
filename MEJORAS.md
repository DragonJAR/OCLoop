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

### 1.3 — Audit `--model` format rejection (no `/`, multi `/`, empty sides, whitespace)

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL findings. One LOW finding (whitespace test gap, now closed).**

The `parseModel` helper (lines 145-157 of `src/lib/cli-args.ts`) is a single
regex gate:

```ts
const MODEL_RE = /^[^\s/]+\/[^\s/]+$/
```

The character class `[^\s/]+` is the single source of truth for "provider
must be non-empty, non-whitespace, and not contain a slash" — applied twice,
once per side of the literal `/`. The anchors `^` and `$` reject any
surrounding whitespace.

#### Mapping each required case to a test

| Required case (PLAN.md 1.3)            | Test before this iteration         | Behavior                                            | Status   |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------- | -------- |
| String without `/` (bare model)        | line 128 (`"claude-sonnet-4"`)      | Rejected: zero slashes → no match.                  | OK       |
| String with multiple `/` (e.g. `a/b/c`)| line 131, 252-256                   | Rejected: third side has no `[^\s/]+` content.      | OK       |
| Empty provider (`/claude`)             | line 129                            | Rejected: leading slash → provider side is empty.   | OK       |
| Empty model (`anthropic/`)             | line 130                            | Rejected: trailing slash → model side is empty.      | OK       |
| Whitespace (any position)              | **none** before this iteration      | Rejected by regex anchors + `[^\s/]+` exclusion.    | CLOSED ↓ |

#### What the regex actually rejects for whitespace

The regex `/^[^\s/]+\/[^\s/]+$/` has no implicit `.trim()`. Every one of the
following inputs fails the match (verified by adding 11 new test cases in
`describe("parseArgs — --model whitespace rejection (Phase 1 Task 1.3)")`):

| Input                         | Failure point                                    |
| ----------------------------- | ------------------------------------------------ |
| `" anthropic/claude"`         | `^` anchor: leading space                       |
| `"anthropic/claude "`         | `$` anchor: trailing space                       |
| `"anthropic /claude"`         | `[^\s/]+` on provider side: contains space       |
| `"anthropic/ claude"`         | `[^\s/]+` on model side: contains space           |
| `"\tanthropic/claude"`        | `^` anchor: leading tab                          |
| `"anthropic/claude\t"`        | `$` anchor: trailing tab                          |
| `"anthropic\t/claude"`        | `[^\s/]+` on provider side: contains tab          |
| `"anthropic/\tclaude"`        | `[^\s/]+` on model side: contains tab              |
| `"anthropic/   "`             | `[^\s/]+` on model side: only whitespace          |
| `"anthropic/claude\n"`        | `$` anchor: trailing newline                      |
| `"  openai/gpt-5  "`          | Both anchors: leading and trailing whitespace    |

#### Finding 1.3.A — LOW — Whitespace not explicitly tested (closed by this audit)

**Problem.** Before this iteration the test file exercised every *structural*
failure mode of `parseModel` (missing arg, no slash, multi-slash, empty
provider, empty model) but did not pin down whitespace rejection. The
behavior was correct (the regex is unambiguous on the subject), but a
regression that loosened the regex to `/.+\/.+/` would not have been caught
by the existing suite.

**Where.** `src/lib/cli-args.test.ts` (no whitespace cases before this
audit).

**Proposed fix.** Add a dedicated `describe` block with table-driven cases
covering leading, trailing, internal, and tab/newline whitespace on both
sides of the slash. Implemented below.

**Status.** **FIX APPLIED** (test-only). New suite at lines 268-300 of
`src/lib/cli-args.test.ts`. 11 cases, all passing.

```ts
describe("parseArgs — --model whitespace rejection (Phase 1 Task 1.3)", () => {
  const cases: Array<[string, string]> = [
    ["leading space", " anthropic/claude"],
    ["trailing space", "anthropic/claude "],
    ["internal space (provider side)", "anthropic /claude"],
    ["internal space (model side)", "anthropic/ claude"],
    ["leading tab", "\tanthropic/claude"],
    ["trailing tab", "anthropic/claude\t"],
    ["tab between provider and slash", "anthropic\t/claude"],
    ["tab between slash and model", "anthropic/\tclaude"],
    ["only whitespace after slash", "anthropic/   "],
    ["newline embedded", "anthropic/claude\n"],
  ]
  for (const [name, value] of cases) {
    it(`rejects --model with ${name}`, () => {
      const r = runParse(["--model", value])
      expect(r.exitCode).toBe(1)
      expect(r.errors.join("\n")).toContain("provider/model")
    })
  }

  it("model regex anchors strictly (no allow-trim semantics)", () => {
    const r = runParse(["--model", "  openai/gpt-5  "])
    expect(r.exitCode).toBe(1)
  })
})
```

#### Finding 1.3.B — INFO — `--model` does not allow quoted whitespace

The CLI does not strip surrounding quotes or whitespace from the value
passed to `--model`. A user who runs

```
ocloop --model "  openai/gpt-5  "
```

(quotes for grouping) will see the regex reject the value because the
shell strips the quotes and the regex sees the leading/trailing spaces.
This is consistent with how `--prompt`, `--plan`, and `--agent` behave
(`requireValue` does not trim either; see Finding 1.1.A) and is the
intentional design — the user can `.trim()` themselves if they need to.
**No change needed.**

#### Finding 1.3.C — INFO — The error message is informative

When `parseModel` rejects an input, the error message embeds the offending
value in backticks and provides an example of the correct shape
(`openai/gpt-5`):

```
Error: --model expects provider/model (for example openai/gpt-5), got "<bad-value>"
```

This is verified by the test at line 154-158 (`expect(...).toContain("provider/model")`).
The new whitespace tests in Finding 1.3.A also assert on the same
substring. **No change needed.**

#### Summary

| Severity | Count | Notes                                      |
| -------- | ----- | ------------------------------------------ |
| CRITICAL | 0     |                                            |
| HIGH     | 0     |                                            |
| MEDIUM   | 0     |                                            |
| LOW      | 1     | 1.3.A — whitespace test gap (closed)       |
| INFO     | 2     | 1.3.B (no quoted whitespace), 1.3.C (error) |

`bun test src/lib/cli-args.test.ts` → **60 pass, 0 fail, 141 expect() calls**
(was 49/0/120 before this iteration).

---

### 1.4 — Audit `--lang` locale validation (case sensitivity, empty string, whitespace)

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL findings. One LOW finding (inconsistent missing-value error message) and three INFO observations.**

The `--lang` (and alias `--language`) case in `parseArgs` (lines 227-235 of
`src/lib/cli-args.ts`) delegates to `isLocale` in `src/lib/i18n.ts`:

```ts
case "--lang":
case "--language":
  const lang = argv[++i]
  if (!lang || !isLocale(lang)) {
    console.error("Error: --lang requires 'en' or 'es'")
    process.exit(1)
  }
  args.lang = lang
  break
```

```ts
// src/lib/i18n.ts:22-24
export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "es"
}
```

`isLocale` is a strict triple-equals check, with no normalization, no trim,
and no tolerance for case variations. PLAN.md Task 1.4 asked for case
sensitivity, empty string, and "other invalid values" to be verified.

#### Mapping each required case to a test

| Required case (PLAN.md 1.4)               | Test before this iteration         | Behavior                                            | Status   |
| ----------------------------------------- | ----------------------------------- | --------------------------------------------------- | -------- |
| Value other than `en`/`es` (e.g. `fr`)    | line 135 (`--lang fr`)              | Rejected: `isLocale("fr") === false`.              | OK       |
| Case sensitivity (`EN`, `En`, `ES`, `Es`) | **none** before this iteration      | Rejected: strict `===` comparison.                  | CLOSED ↓ |
| Empty string                              | **none** before this iteration      | Rejected: `!lang` short-circuit.                    | CLOSED ↓ |
| Whitespace around value                   | **none** before this iteration      | Rejected: no `.trim()` in the code path.            | CLOSED ↓ |
| Missing value (`--lang` with no arg)      | **none** before this iteration      | Rejected: `argv[++i]` is `undefined` → `!lang`.     | CLOSED ↓ |
| Non-locale garbage (numeric, boolean)     | **none** before this iteration      | Rejected: `isLocale` returns false.                 | CLOSED ↓ |
| `--language` alias behaves identically    | line 75 (positive `en`)             | Rejected for invalid values; accepted for valid.    | OK       |

#### What the strict check actually rejects (21 new test cases)

The audit added a dedicated `describe` block at the bottom of
`src/lib/cli-args.test.ts` (`describe("parseArgs — --lang locale validation (Phase 1 Task 1.4)")`).
The table below maps every test case to the rejection mechanism:

| Case family              | Inputs                                                                  | Mechanism                          |
| ------------------------ | ----------------------------------------------------------------------- | ---------------------------------- |
| Wrong case               | `"EN"`, `"En"`, `"ES"`, `"Es"`                                          | `isLocale` strict `===`            |
| Whitespace around value  | `" en"`, `"en "`, `"\ten"`, `"en\t"`, `"\nen"`, `"es\n"`                | No `.trim()` in code path          |
| Empty string             | `""`                                                                     | `!lang` short-circuit              |
| Missing value            | (no following arg)                                                       | `argv[++i]` is `undefined`         |
| Non-locale garbage       | `"fr"`, `"en-US"`, `"es-MX"`, `"english"`, `"1"`, `"true"`             | `isLocale` returns false           |
| Alias consistency        | `--language` with each of the above                                    | Same code path as `--lang`         |

#### Finding 1.4.A — LOW — `--lang` does not use `requireValue`, so `--lang --debug` blames the locale

**Problem.** The other value flags (`--port`, `--model`, `--agent`, `--prompt`,
`--plan`) all run their value through a helper that distinguishes "missing
value" from "invalid value":

- `parsePort` emits `"Error: --port requires a full integer argument"` when
  the value is missing or non-numeric, and `"Error: --port must be in TCP
  range 0..65535"` when the value is well-formed but out of range.
- `parseModel` emits `"Error: --model requires an argument"` for a missing
  value, and `"Error: --model expects provider/model ..."` for a malformed
  one.
- `requireValue` (used by `--agent`, `--prompt`, `--plan`) emits
  `"Error: <flag> requires a value"` for either a missing value OR a value
  that looks like another flag (`--prompt --debug`).

`--lang` skips all of those. The inline check is:

```ts
const lang = argv[++i]
if (!lang || !isLocale(lang)) {
  console.error("Error: --lang requires 'en' or 'es'")
  process.exit(1)
}
```

So a user who runs

```
ocloop --lang --debug
```

gets `Error: --lang requires 'en' or 'es'`, which is technically true
(`--debug` is not a valid locale) but reads as "your locale value is
wrong" rather than "you forgot to pass a value". The same applies to
`--lang --chaos`, `--lang --verbose`, etc.

**Where.** `src/lib/cli-args.ts:227-235` (the `--lang` case).

**Proposed fix.** Use `requireValue` (or a similar pre-check) before
`isLocale`, so the missing-value case emits a distinct error:

```ts
case "--lang":
case "--language": {
  const lang = requireValue(argv[++i], "--lang")
  if (!isLocale(lang)) {
    console.error("Error: --lang requires 'en' or 'es'")
    process.exit(1)
  }
  args.lang = lang
  break
}
```

Note that `requireValue` rejects values starting with `-` (except `-`),
so `--lang --debug` would emit `Error: --lang requires a value` (the
existing, consistent message), while `--lang fr` would still emit the
locale error. This matches the pattern of the other value flags.

**Status.** **NOT FIXED** — documented only. The current behavior is
correct (it rejects the bad input), only the error message is suboptimal.
A test now pins the current behavior so a future fix is visible as a
behavioral change.

#### Finding 1.4.B — INFO — Locale is a closed set by design

`isLocale` accepts exactly two values. This is intentional: the only
shipped locales are `en` and `es`, and adding a new locale is a
deliberate i18n effort (every UI string needs a translation, the `es`
mirror type-checks the new keys). The CLI does not silently accept
`en-US` or `es-MX` — those get the same error as `fr`. This is the
right call for a CLI surface that drives a typed `Locale` field.

#### Finding 1.4.C — INFO — Empty string is correctly rejected via `!lang`

The `!lang` short-circuit handles three distinct cases uniformly:
`undefined` (no following arg), `null` (impossible from `argv`), and
`""` (empty shell-quoted arg). The error message does not distinguish
them, but that is fine: the action is the same in all three (the user
must supply a non-empty value).

#### Finding 1.4.D — INFO — The `--language` alias is purely cosmetic

Both `--lang` and `--language` map to the same `case` and call the
same `isLocale` check. There is no behavioral difference other than
the spelling. The test suite covers both forms on the positive path
(`"en"` and `"es"` accepted) and the alias is exercised in the
`--lang + --chaos + numeric --resilience together` combination test
at line 182-188.

#### Summary

| Severity | Count | Notes                                                              |
| -------- | ----- | ------------------------------------------------------------------ |
| CRITICAL | 0     |                                                                    |
| HIGH     | 0     |                                                                    |
| MEDIUM   | 0     |                                                                    |
| LOW      | 1     | 1.4.A — inconsistent missing-value error (not fixed, documented)   |
| INFO     | 3     | 1.4.B (closed set), 1.4.C (empty short-circuit), 1.4.D (alias)     |

`bun test src/lib/cli-args.test.ts` → **81 pass, 0 fail, 184 expect() calls**
(was 60/0/141 before this iteration).

---

### 1.5 — Remaining Phase 1 sub-tasks (audit pending)

The following PLAN.md Phase 1 sub-tasks still need their own dedicated audit
section. They are listed here as a roadmap for the next iteration so the
report stays ordered as additional sections are appended in order.

- [x] **Task 1.4** — Verify `--lang` rejects values other than `en`/`es` (case sensitivity, empty string). ✅ COMPLETE — see section 1.4 above.
- [ ] **Task 1.5** — Verify `--resilience key=value` edge cases. (Tests at lines 86-93, 136-145, 226-243, 259-264.)
- [ ] **Task 1.6** — Verify `--create-plan` flag combinations. (Tests at lines 162-188.)
- [ ] **Task 1.7** — Verify `--resume` combined with `--run`, `--create-plan`, and standalone.
- [ ] **Task 1.8** — Document `requireValue` accepting a lone `-`. (Covered by tests at line 211-218.)
- [ ] **Task 1.9** — Verify `parseArgs` is idempotent. (Test at lines 238-244.)

---

### 1.6 — Other observations on the file

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
