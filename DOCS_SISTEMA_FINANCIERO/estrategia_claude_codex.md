# Estrategia Claude Code + Codex: repartir el trabajo para no agotar el límite semanal

Redactada el 2026-09-20. Aplica al proyecto TECNIFIN (`C:\TECNIFIN`) y al orquestador (`C:\GUTT_SYSTEM`).
Estado: **aprobado y en implementación** (ver sección 9). Actualizado el 2026-09-20 20:50.

## 1. Idea central

- **El repo es la fuente de verdad, no la conversación.** Reglas (`CLAUDE.md`/`AGENTS.md`), decisiones (`docs/adr/`), plan, pruebas y un
  archivo de estado en el repo. Cualquiera de las dos herramientas retoma leyendo eso, sin depender de lo que "recuerde".
- **Claude Code decide y revisa; Codex ejecuta el volumen.** Claude gasta poco en leer y escribir código repetitivo y mucho menos en releer contexto.
- **Unidades de trabajo pequeñas y cerrables** (un archivo de migración, un endpoint, un documento) que terminan siempre en verde.
  Así "termina el proceso al 90 %" significa cerrar la unidad en curso, no abandonar 30 minutos de trabajo a medias.

## 1.1 Situación real del 2026-09-20 (capturas de Jorge, 20:08-20:09)

| Herramienta | Sesión (5 h) | Semanal | Reinicio semanal | Créditos extra |
|---|---|---|---|---|
| **Claude Code** | 75 % usado (reinicia en 4 h 31 min) | **86 % usado** — a 4 puntos del umbral de Reserva | **jueves 24-sep 12:00** | 0 (desactivados) |
| **Codex (ChatGPT)** | 100 % disponible | **0 % disponible (agotado)** | **en ~1 h (≈ 21:09 de hoy)** | 0 (recarga automática desactivada) |

**Lectura de PM:**
- Claude ya está en **Modo Economía** y a punto de **Reserva**. Hasta el jueves 12:00 solo puede orquestar y revisar lo crítico; no se abre trabajo de código nuevo en Claude.
- Codex arranca una semana **nueva** esta noche: es donde debe ir el volumen de la semana 21-24 sep. Ninguna tarea de Codex puede empezar antes de ≈ 21:10 (hoy no hay margen).
- El trabajo de hoy ya está **adelantado al plan**: DAT-01 y DAT-02 (previstos para el 16-oct) están construidos y verificados; H1 (30-oct) depende ahora de revisiones y actas, no de escribir código.
- **Riesgo:** los dos límites están casi agotados a la vez. La semana siguiente al jueves debe planificarse con presupuesto explícito (sección 3): Claude ≈ 14 % restante hasta el jueves.

## 2. Qué límite es cuál (hoy mezclamos dos)

| Límite | Qué pasó / dónde se ve | Qué hacer |
|---|---|---|
| **De sesión (ventana de ~5 h)** | Hoy el agente de DAT-02 murió con «session limit · resets 7:40pm» y dejó 12 archivos a medias | Puntos de control (sección 6) y reanudar tras el reinicio; no obliga a cambiar de herramienta |
| **Semanal** | `/usage` en Claude Code; el reinicio lo indica la propia pantalla | Es el que gobierna los modos de la sección 3 |

**Limitación que hay que decir clara:** yo no puedo leer tu porcentaje de uso desde mis herramientas. El disparador del 90 % es **manual**:
lo miras con `/usage` (al empezar el día y después de cada tarea grande) y me escribes «modo reserva». Yo dejo el modo escrito en
`docs/handoff/ESTADO.md` para que Codex también lo vea. (Si tu versión de la línea de estado de Claude Code muestra el porcentaje, se puede
poner ahí para no tener que abrir `/usage`; hay que comprobarlo antes de prometerlo.)

## 3. Modos según el consumo semanal de Claude

