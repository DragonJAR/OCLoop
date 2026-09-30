/**
 * useSSE hook tests (parallel to the existing useSSE.test.ts classifier suite).
 *
 * Source: MEJORAS.md Finding 18.3.A (MEDIUM — `useSSE.test.ts` tests the
 * classifier, not the hook).
 *
 * The classifier tests at `useSSE.test.ts` cover `classifySessionError`. The
 * 660 lines of `useSSE.ts` (lines 300-660) have the following hook
 * behaviors with no test coverage until this file:
 *
 *   1. Connection lifecycle: `connect()` early-returns on empty URL.
 *   2. Status transitions: disconnected → connecting → connected → disconnected.
 *   3. Reconnection backoff: failures increment the streak, which only resets after a successful handshake.
 *   4. Event filtering by sessionId: 6 event types share the same shape.
 *   5. `processEvent` dispatch wiring: 9 event types call the right `onX`.
 *   6. `seenPartIds` dedup: a second `tool-use` with the same id is silent.
 *   7. `messageRoles` map: `message.updated` sets role, `message.part.updated` reads it.
 *   8. Superseded controller guard: a stale `connect()` bails without mutating status.
 *   9. `reconnect()` state reset: fresh `subscribe` is called, status resets to disconnected.
 *  10. `disconnect()` cancellation: `shouldReconnect=false`, `abortController.abort()`.
 *  11. `onAnyEvent`: called for every event before the switch.
 *  12. non-AbortError connection error path: `status=error`, `onError`, schedule reconnect.
 *  13. Stream ended naturally: `status=disconnected`, schedule reconnect.
 *  14. `session.created` dedup-map reset: `seenPartIds` and `messageRoles` are cleared.
 *  15. The configured ping timeout is passed to `subscribeEvents`.
 *
 * ## Why we drive connections via `reconnect()` (not `onMount`)
 *
 * `useSSE`'s autoStart is registered via Solid's `onMount`, which only
 * fires after the hook is attached to a *rendered* component (it
 * requires the owner to be "mounted" to a DOM, not just created in a
 * `createRoot`). Verified empirically per `docs/solid-hook-testing.md`:
 * registering `onMount` inside a bare `createRoot` (no `render`) does
 * not fire the callback. `bun:test` does not provide a DOM
 * (`globalThis.document === undefined`) so `solid-js/web`'s `render` /
 * `renderToString` cannot be used.
 *
 * Each test therefore uses `autoConnect: false` and drives a connection
 * via the public `reconnect()` method, which calls the same `connect()`
 * helper internally. The resulting state is observably equivalent to a
 * successful autoStart: `status === "connected"`, the corresponding
 * `onX` handler fires, etc. The `autoConnect: true` path remains
 * integration-territory and is not unit-testable without a DOM render.
 *
 * ## Mock pattern
 *
 * The OpenCode SDK v2 client is mocked at the module boundary via
 * `mock.module` (the same pattern `useServer.test.ts` uses for
 * `@opencode-ai/sdk/server`). The mock factory reads from a mutable
 * closure so each test can swap the subscribe implementation. The fake
 * subscribe returns `{ stream: AsyncIterable<BackendEvent> }` that the test
 * controls via a push API (`push` an event, `close` to simulate a
 * server-side disconnect). An `abort` listener on the signal closes
 * the stream so `disconnect()` unblocks the `for await` loop.
 *
 * Safe here because `useSSE.ts` has no JSX (the `docs/testing.md`
 * `@opentui/solid` `mock.module` warning is JSX-transform specific).
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { createRoot } from "solid-js"
import type { BackendEvent } from "../lib/api"

const TEST_PING_TIMEOUT_MS = 12_345
let observedSubscribeTimeout: number | undefined

// Mutable subscribe impl swapped by individual tests. The fake API boundary
// records the options useSSE passes before returning the controlled stream.
let subscribeImpl: (
  params: { directory?: string },
  options: { signal?: AbortSignal },
) => Promise<{ stream: AsyncIterable<BackendEvent> }> = async () => ({
  stream: (async function* () {})(),
})

const realApiExports = await import("../lib/api")
const realApiSnapshot = { ...realApiExports }

mock.module("../lib/api", () => ({
  createClient: () => ({
    subscribeEvents: (options: {
      directory?: string
      signal?: AbortSignal
      timeoutMs?: number
    }) => {
      observedSubscribeTimeout = options.timeoutMs
      return subscribeImpl(
        { directory: options.directory },
        { signal: options.signal },
      )
    },
  }),
  getApiTimeouts: () => ({ ping: TEST_PING_TIMEOUT_MS }),
}))

const { useSSE } = await import("./useSSE")
// Restore the real API exports after this file finishes; Bun's module mocks
// persist across test files in the full-suite run.
afterAll(() => {
  mock.module("../lib/api", () => ({ ...realApiSnapshot }))
})

const tick = (ms = 5) => new Promise<void>((r) => setTimeout(r, ms))

async function flushMicrotasks(count = 8): Promise<void> {
  for (let i = 0; i < count; i++) {
    await Promise.resolve()
  }
}

/**
 * Push-based async iterable the test controls. Events pushed before the
 * consumer is awaiting are queued; events pushed while the consumer is
 * awaiting resolve the pending `next()` immediately. `close()` resolves
 * any pending `next()` with `{ done: true }`.
 */
