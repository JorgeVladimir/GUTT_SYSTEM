# Catálogo de módulos — Lote 1 (`bca*`, 145 tablas)

Generado el 2026-07-13 contra la VM de pruebas Informix (`192.168.1.199:1526`, server `ol_servidor`,
base `afccajacrediapoyo`) usando `db/informix/introspeccion.js`. Trabajo de **catalogación pura, solo
lectura** — parte del inventario del core AFC. Se complementa con `db/informix/INVENTARIO_TABLAS.md`
(módulos Clientes, Créditos, DPF y Contabilidad-saldos ya documentados a fondo) y con los lotes 2 y 3
(en paralelo). Este lote cubre las tablas `bca*` desde `bcaabdv` hasta `bcahact`.

Método: columnas obtenidas en 5 batches de `syscolumns`+`systables` (IN() de ~30 tablas). Se muestrearon
solo tablas ambiguas; la mayoría de tablas de muestra estaban vacías en el ambiente de test (dato no
cargado), por lo que la clasificación es por **nombre + estructura de columnas**. `coltype`: mismo mapeo
que el inventario (`0=CHAR,1=SMALLINT,2=INTEGER,3=FLOAT,5=DECIMAL,6=SERIAL,7=DATE,10=DATETIME,13=VARCHAR`;
`NN`=NOT NULL). Convención de nombres AFC: prefijo tabla de 4 letras repetido en cada columna
(`xxxx_cod_yyyy` = FK a la tabla cuyo prefijo es `yyyy`).

> Nota de fusión: los códigos `cod_clie`→`bcaclie`, `cod_usua`→`bcausua`, `cod_ofic`→oficina,
> `cod_mone`→moneda, `cod_dpvi`→`bcadpvi`, `num_cred`→`bcacred`, `cod_dpfi`→`bcadpfi` son FKs
> recurrentes en todo el sistema; no se repiten en cada fila para no saturar.

---

## 1. Créditos / Cartera

