import sql from 'mssql';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Función para cargar variables del .env
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

// Cargar configuración de api/.env
loadDotEnv(join(__dirname, 'api', '.env'));

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  connectionTimeout: 15000 // 15 segundos max de espera
};

if (process.env.SQL_SERVER_PORT) {
  sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
}
if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
}

console.log('====================================================');
console.log('🧪 Probando conexión a SQL Server...');
console.log('====================================================');
console.log('Host/IP:     ', sqlConfig.server);
console.log('Instancia:   ', sqlConfig.options.instanceName || '(Ninguna / Puerto por defecto)');
console.log('Base Datos:  ', sqlConfig.database);
console.log('Usuario:     ', sqlConfig.user);
console.log('Contraseña:  ', sqlConfig.password ? '****' : '(Vacía)');
console.log('----------------------------------------------------');

async function testConnection() {
  try {
    const pool = await sql.connect(sqlConfig);
    console.log('✅ ¡CONEXIÓN EXITOSA!');
    
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Usuarios';
      SELECT TOP 5 * FROM dbo.Usuarios;
    `);
    console.log('📋 Columnas de dbo.Usuarios:');
    console.log(result.recordsets[0].map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE})`).join(', '));
    console.log('📋 Registros en dbo.Usuarios:');
    console.log(JSON.stringify(result.recordsets[1], null, 2));
    
    await pool.close();
    console.log('====================================================');
  } catch (err) {
    console.error('❌ ERROR AL CONECTAR:');
    console.error(err.message);
    console.log('====================================================');
  }
}

testConnection();
