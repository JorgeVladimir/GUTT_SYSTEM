# Módulo DPF — Depósitos a Plazo Fijo (Informix legacy → sistema nuevo)

Consolidación a fondo del dominio **Depósitos a Plazo Fijo** del core AFC (Informix
`afccajacrediapoyo`), para la fase de mapeo del proyecto read-through hacia el sistema nuevo
(SQL Server `SQLGUTPATATE` + React).

Fuentes fusionadas:
- `db/informix/INVENTARIO_TABLAS.md` §3 (master `bcadpfi`, catálogo `bcaedpf`, y la tabla de
  relacionadas con roles inferidos).
- `db/informix/CATALOGO_MODULOS_lote1.md` §7 (`bcadepg`, `bcadeip`, `bcadbpf`, `bcacrau`, `bcaanpf`).
- `db/informix/CATALOGO_MODULOS_lote3.md` (`afcgaul` = DPF pignorado como garantía autoliquidable).
- **Introspección nueva** (2026-07-13, vía `db/informix/introspeccion.js --sql`) de `syscolumns`
  para las tablas que solo tenían nombre+rol inferido: `afchdpf`, `bcaplaz`, `bcafppf`, `bcattpf`,
  `bcatmpf`, `bcapgpf`, `bcaprpf`, `bcarvpf`, `bcaanpf`, `bcadbpf`, `bcadepg`, `bcadeip`, `bcacrau`,
  `afcgaul`, y re-introspección completa de `bcadpfi`.
- Integración ya en producción: `server.js` → `buscarDPFInformix()` (líneas ~237-281) y endpoints
  `/api/dpf*` (~3727-4130). Esquema nuevo: `db/sqlserver/19_plazo_fijo_seps.sql`.

Mapeo `coltype` Informix (código base; `+256` = variante `NOT NULL`):
`0=CHAR, 1=SMALLINT, 2=INTEGER, 3=FLOAT, 5=DECIMAL, 6=SERIAL, 7=DATE, 10=DATETIME, 13=VARCHAR`.
Convención de nombres AFC: prefijo de 4 letras repetido por columna; `xxxx_cod_yyyy` = FK a la tabla
cuyo prefijo es `yyyy`.

---

## 1. Resumen ejecutivo

- El dominio DPF en Informix está compuesto por **16 tablas**: 1 master (`bcadpfi`), 1 catálogo de
  estados (`bcaedpf`), 4 catálogos de configuración (`bcaplaz`, `bcafppf`, `bcattpf`, `bcatmpf`),
  1 histórico de renovaciones (`afchdpf`), 1 tabla de renovaciones enlazadas (`bcarvpf`), 5 tablas
  del ciclo de **pago de interés** (`bcapgpf`, `bcadepg`, `bcadeip`, `bcaprpf`, `bcadbpf`), 1 de
  retención automática a cuenta vista (`bcacrau`), 1 de anotaciones (`bcaanpf`) y 1 de DPF pignorado
  como garantía de crédito (`afcgaul`).
- **Lo que ya se integró** (`buscarDPFInformix`): SOLO el master `bcadpfi` con join a `bcaclie`, con
  el estado mapeado con un diccionario hardcodeado `{1:ACTIVO, 2:VENCIDO, 3:CANCELADO}`. Se usa como
  fallback read-through en `GET /api/dpf` cuando hay término de búsqueda y el socio no existe aún en
  SQL Server. **No se integró nada del ciclo de interés, renovaciones ni forma de pago.**
- **Hallazgos que corrigen documentación previa** (confirmados por muestreo real):
  1. `bcattpf` **NO es "tipo de DPF"** como se infirió en el inventario. Es el **tipo de tasa**:
     `{1:TASA NOMINAL, 2:TASA EFECTIVA, 0:TASA DESCUENTO}`.
  2. `bcafppf` es la **forma de pago del interés** y sus valores reales son
     `{1:AL VENCIMIENTO, 2:INICIO DE OPERACION, 3:EN PAGOS PARCIALES}`, no "mensual/al vencimiento".
     Se enlaza al tipo de tasa vía `fppf_cod_ttpf`.
  3. `bcadpfi` tiene columnas que el inventario no listó y que son clave para el ciclo:
     `dpfi_cod_fppf` (forma de pago), `dpfi_npg_inte` (nº de pagos de interés pactados),
     `dpfi_por_rete` (% retención en la fuente), `dpfi_plz_recl` (plazo de reclamo), `dpfi_cod_sect`.
  4. `bcatmpf` existe pero está **vacía** en el ambiente de test y su semántica no se pudo confirmar
     (2 columnas CHAR: `tmpf_cod_tmpf`, `tmpf_des_tmpf`). Se documenta como pendiente.
