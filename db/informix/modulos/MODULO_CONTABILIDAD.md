# Módulo Contabilidad General — Informix legacy (`afccajacrediapoyo`)

Documento consolidado del dominio Contabilidad/Presupuesto del core AFC. Reúne las tablas de las 3
fuentes de catalogación (`INVENTARIO_TABLAS.md` §4, `CATALOGO_MODULOS_lote1.md` §8-9,
`CATALOGO_MODULOS_lote2.md` §8, `CATALOGO_MODULOS_lote3.md` §14) y verifica el hallazgo del libro diario
con **consultas reales** contra la VM de pruebas (`192.168.1.199:1526`, server `ol_servidor`) vía
`db/informix/introspeccion.js`. Fase de **solo documentación** — no se modifica código de aplicación.

Fecha de verificación: 2026-07-13.

---

## 1. Resumen ejecutivo — corrección del hallazgo

**El hallazgo previo de `INVENTARIO_TABLAS.md` §4 está OFICIALMENTE INVALIDADO.** Ese documento concluyó:
"*No existe una tabla evidente de asientos contables / libro diario tradicional (...) No se encontró una
tabla de asientos/movimientos contables detallados*". **Esto es incorrecto.**

Sí existe el libro diario transaccional, y se confirmó con datos reales:

| Tabla | Rol | Filas (VM prueba) | Estado |
|---|---|---|---|
| **`bcacomp`** | **Cabecera de comprobante** (asiento) | **2 653** | ✅ ACTIVA, con datos reales |
| **`bcadcom`** | **Detalle debe/haber** del comprobante | **13 073** | ✅ ACTIVA, con datos reales |
| `bcaccom` / `bcacdco` | Variante `c*` (conciliación/cierre) | **0 / 0** | ⚪ VACÍA en este ambiente |
| `bcapdco` | Detalle de comprobante de CxP (módulo proveedores) | **0** | ⚪ VACÍA en este ambiente |

Hechos verificados con consulta (detalle en §3):

- **Partida doble real y cuadrada**: `SUM(debe) = SUM(haber) = 25 958 493.36` exacto sobre las 13 073 líneas.
- **Cobertura temporal amplia**: 15 períodos contables (`comp_cod_peri` 20→35), comprobantes fechados desde
  **2025-05-09 hasta 2026-06-13** — es data viva, no un remanente.
- **`comp_sal_cta` NO es el libro diario**: es un snapshot agregado de solo 150 filas, sin dimensión de
  período, cuyo universo de cuentas **ni siquiera coincide** línea-a-línea con `bcadcom` en esta VM (§4).

**Consecuencia para la integración:** el endpoint `GET /api/contabilidad/balance-legacy` se construyó sobre
`comp_sal_cta` bajo la premisa (hoy falsa) de que "no hay libro diario". Debe reescribirse para leer el
libro diario real `bcacomp`/`bcadcom`, que permite balance de comprobación por período, libro mayor y
reconstrucción de asientos — nada de lo cual soporta `comp_sal_cta`. Propuesta concreta en §5.

---

## 2. Tabla consolidada del dominio Contabilidad / Presupuesto

Leyenda de origen: **L1/L2/L3** = lote de catalogación; **INV** = `INVENTARIO_TABLAS.md`.

### 2.1 Libro diario transaccional (núcleo)