| Modo | Uso semanal de Claude | Claude hace | Codex hace |
|---|---|---|---|
| **Normal** | 0–60 % | Decisiones de arquitectura (ADR), los primeros endpoints de cada módulo (el patrón), revisión de cierre, tablero, correo | Volumen: repetir patrones, migraciones, semillas, pruebas, documentación, primera pasada de revisión |
| **Economía** | 60–90 % | Solo orquesta: escribe el encargo, lanza Codex, lee el resumen y decide. Nada de escribir código salvo revisión de puntos críticos (aislamiento, dinero) | Todo el desarrollo, incluido el patrón de módulos nuevos |
| **Reserva** | ≥ 90 % | Cierra la unidad en curso, escribe el traspaso y **para**. Después solo: leer el resumen de Codex (breve), decidir el siguiente encargo, hablar contigo | Todo lo demás, con el `docs/handoff/COLA.md` como lista de trabajo |
| **Emergencia** | ≥ 97 % | Nada de trabajo nuevo. Solo responder preguntas cortas y dejar el estado escrito | Continúa por su cuenta |

**Espejo para Codex:** con el mismo esquema (umbral 90 %), si es Codex quien se acerca al límite, Claude vuelve a Modo Normal o Economía y toma
la cola. Por eso el estado vive en el repo y no en la cabeza de ninguna herramienta.

## 4. Reparto del trabajo (dónde va cada cosa)

| Tarea | Va a | Por qué |
|---|---|---|
| ADR y decisiones que tocan aislamiento, seguridad o respaldo | Claude (Opus) | Ambigüedad de negocio y riesgo; la revisión de Christian sigue siendo obligatoria |
| Patrón del primer endpoint de cada módulo | Claude en Normal; Codex en Economía | Se escribe una vez y se reutiliza |
| Repetir el patrón en el resto de endpoints; migraciones DAT-0x; semillas; demo | **Codex** | Volumen, mecánico, con pruebas |
| Pruebas nuevas, fixtures, correcciones de CI | **Codex** | Mecánico |
| Actualizar `docs/`, manuales, ADR ya decididos | **Codex** | Texto derivado del código |
| Revisión de código | **Codex** primera pasada; **Claude** solo en dinero, cartera, aislamiento | Revisión cruzada: el que escribió no revisa lo suyo |
| Tablero de avances (artifact), correo, Drive, calendario | **Claude** | Solo Claude tiene esas herramientas |
| Memoria del proyecto (engram) | **Claude** | Idem |
| Commits | Cada herramienta commitea lo suyo en local; **el push lo haces tú** (GitHub falla desde esta red y el permiso de publicación no se delega) | |

## 4.1 Modelos por rol (catálogo real de tu Codex, consultado con `codex debug models` el 2026-09-20)

Tu Codex trae estos modelos (niveles de razonamiento: `low / medium / high / xhigh / max`, y `ultra` en los tres primeros):

| Modelo | Lo que dice el catálogo | Uso en este proyecto |
|---|---|---|
| **GPT-6-Astra** (`gpt-6-astra`) | «El más capaz, para trabajo complejo y exigente» | **Arquitecto:** patrón de cada módulo, borradores de ADR, revisión de cierre de lo crítico (aislamiento/RLS, dinero, cartera, contabilidad) |
| **GPT-5.6-Sol** (`gpt-5.6-sol`) | «Último modelo agéntico de código de frontera» | **Ejecutor de módulos complejos:** créditos, cartera SEPS, contabilidad, solvencia; correcciones difíciles |
| **GPT-5.6-Terra** (`gpt-5.6-terra`) | «Equilibrado, para el trabajo diario» | **Ejecutor estándar:** repetir el patrón en endpoints, migraciones DAT-0x, integración de módulos |
| **GPT-5.6-Luna** (`gpt-5.6-luna`) | «Rápido y económico» | **Mecánico:** pruebas y fixtures, semillas, documentación derivada, arreglos de CI, `npm run estado`, formateo |
| GPT-5.5 | «Generación anterior probada» | No se usa (queda de respaldo si un modelo nuevo falla) |
| `gpt-reserve`, `codex-auto-review` | Ocultos en el catálogo | No se eligen a mano: `codex-auto-review` es interno de aprobaciones |

**Asignación (nivel de razonamiento por tarea):**

