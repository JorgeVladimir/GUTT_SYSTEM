-- Migration Script: auditoría estructurada por proceso (créditos, caja, ahorros, DPF, contabilidad, socios, seguridad).
--
-- dbo.AuditoriaUsuarios (creada en 07_auditoria_y_registro_socios_update.sql) es un log plano de
-- texto libre (Concepto/Detalle) por usuario; sirve como bitácora de eventos pero no captura qué
-- campo cambió ni el valor anterior/nuevo de una entidad. dbo.AuditoriaProcesos la complementa
-- (no la reemplaza) con un modelo estructurado inspirado en el audit trail nativo de Informix
-- (track_01/02/03: sesión -> sentencia -> valor de columna), adaptado a una sola tabla genérica
-- con un discriminador de Proceso, en vez de una tabla física por módulo -- mismo criterio que
-- usa el propio legacy Informix (3 tablas track_* para todos los módulos, no una por tabla de negocio).
--
-- Cada "tabla de auditoría por proceso" pedida se expone como una VIEW filtrada sobre esta tabla
-- física única: más fácil de mantener, indexar y consultar que 8 tablas físicas casi idénticas.
USE SQLGUTPATATE;
GO

IF OBJECT_ID('dbo.AuditoriaProcesos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaProcesos (
        AuditoriaId     BIGINT IDENTITY(1,1) PRIMARY KEY,
        Proceso         NVARCHAR(50)  NOT NULL,   -- 'CREDITOS','CAJA','AHORROS','PLAZO_FIJO','CONTABILIDAD','SOCIOS','SEGURIDAD','REPORTES_SEPS'
        Accion          NVARCHAR(50)  NOT NULL,   -- 'CREAR','APROBAR','RECHAZAR','DESEMBOLSAR','DEPOSITO','RETIRO','ANULAR','MODIFICAR','ELIMINAR','LOGIN','CAMBIO_ROL', etc.
        EntidadTipo     NVARCHAR(50)  NOT NULL,   -- 'SolicitudCredito','TransaccionCaja','CuentaAhorro','DepositoPlazoFijo','AsientoContable','RegistroSocio','Usuario', etc.
        EntidadId       NVARCHAR(50)  NULL,       -- PK de la entidad afectada (texto para admitir int, código legacy Informix, etc.)
        UsuarioId       NVARCHAR(20)  NOT NULL,   -- quién ejecutó la acción
        CampoAfectado   NVARCHAR(100) NULL,       -- columna específica cuando la acción es un cambio de campo (NULL si es un evento)
        ValorAnterior   NVARCHAR(MAX) NULL,
        ValorNuevo      NVARCHAR(MAX) NULL,
        Detalle         NVARCHAR(500) NULL,
        IPOrigen        NVARCHAR(45)  NULL,
        FechaRegistro   DATETIME2(0)  NOT NULL CONSTRAINT DF_AuditoriaProcesos_FechaRegistro DEFAULT(SYSDATETIME())
    );
    PRINT 'Tabla dbo.AuditoriaProcesos creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.AuditoriaProcesos ya existe.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaProcesos_Proceso_Fecha' AND object_id = OBJECT_ID('dbo.AuditoriaProcesos'))
BEGIN
    CREATE INDEX IX_AuditoriaProcesos_Proceso_Fecha ON dbo.AuditoriaProcesos(Proceso, FechaRegistro DESC);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditoriaProcesos_Entidad' AND object_id = OBJECT_ID('dbo.AuditoriaProcesos'))
BEGIN
    CREATE INDEX IX_AuditoriaProcesos_Entidad ON dbo.AuditoriaProcesos(EntidadTipo, EntidadId);
END
GO

-- ─── Vistas por proceso (una "tabla de auditoría" lógica por módulo, sin duplicar el esquema) ───

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
