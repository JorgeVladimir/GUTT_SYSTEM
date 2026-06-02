USE SQLGUTPATATE;
GO

TRUNCATE TABLE dbo.Stg_Clientes_Informix;
GO

IF OBJECT_ID('tempdb..#ClientesRaw') IS NOT NULL
    DROP TABLE #ClientesRaw;

CREATE TABLE #ClientesRaw (
    clie_cod_clie_raw NVARCHAR(50) NULL,
    clie_cod_tcli_raw NVARCHAR(50) NULL,
    clie_num_clie_raw NVARCHAR(50) NULL,
    clie_cod_ofic_raw NVARCHAR(50) NULL,
    clie_cod_tide_raw NVARCHAR(50) NULL,
    clie_ide_clie_raw NVARCHAR(100) NULL,
    clie_ape_clie_raw NVARCHAR(200) NULL,
    clie_nom_clie_raw NVARCHAR(100) NULL,
    clie_fec_nac_raw NVARCHAR(50) NULL,
    clie_cod_sect_raw NVARCHAR(50) NULL,
    clie_dir_domi_raw NVARCHAR(300) NULL,
    clie_fec_uac_raw NVARCHAR(80) NULL,
    clie_fec_ingr_raw NVARCHAR(80) NULL,
    clie_fec_sali_raw NVARCHAR(50) NULL,
    clie_ema_clie_raw NVARCHAR(150) NULL,
    clie_nat_juri_raw NVARCHAR(50) NULL,
    clie_est_clie_raw NVARCHAR(50) NULL,
    clie_cal_clie_raw NVARCHAR(50) NULL,
    clie_rep_lega_raw NVARCHAR(200) NULL,
    clie_ide_repr_raw NVARCHAR(100) NULL,
    clie_tide_repr_raw NVARCHAR(50) NULL,
    clie_cod_pais_raw NVARCHAR(50) NULL,
    clie_cod_usua_raw NVARCHAR(50) NULL,
    clie_cod_ofct_raw NVARCHAR(50) NULL,
    clie_ref_dire_raw NVARCHAR(300) NULL,
    clie_cod_cocu_raw NVARCHAR(50) NULL,
    clie_est_adic_raw NVARCHAR(50) NULL,
    clie_cod_disc_raw NVARCHAR(50) NULL,
    clie_cod_tviv_raw NVARCHAR(50) NULL,
    clie_val_vivi_raw NVARCHAR(80) NULL,
    clie_num_carg_raw NVARCHAR(50) NULL,
    clie_cod_tcsr_raw NVARCHAR(50) NULL,
    clie_cod_auid_raw NVARCHAR(50) NULL,
    clie_fec_asan_raw NVARCHAR(50) NULL,
    clie_cod_prof_raw NVARCHAR(50) NULL,
    clie_ban_peps_raw NVARCHAR(50) NULL,
    clie_cod_tvin_raw NVARCHAR(50) NULL,
    clie_ban_grup_raw NVARCHAR(50) NULL,
    clie_cod_grup_raw NVARCHAR(50) NULL,
    clie_cod_tres_raw NVARCHAR(50) NULL,
    clie_pai_resi_raw NVARCHAR(50) NULL,
    clie_ban_pdpe_raw NVARCHAR(50) NULL,
    clie_hue_dact_raw NVARCHAR(50) NULL
);

BULK INSERT #ClientesRaw
FROM 'C:\Migracion\bcaclie.csv'
WITH (
    FIRSTROW = 2,
    FIELDTERMINATOR = ',',
    ROWTERMINATOR = '\n',
    CODEPAGE = '65001',
    TABLOCK,
    KEEPNULLS
);

