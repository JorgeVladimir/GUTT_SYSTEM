# Módulo UAFE / AML — Prevención de Lavado de Activos (Informix legacy `afccajacrediapoyo`)

Generado el 2026-07-14 contra la VM de pruebas (`192.168.1.199:1526`, server `ol_servidor`) con
`db/informix/introspeccion.js` (solo lectura). Consolida el dominio **Prevención de Lavado de Activos /
UAFE** (fila 27 de `MAPA_MODULOS_AFC.md`) desde los 3 lotes del catálogo.

Regulador: **UAFE** (Unidad de Análisis Financiero y Económico del Ecuador) — Ley Orgánica de Prevención,
Detección y Erradicación del Delito de Lavado de Activos. Supervisión prudencial: **SEPS**
(Superintendencia de Economía Popular y Solidaria). Este documento **no toca código de aplicación**; es
insumo de mapeo para la integración read-through hacia el sistema nuevo (SQL Server + React).

Tablas KYC de soporte (`bcaimag`, `bcaocu1→ocu2→ocup`, `bcaorig`) ya están documentadas en
`db/informix/modulos/MODULO_SOCIOS_SOCIOECONOMICO.md` — aquí solo se referencia cómo alimentan los reportes.

---

## 1. Resumen ejecutivo — con nivel de riesgo si NO se implementa

El dominio AML en el legacy tiene **dos capas de madurez muy distintas**, y esta distinción es el hallazgo
central:

- **Capa de reportería periódica a UAFE (RESU) — SÍ existe y tiene datos.** La familia de tablas
  `uaf0..uaf4` es la **estructura de salida del Reporte de Estructuras (RESU)** que la cooperativa envía
  periódicamente a la UAFE: socios, clientes, productos, transacciones y bancos, todas con un único campo
  de corte `uaf_fec_cort`. Son tablas de **staging/output regenerables**, no fuentes de verdad. El último
  corte cargado es **`20210930` (30-sep-2021)** — datos congelados de hace ~5 años; el proceso que las
  puebla no corre en esta VM de pruebas, pero su estructura y semántica quedaron confirmadas con datos
  reales (`uaf3_transacciones` = 19.941 filas, `uaf4_bancos` = 19.883).

- **Capa de monitoreo / detección / screening — estructura presente pero VACÍA (riesgo real).** Las tablas
  de screening contra listas de control (`afchomo` homónimos, `afclhom` bitácora de consultas, `afclcos`
  lista de control por identificación) **existen pero tienen 0 filas** (confirmado en sesión previa). No
  existe **catálogo de Personas Expuestas Políticamente (PEP)** ni listas OFAC/ONU cargadas (ver §3). El
  único dato PEP es un flag booleano por socio (`bcaclie.clie_ban_peps`), sin lista maestra que lo
  respalde ni proceso de screening automatizado. **No hay ninguna tabla de Reporte de Operación Sospechosa
  (ROS/ROII) ni de alertas de umbral**: `uaf3_transacciones` NO es un log de sospechosas (ver §2).

### Nivel de riesgo si el módulo NO se implementa en el sistema nuevo

**RIESGO: ALTO — incumplimiento regulatorio de carácter obligatorio y sancionable.**

| Función | Estado legacy | Riesgo si no se migra/implementa |
|---|---|---|
| Reporte de Estructuras (RESU) a UAFE | Estructura OK, datos 2021 congelados | **ALTO** — omisión de reporte periódico obligatorio. La UAFE sanciona la no-presentación / presentación tardía; la SEPS puede observar el sujeto obligado. |
| Reporte de Operación Inusual/Sospechosa (ROII/ROS) | **No existe** | **ALTO/CRÍTICO** — es obligación legal indelegable del oficial de cumplimiento. Su ausencia total es la brecha más grave. |
| Screening PEP / listas de control | Estructura OK, **vacía** | **ALTO** — sin lista PEP ni proceso de match, el flag `clie_ban_peps` es declarativo y no verificable. |
| Perfil de riesgo AML del socio (debida diligencia) | Insumos dispersos (KYC), sin consolidación | **MEDIO/ALTO** — dificulta la debida diligencia ampliada y la justificación de origen de fondos. |

