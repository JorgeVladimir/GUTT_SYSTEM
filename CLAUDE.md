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
node tools/db.mjs "SELECT TOP 5 Codigo, Nombre FROM dbo.PlanCuentas"   # consulta a SQLGUTPATATE
node tools/token.mjs admin ADMIN                                        # JWT para probar endpoints
node tools/smoke-reports.mjs                                            # valida los 6 reportes SEPS
npm test                                                                # suite existente (test-all.js)
npm run build                                                           # regenera dist/
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
- **Bandas de antigüedad SEPS no son simétricas**: "por vencer" corta en 181-360/>360; "vencida" en
  181-270/>270. Verificar contra `dbo.PlanCuentas`, no asumir.
- **sqlcmd + UPDATE/INSERT**: anteponer `SET QUOTED_IDENTIFIER ON;` o falla con `Msg 1934`.
- **`SolicitudesCredito.PlanPagos`** guarda `"Mes 1"`, `"Mes 2"`… no fechas. El vencimiento real es
  `DATEADD(MONTH, cuota.number, FechaDesembolso)`.
- **Relanzar node en Windows**: `Start-Process` **con** `-RedirectStandardOutput/-RedirectStandardError`
  deja el proceso vivo pero **sin escuchar el puerto**. Sin redirección arranca bien.
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

Pendientes reales (no cosméticos):
1. Proceso mensual de **reclasificación de cartera** entre bandas y estados. Hoy la clasificación
   contable queda congelada; el sistema lo alerta pero no lo resuelve.
2. **Ponderaciones de riesgo** para el índice de solvencia regulatorio (hoy se publica
   Patrimonio/Activo, declarado explícitamente como aproximación).
3. **SMTP real** — el correo de recuperación de contraseña no sale; falta App Password.
4. **Despliegue real** — corre en el equipo de desarrollo tras un túnel, con watchdog
   (`deploy/watchdog_backend.ps1`, tarea `GuttSystemWatchdog`) en vez de servicio Windows.
5. **QA formal** — la suite existe (`npm test`) pero no se está usando.
