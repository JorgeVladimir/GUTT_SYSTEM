# Catálogo de módulos — Lote 3 (`afc*` + tablas sueltas) — Informix legacy `afccajacrediapoyo`

Generado el 2026-07-13 contra la VM de pruebas (`192.168.1.199:1526`, server `ol_servidor`) con
`db/informix/introspeccion.js`. Cataloga las **140 tablas** de `db/informix/_batch3_afc_otros.json`
(lote 3 de 3; los lotes 1 y 2 cubren las tablas `bca*`). Trabajo de **solo lectura** para fusionarse luego
con `INVENTARIO_TABLAS.md` y los catálogos de los otros lotes en un mapa único de módulos del sistema AFC.

Metodología: columnas vía `syscolumns`/`systables` en 4 lotes de `IN(...)`; muestreo puntual sólo para
tablas ambiguas. `coltype` normalizado a nombre (`!` = variante `NOT NULL`, es decir código base + 256).
Convención de nombres AFC: prefijo de 3 letras del "objeto" repetido en cada columna
(`xxx_cod_xxx` = PK; `xxx_des_xxx` = descripción; `xxx_sib_xxx`/`xxx_sri_xxx` = código regulatorio
Superintendencia de Bancos-SEPS / SRI; `xxx_ban_xxx` = bandera SMALLINT activo/inactivo;
`cod_usua`/`fec_*` = auditoría). Se omiten columnas de auditoría genéricas salvo cuando aportan.

**FK inferidas frecuentes** (referencian tablas de otros lotes / del inventario base):
`cod_clie → bcaclie` (socio/cliente), `num_cred → bcacred` (crédito), `cod_dpvi → bcadpvi` (cuenta a la
vista), `cod_dpfi → bcadpfi` (DPF), `cod_ofic → bcaofic` (oficina), `cod_usua → bcausua` (usuario),
`cod_ctas → afcctar` (plan de cuentas), `cod_ccon` (cuenta contable regulatoria SEPS).

---

## 1. CRÉDITOS / CARTERA (extiende `bcacred`)

Tablas transaccionales y de historial del ciclo de vida del crédito.

| Tabla | Columnas relevantes | Propósito / FKs |
|---|---|---|
| `afcddic` ★ | `ddic_num_divc, ddic_num_cred, ddic_fec_divc, ddic_cod_ediv, ddic_cap_divc, ddic_int_plaz, ddic_int_deve, ddic_val_mora, ddic_val_segd, ddic_val_otro` (DEC) | **Tabla de dividendos (cuotas) del crédito** — cronograma de amortización desglosado por capital, interés al plazo, interés devengado, mora, seguro de desgravamen y otros. FK `num_cred → bcacred`, `cod_ediv` = estado del dividendo |
| `afcdcal` | `dcal_num_cred, dcal_fec_calf, dcal_num_divc, dcal_val_dcal, dcal_val_inte, dcal_val_deve, dcal_cod_ediv` | Calificación / recálculo por dividendo del crédito (interés y devengado a una fecha de corte) |
| `afchdir` | `hdir_cod_divc, hdir_cod_rubr, hdir_val_ante, hdir_val_dirb, hdir_fec_hdir, hdir_est_hdir` | Historial de recálculo de dividendos/rubros (valor anterior → valor recalculado). Trazabilidad de reliquidaciones |
| `afccrce` | `crce_num_cred, crce_ecr_ante, crce_ecr_actu, crce_sal_cred, crce_obs_crce, crce_cod_pape` | Historial de cambios de estado del crédito (ya listada en el inventario base; incluida por completitud) |
| `afcsacr` | `sacr_num_cred, sacr_val_sacr` | Saldo/abono puntual asociado a un crédito |
| `afcencr` | `encr_num_cred, encr_cod_dpvi, encr_val_encr, encr_por_encr, encr_cod_picn` | **Encaje del crédito**: cuenta a la vista (`bcadpvi`) bloqueada como respaldo, con monto y % de encaje |
| `afcgaul` | `gaul_num_gtia, gaul_cod_dpfi, gaul_val_gaul, gaul_val_dpfi, gaul_fec_inic, gaul_fec_fina` | **Garantía autoliquidable**: DPF (`bcadpfi`) pignorado como garantía de un crédito |
| `afcdssc` | `dssc_cod_socr, dssc_num_cred, dssc_val_cred, dssc_sal_cred` | Deuda/saldo por socio garante en un crédito (`socr` = socio corresponsable) |
| `afcdecr` | `decr_num_cred, decr_cod_deop, decr_nom_arch, decr_fec_ingr` | Documentos/archivos adjuntos al expediente de crédito (ya en inventario base) |
| `afchicr` | `hicr_num_cred, hicr_cod_clie, hicr_des_ecre, hicr_des_ccre, hicr_cap_cred, hicr_cod_calf, hicr_dia_venc, hicr_val_inte, hicr_val_mora` | Snapshot histórico del crédito por cliente (estado, calificación, días de vencimiento) — insumo de buró/central de riesgos |

