/*
  Integracion de clientes Informix (bcaclie) hacia SQL Server (SQLGUTPATATE)
  Base destino: SQLGUTPATATE
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE SQLGUTPATATE;
GO

IF OBJECT_ID('dbo.ClientesInformix', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ClientesInformix (
        ClienteInformixId BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        OrigenSistema NVARCHAR(30) NOT NULL,
        OrigenClienteId INT NOT NULL,
        CodigoTipoCliente INT NULL,
        NumeroCliente INT NULL,
        CodigoOficina INT NULL,
        CodigoTipoIdentificacion CHAR(1) NULL,
        Identificacion NVARCHAR(13) NULL,
        Apellidos NVARCHAR(60) NULL,
        Nombres NVARCHAR(30) NULL,
        NombreCompleto NVARCHAR(120) NOT NULL,
        FechaNacimiento DATE NULL,
        CodigoSector INT NULL,
        DireccionDomicilio NVARCHAR(55) NULL,
        FechaUltimaActualizacion DATETIME2(0) NULL,
        FechaIngreso DATETIME2(0) NULL,
        FechaSalida DATE NULL,
        Email NVARCHAR(80) NULL,
        NaturalezaJuridica SMALLINT NULL,
        EstadoCliente SMALLINT NULL,
        CodigoCalificacion INT NULL,
        RepresentanteLegal NVARCHAR(50) NULL,
        IdentificacionRepresentante NVARCHAR(13) NULL,
        TipoIdentificacionRepresentante CHAR(1) NULL,
        CodigoPais INT NULL,
        CodigoUsuario INT NULL,
        CodigoOficinaTrabajo INT NULL,
        ReferenciaDireccion NVARCHAR(100) NULL,
        CodigoCocu INT NULL,
        EstadoAdicional SMALLINT NULL,
        CodigoDiscapacidad SMALLINT NULL,
        CodigoTipoVivienda INT NULL,
        ValorVivienda DECIMAL(15,2) NULL,
        NumeroCargas SMALLINT NULL,
        CodigoTipoCargaSocio INT NULL,
        CodigoAuid INT NULL,
        FechaAsamblea DATE NULL,
        CodigoProfesion INT NULL,
        BanderaPeps SMALLINT NULL,
        CodigoTipoVinculacion INT NULL,
        BanderaGrupo SMALLINT NULL,
        CodigoGrupo INT NULL,
        CodigoTipoResidencia INT NULL,
        PaisResidencia INT NULL,
        BanderaPdpe SMALLINT NULL,
        HuellaDactilar NVARCHAR(10) NULL,
        FechaCreacion DATETIME2(0) NOT NULL CONSTRAINT DF_ClientesInformix_FechaCreacion DEFAULT(SYSDATETIME()),
        FechaActualizacion DATETIME2(0) NOT NULL CONSTRAINT DF_ClientesInformix_FechaActualizacion DEFAULT(SYSDATETIME())
    );
END;
GO

IF COL_LENGTH('dbo.ClientesInformix', 'CodigoTipoCliente') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoTipoCliente INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'NumeroCliente') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD NumeroCliente INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoOficina') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoOficina INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoTipoIdentificacion') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoTipoIdentificacion CHAR(1) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'Identificacion') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD Identificacion NVARCHAR(13) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'Apellidos') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD Apellidos NVARCHAR(60) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'Nombres') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD Nombres NVARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoSector') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoSector INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'DireccionDomicilio') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD DireccionDomicilio NVARCHAR(55) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'FechaUltimaActualizacion') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD FechaUltimaActualizacion DATETIME2(0) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'FechaIngreso') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD FechaIngreso DATETIME2(0) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'FechaSalida') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD FechaSalida DATE NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'Email') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD Email NVARCHAR(80) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'NaturalezaJuridica') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD NaturalezaJuridica SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoCalificacion') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoCalificacion INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'RepresentanteLegal') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD RepresentanteLegal NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'IdentificacionRepresentante') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD IdentificacionRepresentante NVARCHAR(13) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'TipoIdentificacionRepresentante') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD TipoIdentificacionRepresentante CHAR(1) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoPais') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoPais INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoUsuario') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoUsuario INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoOficinaTrabajo') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoOficinaTrabajo INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'ReferenciaDireccion') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD ReferenciaDireccion NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoCocu') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoCocu INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'EstadoAdicional') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD EstadoAdicional SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoDiscapacidad') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoDiscapacidad SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoTipoVivienda') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoTipoVivienda INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'ValorVivienda') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD ValorVivienda DECIMAL(15,2) NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'NumeroCargas') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD NumeroCargas SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoTipoCargaSocio') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoTipoCargaSocio INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoAuid') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoAuid INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'FechaAsamblea') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD FechaAsamblea DATE NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoProfesion') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoProfesion INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'BanderaPeps') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD BanderaPeps SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoTipoVinculacion') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoTipoVinculacion INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'BanderaGrupo') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD BanderaGrupo SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoGrupo') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoGrupo INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'CodigoTipoResidencia') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD CodigoTipoResidencia INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'PaisResidencia') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD PaisResidencia INT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'BanderaPdpe') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD BanderaPdpe SMALLINT NULL;
GO
IF COL_LENGTH('dbo.ClientesInformix', 'HuellaDactilar') IS NULL
    ALTER TABLE dbo.ClientesInformix ADD HuellaDactilar NVARCHAR(10) NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_ClientesInformix_Origen'
      AND object_id = OBJECT_ID('dbo.ClientesInformix')
)
BEGIN
    CREATE UNIQUE INDEX UX_ClientesInformix_Origen
        ON dbo.ClientesInformix(OrigenSistema, OrigenClienteId);
END;
GO

IF OBJECT_ID('dbo.Stg_Clientes_Informix', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stg_Clientes_Informix (
        clie_cod_clie INT NOT NULL,
        clie_cod_tcli INT NULL,
        clie_num_clie INT NULL,
        clie_cod_ofic INT NULL,
        clie_cod_tide CHAR(1) NULL,
        clie_ide_clie CHAR(13) NULL,
        clie_ape_clie CHAR(60) NULL,
        clie_nom_clie CHAR(30) NULL,
        clie_fec_nac DATE NULL,
        clie_cod_sect INT NULL,
        clie_dir_domi CHAR(55) NULL,
        clie_fec_uac DATETIME2(0) NULL,
        clie_fec_ingr DATETIME2(0) NULL,
        clie_fec_sali DATE NULL,
        clie_ema_clie CHAR(80) NULL,
        clie_nat_juri SMALLINT NULL,
        clie_est_clie SMALLINT NULL,
        clie_cal_clie INT NULL,
        clie_rep_lega VARCHAR(50) NULL,
        clie_ide_repr CHAR(13) NULL,
        clie_tide_repr CHAR(1) NULL,
        clie_cod_pais INT NULL,
        clie_cod_usua INT NULL,
        clie_cod_ofct INT NULL,
        clie_ref_dire CHAR(100) NULL,
        clie_cod_cocu INT NULL,
        clie_est_adic SMALLINT NULL,
        clie_cod_disc SMALLINT NULL,
        clie_cod_tviv INT NULL,
        clie_val_vivi DECIMAL(15,2) NULL,
        clie_num_carg SMALLINT NULL,
        clie_cod_tcsr INT NULL,
        clie_cod_auid INT NULL,
        clie_fec_asan DATE NULL,
        clie_cod_prof INT NULL,
        clie_ban_peps SMALLINT NULL,
        clie_cod_tvin INT NULL,
        clie_ban_grup SMALLINT NULL,
        clie_cod_grup INT NULL,
        clie_cod_tres INT NULL,
        clie_pai_resi INT NULL,
        clie_ban_pdpe SMALLINT NULL,
        clie_hue_dact CHAR(10) NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_Stg_Clientes_Informix_FechaCarga DEFAULT(SYSDATETIME())
    );

    CREATE INDEX IX_Stg_Clientes_Informix_CodigoCliente ON dbo.Stg_Clientes_Informix(clie_cod_clie);
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_MergeClientesDesdeInformix
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Fuente AS (
        SELECT
            src.clie_cod_clie AS OrigenClienteId,
            src.clie_cod_tcli AS CodigoTipoCliente,
            src.clie_num_clie AS NumeroCliente,
            src.clie_cod_ofic AS CodigoOficina,
            NULLIF(LTRIM(RTRIM(src.clie_cod_tide)), '') AS CodigoTipoIdentificacion,
            NULLIF(LTRIM(RTRIM(src.clie_ide_clie)), '') AS Identificacion,
            NULLIF(LTRIM(RTRIM(src.clie_ape_clie)), '') AS Apellidos,
            NULLIF(LTRIM(RTRIM(src.clie_nom_clie)), '') AS Nombres,
            COALESCE(
                NULLIF(LTRIM(RTRIM(CONCAT(src.clie_ape_clie, ' ', src.clie_nom_clie))), ''),
                NULLIF(LTRIM(RTRIM(src.clie_ide_clie)), ''),
                CAST(src.clie_cod_clie AS NVARCHAR(30))
            ) AS NombreCompleto,
            src.clie_fec_nac AS FechaNacimiento,
            src.clie_cod_sect AS CodigoSector,
            NULLIF(LTRIM(RTRIM(src.clie_dir_domi)), '') AS DireccionDomicilio,
            src.clie_fec_uac AS FechaUltimaActualizacion,
            src.clie_fec_ingr AS FechaIngreso,
            src.clie_fec_sali AS FechaSalida,
            NULLIF(LTRIM(RTRIM(src.clie_ema_clie)), '') AS Email,
            src.clie_nat_juri AS NaturalezaJuridica,
            src.clie_est_clie AS EstadoCliente,
            src.clie_cal_clie AS CodigoCalificacion,
            NULLIF(LTRIM(RTRIM(src.clie_rep_lega)), '') AS RepresentanteLegal,
            NULLIF(LTRIM(RTRIM(src.clie_ide_repr)), '') AS IdentificacionRepresentante,
            NULLIF(LTRIM(RTRIM(src.clie_tide_repr)), '') AS TipoIdentificacionRepresentante,
            src.clie_cod_pais AS CodigoPais,
            src.clie_cod_usua AS CodigoUsuario,
            src.clie_cod_ofct AS CodigoOficinaTrabajo,
            NULLIF(LTRIM(RTRIM(src.clie_ref_dire)), '') AS ReferenciaDireccion,
            src.clie_cod_cocu AS CodigoCocu,
            src.clie_est_adic AS EstadoAdicional,
            src.clie_cod_disc AS CodigoDiscapacidad,
            src.clie_cod_tviv AS CodigoTipoVivienda,
            src.clie_val_vivi AS ValorVivienda,
            src.clie_num_carg AS NumeroCargas,
            src.clie_cod_tcsr AS CodigoTipoCargaSocio,
            src.clie_cod_auid AS CodigoAuid,
            src.clie_fec_asan AS FechaAsamblea,
            src.clie_cod_prof AS CodigoProfesion,
            src.clie_ban_peps AS BanderaPeps,
            src.clie_cod_tvin AS CodigoTipoVinculacion,
            src.clie_ban_grup AS BanderaGrupo,
            src.clie_cod_grup AS CodigoGrupo,
            src.clie_cod_tres AS CodigoTipoResidencia,
            src.clie_pai_resi AS PaisResidencia,
            src.clie_ban_pdpe AS BanderaPdpe,
            NULLIF(LTRIM(RTRIM(src.clie_hue_dact)), '') AS HuellaDactilar
        FROM dbo.Stg_Clientes_Informix src
    )
    MERGE dbo.ClientesInformix AS dest
    USING Fuente AS src
        ON dest.OrigenSistema = 'INFORMIX_AFC'
       AND dest.OrigenClienteId = src.OrigenClienteId
    WHEN MATCHED THEN
        UPDATE SET
            dest.CodigoTipoCliente = src.CodigoTipoCliente,
            dest.NumeroCliente = src.NumeroCliente,
            dest.CodigoOficina = src.CodigoOficina,
            dest.CodigoTipoIdentificacion = src.CodigoTipoIdentificacion,
            dest.Identificacion = src.Identificacion,
            dest.Apellidos = src.Apellidos,
            dest.Nombres = src.Nombres,
            dest.NombreCompleto = src.NombreCompleto,
            dest.FechaNacimiento = src.FechaNacimiento,
            dest.CodigoSector = src.CodigoSector,
            dest.DireccionDomicilio = src.DireccionDomicilio,
            dest.FechaUltimaActualizacion = src.FechaUltimaActualizacion,
            dest.FechaIngreso = src.FechaIngreso,
            dest.FechaSalida = src.FechaSalida,
            dest.Email = src.Email,
            dest.NaturalezaJuridica = src.NaturalezaJuridica,
            dest.EstadoCliente = src.EstadoCliente,
            dest.CodigoCalificacion = src.CodigoCalificacion,
            dest.RepresentanteLegal = src.RepresentanteLegal,
            dest.IdentificacionRepresentante = src.IdentificacionRepresentante,
            dest.TipoIdentificacionRepresentante = src.TipoIdentificacionRepresentante,
            dest.CodigoPais = src.CodigoPais,
            dest.CodigoUsuario = src.CodigoUsuario,
            dest.CodigoOficinaTrabajo = src.CodigoOficinaTrabajo,
            dest.ReferenciaDireccion = src.ReferenciaDireccion,
            dest.CodigoCocu = src.CodigoCocu,
            dest.EstadoAdicional = src.EstadoAdicional,
            dest.CodigoDiscapacidad = src.CodigoDiscapacidad,
            dest.CodigoTipoVivienda = src.CodigoTipoVivienda,
            dest.ValorVivienda = src.ValorVivienda,
            dest.NumeroCargas = src.NumeroCargas,
            dest.CodigoTipoCargaSocio = src.CodigoTipoCargaSocio,
            dest.CodigoAuid = src.CodigoAuid,
            dest.FechaAsamblea = src.FechaAsamblea,
            dest.CodigoProfesion = src.CodigoProfesion,
            dest.BanderaPeps = src.BanderaPeps,
            dest.CodigoTipoVinculacion = src.CodigoTipoVinculacion,
            dest.BanderaGrupo = src.BanderaGrupo,
            dest.CodigoGrupo = src.CodigoGrupo,
            dest.CodigoTipoResidencia = src.CodigoTipoResidencia,
            dest.PaisResidencia = src.PaisResidencia,
            dest.BanderaPdpe = src.BanderaPdpe,
            dest.HuellaDactilar = src.HuellaDactilar,
            dest.FechaActualizacion = SYSDATETIME()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
            OrigenSistema,
            OrigenClienteId,
            CodigoTipoCliente,
            NumeroCliente,
            CodigoOficina,
            CodigoTipoIdentificacion,
            Identificacion,
            Apellidos,
            Nombres,
            NombreCompleto,
            FechaNacimiento,
            CodigoSector,
            DireccionDomicilio,
            FechaUltimaActualizacion,
            FechaIngreso,
            FechaSalida,
            Email,
            NaturalezaJuridica,
            EstadoCliente,
            CodigoCalificacion,
            RepresentanteLegal,
            IdentificacionRepresentante,
            TipoIdentificacionRepresentante,
            CodigoPais,
            CodigoUsuario,
            CodigoOficinaTrabajo,
            ReferenciaDireccion,
            CodigoCocu,
            EstadoAdicional,
            CodigoDiscapacidad,
            CodigoTipoVivienda,
            ValorVivienda,
            NumeroCargas,
            CodigoTipoCargaSocio,
            CodigoAuid,
            FechaAsamblea,
            CodigoProfesion,
            BanderaPeps,
            CodigoTipoVinculacion,
            BanderaGrupo,
            CodigoGrupo,
            CodigoTipoResidencia,
            PaisResidencia,
            BanderaPdpe,
            HuellaDactilar,
            FechaCreacion,
            FechaActualizacion
        )
        VALUES (
            'INFORMIX_AFC',
            src.OrigenClienteId,
            src.CodigoTipoCliente,
            src.NumeroCliente,
            src.CodigoOficina,
            src.CodigoTipoIdentificacion,
            src.Identificacion,
            src.Apellidos,
            src.Nombres,
            src.NombreCompleto,
            src.FechaNacimiento,
            src.CodigoSector,
            src.DireccionDomicilio,
            src.FechaUltimaActualizacion,
            src.FechaIngreso,
            src.FechaSalida,
            src.Email,
            src.NaturalezaJuridica,
            src.EstadoCliente,
            src.CodigoCalificacion,
            src.RepresentanteLegal,
            src.IdentificacionRepresentante,
            src.TipoIdentificacionRepresentante,
            src.CodigoPais,
            src.CodigoUsuario,
            src.CodigoOficinaTrabajo,
            src.ReferenciaDireccion,
            src.CodigoCocu,
            src.EstadoAdicional,
            src.CodigoDiscapacidad,
            src.CodigoTipoVivienda,
            src.ValorVivienda,
            src.NumeroCargas,
            src.CodigoTipoCargaSocio,
            src.CodigoAuid,
            src.FechaAsamblea,
            src.CodigoProfesion,
            src.BanderaPeps,
            src.CodigoTipoVinculacion,
            src.BanderaGrupo,
            src.CodigoGrupo,
            src.CodigoTipoResidencia,
            src.PaisResidencia,
            src.BanderaPdpe,
            src.HuellaDactilar,
            SYSDATETIME(),
            SYSDATETIME()
        );
END;
GO

CREATE OR ALTER VIEW dbo.vw_ClientesInformixParaApp
AS
SELECT
    ClienteInformixId,
    OrigenSistema,
    OrigenClienteId,
    CodigoTipoCliente,
    NumeroCliente,
    CodigoOficina,
    CodigoTipoIdentificacion,
    Identificacion,
    Apellidos,
    Nombres,
    NombreCompleto,
    FechaNacimiento,
    CodigoSector,
    DireccionDomicilio,
    FechaUltimaActualizacion,
    FechaIngreso,
    FechaSalida,
    Email,
    NaturalezaJuridica,
    EstadoCliente,
    CodigoCalificacion,
    RepresentanteLegal,
    IdentificacionRepresentante,
    TipoIdentificacionRepresentante,
    CodigoPais,
    CodigoUsuario,
    CodigoOficinaTrabajo,
    ReferenciaDireccion,
    CodigoCocu,
    EstadoAdicional,
    CodigoDiscapacidad,
    CodigoTipoVivienda,
    ValorVivienda,
    NumeroCargas,
    CodigoTipoCargaSocio,
    CodigoAuid,
    FechaAsamblea,
    CodigoProfesion,
    BanderaPeps,
    CodigoTipoVinculacion,
    BanderaGrupo,
    CodigoGrupo,
    CodigoTipoResidencia,
    PaisResidencia,
    BanderaPdpe,
    HuellaDactilar,
    FechaCreacion,
    FechaActualizacion
FROM dbo.ClientesInformix
WHERE OrigenSistema = 'INFORMIX_AFC';
GO

/*
Consulta de extraccion sugerida en Informix:
SELECT
    clie_cod_clie,
    clie_cod_tcli,
    clie_num_clie,
    clie_cod_ofic,
    clie_cod_tide,
    clie_ide_clie,
    clie_ape_clie,
    clie_nom_clie,
    clie_fec_nac,
    clie_cod_sect,
    clie_dir_domi,
    clie_fec_uac,
    clie_fec_ingr,
    clie_fec_sali,
    clie_ema_clie,
    clie_nat_juri,
    clie_est_clie
FROM afccajapatate:bcaclie;
*/
