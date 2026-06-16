/**
 * Tiny i18n layer (DRY single source of UI strings).
 *
 * English is the source of truth (`en`); `es` is a type-checked mirror — the
 * compiler guarantees every key exists in both. The active locale is resolved
 * once at startup (CLI `--lang` > ocloop.json `language` > "en") and read via
 * `t(key, params?)`. Parameterized strings are functions so interpolation stays
 * in one place per locale.
 *
 * Because the locale is fixed before the UI renders, `t()` is a plain function
 * (no reactivity needed): every component reads the correct locale at render.
 */

import { createSignal } from "solid-js"
import { DEFAULTS } from "./constants"

export type Locale = "en" | "es"

type Params = Record<string, string | number>
type Msg = string | ((p: Params) => string)

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "es"
}

// Locale-identical UI strings — written once here and spread into BOTH `en` and
// `es` below. This single-sources values that never differ by language (acronyms,
// short labels, the rate-limit prefix) while `es: Record<MessageKey, Msg>` still
// makes the compiler flag any missing/typo'd key.
const shared = {
  // Dashboard
  badgeError: "ERROR",
  badgeDebug: "DEBUG",
  lblIter: "Iter",
  lblEta: "ETA",
  guardOk: "OK",
  // Keybind hints (same word in both locales)
  hintTerminal: "terminal",
  hintPrompt: "prompt",
  // Command palette categories
  catTerminal: "Terminal",
  catLoop: "Loop",
  catChaos: "Chaos",
  // Shared titles / dialog labels
  errorTitle: "Error",
  dlgArgsColon: "Args:    ",
  // Activity-log stats header
  logTokens: "Tokens: ",
  logTokenIn: "in:",
  logTokenOut: "out:",
  logTokenRsn: "rsn:",
  logDiff: "Diff: ",
  // Runtime
  actRateLimit: (p: Params) => `Rate limit: ${p.message}`,
} satisfies Record<string, Msg>

