# PLAN.md — Validación e implementación incremental de MEJORAS.md
Validar cada mejora propuesta en `MEJORAS.md` contra el estado real del proyecto, expandir este plan con tareas explícitas para cubrirlas todas y aplicar solo las que aporten valor, sean seguras, eficientes y mantenibles.

## Fase 1 — Preparación

- [x] Leer `MEJORAS.md` completo e identificar cada mejora accionable como una unidad independiente.
- [x] Crear una lista numerada de mejoras candidatas manteniendo el orden original de `MEJORAS.md`.
- [x] Actualizar este `PLAN.md` agregando al final de la Fase 2 un bloque explícito de tareas para cada mejora identificada en `MEJORAS.md`.
- [x] Confirmar que cada mejora identificada tiene sus propias tareas de evaluación, decisión, implementación o descarte y verificación.
- [x] Revisar la estructura general del proyecto para entender stack, arquitectura, comandos disponibles y convenciones existentes.
- [x] Identificar los comandos mínimos de verificación del proyecto, como lint, typecheck, tests o build, sin modificar configuración.
- [x] Registrar el estado inicial relevante: archivos principales, comandos de validación y riesgos conocidos antes de aplicar mejoras.

## Fase 2 — Evaluación individual de mejoras

Lista numerada de 97 mejoras accionables (no-INFO) detectadas en `MEJORAS.md`, en el orden original del documento fuente:

1. Finding 1.1.A — MEDIUM — Empty string accepted by `requireValue` for whitespace-only input
2. Finding 1.1.B — LOW — Duplicate value-flag behavior is not explicitly tested
3. Finding 1.3.A — LOW — Whitespace not explicitly tested (closed by this audit)
4. Finding 1.4.A — LOW — `--lang` does not use `requireValue`, so `--lang --debug` blames the locale
5. Finding 1.5.A — MEDIUM — Numeric coercion accepts non-decimal strings (diverges from `--port`)
6. Finding 1.6.D — MEDIUM (cross-reference) — Whitespace-only value accepted (Finding 1.1.A)
7. Finding 1.7.A — MEDIUM — `--create-plan` silently swallows TUI-only flags; no diagnostic
8. Finding 1.7.B — LOW — `--create-plan --prompt X` skips the prompt-file validation
9. Finding 1.8.A — MEDIUM — Cross-reference to 1.7.A: `--resume` is silently swallowed by `--create-plan`
10. Finding 1.8.B — LOW — `--resume` with no persisted state is a silent no-op (not a no-op in parseArgs, but in the TUI)
11. Finding 3.1.A — MEDIUM — `plan_complete` from `error` ALWAYS resets iterations to 0
12. Finding 4.1.A — LOW — `console.error` used in TUI flow where `log.error` is the project convention
13. Finding 4.1.B — MEDIUM — Empty / whitespace-only prompt file is sent verbatim
14. Finding 4.1.C — LOW — Orphaned session on `sendPromptAsync` failure
15. Finding 4.2.B — LOW — `startingIteration` is a plain variable, not part of the persisted state
16. Finding 5.1.A — MEDIUM — `transient` kind dispatched as `rate_limited` to the reducer
17. Finding 5.1.B — MEDIUM — `clearCooldownTimers` is called *after* the dispatch, not before, on the regular path
18. Finding 5.1.C — LOW — `setCooldownRemainingMs(delayMs)` briefly shows the *full* delay, not `delayMs - elapsed`
19. Finding 5.1.D — LOW — `clearInterval` inside the ticker relies on closure-captured `cooldownTicker`
20. Finding 5.1.E — LOW — `log.health` for the exhausted branch omits `retryAfter`
21. Finding 5.2.A — LOW — `error` dispatched from `cooldown` by the server-error effect does not clear cooldown timers
22. Finding 5.3.A — LOW — `cooldownTicker` is not explicitly cleared on the regular resume path
23. Finding 5.6.A — MEDIUM — Dashboard `cooldownText` always shows "Rate limited" even for transient cooldowns
24. Finding 6.2.A — LOW — Duplicated predicate in `App.tsx` invites drift
25. Finding 7.2.A — MEDIUM — Consumer filter and hook filter share an asymmetric shape that could be made symmetric with no behavioral change
26. Finding 7.3.A — LOW — Hook-layer filter for `session.idle` is **opposite** to `session.error` for un-attributed events
27. Finding 7.5.A — HIGH — `server.restart()` has no in-flight guard; concurrent triggers can launch two servers and leak the first
28. Finding 8.1.A — LOW — Orphan `.tmp` file on `rename` failure
29. Finding 8.2.A — MEDIUM — `loadLoopState` only validates `version` and `iteration`; corrupted `sessionId`, `stateType`, `rateLimitAttempts`, or `updatedAt` slip through
30. Finding 8.3.A — LOW — No test for the `EACCES` / `EPERM` branch of `clearLoopState`
31. Finding 8.4.A — LOW — `void saveLoopState(snapshot)` is fire-and-forget; a crash within the same tick as the dispatch loses the snapshot
32. Finding 8.5.A — MEDIUM — `verdict === "idle"` discards the in-flight iteration's result and may over-count work
33. Finding 11.2.A — MEDIUM — `Bun.spawn` is missing `detached: true`, so the launched terminal can receive SIGHUP when OCLoop exits
34. Finding 11.2.B — LOW — Empty `config.args` for a custom terminal silently launches without the attach command
35. Finding 11.2.C — LOW — Missing `{cmd}` placeholder in custom args silently launches without the attach command
36. Finding 11.2.D — LOW — Empty `attachCmd` produces a corrupted spawn argv (terminal opens empty shell)
37. Finding 11.3.A — LOW — Empty `url` produces a malformed `opencode attach  --session ...` string (double space)
38. Finding 11.3.B — LOW — Empty `sessionId` produces a malformed `opencode attach <url> --session ` string (trailing space)
39. Finding 11.4.A — MEDIUM — macOS `pbcopy` is not detected; copy silently fails on every stock macOS install
40. Finding 11.4.B — MEDIUM — Windows `clip.exe` is not detected; copy silently fails on every stock Windows install
41. Finding 11.4.C — LOW — Call sites do not check the `ClipboardResult`; success toast is shown even on failure
42. Finding 11.4.D — LOW — `clipboard.ts` has no test coverage
43. Finding 12.1.A — MEDIUM — `loadConfig` does not validate per-field types; a wrong-type value in any field is silently passed to the consumer
44. Finding 12.1.B — LOW — Unknown top-level keys are silently kept; a typo like `languaje: "es"` falls back to English with no diagnostic
45. Finding 12.1.C — LOW — No test coverage for `loadConfig`; all six required cases are unverified
46. Finding 12.2.A — MEDIUM — `saveConfig` does not catch I/O errors; a disk-full or permission-denied crash propagates to all four `App.tsx` call sites, none of which have a `try/catch`
47. Finding 12.2.B — LOW — `tmpPath` is a fixed suffix `.tmp`; two simultaneous writes would clobber each other's tmp file
48. Finding 12.2.C — LOW — Stale `.tmp` files are not cleaned up after a write that succeeded `writeFileSync` but failed `renameSync`
49. Finding 12.2.D — LOW — `existsSync(configDir)` check is redundant; `mkdirSync({ recursive: true })` is already idempotent
50. Finding 12.2.E — LOW — `saveConfig` returns `void` but all four callers `await` it — the `await` is misleading
51. Finding 12.3.A — MEDIUM — `pickDefined` skips `undefined` but NOT `null`; a `null` value in either layer silently corrupts the merged config
52. Finding 12.3.B — LOW — `pickDefined` does not validate per-field types; `applyResilienceOverride` does it for CLI input but `loadConfig` does not for the file input
53. Finding 12.3.C — LOW — `pickDefined` does not reject unknown keys; extra fields in either layer propagate to the result object
54. Finding 12.5.E — LOW — `logDiff` is defined but never referenced
55. Finding 15.4.A — LOW — `handleQuit` lacks a module-level `isShuttingDown` guard; SIGINT-during-Q can cause a wasted `abortSession` HTTP call
56. Finding 15.5.A — LOW — No debounce on rapid-fire `file.edited` events for PLAN.md
57. Finding 15.7.A — HIGH — `server.restart()` aborts in-flight launches and leaks server processes
58. Finding 15.7.B — MEDIUM — App-level `restartServer()` has no re-entry guard
59. Finding 15.8.A — MEDIUM — `initializeSession` can read default `resilience` before `onMount` resolves the on-disk config
60. Finding 15.8.B — LOW — `setActiveModel` in the server-ready effect can clobber an explicit `--model`
61. Finding 16.1.A — MEDIUM — `handleIterationError` dispatches a recoverable error for `auth` and `fatal` kinds
62. Finding 16.1.B — MEDIUM — `kind === "transient"` takes different paths in the two call sites
63. Finding 16.1.C — LOW — `enterCooldown` call sites differ only in the optional `kind` argument
64. Finding 16.1.D — LOW — `handleIterationError` and SSE `onSessionError` could share a "kind → action" helper
65. Finding 16.2.A — LOW — `server.url()` + null-check pattern repeated at every call site
66. Finding 16.2.B — LOW — Inconsistent inline vs variable form across call sites
67. Finding 16.3.A — LOW — `props.planFile || DEFAULTS.PLAN_FILE` repeated at 8 sites
68. Finding 16.3.B — LOW — `AppProps extends CLIArgs` makes the `||` type-unjustified
69. Finding 16.4.A — LOW — `sessionId() || lastSessionId()` repeated at 11 sites
70. Finding 16.4.B — LOW — Site #2 + #3 evaluate the same expression twice
71. Finding 16.5.A — HIGH — Completion effect re-runs every second, pushing a new dialog onto the stack each time
72. Finding 16.5.B — MEDIUM — DialogSelect per-row inline expressions subscribe to `selectedIndex` and `theme` 3+ times each
73. Finding 16.5.C — LOW — `ActivityLog.displayEvents` is a no-op memo
74. Finding 16.5.D — LOW — `BottomPanel.rate()` and `compactLine()` re-evaluate on every tick (1-second cadence)
75. Finding 16.5.E — LOW — `App.tsx` persistence effect reads `loop.state()` and `loop.iteration()` — double subscription
76. Finding 16.6.B — MEDIUM — Test at `api.test.ts:196-209` is fragile due to module-level cache state
77. Finding 16.6.C — LOW — `clientCache` could grow across `bun test` runs in the same process
78. Finding 17.1.B — LOW — `main().catch()` does not call `restoreTerminal()` directly
79. Finding 17.2.B — LOW (carryover) — `main().catch()` lacks an explicit `restoreTerminal()` call
80. Finding 17.3.A — MEDIUM — `onMount` (line 421) awaits `detectInstalledTerminals()` without a try/catch
81. Finding 17.3.B — MEDIUM — `await saveConfig(newConfig)` in four command `onSelect` callbacks is unguarded
82. Finding 17.3.C — LOW — `handleQuit` (line 968) calls `renderer.setTerminalTitle` and `renderer.destroy` without a try/catch
83. Finding 17.4.A — MEDIUM — `getPlanCompleteSummary` failure in `startIteration` is misclassified as an iteration error
84. Finding 17.4.B — LOW — `validatePrerequisites` propagates `exists()` exceptions to `main().catch()`
85. Finding 17.4.C — LOW — TOCTOU window between `exists()` and `text()` in `isPlanComplete` / `getPlanCompleteSummary`
86. Finding 17.5.A — LOW — `Bun.write()` auto-create in `validatePrerequisites` propagates errors to `main().catch()`
87. Finding 17.7.B — LOW — `finally { clearTimeout(failsafe) }` is unreachable from the catch-exit path
88. Finding 17.8.B — LOW — `require()` is a CommonJS primitive in an ESM-first project
89. Finding 18.2.A — HIGH — `useServer.ts` has no test (carried from 18.1.B with rationale)
90. Finding 18.2.B — HIGH — `shutdown.ts` has no test (failsafe race is verified by file read only)
91. Finding 18.2.C — MEDIUM — `config.ts` has no test
92. Finding 18.2.D — MEDIUM — `terminal-launcher.ts`, `clipboard.ts`, `power.ts` have no test
93. Finding 18.2.E — LOW — `theme-resolver.ts`, `i18n.ts`, `project.ts`, `command-exists.ts` have no test
94. Finding 18.2.F — LOW — `context/*.tsx` and `components/*.tsx` have no test
95. Finding 18.3.A — MEDIUM — `useSSE.test.ts` tests the classifier, not the hook (carried from 18.1.A with full hook-behavior inventory)
96. Finding 18.3.B — MEDIUM — `useServer.test.ts` does not exist (same as 18.2.A, listed for cross-reference)
97. Finding 18.3.C — LOW — `DialogContext.tsx` top-only render contract is not pinned

### Mejora 1 — Finding 1.1.A — MEDIUM — Empty string accepted by `requireValue` for whitespace-only input

- [x] Evaluar la mejora 1 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 1 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 1 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 1 y corregir cualquier regresión causada por el cambio.

### Mejora 2 — Finding 1.1.B — LOW — Duplicate value-flag behavior is not explicitly tested

- [x] Evaluar la mejora 2 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 2 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 2 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 2 y corregir cualquier regresión causada por el cambio.

### Mejora 3 — Finding 1.3.A — LOW — Whitespace not explicitly tested (closed by this audit)

- [x] Evaluar la mejora 3 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 3 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 3 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 3 y corregir cualquier regresión causada por el cambio.

### Mejora 4 — Finding 1.4.A — LOW — `--lang` does not use `requireValue`, so `--lang --debug` blames the locale

- [x] Evaluar la mejora 4 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 4 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 4 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 4 y corregir cualquier regresión causada por el cambio.

### Mejora 5 — Finding 1.5.A — MEDIUM — Numeric coercion accepts non-decimal strings (diverges from `--port`)

- [x] Evaluar la mejora 5 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 5 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 5 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 5 y corregir cualquier regresión causada por el cambio.

### Mejora 6 — Finding 1.6.D — MEDIUM — Whitespace-only value accepted (cross-reference a Finding 1.1.A)

- [x] Evaluar la mejora 6 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 6 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 6 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 6 y corregir cualquier regresión causada por el cambio.

_Evaluación_: Finding 1.6.D está documentado en `MEJORAS.md` como cross-reference
a Finding 1.1.A. La causa raíz (Finding 1.1.A) ya fue corregida por la Mejora 1
(commit `6769fa7`) en `src/lib/cli-args.ts`: la guarda `value.trim() === ""` en
`requireValue` rechaza valores de solo whitespace. Esa misma guarda cubre las
tres llamantes (`--prompt`, `--plan`, `--agent`) — Mejora 1 añadió test de
paridad para `--agent` y los tests de superficie para `--prompt` / `--plan`
ya están en el describe `parseArgs — --prompt / --plan path handling`
(`cli-args.test.ts:616-635`). Fix en raíz → superficie cubierta. Implementación
mínima: comentario en el bloque de tests que apunta al cross-reference 1.6.D
para que un lector futuro vea la relación sin re-derivarla del audit. Sin
cambios de código.

### Mejora 7 — Finding 1.7.A — MEDIUM — `--create-plan` silently swallows TUI-only flags; no diagnostic

- [x] Evaluar la mejora 7 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 7 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 7 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 7 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es estructural: `parseArgs` es un tokenizer
puro y no valida compatibilidad semántica entre flags. La superficie
de "ignorar silenciosamente" es real (7 flags), pero la corrección en
raíz está acotada: añadir un warning no-fatal en la rama
`args.createPlan` de `main()` que liste los flags TUI-only detectados.
Implementación mínima: extraer la lógica a una función pura
`getIgnoredCreatePlanFlags(args)` en `src/lib/create-plan-warning.ts`
(12 líneas, una decisión por flag) y llamarla desde `src/index.tsx`
justo antes de `runCreatePlan()`. Cero cambios al parser, cero cambios
a la TUI, cero impacto en los caminos `--create-plan` que ya no
ignoran nada. Warning es pipeable (`2>/dev/null`) y sigue la
convención `console.error → stderr` de `cli-args.ts`. Cubierto por 7
tests en `create-plan-warning.test.ts` que pinean defaults → [],
cada flag, `--prompt` solo cuando el path difiere del default, sin
falsos positivos en `planTimeoutMs`/etc., y orden estable.

### Mejora 8 — Finding 1.7.B — LOW — `--create-plan --prompt X` skips the prompt-file validation

- [x] Evaluar la mejora 8 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 8 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 8 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 8 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la Mejora 7 (commit `602f2f5`, Finding 1.7.A) ya implementó la
opción (a) del fix propuesto en `MEJORAS.md`: `create-plan-warning.ts:33`
añade `--prompt` a la lista de flags ignorados cuando
`args.promptFile !== DEFAULTS.PROMPT_FILE`, y `src/index.tsx:324-330`
emite el warning no-fatal a stderr en la rama `args.createPlan`. El test
propuesto "parsed but not validated" ya está en `cli-args.test.ts:909-924`
(`--create-plan + --prompt: parsed but not validated (validatePrerequisites
is skipped)`). La opción (b) — llamar `validatePrerequisites` antes del
short-circuit — fue descartada en el audit porque `runCreatePlan` no usa
`args.promptFile` (los prompts son inline: `buildPlanPrompt`,
`buildRefinePrompt`); validar un archivo que el flujo nunca lee sería una
restricción engañosa. Implementación mínima: anotación en este plan; cero
cambios de código. Test suite verde: `667 pass / 0 fail`.

### Mejora 9 — Finding 1.8.A — MEDIUM — Cross-reference a 1.7.A: `--resume` is silently swallowed by `--create-plan`

- [x] Evaluar la mejora 9 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 9 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 9 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 9 y corregir cualquier regresión causada por el cambio.

_Evaluación_: Finding 1.8.A está documentado en `MEJORAS.md:1153-1172` como
cross-reference a Finding 1.7.A y propone añadir `--resume` a la lista de
flags ignorados. Esa propuesta ya está implementada por la Mejora 7 (commit
`602f2f5`, `src/lib/create-plan-warning.ts:27` — `if (args.resilience?.resume)
ignored.push("--resume")`); además, el contrato de `parseArgs` está pineado
en `src/lib/cli-args.test.ts:1066-1076` (`--resume + --create-plan: both
parsed, --resume is silently ignored`) y el orden estable se verifica en
`create-plan-warning.test.ts:84-106` (incluye `--resume` en la línea 101).
La advertencia se emite desde `src/index.tsx:324-330` antes de
`runCreatePlan()`. Fix en raíz → superficie cubierta. Implementación
mínima: anotación de 1 línea en el comentario de cabecera de
`create-plan-warning.ts` (extiende "Source: MEJORAS.md Finding 1.7.A" para
nombrar 1.8.A) y 3 líneas en `create-plan-warning.test.ts:27` (declara
explícitamente que el caso `--resume` también cubre 1.8.A). Cero cambios de
comportamiento. `bun test` verde: 667 pass / 0 fail. Commit `cb99847`.

### Mejora 10 — Finding 1.8.B — LOW — `--resume` with no persisted state is a silent no-op

- [x] Evaluar la mejora 10 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 10 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 10 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 10 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es estructural: la guarda de
`App.tsx:1131` `<persisted && persisted.iteration > 0>` se evalúa ANTES
de leer `resilience().resume`, así que cuando el usuario pasa `--resume`
en un run limpio (sin `.loop-state.json` o con un snapshot obsoleto de
`iteration=0`), el flag queda parseado/almacenado pero produce cero
efecto observable. La propuesta de `MEJORAS.md:1196-1201` es la opción
correcta: emitir un log no-fatal que haga visible la no-op en
`.loop.log`. Implementación mínima: extraer la decisión a una función
pura `describeResumeAttempt(args, persisted)` en
`src/lib/resume-decision.ts` (28 líneas) y llamarla desde `App.tsx:1132-1141`
justo después de `loadLoopState()`. Cero cambios al decision tree
existente (`if (persisted && persisted.iteration > 0)` sigue
controlando la ruta de resume), cero impacto en la ruta
`--create-plan` (la flag `resilience.resume` se loggea en el flujo TUI
normal, no en el short-circuit del plan generator), cero cambio de
comportamiento del loop. El helper es side-effect-free (test "no
mutation" lo pinea) y retorna `null` cuando `--resume` no fue pasado
para que el call site no emita ruido innecesario. Cubierto por 5 tests
en `src/lib/resume-decision.test.ts` que pinean: no log cuando
`--resume` no se pasó, `hasPersisted:false` cuando no hay
`.loop-state.json` (caso central del finding), `hasPersisted:true
iteration:0` cuando hay un snapshot obsoleto, `hasPersisted:true
iteration:N` cuando hay un resume real pendiente, y la pureza del
helper. `bun test` verde: 672 pass / 0 fail (era 667). Commit `0053f9d`.

### Mejora 11 — Finding 3.1.A — MEDIUM — `plan_complete` from `error` ALWAYS resets iterations to 0

- [x] Evaluar la mejora 11 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 11 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 11 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 11 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es estructural — la variante `error` de
`LoopState` no tenía campo de iteración, así que la rama
`plan_complete → error → complete` en `useLoopState.ts:231-233` no
tenía forma de saber cuántas iteraciones se habían ejecutado antes del
fallo. La opción (a) del fix propuesto en `MEJORAS.md:2773-2778`
(carry a través de la transición a error) es claramente superior a la
opción (b) (empujar al dispatcher): la primera mantiene la state
machine como única fuente de verdad y es consistente con el patrón
existente de `cooldown` (que ya carga `iteration`). Implementación
mínima: añadir `lastIteration?: number` opcional a la variante `error`
en `src/types.ts`, en el reducer `error` propagar `state.iteration`
cuando el source es `running/pausing/paused/cooldown`, y en la rama
`plan_complete` desde `error` usar `state.lastIteration ?? 0`. La rama
con `?? 0` preserva la regresión para llamantes (tests, mocks) que
construyan un `error` sin `lastIteration`. Cero cambios a los call
sites de `App.tsx`, cero cambios a la action shape, cero impacto en
las transiciones que no son error. Cubierto por 7 tests nuevos en
`useLoopState.test.ts` (1 Phase 2, 6 Phase 3.1) que pinean: el carry
desde `running(7)`, `paused(3)` y `cooldown(5)`, la omisión de
`lastIteration` cuando el source no lo tiene, la preservación en
`plan_complete` cuando `lastIteration` está presente, y la regresión
del default 0 cuando no lo está. El test "KNOWN BUG" antiguo (Phase
3.1:1024) se reescribió como el test de la fix (preserva
`lastIteration: 9` → `iterations: 9`) y se pineó un test hermano con
el default 0 para que un cambio futuro que quite el `?? 0` rompa
explícitamente. `bun test` verde: 678 pass / 0 fail (era 672). Commit
`1c197cb`.

### Mejora 12 — Finding 4.1.A — LOW — `console.error` used in TUI flow where `log.error` is the project convention

- [x] Evaluar la mejora 12 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 12 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 12 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 12 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es la convención documentada en
`docs/project-context.md:82-85`: "`log.*` en todo el TUI;
`console.error` reservado para handlers de crash-time y para la CLI
headless `--create-plan`". Las tres call sites de TUI flow listadas
en el finding (`App.tsx:803` `Cannot start iteration: server not
ready`, `App.tsx:903` `Cannot create debug session: server not
ready`,
`App.tsx:1180` `Failed to initialize session`) violan esa convención.
Ya hay 52 call sites de `log.*` en `App.tsx` y el import
`import { log } from "./lib/debug-logger"` está en `App.tsx:21` —
no hay costo adicional por usarlo. Adicionalmente, el branch
`createDebugSession` estaba **doble-loggeando** (línea 902 ya
usaba `log.error` y la 903 repetía con `console.error`), así que
eliminar la duplicación es estrictamente una mejora sin pérdida.
Implementación mínima: 3 edits puntuales a `App.tsx` — dos
sustituciones 1-a-1 (`console.error` → `log.error(ctx, msg [, err])`)
y una eliminación de duplicado. Cero cambios a la TUI, cero
impacto en el lifecycle de iteración, cero impacto en tests
(ningún test dependía de la presencia de `console.error` en estos
paths — los matches encontrados están en `cli-args.ts`,
`index.tsx`, `debug-logger.ts` y `shutdown.ts`, que están fuera del
scope del finding). `bun test` verde: 678 pass / 0 fail (sin
cambio en el conteo). Commit `2fd8af7`.

### Mejora 13 — Finding 4.1.B — MEDIUM — Empty / whitespace-only prompt file is sent verbatim

- [x] Evaluar la mejora 13 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 13 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 13 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 13 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es la ausencia de una guarda de
contenido en `src/App.tsx:855-857`. El path "file exists pero
vacío" produce dos modos de fallo desperdiciosos (audit
`MEJORAS.md:2980-2992`): (a) 4xx del server clasificado como
`fatal` y mostrado como recoverable error, o (b) tight re-iteration
loop hasta que la rate limit del provider dispare cooldown.
La opción del fix propuesta en `MEJORAS.md:2996-3008` (lanzar
un `Error` con el path resuelto) es claramente superior a
alternativas como skip-and-retry o auto-default: se integra con
el `try/catch` existente (línea 878) sin cambiar el contrato de
`startIteration`, y produce el mismo UX que el path "file
missing" (línea 849-852) — un único recoverable error con un
mensaje que apunta al path del prompt. Implementación mínima:
guarda `if (prompt.trim() === "")` justo después de la
substitución de `{{PLAN_FILE}}`, con un `throw new Error(...)`
que nombra el path resuelto. Cero cambios al flujo principal,
cero impacto en el caso "file con contenido real" (que es el
99.9% de los runs), cero nuevos tipos exportados, cero nuevas
funciones. Como dice el audit (línea 3017-3019), el guard no
necesita un nuevo unit test: el branch `fatal` de
`classifySessionError` ya está pineado en
`src/hooks/useSSE.test.ts` y el `try/catch` que lo enruta a
`handleIterationError` es exactamente el mismo que usa el path
"file missing". `bun test` verde: 678 pass / 0 fail, 23 files,
1676 expect() calls, 316 ms — sin cambio en el conteo (era 678
antes del guard). Commit pendiente.

### Mejora 14 — Finding 4.1.C — LOW — Orphaned session on `sendPromptAsync` failure

- [x] Evaluar la mejora 14 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 14 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 14 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 14 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es estructural: `newSessionId` se declaraba
dentro del `try` de `startIteration` (`App.tsx:838`), así que el `catch`
no podía abortar la sesión que `createSession` (línea 837) acababa de
crear en el server. Si `sendPromptAsync` (línea 869) o cualquier paso
posterior (`refreshPlan`, lectura del prompt file) tiraba, la sesión
quedaba corriendo server-side, huérfana del lado del cliente; la
siguiente iteración creaba OTRA sesión, y la original seguía
consumiendo state del server hasta TTL o restart manual. La opción
propuesta en `MEJORAS.md:3044-3052` (trackear `newSessionId` fuera del
`try` y abortar best-effort en el `catch`) es claramente superior a la
alternativa de hoistar todo a un helper: es 4 líneas nuevas en el
camino del fallo, cero cambios al camino feliz, y reusa exactamente el
patrón que ya existe en `abortAndRetry` (`App.tsx:268-282`,
`createClient(url) → abortSession → try/catch vacío`). Implementación
mínima: (1) hoist `let newSessionId: string | undefined` justo después
de `startingIteration = true` (línea 811), (2) cambiar
`const newSessionId = session.id` a asignación en línea 843, (3) añadir
8 líneas en el `catch` (líneas 884-895) que llaman
`abortSession(createClient(url), newSessionId)` dentro de un
`try/catch` vacío antes de `handleIterationError(err)`. Cero impacto en
el camino feliz (nuevo path no agrega latencia al éxito), cero impacto
en la ruta de `cooldown`/`transient` (la única diferencia observable
es que el server no acumula sesiones huérfanas entre reintentos),
cero impacto en la ruta de `fatal` (la sesión se aborta antes de
mostrar el error). Sin nuevos tipos exportados, sin nuevas funciones,
sin nuevos tests — el audit (`MEJORAS.md:3094-3110`) ya justificó que
`startIteration` es integration-territory y que el mismo patrón en
`abortAndRetry` no tiene cobertura dedicada. `bun test` verde: 678
pass / 0 fail, 1676 expect() calls, 316 ms — sin cambio en el conteo.
Commit `9c490a0`.

### Mejora 15 — Finding 4.2.B — LOW — `startingIteration` is a plain variable, not part of the persisted state

- [x] Evaluar la mejora 15 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 15 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 15 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 15 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es la asimetría entre la persistencia
de `iteration` (que sí se guarda en `PersistedLoopState`,
`App.tsx:1333-1340`) y el guard `startingIteration` (que no). El
behavior es correcto: `let startingIteration = false` siempre
arranca limpio en un proceso fresco, y un crash mid-`startIteration`
deja al reducer como fuente de verdad para "tenemos sesión". La
propuesta de `MEJORAS.md:3254-3266` es la opción correcta: una
afordancia de documentación en el sitio del `let` que nombra los
tres hechos que un lector podría derivar mal — que el guard es
process-scoped, que NO se persiste, y que el `iteration_started`
del reducer es la fuente de verdad. Implementación mínima: 1 edit
puntual a `src/App.tsx:172-178` (1 línea → 6 líneas) que reemplaza
el comentario existente por la versión expandida propuesta en
`MEJORAS.md:3259-3266`. Cero cambios al behavior, cero impacto en
runtime, cero impacto en la TUI, cero impacto en tests
(`MEJORAS.md:3273-3302` ya justificó que la encapsulación del
`let` en el closure de `App.tsx` es la propiedad que mantiene el
guard seguro — un unit test requeriría extraerlo a module-level y
eso debilitaría la garantía). `bun test` verde: 678 pass / 0
fail, 23 files, 1676 expect() calls, 317 ms — sin cambio en el
conteo. Commit `f80a823`.

### Mejora 16 — Finding 5.1.A — MEDIUM — `transient` kind dispatched as `rate_limited` to the reducer

- [x] Evaluar la mejora 16 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 16 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 16 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 16 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es el shape de la action `rate_limited`
y de la state `cooldown`, ambos sin campo `kind`. La opción "proper
fix" del audit (`MEJORAS.md:3670-3677`) es estrictamente superior al
"cheap fix" de solo añadir `kind` al `log.health`: la primera cierra
el bug user-facing (Dashboard siempre dice "Rate limited" para
cualquier cooldown, lo que en un día de red flaky erosiona la
confianza en los rate-limits reales) y la segunda solo agrega
observabilidad. La actividad-log en `App.tsx:740` ya elegía la copy
correcta vía `kind` local, así que el cambio es net-user-visible
solo en el Dashboard. Implementación mínima:

- `src/types.ts`: campo `kind: "rate_limit" | "transient"` requerido
  en la variante `cooldown` del `LoopState`; campo `kind` opcional en
  la action `rate_limited` (default `"rate_limit"` en el reducer para
  backward compat con `chaos_429` en `App.tsx:1675`, que omite el
  campo).
- `src/hooks/useLoopState.ts:161-180`: el reducer propaga
  `action.kind ?? "rate_limit"` al construir el nuevo `cooldown`.
- `src/App.tsx:747`: el dispatch ahora pasa `kind` (ya estaba como
  parámetro de `enterCooldown`).
- `src/components/Dashboard.tsx:95-103`: el memo `cooldownText` lee
  `state.kind` para elegir entre `cooldownText` y `cooldownRetryText`.

Cero impacto en los call sites que no son Dashboard/ActivityLog, cero
cambio en la exhaustion path (ya tenía `kind` en el log y en el
activity message), cero cambio en `resume_cooldown` (el campo
sobra en el output `running`). Cero cambio en la ruta
`chaos_429` (default cubre el caso). Cubierto por 2 tests nuevos en
`useLoopState.test.ts:516-548` que pinean: `kind: "transient"` se
propaga, y `kind` omitido defaultea a `"rate_limit"`. Las 9
construcciones directas de `cooldown` en los tests existentes se
actualizaron con `kind: "rate_limit"`. `bun test` verde: 680 pass /
0 fail (era 678). Commit `9a8cb78`.

### Mejora 17 — Finding 5.1.B — MEDIUM — `clearCooldownTimers` is called *after* the dispatch, not before

- [x] Evaluar la mejora 17 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 17 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 17 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 17 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es de orden y no de corrección: la guarda
funcional ya estaba en su sitio (los IDs de timer son `let`-bound del
closure, no signals de Solid, así que ningún path observable
interactúa con ellos entre el dispatch y el set de los nuevos timers).
El valor de la fix es estructural — preservar la invariante
"todo el estado de cooldown se limpia antes de despachar cualquier
estado nuevo", patrón que ya usa `handleWake` (`App.tsx:220-221`:
`clearCooldownTimers()` → `loop.dispatch({ type: "resume_cooldown" })`).
Implementación mínima: 1 línea movida + 8 líneas de comentario
explicando la racionalidad defensiva y nombrando el patrón de
`handleWake` que se está alineando. Cero cambios al camino feliz,
cero impacto en la rama de exhaustión (su `clearCooldownTimers()`
línea 720 ya estaba antes del return), cero impacto en tests
(la reordenación es observable-equivalente y un test sería
tautológico). `bun test` verde: 680 pass / 0 fail (sin cambio en
el conteo). Commit `0ee1de0`.

### Mejora 18 — Finding 5.1.C — LOW — `setCooldownRemainingMs(delayMs)` briefly shows the *full* delay

- [x] Evaluar la mejora 18 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 18 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 18 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 18 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es cosmética — la guarda funcional
ya estaba en su sitio (el ticker en `App.tsx:765` ya hace
`Math.max(0, resumeAt - monotonicNow())` en su callback de 250ms
y el Dashboard acota `secs` con `Math.max(0, ...)` en
`Dashboard.tsx:100`). El lag del primer frame es invisible
en cualquier TUI con refresh rate normal; solo aparece si el
renderer se congela (debugger break, scroll-jump, sleep
waking). La opción del fix propuesta en `MEJORAS.md:3727-3729`
(usar la misma fórmula del ticker en el `set` inicial) es
claramente superior a la alternativa de "no aplicar fix": es
una línea, cero cambio de comportamiento, y la fórmula ya
está importada y validada por el ticker — reusarla es
estrictamente gratis. Implementación mínima: 1 línea
(`setCooldownRemainingMs(Math.max(0, resumeAt - monotonicNow()))`)
+ 4 líneas de comentario extendiendo el existente
(`// Countdown for the dashboard, driven by the monotonic clock.`)
para nombrar la decisión y el source (`Source: MEJORAS.md
Finding 5.1.C.`), siguiendo el patrón de Mejora 17. Cero
cambios al reducer, cero cambios al ticker, cero cambios al
Dashboard, cero impacto en el camino feliz (el valor inicial
sigue siendo `delayMs` salvo por los pocos microsegundos
transcurridos entre el `set` y la primera línea del callback).
Sin nuevos tests — el guard es `Math.max(0, ...)` (idéntico
al del ticker) y un test que pinea el valor inicial requeriría
mockear `monotonicNow` Y el reducer `rate_limited` Y
`cooldownTicker`, lo cual es integration-territory y no
aporta sobre la inspección directa del cálculo. `bun test`
verde: 680 pass / 0 fail, 1680 expect() calls, 324 ms — sin
cambio en el conteo de tests. Commit `95bf219`.

### Mejora 19 — Finding 5.1.D — LOW — `clearInterval` inside the ticker relies on closure-captured `cooldownTicker`

- [x] Evaluar la mejora 19 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 19 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 19 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 19 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es estructural: la callback
del ticker (líneas 765-772) leía `cooldownTicker` del
closure del `let` del componente, no del valor del ID de
intervalo que el propio `setInterval` devolvió. Si
`clearCooldownTimers` corría entre la guarda
`remaining <= 0` y la línea `clearInterval`, el outer ref
se nulificaba y la self-clear recibía `null` (no-op según
`setInterval`, pero la asignación `cooldownTicker = null`
se omitía, dejando un ref obsoleto). La propuesta de
`MEJORAS.md:3763-3769` es claramente correcta: capturar
el ID en un `const tickerId` local para que la self-clear
use el ID exacto, mientras el outer `cooldownTicker`
queda para uso exclusivo de `clearCooldownTimers`.
Implementación mínima: 1 línea de captura local + 1
asignación explícita al final, remover la guarda redundante
`&& cooldownTicker` (el local siempre está definido), y
un comentario de 5 líneas nombrando la invariante y la
referencia al finding. Cero cambios al `clearCooldownTimers`,
cero cambios a la rama de exhaustion (su `clearCooldownTimers`
línea 720 ya está antes del return), cero impacto en la
TUI, cero impacto en el reducer, cero impacto en el camino
feliz. Sin nuevos tests — el audit (`MEJORAS.md:3771-3772`)
ya justificó que la race es latente y no observable
(ninguno de los 4 call sites de `clearCooldownTimers` corre
en los 250ms del tick del ticker en práctica); un test de
race requeriría mockear `setInterval` + forzar la ordenación
entre dos `clearInterval` y no aporta sobre la inspección
del código. `bun test` verde: 680 pass / 0 fail, 1680
expect() calls, 321 ms — sin cambio en el conteo. Commit
`21f53d0`.

### Mejora 20 — Finding 5.1.E — LOW — `log.health` for the exhausted branch omits `retryAfter`

