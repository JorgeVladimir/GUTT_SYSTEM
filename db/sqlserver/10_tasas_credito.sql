-- Migration Script: Creación de Tasas de Crédito y Campos de Garantía/Descuentos.
USE SQLGUTPATATE;
GO

-- 1. Crear tabla TasasCredito si no existe
IF OBJECT_ID('dbo.TasasCredito', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TasasCredito (
        TasaId INT IDENTITY(1,1) PRIMARY KEY,
        LineaCredito NVARCHAR(100) NOT NULL UNIQUE,
        ClaseCredito NVARCHAR(50) NOT NULL,
        MontoMinimo DECIMAL(18,2) NOT NULL,
        MontoMaximo DECIMAL(18,2) NOT NULL,
        PlazoMinimo INT NOT NULL,
        PlazoMaximo INT NOT NULL,
        TasaInicial DECIMAL(5,2) NOT NULL,
        TasaFinal DECIMAL(5,2) NOT NULL,
        TasaAplicable DECIMAL(5,2) NOT NULL
    );
    PRINT 'Tabla dbo.TasasCredito creada.';
END
GO

-- 2. Insertar valores iniciales según la foto
IF NOT EXISTS (SELECT 1 FROM dbo.TasasCredito)
BEGIN
    INSERT INTO dbo.TasasCredito (LineaCredito, ClaseCredito, MontoMinimo, MontoMaximo, PlazoMinimo, PlazoMaximo, TasaInicial, TasaFinal, TasaAplicable)
    VALUES 
    (N'CONSUMO ORDINARIO', N'CONSUMO', 100.00, 1000000.00, 1, 360, 14.00, 14.00, 14.00),
    (N'MICROCREDITO MINORISTA', N'MICROCREDITO', 1.00, 20000.00, 1, 360, 24.85, 28.23, 24.85),
    (N'MICROCREDITO ACUMULACION SIMPLE', N'MICROCREDITO', 1.00, 150000.00, 1, 360, 24.85, 28.23, 24.85),
    (N'MICRO EMPRENDEDOR', N'MICROCREDITO', 120000.01, 300000.00, 1, 360, 14.00, 14.00, 14.00),
    (N'MICROCREDITO ACUMULACION AMPLIADA', N'MICROCREDITO', 20000.01, 120000.00, 1, 360, 19.00, 19.00, 19.00);
    PRINT 'Valores iniciales de TasasCredito insertados.';
END
GO

-- 3. Modificar SolicitudesCredito para agregar columnas de Garantía y Descuentos si no existen
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'GarantiaInfo')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD GarantiaInfo NVARCHAR(MAX) NULL;
    PRINT 'Columna GarantiaInfo agregada a SolicitudesCredito.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'DescuentosDesembolso')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD DescuentosDesembolso NVARCHAR(MAX) NULL;
    PRINT 'Columna DescuentosDesembolso agregada a SolicitudesCredito.';
END
GO
