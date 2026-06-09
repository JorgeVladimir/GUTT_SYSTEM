/**
 * server.js - API server Node.js para Caja de Ahorro Patate
 * Conecta a Informix via PowerShell 32-bit bridge (compatibilidad con driver IBM Informix x86).
 *
 * Inicio: node server.js
 * Puerto: 8080 (configurable via API_PORT en api/.env)
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// ─── 1. Cargar api/.env ────────────────────────────────────────────────────
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

// ─── 2. Express + cors ────────────────────────────────────────────────────
let express, cors;
try {
  express = require('express');
  cors    = require('cors');
} catch {
  console.error('❌ Falta instalar dependencias. Ejecuta: npm install');
  process.exit(1);
}

// ─── 3. Construir connection string ODBC Informix ─────────────────────────
function buildConnString() {
  return (
    `Driver={${process.env.INFORMIX_ODBC_DRIVER || 'IBM INFORMIX ODBC DRIVER'}};` +
    `Host=${process.env.INFORMIX_HOST};` +
    `Server=${process.env.INFORMIX_SERVER};` +
    `Service=${process.env.INFORMIX_PORT || '1526'};` +
    `Protocol=${process.env.INFORMIX_PROTOCOL || 'onsoctcp'};` +
    `Database=${process.env.INFORMIX_DATABASE};` +
    `UID=${process.env.INFORMIX_USER};` +
    `PWD=${process.env.INFORMIX_PASSWORD};`
  );
}

// ─── 4. PowerShell 32-bit bridge → Informix ──────────────────────────────
const PS32      = 'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
const PS_BRIDGE = join(__dirname, 'api', 'informix-bridge.ps1');

function queryInformix(sql, params = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ connStr: buildConnString(), sql, params });

    const proc = spawn(PS32, [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', PS_BRIDGE,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });
    proc.stdin.write(payload, 'utf8');
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Informix query timeout (25s)'));
    }, 25000);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        const msg = stderr.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 400);
        return reject(new Error(msg || `PowerShell exit ${code}`));
      }
      try {
        const json = stdout.trim();
        resolve(json && json !== 'null' ? JSON.parse(json) : []);
      } catch {
        reject(new Error(`JSON inválido del bridge: ${stdout.substring(0, 200)}`));
      }
    });
    proc.on('error', reject);
  });
}

// ─── 5. Mapeo de roles desde bcaperf ─────────────────────────────────────
function mapRole(raw) {
  const r = (raw || '').toUpperCase().trim();
  const exact = ['ADMIN', 'MANAGER', 'ACCOUNTANT', 'TELLER', 'MEMBER', 'CREDIT_OFFICER'];
  if (exact.includes(r)) return r;
  if (/SYSTE|SISTE|ADMIN|DIRECTIV/.test(r))        return 'ADMIN';
  if (/GERENCIA|GERENTE|JEFE/.test(r))             return 'MANAGER';
  if (/CONTAB|AUDITOR|FINANC/.test(r))             return 'ACCOUNTANT';
  if (/CAJA|VENTANILLA|OPERAC|RECEPCION/.test(r))  return 'TELLER';
  if (/CARTERA|CR[EÉ]DITO|ASESOR/.test(r))         return 'CREDIT_OFFICER';
  return 'MEMBER';
}

// ─── 6. Inferir tipo de cuenta desde bcatcdv ─────────────────────────────
function inferAccountType(code, desc) {
  const c = (code || '').toUpperCase().trim();
  const d = (desc || '').toUpperCase().trim();
  const savCodes  = (process.env.INFORMIX_TCDV_SAVINGS_CODES     || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const certCodes = (process.env.INFORMIX_TCDV_CERTIFICATE_CODES || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (c && savCodes.includes(c))         return 'AHORRO_VISTA';
  if (c && certCodes.includes(c))        return 'CERTIFICADO_APORTACION';
  if (/AHORRO|VISTA/.test(d))            return 'AHORRO_VISTA';
  if (/CERTIFICADO|APORTACION/.test(d))  return 'CERTIFICADO_APORTACION';
  return null;
}

// ─── 7. Express app ───────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  bridge: 'PowerShell 32-bit',
  informix: `${process.env.INFORMIX_HOST}:${process.env.INFORMIX_PORT}/${process.env.INFORMIX_DATABASE}`,
}));

// ── POST /api/auth/login.php ──────────────────────────────────────────────
app.post('/api/auth/login.php', async (req, res) => {
  const { id, pin } = req.body || {};
  if (!id || !pin) return res.status(400).json({ ok: false, error: 'id y pin son requeridos' });

  // usua_cod_usua es numérico — comparar como integer
  const numId = parseInt(id.trim(), 10);
  if (isNaN(numId)) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

  try {
    const sql = process.env.INFORMIX_LOGIN_QUERY ||
      `SELECT FIRST 1
         u.usua_cod_usua                              AS id,
         TRIM(u.usua_nom_usua)                        AS name,
         TRIM(u.usua_passwd)                          AS pin,
         TRIM(NVL(p.perf_des_perf, 'CONSULTAS'))     AS role
       FROM afccajapatate:bcausua u
       LEFT JOIN afccajapatate:bcaperf p ON p.perf_cod_perf = u.usua_cod_perf
       WHERE u.usua_cod_usua = ?`;

    const rows = await queryInformix(sql, [numId]);
    if (!rows || rows.length === 0)
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    const row = rows[0];
    if ((row.pin || '').trim() !== pin.trim())
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    return res.json({
      id:            String(row.id || '').trim(),
      name:          (row.name || '').trim(),
      pin:           (row.pin  || '').trim(),
      role:          mapRole(row.role || ''),
      accounts:      [],
      transactions:  [],
      loans:         [],
      needsPinChange: false,
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/users/get_profile.php?id=xxx ────────────────────────────────
app.get('/api/users/get_profile.php', async (req, res) => {
  const raw   = ((req.query.id || '') + '').trim();
  const numId = parseInt(raw, 10);
  if (!raw || isNaN(numId)) return res.status(400).json({ ok: false, error: 'id numérico requerido' });

  try {
    const profileSql = process.env.INFORMIX_PROFILE_QUERY ||
      `SELECT FIRST 1
         u.usua_cod_usua                              AS id,
         TRIM(u.usua_nom_usua)                        AS name,
         TRIM(u.usua_passwd)                          AS pin,
         TRIM(NVL(p.perf_des_perf, 'CONSULTAS'))     AS role
       FROM afccajapatate:bcausua u
       LEFT JOIN afccajapatate:bcaperf p ON p.perf_cod_perf = u.usua_cod_perf
       WHERE u.usua_cod_usua = ?`;

    const profileRows = await queryInformix(profileSql, [numId]);
    if (!profileRows || profileRows.length === 0)
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const row  = profileRows[0];
    const user = {
      id:            String(row.id || '').trim(),
      name:          (row.name || '').trim(),
      pin:           (row.pin  || '').trim(),
      role:          mapRole(row.role || ''),
      accounts:      [],
      transactions:  [],
      loans:         [],
      needsPinChange: false,
    };

    // Cuentas del socio (bcadpvi + bcatcdv)
    try {
      const accountsSql = process.env.INFORMIX_ACCOUNTS_QUERY ||
        `SELECT
           dpvi.cod_dpvi                                            AS account_id,
           dpvi.num_cuen                                           AS account_number,
           NVL(dpvi.sld_disp, NVL(dpvi.sld_cont, NVL(dpvi.sld_act, 0))) AS balance,
           TRIM(NVL(dpvi.cod_mone, 'USD'))                        AS currency,
           TRIM(NVL(dpvi.cod_tcdv, ''))                           AS product_code,
           TRIM(NVL(tcdv.des_tcdv, ''))                           AS product_name
         FROM afccajapatate:bcadpvi dpvi
         LEFT JOIN afccajapatate:bcatcdv tcdv ON tcdv.cod_tcdv = dpvi.cod_tcdv
         WHERE dpvi.cod_soci = ?`;

      const acctRows = await queryInformix(accountsSql, [numId]);
      user.accounts = (acctRows || [])
        .map(r => {
          const type = inferAccountType(r.product_code, r.product_name);
          if (!type || !r.account_number) return null;
          return {
            id:       String(r.account_id || r.account_number).trim(),
            type,
            number:   String(r.account_number).trim(),
            balance:  parseFloat(r.balance) || 0,
            currency: (r.currency || 'USD').trim(),
          };
        })
        .filter(Boolean);
    } catch (acctErr) {
      console.warn('[get_profile] accounts:', acctErr.message);
    }

    return res.json(user);
  } catch (err) {
    console.error('[get_profile]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/reports/generate.php ───────────────────────────────────────
app.post('/api/reports/generate.php', async (req, res) => {
  const { type } = req.body || {};
  if (!type) return res.status(400).json({ ok: false, error: 'type requerido' });
  const customSql = process.env.INFORMIX_REPORT_QUERY || '';
  if (!customSql) return res.json([]);
  try {
    const rows = await queryInformix(customSql, [type]);
    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error('[reports]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── 8. Iniciar servidor ──────────────────────────────────────────────────
const PORT = parseInt(process.env.API_PORT || '8080', 10);
app.listen(PORT, () => {
  console.log('');
  console.log('════════════════════════════════════════════════════');
  console.log('  🏦  Caja de Ahorro Patate - API Server');
  console.log(`  📡  http://localhost:${PORT}/api/health`);
  console.log(`  🗄️   Informix: ${process.env.INFORMIX_HOST}:${process.env.INFORMIX_PORT}/${process.env.INFORMIX_DATABASE}`);
  console.log('  🔌  Bridge: PowerShell 32-bit → IBM Informix ODBC x86');
  console.log('════════════════════════════════════════════════════');
  console.log('');
});