Amortización, estados, calificación de riesgo, comisiones y pagos de crédito. Se conecta con `bcacred`
(master del préstamo, ya documentado en el inventario).

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcadivc` | `divc_num_divc`, `divc_num_cred`, `divc_cod_ediv`, `divc_fec_venc`, `divc_cap_divc`, `divc_cap_pago`, `divc_tas_divc`, `divc_int_plaz`, `divc_int_deve`, `divc_int_paga`, `divc_fec_pago` | **Dividendos/cuotas del crédito (tabla de amortización)** — una fila por cuota con capital/interés proyectado vs. pagado | `num_cred`→bcacred, `cod_ediv`→bcaediv, `cod_ccon` |
| `bcaabdv` | `abdv_cod_divc`, `abdv_cod_rubr`, `abdv_val_abdv`, `abdv_sal_abdv`, `abdv_cod_pape`, `abdv_cod_pago`, `abdv_fec_abdv` | Abono a dividendo — registra cada pago aplicado a una cuota (por rubro), con saldo resultante | `cod_divc`→bcadivc, `cod_rubr`, `cod_pape` (papeleta caja), `cod_pago` |
| `bcadetd` | `detd_cod_rubc`, `detd_num_cred`, `detd_cod_divc`, `detd_val_detd`, `detd_des_detd`, `detd_ban_detd` | Detalle de deuda por rubro/dividendo (desglose de lo que compone cada cuota) | `num_cred`, `cod_divc`, `cod_rubc` |
| `bcadirb` | `dirb_cod_divc`, `dirb_cod_rubc`, `dirb_val_dirb`, `dirb_val_sadi`, `dirb_val_paga` | Detalle de rubros por dividendo (valor, saldo disponible, pagado) | `cod_divc`, `cod_rubc` |
| `bcadfcr` | `dfcr_des_dfcr`, `dfcr_cap_cred`, `dfcr_tas_cred`, `dfcr_num_cuot`, `dfcr_cod_dtcr`, `dfcr_cod_dcre`, `dfcr_cod_tamo`, `dfcr_cod_ccre`, `dfcr_cod_lcre`, `dfcr_cod_eope` | **Plantilla/definición de producto de crédito** (valores por defecto: monto, tasa, cuotas, tipo amortización, línea) | `cod_lcre`→bcalcre, `cod_tamo`→bcatamo, `cod_dtcr`→bcadtcr, `cod_ccre` |
| `bcaccre` | `ccre_des_ccre`, `ccre_sib_ccre`, `ccre_nor_ccon`, `ccre_ven_ccon`, `ccre_rie_ccon`, `ccre_cca_ccre` | Categoría de crédito / calificación (mapea a cuentas contables normal/vencido/riesgo) | cuentas `ccon` |
| `bcacalf` | `calf_num_cred`, `calf_sal_cred`, `calf_val_prov`, `calf_cod_ccre`, `calf_val_venc`, `calf_dias_venc`, `calf_val_mora`, `calf_est_calf`, `calf_por_pcon` | **Calificación de cartera / cálculo de provisiones** por crédito (saldo, días vencidos, % provisión) | `num_cred`, `cod_ccre`→bcaccre |
| `bcacomi` | `comi_des_comi`, `comi_cod_ctas`, `comi_pct_comi`, `comi_val_comi`, `comi_cod_lcre`, `comi_ban_segu`, `comi_ban_cert` | Catálogo de comisiones de crédito (% o valor, cuenta contable, banderas seguro/certif) | `cod_ctas`, `cod_lcre`→bcalcre |
| `bcacocr` | `cocr_num_cred`, `cocr_cod_comi`, `cocr_val_cocr`, `cocr_impuesto` | Comisiones aplicadas a un crédito concreto | `num_cred`, `cod_comi`→bcacomi |
| `bcacpcr` | `cpcr_num_cred`, `cpcr_cod_dpvi`, `cpcr_val_cpcr` | Vincula el crédito a la cuenta vista de débito de cuotas | `num_cred`, `cod_dpvi`→bcadpvi |
| `bcadbau` | `dbau_num_cred`, `dbau_cod_dpvi` | Débito automático de cuota crédito ↔ cuenta vista | `num_cred`, `cod_dpvi` |
| `bcacrpg` | `crpg_cod_gara`, `crpg_cap_deud` | Capital deudor cubierto por cada garantía | `cod_gara`→bcagara |
| `bcacrrl` | `crrl_cod_clie`, `crrl_num_cred`, `crrl_val_crrl`, `crrl_est_crrl`, `crrl_cod_prdr`, `crrl_cod_orco` | Créditos relacionados / castigados / refinanciados (valor, estado, orden de cobro) | `num_cred`, `cod_orco` |
| `bcadtcr` | `dtcr_des_dtcr`, `dtcr_sib_dtcr`, `dtcr_cod_tdtc`, `dtcr_cod_ccre` | Catálogo destino del crédito | `cod_ccre` |
| `bcagcre` | `gcre_cod_gcre`, `grcre_des_gcre` | Catálogo de grupo de crédito | — |
| `bcaeope` | `eope_sib_eope`, `eope_des_eope`, `eope_per_mora`, `eope_per_ncap`, `eope_dia_venc`, `eope_pon_calf` | Catálogo de **estado de operación** de crédito (banderas de comportamiento: genera mora, no capitaliza, etc.) | `cod_mcco` |
| `bcaecre` | `ecre_cod_ecre`, `ecre_des_ecre` | Catálogo de estado del crédito (resuelve el `cred_cod_ecre` que quedó pendiente en el inventario) | — |
| `bcaediv` | `ediv_cod_ediv`, `ediv_des_ediv` | Catálogo de estado del dividendo/cuota | — |
| `bcaesol` | `esol_cod_esol`, `esol_des_esol` | Catálogo de estado de la solicitud de crédito | — |

---

## 2. Garantías y Bienes

Bienes en garantía (inmuebles, prendarios, títulos valor), avalúos y endosos/pólizas.

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcagbie` | `gtia_num_gtia`, `gbie_cod_sect`, `gbie_dir_bien`, `gbie_ava_catr`, `gbie_ava_cotr`, `gbie_fec_avca`, `gbie_num_cthi` (certif. historiado), `gbie_num_rgpr` (registro propiedad) | Bien inmueble en garantía — avalúos catastral/comercial, terreno/construcción, datos registrales | `num_gtia`→bcagtia, `cod_sect` |
| `bcagpre` | `gpre_num_gtia`, `gpre_cod_sect`, `gpre_dir_bien`, `gpre_ava_fact`, `gpre_fec_avfa` | Garantía prendaria (avalúo por factura) | `num_gtia` |
| `bcagtit` | `gtit_num_gtia`, `gtit_val_nomi`, `gtit_val_merc`, `gtit_can_gtia`, `gtit_cod_banc`, `gtit_fec_venc`, `gtit_cod_gtti` | Garantía tipo título/valor (nominal, mercado, banco emisor) | `num_gtia`, `cod_banc`, `cod_gtti` |
| `bcaagar` | `agar_num_cred`, `agar_cod_clie`, `agar_fec_agar`, `agar_ope_agar`, `agar_sib_agar` | Asignación/auditoría de garantías a un crédito (operación) | `num_cred`, `cod_clie` |
| `bcagtcr` | `gtcr_num_cred`, `gtcr_num_gtia`, `gtcr_val_gtcr` | Relación N:N crédito↔garantía con valor asignado | `num_cred`, `num_gtia` |
| `bcaendc` | `endc_num_gtia`, `endc_num_endc`, `endc_val_endc`, `endc_fec_inic`, `endc_fec_fini` | Endoso/póliza sobre el bien en garantía (vigencia) — posible ligado a seguros | `num_gtia` |
| `bcacgti` | `cgti_cod_cgti`, `cgti_des_cgti`, `cgti_cod_siba` | Catálogo de clase de garantía/título (con código SBS) | — |

---

