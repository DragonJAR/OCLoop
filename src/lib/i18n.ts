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

export type Locale = "en" | "es"

type Params = Record<string, string | number>
type Msg = string | ((p: Params) => string)

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "es"
}

const en = {
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
  cpGenFail: (p: Params) =>
    `Failed to generate the plan: ${p.status} ${p.statusText}`,
  cpNoContent:
    "The model returned no content. Try again with a different goal.",
  cpProposedTop: "════════════════════ PROPOSED PLAN ════════════════════",
  cpProposedBottom: "═══════════════════════════════════════════════════════",
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
  badgeError: "ERROR",
  badgeDebug: "DEBUG",
  badgeUnknown: "UNKNOWN",

  // --- Dashboard: labels ---
  lblModel: "Model",
  lblAgent: "Agent",
  lblIter: "Iter",
  lblTasks: "Tasks",
  lblTime: "Time",
  lblAvg: "Avg",
  lblEta: "ETA",
  lblTaskPrefix: "Task: ",
  lblWaiting: "waiting...",
  lblGuard: "Guard",

  // --- Dashboard: keybind hints ---
  hintStart: "start",
  hintTerminal: "terminal",
  hintPause: "pause",
  hintResume: "resume",
  hintCancel: "cancel",
  hintCommands: "commands",
  hintQuit: "quit",
  hintRetry: "retry",
  hintNewSession: "new session",
  hintSampleActivity: "sample activity",
  hintPrompt: "prompt",
  hintPausingMsg: "Pausing after current task —",
  hintCooldownMsg: "Rate limited, waiting...",
  hintCompleteMsg: "Press any key to exit",
  hintWaitingTask: "Waiting for task...",

  // --- Watchdog health labels ---
  guardOk: "OK",
  guardSuspect: "SUSPECT",
  guardCheck: "CHECK",
  guardStuck: "STUCK",
  guardRecover: "RECOVER",

  // --- Cooldown / dashboard countdown ---
  cooldownText: (p: Params) =>
    `Rate limited — retrying in ${p.secs}s (attempt ${p.attempt})`,

  // --- Runtime / activity log messages ---
  actSessionAborted: "Session aborted by user",
  actRateLimit: (p: Params) => `Rate limit: ${p.message}`,
  actSessionError: (p: Params) => `Session error: ${p.message}`,
  actSessionIdle: "Session idle",
  actRateExhausted: (p: Params) =>
    `Persistent rate limit after ${p.attempts} attempts`,
  errRatePersistent: (p: Params) =>
    `Persistent rate limit after ${p.attempts} attempts: ${p.reason}`,
  errIterationStart: (p: Params) => `Failed to start iteration: ${p.message}`,
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
  catTerminal: "Terminal",
  catLoop: "Loop",
  catView: "View",
  catLanguage: "Language",
  toastLanguageChanged: "Language changed",
  toastRestarting: "Restarting OpenCode server…",

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
  dlgErrorTitle: "Error",
  dlgEscToQuit: "esc to quit",
  dlgNoResults: "No results found",
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
  dlgArgsColon: "Args:    ",
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
  toastErrorTitle: "Error",
} satisfies Record<string, Msg>

type MessageKey = keyof typeof en

/** Spanish mirror — the type forces every English key to be present here. */
const es: Record<MessageKey, Msg> = {
  cpTitle: "OCLoop — generador de planes",
  cpConfig: (p) => `Modelo: ${p.model}${p.note} · Agente: ${p.agent}`,
  cpModelNote:
    " (no es 'provider/model' → se usará el modelo por defecto de opencode)",
  cpAskGoal: "¿Qué quieres que OCLoop construya? Describe tu objetivo:\n> ",
  cpNoGoal: "No se indicó ningún objetivo. Cancelado.",
  cpStartingServer: "Arrancando el servidor OpenCode…",
  cpSessionFail: "No se pudo crear la sesión de planificación",
  cpGenerating: "Generando plan… (esto puede tardar un momento)\n",
  cpGenFail: (p) => `Fallo al generar el plan: ${p.status} ${p.statusText}`,
  cpNoContent:
    "El modelo no devolvió contenido. Intenta de nuevo con otro objetivo.",
  cpProposedTop: "════════════════════ PLAN PROPUESTO ════════════════════",
  cpProposedBottom: "═════════════════════════════════════════════════════════",
  cpAskApprove: "\n¿Apruebas el plan? [y = guardar · e = editar · n = cancelar]: ",
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

  badgeStarting: "INICIANDO",
  badgeReady: "LISTO",
  badgeRunning: "EJECUTANDO",
  badgePausing: "PAUSANDO",
  badgePaused: "PAUSADO",
  badgeCooldown: "EN ESPERA",
  badgeStopping: "DETENIENDO",
  badgeStopped: "DETENIDO",
  badgeComplete: "COMPLETO",
  badgeError: "ERROR",
  badgeDebug: "DEBUG",
  badgeUnknown: "DESCONOCIDO",

  lblModel: "Modelo",
  lblAgent: "Agente",
  lblIter: "Iter",
  lblTasks: "Tareas",
  lblTime: "Tiempo",
  lblAvg: "Prom",
  lblEta: "ETA",
  lblTaskPrefix: "Tarea: ",
  lblWaiting: "esperando...",
  lblGuard: "Guardián",

  hintStart: "iniciar",
  hintTerminal: "terminal",
  hintPause: "pausar",
  hintResume: "reanudar",
  hintCancel: "cancelar",
  hintCommands: "comandos",
  hintQuit: "salir",
  hintRetry: "reintentar",
  hintNewSession: "nueva sesión",
  hintSampleActivity: "actividad de ejemplo",
  hintPrompt: "prompt",
  hintPausingMsg: "Pausando tras la tarea actual —",
  hintCooldownMsg: "Rate limit, esperando...",
  hintCompleteMsg: "Pulsa cualquier tecla para salir",
  hintWaitingTask: "Esperando la tarea...",

  guardOk: "OK",
  guardSuspect: "SOSPECHA",
  guardCheck: "VERIF",
  guardStuck: "BLOQUEO",
  guardRecover: "RECUPER",

  cooldownText: (p) =>
    `Rate limited — reintentando en ${p.secs}s (intento ${p.attempt})`,

  actSessionAborted: "Sesión abortada por el usuario",
  actRateLimit: (p) => `Rate limit: ${p.message}`,
  actSessionError: (p) => `Error de sesión: ${p.message}`,
  actSessionIdle: "Sesión inactiva",
  actRateExhausted: (p) => `Rate limit persistente tras ${p.attempts} intentos`,
  errRatePersistent: (p) =>
    `Rate limit persistente tras ${p.attempts} intentos: ${p.reason}`,
  errIterationStart: (p) => `Fallo al iniciar la iteración: ${p.message}`,
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
  catTerminal: "Terminal",
  catLoop: "Loop",
  catView: "Vista",
  catLanguage: "Idioma",
  toastLanguageChanged: "Idioma cambiado",
  toastRestarting: "Reiniciando el servidor OpenCode…",

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
  dlgErrorTitle: "Error",
  dlgEscToQuit: "esc para salir",
  dlgNoResults: "Sin resultados",
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
  dlgArgsColon: "Args:    ",
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
  toastErrorTitle: "Error",
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
