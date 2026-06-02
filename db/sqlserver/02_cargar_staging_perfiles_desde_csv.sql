USE SQLGUTPATATE;
GO

TRUNCATE TABLE dbo.Stg_Perfiles_Informix;
GO

IF OBJECT_ID('tempdb..#PerfilesRaw') IS NOT NULL
    DROP TABLE #PerfilesRaw;

CREATE TABLE #PerfilesRaw (
    perf_cod_perf_raw NVARCHAR(20) NULL,
    perf_des_perf_raw NVARCHAR(200) NULL
);

BULK INSERT #PerfilesRaw
FROM 'C:\Migracion\bcaperf.csv'
WITH (
    FIRSTROW = 2,
    FIELDTERMINATOR = ',',
    ROWTERMINATOR = '\n',
    CODEPAGE = '65001',
    TABLOCK,
    KEEPNULLS
);

INSERT INTO dbo.Stg_Perfiles_Informix (perf_cod_perf, perf_des_perf)
SELECT
    LEFT(REPLACE(LTRIM(RTRIM(perf_cod_perf_raw)), '"', ''), 2) AS perf_cod_perf,
    LEFT(REPLACE(LTRIM(RTRIM(perf_des_perf_raw)), '"', ''), 20) AS perf_des_perf
FROM #PerfilesRaw
WHERE NULLIF(LTRIM(RTRIM(perf_cod_perf_raw)), '') IS NOT NULL;

DROP TABLE #PerfilesRaw;
GO

EXEC dbo.usp_MergePerfilesDesdeInformix;
GO

SELECT *
FROM dbo.HomologacionPerfilInformix
ORDER BY CodigoPerfil;
GO
