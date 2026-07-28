# Catálogo de módulos — Lote 2 (`bca*`, 144 tablas)

Generado el 2026-07-13 contra la VM de pruebas VirtualBox (`192.168.1.199:1526`, server `ol_servidor`),
usando `db/informix/introspeccion.js`. Solo lectura, fase de catalogación.

Lote asignado: `db/informix/_batch2_bca_b.json` (144 tablas con prefijo `bca`, tramo alfabético
`bcahesu` … `bcavprm`). Este archivo se fusionará con los lotes 1 y 3.

**Metodología:** columnas obtenidas en 5 lotes vía `syscolumns`+`systables` con `IN(...)`
(ver `db/informix/_batch2_cols.js` / `_batch2_cols.json`). Solo se muestrearon datos reales de
tablas maestras/transaccionales ambiguas (`bcaindi`, `bcapott`, `bcaremq`, `bcavprm`, etc.); los
catálogos código+descripción se infirieron por nombre+columnas.

`coltype`: `0=CHAR, 1=SMALLINT, 2=INTEGER, 3=FLOAT, 5=DECIMAL, 6=SERIAL, 7=DATE, 10=DATETIME,
11=BYTE, 13=VARCHAR`; sufijo `NN` = NOT NULL (variante +256).

Convención de nombres AFC observada: prefijo de 4 letras por tabla repetido en cada columna
(`xxxx_cod_xxxx` = PK/SERIAL; `xxxx_des_xxxx` = descripción; `xxxx_sib_xxxx` = código regulatorio
SIB/SEPS; `xxxx_est_xxxx`/`ban_` = flags de estado). Las columnas `cod_<otra_raíz>` son FKs a la
tabla cuya raíz coincide.

---

## 1. Caja / Cajero — Papeletas, Transacciones y Pagos

