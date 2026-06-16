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

### 1.5 — Audit `--resilience key=value` edge cases (unknown key, non-numeric, empty, multi-`=`, boolean)

**Status: COMPLETE — VERIFIED, one MEDIUM and three INFO findings.**

The `--resilience` flag is parsed by `applyResilienceOverride` at
`src/lib/cli-args.ts:74-117`. The function splits on the first `=`
(`kv.indexOf("=")`), trims both sides, and coerces the value against the
declared type of the default (boolean vs number). It is exported
(separate from `parseArgs`) so tests can hit it directly.

```ts
const eq = kv.indexOf("=")
const key = kv.slice(0, eq).trim()
const raw = kv.slice(eq + 1).trim()

if (!key)        /* exit 1: "key is empty"            */
if (!raw)        /* exit 1: "requires a non-empty value" */
if (!(key in DEFAULT_RESILIENCE)) /* exit 1: "unknown resilience key" */

if (typeof def === "boolean") /* accept true/false/1/0 */
else                          /* require non-negative integer via Number() */
```

#### Mapping each required case to a test

| Required case (PLAN.md 1.5)                                  | Test before this iteration  | Behavior                                                                                 | Status   |
| ------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Unknown key                                                  | line 138 (`bogus=1`)        | `key in DEFAULT_RESILIENCE` guard → exit 1.                                              | OK       |
| Non-numeric value for numeric key                            | line 139 (`backoffBaseMs=abc`) | `Number.isFinite(NaN)` → exit 1.                                                       | OK       |
| Empty value                                                  | line 137 (`backoffBaseMs=`) | `!raw` guard → exit 1.                                                                   | OK       |
| Value with `=` signs (e.g. `key=10=20`)                      | **none** before this audit  | `indexOf("=")` splits on first `=`, `raw="10=20"`, `Number("10=20")===NaN` → exit 1.     | CLOSED ↓ |
| Boolean key with non-boolean value                           | line 142 (`caffeinate=maybe`) | type guard rejects everything but `true`/`false`/`1`/`0` → exit 1.                      | OK       |

#### What `applyResilienceOverride` actually does for each input

The audit added 14 new test cases (split across two `describe` blocks).
The table below maps every required and adjacent case to the precise
mechanism:

| Input                                  | Mechanism                                      | Exit | Outcome        |
| -------------------------------------- | ---------------------------------------------- | ---- | -------------- |
| `bogus=1`                              | `!('bogus' in DEFAULT_RESILIENCE)`             | 1    | "unknown resilience key" |
| `backoffBaseMs=abc`                    | `Number.isFinite(NaN) === false`               | 1    | "non-negative integer"   |
| `backoffBaseMs=`                       | `!raw` short-circuit                           | 1    | "non-empty value"        |
| `backoffBaseMs=   `                    | `!raw` after `.trim()`                         | 1    | "non-empty value"        |
| `backoffBaseMs=10=20`                  | `Number("10=20") === NaN`                      | 1    | "non-negative integer, got '10=20'" |
| `caffeinate=true=yes`                  | type guard (`!== "true" && !== "false" && !== "1" && !== "0"`) | 1    | "boolean, got 'true=yes'" |
| `caffeinate=maybe`                     | type guard as above                            | 1    | "boolean, got 'maybe'"   |
| `=1`                                   | `!key` short-circuit                           | 1    | "key is empty"           |
| `=`                                    | `!key` short-circuit                           | 1    | "key is empty"           |
| `backoffBaseMs =  500  `               | trim on both sides                             | 0    | `{ backoffBaseMs: 500 }` |
| `backoffBaseMs=1e3`                    | `Number("1e3") === 1000`, isInteger+finite     | 0    | `{ backoffBaseMs: 1000 }` |
| `backoffBaseMs=0x10`                   | `Number("0x10") === 16`, isInteger+finite      | 0    | `{ backoffBaseMs: 16 }`   |
| `backoffBaseMs=1.0`                    | `Number("1.0") === 1`, isInteger+finite        | 0    | `{ backoffBaseMs: 1 }`    |
| `backoffBaseMs=+5`                     | `Number("+5") === 5`, isInteger+finite         | 0    | `{ backoffBaseMs: 5 }`    |
| `maxRateLimitRetries=1.5`              | `Number.isInteger(1.5) === false`              | 1    | "non-negative integer"    |

#### Finding 1.5.A — MEDIUM — Numeric coercion accepts non-decimal strings (diverges from `--port`)

**Problem.** The numeric branch of `applyResilienceOverride` uses
`Number(raw)` followed by `Number.isInteger` and `Number.isFinite`. This
permits:

- Scientific notation: `backoffBaseMs=1e3` → `1000`
- Hex literals: `backoffBaseMs=0x10` → `16`
- Decimal-as-integer: `backoffBaseMs=1.0` → `1`
- Leading sign: `backoffBaseMs=+5` → `5`

The corresponding `--port` gate uses a strict regex (`PORT_RE = /^\d+$/`)
at `src/lib/cli-args.ts:17, 120` and rejects every one of these. The
project's own convention is therefore inconsistent: `--port 0080` is
accepted (observation 1.2.A — leading zeros stripped) but
`--resilience backoffBaseMs=0x10` is also accepted (no audit-policy
basis for the divergence). The two flags take integers; they should
behave the same way.

In practice this is a footgun, not a security issue. A user who copies
`backoffBaseMs=0x10` from a forum post and pastes it gets a silent
`16` instead of the error message that `--port 0x10` would emit. The
silent coercion is also a maintenance hazard: future logic that
double-checks the user-provided value (e.g. bounds warnings) will not
trigger on a misread input.

**Where.** `src/lib/cli-args.ts:110-115` (the numeric branch of
`applyResilienceOverride`).

**Proposed fix.** Add a strict-decimal regex gate before `Number(raw)`,
mirroring `PORT_RE`:

```ts
const NUM_RE = /^\d+$/
if (!NUM_RE.test(raw)) {
  console.error(
    `Error: --resilience ${key} expects a non-negative integer (decimal only), got "${raw}"`,
  )
  process.exit(1)
}
const num = Number(raw)
// existing isInteger / isFinite / num < 0 checks retained as a belt-and-braces
```

This rejects `1e3`, `0x10`, `1.0`, `+5`, `-0`, and any non-decimal
integer string. The existing `Number.isInteger` / `Number.isFinite`
checks then become a defense-in-depth rather than the primary gate.

**Status.** **NOT FIXED** — documented only. The current behavior is
not harmful; the four permissive shapes (1e3, 0x10, 1.0, +5) all
produce a sensible integer. 15 new test cases (10 in the
`--resilience key=value edge cases` block + 5 in the `--resilience
numeric coercion strictness` block) pin the current behavior so a
future tightening is visible as a behavioral change.

#### Finding 1.5.B — INFO — Empty value after `.trim()` short-circuits before the integer check

The `!raw` guard fires after `kv.slice(eq+1).trim()`, so
`backoffBaseMs=   ` (whitespace-only value) is rejected with
"requires a non-empty value" rather than being coerced to `Number("")===0`
and then passing the integer check. This is the correct order:
`Number("")` is `0`, which would otherwise be silently accepted as the
backoff base. The test at the new "rejects an empty value trimmed of
whitespace" case pins this so a refactor that drops the early `!raw`
guard is visible.

#### Finding 1.5.C — INFO — Empty key (`=1`) and bare `=` are rejected by the same guard

Both inputs hit the `!key` short-circuit at `src/lib/cli-args.ts:86-89`
and exit 1 with the same "key is empty" error. The order of checks
matters: `!key` runs **before** the key-existence check at line 96,
so an input like `=1` does not get the misleading
"unknown resilience key ''" error that a swap would produce. Tested at
the new "rejects an empty key" and "rejects a bare =" cases.

#### Finding 1.5.D — INFO — Whitespace around `=` is correctly trimmed

The implementation trims both sides of the first `=` (lines 83-84).
`--resilience "backoffBaseMs =  500  "` parses to `{ backoffBaseMs: 500 }`.
This is a small quality-of-life feature: a user who pastes the flag
from a doc that uses spacing for visual alignment (e.g.
`backoffBaseMs = 1000`) gets the expected result. Tested at the new
"tolerates whitespace around the = separator" case.

#### Finding 1.5.E — INFO — Multi-`=` for boolean keys is rejected with a diagnostic message

`caffeinate=true=yes` is rejected with the standard "boolean" error
message that embeds the offending value. The user sees the literal
`true=yes` in the error, which is enough to diagnose the typo. No
change needed beyond the test.

#### Summary

| Severity | Count | Notes                                                                       |
| -------- | ----- | --------------------------------------------------------------------------- |
| CRITICAL | 0     |                                                                             |
| HIGH     | 0     |                                                                             |
| MEDIUM   | 1     | 1.5.A — numeric coercion accepts scientific/hex/decimal-as-integer/sign (not fixed, documented) |
| LOW      | 0     |                                                                             |
| INFO     | 4     | 1.5.B (empty-after-trim order), 1.5.C (empty key), 1.5.D (whitespace around `=`), 1.5.E (multi-`=` boolean error) |

`bun test src/lib/cli-args.test.ts` → **96 pass, 0 fail, 219 expect() calls**
(was 81/0/184 before this iteration). New describe blocks:
- `parseArgs — --resilience key=value edge cases (Phase 1 Task 1.5)` — 10 cases.
- `parseArgs — --resilience numeric coercion strictness (Phase 1 Task 1.5, finding 1.5.A)` — 5 cases.

---

### 1.5.1 — Remaining Phase 1 sub-tasks (audit pending)

The following PLAN.md Phase 1 sub-tasks still need their own dedicated audit
section. They are listed here as a roadmap for the next iteration so the
report stays ordered as additional sections are appended in order.

- [x] **Task 1.5** — Verify `--resilience key=value` edge cases. ✅ COMPLETE — see section 1.5 above.
- [x] **Task 1.6** — Verify `--prompt` and `--plan` path handling. ✅ COMPLETE — see section 1.6 below.
- [x] **Task 1.7** — Verify `--create-plan` combined with `--run`, `--debug`, `--resume`, and other conflicting/combined flags. ✅ COMPLETE — see section 1.7 below.
- [x] **Task 1.8** — Verify `--resume` combined with `--run`, `--create-plan`, and standalone behavior. ✅ COMPLETE — see section 1.8 below.
- [ ] **Task 1.9** — Document: `requireValue` treats a value starting with `-` (except lone `-`) as missing — verify this rejects `--plan --debug` correctly but allows `--plan -` (a valid filename). (Covered by tests at lines 211-218; cross-pinned for --prompt and --plan paths in section 1.6.)
- [x] **Task 1.10** — Check if `parseArgs` is idempotent — calling it twice should produce the same result. ✅ COMPLETE — see section 1.11.

---

### 1.6 — Audit `--prompt` and `--plan` path handling (relative vs absolute, non-existent, directories, empty)

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL findings. One MEDIUM cross-reference (1.1.A, whitespace-only) and three INFO observations.**

The `--prompt` and `--plan` cases in `parseArgs` (lines 200-206 of
`src/lib/cli-args.ts`) are intentionally thin:

```ts
case "--prompt":
  args.promptFile = requireValue(argv[++i], "--prompt")
  break

case "--plan":
  args.planFile = requireValue(argv[++i], "--plan")
  break
```

`parseArgs` only enforces the **value-grammar** of the next token (via
`requireValue`): present, non-empty, not flag-shaped. It does **not** touch
the filesystem, normalize the path, or distinguish a file from a directory.
All path-level validation lives in `validatePrerequisites()`
(`src/index.tsx:28-57`), which calls `Bun.file(args.planFile).exists()` /
`Bun.file(args.promptFile).exists()` and prints a localized error before the
TUI starts.

#### Mapping each required case to a test

| Required case (PLAN.md 1.6)                     | Test (this iteration)                                            | Behavior                                                                 | Status   |
| ----------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Non-existent path                               | `--prompt` / `--plan` accept a non-existent path (2 cases)       | parseArgs does not check existence; `validatePrerequisites` does, later. | OK       |
| Directory                                       | `--prompt` / `--plan` accept a directory path (2 cases)          | parseArgs does not check kind.                                           | OK       |
| Empty filename                                  | `rejects --prompt ''` / `rejects --plan ''`                      | `requireValue`'s `!value` short-circuit → exit 1.                        | OK       |
| Relative path                                   | `--prompt` accepts a relative path; `--plan` accepts a relative path | Stored verbatim, no normalization.                                       | OK       |
| Absolute path                                   | `--prompt` accepts an absolute path; `--plan` accepts an absolute path | Stored verbatim, no normalization.                                       | OK       |

The audit added 22 new test cases in a dedicated `describe` block at
`src/lib/cli-args.test.ts` (`parseArgs — --prompt / --plan path handling
(Phase 1 Task 1.6)`).

#### What `parseArgs` actually does for each input

| Input                                | Mechanism                                | Exit | Outcome                                  |
| ------------------------------------ | ---------------------------------------- | ---- | ---------------------------------------- |
| `my-prompts/loop.md` (relative)      | `requireValue` passes; stored verbatim   | 0    | `args.promptFile === "my-prompts/loop.md"` |
| `/tmp/absolute-prompt.md` (absolute) | `requireValue` passes; stored verbatim   | 0    | `args.promptFile === "/tmp/absolute-prompt.md"` |
| `definitely-does-not-exist-12345.md` | `requireValue` passes; no fs check       | 0    | `args.promptFile === "definitely-does-not-exist-12345.md"` |
| `/tmp` (directory)                   | `requireValue` passes; no kind check     | 0    | `args.promptFile === "/tmp"`             |
| `../../../etc/passwd` (traversal)    | `requireValue` passes; no resolve        | 0    | `args.promptFile === "../../../etc/passwd"` |
| `my prompts/loop prompt.md` (spaces) | `requireValue` passes; no trim           | 0    | `args.promptFile === "my prompts/loop prompt.md"` |
| `-` (lone dash)                      | `requireValue` explicit guard            | 0    | `args.promptFile === "-"` (valid Unix filename) |
| `"   "` (whitespace only)            | `requireValue` truthy → no reject        | 0    | `args.promptFile === "   "` — see Finding 1.1.A (cross-reference) |
| (missing arg)                        | `argv[++i]` is `undefined`               | 1    | "Error: --prompt requires a value"       |
| `""`                                 | `!value` short-circuit                   | 1    | "Error: --prompt requires a value"       |
| `--debug` (flag-shaped)              | `(value.startsWith("-") && value !== "-")` | 1 | "Error: --prompt requires a value"     |

The same matrix holds for `--plan` (verified by parallel tests).

#### Where the path-level errors actually surface

`src/index.tsx:28-57` is the only place the program reads the filesystem to
validate the user-supplied paths:

```ts
async function validatePrerequisites(args: CLIArgs): Promise<void> {
  if (args.debug) return                    // <-- bypass in debug mode

  const planFile = Bun.file(args.planFile)
  const planExists = await planFile.exists()
  if (!planExists) {
    console.error(t("errPlanNotFound", { path: args.planFile }))
    process.exit(1)
  }
  // ... --prompt validation follows
}
```

