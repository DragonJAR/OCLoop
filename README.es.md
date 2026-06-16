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
- **Generador interactivo de planes** — `--create-plan` redacta un `PLAN.md` a partir de un objetivo de una línea.
- **Dashboard en vivo** — estado, tiempos por iteración, promedio, ETA, barra de progreso e indicador de salud del guardián.
- **Registro de actividad** — uso de herramientas, ediciones de archivos, conteo de tokens y diffs de git en tiempo real.
- **Resiliencia sin supervisión** — un guardián de tarea que sobrevive a rate limits, suspensión, cuelgues de servidor/sesión y caídas totales (ver [Resiliencia](#resiliencia)).
- **Pausa / reanudación** — pausa de forma elegante tras la tarea actual, o cancela una pausa pendiente al instante.
- **Paleta de comandos** — acceso rápido a cada acción con `Ctrl+P`.
- **Interfaz bilingüe** — inglés por defecto, español cuando lo pidas (`--lang`, configuración o la paleta).
- **Tema DragonJAR** — tema de consola con la marca por defecto, más los 32 temas de OpenCode incluidos.
- **Integración con terminal** — abre OpenCode en una terminal externa para interactuar a mitad de iteración.
- **Recuperación ante caídas** — el progreso mínimo se persiste; `--resume` continúa una ejecución interrumpida.

## Requisitos

- Runtime [Bun](https://bun.sh) (v1.0 o superior)
- [OpenCode](https://opencode.ai) instalado y configurado (claves de API, modelo, agentes)

## Instalación

### Desde npm

```bash
# Instalar globalmente
bun add -g ocloop

# O ejecutar sin instalar
bunx ocloop
```

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

¿Prefieres escribir el plan tú mismo? Copia el ejemplo en vez del paso 1:

```bash
cp examples/PLAN.md ./PLAN.md
```

## Flujo recomendado

Una ejecución completa y fiable desde cero:

1. **Instala los requisitos** — Bun y OpenCode, con tu modelo/agente/claves de API configurados en OpenCode.
2. **Personaliza el prompt de bucle si hace falta** — el `.loop-prompt.md` por defecto se crea automáticamente en la primera ejecución. Para personalizarlo antes, copia `examples/loop-prompt.es.md` a `.loop-prompt.md` y edítalo. Un `--prompt <ruta>` personalizado debe existir de antemano.
3. **Crea el plan** — una de dos:
   - ejecuta **`ocloop --create-plan`**, describe tu objetivo, revisa el plan propuesto y guárdalo; o
   - escribe `PLAN.md` a mano con el [formato de plan](#formato-del-archivo-de-plan) (parte de `examples/PLAN.md`).
4. **Inicia el bucle** — ejecuta `ocloop` y pulsa **`S`** (o `ocloop -r` para empezar de inmediato).
5. **Míralo trabajar** — el dashboard muestra el estado, la tarea, los tiempos y la salud del guardián; el registro de actividad transmite lo que hace OpenCode. Usa **`Espacio`** para pausar, **`Ctrl+P`** para la paleta de comandos y **`T`** para abrir OpenCode en una terminal real.
6. **Déjalo corriendo** — los rate limits, la suspensión y los tropiezos del servidor se manejan automáticamente. Si el proceso completo muere, relánzalo con **`ocloop --resume`** para continuar.
7. **Listo** — el bucle termina cuando el modelo marca el plan como completo (etiqueta `<plan-complete>`), se terminan todas las tareas automatizables, sales con `Q`, o ocurre un error irrecuperable.

## Generar un plan (`--create-plan`)

`ocloop --create-plan` (o `-c`) lanza un generador interactivo en lugar de la TUI:

1. Te pregunta qué quieres que OCLoop construya.
2. Usa **zai-coding-plan/glm-5.2** y el agente **`plan`** por defecto para redactar un `PLAN.md` con el formato de OCLoop.
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
| `-m, --model <proveedor/modelo>` | Modelo a usar, por ejemplo `openai/gpt-5` |
| `-a, --agent <string>` | Agente a usar (se pasa a OpenCode) |
| `-r, --run` | Inicia las iteraciones de inmediato (por defecto: espera `S`) |
| `-c, --create-plan` | Genera `PLAN.md` interactivamente y sale (modelo zai-coding-plan/glm-5.2, agente plan) |
| `-d, --debug` | Modo debug/sandbox (sin validación del plan, sesiones manuales) |
| `--verbose` | Activa el registro detallado (eventos de teclado, etc.) |
| `--prompt <ruta>` | Ruta del archivo de prompt de bucle (por defecto: `.loop-prompt.md`) |
| `--plan <ruta>` | Ruta del archivo de plan (por defecto: `PLAN.md`) |
| `--lang <en\|es>` | Idioma de la interfaz (por defecto: `en`; también en `Ctrl+P`) |
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

## Atajos de teclado

| Tecla | Estado | Acción |
| --- | --- | --- |
| `S` | Listo | Iniciar las iteraciones |
| `Espacio` | Ejecutando | Pausar tras la tarea actual |
| `Espacio` | Pausando | Cancelar la pausa pendiente (seguir corriendo) |
| `Espacio` | Pausado | Reanudar las iteraciones |
| `T` | Ejecutando / Pausado / Debug | Abrir OpenCode en una terminal externa |
| `Ctrl+P` | Cualquiera | Abrir la paleta de comandos |
| `Q` | La mayoría | Salir (con confirmación) |
| `R` | Error | Reintentar tras un error recuperable |
| `N` | Debug | Crear una sesión nueva |
| `P` | Debug | Enviar un prompt a la sesión |
| `I` | Debug | Insertar actividad de ejemplo (pruebas de UI) |

La pausa es **elegante**: al pulsar `Espacio` se termina la tarea actual antes de pausar, y el dashboard muestra `Pausando tras la tarea actual — Espacio cancelar`. Pulsa `Espacio` de nuevo para cancelar y seguir corriendo.

## Paleta de comandos (`Ctrl+P`)

Cada acción también está disponible en la paleta, sensible al contexto (los comandos se deshabilitan cuando no aplican):

- **Loop** — Iniciar, Pausar, Reanudar, Cancelar pausa pendiente, Reiniciar el servidor OpenCode
- **Terminal** — Copiar comando de conexión, Elegir terminal por defecto
- **Vista** — Alternar barra de desplazamiento, Salir
- **Idioma** — alternar entre Español e inglés (se guarda en tu configuración)
- **Chaos** (solo con `--chaos` en debug) — matar/revivir servidor, congelar/descongelar sesión, inyectar rate limit

## Idioma (i18n)

La interfaz está **en inglés por defecto** con soporte completo de español. El idioma se resuelve así: flag `--lang` → `language` en `ocloop.json` → `en`.

```bash
ocloop --lang es            # esta ejecución en español
```

También puedes cambiar el idioma en caliente desde la paleta de comandos (`Ctrl+P` → `Idioma → English` / `Language → Español`); la elección se guarda en tu configuración. Los planes generados (`--create-plan`) se escriben en el idioma activo.

## Tema

OCLoop incluye el tema de marca **DragonJAR** como predeterminado (acento rojo `#C11B05` sobre fondo casi negro), más los 32 temas de OpenCode incluidos. El modo claro/oscuro sigue tu preferencia de OpenCode. Para usar otro tema, configúralo:

```jsonc
// ~/.config/ocloop/ocloop.json
{ "theme": "opencode" }   // cualquier id de tema incluido, p. ej. dracula, tokyonight, nord
```

## Resiliencia

OCLoop está diseñado para seguir corriendo sin supervisión. Un **guardián de tarea** (watchdog) vigila el latido de cada iteración y, antes de tomar cualquier acción destructiva, lo confirma contra la verdad del terreno (un ping activo al servidor más el estado real de la sesión) — así nunca aborta una sesión que de verdad está trabajando, ni deja colgado un bucle muerto.

Lo que maneja:

- **Rate limits** — un `429`/overloaded nunca tumba el bucle. Entra en un estado `COOLDOWN`, respeta cualquier `Retry-After`, aplica backoff con jitter completo y reintenta la misma tarea. Tras `maxRateLimitRetries` límites consecutivos, expone un error recuperable.
- **Suspensión** — al cerrar la tapa, se detecta al despertar; OCLoop reconecta el stream de eventos y reconcilia la sesión en curso (recuperando una finalización perdida). En macOS ejecuta `caffeinate` mientras trabaja para no suspenderse (desactívalo con `--no-caffeinate`).
- **Cuelgues de servidor / sesión** — un health check activo reinicia un servidor OpenCode colgado y reconcilia la sesión; una sesión genuinamente bloqueada se aborta y reintenta. Un circuit breaker se detiene tras `maxRecoveryAttempts` y reporta un diagnóstico completo en vez de quedar en bucle.
- **Caída total** — el progreso mínimo se persiste de forma atómica en `.loop-state.json`. En el siguiente arranque OCLoop ofrece reanudar (automático con `--resume`). El apagado con `SIGINT`/`SIGTERM`/`SIGHUP` aborta la sesión activa para no dejar un servidor huérfano.

El dashboard muestra un indicador `Guardián ●` (verde sano, amarillo verificando, rojo recuperando), y toda la actividad del guardián se registra en `.loop.log` como líneas estructuradas `[HEALTH]`, para auditar exactamente por qué actuó.

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
| `resume` | Reanudar automáticamente una ejecución persistida al arrancar |
| `chaos` | Activar la inyección de fallos |

## Configuración

OCLoop lee ajustes opcionales de `~/.config/ocloop/ocloop.json` (o `$XDG_CONFIG_HOME/ocloop/ocloop.json`):

```jsonc
{
  "language": "en",              // "en" | "es"
  "theme": "dragonjar",          // cualquier id de tema incluido
  "scrollbar_visible": true,
  "terminal": { "type": "known", "name": "kitty" },
  "resilience": {                // cualquier subconjunto de las claves de Ajustes
    "watchdogSuspectMs": 120000,
    "maxRateLimitRetries": 12
  }
}
```

OCLoop también respeta las variables de entorno de OpenCode para claves de API y configuración de modelo — ver la [documentación de OpenCode](https://opencode.ai/docs).

## Archivos

| Archivo | Propósito |
| --- | --- |
| `PLAN.md` | La lista de tareas a ejecutar |
| `.loop-prompt.md` | El prompt que se envía a OpenCode en cada iteración |
| `AGENTS.md` | Conocimiento persistente para OpenCode entre sesiones |
| `.loop.log` | Registro de depuración, incluida la telemetría `[HEALTH]` del watchdog |
| `.loop-state.json` | Progreso persistido para recuperación ante caídas (`--resume`) |

Todos los archivos `.loop*` se ignoran en git automáticamente.

## Solución de problemas

**"Error: archivo de plan no encontrado"** — crea un `PLAN.md` (o ejecuta `ocloop --create-plan`). Como mínimo:

```markdown
## Backlog
- [ ] Tu primera tarea
```

**"Error: archivo de prompt no encontrado"** — esto solo ocurre con un `--prompt <ruta>` personalizado. Crea ese archivo, u omite `--prompt` y deja que OCLoop cree automáticamente el `.loop-prompt.md` por defecto.

**El servidor no arranca** — asegúrate de que OpenCode esté instalado y en tu `PATH`, que tus claves de API estén configuradas, y revisa los logs de OpenCode.

**El bucle parece atascado** — el guardián detecta un atasco real automáticamente; observa el indicador `Guardián ●` y las líneas `[HEALTH]` en `.loop.log`. Pulsa `T` para abrir OpenCode en una terminal y ver qué pasa. Si la recuperación se agota, el diálogo de error incluye un diagnóstico (antigüedad del último latido, veredicto de las sondas, intentos).

**Recibió un rate limit** — es esperado y se maneja: OCLoop muestra una cuenta atrás `COOLDOWN` y reintenta automáticamente.

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
