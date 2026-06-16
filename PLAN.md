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

- [ ] Evaluar la mejora 60 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 60 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 60 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 60 y corregir cualquier regresión causada por el cambio.

### Mejora 61 — Finding 16.1.A — MEDIUM — `handleIterationError` dispatches a recoverable error for `auth` and `fatal` kinds

- [ ] Evaluar la mejora 61 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 61 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 61 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 61 y corregir cualquier regresión causada por el cambio.

### Mejora 62 — Finding 16.1.B — MEDIUM — `kind === "transient"` takes different paths in the two call sites

- [ ] Evaluar la mejora 62 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 62 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 62 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 62 y corregir cualquier regresión causada por el cambio.

### Mejora 63 — Finding 16.1.C — LOW — `enterCooldown` call sites differ only in the optional `kind` argument

- [ ] Evaluar la mejora 63 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 63 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 63 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 63 y corregir cualquier regresión causada por el cambio.

### Mejora 64 — Finding 16.1.D — LOW — `handleIterationError` and SSE `onSessionError` could share a "kind → action" helper

- [ ] Evaluar la mejora 64 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 64 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 64 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 64 y corregir cualquier regresión causada por el cambio.

### Mejora 65 — Finding 16.2.A — LOW — `server.url()` + null-check pattern repeated at every call site

- [ ] Evaluar la mejora 65 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 65 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 65 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 65 y corregir cualquier regresión causada por el cambio.

### Mejora 66 — Finding 16.2.B — LOW — Inconsistent inline vs variable form across call sites

- [ ] Evaluar la mejora 66 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 66 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 66 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 66 y corregir cualquier regresión causada por el cambio.

### Mejora 67 — Finding 16.3.A — LOW — `props.planFile || DEFAULTS.PLAN_FILE` repeated at 8 sites

- [ ] Evaluar la mejora 67 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 67 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 67 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 67 y corregir cualquier regresión causada por el cambio.

### Mejora 68 — Finding 16.3.B — LOW — `AppProps extends CLIArgs` makes the `||` type-unjustified

- [ ] Evaluar la mejora 68 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 68 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 68 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 68 y corregir cualquier regresión causada por el cambio.

### Mejora 69 — Finding 16.4.A — LOW — `sessionId() || lastSessionId()` repeated at 11 sites

- [ ] Evaluar la mejora 69 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 69 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 69 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 69 y corregir cualquier regresión causada por el cambio.

### Mejora 70 — Finding 16.4.B — LOW — Site #2 + #3 evaluate the same expression twice

- [ ] Evaluar la mejora 70 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 70 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 70 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 70 y corregir cualquier regresión causada por el cambio.

### Mejora 71 — Finding 16.5.A — HIGH — Completion effect re-runs every second, pushing a new dialog onto the stack

- [ ] Evaluar la mejora 71 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 71 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 71 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 71 y corregir cualquier regresión causada por el cambio.

### Mejora 72 — Finding 16.5.B — MEDIUM — DialogSelect per-row inline expressions subscribe to `selectedIndex` and `theme` 3+ times each

- [ ] Evaluar la mejora 72 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 72 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 72 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 72 y corregir cualquier regresión causada por el cambio.

### Mejora 73 — Finding 16.5.C — LOW — `ActivityLog.displayEvents` is a no-op memo

- [ ] Evaluar la mejora 73 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 73 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 73 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 73 y corregir cualquier regresión causada por el cambio.

### Mejora 74 — Finding 16.5.D — LOW — `BottomPanel.rate()` and `compactLine()` re-evaluate on every tick

- [ ] Evaluar la mejora 74 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 74 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 74 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 74 y corregir cualquier regresión causada por el cambio.

### Mejora 75 — Finding 16.5.E — LOW — `App.tsx` persistence effect reads `loop.state()` and `loop.iteration()` — double subscription

- [ ] Evaluar la mejora 75 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 75 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 75 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 75 y corregir cualquier regresión causada por el cambio.

### Mejora 76 — Finding 16.6.B — MEDIUM — Test at `api.test.ts:196-209` is fragile due to module-level cache state

- [ ] Evaluar la mejora 76 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 76 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 76 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 76 y corregir cualquier regresión causada por el cambio.

### Mejora 77 — Finding 16.6.C — LOW — `clientCache` could grow across `bun test` runs in the same process

- [ ] Evaluar la mejora 77 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 77 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 77 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 77 y corregir cualquier regresión causada por el cambio.

### Mejora 78 — Finding 17.1.B — LOW — `main().catch()` does not call `restoreTerminal()` directly

- [ ] Evaluar la mejora 78 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 78 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 78 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 78 y corregir cualquier regresión causada por el cambio.

### Mejora 79 — Finding 17.2.B — LOW — `main().catch()` lacks an explicit `restoreTerminal()` call (carryover)

- [ ] Evaluar la mejora 79 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 79 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 79 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 79 y corregir cualquier regresión causada por el cambio.

### Mejora 80 — Finding 17.3.A — MEDIUM — `onMount` awaits `detectInstalledTerminals()` without a try/catch

- [ ] Evaluar la mejora 80 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 80 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 80 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 80 y corregir cualquier regresión causada por el cambio.

