# PLAN.md — Endurecimiento de resiliencia de OCLoop

> Objetivo: que el loop de OCLoop sobreviva sin intervención humana a (1) rate
> limits del proveedor, (2) bloqueo de pantalla / suspensión del Mac, (3)
> cuelgues del servidor OpenCode, y (4) cualquier estado de bloqueo total,
> mediante un **guardián de tarea** que detecte el problema **sin equivocarse**
> (cero falsos positivos: nunca aborta una sesión que de verdad está
> trabajando, y nunca deja colgado un loop que de verdad está muerto).
>
> Este archivo está escrito en el formato de tareas de OCLoop (`- [ ]`) para
> poder ejecutarlo con el propio loop. Marca cada tarea como `- [x]` al
> terminarla. Las tareas `- [MANUAL]` requieren intervención humana (p. ej.
> probar con un Mac real suspendiéndose).

---

## Contexto de arquitectura (leer antes de empezar)

OCLoop es una TUI (Bun + SolidJS) que orquesta un servidor OpenCode embebido y
ejecuta iteraciones leyendo tareas de un `PLAN.md`. Piezas clave:

- `src/hooks/useServer.ts` — arranca/cierra el servidor OpenCode (`createOpencodeServer`). **No** monitorea salud tras el arranque.
- `src/hooks/useSSE.ts` — stream de eventos (`/event`). Ya tiene reconexión con backoff exponencial (1s→30s). Es el **latido** del sistema.
- `src/lib/api.ts` — wrappers del SDK (`createSession`, `sendPromptAsync`, `abortSession`, `getSessionStatus`). **Ninguno tiene timeout.**
- `src/hooks/useLoopState.ts` — máquina de estados (`starting→ready→running⇄pausing/paused→complete/error`).
- `src/App.tsx` — orquestación: `startIteration()` (líneas ~363), efecto de `session_idle` que dispara la siguiente iteración (líneas ~694), `handleQuit()`.

**Problema central:** el loop es 100% dirigido por eventos. Si el evento
`session.idle` nunca llega (SSE muerto, servidor colgado, Mac suspendido,
sesión wedged), el loop se queda esperando **para siempre y en silencio**. No
hay timeout, ni health check, ni watchdog. Eso es lo que este plan resuelve.

---

## Fase 0 — Cimientos: reloj monótono, timeouts y telemetría

- [x] Crear `src/lib/clock.ts` con un reloj monótono basado en `performance.now()` (o `Bun.nanoseconds()`), expuesto como `monotonicNow(): number`. Toda la lógica de watchdog/timeout debe usar este reloj, **no** `Date.now()`, para que un salto de reloj de pared (NTP, suspensión) no falsee los intervalos. Guardar también `wallClockNow()` por separado para detección de sleep (ver Fase 2).
- [x] Crear `src/lib/with-timeout.ts`: helper `withTimeout<T>(promise, ms, label): Promise<T>` que use `AbortController` + `Promise.race` y lance un `TimeoutError` (con `name: "TimeoutError"` y `label`) al expirar. Debe limpiar el timer en ambos caminos.
- [x] Envolver **todas** las llamadas del SDK en `src/lib/api.ts` (`createSession`, `sendPromptAsync`, `abortSession`, `getSessionStatus`) con `withTimeout` y pasar el `signal` del `AbortController` al SDK donde lo acepte. Timeouts por defecto: create/abort/status = 15s, promptAsync = 30s. Hacerlos configurables vía `src/lib/config.ts`.
- [x] Añadir a `src/lib/debug-logger.ts` un nivel de evento `health` y un logger estructurado `log.health(component, state, metrics)` que registre transiciones del watchdog (heartbeat, sospecha, confirmación, recuperación) en JSON, para poder auditar después por qué actuó el guardián.
- [x] Definir en `src/lib/config.ts` un bloque `resilience` con todos los umbrales (timeouts, T1/T2 del watchdog, máximos de reintento, jitter) y valores por defecto sensatos. Permitir override por flags CLI en `src/index.tsx` y por `~/.config/ocloop/ocloop.json`.

## Fase 1 — Resistencia a rate limits

