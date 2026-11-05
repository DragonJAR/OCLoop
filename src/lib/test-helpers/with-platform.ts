/**
 * Run `fn` with `process.platform` patched to `platform`, restoring the
 * ORIGINAL descriptor afterwards even when `fn` throws or rejects.
 *
 * Single shared copy (T10-D P10-5): a hand-rolled patch that forgets to
 * restore leaves every later test in the process on the wrong platform.
 * Production code that can take an injected `platform` parameter should get
 * one instead; this is for code that reads `process.platform` directly.
 */
export async function withPlatform<T>(
  platform: NodeJS.Platform,
  fn: () => T | Promise<T>,
): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform")
  Object.defineProperty(process, "platform", { value: platform, configurable: true })
  try {
    return await fn()
  } finally {
    if (descriptor) Object.defineProperty(process, "platform", descriptor)
  }
}