Núcleo del cajero: cada operación de ventanilla genera una **papeleta** (`bcapape`) que agrupa una
o varias **transacciones** (`bcatran`), y los **pagos** (`bcapago`) se descomponen por forma de pago.

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcapape` | `pape_cod_pape` (SERIAL PK), `pape_cod_ofic`, `pape_fec_pape` (DATETIME), `pape_cod_usua`, `pape_cod_tran`, `pape_num_tran`, `pape_cod_tdoc`, `pape_num_comp`, `pape_pap_ante`, `pape_cod_divc/ediv` | **Papeleta/comprobante de caja** (cabecera de transacción de ventanilla). FKs → oficina, usuario, `bcatran`, `bcatdoc`. `pap_ante` encadena papeleta anterior (reverso/anulación). |
| `bcatran` | `tran_cod_tran` (SERIAL PK), `tran_des_tran`, `tran_cod_tdoc`, `tran_num_secu`, `tran_ban_tran` | Catálogo de tipos de transacción de caja. FK → `bcatdoc`. |
| `bcatxcp` | `txcp_cod_tcdv`, `txcp_cod_tran` | Transacciones habilitadas por tipo de cuenta (`bcatcdv` ↔ `bcatran`). |
| `bcapago` | `pago_cod_pago` (SERIAL PK), `pago_obs_pago`, `pago_ctr_pago`, `pago_fec_anul` | Cabecera de pago (p. ej. pago de cuota de crédito); `fec_anul` marca reverso. |
| `bcapddb` | `pddb_cod_pago`, `pddb_cod_dpvi` | Pago debitado desde una cuenta de depósito vista. FKs → `bcapago`, `bcadpvi`. |
| `bcapdte` | `pdte_cod_pago`, `pdte_cod_tfpg`, `pdte_val_pdte` (DEC), `pdte_fec_pago`, `pdte_cod_caja` | Detalle de pago por forma de pago (efectivo/cheque/débito). FKs → `bcapago`, `bcatfpg`. |
| `bcatfpg` | `tfpg_cod_tfpg`, `tfpg_des_tfpg`, `tfpg_cod_sri` | Catálogo forma de pago (con mapeo código SRI). |
| `bcatdin` | `tdin_cod_tdin` (SERIAL), `tdin_des_tdin` | Catálogo de tipo/denominación de dinero (arqueo de efectivo). |
| `bcatrcj` | `trcj_cod_trcj` (SERIAL PK), `trcj_cod_ctas`, `trcj_desc_trcj`, `trcj_tipo_trcj`, `trcj_valor` (DEC), `trcj_cod_tasi`, `trcj_ban_dbso`, `trcj_gen_iva` | Rubros/transacciones de caja parametrizados con **cuenta contable** y tipo de asiento; `gen_iva` marca si genera IVA. FK → plan de cuentas. |
| `bcaotcl` | `dotr_cod_pape`, `dotr_cod_clie`, `dotr_cod_trcj`, `dotr_valor` (DEC) | "Otras transacciones cliente" en caja: liga papeleta ↔ cliente ↔ rubro `bcatrcj`. |
| `bcaottr` | `ottr_cod_pape`, `ottr_cod_clie`, `ottr_detalle`, `ottr_num_ottr` (DEC), `ottr_num_ctas`, `ottr_ban_giro`, `ottr_cod_banc`, `ottr_cod_tcba` | Otras transacciones (giros/transferencias por caja); referencia banco y tipo de cuenta bancaria. |
| `bcaotde` | `otde_cod_clie`, `otde_mes_rols`, `otde_ani_rols`, `otde_valor` (DEC), `otde_tip_otde` | Otros descuentos aplicados al socio por período (ligado al rol — ver módulo Rol/Nómina). |

---

## 2. Ahorros / Captaciones — Cuentas a la vista

Complementa `bcadpvi`/`bcatcdv` ya documentados. Configuración de productos de captación y
movimientos de libreta.

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcamcdv` | `mcdv_cod_mcdv` (SERIAL PK), `mcdv_cod_dpvi`, `mcdv_cod_caja`, `mcdv_fec_mcdv`, `mcdv_cod_pape`, `mcdv_val_mcdv` (DEC), `mcdv_num_cheq`, `mcdv_cod_tran`, `mcdv_cod_orec`, `mcdv_ban_iva` | **Movimiento de cuenta de ahorro/depósito vista** (depósito/retiro). FKs → `bcadpvi`, `bcapape`, `bcatran`, `bcaorec`. Tabla transaccional caliente. |
| `bcatcdv` | `tcdv_cod_tcdv` (SERIAL PK), `tcdv_cod_tcap`, `tcdv_cod_mone`, `tcdv_cod_ttpf`, `tcdv_des_tcdv`, `tcdv_aho_mini`, `tcdv_cco_acti/prov/gast/inac/dxcf`, `tcdv_val_inic`, `tcdv_est_tcdv` | **Configuración del producto de captación** (tipo de cuenta). Mapea a cuentas contables (activo/provisión/gasto/inactiva). FKs → `bcatcap`, moneda, `bcattpf`. |
| `bcatcap` | `tcap_cod_tcap` (SERIAL), `tcap_des_tcap`, `tcap_cod_siba` | Catálogo tipo de captación (con código SIB). |
| `bcatcdp` | `tcdp_cod_tcdv`, `tcdp_plz_mini/maxi`, `tcdp_tas_mini/maxi/inac/canc`, `tcdp_dep_mini`, `tcdp_rec_inte`, `tcdp_nod_inac` | Parámetros por tipo de cuenta: plazos, rango de tasas, depósito mínimo, días para inactivar. FK → `bcatcdv`. |
| `bcathdv` | `thdv_cod_tadv`, `thdv_fec_thdv` (DATETIME), `thdv_mon_inic/fina`, `thdv_tas_acti/inac` | Histórico de tramos de tasa por monto y tipo de ahorro. |
| `bcameac` | `meac_cod_tcdv`, `meac_cod_meac` | Movimientos/estados que aplican a cada tipo de cuenta. |
| `bcastmp` | `stmp_cod_dpvi`, `stmp_mes_debi`, `stmp_ani_debi`, `stmp_fec_debi`, `stmp_val_debi`, `stmp_fec_serv` | Débitos automáticos/mantenimiento programado por cuenta y período. FK → `bcadpvi`. |
| `bcavpcn` | `vpcn_cod_picn`, `vpcn_cod_dpvi`, `vpcn_valor` (DEC), `vpcn_num_vpcn`, `vpcn_fec_inic`, `vpcn_plz_vpcn` | Cobros/conceptos por servicio aplicados a una cuenta. FKs → `bcapicn`, `bcadpvi`. |
| `bcapicn` | `picn_cod_picn`, `picn_des_picn`, `picn_val_picn` (DEC), `picn_cod_tpic` | Catálogo de conceptos/cargos por servicios sobre cuentas. |
| `bcaprdv` | `prdv_fec_prdv` (DATETIME), `prdv_cod_dpvi`, `prdv_cod_tdoc`, `prdv_num_docu`, `prdv_val_prdv` (DEC), `prdv_cod_tasi` | Provisión/movimiento pendiente sobre cuenta de depósito vista. |
| `bcatprv` | `tprv_fec_prdv`, `tprv_cod_clie`, `tprv_cod_tdoc`, `tprv_num_docu`, `tprv_val_prdv` (DEC), `tprv_cod_tcdv` | Variante temporal/staging de `bcaprdv` con cliente y tipo de cuenta. |
| `bcamlbr` | `mlbr_cod_mlbr` (SERIAL), `mlbr_des_mlibr` | Catálogo de tipos de movimiento de libreta. |
| `bcamdep` | `mdep_cod_mdep` (SMALLINT), `mdep_des_mdep` | Catálogo modalidad de depósito. |
| `bcatdep` | `tdep_cod_tdep` (SMALLINT), `tdep_des_tdep` | Catálogo tipo de depósito. |

---

## 3. Créditos / Cartera / Riesgo crediticio