## 3. Cobranza / Legal / Judicial

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcaabog` | `abog_cod_ofic`, `abog_cod_clie`, `abog_fec_ingr`, `abog_fec_sali`, `abog_cod_rubr` | Asignación de abogado / caso de cobranza judicial a un cliente (entrada/salida) | `cod_clie`, `cod_ofic` |
| `bcaejui` | `ejui_cod_ejui`, `ejui_des_ejui` | Catálogo de estado del juicio | — |

---

## 4. Depósitos a la Vista / Ahorros

Cuentas de ahorro a la vista y sus movimientos, bloqueos, firmas y provisiones de interés.

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcadpvi` | `dpvi_cod_tcdv`, `dpvi_cod_clie`, `dpvi_num_dpvi`, `dpvi_sal_disp`, `dpvi_sal_cont`, `dpvi_tas_dpvi`, `dpvi_cod_eacd`, `dpvi_cod_ofic`, `dpvi_fec_inic` | **Cuenta de depósito a la vista (ahorros)** — master de la cuenta con saldo disponible/contable (33 columnas) | `cod_tcdv`, `cod_clie`, `cod_eacd`→bcaeacd |
| `bcaandv` | `andv_cod_tanx`, `andv_cod_tcdv`, `andv_cod_dpvi`, `andv_valor`, `andv_val_inte`, `andv_ban_andv`, `andv_ofi_gene` | Notas de débito/crédito (anexos) sobre cuenta vista — ajustes de valor/interés | `cod_dpvi`, `cod_tcdv`, `cod_tanx` |
| `bcaavpic` | `avpic_cod_dpvi`, `avpic_cod_picn`, `avpic_val_avpic`, `avpic_fec_modi`, `avpic_tip_modi` | Ajuste de provisión de interés por cuenta (auditoría de modificaciones) | `cod_dpvi`, `cod_picn`, `cod_usua` |
| `bcabloq` | `bloq_cod_cban`, `bloq_valor`, `bloq_des_bloq`, `bloq_est_bloq`, `bloq_fec_bloq` | Bloqueos/retenciones de saldo (montos inmovilizados) | `cod_cban`, `cod_usua` |
| `bcafadv` | `fadv_cod_dpvi`, `fadv_cod_clie`, `fadv_num_fadv`, `fadv_est_fadv` | Firmas/autorizados adicionales sobre la cuenta vista | `cod_dpvi`, `cod_clie` |
| `bcaeacd` | `eacd_cod_eacd`, `eacd_des_eacd`, `eacd_sib_eacd` | Catálogo estado de la cuenta de depósito (activa/inactiva/…) | — |
| `bcacpan` | `cpan_cod_mcdv`, `cpan_det_cpan` | Detalle/concepto de movimiento de cuenta vista | `cod_mcdv` |

---

## 5. Ahorro Programado / Planes de Ahorro

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcadpln` | `dpln_cod_dpvi`, `dpln_cod_itrv`, `dpln_fec_venc`, `dpln_plz_dpln`, `dpln_tas_dpln`, `dpln_val_depo`, `dpln_rec_inte`, `dpln_fec_canc` | Plan de ahorro programado ligado a una cuenta vista (plazo, tasa, cuota) | `cod_dpvi`, `cod_itrv` |
| `bcabpln` | `bpln_cod_dpln`, `bpln_cod_clie`, `bpln_por_bpln`, `bpln_cnd_bpln` | Beneficiarios del plan de ahorro (% y condición) | `cod_dpln`→bcadpln, `cod_clie` |
| `bcadaut` | `daut_cod_dpln`, `daut_cod_dpvi`, `daut_dias_daut` | Débito automático que alimenta el plan desde una cuenta vista | `cod_dpln`, `cod_dpvi` |

---

## 6. Recaudación / Remesas entre oficinas (ANR)

Grupo "ahorro nacional / red" — transferencias de ahorro y valores enviados/recibidos entre oficinas o
corresponsales (usuario que envía vs. recibe).

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcaanrl` | `anrl_cod_depe`, `anrl_cod_eanr`, `anrl_usu_env`, `anrl_usu_rec`, `anrl_cod_dpvi`, `anrl_val_ahor`, `anrl_vta_envi`, `anrl_vta_reci`, `anrl_fec_proc`, `anrl_cod_ting` | Cabecera de remesa/recaudación entre dependencias (ahorro y valores env/rec) | `cod_depe`→bcadepe, `cod_eanr`→bcaeanr, `cod_dpvi` |
| `bcadanr` | `danr_cod_anrl`, `danr_num_cred`, `danr_cod_divc`, `danr_cod_rubc`, `danr_val_envi`, `danr_val_rece` | Detalle de la remesa (por crédito/dividendo/rubro) | `cod_anrl`→bcaanrl, `num_cred`, `cod_divc` |
| `bcaeanr` | `eanr_cod_eanr`, `eanr_des_eanr` | Catálogo de estado de la remesa | — |

---

## 7. Depósitos a Plazo Fijo (DPF)

