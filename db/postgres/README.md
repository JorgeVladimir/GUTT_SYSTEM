# Migracion PostgreSQL

**PostgreSQL 18 ya esta instalado y corriendo** como servicio de Windows
(`postgresql-x64-18`) en `127.0.0.1:5432`, con la base de desarrollo `gutt_system_dev`
y las 5 migraciones aplicadas. `server.js` **todavia sirve todo desde SQL Server** —
esta capa no esta conectada a ningun endpoint HTTP todavia. Ver [[gutt-postgres-migracion]]
en la memoria del proyecto para el detalle de la sesion que la levanto.

## Preparado y verificado

- `source/sqlserver-schema.json`: captura de metadatos reales de SQLGUTPATATE,
  incluidas SolicitudesCredito y Usuarios (las dos tablas sin DDL versionado que el
  plan de migracion marcaba como bloqueante), indices, FK, CHECK, vistas y
  procedimientos. No contiene filas de usuarios ni movimientos.
- `001_schema.sql`: 37 tablas, generadas desde esa captura. Conserva nombres exactos
  entre comillas, tipos numericos, identidades, restricciones e indices.
- `002_catalogs.sql`: diez catalogos de configuracion. Decimales como texto para
  evitar redondeos de JavaScript; carga con `jsonb_populate_recordset`.
- `003_dpf_catalogo.sql`: equivalente de la correccion 34 de SQL Server (bandas de
  antiguedad del plazo fijo), con validacion de cuentas DPF activas contra PlanCuentas.
- `004_views.sql`: las 12 vistas del esquema (auditoria por modulo, consultas de
  registro de socios, integracion con Informix).
- `005_functions.sql`: los 4 procedimientos que el plan identifico como necesarios
  de portar (los `usp_Merge*` de ingesta Informix se descartaron a proposito, ver
  el plan de migracion): `usp_RegistrarSocio`, `usp_GuardarMapaUbicacion`,
  `usp_GuardarCroquisTrabajo`, `usp_GenerarIDDepositoPlazo`.
- `services/postgres.js`: pool dedicado, traduccion de parametros nombrados
  (`@nombre` -> `$1`) para no reordenar a mano cada consulta, y transacciones que
  liberan la conexion incluso ante errores. **Aun no conectado a `server.js`.**
- `tools/migrate-postgres.mjs`: SHA-256 por archivo (replica el control de
  `tools/migrate.mjs` de SQL Server), rechazo de archivos alterados o
  desaparecidos, bloqueo de migraciones concurrentes, una transaccion por script.
- **16 pruebas automatizadas pasan hoy**: `npm run test:postgres` (9, unitarias del
  adaptador — parametros, transacciones, rollback, que no se cuele `DATABASE_URL`) y
  `npm run test:postgres:integration` (7, contra una base PostgreSQL real y efimera:
  paridad del esquema/vistas/catalogo DPF, registro concurrente sin duplicados,
  filtrado de productos por tipo de persona, reversion de contadores al fallar,
  guardado de mapas/croquis, generacion de IDs de DPF bajo concurrencia con el salto
  9999->10000, y deteccion de un archivo de migracion alterado).

## Configurar el destino

Agregar en `api/.env` (ya configurado en este equipo — `CONY-DESARROLLO`, no
`SERVER-CONY` como decia el plan original; confirmar con el equipo antes de mover
esto a otra maquina):

```dotenv
GUTT_PG_HOST=...
GUTT_PG_PORT=5432
GUTT_PG_DATABASE=...
GUTT_PG_USER=...
GUTT_PG_PASSWORD=...
GUTT_PG_ADMIN_PASSWORD=...   # solo lo usa tests/postgres.integration.test.mjs para crear/borrar la base efimera
GUTT_PG_SSL=false
```

Usar una base nueva y vacia, con permisos para crear el esquema `dbo`. El prefijo
dedicado evita reutilizar accidentalmente el espejo legacy en Neon (`DATABASE_URL`/
`PGHOST`; `services/postgres.js` lo rechaza explicitamente, con prueba unitaria).

```powershell
npm run test:postgres              # 9 pruebas del adaptador, sin tocar ninguna base
npm run test:postgres:integration  # 7 pruebas contra PostgreSQL real (crea y borra una base temporal)
npm run migrate:postgres           # estado: pendientes/alteradas, solo lectura
npm run migrate:postgres -- --aplicar
```

El comando de estado es de solo lectura; devuelve codigo 1 si quedan pendientes.
Aplicar crea el registro `public.gutt_schema_migrations` si falta. No ejecuta scripts
de `db/sqlserver/`. Si una migracion falla, revierte ese archivo y se detiene.

## Actualizar las fuentes antes de la primera aplicacion

```powershell
node tools/export-schema-postgres.mjs
node tools/build-postgres-schema.mjs
node tools/export-postgres-catalogs.mjs
node tools/build-postgres-views.mjs
```

La extraccion usa `tools/db.mjs` en modo de solo lectura contra SQLGUTPATATE. Despues
de aplicar las migraciones, introducir cambios en archivos nuevos; regenerar un
archivo ya aplicado provoca un error de hash (`migrador detecta hash alterado y no
continua`, cubierto por prueba).

## Pendiente para completar la migracion (Paso 3 del plan en adelante)

1. **Paridad de collation**: SQL Server compara texto sin distinguir mayusculas por
   defecto; las columnas PostgreSQL generadas aun no reproducen esa configuracion.
   **Precision temporal**: `datetime2(7)` se reduce a microsegundos en PostgreSQL.
2. Portar las consultas y transacciones de `server.js` y `services/carteraSeps.js`
   a `services/postgres.js`, modulo por modulo y en el orden del plan: socios y
   cuentas -> caja y ventanilla -> creditos -> plazo fijo -> contabilidad ->
   reportes SEPS -> cartera. Preservar nombres y tipos del contrato HTTP: los
   numericos/bigint siguen siendo texto en el driver de PostgreSQL, cada consumidor
   debe convertirlos deliberadamente.
3. Provisionar usuarios reales de cada cooperativa de forma segura; no se exportan
   usuarios, contrasenas ni el reset de demostracion `35_reset_password_demo.sql`
   (deliberadamente fuera de git, ver CLAUDE.md).
4. Suite HTTP completa sobre PostgreSQL, prueba de paridad numerica SEPS (misma
   clasificacion de cartera, provisiones y solvencia que sobre SQL Server con los
   mismos datos), y ciclos completos de caja, credito y cierre contable de punta a
   punta. Verificar que el pool vuelva a cero conexiones activas tras la bateria.
5. Traslado de la base de desarrollo al servidor T630 en el mes 7 (fase 4 del
   cronograma), una vez la copia fiel pase la misma bateria de pruebas que hoy pasa
   sobre SQL Server.

Las 16 pruebas actuales cubren el adaptador y las cuatro funciones ya portadas; no
demuestran todavia la portabilidad de los endpoints HTTP ni la paridad financiera
completa — eso es exactamente el trabajo del punto 2 y 4.

Referencias: [transacciones node-postgres](https://node-postgres.com/features/transactions),
[indices unicos y NULLS NOT DISTINCT](https://www.postgresql.org/docs/current/indexes-unique.html).