Complementa el núcleo `bcacred` ya documentado. Aquí: parámetros de calificación de cartera,
provisiones y garantías de crédito.

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcapgre` | `pgre_cod_pgre` (SERIAL PK), `pgre_num_cred`, `pgre_num_pgre`, `pgre_fec_entr`, `pgre_est_pgre`, `pgre_usu_entr` | Pagarés/garantías entregadas o devueltas del crédito. FK → `bcacred`. |
| `bcarcla` | `rcla_cod_ccre`, `rcla_cod_tgar`, `rcla_dias_rcla`, `rcla_num_rcla`, `rcla_fec_inic` | Reclasificación de cartera por línea de crédito, tipo de garantía y días de mora. FKs → línea crédito, `bcatgar`. |
| `bcapcal` | `pcal_fec_tope`, `pcal_cod_ccre`, `pcal_lim_infe`, `pcal_lim_supe`, `pcal_est_calf`, `pcal_val_pond` | **Parámetros de calificación de riesgo**: rangos de días de mora → categoría (A/B/C…) y ponderación de provisión. |
| `bcapaca` | `paca_cod_ccon`, `paca_ran_inic`, `paca_ran_fina`, `paca_cod_ccre`, `paca_lin_paca` | Rangos de calificación por cuenta contable y línea de crédito (armado del reporte de provisiones). |
| `bcaplcr` | `plcr_cod_plcr` (SERIAL), `plcr_cod_intv`, `plcr_cod_mone`, `plcr_ini_plcr/fin_plcr` (DEC) | Rangos de plazo/monto por producto de crédito. FK → `bcaintv`, moneda. |
| `bcaprdi` | `prdi_cod_prms`, `prdi_cod_prdi`, `prdi_plz_prdi` | Periodicidad de dividendos por parámetro. FK → `bcaprms`. |
| `bcatgar` | `tgar_cod_tgar`, `tgar_des_tgar`, `tgar_sib_tgar`, `tgar_por_prov` (DEC), `tgar_est_tgar` | Catálogo tipo de garantía con % de provisión (también en inventario base). |
| `bcatcre` | `tcre_cod_tcre`, `tcre_des_tcre`, `tcre_sib_tcre` | Catálogo tipo de crédito (también en inventario base). |
| `bcaproc` | `proc_cod_prfi`, `proc_cod_proc`, `proc_des_proc` | Procesos definidos por perfil financiero (`prfi`). Config de flujo de crédito. |

---

## 4. Cobranza judicial / Jurídico

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcajuic` | `juic_num_cred`, `juic_cod_abog`, `juic_num_juic`, `juic_cod_ejui`, `juic_cod_ofic`, `juic_val_juic` (DEC), `juic_fec_inic/fina` | **Juicios de cobranza** sobre créditos en mora. FKs → `bcacred`, abogado (`bcaabog`, lote 1), estado juicio (`bcaejui`). |
| `bcaorco` | `orco_cod_orco` (SERIAL PK), `orco_cod_clie`, `orco_cod_prdr`, `orco_fec_orco`, `orco_val_orco` (DEC), `orco_num_cred`, `orco_est_orco`, `orco_obs_orco` | Orden de cobro/recaudación (vía recaudador externo `bcaprdr`) asociada a cliente y crédito. Vacía en la VM de prueba. |

---

## 5. Tesorería / Bancos / Conciliación bancaria

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcamban` | `mban_cod_mban` (SERIAL PK), `mban_cod_cban`, `mban_fec_mban`, `mban_cod_tasi`, `mban_cod_pape`, `mban_cod_tmba`, `mban_ben_mban`, `mban_val_mban` (DEC), `mban_num_pape` | **Movimiento bancario** (para conciliación). FKs → cuenta bancaria `bcacban` (lote 1), `bcatmba`, `bcapape`. |
| `bcaobct` | `obct_cod_obct` (SERIAL), `obct_cod_cban`, `obct_det_obct`, `obct_fec_obct`, `obct_cod_usua` | Observaciones/notas sobre una cuenta bancaria. |
| `bcasdct` | `sdct_fec_sdct`, `sdct_cod_cban`, `sdct_dis_sdct` (DEC), `sdct_con_sdct` (DEC) | Saldos diarios de cuenta bancaria: disponible vs. contable. |
| `bcatmba` | `tmba_cod_tmba`, `tmba_des_tmba` | Catálogo tipo de movimiento bancario. |
| `bcatcba` | `tcba_cod_tcba`, `tcba_des_tcba`, `tcba_sib_tcba`, `tcba_bce_codi` | Catálogo tipo de cuenta bancaria (con código BCE/SIB). |
| `bcatpln` | `tpln_fec_camb`, `tpln_cod_dpln`, `tpln_tas_camb` (DEC) | Tipo de cambio por fecha (multi-moneda). FK → `bcadpln`/moneda. |
| `bcapott` | `pott_cod_pott` (SERIAL PK), `pott_tipo_trans`, `pott_descrip`, `pott_det_dine`, `pott_est_pott`, `pott_usu_perm`, `pott_ban_cont/bizb/giro` | Parametrización de tipos de orden de pago/transacción de tesorería (ej. "PAGO POR COMPRA DE SISTEMA AFC"); `usu_perm` = lista CSV de usuarios autorizados. |

---

## 6. Cheques / Órdenes de emisión

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcaorec` | `orec_cod_orec` (SERIAL PK), `orec_cod_ooem`, `orec_cod_usua`, `orec_nom_bene`, `orec_val_orec` (DEC), `orec_fec_orec` (DATETIME), `orec_ctr_emis`, `orec_cod_chqs`, `orec_cod_mone`, `orec_ctr_migr` | **Orden de emisión/recibo** de cheque a un beneficiario. FKs → `bcaooem`, `bcachqs` (chequera, lote 1), moneda. |
| `bcaooem` | `ooem_cod_ooem`, `ooem_des_ooem`, `ooem_gen_cheq` | Catálogo origen de la orden de emisión; `gen_cheq` indica si genera cheque. |
| `bcaordc` | `ordc_cod_dcom`, `ordc_cod_orec`, `ordc_cod_ctas` | Detalle contable de la orden de recaudación/comprobante. FKs → `bcaorec`, plan de cuentas. |
| `bcaopag` | `opag_lin1_opag` … `opag_lin15_opag`, `opag_num_for` | Plantilla/formato de impresión de orden de pago (15 líneas). Config de reportes. |

