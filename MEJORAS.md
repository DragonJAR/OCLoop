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
- [ ] **Task 1.8** — Verify `--resume` combined with `--run`, `--create-plan`, and standalone behavior.
- [ ] **Task 1.9** — Document: `requireValue` treats a value starting with `-` (except lone `-`) as missing — verify this rejects `--plan --debug` correctly but allows `--plan -` (a valid filename). (Covered by tests at lines 211-218; cross-pinned for --prompt and --plan paths in section 1.6.)
- [ ] **Task 1.10** — Check if `parseArgs` is idempotent — calling it twice should produce the same result. (Test at lines 238-244.)

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