| Proceso | Modelo | Razonamiento | Por qué |
|---|---|---|---|
| ADR y decisiones (borrador) | Astra | `high` (`xhigh` en aislamiento/seguridad) | Ambigüedad y riesgo; la aprobación sigue siendo de Christian y por acta |
| Primer endpoint de un módulo (patrón) | Astra | `high` | Se decide una vez y lo copian todos |
| Módulos de dinero: créditos, cartera, contabilidad | Sol | `high` | Errores de centavos y de clasificación cuestan caro |
| Endpoints del resto, migraciones DAT-0x | Terra | `medium` | Volumen con patrón ya fijado |
| Pruebas, fixtures, semillas, demo, docs, CI | Luna | `medium` | Mecánico; el mejor costo por unidad |
| Revisión cruzada de lo que escribió Claude | Sol | `high` | Segunda mirada distinta a la que escribió |
| Revisión de lo crítico escrito por Codex | **Claude (Opus)**, no Codex | — | El que escribió no revisa lo suyo |
| `codex review` de rutina (diff antes del commit) | Terra | `medium` | Barato y sistemático |

**Reglas de uso:**
1. **Escalar solo si falla:** se empieza en el modelo más barato que dé abasto (Luna → Terra → Sol → Astra). Un modelo más caro entra cuando el más barato falla dos veces o la tarea está en la lista de «crítico».
2. **Razonamiento `low` por defecto** para tareas de lectura y resumen (tu configuración actual ya usa `low` con Astra); subirlo a `high`/`xhigh` solo en la tabla de arriba. `max` y `ultra` quedan reservados para un problema concreto que se atasca, con tu aprobación.
3. **Sin adivinar el costo:** el catálogo no publica cuánto del límite gasta cada modelo. En el ensayo (sección 9, paso 6) se **mide** por unidad (tiempo y uso antes/después) y se ajusta esta tabla con datos.
4. **Tu `service_tier = "fast"`** figura en la configuración de Codex. Antes de la semana de trabajo hay que comprobar si ese nivel consume el límite más rápido; si es así, se desactiva para los encargos largos.
5. **Perfiles de Codex** (`~/.codex/<nombre>.config.toml`, se usan con `-p`): `arquitecto`, `ejecutor`, `ejecutor-dinero`, `mecanico` y `revision`, cada uno con su modelo y razonamiento, para que el encargo diga solo `-p ejecutor`. Son configuración de tu usuario, no del repo: **se crean con tu aprobación** (paso 4 de la sección 9).

**Espejo del lado de Claude Code** (para tener ambos listos): Opus para decidir y revisar lo crítico; Sonnet para trabajo mecánico que Claude aún deba hacer; Haiku solo para comprobaciones triviales.

**Estándar de la empresa:** esta matriz y los perfiles no son solo de TECNIFIN. Quedan en este documento como referencia para cualquier proyecto nuevo que crees con la skill `tecnifin-nuevo-proyecto`; solo cambian los nombres de repo y de reglas.

## 5. Cómo orquesta Claude a Codex (verificado en tu equipo)

Codex CLI `0.154.0`, sesión iniciada con ChatGPT. Tiene `codex exec` (no interactivo). Opciones útiles: `-C <dir>` (carpeta de trabajo),
`-s workspace-write` (solo escribe en esa carpeta), `-o <archivo>` (guarda **solo el último mensaje**, que es lo único que Claude lee),
`--json`, `--worktree`, `--add-dir`, y los subcomandos `resume`, `fork` y `review`.

Encargo estándar que lanza Claude (una línea; el detalle está en un archivo, no en el prompt):

```
codex exec -p ejecutor -C C:\TECNIFIN -s workspace-write -o var\codex\<tarea>.md "Lee AGENTS.md y docs/handoff/ESTADO.md. Ejecuta el encargo de docs/handoff/encargos/<tarea>.md. Cierra con npm run verificar. Escribe el informe de máx. 25 líneas."
```

- **Elegir modelo:** `-p <perfil>` (sección 4.1) o, sin perfil, `-m gpt-5.6-terra -c model_reasoning_effort="medium"`.
- **El encargo** (`docs/handoff/encargos/<tarea>.md`): objetivo, archivos a leer, criterio de aceptación (qué comando debe dar verde), qué NO tocar, y la unidad de cierre. ≤ 40 líneas.
- **Lo que Claude lee de vuelta:** el informe de ≤ 25 líneas y `npm run estado` (sección 7). **No** relee los archivos que Codex escribió salvo puntos críticos.
- **Aislamiento:** para trabajo largo, `--worktree` o una rama `wip/<tarea>`, de modo que un corte no deje la copia principal a medias.
- Un smoke test (sección 9, paso 1) antes de depender de esto. Ojo: el sistema de permisos de Claude Code puede bloquear el lanzamiento de otro agente con escritura;
  si lo hace, no se esquiva: lo lanzas tú con `!`.