Complementa el módulo DPF ya documentado (`bcadpfi`, `bcaedpf`, etc. en el inventario).

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcadepg` | `depg_cod_pgpf`, `depg_cod_tfpg`, `depg_cod_tran`, `depg_val_depg`, `depg_cod_caja`, `depg_fec_pago` | Pago de interés de DPF realizado (por caja) | `cod_pgpf`→bcapgpf, `cod_tfpg`, `cod_tran` |
| `bcadeip` | `deip_cod_pgpf`, `deip_cod_prms`, `deip_cod_tran`, `deip_val_dpii`, `deip_val_ipro`, `deip_fec_pape` | Detalle del interés pagado de DPF (interés puro vs. provisionado) | `cod_pgpf`, `cod_prms`, `cod_tran` |
| `bcadbpf` | `dbpf_cod_depg`, `dbpf_cod_dpvi`, `dbpf_cod_tran`, `dbpf_val_dbpf` | Débito/abono del DPF hacia una cuenta vista | `cod_depg`→bcadepg, `cod_dpvi` |
| `bcacrau` | `crau_cod_dpfi`, `crau_cod_rubr`, `crau_cod_dpvi` | Crédito/retención automática del DPF a una cuenta o rubro | `cod_dpfi`→bcadpfi, `cod_dpvi`, `cod_rubr` |
| `bcaanpf` | `anpf_cod_dpfi`, `anpf_des_anpf`, `anpf_cod_usua` | Anotaciones/observaciones sobre un DPF | `cod_dpfi` |

---

## 8. Contabilidad General

Comprobantes contables (cabecera + detalle = libro diario), plan de cuentas, saldos, parámetros y cierres.
**Hallazgo importante:** `bcacomp`+`bcadcom` (y su variante `bcaccom`+`bcacdco`) SÍ son el libro diario
transaccional de asientos que el inventario anterior no había localizado en el dominio contabilidad.

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcacomp` | `comp_cod_peri`, `comp_cod_tdoc`, `comp_num_comp`, `comp_fec_comp`, `comp_beneficia`, `comp_mayori`, `comp_anulado`, `comp_val_comp`, `comp_usu_anul`, `comp_fec_anul` | **Cabecera de comprobante contable (libro diario)** — nº, fecha, mayorizado/anulado, valor total | `cod_peri`, `cod_tdoc`, `cod_ofic` |
| `bcadcom` | `dcom_cod_comp`, `dcom_cod_ctas`, `dcom_cod_tasi` (D/H), `dcom_valor`, `dcom_may_dcom` | **Detalle del asiento** (cada línea debe/haber del comprobante) | `cod_comp`→bcacomp, `cod_ctas` |
| `bcaccom` | `ccom_cod_mese`, `ccom_cod_usua`, `ccom_cod_tdoc`, `ccom_num_ccom`, `ccom_fec_ccom`, `ccom_mayori`, `ccom_cod_ejer` | Comprobante contable (variante `c*`, posiblemente de conciliación/cierre mensual) | `cod_ejer`→bcaejer |
| `bcacdco` | `cdco_cod_ccom`, `cdco_cod_ctas`, `cdco_cod_tasi`, `cdco_val_cdco`, `cdco_may_cdco` | Detalle del comprobante `ccom` | `cod_ccom`→bcaccom, `cod_ctas` |
| `bcaccco` | `ccco_cod_ctas`, `ccco_cod_ccon`, `ccco_nom_ccon`, `ccco_cod_tcue`, `ccco_cod_mone` | Plan de cuentas / concepto contable (código, nombre, tipo cuenta) | `cod_mone` |
| `bcacsac` | `csac_cod_ctas`, `csac_cod_mese`, `csac_sal_debi`, `csac_sal_cred`, `csac_cod_ejer` | Saldos por cuenta contable y mes (balance de comprobación) | `cod_ctas`, `cod_ejer` |
| `bcadpap` | `dpap_cod_pape`, `dpap_cod_rubr`, `dpap_cod_ctas`, `dpap_cod_tasi`, `dpap_val_dpap` | Detalle contable de la papeleta de caja (asiento por transacción de ventanilla) | `cod_pape`, `cod_ctas` |
| `bcadoem` | `doem_cod_ooem`, `doem_cod_mone`, `doem_cod_ctas` | Mapeo de operación de caja/efectivo → cuenta contable | `cod_ctas`, `cod_mone` |
| `bcacont` | `cont_cod_ofic`, `cont_des_cont`, `cont_cta_ingr`, `cont_cod_usua` | Control/parametría contable por oficina (cuenta de ingreso) | `cod_ofic` |
| `bcacous` | `cous_cod_usua`, `cous_cod_cont`, `cous_ban_cous`, `cous_con_acti` | Usuarios habilitados por contabilidad/entidad | `cod_usua`, `cod_cont`→bcacont |
| `bcacpar` | `cpar_cod_cont`, `cpar_cod_paco`, `cpar_val_paco` | Parámetros contables (valor por parámetro `paco`) | `cod_cont`, `cod_paco` |
| `bcaejer` | `ejer_cod_cont`, `ejer_ani_ejer` | Ejercicio contable (año fiscal) por entidad | `cod_cont` |
| `bcacons` | `cons_cod_ejer`, `cons_ban_cons`, `cons_des_cons` | Consolidación/cierre por ejercicio | `cod_ejer`→bcaejer |
| `bcafcdi` | `fcdi_fec_fcdi`, `fcdi_cod_comp`, `fcdi_des_fcdi` | Lote/cierre diario ligado a comprobante (agrupa cheques y transacciones del día — ver módulo Cheques) | `cod_comp`→bcacomp |

---

## 9. Presupuesto

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcacpre` | `cpre_cod_cont`, `cpre_ani_pres`, `cpre_ani_refe`, `cpre_cod_mone`, `cpre_cie_pres` | Cabecera de presupuesto contable (año presupuestado vs. referencia, cierre) | `cod_cont`, `cod_mone` |

---

## 10. Caja / Efectivo / Papeletas

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcadeef` | `deef_cod_modu`, `deef_cod_movi`, `deef_cod_mone`, `deef_cod_caja`, `deef_fec_deef`, `deef_cod_tasi`, `deef_cod_pape` | Movimiento de efectivo en caja (ingreso/egreso por caja) | `cod_caja`, `cod_mone`, `cod_pape` |
| `bcadefe` | `defe_cod_deef`, `defe_cod_camb`, `defe_num_defe` | Detalle de denominaciones del movimiento de efectivo (arqueo) | `cod_deef`→bcadeef, `cod_camb`→bcacamb |
| `bcacamb` | `camb_cod_tdin`, `camb_val_camb`, `camb_val_seri` | Catálogo de denominaciones de billete/moneda (valor unitario) | `cod_tdin` |
| `bcadtot` | `dtot_cod_trcj`, `dtot_valor` | Totales por transacción de caja | `cod_trcj` |
| `bcadtra` | `dtra_cod_fcdi`, `dtra_cod_caja`, `dtra_cod_usua`, `dtra_cod_tafo` | Transacción de caja dentro de un lote/cierre (`fcdi`) | `cod_fcdi`→bcafcdi, `cod_caja` |
| `bcadpor` | `dpor_cod_orec`, `dpor_cod_depg` | Enlace orden de recaudación/egreso ↔ pago (detalle de orden de pago) | `cod_orec`, `cod_depg`→bcadepg |
| `bcachcj` | `chcj_cod_dchv`, `chcj_cod_clie`, `chcj_cod_deef`, `chcj_cod_pape` | Cheque de caja/gerencia emitido | `cod_dchv`→bcadchv, `cod_deef`, `cod_pape` |