| Tabla | Columnas clave (verificadas) | Rol | Relaciones | Origen |
|---|---|---|---|---|
| `bcacomp` | `comp_cod_comp` (SERIAL, **PK interna**), `comp_num_comp` (nº visible, **NO único**), `comp_cod_tdoc` (tipo doc), `comp_cod_peri`→`bcaperi`, `comp_fec_comp`, `comp_fec_serv`, `comp_beneficia`, `comp_detalle`, `comp_val_comp`, `comp_cod_usua`, `comp_cod_ofic`, `comp_anulado` (0/1), `comp_mayori` (0/1), `comp_transmi`, `comp_usu_anul`, `comp_fec_anul` | **Cabecera del asiento contable** | 1:N con `bcadcom` por `comp_cod_comp` | L1 |
| `bcadcom` | `dcom_cod_dcom` (PK línea), `dcom_cod_comp`→**`bcacomp.comp_cod_comp`**, `dcom_cod_ctas`→plan cuentas, `dcom_cod_tasi` (**'D'=Debe / 'C'=Haber**), `dcom_valor` (DEC), `dcom_may_dcom` | **Detalle debe/haber** (una fila por línea del asiento) | N:1 con `bcacomp`; `cod_ctas`→`bcaccco` | L1 |
| `bcaccom` | `ccom_cod_mese`, `ccom_cod_usua`, `ccom_cod_tdoc`, `ccom_num_ccom`, `ccom_fec_ccom`, `ccom_mayori`, `ccom_cod_ejer`→`bcaejer` | Variante de comprobante (**vacía**; probable conciliación/cierre mensual por ejercicio) | 1:N con `bcacdco` | L1 |
| `bcacdco` | `cdco_cod_ccom`→`bcaccom`, `cdco_cod_ctas`, `cdco_cod_tasi`, `cdco_val_cdco`, `cdco_may_cdco` | Detalle de la variante `bcaccom` (**vacía**) | N:1 con `bcaccom` | L1 |
| `bcapdco` | `pdco_cod_pdco` (PK), `pdco_cod_comp`, `pdco_cod_ctas`, `pdco_cod_tasi`, `pdco_valor` | Partidas contables de comprobante de egreso/CxP (**vacía**) | N:1 con comprobante; `→bcapcom` | L2 |

### 2.2 Plan de cuentas, saldos y agregados

| Tabla | Columnas clave (verificadas) | Rol | Relaciones | Origen |
|---|---|---|---|---|
| `bcaccco` | `ccco_cod_ctas` (**id interno**, PK), `ccco_cod_ccon` (**código SEPS real**, ej. `110105`), `ccco_nom_ccon` (nombre), `ccco_cod_tcue`, `ccco_cod_mone` | **Plan de cuentas** (1 103 filas, id 1098–2200) | referenciada por `dcom_cod_ctas` | L1 |
| `comp_sal_cta` | `cod_ctas`, `cod_ccon`, `nom_ccon`, `cod_tcue`, `sal_peri` (saldo anterior), `sal_mes_debe`, `sal_mes_cred`, `cod_ofic` | Snapshot agregado tipo balance de comprobación (**150 filas, sin período**) | independiente (ver §4) | INV |
| `comp_sal_ctab13` | (misma estructura probable) | Snapshot archivado/respaldo | — | INV |
| `bcasact` | `sact_cod_ctas`, `sact_cod_peri`, `sact_sal_debi`, `sact_sal_cred`, `sact_cod_ofic` | Saldos por cuenta **y período** (más granular que `comp_sal_cta`) | `cod_peri`→`bcaperi` | INV |
| `tmpsact` / `tmpdcom` | staging de `bcasact` / saldos de comprobación | Temporales de cierre, **no fuente de verdad** | — | INV/L3 |
| `bcasacp` | `sacp_cod_cons`, `sacp_cod_mese`, `sacp_cod_ctas`, `sacp_sal_debi`, `sacp_sal_cred` | Saldos consolidados por mes/cuenta (consolidación de cierre) | `cod_cons`→`bcacons` | L2 |
| `afcsctd` | `sctd_cod_ctas`, `sctd_cod_ofic`, `sctd_cod_peri`, `sctd_fec_sctd`, `sctd_sal_debe`, `sctd_sal_cred`, `sctd_cod_cont`, `sctd_cod_gere` | Saldos por cuenta/oficina/período (variante `afc`) | `cod_peri`→`bcaperi` | L3 |
| `afcctar` | `ctar_cod_ctar`, `ctar_nom_ctar`, `ctar_des_ctar`, `ctar_sib_ctar`, vigencia | Plan de cuentas variante `afc` (**vacío** en VM) | — | INV |
| `bcarb11` | `rb11_cod_ctas`, `rb11_cod_ccon`, `rb11_mes_rb11`, `rb11_val_sald`, `rb11_fec_rep` | Balance regulatorio (RB) — puente contabilidad↔SEPS | `cod_ccon` SEPS | L2 |

