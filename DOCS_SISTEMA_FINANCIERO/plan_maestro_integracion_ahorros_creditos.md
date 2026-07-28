# Plan Maestro de Integración Informix → SQL Server
## Clientes, Ahorros y Créditos — GUTT_SYSTEM

Documento de coordinación técnica entre las disciplinas del equipo (Backend, Frontend, Diseño, Seguridad, QA, Curaduría de Datos, Analista de BD). Basado en el estado **real** del código y del esquema Informix ya introspectado en este repositorio — no en supuestos. Base de pruebas: `afccajacrediapoyo` en `192.168.1.199:1526` (conectividad verificada).

---

## 0. Resumen ejecutivo — estado actual (as-is)

El sistema ya tiene una arquitectura de integración funcionando, no se parte de cero:

- **Bridge de datos**: `server.js` (Express) conecta a SQL Server vía `mssql` y a Informix vía un puente PowerShell 32-bit + ODBC (`api/informix-bridge.ps1`), porque el driver IBM Informix ODBC disponible es x86.
- **Patrón de migración ya probado** (usado en Clientes, debe reutilizarse tal cual para Ahorros y Créditos):
  1. Extracción → `db/informix/0N_extract_<tabla>.sql`
  2. Staging → tabla `dbo.Stg_<Entidad>_Informix` (columnas legacy crudas + `FechaCarga`)
  3. MERGE idempotente → `dbo.usp_Merge<Entidad>DesdeInformix` (limpia con `NULLIF(LTRIM(RTRIM(...)), '')`, nunca sobreescribe con `TRUNCATE`)
  4. Vista de consumo → `dbo.vw_<Entidad>InformixParaApp`
  5. Trazabilidad obligatoria → `OrigenSistema`, `Origen<Entidad>Id`, `FechaCreacion`, `FechaActualizacion`, índice único `(OrigenSistema, Origen<Entidad>Id)`
- **Regla ya documentada** (`db/sqlserver/MIGRACION_INFORMIX_SQLSERVER.md`): el frontend **nunca** consulta Informix directo; todo pasa por SQL Server o por un fallback en vivo controlado desde `server.js`.

### Estado real por dominio

| Dominio | Tabla Informix | Estado |
|---|---|---|
| **Clientes** | `bcaclie` | ✅ Migrado end-to-end (`db/sqlserver/04_integracion_clientes_informix.sql`): staging, MERGE, vista, índice único. Patrón de referencia. |
| **Créditos** | `bcacred` | 🟡 Esquema real ya documentado (76 columnas, ver `db/informix/INVENTARIO_TABLAS.md` sección 2) con datos de muestra reales. Hoy solo se consulta **en vivo** como fallback (`buscarCreditosInformix` en `server.js:188`) — sin staging ni MERGE en SQL Server. Cada consulta abre un proceso PowerShell nuevo: hay latencia, no hay caché ni histórico. |
| **Ahorros** | `bcadpvi` | 🟢 **Esquema confirmado por introspección real (2026-07-13)**. `bcadivc` (candidata original) resultó ser en realidad la tabla de dividendos/cuotas de crédito, no ahorros — corregido en `INVENTARIO_TABLAS.md` sección 3bis. La tabla maestra real es `bcadpvi` ("depósito a la vista"), con `bcamcdv` como histórico de movimientos y `bcaeacd` como catálogo de estado. Falta ejecutar la migración (staging + MERGE), ver 1.2 actualizado. |

**Hallazgo confirmado**: `server.js:284 inferAccountType()` ya usa el catálogo `bcatcdv` para distinguir `AHORRO_VISTA` de `CERTIFICADO_APORTACION`, y ese mismo catálogo es la FK real `dpvi_cod_tcdv` de `bcadpvi`. Cadena de tablas confirmada: `bcadpvi` (maestro cuenta) → `bcatcdv` (tipo, ya usado en código) / `bcaeacd` (estado) / `bcaclie` (titular, vía `dpvi_cod_clie`); `bcamcdv` (movimientos) → `bcadpvi` vía `mcdv_cod_dpvi`. Detalle completo en `INVENTARIO_TABLAS.md` sección 3bis.

---