---

## 11. Bancos / Tesorería / Conciliación

Cuentas de la cooperativa en otros bancos, sobregiros y conciliación bancaria.

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcacban` | `cban_cod_banc`, `cban_cod_tcba`, `cban_num_cban`, `cban_cod_ctas`, `cban_sal_disp`, `cban_sal_cont`, `cban_num_firm`, `cban_cod_ecba` | **Cuenta bancaria de la cooperativa** en un banco externo (saldo disp/contable) | `cod_banc`, `cod_ctas`, `cod_ecba`→bcaecba |
| `bcaconc` | `conc_ani_conc`, `conc_mes_conc`, `conc_cod_cban`, `conc_dif_conc`, `conc_sal_cuet`, `conc_sal_ante`, `conc_est_conc` | Conciliación bancaria mensual (saldo según banco vs. libros, diferencia) | `cod_cban`→bcacban |
| `bcacsob` | `csob_cod_tsob`, `csob_cod_cban`, `csob_val_csob`, `csob_est_csob`, `csob_fec_cadu` | Sobregiros/líneas sobre cuenta bancaria (monto, vigencia) | `cod_cban`, `cod_tsob` |
| `bcadmba` | `dmba_cod_mban`, `dmba_cod_tfpg`, `dmba_val_dmba` | Detalle de movimiento bancario por forma de pago | `cod_mban`, `cod_tfpg` |
| `bcabech` | `bech_cod_bech`, `bech_nom_bech`, `bech_dir_bech`, `bech_tel_bech` | Catálogo de bancos/entidades (para cheques) | — |
| `bcabxco` | `bxco_cod_bech`, `bxco_cod_comp` | Banco asociado a un comprobante | `cod_bech`→bcabech, `cod_comp`→bcacomp |
| `bcaenti` | `enti_cod_enti`, `enti_nom_enti` | Catálogo de entidades externas (instituciones financieras) | — |
| `bcaecba` | `ecba_cod_ecba`, `ecba_des_ecba` | Catálogo de estado de cuenta bancaria | — |

---

## 12. Cheques

Chequeras, cheques recibidos/depositados, y reglas de efectivización/diferimiento por banco.

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcadchv` | `dchv_cod_modu`, `dchv_cod_mcdv`, `dchv_cod_depg`, `dchv_cod_banc`, `dchv_num_ctab`, `dchv_num_dchv`, `dchv_ban_efec`, `dchv_valor`, `dchv_est_ante`, `dchv_est_actu`, `dchv_cod_fcdi`, `dchv_cod_tfpg` | Cheque recibido/depositado en cuenta (valor, banco, nº cuenta, efectivizado, estados) | `cod_banc`, `cod_fcdi`→bcafcdi, `cod_tfpg` |
| `bcachra` | `chra_cod_cban`, `chra_cod_ecba`, `chra_num_chra`, `chra_num_chqi`, `chra_num_chqf`, `chra_cod_empl` | Chequera (rango de cheques desde/hasta) sobre una cuenta bancaria | `cod_cban`→bcacban |
| `bcadfcd` | `dfcd_cod_fcdi`, `dfcd_cod_tfpg`, `dfcd_val_dfcd` | Detalle de cheques por lote de cobro (`fcdi`) y forma de pago | `cod_fcdi`→bcafcdi, `cod_tfpg` |
| `bcaddte` | `ddte_cod_mcdv`, `ddte_cod_tfpg`, `ddte_val_ddte`, `ddte_efe_dias`, `ddte_ban_umbr` | Diferimiento/efectivización de cheques (días para hacer efectivo) | `cod_mcdv`, `cod_tfpg` |
| `bcadefz` | `defz_cod_banc`, `defz_cod_tfpg`, `defz_dia_efec` | Días de efectivización por banco y forma de pago | `cod_banc`, `cod_tfpg` |
| `bcaefba` | `efba_cod_tfpg`, `efba_cod_banc`, `efba_num_dias` | Efectivización banco↔forma de pago (nº días) | `cod_banc`, `cod_tfpg` |
| `bcadsem` | `dsem_cod_dsem`, `dsem_des_dsem`, `dsem_dia_efec` | Catálogo día de la semana con días de efectivización | — |
| `bcaegch` | `egch_cod_egch`, `egch_nom_egch` | Catálogo de estado del cheque | — |

---

## 13. Impuestos y Retenciones (SRI)