- **Riesgo de integridad a vigilar**: el master legacy `bcadpfi` **no guarda** el interés
  proyectado/liquidado ni la retención como columnas propias — el detalle monetario del interés vive
  en `bcapgpf`/`bcadeip`/`bcaprpf`. El esquema nuevo `dbo.DepositosPlazo` sí materializa
  `InteresProyectado`, `RetencionProyectada`, `InteresLiquidado`, etc. Al reconciliar, la fuente de
  verdad del interés efectivamente pagado es la cadena `bcapgpf→bcadepg→bcadeip`, no el master.

---

## 2. Tabla consolidada de todas las tablas del dominio DPF

Leyenda de origen de columnas: **[INV]** ya en el inventario · **[NEW]** introspección nueva 2026-07-13
· **[L1]** lote1 · **[L3]** lote3.

### 2.1 Master y estados

| Tabla | Columnas (tipo) | Rol | FKs / notas |
|---|---|---|---|
| **`bcadpfi`** [INV+NEW] | `dpfi_cod_dpfi` (SERIAL NN, PK) · `dpfi_num_dpfi` (INT NN, nº póliza/certificado) · `dpfi_cod_ofic` (INT NN) · `dpfi_cod_caja` (CHAR NN) · `dpfi_cod_mone` (INT NN) · `dpfi_cod_clie` (INT NN) · `dpfi_fec_inic` (DATE NN, apertura) · `dpfi_plz_dpfi` (INT NN, plazo días) · `dpfi_tas_dpfi` (DEC NN, tasa) · `dpfi_val_dpfi` (DEC NN, capital) · `dpfi_cod_fppf` (INT NN, forma de pago) · `dpfi_npg_inte` (INT NN, nº pagos de interés) · `dpfi_cod_pape` (INT, papeleta apertura) · `dpfi_cod_edpf` (INT NN, estado) · `dpfi_fec_deve` (DATE NN, vencimiento) · `dpfi_det_dpfi` (CHAR, glosa) · `dpfi_nom_bene` (CHAR, beneficiario) · `dpfi_plz_recl` (INT, plazo reclamo) · `dpfi_por_rete` (DEC, % retención) · `dpfi_cod_sect` (INT, sector) | **Master del DPF**: una fila por póliza/certificado | `cod_clie→bcaclie`, `cod_edpf→bcaedpf`, `cod_fppf→bcafppf`, `cod_ofic`, `cod_mone` |
| **`bcaedpf`** [INV] | `edpf_cod_edpf` · `edpf_des_edpf` | Catálogo de estados. Datos reales: `1=ACTIVO, 2=VENCIDO, 3=CANCELADO` | — |

### 2.2 Catálogos de configuración

| Tabla | Columnas (tipo) | Rol | Datos reales / notas |
|---|---|---|---|
| **`bcaplaz`** [NEW] | `plaz_cod_plaz` (SERIAL NN, PK) · `plaz_cod_mone` (INT NN) · `plaz_ini_plaz` (INT NN) · `plaz_fin_plaz` (INT NN) · `plaz_cod_modu` (INT) | Catálogo de **rangos de plazo** (días desde/hasta) por moneda y módulo | Equivalente conceptual a los tramos de `dbo.TasasPlazoFijo` |
| **`bcafppf`** [NEW+muestra] | `fppf_cod_fppf` (INT NN) · `fppf_cod_ttpf` (INT) · `fppf_des_fppf` (CHAR) | **Forma de pago del interés** | `1=AL VENCIMIENTO, 2=INICIO DE OPERACION, 3=EN PAGOS PARCIALES`. FK `cod_ttpf→bcattpf` |
| **`bcattpf`** [NEW+muestra] | `ttpf_cod_ttpf` (INT NN) · `ttpf_des_ttpf` (CHAR) | **Tipo de tasa** (corrige "tipo de DPF" del inventario) | `1=TASA NOMINAL, 2=TASA EFECTIVA, 0=TASA DESCUENTO` |
| **`bcatmpf`** [NEW] | `tmpf_cod_tmpf` (CHAR) · `tmpf_des_tmpf` (CHAR) | Catálogo relacionado a DPF, **semántica no confirmada** | Tabla **vacía** en test. Pendiente confirmar (posible "tipo de movimiento PF") |

