# Módulo Socios — Datos complementarios y socioeconómicos (Informix AFC)

> Consolidación de solo lectura (fase de mapeo). Fusiona las tablas del socio **más allá del master
> `bcaclie`** documentadas en `CATALOGO_MODULOS_lote1.md` (§16), `lote2.md` (§13) y `lote3.md` (§12, §4, §5, §16),
> más el inventario base `INVENTARIO_TABLAS.md`. No modifica código de la aplicación.
> Generado el 2026-07-13 contra la VM de pruebas Informix (`192.168.1.199:1526`, base `afccajacrediapoyo`)
> vía `db/informix/introspeccion.js` (mismo bridge ODBC que `server.js`).

---

## 1. Resumen ejecutivo

El master del socio es **`bcaclie`** (ya integrado en `server.js` → `buscarClienteInformix`, solo datos básicos:
cédula, nombre, dirección, email, estado). A su alrededor gravitan **~55 tablas complementarias** que hoy
**no están integradas** en el sistema nuevo (SQL Server + React), agrupadas en siete sub-dominios:

1. **Perfil socioeconómico** (`bcaclna`, `bcatene`, ingresos, ocupación) — estado civil, sexo, sector, jefe de hogar, tenencia de vivienda, actividad económica.
2. **Núcleo familiar / referencias** (`bcacfam`, `afcrfpe`, `bcabene`) — familiares, referencias personales, beneficiarios.
3. **Firmas e imágenes** (`bcacfir`, `bcaimag`) — firmas registradas y BLOBs de foto/cédula/firma (relevante KYC y verificación en ventanilla).
4. **Excedentes / relación económica con la cooperativa** (`bcacdso`, `bcading`) — utilidades distribuidas, ingresos declarados.
5. **KYC / AML / UAFE** (`bcaorig`, `afchomo`, `afclhom`, `uaf2_productos`, `uaf3_transacciones`, `afcauid`, `bcatvin`, `afclpdp`) — origen de fondos, screening de homónimos/PEP, reportes UAFE, autoidentificación étnica, partes relacionadas, consentimiento LOPDP.
6. **Historial / trazabilidad del socio** (`afccatc`, `afcctvc`, `afchofc`, `afcclho`, `bcafsal`) — cambios de tipo, vínculo, oficina, situación.
7. **Catálogos de apoyo** (`bcaeciv`, `bcasexo`, `bcaintr`, `bcaineg`, `bcaocu1/2/p`, `bcasect`, `bcatben`, `bcatcfa`, etc.).

### Resolución de las tablas tentativas (con consulta real)

Ambas tablas marcadas como "semántica no confirmada" en lote1 §16 **NO pertenecen al módulo de socios** —
estaban mal clasificadas. Evidencia de datos + FK inversa:

| Tabla | Muestra real (`SELECT FIRST … `) | Quién la referencia | Veredicto |
|---|---|---|---|
| **`bcaeafi`** | `1=BUENO, 2=REGULAR, 3=MALO, 4=SIN USO, 5=BAJA` | `bcaacti.acti_cod_eafi` (master de **activo fijo**: `acti_ser_acti`, `acti_car_acti`, `acti_cod_empl`) | **Estado/condición física del ACTIVO FIJO**, no del socio. Reasignar a módulo **Activos Fijos** (lote1 §18). |
| **`bcaesac`** | `1=Flujo de Efectivo en Actividades Operativas, 2=…de Inversión, 3=…de Financiamiento, 4=Efectivo al Final de Año, 5=(Pérdida) Utilidad del Ejercicio, …` | `bcaeesf.eesf_cod_esac` (detalle del **Estado de Situación Financiera / estados financieros**) | **Catálogo de secciones del Estado de Flujo de Efectivo** (estados financieros regulatorios). Reasignar a módulo **Contabilidad / Reportes SEPS** (lote1 §15). |

> Corrección para la fusión: eliminar `bcaeafi` y `bcaesac` de la sección "Clientes/Socios" del lote 1.
> (La columna `bcadchv.dchv_fec_esac` es un `DATE` homónimo sin relación con `bcaesac`.)

### Imágenes / ocupación / origen de fondos (mencionadas en resumen de lote2, aquí detalladas)