## 6. Traspaso y puntos de control

**Archivos (en `C:\TECNIFIN\docs\handoff\`, versionados):**
- `ESTADO.md`: modo actual, fase, último commit verde, qué está hecho, qué está en curso, comando de verificación.
- `COLA.md`: siguientes unidades de trabajo, en orden, cada una con su encargo.
- `PENDIENTES_USUARIO.md`: preguntas para Jorge/Christian y decisiones abiertas. **Ninguna herramienta decide lo que está aquí.**

**Al llegar a 90 % (Claude):**
1. No lanzar agentes nuevos. Terminar la unidad en curso y llevarla a verde (`npm run verificar`).
2. Commit local con lo que esté verde; lo incompleto va a una rama `wip/...` o se descarta con nota.
3. Actualizar `ESTADO.md` y `COLA.md`; escribir el próximo encargo.
4. Pasar el modo a **Reserva** y avisarte con el comando exacto para retomar con Codex.

**Puntos de control (evitan repetir lo de hoy):** todo encargo largo se parte en unidades; al cerrar cada una: prueba en verde, commit en rama `wip/`, línea en `ESTADO.md`.
Regla: ninguna tarea de un agente debe necesitar más de una ventana de sesión sin un punto de control intermedio.

## 7. Ahorro de tokens en Claude (reglas concretas)

1. **Nada de leer archivos grandes.** `server.js` (~6.400 líneas), `TellerView.tsx` y el artifact del tablero (~2.500 líneas) se delegan o se consultan con `Grep`.
2. **`npm run estado`** (a crear): imprime en ≤ 20 líneas los últimos commits, migraciones pendientes, resultado de las pruebas y el modo. Es lo que Claude lee, no los archivos.
3. **Encargos cortos que apuntan a archivos;** informes cortos de vuelta (≤ 25 líneas). Los resultados largos van a `var/`, no al chat.
4. **Modelos proporcionales:** Opus solo para decidir; Sonnet o Codex para lo mecánico. Nada de agentes Opus para copiar patrones.
5. **El tablero se republica una vez por semana** (cuesta leer ~2.500 líneas). Entre semana solo se marca estado en la base, que no cuesta casi nada.
6. **Sin capturas de pantalla** salvo que las pidas; verificar con texto o con pruebas.
7. **Un agente a la vez** sobre el mismo repo; en paralelo solo trabajos que no tocan los mismos archivos.
8. **No re-derivar:** decisiones ya tomadas se leen de `docs/adr/` y del plan; no se vuelven a discutir en el chat.

## 8. Garantías que exigen las dos herramientas (para que Codex no rompa las reglas)

- **`AGENTS.md` autosuficiente:** reglas, comandos, qué no tocar, dónde está el estado. Hoy solo apunta a `CLAUDE.md`; se ampliará.
- **Las reglas que se pueden comprobar con código, se comprueban con código** (`tests/higiene.test.mjs`, regla 11 incluida): protegen igual con cualquier herramienta.
- **Un solo texto por rol:** `docs/roles/arquitecto.md` y `ejecutor.md` en TECNIFIN; los agentes de Claude (`.claude/agents/`) y de Codex (`.codex/agents/*.toml`) son envoltorios de una línea que apuntan a esos archivos. No hay dos versiones que se desincronicen.
- **Sandbox y permisos:** Codex con `workspace-write` solo en `C:\TECNIFIN`; `C:\GUTT_SYSTEM` de solo lectura; sin secretos en prompts ni en archivos; sin push; cualquier acción hacia afuera (correo, GitHub, contratar) la confirmas tú.
- **Revisión cruzada** en lo crítico: lo que escribe una herramienta lo revisa la otra (RLS, dinero, migraciones que tocan cartera o contabilidad).

## 9. Implementación (orden y quién)

| # | Paso | Quién | Cuándo |
|---|---|---|---|
| 1 | Smoke test: Claude lanza `codex exec` con una tarea de solo lectura y otra de escritura trivial en `var/`; se comprueba el informe y el permiso | Claude | Ahora |
| 2 | Terminar DAT-02 (agente ya en curso) y verificarlo. **No abrir un segundo frente en TECNIFIN mientras tanto** | Agente + Claude | Hoy |
| 3 | Crear `docs/handoff/` (ESTADO, COLA, PENDIENTES_USUARIO, `encargos/`) y `npm run estado` / `npm run verificar` | Claude | **Hecho 20-sep** (commit `05c8e8e`) |
| 4 | `docs/roles/{arquitecto,ejecutor,revisor,mecanico}.md` + envoltorios `.claude/agents` y `.codex/agents/*.toml`; `AGENTS.md` ampliado | Claude | **Hecho 20-sep** |
| 4b | Cinco perfiles de Codex en `~/.codex/` (`arquitecto` Astra/high, `ejecutor` Terra/medium, `ejecutor-dinero` Sol/high, `mecanico` Luna/medium, `revision` Astra/xhigh). Falta comprobar el efecto de `service_tier = "fast"` | Claude, aprobado por Jorge | **Hecho 20-sep** (falta lo de `fast`) |
| 5 | Wrapper `tools/codex-delegar.mjs` en GUTT_SYSTEM (`--smoke` y `--perfil/--encargo`) | Claude | **Hecho 20-sep**; prueba real programada para ≈ 21:14 (Codex reinicia ≈ 21:09) |
| 6 | Ensayo real: una unidad pequeña (p. ej. la siguiente migración o un documento) hecha 100 % por Codex en Modo Economía y revisada por Claude; **medir el uso por modelo** y ajustar la tabla 4.1 | Codex + Claude | Semana del 21-sep |
| 7 | Regla de arranque de cada día: `/usage` → modo en `ESTADO.md` | Tú | Diario |

**Criterio de aceptación:** un traspaso "en frío": abrir Codex sin contexto, decirle «continúa», y que retome desde `ESTADO.md`/`COLA.md` hasta dejar `npm run verificar` en verde, sin que Claude explique nada.

## 10. Riesgos y lo que no se puede garantizar

- **No puedo medir tu uso.** El 90 % lo detectas tú; si se te pasa, el corte llega igual (como hoy). Mitigación: unidades pequeñas y puntos de control.
- **Codex también tiene límites** (ya cortó una sesión anterior por `usage_limit_exceeded`). El plan es simétrico, pero eso reduce el margen; conviene saber tu límite real de Codex.
- **Calidad desigual:** cada modelo redacta de forma distinta. Lo protege la batería de pruebas y las reglas comprobables, no la buena voluntad.
- **Permisos:** un lanzamiento cruzado puede ser bloqueado por el clasificador de Claude Code; entonces lo ejecutas tú.
- **Doble edición:** dos herramientas en el mismo repo a la vez se pisan; el plan lo evita con un frente por repo y ramas `wip/`.
- **Costo oculto de orquestar:** cada llamada de Claude a Codex gasta algo (encargo + lectura del informe). Se compensa con encargos grandes y bien acotados, no con muchos pequeños.

## 11. Decisiones confirmadas por Jorge (2026-09-20)

1. **Umbrales 60 / 90 / 97 %:** aprobados.
2. **Claude ejecuta los comandos de Codex él mismo** (`codex exec` con escritura acotada a `C:TECNIFIN`): aprobado. Si el sistema de permisos lo bloquea, se informa; no se esquiva.
3. **Perfiles y agentes de Codex:** aprobados y creados el mismo día (sección 9, pasos 3-5).
4. **Alcance de la empresa:** TECNIFIN S.A.S. es una empresa de desarrollo de software, **no solo del sistema financiero**. Consecuencias:
   - Reglas, roles, traspaso y matriz de modelos son **estándares de empresa**, escritos sin nada específico de un producto.
   - El producto actual (plataforma financiera) es solo el primer proyecto; `tecnifin-nuevo-proyecto` crea los siguientes con las mismas reglas.
   - **Pendiente de decisión de Jorge:** cuando aparezca el segundo producto, mover los estándares a un repositorio propio de la empresa (p. ej. `tecnifin-estandares`) y dejar el repo actual con nombre de producto. Hoy se mantienen en `C:TECNIFIN` y en este orquestador para no crear estructura antes de necesitarla.
5. **Reinicio semanal:** Claude jueves 12:00; Codex ≈ 21:09 de hoy (ver 1.1).