### 2.3 Renovaciones e histórico

| Tabla | Columnas (tipo) | Rol | FKs / notas |
|---|---|---|---|
| **`afchdpf`** [NEW] | `hdpf_cod_hdpf` (SERIAL NN, PK) · `hdpf_cod_dpfi` (INT) · `hdpf_cod_clie` (INT) · `hdpf_val_dpfi` (DEC) · `hdpf_plz_hdpf` (INT) · `hdpf_val_inte` (DEC) · `hdpf_val_prov` (DEC, interés provisionado) · `hdpf_cod_ofic` (INT) · `hdpf_fec_hdpf` (DATETIME, sello) · `hdpf_est_dpfi` (INT) · `hdpf_fec_venc` (DATE) · `hdpf_fec_inic` (DATE) · `hdpf_tas_hdpf` (DEC) · `hdpf_plz_orig` (INT, plazo original) | **Histórico de estados/renovaciones** de un DPF: una foto por evento con capital, plazo, tasa, interés e interés provisionado | `cod_dpfi→bcadpfi`, `cod_clie→bcaclie` |
| **`bcarvpf`** [NEW] | `rvpf_cod_dpfi` (INT NN) · `rvpf_dpfi_ante` (INT NN, DPF anterior) · `rvpf_val_incr` (DEC NN, incremento capitalizado) | **Enlace de renovación**: vincula la póliza nueva con la anterior y el capital incrementado | `cod_dpfi→bcadpfi` (nuevo), `dpfi_ante→bcadpfi` (previo) |

### 2.4 Ciclo de pago de interés

| Tabla | Columnas (tipo) | Rol | FKs / notas |
|---|---|---|---|
| **`bcapgpf`** [NEW] | `pgpf_cod_pgpf` (SERIAL NN, PK) · `pgpf_cod_dpfi` (INT NN) · `pgpf_num_pgpf` (INT NN, nº de cuota de interés) · `pgpf_cod_rubr` (INT NN) · `pgpf_fec_inic` (DATE NN) · `pgpf_fec_fina` (DATE NN) · `pgpf_val_pgpf` (DEC NN, monto interés del período) · `pgpf_cod_edpf` (INT NN, estado del pago) · `pgpf_cod_pape` (INT, papeleta) | **Cronograma/generación de pagos de interés**: una fila por período de interés a pagar (proyectado y luego marcado como pagado) | `cod_dpfi→bcadpfi`, `cod_edpf→bcaedpf`, `cod_rubr` |
| **`bcadepg`** [L1+NEW] | `depg_cod_depg` (SERIAL NN, PK) · `depg_cod_pgpf` (INT NN) · `depg_cod_tfpg` (INT NN, forma de pago del abono) · `depg_cod_tran` (INT NN) · `depg_val_depg` (DEC NN) · `depg_cod_caja` (CHAR NN) · `depg_fec_pago` (DATE NN) · `depg_ban_depg` (INT) | **Pago de interés efectivamente realizado** por caja (liquida una fila de `bcapgpf`) | `cod_pgpf→bcapgpf`, `cod_tfpg`, `cod_tran` |
| **`bcadeip`** [L1+NEW] | `deip_cod_pgpf` (INT NN) · `deip_cod_prms` (INT NN) · `deip_cod_tran` (INT NN) · `deip_fec_pape` (DATETIME NN) · `deip_val_dpii` (DEC NN, interés puro pagado) · `deip_val_ipro` (DEC, interés provisionado) | **Detalle del interés pagado**: separa interés puro (`dpii`) de interés provisionado (`ipro`) | `cod_pgpf→bcapgpf`, `cod_prms`, `cod_tran` |
| **`bcaprpf`** [NEW] | `prpf_cod_pgpf` (INT NN) · `prpf_fec_prpf` (DATETIME NN) · `prpf_cod_tasi` (CHAR, tipo asiento D/H) · `prpf_val_prpf` (DEC NN, monto retención) · `prpf_cod_tdoc` (CHAR, tipo doc) · `prpf_num_tdoc` (INT NN, nº comprobante) | **Comprobante/retención en la fuente** asociado a un pago de interés (rendimientos financieros) | `cod_pgpf→bcapgpf`, `cod_tdoc` |
| **`bcadbpf`** [L1+NEW] | `dbpf_cod_depg` (INT NN) · `dbpf_cod_dpvi` (INT NN) · `dbpf_cod_tran` (INT NN) · `dbpf_val_dbpf` (DEC NN) | **Acreditación del interés a cuenta vista**: débito/abono del pago DPF hacia la cuenta de ahorros del socio | `cod_depg→bcadepg`, `cod_dpvi→bcadpvi` |