- **Imágenes del socio → `bcaimag`**: `imag_cod_imag` (SERIAL PK), `imag_cod_clie` (FK→`bcaclie`), `imag_fir_imag` (BYTE = firma escaneada), `imag_fot_imag` (BYTE = foto), `imag_arc_foto` (ruta/nombre archivo foto), `imag_arc_cedu` (ruta/nombre archivo cédula). **Relevancia KYC/UAFE**: soporte documental de identidad; equivalente conceptual a `dbo.SocioDocumentoExcepcion` (cara frontal/posterior de cédula) del sistema nuevo.
- **Ocupación → `bcaocu1` → `bcaocu2` → `bcaocup`** (jerarquía tipo CIUO con código SIB): nivel 1 (grupo) → nivel 2 → nivel 3 (`ocup_sib_ocup`, `ocup_cod_segm`, `ocup_rie_ambt` = riesgo ambiental). Insumo de perfil de riesgo y reportes SEPS.
- **Origen de fondos → `bcaorig`**: `orig_cod_orig`, `orig_sib_orig` (código regulatorio), `orig_des_orig`, `orig_ban_orig`. **Relevancia AML**: es el catálogo con que se justifica el origen lícito de recursos del socio (requisito UAFE en apertura y transacciones).

---

## 2. Tabla consolidada de tablas del socio (columnas / relaciones)

Convención AFC: prefijo de 4 letras (`bca`) o 3 (`afc`) repetido por columna; `cod_clie → bcaclie`,
`cod_usua → bcausua`, `sib_ → código regulatorio SEPS/SIB`, `sri_ → código SRI`.

### 2.1 Perfil socioeconómico

| Tabla | Columnas clave | Propósito | FKs |
|---|---|---|---|
| `bcaclna` | `clna_cod_clna` (PK), `clna_cod_clie`, `clna_cod_eciv`, `clna_cod_sexo`, `clna_cod_intr`, `clna_cod_sect`, `clna_jef_hoga`, `clna_dir_trab`, `clna_fec_ingr` | **Datos socioeconómicos del socio** (estado civil, sexo, rango de edad, sector, jefe de hogar, dir. trabajo). Muestra real: `eciv=S, sexo=M, intr=U, sect=511, jef_hoga=0` | `cod_clie`, `cod_eciv`→`bcaeciv`, `cod_sexo`→`bcasexo`, `cod_intr`→`bcaintr`, `cod_sect`→`bcasect` |
| `bcatene` | `tene_cod_tene`, `tene_cod_clie`, `tene_cod_sect`, `tene_are_terr`, `tene_cod_unid`, `tene_rie_terr`, `tene_leg_terr` | Tenencia de terreno/vivienda (área, riesgo, legalización) | `cod_clie`, `cod_sect`, `cod_unid`→`bcaunid` |
| `bcading` | `ding_cod_ineg`, `ding_cod_clie`, `ding_val_deta`, `ding_fec_actu` | **Ingresos declarados** por tipo de actividad/negocio | `cod_clie`, `cod_ineg`→`bcaineg` |
| `afceduc` | `educ_cod_clie`, `educ_cod_tedu`, `educ_fec_educ` | Nivel de educación del socio | `cod_clie`, `cod_tedu`→`afctedu` |
| `afccltr` | `clrl_cod_clie`, `clrl_cod_trla`, `clrl_fec_clrl`, `clrl_est_clrl` | Relación laboral del socio (dependiente/independiente) | `cod_clie`, `cod_trla`→`afctrla` |

### 2.2 Núcleo familiar y referencias

| Tabla | Columnas clave | Propósito | FKs |
|---|---|---|---|
| `bcacfam` | `cfam_cod_clie`, `cfam_cod_tcfa`, `cfam_nom_cfam`, `cfam_ide_cfam`, `cfam_cod_fami` | Familiares / carga familiar | `cod_clie`, `cod_tcfa`→`bcatcfa` |
| `afcrfpe` | `rfpe_cod_clie`, `rfpe_nom_rfpe`, `rfpe_num_tele/celu`, `rfpe_dir_domi`, `rfpe_ide_rfpe`, `rfpe_ema_rfpe`, `rfpe_ban_vali`, `rfpe_cod_tcfa` | Referencias personales/familiares (con bandera de validación telefónica) | `cod_clie`, `cod_tcfa` |
| `bcabene` | `bene_cod_clie`, `bene_cod_cben`, `bene_cod_tben`, `bene_porcent`, `bene_condici` | **Beneficiarios del socio** (% y condición) — trámites de herencia/fallecimiento | `cod_clie`, `cod_tben`→`bcatben` |
| `afcrleg` | `rleg_cod_clie`, `rleg_nom_rleg`, `rleg_ide_rleg`, `rleg_cli_rleg`, `rleg_ban_rleg` | Representante legal (persona jurídica / menor) | `cod_clie` |
| `afccoso` | `coso_cod_soci`, `coso_num_coso`, `coso_nom_resp`, `coso_ema_resp`, `coso_tel_resp`, `coso_fec_inic/fina` | Contactos/responsables de un socio persona jurídica | `cod_soci`→`bcaclie` |

