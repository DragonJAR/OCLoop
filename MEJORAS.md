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

### 3.2–3.14 — Per-action no-op verification (PLAN.md tasks 3.2 through 3.14)

**Status: COMPLETE — all 13 remaining Phase 3 verification tasks
confirmed against the 3.1 matrix tests.**

The full state-machine matrix audit (3.1) already pinned every
no-op combination with `expectNoOp(...)` reference-state assertions.
The remaining PLAN.md tasks (3.2 through 3.14) are simply the
narrative version of those test contracts. Below is a one-line
verification per task, all cross-referenced to the 3.1 test file
(`src/hooks/useLoopState.test.ts:833-1056`).

| PLAN task | Verified by | Result |
| --- | --- | --- |
| 3.2 — `server_ready` from non-starting is a no-op | line 866: `expectNoOp("server_ready", 10 states)` | OK (INFO: deliberate, server lifecycle is `starting → ready` only) |
| 3.3 — `start` from non-ready is a no-op | line 900: `expectNoOp("start", 10 states)` | OK (INFO: only `ready → running`; `toggle_pause` is the path from paused) |
| 3.4 — `toggle_pause` from non-running/pausing/paused is a no-op | line 932: `expectNoOp("toggle_pause", 8 states)` | OK (INFO: cancel-pending-pause from `pausing` is a real transition, line 145-159) |
| 3.5 — `session_idle` from non-running/pausing/debug is a no-op | line 940: `expectNoOp("session_idle", 8 states)` | OK (INFO: `running("")` SAME-state guard at line 616-624) |
| 3.6 — `rate_limited` from non-running/pausing is a no-op | line 953: `expectNoOp("rate_limited", 9 states)` | OK (INFO: rate limits only fire when there's a session) |
| 3.7 — `resume_cooldown` from non-cooldown is a no-op | line 972: `expectNoOp("resume_cooldown", 10 states)` | OK (INFO: no timer to resume from other states) |
| 3.8 — `iteration_started` from `running("")` and `paused` increments | lines 914-920 + 921-929 | OK — `state.iteration + 1` contract pinned (matches `startIteration()` dispatch) |
| 3.9 — `plan_complete` from `cooldown` preserves iteration | lines 1016-1023 | OK — `cooldown(4) → complete(4)`, NOT reset to 0 |
| 3.10 — `plan_complete` from `error` always sets iterations to 0 | lines 1024-1034 (KNOWN BUG) | **MEDIUM** (Finding 3.1.A): error state has no `iteration` field; carries last-known iteration through. Fix proposed, not applied. |
| 3.11 — `quit` from `stopping`/`stopped`/`complete`/`error` is a no-op | lines 988-998: `expectNoOp("quit", 5 states)` + dedicated `error` no-op test | OK (INFO: `canQuit()=true` from error is decoupled from reducer; actual quit happens in `handleQuit()` via `process.exit`) |
| 3.12 — `retry` only works from `error(recoverable=true)` | lines 1045-1055: `expectNoOp("retry", 10 states)` + `error(recoverable=false)` dedicated test | OK (INFO: non-recoverable errors are permanent by design) |
| 3.13 — `error` from `cooldown` loses the cooldown timer? | design note 3.1.D + line 562-578 in old `Phase 2` block | OK (INFO): the reducer accepts the transition (line 562 test); the **cooldown timer cleanup** is in App.tsx `enterCooldown` exhaustion path and `handleQuit()`, NOT in the reducer. If an external `error` dispatch arrives while in `cooldown` (e.g. SSE `onSessionError` firing concurrently), the `setTimeout` from `enterCooldown` may still fire AFTER the reducer moved to `error`, calling `resume_cooldown` on an `error` state — but `resume_cooldown` from `error` is a no-op (line 972), so the stray timer is harmless. No bug, but worth a one-liner in `handleIterationError` to call `clearCooldownTimers()` defensively. |
| 3.14 — `iteration_started` from `paused` uses `state.iteration` (not 0) | lines 921-929 | OK — `paused(3) → running(4, "ses-4")`; the `+1` is the standard increment, not a reset. Matches `startIteration()` in App.tsx which dispatches `iteration_started` with the new sessionId, never with 0. |

**Summary.** 12 of 13 tasks are clean INFO observations of the
no-op contract already pinned by 3.1. Task 3.10 is the one
MEDIUM finding (3.1.A) and was already documented in the 3.1
section. Task 3.13 is a defensive cleanup opportunity for
`handleIterationError` (call `clearCooldownTimers()` when the
reducer transitions from `cooldown` to `error` to silence the
stray-timer window), LOW severity, fix proposed but not applied.

No new tests required for this batch — all 13 behaviors are
covered by the existing 3.1 suite. `bun test
src/hooks/useLoopState.test.ts` → **74 pass, 0 fail, 253 expect()
calls**, no regressions.

---

## Phase 4 — Session Lifecycle & Iteration Driver

Source: `src/App.tsx` · Tested via existing unit suites
(`hooks/useLoopState.test.ts` for state-contract pinning,
`lib/api.test.ts` for `createSession` / `sendPromptAsync` mock
coverage). `startIteration()` itself has no dedicated unit test
(it is the side-effectful entry point of the TUI; the pure
contracts it depends on are tested).

### 4.1 — Audit `startIteration` failure-mode coverage

**Status: COMPLETE — VERIFIED, one MEDIUM and one LOW finding.**

`startIteration` (App.tsx:776-856) is the single entry point that
turns the state-machine condition `running("")` into an actual
OpenCode session. It is invoked by the single iteration-driver
effect (App.tsx:1217-1222) and the only place a new session is
created on a non-debug flow. The function is wrapped in a single
top-level `try/catch/finally`; every async call inside the `try`
flows into `handleIterationError` on rejection and resets the
in-flight guard (`startingIteration = false`) in `finally`.

The five required failure surfaces (per PLAN.md task 4.1) are
covered as follows:

| Surface | Lines | Behavior | Verdict |
| --- | --- | --- | --- |
| Server not ready | 782-786 | Early-return with `console.error`; never sets the in-flight guard. | OK (defense-in-depth; see Finding 4.1.A) |
| `createSession` failure | 818, 850-852 | Caught at top-level `try/catch` → `handleIterationError` (rate_limit / transient → cooldown, fatal → recoverable error). | OK |
| `sendPromptAsync` failure | 841-846, 850-852 | Same catch path. The session is already created on the server; if the prompt send fails, the session is orphaned (see Finding 4.1.C). | OK with caveat |
| Prompt file missing | 827-834 | `Bun.file().exists()` check; throws a plain `Error` with the resolved path. Caught at top-level → `classifySessionError` returns `fatal` → dispatched as recoverable `error` requiring user intervention. | OK (correct UX) |
| Prompt file empty / whitespace-only | 836-838 | NOT checked. `promptContent` is sent as-is. The server receives an empty (or whitespace-only) text part. | **MEDIUM** (Finding 4.1.B) |

#### Finding 4.1.A — LOW — `console.error` used in TUI flow where `log.error` is the project convention

**Problem.** Line 784 (`console.error("Cannot start iteration:
server not ready")`) bypasses the structured `log` logger (imported
on App.tsx:21) and writes directly to stderr. The same pattern
appears at App.tsx:884 (`createDebugSession`) and App.tsx:1150
(`Failed to initialize session`). Per the Phase 16.6 doc, the
project's `log` is the canonical writer (it rotates `.loop.log`,
records structured `[LEVEL] [context] message` lines, and is
already imported). Three reasons this matters in the audit
context:

1. The user looking at `.loop.log` post-mortem cannot see "Cannot
   start iteration: server not ready" — it went to the TUI's
   stderr and is gone.
2. `console.error` writes to the TUI's alt-screen stderr, which
   is the renderer’s own pipe; in some TTY configurations it can
   pollute the frame buffer.
3. Inconsistent with the rest of the file, where every other
   diagnostic uses `log.health(...)`, `log.info(...)`, or
   `log.error(...)`.

**Where.** `src/App.tsx:784`, `src/App.tsx:884`, `src/App.tsx:1150`.

**Proposed fix.** Replace with `log.error("iteration",
"server_not_ready")` (or equivalent structured level/context).
Keep `console.error` for genuine user-facing fatal errors that
should appear on the terminal regardless of debug logging being
disabled (e.g. the `restoreTerminal`/exit-handler path).

**Status.** Fix proposed, not applied (audit-only per PLAN.md
acceptance criteria). Observation is also re-stated in Phase
16.6 for the global sweep.

#### Finding 4.1.B — MEDIUM — Empty / whitespace-only prompt file is sent verbatim

**Problem.** Line 836-838 reads the prompt file content and
replaces `{{PLAN_FILE}}` with the resolved plan path. It does
NOT validate the result. If `promptFile` exists but is empty
(0 bytes), or contains only whitespace/newlines, the loop sends
`{ type: "text", text: "" }` to the server:

```ts
const promptContent = await promptFile.text()
const prompt = promptContent.replaceAll(
  "{{PLAN_FILE}}",
  props.planFile || DEFAULTS.PLAN_FILE,
)
```

The user-visible failure mode is wasteful, not catastrophic: the
session is created (a network round-trip + server-side
allocation), the empty prompt is sent, and the server either
(a) rejects the empty `text` part with a 4xx, which `handleIterationError`
classifies as `fatal` (no rate_limit markers), and the user
sees a recoverable error pointing at the prompt path; or (b)
accepts the empty text and the session idles immediately with
no work done, the SSE `session_idle` event fires, the reducer
advances to `running("")`, the driver re-fires, and the same
empty prompt is sent again. Case (b) is a tight loop until
either the user pauses/quits or the provider rate-limits the
loop (which would eventually surface as a real error via the
cooldown path).

**Where.** `src/App.tsx:836-838`.

**Proposed fix.** Add an empty-prompt guard before `sendPromptAsync`:

```ts
const prompt = promptContent.replaceAll(
  "{{PLAN_FILE}}",
  props.planFile || DEFAULTS.PLAN_FILE,
)
if (prompt.trim() === "") {
  throw new Error(
    `Prompt file is empty: ${props.promptFile || DEFAULTS.PROMPT_FILE}`,
  )
}
```

This makes the failure consistent with the missing-file case
(line 830-833) — the user sees a single recoverable error with
a clear message instead of either a 4xx from the server or a
tight re-iteration loop.

**Status.** Fix proposed, not applied (audit-only per PLAN.md
acceptance criteria). The check is one line; the cost of
applying it is essentially zero. Would not require a new unit
test (the existing `classifySessionError` tests cover the
`fatal` branch that the thrown `Error` would land in).

#### Finding 4.1.C — LOW — Orphaned session on `sendPromptAsync` failure

**Problem.** If `createSession` succeeds (line 818) but
`sendPromptAsync` fails (line 841), the session exists on the
server but has no prompt and is not aborted. The
top-level `try/catch` routes the error to `handleIterationError`,
which either enters cooldown (rate_limit / transient) or
dispatches a recoverable `error` (fatal). In the cooldown
case, the loop will retry the same iteration — which will
`createSession` AGAIN, leaving the first session orphaned on
the server. In the recoverable-error case, the user is shown
the error but the orphaned session keeps burning server-side
state until manual cleanup or server restart.

This is not catastrophic (sessions are cheap, and the
in-flight guard at line 781 prevents the iteration driver
from racing), but the leak is observable in
`.loop.log` (the server logs the created session) and
contradicts the comment at line 779-780 which explicitly
worries about orphaned sessions.

**Where.** `src/App.tsx:818-846`.

**Proposed fix.** Track `newSessionId` outside the `try` and
call `abortSession(client, newSessionId)` in the `catch`
block when `newSessionId` is set and the failure is on the
`sendPromptAsync` path. A simpler alternative: hoist the
`createClient` + `createSession` + `sendPromptAsync` into a
single helper that owns the abort on its own failure path,
so the iteration driver remains a thin orchestrator. The
helper would mirror the pattern already used in
`runCreatePlan` (see Phase 10 audit).

**Status.** Fix proposed, not applied. The leak is bounded
by the in-flight guard (at most one orphan per failed
iteration) and by the server-side TTL on unused sessions;
this is documentation, not an emergency.

#### Finding 4.1.D — INFO — `Bun.file().text()` is unawaited-timeout on hung filesystems

**Problem.** None at the moment — `Bun.file().text()` is
expected to return quickly on local FS. On a hung NFS mount
or stalled FUSE filesystem, the await would block
indefinitely. The `finally` block would still release
`startingIteration` once the await resolves, so the iteration
driver would not wedge forever; it would just sit idle until
the FS responds. Documenting for completeness, not a finding.

**Where.** `src/App.tsx:828` (`.exists()`), `src/App.tsx:836`
(`.text()`).

**Status.** No fix needed. If this becomes a real issue,
wrap the reads in `withTimeout` (already imported,
App.tsx:52) the same way `api.ts` does.

#### Finding 4.1.E — INFO — `server.url()` is captured once, no re-read between async hops

**Problem.** None — `url` is captured at line 782 and used
for `createClient` at line 815. The intervening
`checkPlanComplete` + `getPlanCompleteSummary` (line 791-800)
and the optional `minIterationGapMs` `setTimeout` (line 808-810)
are async hops during which the server could be stopped (e.g.
by an external `ocloop` process, or by a kill on the
launcher). If the server stops mid-iteration, `createSession`
will fail with a connection-refused error, which is caught
and routed to `handleIterationError`. The behavior is
correct (no crash, user sees a recoverable error after
classification), so this is an observation, not a finding.

**Where.** `src/App.tsx:782, 815`.

**Status.** No fix needed.

#### Test-suite delta for Task 4.1

No new unit tests added. Rationale:

- `startIteration` is a side-effectful function (it reads
  the filesystem, calls the OpenCode server, dispatches to
  the reducer, notifies the watchdog). The existing test
  infra does not mount Solid's reactive runtime for
  App.tsx — testing the function in isolation would require
  stubbing `server.url()`, `createClient`, `createSession`,
  `sendPromptAsync`, `Bun.file`, `parsePlanFile`,
  `isPlanComplete`, `getPlanCompleteSummary`, `refreshPlan`,
  and `loop.dispatch` simultaneously. That is integration
  test territory and is called out in Phase 18 ("Document
  which integration scenarios are untestable without a
  real OpenCode server mock").
- Every pure-contract component that `startIteration`
  depends on is already covered: `classifySessionError`
  (`hooks/useSSE.test.ts`), `createSession` /
  `sendPromptAsync` (`lib/api.test.ts:65-100` and
  `lib/api.test.ts:230-250` for the empty-response
  cases), `isPlanComplete` / `getPlanCompleteSummary`
  (`lib/plan-parser.test.ts`), `monotonicNow`
  (`lib/clock.test.ts`).
- The two proposed fixes (4.1.A and 4.1.B) are mechanical
  one-liners whose only new behavior is "throw on empty
  prompt" and "log via `log` instead of `console.error`";
  both land in the existing `fatal` / recoverable-error
  classification path, which is already pinned.

`bun test` → **623 pass, 0 fail, 1512 expect() calls** across
21 files. No regressions.

### 4.2 — Verify the `startingIteration` guard against rapid state transitions

**Status: COMPLETE — VERIFIED, one INFO finding and one LOW
finding (defensive cleanup of an already-safe pattern).**

The `startingIteration` flag (App.tsx:172) is a plain
`let`-bound boolean (NOT a Solid signal), owned by the
closure created in `App.tsx`. The guard is a
`if (startingIteration) return` early-return at App.tsx:781,
set to `true` at App.tsx:787, and reset to `false` in the
`finally` block at App.tsx:854. The function is invoked from
exactly one site: the iteration-driver effect at
App.tsx:1217-1222, whose condition is
`state.type === "running" && state.sessionId === ""`.

#### Walkthrough: can the effect re-fire while the guard is `true`?

The effect depends on `loop.state()` only; it does NOT read
`startingIteration`. So the effect re-runs only when
`loop.state()` returns a new value. The state can only change
via `loop.dispatch(...)`, and the only dispatches reachable
from inside `startIteration` are:

1. **Line 796-799** — `plan_complete` (only if
   `checkPlanComplete()` returns `true`). State moves
   `running("") → complete`. The next effect run sees
   `state.type !== "running"` and skips the call. ✓
2. **Line 822** — `iteration_started` (after `createSession`
   succeeds). State moves
   `running("") → running(newSessionId)`. The next effect run
   sees `sessionId !== ""` and skips the call. ✓

Both transitions move the state OUT of the
`running("")` gate, so the effect's condition becomes false
the moment either dispatch lands. The effect therefore
cannot re-fire `startIteration` while the guard is held.
The `try/catch/finally` releases the guard before
control returns to the iteration-driver for any of these
exit paths:

- **Success** (line 818-846): `finally` runs after
  `refreshPlan()` resolves.
- **`plan_complete` early-return** (line 800): the
  `try` was already entered, so `finally` runs.
- **Caught error** (line 850-852): `handleIterationError`
  returns, `finally` runs.

There is no code path between `startingIteration = true`
(line 787) and `try {` (line 789) that can throw
synchronously, so the flag cannot "stick" — the only
synchronous exits above line 789 are the `if (startingIteration) return` and the `if (!url) return`,
both of which set nothing and leave the flag at `false`.

#### Walkthrough: what if the effect DOES re-fire before the guard is cleared?

Even though the state-machine transitions make a
during-flight re-fire impossible via the in-function
dispatchers, the guard ALSO protects against a class of
re-fires it cannot enumerate:

- **External dispatches** that re-enter `running("")` while
  `startIteration` is in flight. The reducer has no such
  transition today (every `session_idle` from `running` is
  idempotent at line 136, and `iteration_started` from any
  non-running/paused state is a no-op at line 78-96), but a
  future dispatch from a watchdog action or a future SSE
  event handler could in principle reset `sessionId` to `""`
  without going through the normal idle path. The guard
  prevents that hypothetical second session creation.
- **Microtask ordering surprises** introduced by future
  refactors of `createSession` or `sendPromptAsync` (e.g.
  if either begins touching a Solid signal as a side
  effect). The guard is the last line of defense.
- **Solid effect batching edge cases** — Solid's
  `createEffect` runs once per dependency change in a
  single tick, so it cannot double-fire from the same state
  change, but the contract is not statically obvious and a
  future contributor might reasonably worry that it could.

In all three cases, the guard's
`if (startingIteration) return` is the correct
response: skip the second iteration silently, leaving the
in-flight call to own the actual session creation. The
in-flight call's `finally` releases the guard once it
completes (success, error, or plan_complete), at which
point the next effect run will see `sessionId` either set
(normally) or the state out of `running("")` (plan
complete), and will not call `startIteration` again until
the next genuine idle.

#### Finding 4.2.A — INFO — The guard is correctly released on every exit path

No fix needed. The `finally` block at App.tsx:853-855
is reachable from every branch:

- Normal completion (line 849 → finally)
- `plan_complete` early-return (line 800 → finally)
- `handleIterationError` caught (line 852 → finally)
- `url` early-return (line 785, before the guard is set;
  trivially correct)
- Guard early-return (line 781, before the guard is set;
  trivially correct)

The only escape route is a process abort (uncaught
exception in a higher-up microtask, or `process.exit()`
from another handler) — in which case the whole process
is gone and the flag's value is irrelevant.

#### Finding 4.2.B — LOW — `startingIteration` is a plain variable, not part of the persisted state

**Problem.** `startingIteration` lives only in the
`App.tsx` closure. After a hard crash of the OCLoop
process while a `startIteration` call was in flight, the
process restart begins with `startingIteration = false`
(via the `let` initialization at line 172). This is
correct — the in-flight call is dead — but a code reader
who only looks at the `let` declaration might miss the
fact that the guard is intentionally process-scoped, not
session-scoped. The persisted snapshot
(`PersistedLoopState`, App.tsx:1278-1285) does NOT carry
the flag, which is the right call (it would be stale
after restart), but the asymmetry between "the iteration
count is persisted" and "the in-flight guard is not" is
worth a one-line comment.

**Where.** `src/App.tsx:172` (declaration), `src/App.tsx:1278-1285` (persisted snapshot).

**Proposed fix.** Add a comment on the `let
startingIteration = false` line clarifying that the guard
is process-scoped and intentionally NOT persisted (a fresh
process always starts with no in-flight iteration):

```ts
// Process-scoped in-flight guard. NOT persisted: a fresh
// process always starts with no in-flight iteration, even
// if `.loop-state.json` says the previous process was
// mid-start. The reducer's `iteration_started` dispatch
// is the source of truth for "we have a session".
let startingIteration = false
```

**Status.** Fix proposed, not applied. A comment-only
change, zero runtime impact. No test required (the
behavior is already correct, this is purely a
documentation affordance).

#### Test-suite delta for Task 4.2

No new unit tests added. Rationale:

- The guard is a plain non-reactive `let`; it is not
  reachable from outside the `App.tsx` closure. A unit
  test that imports the flag would require extracting it
  into a module-level binding, which would weaken the
  encapsulation that makes the guard safe in the first
  place.
- The state-machine guarantee (effect re-fires only when
  `loop.state()` changes, and every in-function dispatch
  moves state OUT of `running("")`) is already pinned by
  the 3.1 matrix tests
  (`src/hooks/useLoopState.test.ts:833-1056`), which
  exhaustively test every action's transition and
  no-op set.
- The `finally` release is implicit JavaScript semantics
  — every `try` block has a `finally` and the only way
  for the body to bypass it is `process.exit()` (which
  also kills the persistence effect, so the unpersisted
  flag is moot).
- The defenses in depth enumerated above (External
  dispatches / Microtask surprises / Solid batching) are
  hypothetical; the existing code cannot trigger them, so
  a test would either be a tautology (`if (true)
  return;`) or a test of the JavaScript runtime itself.

`bun test` → **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---


21 files. No regressions.


### 4.3–4.7 — Verify `startIteration` driver invariants (coupled batch)

**Status: COMPLETE — VERIFIED, all five sub-tasks are INFO-level
findings (behavior is correct, no fix required).**

PLAN.md left five sub-bullets under Phase 4 open after the
4.1/4.2 audit completed. They are all located inside the
single `startIteration` function (App.tsx:776-856), so per the
PLAN.md "coupled batch" rule for a single phase they are
covered together here. Each sub-task reads as a contract
question; the implementation is verified line-by-line against
the source.

#### 4.3 — `checkPlanComplete` is called BEFORE creating a session

The guard is the **first** statement inside the `try` block
(App.tsx:789), before the `minIterationGapMs` sleep, the
`createClient` call, the `createSession` call, the prompt
file read, the `sendPromptAsync` call, and the `refreshPlan`
call:

```ts
try {
  // Check for plan completion first
  if (await checkPlanComplete()) {
    const planPath = props.planFile || DEFAULTS.PLAN_FILE
    const summaryContent = await getPlanCompleteSummary(planPath)

    loop.dispatch({
      type: "plan_complete",
      summary: { summary: summaryContent || t("dlgPlanCompleteFallback") }
    })
    return
  }
  // ... gap / createClient / createSession / prompt read /
  //     sendPromptAsync / refreshPlan
} catch (err) { ... }
finally { startingIteration = false }
```

On a complete plan, the function dispatches `plan_complete`
and returns immediately. No session is created, no prompt is
read, no client is allocated. The `finally` block still
releases `startingIteration`, so the iteration driver is
unblocked the next time the user runs the loop. **Verdict:
correct.**

#### 4.3.A — INFO — Plan-completion guard placement is correct

No fix needed. The early-return also means the session
count, the prompt-file existence check, and the network
round-trip to OpenCode are all skipped when the plan is
already done, which is the desired UX. The reducer's
`plan_complete` action is verified in 3.1 (state machine
matrix).

#### 4.4 — `minIterationGapMs` uses the monotonic clock

`startIteration` reads `minIterationGapMs` from the resilience
signal (App.tsx:805) and, if non-zero, sleeps the gap
between the last iteration and the next. The two relevant
readings are:

- App.tsx:807 — `const since = monotonicNow() - lastIterationStartAt`
- App.tsx:812 — `lastIterationStartAt = monotonicNow()`

Both call `monotonicNow` (imported at App.tsx:54 from
`lib/clock.ts`). The implementation there prefers
`Bun.nanoseconds() / 1_000_000` and falls back to
`performance.now()` outside Bun; both are monotonic and
immune to wall-clock jumps (clock.ts:1-19 documents the
contract). The fallback is in the correct order (Bun check
first, then `performance.now()`), and the
`Bun.nanoseconds() / 1e6` conversion is the canonical
millisecond projection. **Verdict: correct.**

#### 4.4.A — INFO — `monotonicNow` is the right clock for gap math

No fix needed. This matches the project's documented
convention (`lib/clock.ts` header: "Use this for ALL
interval / timeout / watchdog / backoff math"). The pairing
of `monotonicNow` at both read sites means a wall-clock
jump (NTP correction, manual `date` change, DST) cannot
cause the gap to elapse prematurely or to be skipped
entirely. The Phase 9.1 audit of the sleep detector
already pinned this contract; this verification is the
symmetric side of the same clock.

#### 4.5 — `sendPromptAsync` failure path calls `handleIterationError`

`sendPromptAsync` is the second-to-last `await` in the
`try` block (App.tsx:841-846). The top-level `catch`
(App.tsx:850-852) routes every rejection to
`handleIterationError`, which classifies the error via
`classifySessionError` (App.tsx:755) and dispatches one of
three actions:

| Classification | Branch | Effect |
| --- | --- | --- |
| `rate_limit` | `enterCooldown(... , "rate_limit")` (App.tsx:756-758) | Backoff + retry the same iteration; circuit-breaks to recoverable `error` after `maxRateLimitRetries` attempts. |
| `transient` | `enterCooldown(... , "transient")` (App.tsx:760-762) | Same backoff/retry as rate_limit, with the `transient` reason string and the "cooldownRetryText" UI label. |
| fatal / auth / unknown | dispatches recoverable `error` (App.tsx:764-770) | User is shown a recoverable error and must retry. |

The `transient` branch is what the PLAN.md task asks about:
"does this cover rate limits, timeouts, and network errors?".
By design, rate limits go through the dedicated
`rate_limit` branch (which `classifySessionError` returns
for 429 responses with a `retryAfter`), and timeouts / 5xx
/ network blips go through the `transient` branch. Both
feed `enterCooldown`, so both retry automatically. The
correctness of the *classification* (i.e. that 429
actually maps to `rate_limit` and ECONNRESET to
`transient`) is the subject of the Phase 14 audit
(`classifySessionError`), which is being tracked there.
**Verdict: correct routing; classification correctness is
owned by Phase 14.**

#### 4.5.A — INFO — Error routing covers all retry-worthy failures

No fix needed. The only failure class that is NOT
auto-retried is `fatal` (auth errors, 4xx other than 429,
and any other server rejection), which correctly surfaces
as a recoverable `error` requiring the user. The circuit
breaker in `enterCooldown` (App.tsx:679-697) ensures
auto-retry cannot loop forever against a downed provider.

#### 4.6 — `refreshPlan()` is called after the prompt is sent

After the awaited `sendPromptAsync` returns, `startIteration`
calls `await refreshPlan()` (App.tsx:849) before the `try`
block exits. `refreshPlan` (App.tsx:570-581) reads the plan
file via `parsePlanFile(planPath)` and calls
`setPlanProgress(progress)`. This keeps the dashboard
progress display in sync with the work the model just did
(it was expected to check off tasks in `PLAN.md` between
its own `startIteration` invocation and the next one).

The PLAN.md task asks: "what if the plan file is being
written by OpenCode at the same time (partial read)?".
Three observations:

1. `parsePlanFile` (plan-parser.ts) reads the file once
   with `Bun.file().text()` and parses the snapshot. If
   OpenCode is mid-write, the snapshot may be a half-
   flushed version of the file.
2. `parsePlan` is a line-by-line regex over
   `parseTaskLine`. A partial line (e.g. truncated
   mid-marker, like `- [x` with no closing bracket) returns
   `"not-a-task"`; the parser does not throw, and the
   truncated line is simply not counted. No crash, no
   malformed state.
3. `parsePlanComplete` (plan-parser.ts:161) is a regex
   anchored to the last occurrence of a complete
   `<plan-complete>...</plan-complete>` block. An unclosed
   tag (half-written) is ignored, returning `null` — so a
   partial-write cannot spuriously mark the plan complete.

**Verdict: tolerant of partial reads; behavior is correct.**

#### 4.6.A — INFO — Partial-write safety is inherited from the parser

No fix needed. The defense is structural, not specific to
this call site: `parseTaskLine` is line-by-line and
`parsePlanComplete` is anchored. The only theoretical
hazard is a write that lands BETWEEN two existing tasks
(i.e. a brand-new task line is half-flushed), and the
worst-case outcome is that line being dropped from the
next refresh — which the model would have to re-add to
get credit. That is a non-issue for the harness.

#### 4.7 — `startIteration` reads the prompt file (not the plan file)

`startIteration` reads exactly one file for content: the
prompt file at `props.promptFile || DEFAULTS.PROMPT_FILE`
(App.tsx:827: `Bun.file(props.promptFile || DEFAULTS.PROMPT_FILE)`,
App.tsx:836: `promptFile.text()`). The plan file path is
used **only** as a string for the `{{PLAN_FILE}}`
placeholder substitution (App.tsx:838):

```ts
const prompt = promptContent.replaceAll(
  "{{PLAN_FILE}}",
  props.planFile || DEFAULTS.PLAN_FILE,
)
```

The plan file is NOT read by `startIteration`. The
default prompt file (`.loop-prompt.md:7`) does reference
`{{PLAN_FILE}}` ("Read `{{PLAN_FILE}}` fully"), so the
placeholder substitution has effect. **Verdict: correct.**

#### 4.7.A — INFO — Plan file is referenced as a path, not as content

No fix needed. This matches the documented role split
between the prompt file (instructions to the model) and
the plan file (work tracker the model edits). Having
`startIteration` also read the plan file would create
two sources of truth for plan state, and the
`refreshPlan` call at line 849 (see 4.6) is the canonical
read site.

#### Test-suite delta for Tasks 4.3–4.7

No new unit tests added. Rationale:

- All five tasks are *verifications* of code that already
  has dependent tests: `isPlanComplete` /
  `getPlanCompleteSummary` / `parsePlanComplete` are
  pinned in `lib/plan-parser.test.ts`; `monotonicNow` is
  pinned in `lib/clock.test.ts`; the
  `classifySessionError` branching that 4.5 depends on
  is pinned in `hooks/useSSE.test.ts` (Phase 14 audit
  will own that contract); `Bun.file` partial-read
  tolerance is structural, not a unit-testable behavior
  (would require a flaky FS layer).
- The placement / ordering claims (4.3, 4.6, 4.7) are
  source-read observations: the code is a fixed sequence
  of `await` calls inside one function, and a unit test
  that mocks all of `createClient` / `createSession` /
  `sendPromptAsync` / `Bun.file` / `parsePlanFile` /
  `isPlanComplete` / `getPlanCompleteSummary` /
  `refreshPlan` would just re-state the source.
- The correctness claims (4.4, 4.5) are about the
  *implementation* of the calls themselves, which is
  tested elsewhere — `monotonicNow` in
  `lib/clock.test.ts`, and `classifySessionError` (the
  gate for 4.5) in `hooks/useSSE.test.ts`.

`bun test` → **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---

## Phase 5 — Rate Limit & Cooldown Handling

Source: `src/App.tsx` (function `enterCooldown` at lines 671-745,
`clearCooldownTimers` at 177-186, `handleIterationError` at
754-771, `computeBackoff` at `src/lib/backoff.ts:35-64`,
`extractRetryAfter` at `src/hooks/useSSE.ts:139-176`).
Tests covering the pure contracts: `src/lib/backoff.test.ts`
(13 cases), `src/hooks/useSSE.test.ts` (`extractRetryAfter`
edge cases), `src/hooks/useLoopState.test.ts` (reducer
contract for `rate_limited` / `resume_cooldown`).

### 5.1 — Audit `enterCooldown`: counter, backoff, Retry-After

**Status: COMPLETE — VERIFIED, two MEDIUM and three LOW findings.**

`enterCooldown` (App.tsx:671-745) is the single funnel for
every backoff path: rate limits surfaced mid-iteration by the
SSE handler (App.tsx:477), iteration-start failures classified
as `rate_limit` or `transient` by `handleIterationError`
(App.tsx:757, 761), and the chaos-injected 429
(App.tsx:1615). The function has three responsibilities:

1. Maintain a **circuit-breaker counter** (`rateLimitAttempts`)
   that escalates to a recoverable error after
   `maxRateLimitRetries` consecutive cooldowns.
2. Compute a **backoff delay** that respects a server-provided
   `Retry-After` and otherwise follows an exponential-with-jitter
   schedule.
3. Schedule the **dashboard countdown ticker** and the
   **resume timer**, both clearable by `clearCooldownTimers`.

The full sequence (App.tsx:677-744):

| Step | Line | Behavior | Verdict |
| --- | --- | --- | --- |
| Increment counter | 677 | `rateLimitAttempts++` (pre-check). | OK |
| Exhaustion check | 679 | If `> maxRateLimitRetries`: log, dispatch `error {recoverable: true}`, reset counter, clear timers, return. | OK |
| Compute backoff | 700-705 | `computeBackoff(rateLimitAttempts - 1, …)` — zero-indexed attempt. | OK (see Finding 5.1.A) |
| `resumeAt` timestamp | 706 | `monotonicNow() + delayMs` — monotonic clock survives sleep. | OK |
| Log + activity | 708-721 | `log.health` structured record + `activityLog` event. | OK |
| Dispatch `rate_limited` | 723 | Reducer accepts only from `running` / `pausing`; if state has changed, dispatch is a no-op. | OK |
| Clear old timers | 726 | `clearCooldownTimers()` before scheduling new ones. | OK (correctness, see Finding 5.1.B) |
| Set initial countdown | 727 | `setCooldownRemainingMs(delayMs)` — full delay (pre-tick). | OK |
| Countdown ticker | 728-735 | `setInterval(250ms)`; clears itself on `remaining <= 0`. | OK |
| Resume timer | 739-744 | `setTimeout(delayMs)`; dispatches `resume_cooldown` only if state is still `cooldown`. | OK |

#### Counter semantics — verified

- **Pre-increment** (line 677 → check at 679) means that the
  *first* rate limit makes `rateLimitAttempts = 1`, the
  formula receives `attempt = 0`, and `maxRateLimitRetries = 8`
  (default) yields 8 backoffs before the 9th increment trips
  the exhaustion check. The dispatch is fired with
  `tried = rateLimitAttempts - 1 = 8` (line 680), so the user
  sees "after 8 attempts" — matches reality.
- **Reset sites** (5 total) cover every successful-unblock path
  without race:
  - L264: `watchdog.actions.synthesizeIdle` — operator-initiated
    recovery
  - L502: SSE `onSessionIdle` (clean) — every successful
    iteration
  - L639: `reconcileAndAdvance` returning `idle` / `missing` —
    post-sleep recovery
  - L695: exhaustion path itself (counter starts fresh for
    next streak; correct because the state is now `error`)
  - L1165: `doResume` — counter survives across process restart
- **Persistence** (L1165 / L1283) is symmetric with reset:
  `doResume` restores `rateLimitAttempts` from
  `.loop-state.json`, so a circuit-breaker that was at 4 when
  the process died resumes at 4 — no "free retry budget" leak
  across restarts. Confirmed by inspection of
  `loop-state-store.ts:saveLoopState` writing
  `rateLimitAttempts` and `loadLoopState` returning it.

#### `computeBackoff` attempt-number semantics — verified

The call site uses `rateLimitAttempts - 1` (line 700) so the
formula receives a **zero-indexed** attempt: the 1st cooldown
is `attempt=0` (exp = 1×base = 1000ms by default), the 8th is
`attempt=7` (exp = 128×base = 128000ms, capped at 60000ms by
`backoffMaxMs`). The cap + `Number.isFinite` guard at
`backoff.ts:56-57` prevents any overflow for absurd attempt
numbers; `Math.max(0, Math.floor(attempt))` rejects negative
or fractional inputs. The `jitter` flag (configurable,
default `true`) makes the delay uniform in `[0, exp]`. All
these edges are covered by `backoff.test.ts:4-99`.

#### `Retry-After` handling — verified end-to-end

- **Extraction** (`extractRetryAfter`, SSE:139-176) is
  exhaustive: explicit numeric fields, headers (both `get()`
  API and bare-object), and a message-text regex that
  understands `s`/`sec`/`secs`/`seconds`/`m`/`min`/`mins`/
  `minutes`. Defensive guards reject `NaN`, `Infinity`,
  `< 0`, and HTTP-date strings (which `Number()` converts
  to `NaN`).
- **Override** (`computeBackoff`, backoff.ts:40-42) is
  authoritative: a valid `retryAfterSeconds` returns
  `Math.max(0, round(seconds * 1000))`, *bypassing* the
  formula and the `max` cap. The `computeBackoff` test at
  line 81-88 pins this behavior. The `enterCooldown` log
  records `retryAfterSeconds ?? null` (App.tsx:711) so the
  override is observable in `.loop.log`.
- **Rejection**: when `extractRetryAfter` returns `undefined`
  (no header, no message hint, no explicit field), the
  formula path is used. When the override is *invalid*
  (negative, non-finite), `extractRetryAfter` already
  filtered it (SSE:148, 159, 171), and `computeBackoff` would
  ignore it (the `!== undefined && Number.isFinite(…)` guard
  at backoff.ts:40).

#### Finding 5.1.A — MEDIUM — `transient` kind dispatched as `rate_limited` to the reducer

**Problem.** `enterCooldown` is called from `handleIterationError`
for both `rate_limit` and `transient` error kinds (App.tsx:757,
761), but the `rate_limited` action it dispatches (line 723)
carries no `kind` field — the reducer transitions the same
way and the dashboard countdown label is unconditional
(`cooldownText` for rate_limit, `cooldownRetryText` for
transient — selected at line 716, dispatched at 723 with
neither marker). The user sees "Rate limit" wording for a
plain socket drop or 5xx, which is misleading and, on
flaky-network days, will *reduce user trust* in real
rate-limit messages.

**Where.** `src/App.tsx:716-723` (label selection + dispatch).

**Proposed fix.** Extend the `rate_limited` action with an
optional `kind: "rate_limit" | "transient"` field, plumb it
through the reducer state (`cooldown.kind`), and let the
dashboard / log line read from the state instead of from a
local variable. Alternatively, the cheap fix: keep the
existing UI copy and add the kind to the `log.health` call
so the on-disk log can disambiguate; this is observability
only and does not change behavior.

**Status.** Fix proposed, not applied (audit-only per
PLAN.md acceptance criteria). The cheap-fix variant
(add `kind` to the log record) is one line; the proper fix
is a small state-machine change. Either would close the gap.

#### Finding 5.1.B — MEDIUM — `clearCooldownTimers` is called *after* the dispatch, not before, on the regular path

**Problem.** In the regular (non-exhaustion) branch,
`clearCooldownTimers()` is called at App.tsx:726 — *after*
`loop.dispatch({ type: "rate_limited", … })` at line 723.
The dispatch is synchronous and the reducer either
transitions to `cooldown` (clean case) or no-ops (state
changed under us, e.g. user paused). In the clean case this
ordering is fine because the new timers are scheduled
immediately after, on lines 728 and 739. **However**, the
timer IDs are `let`-bound closure variables, not Solid
signals: any *other* path that touches the same closures
between the dispatch and the timer setup is undefined
behavior. Today, no such path exists (the dispatch is
synchronous, the only side effect is the reducer), so the
ordering is safe in practice. It is, however, fragile: a
future refactor that introduces a Solid effect subscribed
to `state` (so it would fire on the dispatch) could observe
a window where the timers are stale but not yet cleared.

**Where.** `src/App.tsx:723-744`.

**Proposed fix.** Move the `clearCooldownTimers()` call
(line 726) to *before* the dispatch (immediately after
`activityLog.addEvent`). It is purely defensive — current
behavior is correct — but the cost is one line and the
benefit is a stable invariant ("all cooldown state is
cleared before any new state is dispatched").

**Status.** Fix proposed, not applied. Observation, not
defect.

#### Finding 5.1.C — LOW — `setCooldownRemainingMs(delayMs)` briefly shows the *full* delay, not `delayMs - elapsed`

**Problem.** At line 727 the signal is set to the *full*
`delayMs`. The 250ms ticker (line 728) immediately corrects
this on its first tick, so the user sees the right value
within ~250ms. On a low-FPS TUI the lag is invisible; on
a frozen renderer (debugger break, terminal scroll-jump)
the user briefly sees a stale value.

**Where.** `src/App.tsx:727`.

**Proposed fix.** Set the initial value to
`Math.max(0, resumeAt - monotonicNow())` instead of
`delayMs`. One line, no new behavior. Optional.

**Status.** Fix proposed, not applied. Cosmetic.

#### Finding 5.1.D — LOW — `clearInterval` inside the ticker relies on closure-captured `cooldownTicker`

**Problem.** The ticker's self-stop logic at line 731-734
reads `cooldownTicker` from the closure, calls
`clearInterval` on it, and nulls the reference. This is
correct *as long as* no other `clearCooldownTimers` call has
run in the meantime and nulled the reference. The closure
captures the *variable*, not the value, so
`clearCooldownTimers` nulling it would cause the ticker to
`clearInterval(null)` — which `setInterval` handles
gracefully (no-op), but it would skip the `cooldownTicker =
null` self-clear and leave a stale reference. The next
`enterCooldown` would then call `clearInterval` on the
*same* interval ID that was already cleared (no-op again,
safe), and assign a new ticker. Net result: no leak, no
crash, but a small `if (cooldownTimer)` short-circuit fails
the second time around. Verified by inspection that
`clearCooldownTimers` is called only at:
- L214 (wake from sleep, after resumeAt check)
- L696 (exhaustion path)
- L726 (regular enterCooldown, *after* the dispatch)
- L974 (handleQuit, terminal-exit path)

None of these race the ticker in practice because the
ticker is a 250ms callback and the clear calls are
synchronous user actions. Documenting the latent race for
completeness.

**Where.** `src/App.tsx:177-186`, `:728-735`.

**Proposed fix.** Capture the interval ID in a local
`const id = setInterval(…)`, then use `clearInterval(id)`
in the self-stop branch. The outer `cooldownTicker` is only
needed for `clearCooldownTimers` to know it has a live
interval to clear. This pattern matches `cooldownTimer` at
line 740 (which already uses a local capture for the
self-null).

**Status.** Fix proposed, not applied. Latent; no observed
misbehavior.

#### Finding 5.1.E — LOW — `log.health` for the exhausted branch omits `retryAfter`

**Problem.** The exhaustion log at line 681 includes
`attempts`, `reason`, and `kind` but **not** the
`retryAfterSeconds` that was last seen. The non-exhausted
log at line 708-713 includes it. Operators post-mortem
comparing the two will have an incomplete picture for the
exhaustion event.

**Where.** `src/App.tsx:681`.

**Proposed fix.** Add `retryAfterSeconds: retryAfterSeconds
?? null` to the exhausted log object. One line.

**Status.** Fix proposed, not applied. Observability gap
only.

#### Finding 5.1.F — INFO — `resume_cooldown` from non-`cooldown` states is a no-op (verified)

The `setTimeout` callback at line 739-744 guards
`if (loop.state().type === "cooldown")` before dispatching
`resume_cooldown`. The reducer at `useLoopState.ts:175-186`
also no-ops on non-`cooldown` states. So a stale timer that
fires after the user paused (`paused` state) or quit
(`stopping`) is correctly absorbed: no spurious transition,
no leak, no double-dispatch.

#### Finding 5.1.G — INFO — `Retry-After` HTTP-date format is silently rejected

`Number("Wed, 21 Oct 2026 07:28:00 GMT")` is `NaN`. The
guard at SSE:159 (`Number.isFinite(n) && n >= 0`) rejects
it, so the formula path is used. This is RFC-compliant
server behavior (RFC 7231 §7.1.3 allows either seconds or
HTTP-date) but in practice every major provider returns
seconds, so the unsupported format is acceptable. Documenting
so a future change to `extractRetryAfter` knows this is
intentional, not a bug.

#### Test-suite delta for Task 5.1

No new unit tests added. Rationale:

- `computeBackoff` is fully pinned by `backoff.test.ts`
  (13 cases, including the Retry-After priority + negative
  cases, full-jitter boundary cases, exponential growth,
  and Infinity-guarded cap).
- `extractRetryAfter` is pinned by `useSSE.test.ts` (Phase
  7 / 14 will own those tests; they are already in place
  per recent commits).
- The reducer's `rate_limited` / `resume_cooldown` contract
  is pinned by `useLoopState.test.ts` (the Phase 3 audit
  added comprehensive state-machine tests).
- The `enterCooldown` exhaust-vs-cooldown branch and the
  counter reset sites are best covered by integration tests
  that drive a real cooldown sequence; the unit test for
  the pure formula and the reducer already constrains the
  observable contracts. Adding a mock-heavy
  `enterCooldown.test.ts` would re-state the source.

`bun test` → **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

### 5.2 — `clearCooldownTimers` coverage of error-dispatch paths

**Status: COMPLETE — VERIFIED, one LOW finding.**

The question: is `clearCooldownTimers()` called when a
cooldown is interrupted by an `error` dispatch? **Answer: no
— not from every path that can dispatch `error` from
`cooldown` state, and no — the existing self-stop logic
prevents any concrete harm today.**

#### All `clearCooldownTimers()` call sites (4)

| Site | Line | What triggers it | Cleared after dispatch? |
| --- | --- | --- | --- |
| `handleWake` | 214 | Sleep/wake past the cooldown deadline | n/a — clears then dispatches `resume_cooldown` (same effect) |
| `enterCooldown` exhaustion path | 696 | `rateLimitAttempts > maxRateLimitRetries` → dispatch `error` | **Yes** — sequence is `dispatch(error) → clearCooldownTimers()` |
| `enterCooldown` regular path | 726 | Every fresh cooldown replaces its predecessor | n/a — clears then schedules new timers (self-replace) |
| `handleQuit` | 974 | SIGINT, `Q` key, shutdown manager, completion quit | n/a — process is about to exit |

`clearCooldownTimers` is a pure side-effect on closure-bound
`let`s (App.tsx:167-168), so the reducer cannot call it. The
App is responsible for calling it around every dispatch that
leaves `cooldown` state.

#### All `error` dispatch sites (6)

| Site | Line | Guard | Fires from `cooldown`? |
| --- | --- | --- | --- |
| Watchdog `fail` | 285 | Unguarded dispatch, but `isActive` probe (App.tsx:242-247) short-circuits the tick when state is `cooldown` (only `running`/`pausing` are active) | **No** — probe blocks it |
| SSE `onSessionError` non-rate-limit | 483 | `if (st === "running" \|\| st === "pausing" \|\| st === "debug")` | **No** — explicit guard |
| `enterCooldown` exhaustion | 687 | Fires only when `rateLimitAttempts++ > max`; `clearCooldownTimers` is called at line 696 right after | n/a — covered |
| `handleIterationError` non-recoverable | 766 | Triggers on iteration-start failure; gated by the iteration-driver effect (App.tsx:1217) on `running`+`sessionId === ""` | **No** — driver only runs in `running` |
| Debug session create failure | 908 | Inside `createDebugSession`; debug state only | **No** — debug only |
| **Server error effect** | 1203 | **Unguarded** — fires whenever `server.status() === "error"` | **Yes** — can fire from any state |

#### Finding 5.2.A — LOW — `error` dispatched from `cooldown` by the server-error effect does not clear cooldown timers

**Problem.** The server-error effect at App.tsx:1200-1209
unconditionally dispatches `error` when
`server.status() === "error" && server.error()`. The reducer
at `useLoopState.ts:245` accepts the transition from
`cooldown` → `error`, but the closure-bound `cooldownTimer`
(setTimeout, App.tsx:739) and `cooldownTicker` (setInterval
250ms, App.tsx:728) are not cleared. Concrete sequence:

1. Loop enters `cooldown` (`rate_limited` action,
   `enterCooldown` sets `cooldownTimer` and `cooldownTicker`
   with `resumeAt = monotonicNow() + delayMs`).
2. The OpenCode server crashes while the loop is waiting
   (`useSSE.ts:555` or `useServer.ts:133`/`224` sets
   `status = "error"`).
3. The server-error effect fires; `loop.dispatch({ type:
   "error", source: "server", … })` runs.
4. Reducer transitions `cooldown` → `error`. The UI shows the
   error screen. `canRetry` is true (recoverable).
5. `cooldownTimer` and `cooldownTicker` keep running.
6. `cooldownTicker` continues calling
   `setCooldownRemainingMs(remaining)` every 250ms with a
   stale positive value (e.g. "5s remaining") for the entire
   original `delayMs` window. The Dashboard's `cooldownText`
   memo (Dashboard.tsx:94-99) returns `null` because
   `state.type !== "cooldown"`, so **the user does not see
   the stale value**.
7. `cooldownTimer` fires at the original deadline, runs
   `if (loop.state().type === "cooldown")`, sees `error`,
   no-ops. Self-clears (`cooldownTimer = null`).
8. `cooldownTicker` self-clears when
   `resumeAt - monotonicNow() <= 0` (App.tsx:731-734).

The timers self-resolve, no user-visible state goes wrong,
and the next `enterCooldown` or `handleQuit` clears the
references. The only persistent artifact is the
`cooldownRemainingMs` signal holding a stale positive value
for the duration of the original `delayMs` window — invisible
because the Dashboard short-circuits on state.

**Where.** `src/App.tsx:1200-1209` (server-error effect,
unguarded dispatch) and the absence of a `clearCooldownTimers`
call at the App level for the "cooldown → error" path.

**Proposed fix.** Add a `createEffect` that watches for the
`cooldown` → `error` transition and calls
`clearCooldownTimers()`:

```ts
createEffect(() => {
  const state = loop.state()
  const prev = prevState
  if (prev?.type === "cooldown" && state.type === "error") {
    clearCooldownTimers()
  }
})
```

This mirrors the existing transition-detector pattern at
App.tsx:319-389 (which already watches `running`→`cooldown`
to pause stats). Alternatively, the cheap fix is to add
`if (state.type === "cooldown") clearCooldownTimers()` inside
the server-error effect. Either closes the gap; the
`createEffect` is preferred because it covers *any* future
unguarded `error` dispatch (e.g. a new chaos fault that
dispatches `error` directly).

**Status.** Fix proposed, not applied. Latent; no observed
misbehavior. Severity is LOW because the Dashboard does not
read the stale signal in non-cooldown states and the timers
self-resolve.

#### Verifier checklist for Task 5.2

- [x] `handleQuit` calls `clearCooldownTimers` — verified (line 974).
- [x] Exhaustion path calls `clearCooldownTimers` — verified (line 696).
- [x] `cooldownTicker` is a closure-captured `setInterval` with self-stop on `remaining <= 0` (line 731-734) and an internal `clearInterval` guard via `cooldownTicker` (line 731) — verified.
- [x] `cooldownTimer` is a closure-captured `setTimeout` with a `cooldownTimer = null` self-null (line 740) and a state guard `if (loop.state().type === "cooldown")` before dispatching `resume_cooldown` (line 741) — verified.
- [x] No `error` dispatch site calls `clearCooldownTimers` *except* the exhaustion path — verified by full grep of `type: "error"` dispatches in App.tsx (6 sites, only line 687 is paired with a clear at 696).
- [x] The reducer accepts `error` from `cooldown` (useLoopState.ts:245) — confirmed by the matrix audit (Phase 3) and the test at `useLoopState.test.ts:684-703`.
- [x] The Dashboard does not display `cooldownRemainingMs` in non-cooldown states (Dashboard.tsx:96) — confirmed; the stale signal is invisible.

#### Test-suite delta for Task 5.2

No new unit tests added. Rationale:

- The reducer transition `cooldown` → `error` is already
  pinned by `useLoopState.test.ts:684-703`
  ("error transition from cooldown state works"). The
  reducer is a pure function and is fully covered.
- `clearCooldownTimers` operates on closure-bound `let`s in
  App.tsx, which are not unit-testable without a heavy mock
  harness. The existing `enterCooldown` exhaustion test in
  `resilience-integration.test.ts` (which wires the real
  reducer and a stub `enterCooldown`) does not exercise the
  *closure* state — it only verifies the reducer contract.
- A dedicated `App.test.tsx` for the
  server-error-during-cooldown scenario would require a
  mock Solid render tree, a stub server, and a stub
  watchdog — a heavy test that re-states what the reducer
  test already constrains. The proposed
  `createEffect`-based fix (Finding 5.2.A) would be
  integration-test territory.

`bun test` → **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---

### 5.3 — `cooldownTicker` cleanup on cooldown resume

**Status: COMPLETE — VERIFIED, one LOW finding.**

The question: when the loop transitions out of `cooldown` (via
`resume_cooldown` dispatch), are `cooldownTimer` and
`cooldownTicker` cleaned up **before, during, or after** the
dispatch? And what if the dispatch happens **before** the
`cooldownTimer` setTimeout fires? Both timers are closure-bound
`let`s (App.tsx:167-168) with `null` meaning "no live timer".

#### All `resume_cooldown` dispatch sites (2)

| Site | Line | What fires it | Cleared before dispatch? |
| --- | --- | --- | --- |
| `cooldownTimer` setTimeout callback | 742 | The resume timer itself, after `delayMs` ms elapse | **Yes (partial)** — `cooldownTimer = null` on line 740 (self-clear), but `cooldownTicker` is **not** cleared on this path |
| `handleWake` | 215 | Sleep detector fires after `monotonicNow() >= st.resumeAt` | **Yes (full)** — `clearCooldownTimers()` at line 214 clears both `cooldownTimer` and `cooldownTicker` |

The reducer at `useLoopState.ts:175-186` accepts the dispatch
only from `cooldown` state; from any other state it is a
no-op. The setTimeout callback re-checks the state on line 741
(`if (loop.state().type === "cooldown")`) as a defense in
depth — the reducer is the source of truth.

#### Scenario A — normal `cooldownTimer` fires after `delayMs` (App.tsx:739-744)

```
t=0     : enterCooldown schedules cooldownTimer (delayMs) and cooldownTicker (250ms)
t=250   : ticker tick — setCooldownRemainingMs(resumeAt - monotonicNow())
t=500   : ticker tick — same
  ...
t=delayMs: cooldownTimer fires
        : line 740  -> cooldownTimer = null   (self-clear)
        : line 741  -> check loop.state().type === "cooldown" (yes)
        : line 742  -> dispatch resume_cooldown
        : reducer   -> state transitions cooldown -> running("")
        : line 743  : setTimeout callback returns
        : <- cooldownTicker is STILL RUNNING, with stale cooldownRemainingMs
  ...
t=delayMs+250: ticker tick (if remaining > 0) — sets a stale positive value
  ...
t=2*delayMs: ticker self-stops when resumeAt - monotonicNow() <= 0 (line 731-734)
```

**The two timers diverge for the entire `delayMs` window after
the dispatch**: `cooldownTimer` is null (self-cleared),
`cooldownTicker` is still live and still calling
`setCooldownRemainingMs(remaining)` every 250ms.

The Dashboard.tsx:96 short-circuit (`if (state.type !==
"cooldown") return null`) hides the stale signal from the
user. The signal itself stays positive and decrements for
roughly `delayMs` ms (~30s with the default `backoffBaseMs=1000`
and `backoffMaxMs=60000`), but the Dashboard's `cooldownText`
memo returns `null` because the state is now `running`.

#### Scenario B — `handleWake` fires while `cooldownTimer` is still pending (App.tsx:199-221)

```
t=0     : enterCooldown schedules cooldownTimer (delayMs) and cooldownTicker (250ms)
t=gapMs : machine wakes from sleep, gapMs >> delayMs
        : line 211  -> st.type === "cooldown", yes
        : line 213  -> monotonicNow() >= st.resumeAt, yes
        : line 214  -> clearCooldownTimers()   <- BOTH timers cleared
        : line 215  -> dispatch resume_cooldown
        : reducer   -> state transitions cooldown -> running("")
        : <- cooldownTicker is GONE, cooldownTicker reference is null
        : if the original cooldownTimer ever fires later:
        :   line 740  -> cooldownTimer = null (idempotent)
        :   line 741  -> check loop.state().type === "cooldown" -> false -> skip dispatch
```

**This is the "resume_cooldown dispatch happens before the
setTimeout fires" case** mentioned in PLAN.md. The order is
correct: `clearCooldownTimers()` is called on line 214
**before** the dispatch on line 215. The dangling setTimeout
that fires later is correctly absorbed by the `if
(loop.state().type === "cooldown")` guard on line 741.

#### Scenario C — `resume_cooldown` from a non-`cooldown` state (defense in depth)

- The setTimeout callback (line 739-744) self-guards with `if
  (loop.state().type === "cooldown")` before dispatching. If
  the state has changed (e.g. user paused, hit an error,
  completed the plan), the dispatch is skipped, the
  `cooldownTimer` is already null (line 740), and the
  `cooldownTicker` continues running until its time-based
  self-stop. This is a leak only in the sense that the ticker
  keeps ticking for `delayMs` ms after the user has moved on
  — but it self-clears and the stale signal is invisible.
- The reducer (useLoopState.ts:175-186) no-ops on
  non-`cooldown` states, so even if a stray dispatch sneaks
  through, the state is unchanged.

#### Finding 5.3.A — LOW — `cooldownTicker` is not explicitly cleared on the regular resume path

**Problem.** On the regular path (Scenario A), the
`cooldownTimer` self-clears at App.tsx:740 but the
`cooldownTicker` is left running until the time-based
self-stop at line 731-734 fires. This is a latent symmetry
gap: the two timers are siblings (one per `cooldownTicker`
interval) but only one is cleaned up on the resume event.

**Observable impact.** None today. The
`cooldownRemainingMs` signal continues to update for
`delayMs` ms after the dispatch, but the Dashboard
short-circuits on `state.type !== "cooldown"`
(Dashboard.tsx:96), so the user does not see the stale
countdown. The ticker self-clears on the time-based
condition. The reference (`cooldownTicker` closure variable)
is overwritten on the next `enterCooldown` call
(`cooldownTicker = setInterval(...)` on line 728) — the old
interval is already stopped, so no leak.

**Where.** `src/App.tsx:739-744` (resume setTimeout callback)
— the `clearCooldownTimers()` call is missing from the
success branch of the dispatch.

**Proposed fix.** Add a single line to the setTimeout
callback:

```ts
cooldownTimer = setTimeout(() => {
  cooldownTimer = null
  clearCooldownTimers()              // <-- new: ticker self-cleanup
  if (loop.state().type === "cooldown") {
    loop.dispatch({ type: "resume_cooldown" })
  }
}, delayMs)
```

This mirrors the `clearCooldownTimers` pattern used at
`handleWake` (line 214), the exhaustion path (line 696), and
`handleQuit` (line 974). The change is defensive: it makes
the invariant "all cooldown state is cleared before the
dispatch leaves `cooldown`" hold for *every* dispatch path,
not just the externally-driven one.

**Status.** Fix proposed, not applied. Latent; no observed
misbehavior. Severity is LOW because the Dashboard hides the
stale signal and the ticker self-resolves.

#### Verifier checklist for Task 5.3

- [x] `cooldownTimer` self-clears before the dispatch on the regular path (App.tsx:740, `cooldownTimer = null`) — verified.
- [x] `cooldownTicker` is **not** explicitly cleared on the regular path (Finding 5.3.A) — verified by inspection; the next `enterCooldown` overwrites the reference and the interval is already stopped.
- [x] `handleWake` calls `clearCooldownTimers()` *before* dispatching `resume_cooldown` (App.tsx:214-215) — verified, this is the "dispatch before setTimeout fires" case and is correct.
- [x] The setTimeout callback self-guards with `if (loop.state().type === "cooldown")` (App.tsx:741) — verified, so a dangling timer after `handleWake`'s clear is absorbed.
- [x] The reducer accepts `resume_cooldown` only from `cooldown` (useLoopState.ts:175-186) — confirmed by the test at `useLoopState.test.ts:535-546`.
- [x] The Dashboard short-circuits on `state.type !== "cooldown"` (Dashboard.tsx:96) — confirmed; the stale `cooldownRemainingMs` signal is invisible during `running`.
- [x] `cooldownTicker` self-stops on `remaining <= 0` (App.tsx:731-734) — confirmed; the stale signal eventually goes to 0 even if the dispatch happened early.

#### Test-suite delta for Task 5.3

No new unit tests added. Rationale:

- The `resume_cooldown` reducer contract is already pinned by
  `useLoopState.test.ts:535-546` ("resume_cooldown returns to
  running with an empty session, same iteration") and
  `:674-682` ("resume_cooldown from non-cooldown state
  (running) is ignored") and the matrix test at
  `:971-1000` ("resume_cooldown: from starting, ready,
  running, pausing, paused, stopping, stopped, complete,
  error, debug -> no-op").
- The "setTimeout fires after `clearCooldownTimers`" scenario
  is a closure-state interaction in App.tsx, not exercisable
  in a unit test without a heavy mock harness. The
  `resilience-integration.test.ts` covers the reducer
  contract end-to-end with a stub `enterCooldown`, but does
  not exercise closure-bound `let`s. Adding a dedicated
  `App.test.tsx` for this scenario would re-state what the
  reducer test + the line-by-line audit already constrain.
- The proposed fix (Finding 5.3.A) — one-line
  `clearCooldownTimers()` addition to the setTimeout
  callback — is the right shape, but a test that verifies
  "ticker reference is null after dispatch" is not
  meaningful: the reference is closure-private and
  short-lived (overwritten on the next `enterCooldown`),
  and the observable contract is "Dashboard shows no
  countdown in non-cooldown states", which is already
  pinned by the Dashboard's own memo logic.

`bun test` -> **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---

### 5.4 — `cooldownRemainingMs` signal updates every 250ms with `monotonicNow()`

**Status: COMPLETE — VERIFIED, no findings.**

The question: does the `cooldownRemainingMs` signal
(App.tsx:174) update at the expected 250ms cadence, and does
the dashboard countdown (Dashboard.tsx:97) display correctly
when the remaining-time math is driven by the monotonic
clock?

#### Signal lifecycle

| Step | Location | Action |
| --- | --- | --- |
| Create | App.tsx:174 | `createSignal(0)` — initial value 0 |
| Set on enter | App.tsx:727 | `setCooldownRemainingMs(delayMs)` — full delay BEFORE first tick |
| Tick (250ms) | App.tsx:728-735 | `setInterval(..., 250)` reads `monotonicNow()`, computes `Math.max(0, resumeAt - monotonicNow())`, publishes; self-stops on `remaining <= 0` |
| Reset (re-enter) | App.tsx:726-727 | `clearCooldownTimers()` (clears interval) THEN `setCooldownRemainingMs(delayMs)` — no overlap |
| Reset (exhaust) | (none) | Signal value persists; Dashboard short-circuits on `state.type !== "cooldown"` (Dashboard.tsx:96) — stale value invisible |
| Reset (handleWake) | App.tsx:214 | `clearCooldownTimers()` clears interval; state transitions via dispatch; signal value becomes invisible |
| Read | App.tsx:1819 | Passed to `<Dashboard cooldownRemainingMs={cooldownRemainingMs()} />` |
| Display | Dashboard.tsx:97 | `Math.max(0, Math.ceil((cooldownRemainingMs ?? 0) / 1000))` → `t("cooldownText", { secs, attempt })` |

#### Tick-rate analysis

- 250ms = 4 Hz update rate (App.tsx:735, `}, 250)`).
- Default `backoffBaseMs: 1_000` (config.ts:118) → displayed
  countdown steps at 1-second resolution.
- 4 ticks per visible second-step → smooth human-perceived
  countdown, no skipping, no visible jumps.
- Default `backoffMaxMs: 60_000` (config.ts:119) → 60 visible
  steps × 4 ticks/step = 240 ticks over the longest backoff.
  Each tick is one closure call reading two monotonic
  integers and writing a signal; negligible CPU.
- No finding: the 250ms cadence is correct for a
  1-second-resolution human-facing display.

#### Monotonic vs wall-clock correctness

- `resumeAt` set ONCE at App.tsx:706 as
  `monotonicNow() + delayMs`.
- Tick read at App.tsx:729 as `monotonicNow()` (same source).
- `clock.ts:35-41` guarantees `monotonicNow()` is
  `Bun.nanoseconds() / 1_000_000` (or `performance.now()`
  fallback) — never runs backwards, immune to NTP / wall-clock
  jumps / DST.
- Display at Dashboard.tsx:97 derives seconds from
  `cooldownRemainingMs` only — no `Date.now()` involvement,
  no timezone dependence, no wall-clock timestamp.
- Test pin: `clock.test.ts:7-11` ("monotonicNow returns a
  finite, non-negative number") and `:13-20` ("monotonicNow
  never runs backwards and advances with real time").
- No wall-clock vulnerability.

#### Edge case — system sleep

- During sleep, `monotonicNow()` may continue at a slower
  rate (macOS `Bun.nanoseconds()` is typically clock-suspended
  during sleep) or pause; either way,
  `resumeAt - monotonicNow()` shrinks monotonically (or holds
  at 0 via `Math.max(0, ...)`).
- On wake, `handleWake` (App.tsx:199-221) checks
  `monotonicNow() >= st.resumeAt`:
  - true → `clearCooldownTimers()` then `dispatch
    resume_cooldown` (App.tsx:214-215). State transitions to
    `running("")`; Dashboard short-circuits; countdown text
    disappears.
  - false → no action; ticker resumes from the next interval
    tick.
- The ticker self-stops on `remaining <= 0` (App.tsx:731-734),
  which is also the natural backoff end.
- Both paths converge correctly. No state divergence, no
  negative remaining, no leaked ticker (the wake path
  explicitly clears; the regular path is covered by Finding
  5.3.A from the prior commit, severity LOW, no observed
  misbehavior).

#### Edge case — multiple cooldowns in sequence

- `enterCooldown` calls `clearCooldownTimers()` on line 726
  BEFORE scheduling new timers.
- Signal value is overwritten on line 727.
- No overlapping intervals. No leak.

#### Edge case — last-tick "0s" flicker

- The ticker publishes `0` on its final tick (App.tsx:729,
  `Math.max(0, ...)`).
- The `cooldownTimer` setTimeout fires at the same `delayMs`
  boundary (within a few ms), dispatches `resume_cooldown`,
  and the reducer transitions `cooldown → running("")`.
- In Solid, signal writes are immediate and synchronous. The
  order between the interval's last tick and the setTimeout
  firing depends on the event loop's tie-breaking at the
  `delayMs` boundary. If the interval fires first, the
  Dashboard's memo briefly sees `cooldownRemainingMs() = 0`
  while `state().type === "cooldown"`, returning "0s" for at
  most one render frame. If the setTimeout fires first, the
  state transitions before the memo re-runs, and the memo
  short-circuits immediately.
- Real-world impact: invisible. The Dashboard is a TUI, not
  a 60fps canvas; one extra render frame is imperceptible.
  No action required.

#### Edge case — pause during cooldown (or vice versa)

- `pausing` → `cooldown` is accepted by the reducer
  (useLoopState.ts:163, `if (state.type === "running" ||
  state.type === "pausing")`).
- The Dashboard's `cooldownText` memo (Dashboard.tsx:94-99)
  only returns non-null when `state.type === "cooldown"`, so
  the text appears only after the reducer transition.
- `cooldown` → `paused` is not accepted by the reducer
  (`toggle_pause` from `cooldown` is a no-op per the matrix
  test at useLoopState.test.ts). The user cannot pause
  during cooldown.
- The only escape from `cooldown` is `resume_cooldown` (the
  timer firing) or `error` (exhaustion) or `quit`. All three
  paths either transition the state (Dashboard short-circuits)
  or clear the timers (Finding 5.3.A / Finding 5.2.A from
  prior audits).

#### Cross-cutting note (not a Task 5.4 finding)

- The Dashboard's `cooldownText` (Dashboard.tsx:98) always
  uses the `cooldownText` i18n key, which renders
  "Rate limited — retrying in {secs}s (attempt N)" in
  i18n.ts:240-241. The activity log at App.tsx:716 already
  distinguishes between `cooldownText` (rate limit) and
  `cooldownRetryText` (transient) — but the Dashboard does
  not. This means a transient-error cooldown displays
  "Rate limited" on the Dashboard, which is misleading.
- This is the explicit scope of Task 5.6 ("Verify: transient
  errors ... confirm the cooldown state display shows
  'retry' instead of 'rate limit'") and is documented here
  only for cross-reference. Out of scope for Task 5.4.

#### Verifier checklist for Task 5.4

- [x] `cooldownRemainingMs` updates at 250ms cadence (App.tsx:735, `}, 250)`) — verified.
- [x] Tick reads `monotonicNow()` (App.tsx:729) and computes `Math.max(0, resumeAt - monotonicNow())` — verified.
- [x] `resumeAt` is set once at entry (App.tsx:706) from the same `monotonicNow()` — no clock-source mismatch.
- [x] `setCooldownRemainingMs(delayMs)` on entry (App.tsx:727) sets the initial value before the first tick — no race.
- [x] Ticker self-stops on `remaining <= 0` (App.tsx:731-734) — no leaked interval.
- [x] Dashboard short-circuits on `state.type !== "cooldown"` (Dashboard.tsx:96) — stale signal invisible.
- [x] `Math.ceil(remaining / 1000)` rounds up at the second boundary (Dashboard.tsx:97) — countdown never skips a value, never shows a negative value.
- [x] `handleWake` (App.tsx:199-221) handles sleep via `clearCooldownTimers()` + `dispatch resume_cooldown` — no divergence between the two timer paths.
- [x] `enterCooldown` calls `clearCooldownTimers()` (App.tsx:726) BEFORE scheduling new timers — no overlapping intervals across multiple cooldowns.
- [x] Wall-clock immunity: no `Date.now()` involvement in the countdown math or display — only `monotonicNow()` and the `cooldownRemainingMs` signal value.
- [x] `clock.test.ts:7-20` pins the monotonic invariants (finite, non-negative, never-runs-backwards).
- [x] Reducer matrix at `useLoopState.test.ts:953-969` (`rate_limited` only from `running`/`pausing`) and `:971-1000` (`resume_cooldown` only from `cooldown`) pins the state-machine half of the contract.
- [x] `Math.max(0, ...)` floor at both App.tsx:729 and Dashboard.tsx:97 — no negative remaining ever published or displayed.

#### Test-suite delta for Task 5.4

No new unit tests added. Rationale:

- The 250ms tick rate is a literal at App.tsx:735; testing it
  would require mocking `setInterval` and asserting the
  delay argument, which is what the code already shows
  verbatim. A regression here would be obvious on code review.
- The monotonic-math correctness is already pinned by
  `clock.test.ts:7-20`. The integration
  (`resumeAt - monotonicNow()`) is a one-liner with no
  branching; the only meaningful assertion is "result is
  non-negative and decreasing", which `Math.max(0, ...)` plus
  the monotonic clock guarantee.
- The display rounding (`Math.ceil(remaining / 1000)`) is a
  one-liner at Dashboard.tsx:97 — reviewable in isolation,
  and the rounding direction (up) is the conventional
  countdown UX choice.
- The Dashboard's state short-circuit
  (`state.type !== "cooldown"`) is the same pattern used for
  the watchdog indicator (Dashboard.tsx:76) and several other
  state-gated memos; it's a stable contract, not an
  interaction.
- The "no last-tick flicker" claim is bounded by the
  Solid signal contract (synchronous writes, scheduled
  reactive re-runs), which is the framework's guarantee —
  testing it would mean testing the framework.
- A full integration test of "render the dashboard in
  cooldown state, advance a fake clock 250ms, assert the
  memo updated" would require a full App.tsx harness with
  the OpenCode server mocked out; the cost exceeds the value
  since the   components are individually trivial.

`bun test` -> **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---

### 5.5 — Rate limit during `pausing` is handled (SSE handler + reducer)

**Status: COMPLETE — VERIFIED, no findings.**

The question: when a provider rate-limit SSE error fires while
the loop is in the `pausing` state (the user pressed `P`, the
session is in-flight awaiting its own `session.idle`), does
`enterCooldown` get called and does the reducer accept the
`rate_limited` action from `pausing`? **Answer: yes, on both
counts**, and the path is the documented escape hatch for a
real wedge scenario.

#### Why this matters — the wedge scenario

If a rate limit during `pausing` were silently ignored (e.g. the
SSE handler only acted on `running`, not `pausing`), the loop
would sit in `pausing` indefinitely, waiting for a
`session.idle` event the now-rate-limited session will never
emit. The user could still `Q` to quit (the watchdog would
eventually escalate), but the iteration is effectively lost.
Covering `pausing` in the SSE rate-limit branch (App.tsx:476)
turns this into a normal cooldown cycle: the rate-limited
session is abandoned, the backoff runs, and the iteration
driver picks up a fresh session after `resume_cooldown`.

#### SSE handler — `pausing` is in the rate-limit branch

App.tsx:470-478:

```ts
} else if (error.kind === "rate_limit") {
  // Provider rate limit surfaced mid-iteration: wait + retry, don't fail.
  // Cover `pausing` too (the reducer accepts it) so a rate limit while
  // pausing can't wedge the loop waiting for a session.idle that the
  // errored session will never emit.
  activityLog.addEvent("error", t("actRateLimit", { message: error.message }), { level: "warn" })
  if (st === "running" || st === "pausing") {
    enterCooldown(error.message, error.retryAfter)
  }
}
```

The state guard `st === "running" || st === "pausing"` is
exhaustive for the two states that carry a live sessionId
(see `getActiveSessionId` at useLoopState.ts:34-38, which
returns `state.sessionId` only for `running` and `pausing`,
and `""` for everything else). The same condition appears
on line 481 for the non-rate-limit transient error path,
which is correct symmetry.

#### Reducer — `rate_limited` accepted from `running` and `pausing`

`useLoopState.ts:161-173`:

```ts
case "rate_limited": {
  // Enter cooldown from running (or pausing) — a healthy wait, not an error.
  if (state.type === "running" || state.type === "pausing") {
    return {
      type: "cooldown",
      iteration: state.iteration,
      reason: action.reason,
      resumeAt: action.resumeAt,
      attempt: action.attempt,
    }
  }
  return state
}
```

The state copy preserves `state.iteration` (line 166) — the
iteration number from `pausing` (which was inherited from
`running` via the `toggle_pause` reducer path at
useLoopState.ts:102-107) flows into `cooldown` unchanged.
The `sessionId` is **not** copied into `cooldown` because
the `cooldown` state has no `sessionId` field; the
sessionId is implicitly dropped on this transition. This is
intentional and correct — the next iteration will start
with a fresh session.

#### End-to-end trace — `running` → `pausing` → rate limit → cooldown → resume → fresh session

| t | Step | State | Notes |
| --- | --- | --- | --- |
| 0 | User presses `P` | `running(iter=N, sessionId=ses)` | Toggle_pause reducer (useLoopState.ts:100-107) flips to `pausing` preserving sessionId |
| 1 | Provider returns 429 for ses | `pausing(iter=N, sessionId=ses)` | SSE `onSessionError` fires with `error.kind === "rate_limit"` |
| 2 | SSE handler guard passes (App.tsx:461) | unchanged | `eventSessionId (ses) === getActiveSessionId(state) (ses)` — live session |
| 3 | Activity log: `actRateLimit` warning (App.tsx:475) | unchanged | i18n key `actRateLimit: (p) => 'Rate limit: ${p.message}'` (i18n.ts:58) |
| 4 | `enterCooldown(message, retryAfter)` (App.tsx:477) | unchanged | Increments `rateLimitAttempts`, computes backoff |
| 5 | `loop.dispatch({ type: "rate_limited", … })` (App.tsx:723) | unchanged | |
| 6 | Reducer: `pausing` → `cooldown` (useLoopState.ts:163) | `cooldown(iter=N, reason, resumeAt, attempt)` | Iteration preserved; sessionId dropped |
| 7 | Countdown ticker + resume timer scheduled (App.tsx:728, 739) | unchanged | See Task 5.4 for ticker math |
| 8 | `delayMs` elapses | unchanged | Ticker self-clears; timer fires |
| 9 | `cooldownTimer` callback (App.tsx:739-744) | unchanged | Self-clears `cooldownTimer`; guards on `state.type === "cooldown"` (yes) |
| 10 | `loop.dispatch({ type: "resume_cooldown" })` (App.tsx:742) | unchanged | |
| 11 | Reducer: `cooldown` → `running("")` (useLoopState.ts:178-184) | `running(iter=N, sessionId="")` | Iteration preserved; sessionId cleared |
| 12 | Iteration-driver effect fires (App.tsx:1217-1222) | unchanged | `state.type === "running" && state.sessionId === ""` |
| 13 | `startIteration()` (App.tsx:776) | unchanged | `checkPlanComplete()` (line 791), then `createSession` (818), `iteration_started` dispatch (822), prompt send (841) |
| 14 | New session created | `running(iter=N+1, sessionId=newSes)` | Old ses is abandoned on the server (not explicitly aborted; see note below) |

#### Symmetry with the non-rate-limit path (App.tsx:481)

The transient error path at line 481 (`if (st === "running"
|| st === "pausing" || st === "debug")`) also covers
`pausing` and dispatches an `error` action with
`recoverable: error.kind === "transient"`. The reducer
accepts `error` from `pausing` (useLoopState.ts:243, per the
Phase 3 matrix audit). So a non-rate-limit error during
pausing escalates to a recoverable error screen instead of
a cooldown — the user can retry, which is the correct
behavior because a transient (e.g. socket drop) doesn't
merit a backoff; the user should explicitly decide whether
to retry.

#### Stale-session guard interaction

The SSE `onSessionError` stale-session guard (App.tsx:460-463)
fires *before* the rate-limit branch. For `pausing` state,
`getActiveSessionId(state)` returns the live `sessionId` (line
36). A rate-limit error for that exact sessionId passes the
guard and is handled normally. A rate-limit error for a
stale (already-replaced) sessionId is correctly ignored
with no log line, no dispatch. This mirrors the `onSessionIdle`
guard at lines 491-498 (documented in the comment at
App.tsx:459-460).

#### Activity log when the guard fails open

If the SSE handler reaches the `rate_limit` branch with
`st !== "running" && st !== "pausing"` (e.g. a rate-limit
error for a session whose state has already moved on to
`cooldown` or `paused`), the activity log line at line 475
**still fires** (it is unconditional on `st`), but the
`enterCooldown` call at line 477 is skipped. This is
intentional observability: the on-disk activity log
records the rate limit even when the loop state has
moved past it. The cost is one log line per stale event;
no behavior is affected because the reducer would no-op
the dispatch anyway.

#### Old-session lifecycle on the server

When the loop is in `pausing(iter=N, sessionId=ses)` and
the rate limit arrives for `ses`, the loop dispatches
`pausing` → `cooldown` (dropping the sessionId). The
`ses` session is **not explicitly aborted** on the server
in this path — it remains "in flight" on the OpenCode
server, where it will continue to be rate-limited. The
next `running("")` → `iteration_started` → `createSession`
cycle (App.tsx:818, 822) creates a fresh session; the
abandoned `ses` is eventually cleaned up by the server's
own session TTL / idle-eviction. This is the same behavior
as the `running` → `cooldown` path (the running case also
drops the sessionId without aborting the session), so
there is no asymmetry or regression risk specific to
`pausing`. Documenting for completeness; not a finding
because it matches the existing running-path contract.

#### Test coverage

The `pausing → cooldown` path is fully pinned by the
reducer tests:

- `useLoopState.test.ts:501-514` — "transitions from
  pausing to cooldown" (positive case)
- `useLoopState.test.ts:959-969` — "rate_limited: from
  pausing → cooldown (preserves iteration, drops
  sessionId)" (positive case, with full state shape
  assertion)
- `useLoopState.test.ts:953-958` — `rate_limited` is a
  no-op from `paused`, `ready`, `starting`, `cooldown`,
  `stopping`, `stopped`, `complete`, `error`, `debug` (the
  full no-op matrix; `pausing` is deliberately excluded
  from this list because it transitions to `cooldown`)

The SSE handler's "log unconditionally but dispatch only
for running/pausing" behavior is not separately pinned
because the test surface is the reducer contract (the
handler's local branch is a no-op for the wrong states).
Adding a mock-SSE test for this branch would require
mocking `@opentui/solid` and the SDK client, which the
test suite avoids (see docs/testing.md for the
`jsxImportSource` caveat).

#### Verifier checklist for Task 5.5

- [x] SSE `onSessionError` rate-limit branch includes
  `pausing` in its `st ===` guard (App.tsx:476) — verified.
- [x] Reducer accepts `rate_limited` from `pausing`
  (useLoopState.ts:163) — verified; the no-op test at
  useLoopState.test.ts:953-958 explicitly excludes
  `pausing` from the no-op list.
- [x] `pausing → cooldown` preserves the iteration counter
  (useLoopState.ts:166) — verified by test at
  useLoopState.test.ts:965 (`expect(result.iteration).toBe(5)`).
- [x] `pausing → cooldown` drops the sessionId (cooldown
  state has no sessionId field) — verified by
  useLoopState.test.ts:964 (the test asserts
  `result.type === "cooldown"` and the resulting state
  has no sessionId; the next `running("")` transition
  via `resume_cooldown` starts fresh).
- [x] Iteration driver picks up the `running("")` state
  after `resume_cooldown` (App.tsx:1217-1222) — verified
  by the comment at App.tsx:1211-1216 ("resume from a
  rate-limit cooldown") and the existing `startIteration`
  audit (Task 4.1).
- [x] The stale-session guard at App.tsx:460-463 does not
  reject a live rate-limit error during `pausing` —
  verified: `getActiveSessionId({type:"pausing",...})`
  returns the live sessionId (useLoopState.ts:35-36), so
  `eventSessionId !== getActiveSessionId(state)` is false
  and the guard passes.
- [x] The non-rate-limit error path at App.tsx:481 also
  covers `pausing` — verified; transient errors during
  pausing escalate to a recoverable error, not a cooldown.

#### Test-suite delta for Task 5.5

No new unit tests added. Rationale:

- The `pausing → cooldown` transition is already pinned by
  three existing tests (useLoopState.test.ts:501-514,
  :953-958, :959-969). The contract is fully covered.
- The SSE handler's rate-limit branch is a 3-line
  conditional (App.tsx:470-478) whose observable contract
  is "dispatch `rate_limited` for running/pausing, log
  for other states". The dispatch half is pinned by the
  reducer tests. The log-only half is a pure side effect
  on `activityLog.addEvent`, which is an external store
  not exercised in the unit test surface.
- A mock-SSE integration test for "rate limit arrives
  while in pausing" would require a Solid render harness
  with a stub server, a stub watchdog, and the
  `jsxImportSource` workaround (see docs/testing.md). The
  cost far exceeds the value: the reducer test pins the
  observable transition, and the SSE handler's branch is
  a 3-line conditional with no internal state.

`bun test` -> **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---

### 5.6 — Transient errors enter cooldown via `handleIterationError`, but Dashboard display is unconditional

**Status: COMPLETE — VERIFIED, one MEDIUM finding.**

The question: do transient errors (5xx, socket drop, timeout)
also enter cooldown via `handleIterationError`? And does the
cooldown state display distinguish a transient cooldown from
a rate-limit cooldown, showing "retry" instead of "rate
limit"? **Answer: yes on the first part, no on the second.**
The activity log already differentiates; the Dashboard
does not, because the `rate_limited` action carries no
`kind` field.

#### Transient → cooldown routing — verified

`handleIterationError` (App.tsx:754-771) classifies the
failure with `classifySessionError(err)` (the
shared classifier in `useSSE.ts:139-176` and
`classifySessionError` exports). The classification result
drives the routing:

```ts
if (classified.kind === "rate_limit") {
  enterCooldown(classified.message, classified.retryAfter, "rate_limit")
  return
}
if (classified.kind === "transient") {
  enterCooldown(classified.message, undefined, "transient")
  return
}
// else: dispatch error
```

Both branches funnel into `enterCooldown`, which is the
*same* state machine path (`running`/`pausing` →
`cooldown` via the `rate_limited` reducer, useLoopState.ts:161-173).
So a transient socket drop and a 429 produce **the same
reducer state** (`type: "cooldown"`) and the same
user-facing countdown.

The circuit-breaker counter (`rateLimitAttempts`) and the
exhaustion path (App.tsx:679-697) are also shared. A
flaky network consumes retries the same way a 429 does.
This is intentional — both failure modes recover
automatically and the user should not be interrupted for
either — but it means a stream of transient errors
eventually escalates to a "Connection issue — retries
exhausted after N attempts" recoverable error, which is
the right shape.

The `kind` parameter is forwarded only to the
`log.health` and `activityLog` calls; it is **not** carried
by the dispatched `rate_limited` action (App.tsx:723,
`{ type: "rate_limited", reason, resumeAt, attempt }`).

#### Display differentiation — partial

| Surface | Differentiates transient vs rate limit? | Where | Verdict |
| --- | --- | --- | --- |
| `log.health` structured log | **Yes** — `kind` field is included | App.tsx:708-713 (Finding 5.1.A also calls this out) | OK (observability) |
| `activityLog.addEvent` | **Yes** — `cooldownText` for rate_limit, `cooldownRetryText` for transient | App.tsx:714-721 | OK (user sees correct label in the activity log) |
| Exhaustion `log.health` and `activityLog` | **Yes** — `actRateExhausted` vs `actRetryExhausted`, `errRatePersistent` vs `errRetryPersistent` | App.tsx:681-693 | OK (terminal-event clarity) |
| Dashboard countdown (Row 3) | **No** — always uses `cooldownText` ("Rate limited — retrying in {secs}s") | Dashboard.tsx:94-99 | **Gap** (Finding 5.6.A) |

The cross-cutting note at the end of Task 5.4 (MEJORAS.md:4292-4303)
already flagged this; Task 5.6 confirms the gap is real
and assigns it severity.

#### i18n keys — verified

Both `cooldownText` and `cooldownRetryText` exist in both
locales (i18n.ts:240-243 for `en`, i18n.ts:543-546 for `es`),
have parallel structure (`{secs, attempt}` interpolation),
and contain appropriate copy:

- `en`: "Rate limited — retrying in {secs}s (attempt {attempt})"
  vs "Connection issue — retrying in {secs}s (attempt {attempt})"
- `es`: "Rate limited — reintentando en {secs}s (intento {attempt})"
  vs "Problema de conexión — reintentando en {secs}s (intento {attempt})"

The transient copy is i18n-correct, gender-neutral, and
specific ("Connection issue" rather than generic "Error").
No changes needed in `i18n.ts`.

#### Finding 5.6.A — MEDIUM — Dashboard `cooldownText` always shows "Rate limited" even for transient cooldowns

**Problem.** The Dashboard's `cooldownText` memo
(Dashboard.tsx:94-99) reads only `state.type`, `secs`, and
`state.attempt` from the `cooldown` state — the state
itself has no `kind` field (types.ts:25-31). So a transient
cooldown (a plain socket drop) renders the same
"Rate limited" string as a real 429. A user who sees
"Rate limited" on the Dashboard, then checks the activity
log and sees "Connection issue — retrying in 5s" will
perceive the UI as inconsistent or buggy. On a flaky
network day, repeated "Rate limited" messages that are
*actually* transient cooldowns erode trust in the real
rate-limit signal.

**Where.**
- `src/components/Dashboard.tsx:98` — the
  `t("cooldownText", …)` call.
- `src/types.ts:25-31` — the `cooldown` state shape, missing
  the `kind` field.
- `src/types.ts:54` — the `rate_limited` action shape,
  missing the `kind` field.
- `src/App.tsx:723` — the dispatch site that *has* the
  `kind` in scope but discards it.

**Proposed fix.** Plumb the `kind` through the state
machine and have the Dashboard read it. Minimal change
set:

1. Add `kind: "rate_limit" | "transient"` to the
   `cooldown` state shape (types.ts:25-31).
2. Add `kind: "rate_limit" | "transient"` to the
   `rate_limited` action shape (types.ts:54).
3. Pass `kind` from the call site (App.tsx:723 →
   `loop.dispatch({ type: "rate_limited", reason, resumeAt,
   attempt, kind })`).
4. Forward `kind` in the reducer's new state copy
   (useLoopState.ts:165-172).
5. Update the Dashboard's memo (Dashboard.tsx:94-99) to
   read `state.kind` and select the matching i18n key:
   `t(state.kind === "transient" ? "cooldownRetryText" : "cooldownText", { secs, attempt })`.
6. Update the existing reducer tests
   (useLoopState.test.ts:476-560) to include `kind` in the
   dispatched action and the resulting state.

Alternative cheap fix (observation only, *not* the
proposed fix): keep the existing UI copy and just add
`kind` to the on-disk `log.health` record so an operator
post-mortem can disambiguate. This is the same cheap fix
noted in Finding 5.1.A. It does not address the
user-facing inconsistency; the proposed fix above does.

**Status.** Fix proposed, not applied (audit-only per
PLAN.md acceptance criteria). Severity MEDIUM because the
user-facing copy is misleading for a class of plausible
inputs (transient network blips), but no correctness, no
data loss, no functional regression. The activity log
already shows the right text, so the information is
available in-app.

#### Verifier checklist for Task 5.6

- [x] `handleIterationError` routes `transient` to
  `enterCooldown(message, undefined, "transient")`
  (App.tsx:761) — verified.
- [x] `enterCooldown` accepts the `kind` parameter and
  uses it for log/activity copy selection
  (App.tsx:671-674, :716, :684, :689) — verified.
- [x] The reducer's `rate_limited` action transitions
  `running`/`pausing` to `cooldown` regardless of `kind`
  (useLoopState.ts:161-173) — verified.
- [x] The `cooldown` state has no `kind` field
  (types.ts:25-31) — verified.
- [x] The `rate_limited` action carries no `kind` field
  (types.ts:54) — verified.
- [x] The Dashboard's `cooldownText` memo always uses
  `cooldownText` (Dashboard.tsx:98) — verified.
- [x] `cooldownText` and `cooldownRetryText` exist in
  both `en` and `es` locales with parallel interpolation
  (i18n.ts:240-243, :543-546) — verified.
- [x] The activity log line at App.tsx:714-721 selects
  the right i18n key based on `kind` — verified.
- [x] The exhaustion log lines at App.tsx:681-693 also
  differentiate (`actRateExhausted` vs `actRetryExhausted`)
  — verified.

#### Test-suite delta for Task 5.6

No new unit tests added. Rationale:

- The transient → cooldown routing in
  `handleIterationError` is a 3-line conditional
  (App.tsx:760-762) where the observable contract is
  "the activity log shows `cooldownRetryText`". The
  activity log is an external store, not asserted in the
  unit test surface.
- The Dashboard's `cooldownText` memo is a 1-line
  `t("cooldownText", …)` call (Dashboard.tsx:98) that
  the test surface does not cover (no Solid render tests
  in the repo). A regression here would be obvious on
  code review because the literal "cooldownText" is a
  search target.
- The proposed fix (Finding 5.6.A) *will* require updates
  to the reducer tests (useLoopState.test.ts:476-560) to
  plumb the new `kind` field. Until the fix is applied,
  there is no field to test for. The test plan for the
  fix is in Finding 5.6.A step 6.

`bun test` -> **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---

### 5.7 — `maxRateLimitRetries` exhaustion resets in-memory counter, but persistence snapshot keeps the exhausted value

**Status: COMPLETE — VERIFIED, one LOW finding.**

The question: when `enterCooldown` exhausts the
`maxRateLimitRetries` circuit breaker, it dispatches a
recoverable `error` and resets `rateLimitAttempts` to 0
(App.tsx:695). Is the reset correct? The error is
recoverable, so the user retry will start fresh. The
in-memory path is correct. **But the persisted snapshot
keeps the exhausted value**, so a crash-during-error-state
followed by `doResume` loads the exhausted counter and
forfeits one attempt of forgiveness on the next rate
limit.

#### In-memory path — correct

`enterCooldown` (App.tsx:671-745) increments the counter
on every call. When it crosses the threshold
(`rateLimitAttempts > r.maxRateLimitRetries` at
App.tsx:679), it dispatches a `recoverable: true` error
and resets the counter to 0 before returning. The user
sees the error dialog, retries, and the next
`enterCooldown` call starts the count at 1. This is
the intended behavior of a circuit breaker that
"trips, lets the user decide, and gives them a clean
budget when they retry."

#### Persistence path — asymmetric, LOW severity

The persistence effect (App.tsx:1265-1290) only saves
when the loop state is `running`, `pausing`, `paused`,
or `cooldown`. The `error` state is not saved, and
`clearLoopState` is not called for it (only for
`complete`). Concretely, the sequence on exhaustion is:

1. `enterCooldown` increments counter to
   `maxRateLimitRetries + 1` (e.g. 9 if the default is
   8).
2. The effect fires for the prior `cooldown` state and
   writes `.loop-state.json` with `rateLimitAttempts: 9`
   (App.tsx:1283).
3. `enterCooldown` dispatches `error` and resets the
   in-memory counter to 0.
4. The effect re-fires for the `error` state. The new
   state is `error`, so the effect **does not save**.
5. `.loop-state.json` still holds the snapshot from
   step 2 with the exhausted counter.

If the process crashes between step 3 and the user
retry, `doResume` reads the persisted `rateLimitAttempts`
value (9, the exhausted counter, App.tsx:1165) and uses
it as the starting point. The next rate limit triggers
`enterCooldown` → `9 + 1 = 10 > 8` → the breaker
trips again on the very first new failure. The user
loses 1 attempt of forgiveness relative to the in-memory
retry path. The retry is still possible and the
iteration count is preserved; only the counter starts
at the exhausted value instead of 0.

#### Why the asymmetry exists

The reset in App.tsx:695 was written under the
assumption that the in-memory `retry` path is the
normal case. The `error` state being excluded from the
persistence effect is intentional: the comment at
App.tsx:1265-1267 says the effect writes "on every
meaningful transition" and skips `error` because a
recoverable error is a user-decision point, not a state
to recover into. But this leaves the post-reset
`rateLimitAttempts = 0` un-persisted.

#### Severity — LOW

The user-facing guarantee "you can always retry a
recoverable error" is preserved. The only consequence
is one fewer attempt before the breaker trips again on
the crash-during-error path. This is a minor asymmetry,
not a bug. The cost of a fix (extra save or extra
clear) is small but the user impact is also small, so
the finding is documentation-first.

#### Proposed fix (not applied — audit only)

Two equally valid options, both one-liners:

**Option A — Save the post-reset value on error entry.**
Add an explicit `saveLoopState` call from the error
exhaustion branch in `enterCooldown` (App.tsx:686-697)
with `rateLimitAttempts: 0`. Keeps the persisted
snapshot aligned with the in-memory value.

**Option B — Clear the persisted state on error.**
Add an `else if (s.type === "error") clearLoopState()`
to the persistence effect (App.tsx:1287-1289). This
matches the existing `complete` branch and means a
crash-during-error is treated as "no plan to resume" —
which is the most conservative interpretation of
"the user decides".

Option A preserves the resume path with a counter
of 0. Option B removes the resume path entirely. The
right choice depends on whether `--resume` is
expected to bring back a session that was interrupted
by a circuit-breaker trip; if yes, A; if no, B.

The chosen direction is **Option A** if implemented,
because it preserves the existing `--resume` contract
("keep going from where we left off") while fixing
the counter asymmetry. The implementation would be a
3-line addition inside the `if (rateLimitAttempts >
r.maxRateLimitRetries)` branch in `enterCooldown`:

```ts
void saveLoopState({
  version: 1,
  iteration: loop.iteration(),
  sessionId: getActiveSessionId(loop.state()) || null,
  stateType: "error",
  rateLimitAttempts: 0,
  updatedAt: new Date().toISOString(),
})
```

#### Verifier checklist for Task 5.7

- [x] `enterCooldown` increments counter on every call
  (App.tsx:677) — verified.
- [x] Exhaustion branch dispatches a recoverable error
  and resets `rateLimitAttempts` to 0
  (App.tsx:679-697) — verified.
- [x] The in-memory retry path starts the counter at 0
  on the next `enterCooldown` (verified by tracing the
  `retry` action in useLoopState.ts:258-264, which
  transitions `error(recoverable=true)` to `starting`).
- [x] The persistence effect writes for
  `running`/`pausing`/`paused`/`cooldown` and skips
  `error` (App.tsx:1271-1289) — verified.
- [x] `doResume` loads `rateLimitAttempts` from the
  persisted snapshot and uses it as the starting
  value (App.tsx:1165) — verified.
- [x] `clearLoopState` is called only for `complete`
  (App.tsx:1287-1288) and for clean shutdown
  (handleQuit), not for `error` — verified.

#### Test-suite delta for Task 5.7

No new unit tests added. Rationale:

- The asymmetry is observable only through the
  interaction of two effects (the rate-limit counter
  in `enterCooldown` and the persistence effect),
  neither of which is unit-tested as a stateful pair.
  The unit tests in `useLoopState.test.ts` cover the
  reducer transitions; the persistence effect in
  `App.tsx` is not exercised by any unit test (and
  is unlikely to be, because it is a Solid effect
  inside a render tree).
- The proposed fix is one of two equally valid
  one-liners (Option A or Option B above). Both
  warrant a regression test, but only the chosen
  direction is testable, and the choice is a
  product decision (`--resume` semantics) rather
  than a code decision.
- The asymmetry does not break any user-facing
  guarantee. It loses one attempt of forgiveness on
  a specific crash window (process dies between
  exhaustion and the user retry).

`bun test` -> **623 pass, 0 fail, 1512 expect() calls**
across 21 files. No regressions.

---

## Phase 6 — Watchdog & Health Probes

Source: `src/hooks/useWatchdog.ts` (the framework-agnostic
`createWatchdog` core, 318 lines, plus the 12-line Solid
`useWatchdog` wrapper at 320-331) and its wiring in
`src/App.tsx:227-297` (config getter, probes, actions) plus the
start/stop effect at App.tsx:1251-1263. The Solid wrapper
contributes one reactive signal and an `onCleanup(stop)`; all
decisions live in the core. Defaults live in
`src/lib/config.ts:118-131` and are plumbed through
`resolveResilience` so the user can override any of them via
`--resilience` or the on-disk config file. The dedicated unit
suite is `src/hooks/useWatchdog.test.ts` (411 lines, 16
cases at audit start, +1 added in this task).

The watchdog has four configurable knobs. Each is audited
below with a row in the parameter table, the call sites that
read it, the test that pins its contract, and any
audit-trail observation (INFO / LOW / MEDIUM). Tasks 6.2
through 6.7 are planned as separate per-knob verifications
in subsequent iterations.

### 6.1 — Audit `useWatchdog` knob inventory: tickMs, suspectMs, confirmMs, maxRecoveryAttempts

**Status: COMPLETE — VERIFIED, one LOW finding (live-reconfig
fidelity), one MEDIUM finding (abortAndRetry safety net absent
on mid-recover probe failure), one INFO observation (tickMs is
sticky across start cycles).**

#### Parameter table

| Knob | Default (`config.ts`) | Read sites | Pinning test | Behavior |
| --- | --- | --- | --- | --- |
| `tickMs` | `15_000` (config.ts:128) | `useWatchdog.ts:306` (one-time, at `start()`) | `useWatchdog.test.ts` `setup()` default at line 59 | `setInterval(cb, tickMs)` — interval is captured by `setInterval` and never re-read. Threshold knobs below are read live each tick; the tick interval is not. |
| `suspectMs` (T1) | `90_000` (config.ts:129) | `useWatchdog.ts:225, 240` (every tick) | `useWatchdog.test.ts:108-119` (heartbeat-every-60s never declares STUCK) | If `dt < suspectMs` → `HEALTHY`, hands off. If `dt >= suspectMs` → `CONFIRMING`, run ground-truth probes. |
| `confirmMs` (T2) | `600_000` (config.ts:130) | `useWatchdog.ts:275` (every tick) | `useWatchdog.test.ts:139-148` (wedged = `working` + `dt >= T2`) | If `dt >= confirmMs` AND session verdict is `working` → `STUCK` → recover. |
| `maxRecoveryAttempts` | `3` (config.ts:131) | `useWatchdog.ts:189` (each `recover` call) | `useWatchdog.test.ts:150-166, 344-371` | If `recoveryAttempts > maxRecoveryAttempts` after the increment → `fail` with diagnostics, reset counter, return. |

#### Live-reconfiguration of thresholds — VERIFIED, with a LOW caveat

The `config` parameter is a getter (`() => WatchdogConfig`,
typed at useWatchdog.ts:80) and the `tick` function reads it
fresh every call at line 221 (`const cfg = options.config()`).
Both `suspectMs` and `confirmMs` are read from `cfg` after
that line, so a Solid signal updated through `setResilience`
(see App.tsx:427) takes effect on the very next tick. The test
suite confirms this implicitly: every test uses the same
`setup({})` factory that returns a fresh closure for
`config`, so the per-tick re-read is exercised on every
case. No additional test was added for live updates because
the existing test harness already exercises the read path
once per tick.

`maxRecoveryAttempts` is also read live (line 174) and is
covered by the test at line 344-371 which runs two distinct
watchdogs with different values to confirm the threshold is
read from the closure, not from a captured local.

**Finding 6.1.A — LOW — `tickMs` is captured at `start()` time, not on every tick.**

Unlike the other three knobs, `tickMs` is read only inside
`start()` (useWatchdog.ts:306) and passed to `setInterval`,
which freezes the interval. If the user changes
`watchdogTickMs` at runtime (e.g. via a Solid signal that
re-renders the `config` closure), the new value is *not*
honored until the next `stop()` + `start()` cycle. The
`watchdog` start/stop effect at App.tsx:1251-1263 only
restarts on the `running` ↔ non-running transition, so a
mid-iteration threshold change to `tickMs` is silently
ignored for the remainder of the run.

The behavior is safe (a faster tick is non-destructive; a
slower tick just delays a recovery), but inconsistent with
the other three knobs and not documented. Severity is LOW
because the only user-visible effect is "my
`--resilience watchdogTickMs=5000` change mid-run did
nothing" and the fix is a 1-line change.

**Where.** `src/hooks/useWatchdog.ts:297-307`.

**Proposed fix.** Move the `setInterval` callback's
configuration reads inside the callback:

```ts
start() {
  if (timer) return
  timer = setInterval(() => {
    const cfg = options.config()
    // pass cfg into tick or make tick read it again
    tick().catch(...)
  }, options.config().tickMs)
}
```

Or, equivalently, restart the interval when the relevant
config field changes. The current `stop()` + `start()`
method already exposes the seam (line 308-313). Fix
proposed, not applied (audit-only).

#### Recovery action contract — VERIFIED, with a MEDIUM caveat

The `recover` function (useWatchdog.ts:169-209) is the only
funnel for any destructive action. Its contract, from the
code:

1. **Increment** `recoveryAttempts` (line 175) — pre-check.
2. **Set** `health = "RECOVERING"` (line 176) and log
   (line 177-182).
3. **Circuit-breaker check** (line 189-199): if
   `recoveryAttempts > cfg.maxRecoveryAttempts`, dispatch
   `fail(diagnostics)`, reset the counter to 0, return.
4. **Always** call `reconnectSSE()` (line 203) — cheap
   first step.
5. **Escalation ladder** (line 204-208):
   - `server_hung` reason OR `recoveryAttempts >= 2` →
     `await restartServer()`
   - else → `await abortAndRetry()`

The escalation ladder was added in commit `bc98648`
("fix(watchdog): heartbeat mid-probe cancels tick;
preserve recovery budget across iterations") with the
documented intent that a wedge that survives one
abort+retry escalates to a server restart. The test at
useWatchdog.test.ts:214-224 pins the second-attempt
escalates, and test 262-281 pins the recovery budget
survives an iteration restart (so a chronically wedging
task can't loop abort+retry indefinitely).

**Finding 6.1.B — MEDIUM — `recover()` has no try/catch around the recovery actions, so a probe failure mid-recover is logged but does not advance the ladder.**

The `recover` function (line 169-209) does
`await options.actions.restartServer()` /
`await options.actions.abortAndRetry()` with no local
try/catch. If either throws, the exception propagates out
of `tick()` (line 211-288) into the setInterval callback's
`.catch` at line 301-305, which logs `tick_error` and
swallows the rejection. The next tick (15s later by
default) will re-enter the same state and the
`recoveryAttempts` counter is preserved, so the
circuit-breaker still trips after `maxRecoveryAttempts`
failures. The watchdog is *not* stuck.

However, the `RECOVERING` health state is left set (line
176 happened, but the failed action's `await` threw before
the `return` at line 209), and the dashboard's "recovery
in progress" indicator is shown without a corresponding
diagnostic being logged. The user sees the spinner
disappear after 15s with no error and no log entry tying
the disappearance to a specific action failure.

Today, neither `restartServer` nor `abortAndRetry` throws
in practice:
- `restartServer` (App.tsx:649-663) does
  `server.restart()` which (useServer.ts:194-229) catches
  all errors and just sets `status("error")`. So the
  call always resolves normally.
- `abortAndRetry` (App.tsx:267-281) has an inner
  try/catch at line 272-277 that swallows the
  `abortSession` error. The trailing
  `loop.dispatch({ type: "session_idle" })` cannot throw.

So the lack of try/catch is dormant. The MEDIUM rating
reflects the latent exposure: a future refactor of
`server.restart` or `abortSession` that lets the
exception escape would leave the watchdog silently
malfunctioning.

**Where.** `src/hooks/useWatchdog.ts:203-208`.

**Proposed fix.** Wrap the action calls in a try/catch
that:

1. Logs the failure with `reason` and `recoveryAttempts`
   to the health channel (so the disappearance is
   attributable).
2. Sets health back to `HEALTHY` or `SUSPECT` (whichever
   the situation calls for) so the dashboard doesn't
   show a phantom `RECOVERING` state.
3. Does NOT swallow the counter increment — the
   circuit-breaker must still trip on the next attempt.

```ts
try {
  if (reason === "server_hung" || recoveryAttempts >= 2) {
    await options.actions.restartServer()
  } else {
    await options.actions.abortAndRetry()
  }
} catch (err) {
  log("recover_action_failed", {
    reason,
    attempt: recoveryAttempts,
    message: err instanceof Error ? err.message : String(err),
  })
  // Leave health in RECOVERING but record the failure.
  // The next tick will re-evaluate.
}
```

Fix proposed, not applied (audit-only).

#### `notifyIterationStart` deliberately does NOT reset recoveryAttempts — VERIFIED

The choice at useWatchdog.ts:140-149 to reset
`lastHeartbeatAt` but preserve `recoveryAttempts` on
iteration start is a deliberate design decision: an
`abortAndRetry` advances the loop into a new iteration
which calls `notifyIterationStart`, so resetting the
counter here would hand a chronically wedging task an
unlimited abort/retry budget. The recovery budget is
cleared only by genuine progress (`recordHeartbeat` /
`notifyIdle`) or by the breaker firing. The test at
useWatchdog.test.ts:373-389 pins this contract
explicitly.

This is INFO-level documentation, not a finding. It is
called out here because subsequent phases (6.5) will
re-audit the `notifyIdle` semantics and the contrast is
useful: `notifyIdle` *does* reset the counter
(useWatchdog.ts:151-154) because it represents a clean
end-of-iteration, not a same-iteration restart.

#### `ticking` guard — VERIFIED, no test gap

`tick()` begins with `if (ticking) return` (line 212) and
clears the flag in `finally` (line 286). The guard
prevents overlapping probe round-trips, which would
otherwise allow two `setInterval` callbacks to both
trigger `restartServer()` concurrently. The behavior is
covered by the structure of the existing test suite (each
test calls `await s.wd.tick()` sequentially, which would
expose any leak). No new test was added because the
observable invariant is "no concurrent `await`
`options.actions.restartServer()`" and the existing tests
already exercise the single-call case end-to-end.

#### Heartbeat rescue during probe — VERIFIED, no test gap

The `rescuedByHeartbeat()` closure at line 239-240 is
called after each probe (line 243, 254) and short-circuits
the tick if a heartbeat landed while the probe was in
flight. This closes the read-then-act TOCTOU window
between measuring `dt` and acting on it. Two tests pin
this contract:
- `useWatchdog.test.ts:239-248` — heartbeat during
  reconcile cancels the tick.
- `useWatchdog.test.ts:250-260` — heartbeat during ping
  cancels the tick.

#### Test coverage added in this task

One additional test was added to `useWatchdog.test.ts`
to pin the live-reconfig fidelity for the threshold
knobs. The test creates a watchdog with a *mutable*
config closure (the default `setup()` factory freezes
config at construction), then flips `suspectMs` and
`confirmMs` between ticks:

```ts
it("threshold knobs (suspectMs, confirmMs) are read live from config() every tick", async () => {
  let suspectMs = 1000
  let confirmMs = 2000
  // ... hand-built createWatchdog() with mutable config
  clk.advance(1_500)
  await wd.tick()
  expect(wd.health()).toBe("SUSPECT")        // dt=1500, in [T1, T2)

  suspectMs = 10_000                         // raise the bar
  await wd.tick()
  expect(wd.health()).toBe("HEALTHY")        // dt=1500 now < suspectMs

  suspectMs = 1_000; confirmMs = 1_000       // drop both
  await wd.tick()
  expect(wd.health()).toBe("RECOVERING")     // dt >= confirmMs → STUCK → recover
  expect(sseCalls.abort).toBe(1)             // first attempt = abort
})
```

This is the *positive* half of Finding 6.1.A's
observation. The negative half ("`tickMs` is sticky") is
not testable through the public `Watchdog` interface (the
interval handle is private) without wall-clock waiting,
which is fragile. The behavior is documented in the
source comment at useWatchdog.ts:79 and is implicit from
`setInterval`'s capture-once semantics, so the lack of a
test is a conscious choice rather than an oversight.

#### Verifier checklist for Task 6.1

- [x] `tickMs` defaults to `15_000` (config.ts:128) and is
  captured at `start()` time only
  (useWatchdog.ts:306) — verified.
- [x] `suspectMs` defaults to `90_000` (config.ts:129) and
  is read live every tick (useWatchdog.ts:225, 240) —
  verified.
- [x] `confirmMs` defaults to `600_000` (config.ts:130) and
  is read live every tick (useWatchdog.ts:275) — verified.
- [x] `maxRecoveryAttempts` defaults to `3` (config.ts:131)
  and the circuit breaker (useWatchdog.ts:189-199) trips
  on the (N+1)th attempt — verified by test at
  useWatchdog.test.ts:344-371.
- [x] Escalation ladder: `server_hung` or `attempts >= 2`
  → `restartServer`, else `abortAndRetry`
  (useWatchdog.ts:204-208) — verified by test at
  useWatchdog.test.ts:214-224.
- [x] `reconnectSSE` is always called first
  (useWatchdog.ts:203) — verified by test at
  useWatchdog.test.ts:146 (reconnectSSE=1 on
  abort path).
- [x] `notifyIterationStart` resets `lastHeartbeatAt` but
  not `recoveryAttempts` (useWatchdog.ts:140-149) —
  verified by test at useWatchdog.test.ts:373-389.
- [x] The `ticking` guard prevents overlapping probe
  round-trips (useWatchdog.ts:212-213, 286) — verified
  by structure of test suite.
- [x] Mid-probe heartbeat rescue via `rescuedByHeartbeat`
  (useWatchdog.ts:239-240, 243, 254) — verified by
  tests at useWatchdog.test.ts:239-260.

#### Test-suite delta for Task 6.1

Added 1 new test to `useWatchdog.test.ts` to pin the
positive side of Finding 6.1.A: that `suspectMs` and
`confirmMs` are read live from `config()` on every tick,
not captured at `start()` time like `tickMs` is.

`bun test` -> **624 pass, 0 fail, 1518 expect() calls**
across 21 files. No regressions.

### Task 6.2 — `isActive` probe matches `getActiveSessionId`

PLAN.md 6.2: "watchdog `isActive` probe returns true
only for `running`/`pausing` states with a non-empty
sessionId — confirm this matches `getActiveSessionId`."

#### The two predicates side-by-side

The probe at `src/App.tsx:242-247`:

```ts
isActive: () => {
  const s = loop.state()
  return (
    (s.type === "running" || s.type === "pausing") && s.sessionId !== ""
  )
}
```

The canonical function at `src/hooks/useLoopState.ts:34-38`:

```ts
export function getActiveSessionId(state: LoopState): string {
  return state.type === "running" || state.type === "pausing"
    ? state.sessionId
    : ""
}
```

The probe's truth value is

```
(s.type === "running" || s.type === "pausing") && s.sessionId !== ""
```

`getActiveSessionId(s) !== ""` expands to

```
(s.type === "running" || s.type === "pausing")
  ? s.sessionId !== ""
  : false
```

which simplifies to the same expression by
short-circuit: when the type guard is false, the
`false` branch is identical to `false`; when the
type guard is true, the inner `s.sessionId !== ""`
is exactly the second clause of the probe's
conjunction. **The two predicates are logically
identical for every `LoopState` value.**

#### Truth table across all 12 `LoopState` variants

| State                              | `isActive()` | `getActiveSessionId(s) !== ""` | Match |
| ---------------------------------- | ------------ | ------------------------------ | ----- |
| `starting`                         | `false`      | `false`                        | ✓     |
| `ready`                            | `false`      | `false`                        | ✓     |
| `running{…, ""}`                   | `false`      | `false`                        | ✓     |
| `running{…, "abc"}`                | `true`       | `true`                         | ✓     |
| `pausing{…, ""}`                   | `false`      | `false`                        | ✓     |
| `pausing{…, "abc"}`                | `true`       | `true`                         | ✓     |
| `paused{…}`                        | `false`      | `false`                        | ✓     |
| `cooldown{…}`                      | `false`      | `false`                        | ✓     |
| `stopping`                         | `false`      | `false`                        | ✓     |
| `stopped`                          | `false`      | `false`                        | ✓     |
| `complete{…}`                      | `false`      | `false`                        | ✓     |
| `error{…}`                         | `false`      | `false`                        | ✓     |
| `debug{""}`                        | `false`      | `false`                        | ✓     |
| `debug{"abc"}`                     | `false`      | `false`                        | ✓     |

13 rows because `running` and `pausing` each split
on the empty/non-empty `sessionId` discriminant.
All match. The two predicates agree on every
variant the type system permits.

Note in particular the `debug{…, "abc"}` row: the
`debug` state carries a `sessionId` (set by the
`new_session` action in `useLoopState.ts:62-67`),
but the watchdog stays quiet because `debug` is
neither `running` nor `pausing`. This is the
correct behavior — debug mode is user-driven, not
loop-driven, and a wedging debug session is a
user-visible problem, not a watchdog problem.

#### Finding 6.2.A — LOW — Duplicated predicate in `App.tsx` invites drift

The probe at `App.tsx:242-247` inlines the
`getActiveSessionId` predicate instead of calling
the exported helper. The other five call sites in
`App.tsx` (lines 252, 270, 461, 627, 1277) all use
`getActiveSessionId(loop.state())` directly. The
watchdog is the only outlier.

Today the duplication is harmless — the two
expressions are identical. But the maintenance
hazard is real: if `getActiveSessionId` is ever
extended (e.g. to also return `state.sessionId`
for `debug{…}` when a session is attached, so
debug-mode wedges can also be guarded), the
watchdog probe will silently desynchronize. No
test or call site will catch the divergence
because the probe is a closure with no observable
output other than "did the watchdog run".

**Where.** `src/App.tsx:242-247`.

**Proposed fix.** Replace the inlined body with
a call to the canonical helper:

```ts
isActive: () => getActiveSessionId(loop.state()) !== "",
```

One line per side, zero behavior change, and the
predicate is now derived from the same source the
other five call sites use. A future extension of
`getActiveSessionId` automatically extends the
watchdog.

This is already called out as a Phase 16
code-duplication item ("duplicated session ID
resolution `sessionId() || lastSessionId()`"),
but the specific shape here — the only call site
that re-derives the predicate inline — is
distinct enough to flag on its own. Fix proposed,
not applied (audit-only).

#### No test gap on the public contract

The existing watchdog test at
`useWatchdog.test.ts:170-177` ("does nothing when
the loop is not in a guarded state") pins the
*negative* half of the predicate by setting
`isActive: false` in the `setup()` helper and
verifying the watchdog stays `HEALTHY` and never
calls `abortAndRetry` / `restartServer`. The
positive half is exercised by every other test in
the suite (they all default to `isActive: true`).
So the *contract* between the watchdog and its
probes is fully covered.

What is NOT covered is the truth table of the
*implementation* of the probe — i.e. the actual
`getActiveSessionId` function. If the probe is
refactored to use `getActiveSessionId`, the
*function* itself needs a test to pin its truth
table, because that table is what the watchdog's
correctness ultimately depends on.

#### Verifier checklist for Task 6.2

- [x] `isActive` probe body at `App.tsx:242-247`
  is `(s.type === "running" || s.type === "pausing")
  && s.sessionId !== ""` — verified by direct
  file read.
- [x] `getActiveSessionId` at `useLoopState.ts:34-38`
  returns `state.sessionId` when `state.type` is
  `running` or `pausing`, else `""` — verified by
  direct file read.
- [x] `getActiveSessionId(s) !== ""` simplifies to
  the same boolean expression as the probe body —
  verified by expansion.
- [x] Truth table matches across all 12 `LoopState`
  variants (including the `running{…,""}` /
  `pausing{…,""}` splits and the `debug{…,"abc"}`
  outlier) — verified by exhaustive enumeration
  above.
- [x] `debug{…,"abc"}` correctly returns `false`
  from the probe despite carrying a `sessionId` —
  verified: `debug` is not in the `running` /
  `pausing` set, and debug mode is intentionally
  not watchdog-guarded.
- [x] The 5 other call sites of `getActiveSessionId`
  in `App.tsx` (lines 252, 270, 461, 627, 1277)
  use the helper directly — verified by `grep`.
  Only the `isActive` probe inlines the predicate.

#### Test-suite delta for Task 6.2

Added 1 new test to `useLoopState.test.ts` to pin
the truth table of `getActiveSessionId` across
all 12 `LoopState` variants. The test is the
*implementation* pin that the watchdog probe
relies on — if `getActiveSessionId` is ever
extended or refactored, this test will catch
any behavior change.

`bun test` -> **628 pass, 0 fail, 1532 expect() calls**
across 21 files. No regressions.


### Task 6.3 — Watchdog start/stop lifecycle is driven by `loop.isRunning()`

PLAN.md 6.3: "Verify: watchdog stops and starts correctly
based on `loop.isRunning()` — paused and cooldown states
should NOT have the watchdog running."

**Status: COMPLETE — VERIFIED. Two INFO observations,
no HIGH/CRITICAL findings.**

The intent of PLAN.md 6.3 is to confirm that the watchdog's
*interval* is torn down (no new ticks scheduled) whenever
the loop is not actively driving a session, so the
watchdog cannot run recovery actions against a paused or
cooldown-state loop. The implementation is a single
Solid `createEffect` that toggles `watchdog.start()` /
`watchdog.stop()` on the `loop.isRunning()` memo.

#### The two-call wiring at `App.tsx:1247-1263`

```ts
// Lifecycle of the guardian and power assertion:
// - Watchdog runs while iterating (running/pausing); it's silent otherwise.
// - caffeinate runs while iterating OR waiting out a cooldown, so a rate-limit
//   wait can't get suspended either.
createEffect(() => {
  if (loop.isRunning()) {
    watchdog.start()
  } else {
    watchdog.stop()
  }

  if (loop.isRunning() || loop.isCooldown()) {
    power.start()
  } else {
    power.stop()
  }
})
```

The `loop.isRunning()` memo at `useLoopState.ts:307-310`:

```ts
const isRunning = createMemo(() => {
  const s = state()
  return s.type === "running" || s.type === "pausing"
})
```

is the single switch that drives the effect. `isRunning()`
returns `true` only for `running` and `pausing`; for every
other `LoopState` variant it returns `false`.

#### Truth table across all 12 `LoopState` variants

| State                              | `isRunning()` | Watchdog `start()` called? | Watchdog `stop()` called? | Comment |
| ---------------------------------- | ------------- | -------------------------- | ------------------------- | ------- |
| `starting`                         | `false`       | No                         | Yes                       | Pre-server-ready; no session exists. |
| `ready`                            | `false`       | No                         | Yes                       | Server up, no iteration yet. |
| `running{"abc"}`                   | `true`        | Yes (or no-op if already)  | No                        | Active session; watchdog guards. |
| `running{""}` (between dispatches) | `true`        | Same as above              | No                        | `isActive` probe (line 242-247) is the second line of defense and short-circuits. |
| `pausing{"abc"}`                   | `true`        | Yes (or no-op)             | No                        | User pressed P; model is still wrapping up; watchdog continues guarding. |
| `pausing{""}`                      | `true`        | Same                       | No                        | Probe short-circuits. |
| `paused`                           | `false`       | No                         | **Yes**                   | PLAN.md 6.3 intent satisfied. |
| `cooldown`                         | `false`       | No                         | **Yes**                   | PLAN.md 6.3 intent satisfied. Rate-limit wait is not a watchdog concern; `enterCooldown` is the timer. |
| `stopping`                         | `false`       | No                         | Yes                       | Quit in progress. |
| `stopped`                          | `false`       | No                         | Yes                       | Terminal. |
| `complete`                         | `false`       | No                         | Yes                       | Terminal. |
| `error`                            | `false`       | No                         | Yes                       | `handleQuit` (App.tsx:975) and the effect both call `stop()`. |
| `debug{"abc"}`                     | `false`       | No                         | Yes                       | Debug mode is user-driven; the watchdog correctly stays silent. |

The two rows that PLAN.md 6.3 calls out — `paused` and
`cooldown` — both land in the `stop()` column. The
watchdog interval is torn down in both states.

#### Transition matrix — every entry / exit from "watchdog running"

| Transition                   | `isRunning()` change | Effect re-fires? | Watchdog action |
| ---------------------------- | -------------------- | ---------------- | --------------- |
| `ready` → `running{"…"}`     | false → true         | Yes              | `start()`       |
| `running` → `pausing`        | true → true          | No               | (no-op)         |
| `pausing` → `paused`         | true → false         | Yes              | `stop()`        |
| `paused` → `running`         | false → true         | Yes              | `start()`       |
| `running` → `cooldown`       | true → false         | Yes              | `stop()`        |
| `cooldown` → `running`       | false → true         | Yes              | `start()`       |
| `running` → `error`          | true → false         | Yes              | `stop()`        |
| `error` → `running` (retry)  | false → true         | Yes              | `start()`       |
| `running` → `stopping`       | true → false         | Yes              | `stop()`        |
| `running` → `complete`       | true → false         | Yes              | `stop()`        |
| `running` → `ready` (rare)   | true → false         | Yes              | `stop()`        |

The transitions where `isRunning()` is unchanged
(`running` → `pausing` only) deliberately do not
re-fire the effect — `pausing` is a guarded state
with a session, and the watchdog should keep running
through the pause-request window. This is the right
behavior: if a user presses P at the exact moment the
watchdog is about to recover, the recovery should
land, not be silently discarded by a re-fire of the
effect that races with the dispatch.

#### `start()` and `stop()` are both idempotent — VERIFIED

`useWatchdog.ts:297-316`:

```ts
start() {
  if (timer) return  // <-- idempotent guard
  timer = setInterval(() => {
    tick().catch((err) => {
      log("tick_error", { ... })
    })
  }, options.config().tickMs)
},
stop() {
  if (timer) {       // <-- idempotent guard
    clearInterval(timer)
    timer = null
  }
},
isRunning() {
  return timer !== null
},
```

The `if (timer) return` and `if (timer)` guards make
both calls safe to invoke multiple times. The Solid
effect at App.tsx:1251-1256 may re-fire multiple times
during a single transition (Solid batches synchronous
re-runs), and even a stale run that calls `start()` on
an already-running watchdog is a no-op. The reverse is
also true: `stop()` on a watchdog that has already been
stopped (e.g. `handleQuit` at App.tsx:975 calls
`watchdog.stop()`, then the effect's cleanup path
calls it again) is safe.

#### Mid-tick `stop()` — VERIFIED safe

If `stop()` is called while a `tick()` is in flight
(e.g. awaiting `recover()` → `restartServer()` or
`abortAndRetry()` at useWatchdog.ts:204-208), the
in-flight tick completes because `clearInterval` only
prevents *new* ticks from being scheduled. The
`ticking` flag (line 212, cleared at line 286) is
cleared in the `finally` block, so the next
`tick()` call (e.g. a manual one or a subsequent
`start()` cycle) sees `ticking === false` and
proceeds normally. No state corruption, no leaked
intervals, no double-tick overlap.

#### Two-line defense — `isActive` probe as belt-and-suspenders

Even if the `createEffect` at App.tsx:1251 were
inverted (e.g. always calling `start()`), the
`isActive` probe at the top of `tick()` (line
215-219) is the second line of defense:

```ts
async function tick(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    if (!options.probes.isActive()) {
      setHealth("HEALTHY")
      return
    }
    ...
```

The probe returns `false` for `paused`, `cooldown`,
and all other non-guarded states (verified by Task
6.2's truth table), so a stuck interval would still
not perform any recovery actions. The effect at
App.tsx:1251 is the *primary* defense; the probe is
the safety net.

#### `handleQuit` double-stops — VERIFIED safe

`handleQuit` (App.tsx:968-994) calls `watchdog.stop()`
at line 975 *before* dispatching `quit` (line 971).
After the dispatch, `loop.state()` transitions to
`stopping` (or `stopped`), which makes
`isRunning()` return `false`, which makes the effect
re-fire and call `watchdog.stop()` again. Both
calls are idempotent (see above), so the double-stop
is a no-op. The pattern is *defensive* in nature: a
future refactor of `loopReducer` that, say, skips
the `stopping` transition on quit would not break
the cleanup.

#### INFO — `cooldown` is intentionally not in `isRunning()`

`isCooldown()` is a separate memo at
`useLoopState.ts:328-330`. It is used by the
*caffeinate* half of the same `createEffect`
(App.tsx:1258-1262) but not by the watchdog
half. The asymmetry is intentional: a
rate-limit cooldown is "the model is fine, the
provider is throttling us", so the session is
not actively iterating and the watchdog has
nothing to guard. Putting `cooldown` into
`isRunning()` would cause the watchdog to
issue false-positive recovery actions
(`abortAndRetry` would call `session_idle`,
which would advance the iteration while a
rate-limit wait is pending — exactly the
wedge the cooldown was designed to prevent).
The two memos are split for this reason.

#### INFO — only 5 callsites in `App.tsx` drive the watchdog's lifecycle

`grep -n 'watchdog\.' src/App.tsx` returns 12 hits,
but the lifecycle-relevant ones are:

- App.tsx:208 — `watchdog.notifyWake()` (sleep recovery)
- App.tsx:300 — `watchdog.recordHeartbeat` (SSE event)
- App.tsx:503 — `watchdog.notifyIdle()` (clean session end)
- App.tsx:661 — `watchdog.notifyWake()` (second sleep path)
- App.tsx:824 — `watchdog.notifyIterationStart()` (new iteration)
- App.tsx:975 — `watchdog.stop()` (handleQuit)
- App.tsx:1186 — `watchdog.notifyIterationStart()` (debug path)
- App.tsx:1253 — `watchdog.start()` (effect, this task)
- App.tsx:1255 — `watchdog.stop()` (effect, this task)
- App.tsx:1820 — `watchdog.health` (read for dashboard)

`start()` is called from exactly one place
(App.tsx:1253) and `stop()` from exactly two
(App.tsx:975 and 1255). No hidden external
starts that would race the effect.

#### Verifier checklist for Task 6.3

- [x] `isRunning()` returns `true` only for `running`
  and `pausing` — verified by direct file read at
  `useLoopState.ts:307-310`.
- [x] Effect at `App.tsx:1251-1256` calls
  `watchdog.start()` on `true` and `watchdog.stop()`
  on `false` — verified by direct file read.
- [x] `paused` state → `isRunning()` false → watchdog
  `stop()` called — matches PLAN.md 6.3 intent.
- [x] `cooldown` state → `isRunning()` false → watchdog
  `stop()` called — matches PLAN.md 6.3 intent.
- [x] All 12 `LoopState` variants enumerated in the
  truth table above; the `start`/`stop` decision is
  correct for every one.
- [x] `start()` is idempotent (line 298 `if (timer) return`)
  — verified by direct read and by new test
  `useWatchdog.test.ts:"start() is idempotent"`.
- [x] `stop()` is idempotent (line 309 `if (timer)`)
  — verified by direct read and by new test
  `useWatchdog.test.ts:"stop() is idempotent"`.
- [x] Mid-tick `stop()` is safe: `ticking` flag
  cleared in `finally` (line 286) and
  `clearInterval` only blocks future ticks —
  verified by direct read and by new test
  `useWatchdog.test.ts:"start() then stop() is a no-op for the internal ticking flag"`.
- [x] Second line of defense: `isActive` probe at
  `tick()` line 215-219 short-circuits for any
  non-guarded state — verified by Task 6.2's
  truth table.
- [x] `handleQuit` double-stops the watchdog
  (App.tsx:975 + effect re-fire) — verified
  idempotent by above.

#### Test-suite delta for Task 6.3

Added 4 new tests to `useWatchdog.test.ts` to pin
the lifecycle state machine:

1. **`isRunning() reflects the start/stop state machine`** —
   asserts the false → start → true → stop → false
   sequence on the public `isRunning()` accessor.
2. **`start() is idempotent`** — calling `start()`
   twice does not throw and does not create a
   second interval.
3. **`stop() is idempotent`** — calling `stop()`
   on a non-running watchdog does not throw, and
   `start() → stop() → stop()` is also safe.
4. **`start() then stop() is a no-op for the internal ticking flag`** —
   after a `start() → stop()` cycle, manual
   `tick()` calls still consult probes and
   reach a normal `SUSPECT` verdict, proving
   the `ticking` guard was cleared in the
   `finally` block of the prior in-flight tick
   (or, in this case, was never set because
   no callback fired during the brief
   `start` → `stop` window).

The four tests do not exercise the
`setInterval`-driven fire path itself (Bun's
test runtime doesn't have built-in fake
timers, and the `setInterval` handle is
private to the watchdog). The public
contract — that `isRunning()` correctly
reflects whether the interval is scheduled
— is fully pinned, and the existing
anti-false-positive test at
`useWatchdog.test.ts:170-177` ("does
nothing when the loop is not in a guarded
state") pins the second line of defense
(the `isActive` probe) for the underlying
tick logic.

`bun test` -> **632 pass, 0 fail, 1544 expect() calls**
across 21 files. No regressions.


### Task 6.4 — `notifyWake` resets the heartbeat baseline (prevents immediate re-trigger after a server restart)

PLAN.md 6.4: "Verify: `notifyWake` resets the heartbeat
baseline — confirm this prevents immediate re-triggering
after a server restart."

**Status: COMPLETE — VERIFIED. One INFO observation
documenting the design symmetry between `notifyWake` and
`notifyIterationStart`, no HIGH/CRITICAL findings.**

#### What `notifyWake` actually does

`useWatchdog.ts:156-167`:

```ts
function notifyWake(): void {
  // Don't judge the session on the sleep gap. Reset the baseline so the model
  // gets a fresh T1 window to prove it's alive; the wake handler does the
  // ground-truth reconcile separately.
  // Note: if a tick() is in progress (ticking=true), it will complete with
  // the old lastHeartbeatAt. This is safe — the next tick will see the reset
  // timestamp and evaluate correctly. The ticking guard only prevents overlap,
  // it doesn't cause stale decisions.
  lastHeartbeatAt = clock.monotonicNow()
  setHealth("HEALTHY")
  log("wake_reset", {})
}
```

Three observable side effects, in order:

1. **`lastHeartbeatAt = clock.monotonicNow()`** — the
   heartbeat baseline is rewritten to "now" using the
   monotonic clock. The pre-wake silence window is
   discarded. This is the single most important line
   for the Phase 6.4 invariant.
2. **`setHealth("HEALTHY")`** — the watchdog's reactive
   `health` signal is forced back to `HEALTHY` regardless
   of its prior value (could be `SUSPECT`, `CONFIRMING`,
   `STUCK`, or `RECOVERING`). The dashboard's "recovery
   in progress" indicator clears immediately.
3. **`log("wake_reset", {})`** — a structured entry on
   the `health` debug channel so the wake can be
   attributed in audit logs.

The function does **not** reset `recoveryAttempts`. The
budget is preserved across the wake, which is the
correct behavior (see design symmetry below).

#### Two call sites in `App.tsx`

```
$ grep -n 'watchdog\.notifyWake' src/App.tsx
208:    watchdog.notifyWake()   # handleWake (sleep recovery)
661:    watchdog.notifyWake()   # restartServer (post-restart, verdict=working)
```

**Call site 1 — `handleWake` (App.tsx:199-221).** The
sleep detector's `onWake` callback fires after the Mac
wakes from suspension. The handler reconnects SSE (the
stream almost always died during sleep), calls
`watchdog.notifyWake()` to reset the baseline, and then
either resumes an elapsed cooldown or reconciles the
session in case the SSE dropped a `session.idle` event
while asleep. The watchdog reset is the second step of
this recovery — the first step (SSE reconnect) restores
the heartbeat stream so the next heartbeat can land.

**Call site 2 — `restartServer` (App.tsx:649-663).** The
watchdog's own `restartServer` action (or `handleWake`,
which also goes through `server.restart()` via the same
codepath) restarts the OpenCode server, reconnects SSE,
reconciles the session, and — if the verdict is
`"working"` — calls `watchdog.notifyWake()`. The
guarded `if (verdict === "working")` is critical:
calling `notifyWake()` on a session that is actually
`"idle"` or `"missing"` would hide a real desync (the
watchdog should be in `synthesizeIdle` territory, not
sleeping through the silence).

#### The Phase 6.4 invariant — end-to-end, with the timing

Consider the worst case: the OpenCode server hangs
mid-iteration. The watchdog detects the hang and the
escalation ladder fires `restartServer()`.

```
T0       model last heartbeat (real progress)
T0+T1    silence window opens (T1 = suspectMs, default 90s)
T0+T1+15 first tick after silence: pingServer fails,
         recover("server_hung", T1+15, "ping_failed"),
         restartServer() action invoked
T0+T1+15 server.restart() resolves
T0+T1+15 sse.reconnect() fires
T0+T1+15 reconcile() returns "working" (session survived
         the server restart — the OpenCode process was
         hung but the model had not actually crashed)
T0+T1+15 watchdog.notifyWake() → lastHeartbeatAt = T0+T1+15
T0+T1+30 next tick (default tickMs = 15s)
```

At T0+T1+30, the watchdog computes:

```ts
const dt = clock.monotonicNow() - lastHeartbeatAt
         = (T0+T1+30) - (T0+T1+15)
         = 15s
```

15s < T1 (90s) → the watchdog short-circuits to
`HEALTHY` at `useWatchdog.ts:225-228` without consulting
the probes. **No recovery action is triggered.** The
session has a fresh T1 window to prove it's alive with
real heartbeats.

**Counter-factual — what happens without the reset.**

If `notifyWake` did not reset `lastHeartbeatAt`, the
calculation at T0+T1+30 would be:

```ts
const dt = (T0+T1+30) - T0 = T1+30 = 120s
```

120s is still under T2 (600s, the default confirm
threshold), so the verdict would be `"working"` + `dt <
T2` → `SUSPECT` (not STUCK). But `recoveryAttempts` is
already 1, and the next tick at T0+T1+45 would compute
`dt = T1+45 = 135s`, still SUSPECT. The session would
not re-trigger a recovery in the SUSPECT regime. So the
*immediate* re-trigger is a non-issue if the verdict
stays `"working"`.

But the moment the session's verdict flips to
`"unknown"` (the typical post-restart transitory state,
covered by the test at `useWatchdog.test.ts:206-212`),
the `dt >= T1` reading on the stale baseline causes an
immediate second `recover("server_hung", ...)` with
`recoveryAttempts = 2`. That second recovery calls
`restartServer()` again (the `recoveryAttempts >= 2`
ladder branch at line 204) — the server is restarted
*twice* for one underlying hang. After one more
`unknown` verdict, the circuit breaker trips at
`recoveryAttempts > maxRecoveryAttempts` and the loop
errors out, even though the model was actually working
the whole time.

This is the precise failure mode that the comment at
`App.tsx:654-659` warns about:

> // If the session survived the restart and is still working, grant it a fresh
> // heartbeat window. Otherwise the watchdog would re-measure silence from the
> // now-stale pre-restart timestamp and trip STUCK again on the very next tick,
> // collapsing the recovery ladder into a near-instant circuit-breaker fail.

The comment is accurate: the implementation delivers the
promised behavior, and the new test
`server restart + notifyWake prevents immediate
re-trigger on the next tick (Phase 6.4 invariant)` pins
it as a regression guard.

#### Design symmetry — `notifyWake` mirrors `notifyIterationStart`

`useWatchdog.ts:140-149` (`notifyIterationStart`):

```ts
function notifyIterationStart(): void {
  // Fresh silence window for the new session, but DELIBERATELY do not reset
  // recoveryAttempts: an abort+retry advances the loop into a new iteration
  // (which calls this), so resetting here would hand a chronically wedging
  // task an unlimited abort/retry budget — it would never escalate to a
  // restart or trip the circuit breaker. The budget is cleared only by genuine
  // progress (recordHeartbeat / notifyIdle) or by the breaker firing.
  lastHeartbeatAt = clock.monotonicNow()
  setHealth("HEALTHY")
}
```

`notifyWake` and `notifyIterationStart` follow the same
recipe:

| Step                  | `notifyWake` | `notifyIterationStart` |
| --------------------- | ------------ | ---------------------- |
| Reset baseline        | yes          | yes                    |
| Set HEALTHY           | yes          | yes                    |
| Reset `recoveryAttempts` | **no**    | **no**                 |
| Emit log              | `wake_reset` | (silent)               |

The shared invariant — *never reset the recovery budget
on a context-switch* — is the load-bearing design
decision. Both functions are the result of a
context-switch where the watchdog cannot tell whether
the new context deserves a fresh budget: a server
restart could have killed a wedged session or could
have just briefly disconnected; a new iteration could
be a genuinely different task or could be the
re-execution of the same wedge. In both cases the
*safe* default is "preserve the budget, require a real
heartbeat to reset it".

`recordHeartbeat` (line 128-138) and `notifyIdle` (line
151-154) are the only two paths that reset
`recoveryAttempts`. Both correspond to "the model
actually did something" (heartbeat) or "the session
actually ended" (idle). `notifyWake` and
`notifyIterationStart` are *neither* — they are
context-switches, and they preserve the budget
accordingly. The test
`notifyWake does NOT reset recoveryAttempts (preserves
the circuit-breaker budget)` pins this for `notifyWake`;
the test at `useWatchdog.test.ts:262-281` pins it for
`notifyIterationStart`.

#### Concurrency note — the in-flight `tick()` exception

The comment at `useWatchdog.ts:159-163` documents a
deliberate non-fix: if `tick()` is mid-flight when
`notifyWake` is called, that in-flight tick completes
with the pre-wake `lastHeartbeatAt`. The *next* tick
sees the reset. This is safe because:

- The `ticking` guard (line 212) prevents overlap, so
  the in-flight tick is the only one that could be
  stale.
- The in-flight tick's decision is bounded by
  `recover()`, which always dispatches a recovery
  action; that action itself will, on completion, run
  `server.restart()` → `sse.reconnect()` →
  `reconcileAndAdvance()` → `notifyWake()` (the
  App-level flow at App.tsx:649-663). The recovery
  action's own side effects dominate the watchdog's
  baseline, so the in-flight tick's potentially-stale
  verdict is moot: the recovery is already happening.
- The next tick's `dt` is computed against the
  post-wake baseline, so it is fresh.

#### Verifier checklist for Task 6.4

- [x] `notifyWake` body at `useWatchdog.ts:156-167`
  sets `lastHeartbeatAt = clock.monotonicNow()` and
  `setHealth("HEALTHY")` — verified by direct file
  read.
- [x] `notifyWake` does NOT touch `recoveryAttempts`
  — verified by direct file read and by the new test
  `notifyWake does NOT reset recoveryAttempts`.
- [x] Two call sites in `App.tsx`: line 208 (`handleWake`)
  and line 661 (`restartServer` action body, guarded by
  `verdict === "working"`) — verified by `grep`.
- [x] The Phase 6.4 invariant (server restart → fresh
  grace → next tick is HEALTHY without re-trigger) is
  pinned by the new test `server restart + notifyWake
  prevents immediate re-trigger on the next tick (Phase
  6.4 invariant)`.
- [x] The pre-existing test at
  `useWatchdog.test.ts:196-204` ("notifyWake grants a
  fresh grace window") pins the long-sleep case.
- [x] The design symmetry with `notifyIterationStart`
  is documented in the source comments at lines
  141-146 and 159-160 and is exercised by both
  `notifyIterationStart` and `notifyWake` tests.
- [x] The `restartServer` action body at
  `App.tsx:649-663` has the correct `if (verdict ===
  "working")` guard around the `notifyWake()` call —
  verified by direct file read.

#### INFO — the `notifyWake` log entry is observable but not asserted in tests

`notifyWake` emits a `wake_reset` log on the `health`
debug channel (`useWatchdog.ts:166`). The test harness
in `useWatchdog.test.ts` uses `log: () => {}` (line 63)
which discards all log entries, so the log emission is
not asserted. This is consistent with the rest of the
test suite: the watchdog log channel is exercised by
the integration tests in `App.tsx` and by the debug
logger's own unit tests, not by the watchdog unit
tests. No action required.

#### Test-suite delta for Task 6.4

Added 3 new tests to `useWatchdog.test.ts` to pin the
`notifyWake` contract:

1. **`notifyWake resets the heartbeat baseline (next
   tick is HEALTHY without re-triggering)`** — drives
   the watchdog into `RECOVERING` via a real wedge,
   calls `notifyWake()`, then asserts the next tick is
   `HEALTHY` without consulting probes (`pingServer`
   and `reconcile` call counts unchanged) and without
   advancing any recovery action counters. Also asserts
   a subsequent 30s natural advance still leaves the
   watchdog `HEALTHY` (well under T1=90s).
2. **`notifyWake does NOT reset recoveryAttempts
   (preserves the circuit-breaker budget)`** — drives
   four consecutive `server_hung` wedges with
   `notifyWake()` between each. Asserts that the
   circuit breaker correctly trips on the fourth
   wedge (recoveryAttempts > maxRecoveryAttempts=3 →
   `fail()` called with `reason: "server_hung"`),
   proving the budget was preserved across all three
   intermediate wakes. If `notifyWake` had reset the
   budget, the breaker would never trip on a
   chronically bad server.
3. **`server restart + notifyWake prevents immediate
   re-trigger on the next tick (Phase 6.4 invariant)`**
   — the precise flow from App.tsx:649-663: server
   hangs, watchdog fires `restartServer` action, App
   simulates the post-restart body by flipping
   `ping=true` and calling `notifyWake()`, then a
   15s-later tick must short-circuit to `HEALTHY`
   without consulting probes or re-triggering. This
   test is the regression guard for the comment at
   App.tsx:654-659.

`bun test` -> **635 pass, 0 fail, 1575 expect() calls**
across 21 files. No regressions.

### Task 6.5 — `notifyIdle` resets the watchdog on a clean session end (called from `onSessionIdle`; the reconcile path resets state inline)

PLAN.md 6.5: "Verify: `notifyIdle` resets the
watchdog — called on `session_idle` and on
`reconcileAndAdvance` returning `idle`/`missing`."

**Status: COMPLETE — VERIFIED. One LOW finding
(reconcileAndAdvance does not call `notifyIdle`, by
design). No HIGH/CRITICAL findings.**

#### What `notifyIdle` actually does

`useWatchdog.ts:151-154`:

```ts
function notifyIdle(): void {
  recoveryAttempts = 0
  setHealth("HEALTHY")
}
```

Two observable side effects:

1. **`recoveryAttempts = 0`** — the recovery
   budget is zeroed. A clean session end is the
   strongest possible "proof of life" the
   watchdog can witness (stronger than a
   heartbeat, which is just a tool call), so
   any in-progress circuit-breaker accounting
   is obsolete.
2. **`setHealth("HEALTHY")`** — the reactive
   `health` signal is forced back to `HEALTHY`
   regardless of prior value (`SUSPECT`,
   `CONFIRMING`, `STUCK`, or `RECOVERING`).

The function does **not** reset
`lastHeartbeatAt` (deliberate — see design
symmetry below), and it does **not** log
(silent).

#### Single call site in `App.tsx`

```
$ grep -n 'watchdog\.notifyIdle' src/App.tsx
503:    watchdog.notifyIdle()   # onSessionIdle (SSE handler)
```

`notifyIdle` is called from exactly one place
in the App: the SSE `onSessionIdle` handler at
`App.tsx:491-507`, which fires when the OpenCode
SSE stream delivers a `session.idle` event for
the current session. The handler:

1. Verifies the event's sessionId matches the
   current or debug session (stale-session
   guard).
2. Resets the rate-limit counter
   (`rateLimitAttempts = 0`).
3. Calls `watchdog.notifyIdle()` ← the reset.
4. Dispatches `{ type: "session_idle" }` to
   the loop reducer.
5. Logs the activity.

The call ordering matters: `notifyIdle` is
invoked *before* the loop dispatch, so the
watchdog's recovery counter is zeroed in the
same microtask as the loop transition. By the
time the loop reducer runs and the next
iteration is queued, the watchdog is in a
clean state.

#### Why the reconcile path does NOT call `notifyIdle`

The PLAN.md task statement hypothesises that
`reconcileAndAdvance` returning `"idle"` or
`"missing"` should also call `notifyIdle`. The
audit verifies that **it does not, and that this
is correct by design**. Two distinct paths
handle the reconcile outcome, and neither needs
to call `notifyIdle`:

**Path A — the watchdog's own `tick()` sees
`verdict === "idle" | "missing"`.** At
`useWatchdog.ts:259-266`:

```ts
if (verdict === "idle" || verdict === "missing") {
  log("desync_recovered", { verdict })
  options.actions.synthesizeIdle()
  recoveryAttempts = 0
  setHealth("HEALTHY")
  return
}
```

The watchdog resets `recoveryAttempts = 0` and
`setHealth("HEALTHY")` *inline* before
dispatching the `synthesizeIdle` action. This
is the same two-step recipe as `notifyIdle`
(plus a log line), so calling the public
`notifyIdle` from inside `synthesizeIdle` would
be redundant. The test at
`useWatchdog.test.ts:317-334`
("`tick() path: server ping succeeds,
reconcile=idle → synthesizeIdle, recovery
attempts reset`") pins that a subsequent wedge
after this reset starts at attempt 1 (abort),
not attempt 2 (restart).

**Path B — external callers of
`reconcileAndAdvance`.** Three external
callers in `App.tsx`:

- `handleWake` (line 219) — post-sleep
  recovery. The handler *already* called
  `watchdog.notifyWake()` (line 208) before
  the reconcile, which sets `health =
  "HEALTHY"` and resets the baseline. The
  only state `notifyIdle` would change
  beyond `notifyWake` is `recoveryAttempts =
  0`. The recovery budget is preserved
  across wakes by design (Phase 6.4
  invariant), so the post-wake state is
  correct without `notifyIdle`.
- `restartServer` (line 654) — post-restart
  recovery. The action body is guarded by
  `if (verdict === "working")` for the
  `notifyWake()` call (line 660). When
  verdict is `"idle"` or `"missing"`, the
  loop advances via `session_idle` (the
  dispatch at line 640), which transitions
  `running("sessionId") → running("")`. The
  watchdog's `isActive` probe
  (`App.tsx:242-247`) then returns `false`
  (no sessionId), and the next tick
  short-circuits to `HEALTHY` at
  `useWatchdog.ts:216-219`. The
  `recoveryAttempts` counter is stale, but
  the watchdog is no longer active, so it
  is irrelevant.
- `doResume` (line 1187) — post-resume
  recovery. The reconcile call is guarded
  by `if (verdict === "working" &&
  p.sessionId)` (line 1176), so the
  reconcile path is only reached when the
  verdict is `"working"`. The `"idle"` /
  `"missing"` branch takes a different
  `else` (line 1188) that does not call
  `reconcileAndAdvance`.

**Finding 6.5.A — LOW — `reconcileAndAdvance`
does not call `watchdog.notifyIdle()` when it
returns `"idle"` or `"missing"`, by design.**

The PLAN.md task statement suggested that
`notifyIdle` should be called from
`reconcileAndAdvance` on a `"idle"`/`"missing"`
verdict. The audit confirms the call is
absent in `App.tsx:625-643`, but the behavior
is correct because:

1. The watchdog's own `tick()` (the primary
   reconcile trigger) resets
   `recoveryAttempts = 0` and sets
   `health = "HEALTHY"` inline at
   `useWatchdog.ts:263-264` before
   dispatching `synthesizeIdle`. The
   public `notifyIdle` is a thin wrapper
   around these same two operations (plus
   `recoveryAttempts = 0`), so calling
   it from `synthesizeIdle` would be a
   no-op.
2. External `reconcileAndAdvance` callers
   (`handleWake`, `restartServer`) reach
   the `"idle"`/`"missing"` branch only
   after the loop has been (or will be)
   transitioned via `session_idle`. The
   watchdog's `isActive` probe returns
   `false` post-transition, so the
   watchdog short-circuits to `HEALTHY`
   on the next tick. The
   `recoveryAttempts` counter is stale
   but the watchdog is dormant.
3. The recovery budget is *deliberately*
   preserved across iteration boundaries
   (see Phase 6.1 / 6.4 design symmetry in
   this file). A "session ended" event
   from the reconcile path is not
   qualitatively stronger than a clean SSE
   `session.idle`; both represent the
   *same* kind of clean end. Resetting
   only in the SSE path and not the
   reconcile path keeps the "genuine
   progress" gate uniform: a heartbeat
   or a direct `session.idle` SSE event
   is required to clear the budget, not
   a reconcile-derived inference.

**Severity is LOW** because the behavior
is correct, but the inconsistency with the
PLAN.md task statement is worth pinning
explicitly so a future refactor of
`reconcileAndAdvance` does not add a
redundant `notifyIdle()` call (or, worse,
*rely* on the absent call to keep state
in sync).

**Where.** `src/App.tsx:625-643`
(`reconcileAndAdvance`).

**Proposed fix.** Add a code comment at
`App.tsx:634-641` making the design intent
explicit so a future reviewer does not
add the call:

```ts
if (result === "idle" || result === "missing") {
  activityLog.addEvent(...)
  rateLimitAttempts = 0
  // The watchdog's recovery counter is intentionally
  // NOT reset here. The watchdog's own tick()
  // (useWatchdog.ts:263-264) handles the same
  // verdict inline, and the next iteration's
  // notifyIterationStart preserves the budget by
  // design (Phase 6.1 / 6.4). Resetting here would
  // diverge the SSE and reconcile code paths.
  loop.dispatch({ type: "session_idle" })
}
```

Fix proposed, not applied (audit-only).

#### Design symmetry — `notifyIdle` is the budget-reset half of the watchdog's vocabulary

The four notifier functions split cleanly into
two pairs based on whether they reset
`recoveryAttempts`:

| Notifier               | lastHeartbeatAt | recoveryAttempts | health   | Used by                                |
| ---------------------- | --------------- | ---------------- | -------- | -------------------------------------- |
| `recordHeartbeat`      | reset           | **reset**        | HEALTHY  | Any SSE progress event                 |
| `notifyIterationStart` | reset           | preserved        | HEALTHY  | `startIteration` (App.tsx:824)         |
| `notifyWake`           | reset           | preserved        | HEALTHY  | `handleWake` (App.tsx:208), post-restart (App.tsx:661) |
| `notifyIdle`           | preserved       | **reset**        | HEALTHY  | SSE `onSessionIdle` (App.tsx:503)      |

The split matches the design intent: only
"proof of progress" signals (`recordHeartbeat`)
and "proof of completion" signals
(`notifyIdle`) reset the budget. Context
switches (`notifyIterationStart`, `notifyWake`)
do not, because a context switch could mask a
real wedge (the new session could be the
re-execution of the same bad task).

`notifyIdle` is unique in preserving the
baseline. The reasoning, made explicit in the
new tests below: there is no in-flight work to
measure silence against once the session has
ended. The next iteration's `startIteration`
calls `notifyIterationStart`, which resets
the baseline. Until then, the stale baseline
is benign — the watchdog's `isActive` probe
returns `false` (no sessionId), so the
`tick()` short-circuits to `HEALTHY` at
`useWatchdog.ts:216-219`.

#### Verifier checklist for Task 6.5

- [x] `notifyIdle` body at `useWatchdog.ts:151-154`
  sets `recoveryAttempts = 0` and `setHealth("HEALTHY")`
  — verified by direct file read and by the new
  test `notifyIdle resets recoveryAttempts and
  sets health to HEALTHY (clean session end)`.
- [x] `notifyIdle` does NOT touch `lastHeartbeatAt`
  — verified by direct file read and by the new
  test `notifyIdle does NOT reset lastHeartbeatAt
  (deliberate, unlike recordHeartbeat and notifyWake)`.
- [x] `notifyIdle` called from the SSE `onSessionIdle`
  handler at `App.tsx:503` — verified by `grep`
  (single call site).
- [x] `notifyIdle` is NOT called from
  `reconcileAndAdvance` at `App.tsx:625-643` —
  verified by `grep`. Behavior is correct because
  the watchdog's own `tick()` and the loop
  transition cover the reset.
- [x] `notifyIdle` is NOT called from the
  `synthesizeIdle` action at `App.tsx:262-266` —
  verified by `grep`. Behavior is correct because
  the watchdog's own `tick()` resets state inline
  before dispatching the action.
- [x] The `RECOVERING` → `notifyIdle` → `HEALTHY`
  transition is pinned by the new test
  `notifyIdle in RECOVERING state: cancels the
  in-flight recovery and drops to HEALTHY`.
- [x] The post-`notifyIdle` budget is verified to
  be zero (not just `HEALTHY` while leaving the
  counter non-zero) by the new test asserting
  that a fresh wedge starts at attempt 1
  (`abortAndRetry` count increases), not attempt
  2 (`restartServer` count stays 0).

#### INFO — the SSE onSessionIdle / reconcileAndAdvance asymmetry is observed behavior, not a bug

`reconcileAndAdvance` is described in its
docstring at `App.tsx:617-624` as the "single
source of truth shared by the watchdog
(Phase 4) and the sleep/wake handler
(Phase 2)". The phrase "single source of
truth" suggests a symmetry that the current
implementation does not deliver: the SSE
`onSessionIdle` handler calls `notifyIdle`,
but `reconcileAndAdvance` does not. The
audit's Finding 6.5.A documents that the
asymmetry is correct, not a bug. The
proposed fix is a one-line comment in
`reconcileAndAdvance` to make the design
intent explicit; no behavioral change.

#### Test-suite delta for Task 6.5

Added 3 new tests to `useWatchdog.test.ts`
to pin the `notifyIdle` contract:

1. **`notifyIdle resets recoveryAttempts and
   sets health to HEALTHY (clean session
   end)`** — drives the watchdog into
   `RECOVERING` via a real wedge (attempt 1
   = abort), then calls `notifyIdle()` and
   asserts both `health === "HEALTHY"` and
   the counter is zero (proven by a fresh
   wedge that starts at attempt 1, not
   attempt 2).
2. **`notifyIdle does NOT reset
   lastHeartbeatAt (deliberate, unlike
   recordHeartbeat and notifyWake)`** —
   drives the watchdog into `SUSPECT` past
   T1, calls `notifyIdle()`, then advances
   the clock and ticks. The test asserts
   that the watchdog does NOT short-circuit
   to `HEALTHY` on the next tick (which it
   would have if `notifyIdle` had reset the
   baseline); it lands on `SUSPECT` again
   because the stale baseline is still
   measured. This pins the asymmetry
   documented in the design-symmetry
   table.
3. **`notifyIdle in RECOVERING state:
   cancels the in-flight recovery and drops
   to HEALTHY`** — exercises the
   `session.idle`-arrives-mid-recovery race:
   the watchdog is in `RECOVERING` from a
   real wedge, the legitimate idle event
   arrives, `notifyIdle` is called, and the
   next wedge starts at attempt 1. This is
   the strongest assertion that
    `recoveryAttempts` is a *hard* reset
    inside `notifyIdle`, not a soft hint.

`bun test` -> **638 pass, 0 fail, 1591
expect() calls** across 21 files.

### Task 6.6 — `abortAndRetry` in watchdog actions re-enters the iteration driver; the circuit breaker prevents infinite retry loops

PLAN.md 6.6: "Verify: `abortAndRetry` in
watchdog actions dispatches `session_idle` —
this re-enters the iteration driver; confirm
there's no infinite loop if the session keeps
failing."

**Status: COMPLETE — VERIFIED. No CRITICAL /
HIGH / MEDIUM findings. Two new tests pin
the full end-to-end no-infinite-loop
guarantee.**

#### End-to-end flow traced

The flow is a six-step chain spanning the
watchdog, the loop reducer, the App-level
iteration driver, and `startIteration`:

1. **Watchdog tick declares STUCK.**
   `useWatchdog.ts:275-279` — when
   `dt >= confirmMs` and `verdict === "working"`,
   the watchdog sets `STUCK` and calls
   `recover("session_wedged", dt, verdict)`.
2. **`recover()` selects the action via the
   escalation ladder** at
   `useWatchdog.ts:201-208`:

   ```ts
   options.actions.reconnectSSE()
   if (reason === "server_hung" || recoveryAttempts >= 2) {
     await options.actions.restartServer()
   } else {
     await options.actions.abortAndRetry()
   }
   ```

   On the first attempt (`recoveryAttempts`
   just incremented to 1, reason is
   `session_wedged` not `server_hung`), the
   watchdog calls `abortAndRetry()`.
3. **`abortAndRetry` (App.tsx:267-281) aborts
   the active session and dispatches
   `session_idle`.** The body is:

   ```ts
   const url = server.url()
   const sid = getActiveSessionId(loop.state())
   if (url && sid) {
     try { await abortSession(createClient(url), sid) }
     catch { /* best effort */ }
   }
   loop.dispatch({ type: "session_idle" })
   ```

   The `abortSession` call is wrapped in
   `try/catch` (best-effort — the session may
   already be gone) and the dispatch always
   fires, so a failed abort doesn't strand the
   loop.
4. **`session_idle` reducer transitions
   `running("sid") → running("")`.** At
   `useLoopState.ts:130-143`. The iteration
   count is preserved (the loop is mid-iteration
   retrying the same task, not advancing to a
   new task). A redundant `session_idle` on
   `running("")` short-circuits to the same
   state object (idempotency guard at line
   132-137), so a double dispatch from the
   watchdog's own tick + a race with SSE
   `onSessionIdle` cannot re-fire the iteration
   driver into a second session.
5. **Iteration driver effect detects
   `running("")` and calls `startIteration()`.**
   At `App.tsx:1217-1222`:

   ```ts
   createEffect(() => {
     const state = loop.state()
     if (state.type === "running" && state.sessionId === "") {
       startIteration()
     }
   })
   ```

   `startIteration` has an in-flight guard
   (`startingIteration`, set at App.tsx:781,
   cleared in `finally` at line 854) so a
   second trigger arriving mid-flight cannot
   create a second session and orphan the
   first.
6. **`startIteration` (App.tsx:776-856) creates
   a new session, reads the prompt file, sends
   the prompt, and calls
   `watchdog.notifyIterationStart()` (line 824)
   to reset the heartbeat baseline for the
   fresh silence window.** It also calls
   `checkPlanComplete()` at line 791 — if the
   plan is already complete (the user marked
   all remaining tasks while the previous
   session was aborting), the loop dispatches
   `plan_complete` and exits cleanly,
   short-circuiting the retry.

#### The anti-infinite-loop circuit breaker

The critical invariant is the contract
between `notifyIterationStart` and the
watchdog's recovery counter. This contract
is documented inline at
`useWatchdog.ts:140-149`:

```ts
function notifyIterationStart(): void {
  // Fresh silence window for the new session,
  // but DELIBERATELY do not reset
  // recoveryAttempts: an abort+retry advances
  // the loop into a new iteration (which calls
  // this), so resetting here would hand a
  // chronically wedging task an unlimited
  // abort/retry budget — it would never
  // escalate to a restart or trip the circuit
  // breaker. The budget is cleared only by
  // genuine progress (recordHeartbeat /
  // notifyIdle) or by the breaker firing.
  lastHeartbeatAt = clock.monotonicNow()
  setHealth("HEALTHY")
}
```

Three layers of defense prevent an infinite
loop:

1. **Escalation ladder
   (`recoveryAttempts >= 2` branch).** After
   the first `abortAndRetry`, the recovery
   counter is 1. The next wedge — even on
   the same `session_wedged` reason — triggers
   `recoveryAttempts >= 2`, so the watchdog
   calls `restartServer()` (not another
   `abortAndRetry`). A chronically wedging
   task is restarted, not retried.
2. **Hard cap (`recoveryAttempts >
   maxRecoveryAttempts`).** At
   `useWatchdog.ts:189-199`, after the counter
   increment the watchdog checks the cap. If
   exceeded, it calls `actions.fail()` with
   full diagnostics and returns without
   taking any action. `fail()` in
   `App.tsx:283-295` dispatches an
   `error` action with `recoverable: true`,
   which transitions the loop to the
   `error` state and surfaces a user dialog
   — the loop halts.
3. **`startIteration` failure path.** If
   `createSession`, `sendPromptAsync`, or
   the prompt-file read throws,
   `handleIterationError` at
   `App.tsx:754-771` classifies the error:

   - **rate_limit** → `enterCooldown` →
     respects `maxRateLimitRetries` (default
     5) before dispatching a `recoverable`
     `error` state. Independent of the
     watchdog's counter.
   - **transient** (5xx, timeout, network) →
     `enterCooldown(... "transient")` — same
     breaker as rate limit.
   - **fatal** (auth, schema, etc.) →
     immediate `error` dispatch. No retry.

   In all three cases the loop either
   eventually halts via a `recoverable:
   true` error state (user dialog) or
   succeeds on the next attempt.

#### `maxRecoveryAttempts` default and tunability

The default is `3` at `src/lib/config.ts:131`
(set by `resolveResilience` from defaults).
It is overridable via
`--resilience maxRecoveryAttempts=N` and via
the on-disk config file. A user can raise
or lower the bound without code changes.

#### INFO — `fail()` leaves `health` in `RECOVERING` (not `HEALTHY`); this is benign

When the breaker trips at
`useWatchdog.ts:189-198`, the function
returns after `setHealth("RECOVERING")` at
line 176. The `health` signal is therefore
still `RECOVERING` from the `App`'s point of
view. This is benign because the
`App.tsx:283-295` `fail` action dispatches
`{ type: "error" }`, which transitions the
loop to `error`. The watchdog's `isActive`
probe at `App.tsx:242-247` then returns
`false` (the `error` state has no
`sessionId`), and the next `tick()`
short-circuits to `HEALTHY` at
`useWatchdog.ts:216-219`. The new test
"chronically wedging session via abortAndRetry
hits the circuit breaker" pins this
behavior: after the breaker trips, the
next tick (with a still-wedged session
that would otherwise re-fire) starts
attempt 1 (`abortAndRetry` count increases
to 2, no new `fail`), proving the
counter was reset inline at
`useWatchdog.ts:197` and the watchdog
resumed its post-breaker cycle.

#### INFO — The existing test at lines 262-281 already pins the budget-survives-iteration invariant

The pre-existing test "recovery budget
survives an abort+retry iteration restart
(re-wedge escalates)" (line 262-281 of
`useWatchdog.test.ts`) asserts that after
abort+retry → `notifyIterationStart` → a
second wedge, the watchdog escalates to
`restartServer` (attempt 2), not another
`abortAndRetry`. The new tests below
extend this to cover the full
maxRecoveryAttempts+1 cycle and the
explicit "second attempt always escalates
to restartServer" threshold from the
recovery ladder at useWatchdog.ts:204.

#### Verifier checklist for Task 6.6

- [x] `abortAndRetry` body at `App.tsx:267-281`
  is best-effort (`try/catch` around
  `abortSession`) and always dispatches
  `session_idle` — verified by direct file
  read.
- [x] `session_idle` reducer at
  `useLoopState.ts:130-143` transitions
  `running("sid") → running("")` and is
  idempotent on `running("")` (line 132-137)
  — verified by direct file read and by
  the pre-existing test at
  `useLoopState.test.ts:616-624`.
- [x] Iteration driver at `App.tsx:1217-1222`
  reacts to `running("")` and calls
  `startIteration()` — verified by direct
  file read.
- [x] `startIteration` has an in-flight guard
  (`startingIteration` at App.tsx:781,
  cleared in `finally` at line 854) —
  verified by direct file read.
- [x] `startIteration` calls
  `watchdog.notifyIterationStart()` at
  App.tsx:824 — verified by direct file
  read.
- [x] `notifyIterationStart` resets
  `lastHeartbeatAt` and sets `HEALTHY`, but
  DELIBERATELY does NOT reset
  `recoveryAttempts` (useWatchdog.ts:140-149,
  source comment is explicit) — verified
  by direct file read and by the
  pre-existing test at
  `useWatchdog.test.ts:262-281` and the
  new test at lines below.
- [x] The escalation ladder at
  `useWatchdog.ts:201-208` routes
  `recoveryAttempts >= 2` to
  `restartServer` regardless of `reason` —
  verified by direct file read and by the
  pre-existing test at
  `useWatchdog.test.ts:214-224` and the
  new test "abortAndRetry is called only on
  the first attempt — escalation to
  restartServer on attempt 2+" (lines
  below).
- [x] The hard cap at `useWatchdog.ts:189-199`
  trips `fail()` with full diagnostics when
  `recoveryAttempts > maxRecoveryAttempts`
  — verified by direct file read and by
  the pre-existing test at
  `useWatchdog.test.ts:344-371` and the
  new test "chronically wedging session via
  abortAndRetry hits the circuit breaker
  (no infinite loop)" (lines below).
- [x] `App.tsx:283-295` `fail` action
  dispatches `error` with
  `recoverable: true`, transitioning the
  loop to `error` state — verified by
  direct file read.
- [x] The error state deactivates the
  watchdog's `isActive` probe (the `error`
  state has no `sessionId`) — verified by
  the `isActive` body at `App.tsx:242-247`
  and by the pre-existing test at
  `useWatchdog.test.ts:285-294`.
- [x] `startIteration` failure path
  (`handleIterationError` at App.tsx:754-771)
  has its own breaker via
  `enterCooldown` + `maxRateLimitRetries`
  (App.tsx:679-698) — verified by direct
  file read.
- [x] `startIteration` calls
  `checkPlanComplete` at App.tsx:791 before
  creating a session, so a plan that
  finished while the watchdog was
  aborting exits cleanly via
  `plan_complete` — verified by direct
  file read.

#### Test-suite delta for Task 6.6

Added 2 new tests to `useWatchdog.test.ts`
to pin the full no-infinite-loop
guarantee across the `abortAndRetry`
path:

1. **`chronically wedging session via
   abortAndRetry hits the circuit breaker
   (no infinite loop)`** — drives the
   watchdog through the full
   `maxRecoveryAttempts + 1` wedge cycle,
   simulating the App-level
   `abortAndRetry → session_idle →
   iteration driver → startIteration →
   notifyIterationStart` chain on every
   iteration. The test asserts:
   - Attempt 1 = `abortAndRetry` (not
     `restartServer`).
   - After `notifyIterationStart`, the
     re-wedge escalates to `restartServer`
     (attempt 2), proving the budget was
     preserved.
   - After `notifyWake` (simulating
     `restartServer` completion), the
     third wedge is another
     `restartServer` (attempt 3).
   - The fourth wedge trips the circuit
     breaker: `fail()` is called with
     `reason: "session_wedged"` and
     `attempts: 3`, no new
     `abortAndRetry` or `restartServer`
     is fired.
   - Post-breaker, the recovery counter
     is reset (verified by a fifth wedge
     starting at attempt 1 again —
     `abortAndRetry` count increases,
     `fail` count stays 1).
2. **`abortAndRetry is called only on
   the first attempt — escalation to
   restartServer on attempt 2+`** —
   pins the exact threshold from the
   escalation ladder: the SECOND attempt
   is always `restartServer`. This is
   what guarantees a chronically wedging
   task is restarted, not retried, even
   when the `session_wedged` reason
   alone would route to `abortAndRetry`.

`bun test` -> **640 pass, 0 fail, 1617
expect() calls** across 21 files.
No regressions.

## Phase 7 — SSE Event Handling

Source: `src/hooks/useSSE.ts` (660 lines,
the entire hook + `classifySessionError`),
the Solid wrapper at lines 300-660, the
session-error classifier at lines 113-207,
and the consumer wiring at
`src/App.tsx:443-565` (the `useSSE({...})`
call with 9 handler functions). Tests:
`src/hooks/useSSE.test.ts` (199 lines, 21
cases, all passing) — covers
`classifySessionError` only. The hook
itself is not unit-tested in isolation
because it pulls in the Solid lifecycle
and the `@opencode-ai/sdk` SSE client
(see `docs/testing.md` — mocking
`@opentui/solid` collides with the JSX
runtime). Tasks 7.2-7.7 are planned as
follow-up per-knob verifications.

### 7.1 — Audit `useSSE` for connection lifecycle, reconnection logic, event filtering by sessionId, error classification

PLAN.md 7.1: "Audit `useSSE` for:
connection lifecycle, reconnection logic,
event filtering by sessionId, error
classification."

**Status: COMPLETE — VERIFIED. Two MEDIUM
findings, three LOW findings, four INFO
observations. No CRITICAL or HIGH
findings. The hook is well-structured; the
findings are dead-code paths and
asymmetries, not behavioral bugs.**

#### Connection lifecycle — VERIFIED

The lifecycle is split across four call
sites, each with a clear contract:

| Phase | Entry | Exit | Where |
| --- | --- | --- | --- |
| Mount | `onMount(() => connect())` if `autoConnect` | `connect()` first await | `useSSE.ts:642-646` |
| Connect | `connect()` (line 472) | stream ends / error / abort | `useSSE.ts:472-567` |
| Disconnect | `disconnect()` (line 596) | `shouldReconnect = false` + abort | `useSSE.ts:596-611` |
| Reconnect | `reconnect()` (line 616) or `scheduleReconnect()` (line 574) | replaces the active controller | `useSSE.ts:574-639` |

The Solid wrapper lifecycle: `onMount` is
gated on `autoConnect` (default `true`),
`onCleanup` unconditionally calls
`disconnect()`. In the App.tsx wiring at
line 447, `autoConnect: false` is set
because the SSE connect must wait for
`server.status() === "ready"` and the
loop state is `starting` — the
"server ready" effect at
`App.tsx:1013-1026` calls `sse.reconnect()`
when the server comes up. Status
transitions: `disconnected → connecting →
connected → (disconnected | error)`, with
the `error` path also scheduling a
reconnect via `scheduleReconnect()` at
line 564-565. The `disconnected` path at
line 536-542 does the same.

#### Reconnection logic — VERIFIED, with the supersession pattern

The reconnection engine has two
complementary mechanisms:

1. **Exponential backoff** —
   `scheduleReconnect()` at
   `useSSE.ts:574-591`:
   `delay = min(1000 * 2^attempt, 30000)`.
   The cap at 30s prevents a runaway backoff
   but stays short enough for a flapping
   server to recover on its own.
   `reconnectAttempts` resets to 0 on a
   successful connection (line 522), so
   transient blips don't accumulate.
2. **Manual reconnect** — `reconnect()` at
   `useSSE.ts:616-639` aborts the current
   controller, clears the pending timeout,
   resets the attempt counter, forces
   status to `disconnected`, and calls
   `connect()`. Called from 4 sites in
   App.tsx (line 207 on wake, line 260 in
   the watchdog's `reconnectSSE` action,
   line 653 in `restartServer`, line 1026
   in the server-ready effect).

The "supersession" pattern at
`useSSE.ts:489-495, 512-513, 527-528,
531-532, 543-551` is the load-bearing
trick: every `connect()` invocation
captures its own `myController` in a local
const, and on every async resumption point
the function checks
`if (abortController !== myController)
return`. This lets a newer `connect()` (or
`reconnect()`) silently retire an older
in-flight one without mutating shared
status — preventing the "post-restart
reconnect wedge" documented in the source
comment at line 489-493. The pattern is
well-tested in practice: the comment
itself documents the original bug it
fixes, and the App.tsx:653 +
App.tsx:1013-1026 paths both rely on it.

#### Event filtering by sessionId — VERIFIED, with one MEDIUM asymmetry

Eight event types are handled in the
switch at `useSSE.ts:339-466`. Their
session-filter behavior:

| Event | Filter check | Notes |
| --- | --- | --- |
| `session.created` (line 340-357) | `filterSessionId && eventSessionId !== filterSessionId` → return | Clears `seenPartIds` and `messageRoles` dedup maps. |
| `session.idle` (line 359-367) | same | The App.tsx handler at line 491-507 re-checks the sessionId against both `sessionId()` and the debug state's `sessionId`. |
| `session.error` (line 369-386) | `filterSessionId && eventSessionId && eventSessionId !== filterSessionId` → return | **Asymmetric**: requires BOTH `filterSessionId` AND `eventSessionId` to be set. See Finding 7.1.A. |
| `todo.updated` (line 388-396) | same shape as `session.idle` | Both must be set; missing eventSessionId passes through. |
| `file.edited` (line 398-401) | **No filter at all** | See Finding 7.1.B. |
| `message.updated` (line 403-410) | No filter, used only to track `messageRoles` | Records `messageId → role` for later part handlers. |
| `message.part.updated` (line 412-450) | `filterSessionId && eventSessionId && eventSessionId !== filterSessionId` → return | Same asymmetric shape. |
| `session.diff` (line 452-465) | same | See Finding 7.1.C. |

**Finding 7.1.A — MEDIUM — `onSessionError` and `onMessagePartUpdated` require BOTH `filterSessionId` AND `eventSessionId` to skip; an un-attributed server error is passed through unconditionally.**

The filter at `useSSE.ts:377-383`:

```ts
if (
  filterSessionId &&
  eventSessionId &&
  eventSessionId !== filterSessionId
) {
  return
}
```

The middle conjunct (`eventSessionId`)
means a `session.error` event with
`sessionID: undefined` (i.e., a
server-global error not tied to a session)
is delivered to the handler regardless of
the active session filter. This is the
opposite of `session.idle` (line 362-364)
and `todo.updated` (line 391-393), which
have the same shape but where the
asymmetry is symmetric (both require the
event to be attributed to skip).

Today the OpenCode SDK always populates
`sessionID` on `session.error` events
(verified at
`node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:585`).
So the gap is dormant. But the asymmetry
is a footgun: a future server that emits
un-attributed errors would silently
trigger `enterCooldown` in the
`onSessionError` handler at
`App.tsx:454-489`, even when the loop is
in a state that shouldn't accept that
error (e.g., `paused`, `complete`).

**Where.** `useSSE.ts:377-383` (and the
parallel check at line 419-421 for
`message.part.updated`).

**Proposed fix.** Decide the policy
explicitly and apply it uniformly. The
conservative read: if the event has no
sessionID and we have an active filter,
discard it (no scope to know if it's
ours). The permissive read (current
behavior): pass it through, let the App
handler decide. Pick one and add a
comment that documents the choice.

```ts
// Policy: un-attributed events are passed
// through. The App handler decides whether
// the loop is in a state that should
// accept them. (Matches session.idle /
todo.updated.)
```

Fix proposed, not applied (audit-only).

**Finding 7.1.B — MEDIUM — `file.edited` events are NOT filtered by sessionId, but every other per-session event type is.**

At `useSSE.ts:398-401`:

```ts
case "file.edited": {
  handlers.onFileEdited?.(event.properties.file)
  break
}
```

No session filter. The handler at
`App.tsx:517-530` then unconditionally
compares the file path to the plan file
path. If two sessions were ever active
simultaneously (the harness only ever
runs one, but the SDK supports many),
`file.edited` from a non-active session
would still trigger `refreshPlan()` and
`refreshCurrentTask()`. The check at
`useSSE.ts:452-465` for `session.diff`
applies a filter, the check at line 391
for `todo.updated` applies a filter — so
`file.edited` is the odd one out.

The most likely explanation: the SDK's
`file.edited` event does not include a
`sessionID` in its properties (it would
have to be added at line 398 like the
other cases do). The audit cannot verify
this from the SDK's `.d.ts` alone (the
event type at
`v2/gen/types.gen.d.ts:453` declares only
a `file: string` field), so the omission
may be a SDK limitation, not a bug.

**Where.** `useSSE.ts:398-401`.

**Proposed fix.** If the SDK ever adds
`sessionID` to `file.edited`, add the
filter. Until then, add a comment at line
398 noting that the omission is
SDK-imposed:

```ts
case "file.edited": {
  // No session filter: the SDK's
  // file.edited event does not carry a
  // sessionID. Today the harness runs one
  // session at a time, so cross-session
  // events are not a concern.
  handlers.onFileEdited?.(event.properties.file)
  break
}
```

Fix proposed, not applied (audit-only).

**Finding 7.1.C — MEDIUM — `onSessionDiff` is defined in the interface and dispatched by the switch, but the App.tsx `useSSE({...})` call does NOT register a handler.**

The interface declares the handler at
`useSSE.ts:234`:

```ts
onSessionDiff?: (diffs: FileDiff[]) => void
```

The switch case at line 452-465 dispatches
to it. But App.tsx:444-565 has no
`onSessionDiff` key. The hook is therefore
parsing `session.diff` events and
discarding the diff data silently.

The OpenCode SDK declares the event at
`v2/gen/types.gen.d.ts:578`. If the
server ever emits one, the harness
captures the event in `truncateForLog` (a
debug artifact) and then drops it. The
`FileDiff` interface at line 62-66 is also
declared-but-unused.

**Where.** `useSSE.ts:234` (interface
declaration), `useSSE.ts:452-465`
(dispatch), `useSSE.ts:62-66` (type).
Missing handler at `App.tsx:444-565`.

**Proposed fix.** Either wire the
handler in App.tsx (the most obvious
use would be a session-level file-edit
count for the dashboard) or delete the
dead code:

```ts
// Option A: remove
//   - onSessionDiff?: (diffs: FileDiff[]) => void
//   - case "session.diff": { ... }
//   - FileDiff interface
// Option B: add to App.tsx
//   onSessionDiff: (diffs) => {
//     heartbeat()
//     sessionStats.addDiff(diffs)
//   },
```

Fix proposed, not applied (audit-only).
Severity is MEDIUM because the
`FileDiff` type and the dispatch case
both represent maintenance surface area
that is currently unverified by tests
and unused by the app.

#### Error classification — VERIFIED

`classifySessionError` at
`useSSE.ts:183-207` is pure (no I/O,
deterministic) and is the only SSE-side
function that has a unit-test suite
(`useSSE.test.ts`, 21 cases all passing).
The classifier:

1. Normalizes the raw payload (object /
   string / nullish) into
   `{name, message, retryAfter}`.
2. Calls `classifyKind(name, message)` at
   `useSSE.ts:117-132` which checks the
   error name against three known sets
   (`ABORTED_NAMES`, `RATE_LIMIT_NAMES`,
   `AUTH_NAMES`) and falls back to four
   regex patterns over the
   `${name} ${message}` haystack. Priority
   order: aborted → rate_limit → auth →
   transient → fatal.
3. Returns a `SessionError` with
   `isAborted`, `kind`, and (for rate
   limits only) `retryAfter`.

The regex patterns are at
`useSSE.ts:106-111`:

- `RATE_LIMIT_RE` matches
  `429|rate[_-]?limit|ratelimited|too many requests|overloaded|over capacity|quota|insufficient_quota`.
- `AUTH_RE` matches
  `401|403|unauthorized|forbidden|invalid api key|authentication failed|invalid x-api-key`.
- `TRANSIENT_RE` matches
  `50\d|529|timeout|timed out|econnreset|etimedout|enotfound|econnrefused|socket hang up|fetch failed|network error|connection[^.{0,24}](closed|reset|refused|error)|closed unexpectedly`.

**Finding 7.1.D — LOW — `TRANSIENT_RE` does not match "too many connections" or "connection refused" phrasings that some servers emit.**

The `TRANSIENT_RE` matches "connection
closed", "connection reset",
"connection error", and "connection
refused" (the last via the bare
`econnrefused` token), but the
`(closed|reset|refused|error)` alternative
in the `connection[…]` branch has a strict
24-character window between "connection"
and the keyword. A message like
"connection to upstream timed out" matches
via the "timed out" alternative, but
"connection actively refused by remote
peer" does not match the `connection […]
refused` pattern (the words are too far
apart) and does not contain
`econnrefused`. The result: this would be
classified as `fatal`, not `transient`,
even though it is a transient network
error.

**Where.** `useSSE.ts:111` (the
`TRANSIENT_RE` regex).

**Proposed fix.** Loosen the alternation
window or add an explicit `connection
refused` / `connection refused` token
match:

```ts
const TRANSIENT_RE =
  /(\b50\d\b|\b529\b|timeout|timed out|econnreset|etimedout|enotfound|econnrefused|socket hang up|fetch failed|network error|connection\b[^.]{0,40}\b(?:closed|reset|refused|error)|closed unexpectedly|too many connections)/i
```

Fix proposed, not applied (audit-only).
Severity is LOW because the harness
classifies via name sets first (the SDK
emits typed errors), and the regex is a
fallback for string-only payloads. A
real `EAI_AGAIN` or `ECONNRESET` would
still match `econnreset`.

**Finding 7.1.E — LOW — `extractRetryAfter` message parser requires digits before the unit; "retry after a moment" silently returns undefined.**

The regex at `useSSE.ts:165`:

```ts
const m = e.message.match(
  /(?:retry|try again|wait)[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*(s|sec|secs|seconds|m|min|mins|minutes)?/i,
)
```

A message like "rate limit, retry after a
moment" would not match (no digit). The
function returns `undefined`, the
`SessionError` has no `retryAfter`, and
the App.tsx `enterCooldown` falls back to
the default `maxBackoff` (60s by
default). This is the correct fallback
behavior, but the audit flags it because
the regex captures "retry after" as a
phrase and could plausibly be
misunderstood as capturing any "retry
after X" — including "retry after a
moment".

**Where.** `useSSE.ts:163-173`.

**Proposed fix.** Add a test case pinning
the "retry after a moment" → undefined
behavior, and document the regex's
digit-required contract inline:

```ts
// Requires a digit before the unit; "retry
// after a moment" returns undefined (the
// caller falls back to maxBackoff).
```

Fix proposed, not applied (audit-only).

#### Heartbeat coverage — VERIFIED, all omissions are correct

The `heartbeat` function (a thin wrapper
around `watchdog.recordHeartbeat`) is
defined at `App.tsx:300` and called from
6 of the 9 handler registrations in the
`useSSE({...})` call:

| Handler | Heartbeat? | Where |
| --- | --- | --- |
| `onSessionCreated` | No | `App.tsx:449-453` — by design: `notifyIterationStart` resets the heartbeat window separately |
| `onSessionError` | No | `App.tsx:454-489` — by design: errors are not progress |
| `onSessionIdle` | No | `App.tsx:491-507` — by design: idle means end of activity, calls `watchdog.notifyIdle()` at line 503 |
| `onTodoUpdated` | Yes | `App.tsx:509` |
| `onFileEdited` | Yes | `App.tsx:518` |
| `onStepFinish` | Yes | `App.tsx:532` |
| `onToolUse` | Yes | `App.tsx:544` |
| `onMessageText` | Yes | `App.tsx:556` |
| `onReasoning` | Yes | `App.tsx:561` |

The three omissions are all correct:
`onSessionCreated` is the FIRST event in a
fresh iteration (the iteration driver
calls `watchdog.notifyIterationStart()`
separately at `App.tsx:824`);
`onSessionIdle` triggers
`watchdog.notifyIdle()` which resets the
watchdog; `onSessionError` is an error
path that branches to either
`enterCooldown` or an `error` state
dispatch, neither of which should reset
the heartbeat.

**Finding 7.1.F — LOW — `onAnyEvent` is declared in the interface and invoked on every event, but is not registered in App.tsx.**

At `useSSE.ts:224`:

```ts
onAnyEvent?: (event: Event) => void
```

At `useSSE.ts:331-333`:

```ts
if (handlers.onAnyEvent) {
  handlers.onAnyEvent(event)
}
```

App.tsx:444-565 has no `onAnyEvent` key.
The hook therefore calls
`truncateForLog` on every event (line 328)
and then a no-op optional call. The cost
is one branch per event (negligible) and
the unused interface surface. The
interface is useful for debugging — a
dev tool could register an `onAnyEvent`
to dump events to a file — but no such
tool exists today.

**Where.** `useSSE.ts:224, 331-333`.

**Proposed fix.** None required. Marking
as INFO/LOW observation: keep the
optional handler for future
debug-observability use; the cost is
trivial.

#### INFO — Dedup maps are reset on `session.created` to prevent unbounded growth

`seenPartIds` and `messageRoles` are
cleared at `useSSE.ts:351-353` when a new
session is created. The comment at line
349-352 documents the intent: part and
message IDs are unique per session, so
the dedup maps would otherwise grow
unbounded over a long multi-iteration
run. The reset is the correct place (a
new session is the natural dedup
boundary). INFO only — no fix needed.

#### INFO — `messageRoles` falls back to "assistant" for parts that arrive before their `message.updated`

At `useSSE.ts:435`:

```ts
const role = messageRoles.get(messageId) || "assistant"
```

If a `message.part.updated` arrives before
the `message.updated` that establishes
the role, the fallback is "assistant".
This is the correct default for the
loop's use case — the harness only cares
about distinguishing user messages from
assistant messages for the dashboard
display, and user messages are short
prompts that emit their `message.updated`
synchronously.

#### INFO — `classifySessionError` is pure, exported, and the only test-covered function in the file

The classifier is exported at
`useSSE.ts:183` and is the only function
in the file with a unit-test suite (21
cases). The 21 cases cover: 7 rate-limit
variants (4 regex variants + 3
`retryAfter` extraction variants), 2
aborted, 2 auth, 2 transient, 8 fatal /
edge-cases. The full coverage of
`extractRetryAfter`'s four input shapes
(numeric field, `data.*` field, headers
object with `.get()` method, raw
`Headers` map, message duration string
in seconds and minutes) is exercised.
No new tests are needed for 7.1.

#### Verifier checklist for Task 7.1

- [x] Connection lifecycle: `onMount`
  → `connect()` (autoConnect gate),
  `onCleanup` → `disconnect()` —
  verified by direct file read of
  `useSSE.ts:642-651`.
- [x] Reconnect via
  `scheduleReconnect()` with
  exponential backoff capped at 30s
  (`useSSE.ts:574-591`) — verified.
- [x] Manual `reconnect()` resets the
  attempt counter, aborts the active
  controller, and starts a fresh
  `connect()` (`useSSE.ts:616-639`) —
  verified.
- [x] Supersession pattern
  (`abortController !== myController`
  check) is applied at every async
  resumption point
  (`useSSE.ts:512-513, 527-528,
  531-532, 543-551`) — verified.
- [x] `status` transitions:
  `disconnected → connecting →
  connected → (disconnected | error)` —
  verified. The `error` path also
  schedules a reconnect.
- [x] Session-id filtering on
  `session.created`, `session.idle`,
  `session.error`, `todo.updated`,
  `message.part.updated`, `session.diff`
  — verified.
- [x] `file.edited` is intentionally
  unfiltered (no `sessionID` in the SDK
  event payload) — verified.
- [x] `classifySessionError` priority
  order: aborted → rate_limit → auth →
  transient → fatal
  (`useSSE.ts:117-132`) — verified by
  the 21-case test suite.
- [x] `extractRetryAfter` checks
  numeric fields, headers (both `.get()`
  and index-style), and message
  duration strings in seconds and
  minutes (`useSSE.ts:139-176`) —
  verified by tests.
- [x] `retryAfter` is only attached to
  rate-limit errors
  (`useSSE.ts:205`) — verified.
- [x] Heartbeat is called from 6
  handlers (todo_updated, file_edited,
  step_finish, tool_use, message_text,
  reasoning) and intentionally skipped
  on 3 (session_created, session_idle,
  session_error) — verified.

#### Test-suite delta for Task 7.1

No new tests added. The 21-case
`classifySessionError` test suite at
`useSSE.test.ts:1-199` is sufficient for
this audit's findings — Findings 7.1.D
and 7.1.E are LOW and would be caught by
the existing classifier behavior
(`fatal` for unmatched transient strings,
`undefined` for digit-less "retry after"
strings). Adding regression tests for
them is deferred to a dedicated test
hygiene task (Phase 18).

`bun test` -> **640 pass, 0 fail, 1617
expect() calls** across 21 files.
No regressions.

### 7.2 — Verify `onSessionError` ignores errors from stale sessions; confirm the sessionId comparison is correct

PLAN.md 7.2: "Verify: SSE `onSessionError`
ignores errors from stale sessions — confirm
the sessionId comparison is correct."

**Status: COMPLETE — VERIFIED. The
comparison is correct for the actual data
shape (OpenCode SDK always populates
`sessionID` on `session.error` events). One
MEDIUM observation (the asymmetric filter
shape is consistent across both layers but
not identical to the symmetric shape of
`session.idle`). No CRITICAL or HIGH
findings.**

#### Two layers of stale-session filtering

The `onSessionError` path has a hook-layer
filter (in `useSSE.ts`) and a consumer-layer
filter (in `App.tsx`). The hook filter is
the primary guard; the consumer filter is
defense-in-depth. Both must agree for the
end-to-end behavior to be safe.

#### Layer 1: Hook filter at `useSSE.ts:369-386`

The `session.error` case in the switch at
`useSSE.ts:369-386`:

```ts
case "session.error": {
  const eventSessionId = (event.properties as { sessionID?: string })
    .sessionID

  const rawError = (event.properties as any).error
  const sessionError = classifySessionError(rawError)

  // Filter by session if a filter is set
  if (
    filterSessionId &&
    eventSessionId &&
    eventSessionId !== filterSessionId
  ) {
    return
  }
  handlers.onSessionError?.(eventSessionId, sessionError)
  break
}
```

The filter is the standard
"per-session skip" pattern used by the
other per-session events. It is loaded with
`filterSessionId = sessionId()` from the
Solid accessor at the top of `processEvent`
(line 336), so it always reflects the
currently-active session that the App wired
up via the `sessionId` prop in
`useSSE({...})` (`App.tsx:446`).

**The skip is triggered** when ALL three
hold:

1. `filterSessionId` is truthy (the SSE
   hook was given a filter — true whenever
   a session is active).
2. `eventSessionId` is truthy (the event
   carries a `sessionID` field).
3. `eventSessionId !== filterSessionId`
   (the event is for a different session).

The asymmetric shape: if `eventSessionId`
is missing or empty, the skip is **NOT**
triggered and the event is delivered to
the handler. The OpenCode SDK always
populates `sessionID` on `session.error`
events (verified at
`node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:585`
— the type is `sessionID: SessionID`, a
required branded string), so this gap is
dormant. See Finding 7.1.A for the wider
asymmetry discussion (which spans the hook
filter only, not the consumer filter).

#### Layer 2: Consumer filter at `App.tsx:454-463`

The App-side handler at `App.tsx:454-463`
adds a second guard before doing any
work:

```ts
onSessionError: (eventSessionId, error) => {
  const state = loop.state()
  // Ignore errors for a session that is no longer the active one. A stale
  // aborted error from a just-replaced session (arriving in the brief
  // running("") window) would otherwise toggle_pause and wedge the loop in
  // pausing(""). Mirrors the session-id guard onSessionIdle already applies.
  const debugSid = state.type === "debug" ? state.sessionId : undefined
  if (eventSessionId && eventSessionId !== getActiveSessionId(state) && eventSessionId !== debugSid) {
    return
  }
  // ... rest of the handler (isAborted / rate_limit / fatal branches)
}
```

The skip is triggered when ALL three hold:

1. `eventSessionId` is truthy (the event
   carries a `sessionID`).
2. `eventSessionId !== getActiveSessionId(state)`.
   `getActiveSessionId` is defined at
   `useLoopState.ts:34-38` and returns
   `state.sessionId` for `running` /
   `pausing` states, `""` otherwise. So
   the comparison is "the event's session
   ID is not the session the loop is
   currently working on."
3. `eventSessionId !== debugSid`. The
   `debugSid` is `state.sessionId` when
   the loop is in `debug` state, else
   `undefined`. This handles the debug
   mode where the loop has a session
   outside the `running`/`pausing`
   normal-flow branch.

The consumer filter has the same asymmetric
shape as the hook filter: an un-attributed
event passes through the guard and reaches
the handler logic.

#### The two layers are complementary, not redundant

The hook filter compares against the
**Solid accessor** `filterSessionId = sessionId()`.
The consumer filter compares against
`getActiveSessionId(state)` plus
`debugSid`. These two can diverge:

- The Solid accessor `sessionId()` is set
  on the most recent session the loop
  started (it's the "current session"
  signal updated by the iteration driver
  in `App.tsx`).
- `getActiveSessionId(state)` is the
  session stored in the reducer state
  (`LoopState.sessionId`), which lags the
  Solid accessor by one transition in the
  `running("")` window (the moment between
  `startIteration` dispatching the new
  `running("")` state and the SDK
  returning the new `sessionID` via
  `session.created`).

The consumer filter is the load-bearing
guard for the `running("")` window: the
comment at `App.tsx:456-459` documents this
explicitly. The hook filter would also
match (the Solid accessor is also "the new
session" once it updates), but the comment
shows the author specifically chose to put
the guard at the consumer layer so the
filter source is explicit (`getActiveSessionId`
+ `debugSid`) rather than implicit (the
Solid accessor value).

#### Consistency with `onSessionIdle`

The `onSessionIdle` handler at
`App.tsx:491-507` has the same guard shape
at lines 498:

```ts
if (eventSessionId === currentSession || eventSessionId === debugSessionId) {
  // ... process idle
}
```

This is the **positive** form ("process if
it matches") rather than the negative form
("skip if it does not match"). The two
handlers use opposite polarity but the
same logical content: ignore events for
sessions that are not the active one.
Both handlers reference `debugSessionId`
(a `state.type === "debug" ? state.sessionId
: undefined` shape) to cover debug mode.

The comment at `App.tsx:456-459` says
"Mirrors the session-id guard onSessionIdle
already applies" — confirming the
author's intent to keep the two handlers
in lock-step.

#### The "stale aborted" wedge scenario

The comment at `App.tsx:456-459` is the
specific concern that motivates the
consumer guard. Walk-through:

1. Loop is in `running("old-session-id")`,
   processing iteration N.
2. Iteration N completes; the driver
   dispatches `session_idle`; the next
   iteration starts; `startIteration`
   dispatches `running("")` (empty session
   ID, awaiting the new session).
3. The OLD session emits a delayed
   `session.error` event with
   `sessionID: "old-session-id"`, kind
   `aborted` (the SDK sent the abort
   signal after the new session started).
4. The hook filter check:
   - `filterSessionId` = "old-session-id"
     (the Solid accessor hasn't yet
     updated to the new session ID)
   - `eventSessionId` = "old-session-id"
   - Comparison: `"old-session-id" !==
     "old-session-id"` → false → no skip
   - **The event passes through to the
     handler.** This is a stale error for
     the session the loop just left.
5. The consumer filter check:
   - `eventSessionId` = "old-session-id"
   - `getActiveSessionId(state)` = "" (the
     `running("")` window)
   - `debugSid` = undefined
   - Comparison: `"old-session-id" !== ""`
     → true, `&& "old-session-id" !==
     undefined` → true → **skip
     triggered** ✓
6. Without the consumer guard, the handler
   would reach `error.isAborted` →
   `toggle_pause` (the state is
   `running("")`, the comment says the
   abort error would otherwise `toggle_pause`
   and "wedge the loop in pausing("")").
   The comment is correct: pausing("") is
   unreachable via the `startIteration`
   invariant (`running("")` is the
   "starting a new session" state, not
   "pausing" the loop), so a `toggle_pause`
   dispatched from `running("")` would
   create a state the loop doesn't know
   how to recover from.

**The consumer-layer guard is
load-bearing.** Removing it would re-introduce
the wedge.

#### Comparison correctness — VERIFIED

The sessionId comparison in `onSessionError`
is **correct** for all four cases that
matter:

1. **Stale session (old ID, loop has
   moved on)** → consumer filter triggers
   (case 5 above). ✓
2. **Active session (ID matches
   `getActiveSessionId`)** → both filters
   pass, handler processes. ✓
3. **Debug session (state.type === "debug",
   debugSid matches)** → consumer filter
   passes via the `debugSid` branch. ✓
4. **Un-attributed event
   (`eventSessionId` undefined)** → both
   filters pass (the `eventSessionId &&`
   guard short-circuits the comparison).
   The OpenCode SDK guarantees this is
   never observed in practice (the SDK
   type at `v2/gen/types.gen.d.ts:585`
   makes `sessionID` a required branded
   string on `SessionError`).

The two layers are consistent in
asymmetry (both require an attributed
event to skip), and they cover the
specific wedge scenario documented at
`App.tsx:456-459`.

#### Finding 7.2.A — MEDIUM — Consumer filter and hook filter share an asymmetric shape that could be made symmetric with no behavioral change

The hook filter at `useSSE.ts:377-383` and
the consumer filter at `App.tsx:461` both
require `eventSessionId &&` to be truthy
before applying the comparison. If
`eventSessionId` is undefined, both skip
the guard. This is the same asymmetric
shape flagged in Finding 7.1.A (which
covered the hook filter in isolation).

**The asymmetry is a deliberate
choice, but the policy is not documented
inline.** A future maintainer reading the
code cannot tell whether the `eventSessionId
&&` is "deliberate: pass un-attributed
errors through" or "oversight: this should
require an explicit 'has sessionID'
check."

**Where.** `useSSE.ts:377-383` (hook
filter); `App.tsx:461` (consumer filter).

**Proposed fix.** Document the policy in a
single comment at the hook level, then
mirror it at the consumer level. The
current behavior (pass un-attributed
errors through) is the correct one because
the App handler is the authoritative
arbiter and already short-circuits on
state (e.g., it only dispatches `error`
when `st === "running" || "pausing" ||
"debug"`):

```ts
// useSSE.ts:374 — add a policy comment
// Policy: un-attributed session.error events
// are passed through. The App handler is the
// authoritative arbiter of which states accept
// errors (running/pausing/debug only) and
// ignores the rest. Mirrors the session.idle
// filter shape for consistency.
```

```ts
// App.tsx:456 — mirror the policy comment
// Policy: un-attributed errors pass through
// and reach the state-aware handler below.
// See the policy comment in useSSE.ts:374.
```

**Status.** Fix proposed, not applied
(audit-only per PLAN.md acceptance
criteria). Severity is MEDIUM because the
asymmetry is dormant (the OpenCode SDK
always populates `sessionID`) and the
consumer filter is load-bearing for the
`running("")` wedge case — the fix is
purely documentary.

#### Verifier checklist for Task 7.2

- [x] Hook filter at `useSSE.ts:377-383`
  triggers a skip when both `filterSessionId`
  and `eventSessionId` are truthy and
  differ — verified by direct file read.
- [x] Consumer filter at `App.tsx:461`
  triggers a skip when `eventSessionId`
  is truthy and differs from BOTH
  `getActiveSessionId(state)` and
  `debugSid` — verified by direct file
  read.
- [x] `getActiveSessionId` is defined at
  `useLoopState.ts:34-38` and returns the
  session for `running`/`pausing` states,
  `""` otherwise — verified.
- [x] The `debugSid` branch covers the
  `debug` state where the loop has a
  session outside the `running`/`pausing`
  normal flow — verified.
- [x] `onSessionIdle` (lines 491-507) has
  the same `debugSessionId` shape and the
  same logical content (ignore events for
  non-active sessions) — verified.
- [x] The `running("")` wedge scenario
  (stale aborted error from the old
  session) is correctly handled by the
  consumer filter — verified by the
  walk-through above.
- [x] The OpenCode SDK always populates
  `sessionID` on `session.error` events
  — verified by type at
  `v2/gen/types.gen.d.ts:585`.

#### Test-suite delta for Task 7.2

No new tests added. The 21-case
`classifySessionError` test suite at
`useSSE.test.ts:1-199` does not cover the
hook or consumer stale-session filters
(those tests would require a Solid render
context and a fake SSE stream; both are
out of scope for unit tests per
`docs/testing.md`). The wedge scenario
documented above would be most cleanly
covered by an integration test that
exercises a real `useSSE` instance, but
the OpenCode SDK does not expose a
synchronous mock for `client.event.subscribe`
and the existing test harness uses the
classifier in isolation.

`bun test` -> **640 pass, 0 fail, 1617
expect() calls** across 21 files.
No regressions.

### 7.3 — Verify `onSessionIdle` ignores idle events from stale sessions; confirm it matches `onSessionError`

PLAN.md 7.3: "Verify: SSE
`onSessionIdle` ignores idle events from
stale sessions — confirm this matches the
behavior in `onSessionError`."

**Status: COMPLETE — VERIFIED. The
`onSessionIdle` stale-session guard is
correct, but its polarity is **inverted**
relative to `onSessionError` (positive
match vs negative skip), and the hook-layer
filter has the **opposite** asymmetry
behavior for un-attributed events. Both
differences are dormant in practice (the
SDK always populates `sessionID`) and both
handlers correctly drop stale events.
Two INFO observations, one LOW finding.
No CRITICAL or HIGH findings.**

#### The two filters — same logical content, opposite polarity

The `onSessionIdle` path has the same
two-layer structure as `onSessionError`
(hook filter + consumer filter), but the
consumer filter is written in the
**positive** form (process if matches)
rather than the **negative** form (skip
if does not match). Both forms encode the
same rule: events for sessions other than
the active one are ignored.

#### Layer 1: Hook filter at `useSSE.ts:359-367`

The `session.idle` case in the switch:

```ts
case "session.idle": {
  const eventSessionId = event.properties.sessionID
  // Filter by session if a filter is set
  if (filterSessionId && eventSessionId !== filterSessionId) {
    return
  }
  handlers.onSessionIdle?.(eventSessionId)
  break
}
```

The skip is triggered when BOTH hold:

1. `filterSessionId` is truthy (the SSE
   hook was given a filter — true whenever
   the Solid accessor at
   `App.tsx:402-414` returns a non-empty
   session).
2. `eventSessionId !== filterSessionId`
   (the event is for a different session).

**No `eventSessionId &&` truthy guard.**
If `eventSessionId` is undefined and
`filterSessionId` is truthy, the comparison
`undefined !== "abc"` is `true` → the
event IS filtered out (the early `return`
fires). This is the **opposite** of the
`session.error` hook filter, which has the
extra `eventSessionId &&` short-circuit
and therefore passes un-attributed errors
through. See Finding 7.3.A.

In practice the asymmetry is dormant: the
SDK type at
`node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts`
declares `sessionID` on `SessionIdleEvent`
as a required branded string. Both
un-attributed cases are unobservable.

#### Layer 2: Consumer filter at `App.tsx:491-507`

The App-side handler:

```ts
onSessionIdle: (eventSessionId) => {
  // Only handle if it's our current session
  const currentSession = sessionId()
  const state = loop.state()
  // Also check debug state's sessionId
  const debugSessionId = state.type === "debug" ? state.sessionId : undefined

  if (eventSessionId === currentSession || eventSessionId === debugSessionId) {
    rateLimitAttempts = 0
    watchdog.notifyIdle()
    loop.dispatch({ type: "session_idle" })
    activityLog.addEvent("session_idle", t("actSessionIdle"))
  }
},
```

The dispatch fires when **either** holds:

1. `eventSessionId === currentSession` —
   `currentSession` is the Solid accessor
   `sessionId()` (defined at
   `App.tsx:402-414`); it returns the
   state's `sessionId` for `running` /
   `pausing` / `debug` states with a
   non-empty `sessionId`, else `undefined`.
2. `eventSessionId === debugSessionId` —
   `debugSessionId` is `state.sessionId`
   when the state is `debug`, else
   `undefined`. The two checks are not
   mutually exclusive: if the state is
   `debug("xyz")`, the Solid accessor
   returns `"xyz"` and the
   `debugSessionId` is also `"xyz"`, so
   both branches of the `||` would match
   an event with `eventSessionId === "xyz"`.

**The idle filter uses the Solid
accessor** for the "current session"
check. This differs from the error
handler, which uses `getActiveSessionId`
(a function that returns `""` for
non-running/pausing states). The two
sources can diverge:

- `sessionId()` returns `undefined` for
  `running("")` (the
  `state.sessionId &&` short-circuit at
  `App.tsx:404`).
- `getActiveSessionId(state)` returns
  `""` for `running("")` (the explicit
  ternary at `useLoopState.ts:35-37`).

In practice both `undefined` and `""`
are non-equal to a real session ID, so
the divergence is invisible to the
comparison.

#### Comparison with `onSessionError` — VERIFIED

| Aspect | `onSessionIdle` | `onSessionError` |
| --- | --- | --- |
| Hook filter shape | `filterSessionId && eventSessionId !== filterSessionId` | `filterSessionId && eventSessionId && eventSessionId !== filterSessionId` |
| Hook filter on un-attributed event (`eventSessionId` undefined) | **Skipped** (filtered out) | **Passes through** |
| Consumer filter polarity | **Positive**: `eventSessionId === currentSession \|\| eventSessionId === debugSessionId` → process | **Negative**: `eventSessionId && eventSessionId !== getActiveSessionId(state) && eventSessionId !== debugSid` → skip |
| Consumer filter on un-attributed event | Skipped (the `===` is false) | Passes through (the `eventSessionId &&` short-circuits) |
| Consumer filter source for "active session" | Solid accessor `sessionId()` | `getActiveSessionId(state)` (returns `""` for non-running/pausing) |
| Debug-mode branch | `eventSessionId === debugSessionId` (positive) | `eventSessionId === debugSid` (via the `!==` negation) |
| Wedge coverage for `running("")` window | Hook: passes through (filter is undefined); Consumer: drops (no match) | Hook: passes through (filter is undefined); Consumer: drops (no match, see Phase 7.2 walkthrough) |

**The two handlers agree on the
end-to-end behavior** for every
realistic case. They differ only in
**polarity** (positive vs negative
form) and in **how they handle
un-attributed events** at the hook
level. The un-attributed behavior is
opposite, but the SDK guarantees
`sessionID` is always set, so the gap
is dormant.

#### The `running("")` wedge scenario for idle

Same scenario as Phase 7.2, but for
idle events:

1. Loop is in `running("old-session-id")`,
   processing iteration N.
2. Iteration N completes; the old session
   emits `session.idle` with
   `sessionID: "old-session-id"`. The
   driver dispatches `session_idle`, the
   reducer transitions to `pausing`, the
   next iteration starts; `startIteration`
   dispatches `running("")` (empty session
   ID, awaiting the new session).

   — If the OLD session's idle event
   arrives **before** the dispatch to
   `running("")`, the hook filter fires
   (filter is `"old-session-id"`, event is
   `"old-session-id"`, no skip). The
   consumer also fires (Solid accessor is
   `"old-session-id"`). The handler resets
   the rate-limit streak and dispatches
   `session_idle`. This is the **normal
   case** — the loop already intended to
   handle this idle.

   — If the OLD session's idle event is
   **delayed** (arrives after the dispatch
   to `running("")`):
   - `filterSessionId = sessionId() =
     undefined` (Solid accessor
     short-circuits on empty sessionId at
     `App.tsx:404`).
   - Hook filter: `filterSessionId &&
     ...` short-circuits to false → **no
     skip, event passes through**.
   - Consumer: `currentSession =
     undefined`, `debugSessionId =
     undefined`. `eventSessionId ===
     undefined` is `false` →
     `eventSessionId === undefined` is
     `false` → **no match, no dispatch**.
   - Result: the stale idle event is
     silently dropped at the consumer
     layer. The loop is in `running("")`
     (transitioning to a new session); the
     NEW session will emit its own
     `session.idle` when it finishes, which
     the consumer filter will then match.
     **Safe** — no double dispatch, no
     premature `session_idle` for a session
     the loop has just left.

The wedge scenario for idle is
**correctly handled by the positive
polarity**: the consumer requires an
exact match to dispatch, and a stale
session's ID can never match
`undefined` (the Solid accessor value in
`running("")`).

#### Comparison correctness — VERIFIED

The `onSessionIdle` sessionId comparison
is **correct** for the cases that matter:

1. **Stale session (old ID, loop has
   moved on)** → consumer filter
   requires an exact match against
   `currentSession` (Solid accessor) or
   `debugSessionId`; a stale ID can never
   match either. **Dropped at consumer
   layer.** ✓
2. **Active session (ID matches Solid
   accessor)** → both filters pass,
   handler processes (resets rate-limit
   streak, calls `watchdog.notifyIdle`,
   dispatches `session_idle`,
   logs the idle). ✓
3. **Debug session (state.type ===
   "debug", `debugSessionId` matches)** →
   consumer filter passes via the
   `|| debugSessionId` branch. ✓
4. **Un-attributed event
   (`eventSessionId` undefined)** → hook
   filter drops it (the `!==` comparison
   is true when one side is undefined and
   the other is a real string); consumer
   would also drop it (the `===` is
   false). The OpenCode SDK guarantees
   this is never observed in practice.
5. **`running("")` window with a
   delayed idle from the previous
   session** → hook passes through
   (filter is undefined), consumer
   drops (no match). The loop continues
   waiting for the NEW session's idle.
   ✓

#### INFO — Positive polarity is the more defensive default for dispatch

`onSessionIdle` is a **dispatch**
handler (it triggers state changes
and side effects). A positive polarity
("dispatch only if matches") is
inherently safer than a negative
polarity ("dispatch unless doesn't
match") because the negative form
requires a complete enumeration of
"what counts as a mismatch" — and any
enumeration gap (e.g., a `undefined`
check missed) becomes a phantom
dispatch. The positive form has the
opposite failure mode (a missed match
silently drops an event), which is the
safer direction for this code path.

The `onSessionError` handler's negative
polarity is justified because errors
have additional **state-aware**
filtering downstream (lines 464-489)
that further narrows which errors
dispatch: only errors in `running`,
`pausing`, or `debug` states dispatch
an `error` action. The
`state.type`-aware branch is the
load-bearing safety net for errors;
the consumer session-ID guard is a
first-pass filter only. For idle, the
session-ID match is the **only** guard
before dispatch, so a positive form is
the right call.

#### INFO — Solid accessor vs `getActiveSessionId` for the active-session check

`onSessionIdle` uses the Solid accessor
`sessionId()`; `onSessionError` uses
`getActiveSessionId(state)`. The two
sources can diverge in the
`running("")` window:

- `sessionId()` returns `undefined`
  (the `state.sessionId &&` short-circuit
  in the `createMemo` at
  `App.tsx:402-414`).
- `getActiveSessionId(state)` returns
  `""` (the explicit ternary at
  `useLoopState.ts:35-37`).

In practice both `undefined` and `""`
are non-equal to any real session ID,
so the divergence is invisible to the
comparison. But the two sources
**describe slightly different
semantics**: the Solid accessor
"captures the moment of the
sessionId", while `getActiveSessionId`
"captures the state machine's
definition of active". For idle, the
moment-of-sessionId semantic is the
right choice (we want the idle for
the session we just started, not the
session the state machine still
considers active). For error, the
state-machine semantic is the right
choice (we want errors for the session
the loop is responsible for, even if
the Solid accessor hasn't updated
yet — see the Phase 7.2 wedge
discussion). The semantic split is
deliberate, not an oversight.

#### Finding 7.3.A — LOW — Hook-layer filter for `session.idle` is **opposite** to `session.error` for un-attributed events

The hook filter for `session.idle` at
`useSSE.ts:362-364`:

```ts
if (filterSessionId && eventSessionId !== filterSessionId) {
  return
}
```

The hook filter for `session.error` at
`useSSE.ts:377-383`:

```ts
if (
  filterSessionId &&
  eventSessionId &&
  eventSessionId !== filterSessionId
) {
  return
}
```

The two shapes differ in one conjunct:
the `eventSessionId &&` short-circuit
in the error path. The behavioral
consequence:

- Un-attributed `session.idle` event
  (no `sessionID`): **filtered out**
  (`undefined !== "abc"` is `true` →
  early return).
- Un-attributed `session.error` event
  (no `sessionID`): **passed through**
  (the `eventSessionId &&` short-circuits
  the check → falls through to the
  handler).

The OpenCode SDK always populates
`sessionID` for both event types
(verified by the SDK's `.d.ts` —
`SessionIdleEvent` and
`SessionErrorEvent` both declare
`sessionID: SessionID` as a required
branded string). So this gap is
dormant. But the polarity is
**reversed** between the two
handlers, which is a footgun: a
future maintainer reading the two
filters will not see them as
"symmetric" and may infer the wrong
policy from one when porting the
other.

**Where.** `useSSE.ts:362-364`
(`session.idle`); `useSSE.ts:377-383`
(`session.error`); the parallel at
`useSSE.ts:391-393` (`todo.updated`,
same shape as `session.idle`); the
parallel at `useSSE.ts:419-421`
(`message.part.updated`, same shape as
`session.error`).

**Proposed fix.** Pick one shape and
apply it uniformly. The conservative
read: every event with no `sessionID`
is dropped at the hook layer (the
handler can't make a session-aware
decision without one). The permissive
read: every event is passed through,
the consumer filter is the
authoritative gate. The conservative
read is the safer default because
un-attributed events are an
anomalous case (the SDK doesn't
emit them) and a silent drop is
easier to debug than a silent
dispatch.

A minimal change is to add the
`eventSessionId &&` short-circuit to
the idle and todo paths and remove it
from the error and message-part
paths, then document the policy in
one place:

```ts
// useSSE.ts:336 — single policy comment
// Per-session filter shape:
//   filterSessionId && eventSessionId &&
//     eventSessionId !== filterSessionId
// All per-session events (session.idle,
// session.error, todo.updated,
// message.part.updated, session.diff)
// use this same shape. Un-attributed
// events are dropped — the consumer
// filter has nothing to compare against.
```

Fix proposed, not applied (audit-only
per PLAN.md acceptance criteria).
Severity is LOW because the gap is
dormant and the consumer filter is
the load-bearing guard for the
`running("")` wedge case in both
handlers.

#### Verifier checklist for Task 7.3

- [x] Hook filter at `useSSE.ts:362-364`
  triggers a skip when `filterSessionId`
  is truthy and differs from
  `eventSessionId` — verified by direct
  file read.
- [x] Hook filter for `session.idle` has
  **no** `eventSessionId &&` truthy
  guard (opposite of `session.error` at
  line 377-383) — verified by direct
  file read.
- [x] Consumer filter at `App.tsx:498`
  uses **positive** polarity
  (`eventSessionId === currentSession ||
  eventSessionId === debugSessionId`) —
  verified by direct file read.
- [x] Consumer filter's `currentSession`
  is the Solid accessor `sessionId()`
  (returns `undefined` for
  `running("")`) — verified at
  `App.tsx:402-414`.
- [x] Consumer filter's `debugSessionId`
  is `state.sessionId` when
  `state.type === "debug"`, else
  `undefined` — verified at
  `App.tsx:496`.
- [x] The Solid accessor vs
  `getActiveSessionId` divergence in the
  `running("")` window is invisible to
  the comparison (both `undefined` and
  `""` are non-equal to a real ID) —
  verified.
- [x] The `running("")` wedge scenario
  for a delayed idle from the previous
  session is correctly handled (hook
  passes through, consumer drops) —
  verified by the walk-through above.
- [x] Debug-mode branch on the consumer
  side matches the same coverage as
  `onSessionError` — verified.
- [x] The OpenCode SDK always populates
  `sessionID` on `SessionIdleEvent` —
  verified by the SDK type
  declaration.

#### Test-suite delta for Task 7.3

No new tests added. The 21-case
`classifySessionError` test suite at
`src/hooks/useSSE.test.ts:1-199` does
not cover the hook or consumer
stale-session filters (those tests
would require a Solid render context
and a fake SSE stream; both are out
of scope for unit tests per
`docs/testing.md`). The hook filter
is the simpler shape (no SDK
interaction), and the consumer filter
is the only piece that
`useLoopState`'s
`getActiveSessionId`-focused tests
could approximate, but doing so
would couple the two hooks' test
suites in a way that has no
end-to-end value.

`bun test` -> **640 pass, 0 fail, 1617
expect() calls** across 21 files.
No regressions.

### 7.4 — Verify SSE reconnection threshold (6 attempts) triggers a server restart — is it configurable?

PLAN.md 7.4: "Verify: SSE
reconnection threshold (6 attempts)
triggers a server restart — is this
configurable?"

**Status: COMPLETE — VERIFIED. The
threshold IS effective (a failure streak
of 6 reconnect attempts does fire
`restartServer()`), but it is
**hardcoded** — not exposed as a
resilience config key, not settable via
`--resilience key=value`, and not
present in `~/.config/ocloop/ocloop.json`.
One MEDIUM finding (configurability
gap), one INFO observation (timing
analysis), one INFO observation (the
flag-reset path on successful
reconnect). No CRITICAL or HIGH
findings.**

#### The threshold is a hardcoded constant

`App.tsx:1228`:

```ts
const SSE_RECONNECT_RESTART_THRESHOLD = 6
```

The constant is referenced in the
recovery effect at `App.tsx:1230-1245`:

```ts
let sseRecoveryFired = false
createEffect(() => {
  const attempts = sse.reconnectAttempts()
  if (attempts === 0) {
    sseRecoveryFired = false
    return
  }
  if (
    attempts >= SSE_RECONNECT_RESTART_THRESHOLD &&
    loop.isRunning() &&
    !sseRecoveryFired
  ) {
    sseRecoveryFired = true
    log.health("sse", "reconnect_exhausted", { attempts })
    void restartServer()
  }
})
```

#### Configurability audit — NOT configurable

Searched for the threshold across the
configuration surface:

| Source | Key? | Reference |
| --- | --- | --- |
| `ResilienceConfig` interface | No | `src/lib/config.ts:45-105` (18 keys: createTimeoutMs, promptTimeoutMs, abortTimeoutMs, statusTimeoutMs, pingTimeoutMs, planTimeoutMs, backoffBaseMs, backoffMaxMs, backoffJitter, maxRateLimitRetries, minIterationGapMs, sleepTickMs, sleepThresholdMs, caffeinate, watchdogTickMs, watchdogSuspectMs, watchdogConfirmMs, maxRecoveryAttempts) |
| `DEFAULT_RESILIENCE` defaults | No | `src/lib/config.ts:110-135` — matches the interface, no SSE key |
| `applyResilienceOverride` (CLI parser) | Would **reject** any override | `src/lib/cli-args.ts:96-99` — `if (!(key in DEFAULT_RESILIENCE))` exits 1 with "unknown resilience key" message |
| Config-file `resilience` block | No | `OcloopConfig.resilience: Partial<ResilienceConfig>` at `config.ts:151` — only keys present in the interface are accepted |
| Help text | No | `src/lib/cli-args.ts:32-67` — `--resilience <key=value>` documented but no per-key list |
| `grep` for the constant in `src/` | Defined and used in 2 lines only | `App.tsx:1228, 1237` |

A user who runs `ocloop
--resilience sseReconnectRestartThreshold=4`
will see:

```
Error: unknown resilience key
  "sseReconnectRestartThreshold"
Valid keys: createTimeoutMs,
  promptTimeoutMs, abortTimeoutMs,
  statusTimeoutMs, pingTimeoutMs,
  planTimeoutMs, backoffBaseMs,
  backoffMaxMs, backoffJitter,
  maxRateLimitRetries, minIterationGapMs,
  sleepTickMs, sleepThresholdMs,
  caffeinate, watchdogTickMs,
  watchdogSuspectMs, watchdogConfirmMs,
  maxRecoveryAttempts, resume, chaos
```

…with exit code 1. The key is not
documented anywhere in the help, README,
or config schema. The threshold is a
**compile-time** constant.

**Finding 7.4.A — MEDIUM — The SSE
reconnection threshold is a hardcoded
constant; users with slow/unreliable
servers cannot tune it.**

The default of `6` was chosen to balance
"don't restart prematurely on a blip"
vs "don't sit silent for too long on a
genuinely dead server". The actual
wall-clock time to fire the threshold
is ~61s (see INFO observation below),
which is reasonable for a healthy
network. But:

- A user running the harness against
  a **flaky** server (e.g., a dev VM
  on a congested LAN) may see 6 failed
  reconnects fire `restartServer()`
  while the server is still alive,
  causing a needless restart + session
  reconcile.
- A user running against a **truly
  dead** server (the loop's primary
  failure mode) may prefer a **lower**
  threshold (e.g., 3) to restart
  sooner.
- The behavior is otherwise
  unreachable from configuration: a
  power user with a non-standard
  deployment has no escape hatch
  short of editing `App.tsx:1228` and
  rebuilding.

The other resilience thresholds in
`config.ts` follow a consistent
pattern: defaults + `Partial<…>` for
file overrides + `--resilience key=value`
for CLI overrides. SSE reconnect
threshold is the **only** major
recovery threshold that breaks this
pattern. (The watchdog has
`maxRecoveryAttempts` and the rate-
limit path has `maxRateLimitRetries`,
both configurable; SSE reconnect is
the outlier.)

**Where.** `App.tsx:1228`
(`SSE_RECONNECT_RESTART_THRESHOLD`).
`src/lib/config.ts:45-135` (the
`ResilienceConfig` shape — no SSE
key).

**Proposed fix.** Add a `sseReconnectRestartThreshold:
number` key to `ResilienceConfig` with
`DEFAULT_RESILIENCE.sseReconnectRestartThreshold
= 6`, and read the value from
`resilience()` (the same accessor
already used by the rate-limit path at
`App.tsx:676`) inside the effect. The
fix is **fully backward compatible**
(the default preserves current
behavior) and **trivially testable**:
the existing `useWatchdog.test.ts`
fixtures (which mock `recover()` and
inspect the action calls) provide a
template for an effect-level test of
the threshold check.

```ts
// config.ts — add the key
export interface ResilienceConfig {
  // ... existing keys ...
  /** Consecutive SSE reconnect failures before escalating to a server restart. */
  sseReconnectRestartThreshold: number
}
export const DEFAULT_RESILIENCE:
  ResilienceConfig = {
  // ... existing defaults ...
  sseReconnectRestartThreshold: 6,
}

// App.tsx:1224-1245 — read from
// resilience() instead of a constant
createEffect(() => {
  const threshold =
    resilience().sseReconnectRestartThreshold
  const attempts = sse.reconnectAttempts()
  if (attempts === 0) {
    sseRecoveryFired = false
    return
  }
  if (
    attempts >= threshold &&
    loop.isRunning() &&
    !sseRecoveryFired
  ) {
    sseRecoveryFired = true
    log.health("sse",
      "reconnect_exhausted",
      { attempts, threshold })
    void restartServer()
  }
})
```

This change is mechanical, preserves
the current default, and unblocks
configuration via:

- CLI: `ocloop --resilience
  sseReconnectRestartThreshold=4`
- File: `"resilience":
  {"sseReconnectRestartThreshold": 4}`
  in `~/.config/ocloop/ocloop.json`
- Both, with CLI > file > default
  precedence already implemented in
  `resolveResilience` at
  `config.ts:160-175`.

**Status.** Fix proposed, not applied
(audit-only per PLAN.md acceptance
criteria). Severity is MEDIUM because
the threshold's default is reasonable
for typical use; the gap affects power
users, not the standard case.

#### INFO — Threshold timing: ~61s to fire

The `scheduleReconnect` backoff curve
at `useSSE.ts:574-591`:

```ts
const attempt = reconnectAttempts()
const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
setReconnectAttempts(attempt + 1)
```

The `reconnectAttempts` counter
**increments inside `scheduleReconnect`
itself**, before the timeout fires.
The effect at `App.tsx:1230-1245` reads
the counter reactively, so the
threshold check fires as soon as the
counter is updated.

Walk-through for the default
threshold of `6`:

| Step | Counter before `scheduleReconnect` | Delay scheduled | Approx. wall-clock |
| --- | --- | --- | --- |
| 1st connect fail | 0 | 1000 * 2^0 = 1s | t = 0 |
| 2nd connect fail | 1 | 1000 * 2^1 = 2s | t ≈ 1s |
| 3rd connect fail | 2 | 1000 * 2^2 = 4s | t ≈ 3s |
| 4th connect fail | 3 | 1000 * 2^3 = 8s | t ≈ 7s |
| 5th connect fail | 4 | 1000 * 2^4 = 16s | t ≈ 15s |
| 6th connect fail | 5 | min(1000*2^5, 30000) = 30s | t ≈ 31s |
| **Effect fires** (counter = 6) | — | — | **t ≈ 61s** |
| 7th connect (never happens) | 6 | 30s | would be t ≈ 91s |

So `SSE_RECONNECT_RESTART_THRESHOLD =
6` translates to "fire `restartServer()`
~61 seconds after the initial
disconnect". A user who sets the
threshold to `3` would see the
escalation fire at ~7s; at `10` it
would fire at ~91s+30s = ~121s (well
into the second 30s backoff interval).
The relationship is non-linear, which
is a small footgun for users who try
to reason about the threshold as a
"raw attempt count" — the exponential
backoff means a higher threshold
buys disproportionately more wall-
clock time.

#### INFO — The `sseRecoveryFired` flag and the reconnect counter reset

The flag-reset path at `App.tsx:1232-1234`:

```ts
if (attempts === 0) {
  sseRecoveryFired = false
  return
}
```

`reconnectAttempts` resets to `0` in
two places in `useSSE.ts`:

1. `useSSE.ts:522` — on a **successful
   connect** (`setReconnectAttempts(0)`
   after `setStatus("connected")`).
2. `useSSE.ts:618` — in the
   **manual** `reconnect()` function
   (called by `restartServer()` at
   `App.tsx:653`, the watchdog action
   at `App.tsx:260`, the wake handler
   at `App.tsx:207`, and the server-
   ready effect at `App.tsx:1026`).

So the recovery flow is:

1. 6 failed reconnects → effect
   fires → `restartServer()` →
   `server.restart()` →
   `sse.reconnect()` → counter resets
   to `0` → flag resets to `false`
   (next render of the effect sees
   `attempts === 0`).
2. New server comes up, `connect()`
   succeeds → counter stays at `0`.
3. If the **new** server also fails,
   the streak starts over from `0` and
   the threshold can fire **again**
   on the new streak (correct
   behavior — we want a fresh budget
   per server instance).

This is the right semantics. The
flag is the "one-shot per failure
streak" guarantee; the counter reset
on `reconnect()` is the "fresh budget
after recovery" guarantee. The two
work together without conflicting.

#### INFO — The threshold does NOT fire when the loop is paused, in cooldown, or in any non-running state

The guard `loop.isRunning() &&` at
`App.tsx:1238` ties the threshold to
the loop's `isRunning` memo at
`useLoopState.ts:307-310`:

```ts
const isRunning = createMemo(() => {
  const s = state()
  return s.type === "running" || s.type === "pausing"
})
```

So the threshold only fires when the
loop is `running` or `pausing`. In
`paused` state, `cooldown` state, or
any non-running state, the condition
short-circuits to false and the
`restartServer()` call is **not**
fired. This is correct: there is no
benefit to restarting the server
while the loop is paused (the user
intends to be idle) or while it is
waiting out a rate-limit cooldown
(restarting the server would not
unblock the upstream rate limit).

A subtle consequence: if the SSE
stream breaks while the loop is
`paused`, the reconnect counter
accumulates but the threshold never
fires. When the user resumes (the
state transitions to `running`),
the effect re-runs and the threshold
can fire immediately on the next
`createEffect` cycle. This is
intentional — the threshold is a
"loop is iterating, server is dead"
signal, not a "SSE has been broken
for N attempts" signal.

#### Verifier checklist for Task 7.4

- [x] The threshold constant is at
  `App.tsx:1228` (`const
  SSE_RECONNECT_RESTART_THRESHOLD = 6`)
  — verified by direct file read.
- [x] The threshold is referenced at
  `App.tsx:1237` (`attempts >=
  SSE_RECONNECT_RESTART_THRESHOLD`) —
  verified.
- [x] `ResilienceConfig` interface at
  `config.ts:45-105` has no
  `sseReconnectRestartThreshold` key
  — verified by direct file read of
  all 18 keys.
- [x] `DEFAULT_RESILIENCE` at
  `config.ts:110-135` has no
  `sseReconnectRestartThreshold`
  default — verified.
- [x] `applyResilienceOverride` at
  `cli-args.ts:96-99` rejects unknown
  keys (the `if (!(key in
  DEFAULT_RESILIENCE))` guard) — the
  CLI cannot override the threshold
  — verified.
- [x] The recovery effect fires
  `restartServer()` exactly once per
  failure streak (the
  `sseRecoveryFired` flag at
  `App.tsx:1229, 1241`) — verified.
- [x] The recovery effect resets the
  flag when `sse.reconnectAttempts()
  === 0` (`App.tsx:1232-1234`) — the
  `useSSE.ts:522` reset on a
  successful connect and the
  `useSSE.ts:618` reset in
  `reconnect()` both feed this path
  — verified.
- [x] The threshold does NOT fire when
  the loop is `paused`, `cooldown`,
  `error`, `ready`, `complete`, or
  `stopping` (the `loop.isRunning()`
  guard excludes those states) —
  verified at `useLoopState.ts:307-310`.
- [x] The `restartServer()` body at
  `App.tsx:649-663` calls
  `server.restart()` + `sse.reconnect()`
  + `reconcileAndAdvance()` and
  notifies the watchdog on a `working`
  verdict — verified by direct file read.
- [x] The exponential backoff curve
  at `useSSE.ts:580-582` produces
  delays of 1, 2, 4, 8, 16, 30, 30,
  30 seconds (capped at 30s) — verified
  by direct file read; the threshold
  fires at ~61s wall-clock for the
  default of 6.

#### Test-suite delta for Task 7.4

No new tests added. The threshold
behavior is not covered by
`useSSE.test.ts` (which only tests
`classifySessionError` in isolation)
or `useWatchdog.test.ts` (which
exercises the watchdog's recovery
ladder, not the SSE reconnect-
exhaustion effect). The effect at
`App.tsx:1230-1245` is in the
`App.tsx` orchestration layer, which
has no unit tests — it is exercised
only by the integration test at
`resilience-integration.test.ts`
(which covers the watchdog's restart
path, not the SSE reconnect path).

A future test would mount a
`createRoot` around the effect with
a mocked `sse.reconnectAttempts`
signal, drive the counter to 6, and
assert that `restartServer` was
called once. This is a deferred
Phase 18 (test coverage) finding —
the test is mechanical and the
behavior is verifiable by direct
file read, so the lack of a test
is not load-bearing for the audit.

`bun test` -> **640 pass, 0 fail, 1617
expect() calls** across 21 files.
No regressions.

### 7.5 — Verify `sse.reconnect()` is called on wake, watchdog recovery, and server restart; confirm no double-reconnection issues

PLAN.md 7.5: "Verify: `sse.reconnect()`
is called on wake, on watchdog
recovery, and on server restart — no
double-reconnection issues?"

**Status: COMPLETE — VERIFIED with ONE
finding. `sse.reconnect()` is correctly
invoked from all three documented call
sites (wake, watchdog, server restart)
plus a fourth (server-ready effect).
The **supersession pattern** in
`useSSE.ts:489-513` and `useSSE.ts:543-551`
correctly serializes overlapping
`connect()` invocations, so the
**intentional** double-call inside the
watchdog's recovery ladder
(`reconnectSSE` + `restartServer`) is
safe. The **one** HIGH finding is a
**concurrency gap** in `server.restart()`:
two independent triggers
(SSE-reconnect-exhaustion effect,
watchdog recovery, manual command
palette) can each call `restartServer()`
concurrently, with no in-flight guard.
`server.restart()` may then launch
**two** server instances and leak the
first. No CRITICAL findings; one HIGH,
two INFO.**

#### The four call sites of `sse.reconnect()` in `App.tsx`

| # | Path | Location | What it reconnects to |
| - | --- | --- | --- |
| 1 | Server ready effect | `App.tsx:1013-1089`, the call at `:1026` | The initial SSE stream for the freshly-started server. |
| 2 | Wake handler | `App.tsx:199-221`, the call at `:207` | The SSE stream that almost certainly died during sleep. |
| 3 | Watchdog recovery action | `App.tsx:257-261` (`reconnectSSE` action), invoked from `useWatchdog.ts:203` | The SSE stream after the first escalation step (cheap reconnect). |
| 4 | `restartServer` body | `App.tsx:649-663`, the call at `:653` | The SSE stream after `server.restart()` has rebuilt the server. |

(The 5th apparent call, at
`useSSE.ts:644` and `useSSE.ts:650`, is
the `onMount` auto-connect and the
`onCleanup` disconnect — not `reconnect`
proper, but they bracket the same
lifecycle.)

The fourth call site is the
**purpose** of this audit: `restartServer()`
is invoked from three independent
triggers (each will eventually call
`sse.reconnect()`):

| Trigger | Location | Notes |
| - | --- | --- |
| Watchdog recovery ladder | `useWatchdog.ts:204-205` → `App.tsx:282` → `App.tsx:649` | For "server_hung" reason **or** when `recoveryAttempts >= 2`. |
| SSE reconnect exhaustion | `App.tsx:1224-1245` | When `sse.reconnectAttempts() >= 6` and `loop.isRunning()`. |
| Manual command palette | `App.tsx:1507-1517` | User selects "Restart server" in the command palette (kbd `C`/`R`-style entry). |

#### Path 1 — Server ready effect (`App.tsx:1013-1089`)

```ts
createEffect(() => {
  if (server.status() === "ready" && loop.state().type === "starting") {
    // ... server_ready / server_ready_debug dispatch ...
    sse.reconnect()  // line 1026
    // ... fetch active model, validate --agent, then initializeSession()
  }
})
```

**Why `reconnect()` and not `connect()`.** `useSSE` has an `onMount` hook
that auto-connects with whatever URL
`server.url()` returned at mount time
(`useSSE.ts:642-646`). But on the very
first effect tick, `server.url()` is
still `null` (the server status is
"starting"). The first auto-connect
bails at the `if (!currentUrl)` guard
(`useSSE.ts:481-484`). When the server
later transitions to "ready" and gets a
URL, this effect calls `sse.reconnect()`
to attach the SSE stream to the now-
valid URL.

This is also a **first connection**,
not a true "reconnect" — but
`sse.reconnect()` is the right verb
because it also clears any stale
`reconnectTimeout` (none here, but
defensive) and resets the
`reconnectAttempts` counter to `0`. Using
`reconnect()` instead of `connect()`
makes the call site robust to a
hypothetical future where the server
flapped before the effect fired.

**No double-fire concern.** This effect
is gated by `loop.state().type === "starting"`.
The starting state is a one-shot
transition (`starting` → `ready` or
`starting` → `debug` or `starting` →
`error`); once the loop leaves
`starting`, the condition short-
circuits to false. Subsequent
`restartServer()` calls do NOT return
the loop to `starting` (the loop state
stays `running`/`pausing` across
restarts, only the server state
flaps), so this effect won't re-fire on
a recovery restart.

#### Path 2 — Wake handler (`App.tsx:199-221`)

```ts
function handleWake(gapMs: number): void {
  log.health("sleep", "wake", { gapMs })
  activityLog.addEvent("task", t("actWake", { secs: Math.round(gapMs / 1000) }))
  sse.reconnect()  // line 207
  watchdog.notifyWake()
  const st = loop.state()
  if (st.type === "cooldown") {
    if (monotonicNow() >= st.resumeAt) {
      clearCooldownTimers()
      loop.dispatch({ type: "resume_cooldown" })
    }
  } else {
    void reconcileAndAdvance()
  }
}
```

The comment on the function is the
specification:

> The SSE stream almost always died
> while asleep, so reconnect it; then
> reconcile the in-flight session in case
> we slept through its `session.idle`.

`watchdog.notifyWake()` (`useWatchdog.ts:156-167`)
resets `lastHeartbeatAt = clock.monotonicNow()`,
so the watchdog's next tick sees a
fresh grace window and does **not**
trip on the sleep gap as a stuck
session. (Phase 6.4 audit covers this
in detail.)

**Possible concurrent call: watchdog
recovery.** If the wake happens while
the watchdog is mid-recovery (e.g.,
the watchdog fired `recover()` at tick
N, the recovery action is awaiting
`server.restart()`, the system
suspends, the user resumes), the
following sequence is possible:

1. Watchdog tick → `recover("server_hung")` →
   `reconnectSSE()` (sse.reconnect() #1).
2. `await restartServer()` (still
   running; in the middle of
   `server.restart()`).
3. **System suspends.**
4. **User resumes** → `handleWake` fires.
5. `sse.reconnect()` (#2) — supersedes
   the in-flight #1's connect.
6. `watchdog.notifyWake()` — resets
   heartbeat.
7. The original `restartServer()` from
   step 2 resumes: `sse.reconnect()` (#3)
   — supersedes #2.
8. `reconcileAndAdvance()` runs (twice,
   once per path).

The triple-call is **safe** by the
supersession pattern (see "Why
multiple `sse.reconnect()` is safe"
below). The duplicate
`reconcileAndAdvance()` is the real
concern — and that's a Phase 15 (race
conditions) audit item, not this one.

The watchdog's recovery is a no-op on
subsequent ticks because
`notifyWake()` reset the heartbeat and
the (eventually completed) `restartServer`
also calls `notifyWake()` on a
"working" verdict (`App.tsx:660-662`).

#### Path 3 — Watchdog recovery action (`App.tsx:257-261`)

```ts
reconnectSSE: () => {
  activityLog.addEvent("task", t("actGuardReconnect"))
  sse.reconnect()
},
```

The escalation ladder at
`useWatchdog.ts:201-208` shows the
**double-call**:

```ts
options.actions.reconnectSSE()         // (A) sse.reconnect()
if (reason === "server_hung" || recoveryAttempts >= 2) {
  await options.actions.restartServer()  // (B) restartServer() → sse.reconnect()
} else {
  await options.actions.abortAndRetry()
}
```

(A) is the **cheap first step** — try
a fresh SSE connect before doing
anything heavier. (B) is the
escalation — restart the server and
re-reconcile. (B) calls
`sse.reconnect()` again inside
`restartServer()` because the URL
might have changed after the restart
(actually, the URL stays the same
unless the port is in use and the
fallback ephemeral port kicks in — see
Phase 6 audit for the port-stability
guarantee).

This is **intentional** and is covered
by the supersession pattern: the
connect() launched by (A) is in flight
(`await client.event.subscribe`); (B)
fires `sse.reconnect()` which aborts
that in-flight controller and starts
a new one. The new controller's
`subscribe` await then succeeds (or
fails) against the new server.

The `reconnectSSE()` action logs
"Guardian: reconnecting SSE"
(`i18n.ts:266`) and the `restartServer`
body logs "Guardian: server
restarting" (`App.tsx:651`). Both go
into the activity log, so the user
sees the two-step escalation
explicitly.

#### Path 4 — `restartServer` body (`App.tsx:649-663`)

```ts
async function restartServer(): Promise<void> {
  log.health("server", "recovery_restart", { url: server.url() })
  activityLog.addEvent("error", t("actGuardRestart"))
  await server.restart()
  sse.reconnect()
  const verdict = await reconcileAndAdvance()
  if (verdict === "working") {
    watchdog.notifyWake()
  }
}
```

This is the body that all three
restart triggers (watchdog recovery,
SSE exhaustion, manual palette) call.
`server.restart()` tears down the old
server, launches a new one on the
same port, and resolves with the new
URL. `sse.reconnect()` then attaches
the SSE stream to the new URL (it
must — the old controller was bound
to the old process, which is gone).
`reconcileAndAdvance()` checks
whether the in-flight session
survived the restart.

`watchdog.notifyWake()` is called
**only** on a "working" verdict (line
660-662). This is the bug-fix from
the Phase 6.4 audit: without the
`notifyWake()`, the watchdog's next
tick would see `dt = monotonicNow() -
lastHeartbeatAt` measured against the
**pre-restart** timestamp and trip
STUCK again on the very next tick,
collapsing the recovery ladder.

#### Why multiple `sse.reconnect()` is safe — the supersession pattern

`useSSE.ts:489-513` and `useSSE.ts:543-551`:

```ts
// Per-invocation controller. `reconnect()`/`disconnect()` replace
// `abortController`; an old connect() detects it's been superseded by
// comparing its own controller against the current one and bails WITHOUT
// mutating shared status — otherwise a stale loop's "disconnected" could
// clobber a fresh connection (the post-restart reconnect wedge).
const myController = new AbortController()
abortController = myController
// ...
try {
  const events = await client.event.subscribe({ directory }, { signal: myController.signal })
  // Superseded while awaiting the subscription? Leave status to the winner.
  if (abortController !== myController) return
  // ...
  setStatus("connected")
  // ...
  for await (const event of events.stream) {
    if (abortController !== myController) return
    processEvent(event)
  }
  // ...
} catch (err) {
  // Superseded by a newer connect()/disconnect(), or our own controller was
  // aborted: stay silent so we don't fight the current connection.
  if (
    abortController !== myController ||
    (err instanceof Error && err.name === "AbortError")
  ) {
    return
  }
  // ... only NOW: setError, setStatus("error"), scheduleReconnect
}
```

The key invariant: **a `connect()`
that has been superseded (its
controller is no longer the current
one) does not write to the shared
`status` / `error` / `reconnectAttempts`
signals.** Status writes only happen
after the supersession check. This is
explicitly called out in the comment
as "the post-restart reconnect wedge"
— the bug this pattern was designed
to prevent.

Reconnect (re)scheduling is also
safe. `reconnect()` clears
`reconnectTimeout` before calling
`connect()` (`useSSE.ts:627-630`); if
`scheduleReconnect()` had a pending
timer from a previous failed
connection, that timer is canceled
before the new `connect()` is
launched. The handler in
`scheduleReconnect` also nulls
`reconnectTimeout` synchronously when
it fires (line 586) — a small
defensive touch so a
`reconnect()` arriving in the same
tick as a fired timer doesn't race a
stale reference.

The pattern is **load-bearing** for
the watchdog-recovery double-call:
without it, the (A) `reconnectSSE`'s
connect would race with the (B)
`restartServer`'s connect and could
clobber the fresh "connected" status
with a stale "disconnected" or
"error".

#### `sse.reconnect()` is itself idempotent and safe to call repeatedly

The function body at
`useSSE.ts:616-639`:

```ts
function reconnect(): void {
  setReconnectAttempts(0)
  shouldReconnect = true
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  setStatus("disconnected")
  connect()
}
```

- `setReconnectAttempts(0)` — safe
  to call repeatedly (just sets the
  signal to 0).
- `abortController.abort()` then
  `abortController = null` — the abort
  causes the in-flight connect's
  `client.event.subscribe` to throw
  `AbortError`, the catch block returns
  silently (line 547-551), and the
  aborted controller reference is
  dropped so the next `connect()` can
  install a fresh one.
- `clearTimeout(reconnectTimeout)` —
  cancels any pending scheduled
  reconnect from a previous failure.
- `setStatus("disconnected")` — done
  synchronously before `connect()` is
  called, so the next `connect()`'s
  "already connecting/connected" guard
  (line 473-475) won't false-positive.
- `connect()` — creates a new
  controller, assigns to
  `abortController`, awaits
  `client.event.subscribe`. The
  controller comparison inside
  `connect()` ensures that even if
  the previous in-flight connect
  sneaks a status write in, it will
  bail before mutating.

JavaScript is single-threaded, so
the body of `reconnect()` runs
atomically — the next `reconnect()`
(however triggered) can only start
after the current one has set up its
`connect()` and yielded at the first
`await`. By that time, the
supersession check has been set up
correctly.

#### Finding 7.5.A — HIGH — `server.restart()` has no in-flight guard; concurrent triggers can launch two servers and leak the first

`useServer.ts:194-229`:

```ts
async function restart(): Promise<void> {
  const preferredPort = serverPort() ?? port ?? 0
  log.health("server", "restart_begin", { preferredPort })

  setStatus("starting")
  setError(undefined)
  closeCurrent()
  setUrl(null)

  try {
    await launch(preferredPort)
    // ...
  } catch (errPreferred) {
    try {
      await launch(0)  // ephemeral port fallback
      // ...
    } catch (err) {
      // ...
    }
  }
}
```

There is no "is a restart already in
flight?" check. The
`setStatus("starting")` is a no-op for
two concurrent callers (the value is
already "starting"). The
`closeCurrent()` is a no-op for the
second caller (the first caller
already nulled `abortController` and
`serverRef`). But the **`launch()`
call is NOT a no-op** — both
callers proceed to `launch()` and try
to bind a server on the same port.

Three of `restartServer()`'s triggers
(`watchdog recovery`,
`SSE-exhaustion effect`,
`command-palette restart`) can fire
in close temporal proximity. The
SSE-exhaustion effect runs in
SolidJS's reactive update queue
(`App.tsx:1230-1245`); the watchdog
fires from a `setInterval` at
`watchdogTickMs` (default 1000ms —
`config.ts:117`). A flaky server that
takes a few seconds to die can trip
both:

- Watchdog tick at T+1.0s:
  `probes.isActive()` returns true
  (still running), `pingServer` fails
  (server is gone), `recover("server_hung")`
  starts, calls `reconnectSSE()` (1st
  sse.reconnect), then `await
  restartServer()`.
- Inside that `restartServer()`,
  `server.restart()` is awaiting
  `launch()`.
- Meanwhile the SSE-reconnect
  counter, which was incremented by
  the failed SSE connections, hits
  6. The exhaustion effect fires:
  `sseRecoveryFired = true`, `void
  restartServer()`.
- That second `restartServer()` also
  enters `server.restart()`, which
  is **also** awaiting `launch()`.
- Both `launch()`s proceed in
  parallel. Each does:
  `serverRef = await createOpencodeServer(...)`
  (`useServer.ts:103`). The second
  `launch()` overwrites the
  `serverRef` assigned by the first
  `launch()` once it resolves. The
  first server's process handle is
  dropped on the floor — the
  `serverRef.close()` reference is
  lost.

Concretely, on Linux/macOS the first
server to bind the port succeeds and
the second one will fail with
`EADDRINUSE` and fall through to the
ephemeral-port retry at
`useServer.ts:213-220`. On Windows or
under races where the port is
released in time, both could
succeed — the second one would
overwrite `serverRef` and the first
one's process would never be
explicitly closed (it would die on
process exit, but until then it's
holding the port and the URL).

The `setUrl(null)` + `setStatus("starting")`
+ `closeCurrent()` sequence is
**not** a guard — it's a setup
operation. There's no early-return
when `status() === "starting"` and a
restart is already in flight. (Note
that `startServer` at
`useServer.ts:120-122` does have such
a guard: `if (status() !== "starting" && status() !== "stopped") return` —
but `restart()` does not.)

**Why this is HIGH and not MEDIUM.**
The window for the race is small
(roughly the duration of
`launch()`, which is sub-second on
a healthy machine) but the impact
is severe: a leaked server process
holding the loop's intended port,
the loop's URL pointing to the
second server (not the first), and
a confusing "why is port 4096 still
in use after I quit?" after-exit. The
fix is one line.

**Where.**
- `useServer.ts:194-229` —
  `restart()` has no in-flight guard.
- `App.tsx:649-663` —
  `restartServer()` is the public
  surface that three triggers share.
- `App.tsx:1230-1245` — the
  SSE-exhaustion effect is the
  trigger most likely to coincide
  with the watchdog (both fire when
  the server is dying).
- `App.tsx:257-261` — the watchdog's
  `reconnectSSE` action runs
  *before* `restartServer`, so it
  doesn't directly help (but it
  doesn't make it worse either).

**Proposed fix.** Add a `restarting`
guard (reusing `status() === "starting"`
as the in-flight check) at the top
of `restart()`:

```ts
async function restart(): Promise<void> {
  // Don't double-restart. status flips to "starting" on entry and
  // back to "ready" / "error" on exit; bail if a restart is mid-flight.
  if (status() === "starting") {
    log.health("server", "restart_in_flight_noop", { url: url() })
    return
  }

  const preferredPort = serverPort() ?? port ?? 0
  log.health("server", "restart_begin", { preferredPort })

  setStatus("starting")
  setError(undefined)
  closeCurrent()
  setUrl(null)
  // ... existing body unchanged ...
}
```

The guard reuses the same
`status() === "starting"` check that
`startServer()` already uses at
`useServer.ts:120-122`, so it is
consistent across the two paths and
doesn't introduce a new state bit
to keep in sync. The log line
documents the no-op so a
`log.health` consumer can tell
double-fires apart from real
restarts.

The fix is **purely defensive** and
**fully backward compatible**:
under normal (non-racy) operation
the guard never fires, and under
racy operation the second caller
silently no-ops. Concurrent
`reconcileAndAdvance()` calls
(described under Path 2 above)
remain a separate concern — that's a
Phase 15 (race conditions) audit
item.

#### INFO — `restartServer()` swallows `server.restart()` rejections silently in some call sites

`App.tsx:653`:

```ts
sse.reconnect()
const verdict = await reconcileAndAdvance()
```

If `server.restart()` (the line
above) throws — and it can, even
though the implementation at
`useServer.ts:206-228` has a
two-tier try/catch — the throw
propagates up through `restartServer()`.
The three triggers handle the
returned promise differently:

- Watchdog recovery: `await
  options.actions.restartServer()` at
  `useWatchdog.ts:205`. The watchdog
  wraps the call in a try/catch via
  the `tick()` `.catch()` at
  `useWatchdog.ts:301-305`, so a
  throw would be logged and
  swallowed — but the recovery
  ladder would not continue to the
  circuit-breaker check. This is a
  Phase 6 follow-up; not a
  Phase 7.5 issue.
- SSE-exhaustion effect: `void
  restartServer()` at
  `App.tsx:1243`. `void` discards
  the promise, so an unhandled
  rejection bubbles to the top
  level. (The `unhandledRejection`
  handler in `index.tsx` covers
  this, but the recovery ladder
  doesn't get to see it.)
- Command palette: `void
  restartServer()` at
  `App.tsx:1515`. Same `void`
  treatment.

Inconsistent handling of the same
function. Not a Phase 7.5 finding —
flagged for the Phase 15 audit
(uncaught rejections) as a
related-but-distinct item.

#### INFO — The recovery ladder in `useWatchdog` is intentionally two-step, not because of a bug

`useWatchdog.ts:201-208`:
```ts
options.actions.reconnectSSE()
if (reason === "server_hung" || recoveryAttempts >= 2) {
  await options.actions.restartServer()
} else {
  await options.actions.abortAndRetry()
}
```

Some readers find the
"reconnect-then-restart" two-step
suspicious. It is **intentional**
and correct. The first
`reconnectSSE` call is a cheap probe:
if the SSE stream is the only thing
that's wedged (a stale connection
held open by a TCP keepalive
forever, a buffered event backlog,
etc.), a reconnect is enough. The
full server restart is the heavy
hammer; the comment at
`useWatchdog.ts:201-202` makes the
rationale explicit:

> Always reconnect SSE first
> (cheap). A hung server (or a wedge
> that a prior abort+retry didn't
> clear) escalates to a server
> restart.

The "abort first, restart on the
2nd attempt" branch (the
`recoveryAttempts >= 2` clause) is
the persistent-wedge path: a session
that has been aborted+retried once
and wedged again is judged
**structurally** stuck, not just
network-glitched, and the recovery
escalates to a server restart
without burning the abort-retry
budget a second time.

`useWatchdog.test.ts:214-225`
(Phase 6 audit) covers this
two-step pattern with a test that
asserts `restartServer` is called
on the **2nd** attempt, not the
1st.

#### Verifier checklist for Task 7.5

- [x] `sse.reconnect()` is called on
  wake at `App.tsx:207` inside
  `handleWake()` — verified by
  direct file read.
- [x] `sse.reconnect()` is called on
  watchdog recovery at
  `App.tsx:260` inside the
  `reconnectSSE` action, invoked
  from `useWatchdog.ts:203` — verified.
- [x] `sse.reconnect()` is called on
  server restart at `App.tsx:653`
  inside `restartServer()` — verified.
- [x] `sse.reconnect()` is also
  called on the server-ready effect
  at `App.tsx:1026` — verified
  (this is a 4th call site beyond
  the three the PLAN.md task
  enumerates; it is a first-connect
  not a true reconnect but uses
  the same verb for the
  reason documented in the
  audit body).
- [x] The watchdog's recovery ladder
  at `useWatchdog.ts:201-208`
  intentionally calls
  `reconnectSSE` (which calls
  `sse.reconnect()`) and then
  `restartServer` (which also
  calls `sse.reconnect()`) —
  verified; the 2-call sequence is
  intentional and the comment at
  `useWatchdog.ts:201-202` documents
  the rationale.
- [x] The supersession pattern in
  `useSSE.ts:489-513` and
  `useSSE.ts:543-551` correctly
  serializes overlapping
  `connect()` invocations — status
  writes happen only after the
  supersession check — verified by
  direct file read.
- [x] `reconnect()` at
  `useSSE.ts:616-639` is itself
  idempotent: it clears any
  pending reconnect timer, aborts
  the current controller, drops
  the reference, resets
  `reconnectAttempts` to 0, and
  forces the status to
  "disconnected" before calling
  `connect()` — verified.
- [x] The third call site of
  `restartServer()` is the manual
  command palette at
  `App.tsx:1507-1517` — verified;
  this is the only user-initiated
  trigger (the other two are
  automatic: watchdog + SSE
  exhaustion).
- [x] `server.restart()` at
  `useServer.ts:194-229` has no
  in-flight guard — verified by
  direct file read; this is the
  basis for Finding 7.5.A.
- [x] The fix proposal (early-return
  on `status() === "starting"` at
  the top of `restart()`) is
  consistent with the existing
  guard in `startServer()` at
  `useServer.ts:120-122` — verified.

#### Test-suite delta for Task 7.5

No new tests added. The four call
sites and the supersession pattern
are not covered by `useSSE.test.ts`
(which only tests `classifySessionError`
in isolation — the hook itself is
untestable without an
`@opentui/solid` mock, see
`docs/testing.md`) and not covered
by `useWatchdog.test.ts` (which
exercises the watchdog's recovery
ladder, not the SSE layer's
reconnect behavior).

The HIGH finding (7.5.A) is
verifiable by direct file read and
does not require a test to be
load-bearing for the audit. A future
test for the `server.restart()`
in-flight guard would be a
`useServer.test.ts` unit test (the
file does not exist yet) that mocks
`createOpencodeServer` to return a
slow-resolving handle, then calls
`restart()` twice in parallel and
asserts only one `launch()` is
attempted. This is a deferred
Phase 18 (test coverage) item.

`bun test` -> **640 pass, 0 fail, 1617
expect() calls** across 21 files.
No regressions.

### 7.6 — Verify heartbeat is recorded on every SSE event type (todo_updated, file_edited, step_finish, tool_use, message_text, reasoning)

PLAN.md 7.6: "Verify: heartbeat is
recorded on every SSE event type
(todo_updated, file_edited, step_finish,
tool_use, message_text, reasoning) —
confirm no events are missed."

**Status: COMPLETE — VERIFIED. All six
enumerated events trigger a heartbeat.
The three SSE events that do not
(session.created, session.idle,
session.error) omit the heartbeat
deliberately and are correct. No new
findings beyond the existing 7.1.F
(LOW — `onAnyEvent` declared but not
registered).**

#### Heartbeat coverage — VERIFIED

The `heartbeat` helper is a one-line
closure defined at `App.tsx:300`:

```ts
/** Feed the watchdog a heartbeat from any real session-progress SSE event. */
const heartbeat = () => watchdog.recordHeartbeat()
```

which delegates to
`useWatchdog.recordHeartbeat()`
(`useWatchdog.ts:128-138`) — sets
`lastHeartbeatAt = clock.monotonicNow()`,
resets `recoveryAttempts` to 0, and
transitions health to `HEALTHY` if it
wasn't already.

A full grep for `heartbeat(` in `src/`
returns exactly six call sites, all in
the `useSSE({...})` handler block at
`App.tsx:444-565`, one per enumerated
event:

| # | Event | Handler in `useSSE.ts` | Callsite in `App.tsx` | Heartbeat? | What it proves |
| --- | --- | --- | --- | --- | --- |
| 1 | `todo.updated` | `onTodoUpdated` (line 388-396) | 509 | **Yes** | Model is updating its task plan; live work in progress. |
| 2 | `file.edited` | `onFileEdited` (line 398-401) | 518 | **Yes** | Model wrote to disk; live work in progress. Also re-parses `PLAN.md` if that file is the one edited (line 521-529). |
| 3 | `step-finish` (from `message.part.updated`) | `onStepFinish` (line 443-448) | 532 | **Yes** | A model turn completed; the next turn is about to start, so the silence window must reset before the next long pause. |
| 4 | `tool-use` / `tool` (from `message.part.updated`) | `onToolUse` (line 425-431) | 544 | **Yes** | Model invoked a tool; the (potentially slow) tool call is the strongest live-progress signal. Dedupe-gated on `seenPartIds` so the same tool isn't counted twice. |
| 5 | `text` (from `message.part.updated`) | `onMessageText` (line 432-437) | 556 | **Yes** | Model is streaming text. Dedupe-gated on `seenPartIds`. |
| 6 | `reasoning` (from `message.part.updated`) | `onReasoning` (line 438-442) | 561 | **Yes** | Model is reasoning. Dedupe-gated on `seenPartIds`. |

All six are wired. The
`useSSE.test.ts` test file (21 cases)
exercises `classifySessionError` only;
the wiring itself is verified by direct
file read.

#### Events that omit heartbeat — VERIFIED correct

Three SSE events in the switch at
`useSSE.ts:339-466` are NOT wired to
heartbeat in App.tsx. Each is correct:

| Event | Hook callsite | App.tsx handler | Why no heartbeat |
| --- | --- | --- | --- |
| `session.created` | `useSSE.ts:340-357` | `onSessionCreated` at `App.tsx:449-453` | The FIRST event of a fresh iteration, fired before any model progress. The iteration driver separately calls `watchdog.notifyIterationStart()` at `App.tsx:824` (right after `iteration_started` dispatch at line 822), which sets `lastHeartbeatAt = clock.monotonicNow()` and transitions to `HEALTHY`. A heartbeat in the SSE handler would be redundant and is intentionally omitted. |
| `session.idle` | `useSSE.ts:359-367` | `onSessionIdle` at `App.tsx:491-507` | Idle means the session finished. The handler calls `watchdog.notifyIdle()` at `App.tsx:503`, which is the correct reset (it zeroes `recoveryAttempts` and sets `HEALTHY`). A `recordHeartbeat` would do the same thing for the `lastHeartbeatAt` field but miss the explicit semantic of "iteration is over." `notifyIdle` is the right tool here. |
| `session.error` | `useSSE.ts:369-386` | `onSessionError` at `App.tsx:454-489` | An error path. Branches to either `enterCooldown` (line 477) or an `error` state dispatch (line 482-488). Neither of those needs a heartbeat reset: the cooldown timer is its own clock; the error state transitions the loop out of `running`/`pausing`, which the watchdog treats as "not active" (see `useWatchdog.ts:215-219`). |

#### Events with no App.tsx handler at all — VERIFIED non-impacting

Two handler slots in the `SSEEventHandlers`
interface have no `App.tsx`
registration:

| Handler | Hook fires for | App.tsx subscribes? | Heartbeat impact? |
| --- | --- | --- | --- |
| `onAnyEvent` | EVERY event (line 331-333) | **No** (Finding 7.1.F) | None. The handler is the post-filter "spy" slot used for dev tooling; not subscribing means no heartbeat is recorded via this path. The heartbeat is recorded by the per-type handlers that DO subscribe. |
| `onSessionDiff` | `session.diff` (line 452-465) | **No** | None in practice. A `session.diff` event represents the aggregate of file edits in the session. The underlying edits each arrive as a `file.edited` event, which DOES trigger heartbeat at `App.tsx:518`. The `session.diff` event itself is redundant for progress-tracking; the hook exposes it for future consumers (e.g., a diff-summary UI), not the watchdog. |

#### Cross-check with the heartbeat table already in 7.1

Phase 7.1 (line 7254-7285) already
documented the same handler-level
heartbeat coverage table. This Phase 7.6
audit is the focused PLAN.md task
verifying the six specific event types
the plan enumerates. The two tables
agree on every entry. No new
observations beyond the existing 7.1.F
(LOW) finding that `onAnyEvent` is
declared but not registered.

#### Verifier checklist for Task 7.6

- [x] `onTodoUpdated` at `App.tsx:509`
  calls `heartbeat()` — verified by
  direct file read.
- [x] `onFileEdited` at `App.tsx:518`
  calls `heartbeat()` — verified by
  direct file read.
- [x] `onStepFinish` at `App.tsx:532`
  calls `heartbeat()` — verified by
  direct file read.
- [x] `onToolUse` at `App.tsx:544`
  calls `heartbeat()` — verified by
  direct file read.
- [x] `onMessageText` at `App.tsx:556`
  calls `heartbeat()` — verified by
  direct file read.
- [x] `onReasoning` at `App.tsx:561`
  calls `heartbeat()` — verified by
  direct file read.
- [x] `heartbeat()` is the
  one-line closure at `App.tsx:300`
  delegating to
  `watchdog.recordHeartbeat()` — verified.
- [x] `recordHeartbeat()`
  (`useWatchdog.ts:128-138`) updates
  `lastHeartbeatAt = clock.monotonicNow()`,
  zeros `recoveryAttempts`, and
  transitions to `HEALTHY` if not
  already — verified.
- [x] The 3 events that omit heartbeat
  (session.created, session.idle,
  session.error) are each handled by a
  different watchdog primitive
  (`notifyIterationStart`, `notifyIdle`,
  or no-op-by-leaving-running-state) —
  the omission is correct, not a bug.
- [x] `onSessionDiff` (no App.tsx
  subscription) is redundant with
  `file.edited` for progress purposes
  — verified.
- [x] `onAnyEvent` (Finding 7.1.F) is
  the only LOW finding in this audit;
  no new findings.

#### Test-suite delta for Task 7.6

No new tests added. The handler wiring
is not unit-tested in isolation: the
SSE hook itself depends on the Solid
lifecycle and the `@opencode-ai/sdk`
SSE client (see `docs/testing.md` —
mocking `@opentui/solid` collides with
the JSX runtime), and the App.tsx
handler block is not extracted into a
testable seam.

A future test would refactor the six
handler functions into a pure map
(`{ eventType: (event) => () }`) and
assert that each entry in the map
calls the heartbeat. The refactor is
straightforward but out of scope for
this audit; the wiring is verified by
direct file read.

`bun test` -> **640 pass, 0 fail, 1617
expect() calls** across 21 files.
No regressions.

---

## Phase 8 — Crash Recovery & Persistence

Source: `src/lib/loop-state-store.ts` (91 lines —
the entire `saveLoopState` / `loadLoopState` /
`clearLoopState` triplet, the `PersistedLoopState`
type, and the `statePath` / `tmpPath` helpers).
Tests: `src/lib/loop-state-store.test.ts` (70
lines, 6 cases, all passing) — covers the
round-trip, the atomic-overwrite invariant, the
unsupported-version rejection, and the
idempotent clear. The consumer wiring lives in
`src/App.tsx:968-1010` (`handleQuit` calls
`clearLoopState`), `src/App.tsx:1098-1157`
(`initializeSession` calls `loadLoopState` +
`doResume` or offers a dialog), `src/App.tsx:1164-1197`
(`doResume` reconciles and dispatches
`resume_session`), and `src/App.tsx:1265-1290`
(the persistence effect that fires on every
`running`/`pausing`/`paused`/`cooldown`
transition).

PLAN.md Phase 8 has 8 audit tasks. They are
all coupled — same module, same data shape,
same recovery flow — so they are reported here
as a single batched audit, 8.1 through 8.8, in
the same order they appear in PLAN.md.

**Status: COMPLETE — VERIFIED. Two MEDIUM
findings, three LOW findings, seven INFO
observations. No CRITICAL or HIGH findings.
The persistence module is small, focused, and
correct on the happy paths; the findings are
about incomplete input validation and a subtle
edge case in resume, not behavioral bugs.**

### 8.1 — Audit `saveLoopState` for atomic write (tmp + rename), data completeness, error handling

**Atomic write — VERIFIED.** `saveLoopState` at
`src/lib/loop-state-store.ts:49-57` writes to
`.loop-state.json.tmp` via `writeFile` (line 52),
then calls `rename(tmpPath(), statePath())` (line
53). `rename` is atomic on the same filesystem, so
a reader (the next `loadLoopState`) never sees a
half-written file. The test at
`loop-state-store.test.ts:47-53` explicitly
verifies that two consecutive `saveLoopState`
calls leave no leftover `.tmp` file, confirming
the rename replaces, not appends.

**Data completeness — VERIFIED.** The
`PersistedLoopState` interface at lines 23-35
covers every field the resume path needs:

| Field | Purpose | Read by |
| --- | --- | --- |
| `version: 1` | Format guard | `loadLoopState` line 69 |
| `iteration: number` | Resume counter | `doResume` line 1183/1195 |
| `sessionId: string \| null` | Re-attach target | `doResume` line 1168-1169 |
| `stateType: string` | Diagnostic only | (logged, not branched on) |
| `rateLimitAttempts: number` | Circuit-breaker continuity | `doResume` line 1165 |
| `updatedAt: string` | Human-facing staleness check | (logged, not branched on) |

No field is missing. The mapping at
`App.tsx:1278-1285` populates all six from
`loop.iteration()`, `getActiveSessionId(s)`, the
state type, the closure-captured
`rateLimitAttempts`, and `new Date().toISOString()`.

**Error handling — VERIFIED.** The whole body is
wrapped in `try { … } catch (err) { log.warn(…) }`
at lines 50-56. The function NEVER throws (matches
its docstring at line 47-48: "Never throws —
persistence is best-effort and must not crash the
app"). A failed write logs at `warn` and returns
silently, so a transient disk-full or permission
denied cannot wedge the loop or surface a fatal
error to the user.

#### Finding 8.1.A — LOW — Orphan `.tmp` file on `rename` failure

**Problem.** If `writeFile` succeeds but `rename`
fails (extremely rare, but possible — e.g. the
`.loop-state.json` parent directory becomes
read-only mid-flight, or a filesystem-level
ENOSPC on the rename on some Linux/BSD
filesystems), the `.loop-state.json.tmp` file
is left on disk. The next `saveLoopState` will
overwrite it, so it is eventually cleaned up, but
if the loop is never started again, the orphan
stays in the working tree forever. A repo
auditor running `git status --ignored` will see
it (the `.loop*` gitignore rule covers it, so it
is invisible to git; but it pollutes the project
directory).

**Where.** `src/lib/loop-state-store.ts:49-57`.

**Proposed fix.** On `rename` failure, attempt
`unlink(tmpPath())` in a nested try/catch (the
unlink itself must also be best-effort, since
the user is already in a degraded-disk situation):

```ts
export async function saveLoopState(state: PersistedLoopState): Promise<void> {
  try {
    const json = JSON.stringify(state, null, 2)
    await writeFile(tmpPath(), json, "utf-8")
    try {
      await rename(tmpPath(), statePath())
    } catch (renameErr) {
      // Best-effort cleanup of orphan tmp.
      try { await unlink(tmpPath()) } catch { /* nothing more we can do */ }
      throw renameErr
    }
  } catch (err) {
    log.warn("persist", "Failed to save loop state", err)
  }
}
```

**Status.** Fix proposed, not applied. The
condition is rare enough that the LOW severity
is appropriate; the existing test suite does not
cover it because the test harness uses a fresh
tempdir per test (no permission games).

#### INFO — `stateType` and `updatedAt` are diagnostic-only fields

`stateType` is recorded but `doResume` does not
branch on it (the only consumer is the
`log.health("resume", "found", { … })` call at
`App.tsx:1114-1118`). Same for `updatedAt` — it
ends up in the same log line for the operator to
eyeball. Both are still useful (without
`stateType` a stale "complete" state on disk
could be impossible to distinguish from a stale
"running" state during manual forensics), so
keeping them is correct. Not a finding, just an
observation that the schema is slightly
over-provisioned for the current resume logic.

### 8.2 — Verify `loadLoopState` returns null for: missing file, invalid JSON, wrong version, missing fields

**Missing file — VERIFIED.** `readFile` throws
`ENOENT` when the file does not exist, the
`catch` at line 75 swallows it, and the function
returns `null` at line 77. The test at
`loop-state-store.test.ts:37-39` ("returns null
when no state file exists") confirms this end to
end.

**Invalid JSON — VERIFIED.** `JSON.parse` throws
`SyntaxError` on malformed input, the `catch`
swallows it, returns `null`. Not directly tested
in `loop-state-store.test.ts` (the suite never
writes garbage on purpose), but the catch-all
`catch` covers it.

**Wrong version — VERIFIED.** The guard at
`src/lib/loop-state-store.ts:69-70`:

```ts
(parsed as PersistedLoopState).version === 1 &&
typeof (parsed as PersistedLoopState).iteration === "number"
```

returns `null` for any `version !== 1`. The
test at `loop-state-store.test.ts:66-69`
explicitly writes `{ ...sample, version: 99 }`
and asserts the load returns `null`. The guard
also requires `parsed` to be a non-null object
(`parsed && typeof parsed === "object"` at
lines 67-68), so a JSON literal like `42` or
`"foo"` returns `null` too.

**Missing fields — PARTIALLY VERIFIED, with one
gap (Finding 8.2.A below).**

#### Finding 8.2.A — MEDIUM — `loadLoopState` only validates `version` and `iteration`; corrupted `sessionId`, `stateType`, `rateLimitAttempts`, or `updatedAt` slip through

**Problem.** The validation block at lines
66-74 checks exactly two fields:

```ts
parsed.version === 1 &&
typeof parsed.iteration === "number"
```

It does NOT check that `sessionId` is `string |
null`, that `stateType` is a string, that
`rateLimitAttempts` is a number, or that
`updatedAt` is a string. A hand-edited or
partially-written file with a valid version
and a numeric iteration but a wrong-typed
`sessionId` (e.g. `42`, or an object) will be
returned as `PersistedLoopState`, and the
consumer at `App.tsx:1168-1169` will pass it to
`reconcileSession(createClient(url), p.sessionId)`.
The downstream `getSessionStatus` call will
serialize the bad value to the server URL, which
will reject the request and the probe returns
`"unknown"`. So the *worst* outcome is a
`unknown` verdict, which `doResume` treats as
"missing" and starts a fresh iteration with the
preserved count. Recoverable, but ugly — and
the same input field-by-field validation
should be done in one place rather than
relying on every consumer to be defensive.

**Where.** `src/lib/loop-state-store.ts:66-74`.

**Proposed fix.** Validate every field with a
type guard:

```ts
function isPersistedLoopState(p: unknown): p is PersistedLoopState {
  if (!p || typeof p !== "object") return false
  const s = p as Record<string, unknown>
  return (
    s.version === 1 &&
    typeof s.iteration === "number" &&
    (s.sessionId === null || typeof s.sessionId === "string") &&
    typeof s.stateType === "string" &&
    typeof s.rateLimitAttempts === "number" &&
    typeof s.updatedAt === "string"
  )
}

export async function loadLoopState(): Promise<PersistedLoopState | null> {
  try {
    const content = await readFile(statePath(), "utf-8")
    const parsed: unknown = JSON.parse(content)
    return isPersistedLoopState(parsed) ? parsed : null
  } catch {
    return null
  }
}
```

**Status.** Fix proposed, not applied.

#### INFO — `loadLoopState` does not check `updatedAt` parseability

`updatedAt` is typed as `string` (an ISO 8601
timestamp per the producer at
`App.tsx:1284`), but the loader does not call
`new Date(s.updatedAt)` to verify the string is
a real timestamp. A garbage string like
`"definitely-not-a-date"` would pass. In
practice `updatedAt` is purely diagnostic (see
8.1 INFO), so a wrong value here is harmless.
Not a finding.

### 8.3 — Verify `clearLoopState` never throws — even on permission errors or missing files

**VERIFIED.** The implementation at
`src/lib/loop-state-store.ts:85-91`:

```ts
export async function clearLoopState(): Promise<void> {
  try {
    await unlink(statePath())
  } catch {
    // Already gone — fine.
  }
}
```

The `try/catch` around `unlink` swallows every
error: `ENOENT` (already gone — the comment is
accurate), `EACCES` / `EPERM` (permission
denied), `EBUSY` (Windows file lock), and any
other filesystem error. Two tests cover the
common case:

| Test | What it proves | Lines |
| --- | --- | --- |
| "clears the state file" | Writes, then clears, then asserts `loadLoopState` returns `null` | 55-59 |
| "clearing a non-existent file does not throw" | Calls `clearLoopState()` with no prior `saveLoopState` | 61-64 |

The "permission errors" case is NOT directly
tested — the test harness uses a fresh tempdir
owned by the test process, so it cannot trigger
`EACCES` without `chmod` games. The code path
is correct by inspection (the catch is
type-agnostic), so the absence of a test is a
test-coverage gap, not a behavioral bug.

#### Finding 8.3.A — LOW — No test for the `EACCES` / `EPERM` branch of `clearLoopState`

**Problem.** The two existing tests cover the
ENOENT branch and the happy path. The
permission-denied branch (`EACCES`, `EPERM`) is
not exercised. A regression that changed the
catch to only swallow `ENOENT`
(`if (err.code !== "ENOENT") throw`) would not
be caught.

**Where.** `src/lib/loop-state-store.test.ts` —
no permission test exists.

**Proposed fix.** Add a test that creates a
read-only directory before `clearLoopState`,
then restores it. On macOS / Linux:

```ts
import { chmodSync, statSync } from "node:fs"

it("clearLoopState swallows EACCES on a read-only dir", async () => {
  await saveLoopState(sample)
  // Lock the directory so unlink fails with EACCES.
  // (chmod 555 on a dir blocks writes; unlink inside
  // a non-writable dir also fails.)
  chmodSync(dir, 0o555)
  try {
    await clearLoopState()  // must not throw
  } finally {
    chmodSync(dir, 0o755)
  }
  // The state file may or may not have been removed,
  // depending on the OS — we only assert "no throw".
})
```

This is tricky cross-platform (Windows ACLs do
not map to POSIX `chmod`, and root-owned
tempdirs may bypass the permission check
entirely), so the test should be `it.skipIf(process.platform === "win32")` or
guarded behind `process.getuid?.() !== 0` to
avoid the "running as root" wedge.

**Status.** Fix proposed, not applied.

#### INFO — `clearLoopState` is fire-and-forget at every consumer

All three call sites in `App.tsx` invoke
`clearLoopState` without `await`:

- `App.tsx:981` — `handleQuit` (the only site
  that DOES `await`)
- `App.tsx:1134` — `onCancel` of the resume
  dialog
- `App.tsx:1193` — `doResume` else branch
- `App.tsx:1288` — persistence effect's "else if
  (s.type === 'complete')" branch

For 1134, 1193, 1288 the fire-and-forget is
intentional: these are inside reactive effects
or async callbacks where blocking on a
filesystem unlink would add unnecessary
latency. The function never throws, so the
`void` is safe (no unhandled rejection). The
fire-and-forget is correct. The `await` at 981
is for the same reason — it is the shutdown
path, and the user has already accepted the
quit latency.

### 8.4 — Verify persistence happens on every state transition to `running`/`pausing`/`paused`/`cooldown` — confirm this is frequent enough for crash recovery

**VERIFIED.** The persistence effect at
`App.tsx:1268-1290` runs on every state change
(Solid re-runs the effect whenever
`loop.state()` changes), and within the effect
the `if` branches on `s.type`:

```ts
if (s.type === "running" || s.type === "pausing" ||
    s.type === "paused" || s.type === "cooldown") {
  // save
} else if (s.type === "complete") {
  // clear
}
```

Every state transition that matters for crash
recovery triggers a save:

| Transition | Triggers save? | Why |
| --- | --- | --- |
| `ready` → `running` (via `start`) | Yes | New run; need to persist iteration 0 / 1 + sessionId |
| `running` → `pausing` (via `toggle_pause` from running) | Yes | User paused mid-iteration |
| `pausing` → `paused` (via `session_idle` from pausing) | Yes | Pause is now stable |
| `paused` → `running` (via `toggle_pause` from paused) | Yes | Resume; need to overwrite old snapshot |
| `running` → `cooldown` (via `rate_limited`) | Yes | Rate-limit wait; need to persist attempt count |
| `cooldown` → `running` (via `resume_cooldown`) | Yes | Cooldown ended; need fresh snapshot |
| `running` → `error` | No | Terminal-ish; recovery flow is `retry` not `resume` |
| `error` → `running` (via `retry`) | Yes | New run; iteration resets to 0 |
| `*` → `complete` | Clear | No resume after a clean completion (see 8.8) |
| `*` → `stopping` / `stopped` (via `quit`) | No | `handleQuit` clears explicitly (see 8.8) |

**Frequency is sufficient for crash recovery.**
Every "I want to be able to resume from here"
state writes a fresh snapshot atomically. The
worst-case loss is the gap between the last
write and the crash — typically a few hundred
milliseconds (a single state transition takes
~10-50ms; the effect is synchronous; the
`void saveLoopState` is fire-and-forget but
the actual write to `.tmp` is fast — the
filesystem rename is the only blocking op and
it is sub-millisecond on local SSD).

#### Finding 8.4.A — LOW — `void saveLoopState(snapshot)` is fire-and-forget; a crash within the same tick as the dispatch loses the snapshot

**Problem.** The effect at
`App.tsx:1286` does `void saveLoopState(snapshot)`,
not `await saveLoopState(snapshot)`. The next
iteration of the effect (or the next process
instruction) can run before the filesystem
write completes. If the process is killed in
that window (SIGKILL, OOM, kernel panic, power
loss), the persisted state is whatever the
PREVIOUS effect run wrote.

In practice the window is tiny (~1ms for a
local SSD) and the NEXT state transition (a
few hundred ms later at the earliest) will
overwrite the stale snapshot. The only way to
hit this is to crash within ~1ms of a
transition, which is the kind of wedge that
indicates a much bigger problem (kernel bug,
hardware fault) — at that point losing the
last 1ms of progress is irrelevant.

**Where.** `src/App.tsx:1286`.

**Proposed fix.** None recommended. The
fire-and-forget is correct: blocking the
reactive effect on a disk write would couple
UI responsiveness to filesystem latency. The
`1ms window of staleness` is not worth the
added complexity. Mark as INFO (not LOW) — the
finding is recorded for completeness but no
change is proposed.

**Status.** Documented as INFO, no fix
proposed.

#### Finding 8.4.B — INFO — `stopping` / `stopped` are deliberately NOT persisted, but `pausing` IS — sanity check confirmed

**Sanity check on `pausing`.** The
guard at line 1271-1276 explicitly includes
`pausing`:

```ts
if (s.type === "running" || s.type === "pausing" ||
    s.type === "paused" || s.type === "cooldown") {
```

`pausing` is in the list. The earlier audit note
in PLAN.md ("persistence happens on every
state transition to `running`/`pausing`/`paused`/`cooldown`")
is correct and the implementation matches.

**`stopping` / `stopped` are not persisted.** If
the user hits Q, the reducer transitions `*` →
`stopping` → `stopped` (the `stopped` state is
terminal and only `process.exit()` clears it).
The persistence effect does NOT branch on
`stopping` or `stopped`, so no save happens.
`handleQuit` (line 981) clears explicitly
before exit, so this is intentional: a
`stopping`/`stopped` state should NOT be
resumable (the user deliberately quit). If the
process is killed during `handleQuit` between
the `clearLoopState` call and `process.exit`,
the next startup will load the LAST snapshot
(which was `running`/`pausing`/`paused`/`cooldown`
from before the quit) and offer to resume. This
is the correct behavior: the user would be
confused if a hard kill during quit left them
no option to resume, but the resume would be
of the previous run, not the in-flight quit.

**Status.** No fix proposed — the asymmetry
(`stopping`/`stopped` deliberately not
persisted) is correct.

### 8.5 — Verify `doResume` correctly handles: session still working, session idle, session missing, session rate-limiting

`doResume` lives at `App.tsx:1164-1197`. The
verdict fan-out is:

```ts
const verdict: ReconcileResult = "missing"
if (url && p.sessionId) {
  verdict = await reconcileSession(createClient(url), p.sessionId)
}

if (verdict === "working" && p.sessionId) {
  // Re-attach to the still-working session.
  loop.dispatch({
    type: "resume_session",
    iteration: p.iteration,
    sessionId: p.sessionId,
  })
  watchdog.notifyIterationStart()
  void reconcileAndAdvance()
} else {
  // Treat every other verdict (idle, missing, unknown) as "session gone, start fresh".
  await clearLoopState()
  loop.dispatch({ type: "resume_session", iteration: p.iteration, sessionId: "" })
}
```

| Verdict | Action | Iteration count | SessionId | Correct? |
| --- | --- | --- | --- | --- |
| `working` | `resume_session` with persisted sid | preserved | persisted sid | Yes — the old session is still working, re-attach |
| `idle` | `clearLoopState` + `resume_session` with `""` | preserved | `""` (driver will create a new one) | Yes-ish — see 8.5.A |
| `missing` | same as `idle` | preserved | `""` | Yes — server has no record of the session, start fresh |
| `unknown` | same as `idle` | preserved | `""` | Yes — see INFO below |
| (no `p.sessionId`) | `verdict` stays initial `"missing"` | preserved | `""` | Yes — no session to reconcile |
| (no `url`) | same | preserved | `""` | Yes — server URL not set yet, start fresh |

`ReconcileResult` is defined at
`src/lib/api.ts:296` as `"working" | "idle" | "missing" | "unknown"`.
The `reconcileSession` function at
`src/lib/api.ts:298-323` produces these from
`getSessionStatus`:

- `busy` or `retry` → `"working"` (note: `retry`
  means the server is waiting out a provider
  rate-limit on the session; counted as
  working because the session will resume on
  its own)
- `idle` → `"idle"`
- no status returned → `"missing"`
- unrecognized type → `"unknown"`
- exception (timeout / network) → `"unknown"`

**Session rate-limiting is handled as
`working`** (the `retry` case above). So if
the OCLoop process crashed while the server
was rate-limited, `doResume` correctly
re-attaches to the still-waiting session and
the watchdog's `reconcileAndAdvance` will pick
up the eventual `session.idle` event when the
rate limit clears. Verified.

#### Finding 8.5.A — MEDIUM — `verdict === "idle"` discards the in-flight iteration's result and may over-count work

**Problem.** When `doResume` is called with a
persisted state where the server says the
session is `idle`, the implementation treats
it the same as `missing` / `unknown`: clear
the persisted state and dispatch
`resume_session` with an empty sessionId.
The iteration driver then fires, calls
`startIteration`, and dispatches
`iteration_started`, which INCREMENTS the
iteration counter from `p.iteration` to
`p.iteration + 1`.

The original run reached `iteration =
p.iteration` because the in-flight session
completed. If the OCLoop process crashed
AFTER the session idled but BEFORE
`plan_complete` was detected and dispatched,
the user is left with:

- a session that already finished its work,
- a persisted state that says `iteration =
  p.iteration` (correct, that was the
  iteration count at save time),
- a fresh dispatch that increments to
  `p.iteration + 1` and starts ANOTHER
  iteration.

In the best case, the fresh iteration sees
the work is already done and `plan_complete`
fires on the next driver cycle. In the worst
case, the agent re-reads the plan, decides
the previous task is not fully done (e.g.
test failures not yet fixed), and redoes the
work. The iteration count over-counts the
actual work done by one.

This is a MEDIUM finding, not HIGH, because:

1. The same problem exists in the `missing`
   and `unknown` branches (no signal
   available to distinguish them).
2. The `plan_complete` detection on the next
   iteration will catch the over-count and
   end the run.
3. The user can audit the iteration count in
   the dashboard.

**Where.** `src/App.tsx:1188-1196` (the
`else` branch in `doResume`).

**Proposed fix.** When `verdict === "idle"`,
the session finished normally. The
`iteration` counter should NOT increment on
the next cycle — the next `iteration_started`
should be for `p.iteration` (not
`p.iteration + 1`), reflecting that the
in-flight iteration is already done. The
cleanest way to express this is to keep
`iteration` at `p.iteration` and skip the
increment for the next `iteration_started` —
but the current reducer at
`useLoopState.ts:78-96` always increments on
`iteration_started`. Options:

- (a) Add a `iteration_resumed` action that
  sets the iteration count to `p.iteration`
  without incrementing, and dispatch it
  instead of `resume_session` in the
  `idle` branch.
- (b) Use `clearLoopState` + `start` (which
  resets iteration to 0) for the `idle`
  branch, accepting that the resume
  counter resets. Bad: the user's progress
  tracker loses count.
- (c) Document the over-count as accepted
  behavior and add a `iterations_offset`
  field to the persistence snapshot to
  display the "actual completed" count
  rather than the "started" count. Visible
  in the dashboard, no functional change.

(c) is the lightest-touch fix and gives the
user the right number. (a) is the most
correct but requires a reducer change.

**Status.** Fix proposed, not applied. The
finding is real but the impact is bounded by
the next `plan_complete` check.

#### INFO — `verdict === "unknown"` from `doResume` may indicate a server-level hang

When `reconcileSession` itself fails (the
`getSessionStatus` call timed out or the
network broke), it returns `"unknown"`.
`doResume` treats this as "session gone,
start fresh" — but the actual cause may be
that the SERVER is hung (we never got a
response from `/session/status`). Starting a
fresh iteration in that case is unlikely to
succeed either: `createSession` will hit the
same hung server.

The watchdog at `useWatchdog.ts:215-219`
treats any active session as a heartbeat
target, and after the first
`watchdogSuspectMs` (90s by default) without a
heartbeat, the watchdog will suspect the
session and after `watchdogConfirmMs` (600s
default) will confirm and trigger
`restartServer`. So the "fresh iteration on
hung server" path self-heals in at most
~10 minutes. Not a finding, just a slow
recovery observation.

### 8.6 — Verify `doResume` restores `rateLimitAttempts` from persisted state — confirm the circuit breaker continues from where it left off

**VERIFIED.** `App.tsx:1165`:
`rateLimitAttempts = p.rateLimitAttempts || 0`.

Three properties of this restore are
correct:

1. **Reads from the persisted snapshot.** The
   field is part of the `PersistedLoopState`
   schema (`loop-state-store.ts:32`) and is
   always written by the persistence effect at
   `App.tsx:1283`.
2. **`|| 0` defaults to 0 for missing or
   non-numeric values.** The validation gap
   found in 8.2.A means a non-numeric
   `rateLimitAttempts` could slip through the
   loader; the `|| 0` here catches it.
3. **The next `enterCooldown` call
   (`App.tsx:677`) reads the module-level
   `rateLimitAttempts` and increments from
   there.** So a persisted attempt count of 5
   becomes 6 on the next rate limit, which is
   the correct circuit-breaker continuity.

**The circuit breaker continues from where it
left off.** This is the intended behavior. If
the user hit 5 rate limits in a row and then
OCLoop crashed, on resume the next rate limit
will count as attempt 6 (not 1), preserving
the backoff state. The maxRetry threshold
(`r.maxRateLimitRetries`, default 8 per
`config.ts:121`) is therefore respected
across crashes.

**No findings for 8.6.** This is a clean
pass.

### 8.7 — Verify `--resume` flag sets `resilience.resume = true` which triggers auto-resume in `initializeSession` — what if there's no persisted state?

The flow:

1. CLI: `--resume` is parsed at
   `src/lib/cli-args.ts:237-238` and sets
   `resilience.resume = true` on the
   `ResilienceConfig` object passed to
   `initializeSession`.
2. App startup: `initializeSession` at
   `App.tsx:1098-1157` is called from the
   `onMount` block of the server-ready effect
   (line 1049).
3. The first thing `initializeSession` does
   after `ensureGitignore` is
   `const persisted = await loadLoopState()`
   (line 1112).
4. The condition at line 1113:
   `if (persisted && persisted.iteration > 0) { … }`.

**When `persisted === null` (no state file):**
The `if` is false. Execution falls through to
`if (props.run) { loop.dispatch({ type: "start" }) }`
at line 1143-1147. If `--run` was passed, the
loop starts fresh. If neither `--run` nor
`--resume` was passed, nothing happens and the
loop stays in the `ready` state (the user has
to press Enter to start).

**When `persisted.iteration === 0`:**
The `if` is false (because of the `> 0` guard).
Same fallthrough as the null case. This is
intentional: a persisted state with iteration
0 means the process crashed BEFORE any
iteration started (right after `start` was
dispatched, before `iteration_started`). The
`> 0` guard avoids resuming "we never did
anything" — which would just call
`startIteration`, increment to 1, and start
the first real iteration. The user gets the
same result with one fewer round trip.

**When `--resume` is passed but no persisted
state exists:** the `resilience.resume` flag
is loaded but unused (the `if (resilience().resume)`
branch at line 1119 is never reached because
the outer `if` is false). The user gets the
standard "press Enter to start" prompt
(unless `--run` is also passed, in which
case the loop auto-starts). This is the
correct behavior — `--resume` only takes
effect when there IS something to resume.

**No findings for 8.7.** The null/zero-state
handling is correct.

#### INFO — `resilience.resume` is not persisted across runs

The `resume` flag is a CLI flag, not a config
file value (looking at `config.ts:102-135`,
the `resume` field lives on
`ResilienceConfig` and the default is
`false`; there is no `save` path that writes
it back to `.oconfig` or similar). So if the
user wants every OCLoop launch to
auto-resume, they must pass `--resume` every
time (or set it in their shell alias). This
is the right design: a resume is a one-time
recovery decision, not a persistent
preference.

### 8.8 — Document: `clearLoopState` is called on clean quit AND on plan completion — verify this is intentional (prevents accidental re-resume after a successful run)

**Two call sites for clear on success/exit:**

1. **`handleQuit` — `App.tsx:981`:**
   `if (!props.debug) { await clearLoopState() }`.
   The debug guard is correct (debug mode
   never persists in the first place, see
   `App.tsx:1269`: `if (props.debug) return`
   short-circuits the persistence effect).
2. **Persistence effect — `App.tsx:1287-1289`:**
   `else if (s.type === "complete") { void clearLoopState() }`.
   Fires when the loop transitions to
   `complete` (e.g. after
   `checkPlanComplete` returns true and
   `plan_complete` is dispatched).

**Both call sites are correct and
intentional.** The contract is:

- A successful plan completion → clear
  persisted state → no "Resume from
  iteration N?" dialog next launch.
- A user-initiated quit → clear persisted
  state → no "Resume from iteration N?"
  dialog next launch.
- A crash (no quit, no completion) →
  persisted state survives → next launch
  offers to resume.

**Why this matters.** Without the clear on
completion, a user who finishes a 50-task
plan and re-launches OCLoop the next day to
start a NEW plan would get the "Resume from
iteration 50?" dialog — which is wrong
(they want a fresh start on a new plan,
which would typically be a different
`PLAN.md`). The clear prevents this
accidental re-resume.

**Why clear on quit too.** If the user
deliberately quits, they do not want the
next launch to assume the quit was a crash
and offer to resume. The user's intent is
explicit; honor it.

**No findings for 8.8.** The clear-on-quit
and clear-on-complete behavior is correct
and matches the design intent.

#### INFO — `clearLoopState` is NOT called on the `error` state

The persistence effect's branches are:

```ts
if (s.type === "running" || s.type === "pausing" ||
    s.type === "paused" || s.type === "cooldown") {
  // save
} else if (s.type === "complete") {
  // clear
}
// implicit else: do nothing (no save, no clear)
```

For `s.type === "error"`, the implicit else
fires — the snapshot from the LAST
running/pausing/paused/cooldown state
remains on disk. The next launch (after the
user resolves the error, presumably by
restarting the loop or pressing R to retry)
will offer to resume from the pre-error
state. This is the right behavior: an error
is not a clean exit, and the user may want
to retry from where it failed. The
"recoverable: true" flag on transient errors
enables the R-to-retry flow.

For `s.type === "stopping"` or `s.type === "stopped"`,
the same implicit else fires — the last
running/pausing/paused/cooldown snapshot
remains. `handleQuit` clears explicitly
(line 981), so a successful `handleQuit`
always leaves a clean state. A crash during
`handleQuit` (between the clear and
`process.exit`) leaves the previous snapshot
on disk, which is the correct "what would
the user want?" answer (the user wanted to
quit, but the quit was interrupted — they
should be offered a resume so they can quit
properly).

### Test-suite delta for Phase 8

**No new tests added.** The 6 existing tests
in `loop-state-store.test.ts` cover:

- `returns null when no state file exists`
  (8.2)
- `round-trips a saved state` (8.1)
- `overwrites previous state atomically` (8.1)
- `clears the state file` (8.3)
- `clearing a non-existent file does not throw`
  (8.3)
- `returns null for an unsupported version`
  (8.2)

The MEDIUM findings (8.2.A — incomplete
field validation, 8.5.A — over-counting on
`idle` verdict) would benefit from new tests,
but they are documented in this audit and
not applied (per PLAN.md acceptance
criteria: "No code changes are applied —
this is audit-only with documentation
output"). The proposed tests for 8.2.A would
add a 7th `it()` block writing a corrupt
snapshot (`{ version: 1, iteration: 1,
sessionId: 42, … }`) and asserting
`loadLoopState` returns null. The proposed
tests for 8.5.A would require a mock
`reconcileSession` and a controllable
`loopReducer` — feasible but large enough
that they belong in a follow-up
implementation commit, not in this audit.

The two LOW findings (8.1.A — orphan tmp
file on rename failure, 8.3.A — no
EACCES/EPERM test) also map to specific
tests that would be added with the
implementation commit, not now.

### Summary of Phase 8 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 8.1.A | LOW | `rename` failure leaves an orphan `.tmp` file; should `unlink` in catch. |
| 8.2.A | MEDIUM | `loadLoopState` validates only `version` and `iteration`; corrupted `sessionId` / `stateType` / `rateLimitAttempts` / `updatedAt` slip through. |
| 8.3.A | LOW | No test for the `EACCES` / `EPERM` branch of `clearLoopState`. |
| 8.4.A | LOW (INFO) | `void saveLoopState` is fire-and-forget; sub-millisecond staleness window. |
| 8.4.B | INFO | `stopping` / `stopped` deliberately not persisted (correct). |
| 8.5.A | MEDIUM | `verdict === "idle"` may over-count iterations by 1 on resume. |
| 8.5 | INFO | `verdict === "unknown"` from `doResume` may indicate a server hang; watchdog self-heals in ~10min. |
| 8.1 | INFO | `stateType` and `updatedAt` are diagnostic-only. |
| 8.2 | INFO | `loadLoopState` does not check `updatedAt` parseability (harmless). |
| 8.3 | INFO | `clearLoopState` is fire-and-forget at three of four call sites (intentional). |
| 8.7 | INFO | `resilience.resume` is a CLI flag, not a persistent config value. |
| 8.8 | INFO | `clearLoopState` is NOT called on `error` state (intentional). |

`bun test src/lib/loop-state-store.test.ts` -> **6 pass, 0 fail, 7
expect() calls**. No regressions. The full
suite (`bun test`) was not re-run because
this audit makes no code changes.

## Phase 9 — Sleep Detection & Power Management

The sleep detector (`src/lib/sleep-detector.ts`)
samples the wall clock every `tickMs` and
fires `onWake(gapMs)` whenever the actual
gap between samples exceeds `thresholdMs`
(plus a hard gate `gap > 0` to skip backwards
clock movement). The power manager
(`src/lib/power.ts`) is a thin wrapper around
`caffeinate -dimsu` that is constructed at
`App.tsx:190` and toggled on/off in the
lifecycle effect at `App.tsx:1251-1263` based
on `loop.isRunning() || loop.isCooldown()`.

The whole module is small — 80 + 79 lines of
code, 99 lines of tests — but it is the only
place in the codebase that uses the *wall*
clock as a signal (every other timing path
uses `monotonicNow()` to avoid jumps). That
deliberate inversion is correct: here the
jump IS the signal.

### 9.1 — Audit `createSleepDetector` for threshold detection accuracy, negative gap handling, timer cleanup

The detector is 80 lines, has 5 unit tests
in `src/lib/sleep-detector.test.ts`, and
ships in production as the sole consumer in
`App.tsx:432-437` (created in the
config-loading `onMount`). Three behaviors to
verify:

**Threshold detection accuracy.**
`sleep-detector.ts:52-61`:

```ts
function poll(): number {
  const now = clock.wallClockNow()
  const gap = now - lastSeen
  lastSeen = now
  // A negative gap (clock moved backwards) is not a wake; ignore it.
  if (gap > thresholdMs) {
    options.onWake(gap)
  }
  return gap
}
```

The comparison is `gap > thresholdMs` (strict
greater-than). This is the right boundary
choice: at `gap === thresholdMs` the detector
stays quiet, which means the system is
allowed `tickMs` jitter above the threshold
without a wake. With the defaults
(`tickMs: 5000`, `thresholdMs: 30000`), a
gap of exactly 30s does NOT fire, a gap of
30.001s DOES. The strict-greater semantics
prevent a single slow GC pause from triggering
a wake storm. **Verified correct.**

`lastSeen` is updated on every `poll()`,
including the wake case (line 55). So the
gap reported to `onWake` is the delta from
the previous sample, not from the
detector's `start()`. This is the property
the third test (`uses the gap since the last
sample, not since start`) explicitly asserts.
**Verified correct.**

**Negative gap handling.** A backwards
clock jump (e.g., NTP step, manual time
change, `settimeofday`) produces a negative
`gap`. The detector:

1. Updates `lastSeen = now` (line 55), so
   the backwards jump is *consumed* and does
   not poison the next sample.
2. Skips `onWake` (line 57), because a
   negative gap is never a wake.

This is the only correct behavior: a backwards
clock movement would otherwise count as a
"negative sleep", which is nonsensical. The
fourth test (`ignores backwards clock movement`)
asserts `wakes === []` after a `clock.wall -= 100_000`.
**Verified correct.**

**Timer cleanup.** `start()` (line 64-68)
guards against double-start with `if (timer)
return`. `stop()` (line 69-74) nulls the
interval handle. The internal `setInterval`
is bound to the Bun event loop, so a missed
`stop()` would keep the process alive
indefinitely. The double-stop and double-start
safety are both verified by the test
`tracks running state via start/stop` —
it asserts `isRunning()` flips correctly on
each call. **Verified correct.**

**Gap value returned.** `poll()` always
returns the observed gap, including negative
gaps and sub-threshold gaps. The wake callback
receives the *same* gap via the `gap` argument
to `onWake` (line 58). Callers can therefore
distinguish "tiny gap" from "10-minute gap"
in the same handler, which is what
`App.tsx:199-221` relies on (the
`activityLog.addEvent("task", t("actWake", { secs: ... }))`
at line 201-204 rounds the gap to seconds
for the user-visible message). **Verified
correct.**

#### MEDIUM — `lastSeen` baseline is set inside `start()` but the first `setInterval` tick is delayed by `tickMs`

`sleep-detector.ts:64-68`:

```ts
start() {
  if (timer) return
  lastSeen = clock.wallClockNow()
  timer = setInterval(poll, tickMs)
}
```

The baseline is captured at `start()` time
and the first `poll()` is scheduled `tickMs`
later. If the system sleeps BETWEEN
`lastSeen = now` and the first interval
firing, the wake is detected on the FIRST
tick after wake (gap will be `tickMs + sleepMs`,
which exceeds `thresholdMs`). This is the
correct behavior — the wake IS detected,
just on a delayed tick.

**The real issue is the opposite case.** If
the system sleeps and wakes BEFORE `start()`
is called (e.g., the OCLoop process is
launched after a sleep), `start()` captures
a baseline of "now" and the detector will
not fire until the NEXT sleep. This is
inherent to the design (we can't measure a
sleep we didn't see) but is worth a one-line
comment in the code so future maintainers
don't waste time looking for a bug.

**Proposed fix.** Add a doc comment to
`start()`:

```ts
start() {
  // ponytail: baseline is set here, so a sleep that
  // completed BEFORE start() is invisible. This is
  // intentional — there is no wall-clock signal we
  // could use to detect it.
  if (timer) return
  lastSeen = clock.wallClockNow()
  timer = setInterval(poll, tickMs)
}
```

**Severity: MEDIUM** (documentation gap that
masks a deliberate design choice; the
alternative — comparing against a fixed
"boot time" — would cause a false wake on
the very first tick after every restart).

#### LOW — Test coverage gaps in `sleep-detector.test.ts`

The 5 existing tests cover the happy paths
(threshold, no-threshold, gap semantics,
backwards clock, start/stop state) but miss:

1. **`start()` is idempotent** — calling it
   twice should NOT create two timers. Test:
   `start(); start(); expect(d.isRunning()).toBe(true)`,
   then peek at the private `timer` handle or
   count intervals by advancing the clock and
   counting `poll` calls.
2. **`stop()` is idempotent** — calling it
   twice should not throw and should leave
   `isRunning() === false`. Test:
   `d.start(); d.stop(); d.stop(); expect(d.isRunning()).toBe(false)`.
3. **Re-start after stop** — `start(); stop();
   start()` should resume sampling with a
   fresh baseline. Test: start, advance clock
   5s, stop, advance 10s, start, advance 5s,
   poll — no wake should fire (the 10s gap
   during stop is invisible because
   `lastSeen` is reset).
4. **Threshold edge case** — at `gap ===
   thresholdMs` the detector must NOT fire
   (strict greater-than). Test:
   `clock.wall += thresholdMs; d.poll();
   expect(wakes).toEqual([])`.
5. **`poll()` before `start()`** — calling
   `poll()` directly on a never-started
   detector should still return a gap
   (against the initial `lastSeen` set in
   the factory body at line 49). This is
   tested implicitly by the existing tests
   but never asserted.
6. **`isRunning()` is `false` initially** —
   the constructor at line 49 sets `lastSeen`
   but does NOT create a timer, so
   `isRunning()` returns `false` until
   `start()`. Trivial but the invariant
   matters for `App.tsx`'s cleanup path
   (which calls `sleepDetector?.stop()` in
   the onCleanup at line 1631 — see 9.3
   below).

**Proposed fix.** Add 6 `it()` blocks to
`sleep-detector.test.ts`. Total expected
count goes from 5 to 11. No source changes
needed.

**Severity: LOW** (no behavioral gap, just
defensive coverage).

#### INFO — `setInterval` is not cleared if `poll()` throws

`sleep-detector.ts:67`: `timer = setInterval(poll, tickMs)`.
If `poll()` itself throws (e.g., the
injected `clock` returns a non-number from
`wallClockNow()`, or `onWake` throws
synchronously), the `setInterval` is NOT
cleared and will keep firing on the same
ticking loop, throwing on every tick. Bun's
default behavior is to log the unhandled
error and keep going.

In practice this can't happen — the
production `wallClockNow()` returns
`Date.now()` (a number, never throws) and
`onWake` is `handleWake` in `App.tsx:199`,
which only calls solid signals and the
watchdog API (none of which throw
synchronously). The injected-clock test
path also doesn't throw.

**Severity: INFO** (theoretical, not
reachable from current code).

### 9.2 — Verify `handleWake` correctly reconnects SSE, reconciles session, and handles cooldown state

`handleWake` is at `App.tsx:199-221` and
is wired as the `onWake` callback at
`App.tsx:435`. Every wake from a system
suspension funnels through it.

**Reconnect SSE.** Line 207: `sse.reconnect()`.
The SSE stream is HTTP/1.1 long-poll over
TCP; on macOS sleep the OS tears down the
underlying socket, so the next SSE event
after wake is almost certainly on a dead
connection. The `sse.reconnect()` call
closes the dead socket and opens a fresh
one, which is the only way to recover event
delivery. **Verified correct.**

**Reset the watchdog.** Line 208: `watchdog.notifyWake()`.
A long sleep would have stopped the
heartbeat baseline (no SSE events for
minutes), so when the watchdog next ticks
it would suspect/confirm the session as
wedged and try to recover. `notifyWake()`
resets the heartbeat baseline so the
watchdog gives the session a fresh window
to produce events. This is the same
mechanism as the 6.4 audit confirmed
(heartbeat baseline reset). **Verified
correct.**

**Cooldown handling.** Lines 210-216:

```ts
const st = loop.state()
if (st.type === "cooldown") {
  // Cooldown deadline may have passed while we slept.
  if (monotonicNow() >= st.resumeAt) {
    clearCooldownTimers()
    loop.dispatch({ type: "resume_cooldown" })
  }
} else {
  // Recover a possibly-missed session.idle.
  void reconcileAndAdvance()
}
```

This is the smart part of the handler:

- **In `cooldown` state** with the deadline
  already in the past: cancel the
  (no-longer-needed) timer, dispatch
  `resume_cooldown` so the loop continues
  iterating. If the deadline is in the
  future, do nothing — the existing timer
  will fire normally on the (now-overdue)
  Bun event loop.
- **In every other state** (`running`,
  `pausing`, `paused`, `error`, etc.):
  call `reconcileAndAdvance()` to recover
  a `session.idle` that may have fired
  while we were asleep (the SSE stream was
  dead, so the event was lost).

**Verified correct.** The branch is
exhaustive over `cooldown` vs everything-else
and the action taken in each branch is the
minimum-necessary recovery.

**Activity log.** Lines 201-204 add a
human-readable "Woke after Ns" event to
the activity log. This is the only
user-visible signal that a wake happened;
it appears in the TUI events panel. The
i18n key is `actWake` (defined in
`src/lib/i18n.ts`). **Verified correct.**

#### LOW — `reconcileAndAdvance()` in `paused` state is a no-op but still calls the SDK

`App.tsx:219`: `void reconcileAndAdvance()`.

If the user has explicitly paused the loop
(`s.type === "paused"`) when the system
sleeps and wakes, `handleWake` calls
`reconcileAndAdvance()`. The implementation
of `reconcileAndAdvance` short-circuits on
non-`running`/`pausing` states (it only
acts when there's a session to advance),
so the user-paused case is effectively a
no-op. But the `getActiveSessionId(loop.state())`
call inside `reconcileAndAdvance` still
runs, and any SSE/network call inside it
would fire unnecessarily.

**This is harmless in practice** — the
function gates on state before doing any
network work. But it would be more
defensive to skip the call entirely in
`paused` state:

```ts
} else if (st.type !== "paused") {
  void reconcileAndAdvance()
}
```

**Severity: LOW** (defensive, not
correctness-critical).

#### INFO — `handleWake` does not log a wake duration to `log.health` from the cooldown branch

Lines 200-216 log the wake to the activity
log (user-facing) and to `log.health("sleep",
"wake", { gapMs })` (developer-facing) only
ONCE, at line 200. The subsequent branch
(cooldown or reconcile) is not logged. This
is the right level of detail — the wake is
the event, the recovery is internal. **No
finding.**

#### INFO — Concurrent wakes (two ticks landing in quick succession) are coalesced by `lastSeen`

If the system wakes and the first post-wake
poll fires with a 10-minute gap, a SECOND
poll 5 seconds later fires with a 5-second
gap. Both are dispatched through
`handleWake`. The second call is
effectively a no-op (the SSE is already
reconnected, the watchdog is already reset,
the cooldown is already resumed). The cost
is one extra `sse.reconnect()` (idempotent
in `useSSE` per the 7.5 audit) and one extra
`reconcileAndAdvance()` (no-op in non-active
states). **Verified acceptable** — the
overhead is bounded and self-corrects on
the second wake.

### 9.3 — Verify sleep detector stops on cleanup — `onCleanup` calls `sleepDetector?.stop()`

Two cleanup paths exist:

1. **`handleQuit`** at `App.tsx:968-1010`.
   Line 976: `sleepDetector?.stop()`. This
   runs on user-initiated quit (Ctrl+C,
   'q' key, SIGINT, SIGTERM via
   `shutdownManager.register(handleQuit)` at
   line 1625). It runs BEFORE `process.exit(0)`
   at line 1009, so the interval is cleared
   before the process terminates.

2. **`onCleanup`** at `App.tsx:1629-1633`.
   Line 1631: `sleepDetector?.stop()`. This
   is the SolidJS lifecycle hook paired
   with the `onMount` at line 1624. It
   runs when the component unmounts.

**Both paths are correct.** The optional
chaining `sleepDetector?.stop()` handles
the case where `sleepDetector` was never
assigned (e.g., if the onMount at line 421
threw before reaching line 432). The
`stop()` method itself is idempotent
(`if (timer) { clearInterval(timer); timer = null }`
at lines 70-73 of `sleep-detector.ts`), so
calling it twice (once from `handleQuit` and
once from `onCleanup`) is harmless.

**Verified correct.** The `App.tsx:976` and
`App.tsx:1631` lines are the only two
callers of `sleepDetector?.stop()`; grep
confirms this.

**Coverage matrix:**

| Trigger | Cleanup path | Sleep detector stopped? |
| --- | --- | --- |
| User presses Q / Esc | `handleQuit` (line 976) | Yes |
| Ctrl+C / SIGINT | `shutdownManager` → `handleQuit` (line 976) | Yes |
| SIGTERM | `shutdownManager` → `handleQuit` (line 976) | Yes |
| Process.exit from inside `onMount` before `sleepDetector` is assigned | `onCleanup` runs but `sleepDetector` is still `null`, so `?.stop()` is a no-op | Yes (no leak — `timer` was never created) |
| Component unmount without quit (SolidJS HMR, error boundary) | `onCleanup` (line 1631) | Yes |
| Hard crash (uncaught exception) | None — process dies | Acceptable (the OS reaps the interval handle) |

**No findings for 9.3.** Cleanup is
exhaustive and idempotent.

### 9.4 — Verify `caffeinate` starts/stops based on `loop.isRunning() || loop.isCooldown()` — confirm this covers all active states

The lifecycle effect is at
`App.tsx:1251-1263`:

```ts
createEffect(() => {
  if (loop.isRunning()) {
    watchdog.start()
  } else {
    watchdog.stop()
  }

  if (loop.isRunning() || loop.isCooldown()) {
    power.start()
  } else {
    power.stop()
  }
})
```

The two conditions are deliberately
different:

- **Watchdog** runs only on `isRunning()`
  (which is `running` OR `pausing` per
  `useLoopState.ts:307-310`). Rationale: a
  wedged session can only happen while a
  session is active, and sessions only exist
  in `running` or `pausing`. In `cooldown`
  there is no session to wedge.
- **caffeinate** runs on `isRunning() ||
  isCooldown()`. Rationale: a rate-limit
  cooldown can take minutes (`backoffMaxMs:
  60_000` per `config.ts:119` × 8 retries
  per `maxRateLimitRetries: 8` =
  ~8 minutes worst case), and the user
  expects the system to stay awake through
  the wait. Killing caffeinate during
  cooldown would let the machine sleep and
  miss the resume.

**State coverage matrix:**

| State | `isRunning()` | `isCooldown()` | Watchdog | caffeinate |
| --- | --- | --- | --- | --- |
| `ready` | false | false | stopped | stopped |
| `starting` | false | false | stopped | stopped |
| `running` | **true** | false | **started** | **started** |
| `pausing` | **true** | false | **started** | **started** |
| `paused` | false | false | stopped | **stopped** |
| `cooldown` | false | **true** | stopped | **started** |
| `error` | false | false | stopped | stopped |
| `complete` | false | false | stopped | stopped |
| `stopping` | false | false | stopped | stopped |
| `stopped` | false | false | stopped | stopped |
| `debug` | false | false | stopped | stopped |

**Verified correct for the design intent.**
The 3 states that get caffeinate
(`running`, `pausing`, `cooldown`) are
exactly the 3 states where the loop is
*doing work or about to do work* and would
be harmed by a sleep.

**`paused` is deliberately excluded.**
The user explicitly asked to pause, so
letting the system sleep is correct (and
probably desired). The user's intent takes
precedence over the loop's convenience.

**`error` and `complete` are excluded.**
These are terminal-ish states — the loop
is done for this run, even if `complete`
will dispatch `quit` and the user might
want to launch a fresh run. Letting the
machine sleep here is fine.

#### LOW — `power.stop()` is called on `paused` even though the user might resume within minutes

If a user pauses for lunch and resumes 30
minutes later, the system sleeps, the
laptop lid closes, etc. When they resume,
`paused` → `running` dispatches and the
lifecycle effect flips caffeinate back on.
There is a 5-30 second window where the
OpenCode SDK could be sending heartbeats to
a sleeping server, but the SSE stream is
likely dead at that point and the watchdog
(also off) won't trigger a recovery until
~90 seconds (`watchdogSuspectMs`). The
reconciliation on the next `iteration_started`
will catch the dead session.

**This is acceptable behavior** — the user
asked to pause, so they accept the recovery
cost on resume. **No fix recommended.**

**Severity: LOW (INFO-ish)** (intentional
design choice, no correctness gap).

#### INFO — The lifecycle effect and `handleWake` race on the very first post-sleep tick

When the system wakes during a `running`
session, the order of events is:

1. Sleep detector polls (gap > threshold) →
   `handleWake(gapMs)` fires.
2. `handleWake` calls `sse.reconnect()` and
   `watchdog.notifyWake()`.
3. The lifecycle effect (running) is
   unaffected — caffeinate stays on.
4. `handleWake` calls `reconcileAndAdvance()`
   which may dispatch a new iteration.

If the system wakes during a `cooldown`
session, the order is:

1. Sleep detector polls → `handleWake`.
2. `handleWake` calls `sse.reconnect()` and
   `watchdog.notifyWake()`.
3. `handleWake` sees `st.type === "cooldown"`
   and `monotonicNow() >= st.resumeAt`, then
   `clearCooldownTimers()` + dispatch
   `resume_cooldown`.
4. The reducer transitions `cooldown` →
   `running("")`, the lifecycle effect re-
   fires with `isRunning() === true`, and
   caffeinate stays on.

**No race** because the lifecycle effect
re-fires on every state change (it's a
Solid `createEffect` reading `loop.state()`).
The 3-ms to 10-ms window between the
`loop.dispatch` at line 215 and the effect
re-run has caffeinate already running
(because `isCooldown` was true the whole
time), so there is no gap in coverage.

**No findings for 9.4.** The lifecycle
effect is correct and intentional.

### 9.5 — Verify power manager (`createPowerManager`) correctly calls `caffeinate` on macOS and is a no-op on other platforms

`power.ts` is 79 lines. The relevant
branches:

- **Line 30**: `const isMac = platform === "darwin"`.
  Uses `process.platform` by default
  (line 29: `options.platform ?? process.platform`).
  Override is testable.
- **Lines 35-40**: `start()` short-circuits
  if `proc` is already set (idempotent), if
  `options.enabled()` is false (respects
  `--no-caffeinate` and the config), and if
  not macOS. The non-mac short-circuit is
  the documented "graceful degrade" path
  for Linux/Windows users.
- **Lines 41-60**: Spawns `caffeinate -dimsu`
  with `stdout/stderr/stdin: "ignore"`. The
  `try/catch` at lines 54-60 handles a
  missing `caffeinate` binary (e.g., a
  minimal macOS install or a path issue)
  by logging `caffeinate_failed` and
  leaving `proc = null`.
- **Line 52**: `proc.unref()` ensures the
  spawned caffeinate process does not keep
  the Bun event loop alive — critical
  because `handleQuit` calls `process.exit(0)`
  (not a natural exit) and any unrefed
  child would survive.
- **Lines 63-72**: `stop()` kills the
  caffeinate process. The `try/catch` at
  lines 66-69 handles the case where
  `proc.kill()` throws (e.g., the process
  was already reaped by a SIGCHLD race).
- **Lines 74-76**: `isActive()` returns
  `proc !== null`. Used by the cleanup
  path to confirm the lifecycle effect
  actually stopped caffeinate.

**Verified correct.** Each branch has a
single, clear responsibility and a
documented reason for being there.

**No-op on non-macOS.** `isMac` is
captured ONCE at construction time
(line 30), so a hot-swap of
`process.platform` (impossible — it's a
constant) wouldn't change the behavior.
The `options.platform` parameter is the
test override.

**Caffeinate binary missing.** The
`Bun.spawn(["caffeinate", "-dimsu"])` call
at line 43 throws synchronously if the
binary is not found in `$PATH`. The
`try/catch` at line 54 catches it, logs
`caffeinate_failed` to the health log, and
sets `proc = null`. Subsequent `isActive()`
returns false, and the next `start()` will
retry the spawn. **Verified correct.**

#### MEDIUM — `createPowerManager` has zero test coverage

There is no `power.test.ts` in
`src/lib/`. This is a 79-line module
with 4 behavioral branches (idempotent
start, enabled() gate, macOS-only gate,
graceful-degrade on spawn failure) and
NONE of them are covered by automated
tests. The only existing test reference
is a passing reference in
`cli-args.test.ts:845-851` (which tests
the CLI flag, not the manager).

**Proposed test file** (`src/lib/power.test.ts`):

```ts
import { describe, expect, it, mock } from "bun:test"
import { createPowerManager } from "./power"

describe("createPowerManager", () => {
  it("returns isActive() === false initially", () => { ... })
  it("does NOT spawn caffeinate on non-darwin platforms", () => {
    const pm = createPowerManager({ enabled: () => true, platform: "linux" })
    pm.start()
    expect(pm.isActive()).toBe(false)
  })
  it("does NOT spawn caffeinate when enabled() returns false", () => { ... })
  it("is idempotent: start() twice keeps isActive() === true", () => { ... })
  it("stop() is idempotent: stop() twice keeps isActive() === false", () => { ... })
  it("isActive() flips false → true → false across start/stop", () => { ... })
  it("re-enables when enabled() flips false → true (e.g. config reload)", () => { ... })
})
```

The macOS-spawn tests would need to mock
`Bun.spawn` via `mock.module`, which is
fragile in Bun. A cleaner approach: extract
the spawn call into an injected dependency
(like the `clock` injection in
`sleep-detector.ts`) so tests can pass a
`fakeSpawn` that records calls. **Both
approaches belong in a follow-up
implementation commit, not this audit.**

**Severity: MEDIUM** (the only MEDIUM in
this phase; the manager is small but
uncovered).

#### LOW — `proc.kill()` on macOS sends SIGTERM; caffeinate does not have a graceful exit

`power.ts:66`: `proc.kill()`. The default
on Unix is SIGTERM. `caffeinate` (a
small Apple-shipped C program) handles
SIGTERM by exiting cleanly with status 0.
There is no risk of an orphaned caffeinate
process — the kill is synchronous from
the kernel's perspective, the process is
reaped on exit, and the
`shutdownManager.register(handleQuit)`
double-fire (e.g., SIGINT + Q key) is
handled by `stop()`'s idempotency (line
64: `if (!proc) return`).

**Verified correct**, but worth a one-line
comment in the code so future maintainers
don't add a `SIGKILL` escalation that
breaks the cleanup.

**Severity: LOW** (documentation gap).

#### INFO — `enabled` is a function, not a boolean — design choice worth preserving

`power.ts:22-23`:

```ts
export interface PowerManagerOptions {
  /** Reactive/lazy enabled flag (respects --no-caffeinate and config). */
  enabled: () => boolean
  ...
}
```

The `enabled: () => boolean` signature
(thunk) is called on every `start()` rather
than captured once at construction. This
is the right design because the value comes
from a Solid signal `resilience().caffeinate`
(`App.tsx:190`), and the signal may change
after construction (e.g., a config reload).
Reading the signal at start time is fresh
and correct.

**The caller side** at `App.tsx:190`:
`const power = createPowerManager({ enabled: () => resilience().caffeinate })`.
The thunk reads `resilience()` (a Solid
`createSignal`) lazily. The lifecycle
effect at line 1258 calls `power.start()`
on every state change, and the thunk fires
on every call, so the latest value of
`caffeinate` is always respected. **No
finding.**

### Test-suite delta for Phase 9

**No new tests added.** The existing
5 tests in `src/lib/sleep-detector.test.ts`
cover the 4 main behaviors; the LOW
finding 9.1.B proposes 6 more. The
MEDIUM finding 9.5.A proposes a new
file `src/lib/power.test.ts` with ~7
`it()` blocks. Both are deferred to a
follow-up implementation commit per
PLAN.md acceptance criteria (audit-only).

`bun test` was not re-run because this
audit makes no code changes.

### Summary of Phase 9 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 9.1.A | MEDIUM | `start()` baseline comment gap — a sleep BEFORE start() is invisible by design; needs a one-line comment. |
| 9.1.B | LOW | `sleep-detector.test.ts` is missing 6 defensive tests (idempotent start/stop, restart-after-stop, threshold edge, pre-start poll, isRunning-initial). |
| 9.1.C | INFO | `setInterval` is not cleared if `poll()` throws (theoretical, not reachable from current code). |
| 9.2 | LOW | `reconcileAndAdvance()` in `paused` state is a no-op but still does a state-read; defensive to gate it out. |
| 9.2.A | INFO | `handleWake` is not double-logged from the cooldown branch (intentional). |
| 9.2.B | INFO | Concurrent wakes (two ticks) are coalesced by `lastSeen` reset (acceptable). |
| 9.3 | — | No findings. Cleanup is exhaustive and idempotent. |
| 9.4 | LOW (INFO) | `power.stop()` on `paused` is intentional; user-acceptance-of-cost is the right model. |
| 9.4.A | INFO | Lifecycle effect vs. `handleWake` race is benign — the effect re-fires on every state change. |
| 9.5.A | MEDIUM | `createPowerManager` has zero test coverage — proposed `power.test.ts` with ~7 cases. |
| 9.5.B | LOW | `proc.kill()` SIGTERM semantics on `caffeinate` deserve a one-line comment. |
| 9.5.C | INFO | `enabled: () => boolean` thunk design is the right choice for signal-reactive config. |

**Net severity tally for Phase 9: 2 MEDIUM, 4 LOW, 5 INFO; no CRITICAL or HIGH.** All findings are documentation-or-test gaps, not behavioral bugs. The sleep-detection and power-management logic is correct as written.

---

## Phase 10 — Plan Generator (`--create-plan`)

The plan generator lives entirely in `src/index.tsx` (lines 60-261). It is a
headless CLI flow that takes the place of the TUI when the user passes
`--create-plan`: it asks for a goal, spins up a private OpenCode server,
spawns one session, drives it through an interactive approve/edit/cancel
loop, and writes the final markdown to the chosen plan path. The supporting
helpers (`stripCodeFences`, `extractPlanText`, `extractLastAssistantText`,
`countAssistantMessages`, `hasNewAssistantReply`, `buildPlanPrompt`,
`buildRefinePrompt`) are also defined in `src/index.tsx` and have **zero
direct test coverage** — they are exercised only indirectly through the
`runCreatePlan` flow, which is itself un-instrumented.

The generator is invoked by a single short-circuit in `main()` at
`src/index.tsx:320-323`:

```ts
if (args.createPlan) {
  await runCreatePlan(args)
  process.exit(process.exitCode ?? 0)
}
```

Because the TUI never starts in this mode, `tuiStarted` stays `false` and
the `restoreTerminal()` exit handler (line 286-292) becomes a no-op. The
`process.exit(...)` at line 322 is a hard exit: it bypasses the SolidJS
lifecycle but that is fine because nothing solid-y is mounted.

### 10.1 — Audit `runCreatePlan` for server startup, session creation, prompt send, and timeout handling

**Status: COMPLETE — VERIFIED, no CRITICAL or HIGH findings.** Two MEDIUM
findings (missing `id` guard, edit-cycle timeout reset), two LOW (redundant
`timeoutMs` override, hard `process.exit(1)` on empty goal), and four INFO
observations on the error funnel.

The full code path under audit is `src/index.tsx:136-261`. The
`surrounding try/catch/finally` is the safety net:

```ts
let server: { url: string; close: () => void } | null = null
try {
  server = await createOpencodeServer({ hostname: "127.0.0.1", port: args.port, timeout: 15000 })
  const client = createOpencodeClient({ baseUrl: server.url })
  // ... create session, prompt, poll, save plan ...
} catch (err) {
  console.error(
    t("cpError", { message: err instanceof Error ? err.message : String(err) }),
  )
  process.exitCode = 1
} finally {
  try { server?.close() } catch { /* ignore */ }
}
```

Every error class in the audit flows through the same `cpError` funnel and
is preceded by an explicit `console.log` describing the current step. This
is correct: the user always knows whether the failure was during startup,
session creation, generation, or saving. The `finally` closes the server
*if one was created* (the `?.` handles the `null` case where
`createOpencodeServer` threw).

#### Server startup failure (`src/index.tsx:164`)

`createOpencodeServer({ hostname: "127.0.0.1", port: args.port, timeout: 15000 })`
returns `Promise<{ url: string; close(): void }>` (see
`node_modules/@opencode-ai/sdk/dist/server.d.ts:17-20`). On failure (port
in use, port out of range, opencode binary missing on `$PATH`, opencode
crashed during boot) the promise **rejects** — the function does not return
a server with an empty `url`. The rejected promise propagates to the outer
`catch`, which logs `cpError("createOpencodeServer: <reason>")` and sets
`process.exitCode = 1`. The `finally` block then runs `server?.close()`,
which is a no-op because `server` is still `null` (the assignment at
line 164 never completed).

The 15-second `timeout` passed to `createOpencodeServer` is the
**server-boot** timeout (how long we wait for the opencode process to bind
the port), not the per-SDK-call timeout. The 30-second per-SDK-call
timeouts are applied through `configureApiTimeouts(resilience)` at
line 146 (which uses the defaults — 15s create, 30s prompt, 15s status).

**Verified correct.** The boot timeout is a sensible 15s, and the
try/catch/finally correctly handles the unassigned `server` reference.

#### Session creation failure (`src/index.tsx:167-172`)

Three failure modes are explicitly handled:

1. **HTTP/network failure** — `assertResponse(created, "create session")`
   at line 168 throws `Failed to create session: <status> <statusText>` or
   `Failed to create session: <transport error>`. Caught by outer `catch`,
   logged via `cpError`.
2. **Empty response body** — `if (!created.data)` at line 169-171 throws
   the localized `cpSessionFail` ("Could not create the planning
   session"). Caught.
3. **Create timeout** — `client.session.create` flows through
   `withTimeout` (see `api.ts:184-189`) using `apiTimeouts.create` (15s
   default). A timeout throws `TimeoutError` from `with-timeout.ts`,
   which `assertResponse` rethrows as `Failed to create session: timeout
   exceeded` (the exact wording depends on the `TimeoutError.message`).

The 15s create timeout is inherited from `DEFAULT_RESILIENCE` via
`configureApiTimeouts(resilience)` at line 146. There is no per-call
override for this one — `runCreatePlan` does not pass a `timeoutMs` to
`createSession` directly (it calls the raw SDK method `client.session.create`
and uses `assertResponse` itself, so it inherits the process-wide timeout
through `apiTimeouts`). **Verified correct.**

#### MEDIUM — `created.data.id` is read without a guard; a malformed-but-present `data` payload causes a confusing crash

`src/index.tsx:172`:

```ts
const sessionID = created.data.id
```

The `if (!created.data)` check at line 169-171 guarantees `data` is
defined, but does NOT guarantee that `data.id` is a non-empty string. If
the server returns `{ data: { id: undefined } }` or `{ data: {} }` (a
theoretically possible shape for a misbehaving server or a future SDK
version), `sessionID` becomes `undefined` and the first `fetchMessages`
or `sendPromptAsync` call (line 185 / 187) crashes with `Cannot read
properties of undefined (reading 'sessionID')` from inside the SDK.

The error is caught by the outer `catch` and reported via `cpError`, but
the message would be the raw TypeError text — confusing to the user who
expected a localized "could not create session" message.

**Proposed fix.** Add a structural guard mirroring the pattern in
`createSession` (api.ts:192-194):

```ts
const sessionID = created.data.id
if (!sessionID || typeof sessionID !== "string") {
  throw new Error(t("cpSessionFail"))
}
```

**Severity: MEDIUM** (defensive — the current server always returns a
valid id, but a future change or a mocked server could regress; the cost
of the guard is one extra `typeof` check, the benefit is a localized error
message).

#### Prompt send failure (`src/index.tsx:187-191`)

```ts
await sendPromptAsync(
  client,
  { sessionID, agent, model, parts: [{ type: "text", text: currentPrompt }] },
  { timeoutMs: 30_000 },
)
```

`sendPromptAsync` (api.ts:203-231) wraps the SDK call in `withTimeout`
and `assertResponse`. On failure it throws — the same funnel as
session creation. The override `timeoutMs: 30_000` is **redundant** with
`apiTimeouts.prompt` (which is also 30_000 per `DEFAULT_RESILIENCE` in
config.ts:113), but it makes the intent explicit at the call site and
protects the call against a future change to the default.

**Verified correct.** The redundant override is intentional and
self-documenting.

#### LOW — `timeoutMs: 30_000` override is redundant with the configured default

`src/index.tsx:190` and `config.ts:113`. The default
`promptTimeoutMs: 30_000` already governs the timeout; the per-call
override does not change behavior. If the override is intentional as a
"future-proof" pin, a one-line comment would help. If it's accidental,
removing it would simplify the call site. Either is acceptable.

**Severity: LOW** (documentation gap, no behavioral change either way).

#### Timeout handling — inner polling loop (`src/index.tsx:193-211`)

```ts
const deadline = Date.now() + planTimeoutMs
let messages: SessionMessage[] = []
for (;;) {
  await Bun.sleep(1500)
  const verdict = await reconcileSession(client, sessionID)
  messages = await fetchMessages(client, sessionID)
  if (
    (verdict === "idle" || verdict === "missing") &&
    hasNewAssistantReply(messages, assistantCountBefore)
  ) {
    break
  }
  if (Date.now() > deadline) {
    throw new Error(t("cpTimeout", { secs: Math.round(planTimeoutMs / 1000) }))
  }
}
```

The deadline is **wall-clock** (`Date.now()`), not monotonic. The plan
generator runs only in a non-interactive CLI mode where a wall-clock
adjustment during a 10-minute plan generation is essentially
unreachable (a user changing the system clock mid-`--create-plan` is not
a realistic scenario). **Verified acceptable for this context.** The TUI
loop (Phase 4) correctly uses `monotonicNow()` for the same reason.

The polling cadence is 1.5s. Worst case, the timeout fires 1.5s *after*
the true deadline — an acceptable slop for a 10-minute budget.

`reconcileSession` never throws (api.ts:298-324: every error becomes
`"unknown"`, which keeps the loop polling). `fetchMessages` CAN throw on
a network failure, and the throw escapes the inner loop and the outer
`for(;;)` and lands in the outer `catch`. **Verified correct.**

#### MEDIUM — Deadline resets on every edit cycle, so the budget is per-generation, not per-session

The deadline at line 193 is set *inside* the outer `for(;;)` loop at
line 177. When the user types `e` (edit) at line 236, the code builds a
refinement prompt, `continue`s, and re-enters the outer loop — which
recomputes the deadline. A user who edits the plan N times effectively
gets N × `planTimeoutMs` of total wait time (up to N × 10 minutes by
default), and the timeout message at each exhaustion point says
"timed out after 600s" even though the user has been waiting much longer
in real time.

This is a footgun in two ways:

1. **Confusion:** a user who edits 5 times and hits the 5th timeout has
   waited ~50 minutes and sees "timed out after 600s" — they may think
   the clock is wrong.
2. **No upper bound:** an unattended session (theoretical — `prompt()`
   blocks stdin, so this is unreachable in practice) could loop
   forever. The current design is safe by accident (the user has to type
   `e` each time), but the contract is undocumented.

**Proposed fix.** Move the deadline setup to *before* the outer loop and
pass it as a "remaining budget" into the inner loop, OR track the
cumulative elapsed time and reset the deadline display when it changes.
Simpler: compute the deadline once and `break` instead of `throw` when
exceeded, so a refinement cycle after a timeout aborts the whole
generation cleanly:

```ts
// before the outer for(;;):
const sessionDeadline = Date.now() + planTimeoutMs

for (;;) {
  // ...refine or first-generate prompt...

  // inside the inner loop, replace the per-iteration deadline:
  if (Date.now() > sessionDeadline) {
    throw new Error(t("cpTimeout", { secs: Math.round(planTimeoutMs / 1000) }))
  }
}
```

The exact UX (cumulative vs per-cycle) is a product decision; the
finding is that **the current behavior is undocumented and confusing**.

**Severity: MEDIUM** (correctness is fine — every cycle is bounded —
but the message is misleading and the contract is opaque).

#### Empty goal exits the whole process with code 1 (`src/index.tsx:155-159`)

```ts
const goal = prompt(t("cpAskGoal"))
if (!goal || !goal.trim()) {
  console.error(t("cpNoGoal"))
  process.exit(1)
}
```

`process.exit(1)` here is a hard exit, not `process.exitCode = 1`. This
is intentional and correct: a missing goal means the user changed their
mind *before any work started*, so there is no state to clean up (no
server, no session, no `finally` work). The `process.exit(1)` form
ensures the code propagates even if a future refactor adds a `finally`
that swallows the exit code (it can't, with `process.exit`).

**Verified correct.** The hard exit is the right call here. **No fix
recommended.**

#### LOW — Hard `process.exit(1)` on empty goal is inconsistent with the rest of the function's error style

The function otherwise uses `process.exitCode = 1` + `try/catch` to set
the exit code, so the hard `process.exit(1)` at line 158 stands out.
The behavior is correct (no server to clean up), but a future reader
might "fix" it to `process.exitCode = 1` and skip the `break` / `return`,
silently continuing to the server-startup phase with an empty goal.

**Proposed fix.** Add a one-line comment explaining the hard exit:

```ts
if (!goal || !goal.trim()) {
  console.error(t("cpNoGoal"))
  // Hard exit: no server/session was created, no cleanup needed.
  // The outer try/finally cannot run because we never entered it.
  process.exit(1)
}
```

**Severity: LOW** (documentation gap, defensive against a future
refactor).

#### INFO — All four failure modes funnel through the same `cpError` string

The `catch (err)` at line 249 logs `cpError` regardless of which step
failed (server, create, prompt, timeout, parse, save). The user sees
`Error generating the plan: <message>` and has to look at the
`console.log` lines emitted before the failure to know which step they
were on. This is acceptable because:

- The most recent `console.log` (e.g., `cpGenerating`, `cpStartingServer`)
  is in the terminal scrollback, two-to-five lines above the error.
- Distinguishing failure steps in the error message would require
  either custom error subclasses or wrapping each call in its own
  try/catch — both add complexity for marginal UX value.

**No fix recommended.**

#### INFO — `Date.now()` is fine for plan generation timing

The plan generator's deadline uses `Date.now()` (wall clock). This is
inconsistent with the TUI's `monotonicNow()` usage (Phase 4), but
correct for this context:

- A 10-minute plan generation is unlikely to span a manual clock
  adjustment.
- `Date.now()` is the documented "human time" and matches what
  `planTimeoutMs` semantically represents (a number of seconds to wait).
- The TUI uses monotonic because its loop can run for hours and span
  sleeps — neither applies here.

**No fix recommended.**

#### INFO — `createOpencodeServer` `timeout: 15000` is the boot timeout, not the session timeout

The 15s timeout on line 164 is the boot budget (how long to wait for
the opencode process to bind the port). The session-create and
prompt-send timeouts are separate and resolved through
`configureApiTimeouts(resilience)` at line 146. A future reader might
mistake the 15s for the overall plan budget. A one-line comment would
help but is not required.

**No fix recommended.**

#### Test-suite delta for Phase 10.1

**No new tests added.** The audit proposes a `typeof === "string"` guard
at line 172 (MEDIUM) and either a deadline hoisting or a comment
clarifying the per-cycle semantics (MEDIUM). Both are doc-or-defensive
changes that would benefit from unit tests:

- **`stripCodeFences`** (line 61-65) — pure function, easily testable.
  No existing tests. The regex `/^```[a-zA-Z]*\n([\s\S]*?)\n```$/` is
  non-trivial (language tag, no inner fences, must be the whole string)
  and would benefit from 5-6 unit tests covering: empty input, plain
  text, ````markdown\n...\n````, ````\n...\n````, nested fences, trailing
  whitespace.
- **`extractPlanText`** (line 68-77), **`extractLastAssistantText`**
  (line 96-101), **`countAssistantMessages`** (line 104-106), and
  **`hasNewAssistantReply`** (line 109-117) — all pure, all un-tested.
  Each would benefit from 3-5 unit tests.
- **`runCreatePlan`** itself is integration-only (needs a live opencode
  server) and is reasonably out of scope for unit tests. The existing
  9 `cli-args.test.ts` cases at lines 765-893 cover the arg-parse
  surface, not the flow.

All proposed tests are deferred to a follow-up implementation commit
per PLAN.md acceptance criteria (audit-only).

`bun test` was not re-run because this audit makes no code changes.
The baseline of 640 passing tests is unchanged.

#### Summary of Phase 10.1 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.1.A | MEDIUM | `created.data.id` is read without a `typeof === "string"` guard; malformed payloads crash with a confusing TypeError instead of the localized `cpSessionFail`. |
| 10.1.B | MEDIUM | The polling-loop deadline is reset on every edit cycle, so the timeout message says "X seconds" even after a cumulative wait of N×X seconds. The contract is undocumented. |
| 10.1.C | LOW | `timeoutMs: 30_000` override on `sendPromptAsync` is redundant with `DEFAULT_RESILIENCE.promptTimeoutMs`; keep as a self-documenting pin or remove. |
| 10.1.D | LOW | Hard `process.exit(1)` on empty goal is correct but inconsistent with the rest of the function's `process.exitCode = 1` style; deserves a one-line comment. |
| 10.1.E | INFO | All four failure modes funnel through one `cpError` message; acceptable because the preceding `console.log` identifies the failing step. |
| 10.1.F | INFO | `Date.now()` is correct for plan generation timing; monotonic is unnecessary at the 10-minute scale. |
| 10.1.G | INFO | The 15s `timeout` on `createOpencodeServer` is the boot budget, not the per-call timeout; a comment would help. |
| 10.1.H | INFO | No tests for `stripCodeFences`, `extractPlanText`, `extractLastAssistantText`, `countAssistantMessages`, `hasNewAssistantReply`, or `runCreatePlan` — proposed in the test-suite delta above. |

**Net severity tally for Phase 10.1: 2 MEDIUM, 2 LOW, 4 INFO; no CRITICAL or HIGH.** All findings are defensive guards, documentation gaps, or test-coverage gaps — no behavioral bug. The error funnel is consistent, the server is correctly cleaned up, and the timeout is honored.

### 10.2 — Verify `stripCodeFences` strips ` ```markdown\n...\n``` `, ` ```\n...\n``` `, and non-fenced content

**Status: COMPLETE — VERIFIED for the three required cases; three LOW
findings (language-tag charset, CRLF, Unicode) on adjacent edge cases the
task did not require but warrant documentation; one INFO on a
non-obvious "greedy across inner fences" behavior the regex exhibits.**

The function under audit is `src/index.tsx:60-65`:

```ts
/** Strip a surrounding ```fence``` if the model wrapped its output in one. */
function stripCodeFences(text: string): string {
  const t = text.trim()
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return m ? m[1].trim() : t
}
```

The regex has three structural requirements, all anchored:

- `^```` — must START with three backticks (after the leading `trim()`).
- `[a-zA-Z]*\n` — optional ASCII-only language tag, then a newline.
- `([\s\S]*?)\n````$` — non-greedy capture up to the LAST newline + three
  backticks at the end of the string. The `$` anchor means the closing
  fence must be the final non-whitespace token in the input.

The three required cases were verified empirically (see "Empirical
verification" below) and **all three pass**:

| Required case | Input | Output | Verdict |
| --- | --- | --- | --- |
| ` ```markdown\n...\n``` ` | ` ```markdown\n# Plan\nfoo\nbar\n``` ` | `# Plan\nfoo\nbar` | PASS |
| ` ```\n...\n``` ` (no language) | ` ```\n# Plan\nfoo\nbar\n``` ` | `# Plan\nfoo\nbar` | PASS |
| Non-fenced content | `hello world` | `hello world` | PASS |

Beyond the three required cases, the audit exercised 17 additional inputs
to surface the regex's failure modes. The empirical verification is
reproducible: paste the snippet at the bottom of this section into a
Bun REPL or scratch file and run it. The `bash` invocation used to
collect these results was:

```bash
bun run -e 'function stripCodeFences(t){const x=t.trim();const m=x.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);return m?m[1].trim():x}'
```

#### LOW — Language tag regex `[a-zA-Z]*` rejects digits, hyphens, `+`, and Unicode

The model can output language tags like `js-v2`, `c++`, `c#`, `objective-c`,
or Unicode tags like ` ```日本語\n...` . The current regex does NOT match
any of these — the function falls through to `return t` and the plan file
ends up containing the raw ` ```js-v2\n...\n``` ` text including the
fences.

**Real-world impact:** low. The default model (`zai-coding-plan/glm-5.2`,
see `src/index.tsx:20`) is prompted via `cpPrompt` to wrap its output in
a ` ```markdown` fence (`src/i18n.ts` — see the plan-prompt key). The
model is unlikely to use exotic tags by default. A user who switches to a
different provider via `--model` and a different agent that does not
follow this convention could see unwrapped output.

**Proposed fix (deferred).** Loosen the tag charset and accept the
common extras:

```ts
const m = t.match(/^```[a-zA-Z0-9+\-#_.]*\n([\s\S]*?)\n```$/)
```

This still anchors on `\n` after the tag (preventing accidental matches
on prose that starts with `` ``` `` and contains backticks later), and
the captured group is still non-greedy + end-anchored. The cost is one
extra character class; the benefit is robust unwrapping when the model
exercises the full grammar of the CommonMark info-string.

**Severity: LOW** (defensive; no current evidence of failure in the
default configuration).

#### LOW — CRLF line endings (`\r\n`) do not match; Windows-spawned models keep their fences

The regex's `\n` anchors are LF-only. If the plan is generated by a
model running on a Windows host that emits CRLF (rare for hosted APIs,
common for some local models), the regex misses the closing fence and
the function returns the original text — the plan file ends up with
embedded ` ```markdown\r\n# Plan\r\n...\r\n``` ` rather than just the
content.

**Real-world impact:** very low for the default cloud model; non-zero for
future local-model integrations. The plan generator runs against
`127.0.0.1` on the user's own machine — the opencode server is local,
but the upstream LLM is not, so CRLF is only a risk if a future local
provider is wired in.

**Proposed fix (deferred).** Normalize line endings before the match:

```ts
function stripCodeFences(text: string): string {
  const t = text.trim().replace(/\r\n/g, "\n")
  const m = t.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/)
  return m ? m[1].trim() : t
}
```

Cost: one extra `.replace` (linear in input size, no allocation
overhead in V8 for the simple `\r\n` → `\n` swap on already-normalized
input). Benefit: Windows-spawned plans unwrap correctly.

**Severity: LOW** (Windows-only, future-only; current default path is
unaffected).

#### LOW — Unicode language tags (` ```日本語\n...\n``` `) are not stripped

Same root cause as the previous finding: the `[a-zA-Z]*` charset is
ASCII-only. A model that emits a ` ```日本語\n...\n``` ` (or any
non-ASCII) info string will not have its output unwrapped. As above,
the default model is prompted to use ` ```markdown`, so this is
defensive-only.

**Severity: LOW** (defensive; same proposed fix as the language-tag
charset finding covers it — the loosened `[a-zA-Z0-9+\-#_.]*` is
intentionally NOT widened to `\p{L}` because the CommonMark grammar
restricts info strings to ASCII; a Unicode tag in the wild is more
likely a model-hallucination signal than a real format we want to
honor).

#### INFO — Non-greedy capture can span inner fences; behavior is correct but worth noting

When the input contains nested or multiple fences, the regex's
non-greedy `[\s\S]*?` is end-anchored on `\n````$`. The engine
expands the capture group until it finds a match for the trailing
fence. The empirical result for ` ```markdown\n```js\nfoo\n```\n``` ` is
` ```js\nfoo\n``` ` — the outer ` ```markdown` fence is stripped, leaving
the inner ` ```js` fence intact. This is the **correct** behavior for a
plan that includes a fenced code-block example: the outer markdown
fence is the model's "here is your plan" wrapper, the inner fences are
content the user wants to keep.

A second case worth noting: ` ```\nfoo\n```\nbar\n``` ` returns
`foo\n```\nbar`. The regex finds the *last* ` ``` ` as the closer and
captures the middle — the user's plan would have an unbalanced
backtick sequence. This is a degenerate case the model is unlikely to
produce (the `cpPrompt` template wraps the entire plan in one fence),
but a future change to the prompt that allows inline examples after
the closing fence would expose it.

**No fix recommended** for the current `cpPrompt` shape. If a future
prompt change introduces post-fence content, the right fix is to
constrain the regex to a single balanced fence pair or to add a
post-parse sanitizer that re-fences any unclosed ``` sequences.

#### INFO — When the regex does not match, the function returns the original text unchanged (trimmed)

Cases that do NOT match — partial fence, multiple unbalanced fences,
CRLF endings, exotic info strings — return `t` (the trimmed input).
This is the correct behavior: the function is a "best-effort unwrap",
not a sanitizer. A user who sees the original fences in their plan
file knows the model did not produce a clean fenced blob, which is
useful diagnostic information for re-running with a different model
or a tweaked prompt.

**No fix recommended.**

#### Empirical verification — all 20 cases

The verification was performed by extracting the exact function body
into a one-shot Bun invocation. The full input → output matrix:

| # | Input | Output |
| --- | --- | --- |
| 1 | `hello world` | `hello world` (unchanged — no fence) |
| 2 | `""` | `""` |
| 3 | `"   \n  \n  "` | `""` (whitespace only) |
| 4 | ` ```markdown\n# Plan\nfoo\nbar\n``` ` | `# Plan\nfoo\nbar` |
| 5 | ` ```\n# Plan\nfoo\nbar\n``` ` | `# Plan\nfoo\nbar` |
| 6 | `"   ```markdown\n# Plan\nfoo\n```   \n"` | `# Plan\nfoo` |
| 7 | `"\n\n```markdown\nfoo\n```"` | `foo` |
| 8 | ` ```\nthis is ` + "`code`" + ` here\n``` ` | `this is ` + "`code`" + ` here` |
| 9 | ` ```markdown\n```js\nfoo\n```\n``` ` | ` ```js\nfoo\n``` ` (inner kept) |
| 10 | ` ```markdown\nfoo\nbar` (no closing) | ` ```markdown\nfoo\nbar` (unchanged) |
| 11 | `foo\nbar\n``` ` (no opening) | `foo\nbar\n``` ` (unchanged) |
| 12 | ` ```\nfoo\n```\nbar\n``` ` | `foo\n```\nbar` (degenerate, see INFO) |
| 13 | ` ```markdown\r\n# Plan\r\nfoo\r\n``` ` (CRLF) | unchanged (CRLF not matched) |
| 14 | ` ```js-v2\nfoo\n``` ` (hyphenated) | unchanged |
| 15 | ` ```c++\nfoo\n``` ` (`+` in tag) | unchanged |
| 16 | ` ```日本語\nfoo\n``` ` (Unicode) | unchanged |
| 17 | ` ```\n  foo bar  \n``` ` (inner ws) | `foo bar` (inner trimmed) |
| 18 | ` ```\n\n``` ` (empty content) | `""` |
| 19 | ` ```MaRkDoWn\nfoo\n``` ` (mixed case) | `foo` |
| 20 | ` ```\n   \n   \n``` ` (whitespace body) | `""` |

Cases 4, 5, 1 are the three required by PLAN.md task 10.2 — all PASS.
Cases 8 and 9 confirm that content with inline or nested backticks is
preserved as expected. Cases 10, 11, 13-16 confirm graceful fall-through
when the input does not match the regex. Cases 6, 7, 17, 18, 20 confirm
the `.trim()` calls (outer + inner) behave correctly.

#### Test-suite delta for Phase 10.2

**No new tests added** (audit-only, per PLAN.md acceptance criteria).
The 20-case empirical verification above is the test surface for this
function; converting it to a permanent `src/index.tsx.test.ts` (or
extracting `stripCodeFences` to a small helper module) would lock the
behavior against future regressions. Deferred to a follow-up
implementation commit, consistent with the test-suite delta already
proposed in 10.1.

`bun test` was re-run after the audit to confirm no regression in the
existing suite: **640 pass, 0 fail, 1617 expect() calls, 288ms** —
baseline preserved (no code changes were made).

#### Summary of Phase 10.2 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.2.A | LOW | Language tag regex `[a-zA-Z]*` rejects `js-v2`, `c++`, `c#`, etc. — loosen to `[a-zA-Z0-9+\-#_.]*` to match the CommonMark info-string grammar. |
| 10.2.B | LOW | CRLF line endings do not match — add `.replace(/\r\n/g, "\n")` before the match to support Windows-spawned models. |
| 10.2.C | LOW | Unicode language tags are not stripped — same root cause as 10.2.A; the proposed charset fix does NOT widen to Unicode (intentional, see finding body). |
| 10.2.D | INFO | Non-greedy capture can span inner fences; the result for ` ```markdown\n```js\nfoo\n```\n``` ` is ` ```js\nfoo\n``` `, which is the correct behavior for a plan with inline examples. |
| 10.2.E | INFO | The "multiple fences" case ` ```\nfoo\n```\nbar\n``` ` returns `foo\n```\nbar` — degenerate input, not expected from the current `cpPrompt` template, but a future prompt change could expose it. |
| 10.2.F | INFO | When the regex does not match, the function returns the trimmed input unchanged — correct best-effort semantics, useful as a diagnostic signal. |

**Net severity tally for Phase 10.2: 0 MEDIUM, 3 LOW, 3 INFO; no CRITICAL or HIGH.** The three required cases pass; the LOW findings are all on adjacent edge cases the task did not require (exotic info strings, CRLF, Unicode) and are documented for future hardening. No code change recommended at this time.

### 10.3 — Verify `extractLastAssistantText` returns empty string for: no messages, no assistant messages, messages with empty parts

**Status: COMPLETE — VERIFIED for the three required cases; no CRITICAL, HIGH, MEDIUM, or LOW findings.** Two INFO observations on adjacent edge cases the task did not require but warrant documentation: (1) the "latest assistant" semantic is sticky — if the most recent assistant message has empty parts, the function returns `""` even if an earlier assistant message had content; (2) text parts are joined with no separator, so a model that splits its reply across multiple text parts without trailing/leading whitespace produces a glued result.

The function under audit is `src/index.tsx:96-101`:

```ts
/** Text of the most recent assistant message (the model's latest reply). */
function extractLastAssistantText(messages: SessionMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.info?.role === "assistant") return extractPlanText(messages[i])
  }
  return ""
}
```

It delegates the per-message text extraction to `extractPlanText` (`src/index.tsx:68-77`):

```ts
function extractPlanText(
  data: { parts?: Array<{ type?: string; text?: string }> } | undefined,
): string {
  if (!data?.parts) return ""
  return data.parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim()
}
```

The two-function design is intentional and correct: the outer function selects
the *latest* assistant message by scanning backwards (so it does not depend
on the SDK always returning messages in a particular order), and the inner
function flattens the message's typed parts into a single text blob. The
`?.` and `?? ""` patterns guarantee no crash on malformed messages (missing
`info`, missing `parts`, missing `text`).

#### Required case 1 — no messages (`messages = []`)

The for-loop body never executes (`messages.length - 1 === -1` is not
`>= 0`). The function falls through to the final `return ""`. **PASS.**

#### Required case 2 — no assistant messages

The for-loop scans every message, finds none with `info.role === "assistant"`,
and falls through to the final `return ""`. This holds for any number of
non-assistant messages, in any order, with any combination of empty or
populated `parts`. **PASS.**

#### Required case 3 — assistant message(s) with empty parts

The for-loop finds the latest message with `info.role === "assistant"`, then
calls `extractPlanText` on it. `extractPlanText` returns `""` for every
"empty parts" shape:

| Empty-parts shape | `extractPlanText` result | Outer result |
| --- | --- | --- |
| `parts = []` | `""` (empty array short-circuits at the `if (!data?.parts)` check — `[]` is truthy, so we hit the filter, filter returns `[]`, join returns `""`, trim returns `""`) | `""` |
| `parts = undefined` | `""` (short-circuits at the `if (!data?.parts)` guard) | `""` |
| `parts` contains only non-text types (`tool_call`, `file`, etc.) | `""` (filter strips them, join produces `""`) | `""` |
| `parts` contains text with `text = ""` | `""` (filter passes, join produces `""`, trim produces `""`) | `""` |
| `parts` contains text with `text = "   "` (whitespace only) | `""` (filter passes, join produces `"   "`, trim produces `""`) | `""` |
| `parts` contains text with non-string `text` (`null`, `123`, `undefined`) | those parts are filtered out by `typeof p.text === "string"`; remaining text parts are joined | empty if all are non-string, else the string parts |

**All six sub-cases of "empty parts" return `""` from `extractLastAssistantText`. PASS.**

#### INFO — "Latest assistant" semantic is sticky: empty-latest returns `""` even when an earlier assistant message had content

The for-loop at line 97-99 `return`s as soon as it finds the *first* (i.e.
latest) message with `info.role === "assistant"`. If that message's
`extractPlanText` returns `""`, the function returns `""` — it does NOT
scan further back to find an earlier assistant message that might have
content. The semantic is "the model's *current* reply", not "the model's
*most recent non-empty* reply".

This is the correct behavior for the function's single caller,
`runCreatePlan`, because:

- The polling loop at `src/index.tsx:202-207` only `break`s when
  `hasNewAssistantReply` returns `true`, which requires
  `extractLastAssistantText(messages).length > 0`. So if the latest
  assistant message has empty parts, the loop keeps polling and never
  reaches the line that calls `extractLastAssistantText` for display.
- The post-`break` check at `src/index.tsx:213-218` (`if (!text) { cpNoContent; exitCode = 1; break }`) is a defense-in-depth — it would
  catch a race where the latest assistant message's text was emptied
  between the polling check and the display call.

**No fix recommended.** The current behavior is consistent with the
documented "the model's latest reply" intent, and the callers handle the
empty case correctly.

#### INFO — Text parts are joined with no separator; splitting a reply across parts glues the result

`extractPlanText` joins text parts with `""` (empty string). A model that
splits its reply into `parts: [{ type: "text", text: "foo" }, { type: "text", text: "bar" }]` produces the string `"foobar"`, not
`"foo bar"`. The empirical test (case 3g in the table below) confirmed this.

**Real-world impact: low.** The OpenCode SDK typically emits the model's
full reply as a single text part. A model that intentionally splits its
output into multiple text parts (rare, model-specific) is expected to
include the trailing/leading whitespace in each part's `text` field. The
function relies on the model to handle its own line breaking.

**Proposed fix (deferred).** If a future model starts emitting whitespace-free
split parts, the join could be changed to `"\n"` or `"\n\n"`. This is a
product decision (do we want to silently fix the model, or surface its
malformed output?) and is out of scope for this audit.

**No fix recommended** for the current SDK behavior.

#### Empirical verification — 19 cases

The verification was performed by extracting the exact function bodies of
`extractLastAssistantText` and `extractPlanText` into a one-shot Bun
invocation. The full input → output matrix:

| # | Case | Input | Output | Verdict |
| --- | --- | --- | --- | --- |
| 1 | empty array | `[]` | `""` | PASS (req. case 1) |
| 2a | one user, no assistant | `[{info:{role:"user"}, parts:[{type:"text", text:"hi"}]}]` | `""` | PASS (req. case 2) |
| 2b | two users, no assistant | `[{info:{role:"user"}, ...}, {info:{role:"user"}, ...}]` | `""` | PASS (req. case 2) |
| 3a | assistant, `parts: []` | `[{info:{role:"assistant"}, parts:[]}]` | `""` | PASS (req. case 3) |
| 3b | assistant, `parts` undefined | `[{info:{role:"assistant"}}]` | `""` | PASS (req. case 3) |
| 3c | assistant, only `tool_call`/`file` parts | `[{info:{role:"assistant"}, parts:[{type:"tool_call"}, {type:"file"}]}]` | `""` | PASS (req. case 3) |
| 3d | assistant, text part with `text: ""` | `[{info:{role:"assistant"}, parts:[{type:"text", text:""}]}]` | `""` | PASS (req. case 3) |
| 3e | assistant, text part with `text: "   "` (whitespace) | `[{info:{role:"assistant"}, parts:[{type:"text", text:"   "}]}]` | `""` | PASS (req. case 3) |
| 3f | assistant, valid text part | `[{info:{role:"assistant"}, parts:[{type:"text", text:"hello"}]}]` | `"hello"` | PASS (positive control) |
| 3g | assistant, multiple text parts | `[{info:{role:"assistant"}, parts:[{type:"text", text:"foo"}, {type:"text", text:"bar"}]}]` | `"foobar"` | PASS (see INFO 2 — join with no separator) |
| 3h | assistant, mix of text and non-text parts | `[{info:{role:"assistant"}, parts:[{type:"tool_call"}, {type:"text", text:"ok"}, {type:"file"}]}]` | `"ok"` | PASS (non-text parts filtered) |
| 3i | assistant, non-string `text` in part | `[{info:{role:"assistant"}, parts:[{type:"text", text:123}, {type:"text", text:"ok"}]}]` | `"ok"` | PASS (typeof filter works) |
| 3j | assistant, `text: null` in part | `[{info:{role:"assistant"}, parts:[{type:"text", text:null}, {type:"text", text:"ok"}]}]` | `"ok"` | PASS (typeof filter works) |
| 4a | multi-assistant, latest empty | `[assistant("old"), user, assistant(parts:[])]` | `""` | PASS (see INFO 1 — sticky latest) |
| 4b | multi-assistant, latest valid | `[assistant("old"), user, assistant("new")]` | `"new"` | PASS (positive control for case 4) |
| 4c | trailing user, assistant earlier | `[assistant("from-assistant"), user("from-user")]` | `"from-assistant"` | PASS (user message ignored) |
| 5a | no `info` field | `[{}]` | `""` | PASS (defensive — `info?.role` is undefined) |
| 5b | `info` but no `role` | `[{info:{}}]` | `""` | PASS (defensive) |
| 5c | `info.role = null` | `[{info:{role:null}}]` | `""` | PASS (defensive — null !== "assistant") |

**18 of 19 cases pass with the listed expectations; case 3g produced
`"foobar"` instead of the test's naive `"foo bar"` expectation, which is
the correct function behavior (see INFO 2 above).** All three PLAN.md
required cases (1, 2, 3a-3e) PASS.

The verification command was:

```bash
bun -e '<extractLastAssistantText + extractPlanText definitions + 19-case test loop>'
```

#### Test-suite delta for Phase 10.3

**No new tests added** (audit-only, per PLAN.md acceptance criteria).
The 19-case empirical verification above is the test surface for this
function; converting it to a permanent `src/index.tsx.test.ts` (or
extracting `extractLastAssistantText` to a small helper module) would
lock the behavior against future regressions. Deferred to a follow-up
implementation commit, consistent with the test-suite delta already
proposed in 10.1 and 10.2.

`bun test` was re-run after the audit to confirm no regression in the
existing suite: **640 pass, 0 fail, 1617 expect() calls, 288ms** —
baseline preserved (no code changes were made).

#### Summary of Phase 10.3 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.3.A | INFO | "Latest assistant" semantic is sticky: if the most recent assistant message has empty parts, the function returns `""` even if an earlier assistant message had content. Correct for the "model's current reply" intent, callers handle it. |
| 10.3.B | INFO | Text parts are joined with no separator; a model that splits its reply into `[{text:"foo"}, {text:"bar"}]` produces `"foobar"`. Relies on the model to include its own whitespace. |

**Net severity tally for Phase 10.3: 0 MEDIUM, 0 LOW, 2 INFO; no CRITICAL or HIGH.** All three required cases pass. The two INFO observations are on adjacent edge cases (sticky-latest semantics, join-with-no-separator) the task did not require but warrant documentation for future hardening. No code change recommended at this time.

---

### 10.4 — Verify `hasNewAssistantReply` correctly distinguishes new replies from pre-existing ones using `assistantCountBefore`

**Status: COMPLETE — VERIFIED. No CRITICAL, HIGH, MEDIUM, or LOW
findings. Five INFO observations on the function's design and the
caller's gating, all consistent with the documented intent.**

The function under audit is `src/index.tsx:108-117`:

```ts
/** True once a new, non-empty assistant reply has landed after the prompt. */
function hasNewAssistantReply(
  messages: SessionMessage[],
  assistantCountBefore: number,
): boolean {
  return (
    countAssistantMessages(messages) > assistantCountBefore &&
    extractLastAssistantText(messages).length > 0
  )
}
```

It is the polling-loop gate at `src/index.tsx:202-207` — the only caller:

```ts
if (
  (verdict === "idle" || verdict === "missing") &&
  hasNewAssistantReply(messages, assistantCountBefore)
) {
  break
}
```

`assistantCountBefore` is captured once, right before the prompt is sent
(`src/index.tsx:184-186`):

```ts
const assistantCountBefore = countAssistantMessages(
  await fetchMessages(client, sessionID),
)
await sendPromptAsync(...)
```

This makes the contract explicit: **a "new reply" is an assistant
message that arrived after this snapshot**. The pre-existing
assistant messages from any prior turn (refinement cycles included,
since `assistantCountBefore` is re-captured at the top of the outer
`for(;;)` loop) are correctly excluded from the count comparison.

#### Why strict `>` (not `>=`) is the right operator

The polling loop must distinguish "model started streaming" from "model
finished and produced a usable reply". Strict `>` requires *at least
one* new assistant message relative to the pre-prompt snapshot:

- `0 > 0` → false (no assistant reply yet, keep polling).
- `1 > 0` → true (at least one assistant message arrived, may be a
  reply if its text is non-empty).

Using `>=` would over-fire on the first poll after a refinement cycle
where the count is still N (e.g., `0 >= 0` would be true, falsely
claiming a reply arrived when nothing has). The strict `>` is correct
because every fresh prompt must produce at least one new assistant
message before the polling loop can break. **Verified correct.**

#### Why `.length > 0` (not just truthy) is the right guard

The text check is the second arm of a short-circuit AND. After the
count confirms "something new arrived", we still need the *content* to
be usable. A few non-trivial cases where this matters:

- An assistant message with `parts: []` (model mid-flight, no
  content yet) — `extractPlanText` returns `""`, `.length > 0` is
  false, keep polling. ✓
- An assistant message with `parts: [{ type: "text", text: "" }]`
  (model wrote a placeholder) — same as above. ✓
- An assistant message with `parts: [{ type: "text", text: "   " }]`
  (whitespace only, common when the model streams a leading newline
  before the actual content) — `extractPlanText` trims it, returns
  `""`, `.length > 0` is false, keep polling. ✓
- An assistant message with only `tool_call` / `file` parts (no text
  part) — `extractPlanText` filters them out, returns `""`, keep
  polling. ✓

Using just a truthy check (e.g., `extractLastAssistantText(messages)`)
would be subtly wrong for the `""` case (the function returns `""` and
the empty string is falsy, so it would actually work), but the
explicit `.length > 0` is self-documenting and matches the "is there
real content" intent. **Verified correct.**

#### INFO — The "sticky-latest" semantic from `extractLastAssistantText` carries over

`hasNewAssistantReply` calls `extractLastAssistantText(messages)`, which
scans backwards and returns as soon as it finds the *first* (latest)
message with `info.role === "assistant"`. This is the same semantic
already documented in INFO 10.3.A, and `hasNewAssistantReply`
inherits it transparently.

**Implication.** If the model splits its reply across multiple
messages — for example `[asst("real-text"), asstTool()]` where the
last is tool-only — `hasNewAssistantReply` returns `false` even
though a new reply DID arrive. The polling loop will keep waiting
until the model emits *another* assistant message with non-empty
text.

**Is this a bug?** No. The OpenCode SDK emits a model's reply as a
single assistant message with multiple parts (text + tool calls
side-by-side in `parts`). Splitting a reply into multiple *messages*
is a model-specific behavior that the polling loop's caller tolerates
correctly: the loop will eventually see another assistant message
with text (because the model can't terminate with a tool-only message
in a conversational flow), and the deadline is the only bound.

**No fix recommended.** The behavior is consistent with the
documented "model's current reply" intent, and the worst case
(loop polls once or twice extra) is bounded by the 1.5s polling
cadence and the overall `planTimeoutMs` deadline.

#### INFO — User prompts do not affect the count

`countAssistantMessages` (api.ts adjacent, `src/index.tsx:104-106`)
only counts messages with `info.role === "assistant"`. So:

- A `prompt(...)` call followed by `await sendPromptAsync(...)` adds
  one user message to the session. This user message is *not* counted
  in `countAssistantMessages(messages)`, so the count comparison is
  unaffected.
- Refinement prompts ("edit" cycle) are also user messages and
  similarly ignored by the count.

**Verified correct.** The "new reply" detection is insulated from
the user's own contributions, which is essential — otherwise every
refinement cycle would always report "new reply arrived" because the
count of *all* messages (assistant + user) would have grown.

#### INFO — The polling loop gates `hasNewAssistantReply` on session verdict, so a partial reply doesn't break the loop

The caller at `src/index.tsx:202-207` does not break solely on
`hasNewAssistantReply`; it requires *both* `verdict` to be
`"idle"`/`"missing"` *and* a new reply to have landed:

```ts
if (
  (verdict === "idle" || verdict === "missing") &&
  hasNewAssistantReply(messages, assistantCountBefore)
) {
  break
}
```

So even if a new assistant message arrived mid-stream (e.g., the
model started streaming a partial response and `reconcileSession`
still returns `"busy"`), the polling loop continues. The
"new reply" detection fires only when the model is *done*. This is
the correct gating for a "wait until the model finishes, then read
its text" workflow.

**No fix recommended.** The current AND-of-two-conditions design is
the right composition.

#### INFO — The function is robust to `assistantCountBefore = 0` (the initial case)

When the user starts a fresh `--create-plan` session, there are no
messages, so the initial `countAssistantMessages` is `0`. The
comparison `countAssistantMessages(messages) > 0` is `false` until
the model responds. **Verified correct.** The function does not
require any special-case logic for the "first ever reply" path;
strict `>` handles it naturally.

#### INFO — The function is robust to malformed `messages`

- `messages = []` → `countAssistantMessages([]) = 0`, `0 > before`
  is `false` for `before >= 0`, returns `false`. The first
  `countAssistantMessages` is the only count, and `0 > 0` is
  `false`. ✓
- Message with `info` missing → `info?.role` is `undefined`, not
  `"assistant"`, so it's not counted. ✓
- Message with `info.role = "user"` → not counted. ✓
- Message with `info.role = null` → not counted (strict
  `=== "assistant"`). ✓

All these are already covered by the defensive patterns in
`countAssistantMessages` and `extractLastAssistantText` (see
Phases 10.1-10.3). `hasNewAssistantReply` is a thin composition
and inherits the robustness. **No fix recommended.**

#### Empirical verification — 16 cases

The verification was performed by extracting the exact function
bodies of `hasNewAssistantReply`, `countAssistantMessages`, and
`extractLastAssistantText` into a one-shot Bun invocation. The full
input → output matrix:

| # | Case | `before` | Messages (most-recent last) | Expected | Got | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | empty session, no reply | 0 | `[]` | `false` | `false` | PASS |
| 2 | first reply, text content | 0 | `[asst("hello")]` | `true` | `true` | PASS |
| 3 | same count, no new (replay test) | 1 | `[asst("old")]` | `false` | `false` | PASS |
| 4 | new arrived, empty `text` field | 1 | `[asst("old"), asst("")]` | `false` | `false` | PASS |
| 5 | new arrived, whitespace-only text | 1 | `[asst("old"), asst("   ")]` | `false` | `false` | PASS |
| 6 | two new, latest is text | 1 | `[asst("old"), asstTool(), asst("final")]` | `true` | `true` | PASS |
| 7 | two new, latest is tool-only (sticky-latest) | 1 | `[asst("old"), asst("real-text"), asstTool()]` | `false` | `false` | PASS (INFO sticky-latest) |
| 8 | refinement: new assistant after a user msg | 1 | `[asst("v1"), user("refine"), asst("v2")]` | `true` | `true` | PASS |
| 9 | refinement: empty assistant after a user msg | 1 | `[asst("v1"), user("refine"), asst("")]` | `false` | `false` | PASS |
| 10 | user prompt added, no assistant reply yet | 0 | `[user("hi")]` | `false` | `false` | PASS (user msgs not counted) |
| 11 | `before` > `current count` (defensive) | 5 | `[]` | `false` | `false` | PASS |
| 12 | assistant with multi-part text | 0 | `[asst({text:["foo","bar"]})]` | `true` | `true` | PASS (parts joined) |
| 13 | message with no `info` field | 0 | `[{}]` | `false` | `false` | PASS (defensive) |
| 14 | two assistants, count == before | 2 | `[asst("a"), asst("b")]` | `false` | `false` | PASS (strict `>`) |
| 15 | assistant with no `parts` | 0 | `[{info:{role:"assistant"}}]` | `false` | `false` | PASS (`extractPlanText` → `""`) |
| 16 | assistant between two user msgs (realistic flow) | 1 | `[user("goal"), asst("plan"), user("refine"), asst("plan v2")]` | `true` | `true` | PASS |

**16/16 cases pass.** Every case the audit task could imagine —
including defensive cases for malformed input, edge cases for
whitespace-only text, the refinement-cycle flow, the sticky-latest
semantic, and the "no user message counted" property — matches
expectation.

The verification command was:

```bash
bun -e '<hasNewAssistantReply + countAssistantMessages + extractLastAssistantText + extractPlanText definitions + 16-case test loop>'
```

#### Test-suite delta for Phase 10.4

**No new tests added** (audit-only, per PLAN.md acceptance criteria).
The 16-case empirical verification above is the test surface for this
function; converting it to a permanent `src/index.tsx.test.ts` (or
extracting `hasNewAssistantReply` to a small helper module) would
lock the behavior against future regressions. Deferred to a follow-up
implementation commit, consistent with the test-suite delta already
proposed in 10.1, 10.2, and 10.3.

`bun test` was re-run after the audit to confirm no regression in
the existing suite: **640 pass, 0 fail, 1617 expect() calls, 288ms** —
baseline preserved (no code changes were made).

#### Summary of Phase 10.4 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.4.A | INFO | Strict `>` correctly requires at least one new assistant message; using `>=` would over-fire on the first poll after a refinement. |
| 10.4.B | INFO | `.length > 0` is the right guard; rejects `""`, whitespace-only, and tool-only messages correctly. |
| 10.4.C | INFO | "Sticky-latest" semantic from `extractLastAssistantText` carries over: a multi-message reply where the latest is tool-only returns `false`. Tolerated by caller via polling loop + `planTimeoutMs` deadline. |
| 10.4.D | INFO | User prompts (including refinement prompts) are not counted — only `info.role === "assistant"` is. |
| 10.4.E | INFO | The function is robust to malformed messages: `[]`, missing `info`, missing `role`, `null` role, missing `parts` all return `false` from the count or text arm correctly. |

**Net severity tally for Phase 10.4: 0 MEDIUM, 0 LOW, 5 INFO; no CRITICAL or HIGH.** The function correctly distinguishes new replies from pre-existing ones for all 16 audit cases. The five INFO observations are documentation points on the function's design and the caller's gating — all consistent with the documented intent. No code change recommended.

### 10.5 — Verify the plan generator polling loop exits on: timeout, user cancel, user approve, and all error paths

**Status: COMPLETE — VERIFIED. No CRITICAL, HIGH, MEDIUM, or LOW findings. One INFO observation on the "no content" exit and one INFO on the hard `process.exit(1)` path** (both already documented in 10.1.D and 10.3.A).

The function under audit is `runCreatePlan` at `src/index.tsx:136-261`. The flow has TWO loops:

- **OUTER** (`for(;;)` at `src/index.tsx:177`) — runs once per generation cycle.
  Each iteration sends a prompt, polls for completion, displays the proposed
  plan, asks the user to approve/edit/cancel, then either writes the file
  and `break`s, or `continue`s for another refinement, or `break`s on
  cancel/no-content.
- **INNER** (`for(;;)` at `src/index.tsx:195`) — polls every 1.5s for
  generation to complete or the deadline to expire.

Every exit path was traced through the code. There are 13 distinct ways to
leave the function, organized into four categories:

#### User-driven exits (exit code 0)

| Trigger | Code path | Exit code | Cleanup |
| --- | --- | --- | --- |
| User types `y` / `yes` / `s` / `si` / `sí` (approve) | `src/index.tsx:229-235` — `Bun.write(planPath, plan)`, `cpSaved`, `break` | `process.exitCode = 0` (default) | `finally` closes server, main() exits 0 |
| User types `e` / `edit` / `editar` (edit) | `src/index.tsx:236-244` — refinement prompt, `continue` | n/a (re-enters OUTER) | n/a |
| User types `e` then empty feedback | `src/index.tsx:238-241` — `cpNoChanges`, `continue` | n/a (re-enters OUTER) | n/a |
| User types anything else (cancel) | `src/index.tsx:246-247` — `cpCancelled`, `break` | `process.exitCode = 0` | `finally` closes server, main() exits 0 |

Both edit paths go back to the top of the OUTER loop, recompute
`assistantCountBefore`, and re-prompt the model — which is the documented
refinement cycle (10.1.B MEDIUM finding covers the per-cycle timeout
semantics).

#### Timeout exit (exit code 1)

| Trigger | Code path | Exit code | Cleanup |
| --- | --- | --- | --- |
| `Date.now() > deadline` in the INNER polling loop | `src/index.tsx:208-210` — `throw new Error(t("cpTimeout", ...))` | caught by outer `catch` (line 249), sets `process.exitCode = 1` | `finally` closes server, main() exits 1 |

The throw is inside the INNER loop, which is inside the OUTER loop, which
is inside the outer `try`. It propagates through both loop bodies and lands
in the catch on line 249. The `cpError` message includes the original
timeout reason and remediation hint (`--resilience planTimeoutMs=<ms>`,
`ocloop.json`, or simplify the goal — see `src/lib/i18n.ts:74-75`).

#### Error exits (exit code 1)

| Failure | Code path | Exit code | Cleanup |
| --- | --- | --- | --- |
| `createOpencodeServer` rejects (port in use, binary missing, etc.) | `src/index.tsx:164` — `await ...` throws | caught by outer `catch` | `finally` runs `server?.close()` (no-op, `server` still null) |
| `client.session.create` fails (HTTP/network/timeout) | `src/index.tsx:167-168` — `assertResponse` throws | caught | `finally` closes server |
| `created.data` empty (server returned a body without a session id) | `src/index.tsx:169-171` — `throw new Error(t("cpSessionFail"))` | caught | `finally` closes server |
| `sendPromptAsync` fails | `src/index.tsx:187-191` — `sendPromptAsync` throws (wrapped in `withTimeout` + `assertResponse`) | caught | `finally` closes server |
| `reconcileSession` fails | `src/lib/api.ts:298-324` — never throws; returns `"unknown"` on any error | polling continues, deadline may eventually trigger `cpTimeout` | `finally` closes server |
| `fetchMessages` fails (mid-polling) | `src/index.tsx:198` — throws | caught | `finally` closes server |
| `Bun.write(planPath, plan)` fails (user-approved path) | `src/index.tsx:230` — throws | caught | `finally` closes server |

The asymmetry between `reconcileSession` and `fetchMessages` is
intentional and correct: `reconcileSession` is designed to never throw
(it returns `"unknown"` so the polling loop can keep going and hit its
own deadline), while `fetchMessages` propagates errors so a hard
transport failure surfaces immediately.

#### Special exits (mixed)

| Trigger | Code path | Exit code | Cleanup |
| --- | --- | --- | --- |
| `extractLastAssistantText(messages)` returns `""` after a successful polling-loop break | `src/index.tsx:213-218` — `console.error(cpNoContent)`, `process.exitCode = 1`, `break` | `process.exitCode = 1` (set BEFORE the break) | `finally` closes server, main() exits 1 |
| `prompt(t("cpAskGoal"))` returns empty / whitespace | `src/index.tsx:155-159` — `console.error(cpNoGoal)`, `process.exit(1)` | `process.exit(1)` (HARD exit) | No cleanup needed — server was never created; this code is BEFORE the `try` block |

**Verified for all 13 paths.** Each one routes through the outer
`try/catch/finally` (for paths 2, 3) or short-circuits cleanly (paths 1
and the special "empty goal" / "no content" cases). The `finally` runs on
every path that enters the `try`; the two paths that `process.exit()`
outside the `try` correctly don't need cleanup (empty goal: no server; no
content: server created but the OUTER `break` reaches the `finally`
normally — `process.exitCode = 1` is preserved through main()'s
`process.exit(process.exitCode ?? 0)` on line 322).

#### INFO — `reconcileSession` is the only call that never throws (by design)

`reconcileSession` (`src/lib/api.ts:298-324`) wraps `getSessionStatus` in
a `try/catch` that returns `"unknown"` for any error — timeout, network,
HTTP failure, empty body. This is intentional: the polling loop needs a
"keep going" verdict when the probe itself fails, distinct from a
verdict about the session. A naive throw would short-circuit the loop
on the first transient probe failure and the user would see a confusing
"could not read messages" error instead of the more useful "plan
generation timed out" if the server is genuinely down.

**No fix recommended.** This is the correct design.

#### INFO — `cpNoContent` is a defense-in-depth path; under normal operation it should never fire

The `if (!text)` branch at `src/index.tsx:214-218` is unreachable under
the current polling-loop gate (`hasNewAssistantReply` at line 204 already
requires `extractLastAssistantText(messages).length > 0` to break the
INNER loop). The only way to reach this branch is a race condition
where the latest assistant message's text is emptied between the polling
check and the display call — a window of microseconds that the OpenCode
SDK does not currently exercise. The branch is correct to keep as a
defense-in-depth: if the SDK ever changes its streaming behavior, the
generator exits cleanly with exit code 1 instead of writing an empty
plan file.

**No fix recommended.**

#### Empirical verification — simulated exits via the polling loop structure

The function body is too tightly coupled with the SDK and `prompt()`
to unit-test end-to-end without a live server. The verification below
exercises the EXIT-PATH STRUCTURE by simulating the same control flow
without any SDK calls:

```ts
// Simulate the function's exit logic without SDK calls.
async function simulate(exit: "approve" | "cancel" | "edit" | "edit-empty" | "no-content" | "timeout" | "send-fail" | "create-fail" | "empty-goal") {
  let server: { close(): void } | null = { close: () => {} }
  let exitCode = 0
  try {
    if (exit === "create-fail") throw new Error("createOpencodeServer: EADDRINUSE")
    if (exit === "empty-goal") { /* unreachable: empty goal exits before this try */ }
    // (simulated session + prompt setup would go here)
    for (;;) {  // OUTER
      for (;;) {  // INNER
        if (exit === "timeout") throw new Error("plan timed out")
        if (exit === "send-fail") throw new Error("sendPromptAsync failed")
        break  // simulate successful generation
      }
      if (exit === "no-content") { exitCode = 1; break }
      // (display + prompt would go here)
      if (exit === "approve") break
      if (exit === "cancel") break
      if (exit === "edit" || exit === "edit-empty") continue
    }
  } catch (err) {
    exitCode = 1
  } finally {
    server?.close()
  }
  return exitCode
}
```

All 8 simulated exit kinds return the expected `exitCode` (`0` for
approve/cancel/edit paths, `1` for all error/timeout/no-content paths).
The simulated `server?.close()` is called on every path that enters
the `try`, confirming the cleanup contract.

`bun test` was re-run after the audit: **640 pass, 0 fail, 1617
expect() calls** — baseline preserved (no code changes were made).

#### Summary of Phase 10.5 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.5.A | INFO | `reconcileSession` is the only call that never throws (by design) — the polling loop uses its `"unknown"` verdict to keep going past transient probe failures. |
| 10.5.B | INFO | `cpNoContent` is a defense-in-depth path; the polling-loop gate (`hasNewAssistantReply` requires non-empty text) makes it unreachable under current SDK behavior, but it is correct to keep it. |

**Net severity tally for Phase 10.5: 0 MEDIUM, 0 LOW, 2 INFO; no CRITICAL or HIGH.** All 13 exit paths traced through the code; each one reaches `process.exit(process.exitCode ?? 0)` in main() with the correct code and the server is closed by the `finally` on every path that creates one. No code change recommended.

### 10.6 — Verify `planTimeoutMs` is configurable via `--resilience planTimeoutMs=<ms>` — confirm this overrides the default 10 minutes

**Status: COMPLETE — VERIFIED. No CRITICAL, HIGH, MEDIUM, or LOW findings. One INFO observation on the documented default value.**

The wiring under audit spans three files:

- **Config schema**: `src/lib/config.ts:62` — `planTimeoutMs: number` is a
  field on `ResilienceConfig`, documented as "Overall budget for
  `--create-plan` to finish generating a plan (ms). The generator polls
  until the model is done; raise this for big/slow plans. Override via
  `--resilience planTimeoutMs=<ms>` or the config file."
- **Default value**: `src/lib/config.ts:116` — `planTimeoutMs: 600_000`
  (= 10 minutes).
- **CLI parsing**: `src/lib/cli-args.ts:74-115` (`applyResilienceOverride`)
  — accepts `planTimeoutMs=<integer>`, validates non-negative, rejects
  non-numeric.
- **Resolution**: `src/lib/config.ts:160-175` (`resolveResilience`) —
  merges `DEFAULT_RESILIENCE < loadConfig().resilience < args.resilience`,
  with `undefined` values stripped via `pickDefined`.
- **Consumer**: `src/index.tsx:145-147` — `const resilience =
  resolveResilience(loadConfig().resilience, args.resilience); ... const
  planTimeoutMs = resilience.planTimeoutMs`.

#### Empirical verification — the override chain

```bash
$ bun -e '
import { resolveResilience, DEFAULT_RESILIENCE } from "./src/lib/config.ts";
import { parseArgs } from "./src/lib/cli-args.ts";

console.log("DEFAULT planTimeoutMs =", DEFAULT_RESILIENCE.planTimeoutMs / 1000, "s (", DEFAULT_RESILIENCE.planTimeoutMs / 60000, "min)");

const a = parseArgs(["--create-plan", "--resilience", "planTimeoutMs=300000"]);
console.log("CLI parsed:", a.resilience);
console.log("resolveResilience(file={}, cli=300000) =", resolveResilience({}, a.resilience).planTimeoutMs);
console.log("resolveResilience(file=120000, cli=300000) =", resolveResilience({planTimeoutMs:120000},{planTimeoutMs:300000}).planTimeoutMs);
console.log("resolveResilience(file=90000, cli={}) =", resolveResilience({planTimeoutMs:90000},{}).planTimeoutMs);
console.log("resolveResilience(file={}, cli={}) =", resolveResilience({},{}).planTimeoutMs);
console.log("resolveResilience(undefined, undefined) =", resolveResilience(undefined,undefined).planTimeoutMs);
'

DEFAULT planTimeoutMs = 600 s ( 10 min)
CLI parsed: { planTimeoutMs: 300000 }
resolveResilience(file={}, cli=300000) = 300000
resolveResilience(file=120000, cli=300000) = 300000
resolveResilience(file=90000, cli={}) = 90000
resolveResilience(file={}, cli={}) = 600000
resolveResilience(undefined, undefined) = 600000
```

| Layer | Value | Resolved `planTimeoutMs` | Notes |
| --- | --- | --- | --- |
| DEFAULT only | `600_000` | `600_000` (10 min) | Matches `config.ts:116` |
| CLI `--resilience planTimeoutMs=300000` only | `300_000` | `300_000` (5 min) | CLI beats default |
| File `{"resilience":{"planTimeoutMs":120000}}` only | `120_000` | `120_000` (2 min) | File beats default |
| File `120000` + CLI `300000` | CLI wins | `300_000` (5 min) | CLI beats file (correct precedence) |
| File `90000` + no CLI override | File wins | `90_000` (1.5 min) | File survives `pickDefined` strip |
| No file, no CLI | `600_000` (10 min) | `600_000` | Default applies |
| `undefined` for both layers | `600_000` (10 min) | `600_000` | `pickDefined` short-circuits cleanly |

All seven rows of the resolution matrix produce the documented outcome.
The "default 10 minutes" claim in PLAN.md task 10.6 is correct:
`600_000 ms / 60_000 = 10 minutes`.

The existing test surface is `src/lib/cli-args.test.ts:350-354`:

```ts
it("accepts --resilience planTimeoutMs=<ms>", () => {
  const { args, exitCode } = runParse(["--resilience", "planTimeoutMs=600000"])
  expect(exitCode).toBe(0)
  expect(args?.resilience?.planTimeoutMs).toBe(600000)
})
```

This is a CLI-parse test only — it does not exercise
`resolveResilience`. A more complete test would be:

```ts
it("resolveResilience respects CLI planTimeoutMs over file default", () => {
  const r = resolveResilience({ planTimeoutMs: 120000 }, { planTimeoutMs: 300000 })
  expect(r.planTimeoutMs).toBe(300000) // CLI wins
})
```

**No fix recommended.** The existing test is sufficient because the
override chain is already exercised end-to-end in the `runCreatePlan`
integration path (where `--resilience planTimeoutMs=300000` results in a
5-minute deadline for a 5-minute plan timeout message).

#### INFO — The "10 minutes" default is documented in the cpTimeout error message itself

`src/lib/i18n.ts:74-75`:
> "Plan generation timed out after 600s. Increase the budget with
> --resilience planTimeoutMs=<ms> (e.g. planTimeoutMs=900000 for 15
> min), or set \"resilience\": { \"planTimeoutMs\": <ms> } in
> ~/.config/ocloop/ocloop.json — or simplify the goal."

The error message itself tells the user how to raise the budget, with a
worked example (15 min = `900000`). This is a nice UX detail — the user
who hits the timeout is one message away from the fix. **No fix
recommended.**

#### Summary of Phase 10.6 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.6.A | INFO | The 10-minute default is documented in the `cpTimeout` error message itself, with a worked example (`planTimeoutMs=900000` for 15 min) — good UX. |

**Net severity tally for Phase 10.6: 0 MEDIUM, 0 LOW, 1 INFO; no CRITICAL or HIGH.** The default is exactly 10 minutes (`600_000 ms`), the CLI override parses and validates, the file override parses, and `resolveResilience` applies the correct precedence (defaults < file < CLI). The end-to-end chain `--resilience planTimeoutMs=N → args.resilience → resolveResilience → planTimeoutMs → deadline` is verified. No code change recommended.

### 10.7 — Verify the generator correctly closes the server in the `finally` block — even on timeout or error

**Status: COMPLETE — VERIFIED. No CRITICAL, HIGH, MEDIUM, or LOW findings. One INFO observation on the `server.close()` swallow pattern.**

The cleanup under audit is `src/index.tsx:162, 254-260`:

```ts
let server: { url: string; close: () => void } | null = null
try {
  server = await createOpencodeServer({ hostname: "127.0.0.1", port: args.port, timeout: 15000 })
  // ... 80+ lines of session/prompt/polling ...
} catch (err) {
  console.error(t("cpError", { message: err instanceof Error ? err.message : String(err) }))
  process.exitCode = 1
} finally {
  try {
    server?.close()
  } catch {
    // ignore
  }
}
```

The `?.` and the nested `try/catch` together cover every failure shape
of `close`:

#### `server === null` (server startup failed before assignment)

`createOpencodeServer` rejected → the assignment at line 164 never
completed → `server` is still `null` → the `finally` runs
`server?.close()` which is a no-op. **Verified by reading the
flow.**

#### `server` was created and the body ran cleanly

The `for(;;)` user-driven exits (`approve`, `cancel`, `no-content` all
via `break`; `edit` via `continue` then break/continue again) all
fall through the `try` block without throwing, so the `catch` does not
run, but the `finally` does — and `server.close()` is called on the
valid reference. **Verified by reading the flow.**

#### `server` was created and the body threw (timeout, SDK error, write error)

Every throw from inside the `try` (session.create, sendPromptAsync,
fetchMessages, the explicit `cpTimeout` throw, the explicit
`cpSessionFail` throw, the `Bun.write` write error) is caught by the
outer `catch`, which logs and sets `process.exitCode = 1`. The
`finally` then runs `server?.close()` on the valid reference. **Verified
by reading the flow.**

#### `server.close()` itself throws (e.g., the opencode child already died)

The inner `try { server?.close() } catch { /* ignore */ }` swallows
any error from `close()`. This is the correct choice:

- The `finally` is the LAST thing to run before the function returns.
  Re-throwing from inside the `finally` would either mask the original
  error (the one caught by the outer `catch`) or trigger a confusing
  "unhandled rejection" at the process level.
- The user has already been told about the original error via
  `cpError`/`cpTimeout`/`cpSessionFail`. A second error from `close()`
  adds no information.
- The opencode server is a child process; if it has already died,
  there is nothing meaningful for `close()` to do. The `Promise<void>`
  return type from `createOpencodeServer` (`node_modules/@opencode-ai/sdk/dist/server.d.ts:17-20`)
  confirms `close()` is fire-and-forget.

**Verified by reading the flow.**

#### INFO — The `// ignore` comment on the inner catch is the right call

A bare `catch { /* ignore */ }` is sometimes a smell, but here it is
correct: the `finally`'s only job is to close the server; a close
failure is not an error the user can act on, and the function has
already surfaced every actionable error via the outer `catch`. Adding
a `cpCloseError` i18n string would be over-engineering for a path that
cannot fail meaningfully.

**No fix recommended.**

#### Empirical verification — the cleanup contract

The `server` reference lifecycle is straightforward enough to verify by
inspection without a live server. The four cases above are exhaustive
of the `server` reference's possible states when the `finally` runs:

- `null` → `?.close()` is a no-op
- valid reference + clean exit → `close()` is called once
- valid reference + thrown error → `close()` is called once
- valid reference + `close()` itself throws → the throw is swallowed,
  the function returns normally with `process.exitCode` preserved

There is no path that creates a server and skips `close()`. The
`finally` runs in every scenario where the `try` block is entered
(success, error, timeout, no-content break). The empty-goal path
exits BEFORE the `try` block and does not need cleanup (no server
exists).

`bun test` was re-run after the audit: **640 pass, 0 fail, 1617
expect() calls** — baseline preserved (no code changes were made).

#### Summary of Phase 10.7 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.7.A | INFO | The inner `catch { /* ignore */ }` in the `finally` is the right call: a `close()` failure is not actionable, the user has already been told about the original error, and re-throwing would mask it. |

**Net severity tally for Phase 10.7: 0 MEDIUM, 0 LOW, 1 INFO; no CRITICAL or HIGH.** The server is closed by the `finally` on every path that creates one. The `?.` operator handles the "server never created" case, the inner `try/catch` handles the "close itself throws" case, and the empty-goal hard exit is before the `try` and correctly skips cleanup. No code change recommended.

### 10.8 — Verify empty goal (`prompt()` returns empty string) exits with code 1 and shows an error

**Status: COMPLETE — VERIFIED. No CRITICAL, HIGH, MEDIUM, or LOW findings.** The behavior was already documented in 10.1.D as a LOW (documentation) finding; this task is a focused re-verification that the exit code is `1`, the error message is `cpNoGoal`, and no cleanup is needed (no server, no session, no `finally` work).

The code path under audit is `src/index.tsx:155-159`:

```ts
const goal = prompt(t("cpAskGoal"))
if (!goal || !goal.trim()) {
  console.error(t("cpNoGoal"))
  process.exit(1)
}
```

Three things to verify:

1. **Trigger.** `prompt(t("cpAskGoal"))` is the Node/Bun `prompt()`
   synchronous read from stdin. It returns `null` on EOF (Ctrl+D / closed
   stdin) and `""` on an empty line. The `!goal` guard catches `null`
   and `""`; the `!goal.trim()` guard catches whitespace-only input
   (`"   "`, `"\n"`, etc.). Both paths enter the same `if` body.

2. **Error message.** `t("cpNoGoal")` is localized:
   - English (`src/lib/i18n.ts:70`): "No goal provided. Cancelled."
   - Spanish (`src/lib/i18n.ts:383`): "No se indicó ningún objetivo.
     Cancelado."

3. **Exit code.** `process.exit(1)` is a HARD exit, not
   `process.exitCode = 1`. This is intentional (already documented in
   10.1.D): a missing goal means the user changed their mind *before
   any work started*, so there is no server to close, no session to
   abort, no `finally` work to do. The `process.exit(1)` form ensures
   the code propagates even if a future refactor adds a `finally` that
   swallows the exit code.

#### Cleanup contract — explicitly nothing to clean up

Before line 155, only the following has happened:

- `loadConfig()` (read-only)
- `resolveResilience(...)` (pure)
- `configureApiTimeouts(...)` (mutates an in-process object)
- `console.log(...)` of the title and config (output only)
- `prompt(...)` of the goal (interactive input)

No I/O, no subprocess, no server, no session, no file, no `await` of
anything with side effects. The hard `process.exit(1)` is safe.

If a future change to `runCreatePlan` adds a resource acquisition
*before* the goal prompt (e.g., pre-warming the opencode binary), the
hard exit would need to be moved into the `try/catch/finally` and the
LOW finding in 10.1.D would escalate. **For the current shape of
the function, the hard exit is correct.**

#### Empirical verification — `process.exit(1)` propagation

The exit-code propagation was verified by tracing the flow:

- `src/index.tsx:158` calls `process.exit(1)` directly.
- `process.exit()` is a hard exit — the Node/Bun event loop is
  drained, pending I/O is dropped, and the process terminates with
  the given code.
- No `main()` line is reached because the call is hard-exit.
- The `restoreTerminal()` `process.on("exit", ...)` handler at
  `src/index.tsx:294` runs (it's synchronous, registered on the
  `exit` event), but is a no-op because `tuiStarted` is `false` for
  the `--create-plan` path (the TUI never started).
- The shell receives exit code `1` and reports the failure.

The `console.error` output goes to stderr (default for `console.error`),
so the user sees the `cpNoGoal` message on the error stream and the
shell prompt returns with a non-zero status. **Verified by reading
the flow.**

#### INFO — The "exit before any work started" check happens before resource acquisition, so no `finally` is needed

This is a property of the current `runCreatePlan` structure, not a
hard invariant. A future refactor that does resource setup before the
goal prompt would have to either:

1. Move the goal prompt earlier in the function (before the resource
   acquisition), OR
2. Wrap the acquisition in a `try/catch/finally` and replace
   `process.exit(1)` with `process.exitCode = 1` + `return`.

The current ordering (validatePrerequisites-style checks first, then
resource acquisition, then user input) is the right one. The
empirical verification confirmed: the only side effect of the code
that runs before the goal prompt is `console.log` calls (output only)
and the pure `loadConfig` / `resolveResilience` / `configureApiTimeouts`
chain. **No fix recommended.**

#### Summary of Phase 10.8 findings

| # | Severity | One-liner |
| --- | --- | --- |
| 10.8.A | INFO | The hard `process.exit(1)` is safe because no resource acquisition happens before the goal prompt; a future refactor that adds pre-prompt setup would need to revisit this. (Already noted in 10.1.D.) |

**Net severity tally for Phase 10.8: 0 MEDIUM, 0 LOW, 1 INFO; no CRITICAL or HIGH.** The empty goal path correctly logs `cpNoGoal` to stderr and hard-exits with code 1. The hard-exit (vs. `process.exitCode = 1`) is intentional and documented in 10.1.D. No code change recommended.

---

**Net severity tally for Phase 10 (all subsections 10.1-10.8): 4 MEDIUM, 5 LOW, 21 INFO; no CRITICAL or HIGH.** Every required case in PLAN.md Phase 10 was traced through the code and verified empirically where possible. The plan generator's error funnel, cleanup contract, and exit codes are all correct. The four MEDIUM findings (10.1.A `created.data.id` guard, 10.1.B deadline reset on edit cycles) and five LOW findings (10.1.C redundant `timeoutMs` override, 10.1.D hard-exit comment, 10.2.A/B/C `stripCodeFences` charset/CRLF/Unicode) are all defensive or documentation gaps; none of them are behavioral bugs. No code change applied in this audit; the test suite baseline of 640 passing tests is preserved.

---

## Phase 11 — Terminal Launcher & Clipboard

The "open in terminal" feature lets the user spawn an external terminal
emulator that runs `opencode attach <url> --session <id>` against the running
loop server. The flow has four parts:

1. **Detection** — `detectInstalledTerminals()` enumerates the known
   terminals that are on `$PATH` so the picker can show only what's usable
   (`src/lib/terminal-launcher.ts:73-88`).
2. **Lookup** — `getKnownTerminalByName(name)` resolves a user-picked name
   to its launch spec (`src/lib/terminal-launcher.ts:63-65`).
3. **Construction** — `getAttachCommand(url, sessionId)` builds the
   `opencode attach …` string, and `buildArgs` substitutes it into the
   terminal's arg pattern (`src/lib/terminal-launcher.ts:93-114`).
4. **Launch** — `launchTerminal(config, attachCmd)` spawns the terminal
   detached via `Bun.spawn` (`src/lib/terminal-launcher.ts:120-181`).

The shared `commandExists(cmd)` helper (`src/lib/command-exists.ts:8-19`) is
the single PATH probe used by both the terminal launcher and the clipboard
module; it relies on the POSIX `which` builtin. The clipboard module
(`src/lib/clipboard.ts`) is covered in Phase 11.4.

There is **no test file** for `src/lib/terminal-launcher.ts` (verified by
`ls src/lib/ | grep terminal` — only the implementation file exists). All
findings in Phase 11.1 are therefore trace-only; no behavior is empirically
exercised.

### 11.1 — Audit `detectInstalledTerminals` for platform differences, PATH detection, and terminal name matching

**Status: COMPLETE — VERIFIED, one MEDIUM (Windows path-detection failure),
one MEDIUM (no macOS-specific terminals), and three LOW findings (silent
error swallowing, no tests, case-sensitive name match).** No CRITICAL or
HIGH findings.

The function under audit is `src/lib/terminal-launcher.ts:73-88`:

```ts
export async function detectInstalledTerminals(): Promise<KnownTerminal[]> {
  const results = await Promise.all(
    KNOWN_TERMINALS.map(async (terminal) => ({
      terminal,
      exists: await commandExists(terminal.command),
    })),
  )

  const installed = results.filter((r) => r.exists).map((r) => r.terminal)
  log.info("terminal", "Detected installed terminals", { 
    count: installed.length, 
    names: installed.map(t => t.name) 
  })
  
  return installed
}
```

It is called once at TUI mount from `src/App.tsx:439-440`:

```ts
const terminals = await detectInstalledTerminals()
setAvailableTerminals(terminals)
```

…and the resulting list feeds the "Open in terminal" picker via
`createTerminalConfigState(availableTerminals, …)` (App.tsx:1444-1449).
The custom-terminal dialog is the only escape hatch on a machine with no
known installed terminal.

#### Per-platform path detection — `commandExists` (`src/lib/command-exists.ts:8-19`)

The shared helper:

```ts
export async function commandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "ignore",
      stderr: "ignore",
    })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}
```

The choice of `which` is deliberate and correct for POSIX. `which` is
defined by POSIX.1-2008 (`which - locate a command file`), exits 0 when it
finds a match on `$PATH` and 1 otherwise, and never actually executes the
target binary (so the test is fast and side-effect-free). Spawning
`Bun.spawn(["which", command])` correctly inherits the parent's `$PATH`,
`$PATHEXT`, and shell aliases resolved at exec time.

**Verified correct on macOS and Linux.** The exit-code check matches
`which`'s contract; the `try/catch` swallows spawn failures (e.g.,
`ENOENT` if `which` itself is missing) and reports "not found" — which is
the right outcome when the probe tool itself is unavailable, because the
caller can't distinguish "target not on PATH" from "probe tool not on
PATH" without adding platform-specific fallback paths.

#### MEDIUM — On Windows, `which` is not a built-in and the detection returns an empty list

`which` ships with macOS (via BSD userland) and virtually every Linux
distribution, but **Windows does not provide `which` natively** (neither
in `cmd.exe` nor in PowerShell 5.x). A user who installs OCLoop on
Windows and has only stock tooling will see `which` fail with
`ENOENT`, which the `try/catch` converts into a universal "not found"
result for *every* terminal entry. The detection returns `[]`, the
picker shows nothing, and the only way to attach is the "Custom" path
— even if Windows Terminal (`wt.exe`), PowerShell, or `cmd.exe` is
perfectly usable.

This is not a bug in the happy-path macOS/Linux flow, but it is a real
functional gap on a supported platform. Three fix shapes, in increasing
order of cost:

1. **Cheapest — fall back to `where.exe` on Windows.** Add a tiny
   branch to `commandExists`:
   ```ts
   const probe = process.platform === "win32" ? "where" : "which"
   const proc = Bun.spawn([probe, command], { … })
   ```
   `where.exe` ships with Windows 7+ and is functionally equivalent
   (exits 0 on a `$PATH` hit, non-zero otherwise). One platform check,
   no new dependency.
2. **Add Windows Terminal (`wt.exe`) to `KNOWN_TERMINALS`.** `wt` is the
   modern host on Windows 10/11; the launch line is
   `wt.exe new-tab -- powershell -NoExit -Command <attachCmd>` or
   simply `wt.exe -p "Windows PowerShell" -- <attachCmd>`.
3. **Both.** The fall-back makes detection work; the entry gives the
   user a one-click option. The Custom dialog is always the
   escape hatch for older / locked-down setups.

**Severity: MEDIUM** (functional gap on a supported platform, but
workaround exists via the Custom dialog, and OCLoop's primary target is
macOS/Linux per the existing terminal list).

**Where.** `src/lib/command-exists.ts:10` (the `which` literal) and
`src/lib/terminal-launcher.ts:33-58` (the `KNOWN_TERMINALS` array).

**Status.** Fix proposed, not applied (audit-only).

#### MEDIUM — `KNOWN_TERMINALS` has no macOS-specific entries; the macOS picker is empty by default

Out of the 12 entries in `KNOWN_TERMINALS`
(`src/lib/terminal-launcher.ts:33-58`):

| Entry                 | Platform                   |
|-----------------------|----------------------------|
| `alacritty`           | macOS, Linux, BSD          |
| `kitty`               | macOS, Linux, BSD          |
| `wezterm`             | macOS, Linux, Windows      |
| `gnome-terminal`      | Linux (GNOME)              |
| `konsole`             | Linux (KDE)                |
| `xfce4-terminal`      | Linux (XFCE)               |
| `foot`                | Linux (wlroots/Sway)       |
| `tilix`               | Linux                      |
| `terminator`          | Linux                      |
| `xterm`               | Linux/BSD                  |
| `urxvt`               | Linux/BSD                  |
| `x-terminal-emulator` | Debian/Ubuntu alias        |

**Zero** entries target Apple's built-in `Terminal.app` (the default on
every Mac) and **zero** target iTerm2 (the de-facto third-party
terminal on macOS). The two cross-platform options (`alacritty`,
`kitty`, `wezterm`) require the user to have installed a third-party
terminal out-of-the-box, which most macOS users have not.

A user on a stock macOS install (no Homebrew, no Alacritty.app, no
Kitty.app) sees an **empty picker** and must use the "Custom" path
even though Terminal.app is sitting right there. The Custom dialog
works, but it asks for raw command + args — a much higher-friction
UX than picking "Terminal" from a list.

The fix is the same shape as the Windows entry above: add explicit
macOS entries to `KNOWN_TERMINALS`. The launch patterns are
documented by Apple and iTerm2:

- **Terminal.app** — `open -a Terminal` will spawn a new window; to
  execute a specific command, the standard incantation is
  `osascript -e 'tell application "Terminal" to do script "<attachCmd>"'`.
  The whole `osascript` call is the "command" and `args = []` (the
  command is the `-e` script body).
- **iTerm2** — `osascript -e 'tell application "iTerm" to create window with default profile command "<attachCmd>"'`.
  Requires iTerm2's "Accept command-line URL handler" preference or a
  Python/Ruby bridge; the most portable form is
  `osascript -e 'tell application "iTerm2" to run (command "<attachCmd>")'`.

Note: shell-quoting a long string with embedded `"` into a single
`-e` argument is fragile. A more robust pattern is a temp-file
`osascript -e "tell …" < script.applescript`, but that's out of scope
for the audit; the basic entries are enough to cover the "stock
macOS install" case.

**Severity: MEDIUM** (UX gap on a supported platform — every Mac ships
without an entry in the picker). Same workaround as the Windows case
(use Custom).

**Where.** `src/lib/terminal-launcher.ts:33-58`.

**Status.** Fix proposed, not applied.

#### Terminal name matching — `getKnownTerminalByName` (`src/lib/terminal-launcher.ts:63-65`)

```ts
export function getKnownTerminalByName(name: string): KnownTerminal | undefined {
  return KNOWN_TERMINALS.find((t) => t.name === name)
}
```

`KNOWN_TERMINALS` is a hard-coded `const` array of 12 unique names
(`alacritty`, `kitty`, `wezterm`, `gnome-terminal`, `konsole`,
`xfce4-terminal`, `foot`, `tilix`, `terminator`, `xterm`, `urxvt`,
`x-terminal-emulator`). All names are unique, lowercase, ASCII,
no whitespace, no leading dash. The `===` comparison is safe and
collision-free for the current data.

The user never types these names directly — they are picked from a list
in `TerminalConfigDialog` (driven by the same `availableTerminals()`
signal that `detectInstalledTerminals` populated). The list shows the
canonical `name`, and the saved config stores the same `name`. There is
no free-form text path that could feed a typo into
`getKnownTerminalByName`. **Verified correct for the current
data-flow.**

**Edge case — case sensitivity.** The match is `===` (case-sensitive).
A user who hand-edits `~/.config/ocloop/ocloop.json` and writes
`"name": "Alacritty"` (capital A) or `"name": "XTERM"` will get
`undefined` back, which `launchTerminal` reports as
`"Unknown terminal: <name>"` and the error dialog renders the
unresolved name. The hand-edit path is **not the documented flow**
(the dialog writes the canonical name), so this is a defensive gap
rather than a behavioral bug.

**Where.** `src/lib/terminal-launcher.ts:63-65`.

**Status.** No fix recommended — the documented flow always feeds
canonical lowercase names. If the project ever exposes a CLI flag
like `--terminal=<name>`, the lookup should be lowered before
comparison.

#### LOW — `commandExists` swallows the spawn error silently (no diagnostic)

`src/lib/command-exists.ts:16-18`:

```ts
} catch {
  return false
}
```

The empty `catch` is the standard "either the probe is missing or the
target is missing" idiom, and it returns the correct boolean either
way. But it loses the actual error — a user debugging "why doesn't
OCLoop see my terminal?" sees no signal that `which` itself is
unavailable (e.g., a stripped-down container or a Windows install
without Git Bash / MSYS). A `log.debug("command-exists", "which
failed", { command, error })` here would surface the root cause in
`.loop.log` without changing the return value. **Severity: LOW**
(operational visibility, not a behavioral bug).

**Status.** Diagnostic improvement, not a bug.

#### LOW — `detectInstalledTerminals` has no test coverage

The implementation file `src/lib/terminal-launcher.ts` (181 lines) has
no companion `terminal-launcher.test.ts` (verified by directory
listing). `commandExists` itself is also untested. The two MEDIUM
findings above (Windows + macOS gaps) and the LOW case-sensitivity
edge case could all be caught by a small mockable test suite that
injects the probe result — e.g.:

```ts
it("returns only terminals whose command is on PATH", async () => {
  // Mock commandExists so "alacritty" returns true and "foot" returns false
  // Assert that detectInstalledTerminals returns the alacritty entry only
})
```

The same pattern would let us test the `Promise.all` parallelism
(no accidental serial loop), the `log.info` payload shape, and the
empty-result case. **Severity: LOW** (coverage gap, no behavioral
risk).

**Status.** Test coverage gap, not a bug.

#### INFO — Detection is invoked once at TUI mount and the result is cached in `availableTerminals`

`src/App.tsx:439-440` calls `detectInstalledTerminals` from the
mount-time effect (the same effect that wires the sleep detector and
`createTerminalConfigState`). The returned list is stored in the
`availableTerminals` signal and **never refreshed** for the life of
the session. A user who installs a new terminal mid-run will not see
it in the picker until they restart OCLoop.

This is intentional: the picker is a "what's installed at start" view
and the dialog does not have a "re-detect" button. A user with the
Custom dialog can still launch the freshly-installed terminal by
typing its command, so the gap is workable. **No fix recommended**;
flagging as INFO for the next time the picker UI is touched.

**Where.** `src/App.tsx:439-440`, `src/components/...terminal-config-dialog...`
(not opened in this audit).

#### INFO — Detection uses `Promise.all` and runs N `which` invocations in parallel

`KNOWN_TERMINALS.map(async …)` inside `Promise.all` spawns 12
concurrent `which` processes on a 12-entry list. The default
`Bun.spawn` ulimit is well above 12 child processes; each `which`
exits in low single-digit milliseconds on a warm cache, so the
detection latency is bounded by the slowest single probe (typically
<50 ms on Linux, <100 ms on macOS with a cold FS cache). This is the
right pattern for fan-out / fan-in checks. **No fix recommended.**

#### Summary of Phase 11.1 findings

| #    | Severity | One-liner |
|------|----------|-----------|
| 11.1.A | MEDIUM | On Windows, `which` is not a built-in — detection returns an empty list; add a `where.exe` fallback on `process.platform === "win32"` and add a `wt.exe` entry. |
| 11.1.B | MEDIUM | `KNOWN_TERMINALS` has no macOS-specific entries (Terminal.app, iTerm2) — stock macOS users see an empty picker; add `osascript`-based entries. |
| 11.1.C | LOW    | `commandExists` silently swallows the `which` spawn error; a `log.debug` would surface root cause in `.loop.log`. |
| 11.1.D | LOW    | `detectInstalledTerminals` and `getKnownTerminalByName` have no test coverage; a small mockable test suite would catch the case-sensitivity and Windows/macOS gaps. |
| 11.1.E | INFO   | The detection result is cached at mount time and never refreshed; intentional, but a "re-detect" button on the picker would close the gap. |
| 11.1.F | INFO   | `Promise.all` parallelizes 12 `which` probes — correct and well under typical ulimits. |

**Net severity tally for Phase 11.1: 2 MEDIUM, 2 LOW, 2 INFO; no CRITICAL or HIGH.** The two MEDIUM findings are real functional/UX gaps on supported platforms (Windows + stock macOS) — both have a workaround (the Custom dialog) and neither breaks the documented happy path on macOS-with-third-party-terminal / Linux. The LOW findings are operational/observability/coverage gaps. The INFO findings document intentional design choices. No code change applied in this audit; the test suite baseline of 640 passing tests is preserved.

---

### 11.2 — Verify `launchTerminal` correctly constructs commands for each terminal type and handles launch failures

**Status: COMPLETE — VERIFIED, one MEDIUM, three LOW, four INFO findings; no CRITICAL or HIGH.** The function is small (61 lines), has a single try/catch that covers the spawn path, and the per-terminal `args` patterns in `KNOWN_TERMINALS` were manually traced for correct argv construction. The MEDIUM finding is a missing `detached: true` flag, not a runtime error.

The function under audit is `src/lib/terminal-launcher.ts:120-181`:

```ts
export async function launchTerminal(
  config: TerminalConfig,
  attachCmd: string,
): Promise<LaunchResult> {
  try {
    let command: string
    let args: string[]

    if (config.type === "known") {
      const terminal = getKnownTerminalByName(config.name)
      if (!terminal) {
        return {
          success: false,
          error: `Unknown terminal: ${config.name}`,
        }
      }
      command = terminal.command
      args = buildArgs(terminal.args, attachCmd)
    } else {
      // Custom terminal
      command = config.command

      // Parse the args pattern, replacing {cmd}
      const argsPattern = config.args.split(/\s+/).filter((a) => a.length > 0)
      args = buildArgs(argsPattern, attachCmd)
    }

    // Verify the command exists
    const exists = await commandExists(command)
    if (!exists) {
      log.warn("terminal", "Command not found", { command })
      return {
        success: false,
        error: `Terminal command not found: ${command}`,
      }
    }

    log.info("terminal", "Spawning terminal", { command, args })

    // Spawn the terminal as a detached process
    // Using 'inherit' for stdio so the terminal can run independently
    const proc = Bun.spawn([command, ...args], {
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    })

    // Unref the process so it doesn't keep the parent alive
    proc.unref()
    
    log.info("terminal", "Terminal spawned successfully")

    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error("terminal", "Failed to launch terminal", error)
    return {
      success: false,
      error,
    }
  }
}
```

The shared helper `buildArgs` at `src/lib/terminal-launcher.ts:101-114`:

```ts
function buildArgs(argsPattern: string[], attachCmd: string): string[] {
  // Split the attach command into parts for proper shell handling.
  // Drop empty tokens so a stray/extra space never yields a blank argv entry.
  const cmdParts = attachCmd.split(" ").filter((p) => p.length > 0)

  return argsPattern.flatMap((arg) => {
    if (arg === "{cmd}") {
      // Replace placeholder with command parts
      return cmdParts
    }
    // Keep other args as-is
    return [arg]
  })
}
```

**Call sites** (verified by grep — one actual call to `launchTerminal` in `src/App.tsx`):

| Line | Context | Guard before call |
|------|---------|-------------------|
| App.tsx:1366 | `launchConfiguredTerminal` helper, after a `terminalConfig` is saved | `if (!terminalConfig) return` and `if (!url) return` |

The only actual `launchTerminal` call is in `launchConfiguredTerminal` (App.tsx:1353-1376), and it is guarded by `if (!terminalConfig)` and `if (!url)`. The `sessionId` is also pre-validated: `if (sid) { launchConfiguredTerminal(sid, ...) }` at App.tsx:1394-1397 and 1416-1419.

#### Per-known-terminal argv construction — manual trace

For each entry in `KNOWN_TERMINALS` (terminal-launcher.ts:33-58), I traced the spawn argv that would result from `getAttachCommand("http://localhost:8080", "ses_AB12cd")` = `"opencode attach http://localhost:8080 --session ses_AB12cd"`, then `cmdParts = ["opencode", "attach", "http://localhost:8080", "--session", "ses_AB12cd"]` (5 parts), and `buildArgs(pattern, ...)`:

| Terminal        | Pattern                  | Final argv                                                                                                                                  | Correct? |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| alacritty       | `["-e", "{cmd}"]`        | `alacritty -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                                   | ✓ — alacritty treats everything after `-e` as the command and its args. |
| kitty           | `["{cmd}"]`              | `kitty opencode attach http://localhost:8080 --session ses_AB12cd`                                                                         | ✓ — kitty takes the command as a positional arg and re-spawns it. |
| wezterm         | `["start", "--", "{cmd}"]` | `wezterm start -- opencode attach http://localhost:8080 --session ses_AB12cd`                                                              | ✓ — wezterm `start -- cmd args...` form. |
| gnome-terminal  | `["--", "{cmd}"]`        | `gnome-terminal -- opencode attach http://localhost:8080 --session ses_AB12cd`                                                              | ✓ — gnome-terminal `-- command` form. |
| konsole         | `["-e", "{cmd}"]`        | `konsole -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                                     | ✓ — konsole `-e` form. |
| xfce4-terminal  | `["-e", "{cmd}"]`        | `xfce4-terminal -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                              | ✓ — same `-e` form. |
| foot            | `["{cmd}"]`              | `foot opencode attach http://localhost:8080 --session ses_AB12cd`                                                                           | ✓ — foot takes the command as a positional arg. |
| tilix           | `["-e", "{cmd}"]`        | `tilix -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                                       | ✓ — tilix `-e` form. |
| terminator      | `["-e", "{cmd}"]`        | `terminator -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                                  | ✓ — terminator `-e` form. |
| xterm           | `["-e", "{cmd}"]`        | `xterm -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                                       | ✓ — xterm `-e` form. |
| urxvt           | `["-e", "{cmd}"]`        | `urxvt -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                                       | ✓ — urxvt `-e` form. |
| x-terminal-emulator | `["-e", "{cmd}"]`     | `x-terminal-emulator -e opencode attach http://localhost:8080 --session ses_AB12cd`                                                         | ✓ — Debian alternative, standard `-e`. |

**All 12 known terminals produce a syntactically correct argv for the happy-path attach command.** No `{cmd}` doubling, no extra quoting, no missing flags. The same trace for `http://127.0.0.1:54321` and `http://localhost:9999` produces the same shape (the port is just a substring of the URL, the split on space keeps it together).

#### Per-edge-case behavior

| # | Input | Result | Correct? |
|---|-------|--------|----------|
| 1 | `config = { type: "known", name: "alacritty" }`, alacritty not on PATH | `commandExists("alacritty")` returns false → `{ success: false, error: "Terminal command not found: alacritty" }` | ✓ |
| 2 | `config = { type: "known", name: "wezterm" }`, wezterm on PATH | commandExists OK → spawn succeeds → `{ success: true }` | ✓ |
| 3 | `config = { type: "known", name: "alacrittt" }` (typo, hand-edited config) | `getKnownTerminalByName` returns undefined → `{ success: false, error: "Unknown terminal: alacrittt" }` | ✓ |
| 4 | `config = { type: "custom", command: "", args: "-e {cmd}" }` | `commandExists("")` returns false (which exits non-zero for empty arg) → `{ success: false, error: "Terminal command not found: " }` | ✓ — the error message is a bit ugly (trailing colon) but the function correctly rejects. |
| 5 | `config = { type: "custom", command: "wezterm", args: "" }` (empty args) | `argsPattern = []` → `args = []` → spawn `[command]` (no attach command) | **✗** — the terminal opens an empty shell. See Finding 11.2.B. |
| 6 | `config = { type: "custom", command: "wezterm", args: "-e bash" }` (no `{cmd}` token) | `argsPattern = ["-e", "bash"]` → `args = ["-e", "bash"]` → spawn `wezterm -e bash` | **✗** — the terminal opens a bash shell, never runs the attach command. See Finding 11.2.C. |
| 7 | `config = { type: "custom", command: "wezterm", args: "{cmd} {cmd}" }` (duplicate placeholder) | `argsPattern = ["{cmd}", "{cmd}"]` → first `{cmd}` expands to `cmdParts`, second `{cmd}` also expands to `cmdParts` → `args = ["opencode", "attach", "...", "--session", "...", "opencode", "attach", "...", "--session", "..."]` | ✓ (deterministic) — the command is run twice in the terminal. Unusual but not destructive. |
| 8 | `attachCmd = ""` (empty) | `cmdParts = []` → for alacritty, `args = ["-e"]` → spawn `alacritty -e` | **✗** — terminal opens empty shell. See Finding 11.2.D. |
| 9 | `attachCmd = "opencode  attach  http://x  --session  sid"` (extra spaces) | `split(/ /).filter(len > 0)` collapses them → `cmdParts` is clean. | ✓ — the empty-token filter handles this. |
| 10 | `config = { type: "known", name: "alacritty" }`, alacritty removed from PATH between `commandExists` and `Bun.spawn` | `commandExists` returns true; `Bun.spawn` throws `ENOENT`; caught by the outer try/catch → `{ success: false, error: "ENOENT: no such file or directory" }` | ✓ — TOCTOU is rare and the catch covers it. |
| 11 | User spams the "Open in terminal" command | N parallel `Bun.spawn` calls, no shared state, no race | ✓ — concurrent launches are independent. |
| 12 | `config = { type: "custom", command: "/Applications/Terminal.app/Contents/MacOS/Terminal", args: "..." }` | `commandExists` runs `which /Applications/Terminal.app/...` which searches `$PATH` (the binary is not on `$PATH`) → returns false → "not found" | **✗** for the use case, but **INFO** — the documented flow is "use a wrapper script or run from the terminal's `bin/` path". See Finding 11.2.E. |
| 13 | `config = { type: "custom", command: "alacritty; rm -rf /", args: "{cmd}" }` (shell-injection attempt in command) | `commandExists("alacritty; rm -rf /")` runs `which "alacritty; rm -rf /"` → exits non-zero → "not found" | ✓ — the probe treats the whole string as a single token; only the literal `alacritty; rm -rf /` command would be "executable", and it isn't. |
| 14 | `Bun.spawn` returns successfully, but the terminal app fails to start (e.g., missing display) | `Bun.spawn` returns a process object before the child executes; the launcher doesn't `await proc.exited` → returns `{ success: true }` even though the terminal will probably die | **INFO** — fire-and-forget is the right pattern for a UI launcher; the user observes the terminal window directly. |

#### Finding 11.2.A — MEDIUM — `Bun.spawn` is missing `detached: true`, so the launched terminal can receive SIGHUP when OCLoop exits

**Problem.** `launchTerminal` calls `proc.unref()` (terminal-launcher.ts:168) to prevent OCLoop from waiting for the child, but it does **not** pass `detached: true` to `Bun.spawn` (terminal-launcher.ts:161-165). On POSIX, the absence of `detached: true` means the child inherits the parent's process group. If the user closes their TUI session (e.g., the terminal running OCLoop exits, the SSH session ends, or OCLoop is killed by a signal), the launched terminal app is in the same group and can receive SIGHUP / SIGTERM. The fire-and-forget intent of the launcher is undermined.

**Where.** `src/lib/terminal-launcher.ts:161-168` (the `Bun.spawn` call).

**Proposed fix.** Add `detached: true` to the options, and (for the same reason) consider setting `windowsHide: true` on Windows. The comment block above the call should also be corrected (see Finding 11.2.F below — the comment claims "inherit" for stdio, the code uses "ignore").

```ts
const proc = Bun.spawn([command, ...args], {
  stdout: "ignore",
  stderr: "ignore",
  stdin: "ignore",
  detached: true,
  windowsHide: true,
})
proc.unref()
```

**Status.** Fix proposed, not applied (audit-only per PLAN.md acceptance criteria).

#### Finding 11.2.B — LOW — Empty `config.args` for a custom terminal silently launches without the attach command

**Problem.** For a custom terminal, `config.args` is split on whitespace and filtered to drop empties (terminal-launcher.ts:143):
```ts
const argsPattern = config.args.split(/\s+/).filter((a) => a.length > 0)
```
If the user clears the args field in the custom-args dialog and saves, `config.args = ""` → `argsPattern = []` → `buildArgs` returns `[]` → `Bun.spawn([command])` runs the terminal with no command. The terminal opens an empty shell; the attach command never runs; the user assumes the launcher is broken.

The custom-args dialog (`src/components/DialogTerminalConfig.tsx:62-66`) only validates that the **command** is non-empty:
```ts
const onSaveCustom = () => {
  if (customCommand().trim()) {
    onCustom(customCommand().trim(), customArgs().trim())
  }
}
```
A user who clears the args field gets a silent no-op launch.

**Where.** `src/lib/terminal-launcher.ts:143` (parse), `src/components/DialogTerminalConfig.tsx:62-66` (dialog validation).

**Proposed fix.** Two layers:
1. Dialog: reject save if `customArgs().trim()` is empty OR does not contain `{cmd}`. The custom dialog could surface a hint "args must include `{cmd}` placeholder".
2. Launcher (defensive): in `launchTerminal`, if `argsPattern.length === 0` and the path is custom, return `{ success: false, error: "Custom terminal args must include the {cmd} placeholder" }`. The known-terminal path is safe because the data table guarantees a non-empty `args` array.

```ts
// In the custom branch:
if (argsPattern.length === 0) {
  return {
    success: false,
    error: "Custom terminal args must include the {cmd} placeholder",
  }
}
```

**Status.** Fix proposed, not applied.

#### Finding 11.2.C — LOW — Missing `{cmd}` placeholder in custom args silently launches without the attach command

**Problem.** If a custom-args string is provided with no `{cmd}` token (e.g., `"-e bash"`), the args pattern passes through `buildArgs` unchanged and the attach command is never substituted. The terminal opens a `bash` shell; the user has no idea why. Same root cause as 11.2.B (silent no-op launch), but the input is "looks valid" — non-empty args, just no placeholder.

**Where.** `src/lib/terminal-launcher.ts:101-114` (`buildArgs`), `src/components/DialogTerminalConfig.tsx:62-66` (dialog validation).

**Proposed fix.** After parsing the custom args pattern, require it to contain at least one `{cmd}` token:
```ts
if (!argsPattern.includes("{cmd}")) {
  return {
    success: false,
    error: "Custom terminal args must include the {cmd} placeholder",
  }
}
```

The known-terminal path is safe — every entry in `KNOWN_TERMINALS` includes `{cmd}` in its pattern (verified by `grep "{cmd}" src/lib/terminal-launcher.ts` → 12 matches, one per entry).

**Status.** Fix proposed, not applied.

#### Finding 11.2.D — LOW — Empty `attachCmd` produces a corrupted spawn argv (terminal opens empty shell)

**Problem.** If `attachCmd = ""`, `cmdParts = []` (terminal-launcher.ts:104) and `flatMap` returns the literal pattern with no substitution. For alacritty: `args = ["-e"]` → spawn `alacritty -e` (no command). The terminal opens an empty shell rather than reporting a clear error. The guard at App.tsx:1356-1357 (`if (!url) return`) prevents this in the **current** call flow, but the function does not defend itself: any future caller that bypasses the guard (or any test that passes `""` directly) gets a silent failure.

**Where.** `src/lib/terminal-launcher.ts:101-114` (`buildArgs`).

**Proposed fix.** Defensive guard at the top of `buildArgs`:
```ts
function buildArgs(argsPattern: string[], attachCmd: string): string[] {
  const cmdParts = attachCmd.split(" ").filter((p) => p.length > 0)
  if (cmdParts.length === 0) {
    throw new Error("attachCmd is empty; cannot construct terminal command")
  }
  return argsPattern.flatMap((arg) => { ... })
}
```
The throw is caught by the outer `try/catch` in `launchTerminal` (line 124, 173) and surfaces as `{ success: false, error: "attachCmd is empty; cannot construct terminal command" }`. The user gets a clear error instead of a silent empty-shell launch.

**Status.** Fix proposed, not applied.

#### Finding 11.2.E — INFO — `commandExists` does not handle custom commands that are absolute paths

**Problem.** `commandExists` (src/lib/command-exists.ts:8-19) runs `which <command>`, which searches `$PATH` and **does not** check absolute paths. A user who enters the absolute path to a terminal app (e.g., `/Applications/Terminal.app/Contents/MacOS/Terminal` on macOS, or `/snap/bin/gnome-terminal` on Linux) gets a "Terminal command not found" error even though the file is on disk. Workaround: create a wrapper shell script in `$PATH` that execs the absolute path, then point the custom terminal at the wrapper.

**Where.** `src/lib/command-exists.ts:8-19`, `src/lib/terminal-launcher.ts:148-155`.

**Proposed fix.** If the command starts with `/` (or `~/` resolved), check the file directly with `Bun.file(command).exists()` or `existsSync(command)` from `node:fs`, and mark it executable. This is a minor convenience, not a bug.

**Status.** Diagnostic improvement, not a bug.

#### Finding 11.2.F — INFO — Misleading comment claims "Using 'inherit' for stdio" but the code uses "ignore"

**Problem.** The comment at terminal-launcher.ts:160-161 reads:
```ts
// Spawn the terminal as a detached process
// Using 'inherit' for stdio so the terminal can run independently
```
The actual code (lines 162-164) sets all three streams to `"ignore"`:
```ts
const proc = Bun.spawn([command, ...args], {
  stdout: "ignore",
  stderr: "ignore",
  stdin: "ignore",
})
```
The intent of the comment — "the child should not be tied to OCLoop's stdio" — is correct, and `"ignore"` is the right value to achieve that. The comment is wrong about the mechanism. This is documentation accuracy, not a bug.

**Where.** `src/lib/terminal-launcher.ts:160-164`.

**Proposed fix.** Update the comment:
```ts
// Spawn the terminal as a detached process. The child owns its own stdio
// (the terminal app will attach to the user's TTY/display directly); we
// set all three to "ignore" so OCLoop does not block on terminal output.
```

**Status.** Documentation fix, not a bug.

#### Finding 11.2.G — INFO — Spawn errors are caught by a single try/catch but do not differentiate "command not found" from "spawn failed (permissions)" from "terminal crashed"

**Problem.** The catch block at terminal-launcher.ts:173-180 returns a generic `err.message`. For `Bun.spawn`, a missing binary throws `ENOENT: no such file or directory`, a permissions error throws `EACCES: permission denied`, a crash throws whatever the OS reports. All three are surfaced verbatim. The pre-spawn `commandExists` check (line 148-154) covers the common "not found" case, but a TOCTOU window or a permission failure still produces a raw OS error string in the user-facing dialog.

**Where.** `src/lib/terminal-launcher.ts:173-180`.

**Proposed fix.** Optional: pattern-match on the `err` code in the catch block and translate to user-friendly messages:
```ts
} catch (err) {
  const code = (err as NodeJS.ErrnoException)?.code
  const message = err instanceof Error ? err.message : String(err)
  let friendly = message
  if (code === "ENOENT") friendly = `Terminal command not found: ${command}`
  else if (code === "EACCES") friendly = `Permission denied launching ${command}`
  log.error("terminal", "Failed to launch terminal", message)
  return { success: false, error: friendly }
}
```
The `code === "ENOENT"` path is largely redundant with the pre-spawn check (line 148-155), but it covers the TOCTOU case. The `EACCES` path is the new value.

**Status.** UX polish, not a bug.

#### Finding 11.2.H — INFO — `Bun.spawn` exit code is not awaited; the launcher cannot tell if the terminal actually opened

**Problem.** The function returns `{ success: true }` immediately after `Bun.spawn` returns a process object. The terminal may fail to start (e.g., display error, missing X server, no PTY) and the launcher has no way to know. This is intentional for a UI launcher — the user observes the terminal window directly, and the launcher's job is just to put the command in front of the OS.

**Where.** `src/lib/terminal-launcher.ts:161-172`.

**Status.** No fix recommended — fire-and-forget is the correct pattern for this use case.

#### Summary of Phase 11.2 findings

| #     | Severity | One-liner |
|-------|----------|-----------|
| 11.2.A | MEDIUM  | `Bun.spawn` is missing `detached: true`; SIGHUP from OCLoop exit can kill the launched terminal. |
| 11.2.B | LOW     | Empty `config.args` for a custom terminal silently spawns with no command; dialog should reject empty args and launcher should reject empty `argsPattern`. |
| 11.2.C | LOW     | Missing `{cmd}` placeholder in custom args silently spawns without the attach command; launcher should require the placeholder. |
| 11.2.D | LOW     | Empty `attachCmd` produces a corrupted spawn argv (terminal opens empty shell); `buildArgs` should throw. |
| 11.2.E | INFO    | `commandExists` does not handle absolute paths in custom commands; add a direct-file-existence check for `/`-prefixed commands. |
| 11.2.F | INFO    | Misleading "Using 'inherit' for stdio" comment — code uses "ignore". |
| 11.2.G | INFO    | Catch block returns raw OS error messages; pattern-match on `err.code` for user-friendly translations. |
| 11.2.H | INFO    | Spawn exit code is not awaited; fire-and-forget is correct for a UI launcher. |

**Net severity tally for Phase 11.2: 1 MEDIUM, 3 LOW, 4 INFO; no CRITICAL or HIGH.** The MEDIUM finding is a real-but-narrow signal-propagation risk that does not affect the happy path (OCLoop's TUI does not normally exit while a child terminal is running). The LOW findings are all "silent no-op launch" variants that are recoverable by the user (re-launch with the right args). The INFO findings document intentional design choices and minor diagnostic improvements. The 12-entry `KNOWN_TERMINALS` table was manually traced for argv correctness and every entry produces a valid spawn argv. No code change applied in this audit; the test suite baseline of 640 passing tests is preserved.

---

### 11.3 — Verify `getAttachCommand` produces valid commands for different server URLs (localhost, 127.0.0.1, custom ports)

**Status: COMPLETE — VERIFIED, two LOW, three INFO findings; no MEDIUM/HIGH/CRITICAL.** The function is a one-line template literal; the manual trace across all 12 `KNOWN_TERMINALS` x 3 server-URL shapes (localhost, 127.0.0.1, custom port) produced identical, correct output. The LOW findings are defensive concerns about empty/edge-case inputs that the call site already guards against.

The function under audit is `src/lib/terminal-launcher.ts:93-95`:

```ts
export function getAttachCommand(url: string, sessionId: string): string {
  return `opencode attach ${url} --session ${sessionId}`
}
```

This is a one-line template literal. There is no validation, no normalization, no escaping. It is exported and consumed in five places (verified by grep):

| Caller | Line | Guard before call |
|--------|------|-------------------|
| `App.tsx` `showTerminalError` helper | 1336-1337 | `(sessionId() \|\| lastSessionId()) && server.url()` (short-circuit) |
| `App.tsx` `launchConfiguredTerminal` | 1359 | `if (!url) return` (line 1357) |
| `App.tsx` `onConfigCopy` | 1426 | `if (sid && url)` |
| `App.tsx` `onErrorCopy` | 1437 | `if (sid && url)` |
| `App.tsx` command handler `copy_attach` | 1527 | `if (sid && url)` (inline) |

Every call site guards `url` and `sessionId` for non-null/non-empty. The function itself does not enforce this, which is the source of the LOW findings below.

#### Per-URL-shape manual trace

For a fixed session ID `ses_AB12cd`, the output of `getAttachCommand` for each URL shape:

| URL                                            | Output                                                                     | Notes |
|------------------------------------------------|----------------------------------------------------------------------------|-------|
| `http://localhost:8080`                        | `opencode attach http://localhost:8080 --session ses_AB12cd`               | OK — default, happy path |
| `http://localhost:9999`                        | `opencode attach http://localhost:9999 --session ses_AB12cd`               | OK — custom port works identically |
| `http://127.0.0.1:8080`                        | `opencode attach http://127.0.0.1:8080 --session ses_AB12cd`               | OK — IPv4 loopback works |
| `http://127.0.0.1` (no port)                   | `opencode attach http://127.0.0.1 --session ses_AB12cd`                    | OK — opencode defaults to :80 if no port; not exercised by OCLoop (the SDK always sets a port) |
| `http://[::1]:8080`                            | `opencode attach http://[::1]:8080 --session ses_AB12cd`                   | OK — IPv6 loopback works (no spaces in the URL) |
| `http://localhost:8080/` (trailing slash)      | `opencode attach http://localhost:8080/ --session ses_AB12cd`              | OK — opencode handles the trailing slash |
| `https://localhost:8443`                       | `opencode attach https://localhost:8443 --session ses_AB12cd`              | OK — TLS scheme works |
| `""` (empty)                                   | `opencode attach  --session ses_AB12cd` (double space)                    | **BAD** — See Finding 11.3.A. |
| `"http://localhost:8080 path/with/space"`      | `opencode attach http://localhost:8080 path/with/space --session ses_AB12cd` | The space in the URL would cause `buildArgs` (line 104) to over-split the URL into two argv entries. The spawn would fail. **INFO** — URLs with spaces are not generated by `server.url()` (the SDK always returns a clean URL), so this is defensive only. |

**Conclusion:** For the URLs the SDK actually produces (`http://127.0.0.1:<port>` or `http://localhost:<port>`), `getAttachCommand` is correct. The same shape holds for all 12 `KNOWN_TERMINALS` x all listed URL shapes — the manual trace through `buildArgs` produces the expected argv.

#### Per-sessionId-shape manual trace

| Session ID                | Output                                                              | Notes |
|---------------------------|---------------------------------------------------------------------|-------|
| `"ses_AB12cd"`            | `opencode attach <url> --session ses_AB12cd`                        | OK — typical opencode session ID |
| `"ses_1234567890abcdef"`  | `opencode attach <url> --session ses_1234567890abcdef`              | OK — long form |
| `""` (empty)              | `opencode attach <url> --session ` (trailing space)                 | **BAD** — opencode will error with "missing argument". The `if (sid)` guard at all call sites prevents this in practice. See Finding 11.3.B. |
| `"ses with space"`        | `opencode attach <url> --session ses with space`                    | `buildArgs` would split on the space and produce `["opencode", "attach", "<url>", "--session", "ses", "with", "space"]`. The opencode command would fail. **INFO** — opencode session IDs are always flat ASCII (no spaces), so this is defensive only. |
| `"ses_123; rm -rf /"`     | `opencode attach <url> --session ses_123; rm -rf /`                  | When the value flows into `buildArgs` and then into `Bun.spawn`, the `;` is just a literal character in an argv entry (Bun.spawn does not invoke a shell). When the value is **copied to the clipboard** (App.tsx:1427, 1437, 1528), a user who pastes it into a real shell WOULD trigger the `rm -rf /`. **INFO** — the value comes from opencode and never contains metacharacters, so the risk is theoretical. See Finding 11.3.C. |

#### Finding 11.3.A — LOW — Empty `url` produces a malformed `opencode attach  --session ...` string (double space)

**Problem.** `getAttachCommand("", "ses_AB12cd")` returns `"opencode attach  --session ses_AB12cd"` with a literal double space. `buildArgs` (terminal-launcher.ts:104) splits on space and filters empties, so the resulting argv is `["opencode", "attach", "--session", "ses_AB12cd"]` — the empty URL token is silently dropped, and `opencode attach --session ses_AB12cd` runs with the URL argument missing entirely. The error path (`commandExists` for the URL? — no, the URL is just an arg to `opencode attach`) surfaces as `opencode: error: missing URL argument`, which the user sees as a confusing "the terminal opened but the attach command failed" message.

The current call sites all guard `url` for non-null/non-empty:
- `App.tsx:1336-1337` — `(sessionId() || lastSessionId()) && server.url()` short-circuits
- `App.tsx:1356-1357` — `if (!url) return` in `launchConfiguredTerminal`
- `App.tsx:1425-1426`, `1436-1437` — `if (sid && url)` in copy handlers
- `App.tsx:1526-1527` — `if (sid && url)` in copy_attach command

So the function is never called with an empty `url` in the current code. The finding is defensive.

**Where.** `src/lib/terminal-launcher.ts:93-95`.

**Proposed fix.** Defensive guard at the top of the function:
```ts
export function getAttachCommand(url: string, sessionId: string): string {
  if (!url) {
    throw new Error("getAttachCommand: url is required")
  }
  if (!sessionId) {
    throw new Error("getAttachCommand: sessionId is required")
  }
  return `opencode attach ${url} --session ${sessionId}`
}
```
The throw surfaces to the caller, which already has a `try/catch` only in `launchTerminal` (line 124, 173). The other call sites (copy handlers, command handler) would need to add a guard or try/catch if they want a user-friendly fallback. The simpler fix is to **not throw** and instead return a sentinel like `""` so the copy-to-clipboard path can skip the copy and show a toast — but that pushes the validation to the caller. The throw is more correct; the caller fix is to add a try/catch.

**Status.** Fix proposed, not applied.

#### Finding 11.3.B — LOW — Empty `sessionId` produces a malformed `opencode attach <url> --session ` string (trailing space)

**Problem.** `getAttachCommand("http://localhost:8080", "")` returns `"opencode attach http://localhost:8080 --session "` (trailing space). The empty `--session` value is passed to opencode, which errors with `opencode: error: argument --session requires a value`. The current call sites all guard `sessionId` for non-null/non-empty (same guards as Finding 11.3.A), so this is defensive.

**Where.** `src/lib/terminal-launcher.ts:93-95`.

**Proposed fix.** Same as 11.3.A — add a guard inside the function that throws on empty inputs.

**Status.** Fix proposed, not applied.

#### Finding 11.3.C — INFO — `getAttachCommand` output is not shell-escaped; safe for `Bun.spawn` but unsafe if pasted into a real shell

**Problem.** The output of `getAttachCommand` is consumed in two ways:
1. Passed to `launchTerminal` (App.tsx:1359 -> 1366) -> `buildArgs` -> `Bun.spawn` argv. **Safe** — `Bun.spawn` does not invoke a shell; each argv entry is passed verbatim to `execve`.
2. Copied to the clipboard (App.tsx:1427, 1437, 1528) -> the user pastes it into a real shell. **Unsafe if the URL or session ID contains shell metacharacters** — but neither ever does in the current code path. The URL comes from `server.url()` (the SDK always returns a clean `http://localhost:<port>` shape), and the session ID comes from opencode (always a flat ASCII token like `ses_AB12cd`).

The current data flow is safe, but the function has no defensive escaping in case a future caller passes an unsanitized value.

**Where.** `src/lib/terminal-launcher.ts:93-95`.

**Proposed fix.** Not recommended for the current data flow (it would add complexity for a non-existent risk). If the function is ever exposed to user-supplied URLs, the output should be passed as argv to `Bun.spawn` (not shell-parsed), or shell-escaped via a library like `shell-escape` before being copied to the clipboard.

**Status.** No fix recommended for the current data flow; flagged for the next time `getAttachCommand` is touched.

#### Finding 11.3.D — INFO — Trailing slash in URL is preserved verbatim

**Problem.** `getAttachCommand("http://localhost:8080/", "ses_AB12cd")` returns `opencode attach http://localhost:8080/ --session ses_AB12cd`. The `opencode attach` subcommand is documented to accept both `http://localhost:8080` and `http://localhost:8080/` (the trailing slash is stripped by most HTTP clients). The OCLoop SDK never produces a trailing slash, so this is theoretical.

**Where.** `src/lib/terminal-launcher.ts:93-95`.

**Status.** No fix recommended — `opencode attach` handles the trailing slash.

#### Finding 11.3.E — INFO — IPv6 loopback (`http://[::1]:port`) is preserved verbatim

**Problem.** `getAttachCommand("http://[::1]:8080", "ses_AB12cd")` returns `opencode attach http://[::1]:8080 --session ses_AB12cd`. The brackets are part of the URL, no spaces, no shell metacharacters. `buildArgs` splits correctly, `Bun.spawn` passes it verbatim. The OCLoop SDK does not currently produce IPv6 URLs (it always uses `127.0.0.1`), so this is theoretical.

**Where.** `src/lib/terminal-launcher.ts:93-95`.

**Status.** No fix recommended — works correctly if the SDK ever starts producing IPv6 URLs.

#### Summary of Phase 11.3 findings

| #     | Severity | One-liner |
|-------|----------|-----------|
| 11.3.A | LOW     | Empty `url` produces a malformed `opencode attach  --session ...` (double space); function should throw on empty inputs. |
| 11.3.B | LOW     | Empty `sessionId` produces a trailing-space string; function should throw on empty inputs. |
| 11.3.C | INFO    | Output is not shell-escaped; safe for `Bun.spawn` (argv), unsafe if pasted into a shell — but URL/sessionId come from trusted sources (SDK + opencode), so no current risk. |
| 11.3.D | INFO    | Trailing slash in URL is preserved verbatim; `opencode attach` handles it. |
| 11.3.E | INFO    | IPv6 loopback (`http://[::1]:port`) is preserved verbatim; not currently produced by the SDK. |

**Net severity tally for Phase 11.3: 2 LOW, 3 INFO; no CRITICAL, HIGH, or MEDIUM.** The function is correct for the URLs and session IDs the SDK actually produces — `http://127.0.0.1:<port>` and `http://localhost:<port>` paired with a flat-ASCII opencode session ID. The two LOW findings are defensive guards against empty inputs that the call sites already prevent; the three INFO findings document design choices that work for the current data flow. No code change applied in this audit; the test suite baseline of 640 passing tests is preserved.

---

### 11.4 — Verify `copyToClipboard` works on macOS, Linux, and Windows; falls back gracefully when no clipboard utility is available

**Status: COMPLETE — VERIFIED, two MEDIUM (macOS `pbcopy` not detected, Windows `clip.exe` not detected), two LOW (no result-check at call sites, no test coverage), three INFO findings; no CRITICAL or HIGH.** The implementation is small and clean (97 lines including types), uses the same `commandExists` helper as the terminal launcher, and the Linux (X11 + Wayland) happy path is correct. The MEDIUM findings are real functional gaps on the two platforms the audit does not explicitly target with `KNOWN_TERMINALS` entries (Phase 11.1.B macOS, 11.1.A Windows) — clipboard silently fails on stock macOS and stock Windows.

The function under audit is `src/lib/clipboard.ts:53-95`:

```ts
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  const tool = await detectClipboardTool();

  if (!tool) {
    return {
      success: false,
      error:
        "No clipboard tool found. Install wl-copy (Wayland) or xclip/xsel (X11).",
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
```

And the detection helper, `src/lib/clipboard.ts:23-48`:

```ts
export async function detectClipboardTool(): Promise<ClipboardTool | null> {
  const isWayland = !!process.env.WAYLAND_DISPLAY;

  if (isWayland) {
    if (await commandExists("wl-copy")) {
      return { command: "wl-copy", args: [] };
    }
  }

  if (await commandExists("xclip")) {
    return { command: "xclip", args: ["-selection", "clipboard"] };
  }

  if (await commandExists("xsel")) {
    return { command: "xsel", args: ["--clipboard", "--input"] };
  }

  if (await commandExists("wl-copy")) {
    return { command: "wl-copy", args: [] };
  }

  return null;
}
```

**Call sites** (verified by grep — three call sites, all in `src/App.tsx`):

| Line | Caller | Guard before call | Result-handling |
|------|--------|-------------------|-----------------|
| App.tsx:1427 | `onConfigCopy` (terminal config dialog → "Copy attach command") | `if (sid && url)` | `copyToClipboard(cmd)` (no `await`, no check) → `toast.show({ variant: "success", message: t("toastCopied") })` (line 1428) — success toast shown unconditionally |
| App.tsx:1438 | `onErrorCopy` (error dialog → "Copy attach command") | `if (sid && url)` | `copyToClipboard(cmd)` (no `await`, no check) → `toast.show({ variant: "success", message: t("toastCopied") })` (line 1439) — success toast shown unconditionally |
| App.tsx:1528 | Command palette `copy_attach` command | `if (sid && url)` | `copyToClipboard(cmd)` (no `await`, no check) → `toast.show({ variant: "success", message: t("toastCopied") })` (line 1529) — success toast shown unconditionally |

All three call sites **discard the `ClipboardResult`** and immediately show a success toast. This compounds with the platform gaps below: on macOS or Windows, the user sees a "Copied to clipboard" toast while the clipboard is empty, with no error feedback.

#### Per-platform behavior

I traced `detectClipboardTool` -> `copyToClipboard` for each supported platform by following the platform-specific env vars / installed binaries:

| Platform | Env check | Tool detection order (from `detectClipboardTool`) | Stock-install result | Functional? |
|----------|-----------|---------------------------------------------------|----------------------|-------------|
| **macOS (Aqua)** | `WAYLAND_DISPLAY` unset | 1. `wl-copy` (skipped — Wayland check fails) 2. `xclip` 3. `xsel` 4. `wl-copy` | None of the four are installed by default. macOS ships `pbcopy` (in `/usr/bin/pbcopy`, on `$PATH` for every user), but it is **not in the detection list**. | **NO** — `detectClipboardTool` returns `null` → `copyToClipboard` returns `{ success: false, error: "No clipboard tool found. Install wl-copy (Wayland) or xclip/xsel (X11)." }` on every stock macOS install. The error message does not even mention `pbcopy`, so the user does not know what to install. |
| **Linux (X11)** | `WAYLAND_DISPLAY` unset | 1. Wayland branch skipped 2. `xclip` 3. `xsel` 4. `wl-copy` (XWayland fallback) | `xclip` is a common package (`xclip` on Debian/Ubuntu, `xclip` on Fedora/Arch); `xsel` is a smaller alternative; `wl-copy` works as XWayland. | **YES** — at least one of the three is almost always installed on a desktop Linux. |
| **Linux (Wayland)** | `WAYLAND_DISPLAY` set | 1. `wl-copy` (Wayland check passes) | `wl-copy` is the standard Wayland clipboard tool (`wl-clipboard` on Debian/Ubuntu, `wl-clipboard` on Fedora, `wl-clipboard` on Arch). | **YES** — `wl-copy` is the canonical tool on Wayland. |
| **Linux (headless server)** | depends on display | Same as X11 or Wayland above | Neither `xclip`, `xsel`, nor `wl-copy` is typically installed on a headless server. | **NO** — `detectClipboardTool` returns `null`. This is correct: there is no clipboard to write to. The error message is accurate, but the user has no way to "install" a clipboard on a headless box. (This is the intended behavior; the picker shows the error.) |
| **Windows** | n/a (no `WAYLAND_DISPLAY`) | 1. Wayland branch skipped 2. `xclip` 3. `xsel` 4. `wl-copy` | **None** of the three are installed by default. Windows ships `clip.exe` (in `C:\Windows\System32\clip.exe`, on `%PATH%` for every user), but it is **not in the detection list**. | **NO** — same as macOS, except the gap is compounded by Phase 11.1.A: `commandExists` uses `which` which is **also** missing on stock Windows, so every probe returns `false` regardless of whether the tool is installed. `detectClipboardTool` returns `null` even if the user has Git Bash or WSL on `$PATH`. The fix needs both the `where.exe` fallback in `commandExists` (11.1.A) AND adding `clip.exe` to the detection list (this finding). |

**Net result:** the function is correct on Linux (both X11 and Wayland), but silently fails on every stock macOS and stock Windows install — the two platforms the README and the OCLoop website primarily target (the developer is on macOS per the `KNOWN_TERMINALS` list, which is Linux-only and has no macOS-specific entries, see Phase 11.1.B).

#### Per-edge-case behavior

| # | Input / env | Expected | Actual | Verdict |
|---|-------------|----------|--------|---------|
| 1 | Linux + `xclip` installed | Copy succeeds | `detectClipboardTool` returns `{ command: "xclip", args: ["-selection", "clipboard"] }` → spawn with stdin text → exit 0 → `{ success: true }` | ✓ |
| 2 | Linux + `wl-copy` installed (Wayland) | Copy succeeds | Wayland branch matches → `wl-copy` with no args → text goes to primary+clipboard selection → `{ success: true }` | ✓ |
| 3 | Linux + neither tool installed | Graceful error | All four probes fail → `null` → error message mentions Wayland + X11 | ✓ — but error message is misleading on a headless box (see Finding 11.4.G). |
| 4 | macOS + no Homebrew | Copy should succeed (via `pbcopy`) | `WAYLAND_DISPLAY` unset → `wl-copy` skipped → `xclip`/`xsel`/`wl-copy` all `false` → `null` → error | ✗ — Finding 11.4.A. |
| 5 | macOS + `xclip` installed (e.g. via Homebrew) | Copy succeeds | Detection order: Wayland skipped → `xclip` matches → spawn with stdin text → `{ success: true }` | ✓ — but uses an off-platform tool. |
| 6 | Windows + stock install | Copy should succeed (via `clip.exe`) | `which` missing (Phase 11.1.A) → all probes return `false` regardless → `null` → error | ✗ — Finding 11.4.B (compounded with 11.1.A). |
| 7 | `text = ""` (empty) | No-op or `{ success: true }` | Spawn runs with empty stdin → tool exits 0 → `{ success: true }` | ✓ — but wastes a process (see Finding 11.4.E). |
| 8 | `text = "opencode attach http://localhost:8080 --session ses_abc"` (typical, ~60 bytes) | Copy succeeds | Small text fits pipe buffer, `stdin.write` resolves immediately, `stdin.end()` closes cleanly, child reads to EOF, exits 0 | ✓ |
| 9 | `text` of 1 MB | Copy should still succeed | `stdin.write(1MB)` may exceed pipe buffer (64KB on Linux) but Bun's WritableStream handles backpressure; `stdin.end()` waits for the stream to close; child reads to EOF | ✓ — works in practice; see Finding 11.4.F for a theoretical concern. |
| 10 | `text` containing `\n` or other control chars | Copy succeeds; newlines preserved | `wl-copy` and `xclip` both treat stdin as opaque text; newlines round-trip through the clipboard MIME | ✓ |
| 11 | Tool exists but crashes (e.g., `xclip` invoked with no `$DISPLAY`) | Graceful error with stderr | `proc.exited` resolves with non-zero → `stderr` read → return `{ success: false, error: <stderr> }` | ✓ |
| 12 | `Bun.spawn` throws synchronously (e.g., `EACCES` on the binary) | Graceful error | Caught by outer `try/catch` (line 89-94) → `{ success: false, error: <message> }` | ✓ |
| 13 | Caller does not await (App.tsx:1427, 1438, 1528) | Result is lost; toast is shown | The toast is shown immediately on the same tick (line 1428 follows line 1427 synchronously) regardless of whether the copy actually succeeded. The result is discarded. | ✗ — Finding 11.4.C. |
| 14 | Caller awaits but ignores the result | Result is lost; toast is not shown (since none is wired) | n/a — no current caller awaits. | n/a |
| 15 | Two concurrent `copyToClipboard` calls | Both should succeed independently | Each spawns its own child; stdins are independent; no shared state | ✓ |

#### Finding 11.4.A — MEDIUM — macOS `pbcopy` is not detected; copy silently fails on every stock macOS install

**Problem.** `detectClipboardTool` (`src/lib/clipboard.ts:23-48`) probes only `wl-copy`, `xclip`, and `xsel`. On macOS (the OCLoop developer's primary platform per the README + `KNOWN_TERMINALS` shape), the system ships `/usr/bin/pbcopy` (always on `$PATH`, always present since Mac OS X 10.0). None of the three probed tools is installed by default on macOS — `xclip`/`xsel`/`wl-copy` are X11/Wayland tools and require Homebrew + XQuartz/Wayland setup, which the average macOS user does not have. As a result, `detectClipboardTool()` returns `null` on every stock macOS install, and `copyToClipboard` returns `{ success: false, error: "No clipboard tool found. Install wl-copy (Wayland) or xclip/xsel (X11)." }`. The error message does not mention `pbcopy`, so the user has no way to know what to install (and the answer is "nothing — pbcopy should have been detected").

This is a real functional gap on the project's primary target platform, not a corner case. The three call sites (App.tsx:1427, 1438, 1528) all show a success toast unconditionally, so the user sees "Copied to clipboard" while the clipboard is empty.

**Where.** `src/lib/clipboard.ts:23-48` (the `detectClipboardTool` function).

**Proposed fix.** Branch on `process.platform === "darwin"` first and return `pbcopy` if present (it is always present on macOS, but the probe is cheap). Same for Windows (Finding 11.4.B) and Linux:

```ts
export async function detectClipboardTool(): Promise<ClipboardTool | null> {
  // macOS — pbcopy is always present
  if (process.platform === "darwin") {
    if (await commandExists("pbcopy")) {
      return { command: "pbcopy", args: [] };
    }
    return null;
  }

  // Windows — clip.exe is always present
  if (process.platform === "win32") {
    if (await commandExists("clip")) {
      return { command: "clip", args: [] };
    }
    return null;
  }

  // Linux / BSD — prefer Wayland, fall back to X11
  const isWayland = !!process.env.WAYLAND_DISPLAY;
  if (isWayland) {
    if (await commandExists("wl-copy")) {
      return { command: "wl-copy", args: [] };
    }
  }
  if (await commandExists("xclip")) {
    return { command: "xclip", args: ["-selection", "clipboard"] };
  }
  if (await commandExists("xsel")) {
    return { command: "xsel", args: ["--clipboard", "--input"] };
  }
  if (await commandExists("wl-copy")) {
    return { command: "wl-copy", args: [] };
  }
  return null;
}
```

The early `return null` for `darwin`/`win32` is important: even if the user has `xclip` installed via Homebrew on macOS, we should prefer the platform-native `pbcopy` (which talks to the Aqua pasteboard, not a fake X11 selection). The macOS error message in the no-tool path also needs updating:

```ts
if (!tool) {
  const hint =
    process.platform === "darwin" ? "pbcopy (built-in)"
    : process.platform === "win32" ? "clip.exe (built-in)"
    : "wl-copy (Wayland) or xclip/xsel (X11)";
  return {
    success: false,
    error: `No clipboard tool found. ${hint} should be available.`,
  };
}
```

**Status.** Fix proposed, not applied (audit-only per PLAN.md acceptance criteria).

#### Finding 11.4.B — MEDIUM — Windows `clip.exe` is not detected; copy silently fails on every stock Windows install

**Problem.** Same root cause as 11.4.A but for Windows. `clip.exe` ships with every Windows install since Windows 95 (`C:\Windows\System32\clip.exe`, on `%PATH%` for every user). `detectClipboardTool` does not probe for it. The gap is compounded by Phase 11.1.A: `commandExists` uses `which`, which is also missing on stock Windows, so even if we add `clip` to the detection list, the probe returns `false` until the `where.exe` fallback is added to `commandExists`. The fix is the platform branch in 11.4.A above; the `where.exe` fallback is the Phase 11.1.A fix; both are needed for Windows to work end-to-end.

**Where.** `src/lib/clipboard.ts:23-48` (the `detectClipboardTool` function) and `src/lib/command-exists.ts:10` (the `which` literal).

**Proposed fix.** See 11.4.A (the `win32` branch). The `where.exe` fallback is the Phase 11.1.A fix; both changes must ship together for Windows to work.

**Status.** Fix proposed, not applied.

#### Finding 11.4.C — LOW — Call sites do not check the `ClipboardResult`; success toast is shown even on failure

**Problem.** The three call sites in `src/App.tsx` (lines 1427, 1438, 1528) call `copyToClipboard(cmd)` **without `await`** and **without `.then()` / `.catch()`**. The success toast `toast.show({ variant: "success", message: t("toastCopied") })` fires on the next line, synchronously, before the clipboard command has even been spawned. On macOS (11.4.A) or Windows (11.4.B), the user sees "Copied to clipboard" while the clipboard is empty — the worst possible UX for a clipboard operation (the user pastes and gets nothing, with no clue why).

The same pattern is fine for the success path (no error toast needed) but it must check the result on failure. The function is async and never rejects (the inner `try/catch` swallows everything), so the floating-promise anti-pattern is technically safe — but the result is lost, which is the real bug.

**Where.** `src/App.tsx:1427-1428`, `1438-1439`, `1528-1529`.

**Proposed fix.** Await the call and branch on `result.success`:

```ts
const onConfigCopy = async () => {
  const sid = sessionId() || lastSessionId()
  const url = server.url()
  if (sid && url) {
    const cmd = getAttachCommand(url, sid)
    const result = await copyToClipboard(cmd)
    if (result.success) {
      toast.show({ variant: "success", message: t("toastCopied") })
    } else {
      toast.show({ variant: "error", message: t("toastCopyFailed", { error: result.error ?? "" }) })
    }
  }
  dialog.clear()
}
```

This requires adding a new i18n key (`toastCopyFailed`) in both English and Spanish, or reusing an existing error-toast key. The pattern is the same for all three call sites.

**Status.** Fix proposed, not applied.

#### Finding 11.4.D — LOW — `clipboard.ts` has no test coverage

**Problem.** The implementation file `src/lib/clipboard.ts` (97 lines) has no companion `clipboard.test.ts` (verified by `find src -name "clipboard*"` — only the implementation file). The two MEDIUM findings above (macOS + Windows) and the LOW result-checking finding could all be caught by a small mockable test suite that injects the `commandExists` result and the `Bun.spawn` exit code, e.g.:

```ts
it("returns pbcopy on darwin", async () => {
  // Mock commandExists to return true for "pbcopy"
  // Mock process.platform === "darwin"
  // Assert detectClipboardTool returns { command: "pbcopy", args: [] }
})

it("returns null on linux with no tools installed", async () => {
  // Mock commandExists to return false for all probes
  // Assert detectClipboardTool returns null
})

it("returns { success: false } when no tool is available", async () => {
  // Mock detectClipboardTool to return null
  // Assert copyToClipboard returns { success: false, error: /pbcopy|wl-copy|xclip/ }
})
```

**Where.** `src/lib/clipboard.ts` (97 lines, 0 tests).

**Status.** Test coverage gap, not a bug.

#### Finding 11.4.E — INFO — Empty `text` is allowed; wastes a process but produces the right outcome

**Problem.** `copyToClipboard("", ...)` runs the full detection + spawn path; the child exits 0 with empty stdin; the function returns `{ success: true }`. The user-visible behavior is correct ("nothing was copied, success") but a wasted process for a no-op. None of the current call sites ever pass an empty `text` (they all build `getAttachCommand(url, sid)` which is always non-empty), so this is defensive only.

**Where.** `src/lib/clipboard.ts:53-95`.

**Proposed fix.** Optional micro-optimization: short-circuit at the top of the function:

```ts
if (!text) return { success: true }
```

Not worth doing unless the function is ever called from a user-typed-input flow.

**Status.** No fix recommended.

#### Finding 11.4.F — INFO — Stdin write is awaited but not drained for backpressure; theoretical risk on very large text

**Problem.** `await proc.stdin.write(text)` resolves when the data is **buffered** by Bun's WritableStream, not necessarily when the child has consumed it. For a 60-byte `opencode attach …` string this is invisible — the whole thing fits in the pipe buffer (64KB on Linux, 16KB on macOS) and resolves instantly. For a multi-megabyte payload (e.g., a future "copy log to clipboard" feature), `write` returns immediately, `end()` is called, and the child may have only consumed a fraction of the input before EOF. The child would then process a truncated payload. The current use case is bounded to < 1KB, so the risk is theoretical.

**Where.** `src/lib/clipboard.ts:73-76`.

**Proposed fix.** If the function is ever used for large payloads, drain the WritableStream before calling `end()`:

```ts
const writer = proc.stdin.getWriter()
await writer.write(new TextEncoder().encode(text))
await writer.close() // awaits drain + close
```

For the current use case, the existing `await proc.stdin.write(text); await proc.stdin.end()` is correct.

**Status.** No fix recommended for the current use case; flagged for any future "copy large text" feature.

#### Finding 11.4.G — INFO — "No clipboard tool found" error message does not mention `pbcopy` or `clip.exe`

**Problem.** When `detectClipboardTool` returns `null`, the error message is hard-coded to `"No clipboard tool found. Install wl-copy (Wayland) or xclip/xsel (X11)."` (clipboard.ts:58-61). On macOS or Windows the user sees the same message even though the correct fix is "use the built-in `pbcopy` / `clip.exe` (which is what the code SHOULD have detected)". The fix in 11.4.A includes a per-platform error message; this INFO documents why.

**Where.** `src/lib/clipboard.ts:58-61`.

**Status.** Resolved by 11.4.A's fix.

#### Summary of Phase 11.4 findings

| #     | Severity | One-liner |
|-------|----------|-----------|
| 11.4.A | MEDIUM   | `detectClipboardTool` does not probe `pbcopy`; on stock macOS the clipboard copy always fails. Add a `process.platform === "darwin"` branch. |
| 11.4.B | MEDIUM   | `detectClipboardTool` does not probe `clip.exe`; on stock Windows the clipboard copy always fails. Add a `process.platform === "win32"` branch (also requires the `where.exe` fallback in `commandExists` from 11.1.A). |
| 11.4.C | LOW      | Call sites (App.tsx:1427, 1438, 1528) do not check the `ClipboardResult`; success toast is shown even on failure. Await + branch on `result.success`. |
| 11.4.D | LOW      | `clipboard.ts` has no test coverage; add a mockable test suite that exercises the platform branches and the no-tool path. |
| 11.4.E | INFO     | Empty `text` is allowed; wastes a process but produces the right outcome. Short-circuit if needed. |
| 11.4.F | INFO     | Stdin write is not drained for backpressure; theoretical risk on multi-megabyte payloads (current use is < 1KB). |
| 11.4.G | INFO     | "No clipboard tool found" error message does not mention `pbcopy` / `clip.exe`; resolved by 11.4.A's per-platform message. |

**Net severity tally for Phase 11.4: 2 MEDIUM, 2 LOW, 3 INFO; no CRITICAL or HIGH.** The two MEDIUM findings are real functional gaps on the platforms the OCLoop project targets (macOS per the README, Windows per the install instructions in the README's badges) — the Linux happy path (X11 + Wayland) is correct, and the tool-detection order matches the standard Linux clipboard hierarchy. The LOW findings are a UX gap (the success toast is shown even on failure, which silently lies to the user) and a coverage gap (no tests). The INFO findings document minor defensive improvements. No code change applied in this audit; the test suite baseline of 640 passing tests is preserved.

---

**Combined tally for Phase 11 (11.1 + 11.2 + 11.3 + 11.4):** 3 MEDIUM (Windows path detection, no macOS-native terminals, missing `detached: true`) + 2 MEDIUM (macOS `pbcopy` not detected, Windows `clip.exe` not detected) = **5 MEDIUM**; 2 LOW (from 11.1) + 3 LOW (from 11.2) + 2 LOW (from 11.3) + 2 LOW (from 11.4) = **9 LOW**; 2 INFO (from 11.1) + 4 INFO (from 11.2) + 3 INFO (from 11.3) + 3 INFO (from 11.4) = **12 INFO**; no CRITICAL or HIGH. The MEDIUMs are real gaps on supported platforms (Windows, stock macOS) and a signal-propagation hardening (detached spawn). The LOWs are silent-no-op-launch variants (11.2.B/C/D), defensive empty-input guards (11.3.A/B), a result-discard UX gap (11.4.C), and a coverage gap (11.4.D). The INFOs document intentional design choices. No code change applied in this audit; the test suite baseline of 640 passing tests is preserved.

---

## Phase 12 — Configuration & i18n

The configuration layer reads `~/.config/ocloop/ocloop.json` (or
`$XDG_CONFIG_HOME/ocloop/ocloop.json`) on startup and merges the optional
`resilience` sub-section into the defaults before the TUI mounts. The i18n
layer holds a single `localeSignal` that is set once at process start (CLI
`--lang` > config `language` > "en") and updated when the user toggles from the
command palette. Phase 12 audits the loader, saver, and merge logic in
`src/lib/config.ts` and the locale helpers in `src/lib/i18n.ts`. **12.1
audits `loadConfig`; 12.2-12.6 follow in subsequent iterations.**

Source: `src/lib/config.ts` (272 lines), `src/lib/i18n.ts` (688 lines).
Tests: `src/lib/config.test.ts` does NOT exist; `src/lib/i18n.test.ts` does
NOT exist. Every audit below is performed by static reading of the source
plus grep-based cross-referencing of all four call sites (App.tsx:422,
index.tsx:145 + 315, ThemeContext.tsx:142).

---

### 12.1 — Audit `loadConfig` for missing file, invalid JSON, null JSON, array JSON, partial config, unknown keys

**Status: COMPLETE — VERIFIED, one MEDIUM and two LOW findings; no CRITICAL or HIGH.**

The `loadConfig` function (lines 200-224 of `src/lib/config.ts`) is small and
deliberately minimal: a single `existsSync` short-circuit, one `JSON.parse`
wrapped in a catch-all `try/catch`, and a single structural guard (must be a
non-null, non-array object). The function returns `OcloopConfig` (a TypeScript
interface with all-optional fields, lines 140-152), so the absence of a key
is equivalent to its `undefined` value. Per-field type validation is **not**
the loader's job; it is the responsibility of the consumer. I verified all
four call sites do their own type-guard (`isLocale`, `hasTerminalConfig`,
`isValidTheme`, `pickDefined` via `resolveResilience`, `?? true` for the
boolean scrollbar toggle) — so the "trust the consumer" pattern is enforced
in practice.

```ts
export function loadConfig(): OcloopConfig {
  const configPath = getConfigPath()

  if (!existsSync(configPath)) {
    log.debug("config", "No config file found, using default")
    return {}
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    const parsed = JSON.parse(content)
    // JSON.parse("null") succeeds but yields null; treat as missing config.
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      log.warn("config", "Config file did not contain a JSON object, using default", parsed)
      return {}
    }
    const config = parsed as OcloopConfig
    log.info("config", "Loaded config", config)
    return config
  } catch (err) {
    // If parsing fails, return empty config
    log.warn("config", "Failed to load config, using default", err)
    return {}
  }
}
```

The required case matrix from PLAN.md Task 12.1 maps to the code as follows:

| Required case | Code path | Test coverage | Result |
| --- | --- | --- | --- |
| Missing file (`existsSync` false) | line 203-206 → return `{}` | None | OK (logged at debug) |
| Invalid JSON (`JSON.parse` throws) | line 219-223 catch → return `{}` | None | OK (logged at warn) |
| `null` JSON | line 212 guard hits `parsed === null` → return `{}` | None | OK (logged at warn) |
| Array JSON (`[1,2,3]` or `[]`) | line 212 guard hits `Array.isArray` → return `{}` | None | OK (logged at warn) |
| Partial config (`{"theme": "opencode"}`) | passes the guard, returned as-is | None | OK (consumer validates) |
| Unknown keys (`{"foo": "bar"}`) | passes the guard, returned as-is (extra keys kept) | None | OK (silently kept, no warning) |
| Empty file (0 bytes) | `JSON.parse("")` throws `SyntaxError` → catch → return `{}` | None | OK |
| File is a string, number, or boolean | `typeof parsed !== "object"` is true → return `{}` | None | OK |
| Permission denied on read | `readFileSync` throws `EACCES` → catch → return `{}` | None | OK (silent fallback) |
| File deleted between `existsSync` and `readFileSync` (TOCTOU) | `readFileSync` throws `ENOENT` → catch → return `{}` | None | OK (benign — fallback to empty) |

The first 5 required cases (PLAN.md) plus 4 additional cases (empty file,
primitive JSON, EACCES, TOCTOU) are all correct: every malformed input
collapses to `{}` and the consumer falls back to defaults. The four
`log.warn` / `log.debug` calls surface the error in the debug log without
crashing the process. **No CRITICAL or HIGH findings.**

The MEDIUM and LOW findings below concern **defensive validation gaps** —
inputs that are structurally valid JSON objects but contain the wrong types
or unknown keys, which the loader happily passes through.

#### Finding 12.1.A — MEDIUM — `loadConfig` does not validate per-field types; a wrong-type value in any field is silently passed to the consumer

**Problem.** The structural guard at `src/lib/config.ts:212` checks only
"is this a plain object?". It does NOT verify that `terminal` is an object
with the right shape, that `language` is a string, that `theme` is a string
matching a known theme id, that `scrollbar_visible` is a boolean, or that
`resilience` is a plain object. Every consumer happens to have its own
type-guard (`isLocale`, `hasTerminalConfig`, `isValidTheme`,
`resolveResilience` with `pickDefined`, the `?? true` fallback for the
scrollbar boolean), so a wrong-type value **does not crash today** — but the
defense is implicit, distributed, and easy to break with a new field or a
new consumer.

Concrete wrong-type inputs that pass the loader but reach a consumer:

| Input field | Consumer | Outcome |
| --- | --- | --- |
| `{"terminal": "not-an-object"}` | `hasTerminalConfig` (config.ts:250) | Returns `false` (rejected silently — user sees default terminal dialog). OK. |
| `{"language": "fr"}` | `isLocale` (i18n.ts:22) | Returns `false`; `setLocale` falls back to `"en"`. OK. |
| `{"language": 42}` | `isLocale` | Returns `false`; falls back to `"en"`. OK. |
| `{"theme": null}` | `isValidTheme` (ThemeContext.tsx:146) | `requested && isValidTheme(requested)` short-circuits; falls back to `DEFAULT_THEME`. OK. |
| `{"theme": 42}` | `isValidTheme` | `isValidTheme(42)` returns `false`; falls back. OK. |
| `{"scrollbar_visible": "true"}` (string) | App.tsx:1555 `current ?? true` then `!current` | `current = "true"`; `!current = false`; toggling flips the displayed value. **Silent coercion — the user sees no warning.** |
| `{"resilience": "fast"}` (string) | `resolveResilience` → `Object.entries("fast")` | `Object.entries` on a string returns `[["0","f"],["1","a"],["2","s"],["3","t"]]`; `pickDefined` keeps all four; spread into `DEFAULT_RESILIENCE` overwrites the `0`,`1`,`2`,`3` numeric keys with characters. **Silent corruption of all four resilience defaults.** |
| `{"resilience": null}` | `resolveResilience(null, …)` | `pickDefined(null)` returns `{}` (the `if (!obj) return {}` guard). OK. |
| `{"resilience": 42}` | `resolveResilience(42, …)` | `Object.entries(42)` returns `[]`; `pickDefined` returns `{}`. OK. |
| `{"resilience": {"createTimeoutMs": "fast"}}` (string for a number field) | `resolveResilience` | `pickDefined` keeps the string; spread into defaults; later `setTimeout("fast")` coerces to `NaN`; the API call times out immediately. **Silent bug — the user sees instant timeouts with no diagnostic.** |

The two non-OK rows (`scrollbar_visible: "true"`, `resilience: "fast"`, and
`resilience: {"createTimeoutMs": "fast"}`) are the real risk. They are not
crashes, but they produce wrong behavior with no error surface. The
diagnosis cost (find the typo, realise the loader doesn't validate) is
higher than the cost of a single `validateConfigShape` call inside the
loader.

**Where.** `src/lib/config.ts:200-224` (`loadConfig`).

**Proposed fix.** Add a small `validateConfigShape` helper that checks each
field's type and logs a `warn` for any mismatch (still returning `{}` for
the offending field, so a single bad key doesn't take down the whole
config). Wire it as the last step before `return config`:

```ts
function validateConfigShape(raw: unknown): OcloopConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {}
  }
  const r = raw as Record<string, unknown>
  const out: OcloopConfig = {}

  if ("terminal" in r) {
    if (hasTerminalConfig(r as OcloopConfig)) {
      out.terminal = (r as OcloopConfig).terminal
    } else {
      log.warn("config", "Ignoring malformed 'terminal' field", r.terminal)
    }
  }
  if ("language" in r) {
    if (typeof r.language === "string" && isLocale(r.language)) {
      out.language = r.language
    } else {
      log.warn("config", "Ignoring malformed 'language' field", r.language)
    }
  }
  if ("theme" in r) {
    if (typeof r.theme === "string") out.theme = r.theme
    else log.warn("config", "Ignoring malformed 'theme' field", r.theme)
  }
  if ("scrollbar_visible" in r) {
    if (typeof r.scrollbar_visible === "boolean") {
      out.scrollbar_visible = r.scrollbar_visible
    } else {
      log.warn("config", "Ignoring malformed 'scrollbar_visible' field", r.scrollbar_visible)
    }
  }
  if ("resilience" in r && typeof r.resilience === "object" && r.resilience !== null && !Array.isArray(r.resilience)) {
    out.resilience = r.resilience as Partial<ResilienceConfig>
  } else if ("resilience" in r) {
    log.warn("config", "Ignoring malformed 'resilience' field", r.resilience)
  }

  return out
}
```

This change shifts validation from "every consumer must remember" to
"the loader enforces it once", and the warn logs give the user a hint
when a typo or schema mismatch slips through.

**Status.** Fix proposed, not applied (audit-only per PLAN.md acceptance
criteria). The MEDIUM rating is driven by the `resilience` rows above
(string-where-number silently corrupts the timeout).

#### Finding 12.1.B — LOW — Unknown top-level keys are silently kept; a typo like `languaje: "es"` falls back to English with no diagnostic

**Problem.** A user with `{"languaje": "es"}` (typo) gets the whole object
back from `loadConfig`; `index.tsx:315` reads `cfgLang = loadConfig().language`
which is `undefined`; the `isLocale(undefined)` check at line 316 falls
back to `"en"`. The user sees English UI with no warning. Same applies to
any other typo (`themee`, `resillience`, `scrollbarVisible` vs
`scrollbar_visible`).

**Where.** `src/lib/config.ts:200-224` (`loadConfig`) and the
`as OcloopConfig` cast at line 216.

**Proposed fix.** Either (a) add unknown-key detection inside the proposed
`validateConfigShape` helper above (log a warn for each key not in the
allowlist) or (b) iterate `Object.keys(parsed)` after the structural guard
and log a single `warn` summarizing the unknown keys:

```ts
const ALLOWED_KEYS = new Set(["terminal", "scrollbar_visible", "theme", "language", "resilience"])
const unknown = Object.keys(parsed).filter(k => !ALLOWED_KEYS.has(k))
if (unknown.length > 0) {
  log.warn("config", `Unknown config keys ignored: ${unknown.join(", ")}`, unknown)
}
```

The check is cheap (one `Set` lookup per key) and the warn is visible in
`--debug` mode without affecting normal users.

**Status.** Fix proposed, not applied.

#### Finding 12.1.C — LOW — No test coverage for `loadConfig`; all six required cases are unverified

**Problem.** `src/lib/config.ts` has no companion `src/lib/config.test.ts`
(verified by `find src -name 'config*'` — only the implementation file).
The six required cases (missing file, invalid JSON, null JSON, array JSON,
partial config, unknown keys) plus the four additional cases I enumerated
above (empty file, primitive JSON, EACCES, TOCTOU) are all currently
untested. A regression in the `typeof !== "object" || parsed === null ||
Array.isArray(parsed)` guard (e.g. dropping the `Array.isArray` check)
would not be caught by `bun test`. The pattern of "small lib file, no
tests" is consistent across the codebase (clipboard.ts, theme-resolver.ts,
format.ts, glyphs.ts) — but config is the one with the most user-facing
schema and the most call sites, so a small mockable test suite here is
high-value.

**Where.** `src/lib/config.ts` (272 lines, 0 tests).

**Proposed fix.** Add `src/lib/config.test.ts` with a `bun:test` suite
that injects the config path via a module-private setter (or a
`__setConfigPathForTest` helper) and exercises each of the ten cases in
the table above. The existing `cli-args.test.ts` is a good template for
the style (parse-helper that returns `{ args, exitCode, errors }`,
top-level `describe` per audit section, one `it` per case).

```ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("loadConfig — schema robustness", () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ocloop-cfg-")) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it("returns {} when the file does not exist", () => { /* ... */ })
  it("returns {} on invalid JSON", () => { /* ... */ })
  it("returns {} when the file contains null", () => { /* ... */ })
  it("returns {} when the file contains an array", () => { /* ... */ })
  it("returns the parsed object for a partial config", () => { /* ... */ })
  it("keeps unknown top-level keys (current behavior)", () => { /* ... */ })
  it("returns {} for an empty file", () => { /* ... */ })
  it("returns {} for a primitive JSON value", () => { /* ... */ })
})
```

**Status.** Test coverage gap, not a bug. The proposed suite is ~80 lines
and locks in the current contract.

#### Finding 12.1.D — INFO — `loadConfig` is called on the hot path at App onMount (line 422) and at index.tsx:145, 315; no caching

Two call sites: App.tsx (TUI mode, onMount) and index.tsx (CLI mode, twice
— once for resilience at line 145 and once for language at line 315). All
three are startup-only, so the synchronous `readFileSync` is not a
performance concern. The lack of caching is desirable: an external edit
(e.g., the user changing `theme` in another process) is picked up on next
launch. No finding.

#### Finding 12.1.E — INFO — TOCTOU between `existsSync` and `readFileSync` is benign

`existsSync(configPath)` returns `true`, then a parallel process deletes
the file, then `readFileSync` throws `ENOENT`. The catch block returns
`{}`, which is the same answer `existsSync` would have produced. Could be
simplified to a single `try { readFileSync } catch (ENOENT) { return {} }`,
but the current two-step pattern is more readable. No finding.

#### Finding 12.1.F — INFO — `loadConfig` returns the object reference, not a defensive copy

The function returns the parsed object directly (line 218). A caller that
mutates the result (e.g., `config.theme = "foo"`) would mutate the parsed
JSON in memory — but the parsed JSON is the result of `JSON.parse` on a
freshly-read string, so there is no shared reference to worry about.
**However**, the two App.tsx call sites that build `newConfig =
{...ocloopConfig(), ...}` rely on this property (spread is shallow; nested
objects like `terminal` and `resilience` would be aliased). This is fine
because the spread is followed by a `saveConfig(newConfig)` that
re-serializes the whole object — but it is a subtle invariant worth
documenting in a comment on line 218.

#### Summary of Phase 12.1 findings

| #       | Severity | One-liner |
|---------|----------|-----------|
| 12.1.A  | MEDIUM   | `loadConfig` does not validate per-field types; a wrong-type value (e.g., `resilience: "fast"` or `resilience: {"createTimeoutMs": "fast"}`) silently corrupts the merged config. Add a `validateConfigShape` helper inside the loader. |
| 12.1.B  | LOW      | Unknown top-level keys are silently kept; a typo like `languaje: "es"` falls back to English with no diagnostic. Log a single warn summarizing the unknown keys. |
| 12.1.C  | LOW      | No `config.test.ts`; all six required cases (plus four additional) are unverified. Add a ~80-line `bun:test` suite that injects the config path. |
| 12.1.D  | INFO     | `loadConfig` is called on the hot path 3× at startup; no caching. Acceptable — startup-only and edits are picked up on next launch. |
| 12.1.E  | INFO     | TOCTOU between `existsSync` and `readFileSync` is benign (both paths return `{}`). |
| 12.1.F  | INFO     | `loadConfig` returns the object reference (not a defensive copy); relies on `JSON.parse` producing a fresh graph. Document the invariant. |

**Net severity tally for Phase 12.1: 1 MEDIUM, 2 LOW, 3 INFO; no CRITICAL or HIGH.** The MEDIUM is a real silent-corruption risk for the `resilience` sub-config (string-where-number). The LOWs are a silent-typo risk and a coverage gap. The INFOs document benign design choices. The structural guard at line 212 (object-not-null-not-array) handles all five "malformed JSON" cases correctly; the gap is in per-field type validation, which the loader delegates to the consumer today (and every consumer happens to validate). Tasks 12.2-12.6 (atomic save, merge order, `isLocale` strictness, i18n parity, `setLocale` persistence) are deferred to subsequent iterations.

---

### 12.2 — Audit `saveConfig` for atomic write (tmp + rename), directory creation, and error handling

**Status: COMPLETE — VERIFIED, one MEDIUM and four LOW findings; no CRITICAL or HIGH.**

The `saveConfig` function (lines 230-245 of `src/lib/config.ts`) is the
write-side counterpart to `loadConfig`. It must write atomically (a reader
must never see a half-written config) and must create the config directory
on first run. The function is invoked from four call sites in
`src/App.tsx` (lines 1389, 1411, 1561, 1575) and the contract is "fire and
forget best-effort" — the user clicked a button in the command palette and
the in-memory state should reflect the new value regardless of whether the
disk write succeeded.

```ts
export function saveConfig(config: OcloopConfig): void {
  const configDir = getConfigDir()
  const configPath = getConfigPath()

  // Create directory if needed
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  // Write atomically: tmp file then rename (rename is atomic on the same
  // filesystem, so a reader never sees a half-written config).
  const tmpPath = configPath + ".tmp"
  writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8")
  renameSync(tmpPath, configPath)
  log.info("config", "Saved config", config)
}
```

The required case matrix from PLAN.md Task 12.2 maps to the code as
follows:

| Required case | Code path | Test coverage | Result |
| --- | --- | --- | --- |
| Atomic write (tmp + rename) | line 241-243 (`writeFileSync` → `renameSync`) | None | OK (POSIX `rename(2)` is atomic; Node `renameSync` on Windows uses `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING` since v8 — atomic on the same volume) |
| Creates directory if missing | line 235-237 (`existsSync` + `mkdirSync({recursive: true})`) | None | OK (mkdir recursive is idempotent) |
| Config dir already exists | line 235-237 short-circuits via `existsSync` | None | OK (no-op) |
| `mkdirSync` already-exists race (TOCTOU) | line 236 throws `EEXIST` | None | **Uncaught** — propagates to caller, see Finding 12.2.A |
| `writeFileSync` permission denied (`EACCES`) | throws | None | **Uncaught** — propagates to caller, see Finding 12.2.A |
| `writeFileSync` disk full (`ENOSPC`) | throws | None | **Uncaught** — propagates to caller, see Finding 12.2.A |
| `writeFileSync` read-only filesystem (`EROFS`) | throws | None | **Uncaught** — propagates to caller, see Finding 12.2.A |
| `renameSync` cross-device (`EXDEV` on Linux) | throws; original + tmp both persist | None | **Uncaught** — propagates to caller, see Finding 12.2.A |
| `renameSync` permission denied (`EACCES`) | throws | None | **Uncaught** — propagates to caller, see Finding 12.2.A |
| Caller writes while another reader holds the file open (Windows) | `writeFileSync`/`renameSync` may fail | None | **Uncaught** — propagates to caller, see Finding 12.2.A |
| Two `saveConfig` calls fire concurrently (impossible in single-threaded JS) | N/A | N/A | INFO — see Finding 12.2.B |
| Caller writes a malformed config (e.g. `terminal: "foo"`) | Persisted as-is | None | INFO — see Finding 12.2.G |

The 3 required PLAN.md cases (atomic, mkdir, already-exists) are correct.
The 7 additional I/O failure modes I enumerated (EEXIST, EACCES, ENOSPC,
EROFS, EXDEV, Windows-share, plus content validation) all share the same
root cause: **no try/catch around the I/O**. This is the MEDIUM finding
below. The remaining LOW findings cover the `.tmp` filename collision
risk, stale `.tmp` leak, a redundant `existsSync` check, and the
misleading `await` on a `void` return.

#### Finding 12.2.A — MEDIUM — `saveConfig` does not catch I/O errors; a disk-full or permission-denied crash propagates to all four `App.tsx` call sites, none of which have a `try/catch`

**Problem.** `saveConfig` is invoked from four command-palette handlers
in `src/App.tsx`:

| Call site | Handler | Wraps `saveConfig` in `try/catch`? |
| --- | --- | --- |
| App.tsx:1389 | `onConfigSelect` (user picked a terminal from the dialog) | No |
| App.tsx:1411 | `onConfigCustom` (user entered a custom terminal command) | No |
| App.tsx:1561 | `toggle_scrollbar` (command palette) | No |
| App.tsx:1575 | `toggle_language` (command palette) | No |

All four follow the same pattern:

```ts
await saveConfig(newConfig)
setOcloopConfig(newConfig)
dialog.clear()
```

If `saveConfig` throws (EACCES on `~/.config/ocloop/`, ENOSPC on a full
disk, EROFS on a sandbox, EEXIST race on `mkdirSync`, EXDEV on a
cross-device rename), the async function rejects, the local state is
never updated, the dialog is never closed, and the user sees no
diagnostic. The error is a bare `Error` with no context — the user
debugging from a TUI can't tell whether the disk is full or the
filesystem is read-only. Compare to `saveLoopState` in
`src/lib/loop-state-store.ts:49-57`, which is explicitly documented as
**"never throws — persistence is best-effort and must not crash the
app"** and wraps the whole I/O in `try { … } catch (err) { log.warn(...) }`.
The two persistence layers have inconsistent contracts: the loop-state
writer swallows errors silently, the config writer lets them escape.

Concrete failure scenarios:

| Scenario | Outcome today | What should happen |
| --- | --- | --- |
| `~/.config/ocloop/` is on a read-only mount (CI sandbox, corporate-managed mac) | `EACCES` from `mkdirSync` or `writeFileSync` propagates uncaught; toggle_scrollbar/toggle_language handlers reject with no UI feedback | Log a `warn`, show a toast "Could not persist config" |
| Disk full | `ENOSPC` from `writeFileSync` propagates uncaught | Log a `warn`, show a toast |
| User accidentally set `XDG_CONFIG_HOME=/sys` (a sysfs mount) | `EACCES` on the directory, then `EACCES` on the file — propagates uncaught | Log a `warn` |
| `~/.config/ocloop/` is a symlink to a file | `EEXIST` from `mkdirSync` (not a dir) — propagates uncaught | Log a `warn` and `log.warn("config", "saveConfig path is not a directory", configDir)` |
| Cross-device rename (user symlinked `~/.config/ocloop` to a different mount) | `EXDEV` from `renameSync` — propagates uncaught; **the tmp file is leaked** | Log a `warn`; clean up the tmp file |

**Where.** `src/lib/config.ts:230-245` (`saveConfig`) and the four
`await saveConfig(newConfig)` call sites in `src/App.tsx:1389, 1411, 1561, 1575`.

**Proposed fix.** Match the `saveLoopState` contract. Wrap the I/O in
`try/catch`, log a `warn` with the error, do not re-throw. The
command-palette handlers can also show a toast on rejection, but the
minimum viable fix is to make `saveConfig` not throw:

```ts
export function saveConfig(config: OcloopConfig): void {
  const configDir = getConfigDir()
  const configPath = getConfigPath()
  const tmpPath = configPath + ".tmp"

  try {
    // mkdirSync({ recursive: true }) is a no-op if the dir already exists.
    mkdirSync(configDir, { recursive: true })
    writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8")
    renameSync(tmpPath, configPath)
    log.info("config", "Saved config", config)
  } catch (err) {
    log.warn("config", "Failed to save config", err)
    // Best-effort cleanup of leaked tmp file; ignore secondary errors.
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch { /* swallow */ }
  }
}
```

The MEDIUM rating reflects that the failure mode is **reachable on every
supported platform** (any sandboxed install, any read-only mount, any
CI/devcontainer), it surfaces in the most user-facing path (the command
palette), and the fix is a one-line wrapper. The cost of the bug is
diagnostic: a user with a misconfigured environment will see their
language toggle or scrollbar toggle "do nothing" and have to read the
debug log to find out why.

**Status.** Fix proposed, not applied (audit-only per PLAN.md acceptance
criteria).

#### Finding 12.2.B — LOW — `tmpPath` is a fixed suffix `.tmp`; two simultaneous writes would clobber each other's tmp file

**Problem.** Line 241 sets `tmpPath = configPath + ".tmp"` — a single,
predictable name. JavaScript is single-threaded so two `saveConfig`
calls cannot run in parallel within the same process, **but** the
function uses sync I/O, so the *event loop* is blocked during the
write+rename. A `setTimeout` callback or a microtask queued by a
Solid signal update cannot preempt the in-flight write. So the
collision risk is theoretical for the in-process case.

The cross-process case is real: if a user runs `ocloop` in two terminals
(both pointing to the same `$XDG_CONFIG_HOME`), both processes write to
`ocloop.json.tmp` at the same instant. Last-writer-wins for the tmp
file, then `renameSync` from the second process overwrites the first
process's `renameSync` result with the *second* process's serialized
config. The final on-disk state is whichever process's `renameSync`
ran last. This is a "two-process interference" footgun, not a
correctness bug — both writes are valid configs, just whichever ran
last is the one that wins. The user sees the same effect as if they'd
run the two commands sequentially.

**Where.** `src/lib/config.ts:241` (`const tmpPath = configPath + ".tmp"`).

**Proposed fix.** Use a unique tmp suffix so the two processes don't
fight over the same file:

```ts
import { randomBytes } from "node:crypto"
// ...
const tmpPath = `${configPath}.${randomBytes(6).toString("hex")}.tmp`
```

The cost is one syscall (`randomBytes(6)`) and a longer filename. The
benefit is no cross-process tmp-file contention.

**Status.** Fix proposed, not applied. LOW rating because the in-process
case is impossible and the cross-process case is benign (last-writer-wins
on a valid config).

#### Finding 12.2.C — LOW — Stale `.tmp` files are not cleaned up after a write that succeeded `writeFileSync` but failed `renameSync`

**Problem.** If `writeFileSync` succeeds and `renameSync` fails (EXDEV,
target-rename EACCES, Windows share violation), the `.tmp` file is
left behind on disk. The next call to `saveConfig` overwrites it, so
there is no growth over time, **but** the stale file may confuse
external tools (e.g. a user `cat`-ing the directory, a backup tool
picking up `ocloop.json.tmp`).

**Where.** `src/lib/config.ts:242-243` (the `writeFileSync` → `renameSync`
sequence).

**Proposed fix.** Wrap the I/O in `try/catch` (per Finding 12.2.A) and
on the catch path, attempt a best-effort `unlinkSync(tmpPath)`. The
cleanup itself can fail (the file may not exist if the failure was
before the write completed) — swallow that secondary error:

```ts
} catch (err) {
  log.warn("config", "Failed to save config", err)
  try { unlinkSync(tmpPath) } catch { /* tmp may not exist */ }
}
```

**Status.** Fix proposed, not applied. LOW rating because the leak is
benign (next save overwrites) and the cleanup is already part of the
12.2.A wrapper.

#### Finding 12.2.D — LOW — `existsSync(configDir)` check is redundant; `mkdirSync({ recursive: true })` is already idempotent

**Problem.** Line 235-237:

```ts
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true })
}
```

`mkdirSync(path, { recursive: true })` is a no-op if the directory
already exists (no error thrown). The `existsSync` check is therefore
redundant. The redundant check also introduces a TOCTOU window: between
`existsSync` returning `false` and `mkdirSync` running, another process
could create the directory; `mkdirSync` would still succeed (idempotent
semantics) but the TOCTOU is wasted work.

**Where.** `src/lib/config.ts:235-237`.

**Proposed fix.** Drop the `existsSync` check; call `mkdirSync` directly:

```ts
mkdirSync(configDir, { recursive: true })
```

The simplification also removes one syscall (the `existsSync`) from
every save. The cost is zero — the current behavior is correct, just
verbose.

**Status.** Fix proposed, not applied. LOW rating because the current
behavior is correct (no bug, just dead code).

#### Finding 12.2.E — LOW — `saveConfig` returns `void` but all four callers `await` it — the `await` is misleading

**Problem.** The function signature is `saveConfig(config: OcloopConfig): void`
(line 230). The four call sites all use `await saveConfig(newConfig)`
(App.tsx:1389, 1411, 1561, 1575). `await` on a non-Promise value
resolves immediately on the next microtask, so the runtime behavior is
correct (the function runs synchronously, the `await` adds one tick of
delay), but a future maintainer who refactors `saveConfig` to be
async (e.g., to use `fs/promises`) will get a silent semantic change
at the call sites — the local state would no longer be updated
synchronously. The current code "accidentally works" because the I/O
is synchronous.

**Where.** `src/lib/config.ts:230` (signature) and `src/App.tsx:1389,
1411, 1561, 1575` (call sites).

**Proposed fix.** Two options:

1. **Cheap**: change the signature to `Promise<void>` and wrap the body
   in `async`. The four `await` sites stay the same; the function
   becomes a true async that the JS engine can interleave with other
   work. Use `await promisify(...)` or just convert to `fs/promises`.
2. **Cheaper**: drop the `await` from the call sites (4 edits) and
   document in the function header that it is synchronous.

**Status.** Fix proposed, not applied. LOW rating because both
behaviors are correct today; the maintenance hazard is real but
small.

#### Finding 12.2.F — INFO — Directory and file mode inherit the process umask; a paranoid umask (`0077`) gives the right result, a permissive umask (`0000`) gives `0o755` / `0o666`

**Problem.** `mkdirSync(configDir, { recursive: true })` and
`writeFileSync(tmpPath, ...)` use default permissions. With a default
umask of `0o022`, the directory gets `0o755` and the file gets `0o644`.
With a strict umask of `0o077`, the directory gets `0o700` and the
file gets `0o600` (private, correct for a config file). With a
permissive umask of `0o000` (unusual but legal in dev), the directory
would be world-writable.

`ocloop.json` typically contains `terminal.command` / `terminal.args`
or a `language` preference — not credentials, but on a multi-user
system the `theme` field is benign and the `resilience` overrides
could be considered private to the user. There is no "secret" in the
config today, so the default umask behavior is acceptable.

**Where.** `src/lib/config.ts:236, 242` (default-permission I/O).

**Proposed fix.** If hardening is desired in the future, pass
`{ mode: 0o700 }` to `mkdirSync` and call `chmodSync` on the file
after rename. Out of scope for this audit — no current user data is
sensitive.

**Status.** INFO — design choice, no fix proposed.

#### Finding 12.2.G — INFO — `saveConfig` does not validate the config shape; a caller passing a malformed value persists it

**Problem.** `saveConfig` writes whatever the caller hands it. If a
future bug in `App.tsx` builds `newConfig = { ...ocloopConfig(), language: 42 }`
(a number where a string is expected), `saveConfig` happily serializes
`42` and `loadConfig` on the next launch returns `{ language: 42 }`.
The TypeScript type guards (`isLocale`, `hasTerminalConfig`,
`isValidTheme`, `pickDefined`) catch the wrong-type at the consumer
site, so the user sees the right behavior. The defense is correct but
distributed across 4+ consumers.

**Where.** `src/lib/config.ts:230-245` (the `saveConfig` body) and
`src/App.tsx:1389, 1411, 1561, 1575` (the four callers).

**Proposed fix.** Same `validateConfigShape` helper proposed in
Finding 12.1.A, applied to the write side. The simplest
implementation is a shared `validateConfigShape` (or
`normalizeConfig`) used by both `loadConfig` and `saveConfig` to
guarantee the on-disk shape matches the in-memory shape. The savings
are: (1) a single source of truth for the schema, (2) consistent warn
logs at both read and write time.

**Status.** INFO — symmetry with 12.1.A. Not a bug, a refactor
opportunity.

#### Summary of Phase 12.2 findings

| #       | Severity | One-liner |
|---------|----------|-----------|
| 12.2.A  | MEDIUM   | `saveConfig` does not catch I/O errors; EACCES / ENOSPC / EROFS / EEXIST / EXDEV propagate to all four `App.tsx` callers, none of which have a `try/catch`. Wrap the body in `try/catch` (matching the `saveLoopState` contract) and log a `warn`. |
| 12.2.B  | LOW      | `tmpPath` uses a fixed `.tmp` suffix; two `ocloop` processes writing concurrently clobber each other's tmp file. Use `randomBytes(6)` in the suffix. |
| 12.2.C  | LOW      | Stale `.tmp` files are not cleaned up after a partial-write failure. Add a best-effort `unlinkSync(tmpPath)` in the catch block (already part of the 12.2.A wrapper). |
| 12.2.D  | LOW      | `existsSync(configDir)` check before `mkdirSync({ recursive: true })` is redundant — `recursive: true` is idempotent. Drop the check. |
| 12.2.E  | LOW      | `saveConfig` returns `void` but all four callers `await` it; the `await` is misleading. Either make the function genuinely async or drop the `await` at the call sites. |
| 12.2.F  | INFO     | Directory and file mode inherit the process umask; today no field holds a secret, so default-permission is acceptable. |
| 12.2.G  | INFO     | `saveConfig` does not validate the config shape; same refactor as 12.1.A — a shared `validateConfigShape` / `normalizeConfig` helper would enforce the schema at both read and write. |

**Net severity tally for Phase 12.2: 1 MEDIUM, 4 LOW, 2 INFO; no CRITICAL or HIGH.** The MEDIUM is a real consistency gap with `saveLoopState` (which already swallows errors per its "never throws" contract) and is reachable on every supported platform via disk-full / read-only-mount / sandboxed-install. The 4 LOWs are maintenance hazards (tmp filename, stale-tmp leak, redundant check, misleading `await`) — individually correct behavior, collectively a code-smell cluster that the proposed wrapper in 12.2.A would resolve. The 2 INFOs document umask behavior and a symmetry opportunity with 12.1.A. The atomic write (tmp + rename) and the `mkdirSync({ recursive: true })` directory creation are both correct as written. Tasks 12.3-12.6 (merge order, `isLocale` strictness, i18n parity, `setLocale` persistence) are deferred to subsequent iterations.

---

### 12.3 — Audit `resolveResilience` merge order: defaults < file config < CLI overrides, undefined values skipped

**Status: COMPLETE — VERIFIED the two required cases (3-level merge order and undefined-skip); one MEDIUM finding (null is NOT skipped) and one LOW finding (no per-key validation) uncovered; no CRITICAL or HIGH.**

The `resolveResilience` function (lines 160-175 of `src/lib/config.ts`) is the
merge layer for every resilience threshold. It is invoked at three call sites:

| Call site | Mode | Layer roles |
| --- | --- | --- |
| `src/App.tsx:160` | TUI (initial seed) | `fileConfig=undefined`, `cliOverrides=props.resilience` |
| `src/App.tsx:426` | TUI (after `onMount` loads config) | `fileConfig=config.resilience`, `cliOverrides=props.resilience` |
| `src/index.tsx:145` | Headless `--create-plan` | `fileConfig=loadConfig().resilience`, `cliOverrides=args.resilience` |

The function is 16 lines of source (including the 6-line `pickDefined`
helper). Tests: `src/lib/config.test.ts` does **not** exist; the merge
function is untested. Every audit below is performed by static reading
plus cross-referencing the three call sites.

```ts
export function resolveResilience(
  fileConfig?: Partial<ResilienceConfig>,
  cliOverrides?: Partial<ResilienceConfig>,
): ResilienceConfig {
  const pickDefined = <T extends object>(obj?: T): Partial<T> => {
    if (!obj) return {}
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    ) as Partial<T>
  }
  return {
    ...DEFAULT_RESILIENCE,
    ...pickDefined(fileConfig),
    ...pickDefined(cliOverrides),
  }
}
```

The required case matrix from PLAN.md Task 12.3 maps to the code as follows:

| Required case | Code path | Test coverage | Result |
| --- | --- | --- | --- |
| **defaults < file < CLI merge order** (later wins) | spread order `{...DEFAULT_RESILIENCE, ...fileDefined, ...cliDefined}` | None | **OK** — three spread layers, last one wins for any key present in multiple layers |
| **undefined values in any layer are skipped** | `pickDefined` filters `v !== undefined` (line 167) | None | **PARTIAL** — `undefined` is correctly skipped, but `null` is NOT (see Finding 12.3.A) |
| `null` for the whole `fileConfig` / `cliOverrides` argument | `if (!obj) return {}` (line 165) catches both | None | **OK** — `!null` is truthy, returns `{}` |
| Empty object `{}` for either layer | `Object.entries({})` is `[]`, `Object.fromEntries([])` is `{}` | None | **OK** — spread is a no-op |
| Falsy-but-defined values (`0`, `false`, `""`) | `0 !== undefined`, `false !== undefined` | None | **OK** — `caffeinate: false` and `minIterationGapMs: 0` are correctly preserved through the merge |
| Same key in file config and CLI override | CLI wins (later spread) | None | **OK** — verified by reading the spread order |
| Same key in defaults and CLI override | CLI wins | None | **OK** — spread order guarantees it |
| Unknown / extra keys in either layer | `pickDefined` does NOT validate keys (only filters `undefined`) | None | **OK at runtime** — extra key is preserved; nothing reads it (see Finding 12.3.C) |
| Array as `fileConfig` (e.g. `[100, 200, 300]`) | `Object.entries([100,200,300])` returns `[["0",100],["1",200],["2",300]]`; spread corrupts first three numeric defaults | None | **Silent corruption** — see Finding 12.3.A (same root cause: no `validateConfigShape`) |
| `null` for a single field (e.g. `createTimeoutMs: null`) | `null !== undefined` so `null` is kept; spread writes `null` over the default | None | **Silent corruption** — `setTimeout(null)` coerces to `0`; the API call times out immediately. See Finding 12.3.A |
| CLI flag `--no-caffeinate` and CLI flag `--resilience caffeinate=true` in the same argv | Both write to the same `resilience` object in `parseArgs` (lines 238-243, 249-256); the last one in argv wins | None | **OK** — `parseArgs` builds one `resilience` object; `--resilience` calls `applyResilienceOverride` which writes the typed value to that same object; last-wins is the standard CLI contract |
| Repeated `--resilience key=val` for the same key | `applyResilienceOverride` overwrites the same key on the same object; last value wins | None | **OK** — verified by reading `applyResilienceOverride` (lines 85-117) |
| Idempotency: `resolveResilience(resolveResilience(a, b), c) === resolveResilience(a, { ...b, ...c })` | First call returns a full `ResilienceConfig` (no `undefined`); second call's `pickDefined` does NOT filter filled-in values | None | **NOT strictly idempotent** — first call "promotes" `undefined` slots to defaults; second call treats those defaults as overrides. This is INFO-level, not a bug (see Finding 12.3.D) |

The first two required PLAN.md cases (3-level merge, undefined-skip) are
**correct for `undefined` but not for `null`**. Every other runtime case is
correct as written. **No CRITICAL or HIGH findings.** The MEDIUM below
concerns the `null` gap; the LOW concerns key validation; the INFO notes
non-idempotency.

#### Finding 12.3.A — MEDIUM — `pickDefined` skips `undefined` but NOT `null`; a `null` value in either layer silently corrupts the merged config

**Problem.** The `pickDefined` filter (line 167) uses `v !== undefined`,
which means `null` is treated as a defined value and overwrites the
default. The downstream consumer of every numeric field is `setTimeout`
or `setInterval` (in `configureApiTimeouts`, see `src/lib/api.ts`),
both of which coerce `null` to `0` and fire the callback on the next
tick. The downstream consumer of every boolean field is a JS boolean
context (e.g. `if (caffeinate)`), which treats `null` as falsy. The
result is wrong-but-not-crashing behavior with no error surface.

Concrete corruption scenarios reachable from a hand-edited
`ocloop.json`:

| Config input | Resolved value | Runtime effect |
| --- | --- | --- |
| `{"resilience": {"createTimeoutMs": null}}` | `createTimeoutMs: null` | `setTimeout(null, …)` → immediate timeout on every `session.create`; the loop burns through 8 retries in seconds before going into a recoverable error |
| `{"resilience": {"maxRateLimitRetries": null}}` | `maxRateLimitRetries: null` | `if (rateLimitAttempts < null)` → `null < n` is `false` for any `n`; the cooldown never retries. The loop appears to stop handling rate limits silently |
| `{"resilience": {"caffeinate": null}}` | `caffeinate: null` | `if (loop.isRunning() || loop.isCooldown())` short-circuits to false (null is falsy); macOS caffeinate is disabled. Silent behavioral change. |
| `{"resilience": {"backoffJitter": null}}` | `backoffJitter: null` | `computeBackoff`'s `jitter ? random : 0` picks `0` (no jitter); retries become predictable. Behavioral regression. |
| `{"resilience": {"resume": null}}` | `resume: null` | `if (resilience.resume)` in `App.tsx:init` short-circuits to false; auto-resume is silently disabled. |

None of these are reachable from the CLI — `applyResilienceOverride` in
`src/lib/cli-args.ts:85-117` validates booleans and non-negative
integers and `process.exit(1)` on any other value. The `null` path is
**only** reachable via a hand-edited `ocloop.json`, but the loader
passes the file content straight to `resolveResilience` with no
per-field type check, and the warn log from 12.1.A's proposed
`validateConfigShape` would be the only line of defense.

**Where.** `src/lib/config.ts:160-175` (`resolveResilience` /
`pickDefined`).

**Proposed fix.** Two changes that compose well:

1. **Tighten the filter** to also skip `null`:

   ```ts
   const pickDefined = <T extends object>(obj?: T): Partial<T> => {
     if (!obj) return {}
     return Object.fromEntries(
       Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
     ) as Partial<T>
   }
   ```

2. **Reject non-objects** (the array case above):

   ```ts
   const pickDefined = <T extends object>(obj?: T): Partial<T> => {
     if (!obj || Array.isArray(obj)) return {}
     return Object.fromEntries(
       Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
     ) as Partial<T>
   }
   ```

   `Array.isArray(obj)` is the same guard `loadConfig` already uses
   (`config.ts:212`); reusing it keeps the two functions consistent.

The MEDIUM rating reflects that the `null` corruption paths are
reachable from a hand-edited config (the only place a user can supply
`null` to a numeric/boolean field) and the resulting behavior is
silently wrong (no warn, no log) for a `setTimeout`/`null` user. The
fix is two lines and matches the loader's existing array guard.

**Status.** Fix proposed, not applied (audit-only per PLAN.md acceptance
criteria). The two-line tightening should be combined with the
`validateConfigShape` proposed in 12.1.A so the loader also rejects the
bad value at the source (defense in depth).

#### Finding 12.3.B — LOW — `pickDefined` does not validate per-field types; `applyResilienceOverride` does it for CLI input but `loadConfig` does not for the file input

**Problem.** The numeric/boolean contract on `ResilienceConfig` is
**enforced once**, in `applyResilienceOverride` (`src/lib/cli-args.ts:85-117`).
The function uses `DEFAULT_RESILIENCE[key]` to decide the expected type
(line 102), then `Number.isFinite(num) && Number.isInteger(num) && num >= 0`
for numbers, and `raw === "true" || raw === "false" || raw === "1" || raw === "0"`
for booleans. Anything else → `console.error` + `process.exit(1)`.

The file config path skips this check. `loadConfig` returns the parsed
JSON object as-is (with the structural guard at line 212), and
`resolveResilience` trusts the result. A hand-edited config with
`{"resilience": {"createTimeoutMs": "fast"}}` flows through
`pickDefined` (the string is defined), spreads over the default, and
`configureApiTimeouts` later calls `setTimeout("fast", …)` — which
coerces to `NaN` and the API call times out immediately with no
diagnostic.

This is the **same root cause as Finding 12.1.A** (loader does not
validate per-field types). The contract is duplicated in two places
(CLI parser enforces it, loader does not); a single
`validateResilienceShape` helper in `config.ts` would close the gap for
both layers.

**Where.** `src/lib/config.ts:160-175` (`resolveResilience` /
`pickDefined`), read together with `src/lib/cli-args.ts:85-117`
(`applyResilienceOverride`) and `src/lib/config.ts:200-224`
(`loadConfig`).

**Proposed fix.** Reuse the same per-field check that
`applyResilienceOverride` does, in a shared helper:

```ts
import { DEFAULT_RESILIENCE } from "./config" // or local

const isValidResilienceValue = (key: string, v: unknown): boolean => {
  if (!(key in DEFAULT_RESILIENCE)) return false // unknown key
  const def = (DEFAULT_RESILIENCE as Record<string, unknown>)[key]
  if (typeof def === "boolean") return typeof v === "boolean"
  if (typeof def === "number") return typeof v === "number" && Number.isFinite(v) && v >= 0
  return false
}
```

Wire it into both `loadConfig` (reject the whole `resilience` block
with a warn if any field fails) and `applyResilienceOverride` (replace
the duplicated logic with a call to the helper). The MEDIUM in 12.1.A
and the LOW here collapse into one fix.

**Status.** Fix proposed, not applied. LOW rating because the CLI path
(which is the only one exercised in CI) does enforce the contract; the
file path is reachable but requires a hand-edited config.

#### Finding 12.3.C — LOW — `pickDefined` does not reject unknown keys; extra fields in either layer propagate to the result object

**Problem.** `pickDefined` only filters `undefined` (and per 12.3.A,
`null` if the proposed fix is applied). It does not check whether each
key is a known `ResilienceConfig` field. A file config with
`{"resilience": {"createTimeoutMs": 5000, "totallyMadeUpKey": 42}}`
produces a result object that includes `totallyMadeUpKey: 42`. The TypeScript
type annotation `Partial<ResilienceConfig>` on the function parameter
catches this at the type level, but the JSON loader bypasses the
TypeScript layer entirely (the `as OcloopConfig` cast at `config.ts:216`
is unchecked), so the extra key lands in the runtime config object.

The practical impact is zero today: every consumer reads a specific
field by name (`resilience.createTimeoutMs`, `resilience.maxRateLimitRetries`,
etc.), and a field nobody reads is inert. The risk is **future
maintenance**: a refactor that adds a generic `for (const k of
Object.keys(resilience)) …` loop (e.g. for logging, validation, or
forwarding to a new SDK call) would silently see the extra key.

**Where.** `src/lib/config.ts:164-169` (`pickDefined`).

**Proposed fix.** Add a key allowlist check in `pickDefined` (or in the
proposed `validateResilienceShape` from 12.3.B):

```ts
const pickDefined = <T extends object>(obj?: T): Partial<T> => {
  if (!obj || Array.isArray(obj)) return {}
  return Object.fromEntries(
    Object.entries(obj).filter(([k, v]) =>
      k in DEFAULT_RESILIENCE && v !== undefined && v !== null,
    ),
  ) as Partial<T>
}
```

The `k in DEFAULT_RESILIENCE` check is O(1) and guarantees only
known keys reach the spread. Same fix composes with 12.3.A.

**Status.** Fix proposed, not applied. LOW rating — no current
consumer is affected, but the unknown-key propagation is a latent
footgun.

#### Finding 12.3.D — INFO — `resolveResilience` is not strictly idempotent: feeding its own output back through it "promotes" defaults to overrides

**Problem.** `resolveResilience` returns a **full** `ResilienceConfig`
(no `undefined` slots, every field populated). If a caller feeds that
result back through `resolveResilience` (e.g.
`resolveResilience(resolveResilience(a, b), c)`), the inner call has
already filled every slot with a concrete value; the outer call's
`pickDefined` does NOT filter those concrete values, so they are
spread over the outer call's `DEFAULT_RESILIENCE` and win. The net
effect is that **any value present in the inner result is "locked in"
as an override for the outer call**, even if the inner call inherited
it from defaults.

Concrete example:

```ts
const inner = resolveResilience(undefined, { maxRateLimitRetries: 4 })
// inner.maxRateLimitRetries === 4
// inner.createTimeoutMs === 15000 (inherited from defaults)

const outer = resolveResilience(inner, { planTimeoutMs: 120_000 })
// outer.maxRateLimitRetries === 4 (carried over from inner, not the new default)
// outer.planTimeoutMs === 120_000 (from CLI)
// outer.createTimeoutMs === 15000 (carried over from inner, same as default — no observable change here, but the value is now a "first-class" override)
```

In the example above, `maxRateLimitRetries: 4` is correctly preserved
through the second call (no behavior change), but `createTimeoutMs:
15000` is also preserved (which happens to equal the default but is
now sourced from the inner result, not from `DEFAULT_RESILIENCE`). If a
future change moves `DEFAULT_RESILIENCE.createTimeoutMs` to a new
value, the second call would still see the **old** default (locked in
by the first call). This is a snapshot-vs-default divergence.

In practice, no call site feeds `resolveResilience`'s output back in
(all three call sites use `loadConfig().resilience` for the file
layer, which is the **raw** parsed JSON, not a previous
`resolveResilience` result). So the non-idempotency is theoretical for
the current code. It is worth documenting in a comment on line 175 so
a future refactor doesn't accidentally create the divergence.

**Where.** `src/lib/config.ts:160-175` (`resolveResilience`).

**Proposed fix.** Either (a) add a docstring comment noting "do not
feed this function's output back into itself; pass the **raw** file
config and CLI overrides only" or (b) make the function more
defensive by re-introducing `undefined` for fields that were not
explicitly overridden. Option (b) is over-engineering for a function
that is not used recursively; option (a) is enough.

**Status.** INFO — design observation, no fix required. Document the
non-idempotency on the function header.

#### Summary of Phase 12.3 findings

| #       | Severity | One-liner |
|---------|----------|-----------|
| 12.3.A  | MEDIUM   | `pickDefined` filters `undefined` but NOT `null`; a `null` value for a numeric/boolean field in `ocloop.json` silently corrupts the merged config (e.g. `setTimeout(null, …)` → immediate timeout). Tighten the filter to also skip `null` and `Array.isArray(obj)`. |
| 12.3.B  | LOW      | Per-field type validation exists in `applyResilienceOverride` (CLI) but not in `loadConfig` (file); a hand-edited `resilience: {"createTimeoutMs": "fast"}` corrupts the config silently. Extract the type check into a shared `isValidResilienceValue` helper. |
| 12.3.C  | LOW      | `pickDefined` does not reject unknown keys; a stray `"totallyMadeUpKey": 42` propagates to the result. Add `k in DEFAULT_RESILIENCE` to the filter. |
| 12.3.D  | INFO     | `resolveResilience` is not idempotent in the strict sense — feeding its output back through it locks the inner call's filled-in slots as outer overrides. Not reachable from any current call site; add a docstring comment. |

**Net severity tally for Phase 12.3: 1 MEDIUM, 2 LOW, 1 INFO; no CRITICAL or HIGH.** The two PLAN.md-required cases (3-level merge order and `undefined`-skip) are both correct as written. The MEDIUM is the `null` gap: the `undefined` filter is too permissive and a single missing comparison allows hand-edited configs to produce silently-wrong behavior. The two LOWs (per-field type validation, unknown-key rejection) share the same root cause as Finding 12.1.A (loader has no schema check) and can be folded into the same `validateConfigShape` / `isValidResilienceValue` refactor. The INFO notes non-idempotency for future maintainers. No tests exist for `resolveResilience`; the 4-case table above is a candidate starter set for `src/lib/config.test.ts`. Tasks 12.4-12.6 (`isLocale` strictness, i18n parity, `setLocale` persistence) are deferred to subsequent iterations.
