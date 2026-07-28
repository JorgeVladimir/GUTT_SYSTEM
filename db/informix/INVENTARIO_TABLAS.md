# Inventario de tablas — Informix legacy (`afccajacrediapoyo`)

Generado el 2026-07-09 contra la VM de pruebas VirtualBox (`192.168.1.199:1526`, server `ol_servidor`),
usando `db/informix/introspeccion.js` (herramienta reutilizable — ver ese archivo para volver a correr
el inventario o hacer queries sueltas).

Metodología:
1. `SELECT tabname FROM systables WHERE tabid > 99 AND tabtype = 'T' ORDER BY tabname` → 527 tablas de usuario.
2. Clasificación heurística por nombre (prefijo `bca*`/`afc*` + raíces en español relacionadas a cada
   dominio: crédito, préstamo, cartera, cuota, garantía, mora, amortización — para créditos; plazo, dpf,
   certificado, inversión — para plazo fijo; contable, cuenta, asiento, libro, diario, saldo — para
   contabilidad).
3. Para las candidatas: columnas vía `syscolumns` + muestreo `SELECT FIRST 3 * FROM <tabla>`.

`coltype` es el código numérico crudo de Informix. Referencia rápida (código base, +256 = variante `NOT NULL`):
`0=CHAR, 1=SMALLINT, 2=INTEGER, 3=FLOAT, 5=DECIMAL, 6=SERIAL, 7=DATE, 10=DATETIME, 13=VARCHAR`.
Ej.: `258 = 2+256 = INTEGER NOT NULL`, `261 = 5+256 = DECIMAL NOT NULL`, `262 = 6+256 = SERIAL NOT NULL`.

---

## 1. Listado completo de tablas (527)

<details>
<summary>Ver las 527 tablas (click para expandir)</summary>

