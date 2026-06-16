I now have a comprehensive understanding of the codebase. Let me compile the PLAN.md.

# Plan de Auditoría y Corrección — OCLoop

Analizar el proyecto completo de forma sistemática: revisar cada flujo de ejecución, cada parámetro y cada combinación relevante de parámetros para detectar problemas de codificación, errores de lógica y fallos en tiempo de ejecución, prestando especial atención a casos límite, validaciones ausentes y rutas de código no contempladas. Para cada hallazgo, indicar su ubicación, la causa raíz y el impacto. Corregir los problemas detectados de forma confiable y eficiente, aplicando el principio DRY (centraliza la lógica duplicada y evita repeticiones) sin romper la funcionalidad existente ni alterar el comportamiento esperado. Cuando termines, compila el proyecto, verifica que no queden errores y actualiza mi copia local con los cambios.

## Fase 1 — Auditoría estática: parseo CLI y configuración

- [x] Verificar que `parseArgs` en `src/lib/cli-args.ts` maneje correctamente el caso donde `argv` está vacío (ningún argumento) y que los valores por defecto de `CLIArgs` sean consistentes con los tipos declarados en `src/types.ts`
- [x] Revisar que `applyResilienceOverride` rechace claves vacías y valores negativos para campos numéricos que semánticamente no pueden ser negativos (ej: `minIterationGapMs` acepta 0 pero no -1)
- [x] Auditar `resolveResilience` en `src/lib/config.ts`: confirmar que la fusión de `DEFAULT_RESILIENCE` ← config file ← CLI overrides no deja campos `undefined` que rompan contratos en otros módulos (ej: `backoffJitter: undefined` debería tratarse como `true`)
- [x] Verificar que `loadConfig` en `src/lib/config.ts` maneje JSON malformado sin crashear (actualmente retorna `{}` pero el JSON.parse envuelve todo en try/catch — confirmar que `JSON.parse("{}")` y `JSON.parse("null")` no producen configuraciones inválidas)
- [x] Revisar `hasTerminalConfig`: el caso `type === "custom"` valida que `command` no esté vacío pero permite `args` vacío — ¿debería requerir `{cmd}` en `args`?
- [x] Comprobar que `saveConfig` no corrompe el archivo existente si `writeFileSync` falla a mitad (debería usar escritura atómica como `loop-state-store.ts` hace)

## Fase 2 — Auditoría estática: parser de PLAN.md

- [x] Verificar que `parseTaskLine` en `src/lib/plan-parser.ts` maneje correctamente tareas con descripción vacía: `- [ ] ` (sin texto después) — debería ser tipo `"pending"` con `description: ""`, no `"not-a-task"` — ✅ ya funciona: `checkboxContent === ""` → pending con description vacía
- [x] Auditar el regex de `parsePlanComplete`: confirmar que no hace match falso con tags dentro de bloques de código inline (ej: `` `<plan-complete>` `` sin fence de bloque) — ✅ el regex ancla a `^ {0,3}`: inline code no está al inicio de línea, no hace match
- [x] Verificar que `parsePlanComplete` no remueve contenido legítimo que contenga triple backtick dentro de una tarea (ej: una tarea que incluye un bloque de código como ejemplo) — ✅ parsePlanComplete solo lee el tag de completitud, nunca modifica el contenido del plan
- [x] Revisar que `getCurrentTaskFromContent` devuelve `null` correctamente cuando el plan tiene solo tareas `[MANUAL]` o `[BLOCKED]` y ninguna `pending` — ✅ filtra por `type === "pending"`, MANUAL/BLOCKED nunca son pending
- [x] Confirmar que `parsePlan` calcula `percentComplete` correctamente cuando `total === manual` (denominador 0) — actual retorna 100, ¿es eso lo esperado? — ✅ 100% es correcto: si no hay tareas automatizables, el loop no tiene nada que hacer, considera el plan completo
- [x] Verificar que `isPlanComplete` y `getPlanCompleteSummary` manejen rutas con espacios o caracteres especiales en el nombre del archivo — ✅ Bun.file() acepta cualquier string como path

