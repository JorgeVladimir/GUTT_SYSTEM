# Módulo: Auditoría / Seguridad / Accesos — core AFC Informix

Documento consolidado (solo lectura, para integración read-through hacia el sistema nuevo SQL Server + React).
Fusiona: trío `track_*` (lote 3 §17), tablas de seguridad de lote 1 (§20) y la capa de aplicación de lote 2 (§14).
Volúmenes y muestras verificados el 2026-07-14 contra la VM de pruebas (`192.168.1.199:1526`, server `ol_servidor`,
base `afccajacrediapoyo`) vía `db/informix/introspeccion.js`.

---

## 1. Resumen ejecutivo

El sistema legacy AFC tiene **dos subsistemas de seguridad/auditoría claramente separados**, hoy sin equivalente
en el sistema nuevo:

1. **Audit trail de datos (trío `track_01/02/03`)** — bitácora encadenada, poblada por triggers en un subconjunto
   de tablas de negocio. Reconstruye *quién* modificó *qué campo* de *qué registro*, *cuándo* y *desde qué estación*.
   Es la fuente de trazabilidad relevante para SOX/SEPS. **Confirmado en producción de datos**: 10.843 sesiones,
   15.929 operaciones DML auditadas, 203.855 valores de columna, cubriendo del **2025-05-08 al 2026-06-13** (~13 meses).

2. **Control de accesos / autorización (tablas `bca*`)** — dos capas de permisos (por **perfil** vía `bcaaper` y por
   **usuario** vía `bcaustr`) sobre una jerarquía de menús `bcamodu → bcamenu → bcaopci → bcaoptr`, más bitácoras de
   sesión/terminal (`bcaacer`, `bcaapp`, `bcaopen`) y habilitación usuario↔entorno (`bcaacce`).

El login del sistema nuevo (`server.js`) ya usa `bcausua`/`bcaperf` para autenticar, pero **no consume el modelo de
permisos por opción de menú ni genera audit trail propio**. Todo lo de este documento es funcionalidad net-new para
el sistema nuevo (ver §4).

> **Hallazgo de integridad a señalar**: el audit trail `track_*` depende de **triggers instalados solo en ciertas
> tablas**. No es auditoría universal. Cualquier escritura del sistema nuevo directamente sobre Informix que no pase
> por esos triggers **no quedará registrada** — riesgo de laguna de trazabilidad si el read-through evoluciona a
> read-write sin replicar el mecanismo.

---

## 2. Tabla consolidada (columnas y relaciones)

### 2.1 Audit trail de datos — trío `track_*` (encadenado sesión → sentencia → columna)

| Tabla | Columnas clave | Rol | Relación |
|---|---|---|---|
| `track_01` | `track_01_userid`, `track_01_username`, `track_01_module`, `track_01_station`, `track_01_dbuser`, `track_01_datei` (entrada), `track_01_dateo` (salida) | **Sesión**: quién entró, desde qué estación/usuario de BD, a qué módulo, hora de entrada y salida | `userid → bcausua`; `module → bcamodu.modu_cod_modu`; PK lógica = valor referenciado por `track_02_cod_01` |
| `track_02` | `track_02_table`, `track_02_statment` (Insert/Update/Delete/Select), `track_02_date`, `track_02_cod_01` | **Operación DML auditada**: tabla afectada + tipo de sentencia, con FK a la sesión | `cod_01 → track_01` |
| `track_03` | `track_03_cod_02`, `track_03_pkval` (valor PK del registro tocado), `track_03_colname`, `track_03_value`, `track_03_case` (I/U/D) | **Detalle a nivel columna**: por cada columna afectada, el valor y el tipo de cambio | `cod_02 → track_02` |

Cadena de reconstrucción: `track_01` (sesión/usuario/estación) → `track_02` (tabla + operación) → `track_03`
(cada columna: PK del registro, nombre de columna, valor, I/U/D). Un `UPDATE` de N columnas genera 1 fila en
`track_02` y N filas en `track_03`.