```
afcauid, afcband, afcbeco, afcbprm, afcbrco, afcbrec, afccaca, afccacf, afccatc, afccavo,
afcccdv, afcccob, afcccxc, afccega, afcclho, afccltr, afccoba, afccocu, afcconf, afccoso,
afccotr, afccpof, afccrce, afccrie, afcctar, afcctrt, afcctvc, afccvca, afcdact, afcdadp,
afcdagc, afcdapo, afcdban, afcdcal, afcdcam, afcdccr, afcdces, afcdcre, afcddep, afcddic,
afcddri, afcdecr, afcdeop, afcdicl, afcdisc, afcdmco, afcdmcp, afcdpta, afcdrcp, afcdrie,
afcdrso, afcdsco, afcdsoc, afcdssc, afcdtlc, afcdtlv, afcdtre, afcdtrt, afcdvco, afcectr,
afcedad, afceduc, afcelab, afcemof, afcencr, afcescl, afcescp, afcfval, afcfval_103, afcgaul,
afcgcab, afcgccr, afcgcli, afcgcob, afcgdco, afcgrup, afcgtbi, afcgtes, afcgtti, afchdir,
afchdpf, afchdre, afchere, afchicr, afchidv, afchofc, afchomo, afchpol, afchreq, afchtso,
afciinv, afcinve, afclces, afclcoa, afclcos, afclhom, afclimr, afcliqu, afcloca, afclogt,
afclpdp, afclpwe, afclsms, afcmcco, afcmcpa, afcminv, afcnutc, afcpccp, afcpotv, afcprof,
afcprso, afcpsms, afcrban, afcrbso, afcrfpe, afcriec, afcrleg, afcsacr, afcsctd, afcserv,
afcsigc, afcsoop, afcstar, afctcem, afctcom, afctcsr, afctdeu, afctedu, afctemd, afctemi,
afctgru, afctinv, afctlnc, afctope, afctpag, afctpdv, afctpsr, afctres, afctrla, afctrtr,
afctsco, afctsis, afctsoc, afcttad, afcttar, afcttpr, afctviv, afcvind, bcaabdv, bcaabog,
bcaacce, bcaacem, bcaacer, bcaacli, bcaacti, bcaaeac, bcaagar, bcaandv, bcaanme, bcaanpf,
bcaanrl, bcaaper, bcaapp, bcaausu, bcaavpic, bcabanc, bcabbdd, bcabech, bcabene, bcabloq,
bcabpln, bcabxco, bcacaja, bcacalf, bcacamb, bcacarg, bcacatr, bcacban, bcaccco, bcaccom,
bcaccon, bcaccre, bcacdco, bcacdso, bcacfam, bcacfir, bcacgti, bcachcj, bcachqs, bcachra,
bcaciud, bcaclib, bcaclie, bcaclna, bcacoac, bcacoan, bcacobs, bcacocr, bcacomi, bcacomp,
bcaconc, bcacons, bcacont, bcacoop, bcacore, bcacoti, bcacous, bcacpan, bcacpar, bcacpcr,
bcacpre, bcacrau, bcacred, bcacrfi, bcacrpg, bcacrrl, bcacsac, bcacsal, bcacsob, bcactap,
bcactip, bcactrl, bcadanr, bcadaut, bcadbau, bcadbpf, bcadchv, bcadcom, bcaddep, bcaddte,
bcadecb, bcadecl, bcadect, bcadeef, bcadefe, bcadefz, bcadeip, bcadepa, bcadepe, bcadepg,
bcadepr, bcadetd, bcadfcd, bcadfcr, bcadfes, bcadiad, bcadimp, bcading, bcadirb, bcadivc,
bcadmba, bcadmon, bcadoem, bcadpap, bcadpfi, bcadpln, bcadpor, bcadpvi, bcadrtc, bcadrti,
bcadrtr, bcadrtv, bcadsem, bcadtac, bcadtcr, bcadtot, bcadtra, bcadvar, bcaeacd, bcaeafi,
bcaeanr, bcaecba, bcaeciv, bcaecre, bcaediv, bcaedpf, bcaeesf, bcaefba, bcaegch, bcaejer,
bcaejui, bcaemdp, bcaempl, bcaendc, bcaenti, bcaeope, bcaereg, bcaerro, bcaesac, bcaesep,
bcaesfe, bcaesol, bcaesrf, bcaestr, bcafadv, bcafcdi, bcafchq, bcafcin, bcaffin, bcaflib,
bcaform, bcafppf, bcafpsd, bcafret, bcafsal, bcaftnt, bcafxtc, bcagara, bcagbie, bcagchq,
bcagcre, bcagpre, bcagrup, bcagtcr, bcagtia, bcagtit, bcahact, bcahesu, bcaicli, bcaimag,
bcaimpa, bcaimpc, bcaimpr, bcaimpu, bcaimru, bcainan, bcaindi, bcaineg, bcaintr, bcaintv,
bcaiope, bcaitrv, bcajcop, bcajorn, bcajuic, bcalcre, bcalibr, bcamban, bcamcdv, bcamdep,
bcameac, bcamenu, bcamese, bcamlbr, bcamodu, bcamonc, bcamone, bcamoni, bcamont, bcanatu,
bcancue, bcandoc, bcanoti, bcaobcr, bcaobct, bcaocu1, bcaocu2, bcaocup, bcaoffa, bcaofic,
bcaofus, bcaooem, bcaopag, bcaopci, bcaopen, bcaoptr, bcaorco, bcaordc, bcaorec, bcaorig,
bcaotcl, bcaotde, bcaottr, bcapaca, bcapaco, bcapago, bcapais, bcapape, bcapasd, bcapcal,
bcapcom, bcapctb, bcapdco, bcapddb, bcapdte, bcaperf, bcaperi, bcapgpf, bcapgre, bcapibi,
bcapice, bcapicn, bcapiva, bcaplaz, bcaplcr, bcapose, bcapott, bcaprcb, bcaprdi, bcaprdr,
bcaprdv, bcapres, bcaprms, bcaproc, bcaprov, bcaprpf, bcarang, bcarant, bcarb11, bcarcla,
bcarefi, bcaremq, bcarlab, bcarols, bcarsib, bcarubr, bcarvpf, bcasacp, bcasact, bcasald,
bcasaux, bcasdct, bcasect, bcaseqn, bcasetr, bcasexo, bcasoci, bcasocr, bcastmp, bcasuco,
bcatacr, bcatact, bcatadv, bcatafi, bcatafo, bcatamo, bcatanx, bcatasa, bcatasc, bcatasi,
bcataud, bcatben, bcatcap, bcatcar, bcatcba, bcatcdp, bcatcdv, bcatcfa, bcatcli, bcatcre,
bcatcse, bcatcue, bcatdep, bcatdin, bcatdoc, bcatdpd, bcatdtc, bcateex, bcateim, bcatele,
bcatene, bcateof, bcatese, bcatfir, bcatfor, bcatfpg, bcatgar, bcathdv, bcatica, bcatico,
bcatide, bcatifi, bcatiin, bcatind, bcating, bcatjor, bcatlco, bcatlib, bcatlve, bcatman,
bcatmba, bcatmpf, bcatndd, bcatofi, bcatpco, bcatpie, bcatpln, bcatprm, bcatprv, bcatptr,
bcatran, bcatrcj, bcatsec, bcatsie, bcatsob, bcattel, bcattpf, bcatvin, bcatxcp, bcaunid,
bcaustr, bcausua, bcautel, bcavaft, bcavari, bcavpcn, bcavpre, bcavprm, ccon, comp_sal_cta,
comp_sal_ctab13, pbcatcol, pbcatedt, pbcatfmt, pbcattbl, pbcatvld, tmpdcom, tmpsact, track_01,
track_02, track_03, uaf0_socios, uaf0_socios1, uaf1_clientes, uaf2_productos, uaf3_transacciones, uaf4_bancos
```

