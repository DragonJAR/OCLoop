<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/DragonJAR/OCLoop@main/assets/logo.jpg" width="300" />
</p>
<p align="center">
  <i>Round and round we go</i>
</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-0.5.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/runtime-Bun-black" alt="Bun" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
  <a href="https://www.DragonJAR.org"><img src="https://img.shields.io/badge/author-DragonJAR%20SAS-orange.svg" alt="Author" /></a>
  <a href="README.md"><img src="https://img.shields.io/badge/read%20in-English-blue.svg" alt="English" /></a>
</p>
<p align="center">
  <a href="README.md">English</a> · <b>Español</b>
</p>

---

**OCLoop** es un harness de bucle que orquesta [OpenCode](https://opencode.ai) para ejecutar las tareas de un archivo `PLAN.md` **una por una**, cada una en su propia sesión aislada y con visibilidad total de lo que hace OpenCode. Tú escribes (o generas) un plan; OCLoop lo recorre tarea por tarea y está construido para **seguir trabajando sin supervisión** — pese a los rate limits del proveedor, la suspensión del equipo, cuelgues del servidor e incluso una caída total.

## Tabla de contenidos

- [Características](#características)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Inicio rápido](#inicio-rápido)
- [Flujo recomendado](#flujo-recomendado)
- [Generar un plan (`--create-plan`)](#generar-un-plan---create-plan)
- [Opciones de línea de comandos](#opciones-de-línea-de-comandos)
- [Formato del archivo de plan](#formato-del-archivo-de-plan)
- [Atajos de teclado](#atajos-de-teclado)
- [Paleta de comandos (`Ctrl+P`)](#paleta-de-comandos-ctrlp)
- [Idioma (i18n)](#idioma-i18n)
- [Tema](#tema)
- [Resiliencia](#resiliencia)
- [Configuración](#configuración)
- [Archivos](#archivos)
- [Solución de problemas](#solución-de-problemas)
- [Desarrollo](#desarrollo)
- [Licencia](#licencia)
- [Autor](#-autor)

## Características

- **Ejecución automática de tareas** — recorre un plan tarea por tarea, cada una con una ventana de contexto nueva.
- **Memoria entre tareas** — cada tarea completada deja una nota breve de decisión para la siguiente iteración (ver [Formato del archivo de plan](#formato-del-archivo-de-plan)).
- **Generador interactivo de planes** — `--create-plan` redacta un `PLAN.md` a partir de un objetivo de una línea.
- **Dashboard en vivo** — estado, tiempos por iteración, promedio, ETA, barra de progreso, estimación de coste e indicador de salud del guardián.
- **Registro de actividad** — uso de herramientas, ediciones de archivos y conteo de tokens en tiempo real.
- **Resiliencia sin supervisión** — un guardián de tarea que sobrevive a rate limits, suspensión, cuelgues de servidor/sesión y caídas totales (ver [Resiliencia](#resiliencia)).
- **Detección de tareas atascadas** — se detiene automáticamente cuando la misma tarea arranca N veces sin progreso, en vez de quedar en bucle infinito.
- **Pausa / reanudación** — pausa de forma elegante tras la tarea actual, o cancela una pausa pendiente al instante.
- **Paleta de comandos** — acceso rápido a cada acción con `Ctrl+P`.
- **Selector de tema en vivo** — previsualiza cualquiera de los 33 temas (incluido el tema de marca DragonJAR) con `↑`/`↓` y confirma con `Enter`.
- **Interfaz bilingüe** — inglés por defecto, español cuando lo pidas (`--lang`, configuración o la paleta).
- **Integración con terminal** — abre OpenCode en una terminal externa, o copia el comando de conexión al portapapeles, para interactuar a mitad de iteración.
- **Recuperación ante caídas** — el progreso mínimo se persiste; `--resume` continúa una ejecución interrumpida.

## Requisitos

- Runtime [Bun](https://bun.sh) (v1.0 o superior)
- [OpenCode](https://opencode.ai) instalado y configurado (claves de API, modelo, agentes)

## Instalación

### Desde el código fuente

```bash
git clone https://github.com/DragonJAR/OCLoop.git
cd OCLoop
bun install
bun run build
bun link        # deja `ocloop` disponible globalmente
```

## Inicio rápido

```bash
# 1. Crea un plan interactivamente
ocloop --create-plan

# 2. Ejecuta OCLoop y pulsa S para empezar
ocloop
```

¿Prefieres escribir el plan tú mismo? Copia el ejemplo, modifícalo para tu proyecto y déjalo como `PLAN.md` en la raíz de la carpeta donde va a trabajar OCLoop:

```bash
cp examples/PLAN.md ./PLAN.md
# luego edita ./PLAN.md con las tareas de tu proyecto
```

## Flujo recomendado

Una ejecución completa y fiable desde cero:

1. **Instala los requisitos** — Bun y OpenCode, con tu modelo/agente/claves de API configurados en OpenCode.
2. **Personaliza el prompt de bucle si hace falta** — el `.loop-prompt.md` por defecto se crea automáticamente en la primera ejecución. Para personalizarlo antes, copia `examples/loop-prompt.es.md` a `.loop-prompt.md` y edítalo. Para usar otro nombre o ubicación del prompt de bucle, pasa `--prompt <ruta>` — ten en cuenta que una ruta personalizada debe existir de antemano (el auto-creado solo aplica al `.loop-prompt.md` por defecto).
3. **Crea el plan** — una de dos:
   - ejecuta **`ocloop --create-plan`**, describe tu objetivo, revisa el plan propuesto y guárdalo; o
   - escribe `PLAN.md` a mano con el [formato de plan](#formato-del-archivo-de-plan) (parte de `examples/PLAN.md`).
4. **Inicia el bucle** — ejecuta `ocloop` y pulsa **`S`** (o `ocloop -r` para empezar de inmediato).
5. **Míralo trabajar** — el dashboard muestra el estado, la tarea, los tiempos y la salud del guardián; el registro de actividad transmite lo que hace OpenCode. Usa **`Espacio`** para pausar, **`Ctrl+P`** para la paleta de comandos y **`T`** para abrir OpenCode en una terminal real.
6. **Déjalo corriendo** — los rate limits, la suspensión y los tropiezos del servidor se manejan automáticamente. Si el proceso completo muere, relánzalo con **`ocloop --resume`** para continuar.
7. **Listo** — el bucle termina cuando se terminan todas las tareas automatizables (OCLoop lo detecta de forma estructural y añade él mismo una etiqueta `<plan-complete>` con el resumen — no depende de que el modelo la escriba), sales con `Q`, o ocurre un error irrecuperable.

## Generar un plan (`--create-plan`)

`ocloop --create-plan` (o `-c`) lanza un generador interactivo en lugar de la TUI:

1. Te pregunta qué quieres que OCLoop construya.
2. Usa **zai-coding-plan/glm-5.2** y el agente **`plan`** por defecto para redactar un `PLAN.md` con el formato de OCLoop. Recomendamos este proveedor por su mejor relación calidad-precio para OCLoop; además, [este enlace](https://z.ai/subscribe?ic=FXSFEPRECU) te ahorra un 10%.
3. Te muestra el plan propuesto y pregunta si **guardar**, **editar** (refinar con feedback) o **cancelar**.
4. Al guardar, escribe el archivo (en `--plan <ruta>`, por defecto `PLAN.md`) y te indica cómo empezar.

El plan generado sigue el [idioma de la interfaz](#idioma-i18n). Cambia el modelo/agente con `--model <proveedor/modelo>` / `--agent`:

```bash
ocloop --create-plan                       # zai-coding-plan/glm-5.2 + agente plan
ocloop --create-plan --model openai/gpt-5  # modelo personalizado
ocloop --create-plan --plan roadmap.md     # escribir en una ruta personalizada
```

## Opciones de línea de comandos

```
Uso: ocloop [opciones]
```

| Opción | Descripción |
| --- | --- |
| `-p, --port <número>` | Puerto del servidor (por defecto de OpenCode: probar 4096, luego aleatorio) |
| `-m, --model <proveedor/modelo>` | Modelo a usar, por ejemplo `openai/gpt-5` (por defecto: el modelo propio del agente elegido, si no el modelo configurado en OpenCode) |
| `-a, --agent <string>` | Agente a usar (por defecto: el `default_agent` de OpenCode, con respaldo a `build`) |
| `-r, --run` | Inicia las iteraciones de inmediato (por defecto: espera `S`) |
| `-c, --create-plan` | Genera `PLAN.md` interactivamente y sale (modelo zai-coding-plan/glm-5.2, agente plan) |
| `-d, --debug` | Modo debug/sandbox (sin validación del plan, sesiones manuales) |
| `--verbose` | Activa el registro detallado (eventos de teclado, etc.) |
| `--routing` | Muestra el panel de routing de modelos al arranque (asigna modelos a los roles heavy/judge/cheap desde el catálogo en vivo de opencode) |
| `--prompt <ruta>` | Ruta del archivo de prompt de bucle (por defecto: `.loop-prompt.md`) |
| `--plan <ruta>` | Ruta del archivo de plan (por defecto: `PLAN.md`) |
| `--lang <en\|es>` | Idioma de la interfaz (por defecto: `en`; también en `Ctrl+P`; `--language` es un alias) |
| `--resume` | Reconcilia/continúa una ejecución persistida al arrancar |
| `--no-caffeinate` | No mantener el sistema despierto mientras corre (macOS) |
| `--chaos` | Activa la inyección de fallos (solo en debug) |
| `--resilience <clave=valor>` | Sobrescribe un umbral de resiliencia (repetible — ver [Ajustes](#ajustes)) |
| `-v, --version` | Muestra la versión |
| `-h, --help` | Muestra la ayuda |

```bash
# Ejemplos
ocloop                              # inicia, espera S
ocloop --create-plan                # genera un PLAN.md y sale
ocloop -r                           # inicia las iteraciones de inmediato
ocloop -m opencode/claude-sonnet-4  # usa un proveedor/modelo específico
ocloop -a plan                      # usa el agente plan
ocloop --plan mi-plan.md            # usa un archivo de plan personalizado
ocloop --lang es                    # interfaz en español
ocloop --resume                     # continúa una ejecución interrumpida por una caída
ocloop --resilience watchdogSuspectMs=120000
```

## Formato del archivo de plan

OCLoop parsea `PLAN.md` para seguir el progreso. Marcadores de tarea admitidos:

```markdown
- [ ] Tarea pendiente (se ejecutará)
- [x] Tarea completada
- [MANUAL] Tarea que requiere intervención humana (el bucle la omite)
- [BLOCKED: motivo] Tarea que no puede continuar (se omite)
```

Agrupa el trabajo bajo encabezados y deja un paso accionable por línea:

```markdown
# Mi proyecto

## Fase 1 — Preparación
- [ ] **1.1** Inicializar la estructura del proyecto
- [ ] **1.2** Añadir el módulo de configuración

## Fase 2 — Funcionalidades
- [ ] **2.1** Implementar la primera funcionalidad

## Criterios de aceptación
- ...
```

### Memoria entre tareas

Cuando OCLoop reinvoca al agente, la nueva sesión arranca con contexto en blanco. Para tender un puente entre iteraciones, el prompt de bucle le pide que deje una **nota corta** (1-3 líneas indentadas) bajo cada `[x]` que marca — capturando solo lo que una tarea posterior pueda necesitar: una decisión que restrinja el trabajo siguiente, un gotcha no obvio, o por qué se rechazó una alternativa. La siguiente iteración lee el plan completo (notas incluidas) y hereda ese contexto. Sin archivos extra, sin índice — `PLAN.md` es la única fuente de verdad.

```markdown
- [x] **1.1** Inicializar la estructura del proyecto
  - Decisión: runtime Bun + TS strict, sin bundler — restringe todas las tareas posteriores a las APIs de Bun.
  - Gotcha: el parser de OCLoop recorta la indentación antes de hacer match con `- [`, así que las notas de memoria deben ser prosa indentada/sub-bullets, nunca líneas `- [ ]`/`- [x]` indentadas, o el contador de progreso se rompe.
```

Las notas deben ser **prosa indentada o sub-bullets simples** (`  - Decisión: ...`), nunca líneas `- [ ]`/`- [x]` — el parser recorta la indentación antes de hacer match, así que un checkbox indentado contaría como tarea y corrompería la barra de progreso. Omítela cuando no haya nada digno de recordar; los gotchas permanentes del proyecto van en `AGENTS.md`.

### Planes auto-expansivos (tareas de reconocimiento)

Un plan puede crecer a sí mismo en tiempo de ejecución. Marca cualquier tarea de inventario/descubrimiento con `(recon)` (o `[RECON]`) en su título:

```markdown
- [ ] **1.1 (recon)** Inventa la superficie de ataque
  - Lista cada endpoint y función pública
  - Recursión: por cada uno, inserta una tarea `- [ ]` debajo para auditarlo
```

Cuando el agente completa una tarea `(recon)`, inserta una nueva tarea `- [ ]` por cada ítem descubierto **inmediatamente después** de la línea `[x]` (no al final). OCLoop relee `PLAN.md` en cada iteración, así que esas tareas nuevas se detectan y ejecutan en orden del documento — sin reinicio, sin edición manual.

```markdown
- [x] **1.1 (recon)** Inventa la superficie de ataque
  - Descubrió 12 endpoints; ver docs/attack-surface.md
- [ ] **1.1a** Audita POST /api/orders (IDOR e inyección)
- [ ] **1.1b** Audita GET /api/users/:id (autorización)
- ...
- [ ] **1.2** Siguiente tarea preexistente
```

Reglas que impone el prompt por defecto:
- El fan-out de recon es el **único** caso en que el agente puede añadir líneas `- [ ]` — nunca por ninguna otra razón.
- Cada tarea insertada nombra su **ítem específico** (ruta/endpoint/id) y su acción.
- Numéralas `N.Ma`, `N.Mb`, … heredando la fase del padre (p. ej. `**1.1a**`).
- Límite de **~20** por tarea recon; para más, agrupa ítems o márcalo como `[MANUAL]`.
- Nunca dupliques una tarea que ya esté pendiente.

Esto convierte "listar todos los archivos → revisar cada uno" en un único plan que se auto-extiende. Es especialmente potente para auditorías (por endpoint, por cuenta), pago de deuda (por TODO) y conciliaciones (por cuenta de balance). Los 20 planes de ejemplo en `examples/plans/` lo usan.

## Atajos de teclado

| Tecla | Estado | Acción |
| --- | --- | --- |
| `S` | Listo | Iniciar las iteraciones |
| `Espacio` | Ejecutando | Pausar tras la tarea actual |
| `Espacio` | Pausando | Cancelar la pausa pendiente (seguir corriendo) |
| `Espacio` | Pausado | Reanudar las iteraciones |
| `T` | Ejecutando / Pausando / Pausado / Cooldown | Abrir OpenCode en una terminal externa |
| `C` | Ejecutando / Pausando / Pausado / Cooldown | Copiar el comando de conexión al portapapeles |
| `Ctrl+P` | Cualquiera | Abrir la paleta de comandos |
| `?` | Cualquiera | Abrir el overlay de atajos/ayuda integrado |
| `Q` | La mayoría | Salir (con confirmación; **sin** confirmación si ya está `Completado`) |
| `R` | Error | Reintentar tras un error recuperable |
| `P` | Error (alto por `errNoProgress`) | Dividir la tarea atascada en sub-tareas más pequeñas (ver [Loop atascado](#resiliencia)) |
| `N` | Debug | Crear una sesión nueva |
| `P` | Debug | Enviar un prompt a la sesión |
| `I` | Debug | Insertar actividad de ejemplo (pruebas de UI) |

Dentro de cualquier selector (paleta de comandos, selector de tema, selector de terminal): `↑`/`↓` o `Ctrl+P`/`Ctrl+N` mueven la selección, `Re Pág`/`Av Pág` saltan de seis en seis, `Enter` selecciona, `Esc` cierra. Pulsar el fondo de cualquier diálogo también lo cierra. `Esc` cierra los diálogos que no tienen botones.

La pausa es **elegante**: al pulsar `Espacio` se termina la tarea actual antes de pausar, y el dashboard muestra `Pausando tras la tarea actual — Espacio cancelar`. Pulsa `Espacio` de nuevo para cancelar y seguir corriendo.

## Paleta de comandos (`Ctrl+P`)

Cada acción también está disponible en la paleta, sensible al contexto (los comandos se deshabilitan cuando no aplican):

- **Loop** — Iniciar, Pausar, Reanudar, Cancelar pausa pendiente, Reiniciar el servidor OpenCode
- **Terminal** — Copiar comando de conexión, Elegir terminal por defecto
- **Vista** — Alternar barra de desplazamiento, Salir
- **Idioma** — alternar entre Español e inglés (se guarda en tu configuración)
- **Apariencia** — Elegir tema (selector con vista previa en vivo, se guarda en tu configuración)
- **Ayuda** — Acerca de (versión, autor, enlaces)
- **Chaos** (solo con `--chaos` en debug) — matar/revivir servidor, congelar/descongelar sesión, inyectar rate limit

## Idioma (i18n)

La interfaz está **en inglés por defecto** con soporte completo de español. El idioma se resuelve así: flag `--lang` → `language` en `ocloop.json` → `en`.

```bash
ocloop --lang es            # esta ejecución en español
```

También puedes cambiar el idioma en caliente desde la paleta de comandos (`Ctrl+P` → `Idioma → English` / `Language → Español`); la elección se guarda en tu configuración. Los planes generados (`--create-plan`) se escriben en el idioma activo.

## Tema

OCLoop incluye **33 temas** — el tema de marca **DragonJAR** (acento rojo `#C11B05` sobre fondo casi negro) como predeterminado, más 32 temas de OpenCode incluidos (dracula, tokyonight, nord, catppuccin, gruvbox, entre otros). El **modo** claro/oscuro sigue tu preferencia de OpenCode (leído del `kv.json` de OpenCode); el **nombre** del tema es propio de OCLoop.

Elige uno en vivo sin reiniciar: `Ctrl+P` → **Elegir tema** abre un selector que **previsualiza cada tema al desplazarte** (`↑`/`↓`), confirma con `Enter` (y guarda la elección en `ocloop.json`), y revierte con `Esc`. El tema guardado actualmente se marca con `●`.

También puedes fijarlo estáticamente en tu configuración:

```jsonc
// ~/.config/ocloop/ocloop.json
{ "theme": "opencode" }   // cualquier id de tema, p. ej. dracula, tokyonight, nord
```

Si tu terminal no puede renderizar color, OCLoop se degrada automáticamente: respeta `NO_COLOR`, `TERM=dumb`, salida sin TTY y entornos de CI, colapsando a una paleta monocroma legible. Define `OCLOOP_ASCII=1` para forzar glifos ASCII, o `OCLOOP_UNICODE=1` para forzar glifos Unicode, en terminales con soporte Unicode ambiguo.

## Resiliencia

OCLoop está diseñado para seguir corriendo sin supervisión. Un **guardián de tarea** (watchdog) vigila el latido de cada iteración y, antes de tomar cualquier acción destructiva, lo confirma contra la verdad del terreno (un ping activo al servidor más el estado real de la sesión) — así nunca aborta una sesión que de verdad está trabajando, ni deja colgado un bucle muerto.

Lo que maneja:

- **Rate limits** — un `429`/overloaded nunca tumba el bucle. Entra en un estado `COOLDOWN`, respeta cualquier `Retry-After`, aplica backoff con jitter completo y reintenta la misma tarea. Tras `maxRateLimitRetries` límites consecutivos, expone un error recuperable.
- **Suspensión** — al cerrar la tapa, se detecta al despertar; OCLoop reconecta el stream de eventos y reconcilia la sesión en curso (recuperando una finalización perdida). En macOS ejecuta `caffeinate` mientras trabaja para no suspenderse (desactívalo con `--no-caffeinate`).
- **Cuelgues de servidor / sesión** — un health check activo reinicia un servidor OpenCode colgado y reconcilia la sesión; una sesión genuinamente bloqueada se aborta y reintenta. Un circuit breaker se detiene tras `maxRecoveryAttempts` y reporta un diagnóstico completo en vez de quedar en bucle.
- **Caída total** — el progreso mínimo se persiste de forma atómica en `.loop-state.json`. En el siguiente arranque OCLoop ofrece reanudar (automático con `--resume`). El apagado con `SIGINT`/`SIGTERM`/`SIGHUP` aborta la sesión activa para no dejar un servidor huérfano.
- **Bucle atascado** — si la misma tarea arranca `noProgressThreshold` veces seguidas (por defecto 3) sin que el plan avance, el bucle se detiene con un error recuperable `errNoProgress` en vez de quemar iteraciones en una tarea que el agente no logra terminar. El detector se reinicia con cualquier cambio de tarea, así que solo dispara ante un atasco real. Desde la detención puedes pulsar **`P`** para que el agente parta la tarea estancada en subtareas más pequeñas — OCLoop las muestra para aprobación y, si aceptas, reescribe `PLAN.md` (reemplazando la tarea estancada) y reanuda.

El dashboard muestra un indicador `Salud ●` (verde `OK` sano, amarillo verificando, rojo recuperando), y toda la actividad del guardián se registra en `.loop.log` como líneas estructuradas `[HEALTH]`, para auditar exactamente por qué actuó. Un `COOLDOWN` distingue un rate limit real (`COOLDOWN` con contador de reintentos) de un tropiezo de conexión transitorio (`WAITING`).

### Ajustes

Los umbrales de resiliencia se resuelven así: `valores por defecto` < `~/.config/ocloop/ocloop.json` (bloque `resilience`) < flags de CLI. Sobrescribe valores individuales con flags `--resilience clave=valor` repetibles:

```bash
ocloop --resilience watchdogSuspectMs=120000 --resilience maxRateLimitRetries=12
```

| Clave | Significado |
| --- | --- |
| `createTimeoutMs` | Timeout para crear una sesión |
| `promptTimeoutMs` | Timeout para enviar un prompt |
| `abortTimeoutMs` | Timeout para abortar una sesión |
| `statusTimeoutMs` | Timeout para reconciliar el estado de la sesión |
| `pingTimeoutMs` | Timeout del health check del servidor |
| `planTimeoutMs` | Presupuesto total para que `--create-plan` termine de generar (por defecto 600000 = 10 min; súbelo para planes grandes/lentos) |
| `backoffBaseMs` | Retardo base del backoff exponencial |
| `backoffMaxMs` | Retardo máximo del backoff |
| `backoffJitter` | Aplicar jitter completo al backoff (`true`/`false`) |
| `maxRateLimitRetries` | Reintentos por rate limit consecutivos antes de fallar |
| `minIterationGapMs` | Espaciado mínimo entre iteraciones (`0` = desactivado) |
| `sleepTickMs` | Intervalo de muestreo del detector de suspensión |
| `sleepThresholdMs` | Salto de reloj de pared que cuenta como suspensión/despertar |
| `caffeinate` | Mantener el sistema despierto mientras corre (`true`/`false`) |
| `watchdogTickMs` | Intervalo de evaluación del watchdog |
| `watchdogSuspectMs` | T1 — sin latido antes de sospechar |
| `watchdogConfirmMs` | T2 — sin latido (estando "working") antes de declarar bloqueo (por defecto 10 min; súbelo si tu agente corre herramientas largas y silenciosas como builds/test suites/instalaciones grandes) |
| `maxRecoveryAttempts` | Intentos de recuperación antes de escalar a error recuperable |
| `noProgressThreshold` | Iteraciones consecutivas que arrancan con la misma tarea antes de que el bucle se detenga con `errNoProgress` (por defecto 3 — le da al agente N-1 reintentos antes de detenerse en vez de quedar en bucle infinito) |
| `resume` | Reanudar automáticamente una ejecución persistida al arrancar |
| `chaos` | Activar la inyección de fallos |

## Configuración

OCLoop lee ajustes opcionales de `~/.config/ocloop/ocloop.json` (o `$XDG_CONFIG_HOME/ocloop/ocloop.json`):

```jsonc
{
  "language": "en",              // "en" | "es" (por defecto "en")
  "theme": "dragonjar",          // cualquier id de tema
  "scrollbar_visible": true,
  "terminal": { "type": "known", "name": "x-terminal-emulator" },
  "resilience": {                // cualquier subconjunto de las claves de Ajustes
    "watchdogSuspectMs": 120000,
    "maxRateLimitRetries": 12
  },
  "evals": {                     // opcional — capa LM-judge (desactivada por defecto)
    "enabled": true,
    "judgeModel": "anthropic/claude-haiku-4-5",  // omítelo para usar el modelo activo
    "maxEvalRetries": 1,
    "judgeTimeoutMs": 60000,
    "judgeRetries": 1
  }
}
```

### Capa de evaluación (opcional)

La capa de evaluación añade **verificación no determinista** sobre el gate de tests: tras pasar los tests de una tarea, un LM-judge puntúa la iteración contra una rúbrica declarada en el plan. Este es el diferenciador que el paper *The New SDLC With Vibe Coding* traza entre "vibe coding" y "agentic engineering" — *"Without both [tests and evals], the practice is always vibe coding."*

Es **opt-in** (`evals.enabled`, por defecto `false`) y **por tarea**: solo las tareas que declaran una rúbrica son evaluadas; el resto funciona exactamente igual que antes. Declara una rúbrica como un sub-bullet indentado justo después de la línea de la tarea:

```markdown
- [ ] Implementar el validador de entrada
  - eval: debe rechazar cadenas vacías y retornar null, nunca lanzar excepción
```

Ante un eval fallido, el loop re-ejecuta la misma tarea una vez (`maxEvalRetries: 1` por defecto) con la retroalimentación del judge escrita debajo de la tarea, y luego la marca `[BLOCKED: eval failed — <motivo>]` si falla de nuevo. Un judge roto (timeout/red tras `judgeRetries`) se trata como **skip**, nunca como bloqueo — la tarea del usuario no se detiene porque el servicio del judge esté caído. Invariante de seguridad: `maxEvalRetries` debe ser `≤ noProgressThreshold - 1` (1 ≤ 2 con los valores por defecto) para que los reintentos por eval no disparen el detector de tareas atascadas.

### Routing de modelos (opcional, `--routing`)

El paper *The New SDLC With Vibe Coding* describe el **routing inteligente de modelos** como la palanca financiera de la token economy: *"un modelo de fábrica bien diseñado enruta las tareas deterministas y de menor complejidad a modelos más pequeños, rápidos y significativamente más baratos."*

Lanza con `ocloop --routing` y, tras arrancar el servidor, un panel lista **todos los modelos conectados** de tu configuración de opencode y te pide asignar tres roles:

| Rol | Usado para |
| --- | --- |
| **heavy** | Cada tarea del plan (el modelo principal) |
| **judge** | El LM-judge de la capa de evaluación (combínalo con `evals.enabled`) |
| **cheap** | Reservado para trabajo determinista futuro (tests, revisión) |

El mapeo es **efímero** (solo este run). Presiona `Enter` para elegir un modelo, `S` para saltar un rol (cae al modelo por defecto), `Esc` para cancelar el routing por completo (el loop usa el único modelo resuelto, igual que sin el flag). Sin `--routing`, no cambia nada — el loop usa un solo modelo para todo.

El rol `judge` se compone con la capa de evaluación: si activas `--routing` y `evals.enabled`, el juez de los evals usa el modelo que elegiste en el panel (precedencia: panel > config `evals.judgeModel` > modelo activo).

El bloque `terminal` puede ser una terminal **conocida** `{ "type": "known", "name": "<nombre>" }` (una de las cuatro de abajo) o **personalizada** `{ "type": "custom", "command": "<bin>", "args": "<args con {cmd}>" }` para cualquier otra terminal — por ejemplo `{ "type": "custom", "command": "gnome-terminal", "args": "-- bash -lc '{cmd}'" }`. El placeholder `{cmd}` se reemplaza con el comando completo `opencode attach <url> --session <id>`. También puedes configurarlo interactivamente con `T` (o `Ctrl+P` → Elegir terminal por defecto).

**Terminales auto-detectadas (conocidas)** — solo estas cuatro se detectan automáticamente; cualquier otra necesita la forma personalizada:

| SO | Terminal |
| --- | --- |
| macOS | `Terminal` (Terminal.app, vía `osascript`) |
| Windows | `cmd` (cmd.exe) |
| Linux | `xterm`, `x-terminal-emulator` |

> **Nota sobre el portapapeles** — copiar el comando de conexión (`C`) requiere `pbcopy` (macOS), `clip` (Windows), o `wl-copy`/`xclip`/`xsel` (Linux). En un Linux mínimo sin ninguno, la copia falla con un toast en vez de hacer nada en silencio.

OCLoop también respeta las variables de entorno de OpenCode para claves de API y configuración de modelo — ver la [documentación de OpenCode](https://opencode.ai/docs).

### Variables de entorno

Propias de OCLoop:

| Variable | Efecto |
| --- | --- |
| `OCLOOP_ASCII=1` | Forzar glifos ASCII (desactiva Unicode) |
| `OCLOOP_UNICODE=1` | Forzar glifos Unicode (lo anula `OCLOOP_ASCII`) |

También respeta las variables convencionales de capacidad de terminal: `NO_COLOR` (desactiva color), `FORCE_COLOR` (nivel de color `0`-`3`), `TERM` (`dumb` → monocromo), `COLORTERM` (`truecolor`/`24bit`), y la cascada `CI`/`LANG`/`LC_*` para detección de UTF-8.

## Archivos

| Archivo | Propósito |
| --- | --- |
| `PLAN.md` | La lista de tareas a ejecutar. También el almacén de memoria entre tareas — el agente deja notas de decisión bajo cada `[x]` (ver [Memoria entre tareas](#memoria-entre-tareas)). |
| `.loop-prompt.md` | El prompt que se envía a OpenCode en cada iteración. Soporta un placeholder: `{{PLAN_FILE}}` (reemplazado por la ruta del plan resuelta). |
| `AGENTS.md` | Conocimiento persistente para OpenCode entre sesiones (gotchas del proyecto; lo carga OpenCode cada sesión) |
| `.loop.log` | Registro de depuración, incluida la telemetría estructurada `[HEALTH]` del watchdog; rotado a `.loop.log.old` al iniciar cada sesión |
| `.loop-state.json` | Progreso persistido para recuperación ante caídas (`--resume`) |

Todos los archivos `.loop*` se ignoran en git automáticamente.

### Métricas del dashboard

- **Task Time** — tiempo activo de la iteración actual, **excluyendo** pausas.
- **Avg/task** y **ETA** — tiempo medio por iteración completada, extrapolado a las tareas automatizables restantes.
- **Total Time** — reloj de pared desde el inicio, **incluyendo** pausas; congelado al alcanzar un estado terminal.
- **Tokens** — por iteración (`Task Tokens`, se reinicia cada iteración) y totales de toda la ejecución (entrada/salida, más lectura/escritura de caché en terminales anchas).
- **Tokens/min** — throughput.
- **Cost** — `~$X.XX` coste estimado en USD de toda la ejecución, a partir de una tabla estática de precios que cubre 53 modelos en 11 laboratorios (usa una media de respaldo cuando el modelo es desconocido).

## Solución de problemas

**"Error: archivo de plan no encontrado"** — crea un `PLAN.md` (o ejecuta `ocloop --create-plan`). Como mínimo:

```markdown
## Backlog
- [ ] Tu primera tarea
```

**"Error: archivo de prompt no encontrado"** — esto solo ocurre con un `--prompt <ruta>` personalizado. Crea ese archivo, u omite `--prompt` y deja que OCLoop cree automáticamente el `.loop-prompt.md` por defecto.

**El servidor no arranca** — asegúrate de que OpenCode esté instalado y en tu `PATH`, que tus claves de API estén configuradas, y revisa los logs de OpenCode.

**El bucle parece atascado** — el guardián detecta un atasco real automáticamente; observa el indicador `Salud ●` (verde `OK` sano) y las líneas `[HEALTH]` en `.loop.log`. Pulsa `T` para abrir OpenCode en una terminal y ver qué pasa. Si la recuperación se agota, el diálogo de error incluye un diagnóstico (antigüedad del último latido, veredicto de las sondas, intentos).

**Recibió un rate limit** — es esperado y se maneja: OCLoop muestra una cuenta atrás `COOLDOWN` y reintenta automáticamente.

**"Error: el directorio de trabajo no es escribible"** — OCLoop necesita acceso de escritura al directorio actual (para `.loop-state.json`, `.loop.log` y el `.loop-prompt.md` auto-creado). Una verificación pre-vuelo falla rápido con este mensaje si el directorio es de solo lectura o carece de permiso de escritura. Arregla los permisos (p. ej. `chmod u+w`) o ejecuta desde un directorio escribible.

**El bucle se detiene con `errNoProgress`** — disparó el detector de tareas atascadas: la misma tarea arrancó `noProgressThreshold` veces (por defecto 3) sin que el plan avance. Probablemente el agente no pueda completar esa tarea. Abre OpenCode con `T` para inspeccionar, o sube el umbral con `--resilience noProgressThreshold=N` si la tarea es genuinamente difícil y necesita más reintentos.

## Desarrollo

```bash
bun run dev      # ejecutar desde el código fuente
bun test         # ejecutar la batería de tests
bun run build    # build de producción
```

## Licencia

MIT

## 👨‍💻 Autor

Creado originalmente por **Fayçal Mitidji** ([d3vr](https://github.com/d3vr)). Este fork lo mantiene **[DragonJAR SAS](https://www.DragonJAR.org)** con varias mejoras.

[Expertos en servicios de seguridad informática, validación proactiva y seguridad ofensiva.](https://www.dragonjar.org/servicios-de-seguridad-informatica)
