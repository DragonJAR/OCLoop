# Cambios

Registro de cambios derivados de la auditoría exhaustiva de los flujos de
ejecución de OCLoop (CLI con/sin parámetros, casos límite, entradas inválidas
y escenarios de error).

> Nota: este archivo se fuerza al staging con `git add -f` porque `.gitignore`
> ignora `*.md` por defecto. La documentación oficial del proyecto vive en
> `CHANGELOG.md` (allowlisted); este archivo complementa esa entrada con el
> detalle problema → solución pedido por la auditoría.

## 2026-06-18 — Auditoría de flujos y corrección de tipo

### Resumen de la auditoría

Se analizaron y ejecutaron todos los flujos de la CLI (bundle `dist`):

- **Args válidos**: `--help`, `-h`, `--version`, `-v` → salida limpia, exit 0. ✅
- **Args inválidos** (flag desconocido, `--port abc`, `--port 99999`,
  `--prompt --debug`, `--model sinbarra`, `--lang fr`, `--resilience foo`,
  `--resilience inventado=5`, `--resilience maxRateLimitRetries=abc`) →
  mensaje localizado + exit 1. ✅
- **Preflight de cwd**: cwd no escribible → error localizado + exit 1. ✅
- **Archivos de plan**: sin `PLAN.md`, `PLAN.md` vacío (0 bytes), `PLAN.md`
  solo con headings → error "plan vacío/no encontrado" + exit 1. ✅
- **Auto-create de prompt**: con `PLAN.md` válido se crea `.loop-prompt.md`
  antes de cualquier render. ✅
- **Guard de no-TTY**: entrada/salida piped o sin TTY real → error limpio en
  vez de segfault en `render()`; verificado en modo normal y `--debug`. ✅
- **`--create-plan`**: sale antes del TUI; advierte sobre flags TUI-only que
  ignora. ✅

Todos los exit codes verificados sin pipe (zsh reporta 0 bajo pipe por el
cierre temprano).

### Hallazgo y corrección

**Problema (severidad HIGH):** hueco de tipado introducido al extraer el hook
`useCooldown` (fase 3b del refactor previo). La interfaz `CooldownDeps.addEvent`
declaraba:

```ts
addEvent: (
  type: string,
  message: string,
  opts?: { level?: "warn"; progress?: { current: number; total: number } },
) => void
```

…mientras que los tipos reales de `activityLog.addEvent` son:

- `type: ActivityEventType` — unión de 10 literales
  (`"session_start" | "session_idle" | "task" | "file_edit" | "error" |
  "user_message" | "assistant_message" | "reasoning" | "tool_use" |
  "file_read"`).
- `opts.level?: Level` donde `Level = "info" | "warn" | "error"`.

El hueco se ocultaba con un cast inseguro en `App.tsx` al cablear el hook:

```ts
addEvent: (type, message, opts) => activityLog.addEvent(type as never, message, opts)
```

**Consecuencia:** el compilador no podía detectar un `type` o `level` inválido
que se pasara en el futuro. En runtime el evento caería silenciosamente al
`DEFAULT_META` de `activity-format.ts` y se renderizaría con una etiqueta
genérica (`[event]`) en vez de la correcta (p. ej. `[error]`). El `enterCooldown`
original (inline en `App.tsx`, pre-extracción) llamaba
`activityLog.addEvent("error", …)` con el tipo literal correcto y **no** tenía
cast ni hueco — la regresión fue introducida por el refactor.

**Solución (DRY + tipos reales):** se tipó la interfaz con los tipos reales
exportados desde `useActivityLog` y se eliminó el cast:

- `src/hooks/useCooldown.ts`:
  - import de `ActivityEventType` y `AddEventOptions` desde `./useActivityLog`;
  - `addEvent` pasa a
    `(type: ActivityEventType, message: string, opts?: AddEventOptions) => void`.
- `src/App.tsx`: el cableo queda
  `activityLog.addEvent(type, message, opts)` sin cast.

Ahora un valor inválido se rechaza en tiempo de compilación, no en runtime.

### Verificación

- `bun test`: **885 pass / 1 skip / 0 fail** (sin regresión vs. baseline).
- `bun run build.ts`: exitoso.
- El bundle `dist/index.js` ya **no contiene `as never`** (0 ocurrencias; era
  1 antes del fix).
- Flujos de CLI inválidos siguen saliendo con exit 1.
- Auditoría estática adicional de los 5 hooks extraídos (vía subagente): el
  cast era el único bug real; el resto de los hallazgos son fieles al original
  o mejoras inocuas (`onCleanup` nuevo pero idempotente, wrappers `void`,
  etc.).