</details>

Ya documentadas previamente en el código (no repetidas en detalle aquí): `bcaclie` (clientes), `bcausua`
(usuarios), `bcaperf` (perfiles), `bcadpvi` (depósitos vista), `bcatcdv` (tipo cuenta depósito).

---

## 2. Dominio: CRÉDITOS / PRÉSTAMOS

**Tabla candidata principal: `bcacred`** — un registro por operación de crédito (el "master" del préstamo).

### `bcacred` — columnas relevantes (76 columnas totales, no se listan todas las de auditoría/misceláneas)

| Columna | Tipo | Significado (inferido por nombre + dato de muestra) |
|---|---|---|
| `cred_num_cred` | SERIAL NOT NULL | ID interno del crédito (PK) |
| `cred_num_soli` | CHAR | Número de solicitud |
| `cred_cod_clie` | INTEGER NOT NULL | FK → `bcaclie` (cliente/socio titular) |
| `cred_ide_titu` | CHAR | Cédula del titular (ej. `1850611060`) |
| `cred_nom_titu` | CHAR | Nombre del titular (ej. `CHANGO CAIZABANDA ALIZ YARI`) |
| `cred_ide_covt` / `cred_nom_covt` | CHAR | Cédula/nombre del codeudor (vacíos en la muestra) |
| `cred_cap_cred` | DECIMAL NOT NULL | Capital/monto del crédito otorgado (ej. `10000.00`) |
| `cred_cap_soli` | DECIMAL | Capital solicitado |
| `cred_tas_cred` | DECIMAL NOT NULL | Tasa de interés nominal (ej. `14.00`) |
| `cred_tas_tea` | DECIMAL | Tasa efectiva anual |
| `cred_por_mora` | DECIMAL | Porcentaje de mora |
| `cred_con_mora` | SMALLINT | Días/contador de mora |
| `cred_fec_inic` | DATE NOT NULL | Fecha de desembolso/inicio |
| `cred_fec_venc` | DATE | Fecha de vencimiento |
| `cred_fec_pago` | DATE | Fecha de próximo pago / último pago |
| `cred_num_cuot` | INTEGER | Número de cuotas |
| `cred_cod_ecre` | INTEGER NOT NULL | FK → estado del crédito (catálogo, ver más abajo — no se encontró tabla `bcaecre` separada, posiblemente hardcoded o en `afcdecr`/`afcdcre`) |
| `cred_cod_tcre` | INTEGER NOT NULL | FK → `bcatcre` (tipo de crédito: individual/solidario) |
| `cred_cod_tamo` | INTEGER NOT NULL | FK → `bcatamo` (tipo de amortización) |
| `cred_cod_tgar` | INTEGER | FK → `bcatgar` (tipo de garantía) |
| `cred_cod_lcre` | INTEGER | FK → `bcalcre` (línea de crédito) |
| `cred_cod_mone` | INTEGER NOT NULL | FK → moneda |
| `cred_cod_ofic` | INTEGER NOT NULL | FK → oficina |
| `cred_cod_usua` | INTEGER NOT NULL | FK → `bcausua` (usuario que registró) |
| `cred_cod_calf` | CHAR | Calificación de riesgo (ej. `A-1`) |

### Fila de ejemplo (`SELECT FIRST 3 * FROM bcacred`, 1 de 3 mostrada)

```json
{
  "cred_num_cred": "1", "cred_num_soli": "1",
  "cred_cod_clie": "430", "cred_ide_titu": "1850611060",
  "cred_nom_titu": "CHANGO CAIZABANDA ALIZ YARI",
  "cred_cap_cred": "10000.00", "cred_cap_soli": "10000.00",
  "cred_tas_cred": "14.00", "cred_tas_tea": "14.93",
  "cred_fec_inic": "05/09/2025 0:00:00", "cred_fec_venc": "05/09/2028 0:00:00",
  "cred_num_cuot": "36", "cred_cod_ecre": "4", "cred_cod_tcre": "0",
  "cred_cod_tamo": "2", "cred_cod_tgar": "1", "cred_cod_lcre": "27",
  "cred_por_mora": "1.50", "cred_con_mora": "0", "cred_cod_calf": null
}
```