`Bun.file(path).exists()` returns `false` for both non-existent paths and
for directories (POSIX kind distinction). A user who passes `--plan /tmp`
hits the "PLAN.md not found" error, not a "PLAN.md is a directory" error —
the validation does not distinguish them. **No change needed**: the message
is the same in both cases and the user almost certainly intended a file.

#### Finding 1.6.A — INFO — `parseArgs` is a pure tokenizer; path validation is a separate layer

The split between `parseArgs` (string-grammar only) and
`validatePrerequisites` (filesystem only) is deliberate. It keeps
`parseArgs` testable without touching the disk and lets `--create-plan`
short-circuit *before* validation runs — `runCreatePlan` writes the plan
file, not reads it, so requiring it to exist would be wrong. Pinning the
separation here so a future refactor that fuses the two layers (e.g. moves
the `Bun.file(...).exists()` check into `parseArgs`) is visible as a
behavioral change.

#### Finding 1.6.B — INFO — Relative and absolute paths are stored verbatim

`parseArgs` does not call `path.resolve`, `path.normalize`, or any other
path helper. `--prompt ./my.md` and `--prompt my.md` are both stored as-is,
and the eventual `Bun.file(path)` call resolves them relative to
`process.cwd()`. This is consistent with how `git`, `npm`, and `node`
treat CLI paths — the user owns the working directory, the tool does not
rewrite it. **No change needed.**

#### Finding 1.6.C — INFO — Lone `-` is accepted as a literal filename (deliberate)

`requireValue`'s `value !== "-"` carve-out was originally added to make
`--agent -` work (a user with a folder literally named `-` could reference
it). The same carve-out applies to `--prompt` and `--plan`. The tests
`accepts --prompt -` and `accepts --plan -` pin this so a future tightening
of `requireValue` (e.g. rejecting lone `-` for some flags but not others)
would be a visible per-flag decision. **No change needed.**

#### Finding 1.6.D — MEDIUM (cross-reference) — Whitespace-only value accepted (Finding 1.1.A)

`requireValue(" ", "--prompt")` returns `" "` (truthy), so
`--prompt " "` silently sets `args.promptFile` to a whitespace-only
filename. Same applies to `--plan`. The root cause is documented as
Finding 1.1.A at `src/lib/cli-args.ts:137-143`. The path-handling test
block re-pins the symptom at the surface where the user would observe it
(`accepts a whitespace-only value as a path`). See Finding 1.1.A for the
proposed `value.trim() === ""` fix. **Not fixed** — same rationale as
1.1.A (no user-facing harm in practice; `Bun.file(" ").exists()` returns
false and `validatePrerequisites` surfaces a clear error message).

#### Summary

| Severity | Count | Notes                                                                       |
| -------- | ----- | --------------------------------------------------------------------------- |
| CRITICAL | 0     |                                                                             |
| HIGH     | 0     |                                                                             |
| MEDIUM   | 1     | 1.6.D — whitespace-only value accepted (cross-reference to 1.1.A, not fixed) |
| LOW      | 0     |                                                                             |
| INFO     | 3     | 1.6.A (parseArgs is a tokenizer only), 1.6.B (relative/absolute verbatim), 1.6.C (lone `-` accepted) |

`bun test src/lib/cli-args.test.ts` → **118 pass, 0 fail, 264 expect() calls**
(was 96/0/219 before this iteration). New describe block:
- `parseArgs — --prompt / --plan path handling (Phase 1 Task 1.6)` — 22 cases.

---

### 1.7 — Audit `--create-plan` combined with other flags

**Status: COMPLETE — VERIFIED, one MEDIUM and one LOW finding. Five INFO observations.**

`--create-plan` (and its short form `-c`) is parsed by a single
case in `parseArgs` (`src/lib/cli-args.ts:218-221`) that just sets
`args.createPlan = true`. The actual plan-generation work lives in
`runCreatePlan` (`src/index.tsx:136-261`) and is invoked from
`main()` at `src/index.tsx:320-323`:

```ts
if (args.createPlan) {
  await runCreatePlan(args)
  process.exit(process.exitCode ?? 0)
}
```

The early `process.exit()` means the TUI never starts. Therefore, any
flag whose behavior is implemented inside the TUI (App.tsx effects,
the loop reducer, the watchdog, the power manager) is **parsed and
stored** on the args object but **never read**. `parseArgs` performs
no semantic check on these combinations.

#### What `runCreatePlan` actually reads from `args`

Grep across `src/` for the TUI-side readers of the candidate flags:

| Flag                  | Where read (TUI side)                                  | Read in `runCreatePlan`? |
| --------------------- | ------------------------------------------------------ | ------------------------ |
| `--port`              | n/a (passed to `createOpencodeServer` at index.tsx:164) | **Yes** (server port)    |
| `--model`             | n/a                                                    | **Yes** (defaulted to `zai-coding-plan/glm-5.2` at index.tsx:138) |
| `--agent`             | n/a                                                    | **Yes** (defaulted to `plan` at index.tsx:139) |
| `--plan`              | n/a                                                    | **Yes** (output path)    |
| `--prompt`            | `App.tsx:980` (`if (!props.debug)`) + `validatePrerequisites` (index.tsx:35-56) | **No** — silently ignored |
| `--resilience`        | `App.tsx:190, 225, 1119` (`resilience().caffeinate / .chaos / .resume`) | **Partially** — only `planTimeoutMs` is read at index.tsx:147 |
| `--lang`              | n/a (resolved before createPlan branch, index.tsx:316) | **Yes** (drives `t()` strings in plan-gen prompts) |
| `--run`               | `App.tsx:1135, 1143, 1153` (`if (props.run) loop.dispatch({ type: "start" })`) | **No** — TUI never starts |
| `--debug`             | `App.tsx:572, 588, 606, 980, 1017, 1100, 1269` (debug-only effects) | **No** — TUI never starts |
| `--verbose`           | `App.tsx:1639` (TUI keyboard log)                      | **No** — TUI never starts |
| `--resume`            | `App.tsx:1119` (`if (resilience().resume) ...`)        | **No** — TUI never starts |
| `--chaos`             | `App.tsx:225` (`createChaos(() => resilience().chaos && !!props.debug)`) | **No** — TUI never starts |
| `--no-caffeinate`     | `App.tsx:190` (`createPowerManager({ enabled: () => resilience().caffeinate })`) | **No** — TUI never starts |
| `--help` / `--version`| n/a (handled by parseArgs, exits 0)                    | **N/A** (early exit, wins over create-plan) |

#### Mapping each required case to a test (16 new cases)

| Required case (PLAN.md 1.7)                                  | Test (this iteration)                                            | Behavior                                                                                  | Status   |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| `--create-plan --run`                                        | `--create-plan + --run`                                          | Both stored; `--run` is silently ignored (TUI never starts).                              | OK ↓     |
| `--create-plan --debug`                                      | `--create-plan + --debug`                                        | Both stored; `--debug` is silently ignored.                                               | OK ↓     |
| `--create-plan --resume`                                     | `--create-plan + --resume`                                       | `args.resilience.resume === true`; flag silently ignored.                                 | OK ↓     |
| Other combinations (`--chaos`, `--no-caffeinate`, `--verbose`, `--prompt`) | One test per flag (see test block)                                | All stored; all silently ignored.                                                         | OK ↓     |
| Combined with `--port`, `--plan`, `--model`, `--agent`, `--lang`, `--resilience planTimeoutMs=` | One test per flag                                                 | All honored correctly by `runCreatePlan`.                                                  | OK       |
| Idempotent `--create-plan --create-plan`                     | `--create-plan twice is idempotent`                              | Last-wins on the same field; identical args object.                                       | OK       |
| Order independence                                           | `--create-plan order does not matter relative to other flags`    | Two permutations produce deep-equal args.                                                 | OK       |
| Short + long form equivalence                                | `-c + -r + -d + -p + -m + -a is equivalent to long forms`        | All flags produce identical CLIArgs.                                                      | OK       |
| `--help` / `--version` precedence                            | `--help wins over --create-plan`, `--version wins over --create-plan` | parseArgs hits the help/version case before the create-plan case; early exit 0.        | OK       |

#### Finding 1.7.A — MEDIUM — `--create-plan` silently swallows TUI-only flags; no diagnostic

**Problem.** `parseArgs` is a pure tokenizer and never warns when a
user combines `--create-plan` with flags that the plan-generator
ignores. A user who runs

```
ocloop --create-plan --run
```

expects either (a) the plan to be generated and the loop to start
automatically, or (b) a clear error explaining the combination is
unsupported. Instead, the plan is generated, the user is asked to
approve, and then the process exits (`process.exit(0)` at
`src/index.tsx:322`). The `--run` flag is stored on the args object
but never read, because the TUI code that uses it
(`App.tsx:1135`) never runs.

The same silent-swallow applies to `--debug`, `--verbose`,
`--resume`, `--chaos`, `--no-caffeinate`, and `--prompt` (the last
because `validatePrerequisites` is also skipped in the create-plan
branch — see Finding 1.7.B). All seven flags parse cleanly and the
process exits without a hint that they had no effect.

The blast radius is small (no security impact, no crash, no wrong
output), but the UX cost is real: a user who pastes a "production"
invocation from their shell history into a new terminal and adds
`--create-plan` to it will see the plan get generated and the process
exit with success, leaving them confused about why the loop didn't
start.

**Where.**
- `src/lib/cli-args.ts:162-269` (the entire `parseArgs` function — no
  cross-flag validation)
- `src/index.tsx:320-323` (the create-plan short-circuit)

**Proposed fix.** Add an explicit warning at the top of `main()`,
right after `parseArgs`, that lists TUI-only flags detected in
`args` when `args.createPlan` is set:

```ts
if (args.createPlan) {
  const ignored: string[] = []
  if (args.run)            ignored.push("--run")
  if (args.debug)          ignored.push("--debug")
  if (args.verbose)        ignored.push("--verbose")
  if (args.resilience?.resume)    ignored.push("--resume")
  if (args.resilience?.chaos)     ignored.push("--chaos")
  if (args.resilience?.caffeinate === false) ignored.push("--no-caffeinate")
  if (args.promptFile !== DEFAULTS.PROMPT_FILE) ignored.push("--prompt")
  if (ignored.length > 0) {
    console.error(
      `Note: --create-plan ignores: ${ignored.join(", ")}. ` +
      `These flags only affect the TUI loop, which does not start in plan-generator mode.`,
    )
  }
  await runCreatePlan(args)
  process.exit(process.exitCode ?? 0)
}
```

Note: this is a *non-fatal* warning. The user can still pipe
`2>/dev/null` or `--create-plan --run 2>&1 | grep -v Note` to silence
it. The fix improves discoverability without breaking the "store
everything, decide later" philosophy of `parseArgs`.