## 1. Agente Backend — Integración de Base de Datos

### 1.1 Ahorros — introspección completada (2026-07-13)

Se ejecutó la introspección real contra Informix. Resultado: `bcadivc` **no era** la tabla de ahorros (es dividendos/cuotas de crédito, ver corrección en `INVENTARIO_TABLAS.md` sección 3bis). La tabla maestra real confirmada es `bcadpvi`, con columnas y muestra de datos ya documentadas ahí mismo. Este paso ya no bloquea el trabajo de staging/MERGE.

### 1.2 Ahorros — DDL real (columnas confirmadas contra `bcadpvi`)

`db/sqlserver/23_integracion_ahorros_bcadpvi.sql` — mismo esqueleto que `04_integracion_clientes_informix.sql`:

```sql
SET ANSI_NULLS ON; GO
SET QUOTED_IDENTIFIER ON; GO
USE SQLGUTPATATE; GO

IF OBJECT_ID('dbo.AhorrosInformix', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AhorrosInformix (
        AhorroInformixId    BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        OrigenSistema        NVARCHAR(30) NOT NULL,
        OrigenCuentaId       INT NOT NULL,             -- dpvi_cod_dpvi
        OrigenClienteId      INT NULL,                 -- dpvi_cod_clie -> ClientesInformix.OrigenClienteId
        NumeroCuenta         NVARCHAR(20) NULL,         -- dpvi_num_dpvi
        NombreTitular        NVARCHAR(120) NULL,        -- dpvi_nom_dpvi (redundante con Clientes, útil para auditoría)
        CodigoTipoCuenta     INT NULL,                  -- dpvi_cod_tcdv -> bcatcdv (ya usado en server.js inferAccountType)
        CodigoEstado         INT NULL,                  -- dpvi_cod_eacd -> bcaeacd (1 ACTIVA / 2 INACTIVA / 3 CANCELADA / 4 CERRADA / 5 ANULADA)
        SaldoDisponible      DECIMAL(15,2) NULL,         -- dpvi_sal_disp
        SaldoContable        DECIMAL(15,2) NULL,         -- dpvi_sal_cont
        AhorroMinimo         DECIMAL(15,2) NULL,         -- dpvi_aho_mini
        Tasa                 DECIMAL(6,2) NULL,          -- dpvi_tas_dpvi (nula en cuentas vista; validar en certificados)
        FechaApertura        DATE NULL,                  -- dpvi_fec_inic
        FechaVencimiento     DATE NULL,                  -- dpvi_fec_venc (null en cuentas a la vista)
        FechaUltimoMovimiento DATETIME2(0) NULL,          -- dpvi_fec_umcd
        CodigoOficina        INT NULL,                   -- dpvi_cod_ofic
        FechaCreacion        DATETIME2(0) NOT NULL CONSTRAINT DF_AhorrosInformix_FechaCreacion DEFAULT(SYSDATETIME()),
        FechaActualizacion   DATETIME2(0) NOT NULL CONSTRAINT DF_AhorrosInformix_FechaActualizacion DEFAULT(SYSDATETIME())
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_AhorrosInformix_Origen' AND object_id = OBJECT_ID('dbo.AhorrosInformix'))
    CREATE UNIQUE INDEX UX_AhorrosInformix_Origen ON dbo.AhorrosInformix(OrigenSistema, OrigenCuentaId);
GO

-- dbo.Stg_Ahorros_Informix (columnas legacy crudas, ver plantilla de clientes) + FechaCarga
-- CREATE OR ALTER PROCEDURE dbo.usp_MergeAhorrosDesdeInformix ... (mismo patrón NULLIF/LTRIM/RTRIM)
-- CREATE OR ALTER VIEW dbo.vw_AhorrosInformixParaApp AS SELECT ... FROM dbo.AhorrosInformix
```

### 1.3 Créditos — llevar del "fallback en vivo" al patrón staging + MERGE

El esquema real ya está documentado (`INVENTARIO_TABLAS.md` sección 2). Con eso ya se puede construir `db/sqlserver/24_integracion_creditos_bcacred.sql` siguiendo el mismo patrón exacto de clientes:

