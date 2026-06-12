import sql from 'mssql';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key   = trimmed.slice(0, eqIdx).trim();
    const val   = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv(join(__dirname, 'api', '.env'));

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

if (process.env.SQL_SERVER_PORT) {
  sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
}
if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
}

async function run() {
  try {
    const pool = await sql.connect(sqlConfig);
    console.log('✅ Connected to database.');

    const socioIdent = '1720884012';
    console.log(`\n🔍 Querying RegistroSocios for Identificacion = ${socioIdent}...`);
    const socioRes = await pool.request()
      .input('id', sql.NVarChar(50), socioIdent)
      .query('SELECT SOCIOID, TipoPersona, Identificacion, PrimerNombre, Apellidos, Estado FROM dbo.RegistroSocios WHERE Identificacion = @id');
    console.log('Result:', JSON.stringify(socioRes.recordset, null, 2));

    if (socioRes.recordset.length > 0) {
      const socioId = socioRes.recordset[0].SOCIOID;
      console.log(`\n🔍 Querying CuentasAhorro for SocioId = ${socioId}...`);
      const accountsRes = await pool.request()
        .input('socioId', sql.BigInt, socioId)
        .query('SELECT c.CuentaId, c.NumeroCuenta, c.CodigoProducto, c.Saldo, p.Nombre, p.EsCertificado FROM dbo.CuentasAhorro c INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto WHERE c.SocioId = @socioId');
      console.log('Accounts:', JSON.stringify(accountsRes.recordset, null, 2));
    } else {
      console.log('\n❌ Socio not found in RegistroSocios.');
    }

    await pool.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

run();