### 2.3 Períodos, ejercicio y cierres

| Tabla | Columnas clave | Rol | Origen |
|---|---|---|---|
| `bcaperi` | `peri_cod_peri` (PK), `peri_cod_ejer`, `peri_mes_peri`, `peri_cie_peri` (cerrado 0/1) | **Períodos contables** (ejercicio + mes). Resuelve `comp_cod_peri` | L2 |
| `bcaejer` | `ejer_cod_cont`, `ejer_ani_ejer` | Ejercicio fiscal (año) por entidad | L1 |
| `bcacons` | `cons_cod_ejer`, `cons_ban_cons`, `cons_des_cons` | Consolidación/cierre por ejercicio | L1 |
| `bcafcdi` | `fcdi_fec_fcdi`, `fcdi_cod_comp`→`bcacomp`, `fcdi_des_fcdi` | Lote/cierre diario ligado a comprobante | L1 |
| `bcandoc` | `ndoc_cod_ejer`, `ndoc_cod_tdoc`, `ndoc_num_tdoc` | Numeración de documentos por ejercicio/tipo (secuencia de `comp_num_comp`) | L2 |
| `bcatdoc` | `tdoc_cod_tdoc`, `tdoc_des_tdoc` | Catálogo tipo de documento (CDT, DEP, RET…) | INV/L2 |
| `bcatcue` | `tcue_cod_tcue`, `tcue_des_tcue` | Catálogo tipo de cuenta contable (M/D/A…) | L2 |

### 2.4 Parametría de imputación (operación → cuenta)

| Tabla | Rol | Origen |
|---|---|---|
| `bcadpap` | Asiento contable de la papeleta de caja (`cod_pape`→`cod_ctas`, D/H) | L1 |
| `bcadoem` | Mapeo operación de efectivo → cuenta contable | L1 |
| `bcatrcj` | Rubros de caja con cuenta contable + tipo de asiento | L2 |
| `bcarubr` | Catálogo de rubros (ingreso/gasto) mapeados a cuentas + IVA | L2 |
| `bcaordc` | Detalle contable de orden de recaudación (`ordc_cod_dcom`→`bcadcom`) | L2 |
| `bcadrtc` | Retención en compras ligada a línea de asiento (`cod_dcom`→`bcadcom`) | L1 |
| `bcacont`/`bcacous`/`bcacpar`/`bcapctb` | Parametría/control contable por oficina y usuario | L1/INV |
| `afccpof` | Cuentas puente entre oficinas (interoffice) | L3 |
| `afcgtbi`/`afcgtti` | Parametrización contable de garantías (cuentas de orden) | L3 |

### 2.5 Presupuesto

| Tabla | Columnas clave | Rol | Origen |
|---|---|---|---|
| `bcacpre` | `cpre_cod_cont`, `cpre_ani_pres`, `cpre_ani_refe`, `cpre_cod_mone`, `cpre_cie_pres` | Cabecera de presupuesto (año presupuestado vs. referencia) | L1 |
| `bcavpre` | `vpre_cod_pres`, `vpre_cod_mese`, `vpre_val_vpre` | Valor por partida presupuestaria y mes | L2 |
| `bcapres` | (partida presupuestaria — cabecera de línea) | Maestro de partida | L3 |

---

## 3. Confirmación de la relación cabecera↔detalle con datos reales

### 3.1 La FK correcta es `comp_cod_comp`, NO `comp_num_comp`

Esto es un riesgo de integridad crítico para quien implemente el JOIN. `comp_num_comp` **se repite**: es
un consecutivo *por tipo de documento*, no una PK global. Consulta:

