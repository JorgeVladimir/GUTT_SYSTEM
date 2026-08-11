-- 02_socios.sql
-- Base: GUTT_SYSTEM
-- Reestructura RegistroSocios (SQLGUTPATATE) en un núcleo delgado + tablas hijas.
-- ReferenciasPersonales/CargasFamiliares dejan de ser JSON en NVARCHAR(MAX) y pasan
-- a filas reales, consultables y auditables.
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE GUTT_SYSTEM;
GO

IF OBJECT_ID('dbo.Socios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Socios (
        SocioId             BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CooperativaId       INT NOT NULL CONSTRAINT FK_Socios_Cooperativa FOREIGN KEY REFERENCES dbo.Cooperativas(CooperativaId),
        TipoPersona          NVARCHAR(20)  NOT NULL, -- SOCIO, CLIENTE, CLIENTE_EXTERNO
        TipoIdentificacion   NVARCHAR(20)  NOT NULL, -- CÉDULA, PASAPORTE
        Identificacion       NVARCHAR(20)  NOT NULL,
        PrimerNombre         NVARCHAR(50)  NOT NULL,
        SegundoNombre        NVARCHAR(50)  NULL,
        PrimerApellido       NVARCHAR(50)  NOT NULL,
        SegundoApellido      NVARCHAR(50)  NULL,
        SoloUnNombre         BIT           NOT NULL CONSTRAINT DF_Socios_SoloUnNombre DEFAULT(0),
        SoloUnApellido       BIT           NOT NULL CONSTRAINT DF_Socios_SoloUnApellido DEFAULT(0),
        Email                NVARCHAR(100) NULL,
        Telefono             NVARCHAR(20)  NULL,
        Telefonos            NVARCHAR(200) NULL,
        FechaNacimiento      DATE          NULL,
        EstadoCivil          NVARCHAR(20)  NULL,
        PIN                  NVARCHAR(4)   NOT NULL,
        Etnia                NVARCHAR(20)  NULL,
        Genero               NVARCHAR(20)  NULL,
        Autoidentificacion   NVARCHAR(100) NULL,
        NivelInstruccion     NVARCHAR(50)  NULL,
        Profesion            NVARCHAR(100) NULL,
        Discapacidad         BIT           NOT NULL CONSTRAINT DF_Socios_Discapacidad DEFAULT(0),
        PEPS                 BIT           NOT NULL CONSTRAINT DF_Socios_PEPS DEFAULT(0), -- Persona Expuesta Políticamente (UAFE/AML)
        ConsentimientoDatos  BIT           NOT NULL CONSTRAINT DF_Socios_ConsentimientoDatos DEFAULT(0),
        PatrimonioIngresos   NVARCHAR(MAX) NULL, -- ver nota en README de este módulo: candidato a normalizar en fase 2
        NumeroSocio          NVARCHAR(20)  NULL,
        FechaRegistro        DATETIME2(0)  NOT NULL CONSTRAINT DF_Socios_FechaRegistro DEFAULT(SYSDATETIME()),
        UsuarioRegistroId    NVARCHAR(20)  NULL CONSTRAINT FK_Socios_UsuarioRegistro FOREIGN KEY REFERENCES dbo.Usuarios(UsuarioId),
        Estado               NVARCHAR(20)  NOT NULL CONSTRAINT DF_Socios_Estado DEFAULT('ACTIVO'),
        CONSTRAINT UQ_Socios_Cooperativa_Identificacion UNIQUE (CooperativaId, Identificacion)
    );
    PRINT 'Tabla dbo.Socios creada.';
END
ELSE
    PRINT 'Tabla dbo.Socios ya existe.';
GO

-- Secuencia para número de socio (mismo patrón que Seq_NumeroSocio en SQLGUTPATATE)
IF OBJECT_ID('Seq_NumeroSocio', 'SO') IS NULL
    CREATE SEQUENCE Seq_NumeroSocio START WITH 1000 INCREMENT BY 1;
GO

-- Ubicación y datos laborales — 1:1 con Socios (antes columnas sueltas en RegistroSocios)
IF OBJECT_ID('dbo.SocioDireccion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioDireccion (
        SocioId              BIGINT NOT NULL PRIMARY KEY CONSTRAINT FK_SocioDireccion_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId) ON DELETE CASCADE,
        PaisNacimiento       NVARCHAR(50)  NULL,
        ProvinciaNacimiento  NVARCHAR(50)  NULL,
        CantonNacimiento     NVARCHAR(50)  NULL,
        ParroquiaNacimiento  NVARCHAR(50)  NULL,
        PaisResidencia       NVARCHAR(50)  NULL,
        ProvinciaResidencia  NVARCHAR(50)  NULL,
        CantonResidencia     NVARCHAR(50)  NULL,
        ParroquiaResidencia  NVARCHAR(50)  NULL,
        DireccionDomicilio   NVARCHAR(200) NULL,
        LugarTrabajo         NVARCHAR(200) NULL,
        ProvinciaTrabajo     NVARCHAR(50)  NULL,
        CantonTrabajo        NVARCHAR(50)  NULL,
        ParroquiaTrabajo     NVARCHAR(50)  NULL,
        TipoVivienda         NVARCHAR(100) NULL,
        ValorVivienda        DECIMAL(18,2) NULL
    );
    PRINT 'Tabla dbo.SocioDireccion creada.';
