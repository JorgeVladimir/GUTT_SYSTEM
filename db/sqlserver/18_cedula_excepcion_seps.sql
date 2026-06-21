USE SQLGUTPATATE;
GO

IF OBJECT_ID('dbo.SocioDocumentoExcepcion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioDocumentoExcepcion (
        DocumentoID INT IDENTITY(1,1) PRIMARY KEY NOT NULL,
        SOCIOID BIGINT NOT NULL CONSTRAINT FK_SocioDocumentoExcepcion_SOCIOID FOREIGN KEY REFERENCES dbo.RegistroSocios(SOCIOID),
        Identificacion NVARCHAR(20) NOT NULL,
        RutaCaraFrontal NVARCHAR(250) NULL,
        RutaCaraPosterior NVARCHAR(250) NULL,
        FechaRegistro DATETIME2(0) NOT NULL CONSTRAINT DF_SocioDocumentoExcepcion_FechaRegistro DEFAULT(SYSDATETIME())
    );
    PRINT 'Tabla dbo.SocioDocumentoExcepcion creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.SocioDocumentoExcepcion ya existe.';
END
GO
