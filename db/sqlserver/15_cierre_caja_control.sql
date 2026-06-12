-- 15_cierre_caja_control.sql
USE SQLGUTPATATE;
GO

-- 1. Crear tabla ControlCaja si no existe
IF OBJECT_ID('dbo.ControlCaja', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ControlCaja (
        ControlId INT IDENTITY(1,1) PRIMARY KEY,
        UsuarioId NVARCHAR(50) NOT NULL,
        Fecha DATE NOT NULL,
        HoraApertura DATETIME2(0) NOT NULL,
        HoraCierre DATETIME2(0) NULL,
        SaldoApertura DECIMAL(18,2) NOT NULL,
        SaldoCierre DECIMAL(18,2) NULL,
        Estado NVARCHAR(20) NOT NULL CHECK (Estado IN ('ABIERTO', 'CERRADO')),
        CONSTRAINT UC_ControlCaja_Usuario_Fecha UNIQUE (UsuarioId, Fecha)
    );
    PRINT 'Tabla dbo.ControlCaja creada con restricción de unicidad de fecha por usuario.';
END
GO

-- 2. Modificar usp_RegistrarSocio para usar secuenciales independientes por tipo de persona
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
    
    DECLARE @NuevoNumeroSocio NVARCHAR(20);
    DECLARE @Count INT;
    DECLARE @Prefix NVARCHAR(10);
    
    -- Contar y asignar prefijo según tipo de persona para secuencial diferente
    IF @TipoPersona = 'SOCIO'
    BEGIN
        SELECT @Count = COUNT(*) FROM dbo.RegistroSocios WHERE TipoPersona = 'SOCIO';
        SET @Prefix = 'S-00';
    END
    ELSE IF @TipoPersona = 'CLIENTE'
    BEGIN
        SELECT @Count = COUNT(*) FROM dbo.RegistroSocios WHERE TipoPersona = 'CLIENTE';
        SET @Prefix = 'CL-00';
    END
    ELSE
    BEGIN
        SELECT @Count = COUNT(*) FROM dbo.RegistroSocios WHERE TipoPersona = 'CLIENTE_EXTERNO';
        SET @Prefix = 'CE-00';
    END
    
    SET @NuevoNumeroSocio = @Prefix + CAST((@Count + 1) AS NVARCHAR(10));
    
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

    -- Generar las cuentas automáticas en dbo.CuentasAhorro
    IF @TipoPersona = 'SOCIO'
    BEGIN
        -- Crear cuentas para TODOS los productos parametrizados (Certificados y Ahorros)
        INSERT INTO dbo.CuentasAhorro (SocioId, NumeroCuenta, CodigoProducto, Saldo)
        SELECT 
            @SOCIOID,
            CAST(p.CodigoProducto AS NVARCHAR(2)) + RIGHT('00000000' + CAST(@SOCIOID AS NVARCHAR(8)), 8),
            p.CodigoProducto,
            0.00
        FROM dbo.parametrosproductos p;
    END
    ELSE
    BEGIN
        -- Crear cuentas únicamente para productos de AHORRO (EsCertificado = 0)
        INSERT INTO dbo.CuentasAhorro (SocioId, NumeroCuenta, CodigoProducto, Saldo)
        SELECT 
            @SOCIOID,
            CAST(p.CodigoProducto AS NVARCHAR(2)) + RIGHT('00000000' + CAST(@SOCIOID AS NVARCHAR(8)), 8),
            p.CodigoProducto,
            0.00
        FROM dbo.parametrosproductos p
        WHERE p.EsCertificado = 0;
    END
    
    SELECT @SOCIOID AS SOCIOID, @NuevoNumeroSocio AS NumeroSocio;
END;
GO
