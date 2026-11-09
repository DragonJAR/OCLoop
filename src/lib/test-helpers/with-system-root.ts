/**
 * Run `fn` with `process.env.SystemRoot` set to `value` (or deleted when
 * `undefined`), restoring the ORIGINAL value afterwards even when `fn` throws
 * or rejects.
 *
 * Single shared copy (T13-D P15-1), same shape as `with-platform.ts`: a
 * hand-rolled patch that forgets to restore leaks a fake SystemRoot into
 * every later test in the process.
 */
export async function withSystemRoot<T>(
  value: string | undefined,
  fn: () => T | Promise<T>,
): Promise<T> {
  const prev = process.env.SystemRoot
  if (value === undefined) delete process.env.SystemRoot
  else process.env.SystemRoot = value
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.SystemRoot
    else process.env.SystemRoot = prev
  }
}