> **Limitación forense**: `track_03_value` guarda el **valor resultante** (post-cambio) por columna, no un par
> antes/después. Para un `UPDATE` se ve el valor nuevo; el valor previo se infiere del `track_02` anterior sobre la
> misma PK+columna. La reconstrucción de "valor anterior → valor nuevo" requiere ordenar por fecha y encadenar, no
> es una lectura directa de una sola fila.

### 2.2 Autorización — jerarquía de menús y permisos

| Tabla | Columnas clave | Rol | Relación |
|---|---|---|---|
| `bcamodu` | `modu_cod_modu`, `modu_des_modu` | **Módulos** del sistema (Contabilidad=1, Flujo de Caja=5, Clientes=11, Ctas Cobrar=12, Captaciones=13, DPF=14, Administración=20…) | raíz de la jerarquía |
| `bcamenu` | `menu_cod_menu` (SERIAL), `menu_des_menu`, `menu_cod_modu`, `menu_clas_menu` | **Menús** dentro de un módulo | `cod_modu → bcamodu` |
| `bcaopci` | `opci_cod_opci` (SERIAL), `opci_cod_modu`, `opci_cod_menu`, `opci_nom_opci`, `opci_microhelp`, `opci_ban_opci`, `opci_ord_opci` | **Opciones/pantallas** de un menú (unidad de permiso) | `cod_menu → bcamenu`, `cod_modu → bcamodu` |
| `bcaoptr` | `optr_cod_optr` (SERIAL), `optr_cod_opci`, `optr_cod_tran` | Relación **opción ↔ transacción** permitida | `cod_opci → bcaopci`, `cod_tran → bcatran` |
| `bcaperf` | `perf_cod_perf`, `perf_des_perf` (documentada en INVENTARIO_TABLAS) | **Catálogo de perfiles** | asignado al usuario vía `bcausua.usua_cod_perf` |
| `bcaaper` | `aper_cod_perf`, `aper_cod_opci`, `aper_ctr_opci` | **Permisos POR PERFIL**: qué opciones puede ver/usar un perfil y con qué nivel de control | `cod_perf → bcaperf`, `cod_opci → bcaopci` |
| `bcaustr` | `ustr_cod_usua`, `ustr_cod_optr`, `ustr_ban_ustr` | **Permisos POR USUARIO** (override a nivel opción↔transacción) | `cod_usua → bcausua`, `cod_optr → bcaoptr` |
| `bcaofus` | `ofus_cod_ofus` (SERIAL), `ofus_cod_ofic`, `ofus_cod_usua` | Asignación **usuario ↔ oficina** | `cod_usua → bcausua`, `cod_ofic` |

### 2.3 Bitácoras de sesión / terminal / habilitación

| Tabla | Columnas clave | Rol | Relación |
|---|---|---|---|
| `bcaacer` | `acer_fec_acer`, `acer_ter_acer` (terminal), `acer_usa_acer`, `acer_pas_acer`, `acer_ban_acer`, `acer_usu_acer`, `acer_fcc_acer` | **Registro de acceso/credenciales por terminal** (intento/evento de login por estación) | — |
| `bcaacce` | `acce_cod_bbdd`, `acce_cod_usua` | **Habilitación usuario ↔ base/entorno** (2 columnas; qué usuario está habilitado en qué BD). *No es un log*: es una tabla de relación de acceso | `cod_usua → bcausua`, `cod_bbdd → bcabbdd` |
| `bcaapp` | `app_cod_modu`, `app_computer`, `app_fecha` | **Módulo/app abierto por computador** (control de concurrencia / sesiones activas) | `cod_modu → bcamodu` |
| `bcaopen` | `open_cod_open` (SERIAL), `open_des_open`, `open_ses_id`, `open_nam_pc` | Sesiones/procesos abiertos por PC (control de concurrencia; semi-técnica) | — |
| `bcaerro` | `erro_cod_bbdd`, `erro_cod_erro`, `erro_det_erro`, `erro_ico_erro` | Catálogo de mensajes de error del sistema | `cod_bbdd → bcabbdd` |

> **Resuelto (ambigüedad `bcaacce` vs `bcaacer`)**: `bcaacer` es una **bitácora de eventos de acceso por terminal**
> (fecha, terminal, usuario, bandera, credenciales); `bcaacce` es una **tabla de relación** usuario↔base de datos de
> 2 columnas (habilitación de acceso al entorno), no un log. Son cosas distintas pese al nombre parecido. `bcaacce`
> además aparece **auditada** en `track_02` (114 operaciones), confirmando que es una tabla mantenida por la app.