**Catálogos de crédito:**

| Tabla | Columnas | Rol |
|---|---|---|
| `afcdcre` | `dcre_cod_dcre, dcre_des_dcre, dcre_sib_dcre, dcre_cod_ccre, dcre_est_dcre` | Catálogo destino/concepto del crédito (variante `afc`) |
| `afcdeop` | `deop_cod_eope, deop_des_deop, deop_pri_deop, deop_dws_name` | Catálogo de estados de operación (con nombre de DataWindow PowerBuilder `dws_name`) |
| `afcectr` | `ectr_cod_ectr, ectr_des_ectr, ectr_sib_ectr` | Catálogo estado de crédito/trámite |
| `afccega` | `cega_cod_cega, cega_des_cega, cega_sib_cega` | Catálogo de causas de movimiento de garantía. Muestra real: `"SUSTITUCION DE GARANTIA"`, `"ORDEN JUDICIAL"` |
| `afctdeu` | `tdeu_cod_tdeu, tdeu_des_tdeu, tdeu_sib_tdeu` | Catálogo tipo de deuda |
| `afcbprm` | `bprm_val_mora, bprm_dia_bprm, bprm_mes_bprm, bprm_ani_bprm` | Parámetros de cálculo de mora (base día/mes/año) |

---

## 2. RIESGO / CALIFICACIÓN DE CARTERA / PROVISIONES

Matrices de provisión por días de mora y calificación de riesgo por cliente/socio.

| Tabla | Columnas relevantes | Propósito / FKs |
|---|---|---|
| `afcbrco` | `brco_val_7, brco_val_15, brco_val_30, brco_val_60, brco_val_90, brco_val_180, brco_val_360, brco_val_99999, brco_cod_ineg, brco_esc_brco` (DEC) | **Bandas de provisión por buckets de días de mora** (7/15/30/60/90/180/360/∞). FK `cod_ineg → bcaineg` (segmento/línea de negocio) |
| `afcbrec` | `brec_val_brec, brec_cod_ineg, brec_val_band, brec_esc_brec` | Bandas de recuperación esperada por segmento |
| `afccavo` | `cavo_num_cavo, cavo_val_fon1..5, cavo_val_cal1..5, cavo_val_pro1..5, cavo_fec_repr` | Calificación de activos de riesgo en 5 tramos (fondo/calificación/provisión) por fecha de reproceso. *(Vacía en la VM de test)* |
| `afcdrie` | `drie_cod_clie, drie_cod_riec, drie_cod_ineg, drie_val_drie, drie_est_drie` | Evaluación de riesgo del **cliente** por categoría (`riec`) y segmento (`ineg`) |
| `afcdrso` | `drso_cod_socr, drso_cod_drie, drso_cod_riec, drso_cod_ineg, drso_val_drso` | Evaluación de riesgo del **socio garante** (mismo esquema que `afcdrie`) |
| `afcddri` | `ddri_cod_drie, ddri_val_ddri, ddri_val_pond, ddri_ref_ddri` | Detalle/ponderación de cada factor de riesgo evaluado |

**Catálogos de riesgo:**

| Tabla | Columnas | Rol |
|---|---|---|
| `afcriec` | `riec_cod_riec, riec_des_riec, riec_cod_ineg` | Catálogo de categorías de riesgo económico por segmento |
| `afccrie` | `crie_cod_crie, crie_des_crie, crie_sib_crie` | Catálogo de calificación de riesgo (código regulatorio SIB) |

---

## 3. COBRANZA / GESTIÓN DE COBRO