---

## 7. Proveedores / Compras / Cuentas por pagar

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcaprdr` | `prdr_cod_prdr` (SERIAL PK), `prdr_ide_prdr`, `prdr_nom_prdr`, `prdr_cod_ctas`, `prdr_cod_ccre`, `prdr_tas_prdr`, `prdr_num_esta/loca/auto`, `prdr_cod_tide`, `prdr_nat_juri`, `prdr_ban_fele`, `prdr_ban_rete` | **Maestro de proveedores/recaudadores** (RUC, cuenta contable, datos de facturación SRI, banderas de factura electrónica y retención). |
| `bcapcom` | `pcom_cod_pcom` (SERIAL PK), `pcom_des_pcom`, `pcom_cod_cont`, `pcom_beneficia`, `pcom_detalle` | Parametrización de comprobantes de egreso/pago recurrentes. FK → `bcacont` (concepto contable). |
| `bcapdco` | `pdco_cod_pdco` (SERIAL PK), `pdco_cod_comp`, `pdco_cod_ctas`, `pdco_cod_tasi`, `pdco_valor` (DEC) | **Partidas contables (detalle) de un comprobante**: cuenta + débito/crédito. FK → comprobante, plan de cuentas. |
| `bcapaco` | `paco_cod_paco`, `paco_des_paco` | Catálogo asociado a comprobantes/partidas (propósito exacto no confirmado). |
| `bcaprcb` | `prcb_cod_prcb` (SERIAL), `prcb_det_prcb`, `prcb_num_prcb` | Catálogo pequeño de comprobantes (propósito exacto no confirmado). |

---

## 8. Contabilidad / Presupuesto

Complementa `comp_sal_cta`/`bcasact`/`afcctar` ya documentados (saldos y plan de cuentas).

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcandoc` | `ndoc_cod_ejer`, `ndoc_cod_tdoc`, `ndoc_num_tdoc` | Numeración de documentos contables por ejercicio y tipo. FK → `bcatdoc`. |
| `bcaperi` | `peri_cod_peri` (SERIAL PK), `peri_cod_ejer`, `peri_mes_peri`, `peri_cie_peri` | **Períodos contables** (ejercicio + mes) y bandera de cierre. |
| `bcasacp` | `sacp_cod_cons`, `sacp_cod_mese`, `sacp_cod_ctas`, `sacp_sal_debi` (DEC), `sacp_sal_cred` (DEC) | Saldos contables consolidados por mes y cuenta (variante consolidación). |
| `bcarubr` | `rubr_cod_rubr` (SERIAL PK), `rubr_des_rubr`, `rubr_cod_ctas`, `rubr_cod_modu`, `rubr_cta_paga`, `rubr_ban_giva`, `rubr_cod_iva` | Catálogo de rubros contables (ingreso/gasto) mapeados a cuentas; banderas de IVA. |
| `bcatndd` | `tndd_cod_tndd` (SERIAL PK), `tndd_cod_ctas`, `tndd_cod_mone`, `tndd_des_tndd`, `tndd_ban_iva`, `tndd_val_tndd` (DEC), `tndd_por_iva` | Tipos de nota de débito/débito directo con cuenta contable e IVA. |
| `bcatcue` | `tcue_cod_tcue`, `tcue_des_tcue` | Catálogo tipo de cuenta contable (M/D/A…). |
| `bcavpre` | `vpre_cod_pres`, `vpre_cod_mese`, `vpre_val_vpre` (DEC) | **Presupuesto**: valor por partida presupuestaria y mes. FK → `bcapres` (lote 3). |
| `bcarb11` | `rb11_cod_rb11` (SERIAL PK), `rb11_cod_ctas`, `rb11_cod_ccon`, `rb11_mes_rb11`, `rb11_val_sald` (DEC), `rb11_fec_rep` | Estructura de balance regulatorio (RB) con saldo por cuenta y mes reportado. Puente contabilidad ↔ reportes SEPS. |

---

## 9. Facturación electrónica / SRI / ATS / Impuestos