```sql
IF OBJECT_ID('dbo.CreditosInformix', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CreditosInformix (
        CreditoInformixId  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        OrigenSistema      NVARCHAR(30) NOT NULL,
        OrigenCreditoId    INT NOT NULL,             -- cred_num_cred
        OrigenClienteId    INT NULL,                 -- cred_cod_clie
        Identificacion     NVARCHAR(13) NULL,        -- cred_ide_titu
        NombreTitular      NVARCHAR(120) NULL,       -- cred_nom_titu
        Capital            DECIMAL(15,2) NOT NULL,   -- cred_cap_cred
        Tasa               DECIMAL(6,2) NULL,        -- cred_tas_cred
        FechaInicio        DATE NULL,                -- cred_fec_inic
        FechaVencimiento   DATE NULL,                -- cred_fec_venc
        NumeroCuotas       INT NULL,                 -- cred_num_cuot
        CodigoEstado       INT NULL,                 -- cred_cod_ecre (catálogo sin resolver, ver 1.4)
        CodigoTipoCredito  INT NULL,                 -- cred_cod_tcre (bcatcre)
        PorcentajeMora     DECIMAL(6,2) NULL,         -- cred_por_mora
        DiasMora           SMALLINT NULL,             -- cred_con_mora
        FechaCreacion      DATETIME2(0) NOT NULL CONSTRAINT DF_CreditosInformix_FechaCreacion DEFAULT(SYSDATETIME()),
        FechaActualizacion DATETIME2(0) NOT NULL CONSTRAINT DF_CreditosInformix_FechaActualizacion DEFAULT(SYSDATETIME())
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_CreditosInformix_Origen' AND object_id = OBJECT_ID('dbo.CreditosInformix'))
    CREATE UNIQUE INDEX UX_CreditosInformix_Origen ON dbo.CreditosInformix(OrigenSistema, OrigenCreditoId);
GO
```

Mantener `buscarCreditosInformix()` (`server.js:188`) **solo como fallback**, exactamente como ya se hace con `buscarClienteInformix()`: se consulta primero `dbo.vw_CreditosInformixParaApp`, y únicamente si no hay fila se cae al bridge en vivo.

### 1.4 Catálogo pendiente: `cred_cod_ecre`

El estado del crédito (`cred_cod_ecre`) no matcheó ninguna tabla candidata en la introspección original (ver `INVENTARIO_TABLAS.md` línea 161-163). Antes de exponerlo como estado legible en la vista de consumo, correr introspección dirigida contra candidatas genéricas de estado (`bcaesol`, `bcaeope`, etc.) — tarea explícita para el Analista de BD (sección 7).

---

## 2. Agente Frontend

- **Regla dura ya documentada**: ni `App.tsx` (GUTT_SYSTEM) ni el cliente móvil (GUTT_SYSTEM_MOVIL) deben hablar con Informix directo — todo pasa por `/api/*`.
- Nuevos endpoints a consumir una vez exista 1.2/1.3: `GET /api/socios/ahorros?identificacion=` y `GET /api/socios/creditos-legado?identificacion=`, que resuelven primero contra las vistas SQL Server y caen a `buscarXInformix()` solo si no hay fila.
- Añadir un indicador visual sutil (badge "Dato migrado" vs. "Dato en línea legado") en las tarjetas que ya existen (la tarjeta de "Cuenta de Ahorros" en `App.tsx` del móvil, la lista de créditos con `loan.origen`). Esto le da a QA y Curaduría de Datos visibilidad de qué falta migrar sin tocar código.
- Reutilizar lo que ya existe en vez de crear paralelos: `isLoading` para los nuevos fetchs, `showAlert()` para errores/éxito — no introducir un segundo sistema de notificaciones.

---

## 3. Diseñador Web (UI/UX)

Paleta ya en producción (extraída de código real, no propuesta nueva):

| Uso | Color |
|---|---|
| Primario institucional | `#005930` |
| Acento / dorado | `#d4af37` |
| Éxito | `#10b981` / fondo `#ecfdf5` |
| Error | `#ef4444` / fondo `#fef2f2` |
| Advertencia | `#d97706` / fondo `#fffbeb` |
| Texto fuerte | `#1e293b` |
| Texto secundario | `#64748b` / `#94a3b8` |
| Bordes / fondos neutros | `#e2e8f0` / `#f8fafc` |