```sql
SELECT FIRST 10 comp_cod_comp, comp_cod_tdoc, comp_num_comp
FROM bcacomp WHERE comp_cod_comp <> comp_num_comp;
```
Resultado: `comp_num_comp=1` existe para `CDT`, `DPC`, `DEP`, `TRN`, `RET`… cada uno con distinto
`comp_cod_comp` (25, 26, 27, 30…). **Unir `bcadcom` por `comp_num_comp` produciría un cartesiano** que
mezcla asientos de distintos tipos de documento. La FK es:

> `bcadcom.dcom_cod_comp` → `bcacomp.comp_cod_comp` (SERIAL, PK interna).

### 3.2 Reconstrucción de un comprobante (JOIN verificado)

```sql
SELECT c.comp_cod_comp, c.comp_cod_tdoc, d.dcom_cod_ctas, d.dcom_cod_tasi, d.dcom_valor
FROM bcacomp c, bcadcom d
WHERE d.dcom_cod_comp = c.comp_cod_comp AND c.comp_cod_comp = 2;
```
Comprobante `cod_comp=2` (CDT, "Otorgación de Crédito Nº2 por 31500"):
- **Haber (C):** 157.50 + 157.50 + 31 185.00 + 31 500.00 = **63 000.00**
- **Debe (D):** 4 794.15 + 7 509.25 + 16 289.53 + 2 907.07 + 31 500.00 = **63 000.00** ✅ cuadra.

### 3.3 Partida doble global cuadrada

```sql
SELECT dcom_cod_tasi, COUNT(*) lineas, SUM(dcom_valor) total FROM bcadcom GROUP BY dcom_cod_tasi;
```
| `tasi` | líneas | total |
|---|---|---|
| C (Haber) | 7 318 | **25 958 493.36** |
| D (Debe) | 5 755 | **25 958 493.36** |

Debe = Haber al centavo sobre 13 073 líneas → es un libro diario de doble entrada real y balanceado.

### 3.4 Nota sobre `comp_val_comp`

En la muestra, `comp_val_comp = 0.00` en la cabecera aunque el asiento suma 10 000+. **El total de la
cabecera no es confiable**: el valor real del comprobante debe calcularse sumando `bcadcom` (lado debe o
haber). No usar `comp_val_comp` como monto del asiento.

### 3.5 Semántica de columnas de control

- `comp_anulado = 1` → comprobante anulado (excluir de reportes de saldos salvo auditoría). En la muestra,
  los comprobantes 1 y 3 están anulados; 2, 4, 5 vigentes.
- `comp_mayori = 1` → mayorizado (contabilizado en firme). `= 0` → aún no afecta saldos oficiales.
- Para un balance "oficial" el filtro correcto es típicamente `comp_anulado = 0 AND comp_mayori = 1`.

---

## 4. Relación con `comp_sal_cta` (¿saldos derivados o independientes?)

**Conclusión: en esta VM, `comp_sal_cta` es un agregado INDEPENDIENTE, no una suma fiel de `bcadcom`.**

Evidencia:

1. **Universos de cuenta casi disjuntos.**
   - `bcadcom.dcom_cod_ctas`: rango **22264–26427**, 155 cuentas distintas.
   - `comp_sal_cta.cod_ctas`: rango **24331–26420**, 150 cuentas.
   - La cuenta `23278` tiene movimiento en `bcadcom` (D=C=2 374.65) pero **no existe** en `comp_sal_cta`.
   - La cuenta `24331` aparece en `comp_sal_cta` (debe 394 476.28 / haber 329 277.17) pero tiene **0 filas**
     en `bcadcom`. Si fuera un agregado derivado, esto sería imposible.

2. **`comp_sal_cta` no tiene dimensión temporal.** Sus 8 columnas no incluyen período/mes/fecha; es un único
   snapshot. `bcadcom` (vía `bcacomp.comp_cod_peri` / `comp_fec_comp`) cubre 15 meses. No hay forma de
   filtrar `comp_sal_cta` por período — el parámetro `periodo` del endpoint actual es inaplicable.

3. **Tamaño incompatible con "saldos vivos".** 150 filas fijas vs. 13 073 movimientos reales.

