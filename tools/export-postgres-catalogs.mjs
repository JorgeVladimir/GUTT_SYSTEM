// Solo configuracion aprobada por el plan; nunca usuarios, saldos ni movimientos.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './_env.mjs';

const dir = join(REPO_ROOT, 'db/postgres');
const schema = JSON.parse(readFileSync(join(dir, 'source/sqlserver-schema.json'), 'utf8'));
const tables = ['PlanCuentas', 'parametrosproductos', 'Denominaciones', 'TasasCredito',
  'TasasPlazoFijo', 'RubrosCreditos', 'ParametrosProvisionCartera', 'PonderacionesRiesgo',
  'ParametrosPatrimonioTecnico', 'ParametrosRegulatorios'];
const q = name => '"' + name.replaceAll('"', '""') + '"';
const literal = text => "'" + text.replaceAll("'", "''") + "'";
const output = ['-- Solo catalogos; importes como texto decimal para conservar precision.'];
const snapshot = {};
for (const name of tables) {
  const columns = schema.columns.filter(c => c.SchemaName === 'dbo' && c.TableName === name && !c.ComputedDefinition);
  if (!columns.length) throw new Error(`Catalogo ausente: ${name}`);
  const fields = columns.map(c => ['decimal','bigint'].includes(c.DataType)
    ? `CONVERT(varchar(80), [${c.ColumnName}]) AS [${c.ColumnName}]` : `[${c.ColumnName}]`);
  const keys = schema.indexes.filter(i => i.SchemaName === 'dbo' && i.TableName === name && i.IsPrimaryKey)
    .sort((a,b) => a.KeyOrdinal-b.KeyOrdinal).map(i => `[${i.ColumnName}]`);
  if (!keys.length) throw new Error(`Catalogo sin PK para orden reproducible: ${name}`);
  const rows = JSON.parse(execFileSync(process.execPath,
    [join(REPO_ROOT, 'tools/db.mjs'), '--json', `SELECT ${fields.join(',')} FROM dbo.[${name}] ORDER BY ${keys.join(',')}`],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true }));
  snapshot[name] = rows;
  if (!rows.length) continue;
  const json = JSON.stringify(rows);
  let tag = '$catalog$';
  while (json.includes(tag)) tag = tag.slice(0,-1) + '_$';
  const target = `"dbo".${q(name)}`;
  const names = columns.map(c => q(c.ColumnName)).join(', ');
  output.push(`\nINSERT INTO ${target} (${names})\nSELECT ${names} FROM jsonb_populate_recordset(NULL::${target}, ${tag}${json}${tag}::jsonb);`);
  for (const c of columns.filter(c => c.IsIdentity)) {
    output.push(`SELECT setval(pg_get_serial_sequence(${literal(target)}, ${literal(c.ColumnName)}), (SELECT MAX(${q(c.ColumnName)}) FROM ${target}), true);`);
  }
  console.log(`${name}: ${rows.length} filas`);
}
writeFileSync(join(dir, 'source/catalogs.json'), JSON.stringify(snapshot, null, 2) + '\n');
writeFileSync(join(dir, '002_catalogs.sql'), output.join('\n') + '\n');
