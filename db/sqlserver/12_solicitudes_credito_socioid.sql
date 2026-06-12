-- Migration: Add SocioID foreign key column to SolicitudesCredito table
USE SQLGUTPATATE;
GO

-- 1. Agregar columna SocioID si no existe
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'SocioID')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD SocioID BIGINT NULL;
    PRINT 'Columna SocioID agregada a dbo.SolicitudesCredito.';
END
GO

-- 2. Agregar constraint de clave foránea si no existe
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudesCredito_RegistroSocios')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito 
    ADD CONSTRAINT FK_SolicitudesCredito_RegistroSocios 
    FOREIGN KEY (SocioID) REFERENCES dbo.RegistroSocios(SOCIOID);
    PRINT 'Constraint FK_SolicitudesCredito_RegistroSocios agregada.';
END
GO

-- 3. Poblar SocioID para las solicitudes de crédito existentes cruzando por Identificacion
UPDATE sc
SET sc.SocioID = rs.SOCIOID
FROM dbo.SolicitudesCredito sc
INNER JOIN dbo.RegistroSocios rs ON sc.Identificacion = rs.Identificacion
WHERE sc.SocioID IS NULL;
PRINT 'SocioID poblado para solicitudes existentes.';
GO
