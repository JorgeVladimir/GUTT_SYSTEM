-- 05_plazo_fijo.sql
-- Base: GUTT_SYSTEM
-- Módulo mejor diseñado de SQLGUTPATATE — se conserva casi íntegro. Único cambio
-- de fondo: AsientosContablesDPF deja de ser tabla propia; sus asientos pasan a
-- vivir en AsientosContables/DetalleAsiento (07_contabilidad.sql) usando
-- OrigenModulo/OrigenId para enlazar cada asiento de vuelta al depósito.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF OBJECT_ID('dbo.TasasPlazoFijo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TasasPlazoFijo (
        TasaID                  INT IDENTITY(1,1) PRIMARY KEY,
        CooperativaId           INT NOT NULL CONSTRAINT FK_TasasPlazoFijo_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        CodigoRango             NVARCHAR(10)    NOT NULL,
        DescripcionRango        NVARCHAR(60)    NOT NULL,
        DiasDesde               INT             NOT NULL,
        DiasHasta               INT             NOT NULL,
        TasaNominalAnual        DECIMAL(5,2)    NOT NULL,
        TasaMaximaBCE           DECIMAL(5,2)    NOT NULL,
        MontoMinimo             DECIMAL(15,2)   NOT NULL CONSTRAINT DF_TasasPF_MontoMin DEFAULT(200.00),
        MontoMaximo             DECIMAL(15,2)   NULL,
        CuentaContableDPF       NVARCHAR(10)    NOT NULL,
        PorcentajePenalizacion  DECIMAL(5,2)    NOT NULL CONSTRAINT DF_TasasPF_Penalizacion DEFAULT(50.00),
        Activo                  BIT             NOT NULL CONSTRAINT DF_TasasPF_Activo DEFAULT(1),
        FechaVigencia           DATE            NOT NULL CONSTRAINT DF_TasasPF_Vigencia DEFAULT(CAST(SYSDATETIME() AS DATE)),
        UsuarioConfigID         NVARCHAR(50)    NULL,
        CONSTRAINT UQ_TasasPlazoFijo_Cooperativa_Rango UNIQUE (CooperativaId, CodigoRango)
    );
    PRINT 'Tabla dbo.TasasPlazoFijo creada.';
END
ELSE
    PRINT 'Tabla dbo.TasasPlazoFijo ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TasasPlazoFijo WHERE CooperativaId = 1 AND CodigoRango = '210305')
BEGIN
    INSERT INTO dbo.TasasPlazoFijo
        (CooperativaId, CodigoRango, DescripcionRango, DiasDesde, DiasHasta, TasaNominalAnual, TasaMaximaBCE, MontoMinimo, MontoMaximo, CuentaContableDPF, PorcentajePenalizacion)
    VALUES
        (1, '210305', 'De 1 a 30 días',       1,   30,  3.50,  5.35,  200.00,  NULL, '2.1.03.05', 0.00),
        (1, '210310', 'De 31 a 90 días',      31,  90,  4.50,  5.35,  200.00,  NULL, '2.1.03.10', 25.00),
        (1, '210315', 'De 91 a 180 días',     91,  180, 5.50,  5.35,  200.00,  NULL, '2.1.03.15', 50.00),
        (1, '210320', 'De 181 a 360 días',    181, 360, 6.50,  7.78,  200.00,  NULL, '2.1.03.20', 50.00),
        (1, '210325', 'De más de 360 días',   361, 9999,7.50,  7.78,  200.00,  NULL, '2.1.03.25', 50.00);
    PRINT 'Tasas iniciales SEPS insertadas para CooperativaId=1.';
END
GO

