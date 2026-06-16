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

- [ ] Evaluar la mejora 32 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 32 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 32 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 32 y corregir cualquier regresión causada por el cambio.

### Mejora 33 — Finding 11.2.A — MEDIUM — `Bun.spawn` is missing `detached: true`

- [ ] Evaluar la mejora 33 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 33 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 33 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 33 y corregir cualquier regresión causada por el cambio.

### Mejora 34 — Finding 11.2.B — LOW — Empty `config.args` for a custom terminal silently launches without the attach command

- [ ] Evaluar la mejora 34 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 34 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 34 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 34 y corregir cualquier regresión causada por el cambio.

### Mejora 35 — Finding 11.2.C — LOW — Missing `{cmd}` placeholder in custom args silently launches without the attach command

- [ ] Evaluar la mejora 35 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 35 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 35 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 35 y corregir cualquier regresión causada por el cambio.

### Mejora 36 — Finding 11.2.D — LOW — Empty `attachCmd` produces a corrupted spawn argv

- [ ] Evaluar la mejora 36 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 36 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 36 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 36 y corregir cualquier regresión causada por el cambio.

### Mejora 37 — Finding 11.3.A — LOW — Empty `url` produces a malformed `opencode attach` string (double space)

- [ ] Evaluar la mejora 37 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 37 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 37 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 37 y corregir cualquier regresión causada por el cambio.

### Mejora 38 — Finding 11.3.B — LOW — Empty `sessionId` produces a malformed `opencode attach` string (trailing space)

- [ ] Evaluar la mejora 38 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 38 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 38 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 38 y corregir cualquier regresión causada por el cambio.

### Mejora 39 — Finding 11.4.A — MEDIUM — macOS `pbcopy` is not detected; copy silently fails on stock macOS

- [ ] Evaluar la mejora 39 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 39 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 39 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 39 y corregir cualquier regresión causada por el cambio.

### Mejora 40 — Finding 11.4.B — MEDIUM — Windows `clip.exe` is not detected; copy silently fails on stock Windows

- [ ] Evaluar la mejora 40 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 40 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 40 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 40 y corregir cualquier regresión causada por el cambio.

### Mejora 41 — Finding 11.4.C — LOW — Call sites do not check `ClipboardResult`; success toast shown on failure

- [ ] Evaluar la mejora 41 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 41 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 41 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 41 y corregir cualquier regresión causada por el cambio.

### Mejora 42 — Finding 11.4.D — LOW — `clipboard.ts` has no test coverage

- [ ] Evaluar la mejora 42 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 42 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 42 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 42 y corregir cualquier regresión causada por el cambio.

### Mejora 43 — Finding 12.1.A — MEDIUM — `loadConfig` does not validate per-field types

- [ ] Evaluar la mejora 43 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 43 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 43 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 43 y corregir cualquier regresión causada por el cambio.

### Mejora 44 — Finding 12.1.B — LOW — Unknown top-level keys silently kept; typo like `languaje` falls back to English silently

- [ ] Evaluar la mejora 44 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 44 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 44 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 44 y corregir cualquier regresión causada por el cambio.

### Mejora 45 — Finding 12.1.C — LOW — No test coverage for `loadConfig`; six required cases unverified

- [ ] Evaluar la mejora 45 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 45 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 45 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 45 y corregir cualquier regresión causada por el cambio.

### Mejora 46 — Finding 12.2.A — MEDIUM — `saveConfig` does not catch I/O errors

- [ ] Evaluar la mejora 46 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 46 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 46 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 46 y corregir cualquier regresión causada por el cambio.

### Mejora 47 — Finding 12.2.B — LOW — `tmpPath` is a fixed suffix `.tmp`; simultaneous writes clobber each other

- [ ] Evaluar la mejora 47 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 47 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 47 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 47 y corregir cualquier regresión causada por el cambio.

### Mejora 48 — Finding 12.2.C — LOW — Stale `.tmp` files not cleaned up after `writeFileSync` ok but `renameSync` failed

- [ ] Evaluar la mejora 48 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 48 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 48 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 48 y corregir cualquier regresión causada por el cambio.

### Mejora 49 — Finding 12.2.D — LOW — `existsSync(configDir)` is redundant; `mkdirSync({ recursive: true })` is idempotent

- [ ] Evaluar la mejora 49 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 49 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 49 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 49 y corregir cualquier regresión causada por el cambio.

### Mejora 50 — Finding 12.2.E — LOW — `saveConfig` returns `void` but all four callers `await` it

- [ ] Evaluar la mejora 50 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 50 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 50 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 50 y corregir cualquier regresión causada por el cambio.

### Mejora 51 — Finding 12.3.A — MEDIUM — `pickDefined` skips `undefined` but NOT `null`

- [ ] Evaluar la mejora 51 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 51 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 51 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 51 y corregir cualquier regresión causada por el cambio.

### Mejora 52 — Finding 12.3.B — LOW — `pickDefined` does not validate per-field types

- [ ] Evaluar la mejora 52 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 52 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 52 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 52 y corregir cualquier regresión causada por el cambio.

### Mejora 53 — Finding 12.3.C — LOW — `pickDefined` does not reject unknown keys

- [ ] Evaluar la mejora 53 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 53 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 53 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 53 y corregir cualquier regresión causada por el cambio.

### Mejora 54 — Finding 12.5.E — LOW — `logDiff` is defined but never referenced

- [ ] Evaluar la mejora 54 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 54 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 54 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 54 y corregir cualquier regresión causada por el cambio.

### Mejora 55 — Finding 15.4.A — LOW — `handleQuit` lacks a module-level `isShuttingDown` guard

- [ ] Evaluar la mejora 55 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 55 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 55 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 55 y corregir cualquier regresión causada por el cambio.

### Mejora 56 — Finding 15.5.A — LOW — No debounce on rapid-fire `file.edited` events for PLAN.md

- [ ] Evaluar la mejora 56 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 56 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 56 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 56 y corregir cualquier regresión causada por el cambio.

### Mejora 57 — Finding 15.7.A — HIGH — `server.restart()` aborts in-flight launches and leaks server processes

- [ ] Evaluar la mejora 57 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 57 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 57 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 57 y corregir cualquier regresión causada por el cambio.

### Mejora 58 — Finding 15.7.B — MEDIUM — App-level `restartServer()` has no re-entry guard

- [ ] Evaluar la mejora 58 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 58 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 58 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 58 y corregir cualquier regresión causada por el cambio.

### Mejora 59 — Finding 15.8.A — MEDIUM — `initializeSession` can read default `resilience` before `onMount` resolves on-disk config

- [ ] Evaluar la mejora 59 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 59 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 59 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 59 y corregir cualquier regresión causada por el cambio.

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