function makePushStream<T>(): {
  stream: AsyncIterable<T>
  push: (item: T) => void
  close: () => void
} {
  const queue: T[] = []
  let resolveNext: ((v: IteratorResult<T>) => void) | null = null
  let closed = false
  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next: () => {
          if (queue.length) {
            return Promise.resolve({ value: queue.shift() as T, done: false })
          }
          if (closed) {
            return Promise.resolve({ value: undefined as T, done: true })
          }
          return new Promise<IteratorResult<T>>((resolve) => {
            resolveNext = resolve
          })
        },
      }
    },
  }
  return {
    stream,
    push(item: T) {
      if (resolveNext) {
        const r = resolveNext
        resolveNext = null
        r({ value: item, done: false })
      } else {
        queue.push(item)
      }
    },
    close() {
      closed = true
      if (resolveNext) {
        const r = resolveNext
        resolveNext = null
        r({ value: undefined as T, done: true })
      }
    },
  }
}

// Event factory helpers. Each constructs a real `BackendEvent` shape (so the
// switch in processEvent matches) while keeping the test readable.

function evSessionCreated(sessionId: string): BackendEvent {
  return {
    type: "session.created",
    properties: { info: { id: sessionId } },
  }
}

function evSessionIdle(sessionId: string): BackendEvent {
  return { type: "session.idle", properties: { sessionID: sessionId } }
}

function evTodoUpdated(sessionId: string): BackendEvent {
  return {
    type: "todo.updated",
    properties: {
      sessionID: sessionId,
      todos: [{ id: "1", content: "task", status: "in_progress", priority: "high" }],
    },
  }
}

function evFileEdited(file: string): BackendEvent {
  return { type: "file.edited", properties: { file } }
}

function evSessionError(sessionId: string | undefined, error: unknown): BackendEvent {
  return {
    type: "session.error",
    properties: { sessionID: sessionId, error },
  }
}

function evMessageUpdated(
  messageId: string,
  role: "user" | "assistant",
  sessionId?: string,
): BackendEvent {
  return {
    type: "message.updated",
    properties: { info: { id: messageId, role, sessionID: sessionId } },
  }
}

function evMessagePartToolUse(
  partId: string,
  messageId: string,
  sessionId: string,
  state: "running" | "completed" = "running",
): BackendEvent {
  return {
    type: "message.part.updated",
    properties: {
      part: {
        id: partId,
        messageID: messageId,
        sessionID: sessionId,
        type: "tool-use",
        tool: "bash",
        state: { tool: "bash", input: { cmd: "ls" }, status: state },
      },
    },
  }
}

