-- =============================================================================
-- 19_plazo_fijo_seps.sql
-- Módulo: Depósitos a Plazo Fijo (DPF)
-- Normativa: Plan de Cuentas SEPS - Catálogo Único de Cuentas (CUC)
-- Cuentas: 2103 Depósitos a Plazo | 4103 Intereses Causados | 2503 Int. por Pagar
-- Retención: 2% Rendimientos Financieros (Art. 37 LORTI)
-- =============================================================================
USE SQLGUTPATATE;
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TasasPlazoFijo — Configuración de tasas por tramo de plazo
-- ─────────────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.TasasPlazoFijo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TasasPlazoFijo (
        TasaID              INT IDENTITY(1,1) PRIMARY KEY,
        CodigoRango         NVARCHAR(10)    NOT NULL,       -- Código CUC SEPS (210305..210325)
        DescripcionRango    NVARCHAR(60)    NOT NULL,
        DiasDesde           INT             NOT NULL,
        DiasHasta           INT             NOT NULL,       -- 9999 = sin límite superior
        TasaNominalAnual    DECIMAL(5,2)    NOT NULL,
        TasaMaximaBCE       DECIMAL(5,2)    NOT NULL,       -- Tasa referencial techo BCE
        MontoMinimo         DECIMAL(15,2)   NOT NULL CONSTRAINT DF_TasasPF_MontoMin DEFAULT(200.00),
        MontoMaximo         DECIMAL(15,2)   NULL,           -- NULL = sin límite
        CuentaContableDPF   NVARCHAR(10)    NOT NULL,
        PorcentajePenalizacion DECIMAL(5,2) NOT NULL CONSTRAINT DF_TasasPF_Penalizacion DEFAULT(50.00),
        Activo              BIT             NOT NULL CONSTRAINT DF_TasasPF_Activo DEFAULT(1),
        FechaVigencia       DATE            NOT NULL CONSTRAINT DF_TasasPF_Vigencia DEFAULT(CAST(SYSDATETIME() AS DATE)),
        UsuarioConfigID     NVARCHAR(50)    NULL
    );
    PRINT 'Tabla dbo.TasasPlazoFijo creada.';
END
ELSE
    PRINT 'Tabla dbo.TasasPlazoFijo ya existe.';
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Seed inicial de tasas SEPS (tramos del CUC 2103)
--    Tasas pasivas referenciales BCE vigentes 2025-2026
-- ─────────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.TasasPlazoFijo WHERE CodigoRango = '210305')
BEGIN
    INSERT INTO dbo.TasasPlazoFijo
        (CodigoRango, DescripcionRango, DiasDesde, DiasHasta, TasaNominalAnual, TasaMaximaBCE, MontoMinimo, MontoMaximo, CuentaContableDPF, PorcentajePenalizacion)
    VALUES
        ('210305', 'De 1 a 30 días',       1,   30,  3.50,  5.35,  200.00,  NULL, '2.1.03.05', 0.00),
        ('210310', 'De 31 a 90 días',      31,  90,  4.50,  5.35,  200.00,  NULL, '2.1.03.10', 25.00),
        ('210315', 'De 91 a 180 días',     91,  180, 5.50,  5.35,  200.00,  NULL, '2.1.03.15', 50.00),
        ('210320', 'De 181 a 360 días',    181, 360, 6.50,  7.78,  200.00,  NULL, '2.1.03.20', 50.00),
        ('210325', 'De más de 360 días',   361, 9999,7.50,  7.78,  200.00,  NULL, '2.1.03.25', 50.00);
    PRINT 'Tasas iniciales SEPS insertadas.';
