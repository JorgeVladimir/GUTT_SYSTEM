// Ejecuta un script versionado de db/sqlserver/*.sql contra SQLGUTPATATE.
//
//   node tools/run-sql.mjs db/sqlserver/30_reclasificacion_cartera.sql
//
// Complementa a tools/db.mjs (solo lectura): aquí sí se escribe, pero SOLO desde un archivo
// que vive en git bajo db/. No acepta SQL suelto por argumento a propósito -- todo cambio de
// esquema o de parámetros queda versionado y es re-ejecutable.
//
// Divide por lotes GO igual que sqlcmd, y conecta con QUOTED_IDENTIFIER ON (el driver mssql
// lo hace solo), así que no aparece el Msg 1934 que sí da sqlcmd a pelo.
import sql from 'mssql';
import { readFileSync, existsSync } from 'fs';
import { resolve, sep } from 'path';
import { sqlConfig, REPO_ROOT } from './_env.mjs';

const rel = process.argv[2];
if (!rel) {
  console.error('Uso: node tools/run-sql.mjs db/sqlserver/NN_descripcion.sql');
  process.exit(2);
}

const abs = resolve(REPO_ROOT, rel);
const dbDir = resolve(REPO_ROOT, 'db') + sep;
if (!abs.startsWith(dbDir)) {
  console.error(`BLOQUEADO: solo se ejecutan scripts que viven bajo db/ (recibido: ${rel})`);
  process.exit(3);
}
if (!existsSync(abs)) {
  console.error(`No existe el archivo: ${abs}`);
  process.exit(4);
}

// Separador de lotes GO en su propia línea (mismo criterio que sqlcmd).
const lotes = readFileSync(abs, 'utf-8')
  .split(/^\s*GO\s*$/gim)
  .map(b => b.trim())
  .filter(Boolean);

let pool;
try {
  pool = await sql.connect(sqlConfig());
  console.log(`Ejecutando ${rel} — ${lotes.length} lote(s)`);
  for (let i = 0; i < lotes.length; i++) {
    const result = await pool.request().batch(lotes[i]);
    const filas = (result.rowsAffected || []).reduce((a, b) => a + b, 0);
    if (result.recordset && result.recordset.length) {
      console.log(`  lote ${i + 1}/${lotes.length}: ${result.recordset.length} fila(s) devueltas`);
      for (const r of result.recordset) console.log('   ', JSON.stringify(r));
    } else {
      console.log(`  lote ${i + 1}/${lotes.length}: OK (${filas} fila(s) afectadas)`);
    }
  }
  console.log('LISTO.');
} catch (err) {
  console.error(`ERROR SQL en ${rel}:`, err.message);
  if (err.lineNumber) console.error('  línea del lote:', err.lineNumber);
  process.exitCode = 1;
} finally {
  if (pool) await pool.close();
}
