# Plan de proyecto TECNIFIN S.A.S.: proyecto nuevo, modelo multi-tenant en PostgreSQL primero, migración después

## Contexto

La reunión del 19-sep-2026 fijó el marco del contrato interno de socios (obligaciones desde el **1-oct-2026**)
y el chat de socios definió el nombre: **TECNIFIN S.A.S. principal, GUTT COMPANY S.A.S. alterna**.

GUTT_SYSTEM nació como el proyecto de un solo cliente y creció a base de parches; hoy el rediseño
multi-tenant es una segunda vida montada sobre la primera (dos backends, 16 pruebas inválidas, `server.js`
de 6.356 líneas 100 % en SQL Server). Por eso el trabajo nuevo **no se hace dentro de GUTT_SYSTEM**: se
crea un **proyecto nuevo, TECNIFIN**, limpio desde el primer commit, y **GUTT_SYSTEM lo orquesta** (plan,
agentes, skills, tablero y conocimiento del sistema viejo) sin repetir los errores de origen.

**Objetivo:** dar inicio real al desarrollo. Primer entregable (**H1**): el **modelo de base de datos
multi-tenant en PostgreSQL**, aceptado por acta el **30-oct-2026**. La migración de datos reales viene
después (Fase 3, marzo). El tablero deja de girar alrededor del contrato y muestra desarrollo y dinero.

## Decisiones ya tomadas (no reabrir)

- **Proyecto nuevo `TECNIFIN`** (carpeta `C:\TECNIFIN`, repo Git propio, privado). Contiene la plataforma
  nueva: base PostgreSQL, backend multi-tenant y, más adelante, el frontend. **GUTT_SYSTEM** queda como
  sistema vigente (demo, COAC 20 de Febrero), como **fuente de conocimiento** del legado y como **orquestador**.
- Nombre: TECNIFIN principal + GUTT COMPANY alterna. Todo lo nuevo nace con identificadores TECNIFIN:
  base `tecnifin_dev` / `tecnifin`, roles `tecnifin_admin` / `tecnifin_app`, variables `TECNIFIN_PG_*`.
  Lo legado (`SQLGUTPATATE`, `server.js`, servicio `GuttSystemBackend`) no se toca.
- H1 meta **30-oct-2026** · dominio **tecnifin.com** (tope conjunto dominio + hosting USD 150) ·
  tablero: **reordenar el actual** (misma URL), portable para moverlo al subdominio.
- PostgreSQL adopta el esquema **renombrado** de `db/gutt_system/01-22` con `CooperativaId` (decisión del 15-sep).

## 0. Fase 0 — Crear el proyecto TECNIFIN sin repetir los errores de GUTT_SYSTEM

### 0.1 Errores de origen → regla que los impide

Deducidos de `CLAUDE.md`, la memoria y el historial de GUTT_SYSTEM (si falta alguno, se agrega aquí):