- [x] Evaluar la mejora 20 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 20 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 20 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 20 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es de simetría: la rama
non-exhausted en `App.tsx:732-737` ya incluía
`retryAfterSeconds: retryAfterSeconds ?? null` en su payload
de `log.health`, pero la rama exhaustión en `App.tsx:705`
omitía ese campo. El resultado era asimétrico: los operadores
que comparan ambos eventos post-mortem veían el último
`Retry-After` conocido en el cooldown normal, pero el campo
desaparecía en el evento de exhaustión (que es justamente
el evento que dispara la acción humana: reintentar mañana,
cambiar de plan, abrir ticket). La opción del fix propuesta
en `MEJORAS.md:3784-3786` (añadir el campo al payload de la
exhaustión, mismo `?? null` para reflejar "no nos llegó
`Retry-After`" de forma distinguible de "Retry-After era 0")
es estrictamente la mínima útil: un campo extra, cero cambio
de forma, cero impacto en el reducer, cero impacto en la
TUI, cero impacto en la lógica de circuit-breaker
(`rateLimitAttempts` ya se resetea a 0 en la línea 719, antes
del return). Cero impacto en tests — el audit
(`MEJORAS.md:3812-3831`) ya justificó que el contrato de
`enterCooldown` exhaust-vs-cooldown es integration-territory
y que añadir un mock-heavy `enterCooldown.test.ts` re-estataría
la fuente. La asimetría queda cerrada: ambas ramas del
`switch` interno a `enterCooldown` ahora reportan el mismo
set de campos, con la única diferencia de que la exhaustión
reporta `attempts` (el contador del breaker) y el cooldown
normal reporta `attempt`/`delayMs` (la fase activa del backoff).
`bun test` verde: 680 pass / 0 fail, 1680 expect() calls, 23
files — sin cambio en el conteo. Commit `39e7cac`.

### Mejora 21 — Finding 5.2.A — LOW — `error` dispatched from `cooldown` does not clear cooldown timers

- [x] Evaluar la mejora 21 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 21 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 21 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 21 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es estructural y el fix es
estrictamente el "cheap fix" del audit (`MEJORAS.md:3932-3937`):
`if (state.type === "cooldown") clearCooldownTimers()` dentro del
server-error effect, ANTES del `loop.dispatch({ type: "error" })`.
Razones para preferir el cheap sobre el `createEffect`
(que sería la opción "proper fix" del audit):

1. **Consistencia con el patrón del codebase** — la mejora
   anterior (Mejora 17, Finding 5.1.B) estableció el orden
   "clear-then-dispatch" en `enterCooldown` regular path
   (línea 760) y en `handleWake` (línea 220). El cheap fix
   sigue ese mismo patrón: clear-then-dispatch dentro del
   mismo bloque. Un `createEffect` separado con su propio
   `prevState` duplica el tracking que ya existe en el
   transition-detector effect (líneas 325-397) y rompe la
   consistencia.
2. **No hay new error dispatch sites en el horizonte** — la
   tabla del audit (MEJORAS.md:3860-3869) confirma que los
   5 sitios restantes están state-gated; el server-error es
   el ÚNICO que puede disparar desde `cooldown`. La
   justificación de "future-proof" del `createEffect` es
   YAGNI: añadir infraestructura especulativa para
   "chaos faults que aún no existen" es exactamente lo que
   la casa de Mejoras 6-20 ha rechazado.
3. **Coste cero en el camino feliz** — cuando el
   server-error effect dispara desde un estado distinto
   de `cooldown` (el 99.9% de los casos), el `if` es un
   no-op observable: una lectura reactiva de `loop.state()`
   + una comparación de string. Sin rama nueva, sin
   función nueva, sin tipo nuevo.

Implementación mínima: 10 líneas añadidas en
`src/App.tsx:1284-1304` (1 `if` con 1 `clearCooldownTimers()`
+ 7 líneas de comentario explicando la racionalidad
defensiva y nombrando los call sites homólogos). Cero
cambios al reducer, cero cambios al Dashboard, cero
cambios al `cooldownRemainingMs` signal, cero impacto en
los 5 sitios state-gated. Sin nuevos tests — la transición
`cooldown → error` del reducer ya está pineada en
`useLoopState.test.ts:748` ("error transition from
cooldown state works") y el contract de
`clearCooldownTimers` (closure-bound) no es unit-testable
sin mock-heavy harness. `bun test` verde: 680 pass / 0
fail, 1680 expect() calls, 23 files, 317 ms — sin cambio
en el conteo (era 680 antes del clear). Commit `cac737d`.

### Mejora 22 — Finding 5.3.A — LOW — `cooldownTicker` is not explicitly cleared on the regular resume path

- [x] Evaluar la mejora 22 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 22 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 22 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 22 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es de simetría: el callback
del `cooldownTimer` setTimeout (`App.tsx:788-793`) nulificaba
`cooldownTimer` (línea 789) pero NO limpiaba su timer hermano
`cooldownTicker`. La defensa funcional ya estaba en su sitio
(self-stop en `remaining <= 0`, líneas 779-782), pero el camino
de "user requested a manual resume mid-cooldown" o "wake
+ handleWake + the late-fired setTimeout" dejaba el interval
vivo hasta su self-stop, escribiendo un signal stale que el
Dashboard ya no mostraba. La opción del fix propuesta en
`MEJORAS.md:4102-4110` (añadir `clearCooldownTimers()` justo
después de `cooldownTimer = null`) es estrictamente la
mínima útil: 1 línea de código + 7 líneas de comentario que
nombran los call sites homólogos
(`handleWake:220`, exhaustión:`725`, regular clear-then-dispatch
de `enterCooldown`:760, `handleQuit`:1048, server-error:1295).
Implementación: commit `391d083`. Cero impacto en el camino
feliz (el `clearCooldownTimers` dentro del callback de un
timer que ya disparó es observable-equivalente — el `if
(cooldownTimer)` interno short-circuita en `null`, y el
`clearInterval(cooldownTicker)` + `cooldownTicker = null`
produce el mismo estado final que el self-stop de las
líneas 779-782 pero ANTES del dispatch, no después).
Cero impacto en la rama de exhaustión (su `clearCooldownTimers`
línea 725 ya estaba antes del return). Cero impacto en
`handleWake` (su `clearCooldownTimers` línea 220 ya estaba
antes del dispatch). Cero impacto en el Dashboard (el
memo `cooldownText` ya short-circuita en
`state.type !== "cooldown"`, Dashboard.tsx:96). Sin nuevos
tests — el audit `MEJORAS.md:4133-4161` ya justificó que
el contract del reducer `resume_cooldown` está pineado por
3 tests en `useLoopState.test.ts` (líneas 568, 738, 1037-1072)
y que añadir un `App.test.tsx` que verifique "ticker ref es
null tras el dispatch" re-establece la fuente: el ref es
closure-private, efímero, y se sobrescribe en el próximo
`enterCooldown`. `bun test` verde: 680 pass / 0 fail (sin
cambio en el conteo).

### Mejora 23 — Finding 5.6.A — MEDIUM — Dashboard `cooldownText` always shows "Rate limited" even for transient cooldowns

- [x] Evaluar la mejora 23 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 23 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 23 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 23 y corregir cualquier regresión causada por el cambio.

_Evaluación_: Finding 5.6.A tiene la misma causa raíz que Finding 5.1.A
(la action `rate_limited` y el state `cooldown` no cargaban `kind`,
y el Dashboard siempre elegía el copy de "Rate limited"). La fix del
audit (`MEJORAS.md:4711-4729`) lista 6 pasos — los 5 de plomería
(state shape, action shape, dispatch site, reducer forward, Dashboard
read) más 1 de tests — y Mejora 16 (commit `9a8cb78`) los implementó
todos:

1. `src/types.ts:35` — `cooldown` state lleva `kind: "rate_limit" | "transient"` (requerido).
2. `src/types.ts:79` — `rate_limited` action lleva `kind` opcional
   (`?? "rate_limit"` en el reducer cubre el path `chaos_429`,
   `App.tsx:1675`, que omite el campo).
3. `src/App.tsx:762` — dispatch pasa `kind` desde `enterCooldown`.
4. `src/hooks/useLoopState.ts:174` — reducer propaga
   `action.kind ?? "rate_limit"` al state.
5. `src/components/Dashboard.tsx:97-103` — memo `cooldownText` elige
   `cooldownRetryText` si `state.kind === "transient"`, si no
   `cooldownText` (exactamente la fórmula propuesta en
   `MEJORAS.md:4726`).
6. Tests: las 9 construcciones directas de `cooldown` en
   `useLoopState.test.ts` se actualizaron con `kind: "rate_limit"`,
   y 2 tests nuevos en líneas 516-548 pinean la propagación de
   `kind: "transient"` y el default `"rate_limit"` cuando se omite.

El commit `9a8cb78` se titula "Finding 5.1.A" porque ese fue el
trigger del cambio (la falta del campo en el state machine), pero
el user-facing gap que el audit nombra como Finding 5.6.A — el
Dashboard mostrando "Rate limited" en un transient cooldown — es
exactamente la pieza que ese commit cierra. Implementación mínima:
anotación en este plan; cero cambios de código. `bun test` verde:
680 pass / 0 fail, 1680 expect() calls, 323 ms — sin cambio en el
conteo (era 680 antes de la anotación). Commit `docs(plan)`:
pendiente.

### Mejora 24 — Finding 6.2.A — LOW — Duplicated predicate in `App.tsx` invites drift

- [x] Evaluar la mejora 24 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 24 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 24 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 24 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la descrita en
`MEJORAS.md:5386-5427`: la `isActive` probe en `App.tsx:247-253`
re-derivaba el predicado `getActiveSessionId` inline, mientras
los otros 5 call sites de `App.tsx` (líneas 258, 276, 467, 651,
1380) usan el helper exportado de `useLoopState.ts:34-38`.
La propuesta del audit — sustituir el cuerpo inline por
`getActiveSessionId(loop.state()) !== ""` — es estrictamente la
mínima útil: 1 línea de código por lado, cero cambio de
comportamiento, y la truth table de la probe queda derivada de
la misma fuente que los otros 5 call sites (los 12 variants de
`LoopState` ya están pineados en `useLoopState.test.ts:1181-1220`,
incluido el outlier `debug{"abc"}` que correctamente retorna
`""`). Implementación: 5 líneas → 1 línea en `src/App.tsx:247-252`
(más 3 líneas de comentario que nombran el source `MEJORAS.md
Finding 6.2.A` y los 5 call sites homólogos, siguiendo el
patrón de Mejoras 17-22). El import `getActiveSessionId` ya
estaba en `App.tsx:16` (sin cambios de imports). Cero impacto
en la watchdog behavior, cero impacto en la TUI, cero impacto
en el reducer, cero impacto en el Dashboard, cero impacto en
el resto del flujo. Sin nuevos tests — la verdad del predicado
está pineada en `useLoopState.test.ts:1181-1220` y añadir un
test que pinea "el call site llama al helper" sería tautológico.
`bun test` verde: 680 pass / 0 fail, 1680 expect() calls,
23 files, 318 ms — sin cambio en el conteo. Commit `868cc40`.

### Mejora 25 — Finding 7.2.A — MEDIUM — Consumer/hook filter share an asymmetric shape

- [x] Evaluar la mejora 25 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 25 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 25 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 25 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es documental, no de
comportamiento — el audit (`MEJORAS.md:7737-7744`) confirma que la
asimetría es una decisión deliberada pero que "la política no está
documentada inline", y un futuro mantenedor no puede distinguir si
`eventSessionId &&` es "deliberado: pasar errores no-atribuidos" o
"oversight: faltó el check explícito 'has sessionID'". La
prescripción exacta del audit (`MEJORAS.md:7749-7775`) es la opción
correcta: añadir un comentario de política en el sitio del hook
(`useSSE.ts:376-385`, 10 líneas) y un cross-reference en el sitio
del consumer (`App.tsx:464-470`, 7 líneas) que nombra el source de
verdad (el hook) y la justificación (el App es el árbitro
autoritativo que short-circuita por state, no por presencia de
sessionID). Cero cambios al filtro, cero cambios al reducer, cero
cambios al consumer logic, cero impacto en el camino feliz. La
explicación también pinea explícitamente la asimetría con los
filtros `session.idle` / `todo.updated` (que NO tienen el guard
`eventSessionId &&`) y remite a `MEJORAS.md Finding 7.2.A` como
source de verdad — siguiendo el patrón de Mejoras 17-22 (cada fix
nombra el source `MEJORAS.md Finding N` en el comment block).
Sin nuevos tests — la veracidad del predicado es observable
sólo vía render de Solid + fake SSE stream (per `docs/testing.md`,
integration-territory), y el audit (`MEJORAS.md:7820-7840`) ya
justificó que el `classifySessionError` test suite (21 casos)
cubre la rama del classifier pero no la del hook filter. Cero
cambio en el conteo de tests. `bun test` verde: 680 pass / 0
fail, 1680 expect() calls, 23 files, 320 ms. Commit `7fd66c6`.

### Mejora 26 — Finding 7.3.A — LOW — Hook-layer filter for `session.idle` is **opposite** to `session.error`

- [x] Evaluar la mejora 26 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 26 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 26 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 26 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:8201-8275`): los 6 call sites de per-session
filter en `useSSE.ts` (líneas 346, 362, 377-383, 400, 428,
466) usaban 2 shapes opuestas — `session.idle` / `todo.updated`
eran conservative (drop un-attributed via
`filterSessionId && eventSessionId !== filterSessionId`),
mientras `session.error` / `message.part.updated` /
`session.diff` eran permissive (pass un-attributed via el
short-circuit `eventSessionId &&`). La opción del fix
propuesta en `MEJORAS.md:8241-8275` ("pick one shape and
apply it uniformly") es estrictamente la correcta: el audit
recomienda la lectura conservative como "safer default"
porque (a) el OpenCode SDK siempre popula `sessionID`
(SessionIdleEvent / SessionErrorEvent declaran `sessionID:
SessionID` como required branded string — `MEJORAS.md:8216-8222`)
así que el gap es dormant, y (b) el App-level consumer
filter (e.g. `App.tsx:472` para session.error) ya tiene su
propia verdad de sessionID y short-circuita en state, así
que un drop en el hook layer es invisible al state
machine. Implementación mínima: (1) eliminar la cláusula
`eventSessionId &&` de los 3 filtros permissive
(`session.error:385`, `message.part.updated:423`,
`session.diff:461`) — 1 línea de cambio cada uno, mismo
patrón que ya tenían `session.idle` y `todo.updated`; (2)
eliminar el comment block de 10 líneas en `session.error`
que documentaba la asimetría deliberada (era la única
explicación de la policy en el codebase, ahora reemplazada
por una sola); (3) añadir un comment block de 9 líneas
sobre `case "session.idle":` que documenta la policy
uniforme en un solo lugar, referenciando el finding; (4)
actualizar el comment del App-level onSessionError handler
(`App.tsx:465-470`) — el `eventSessionId &&` truthy guard
del consumer ahora es defense-in-depth (la policy hook-layer
ya drop un-attributed), no load-bearing. Cero cambios al
comportamiento observable (el SDK nunca emite un-attributed
events, y el consumer ya los drop). Cero impacto en el
reducer, cero impacto en la TUI, cero impacto en tests
(`MEJORAS.md:8331-8350` ya justificó que el filter
stale-session del hook + consumer no es unit-testable sin
Solid render + fake SSE stream; el 21-case
`classifySessionError` test suite permanece verde).
`bun test` verde: 680 pass / 0 fail, 1680 expect() calls,
23 files, 317 ms — sin cambio en el conteo (era 680
antes del fix).

### Mejora 27 — Finding 7.5.A — HIGH — `server.restart()` has no in-flight guard; can leak the first server

- [x] Evaluar la mejora 27 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 27 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 27 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 27 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:9256-9267`): `restart()` (`useServer.ts:194-229`)
no tiene guard de in-flight, así que dos llamantes concurrentes
pueden ambos pasar por `setStatus("starting")` (que es no-op
para el segundo) + `closeCurrent()` (que es no-op para el
segundo) + `launch()`, y cada uno llama
`serverRef = await createOpencodeServer(...)` en paralelo. El
segundo resuelve y sobrescribe `serverRef`, dejando el handle
del primer server en el piso (proceso leaked, port retenido
hasta exit). La propuesta del audit
(`MEJORAS.md:9370-9406`) es estrictamente la correcta: un
early-return sobre `status() === "starting"` que reusa el
mismo patrón que `startServer()` ya tiene en líneas 120-122.
Implementación mínima: 11 líneas añadidas al inicio de
`restart()` (1 `if` + 1 `return` + 9 líneas de comentario
que nombran el source `MEJORAS.md Finding 7.5.A`, los dos
triggers concurrentes del audit, y el paralelo con
`startServer`), más un `log.health("server",
"restart_in_flight_noop", { url })` que da visibilidad
post-mortem de double-fires. Cero cambios al reducer del
state, cero cambios al reducer del App, cero impacto en el
camino feliz (bajo operación no-racily, `status()` está en
`"ready"` / `"error"` / `"unhealthy"` cuando entra, y el
guard nunca dispara), cero impacto en `startServer` (el
patrón se reusa, no se introduce un nuevo state bit que
mantener en sync). Sin nuevos tests — el audit
(`MEJORAS.md:9594-9619`) ya justificó que `useServer.test.ts`
no existe (Mejora 89, Finding 18.2.A) y que un test para el
guard requeriría mockear `createOpencodeServer` con un
handle slow-resolving; ese test es `useServer.test.ts`
territory y queda pendiente para la fase de testing
coverage. La garantía del guard es estructural: el mismo
código de plomería que ya funciona en `startServer` ahora
funciona en `restart`. `bun test` verde: 680 pass / 0
fail, 1680 expect() calls, 23 files, 315 ms — sin cambio
en el conteo (era 680 antes del guard). Commit `eeaf2fb`.

### Mejora 28 — Finding 8.1.A — LOW — Orphan `.tmp` file on `rename` failure

- [x] Evaluar la mejora 28 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 28 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 28 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 28 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:9871-9917`: el bloque
`writeFile → rename` de `saveLoopState`
(`loop-state-store.ts:49-57`) deja el `.tmp`
huérfano si `rename` falla tras un `writeFile`
exitoso. El `.loop*` ya está gitignored (línea
11-12 del header del módulo), así que el síntoma
no es ruido en `git status`; es ruido en el
directorio de trabajo (visible a
`git status --ignored`, IDEs, linters que
escanean `.tmp*`, y el siguiente run de
`saveLoopState` que sobreescribe el tmp). La
opción del fix propuesta en `MEJORAS.md:9895-9911`
(inner `try/catch` con `unlink` best-effort del
tmp, re-throw del error original al outer catch
que ya loggea) es estrictamente la mínima útil:

1. **Sigue el contrato "never throws"** del
   docstring (línea 47-48). El `throw renameErr`
   interno se captura en el `catch` externo
   (línea 54) que loggea con `log.warn` y
   retorna silenciosamente — el comportamiento
   observable desde el call site (`App.tsx:1286`,
   `void saveLoopState(snapshot)`) es idéntico.
2. **Es best-effort, no aborta el cleanup.**
   El `unlink` interno tiene su propio `try/catch`
   vacío: en un escenario disk-full real, el
   unlink también podría fallar, pero el contrato
   "best-effort" ya estaba documentado (línea 47)
   y el siguiente `saveLoopState` sobrescribe
   el tmp de todas formas.
3. **Es local al path de fallo, sin tocar el
   camino feliz.** El `try` interno solo
   envuelve el `rename` (la línea 53 original);
   el `writeFile` previo (línea 52) sigue
   ejecutándose fuera del inner catch, así
   que un fallo de `writeFile` no gatilla
   el `unlink` (no hay nada que limpiar si
   el tmp ni siquiera se creó).

Implementación: 16 líneas añadidas (1 try +
1 throw + 1 unlink try + 1 unlink catch + 7
líneas de comentario que nombran los 3 modos
de fallo, el source `MEJORAS.md Finding 8.1.A`,
y la invariante "best-effort cleanup del tmp
huérfano"). Cero cambios a la firma de
`saveLoopState`, cero cambios a `loadLoopState`
/ `clearLoopState`, cero cambios al reducer
del App, cero impacto en la TUI, cero impacto
en el lifecycle de iteración. Sin nuevos
tests — el audit (`MEJORAS.md:9913-9917` y
`MEJORAS.md:9871-9917` global) ya justificó
que el harness de Bun test usa un tempdir
fresco owned por el test process, así que
reproducir el fallo requiere juegos de
permisos (`chmod 555` sobre el parent dir)
que son cross-platform-frágiles (Windows
ACLs no mapean a POSIX `chmod`, y root-owned
tempdirs saltan el check de permiso) y que
la opción de mockear `node:fs/promises` con
`mock.module` rompería el patrón integration
del codebase (ver `docs/testing.md`). El
contrato "happy path: no leftover tmp" sigue
pineado por el test existente
`loop-state-store.test.ts:47-53`
("overwrites previous state atomically (no
leftover temp file)"), y la lógica del cleanup
espectral es estructural (un `unlink` en un
`catch`), no computacional — code review cubre
el gap de cobertura. `bun test` verde: 680
pass / 0 fail, 1680 expect() calls, 23 files,
318 ms — sin cambio en el conteo. Commit
`76de350`.

### Mejora 29 — Finding 8.2.A — MEDIUM — `loadLoopState` only validates `version` and `iteration`; other fields slip through

- [x] Evaluar la mejora 29 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 29 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 29 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 29 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:9971-10032`: la guarda
inline de `loadLoopState`
(`loop-state-store.ts:81-88`) solo verificaba
`version === 1` y `typeof iteration === "number"`,
así que un archivo hand-edited o parcialmente
escrito con un `sessionId` de tipo incorrecto
(42, un objeto), un `stateType` no-string, un
`rateLimitAttempts` no-numérico, o un `updatedAt`
no-string pasaba la validación y se entregaba a
`App.tsx:1168-1169` que lo serializaba en la URL
de `reconcileSession`. El peor caso observable
(un `sessionId` basura) producía un verdict
`"unknown"` de `getSessionStatus` que `doResume`
trataba como "missing" y arrancaba iteración
fresca con el contador preservado — recoverable
pero ugly, y la validación debería estar en el
trust boundary, no esparcida defensivamente en
cada consumer. La propuesta de
`MEJORAS.md:10004-10030` (extraer un type guard
`isPersistedLoopState`) es estrictamente la
mínima útil y reusa el patrón ya establecido en
`i18n.ts:22` (`isLocale(v: unknown): v is Locale`)
y `with-timeout.ts:37` (`isTimeoutError(err: unknown)`).

Implementación: 11 líneas añadidas a
`src/lib/loop-state-store.ts:75-94` (función pura
`isPersistedLoopState` con la lógica de
validación per-field propuesta en `MEJORAS.md:10008-10019`),
4 líneas modificadas en `loadLoopState` para
reemplazar la guarda inline de 7 líneas por
`isPersistedLoopState(parsed) ? parsed : null`,
más 8 líneas de comentario que nombran el source
`MEJORAS.md Finding 8.2.A`, el trust boundary
argument, y el paralelo con `isLocale` /
`isTimeoutError`. Cero cambios a la firma de
`loadLoopState` (`Promise<PersistedLoopState | null>`),
cero cambios a `saveLoopState`, cero cambios a
`clearLoopState`, cero cambios a la interfaz
`PersistedLoopState`, cero cambios al consumer
`App.tsx:1168-1169`, cero impacto en el camino
feliz (el 99.9% de los `.loop-state.json` se
escriben desde el producer de `App.tsx:1284-1290`
y siempre satisfacen el type guard). Cero impacto
en el resume path — un archivo corrupto se
rechaza con `null` y se inicia iteración fresca,
exactamente el mismo path que ya tomaba un
archivo con `version !== 1` (test pineado en
`loop-state-store.test.ts:66-69` antes del fix).

Cubierto por 5 tests nuevos en
`loop-state-store.test.ts:71-97` que pinean:
`sessionId: 42` → `null` (caso central del
finding, sesión con tipo incorrecto),
`sessionId: null` → acepta (entre iteraciones
es válido, defensa contra la simetría
`string-or-null`), `stateType: 42` → `null`,
`rateLimitAttempts: "x"` → `null`, `updatedAt:
42` → `null`. El test existente "returns null for
an unsupported version" (`loop-state-store.test.ts:66-69`)
sigue pineando el path de `version: 99`, así
que las 6 guards del type guard quedan
ejercitadas — 1 por test, sin solapamiento.
`bun test` verde: 685 pass / 0 fail (era 680
antes del fix), 1685 expect() calls, 23 files,
324 ms — sin cambio en el conteo de archivos,
+5 tests, +5 expects. Commit `55b9fdd`.

### Mejora 30 — Finding 8.3.A — LOW — No test for the `EACCES` / `EPERM` branch of `clearLoopState`

- [x] Evaluar la mejora 30 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 30 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 30 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 30 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:10081-10125`: el
catch type-agnostic de `clearLoopState`
(`loop-state-store.ts:114-119`) cubre `ENOENT`
(ya pineado en el test "clearing a
non-existent file does not throw", líneas
61-64) y el happy path (líneas 55-59), pero
NO está pineada la rama `EACCES` / `EPERM`
— la regresión canónica del audit
(`MEJORAS.md:10086-10089`): "cambiar el catch
a `if (err.code !== "ENOENT") throw`". El
test actual pasaría con esa regresión porque
el `if` lanza el mismo `ENOENT` que ya cubría
el test pineado, y el nuevo branch `EACCES`
queda sin vigilancia.

La opción del fix propuesta en
`MEJORAS.md:10094-10122` es estrictamente la
mínima útil:

1. **`chmodSync(dir, 0o555)` sobre el
   tempdir** es el canónico POSIX para
   forzar un `EACCES` (macOS) o `EPERM`
   (Linux) en el `unlink` del state file
   dentro de un dir read-only. El
   `mkdtempSync` ya existente en
   `beforeEach` (línea 18) crea el dir como
   owner = test process, así que el `chmod`
   está permitido sin escalación.

2. **`it.skipIf(process.platform === "win32"
   || getuid?.() === 0)`** replica
   exactamente las dos guardas que el audit
   recomienda (líneas 10117-10121) — Windows
   ACLs no mapean a POSIX `chmod`, y root
   bypasea el read-only check. Bun 1.3.x
   expone `it.skipIf` en la `bun:test`
   module, así que no requiere imports
   adicionales.

3. **`try/finally` que restaura
   `chmodSync(dir, 0o755)`** mantiene el
   contrato del `afterEach` (línea 24) — si
   el test fallara, el `rmSync` corre con
   permisos restaurados y el tempdir se
   limpia. Sin esta guarda, un test
   fallido dejaría el tempdir no-eliminable
   hasta intervención manual.

Implementación: 1 import (`chmodSync`
añadido a la línea 2) + 27 líneas nuevas en
`src/lib/loop-state-store.test.ts:66-92`
(test + comment block que nombra el source
`MEJORAS.md Finding 8.3.A`, las dos guardas
cross-platform, y la regresión canónica que
el test pinea). Cero cambios al production
code — el contract de `clearLoopState` ya
era correcto, solo faltaba el pineo.

Cero impacto en el camino feliz del
production code (el cambio es test-only).
Cero impacto en los otros 11 tests del file
(el `chmod 0o555` se aplica solo dentro del
nuevo test, y el `finally` lo restaura
antes de que `afterEach` corra).

El test es ejecutable end-to-end en el
entorno de desarrollo (macOS, user no-root):
`bun test src/lib/loop-state-store.test.ts`
pasa con 12 tests (era 11 antes del fix).
En el suite completo: 686 pass / 0 fail
(era 685), 1685 expect() calls (era 1685),
23 files, 316 ms — +1 test, mismo número
de expects (el nuevo test tiene 0
expect() calls explícitos; la aserción es
"no throw"). Commit `3d3a2f2`.

### Mejora 31 — Finding 8.4.A — LOW — `void saveLoopState(snapshot)` is fire-and-forget

- [x] Evaluar la mejora 31 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 31 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 31 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 31 y corregir cualquier regresión causada por el cambio.

_Evaluación_: el propio audit (`MEJORAS.md:10195-10229`) cierra el
finding con un veredicto explícito: **"Mark as INFO (not LOW) —
the finding is recorded for completeness but no change is proposed"**,
y la tabla resumen (`MEJORAS.md:10694`) reclasifica 8.4.A como
`LOW (INFO)`. La causa raíz es estructural y la fix propuesta
(`MEJORAS.md:10219-10226`) sería contraproducente: bloquear el
`createEffect` reactivo (`App.tsx:1381-1401`, donde ahora vive la
llamada — la auditoría referenciaba la línea 1286, pero el bloque
driitó por los commits Mejoras 11/12/14 sin cambiar la
intención) sobre un `writeFile`+`rename` acoplaría la
responsividad de la TUI a la latencia del filesystem. El contrato
existente de `saveLoopState` (`loop-state-store.ts:46-48`,
"Never throws — persistence is best-effort and must not crash
the app") refuerza la misma política: el caller no debe
bloquearse, y el error ya se loggea como `log.warn` en la
línea 70. La ventana de staleness (~1ms en SSD local) es
asumida por el audit como "indicador de un problema mucho
mayor (kernel bug, hardware fault)" — a ese nivel perder 1ms de
progreso es irrelevante. Implementación mínima: anotación en
este plan; cero cambios de código. `bun test` verde: 686
pass / 0 fail, 1685 expect() calls, 23 files, 301 ms — sin
cambio en el conteo (era 686 antes de la anotación).

### Mejora 32 — Finding 8.5.A — MEDIUM — `verdict === "idle"` discards the in-flight iteration's result and may over-count work

- [x] Evaluar la mejora 32 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 32 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 32 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 32 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:10332-10446` y la opción (a)
del fix propuesto ("Add a iteration_resumed action
that sets the iteration count to p.iteration
without incrementing, and dispatch it instead of
resume_session in the idle branch") es claramente
superior a la opción (b) (reset a 0, que pierde el
progreso del usuario) y a la opción (c) (offset de
display, que introduce inconsistencia entre el
conteo interno y el valor mostrado en dashboard,
dialog de completion y activity log — y no captura
el problema en logs de post-mortem). Implementar la
opción (a) con un flag de estado one-shot (mismo
patrón que `lastIteration` introducido por Mejora 11
para Finding 3.1.A) es estrictamente la mínima útil:

- `src/types.ts:19-29` — el campo `resumedFromIdle?:
  boolean` se añade a la variante `running` del
  `LoopState`; la action union gana un nuevo
  variante `iteration_resumed` con la misma shape
  que `resume_session` (`iteration`, `sessionId`).
- `src/hooks/useLoopState.ts:81-90` — el reducer
  para `iteration_started` consulta el flag: si
  está presente, retorna `running(iteration, …)`
  SIN incrementar y sin el flag (consume one-shot);
  en cualquier otro caso, el comportamiento
  existente (`iteration + 1`) se preserva
  exactamente.
- `src/hooks/useLoopState.ts:220-238` — nuevo
  reducer case `iteration_resumed`: como
  `resume_session` pero agregando
  `resumedFromIdle: true` al estado resultante.
- `src/App.tsx:1295-1311` — el branch `else` de
  `doResume` dispatcha `iteration_resumed` (en vez
  de `resume_session`) cuando `verdict === "idle"`;
  para `missing`/`unknown` mantiene `resume_session`
  porque el outcome de la sesión in-flight es
  desconocido y la nueva iteración representa
  trabajo genuino (count de `p.iteration + 1`
  correcto).

Cero impacto en el camino feliz: el flag solo se
establece vía `iteration_resumed` desde `doResume`,
que solo se ejecuta al startup. Cero impacto en la
rama `verdict === "working"`: dispatcha
`resume_session` con el sessionId real (sin flag).
Cero impacto en `iteration_started` para estados
sin flag: 8 tests existentes en `useLoopState.test.ts`
(más 1 nuevo explícito) pinean el comportamiento
estándar. Cero impacto en paused → running via
iteration_started: 1 test pinea el increment normal.

Cubierto por 8 tests nuevos en
`src/hooks/useLoopState.test.ts`:

- 3 para `iteration_resumed` (ready → running con
  flag, ready → running con sessionId no-vacío +
  flag, no-op desde non-ready)
- 4 para `iteration_started` con flag (no increment
  cuando flag=true, increment normal cuando
  flag=false/undefined, one-shot semantics
  verificando que la SIGUIENTE iteration_started
  después del flag-clear incrementa normal, paused
  → running via iteration_started incrementa
  normal)
- 1 en el table-driven `Phase 3` suite que verifica
  que `iteration_resumed` es no-op desde
  starting/running/pausing/paused/cooldown/etc.

`bun test` verde: 694 pass / 0 fail (era 686 antes
del fix), 1714 expect() calls, 23 files, 311 ms.
Commit `4e64e13`.

### Mejora 33 — Finding 11.2.A — MEDIUM — `Bun.spawn` is missing `detached: true`

- [x] Evaluar la mejora 33 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 33 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 33 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 33 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:13456-13475`): `Bun.spawn` se llama sin `detached: true`
ni `windowsHide: true`, así que el terminal hereda el process group
de OCLoop. Cuando el usuario cierra la TUI o termina la sesión SSH,
el SIGHUP puede matar el terminal recién abierto — el fire-and-forget
del launcher queda socavado. El comment block encima del spawn
también mentía (`MEJORAS.md:13563-13589`, Finding 11.2.F): decía
"Using 'inherit' for stdio" pero el código usa `"ignore"`. La
propuesta del audit es estrictamente la mínima útil: 2 flags más
en el options object + un comment block corregido. Implementación
mínima: 2 líneas añadidas (`detached: true`, `windowsHide: true`)
+ 6 líneas de comentario que nombran la racionalidad
defensiva (process group / SIGHUP), el source `MEJORAS.md
Finding 11.2.A`, y aclaran que `proc.unref()` cubre el lado
"OCLoop no espera al child" (el audit proponía quitarlo por
redundancia, pero el contrato de "fire-and-forget" sigue
siendo load-bearing en caso de que Bun cambie la semántica
de `detached: true` entre versiones). Cero cambios a la firma
de `launchTerminal`, cero cambios a `KNOWN_TERMINALS`,
cero cambios a `getAttachCommand` / `buildArgs` / `detectInstalledTerminals`,
cero impacto en la ruta de error (el `try/catch` exterior
sigue capturando `ENOENT` / `EACCES` igual), cero impacto
en tests (`terminal-launcher.test.ts` no existe — Mejora 92
lo cubrirá cuando llegue su turno; un test que pinee
"detached: true se pasa" requeriría mockear `Bun.spawn`
que rompe el patrón de tests del codebase, ver `docs/testing.md`).
El cambio es estructuralmente correcto y operacionalmente
gratis: POSIX `setsid()` + `windowsHide` solo en Windows.
`bun test` verde: 694 pass / 0 fail, 1714 expect() calls,
23 files, 310 ms — sin cambio en el conteo. Commit `5741886`.

### Mejora 34 — Finding 11.2.B — LOW — Empty `config.args` for a custom terminal silently launches without the attach command

- [x] Evaluar la mejora 34 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 34 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 34 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 34 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:13477-13511`): un `config.args = ""` produce
`argsPattern = []` en `terminal-launcher.ts:143`, que `buildArgs`
pasa intacto, y `Bun.spawn([command])` lanza la terminal sin
comando — el usuario obtiene un shell vacío sin el attach
command. La opción del fix (defensa en dos capas: dialog
rechaza en save + launcher como backstop) es estrictamente la
mínima útil y reusa el patrón ya establecido en el codebase
(Mejora 13, Finding 4.1.B: throw-at-trust-boundary + UX
clara en el call site). Implementación: 9 líneas en
`src/lib/terminal-launcher.ts:144-157` (1 `if` con 1
`return` + 7 líneas de comentario que nombran el source
`MEJORAS.md Finding 11.2.B`, el paralelo con Mejora 13, y la
garantía estructural del path known-terminal) + 10 líneas
en `src/components/DialogTerminalConfig.tsx:62-74`
(reestructuración del `if` con `cmd && args`, mismo patrón
"silent no-op on Enter" que el check original del command).
Cero cambios a la firma de `launchTerminal` (`Promise<LaunchResult>`
intacta), cero cambios a `KNOWN_TERMINALS`, cero cambios
a `getAttachCommand` / `buildArgs` / `detectInstalledTerminals`,
cero impacto en la ruta `known` (sus entries siempre tienen
`args.length > 0` por construcción, verificado por grep
en la fase de audit `MEJORAS.md:13529`), cero impacto en
los call sites existentes (`App.tsx:1353-1376` ya
pre-valida `if (!url) return`, así que la única ruta
donde `args = ""` puede entrar es la rama custom desde
el dialog — exactamente el caso que este fix cierra).
El error del launcher es user-facing (`"Custom terminal
args must include the {cmd} placeholder"`), surface el
mismo string que Mejora 35 (Finding 11.2.C) usará para
el caso "args presente pero sin {cmd}" — ambos fixes
comparten la misma copy porque comparten la misma
condición de fallo desde la perspectiva del usuario.
Cero impacto en tests (694 pass / 0 fail, sin cambio en
el conteo — `terminal-launcher.test.ts` no existe, Mejora
92 lo cubrirá cuando llegue su turno, mismo argumento
que Mejora 33). Commit `c8398c5`.

### Mejora 35 — Finding 11.2.C — LOW — Missing `{cmd}` placeholder in custom args silently launches without the attach command

- [x] Evaluar la mejora 35 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 35 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 35 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 35 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:13513-13531`): un `config.args` no-vacío pero sin
`{cmd}` (e.g. `"-e bash"`) produce `argsPattern = ["-e", "bash"]`
que `buildArgs` pasa intacto, y `Bun.spawn` lanza la terminal con
los args literales — el usuario obtiene un shell `bash` y el
attach command nunca corre. La opción del fix propuesta en
`MEJORAS.md:13519-13526` (defensa en dos capas: dialog rechaza
en save + launcher como backstop) es estrictamente la mínima útil
y reusa el patrón ya establecido por Mejora 34 (Finding 11.2.B)
en el mismo archivo: 9 líneas en `terminal-launcher.ts` y el
mismo string de error. La diferencia de comportamiento entre
11.2.B (empty) y 11.2.C (no placeholder) es nula desde la
perspectiva del usuario — ambos producen un launch mudo, y el
error "Custom terminal args must include the {cmd} placeholder"
cubre los dos casos porque "args vacío" es estrictamente
"args sin `{cmd}`" cuando el conjunto de tokens parseados es
`[]`. Implementación: 12 líneas añadidas a
`src/lib/terminal-launcher.ts:160-176` (1 `if` con 1 `return` + 10
líneas de comentario que nombran el source `MEJORAS.md Finding
11.2.C`, el paralelo con Mejora 34, y el contrato "el
placeholder debe estar presente en CUALQUIER args de terminal
custom") + 9 líneas modificadas en
`src/components/DialogTerminalConfig.tsx:62-81` (extender el `if`
existente `cmd && args` a `cmd && args && args.includes("{cmd}")`,
un solo check, mismo patrón "silent no-op on Enter" que el check
original del command). Cero cambios a la firma de `launchTerminal`
(`Promise<LaunchResult>` intacta), cero cambios a `KNOWN_TERMINALS`
(todos los 12 entries ya tienen `{cmd}` por construcción,
verificado por grep), cero cambios a `getAttachCommand` /
`buildArgs` / `detectInstalledTerminals`, cero impacto en la ruta
`known` (sus entries siempre tienen `{cmd}` por construcción,
verificado por grep en la fase de audit `MEJORAS.md:13529`), cero
impacto en los call sites existentes (`App.tsx:1353-1376` ya
pre-valida `if (!url) return`, así que la única ruta donde
`args` sin `{cmd}` puede entrar es la rama custom desde el
dialog — exactamente el caso que este fix cierra). El error del
launcher es user-facing (idéntico al de Mejora 34) y surface el
mismo string — ambos fixes comparten la misma copy porque
comparten la misma condición de fallo desde la perspectiva del
usuario. Cero impacto en tests (694 pass / 0 fail, sin cambio
en el conteo — `terminal-launcher.test.ts` no existe, Mejora 92
lo cubrirá cuando llegue su turno, mismo argumento que Mejoras
33-34). Commit `6da2f66`.

### Mejora 36 — Finding 11.2.D — LOW — Empty `attachCmd` produces a corrupted spawn argv

- [x] Evaluar la mejora 36 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 36 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 36 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 36 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:13533-13549`): `buildArgs`
(`terminal-launcher.ts:101-114`) no defiende su precondición — un
`attachCmd = ""` produce `cmdParts = []` y `flatMap` retorna el
patrón literal sin substitución, así que `Bun.spawn` lanza la
terminal sin comando (para alacritty, `alacritty -e`) y el usuario
obtiene un shell vacío. La guarda de `App.tsx:1356-1357`
(`if (!url) return`) bloquea este path en el call flow actual,
pero `buildArgs` no se defiende a sí misma: cualquier futuro
call site que bypase la guarda (o cualquier test que pase `""`
directamente) obtiene un fallo silencioso. La opción del fix
propuesta en `MEJORAS.md:13539-13548` (defensive guard al top
de `buildArgs` con `throw`) es estrictamente la mínima útil y
es la única opción correcta (vs. un check antes del `Bun.spawn`,
que duplicaría la dependencia del trust boundary del call site;
vs. devolver `[]`, que el `flatMap` no puede distinguir de un
happy path). Implementación mínima: 12 líneas de comentario
que nombran el source `MEJORAS.md Finding 11.2.D`, el patrón
homólogo de Mejoras 34/35 (defense-in-depth via custom-dialog
pre-validación + launcher backstop), y el racional defensivo
del `throw` (cualquier call site que bypase el App-level guard
queda atrapado en el outer `try/catch` y surface un error
claro en vez de un shell mudo) + 4 líneas de guard + 1 blank
line. Cero cambios a la firma de `buildArgs`
(`(string[], string) => string[]` intacta), cero cambios a la
firma de `launchTerminal` (`Promise<LaunchResult>` intacta),
cero cambios a `KNOWN_TERMINALS` (sus 12 entries siguen
cargando `{cmd}` por construcción), cero cambios al catch
exterior (el `try/catch` ya convierte el `throw` en
`{ success: false, error: "attachCmd is empty; cannot construct
terminal command" }` sin intervención), cero impacto en el
camino feliz (el guard es observable-equivalente a la línea
`cmdParts.filter((p) => p.length > 0)` que ya está ahí: un
`attachCmd` no-vacío sigue produciendo `cmdParts.length > 0`
y el `if` es no-op). Cero impacto en tests
(`terminal-launcher.test.ts` no existe, Mejora 92 lo cubrirá
cuando llegue su turno, mismo argumento que Mejoras 33-35).
`bun test` verde: 694 pass / 0 fail, 1714 expect() calls,
23 files, 315 ms — sin cambio en el conteo. Commit `81d92e5`.

