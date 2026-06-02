# Carga desde Informix hacia SQL Server

## Opcion mas practica

Como ya puedes ejecutar consultas en Informix, la forma mas rapida es:

1. Ejecutar la consulta en Informix.
2. Exportar el resultado a CSV.
3. Guardar los archivos como:
    - C:\Migracion\bcaperf.csv
    - C:\Migracion\bcausua.csv
    - C:\Migracion\bcaclie.csv
4. Ejecutar en SQL Server:
   - db/sqlserver/02_cargar_staging_perfiles_desde_csv.sql
   - db/sqlserver/03_cargar_staging_usuarios_desde_csv.sql
    - db/sqlserver/04_integracion_clientes_informix.sql (solo la primera vez o cuando haya cambios de estructura)
    - db/sqlserver/05_cargar_staging_clientes_desde_csv.sql

## Formato esperado de bcaperf.csv

Columnas:
- perf_cod_perf
- perf_des_perf

## Formato esperado de bcausua.csv

Columnas:
- usua_cod_usua
- usua_cod_empl
- usua_cod_perf
- usua_nom_usua
- usua_passwd
- usua_fec_uac
- usua_num_agen
- usua_ban_usua
- usua_imp_pred

## Formato esperado de bcaclie.csv

Columnas:
- clie_cod_clie
- clie_cod_tcli
- clie_num_clie
- clie_cod_ofic
- clie_cod_tide
- clie_ide_clie
- clie_ape_clie
- clie_nom_clie
- clie_fec_nac
- clie_cod_sect
- clie_dir_domi
- clie_fec_uac
- clie_fec_ingr
- clie_fec_sali
- clie_ema_clie
- clie_nat_juri
- clie_est_clie
- clie_cal_clie
- clie_rep_lega
- clie_ide_repr
- clie_tide_repr
- clie_cod_pais
- clie_cod_usua
- clie_cod_ofct
- clie_ref_dire
- clie_cod_cocu
- clie_est_adic
- clie_cod_disc
- clie_cod_tviv
- clie_val_vivi
- clie_num_carg
- clie_cod_tcsr
- clie_cod_auid
- clie_fec_asan
- clie_cod_prof
- clie_ban_peps
- clie_cod_tvin
- clie_ban_grup
- clie_cod_grup
- clie_cod_tres
- clie_pai_resi
- clie_ban_pdpe
- clie_hue_dact

## Consulta Informix usada

### Perfiles

SELECT
    perf_cod_perf,
    TRIM(perf_des_perf) AS perf_des_perf
FROM afccajapatate:bcaperf
ORDER BY perf_cod_perf;

### Usuarios

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

### Clientes

SELECT
    clie_cod_clie,
    clie_cod_tcli,
    clie_num_clie,
    clie_cod_ofic,
    TRIM(clie_cod_tide) AS clie_cod_tide,
    TRIM(clie_ide_clie) AS clie_ide_clie,
    TRIM(clie_ape_clie) AS clie_ape_clie,
    TRIM(clie_nom_clie) AS clie_nom_clie,
    clie_fec_nac,
    clie_cod_sect,
    TRIM(clie_dir_domi) AS clie_dir_domi,
    clie_fec_uac,
    clie_fec_ingr,
    clie_fec_sali,
    TRIM(clie_ema_clie) AS clie_ema_clie,
    clie_nat_juri,
    clie_est_clie,
    clie_cal_clie,
    TRIM(clie_rep_lega) AS clie_rep_lega,
    TRIM(clie_ide_repr) AS clie_ide_repr,
    TRIM(clie_tide_repr) AS clie_tide_repr,
    clie_cod_pais,
    clie_cod_usua,
    clie_cod_ofct,
    TRIM(clie_ref_dire) AS clie_ref_dire,
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
    TRIM(clie_hue_dact) AS clie_hue_dact
FROM afccajapatate:bcaclie
ORDER BY clie_cod_clie;

## Herramientas recomendadas para consultar Informix

## Opcion 1: DBeaver

Pros:
- Buena para exportar CSV.
- Maneja JDBC y varias bases.
- Mas parecida a una extension universal que una herramienta cerrada.

Requiere:
- Driver JDBC de Informix.

## Opcion 2: RazorSQL

Pros:
- Ya lo estas usando.
- Si ya funciona, no conviene cambiar herramienta ahora.

## Opcion 3: DataGrip

Pros:
- Muy buena para multiples motores.

## En VS Code

No hay una experiencia nativa para Informix tan solida como SQL Server. Lo practico es:
- seguir consultando Informix con RazorSQL o DBeaver,
- exportar CSV,
- cargar staging en SQL Server,
- ejecutar MERGE.

## Recomendacion operativa

Para esta migracion y para otras instituciones, estandariza este flujo:
1. Informix consulta.
2. Export CSV.
3. Staging SQL Server.
4. MERGE.
5. Validacion.