const en = {
  ...shared,

  // --- Plan generator (CLI: --create-plan) ---
  cpTitle: "OCLoop — plan generator",
  cpConfig: (p: Params) => `Model: ${p.model}${p.note} · Agent: ${p.agent}`,
  cpModelNote:
    " (not 'provider/model' → opencode's default model will be used)",
  cpAskGoal: "What do you want OCLoop to build? Describe your goal:\n> ",
  cpNoGoal: "No goal provided. Cancelled.",
  cpStartingServer: "Starting the OpenCode server…",
  cpSessionFail: "Could not create the planning session",
  cpGenerating: "Generating plan… (this may take a moment)\n",
  cpTimeout: "Plan generation timed out. Try again or simplify the goal.",
  cpNoContent:
    "The model returned no content. Try again with a different goal.",
  cpProposedTitle: "PROPOSED PLAN",
  cpAskApprove: "\nApprove this plan? [y = save · e = edit · n = cancel]: ",
  cpSaved: (p: Params) => `\n✓ Saved to ${p.path}`,
  cpRunHint: (p: Params) => `Now run 'ocloop'${p.planArg} to start.`,
  cpAskEdit: "What would you like to change or add?\n> ",
  cpNoChanges: "No changes.",
  cpCancelled: "Cancelled. No file was written.",
  cpError: (p: Params) => `\nError generating the plan: ${p.message}`,
  cpPrompt: (p: Params) =>
    [
      "You are a senior technical planner. Generate the contents of a PLAN.md file",
      "for the OCLoop tool, which executes tasks ONE BY ONE from that file, each in",
      "an isolated AI-agent iteration.",
      "",
      "User goal:",
      String(p.goal),
      "",
      "REQUIRED response format:",
      "- Return ONLY the markdown content of PLAN.md — no intro text, explanations,",
      "  or code fences around it.",
      "- First line: a '# ...' title. Then a short objective line.",
      "- Group work under '## Phase N — title' headings.",
      "- Each actionable task on its own line: '- [ ] concrete, verifiable description'.",
      "- One task = a small, atomic step an agent completes in one iteration.",
      "- Use '- [MANUAL] ...' for tasks needing human intervention.",
      "- End with an '## Acceptance criteria' section.",
      "- Do NOT implement anything or use tools; only write the plan.",
      "- Write the plan in English.",
    ].join("\n"),
  cpRefine: (p: Params) =>
    [
      "Revise and improve the following PLAN.md according to the user's feedback.",
      "Keep EXACTLY the same format (markdown only; '## Phase N — title' headings;",
      "'- [ ]' / '- [MANUAL]' tasks; '## Acceptance criteria'). Return ONLY the",
      "updated PLAN.md markdown. Write it in English.",
      "",
      "User feedback:",
      String(p.feedback),
      "",
      "Current PLAN.md:",
      String(p.plan),
    ].join("\n"),

  // --- Pre-flight file errors (CLI, after locale is resolved) ---
  // Checkbox markers ('- [ ]') stay literal — they're language-agnostic.
  errPlanNotFound: (p: Params) =>
    [
      `Error: Plan file not found: ${p.path}`,
      "",
      `OCLoop requires a plan file (default: ${DEFAULTS.PLAN_FILE}).`,
      `Create a ${p.path} file with a task list, for example:`,
      "",
      "  ## Backlog",
      "  - [ ] Task one description",
      "  - [ ] Task two description",
      "",
    ].join("\n"),
  errPromptNotFound: (p: Params) =>
    [
      `Error: Prompt file not found: ${p.path}`,
      "",
      `OCLoop requires a prompt file (default: ${DEFAULTS.PROMPT_FILE}).`,
      "This file contains the prompt sent to opencode for each iteration.",
      "",
      "Create a prompt file with instructions for executing plan tasks.",
      "",
    ].join("\n"),

  // --- Default .loop-prompt.md (auto-created when missing) ---
  // Announced to the user; the body below is written to disk verbatim.
  promptCreated: (p: Params) =>
    `No ${p.path} found in this folder — created a default loop prompt. Edit it to customize what runs each iteration.`,
  // Literal tokens ({{PLAN_FILE}}, [MANUAL], [BLOCKED], commands, paths, tags)
  // are NOT translated: they are substituted/matched downstream, language-agnostic.
  defaultLoopPrompt:
    [
      "You run EXACTLY ONE iteration of this loop, then stop. Do ONE task (or one coupled batch within a single phase), then end your turn. Do NOT continue to the next task in this session - OCLoop re-invokes you in a fresh session for the next task. The only exception is the Completion check, where you exit the whole run.",
      "",
      "Before starting:",
      "1. Run `git status`. A previous iteration may have been interrupted.",
      "   - If uncommitted changes complete a task: verify they pass checks, commit them, and mark the task done.",
      "   - If they are partial: continue that task instead of starting a new one.",
      "2. Read {{PLAN_FILE}} fully. Choose the task ONLY from {{PLAN_FILE}} - do not scan the codebase for `[ ]` (tests, examples, and docs contain false positives).",
      "3. Before any web search or consulting reference repos, check AGENTS.md `## Research` for relevant `@` references and read them.",
      "",
      "Task selection (CRITICAL):",
      "- If no uncompleted, non-[MANUAL], non-[BLOCKED] tasks remain, go straight to the Completion check. Do not invent work.",
      "- Work through phases IN ORDER - finish Phase N before starting Phase N+1.",
      "- Pick the FIRST uncompleted task in the earliest incomplete phase.",
      "- Skip [MANUAL] and [BLOCKED] items.",
      "- NEVER batch across phases - each phase is a commit boundary.",
      "- Within a SINGLE phase, batch tasks ONLY if they are in the same file AND logically coupled.",
      "",
      "Execute:",
      "1. Make the code changes for that one task or coupled batch.",
      "2. Run the project's checks using the exact commands in AGENTS.md `## Project Operations` (e.g. `bun test`). If none are defined and no test files exist, skip this step.",
      "3. Commit ONLY if the checks pass (or there are none).",
      "   - If a check fails and you can fix it this iteration, fix it and re-run.",
      "   - If you cannot fix it this iteration, revert your changes for this task (`git checkout -- .` and delete any new files you added), mark the task `[BLOCKED: <reason>]`, and go to \"After completion\".",
      "   - Never commit failing code. Never use `--no-verify` or bypass hooks.",
      "4. Commit with a descriptive message, following the commit rules in AGENTS.md (one logical change; never `git add .`; respect `.gitignore`). NEVER push.",
      "",
      "After completion:",
      "1. In {{PLAN_FILE}}, mark completed items `[x]`.",
      "2. If you discovered EXTERNAL knowledge (API behavior, library quirks, external repo details), write the detail to `docs/<topic>.md` (create `docs/` if missing) and add a one-line `@docs/...` reference under AGENTS.md `## Research` (matching the format already there). Keep AGENTS.md lean - it loads every session; detail stays in `docs/`.",
      "3. If you learned something about THIS PROJECT by trial and error (build/test commands, gotchas), record it concisely under AGENTS.md `## Project Operations`.",
      "4. If you could not complete a task (permissions, external service, needs human input), add `[BLOCKED: <reason>]` to its line in {{PLAN_FILE}} and do not retry it this iteration.",
      "",
      "Completion check:",
      "- If every non-[MANUAL] task in {{PLAN_FILE}} is `[x]` or `[BLOCKED]`, append to the end of {{PLAN_FILE}}:",
      "  `<plan-complete>SUMMARY_OF_WORK_DONE_AND_REMAINING_MANUAL_TASKS</plan-complete>`",
      "  then exit the session.",
      "- Otherwise, end your turn now - OCLoop starts the next task in a fresh session.",
      "- Do NOT skip automatable tasks: if a task looks hard but doable, attempt it.",
    ].join("\n") + "\n",

  // --- Dashboard: state badges ---
  badgeStarting: "STARTING",
  badgeReady: "READY",
  badgeRunning: "RUNNING",
  badgePausing: "PAUSING",
  badgePaused: "PAUSED",
  badgeCooldown: "COOLDOWN",
  badgeStopping: "STOPPING",
  badgeStopped: "STOPPED",
  badgeComplete: "COMPLETE",
  badgeUnknown: "UNKNOWN",

  // --- Dashboard: labels ---
  lblModel: "Model",
  lblAgent: "Agent",
  lblTasks: "Tasks",
  lblTime: "Time",
  lblAvg: "Avg",
  lblTaskPrefix: "Task: ",
  lblWaiting: "waiting...",
  lblGuard: "Guard",

  // --- Dashboard: keybind hints ---
  hintStart: "start",
  hintPause: "pause",
  hintResume: "resume",
  hintCancel: "cancel",
  hintCommands: "commands",
  hintQuit: "quit",
  hintRetry: "retry",
  hintNewSession: "new session",
  hintSampleActivity: "sample activity",
  hintPausingMsg: "Pausing after current task —",
  hintCooldownMsg: "Rate limited, waiting...",
  hintCompleteMsg: "Press any key to exit",

  // --- Watchdog health labels ---
  guardSuspect: "SUSPECT",
  guardCheck: "CHECK",
  guardStuck: "STUCK",
  guardRecover: "RECOVER",

  // --- Cooldown / dashboard countdown ---
  cooldownText: (p: Params) =>
    `Rate limited — retrying in ${p.secs}s (attempt ${p.attempt})`,

  // --- Runtime / activity log messages ---
  actSessionAborted: "Session aborted by user",
  actSessionError: (p: Params) => `Session error: ${p.message}`,
  actSessionIdle: "Session idle",
  actRateExhausted: (p: Params) =>
    `Persistent rate limit after ${p.attempts} attempts`,
  errRatePersistent: (p: Params) =>
    `Persistent rate limit after ${p.attempts} attempts: ${p.reason}`,
  errIterationStart: (p: Params) => `Failed to start iteration: ${p.message}`,
  errServerStart:
    "OpenCode server failed to start — check the port isn't already in use (try --port) and that opencode is installed, then press R to retry.",
  errUnknown: "Unknown error",
  dlgPlanCompleteFallback: "Plan marked as complete.",
  toastSendPromptFailed: (p: Params) => `Failed to send prompt: ${p.message}`,
  actWake: (p: Params) => `Woke after ${p.secs}s suspended — reconnecting`,
  actReconciled: (p: Params) => `Reconciled: session ${p.result}, advancing`,
  actGuardRestart: "Guardian: server unresponsive, restarting",
  actGuardReconnect: "Guardian: reconnecting SSE",
  actGuardSynthIdle: "Guardian: session idle/missing, advancing",
  actGuardAbort: "Guardian: session wedged, aborting and retrying",
  errGuardExhausted: (p: Params) =>
    `Guardian: recovery exhausted (${p.reason}) after ${p.attempts} attempts; no heartbeat for ${p.secs}s, last status ${p.verdict}`,
  actResuming: (p: Params) => `Resuming session ${p.id} (iter ${p.iteration})`,
  actContinuing: (p: Params) =>
    `Previous session ${p.verdict}; continuing the loop`,

  // --- Command palette ---
  cmdCopyAttach: "Copy attach command",
  cmdChooseTerminal: "Choose default terminal",
  cmdToggleScrollbar: "Toggle scrollbar",
  cmdStart: "Start iterations",
  cmdPause: "Pause loop",
  cmdResume: "Resume loop",
  cmdCancelPause: "Cancel pending pause",
  cmdRestartServer: "Restart OpenCode server",
  cmdQuit: "Quit OCLoop",
  catView: "View",
  catLanguage: "Language",
  toastLanguageChanged: "Language changed",
  toastRestarting: "Restarting OpenCode server…",
  // Chaos fault-injection (debug + --chaos). One label + one "done" per action,
  // so the command title and its toast are single-sourced.
  chaosKill: "Chaos: kill server",
  chaosKillDone: "Chaos: server killed",
  chaosRevive: "Chaos: revive server",
  chaosReviveDone: "Chaos: server revived",
  chaosFreeze: "Chaos: freeze session",
  chaosFreezeDone: "Chaos: session frozen",
  chaosUnfreeze: "Chaos: unfreeze session",
  chaosUnfreezeDone: "Chaos: session unfrozen",
  chaosRateLimit: "Chaos: inject rate limit",
  chaosRateLimitDone: "Chaos: rate limit injected",

  // --- Dialogs ---
  dlgQuitTitle: "Quit OCLoop?",
  dlgQuitMsg: "Are you sure you want to quit?",
  dlgQuitConfirm: "Quit",
  dlgCancel: "Cancel",
  dlgResumeTitle: "Resume previous run?",
  dlgResumeMsg: (p: Params) =>
    `Found an interrupted run at iteration ${p.iteration}. Resume it?`,
  dlgResumeConfirm: "Resume",
  dlgResumeCancel: "Start fresh",
  dlgConfirm: "Confirm",
  dlgRetry: "Retry",
  dlgEscToQuit: "esc to quit",
  dlgNoResults: "No results found",
  dlgSearchPlaceholder: "Search...",
  dlgSendPrompt: "Send Prompt",
  dlgPromptHint: "Enter send · Esc cancel",
  dlgPlanComplete: "Plan Complete",
  dlgCompletedIn: (p: Params) =>
    `Completed in ${p.iterations} iteration${Number(p.iterations) !== 1 ? "s" : ""} (${p.time})`,
  dlgDismiss: "Dismiss",
  dlgInvalidAgent: "Invalid Agent",
  dlgAgentNotFound: (p: Params) => `Agent "${p.agent}" not found.`,
  dlgAvailableAgents: "Available agents:",
  dlgUseDefault: "Use Default",
  dlgTerminalFailed: "Terminal Launch Failed",
  dlgEditConfig: "Edit config: ",
  dlgAttachCommand: "Attach command:",
  dlgCopy: "Copy",
  dlgClose: "Close",
  dlgConfigureTerminal: "Configure Terminal",
  dlgCustomTerminal: "Custom Terminal",
  dlgCommandColon: "Command: ",
  dlgInstalledTerminals: "Installed Terminals",
  dlgCustomEllipsis: "Custom...",
  dlgManualConfig: "Manual Configuration",
  paletteTitle: "Command Palette",
  palettePlaceholder: "Type a command...",
  kbSelect: "Select",
  kbNavigate: "Navigate",
  kbSave: "save",
  kbSwitch: "switch",
  kbBack: "back",
  dlgCmdPlaceholderHelp: "Use {cmd} as placeholder for the attach command",
  toastNoSessionPrompt: "No active session to send prompt",
  toastCopied: "Copied to clipboard",
  toastSampleInserted: "Sample activity inserted",
  toastNoSessionAttach: "No active session to attach to",
  sampleSessionStarted: "Session started",
  sampleUserMessage: "User: Implement feature X",
  sampleAssistantMessage: "Assistant: I'll help with that",
  sampleReasoning: "Analyzing the codebase structure...",
  sampleFileRead: "Reading src/App.tsx",
  sampleFileEdit: "Modified src/components/Button.tsx (+15, -3)",
  sampleTask: "Implementing dark mode toggle",
  sampleError: "Build failed: Type error in Button.tsx",
  sampleSessionIdle: "Session idle - waiting for input",
} satisfies Record<string, Msg>