function evMessagePartText(
  partId: string,
  messageId: string,
  sessionId: string,
  text: string,
): BackendEvent {
  return {
    type: "message.part.updated",
    properties: {
      part: {
        id: partId,
        messageID: messageId,
        sessionID: sessionId,
        type: "text",
        text,
      },
    },
  }
}

/**
 * Build a `useSSE` instance inside a `createRoot` and run a callback
 * once any microtasks have settled. The callback receives the hook
 * return and a `dispose` that the callback MUST call before returning
 * so `onCleanup → disconnect` runs deterministically.
 *
 * `autoConnect: false` is the default — see the file-level comment
 * for why we drive connections via `reconnect()` instead of `onMount`.
 */
function withSSE<T>(
  options: Parameters<typeof useSSE>[0],
  run: (sse: ReturnType<typeof useSSE>, dispose: () => void) => Promise<T> | T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    createRoot((dispose) => {
      const sse = useSSE(options)
      queueMicrotask(async () => {
        try {
          const result = await run(sse, dispose)
          resolve(result)
        } catch (err) {
          reject(err)
        }
      })
    })
  })
}

/**
 * Set up `subscribeImpl` to return a `PushStream` that the test can drive.
 * Returns the push controller so the test can push events / close the stream.
 * The signal's `abort` event is wired to close the stream so `disconnect()`
 * unblocks the `for await` loop.
 */
function driveableSubscribe(): ReturnType<typeof makePushStream<BackendEvent>> {
  const sub = makePushStream<BackendEvent>()
  subscribeImpl = async (_params, options) => {
    options?.signal?.addEventListener("abort", () => sub.close())
    return { stream: sub.stream }
  }
  return sub
}

/**
 * Wait until the SSE status reaches the expected value or fail after
 * ~500ms. The hook's transitions are microtask-driven, so this is just
 * a safety net for a missed microtask hop.
 */
async function waitForStatus(
  sse: ReturnType<typeof useSSE>,
  expected: ReturnType<typeof sse.status>,
  timeoutMs = 500,
): Promise<void> {
  const start = Date.now()
  while (sse.status() !== expected) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`status stuck at ${sse.status()}; expected ${expected}`)
    }
    await tick(2)
  }
}