- Ya existen variables CSS parciales (`var(--primary)`, `var(--success)`, `var(--accent)`) y clases de animación (`animate-fade-in`, `animate-scale-up`). Recomendación: consolidarlas en un único archivo de tokens (p. ej. `src/theme.ts` o `:root` en `App.css`) compartido entre GUTT_SYSTEM y GUTT_SYSTEM_MOVIL, en vez de mantener los valores duplicados como literales inline en cada componente.
- Extender `animate-fade-in` a las nuevas tarjetas de ahorro/crédito legado para mantener consistencia con el resto del dashboard.
- Los badges de estado (`SOLICITADO`/`VIGENTE`/`RECHAZADO`) ya combinan color + texto, nunca solo color — mantener ese estándar de accesibilidad en los nuevos indicadores de origen de dato.

---

## 4. Agente de Seguridad

Extender `security_audit_plan.md` (ya cubre bypass de rol, inyección de avalúo negativo y secuestro de sesión) con vectores específicos de esta integración:

- **Vector 4 — Confusión de origen de datos**: si el fallback en vivo no filtra estrictamente por identificación exacta, un socio ya migrado a SQL Server podría, en teoría, recibir además filas legado de una cédula distinta con coincidencia parcial (`LIKE %...%` ya se usa en `buscarClienteInformix`/`buscarCreditosInformix`). Mitigación: el fallback solo debe activarse cuando **no exista fila** en la vista SQL Server correspondiente; nunca combinar resultados de ambos orígenes en la misma respuesta. Loguear cada activación de fallback para poder auditar cobertura real de migración.
- **Vector 5 — Credenciales en texto plano**: `api/.env` contiene `SQL_SERVER_PASSWORD` e `INFORMIX_PASSWORD` en texto plano. Confirmar que `api/.env` está excluido en `.gitignore` y que nunca se subió a git; si se subió, rotar credenciales. Para producción, mover a un vault/gestor de secretos.
- **Vector 6 — Integridad referencial cross-motor**: `(OrigenSistema, OrigenXId)` es una llave de negocio, no un FK real (no puede haber FK entre SQL Server e Informix). Cada MERGE debe validar ausencia de duplicados por esa llave — ya está listado como "validación mínima" en `MIGRACION_INFORMIX_SQLSERVER.md`; formalizarlo como assertion automatizada en la suite de QA (sección 5).

---

## 5. Agente de Integración y QA

Seguir la convención de nombres ya establecida (`test-*.js` en la raíz + scripts `npm run test:*`).

Nuevos scripts propuestos:
- `test-migracion-ahorros.js` — conteo Informix vs. staging vs. destino; cero duplicados por `(OrigenSistema, OrigenCuentaId)`.
- `test-migracion-creditos.js` — igual para créditos; valida que ningún registro migrado quede con `CodigoEstado` sin homologar.
- Extender `test-connectivity.js` (ya existe) para hacer ping a las dos vistas nuevas.

Checklist de validación (replicar el que ya define `MIGRACION_INFORMIX_SQLSERVER.md` para clientes):
1. Conteo origen (Informix) vs. staging.
2. Conteo staging vs. destino tras el MERGE.
3. Duplicados por llave de origen.
4. Filas huérfanas (ahorro/crédito sin cliente correspondiente en `ClientesInformix` ni `RegistroSocios`).
5. Catálogos sin homologar (ej. `cred_cod_ecre`).

---

## 6. Curador de Base de Datos

Reglas ya en uso en el código — reutilizar, no reinventar:
- Todo `CHAR`/`VARCHAR` legado se limpia con `NULLIF(LTRIM(RTRIM(x)), '')` (Informix rellena con espacios fijos).
- Fechas normalizadas a `DATETIME2(0)` / `DATE` según corresponda.

