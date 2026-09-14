// Solo lectura: captura metadatos, nunca filas ni credenciales.
// Ejecutar antes de traducir el esquema: node tools/export-schema-postgres.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './_env.mjs';

const queries = {
  columns: `SELECT s.name AS SchemaName,t.name AS TableName,c.column_id AS Ordinal,
    c.name AS ColumnName,ty.name AS DataType,c.max_length AS MaxLength,
    c.precision AS Precision,c.scale AS Scale,c.is_nullable AS Nullable,
    c.is_identity AS IsIdentity,CONVERT(varchar(50),ic.seed_value) AS IdentitySeed,
    CONVERT(varchar(50),ic.increment_value) AS IdentityIncrement,
    dc.name AS DefaultName,dc.definition AS DefaultDefinition,
    cc.definition AS ComputedDefinition,cc.is_persisted AS IsPersisted
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
    JOIN sys.columns c ON c.object_id=t.object_id
    JOIN sys.types ty ON ty.user_type_id=c.user_type_id
    LEFT JOIN sys.identity_columns ic ON ic.object_id=c.object_id AND ic.column_id=c.column_id
    LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
    LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id
    WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,c.column_id`,
  indexes: `SELECT s.name AS SchemaName,t.name AS TableName,i.name AS IndexName,
    i.type_desc AS IndexType,i.is_unique AS IsUnique,i.is_primary_key AS IsPrimaryKey,
    i.is_unique_constraint AS IsUniqueConstraint,i.filter_definition AS FilterDefinition,
    c.name AS ColumnName,ic.key_ordinal AS KeyOrdinal,
    ic.is_descending_key AS IsDescending,ic.is_included_column AS IsIncluded
    FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
    JOIN sys.indexes i ON i.object_id=t.object_id
    JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
    JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
    WHERE t.is_ms_shipped=0 AND i.index_id>0
    ORDER BY s.name,t.name,i.name,ic.index_column_id`,
  foreignKeys: `SELECT s.name AS SchemaName,t.name AS TableName,f.name AS ConstraintName,
    c.name AS ColumnName,rs.name AS ReferencedSchema,rt.name AS ReferencedTable,
    rc.name AS ReferencedColumn,fc.constraint_column_id AS Ordinal,
    f.delete_referential_action_desc AS OnDelete,f.update_referential_action_desc AS OnUpdate,
    f.is_disabled AS IsDisabled,f.is_not_trusted AS IsNotTrusted
    FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id
    JOIN sys.schemas s ON s.schema_id=t.schema_id
    JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id
    JOIN sys.columns c ON c.object_id=t.object_id AND c.column_id=fc.parent_column_id
    JOIN sys.tables rt ON rt.object_id=f.referenced_object_id
    JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
    JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fc.referenced_column_id
    ORDER BY s.name,t.name,f.name,fc.constraint_column_id`,
  checks: `SELECT s.name AS SchemaName,t.name AS TableName,c.name AS ConstraintName,
    c.definition AS Definition,c.is_disabled AS IsDisabled,c.is_not_trusted AS IsNotTrusted
    FROM sys.check_constraints c JOIN sys.tables t ON t.object_id=c.parent_object_id
    JOIN sys.schemas s ON s.schema_id=t.schema_id ORDER BY s.name,t.name,c.name`,
  modules: `SELECT s.name AS SchemaName,o.name AS ObjectName,o.type_desc AS ObjectType,
    m.definition AS Definition FROM sys.sql_modules m
    JOIN sys.objects o ON o.object_id=m.object_id JOIN sys.schemas s ON s.schema_id=o.schema_id
    WHERE o.is_ms_shipped=0 ORDER BY s.name,o.name`,
};

const snapshot = {};
for (const [name, query] of Object.entries(queries)) {
  snapshot[name] = JSON.parse(execFileSync(process.execPath,
    [join(REPO_ROOT, 'tools/db.mjs'), '--json', query],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true }));
}
for (const table of ['SolicitudesCredito', 'Usuarios']) {
  if (!snapshot.columns.some(c => c.SchemaName === 'dbo' && c.TableName === table)) {
    throw new Error(`Falta el esquema requerido: dbo.${table}`);
  }
}
const dir = join(REPO_ROOT, 'db/postgres/source');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'sqlserver-schema.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Captura: ${new Set(snapshot.columns.map(c => c.SchemaName + '.' + c.TableName)).size} tablas, ${snapshot.columns.length} columnas. Sin datos operativos.`);
