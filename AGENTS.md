# AGENTS.md

Conocimiento persistente del proyecto para OpenCode/OCLoop. Se carga en **cada
sesión**, así que manténlo ligero: el detalle externo vive en `docs/` y se
referencia desde `## Research`.

OCLoop es un harness de bucle en **Bun + TypeScript** (TUI con **SolidJS** vía
`@opentui/solid`) que orquesta OpenCode para ejecutar `PLAN.md` tarea por tarea.

## Project Operations

- Instalar dependencias: `bun install`
- Typecheck (gate): `bunx tsc --noEmit`
- Tests (gate): `bun test`
- Build de producción: `bun run build`
- Ejecutar desde el código: `bun run dev`

El build (`build.ts` → `Bun.build`) **no** chequea tipos, así que `bunx tsc
--noEmit` es un gate aparte. Ejecuta los tres (`tsc --noEmit`, `bun test`,
`bun run build`) y confirma que pasan **antes** de marcar una tarea como hecha;
nunca commitees si fallan.

## Commit rules

- Un solo cambio lógico por commit, con mensaje descriptivo.
- Nunca `git add .` — añade solo los archivos de la tarea. Respeta `.gitignore`.
- Nunca hagas `push` ni uses `--no-verify` / evites los hooks.

## Conventions / Gotchas

- TypeScript estricto (`tsconfig.json`). Evita `any`.
- **i18n**: todo string visible al usuario va en `src/lib/i18n.ts` y debe existir
  en AMBAS locales (`en` y `es`); se usa vía `t("clave", params?)`. La paridad
  está type-enforced (`es: Record<MessageKey, Msg>`, `MessageKey = keyof typeof
  en`), así que `tsc` en verde garantiza que `es` no perdió ninguna clave.
- **Tests**: `bun:test` (`describe`/`it`/`expect`), archivos `*.test.ts`
  colocados junto al código. Sin frameworks externos.
- **I/O de archivos**: prefiere `Bun.file(path).text()/.exists()` para leer. Las
  escrituras durables usan `node:fs` con un patrón best-effort — reúsalos en vez
  de escribir fs nuevo: `loop-state-store.ts` (overwrite atómico tmp+rename),
  `debug-logger.ts` y `manifest.ts` (append best-effort que nunca lanza).
- **Archivos de runtime** `.loop*` (`.loop.log`, `.loop-state.json`,
  `.loop-manifest.jsonl`) y la carpeta `docs/` están en `.gitignore`: nunca los
  commitees.
- **Parser de `PLAN.md`**: una línea `- [ ]`/`- [x]` cuenta como tarea AUNQUE
  esté indentada. Las notas de memoria entre tareas deben ser prosa o
  sub-bullets simples, nunca checkboxes, o el contador de progreso se rompe.
- **Spawning en Windows**: un nombre pelado no resuelve PATHEXT (`Bun.spawn`
  lanza ENOENT aunque el binario exista). Resuélvelo a su ruta completa con
  `resolveSpawnable` (`command-exists.ts`) antes de spawnear — ya aplicado en
  `clipboard.ts`, `terminal-launcher.ts` y `opencode-server.ts` (lanzador
  `opencode` en win32). Todo fix de Windows va platform-gated
  (`process.platform === "win32"`) para que POSIX quede byte-identical.

## Research

<!--
Índice de conocimiento externo descubierto (comportamiento de APIs, peculiaridades
de librerías/repos). Mantén el detalle en docs/ y aquí solo referencias @ de una
línea. Ejemplo:
- @docs/opencode-sdk.md — peculiaridades del SDK de sesiones
-->

- @docs/opencode-permissions.md — OCLoop fuerza `permission: "allow"` al levantar el servidor; deep-merge de OPENCODE_CONFIG_CONTENT respeta los `deny` del usuario.