### Catálogos y tablas relacionadas (créditos)

| Tabla | Columnas | Rol |
|---|---|---|
| `bcatcre` | `tcre_cod_tcre, tcre_des_tcre, tcre_sib_tcre` | Catálogo tipo de crédito. Muestra real: `{cod:0, des:"INDIVIDUAL", sib:"I"}`, `{cod:1, des:"SOLIDARIO", sib:"S"}` |
| `bcatamo` | `tamo_cod_tamo, tamo_des_tamo, tamo_est_tamo, tamo_dia_tamo` | Catálogo tipo de amortización |
| `bcatgar` | `tgar_cod_tgar, tgar_des_tgar, tgar_sib_tgar, tgar_por_prov, tgar_est_tgar` | Catálogo tipo de garantía (con % de provisión) |
| `bcalcre` | `lcre_cod_lcred, lcre_desc_lcred, lcre_est_lcre, lcre_tas_lcre, lcre_inic_tasc, lcre_fin_tasc` | Catálogo línea de crédito (producto), con rango de tasas |
| `bcaplcr` | `plcr_cod_plcr, plcr_ini_plcr, plcr_fin_plcr, plcr_cod_mone` | Catálogo de rangos de plazo por crédito |
| `bcadtcr` | `dtcr_cod_dtcr, dtcr_des_dtcr, dtcr_sib_dtcr, dtcr_cod_tdtc` | Catálogo "destino del crédito" |
| `bcagara` | `gara_cod_gara, gara_num_cred, gara_cod_clie, gara_cod_socr` | Garantías asociadas a un crédito (FK `num_cred`). Ejemplo real: `{gara_cod_gara:1, gara_num_cred:2, gara_cod_clie:436}` |
| `bcagtia` | `gtia_num_gtia, gtia_cod_cgti, gtia_cod_clie, gtia_des_bien, gtia_fec_ingr` | Detalle del bien en garantía (descripción, fecha ingreso) |
| `bcagtcr` | `gtcr_num_cred, gtcr_num_gtia, gtcr_val_gtcr` | Relación N:N crédito↔garantía con valor |
| `bcagtit` | `gtit_num_gtia, gtit_val_nomi, gtit_val_merc, gtit_cod_banc` | Garantías tipo título/valor (nominal, mercado, banco) |
| `bcaobcr` | `obcr_num_cred, obcr_ing_obcr, obcr_egr_obcr, obcr_ptr_obcr` | Ingresos/egresos declarados del solicitante (análisis de capacidad de pago) |
| `bcacpcr` | `cpcr_num_cred, cpcr_cod_dpvi, cpcr_val_cpcr` | Vincula el crédito a la cuenta de depósito vista (`bcadpvi`) donde se debitan las cuotas |
| `afccrce` | `crce_num_cred, crce_ecr_ante, crce_ecr_actu, crce_sal_cred, crce_fec_crce` | **Historial de cambios de estado del crédito** (estado anterior→actual + saldo), útil para trazar mora/cartera vencida |
| `afcdcre` | `dcre_cod_dcre, dcre_des_dcre, dcre_sib_dcre` | Catálogo "destino de crédito" (variante `afc`) |
| `afcdecr` | `decr_num_cred, decr_nom_arch, decr_fec_ingr` | Documentos/archivos adjuntos al expediente de crédito |
| `bcatacr` | `tacr_cod_tacr, tacr_des_tacr` | Catálogo pequeño (tipo asociado a crédito, sin confirmar semántica exacta) |

**Nota:** no se encontró una tabla catálogo `bcaecre` (estado de crédito) separada — el código
`cred_cod_ecre` de `bcacred` referencia un catálogo que no matcheó ninguna raíz de búsqueda; puede vivir
en una tabla genérica de estados compartida (`bcaeope`, `bcaesol`, etc.) — pendiente de confirmar si se
necesita para mostrar el estado legible del crédito.

---

## 3. Dominio: DEPÓSITOS A PLAZO FIJO (DPF)

**Tabla candidata principal: `bcadpfi`** — un registro por depósito a plazo fijo activo/histórico.

### `bcadpfi` — columnas

