-- 04_creditos.sql
-- Base: GUTT_SYSTEM
-- SolicitudesCredito nunca tuvo CREATE TABLE en SQLGUTPATATE (solo ALTER en
-- 17_gestion_creditos_seps.sql) — columnas reconstruidas verificando cada uso
-- real en server.js. Creditos/TablaAmortizacion/RubrosCreditos se conservan.
-- CalificacionCartera es nueva, inspirada en bcacalf del legacy (hueco SEPS real).
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF OBJECT_ID('dbo.SolicitudesCredito', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SolicitudesCredito (
        SolicitudID               NVARCHAR(50) NOT NULL PRIMARY KEY,
        CooperativaId             INT NOT NULL CONSTRAINT FK_SolicitudesCredito_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        SocioID                   BIGINT NOT NULL CONSTRAINT FK_SolicitudesCredito_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId),
        Identificacion            NVARCHAR(20) NOT NULL,
        Monto                     DECIMAL(15,2) NOT NULL,
        Saldo                     DECIMAL(15,2) NOT NULL,
        Tasa                      DECIMAL(5,2) NOT NULL,
        Plazo                     INT NOT NULL,
        Tipo                      NVARCHAR(100) NOT NULL,
        Estado                    NVARCHAR(30) NOT NULL CONSTRAINT DF_SolicitudesCredito_Estado DEFAULT('SOLICITADO'),
        FechaSolicitud            DATETIME2(0) NOT NULL CONSTRAINT DF_SolicitudesCredito_FechaSolicitud DEFAULT(SYSDATETIME()),
        FechaVencimiento          NVARCHAR(50) NULL,
        Observaciones             NVARCHAR(500) NULL,
        PlanPagos                 NVARCHAR(MAX) NULL,
        GarantiaInfo              NVARCHAR(MAX) NULL,
        Origen                    NVARCHAR(50) NULL,
        TipoPrenda                NVARCHAR(100) NULL,
        AvaluoPrendario           DECIMAL(15,2) NULL,
        ObservacionTecnicaPrenda  NVARCHAR(500) NULL,
        ValorCobertura            DECIMAL(10,2) NULL,
        TipoAprobacion            NVARCHAR(50) NULL,
        ActaSesion                NVARCHAR(100) NULL,
        ScoringScore              INT NULL,
        DescuentosDesembolso      NVARCHAR(MAX) NULL
    );
    PRINT 'Tabla dbo.SolicitudesCredito creada.';
END
ELSE
    PRINT 'Tabla dbo.SolicitudesCredito ya existe.';
GO

IF OBJECT_ID('dbo.Creditos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Creditos (
        CreditoID                  NVARCHAR(50) NOT NULL PRIMARY KEY,
        CooperativaId              INT NOT NULL CONSTRAINT FK_Creditos_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        SolicitudID                NVARCHAR(50) NOT NULL CONSTRAINT FK_Creditos_SolicitudID FOREIGN KEY REFERENCES dbo.SolicitudesCredito(SolicitudID),
        SocioID                    BIGINT NOT NULL CONSTRAINT FK_Creditos_SocioID FOREIGN KEY REFERENCES dbo.Socios(SocioId),
        Monto                      DECIMAL(15,2) NOT NULL,
        Saldo                      DECIMAL(15,2) NOT NULL,
        Tasa                       DECIMAL(5,2) NOT NULL,
        Plazo                      INT NOT NULL,
        Tipo                       NVARCHAR(100) NOT NULL,
        Estado                     NVARCHAR(30) NOT NULL,
        FechaDesembolso            DATETIME2(0) NOT NULL CONSTRAINT DF_Creditos_FechaDesembolso DEFAULT(SYSDATETIME()),
        FechaVencimiento           NVARCHAR(50) NULL,
        TipoAprobacion             NVARCHAR(50) NULL,
        ActaSesion                 NVARCHAR(100) NULL,
        TipoPrenda                 NVARCHAR(100) NULL,
        AvaluoPrendario            DECIMAL(15,2) NULL,
        ObservacionTecnicaPrenda   NVARCHAR(500) NULL,
        ValorCobertura             DECIMAL(10,2) NULL
    );
    PRINT 'Tabla dbo.Creditos creada.';
END
ELSE
    PRINT 'Tabla dbo.Creditos ya existe.';
GO

