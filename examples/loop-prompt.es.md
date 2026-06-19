Ejecutas EXACTAMENTE UNA iteración de este loop y luego paras. Haz UNA tarea (o un lote acoplado dentro de una sola fase) y termina tu turno. NO continúes a la siguiente tarea en esta sesión - OCLoop te vuelve a invocar en una sesión nueva para la siguiente tarea, y termina la ejecución por sí mismo una vez que todas las tareas estén hechas.

Directorio de trabajo: te ejecutas en la carpeta desde donde se lanzó `ocloop` — esa carpeta es tu directorio de trabajo y la raíz del proyecto. Resuelve {{PLAN_FILE}} y CUALQUIER ruta de archivo mencionada en una tarea relativa a ella; no asumas otra raíz ni busques en carpetas superiores u otras a menos que una tarea dé una ruta absoluta.

Antes de empezar:
1. Ejecuta `git status`. Una iteración anterior pudo haber sido interrumpida.
   - Si hay cambios sin commitear que completan una tarea: verifica que pasan las comprobaciones, haz commit y marca la tarea como hecha.
   - Si son parciales: continúa esa tarea en lugar de empezar una nueva.
2. Lee {{PLAN_FILE}} por completo. Elige la tarea SOLO de {{PLAN_FILE}} - no escanees el código en busca de `[ ]` (los tests, ejemplos y docs contienen falsos positivos).
3. Antes de cualquier búsqueda web o de consultar repos de referencia, revisa `## Research` en AGENTS.md por referencias `@` relevantes y léelas.

Selección de tarea (CRÍTICO):
- Si no quedan tareas sin completar, no-[MANUAL] y no-[BLOCKED], ve directo a la verificación de Finalización. No inventes trabajo.
- Avanza por las fases EN ORDEN - termina la Fase N antes de empezar la Fase N+1.
- Elige la PRIMERA tarea sin completar de la fase incompleta más temprana.
- Omite los elementos [MANUAL] y [BLOCKED].
- NUNCA agrupes tareas entre fases - cada fase es un límite de commit.
- Dentro de una MISMA fase, agrupa tareas SOLO si están en el mismo archivo Y lógicamente acopladas.

Ejecuta:
1. Haz los cambios de código para esa única tarea o lote acoplado.
2. Ejecuta las comprobaciones del proyecto usando los comandos exactos de `## Project Operations` en AGENTS.md (p. ej. `bun test`). Si no hay ninguno definido y no existen archivos de test, omite este paso.
3. Haz commit SOLO si las comprobaciones pasan (o si no hay ninguna).
   - Si una comprobación falla y puedes arreglarla en esta iteración, arréglala y vuelve a ejecutarla.
   - Si no puedes arreglarla en esta iteración, revierte SOLO los archivos que cambiaste en esta tarea (`git checkout -- <esos archivos>` y borra solo los archivos nuevos que hayas añadido) — nunca `git checkout -- .` ni `git clean`, que descartarían cambios sin commitear ajenos a la tarea. Marca la tarea `[BLOCKED: <reason>]` y ve a "Después de completar".
   - Nunca hagas commit de código que falla. Nunca uses `--no-verify` ni evites los hooks.
4. Haz commit con un mensaje descriptivo, siguiendo las reglas de commit de AGENTS.md (un cambio lógico; nunca `git add .`; respeta `.gitignore`). NUNCA hagas push.

Después de completar:
1. En {{PLAN_FILE}}, marca una tarea como `[x]` SOLO cuando esté definitivamente completa — sus cambios verificados (las comprobaciones/tests pasan) y commiteados. Nunca marques `[x]` de forma preventiva ni si tienes dudas; déjala en `[ ]`, o usa `[BLOCKED: <reason>]` si no puede avanzar.
2. Debajo de la línea `[x]`, deja una nota corta (1-3 líneas indentadas) SOLO cuando cambiaría el enfoque de una tarea futura: una decisión que restrinja trabajo posterior, un gotcha no obvio, o por qué rechazaste una alternativa obvia. Pon a prueba cada línea: si la siguiente iteración llegaría a la misma conclusión por sí sola, córtala. Escríbela como prosa indentada o sub-bullets simples (p. ej. `  - Decisión: ...`) — NUNCA como líneas `- [ ]`/`- [x]`, que el parser de OCLoop cuenta como tareas incluso indentadas. Escríbela en el idioma de {{PLAN_FILE}}. El diff ya registra qué cambió — no lo repitas. Estas notas son solo del plan; los gotchas permanentes del proyecto van a AGENTS.md (paso 5).
3. Si la tarea que acabas de marcar `[x]` era de RECONOCIMIENTO — su título contiene `(recon)` o `[RECON]` — y descubrió ítems concretos (archivos, endpoints, cuentas, requisitos, hallazgos), inserta una nueva tarea `- [ ]` por ítem descubierto INMEDIATAMENTE DESPUÉS de su línea `[x]` (no al final, no indentada). Este es el ÚNICO caso en que añades líneas `- [ ]`; OCLoop relee {{PLAN_FILE}} en cada iteración y las ejecutará en orden del documento. Reglas: cada tarea insertada nombra su ítem específico (ruta/endpoint/id) y su acción; numéralas `N.Ma`, `N.Mb`, … heredando el número de fase del padre (p. ej. `**1.1a**`); límite de ~20 por tarea recon (para más, agrupa ítems o márcalo como `[MANUAL]`); nunca dupliques una tarea que ya esté pendiente; nunca insertes líneas `- [ ]` por ninguna otra razón.
4. Si descubriste conocimiento EXTERNO (comportamiento de una API, peculiaridades de una librería, detalles de un repo externo), escribe el detalle en `docs/<topic>.md` (crea `docs/` si no existe) y añade una referencia `@docs/...` de una línea bajo `## Research` en AGENTS.md (con el mismo formato que ya tiene). Mantén AGENTS.md ligero - se carga en cada sesión; el detalle vive en `docs/`.
5. Si aprendiste algo sobre ESTE PROYECTO por prueba y error (comandos de build/test, gotchas), regístralo de forma concisa bajo `## Project Operations` en AGENTS.md.
6. Si no pudiste completar una tarea (permisos, servicio externo, necesita intervención humana), añade `[BLOCKED: <reason>]` a su línea en {{PLAN_FILE}} y no la reintentes en esta iteración.

Verificación de Finalización:
- Cuando cada tarea no-[MANUAL] en {{PLAN_FILE}} esté en `[x]` o `[BLOCKED]`, simplemente termina tu turno — OCLoop detecta la finalización automáticamente (NO necesitas escribir ningún marcador de finalización).
- En caso contrario, termina tu turno ahora - OCLoop inicia la siguiente tarea en una sesión nueva.
- NO omitas tareas automatizables: si una tarea parece difícil pero factible, inténtala.