| # | Error en GUTT_SYSTEM (evidencia) | Regla en TECNIFIN desde el primer commit |
|---|---|---|
| 1 | Nació mono-cooperativa, sin `CooperativaId`; el primer commit es «Caja de Ahorro Patate» | Multi-tenant desde el día 1: `CooperativaId NOT NULL` + Row Level Security + `withTenant()`; prueba de aislamiento entre dos cooperativas obligatoria en CI |
| 2 | Dos backends con puertos y bases distintas (`server.js` 5005 / `server.gutt_system.js` 5006) que se confunden | **Un** backend, **una** base activa por entorno; prohibidos `server.x.js` paralelos |
| 3 | Migraciones commiteadas y no aplicadas (`20_ice_seps.sql` dejó caída la aprobación de créditos; hoy la 34 sigue pendiente) | Todo el DDL solo por `tools/migrate.mjs` con SHA-256; **CI falla si hay pendientes o alteradas**; sin scripts sueltos (`migrate-db.js`, `local-setup-db.js`) |
| 4 | Monolitos: `server.js` 6.356 líneas, `TellerView.tsx` ~3.500 (≈70 k tokens cada uno) | Un módulo por dominio (`routes` + `service` + `queries`), tope ≈ 500 líneas por archivo, revisado en cada cierre de módulo |
| 5 | Reglas regulatorias mapeadas por nombre de cuenta (morosidad 0 % con cartera 100 % en mora) y bandas SEPS hardcodeadas | Datos regulatorios **paramétricos** en tablas (bandas, ponderaciones); cuentas por **prefijo numérico**, sin puntos |
| 6 | 4 pruebas rojas «crónicas» por una razón obsoleta taparon un bug real | Pruebas desde el commit uno, con JWT; **suite roja = no se fusiona**; ninguna prueba se deja fallando |
| 7 | Secretos regados (`.env.demo`, `api/.env.gutt_system`); `CLAUDE.md` ya tuvo que advertir «cero contraseñas» | `.env` fuera de Git, solo `.env.example`; un único prefijo `TECNIFIN_*`; cero credenciales en scripts y docs |
| 8 | Raíz desordenada: `test-*.js`, `*.log`, `scratch/`, `backups/`, dos carpetas de `uploads` | `.gitignore` estricto; logs, respaldos y cargas viven fuera del repo (`var/`); ningún archivo suelto en la raíz |
| 9 | Marca dispersa (≈ 200 menciones de «GUTT» en 61 archivos) y el rebrand fue caro | Nombre visible como **dato** (tabla de parámetros de la plataforma), una sola constante de respaldo |
| 10 | Operación al final: servicio, respaldo y `preflight` se cerraron el 7-sep, tras todo el desarrollo | `deploy/` (servicio, respaldo, preflight, runbook) se crea en Fase 0 y se prueba en cada fase |
| 11 | Datos reales y de demo en la misma base (hubo que ocultar filas para grabar el video) | Datos sintéticos en una base aparte; datos reales solo por migración controlada (MIG-01) |
| 12 | Trampas de Windows aprendidas tarde (`.ps1` en ASCII, `Start-Process` con redirección, `Get-ScheduledTask` sin elevar) | Se documentan en el `CLAUDE.md` de TECNIFIN desde el inicio |
| 13 | El plan vivía en la memoria, el tablero y los documentos a la vez | Un solo plan: el orquestador en GUTT_SYSTEM y el tablero; los agentes lo leen, no lo re-derivan |
| 14 | Los repos hermanos despliegan solos al hacer push a `main` | En TECNIFIN el CI **solo prueba**; el despliegue es manual con `preflight` |

### 0.2 Estructura del repo nuevo

Modelo probado en `C:\GUTT_ECOMMERCE` (`.claude/`, `.github/`, `docs/`, `.env.example`), aplicando las reglas anteriores:

```
C:\TECNIFIN\
  CLAUDE.md  AGENTS.md  README.md  .env.example  .gitignore  package.json
  db\migrations\NNNN_*.sql   db\seeds\   (plan de cuentas SEPS, ponderaciones)
  src\platform\  (pool, withTenant, auth/JWT, auditoría, config por tenant)
  src\modules\<dominio>\     (socios, cuentas, caja, creditos, dpf, contabilidad, cartera, reportes)
  tests\  tests\fixtures\    (dos cooperativas)
  tools\  (migrate.mjs, db.mjs solo lectura, token.mjs, paridad.mjs)
  deploy\ (install-service.ps1, backup-db.ps1, preflight.ps1)
  docs\adr\   docs\DESPLIEGUE.md
  .github\workflows\ci.yml   (pruebas + migraciones al día; sin despliegue)
```

### 0.3 Cómo lo orquesta GUTT_SYSTEM