---

## 3. Cómo se relaciona `bcaaper` con `bcaperf` y con los menús

Modelo de autorización en **dos capas** sobre la jerarquía de menús:

```
bcausua (usuario) --usua_cod_perf--> bcaperf (perfil)
                                        |
                    bcaaper (perfil x opción, con nivel de control ctr_opci)
                                        |
   bcamodu ---> bcamenu ---> bcaopci (opción/pantalla) ---> bcaoptr (opción x transacción)
                                        ^                              ^
                                        |                              |
              bcaaper referencia opci   +---- bcaustr (usuario x optr) override por usuario
```

- **`bcaperf`** es el catálogo de perfiles. Cada usuario (`bcausua`) tiene un perfil (`usua_cod_perf`).
- **`bcaaper`** materializa el permiso **a nivel de perfil**: fila `(cod_perf, cod_opci, ctr_opci)` = "el perfil X
  tiene acceso a la opción de menú Y con nivel de control Z". `cod_opci → bcaopci`, que a su vez cuelga de
  `bcamenu → bcamodu`. Es decir, `bcaaper` **conecta el perfil directamente con las opciones/pantallas de menú**.
- **`bcaustr`** es la capa de **override por usuario individual**: fila `(cod_usua, cod_optr, ban_ustr)` habilita/
  deshabilita una transacción concreta (`bcaoptr` = opción↔transacción) para un usuario específico, más fina que el
  perfil.

**Permiso efectivo de un usuario** = opciones permitidas por su perfil (`bcaaper` vía `bcaperf`) **∪/∖** overrides
individuales (`bcaustr`), resuelto contra la jerarquía `bcaopci/bcaoptr`. Nota: `bcaaper` opera a nivel *opción*
(`bcaopci`) y `bcaustr` a nivel *opción-transacción* (`bcaoptr`) — distinta granularidad, hay que unirlas con cuidado
al calcular el efectivo.

---

## 4. Hallazgos de volumen y patrón de uso real (verificado)

Consultas de conteo/agregación sobre las tablas `track_*` (2026-07-14):

| Métrica | Valor |
|---|---|
| Sesiones (`track_01`) | **10.843** |
| Operaciones DML auditadas (`track_02`) | **15.929** |
| Valores de columna (`track_03`) | **203.855** (~12,8 filas por operación DML) |
| Rango temporal (`track_01_datei`) | **2025-05-08 → 2026-06-13** (~13 meses) |

**Desglose por tipo de sentencia (`track_02`)**: Insert 13.308 (83,5 %) · Update 2.419 (15,2 %) · Delete 167 (1,0 %)
· Select 35 (0,2 %).

**Top tablas auditadas (`track_02`)**: `bcadivc` 7.040 (dividendos/cuotas de crédito — dominan por la generación
masiva de cronogramas al desembolsar) · `bcaclie` 2.177 (socios) · `afcdrie` 1.660 (evaluación de riesgo) ·
`bcadpvi` 738 (cuentas vista) · `bcalibr` 703 · `bcafadv` 685 (firmas autorizadas) · `bcaclna` 436 · `bcadefe` 404
(denominaciones efectivo) · `bcasocr` 324 · `bcadeef` 306 · `bcadpfi` 214 (DPF) · `bcaacce` 114 …

**Patrones confirmados:**
1. **Auditoría selectiva, no universal**: solo un subconjunto de tablas de negocio dispara los triggers `track_*`.
   Las de mayor movimiento (dividendos, socios, riesgo, cuentas, efectivo, firmas) están cubiertas; muchas otras no.
2. **Muchas sesiones, pocos cambios**: 10.843 sesiones vs 15.929 DML ⇒ la mayoría de la actividad es navegación/
   consulta de solo lectura que no genera DML auditable. El audit trail mide **escritura**, no uso general.
3. **Sesgo fuerte a INSERT** (83,5 %): el sistema audita sobre todo altas (originación de crédito → cronograma,
   alta de socios/cuentas). Los `DELETE` (167) son raros y por eso especialmente relevantes para revisión forense.