**Interpretación:** `comp_sal_cta` es un snapshot pre-cargado (probablemente exportado de otra instancia o de
un corte regulatorio anterior) que quedó desincronizado del libro diario transaccional generado en la VM de
pruebas. La **fuente de verdad para saldos es `bcadcom` agregado por cuenta**; `comp_sal_cta` debe tratarse
como dato legacy no reconciliable y **no** como base de un balance de comprobación.

> ⚠️ **Hallazgo crítico de integridad para el equipo de migración:** el plan de cuentas `bcaccco` cubre
> `cod_ctas` 1098–2200 (códigos SEPS reales: `110105`=Efectivo, etc.), pero **tanto `bcadcom` como
> `comp_sal_cta` referencian `cod_ctas` en el rango 22000–26000, que NO existe en `bcaccco`**. En esta VM el
> JOIN `bcadcom.dcom_cod_ctas → bcaccco.ccco_cod_ctas` devuelve vacío. Es inconsistencia de datos semilla
> (tablas pobladas desde fuentes distintas). Antes de exponer nombres de cuenta en producción hay que
> confirmar cuál es el plan de cuentas canónico que cubre el espacio de ids transaccional (posiblemente
> `afcctar` una vez poblado en prod, o un `bcaccco` de producción con el rango correcto). Mientras tanto,
> `comp_sal_cta.nom_ccon` es el único nombre disponible inline, y solo para 150 cuentas.

---

## 5. Mapa de reportes / funciones que el módulo debería exponer

Equivalente SQL Server: `dbo.RegistroContable` (`db/sqlserver/08_cuentas_y_parametros_productos.sql`) es un
**libro diario plano** — columnas `AsientoId, Fecha, SocioId (FK NOT NULL), CuentaContable NVARCHAR(20),
Concepto, Debe DECIMAL(18,2), Haber DECIMAL(18,2), NumeroCuenta, UsuarioId`. Limitaciones frente a Informix:
(a) **exige `SocioId`** en cada asiento (Informix agrupa por comprobante institucional, no por socio);
(b) **no agrupa por comprobante** (no hay nº de asiento agrupador, ni anulado/mayorizado, ni período). Por
eso `dbo.RegistroContable` sirve para la contabilidad *nueva* transaccional, pero **no puede representar los
comprobantes históricos de Informix**; la lectura legacy read-through sigue siendo necesaria.

Todos los reportes usan `DECIMAL` nativo — nunca convertir a `float` en el camino (riesgo de descuadre de
centavos). En Node, `parseFloat` para presentación es aceptable; para cualquier suma que se compare contra
el libro, sumar en la BD (`SUM()` en Informix) y no en JS.

| # | Reporte / función | Tablas Informix | Equiv. SQL Server | Prioridad |
|---|---|---|---|---|
| 1 | **Balance de comprobación real** (reescribe `balance-legacy`) | `bcadcom`+`bcacomp` (+`bcaccco` nombre) | `dbo.RegistroContable` agregado | 🔴 ALTA |
| 2 | **Mayor auxiliar** (asientos por cuenta + rango de fechas) | `bcadcom`+`bcacomp` | `RegistroContable` filtrado | 🔴 ALTA |
| 3 | **Reconstrucción de comprobante** (cabecera + líneas D/H) | `bcacomp`+`bcadcom` | n/a (no agrupa) | 🔴 ALTA |
| 4 | **Libro diario** (comprobantes por rango/período) | `bcacomp`+`bcadcom` | `RegistroContable` por fecha | 🟠 MEDIA |
| 5 | **Libro mayor / saldo de cuenta a fecha** (acumulado) | `bcadcom`+`bcacomp` | `RegistroContable` acumulado | 🟠 MEDIA |
| 6 | **Reconciliación libro diario vs. `comp_sal_cta`** (auditoría) | `bcadcom` vs `comp_sal_cta` | n/a | 🟡 BAJA |
| 7 | **Balance por período contable** (`bcaperi`) | `bcadcom`+`bcacomp`+`bcaperi` | — | 🟡 BAJA |
| 8 | **Ejecución presupuestaria** (presupuesto vs. real) | `bcavpre`/`bcacpre` vs `bcadcom` | — | 🟡 BAJA |

