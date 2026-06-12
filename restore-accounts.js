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
  port: 1433,
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

    // 1. Recreate missing accounts for all active members
    console.log('Inserting missing accounts...');
    const insertRes = await pool.request().query(`
      INSERT INTO dbo.CuentasAhorro (SocioId, NumeroCuenta, CodigoProducto, Saldo)
      SELECT 
          rs.SOCIOID,
          CAST(p.CodigoProducto AS NVARCHAR(2)) + RIGHT('00000000' + CAST(rs.SOCIOID AS NVARCHAR(8)), 8) AS NumeroCuenta,
          p.CodigoProducto,
          0.00 AS Saldo
      FROM dbo.RegistroSocios rs
      CROSS JOIN dbo.parametrosproductos p
      WHERE rs.Estado = 'ACTIVO'
        AND (
            (rs.TipoPersona = 'SOCIO') OR 
            (rs.TipoPersona != 'SOCIO' AND p.EsCertificado = 0)
        )
        AND NOT EXISTS (
            SELECT 1 
            FROM dbo.CuentasAhorro ca 
            WHERE ca.SocioId = rs.SOCIOID AND ca.CodigoProducto = p.CodigoProducto
        )
    `);
    console.log(`Rows affected by account generation: ${insertRes.rowsAffected}`);

    // 2. Compute balances from RegistroContable and update Saldo
    console.log('Recalculating and updating balances from RegistroContable...');
    const updateRes = await pool.request().query(`
      UPDATE ca
      SET ca.Saldo = ISNULL(tx.CalculatedSaldo, 0.00)
      FROM dbo.CuentasAhorro ca
      INNER JOIN (
          SELECT 
              NumeroCuenta,
              SUM(Haber - Debe) AS CalculatedSaldo
          FROM dbo.RegistroContable
          WHERE CuentaContable != '110105'
          GROUP BY NumeroCuenta
      ) tx ON ca.NumeroCuenta = tx.NumeroCuenta
    `);
    console.log(`Rows affected by balance update: ${updateRes.rowsAffected}`);

    // 3. Print current accounts of member '1720884012' (SocioID = 1)
    const queryRes = await pool.request()
      .query(`
        SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.CodigoProducto, c.Saldo, p.Nombre, p.EsCertificado 
        FROM dbo.CuentasAhorro c 
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
      `);
    console.log('\nAll Current Accounts in CuentasAhorro:\n', JSON.stringify(queryRes.recordset, null, 2));

    await pool.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

run();