describe("useSSE hook (Finding 18.3.A)", () => {
  let defaultSubscribeImpl: typeof subscribeImpl

  beforeEach(() => {
    defaultSubscribeImpl = async () => ({ stream: (async function* () {})() })
    subscribeImpl = defaultSubscribeImpl
    observedSubscribeTimeout = undefined
  })

  afterEach(() => {
    subscribeImpl = defaultSubscribeImpl
  })

  describe("connection lifecycle", () => {
    it("initial state: status=disconnected, no error, no attempts", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        (sse, dispose) => {
          expect(sse.status()).toBe("disconnected")
          expect(sse.error()).toBeUndefined()
          expect(sse.reconnectAttempts()).toBe(0)
          dispose()
        },
      ))

    it("reconnect with empty URL: status stays disconnected (no state change)", () =>
      withSSE(
        { info: () => ({ url: "", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          await sse.reconnect()
          await tick(10)
          expect(sse.status()).toBe("disconnected")
          // No new subscription was attempted (no signal-bound listener needed).
          expect(sse.error()).toBeUndefined()
          dispose()
        },
      ))

    it("reconnect with valid URL: status transitions disconnected → connecting → connected", () =>
      withSSE(
        { info: () => ({ url: "http://127.0.0.1:4096", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          driveableSubscribe()
          await sse.reconnect()
          await waitForStatus(sse, "connected")
          expect(sse.status()).toBe("connected")
          expect(sse.error()).toBeUndefined()
          // A successful connection clears the reconnect streak.
          expect(sse.reconnectAttempts()).toBe(0)
          dispose()
        },
      ))

    it("disconnect: status=disconnected, abortController fires abort on the signal", () =>
      withSSE(
        { info: () => ({ url: "http://127.0.0.1:4096", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          const sub = driveableSubscribe()
          let aborted = false
          subscribeImpl = async (_params, options) => {
            options?.signal?.addEventListener("abort", () => {
              aborted = true
              sub.close()
            })
            return { stream: sub.stream }
          }

          await sse.reconnect()
          await waitForStatus(sse, "connected")
          sse.disconnect()
          await tick(5)
          expect(sse.status()).toBe("disconnected")
          expect(aborted).toBe(true)
          dispose()
        },
      ))

    it("reconnect from a connected state: fresh subscribe, status resets through connecting", () =>
      withSSE(
        { info: () => ({ url: "http://127.0.0.1:4096", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          let subscribes = 0
          subscribeImpl = async (_params, options) => {
            subscribes++
            const sub = makePushStream<BackendEvent>()
            options?.signal?.addEventListener("abort", () => sub.close())
            return { stream: sub.stream }
          }

          await sse.reconnect()
          await waitForStatus(sse, "connected")
          expect(subscribes).toBe(1)

          await sse.reconnect()
          await waitForStatus(sse, "connected")
          // The second reconnect must trigger a fresh subscribe (not bail on
          // the existing "connected" guard) — this is the post-restart
          // reconnect-wedge fix at useSSE.ts:639.
          expect(subscribes).toBe(2)
          dispose()
        },
      ))

    it("successful manual reconnect clears the reconnect streak after handshake", () =>
      withSSE(
        { info: () => ({ url: "http://127.0.0.1:4096", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          // First subscribe: throw to bump reconnectAttempts to 1.
          let subscribes = 0
          subscribeImpl = async () => {
            subscribes++
            throw new Error("boom")
          }

          await sse.reconnect()
          await flushMicrotasks()
          expect(subscribes).toBe(1)
          // After the error, status=error and the scheduleReconnect path
          // has bumped reconnectAttempts to 1.
          expect(sse.reconnectAttempts()).toBe(1)
          expect(sse.status()).toBe("error")

          // A successful manual reconnect clears the streak in connect()
          // after its subscription handshake resolves.
          driveableSubscribe()
          await sse.reconnect()
          await waitForStatus(sse, "connected")
          expect(sse.reconnectAttempts()).toBe(0)
          dispose()
        },
      ))

    it("failed manual reconnect preserves the accumulated reconnect streak", () =>
      withSSE(
        { info: () => ({ url: "http://127.0.0.1:4096", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          let subscribes = 0
          let firstStream!: ReturnType<typeof makePushStream<BackendEvent>>
          subscribeImpl = async (_params, options) => {
            subscribes++
            if (subscribes === 1) {
              firstStream = makePushStream<BackendEvent>()
              options?.signal?.addEventListener("abort", () => firstStream.close())
              return { stream: firstStream.stream }
            }
            throw new Error("manual reconnect failed")
          }

          await sse.reconnect()
          await waitForStatus(sse, "connected")
          firstStream.close()
          await flushMicrotasks()
          expect(sse.status()).toBe("disconnected")
          expect(sse.reconnectAttempts()).toBe(1)

          // Cancel the scheduled retry and force the next handshake to fail.
          await sse.reconnect()
          await flushMicrotasks()
          expect(subscribes).toBe(2)
          expect(sse.status()).toBe("error")
          expect(sse.error()?.message).toBe("manual reconnect failed")
          expect(sse.reconnectAttempts()).toBe(2)
          dispose()
        },
      ))

    it("passes the configured ping timeout to subscribeEvents", () =>
      withSSE(
        { info: () => ({ url: "http://127.0.0.1:4096", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          driveableSubscribe()
          await sse.reconnect()
          await waitForStatus(sse, "connected")
          expect(observedSubscribeTimeout).toBe(TEST_PING_TIMEOUT_MS)
          dispose()
        },
      ))
  })

  describe("event dispatch (onX wiring)", () => {
    it("session.created → onSessionCreated with the session id", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          const sub = driveableSubscribe()
          let captured: string | undefined
          const sseWithHandler = await import("./useSSE").then((m) =>
            createRoot((d) => {
              const h = m.useSSE({
                info: () => ({ url: "http://x", version: 1 }),
                handlers: {
                  onSessionCreated: (id) => {
                    captured = id
                  },
                },
              })
              return { h, d }
            }),
          )

          subscribeImpl = async (_p, options) => {
            options?.signal?.addEventListener("abort", () => sub.close())
            return { stream: sub.stream }
          }
          await sseWithHandler.h.reconnect()
          await waitForStatus(sseWithHandler.h, "connected")
          sub.push(evSessionCreated("sess-1"))
          await tick(5)
          expect(captured).toBe("sess-1")
          sseWithHandler.d()
          dispose()
        },
      ))

    it("session.idle → onSessionIdle with the session id", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let captured: string | undefined
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: { onSessionIdle: (id) => (captured = id) },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evSessionIdle("sess-2"))
          await tick(5)
          expect(captured).toBe("sess-2")
          wrapped.d()
          dispose()
        },
      ))

    it("todo.updated → onTodoUpdated with the todos array", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let capturedTodos: unknown
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: { onTodoUpdated: (_id, todos) => (capturedTodos = todos) },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evTodoUpdated("sess-3"))
          await tick(5)
          expect(Array.isArray(capturedTodos)).toBe(true)
          expect((capturedTodos as Array<{ id: string }>)[0].id).toBe("1")
          wrapped.d()
          dispose()
        },
      ))

    it("file.edited → onFileEdited with the file path", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let captured: string | undefined
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: { onFileEdited: (file) => (captured = file) },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evFileEdited("/tmp/PLAN.md"))
          await tick(5)
          expect(captured).toBe("/tmp/PLAN.md")
          wrapped.d()
          dispose()
        },
      ))

    it("session.error → onSessionError with a classified SessionError", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let capturedError: { kind: string; isAborted: boolean; message: string } | undefined
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: {
                onSessionError: (_id, err) => {
                  capturedError = { kind: err.kind, isAborted: err.isAborted, message: err.message }
                },
              },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evSessionError("sess-4", { name: "RateLimitError", message: "slow down" }))
          await tick(5)
          expect(capturedError?.kind).toBe("rate_limit")
          expect(capturedError?.isAborted).toBe(false)
          expect(capturedError?.message).toBe("slow down")
          wrapped.d()
          dispose()
        },
      ))

    it("message.part.updated (tool-use) → onToolUse, dedup on part.id", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let calls = 0
          let firstStatus: string | undefined
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: {
                onToolUse: (part) => {
                  calls++
                  if (calls === 1) firstStatus = part.state.status
                },
              },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evMessagePartToolUse("part-1", "msg-1", "sess-5", "running"))
          sub.push(evMessagePartToolUse("part-1", "msg-1", "sess-5", "completed"))
          await tick(5)
          expect(calls).toBe(1)
          expect(firstStatus).toBe("running")
          // Pushing the SAME part id with a "completed" state must not
          // re-emit (seenPartIds dedup at useSSE.ts:432).
          wrapped.d()
          dispose()
        },
      ))

    it("message.part.updated (text) → onMessageText defaults to 'assistant' without message.updated", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let capturedRole: string | undefined
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: {
                onMessageText: (_part, role) => {
                  capturedRole = role
                },
              },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evMessagePartText("part-t1", "msg-1", "sess-6", "hi"))
          await tick(5)
          // No message.updated preceded this part → role defaults to "assistant".
          expect(capturedRole).toBe("assistant")
          wrapped.d()
          dispose()
        },
      ))

    it("message.part.updated (text) → onMessageText uses role from a prior message.updated", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let capturedRole: string | undefined
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: {
                onMessageText: (_part, role) => {
                  capturedRole = role
                },
              },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          // First, set role for the message.
          sub.push(evMessageUpdated("msg-1", "user"))
          await tick(2)
          // Then push a text part for the same message.
          sub.push(evMessagePartText("part-t1", "msg-1", "sess-7", "hi"))
          await tick(5)
          expect(capturedRole).toBe("user")
          wrapped.d()
          dispose()
        },
      ))

    it("message.updated from another session does not leak into the filtered session", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let capturedRole: string | undefined
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              sessionId: () => "sess-target",
              handlers: {
                onMessageText: (_part, role) => {
                  capturedRole = role
                },
              },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evMessageUpdated("msg-1", "user", "sess-other"))
          await tick(2)
          sub.push(evMessagePartText("part-t1", "msg-1", "sess-target", "hi"))
          await tick(5)
          expect(capturedRole).toBe("assistant")
          wrapped.d()
          dispose()
        },
      ))
  })

  describe("filtering and dedup", () => {
    it("session.idle with mismatched filterSessionId is dropped (no onSessionIdle)", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let calls = 0
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              sessionId: () => "sess-A",
              handlers: { onSessionIdle: () => calls++ },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evSessionIdle("sess-B"))
          await tick(5)
          expect(calls).toBe(0)
          wrapped.d()
          dispose()
        },
      ))

    it("session.idle matching the filterSessionId is dispatched", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let calls = 0
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              sessionId: () => "sess-A",
              handlers: { onSessionIdle: () => calls++ },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evSessionIdle("sess-A"))
          await tick(5)
          expect(calls).toBe(1)
          wrapped.d()
          dispose()
        },
      ))

    it("session.created clears seenPartIds: a tool-use emitted again after session.created re-fires", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          let calls = 0
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: { onToolUse: () => calls++ },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")

          sub.push(evMessagePartToolUse("part-X", "msg-X", "sess-9", "running"))
          await tick(2)
          expect(calls).toBe(1)

          // Same part id again → still dedup'd.
          sub.push(evMessagePartToolUse("part-X", "msg-X", "sess-9", "running"))
          await tick(2)
          expect(calls).toBe(1)

          // session.created clears the dedup map (useSSE.ts:352).
          sub.push(evSessionCreated("sess-9"))
          await tick(2)
          // Now the same part id can re-emit.
          sub.push(evMessagePartToolUse("part-X", "msg-X", "sess-9", "running"))
          await tick(5)
          expect(calls).toBe(2)

          wrapped.d()
          dispose()
        },
      ))

    it("onAnyEvent fires for every event before the per-type switch", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          const seen: string[] = []
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: {
                onAnyEvent: (e) => seen.push(e.type),
                onFileEdited: () => {},
                onSessionIdle: () => {},
              },
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          sub.push(evFileEdited("/a"))
          sub.push(evSessionIdle("sess-Z"))
          await tick(5)
          expect(seen).toEqual(["file.edited", "session.idle"])
          wrapped.d()
          dispose()
        },
      ))
  })

  describe("error and end-of-stream paths", () => {
    it("non-AbortError on subscribe: status=error, onError called, reconnectAttempts++", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          subscribeImpl = async () => {
            throw new Error("connection refused")
          }
          let onErrorCalled = false
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              onError: () => {
                onErrorCalled = true
              },
              handlers: {},
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await flushMicrotasks()
          expect(wrapped.h.status()).toBe("error")
          expect(wrapped.h.error()?.message).toBe("connection refused")
          expect(wrapped.h.reconnectAttempts()).toBe(1)
          expect(onErrorCalled).toBe(true)
          // The scheduleReconnect path has been entered — we don't wait
          // for the actual backoff timer (1000ms+) since the audit cares
          // about state, not timing.
          wrapped.d()
          dispose()
        },
      ))

    it("AbortError (from disconnect during connect) leaves status alone, no onError", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          // Subscribe resolves AFTER the signal is aborted — simulates the
          // race where the user disconnects mid-handshake.
          subscribeImpl = async (_params, options) => {
            return new Promise((resolve, reject) => {
              options?.signal?.addEventListener("abort", () => {
                const err = new Error("aborted")
                err.name = "AbortError"
                reject(err)
              })
            })
          }
          let onErrorCalled = false
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              onError: () => {
                onErrorCalled = true
              },
              handlers: {},
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          // Status is "connecting" right after reconnect().
          expect(wrapped.h.status()).toBe("connecting")
          // Disconnect aborts the in-flight subscribe.
          wrapped.h.disconnect()
          await tick(5)
          // Status is what disconnect() left it at: "disconnected".
          expect(wrapped.h.status()).toBe("disconnected")
          expect(onErrorCalled).toBe(false)
          wrapped.d()
          dispose()
        },
      ))

    it("stream ends naturally (server closes it): status=disconnected, reconnectAttempts++", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          const sub = driveableSubscribe()
          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: {},
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")
          // Simulate the server closing the stream.
          sub.close()
          await tick(5)
          // After the for-await exits, the connect() code (line 540)
          // sets status=disconnected and scheduleReconnect bumps the
          // counter.
          expect(wrapped.h.status()).toBe("disconnected")
          expect(wrapped.h.reconnectAttempts()).toBe(1)
          wrapped.d()
          dispose()
        },
      ))

    it("superseded controller: a second reconnect during an in-flight connect does not let the stale connect clobber status", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (_sse, dispose) => {
          // First subscribe: never resolves until we call `releaseFirst`,
          // so the first connect() is stuck on the `await subscribe` line.
          let releaseFirst!: () => void
          subscribeImpl = async (_params, options) => {
            const sub = makePushStream<BackendEvent>()
            options?.signal?.addEventListener("abort", () => sub.close())
            await new Promise<void>((r) => {
              releaseFirst = () => r()
            })
            return { stream: sub.stream }
          }

          const { useSSE } = await import("./useSSE")
          const wrapped = createRoot((d) => {
            const h = useSSE({
              info: () => ({ url: "http://x", version: 1 }),
              handlers: {},
            })
            return { h, d }
          })

          await wrapped.h.reconnect()
          // First connect is in-flight (await on subscribe). The hook's
          // local `myController` is set; abortController === myController.
          expect(wrapped.h.status()).toBe("connecting")

          // Now drive a second reconnect — it will abort the first
          // controller and start a fresh one.
          driveableSubscribe()
          await wrapped.h.reconnect()
          await waitForStatus(wrapped.h, "connected")

          // Release the first subscribe. The first connect's
          // `await subscribe` resolves, then it checks
          // `abortController !== myController` and bails WITHOUT
          // mutating status. The status must still be "connected"
          // (set by the second connect), NOT "disconnected" or "error".
          releaseFirst()
          await tick(5)
          expect(wrapped.h.status()).toBe("connected")

          wrapped.d()
          dispose()
        },
      ))

    it("message.part.updated triggers onHeartbeat on every chunk even when seenPartIds dedups onMessageText", () =>
      withSSE(
        { info: () => ({ url: "http://x", version: 1 }), handlers: {} },
        async (sse, dispose) => {
          const sub = driveableSubscribe()
          let textCount = 0
          let heartbeatCount = 0
          const sseWithHandler = await import("./useSSE").then((m) =>
            createRoot((d) => {
              const h = m.useSSE({
                info: () => ({ url: "http://x", version: 1 }),
                handlers: {
                  onMessageText: () => {
                    textCount++
                  },
                  onHeartbeat: () => {
                    heartbeatCount++
                  },
                },
              })
              return { h, d }
            }),
          )

          await sseWithHandler.h.reconnect()
          await waitForStatus(sseWithHandler.h, "connected")

          // Push first chunk of part-1
          sub.push(evMessagePartText("part-1", "msg-1", "sess-1", "Hello"))
          await tick(5)
          expect(textCount).toBe(1)
          expect(heartbeatCount).toBe(1)

          // Push second streaming chunk of same part-1
          sub.push(evMessagePartText("part-1", "msg-1", "sess-1", "Hello world"))
          await tick(5)
          // onMessageText is deduped by seenPartIds
          expect(textCount).toBe(1)
          // onHeartbeat is NOT blocked by seenPartIds — receives both streaming chunks
          expect(heartbeatCount).toBe(2)

          sseWithHandler.d()
          dispose()
        },
      ))
  })
})