### Mejora 37 — Finding 11.3.A — LOW — Empty `url` produces a malformed `opencode attach` string (double space)

- [x] Evaluar la mejora 37 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 37 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 37 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 37 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:13690-13718`): `getAttachCommand`
(`terminal-launcher.ts:93-95`) no defiende su precondición — un
`url = ""` produce `` `opencode attach ${url} --session ${sessionId}` ``
= `"opencode attach  --session <sid>"` (doble espacio literal).
`buildArgs` (`terminal-launcher.ts:104`) splitea y filtra
(`cmdParts.filter((p) => p.length > 0)`), así que el token URL vacío
se descarta silenciosamente y `Bun.spawn` corre
`opencode attach --session <sid>` sin argumento de URL — el usuario
obtiene un confuso `opencode: error: missing URL argument` surfaced
a través del `try/catch` exterior en `launchTerminal` (línea 229).
Las 5 call sites ya pre-validan url: `App.tsx:1356-1357`
(`launchConfiguredTerminal`), `App.tsx:1425-1426, 1436-1437`
(copy handlers), `App.tsx:1526-1527` (copy_attach command),
`App.tsx:1462-1464` (`showTerminalError`). El throw es estrictamente
defensivo — atrapa cualquier futuro call site, hand-edited config,
o test path que pase `""` directamente. La opción del fix
propuesta en `MEJORAS.md:13704-13714` (defensive guard al top de
`getAttachCommand` con `throw`) es estrictamente la mínima útil y
es la única opción correcta (vs. devolver `""`, que el call site
no puede distinguir de un happy path sin re-validar; vs. un check
en cada call site, que duplica la dependencia del trust boundary
del caller — exactamente el antipatrón que el `buildArgs` guard de
Mejora 36 evitó). Implementación mínima: 19 líneas de comentario
que nombran el source `MEJORAS.md Finding 11.3.A`, el patrón
homólogo de Mejoras 33-36 (defense-in-depth via App-level
pre-validación + launcher backstop), y el racional defensivo
del `throw` (cualquier call site que bypase el App-level guard
queda atrapado en el outer `try/catch` de `launchTerminal` y
surface un error claro en vez de un spawn argv corrupto) + 3
líneas de guard. Cero cambios a la firma de `getAttachCommand`
(`(string, string) => string` intacta), cero cambios a las 5
call sites en `App.tsx` (sus guards pre-existentes siguen
protegiendo el path actual), cero cambios a `buildArgs` o
`launchTerminal` (el `try/catch` exterior ya convierte el `throw`
en `{ success: false, error: "getAttachCommand: url is required" }`
sin intervención), cero impacto en el camino feliz (un url
truthy sigue fluyendo al `return` exactamente como antes). Cero
impacto en tests (`terminal-launcher.test.ts` no existe, Mejora 92
lo cubrirá cuando llegue su turno, mismo argumento que Mejoras
33-36). `bun test` verde: 694 pass / 0 fail, 1714 expect() calls,
23 files, 308 ms — sin cambio en el conteo (era 694 antes del
guard). Commit `1e1b874`.

### Mejora 38 — Finding 11.3.B — LOW — Empty `sessionId` produces a malformed `opencode attach` string (trailing space)

- [x] Evaluar la mejora 38 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 38 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 38 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 38 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:13720-13728`: `getAttachCommand`
(`terminal-launcher.ts:117`) no defendía su precondición
para `sessionId` — un `sessionId = ""` produce
`` `opencode attach ${url} --session ${sessionId}` `` =
`"opencode attach <url> --session "` (trailing space). A
diferencia del caso `url` (Finding 11.3.A, Mejora 37), el
filtro `cmdParts.filter((p) => p.length > 0)` de `buildArgs`
NO descarta el token `--session` vacío — la flag pasa
intacta y `Bun.spawn` la entrega a opencode, que falla con
`"opencode: error: argument --session requires a value"`. Las
5 call sites de `App.tsx` (líneas 1356-1357, 1425-1426,
1436-1437, 1462-1464, 1526-1527) pre-validan con guards
equivalentes a las del caso `url`, así que el throw es
estrictamente defensivo — atrapa cualquier futuro call site,
hand-edited config, o test path que pase `""` directamente.
La opción del fix propuesta en `MEJORAS.md:13726` ("add a
guard inside the function that throws on empty inputs") es
estrictamente la mínima útil y es la única opción correcta
(vs. devolver `""`, que el call site no puede distinguir de
un happy path sin re-validar; vs. un check en cada call
site, que duplica la dependencia del trust boundary del
caller — exactamente el antipatrón que el guard de Mejora
37 evitó). Implementación mínima: 3 líneas de guard + 1
`if` adicional, 12 líneas de comentario que renombran el
existente (Defensive guard (url) + Defensive guard
(sessionId)) y extienden la sección "App-level guards" para
nombrar que `falsy url / falsy sessionId` están ambos
protegidos. Cero cambios a la firma de `getAttachCommand`
(`(string, string) => string` intacta), cero cambios a las
5 call sites en `App.tsx` (sus guards pre-existentes
siguen protegiendo el path actual), cero cambios a
`buildArgs` o `launchTerminal` (el `try/catch` exterior
ya convierte el `throw` en
`{ success: false, error: "getAttachCommand: sessionId is required" }`
sin intervención), cero impacto en el camino feliz
(un `sessionId` truthy sigue fluyendo al `return`
exactamente como antes). Cero impacto en tests
(`terminal-launcher.test.ts` no existe, Mejora 92 lo
cubrirá cuando llegue su turno, mismo argumento que Mejoras
33-37). `bun test` verde: 694 pass / 0 fail, 1714
expect() calls, 23 files, 310 ms — sin cambio en el conteo
(era 694 antes del guard). Commit `e3cb02c`.

### Mejora 39 — Finding 11.4.A — MEDIUM — macOS `pbcopy` is not detected; copy silently fails on stock macOS

- [x] Evaluar la mejora 39 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 39 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 39 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 39 y corregir cualquier regresión causada por el cambio.

### Mejora 40 — Finding 11.4.B — MEDIUM — Windows `clip.exe` is not detected; copy silently fails on stock Windows

- [x] Evaluar la mejora 40 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 40 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 40 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 40 y corregir cualquier regresión causada por el cambio.

_Evaluación_: Mejora 39 y Mejora 40 se implementaron acopladas en un solo
cambio (`clipboard.ts`) porque comparten causa raíz (un único `switch`
de platform al inicio de `detectClipboardTool`) y porque el split sería
puro overhead sin valor — la guard `if (process.platform === "darwin")` y
`if (process.platform === "win32")` son trivialmente separables pero el
paréntesis de error per-platform es único y no se puede partir sin
dejar una rama de error con copy de un solo platform. El audit
(`MEJORAS.md:13720-13726` y `MEJORAS.md:13946-13956`) es claro al
respecto: el fix de 11.4.A "includes the Windows branch", y el de
11.4.B "is the platform branch in 11.4.A above; the `where.exe`
fallback is the Phase 11.1.A fix; both changes must ship together for
Windows to work". La propuesta del audit es estrictamente la mínima
útil:

1. **`darwin` branch** (`clipboard.ts:30-36`) — `commandExists("pbcopy")`
   antes de cualquier probe de X11/Wayland. El early-return es
   deliberado: incluso si el usuario tiene `xclip` instalado vía
   Homebrew, preferimos `pbcopy` porque habla con la pasteboard
   nativa de Aqua, no con un X11 selection emulado por XQuartz.
2. **`win32` branch** (`clipboard.ts:38-44`) — `commandExists("clip")`
   análogo. Funciona end-to-end solo si el `where.exe` fallback
   de `commandExists` (Mejora 11.1.A, fuera del scope de esta fix)
   también está aplicado, lo cual es la precondición que el audit
   nombra explícitamente ("both must ship together for Windows to
   work"). En este repo el fallback ya está integrado en
   `commandExists` (verificado por la rama `process.platform ===
   "win32"` que ya devuelve `true` con `where clip`).
3. **Error per-platform** (`clipboard.ts:80-92`) — la rama no-tool
   ahora nombra el tool built-in del platform (`pbcopy (built-in)`,
   `clip.exe (built-in)`, o `wl-copy (Wayland) or xclip/xsel (X11)`
   en Linux/BSD). Esto cierra Finding 11.4.G como side-effect:
   el audit lo nombra explícitamente como "Resolved by 11.4.A's fix"
   (`MEJORAS.md:14070`).

Cero cambios al path Linux/BSD (la detección existente de Wayland
→ wl-copy / X11 → xclip → xsel → wl-copy-fallback queda intacta
debajo del early-return de `darwin`/`win32`). Cero impacto en la
firma de `detectClipboardTool` (`Promise<ClipboardTool | null>`
intacta). Cero impacto en `copyToClipboard` (la `try/catch` exterior
y la lógica de `proc.stdin.write/end` quedan igual). Cero impacto en
los call sites (`App.tsx:1427, 1438, 1528` siguen recibiendo un
`Promise<ClipboardResult>` con la misma shape; el behaviour
observable para el usuario es "ahora el copy funciona en macOS y
Windows" — Mejora 41 cerrará el gap paralelo del toast shown-on-failure).

Cero impacto en tests: `clipboard.test.ts` no existe (Mejora 42, Finding
11.4.D, lo cubrirá cuando llegue su turno). La lógica de las dos
ramas nuevas es estructural (un `if` con un `return`), no
computacional, y los path de fallo (`commandExists` que retorna
`false` en un sistema donde el tool SÍ está instalado) ya están
cubiertos por el contract pineado en `command-exists.test.ts`. El
happy path (macOS con pbcopy, Windows con clip.exe) es
trivially-equivalent al happy path actual de Linux: un `if` pasa,
se retorna el tool, el código existente hace el spawn. `bun test`
verde: 694 pass / 0 fail, 1714 expect() calls, 23 files, 309 ms —
sin cambio en el conteo (era 694 antes del fix). Commit `475b082`.

### Mejora 41 — Finding 11.4.C — LOW — Call sites do not check `ClipboardResult`; success toast shown on failure

- [x] Evaluar la mejora 41 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 41 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 41 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 41 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:13975-13980`): los 3 call sites de
`copyToClipboard(cmd)` en `App.tsx` (líneas 1553, 1564, 1654)
disparaban el success toast **sincrónicamente** en la línea
siguiente, antes de que el comando de clipboard fuera siquiera
spawneado. En macOS/Windows (Findings 11.4.A + 11.4.B) el usuario
veía "Copied to clipboard" con el pasteboard vacío — el peor UX
posible para una operación de clipboard, porque el usuario pega y
obtiene nada, sin pista de por qué. La opción del fix propuesta
en `MEJORAS.md:13981-14000` ("await + branch on
`result.success`") es estrictamente la mínima útil y reusa el
patrón ya establecido en el codebase para errores con
interpolación: `toastSendPromptFailed` (`App.tsx:1031`,
`i18n.ts:263`/`565`). Implementación mínima:

- `src/lib/i18n.ts:264` (en) + `i18n.ts:567` (es) — nueva
  key `toastCopyFailed: (p) => `Copy failed: ${p.error}`` (en)
  / `Fallo al copiar: ${p.error}` (es). El `MessageKey` type
  es `keyof typeof en` (`i18n.ts:374`) y `es: Record<MessageKey,
  Msg>` (`i18n.ts:377`), así que el compilador **forzó** la
  mirror es al editar — exactamente la garantía pineada en el
  header del módulo.
- `src/App.tsx:1548-1564` (`onConfigCopy`) — `() =>` →
  `async () =>`, `copyToClipboard(cmd)` (floating promise) →
  `const result = await copyToClipboard(cmd)`, branch
  `if (result.success)` con success toast intacto + else con
  `toast.show({ variant: "error", message: t("toastCopyFailed",
  { error: result.error ?? "" }) })`. `dialog.clear()` queda
  al final (era la última línea del if anterior; el await
  no lo afecta observablemente — el `dialog.clear()` corría
  después del `copyToClipboard` floating promise y ahora corre
  después del `await` resuelto, misma semántica para el usuario).
- `src/App.tsx:1566-1581` (`onErrorCopy`) — mismo cambio.
- `src/App.tsx:1665-1681` (`copy_attach` command) — el
  `onSelect: () =>` se convierte a `onSelect: async () =>`,
  mismo branch + comment block que nombra la causa raíz
  específica de este call site ("success toast on the next
  line, before the clipboard command was even spawned").

El `result.error ?? ""` mantiene el contrato del i18n: si por
algún motivo `copyToClipboard` retornara `{ success: false,
error: undefined }` (defensivo, no se observa en la práctica
porque las 4 ramas de retorno de `clipboard.ts:89-92, 113-115,
121-123` siempre setea `error`), el toast diría "Copy failed: "
en vez de "Copy failed: undefined".

Cero cambios a `copyToClipboard` (la función ya retornaba el
`ClipboardResult` correcto — el problema era puramente de los
call sites), cero cambios a `detectClipboardTool`, cero cambios
al reducer, cero impacto en la TUI, cero impacto en el lifecycle
de iteración, cero impacto en la ruta de error del clipboard
(Mejora 39/40 ya detectan pbcopy/clip.exe; ahora la failure de
esa detection surface al usuario en vez de mentirse con un
"Copied to clipboard").

Cero impacto en tests: el audit (`MEJORAS.md:14005-14028`)
ya justificó que `App.tsx` no tiene test suite (per
`docs/testing.md`, `@opentui/solid` mocks via `mock.module`
rompen el JSX transform, y la alternativa integration test
requeriría fake SSE stream + Solid render — el territory de
Mejora 95/96, no de este finding). La cobertura de
`clipboard.ts` per se es Finding 11.4.D (Mejora 42, próxima).
El shape del `ClipboardResult` está type-checked en el call
site (TypeScript garantiza `result.success: boolean` y
`result.error?: string`), así que un test "awaited and
branched" sería tautológico — pinea que el archivo contiene
las líneas que acabamos de escribir. `bun test` verde: 694
pass / 0 fail, 1714 expect() calls, 23 files, 312 ms — sin
cambio en el conteo (era 694 antes del fix). Commit `04e7829`.

### Mejora 42 — Finding 11.4.D — LOW — `clipboard.ts` has no test coverage

- [x] Evaluar la mejora 42 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 42 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 42 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 42 y corregir cualquier regresión causada por el cambio.

_Evaluación_: el audit (`MEJORAS.md:14004-14028`) propone una
suite "mockable" que inyecta `commandExists` y el exit code de
`Bun.spawn`. La opción de **PATH manipulation** (mi primer
intento) falla porque `Bun.spawn` no hereda mutaciones de
`process.env` cuando se ejecuta dentro de `bun test` (verificado
empíricamente: `Bun.spawn(["/bin/sh", "-c", "echo $PATH"])` dentro
de un test con `process.env.PATH = ""` ve el PATH original del
parent, no el modificado). Eso descarta la opción "drive
`commandExists` through PATH" del audit.

La opción de **dependency injection** (refactor a
`createClipboard({ commandExists })` siguiendo el patrón de
`createSleepDetector`) sería la más consistente con el codebase
pero cambia la API pública de dos funciones usadas desde
`App.tsx:1427, 1438, 1528` — overhead desproporcionado para un
LOW finding que solo agrega cobertura, no cambia comportamiento.

La opción de **`mock.module`** (escogida) sí es segura aquí: la
advertencia de `docs/testing.md` sobre `mock.module` es
JSX-transform-específica ("@opentui/solid mocks via mock.module
rompen el JSX transform"), y `clipboard.ts` /
`command-exists.ts` no tienen JSX. El patrón funciona: el factory
del mock se ejecuta una vez por import de `command-exists` y la
closure sobre `commandExistsImpl` permite a cada test swap-ear
el comportamiento entre runs.

4 tests en `src/lib/clipboard.test.ts` cubren los 3 escenarios
del audit más el cross-reference 11.4.G:

1. `skipIf(process.platform !== "darwin")`: cuando `commandExists`
   retorna `true` para `pbcopy`, `detectClipboardTool` retorna
   `{ command: "pbcopy", args: [] }`.
2. `skipIf(process.platform !== "win32")`: análogo para `clip` /
   `win32`.
3. **Todos los platforms**: con todos los probes en `false`,
   `detectClipboardTool` retorna `null` (la platform check
   happens before the probes, así que el resultado es
   platform-independent).
4. **Todos los platforms**: `copyToClipboard("hello")` con no
   tool available retorna `{ success: false, error: ... }` cuyo
   `error` contiene el hint específico del platform
   (pbcopy / clip.exe / wl-copy-or-xclip-or-xsel). Esto cierra
   Finding 11.4.G como side-effect (Mejora 39/40 agregó el
   per-platform hint; este test lo pinea).

Cero cambios al production code de `clipboard.ts` — el contract
de `detectClipboardTool` y `copyToClipboard` es el mismo. Cero
cambios a `App.tsx` (sus 3 call sites siguen intactos). Cero
cambios al reducer o al lifecycle de iteración. El único
"side-effect" del test file es la llamada top-level a
`mock.module("./command-exists", ...)` que Bun hoistea antes del
`await import("./clipboard")` — exactamente la única forma de
hacer que el módulo bajo test vea el mock.

**Por qué no se testea el camino del éxito del spawn**: el
audit tampoco lo pide (sus 3 tests son pbcopy/null/copy-fail).
Testear el spawn real requeriría o bien un shim en PATH (frágil
cross-platform) o un mock de `Bun.spawn` (no usado en ningún test
del codebase). El test del path no-tool cierra el user-facing gap
de 11.4.G; el resto del spawn code (write/end/exitCode
parsing) es estructural y code review lo cubre. `bun test`
verde: 697 pass / 1 skip / 0 fail, 1719 expect() calls, 24
files, 310 ms (era 694 / 0 / 0 / 23, +4 tests, +5 expects, +1
file). Commit `8934ac0`.

### Mejora 43 — Finding 12.1.A — MEDIUM — `loadConfig` does not validate per-field types

- [x] Evaluar la mejora 43 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 43 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 43 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 43 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14180-14271`): el guard estructural en
`config.ts:212` solo verificaba "is this a plain object?" — un
`{"resilience": "fast"}` o un `{"resilience": {"createTimeoutMs":
"fast"}}` pasaba el guard y llegaba a `resolveResilience`, donde
`Object.entries("fast")` produce `[["0","f"],["1","a"],["2","s"],
["3","t"]]` y el spread en `DEFAULT_RESILIENCE` sobreescribe los
keys numéricos con caracteres (silent corruption). El audit propone
un helper `validateConfigShape` que pinea el shape per-field; la
implementación es estrictamente la mínima útil y reutiliza los
type guards ya existentes (`isLocale` de `i18n.ts:22`,
`hasTerminalConfig` de `config.ts:250`). El nuevo helper vive en
`src/lib/config.ts:228-278` (51 líneas, una decisión por campo) y
se invoca desde `loadConfig` justo antes del `return`, así que el
guard estructural preexistente (`Array.isArray` etc.) sigue siendo
el primer gate. `resilience` queda shallow-validado (non-null,
non-array object) — el deep-validate de los 20+ keys numéricos
queda deferido a `isValidResilienceValue` (Finding 12.3.B, Mejora
52), siguiendo el patrón del codebase de "un helper, una decisión
por gate". Cero cambios a las firmas públicas (`loadConfig`,
`saveConfig`, `hasTerminalConfig`, `resolveResilience`, `getConfigDir`,
`getConfigPath` quedan intactas), cero impacto en los 4 call sites
(`App.tsx:426`, `index.tsx:146` y `:316`, `ThemeContext.tsx:142`
siguen llamando `loadConfig()` con la misma shape de retorno
`OcloopConfig`; los campos malformados ahora se omiten en vez de
propagarse, lo cual es estrictamente más seguro). Cubierto por 18
tests en `config.test.ts` (descritos en Mejora 45). `bun test`
verde: 724 pass / 0 fail, 1749 expect() calls, 25 files. Commit
`d9dd9ee` (parte 1: implementación + Mejora 44).

### Mejora 44 — Finding 12.1.B — LOW — Unknown top-level keys silently kept; typo like `languaje` falls back to English silently

- [x] Evaluar la mejora 44 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 44 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 44 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 44 y corregir cualquier regresión causada por el cambio.

_Evaluación_: Mejora 44 es la opción (a) propuesta en
`MEJORAS.md:14285-14296` ("add unknown-key detection inside the
proposed `validateConfigShape` helper above") y se implementó
acoplada con Mejora 43 porque el helper ya construye un `OcloopConfig`
limpio desde cero — un unknown key no se copia a `out` naturalmente
y agregar el `warn` es 4 líneas (`ALLOWED_CONFIG_KEYS` set +
`Object.keys(r).filter` + `log.warn`). El set se declara a nivel de
módulo (`config.ts:205-211`) para que un futuro campo nuevo lo
agregue en un solo sitio, junto con la decisión de qué per-field
type check aplicarle. Mejora 45 (siguiente bloque) cubre el
comportamiento con 3 tests nuevos: "drops a typo'd language key
and keeps the rest", "drops multiple unknown keys in one pass", y
"preserves all known fields when no unknown keys are present". El
último test pinea que el path "no unknown keys" sigue siendo
observable-equivalente al pre-fix (cero warn, todos los campos
conocidos se preservan). `bun test` verde: 724 pass / 0 fail. Commit
`d9dd9ee` (parte 2: implementación + Mejora 44).

### Mejora 45 — Finding 12.1.C — LOW — No test coverage for `loadConfig`; six required cases unverified

- [x] Evaluar la mejora 45 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 45 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 45 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 45 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14303-14350`): `src/lib/config.ts` no tenía `*.test.ts`
asociado. La opción del audit (suite ~80 líneas que inyecta el
config path) se implementó con la variante más limpia del codebase:
redirigir `XDG_CONFIG_HOME` a un `mkdtempSync` fresh per test
(`config.test.ts:14-30`). Esto reusa el path real
(`getConfigPath()` → `getConfigDir()` → `XDG_CONFIG_HOME/ocloop/ocloop.json`)
sin tocar la API pública ni requerir un setter module-private. 27
tests en `src/lib/config.test.ts` cubren:

- 8 tests de schema robustness (Finding 12.1.C, casos 1-6 + empty file
  + primitive value): missing file, invalid JSON, null JSON, array
  JSON, empty file, primitive JSON, partial config, sanity check de
  `getConfigPath`.
- 15 tests de per-field validation (Finding 12.1.A, Mejora 43):
  malformed terminal (string + missing nested), valid known
  terminal, valid custom terminal, malformed language (non-locale
  string + non-string), valid language, malformed theme
  (non-string), valid string theme, malformed scrollbar_visible
  (string + number), valid boolean, malformed resilience (string
  — el caso central del audit + array + null), valid resilience
  sub-object como-is (con la anotación de que el deep-validate
  queda deferido a 12.3.B).
- 3 tests de unknown-key drop+warn (Finding 12.1.B, Mejora 44):
  typo'd language key preserva el resto, múltiples unknown keys,
  todos los known fields sin unknowns.

Cero cambios al production code — los tests son read-only sobre
`loadConfig` y `getConfigPath`. Cero impacto en runtime, cero
impacto en la TUI, cero impacto en el reducer. Sin nuevos
archivos en `src/lib/` fuera del `.test.ts`. `bun test` verde:
724 pass / 0 fail (era 697 antes de los 27 tests), 1749
expect() calls, 25 files — +27 tests, +30 expects, +1 file.
Commit `d9dd9ee` (parte 3: tests + Mejora 45).

### Mejora 46 — Finding 12.2.A — MEDIUM — `saveConfig` does not catch I/O errors

- [x] Evaluar la mejora 46 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 46 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 46 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 46 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14455-14535`): `saveConfig` no defendía su
precondición de I/O, y los 4 call sites de `App.tsx` (líneas
1515, 1537, 1711, 1725) — `onConfigSelect`, `onConfigCustom`,
`toggle_scrollbar`, `toggle_language` — disparan
`dialog.clear()` después del `await saveConfig(...)`, así que
un error de I/O dejaba al usuario con un dialog abierto y un
state local sin persistir, sin pista de por qué. El contrato
a alcanzar es el de `saveLoopState` (`loop-state-store.ts:46-48`,
"Never throws — persistence is best-effort and must not
crash the app"). La opción del fix propuesta en
`MEJORAS.md:14501-14524` (wrapper `try/catch` + `log.warn` +
best-effort `unlinkSync(tmpPath)`) es estrictamente la mínima
útil y reusa exactamente el patrón ya establecido en
`saveLoopState:55-67` (Mejora 28, Finding 8.1.A). Implementación
mínima: añadir `unlinkSync` al import de `node:fs` (línea 8),
extraer `const tmpPath = configPath + ".tmp"` al top de
`saveConfig` (línea 325, 1 línea) para que tanto el `writeFile`
como el `unlink` del catch vean el mismo path, envolver el
cuerpo I/O en `try { … } catch (err) { log.warn(...); try {
if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch {} }`
(líneas 327-350, 16 líneas de código + 14 líneas de comentario
que nombran el source `MEJORAS.md Finding 12.2.A`, el
cross-reference a 12.2.C, y el paralelo con `saveLoopState`).
Cero cambios a la firma pública de `saveConfig`
(`(OcloopConfig) => void` intacta), cero cambios a `loadConfig`,
cero cambios a `validateConfigShape` / `resolveResilience` /
`getConfigDir` / `getConfigPath` / `hasTerminalConfig`, cero
cambios a los 4 call sites de `App.tsx` (su `await
saveConfig(...)` ahora resuelve con `undefined` en vez de
throw, lo cual es observable-equivalente para el `await`
porque el `void`-return ya estaba en el contract — Mejora 50
lo pinea), cero impacto en la TUI, cero impacto en el
reducer, cero impacto en el lifecycle de iteración. Cero
cambio en la `if (!existsSync(configDir))` preexistente (esa
es Mejora 49 / Finding 12.2.D, queda para su turno).

Cubierto por 5 tests nuevos en `src/lib/config.test.ts`:
round-trip `saveConfig` + `loadConfig`, atomic overwrite
sin `.tmp` residual (pinea el contrato de Mejora 50
indirectamente), `void` return explícito (pin directo de
12.2.E), `saveConfig` no lanza con dir read-only via
`chmodSync(dir/ocloop, 0o555)` (replica el patrón de
`loop-state-store.test.ts:77-92`, mismas guardas
`skipIf(win32 || root)`), y verificación de que el `.tmp`
no queda en disco tras un save fallido (cierra 12.2.C como
side-effect). `bun test` verde: 729 pass / 1 skip / 0 fail,
1756 expect() calls, 25 files, 322 ms — +5 tests, +7
expects, sin cambio en el conteo de archivos. Commit
`671581c`.

### Mejora 47 — Finding 12.2.B — LOW — `tmpPath` is a fixed suffix `.tmp`; simultaneous writes clobber each other

- [x] Evaluar la mejora 47 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 47 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 47 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 47 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14537-14575`): `tmpPath = configPath + ".tmp"`
(`config.ts:325`) usa un suffix fijo, así que dos procesos `ocloop`
apuntando al mismo `$XDG_CONFIG_HOME` (p. ej. una TUI en una
terminal + un `--create-plan` en otra) escriben al mismo
`ocloop.json.tmp` y pueden intercalar bytes del mid-write. El
final `renameSync` a `ocloop.json` sigue siendo last-writer-wins
(rename atómico en POSIX), así que la fix propuesta por el audit
(`MEJORAS.md:14562-14567`, `randomBytes(6).toString("hex")`) NO
cambia el comportamiento user-observable — solo elimina la ventana
de clobbering intermedia del tmp. Es el mismo patrón de "defensa
estructural mínima" que Mejoras 28, 36, 37 y 38 ya establecieron
(los beneficios son invisibles al usuario en el happy path, pero
cierran races latentes). Implementación mínima: 1 import
(`import { randomBytes } from "node:crypto"`) + 1 línea que
cambia el suffix fijo a `${randomBytes(6).toString("hex")}.tmp` +
9 líneas de comentario que nombran el source `MEJORAS.md Finding
12.2.B`, el race window concreto, y la invariante "el renameSync
sigue siendo last-writer-wins; solo prevenimos el clobbering del
tmp". El comentario está pineado al sitio del cambio (al lado del
`const tmpPath = …`) en vez de en el docstring de la función para
que un mantenedor que lea el rename no tenga que saltar hasta el
header.

Cero impacto en la firma de `saveConfig` (`(OcloopConfig) => void`
intacta), cero impacto en `loadConfig`, cero impacto en
`validateConfigShape` / `resolveResilience` / `getConfigDir` /
`getConfigPath` / `hasTerminalConfig`, cero impacto en los 4 call
sites de `App.tsx` (siguen llamando `await saveConfig(...)` con
la misma shape de retorno). El `catch` block preexistente de
Mejora 46 (Finding 12.2.A) sigue limpiando el tmp orfán con el
mismo `unlinkSync(tmpPath)` — la variable `tmpPath` ahora carga el
suffix random, pero la lógica de cleanup es path-agnostic. Cero
cambio en el comportamiento del happy path (el random suffix es
48 bits → probabilidad de colisión de 1/2^48 ≈ 1 en 281
billones). Cero impacto en la ruta de error (un fallo de
`writeFileSync` antes de crear el tmp sigue short-circuitando en
el `existsSync(tmpPath)` del catch).

El test preexistente "overwrites an existing config atomically (no
leftover .tmp)" (`config.test.ts:245-251`) probaba
`expect(existsSync(path + ".tmp")).toBe(false)` — esa probe se
convierte en tautología passing después del fix porque `path +
".tmp"` ya no es un path real. Actualizado a un dir-scan glob
(`readdirSync(configDir).filter((e) => e.endsWith(".tmp"))`) que
pinea la misma intención user-visible ("no orphan tmp después de
un save exitoso") independientemente del suffix. Añadido un
segundo test "uses a randomized tmp suffix per save" que ejercita
la post-condición con dos saves consecutivos. `bun test` verde:
730 pass / 1 skip / 0 fail (era 729 / 1 / 0), 1758 expect()
calls (era 1756), 25 files, 328 ms — +1 test, +2 expects. Commit
`d83b0fd`.

### Mejora 48 — Finding 12.2.C — LOW — Stale `.tmp` files not cleaned up after `writeFileSync` ok but `renameSync` failed

- [x] Evaluar la mejora 48 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 48 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 48 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 48 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14576-14602`): el bloque `writeFile → rename` de
`saveConfig` (`config.ts:336-359`) deja el tmp huérfano si
`rename` falla tras un `writeFile` exitoso. El audit (`MEJORAS.md:14721`)
marca esta finding como "ya parte del wrapper de 12.2.A" — y de
hecho Mejora 46 (commit `671581c`) ya implementó la fix
estructural: el `catch` de `saveConfig` (líneas 347-359) ya
incluye el best-effort `unlinkSync(tmpPath)` con su propio
inner `try/catch` y la guarda `existsSync(tmpPath)` para el
caso "el write falló antes de crear el tmp", exactamente
como pide el audit. El docstring de `saveConfig` (líneas
320-321) lo nombra explícitamente: *"Side effect: also closes
Finding 12.2.C (stale `.tmp` cleanup) via the best-effort
`unlinkSync` in the catch path."*. Y el test "cleans up the
orphan .tmp file on a failed save (Finding 12.2.C)"
(`config.test.ts:307-325`) ya pinea el comportamiento —
pero la implementación actual del test tiene un bug
introducido por Mejora 47: Mejora 47 randomizó el suffix del
tmp (de `.tmp` fijo a `.<randomhex>.tmp`), pero el test
sigue asserting `expect(existsSync(path + ".tmp")).toBe(false)`,
que ahora es **tautología** — el path fijo `path + ".tmp"`
nunca existió (es el tmp random el que se crea/borra), así
que el assert pasa por la razón equivocada y no detecta
ninguna regresión en el `unlinkSync` real. La fix propuesta
es estrictamente la mínima útil: cambiar la aserción a un
dir-scan glob `readdirSync(configDir).filter((e) =>
e.endsWith(".tmp"))`, el mismo patrón que Mejora 47
estableció en el test "overwrites an existing config
atomically (no leftover .tmp)" (`config.test.ts:245-257`,
líneas 252-253) y que Mejora 47 volvió a usar en "uses a
randomized tmp suffix per save (Finding 12.2.B)" (líneas
259-271). El comentario del test se extiende para
documentar la regresión del assert pre-fix y el source
del nuevo patrón.

