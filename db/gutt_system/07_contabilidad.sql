-- 07_contabilidad.sql
-- Base: GUTT_SYSTEM
-- El rediseño de más peso de todo el modelo. RegistroContable en SQLGUTPATATE es
-- una tabla plana (un Debe y un Haber por fila, sin período, sin catálogo de
-- cuentas real, y sin ningún endpoint que la escriba desde la UI). Se reemplaza
-- por el patrón cabecera+detalle verificado contra el legacy AFC (bcacomp/bcadcom),
-- donde se confirmó partida doble real y cuadrada sobre datos reales:
-- SUM(debe) = SUM(haber) = $25,958,493.36 sobre 13,073 líneas.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

-- Plan de cuentas — antes CuentaContable era texto libre en RegistroContable,
-- sin catálogo detrás. Inspirado en bcaccco (ccco_cod_ctas = id interno,
-- ccco_cod_ccon = código real del Catálogo Único de Cuentas SEPS).
IF OBJECT_ID('dbo.PlanCuentas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PlanCuentas (
        CuentaContableId  INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CooperativaId     INT NOT NULL CONSTRAINT FK_PlanCuentas_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        Codigo            NVARCHAR(15) NOT NULL,
        Nombre            NVARCHAR(150) NOT NULL,
        TipoCuenta        NVARCHAR(20) NOT NULL,
        CuentaPadreId     INT NULL CONSTRAINT FK_PlanCuentas_Padre FOREIGN KEY REFERENCES dbo.PlanCuentas(CuentaContableId),
        Moneda            NVARCHAR(3) NOT NULL CONSTRAINT DF_PlanCuentas_Moneda DEFAULT('USD'),
        Activa            BIT NOT NULL CONSTRAINT DF_PlanCuentas_Activa DEFAULT(1),
        CONSTRAINT CK_PlanCuentas_Tipo CHECK (TipoCuenta IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO')),
        CONSTRAINT UQ_PlanCuentas_Cooperativa_Codigo UNIQUE (CooperativaId, Codigo)
    );
    PRINT 'Tabla dbo.PlanCuentas creada.';
END
ELSE
    PRINT 'Tabla dbo.PlanCuentas ya existe.';
GO

-- Períodos contables — inspirado en bcaperi. Permite cerrar un mes y bloquear
-- nuevos asientos sobre él, igual que hace el legacy.
IF OBJECT_ID('dbo.PeriodosContables', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PeriodosContables (
        PeriodoId       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CooperativaId   INT NOT NULL CONSTRAINT FK_PeriodosContables_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        Anio            INT NOT NULL,
        Mes             INT NOT NULL,
        Cerrado         BIT NOT NULL CONSTRAINT DF_PeriodosContables_Cerrado DEFAULT(0),
        CONSTRAINT UQ_PeriodosContables_Cooperativa_Anio_Mes UNIQUE (CooperativaId, Anio, Mes),
        CONSTRAINT CK_PeriodosContables_Mes CHECK (Mes BETWEEN 1 AND 12)
    );
    PRINT 'Tabla dbo.PeriodosContables creada.';
END
ELSE
    PRINT 'Tabla dbo.PeriodosContables ya existe.';
GO

-- Cabecera del asiento — inspirada en bcacomp.
IF OBJECT_ID('dbo.AsientosContables', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AsientosContables (
        AsientoId          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CooperativaId      INT NOT NULL CONSTRAINT FK_AsientosContables_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        PeriodoContableId  INT NOT NULL CONSTRAINT FK_AsientosContables_Periodo FOREIGN KEY REFERENCES dbo.PeriodosContables(PeriodoId),
        Fecha              DATETIME2(0) NOT NULL CONSTRAINT DF_AsientosContables_Fecha DEFAULT(SYSDATETIME()),
        TipoDocumento      NVARCHAR(30) NULL,
        Concepto           NVARCHAR(300) NOT NULL,
        Anulado            BIT NOT NULL CONSTRAINT DF_AsientosContables_Anulado DEFAULT(0),
        UsuarioId          NVARCHAR(20) NOT NULL CONSTRAINT FK_AsientosContables_Usuario FOREIGN KEY REFERENCES dbo.Usuarios(UsuarioId),
        -- Referencia polimórfica de vuelta al registro que originó el asiento
        -- (un crédito o un DPF pueden generar varios asientos a lo largo de su vida:
        -- desembolso/pago, apertura/liquidación/renovación — igual que resolvía
        -- AsientosContablesDPF antes, pero ahora en un solo libro diario).
        OrigenModulo       NVARCHAR(20) NULL,
        OrigenId           NVARCHAR(50) NULL,
        -- 'TRANSFERENCIAS' agregado 2026-08-11: server.js tiene un endpoint activo,
        -- POST /api/socios/transferir, que hoy escribe en dbo.RegistroContable y
        -- necesita este origen al migrar — sin él, la migración histórica de esos
        -- asientos (y cualquier asiento nuevo de transferencias) viola este CHECK.
        CONSTRAINT CK_AsientosContables_OrigenModulo CHECK (OrigenModulo IN ('CREDITOS','CAJA','PLAZO_FIJO','TRANSFERENCIAS','MANUAL') OR OrigenModulo IS NULL)
    );
    PRINT 'Tabla dbo.AsientosContables creada.';
END
ELSE
    PRINT 'Tabla dbo.AsientosContables ya existe.';
GO

-- Detalle Debe/Haber — inspirado en bcadcom, misma convención D/H (dcom_cod_tasi)
-- y mismo CHECK de valor positivo (ckt_bcadcom).
IF OBJECT_ID('dbo.DetalleAsiento', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DetalleAsiento (
        DetalleId          BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AsientoId          INT NOT NULL CONSTRAINT FK_DetalleAsiento_Asiento FOREIGN KEY REFERENCES dbo.AsientosContables(AsientoId) ON DELETE CASCADE,
        CuentaContableId   INT NOT NULL CONSTRAINT FK_DetalleAsiento_Cuenta FOREIGN KEY REFERENCES dbo.PlanCuentas(CuentaContableId),
        TipoAsiento        CHAR(1) NOT NULL,
        Valor              DECIMAL(15,2) NOT NULL,
        -- Agregado 2026-08-11: dbo.RegistroContable (producción, SQLGUTPATATE) exige
        -- SocioId en CADA fila hoy; ese dato se pierde si no se preserva en algún lado
        -- del modelo nuevo, que originalmente no tenía ninguna dimensión de socio. Va
        -- en el DETALLE, no en la cabecera, porque un mismo asiento puede tocar a dos
        -- socios distintos (ej. transferencia entre socios: una línea débito de un
        -- socio, una línea crédito de otro) — la cabecera no podría representar eso
        -- con una sola columna. NULL es válido para asientos institucionales (banco,
        -- proveedor) que no corresponden a ningún socio.
        SocioId            BIGINT NULL CONSTRAINT FK_DetalleAsiento_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId),
        CONSTRAINT CK_DetalleAsiento_TipoAsiento CHECK (TipoAsiento IN ('D','H')),
        CONSTRAINT CK_DetalleAsiento_Valor CHECK (Valor > 0)
    );
    PRINT 'Tabla dbo.DetalleAsiento creada.';
END
ELSE
    PRINT 'Tabla dbo.DetalleAsiento ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AsientosContables_Periodo' AND object_id = OBJECT_ID('dbo.AsientosContables'))
    CREATE INDEX IX_AsientosContables_Periodo ON dbo.AsientosContables(PeriodoContableId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AsientosContables_Origen' AND object_id = OBJECT_ID('dbo.AsientosContables'))
    CREATE INDEX IX_AsientosContables_Origen ON dbo.AsientosContables(OrigenModulo, OrigenId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DetalleAsiento_Asiento' AND object_id = OBJECT_ID('dbo.DetalleAsiento'))
    CREATE INDEX IX_DetalleAsiento_Asiento ON dbo.DetalleAsiento(AsientoId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DetalleAsiento_Cuenta' AND object_id = OBJECT_ID('dbo.DetalleAsiento'))
    CREATE INDEX IX_DetalleAsiento_Cuenta ON dbo.DetalleAsiento(CuentaContableId);
GO
-- Soporta "estado de cuenta contable del socio" (equivalente a filtrar RegistroContable
-- por SocioId, que hoy es directo porque esa tabla exige SocioId en cada fila).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DetalleAsiento_Socio' AND object_id = OBJECT_ID('dbo.DetalleAsiento'))
    CREATE INDEX IX_DetalleAsiento_Socio ON dbo.DetalleAsiento(SocioId) WHERE SocioId IS NOT NULL;
GO

PRINT '=== 07_contabilidad.sql completado. ===';
GO