Módulo tributario ecuatoriano (comprobantes electrónicos, Anexo Transaccional Simplificado, retenciones).

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcatlco` | `tlco_cod_tlco` (SERIAL PK), `comp_cod_comp`, `tlco_ruc_coop`, `setr_cod_setr`, `tpco_cod_tpco`, `tlco_baim_iva/ice`, `tlco_mon_iva/ice/ivbi/ivse`, `tlco_ret_*`, `tlco_num_auto`, `tlco_nom_arch` | **Compras/retenciones (ATS compras)**: bases imponibles, IVA/ICE, retenciones IVA/renta, autorización y XML. FKs → proveedor, `bcatpco`, `bcasetr`, `bcapibi`. |
| `bcatlve` | `tlve_cod_tlve` (SERIAL PK), `tlve_ruc_coop`, `tlve_cod_setr`, `tlve_baim_iva/ice`, `tlve_mon_iva/ice`, `tlve_ret_*`, `tlve_num_auto`, `tlve_cod_tpsr` | **Ventas (ATS ventas)**: comprobantes emitidos con IVA/ICE y retenciones recibidas. |
| `bcateex` | `teex_cod_teex` (SERIAL PK), `comp_cod_comp`, `teex_val_fob` (DEC), `teex_raz_socl`, `teex_num_auto`, `teex_num_sees/sepe/secu` | Comprobantes de exportación (ATS/aduanas). |
| `bcateim` | `teim_cod_teim` (SERIAL PK), `teim_val_cif` (DEC), `teim_baim_iva/ice`, `teim_mon_iva/ice`, `piva_cod_secu`, `pice_cod_pice` | Comprobantes de importación (valor CIF, IVA/ICE). |
| `bcarefi` | `refi_cod_refi` (SERIAL PK), `refi_ruc_coop`, `setr_cod_setr`, `refi_num_iden`, `tpco_cod_tpco`, `refi_num_sees/sepe/secu`, `refi_num_auto`, `refi_nom_arch` | Comprobantes de reembolso/liquidación (ATS), con autorización y XML. |
| `bcaoffa` | `offa_cod_offa` (SERIAL PK), `offa_cod_ofic`, `offa_cod_esrf`, `offa_num_esta/loca/inic/fina/actu`, `offa_num_auto`, `offa_fec_venc`, `offa_ban_cele` | **Secuencias y autorización de facturación por oficina** (numeración de puntos de emisión); `ban_cele` = factura electrónica activa. |
| `bcapibi` | `pibi_cod_pibi`, `pibi_des_pibi`, `pibi_cta_comp`, `pibi_cta_vent`, `pibi_cod_sri` | Parámetro IVA de bienes/servicios con cuentas de compra/venta y código SRI. |
| `bcaimru` | `imru_cod_impu`, `imru_cod_rubr` | Relación impuesto ↔ rubro. FKs → `bcaimpu` (lote 1), `bcarubr`. |
| `bcatpco` | `tpco_cod_tpco`, `tpco_des_tpco`, `tpco_sec_tran`, `tpco_fec_vige`, `tpco_sus_trib` | Catálogo tipo de comprobante SRI (factura, NC, retención…). |
| `bcatpie` | `tpie_cod_tpie`, `tpie_des_tpie` | Catálogo tipo de identificación del informante/proveedor (ATS). |
| `bcatsie` | `tsie_cod_tsie`, `tsie_des_tsie` | Catálogo de siglas/tipo (usado en comprobantes ATS import/export). |
| `bcatptr` | `tptr_cod_tptr`, `tptr_des_tptr`, `tptr_tip_comp`, `tptr_sec_tran` | Catálogo tipo de transacción/pago para reportes SRI. |
| `bcasetr` | `setr_cod_setr`, `tptr_cod_tptr`, `tpid_cod_iden` | Segmento de transacción SRI (liga `bcatptr` con tipo de identificación). |
| `bcapais` | `pais_cod_pais` (SERIAL), `pais_sib_pais`, `pais_des_pais`, `pais_nac_pais`, `pais_sri_pais` | Catálogo de países (con código SRI y nacionalidad). Usado en ATS y datos de socio. |
| `bcanatu` | `natu_cod_natu`, `natu_des_natu` | Catálogo naturaleza (persona natural/jurídica). |

---

## 10. Reportes regulatorios SEPS / SIB

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcaindi` | `indi_cod_indi` (SERIAL PK), `tind_cod_tind`, `indi_nom_indi`, `indi_for1_indi`/`indi_for2_indi` (fórmulas), `indi_val_indi` (DEC), `indi_val_tend` | **Indicadores financieros regulatorios** (SOLVENCIA, PERLAS, etc.). Las fórmulas referencian códigos de cuenta contable entre `{}` (ej. patrimonio técnico / activos ponderados por riesgo). FK → `bcatind`. |
| `bcatind` | `tind_cod_tind` (SERIAL PK), `tind_nom_tind`, `tind_des_tind`, `tind_ban_tind`, `tind_cod_dmon` | Catálogo tipo/grupo de indicador. |
| `bcarsib` | `rsib_cod_rsib` (SERIAL PK), `rsib_des_rsib`, `rsib_fec_rsib`, `rsib_tip_rsib`, `rsib_nom_clas`, `rsib_sib_rsib`, `rsib_cod_modu`, `rsib_xsi_sche` | **Definición de estructuras/reportes SIB-SEPS** (esquema XML `xsi_sche`, clase generadora). Motor de generación de reportes regulatorios. |
| `bcaiope` | `iope_cod_iope` (SERIAL), `iope_sib_iope`, `iope_des_iope` | Catálogo tipo de operación con código SIB. |

