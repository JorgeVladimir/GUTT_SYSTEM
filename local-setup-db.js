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

if (process.env.SQL_SERVER_PORT) {
  sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
}
if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
}

async function run() {
  console.log(`🚀 Conectando a ${sqlConfig.server}\\${sqlConfig.options.instanceName || ''} e iniciando configuración local de base de datos...`);
  try {
    const pool = await sql.connect(sqlConfig);
    console.log('✅ Conexión establecida.');

    const files = [
      join(__dirname, 'db', 'sqlserver', '01_integracion_usuarios_informix.sql'),
      join(__dirname, 'db', 'sqlserver', '04_integracion_clientes_informix.sql'),
      join(__dirname, 'db', 'sqlserver', '06_registro_socios_app.sql'),
      join(__dirname, 'db', 'sqlserver', '07_auditoria_y_registro_socios_update.sql'),
      join(__dirname, 'db', 'sqlserver', '08_cuentas_y_parametros_productos.sql'),
      join(__dirname, 'db', 'sqlserver', '09_activacion_banca_linea.sql'),
      join(__dirname, 'db', 'sqlserver', '09_denominaciones_y_reporte_cajas.sql'),
      join(__dirname, 'db', 'sqlserver', '10_tasas_credito.sql'),
      join(__dirname, 'db', 'sqlserver', '11_agente_engrams.sql'),
      join(__dirname, 'db', 'sqlserver', '12_solicitudes_credito_socioid.sql'),
      join(__dirname, 'db', 'sqlserver', '13_solicitudes_credito_origen.sql'),
      join(__dirname, 'db', 'sqlserver', '14_crear_superuser.sql'),
      join(__dirname, 'db', 'sqlserver', '15_cierre_caja_control.sql'),
      join(__dirname, 'db', 'sqlserver', '16_mejoras_reportes_ficha.sql'),
      join(__dirname, 'db', 'sqlserver', '17_gestion_creditos_seps.sql'),
      join(__dirname, 'db', 'sqlserver', '18_cedula_excepcion_seps.sql')
    ];

    for (const file of files) {
      if (!existsSync(file)) {
        console.warn(`⚠️ Archivo omitido (no existe): ${file}`);
        continue;
      }
      console.log(`📖 Ejecutando archivo: ${file}`);
      const sqlText = readFileSync(file, 'utf8');
      
      // Separamos por la palabra clave GO (ignorando mayúsculas/minúsculas)
      const statements = sqlText.split(/\bGO\b/i).map(s => s.trim()).filter(Boolean);

      for (let i = 0; i < statements.length; i++) {
        let stmt = statements[i];
        if (stmt.toLowerCase().startsWith('use ')) {
          continue; // Ignorar sentencias USE para evitar cambiar de BD
        }
        try {
          await pool.request().query(stmt);
        } catch (stmtErr) {
          console.error(`❌ Error en lote ${i+1}/${statements.length}:`, stmtErr.message);
          console.log(`Lote fallido:\n${stmt.substring(0, 300)}...\n`);
        }
      }
    }

    console.log('🎉 Estructura de base de datos local completada con éxito.');
    await pool.close();
  } catch (err) {
    console.error('❌ Error general durante la inicialización:', err);
    process.exit(1);
  }
}

run();
