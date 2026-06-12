-- 09_denominaciones_y_reporte_cajas.sql
USE SQLGUTPATATE;
GO

-- 1. Crear tabla Denominaciones si no existe
IF OBJECT_ID('dbo.DetalleEfectivoTransaccion', 'U') IS NOT NULL
    DROP TABLE dbo.DetalleEfectivoTransaccion;
GO

IF OBJECT_ID('dbo.Denominaciones', 'U') IS NOT NULL
    DROP TABLE dbo.Denominaciones;
GO

CREATE TABLE dbo.Denominaciones (
    CodigoDenominacion NVARCHAR(10) PRIMARY KEY,
    Valor DECIMAL(5,2) NOT NULL,
    Tipo NVARCHAR(10) NOT NULL CHECK (Tipo IN ('BILLETE', 'MONEDA')),
    Descripcion NVARCHAR(50) NOT NULL
);
PRINT 'Tabla dbo.Denominaciones creada.';
GO

-- 2. Insertar denominaciones por defecto
INSERT INTO dbo.Denominaciones (CodigoDenominacion, Valor, Tipo, Descripcion)
VALUES 
('B100', 100.00, 'BILLETE', 'Billete de $100'),
('B50', 50.00, 'BILLETE', 'Billete de $50'),
('B20', 20.00, 'BILLETE', 'Billete de $20'),
('B10', 10.00, 'BILLETE', 'Billete de $10'),
('B5', 5.00, 'BILLETE', 'Billete de $5'),
('B1', 1.00, 'BILLETE', 'Billete de $1'),
('M1', 1.00, 'MONEDA', 'Moneda de $1'),
('M0.50', 0.50, 'MONEDA', 'Moneda de $0.50'),
('M0.25', 0.25, 'MONEDA', 'Moneda de $0.25'),
('M0.10', 0.10, 'MONEDA', 'Moneda de $0.10'),
('M0.05', 0.05, 'MONEDA', 'Moneda de $0.05'),
('M0.01', 0.01, 'MONEDA', 'Moneda de $0.01');
PRINT 'Valores iniciales de Denominaciones insertados.';
GO

-- 3. Crear tabla DetalleEfectivoTransaccion si no existe
IF OBJECT_ID('dbo.DetalleEfectivoTransaccion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DetalleEfectivoTransaccion (
        DetalleId INT IDENTITY(1,1) PRIMARY KEY,
        AsientoId INT NOT NULL CONSTRAINT FK_DetalleEfectivo_RegistroContable FOREIGN KEY REFERENCES dbo.RegistroContable(AsientoId) ON DELETE CASCADE,
        CodigoDenominacion NVARCHAR(10) NOT NULL CONSTRAINT FK_DetalleEfectivo_Denominaciones FOREIGN KEY REFERENCES dbo.Denominaciones(CodigoDenominacion),
        Cantidad INT NOT NULL,
        Total DECIMAL(18,2) NOT NULL
    );
    PRINT 'Tabla dbo.DetalleEfectivoTransaccion creada.';
END
GO

-- 4. Modificaciones en RegistroSocios para el Reporte de Cajas y Socios
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'Telefonos')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD Telefonos NVARCHAR(200) NULL;
    PRINT 'Columna Telefonos agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'Autoidentificacion')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD Autoidentificacion NVARCHAR(100) NULL;
    PRINT 'Columna Autoidentificacion agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'TipoVivienda')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD TipoVivienda NVARCHAR(100) NULL;
    PRINT 'Columna TipoVivienda agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'ValorVivienda')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD ValorVivienda DECIMAL(18,2) NULL;
    PRINT 'Columna ValorVivienda agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'Discapacidad')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD Discapacidad BIT NULL CONSTRAINT DF_RegistroSocios_Discapacidad DEFAULT(0);
    PRINT 'Columna Discapacidad agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'ConsentimientoDatos')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD ConsentimientoDatos BIT NULL CONSTRAINT DF_RegistroSocios_ConsentimientoDatos DEFAULT(0);
    PRINT 'Columna ConsentimientoDatos agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'PEPS')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD PEPS BIT NULL CONSTRAINT DF_RegistroSocios_PEPS DEFAULT(0);
    PRINT 'Columna PEPS agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'PatrimonioIngresos')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD PatrimonioIngresos NVARCHAR(MAX) NULL;
    PRINT 'Columna PatrimonioIngresos agregada.';
END
GO
