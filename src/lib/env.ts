/**
 * Environment-map helpers that keep Windows' case-insensitive env semantics.
 *
 * On Windows `process.env` is a case-insensitive object, but a spread
 * (`{ ...process.env }`) or an injected map is a PLAIN object: `Path` and
 * `PATH`, or `opencode_config_content` and `OPENCODE_CONFIG_CONTENT`, become
 * distinct keys and both reach the child, which then picks one arbitrarily.
 */

/** Delete every casing variant of `name` from `env` (in place). Returns `env`. */
export function stripEnvKey<T extends Record<string, string | undefined>>(env: T, name: string): T {
  const upper = name.toUpperCase()
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === upper) delete env[key]
  }
  return env
}

/**
 * Copy of `env` with every key upper-cased (the spelling detection code reads).
 * When two spellings collide, the already-upper-case key wins.
 */
export function upperCaseEnvKeys(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(env)) {
    const upper = key.toUpperCase()
    if (key === upper || !(upper in out)) out[upper] = value
  }
  return out
}