IF OBJECT_ID('dbo.DepositosPlazo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DepositosPlazo (
        DepositoID                NVARCHAR(20)    NOT NULL PRIMARY KEY,
        CooperativaId             INT             NOT NULL CONSTRAINT FK_DPF_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        SocioID                   BIGINT          NOT NULL CONSTRAINT FK_DPF_SocioID FOREIGN KEY REFERENCES dbo.Socios(SocioId),
        Identificacion            NVARCHAR(20)    NOT NULL,
        NombreSocio               NVARCHAR(200)   NOT NULL,
        NumCertificado            NVARCHAR(20)    NOT NULL,
        TasaID                    INT             NOT NULL CONSTRAINT FK_DPF_TasaID FOREIGN KEY REFERENCES dbo.TasasPlazoFijo(TasaID),
        TasaNominalAnual          DECIMAL(5,2)    NOT NULL,
        PlazosDias                INT             NOT NULL,
        MontoCapital              DECIMAL(15,2)   NOT NULL,
        InteresProyectado         DECIMAL(15,2)   NOT NULL,
        RetencionProyectada       DECIMAL(15,2)   NOT NULL,
        InteresNetoProyectado     DECIMAL(15,2)   NOT NULL,
        FechaApertura             DATETIME2(0)    NOT NULL CONSTRAINT DF_DPF_Apertura DEFAULT(SYSDATETIME()),
        FechaVencimiento          DATETIME2(0)    NOT NULL,
        Estado                    NVARCHAR(20)    NOT NULL CONSTRAINT DF_DPF_Estado DEFAULT('ACTIVO'),
        TipoRenovacion            NVARCHAR(20)    NOT NULL CONSTRAINT DF_DPF_Renovacion DEFAULT('NO_RENOVAR'),
        ModalidadPago             NVARCHAR(20)    NOT NULL CONSTRAINT DF_DPF_Modalidad DEFAULT('AL_VENCIMIENTO'),
        CuentaAhorrosRelacionada  NVARCHAR(20)    NULL,
        CuentaContableDPF         NVARCHAR(10)    NOT NULL,
        FechaLiquidacion          DATETIME2(0)    NULL,
        InteresLiquidado          DECIMAL(15,2)   NULL,
        RetencionAplicada         DECIMAL(15,2)   NULL,
        InteresNetoLiquidado      DECIMAL(15,2)   NULL,
        PenalizacionAplicada      DECIMAL(15,2)   NULL,
        MotivosCancelacion        NVARCHAR(400)   NULL,
        NumeroRenovacion          INT             NOT NULL CONSTRAINT DF_DPF_NumRenovacion DEFAULT(0),
        DepositoOrigenID          NVARCHAR(20)    NULL,
        UsuarioAperturaID         NVARCHAR(50)    NOT NULL,
        UsuarioLiquidacionID      NVARCHAR(50)    NULL,
        Observaciones             NVARCHAR(500)   NULL,
        FechaCreacion             DATETIME2(0)    NOT NULL CONSTRAINT DF_DPF_Creacion DEFAULT(SYSDATETIME()),
        FechaModificacion         DATETIME2(0)    NOT NULL CONSTRAINT DF_DPF_Modificacion DEFAULT(SYSDATETIME()),
        CONSTRAINT CK_DPF_Estado CHECK (Estado IN ('ACTIVO','VENCIDO','LIQUIDADO','CANCELADO','RENOVADO')),
        CONSTRAINT CK_DPF_Renovacion CHECK (TipoRenovacion IN ('NO_RENOVAR','AUTOMATICO','MANUAL')),
        CONSTRAINT CK_DPF_Modalidad CHECK (ModalidadPago IN ('AL_VENCIMIENTO','MENSUAL','TRIMESTRAL'))
    );
    PRINT 'Tabla dbo.DepositosPlazo creada.';
END
ELSE
    PRINT 'Tabla dbo.DepositosPlazo ya existe.';
GO

IF OBJECT_ID('dbo.SecuenciaDPF', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SecuenciaDPF (
        Anio     INT NOT NULL,
        Mes      INT NOT NULL,
        UltimoN  INT NOT NULL CONSTRAINT DF_SecuenciaDPF DEFAULT(0),
        PRIMARY KEY (Anio, Mes)
    );
    PRINT 'Tabla dbo.SecuenciaDPF creada.';
END
ELSE
    PRINT 'Tabla dbo.SecuenciaDPF ya existe.';
GO

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

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_SOCIOID' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_SOCIOID ON dbo.DepositosPlazo(SocioID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_Estado' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_Estado ON dbo.DepositosPlazo(Estado);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DepositosPlazo_FechaVencimiento' AND object_id = OBJECT_ID('dbo.DepositosPlazo'))
    CREATE INDEX IX_DepositosPlazo_FechaVencimiento ON dbo.DepositosPlazo(FechaVencimiento);
GO

PRINT '=== 05_plazo_fijo.sql completado. ===';
GO