END
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DepositosPlazo — Registro maestro de cada DPF
-- ─────────────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.DepositosPlazo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DepositosPlazo (
        DepositoID              NVARCHAR(20)    NOT NULL PRIMARY KEY,   -- DPF-202406-0001
        SOCIOID                 BIGINT          NOT NULL CONSTRAINT FK_DPF_SOCIOID FOREIGN KEY REFERENCES dbo.RegistroSocios(SOCIOID),
        Identificacion          NVARCHAR(20)    NOT NULL,
        NombreSocio             NVARCHAR(200)   NOT NULL,
        NumCertificado          NVARCHAR(20)    NOT NULL,
        TasaID                  INT             NOT NULL CONSTRAINT FK_DPF_TasaID FOREIGN KEY REFERENCES dbo.TasasPlazoFijo(TasaID),
        TasaNominalAnual        DECIMAL(5,2)    NOT NULL,
        PlazosDias              INT             NOT NULL,
        MontoCapital            DECIMAL(15,2)   NOT NULL,
        InteresProyectado       DECIMAL(15,2)   NOT NULL,
        RetencionProyectada     DECIMAL(15,2)   NOT NULL,   -- 2% LORTI
        InteresNetoProyectado   DECIMAL(15,2)   NOT NULL,
        FechaApertura           DATETIME2(0)    NOT NULL CONSTRAINT DF_DPF_Apertura DEFAULT(SYSDATETIME()),
        FechaVencimiento        DATETIME2(0)    NOT NULL,
        Estado                  NVARCHAR(20)    NOT NULL CONSTRAINT DF_DPF_Estado DEFAULT('ACTIVO'),
        -- ACTIVO | VENCIDO | LIQUIDADO | CANCELADO | RENOVADO
        TipoRenovacion          NVARCHAR(20)    NOT NULL CONSTRAINT DF_DPF_Renovacion DEFAULT('NO_RENOVAR'),
        -- NO_RENOVAR | AUTOMATICO | MANUAL
        ModalidadPago           NVARCHAR(20)    NOT NULL CONSTRAINT DF_DPF_Modalidad DEFAULT('AL_VENCIMIENTO'),
        -- AL_VENCIMIENTO | MENSUAL | TRIMESTRAL
        CuentaAhorrosRelacionada NVARCHAR(20)   NULL,       -- NroCuenta del socio para acreditar
        CuentaContableDPF       NVARCHAR(10)    NOT NULL,
        -- Campos de liquidación (se llenan al liquidar/cancelar)
        FechaLiquidacion        DATETIME2(0)    NULL,
        InteresLiquidado        DECIMAL(15,2)   NULL,
        RetencionAplicada       DECIMAL(15,2)   NULL,
        InteresNetoLiquidado    DECIMAL(15,2)   NULL,
        PenalizacionAplicada    DECIMAL(15,2)   NULL,
        MotivosCancelacion      NVARCHAR(400)   NULL,
        -- Renovaciones
        NumeroRenovacion        INT             NOT NULL CONSTRAINT DF_DPF_NumRenovacion DEFAULT(0),
        DepositoOrigenID        NVARCHAR(20)    NULL,       -- FK flexible para renovaciones en cadena
        -- Auditoría
        UsuarioAperturaID       NVARCHAR(50)    NOT NULL,
        UsuarioLiquidacionID    NVARCHAR(50)    NULL,
        Observaciones           NVARCHAR(500)   NULL,
        FechaCreacion           DATETIME2(0)    NOT NULL CONSTRAINT DF_DPF_Creacion DEFAULT(SYSDATETIME()),
        FechaModificacion       DATETIME2(0)    NOT NULL CONSTRAINT DF_DPF_Modificacion DEFAULT(SYSDATETIME()),
        CONSTRAINT CK_DPF_Estado CHECK (Estado IN ('ACTIVO','VENCIDO','LIQUIDADO','CANCELADO','RENOVADO')),
        CONSTRAINT CK_DPF_Renovacion CHECK (TipoRenovacion IN ('NO_RENOVAR','AUTOMATICO','MANUAL')),
        CONSTRAINT CK_DPF_Modalidad CHECK (ModalidadPago IN ('AL_VENCIMIENTO','MENSUAL','TRIMESTRAL'))
    );
    PRINT 'Tabla dbo.DepositosPlazo creada.';