| Tabla | Columnas relevantes | Propósito / FKs |
|---|---|---|
| `afcgcab` | `gcab_cod_gcab, gcab_fec_gcab, gcab_cod_usua` | Cabecera de corrida/lote de gestión de cobranza |
| `afcgccr` | `gccr_cod_gcab, gccr_num_cred, gccr_num_clie, gccr_val_capi, gccr_val_inte, gccr_val_mora, gccr_val_deud, gccr_fec_venc, gccr_num_dias, gccr_sal_cred, gccr_est_calf` | **Detalle de gestión de cobranza por crédito** (snapshot de deuda vencida: capital, interés, mora, días de atraso). FK `cod_gcab → afcgcab`, `num_cred → bcacred` |
| `afcgdco` | `gdco_num_cred, gdco_cod_clie, gdco_cod_esta, gdco_cod_tipo, gdco_det_gdco, gdco_val_gdco, gdco_ant_gtes, gdco_fec_comp` | Gestión de cobro individual (contacto/compromiso de pago); `ant_gtes → afcgtes` (gestor) |

**Catálogo:** `afcgtes` (`gtes_cod_gtes, gtes_abr_gtes, gtes_des_gtes, gtes_rec_gtes`) — catálogo de gestores/tipos de gestión de cobranza.

---

## 4. COBRANZA JUDICIAL / COACTIVA / LEGAL

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afclcoa` | `lcoa_num_juic, lcoa_num_secu, lcoa_ide_lcoa, lcoa_nom_lcoa, lcoa_val_rete, lcoa_fec_carg, lcoa_fec_fina, lcoa_ban_lcoa` | **Proceso coactivo/judicial**: personas con juicio (`num_juic`) y retención (`val_rete`) |
| `afclcos` | `lcos_tid_lcos, lcos_ide_lcos, lcos_nom_lcos, lcos_fec_inic, lcos_fec_fina, lcos_ban_lcos` | Lista de control de personas (por tipo+número de identificación, con vigencia). Screening / bloqueo |
| `afclces` | `lces_cod_clie, lces_det_lces, lces_est_adic` | Lista de clientes con condición/observación especial. *(Vacía en test — propósito tentativo)* |

Relación laboral / vínculos del cliente (usados también en originación de crédito):
- `afccltr` (`clrl_cod_clie, clrl_cod_trla, clrl_fec_clrl, clrl_est_clrl`) — vincula cliente ↔ relación laboral.
- `afctrla` (`trla_cod_trla, trla_des_trla, trla_sib_trla`) — catálogo de tipos de relación laboral.

---

## 5. PREVENCIÓN DE LAVADO DE ACTIVOS (UAFE / AML)

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `uaf3_transacciones` | `clie_ide_clie, uaf_fec_tran, uaf_num_tran, uaf_num_ctas, uaf_val_debi, uaf_val_cred, uaf_val_efec, uaf_val_chqs, uaf_val_tota, uaf_cod_tran, uaf_sib_pais, uaf_imp_isd, uaf_cod_prod` | **Estructura de reporte de transacciones a la UAFE** (efectivo, cheques, ISD = impuesto salida de divisas). Todos los campos como CHAR = layout de archivo plano regulatorio |
| `uaf2_productos` | `clie_ide_clie, uaf_tip_ctas, uaf_num_cuet, uaf_sib_ofic, uaf_sib_coop, uaf_fec_cort` | Estructura de reporte de productos/cuentas por socio a la UAFE |
| `afchomo` | `homo_nom_tide, homo_ide_homo, homo_ape_homo, homo_nom_homo, homo_nac_homo, homo_fec_carg, homo_fec_fina` | **Lista de homónimos** (screening de nombres contra listas de control OFAC/ONU/PEP) |
| `afclhom` | `lhom_cod_lhom, lhom_fec_lhom, lhom_ide_homo, lhom_cod_usua` | Bitácora de consultas realizadas contra la lista de homónimos |

> Nota compliance: `uaf2/uaf3` son estructuras de salida de datos (todo CHAR/formateado). No hay que
> escribir sobre ellas; se regeneran desde las tablas transaccionales para el envío periódico a la UAFE.

---

## 6. REPORTES REGULATORIOS (SEPS / Superintendencia)

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afcfval` | `fval_cod_fval, fval_cod_form, fval_cam_31 … fval_cam_922` (≈145 columnas `cam_NNN`, casi todas DEC) | **Valores de formularios/estructuras regulatorias** — una fila por reporte, columnas = casilleros numerados del formulario. Genérica multi-formulario (`cod_form`) |
| `afcfval_103` | `fval_cod_fval, fval_cod_form, fval_cam_101…307` | Variante de estructura para el formulario 103 (retenciones en la fuente SRI) |
| `afcvind` | `vind_cod_indi, vind_val_indi, vind_ani_indi, vind_mes_indi, vind_val_nume, vind_val_deno` | Valores mensuales de indicadores financieros (numerador/denominador del ratio) |
| `afctope` | `tope_cod_tope, tope_des_tope, tope_sib_tope, tope_cod_segm` | Catálogo de topes/segmentos SEPS (segmento de la cooperativa) |
| `afccvca` | `cvca_des_cvca, cvca_sib_cvca, cvca_cod_recu/rec2/rec3` | **Clasificación de finanzas verdes / ambiental** del crédito. Muestra real: `"Prevención y conservación ambiental"`, `"Mitigación de Cambio Climático"` |
| `afcedad` | `edad_cod_edad, edad_des_desc, edad_val_inic, edad_val_fina` | Catálogo de rangos etarios (para reportes demográficos regulatorios) |

