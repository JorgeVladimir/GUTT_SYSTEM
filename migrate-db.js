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
  },
  connectionTimeout: 30000
};

async function run() {
  console.log(`🚀 Conectando a ${sqlConfig.server} e iniciando migración...`);
  try {
    const pool = await sql.connect(sqlConfig);
    console.log('✅ Conexión establecida.');

    const files = [
      join(__dirname, 'db', 'sqlserver', '10_tasas_credito.sql'),
      join(__dirname, 'db', 'sqlserver', '11_agente_engrams.sql'),
      join(__dirname, 'db', 'sqlserver', '12_solicitudes_credito_socioid.sql'),
      join(__dirname, 'db', 'sqlserver', '13_solicitudes_credito_origen.sql'),
      join(__dirname, 'db', 'sqlserver', '14_crear_superuser.sql'),
      join(__dirname, 'db', 'sqlserver', '15_cierre_caja_control.sql'),
      join(__dirname, 'db', 'sqlserver', '16_mejoras_reportes_ficha.sql')
    ];

    for (const file of files) {
      if (!existsSync(file)) {
        console.warn(`⚠️ Archivo omitido (no existe): ${file}`);
        continue;
      }
      console.log(`📖 Leyendo archivo: ${file}`);
      const sqlText = readFileSync(file, 'utf8');
      const statements = sqlText.split(/\bGO\b/i).map(s => s.trim()).filter(Boolean);

      for (let i = 0; i < statements.length; i++) {
        let stmt = statements[i];
        if (stmt.toLowerCase().startsWith('use ')) {
          continue;
        }
        console.log(`Result: Ejecutando lote ${i+1}/${statements.length}...`);
        await pool.request().query(stmt);
      }
    }

    console.log('🎉 Migración completada con éxito.');
    await pool.close();
  } catch (err) {
    console.error('❌ Error ejecutando migración:', err);
    process.exit(1);
  }
}

run();
