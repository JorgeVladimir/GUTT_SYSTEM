-- Migration Script: split last names, single name/surname flags, email validation, and audit table.
USE SQLGUTPATATE;
GO

-- 1. Crear tabla de auditoría si no existe
IF OBJECT_ID('dbo.AuditoriaUsuarios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditoriaUsuarios (
        AuditoriaId INT IDENTITY(1,1) PRIMARY KEY,
        UsuarioId NVARCHAR(20) NOT NULL,
        Concepto NVARCHAR(100) NOT NULL,
        Detalle NVARCHAR(500) NOT NULL,
        FechaRegistro DATETIME2(0) NOT NULL CONSTRAINT DF_AuditoriaUsuarios_FechaRegistro DEFAULT(SYSDATETIME())
    );
    PRINT 'Tabla dbo.AuditoriaUsuarios creada con éxito.';
END
ELSE
BEGIN
    PRINT 'Tabla dbo.AuditoriaUsuarios ya existe.';
END
GO

-- 2. Modificar tabla RegistroSocios para agregar nuevas columnas
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'PrimerApellido')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD PrimerApellido NVARCHAR(50) NULL;
    PRINT 'Columna PrimerApellido agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'SegundoApellido')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD SegundoApellido NVARCHAR(50) NULL;
    PRINT 'Columna SegundoApellido agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'SoloUnNombre')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD SoloUnNombre BIT NOT NULL CONSTRAINT DF_RegistroSocios_SoloUnNombre DEFAULT(0);
    PRINT 'Columna SoloUnNombre agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'SoloUnApellido')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD SoloUnApellido BIT NOT NULL CONSTRAINT DF_RegistroSocios_SoloUnApellido DEFAULT(0);
    PRINT 'Columna SoloUnApellido agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'EmailConfirmado')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD EmailConfirmado BIT NOT NULL CONSTRAINT DF_RegistroSocios_EmailConfirmado DEFAULT(0);
    PRINT 'Columna EmailConfirmado agregada.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RegistroSocios') AND name = 'CodigoActivacion')
BEGIN
    ALTER TABLE dbo.RegistroSocios ADD CodigoActivacion NVARCHAR(10) NULL;
    PRINT 'Columna CodigoActivacion agregada.';
END
GO