END
ELSE
    PRINT 'Tabla dbo.SocioDireccion ya existe.';
GO

IF OBJECT_ID('dbo.SocioConyuge', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioConyuge (
        SocioId          BIGINT NOT NULL PRIMARY KEY CONSTRAINT FK_SocioConyuge_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId) ON DELETE CASCADE,
        CedulaConyuge    NVARCHAR(20)  NULL,
        NombreConyuge    NVARCHAR(150) NULL,
        TelefonoConyuge  NVARCHAR(20)  NULL
    );
    PRINT 'Tabla dbo.SocioConyuge creada.';
END
ELSE
    PRINT 'Tabla dbo.SocioConyuge ya existe.';
GO

-- Referencias personales — antes NVARCHAR(MAX) JSON en RegistroSocios.ReferenciasPersonales
IF OBJECT_ID('dbo.SocioReferencia', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioReferencia (
        ReferenciaId  INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SocioId       BIGINT NOT NULL CONSTRAINT FK_SocioReferencia_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId) ON DELETE CASCADE,
        Nombre        NVARCHAR(150) NOT NULL,
        Telefono      NVARCHAR(20)  NULL,
        Relacion      NVARCHAR(50)  NULL
    );
    PRINT 'Tabla dbo.SocioReferencia creada.';
END
ELSE
    PRINT 'Tabla dbo.SocioReferencia ya existe.';
GO

-- Cargas familiares — antes NVARCHAR(MAX) JSON en RegistroSocios.CargasFamiliares
IF OBJECT_ID('dbo.SocioCarga', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioCarga (
        CargaId     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SocioId     BIGINT NOT NULL CONSTRAINT FK_SocioCarga_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId) ON DELETE CASCADE,
        Nombre      NVARCHAR(150) NOT NULL,
        Parentesco  NVARCHAR(50)  NULL,
        Edad        INT           NULL
    );
    PRINT 'Tabla dbo.SocioCarga creada.';
END
ELSE
    PRINT 'Tabla dbo.SocioCarga ya existe.';
GO

-- Mapa de ubicación y croquis — sin cambios de fondo respecto a SQLGUTPATATE
IF OBJECT_ID('dbo.SocioUbicacionMapa', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioUbicacionMapa (
        UbicacionMapaID     BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SocioId             BIGINT NOT NULL CONSTRAINT FK_SocioUbicacionMapa_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId) ON DELETE CASCADE,
        ImagenMapa          VARBINARY(MAX) NULL,
        CoordenadaLat       NVARCHAR(50) NULL,
        CoordenadaLng       NVARCHAR(50) NULL,
        DireccionCapturada  NVARCHAR(200) NULL,
        FechaCaptura        DATETIME2(0) NOT NULL CONSTRAINT DF_SocioUbicacionMapa_FechaCaptura DEFAULT(SYSDATETIME())
    );
    PRINT 'Tabla dbo.SocioUbicacionMapa creada.';
END
ELSE
    PRINT 'Tabla dbo.SocioUbicacionMapa ya existe.';
GO

IF OBJECT_ID('dbo.SocioCroquisTrabajo', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SocioCroquisTrabajo (
        CroquisTrabajoID  BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        SocioId           BIGINT NOT NULL CONSTRAINT FK_SocioCroquisTrabajo_Socio FOREIGN KEY REFERENCES dbo.Socios(SocioId) ON DELETE CASCADE,
        ImagenCroquis     VARBINARY(MAX) NULL,
        Descripcion       NVARCHAR(500) NULL,
        FechaCaptura      DATETIME2(0) NOT NULL CONSTRAINT DF_SocioCroquisTrabajo_FechaCaptura DEFAULT(SYSDATETIME())
    );
    PRINT 'Tabla dbo.SocioCroquisTrabajo creada.';
END
ELSE
    PRINT 'Tabla dbo.SocioCroquisTrabajo ya existe.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Socios_TipoPersona' AND object_id = OBJECT_ID('dbo.Socios'))
    CREATE INDEX IX_Socios_TipoPersona ON dbo.Socios(TipoPersona);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Socios_Cooperativa' AND object_id = OBJECT_ID('dbo.Socios'))
    CREATE INDEX IX_Socios_Cooperativa ON dbo.Socios(CooperativaId);
GO

PRINT '=== 02_socios.sql completado. ===';
GO