### 2.5 Auxiliares

| Tabla | Columnas (tipo) | Rol | FKs / notas |
|---|---|---|---|
| **`bcacrau`** [L1+NEW] | `crau_cod_dpfi` (INT NN) · `crau_cod_rubr` (INT NN) · `crau_cod_dpvi` (INT NN) | **Retención/acreditación automática** configurada del DPF hacia una cuenta vista o rubro (destino por defecto del interés) | `cod_dpfi→bcadpfi`, `cod_dpvi→bcadpvi`, `cod_rubr` |
| **`bcaanpf`** [INV+NEW] | `anpf_cod_dpfi` (INT NN) · `anpf_des_anpf` (CHAR 200) · `anpf_cod_usua` (INT) | **Anotaciones/observaciones** sobre una póliza (bitácora libre por usuario) | `cod_dpfi→bcadpfi`, `cod_usua→bcausua` |
| **`afcgaul`** [L3+NEW] | `gaul_cod_gaul` (SERIAL NN, PK) · `gaul_num_gtia` (INT) · `gaul_fec_gaul` (DATE) · `gaul_cod_usua` (INT) · `gaul_val_gaul` (DEC) · `gaul_cod_dpfi` (INT) · `gaul_val_dpfi` (DEC) · `gaul_fec_inic` (DATE) · `gaul_fec_fina` (DATE) | **Garantía autoliquidable**: DPF pignorado como garantía de un crédito (bloquea su liquidación) | `cod_dpfi→bcadpfi`, `num_gtia→bcagtia` |

---

## 3. Ciclo de vida completo del DPF y tablas que lo soportan

```
  APERTURA ──► DEVENGO / PAGOS DE INTERÉS ──► [RENOVACIÓN] ──► LIQUIDACIÓN / CANCELACIÓN
```

### Etapa 1 — Apertura
- **Tablas**: `bcadpfi` (alta del master: capital `val_dpfi`, tasa `tas_dpfi`, plazo `plz_dpfi`,
  forma de pago `cod_fppf`, nº pagos de interés `npg_inte`, % retención `por_rete`, estado inicial
  `cod_edpf=1` ACTIVO). `bcapgpf` se **genera aquí** con el cronograma de N pagos de interés
  (`npg_inte` filas), cada una con `fec_inic`/`fec_fina` y `val_pgpf` proyectado. Opcionalmente
  `bcacrau` define a qué cuenta vista (`bcadpvi`) se acreditará el interés.
- **Catálogos usados**: `bcaplaz` (validar rango de plazo), `bcafppf`/`bcattpf` (forma de pago y tipo
  de tasa).
- Equivalente nuevo: `dbo.DepositosPlazo` (INSERT vía `usp_GenerarIDDepositoPlazo`) +
  `dbo.AsientosContablesDPF` (TipoOperacion=`APERTURA`).

### Etapa 2 — Devengo y pagos periódicos de interés
- **Tablas**: por cada período pactado, `bcapgpf` (fila del cronograma) se liquida generando
  `bcadepg` (pago realizado por caja), `bcadeip` (detalle: interés puro `val_dpii` vs. provisionado
  `val_ipro`), `bcaprpf` (retención en la fuente sobre el rendimiento) y `bcadbpf` (acreditación neta
  a la cuenta vista del socio). El estado del pago se refleja en `pgpf_cod_edpf`.
