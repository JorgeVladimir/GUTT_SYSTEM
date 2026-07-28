# Módulo Reportes Regulatorios SEPS / SIB — Informix legacy (`afccajacrediapoyo`)

Documento consolidado del dominio **Reportería Regulatoria** del core AFC (fila 16 del `MAPA_MODULOS_AFC.md`).
Reúne las tablas catalogadas en `CATALOGO_MODULOS_lote1.md` §15, `CATALOGO_MODULOS_lote2.md` (bloque `bcaindi`
/ `bcarsib`), `CATALOGO_MODULOS_lote3.md` §6, y verifica el contenido real de `bcaindi` (fórmulas
PERLAS/solvencia) con **consultas reales** contra la VM de pruebas (`192.168.1.199:1526`, server `ol_servidor`)
vía `db/informix/introspeccion.js`. Fase de **solo documentación** — no se modifica código de aplicación.

Fecha de verificación: 2026-07-13.
Regulador: **SEPS** (Superintendencia de Economía Popular y Solidaria del Ecuador). El marco de indicadores
legacy conserva nomenclatura de la ex-Superintendencia de Bancos (**SIB**), heredada antes de que las COAC
migraran a la SEPS.

---

## 1. Resumen ejecutivo

El módulo regulatorio del core Informix está construido sobre tres capas que se apoyan en el libro diario real
(`bcacomp`/`bcadcom`, ver `MODULO_CONTABILIDAD.md`):

1. **Capa de balance regulatorio** — traduce el plan de cuentas interno (`bcaccco.ccco_cod_ctas`) al **Catálogo
   Único de Cuentas SEPS** (`ccco_cod_ccon`, ej. `110105`, `1401`, `2101`) y materializa saldos por cuenta
   regulatoria y mes en `bcarb11` (`rb11_val_sald`). Es la fuente que alimenta absolutamente todo lo demás.
2. **Capa de estructura de reportes** — define *qué cuentas SEPS entran en cada rubro* de cada reporte:
   `bcaesfe`/`bcaeesf` (Estado de Situación Financiera), `bcaesep` (estructura de cartera con banderas por
   tipo: refinanciada/reestructurada/etc.), `bcarsib` (esquemas XML de los archivos SIB-SEPS), `bcadtac`
   (layout de archivo plano regulatorio).
3. **Capa de indicadores** — `bcaindi` (22 indicadores verificados) + `bcatind` (6 categorías) contienen las
   **fórmulas** de solvencia, calidad de activos, liquidez, rentabilidad y liquidez estructural, expresadas como
   cociente de dos expresiones sobre códigos SEPS `{NNNN}`. Es el corazón analítico del módulo y el hallazgo
   más rico de esta catalogación (detalle en §3).

**Hallazgo de cobertura (lo más importante para la migración):** el sistema nuevo (SQL Server + React) hoy
expone en `ReportsView.tsx` cuatro reportes (`sp_r_bal_compro`, `sp_r_situa_gene`, `sp_sepsb11`,
`sp_uaf_matriz`) que **leen las tablas nuevas** (`dbo.RegistroContable`, `dbo.Creditos`), no el legacy. Ninguno
reproduce los entregables SEPS reales: **no existe Estado de Situación Financiera por cuenta SEPS, no existe
ningún cálculo de indicadores PERLAS/solvencia, y `sp_sepsb11` es un stub** (`GROUP BY Estado` sobre un string,
no la estructura B11 con banderas de cartera). Son entregables **obligatorios por ley** para una COAC
ecuatoriana; su ausencia es riesgo de incumplimiento, no de conveniencia (§5).

---

## 2. Tabla consolidada del dominio regulatorio

Leyenda de origen: **L1/L2/L3** = lote de catalogación.

### 2.1 Balance regulatorio (puente contabilidad → SEPS)