| Columna | Tipo | Significado |
|---|---|---|
| `dpfi_cod_dpfi` | SERIAL NOT NULL | ID interno del DPF (PK) |
| `dpfi_num_dpfi` | INTEGER NOT NULL | Número de póliza/certificado |
| `dpfi_cod_clie` | INTEGER NOT NULL | FK → `bcaclie` (cliente/socio) |
| `dpfi_val_dpfi` | DECIMAL NOT NULL | Monto invertido (ej. `40000.00`) |
| `dpfi_tas_dpfi` | DECIMAL NOT NULL | Tasa de interés (ej. `12.00`) |
| `dpfi_plz_dpfi` | INTEGER NOT NULL | Plazo en días (ej. `395`) |
| `dpfi_fec_inic` | DATE NOT NULL | Fecha de apertura |
| `dpfi_fec_deve` | DATE NOT NULL | Fecha de vencimiento |
| `dpfi_cod_edpf` | INTEGER NOT NULL | FK → `bcaedpf` (estado del DPF) |
| `dpfi_cod_fppf` | INTEGER NOT NULL | FK → `bcafppf` (forma de pago de interés) |
| `dpfi_nom_bene` | CHAR | Nombre del beneficiario |
| `dpfi_det_dpfi` | CHAR | Detalle/glosa (ej. `"AHORRO FIJO"`, `"deposito"`) |
| `dpfi_por_rete` | DECIMAL | % retención (impuesto) |
| `dpfi_cod_ofic` / `dpfi_cod_caja` | INTEGER / CHAR | Oficina y caja donde se registró |

### Filas de ejemplo (`SELECT FIRST 3 * FROM bcadpfi`, 2 de 3 mostradas)

```json
[
  {
    "dpfi_num_dpfi": "1", "dpfi_cod_clie": "432", "dpfi_val_dpfi": "40000.00",
    "dpfi_tas_dpfi": "12.00", "dpfi_plz_dpfi": "395",
    "dpfi_fec_inic": "05/09/2025 0:00:00", "dpfi_fec_deve": "05/09/2026 0:00:00",
    "dpfi_cod_edpf": "1", "dpfi_det_dpfi": "AHORRO FIJO",
    "dpfi_nom_bene": "CARLOS CHANGO CAIZABANDA"
  },
  {
    "dpfi_num_dpfi": "4", "dpfi_cod_clie": "433", "dpfi_val_dpfi": "20000.00",
    "dpfi_tas_dpfi": "11.00", "dpfi_plz_dpfi": "91",
    "dpfi_fec_inic": "05/20/2025 0:00:00", "dpfi_fec_deve": "08/19/2025 0:00:00",
    "dpfi_cod_edpf": "3", "dpfi_det_dpfi": "deposito"
  }
]
```

### `bcaedpf` — catálogo de estados DPF (tabla completa, 2 columnas)

| `edpf_cod_edpf` | `edpf_des_edpf` |
|---|---|
| 1 | ACTIVO |
| 2 | VENCIDO |
| 3 | CANCELADO |

### Catálogos y tablas relacionadas (DPF)

| Tabla | Columnas | Rol |
|---|---|---|
| `afchdpf` | `hdpf_cod_dpfi, hdpf_val_dpfi, hdpf_est_dpfi, hdpf_fec_venc, hdpf_fec_inic, hdpf_tas_hdpf` | Histórico de renovaciones/movimientos del DPF |
| `bcaplaz` | `plaz_ini_plaz, plaz_fin_plaz, plaz_cod_mone` | Catálogo de rangos de plazo (días) permitidos |
| `bcafppf` | `fppf_cod_fppf, fppf_cod_ttpf, fppf_des_fppf` | Catálogo forma de pago de interés (mensual, al vencimiento, etc.) |
| `bcattpf` | `ttpf_cod_ttpf, ttpf_des_ttpf` | Catálogo tipo de DPF |
| `bcatmpf` | `tmpf_cod_tmpf, tmpf_des_tmpf` | Catálogo pequeño relacionado a DPF (sin confirmar semántica exacta) |
| `bcapgpf` | `pgpf_cod_dpfi, pgpf_val_pgpf, pgpf_fec_inic, pgpf_fec_fina, pgpf_cod_edpf` | Pagos de interés generados por DPF |
| `bcaprpf` | `prpf_cod_pgpf, prpf_val_prpf, prpf_fec_prpf, prpf_cod_tdoc` | Comprobante/retención asociado a un pago de interés DPF |
| `bcarvpf` | `rvpf_cod_dpfi, rvpf_dpfi_ante, rvpf_val_incr` | Renovaciones de DPF (vincula póliza nueva con la anterior) |
| `bcaanpf` | `anpf_cod_dpfi, anpf_des_anpf` | Anotaciones/observaciones sobre un DPF |
| `bcadbpf` | `dbpf_cod_depg, dbpf_cod_dpvi, dbpf_val_dbpf` | Débito del DPF hacia una cuenta de depósito vista (pago de capital/interés) |