- **Histórico**: `afchdpf` guarda la foto de interés/provisión (`val_inte`, `val_prov`) por evento.
- Equivalente nuevo: **PARCIAL** — `dbo.DepositosPlazo` solo materializa `InteresProyectado` /
  `InteresNetoProyectado` a la apertura; **no existe tabla de pagos de interés periódicos** en el
  esquema nuevo (el modelo nuevo asume mayormente `AL_VENCIMIENTO`). Los pagos parciales del legacy
  no tienen destino en SQL Server hoy → net-new si se quieren mostrar.

### Etapa 3 — Renovación
- **Tablas**: `bcarvpf` enlaza la póliza nueva (`rvpf_cod_dpfi`) con la anterior (`rvpf_dpfi_ante`) y
  registra el incremento de capital capitalizado (`rvpf_val_incr`). `afchdpf` acumula la foto
  histórica de cada renovación (plazo original `plz_orig`, tasa, fechas). El master anterior queda en
  estado no-activo y se crea/actualiza el nuevo `bcadpfi`.
- Equivalente nuevo: **PARCIAL** — `dbo.DepositosPlazo` tiene `NumeroRenovacion`, `DepositoOrigenID`
  y estado `RENOVADO`, pero **no hay tabla de histórico** equivalente a `afchdpf` (solo la cadena por
  `DepositoOrigenID`). Endpoint existente: `POST /api/dpf/:id/renovar`.

### Etapa 4 — Liquidación al vencimiento / Cancelación anticipada
- **Tablas**: el pago final del capital + último interés reutiliza la cadena
  `bcapgpf→bcadepg→bcadeip→bcaprpf→bcadbpf`; el master pasa a `cod_edpf=3` (CANCELADO). Si el DPF está
  pignorado (`afcgaul` con `fec_fina` abierta), **no debe poder liquidarse** hasta liberar la
  garantía → control de integridad a replicar.
- Equivalente nuevo: `dbo.DepositosPlazo` (campos `FechaLiquidacion`, `InteresLiquidado`,
  `RetencionAplicada`, `PenalizacionAplicada`) + `dbo.AsientosContablesDPF`
  (`LIQUIDACION` / `CANCELACION_ANTICIPADA`). Endpoints: `POST /api/dpf/:id/liquidar`,
  `POST /api/dpf/:id/cancelar`.

---

## 4. Mapa de reportes / funciones que el módulo debería exponer

Prioridad según: valor para reconciliación con el legacy, exposición de datos hoy invisibles, y peso
regulatorio (SEPS / SRI-LORTI).

### Prioridad ALTA

| # | Reporte / función | Tablas Informix que lo alimentan | ¿Existe equivalente nuevo? | Notas |
|---|---|---|---|---|
| 1 | **Ficha completa de un DPF (read-through enriquecido)** — extiende `buscarDPFInformix` para traer forma de pago, tipo de tasa, nº de pagos de interés, % retención y beneficiario legibles | `bcadpfi` + `bcaedpf` + `bcafppf` + `bcattpf` | **Parcial**: `buscarDPFInformix` trae solo el master con estado hardcodeado; `dbo.DepositosPlazo` es net para socios legacy | Hoy el fallback ignora `cod_fppf`/`npg_inte`/`por_rete`. Bajo esfuerzo, alto valor |
| 2 | **Historial de pagos de interés de un DPF** — cronograma vs. pagos realizados, con interés puro, provisión y retención por período | `bcapgpf` + `bcadepg` + `bcadeip` + `bcaprpf` (+ `bcadbpf` para ver acreditación) | **Net-new**: no hay tabla de pagos periódicos en SQL Server | El dato más ausente del sistema nuevo. Imprescindible para DPF con pago parcial/mensual |
| 3 | **Cadena de renovaciones de una póliza** — árbol de póliza original → renovaciones con capital capitalizado y tasas por tramo | `bcarvpf` + `afchdpf` + `bcadpfi` | **Parcial**: cadena por `DepositoOrigenID`/`NumeroRenovacion`, sin histórico de montos/tasas | Permite reconstruir la trazabilidad completa que hoy se pierde |
| 4 | **Retenciones en la fuente sobre rendimientos financieros (LORTI 2%)** — comprobantes de retención emitidos por pago de interés, para conciliación SRI/ATS | `bcaprpf` + `bcapgpf` + `dpfi_por_rete` (+ cruce con `bcadrtr` del módulo SRI) | **Net-new** en el dominio DPF nuevo (solo se guarda `RetencionAplicada` al liquidar) | Peso regulatorio (Art. 37 LORTI). Alta por compliance |