---

## 11. Seguros sobre garantías

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcapose` | `pose_num_gtia`, `pose_nom_aseg`, `pose_mon_aseg` (DEC), `pose_fec_endo`, `pose_mon_endo` (DEC), `pose_num_poli`, `pose_fec_emip`, `pose_fec_vtop` | Pólizas de seguro endosadas sobre bienes en garantía (aseguradora, monto, endoso, vigencia). FK → `bcagtia` (garantía). |

---

## 12. Recursos Humanos / Nómina / Jornadas / Rol de socios

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcahesu` | `hesu_cod_hesu` (SERIAL PK), `hesu_cod_empl`, `hesu_val_ante` (DEC), `hesu_fec_actu`, `hesu_fec_ante` | Histórico de sueldos por empleado. FK → `bcaempl` (lote 1). |
| `bcarols` | `rols_cod_rols` (SERIAL PK), `rols_cod_clie`, `rols_mes_rols`, `rols_ani_rols`, `rols_tip_rols`, `rols_aho_rols` (DEC), `rols_cer_rols`, `rols_pre_capi/inte`, `rols_ant_capi/inte`, `rols_bon_rols`, `rols_dep_rols` | **Rol de descuentos por socio y período**: ahorro, certificados, capital+interés de préstamo, anticipos, bono. Ligado a empresas convenio que descuentan por rol de pagos. Vacía en la VM. |
| `bcatjor` | `tjor_cod_tjor`, `tjor_cod_dsem`, `tjor_hm_0030` … `tjor_hm_2400` (48 franjas media hora) | Plantilla de jornada laboral por día de semana (control de horario). |
| `bcajcop` | `jcop_cod_jcop` (SERIAL PK), `jcop_cod_dsem`, `jcop_cod_ofic`, `jcop_hm_0030` … `jcop_hm_2400` | Jornada/horario por oficina (48 franjas). FK → oficina. |

---

## 13. Cliente / Socio — datos complementarios y socioeconómicos