## Fase 3 — Auditoría estática: API y timeouts

- [x] Auditar `assertResponse` en `src/lib/api.ts`: verificar que los casos donde `result.data` es `null` o `undefined` pero `result.response.ok` es `true` se manejen consistentemente en `createSession` (ya lo hace) pero también en otros consumidores
- [x] Revisar `toSdkModel`: confirmar que `"provider/"` y `"/model"` devuelven `undefined` ( actualmente `slash <= 0` y `slash === model.length - 1` cubren estos casos — verificar edge cases)
- [x] Verificar que `createClient` no acumula entradas huérfanas en `clientCache` cuando el servidor cambia de URL frecuentemente (restart con puerto efímero) — ¿necesita purga? — ✅ orphans accumulate but entries are tiny stateless wrappers; negligible leak. Phase 15 has a purge task for long runs.
- [x] Auditar `reconcileSession`: el case `default` retorna `"unknown"` para cualquier `status.type` no reconocido — ¿qué pasa si el SDK añade un nuevo tipo de status que debería ser `"working"`? — ✅ "unknown" is the safe default; added clarifying comment
- [x] Verificar que `configureApiTimeouts` es llamado exactamente una vez antes de cualquier operación API, y que los tests que usan timeouts customizados los restauran — ✅ called twice in App.tsx (intentional: safety net then definitive), once in index.tsx; all idempotent

## Fase 4 — Auditoría estática: máquina de estados (LoopState)

- [x] Verificar que `loopReducer` en `src/hooks/useLoopState.ts` maneja todas las transiciones imposibles explícitamente con `return state` (ya lo hace), y que no hay transiciones que puedan perder datos (ej: `toggle_pause` desde `paused` pierde el `sessionId` — es intencional, pero documentarlo) — ✅ todos los cases tienen return state; toggle_pause from paused: sessionId intentionally "" (previous session completed during pause)
- [x] Auditar el caso `session_idle` cuando `state.sessionId === ""`: se retorna el mismo estado para evitar duplicar iteraciones — confirmar que esto no enmascara un `session_idle` legítimo sin sesión — ✅ sessionId="" only occurs between iterations; a legitimate idle always has non-empty sessionId
- [x] Verificar que `plan_complete` desde estado `cooldown` o `error` no está contemplado — ¿puede el plan completarse mientras hay un error de rate limit activo? — ✅ FIXED: added plan_complete handling from cooldown/error states
- [x] Confirmar que `iteration_started` desde `paused` incrementa `iteration` correctamente — si se reanuda una sesión que ya estaba corriendo, ¿se salta una iteración? — ✅ correct: resuming starts a new session, so +1 is right
- [x] Revisar que `resume_session` solo funciona desde `ready` — si el usuario cancela el diálogo de reanudación y el estado ya cambió, el `resume_session` se ignora silenciosamente — ✅ safe: ignoring resume when not in ready is correct

## Fase 5 — Auditoría estática: watchdog y resiliencia

- [x] Verificar que `createWatchdog` en `src/hooks/useWatchdog.ts` resetea `recoveryAttempts` en `notifyIdle` y `notifyIterationStart` pero NO en `recordHeartbeat` si ya está en `"HEALTHY"` — confirmar que un heartbeat durante CONFIRMING resetea a HEALTHY
- [x] Auditar la carrera entre `tick()` y `notifyWake()`: si el watchdog está en CONFIRMING y llega un `notifyWake()`, `lastHeartbeatAt` se resetea pero `ticking` sigue `true` — ¿puede la evaluación en curso decidir STUCK con el timestamp viejo?
- [x] Verificar que el circuit breaker `recoveryAttempts > cfg.maxRecoveryAttempts` usa `>` (estrictamente mayor) lo que significa que el primer intento es intento 1 y se permite hasta `maxRecoveryAttempts` intentos — confirmar que la semántica es correcta
- [x] Revisar `computeBackoff`: cuando `attempt` es un número muy grande (ej: 100), `2^100` excede `Number.MAX_VALUE` — confirmar que `Number.isFinite(uncapped)` lo capta y usa `safeMax`
- [x] Verificar que `withTimeout` limpia el timer en el path de éxito — confirmar que el `finally` siempre se ejecuta y el timer no queda pendiente