> Advertencia de cumplimiento: la migración read-through hacia el sistema nuevo **no puede** limitarse a
> "leer" `uaf0..uaf4`, porque esas tablas son un *output* del legacy, no un dominio operativo vivo. El
> sistema nuevo necesita **regenerar** estas estructuras desde sus propias transacciones y, sobre todo,
> **construir la capa de monitoreo/ROS que el legacy nunca tuvo poblada**. Recomiendo validar el alcance
> exacto de estructuras y umbrales vigentes con el Oficial de Cumplimiento y el instructivo UAFE vigente
> (no inventar umbrales aquí: la cifra clásica de USD 10.000 y acumulados debe confirmarse contra la norma
> vigente al momento de implementar).

---

## 2. Tabla consolidada — columnas, relaciones y muestras reales

### 2.1 Familia RESU (estructuras de reporte a UAFE) — `uaf0..uaf4`

Todas comparten el patrón: identificación del cliente (`clie_cod_tide` + `clie_ide_clie`), códigos
regulatorios SIB (`uaf_sib_*`: país, ciudad, oficina, cooperativa, ocupación) y **un único corte
`uaf_fec_cort`**. Confirmado: en la VM sólo existe el corte **`20210930`** (1 sola fecha distinta en las
19.941 filas de `uaf3`), lo que prueba que son **snapshots de un período de reporte**, regenerables, no un
histórico transaccional.

| Tabla | Filas (VM) | Columnas | Propósito confirmado |
|---|---|---|---|
| `uaf0_socios` | 76 | `valor, clie, dpvi` | Estructura de **socios** (formato clave/valor por socio+cuenta vista). |
| `uaf0_socios1` | 146 | (variante de `uaf0_socios`) | Segunda variante/versión de la estructura de socios. |
| `uaf1_clientes` | 11 | `clie_cod_tide, clie_ide_clie, uaf_nom_clie, uaf_sib_pais, uaf_dir_clie, uaf_sib_ciud, uaf_sib_ocup, uaf_val_ingr, uaf_sib_coop, uaf_fec_cort` | Estructura de **clientes** con ocupación (CIUO/SIB, `→ bcaocup`), ingreso declarado (`uaf_val_ingr`) y ubicación. |
| `uaf2_productos` | 16 | `clie_cod_tide, clie_ide_clie, uaf_tip_ctas, uaf_num_cuet, uaf_sib_ofic, uaf_fec_ingr, uaf_sib_coop, uaf_fec_cort` | Estructura de **productos/cuentas** por socio (tipo y número de cuenta, oficina). |
| `uaf3_transacciones` | **19.941** | ver detalle abajo | Estructura de **transacciones** del período (efectivo, cheques, ISD). Núcleo del RESU. |
| `uaf4_bancos` | 19.883 | `uaf_nom_coop, uaf_num_cuet, uaf_sib_pais, uaf_sib_ofic, uaf_sib_ciud, clie_ide_clie, uaf_cod_tran, uaf_num_tran, uaf_val_uaf` | Estructura de **operaciones vía bancos/corresponsales** (una por transacción, casi 1:1 con `uaf3`). |

**FKs / relaciones inferidas:** `clie_ide_clie` → `bcaclie` (socio, por número de identificación, no por
código interno). `uaf_num_cuet`/`uaf_num_ctas` → cuenta a la vista `bcadpvi`. `uaf_sib_ocup` →
`bcaocup` (jerarquía de ocupación CIUO/SIB documentada en `MODULO_SOCIOS_SOCIOECONOMICO.md`).
`uaf_cod_prod` = producto (AHO=ahorros, etc.). Los `uaf_sib_*` son códigos del catálogo regulatorio SIB/SEPS.

#### `uaf3_transacciones` — detalle de columnas (23) y tipos reales