---

## 7. FACTURACIÓN ELECTRÓNICA / SRI (Ventas, Compras, Retenciones)

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afcdtlv` | `dtlv_cod_tlve, dtlv_cod_dcom, dtlv_val_dtlv, dtlv_cod_iva/por_iva/val_iva, dtlv_cod_ice/val_ice, dtlv_cod_irbp/val_irbp, dtlv_val_unit, dtlv_val_desc` | Detalle de líneas de **venta/factura** con impuestos (IVA, ICE, IRBP de plásticos) |
| `afcdtlc` | `dtlc_cod_tlco, dtlc_cod_prod, dtlc_can_prod, dtlc_cod_ctas, dtlc_val_dtlc, dtlc_cod_iva/mon_iva, dtlc_cod_reti/tip_rete/mon_rete` | Detalle de líneas de **compra/liquidación** con IVA y retención; imputa a cuenta contable (`cod_ctas`) |
| `afcdtre` | `dtre_cod_tlco, dtre_cod_tide, dtre_ide_idpr, dtre_num_sees, dtre_num_sepe, dtre_num_secu, dtre_num_auto, dtre_val_dtre, dtre_mon_iva` | Detalle de **comprobante de retención** SRI (estab. / punto emisión / secuencial / autorización) |
| `afctlnc` | `tlnc_cod_comp, tlnc_ruc_coop, tlnc_num_sees/sepe/secu, tlnc_num_auto, tlnc_fec_auto, tlnc_bas_impo, tlnc_val_impu, tlnc_cla_acce, tlnc_nom_arch, tlnc_ban_emis, tlnc_ban_ambt` | **Comprobante electrónico** (clave de acceso, XML autorizado, ambiente prod/prueba `ban_ambt`). Núcleo de facturación electrónica |
| `afcpotv` | `potv_des_potv, potv_cod_ccon, potv_val_potv, potv_por_potv, potv_ban_iva, potv_ban_ice, potv_ban_irbp` | Parámetros de recargos/otros valores del punto de venta con banderas de impuesto |
| `afcdvco` | `dvco_ide_dvco, dvco_num_dvco, dvco_fec_emis` | Documento de venta/comprobante (cabecera mínima) |

**Catálogos SRI:** `afctcsr` (tipo comprobante SRI `sri_tcsr`), `afctsco` (tipo sustento comprobante `sri_tsco`, con `val_tsco`), `afctpsr` (tipo/forma SRI, `cod_sri`+`cod_form`), `afctemi` (tipo de emisión), `afctcem` (tipo comprobante emisión), `afctpdv` (tipo punto de venta), `afctpag` (**forma de pago SRI/ATS**, `tpag_sri_tpag`), `afctsis` (tipo de sistema).

---

## 8. CUENTAS POR COBRAR / COBRO DE SERVICIOS

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afcmcco` ★ | `mcco_num_mcco, mcco_fec_mcco, mcco_val_mcco, mcco_cod_clie, mcco_cta_ccon, mcco_cod_serv, mcco_num_chqs, mcco_val_paga, mcco_fec_venc, mcco_val_prov, mcco_est_calf` | **Movimiento de cuenta por cobrar** (documento a cobrar por servicio/producto a un cliente), con provisión y estado de calificación |
| `afcdmco` | `dmco_cod_mcco, dmco_cod_tfpg, dmco_cod_pape, dmco_val_dmco, dmco_fec_paga, dmco_cod_tran, dmco_cod_esta` | Detalle de pagos/abonos aplicados a un `afcmcco` (forma de pago `tfpg`, papeleta `pape`) |
| `afccaca` | `cacc_cod_mcco, cacc_sal_mcco, cacc_val_prov, cacc_val_venc, cacc_val_deve, cacc_dias_venc, cacc_val_dema, cacc_val_cast, cacc_val_mora` | Cartera de servicios: saldos vencidos, devengado, demanda judicial, castigado y provisión de un CxC |
| `afccacf` | `cacf_cod_cacf, cacf_nom_cacf, cacf_val_inic, cacf_val_fina, cacf_val_cacf` | Catálogo de rangos/franjas de la cartera de servicios (para provisión) |