| Tabla | Columnas clave | Rol | Relaciones | Origen |
|---|---|---|---|---|
| `bcaccco` | `ccco_cod_ctas` (id interno PK), **`ccco_cod_ccon`** (código SEPS: `110105`, `1401`…), `ccco_nom_ccon`, `ccco_cod_tcue` | **Plan de cuentas** — traduce id interno ↔ código regulatorio SEPS | `cod_ctas`←`bcadcom` | L1 |
| `bcarb11` | `rb11_cod_ctas`, **`rb11_cod_ccon`**, `rb11_mes_rb11`, **`rb11_val_sald`**, `rb11_fec_rep` | **Balance regulatorio (RB)** — saldo por cuenta SEPS y mes. Puente materializado contabilidad↔SEPS | `cod_ccon` SEPS | L2 |
| `bcadvar` | `dvar_cod_vari`, `dvar_ani_dvar`, `dvar_mes_dvar`, `dvar_val_dvar` | Valores mensuales de variables/indicadores (histórico de resultados calculados y parámetros ej. inflación) | `cod_vari` | L1 |

> El código SEPS `cod_ccon` es la clave que conecta todo el módulo: las fórmulas de `bcaindi` referencian
> `{cod_ccon}`, y la estructura de todos los reportes agrupa por `cod_ccon`. El saldo de cada `cod_ccon` se
> obtiene agregando `bcadcom` (libro diario) → traducido vía `bcaccco.ccco_cod_ctas → ccco_cod_ccon`, y se
> materializa en `bcarb11`.

### 2.2 Estado de Situación Financiera (ESF)

| Tabla | Columnas clave | Rol | Relaciones | Origen |
|---|---|---|---|---|
| `bcaesfe` | `esfe_des_esfe`, `esfe_cod_ccon`, `esfe_cod_grup`, `esfe_ban_efec/inve/fina/oper`, `esfe_ban_igcl`, `esfe_ban_utpr` | **Estructura del ESF** — mapea cuentas SEPS `cod_ccon` a rubros del balance (ej. "Fondos disponibles", "Inversiones"). Las banderas clasifican efectivo/inversión/financiamiento/operativo | `cod_ccon`; `cod_grup`→`bcagrup` | L1 |
| `bcaeesf` | `eesf_cod_esfe`, `eesf_cod_esac`, `eesf_des_eesf`, **`eesf_val_eesf`** | **Valores del ESF por período** (valor pre-calculado por rubro) | `cod_esfe`→`bcaesfe`, `cod_esac` | L1 |
| `bcagrup` | `grup_cod_grup`, `grup_des_grup` | Catálogo de grupo genérico (agrupador de rubros del ESF) | — | L1 |

### 2.3 Estructura de cartera y reportes SEPS

| Tabla | Columnas clave | Rol | Relaciones | Origen |
|---|---|---|---|---|
| `bcaesep` | `esep_des_esep`, `esep_ban_caso`, `esep_cas_ccon`, **`esep_ban_rele/rees/repa/appa/reac/reej`** + cuentas asociadas | **Estructura del reporte SEPS de cartera** — banderas por tipo de cartera: reestructurada (`rees`), refinanciada, reprogramada (`repa`), casos especiales (`caso`), etc. | cuentas `ccon` | L1 |
| `bcarsib` | `rsib_cod_rsib` (SERIAL PK), `rsib_des_rsib`, `rsib_fec_rsib`, `rsib_tip_rsib`, `rsib_nom_clas`, `rsib_sib_rsib`, `rsib_cod_modu`, **`rsib_xsi_sche`** | **Definición de estructuras/reportes SIB-SEPS** (esquema XML `xsi_sche`, clase generadora `nom_clas`). Motor de generación de archivos regulatorios | `cod_modu` | L2 |
| `bcadtac` | `dtac_cod_tafi`, `dtac_num_dtac`, `dtac_nom_dtac`, `dtac_abr_dtac` | **Layout de archivo plano regulatorio** (definición de campos del archivo de estructura) | `cod_tafi` | L1 |
| `bcaffin` | `ffin_dec_ffin`, `ffin_sib_ffin` | Catálogo de forma de financiamiento (código SIB) | — | L1 |
| `bcaesrf` | `esrf_cod_esrf`, `esrf_nom_esrf` | Catálogo de estado/tipo de reporte financiero | — | L1 |

### 2.4 Indicadores financieros (PERLAS / límites de riesgo)

