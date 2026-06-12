-- Migration: Cuentas de Ahorro, Parámetros de Productos, Registro Contable y Cuentas Automáticas.
USE SQLGUTPATATE;
GO

-- 1. Crear tabla parametrosproductos si no existe
IF OBJECT_ID('dbo.parametrosproductos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.parametrosproductos (
        ProductoId INT IDENTITY(1,1) PRIMARY KEY,
        CodigoProducto INT NOT NULL UNIQUE, -- 1 para certificados, 2 para ahorros
        Nombre NVARCHAR(100) NOT NULL,
        TipoDeposito NVARCHAR(100) NOT NULL,
        EsCertificado BIT NOT NULL DEFAULT 0,
        CuentaActiva NVARCHAR(20) NOT NULL,
        CuentaInactiva NVARCHAR(20) NOT NULL,
        CuentaGasto NVARCHAR(20) NULL,
        CuentaProvision NVARCHAR(20) NULL,
        CuentaDepositosConfirmar NVARCHAR(20) NULL,
        NumCtas4Dig INT NOT NULL DEFAULT 28,
        PermiteDepositos BIT NOT NULL DEFAULT 1,
        PermiteRetiros BIT NOT NULL DEFAULT 1,
        PermiteDebitos BIT NOT NULL DEFAULT 1,
        PermiteCreditos BIT NOT NULL DEFAULT 1,
        PermiteTransferencias BIT NOT NULL DEFAULT 1,
        Tasa NVARCHAR(50) NOT NULL DEFAULT 'TASA NOMINAL',
        FormaPago NVARCHAR(100) NOT NULL DEFAULT 'MOVIMIENTO HISTORICO PONDERADO BASE',
        MesesAcreditacion NVARCHAR(100) NOT NULL DEFAULT 'Diciembre'
    );
    PRINT 'Tabla dbo.parametrosproductos creada.';
END
GO

-- 2. Insertar valores iniciales de productos
IF NOT EXISTS (SELECT 1 FROM dbo.parametrosproductos WHERE CodigoProducto = 1)
BEGIN
    INSERT INTO dbo.parametrosproductos (
        CodigoProducto, Nombre, TipoDeposito, EsCertificado, 
        CuentaActiva, CuentaInactiva, CuentaGasto, CuentaProvision, CuentaDepositosConfirmar, 
        NumCtas4Dig, PermiteDepositos, PermiteRetiros, PermiteDebitos, PermiteCreditos, PermiteTransferencias, 
        Tasa, FormaPago, MesesAcreditacion
    )
    VALUES (
        1, 'CERTIFICADOS DE APORTACION', 'AHORRO A LA VISTA', 1, 
        '31030505', '31030505', '41019001', '25019001', '21015015', 
        28, 1, 0, 1, 1, 1, 
        'TASA NOMINAL', 'MOVIMIENTO HISTORICO PONDERADO BASE', 'Diciembre'
    );
    PRINT 'Producto Certificados de Aportación (1) insertado.';
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.parametrosproductos WHERE CodigoProducto = 2)
BEGIN
    INSERT INTO dbo.parametrosproductos (
        CodigoProducto, Nombre, TipoDeposito, EsCertificado, 
        CuentaActiva, CuentaInactiva, CuentaGasto, CuentaProvision, CuentaDepositosConfirmar, 
        NumCtas4Dig, PermiteDepositos, PermiteRetiros, PermiteDebitos, PermiteCreditos, PermiteTransferencias, 
        Tasa, FormaPago, MesesAcreditacion
    )
    VALUES (
        2, 'AHORRO A LA VISTA', 'AHORRO A LA VISTA', 0, 
        '21013505', '21013505', '41019001', '25019001', '21015015', 
        28, 1, 1, 1, 1, 1, 
        'TASA NOMINAL', 'MOVIMIENTO HISTORICO PONDERADO BASE', 'Diciembre'
    );
    PRINT 'Producto Ahorro a la Vista (2) insertado.';
END
GO

-- 3. Crear tabla CuentasAhorro si no existe (no usar DROP para preservar datos reales)
IF OBJECT_ID('dbo.CuentasAhorro', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CuentasAhorro (
        CuentaId INT IDENTITY(1,1) PRIMARY KEY,
        SocioId BIGINT NOT NULL CONSTRAINT FK_CuentasAhorro_RegistroSocios FOREIGN KEY REFERENCES dbo.RegistroSocios(SOCIOID),
        NumeroCuenta NVARCHAR(20) NOT NULL UNIQUE,
        CodigoProducto INT NOT NULL CONSTRAINT FK_CuentasAhorro_Parametros FOREIGN KEY REFERENCES dbo.parametrosproductos(CodigoProducto),
        Saldo DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        FechaApertura DATETIME2(0) NOT NULL CONSTRAINT DF_CuentasAhorro_FechaApertura DEFAULT(SYSDATETIME()),
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_CuentasAhorro_Estado DEFAULT('ACTIVA')
    );
    PRINT 'Tabla dbo.CuentasAhorro creada.';
END
GO

-- 4. Crear tabla RegistroContable (Libro Diario Contabilidad SEPS)
IF OBJECT_ID('dbo.RegistroContable', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RegistroContable (
        AsientoId INT IDENTITY(1,1) PRIMARY KEY,
        Fecha DATETIME2(0) NOT NULL CONSTRAINT DF_RegistroContable_Fecha DEFAULT(SYSDATETIME()),
        SocioId BIGINT NOT NULL CONSTRAINT FK_RegistroContable_Socio FOREIGN KEY REFERENCES dbo.RegistroSocios(SOCIOID),
        CuentaContable NVARCHAR(20) NOT NULL, -- 31030505, 21013505, 110105, etc.
        Concepto NVARCHAR(200) NOT NULL,
        Debe DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        Haber DECIMAL(18,2) NOT NULL DEFAULT 0.00,
        NumeroCuenta NVARCHAR(20) NOT NULL,
        UsuarioId NVARCHAR(50) NOT NULL
    );
    PRINT 'Tabla dbo.RegistroContable creada.';
END
GO

-- 5. Recrear usp_RegistrarSocio con autogeneración de cuentas
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