### Prioridad MEDIA

| # | Reporte / función | Tablas Informix que lo alimentan | ¿Existe equivalente nuevo? | Notas |
|---|---|---|---|---|
| 5 | **Próximos vencimientos con forma de pago configurada** — vencimientos por rango de fechas, mostrando modalidad (al vencimiento / pagos parciales) y destino de acreditación | `bcadpfi` + `bcafppf` + `bcacrau` + `bcadpvi` | **Parcial**: `GET /api/dpf/vencimientos` existe pero sobre datos SQL Server, sin la forma de pago legacy | Subir a ALTA si se opera cartera legacy en vivo |
| 6 | **Cuadre de intereses causados vs. pagados (provisión)** — interés provisionado (`val_prov`/`val_ipro`) contra interés efectivamente pagado (`val_dpii`), por DPF y por período | `bcapgpf` + `bcadeip` + `afchdpf` | **Net-new** | Insumo para conciliar cuenta contable 2503 (Int. por Pagar) del CUC SEPS |
| 7 | **DPF pignorados como garantía autoliquidable** — pólizas bloqueadas como garantía de crédito, con vigencia y valor pignorado | `afcgaul` + `bcadpfi` + `bcagtia` | **Net-new** | Control de integridad: impide liquidar un DPF pignorado. Relevante para cartera de crédito |
| 8 | **Acreditaciones de interés a cuenta de ahorros** — trazar cada abono de interés DPF que entró a una cuenta vista del socio | `bcadbpf` + `bcadepg` + `bcadpvi` | **Net-new** | Cruza módulo DPF con Ahorro a la Vista |

### Prioridad BAJA

| # | Reporte / función | Tablas Informix que lo alimentan | ¿Existe equivalente nuevo? | Notas |
|---|---|---|---|---|
| 9 | **Bitácora de anotaciones de una póliza** — observaciones libres por usuario | `bcaanpf` (+ `bcausua`) | **Net-new** | Bajo volumen; útil para soporte/auditoría cualitativa |
| 10 | **Reconciliación de catálogos de configuración** — comparar tramos de plazo/tasa/forma de pago legacy vs. `dbo.TasasPlazoFijo` | `bcaplaz` + `bcattpf` + `bcafppf` | **Equivalente existe**: `dbo.TasasPlazoFijo` | Verificación de paridad de parametría, una sola vez / periódica |
| 11 | **Retención automática configurada por DPF** — destino por defecto del interés (cuenta vista / rubro) | `bcacrau` | **Net-new** (implícito en `CuentaAhorrosRelacionada`) | Se solapa parcialmente con #5; documentar antes de decidir si amerita reporte propio |

---

## Notas de integridad para la fase de implementación (no cambiar código aún)

1. **Fuente de verdad del interés**: reconciliar siempre contra `bcapgpf→bcadepg→bcadeip`, no contra
   columnas del master `bcadpfi` (que no las tiene). El esquema nuevo materializa proyecciones en la
   apertura; pueden divergir del interés realmente pagado.
2. **Estados hardcodeados**: `buscarDPFInformix` mapea estados con un diccionario literal. `bcaedpf`
   solo tiene 3 estados en test; el sistema nuevo maneja 5 (`ACTIVO/VENCIDO/LIQUIDADO/CANCELADO/RENOVADO`).
   El legacy no distingue LIQUIDADO de CANCELADO ni marca RENOVADO explícitamente en `bcaedpf` — se
   infiere por `bcarvpf`/`afchdpf`. A resolver en el mapeo de estados.
3. **Precisión decimal**: todos los montos legacy son `DECIMAL` Informix; mantener `DECIMAL(15,2)` en
   SQL Server y nunca float en el bridge (`buscarDPFInformix` hoy hace `parseFloat` — aceptable para
   solo-lectura de display, pero cualquier cálculo/suma debe hacerse en decimal, no en JS number).
4. **Bloqueo por garantía**: `afcgaul` con `fec_fina` nula/futura = DPF pignorado. Cualquier función de
   liquidación read-through debe señalar esta condición.
```
