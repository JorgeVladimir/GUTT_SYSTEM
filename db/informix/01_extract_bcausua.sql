-- Extraccion base de usuarios desde Informix AFC
-- Tabla origen: afccajapatate:bcausua

SELECT
    usua_cod_usua,
    usua_cod_empl,
    usua_cod_perf,
    TRIM(usua_nom_usua) AS usua_nom_usua,
    TRIM(usua_passwd) AS usua_passwd,
    usua_fec_uac,
    usua_num_agen,
    usua_ban_usua,
    TRIM(usua_imp_pred) AS usua_imp_pred
FROM afccajapatate:bcausua
ORDER BY usua_cod_usua;