Retenciones en la fuente en compras, ventas, rendimientos financieros e IVA.

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcacrfi` | `crfi_cod_crfi`, `crfi_des_crfi`, `crfi_por_rete`, `crfi_fec_ini`, `crfi_fec_fin`, `crfi_cta_comp`, `crfi_cod_form` | Catálogo de conceptos de retención (código SRI, % vigente, cuenta contable) | `cod_form`→bcaform |
| `bcadrtc` | `drtc_tlco_cod_tlco`, `drtc_crfi_cod_secu`, `drtc_bas_impo`, `drtc_por_rete`, `drtc_mon_rete`, `drtc_cod_dcom` | Retención aplicada en compras (base, %, monto) | `crfi_cod_secu`→bcacrfi, `cod_dcom`→bcadcom |
| `bcadrti` | `drti_teim_cod_teim`, `crfi_cod_secu`, `drti_bas_impo`, `drti_por_rete`, `drti_mon_rete` | Retención de IVA/impuesto (por tipo `teim`) | `crfi_cod_secu`, `cod_teim` |
| `bcadrtr` | `drtr_refi_cod_refi`, `crfi_cod_secu`, `drtr_tot_depo`, `drtr_bas_imre`, `drtr_por_rete`, `drtr_mon_rere` | Retención sobre rendimientos financieros (intereses pagados a socios) | `crfi_cod_secu`, `cod_refi` |
| `bcadrtv` | `drtv_cod_tlve`, `drtv_cod_crfi`, `drtv_bas_impo`, `drtv_por_rete`, `drtv_mon_rete` | Retención en ventas | `cod_crfi`→bcacrfi, `cod_tlve` |

---

## 14. Facturación Electrónica / SRI

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcacoan` | `coan_fec_ingr`, `idif_ruc_info`, `tpco_cod_tpco`, `coan_num_sees/sepe/sein/sefi`, `coan_num_auto`, `coan_fec_emis` | Comprobante/autorización SRI (RUC informante, secuenciales, nº autorización, fecha emisión) — facturación electrónica | `usua_cod_usua`, `tpco_cod_tpco` |

---

## 15. Reportes Regulatorios (SEPS / SIB)

Estructuras de estados financieros y archivos regulatorios de la Superintendencia (SEPS/SIB) y variables.

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcaesfe` | `esfe_des_esfe`, `esfe_cod_ccon`, `esfe_cod_grup`, `esfe_ban_efec/inve/fina/oper`, `esfe_ban_igcl`, `esfe_ban_utpr` | **Estructura del Estado de Situación Financiera** — mapea cuentas contables a rubros del ESF (muestra real: "Fondos disponibles", "Inversiones") | `cod_ccon`, `cod_grup`→bcagrup |
| `bcaeesf` | `eesf_cod_esfe`, `eesf_cod_esac`, `eesf_des_eesf`, `eesf_val_eesf` | Detalle/valores del ESF por período | `cod_esfe`→bcaesfe, `cod_esac` |
| `bcaesep` | `esep_des_esep`, `esep_ban_caso`, `esep_cas_ccon`, `esep_ban_rele/rees/repa/appa/reac/reej` + cuentas asociadas | Estructura de reporte SEPS (banderas por tipo de cartera: casos, refinanciada, reestructurada, etc.) | cuentas `ccon` |
| `bcaesrf` | `esrf_cod_esrf`, `esrf_nom_esrf` | Catálogo de estado/tipo de reporte financiero | — |
| `bcadtac` | `dtac_cod_tafi`, `dtac_num_dtac`, `dtac_nom_dtac`, `dtac_abr_dtac` | Detalle de estructura de archivo financiero regulatorio | `cod_tafi` |
| `bcaffin` | `ffin_dec_ffin`, `ffin_sib_ffin` | Catálogo de forma de financiamiento (código SIB) | — |
| `bcadvar` | `dvar_cod_vari`, `dvar_ani_dvar`, `dvar_mes_dvar`, `dvar_val_dvar` | Valores mensuales de variables/indicadores (ej. inflación, para reajustes) | `cod_vari` |

---

## 16. Clientes / Socios

Datos complementarios del socio (ya documentado el master `bcaclie` en el inventario).

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcaclna` | `clna_cod_clie`, `clna_cod_eciv`, `clna_cod_sexo`, `clna_cod_intr`, `clna_cod_sect`, `clna_jef_hoga`, `clna_dir_trab` | Datos socioeconómicos adicionales del cliente (estado civil, sexo, sector, jefe de hogar) | `cod_clie`, `cod_eciv`→bcaeciv, `cod_sect` |
| `bcacfam` | `cfam_cod_clie`, `cfam_cod_tcfa`, `cfam_nom_cfam`, `cfam_ide_cfam`, `cfam_cod_fami` | Familiares/referencias del cliente | `cod_clie`, `cod_tcfa` |
| `bcacfir` | `cfir_cod_cban`, `cfir_cod_clie`, `cfir_cod_tfir` | Firmas registradas del cliente (por tipo de firma) | `cod_clie`, `cod_tfir` |
| `bcabene` | `bene_cod_clie`, `bene_cod_cben`, `bene_cod_tben`, `bene_porcent`, `bene_condici` | Beneficiarios del cliente (% y condición) | `cod_clie`, `cod_tben` |
| `bcading` | `ding_cod_ineg`, `ding_cod_clie`, `ding_val_deta`, `ding_fec_actu` | Ingresos declarados por el cliente (por tipo de negocio/ingreso) | `cod_clie`, `cod_ineg` |
| `bcacdso` | `cdso_cod_clie`, `cdso_ani_cdso`, `cdso_val_ut01..ut12`, `cdso_val_util` | Excedentes/utilidades distribuidas al socio por mes del año (12 columnas mensuales) | `cod_clie` |
| `bcafsal` | `fsal_cod_clie`, `fsal_cod_csal`, `fsal_fec_ingr`, `fsal_fec_sali` | Ficha de situación del socio (entrada/salida de un estado, p.ej. lista de control) | `cod_clie`, `cod_csal`→bcacsal |
| `bcacsal` | `csal_cod_csal`, `csal_des_csal`, `csal_est_clie`, `csal_sib_csal` | Catálogo de situación del socio | — |
| `bcaeciv` | `eciv_cod_eciv`, `eciv_des_eciv`, `eciv_eda_eciv` | Catálogo de estado civil | — |
| `bcaeafi` | `eafi_cod_eafi`, `eafi_nom_eafi` | Catálogo de estado de afiliación del socio *(tentativo — 2 columnas, semántica no confirmada)* | — |
| `bcaesac` | `esac_cod_esac`, `esac_des_esac` | Catálogo de estado (socio/solicitud) *(tentativo — semántica no confirmada)* | — |

