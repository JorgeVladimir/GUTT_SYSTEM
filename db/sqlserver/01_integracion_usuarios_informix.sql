/*
  Integracion de usuarios Informix (bcausua) hacia SQL Server (SQLGUTPATATE)
  Base destino: SQLGUTPATATE
*/

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

USE SQLGUTPATATE;
GO

IF COL_LENGTH('dbo.Usuarios', 'OrigenSistema') IS NULL
    ALTER TABLE dbo.Usuarios ADD OrigenSistema NVARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'OrigenUsuarioId') IS NULL
    ALTER TABLE dbo.Usuarios ADD OrigenUsuarioId INT NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'CodigoEmpleado') IS NULL
    ALTER TABLE dbo.Usuarios ADD CodigoEmpleado INT NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'CodigoPerfil') IS NULL
    ALTER TABLE dbo.Usuarios ADD CodigoPerfil NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'PasswordHash') IS NULL
    ALTER TABLE dbo.Usuarios ADD PasswordHash NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'FechaUltimoAcceso') IS NULL
    ALTER TABLE dbo.Usuarios ADD FechaUltimoAcceso DATE NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'NumeroAgencia') IS NULL
    ALTER TABLE dbo.Usuarios ADD NumeroAgencia INT NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'BanderaUsuario') IS NULL
    ALTER TABLE dbo.Usuarios ADD BanderaUsuario INT NULL;
GO
IF COL_LENGTH('dbo.Usuarios', 'ImpresoraPredeterminada') IS NULL
    ALTER TABLE dbo.Usuarios ADD ImpresoraPredeterminada NVARCHAR(100) NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Usuarios_OrigenInformix'
      AND object_id = OBJECT_ID('dbo.Usuarios')
)
BEGIN
    CREATE UNIQUE INDEX UX_Usuarios_OrigenInformix
        ON dbo.Usuarios(OrigenSistema, OrigenUsuarioId)
        WHERE OrigenSistema IS NOT NULL AND OrigenUsuarioId IS NOT NULL;
END;
GO

