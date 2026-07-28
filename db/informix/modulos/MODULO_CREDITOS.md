# Módulo Créditos / Cartera / Riesgo — Informix legacy `afccajacrediapoyo`

Documento consolidado del dominio **Créditos / Cartera / Riesgo-Provisiones / Cobranza de cartera** del
core AFC (cooperativa de ahorro y crédito, Ecuador, regulada por la **SEPS**). Sintetiza y fusiona tres
fuentes ya levantadas contra la VM de pruebas (`192.168.1.199:1526`, base `afccajacrediapoyo`):

- `db/informix/INVENTARIO_TABLAS.md` — master `bcacred` (76 col.) + catálogos base.
- `db/informix/CATALOGO_MODULOS_lote1.md` §1 (Créditos/Cartera) — tablas `bca*` de amortización, estados, calificación, comisiones.
- `db/informix/CATALOGO_MODULOS_lote3.md` §1 (Créditos), §2 (Riesgo/Provisiones), §3 (Cobranza) — tablas `afc*`.

Índice general de contexto: `db/informix/MAPA_MODULOS_AFC.md` (este módulo es el #2 de ~29).

> **Alcance de la fase:** solo documentación/mapeo. No se toca código de la aplicación. La implementación
> read-through viene en una ronda posterior.

---

## 1. Resumen ejecutivo

El crédito en AFC se modela con un **master** (`bcacred`, un registro por operación) del que cuelgan
varios sub-dominios que cubren todo el ciclo de vida:

**Originación → Desembolso → Amortización → Calificación/Mora → Cobranza → Castigo/Refinanciamiento.**

Puntos clave del hallazgo:

- **La tabla de amortización real es `bcadivc`** (7004 cuotas para 302 de 304 créditos ≈ 99% de cobertura).
  Su "gemela" `afcddic` (lote3) **está vacía** en este ambiente — ver §3 para la resolución de la
  superposición.
- El sistema tiene un **motor de calificación de cartera y provisiones** completo (`bcacalf`, `bcaccre`,
  `afcbrco`, `afccavo`, `afcdrie`) — de **alto valor regulatorio SEPS** (provisiones, buckets de mora).
- Existe **audit trail de reliquidaciones** (`afchdir`, `afcdcal`) y de **cambios de estado del crédito**
  (`afccrce`), más un **snapshot histórico tipo buró interno** (`afchicr`).
- Hay un **módulo de gestión de cobranza** (`afcgcab`/`afcgccr`/`afcgdco`) con snapshots de cartera vencida
  (aging: capital/interés/mora/días de atraso).

**Estado de la integración actual (`server.js › buscarCreditosInformix`):** hoy solo se lee `bcacred` (el
master) como fallback en `GET /api/socios/buscar`. Devuelve monto original, tasa, plazo, fechas y tipo,
pero con `balance: null`, `installments: []`, `planDisponible: false` y `status` = código crudo sin
traducir. **Todo el detalle de amortización, saldo vigente, calificación y mora está sin mapear** — es
justamente lo que este documento prioriza para la siguiente ronda (ver §4).

---

## 2. Tabla consolidada de tablas del dominio

Fusiona inventario + lote1 + lote3 sin duplicar. Convención de nombres AFC: prefijo de 3-4 letras repetido
por columna; `xxxx_cod_yyyy` = FK a la tabla de prefijo `yyyy`. FKs recurrentes omitidas por brevedad:
`cod_clie → bcaclie`, `num_cred → bcacred`, `cod_dpvi → bcadpvi`, `cod_dpfi → bcadpfi`,
`cod_usua → bcausua`, `cod_ofic → oficina`, `cod_ctas/cod_ccon → plan de cuentas`.

### A. Master y definición del crédito

| Tabla | Fuente | Rol en el ciclo de vida | Columnas / relaciones clave |
|---|---|---|---|
| `bcacred` ★ | Inventario | **Master del crédito** (originación→vida completa). 1 fila por operación (76 col.) | PK `cred_num_cred`; `cred_cod_clie`, `cred_ide_titu`, `cred_nom_titu`, codeudor `cred_*_covt`; `cred_cap_cred` (capital), `cred_tas_cred`/`cred_tas_tea`, `cred_num_cuot`, `cred_fec_inic`/`_venc`/`_pago`, `cred_por_mora`/`cred_con_mora`; FKs `cod_ecre` (estado), `cod_tcre` (tipo), `cod_tamo` (amortización), `cod_tgar`, `cod_lcre` (línea); `cred_cod_calf` (calificación A-1…) |
| `bcadfcr` | lote1 §1 | **Plantilla/definición de producto** (originación) — valores por defecto para nuevas operaciones | `dfcr_cap_cred`, `dfcr_tas_cred`, `dfcr_num_cuot`, `cod_tamo`, `cod_lcre`, `cod_dtcr`, `cod_ccre` |
| `bcaobcr` | Inventario | Ingresos/egresos declarados del solicitante (originación — capacidad de pago) | `obcr_num_cred`, `obcr_ing_obcr`, `obcr_egr_obcr`, `obcr_ptr_obcr` |

### B. Amortización / cuotas / pagos

| Tabla | Fuente | Rol en el ciclo de vida | Columnas / relaciones clave |
|---|---|---|---|
| `bcadivc` ★ | lote1 §1 | **Tabla de amortización REAL (vigente)** — 1 fila por cuota/dividendo, proyectado vs pagado. **7004 filas / 302 créditos** | PK `divc_num_divc`; `divc_num_cred`, `divc_cod_ediv` (estado cuota), `divc_fec_venc`/`divc_fec_pago`, `divc_cap_divc`/`divc_cap_pago` (capital proyectado/pagado), `divc_tas_divc`, `divc_int_plaz`/`divc_int_deve`/`divc_int_paga` (interés al plazo/devengado/pagado) |
| `afcddic` | lote3 §1 | **Tabla de cuotas alternativa — VACÍA (0 filas)**. Esquema más rico (desglosa mora, seguro desgravamen, otros) pero no poblada. Ver §3 | `ddic_num_divc`, `ddic_num_cred`, `ddic_fec_divc`, `ddic_cod_ediv`, `ddic_cap_divc`, `ddic_int_plaz`, `ddic_int_deve`, `ddic_val_mora`, `ddic_val_segd` (seguro desgravamen), `ddic_val_otro` |
| `bcaabdv` | lote1 §1 | **Abono a dividendo** — cada pago aplicado a una cuota, por rubro, con saldo resultante (amortización) | `abdv_cod_divc → bcadivc`, `abdv_cod_rubr`, `abdv_val_abdv`, `abdv_sal_abdv`, `abdv_cod_pape` (papeleta caja), `abdv_cod_pago`, `abdv_fec_abdv` |
| `bcadirb` | lote1 §1 | Detalle de rubros por dividendo (valor, saldo disponible, pagado) — desglose de qué compone la cuota | `dirb_cod_divc`, `dirb_cod_rubc`, `dirb_val_dirb`, `dirb_val_sadi`, `dirb_val_paga` |
| `bcadetd` | lote1 §1 | Detalle de deuda por rubro/dividendo (desglose de deuda) | `detd_num_cred`, `detd_cod_divc`, `detd_cod_rubc`, `detd_val_detd`, `detd_des_detd` |
| `afcsacr` | lote3 §1 | Saldo/abono puntual asociado a un crédito | `sacr_num_cred`, `sacr_val_sacr` |
| `bcacpcr` | Inv/lote1 | Vincula el crédito a la cuenta de depósito vista donde se debitan las cuotas | `cpcr_num_cred`, `cpcr_cod_dpvi → bcadpvi`, `cpcr_val_cpcr` |
| `bcadbau` | lote1 §1 | Débito automático de cuota crédito ↔ cuenta vista | `dbau_num_cred`, `dbau_cod_dpvi` |

### C. Estados e historial del crédito

| Tabla | Fuente | Rol en el ciclo de vida | Columnas / relaciones clave |
|---|---|---|---|
| `afccrce` | Inv/lote3 §1 | **Historial de cambios de estado del crédito** (estado anterior→actual + saldo) — traza mora/cartera vencida | `crce_num_cred`, `crce_ecr_ante`, `crce_ecr_actu`, `crce_sal_cred`, `crce_fec_crce`, `crce_cod_pape` |
| `afchdir` | lote3 §1 | **Historial de recálculo de dividendos/rubros** (valor anterior→recalculado) — trazabilidad de reliquidaciones | `hdir_cod_divc`, `hdir_cod_rubr`, `hdir_val_ante`, `hdir_val_dirb`, `hdir_fec_hdir`, `hdir_est_hdir` |
| `afcdcal` | lote3 §1 | Calificación/recálculo por dividendo (interés y devengado a fecha de corte) | `dcal_num_cred`, `dcal_fec_calf`, `dcal_num_divc`, `dcal_val_dcal`, `dcal_val_inte`, `dcal_val_deve`, `dcal_cod_ediv` |
| `afchicr` | lote3 §1 | **Snapshot histórico del crédito por cliente** (buró/central de riesgos interna) | `hicr_num_cred`, `hicr_cod_clie`, `hicr_des_ecre`, `hicr_des_ccre`, `hicr_cap_cred`, `hicr_cod_calf`, `hicr_dia_venc`, `hicr_val_inte`, `hicr_val_mora` |
| `bcacrrl` | lote1 §1 | **Créditos relacionados / castigados / refinanciados** (valor, estado, orden de cobro) | `crrl_num_cred`, `crrl_cod_clie`, `crrl_val_crrl`, `crrl_est_crrl`, `crrl_cod_prdr`, `crrl_cod_orco` |
| `afcdecr` | Inv/lote3 §1 | Documentos/archivos adjuntos al expediente de crédito | `decr_num_cred`, `decr_cod_deop`, `decr_nom_arch`, `decr_fec_ingr` |

### D. Calificación de cartera / riesgo / provisiones (alto valor SEPS)

| Tabla | Fuente | Rol en el ciclo de vida | Columnas / relaciones clave |
|---|---|---|---|
| `bcacalf` ★ | lote1 §1 | **Calificación de cartera y cálculo de provisiones por crédito** (calificación→mora) | `calf_num_cred`, `calf_sal_cred`, `calf_val_prov`, `calf_cod_ccre`, `calf_val_venc`, `calf_dias_venc`, `calf_val_mora`, `calf_est_calf`, `calf_por_pcon` (% provisión constituida) |
| `bcaccre` | lote1 §1 | Categoría de crédito / calificación → mapea a cuentas contables normal/vencido/riesgo | `ccre_des_ccre`, `ccre_sib_ccre`, `ccre_nor_ccon`, `ccre_ven_ccon`, `ccre_rie_ccon` |
| `afcbrco` ★ | lote3 §2 | **Bandas de provisión por buckets de días de mora** (7/15/30/60/90/180/360/∞) por segmento | `brco_val_7…brco_val_99999`, `brco_cod_ineg` (segmento/línea negocio), `brco_esc_brco` |
| `afcbrec` | lote3 §2 | Bandas de recuperación esperada por segmento | `brec_val_brec`, `brec_cod_ineg`, `brec_val_band`, `brec_esc_brec` |
| `afccavo` | lote3 §2 | Calificación de activos de riesgo en 5 tramos (fondo/calificación/provisión) por fecha de reproceso *(vacía en test)* | `cavo_val_fon1..5`, `cavo_val_cal1..5`, `cavo_val_pro1..5`, `cavo_fec_repr` |
| `afcdrie` | lote3 §2 | Evaluación de riesgo del **cliente** por categoría (`riec`) y segmento (`ineg`) | `drie_cod_clie`, `drie_cod_riec`, `drie_cod_ineg`, `drie_val_drie`, `drie_est_drie` |
| `afcdrso` | lote3 §2 | Evaluación de riesgo del **socio garante** (mismo esquema que `afcdrie`) | `drso_cod_socr`, `drso_cod_drie`, `drso_cod_riec`, `drso_val_drso` |
| `afcddri` | lote3 §2 | Detalle/ponderación de cada factor de riesgo evaluado | `ddri_cod_drie`, `ddri_val_ddri`, `ddri_val_pond`, `ddri_ref_ddri` |

### E. Cobranza de cartera (gestión de cobro)

| Tabla | Fuente | Rol en el ciclo de vida | Columnas / relaciones clave |
|---|---|---|---|
| `afcgcab` | lote3 §3 | Cabecera de corrida/lote de gestión de cobranza | `gcab_cod_gcab`, `gcab_fec_gcab`, `gcab_cod_usua` |
| `afcgccr` ★ | lote3 §3 | **Detalle de gestión de cobranza por crédito** (snapshot de deuda vencida: aging) | `gccr_cod_gcab → afcgcab`, `gccr_num_cred`, `gccr_val_capi`/`_inte`/`_mora`/`_deud`, `gccr_fec_venc`, `gccr_num_dias` (días atraso), `gccr_sal_cred`, `gccr_est_calf` |
| `afcgdco` | lote3 §3 | Gestión de cobro individual (contacto/compromiso de pago) | `gdco_num_cred`, `gdco_cod_clie`, `gdco_cod_esta`, `gdco_cod_tipo`, `gdco_det_gdco`, `gdco_val_gdco`, `gdco_ant_gtes → afcgtes`, `gdco_fec_comp` |

> **Nota:** cobranza judicial/coactiva (`bcaabog`, `bcaejui`, `afclcoa`, `afclcos`) pertenece al módulo #4
> del mapa general; se cruza con crédito vía `num_cred`/`cod_clie` pero se documenta en su propio módulo.

### F. Garantías vinculadas al crédito (puente — módulo #3 tiene el detalle)

| Tabla | Fuente | Rol | Columnas / relaciones clave |
|---|---|---|---|
| `bcagtcr` | Inv/lote1 | Relación N:N crédito↔garantía con valor asignado | `gtcr_num_cred`, `gtcr_num_gtia`, `gtcr_val_gtcr` |
| `bcacrpg` | lote1 §1 | Capital deudor cubierto por cada garantía | `crpg_cod_gara → bcagara`, `crpg_cap_deud` |
| `afcencr` | lote3 §1 | **Encaje del crédito**: cuenta vista bloqueada como respaldo (monto + %) | `encr_num_cred`, `encr_cod_dpvi`, `encr_val_encr`, `encr_por_encr`, `encr_cod_picn` |
| `afcgaul` | lote3 §1 | **Garantía autoliquidable**: DPF (`bcadpfi`) pignorado como garantía | `gaul_num_gtia`, `gaul_cod_dpfi`, `gaul_val_gaul`, `gaul_val_dpfi`, `gaul_fec_inic`/`_fina` |
| `afcdssc` | lote3 §1 | Deuda/saldo por socio garante (`socr` = socio corresponsable) en un crédito | `dssc_cod_socr`, `dssc_num_cred`, `dssc_val_cred`, `dssc_sal_cred` |

### G. Comisiones

| Tabla | Fuente | Rol | Columnas / relaciones clave |
|---|---|---|---|
| `bcacomi` | lote1 §1 | Catálogo de comisiones de crédito (% o valor, cuenta contable, banderas seguro/certif) | `comi_des_comi`, `comi_cod_ctas`, `comi_pct_comi`, `comi_val_comi`, `comi_cod_lcre`, `comi_ban_segu`, `comi_ban_cert` |
| `bcacocr` | lote1 §1 | Comisiones aplicadas a un crédito concreto | `cocr_num_cred`, `cocr_cod_comi → bcacomi`, `cocr_val_cocr`, `cocr_impuesto` |

### H. Catálogos (traducción de códigos)

| Tabla | Fuente | Traduce | Nota |
|---|---|---|---|
| `bcaecre` | lote1 §1 | **Estado del crédito** (`cred_cod_ecre`) | Resuelve el `status` crudo que hoy expone `buscarCreditosInformix` |
| `bcaediv` | lote1 §1 | Estado del dividendo/cuota (`divc_cod_ediv`) | Necesario para etiquetar cuotas pagadas/vencidas/vigentes |
| `bcaeope` | lote1 §1 | **Estado de operación** (banderas: genera mora, no capitaliza, días venc., ponderación calif.) | `eope_per_mora`, `eope_dia_venc`, `eope_pon_calf` |
| `bcaesol` | lote1 §1 | Estado de la solicitud de crédito (originación) | — |
| `bcatcre` | Inventario | Tipo de crédito | `0=INDIVIDUAL`, `1=SOLIDARIO` (dato real) |
| `bcatamo` | Inventario | Tipo de amortización | `tamo_dia_tamo` (días base) |
| `bcatgar` | Inventario | Tipo de garantía (con % provisión) | `tgar_por_prov` |
| `bcalcre` | Inventario | **Línea de crédito (producto)** con rango de tasas | `lcre_tas_lcre`, `lcre_inic_tasc`/`lcre_fin_tasc` |
| `bcaplcr` | Inventario | Rangos de plazo por crédito | — |
| `bcadtcr` | Inv/lote1 | Destino del crédito | `dtcr_cod_tdtc`, `cod_ccre` |
| `bcagcre` | lote1 §1 | Grupo de crédito | — |
| `afcdcre` | Inv/lote3 | Destino/concepto del crédito (variante `afc`) | `dcre_sib_dcre` |
| `afcdeop` | lote3 §1 | Estados de operación (con `dws_name` PowerBuilder) | — |
| `afcectr` | lote3 §1 | Estado de crédito/trámite | `ectr_sib_ectr` |
| `afccega` | lote3 §1 | Causas de movimiento de garantía | ej. "SUSTITUCION DE GARANTIA", "ORDEN JUDICIAL" |
| `afctdeu` | lote3 §1 | Tipo de deuda | — |
| `afcbprm` | lote3 §1 | **Parámetros de cálculo de mora** (base día/mes/año) | `bprm_val_mora`, `bprm_dia/mes/ani_bprm` |
| `afcriec` | lote3 §2 | Categorías de riesgo económico por segmento | — |
| `afccrie` | lote3 §2 | Calificación de riesgo (código regulatorio SIB) | `crie_sib_crie` |
| `afcgtes` | lote3 §3 | Gestores/tipos de gestión de cobranza | `gtes_rec_gtes` |

**Total consolidado del dominio: 48 tablas** (3 master/definición + 8 amortización/pagos + 6 estados/historial
+ 8 calificación/riesgo + 3 cobranza + 5 garantías-puente + 2 comisiones + 19 catálogos; `afccrce`,
`afcdecr`, `bcacpcr` aparecen en más de un grupo por su doble rol pero se cuentan una sola vez).

---

## 3. Resolución de la superposición `bcadivc` (lote1) vs `afcddic` (lote3)

**Pregunta:** ambas parecen ser "tabla de dividendos/cuotas del crédito". ¿Cuál es la real/vigente?

**Verificación ejecutada** (`introspeccion.js --sql`, solo lectura):

| Tabla | Filas (`COUNT(*)`) | Créditos distintos cubiertos | `systables.created` |
|---|---|---|---|
| `bcadivc` | **7004** | **302** | 05/31/2026 |
| `afcddic` | **0** | 0 | 05/31/2026 |
| `bcacred` (contexto) | 304 | — | 05/31/2026 |

**Conclusión: `bcadivc` es la tabla de amortización viva y vigente.** Cubre 302 de los 304 créditos del
master (≈99%), con ~23 cuotas promedio por crédito — consistente con cronogramas reales. **`afcddic` está
completamente vacía.**

**Sobre la antigüedad de diseño:** las tres tablas reportan `created = 05/31/2026`, que es la **fecha de
restauración del dump** en la VM de pruebas, no la fecha real de creación del esquema en producción. Por
tanto la fecha **no** sirve para decidir cuál es "más nueva"; lo decisivo es la población.

**Interpretación de la relación entre ambas:**
- `afcddic` tiene un **esquema más rico**: desglosa explícitamente `val_mora`, `val_segd` (seguro de
  desgravamen) y `val_otro` como columnas propias, mientras que en `bcadivc` esos conceptos se manejan vía
  rubros en las tablas hijas (`bcadirb`/`bcadetd`/`bcaabdv` por `cod_rubr`).
- Escenarios probables (no se puede confirmar sin acceso al sistema de producción / al proveedor):
  1. `afcddic` es una **estructura de nueva generación** que la cooperativa aún no adoptó (migración
     pendiente), por eso está creada pero vacía.
  2. `afcddic` es una tabla de **staging/alterna** usada solo por un proceso batch puntual (reliquidación
     masiva) que no ha corrido en este ambiente.

**Recomendación para la integración read-through:** usar **`bcadivc` como fuente de verdad del plan de
cuotas**, con sus hijas `bcaabdv` (pagos) y `bcadirb`/`bcadetd` (desglose por rubro). **Ignorar `afcddic`**
por ahora, pero **verificar su población en el ambiente de PRODUCCIÓN** antes de descartarla en definitiva
(en test estar vacía no prueba que lo esté en prod). Si en producción `afcddic` estuviera poblada y
`bcadivc` no, la decisión se invierte — dejar este chequeo como precondición de la fase de implementación.

---

## 4. Mapa de reportes / funciones propuestos para el sistema nuevo (SQL Server + React)

Priorización por valor de negocio evidente. "Net-new" = no existe equivalente en SQL Server hoy;
"Extiende" = ya hay algo parcial que se profundiza.

### Prioridad ALTA

| # | Reporte / Función | Tablas Informix que lo alimentan | Estado en sistema nuevo | Justificación |
|---|---|---|---|---|
| R1 | **Tabla de amortización real del crédito** (plan de cuotas: capital/interés/mora proyectado vs pagado por cuota) | `bcadivc` + `bcaabdv` + `bcadirb`/`bcadetd` + catálogo `bcaediv` | **Net-new** — hoy `buscarCreditosInformix` devuelve `installments: []`, `planDisponible: false` | Es el gap #1 de la integración actual. Sin esto no se puede mostrar el cronograma ni el próximo pago |
| R2 | **Estado de cuenta / saldo vigente del crédito** (capital pagado vs pendiente, interés devengado, días de mora) | `bcadivc` (agregado `cap_divc`−`cap_pago`) + `bcaabdv` + `bcacred` | **Net-new** — hoy `balance: null` en el fallback | Saldo vigente es el dato más consultado en ventanilla; hoy simplemente no existe desde Informix |
| R3 | **Reporte de calificación de cartera y provisiones** (por crédito y consolidado: saldo, días vencidos, % y monto de provisión, calificación A/B/C/D/E) | `bcacalf` + `bcaccre` + `afcbrco` + `afccavo` + `afcdrie` | **Net-new** (potencial insumo de `ReportsView.tsx`) | **Alto valor regulatorio SEPS**: la provisión de cartera es reporte obligatorio; error aquí = incumplimiento normativo |
| R4 | **Gestión de cobranza / cartera vencida (aging)** (buckets de mora, deuda vencida por crédito: capital/interés/mora/días) | `afcgccr` + `afcgcab` + `afcgdco` + `afcgtes` | **Net-new** | Operativo (recuperación) + regulatorio (calidad de cartera). Alto valor para el área de crédito |
| R5 | **Traducción de estados legibles** (crédito, cuota, operación) | `bcaecre`, `bcaediv`, `bcaeope`, `bcaesol` | **Net-new** — hoy `status` = código crudo sin traducir | Enabler barato pero transversal: R1/R2/R3 dependen de él para mostrar etiquetas. Bajo esfuerzo, habilita valor alto |

### Prioridad MEDIA

| # | Reporte / Función | Tablas Informix que lo alimentan | Estado en sistema nuevo | Justificación |
|---|---|---|---|---|
| R6 | **Buró interno / snapshot histórico del cliente** (créditos históricos, calificación, días venc., mora acumulada) | `afchicr` | **Net-new** | Insumo de análisis de riesgo en originación (central de riesgos interna). Valor alto pero no bloqueante para operación diaria |
| R7 | **Créditos reestructurados / refinanciados / castigados** | `bcacrrl` + `afccrce` | **Net-new** | Requisito SEPS (cartera reestructurada/refinanciada se reporta aparte). Media por volumen acotado |
| R8 | **Historial de recálculos / reliquidaciones** (valor anterior→recalculado por dividendo/rubro) | `afchdir` + `afcdcal` + `afccrce` | **Net-new** | Trazabilidad/auditoría de ajustes al plan de pagos. Clave si hay disputas de saldo con el socio |
| R9 | **Encaje y garantías autoliquidables (DPF pignorado)** | `afcencr` + `afcgaul` + `bcagtcr` + `bcacrpg` | **Net-new** | Control de garantías líquidas y encaje bloqueado; relevante para cálculo de exposición neta |
| R10 | **Desglose de deuda por rubro (composición de la cuota)** | `bcadetd` + `bcadirb` | **Net-new** (soporte a R2) | Detalle de qué compone cada cuota (capital, interés, seguro, mora). Media: soporte a R1/R2 |

### Prioridad BAJA

| # | Reporte / Función | Tablas Informix que lo alimentan | Estado en sistema nuevo | Justificación |
|---|---|---|---|---|
| R11 | **Comisiones e ingresos por crédito** | `bcacomi` + `bcacocr` | **Net-new** | Ingreso accesorio; útil contablemente pero de bajo volumen/impacto |
| R12 | **Simulador / plantilla de producto de crédito** (valores por defecto de originación) | `bcadfcr` + `bcalcre` + `bcatamo` + `bcaplcr` | Probable **duplicado** — el sistema nuevo probablemente ya origina créditos | Baja: la originación suele hacerse en el sistema nuevo, no leerse de Informix |
| R13 | **Catálogos de traducción restantes** (tipo crédito/garantía/destino, líneas, gestores, calificación SIB) | `bcatcre`, `bcatgar`, `bcadtcr`, `afcdcre`, `afccrie`, `afcgtes`, etc. | Net-new (parcial) | Valor de soporte; se integran on-demand según lo pidan R1–R10 |

---

### Notas de implementación (para la ronda posterior)

- **Precisión monetaria:** todos los montos en Informix son `DECIMAL`. Al mapear a SQL Server usar
  `DECIMAL/NUMERIC` (nunca `float`). El bridge PowerShell→ODBC ya devuelve los valores como string; hoy
  `buscarCreditosInformix` hace `parseFloat` — para montos que se sumen/reconcilien conviene preservar
  precisión (parse a decimal, no a float binario) para evitar errores de centavos en R2/R3.
- **Reconciliación sugerida:** `SUM(bcadivc.cap_divc)` por crédito debe cuadrar con `bcacred.cap_cred`;
  `SUM(bcaabdv.val_abdv)` debe cuadrar con lo aplicado. Buen control de integridad antes de exponer R2.
- **Punto de extensión natural:** R1–R2 se enganchan en el mismo `buscarCreditosInformix` (hoy en
  `server.js`), rellenando `installments`, `balance` y `planDisponible: true`; R5 traduce el `status`.

---

## Anexo — Archivos fuente y herramienta

- Fuentes fusionadas: `db/informix/INVENTARIO_TABLAS.md`, `db/informix/CATALOGO_MODULOS_lote1.md` §1,
  `db/informix/CATALOGO_MODULOS_lote3.md` §1–§3.
- Índice general: `db/informix/MAPA_MODULOS_AFC.md`.
- Herramienta de consulta puntual (solo lectura):
  `node db/informix/introspeccion.js --sql "SELECT ..."`.
- Integración actual en producción: `server.js › buscarCreditosInformix()` (fallback read-through en
  `GET /api/socios/buscar`).
</content>
</invoke>