### Mejora 81 — Finding 17.3.B — MEDIUM — `await saveConfig(newConfig)` in four command `onSelect` callbacks is unguarded

- [ ] Evaluar la mejora 81 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 81 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 81 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 81 y corregir cualquier regresión causada por el cambio.

### Mejora 82 — Finding 17.3.C — LOW — `handleQuit` calls `renderer.setTerminalTitle` and `renderer.destroy` without a try/catch

- [ ] Evaluar la mejora 82 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 82 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 82 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 82 y corregir cualquier regresión causada por el cambio.

### Mejora 83 — Finding 17.4.A — MEDIUM — `getPlanCompleteSummary` failure is misclassified as an iteration error

- [ ] Evaluar la mejora 83 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 83 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 83 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 83 y corregir cualquier regresión causada por el cambio.

### Mejora 84 — Finding 17.4.B — LOW — `validatePrerequisites` propagates `exists()` exceptions to `main().catch()`

- [ ] Evaluar la mejora 84 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 84 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 84 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 84 y corregir cualquier regresión causada por el cambio.

### Mejora 85 — Finding 17.4.C — LOW — TOCTOU window between `exists()` and `text()` in `isPlanComplete` / `getPlanCompleteSummary`

- [ ] Evaluar la mejora 85 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 85 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 85 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 85 y corregir cualquier regresión causada por el cambio.

### Mejora 86 — Finding 17.5.A — LOW — `Bun.write()` in `validatePrerequisites` propagates errors to `main().catch()`

- [ ] Evaluar la mejora 86 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 86 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 86 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 86 y corregir cualquier regresión causada por el cambio.

### Mejora 87 — Finding 17.7.B — LOW — `finally { clearTimeout(failsafe) }` is unreachable from the catch-exit path

- [ ] Evaluar la mejora 87 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 87 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 87 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 87 y corregir cualquier regresión causada por el cambio.

### Mejora 88 — Finding 17.8.B — LOW — `require()` is a CommonJS primitive in an ESM-first project

- [ ] Evaluar la mejora 88 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 88 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 88 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 88 y corregir cualquier regresión causada por el cambio.

### Mejora 89 — Finding 18.2.A — HIGH — `useServer.ts` has no test (carried from 18.1.B)

- [ ] Evaluar la mejora 89 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 89 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 89 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 89 y corregir cualquier regresión causada por el cambio.

### Mejora 90 — Finding 18.2.B — HIGH — `shutdown.ts` has no test (failsafe race verified by file read only)

- [ ] Evaluar la mejora 90 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 90 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 90 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 90 y corregir cualquier regresión causada por el cambio.

### Mejora 91 — Finding 18.2.C — MEDIUM — `config.ts` has no test

- [ ] Evaluar la mejora 91 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 91 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 91 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 91 y corregir cualquier regresión causada por el cambio.

### Mejora 92 — Finding 18.2.D — MEDIUM — `terminal-launcher.ts`, `clipboard.ts`, `power.ts` have no test

- [ ] Evaluar la mejora 92 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 92 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 92 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 92 y corregir cualquier regresión causada por el cambio.

### Mejora 93 — Finding 18.2.E — LOW — `theme-resolver.ts`, `i18n.ts`, `project.ts`, `command-exists.ts` have no test

- [ ] Evaluar la mejora 93 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 93 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 93 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 93 y corregir cualquier regresión causada por el cambio.

### Mejora 94 — Finding 18.2.F — LOW — `context/*.tsx` and `components/*.tsx` have no test

- [ ] Evaluar la mejora 94 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 94 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 94 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 94 y corregir cualquier regresión causada por el cambio.

### Mejora 95 — Finding 18.3.A — MEDIUM — `useSSE.test.ts` tests the classifier, not the hook (carried from 18.1.A)

- [ ] Evaluar la mejora 95 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 95 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 95 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 95 y corregir cualquier regresión causada por el cambio.

### Mejora 96 — Finding 18.3.B — MEDIUM — `useServer.test.ts` does not exist (cross-reference a 18.2.A)

- [ ] Evaluar la mejora 96 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 96 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 96 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 96 y corregir cualquier regresión causada por el cambio.

### Mejora 97 — Finding 18.3.C — LOW — `DialogContext.tsx` top-only render contract is not pinned

- [ ] Evaluar la mejora 97 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 97 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 97 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 97 y corregir cualquier regresión causada por el cambio.

- [x] Procesar el siguiente bloque explícito de mejora agregado a esta Fase 2 después de leer `MEJORAS.md`.
- [x] Confirmar que no quedan mejoras de `MEJORAS.md` sin bloque explícito de tareas en este `PLAN.md`.
- [x] Si falta alguna mejora, actualizar este `PLAN.md` agregando sus tareas explícitas antes de continuar con la consolidación.

## Fase 3 — Consolidación

- [ ] Revisar los cambios acumulados para eliminar duplicación introducida durante las implementaciones.
- [ ] Confirmar que ninguna mejora implementada contradice patrones existentes del proyecto.
- [ ] Confirmar que no quedaron cambios parciales, archivos temporales ni código muerto.
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