**Catálogos / parametrización:** `afcserv` (**catálogo de servicios cobrables**: `serv_des_serv, serv_cod_ctas, serv_cco_gast/prov/ingr, serv_val_cuot, serv_num_cuot, serv_ban_obli`), `afcttpr` (tipo de transacción/proceso, con `cod_ctas`+`cod_tasi`), `afcdccr` (parametrización contable de conceptos de cobro: `dccr_cod_ccre, dccr_ctas_deud, dccr_ctas_acre, dccr_num_para`).

---

## 9. CUENTAS POR PAGAR / PROVEEDORES

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afcmcpa` ★ | `mcpa_cod_mcco, mcpa_cod_prdr, mcpa_val_mcpa, mcpa_iva_mcpa, mcpa_sal_mcpa, mcpa_cod_esta, mcpa_cod_ccon, mcpa_val_paga, mcpa_cod_serv, mcpa_val_desc` | **Movimiento de cuenta por pagar** a un proveedor (`cod_prdr`), con IVA, saldo y estado |
| `afcdmcp` | `dmcp_cod_mcpa, dmcp_cod_comp, dmcp_val_dmcp, dmcp_cod_tfpg, dmcp_cod_pape, dmcp_num_dmcp, dmcp_fec_paga, dmcp_cod_esta` | Detalle de pagos aplicados a un `afcmcpa` (comprobante `comp`, forma de pago, papeleta) |
| `afcdrcp` | `drcp_cod_mcpa, drcp_cod_rubr, drcp_num_drcp, drcp_fec_venc, drcp_tas_drcp, drcp_val_drcp, drcp_cod_ccon, drcp_cod_ediv` | Rubros/dividendos por pagar de una CxP (amortización de un pasivo con tasa y vencimiento) |

---

## 10. TESORERÍA / TRANSFERENCIAS / INVERSIONES

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afctrtr` ★ | `trtr_cod_clie, trtr_cod_dpvi, trtr_val_trtr, trtr_num_trtr, trtr_cod_banc, trtr_nct_orde/bene, trtr_nom_bene, trtr_tid_bene/ide_bene, trtr_val_comi, trtr_est_dep, trtr_est_fina, trtr_cod_ctrt` | **Transferencias interbancarias** (SPI/ordenante-beneficiario, comisión, estados de depósito y de finalización). Coincide con el flujo "transferencias entre socios" |
| `afcdtrt` | `dtrt_num_tran, dtrt_val_dtrt, dtrt_fec_dtrt, dtrt_val_conf, dtrt_usu_conf, dtrt_fec_conf, dtrt_cod_tasi` | Detalle de transferencias/transacción con doble validación (registro + confirmación por otro usuario) |
| `afcminv` | `minv_cod_inve, minv_cod_tran, minv_cod_rubr, minv_cod_edpf, minv_cos_ante/actu/vari, minv_val_comp, minv_val_gana, minv_val_gast, minv_num_minv` | **Movimientos de inversiones** (títulos/portafolio): costo, variación de valor, ganancia y gasto |
| `afciinv` | `iinv_cod_minv, iinv_val_iinv, iinv_num_docu, iinv_cod_tdoc` | Detalle de interés/rendimiento de una inversión |
| `afcrban` | `rban_cod_banc, rban_cod_clie, rban_cod_tcba, rban_num_rban, rban_sal_rban, rban_est_rban` | Cuentas bancarias externas registradas por un cliente (para acreditar transferencias) |
| `afcrbso` | `rbso_cod_banc, rbso_cod_socr, rbso_num_rbso, rbso_sal_rbso, rbso_est_rbso` | Cuentas bancarias externas de un socio garante (mismo esquema que `afcrban`) |
| `afcddep` | `ddep_cod_mcdv, ddep_val_ddep, ddep_nom_ddep, ddep_num_docu, ddep_obs_ddep` | Papeletas de depósito bancario (por movimiento de cuenta vista `mcdv`) |
| `afcdcam` | `dcam_cod_deef, dcam_cod_mcdv, dcam_num_deno, dcam_cod_camb, dcam_cod_modu` | Denominaciones/cambio de efectivo asociado a un movimiento (arqueo de billetes) |
| `afcdban` | `dban_cod_mcdv, dban_val_toke, dban_cod_corr` | **Tokens de banca electrónica**: valor de token (OTP) por movimiento de cuenta vista. Muestra real: `toke=279270`. FK `cod_mcdv` |