Complementa `bcaclie` ya documentado. Datos adjuntos y catálogos de perfilamiento del socio.

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcaimag` | `imag_cod_imag` (SERIAL PK), `imag_cod_clie`, `imag_fir_imag` (BYTE), `imag_fot_imag` (BYTE), `imag_arc_foto`, `imag_arc_cedu` | **Imágenes del socio**: firma, foto y cédula (BLOB). FK → `bcaclie`. |
| `bcatele` | `tele_cod_tele` (SERIAL PK), `tele_cod_clie`, `tele_cod_ttel`, `tele_cod_utel`, `tele_num_tele`, `tele_ban_prin` | Teléfonos del socio. FKs → `bcaclie`, `bcattel`, `bcautel`. |
| `bcatene` | `tene_cod_tene` (SERIAL PK), `tene_cod_clie`, `tene_cod_sect`, `tene_are_terr`, `tene_cod_unid`, `tene_rie_terr`, `tene_leg_terr` | Tenencia de terreno/vivienda del socio (área, sector, riesgo, legalización) — perfil socioeconómico. |
| `bcaocu1` | `ocu1_cod_ocu1`, `ocu1_des_ocu1`, `ocu1_sib_ocu1` | Catálogo ocupación nivel 1 (jerarquía CIUO/SIB). |
| `bcaocu2` | `ocu2_cod_ocu2`, `ocu2_cod_ocu1`, `ocu2_des_ocu2` | Ocupación nivel 2. FK → `bcaocu1`. |
| `bcaocup` | `ocup_cod_ocup`, `ocup_cod_ocu2`, `ocup_des_ocup`, `ocup_sib_ocup`, `ocup_cod_segm`, `ocup_rie_ambt` | Ocupación nivel 3 (detalle) con segmento y riesgo ambiental. FK → `bcaocu2`. |
| `bcasect` | `sect_cod_sect` (SERIAL), `sect_cod_ciud`, `sect_cod_tsec`, `sect_des_sect`, `sect_sib_sect` | Catálogo de sectores/barrios. FKs → ciudad, `bcatsec`. |
| `bcatsec` | `tsec_cod_tsec` (SERIAL), `tsec_des_tsec` | Catálogo tipo de sector (urbano/rural). |
| `bcarlab` | `rlab_cod_rlab` (SERIAL), `rlab_des_rlab`, `rlab_sib_rlab` | Catálogo relación laboral (dependiente/independiente…). |
| `bcaineg` | `ineg_cod_ineg` (SERIAL), `ineg_des_ineg`, `ineg_ban_ineg`, `ineg_sig_ineg` | Catálogo tipo de ingreso/actividad. |
| `bcatcar` | `tcar_cod_tcar`, `tcar_des_tcar` | Catálogo tipo de carga familiar. |
| `bcatcfa` | `tcfa_cod_tcfa` (SERIAL), `tcfa_des_tcfa`, `tcfa_ban_cfam` | Catálogo tipo de composición familiar. |
| `bcaben`→`bcatben` | `tben_cod_tben` (SERIAL), `tben_des_tben` | Catálogo tipo de beneficiario. |
| `bcaorig` | `orig_cod_orig` (SERIAL), `orig_sib_orig`, `orig_des_orig`, `orig_ban_orig` | Catálogo **origen de fondos/recursos** (relevante para AML/prevención de lavado). |
| `bcatvin` | `tvin_cod_tvin`, `tvin_des_tvin`, `tvin_sib_tvin` | Catálogo tipo de vínculo (partes relacionadas). |
| `bcatide` | `tide_cod_tide`, `tide_des_tide`, `tide_sri_tide`, `tide_ban_tide` | Catálogo tipo de identificación (cédula/RUC/pasaporte) con código SRI. |
| `bcasexo` | `sexo_cod_sexo`, `sexo_des_sexo` | Catálogo sexo. |
| `bcaintr` | `intr_cod_intr`, `intr_des_intr`, `intr_eda_intr` | Catálogo de rangos de edad/intervalo (perfilamiento). |
| `bcaitrv` | `itrv_cod_itrv`, `itrv_des_itrv`, `itrv_num_mess` | Catálogo intervalo de revisión (meses) — p. ej. actualización de datos KYC. |

---

## 14. Seguridad / Menús / Sesiones (capa de aplicación)

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcamenu` | `menu_cod_menu` (SERIAL PK), `menu_des_menu`, `menu_clas_menu`, `menu_cod_modu`, `menu_tar_menu` | Menús de la aplicación. FK → módulo (`bcamodu`, lote 1). |
| `bcaopci` | `opci_cod_opci` (SERIAL PK), `opci_cod_modu`, `opci_cod_menu`, `opci_nom_opci`, `opci_microhelp`, `opci_ban_opci`, `opci_ord_opci` | Opciones de menú (pantallas). FKs → módulo, `bcamenu`. |
| `bcaoptr` | `optr_cod_optr` (SERIAL PK), `optr_cod_opci`, `optr_cod_tran` | Relación opción ↔ transacción permitida. FKs → `bcaopci`, `bcatran`. |
| `bcaustr` | `ustr_cod_usua`, `ustr_cod_optr`, `ustr_ban_ustr` | **Permisos por usuario** (usuario ↔ opción/transacción). FKs → `bcausua`, `bcaoptr`. |
| `bcaofus` | `ofus_cod_ofus` (SERIAL PK), `ofus_cod_ofic`, `ofus_cod_usua` | Asignación usuario ↔ oficina. |
| `bcaopen` | `open_cod_open` (SERIAL PK), `open_des_open`, `open_ses_id`, `open_nam_pc` | Sesiones/procesos abiertos (control de concurrencia por PC). Semi-técnica. |

---

## 15. Parámetros / Configuración del sistema

| Tabla | Columnas clave | Propósito / FKs |
|---|---|---|
| `bcaprms` | `prms_cod_prms` (SERIAL PK), `prms_cod_modu`, `prms_des_prms` | **Maestro de parámetros** por módulo. |
| `bcavprm` | `vprm_cod_prms`, `vprm_cod_tprm`, `vprm_val_vprm`, `vprm_asu_vprm` | **Valores de parámetros** (ej. `cod_prms=6 → val="24335"`). FKs → `bcaprms`, `bcatprm`. |
| `bcatprm` | `tprm_cod_tprm` (SMALLINT), `tprm_des_tprm` | Catálogo tipo de parámetro. |
| `bcainan` | `inan_cod_tcdv` (SERIAL PK), `inan_cod_anio`, `inan_cod_tanx`, `inan_fec_proc`, `inan_cod_usua` | Control de ejecución de procesos anuales (generación de anexos por tipo de cuenta/año). |
| `bcaintv` | `intv_cod_intv`, `intv_des_intv`, `intv_num_dias`, `intv_cod_siba`, `intv_est_intv` | Catálogo de intervalos de plazo (días) con código SIB — base de productos plazo/crédito. |
| `bcarang` | `rang_ini_rang` (DEC), `rang_fin_rang` (DEC) | Rango genérico (límites) de configuración. |
| `bcarant` | `rant_lim_infe`, `rant_lim_supe` | Rango de límites (antigüedad/monto) de configuración. |

---

## 16. Catálogos generales varios

Catálogos código+descripción de bajo volumen, sin lógica de negocio propia (soportan formularios).