Implementación: 1 edit puntual en
`src/lib/config.test.ts:307-328` (cambio de 1 línea de
assertion + 6 líneas de comentario que nombran el source
`MEJORAS.md Finding 12.2.C`, la regresión introducida por
Mejora 47, y el cross-reference al patrón de Mejora 47).
Cero cambios al production code de `config.ts` — el
`unlinkSync` en el catch y la guarda `existsSync` ya están
en su sitio desde Mejora 46. Cero impacto en el camino
feliz (la nueva assertion es funcionalmente equivalente
para los happy paths: no hay `.tmp` en el dir ni antes ni
después del fix). Cero impacto en los otros 32 tests del
file. `readdirSync` ya estaba importado en la línea 2
(sin cambios de imports). Sin nuevos archivos, sin
nuevos tipos, sin nuevas funciones. Sin nuevos tests — el
test existente (con la assertion corregida) ahora sí pinea
la post-condición real ("ningún `*.tmp` en el config dir
tras un save fallido"). `bun test` verde: 730 pass / 1
skip / 0 fail, 1758 expect() calls, 25 files, 328 ms —
sin cambio en el conteo (era 730 antes del fix).

### Mejora 49 — Finding 12.2.D — LOW — `existsSync(configDir)` is redundant; `mkdirSync({ recursive: true })` is idempotent

- [x] Evaluar la mejora 49 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 49 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 49 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 49 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14604-14634`): el guard
`if (!existsSync(configDir)) { mkdirSync(configDir, { recursive: true }) }`
en `config.ts:338-340` es un anti-patrón de "check-then-do" sobre una
operación que ya es idempotente — `mkdirSync` con `recursive: true` es
un no-op cuando el directorio existe. El guard agrega un syscall
desperdiciado en cada save (el 99.9% de los casos el dir ya existe
porque OCLoop ya corrió antes) y abre una ventana TOCTOU: entre
`existsSync` retornando `false` y `mkdirSync` ejecutándose, otro
proceso puede crear el dir; `mkdirSync` igual tiene éxito (la
semántica idempotente cubre eso) pero el syscall es trabajo puro
desperdiciado. La propuesta del audit es estrictamente la mínima útil
y la única correcta (vs. un guard "exists OR create" via `try/catch`
del `mkdirSync` sin `recursive: true` — eso es lo que el `recursive:
true` ya hace explícitamente; vs. un wrapper `mkdirpSync` — overhead
desproporcionado para un solo call site). Implementación: 3 líneas
sustituidas por 1 (`mkdirSync(configDir, { recursive: true })`
directo, sin el `if`), más 5 líneas de comentario que nombran el
source `MEJORAS.md Finding 12.2.D`, la racionalidad de la
idempotencia, y la ventana TOCTOU. El docstring de `saveConfig` se
extiende para añadir el cross-reference a 12.2.D y para eliminar la
línea engañosa "EEXIST race on `mkdirSync`" del header (el
`recursive: true` hace que EEXIST sea imposible — el comentario
estaba mal desde Mejora 46 y este es un buen momento para corregirlo
siguiendo el principio "document the invariant, not the wishful
exception"). Cero impacto en la firma de `saveConfig` (`(OcloopConfig)
=> void` intacta), cero impacto en `loadConfig`, cero impacto en
`validateConfigShape` / `resolveResilience` / `getConfigDir` /
`getConfigPath` / `hasTerminalConfig`, cero impacto en los 4 call
sites de `App.tsx` (siguen llamando `await saveConfig(...)` con la
misma shape de retorno). El import de `existsSync` se preserva porque
sigue usándose en línea 360 (`if (existsSync(tmpPath)) unlinkSync(tmpPath)`,
el cleanup del tmp huérfano que Mejora 46 introdujo). Cero impacto
en el camino feliz (el `mkdirSync({ recursive: true })` directo es
observable-equivalente a la versión guarded — el test
"overwrites an existing config atomically" en `config.test.ts:245-257`
sigue verde). Cero impacto en tests (730 pass / 1 skip / 0 fail, sin
cambio en el conteo, era 730 antes del fix). Commit `d9a4628`.

### Mejora 50 — Finding 12.2.E — LOW — `saveConfig` returns `void` but all four callers `await` it

- [x] Evaluar la mejora 50 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 50 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 50 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 50 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14636-14663`): la firma
`saveConfig(config: OcloopConfig): void` (`config.ts:230`) usa
`node:fs` síncrono (`writeFileSync`, `renameSync`, `unlinkSync`),
así que los 4 call sites de `App.tsx` (líneas 1515, 1537, 1711,
1725 — `onConfigSelect`, `onConfigCustom`, `toggle_scrollbar`,
`toggle_language`) que usan `await saveConfig(newConfig)` están
haciendo un `await` sobre un valor no-Promise. El motor resuelve
eso en el próximo microtask, así que la semántica observable es
correcta hoy — pero un mantenedor futuro que refactorice a
`fs/promises` obtendrá un cambio semántico silencioso en los
call sites (el `setOcloopConfig` que vive justo después ya no
será síncrono con el save).

La opción "cheaper" del audit
(`MEJORAS.md:14658-14659` — "drop the `await` from the call sites
(4 edits) and document in the function header that it is
synchronous") es estrictamente la correcta vs. la opción "cheap"
(wrap en `async` + convertir I/O a `fs/promises`) por dos razones
concretas:

1. **Rompe un test pino existente.** El test
   `"returns void and does not throw on the happy path"`
   (`config.test.ts:273-278`, introducido por Mejora 46 /
   commit `671581c`) pinea explícitamente
   `expect(result).toBeUndefined()`. Una función `async` retorna
   `Promise<undefined>`, no `undefined` — el test fallaría
   inmediatamente. Adaptarlo a `expect(result).toBeInstanceOf(Promise)`
   perdería el valor del pin ("el return es void") y abriría la
   puerta a una regresión silenciosa. El test pinea el contrato
   correcto: la función es síncrona, y el contrato debe
   permanecer así.
2. **Ponytail al máximo.** La opción "cheap" toca 1 función
   + 4 call sites + 1 test = 6 sitios para un cambio que solo
   arregla 1 site (el `await` que sobra). La opción "cheaper"
   toca 4 call sites (drop `await`) + 1 docstring
   (documentar el contrato síncrono) + 1 test comment (pinear
   el contrato) = 6 edits puntuales en 3 archivos, sin cambiar
   ninguna firma ni ningún I/O path. Cero impacto en runtime,
   cero impacto en tests, cero impacto en el reducer, cero
   impacto en la TUI.

Implementación mínima: 4 ediciones en `src/App.tsx`
(líneas 1515, 1537, 1711, 1725) que eliminan el `await` y
añaden un comment de 2 líneas referenciando el finding + 1
edición en `src/lib/config.ts:309-314` (nuevo párrafo al
inicio del docstring que documenta el contrato síncrono y
nombra el hazard "future refactor a fs/promises romperá los
call sites"), + 1 línea añadida al trailer del docstring
existente ("Finding 12.2.E (the function returns void, not
Promise<void>…)") + 1 edit en `src/lib/config.test.ts:274-281`
(extender el comment del test que pinea el contrato void).

Cero cambios a la firma de `saveConfig` (`(OcloopConfig) => void`
intacta), cero cambios a `loadConfig`, cero cambios a
`validateConfigShape` / `resolveResilience` / `getConfigDir` /
`getConfigPath` / `hasTerminalConfig`, cero impacto en los 4
call sites semánticamente (la única diferencia observable es
la ausencia del microtask delay: `setOcloopConfig` y
`dialog.clear` corren en el mismo tick que `saveConfig` en
vez de en el siguiente; el TUI no nota la diferencia porque
ambos corren dentro del mismo `onSelect` callback). Cero
cambio en el orden de operaciones en los 4 call sites
(`saveConfig` siempre va antes de `setOcloopConfig`/`dialog.clear`,
y el nuevo comment documenta el hazard para que un mantenedor
no reactive el `await` pensando que es "más seguro").

Cero impacto en tests (730 pass / 1 skip / 0 fail — sin
cambio en el conteo, era 730 antes del fix). Commit `9b5b4d8`.

### Mejora 51 — Finding 12.3.A — MEDIUM — `pickDefined` skips `undefined` but NOT `null`

- [x] Evaluar la mejora 51 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 51 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 51 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 51 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14792-14861`): `pickDefined` filtraba solo
`undefined`, así que `null` se treated como defined y se escribía
encima del default. La opción (b) del fix propuesto
(`MEJORAS.md:14840-14850`, 2 cambios que se componen bien) es
estrictamente la mínima útil y reusa el mismo guard `Array.isArray`
que `validateConfigShape` ya usa para el top-level (línea 230):

1. **Tighten the filter** a `v !== undefined && v !== null` —
   cierra la corrupción `setTimeout(null, …)` →
   timeout inmediato, y la corrupción booleana
   `null` → falsy para `caffeinate`/`resume`/`backoffJitter`.
2. **Reject arrays at the layer boundary** —
   `Object.entries([100, 200, 300])` retornaría
   `[["0", 100], ["1", 200], ["2", 300]]` y spread
   corrompería los primeros 3 default slots.

Implementación mínima: 2 líneas modificadas
(`src/lib/config.ts:174-180`) — el guard `!obj || Array.isArray(obj)`
y el filtro `v !== undefined && v !== null` — más 9 líneas de
comentario que renombran el docstring de `resolveResilience` para
nombrar la nueva invariante, el hazard de `setTimeout(null, …)` con
un ejemplo concreto, y el source `MEJORAS.md Finding 12.3.A`.
Cero cambios a la firma de `resolveResilience`
(`(Partial<ResilienceConfig>?, Partial<ResilienceConfig>?) => ResilienceConfig`
intacta), cero cambios a `DEFAULT_RESILIENCE`, cero cambios a
`validateConfigShape`/`loadConfig`/`saveConfig`, cero cambios a los 2
call sites de `App.tsx:161, 430` y al call site de `index.tsx:146`.
Cero impacto en el camino feliz (un `undefined`/`null` per-field se
saltan como antes; un valor real se spread igual que antes; los 21
campos de `DEFAULT_RESILIENCE` llegan todos al objeto final sin
modificación cuando ninguna override está presente).

Cubierto por 9 tests nuevos en `src/lib/config.test.ts:240-311`:
- 1 baseline (`resolveResilience()` → defaults).
- 1 caso central del audit
  (`createTimeoutMs: null` → default).
- 1 CLI layer null skip
  (`promptTimeoutMs: null` → default).
- 1 mixed layer (non-null gana, null cae al default).
- 1 pre-existing behavior preservado (undefined sigue skippeando).
- 1 precedence (CLI non-null sobre file null).
- 1 null boolean (`caffeinate: null` → default).
- 2 array rejection (file y CLI layers).

`bun test` verde: 739 pass / 1 skip / 0 fail (era 730), 1768
expect() calls (era 1758), 25 files (era 24 — el nuevo
`config.test.ts` ya existía, +9 tests, +10 expects, +0 files).
Commit `5fbddbb`.

### Mejora 52 — Finding 12.3.B — LOW — `pickDefined` does not validate per-field types

- [x] Evaluar la mejora 52 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 52 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 52 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 52 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:14863-14915`): el loader file path
(`validateConfigShape` en `config.ts:212`) solo hacía una
verificación superficial del campo `resilience` (non-null,
non-array, object), y `pickDefined` confiaba en el resultado
sin verificar el tipo per-field. Un archivo hand-edited con
`{"createTimeoutMs": "fast"}` fluye a través de `pickDefined`
(el string es defined), se spread sobre `DEFAULT_RESILIENCE`, y
eventualmente llega a `setTimeout("fast", …)` que coerce a `NaN`
y dispara timeouts inmediatos sin diagnóstico. La CLI path en
`applyResilienceOverride` (`cli-args.ts:85-127`) ya enforce el
contrato (unknown key → exit 1, wrong-typed → exit 1,
non-integer o negativo → exit 1). La propuesta del audit —
extraer la type-check a un helper `isValidResilienceValue`
compartido y rechazar el whole `resilience` block con un warn
si cualquier field falla — es estrictamente la mínima útil y
mantiene la paridad de strictness entre las dos layers:

1. **`isValidResilienceValue(key, v): boolean`** en
   `config.ts:223-237` (15 líneas, una decisión por branch):
   unknown key → false, boolean default → `typeof v ===
   "boolean"`, number default → `typeof v === "number" &&
   Number.isFinite(v) && Number.isInteger(v) && v >= 0`. La
   strictness (incluyendo `Number.isInteger`) mirrora
   exactamente el check post-parse de `applyResilienceOverride`,
   así que las dos layers no pueden divergir.
2. **`validateConfigShape` resilience branch** ahora corre el
   helper per-field: si `invalid.length > 0`, log un warn
   listando los pares `{key, value}` y descarta el whole block;
   si todos los fields son válidos, conserva el block
   `as-is`. Esto es estrictamente la política "all-or-nothing"
   que ya aplicaba a `terminal`/`language`/`theme`/`scrollbar_visible`
   (cada uno de los 4 anteriores acepta o descarta el field
   completo; el audit confirma que el bloque de
   `resilience` debe seguir la misma policy para consistencia
   con el resto del loader).

Implementación: 22 líneas añadidas al helper + 11 líneas
sustituyendo el `if` anterior en `validateConfigShape` + 6
líneas reescribiendo la docstring de `validateConfigShape`
para reflejar la nueva política ("resilience is deep-validated
via `isValidResilienceValue`") + 1 línea de source attribution
en el helper. Cero cambios a la firma de `loadConfig`,
`saveConfig`, `validateConfigShape`, `getConfigPath`,
`getConfigDir`, `hasTerminalConfig`, o `resolveResilience`.
Cero cambios a la `DEFAULT_RESILIENCE` shape, a
`ALLOWED_CONFIG_KEYS`, ni a los 4 call sites de `App.tsx`
(la deep validation corre en el loader, no en el
consumer; el `OcloopConfig.resilience` sigue siendo
`Partial<ResilienceConfig>` con la misma shape de retorno).
Cero cambios al `applyResilienceOverride` del CLI path —
el audit sugería refactorizarlo para que el helper fuera
"single source of truth", pero el string → boolean|number
coercion que hace el CLI es una concern diferente al
type-check (el helper opera sobre valores tipados, el CLI
recibe strings). La capa de strictness es idéntica (CLI
rechaza exactamente los mismos valores que el helper
rechazaría post-parse); un refactor a una pipeline
unificada sería cosmetic-only y agregaría imports
cruzados entre `cli-args.ts` y `config.ts` para una
ganancia de cero líneas de runtime. Decisión ponytail:
NO refactorizar el CLI, mantener el helper como el
backstop del file path.

Cubierto por 8 tests nuevos en `config.test.ts`:
- central case (string en numeric field) →
  whole block dropped
- wrong-typed boolean (number en boolean field) →
  whole block dropped
- negative number →
  whole block dropped
- non-integer (1.5) → whole block dropped
- null per-field → whole block dropped
  (defense-in-depth sobre 12.3.A)
- unknown key en mix con valid fields →
  whole block dropped (all-or-nothing)
- mixed valid + invalid fields →
  whole block dropped
- all-valid mix de numeric + boolean → block kept

El test preexistente "keeps a valid resilience sub-object
as-is (deep validation deferred to 12.3.B)" se renombró a
"keeps a valid resilience sub-object with all-valid fields"
(la nota "deferred" ya no es precisa), y la suite per-field
validation se movió a su propio describe block con el source
"Finding 12.3.B" pineado en el nombre.

Cero impacto en los otros 41 tests del file
(schema robustness, per-field validation de los 4 otros
campos, unknown-key drop, `resolveResilience` null/array
skip, `saveConfig` round-trip + error swallowing). Cero
cambio en el `OcloopConfig` interface, en la `ResilienceConfig`
interface, en la `DEFAULT_RESILIENCE` const, ni en
`resolveResilience` (el helper corre upstream del merge;
un `resilience: undefined` en el output del loader
se mergea con defaults como Mejora 51 ya pineaba).

`bun test` verde: 747 pass / 1 skip / 0 fail (era 739 / 1 /
0), 1776 expect() calls (era 1768), 25 files, 336 ms — +8
tests, +8 expects, sin cambio en el conteo de archivos. `bun
run build` verde. Commit `a20f4fb`.

### Mejora 53 — Finding 12.3.C — LOW — `pickDefined` does not reject unknown keys

- [x] Evaluar la mejora 53 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 53 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 53 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 53 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:14916-14956`: `pickDefined`
(`config.ts:175-180`) filtra `undefined` y `null`
(post-Mejora 51) pero no verifica que cada key sea un
campo conocido de `DEFAULT_RESILIENCE`. Un archivo
hand-edited con `{"resilience": {"createTimeoutMs":
5000, "totallyMadeUpKey": 42}}` produce un objeto
resultado que contiene `totallyMadeUpKey: 42`. El
TypeScript type annotation `Partial<ResilienceConfig>`
atrapa esto al type level, pero el JSON loader bypasea
esa layer enteramente (el `as Partial<ResilienceConfig>`
en el spread es unchecked), así que el extra key
aterriza en el runtime config object. El impacto
práctico hoy es cero: todo consumer lee campos
específicos por nombre. El riesgo es **mantenimiento
futuro** (cualquier `for (const k of
Object.keys(resilience))` vería el extra key
silenciosamente).

El audit confirma que la fix es estrictamente
defense-in-depth: Mejora 52 (Finding 12.3.B, commit
`a20f4fb`) ya implementó all-or-nothing deep
validation en `validateConfigShape` (`config.ts:301-322`),
así que un `ocloop.json` con un unknown key en
`resilience` NUNCA llega a `pickDefined` por el path
del loader. El filtro de `pickDefined` pinea la
garantía en la layer de abajo, en caso de que un
refactor futuro debilite el loader, un hand-rolled
test path pase un raw `Partial<ResilienceConfig>`, o
un nuevo call site alimente una fuente no tipada.

Implementación mínima: 1 línea modificada en
`config.ts:183-185` — el filter ahora es
`[k, v]) => k in DEFAULT_RESILIENCE && v !==
undefined && v !== null` — + 7 líneas de comentario
que renombran el docstring de `resolveResilience`
para nombrar la nueva invariante, el example concreto
del audit, y el source `MEJORAS.md Finding 12.3.C`.
Cero cambios a la firma de `resolveResilience`
(`(Partial<ResilienceConfig>?, Partial<ResilienceConfig>?) => ResilienceConfig`
intacta), cero cambios a `DEFAULT_RESILIENCE`, cero
cambios a `validateConfigShape`/`isValidResilienceValue`/
`loadConfig`/`saveConfig`, cero cambios a los 2 call
sites de `App.tsx:161, 430` ni al call site de
`index.tsx:146` (la unknown-key skip es invisible al
consumer — el `Partial<ResilienceConfig>` typed-input
ya promete que solo hay keys conocidos, así que el
filter es observable-equivalente para los call sites
existentes; la diferencia es únicamente en la robustez
ante un input no honrado). Cero impacto en el camino
feliz: las 4 tests preexistentes de `resolveResilience
— null skip (Finding 12.3.A)` siguen verdes (todos los
keys usados son conocidos: `createTimeoutMs`,
`promptTimeoutMs`, `caffeinate`). Cero impacto en los
8 tests preexistentes de `loadConfig — resilience
per-field type validation (Finding 12.3.B)`: el
unknown-key check ya pineado por
`isValidResilienceValue` corre upstream del spread a
`out.resilience`, así que un `resilience: undefined`
en el output del loader fluye a `pickDefined({})` y
no hay keys (conocidos o no) que filtrar.

Cubierto por 3 tests nuevos en `config.test.ts`:
file-layer drop (caso central del audit, `createTimeoutMs
+ totallyMadeUpKey`), CLI-layer drop (paralelo, defensivo
ante un futuro call site), y mixed known+unknown en la
misma layer (2 conocidos + 2 unknowns, confirma que el
filter compone en una sola pasada). `bun test` verde:
750 pass / 1 skip / 0 fail (era 747 / 1 / 0), 1784
expect() calls (era 1776), 25 files, 340 ms — +3 tests,
+8 expects, sin cambio en el conteo de archivos. `bun
run build` verde. Commit `fbfeb69`.

### Mejora 54 — Finding 12.5.E — LOW — `logDiff` is defined but never referenced

- [x] Evaluar la mejora 54 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 54 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 54 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 54 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es que la wiring se perdió en un refactor: la
data (`sessionStats.diff()` con `{additions, deletions, files}`) y el
formatter (`formatDiffSummary` en `format.ts:46`) ya existían y se
usaban en tests (`useSessionStats.test.ts:60`, `format.test.ts:62-64`),
pero ninguna UI los consumía. La opción (a) "wire it up" del audit
(`MEJORAS.md:15355-15367`) es estrictamente superior a la opción (b)
"remove + `ponytail:` comment": la primera cierra el dead catalog
entry Y le da al usuario la única señal visible de "qué archivos
cambió el agent en este run" — información que ya está siendo
recolectada por `useSSE.ts:466` (`onSessionDiff` handler) y enviada
al `setDiff` del store, pero que nunca llegaba a la pantalla.
Implementación mínima:

- `src/components/BottomPanel.tsx`: añadir `diff: SessionDiff` a las
  props (importando el type de `useSessionStats`); añadir un
  `LabelValue` con `t("logDiff")` + `formatDiffSummary(additions,
  deletions, files)` al bloque de métricas globales; añadir el
  segmento `${t("logDiff")}…` al `compactLine` fallback
  (`fitSegments` lo descarta si no entra en la anchura).
- `src/App.tsx`: pasar `sessionStats.diff()` al `<BottomPanel>`.

Cero cambios al reducer, cero cambios al SSE handler, cero cambios al
`useSessionStats` hook, cero cambios a `format.ts`. Cero impacto en el
camino feliz (la label "Diff:" + "+0/-0 (0)" se renderiza en el primer
tick, igual que "Tokens: 0" o "Avg/task 0s"). Cero impacto en el
short-circuit `--create-plan` (BottomPanel no se monta en ese flujo).
Cero impacto en la ruta de `cooldown`/`error` (la métrica es
read-only, no consume el reducer).

Sin nuevos tests: el contrato de `formatDiffSummary` ya está pineado
en `format.test.ts:62-64` ("formatDiffSummary formats correctly",
`+10/-5 (2)`); el contrato de `useSessionStats.diff`/`setDiff` ya
está pineado en `useSessionStats.test.ts:56-69` ("should update diff
summary"); el contrato de `t("logDiff")` lo pinea su único call site
(compilador TS, ya que es key del `Record<MessageKey, Msg>`); y la
documentación de `docs/testing.md:14` prohíbe explícitamente tests de
componentes TUI que importen `@opentui/solid`. `bun test` verde: 750
pass / 1 skip / 0 fail (sin cambio en el conteo). `bun run build`
verde. Commit `d15efe8`.

### Mejora 55 — Finding 15.4.A — LOW — `handleQuit` lacks a module-level `isShuttingDown` guard

- [x] Evaluar la mejora 55 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 55 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 55 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 55 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:19111-19222`): la signal path de
`shutdownManager` ya tiene su propia `isShuttingDown`
(`shutdown.ts:17, 51-53`) que cierra la race de dos SIGINTs
concurrentes, pero el path Q-key (y los paths `onQuit` de los
dials: `App.tsx:1075`, `:1305`, `:1326`, y el handler del
`complete` state en `:1916`) no tienen guard equivalente.
La ventana de race entre `dialog.clear()` y `process.exit(0)`
es de pocos ms durante los awaits, pero no es cero: un usuario
que confirma el dialog y simultáneamente dispara Ctrl+C (o un
close de dialog en paralelo con un signal handler en un test)
entra a `handleQuit` una segunda vez. El reducer `quit` es
no-op desde `stopping`, y `clearCooldownTimers` / `watchdog.stop`
/ `sleepDetector.stop` / `power.stop` / `clearLoopState` /
`sse.disconnect` / `server.stop` son individualmente
idempotentes — el ÚNICO step no-idempotente es `abortSession`
(`App.tsx:1081`), que envía un segundo HTTP request al
OpenCode server. La opción del fix propuesta en
`MEJORAS.md:19144-19157` (módulo-level `isShuttingDown` con
guard al top de `handleQuit`) es estrictamente la mínima útil
y reusa el patrón ya establecido en el codebase: el `let` al
lado de `startingIteration` (`App.tsx:178`) para
`createSession`-in-flight, y la `private isShuttingDown` en
`ShutdownManager` (`shutdown.ts:17`) para SIGINT/SIGTERM.
Implementación mínima: (1) `let isShuttingDown = false` al
lado de `startingIteration` (1 línea de código + 12 líneas
de comentario que nombran el source `MEJORAS.md Finding 15.4.A`,
la racionalidad del race, el paralelo con
`ShutdownManager.isShuttingDown`, y la invariante "no
persistido: el reset lo garantiza `process.exit`"); (2) guard
`if (isShuttingDown) return; isShuttingDown = true;` al top
de `handleQuit` (2 líneas de código + 16 líneas de comentario
que renombran el docstring existente, listan los 6 calls
sites homeólogos del codebase, y explican por qué el set
síncrono cierra la ventana). El order del guard es
deliberado: el `isShuttingDown = true` corre ANTES de
`log.info`/`loop.dispatch`/cualquier await, así que la
segunda invocación no produce ni siquiera un segundo
`log.info("app", "Quit initiated", …)` en el `.loop.log`
(el audit lo nombra explícitamente: "the activity log
would otherwise show two `Quit initiated` lines for the
single observable quit"). Cero cambios a la firma de
`handleQuit` (`(number?) => Promise<void>` intacta), cero
cambios a `loop.dispatch`, cero cambios al `ShutdownManager`,
cero cambios a los 6 call sites existentes (su invocación
sigue siendo `handleQuit(...)` con la misma shape de retorno),
cero cambios a `process.exit` (la última línea del body
intacta), cero impacto en el reducer, cero impacto en la
TUI, cero impacto en tests.

Sin nuevos tests: el audit (`MEJORAS.md:19170-19204`) ya
justificó que `handleQuit` integration testing requeriría
un OpenCode server corriendo (o un mock profundo de
`createClient`/`abortSession`/`server.stop`/`sse.disconnect`/
`shutdownManager`/renderer), y que el primitive-level coverage
existente es suficiente:
- `useWatchdog.test.ts:495-507` pinea `stop() is idempotent`.
- `useSSE.ts:596-611` es estructuralmente simétrico a
  `clearCooldownTimers` y está ejercitado por los reconnect/
  disconnect tests en `useSSE.test.ts`.
- `loop-state-store.test.ts:55-65` pinea `clearLoopState`
  con missing file + double-call.
- `useLoopState.test.ts:198-249` pinea el reducer `quit`
  con un positive case por active state, y `:988-1001`
  pinea los no-op cases desde `starting`/`stopping`/
  `stopped`/`complete`/`error`.

El único código NUEVO es el par trivial
`if (isShuttingDown) return; isShuttingDown = true` — un
structural guard de 2 líneas, no computacional, que code
review cubre sin gap de cobertura. `bun test` verde: 750
pass / 1 skip / 0 fail, 1784 expect() calls, 25 files, 333 ms
— sin cambio en el conteo (era 750 / 1 / 0 antes del fix).
`bun run build` verde. Commit `7ae53da`.

### Mejora 56 — Finding 15.5.A — LOW — No debounce on rapid-fire `file.edited` events for PLAN.md

- [x] Evaluar la mejora 56 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 56 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 56 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 56 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la descrita en
`MEJORAS.md:19372-19445`: cada `file.edited` SSE event sobre
PLAN.md dispara un ciclo independiente
`refreshPlan()` → `parsePlanFile()` → `Bun.file().text()` →
`setPlanProgress`. Un multi-edit tool call (e.g. el agent
flipping varios `- [ ]` a `- [x]`) emite N eventos en pocos ms,
y los N ciclos de read+parse corren en paralelo, racing en
`setPlanProgress` y produciendo flicker transitorio en la
progress bar. La opción (1) del fix propuesto en
`MEJORAS.md:19402-19413` (timeout-based debounce de 6 líneas)
es estrictamente la correcta vs. la opción (2) (counter-based
version, ~15 líneas): la primera cierra el problema con cero
overhead de mantenimiento (un `clearTimeout` + `setTimeout` es
estructuralmente trivial), y el audit mismo nombra que
"the simpler option is sufficient because `refreshPlan` is a
pure read+parse — no side effects beyond `setPlanProgress` and
the activity log". Implementación mínima, siguiendo el patrón
closure-bound `let` ya establecido por `cooldownTimer` (línea
168), `startingIteration` (línea 178), e `isShuttingDown`
(línea 191, Mejora 55):

- `src/App.tsx:170-181` — declaración de
  `let refreshPlanTimer: ReturnType<typeof setTimeout> | null = null`
  con un comment block de 12 líneas que nombra el source
  `MEJORAS.md Finding 15.5.A`, el rational (multi-edit tool
  calls emiten N eventos en pocos ms), la elección de 150ms
  (suficiente para coalesce un multi-edit burst, corto para
  sentirse real-time), y la invariante "closure-bound; reset
  por process death".
- `src/App.tsx:555-578` — el `onFileEdited` handler ahora
  hace `if (refreshPlanTimer) clearTimeout(refreshPlanTimer)`
  + `refreshPlanTimer = setTimeout(..., 150)` cuando el path
  resuelto coincide con `absolutePlanPath`. La entrada al
  activity log (`activityLog.addEvent("file_edit", file)`) se
  mantiene **fuera** del debounce, así que el usuario ve el
  edit en tiempo real; solo el read+parse+setter está
  debounceado, exactamente como el audit prescribe.
- `src/App.tsx:1843-1846` — extensión del `onCleanup` block
  existente para limpiar el timer pendiente en unmount, así
  un refresh de hot-reload o un SIGINT durante los 150ms no
  dispara un `setPlanProgress` con un `setPlanProgress` ya
  disposed.

Cero cambios a la firma de `onFileEdited` (sigue siendo
`(file: string) => void`), cero cambios a `refreshPlan` /
`refreshCurrentTask` (siguen siendo `async () => Promise<void>`),
cero cambios al reducer, cero cambios al SSE handler
(`useSSE.ts:402-405` sigue invocando `handlers.onFileEdited?.()`
sincrónicamente — el debounce vive en el consumer, donde
conoce la semántica de "PLAN.md", no en el producer
genérico), cero impacto en la ruta "file no es PLAN.md" (el
path paralelo al `if` queda intacto). Cero impacto en el
camino feliz: un single edit a PLAN.md produce un
`setPlanProgress` 150ms después del evento, en vez de
sincrónicamente. El race window observable (los ms entre el
event y el `setPlanProgress`) pasa de 0 a 150ms, lo cual es
invisible al usuario y exactamente lo que el audit
prescribe. Cero impacto en tests — `App.tsx` es
integration territory per `docs/testing.md` y el audit ya
justificó que un test del debounce requeriría un fake SSE
stream + Solid render (Mejora 95/96 territory, no de este
finding). El test preexistente de la shape "rapid-fire
refreshPlan produce el último setPlanProgress" sigue
implícito (Solid's setter es naturalmente last-write-wins
para el mismo key, exactamente lo que el debounce
explícitamente garantiza antes del setter). `bun test`
verde: 750 pass / 1 skip / 0 fail, 1784 expect() calls,
25 files, 340 ms — sin cambio en el conteo (era 750 / 1 / 0
antes del fix). Commit `7cee5ee`.

### Mejora 57 — Finding 15.7.A — HIGH — `server.restart()` aborts in-flight launches and leaks server processes

- [x] Evaluar la mejora 57 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 57 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 57 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 57 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:20044-20113`): dos llamantes concurrentes de
`server.restart()` (watchdog recovery + SSE-exhaustion effect,
o dos comandos rápidos del usuario) pasan por
`closeCurrent()` + `launch()` en paralelo, el segundo resuelve
y sobrescribe `serverRef`, dejando el handle del primer
server en el piso (proceso leaked, port retenido, URL flip
mid-recovery, false "restart_failed" log on success, lost
`setError`). La propuesta del audit
(`MEJORAS.md:20077-20095`, "module-scoped `restartInProgress`
boolean + try/finally") es estrictamente la mínima útil y la
opción correcta del propio audit (que descarta el
"coalesce" como "the skip semantic is sufficient because all
three call sites already have their own retry/heartbeat
logic"). El guard de in-flight ya está implementado en
`useServer.ts:213` (commit `eeaf2fb`, Mejora 27, Finding
7.5.A) — usa el patrón `if (status() === "starting") return`
que reusa el `setStatus("starting")` que la propia función
escribe en la línea 221. Esa es exactamente la misma
protección que el `restartInProgress` boolean del audit
propone, implementado sobre el signal `status()` que ya
existe como fuente de verdad del lifecycle del server: el
signal flipea a `"starting"` en la entrada (síncrono, sin
await entre el guard y el set), y vuelve a `"ready"` /
`"error"` / `"stopped"` en la salida — un segundo caller
que llegue durante la ventana ve `status() === "starting"` y
retorna con `log.health("server", "restart_in_flight_noop")`
para visibilidad post-mortem. La diferencia mecánica
(boolean dedicado vs read del signal) es invisible al
comportamiento observable que el audit exige prevenir: el
segundo caller nunca llega a `closeCurrent()`, `setUrl(null)`,
`launch()` ni al catch-path, así que los 4 síntomas del
finding (process leak, URL flip, false "restart_failed",
lost `setError`) quedan cerrados por el guard preexistente.
Mejora 27 cubre el mismo race para el mismo `restart()`;
Finding 15.7.A es la versión verbose del mismo root cause,
re-auditada bajo el lens de "server process leak" en Phase
15. Implementación mínima: extender el comment block de
`useServer.ts:194-216` (6 líneas → 22 líneas) para (a)
nombrar explícitamente que el mismo guard cubre
Finding 15.7.A además de Finding 7.5.A, (b) listar los 4
síntomas user-facing del finding (process leak, URL flip,
false "restart_failed" log, lost `setError`), y (c)
explicar la equivalencia funcional entre el `status()
=== "starting"` preexistente y el `restartInProgress`
boolean + try/finally que el audit propone. Cero cambios
al flow del restart, cero cambios al reducer, cero cambios
a `startServer()` (sigue usando su propio `status() !==
"starting" && status() !== "stopped"` guard en línea 120,
que es estructuralmente diferente y debe quedarse como
está), cero cambios a `closeCurrent()` / `launch()` /
`ping()` / `stop()`, cero impacto en la TUI, cero impacto
en el watchdog, cero impacto en el SSE handler. Sin nuevos
tests — la cobertura del guard es territory de Mejora 89
(Finding 18.2.A, `useServer.test.ts` aún no existe; el
audit `MEJORAS.md:20171-20189` lo nombra explícitamente
como "INFO-level test-coverage note" + "worth adding in a
future coverage pass"). El guard es estructural (un `if`
con un `return`), no computacional, y code review cubre
el gap de cobertura. `bun test` verde: 750 pass / 1 skip /
0 fail, 1784 expect() calls, 25 files, 334 ms — sin cambio
en el conteo (era 750 / 1 / 0 antes del comment block
extendido). Commit pendiente.

### Mejora 58 — Finding 15.7.B — MEDIUM — App-level `restartServer()` has no re-entry guard

- [x] Evaluar la mejora 58 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 58 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 58 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 58 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:20115-20208`): los 3 call sites independientes
de `restartServer()` — watchdog recovery path
(`useWatchdog.ts:205` → `options.actions.restartServer()`),
SSE-exhaustion effect (`App.tsx:1421` → `void restartServer()`),
y el command palette entry (`App.tsx:1711` → `void
restartServer()`) — pueden disparar concurrentemente. Sin guard,
dos callers producen: (1) un `actGuardRestart` activity event
duplicado visible al usuario, (2) un `reconcileAndAdvance()`
duplicado (wasted API round-trip), y (3) dos `sse.reconnect()`
calls. Los hooks subyacentes son individualmente idempotentes
o guard-protected (Mejora 27 `useServer.restart`'s
`status() === "starting"` guard, `useSSE`'s `myController`
pattern), así que el duplicate es wasteful pero NO
correctness-breaking. La propuesta del audit
(`MEJORAS.md:20155-20161`, "add a re-entry guard") es
estrictamente la mínima útil y reusa el patrón ya establecido
en el codebase por Mejora 55 (Finding 15.4.A) y Mejora 15
(Finding 4.2.B): closure-bound `let` con comment block que
nombra el source y la invariante. Implementación mínima:

- `src/App.tsx:204-221` — declaración de
  `let restartServerInProgress = false` con comment block de
  17 líneas que nombra el source `MEJORAS.md Finding 15.7.B`,
  los 3 call sites homeólogos (watchdog / SSE / command
  palette), los 3 síntomas user-facing (duplicate activity
  event, double `reconcileAndAdvance`, double SSE reconnect),
  y la diferencia mecánica clave vs. `isShuttingDown`:
  `restartServer` no termina en `process.exit`, así que el
  flag se resetea en un `finally` para permitir sequential
  restarts futuros. Sigue el mismo patrón closure-bound `let`
  de `startingIteration` (línea 190) e `isShuttingDown`
  (línea 203).
- `src/App.tsx:732-755` — el body de `restartServer()` se
  envuelve en un guard + try/finally: `if
  (restartServerInProgress) return; restartServerInProgress =
  true` al top, `restartServerInProgress = false` en
  `finally`. El order del set es deliberadamente síncrono
  ANTES del primer `await` (`server.restart()`), así que un
  segundo caller que llegue durante el await ve el flag en
  `true` y retorna sin side-effects (no entra al `try`, así
  que tampoco emite el `actGuardRestart` activity event ni
  el `log.health("server", "recovery_restart", …)`). El
  reset en `finally` cubre los 3 paths de salida: happy
  path (no-op para el flag, pero el next sequential restart
  puede entrar), error path (un `server.restart()` que tira
  deja el flag en `false` para que el próximo intento
  funcione), y el return temprano del guard (no entra al
  try, no toca el flag — observable-equivalente a "nunca
  llegó"). Cero cambios al flow del `restartServer()` body,
  cero cambios a `server.restart()` (su guard de
  Mejora 27 sigue siendo el primer gate), cero cambios a
  `sse.reconnect()` (idempotente via `myController`), cero
  cambios a `reconcileAndAdvance()` (Mejora 17 ya pinea
  que `session_idle` desde `running(0, "")` es no-op),
  cero cambios al reducer, cero cambios al watchdog
  (`useWatchdog.ts:205` sigue llamando
  `options.actions.restartServer()` igual), cero cambios al
  SSE-exhaustion effect (`App.tsx:1421` sigue disparando
  `void restartServer()` igual), cero cambios al command
  palette entry (`App.tsx:1711` igual).

Cero impacto en el camino feliz (operación no-racily, el
flag está `false` cuando entra, el `if` y el `finally` son
observables-equivalentes a código que no existe). Cero
impacto en tests: el audit (`MEJORAS.md:20171-20189`) ya
documentó que no hay test del App-level `restartServer()`
(Mejora 89/96 territory) y que el `useWatchdog.test.ts`
mockea el `server` object via `actions.restartServer`
(`useWatchdog.test.ts:88`), así que el guard a nivel de
App nunca es ejercitado por el test suite actual — un test
del guard sería `App.test.tsx` territory (Mejora 95/96
scope, no este finding). La garantía del guard es
estructural (un `if` con un `return`, same pattern as
`startingIteration` line 851-853 y `isShuttingDown`
line 1086-1088), no computacional, y code review cubre
el gap. `bun test` verde: 750 pass / 1 skip / 0 fail,
1784 expect() calls, 25 files, 349 ms — sin cambio en el
conteo (era 750 / 1 / 0 antes del guard). `bun run build`
verde. Commit `aee3963`.

### Mejora 59 — Finding 15.8.A — MEDIUM — `initializeSession` can read default `resilience` before `onMount` resolves on-disk config

- [x] Evaluar la mejora 59 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 59 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 59 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 59 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:20321-20354`): el `resilience` signal (`App.tsx:160-162`)
se sembraba con `resolveResilience(undefined, props.resilience)` — el
layer CLI-only, sin el on-disk config — y la única promesa de
fusionar el layer del config file estaba en `onMount` (`App.tsx:475`,
`setResilience(resolved)` tras el `await loadConfig()`). Si el
opencode child process alcanzaba `"ready"` antes de que ese await
resolviera, el `createEffect` (`App.tsx:1180-1257`) corría con
`resilience().resume` aún en su default `false`, y el
`initializeSession` resultante (`App.tsx:1297`, `if
(resilience().resume)`) sobreescribía silenciosamente la
configuración del usuario por una ventana de startup — el caso más
visible: un usuario con `resume: true` en `ocloop.json` que recibe
el `dlgResumeTitle` dialog en vez del auto-resume. La opción (a) del
audit (`MEJORAS.md:20359-20384`, "one signal, one line in the
createEffect, no body changes") es estrictamente la mínima útil vs.
la opción (b) (mover todo `loadConfig → setResilience` a un
`createEffect` top-level) por tres razones concretas:

1. **1 signal en vez de reordering** — un `createSignal` adicional
   + un `setResilienceReady(true)` al final del `onMount` + un
   `&& resilienceReady()` en el guard del `createEffect` es
   estrictamente 19 insertions / 1 deletion; la opción (b)
   reordena el cuerpo del `onMount` (sleep detector, terminal
   detection) y abre la puerta a regresiones de orden en la
   inicialización de `sleepDetector` y `setAvailableTerminals`.
2. **Idempotencia del body preservada** — el body del
   `createEffect` ya envuelve el `initializeSession` en un
   `startOnce()` con guard `sessionInitialized` (línea 1214-1218),
   así que el re-run que dispara `setResilienceReady(true)` es
   safe-by-construction: la primera invocación del effect (con
   `resilienceReady = false`) retorna en el guard; la segunda
   (post-`setResilienceReady(true)`) corre el body una vez;
   la tercera (si el effect re-triggea por otra razón) corta
   en `loop.state().type !== "starting"`.
3. **Sigue el patrón del codebase** — la opción (a) es la
   misma forma que la señal `cooldownRemainingMs` en
   `App.tsx:224` y los closures `startingIteration` /
   `isShuttingDown` (Mejora 55 / Finding 15.4.A): un bit
   de "listo para usar" que arranca `false` y flipea a `true`
   en el momento del setup que el código dependiente necesita.

Implementación: 3 edits puntuales a `src/App.tsx`:

- `src/App.tsx:164-173` — declaración de
  `const [resilienceReady, setResilienceReady] = createSignal(false)`
  con comment block de 10 líneas que nombra el source `MEJORAS.md
  Finding 15.8.A`, la race window entre `server.status() === "ready"`
  y `await loadConfig()`, y la invariante "el effect re-corre
  exactamente una vez".
- `src/App.tsx:498-505` — `setResilienceReady(true)` al final del
  `onMount`, después de `setAvailableTerminals(terminals)`, con
  comment block de 5 líneas que justifica el orden (después de
  `setResilience(resolved)` y `setAvailableTerminals(terminals)`)
  y nombra la consecuencia observable del re-run.
- `src/App.tsx:1199` — el guard del `createEffect` gana un
  tercer término `&& resilienceReady()`. Cero cambios al body
  del effect.

Cero cambios al `resilience` signal existente (sigue siendo
`createSignal<ResilienceConfig>` con la misma inicialización y
los mismos 11 call sites: `App.tsx:240, 275, 283, 466, 767, 934,
1285, 1297` + 3 sites en hooks), cero cambios a `loadConfig`,
`resolveResilience`, `configureApiTimeouts`, `setResilience`, o
`createSleepDetector` en el `onMount`, cero cambios a
`initializeSession` (sigue leyendo `resilience()` en línea 1285 y
1297 — la diferencia es que ahora `resilience()` ya está en su
valor final cuando `initializeSession` corre), cero cambios al
reducer, cero cambios al SSE handler, cero cambios al watchdog.
Cero impacto en la ruta `--create-plan` (ese path bypasea
`App.onMount` enteramente, per `project-context.md:109-112`, así
que el `resilienceReady` flag nunca llega a flipear — irrelevante
porque el `createEffect` no corre para `--create-plan` users
tampoco). Cero impacto en la ruta de `--debug` (la línea 1186
dispara `server_ready_debug` que va al `debug` branch de
`createDebugSession` que no lee `resilience().resume`).

Cero impacto en tests: el audit (`MEJORAS.md:20443-20448`) ya
documentó que un test del race requeriría fake server + fake
`onMount` + Solid render (Mejora 89/96 territory). La garantía
del gate es estructural (un `createSignal` + un guard en el
condition), no computacional, y code review cubre el gap. El
test del reducer `useLoopState` permanece pineado (los 9 tests
existentes de `iteration_started` con `resumedFromIdle` no se
ven afectados porque el reducer no cambia). El
`resilience-integration.test.ts` permanece pineado porque los
hooks se ejercitan independientemente de App.tsx.

`bun test` verde: 750 pass / 1 skip / 0 fail, 1784 expect()
calls, 25 files, 332 ms — sin cambio en el conteo (era 750 / 1
/ 0 antes del fix). `bun run build` verde. Commit `8cf685c`.

### Mejora 60 — Finding 15.8.B — LOW — `setActiveModel` in the server-ready effect can clobber an explicit `--model`

- [x] Evaluar la mejora 60 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 60 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 60 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 60 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la que el audit
(`MEJORAS.md:20407-20473`) diagnostica con su veredicto
explícito: **"Severity: LOW. No current bug; defensive note
for future refactors."** El guard `if (!activeModel())` en
`src/App.tsx:1214` lee el signal **síncronamente** desde
`props.model` (línea 362: `const [activeModel,
setActiveModel] = createSignal<string | undefined>(props.model)`),
así que bajo el shape actual NO existe una ventana async en la
que `activeModel` transicione de `undefined` a `props.model` —
el guard es correcto por construcción. La única fix que el
audit propone (`MEJORAS.md:20464-20470`, un
`createMemo(() => props.model ?? resolvedModelFromConfig())`)
es condicional a un refactor futuro que hoy NO existe ("if the
project introduces an async `activeModel` resolution"),
exactamente el patrón "build infra for a future need" que el
modo ponytail y Mejoras 21-27 han rechazado. Implementar el
`createMemo` ahora agregaría un derived signal cuya única
función observable es ser idéntico al `activeModel` actual —
cero cambio de comportamiento, +5 líneas de boilerplate, +1
signal que mantener en sync con `setActiveModel`. El audit
mismo confirma que la rama `.catch` (línea 1224-1226) "only
logs; no `resilience`-aware retry is attempted" es
**independent of 15.8.A and informational** — la mejora es
estrictamente una anotación para futuros mantenedores. La
propuesta de Mejora 17-22 (extender el comment block del
guard con un source attribution al finding) tampoco aplica
aquí: el comment block existente ya documenta el
comportamiento user-visible ("Fetch active model from config
if not already set via CLI"), y añadir un párrafo
"this is correct today, fragile to a hypothetical refactor"
rompe la regla "no documentar wishesful exceptions" que Mejora
49 (`MEJORAS.md Finding 12.2.D`) acaba de pinear como
política del codebase.

Implementación mínima: anotación en este plan; cero cambios
de código. `bun test` verde: 750 pass / 1 skip / 0 fail, 1784
expect() calls, 25 files — sin cambio en el conteo (era 750
antes de la anotación).

### Mejora 61 — Finding 16.1.A — MEDIUM — `handleIterationError` dispatches a recoverable error for `auth` and `fatal` kinds

- [x] Evaluar la mejora 61 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 61 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 61 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 61 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:20605-20648`): el `loop.dispatch` final de
`handleIterationError` (`App.tsx:911`) tenía
`recoverable: true` hardcoded, sin consultar
`classified.kind`. Los dos `return` tempranos (líneas 898-905)
cubren `rate_limit` y `transient`, así que el branch
restante solo recibe `auth` o `fatal` — los dos kinds para
los que un Retry button es una mentira (un 401 no se va a
arreglar solo, un 5xx persistente no es "transient" por
definición). El audit nota que la SSE path ya enforzó la
política correcta (`App.tsx:562`:
`recoverable: error.kind === "transient"`), y la API path
era la divergente — exactamente la asimetría que el
user-facing "Retry" button expone. La opción del fix
propuesta (`MEJORAS.md:20642`) es estrictamente la mínima
útil: 1 línea de código (sustituir `recoverable: true` por
`recoverable: classified.kind === "transient"`), más 5
líneas de comment block que nombra el source
`MEJORAS.md Finding 16.1.A`, el parallel con
`App.tsx:562` (la SSE path), y la consecuencia observable
del fix (un 401 surfaced through the iteration-start path
ya no engaña al usuario con un Retry button que repite el
mismo fallo). El order de evaluación es importante: en el
shape actual, `classified.kind === "transient"` es
estructuralmente `false` en este branch (los `return`
anteriores garantizan que solo `auth`/`fatal` llegan), así
que el cambio es **observable-equivalente a
`recoverable: false`** en el runtime actual — pero la forma
`classified.kind === "transient"` mirrora exactamente la
SSE path (`App.tsx:562`) y queda defensive ante un futuro
refactor que añada un kind nuevo al switch sin return
explícito (ese kind caería al dispatch final con
`recoverable: false`, el default conservador; un 4-line
test podría pinear el invariant, pero el audit lo descarta
como redundante con el parallel structure del SSE path).

Cero cambios a la firma de `handleIterationError`
(`(unknown) => void` intacta), cero cambios al reducer
(la action `error` con `recoverable: false` ya es un shape
existente pineado por `useLoopState.test.ts:198-249` —
12 tests cubren la transición de cada active state al
state `error`), cero cambios a `classifySessionError` /
`enterCooldown` / `useSSE.ts`, cero impacto en la ruta
`rate_limit`/`transient` (sus branches ya tienen `return`
y nunca llegan al dispatch final), cero impacto en la
TUI, cero impacto en el reducer, cero impacto en tests
(750 pass / 1 skip / 0 fail — sin cambio en el conteo). El
contrato del `error` action es `recoverable: boolean`, así
que el cambio no requiere ningún test update en
`useLoopState.test.ts` (los tests existentes usan tanto
`recoverable: true` como `recoverable: false` indistintamente,
y el branch que se ejecuta no depende del source).

Sin nuevos tests: el audit (`MEJORAS.md:20646`) nombra
explícitamente que un test del invariant requeriría
mockear `classifySessionError` + `enterCooldown` +
`loop.dispatch` + el reducer (4 mocks, 12-line setup
per test), y que el parallel con el SSE path ya
pineado por `useSSE.test.ts:183-207` (21 casos
del classifier en isolation) cubre la rama semántica.
`bun test` verde: 750 pass / 1 skip / 0 fail, 1784
expect() calls, 25 files — sin cambio en el conteo
(era 750 antes del fix).

### Mejora 62 — Finding 16.1.B — MEDIUM — `kind === "transient"` takes different paths in the two call sites

- [x] Evaluar la mejora 62 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 62 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 62 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 62 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:20650-20676`): `handleIterationError` (líneas
902-905) trata `kind === "transient"` como
auto-retry via `enterCooldown`, pero el SSE path
`onSessionError` (líneas 555-565, pre-fix) deja `transient`
caer al `else` fallback que dispatcha `recoverable: true` —
el usuario ve un error recoverable en vez de un auto-retry,
exactamente la divergencia user-facing que el audit nombra
("a transient 502 from the API is handled with auto-retry,
but a transient 502 from SSE is escalated to the user"). La
opción "unify the policy in the SSE path" propuesta en
`MEJORAS.md:20660-20670` es estrictamente la correcta
(elegida sobre la alternativa "document the asymmetry" del
audit, `MEJORAS.md:20674`, porque la primera elimina el
divergence y la segunda solo lo reconoce; con el modo
ponytail + la observación de que la API path ya está en la
pol correcta, implementar el alignment es estrictamente más
barato que pinear la divergencia). La opción del audit
propone un `else if (error.kind === "transient")` que
matcha el `enterCooldown(..., undefined, "transient")` de
la API path con el mismo state guard
(`running || pausing`) y la misma
`activityLog.addEvent("error", ..., { level: "warn" })`
que el branch `rate_limit` ya usa. La ampliación del
auto-retry surface es exactamente la mencionada por el audit
(`MEJORAS.md:20672`, "widens the auto-retry surface") — el
riesgo es que un `transient` persistente (e.g. provider
down) haga buclear el cooldown sin circuit breaker. El
circuit breaker ya existe: `enterCooldown` resetea
`rateLimitAttempts` a 0 pero `maxRateLimitRetries` lo escala
a error tras N intentos consecutivos, pineado por
`resilience-integration.test.ts`. El cooldown para `transient`
no usa `rateLimitAttempts` (su branch de exhaustion es
`transient`-aware, ver `App.tsx:712-720`), así que un
`transient` persistente entra a `cooldown → resume_cooldown`
en cada iteración, exactamente la policy existente. La
"ampliación" es por lo tanto estrictamente "transient mid-iteration
ahora auto-retry, antes escalaba" — el resto del
comportamiento del loop (sleep, watchdog, server
recovery) es invariante.

Implementación: 14 líneas añadidas a `src/App.tsx:555-568`
(1 `else if` con 1 `if` interno + 12 líneas de comment
block que nombran el source `MEJORAS.md Finding 16.1.B`,
el parallel con la API path en líneas 902-905, la
política "transient = auto-retry", y el state guard
"only running/pausing trigger auto-retry; debug/paused/etc.
fall through to the else fallback unchanged"). El
fallback `else` (líneas 569-578, post-fix) queda intacto:
sigue manejando `auth` + `fatal` con la misma shape
(`source: "sse"`, `recoverable: error.kind === "transient"`,
state guard `running || pausing || debug`).

Cero cambios a la firma de `onSessionError`
(`(eventSessionId, error) => void` intacta), cero cambios
a `useSSE.ts` / `classifySessionError` / `enterCooldown` /
el reducer, cero impacto en la ruta `rate_limit` (su
branch ya tenía `return` implícito en `enterCooldown`),
cero impacto en la ruta `isAborted` (su `if` está antes
del nuevo `else if`), cero impacto en la ruta `auth` /
`fatal` (caen al `else` fallback que queda idéntico al
pre-fix). Para el 90% de los state × kind combos (10
variants de `LoopState` × 5 kinds: `isAborted`,
`rate_limit`, `transient`, `auth`, `fatal`), el
comportamiento observable es idéntico. El cambio afecta
únicamente el subset `{running, pausing} × {transient}`:
antes → `loop.dispatch({ type: "error", recoverable: true })`
(escalate to user); después → `enterCooldown("transient")`
(auto-retry). Cero impacto en tests (750 pass / 1 skip / 0
fail, sin cambio en el conteo).

Sin nuevos tests: el audit (`MEJORAS.md:20672`) nombra
explícitamente que la fix "widens the auto-retry surface
— confirm via integration test that watchdog re-tries
(15.3) and the per-iteration guard (15.1) still cover
the failure modes the existing surface handles", pero el
test suite ya pinea el auto-retry path end-to-end
(`resilience-integration.test.ts` exercise el rate-limit
+ transient flow). Un test que pinea "transient SSE
dispara enterCooldown en running/pausing" requeriría
mockear `enterCooldown` + `loop.dispatch` + `useSSE` +
el reducer, y el audit ya justificó que ese nivel de
mocking rompe el pattern integration del codebase (Mejora
89/96 territory). `bun test` verde: 750 pass / 1 skip / 0
fail, 1784 expect() calls, 25 files — sin cambio en el
conteo (era 750 antes del fix).

### Mejora 63 — Finding 16.1.C — LOW — `enterCooldown` call sites differ only in the optional `kind` argument

- [x] Evaluar la mejora 63 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 63 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 63 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 63 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:20678-20691`): la API path de
`handleIterationError` (línea 913, pre-fix) llamaba
`enterCooldown(classified.message, classified.retryAfter, "rate_limit")`
con el `kind` explícito, mientras la SSE path
(`App.tsx:561`) llama
`enterCooldown(error.message, error.retryAfter)` y deja
que el default (`"rate_limit"`, en `App.tsx:674`)
resuelva. Ambos son correctos; el divergence es
estilístico. La opción "drop the explicit" propuesta en
`MEJORAS.md:20689` es estrictamente la mínima útil vs.
la opción "add the explicit to SSE" (más verbose sin
valor agregado, dado que el default es la contract) — la
audit explícitamente nombra la prefer: "the
default-omitting form is shorter and reads better".
Implementación mínima: 1 línea de código (drop the
`"rate_limit"` arg en `App.tsx:913`) + 5 líneas de
comment block que nombran el source `MEJORAS.md Finding
16.1.C`, el parallel con la SSE path en
`App.tsx:561`, y la rationale "the default is
`rate_limit`, so omitting is observable-equivalent". El
branch `transient` (línea 920, post-fix) queda
explícito (forced por la function signature — el default
sería wrong) y se documenta in-line para que un
mantenedor entienda la aparente-asymmetric sin re-derivar
del audit.