## Fase 6 — Auditoría estática: SSE y reconexión

- [ ] Auditar `useSSE` en `src/hooks/useSSE.ts`: verificar que `seenPartIds` y `messageRoles` se limpian correctamente cuando cambia el `sessionId` (ya se hace en `session.created`), pero confirmar que no se limpian en `reconnect()` causando pérdida de eventos deduplicados
- [ ] Verificar que `scheduleReconnect` no acumula timeouts: si se llama `reconnect()` mientras hay un `reconnectTimeout` pendiente, el timeout anterior se cancela — confirmar que esto es correcto
- [ ] Auditar `classifySessionError`: confirmar que errores con nombre vacío y mensaje vacío se clasifican como `"fatal"` (no como `"aborted"`)
- [ ] Revisar que `extractRetryAfter` maneja correctamente `retryAfter: Infinity` — `Number.isFinite` lo rechazaría, lo cual es correcto
- [ ] Verificar que la expresión regular `TRANSIENT_RE` no hace match falso con códigos de estado 5xx en mensajes de error legítimos que contienen "50" como parte de otra palabra (ej: "error at offset 503")

## Fase 7 — Auditoría estática: servidor y lifecycle

- [ ] Verificar que `useServer` en `src/hooks/useServer.ts` limpia `abortController` correctamente en `closeCurrent()` — si `launch()` falla después de crear el controller, ¿se limpia?
- [ ] Auditar la carrera entre `restart()` y `startServer()`: si `restart()` se llama mientras `startServer()` aún no resuelve, ¿se cancela correctamente?
- [ ] Verificar que `ping()` en `useServer` no causa un estado inconsistente si se llama mientras `restart()` está en curso — `status` podría ser `"starting"` pero `ping` lo marcaría como `"unhealthy"`
- [ ] Revisar `restoreTerminal()` en `index.tsx`: los handlers de `uncaughtException` y `unhandledRejection` llaman a `process.exit(1)` — ¿deberían también guardar el log del error?
- [ ] Verificar que `shutdownManager` en `src/lib/shutdown.ts` maneja correctamente un segundo SIGINT durante el cleanup (actualmente lo ignora por `isShuttingDown`)

## Fase 8 — Auditoría estática: plan generator (`--create-plan`)