-- 3. Recrear el procedimiento almacenado usp_RegistrarSocio con los nuevos parámetros
CREATE OR ALTER PROCEDURE dbo.usp_RegistrarSocio
    @TipoPersona NVARCHAR(20),
    @TipoIdentificacion NVARCHAR(20),
    @Identificacion NVARCHAR(20),
    @PrimerNombre NVARCHAR(50),
    @SegundoNombre NVARCHAR(50) = NULL,
    @PrimerApellido NVARCHAR(50),
    @SegundoApellido NVARCHAR(50) = NULL,
    @SoloUnNombre BIT = 0,
    @SoloUnApellido BIT = 0,
    @Email NVARCHAR(100),
    @Telefono NVARCHAR(20),
    @FechaNacimiento DATE,
    @EstadoCivil NVARCHAR(20),
    @PIN NVARCHAR(4),
    @PaisNacimiento NVARCHAR(50),
    @ProvinciaNacimiento NVARCHAR(50),
    @CantonNacimiento NVARCHAR(50),
    @ParroquiaNacimiento NVARCHAR(50),
    @PaisResidencia NVARCHAR(50),
    @ProvinciaResidencia NVARCHAR(50),
    @CantonResidencia NVARCHAR(50),
    @ParroquiaResidencia NVARCHAR(50),
    @DireccionDomicilio NVARCHAR(200),
    @LugarTrabajo NVARCHAR(200),
    @ProvinciaTrabajo NVARCHAR(50),
    @CantonTrabajo NVARCHAR(50),
    @ParroquiaTrabajo NVARCHAR(50),
    @CedulaConyuge NVARCHAR(20) = NULL,
    @NombreConyuge NVARCHAR(150) = NULL,
    @TelefonoConyuge NVARCHAR(20) = NULL,
    @Etnia NVARCHAR(20),
    @Genero NVARCHAR(20),
    @NivelInstruccion NVARCHAR(50),
    @Profesion NVARCHAR(100),
    @ReferenciasPersonales NVARCHAR(MAX),
    @CargasFamiliares NVARCHAR(MAX),
    @UsuarioRegistro NVARCHAR(50),
    @CodigoActivacion NVARCHAR(10) = NULL,
    @EmailConfirmado BIT = 0,
    @SOCIOID BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @NuevoNumeroSocio NVARCHAR(10);
    
    -- Generar número de socio usando la secuencia
    SET @NuevoNumeroSocio = 'P' + CAST(NEXT VALUE FOR Seq_NumeroSocio AS NVARCHAR(10));
    
    -- Para compatibilidad, concatenamos apellidos completos
    DECLARE @ApellidosFull NVARCHAR(100);
    SET @ApellidosFull = @PrimerApellido + CASE WHEN @SoloUnApellido = 1 OR @SegundoApellido IS NULL OR @SegundoApellido = '' THEN '' ELSE ' ' + @SegundoApellido END;

    INSERT INTO dbo.RegistroSocios (
        TipoPersona,
        TipoIdentificacion,
        Identificacion,
        PrimerNombre,
        SegundoNombre,
        PrimerApellido,
        SegundoApellido,
        SoloUnNombre,
        SoloUnApellido,
        Apellidos,
        Email,
        Telefono,
        FechaNacimiento,
        EstadoCivil,
        PIN,
        PaisNacimiento,
        ProvinciaNacimiento,
        CantonNacimiento,
        ParroquiaNacimiento,
        PaisResidencia,
        ProvinciaResidencia,
        CantonResidencia,
        ParroquiaResidencia,
        DireccionDomicilio,
        LugarTrabajo,
        ProvinciaTrabajo,
        CantonTrabajo,
        ParroquiaTrabajo,
        CedulaConyuge,
        NombreConyuge,
        TelefonoConyuge,
        Etnia,
        Genero,
        NivelInstruccion,
        Profesion,
        ReferenciasPersonales,
        CargasFamiliares,
        NumeroSocio,
        UsuarioRegistro,
        CodigoActivacion,
        EmailConfirmado,
        Estado
    )
    VALUES (
        @TipoPersona,
        @TipoIdentificacion,
        @Identificacion,
        @PrimerNombre,
        @SegundoNombre,
        @PrimerApellido,
        @SegundoApellido,
        @SoloUnNombre,
        @SoloUnApellido,
        @ApellidosFull,
        @Email,
        @Telefono,
        @FechaNacimiento,
        @EstadoCivil,
        @PIN,
        @PaisNacimiento,
        @ProvinciaNacimiento,
        @CantonNacimiento,
        @ParroquiaNacimiento,
        @PaisResidencia,
        @ProvinciaResidencia,
        @CantonResidencia,
        @ParroquiaResidencia,
        @DireccionDomicilio,
        @LugarTrabajo,
        @ProvinciaTrabajo,
        @CantonTrabajo,
        @ParroquiaTrabajo,
        @CedulaConyuge,
        @NombreConyuge,
        @TelefonoConyuge,
        @Etnia,
        @Genero,
        @NivelInstruccion,
        @Profesion,
        @ReferenciasPersonales,
        @CargasFamiliares,
        @NuevoNumeroSocio,
        @UsuarioRegistro,
        @CodigoActivacion,
        @EmailConfirmado,
        'ACTIVO'
    );
    
    SET @SOCIOID = SCOPE_IDENTITY();
    
    SELECT @SOCIOID AS SOCIOID, @NuevoNumeroSocio AS NumeroSocio;
END;
GO