Para Ahorros y Créditos, definir explícitamente:
- Identificación (cédula/RUC) siempre `TRIM` + validar longitud (10 cédula / 13 RUC) antes de usarla como llave de cruce con `ClientesInformix`/`RegistroSocios`.
- Montos en `DECIMAL(15,2)`; valores negativos en capital no deben descartarse en silencio — deben **loguearse** (mismo principio que el Vector 2 de seguridad ya mitigado en la API, aplicado ahora también a los datos migrados).
- Documentar en `INVENTARIO_TABLAS.md` cada catálogo sin resolver (como `cred_cod_ecre`) en vez de dejarlo como "código crudo" indefinidamente en la vista de consumo.

---

## 7. Analista de Base de Datos (procedures y APIs)

- Vistas de consumo (mismo patrón `vw_*InformixParaApp`): `dbo.vw_AhorrosInformixParaApp`, `dbo.vw_CreditosInformixParaApp`.
- Procedures sugeridos, expuestos vía `server.js`:
  - `dbo.usp_ObtenerAhorrosPorIdentificacion(@Identificacion)`
  - `dbo.usp_ObtenerCreditosPorIdentificacion(@Identificacion)`
  - Ambos consultan **solo SQL Server** — el fallback en vivo a Informix vive en Node (`server.js`), no dentro del procedure, para no acoplar el motor SQL al bridge PowerShell/ODBC.
- KPIs sugeridos (alineados a `compliance_ecuador.md` / plan de cuentas SEPS ya documentado):
  - % de cartera migrada vs. aún resuelta por fallback en vivo (mide avance real de la integración, no solo cobertura teórica).
  - Mora por tramo de días (`cred_con_mora`) segmentado por línea de crédito (`bcalcre`).
  - Saldo total en ahorros a la vista vs. certificados de aportación (ya factible: `dpvi_cod_tcdv` distingue ambos tipos en `bcadpvi`).

---

## 📌 Entregables — estado real vs. pendiente

| # | Entregable | Estado |
|---|---|---|
| 1 | Scripts de conexión y migración Informix → SQL Server | Clientes ✅ hecho · Créditos 🟡 diseño listo en este doc, falta ejecutar · Ahorros 🟡 esquema real confirmado (`bcadpvi`, sección 1.2), falta ejecutar staging/MERGE |
| 2 | Interfaz funcional con datos sincronizados | 🔴 pendiente de los endpoints nuevos (sección 2) |
| 3 | Guía de estilos visuales aplicada | 🟡 paleta ya existe en producción, falta consolidarla en un archivo de tokens compartido |
| 4 | Plan de seguridad y auditoría | ✅ base existente (`security_audit_plan.md`) · 🟡 extender con Vectores 4-6 de este documento |
| 5 | Reporte de pruebas de integración y QA | 🔴 nuevo, scripts propuestos en sección 5 |
| 6 | Documentación de curación de datos y estándares | 🟡 reglas ya aplicadas en código, falta consolidarlas en un documento único de estándares |
| 7 | Procedures y APIs listos para consumo | 🟡 patrón ya probado en clientes, faltan los de ahorros/créditos (sección 7) |
| — | Módulo Agente Engrams (memoria persistente `dbo.AgenteEngrams`) | ✅ Verificado end-to-end el 2026-07-13: tabla, migración, endpoints `GET/POST /api/engrams` y `test-engrams.js` — 100% de las pruebas pasaron. No forma parte del alcance clientes/ahorros/créditos pero se confirmó operativo durante este ciclo de trabajo. |

## Próximo paso inmediato

1. **Ejecutar** `db/sqlserver/23_integracion_ahorros_bcadpvi.sql` (staging `Stg_Ahorros_Informix` + `usp_MergeAhorrosDesdeInformix` + `vw_AhorrosInformixParaApp`, siguiendo el DDL de la sección 1.2) y `db/sqlserver/24_integracion_creditos_bcacred.sql` (sección 1.3) contra `SQLGUTPATATE`, vía `migrate-db.js`.
2. Resolver el catálogo pendiente `cred_cod_ecre` (sección 1.4) antes de exponer el estado del crédito legado en la vista de consumo.
3. Confirmar si `dpvi_tas_dpvi` se llena para certificados de aportación (pendiente anotado en `INVENTARIO_TABLAS.md` sección 3bis) antes de mapear la tasa de ahorros en el MERGE.