### 5.1 Propuesta concreta: reescritura de `GET /api/contabilidad/balance-legacy`

Objetivo: que el balance de comprobación se calcule del **libro diario real**, con filtro de período/fecha
(hoy imposible), y que `comp_sal_cta` deje de ser la fuente. Mantener contrato de respuesta compatible
(`cuentas[]`, `totalDebe`, `totalHaber`) para no romper `ReportsView.tsx`.

Consulta Informix propuesta (agrega en la BD, filtra anulados/no-mayorizados, opcional por período):

```sql
SELECT d.dcom_cod_ctas AS cuenta,
       SUM(CASE WHEN d.dcom_cod_tasi = 'D' THEN d.dcom_valor ELSE 0 END) AS debe,
       SUM(CASE WHEN d.dcom_cod_tasi = 'C' THEN d.dcom_valor ELSE 0 END) AS haber
FROM bcadcom d, bcacomp c
WHERE d.dcom_cod_comp = c.comp_cod_comp
  AND c.comp_anulado = 0
  AND c.comp_mayori  = 1
  -- filtros opcionales:
  -- AND c.comp_cod_peri = ?              (período contable, ver bcaperi)
  -- AND c.comp_fec_comp BETWEEN ? AND ?  (rango de fechas)
  -- AND d.dcom_cod_ctas = ?             (una cuenta)
GROUP BY d.dcom_cod_ctas
ORDER BY d.dcom_cod_ctas;
```

Boceto del handler (reemplaza el cuerpo actual; NO implementar aún — fase de mapeo):

```js
// GET /api/contabilidad/balance-legacy?periodo=&desde=&hasta=&cuenta=
app.get('/api/contabilidad/balance-legacy', async (req, res) => {
  const cuenta  = (req.query.cuenta  || '').trim();
  const periodo = (req.query.periodo || '').trim();   // comp_cod_peri (int)
  const desde   = (req.query.desde   || '').trim();   // 'MM/DD/YYYY'
  const hasta   = (req.query.hasta   || '').trim();
  try {
    let q = `SELECT d.dcom_cod_ctas AS cuenta,
                    SUM(CASE WHEN d.dcom_cod_tasi='D' THEN d.dcom_valor ELSE 0 END) AS debe,
                    SUM(CASE WHEN d.dcom_cod_tasi='C' THEN d.dcom_valor ELSE 0 END) AS haber
             FROM bcadcom d, bcacomp c
             WHERE d.dcom_cod_comp = c.comp_cod_comp
               AND c.comp_anulado = 0 AND c.comp_mayori = 1`;
    const p = [];
    if (periodo) { q += ` AND c.comp_cod_peri = ?`; p.push(periodo); }
    if (desde && hasta) { q += ` AND c.comp_fec_comp BETWEEN ? AND ?`; p.push(desde, hasta); }
    if (cuenta)  { q += ` AND d.dcom_cod_ctas = ?`; p.push(cuenta); }
    q += ` GROUP BY d.dcom_cod_ctas ORDER BY d.dcom_cod_ctas`;

    const rows = await queryInformix(q, p);
    const cuentas = rows.map(r => {
      const debe = r.debe != null ? parseFloat(r.debe) : 0;
      const haber = r.haber != null ? parseFloat(r.haber) : 0;
      return { cuenta: r.cuenta, saldoMesDebe: debe, saldoMesHaber: haber,
               saldo: +(debe - haber).toFixed(2), origen: 'INFORMIX' };
    });
    const totalDebe  = cuentas.reduce((s, c) => s + c.saldoMesDebe, 0);
    const totalHaber = cuentas.reduce((s, c) => s + c.saldoMesHaber, 0);
    return res.json({ ok: true, cuentas,
      totalDebe: +totalDebe.toFixed(2), totalHaber: +totalHaber.toFixed(2),
      cuadra: Math.abs(totalDebe - totalHaber) < 0.01, origen: 'INFORMIX',
      nota: 'Balance de comprobación derivado del libro diario real bcacomp/bcadcom.' });
  } catch (err) {
    console.error('[balance-legacy]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});
```