**Catálogos:** `afcctrt` (tipo de transferencia, `ctrt_sib_ctrt`), `afctres` (tipo de transacción de tesorería/reserva), `afctinv` (tipo de inversión, `tinv_tip_tinv`+`tinv_sib_tinv`), `afcccdv` (concepto de cuenta a la vista), `afcbeco` (`beco_nom_beco, beco_ide_beco, beco_dir_beco` — beneficiarios de cobro/pago).

---

## 11. DEPÓSITOS A LA VISTA / AHORROS / TARJETAS (extiende `bcadpvi`)

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afchidv` | `hidv_cod_dpvi, hidv_fec_acti/acta/anti/anta, hidv_sal_cont, hidv_cod_eacd, hidv_eac_ante` | Historial de estados de la cuenta a la vista (activación/inactivación, estado anterior→actual, saldo contable) |
| `afcsigc` | `sigc_cod_tcdv, sigc_des_tcdv, sigc_val_disp, sigc_val_cont, sigc_num_sigc` | Saldos iniciales (disponible vs contable) por tipo de cuenta a la vista |
| `afcdadp` | `dadp_cod_anrl, dadp_cod_dpvi, dadp_val_dadp` | Aplicación/distribución de un valor a una cuenta a la vista |
| `afcdpta` | `dpta_cod_dpvi, dpta_num_tarj, dpta_fec_inic/venc, dpta_nom_tarj, dpta_cup_dpta, dpta_cod_ttad, dpta_cod_tasi` | **Tarjeta de débito** vinculada a una cuenta a la vista (cupo, vigencia, tipo) |
| `afcnutc` | `nutc_cod_tcli, nutc_cod_ofic, nutc_num_nutc` | Numerador/secuencia de emisión de tarjetas por tipo de cliente y oficina |
| `afcdsco` | `dsco_cod_socr, dsco_cod_tcom, dsco_val_dsco` | Descuento/comisión aplicado a un socio |

**Catálogos:** `afcttad` (tipo de tarjeta de débito, `ttad_sib_ttad`), `afcttar` (tipo de tarjeta), `afcstar` (`star_cod_ttar, star_nom_star, star_val_star` — tarifas/cargos por tarjeta), `afctcom` (tipo de comisión).

---

## 12. SOCIOS / CLIENTES — atributos, historiales y referencias (extiende `bcaclie`)

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afccatc` | `catc_cod_clie, catc_tcl_ante, catc_tcl_actu, catc_num_ante, catc_num_actu` | Historial de cambio de tipo de cliente |
| `afcctvc` | `ctvc_cod_clie, ctvc_tvi_ante, ctvc_cod_tvin` | Historial de cambio de tipo de vínculo del cliente |
| `afcclho` | `clho_cod_clie, clho_ide_clho, clho_abr_opci, clho_fec_clho` | Bitácora de opciones/consultas realizadas sobre el cliente |
| `afceduc` | `educ_cod_clie, educ_cod_tedu, educ_fec_educ` | Nivel de educación del cliente (FK `cod_tedu → afctedu`) |
| `afcgrup` | `grup_num_grup, grup_cod_clie, grup_des_grup, grup_ban_grup` | Grupos (bancas comunales / créditos solidarios) de socios |
| `afcrfpe` | `rfpe_nom_rfpe, rfpe_cod_clie, rfpe_num_tele/celu, rfpe_dir_domi, rfpe_ide_rfpe, rfpe_ema_rfpe, rfpe_ban_vali, rfpe_cod_tcfa` | Referencias personales/familiares del cliente (con validación) |
| `afcrleg` | `rleg_cod_clie, rleg_nom_rleg, rleg_ide_rleg, rleg_cli_rleg, rleg_ban_rleg` | Representante legal del cliente (persona jurídica / menor) |
| `afccoso` | `coso_cod_soci, coso_num_coso, coso_nom_resp, coso_ema_resp, coso_tel_resp, coso_fec_inic/fina` | Contactos/responsables de un socio (persona jurídica) |
| `afcsoop` | `soop_cod_optr, soop_num_soci, soop_cod_clie` | Relación socio ↔ operación/oficial (`optr`) |
| `afclpdp` | `lpdp_cod_clie, lpdp_ban_lpdp, lpdp_fec_modi` | Consentimiento de tratamiento de datos personales (LOPDP) |
| `afclpwe` | `lpwe_cod_clie, lpwe_ban_soci, lpwe_ip_lpwe, lpwe_fec_lpwe` | Registro de aceptación de términos del portal web (con IP) |

