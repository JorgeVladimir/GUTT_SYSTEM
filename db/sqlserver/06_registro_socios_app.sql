/*
  Tablas para Registro de Socios desde la App React
  Base destino: SQLGUTPATATE
  Incluye tablas para RegistroSocios, SocioUbicacionMapa y SocioCroquisTrabajo
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE SQLGUTPATATE;
GO

-- Eliminar tablas si existen para recrearlas con la estructura correcta
IF OBJECT_ID('dbo.SocioCroquisTrabajo', 'U') IS NOT NULL
    DROP TABLE dbo.SocioCroquisTrabajo;
GO

IF OBJECT_ID('dbo.SocioUbicacionMapa', 'U') IS NOT NULL
    DROP TABLE dbo.SocioUbicacionMapa;
GO

IF OBJECT_ID('dbo.RegistroSocios', 'U') IS NOT NULL
    DROP TABLE dbo.RegistroSocios;
GO

-- Eliminar vista si existe
IF OBJECT_ID('dbo.vw_RegistroSociosConsultas', 'V') IS NOT NULL
    DROP VIEW dbo.vw_RegistroSociosConsultas;
GO

-- Eliminar procedimientos si existen
IF OBJECT_ID('dbo.usp_RegistrarSocio', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_RegistrarSocio;
GO

IF OBJECT_ID('dbo.usp_GuardarMapaUbicacion', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_GuardarMapaUbicacion;
GO

IF OBJECT_ID('dbo.usp_GuardarCroquisTrabajo', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_GuardarCroquisTrabajo;
GO

-- Eliminar secuencia si existe
IF OBJECT_ID('Seq_NumeroSocio', 'SO') IS NOT NULL
    DROP SEQUENCE Seq_NumeroSocio;
GO

-- Crear secuencia para números de socio
CREATE SEQUENCE Seq_NumeroSocio
    START WITH 1000
    INCREMENT BY 1;
GO

-- Tabla principal de Registro de Socios
IF OBJECT_ID('dbo.RegistroSocios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RegistroSocios (
        SOCIOID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        TipoPersona NVARCHAR(20) NOT NULL, -- SOCIO, CLIENTE, CLIENTE_EXTERNO
        TipoIdentificacion NVARCHAR(20) NOT NULL, -- CÉDULA, PASAPORTE
        Identificacion NVARCHAR(20) NOT NULL,
        PrimerNombre NVARCHAR(50) NOT NULL,
        SegundoNombre NVARCHAR(50) NULL,
        Apellidos NVARCHAR(100) NOT NULL,
        Email NVARCHAR(100) NULL,
        Telefono NVARCHAR(20) NULL,
        FechaNacimiento DATE NULL,
        EstadoCivil NVARCHAR(20) NULL,
        PIN NVARCHAR(4) NOT NULL,
        
        -- Lugar de Nacimiento (S01)
        PaisNacimiento NVARCHAR(50) NULL,
        ProvinciaNacimiento NVARCHAR(50) NULL,
        CantonNacimiento NVARCHAR(50) NULL,
        ParroquiaNacimiento NVARCHAR(50) NULL,
        
        -- Ubicación de Residencia
        PaisResidencia NVARCHAR(50) NULL,
        ProvinciaResidencia NVARCHAR(50) NULL,
        CantonResidencia NVARCHAR(50) NULL,
        ParroquiaResidencia NVARCHAR(50) NULL,
        DireccionDomicilio NVARCHAR(200) NULL,
        
        -- Información Laboral
        LugarTrabajo NVARCHAR(200) NULL,
        ProvinciaTrabajo NVARCHAR(50) NULL,
        CantonTrabajo NVARCHAR(50) NULL,
        ParroquiaTrabajo NVARCHAR(50) NULL,
        
        -- Datos del Cónyuge
        CedulaConyuge NVARCHAR(20) NULL,
        NombreConyuge NVARCHAR(150) NULL,
        TelefonoConyuge NVARCHAR(20) NULL,
        
        -- Complementarios
        Etnia NVARCHAR(20) NULL,
        Genero NVARCHAR(20) NULL,
        NivelInstruccion NVARCHAR(50) NULL,
        Profesion NVARCHAR(100) NULL,
        
        -- Referencias Personales (JSON)
        ReferenciasPersonales NVARCHAR(MAX) NULL,
        
        -- Cargas Familiares (JSON)
        CargasFamiliares NVARCHAR(MAX) NULL,
        
        -- Metadatos
        NumeroSocio NVARCHAR(10) NULL,
        FechaRegistro DATETIME2(0) NOT NULL CONSTRAINT DF_RegistroSocios_FechaRegistro DEFAULT(SYSDATETIME()),
        UsuarioRegistro NVARCHAR(50) NULL,
        Estado NVARCHAR(20) NOT NULL CONSTRAINT DF_RegistroSocios_Estado DEFAULT('ACTIVO'),
        
        CONSTRAINT UQ_RegistroSocios_Identificacion UNIQUE (Identificacion)
    );
END;
GO

-- Tabla para almacenar imagen del mapa de ubicación del socio
IF OBJECT_ID('dbo.SocioUbicacionMapa', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioUbicacionMapa (
        UbicacionMapaID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SOCIOID BIGINT NOT NULL,
        ImagenMapa VARBINARY(MAX) NULL,
        CoordenadaLat NVARCHAR(50) NULL,
        CoordenadaLng NVARCHAR(50) NULL,
        DireccionCapturada NVARCHAR(200) NULL,
        FechaCaptura DATETIME2(0) NOT NULL CONSTRAINT DF_SocioUbicacionMapa_FechaCaptura DEFAULT(SYSDATETIME()),
        
        CONSTRAINT FK_SocioUbicacionMapa_SOCIOID FOREIGN KEY (SOCIOID) 
            REFERENCES dbo.RegistroSocios(SOCIOID) ON DELETE CASCADE
    );
END;
GO

-- Tabla para almacenar imagen del croquis del trabajo del socio
IF OBJECT_ID('dbo.SocioCroquisTrabajo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioCroquisTrabajo (
        CroquisTrabajoID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SOCIOID BIGINT NOT NULL,
        ImagenCroquis VARBINARY(MAX) NULL,
        Descripcion NVARCHAR(500) NULL,
        FechaCaptura DATETIME2(0) NOT NULL CONSTRAINT DF_SocioCroquisTrabajo_FechaCaptura DEFAULT(SYSDATETIME()),
        
        CONSTRAINT FK_SocioCroquisTrabajo_SOCIOID FOREIGN KEY (SOCIOID) 
            REFERENCES dbo.RegistroSocios(SOCIOID) ON DELETE CASCADE
    );
END;
GO

-- Índices para mejorar rendimiento
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_RegistroSocios_TipoPersona' 
    AND object_id = OBJECT_ID('dbo.RegistroSocios')
)
BEGIN
    CREATE INDEX IX_RegistroSocios_TipoPersona ON dbo.RegistroSocios(TipoPersona);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'IX_RegistroSocios_FechaRegistro' 
    AND object_id = OBJECT_ID('dbo.RegistroSocios')
)
BEGIN
    CREATE INDEX IX_RegistroSocios_FechaRegistro ON dbo.RegistroSocios(FechaRegistro);
END;
GO

-- Vista para consultas de socios
CREATE OR ALTER VIEW dbo.vw_RegistroSociosConsultas
AS
SELECT
    rs.SOCIOID,
    rs.TipoPersona,
    rs.TipoIdentificacion,
    rs.Identificacion,
    rs.PrimerNombre,
    rs.SegundoNombre,
    rs.Apellidos,
    rs.Email,
    rs.Telefono,
    rs.FechaNacimiento,
    rs.EstadoCivil,
    rs.PaisNacimiento,
    rs.ProvinciaNacimiento,
    rs.CantonNacimiento,
    rs.ParroquiaNacimiento,
    rs.PaisResidencia,
    rs.ProvinciaResidencia,
    rs.CantonResidencia,
    rs.ParroquiaResidencia,
    rs.DireccionDomicilio,
    rs.LugarTrabajo,
    rs.ProvinciaTrabajo,
    rs.CantonTrabajo,
    rs.ParroquiaTrabajo,
    rs.NumeroSocio,
    rs.FechaRegistro,
    rs.UsuarioRegistro,
    rs.Estado,
    -- Indicadores de si tiene imágenes
    CASE WHEN sm.UbicacionMapaID IS NOT NULL THEN 1 ELSE 0 END AS TieneMapaUbicacion,
    CASE WHEN ct.CroquisTrabajoID IS NOT NULL THEN 1 ELSE 0 END AS TieneCroquisTrabajo
FROM dbo.RegistroSocios rs
LEFT JOIN dbo.SocioUbicacionMapa sm ON sm.SOCIOID = rs.SOCIOID
LEFT JOIN dbo.SocioCroquisTrabajo ct ON ct.SOCIOID = rs.SOCIOID
WHERE rs.Estado = 'ACTIVO';
GO

-- Procedimiento almacenado para registrar un nuevo socio
CREATE PROCEDURE dbo.usp_RegistrarSocio
    @TipoPersona NVARCHAR(20),
    @TipoIdentificacion NVARCHAR(20),
    @Identificacion NVARCHAR(20),
    @PrimerNombre NVARCHAR(50),
    @SegundoNombre NVARCHAR(50),
    @Apellidos NVARCHAR(100),
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
    @CedulaConyuge NVARCHAR(20),
    @NombreConyuge NVARCHAR(150),
    @TelefonoConyuge NVARCHAR(20),
    @Etnia NVARCHAR(20),
    @Genero NVARCHAR(20),
    @NivelInstruccion NVARCHAR(50),
    @Profesion NVARCHAR(100),
    @ReferenciasPersonales NVARCHAR(MAX),
    @CargasFamiliares NVARCHAR(MAX),
    @UsuarioRegistro NVARCHAR(50),
    @SOCIOID BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @NuevoNumeroSocio NVARCHAR(10);
    
    -- Generar número de socio usando la secuencia
    SET @NuevoNumeroSocio = 'P' + CAST(NEXT VALUE FOR Seq_NumeroSocio AS NVARCHAR(10));
    
    INSERT INTO dbo.RegistroSocios (
        TipoPersona,
        TipoIdentificacion,
        Identificacion,
        PrimerNombre,
        SegundoNombre,
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
        Estado
    )
    VALUES (
        @TipoPersona,
        @TipoIdentificacion,
        @Identificacion,
        @PrimerNombre,
        @SegundoNombre,
        @Apellidos,
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
        'ACTIVO'
    );
    
    SET @SOCIOID = SCOPE_IDENTITY();
    
    SELECT @SOCIOID AS SOCIOID, @NuevoNumeroSocio AS NumeroSocio;
END;
GO

-- Procedimiento almacenado para guardar imagen de mapa de ubicación
CREATE PROCEDURE dbo.usp_GuardarMapaUbicacion
    @SOCIOID BIGINT,
    @ImagenMapa VARBINARY(MAX),
    @CoordenadaLat NVARCHAR(50),
    @CoordenadaLng NVARCHAR(50),
    @DireccionCapturada NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    
    IF EXISTS (SELECT 1 FROM dbo.SocioUbicacionMapa WHERE SOCIOID = @SOCIOID)
    BEGIN
        UPDATE dbo.SocioUbicacionMapa
        SET 
            ImagenMapa = @ImagenMapa,
            CoordenadaLat = @CoordenadaLat,
            CoordenadaLng = @CoordenadaLng,
            DireccionCapturada = @DireccionCapturada,
            FechaCaptura = SYSDATETIME()
        WHERE SOCIOID = @SOCIOID;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.SocioUbicacionMapa (
            SOCIOID,
            ImagenMapa,
            CoordenadaLat,
            CoordenadaLng,
            DireccionCapturada
        )
        VALUES (
            @SOCIOID,
            @ImagenMapa,
            @CoordenadaLat,
            @CoordenadaLng,
            @DireccionCapturada
        );
    END;
END;
GO

-- Procedimiento almacenado para guardar imagen de croquis de trabajo
CREATE PROCEDURE dbo.usp_GuardarCroquisTrabajo
    @SOCIOID BIGINT,
    @ImagenCroquis VARBINARY(MAX),
    @Descripcion NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    
    IF EXISTS (SELECT 1 FROM dbo.SocioCroquisTrabajo WHERE SOCIOID = @SOCIOID)
    BEGIN
        UPDATE dbo.SocioCroquisTrabajo
        SET 
            ImagenCroquis = @ImagenCroquis,
            Descripcion = @Descripcion,
            FechaCaptura = SYSDATETIME()
        WHERE SOCIOID = @SOCIOID;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.SocioCroquisTrabajo (
            SOCIOID,
            ImagenCroquis,
            Descripcion
        )
        VALUES (
            @SOCIOID,
            @ImagenCroquis,
            @Descripcion
        );
    END;
END;
GO

PRINT 'Tablas y procedimientos para RegistroSocios creados exitosamente.';