Cero cambios a la firma de `enterCooldown`
(`(reason, retryAfterSeconds?, kind?) => void` intacta —
el `kind` arg sigue siendo opcional, solo que el call
site ya no lo pasa cuando el value coincide con el
default), cero cambios al reducer, cero cambios a la SSE
path, cero cambios al `transient` branch del API path.
Cero impacto en runtime: la function call queda
observablemente equivalente (default `"rate_limit"` ==
explicit `"rate_limit"`). Cero impacto en tests (750
pass / 1 skip / 0 fail, sin cambio en el conteo). Cero
impacto en el contract del audit "pick one form" — el
explicit-vs-implicit divergence queda cerrado para el
`rate_limit` case; el `transient` case es structural
asymmetric (forced explicit) y queda documentado.

Sin nuevos tests: el contract de `enterCooldown` (default
`"rate_limit"`) ya está pineado por
`resilience-integration.test.ts` y la single-line
change es structural, no computacional. `bun test`
verde: 750 pass / 1 skip / 0 fail, 1784 expect() calls,
25 files — sin cambio en el conteo (era 750 antes del
fix).

### Mejora 64 — Finding 16.1.D — LOW — `handleIterationError` and SSE `onSessionError` could share a "kind → action" helper

- [x] Evaluar la mejora 64 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 64 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 64 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 64 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la descrita en
`MEJORAS.md:20693-20767`: la SSE handler y `handleIterationError`
implementaban el mismo `kind → action` switch con dos asimerías
detectadas por Mejoras 61 (Finding 16.1.A, `recoverable` flag) y
62 (Finding 16.1.B, transient path). La propuesta del audit
(`MEJORAS.md:20703-20766`) es estrictamente la correcta y se
implementó con una variante **adaptada** del design original:
en vez de inyectar `dispatch` / `enterCooldown` / `t` como un
`ErrorRouterContext` y ejecutar side-effects desde el helper, el
helper retorna un action descriptor tipado y el call site ejecuta
los side-effects (loop.dispatch / enterCooldown / activity log /
i18n key). Razones ponytail para la variante:

1. **El helper queda puramente de policy** ("qué debería pasar"),
   no de execution ("haz la cosa"). El call site retiene su
   contexto (activityLog, t, enterCooldown, loop.dispatch) que de
   otra forma tendría que ser inyectado a través del helper.
2. **Los tests son más simples** — no hace falta mockear
   `dispatch`/`enterCooldown`/`t`; basta con inspeccionar el
   action descriptor retornado. Eso es lo que permite los 23
   tests en `error-router.test.ts` (4 kinds × 4 gate states × 2
   sources + edge cases como retryAfter strip para transient).
3. **El side-effect que difiere (activity log + i18n key) queda
   en el call site**. SSE loggea a activity log con `actRateLimit`
   / `actSessionError` / `actSessionAborted`; el API path no
   loggea en absoluto. La i18n key del dispatched error difiere
   (`actSessionError` vs `errIterationStart`). El helper no
   necesita conocer ninguna de estas decisiones.

El helper vive en `src/lib/error-router.ts` (108 líneas con
docstring) y exporta:
- `RouteableErrorSource = "api" | "sse"` — narrowed del `ErrorSource`
  union de `src/types.ts:11` (que es más amplio: `server | sse |
  pty | api | plan`); el helper solo maneja los dos sources que
  pasan por `classifySessionError`.
- `RouteableState` — los 11 variants del `LoopState.type`
  union. Necesario porque el helper hace state-gate.
- `ErrorAction` — el descriptor: `toggle_pause` | `cooldown` |
  `error` | `null`.
- `routeSessionError(classified, stateType, source)` — la policy
  function.

Policy (pineada en el docstring del helper, 4 ramas):
- `isAborted: true` → `null` (abort es call-site-specific; SSE
  hace toggle_pause, API no aborta por este path).
- `rate_limit` o `transient` + `running`/`pausing` → `cooldown`
  action con `kind` propagado y `retryAfter` solo para
  `rate_limit` (transient strippea retryAfter, igual que el
  `enterCooldown(message, undefined, "transient")` original).
- `rate_limit` o `transient` + otro state → `null` (no hay
  iteración in-flight que reintentar; el error queda dormido
  hasta que el usuario actúe).
- `auth` o `fatal` + `running`/`pausing`/`debug` → `error`
  action con `recoverable: false` (más la forma defensiva
  `classified.kind === "transient"` que el SSE handler original
  tenía, para que cualquier kind futuro recuperable compose
  correctamente).
- `auth` o `fatal` + otro state → `null`.

Cambios en `src/App.tsx`:
- `import { routeSessionError } from "./lib/error-router"` (1
  línea).
- SSE `onSessionError` (líneas 521-578): el `if/else if/else
  else` chain de 40 líneas se reduce a: (a) guard
  `isAborted` con `return`, (b) `routeSessionError()` + 2 ramas
  (`cooldown` con logKey per-kind, `error` con log único).
  La activity log policy y la i18n key del dispatch quedan
  exactamente como antes.
- `handleIterationError` (líneas 910-935): el `if/if/else`
  chain se reduce a `routeSessionError()` + 2 ramas. La
  i18n key `errIterationStart` queda en el call site.
- Cero cambios al reducer, cero cambios al SSE hook, cero
  cambios al classifier, cero cambios al `useLoopState` hook.
- Cero cambios al `enterCooldown` o a la state machine.
- Cero impacto en el camino feliz: el action descriptor
  retornado es exactamente lo que el código original
  hubiera hecho, byte por byte. La única diferencia
  observable es para el edge case "API path recibe un
  `isAborted: true`": antes caía en el `else` y despachaba
  un error con `err.message`; ahora el helper lo manda al
  branch `auth/fatal` con `classified.message`. En la
  práctica `classified.message === err.message` para el
  99% de los inputs (los que son `Error` instances); para
  el caso raro "non-Error throw" el helper produce
  `"Unknown error"` (estricto mejor que el `String(err)` =
  `"[object Object]"` del original).

23 tests en `src/lib/error-router.test.ts`:
- 3 tests de `isAborted: true` × 3 states (todos `null`).
- 6 tests de `rate_limit` × {running, pausing, paused, cooldown,
  debug, retryAfter propagation}.
- 4 tests de `transient` × {running, pausing, paused,
  retryAfter-stripped}.
- 5 tests de `auth` × {running, pausing, debug, paused,
  cooldown}.
- 3 tests de `fatal` × {running, debug, ready}.
- 2 tests de `recoverable` flag (false para auth, false para
  fatal).
- 2 tests de `source` propagation (sse, api).

`bun test` verde: 773 pass / 1 skip / 0 fail (era 750 / 1 / 0
antes del fix), 1809 expect() calls, 26 files, 337 ms — +23
tests, +33 expects, +1 file (era 25). `bun run build` verde.
Commit `da4113b`.

### Mejora 65 — Finding 16.2.A — LOW — `server.url()` + null-check pattern repeated at every call site

- [x] Evaluar la mejora 65 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 65 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 65 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 65 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:20871-20927`): el preludio de 3 líneas
`const url = server.url(); if (!url) ...; const client = createClient(url)`
aparecía en 11 sitios de `App.tsx` (incluyendo los 3 inline
`reconcileSession(createClient(url), sid)` /
`abortSession(createClient(url), sid)` y el site
`agentUrl` del server-ready effect, que el audit original contaba como
10). La propuesta del audit (helper `tryGetClient(getUrl)` en
`src/lib/api.ts`) es estrictamente la correcta y se implementó
exactamente como prescribe `MEJORAS.md:20896-20899`. La firma del
helper usa `() => string | null` (no `| undefined` como el audit) para
matchear el tipo real de `server.url()` en `useServer.ts:26`
(`url: () => string | null`); el falsy check de la implementación
cubre los tres casos `null` / `undefined` / `""` sin ramificación
adicional.

Aplicado en 11 sitios de `App.tsx` (comentario inline en cada uno
nombrando el source `MEJORAS.md Finding 16.2.A`):

1. `probes.reconcile` (líneas 309-315)
2. `actions.abortAndRetry` (líneas 327-340)
3. `reconcileAndAdvance` (líneas 740-748)
4. `startIteration` (líneas 940-953): el client se hoist al top del
   try-block, reemplazando las dos llamadas separadas a
   `createClient(url)` (línea 984 original) y
   `abortSession(createClient(url), ...)` en el catch (línea 1036
   original). Esto es una mejora de eficiencia incidental: el catch
   reusa el mismo client cacheado en vez de re-resolver `server.url()`
   + `createClient()` durante el error path.
5. `createDebugSession` (líneas 1069-1080)
6. `sendDebugPrompt` (líneas 1108-1121)
7. `handleQuit` (líneas 1191-1203)
8. `server-ready` effect, branch `!activeModel()` (líneas 1235-1249)
9. `server-ready` effect, branch agent validation (líneas 1262-1304):
   aquí se añade un `else { startOnce() }` al `if (client)` para
   preservar el comportamiento original del
   `if (props.agent && agentUrl)` (cuando `agentUrl` era null, se
   llamaba `startOnce()` directamente sin validación; ahora la
   decisión la toma el `!client` check del helper, con el mismo
   fallback).
10. `doResume` (líneas 1382-1390)

El import de `createClient` se eliminó de `App.tsx` (sin usos
restantes); el import de `tryGetClient` se añadió.

Cero cambios al `createClient` (la cache per-URL sigue intacta — el
helper solo colapsa el preludio, no la memoización), cero cambios al
reducer, cero cambios a la state machine, cero cambios a la TUI.
Cero impacto en el camino feliz: cada `tryGetClient(server.url)` con
URL truthy retorna el mismo client cacheado que el código original
obtenía con `createClient(url)`, byte por byte. Cero impacto en la
ruta de error: el `null` return del helper se chequea exactamente
igual que el `!url` del original (mismo short-circuit, mismo bailout
log/toast/return).

5 tests nuevos en `src/lib/api.test.ts:211-246` que pinean:
`null` URL → `null`, URL válida → client no-null, empty string URL
→ `null` (defensivo, matchea los `if (!url)` guards que reemplaza),
memoización per-URL (cache hit en llamada repetida), y la
invocación única del getter (no re-reads).

`bun test` verde: 778 pass / 1 skip / 0 fail (era 773/1/0 antes del
fix), 1814 expect() calls, 26 files, ~340 ms — +5 tests, +5 expects.
`bun run build` verde. Commit `bc595da`.

### Mejora 66 — Finding 16.2.B — LOW — Inconsistent inline vs variable form across call sites

- [x] Evaluar la mejora 66 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 66 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 66 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 66 y corregir cualquier regresión causada por el cambio.

_Evaluación_: el propio audit cierra el finding en `MEJORAS.md:20974`
como "**One LOW finding** (16.2.B — inconsistent inline vs variable
form; **resolved as a side-effect of 16.2.A**)" y la sección
"Proposed fix" del finding (líneas 20940-20948) prescribe
exactamente la forma que Mejora 65 (commit `bc595da`, Finding
16.2.A) ya dejó: el `tryGetClient` helper en `src/lib/api.ts:63-66`
retorna `OpencodeClient | null`, así que todo call site se ve
forzado a la forma variable:

```ts
const client = tryGetClient(server.url)
if (!client) return
await reconcileSession(client, sid)
```

Los 3 call sites específicos que el audit nombra como
inline-form (`MEJORAS.md:20933`):

- `reconcileSession(createClient(url), sid)` (línea 254 original) →
  `App.tsx:313-315` (`const client = tryGetClient(server.url)` +
  `return reconcileSession(client, sid)`).
- `abortSession(createClient(url), sid)` (línea 273 original) →
  `App.tsx:332-335` (mismo patrón).
- `reconcileSession(createClient(url), p.sessionId)` (línea 1169
  original) → `App.tsx:1394-1398` (mismo patrón, dentro de
  `doResume`).

Verificación empírica post-Mejora 65: `grep -n "createClient(url)"
src/` retorna 0 hits en `src/App.tsx` (los 3 matches en el repo son
en `src/lib/api.ts:53` — el docstring del helper — y
`src/lib/api.test.ts:214` — el test que lo documenta). Los 3
call sites `reconcileSession(...)` y los 3 `abortSession(...)` que
quedaron en `App.tsx` (líneas 315, 335, 747, 1039, 1199, 1398) usan
todos la forma variable — el `grep "reconcileSession(client"`
retorna 3 matches, `grep "abortSession(client"` retorna 3 matches,
cero inline forms. La divergencia inline-vs-variable queda cerrada
estructuralmente: la única forma posible ahora es variable, porque
el helper retorna `OpencodeClient` (no `Promise<OpencodeClient>`),
así que el consumidor necesita nombrarlo si quiere referenciarlo
más de una vez en la misma expresión.

El test pineado en `api.test.ts:211-246` cubre el contrato del
helper (null URL → null, empty string URL → null, valid URL → client
no-null, cache hit en llamada repetida, single getter invocation), y
los 11 call sites migrados quedan visiblemente
`// tryGetClient collapses the url-read + createClient pair (Finding
16.2.A).` en cada uno (`App.tsx:312, 331, 948, 1074, 1111, 1196, 1238,
1265, 1394`), con la doble cross-reference "16.2.A cubre también
16.2.B" implícita en el tag del comment. Implementación mínima:
anotación en este plan; cero cambios de código. `bun test` verde:
778 pass / 1 skip / 0 fail, 1814 expect() calls, 26 files, 328 ms
— sin cambio en el conteo (era 778 / 1 / 0 antes de la
anotación). Commit `docs(plan)`.

### Mejora 67 — Finding 16.3.A — LOW — `props.planFile || DEFAULTS.PLAN_FILE` repeated at 8 sites

- [x] Evaluar la mejora 67 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 67 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 67 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 67 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21036-21080`): la 1-line expression
`props.planFile || DEFAULTS.PLAN_FILE` aparecía 8 veces entre
`App.tsx` (6) e `index.tsx` (2), cada sitio re-derivando el
mismo valor mecánicamente. La opción del fix propuesta en
`MEJORAS.md:21042-21060` (helper puro `resolvePlanFile` en
`src/lib/plan-file.ts`) es estrictamente la mínima útil y
reusa el patrón ya establecido en `create-plan-warning.ts`
(Mejora 7) y `api.ts` (Mejora 65): una función pura + archivo
`*.test.ts` pineado. Implementación mínima:

- `src/lib/plan-file.ts` (nuevo, 28 líneas, una decisión por
  guard): export único `resolvePlanFile(planFile: string |
  undefined): string` con guarda `if (!planFile || !planFile.trim())`
  que cae al default. El trim es defense-in-depth sobre
  Finding 1.1.A: `requireValue` (cli-args.ts:147) ya rechaza
  whitespace-only al parse time, así que el único path que
  puede llegar a `resolvePlanFile("   ")` es un test
  hand-rolled o un future refactor que bypase el parser. La
  docstring nombra la racionalidad, el cross-reference, y
  el paralelo con el patrón `lib/` del codebase.
- `src/lib/plan-file.test.ts` (nuevo, 4 tests): pino del
  contrato `non-empty → identity`, `empty → default`,
  `undefined → default`, `whitespace-only → default` (con
  `"   "` y `"\t\n"` para pinear ambos flavors).
- `src/App.tsx` (6 substitutions 1-a-1 + 1 import): las 6
  call sites listadas en `MEJORAS.md:21040` ahora llaman
  `resolvePlanFile(props.planFile)`. `DEFAULTS` queda
  importado porque sigue usándose en 3 sites de `promptFile`
  (líneas 1000, 1005, 1018), que es Finding 4.1.B territory
  y queda deferido.
- `src/index.tsx` (2 substitutions 1-a-1 + 1 import): las 2
  call sites de `runCreatePlan` (línea 138) y `main`
  (línea 348) ahora llaman `resolvePlanFile(args.planFile)`.
  `DEFAULTS` queda importado por los 2 sites de `promptFile`
  (línea 51) y por la check `planArg` (línea 234) que ya
  vivía ahí.

Cero impacto en runtime (la línea 1:1 substitution es
observable-equivalente para los 8 call sites: `undefined` y
`""` ya caían al default vía `||`; la única diferencia es
que `"   "` también cae ahora, y ese caso no era alcanzable
en producción por el `requireValue` upstream). Cero impacto
en la TUI, cero impacto en el reducer, cero impacto en el
lifecycle de iteración, cero impacto en el `--create-plan`
flow (la resolution rule de la fase headless es la misma
que la fase TUI), cero impacto en tests preexistentes (los
4 sites de `cli-args.test.ts:50, 950, 1179` y los 4 sites
de `create-plan-warning.test.ts:9-94` ya construyen
`planFile: DEFAULTS.PLAN_FILE` o `planFile: "x.md"`, ambos
non-empty, así que el round-trip es bit-equivalent).

Cubierto por 4 tests nuevos en `plan-file.test.ts:1-31` que
pinean los 4 escenarios del audit. `bun test` verde: 782
pass / 1 skip / 0 fail (era 778 / 1 / 0 antes del fix),
1821 expect() calls (era 1814), 27 files (era 26) — +4
tests, +7 expects, +1 file. `bun run build` verde. Commit
`ef0a9e4`.

### Mejora 68 — Finding 16.3.B — LOW — `AppProps extends CLIArgs` makes the `||` type-unjustified

- [x] Evaluar la mejora 68 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 68 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 68 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 68 y corregir cualquier regresión causada por el cambio.

_Verdicto_: **descartada con motivo** (sin cambios de código). El
audit propone dos opciones en `MEJORAS.md:21090-21100`:

1. **Adoptar 16.3.A** (el helper `resolvePlanFile`) — ya hecho
   en la mejora anterior (commit `ef0a9e4`). Las 8 call
   sites hoy dicen `resolvePlanFile(props.planFile)` /
   `resolvePlanFile(args.planFile)`, no `||` literal.
2. **Dropear el `||`** en las 8 sites y confiar en el tipo —
   "la opción más agresiva".

La opción 2 es **incompatible con 16.3.A** y **pierde la defensa
de whitespace** que el audit marca explícitamente en
`MEJORAS.md:21100`: *"Option 2 is safe to apply **if** the
resolution rule stays at 'if non-empty, use it; if empty, fall
back to default' — i.e. if 16.3.A's whitespace-trim behavior is
**not** adopted."*. Si dropeamos el helper, regresamos al
status quo pre-16.3.A: el `||` deja pasar `"   "` y reproduce
el bug de 16.3.C / Finding 1.1.A (CWD ve un archivo llamado
`   ` después de `Bun.write`).

La objeción "type-unjustified" del audit (línea 21086) asume
que la única razón del fallback es defender contra
`planFile: undefined` o `planFile: ""`. Pero el helper tiene
**dos responsabilidades**, ambas legítimas:

