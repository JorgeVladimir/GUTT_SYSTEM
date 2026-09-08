# GUTT_SYSTEM

Core bancario para cooperativas de ahorro y crédito (COAC) reguladas por la **SEPS** (Ecuador).
Se vende como sistema standalone, no como integración con el core Informix del cliente.
React + Vite (frontend) · Node/Express (backend) · SQL Server.

---

## Los dos backends — no confundirlos

| Archivo | Puerto | Base de datos | Rol |
|---|---|---|---|
| `server.js` | 5005 | `SQLGUTPATATE` | **El que corre.** Sirve la demo en vivo, el dominio público y `dist/` |
| `server.gutt_system.js` | 5006 | `GUTT_SYSTEM` | Rediseño multi-tenant. **No desplegado.** No tocar creyendo que es el productivo |

`SQLGUTPATATE` es mono-cooperativa (sin `CooperativaId`). `GUTT_SYSTEM` sí es multi-tenant.
Los scripts de `db/gutt_system/` asumen `CooperativaId` y **no** corren tal cual contra `SQLGUTPATATE`.

El dominio público sale por Tailscale Funnel → `127.0.0.1:5005`. Si `server.js` no está arriba,
el dominio da 502 aunque Tailscale esté bien.

---

## Comandos canónicos

No re-derivar estos. Los scripts de `tools/` leen `api/.env` solos — **nunca hace falta escribir
credenciales a mano ni la ruta larga de `sqlcmd`**.

```bash
node tools/db.mjs "SELECT TOP 5 Codigo, Nombre FROM dbo.PlanCuentas"   # consulta (SOLO LECTURA) a SQLGUTPATATE
node tools/run-sql.mjs db/sqlserver/NN_x.sql                            # ejecuta UN script versionado
node tools/migrate.mjs                                                  # estado del esquema: pendientes/alteradas
node tools/migrate.mjs --aplicar                                        # aplica lo que falte, en orden y transaccional
node tools/token.mjs admin ADMIN                                        # JWT para probar endpoints
node tools/smtp.mjs [destino@dominio]                                   # diagnostica SMTP (config/conexión/envío)
npm test                                                                # suite completa: 55 pruebas, 8 suites
npm run test:reportes                                                   # solo los 6 reportes SEPS
npm run test:cartera                                                    # proceso de cartera: simula, aplica, reversa
npm run build                                                           # regenera dist/
```

```powershell
npm run preflight    # checklist ejecutable de "listo para producción" (deploy/preflight.ps1)
npm run backup       # respaldo completo + RESTORE VERIFYONLY
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/restart-backend.ps1   # relanza server.js y espera /api/health
```

**Secretos**: este archivo se commitea. Cero contraseñas aquí. Todo vive en `api/.env`.

---

## Gotchas ya pagados (no volver a tropezar)

- **Códigos contables**: dígitos concatenados **sin puntos** (`'210305'`, no `'2.1.03.05'`).
  El formato punteado es legacy y ya fue migrado.
- **Cartera de crédito** debe ir en la familia `1401-1428` del Catálogo Único, nunca en `143110`.
  Las fórmulas regulatorias leen **prefijos numéricos**, no nombres de cuenta. Mapear por similitud
  de nombre ya causó un bug real (morosidad 0% con la cartera 100% en mora).
- **Bandas de antigüedad SEPS no son simétricas, y además cambian POR FAMILIA**. `1402` (consumo
  por vencer) corta en 181-360/>360; `1422` (consumo vencida) en 181-270/>270; y `1423`/`1427`
  (vivienda vencida y reestructurada vencida) tienen **seis** bandas
  (1-30 | 31-90 | 91-270 | 271-360 | 361-720 | >720). Nunca hardcodear una tabla de bandas: se
  leen de `dbo.PlanCuentas` con `cargarBandasCartera()` de `services/carteraSeps.js`.
- **`{14}` es cartera NETA**, incluye `1499` "(Provisiones para créditos incobrables)", que es
  activo de saldo **acreedor**. Compararla contra la cartera bruta de la tabla de amortización
  produce un descuadre exactamente igual a la provisión constituida. Para morosidad, sumar
  `1401..1428`; `{14}` solo cuando el denominador también va neto.
- **Migraciones**: estar commiteada no significa estar aplicada. `20_ice_seps.sql` vivió semanas
  en git sin ejecutarse y dejó la **aprobación de créditos caída** (columnas `ICE*` inexistentes).
  Antes de dar por bueno cualquier módulo: `node tools/migrate.mjs`.
- **Un test que falla por una razón obsoleta puede estar tapando un fallo real.** Los 4 fallos
  crónicos de `npm test` eran tests pre-JWT que no mandaban token; detrás del 401 se escondía el
  bug de aprobación de créditos. Al arreglarlos apareció.
- **`RegistroContable.SocioId` acepta NULL** (ver `32_*.sql`): los asientos agregados de procesos
  de cierre no pertenecen a un socio. Poner `0` rompe la FK contra `RegistroSocios`.
