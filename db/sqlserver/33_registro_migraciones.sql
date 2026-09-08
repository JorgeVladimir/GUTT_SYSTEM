/* ============================================================================
   33_registro_migraciones.sql
   ----------------------------------------------------------------------------
   Crea el registro de migraciones aplicadas.

   POR QUE EXISTE: 20_ice_seps.sql estaba commiteado desde hacia semanas y NUNCA
   se habia ejecutado contra la base. server.js escribia cinco columnas ICE* que
   no existian, asi que la APROBACION DE CREDITOS estaba caida por completo, y
   nadie lo sabia porque el unico test que tocaba ese endpoint fallaba antes por
   otra razon. No habia forma de responder "que scripts estan aplicados".

   Con esta tabla la pregunta tiene respuesta, y `node tools/migrate.mjs` puede
   aplicar solo lo que falta. Instalar en un cliente nuevo deja de ser un acto de
   memoria.

   El hash del contenido se guarda para detectar que un script YA APLICADO fue
   editado despues: eso significa que la base del cliente y el archivo del repo
   ya no dicen lo mismo, y es un problema que conviene ver antes de un cierre
   contable, no durante.
   ============================================================================ */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.MigracionesAplicadas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MigracionesAplicadas (
        MigracionId    INT IDENTITY(1,1) PRIMARY KEY,
        Archivo        NVARCHAR(200) NOT NULL,
        HashContenido  NVARCHAR(64)  NOT NULL,
        FechaAplicada  DATETIME2     NOT NULL CONSTRAINT DF_Migr_Fecha DEFAULT SYSDATETIME(),
        AplicadaPor    NVARCHAR(100) NULL,
        DuracionMs     INT           NULL,
        Notas          NVARCHAR(500) NULL
    );
    CREATE UNIQUE INDEX UX_Migr_Archivo ON dbo.MigracionesAplicadas (Archivo);
END
GO

/* Los scripts anteriores a este ya estan aplicados en esta base, pero no
   registrados. Se marcan como aplicados con hash 'PREEXISTENTE' para que
   tools/migrate.mjs no intente re-ejecutarlos ni los reporte como pendientes.
   El hash real se sella la proxima vez que alguien los vuelva a aplicar a
   proposito. En una instalacion NUEVA esta tabla nace vacia y el runner aplica
   todo en orden, que es justo lo que se quiere. */
SET QUOTED_IDENTIFIER ON;

;WITH Previas(Archivo) AS (
    SELECT * FROM (VALUES
        (N'01_integracion_usuarios_informix.sql'),
        (N'02_cargar_staging_perfiles_desde_csv.sql'),
        (N'03_cargar_staging_usuarios_desde_csv.sql'),
        (N'04_integracion_clientes_informix.sql'),
        (N'05_cargar_staging_clientes_desde_csv.sql'),
        (N'06_registro_socios_app.sql'),
        (N'07_auditoria_y_registro_socios_update.sql'),
        (N'08_cuentas_y_parametros_productos.sql'),
        (N'09_activacion_banca_linea.sql'),
        (N'09_denominaciones_y_reporte_cajas.sql'),
        (N'10_tasas_credito.sql'),
        (N'11_agente_engrams.sql'),
        (N'12_solicitudes_credito_socioid.sql'),
        (N'13_solicitudes_credito_origen.sql'),
        (N'14_crear_superuser.sql'),
        (N'15_cierre_caja_control.sql'),
        (N'16_mejoras_reportes_ficha.sql'),
        (N'17_gestion_creditos_seps.sql'),
        (N'18_cedula_excepcion_seps.sql'),
        (N'19_plazo_fijo_seps.sql'),
        (N'20_ice_seps.sql'),
        (N'21_crear_usuario_caja.sql'),
        (N'23_auditoria_procesos.sql'),
        (N'24_recuperacion_password_permisos.sql'),
        (N'26_plan_cuentas_seps.sql'),
        (N'28_normalizar_cuentacontable_legacy.sql'),
        (N'29_fix_cuenta_cartera_familia_seps.sql'),
        (N'30_reclasificacion_cartera.sql'),
        (N'31_ponderaciones_riesgo_solvencia.sql'),
        (N'32_registrocontable_socio_opcional.sql'),
        (N'33_registro_migraciones.sql')
    ) v(Archivo)
)
MERGE dbo.MigracionesAplicadas AS destino
USING Previas AS origen ON destino.Archivo = origen.Archivo
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Archivo, HashContenido, AplicadaPor, Notas)
    VALUES (origen.Archivo, N'PREEXISTENTE', N'33_registro_migraciones.sql',
            N'Marcada como aplicada al crear el registro de migraciones; hash sin sellar.');
GO

SELECT COUNT(*) AS MigracionesRegistradas FROM dbo.MigracionesAplicadas;
GO