| Columna | Tipo | Rol |
|---|---|---|
| `clie_cod_tide` | CHAR | Tipo de documento de identidad |
| `clie_ide_clie` | CHAR | Nº identificación del socio (cédula/RUC) → `bcaclie` |
| `uaf_nom_clie` | CHAR | Nombre/razón social (denormalizado en el reporte) |
| `uaf_fec_tran` | CHAR (AAAAMMDD) | Fecha de la transacción |
| `uaf_num_tran` | CHAR | Nº de transacción / papeleta |
| `uaf_num_ctas` | CHAR | Nº de cuenta |
| `uaf_val_debi` | **DECIMAL** | Valor débito |
| `uaf_val_cred` | **DECIMAL** | Valor crédito |
| `uaf_val_efec` | **DECIMAL** | Porción en **efectivo** |
| `uaf_val_chqs` | **DECIMAL** | Porción en **cheques** |
| `uaf_val_tota` | **DECIMAL** | Valor total de la transacción |
| `uaf_sib_mone` | CHAR | Moneda (SIB) |
| `uaf_cod_tran` | CHAR | **Código de tipo de transacción** (ver distribución abajo) |
| `uaf_sib_pais` | CHAR | País (SIB), muestra: `EC` |
| `uaf_nom_coop` | CHAR | Nombre cooperativa |
| `uaf_num_cuet` / `uaf_sib_ofic` / `uaf_sib_ciud` / `uaf_sib_coop` | CHAR | Ubicación/producto regulatorio |
| `uaf_fec_cort` | CHAR (AAAAMMDD) | **Corte del reporte** (único: `20210930`) |
| `uaf_cod_prod` | CHAR | Producto, muestra: `AHO` |
| `uaf_cod_csw` | CHAR | Código canal/switch |
| `uaf_imp_isd` | INTEGER | Impuesto Salida de Divisas aplicado |

> Corrección al catálogo del lote 3: los campos `uaf_val_*` **no** son CHAR — son **DECIMAL** (coltype 5);
> `uaf_imp_isd` es INTEGER. Sólo los identificadores y códigos SIB son CHAR.

**Muestra real (5 de 8 filas, corte 20210930):**

| clie_ide_clie | uaf_nom_clie | uaf_cod_tran | uaf_val_tota | uaf_val_efec | uaf_cod_prod | uaf_sib_pais |
|---|---|---|---|---|---|---|
| 0992892528001 | UNICASH S A | 37 | 400 | 0 | AHO | EC |
| 0992892528001 | UNICASH S A | 37 | 1 | 0 | AHO | EC |
| 0992892528001 | UNICASH S A | 37 | 120 | 0 | AHO | EC |
| 0992892528001 | UNICASH S A | 37 | 1.500 | 0 | AHO | EC |
| 0992892528001 | UNICASH S A | 37 | 200 | 0 | AHO | EC |

**Distribución por `uaf_cod_tran` (19.941 filas):**

| cod_tran | n | min val_tota | max val_tota |
|---|---|---|---|
| 37 | 19.208 | 0 | 20.000 |
| 36 | 302 | 0 | 74.700 |
| 21 | 181 | 50 | 74.700 |
| 22 | 181 | 50 | 74.700 |
| 03 | 40 | 126 | 88.799 |
| 71 | 25 | 1.100 | 20.000 |
| 13 | 3 | 2.620 | 6.351 |
| 11 | 1 | 56.120 | 56.120 |

#### Propósito CONFIRMADO de `uaf3_transacciones`

Es la **estructura de detalle transaccional del Reporte de Estructuras (RESU) para la UAFE de un período de
corte** — NO un log de operaciones sospechosas. Evidencia:

1. **No tiene ninguna columna de flag** de "reportado", "sospechoso", "umbral superado", "alerta" ni estado
   de gestión. Sólo describe la transacción y su clasificación regulatoria.
2. **Contiene valores por debajo de cualquier umbral** (`uaf_val_tota` = 0, 1, 120, 200…). Un log de
   umbral/sospechosas nunca incluiría transacciones de USD 1. Por tanto es un **espejo filtrado por período
   y por producto/tipo reportable**, no por monto sospechoso.
