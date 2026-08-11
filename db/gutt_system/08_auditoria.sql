-- 08_auditoria.sql
-- Base: GUTT_SYSTEM
-- El patrón de AuditoriaProcesos en SQLGUTPATATE ya es sólido (una tabla física,
-- ocho procesos como discriminador, vistas por módulo) — se conserva íntegro.
-- Único cambio: CooperativaId, para poder filtrar auditoría por cliente.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF OBJECT_ID('dbo.AuditoriaProcesos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaProcesos (
        AuditoriaId     BIGINT IDENTITY(1,1) PRIMARY KEY,
        CooperativaId   INT NOT NULL CONSTRAINT FK_AuditoriaProcesos_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        Proceso         NVARCHAR(50)  NOT NULL,   -- 'CREDITOS','CAJA','AHORROS','PLAZO_FIJO','CONTABILIDAD','SOCIOS','SEGURIDAD','REPORTES_SEPS'
        Accion          NVARCHAR(50)  NOT NULL,
        EntidadTipo     NVARCHAR(50)  NOT NULL,
        EntidadId       NVARCHAR(50)  NULL,
        UsuarioId       NVARCHAR(20)  NOT NULL,
        CampoAfectado   NVARCHAR(100) NULL,
        ValorAnterior   NVARCHAR(MAX) NULL,
        ValorNuevo      NVARCHAR(MAX) NULL,
        Detalle         NVARCHAR(500) NULL,
        IPOrigen        NVARCHAR(45)  NULL,
        FechaRegistro   DATETIME2(0)  NOT NULL CONSTRAINT DF_AuditoriaProcesos_FechaRegistro DEFAULT(SYSDATETIME())
    );
    PRINT 'Tabla dbo.AuditoriaProcesos creada.';
END
ELSE
    PRINT 'Tabla dbo.AuditoriaProcesos ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaProcesos_Proceso_Fecha' AND object_id = OBJECT_ID('dbo.AuditoriaProcesos'))
    CREATE INDEX IX_AuditoriaProcesos_Proceso_Fecha ON dbo.AuditoriaProcesos(Proceso, FechaRegistro DESC);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaProcesos_Entidad' AND object_id = OBJECT_ID('dbo.AuditoriaProcesos'))
    CREATE INDEX IX_AuditoriaProcesos_Entidad ON dbo.AuditoriaProcesos(EntidadTipo, EntidadId);
GO

CREATE OR ALTER VIEW dbo.vw_AuditoriaCreditos AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'CREDITOS';
GO
CREATE OR ALTER VIEW dbo.vw_AuditoriaCaja AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'CAJA';
GO
CREATE OR ALTER VIEW dbo.vw_AuditoriaAhorros AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'AHORROS';
GO
CREATE OR ALTER VIEW dbo.vw_AuditoriaPlazoFijo AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'PLAZO_FIJO';
GO
CREATE OR ALTER VIEW dbo.vw_AuditoriaContabilidad AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'CONTABILIDAD';
GO
CREATE OR ALTER VIEW dbo.vw_AuditoriaSocios AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'SOCIOS';
GO
CREATE OR ALTER VIEW dbo.vw_AuditoriaSeguridad AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'SEGURIDAD';
GO
CREATE OR ALTER VIEW dbo.vw_AuditoriaReportesSeps AS
    SELECT * FROM dbo.AuditoriaProcesos WHERE Proceso = 'REPORTES_SEPS';
GO

IF OBJECT_ID('dbo.AuditoriaUsuarios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaUsuarios (
        AuditoriaId INT IDENTITY(1,1) PRIMARY KEY,
        UsuarioId NVARCHAR(20) NOT NULL,
        Concepto NVARCHAR(100) NOT NULL,
        Detalle NVARCHAR(500) NOT NULL,
        FechaRegistro DATETIME2(0) NOT NULL CONSTRAINT DF_AuditoriaUsuarios_FechaRegistro DEFAULT(SYSDATETIME())
    );
    PRINT 'Tabla dbo.AuditoriaUsuarios creada.';
END
ELSE
    PRINT 'Tabla dbo.AuditoriaUsuarios ya existe.';
GO

PRINT '=== 08_auditoria.sql completado. ===';
GO