---

## 17. RRHH / Nómina

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcaemdp` | `emdp_cod_empl`, `emdp_cod_depa`, `emdp_cod_tdpd`, `emdp_cod_ereg`, `emdp_cod_jefe`, `emdp_fec_ing`, `emdp_fec_sal`, `emdp_val_suel` | Empleado ↔ departamento/cargo, con sueldo y fechas de ingreso/salida | `cod_depa`→bcadepa, `cod_ereg`→bcaereg |
| `bcacarg` | `carg_cod_tica`, `carg_nom_carg`, `carg_sib_carg` | Catálogo de cargos/puestos | `cod_tica` |
| `bcaereg` | `ereg_cod_ereg`, `ereg_des_ereg`, `ereg_sib_ereg` | Catálogo de régimen/estado laboral *(tentativo)* | — |

---

## 18. Activos Fijos

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcahact` | `hact_cod_acti`, `hact_val_acti`, `hact_tie_acti`, `hact_fec_ingr`, `hact_fec_hact`, `hact_cod_comp` | Historial del activo fijo (valor, tiempo de vida, comprobante contable) — soporta depreciación | `cod_acti`, `cod_comp`→bcacomp |
| `bcaacem` | `acemi_cod_acti`, `acem_est_actu`, `acem_cod_empl`, `acem_fec_acem`, `acem_ope_acem` | Asignación/custodia del activo a un empleado (operación, estado) | `cod_acti`, `cod_empl` |
| `bcaaeac` | `aeac_cod_acti`, `aeac_est_ante`, `aeac_fec_aeac`, `aeac_ope_aeac` | Auditoría de cambio de estado del activo | `cod_acti` |

---

## 19. Organización / Sucursales / Dependencias

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcadepe` | `depe_nom_depe`, `depe_cod_ciud`, `depe_dir_depe`, `depe_telefono`, `depe_coordina` | Dependencia/agencia (nombre, ciudad, dirección) | `cod_ciud`→bcaciud |
| `bcadepa` | `depa_des_depa`, `depa_cod_dsup`, `depa_cod_ndep`, `depa_abr_depa` | Departamento (con jerarquía vía `cod_dsup`) | `cod_dsup`→bcadepa (self) |
| `bcaddep` | `ddep_cod_depa`, `ddep_nom_ddep`, `ddep_abr_ddep` | Sub-detalle/sección del departamento | `cod_depa`→bcadepa |
| `bcadecl` | `decl_cod_depe`, `decl_cod_clna` | Cliente asignado a una dependencia | `cod_depe`→bcadepe, `cod_clna`→bcaclna |
| `bcadect` | `dect_cod_depe`, `dect_cod_ctas` | Cuenta contable asignada a una dependencia | `cod_depe`, `cod_ctas` |

---

## 20. Seguridad / Accesos / Auditoría

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcaaper` | `aper_cod_perf`, `aper_cod_opci`, `aper_ctr_opci` | Permisos por perfil (opción de menú + nivel de control) | `cod_perf`→bcaperf, `cod_opci` |
| `bcaacer` | `acer_fec_acer`, `acer_ter_acer`, `acer_usa_acer`, `acer_pas_acer`, `acer_ban_acer`, `acer_usu_acer`, `acer_fcc_acer` | Registro de acceso/credenciales por terminal (bitácora de sesión) | — |
| `bcaapp` | `app_cod_modu`, `app_computer`, `app_fecha` | Registro de app/módulo abierto por computador (control de sesiones concurrentes) | `cod_modu` |
| `bcaerro` | `erro_cod_bbdd`, `erro_cod_erro`, `erro_det_erro`, `erro_ico_erro` | Catálogo de mensajes de error del sistema | `cod_bbdd`→bcabbdd |

---

