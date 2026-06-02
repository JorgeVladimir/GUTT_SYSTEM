USE SQLGUTPATATE;
GO

TRUNCATE TABLE dbo.Stg_Usuarios_Informix;
GO

IF OBJECT_ID('tempdb..#UsuariosRaw') IS NOT NULL
    DROP TABLE #UsuariosRaw;

CREATE TABLE #UsuariosRaw (
    usua_cod_usua_raw NVARCHAR(50) NULL,
    usua_cod_empl_raw NVARCHAR(50) NULL,
    usua_cod_perf_raw NVARCHAR(50) NULL,
    usua_nom_usua_raw NVARCHAR(200) NULL,
    usua_passwd_raw NVARCHAR(200) NULL,
    usua_fec_uac_raw NVARCHAR(50) NULL,
    usua_num_agen_raw NVARCHAR(50) NULL,
    usua_ban_usua_raw NVARCHAR(50) NULL,
    usua_imp_pred_raw NVARCHAR(500) NULL
);

BULK INSERT #UsuariosRaw
FROM 'C:\Migracion\bcausua.csv'
WITH (
    FIRSTROW = 2,
    FIELDTERMINATOR = ',',
    ROWTERMINATOR = '\n',
    CODEPAGE = '65001',
    TABLOCK,
    KEEPNULLS
);

INSERT INTO dbo.Stg_Usuarios_Informix (
    usua_cod_usua,
    usua_cod_empl,
    usua_cod_perf,
    usua_nom_usua,
    usua_passwd,
    usua_fec_uac,
    usua_num_agen,
    usua_ban_usua,
    usua_imp_pred
)
SELECT
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(usua_cod_usua_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(usua_cod_empl_raw)), '"', '')),
    LEFT(REPLACE(LTRIM(RTRIM(usua_cod_perf_raw)), '"', ''), 2),
    LEFT(REPLACE(LTRIM(RTRIM(usua_nom_usua_raw)), '"', ''), 25),
    LEFT(REPLACE(LTRIM(RTRIM(usua_passwd_raw)), '"', ''), 40),
    TRY_CONVERT(DATE, REPLACE(LTRIM(RTRIM(usua_fec_uac_raw)), '"', ''), 23),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(usua_num_agen_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(usua_ban_usua_raw)), '"', '')),
    LEFT(REPLACE(LTRIM(RTRIM(usua_imp_pred_raw)), '"', ''), 100)
FROM #UsuariosRaw
WHERE TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(usua_cod_usua_raw)), '"', '')) IS NOT NULL
  AND TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(usua_cod_empl_raw)), '"', '')) IS NOT NULL;

DROP TABLE #UsuariosRaw;
GO

EXEC dbo.usp_MergeUsuariosDesdeInformix;
GO

SELECT *
FROM dbo.vw_UsuariosInformixParaApp
ORDER BY OrigenUsuarioId;
GO
