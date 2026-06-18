import { test, expect, afterAll } from "bun:test"
import { t, setLocale, getLocale } from "./i18n"

// Regression guard: the loop prompt must scope its failed-task revert to the
// files the iteration itself changed. A whole-tree `git checkout -- .` wipes a
// concurrent agent's uncommitted work — the bug this protects against. The
// string is duplicated per locale (and into examples/.loop-prompt.md), so drift
// is the real risk. Asserts the scoped form positively because the new text
// also *mentions* `git checkout -- .` inside its prohibition.
const original = getLocale()
afterAll(() => setLocale(original))

for (const locale of ["en", "es"] as const) {
  test(`defaultLoopPrompt (${locale}) reverts only the iteration's own files`, () => {
    setLocale(locale)
    expect(t("defaultLoopPrompt")).toContain("git checkout -- <")
  })
}