**Catálogos de clientes:** `afctedu` (tipo de educación), `afcprof` (profesión), `afctviv` (tipo de vivienda), `afcescl` (estado civil, `escl_sib_escl`), `afcescp` (escala/estado complementario), `afcauid` (**autoidentificación étnica** — muestra: `"Indigena"`, `"Afroecuatoriano"`), `afctgru` (tipo de grupo), `afcdisc` (**tipo de documento de identidad**, banderas `ban_tide/ban_iden/ban_porc`), `afccocu` (catálogo corto código+desc).

---

## 13. CRM / REQUERIMIENTOS (mesa de ayuda / servicio al socio)

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afchreq` | `hreq_cod_clie, hreq_cod_htso, hreq_usu_asig, hreq_ema_requ, hreq_tel_requ, hreq_pri_hreq, hreq_des_hreq, hreq_est_hreq, hreq_est_conf, hreq_est_entr, hreq_url_crea` | **Requerimientos/tickets** de socios (asignación, prioridad, estados de confirmación y entrega) |
| `afchdre` | `hdre_cod_hreq, hdre_cod_htso, hdre_des_hdre, hdre_fec_hdre, hdre_usu_hdre, hdre_fec_fina, hdre_est_hdre` | Bitácora de atención/seguimiento de cada requerimiento |

**Catálogos:** `afchtso` (tipo de solicitud/servicio, `htso_tip_htso`), `afchere` (estados de requerimiento), `afctemd` (`temd_nom_temd, temd_cod_recu, temd_cod_rec1` — plantillas de mensaje/notificación ligadas a recursos de menú).

---

## 14. CONTABILIDAD (extiende `comp_sal_cta` / `bcasact`)

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afcsctd` | `sctd_cod_ctas, sctd_cod_ofic, sctd_cod_peri, sctd_fec_sctd, sctd_sal_debe, sctd_sal_cred, sctd_cod_cont, sctd_cod_gere` | Saldos contables por cuenta / oficina / período (variante `afc` del balance de comprobación) |
| `afccpof` | `cpof_ofi_orig, cpof_ofi_dest, cpof_cta_cobr, cpof_cta_pagr` | **Cuentas puente entre oficinas** (interoffice) para cuadrar operaciones inter-sucursal |
| `afcgtbi` | `gtbi_cod_ctas, gtbi_cco_deud, gtbi_cco_acre, gtbi_cco_otra, gtbi_sib_gtbi` | Parametrización contable de garantías tipo **bien** (cuentas de orden deudora/acreedora) |
| `afcgtti` | `gtti_cod_ctas, gtti_cco_deud, gtti_cco_acre, gtti_cco_otra` | Parametrización contable de garantías tipo **título/valor** |
| `afcpccp` | `pccp_cod_ccon, pccp_ran_inic, pccp_ran_fina, pccp_cod_loca, pccp_lin_pccp` | Parámetro de cuenta contable por rango numérico y localidad |

---

## 15. OPERACIONES / DISTRIBUCIÓN (cluster `anrl`)

Distribución de un valor de una operación "anrl" (`→ bcaanrl`) hacia distintos destinos. Semántica exacta
por confirmar; parece **compensación/liquidación de operaciones** (valores enviados vs recibidos).

| Tabla | Columnas | Destino de la distribución |
|---|---|---|
| `afcdact` | `dact_cod_anrl, dact_cod_mcco, dact_cod_serv, dact_val_envi, dact_val_rece` | Hacia CxC/servicio (`mcco`/`serv`) |
| `afcdagc` | `dagc_cod_anrl, dagc_num_cred, dagc_cod_clie, dagc_val_envi, dagc_val_reci, dagc_cod_divc` | Hacia un crédito/dividendo (`num_cred`) |
| `afcdapo` | `dapo_cod_anrl, dapo_cod_trcj, dapo_val_dapo` | Hacia una transacción de caja (`trcj`) |
| `afcdadp` | (ver §11) | Hacia una cuenta a la vista (`dpvi`) |

---