| Vive en GUTT_SYSTEM (orquestador y fuente del legado) | Vive en TECNIFIN (producto) |
|---|---|
| Este plan, el tablero, la memoria y los agentes/skills (sección 1.1) | Código, migraciones, pruebas, ADR, `deploy/` |
| El conocimiento del sistema viejo: `server.js`, `db/gutt_system/01-22`, mapa de nombres, trampas de `CLAUDE.md` | Su propio `CLAUDE.md` corto con las reglas 1-14, comandos y trampas de Windows |
| El SQL Server de origen de la migración | La base `tecnifin`/`tecnifin_dev` |

Mecánica: la sesión de GUTT_SYSTEM agrega `C:\TECNIFIN` a `additionalDirectories` en `.claude/settings.json`;
cada agente recibe la ruta absoluta y crea su propio `git worktree` sobre TECNIFIN (el `isolation: worktree`
nativo aísla GUTT_SYSTEM, no TECNIFIN). **Riesgo a verificar antes de depender de ello:** que un agente
lanzado desde GUTT_SYSTEM pueda leer y escribir en `C:\TECNIFIN` (archivo de humo en el paso 0.4).

### 0.4 Pasos de Fase 0 (pre-arranque, 21-30 sep)

1. Crear `C:\TECNIFIN`, `git init` y el esqueleto de 0.2. **Crear el repo remoto en GitHub solo con tu confirmación.**
2. Escribir `CLAUDE.md` y `AGENTS.md` de TECNIFIN (reglas 1-14) y `.gitignore`/`.env.example`.
3. **Copiar y renombrar** lo reutilizable de GUTT_SYSTEM (no reescribir): `services/postgres.js` → `src/platform/`,
   `tools/migrate-postgres.mjs` → `tools/migrate.mjs`, `tools/init-postgres.mjs`; prefijo `GUTT_PG_*` → `TECNIFIN_PG_*`
   y sus 9 pruebas unitarias. `gutt_system_dev` y `db/postgres/001-005` quedan como legado, sin borrar hasta aceptar H1.
4. Crear la base `tecnifin_dev` y los roles; correr las 9 pruebas contra ella.
5. Agregar `C:\TECNIFIN` a `additionalDirectories` de GUTT_SYSTEM y probar el archivo de humo desde un agente.
6. CI mínimo (`ci.yml`): pruebas + «sin migraciones pendientes».
7. Línea base de GUTT_SYSTEM: `npm test` (55) y `node tools/migrate.mjs` (2 pendientes; aplicar solo la 34, nunca `--aplicar`).

## 1. Calendario (arranque 1-oct-2026, 10 meses)

Se re-basan las fechas de fase: el tablero contaba desde el 14-sep, el contrato desde el 1-oct.

| Fase | Contrato | Nueva ventana | Cierre |
|---|---|---|---|
| 0 Pre-arranque | — | 21-sep → 30-sep | proyecto TECNIFIN creado, dominio + hosting contratados, línea base |
| 1 Arquitectura y núcleo multi-tenant | 2 m | oct → nov | **H1 30-oct** · núcleo APP-01 30-nov |
| 2 Adaptación de módulos | 3 m | dic → feb | 28-feb-2027 |
| 3 Migración e integración | 1 m | mar | 31-mar (MIG-01, datos reales) |
| 4 Infraestructura | 1 m | abr | 30-abr (servidor: gestión desde enero) |
| 5 Hardening y continuidad | 1 m | may | 31-may |
| 6 Documentación y capacitación | 1 m | jun | 30-jun |
| 7 Producción y entrega | 1 m | jul | 31-jul-2027 |

### H1 · Modelo de BD multi-tenant en PostgreSQL (1 → 30-oct), todo en `C:\TECNIFIN`