### 2.3 Firmas e imágenes

| Tabla | Columnas clave | Propósito | FKs |
|---|---|---|---|
| `bcacfir` | `cfir_cod_clie`, `cfir_cod_cban`, `cfir_cod_tfir` | **Firmas registradas** del socio por tipo de firma (condición de firmas mancomunadas) | `cod_clie`, `cod_tfir`→`bcatfir` |
| `bcaimag` | `imag_cod_imag` (PK), `imag_cod_clie`, `imag_fir_imag` (BYTE), `imag_fot_imag` (BYTE), `imag_arc_foto`, `imag_arc_cedu` | **Imágenes del socio**: firma escaneada, foto, cédula (BLOB) | `cod_clie` |
| `bcatele` | `tele_cod_tele` (PK), `tele_cod_clie`, `tele_cod_ttel`, `tele_cod_utel`, `tele_num_tele`, `tele_ban_prin` | Teléfonos del socio (principal / secundarios) | `cod_clie`, `cod_ttel`→`bcattel`, `cod_utel`→`bcautel` |

### 2.4 Excedentes / relación económica

| Tabla | Columnas clave | Propósito | FKs |
|---|---|---|---|
| `bcacdso` | `cdso_cod_clie`, `cdso_ani_cdso`, `cdso_val_ut01 … cdso_val_ut12`, `cdso_val_util` | **Excedentes/utilidades distribuidas** al socio, 12 columnas mensuales + total anual | `cod_clie` |

### 2.5 KYC / AML / UAFE (compliance)

| Tabla | Columnas clave | Propósito | FKs |
|---|---|---|---|
| `bcaorig` | `orig_cod_orig`, `orig_sib_orig`, `orig_des_orig`, `orig_ban_orig` | Catálogo **origen de fondos/recursos** | — |
| `bcatvin` | `tvin_cod_tvin`, `tvin_des_tvin`, `tvin_sib_tvin` | Tipo de vínculo (**partes relacionadas** — límites de cupo vinculado) | — |
| `afcauid` | `auid_cod_auid`, `auid_des_auid` | **Autoidentificación étnica** (muestra: "Indígena", "Afroecuatoriano") | — |
| `afchomo` | `homo_nom_tide`, `homo_ide_homo`, `homo_ape_homo`, `homo_nom_homo`, `homo_nac_homo`, `homo_fec_carg/fina` | **Lista de homónimos** (screening OFAC/ONU/PEP) | — |
| `afclhom` | `lhom_cod_lhom`, `lhom_fec_lhom`, `lhom_ide_homo`, `lhom_cod_usua` | Bitácora de consultas contra la lista de homónimos | `cod_usua` |
| `uaf2_productos` | `clie_ide_clie`, `uaf_tip_ctas`, `uaf_num_cuet`, `uaf_sib_ofic`, `uaf_sib_coop`, `uaf_fec_cort` | Estructura de reporte de productos por socio a la **UAFE** (todo CHAR = layout de archivo plano) | — |
| `uaf3_transacciones` | `clie_ide_clie`, `uaf_fec_tran`, `uaf_val_efec`, `uaf_val_chqs`, `uaf_val_tota`, `uaf_imp_isd`, `uaf_sib_pais` | Estructura de reporte de transacciones (efectivo/cheques/ISD) a la UAFE | — |
| `afclpdp` | `lpdp_cod_clie`, `lpdp_ban_lpdp`, `lpdp_fec_modi` | Consentimiento de tratamiento de datos personales (**LOPDP**) | `cod_clie` |
| `afclpwe` | `lpwe_cod_clie`, `lpwe_ban_soci`, `lpwe_ip_lpwe`, `lpwe_fec_lpwe` | Aceptación de términos del portal web (con IP) | `cod_clie` |
| `afclcos` | `lcos_tid_lcos`, `lcos_ide_lcos`, `lcos_nom_lcos`, `lcos_fec_inic/fina`, `lcos_ban_lcos` | Lista de control de personas por tipo+nº identificación (screening/bloqueo) | — |

> Nota compliance: `uaf2_*`/`uaf3_*` son **estructuras de salida** (todo formateado como CHAR); se regeneran
> desde las tablas transaccionales para el envío periódico a la UAFE. No se escribe sobre ellas.

### 2.6 Historial / trazabilidad / situación del socio