- [x] En `src/hooks/useSSE.ts`, en el manejo de `session.error` (líneas ~241-275), clasificar el error: añadir a `SessionError` un campo `kind: "rate_limit" | "aborted" | "auth" | "transient" | "fatal"`. Detectar rate limit por `name`/`message` (p. ej. `429`, `rate limit`, `overloaded`, `RateLimitError`, `quota`) y extraer `retryAfter` (segundos) si viene en el error.
- [x] Crear `src/lib/backoff.ts`: función `computeBackoff(attempt, { base, max, jitter })` con backoff exponencial **+ jitter completo** (`random()` no está disponible en scripts del workflow, pero en runtime sí; usar `Math.random()` en el código de la app). Respetar `retryAfter` del servidor cuando exista (tiene prioridad sobre el cálculo).
- [x] En `src/App.tsx`, cuando una iteración falle con `kind === "rate_limit"`, **no** ir a estado `error` terminal. En su lugar: registrar la espera, mostrar en el dashboard un contador "Rate limited — reintentando en Ns", esperar el backoff/`retryAfter`, y reintentar la **misma** iteración (re-crear sesión y reenviar el prompt) sin avanzar el contador de progreso del plan.
- [x] Añadir un estado nuevo a la máquina (`src/hooks/useLoopState.ts` + `src/types.ts`): `cooldown` (`{ reason, resumeAt, attempt }`) distinto de `error`, alcanzable desde `running`, y que vuelve a `running` al expirar. Esto evita confundir "esperando por rate limit" (sano) con "fallo" (recuperación manual).
- [x] Implementar un **token bucket / espaciado mínimo entre iteraciones** configurable (`resilience.minIterationGapMs`, default 0) para no martillar al proveedor cuando las iteraciones son muy cortas; respetar siempre cualquier `retryAfter` reciente como suelo dinámico.
- [x] Añadir un tope de reintentos por rate limit consecutivos (`resilience.maxRateLimitRetries`, default p. ej. 8). Al superarlo, sí transicionar a `error` recuperable con mensaje claro ("Rate limit persistente tras N intentos").
- [x] Tests: `src/lib/backoff.test.ts` (monotonía, tope, jitter dentro de rango, prioridad de `retryAfter`) y `src/hooks/useSSE.test.ts` (clasificación de errores 429/overloaded/quota → `rate_limit`).

## Fase 2 — Sobrevivir a bloqueo de pantalla / suspensión del Mac

- [x] Crear `src/lib/sleep-detector.ts`: un detector de suspensión por **deriva de reloj de pared**. Un timer que debería dispararse cada `tickMs` (p. ej. 5s) compara el `wallClockNow()` real contra el esperado; si el salto supera `tickMs + tolerancia` (p. ej. >30s) se asume que el sistema estuvo suspendido/congelado y se emite un evento `onWake(gapMs)`.
- [x] Conectar `onWake` en `src/App.tsx`: al despertar, (1) forzar `sse.reconnect()` (la conexión casi siempre murió durante el sueño), (2) lanzar una **reconciliación de sesión** (Fase 3: consultar `getSessionStatus` para ver si la sesión activa terminó mientras dormíamos y perdimos el `session.idle`), y (3) registrar el evento en el log de salud.
- [x] (Opcional, recomendado) Añadir prevención de suspensión mientras el loop corre: lanzar `caffeinate -dimsu -w <pid>` vía `Bun.spawn` (detached, atado al PID del proceso) al entrar en `running` y matarlo al pausar/terminar. Exponer flag `--no-caffeinate` para desactivarlo. Implementarlo en `src/lib/power.ts`. Documentar que solo aplica a macOS.
- [x] Asegurar que **todos** los timers del watchdog y backoff usan el reloj monótono (Fase 0) y re-evalúan su estado inmediatamente tras un `onWake`, en lugar de esperar el siguiente tick natural.
- [ ] - [MANUAL] Validación real: arrancar el loop, bloquear la pantalla / cerrar la tapa del Mac varios minutos, reabrir y confirmar que el loop reconecta SSE, reconcilia la sesión y continúa sin quedar colgado ni duplicar iteraciones.

## Fase 3 — Resistencia a cuelgues del servidor / sesión OpenCode

