// 27_cargar_plan_cuentas_seps.js
// Carga el Catálogo Único de Cuentas (CUC) SEPS real en SQLGUTPATATE (la base que sirve
// server.js / la demo en vivo), reutilizando el catálogo de 1103 cuentas ya extraído en
// vivo de un core Informix real (Fundación/Crediapoyo, ver
// db/gutt_system/22_cargar_plan_cuentas_crediapoyo.sql). Es el catálogo nacional SEPS,
// no específico de una cooperativa -- aplica igual para Caja Patate.
//
// Parsea el .sql fuente con una regex simple (no lo ejecuta -- ese script asume la base
// GUTT_SYSTEM con CooperativaId, que no existe en SQLGUTPATATE) y hace el INSERT directo
// contra dbo.PlanCuentas (creada por 26_plan_cuentas_seps.sql).
import sql from 'mssql';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv(join(__dirname, '..', '..', 'api', '.env'));

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: true },
};
if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
} else {
  sqlConfig.port = process.env.SQL_SERVER_PORT ? parseInt(process.env.SQL_SERVER_PORT, 10) : 1433;
}

const sourceFile = join(__dirname, '..', 'gutt_system', '22_cargar_plan_cuentas_crediapoyo.sql');
const src = readFileSync(sourceFile, 'utf-8');

// Cada línea de datos real tiene la forma:
// INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta, EsAgrupador)
//   VALUES ((SELECT ...), '110105', 'Efectivo', 'ACTIVO', 0);
const rowRe = /VALUES\s*\(\(SELECT[^)]+\),\s*'([^']*)',\s*'((?:[^'\\]|\\.)*)',\s*'([A-Z]+)',\s*(\d)\)/g;
const rows = [];
let m;
while ((m = rowRe.exec(src)) !== null) {
  const [, codigo, nombreRaw, tipo, esAgrupador] = m;
  const nombre = nombreRaw.replace(/''/g, "'").slice(0, 200);
  rows.push({ codigo, nombre, tipo, esAgrupador: esAgrupador === '1' });
}

console.log(`Filas parseadas del catálogo fuente: ${rows.length}`);
if (rows.length < 1000) {
  console.error('ADVERTENCIA: se esperaban ~1103 filas, revisar la regex antes de continuar.');
  process.exit(1);
}

const pool = await sql.connect(sqlConfig);
let inserted = 0, skipped = 0, updated = 0;

for (const r of rows) {
  const existing = await pool.request()
    .input('codigo', sql.NVarChar(15), r.codigo)
    .query('SELECT CuentaContableId, Nombre FROM dbo.PlanCuentas WHERE Codigo = @codigo');

  if (existing.recordset.length === 0) {
    await pool.request()
      .input('codigo', sql.NVarChar(15), r.codigo)
      .input('nombre', sql.NVarChar(200), r.nombre)
      .input('tipo', sql.NVarChar(20), r.tipo)
      .input('esAgrupador', sql.Bit, r.esAgrupador)
      .query(`INSERT INTO dbo.PlanCuentas (Codigo, Nombre, TipoCuenta, EsAgrupador) VALUES (@codigo, @nombre, @tipo, @esAgrupador)`);
    inserted++;
  } else {
    skipped++;
  }
}

console.log(`Insertadas: ${inserted}, ya existentes (omitidas): ${skipped}`);
await pool.close();