- **sqlcmd + UPDATE/INSERT**: anteponer `SET QUOTED_IDENTIFIER ON;` o falla con `Msg 1934`.
- **`SolicitudesCredito.PlanPagos`** guarda `"Mes 1"`, `"Mes 2"`… no fechas. El vencimiento real es
  `DATEADD(MONTH, cuota.number, FechaDesembolso)`.
- **Relanzar node en Windows**: `Start-Process` **con** `-RedirectStandardOutput/-RedirectStandardError`
  deja el proceso vivo pero **sin escuchar el puerto**. Sin redirección arranca bien.
- **`Get-ScheduledTask` no ve las tareas de principal SYSTEM sin elevación**: no falla, devuelve
  vacío. `preflight` distinguía mal "no existe" de "no puedo verla" y declaraba NO LISTO un equipo
  bien instalado. Correr `npm run preflight` **como administrador** para que el punto 4 y 6 valgan.
- **Archivos `.ps1` en ASCII puro**: Windows PowerShell 5.1 los lee como ANSI; un acento o un guión
  largo en un comentario rompe el parseo con `MissingEndCurlyBrace`.
- **Aprobación de créditos**: `server.js` no tiene lista blanca de roles; solo **bloquea**
  `CREDIT_OFFICER`. Cualquier otro rol (ADMIN, SUPER_USER, CARTERA) puede aprobar.

---

## Cómo trabajar en este repo

### Leer
`server.js` (~5.800 líneas) y `components/TellerView.tsx` (~3.500) **nunca se leen enteros** —
son ~70k tokens. Siempre `Grep` con patrón preciso primero, después `Read` con `offset`/`limit`
sobre el rango encontrado.

### Verificar
Preferir `npm test` y `tools/smoke-reports.mjs` antes que `curl` ad-hoc.
Para confirmar que la UI funciona, usar **texto/DOM** (`get_page_text`, `find`, `read_page`).
**Screenshots solo si el usuario los pide explícitamente** — son el gasto individual más caro.

### Subagentes
Arrancan en frío y re-derivan contexto. Usarlos solo si el trabajo es realmente aislable, y
**pasarles en el prompt los hechos ya conocidos** para que no los busquen de nuevo.
La VM Informix de pruebas (`192.168.1.199`) suele estar **apagada** y encenderla requiere
autorización del usuario — no mandar agentes a consultarla sin verificar primero.

### Memoria (engram)
- **Guardar** (`mem_save`) al cerrar cada unidad de trabajo: módulo terminado, bug corregido *con su
  causa raíz*, decisión tomada, hallazgo no obvio. No dejarlo para el final de la sesión.
- **Buscar** (`mem_search`) antes de investigar cualquier tema que huela a ya visto.
- Guardar el **porqué** y **qué no volver a intentar**. Lo que el código ya dice, no.

---

## Estado y pendientes

Reportería SEPS implementada en `POST /api/reports/generate.php` (campo `type`):
`sp_esf_seps` · `sp_indicadores_perlas` · `sp_sepsb11` · `sp_uaf_matriz` · `sp_r_bal_compro` ·
`sp_r_situa_gene`. Los cuatro primeros devuelven **objetos** estructurados, no arrays.

**Proceso mensual de cartera** (cierra el hueco que PERLAS venía denunciando): motor único en
`services/carteraSeps.js`, compartido por el proceso y por los reportes para que no puedan
discrepar. Endpoints `/api/cartera/clasificacion`, `/api/cartera/reclasificar` (simula por
defecto; aplicar es explícito), `/api/cartera/reclasificaciones`,
`/api/cartera/reclasificar/:id/reversar`, `/api/reportes/solvencia`.
Pantalla: **Reclasificación de Cartera**. Runbook completo en `deploy/DESPLIEGUE.md`.

**Solvencia regulatoria real** (PTC / APR, ya no la aproximación Patrimonio/Activo):
paramétrica en `dbo.PonderacionesRiesgo`, `dbo.ParametrosPatrimonioTecnico` y
`dbo.ParametrosRegulatorios` (`db/sqlserver/31_*.sql`). Se edita el dato, no el código.

Pendientes reales — los tres requieren credenciales o elevación del usuario, no código:
1. **App Password de Gmail** en `api/.env` (`SMTP_USER`/`SMTP_PASS`). Todo lo demás del correo
   está hecho y se verifica con `node tools/smtp.mjs destino@dominio.com`.
2. **Instalar servicio y respaldo** — dos comandos en PowerShell **como administrador**:
   `deploy/install-service.ps1` y `deploy/backup-db.ps1 -Instalar`. Son los dos bloqueantes que
   quedan en `npm run preflight`.
3. **Mover a servidor de producción** (`.164`, patrón Caddy + NSSM + runner ya probado en los
   otros tres repos). Decisión pendiente del cliente: dónde vive la base. Ver sección 8 de
   `deploy/DESPLIEGUE.md`.