- [x] Añadir un **health check activo del servidor** en `src/hooks/useServer.ts`: método `ping()` que haga una petición ligera (p. ej. `config.get()` o `app.agents()`) con `withTimeout(5s)`. Exponer `lastHealthyAt` y `status` reactivo que pueda pasar a `"unhealthy"`.
- [x] Implementar **reinicio del servidor** en `useServer.ts`: `restart()` que cierre el servidor actual (`serverRef.close()`) y vuelva a `startServer()`, preservando el puerto si es posible. Tras reiniciar, `App.tsx` debe reconectar SSE y reconciliar la sesión en curso.
- [x] Crear helper `reconcileSession(client, sessionId)` en `src/lib/api.ts`: consulta `getSessionStatus`; devuelve `"working" | "idle" | "missing" | "unknown"`. Es la **fuente de verdad** que el watchdog usa para no equivocarse (ver Fase 4). Maneja el caso de que la propia llamada haga timeout → devuelve `"unknown"` (señal de servidor colgado).
- [x] En `src/App.tsx`, cuando `reconcileSession` devuelva `"idle"` o `"missing"` para la sesión activa pero el loop siga en `running` con `sessionId` no vacío, **sintetizar** un `session_idle` para esa sesión y avanzar el loop (recupera eventos `session.idle` perdidos durante sueño/desconexión SSE).
- [x] Manejar fin anómalo del stream SSE: hoy `useSSE.ts` (línea ~433) trata "stream ended normally" como desconexión y reprograma reconexión — verificar que esto siempre dispara `scheduleReconnect()` y que tras varias reconexiones fallidas se notifica al watchdog (no fallar en silencio).
- [x] Tests: `reconcileSession` con respuestas working/idle/missing/timeout; `restart()` del servidor deja el estado consistente. _(reconcileSession cubierto en `api.test.ts`; `restart()` se cubre end-to-end en el test de integración de caos de la Fase 6.)_

## Fase 4 — Guardián de tarea (watchdog) que detecta el bloqueo SIN equivocarse

> Principio de diseño anti-falsos-positivos: el watchdog **nunca** declara
> "bloqueado" solo por un temporizador. Una sospecha por inactividad siempre
> se **confirma contra la verdad del terreno** (probe activo al servidor y al
> estado de la sesión) antes de tomar cualquier acción destructiva. Y nunca
> aborta mientras haya latido reciente (señal de que el modelo trabaja).

- [x] Crear `src/hooks/useWatchdog.ts`. Mantiene `lastHeartbeatAt` (reloj monótono) que se actualiza ante **cualquier** señal de progreso real de la sesión activa: eventos SSE `message.part.updated`, `tool` (use/finish), `reasoning`, `step-finish`, `file.edited`, `todo.updated`. Cablear estas actualizaciones desde los handlers de `useSSE.ts` vía un callback `onHeartbeat`.
- [x] Definir la máquina de salud del watchdog con estados explícitos: `HEALTHY → SUSPECT → CONFIRMING → STUCK → RECOVERING → (HEALTHY)`. Solo activo cuando el loop está en `running`/`pausing` con `sessionId` no vacío (en `ready`/`paused`/`idle`/`cooldown` la quietud es **esperada** y no debe disparar nada).
- [x] Umbrales configurables (Fase 0): `T1` = sin latido para sospechar (default 90s), `T2` = sin latido para confirmar bloqueo aún con sesión "working" (default 5 min). Tick del watchdog cada ~15s usando reloj monótono.
- [x] Lógica del tick:
  1. `dt = monotonicNow() - lastHeartbeatAt`. Si `dt < T1` → `HEALTHY`, salir.
  2. Si `dt ≥ T1` → `CONFIRMING`. Ejecutar probes activos (no destructivos):
     - `server.ping()`. Si falla/timeout → servidor colgado → `RECOVERING` con acción **reiniciar servidor** (Fase 3) + reconectar SSE + reconciliar sesión.
     - Si servidor responde: `reconcileSession(sessionId)`.
       - `"idle"`/`"missing"` → perdimos el `session.idle` → sintetizarlo y avanzar (NO es un bloqueo, es desincronización; volver a `HEALTHY`).
       - `"working"` y `dt ≥ T2` → sesión genuinamente wedged → `RECOVERING` con acción **abortar sesión y reintentar la iteración**.
       - `"working"` y `dt < T2` → el modelo probablemente trabaja en algo largo sin emitir partes (raro pero posible) → mantener `SUSPECT`, re-probar al próximo tick; **no** abortar todavía.
       - `"unknown"` (probe con timeout) → tratar como servidor colgado.
