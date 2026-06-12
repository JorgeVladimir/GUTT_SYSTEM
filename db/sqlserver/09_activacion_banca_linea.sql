USE SQLGUTPATATE;
GO

-- Crear tabla de activación de banca en línea
IF OBJECT_ID('dbo.ActivacionBancaLinea', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ActivacionBancaLinea (
        ActivacionId INT IDENTITY(1,1) PRIMARY KEY,
        SocioId BIGINT NOT NULL CONSTRAINT FK_ActivacionBancaLinea_RegistroSocios FOREIGN KEY REFERENCES dbo.RegistroSocios(SOCIOID) ON DELETE CASCADE,
        PIN NVARCHAR(4) NOT NULL,
        CodigoVerificacion NVARCHAR(10) NOT NULL,
        FechaRegistro DATETIME2(0) NOT NULL CONSTRAINT DF_ActivacionBancaLinea_FechaRegistro DEFAULT(SYSDATETIME()),
        AceptoDatosPersonales BIT NOT NULL CONSTRAINT DF_ActivacionBancaLinea_AceptoDatosPersonales DEFAULT(0),
        FechaAceptacionDatos DATETIME2(0) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_ActivacionBancaLinea_Activo DEFAULT(0)
    );
    PRINT 'Tabla dbo.ActivacionBancaLinea creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.ActivacionBancaLinea ya existe.';
END
GO

-- Crear índice para mejorar consultas por SocioId
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ActivacionBancaLinea_SocioId' AND object_id = OBJECT_ID('dbo.ActivacionBancaLinea'))
BEGIN
    CREATE INDEX IX_ActivacionBancaLinea_SocioId ON dbo.ActivacionBancaLinea(SocioId);
    PRINT 'Índice IX_ActivacionBancaLinea_SocioId creado con éxito.';
END
GO