4. **`track_01.module` mapea a `bcamodu`** (verificado: 5=Flujo de Caja, 11=Clientes, 12=Ctas Cobrar…), y `station`
   guarda el hostname (ej. `CONY-DESARROLLO`). Se puede segmentar la bitácora por módulo y por estación física.

---

## 5. Mapa de reportes / funciones que este módulo debería exponer

Ninguno de los siguientes tiene equivalente en el sistema nuevo hoy: `server.js` solo hace login contra
`bcausua`/`bcaperf` y **no** expone audit trail ni matriz de permisos. Se confirma que **todos son net-new**.

| # | Reporte / función | Tablas que lo alimentan | ¿Equivalente en sistema nuevo? | Prioridad |
|---|---|---|---|---|
| 1 | **Bitácora de cambios por usuario / tabla / período** (filtro por rango de fechas, usuario, tabla, tipo de operación) | `track_01` + `track_02` (+ `bcausua`, `bcamodu` para nombres) | No | **Alta** |
| 2 | **Detalle de cambios de un registro** (dado tabla + PK, listar columnas cambiadas, valor, I/U/D, quién y cuándo) | `track_02` + `track_03` (+ `track_01`) | No | **Alta** |
| 3 | **Matriz de permisos por perfil** (perfil × opción de menú, con nivel de control; navegable por módulo/menú) | `bcaperf` + `bcaaper` + `bcaopci` + `bcamenu` + `bcamodu` | No | **Alta** |
| 4 | **Permisos efectivos por usuario** (perfil heredado + overrides individuales, resuelto a nivel opción/transacción) | `bcausua` + `bcaperf` + `bcaaper` + `bcaustr` + `bcaoptr` + `bcaopci` | No | Media |
| 5 | **Historial de accesos / sesiones** (login por usuario, estación, módulo, entrada/salida, duración) | `track_01` (+ `bcaacer` para eventos de terminal/credenciales) | No | Media |
| 6 | **Sesiones / procesos activos** (control de concurrencia: quién tiene qué módulo abierto y en qué PC) | `bcaapp` + `bcaopen` | No | Media |
| 7 | **Reconstrucción temporal (forense) de un registro** (replay ordenado de `track_03` para ver evolución de un campo) | `track_02` + `track_03` ordenados por fecha | No | Media |
| 8 | **Reporte de eliminaciones (DELETE)** (todas las bajas auditadas — foco de revisión por su rareza, 167 históricas) | `track_02` (filtro `statment='Delete'`) + `track_03` | No | Media |
| 9 | **Habilitación usuario ↔ entorno** (qué usuarios están habilitados en qué base) | `bcaacce` (+ `bcabbdd`) | No | Baja |
| 10 | **Catálogo de errores del sistema** (soporte / documentación de mensajes) | `bcaerro` (+ `bcabbdd`) | No | Baja |

**Nota de compliance para el diseño de estos reportes**: los reportes 1, 2, 7 y 8 son la evidencia de trazabilidad
que un auditor SEPS/SOX pediría. Al exponerlos en el sistema nuevo conviene que sean **estrictamente de lectura** y
que su propio acceso quede auditado (no auditar la lectura del audit trail es un hueco clásico). El nivel `ctr_opci`
de `bcaaper` (reporte 3) no está decodificado aquí — su escala de valores debe confirmarse antes de exponerlo como
"nivel de permiso" en una UI (ambigüedad pendiente).

---

## Ambigüedades pendientes (declaradas, no resueltas por eficiencia)

- **`bcaaper.aper_ctr_opci`**: es un nivel/bandera de control por opción, pero su escala (p.ej. 0=sin acceso,
  1=consulta, 2=edición…) no fue verificada. Confirmar con muestra antes de mapear a permisos de UI.
- **`track_03_value` como valor único post-cambio**: la reconstrucción antes/después requiere encadenar por fecha
  (§2.1); no hay columna de "valor anterior" nativa.
- No se abrió `bcatran` (catálogo de transacciones referenciado por `bcaoptr`); su granularidad no se documentó aquí.
