# Inventario de origen para MIG-01: `SQLGUTPATATE`

Levantado el 2026-09-20, **solo lectura** (`node tools/db.mjs`). No contiene nombres, cédulas ni contraseñas: solo códigos internos y conteos.
Sirve de base para el mapeo origen → destino y las reglas de reconciliación de la Fase 3 (MIG-01). Ningún dato se movió.

## 1. Tamaño

- **37 tablas**: 31 con datos y 6 vacías. **2.340 filas** en total y unos **10 MB**, de los cuales **8,5 MB son las dos tablas de imágenes** (`SocioUbicacionMapa` 4,27 MB y `SocioCroquisTrabajo` 4,20 MB).
- Es una base **mono-cooperativa** (sin `CooperativaId`): todo migra a **una** cooperativa en TECNIFIN.
- Nota de método: la primera consulta multiplicó las filas por el número de unidades de asignación (11 socios aparecían como 33). Los conteos de abajo salen de `sys.dm_db_partition_stats` y coinciden con `SELECT COUNT(*)`.

## 2. Mapeo origen → destino (esquema de `db/gutt_system/01-09`)

| Origen (filas) | Destino en TECNIFIN | Archivo | Nota |
|---|---|---|---|
| `Usuarios` (7) | `Usuarios` | 01 | Roles: ADMIN 2, CARTERA, CREDIT_OFFICER, SUPER_USER, TELLER, ACCOUNTANT. `PIN` no se copia: se regenera |
| `RegistroSocios` (11) | `Socios` + `SocioDireccion`, `SocioConyuge`, `SocioReferencia`, `SocioCarga` | 02 | El origen es una tabla ancha; el destino la normaliza en 5 |
| `SocioUbicacionMapa` (9), `SocioCroquisTrabajo` (5) | mismas | 02 | Imágenes `VARBINARY(MAX)`: decide la pregunta 8 (dentro o fuera de la base) |
| `CuentasAhorro` (22) | `Cuentas` | 03 | El origen no tiene tabla de movimientos: `MovimientosCuenta` nace vacía |
| `parametrosproductos` (2) | `ProductosFinancieros` | 03 | A confirmar |
| `SolicitudesCredito` (19), `Creditos` (5), `TablaDeAmortizacion` (24), `RubrosCreditos` (120) | `SolicitudesCredito`, `Creditos`, `TablaAmortizacion`, `RubrosCreditos` | 04 | Estados: 14 SOLICITADO, 5 VIGENTE |
| `DepositosPlazo` (11), `SecuenciaDPF` (3), `TasasPlazoFijo` (5) | `DepositosPlazo`, `SecuenciaDPF`, `TasasPlazoFijo` | 05 | La secuencia global pasa a secuencia por cooperativa |
| `ControlCaja` (9), `Denominaciones` (12), `DetalleEfectivoTransaccion` (0) | `ControlCaja`, `Denominaciones`, `DetalleEfectivoTransaccion` | 06 | `TransaccionesCaja` nace vacía: en el origen es efecto colateral del asiento |
| `PlanCuentas` (1.104) | `PlanCuentas` | 07 | Catálogo Único SEPS: ¿una copia por cooperativa o catálogo global? Decidir en ADR-003 |
| `RegistroContable` (333) | `AsientosContables` + `DetalleAsiento` | 07 | Origen plano (un Debe/Haber por fila) → cabecera + líneas |
| `AsientosContablesDPF` (22) | `AsientosContables` con `OrigenModulo='PLAZO_FIJO'` | 07 | Deja de existir como tabla aparte |
| `AuditoriaUsuarios` (35), `AuditoriaProcesos` (194) | `AuditoriaUsuarios`, `AuditoriaProcesos` | 08 | |

## 3. Tablas **sin destino** en DAT-01 (01-09): falta un DAT-02

Todas nacieron después del rediseño (migraciones 26-34 de `SQLGUTPATATE`) y el esquema `db/gutt_system/01-09` no las conoce:

| Origen (filas) | Qué es |
|---|---|
| `ReclasificacionCartera` (28), `ReclasificacionCarteraDetalle` (226) | Historial del proceso mensual de cartera |
| `ParametrosProvisionCartera` (36), `PonderacionesRiesgo` (28), `ParametrosPatrimonioTecnico` (15), `ParametrosRegulatorios` (4) | Datos regulatorios paramétricos (regla 5) |
| `TasasCredito` (5) | Tasas de crédito. No aparece en el destino: confirmar si va a `ProductosFinancieros` |
| `ActivacionBancaLinea` (10) | Activación de la banca en línea / GUTT MÓVIL |
| `SocioDocumentoExcepcion` (2) | Excepciones de documentos del socio |

**Consecuencia:** DAT-01 cubre el modelo original, pero el proceso de cartera, la solvencia regulatoria y la banca en línea necesitan sus propias migraciones (propuesta: DAT-02, antes de portar los módulos 6 y 7).

## 4. No migran

| Tabla | Motivo |
|---|---|
| `MigracionesAplicadas` (32) | Control del migrador viejo; TECNIFIN tiene el suyo |
| `AgenteEngrams` (2) | Herramienta interna, no es del negocio |
| `ClientesInformix`, `HomologacionPerfilInformix`, `Stg_Clientes_Informix`, `Stg_Perfiles_Informix`, `Stg_Usuarios_Informix` (todas vacías) | Restos de la integración con el core Informix; el sistema se vende standalone |

