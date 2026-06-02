-- Extraccion base de perfiles desde Informix AFC
-- Tabla origen: afccajapatate:bcaperf

SELECT
    perf_cod_perf,
    TRIM(perf_des_perf) AS perf_des_perf
FROM afccajapatate:bcaperf
ORDER BY perf_cod_perf;