IF OBJECT_ID('dbo.TablaAmortizacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TablaAmortizacion (
        AmortizacionID          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CreditoID                NVARCHAR(50) NOT NULL CONSTRAINT FK_TablaAmortizacion_CreditoID FOREIGN KEY REFERENCES dbo.Creditos(CreditoID) ON DELETE CASCADE,
        NumeroCuota              INT NOT NULL,
        FechaPago                NVARCHAR(50) NOT NULL,
        Capital                  DECIMAL(15,2) NOT NULL,
        Interes                  DECIMAL(15,2) NOT NULL,
        -- Ampliación respecto a SQLGUTPATATE: separar interés al plazo vs. devengado/pagado,
        -- mismo criterio que divc_int_plaz / divc_int_deve / divc_int_paga en bcadivc (legacy).
        InteresDevengado         DECIMAL(15,2) NULL,
        InteresPagado            DECIMAL(15,2) NULL,
        SeguroDesgravamen        DECIMAL(15,2) NOT NULL,
        ContribucionSOLCA        DECIMAL(15,2) NOT NULL,
        GastosAdministrativos    DECIMAL(15,2) NOT NULL,
        Total                    DECIMAL(15,2) NOT NULL,
        Estado                   NVARCHAR(20) NOT NULL CONSTRAINT DF_TablaAmortizacion_Estado DEFAULT('PENDIENTE')
    );
    PRINT 'Tabla dbo.TablaAmortizacion creada.';
END
ELSE
    PRINT 'Tabla dbo.TablaAmortizacion ya existe.';
GO

IF OBJECT_ID('dbo.RubrosCreditos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RubrosCreditos (
        RubroID          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AmortizacionID   INT NOT NULL CONSTRAINT FK_RubrosCreditos_AmortizacionID FOREIGN KEY REFERENCES dbo.TablaAmortizacion(AmortizacionID) ON DELETE CASCADE,
        NombreRubro      NVARCHAR(50) NOT NULL,
        Monto            DECIMAL(15,2) NOT NULL,
        Estado           NVARCHAR(20) NOT NULL CONSTRAINT DF_RubrosCreditos_Estado DEFAULT('PENDIENTE')
    );
    PRINT 'Tabla dbo.RubrosCreditos creada.';
END
ELSE
    PRINT 'Tabla dbo.RubrosCreditos ya existe.';
GO

-- Nueva: calificación de cartera y provisiones (hueco SEPS real, ausente en SQLGUTPATATE hoy).
-- Inspirada en bcacalf verificado contra el legacy: calf_por_pcon = % provisión constituida.
IF OBJECT_ID('dbo.CalificacionCartera', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CalificacionCartera (
        CalificacionId       BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CreditoID            NVARCHAR(50) NOT NULL CONSTRAINT FK_CalificacionCartera_CreditoID FOREIGN KEY REFERENCES dbo.Creditos(CreditoID),
        FechaCorte           DATE NOT NULL,
        SaldoCapital         DECIMAL(15,2) NOT NULL,
        DiasMora             INT NOT NULL CONSTRAINT DF_CalificacionCartera_DiasMora DEFAULT(0),
        Categoria            CHAR(2) NOT NULL,
        PorcentajeProvision  DECIMAL(5,2) NOT NULL CONSTRAINT DF_CalificacionCartera_PorcentajeProvision DEFAULT(0),
        ValorProvision       DECIMAL(15,2) NOT NULL CONSTRAINT DF_CalificacionCartera_ValorProvision DEFAULT(0),
        CONSTRAINT CK_CalificacionCartera_Categoria CHECK (Categoria IN ('A1','A2','A3','B1','B2','C1','C2','D','E')),
        CONSTRAINT UQ_CalificacionCartera_Credito_Corte UNIQUE (CreditoID, FechaCorte)
    );
    PRINT 'Tabla dbo.CalificacionCartera creada.';
END
ELSE
    PRINT 'Tabla dbo.CalificacionCartera ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SolicitudesCredito_Socio' AND object_id = OBJECT_ID('dbo.SolicitudesCredito'))
    CREATE INDEX IX_SolicitudesCredito_Socio ON dbo.SolicitudesCredito(SocioID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Creditos_Socio' AND object_id = OBJECT_ID('dbo.Creditos'))
    CREATE INDEX IX_Creditos_Socio ON dbo.Creditos(SocioID);
GO

PRINT '=== 04_creditos.sql completado. ===';
GO
