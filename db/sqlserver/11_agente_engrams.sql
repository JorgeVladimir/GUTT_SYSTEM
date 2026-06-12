-- Migration: Agente Engrams (Persistent Memory and Context Store)
USE SQLGUTPATATE;
GO

IF OBJECT_ID('dbo.AgenteEngrams', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AgenteEngrams (
        EngramId INT IDENTITY(1,1) PRIMARY KEY,
        Clave NVARCHAR(100) NOT NULL UNIQUE,
        Modulo NVARCHAR(50) NOT NULL,
        Contenido NVARCHAR(MAX) NOT NULL, -- JSON string
        FechaActualizacion DATETIME2(0) NOT NULL CONSTRAINT DF_AgenteEngrams_Fecha DEFAULT(SYSDATETIME()),
        UsuarioModificacion NVARCHAR(50) NULL
    );
    PRINT 'Tabla dbo.AgenteEngrams creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.AgenteEngrams ya existe.';
END
GO