Notas de implementación:
- **Nombre de cuenta**: enriquecer con `bcaccco.ccco_nom_ccon`/`ccco_cod_ccon` cuando el rango de ids esté
  conciliado (§4). Mientras tanto, exponer solo el código numérico o hacer `LEFT JOIN` a `comp_sal_cta` por
  `cod_ctas` como fallback parcial de nombre.
- **Compatibilidad**: se mantienen `saldoMesDebe`/`saldoMesHaber` para no romper el front. Se agrega `cuadra`
  como control de integridad visible.
- **Consideración `comp_sal_cta`**: se puede conservar el endpoint viejo bajo otra ruta
  (`/api/contabilidad/balance-legacy-snapshot`) para auditoría/comparación (reporte #6), pero deja de ser el
  balance principal.

### 5.2 Mayor auxiliar — asientos por cuenta y rango de fechas (reporte #2)

```sql
SELECT c.comp_fec_comp AS fecha, c.comp_cod_tdoc AS tipo, c.comp_num_comp AS numero,
       c.comp_detalle AS detalle, d.dcom_cod_tasi AS dh, d.dcom_valor AS valor
FROM bcadcom d, bcacomp c
WHERE d.dcom_cod_comp = c.comp_cod_comp
  AND d.dcom_cod_ctas = ?
  AND c.comp_anulado = 0
  AND c.comp_fec_comp BETWEEN ? AND ?
ORDER BY c.comp_fec_comp, c.comp_cod_comp;
```
Ruta sugerida: `GET /api/contabilidad/mayor-auxiliar?cuenta=&desde=&hasta=`. Devuelve movimientos + saldo
corrido (acumulado en JS o con función analítica si el motor lo soporta).

### 5.3 Reconstrucción de comprobante completo (reporte #3)

```sql
-- Cabecera
SELECT comp_cod_comp, comp_cod_tdoc, comp_num_comp, comp_fec_comp, comp_beneficia,
       comp_detalle, comp_cod_usua, comp_cod_ofic, comp_anulado, comp_mayori
FROM bcacomp WHERE comp_cod_comp = ?;
-- Líneas
SELECT dcom_cod_dcom, dcom_cod_ctas, dcom_cod_tasi, dcom_valor
FROM bcadcom WHERE dcom_cod_comp = ? ORDER BY dcom_cod_dcom;
```
Ruta sugerida: `GET /api/contabilidad/comprobante/:codComp`. Validar en la respuesta que
`SUM(debe) = SUM(haber)` (control de cuadre por asiento).

### 5.4 Libro diario por período (reporte #4)

```sql
SELECT c.comp_cod_comp, c.comp_fec_comp, c.comp_cod_tdoc, c.comp_num_comp, c.comp_detalle,
       SUM(CASE WHEN d.dcom_cod_tasi='D' THEN d.dcom_valor ELSE 0 END) AS debe,
       SUM(CASE WHEN d.dcom_cod_tasi='C' THEN d.dcom_valor ELSE 0 END) AS haber
FROM bcacomp c, bcadcom d
WHERE d.dcom_cod_comp = c.comp_cod_comp AND c.comp_cod_peri = ? AND c.comp_anulado = 0
GROUP BY c.comp_cod_comp, c.comp_fec_comp, c.comp_cod_tdoc, c.comp_num_comp, c.comp_detalle
ORDER BY c.comp_fec_comp, c.comp_cod_comp;
```

---

## 6. Apéndice — tipos de documento observados (`comp_cod_tdoc`)

Distribución real (2 653 comprobantes): `CDT` 822 (otorgación crédito), `RET` 420 (retención), `DEP` 417
(depósito), `PIS` 395, `DPC` 161, `RPF` 160, `DPF` 91, `NDC` 82, `SCS` 32, `CD` 20, `CI` 18, `TRN` 18,
`MFC` 14, `RNV`/`NC`/`ANX` 1 c/u. El catálogo descriptivo vive en `bcatdoc`.