| Semana | Trabajo | Entregable |
|---|---|---|
| 1-9 oct | **ADR-001** identificación de tenant · **ADR-002** aislamiento (una base, un esquema, `CooperativaId` + Row Level Security; alternativas: esquema o base por cooperativa) · **ADR-003** modelo y nomenclatura (roles/esquemas con prefijo TECNIFIN; tipos: `numeric(18,2)` para dinero, `timestamptz`, collation insensible a mayúsculas) · borrador ARQ-01. En `docs/adr/` | ARQ-01 y ARQ-02 en borrador; **revisión expresa de Christian** (cl. 6.3, sin aprobación por silencio) |
| 12-16 oct | DDL en `db/migrations/` desde `db/gutt_system/01-09` + fixes 10-22, con SHA-256 | DAT-01 |
| 19-23 oct | Catálogos (Plan de Cuentas SEPS 1401-1428, ponderaciones, parámetros regulatorios) en `db/seeds/`; prueba de aislamiento entre cooperativas (portar `11_prueba_aislamiento_multicooperativa.sql`); prueba de partida doble | pruebas en verde |
| 26-30 oct | Fábrica de datos de dos cooperativas; revisión de cierre; **acta de aceptación H1** | ARQ-01 + ARQ-02 + DAT-01 aceptados |

Después de H1: núcleo APP-01 (tenant, IAM, auditoría, configuración por tenant) hasta el 30-nov. Módulos (rangos
propuestos, a confirmar tras H1): M1 socios y cuentas 16-nov→11-dic · M2 caja + M3 créditos + M4 DPF en paralelo
14-dic→29-ene · M5 contabilidad + M6 cartera 1→19-feb · M7 reportes SEPS 22→28-feb.

### Preparación de la migración de datos (sin mover datos hasta la Fase 3)

Inventario de `SQLGUTPATATE` (mezcla datos reales y de demostración: marcar cuáles migran) → mapeo origen-destino
(`RegistroSocios→Socios`, `RegistroContable→AsientosContables+DetalleAsiento`; referencia
`.claude/agents/gutt-system-adaptacion-queries.md` seccion «Contexto real», vineta «Mapeo de nombres viejo → nuevo») → reglas de reconciliación (conteos, saldos, cartera
`1401..1428` no `{14}`, asientos cuadrados) → ensayo **solo sobre una restauración del respaldo** (`npm run backup`)
→ rollback documentado.

## 1.1 Agentes con skills: cada procedimiento se escribe una vez y se reutiliza

Regla: **si un paso se repite en más de un módulo, va a una skill o a un módulo compartido; nadie reinventa el suyo.**
Lo repetible lo decide el arquitecto una vez y el ejecutor lo repite. Si el ejecutor no encuentra la skill o el helper
que necesita, **para y lo reporta**. Agentes y skills viven en `GUTT_SYSTEM/.claude/` (donde corre la orquestación);
el conocimiento del legado que necesitan está aquí, no en TECNIFIN.

| Skill (nueva) | Qué contiene | Uso |
|---|---|---|
| `tecnifin-nuevo-proyecto` | Checklist de la sección 0 (estructura, reglas 1-14, `.env.example`, CI): sirve para el siguiente proyecto que se cree | una vez ahora; reutilizable |
| `tecnifin-traducir-modulo` | Receta T-SQL → PostgreSQL: mapa de nombres, `@x`→`$1`, `CooperativaId` vía `withTenant`, tipos, trampas de `CLAUDE.md` (cartera 1401-1428, `{14}` neto, códigos sin puntos), qué prueba escribir | ejecutor, M1…M7 |
| `tecnifin-paridad-numerica` | Comparar SQL Server vs PostgreSQL con los mismos datos: conteos, saldos, asientos cuadrados, cartera bruta vs amortización | M3, M5, M6 y MIG-01 |
| `tecnifin-migracion-datos` | Inventario, mapeo, ensayo sobre respaldo restaurado, rollback | MIG-01 y cada cooperativa nueva |
| `tecnifin-tablero` | Esquema de colecciones (`hitos`, `fases`, `modulos`, `desembolsos`), republicar el artifact, sonda de verificación | cada actualización semanal |