**Status.** **NOT FIXED** — documented only. 7 new test cases pin
the current behavior (store-don't-warn) so a future fix is visible as
a behavioral change.

#### Finding 1.7.B — LOW — `--create-plan --prompt X` skips the prompt-file validation

**Problem.** `validatePrerequisites()` at `src/index.tsx:28-57` is
the only place in the program that surfaces a "prompt file not
found" error to the user. It is called at `src/index.tsx:343`, which
is *after* the `args.createPlan` short-circuit at line 320. A user
who runs

```
ocloop --create-plan --prompt /no/such/file.md
```

sees the plan generator start normally, the plan be approved, and
the process exit 0. The `--prompt` value is stored on `args` but
never validated. If the user later runs `ocloop` (without
`--create-plan`), the missing prompt file *will* be caught — but in
the create-plan invocation itself, the user gets no diagnostic.

This is a more specific instance of Finding 1.7.A. The reason it
deserves its own row is that `--prompt` is the only "TUI-only" flag
whose absence-of-validation can have a downstream effect: the
default prompt template is auto-created at `index.tsx:49-55`, but
only in the TUI branch. In create-plan mode, the user's `--prompt`
path is just stored and forgotten, so a typo silently survives the
entire plan-generation session.

**Where.** `src/index.tsx:343` (the `validatePrerequisites(args)`
call is unreachable when `args.createPlan === true`).

**Proposed fix.** Either (a) add `--prompt` to the warning list in
Finding 1.7.A's fix, or (b) call `validatePrerequisites` *before* the
create-plan short-circuit, so a missing `--prompt` fails fast for
both modes. Option (b) is cleaner but would force a re-think of
whether `--create-plan` should require a valid prompt file at all
(currently it doesn't need one — the plan generator doesn't use it).

**Status.** **NOT FIXED** — documented only. The new test
`--create-plan + --prompt: parsed but not validated` pins the
current behavior.

#### Finding 1.7.C — INFO — `--create-plan` cannot be used to "resume" a previous plan-generation

`--resume` is the only resilience flag that is semantically tied to
a *previous* session (the `if (resilience().resume) { reconcile ... }`
at `App.tsx:1119`). `--create-plan --resume` parses cleanly but the
resume only makes sense for an in-flight loop session, not for the
plan generator — `runCreatePlan` always creates a fresh
`client.session.create({})` (index.tsx:167) and never reads
`args.resilience.resume`. A user who interrupted a long plan-gen
session with Ctrl-C cannot resume it; the next `ocloop --create-plan`
starts a brand-new generator session.

This is **INFO**, not a bug, because plan-gen is intended to be
quick (default `planTimeoutMs` is 10 minutes, see
`DEFAULT_RESILIENCE`) and resumability is out of scope. The point of
the audit row is to make the limitation visible so a future user
issue ("how do I resume my plan?") can be answered with a doc
pointer rather than a code dive.

#### Finding 1.7.D — INFO — `--create-plan` short-circuits before `log.sessionStart`

The non-create-plan branch logs the CLI args and plan-file status
before rendering (index.tsx:326-340). The create-plan branch
(`index.tsx:320-323`) returns *before* the `log.sessionStart` call,
so a `--create-plan` session produces no log entry. This is
intentional (the headless flow does not need the same audit trail as
the TUI), but it does mean a user cannot inspect the log to confirm
which flags were active. A `--create-plan` user who wants the same
visibility would need to add their own logging inside
`runCreatePlan`. **No change needed** — out of scope for this audit.

#### Finding 1.7.E — INFO — `--create-plan --lang` works through the pre-branch locale resolution

`setLocale(...)` is called at `src/index.tsx:316` *before* the
`if (args.createPlan)` check at line 320. This means `--lang es
--create-plan` does affect the language of every `t()` string in
`runCreatePlan` (the goal prompt, the approval prompt, the "saved"
message, the error messages). This is a "silent but correct"
behavior: the user is unlikely to be surprised, but the chain
"CLI flag → setLocale → runCreatePlan → t()" spans three layers
and is worth documenting. **No change needed.**

#### Finding 1.7.F — INFO — `--create-plan --help` and `--create-plan --version` exit early

`--help` and `--version` are handled in their own `case` branches
*before* the `default` branch falls through. The for-loop in
`parseArgs` iterates left-to-right, so `--create-plan --help`
hits the help case on the second iteration and calls
`process.exit(0)` (via `showHelp()` at line 67) before any
create-plan-specific code can run. Same for `--version`. The new
tests `--help wins over --create-plan` and `--version wins over
--create-plan` pin this so a future refactor that reorders cases
(e.g. moves the create-plan case earlier) is visible as a
behavioral change. **No change needed.**

#### Finding 1.7.G — INFO — `--create-plan` cannot be combined with positional args (and is not, anywhere)

The `default` case in `parseArgs` (line 258-261) rejects any
positional argument with `"Error: unknown argument"`. This is
intentional — the CLI does not collect a position remainder (see
section 1.10) — and applies uniformly to `--create-plan` invocations
as well. There is no concept of `ocloop --create-plan foo.md`
meaning "create a plan called foo.md"; the user must use
`--plan foo.md` explicitly. **No change needed.**

#### Summary

| Severity | Count | Notes                                                              |
| -------- | ----- | ------------------------------------------------------------------ |
| CRITICAL | 0     |                                                                    |
| HIGH     | 0     |                                                                    |
| MEDIUM   | 1     | 1.7.A — `--create-plan` silently swallows TUI-only flags (not fixed, documented) |
| LOW      | 1     | 1.7.B — `--create-plan --prompt` skips prompt validation (not fixed, documented) |
| INFO     | 5     | 1.7.C (no plan-gen resume), 1.7.D (no log entry), 1.7.E (locale works), 1.7.F (help/version win), 1.7.G (no positional) |

`bun test src/lib/cli-args.test.ts` → **134 pass, 0 fail, 305 expect() calls**
(was 118/0/264 before this iteration). New describe block:
- `parseArgs — --create-plan + other flag combinations (Phase 1 Task 1.7)` — 16 cases.

---

### 1.8 — Audit `--resume` combined with `--run`, `--create-plan`, and standalone behavior

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL findings. Two MEDIUM cross-references (1.7.A and the new 1.8.A), one LOW, and five INFO observations.**

`--resume` is a pure boolean flag handled at `src/lib/cli-args.ts:237-239`:

```ts
case "--resume":
  resilience.resume = true
  break
```

No token is consumed; no other field on `args` is touched. The only
runtime reader is `App.tsx:1119` inside the TUI's `onMount` effect:

```ts
if (resilience().resume) {
  await doResume(persisted)
}
```

…and only after `loadLoopState()` (line 1112) returns a non-null
`PersistedLoopState` with `iteration > 0`. In other words, `--resume`
*alone* does nothing at startup if no `.loop-state.json` exists — the
flag is conditional on prior persisted state.

#### Standalone behavior

`--resume` sets exactly one field:

```ts
{ promptFile: DEFAULTS.PROMPT_FILE, planFile: DEFAULTS.PLAN_FILE, resilience: { resume: true } }
```

It does not consume the next token (it is not a value flag), it does
not cause a server restart, it does not block on persisted state, and
it does not exit early. The "resume" is a *TUI onMount decision* — the
flag is read once at startup, the persistence file is loaded, and the
loop either auto-resumes (if `--resume` was passed and state exists) or
shows a confirmation dialog (if state exists but `--resume` was not
passed). The new test `--resume alone: sets only resilience.resume = true`
pins the full args shape so a future refactor that adds a side-effect
to the `--resume` case is visible as a behavioral change.

#### Cross-flag combinations — where `--resume` is read vs ignored

The two layers that matter:

| Layer | What it does with `args.resilience.resume`                                |
| ----- | ------------------------------------------------------------------------- |
| `parseArgs` (cli-args.ts:237-239) | Stores `resilience.resume = true` unconditionally. |
| TUI onMount (App.tsx:1112-1119) | Reads it once, *only* if `loadLoopState()` returned a non-null state with `iteration > 0`. |
| `runCreatePlan` (index.tsx:136-261) | Never reads it. |

The matrix of combinations:

| Combination                                  | parseArgs | TUI onMount reads it?             | Effective behavior                               |
| -------------------------------------------- | --------- | --------------------------------- | ------------------------------------------------ |
| `--resume` alone (no state file)             | stored    | skipped (no persisted state)      | Flag is a no-op. TUI starts normally.            |
| `--resume` alone (with state file)           | stored    | yes — `doResume(persisted)`        | Auto-resumes the in-flight iteration.            |
| `--resume --run` (with state file)           | stored    | yes — resume runs                  | Resume *and* `dispatch({ type: "start" })` both fire (App.tsx:1135). |
| `--resume --run` (no state file)            | stored    | skipped (no persisted state)      | `--run` is the only effective flag.              |
| `--resume --create-plan`                     | stored    | unreachable (TUI never renders)   | `--resume` is silently ignored (Finding 1.7.A's class). |
| `--resume --debug`                           | stored    | yes — debug mode but resume still fires | Both run; debug also skips plan validation (App.tsx:980). |
| `--resume --chaos`                           | stored    | yes — but `chaos && debug` gate at App.tsx:225 must be true | `createChaos` constructed only if `--debug` is also set. |

#### Mapping each required case to a test (26 new cases)

| Required case (PLAN.md 1.8)                                              | Test (this iteration)                                              | Behavior                                                                                  | Status   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------- |
| `--resume` alone                                                        | `--resume alone: sets only resilience.resume = true`               | Stores the boolean, no other fields touched.                                              | OK       |
| `--resume` does not consume the next token                              | `--resume does not consume the next token (it's a pure boolean)`  | `--resume --debug` stores both correctly; `typeof resume === "boolean"`.                  | OK       |
| `--resume` is the last token (no following value)                       | `--resume as the last token (no following value) does not error`  | The case body has no `argv[++i]`; safe at the boundary.                                   | OK       |
| `--resume + --run` (TUI: start iterating AND auto-resume)               | `--resume + --run: both flags stored, no conflict in parseArgs`    | Both stored; both read at runtime.                                                        | OK ↓     |
| `--run --resume` ↔ `--resume --run` (order independence)                | `--run --resume order matches --resume --run`                     | Deep-equal args.                                                                          | OK       |
| `--resume + --run + --debug` (all three together)                       | `--resume + --run + --debug: all three flags stored independently` | All three stored; debug also disables plan validation.                                    | OK       |
| Short/long equivalence: `-r -d --resume`                                | `--resume + short forms -r -d: same shape as long forms`           | `-r`/`-d`/`--resume` match their long forms.                                              | OK       |
| `--resume + --create-plan` (create-plan swallows --resume)              | `--resume + --create-plan: both parsed, --resume is silently ignored` | Both stored; --resume is silently ignored (1.7.A class).                                  | OK ↓     |
| `--create-plan --resume` order vs `--resume --create-plan`              | `--create-plan --resume order: same args as --resume --create-plan` | Deep-equal.                                                                               | OK       |
| `--create-plan -c --resume` (short create-plan)                         | `--create-plan -c --resume: short form -c, long form --resume`     | `--create-plan --create-plan` is also a no-op (last-wins on the same value).              | OK       |
| `--resume + --chaos` (resilience keys merge)                            | `--resume + --chaos: both keys coexist on resilience object`       | `{ resume: true, chaos: true }`.                                                          | OK       |
| `--resume + --no-caffeinate` (caffeinate=false merges)                 | `--resume + --no-caffeinate: caffeinate=false and resume=true coexist` | `{ resume: true, caffeinate: false }`.                                                    | OK       |
| `--resume + --chaos + --no-caffeinate` (all three resilience flags)     | `--resume + --chaos + --no-caffeinate: all three merge on resilience` | All three stored on the same object.                                                      | OK       |
| `--resume + --resilience resume=false` (explicit override)              | `--resume + --resilience resume=false: explicit override flips the boolean` | Last-wins: explicit false clears the implicit true.                                       | OK       |
| `--resilience resume=true + --resume` (same value, last-wins)           | `--resilience resume=true + --resume: same value, no observable change` | No-op; deep-equal to `--resume` alone.                                                    | OK       |
| `--port --resume` (port's value not stolen by --resume)                 | `--port --resume: --port's value is not stolen by --resume`        | `--port` is a value flag, errors when its value is `--resume`.                            | OK       |
| `--resume --port 4096` (no interaction)                                 | `--resume --port 4096: --resume stores true, --port gets 4096`     | Both stored correctly.                                                                    | OK       |
| `--resume --prompt X --plan Y`                                           | `--resume --prompt X --plan Y: all three stored independently`      | All three stored; no stealing.                                                            | OK       |
| `--resume --model --agent`                                              | `--resume --model --agent: both value flags get their values`       | All three stored.                                                                         | OK       |
| `--resume --lang es`                                                    | `--resume --lang es: --resume stored, --lang stored, no interaction` | Both stored.                                                                              | OK       |
| Idempotent `--resume --resume`                                          | `--resume --resume is idempotent (last-wins on same value)`         | Same value, no observable change.                                                         | OK       |
| `--resume --resilience resume=true` is identical to `--resume`          | `--resume + --resilience resume=true: same value, no observable change` | Deep-equal.                                                                               | OK       |
| `--resume` + every other flag (kitchen sink)                            | `--resume with every other flag combined: stores all of them`       | Stores all 12 fields exactly. The case that would fail loudest if --resume ever consumed a token. | OK       |
| `--help` wins over `--resume`                                           | `--help wins over --resume (exits 0, prints usage)`                 | parseArgs hits the help case on the second iteration.                                     | OK       |
| `--version` wins over `--resume`                                        | `--version wins over --resume (exits 0, prints version)`            | parseArgs hits the version case on the second iteration.                                  | OK       |
| argv is not mutated when `--resume` is present                          | `parseArgs does not mutate argv when --resume is present`           | The new boolean case body has no `argv[++i]`.                                             | OK       |

#### Finding 1.8.A — MEDIUM — Cross-reference to 1.7.A: `--resume` is silently swallowed by `--create-plan`

This is a *new instance* of Finding 1.7.A (--create-plan silently
swallows TUI-only flags). `args.resilience.resume` is read only at
`App.tsx:1119` (TUI onMount); in `--create-plan` mode, `main()`
short-circuits into `runCreatePlan()` at `src/index.tsx:320-323` and
calls `process.exit()` before the TUI mounts. The flag is parsed
and stored, but the user gets no diagnostic.

The new test `--resume + --create-plan: both parsed, --resume is
silently ignored` pins this. The proposed fix is the same as
1.7.A's: a non-fatal warning in `main()` listing the TUI-only
flags detected in `args` when `args.createPlan` is set. `--resume`
would be added to the ignored list (alongside `--run`, `--debug`,
`--verbose`, `--chaos`, `--no-caffeinate`, `--prompt`).

**Where.** Same files as 1.7.A (`src/lib/cli-args.ts:162-269`,
`src/index.tsx:320-323`).

**Status.** **NOT FIXED** — documented only.

#### Finding 1.8.B — LOW — `--resume` with no persisted state is a silent no-op (not a no-op in parseArgs, but in the TUI)

`--resume` parses fine and stores `resilience.resume = true`. At
runtime, `App.tsx:1112` calls `loadLoopState()` and the `if
(resilience().resume)` branch at line 1119 is *only* reached when
`persisted && persisted.iteration > 0`. If no `.loop-state.json`
exists (clean run, fresh clone, etc.), `--resume` is parsed and
stored, but produces zero observable effect.

This is **intentional** (the resume path must not auto-resume a
non-existent session) and the user *does* get a normal TUI startup,
so the cost is small. But the flag is "lossy" in the same sense as
Finding 1.7.A: the user has no way to know that `--resume` was a
no-op because the only signal is "the loop started normally" — the
same outcome as if they had not passed `--resume` at all.

A user who pastes `ocloop --resume` from a shell history (perhaps
expecting a "check the last run" feature) will see the loop start
clean and may not realize that the flag was parsed-and-ignored.

**Where.** `src/App.tsx:1112-1119` (the TUI onMount effect).

**Proposed fix.** Add a log.info line *before* the `if
(resilience().resume)` check that records whether `--resume` was
seen and whether persisted state exists, so the loop's startup log
makes the no-op visible to anyone reading `.loop.log`. (e.g.
`log.health("startup", "--resume requested", { hasPersisted: !!persisted })`).
This is a non-functional improvement; no behavior change.

**Status.** **NOT FIXED** — documented only. The new tests
`--resume alone: sets only resilience.resume = true` and the
matrix above pin the parseArgs-level contract; the runtime-level
no-op is described here.

#### Finding 1.8.C — INFO — `--resume` does not validate that the persisted state's `sessionId` is alive

`loadLoopState()` (loop-state-store.ts:62-79) returns a
`PersistedLoopState` object on disk without checking whether the
`sessionId` it references is still in a usable state on the
OpenCode server. The reconcile-and-continue logic in `doResume`
(used at App.tsx:1120) is responsible for that check. This is a
downstream concern from `parseArgs` and out of scope for the
Phase 1 CLI audit, but the chain is worth noting for the
crash-recovery audit in Phase 8. **No change needed here.**

#### Finding 1.8.D — INFO — `--resume` and `--no-caffeinate` target the same `resilience` object but have no semantic conflict

`--resume` writes `resilience.resume = true` and `--no-caffeinate`
writes `resilience.caffeinate = false`. Both keys live on the
same partial config object, but they target orthogonal runtime
behaviors (resume path vs. power manager). The new test
`--resume + --no-caffeinate: caffeinate=false and resume=true coexist`
pins this. **No change needed.**

#### Finding 1.8.E — INFO — `--resume` is one of the very few flags where order matters at the parseArgs level

`--port --resume` fails (port consumes `--resume` as its value and
errors), but `--resume --port 4096` succeeds. This is a
general value-flag-after-boolean-flag property (the same applies
to `--port --debug`, `--port --run`, etc.) and is pinned by the
existing line-213 test pattern (`${flag} --debug errors...`) for
`--plan`/`--prompt`/`--agent`. The new test
`--port --resume: --port's value is not stolen by --resume`
extends this coverage to the `--resume` case. **No change needed.**

#### Finding 1.8.F — INFO — `--resume` is consumed by `parseArgs` only once (the case body has no `argv[++i]`)

This is the structural reason `--resume` is a true boolean: the
case body is `resilience.resume = true` with no `argv[++i]`.
If a future refactor accidentally added a value consumer (e.g.
`args.resumePath = requireValue(argv[++i], "--resume")`), every
existing test in the new describe block (and every test in
section 1.1's existing tests that combine `--resume` with other
flags) would fail because the next token would be consumed.
This is the kind of invariant that is best protected by tests
— which is why the new describe block is large. **No change
needed.**

#### Finding 1.8.G — INFO — `--resume` and `--resilience resume=...` interact via last-wins

Explicit `--resilience resume=...` overrides the implicit `true`
from `--resume` (and vice versa), same as the `--no-caffeinate`
+ `--resilience caffeinate=true` interaction pinned at
line 198. This is the documented behavior of the partial
`ResilienceConfig` merge in `applyResilienceOverride`. The
new tests
`--resume + --resilience resume=false: explicit override flips the boolean`
and
`--resilience resume=true + --resume: same value, no observable change`
document the two directions. **No change needed.**

#### Summary

| Severity | Count | Notes                                                              |
| -------- | ----- | ------------------------------------------------------------------ |
| CRITICAL | 0     |                                                                    |
| HIGH     | 0     |                                                                    |
| MEDIUM   | 1     | 1.8.A — `--create-plan --resume` silently ignored (cross-ref 1.7.A, not fixed, documented) |
| LOW      | 1     | 1.8.B — `--resume` with no persisted state is a silent runtime no-op (not fixed, documented) |
| INFO     | 5     | 1.8.C (no sessionId aliveness check in loadLoopState), 1.8.D (no conflict with --no-caffeinate), 1.8.E (order matters for value flags after bool), 1.8.F (case body is value-free), 1.8.G (last-wins with --resilience resume=) |

`bun test src/lib/cli-args.test.ts` → **160 pass, 0 fail, 365 expect() calls**
(was 134/0/305 before this iteration). New describe block:
- `parseArgs — --resume combined with --run, --create-plan, standalone (Phase 1 Task 1.8)` — 26 cases.

`bun test` (full suite) → **455 pass, 0 fail, 1066 expect() calls**
(was 429/0/1001 before this iteration). +26 tests, +60 expects, all green.

---

### 1.9 — Document: `requireValue` treats a value starting with `-` (except lone `-`) as missing

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL/MEDIUM/LOW findings. Six INFO observations.**

The `requireValue` helper at `src/lib/cli-args.ts:137-143` is a single, simple
gate used by three callers (`--agent`, `--prompt`, `--plan`):

```ts
function requireValue(value: string | undefined, flag: string): string {
  if (!value || (value.startsWith("-") && value !== "-")) {
    console.error(`Error: ${flag} requires a value`)
    process.exit(1)
  }
  return value
}
```

The rule is two-part:
1. **Reject** if the value is `undefined` (the next token doesn't exist — the
   flag is the last one in argv) or `""` (the shell-quoted empty arg).
2. **Reject** if the value starts with `-` AND has length > 1 (i.e. it looks
   like another flag, e.g. `--debug`, `-d`, `--chaos`). This is the
   diagnostic case: a user typing `ocloop --plan --debug` almost certainly
   meant two flags, not a plan file named "--debug".

The **lone `-`** (length 1) is the explicit escape hatch. `-` is a legal
filename on every Unix-like filesystem (the standard `stdin`/`stdout`
convention) and a user with a file literally named `-` in the working
directory must be able to reference it without being told "looks like a flag,
try again".

#### The two required PLAN.md cases

| Required case (PLAN.md 1.9)                                  | Test (this iteration)                                                | Behavior                                                                | Status |
| ------------------------------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------ |
| `--plan --debug` is rejected (no silent flag swallowing)     | `PLAN.md 1.9: --plan --debug is rejected (the diagnostic case)`      | Exits 1 with `Error: --plan requires a value`.                          | OK     |
| `--plan -` is accepted (lone dash is a valid filename)       | `PLAN.md 1.9: --plan - is accepted (the lone-dash escape hatch)`     | Exits 0; `args.planFile === "-"`.                                       | OK     |

#### Why the rule is correct (and what the tests pin)

The `requireValue` rule trades one kind of error (silent mis-parse) for
another (loud rejection). The 37 new test cases in this iteration pin the
trade-off so a future refactor that loosens or tightens the rule is visible
as a behavioral change.

**The 37 new cases cover five surfaces:**

1. **The lone-dash ACCEPT case for every caller.** Existing tests at
   line 524-537 cover `--prompt -` and `--plan -`; the new test
   `accepts --agent - (lone dash is a valid filename per requireValue)`
   extends coverage to the third caller (`--agent`). All three callers
   go through the same helper, so the behavior must be identical.

2. **The short-flag REJECT matrix.** A value starting with `-X` (single
   letter) must be rejected just as `--debug` is rejected. The 12 cases
   cover every combination of the three value flags × the four most
   common short forms (`-d`, `-r`, `-c`, `-a`/`-h`/`-m`/`-p`). Without
   this, a user typing `ocloop --plan -d` would get `args.planFile =
   "-d"` and `-d` would silently vanish.

3. **The long-flag REJECT matrix.** A value starting with `--X` (any
   long-form flag the project actually defines) must be rejected. The
   16 cases extend the existing `--debug` coverage to `--chaos`,
   `--verbose`, `--resume`, `--no-caffeinate`, `--create-plan`, `--lang`,
   `--model`, and `--resilience`. The error must come from
   `requireValue` (not from the helper for the *next* flag) — the
   message embeds the *requesting* flag, not the value-shaped one.

4. **Cross-flag uniformity.** The new test
   `the same --debug rejection fires for every value flag (uniformity)`
   confirms that `--prompt`, `--plan`, and `--agent` all produce the
   same error format (`"<flag> requires a value"`). If a future refactor
   hardcoded the message or used a different helper for one of the
   three, this test would fail.

5. **Boundary with the inline-reading value flags.** `--port` and
   `--model` do NOT use `requireValue`; they read their value inline
   (`parsePort` at line 119-130, `parseModel` at line 145-157) and
   apply their own stricter regex check first. The new tests
   `--port --debug is rejected by parsePort, not by requireValue` and
   `--model --debug is rejected by parseModel, not by requireValue`
   pin the boundary: `--port --debug` exits 1 with a `parsePort`
   message ("`--port requires a full integer argument`"), not a
   `requireValue` message. A future refactor that unifies them would
   be visible as a behavioral change in the error wording.

#### Mapping every audit case to a test

| Audit case                                                       | Test                                                                  | Behavior                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `--plan --debug` rejected                                        | `PLAN.md 1.9: --plan --debug is rejected (the diagnostic case)`       | Exits 1; "Error: --plan requires a value".                            |
| `--plan -` accepted                                              | `PLAN.md 1.9: --plan - is accepted (the lone-dash escape hatch)`      | Exits 0; `args.planFile === "-"`.                                     |
| `--agent -` accepted                                             | `accepts --agent - (lone dash is a valid filename per requireValue)`  | Exits 0; `args.agent === "-"`.                                        |
| Short-flag matrix (12 cases)                                     | `rejects <flag> -X` parameterized tests                               | Exits 1; "<flag> requires a value".                                   |
| Long-flag matrix (16 cases)                                      | `rejects <flag> --X` parameterized tests                              | Exits 1; "<flag> requires a value".                                   |
| Cross-flag uniformity                                            | `the same --debug rejection fires for every value flag`               | All three flags produce the same error format.                       |
| `--port --debug` rejected by `parsePort` (boundary)              | `--port --debug is rejected by parsePort, not by requireValue`        | Exits 1; "Error: --port requires a full integer argument".            |
| `--model --debug` rejected by `parseModel` (boundary)            | `--model --debug is rejected by parseModel, not by requireValue`      | Exits 1; "Error: --model expects provider/model...".                  |
| Error message names the requesting flag                          | `error message names the requesting flag`                             | Exits 1; the full message is exactly `Error: --plan requires a value`. |
| Value with embedded dash accepted (rule is `startsWith`, not `includes`) | `accepts a value that starts with letters but contains a dash mid-string` | Exits 0; `args.planFile === "build-artifacts/v1.md"`. |
| Value with `--` in the middle accepted (not the first char)      | `accepts a value that starts with -- in the middle`                   | Exits 0; `args.planFile === "x--debug"`.                              |

#### Finding 1.9.A — INFO — The `requireValue` rule is deliberate and well-tested

The function header comment at `src/lib/cli-args.ts:132-136` states the
intent explicitly:

```ts
/**
 * Consume the next token as a flag's value. Errors if it's missing OR looks like
 * another flag (starts with `-`, except a lone `-`), so `--prompt --debug` fails
 * loudly instead of setting promptFile to "--debug" and silently dropping --debug.
 */
```

The 37 new tests added in this iteration pin every branch of the rule.
The original 4 tests at line 211-218 (--flag --debug) and line 524-537
(--flag -) cover the two extreme cases. Combined coverage:
- 3 callers × ~12 rejection shapes = 36 negative cases.
- 3 callers × 1 lone-dash accept = 3 positive cases.
- 2 inline-reader boundary cases (--port, --model).
- 1 uniformity case.
- 2 negative tests (legitimate values that LOOK like they could trip).
- 1 error-message-format case.
= **45 explicit cases** covering the rule.

The rule is **sound**. There is no MEDIUM/LOW finding to fix. The only
behavioral concern — the silent-parse footgun — is prevented by
construction. **No change needed.**

#### Finding 1.9.B — INFO — `requireValue` does not catch the symmetric "value contains `=`" case (out of scope)

A user typing `ocloop --prompt foo=bar.md` would have `args.promptFile =
"foo=bar.md"` stored verbatim. There is no rule against `=` in a value
because paths on real filesystems can legally contain `=` (the kernel
treats it as a regular byte). This is the correct behavior — the `=`
filter lives in `applyResilienceOverride` (line 78) where it is
semantically meaningful. `requireValue` correctly stays out of the
value-content validation business. **No change needed.**

#### Finding 1.9.C — INFO — The error message does not name the offending token

`Error: --plan requires a value` does not include the value the parser
*thought* the user meant. A user who types `ocloop --plan --debug` gets
the same message as one who types `ocloop --plan` with no following
arg. The latter is missing a value; the former has a value that *looks*
like a flag. Both are the same class of "your flag is missing its
value" error, so collapsing them is reasonable.

A more diagnostic message would be `Error: --plan requires a value
(got "--debug" which looks like another flag)`, but the cost is a
longer message and the benefit is marginal — the user sees the error,
looks at their command, and notices the missing value within a second.
**No change needed.**

#### Finding 1.9.D — INFO — The lone-dash exception is positional, not semantic

The check `value !== "-"` is purely a string comparison. A user who
types `ocloop --plan "-"` (quoted) and a user who types `ocloop
--plan -` (unquoted) get exactly the same args object. The shell is
responsible for the quoting — `parseArgs` only sees the post-shell
argv. This is the correct separation of concerns; the rule is
documented in the function header, and a test (line 533-537, plus the
new `--agent -` test) pins it. **No change needed.**

#### Finding 1.9.E — INFO — No test for the case where the offending value is also a real filename

There is no test for `ocloop --plan "-debug"` (a file literally named
`-debug`, which would be a single-dash short-form-looking filename that
is, in fact, a valid filename on Unix). Under the current rule,
`args.planFile` would be `"-debug"` — silently accepted. A user with
such a file cannot pass it via `parseArgs`.

This is a **deliberate trade-off**: supporting `-X` filenames would
require the user to use a different escape (e.g. `./-debug`) or the
shell to disambiguate. The current rule errs on the side of "flag
shapes are rejected" because the false-positive cost (a confusing
error message) is much lower than the false-negative cost (a silent
mis-parse that drops a real flag). **No change needed** — the trade-off
is acceptable for a tool whose values are typically `.md` filenames.

#### Finding 1.9.F — INFO — `requireValue` is shared but the message is per-call

`requireValue(argv[++i], "--agent")` (line 197) passes the flag name as
the second argument, so the error message always names the *actual*
flag the user typed, not a generic "an argument". This is the right
choice: a user who pastes a long command and gets an error needs the
message to point at the specific flag. Pinned by the new
`error message names the requesting flag` test. **No change needed.**

#### Summary

| Severity | Count | Notes                                                                       |
| -------- | ----- | --------------------------------------------------------------------------- |
| CRITICAL | 0     |                                                                             |
| HIGH     | 0     |                                                                             |
| MEDIUM   | 0     |                                                                             |
| LOW      | 0     |                                                                             |
| INFO     | 6     | 1.9.A (rule deliberate & well-tested), 1.9.B (= not in scope), 1.9.C (no offending token in message), 1.9.D (lone-dash positional), 1.9.E (no `-X` filename support, deliberate), 1.9.F (message per-call) |

`bun test src/lib/cli-args.test.ts` → **198 pass, 0 fail, 446 expect() calls**
(was 160/0/365 before this iteration). New describe block:
- `parseArgs — requireValue lone-dash and flag-shaped semantics (Phase 1 Task 1.9)` — 38 cases.

`bun test` (full suite) → **493 pass, 0 fail, 1147 expect() calls**
(was 455/0/1066 before this iteration). +38 tests, +81 expects, all green.

---

### 1.10 — Other observations on the file (cross-cutting, audit-wide)

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

---

### 1.11 — Verify `parseArgs` is idempotent — calling it twice produces the same result

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL/MEDIUM/LOW findings. One INFO observation.**

`parseArgs` is the public entry point used by every CLI invocation
(`src/index.tsx:311`) and by every test in `src/lib/cli-args.test.ts`. The
contract consumers depend on is "same input → same output, no observable
side effects". The `does not mutate argv` test (line 238) is the weak half of
that contract; the strong half is that the **returned** `CLIArgs` object is
also a pure function of the input.

#### Why this matters (vs. the existing line 238 test)

The line 238 test (`parseArgs does not mutate the input argv array`) covers
the **input** side: argv must be the same after the call. This audit covers
the **output** side: two calls with the same input must produce two
deeply-equal `CLIArgs` objects. The two are not equivalent — a future
refactor could leave argv intact but start populating a module-level cache,
a counter, or a `WeakMap` that would only be visible by calling twice.

The implementation review (`src/lib/cli-args.ts:162-269`) confirms there is
no such hidden state:

- The function creates a fresh `args: CLIArgs` literal at line 163 and a
  fresh `resilience: Partial<ResilienceConfig>` literal at line 168 on
  every call. There are no module-level mutable variables read inside the
  function body.
- The only mutation is on these fresh locals (`args.port = …`,
  `resilience.resume = true`, etc.) plus the `target` parameter in
  `applyResilienceOverride` (line 74), which is the caller's own `resilience`
  literal — also fresh.
- `argv[++i]` (lines 186, 192, 197, 201, 205, 229, 250) writes to the loop
  counter `i`, which is a local `let` — not to the `argv` array. This is
  why the line 238 test passes.
- `process.exit(...)` (called from `showHelp`, `showVersion`, `parsePort`,
  `parseModel`, `requireValue`, `applyResilienceOverride`, and the
  `default` case) terminates the process; it cannot leak state across
  calls because the process no longer exists after the call. The only
  observable effect is console output, which is captured by `runParse` in
  the test harness and ignored in production.

#### Mapping the new tests to the requirement

| Required case (PLAN.md 1.10)                                            | Test                                                                       | Result       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------ |
| Calling `parseArgs` twice with the same input produces the same result. | `parseArgs is idempotent on an empty argv (PLAN.md 1.10)`                 | OK — equal   |
| Same, with at least one boolean flag set.                               | `parseArgs is idempotent on a single boolean flag (PLAN.md 1.10)`         | OK — equal   |
| Same, with the full flag set exercising every switch case.              | `parseArgs is idempotent on the full flag set (PLAN.md 1.10)`             | OK — equal   |
| argv must be unchanged after MANY calls (accumulation guard).           | `parseArgs repeated calls keep the input argv identical (PLAN.md 1.10)`    | OK — equal   |

The "empty argv" and "single boolean flag" cases also assert that the two
returned objects have distinct **identity** (`expect(a).not.toBe(b)`).
Distinct identity plus deep equality is the strongest possible pinning:
the function allocates a fresh `CLIArgs` on every call, so a future
refactor that memoized and returned the same object across calls would
fail this assertion immediately.

#### Finding 1.11.A — INFO — `parseArgs` is pure & idempotent (now formally verified)

`parseArgs` is a pure function of its input. Two calls with the same argv
return deeply-equal `CLIArgs` objects with distinct object identity, and
argv itself is unchanged across an arbitrary number of calls. This holds
across the empty case, the boolean-only case, and the full flag set
(every value flag + every boolean flag + every resilience flag). The
stronger of these checks (object identity + deep equality on the full
flag set) is the canonical "is this function pure?" assertion, and it
passes. **No code changes required.**

#### Test-suite delta for Task 1.10

The `Phase 3 edge cases` describe block grew from 7 cases to 11 cases
(+4 new idempotency assertions). The file-level total went from 198
to 202 tests. New describe block entries:

- `parseArgs is idempotent on an empty argv (PLAN.md 1.10)` — pure-function assertion + object identity check.
- `parseArgs is idempotent on a single boolean flag (PLAN.md 1.10)` — same, with a flag set.
- `parseArgs is idempotent on the full flag set (PLAN.md 1.10)` — covers every code path in the switch.
- `parseArgs repeated calls keep the input argv identical (PLAN.md 1.10)` — accumulation guard (5 calls in a row).

`bun test src/lib/cli-args.test.ts` → **202 pass, 0 fail, 452 expect() calls**
(was 198/0/446 before this iteration). +4 tests, +6 expects, all green.

---

## Phase 2 — Plan File Parsing & Progress Tracking

Source: `src/lib/plan-parser.ts` · Tests: `src/lib/plan-parser.test.ts`

### 2.1 — Audit `parseTaskLine` for every task marker variant

**Status: COMPLETE — VERIFIED, no HIGH/CRITICAL/MEDIUM/LOW findings. Three INFO
observations, one documented footgun, and one design choice worth pinning.**

The function (`src/lib/plan-parser.ts:20-89`) is a single linear scan that
extracts the checkbox contents between the first `- [` and the first `]`,
normalises whitespace, and routes to one of five return shapes:

| Return `type`   | Triggers                                                    |
| --------------- | ----------------------------------------------------------- |
| `completed`     | `checkboxContent` is exactly `x` or `X` (case-sensitive)    |
| `manual`        | `checkboxContent === "MANUAL"` (any case) OR `[MANUAL]` tag |
| `blocked`       | `checkboxContent` starts with `BLOCKED` (any case) OR `[BLOCKED]` tag |
| `pending`       | `checkboxContent === ""` AND there is a non-empty description after the `]` |
| `not-a-task`    | Anything else: line doesn't start with `- [`, no closing `]`, unknown marker, or bare empty checkbox with no description |

The function is pure, has no side effects, no module state, and the
existing 11 test cases cover the major shapes. The audit below walks every
variant called out in PLAN.md 2.1 plus the variants naturally adjacent to
each one, and pins the behavior with new test cases.

#### 2.1.A — INFO — Every variant in the PLAN.md 2.1 list is handled correctly

The 9 specific variants listed in the PLAN.md task, plus the implied
companion variants, all return the expected shape:

| PLAN.md 2.1 variant                  | Result                                                                                | Pinned by new test (this iteration)                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `- [x]`                              | `completed` with description                                                          | `should parse completed tasks` (pre-existing)                              |
| `- [X]`                              | `completed` with description                                                          | `should parse completed tasks` (pre-existing)                              |
| `- [x ]` (trailing space)            | `completed` — `.trim()` normalises `checkboxContent`                                  | `accepts - [x ] (trailing space inside brackets) with description`         |
| `- [ ]`                              | `pending` with description; `not-a-task` when bare                                    | `should parse pending tasks`, `should return not-a-task for invalid lines` |
| `- [ ] [MANUAL]`                     | `manual`                                                                              | `should parse MANUAL tasks as tag after checkbox` (pre-existing)           |
| `- [MANUAL]`                         | `manual`                                                                              | `should parse MANUAL tasks in checkbox` (pre-existing)                     |
| `- [BLOCKED:reason]`                 | `blocked` with `blockedReason = "reason"`                                             | `should parse BLOCKED tasks in checkbox` (pre-existing)                    |
| `- [ BLOCKED ]` (with spaces)        | `blocked` — `.trim()` strips the inner whitespace                                     | `accepts - [ BLOCKED ] (spaces inside brackets, no description)`           |
| `- [blocked]` (lowercase)            | `blocked` — the `/i` flag normalises case                                             | `accepts - [blocked] (lowercase) with description`                         |

All 9 cases return the documented shape, no exceptions, no silent
misclassifications. The function behaves as advertised.

#### 2.1.B — INFO — Empty checkbox has a documented, intentional split

The empty checkbox `- [ ]` has two valid interpretations in PLAN.md:

- `- [ ] ` *with* a description after the `]` → `pending` (real work to do).
- `- [ ]` *without* a description → `not-a-task` (no actionable content).

The split is explicit in the source (`plan-parser.ts:80-85`):

```ts
if (checkboxContent === "") {
  if (!afterCheckbox) {
    return { type: "not-a-task", description: "" }
  }
  return { type: "pending", description: afterCheckbox }
}
```

A bare empty checkbox is excluded from `parsePlan`'s `total` count, so a
plan with only empty checkboxes returns `percentComplete = 100` (the
"denominator is zero" path, also documented at `plan-parser.ts:139-142`).
This is the correct semantic: there is nothing for the loop to do, so the
plan is complete from the loop's perspective. **No code change needed.**

The 5 new tests `PLAN.md 2.1 — empty-checkbox variants` pin both branches
plus three boundary cases: trailing whitespace only, extra internal
whitespace, and zero internal whitespace. All five return `not-a-task` as
expected.

#### 2.1.C — INFO — Trailing-space tolerance in the checkbox is a feature, not a bug

`- [x ]`, `- [X ]`, `- [ MANUAL ]`, and `- [ BLOCKED ]` are all accepted.
The implementation normalises with `checkboxContent = trimmed.slice(3,
closeBracket).trim()` (line 35), so a single trailing space inside the
brackets does not break parsing. This is the right call: hand-edited
PLAN.md files routinely have stray spaces, and the loop should be
forgiving on the input side.

Three new tests pin the behaviour for both the completed and the
keyword markers. `- [x]   ` (trailing whitespace on the whole line) is
also pinned separately to confirm `line.trim()` runs before the slice,
so the trailing space vanishes from the description.

#### 2.1.D — INFO — `- [x] [MANUAL] Task` is `completed`, not `manual`

A line that contains both a completed marker and a `[MANUAL]` tag is
classified as `completed`, not `manual`. This is by design: the
`completed` branch short-circuits at line 39-41, before any tag-form
parsing runs. The `[MANUAL]` text becomes part of the description:

```ts
parseTaskLine("- [x] [MANUAL] Task")
// → { type: "completed", description: "[MANUAL] Task" }
```

A user who intends "this task is both done and manual" can write that,
and the loop will treat it as done (which is what they want — it stops
running on it). The opposite interpretation ("override the x and call it
manual") would be a worse default because the loop would keep trying to
run a completed task. **No code change needed; pinned by new test.**

#### 2.1.E — INFO — Multi-tag lines: the first tag in the chain wins

`- [ ] [MANUAL] [BLOCKED: x] Task` is `manual` with `description =
"[BLOCKED: x] Task"`. The `manual` branch (`plan-parser.ts:48-52`) is
checked before the `blocked` branch (`plan-parser.ts:65-75`), so the
leftmost tag wins. A user writing both tags on one line is asking for
ambiguity, but the deterministic ordering means the behavior is
predictable. **No code change needed; pinned by new test.**

#### 2.1.F — LOW (documented footgun) — Space-separated BLOCKED reasons are accepted, colon is not required

`- [BLOCKED some reason]` (no colon, just a space after `BLOCKED`) is
parsed as `blocked` with `blockedReason = "some reason"` and `description
= ""`. The lookahead `/^BLOCKED(?=$|[:\s])/i` at `plan-parser.ts:56`
intentionally accepts whitespace as a terminator, so a user who writes
`- [BLOCKED <text>]` gets the text captured as the reason. With a
trailing description, `- [BLOCKED some reason] Real desc` correctly
captures both the reason and the description.

This is a documented footgun for one reason: a user who writes
`- [BLOCKED] extra]` and means "the reason is empty, the description is
`extra]`" gets exactly that, but a user who accidentally drops the
colon in `- [BLOCKED some reason]` will be surprised that the
description field is empty (their text was eaten as the reason). The
function is working as designed; the user can disambiguate by using the
colon form `- [BLOCKED: some reason]`.

**Proposed fix (not applied).** Make the colon REQUIRED for the
checkbox form, matching the tag form which already requires it
(visually). Update the regex to `^BLOCKED:`, and update the `reason`
extraction accordingly. This is a behavior change, so a `--no-block`
migration is not feasible — every existing `- [BLOCKED ...]` line
would silently become `not-a-task`. **Severity: LOW** because the
current behavior is documented and the colon form works.

**Status.** Fix proposed, not applied (audit-only per PLAN.md acceptance
criteria). The space-form is pinned by two new tests so any future
behavior change is visible as a test diff.

#### 2.1.G — LOW (documented footgun) — The first `]` terminates the checkbox

`parseTaskLine("- [BLOCKED] extra]")` returns `{ type: "blocked",
description: "extra]", blockedReason: "" }`. The implementation uses
`closeBracket = trimmed.indexOf("]", 3)` (line 30), so a stray `]` later
in the description is preserved as part of the description text, not
treated as another checkbox terminator.

This is the correct behavior — the alternative (search for a *balanced*
`]` and treat the next one as the close) would be ambiguous and much
harder to reason about. A user who writes `]` in their description has
no way to express it, but they can rephrase (`extra-bracket`) without
losing meaning. **Severity: LOW** because real PLAN.md files do not put
`]` in descriptions. **Pinned by new test.**

#### 2.1.H — INFO — `- [x]` with no description is still a real task

A bare `- [x]` (no description text) returns `{ type: "completed",
description: "" }`. In `parsePlan`, it counts as a completed task and
contributes to `total` and `completed`. The `percentComplete` calculation
(`plan-parser.ts:138-142`) sees it as a real task that needs no work.

This is correct: a completed task IS a real task, regardless of whether
the user bothered to write a description. A user who uses PLAN.md as a
checklist and writes only `- [x]` per line gets accurate progress
numbers. **No code change needed; pinned by 2 new tests.**

#### Test-suite delta for Task 2.1

The `parseTaskLine` describe block grew from 11 to 50 cases (+39 new
assertions, organised into 5 new sub-describe blocks). The file-level
total went from 46 to 85 tests. New sub-describe entries:

- `PLAN.md 2.1 — completed-marker variants` — 8 cases covering case
  insensitivity, internal/external whitespace, and bare (no-description)
  forms.
- `PLAN.md 2.1 — empty-checkbox variants` — 6 cases pinning the
  `not-a-task` boundary for bare checkboxes (trailing whitespace,
  extra internal whitespace, zero internal whitespace, real description).
- `PLAN.md 2.1 — MANUAL-marker variants` — 8 cases covering
  case-insensitivity, no-description, tag-form, no-space tag form, and
  the `- [MANUALSOMETHING]` anchor guard.
- `PLAN.md 2.1 — BLOCKED-marker variants` — 13 cases covering the colon
  vs space reason separators, internal whitespace, lowercase, tag form,
  no-space tag form, and the space-separated reason footgun.
- `PLAN.md 2.1 — combined / mixed markers` — 4 cases covering the
  completed+tag ordering, multi-tag ordering, the trailing-`]` footgun,
  and the no-close-bracket error path.

`bun test src/lib/plan-parser.test.ts` → **85 pass, 0 fail, 136 expect()
calls** (was 46/0/97 before this iteration). +39 tests, +39 expects, all
green.

Full suite: `bun test` → **536 pass, 0 fail, 1192 expect() calls** across
21 files. No regressions.

### 2.2 — Verify `- [MANUAL]` without description is classified correctly

**Status: COMPLETE — VERIFIED. The classification `manual` is correct; the
asymmetry with `- [ ]` (which requires a description) is intentional and
documented. No HIGH/CRITICAL/MEDIUM/LOW findings. Two INFO observations.**

The function (`src/lib/plan-parser.ts:20-89`) returns a `manual` task for
`- [MANUAL]` with no description. The natural follow-up question is
"shouldn't a bare marker be `not-a-task` like a bare `- [ ]` is?" The
answer is no — the rule is: **a bare `- [ ]` (empty checkbox content) is
not actionable without a description, but a keyword marker (`x`,
`MANUAL`, `BLOCKED`) is itself the task declaration and does not need
description text.**

#### 2.2.A — INFO — Bare `- [MANUAL]` is `manual`; bare `- [ ]` is `not-a-task`; the asymmetry is the rule

The current behavior is pinned by `parseTaskLine` tests in
`plan-parser.test.ts:163-201` (covered in 2.1) and the new
`PLAN.md 2.2 — no-description classification contrast` sub-describe:

| Input                          | `type`         | Why                                    |
| ------------------------------ | -------------- | -------------------------------------- |
| `- [ ]`                        | `not-a-task`   | Empty checkbox; no work declared       |
| `- [MANUAL]`                   | `manual`       | Keyword marker = "this slot is manual" |
| `- [ ] [MANUAL]`               | `manual`       | Tag form; same rule applies            |
| `- [x]`                        | `completed`    | Keyword marker = "this slot is done"   |
| `- [BLOCKED]`                  | `blocked`      | Keyword marker = "this slot is blocked"|

The asymmetry is intentional. A bare `- [ ]` is anonymous: the user wrote
"a thing exists" without saying what the thing is. A bare `- [MANUAL]`
(or `- [x]`, or `- [BLOCKED]`) is a self-declaring task: the user wrote
"this slot has property X". The marker is the task. The description
would be additional context, but it is not required for the slot to mean
something.

This is consistent with how the three other markers behave: `- [x]`
with no description is a real completed task (counted in `total` and
`completed`), and `- [BLOCKED]` with no description is a real blocked
task (counted in `total` and `blocked`). Both are covered in 2.1 and
re-pinned together in the new 2.2 contrast test that asserts all three
keyword markers accept bare form while the empty checkbox does not.

**No code change needed; behavior pinned by 5 new contrast tests.**

#### 2.2.B — INFO — `parsePlan` impact: bare `- [MANUAL]` is counted; bare `- [ ]` is excluded

The asymmetry propagates to `parsePlan` as expected. A bare `- [MANUAL]`
contributes to `total` and `manual`; a bare `- [ ]` is filtered out by
the `not-a-task` short-circuit and contributes to nothing. Three new
tests pin the downstream behavior:

1. A plan of mixed bare manual markers (both `- [MANUAL]` and
   `- [ ] [MANUAL]`) and described manual markers counts all four as
   `manual` and resolves to 100% (manual is excluded from the denominator).
2. A plan with two bare `- [ ]` and one bare `- [MANUAL]` and one bare
   `- [x]` reports `total = 2`, `manual = 1`, `completed = 1`, and
   `percentComplete = 100` (1 / (2 − 1) = 100%). The bare pending lines
   are silently dropped, the bare manual is silently counted.
3. A plan of only bare `- [MANUAL]` and `- [ ] [MANUAL]` lines reports
   `total = 3`, `manual = 3`, `automatable = 0`, `percentComplete = 100`.
   This is the "no automatable work" semantic: the loop has nothing to do
   because every task is declared manual, so 100% is the correct reading.

**No code change needed; behavior pinned by 3 new plan-level tests.**

#### Test-suite delta for Task 2.2

The `parseTaskLine` describe block grew from 50 to 55 cases (+5 new
contrast assertions) and the `parsePlan` describe block grew from 14 to
17 cases (+3 new plan-level assertions). File-level totals:

- `parseTaskLine` sub-describe `PLAN.md 2.2 — no-description classification
  contrast` — 5 cases covering: the core contrast (bare `- [ ]` vs bare
  `- [MANUAL]`), the tag-form equivalent, the all-keyword-markers
  grouped assertion, and the trailing-whitespace symmetry test (both
  directions).
- `parsePlan` it-blocks — 3 cases covering: bare manual markers counted
  as manual (mixed with described manual), the explicit asymmetry at
  the plan level (bare pending excluded, bare manual included), and
  the all-bare-manual → 100% "no automatable work" semantic.

`bun test src/lib/plan-parser.test.ts` → **93 pass, 0 fail, 160 expect()
calls** (was 85/0/136 before this iteration). +8 tests, +24 expects, all
green.

Full suite: `bun test` → **544 pass, 0 fail, 1216 expect() calls** across
21 files. No regressions.

---

## Phase 2 — Plan File Parsing & Progress Tracking (continued)

### 2.3 — Verify `- [BLOCKED:]` with empty reason vs `- [BLOCKED]` without colon, and `- [BLOCKED: some reason ]` with spaces in reason

**Status: COMPLETE — VERIFIED. Both surfaces behave correctly. No
HIGH/CRITICAL/MEDIUM/LOW findings. Three INFO observations.**

The `parseTaskLine` function (`src/lib/plan-parser.ts:20-89`) handles the
`BLOCKED` keyword in two places:

1. **Checkbox form** (lines 56-63): the regex `/^BLOCKED(?=$|[:\s])/i`
   anchors the keyword so `BLOCKEDABC` is not misread, and the strip regex
   `replace(/^BLOCKED[:\s]*/i, "")` removes the keyword plus any leading
   colon or whitespace from the reason.
2. **Tag form** (lines 66-75): the regex
   `/^\[BLOCKED[:\s]*([^\]]*)\]\s*(.*)$/i` captures the inner reason
   (`[^]]*` accepts any non-`]` characters, spaces included) and trims
   edges via `match[1]?.trim() || ""`.

Both surfaces produce the same semantic results. The behavior is
correct, well-anchored, and now pinned by 7 new contrast assertions.

#### 2.3.A — INFO — Empty-reason contrast: `- [BLOCKED]` and `- [BLOCKED:]` are equivalent

| Input            | `type`     | `description` | `blockedReason` | Notes                            |
| ---------------- | ---------- | ------------- | --------------- | -------------------------------- |
| `- [BLOCKED]`    | `blocked`  | `""`          | `""`            | No colon, no whitespace inside   |
| `- [BLOCKED:]`   | `blocked`  | `""`          | `""`            | Colon present, nothing after     |
| `- [BLOCKED: ]`  | `blocked`  | `""`          | `""`            | Colon + space, nothing after     |

The lookahead `(?=$|[:\s])` accepts all three forms; the strip
`^BLOCKED[:\s]*` removes the keyword plus optional colon and any
**leading** spaces. The trailing trim of `checkboxContent` (line 35)
collapses internal whitespace, so `- [ BLOCKED ]` and `- [BLOCKED   ]`
also resolve to `blockedReason = ""`. The user can write whichever form
reads most naturally; the parser collapses all of them to the same
output.

**No code change needed; behavior pinned by 3-input contrast test.**

#### 2.3.B — INFO — Spaces inside the reason survive the strip step

The strip regex `^BLOCKED[:\s]*` only consumes whitespace **immediately
after** the colon (or the keyword when no colon is present). Spaces
deeper inside the reason are part of the reason text and are preserved:

| Input                                          | `blockedReason`              |
| ---------------------------------------------- | ---------------------------- |
| `- [BLOCKED: some reason]`                     | `"some reason"`              |
| `- [BLOCKED:  word  word ]`                    | `"word  word"`               |
| `- [BLOCKED: needs foo:bar baz]`               | `"needs foo:bar baz"`        |
| `- [ ] [BLOCKED: some reason ]` (tag form)     | `"some reason"`              |
| `- [ ] [BLOCKED:  word  word ]` (tag form)     | `"word  word"`               |

The tag form matches via `([^\]]*)` (any non-`]` chars, spaces
included), then `match[1]?.trim()` removes only the **leading and
trailing** whitespace from the capture group. Internal whitespace is
preserved. This is the documented and pinned rule: "spaces in reason"
are the user's text, not delimiters.

**No code change needed; behavior pinned by 5 spacing-variant tests.**

#### 2.3.C — INFO — Trailing description after a spaced reason still works

The full line `- [BLOCKED: some reason here] Real desc` produces
`description = "Real desc"` and `blockedReason = "some reason here"`.
The `]` closes the brackets; everything after it becomes the
description (with `.trim()` applied at line 36). This is the natural
extension of the line 254 test (space-separated reason, no colon) to
the colon variant that PLAN.md 2.3 line 25 asks about.

**No code change needed; behavior pinned by 1 combined assertion.**

#### Test-suite delta for Task 2.3

New `describe` block `PLAN.md 2.3 — BLOCKED reason extraction
(empty-reason + spaces)` added inside `parseTaskLine` with **7 cases /
9 expect() calls**:

1. 3-input empty-reason contrast (the line 24 task).
2. Single-space reason in checkbox form.
3. Single-space reason in tag form.
4. Multi-space internal reason in checkbox form.
5. Multi-space internal reason in tag form.
6. Colon preserved when it appears later in the reason.
7. Combined reason + trailing description (the line 25 task's natural
   extension).

`bun test src/lib/plan-parser.test.ts` → **100 pass, 0 fail, 169
expect() calls** (was 93/0/160 before this iteration). +7 tests,
+9 expects, all green.

Full suite: `bun test` → **551 pass, 0 fail, 1225 expect() calls**
across 21 files. No regressions.

---

### 2.6 — Verify lines that start with `- [` but have no closing bracket

**Status: COMPLETE — VERIFIED. Every variant returns `not-a-task` via the
same single guard. No HIGH/CRITICAL/MEDIUM/LOW findings. One INFO
observation, and one test added in the suite that double-checks the
unrelated "empty checkbox, no description" branch to prevent future
false positives in this audit set.**

The function (`src/lib/plan-parser.ts:20-89`) has exactly one
unclosed-bracket check, at lines 30-33:

```ts
const closeBracket = trimmed.indexOf("]", 3)
if (closeBracket === -1) {
  return { type: "not-a-task", description: "" }
}
```

`String.prototype.indexOf(searchValue, fromIndex)` returns `-1` when the
needle is not found at or after `fromIndex`. The function searches for
`]`, starting at index 3 (which skips the `- [` prefix). When no `]`
exists at all, the search walks the rest of the line and returns `-1`,
which the guard translates into a `not-a-task` return shape.

This is the correct, minimal behavior: when the line claims to start a
checkbox (it has `- [`) but never finishes the bracket pair, the parser
has no way to know what was intended. Silently dropping the line is
safer than guessing — guessing risks inventing a marker, splitting on a
space, or treating the line as an empty checkbox, all of which would
introduce noise into the task counts.

#### 2.6.A — INFO — Every `- [` prefix variant with no `]` returns `not-a-task` via the same guard

The audit walked every plausible "- [` shape with no `]`" the function
might encounter. All 12 are pinned by the new
`PLAN.md 2.6 — unclosed-bracket edge cases` sub-describe in
`plan-parser.test.ts`:

| Input                                            | `type`         | Why it triggers the guard                              |
| ------------------------------------------------ | -------------- | ------------------------------------------------------ |
| `- [`                                            | `not-a-task`   | No `]` anywhere → `indexOf` returns -1                 |
| `- [ ` (single space)                            | `not-a-task`   | After `.trim()` → `- [`; no `]`                        |
| `- [x`                                           | `not-a-task`   | `x` is visible but `]` is missing                      |
| `- [X`                                           | `not-a-task`   | Same as above for uppercase                            |
| `- [MANUAL`                                      | `not-a-task`   | `MANUAL` keyword is visible but `]` is missing         |
| `- [BLOCKED`                                     | `not-a-task`   | `BLOCKED` keyword visible, no `]`                      |
| `- [BLOCKED: reason`                             | `not-a-task`   | Colon + reason visible, no `]`                         |
| `- [ this is a long task description with no close bracket` | `not-a-task` | `indexOf` walks the whole body, no `]` |
| `    - [ ` (indented)                            | `not-a-task`   | Leading whitespace stripped by `.trim()`; same as un-indented |
| `    - [x` (indented)                            | `not-a-task`   | Same as above                                          |
| `- [x   ` (trailing whitespace)                  | `not-a-task`   | Trailing whitespace stripped by `.trim()`; no `]`      |
| `- [ [nested`                                    | `not-a-task`   | An unbalanced `[` inside the body does not satisfy the `]` check; the parser is looking for a close bracket, not a balanced pair |

All 12 inputs return `{ type: "not-a-task", description: "" }` and the
behavior is consistent across the table — same guard, same exit shape,
no exceptions, no silent misclassification.

#### 2.6.B — INFO — The "empty checkbox" path can look like an unclosed-bracket input

A natural test candidate `- [ ] ` (with a trailing space) is **not** an
unclosed-bracket case: the `]` is present at index 4, so
`closeBracket = 4`, and the function proceeds to the empty-checkbox
branch (`plan-parser.ts:80-83`). The line still returns
`not-a-task`, but for a different reason: the body is empty AND
`afterCheckbox` is empty.

The 2.6 set includes this case (now renamed in the test file from
"no close, body is just a space" to "no description after close
bracket") with a comment that explicitly calls out the code path.
This prevents a future reader from assuming the unclosed-bracket guard
is what returned the result, and makes it obvious that the test is
here to fence off an adjacent shape rather than to exercise the
guard.

**No code change needed; behavior pinned by 13 cases (12 unclosed +
1 fence).**

#### 2.6.C — INFO — The implementation is minimal and correct: one check, one exit

The unclosed-bracket path is a single 3-line block. There is no
fallback, no recovery, no warning. This is the right design for the
plan-parser's role: PLAN.md is a user-authored file and any malformed
line is just dropped from the count. The user can fix it on the next
edit. A "warn about malformed checkbox" log line would be a feature
addition, not a fix, and is out of scope for an audit.

The audit also confirms the guard does not over-trigger:

- `- [text that contains ] later]` → closeBracket = position of the
  *first* `]` (correct — see Task 2.1 finding 2.1.G for the footgun
  analysis). The unclosed-bracket guard only fires when **no** `]`
  exists, not when `]` appears in the wrong place.
- `- [  ]` (extra spaces inside the brackets) → closeBracket finds
  the `]`, body = `"  "`, trimmed to `""`, afterCheckbox = `""`. Hits
  the empty-checkbox branch, not the unclosed-bracket guard. Tested
  in 2.1.

**No code change needed; behavior pinned by the existing 2.1 tests
plus the new 2.6 set.**

#### Test-suite delta for Task 2.6

New `describe` block `PLAN.md 2.6 — unclosed-bracket edge cases` added
inside `parseTaskLine` with **12 cases / 13 expect() calls**:

1. Bare `- [` (prefix only, no body, no close).
2. `- [` + a single space (no body, no close).
3. `- [x` (looks like a completed marker; missing the `]`).
4. `- [X` (uppercase variant).
5. `- [MANUAL` (keyword visible; missing the `]`).
6. `- [BLOCKED` (keyword visible; missing the `]`).
7. `- [BLOCKED: reason` (colon + reason; missing the `]`).
8. Long body, no `]`.
9. Indented bare `- [` and `- [x`.
10. Trailing whitespace, no `]`.
11. Nested `[` inside the body, no `]`.
12. `- [ ] ` fence: same exit shape, but documented as exercising the
    empty-checkbox branch (so a future failure of this test points
    the reader at the right code path).

`bun test src/lib/plan-parser.test.ts` → **112 pass, 0 fail, 182
expect() calls** (was 100/0/169 before this iteration). +12 tests,
+13 expects, all green.

Full suite: `bun test` → **563 pass, 0 fail, 1238 expect() calls**
across 21 files. No regressions.

---

### 2.4 — Verify `percentComplete` math

**Status: COMPLETE — VERIFIED. The formula is correct on every boundary
the audit walks: total=0, all-MANUAL, all-BLOCKED, mixed terminal
categories, single pending, single completed, exact halves, and
non-trivial rounding (1/3, 2/3, 3/7, 3/8, 1/8). No
HIGH/CRITICAL/MEDIUM/LOW findings. Five INFO observations.**

The formula in `src/lib/plan-parser.ts:133-142`:

```ts
const pending = total - completed - manual - blocked
const automatable = pending
const denominator = total - manual - blocked
const percentComplete = denominator > 0
  ? Math.round((completed / denominator) * 100)
  : 100
```

is the contract. It is a one-liner that hides three coupled rules:

1. **`pending` and `automatable` are the same value.** This is
   deliberate: "automatable" = "pending" because the only kind of
   task the loop will work on is a pending one. The double name is
   for UI/readability (the dashboard speaks "automatable", the
   parser thinks "pending").
2. **The denominator excludes MANUAL and BLOCKED tasks.** The
   in-source comment at lines 135-137 explains the semantic: the
   loop treats `[x]` AND `[BLOCKED]` as terminal, so a plan with
   only completed+blocked items has nothing the loop can do and
   must report 100%. Without the subtraction, a plan that ended
   in "all done, but here's a leftover BLOCKED note" would be
   stuck at <100% forever, which is wrong from the user's
   perspective.
3. **The denominator>0 check selects between the computed path
   and the "nothing to do → 100%" fallback.** When there are zero
   automatable tasks (denominator=0), there is nothing to compute
   against, so the loop is by definition "done" with this plan
   (the user has only left themselves MANUAL or BLOCKED items).
   The strict `>` is important: a single-pending plan
   (denominator=1, completed=0) must compute 0/1 = 0%, not
   trip the fallback.

#### 2.4.A — INFO — Empty file and all-terminal-category plans resolve to 100% via the denominator=0 fallback

Four degenerate whole-plan shapes all collapse to `denominator = 0`
and therefore `percentComplete = 100`. Each is pinned by a
dedicated test:

| Plan shape                                       | `total` | `manual` | `blocked` | `denominator` | `percentComplete` |
| ------------------------------------------------ | ------- | -------- | --------- | ------------- | ----------------- |
| Empty file (or prose-only / headings-only)       | 0       | 0        | 0         | 0             | 100               |
| Only MANUAL tasks (any mix of forms)             | n       | n        | 0         | 0             | 100               |
| Only BLOCKED tasks (any mix of forms)            | n       | 0        | n         | 0             | 100               |
| Only MANUAL + BLOCKED (no pending, no completed) | n       | m        | b         | 0             | 100               |

The 100% is not a coincidence and not "off by one" — it is the
intended semantic for the loop driver: "no work to do" means the
plan is complete from the loop's perspective. The user may still
have manual work to do themselves, but the automation has
finished.

**No code change needed; behavior pinned by 4 dedicated tests
inside the new `PLAN.md 2.4 — percentComplete math` block (the
2.1 whole-file-edge-cases block already pinned the empty-file
and all-terminal-cases too — the 2.4 block adds explicit,
math-focused assertions).**

#### 2.4.B — INFO — Single pending and single completed plans exercise the computed branch (denominator>0)

Two boundary tests pin that the strict-greater-than check on
denominator is the ONLY thing that drives the 100% fallback:

- A plan with one pending task: `total=1, manual=0, blocked=0 →
  denominator=1, completed=0, percentComplete = 0/1 = 0`. NOT 100.
- A plan with one completed task: `total=1, manual=0, blocked=0 →
  denominator=1, completed=1, percentComplete = 1/1 = 100`. NOT
  undefined.

If the check were ever weakened to `denominator >= 0` (or
replaced with `completed === 0 ? 0 : ...`), both tests would
flip to the wrong result, catching the regression immediately.

**No code change needed; behavior pinned by 2 dedicated tests.**

#### 2.4.C — INFO — Manual and blocked tasks never penalise the percentage

The formula is `denominator = total - manual - blocked`, so
manual and blocked tasks are explicitly removed from the
denominator. A plan with 2 completed + 1 pending + 1 manual + 1
blocked has `denominator = 4 - 1 - 1 = 2` and
`percentComplete = 2/2 = 100`, not `2/4 = 50`.

This is the documented behavior in the in-source comment at
lines 135-137. The audit's largest mixing test (10 tasks: 3
completed + 5 manual + 2 blocked) returns 100% via the computed
branch, confirming that a long MANUAL/BLOCKED tail does not
distort the percentage of the completed portion.

**No code change needed; behavior pinned by 3 dedicated mixing
tests (2/3 of a 5-task plan, 3/3 of a 10-task plan, 3/8 of an
11-task plan).**

#### 2.4.D — INFO — Rounding uses JS `Math.round` (half-up for positives), not floor/ceil/truncate

The rounding step is `Math.round((completed / denominator) * 100)`.
JS `Math.round` rounds half AWAY FROM zero for positive numbers
and half TOWARD zero for negative numbers. Since the percentage
is always non-negative here (both `completed` and `denominator`
are non-negative integers and `denominator > 0` in this branch),
the rule is "≥ .5 rounds up".

Pinned by 5 dedicated rounding tests:

| Numerator / Denominator | Decimal | `Math.round` | Pinned value |
| ----------------------- | ------- | ------------ | ------------ |
| 1/3                     | 33.333… | 33           | 33           |
| 2/3                     | 66.666… | 67           | 67           |
| 3/7                     | 42.857… | 43           | 43           |
| 3/8                     | 37.5    | 38           | 38           |
| 1/8                     | 12.5    | 13           | 13           |

Exact halves (2/4 = 50, 4/6 = 66.666… → 67) are also pinned to
catch a future swap to `Math.floor` or `Math.ceil` — both would
change the value immediately.

**No code change needed; behavior pinned by 7 dedicated
rounding/computed-branch tests.**

#### 2.4.E — INFO — The companion test fences off the "computed branch is reachable" invariant

The `all completed → 100%` test and the `4/6 completed → 67%`
test form a pair. The first pins the 100% via the computed
branch (denominator=6, 6/6=100). The second pins that 100% via
the fallback is NOT what fires for a non-zero denominator. If
the ternary were ever inverted (`denominator <= 0 ? ... :
...`), the all-completed test would still pass by accident, but
the 4/6 test would flip to 100 (wrong) and fail immediately.

The negative-control `completed=0 with denominator>0 → 0%` test
fences off the symmetric inversion: if the check were
`denominator >= 0 ? 100 : ...`, this test would return 100
(wrong) and fail. Together, the three tests pin the exact shape
of the ternary.

**No code change needed; behavior pinned by 3 invariant
fencing tests.**

#### Test-suite delta for Task 2.4

New `describe` block `PLAN.md 2.4 — percentComplete math` added
inside `parsePlan` with **17 cases / 33 expect() calls**:

1. Denominator is total - manual - blocked (the formula pin).
2. total=0 (empty file) → 100% via fallback.
3. all-MANUAL → 100% via fallback.
4. all-BLOCKED → 100% via fallback.
5. only MANUAL + BLOCKED → 100% via fallback.
6. single pending task → 0% (computed branch).
7. single completed task → 100% (computed branch).
8. half completed (2/4) → 50 (no rounding bias).
9. 1/3 completed → 33 (rounding down).
10. 2/3 completed → 67 (rounding up).
11. 3/7 completed → 43 (non-trivial rounding).
12. all completed → 100 (computed branch, not fallback).
13. 4/6 completed → 67 (companion: confirms fallback is not used).
14. completed=0 with denominator>0 → 0 (negative-control).
15. mixed: 3/10 with long MANUAL/BLOCKED tail → 100.
16. interleaved 3/8 of 11 → 38 (0.5 boundary).
17. 1/8 → 13 (0.5 boundary on small denominator).

`bun test src/lib/plan-parser.test.ts` → **139 pass, 0 fail,
305 expect() calls** (was 122/0/227 before this iteration).
+17 tests, +78 expects, all green.

Full suite: `bun test` → **590 pass, 0 fail, 1361 expect()
calls** across 21 files. No regressions.

---

### 2.7 — Audit `parsePlanComplete` for no tags, single-line, multi-line, code-fenced, multiple occurrences, attribute tags, unclosed tag

**Status: COMPLETE — VERIFIED. No HIGH/CRITICAL/MEDIUM/LOW findings.
Two design choices pinned by 4 new tests.**

The function (`src/lib/plan-parser.ts:161-191`) uses a single regex
anchored to `^ {0,3}<plan-complete>` to locate the completion tag,
after stripping Markdown code fences (paired + trailing-unterminated
forms, see lines 173-179). Of the 7 scenarios listed in PLAN.md 2.7,
the existing tests already pinned 5; this iteration adds 2 more for
the two that were uncovered: attribute tags and unclosed tags.

| PLAN.md 2.7 scenario                                            | Status          | Test coverage                                     |
| --------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| No tags                                                         | Already covered | `should return null when no tag present` (L1350)  |
| Single-line `<plan-complete>text</plan-complete>`               | Already covered | `should extract content between tags` (L1355)     |
| Multi-line with nested content                                  | Already covered | `should handle multiline content` (L1360)         |
| Tags inside code fences                                         | Already covered | `should ignore a tag documented inside a fenced code block` (L1409), `ignores a documented tag inside an UNTERMINATED fence` (L1431) |
| Multiple occurrences → use last                                 | Already covered | `should still find a real tag alongside a documented one` (L1421), `finds a real tag alongside one nested in a blockquote` (L1454) |
| **Tags with attributes**                                        | **NEW**         | `ignores a tag that carries attributes` (this iteration) |
| **Unclosed `<plan-complete>` tag**                              | **NEW**         | `ignores an unclosed <plan-complete> tag` (this iteration) |

#### 2.7.A — INFO — Attribute tags are not supported (deliberate)

**Problem.** A completion tag like `<plan-complete foo="bar">summary</plan-complete>` is
NOT recognized as a completion. The regex literal `<plan-complete>(?:...)` does not
allow any character between `>` and the start of the body, so the regex skips the
attribute-bearing form entirely and `parsePlanComplete` returns `null`.

**Why this is correct.** Completion is a private signal from the agent
to the loop. The semantics are "the plan is done, here is the
summary" — there is no metadata that a future caller would need to
carry on the tag itself. Adding attribute parsing would require (a)
a documented attribute schema, (b) escaping rules, (c) error paths
for malformed attributes, and (d) a reason to need it. None of those
exist; the current literal-tag approach is the right one for the
job.

**Where.** `src/lib/plan-parser.ts:182-183` (the regex literal).

**Behavior pinned by 2 new tests:**
- `ignores a tag that carries attributes (e.g. <plan-complete foo="bar">)` — confirms `null` on attribute tag.
- `ignores a tag with attributes alongside a real one (real wins, not the attribute one)` — confirms a real tag in the same document is still found when an attribute tag precedes it.

**No code change needed.**

#### 2.7.B — INFO — Unclosed completion tag is ignored (deliberate)

**Problem.** A stray `<plan-complete>summary without close` (no `</plan-complete>`)
is NOT recognized as a completion. The regex requires the close tag (either inline
or on its own line, see the alternation at `plan-parser.ts:182`), so an open-without-close
is silently dropped and `parsePlanComplete` returns `null`.

**Why this is correct.** The loop's completion signal is a *pair*. A one-sided
signal (open with no close, or close with no open) has no defined meaning, and
the safe default is "treat as if no completion exists." If a stray open tag
were treated as a completion, a typo or partial edit (e.g. the agent writing
the open tag and getting cut off) would stop the loop early — a high-impact
false positive. The current behavior (ignore) is a missed completion, which
the next iteration can re-emit; that is the lesser harm.

**Where.** `src/lib/plan-parser.ts:182-183` (the regex requires the close tag).

**Behavior pinned by 2 new tests:**
- `ignores an unclosed <plan-complete> tag (no closing tag present)` — multi-line form, with surrounding tasks.
- `ignores a single-line unclosed tag (no newline, no close)` — single-line degenerate form.

**No code change needed.**

#### Test-suite delta for Task 2.7

4 new tests in `describe("parsePlanComplete")`:
1. Attribute tag → null.
2. Attribute tag alongside real → real wins.
3. Multi-line unclosed → null.
4. Single-line unclosed → null.

`bun test src/lib/plan-parser.test.ts` → **143 pass, 0 fail, 313
expect() calls** (was 139/0/305 before this iteration).
+4 tests, +8 expects, all green.

---

### 2.8 — Verify `getCurrentTaskFromContent` returns the FIRST pending task even if tasks are not in order

**Status: COMPLETE — VERIFIED. The function returns the first pending
task in document order regardless of how later rows are interleaved
with completed/manual/blocked/pending. One new dedicated test pins
the contract; the existing "skip MANUAL and BLOCKED" test already
pins a related case.**

The function (`src/lib/plan-parser.ts:241-253`) is a linear scan over
the lines of the plan content. For each line it calls `parseTaskLine`
and returns the description of the first `pending` task. There is no
short-circuit on `completed`, no de-duplication, no reordering — the
loop terminates at the first `pending && description` match.

The audit's question — "even if tasks are not in order" — is answered
by the code path itself: the loop iterates `lines[0]`, `lines[1]`,
`...`, and returns at the first match. Order is the document order,
and "first pending" is the first pending line in that order.

#### 2.8.A — INFO — Adjacent tests already pin a strong version of this

The existing test `should skip MANUAL and BLOCKED tasks` (L1500-1511)
has the structure:

```
- [MANUAL] Manual task
- [BLOCKED: reason] Blocked task
- [ ] [MANUAL] Tagged manual task
- [ ] [BLOCKED] Tagged blocked task
- [ ] First automatable task
```

and asserts the result is `"First automatable task"`. This pins a
pending buried under four non-pending rows — i.e. the loop kept
scanning past the non-pending rows and returned the *only* pending
line in the file. The "even if tasks are not in order" question is
slightly broader (what if there are MULTIPLE pendings with non-
pending rows in between?); that is the gap the new test fills.

#### 2.8.B — INFO — First-pending selection is now pinned explicitly

**Behavior pinned by 2 new tests:**
- `returns the FIRST pending even when later pendings exist` —
  6-line file with the first pending at the top and three more
  pendings separated by `done`/`MANUAL`/`BLOCKED` rows. Asserts
  the result is `"first pending"`, not a later one.
- `returns the first pending when completed rows are interleaved
  BEFORE and AFTER` — 4-line file with the pattern `done / pending /
  done / pending`. Asserts the result is `"pending a"`, the first
  one (the loop does NOT pick the LAST pending before the final
  completed row).

Together with the existing `should skip MANUAL and BLOCKED tasks`,
this fences off three failure modes:
1. Returning a completed task's description.
2. Returning a MANUAL or BLOCKED task's description.
3. Returning a *later* pending's description (skipping earlier ones).

**No code change needed; behavior pinned by 2 new + 1 existing test.**

#### Test-suite delta for Task 2.8

2 new tests in `describe("getCurrentTaskFromContent")`:
1. First-pending-wins when later pendings exist (with intermixed
   completed/manual/blocked).
2. First-pending-wins when completed rows are interleaved before
   AND after.

`bun test src/lib/plan-parser.test.ts` → **145 pass, 0 fail, 315
expect() calls** (was 143/0/313 before this iteration).
+2 tests, +2 expects, all green.

---

### 2.9 — Verify `parsePlanFile` with a file that doesn't exist (throws vs returns null)

**Status: COMPLETE — VERIFIED. `parsePlanFile` THROWS on a missing
file (Node-style `ENOENT`). The caller `refreshPlan` in App.tsx
catches and logs. One new describe block pins both the throw and
the happy path. The throw-vs-return-null asymmetry with
`isPlanComplete` is a deliberate design choice, documented.**

The function (`src/lib/plan-parser.ts:226-230`):

```ts
export async function parsePlanFile(planPath: string): Promise<PlanProgress> {
  const file = Bun.file(planPath)
  const content = await file.text()
  return parsePlan(content)
}
```

Note the **absence** of an `await file.exists()` guard. Compare with
`isPlanComplete` (`plan-parser.ts:199-204`), which DOES check exists()
first and returns `false`. So `parsePlanFile` will throw on a missing
file (Bun/Node-style `ENOENT` from `Bun.file().text()`), and the
caller is expected to handle that throw.

The caller is `refreshPlan` in `src/App.tsx:570-581`:

```ts
async function refreshPlan(): Promise<void> {
  if (props.debug) return
  try {
    const progress = await parsePlanFile(props.planFile || DEFAULTS.PLAN_FILE)
    setPlanProgress(progress)
  } catch (err) {
    log.error("plan", "Failed to parse plan file", err)
  }
}
```

So the contract is: `parsePlanFile` THROWS, `refreshPlan` catches
and logs. This is consistent with how `getCurrentTask` (line 262-266)
also throws on missing file, and is caught in `refreshCurrentTask`
(`App.tsx:586-598`).

#### 2.9.A — INFO — The throw-vs-return-null asymmetry is a deliberate, documented split

`isPlanComplete` and `getPlanCompleteSummary` (lines 199-217) return
`false`/`null` on missing files. `parsePlanFile` and `getCurrentTask`
(lines 226-265) throw. The reason: the first pair answers
*questions about a file* (does it exist? what's in it?); a missing
file is a valid answer ("no, it's not complete"). The second pair
*extracts structured data from a file*; a missing file is an error
condition (the caller has a plan file, but it's gone), and silently
returning an empty/zeros `PlanProgress` would mask the problem
behind a "0% complete" UI.

The two-path design also matches the caller responsibilities: the
completion-checker is called from background loops where a missing
file is expected (the plan is being written by the agent); the
extractor is called from the UI where a missing plan is a user-
visible problem worth logging.

**No code change needed; asymmetry is pinned by 3 tests:**
- `isPlanComplete` returns `false` on missing file (pre-existing L1568-1572).
- `parsePlanFile` THROWS on missing file (new — see below).
- `parsePlanFile` returns the expected `PlanProgress` for a real file (new — see below).

**Behavior pinned by 2 new tests in a new `describe("parsePlanFile")` block:**
- `throws on a non-existent file (does not silently return null/empty)` —
  confirms the contract and pins the throw on `Bun.file(missingPath).text()`.
  This test would fail loudly if a future refactor of `parsePlanFile`
  added an exists()-guard and returned a zeros `PlanProgress` — that
  refactor would also need to update the App.tsx error-handling
  contract, and this test is the canary.
- `parses a real file and returns PlanProgress` — happy path; the
  tmp file is cleaned up in a `finally` so the test is hermetic.

**No code change needed.**

#### Test-suite delta for Task 2.9

2 new tests in a new `describe("parsePlanFile")` block (the import
line was extended to include `parsePlanFile`):
1. Throw on non-existent file.
2. Happy path on a real tmp file.

`bun test src/lib/plan-parser.test.ts` → **147 pass, 0 fail, 317
expect() calls** (was 145/0/315 before this iteration).
+2 tests, +2 expects, all green.

---

### 2.10 — Verify `refreshPlan` in App.tsx silently ignores errors — is this correct behavior for all error types?

**Status: COMPLETE — VERIFIED. `refreshPlan` does NOT silently
ignore errors — it logs them via `log.error("plan", ...)` and then
swallows. The "silent" is therefore "silent to the user UI", not
"silent to the operator". The behavior is correct for all three
plausible error classes; no fix needed.**

The function (`src/App.tsx:567-581`):

```ts
/**
 * Parse the plan file and update progress
 */
async function refreshPlan(): Promise<void> {
  // Skip in debug mode - no plan file required
  if (props.debug) {
    return
  }
  try {
    const progress = await parsePlanFile(props.planFile || DEFAULTS.PLAN_FILE)
    setPlanProgress(progress)
  } catch (err) {
    log.error("plan", "Failed to parse plan file", err)
  }
}
```

The PLAN.md 2.10 question — "is silently ignoring the correct
behavior for ALL error types?" — has three plausible error
classes to consider:

#### 2.10.A — INFO — `ENOENT` (plan file missing) — log+swallow is correct

This is the most common case in practice: the plan file is being
written by the agent (the loop's own previous iteration), and there
is a brief window where the file does not exist (yet to be created,
mid-rename, etc.). Swallowing the error is the right call: the next
call to `refreshPlan` (triggered by file_watcher, SSE event, or
manual refresh) will pick up the file once it exists. Logging the
error keeps the diagnostic trail.

If `refreshPlan` did NOT swallow the error, every iteration that
hit the missing-file window would propagate an exception up the
caller stack. The callers are SSE event handlers and file watchers
that do not have a meaningful "what should I do" answer for a
transient ENOENT — propagating would either crash the TUI or
trigger an unrecoverable error state for a non-error condition.
Both outcomes are strictly worse than the current behavior.

**No code change needed.**

#### 2.10.B — INFO — `EACCES`/permission error (plan file unreadable) — log+swallow is correct

A permission error on the plan file is a configuration problem
that the user must fix on their end (e.g. a wrong `chmod` on the
plan file, or a filesystem ACL change). The loop has no way to
recover automatically. Swallowing + logging is the right call: the
user will see the error in the log when they go to debug, and the
TUI continues to render whatever the previous successful
`setPlanProgress` call stored. A loud crash would be a worse user
experience (an unrelated run becomes unkillable from the TUI).

**No code change needed.**

#### 2.10.C — INFO — `parsePlan` throws on a syntactically-broken plan (e.g. `Bun.file().text()` succeeds but `parsePlan` returns an internal throw) — log+swallow is correct

`parsePlan` itself does not throw on its happy path (it counts
tasks and returns a `PlanProgress`). The only realistic throw
inside the try-block is the one from `Bun.file().text()`. So
category C collapses to category A or B in practice.

If `parsePlan` were ever extended to throw (e.g. a future "strict
mode" that rejects plans with unparseable markers), the
log+swallow contract in `refreshPlan` would still be the right
call: a structural problem with the plan is a user-fixable issue
worth logging, not a TUI-crash-worthy condition.

**No code change needed.**

#### 2.10.D — INFO — `refreshCurrentTask` (the sibling function) uses bare `catch {}` — same analysis

For symmetry, the sibling function `refreshCurrentTask`
(`App.tsx:586-599`) uses a bare `catch {}` with the comment
"Silently ignore errors - current task display is non-critical." This
is also correct: a failure to fetch the current task text should
NEVER crash the TUI, because the task text is purely a display
nice-to-have (the loop's own state machine tracks the current task
internally via SSE events). A bare `catch` is appropriate here for
exactly the same reasons as `refreshPlan`'s `catch + log.error`:
the display will fall back to the last successful value, and the
loop's state machine is unaffected.

**No code change needed.**

#### Test-suite delta for Task 2.10

No new unit tests. `refreshPlan` is a React component closure that
captures `props.planFile`, `props.debug`, `setPlanProgress`, and
`log` — testing it would require either (a) a React component
test harness with mocked dependencies, or (b) a refactor to make
the function pure. Neither is in scope for an audit task.

The behavior is, however, *indirectly* pinned by the `parsePlanFile`
contract from Task 2.9: the throw-on-missing-file test guarantees
that `refreshPlan`'s catch block is the path that actually fires
for an ENOENT. If `parsePlanFile` were refactored to not throw,
`refreshPlan`'s log.error would never fire for the missing-file
case — that regression would be caught by an integration test
mocking both the file system and the logger, not by a unit test
on `parsePlanFile` itself.

**No code change needed; behavior verified by code reading +
indirect pinning via the Task 2.9 throw contract.**

---

## Combined test-suite delta for Tasks 2.7–2.10

8 new tests added (4 in `parsePlanComplete`, 2 in
`getCurrentTaskFromContent`, 2 in a new `parsePlanFile` describe
block). The test file's import line was extended to include
`parsePlanFile`.

`bun test src/lib/plan-parser.test.ts` → **147 pass, 0 fail, 317
expect() calls** (was 139/0/305 before this iteration).
+8 tests, +12 expects, all green.

Full suite: `bun test` → **598 pass, 0 fail, 1373 expect() calls**
across 21 files. No regressions.

---

## Phase 3 — State Machine (`useLoopState`)

Source: `src/hooks/useLoopState.ts` · Tests:
`src/hooks/useLoopState.test.ts`

### 3.1 — Full state machine matrix audit

**Status: COMPLETE — VERIFIED, one MEDIUM finding (data loss in
plan_complete from error).**

The `loopReducer` is a pure function `(state, action) → state`. The
state space is 11 variants (`starting`, `ready`, `running`, `pausing`,
`paused`, `cooldown`, `stopping`, `stopped`, `complete`, `error`,
`debug`) and the action space is 13 types, giving **143 (state,
action) combinations**. The audit enumerates every cell of this
matrix, pins the actual behavior with a new `describe("Phase 3.1 —
full state machine matrix audit", ...)` block, and surfaces design
choices (documented) and bugs (one MEDIUM, see below).

#### Transition matrix (full)

Cells marked **→** are no-ops (reducer returns input state deep-equal).
Cells marked with a `→ STATE` arrow are real transitions.

| Action ↓ \ State → | starting | ready | running | pausing | paused | cooldown | stopping | stopped | complete | error | debug |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `server_ready` | →ready | → | → | → | → | → | → | → | → | → | → |
| `server_ready_debug` | →debug | → | → | → | → | → | → | → | → | → | → |
| `new_session` | → | → | → | → | → | → | → | → | → | → | →debug(new) |
| `start` | → | →running(0,"") | → | → | → | → | → | → | → | → | → |
| `iteration_started` | → | → | →running(n+1,sid) | → | →running(n+1,sid) | → | → | → | → | → | → |
| `toggle_pause` | → | → | →pausing | →running (cancel) | →running("") | → | → | → | → | → | → |
| `session_idle` | → | → | →running (clear sid, or SAME) | →paused | → | → | → | → | → | → | →debug("") |
| `rate_limited` | → | → | →cooldown | →cooldown | → | → | → | → | → | → | → |
| `resume_cooldown` | → | → | → | → | → | →running(n,"") | → | → | → | → | → |
| `resume_session` | → | →running(p.iter,p.sid) | → | → | → | → | → | → | → | → | → |
| `quit` | → | →stopping | →stopping | →stopping | →stopping | →stopping | → | → | → | → | →stopping |
| `plan_complete` | → | →complete(0) | →complete(n) | → | →complete(n) | →complete(n) | → | → | → | →complete(0) | → |
| `error` | →error | →error | →error | →error | →error | →error | → | → | → | → | →error |
| `retry` | → | → | → | → | → | → | → | → | → | →starting (recoverable) | → |

#### Design choices observed (no fix, INFO)

1. **`session_idle` from `running("")` returns the SAME state object.**
   This is a deliberate idempotency guard so that two synthesized
   idles (e.g. watchdog reconcile + wake) don't emit a new object and
   re-fire the iteration driver into a second session. The test at
   line 616-624 pins this with `expect(result).toBe(state)`.

2. **`toggle_pause` from `pausing` cancels the pause** (returns to
   `running` with the SAME session, no new iteration). This is a
   "second-press cancels" UX. Pinned by the test at line 145-159.

3. **`toggle_pause` from `paused` resumes** with `sessionId = ""`,
   NOT the previous session. Rationale (comment in code, line 119):
   the previous session completed when we transitioned
   `pausing → paused`, so resuming requires a fresh session. Pinned by
   the test at line 129-143.

4. **`quit` from `error` is a no-op in the reducer** even though
   `canQuit()` returns `true` for `error`. The actual quit happens in
   `handleQuit()` (App.tsx:968) which does `loop.dispatch({type:"quit"})`
   followed by `clearCooldownTimers()`, `watchdog.stop()`, `server.stop()`,
   and `process.exit()`. The dispatch is for state propagation IF it
   would transition; for `error` it doesn't, but `process.exit` still
   fires — so the user can still quit from `error`. The asymmetry
   between `canQuit=true` and "reducer is no-op" is a deliberate
   decoupling, not a bug. Pinned by the new test (Phase 3.1 block:
   "quit: from error is a no-op ...").

5. **`error` and `plan_complete` from `cooldown` are accepted.** The
   plan can be detected as complete even while waiting out a rate
   limit, and a transient error can fire while in cooldown. Both
   paths are documented in the reducer comments and pinned by
   existing tests (lines 562-578 for `error` from cooldown; line
   626-643 for `plan_complete` from cooldown).

6. **`retry` is a no-op from `error` with `recoverable=false`.** A
   `pty` crash (terminal) or `sse` connection lost with
   `recoverable=false` is permanent. Pinned by tests at line 448-460
   and the new Phase 3.1 block test.

#### Finding 3.1.A — MEDIUM — `plan_complete` from `error` ALWAYS resets iterations to 0

**Problem.** When `plan_complete` is dispatched while the state is
`error`, the reducer sets `iterations: 0` (line 232) because the
`error` state has no `iteration` field. If the plan was running for
many iterations before erroring and the `plan_complete` summary
arrives later (e.g. the plan file was being refreshed and the
content was finally parsed as 100% complete), the summary will
report 0 iterations even though the agent executed dozens.

The user-visible effect: the "Plan complete" message in the TUI
shows 0 iterations instead of the real count. The plan file
itself in `.loop-state.json` is correct (parsed by `parsePlan`),
so this only affects the in-loop summary message.

**Where.** `src/hooks/useLoopState.ts:231-233` (the `plan_complete`
branch in the `error` arm of the reducer).

**Proposed fix.** Carry the iteration count through the error path
by adding a `lastIteration` field on the `error` state (optional,
only set when transitioning from a state that has it), and have
`plan_complete` use that value if present. Alternatively, have the
dispatcher (App.tsx) include the current `iteration` in the
`plan_complete` action's summary when firing from error.

**Status.** Fix proposed, not applied (audit-only per PLAN.md
acceptance criteria). Behavior pinned by the new test
`"plan_complete: from error ALWAYS sets iterations to 0 (KNOWN BUG:
loses progress if plan was running before error)"`.

#### Finding 3.1.B — INFO — `start` from `pausing` is a no-op (intentional)

**Problem.** None — documenting the behavior so it's not
"fixed" in a future refactor. `toggle_pause` is the canonical
way to cancel a pending pause; `start` is for the
`ready → running` edge only.

**Where.** `src/hooks/useLoopState.ts:70-76` (`start` branch).

**Status.** No fix needed. Pinned by the new test
`"start: from starting, running, pausing, paused, ..."`.

#### Finding 3.1.C — INFO — `error` from `error` is a no-op (idempotency)

**Problem.** None — if a second error fires while we're already in
the `error` state (e.g. two SSE streams racing), the new error's
`source`/`message`/`recoverable` are dropped. This is deliberate:
the FIRST error wins, so the user sees the root cause. A
defensive alternative would be to upgrade `recoverable: true →
false` if the second error is non-recoverable, but that changes
the user-visible error after the fact, which is worse.

**Where.** `src/hooks/useLoopState.ts:237-256` (`error` branch).

**Status.** No fix needed. Pinned by the new test
`"error: from stopping, stopped, complete, error → no-op"`.

#### Finding 3.1.D — INFO — `cooldown` and `stopping` are reachable but not in `quit`'s accept list

**Problem.** None — `cooldown` IS in `quit`'s accept list (line 209)
because the user should be able to abort a wait-out. `stopping` is
NOT, which is correct: `stopping` is the transient "we're about
to exit" state between `quit` and `process.exit()`, and a second
`quit` should be idempotent.

**Status.** No fix needed.

#### Test-suite delta for Task 3.1

The new `describe("Phase 3.1 — full state machine matrix audit",
...)` block adds **25 new tests** (one per action that needs its
no-op set pinned, plus targeted success-case tests for
`server_ready_debug` and `new_session` that were not previously
covered). Coverage breakdown:

- 11 actions covered with their full no-op sets (every state that
  is NOT a transition for that action)
- 2 new success-case tests: `server_ready_debug: from starting`
  and `new_session: from debug`
- 2 new transition tests: `iteration_started` from
  `running("")` and from `paused` with the exact
  `state.iteration + 1` increment contract that
  `startIteration()` depends on
- 3 new `plan_complete` tests: from `running(7)`, from
  `cooldown(4)` (preserves iteration), from `error` (KNOWN BUG
  resets to 0)
- 2 new success-case tests: `rate_limited` from `pausing` →
  cooldown, `session_idle` from debug → debug
- 1 new `quit` test: from `error` is a no-op (the
  `canQuit=true` but reducer-is-no-op decoupling)
- 1 new `retry` test: from `error(recoverable=false)` is a no-op

`bun test src/hooks/useLoopState.test.ts` → **74 pass, 0 fail,
253 expect() calls** (was 49/0/114 before this iteration).
+25 tests, +139 expects, all green.

Full suite: `bun test` → **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.
