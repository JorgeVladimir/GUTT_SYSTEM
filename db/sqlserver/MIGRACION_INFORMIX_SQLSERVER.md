# Migracion Informix -> SQL Server

Base destino: SQLGUTPATATE

## Objetivo

Estandarizar una migracion reutilizable desde AFC Informix hacia la nueva base del aplicativo.

## Orden recomendado

1. Extraer catalogos de apoyo desde Informix.
2. Cargar staging en SQL Server.
3. Ejecutar procedimientos MERGE de catalogos.
4. Extraer tablas transaccionales o maestras.
5. Cargar staging en SQL Server.
6. Ejecutar procedimientos MERGE de negocio.
7. Validar conteos y llaves foraneas.

## Usuarios y perfiles

### Extraccion Informix

Ejecutar:
- db/informix/02_extract_bcaperf.sql
- db/informix/01_extract_bcausua.sql

### Carga staging SQL Server

1. Cargar resultado de bcaperf en dbo.Stg_Perfiles_Informix.
2. Ejecutar dbo.usp_MergePerfilesDesdeInformix.
3. Revisar dbo.HomologacionPerfilInformix.
4. Ajustar RolApp cuando el mapeo por defecto no coincida con la institucion.
5. Cargar resultado de bcausua en dbo.Stg_Usuarios_Informix.
6. Ejecutar dbo.usp_MergeUsuariosDesdeInformix.
7. Validar dbo.vw_UsuariosInformixParaApp.

## Clientes (bcaclie)

### Extraccion Informix

Ejecutar:
- db/informix/03_extract_bcaclie.sql

### Carga staging SQL Server

1. Ejecutar db/sqlserver/04_integracion_clientes_informix.sql (crea tabla destino, staging, procedimiento y vista).
2. Cargar resultado de bcaclie en dbo.Stg_Clientes_Informix.
3. Ejecutar dbo.usp_MergeClientesDesdeInformix.
4. Validar dbo.vw_ClientesInformixParaApp.

## Reglas reutilizables para otras instituciones

1. No consumir tablas Informix directo desde frontend.
2. Usar staging separado por entidad.
3. Mantener homologaciones configurables por catalogo.
4. Nunca sobreescribir reglas de rol sin validar catalogos origen.
5. Preservar columnas de trazabilidad: sistema origen, id origen, fecha carga.
6. Hacer MERGE idempotente para permitir reprocesos.

## Objetos SQL Server involucrados

- dbo.Stg_Perfiles_Informix
- dbo.HomologacionPerfilInformix
- dbo.usp_MergePerfilesDesdeInformix
- dbo.Stg_Usuarios_Informix
- dbo.usp_MergeUsuariosDesdeInformix
- dbo.vw_UsuariosInformixParaApp
- dbo.Stg_Clientes_Informix
- dbo.ClientesInformix
- dbo.usp_MergeClientesDesdeInformix
- dbo.vw_ClientesInformixParaApp

## Validaciones minimas

1. Conteo de perfiles origen vs staging.
2. Conteo de usuarios origen vs staging.
3. Usuarios sin perfil homologado.
4. Usuarios duplicados por OrigenSistema + OrigenUsuarioId.
5. Perfiles sin RolApp definitivo.
6. Clientes duplicados por OrigenSistema + OrigenClienteId.