**Ya existen y se reutilizan (no se crean):** `engineering:architecture` (ADR-001/002/003) · `code-review` (nivel `high` en
créditos, cartera, contabilidad) y `simplify` (**detecta duplicados**) al cerrar cada módulo · `engineering:testing-strategy`
(plan de pruebas de H1) · `engineering:deploy-checklist` (antes de producción).

**Agentes:** dos nuevos, `tecnifin-postgres-arquitecto` (opus) y `tecnifin-postgres-ejecutor` (sonnet), que cargan estas skills;
no hay un agente por módulo. Se reutilizan `gutt-system-validacion-esquema` (fixtures y casos borde), `gutt-system-operaciones`
(respaldos, servicio, runbook) y `gutt-system-docs` (manuales); `gutt-system-adaptacion-queries` queda como referencia superseded.

**Código que se construye una vez y todos reutilizan** (en TECNIFIN):

| Pieza | Origen | Reutiliza |
|---|---|---|
| Pool, `bindNamed`, `transaction()` | copiado de `services/postgres.js` | todos los módulos |
| `withTenant(cooperativaId, fn)`: fija el tenant de la sesión para Row Level Security | nuevo, en `src/platform/` | todos; nadie filtra `CooperativaId` a mano |
| Control de migraciones SHA-256 | copiado de `tools/migrate-postgres.mjs` | H1 y cada módulo |
| Fábrica de datos con dos cooperativas | nuevo, `tests/fixtures/` | pruebas de aislamiento de cada módulo |
| Arnés de paridad SQL Server ↔ PostgreSQL | nuevo, `tools/paridad.mjs` (usa el patrón de `tools/db.mjs`) | M3, M5, M6, MIG-01 |
| Motor de cartera SEPS | `services/carteraSeps.js`, portado **una vez** | M6 y M7 |

## 2. Desembolsos (todos los puntos de dinero vistos)

Supuesto de pago: día 1 de cada mes, como el tablero actual. Cifras del contrato v3 (5.250 c/u).

| # | Concepto | Monto | Cuándo | Estado |
|---|---|---:|---|---|
| 1 | Dominio + hosting (tecnifin.com) | ≤ 150 | contratar antes del 30-sep | tope aprobado en reunión |
| 2 | Desarrolladores (Jorge + Franklin), meses 1-5 | 1.400/mes (700 c/u) → **7.000** | 1-oct, 1-nov, 1-dic, 1-ene, 1-feb | cl. 10.6 |
| 3 | Desarrolladores, meses 6-10 | 700/mes (350 c/u) → **3.500** | 1-mar … 1-jul | cl. 10.6 |
| 4 | Christian, pagos prorrateados | ≈ 497/mes → **≈ 4.970** | 1-oct … 1-jul | **por confirmar**: en la reunión se habló de ≈4.970 en 10 meses, pero la cl. 10.5 dice «sin pago» |
| 5 | Reunión navideña de 5 accionistas | ≈ 100 | dic-2026 | acordado |
| 6 | Servidor e infraestructura (T630, proforma) | **10.569,45** | gestión desde **ene-2027** (antes 15-mar) | fecha exacta la fija el flujo de caja |
| 7 | Estimación servidor básico + traslado desde EE.UU. | por estimar | Jorge, antes del flujo de caja | pendiente |
| 8 | Capital de trabajo (constitución, marketing, movilización, hospedaje, postproducción) | hasta 40.000 (referencia) | por definir | administración del fondo sin definir |
| 9 | Soporte posterior al mes 10 | 700/mes entre ambos (proforma) | desde ago-2027 | cl. 13.1 dice que no hay remuneración garantizada: decidir |
| 10 | Sin costear: internet redundante, flete real del T630, trámites de constitución de la SAS | — | — | cotizar |

**Flujo mensual conocido** (filas 2-5): oct, nov, ene, feb = 1.897 · dic = 1.997 · mar-jul = 1.197 c/u · total **15.570**
(10.500 desarrolladores + 4.970 Christian + 100 navidad).

