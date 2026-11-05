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

// The shipped example prompts are what the README tells users to copy over
// `.loop-prompt.md`, and OCLoop writes `t("defaultLoopPrompt")` there when
// the file is missing (src/index.tsx). A user who copies the example must get
// the SAME prompt as a user who does not — so the example has to be
// byte-identical to the embedded one.
//
// Nothing imports the examples, so drift is invisible: it happened twice
// (the `{{CURRENT_TASK}}` line and the eval-rubrics block each lived in one
// copy only) and no test noticed. This guard closes that hole.
const EXAMPLE_PROMPTS = [
  { locale: "en", file: "examples/loop-prompt.md" },
  { locale: "es", file: "examples/loop-prompt.es.md" },
] as const

for (const { locale, file } of EXAMPLE_PROMPTS) {
  test(`${file} is byte-identical to the default loop prompt (${locale})`, async () => {
    setLocale(locale)
    const onDisk = await Bun.file(`${repoRoot()}/${file}`).text()
    expect(onDisk).toBe(t("defaultLoopPrompt"))
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