## 21. Divisas / Tipo de Cambio

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcacoti` | `coti_fec_coti`, `coti_cod_mone`, `coti_val_comp`, `coti_val_vent`, `coti_val_inte` | Cotización de moneda por fecha (compra/venta) | `cod_mone` |
| `bcadmon` | `dmon_cod_dmon`, `dmon_des_dmon`, `dmon_cod_modu` | Configuración de moneda por módulo | `cod_modu` |

---

## 22. Configuración / Parámetros / Catálogos generales

| Tabla | Columnas relevantes | Propósito inferido | FKs evidentes |
|---|---|---|---|
| `bcacoop` | `coop_nom_coop`, `coop_sib_coop`, `coop_ruc_coop`, `coop_cod_segm`, `coop_lim_indi`, `coop_lim_vincu`, `coop_val_sbu`, `coop_age_rete`, `coop_logotipo` | **Datos maestros de la institución (la cooperativa)** — RUC, segmento SEPS, límites de cupo individual/vinculado, SBU, agente de retención | — |
| `bcaciud` | `ciud_cod_prov`, `ciud_nom_ciud`, `ciud_sib_ciud` | Catálogo de ciudades (por provincia) | `cod_prov` |
| `bcaestr` | `estr_des_estr`, `estr_dig_estr`, `estr_ord_estr` | Estructura de códigos (nº dígitos por nivel — p.ej. plan de cuentas) | — |
| `bcaflib` | `flib_cod_tlib`, `flib_des_flib`, `flib_num_line`, `flib_cam_fech/depo/reti/sald/docu`, `flib_tam_letr` | Formato de impresión de libreta/libro (posiciones de columnas) | `cod_tlib` |
| `bcadecb` | `decb_cod_flib`, `decb_cam_*`, `decb_esp_*` (soci/dpvi/clie/tcdv/fech/iden/dire) | Configuración de campos/posiciones de la libreta | `cod_flib`→bcaflib |
| `bcafxtc` | `fxtc_cod_tcdv`, `fxtc_num_pagi`, `fxtc_cod_flib`, `fxtc_lad_fxtc` | Formato de libreta por tipo de cuenta vista | `cod_tcdv`, `cod_flib`→bcaflib |
| `bcaform` | `form_cod_tfor`, `form_des_form`, `form_dws_name`, `form_cod_paco` | Catálogo de formularios/reportes (`dws_name` = DataWindow PowerBuilder) | `cod_paco` |
| `bcafret` | `fret_xpo_fret`, `fret_ypo_fret`, `fret_des_fret`, `fret_ban_fret` | Coordenadas X/Y de campos para impresión (comprobante de retención) | — |
| `bcaftnt` | `ftnt_cod_ftnt`, `ftnt_des_ftnt`, `ftnt_for_ftnt`, `ftnt_tip_ftnt` | Catálogo de formato de nota/texto | — |
| `bcafpsd` | `fpsd_cod_fpsd`, `fpsd_des_fpsd`, `fpsd_cod_pasd` | Catálogo de forma de pago (parametría) | `cod_pasd` |
| `bcacatr` | `catr_cod_sib`, `catr_des_catr`, `catr_por_apli`, `catr_por_real`, `catr_val_catr`, `catr_cod_modu`, `catr_fec_fina` | Tarifas/porcentajes aplicables por módulo (con código SBS y vigencia) | `cod_modu` |
| `bcaanme` | `anme_num_anio`, `anme_des_mes`, `anme_num_mes` | Catálogo año-mes (nombres de meses) | — |
| `bcadfes` | `dfes_anio`, `dfes_fec_dfes`, `dfes_des_dfes`, `dfes_ctr_dfes` | Días festivos/feriados (afectan cálculo de vencimientos) | — |
| `bcadiad` | `diad_cod_diad`, `diad_des_diad` | Catálogo (rangos de días / código genérico) *(tentativo)* | — |
| `bcagrup` | `grup_cod_grup`, `grup_des_grup` | Catálogo de grupo genérico (usado por estructuras de reportes, ej. `bcaesfe`) | — |
| `bcafcin` | `fcin_cod_fcin`, `fcin_des_fcin` | Catálogo genérico *(2 columnas, semántica no confirmada)* | — |
| `bcacore` | `core_cod_core`, `core_des_core` | Catálogo genérico *(código+descripción, semántica no confirmada — posible correo/cargo)* | — |
| `bcacoac` | `coac_cod_coac`, `coac_ord_coac` | Catálogo genérico con orden *(semántica no confirmada)* | — |

---

## 23. Técnicas / No-negocio

| Tabla | Columnas | Motivo |
|---|---|---|
| `bcactrl` | `field_1 … field_21` (mezcla VARCHAR/DECIMAL genéricos) | Tabla de staging/importación genérica sin semántica de negocio (columnas auto-nombradas `field_N`) — NO es un módulo de negocio |
| `bcabbdd` | `bbdd_cod_bbdd`, `bbdd_des_bbdd` | Catálogo interno de bases de datos/entornos, referenciado por `bcaerro` — infraestructura, no negocio |

---

## Resumen del lote 1

- **145 tablas** catalogadas (`bcaabdv` … `bcahact`).
- **21 módulos de negocio** distintos identificados: Créditos/Cartera, Garantías y Bienes, Cobranza/Legal,
  Depósitos a la Vista, Ahorro Programado, Recaudación/Remesas (ANR), DPF, Contabilidad, Presupuesto,
  Caja/Efectivo, Bancos/Tesorería, Cheques, Impuestos/Retenciones, Facturación Electrónica, Reportes
  Regulatorios SEPS/SIB, Clientes/Socios, RRHH/Nómina, Activos Fijos, Organización/Sucursales,
  Seguridad/Auditoría, Divisas.
- **2 tablas técnicas/no-negocio**: `bcactrl` (staging genérico), `bcabbdd` (catálogo interno de entornos).
- Hallazgos relevantes para fusión: (1) `bcacomp`+`bcadcom` son el **libro diario transaccional** que el
  inventario previo no había ubicado; (2) `bcaecre` resuelve el catálogo de estado de crédito que quedó
  pendiente; (3) `bcacoop` es el master institucional con límites regulatorios de cupo.