INSERT INTO dbo.Stg_Clientes_Informix (
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
    clie_est_clie,
    clie_cal_clie,
    clie_rep_lega,
    clie_ide_repr,
    clie_tide_repr,
    clie_cod_pais,
    clie_cod_usua,
    clie_cod_ofct,
    clie_ref_dire,
    clie_cod_cocu,
    clie_est_adic,
    clie_cod_disc,
    clie_cod_tviv,
    clie_val_vivi,
    clie_num_carg,
    clie_cod_tcsr,
    clie_cod_auid,
    clie_fec_asan,
    clie_cod_prof,
    clie_ban_peps,
    clie_cod_tvin,
    clie_ban_grup,
    clie_cod_grup,
    clie_cod_tres,
    clie_pai_resi,
    clie_ban_pdpe,
    clie_hue_dact
)
SELECT
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_clie_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_tcli_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_num_clie_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_ofic_raw)), '"', '')),
    LEFT(REPLACE(LTRIM(RTRIM(clie_cod_tide_raw)), '"', ''), 1),
    LEFT(REPLACE(LTRIM(RTRIM(clie_ide_clie_raw)), '"', ''), 13),
    LEFT(REPLACE(LTRIM(RTRIM(clie_ape_clie_raw)), '"', ''), 60),
    LEFT(REPLACE(LTRIM(RTRIM(clie_nom_clie_raw)), '"', ''), 30),
    TRY_CONVERT(DATE, REPLACE(LTRIM(RTRIM(clie_fec_nac_raw)), '"', ''), 23),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_sect_raw)), '"', '')),
    LEFT(REPLACE(LTRIM(RTRIM(clie_dir_domi_raw)), '"', ''), 55),
    COALESCE(
        TRY_CONVERT(DATETIME2(0), REPLACE(LTRIM(RTRIM(clie_fec_uac_raw)), '"', ''), 126),
        TRY_CONVERT(DATETIME2(0), REPLACE(LTRIM(RTRIM(clie_fec_uac_raw)), '"', ''), 121),
        TRY_CONVERT(DATETIME2(0), REPLACE(LTRIM(RTRIM(clie_fec_uac_raw)), '"', ''), 120)
    ),
    COALESCE(
        TRY_CONVERT(DATETIME2(0), REPLACE(LTRIM(RTRIM(clie_fec_ingr_raw)), '"', ''), 126),
        TRY_CONVERT(DATETIME2(0), REPLACE(LTRIM(RTRIM(clie_fec_ingr_raw)), '"', ''), 121),
        TRY_CONVERT(DATETIME2(0), REPLACE(LTRIM(RTRIM(clie_fec_ingr_raw)), '"', ''), 120)
    ),
    TRY_CONVERT(DATE, REPLACE(LTRIM(RTRIM(clie_fec_sali_raw)), '"', ''), 23),
    LEFT(REPLACE(LTRIM(RTRIM(clie_ema_clie_raw)), '"', ''), 80),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_nat_juri_raw)), '"', '')),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_est_clie_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cal_clie_raw)), '"', '')),
    LEFT(REPLACE(LTRIM(RTRIM(clie_rep_lega_raw)), '"', ''), 50),
    LEFT(REPLACE(LTRIM(RTRIM(clie_ide_repr_raw)), '"', ''), 13),
    LEFT(REPLACE(LTRIM(RTRIM(clie_tide_repr_raw)), '"', ''), 1),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_pais_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_usua_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_ofct_raw)), '"', '')),
    LEFT(REPLACE(LTRIM(RTRIM(clie_ref_dire_raw)), '"', ''), 100),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_cocu_raw)), '"', '')),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_est_adic_raw)), '"', '')),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_cod_disc_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_tviv_raw)), '"', '')),
    TRY_CONVERT(DECIMAL(15,2), REPLACE(LTRIM(RTRIM(clie_val_vivi_raw)), '"', '')),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_num_carg_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_tcsr_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_auid_raw)), '"', '')),
    TRY_CONVERT(DATE, REPLACE(LTRIM(RTRIM(clie_fec_asan_raw)), '"', ''), 23),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_prof_raw)), '"', '')),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_ban_peps_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_tvin_raw)), '"', '')),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_ban_grup_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_grup_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_tres_raw)), '"', '')),
    TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_pai_resi_raw)), '"', '')),
    TRY_CONVERT(SMALLINT, REPLACE(LTRIM(RTRIM(clie_ban_pdpe_raw)), '"', '')),
    LEFT(REPLACE(LTRIM(RTRIM(clie_hue_dact_raw)), '"', ''), 10)
FROM #ClientesRaw
WHERE TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_clie_raw)), '"', '')) IS NOT NULL
  AND TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_tcli_raw)), '"', '')) IS NOT NULL
  AND TRY_CONVERT(INT, REPLACE(LTRIM(RTRIM(clie_cod_ofic_raw)), '"', '')) IS NOT NULL
  AND NULLIF(LTRIM(RTRIM(clie_ide_clie_raw)), '') IS NOT NULL;

DROP TABLE #ClientesRaw;
GO

EXEC dbo.usp_MergeClientesDesdeInformix;
GO

SELECT *
FROM dbo.vw_ClientesInformixParaApp
ORDER BY OrigenClienteId;
GO