## 16. RECURSOS HUMANOS / OFICINAS / CONFIGURACIÓN

| Tabla | Columnas relevantes | Propósito |
|---|---|---|
| `afcemof` | `emof_cod_empl, emof_cod_ofic, emof_por_comp, emof_ban_prin` | Asignación empleado ↔ oficina, con % de comisión y oficina principal |
| `afcelab` | `elab_nom_elab, elab_ide_elab, elab_sum_elab, elab_val_elab, elab_cod_clie, elab_mes_carg, elab_anio_carg, elab_val_paga, elab_fec_paga` | Planilla mensual de valores por persona a pagar/recaudar (convenio o rol). *(Vacía en test — propósito tentativo)* |
| `afcdces` | `dces_cod_cesa, dces_det_dces, dces_val_dces, dces_mod_dces, dces_ref_dces` | Detalle de cesantía/cesión. *(Vacía en test — propósito tentativo)* |
| `afchofc` | `hofc_cod_clie, hofc_cod_ofct, hofc_ofc_ante, hofc_fec_hofc` | Historial de cambio de oficina de un cliente |
| `afccotr` | `cotr_tip_cotr, cotr_hor_inic, cotr_hor_fin, cotr_num_cort, cotr_ban_cotr` | Horarios de corte / turnos operativos |
| `afcloca` | `loca_cod_loca, loca_des_loca` | Catálogo de localidades |
| `afcprso` | `prso_cod_prms, prso_val_prso, prso_cod_ofic` | Parámetro del sistema con valor por oficina (`cod_prms → bcaprms`) |
| `afcgtes` | (ver §3) | — |

---

## 17. AUDITORÍA / BITÁCORA (trazabilidad de cambios)

| Tabla | Columnas | Propósito |
|---|---|---|
| `track_01` | `track_01_userid, track_01_username, track_01_module, track_01_station, track_01_dbuser, track_01_datei, track_01_dateo` | **Sesiones**: quién entró, desde qué estación/usuario de BD, módulo, hora de entrada/salida |
| `track_02` | `track_02_table, track_02_statment, track_02_date, track_02_cod_01` | **Operación DML auditada**: tabla y sentencia (I/U/D) ejecutada, con FK a la sesión (`cod_01 → track_01`) |
| `track_03` | `track_03_cod_02, track_03_pkval, track_03_colname, track_03_value, track_03_case` | **Detalle a nivel columna**: valor de PK, columna, valor y tipo de cambio (`case` = I/U/D). FK `cod_02 → track_02` |

> Este trío `track_01/02/03` es el audit trail nativo del sistema (bitácora encadenada sesión → sentencia →
> valor de columna). Relevante para SOX/auditoría: permite reconstruir quién modificó qué campo y cuándo.

---

## 18. TÉCNICAS / NO-NEGOCIO

| Tabla | Naturaleza |
|---|---|
| `pbcatcol`, `pbcatedt`, `pbcatfmt`, `pbcattbl`, `pbcatvld` | **Catálogo de sistema de PowerBuilder** (atributos extendidos de columnas: etiquetas, máscaras, edits, validaciones, fuentes). No es dominio de negocio; lo crea la herramienta de desarrollo |
| `tmpdcom` | Tabla temporal/staging de saldos de comprobación (`dcom_cod_ctas, dcom_sal_debi, dcom_sal_cred, dcom_fec_dcom`). Insumo transitorio del cierre contable, no fuente de verdad |

---

## Resumen (para fusión con lotes 1 y 2)

**Módulos de negocio identificados en el lote 3 (16):** Créditos/Cartera · Riesgo-Provisiones ·
Cobranza · Cobranza judicial/Coactiva · Prevención de Lavado (UAFE/AML) · Reportes regulatorios SEPS ·
Facturación electrónica/SRI · Cuentas por Cobrar · Cuentas por Pagar · Tesorería/Transferencias/Inversiones ·
Depósitos vista/Tarjetas · Socios/Clientes · CRM/Requerimientos · Contabilidad · Operaciones-Distribución
(`anrl`) · RH/Oficinas/Configuración. Además: **Auditoría/Bitácora** (`track_*`).

**Tablas técnicas / no-negocio (7):** `pbcatcol`, `pbcatedt`, `pbcatfmt`, `pbcattbl`, `pbcatvld` (catálogo
PowerBuilder) y `tmpdcom` (staging contable). El trío `track_01/02/03` NO se contó aquí: sí es de negocio
(auditoría regulatoria).