- [x] Escalera de recuperación con contadores y **circuit breaker**: registrar intentos por iteración. Orden de escalada ante bloqueo confirmado: (1) reconectar SSE, (2) sintetizar idle si aplica, (3) abortar+reintentar sesión, (4) reiniciar servidor, (5) tras `resilience.maxRecoveryAttempts` (default 3) sin éxito → transicionar a `error` recuperable con diagnóstico completo (qué probes fallaron, último latido, estado de sesión) para no entrar en bucle de recuperación infinito.
- [x] Resetear el contador de recuperación y el estado del watchdog a `HEALTHY` en cuanto llegue un `session_idle` legítimo o un nuevo latido tras la acción, para que un incidente puntual no penalice iteraciones futuras.
- [x] Reflejar el estado del watchdog en la UI: en `src/components/Dashboard.tsx` mostrar un indicador de salud (p. ej. ● verde HEALTHY / ● amarillo SUSPECT-CONFIRMING / ● rojo RECOVERING) y, en `ActivityLog`, una línea cuando el guardián actúe ("Guardián: sin latido 95s, sesión working confirmada, esperando…" / "Guardián: servidor sin respuesta, reiniciando").
- [x] Tests exhaustivos en `src/hooks/useWatchdog.test.ts` cubriendo los cuatro cuadrantes que evitan falsos positivos/negativos:
  - **Trabajo largo legítimo** (latido cada 60s, T1=90s) → nunca declara STUCK.
  - **SSE muerto pero sesión idle** (sin latido, reconcile=idle) → sintetiza idle, NO aborta.
  - **Sesión wedged** (sin latido, reconcile=working, dt≥T2) → aborta+reintenta exactamente una vez.
  - **Servidor colgado** (ping timeout) → reinicia servidor; tras 3 fallos → error con diagnóstico.

## Fase 5 — Persistencia y reanudación tras caída total

- [x] Persistir estado mínimo de progreso del loop en `.loop-state.json` (junto a `.loop.log`): iteración actual, `sessionId` activo, timestamps, contadores de reintento. Escribir de forma atómica (write a tmp + rename) en cada transición relevante.
- [x] Añadir reanudación al arrancar: si existe `.loop-state.json` con una sesión activa, ofrecer (o, con `--resume`, hacer automáticamente) reconciliar esa sesión vía `reconcileSession` en lugar de empezar de cero — cubre el caso de que el proceso OCLoop muera (no solo OpenCode).
- [x] Asegurar que `.loop-state.json` está en `.gitignore` (extender `src/lib/project.ts` que ya gestiona `.loop*`). _(Ya cubierto: `ensureGitignore` escribe el patrón `.loop*`, que incluye `.loop-state.json` y su `.tmp`.)_
- [x] Mejorar `src/lib/shutdown.ts` para que en SIGINT/SIGTERM persista el estado y aborte la sesión activa con `withTimeout` antes de salir, evitando dejar sesiones huérfanas en el servidor.

## Fase 6 — Verificación integral

- [x] Añadir un modo de **inyección de fallos** (solo en debug, flag `--chaos`) que permita simular: matar el servidor OpenCode, cortar el SSE, devolver 429, y "congelar" una sesión. Implementar en un módulo `src/lib/chaos.ts` activado solo con la flag.
- [x] Escribir un test de integración (Bun test) que, con el modo chaos, verifique de extremo a extremo: rate limit → cooldown → reanuda; SSE caído → reconecta; servidor muerto → reinicia y reconcilia; sesión congelada → guardián aborta y reintenta.
- [ ] - [MANUAL] Ejecución de soak: dejar el loop corriendo varias horas con un PLAN.md real, provocando manualmente suspensión del Mac y desconexiones de red, y confirmar vía `.loop.log` (eventos `health`) que no hubo cuelgues silenciosos ni falsos positivos del guardián.
- [x] Actualizar `README.md` documentando las flags nuevas (`--resume`, `--no-caffeinate`, `--chaos`, overrides de `resilience`) y el comportamiento del guardián de tarea.

---

## Criterios de aceptación (definición de "hecho")

1. **Rate limits:** un 429/overloaded nunca tumba el loop; entra en `cooldown`, respeta `Retry-After`, reintenta la misma iteración y solo falla tras N reintentos, mostrando el contador en la UI.
2. **Suspensión del Mac:** tras bloquear pantalla/cerrar tapa, al despertar el loop reconecta SSE, reconcilia la sesión y continúa sin colgarse ni duplicar trabajo.
3. **Cuelgue de OpenCode:** servidor sin respuesta se detecta por health check activo, se reinicia y se reconcilia la sesión automáticamente.
4. **Guardián sin equivocación:** el watchdog jamás aborta una sesión con latido reciente (cero falsos positivos) y jamás deja un loop muerto sin actuar (cero falsos negativos); toda acción destructiva va precedida de confirmación contra la verdad del terreno (ping + estado de sesión), con circuit breaker y diagnóstico en el log de salud.