IF OBJECT_ID('dbo.HomologacionPerfilInformix', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HomologacionPerfilInformix (
        CodigoPerfil CHAR(2) NOT NULL PRIMARY KEY,
        RolApp NVARCHAR(30) NOT NULL,
        Descripcion NVARCHAR(150) NULL,
        Activo BIT NOT NULL CONSTRAINT DF_HomologacionPerfilInformix_Activo DEFAULT(1)
    );
END;
GO

IF OBJECT_ID('dbo.Stg_Perfiles_Informix', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stg_Perfiles_Informix (
        perf_cod_perf CHAR(2) NOT NULL,
        perf_des_perf CHAR(20) NOT NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_Stg_Perfiles_Informix_FechaCarga DEFAULT(SYSDATETIME())
    );

    CREATE INDEX IX_Stg_Perfiles_Informix_CodigoPerfil ON dbo.Stg_Perfiles_Informix(perf_cod_perf);
END;
GO

IF OBJECT_ID('dbo.Stg_Usuarios_Informix', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Stg_Usuarios_Informix (
        usua_cod_usua INT NOT NULL,
        usua_cod_empl INT NOT NULL,
        usua_cod_perf CHAR(2) NOT NULL,
        usua_nom_usua CHAR(25) NOT NULL,
        usua_passwd CHAR(40) NULL,
        usua_fec_uac DATE NULL,
        usua_num_agen INT NULL,
        usua_ban_usua INT NULL,
        usua_imp_pred CHAR(100) NULL,
        FechaCarga DATETIME2(0) NOT NULL CONSTRAINT DF_Stg_Usuarios_Informix_FechaCarga DEFAULT(SYSDATETIME())
    );

    CREATE INDEX IX_Stg_Usuarios_Informix_CodigoUsuario ON dbo.Stg_Usuarios_Informix(usua_cod_usua);
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_MergePerfilesDesdeInformix
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Fuente AS (
        SELECT DISTINCT
            src.perf_cod_perf AS CodigoPerfil,
            LTRIM(RTRIM(src.perf_des_perf)) AS Descripcion,
            CASE
                WHEN src.perf_cod_perf = 'AD' THEN 'ADMIN'
                WHEN src.perf_cod_perf = 'CO' THEN 'ACCOUNTANT'
                WHEN src.perf_cod_perf = 'CJ' THEN 'TELLER'
                WHEN src.perf_cod_perf = 'CR' THEN 'CREDIT_OFFICER'
                ELSE 'MEMBER'
            END AS RolApp,
            CAST(1 AS BIT) AS Activo
        FROM dbo.Stg_Perfiles_Informix src
    )
    MERGE dbo.HomologacionPerfilInformix AS dest
    USING Fuente AS src
        ON dest.CodigoPerfil = src.CodigoPerfil
    WHEN MATCHED THEN
        UPDATE SET
            dest.Descripcion = src.Descripcion,
            dest.RolApp = src.RolApp,
            dest.Activo = src.Activo
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (CodigoPerfil, RolApp, Descripcion, Activo)
        VALUES (src.CodigoPerfil, src.RolApp, src.Descripcion, src.Activo);
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_MergeUsuariosDesdeInformix
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Fuente AS (
        SELECT
            CAST(src.usua_cod_usua AS NVARCHAR(20)) AS UsuarioId,
            LTRIM(RTRIM(src.usua_nom_usua)) AS NombreCompleto,
            COALESCE(NULLIF(LTRIM(RTRIM(src.usua_passwd)), ''), 'PENDIENTE') AS Pin,
            COALESCE(map.RolApp, 'MEMBER') AS Rol,
            NULL AS Email,
            NULL AS Telefono,
            NULL AS Direccion,
            src.usua_fec_uac AS FechaRegistro,
            CAST(0 AS BIT) AS RequiereCambioPin,
            CASE WHEN ISNULL(src.usua_ban_usua, 0) = 0 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS Activo,
            'INFORMIX_AFC' AS OrigenSistema,
            src.usua_cod_usua AS OrigenUsuarioId,
            src.usua_cod_empl AS CodigoEmpleado,
            src.usua_cod_perf AS CodigoPerfil,
            LTRIM(RTRIM(src.usua_passwd)) AS PasswordHash,
            src.usua_fec_uac AS FechaUltimoAcceso,
            src.usua_num_agen AS NumeroAgencia,
            src.usua_ban_usua AS BanderaUsuario,
            LTRIM(RTRIM(src.usua_imp_pred)) AS ImpresoraPredeterminada
        FROM dbo.Stg_Usuarios_Informix src
        LEFT JOIN dbo.HomologacionPerfilInformix map
            ON map.CodigoPerfil = src.usua_cod_perf
           AND map.Activo = 1
    )
    MERGE dbo.Usuarios AS dest
    USING Fuente AS src
        ON dest.OrigenSistema = src.OrigenSistema
       AND dest.OrigenUsuarioId = src.OrigenUsuarioId
    WHEN MATCHED THEN
        UPDATE SET
            dest.NombreCompleto = src.NombreCompleto,
            dest.Pin = src.Pin,
            dest.Rol = src.Rol,
            dest.FechaRegistro = src.FechaRegistro,
            dest.Activo = src.Activo,
            dest.CodigoEmpleado = src.CodigoEmpleado,
            dest.CodigoPerfil = src.CodigoPerfil,
            dest.PasswordHash = src.PasswordHash,
            dest.FechaUltimoAcceso = src.FechaUltimoAcceso,
            dest.NumeroAgencia = src.NumeroAgencia,
            dest.BanderaUsuario = src.BanderaUsuario,
            dest.ImpresoraPredeterminada = src.ImpresoraPredeterminada,
            dest.FechaActualizacion = SYSDATETIME()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (
            UsuarioId,
            NombreCompleto,
            Pin,
            Rol,
            Email,
            Telefono,
            Direccion,
            FechaRegistro,
            RequiereCambioPin,
            Activo,
            FechaCreacion,
            FechaActualizacion,
            OrigenSistema,
            OrigenUsuarioId,
            CodigoEmpleado,
            CodigoPerfil,
            PasswordHash,
            FechaUltimoAcceso,
            NumeroAgencia,
            BanderaUsuario,
            ImpresoraPredeterminada
        )
        VALUES (
            src.UsuarioId,
            src.NombreCompleto,
            src.Pin,
            src.Rol,
            src.Email,
            src.Telefono,
            src.Direccion,
            src.FechaRegistro,
            src.RequiereCambioPin,
            src.Activo,
            SYSDATETIME(),
            SYSDATETIME(),
            src.OrigenSistema,
            src.OrigenUsuarioId,
            src.CodigoEmpleado,
            src.CodigoPerfil,
            src.PasswordHash,
            src.FechaUltimoAcceso,
            src.NumeroAgencia,
            src.BanderaUsuario,
            src.ImpresoraPredeterminada
        );
END;
GO

CREATE OR ALTER VIEW dbo.vw_UsuariosInformixParaApp
AS
SELECT
    UsuarioId,
    NombreCompleto,
    Rol,
    Activo,
    FechaRegistro,
    OrigenUsuarioId,
    CodigoEmpleado,
    CodigoPerfil,
    FechaUltimoAcceso,
    NumeroAgencia,
    ImpresoraPredeterminada
FROM dbo.Usuarios
WHERE OrigenSistema = 'INFORMIX_AFC';
GO

/*
Consulta de extraccion sugerida en Informix:
SELECT
    usua_cod_usua,
    usua_cod_empl,
    usua_cod_perf,
    usua_nom_usua,
    usua_passwd,
    usua_fec_uac,
    usua_num_agen,
    usua_ban_usua,
    usua_imp_pred
FROM afccajapatate:bcausua;

SELECT
    perf_cod_perf,
    perf_des_perf
FROM afccajapatate:bcaperf;
*/
