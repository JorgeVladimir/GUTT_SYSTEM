-- Migration: Add Origen column to SolicitudesCredito table
USE SQLGUTPATATE;
GO

-- 1. Agregar columna Origen si no existe
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'Origen')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD Origen NVARCHAR(20) NULL CONSTRAINT DF_SolicitudesCredito_Origen DEFAULT('CAJA_PATATE');
    PRINT 'Columna Origen agregada a dbo.SolicitudesCredito.';
END
GO

-- 2. Poblar Origen para las solicitudes existentes (por defecto CAJA_PATATE)
UPDATE dbo.SolicitudesCredito
SET Origen = 'CAJA_PATATE'
WHERE Origen IS NULL;
PRINT 'Origen establecido para registros existentes.';
GO