| Tabla | Columnas clave | Propósito | FKs |
|---|---|---|---|
| `bcafsal` | `fsal_cod_clie`, `fsal_cod_csal`, `fsal_fec_ingr`, `fsal_fec_sali` | Ficha de situación del socio (entrada/salida de un estado/lista) | `cod_clie`, `cod_csal`→`bcacsal` |
| `bcacsal` | `csal_cod_csal`, `csal_des_csal`, `csal_est_clie`, `csal_sib_csal` | Catálogo de situación del socio | — |
| `afccatc` | `catc_cod_clie`, `catc_tcl_ante`, `catc_tcl_actu`, `catc_num_ante`, `catc_num_actu` | Historial de cambio de tipo de cliente | `cod_clie` |
| `afcctvc` | `ctvc_cod_clie`, `ctvc_tvi_ante`, `ctvc_cod_tvin` | Historial de cambio de tipo de vínculo | `cod_clie`, `cod_tvin`→`bcatvin` |
| `afchofc` | `hofc_cod_clie`, `hofc_cod_ofct`, `hofc_ofc_ante`, `hofc_fec_hofc` | Historial de cambio de oficina del socio | `cod_clie` |
| `afcclho` | `clho_cod_clie`, `clho_ide_clho`, `clho_abr_opci`, `clho_fec_clho` | Bitácora de consultas/opciones sobre el socio | `cod_clie` |
| `afcsoop` | `soop_cod_optr`, `soop_num_soci`, `soop_cod_clie` | Relación socio ↔ oficial de cuenta/operación | `cod_clie` |
| `afcgrup` | `grup_num_grup`, `grup_cod_clie`, `grup_des_grup`, `grup_ban_grup` | Grupos (bancas comunales / créditos solidarios) | `cod_clie` |

> Trazabilidad transversal: el trío `track_01 / track_02 / track_03` (lote3 §17) es el audit trail nativo
> (sesión → sentencia DML → valor de columna) y permite reconstruir quién modificó qué campo del socio y cuándo.

### 2.7 Catálogos de apoyo del módulo

| Catálogo | Contenido |
|---|---|
| `bcaeciv` | Estado civil (`eciv_des_eciv`, `eciv_eda_eciv`) |
| `bcasexo` | Sexo |
| `bcaintr` | Rangos de edad / intervalo (`intr_eda_intr`) |
| `bcaineg` | Tipo de ingreso / actividad económica (`ineg_sig_ineg`) |
| `bcaocu1` / `bcaocu2` / `bcaocup` | Ocupación jerárquica (CIUO/SIB), con segmento y riesgo ambiental |
| `bcasect` / `bcatsec` | Sector/barrio (por ciudad) y tipo de sector (urbano/rural) |
| `bcarlab` / `afctrla` | Relación laboral (dependiente/independiente) |
| `bcatcar` / `bcatcfa` | Tipo de carga familiar / composición familiar |
| `bcatben` | Tipo de beneficiario |
| `bcatfir` | Tipo/condición de firma (mancomunadas) |
| `bcatide` / `afcdisc` | Tipo de identificación (cédula/RUC/pasaporte), con código SRI |
| `afctedu` / `afcprof` / `afctviv` | Educación / profesión / tipo de vivienda |
| `afcescl` / `afcescp` | Estado civil (variante `afc`) / escala complementaria |
| `bcapais` / `bcanatu` | País (código SRI/nacionalidad) / naturaleza (natural/jurídica) |
| `bcaitrv` | Intervalo de revisión en meses (actualización periódica de datos KYC) |

---

## 3. Mapa de reportes / funciones que el módulo debería exponer

Cada función indica: tablas Informix que la alimentan, equivalente en SQL Server (`dbo.RegistroSocios` y
tablas satélite), y prioridad sugerida. `dbo.RegistroSocios` ya cubre: `EstadoCivil, Genero, Etnia,
NivelInstruccion, Profesion, LugarTrabajo, CedulaConyuge/NombreConyuge, ReferenciasPersonales (JSON),
CargasFamiliares (JSON)`, más `PatrimonioIngresos`/`ValorVivienda`/`PEPs` (vistos en `UPDATE` de `server.js`)
y satélites `SocioUbicacionMapa`, `SocioCroquisTrabajo`, `SocioDocumentoExcepcion`.