3. **Un solo `uaf_fec_cort`** para las ~20k filas ⇒ es un snapshot de generación periódica, se regenera y
   reemplaza en cada envío, no acumula histórico transaccional operativo.

### 2.2 Screening / listas de control (estructura presente, **VACÍAS**)

| Tabla | Filas | Columnas | Propósito |
|---|---|---|---|
| `afchomo` | **0** | `homo_nom_tide, homo_ide_homo, homo_ape_homo, homo_nom_homo, homo_nac_homo, homo_fec_carg, homo_fec_fina` | Lista de **homónimos** para screening de nombres contra listas de control (OFAC/ONU/PEP). Vacía. |
| `afclhom` | **0** | `lhom_cod_lhom, lhom_fec_lhom, lhom_ide_homo, lhom_cod_usua` | Bitácora de consultas realizadas contra la lista de homónimos. Vacía. |
| `afclcos` | **0** | `lcos_tid_lcos, lcos_ide_lcos, lcos_nom_lcos, lcos_fec_inic, lcos_fec_fina, lcos_ban_lcos` | Lista de control de personas por tipo+nº de identificación, con vigencia (screening/bloqueo). Vacía. |
| `bcafsal` | (lote 1) | `fsal_cod_clie, fsal_cod_csal, fsal_fec_ingr, fsal_fec_sali` | Ficha de situación del socio (entrada/salida de un estado, p.ej. inclusión en lista de control). |

### 2.3 `afcauid` — NO es AML (aclaración solicitada)

`afcauid` es el **catálogo de autoidentificación étnica** (dato demográfico SEPS/KYC), **no** pertenece al
dominio AML. Confirmado con datos:

| auid_cod_auid | auid_des_auid | auid_ban_auid |
|---|---|---|
| 1 | Indigena | 1 |
| 2 | Afroecuatoriano | 1 |
| 3 | Mestizo | 1 |
| 4 | Montubio | 1 |
| 5 | Blanco | 1 |
| 6 | Otros | 1 |

Columnas: `auid_cod_auid` (SERIAL/PK), `auid_des_auid` (CHAR desc), `auid_cod_sib` (código regulatorio SIB,
vacío en la data), `auid_ban_auid` (SMALLINT activo). Pertenece al **ficha socioeconómica / reportes
demográficos regulatorios**, ya cubierto en `MODULO_SOCIOS_SOCIOECONOMICO.md`. Se referencia aquí sólo para
cerrar el hallazgo previo: **descartado como tabla AML**.

---

## 3. Hallazgo sobre lista PEP (Personas Expuestas Políticamente)

**NO existe un catálogo/lista maestra de PEP en el legacy Informix.** Búsqueda exhaustiva en
`INVENTARIO_TABLAS.md`, los 3 lotes del catálogo y `systables` (patrones `%pep%`, `%homo%`, `%lcos%`,
`%lhom%`, `uaf%`): no aparece ninguna tabla de personas expuestas políticamente ni listas OFAC/ONU/GAFI.

Lo que SÍ existe:

- **`bcaclie.clie_ban_peps`** (confirmado): un **flag booleano por socio** en la tabla maestra de clientes.
  Es el único dato PEP del legacy — declarativo, sin lista maestra que lo respalde ni proceso de match
  contra fuentes externas.
- La infraestructura de **screening** (`afchomo`, `afclhom`, `afclcos`) existe estructuralmente pero está
  **vacía** (0 filas), por lo que en la práctica **no hay screening PEP/listas operativo**.

**Equivalente en el sistema nuevo (SQL Server): tampoco existe como catálogo.** Sólo se propaga el flag:

- `dbo.RegistroSocios.PEPS BIT` (default 0) — `db/sqlserver/09_denominaciones_y_reporte_cajas.sql`.
- `dbo.ClientesInformix.BanderaPeps SMALLINT` + staging `clie_ban_peps` — `04_integracion_clientes_informix.sql`,
  `05_cargar_staging_clientes_desde_csv.sql` (se importa el flag desde `bcaclie.clie_ban_peps`).