END
ELSE
    PRINT 'Tabla dbo.DepositosPlazo ya existe.';
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AsientosContablesDPF — Par contable de cada operación DPF
-- ─────────────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.AsientosContablesDPF', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AsientosContablesDPF (
        AsientoID       INT IDENTITY(1,1) PRIMARY KEY,
        DepositoID      NVARCHAR(20)    NOT NULL CONSTRAINT FK_AsientosDPF_DepositoID FOREIGN KEY REFERENCES dbo.DepositosPlazo(DepositoID),
        TipoOperacion   NVARCHAR(30)    NOT NULL,   -- APERTURA|LIQUIDACION|CANCELACION_ANTICIPADA|RENOVACION
        CuentaContable  NVARCHAR(15)    NOT NULL,
        NombreCuenta    NVARCHAR(120)   NOT NULL,
        DebeAmount      DECIMAL(15,2)   NOT NULL CONSTRAINT DF_AsientosDPF_Debe DEFAULT(0.00),
        HaberAmount     DECIMAL(15,2)   NOT NULL CONSTRAINT DF_AsientosDPF_Haber DEFAULT(0.00),
        Concepto        NVARCHAR(300)   NOT NULL,
        FechaAsiento    DATETIME2(0)    NOT NULL CONSTRAINT DF_AsientosDPF_Fecha DEFAULT(SYSDATETIME()),
        UsuarioID       NVARCHAR(50)    NOT NULL,
        CONSTRAINT CK_AsientosDPF_TipoOp CHECK (TipoOperacion IN ('APERTURA','LIQUIDACION','CANCELACION_ANTICIPADA','RENOVACION'))
    );
    CREATE INDEX IX_AsientosDPF_DepositoID ON dbo.AsientosContablesDPF(DepositoID);
    CREATE INDEX IX_AsientosDPF_Fecha ON dbo.AsientosContablesDPF(FechaAsiento);
    PRINT 'Tabla dbo.AsientosContablesDPF creada.';
END
ELSE
    PRINT 'Tabla dbo.AsientosContablesDPF ya existe.';
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SecuenciaDPF — Contador para DepositoID auto-generado
-- ─────────────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.SecuenciaDPF', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SecuenciaDPF (
        Anio    INT  NOT NULL,
        Mes     INT  NOT NULL,
        UltimoN INT  NOT NULL CONSTRAINT DF_SecuenciaDPF DEFAULT(0),
        PRIMARY KEY (Anio, Mes)
    );
    PRINT 'Tabla dbo.SecuenciaDPF creada.';
END
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. usp_GenerarIDDepositoPlazo — Procedimiento para generar IDs únicos
-- ─────────────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.usp_GenerarIDDepositoPlazo', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_GenerarIDDepositoPlazo;
GO
CREATE PROCEDURE dbo.usp_GenerarIDDepositoPlazo
    @NuevoID NVARCHAR(20) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Anio INT = YEAR(SYSDATETIME());
    DECLARE @Mes  INT = MONTH(SYSDATETIME());
    DECLARE @N    INT;

    MERGE dbo.SecuenciaDPF AS target
    USING (SELECT @Anio AS A, @Mes AS M) AS source ON (target.Anio = source.A AND target.Mes = source.M)
    WHEN MATCHED THEN UPDATE SET UltimoN = UltimoN + 1
    WHEN NOT MATCHED THEN INSERT (Anio, Mes, UltimoN) VALUES (@Anio, @Mes, 1);

    SELECT @N = UltimoN FROM dbo.SecuenciaDPF WHERE Anio = @Anio AND Mes = @Mes;
    SET @NuevoID = 'DPF-' + CAST(@Anio AS NVARCHAR(4)) + RIGHT('0' + CAST(@Mes AS NVARCHAR(2)), 2) + '-' + RIGHT('000' + CAST(@N AS NVARCHAR(4)), 4);
END
GO
PRINT 'Procedimiento usp_GenerarIDDepositoPlazo creado.';
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Índices de rendimiento
-- ─────────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_SOCIOID')
    CREATE INDEX IX_DepositosPlazo_SOCIOID ON dbo.DepositosPlazo(SOCIOID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_Estado')
    CREATE INDEX IX_DepositosPlazo_Estado ON dbo.DepositosPlazo(Estado);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_FechaVencimiento')
    CREATE INDEX IX_DepositosPlazo_FechaVencimiento ON dbo.DepositosPlazo(FechaVencimiento);
GO

PRINT '=== Migración 19 (Plazos Fijos SEPS) completada exitosamente. ===';
GO