| Tabla | Columnas | Propósito inferido |
|---|---|---|
| `bcamese` | `mese_cod_mese`, `mese_des_mese` | Meses del año. |
| `bcaunid` | `unid_cod_unid` (SERIAL), `unid_des_unid` | Unidades (de medida/área). |
| `bcatofi` | `tofi_cod_tofi`, `tofi_des_tofi` | Tipo de oficina/agencia. |
| `bcatdoc` | `tdoc_cod_tdoc`, `tdoc_des_tdoc`, `tdoc_num_tdoc`, `tdoc_tip_tdoc`, `tdoc_sec_tdoc` | Tipo de documento (con secuencia). |
| `bcatdpd` | `tdpd_cod_tdpd` (SERIAL), `tdpd_des_tdpd`, `tdpd_sib_tdpd` | Tipo (con código SIB) — propósito exacto no confirmado. |
| `bcatdtc` | `tdtc_cod_tdtc` (SERIAL), `tdtc_des_tdtc`, `tdtc_sib_tdtc` | Tipo (con código SIB) — propósito exacto no confirmado. |
| `bcatfir` | `tfir_cod_tfir`, `tfir_des_tfir`, `tfir_sib_tfir`, `tfir_num_firm` | Tipo de firma / condición de firmas (cuentas mancomunadas). |
| `bcatfor` | `tfor_cod_tfor` (SERIAL), `tfor_des_tfor` | Tipo de formato/formulario. |
| `bcating` | `ting_cod_ting` (SERIAL), `ting_des_ting` | Tipo de ingreso. |
| `bcatman` | `tman_cod_tman`, `tman_des_tman` | Tipo de mantenimiento. |
| `bcatico` | `tico_cod_tico` (SMALLINT), `tico_des_tico` | Catálogo tipo (código corto) — propósito no confirmado. |
| `bcatica` | `tica_cod_tica`, `tica_nom_tica` | Catálogo — propósito no confirmado. |
| `bcatiin` | `tiin_cod_tiin`, `tiin_des_tiin`, `tiin_nom_repr` | Tipo de institución (con representante). |
| `bcatifi` | `tifi_cod_tifi`, `tifi_des_tifi`, `tifi_cod_pore`, `tifi_fec_ini/fin` | Tipo de institución financiera (vigencia). |
| `bcatsob` | `tsob_cod_tsob`, `tsob_des_tsob` | Tipo de sobregiro. |
| `bcatcse` | `tcse_cod_tcse`, `tcse_des_tcse`, `tcse_cod_fpsd`, `tcse_est_tcse` | Catálogo (propósito no confirmado; liga a forma de pago `fpsd`). |
| `bcatese` | `tese_cod_tese`, `tese_des_tese` | Catálogo — propósito no confirmado. |
| `bcapasd` | `pasd_cod_pasd`, `pasd_des_pasd` | Catálogo — propósito no confirmado. |
| `bcattel` | `ttel_cod_ttel` (SERIAL), `ttel_des_ttel` | Tipo de teléfono. |
| `bcautel` | `utel_cod_utel` (SERIAL), `utel_des_utel` | Uso de teléfono (casa/trabajo/celular). |
| `bcateof` | `teof_cod_teof` (SERIAL), `teof_cod_ttel`, `teof_cod_ofic`, `teof_num_tele` | Teléfonos de la oficina. FKs → `bcattel`, oficina. |

---

## 17. Técnicas / no-negocio

| Tabla | Columnas | Nota |
|---|---|---|
| `bcaremq` | `remq_cod_remq` (SERIAL), `remq_des_remq`, `remq_id1_remq` (BYTE), `remq_id2_remq` | Recursos/imágenes embebidas para reportes (contenido BYTE confirmado en muestra). No es módulo de negocio. |
| `bcaseqn` | `seqn_tab_seqn`, `seqn_val_seqn` | Contadores/secuencias por tabla (generación de PKs). Infraestructura interna. |
| `bcavaft` | `vaft_cod_vaft`, `vaft_des_vaft`, `vaft_lon_vaft`, `vaft_sel_vaft`, `vaft_tip_vaft` | Definición de validación/formato de campos de la UI. Técnica. |
| `bcavari` | `vari_cod_vari`, `vari_des_vari` | Variables internas del sistema (vacía en la VM). Config técnica. |

---

## Resumen del lote 2

- **144 tablas catalogadas** (100% del lote), agrupadas en **16 módulos de negocio** + 1 grupo técnico.
- Módulos de negocio identificados: Caja/Cajero, Ahorros/Captaciones, Créditos/Cartera/Riesgo,
  Cobranza judicial, Tesorería/Bancos, Cheques/Órdenes de emisión, Proveedores/Compras,
  Contabilidad/Presupuesto, Facturación electrónica/SRI/ATS, Reportes regulatorios SEPS/SIB,
  Seguros sobre garantías, RRHH/Nómina/Jornadas, Cliente/Socio socioeconómico,
  Seguridad/Menús, Parámetros/Configuración, Catálogos generales.
- **4 tablas técnicas/no-negocio**: `bcaremq`, `bcaseqn`, `bcavaft`, `bcavari`.
- Tablas con propósito no confirmado al 100% (catálogos chicos, se marcaron explícitamente):
  `bcapaco`, `bcaprcb`, `bcatico`, `bcatica`, `bcatcse`, `bcatese`, `bcapasd`, `bcatdpd`, `bcatdtc`.
- **Sin problemas de conexión con la VM** — respondió a la primera; no fue necesario reanudarla.