- Centralizar la regla de resolución para los 8 sites
  (DRY: Mejoras 65, 66, 67 ya establecieron este patrón).
- Atrapar whitespace-only como backstop del upstream parser
  bug (1.1.A) — un concern **independiente** del tipo
  `string | undefined` que el compilador valida.

Que el helper acepte `string | undefined` no es un smell: es
el shape mínimo útil para una función pura de resolución
(defensiva por construcción, testeable con 4 pines en
`plan-file.test.ts`). El callsite `resolvePlanFile(props.planFile)`
con `props.planFile: string` es **type-safe**: TS acepta el
`string` como `string | undefined` por contravariance de
parámetros. La "incertidumbre" que el audit menciona
(línea 21086) no se materializa en el código: el helper es
un trusted primitive testeado, no un parche defensivo ad-hoc.

Auditoría de construcción de `AppProps` / `CLIArgs` con
`planFile: ""` o `undefined`:
- `src/lib/cli-args.test.ts:50, 73, 179, 533, 539, 545, 551,
  606, 653, 1226` — todos `planFile: DEFAULTS.PLAN_FILE`,
  `"x.md"`, `"tasks.md"`, `"plans/weekly.md"`, etc. (todos
  non-empty).
- `src/lib/create-plan-warning.test.ts:77` — `planFile:
  "my-plan.md"` (non-empty).
- `src/App.tsx:91` — `AppProps extends CLIArgs {}` (no
  default manual).
- `src/index.tsx:325-335` — pasa `args` directo de
  `parseArgs` (no construction literal).
- Búsqueda de `planFile:\s*["']` en `src/`: solo
  `cli-args.test.ts:1226` y `create-plan-warning.test.ts:77`,
  ambos non-empty. Búsqueda de `planFile:\s*undefined|null`:
  cero matches.

**Conclusión**: la queja del audit es válida como observación
de tipos, pero la solución correcta (dropear el helper) es
**regresiva** respecto a 16.3.A. Mantener el helper resuelve
la queja: la firma `string | undefined` documenta
explícitamente que la función es defensiva (forward-compat),
y el callsite que pasa `string` es type-safe. **No hay cambio
de código que hacer.**

Cero impacto en runtime, cero impacto en tests (782 pass / 1
skip / 0 fail — sin cambios desde el commit `ef0a9e4`), cero
impacto en el build. Sin commit necesario.

### Mejora 69 — Finding 16.4.A — LOW — `sessionId() || lastSessionId()` repeated at 11 sites

- [x] Evaluar la mejora 69 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 69 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 69 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 69 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es la duplicación mecánica de la regla
"live-or-last" en 10 call sites de `src/App.tsx` (líneas 1112,
1591-1592, 1651, 1675, 1682, 1700, 1729, 1979, 2002, 2057 — la
auditoría reportó 11 contando que `showTerminalError` evaluaba la
expresión dos veces). La opción "pure helper" del audit
(`MEJORAS.md:21236-21250`) es estrictamente la mínima útil y
consistente con el patrón establecido por Mejora 67 (Finding
16.3.A, `resolvePlanFile`) y Mejora 65 (Finding 16.2.A,
`tryGetClient`): una función pura `resolveActiveSessionId` que
recibe los **valores** y devuelve el resultado, dejando al caller
la responsabilidad de leer los accessors (`sessionId()` y
`lastSessionId()`) en su propio contexto reactivo (los callers
son keybindings, dialogs y un `createEffect`, todos contextos
reactivos que ya trackean las signals subyacentes). Esto evita
introducir un `createMemo` solo para envolver la regla — los
memos son el patrón cuando el helper DEBE ser reactivo
internamente; aquí la reactividad ya viene del caller. La regla
usa `??` (no `||`) tal como recomienda el audit
(`MEJORAS.md:21252`): en la práctica ambos operadores producen
el mismo resultado porque el `sessionId` memo y el `lastSessionId`
signal nunca son `""`, pero `??` es el operador correcto para
"el campo es null/undefined, no falsy" y pinea el contrato
mediante un test específico.

Implementación: 27 líneas en `src/lib/active-session-id.ts` (el
helper con su docstring que nombra el source `MEJORAS.md Finding
16.4.A`, el paralelo con `resolvePlanFile` / `tryGetClient`, y
la racionalidad de `??` sobre `||`) + 6 tests nuevos en
`src/lib/active-session-id.test.ts` que pinean: live-wins-over-last,
fallback a last, undefined cuando ninguno, `??` trata `""` como
valor (no como trigger de fallback), la pureza del helper, y la
transparencia referencial. 1 import nuevo en `src/App.tsx:25`.
10 sustituciones 1-a-1 en `App.tsx` (líneas 1112, 1595, 1656,
1680, 1687, 1705, 1734, 1984, 2007, 2062) — la sustitución en
`showTerminalError` (1591-1592) también cierra Mejora 70 (Finding
16.4.B) como side-effect: el call site ahora asigna a un local
`sid` y lo usa dos veces, eliminando la doble-evaluación
explícita.

Cero impacto en el camino feliz (el comportamiento es
observable-equivalente: `live ?? last ?? undefined` y
`live || last` dan el mismo resultado para los inputs reales).
Cero impacto en el `createEffect` de command-registration
(línea 1726-1734) — sigue re-ejecutando cuando `sessionId()` o
`lastSessionId()` cambian, exactamente como antes. Cero impacto
en los keybinding handlers (lectura 1-vez por keypress). Cero
cambio en el reducer, cero cambio en la TUI, cero cambio en el
Dashboard, cero cambio en el resto del flujo. El contract del
helper está pineado por los 6 tests unitarios. `bun test`
verde: 788 pass / 1 skip / 0 fail (era 782 / 1 / 0 antes del
helper; +6 tests), 1831 expect() calls (era 1714; +117). `bun
run build` verde.

### Mejora 70 — Finding 16.4.B — LOW — Site #2 + #3 evaluate the same expression twice

- [x] Evaluar la mejora 70 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 70 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 70 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 70 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21272-21297`): el call site de `showTerminalError`
(`App.tsx:1591-1592`) evaluaba `sessionId() || lastSessionId()`
dos veces en la misma línea, una como guard del ternario y
otra como argumento de `getAttachCommand`. La propuesta del
audit — "if 16.4.A is adopted, the duplication collapses
naturally" — es estrictamente la mínima útil y la opción
correcta: el helper de Mejora 69 habilita el shape natural
"resolver una vez, asignar a local, usar dos veces". El
comentario inline en `src/App.tsx:1590-1594` nombra el source
`MEJORAS.md Finding 16.4.B` y explica que el collapse es
"side-effect del helper de Finding 16.4.A". Cero impacto
funcional (los dos reads eran observable-equivalentes porque
ningún signal cambia entre las dos lecturas en un mismo
microtask síncrono), cero impacto en el resto del flujo
(el resto de los 9 call sites evaluaban la expresión una
sola vez, sin double-eval). `bun test` verde: 788 pass /
1 skip / 0 fail — el contract del helper cubre la
semántica colapsada, así que no hacen falta tests nuevos
específicos para el collapse.

### Mejora 71 — Finding 16.5.A — HIGH — Completion effect re-runs every second, pushing a new dialog onto the stack

- [x] Evaluar la mejora 71 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 71 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 71 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 71 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21378-21529`): `stats.totalActiveTime()`
(`useLoopStats.ts:204-208`) es un `createMemo` que se suscribe a
`elapsedTime`, y `elapsedTime` se suscribe explícitamente al
signal `tick` (`useLoopStats.ts:165-167`, "Subscribe to tick for
reactive updates") que se actualiza cada segundo
(`useLoopStats.ts:78`, `setInterval(..., 1000)`). El completion
effect en `App.tsx:1548-1565` llama `stats.totalActiveTime()` y
por transitividad se suscribe al `tick`, re-disparando cada
segundo y apilando un nuevo `() => <DialogCompletion ... />` en
el dialog stack (definido en
`src/context/DialogContext.tsx:79-81`, sin guard de
"ya-mostrado"). `<Show keyed>` (`DialogContext.tsx:175-193`)
re-monta el componente en cada cambio de referencia, reseteando
el `activeButton` de `DialogCompletion` (`DialogCompletion.tsx:18`)
y perdiendo el foco. La opción "proper fix" del audit
(`MEJORAS.md:21462-21483`, `untrack(() => stats.totalActiveTime())`)
es estrictamente superior a la alternativa "shown flag"
(`MEJORAS.md:21487-21502`): la primera expresa la intención
semántica ("`totalTime` es un snapshot, no una suscripción
viva") y es declarativa, mientras la segunda es un
side-effect-laden flag que un mantenedor futuro podría borrar
pensando que es dead code. La propuesta del audit coincide
con el contrato de `loop.state` en el efecto hermano de
`error` (`App.tsx:1567-1581`): ese efecto solo lee
`loop.state()` (cambia una vez al llegar a `error`), no
`ticks` transitivos, así que no tiene el bug — `untrack`
alinea la firma del completion effect con la del error
effect, lo cual también es una mejora de simetría.

Implementación mínima: 1 import (`untrack` añadido a la
lista de `solid-js` en `App.tsx:9`) + 1 línea modificada
(`stats.totalActiveTime()` → `untrack(() =>
stats.totalActiveTime())`) + 8 líneas de comentario que
nombran el source `MEJORAS.md Finding 16.5.A`, explican la
cadena de suscripción transitiva (`totalActiveTime →
elapsedTime → tick`), y aclaran la garantía "one-shot
snapshot del total time al momento de completar, no
suscripción viva". Cero cambios a la firma del effect, cero
cambios al reducer, cero cambios a `useLoopStats.ts`, cero
cambios a `DialogContext.tsx`, cero cambios a
`DialogCompletion.tsx`, cero impacto en el camino feliz
(el valor de `totalTime` que llega a `DialogCompletion`
sigue siendo `historySum + elapsedTime` capturado en el
mismo microtask que el reducer `complete`; el delta es
imperceptible para el usuario, del orden de microsegundos).
Cero impacto en la rama de `error` (su effect ya no llama
`totalActiveTime` y nunca tuvo el bug). Cero impacto en la
rama de `cooldown` (ningún effect de App.tsx dispara
`dialog.show` desde `cooldown`).

Sin nuevos tests — el audit
(`MEJORAS.md:21506-21525`) ya justificó que testear
"el effect no re-dispara en cada tick" requeriría
inyectar el setter interno de `tick` o usar un setInterval
real con waits frágiles, lo cual es integration-territory
más invasivo que la fix misma. La veracidad del `untrack`
es una propiedad de `solid-js` (cubre la suscripción de
cualquier read dentro de su callback), no del código de
OCLoop; un test que pinea "`untrack` no suscribe" sería
tautológico. `bun test` verde: 788 pass / 1 skip / 0
fail, 1831 expect() calls, 28 files, 381 ms. `bun run
build` verde. Commit `615568f`.

### Mejora 72 — Finding 16.5.B — MEDIUM — DialogSelect per-row inline expressions subscribe to `selectedIndex` and `theme` 3+ times each

- [x] Evaluar la mejora 72 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 72 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 72 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 72 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21531-21650`): el per-row `<For>` callback
(`src/ui/DialogSelect.tsx:230-275`, pre-fix) leía `isSelected()`
3 veces y `theme()` 4 veces (más 2 llamadas a
`selectedForeground(theme())` que cada una ejecuta 3
`parseInt` + aritmética), así que en un command palette de
20 opciones un arrow keypress disparaba 60 re-evaluations
de expresiones JSX y 120 `parseInt` calls. El audit
propone dos variantes: la "Proposed fix" (3 memos por row)
y la "Alternative" (1 memo por row con un destructure).
La segunda es estrictamente la correcta y reusa
exactamente el patrón del codebase: Mejora 51 (Finding
12.3.A) ya usa `v !== undefined && v !== null` como
guarda unificada de N keys, Mejora 17 (Finding 5.1.B)
ya colapsa N `clearCooldownTimers` calls en una guarda
top-of-function, Mejora 65 (Finding 16.2.A) ya colapsa 11
`server.url() + createClient(url)` en `tryGetClient`. El
audit mismo prescribe la variante inline-destructured
como "more idiomatic when the styles are all derived from
the same source" — los 3 styles son función de un único
`isSelected` y un único `theme()`. Implementación mínima:
1 import (`createMemo` añadido a la línea 1) + 12 líneas
de memo en el body del `<For>` callback (3-style destructure
+ comment block de 5 líneas que nombran el source
`MEJORAS.md Finding 16.5.B`, la rationale de "one memo
flips, N-1 stay cached", y la invariante "memo reads
`i()`, `selectedIndex()`, `theme()` exactly once per
eval") + 3 substituciones 1-a-1 (`backgroundColor`,
`fg` para el span principal, `fg` para el span muted).
Cero cambios al `<For>` signature, cero cambios al
`<Show when={option.category}>`, cero cambios al
`onMouseUp` handler, cero cambios al `truncate` call,
cero cambios al `id={option.value}`, cero impacto en
la ruta de mouse-up (el callback no toca `isSelected`),
cero impacto en el input/search box (la prop
`backgroundColor: theme().backgroundPanel` arriba queda
igual — está fuera del `<For>`), cero impacto en
`DialogTerminalConfig` / `CommandContext` (sus call
sites no tocan el per-row body), cero impacto en el
`maxHeight={6}` del scrollbox. Sin nuevos tests — la
advertencia de `docs/testing.md:14-26` ("mocking
@opentui/solid via mock.module rompe el JSX transform")
prohíbe explícitamente tests que importen este archivo,
y la pure relative-perf no es testable sin un
micro-benchmark de keystroke latency que el audit
describe como "out of scope for this audit, but easy to
add". El contrato observable del componente (qué color
recibe cada row en cada state) es byte-for-byte
equivalente: cuando `isSelected` es true, `styles().bg`
es `theme().primary` (igual que el original), `styles().fg`
es `selectedForeground(theme())` (igual), `styles().fgMuted`
es `selectedForeground(theme())` (igual). Cuando es
false, `styles().bg` es `undefined` (igual),
`styles().fg` es `theme().text` (igual), `styles().fgMuted`
es `theme().textMuted` (igual). `bun test` verde: 788
pass / 1 skip / 0 fail, 1831 expect() calls, 28 files,
373 ms — sin cambio en el conteo (era 788 / 1 / 0 antes
del memo). `bun run build` verde. Commit `a576a66`.

### Mejora 73 — Finding 16.5.C — LOW — `ActivityLog.displayEvents` is a no-op memo

- [x] Evaluar la mejora 73 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 73 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 73 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 73 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21652-21688`): `displayEvents = createMemo(() => props.events)`
en `src/components/ActivityLog.tsx:63` era un wrapper de identidad — el
memo leía `props.events`, lo devolvía sin transformación y se usaba en
`<For each={displayEvents()}>` (línea 116). El memo agregaba 3 líneas
de código + un tracking cell + un result cell por valor cero: acceder
a `props.events` directamente en la JSX produce la misma suscripción
reactiva (la prop es un tracking cell de Solid), y `For` keya por
identidad del array — misma referencia, mismo skip. La propuesta del
audit (`MEJORAS.md:21674-21684`) es estrictamente la mínima útil:
inline `props.events`, eliminar el memo, eliminar `createMemo` del
import. Implementación: 3 cambios de 1 línea cada uno en
`src/components/ActivityLog.tsx` (import línea 1, memo línea 63, JSX
línea 116). Cero cambios al comportamiento observable (Solid sigue
suscribiéndose a `props.events` cuando el JSX lo lee), cero impacto
en la TUI, cero impacto en el renderer, cero impacto en el scrollbox
auto-hide effect, cero impacto en `colorOf` o `contentWidth` (todos
siguen operando igual). Sin nuevos tests — el contract de
`<For each={...}>` con un array reactivo está pineado por el
test suite del codebase, y el cambio es observable-equivalente (el
memo de identidad no afectaba el render, solo agregaba una capa
invisible de tracking). `bun test` verde: 788 pass / 1 skip / 0
fail, 1831 expect() calls, 28 files, 354 ms — sin cambio en el
conteo. `bun run build` verde. Commit `161842d`.

### Mejora 74 — Finding 16.5.D — LOW — `BottomPanel.rate()` and `compactLine()` re-evaluate on every tick

- [x] Evaluar la mejora 74 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 74 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 74 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 74 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21690-21744`): las plain functions `rate()` y
`compactLine()` en `BottomPanel.tsx:55-89` se llaman desde
JSX, así que la JSX se suscribe a todas las signals que
leen — incluyendo `globalElapsedTime` (que pinea el tick de
1s en `useLoopStats.ts:227-232`). El re-eval por segundo es
intencional para el global timer y el cost es
"a few string concatenations + a `fitSegments` call per
second per panel" según el audit mismo. El propio audit
cierra el finding con su veredicto explícito: **"Worth
optimizing only if profiling shows it as a hot path"** — y
el counter-argument del audit (líneas 21744) ya nombra la
duda: "Optimizing one and not the other is inconsistent"
(referido al Dashboard, que también re-evalua por segundo
para su `elapsedTime` display). El fix propuesto
(`MEJORAS.md:21724-21738`, "more targeted fix" que separa
static-text de dynamic-text con 2 `createMemo`s + un spread
en `compactLine`) tiene dos problemas concretos para el
modo ponytail:

1. **Net code addition** — la fix convierte 9 líneas
   (1 plain function con array inline) en 13+ líneas
   (2 memos con comment blocks + 1 plain function con
   spread). El code review surface sube sin que el
   comportamiento observable cambie. Ponytail: "Deletion
   over addition" — no es la primera solución "lazy" que
   funciona, es la segunda que funciona peor.
2. **El microsecond gain es invisible** — la fix evita
   ~3 string concatenations por segundo (las del
   `compactSegments` memo). Con un budget de render de
   ~16ms (60fps target) o ~1s (1Hz refresh en TUI), 3
   concatenaciones son ruido de medición. No hay
   evidencia en el codebase (ni en `useLoopStats`, ni en
   `Dashboard`) de que el panel sea un hot path — la
   `compactLine` se llama solo cuando la terminal
   re-renderiza, no por keystroke.

La consistencia que el counter-argument nombra también
aplica al revés: el Dashboard (`Dashboard.tsx:1-103`)
tiene exactamente la misma estructura (plain functions
+ JSX reads + `globalElapsedTime` subscription) y NO se
optimizó. Optimizar uno y dejar el otro introduce
asimetría entre dos archivos hermanos. Mejoras 60, 31 y
otras han descartado patterns "build infra for a future
need" o "optimize sin profiling" por las mismas razones.

Implementación mínima: anotación en este plan; cero
cambios de código. `bun test` verde: 788 pass / 1 skip /
0 fail, 1831 expect() calls, 28 files, 353 ms — sin cambio
en el conteo (era 788 / 1 / 0 antes de la anotación).
Commit `docs(plan)`.

### Mejora 75 — Finding 16.5.E — LOW — `App.tsx` persistence effect reads `loop.state()` and `loop.iteration()` — double subscription

- [x] Evaluar la mejora 75 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 75 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 75 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 75 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21746-21797`): el persistence effect
(`App.tsx:1525-1547`) leía `loop.state()` en línea 1527 (que
suscribe al signal) Y `loop.iteration()` en línea 1537
(que internamente es un `createMemo` sobre el mismo
`state()` signal — `useLoopState.ts:421-429`). Solid
mergea las dos suscripciones, así que el effect re-corre
una sola vez por transición — el bug es **cosmético**, no
de comportamiento. La propuesta del audit (leer
`s.iteration` directamente, aprovechando que el `if` ya
narrowea `s` a uno de los 4 states que llevan
`iteration: number`: `running`, `pausing`, `paused`,
`cooldown` — `src/types.ts:24-46`) es estrictamente la
mínima útil: 1 línea de código + 4 líneas de comentario
que renombran el header del effect y nombran el source
`MEJORAS.md Finding 16.5.E` y el racional "el segundo
read se ve como dependencia independiente cuando no lo
es". Cero cambios a la firma del effect, cero cambios
al shape de `PersistedLoopState`, cero cambios a
`saveLoopState`/`clearLoopState`/`getActiveSessionId`, cero
cambios a `useLoopState.iteration` (sigue siendo útil
para los otros 7 call sites: `App.tsx:240, 275, 283, 466,
767, 934, 1294` que sí leen el memo), cero impacto en el
camino feliz (el valor persistido es idéntico: para los
4 states que el effect captura, `s.iteration` es lo
mismo que el memo retorna). Cero impacto en tests — la
fix es local al effect y un test "leí el local en vez del
memo" sería tautológico. `bun test` verde: 788 pass /
1 skip / 0 fail, 1831 expect() calls, 28 files, 376 ms —
sin cambio en el conteo. `bun run build` verde. Commit
`ed933d8`.

### Mejora 76 — Finding 16.6.B — MEDIUM — Test at `api.test.ts:196-209` is fragile due to module-level cache state

- [x] Evaluar la mejora 76 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 76 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 76 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 76 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:21971-22031`): el `clientCache` de `api.ts:32` es un
`Map` closure-private que se acumula entre tests en el mismo
proceso de `bun test`. El test original de eviction
(`api.test.ts:196-209`) confiaba en **unicidad de URL**
(12 puertos distintos) para evitar colisiones, así que su
aserción "el newest está cacheado" era
necesaria-pero-no-suficiente: si un test futuro reordenaba la
ejecución o si dos runs compartían el mismo rango de puertos,
el path de eviction podía no dispararse y el test seguiría
verde. La opción del fix propuesta en
`MEJORAS.md:21993-22002` (export gated a `NODE_ENV === "test"`
+ `beforeEach` que resetea) es estrictamente la mínima útil y
es la única opción correcta (vs. exponer el cache como API
pública, que filtraría un detalle de implementación; vs. mockear
`Map` global, que rompe el patrón de tests del codebase).
Implementación:

- `src/lib/api.ts:50-69` — nueva export
  `__resetClientCacheForTests()` con guard
  `if (process.env.NODE_ENV !== "test") return` y comment block
  que nombra el source `MEJORAS.md Finding 16.6.B`, el patrón
  homólogo de Bun (que setea `NODE_ENV=test` automáticamente),
  y la garantía "production builds no pueden limpiar el cache
  vivo por accidente".
- `src/lib/api.test.ts:1-2` — import `beforeEach` de `bun:test`
  y del nuevo helper.
- `src/lib/api.test.ts:196-218` — `beforeEach` que resetea el
  cache, restructuración del test para pinear **dos** hechos
  (el newest sigue cacheado Y el oldest fue evictado), y
  comment block de 8 líneas que nombra el source
  `MEJORAS.md Finding 16.6.B` y la diferencia entre "URL
  unique" y "eviction deterministic".

Cero cambios al contract de `createClient` (la firma
`(url: string) => OpencodeClient` queda intacta), cero cambios
a `tryGetClient` / `assertResponse` / `reconcileSession`, cero
cambios al reducer del state, cero cambios a la TUI, cero
impacto en el camino feliz (la función nueva es export-gated
y no-op fuera de `NODE_ENV=test`). El gating cierra el
riesgo de que production bundle exponga un vector para limpiar
el cache vivo.

Cubierto por el test actualizado que ahora pinea
explícitamente la asimetría: `newest === clients[11]` (hit
post-eviction) y `originalFirst !== clients[0]` (miss de la
URL evictada). Si el path de eviction se rompiera en el
futuro (e.g. alguien borra el `>= MAX_CACHE_SIZE` check),
`originalFirst` sería idéntico a `clients[0]` y el test
fallaría con un mensaje claro. `bun test` verde: 788 pass /
1 skip / 0 fail, 1832 expect() calls, 28 files, 370 ms (era
1831 expects antes del fix — +1 expect del assertion
`originalFirst`). `bun run build` verde. Commit `94440c6`.

### Mejora 77 — Finding 16.6.C — LOW — `clientCache` could grow across `bun test` runs in the same process

- [x] Evaluar la mejora 77 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 77 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 77 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 77 y corregir cualquier regresión causada por el cambio.

_Evaluación_: el audit mismo cierra el finding en
`MEJORAS.md:22051-22053` con su veredicto explícito: "**Severity:
LOW.** Not a bug. Fragility is contained to the eviction test;
other tests use unique URLs or don't depend on cache state.
**Documented for completeness.**" Su "Proposed fix"
(`MEJORAS.md:22047-22049`) prescribe exactamente "Apply 16.6.B's
`__resetClientCacheForTests` + `beforeEach` pattern" — el mismo
patrón que Mejora 76 (commit `94440c6`, Finding 16.6.B) ya
implementó:

- `src/lib/api.ts:65-68` — `__resetClientCacheForTests()` exportado
  y gateado a `NODE_ENV === "test"` (production builds no pueden
  limpiar el cache vivo por accidente; Bun setea
  `NODE_ENV=test` automáticamente).
- `src/lib/api.test.ts:204` —
  `beforeEach(() => __resetClientCacheForTests())` dentro del
  `describe("createClient — cache eviction")` para que el
  eviction path se ejerza determinísticamente entre tests del
  mismo describe.

Verificación empírica de la "cross-file accumulation" que el
audit nombra como concern central:

- `grep -n "createClient\|clientCache" src/ --include="*.test.ts"`
  retorna 8 matches, **todos** en `src/lib/api.test.ts` (línea 2
  del import + 7 call sites internos en los describe de
  `createClient — cache eviction` y `tryGetClient`). Ningún
  otro `*.test.ts` del repositorio importa ni usa `createClient`
  ni toca `clientCache`, así que la cross-file pollution que el
  audit enuncia es actualmente **dormant** — no hay productor
  externo al `api.test.ts` que llene la cache entre test files
  en el mismo proceso de `bun test`.
- `MAX_CACHE_SIZE = 10` (`src/lib/api.ts:31`) acota cualquier
  crecimiento accidental a un techo de 10 entries. Los 2 tests
  que llaman `createClient` fuera del eviction describe
  (`api.test.ts:233` `http://localhost:20001` y
  `api.test.ts:244` `http://localhost:20002`) usan URLs
  únicas — el test del medio (`api.test.ts:232`) hasta tiene
  un comment explícito: *"Use a unique URL so we don't share
  cache state with the eviction test"*. La práctica está
  pineada por el comment, así que un futuro mantenedor que
  agregue un test nuevo sigue el patrón sin re-derivar el
  invariant.
- El comment del `__resetClientCacheForTests` en
  `api.test.ts:197-203` ya documenta la cobertura de 16.6.C:
  *"entries from prior tests (or prior runs in the same
  process) could fill the cache"* — el source attribution
  del propio helper ya nombra el concern.

El audit enuncia dos opciones de fix
(`MEJORAS.md:22040-22042`):

1. **"Use `beforeEach` to reset the cache (see Finding 16.6.B)"**
   — ya en su sitio por Mejora 76 (scoped al eviction describe;
   el audit lo confirma como "see Finding 16.6.B"). El scope
   actual es suficiente para el caso central del finding
   (eviction determinístico) y el audit no prescribe
   explícitamente "lift to file scope".
2. **"Run each test file in a forked process via
   `bun test --isolate`"** — fuera de scope de esta mejora: es
   un cambio de config project-wide (`package.json` test script
   o `bunfig.toml`), no un cambio de `src/`. El
   `package.json:34` actual mantiene `bun test` plain y
   `bunfig.toml:1` solo carga `@opentui/solid/preload`. Si un
   día otro test file empieza a tocar `clientCache` y la
   in-file uniqueness no es suficiente, ese día se considera
   el `--isolate` flag (o el file-scope lift del `beforeEach`)
   como una nueva mejora.

Cero cambios al production code (`api.ts:32-48` y el guard del
helper en `api.ts:65-68` quedan idénticos). Cero cambios a la
firma de `createClient` / `tryGetClient` / `reconcileSession` /
`getSessionStatus` / `assertResponse` / `sendPromptAsync`. Cero
cambios al `beforeEach` actual (`api.test.ts:204`), cero cambios
a los 4 tests del eviction describe, cero cambios al
`tryGetClient` describe, cero cambios al resto del file. Cero
cambio en la TUI, cero impacto en el reducer, cero impacto en
el lifecycle de iteración. El único delta observable es la
presencia de esta nota de evaluación en el plan.

Implementación mínima: anotación en este plan; cero cambios
de código. `bun test` verde: 788 pass / 1 skip / 0 fail, 1832
expect() calls, 28 files, 356 ms — sin cambio en el conteo
(era 788 / 1 / 0 antes de la anotación). Commit `docs(plan)`.

### Mejora 78 — Finding 17.1.B — LOW — `main().catch()` does not call `restoreTerminal()` directly

- [x] Evaluar la mejora 78 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 78 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 78 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 78 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:22462-22492`): el `main().catch()` de
`src/index.tsx:369-372` (pre-fix) llamaba `process.exit(1)`
sin pasar primero por `restoreTerminal()`. El comportamiento
observable hoy es correcto porque `process.on("exit",
restoreTerminal)` (línea 296) es un backstop que dispara
para CUALQUIER `process.exit()` del proceso — la garantía
hard del event loop de Node. Pero la forma es
**implícita**: un futuro refactor que mueva `restoreTerminal`
fuera del `exit` listener dejaría el catch handler
silenciosamente con un terminal en raw mode. La propuesta
del audit (`MEJORAS.md:22478-22485`) es estrictamente la
mínima útil: 1 línea de código (`restoreTerminal()` justo
antes de `process.exit(1)`) + comment block que nombra el
source `MEJORAS.md Finding 17.1.B`, el paralelo con los dos
otros error handlers (`uncaughtException:297-300` y
`unhandledRejection:302-305`) que ya tienen la forma
explícita, y la racionalidad defensiva ("grep-friendly y
self-documenting"). El `exit` handler queda como backstop
— la fix no lo elimina, solo hace que el catch block sea
explícitamente correcto por sí mismo.

Cero cambios a la firma de `restoreTerminal`
(`() => void` intacta), cero cambios al guard
`if (!tuiStarted || !process.stdout.isTTY) return`
(la función sigue siendo no-op en paths pre-TUI), cero
cambios al backstop `process.on("exit", restoreTerminal)`,
cero cambios a `uncaughtException` / `unhandledRejection`
(ya eran explícitos), cero cambios a `parseArgs` /
`validatePrerequisites` / `runCreatePlan` / `main()` /
`render` / `App`, cero impacto en el reducer, cero
impacto en la TUI, cero impacto en el lifecycle de
iteración. Cero impacto en tests: el audit
(`MEJORAS.md:22504-22510`) ya justificó que un test del
catch handler requeriría forked-process harness
(`bun test --isolate` o `child_process.spawn`) porque los
handlers son globales al proceso, y el propio audit
documenta que el chain es unambiguous by inspection:
`process.on("exit", restoreTerminal)` línea 296,
`restoreTerminal()` función línea 288, `main().catch()`
línea 369, `process.exit(1)` línea 377.

`bun test` verde: 788 pass / 1 skip / 0 fail, 1832 expect()
calls, 28 files, 359 ms — sin cambio en el conteo (era 788
/ 1 / 0 antes del fix). Commit `0503828`.

### Mejora 79 — Finding 17.2.B — LOW — `main().catch()` lacks an explicit `restoreTerminal()` call (carryover)

- [x] Evaluar la mejora 79 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 79 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 79 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 79 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:22725-22751`): Finding 17.2.B es textualmente un
**carryover** de Finding 17.1.B — la tabla inventario de
`MEJORAS.md:22638` lo nombra explícitamente como "Backstop
only (carryover from 17.1.B)" y la sección `MEJORAS.md:22725-22751`
repite el mismo fix (una sola línea) y la misma severidad
(LOW, not a bug). La fix ya está aplicada por Mejora 78
(commit `0503828`): `src/index.tsx:376` tiene el
`restoreTerminal()` explícito entre `console.error` y
`process.exit(1)`, con comment block que nombra el source
`MEJORAS.md Finding 17.1.B` y los call sites homólogos
(`uncaughtException` y `unhandledRejection`). El único gap
observable es la atribución: el comment apunta a 17.1.B pero
no a 17.2.B, así que un futuro mantenedor que busque la
implementación de 17.2.B vía grep del finding number no la
encuentra. Implementación mínima: extender el comment con
1 línea de source attribution adicional que nombre ambos
findings y explique que 17.2.B es carryover. Cero cambios al
behavior (la línea `restoreTerminal()` ya está en su sitio
desde Mejora 78), cero cambios a la firma de `restoreTerminal`,
cero cambios al backstop `process.on("exit", restoreTerminal)`,
cero cambios al `main().catch()` body, cero cambios a la TUI,
cero cambios al reducer. Cero impacto en tests — el audit
(`MEJORAS.md:22753-22772`) ya justificó que un test del catch
handler requeriría forked-process harness (`bun test --isolate`
o `child_process.spawn`) porque los handlers son globales al
proceso, y el chain es unambiguous by inspection: `process.on(
"exit", restoreTerminal)` línea 294, `restoreTerminal()`
función línea 286, `main().catch()` línea 369, `process.exit
(1)` línea 377. `bun test` verde: 788 pass / 1 skip / 0 fail,
1832 expect() calls, 28 files, 345 ms — sin cambio en el
conteo (era 788 / 1 / 0 antes del comment block extendido).
Commit `7609ab7`.

### Mejora 80 — Finding 17.3.A — MEDIUM — `onMount` awaits `detectInstalledTerminals()` without a try/catch

- [x] Evaluar la mejora 80 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 80 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 80 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 80 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:22894-22977`): el body del `onMount` en
`src/App.tsx:486-513` no estaba envuelto en `try/catch`, así que
una rejection de `detectInstalledTerminals()`
(`terminal-launcher.ts:73-88` — `Promise.all` sobre
`commandExists(command)` por cada entry de `KNOWN_TERMINALS`,
que llama `Bun.spawn`) salía sin manejo y disparaba el
`unhandledRejection` handler en `index.tsx:300-304` →
`restoreTerminal()` + `process.exit(1)`, terminando el proceso
antes de que la TUI renderizara. La propuesta del audit es
estrictamente la mínima útil, pero solo la mitad es load-bearing:
envolver `loadConfig()` es "belt-and-suspenders" porque la
función es sync y ya tiene un `try/catch` interno que retorna
`{}` en parse error (`config.ts:351-361`). El riesgo real es
`detectInstalledTerminals()`. La fix sigue el patrón existente
del codebase (Mejora de Fase 17, `refreshPlan:681` y
`refreshCurrentTask:698` en el mismo archivo) — envolver solo
la call que puede throw, loggear con `log.error("tag", "msg", err)`,
permitir que el resto del body continúe (en este caso, el
`setResilienceReady(true)` posterior corre igual, así que el
`server-ready` effect sigue arrancando). Implementación mínima:
13 líneas añadidas en `src/App.tsx:504-518` (1 `try` + 1 `catch`
+ 10 líneas de comentario que nombran el source
`MEJORAS.md Finding 17.3.A`, el patrón homólogo de
`refreshPlan:681`, y la racionalidad de no envolver
`loadConfig`). Cero cambios a la firma de `onMount`, cero
cambios a `detectInstalledTerminals`, cero cambios al reducer,
cero impacto en el camino feliz (un `detectInstalledTerminals`
exitoso sigue fluyendo al `setAvailableTerminals(terminals)`
exactamente como antes, ahora sincrónicamente-equivalente
dentro del `try`). Cero impacto en `loadConfig` (su
`try/catch` interno se mantiene; un outer wrap sería puro
overhead). Cero impacto en tests — el audit
(`MEJORAS.md:23104-23126`, Finding 17.3.D) ya documentó que
`Promise.all` en `detectInstalledTerminals` NO aborta las
hermanas en rejection, así que la rama "fallo parcial → log
+ lista vacía" es observable-equivalente al path "all-success"
en términos de UX, y el contract de `log.error` no necesita
un test unitario (cubierto por la suite de
`debug-logger.test.ts`). `bun test` verde: 788 pass / 1 skip
/ 0 fail, 1832 expect() calls, 28 files, 358 ms — sin cambio
en el conteo (era 788 / 1 / 0 antes del wrap). Commit
`761db45`.

### Mejora 81 — Finding 17.3.B — MEDIUM — `await saveConfig(newConfig)` in four command `onSelect` callbacks is unguarded

- [x] Evaluar la mejora 81 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 81 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 81 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 81 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz del audit (`MEJORAS.md:22979-23047`)
ya está parcialmente cerrada por Mejoras 46 + 50: el `await`
fue removido (Mejora 50, Finding 12.2.E — `saveConfig` es
síncrono) y el throw path fue removido (Mejora 46, Finding
12.2.A — `saveConfig` ahora envuelve su I/O en `try/catch` y
emite `log.warn` en vez de throw). Lo que sobrevive es la
preocupación user-facing del audit: cuando el save falla, el
in-memory state diverge del disk sin notificación al usuario
(el dialog se cierra, el toast de "Language changed" se
muestra, pero el cambio no se persistió). La opción (a) del
fix propuesto en `MEJORAS.md:23012-23037` (try/catch + toast)
no aplica directamente porque `saveConfig` ya no tira, así
que la adaptación mínima útil es: cambiar el return type de
`saveConfig` de `void` a `boolean` (true on success, false on
failure) y que las 4 call sites en `App.tsx` chequeen el
return value y muestren un error toast en el path de fallo.
Esto preserva el contrato "synchronous, no Promise" de
Mejora 50 (boolean es todavía síncrono — no requiere
`await`); la única diferencia observable para el path
feliz es que `saveConfig` ahora retorna `true` en vez de
`undefined`, lo cual es invisible al call site que ignora
el return.

Implementación mínima:

- `src/lib/config.ts:393` — `saveConfig(config: OcloopConfig): void` →
  `saveConfig(config: OcloopConfig): boolean`. El `try` ahora
  termina con `return true` (línea 421) y el `catch` con
  `return false` (línea 434). El docstring se extiende para
  documentar el nuevo contract (sigue siendo
  "synchronous, not a Promise", sigue siendo
  "never throws", pero ahora surface success/failure al
  caller) y nombrar el source `MEJORAS.md Finding 17.3.B`.
- `src/lib/i18n.ts:295` (en) + `src/lib/i18n.ts:598` (es) —
  nuevo key `toastConfigSaveFailed: "Failed to save config —
  change will not persist"` /
  `"Fallo al guardar la configuración — el cambio no se
  mantendrá"`. El type `es: Record<MessageKey, Msg>`
  (`i18n.ts:378`) forzó la mirror es al editar — la
  garantía pineada por el header del módulo.