| # | Reporte / función | Tablas Informix | Equivalente SQL Server | Prioridad |
|---|---|---|---|---|
| 1 | **Ficha socioeconómica completa del socio** (estado civil, sexo, rango edad, sector, jefe de hogar, tenencia vivienda, ocupación, actividad) | `bcaclna` + `bcatene` + `bcaocup`/`bcaocu2`/`bcaocu1` + `afceduc` + `afccltr` + catálogos (`bcaeciv`, `bcasexo`, `bcaintr`, `bcasect`, `bcaineg`) | **Parcial**: `RegistroSocios` (EstadoCivil, Genero, Etnia, NivelInstruccion, Profesion, LugarTrabajo). Faltan sector, jefe de hogar, tenencia, ocupación CIUO | **ALTA** |
| 2 | **Beneficiarios registrados** (herencia / fallecimiento) | `bcabene` + `bcatben` | **No existe** | **ALTA** |
| 3 | **Firmas autorizadas registradas** (verificación en ventanilla) | `bcacfir` + `bcatfir` + `bcaimag` (BYTE firma) | **No existe** (solo imágenes de croquis/mapa, no firma) | **ALTA** |
| 4 | **KYC/AML — perfil de cumplimiento del socio** (origen de fondos, autoidentificación, partes relacionadas, screening PEP/homónimos, consentimiento LOPDP) | `bcaorig` + `afcauid` + `bcatvin` + `afchomo` + `afclhom` + `afclcos` + `afclpdp` | **No existe** (solo `PEPs` bit suelto en `RegistroSocios`) | **ALTA** (obligación UAFE/SEPS) |
| 5 | **Reporte UAFE — productos y transacciones del socio** | `uaf2_productos` + `uaf3_transacciones` | **No existe** | **ALTA** (regulatorio periódico) |
| 6 | **Capacidad de pago / ingresos declarados** (originación de crédito) | `bcading` + `bcaineg` + `bcatene` | **Parcial**: `PatrimonioIngresos` (JSON), `ValorVivienda` | **MEDIA-ALTA** |
| 7 | **Historial de excedentes/utilidades distribuidas por año** | `bcacdso` (ut01..ut12 + total) | **No existe** | **MEDIA** |
| 8 | **Referencias personales y cargas familiares** | `bcacfam` + `afcrfpe` + `bcatcfa`/`bcatcar` | `RegistroSocios.ReferenciasPersonales` / `CargasFamiliares` (JSON) — sin normalizar ni validar | **MEDIA** |
| 9 | **Documentos e imágenes del socio** (foto, cédula, firma) | `bcaimag` | `SocioDocumentoExcepcion` (cara frontal/posterior), `SocioUbicacionMapa`, `SocioCroquisTrabajo` (VARBINARY) | **MEDIA** |
| 10 | **Situación del socio / listas de control** (entrada-salida de estados, bloqueos) | `bcafsal` + `bcacsal` + `afclcos` | **No existe** | **MEDIA** |
| 11 | **Trazabilidad del socio** (cambios de tipo, vínculo, oficina; auditoría de campos) | `afccatc` + `afcctvc` + `afchofc` + `afcclho` + `track_01/02/03` | **Parcial**: auditoría genérica de `RegistroSocios` (script 07) | **MEDIA-BAJA** |
| 12 | **Persona jurídica: representante legal, contactos y grupos** | `afcrleg` + `afccoso` + `afcgrup` + `afcbeco` | **No existe** | **BAJA** |

### Notas de mapeo y riesgos para la integración read-through

- **Precisión monetaria**: `bcading.ding_val_deta`, `bcacdso.val_ut01..12`, `bcatene.are_terr` son
  `DECIMAL` en Informix. Al proyectarlos hacia el sistema nuevo, mantener `DECIMAL/NUMERIC` (nunca `float`);
  `PatrimonioIngresos` hoy vive como JSON en `NVARCHAR(MAX)` — aceptable para captura, **no** para sumatorias/reportes.
- **BLOBs (`BYTE`)**: `bcaimag` requiere manejo especial en el bridge ODBC (hoy `queryInformix` serializa a
  JSON; un `BYTE` grande puede exceder el timeout de 25s). Preferir exponer `imag_arc_foto`/`imag_arc_cedu`
  (rutas) antes que el binario embebido.
- **Compliance primero**: las funciones 4 y 5 (KYC/AML/UAFE) tienen prioridad alta no por volumen sino por
  obligación regulatoria (SEPS/UAFE Ecuador). Validar reglas y periodicidad con el equipo de cumplimiento
  antes de definir el contrato de datos.
- **Llave de join**: todas las tablas complementarias se unen por `cod_clie` (INTEGER interno de `bcaclie`),
  no por cédula. El puente hacia SQL Server debe resolver `clie_ide_clie` (cédula) → `clie_cod_clie` una sola
  vez y reutilizar el `cod_clie` para no repetir el `LIKE` costoso por cédula que hoy usa `buscarClienteInformix`.
