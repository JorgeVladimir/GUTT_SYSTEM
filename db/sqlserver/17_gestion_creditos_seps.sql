-- 17_gestion_creditos_seps.sql
USE SQLGUTPATATE;
GO

-- 1. Alterar SolicitudesCredito para agregar columnas de garantía prendaria, aprobación y scoring
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'TipoPrenda')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD TipoPrenda NVARCHAR(100) NULL;
    PRINT 'Columna TipoPrenda agregada a dbo.SolicitudesCredito.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'AvaluoPrendario')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD AvaluoPrendario DECIMAL(15,2) NULL;
    PRINT 'Columna AvaluoPrendario agregada a dbo.SolicitudesCredito.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ObservacionTecnicaPrenda')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ObservacionTecnicaPrenda NVARCHAR(500) NULL;
    PRINT 'Columna ObservacionTecnicaPrenda agregada a dbo.SolicitudesCredito.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ValorCobertura')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ValorCobertura DECIMAL(10,2) NULL;
    PRINT 'Columna ValorCobertura agregada a dbo.SolicitudesCredito.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'TipoAprobacion')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD TipoAprobacion NVARCHAR(50) NULL;
    PRINT 'Columna TipoAprobacion agregada a dbo.SolicitudesCredito.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ActaSesion')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ActaSesion NVARCHAR(100) NULL;
    PRINT 'Columna ActaSesion agregada a dbo.SolicitudesCredito.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SolicitudesCredito') AND name = 'ScoringScore')
BEGIN
    ALTER TABLE dbo.SolicitudesCredito ADD ScoringScore INT NULL;
    PRINT 'Columna ScoringScore agregada a dbo.SolicitudesCredito.';
END
GO


-- 2. Crear tabla Creditos para almacenar préstamos desembolsados/activos
IF OBJECT_ID('dbo.Creditos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Creditos (
        CreditoID NVARCHAR(50) NOT NULL PRIMARY KEY,
        SolicitudID NVARCHAR(50) NOT NULL,
        SocioID BIGINT NOT NULL,
        Monto DECIMAL(15,2) NOT NULL,
        Saldo DECIMAL(15,2) NOT NULL,
        Tasa DECIMAL(5,2) NOT NULL,
        Plazo INT NOT NULL,
        Tipo NVARCHAR(100) NOT NULL,
        Estado NVARCHAR(30) NOT NULL,
        FechaDesembolso DATETIME2(0) NOT NULL CONSTRAINT DF_Creditos_FechaDesembolso DEFAULT(SYSDATETIME()),
        FechaVencimiento NVARCHAR(50) NULL,
        TipoAprobacion NVARCHAR(50) NULL,
        ActaSesion NVARCHAR(100) NULL,
        TipoPrenda NVARCHAR(100) NULL,
        AvaluoPrendario DECIMAL(15,2) NULL,
        ObservacionTecnicaPrenda NVARCHAR(500) NULL,
        ValorCobertura DECIMAL(10,2) NULL,
        
        CONSTRAINT FK_Creditos_SolicitudID FOREIGN KEY (SolicitudID) 
            REFERENCES dbo.SolicitudesCredito(SolicitudID),
        CONSTRAINT FK_Creditos_SocioID FOREIGN KEY (SocioID) 
            REFERENCES dbo.RegistroSocios(SOCIOID)
    );
    PRINT 'Tabla dbo.Creditos creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.Creditos ya existe.';
END
GO


-- 3. Crear tabla TablaDeAmortizacion para almacenar las cuotas de los créditos
IF OBJECT_ID('dbo.TablaDeAmortizacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TablaDeAmortizacion (
        AmortizacionID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CreditoID NVARCHAR(50) NOT NULL,
        NumeroCuota INT NOT NULL,
        FechaPago NVARCHAR(50) NOT NULL,
        Capital DECIMAL(15,2) NOT NULL,
        Interes DECIMAL(15,2) NOT NULL,
        SeguroDesgravamen DECIMAL(15,2) NOT NULL,
        ContribucionSOLCA DECIMAL(15,2) NOT NULL,
        GastosAdministrativos DECIMAL(15,2) NOT NULL,
        Total DECIMAL(15,2) NOT NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_TablaDeAmortizacion_Estado DEFAULT('PENDIENTE'),
        
        CONSTRAINT FK_TablaDeAmortizacion_CreditoID FOREIGN KEY (CreditoID) 
            REFERENCES dbo.Creditos(CreditoID) ON DELETE CASCADE
    );
    PRINT 'Tabla dbo.TablaDeAmortizacion creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.TablaDeAmortizacion ya existe.';
END
GO


-- 4. Crear tabla RubrosCreditos para almacenar rubros detallados de cada cuota
IF OBJECT_ID('dbo.RubrosCreditos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RubrosCreditos (
        RubroID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        AmortizacionID INT NOT NULL,
        NombreRubro NVARCHAR(50) NOT NULL,
        Monto DECIMAL(15,2) NOT NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_RubrosCreditos_Estado DEFAULT('PENDIENTE'),
        
        CONSTRAINT FK_RubrosCreditos_AmortizacionID FOREIGN KEY (AmortizacionID) 
            REFERENCES dbo.TablaDeAmortizacion(AmortizacionID) ON DELETE CASCADE
    );
    PRINT 'Tabla dbo.RubrosCreditos creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.RubrosCreditos ya existe.';
END
GO