**Brecha de financiamiento:** con servidor y dominio, lo cuantificado suma **26.289,45** (21.319,45 si Christian no cobra).
El numerario comprometido por Víctor es **hasta 20.000**: faltan entre **1.319,45 y 6.289,45**, antes de constitución y
marketing; la cl. 10.9 obliga a los cinco accionistas a cubrirlo en partes iguales. Además hay que conciliar: infraestructura
**10.569,45** (proforma) vs **10.595,45** (Read AI, probable error de transcripción) y «≈ 6.000 en pagos» de la reunión vs
10.500 + 4.970.

## 3. Tablero de avances: de contrato a desarrollo

Se reordena el artifact existente (`https://claude.ai/artifact/BWxQdZqmkFvTQFusVJeE1R`), misma URL.

| Pestaña | Contenido |
|---|---|
| **Desarrollo** (por defecto) | Estado del proyecto TECNIFIN (Fase 0: repo, CI, base); Hito H1 con su lista de verificación (ADR-001/002/003, ARQ-01, DAT-01, pruebas de aislamiento, acta) y % real; fases re-fechadas al 1-oct; módulos M0-M7; Tracks B, C, D |
| **Dinero** (nueva) | Los 10 puntos de la sección 2 con casilla «pagado», totales por categoría y la brecha calculada en vivo |
| **Contrato y socios** (baja de nivel) | v3, revisión lun 21 / aprobación mié 23-sep, pendientes de acta, roles |
| Diseño GUTT Móvil · Página Web | sin cambios de fondo |

Cambios de datos (base del artifact): `desembolsos` reescrita con campo `categoria` y fechas re-basadas; `fases` y `modulos` con
fechas nuevas; colección nueva `hitos`. `TOTAL = 24569.45` y las semillas `FASES_SEED`/`DESEMB_SEED` se **calculan de los datos**.
Textos visibles: «TECNIFIN · Tablero de Avance», pie con GUTT COMPANY como alterna.
**Portabilidad:** una sola capa de acceso a datos en el script (hoy `db` del artifact) para cambiarla por un endpoint cuando
exista `tablero.tecnifin.com` (privado). Publicar allí es posterior a contratar dominio y hosting y no bloquea esta entrega.
Método (166 KB): leer completo el vivo, editar una copia local, publicar con `url`, luego `ArtifactData` en lote.

## 4. Registro de riesgos

| Riesgo | Mitigación |
|---|---|
| Un agente lanzado desde GUTT_SYSTEM no puede escribir en `C:\TECNIFIN` | archivo de humo en Fase 0; si falla, las sesiones de trabajo se abren dentro de TECNIFIN y GUTT_SYSTEM solo orquesta el plan |
| ADR-002 sin revisión de Christian → H1 se atrasa | enviar borrador el 2-oct; acta explícita, sin silencio |
| El dinero no alcanza (brecha hasta ≈ 6.300) | mostrarla en el tablero desde el día uno; decisión de los cinco accionistas |
| Migración 34 sin aplicar en `SQLGUTPATATE` | aplicar solo la 34 con `run-sql.mjs`; **no** `--aplicar` (aplicaría la 35 de demo) |
| El nombre TECNIFIN puede no aprobarse en la reserva (entra GUTT COMPANY) | identificadores TECNIFIN en un solo lugar y nombre visible como dato; renombrar es barato **si se hace antes de H1**; reservar el nombre cuanto antes |
| Dos proyectos duplican lo mismo | regla 1.1: skills y helpers únicos; `simplify` al cerrar cada módulo |
| Datos reales mezclados con demo | marcar en el inventario; ensayar solo sobre respaldo restaurado |

## 5. Orden de ejecución tras aprobar

1. Fase 0 (sección 0.4): crear `C:\TECNIFIN`, reglas, copia renombrada de la capa de acceso, base `tecnifin_dev`, humo de orquestación, CI.
2. Crear las skills y los dos agentes (sección 1.1): primero `tecnifin-nuevo-proyecto` y `tecnifin-tablero`; las de traducción y paridad cuando
   el arquitecto fije el primer patrón.
