# Mapa consolidado de módulos — Sistema legacy AFC (Informix)

Consolida `INVENTARIO_TABLAS.md` (4 módulos documentados a fondo: Clientes, Créditos-master, DPF,
Contabilidad-saldos) + `CATALOGO_MODULOS_lote1.md` (145 tablas `bca*`) + `CATALOGO_MODULOS_lote2.md`
(144 tablas `bca*`) + `CATALOGO_MODULOS_lote3.md` (140 tablas `afc*` + sueltas). Cobertura: **527/527
tablas** de la base `afccajacrediapoyo`.

Este documento es un índice de navegación — el detalle de columnas/relaciones de cada tabla vive en el
archivo fuente indicado en cada fila. Es la base para decidir, módulo por módulo, cuáles convertir en
agentes de documentación técnica (Fase 2) y luego en implementación read-through (Fase 3).

---

## Índice de módulos de negocio (consolidado, ~26 módulos)

| # | Módulo | Tablas aprox. | Fuente(s) | Estado en el proyecto nuevo (SQL Server) |
|---|---|---|---|---|
| 1 | **Socios / Clientes** | ~28 | Inventario (`bcaclie` master) + lote1 §16 + lote2 | ✅ Ya integrado (read-through en `/api/socios/buscar`) |
| 2 | **Créditos / Cartera** | ~40 | Inventario (`bcacred` master) + lote1 §1 + lote3 §1 + "Riesgo-Provisiones" (lote3) | ✅ Ya integrado (`buscarCreditosInformix`), pero solo el master — falta el detalle de amortización/calificación real (`bcadivc`/`afcddic`, `bcacalf`) |
| 3 | **Garantías y Bienes** | ~7 | lote1 §2 | ❌ No integrado |
| 4 | **Cobranza / Legal / Judicial / Coactiva** | ~7 | lote1 §3 + lote2 + lote3 | ❌ No integrado |
| 5 | **Depósitos a la Vista (Ahorros)** | ~15 | Inventario (`bcadpvi`) + lote1 §4 + lote2 + lote3 | ✅ Parcial — el módulo nuevo "Ahorro a la Vista" ya existe en SQL Server; falta el fallback read-through a `bcadpvi` |
| 6 | **Ahorro Programado / Planes de Ahorro** | ~3 | lote1 §5 | ❌ No integrado (no existe aún en el sistema nuevo) |
| 7 | **Recaudación / Remesas entre oficinas (ANR)** | ~6 | lote1 §6 + lote3 ("Operaciones-Distribución `anrl`") | ❌ No integrado |
| 8 | **Depósitos a Plazo Fijo (DPF)** | ~15 | Inventario (`bcadpfi`) + lote1 §7 | ✅ Ya integrado (`buscarDPFInformix`), falta detalle de pagos de interés/renovaciones |
| 9 | **Contabilidad General (libro diario)** | ~15 | lote1 §8 (**hallazgo: `bcacomp`+`bcadcom` = libro diario real**) + lote2 + lote3 | ⚠️ Parcial y desactualizado — `INVENTARIO_TABLAS.md` había concluido "no existe libro diario"; **esto ya no es cierto**, hay que rehacer el endpoint `/api/contabilidad/balance-legacy` para usar `bcacomp`/`bcadcom` en vez de solo `comp_sal_cta` |
| 10 | **Presupuesto** | ~2 | lote1 §9 + lote2 | ❌ No integrado |
| 11 | **Caja / Efectivo / Papeletas (cajero)** | ~10 | lote1 §10 + lote2 §1 (núcleo: papeleta→transacción→pago) | ❌ No integrado directo (el nuevo Teller ya opera, pero sin fallback a datos legacy de caja) |
| 12 | **Bancos / Tesorería / Conciliación** | ~12 | lote1 §11 + lote2 + lote3 | ❌ No integrado |
| 13 | **Cheques / Chequeras** | ~8 | lote1 §12 + lote2 | ❌ No integrado |
| 14 | **Impuestos y Retenciones (SRI)** | ~5 | lote1 §13 | ❌ No integrado |
| 15 | **Facturación Electrónica / SRI / ATS** | ~5+ | lote1 §14 + lote2 + lote3 | ❌ No integrado |
| 16 | **Reportes Regulatorios SEPS / SIB** (incl. motor PERLAS/solvencia `bcaindi`) | ~10 | lote1 §15 + lote2 + lote3 | ❌ No integrado — **alto valor**: `ReportsView.tsx` podría alimentarse de esto para reportes SEPS |
| 17 | **Clientes/Socios — datos socioeconómicos** | (incluido en #1) | lote2 | — |
| 18 | **RRHH / Nómina** | ~5 | lote1 §17 + lote2 | ❌ No integrado |
| 19 | **Activos Fijos** | ~3 | lote1 §18 + lote2 | ❌ No integrado |
| 20 | **Organización / Sucursales / Dependencias** | ~5 | lote1 §19 + lote2 | ❌ No integrado |
| 21 | **Seguridad / Accesos / Auditoría de sesión** | ~4 | lote1 §20 + lote2 | Parcial — login legacy ya usado en `api/auth/login.php` (`bcausua`/`bcaperf`) |
| 22 | **Divisas / Tipo de Cambio** | ~2 | lote1 §21 | ❌ No integrado |
| 23 | **Configuración / Parámetros / Catálogos generales** | ~20 | lote1 §22 + lote2 + lote3 | Transversal — se consulta según necesidad de cada módulo, no es un "módulo" con reportes propios |
| 24 | **Seguros sobre garantías** | ~2-3 | lote2 | ❌ No integrado |
| 25 | **Cuentas por Pagar / Proveedores / Compras** | ~5-8 | lote2 + lote3 | ❌ No integrado |
| 26 | **Cuentas por Cobrar** (distinto de cobranza de cartera) | ~3-5 | lote3 | ❌ No integrado |
| 27 | **Prevención de Lavado de Activos (UAFE/AML)** | ~3-5 | lote3 (`afcauid`, `uaf2_productos`, `uaf3_transacciones`, etc.) | ❌ No integrado — **relevante para cumplimiento regulatorio**, no solo "nice to have" |
| 28 | **CRM / Requerimientos / Reclamos de socios** | ~3-5 | lote3 | ❌ No integrado |
| 29 | **Auditoría / Bitácora nativa (`track_01/02/03`)** | 3 | lote3 §17 | ❌ No integrado — trail completo sesión→sentencia→valor de columna, útil para trazabilidad SOX |

**Tablas técnicas/no-negocio identificadas (no requieren módulo):** `bcactrl`, `bcabbdd` (lote1);
`bcaremq`, `bcaseqn`, `bcavaft`, `bcavari` (lote2); `pbcatcol/edt/fmt/tbl/vld`, `tmpdcom` (lote3).

---

## Hallazgos que corrigen conclusiones anteriores

1. **Sí existe libro diario transaccional** (`bcacomp` cabecera + `bcadcom` detalle debe/haber, con
   variante `bcaccom`/`bcacdco`). El `INVENTARIO_TABLAS.md` original concluyó lo contrario porque no
   había cubierto el rango alfabético donde caen estas tablas. Esto habilita hacer contabilidad general
   read-through real (no solo saldos agregados como está hoy en `/api/contabilidad/balance-legacy`).
2. El sistema tiene un **motor de reportería regulatoria SEPS/SIB completo** (`bcaesfe`, `bcaeesf`,
   `bcaesep`, `bcarsib`, `bcaindi` con fórmulas PERLAS/solvencia) — de alto valor para `ReportsView.tsx`.
3. Hay un **módulo tributario SRI completo** (retenciones en compras/ventas/rendimientos financieros,
   facturación electrónica, ATS) — relevante si el sistema nuevo necesita declarar impuestos.
4. Hay tablas de **prevención de lavado de activos (UAFE)** — compliance regulatorio, no cosmético.
5. Hay un **audit trail nativo** (`track_01/02/03`) que registra cambios a nivel de columna — útil como
   referencia de diseño para auditoría en el sistema nuevo.

---

## Siguiente paso propuesto

Con este mapa, la Fase 2 (documentación por módulo) puede priorizarse. Los módulos marcados ✅/⚠️ ya
tienen algo de integración (socios, créditos, DPF, contabilidad parcial) y son candidatos a
**profundizar** primero; el resto son candidatos a **documentar desde cero**. Dado el volumen (29
módulos), no se recomienda lanzar 29 agentes Opus en paralelo de una vez — conviene priorizar por
valor de negocio y confirmar con el usuario el orden.