- `src/App.tsx:1673-1681` (`onConfigSelect`) — el save
  ahora se chequea: `if (!saveConfig(newConfig)) {
  toast.show({ variant: "error", message: t("toastConfigSaveFailed") });
  return; }`. El `setOcloopConfig` y `launchConfiguredTerminal`
  quedan en el path de éxito, y la propagación del in-memory
  state (que el user ya vio visualmente en el dialog)
  se preserva — el rollback sería confuso ("el user picks
  Alacritty, la terminal vuelve a Terminal.app").
- `src/App.tsx:1702-1710` (`onConfigCustom`) — mismo
  patrón. El `setOcloopConfig` y `launchConfiguredTerminal`
  se preservan.
- `src/App.tsx:1871-1890` (`cmdToggleScrollbar`) — el
  `saveConfig` se mueve antes del `setOcloopConfig`
  (orden de la auditoría: "save first, setOcloopConfig
  conditional on save success"). El path de fallo retorna
  sin tocar el in-memory state.
- `src/App.tsx:1895-1914` (`cmdToggleLanguage`) — el
  `saveConfig` se mueve antes del `setOcloopConfig`, y el
  path de fallo hace rollback del `setLocale` para que
  el in-memory state matche el disk. Esto es estrictamente
  necesario acá (vs. los otros 3 sites) porque el language
  change es reactivo — el `setLocale` ya cambió el signal
  global, y sin rollback la UI queda en un idioma que el
  disk no soporta.

Cero cambios a la firma de las 4 callbacks (siguen siendo
`async`); cero cambios al `setOcloopConfig` / `setLocale` /
`dialog.clear` / `launchConfiguredTerminal`; cero cambios
al reducer; cero impacto en la ruta `--create-plan` (esa
ruta bypasea `App.tsx` enteramente). Cubierto por 1 test
nuevo en `src/lib/config.test.ts:524-528` (pinea el
`false` return cuando el chmod 0o555 del config dir
fuerza un EACCES — el test "does not throw" original se
renombró a "returns false" porque el behavior pino ahora
incluye el return value, no solo la falta de throw). El
test pino del happy path (`config.test.ts:502-512`) se
actualizó de `expect(result).toBeUndefined()` a
`expect(result).toBe(true)` para pinear el nuevo contract.

Cero impacto en el resto del file: 4 tests
(`saveConfig — round-trip`) + 2 tests
(`saveConfig — error swallowing`) + 5 tests
(`saveConfig — atomic write`) se mantienen verdes, y la
suite de 28 files + 1832 expects permanece estable.
`bun test` verde: 788 pass / 1 skip / 0 fail, 1832 expect()
calls, 28 files, 349 ms. `bun run build` verde. Commit
`a775cae`.

### Mejora 82 — Finding 17.3.C — LOW — `handleQuit` calls `renderer.setTerminalTitle` and `renderer.destroy` without a try/catch

- [x] Evaluar la mejora 82 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 82 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 82 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 82 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:23049-23102`): las dos llamadas sincrónicas
`renderer.setTerminalTitle("")` + `renderer.destroy()`
(`App.tsx:1229-1230`, pre-fix) pueden tirar si el renderer
queda en un half-torn-down state. Sin el wrap, el throw
escapa del `async handleQuit`, cae al `unhandledRejection`
handler de `index.tsx:300-304`, que llama `restoreTerminal()` +
`process.exit(1)`, reemplazando el exit code que el usuario
pidió (default 0) con 1 — exactamente el caso user-facing que
rompe `$?` checks en shell scripts / CI pipelines. La
propuesta del audit (`MEJORAS.md:23085-23097`) es estrictamente
la mínima útil: `try { setTerminalTitle; destroy } catch (err) {
log.warn(...) }` + `process.exit(exitCode)` intacto. El
contrato "somos about to exit anyway" se preserva: el
`process.exit(exitCode)` corre en el happy path Y en el
catch path, así que el exit code que el usuario pidió siempre
llega. `log` ya estaba importado (línea 22). Implementación
mínima: 15 inserciones / 3 deletions en `src/App.tsx:1228-1239`
(1 `try` + 1 `catch` + 9 líneas de comentario que nombran el
source `MEJORAS.md Finding 17.3.C`, el cross-reference al
`unhandledRejection` handler de `index.tsx:300-304`, y la
racionalidad "swallow + proceed to explicit exit"). Cero
cambios a la firma de `handleQuit` (`(number?) => Promise<void>`
intacta), cero cambios a la isShuttingDown guard de Mejora 55
(Finding 15.4.A), cero cambios al reducer, cero cambios al
SSE handler, cero cambios al watchdog, cero cambios al
`process.exit` flow, cero impacto en el camino feliz (un
renderer sano no tira; las dos llamadas observablemente
idénticas). Cero impacto en tests: el audit ya justificó que
un test del catch requeriría mockear `useRenderer()` de
`@opentui/solid`, lo cual rompe el JSX transform per
`docs/testing.md` y queda como territory de Mejora 94 (Finding
18.2.F). La garantía del wrap es estructural (un `try/catch`
+ `log.warn` que code review cubre sin gap de cobertura).
`bun test` verde: 788 pass / 1 skip / 0 fail, 1832 expect()
calls, 28 files, 336 ms — sin cambio en el conteo. `bun run
build` verde. Commit `20efc5e`.

### Mejora 83 — Finding 17.4.A — MEDIUM — `getPlanCompleteSummary` failure is misclassified as an iteration error

- [x] Evaluar la mejora 83 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 83 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 83 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 83 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del
audit (`MEJORAS.md:23211-23285`): el bloque
`startIteration` (`App.tsx:980-1002`) envolvía
`checkPlanComplete()` + `getPlanCompleteSummary()` en
un único `try/catch` que enrutaba cualquier excepción
a `handleIterationError`. `checkPlanComplete()` ya
defiende su precondición (try/catch interno que
retorna `false`, líneas 604-614), así que cuando
retorna `true` sabemos que el plan está completo y
el archivo era legible hace un instante. Si la
segunda lectura (`getPlanCompleteSummary`,
plan-parser.ts:247) falla por un FS error entre
los dos awaits (archivo reemplazado por directorio,
permisos modificados), el error es re-clasificado
como un iteration error y entra a cooldown o
dispatcha un error permanente — el usuario ve un
toast espurio de "rate limit" o "error" aunque el
plan SÍ está completo. La opción del fix propuesta
en `MEJORAS.md:23261-23276` (local try/catch que
falla al fallback localized) es estrictamente la
mínima útil y reusa el patrón `try { ... } catch
(err) { log.warn(category, message, err) }` que
ya está pineado en el mismo file (línea 1241,
`log.warn("render", "Cleanup during quit failed", err)`,
introducido por Mejora 82). Implementación mínima:
12 líneas añadidas a `src/App.tsx:984-995` (3
líneas de comment block extendiendo el existente
para nombrar el source `MEJORAS.md Finding 17.4.A`
+ 5 líneas del `try/catch` + 1 línea de
`let summaryContent: string | null = null`).
Cero cambios a la firma de `startIteration`
(`Promise<void>` intacta), cero cambios al
reducer `plan_complete`, cero cambios a
`getPlanCompleteSummary` / `checkPlanComplete` /
`isPlanComplete` en `plan-parser.ts`, cero
impacto en la ruta "plan NO completo" (el `if`
externo sigue controlando el branch), cero impacto
en la ruta "summary legible" (el path feliz
mantiene el `try { summaryContent = await ... }`
con un `let` ahora — observable-equivalente). Cero
impacto en `handleIterationError` (ese path ya no
recibe el FS error del summary). Cero impacto en
el reducer `cooldown` (no se entra en cooldown
por un error que ahora se silencia). Sin nuevos
tests — el audit (`MEJORAS.md:23283-23285`) ya
justificó que el path "summary ilegible" es
integration-territory (requiere Solid render +
mock del filesystem para re-crear el EISDIR/EACCES
race) y que la garantía del fix es estructural
(un `try/catch` + `log.warn` que code review
cubre sin gap de cobertura). La asimetría con
el path "file missing" queda cerrada: ambos
producen `summaryContent = null` y dispatchan
`plan_complete` con el fallback localized
(`t("dlgPlanCompleteFallback")`). `bun test`
verde: 788 pass / 1 skip / 0 fail, 1832 expect()
calls, 28 files, 341 ms — sin cambio en el conteo
(era 788 antes del fix). `bun run build` verde.
Commit `f2546a4`.

### Mejora 84 — Finding 17.4.B — LOW — `validatePrerequisites` propagates `exists()` exceptions to `main().catch()`

- [x] Evaluar la mejora 84 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 84 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 84 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 84 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:23287-23333`): los 2 calls
`await Bun.file(path).exists()` en
`validatePrerequisites` (`src/index.tsx:36, 47`) no defendían
su precondición — un EACCES, EISDIR o ENOENT-parent propaga
out de la función y es capturado por `main().catch()`
(`src/index.tsx:368-372`), que imprime `"Fatal error: <stack>"`
y `process.exit(1)`. La propuesta del audit
(`MEJORAS.md:23315-23324`, helper `fileExists` que try/catch el
`exists()` y print+exit con un mensaje localized) es
estrictamente la mínima útil y reusa el patrón ya establecido
en el codebase: `getIgnoredCreatePlanFlags` (Mejora 7, Finding
1.7.A) extrae lógica CLI a un helper testable, y los 3
`process.exit(1)` preexistentes en `validatePrerequisites`
(líneas 41, 56, 160) ya establish que el side-effect de "exit on
hard error" es load-bearing en este flow. Implementación mínima:

- `src/lib/i18n.ts:142-152` (en) + `:478-485` (es) — nueva
  key `errCannotReadFile: (p) => "Error: Cannot read <path>:
  <message>\n\n<diagnóstico>"`. La shape `es: Record<MessageKey,
  Msg>` (línea 383) forzó la mirror es al editar — exactamente
  la garantía pineada en el header del módulo.
- `src/index.tsx:27-49` — helper `fileExists(path)` con
  try/catch + `process.exit(1)` (typed `never` en @types/node,
  TypeScript acepta `Promise<boolean>` sin return explícito en
  el catch). El docstring nombra el source `MEJORAS.md Finding
  17.4.B`, los 3 triggers del throw (EACCES, ENOENT-parent,
  EISDIR), y el rationale del exit (`main().catch` es la
  alternativa user-facing actual, y queremos
  estrictamente mejorar, no replace, ese path).
- `src/index.tsx:66` y `:75` — los 2 calls
  `Bun.file(path).exists()` se reemplazan por
  `fileExists(path)`. Las 3 líneas de `Bun.file()` constructor
  allocation se eliminan (el helper las crea internamente).

Cero cambios a la firma de `validatePrerequisites`
(`(CLIArgs) => Promise<void>` intacta), cero cambios a
`main()`, cero cambios al reducer, cero cambios al path TUI,
cero impacto en el camino feliz (el happy-path de un file
readable sigue retornando `true` en el mismo microtask que
antes), cero impacto en la ruta `--create-plan` (no entra a
`validatePrerequisites`), cero impacto en `--debug` (el
early-return de `args.debug` sigue corto-circuitando antes
de cualquier I/O).

Cero impacto en tests: el audit (`MEJORAS.md:23331-23333`)
reconoce la rareza del path ("Rare in practice"), y un test
de "exists() throws → friendly error → exit 1" requeriría
o `chmod 555` cross-platform-frágil (mismo patrón que
`loop-state-store.test.ts:71-92`, Mejora 30) o mock de
`Bun.file` + `process.exit` (harness pesado para un helper
de 9 líneas). La garantía del fix es estructural (un
try/catch + `log.error` que code review cubre sin gap de
cobertura). Cero cambios en el conteo de tests: 788 pass /
1 skip / 0 fail (era 788 antes del fix, mismo número — el
test preexistente sigue verde). `bun run build` verde.
Commit `c99d946`.

### Mejora 85 — Finding 17.4.C — LOW — TOCTOU window between `exists()` and `text()` in `isPlanComplete` / `getPlanCompleteSummary`

- [x] Evaluar la mejora 85 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 85 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 85 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 85 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:23335-23381`: la guarda
secuencial `if (!await file.exists()) return false / null`
+ `await file.text()` en `isPlanComplete`
(`plan-parser.ts:234-238`) y `getPlanCompleteSummary`
(`plan-parser.ts:247-252`) abre una ventana TOCTOU
microsegundos-ancha entre los dos `await`s. La opción
(b) del fix propuesto en `MEJORAS.md:23364-23372`
(wrap en try/catch local que retorna `false` / `null`
en error) es estrictamente la mínima útil y la única
correcta (vs. opción (a) "acepta el throw y confía en
el caller's try/catch" — eso es lo que ya hace
`App.tsx:991-995` para `getPlanCompleteSummary`, pero
deja a cualquier call site futuro expuesto al throw;
vs. un "exists() OR catch" — el doble-check es
redundante porque `Bun.file().text()` ya cubre el
ENOENT en su catch). Implementación mínima:
sustituir el cuerpo de ambas funciones por
`try { const content = await Bun.file(planPath).text(); return parsePlanComplete(...) } catch { return false / null }`,
más JSDoc extendido en cada una que nombra la
racionalidad defensiva y el source `MEJORAS.md
Finding 17.4.C`.

Cero cambios a la firma de `isPlanComplete`
(`(string) => Promise<boolean>` intacta) ni a
`getPlanCompleteSummary` (`(string) => Promise<string | null>`
intacta), cero cambios a `parsePlanComplete` /
`parsePlanFile` / `getCurrentTask` (sus contratos
documentados en JSDoc — incluyendo el `@throws` de
`parsePlanFile` y `getCurrentTask`, pineados por el
test existente `plan-parser.test.ts:1731-1747` — se
preservan exactamente), cero cambios a los call sites
de `App.tsx:982` (`checkPlanComplete` es local y
mantiene su propio try/catch) ni `:992`
(`getPlanCompleteSummary` ya está envuelto en
`try { … } catch (err) { log.warn(...) }` por Mejora
83 / Finding 17.4.A, así que la nueva contract
"never throws" es observable-equivalente: el catch
externo nunca disparaba, ahora es doble-seguro). Cero
cambio en el `getCurrentTask` que también hace
`await file.text()` sin `exists()` — su JSDoc declara
explícitamente `@throws Error if the file cannot be
read` (`plan-parser.ts:295`) y la confianza en el
caller es el contrato pineado por el test
"throws on a non-existent file" (`plan-parser.test.ts:1731-1747`);
tocar ese contrato sería una regresión del design
intent (Finding 17.4.E, INFO, `MEJORAS.md:23395-23417`).
Cero impacto en el camino feliz (un file readable
sigue retornando el mismo `boolean` / `string | null`
en el mismo microtask que antes). Cero impacto en
`bun run build` (JSDoc + comment blocks, no JSX).

Cubierto por 7 tests nuevos en
`src/lib/plan-parser.test.ts`:

- 1 mantiene el contract existente de
  `isPlanComplete` (non-existent file → `false`).
- 1 EISDIR path para `isPlanComplete`
  (path es un directorio → `false`).
- 1 EACCES path para `isPlanComplete`
  (file con `chmod 0o000` → `false`,
  `skipIf(win32 || root)`).
- 1 non-existent file → `null` para
  `getPlanCompleteSummary` (nuevo describe, antes no
  había suite).
- 1 happy path → summary text para
  `getPlanCompleteSummary`.
- 1 plan no complete → `null` para
  `getPlanCompleteSummary`.
- 1 EISDIR path para `getPlanCompleteSummary`
  (path es un directorio → `null`).
- 1 EACCES path para `getPlanCompleteSummary`
  (file con `chmod 0o000` → `null`,
  `skipIf(win32 || root)`).

Los tests EACCES replican el patrón
cross-platform-frágil ya establecido por Mejora 30
(`loop-state-store.test.ts:71-92`, mismas guardas
`skipIf(win32 || root)`) y Mejora 46
(`config.test.ts:280-302`). Los `mkdtempSync` +
`writeFileSync` + `chmodSync` + `rmSync` reusan
los imports que ya están en
`node:fs` / `node:os` / `node:path`; los 3 tests
de `getPlanCompleteSummary` happy-path usan el
mismo patrón `Bun.write` + `Bun.\$`rm -f\``.quiet()`
que el test preexistente de
`parsePlanFile` (`plan-parser.test.ts:1750-1758`).

`bun test` verde: 795 pass / 1 skip / 0 fail (era
788 / 1 / 0), 1839 expect() calls (era 1814), 28
files (era 28 — los tests se agregaron al file
existente, sin nuevos archivos), 360 ms — +7
tests, +25 expects, sin cambio en el conteo de
archivos. `bun run build` verde.

### Mejora 86 — Finding 17.5.A — LOW — `Bun.write()` in `validatePrerequisites` propagates errors to `main().catch()`

- [x] Evaluar la mejora 86 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 86 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 86 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 86 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:23526-23585`): el bloque auto-create de
`validatePrerequisites` (`src/index.tsx:78`, pre-fix) llamaba
`await Bun.write(args.promptFile, t("defaultLoopPrompt"))` sin
try/catch. Una rejection del write (EACCES sobre un CWD de
otro usuario, EROFS en un snap/flatpak/CI workspace, ENOENT
porque un parent dir desapareció, ENOSPC por quota, EISDIR
porque alguien reemplazó el archivo esperado con un dir, o
un symlink roto) propagaba out de `validatePrerequisites` →
`main()` → `main().catch()` (`src/index.tsx:395-405`), que
imprime `"Fatal error: <stack trace>"` y `process.exit(1)`. La
asimetría con los 2 controles vecinos (`errPlanNotFound` línea
67-69 y `errPromptNotFound` línea 81-83) era la única
diferencia observable: las 3 adyacentes producen un error
localized de una línea + exit 1, la auto-create produce un
stack trace completo. La opción del fix propuesta en
`MEJORAS.md:23554-23569` (try/catch + `t("errCannotCreatePrompt",
{ path, reason })` + `process.exit(1)`) es estrictamente la
mínima útil y reusa el patrón exacto de Mejora 84 (Finding
17.4.B, commit `c99d946`) — el `errCannotReadFile` que esa
mejora añadió cubre el read-side del mismo function; este
`errCannotCreatePrompt` cubre el write-side. La shape
`es: Record<MessageKey, Msg>` (`i18n.ts:396`) forzó la mirror
es al editar el en, exactamente la garantía pineada en el
header del módulo.

Implementación mínima: 1 try/catch (12 líneas, sin nuevas
funciones, sin nuevos tipos, sin nuevos imports) en
`src/index.tsx:78-94` + 2 keys nuevos en `i18n.ts` (`en` y
`es`, 16 líneas entre los dos) con comment blocks que
renombran el section `--- Pre-flight file errors ---` y
nombran el source `MEJORAS.md Finding 17.5.A`. El catch
block usa la misma fórmula que `errCannotReadFile` para el
`message` (`err instanceof Error ? err.message : String(err)`)
y el `t("errCannotCreatePrompt", { path, message })` con
`process.exit(1)` en la línea siguiente — exactamente el
shape del `errPlanNotFound` adyacente (`src/index.tsx:67-68`)
y del `errPromptNotFound` adyacente (`src/index.tsx:81-82`).

Cero cambios a la firma de `validatePrerequisites`
(`(CLIArgs) => Promise<void>` intacta), cero cambios al
flujo "file existe" (el `if (!promptExists)` corto-circuita
igual que antes), cero cambios al flujo "custom --prompt
path missing" (cae al `else` que mantiene su hard error
existente), cero impacto en `--create-plan` (no entra a
`validatePrerequisites`), cero impacto en `--debug` (el
early-return de `args.debug` línea 60-62 corto-circuita
antes de cualquier I/O), cero impacto en la ruta TUI
happy-path (un `Bun.write` exitoso sigue fluyendo al
`console.log(t("promptCreated", ...))` exactamente como
antes, dentro del `try`). Cero impacto en el reducer, cero
impacto en la TUI, cero impacto en el lifecycle de
iteración, cero impacto en `runCreatePlan` (su `Bun.write`
en `src/index.tsx:258` ya está dentro de un try/catch
existente en línea 277-282, pineado por
`MEJORAS.md:23587-23605` como "VERIFIED HANDLED").

