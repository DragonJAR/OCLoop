import { test, expect, afterAll } from "bun:test"
import { t, setLocale, getLocale } from "./i18n"
import { repoRoot } from "../ui/render-scenario"

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

  // The agent must treat the folder where ocloop was launched (process.cwd())
  // as the working directory / project root and resolve mentioned files there.
  // Pinned in both locales since the prompt is duplicated (i18n + examples).
  test(`defaultLoopPrompt (${locale}) includes the CURRENT_TASK placeholder`, () => {
    expect(t("defaultLoopPrompt")).toContain("{{CURRENT_TASK}}")
  })

  test(`defaultLoopPrompt (${locale}) declares the cwd as the working directory`, () => {
    setLocale(locale)
    expect(t("defaultLoopPrompt").toLowerCase()).toMatch(/working directory|directorio de trabajo/)
  })
}

// The prompt is duplicated per locale, and duplicates drift: a line added to
// one and not the other means an agent working in that language gets
// different instructions than an agent working in the other — and nothing
// notices, because each locale's copy is internally consistent.
//
// The wording is translated, so it cannot be compared; the SHAPE can. A
// translated prompt has the same lines, the same numbered items, the same
// bullets and the same blanks as the original. Pinning those four counts is
// enough to catch a line that was added, dropped or re-ordered in one
// locale only — which is how the eval-rubrics block and the
// {{CURRENT_TASK}} line ended up in one copy and not the other.
function promptShape(locale: "en" | "es"): {
  lines: number
  numbered: number
  bullets: number
  blanks: number
} {
  setLocale(locale)
  const lines = t("defaultLoopPrompt").split("\n")
  return {
    lines: lines.length,
    numbered: lines.filter((l) => /^\d+\.\s/.test(l)).length,
    bullets: lines.filter((l) => /^- /.test(l)).length,
    blanks: lines.filter((l) => l.trim() === "").length,
  }
}

test("defaultLoopPrompt has the same shape in both locales", () => {
  const en = promptShape("en")
  const es = promptShape("es")
  setLocale("en")
  expect(es).toEqual(en)
})

// The shipped example prompts are what the README tells users to copy over
// `.loop-prompt.md`, and OCLoop writes `t("defaultLoopPrompt")` there when
// the file is missing (src/index.tsx). A user who copies the example must get
// the SAME prompt as a user who does not — so the example has to match the
// embedded one.
//
// Nothing imports the examples, so drift is invisible: it happened twice
// (the `{{CURRENT_TASK}}` line and the eval-rubrics block each lived in one
// copy only) and no test noticed. This guard closes that hole.
//
// The comparison is on CONTENT, not on the bytes of the file: what Git checks
// out depends on the platform's line-ending settings, so a byte comparison
// fails on a Windows checkout for a reason that has nothing to do with the
// prompt (it did, on the first CI run of this guard). The embedded prompt is
// always LF (it is built with join("\n")), so normalising the file's endings
// is enough to compare them.
const EXAMPLE_PROMPTS = [
  { locale: "en", file: "examples/loop-prompt.md" },
  { locale: "es", file: "examples/loop-prompt.es.md" },
] as const

for (const { locale, file } of EXAMPLE_PROMPTS) {
  test(`${file} matches the default loop prompt (${locale})`, async () => {
    setLocale(locale)
    const onDisk = await Bun.file(`${repoRoot()}/${file}`).text()
    expect(onDisk.replace(/\r\n/g, "\n")).toBe(t("defaultLoopPrompt"))
  })
}

// B3: messages that cite the config file must interpolate the REAL path
// (getConfigPath(): XDG_CONFIG_HOME > %APPDATA% > ~/.config), not the
// hardcoded POSIX location — on Windows that file is never read. Pinned in
// both locales; an explicit configPath param must win for tests/future sites.
import { getConfigPath } from "./config"

for (const locale of ["en", "es"] as const) {
  test(`config-path messages (${locale}) cite the real config path`, () => {
    setLocale(locale)
    expect(t("toastConfigSaveFailed")).toContain(getConfigPath())
    expect(t("cpTimeout", { secs: 60 })).toContain(getConfigPath())
    expect(t("cliHelp", { version: "test", resilienceKeys: "n/a" })).toContain(getConfigPath())
  })

  test(`config-path messages (${locale}) accept an explicit configPath param`, () => {
    setLocale(locale)
    expect(t("toastConfigSaveFailed", { configPath: "/custom/ocloop.json" })).toContain(
      "/custom/ocloop.json",
    )
    expect(t("toastConfigSaveFailed", { configPath: "/custom/ocloop.json" })).not.toContain(
      getConfigPath(),
    )
  })

  test(`config-path messages (${locale}) no longer cite the hardcoded POSIX path`, () => {
    setLocale(locale)
    expect(t("toastConfigSaveFailed")).not.toContain("~/.config/ocloop/ocloop.json")
    expect(t("cpTimeout", { secs: 60 })).not.toContain("~/.config/ocloop/ocloop.json")
  })
}