## 5. Datos reales frente a datos de demostración

**Clasificación inferida, no verificada.** Se dedujo de quién y cuándo creó cada socio y de marcas obvias en el nombre. **Jorge debe confirmarla socio por socio antes del ensayo.**

| Socio | Creado | Por | Cuentas | Solicit. | Créd. | DPF | Asientos | Clasificación |
|---|---|---|---:|---:|---:|---:|---:|---|
| S-001 | 2026-06-13 | system | 2 | 11 | 3 | 3 | 21 | **Probable real** |
| S-002 | 2026-06-13 | caja | 2 | 4 | 0 | 3 | 10 | **Probable real** |
| S-003 | 2026-07-08 | caja | 2 | 0 | 0 | 0 | 2 | **Probable real** |
| S-004 | 2026-07-17 | caja | 2 | 0 | 0 | 0 | 2 | **Probable real** |
| S-005 | 2026-08-18 | caja | 2 | 0 | 0 | 0 | 2 | **Probable real** |
| S-006 | 2026-08-18 | caja | 2 | 0 | 0 | 0 | 2 | **Probable real** |
| S-007 | 2026-09-17 | admin | 2 | 0 | 0 | 0 | 4 | Sintético (nombre lo marca) |
| S-008 | 2026-09-17 | admin | 2 | 1 | 0 | 1 | 6 | Sintético (nombre lo marca) |
| S-009 | 2026-09-18 | admin | 2 | 0 | 0 | 1 | 6 | **Sin marca, pero creado por `admin` el 18-sep**: probable demo |
| S-0010 | 2026-09-18 | admin | 2 | 2 | 1 | 2 | 15 | Sintético (nombre lo marca) |
| S-0011 | 2026-09-19 | admin | 2 | 1 | 1 | 1 | 9 | Sintético (nombre lo marca) |

- Usuario de demostración: `demo_ventas` (ADMIN). Lo creó `36_crear_usuario_demo_ventas.js`.
- Propuesta: migrar **solo** los probables reales a la base `tecnifin` de producción; los sintéticos (y los usuarios de demo) van a una base de demostración aparte (regla 11 de TECNIFIN).
- **Advertencia:** aunque S-001…S-006 sean reales, S-001 tiene 11 solicitudes y 3 créditos, algunos generados probablemente por pruebas de flujo. Separar caso por caso.

## 6. Hallazgos de calidad para corregir **antes** del ensayo

1. **Numeración de socios inconsistente:** `S-001` … `S-006` y luego `S-0010`, `S-0011` (ancho distinto). Con la decisión de Jorge (numeración por cooperativa **desde 1**) se reasigna: el número antiguo se guarda en una columna aparte (`numero_socio_anterior`), no se reutiliza como clave.
2. **Dos asientos del plazo fijo con códigos con puntos**, fuera del catálogo: `2.1.01.05` y `2.1.03.25` (formato legado). La migración 34 corrigió las **tasas** (`TasasPlazoFijo`), pero no estos asientos históricos. Corregir a `210105` y `210325` en la carga, con acta de qué se cambió.
3. **254 de 333 asientos no tienen socio** (`SocioId` NULL): son asientos agregados de procesos de cierre. El destino lo admite (`RegistroContable.SocioId` acepta NULL, migración 32). No forzar `0`: rompe la clave foránea.
4. **Datos con caracteres mal codificados** ya detectados antes en `DescripcionRango` (corregidos en la migración 34); revisar el resto de campos de texto libre al cargar.
5. **Imágenes en la base** (8,5 MB de 10): definen el tamaño del respaldo y de la migración.

## 7. Números de referencia para la reconciliación (estado del 2026-09-20)

| Control | Valor de referencia |
|---|---|
| Filas por tabla | Tabla de la sección 2, 3 y 4 |
| Libro contable (`RegistroContable`) | Debe = Haber = **503.511,26**; 333 asientos del 2026-06-13 al 2026-09-20; **0** cuentas fuera del plan |
| Asientos del plazo fijo fuera del plan | 2 (sección 6, punto 2) |
| Solicitudes de crédito | 19: 14 SOLICITADO, 5 VIGENTE; 5 créditos |
| Plan de cuentas | 1.104 cuentas, ninguna con puntos |
| **Por calcular antes del ensayo** | Cartera bruta `1401..1428` contra la suma de la tabla de amortización (**no** usar `{14}`, que es neta), saldos por cuenta y por socio, morosidad, y el Estado de Situación Financiera |

Nota: estos valores **cambian** mientras la demo siga en uso; se recalculan sobre la **restauración del respaldo** con la que se ensaye, no sobre la base viva.

## 8. Decisiones (resueltas por Jorge el 2026-09-20)

1. **La base de TECNIFIN nace en blanco:** no se migra ningún dato real. La clasificación real/demo de la sección 5 deja de ser un requisito de migración.
2. **Los sintéticos pasan a una base de demostración** (`tecnifin_demo`), generada por un script versionado, no copiada.
3. **Catálogo de cuentas uno por cooperativa**, sin relación entre cooperativas (ya así en DAT-01).
4. **DAT-02 abierto** para las tablas sin destino de la sección 3.
5. **Imágenes dentro de la base** (`bytea`).

> **Estado del documento:** referencia histórica. Sirve para saber qué funcionamiento debe poder mostrar la demostración y qué haría falta si una cooperativa nueva trajera datos de su sistema anterior.