**Nota sobre falsos positivos descartados:** `afcdtlc`, `afcdtlv`, `afcdtre`, `afcdtrt` coincidieron en la
primera pasada automática por contener la subcadena `"cdt"` (dentro de `afcDTlc`, etc.), pero al revisar
columnas resultaron ser tablas de **facturación/ventas** (`dtlv_val_iva`, `dtlv_val_ice`, `dtlv_val_irbp` =
IVA/ICE/IRBP; `dtre_num_auto` = autorización SRI), no relacionadas a depósitos a plazo fijo. Se excluyen
del dominio DPF.

---

## 3bis. Dominio: AHORROS / DEPÓSITOS A LA VISTA

**Corrección importante:** `bcadivc` (candidata original por nombre, ver listado de la sección 1) **NO es
la tabla de ahorros**. Se introspectó (`SELECT FIRST 3 * FROM bcadivc`) y sus columnas
(`divc_num_cred`, `divc_cap_pago`, `divc_int_proy`, `divc_fec_venc`, ...) muestran que es en realidad la
**tabla de dividendos/cuotas de crédito** (plan de amortización legado de `bcacred`, vinculada por
`divc_num_cred`). Queda fuera de este dominio; es candidata a documentarse junto a Créditos (sección 2)
si se necesita el detalle de cuotas legado.

**Tabla candidata principal real: `bcadpvi`** ("depósito a la vista") — un registro por cuenta de ahorros
a la vista o certificado de aportación abierto por un socio. Se llegó a ella siguiendo la FK
`mcdv_cod_dpvi` de `bcamcdv` (ver abajo), que a su vez fue hallada por el nombre `bcatcdv`
("tipo cuenta depósito vista"), catálogo que **ya está en uso hoy** en `server.js:284 inferAccountType()`.

### `bcadpvi` — columnas (introspección real, `SELECT FIRST 3 * FROM bcadpvi`)

| Columna | Tipo (inferido) | Significado |
|---|---|---|
| `dpvi_cod_dpvi` | INTEGER NOT NULL | ID interno de la cuenta (PK) |
| `dpvi_num_dpvi` | CHAR/VARCHAR NOT NULL | Número de cuenta visible al socio (ej. `11100000004`) |
| `dpvi_cod_clie` | INTEGER NOT NULL | FK → `bcaclie` (cliente/socio titular, ej. `430`) |
| `dpvi_nom_dpvi` | CHAR | Nombre del titular (redundante con `bcaclie`, ej. `CHANGO CAIZABANDA ALIZ YARI`) |
| `dpvi_cod_tcdv` | INTEGER NOT NULL | FK → `bcatcdv` (tipo de cuenta: ya usado en `server.js` para mapear `AHORRO_VISTA` / `CERTIFICADO_APORTACION`) |
| `dpvi_cod_eacd` | INTEGER NOT NULL | FK → `bcaeacd` (estado de la cuenta, catálogo confirmado, ver abajo) |
| `dpvi_sal_disp` | DECIMAL NOT NULL | Saldo disponible (ej. `909.00`) |
| `dpvi_sal_cont` | DECIMAL NOT NULL | Saldo contable |
| `dpvi_aho_mini` | DECIMAL | Ahorro mínimo requerido (ej. `0.00`) |
| `dpvi_tas_dpvi` | DECIMAL NULL | Tasa de interés (nula en la muestra; aplica solo a ciertos tipos de cuenta) |
| `dpvi_fec_inic` | DATE NOT NULL | Fecha de apertura |
| `dpvi_fec_venc` | DATE NULL | Fecha de vencimiento (nula en cuentas a la vista sin plazo) |
| `dpvi_fec_umcd` | DATETIME | Fecha del último movimiento |
| `dpvi_cod_ofic` | INTEGER | Oficina |
| `dpvi_cod_sect` | INTEGER | Sector |
| `dpvi_num_firm` | SMALLINT | Número de firmas requeridas |
| `dpvi_cod_tfir` | INTEGER | Tipo de firma |
| `dpvi_ban_prin` | SMALLINT | Bandera de cuenta principal |

### Fila de ejemplo (`SELECT FIRST 3 * FROM bcadpvi`, 1 de 3 mostrada)

```json
{
  "dpvi_cod_dpvi": "1", "dpvi_num_dpvi": "11100000004",
  "dpvi_cod_clie": "430", "dpvi_nom_dpvi": "CHANGO CAIZABANDA ALIZ YARI",
  "dpvi_cod_tcdv": "1", "dpvi_cod_eacd": "1",
  "dpvi_sal_disp": "909.00", "dpvi_sal_cont": "909.00", "dpvi_aho_mini": "0.00",
  "dpvi_fec_inic": "05/09/2025 0:00:00", "dpvi_fec_venc": null,
  "dpvi_cod_ofic": "1", "dpvi_cod_sect": "1193"
}
```

