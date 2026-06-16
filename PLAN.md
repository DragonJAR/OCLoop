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

- [ ] Evaluar la mejora 6 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 6 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 6 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 6 y corregir cualquier regresión causada por el cambio.

### Mejora 7 — Finding 1.7.A — MEDIUM — `--create-plan` silently swallows TUI-only flags; no diagnostic

- [ ] Evaluar la mejora 7 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 7 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 7 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 7 y corregir cualquier regresión causada por el cambio.

### Mejora 8 — Finding 1.7.B — LOW — `--create-plan --prompt X` skips the prompt-file validation

- [ ] Evaluar la mejora 8 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 8 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 8 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 8 y corregir cualquier regresión causada por el cambio.

### Mejora 9 — Finding 1.8.A — MEDIUM — Cross-reference a 1.7.A: `--resume` is silently swallowed by `--create-plan`

- [ ] Evaluar la mejora 9 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 9 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 9 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 9 y corregir cualquier regresión causada por el cambio.

### Mejora 10 — Finding 1.8.B — LOW — `--resume` with no persisted state is a silent no-op

- [ ] Evaluar la mejora 10 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 10 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 10 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 10 y corregir cualquier regresión causada por el cambio.

### Mejora 11 — Finding 3.1.A — MEDIUM — `plan_complete` from `error` ALWAYS resets iterations to 0

- [ ] Evaluar la mejora 11 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 11 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 11 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 11 y corregir cualquier regresión causada por el cambio.

### Mejora 12 — Finding 4.1.A — LOW — `console.error` used in TUI flow where `log.error` is the project convention

- [ ] Evaluar la mejora 12 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 12 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 12 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 12 y corregir cualquier regresión causada por el cambio.

### Mejora 13 — Finding 4.1.B — MEDIUM — Empty / whitespace-only prompt file is sent verbatim

- [ ] Evaluar la mejora 13 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 13 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 13 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 13 y corregir cualquier regresión causada por el cambio.

### Mejora 14 — Finding 4.1.C — LOW — Orphaned session on `sendPromptAsync` failure

- [ ] Evaluar la mejora 14 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 14 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 14 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 14 y corregir cualquier regresión causada por el cambio.

### Mejora 15 — Finding 4.2.B — LOW — `startingIteration` is a plain variable, not part of the persisted state

- [ ] Evaluar la mejora 15 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 15 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 15 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 15 y corregir cualquier regresión causada por el cambio.

### Mejora 16 — Finding 5.1.A — MEDIUM — `transient` kind dispatched as `rate_limited` to the reducer

- [ ] Evaluar la mejora 16 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 16 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 16 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 16 y corregir cualquier regresión causada por el cambio.

### Mejora 17 — Finding 5.1.B — MEDIUM — `clearCooldownTimers` is called *after* the dispatch, not before

- [ ] Evaluar la mejora 17 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 17 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 17 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 17 y corregir cualquier regresión causada por el cambio.

### Mejora 18 — Finding 5.1.C — LOW — `setCooldownRemainingMs(delayMs)` briefly shows the *full* delay

- [ ] Evaluar la mejora 18 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 18 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 18 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 18 y corregir cualquier regresión causada por el cambio.

### Mejora 19 — Finding 5.1.D — LOW — `clearInterval` inside the ticker relies on closure-captured `cooldownTicker`

- [ ] Evaluar la mejora 19 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 19 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 19 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 19 y corregir cualquier regresión causada por el cambio.

### Mejora 20 — Finding 5.1.E — LOW — `log.health` for the exhausted branch omits `retryAfter`

- [ ] Evaluar la mejora 20 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 20 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 20 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 20 y corregir cualquier regresión causada por el cambio.

### Mejora 21 — Finding 5.2.A — LOW — `error` dispatched from `cooldown` does not clear cooldown timers

- [ ] Evaluar la mejora 21 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 21 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 21 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 21 y corregir cualquier regresión causada por el cambio.

### Mejora 22 — Finding 5.3.A — LOW — `cooldownTicker` is not explicitly cleared on the regular resume path

- [ ] Evaluar la mejora 22 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 22 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 22 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 22 y corregir cualquier regresión causada por el cambio.

### Mejora 23 — Finding 5.6.A — MEDIUM — Dashboard `cooldownText` always shows "Rate limited" even for transient cooldowns

- [ ] Evaluar la mejora 23 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 23 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 23 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 23 y corregir cualquier regresión causada por el cambio.

### Mejora 24 — Finding 6.2.A — LOW — Duplicated predicate in `App.tsx` invites drift

- [ ] Evaluar la mejora 24 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 24 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 24 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 24 y corregir cualquier regresión causada por el cambio.

### Mejora 25 — Finding 7.2.A — MEDIUM — Consumer/hook filter share an asymmetric shape

- [ ] Evaluar la mejora 25 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 25 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 25 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 25 y corregir cualquier regresión causada por el cambio.

### Mejora 26 — Finding 7.3.A — LOW — Hook-layer filter for `session.idle` is **opposite** to `session.error`

- [ ] Evaluar la mejora 26 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 26 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 26 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 26 y corregir cualquier regresión causada por el cambio.

### Mejora 27 — Finding 7.5.A — HIGH — `server.restart()` has no in-flight guard; can leak the first server

- [ ] Evaluar la mejora 27 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 27 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 27 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 27 y corregir cualquier regresión causada por el cambio.

### Mejora 28 — Finding 8.1.A — LOW — Orphan `.tmp` file on `rename` failure

- [ ] Evaluar la mejora 28 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 28 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 28 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 28 y corregir cualquier regresión causada por el cambio.

### Mejora 29 — Finding 8.2.A — MEDIUM — `loadLoopState` only validates `version` and `iteration`; other fields slip through

- [ ] Evaluar la mejora 29 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 29 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 29 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 29 y corregir cualquier regresión causada por el cambio.

### Mejora 30 — Finding 8.3.A — LOW — No test for the `EACCES` / `EPERM` branch of `clearLoopState`

- [ ] Evaluar la mejora 30 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 30 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 30 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 30 y corregir cualquier regresión causada por el cambio.

### Mejora 31 — Finding 8.4.A — LOW — `void saveLoopState(snapshot)` is fire-and-forget

- [ ] Evaluar la mejora 31 de `MEJORAS.md` contra el código actual y decidir si se implementa, se adapta o se descarta.
- [ ] Si la mejora 31 aporta valor y es viable, implementarla con el cambio mínimo correcto siguiendo DRY.
- [ ] Si la mejora 31 no es viable, documentar brevemente el motivo y no modificar el código para esa mejora.
- [ ] Ejecutar la verificación mínima aplicable después de la mejora 31 y corregir cualquier regresión causada por el cambio.

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

- [ ] Procesar el siguiente bloque explícito de mejora agregado a esta Fase 2 después de leer `MEJORAS.md`.
- [ ] Confirmar que no quedan mejoras de `MEJORAS.md` sin bloque explícito de tareas en este `PLAN.md`.
- [ ] Si falta alguna mejora, actualizar este `PLAN.md` agregando sus tareas explícitas antes de continuar con la consolidación.

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
