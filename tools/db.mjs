// Consulta rápida a SQLGUTPATATE sin re-tipear la ruta de sqlcmd ni credenciales.
//
//   node tools/db.mjs "SELECT TOP 5 Codigo, Nombre FROM dbo.PlanCuentas"
//   node tools/db.mjs --json "SELECT COUNT(*) AS n FROM dbo.PlanCuentas"
//
// Ventaja sobre sqlcmd: el driver mssql ya conecta con QUOTED_IDENTIFIER ON, así que los
// UPDATE/INSERT no fallan con el Msg 1934 que sí aparece llamando sqlcmd a pelo. Tampoco
// hay que pelear con el encoding de acentos en la consola.
import sql from 'mssql';
import { sqlConfig } from './_env.mjs';

const args = process.argv.slice(2);
const asJson = args[0] === '--json';
const query = (asJson ? args[1] : args[0]) || '';

if (!query.trim()) {
  console.error('Uso: node tools/db.mjs [--json] "<consulta SQL>"');
  process.exit(2);
}

// SOLO LECTURA a propósito. Este script se auto-aprueba sin confirmación, así que no puede
// ser una puerta para escribir en la base. Todo cambio de datos o de esquema va como script
// versionado en db/sqlserver/NN_*.sql, que además queda en git y es re-ejecutable.
const ESCRITURA = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|MERGE|EXEC|EXECUTE|GRANT|REVOKE|BACKUP|RESTORE)\b/i;
if (ESCRITURA.test(query)) {
  console.error('BLOQUEADO: tools/db.mjs es de solo lectura.');
  console.error('Para modificar datos o esquema, cree un script versionado en db/sqlserver/NN_descripcion.sql');
  console.error('y ejecutelo explicitamente. Asi el cambio queda en git y es reproducible.');
  process.exit(3);
}

// Salida compacta y alineada: el objetivo es que quepa en pocas líneas, no imprimir JSON gigante.
function printTable(rows) {
  if (rows.length === 0) { console.log('(0 filas)'); return; }
  const cols = Object.keys(rows[0]);
  const fmt = (v) => v === null || v === undefined ? '' : String(v);
  const widths = cols.map(c => Math.min(40, Math.max(c.length, ...rows.map(r => fmt(r[c]).length))));
  const line = (cells) => cells.map((s, i) => s.slice(0, widths[i]).padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(line(cols.map(c => fmt(r[c]))));
  console.log(`(${rows.length} fila${rows.length === 1 ? '' : 's'})`);
}

let pool;
try {
  pool = await sql.connect(sqlConfig());
  const result = await pool.request().query(query);
  const rows = result.recordset || [];
  if (asJson) console.log(JSON.stringify(rows, null, 2));
  else if (result.recordset) printTable(rows);
  else console.log(`OK — filas afectadas: ${result.rowsAffected.join(', ')}`);
} catch (err) {
  console.error('ERROR SQL:', err.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool.close();
}