### `bcaeacd` — catálogo de estados de cuenta (tabla completa, introspectada)

| `eacd_cod_eacd` | `eacd_des_eacd` |
|---|---|
| 1 | ACTIVA |
| 2 | INACTIVA |
| 3 | CANCELADA |
| 4 | CERRADA |
| 5 | ANULADA |

### Catálogos y tablas relacionadas (Ahorros)

| Tabla | Columnas | Rol |
|---|---|---|
| `bcatcdv` | (ya usado en código) | Catálogo tipo de cuenta depósito vista — homologa a `AHORRO_VISTA` / `CERTIFICADO_APORTACION` vía `INFORMIX_TCDV_SAVINGS_CODES` / `INFORMIX_TCDV_CERTIFICATE_CODES` |
| `bcaeacd` | `eacd_cod_eacd, eacd_des_eacd` | Catálogo de estado de la cuenta (ver tabla arriba) |
| `bcamcdv` | `mcdv_cod_dpvi, mcdv_val_mcdv, mcdv_fec_mcdv, mcdv_det_mcdv, mcdv_cod_tran, mcdv_cod_caja, mcdv_cod_ofic` | Movimientos/histórico de transacciones de la cuenta (depósitos, retiros, transferencias). Ejemplo real: `{det: "DEPOSITO", val: "10.00"}`, `{det: "TRASFERENCIA DE CERTIFICADO CAPITALIZACION", val: "9.00"}` |
| `bcadbpf` | `dbpf_cod_dpvi, ...` | Ya documentado en la sección DPF: débitos desde un DPF hacia una cuenta `dpvi` (pago de capital/interés) — confirma la relación cruzada entre dominios |

### Pendiente de confirmar

- `bcatcue` y `bcancue` fueron descartados como candidatas de ahorros tras introspección: son catálogos contables genéricos (tipo de cuenta contable "ACUMULACION"/"MOVIMIENTO", nomenclatura de cuentas del plan contable), no cuentas de socios. No pertenecen a este dominio.
- No se confirmó aún si `dpvi_tas_dpvi` se llena para certificados de aportación (en la muestra de cuentas vista aparece nulo) — validar con una muestra filtrada por `dpvi_cod_tcdv` correspondiente a certificado antes de mapear la tasa en la migración.

---

## 4. Dominio: CONTABILIDAD GENERAL

**No existe una tabla evidente de "asientos contables" / "libro diario" tradicional** (no hay tablas con
raíces `asien`, `diario`, `mayor`, `plan`, `conta` — más allá de `bcacont`, que es un catálogo pequeño, no
un libro diario). Lo más cercano encontrado son tablas de **saldos agregados por cuenta contable y
período** (equivalentes a un balance de comprobación) y un **catálogo/plan de cuentas**. Se documentan
como las candidatas más fuertes, pero con esta salvedad explícita.

### `comp_sal_cta` — candidata más fuerte: saldos mensuales por cuenta contable (balance de comprobación)

| Columna | Tipo | Significado |
|---|---|---|
| `cod_ctas` | INTEGER | Código de cuenta contable |
| `cod_ccon` | CHAR | Código de concepto contable |
| `nom_ccon` | CHAR | Nombre del concepto/cuenta (ej. `"De 91 a 180 días"`) |
| `cod_tcue` | CHAR | Tipo de cuenta (ej. `"M"`) |
| `sal_peri` | DECIMAL | Saldo del período anterior |
| `sal_mes_debe` | DECIMAL | Saldo del mes — **Debe** (débito) |
| `sal_mes_cred` | DECIMAL | Saldo del mes — **Haber** (crédito contable, no confundir con "crédito" préstamo) |
| `cod_ofic` | INTEGER | Oficina |

Fila de ejemplo real:
```json
{
  "cod_ctas": "24606", "nom_ccon": "De 91 a 180 días", "cod_tcue": "M",
  "sal_peri": "0.00", "sal_mes_debe": "7380.74", "sal_mes_cred": "970.27", "cod_ofic": "0"
}
```
Existe también `comp_sal_ctab13` (misma estructura probable, posiblemente un respaldo/período archivado —
no se llegó a confirmar columnas por timeout de conexión, pendiente).

### `bcasact` — saldos por cuenta y período (tabla "activa", más simple)

