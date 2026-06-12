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

loadDotEnv(join(__dirname, '..', 'api', '.env'));

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

const engramPayload = {
  clave: 'agent-plan-status',
  modulo: 'PlanStatus',
  contenido: {
    completedTasks: [
      "14_crear_superuser.sql migration executed",
      "Created superuser (UsuarioId: superuser, Pin: 1234, role: SUPER_USER)",
      "Separated credit lifecycle into SOLICITADO -> APROBADO -> VIGENTE",
      "Restricted CREDIT_OFFICER (advisor) from approving or disbursing loans",
      "Created endpoints for general, per-socio and bulk loan approve/disburse",
      "Supported bulk approval and disbursement for admins/superusers",
      "Implemented automatic 1.0% commission and 0.5% reserve deductions with SEPS bookkeeping seats",
      "Implemented five legal guarantee types (Solidaria, Prendaria, Hipotecaria, Plazo Fijo, Grupo Solidario)",
      "Implemented ReportsSociosCreditos dashboard with 4 submodules (General, Search, Profitability, Origins)",
      "Fixed AHORRO_VISTA type conversion database errors in tests and mapped Origen and GarantiaInfo case-insensitively",
      "Fixed blank screen crash on login by moving activeSubView useMemo and handleSubViewChange hooks above early returns in App.tsx",
      "Created Git restore point commit: Restore point: database schema migrated for partner maps and BI",
      "Created and executed database migration 16_mejoras_reportes_ficha.sql to support physical image paths, partner full names, and views"
    ],
    verificationResults: {
      tscCheck: "PASS",
      creditWorkflowTests: "PASS",
      generalIntegrationTests: "PASS",
      databaseMigration: "SUCCESS"
    },
    nextSteps: [
      "Implement Socio Directory to retrieve all partners from RegistroSocios table and support search",
      "Reorganize 'Información Laboral' layout grid in Apertura Form to put geographics (Province, Canton, Parish) in a single row and workplace address and croquis below",
      "Implement physical image storage for map screenshots under uploads/ folder on the server",
      "Store image paths in dbo.SocioUbicacionMapa and dbo.SocioCroquisTrabajo",
      "Retrieve and render screenshots in both edit and print views of 'Ficha de Socio'",
      "Restrict 'Reportería General (BI)' access to ADMIN only",
      "Add CONTROL_CAJA query entity to BI report generator for drawer open/close history",
      "Transform 'Estado de Situación General' into a global managerial dashboard with key KPIs and recharts Pie Chart"
    ]
  },
  usuario: 'antigravity-agent'
};

async function run() {
  try {
    const pool = await sql.connect(sqlConfig);
    console.log('✅ Connected to database for Engram update.');

    const contentStr = JSON.stringify(engramPayload.contenido);
    
    // safe upsert in T-SQL
    await pool.request()
      .input('clave', sql.NVarChar(100), engramPayload.clave)
      .input('modulo', sql.NVarChar(50), engramPayload.modulo)
      .input('contenido', sql.NVarChar(sql.MAX), contentStr)
      .input('usuario', sql.NVarChar(50), engramPayload.usuario)
      .query(`
        MERGE INTO dbo.AgenteEngrams AS target
        USING (SELECT @clave AS Clave) AS source
        ON (target.Clave = source.Clave)
        WHEN MATCHED THEN
          UPDATE SET Modulo = @modulo, Contenido = @contenido, FechaActualizacion = SYSDATETIME(), UsuarioModificacion = @usuario
        WHEN NOT MATCHED THEN
          INSERT (Clave, Modulo, Contenido, FechaActualizacion, UsuarioModificacion)
          VALUES (@clave, @modulo, @contenido, SYSDATETIME(), @usuario);
      `);

    console.log('✅ Upserted agent-plan-status Engram successfully.');
    
    // Read back to confirm
    const checkRes = await pool.request()
      .input('clave', sql.NVarChar(100), engramPayload.clave)
      .query('SELECT * FROM dbo.AgenteEngrams WHERE Clave = @clave');
    
    console.log('Verification read back:', JSON.stringify(checkRes.recordset, null, 2));

    await pool.close();
  } catch (err) {
    console.error('❌ Error updating Engram:', err.message);
  }
}

run();