type MessageKey = keyof typeof en

/** Spanish mirror — the type forces every English key to be present here. */
const es: Record<MessageKey, Msg> = {
  ...shared,
  cpTitle: "OCLoop — generador de planes",
  cpConfig: (p) => `Modelo: ${p.model}${p.note} · Agente: ${p.agent}`,
  cpModelNote:
    " (no es 'provider/model' → se usará el modelo por defecto de opencode)",
  cpAskGoal: "¿Qué quieres que OCLoop construya? Describe tu objetivo:\n> ",
  cpNoGoal: "No se indicó ningún objetivo. Cancelado.",
  cpStartingServer: "Arrancando el servidor OpenCode…",
  cpSessionFail: "No se pudo crear la sesión de planificación",
  cpGenerating: "Generando plan… (esto puede tardar un momento)\n",
  cpTimeout: "La generación del plan superó el tiempo límite. Reintenta o simplifica el objetivo.",
  cpNoContent:
    "El modelo no devolvió contenido. Intenta de nuevo con otro objetivo.",
  cpProposedTitle: "PLAN PROPUESTO",
  cpAskApprove: "\n¿Apruebas el plan? [s = guardar · y = guardar · e = editar · n = cancelar]: ",
  cpSaved: (p) => `\n✓ Guardado en ${p.path}`,
  cpRunHint: (p) => `Ahora ejecuta 'ocloop'${p.planArg} para empezar.`,
  cpAskEdit: "¿Qué quieres cambiar o añadir?\n> ",
  cpNoChanges: "Sin cambios.",
  cpCancelled: "Cancelado. No se guardó ningún archivo.",
  cpError: (p) => `\nError generando el plan: ${p.message}`,
  cpPrompt: (p) =>
    [
      "Eres un planificador técnico senior. Genera el contenido de un archivo PLAN.md",
      "para la herramienta OCLoop, que ejecuta las tareas UNA POR UNA desde ese archivo,",
      "cada una en una iteración aislada de un agente de IA.",
      "",
      "Objetivo del usuario:",
      String(p.goal),
      "",
      "Formato OBLIGATORIO de tu respuesta:",
      "- Devuelve SOLO el contenido markdown del PLAN.md, sin texto introductorio ni",
      "  explicaciones ni fences de código alrededor.",
      "- Primera línea: un título '# ...'. Luego una línea breve con el objetivo.",
      "- Agrupa el trabajo en encabezados '## Fase N — título'.",
      "- Cada tarea accionable en su propia línea: '- [ ] descripción concreta y verificable'.",
      "- Una tarea = un paso pequeño y atómico que un agente complete en una iteración.",
      "- Usa '- [MANUAL] ...' para tareas que requieran intervención humana.",
      "- Termina con una sección '## Criterios de aceptación'.",
      "- NO implementes nada ni uses herramientas; solo redacta el plan.",
      "- Escribe el plan en español.",
    ].join("\n"),
  cpRefine: (p) =>
    [
      "Revisa y mejora el siguiente PLAN.md según el feedback del usuario.",
      "Conserva EXACTAMENTE el mismo formato (solo markdown; encabezados",
      "'## Fase N — título'; tareas '- [ ]' / '- [MANUAL]'; '## Criterios de aceptación').",
      "Devuelve SOLO el markdown del PLAN.md actualizado. Escríbelo en español.",
      "",
      "Feedback del usuario:",
      String(p.feedback),
      "",
      "PLAN.md actual:",
      String(p.plan),
    ].join("\n"),

  errPlanNotFound: (p) =>
    [
      `Error: archivo de plan no encontrado: ${p.path}`,
      "",
      `OCLoop requiere un archivo de plan (por defecto: ${DEFAULTS.PLAN_FILE}).`,
      `Crea un archivo ${p.path} con una lista de tareas, por ejemplo:`,
      "",
      "  ## Backlog",
      "  - [ ] Descripción de la tarea uno",
      "  - [ ] Descripción de la tarea dos",
      "",
    ].join("\n"),
  errPromptNotFound: (p) =>
    [
      `Error: archivo de prompt no encontrado: ${p.path}`,
      "",
      `OCLoop requiere un archivo de prompt (por defecto: ${DEFAULTS.PROMPT_FILE}).`,
      "Este archivo contiene el prompt que se envía a opencode en cada iteración.",
      "",
      "Crea un archivo de prompt con instrucciones para ejecutar las tareas del plan.",
      "",
    ].join("\n"),

  promptCreated: (p) =>
    `No se encontró ${p.path} en esta carpeta — se creó un prompt de loop por defecto. Edítalo para personalizar lo que se ejecuta en cada iteración.`,
  // Los tokens literales ({{PLAN_FILE}}, [MANUAL], [BLOCKED], comandos, rutas,
  // etiquetas) NO se traducen: se sustituyen/buscan aguas abajo, agnósticos al idioma.
  defaultLoopPrompt:
    [
      "Ejecutas EXACTAMENTE UNA iteración de este loop y luego paras. Haz UNA tarea (o un lote acoplado dentro de una sola fase) y termina tu turno. NO continúes a la siguiente tarea en esta sesión - OCLoop te vuelve a invocar en una sesión nueva para la siguiente tarea. La única excepción es la verificación de Finalización, donde sales de toda la ejecución.",
      "",
      "Antes de empezar:",
      "1. Ejecuta `git status`. Una iteración anterior pudo haber sido interrumpida.",
      "   - Si hay cambios sin commitear que completan una tarea: verifica que pasan las comprobaciones, haz commit y marca la tarea como hecha.",
      "   - Si son parciales: continúa esa tarea en lugar de empezar una nueva.",
      "2. Lee {{PLAN_FILE}} por completo. Elige la tarea SOLO de {{PLAN_FILE}} - no escanees el código en busca de `[ ]` (los tests, ejemplos y docs contienen falsos positivos).",
      "3. Antes de cualquier búsqueda web o de consultar repos de referencia, revisa `## Research` en AGENTS.md por referencias `@` relevantes y léelas.",
      "",
      "Selección de tarea (CRÍTICO):",
      "- Si no quedan tareas sin completar, no-[MANUAL] y no-[BLOCKED], ve directo a la verificación de Finalización. No inventes trabajo.",
      "- Avanza por las fases EN ORDEN - termina la Fase N antes de empezar la Fase N+1.",
      "- Elige la PRIMERA tarea sin completar de la fase incompleta más temprana.",
      "- Omite los elementos [MANUAL] y [BLOCKED].",
      "- NUNCA agrupes tareas entre fases - cada fase es un límite de commit.",
      "- Dentro de una MISMA fase, agrupa tareas SOLO si están en el mismo archivo Y lógicamente acopladas.",
      "",
      "Ejecuta:",
      "1. Haz los cambios de código para esa única tarea o lote acoplado.",
      "2. Ejecuta las comprobaciones del proyecto usando los comandos exactos de `## Project Operations` en AGENTS.md (p. ej. `bun test`). Si no hay ninguno definido y no existen archivos de test, omite este paso.",
      "3. Haz commit SOLO si las comprobaciones pasan (o si no hay ninguna).",
      "   - Si una comprobación falla y puedes arreglarla en esta iteración, arréglala y vuelve a ejecutarla.",
      "   - Si no puedes arreglarla en esta iteración, revierte tus cambios de esta tarea (`git checkout -- .` y borra los archivos nuevos que hayas añadido), marca la tarea `[BLOCKED: <reason>]` y ve a \"Después de completar\".",
      "   - Nunca hagas commit de código que falla. Nunca uses `--no-verify` ni evites los hooks.",
      "4. Haz commit con un mensaje descriptivo, siguiendo las reglas de commit de AGENTS.md (un cambio lógico; nunca `git add .`; respeta `.gitignore`). NUNCA hagas push.",
      "",
      "Después de completar:",
      "1. En {{PLAN_FILE}}, marca los elementos completados como `[x]`.",
      "2. Si descubriste conocimiento EXTERNO (comportamiento de una API, peculiaridades de una librería, detalles de un repo externo), escribe el detalle en `docs/<topic>.md` (crea `docs/` si no existe) y añade una referencia `@docs/...` de una línea bajo `## Research` en AGENTS.md (con el mismo formato que ya tiene). Mantén AGENTS.md ligero - se carga en cada sesión; el detalle vive en `docs/`.",
      "3. Si aprendiste algo sobre ESTE PROYECTO por prueba y error (comandos de build/test, gotchas), regístralo de forma concisa bajo `## Project Operations` en AGENTS.md.",
      "4. Si no pudiste completar una tarea (permisos, servicio externo, necesita intervención humana), añade `[BLOCKED: <reason>]` a su línea en {{PLAN_FILE}} y no la reintentes en esta iteración.",
      "",
      "Verificación de Finalización:",
      "- Si cada tarea no-[MANUAL] en {{PLAN_FILE}} está en `[x]` o `[BLOCKED]`, añade al final de {{PLAN_FILE}}:",
      "  `<plan-complete>SUMMARY_OF_WORK_DONE_AND_REMAINING_MANUAL_TASKS</plan-complete>`",
      "  y luego sal de la sesión.",
      "- En caso contrario, termina tu turno ahora - OCLoop inicia la siguiente tarea en una sesión nueva.",
      "- NO omitas tareas automatizables: si una tarea parece difícil pero factible, inténtala.",
    ].join("\n") + "\n",

  badgeStarting: "INICIANDO",
  badgeReady: "LISTO",
  badgeRunning: "EJECUTANDO",
  badgePausing: "PAUSANDO",
  badgePaused: "PAUSADO",
  badgeCooldown: "EN ESPERA",
  badgeStopping: "DETENIENDO",
  badgeStopped: "DETENIDO",
  badgeComplete: "COMPLETO",
  badgeUnknown: "DESCONOCIDO",

  lblModel: "Modelo",
  lblAgent: "Agente",
  lblTasks: "Tareas",
  lblTime: "Tiempo",
  lblAvg: "Prom",
  lblTaskPrefix: "Tarea: ",
  lblWaiting: "esperando...",
  lblGuard: "Guardián",

  hintStart: "iniciar",
  hintPause: "pausar",
  hintResume: "reanudar",
  hintCancel: "cancelar",
  hintCommands: "comandos",
  hintQuit: "salir",
  hintRetry: "reintentar",
  hintNewSession: "nueva sesión",
  hintSampleActivity: "actividad de ejemplo",
  hintPausingMsg: "Pausando tras la tarea actual —",
  hintCooldownMsg: "Rate limit, esperando...",
  hintCompleteMsg: "Pulsa cualquier tecla para salir",

  guardSuspect: "SOSPECHA",
  guardCheck: "VERIF",
  guardStuck: "BLOQUEO",
  guardRecover: "RECUPER",

  cooldownText: (p) =>
    `Rate limited — reintentando en ${p.secs}s (intento ${p.attempt})`,

  actSessionAborted: "Sesión abortada por el usuario",
  actSessionError: (p) => `Error de sesión: ${p.message}`,
  actSessionIdle: "Sesión inactiva",
  actRateExhausted: (p) => `Rate limit persistente tras ${p.attempts} intentos`,
  errRatePersistent: (p) =>
    `Rate limit persistente tras ${p.attempts} intentos: ${p.reason}`,
  errIterationStart: (p) => `Fallo al iniciar la iteración: ${p.message}`,
  errServerStart:
    "El servidor de OpenCode no arrancó — verifica que el puerto no esté en uso (usa --port) y que opencode esté instalado, luego pulsa R para reintentar.",
  errUnknown: "Error desconocido",
  dlgPlanCompleteFallback: "Plan marcado como completado.",
  toastSendPromptFailed: (p) => `Fallo al enviar el prompt: ${p.message}`,
  actWake: (p) => `Despertar tras ${p.secs}s suspendido — reconectando`,
  actReconciled: (p) => `Reconciliado: sesión ${p.result}, avanzando`,
  actGuardRestart: "Guardián: servidor sin respuesta, reiniciando",
  actGuardReconnect: "Guardián: reconectando SSE",
  actGuardSynthIdle: "Guardián: sesión inactiva/ausente, avanzando",
  actGuardAbort: "Guardián: sesión bloqueada, abortando y reintentando",
  errGuardExhausted: (p) =>
    `Guardián: recuperación agotada (${p.reason}) tras ${p.attempts} intentos; sin latido ${p.secs}s, último estado ${p.verdict}`,
  actResuming: (p) => `Reanudando sesión ${p.id} (iter ${p.iteration})`,
  actContinuing: (p) => `Sesión previa ${p.verdict}; continuando el loop`,

  cmdCopyAttach: "Copiar comando de conexión",
  cmdChooseTerminal: "Elegir terminal por defecto",
  cmdToggleScrollbar: "Alternar barra de desplazamiento",
  cmdStart: "Iniciar iteraciones",
  cmdPause: "Pausar el loop",
  cmdResume: "Reanudar el loop",
  cmdCancelPause: "Cancelar la pausa pendiente",
  cmdRestartServer: "Reiniciar el servidor OpenCode",
  cmdQuit: "Salir de OCLoop",
  catView: "Vista",
  catLanguage: "Idioma",
  toastLanguageChanged: "Idioma cambiado",
  toastRestarting: "Reiniciando el servidor OpenCode…",
  chaosKill: "Chaos: matar servidor",
  chaosKillDone: "Chaos: servidor terminado",
  chaosRevive: "Chaos: revivir servidor",
  chaosReviveDone: "Chaos: servidor revivido",
  chaosFreeze: "Chaos: congelar sesión",
  chaosFreezeDone: "Chaos: sesión congelada",
  chaosUnfreeze: "Chaos: descongelar sesión",
  chaosUnfreezeDone: "Chaos: sesión descongelada",
  chaosRateLimit: "Chaos: inyectar rate limit",
  chaosRateLimitDone: "Chaos: rate limit inyectado",

  dlgQuitTitle: "¿Salir de OCLoop?",
  dlgQuitMsg: "¿Seguro que quieres salir?",
  dlgQuitConfirm: "Salir",
  dlgCancel: "Cancelar",
  dlgResumeTitle: "¿Reanudar la ejecución anterior?",
  dlgResumeMsg: (p) =>
    `Se encontró una ejecución interrumpida en la iteración ${p.iteration}. ¿Reanudarla?`,
  dlgResumeConfirm: "Reanudar",
  dlgResumeCancel: "Empezar de cero",
  dlgConfirm: "Confirmar",
  dlgRetry: "Reintentar",
  dlgEscToQuit: "esc para salir",
  dlgNoResults: "Sin resultados",
  dlgSearchPlaceholder: "Buscar...",
  dlgSendPrompt: "Enviar prompt",
  dlgPromptHint: "Enter enviar · Esc cancelar",
  dlgPlanComplete: "Plan completado",
  dlgCompletedIn: (p) =>
    `Completado en ${p.iterations} ${Number(p.iterations) === 1 ? "iteración" : "iteraciones"} (${p.time})`,
  dlgDismiss: "Descartar",
  dlgInvalidAgent: "Agente inválido",
  dlgAgentNotFound: (p) => `Agente "${p.agent}" no encontrado.`,
  dlgAvailableAgents: "Agentes disponibles:",
  dlgUseDefault: "Usar por defecto",
  dlgTerminalFailed: "Fallo al abrir la terminal",
  dlgEditConfig: "Editar config: ",
  dlgAttachCommand: "Comando de conexión:",
  dlgCopy: "Copiar",
  dlgClose: "Cerrar",
  dlgConfigureTerminal: "Configurar terminal",
  dlgCustomTerminal: "Terminal personalizada",
  dlgCommandColon: "Comando: ",
  dlgInstalledTerminals: "Terminales instaladas",
  dlgCustomEllipsis: "Personalizada...",
  dlgManualConfig: "Configuración manual",
  paletteTitle: "Paleta de comandos",
  palettePlaceholder: "Escribe un comando...",
  kbSelect: "Seleccionar",
  kbNavigate: "Navegar",
  kbSave: "guardar",
  kbSwitch: "cambiar",
  kbBack: "atrás",
  dlgCmdPlaceholderHelp: "Usa {cmd} como marcador del comando de conexión",
  toastNoSessionPrompt: "No hay sesión activa para enviar el prompt",
  toastCopied: "Copiado al portapapeles",
  toastSampleInserted: "Actividad de ejemplo insertada",
  toastNoSessionAttach: "No hay sesión activa para conectar",
  sampleSessionStarted: "Sesión iniciada",
  sampleUserMessage: "Usuario: Implementar la funcionalidad X",
  sampleAssistantMessage: "Asistente: Puedo ayudarte con eso",
  sampleReasoning: "Analizando la estructura del código...",
  sampleFileRead: "Leyendo src/App.tsx",
  sampleFileEdit: "Modificado src/components/Button.tsx (+15, -3)",
  sampleTask: "Implementando selector de modo oscuro",
  sampleError: "Falló el build: error de tipos en Button.tsx",
  sampleSessionIdle: "Sesión inactiva: esperando entrada",
}

// Reactive locale: a Solid signal so the TUI re-renders live when the language
// is toggled from the command palette. Reading `t()` inside a component's
// reactive scope tracks this; reading it from plain CLI code just returns the
// current value.
const [localeSignal, setLocaleSignal] = createSignal<Locale>("en")

/** Set the active locale (reactive — switches the whole UI live). */
export function setLocale(locale: Locale): void {
  setLocaleSignal(locale === "es" ? "es" : "en")
}

/** Get the active locale (reactive accessor read). */
export function getLocale(): Locale {
  return localeSignal()
}

/** Translate a key for the active locale, with optional interpolation params. */
export function t(key: MessageKey, params?: Params): string {
  const table = localeSignal() === "es" ? es : en
  const value = table[key] ?? en[key]
  return typeof value === "function" ? value(params ?? {}) : value
}