| Columna | Tipo | Significado |
|---|---|---|
| `sact_cod_ctas` | INTEGER NOT NULL | Código de cuenta contable |
| `sact_cod_peri` | INTEGER NOT NULL | Código de período |
| `sact_sal_debi` | DECIMAL NOT NULL | Saldo débito |
| `sact_sal_cred` | DECIMAL NOT NULL | Saldo crédito (haber) |
| `sact_cod_ofic` | INTEGER | Oficina |

Fila de ejemplo real:
```json
{"sact_cod_ofic":"1","sact_cod_peri":"21","sact_sal_debi":"1549.15","sact_sal_cred":"1000.90","sact_cod_ctas":"23278"}
```
`tmpsact` tiene la misma estructura (sin `sact_cod_ofic`) — parece una tabla temporal/staging del mismo dato.

### `afcctar` — catálogo / plan de cuentas contable

| Columna | Tipo | Significado |
|---|---|---|
| `ctar_cod_ctar` | SERIAL NOT NULL | Código de cuenta (PK) |
| `ctar_nom_ctar` | CHAR | Nombre corto de la cuenta |
| `ctar_des_ctar` | CHAR | Descripción de la cuenta |
| `ctar_sib_ctar` | CHAR | Código regulatorio SIB/SEPS de la cuenta |
| `ctar_ban_ctar` | SMALLINT | Bandera (activo/inactivo, sin confirmar) |
| `ctar_fec_inic` / `ctar_fec_fina` | DATE | Vigencia de la cuenta |

**Muestra:** `SELECT FIRST 3 * FROM afcctar` devolvió **0 filas** en esta VM de pruebas — la tabla existe
y tiene estructura de plan de cuentas, pero está vacía (dato no cargado en el ambiente de test).

### Catálogos y tablas relacionadas (contabilidad)

| Tabla | Columnas | Rol |
|---|---|---|
| `bcacont` | `cont_cod_cont, cont_des_cont, cont_cta_ingr, cont_cod_ofic` | Mapea un concepto/control contable a una cuenta de ingreso (`cta_ingr`) |
| `bcancue` | `ncue_cod_ncue, ncue_des_ncue, ncue_cod_ejer, ncue_num_digi` | Configuración de numeración de cuentas por ejercicio (año fiscal) |
| `bcapctb` | `pctb_cod_pctb, pctb_des_pctb, pctb_cue_ccon, pctb_val_num` | Parámetro contable, vincula un parámetro a una cuenta contable (`cue_ccon`) |
| `bcaflib` | `flib_cod_tlib, flib_des_flib, flib_cam_depo, flib_cam_reti, flib_cam_sald` | Formato/layout de impresión de libro (columnas depósito/retiro/saldo) — configuración de reportes, no datos transaccionales |
| `bcatlib` | `tlib_cod_tlib, tlib_des_tlib` | Catálogo de tipos de libro |
| `bcalibr` | `libr_cod_dpvi, libr_num_libr, libr_fec_inic, libr_sal_libr` | Libreta física por cuenta de depósito vista (`bcadpvi`) — más "libreta de ahorros" que libro contable general |
| `bcasald` | `sald_cod_dpvi, sald_dispo, sald_conta, sald_fec_sald` | Saldo disponible vs. saldo contable por cuenta de depósito vista |
| `bcasaux` | `saux_cod_dpvi, saux_sal_ndis, saux_num_dias` | Saldo auxiliar/no disponible por cuenta de depósito vista |

**Conclusión del dominio contabilidad:** hay soporte para **saldos por cuenta contable y período**
(`comp_sal_cta`, `bcasact`) y un **plan de cuentas** (`afcctar`), suficiente para construir un balance de
comprobación de solo lectura. **No se encontró una tabla de asientos/movimientos contables detallados
(libro diario transaccional)** — si se necesita el detalle de cada movimiento (no solo el saldo agregado
mensual), habría que investigar más a fondo o confirmar con el proveedor del sistema legacy si ese detalle
vive en otra base/módulo no incluido en esta base de datos de prueba.

---

## Archivos generados

- `db/informix/introspeccion.js` — script reutilizable (`node db/informix/introspeccion.js` corre el
  inventario completo; `node db/informix/introspeccion.js --sql "SELECT ..."` corre una query suelta).
- `db/informix/_inventario_raw.json` — JSON crudo del primer pase (527 tablas + clasificación + columnas/muestra).
- `db/informix/_broad_cols.json` — columnas de la segunda pasada ampliada (candidatas adicionales por dominio).
- `db/informix/_final_samples.json` — columnas + muestras finales de las tablas núcleo documentadas arriba.
