/**
 * Test helper: a stdout sink for the OpenTUI test renderer that throws the
 * frames away.
 *
 * The test renderer writes to `config.stdout`, which defaults to the
 * process's stdout. In a CI run that stdout is a pipe, and Bun cannot open
 * /dev/null for the child's stdin on Windows — it falls back to stdout, so
 * the frames the renderer writes are fed back into the process as input and
 * end up in the captured output. The regression scenarios assert that the
 * child produced no output at all, so on Windows they failed on the frames
 * instead of on the behaviour they are meant to pin.
 *
 * The frames are read back from the renderer's own buffer by
 * `captureCharFrame()`, so discarding stdout costs the tests nothing.
 */

import { Writable } from "node:stream"

/** Cursor-control methods the renderer may call on its output stream. */
const NOOP_METHODS = [
  "clearLine",
  "clearScreenDown",
  "cursorTo",
  "moveCursor",
  "getColorDepth",
  "hasColors",
  "setRawMode",
]

/**
 * A write stream that accepts everything and keeps nothing, shaped like the
 * `WriteStream` the renderer expects.
 */
export function discardingStdout(): NodeJS.WriteStream {
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
  }) as unknown as NodeJS.WriteStream

  const mutable = sink as unknown as Record<string, unknown>
  for (const method of NOOP_METHODS) {
    mutable[method] = () => true
  }
  mutable.columns = 80
  mutable.rows = 24
  mutable.isTTY = false

  return sink
}