3. Reescribir `DOCS_SISTEMA_FINANCIERO/plan_migracion_postgres_tecnifin.md` con este plan y corregir la memoria («nunca cambiar identificadores»).
4. Reordenar el tablero y reescribir sus datos (sección 3); guardar memoria y engram.
5. Arrancar la línea base y los borradores de ADR-001/002/003 con `engineering:architecture`.
6. Ajustes de contrato que salen de aquí (cl. 10.5 vs pagos a Christian, calendario 1-oct) → v3 corregido.

Fuera de este plan: contratar dominio/hosting (lo hace Jorge), commits y creación del repo remoto sin tu confirmación, renombrar el
producto «GUTT SYSTEM» en pantalla, tocar el SQL Server legado, mover datos reales.

## Verificación

- **Fase 0 lista** cuando: `npm test` de TECNIFIN (las 9 pruebas unitarias) en verde contra `tecnifin_dev`; CI verde; el agente de humo
  escribe un archivo en `C:\TECNIFIN` desde GUTT_SYSTEM; `git status` de TECNIFIN limpio y sin secretos (`git grep -i password`).
- **H1 listo** cuando: prueba de aislamiento entre dos cooperativas sin filtración, asientos cuadrados, `migrate.mjs` sin pendientes ni alteradas,
  y `npm test` de GUTT_SYSTEM (55) sigue en verde (el legado no se tocó).
- **Sin redundancia:** al cerrar cada módulo, `simplify` y comprobar que no hay filtros `CooperativaId` a mano (todo por `withTenant`) ni consultas
  que dupliquen a `carteraSeps`; ningún archivo de TECNIFIN pasa de ≈ 500 líneas sin justificación.
- **Dinero:** el tablero suma 26.289,45 (o 21.319,45) y muestra la brecha contra los 20.000; los meses cuadran con 15.570.
- **Tablero:** leer el DOM con `get_page_text` (sin capturas), sin scroll horizontal a 1280 y 400 px en ambos temas, sonda de `--navy`
  sin fuga entre paneles (`tmp/contrato_sas/sonda_tablero.mjs`), y confirmar los documentos nuevos con `ArtifactData`.

---

## Estado de ejecución (actualizado 2026-09-20)

| Paso | Estado |
|---|---|
| 0.4-1 a 0.4-4 · `C:\TECNIFIN`, reglas, capa de acceso renombrada, base `tecnifin_dev` | **Hecho.** 15 pruebas en verde (9 unitarias + 6 de higiene); el migrador corre limpio |
| 0.4-5 · orquestación desde GUTT_SYSTEM | **Hecho.** `additionalDirectories` + un agente escribió y se borró `var/humo.txt` |
| 0.4-1 · repo remoto en GitHub y primer commit | **Pendiente: requiere confirmación de Jorge** |
| 0.4-6 · CI (`ci.yml`) | Escrito, **sin ejecutar** (no hay remoto) |
| 0.4-7 · línea base de GUTT_SYSTEM (`npm test` 55, migración 34) | **Pendiente**: `migrate.mjs` muestra 2 pendientes; aplicar solo la 34, nunca `--aplicar` |
| 1.1 · agentes y skills | Hechos: 2 agentes, `tecnifin-nuevo-proyecto`, `tecnifin-tablero`. Faltan `tecnifin-traducir-modulo`, `tecnifin-paridad-numerica`, `tecnifin-migracion-datos` (se crean con el primer patrón) |
| 3 · tablero | **Publicado v9** (versión 10 del artifact). Móvil y Web siguen con GUTT COMPANY en sus maquetas |
| `deploy/` de TECNIFIN | Solo `README` con la lista de lo que falta (Fase 4) |
| Contrato v3 → corregir cl. 10.5 (pagos a Christian) y calendario 1-oct | **Pendiente** |
| ADR-001/002/003 | Arrancan en H1 (1-oct) |