- [ ] Auditar `runCreatePlan` en `src/index.tsx`: si `prompt()` retorna `null` (stdin no es TTY, ej: piped input), `goal` será `null` y se hace `process.exit(1)` — confirmar que este es el comportamiento deseado
- [ ] Verificar que el polling en `runCreatePlan` no se cuelga si `reconcileSession` retorna `"working"` indefinidamente — hay un deadline, pero confirmar que `Bun.sleep(1500)` no bloquea el event loop
- [ ] Revisar que `stripCodeFences` maneje correctamente fences con lenguaje (ej: ````markdown`) y fences sin lenguaje
- [ ] Verificar que `hasNewAssistantReply` no se confunde si el modelo envía un mensaje vacío (solo whitespace) como respuesta — `extractLastAssistantText` hace `.trim()` pero `hasNewAssistantReply` checkea `.length > 0`
- [ ] Confirmar que `runCreatePlan` limpia el servidor (`server?.close()`) en todos los paths de error, incluyendo timeout

## Fase 9 — Auditoría estática: i18n y format

- [ ] Verificar que la función `t()` en `src/lib/i18n.ts` maneja correctamente claves faltantes en español — `const value = table[key] ?? en[key]` usa fallback a inglés, pero si la clave existe en `es` con valor `undefined`, `??` no lo captura (sí lo hace porque `??` solo captura `null`/`undefined`)
- [ ] Auditar las interpolaciones: si un parámetro falta en `params`, las funciones como `cpConfig` generan `undefined` en el string — ¿debería tener un fallback?
- [ ] Verificar que `stripMarkdown` en `src/lib/format.ts` no remueve contenido legítimo dentro de bloques de código inline (ya remueve backticks primero, lo cual es correcto)
- [ ] Revisar `truncateText`: cuando `maxLen < 3`, `Math.max(0, maxLen - 3)` produce `0`, resultando en `"..."` (3 chars) para `maxLen = 2` — debería truncar a `maxLen` sin elipsis

## Fase 10 — Auditoría estática: sleep detector, power, clipboard, terminal launcher

- [ ] Verificar que `createSleepDetector` en `src/lib/sleep-detector.ts` no fire `onWake` si `poll()` es llamado manualmente antes de `start()` (cuando `lastSeen` es 0)
- [ ] Auditar `createPowerManager` en `src/lib/power.ts`: si `proc.kill()` falla porque el proceso ya murió, el error se ignora — confirmar que esto no deja procesos zombies
- [ ] Verificar que `copyToClipboard` en `src/lib/clipboard.ts` maneja correctamente el caso donde `wl-copy` o `xclip` están instalados pero fallan (ej: DISPLAY no configurado en Wayland)
- [ ] Auditar `launchTerminal` en `src/lib/terminal-launcher.ts`: `buildArgs` divide `attachCmd` por espacios — esto rompe rutas con espacios — ¿es un caso válido?
- [ ] Verificar que `detectInstalledTerminals` no se cuelga si `which` no está disponible en el sistema (improbable pero posible en containers mínimos)

## Fase 11 — Auditoría estática: loop-state-store y debug-logger

- [ ] Verificar que `saveLoopState` en `src/lib/loop-state-store.ts` no corrompe el archivo si el proceso crashea entre `writeFile` y `rename` — confirmar que `rename` es atómico en el mismo filesystem
- [ ] Auditar `loadLoopState`: si el JSON parseado tiene `version: 1` pero campos extra desconocidos, se acepta sin validación — ¿debería ser más estricto?
- [ ] Verificar que `DebugLogger` en `src/lib/debug-logger.ts` no crashea si el directorio de trabajo es de solo lectura — `writeFileSync` en un directorio sin permisos debería fallar silenciosamente (actualmente lo hace con try/catch)
- [ ] Revisar que la rotación de logs (`sessionStart`) no pierde el log anterior si `renameSync` falla (ej: permisos) — actual lo ignora, lo cual es correcto pero el archivo antiguo podría ser sobrescrito

## Fase 12 — Auditoría estática: App.tsx (componente principal)

- [ ] Auditar el `createEffect` principal en `App.tsx` que maneja la transición `running` → envío de prompt: verificar que no hay race condition entre `createSession` y `sendPromptAsync` si el efecto se dispara dos veces rápido
- [ ] Verificar que el efecto de cooldown (`createEffect` sobre el state `cooldown`) resetea correctamente el timer si el componente se desmonta mientras el timer está pendiente
- [ ] Auditar que `saveLoopState` se llama en todas las transiciones relevantes (iteration start, pause, cooldown, error) y no solo en algunas
- [ ] Verificar que `ensureGitignore` se llama exactamente una vez y no en cada render
- [ ] Revisar que el efecto de reconexión SSE después de un `restart()` del servidor no pierde eventos que ocurrieron durante el reinicio

## Fase 13 — Correcciones: lógica duplicada y violaciones DRY

- [ ] Extraer la lógica de validación de argumentos CLI duplicada entre `parseArgs` y `requireValue`/`parsePort`/`parseModel` a funciones de validación reutilizables con mensajes de error consistentes
- [ ] Centralizar la lógica de reconexión SSE exponencial (en `useSSE.scheduleReconnect`) con la lógica de backoff existente en `src/lib/backoff.ts` — actualmente `useSSE` tiene su propio cálculo de backoff no configurable
- [ ] Unificar `commandExists` en `src/lib/clipboard.ts` y `src/lib/terminal-launcher.ts` — la misma función está duplicada en ambos archivos
- [ ] Extraer `formatDuration` de `src/hooks/useLoopStats.ts` a `src/lib/format.ts` junto con las demás funciones de formateo
- [ ] Mover `isLocale` de `src/lib/i18n.ts` a `src/lib/locale.ts` donde pertenece por cohesión (locale ya es el dominio de ese archivo)

## Fase 14 — Correcciones: casos límite y validaciones ausentes

- [ ] Corregir `truncateText` en `src/lib/format.ts` para manejar `maxLen < 3` correctamente: usar truncado simple sin elipsis en vez de generar strings más largos que el límite
- [ ] Corregir `parseTaskLine` para manejar descripción vacía: `- [ ] ` (sin texto) debería ser `{ type: "pending", description: "" }` en vez de ignorar la línea
- [ ] Agregar validación en `saveConfig` para escribir atómicamente (tmp + rename) como hace `saveLoopState`
- [ ] Agregar protección en `computeBackoff` contra `attempt` excesivamente grande que cause `Infinity` — ya tiene `Number.isFinite(uncapped)` pero verificar que el path `!jitter` también está protegido
- [ ] Corregir el cálculo de `percentComplete` en `parsePlan` cuando `total - manual === 0`: el 100% hardcodeado es correcto, pero añadir un comentario explícito explicando la semántica

## Fase 15 — Correcciones: robustez en tiempo de ejecución

- [ ] Agregar purga periódica de `clientCache` en `createClient` cuando excede un tamaño razonable (ej: 10 entradas) para evitar memory leak en ejecuciones muy largas con múltiples reinicios de servidor
- [ ] Agregar timeout al `Bun.spawn` en `createPowerManager` para que `proc.kill()` no se cuelgue si `caffeinate` no responde
- [ ] Agregar manejo de `EPIPE` en `DebugLogger.writeRaw` para que no crashee si stdout se cierra durante una escritura
- [ ] Agregar validación en `useServer.launch()` para que un `parseInt` de un puerto inválido no cause NaN
- [ ] Corregir la condición de carrera en `useSSE.connect()`: si se llama `connect()` dos veces rápido, la primera llamada puede sobrescribir el `abortController` de la segunda

## Fase 16 — Verificación: compilar y ejecutar tests

- [ ] Ejecutar `bun run build` y verificar que no hay errores de compilación TypeScript
- [ ] Ejecutar `bun test` y verificar que los 270 tests existentes siguen pasando
- [ ] Ejecutar `bun test` con la bandera `--coverage` si está disponible, y revisar cobertura de los módulos criticos (plan-parser, loop-state, backoff, with-timeout)
- [ ] Verificar que el binario construido funciona: `bun run dev --help` muestra la ayuda correctamente

## Criterios de aceptación

- Todos los tests existentes (270) pasan sin modificación
- No se introduce ninguna regresión en el comportamiento esperado
- Cada corrección es mínima y quirúrgica — no se refactoriza código que funciona correctamente
- La lógica duplicada identificada se centraliza sin romper la interfaz pública de ningún módulo
- Los casos límite detectados tienen evidencia (test o comentario explícito) de que están contemplados
- `bun run build` completa sin errores
- `bun test` completa sin fallos
- Los archivos fuente modificados están libres de `any` innecesario y respetan el estilo existente