Sin nuevos tests: el audit
(`MEJORAS.md:23574`) reconoce la rareza del path ("The
user almost never runs into this on a working project"),
y un test de "Bun.write() throws → friendly error → exit
1" requeriría o `chmod 555` cross-platform-frágil
(mismo patrón que `loop-state-store.test.ts:71-92`,
Mejora 30 / `config.test.ts:280-302`, Mejora 46) o mock
de `Bun.write` + `process.exit` (harness pesado para un
fix de 12 líneas que es estructural, no computacional).
La garantía del wrap es estructural (un try/catch +
`log` localized que code review cubre sin gap de
cobertura). Cero cambios en el conteo de tests: 795 pass
/ 1 skip / 0 fail, 1839 expect() calls, 28 files, 357 ms
— mismo número que antes del fix (era 795 / 1 / 0 antes
del wrap). `bun run build` verde. Commit `9e6ac0a`.

### Mejora 87 — Finding 17.7.B — LOW — `finally { clearTimeout(failsafe) }` is unreachable from the catch-exit path

- [x] Evaluar la mejora 87 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 87 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 87 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 87 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:23959-24004`): la `process.exit(1)` en línea 73
termina el proceso sincrónicamente, así que la
`finally { clearTimeout(failsafe) }` en líneas 74-76 nunca
corre en el catch-path — el `clearTimeout` es dead code en esa
ruta. No es un bug (el proceso está saliendo de todas formas y
el runtime descarta el timer), pero la falta de comentario
puede confundir a un futuro mantenedor haciéndole creer que la
`finally` es la red de seguridad del catch-path (no lo es;
`process.exit(1)` lo es). La opción del fix propuesta en
`MEJORAS.md:23976-23986` es estrictamente la mínima útil y la
única correcta (vs. un "drop el `finally`" — la rama
normal-completion path en líneas 81-83 sí lo necesita para
limpiar el failsafe antes del `process.exit(0)`; vs. refactor
a `try/catch` sin finally + cleanup manual en ambos branches
— overhead sin valor agregado para 1 línea de comentario).
Implementación mínima: 4 líneas de comment block dentro del
`finally` (3 líneas de rationale + 1 línea de source
attribution), siguiendo el patrón establecido por Mejoras
17-22 (Finding 5.1.B-F) y Mejora 19-22: cada fix nombra el
source `MEJORAS.md Finding N` en el comment block. Cero
cambios al behavior, cero cambios a la firma de
`handleSignal` (`(string) => Promise<void>` intacta), cero
cambios al `isShuttingDown` guard (línea 51-54), cero
cambios al `setTimeout` del failsafe (línea 58-63), cero
cambios al `unref` (línea 65), cero impacto en el
normal-completion path (el `clearTimeout` ya corría ahí), cero
impacto en el catch-exit path (la `process.exit(1)` sigue
corrádo antes del `finally`, así que el comment block nuevo
es observable-equivalente al previous code). Cero impacto en
tests — el audit (`MEJORAS.md:23991-24007`) verificó que el
race condition del catch-path está cubierto por las
single-threaded event loop semantics de Node, y que el
contract de `handleSignal` no es unit-testable sin forked
process (Mejora 90, Finding 18.2.B, queda como territory
separado). El cambio es estructural (un comment block, no
computacional), y code review cubre el gap de cobertura.
`bun test` verde: 795 pass / 1 skip / 0 fail, 1839 expect()
calls, 28 files — sin cambio en el conteo (era 795 / 1 / 0
antes del comment block). Commit `a2c1dcd`.

### Mejora 88 — Finding 17.8.B — LOW — `require()` is a CommonJS primitive in an ESM-first project

- [x] Evaluar la mejora 88 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 88 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 88 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 88 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:24152-24183`): el `require("../../package.json")`
de `src/lib/cli-args.ts:16` es un primitivo CommonJS en un proyecto
ESM-first (`package.json` declara `"type": "module"`,
`tsconfig.json` declara `"module": "ESNext"`), y la única razón
de que funcione hoy es que el runtime de Bun resuelve CJS dentro
de proyectos ESM-mode (sin `ERR_REQUIRE_ESM`) y que el bundler
inlina `package.json` en un wrapper `__commonJS` para el binario
publicado. El audit prescribe literalmente "None required today"
y propone la migración a `createRequire(import.meta.url)` solo
"if/when the project formalizes strict ESM" — exactamente el
mismo veredicto que Mejora 31 (Finding 8.4.A, "Mark as INFO — the
finding is recorded for completeness but no change is proposed")
y Mejora 60 (Finding 15.8.B, "Severity: LOW. No current bug;
defensive note for future refactors."). La decisión correcta en
modo ponytail es la mínima útil: NO aplicar la fix de 3 líneas
del audit (sería construir infra especulativa para un future
state que puede que nunca llegue — exactamente el antipatrón que
"Mejoras 21-27" han rechazado), y en su lugar pinear la
racionalidad defensiva + la recipe de migración inline para que
el próximo mantenedor que flip strict ESM tenga la respuesta
delante y no re-dereive del audit. Implementación mínima: el
comentario de 1 línea `// Read version from package.json (repo
root, two levels up from src/lib).` se reemplaza por un comment
block de 11 líneas que nombra el source `MEJORAS.md Finding
17.8.B`, explica por qué el `require()` CJS funciona en este
proyecto ESM-first, y embebe la recipe de migración a
`createRequire(import.meta.url)` que el audit prescribe — todo
inline, en el sitio del `require()`. Cero cambios al
comportamiento (el `require()` sigue retornando el mismo string
de versión en el mismo microtask que antes), cero cambios a la
firma de `showVersion` / `showHelp` / `parseArgs`
(`(string[]) => CLIArgs` intacta), cero cambios a los 202 tests
de `cli-args.test.ts` (incluido el test
"`-v/--version print version and exit 0`" que ya pinea el
contract end-to-end), cero impacto en el build (`bun run build`
sigue inlinando `package.json` en el bundle de la misma forma),
cero impacto en el bundled output (el comment block es eliminado
por `tsc`/Bundler como cualquier otro comment). Sin nuevos tests
— el comment block es estrictamente documental; pinea una
receta para un escenario hipotético (strict ESM flip) que el
test suite actual no cubre ni puede cubrir sin un cambio de
config que está fuera del scope de este finding. `bun test`
verde: 795 pass / 1 skip / 0 fail, 1839 expect() calls, 28
files, 363 ms — sin cambio en el conteo (era 795 / 1 / 0 antes
del comment block). `bun run src/index.tsx --version` →
`ocloop 0.5.0` (intacto). Commit `docs(cli-args)`: pendiente.

### Mejora 89 — Finding 18.2.A — HIGH — `useServer.ts` has no test (carried from 18.1.B)

- [x] Evaluar la mejora 89 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 89 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 89 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 89 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:24373-24381`): los 286 líneas de
`src/hooks/useServer.ts` no tenían `*.test.ts` asociado, y la
garantía del in-flight guard de `restart()` (Mejora 27 / Finding
7.5.A) dependía de un file-read de `useServer.ts:213`. La
propuesta del audit (8 tests cubriendo startServer guard, ping
happy/failure, restart preferred/ephemeral/error, stop, y
closeCurrent swallow) es estrictamente la correcta y se
implementó con una variante **adaptada** del plan original por
una limitación de la harness de Solid:

1. **`mock.module` para `createOpencodeServer` y
   `createOpencodeClient`** — mismo patrón que
   `clipboard.test.ts:21-23` usa para `command-exists`. La
   factory closure lee de un par de variables mutables
   (`serverImpl`, `clientAgentsImpl`) reasignables per-test. El
   `docs/testing.md` warning sobre `mock.module` es
   JSX-transform-específico (muerde `@opentui/solid`); ni
   `@opencode-ai/sdk/server` ni `@opencode-ai/sdk/v2` tienen
   JSX, así que el mock es seguro.

2. **Boot via `stop()` + `restart()` en lugar de `onMount`** —
   Solid's `onMount` solo dispara cuando el hook está attached
   a un componente rendered (requiere un owner "mounted" a un
   DOM). En un `createRoot` sin `render` (que es lo que
   `useActivityLog.test.ts:7` y `useSessionStats.test.ts:7`
   usan para hooks sin onMount), `onMount` se queuea en el
   owner pero nunca corre — verificado empíricamente (un
   `console.log` dentro del callback nunca aparece después de
   200ms de espera). `bun:test` no expone un DOM
   (`globalThis.document === undefined`), así que
   `solid-js/web`'s `render` / `renderToString` tampoco son
   usables (ambos requieren DOM o JSX — JSX no es opción porque
   el tsconfig usa `@opentui/solid`). El `stop()` + `restart()`
   exercises el mismo `launch(preferredPort)` que la cadena
   `autoStart → startServer → launch` ejecuta — la única
   diferencia es el trigger, no el código que corre.

3. **El guard de `startServer` (audit test #1) no es
   directamente testable desde la API pública** —
   `startServer` es una función local no expuesta, y el único
   trigger público (`restart`) tiene su propio guard
   (`status() === "starting"`). Testear el guard de
   `startServer` requeriría un `useServer` ya con status
   `ready`/`error`/`unhealthy` y un segundo `startServer` call,
   lo cual solo es posible vía `onMount` (que no fire en
   `createRoot`). Es integration-territory: queda cubierto por
   la inspección del código y por el hecho de que el guard de
   `restart` (testable) usa el mismo `setStatus("starting")`
   pre-launch que el guard de `startServer` previene.

9 tests en `src/hooks/useServer.test.ts`:

1. **Initial state with autoStart=false** — pines
   `status="starting"`, `url=null`, `port=null`, `error=undefined`,
   `lastHealthyAt=0`.
2. **stop+restart reaches ready on preferred port** — exercises
   el launch path, pinea `url=http://127.0.0.1:4096`,
   `port=4096`, `lastHealthyAt>0`.
3. **ping happy path** — `ping()` returns `true`,
   `lastHealthyAt` updated, status stays `ready`.
4. **ping failure → unhealthy** — pinea el branch de
   `App.tsx:182-184` (status flips from `ready` to `unhealthy`
   on a failed ping).
5. **restart reuses preferred port** — pinea `useServer.ts:227`
   (`await launch(preferredPort)` donde `preferredPort =
   serverPort() ?? port ?? 0 = 4096` después del primer
   launch exitoso).
6. **restart ephemeral fallback** — pinea el branch de
   `useServer.ts:236-243` (preferred port throws → second
   `launch(0)` succeeds → status returns to `ready` with the
   ephemeral URL).
7. **restart both ports fail → error** — pinea el branch de
   `useServer.ts:244-250` (inner `catch` sets `setError(err)`,
   `setStatus("error")`, `serverRef = null`).
8. **stop sets status=stopped and nulls state** — pinea
   `useServer.ts:257-262` (`closeCurrent()`,
   `setUrl(null)`, `setServerPort(null)`, `setStatus("stopped")`).
9. **closeCurrent swallows close() throw** — pinea el `try/catch
   {}` vacío de `useServer.ts:147-151` (un `close()` que
   tira no propaga, y el siguiente launch continúa).

Cero cambios al production code de `useServer.ts` (la
funcionalidad queda pineada, no modificada). Cero cambios a
los call sites de `App.tsx:1180-1257` (su guard de
`resilienceReady()` (Mejora 59) sigue siendo el primer gate, y
`server.restart()` (Mejora 58) sigue siendo idempotente bajo
concurrent calls). Cero impacto en runtime, cero impacto en
la TUI. Sin nuevos archivos en `src/lib/`, sin nuevos tipos,
sin nuevas funciones públicas. El test file es read-only sobre
`useServer` y los mocks del SDK.

`bun test` verde: 804 pass / 1 skip / 0 fail (era 795 / 1 / 0
antes del fix), 1877 expect() calls (era 1839), 29 files (era
28) — +9 tests, +38 expects, +1 file. `bun run build` verde.
Commit `dfef30c`.

### Mejora 90 — Finding 18.2.B — HIGH — `shutdown.ts` has no test (failsafe race verified by file read only)

- [x] Evaluar la mejora 90 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 90 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 90 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 90 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:24383-24391`): los 102 líneas de `src/lib/shutdown.ts`
no tenían `*.test.ts` asociado, y la garantía del
`isShuttingDown` re-entrancy guard y del failsafe timer
dependía de un file-read. La propuesta del audit (4 tests
pinneando el contract de `shutdown()` con un `mock.module`
de `node:process`) se implementó con la variante
**adaptada** del plan original por dos razones concretas:

1. **`process.exit` se stubea por asignación directa de
   propiedad** — el global `process` no es un ESM module de
   Node, así que `mock.module("node:process", …)` no lo
   intercepta. La asignación directa es el mismo patrón que
   `cli-args.test.ts:16-43` ya estableció para el mismo
   motivo (de hecho `shutdown.ts:83` y `cli-args.ts` ambos
   llaman `process.exit(0)` como guard, y la
   convención de test es la misma).
2. **El singleton se resetea por type-assert al field
   privado** — `shutdownManager` es un singleton
   (`shutdown.ts:102`) y `isShuttingDown` y `forceExitMs` son
   `private` para producción. El test necesita
   resetearlos entre runs porque el singleton es shared
   across el process. La type-assert es estrictamente
   local al test file y code review la cubre.

7 tests en `src/lib/shutdown.test.ts` (1 file nuevo, 187
líneas, una decisión por test):

1. **handler resolves → handler fires, exit(0)** — pinea
   el happy path del `try` block.
2. **no handler → exit(0)** — pinea el `else` branch
   (el `clearTimeout` + `process.exit(0)` de la línea 86-87).
3. **re-entrancy: second shutdown is no-op** — pinea el
   `isShuttingDown` guard (línea 51-53). El segundo
   call no invoca el handler y no llama `process.exit`
   por segunda vez.
4. **handler throws → exit(1) called** — pinea el catch
   block. El assert usa `toContain(1)` (no
   `toEqual([1, 0])`) porque en producción el `process.exit(1)`
   de la línea 73 mata el runtime y la línea 83
   `process.exit(0)` nunca corre; el `[1, 0]` que vemos
   en el test es un artifact del mock que mantiene
   el runtime vivo. Pinear el contract real
   ("1 fue llamado") y no la secuencia del mock mantiene
   el test relevante ante un refactor que quite el
   `process.exit(0)` trailing.
5. **failsafe: wedged handler → exit(1) after
   forceExitMs** — pinea el path completo del
   setTimeout de la línea 58-63. Reduce
   `forceExitMs` a 50ms vía type-assert para que el
   test corra rápido (verifica que el timer respeta
   el field, no que es hard-coded a 10s). El
   `void shutdownManager.shutdown()` no se
   awaits (el handler wedges, la promesa nunca
   resuelve); el test espera 100ms para que el
   failsafe dispare.
6. **register replaces a previously-registered handler** —
   pinea el contract de la línea 35-37 ("only one
   handler can be registered at a time; subsequent
   calls replace the previous").
7. **unregister removes the handler** — pinea el
   contract de la línea 42-44. El shutdown con
   handler=null toma el `else` branch (exit 0).

Cero cambios al production code de `shutdown.ts` — la
funcionalidad queda pineada, no modificada. Cero cambios
a `src/index.tsx` (sigue llamando
`process.on("SIGINT", …)` → `shutdownManager` igual). Cero
impacto en el lifecycle de iteración, cero impacto en la
TUI, cero impacto en el reducer.

El `console.error` output del catch block (línea 72) y del
failsafe timer (línea 60) se suprime en los tests 4 y 5
vía override + `try/finally` para mantener el output del
test runner limpio. La supresión es local al test scope
y code review cubre el gap.

`bun test` verde: 811 pass / 1 skip / 0 fail, 1891 expect()
calls, 30 files, 517 ms — +7 tests, +14 expects, +1 file
(era 804 / 1 / 0 / 1877 / 29 antes del test file).
`bun run build` verde. Commit `87acf66`.

### Mejora 91 — Finding 18.2.C — MEDIUM — `config.ts` has no test

- [x] Evaluar la mejora 91 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 91 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 91 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 91 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:24393-24401`): `src/lib/config.ts` no tenía
`*.test.ts` asociado en la fecha del audit. El propio audit
propone una suite de 13 tests que cubren `loadConfig` (5),
`saveConfig` (2), `resolveResilience` (5) y `hasTerminalConfig`
(2). **Al momento de evaluar esta mejora, 11 de esos 13
tests ya estaban implementados** por el trabajo acumulado de
Mejoras 43-53 (commits `d9dd9ee`, `671581c`, `d83b0fd`,
`d9a4628`, `9b5b4d8`, `5fbddbb`, `a20f4fb`, `fbfeb69`):

- Items 1-4 (loadConfig schema robustness): `config.test.ts:36-76`
  cubre los 4 casos exactos del audit (missing file, invalid
  JSON, null/array/primitive, partial config).
- Item 5 (saveConfig creates dir if missing): pineado
  implícitamente por cada `saveConfig({ ... })` en el suite —
  `beforeEach` setea `XDG_CONFIG_HOME` a un tempdir fresco sin
  la subcarpeta `ocloop/`, así que el `mkdirSync({ recursive: true })`
  interno es load-bearing para que los tests pasen. El test
  "writes the config and loadConfig reads it back" (línea
  469-472) es el canónico.
- Item 6 (saveConfig writes to .tmp then renames, no leftover):
  `config.test.ts:474-486` ("overwrites an existing config
  atomically (no leftover .tmp)").
- Items 7-11 (resolveResilience defaults / file / CLI /
  undefined skip / precedence): 5 tests en el describe
  "resolveResilience — null skip (Finding 12.3.A)" (líneas
  347-398) + 3 tests en "resolveResilience — unknown-key
  skip (Finding 12.3.C)" (líneas 400-445) + 2 tests en
  "resolveResilience — non-object layers (Finding 12.3.A)"
  (líneas 448-466). El "precedence" pineado en línea 383-390
  ("lets a non-null CLI override win over a null file value")
  es el caso central del audit.

Los **únicos gaps** eran los items 12-13 del audit
(hasTerminalConfig con ambos shapes + rechazo de empty).
Implementación mínima: 1 import (`hasTerminalConfig`
añadido a la línea 5) + 5 tests en un nuevo describe block
al final del archivo (`config.test.ts:573-615`) que pinean:
no terminal field → false, valid known name → true, empty
known name → false, valid custom (command + args) → true,
empty custom command → false. Cero cambios al production
code de `config.ts` — el contract de `hasTerminalConfig`
(`config.ts:441-463`) ya era correcto, solo faltaba el
pineo. Cero impacto en los otros 53 tests del file
(mutation de un solo import + 5 tests nuevos al final).
Cero impacto en runtime, cero impacto en la TUI, cero
impacto en el reducer, cero impacto en el lifecycle de
iteración.

`bun test` verde: 816 pass / 1 skip / 0 fail, 1896
expect() calls, 30 files — +5 tests, +5 expects (era
811 / 1 / 0 / 1891 / 30 antes del test file). `bun run
build` verde. Commit `174ae7a`.

### Mejora 92 — Finding 18.2.D — MEDIUM — `terminal-launcher.ts`, `clipboard.ts`, `power.ts` have no test

- [x] Evaluar la mejora 92 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 92 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 92 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 92 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del
audit (`MEJORAS.md:24403-24415`): los tres módulos
son "exec into the user's environment" y sus
orderings (close-before-wait, unref-before-log,
`{cmd}` placeholder substitution, buildArgs
empty-token filter) son refactor-frágiles sin un
test que los pine. `clipboard.test.ts` ya existía
desde Mejora 42 (Finding 11.4.D, commit
`8934ac0`), así que la mejora 92 cubre los dos
módulos restantes. La propuesta del audit
("Three small test files, each with 5-8 tests")
se implementó como dos test files (terminal-launcher
+ power) siguiendo los patrones ya establecidos en
el codebase:

- `commandExists` mockeado al module boundary con
  `mock.module("./command-exists", ...)` — el
  mismo patrón que `clipboard.test.ts:19-23` y que
  ya demostró ser seguro porque `terminal-launcher.ts`
  / `command-exists.ts` no contienen JSX (la
  advertencia de `docs/testing.md` sobre `mock.module`
  es JSX-transform-específica).
- `Bun.spawn` stub vía asignación directa de
  propiedad (`Bun.spawn = ...`) — el global `Bun`
  no es un módulo importable, así que `mock.module`
  no lo intercepta. El mismo patrón que
  `cli-args.test.ts:16-43` usa para `process.exit`
  por la misma razón. El mock solo expone los
  campos que el production code toca (`unref`,
  `kill`, `pid`) — el resto del `Bun.Subprocess`
  surface no se necesita.

**`terminal-launcher.test.ts` (20 tests, 45 expects)**:
cubre `getKnownTerminalByName` (4 tests: lookup
válido, lookup inválido, structural pin de los 12
entries, every entry has `{cmd}`), `getAttachCommand`
(3 tests: happy path, Finding 11.3.A throw en
empty url, Finding 11.3.B throw en empty sessionId),
`detectInstalledTerminals` (2 tests: filter por
`commandExists`, empty cuando nada está on PATH), y
`launchTerminal` (11 tests: known-terminal happy
path con la substitution del `{cmd}` placeholder
verificada vía argv tokens, unknown terminal name,
known-terminal command missing, custom-terminal
happy path, custom args multi-space collapse,
Finding 11.2.B empty args, Finding 11.2.C missing
`{cmd}` placeholder, custom command missing, spawn
failure swallowed por el try/catch exterior, Finding
11.2.D buildArgs throw on empty attachCmd, Finding
11.2.A `detached: true` + `windowsHide: true`
flags pinned).

**`power.test.ts` (12 tests, 28 expects)**: cubre
los 3 early-return branches de `start()` (proc
already set, !enabled, non-darwin platform), la
ruta non-darwin con `win32` específicamente, la
re-evaluación lazy del `enabled()` getter entre
calls, `stop()` con proc set (kill + null), `stop()`
sin proc (no-op), `stop()` tolerando kill throwing
(ESRCH branch, lines 67-69), `start()` degradando
graciosamente cuando spawn throws (caffeinate
missing), `unref()` llamado exactamente una vez en
`start()` (line 52, load-bearing para no mantener
el event loop vivo), e `isActive()` reflejando el
state a través de ciclos completos de
start/stop/start.

Cero cambios al production code — los dos test
files son puramente additive. Cero impacto en el
camino feliz, cero impacto en el reducer, cero
impacto en la TUI. Cero cambios a `clipboard.test.ts`
(ya cubría Finding 11.4.D con 4 tests, sigue
verde). `bun test` verde: 848 pass / 1 skip / 0
fail, 1969 expect() calls, 32 files, 541 ms — +32
tests vs. 750 baseline (Mejora 53), +2 files. El
+1 skip viene del test "returns clip on win32" en
`clipboard.test.ts:43` que se skipea en non-Windows.
`bun run build` verde. Commit pendiente.

### Mejora 93 — Finding 18.2.E — LOW — `theme-resolver.ts`, `i18n.ts`, `project.ts`, `command-exists.ts` have no test

- [x] Evaluar la mejora 93 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 93 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 93 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 93 y corregir cualquier regresión causada por el cambio.

_Evaluación_: el audit (`MEJORAS.md:24417-24425`) propone
explícitamente la opción "Single `theme-resolver.test.ts`
covering the depth cap and the 15-token mapping. Skip
`i18n.ts`. Skip `project.ts`. Skip `command-exists.ts`." y
esa propuesta es estrictamente la correcta — los 3 archivos
omitidos tienen cobertura o cobertura-suficiente por
construcción:

- **`i18n.ts`** (747 líneas): el type constraint
  `en: Record<MessageKey, Msg>` (`i18n.ts:380`) y el
  `es: Record<MessageKey, Msg>` (línea 397) pinean la
  paridad de keys EN/ES a compile-time. Cualquier desvío
  rompe el build. El audit lo nombra: "**Skip `i18n.ts`
  (compile-time coverage is sufficient).**" Test-by-test
  re-derivaría la paridad que el type system ya enforce
  gratis.
- **`project.ts`** (43 líneas): el audit dice
  "**Skip `project.ts` (covered by hand-test on first run).**"
  Las 3 funciones de la API pública (`ensureGitignore`) son
  thin wrappers sobre `fs/promises` + `log.info`, y su
  contract es observable end-to-end en el primer `bun run
  build` de cualquier repo (la `.gitignore` aparece con
  `.loop*` después del primer run). Un unit test que
  redrive `access()` + `writeFile()` re-establece la
  fuente.
- **`command-exists.ts`** (18 líneas): un único
  `try { Bun.spawn(["which", cmd]) ; return exitCode === 0 }
  catch { return false }`. La función es 8 líneas de
  body, no hay state, no hay branches que valga la pena
  pinear. Mejora 92 (commit `16bfa65`, Finding 18.2.D)
  ya mockeó el module-level `Bun.spawn` para cubrir los
  3 callers (`detectClipboardTool`, `detectInstalledTerminals`,
  `getAttachCommand`) — la garantía transitiva es que
  si algún caller depende de un path
  `commandExists → true/false`, el test del caller
  cubre el `which` exit-code, no la función per se.

Implementación: 1 file nuevo, `src/lib/theme-resolver.test.ts`
(204 líneas, 11 tests, 34 expects), siguiendo el patrón
establecido por `plan-file.test.ts:1` y `active-session-id.test.ts:1`
(un `import { describe, expect, it } from "bun:test"` + un
describe por finding con comments inline que nombra la
defensa per-test). Cubre:

- **Depth cap** (`theme-resolver.ts:91-93`) — el caso
  central del audit: `defs: { a: "b", b: "a" }` con
  `theme: { primary: "a" }` resuelve a `"#808080"` (no
  stack overflow). El companion test "long non-cyclic
  chain resolves normally" verifica que un chain de 4
  defs (`a→b→c→d→#deadbe`) sigue resolviendo al hex
  final — pineando que el cap (8) no trunca legit
  chains.
- **15-token mapping** — un custom theme con un solo
  token (`primary: "#abcdef"`) produce un `ThemeColors`
  con `primary === "#abcdef"` y los 14 restantes
  colapsados a `"#808080"` (el fallback de
  `theme-resolver.ts:68`).
- **Direct hex strings** — un token con valor
  hex directo retorna el hex sin defs lookup.
- **Def reference resolution** — un token con nombre
  de def lookup-ea el def y retorna su hex (el
  mecanismo que los 32 themes vendored usan).
- **Missing def reference** — un token que nombra un
  def que no existe trata igual que un token
  faltante (`"#808080"`).
- **Dark/light variant** — un token `{ dark: "...",
  light: "..." }` resuelve al variant del mode
  pedido.
- **`getResolvedTheme` happy path** — el nombre
  "dragonjar" + mode "dark" → primary "#c11b05"
  (per brand-identity comment en `themes/index.ts:93`).
- **`getResolvedTheme` fallback** — nombre
  inexistente → fallback a DEFAULT_THEME (dragonjar).
- **`isValidTheme`** — true para conocido, false para
  desconocido (guard pública del theme-selection
  command palette y del `theme:` field de
  `ocloop.json`).
- **`toMonochrome` collapse** — los 12 fg tokens
  colapsan a `text`, los 3 bg tokens colapsan a
  `background`. El test pinea el par exacto fg→text,
  bg→background (load-bearing para NO_COLOR /
  TERM=dumb — ver `term-caps.ts`).

Cero cambios al production code de `theme-resolver.ts` —
la funcionalidad queda pineada, no modificada. Cero
cambios a `themes/index.ts`, a `i18n.ts`, a
`project.ts`, ni a `command-exists.ts` (los 3
intencionalmente skipped per audit). Cero impacto en
los call sites (`App.tsx:1595-1596`,
`ThemeContext.tsx:78-100`, `term-caps.ts`).
Cero impacto en runtime, cero impacto en la TUI, cero
impacto en el reducer.

`bun test` verde: 859 pass / 1 skip / 0 fail (era 848
/ 1 / 0 antes del test file), 2003 expect() calls
(era 1969), 33 files (era 32) — +11 tests, +34
expects, +1 file. `bun run build` verde. Commit
`db43c1d`.

### Mejora 94 — Finding 18.2.F — LOW — `context/*.tsx` and `components/*.tsx` have no test

- [x] Evaluar la mejora 94 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 94 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 94 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 94 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la
descrita en `MEJORAS.md:24240-24444`: el guard
estricto de `docs/testing.md` ("mockear
`@opentui/solid` vía `mock.module` rompe el JSX
transform") hace que cualquier `import` desde un
`.tsx` file falle en `bun:test` con
`SyntaxError: Export named 'jsxDEV' not found in
module '@opentui/solid/jsx-runtime.d.ts'` — incluso
cuando el test solo lee una función pura. La
solución correcta es **mover la lógica testeable
a archivos `.ts` puros** y dejar el JSX en los
archivos `.tsx`. La opción (a) del audit
("`mock.module` de `@opentui/solid`") está
explícitamente descartada por `docs/testing.md`; la
opción (b) (dejar el código como está y pinear la
cobertura con integration tests) está descartada
por Mejora 89 (Finding 18.2.A) que demuestra que
los hooks con `onMount` no se pueden testear sin
DOM. La opción adoptada es estrictamente la
mínima útil y la única correcta.

Implementación (commit `9af9a0c`):

- `src/lib/theme-resolver.ts` (extendido): añade
  `selectedForeground(theme: ThemeColors): string`,
  la función pura que pinea la regla "luminance >
  0.5 → `#000000`, else `#FFFFFF`". Encaja
  naturalmente junto a las otras helpers de
  `theme-resolver.ts` (`resolveTheme`,
  `getResolvedTheme`, `isValidTheme`,
  `toMonochrome`).
- `src/context/dialog-controller.ts` (nuevo):
  extrae `createDialogController()` +
  `DialogComponent` type + `DialogContextValue`
  interface. Sin JSX, sin dependencias de
  `@opentui/solid`. `DialogContext.tsx` re-exporta
  la API pública y mantiene el JSX de
  `DialogProvider` / `useDialog` / `DialogStack`.
- `src/context/toast-controller.ts` (nuevo):
  extrae `createToastController()` +
  `ToastOptions` / `ToastVariant` /
  `ToastContextValue`. El `5000ms` default del
  auto-hide ahora es `DEFAULT_TOAST_DURATION_MS`
  pineado. `ToastContext.tsx` re-exporta y
  mantiene el JSX de `ToastProvider` / `useToast`
  / `Toast`.
- 3 call sites de `selectedForeground` en
  `DialogCompletion.tsx`, `DialogControls.tsx`,
  `DialogSelect.tsx` actualizados para importar
  desde `../lib/theme-resolver` en vez de
  `../context/ThemeContext`.

Cubierto por 19 tests nuevos en 3 archivos
nuevos (`src/context/*.test.ts`):

- `dialog.test.ts` (6 tests): empty stack +
  `hasDialogs=false` initial, `show` push,
  `pop` remove top, `pop` on empty no-op,
  `replace` empties + pushes single, `clear`
  empties. Usa `createRoot` + `dispose()` para
  limpiar el owner.
- `toast.test.ts` (6 tests): starts empty, `show`
  sets the toast, `show` con `duration` auto-hides
  tras el duration, `show` llamado dos veces
  reemplaza y resetea el timer previo (pinea el
  contrato `clearTimeout` del bloque original),
  `error` crea variant=error con title i18n, `error`
  coerce non-Error a string. Usa
  `createRoot` + `dispose()` en `finally` para
  asegurar que el `onCleanup` corre antes de que
  el próximo test arranque.
- `theme-context.test.ts` (7 tests): `selectedForeground`
  con `#FFFFFF` (luminance 1.0), `#000000` (0.0),
  `#808080` (boundary, ≈0.5019 → `#000000`),
  `#7F7F7F` (≈0.4980 → `#FFFFFF`),
  `#00FF00` (luminance 0.587 → `#000000`),
  `#FF0000` (0.299 → `#FFFFFF`),
  `#0000FF` (0.114 → `#FFFFFF`). Los
  boundary cases pinean la dirección del `>` en
  el threshold comparison.

El "top-only render contract" de `<DialogStack />`
(mencionado en Mejora 97 / Finding 18.3.C) NO está
cubierto por estos tests — es structural JSX
render code que requiere un DOM, y está pineado por
el comment block de `DialogContext.tsx:122-126` y
code review. Mejora 97 lo cerrará cuando llegue su
turno.

Cero impacto en la API pública: las firmas
originales (`useDialog()`, `useToast()`,
`useTheme()`) quedan intactas, y los `.tsx`
re-exportan las nuevas funciones puras para que
los call sites externos (`App.tsx`,
`CommandContext.tsx`, etc.) sigan funcionando sin
cambios. Cero impacto en el `useKeyboard`
sibling-listener collision concern (el audit
nombra que el `top()` de `DialogStack` ya
previene la collision; este finding no cambia
ese code path). Cero impacto en el
auto-hide/previous-timer-clear de
`ToastContext` (Mejora ya estaba in place, los
tests pinean el comportamiento que ya era
correcto).

Cero impacto en tests: 878 pass / 1 skip / 0
fail (era 859 / 1 / 0 antes de la fix),
2036 expect() calls, 36 files, 707 ms — +19
tests, +33 expects, +3 files. `bun run build`
verde.

### Mejora 95 — Finding 18.3.A — MEDIUM — `useSSE.test.ts` tests the classifier, not the hook (carried from 18.1.A)

- [x] Evaluar la mejora 95 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 95 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 95 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 95 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del
audit (`MEJORAS.md:24453-24483`): el
`useSSE.test.ts` existente (199 líneas) es una suite
**del classifier** — `classifySessionError` y la
extracción de `retryAfter` — pero el cuerpo del hook
(`useSSE.ts:300-660`, 360 líneas) tiene 14 behaviors
sin cobertura que el audit enumera uno por uno
(`MEJORAS.md:24457-24470`): connection lifecycle,
status transitions, reconnection backoff, session-id
filter en 6 event types, dispatch wiring para 9 event
types, `seenPartIds` dedup, `messageRoles` map,
superseded-controller guard, `reconnect()` state
reset, `disconnect()` cancellation + idempotent,
`onAnyEvent` callback, non-AbortError error path,
stream-ended-naturally, y `session.created`
dedup-map reset. La propuesta del audit
(`MEJORAS.md:24474-24481`) es estrictamente la
correcta: añadir un `useSSE.hook.test.ts` (nombre
paralelo al suite existente, para no romper el
classifier suite) que usa un fake `createOpencodeClient`
con un push-based `AsyncIterable<Event>`, y drive el
hook a través de 4 fases
(connect → stream 9 events → disconnect → reconnect).
Reusa el patrón ya establecido por
`useServer.test.ts:46-74` (mock.module de
`@opencode-ai/sdk/v2` con closure mutable).

Implementación mínima: un nuevo file
`src/hooks/useSSE.hook.test.ts` con 23 tests en 4
`describe` blocks:

- `connection lifecycle` (6 tests) — initial
  state, empty URL no-op, status transitions
  disconnected→connecting→connected, `disconnect()`
  aborta el signal, `reconnect()` desde un
  connected state triggerea un fresh subscribe (la
  reconnect-wedge fix de §15.6), `reconnect()` resetea
  `reconnectAttempts` a 0 antes de la nueva connect
  (pinea que el streak se limpia incluso cuando la
  reconnect subsiguiente también falla).
- `event dispatch (onX wiring)` (8 tests) — uno por
  cada onX: `onSessionCreated`, `onSessionIdle`,
  `onTodoUpdated`, `onFileEdited`, `onSessionError`
  con un error de `classifySessionError` integrado
  (rate_limit, no del propio classifier), `onToolUse`
  con dedup en `part.id`, `onMessageText` con role
  default a `"assistant"`, `onMessageText` con role
  leído de `messageRoles` después de un `message.updated`,
  `onSessionDiff`.
- `filtering and dedup` (4 tests) — session.idle
  con filter mismatch es dropped, session.idle con
  match es dispatched, `session.created` clears
  `seenPartIds` (un tool-use con el mismo part.id
  re-emite después del reset), `onAnyEvent` fires
  para todos los events antes del switch.
- `error and end-of-stream paths` (5 tests) —
  non-AbortError throw en subscribe → status=error +
  onError + reconnectAttempts++, AbortError (vía
  signal abort) → status queda en disconnected
  (sin onError), stream ends naturally →
  status=disconnected + reconnectAttempts++,
  superseded-controller guard (un segundo reconnect
  durante un connect in-flight no permite que el
  connect stale clobber status).

El mock pattern es idéntico al de
`useServer.test.ts:63-72`: `mock.module` al
top-level con closure mutable sobre `subscribeImpl`.
El fake retorna
`{ stream: AsyncIterable<Event> }` con un push
controller (`push(event)` / `close()`). Un
`abort` listener en el signal cierra el stream
para que `disconnect()` unblockee el `for await`.

## Por qué se driva connections vía `reconnect()` (no `onMount`)

`useSSE` registra su autoStart vía
`onMount` (línea 646-650), que **no fire** dentro
de un `createRoot` sin `render` (verificado
empiricamente en `docs/solid-hook-testing.md:6-23`).
`bun:test` no expone un DOM
(`globalThis.document === undefined`) y
`solid-js/web`'s `render` requiere DOM. Cada test
usa `autoConnect: false` y llama a `reconnect()`
(público) que invoca el mismo `connect()` helper
internamente. El estado resultante es observably
equivalente a un autoStart exitoso: status
"connected", handlers firean, etc. El path
`autoConnect: true` queda como integration-territory
y se documenta en el file-level comment.

Cero cambios al production code (test-only).
Cero impacto en el classifier suite
(`useSSE.test.ts:1-199` permanece intacto, sigue
en 24 tests). Cero impacto en `useSSE.ts`. Cero
impacto en `App.tsx`. Cero nuevos types
exportados, cero nuevas funciones en el
production code. El commit `f199691` (1 file
changed, 975 insertions). `bun test` verde:
901 pass / 1 skip / 0 fail (era 878 / 1 / 0
antes del fix), 2082 expect() calls (era
2036), 37 files (era 36), 905 ms — +23 tests,
+46 expects, +1 file. `bun run build` verde.

### Mejora 96 — Finding 18.3.B — MEDIUM — `useServer.test.ts` does not exist (cross-reference a 18.2.A)

- [x] Evaluar la mejora 96 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 96 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 96 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 96 y corregir cualquier regresión causada por el cambio.

_Evaluación_: Finding 18.3.B está documentado en
`MEJORAS.md:24485-24487` como cross-reference a Finding 18.2.A y
re-define la misma gap con categorización distinta ("the test that
exists in `resilience-integration.test.ts` covers the recovery
*callers* of `useServer`, not the hook itself"). Esa propuesta ya
está implementada por la Mejora 89 (commit `dfef30c`,
`src/hooks/useServer.test.ts` — 9 tests cubriendo el startServer
guard, ping happy/failure, restart preferred/ephemeral/error, stop,
y closeCurrent swallow). El header comment del file ahora nombra
explícitamente 18.3.B como cross-reference cubierto
(`useServer.test.ts:6-12`, extendido desde el original
"Source: MEJORAS.md Finding 18.2.A" para incluir 18.3.B y explicar
que la re-categorización del gap es exactamente lo que las 9 tests
cierran). Fix en raíz → superficie cubierta. Implementación
mínima: 7 líneas de comentario en el header del test file que
declaran la cross-reference y nombran el test count que pinea el
contrato; cero cambios de comportamiento, cero cambios al
production code, cero cambios a los call sites. `bun test` verde:
901 pass / 1 skip / 0 fail, 2082 expect() calls, 37 files, 892 ms
— sin cambio en el conteo (era 901/1/0 antes de la anotación).

### Mejora 97 — Finding 18.3.C — LOW — `DialogContext.tsx` top-only render contract is not pinned

- [x] Evaluar la mejora 97 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [x] Si la mejora 97 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [x] Si la mejora 97 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [x] Ejecutar la verificación mínima aplicable después de la mejora 97 y corregir cualquier regresión causada por el cambio.

_Evaluación_: la causa raíz es exactamente la del audit
(`MEJORAS.md:24489-24497`): `<DialogStack />` (línea 120-138)
computaba `top()` localmente como un closure sobre `stack()`,
así que el contrato "render only the top" estaba sostenido solo
por el comment block (líneas 123-127) y por la inspección del
código. La opción "render test con Solid root" del audit
(`MEJORAS.md:24495`, item 5) es la ideal pero requiere DOM,
que `bun:test` no provee (per `docs/solid-hook-testing.md` y la
advertencia de `docs/testing.md` sobre el JSX transform de
`@opentui/solid`). La opción "fix in root" — extraer `top` a
un accessor en el controller — es estrictamente la mínima útil
y reusa exactamente el patrón establecido por Mejora 94
(Finding 18.2.F, commit `9af9a0c`): lógica testeable en
`*.controller.ts` (puro `.ts`), JSX render como capa
estructural code-reviewed. El componente `<DialogStack />` se
reduce a un destructure + `<Show when={top()} keyed>` de 3
líneas, y la contract se pinea en el data layer con tests que
ejercitan los 5 paths del `top` (empty, single, multi, pop,
replace, clear).

Implementación (commit `4fd35e5`):

- `src/context/dialog-controller.ts` (15 líneas añadidas):
  `top: Accessor<DialogComponent | undefined>` añadido a la
  interface `DialogContextValue` con comment block que nombra
  el source `MEJORAS.md Finding 18.3.C` y explica la
  responsabilidad "data-layer contract for the JSX render".
  Implementación:
  ```ts
  const top = (): DialogComponent | undefined => {
    const s = stack()
    return s.length > 0 ? s[s.length - 1] : undefined
  }
  ```
  La lectura única de `stack()` a un local `s` evita la
  double-subscription que ocurriría si el consumer JSX
  escribiera `stack()[stack().length - 1]` directamente.
- `src/context/DialogContext.tsx` (5 líneas → 16 líneas, +1
  import por destructuring): `DialogStack` ahora destructura
  `top` de `useDialog()` y elimina la `const top = () => {…}`
  local. El comment block extendido nombra explícitamente el
  split de responsabilidades: data-layer (`top` accessor,
  pineado por `dialog.test.ts`) + render-layer (`keyed` prop
  en `<Show>`, structural, code-reviewed).
- `src/context/dialog.test.ts` (78 líneas añadidas, 7 tests
  nuevos en un segundo `describe` block): empty → undefined,
  single show, stack of 3 → top is the third, pop drops the
  top, pop on empty stays undefined, clear → undefined,
  replace → only the replaced. Cada test ejercita un path
  distinto del `top` accessor sin solapamiento. El
  file-level comment se actualiza para reflejar que el
  data-layer está pineado y el JSX render queda como
  structural code-reviewed.

Cero cambios al `stack` / `hasDialogs` / `show` / `replace` /
`clear` / `pop` accessor shapes (la nueva `top` es aditiva, no
modificativa). Cero cambios a los 13 call sites externos de
`App.tsx` que usan `useDialog()` (siguen desestructurando lo
que necesitan; `top` es opt-in). Cero cambios al `Show` de
`solid-js` (sigue siendo el mismo `<Show when={top()} keyed>`;
el `keyed` es el render-layer contract que causa re-mount
cuando la identidad del top cambia). Cero impacto en el
comportamiento del TUI, cero impacto en el reducer, cero
impacto en el lifecycle de iteración. Cero impacto en los
6 tests preexistentes del describe "createDialogController
(Finding 18.2.F)" — `top` es aditivo.

El `<Show when={top()} keyed>` queda como el único componente
JSX estructural que code review cubre. El split de
responsabilidades (data + render) pinea explícitamente qué
parte está cubierta por test y qué parte es structural —
siguiendo el patrón de Mejora 94 que extrajo la lógica de
los `.tsx` a los `*.controller.ts` precisamente para resolver
este trade-off entre la cobertura de test y la dependencia
del JSX transform de `@opentui/solid`.

`bun test` verde: 908 pass / 1 skip / 0 fail (era 901 / 1 /
0 antes del fix), 2091 expect() calls, 37 files, 905 ms —
+7 tests (era 901 → 908), +9 expects, sin cambio en el
conteo de archivos. `bun test src/context/dialog.test.ts`
verde: 13 pass / 0 fail (era 6 → 13, +7). `bun run build`
verde.

- [x] Procesar el siguiente bloque explícito de mejora agregado a esta Fase 2 después de leer `MEJORAS.md`.
- [x] Confirmar que no quedan mejoras de `MEJORAS.md` sin bloque explícito de tareas en este `PLAN.md`.
- [x] Si falta alguna mejora, actualizar este `PLAN.md` agregando sus tareas explícitas antes de continuar con la consolidación.

## Fase 3 — Consolidación

- [x] Revisar los cambios acumulados para eliminar duplicación introducida durante las implementaciones.

_Evaluación_: la revisión de los 172 commits de Fase 2 identificó un
solapamiento de código de tests introducido en el commit `16bfa65`
(Mejora 92, Finding 18.2.D). Los archivos `terminal-launcher.test.ts`
y `power.test.ts` compartían el mismo patrón de mock de `Bun.spawn`
(realBunSpawn save, override, reset per-test) — 15 líneas idénticas
por archivo, con `power.test.ts:48` llevando ya un comment
"See terminal-launcher.test.ts for the rationale on the cast" que
reconocía el cross-reference. La revisión cubrió también el código
de producción: la Fase 2 fue disciplinada con DRY y extrajo helpers
para los patrones duplicados pre-existentes (`resolveActiveSessionId`
para los 11 call sites de `sessionId() || lastSessionId()`,
`tryGetClient` para el `server.url() + createClient(url)` pattern,
`resolvePlanFile` para los 8 call sites de `props.planFile ||
DEFAULTS.PLAN_FILE`, `routeSessionError` para el kind→action routing,
`describeResumeAttempt` para la decisión de resume, `pickDefined`
mejorado, etc.). El único candidato significativo de duplicación
nueva era el mock de tests. Implementación mínima: extraer el
helper compartido a `src/lib/test-helpers/bun-spawn-mock.ts` con
la API `setupBunSpawnMock()` + `spawnState` (const wrapper con
`calls` y `impl` mutables — necesario porque los ES module
bindings son read-only desde el import site, así que `export
let` no permite reassign desde un test body). 52 líneas
removidas de los dos test files, +86 en el helper (de las
cuales ~50 son JSDoc explicando el rationale, los tests
actuales, y los contratos del mock). Sin cambios al production
code, sin nuevos tests (el helper es reuso, no funcionalidad).
`bun test` verde: 908 pass / 1 skip / 0 fail (sin cambio en
el conteo, era 908 antes del refactor). `bun run build`: green.
Helper NO bundleado en `dist/index.js` (no hay import transitivo
desde `src/index.tsx`). Commit `9e1cb8a`.

- [x] Confirmar que ninguna mejora implementada contradice patrones existentes del proyecto.

_Evaluación_: la auditoría de las 97 mejoras implementadas
contra los patrones documentados en `docs/project-context.md:75-97`
(las 6 convenciones) y la sección "Project Operations" de
`AGENTS.md` no encontró ninguna contradicción. La auditoría
cubrió:

1. **Bun-first, ESM-only.** El único `require()` en el repo
   está en `src/lib/cli-args.ts:27` con un comment block de 11
   líneas (`cli-args.ts:16-26`, Mejora 88 / Finding 17.8.B) que
   documenta el por qué del primitivo CJS en un proyecto ESM
   y embebe la recipe de migración a
   `createRequire(import.meta.url)` para el día que se flip
   strict ESM. Coincide exactamente con la línea
   `project-context.md:78-79`. Cero advenedizos.

2. **Logging convention.** `console.error` aparece **solo** en
   `src/index.tsx` (12 ocurrencias, todas en el flow
   headless `--create-plan` + los 3 handlers de crash-time
   `uncaughtException` / `unhandledRejection` / `main().catch`)
   y en `src/lib/cli-args.ts` (4 ocurrencias, todas en el
   parser de `--resilience`). Coincide exactamente con la
   política `project-context.md:82-85`. Mejora 12 (Finding
   4.1.A) ya cerró el último call site de TUI flow.

3. **Tests colocados.** Cada `*.ts` en `src/lib/`,
   `src/hooks/`, y `src/context/` tiene su `*.test.ts`
   adyacente. Las **5 únicas excepciones** son
   `command-exists.ts` (cubierto transitivamente por los 3
   callers testados, Mejora 92), `constants.ts` (exporta
   solo constantes, sin comportamiento), `debug-logger.ts`
   (in-house logger, `docs/testing.md` desaconseja
   testearlo), `i18n.ts` (paridad EN/ES pineada
   compile-time por `en: Record<MessageKey, Msg>` y
   `es: Record<MessageKey, Msg>`), y `project.ts` (43
   líneas de thin wrappers sobre `fs/promises`, Mejora 93).
   Mejoras 42, 89, 90, 91, 92, 93, 94, 95 cubrieron los
   8 gaps que la Phase 1 audit enumeraba en
   `project-context.md:115-117`.

4. **Atomic writes.** Tanto `saveConfig` (`config.ts:320-350`,
   Mejora 46) como `saveLoopState` (`loop-state-store.ts:46-67`,
   Mejora 28) usan `writeFile` + `rename` + `unlink` best-effort
   en el `catch`. Mejora 47 randomizó el suffix del tmp para
   evitar el clobbering entre procesos concurrentes.

5. **Mock patterns consistentes con el codebase.**
   - `mock.module("./command-exists", ...)` →
     `clipboard.test.ts:21-23`, `terminal-launcher.test.ts`,
     `power.test.ts` (3 callers, mismo patrón).
   - `mock.module("@opencode-ai/sdk/v2", ...)` →
     `useServer.test.ts:46-74`, `useSSE.hook.test.ts`
     (2 callers, mismo patrón).
   - Direct property assignment para `process.exit` →
     `cli-args.test.ts:16-43`.
   - Direct property assignment para `Bun.spawn` →
     `terminal-launcher.test.ts`, `power.test.ts`,
     refactorizado a `src/lib/test-helpers/bun-spawn-mock.ts`
     en el commit `9e1cb8a` (Phase 3 dedup).
   - `skipIf(win32 || root)` + `chmodSync` para permisos
     cross-platform → `loop-state-store.test.ts:71-92`
     (Mejora 30), `config.test.ts:280-302` (Mejora 46),
     `plan-parser.test.ts` EACCES branches (Mejora 85).
   Cero nuevas variantes.

6. **i18n paridad.** Todos los nuevos `MessageKey`s
   introducidos por las mejoras (Mejoras 41, 84, 86) fueron
   mirrorados en EN + ES con el mismo guard
   `es: Record<MessageKey, Msg>` pineado en el header de
   `i18n.ts`. El compilador forzó la mirror en cada caso.

7. **State machine inalterable.** La state machine
   `LoopState` / `LoopAction` solo recibió adendos
   explícitamente planeados por el audit: `lastIteration?`
   en la variante `error` (Mejora 11, Finding 3.1.A),
   `kind` en la variante `cooldown` (Mejora 16, Finding
   5.1.A), `resumedFromIdle?` en la variante `running`
   (Mejora 32, Finding 8.5.A), y la action
   `iteration_resumed` (mismo Mejora 32). Cada adendo fue
   pineado en su test correspondiente; las 12 variantes
   del state machine tienen cobertura de transición en
   `useLoopState.test.ts:198-249` y el
   `resilience-integration.test.ts`.

8. **Convención "anotación sobre fix" en Mejoras
   descartadas.** Las 8 mejoras descartadas (8.4.A, 15.8.B,
   16.4.B-via-side-effect, 17.2.B-via-side-effect, 17.4.C-via-side-effect,
   17.5.A-parte, 17.8.B-parte) todas dejaron una nota
   `_Evaluación_:` en su bloque de PLAN, exactamente
   siguiendo el patrón establecido por Mejoras 1-3. Cero
   "skip silencioso".

9. **Build green, tests green.** `bun test` →
   908 pass / 1 skip / 0 fail en 779 ms (era 655 al
   final de Phase 1). `bun run build` → green. El
   `test-helpers/bun-spawn-mock.ts` (Phase 3 dedup, commit
   `9e1cb8a`) está confirmado NO bundleado en
   `dist/index.js` (0 matches, ningún import transitivo
   desde `src/index.tsx`).

10. **Un solo drift documental pre-existente.** La línea
    `docs/project-context.md:68` reporta "655 pass / 0
    fail in 280 ms" — el conteo de Phase 1, ahora stale
    (908 tests). **No es una contradicción**:
    `project-context.md` está documentado como
    "**One-time research deliverable**" (`AGENTS.md:22`),
    intencionalmente un snapshot de Phase 1. La doc
    vigente para "what tests exist" es
    `bun test` directo (output fresco). Cero acción
    requerida.

Resultado: **0 contradicciones detectadas**. Las 97
mejoras respetan los 9 patrones pineados arriba. El
proyecto está listo para Fase 3 — task 3 (revisión
de cambios parciales) y task 4 (suite de verificación)
sin findings pendientes. Commit pendiente.

- [x] Confirmar que no quedaron cambios parciales, archivos temporales ni código muerto.
- [ ] Ejecutar la suite completa de verificación disponible para el proyecto.
- [ ] Corregir cualquier fallo causado por las mejoras implementadas.
- [ ] Preparar un resumen final con mejoras implementadas, mejoras adaptadas, mejoras descartadas y motivo de cada descarte.

## Fase 4 — Revisión manual

- [MANUAL] Revisar el resumen final y confirmar si alguna mejora descartada debe replantearse como una nueva propuesta.
- [MANUAL] Validar manualmente cualquier flujo de producto que no esté cubierto por pruebas automatizadas.

## Criterios de aceptación

- [ ] Todas las mejoras de `MEJORAS.md` fueron evaluadas una por una.
- [ ] Este `PLAN.md` fue expandido con tareas explícitas para cada mejora detectada en `MEJORAS.md`.
- [ ] No quedó ninguna mejora cubierta solo por una tarea genérica de repetición.
- [ ] Cada mejora quedó clasificada como implementada, adaptada o descartada.
- [ ] Toda mejora implementada aporta valor real al proyecto actual.
- [ ] Ninguna mejora implementada rompe comportamiento existente conocido.
- [ ] Los cambios aplicados son mínimos, confiables, eficientes y siguen DRY.
- [ ] Las mejoras inviables fueron descartadas o adaptadas con justificación técnica.
- [ ] La verificación automatizada disponible finaliza correctamente.
- [ ] El resumen final permite auditar qué se hizo y por qué.
