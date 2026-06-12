-- 16_mejoras_reportes_ficha.sql
USE SQLGUTPATATE;
GO

-- 1. Crear tabla SocioUbicacionMapa si no existe, o alterar si existe
IF OBJECT_ID('dbo.SocioUbicacionMapa', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioUbicacionMapa (
        UbicacionMapaID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SOCIOID BIGINT NOT NULL,
        ImagenMapa VARBINARY(MAX) NULL,
        CoordenadaLat NVARCHAR(50) NULL,
        CoordenadaLng NVARCHAR(50) NULL,
        DireccionCapturada NVARCHAR(200) NULL,
        RutaImagen NVARCHAR(250) NULL,
        FechaCaptura DATETIME2(0) NOT NULL CONSTRAINT DF_SocioUbicacionMapa_FechaCaptura DEFAULT(SYSDATETIME()),
        
        CONSTRAINT FK_SocioUbicacionMapa_SOCIOID FOREIGN KEY (SOCIOID) 
            REFERENCES dbo.RegistroSocios(SOCIOID) ON DELETE CASCADE
    );
    PRINT 'Tabla dbo.SocioUbicacionMapa creada.';
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SocioUbicacionMapa') AND name = 'RutaImagen')
    BEGIN
        ALTER TABLE dbo.SocioUbicacionMapa ADD RutaImagen NVARCHAR(250) NULL;
        PRINT 'Columna RutaImagen agregada a dbo.SocioUbicacionMapa.';
    END
    ELSE
    BEGIN
        PRINT 'Columna RutaImagen ya existe en dbo.SocioUbicacionMapa.';
    END
END
GO

-- 2. Crear tabla SocioCroquisTrabajo si no existe, o alterar si existe
IF OBJECT_ID('dbo.SocioCroquisTrabajo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioCroquisTrabajo (
        CroquisTrabajoID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SOCIOID BIGINT NOT NULL,
        ImagenCroquis VARBINARY(MAX) NULL,
        Descripcion NVARCHAR(500) NULL,
        RutaImagen NVARCHAR(250) NULL,
        FechaCaptura DATETIME2(0) NOT NULL CONSTRAINT DF_SocioCroquisTrabajo_FechaCaptura DEFAULT(SYSDATETIME()),
        
        CONSTRAINT FK_SocioCroquisTrabajo_SOCIOID FOREIGN KEY (SOCIOID) 
            REFERENCES dbo.RegistroSocios(SOCIOID) ON DELETE CASCADE
    );
    PRINT 'Tabla dbo.SocioCroquisTrabajo creada.';
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SocioCroquisTrabajo') AND name = 'RutaImagen')
    BEGIN
        ALTER TABLE dbo.SocioCroquisTrabajo ADD RutaImagen NVARCHAR(250) NULL;
        PRINT 'Columna RutaImagen agregada a dbo.SocioCroquisTrabajo.';
    END
    ELSE
    BEGIN
        PRINT 'Columna RutaImagen ya existe en dbo.SocioCroquisTrabajo.';
    END
END
GO

-- 3. Recrear Vista dbo.vw_RegistroSociosConsultas con NombreCompleto y Rutas de Imagen
CREATE OR ALTER VIEW dbo.vw_RegistroSociosConsultas
AS
SELECT
    rs.SOCIOID,
    rs.TipoPersona,
    rs.TipoIdentificacion,
    rs.Identificacion,
    rs.PrimerNombre,
    rs.SegundoNombre,
    rs.PrimerApellido,
    rs.SegundoApellido,
    rs.Apellidos,
    -- Concatenación de nombre completo para búsquedas y visualizaciones
    ISNULL(rs.PrimerNombre, '') + 
      CASE WHEN rs.SegundoNombre IS NOT NULL AND rs.SegundoNombre <> '' THEN ' ' + rs.SegundoNombre ELSE '' END +
      ' ' + ISNULL(rs.Apellidos, '') AS NombreCompleto,
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
    CASE WHEN ct.CroquisTrabajoID IS NOT NULL THEN 1 ELSE 0 END AS TieneCroquisTrabajo,
    -- Rutas de almacenamiento físico de imágenes
    sm.RutaImagen AS RutaImagenMapa,
    ct.RutaImagen AS RutaImagenCroquis
FROM dbo.RegistroSocios rs
LEFT JOIN dbo.SocioUbicacionMapa sm ON sm.SOCIOID = rs.SOCIOID
LEFT JOIN dbo.SocioCroquisTrabajo ct ON ct.SOCIOID = rs.SOCIOID
WHERE rs.Estado = 'ACTIVO';
GO
PRINT 'Vista dbo.vw_RegistroSociosConsultas recreada con NombreCompleto y rutas de imágenes.';
GO

-- 4. Recrear dbo.usp_GuardarMapaUbicacion con parámetro RutaImagen
CREATE OR ALTER PROCEDURE dbo.usp_GuardarMapaUbicacion
    @SOCIOID BIGINT,
    @ImagenMapa VARBINARY(MAX),
    @CoordenadaLat NVARCHAR(50),
    @CoordenadaLng NVARCHAR(50),
    @DireccionCapturada NVARCHAR(200),
    @RutaImagen NVARCHAR(250) = NULL
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
            RutaImagen = COALESCE(@RutaImagen, RutaImagen),
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
            DireccionCapturada,
            RutaImagen
        )
        VALUES (
            @SOCIOID,
            @ImagenMapa,
            @CoordenadaLat,
            @CoordenadaLng,
            @DireccionCapturada,
            @RutaImagen
        );
    END;
END;
GO
PRINT 'Procedimiento dbo.usp_GuardarMapaUbicacion actualizado.';
GO

-- 5. Recrear dbo.usp_GuardarCroquisTrabajo con parámetro RutaImagen
CREATE OR ALTER PROCEDURE dbo.usp_GuardarCroquisTrabajo
    @SOCIOID BIGINT,
    @ImagenCroquis VARBINARY(MAX),
    @Descripcion NVARCHAR(500),
    @RutaImagen NVARCHAR(250) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    IF EXISTS (SELECT 1 FROM dbo.SocioCroquisTrabajo WHERE SOCIOID = @SOCIOID)
    BEGIN
        UPDATE dbo.SocioCroquisTrabajo
        SET 
            ImagenCroquis = @ImagenCroquis,
            Descripcion = @Descripcion,
            RutaImagen = COALESCE(@RutaImagen, RutaImagen),
            FechaCaptura = SYSDATETIME()
        WHERE SOCIOID = @SOCIOID;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.SocioCroquisTrabajo (
            SOCIOID,
            ImagenCroquis,
            Descripcion,
            RutaImagen
        )
        VALUES (
            @SOCIOID,
            @ImagenCroquis,
            @Descripcion,
            @RutaImagen
        );
    END;
END;
GO
PRINT 'Procedimiento dbo.usp_GuardarCroquisTrabajo actualizado.';
GO