**Conclusión:** ni el legacy ni el sistema nuevo tienen catálogo PEP ni motor de screening; ambos sólo
arrastran un flag booleano. **Es una brecha de cumplimiento que debe cerrarse con un catálogo PEP + listas
de control + proceso de match**, no simplemente migrando el bit.

---

## 4. Mapa de reportes / funciones que este módulo DEBERÍA exponer

Prioridad ponderada por riesgo legal (obligación UAFE/SEPS). "Equiv. sistema nuevo" verificado contra
`db/sqlserver/` — salvo el flag PEP, **no existe nada**.

| # | Reporte / función | Tablas legado que lo alimentan | Equiv. en sistema nuevo | Prioridad |
|---|---|---|---|---|
| 1 | **RESU — Reporte de Estructuras a UAFE** (socios, clientes, productos, transacciones, bancos por corte) | `uaf0_socios(1)`, `uaf1_clientes`, `uaf2_productos`, `uaf3_transacciones`, `uaf4_bancos` (regenerados desde `bcamov`/`bcadpvi`/`bcacred`/`bcaclie`/`bcaocup`) | **No existe** | **CRÍTICA** — reporte periódico obligatorio; su omisión es sancionable por UAFE/SEPS. |
| 2 | **ROII / ROS — Reporte de Operación Inusual/Sospechosa** | **Ninguna** (no existe tabla; se construiría sobre `bcamov` + reglas de umbral/comportamiento) | **No existe** | **CRÍTICA** — obligación indelegable del Oficial de Cumplimiento; es la brecha más grave del legacy. |
| 3 | **Reporte de operaciones sobre umbral (efectivo/acumulado)** | `uaf3_transacciones` (`uaf_val_efec`, `uaf_val_chqs`, `uaf_val_tota`, `uaf_cod_tran`) + `bcamov` en vivo | **No existe** | **ALTA** — control detectivo básico; umbral exacto a confirmar con norma UAFE vigente. |
| 4 | **Screening PEP / listas de control** (match de socios contra PEP/OFAC/ONU) | `bcaclie.clie_ban_peps`, `afchomo`, `afclcos`, `afclhom`, `bcafsal` (hoy vacías) | Sólo flag `PEPS`/`BanderaPeps` (sin lista ni motor) | **ALTA** — requiere catálogo PEP + listas + proceso de match; hoy inexistente en ambos sistemas. |
| 5 | **Perfil de riesgo AML / debida diligencia del socio** (KYC + origen de fondos + ocupación + ingreso + PEP + transaccionalidad esperada vs real) | `bcaorig` (origen fondos), `bcaocu1→ocu2→ocup` (ocupación CIUO), `uaf1_clientes.uaf_val_ingr` (ingreso), `bcaclie.clie_ban_peps`, `bcatvin` (partes relacionadas), `bcaimag` (firma/foto/cédula) | **No existe** (insumos KYC parciales) | **MEDIA/ALTA** — habilita debida diligencia ampliada y justificación de origen de fondos. |
| 6 | **Bitácora / trazabilidad de consultas de screening** (auditoría del Oficial de Cumplimiento) | `afclhom` + audit trail nativo `track_01/02/03` | **No existe** | **MEDIA** — soporta la auditoría SEPS del proceso de cumplimiento. |

**Reportes propuestos: 6.**

---

## Nota de mapeo (para el equipo de integración)

- `uaf0..uaf4` son **output regenerable**, no dominio operativo: el sistema nuevo debe **producir** estas
  estructuras desde sus propias transacciones, no "leerlas" del legacy (los datos están congelados en 2021).
- La capa de **detección/ROS/screening está ausente o vacía** en el legacy: es desarrollo nuevo, no
  migración. Ponderar como cumplimiento obligatorio, no como "nice to have".
- Antes de fijar umbrales o formatos de estructura, **validar con el Oficial de Cumplimiento y el
  instructivo UAFE vigente**; este documento no fija cifras normativas para no arrastrar supuestos.
