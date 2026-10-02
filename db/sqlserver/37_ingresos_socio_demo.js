// Completa el patrimonio/ingresos del socio de DEMOSTRACIÓN (cédula 0901234567, "CLIENTE PRUEBA")
// creado para el video comercial: el alta de socio del asesor no captura ingresos mensuales,
// así que cualquier socio nuevo queda en Ingresos=$0 y el ICE (Res. SEPS) bloquea cualquier
// crédito sin importar el monto. Se completa aquí el mismo campo que llenaría un oficial real.
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

const IDENTIFICACION = process.argv[2] || '0901234567';
const patrimonio = {
  ingresoSueldo: 800,
  ingresoComercial: 0,
  ingresoOtros: 0,
  gastosMensuales: 300,
  deudasExternas: 0,
  totalBienes: 5000,
};

const pool = await sql.connect(sqlConfig);
const result = await pool.request()
  .input('id', sql.NVarChar(50), IDENTIFICACION)
  .input('pat', sql.NVarChar(sql.MAX), JSON.stringify(patrimonio))
  .query('UPDATE dbo.RegistroSocios SET PatrimonioIngresos = @pat WHERE Identificacion = @id');

console.log('Filas actualizadas:', result.rowsAffected[0]);
await pool.close();