| Tabla | Columnas clave | Rol | Relaciones | Origen |
|---|---|---|---|---|
| `bcaindi` | `indi_cod_indi` (SERIAL PK), `tind_cod_tind`→`bcatind`, `indi_nom_indi` (nombre del ratio), `indi_nom1_indi`/**`indi_for1_indi`** (numerador: nombre + fórmula), `indi_nom2_indi`/**`indi_for2_indi`** (denominador), `indi_val_indi` (DEC, valor calculado), `indi_val_tend`, `indi_des_indi` | **Indicadores financieros regulatorios** — cada fila es un ratio = fórmula1 / fórmula2 sobre códigos SEPS `{NNNN}`. 22 filas verificadas | `tind_cod_tind`→`bcatind` | L2 |
| `bcatind` | `tind_cod_tind` (PK), `tind_des_tind` (SOLVENCIA / CALIDAD DE ACTIVOS / LIQUIDEZ / RENTABILIDAD / LIQUIDEZ ESTRUCTURAL), `tind_nom_tind` ("LIMITES DE RIESGO"), `tind_cod_dmon` | **Catálogo de categoría de indicador** (6 categorías verificadas) | — | L2 |

### 2.5 Formularios regulatorios genéricos (variante `afc`)

| Tabla | Columnas clave | Rol | Origen |
|---|---|---|---|
| `afcfval` | `fval_cod_fval`, `fval_cod_form`, `fval_cam_31 … fval_cam_922` (≈145 columnas `cam_NNN`, casi todas DEC) | **Valores de formularios regulatorios** — una fila por reporte, columnas = casilleros numerados del formulario. Genérica multi-formulario (`cod_form`) | L3 |
| `afcfval_103` | `fval_cod_fval`, `fval_cod_form`, `fval_cam_101…307` | Variante para el formulario 103 (retenciones en la fuente — SRI, no SEPS) | L3 |
| `afctope` | `tope_cod_tope`, `tope_des_tope`, `tope_sib_tope`, `tope_cod_segm` | Catálogo de topes/segmentos SEPS (segmento de la cooperativa) | L3 |
| `afcedad` | `edad_cod_edad`, `edad_des_desc`, `edad_val_inic`, `edad_val_fina` | Catálogo de rangos etarios (reportes demográficos regulatorios) | L3 |
| `afccrie` | `crie_cod_crie`, `crie_des_crie`, `crie_sib_crie` | Catálogo de calificación de riesgo (código regulatorio SIB) | L3 |
| `uaf3_transacciones` | `clie_ide_clie`, `uaf_fec_tran`, `uaf_num_tran`, `uaf_val_debi/cred/efec/chqs/tota`, `uaf_cod_tran`, `uaf_sib_pais`, `uaf_imp_isd` | **Estructura del reporte de transacciones a la UAFE** (efectivo, cheques, ISD). Todo CHAR = layout de archivo plano | L3 |

---

## 3. `bcaindi` con datos reales — metodología PERLAS / límites de riesgo

`bcaindi` tiene **22 indicadores** (`SELECT COUNT(*)` verificado) organizados en **6 categorías** (`bcatind`).
Cada indicador es un **cociente de dos fórmulas** (numerador `for1` / denominador `for2`), donde cada fórmula
es una suma algebraica de saldos de cuentas del Catálogo Único SEPS, referenciadas como `{cod_ccon}`.

### 3.1 Sintaxis de las fórmulas (verificada)

- `{NNNN}` = saldo de la cuenta SEPS `cod_ccon`. Admite prefijos de cualquier nivel: `{1}` (Activo total),
  `{14}` (Cartera de créditos), `{1401}` (Cartera comercial prioritario por vencer), `{130105}` (cuenta de
  6 dígitos). El motor resuelve el saldo agregando el balance regulatorio (`bcarb11` / agregación de `bcadcom`).
- Aritmética estándar `+ - * /` y ponderaciones `* 20 / 100` (factores de riesgo).
- **Condicionales**: sintaxis `[ \ (condición , valor_si , valor_no)]`, anidable. Variable de contexto `@mes`
  (número de mes). Ejemplo real (indicador 1, componente del Patrimonio Técnico Constituido):
  `[ \ (@mes = 12 , (0) , [ \ (({5} - {4}) > 0 , ({5}-{4})*50/100 , ({5}-{4})*100/100)])]`
  → "en diciembre (cierre) no computes el resultado del ejercicio; en meses intermedios, si hay utilidad
  (`{5}` ingresos − `{4}` gastos > 0) computa el 50%, si hay pérdida computa el 100%". Regla clásica de
  inclusión del resultado del ejercicio en el patrimonio técnico.
- `indi_val_indi` (valor calculado) está **NULL en esta VM** → el motor de cálculo no ha corrido aquí, o los
  resultados históricos viven en `bcadvar`. Las **fórmulas sí están pobladas** y son el activo reutilizable.

### 3.2 Los 22 indicadores por categoría, mapeados a PERLAS

`bcatind` es el marco de **"Límites de Riesgo" de la SEPS** (boletines financieros), que se alinea casi 1:1 con
la metodología **PERLAS** de WOCCU. Mapeo:

| `tind` | Categoría (bcatind) | Indicadores `bcaindi` (verificados) | Letra PERLAS |
|---|---|---|---|
| 1 | **SOLVENCIA** | 1 SOLVENCIA (Patrimonio Técnico Primario / Activos Ponderados por Riesgo), 2 y 19 ACTIVOS FIJOS / PTC | **P** (Protección) + **E** (Estructura financiera) |
| 2 | **CALIDAD DE ACTIVOS** | 3 MOROSIDAD AMPLIADA (global), 4–12 morosidad por segmento (Productivo, Comercial Ordinario/Prioritario, Consumo Ordinario/Prioritario, Educativo, Vivienda Interés Público, Inmobiliario, Microcrédito), 13 PARTICIPACIÓN ACTIVOS IMPRODUCTIVOS, 14 PARTICIPACIÓN DE CARTERA DE CRÉDITO | **A** (Calidad de Activos) |
| 3 | **LIQUIDEZ** | 15 INDICADOR DE LIQUIDEZ = `({11}+{13}) / ({2101}+{2103})` (Fondos disponibles + Inversiones sobre Depósitos vista + plazo) | **L** (Liquidez) |
| 4 | **RENTABILIDAD** | 16 GRADO DE ABSORCIÓN DEL MARGEN FINANCIERO, 17 **ROA** = `({5}-{4}) / {1}`, 18 EFICIENCIA INSTITUCIONAL EN COLOCACIÓN | **R** (Rendimiento/Rentabilidad) |
| 5 | CALIDAD DE ACTIVOS (categoría declarada, sin indicadores activos en esta VM) | — | **A** |
| 6 | **LIQUIDEZ ESTRUCTURAL** | 20 PRIMERA LÍNEA, 21 y 22 SEGUNDA LÍNEA (numeradores/denominadores extensos de decenas de cuentas `{130105}`…) | **L** (Liquidez estructural — reporte específico SEPS) |

**Cobertura PERLAS resultante:**
- **P (Protección):** parcial — cubierta indirectamente vía Patrimonio Técnico (solvencia). No se observó un
  indicador dedicado de *provisiones / cartera en riesgo* como ratio independiente.
- **E (Estructura financiera eficaz):** parcial — participación de cartera (14) y activos improductivos (13),
  solvencia. No hay ratios de estructura de captaciones/patrimonio como % de activo total.
- **R (Rendimiento y costos):** ✅ cubierta (ROA, grado de absorción, eficiencia en colocación).
- **L (Liquidez):** ✅ cubierta y fuerte (liquidez simple + liquidez estructural primera/segunda línea).
- **A (Calidad de activos):** ✅ cubierta y muy detallada (morosidad ampliada global + por 9 segmentos).
- **S (Señales de crecimiento):** ❌ **NO cubierta** — `bcaindi` no contiene ningún indicador de crecimiento
  (variación de activos, cartera, socios, depósitos período a período). Es la brecha PERLAS más clara.

### 3.3 Ejemplos de fórmulas reales (textuales)

- **Indicador 1 — SOLVENCIA** (`Patrimonio Técnico / Activos Ponderados por Riesgo`):
  - Numerador (PTC): `(({31}+{3301}+{3302}+{3303}+{34}+{35}+{3601}+{3602})*100/100) + (({3603})*50/100) + (({3604})*100/100) + [condicional resultado ejercicio]`
  - Denominador (APR): pondera activos por factor de riesgo — `{1307}*20/100`, cartera `({1301}+{1303}+{1305}+{1403}+{1408})*50/100`, resto al 100%.
- **Indicador 15 — LIQUIDEZ:** `({11}+{13}) / ({2101}+{2103})`.
- **Indicador 17 — ROA:** `({5}-{4}) / {1}`.
- **Indicador 3 — MOROSIDAD AMPLIADA:** numerador = suma de todas las cuentas de cartera que no devenga
  interés + vencida por segmento; denominador = cartera bruta total (decenas de `{14xx}`).

---

## 4. Relación del ESF con el libro diario real (`bcacomp`/`bcadcom`)

**El ESF NO se recalcula en vivo desde el libro diario: es un valor pre-calculado y almacenado, pero derivable
del libro diario mediante la estructura de mapeo.** La cadena es:

```
bcadcom (líneas debe/haber del asiento)                 ← libro diario transaccional (fuente de verdad)
   │  agregado por cuenta interna dcom_cod_ctas
   ▼
bcaccco (ccco_cod_ctas → ccco_cod_ccon)                 ← traduce id interno a código SEPS
   │  agregado por cod_ccon
   ▼
bcarb11 (rb11_val_sald por cod_ccon y mes)              ← balance regulatorio materializado (saldo SEPS/mes)
   │  mapeado a rubros del balance según banderas
   ▼
bcaesfe (estructura: qué cod_ccon entra en cada rubro)
   │  valores por período
   ▼
bcaeesf (eesf_val_eesf)                                 ← ESF pre-calculado, listo para presentar/reportar
```

`bcaesfe` es **estructura** (qué cuentas componen "Fondos disponibles", "Inversiones", etc.) y `bcaeesf`
guarda el **valor** por rubro y período (`eesf_val_eesf`) — es decir, un snapshot materializado. Las mismas
fórmulas `{cod_ccon}` de `bcaindi` consumen esta misma capa de saldos regulatorios.

**Implicación de integridad para la migración:** como los saldos regulatorios se materializan (`bcarb11`,
`bcaeesf`), existe riesgo de **desincronización** entre el ESF guardado y el libro diario vivo si el proceso de
materialización no corre tras cada mayorización. Esto es análogo al hallazgo de `MODULO_CONTABILIDAD.md` §4
sobre `comp_sal_cta` (snapshot desincronizado del libro diario). **Recomendación:** todo reporte SEPS que se
reconstruya en el sistema nuevo debe calcularse agregando el libro diario real filtrado por
`comp_anulado = 0 AND comp_mayori = 1` y traducido por `cod_ccon`, y reconciliarse periódicamente contra los
snapshots legacy (`bcarb11`/`bcaeesf`), **nunca leer el snapshot como fuente de verdad**.

> ⚠️ **Bloqueante conocido (heredado de `MODULO_CONTABILIDAD.md` §4):** en la VM de pruebas, `bcadcom` y
> `comp_sal_cta` referencian `cod_ctas` en rango 22000–26000, que **no existe** en `bcaccco` (rango 1098–2200).
> El JOIN `bcadcom → bcaccco → cod_ccon` devuelve vacío en este ambiente. Hasta conciliar cuál es el plan de
> cuentas canónico en producción, **ningún reporte SEPS derivado del libro diario producirá `cod_ccon` válidos
> en esta VM**. Es lo primero que hay que resolver antes de construir cualquiera de los reportes de §5.

---

## 5. Mapa de reportes / funciones que el módulo debería exponer

Estado actual en el sistema nuevo (verificado en `ReportsView.tsx` + `server.js` líneas 495–584): 4 reportes
que **leen SQL Server nuevo**, no el legacy Informix. Criterio de prioridad: **cumplimiento SEPS es obligatorio
por ley** para una COAC ecuatoriana; el riesgo de incumplimiento pesa más que la frecuencia de uso.

| # | Reporte / función | Tablas Informix que lo alimentan | ¿Equivalente hoy? | Prioridad |
|---|---|---|---|---|
| 1 | **Estado de Situación Financiera SEPS (ESF)** — balance por cuenta SEPS `cod_ccon` y rubro | `bcaesfe`+`bcaeesf` (estructura/valor) ó derivado `bcadcom`→`bcaccco`→`bcarb11` | `sp_r_situa_gene` es un *agregado de socios/ahorros*, NO el ESF por cuenta. **Net-new real** | 🔴 ALTA (obligatorio) |
| 2 | **Indicadores PERLAS / Límites de Riesgo SEPS** — solvencia, morosidad, liquidez, rentabilidad, liquidez estructural | `bcaindi`+`bcatind` (fórmulas), saldos vía `bcarb11`/`bcadcom` por `cod_ccon` | **Net-new. No existe ningún cálculo de indicadores hoy** | 🔴 ALTA (obligatorio) |
| 3 | **Reporte de cartera por tipo** — refinanciada / reestructurada / reprogramada / castigada / vencida | `bcaesep` (banderas `rees/repa/reac/reej/appa`) + cartera | `sp_sepsb11` es un **stub** (`GROUP BY Estado` sobre string, sin banderas SEPS). Requiere reescritura | 🔴 ALTA (obligatorio) |
| 4 | **Estructura B11 real / generador de archivo regulatorio** (XML/plano SIB-SEPS) | `bcarsib` (`xsi_sche`) + `bcadtac` (layout) + cartera | Solo el stub `sp_sepsb11`. Motor de generación **net-new** | 🔴 ALTA (obligatorio) |
| 5 | **Liquidez estructural (primera/segunda línea)** — reporte específico semanal SEPS | `bcaindi` `tind=6` (ind. 20–22) | **Net-new** | 🔴 ALTA (obligatorio) |
| 6 | **Matriz UAFE** — transacciones en efectivo/cheque ≥ umbral, ISD | `uaf3_transacciones` (layout real) | `sp_uaf_matriz` existe pero es aproximación (asientos ≥ $5000 de `RegistroContable`, no la estructura UAFE). Reescribir sobre estructura real | 🔴 ALTA (obligatorio) |
| 7 | **Balance regulatorio (RB) por `cod_ccon` y mes** — insumo de todos los anteriores | `bcarb11` | Net-new (habilitador técnico) | 🟠 MEDIA |
| 8 | **Morosidad por segmento** (vista analítica dedicada, subconjunto de #2) | `bcaindi` `tind=2` (ind. 3–14) | Net-new; complementa `ReportsSociosCreditos.tsx` (que hoy calcula morosidad ad-hoc en JS por `status`) | 🟠 MEDIA |
| 9 | **Señales de crecimiento (PERLAS "S")** — variación período a período de activos/cartera/depósitos/socios | Derivado de `bcarb11`/`bcadvar` (no hay fórmula pre-cargada) | **Brecha PERLAS**: ni el legacy ni el nuevo lo cubren | 🟡 BAJA |
| 10 | **Histórico de variables/indicadores mensuales** | `bcadvar` (`dvar_val_dvar` por año/mes) | Net-new (tendencias) | 🟡 BAJA |

### 5.1 Notas de implementación (para cuando pase a fase de construcción)

- **Precisión monetaria:** todos los saldos son `DEC` en Informix. Agregar y comparar **en la base de datos**
  (`SUM()`), nunca sumar centavos en JS; `parseFloat` solo para presentación. Cualquier ratio de `bcaindi` debe
  calcularse con decimales, jamás con enteros ni `float` binario.
- **Motor de fórmulas (`bcaindi`):** el reporte #2 requiere un pequeño intérprete que (a) resuelva `{cod_ccon}`
  contra los saldos regulatorios, (b) evalúe aritmética y los condicionales `[ \ (cond , a , b)]` con la
  variable `@mes`. Es lógica reutilizable: 22 fórmulas ya están escritas y no deben re-derivarse a mano (riesgo
  de error de cálculo regulatorio).
- **Filtro contable canónico:** los saldos SEPS se derivan del libro diario con `comp_anulado = 0 AND
  comp_mayori = 1` (ver `MODULO_CONTABILIDAD.md` §3.5).
- **Ubicación sugerida en el frontend:** una nueva pestaña maestra "REPORTES SEPS" en `ReportsView.tsx` (junto a
  FICHA/SITUACION/BI/FINANCIAL) o un componente `ReportsSEPS.tsx` dedicado; los indicadores PERLAS encajan como
  panel de tarjetas + tabla, reutilizando el patrón de `SITUACION`.
- **Reconciliación obligatoria:** cada reporte debe exponer un control de cuadre visible (ej. Activo = Pasivo +
  Patrimonio en el ESF; suma de segmentos = total en morosidad) para detectar desincronización de snapshots.
