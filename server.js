/**
 * server.js - API server Node.js para Gutt System
 * Conecta a Informix via PowerShell 32-bit bridge (compatibilidad con driver IBM Informix x86).
 *
 * Inicio: node server.js
 * Puerto: 8080 (configurable via API_PORT en api/.env)
 */

import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import sql from 'mssql';
import nodemailer from 'nodemailer';

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

// ─── 1.5 Configuración SQL Server ───────────────────────────────────────────────
const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

if (process.env.SQL_SERVER_PORT) {
  sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
} else if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
} else {
  sqlConfig.port = 1433;
}

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

// ─── 6.5 Enviar Correo de Verificación ──────────────────────────────────────
async function sendVerificationEmail(email, code, name) {
  const cleanEmail = (email || '').trim();
  const cleanName = (name || 'Socio').trim();
  
  console.log('================================================================');
  console.log(`📧 [MOCK EMAIL SENDER]`);
  console.log(`Para: ${cleanEmail}`);
  console.log(`Asunto: Código de Activación - Banca Móvil Gutt`);
  console.log(`Mensaje: Estimado(a) ${cleanName}, su código de activación es: ${code}`);
  console.log('================================================================');

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: port == 465,
        auth: { user, pass }
      });

      await transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || 'Gutt System'}" <${process.env.SMTP_FROM_EMAIL || user}>`,
        to: cleanEmail,
        subject: 'Código de Activación de Banca en Línea',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #005930; text-align: center;">GUTT SYSTEM</h2>
            <p>Estimado(a) <strong>${cleanName}</strong>,</p>
            <p>Para ingresar a su banca en línea debe validar su correo electrónico ingresando el código de confirmación de 6 dígitos:</p>
            <div style="background-color: #ecfdf5; border: 1px solid #d1fae5; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <span style="font-size: 28px; font-weight: bold; color: #047857; letter-spacing: 5px;">${code}</span>
            </div>
            <p>De la misma manera, recuerde que su PIN temporal de ingreso registrado es de 4 dígitos.</p>
            <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
              Este es un correo automático, por favor no responda a este mensaje.
            </p>
          </div>
        `
      });
      console.log(`✅ Correo real enviado exitosamente a ${cleanEmail}`);
    } catch (err) {
      console.error(`❌ Error al enviar correo real:`, err.message);
    }
  } else {
    console.log(`ℹ️ SMTP no configurado. El correo se simuló en consola.`);
  }
}

// ─── 7. Express app ───────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure uploads directory exists and is served statically
const uploadsDir = join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  bridge: 'PowerShell 32-bit',
  informix: `${process.env.INFORMIX_HOST}:${process.env.INFORMIX_PORT}/${process.env.INFORMIX_DATABASE}`,
}));

// ── POST /api/auth/login.php ──────────────────────────────────────────────
app.post('/api/auth/login.php', async (req, res) => {
  const { id, pin } = req.body || {};
  if (!id || !pin) return res.status(400).json({ ok: false, error: 'id y contraseña son requeridos' });

  const cleanId = id.trim().toLowerCase();
  const cleanPin = pin.trim();

  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('id', sql.NVarChar(20), cleanId)
      .query('SELECT UsuarioId, NombreCompleto, Pin, PasswordHash, Rol, Activo, ImpresoraPredeterminada, RequiereCambioPin FROM dbo.Usuarios WHERE UsuarioId = @id');

    if (result.recordset.length === 0) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }
    
    const user = result.recordset[0];
    if (!user.Activo) {
      return res.status(401).json({ ok: false, error: 'Usuario inactivo' });
    }
    
    // Verificar contraseña (usar PasswordHash si existe, de lo contrario usar Pin)
    const storedPassword = user.PasswordHash || user.Pin;
    if (storedPassword !== cleanPin) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }
    
    return res.json({
      id:            user.UsuarioId,
      name:          user.NombreCompleto,
      pin:           storedPassword,
      role:          user.Rol,
      impresora:     user.ImpresoraPredeterminada || '',
      accounts:      [],
      transactions:  [],
      loans:         [],
      needsPinChange: user.RequiereCambioPin === 1 || user.RequiereCambioPin === true,
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/auth/update_password ──────────────────────────────────────────
app.post('/api/auth/update_password', async (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ ok: false, error: 'id y contraseña son requeridos' });
  try {
    const pool = await sql.connect(sqlConfig);
    await pool.request()
      .input('id', sql.NVarChar(20), id.trim().toLowerCase())
      .input('password', sql.NVarChar(100), password.trim())
      .query('UPDATE dbo.Usuarios SET PasswordHash = @password, RequiereCambioPin = 0, FechaActualizacion = SYSDATETIME() WHERE UsuarioId = @id');
    
    // Inserción en tabla de auditoría
    await pool.request()
      .input('UsuarioId', sql.NVarChar(20), id.trim().toLowerCase())
      .input('Concepto', sql.NVarChar(100), 'Actualización de Contraseña')
      .input('Detalle', sql.NVarChar(500), 'El usuario actualizó su contraseña de acceso.')
      .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@UsuarioId, @Concepto, @Detalle)');

    return res.json({ ok: true, message: 'Contraseña actualizada con éxito y registrada en auditoría' });
  } catch (err) {
    console.error('[update_password]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/users/update_printer ──────────────────────────────────────────
app.post('/api/users/update_printer', async (req, res) => {
  const { id, printer } = req.body || {};
  if (!id || !printer) return res.status(400).json({ ok: false, error: 'id e impresora son requeridos' });
  try {
    const pool = await sql.connect(sqlConfig);
    await pool.request()
      .input('id', sql.NVarChar(20), id.trim().toLowerCase())
      .input('printer', sql.NVarChar(100), printer.trim())
      .query('UPDATE dbo.Usuarios SET ImpresoraPredeterminada = @printer, FechaActualizacion = SYSDATETIME() WHERE UsuarioId = @id');
    return res.json({ ok: true, message: 'Impresora predeterminada actualizada' });
  } catch (err) {
    console.error('[update_printer]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/users/get_profile.php?id=xxx ────────────────────────────────
app.get('/api/users/get_profile.php', async (req, res) => {
  const id = ((req.query.id || '') + '').trim().toLowerCase();
  if (!id) return res.status(400).json({ ok: false, error: 'id es requerido' });

  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('id', sql.NVarChar(20), id)
      .query('SELECT UsuarioId, NombreCompleto, Pin, PasswordHash, Rol, Activo, ImpresoraPredeterminada, RequiereCambioPin FROM dbo.Usuarios WHERE UsuarioId = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    
    const user = result.recordset[0];
    const profile = {
      id:            user.UsuarioId,
      name:          user.NombreCompleto,
      pin:           user.PasswordHash || user.Pin,
      role:          user.Rol,
      impresora:     user.ImpresoraPredeterminada || '',
      accounts:      [],
      transactions:  [],
      loans:         [],
      needsPinChange: user.RequiereCambioPin === 1 || user.RequiereCambioPin === true,
    };

    return res.json(profile);
  } catch (err) {
    console.error('[get_profile]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/reports/generate.php ───────────────────────────────────────
app.post('/api/reports/generate.php', async (req, res) => {
  const { type } = req.body || {};
  if (!type) return res.status(400).json({ ok: false, error: 'type requerido' });

  try {
    const pool = await sql.connect(sqlConfig);

    if (type === 'sp_r_bal_compro') {
      // Balance de Comprobación — desde RegistroContable real
      const result = await pool.request().query(`
        SELECT CuentaContable AS code, CuentaContable AS name,
          SUM(Debe) AS debe, SUM(Haber) AS haber,
          SUM(Debe) - SUM(Haber) AS balance,
          COUNT(*) AS movimientos
        FROM dbo.RegistroContable
        GROUP BY CuentaContable
        ORDER BY CuentaContable
      `);
      return res.json(result.recordset.map(r => ({
        code:    r.code,
        name:    r.name,
        debe:    parseFloat(r.debe  || 0),
        haber:   parseFloat(r.haber || 0),
        balance: parseFloat(r.balance || 0),
        movimientos: r.movimientos
      })));
    }

    if (type === 'sp_r_situa_gene') {
      // Situación General — cuentas, saldos, créditos
      const [socios, balances, creditos, dpf] = await Promise.all([
        pool.request().query(`SELECT COUNT(*) AS total FROM dbo.RegistroSocios WHERE Estado='ACTIVO'`),
        pool.request().query(`
          SELECT SUM(CASE WHEN p.EsCertificado=0 THEN c.Saldo ELSE 0 END) AS ahorro,
                 SUM(CASE WHEN p.EsCertificado=1 THEN c.Saldo ELSE 0 END) AS certificados
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        `),
        pool.request().query(`SELECT COUNT(*) AS total, SUM(Monto) AS cartera FROM dbo.Creditos WHERE Estado IN ('VIGENTE','APROBADO')`),
        pool.request().query(`SELECT COUNT(*) AS total, SUM(MontoCapital) AS capital FROM dbo.DepositosPlazo WHERE Estado='ACTIVO'`),
      ]);
      return res.json([
        { code: '1', name: 'Total Socios Activos',          balance: socios.recordset[0].total },
        { code: '2', name: 'Saldo Ahorro Vista',             balance: parseFloat(balances.recordset[0].ahorro || 0) },
        { code: '3', name: 'Certificados de Aportación',     balance: parseFloat(balances.recordset[0].certificados || 0) },
        { code: '4', name: 'Cartera de Crédito Vigente',     balance: parseFloat(creditos.recordset[0].cartera || 0) },
        { code: '5', name: 'Número de Créditos Activos',     balance: creditos.recordset[0].total },
        { code: '6', name: 'Capital DPF Activo',             balance: parseFloat(dpf.recordset[0].capital || 0) },
        { code: '7', name: 'Número de DPF Activos',          balance: dpf.recordset[0].total },
        { code: '8', name: 'Total Captaciones (Ahorro+DPF)', balance: parseFloat(balances.recordset[0].ahorro || 0) + parseFloat(dpf.recordset[0].capital || 0) },
      ]);
    }

    if (type === 'sp_sepsb11') {
      // Estructura B11 — cartera por estado
      const result = await pool.request().query(`
        SELECT Estado AS code, Estado AS name, COUNT(*) AS cantidad, SUM(Monto) AS balance
        FROM dbo.Creditos
        GROUP BY Estado
        ORDER BY Estado
      `);
      return res.json(result.recordset.map(r => ({
        code: r.code, name: r.name,
        balance: parseFloat(r.balance || 0),
        movimientos: r.cantidad
      })));
    }

    if (type === 'sp_uaf_matriz') {
      // Matriz UAF — últimas transacciones grandes (≥ $5000)
      const result = await pool.request().query(`
        SELECT TOP 100 rc.AsientoId AS code, rc.Concepto AS name,
          rc.Debe AS debe, rc.Haber AS haber,
          (rc.Debe + rc.Haber) AS balance,
          rc.NumeroCuenta, CONVERT(NVARCHAR(10), rc.Fecha, 23) AS fecha
        FROM dbo.RegistroContable rc
        WHERE (rc.Debe >= 5000 OR rc.Haber >= 5000)
        ORDER BY rc.AsientoId DESC
      `);
      return res.json(result.recordset.map(r => ({
        code: String(r.code), name: `${r.name} | Cta:${r.NumeroCuenta} | ${r.fecha}`,
        balance: parseFloat(r.balance || 0)
      })));
    }

    return res.json([]);
  } catch (err) {
    console.error('[reports]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/registrar ───────────────────────────────────────────────
app.post('/api/socios/registrar', async (req, res) => {
  const {
    tipoPersona,
    tipoIdentificacion,
    identificacion,
    primerNombre,
    segundoNombre,
    primerApellido,
    segundoApellido,
    soloUnNombre,
    soloUnApellido,
    email,
    telefono,
    fechaNacimiento,
    estadoCivil,
    pin,
    paisNacimiento,
    provinciaNacimiento,
    cantonNacimiento,
    parroquiaNacimiento,
    paisResidencia,
    provinciaResidencia,
    cantonResidencia,
    parroquiaResidencia,
    direccionDomicilio,
    lugarTrabajo,
    provinciaTrabajo,
    cantonTrabajo,
    parroquiaTrabajo,
    cedulaConyuge,
    nombreConyuge,
    telefonoConyuge,
    etnia,
    genero,
    nivelInstruccion,
    profesion,
    referenciasPersonales,
    cargasFamiliares,
    usuarioRegistro,
    emailConfirmado,
    idConExcepcion,
    caraFrontal,
    caraPosterior
  } = req.body || {};

  if (!identificacion || !primerNombre || !primerApellido || !pin || !email) {
    return res.status(400).json({ ok: false, error: 'Identificación, nombre, apellido, correo electrónico y PIN son requeridos' });
  }

  // Generar código de activación de 6 dígitos
  const codigoActivacion = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`\n==================================================================`);
  console.log(`📧 [MOCK EMAIL DISPATCH] Código enviado a: ${email}`);
  console.log(`🔑 Código de Activación: ${codigoActivacion}`);
  console.log(`==================================================================\n`);

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    // Check if duplicate Identification exists
    const duplicateCheck = await pool.request()
      .input('Identificacion', sql.NVarChar(20), identificacion)
      .query(`SELECT COUNT(*) as count FROM dbo.RegistroSocios WHERE Identificacion = @Identificacion AND Estado = 'ACTIVO'`);

    if (duplicateCheck.recordset[0].count > 0) {
      await pool.close();
      return res.status(400).json({ ok: false, error: `La identificación ${identificacion} ya se encuentra registrada en el sistema.` });
    }

    const result = await pool.request()
      .input('TipoPersona', sql.NVarChar(20), tipoPersona)
      .input('TipoIdentificacion', sql.NVarChar(20), tipoIdentificacion)
      .input('Identificacion', sql.NVarChar(20), identificacion)
      .input('PrimerNombre', sql.NVarChar(50), primerNombre)
      .input('SegundoNombre', sql.NVarChar(50), segundoNombre)
      .input('PrimerApellido', sql.NVarChar(50), primerApellido)
      .input('SegundoApellido', sql.NVarChar(50), segundoApellido)
      .input('SoloUnNombre', sql.Bit, soloUnNombre ? 1 : 0)
      .input('SoloUnApellido', sql.Bit, soloUnApellido ? 1 : 0)
      .input('Email', sql.NVarChar(100), email)
      .input('Telefono', sql.NVarChar(20), telefono)
      .input('FechaNacimiento', sql.Date, fechaNacimiento)
      .input('EstadoCivil', sql.NVarChar(20), estadoCivil)
      .input('PIN', sql.NVarChar(4), pin)
      .input('PaisNacimiento', sql.NVarChar(50), paisNacimiento)
      .input('ProvinciaNacimiento', sql.NVarChar(50), provinciaNacimiento)
      .input('CantonNacimiento', sql.NVarChar(50), cantonNacimiento)
      .input('ParroquiaNacimiento', sql.NVarChar(50), parroquiaNacimiento)
      .input('PaisResidencia', sql.NVarChar(50), paisResidencia)
      .input('ProvinciaResidencia', sql.NVarChar(50), provinciaResidencia)
      .input('CantonResidencia', sql.NVarChar(50), cantonResidencia)
      .input('ParroquiaResidencia', sql.NVarChar(50), parroquiaResidencia)
      .input('DireccionDomicilio', sql.NVarChar(200), direccionDomicilio)
      .input('LugarTrabajo', sql.NVarChar(200), lugarTrabajo)
      .input('ProvinciaTrabajo', sql.NVarChar(50), provinciaTrabajo)
      .input('CantonTrabajo', sql.NVarChar(50), cantonTrabajo)
      .input('ParroquiaTrabajo', sql.NVarChar(50), parroquiaTrabajo)
      .input('CedulaConyuge', sql.NVarChar(20), (cedulaConyuge && cedulaConyuge.trim()) ? cedulaConyuge : null)
      .input('NombreConyuge', sql.NVarChar(150), (nombreConyuge && nombreConyuge.trim()) ? nombreConyuge : null)
      .input('TelefonoConyuge', sql.NVarChar(20), (telefonoConyuge && telefonoConyuge.trim()) ? telefonoConyuge : null)
      .input('Etnia', sql.NVarChar(20), etnia)
      .input('Genero', sql.NVarChar(20), genero)
      .input('NivelInstruccion', sql.NVarChar(50), nivelInstruccion)
      .input('Profesion', sql.NVarChar(100), profesion)
      .input('ReferenciasPersonales', sql.NVarChar(sql.MAX), JSON.stringify(referenciasPersonales || []))
      .input('CargasFamiliares', sql.NVarChar(sql.MAX), JSON.stringify(cargasFamiliares || []))
      .input('UsuarioRegistro', sql.NVarChar(50), usuarioRegistro)
      .input('CodigoActivacion', sql.NVarChar(10), codigoActivacion)
      .input('EmailConfirmado', sql.Bit, emailConfirmado ? 1 : 0)
      .output('SOCIOID', sql.BigInt)
      .execute('dbo.usp_RegistrarSocio');

    const socioId = result.output.SOCIOID;
    const numeroSocio = result.recordset?.[0]?.NumeroSocio;

    // Guardar en la nueva tabla de activación
    await pool.request()
      .input('SocioId', sql.BigInt, socioId)
      .input('PIN', sql.NVarChar(4), pin)
      .input('CodigoVerificacion', sql.NVarChar(10), codigoActivacion)
      .query(`
        INSERT INTO dbo.ActivacionBancaLinea (SocioId, PIN, CodigoVerificacion, FechaRegistro, AceptoDatosPersonales, Activo)
        VALUES (@SocioId, @PIN, @CodigoVerificacion, SYSDATETIME(), 0, 0)
      `);

    // Guardar imágenes de la excepción de cédula si aplica
    if (idConExcepcion) {
      let rutaCaraFrontal = null;
      let rutaCaraPosterior = null;

      if (caraFrontal) {
        const base64Data = caraFrontal.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `cedula_frontal_${socioId}.png`;
        writeFileSync(join(uploadsDir, filename), buffer);
        rutaCaraFrontal = `/uploads/${filename}`;
      }

      if (caraPosterior) {
        const base64Data = caraPosterior.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `cedula_posterior_${socioId}.png`;
        writeFileSync(join(uploadsDir, filename), buffer);
        rutaCaraPosterior = `/uploads/${filename}`;
      }

      await pool.request()
        .input('SocioId', sql.BigInt, socioId)
        .input('Identificacion', sql.NVarChar(20), identificacion)
        .input('RutaCaraFrontal', sql.NVarChar(250), rutaCaraFrontal)
        .input('RutaCaraPosterior', sql.NVarChar(250), rutaCaraPosterior)
        .query(`
          INSERT INTO dbo.SocioDocumentoExcepcion (SOCIOID, Identificacion, RutaCaraFrontal, RutaCaraPosterior, FechaRegistro)
          VALUES (@SocioId, @Identificacion, @RutaCaraFrontal, @RutaCaraPosterior, SYSDATETIME())
        `);
    }

    await pool.close();

    // Enviar correo de verificación (asíncronamente)
    sendVerificationEmail(email, codigoActivacion, `${primerNombre} ${primerApellido}`).catch(console.error);

    return res.json({
      ok: true,
      socioId,
      numeroSocio,
      codigoActivacion,
      message: 'Socio registrado exitosamente'
    });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[registrar socio]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/auth/socio-login ───────────────────────────────────────────────
app.post('/api/auth/socio-login', async (req, res) => {
  const { id, pin } = req.body || {};
  if (!id || !pin) return res.status(400).json({ ok: false, error: 'id y contraseña son requeridos' });

  const cleanId = id.trim();
  const cleanPin = pin.trim();

  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('id', sql.NVarChar(20), cleanId)
      .query(`
        SELECT 
          rs.SOCIOID, rs.PrimerNombre, rs.SegundoNombre, rs.Apellidos, rs.PIN, rs.Email, rs.EmailConfirmado, rs.CodigoActivacion, rs.Telefono, rs.NumeroSocio, rs.Identificacion, rs.DireccionDomicilio, rs.LugarTrabajo, rs.EstadoCivil,
          ab.AceptoDatosPersonales, ab.Activo AS BancaActiva, ab.CodigoVerificacion
        FROM dbo.RegistroSocios rs
        LEFT JOIN dbo.ActivacionBancaLinea ab ON rs.SOCIOID = ab.SocioId
        WHERE rs.Identificacion = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(401).json({ ok: false, error: 'Credenciales de socio inválidas' });
    }
    
    const socio = result.recordset[0];
    if (socio.PIN !== cleanPin) {
      return res.status(401).json({ ok: false, error: 'Credenciales de socio inválidas' });
    }

    // 1. Obtener o inicializar cuentas en CuentasAhorro
    let accountsResult = await pool.request()
      .input('socioId', sql.BigInt, socio.SOCIOID)
      .query(`
        SELECT 
          'ca-' + CAST(c.CuentaId AS NVARCHAR(10)) AS id, 
          CASE WHEN p.EsCertificado = 1 THEN 'CERTIFICADO_APORTACION' ELSE 'AHORRO_VISTA' END AS type, 
          c.NumeroCuenta AS number, 
          CAST(c.Saldo AS FLOAT) AS balance, 
          'USD' AS currency 
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE c.SocioId = @socioId
      `);
    
    let accounts = accountsResult.recordset;
    if (accounts.length === 0) {
      const numCert = '1' + String(socio.SOCIOID).padStart(8, '0');
      const numAho = '2' + String(socio.SOCIOID).padStart(8, '0');
      await pool.request()
        .input('socioId', sql.BigInt, socio.SOCIOID)
        .input('numCert', sql.NVarChar(20), numCert)
        .input('numAho', sql.NVarChar(20), numAho)
        .query(`
          INSERT INTO dbo.CuentasAhorro (SocioId, NumeroCuenta, CodigoProducto, Saldo)
          VALUES 
          (@socioId, @numCert, 1, 0.00),
          (@socioId, @numAho, 2, 0.00)
        `);
      
      accountsResult = await pool.request()
        .input('socioId', sql.BigInt, socio.SOCIOID)
        .query(`
          SELECT 
            'ca-' + CAST(c.CuentaId AS NVARCHAR(10)) AS id, 
            CASE WHEN p.EsCertificado = 1 THEN 'CERTIFICADO_APORTACION' ELSE 'AHORRO_VISTA' END AS type, 
            c.NumeroCuenta AS number, 
            CAST(c.Saldo AS FLOAT) AS balance, 
            'USD' AS currency 
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.SocioId = @socioId
        `);
      accounts = accountsResult.recordset;
    }

    // 2. Obtener préstamos de SolicitudesCredito
    const loansResult = await pool.request()
      .input('identificacion', sql.NVarChar(20), socio.Identificacion)
      .query('SELECT SolicitudID as id, Identificacion as memberId, Monto as amount, Saldo as balance, Tasa as rate, Plazo as installmentsCount, Tipo as type, Estado as status, FechaSolicitud, FechaVencimiento as dueDate, Observaciones as comments, PlanPagos as installments, GarantiaInfo as garantiaInfo, Origen as origen FROM dbo.SolicitudesCredito WHERE Identificacion = @identificacion ORDER BY FechaSolicitud DESC');
    
    const loans = loansResult.recordset.map(loan => ({
      ...loan,
      installments: loan.installments ? JSON.parse(loan.installments) : [],
      garantiaInfo: loan.garantiaInfo ? JSON.parse(loan.garantiaInfo) : null
    }));
    
    return res.json({
      ok: true,
      id: socio.Identificacion,
      socioId: socio.SOCIOID,
      name: `${socio.PrimerNombre} ${socio.Apellidos}`,
      role: 'MEMBER',
      email: socio.Email,
      emailConfirmed: socio.BancaActiva === true || (socio.BancaActiva === null && socio.EmailConfirmado === true),
      aceptoDatosPersonales: socio.AceptoDatosPersonales === true,
      activationCode: socio.CodigoVerificacion || socio.CodigoActivacion || '',
      numeroSocio: socio.NumeroSocio,
      telefono: socio.Telefono || '',
      direccionDomicilio: socio.DireccionDomicilio || '',
      lugarTrabajo: socio.LugarTrabajo || '',
      estadoCivil: socio.EstadoCivil || '',
      accounts,
      transactions: [],
      loans
    });
  } catch (err) {
    console.error('[socio login]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/loans ────────────────────────────────────────────────────
app.get('/api/socios/loans', async (req, res) => {
  const { identificacion } = req.query || {};
  if (!identificacion) return res.status(400).json({ ok: false, error: 'identificacion es requerida' });

  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('identificacion', sql.NVarChar(20), identificacion.trim())
      .query('SELECT SolicitudID as id, Identificacion as memberId, Monto as amount, Saldo as balance, Tasa as rate, Plazo as installmentsCount, Tipo as type, Estado as status, FechaSolicitud, FechaVencimiento as dueDate, Observaciones as comments, PlanPagos as installments, GarantiaInfo as garantiaInfo, Origen as origen FROM dbo.SolicitudesCredito WHERE Identificacion = @identificacion ORDER BY FechaSolicitud DESC');
    
    const loans = result.recordset.map(loan => ({
      ...loan,
      installments: loan.installments ? JSON.parse(loan.installments) : [],
      garantiaInfo: loan.garantiaInfo ? JSON.parse(loan.garantiaInfo) : null
    }));

    return res.json({ ok: true, loans });
  } catch (err) {
    console.error('[get loans]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/loans/all ────────────────────────────────────────────────
app.get('/api/socios/loans/all', async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
      SELECT 
        s.SolicitudID as id, 
        s.Identificacion as memberId, 
        s.SocioID as socioId,
        s.Monto as amount, 
        s.Saldo as balance, 
        s.Tasa as rate, 
        s.Plazo as installmentsCount, 
        s.Tipo as type, 
        s.Estado as status, 
        s.FechaSolicitud, 
        s.FechaVencimiento as dueDate, 
        s.Observaciones as comments, 
        s.PlanPagos as installments,
        s.GarantiaInfo as garantiaInfo,
        s.Origen as origen,
        (SELECT PrimerNombre + ' ' + Apellidos FROM dbo.RegistroSocios WHERE SOCIOID = s.SocioID) as memberName
      FROM dbo.SolicitudesCredito s
      ORDER BY s.FechaSolicitud DESC
    `);
    
    const loans = result.recordset.map(loan => ({
      ...loan,
      installments: loan.installments ? JSON.parse(loan.installments) : [],
      garantiaInfo: loan.garantiaInfo ? JSON.parse(loan.garantiaInfo) : null,
      memberName: loan.memberName || 'Socio Desconocido'
    }));

    return res.json({ ok: true, loans });
  } catch (err) {
    console.error('[get all loans]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/rates ────────────────────────────────────────────────────
app.get('/api/socios/rates', async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
      SELECT 
        CAST(TasaId AS NVARCHAR(10)) AS id,
        LineaCredito AS category,
        CAST(TasaAplicable AS FLOAT) AS rate,
        PlazoMaximo AS maxTerm,
        ClaseCredito AS class,
        CAST(MontoMinimo AS FLOAT) AS minAmount,
        CAST(MontoMaximo AS FLOAT) AS maxAmount,
        PlazoMinimo AS minTerm,
        CAST(TasaFinal AS FLOAT) AS maxRate
      FROM dbo.TasasCredito
    `);
    return res.json({ ok: true, rates: result.recordset });
  } catch (err) {
    console.error('[get rates]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans ───────────────────────────────────────────────────
app.post('/api/socios/loans', async (req, res) => {
  const { id, memberId, amount, balance, rate, installmentsCount, type, status, startDate, dueDate, installments, garantiaInfo, origen } = req.body || {};
  if (!memberId || !amount || !rate || !installmentsCount) {
    return res.status(400).json({ ok: false, error: 'Datos de crédito incompletos' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    // 1. Validar que el socio existe, tiene TipoPersona = 'SOCIO' y Estado = 'ACTIVO'
    const socioCheck = await pool.request()
      .input('memberId', sql.NVarChar(20), memberId)
      .query("SELECT SOCIOID, TipoPersona, Estado FROM dbo.RegistroSocios WHERE Identificacion = @memberId");
    
    if (socioCheck.recordset.length === 0) {
      return res.status(400).json({ ok: false, error: 'El socio especificado no existe en el sistema.' });
    }
    
    const socio = socioCheck.recordset[0];
    if (socio.TipoPersona !== 'SOCIO') {
      return res.status(400).json({ ok: false, error: `La persona especificada no es un SOCIO registrado (Tipo: ${socio.TipoPersona}).` });
    }
    if (socio.Estado !== 'ACTIVO') {
      return res.status(400).json({ ok: false, error: 'El socio especificado no se encuentra activo.' });
    }

    // 2. Validar fondos en Certificados de Aportación (mínimo $1.00)
    const certRes = await pool.request()
      .input('memberId', sql.NVarChar(20), memberId)
      .query(`
        SELECT c.Saldo 
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @memberId)
          AND p.EsCertificado = 1
      `);
    
    const certBalance = certRes.recordset.length > 0 ? parseFloat(certRes.recordset[0].Saldo) : 0;
    if (certBalance < 1.00) {
      return res.status(400).json({ ok: false, error: `El socio debe poseer al menos $1.00 USD en Certificados de Aportación para solicitar un crédito (Saldo actual: $${certBalance.toFixed(2)} USD).` });
    }

    // 2. Validar TEA Límite de la Línea de Crédito
    const rateCheck = await pool.request()
      .input('type', sql.NVarChar(100), type)
      .query('SELECT TasaFinal FROM dbo.TasasCredito WHERE LineaCredito = @type');
    
    if (rateCheck.recordset.length > 0) {
      const maxAllowedRate = parseFloat(rateCheck.recordset[0].TasaFinal);
      if (parseFloat(rate) > maxAllowedRate) {
        return res.status(400).json({ ok: false, error: `La Tasa Efectiva Anual (${rate}%) excede la tasa máxima permitida para esta línea de crédito (${maxAllowedRate}%).` });
      }
    }

    // 3. Generar Código de Solicitud Autoincremental relacionado con SocioID
    const countRes = await pool.request()
      .input('socioId', sql.BigInt, socio.SOCIOID)
      .query('SELECT COUNT(*) as count FROM dbo.SolicitudesCredito WHERE SocioID = @socioId');
    const nextNum = (countRes.recordset[0].count || 0) + 1;
    const autoSolicitudId = `SOL-${socio.SOCIOID}-${String(nextNum).padStart(3, '0')}`;

    // 4. Mapear campos de Garantía Prendaria si aplica
    let tipoPrenda = null;
    let avaluoPrendario = null;
    let observacionTecnicaPrenda = null;
    let valorCobertura = null;

    if (garantiaInfo && garantiaInfo.tipo === 'PRENDARIA') {
      const pr = garantiaInfo.prendaria || {};
      tipoPrenda = pr.tipoPrenda || 'Otros';
      
      const rawAvaluo = pr.avaluo !== undefined ? pr.avaluo : garantiaInfo.avaluoMonto;
      const parsedAvaluo = parseFloat(rawAvaluo);
      
      if (isNaN(parsedAvaluo) || parsedAvaluo < 0) {
        return res.status(400).json({ ok: false, error: 'El valor de la prenda (avaluo) no puede ser negativo o inconsistente.' });
      }
      
      avaluoPrendario = parsedAvaluo;
      observacionTecnicaPrenda = pr.observacion || pr.descripcion || '';
      const numAmount = parseFloat(amount);
      if (numAmount > 0) {
        valorCobertura = parseFloat(((avaluoPrendario / numAmount) * 100).toFixed(2));
      }
    }

    await pool.request()
      .input('id', sql.NVarChar(50), autoSolicitudId)
      .input('socioId', sql.BigInt, socio.SOCIOID)
      .input('memberId', sql.NVarChar(20), memberId)
      .input('amount', sql.Decimal(15,2), amount)
      .input('balance', sql.Decimal(15,2), balance)
      .input('rate', sql.Decimal(5,2), rate)
      .input('installmentsCount', sql.Int, installmentsCount)
      .input('type', sql.NVarChar(100), type)
      .input('status', sql.NVarChar(20), status || 'SOLICITADO')
      .input('dueDate', sql.NVarChar(50), dueDate)
      .input('installments', sql.NVarChar(sql.MAX), JSON.stringify(installments))
      .input('garantiaInfo', sql.NVarChar(sql.MAX), garantiaInfo ? JSON.stringify(garantiaInfo) : null)
      .input('origen', sql.NVarChar(20), origen || 'CAJA_PATATE')
      .input('tipoPrenda', sql.NVarChar(100), tipoPrenda)
      .input('avaluoPrendario', sql.Decimal(15,2), avaluoPrendario)
      .input('observacionTecnicaPrenda', sql.NVarChar(500), observacionTecnicaPrenda)
      .input('valorCobertura', sql.Decimal(10,2), valorCobertura)
      .query(`
        INSERT INTO dbo.SolicitudesCredito (
          SolicitudID, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado, 
          FechaSolicitud, FechaVencimiento, PlanPagos, GarantiaInfo, Origen, 
          TipoPrenda, AvaluoPrendario, ObservacionTecnicaPrenda, ValorCobertura
        )
        VALUES (
          @id, @socioId, @memberId, @amount, @balance, @rate, @installmentsCount, @type, @status, 
          SYSDATETIME(), @dueDate, @installments, @garantiaInfo, @origen, 
          @tipoPrenda, @avaluoPrendario, @observacionTecnicaPrenda, @valorCobertura
        )
      `);

    return res.json({ ok: true, message: 'Solicitud de crédito registrada con éxito', solicitudId: autoSolicitudId });
  } catch (err) {
    console.error('[create loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/update ─────────────────────────────────────────────
app.post('/api/socios/loans/update', async (req, res) => {
  const { id, amount, balance, rate, installmentsCount, installments } = req.body || {};
  if (!id || !amount || !rate || !installmentsCount) {
    return res.status(400).json({ ok: false, error: 'Datos incompletos para actualizar crédito' });
  }

  try {
    const pool = await sql.connect(sqlConfig);
    const checkStatus = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @id');
    
    if (checkStatus.recordset.length === 0) {
      return res.status(404).json({ ok: false, error: 'Crédito no encontrado' });
    }

    if (checkStatus.recordset[0].Estado !== 'SOLICITADO') {
      return res.status(400).json({ ok: false, error: 'No se puede modificar un crédito que ya fue aprobado o rechazado' });
    }

    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('amount', sql.Decimal(15,2), amount)
      .input('balance', sql.Decimal(15,2), balance)
      .input('rate', sql.Decimal(5,2), rate)
      .input('installmentsCount', sql.Int, installmentsCount)
      .input('installments', sql.NVarChar(sql.MAX), JSON.stringify(installments))
      .query('UPDATE dbo.SolicitudesCredito SET Monto = @amount, Saldo = @balance, Tasa = @rate, Plazo = @installmentsCount, PlanPagos = @installments WHERE SolicitudID = @id');

    return res.json({ ok: true, message: 'Solicitud de crédito actualizada con éxito' });
  } catch (err) {
    console.error('[update loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/socios/loans/approve', async (req, res) => {
  const { id, ids, reason, usuarioId, tipoAprobacion, actaSesion, proposedAmount,
          icePorcentaje, iceEstado, iceCuotaMensual, iceIngresoNeto, iceDeudaExterna } = req.body || {};
  const targetIds = Array.isArray(ids) ? ids : (id ? [id] : []);
  if (targetIds.length === 0 || !reason) {
    return res.status(400).json({ ok: false, error: 'ids y dictamen técnico son requeridos' });
  }

  const approverId = (usuarioId || 'asesor').trim().toLowerCase();

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Verificar el rol del usuario aprobador
    const approverRes = await pool.request()
      .input('usuarioId', sql.NVarChar(20), approverId)
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @usuarioId');
    
    const approverRole = approverRes.recordset.length > 0 ? approverRes.recordset[0].Rol : 'CREDIT_OFFICER';

    if (approverRole === 'CREDIT_OFFICER') {
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Los asesores de crédito no tienen permisos para aprobar solicitudes.' });
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      for (const loanId of targetIds) {
        // 1. Obtener la solicitud de crédito
        const checkRes = await transaction.request()
          .input('id', sql.NVarChar(50), loanId)
          .query('SELECT Identificacion, Monto, Plazo, Tasa, Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @id');

        if (checkRes.recordset.length === 0) {
          throw new Error(`Solicitud de crédito ${loanId} no encontrada`);
        }

        const loan = checkRes.recordset[0];
        if (loan.Estado !== 'SOLICITADO') {
          throw new Error(`La solicitud ${loanId} ya no está en estado SOLICITADO (Estado actual: ${loan.Estado})`);
        }

        const loanAmount = parseFloat(loan.Monto);

        // Validar límite por rol si aplica
        if (approverRole === 'MANAGER' && loanAmount > 50000.00) {
          throw new Error(`Límite Excedido: El Jefe de Crédito solo puede aprobar montos de hasta $50,000.00 USD. La solicitud ${loanId} de $${loanAmount.toFixed(2)} USD requiere aprobación de un Administrador.`);
        }

        let finalAmount = loanAmount;
        let newPlanPagos = null;

        // Si se define un monto menor (Análisis de Sensibilidad)
        if (proposedAmount && parseFloat(proposedAmount) < loanAmount) {
          finalAmount = parseFloat(proposedAmount);
          const rateVal = parseFloat(loan.Tasa);
          const termVal = parseInt(loan.Plazo, 10);
          const r = (rateVal / 100) / 12;
          const n = termVal;
          const monthlyPayment = finalAmount * (r / (1 - Math.pow(1 + r, -n)));
          let balance = finalAmount;
          const newInstallments = [];
          for (let i = 1; i <= n; i++) {
            const interest = balance * r;
            const capital = monthlyPayment - interest;
            balance -= capital;
            newInstallments.push({
              number: i,
              date: `Mes ${i}`,
              capital: Math.max(0, parseFloat(capital.toFixed(2))),
              interest: Math.max(0, parseFloat(interest.toFixed(2))),
              total: parseFloat(monthlyPayment.toFixed(2)),
              status: 'PENDIENTE'
            });
          }
          newPlanPagos = JSON.stringify(newInstallments);
        }

        // 2. Actualizar estado del crédito a APROBADO, tipo de aprobación, acta, monto e ICE
        await transaction.request()
          .input('id', sql.NVarChar(50), loanId)
          .input('reason', sql.NVarChar(500), reason)
          .input('tipoAprobacion', sql.NVarChar(50), tipoAprobacion || 'ASESOR')
          .input('actaSesion', sql.NVarChar(100), actaSesion || null)
          .input('monto', sql.Decimal(15, 2), finalAmount)
          .input('newPlanPagos', sql.NVarChar(sql.MAX), newPlanPagos)
          .input('icePorcentaje', sql.Decimal(6, 2), icePorcentaje != null ? parseFloat(icePorcentaje) : null)
          .input('iceEstado', sql.NVarChar(10), iceEstado || null)
          .input('iceCuotaMensual', sql.Decimal(15, 2), iceCuotaMensual != null ? parseFloat(iceCuotaMensual) : null)
          .input('iceIngresoNeto', sql.Decimal(15, 2), iceIngresoNeto != null ? parseFloat(iceIngresoNeto) : null)
          .input('iceDeudaExterna', sql.Decimal(15, 2), iceDeudaExterna != null ? parseFloat(iceDeudaExterna) : null)
          .query(`
            UPDATE dbo.SolicitudesCredito
            SET Estado = 'APROBADO',
                Observaciones = @reason,
                TipoAprobacion = @tipoAprobacion,
                ActaSesion = @actaSesion,
                Monto = @monto,
                Saldo = @monto,
                PlanPagos = COALESCE(@newPlanPagos, PlanPagos),
                ICEPorcentaje     = @icePorcentaje,
                ICEEstado         = @iceEstado,
                ICECuotaMensual   = @iceCuotaMensual,
                ICEIngresoNeto    = @iceIngresoNeto,
                ICEDeudaExterna   = @iceDeudaExterna
            WHERE SolicitudID = @id
          `);

        // 3. Registrar en auditoría
        const auditDetail = `Aprobación de crédito ${loanId} ($${finalAmount.toFixed(2)} USD, Tipo: ${tipoAprobacion || 'ASESOR'}${actaSesion ? `, Acta: ${actaSesion}` : ''}). Dictamen: ${reason}. Aprobado por: ${approverId}`;
        await transaction.request()
          .input('usuarioId', sql.NVarChar(20), approverId)
          .input('concepto', sql.NVarChar(100), 'Aprobación de Crédito')
          .input('detalle', sql.NVarChar(500), auditDetail)
          .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');
      }

      await transaction.commit();
      return res.json({ ok: true, message: `Crédito(s) aprobado(s) con éxito (${targetIds.length} operaciones)` });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[approve loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/disburse ───────────────────────────────────────────
app.post('/api/socios/loans/disburse', async (req, res) => {
  const { id, ids, usuarioId } = req.body || {};
  const targetIds = Array.isArray(ids) ? ids : (id ? [id] : []);
  if (targetIds.length === 0) {
    return res.status(400).json({ ok: false, error: 'ids de crédito son requeridos' });
  }

  const approverId = (usuarioId || 'asesor').trim().toLowerCase();

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Verificar el rol del usuario desembolsador
    const approverRes = await pool.request()
      .input('usuarioId', sql.NVarChar(20), approverId)
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @usuarioId');
    
    const approverRole = approverRes.recordset.length > 0 ? approverRes.recordset[0].Rol : 'CREDIT_OFFICER';

    if (approverRole === 'CREDIT_OFFICER') {
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Los asesores de crédito no tienen permisos para desembolsar fondos.' });
    }

    const successes = [];
    const failures = [];

    // Procesar cada desembolso de manera individual para que la falla de uno no detenga a los demás
    for (const loanId of targetIds) {
      const transaction = pool.transaction();
      try {
        await transaction.begin();

        // 1. Obtener la solicitud de crédito en estado APROBADO
        const checkRes = await transaction.request()
          .input('id', sql.NVarChar(50), loanId)
          .query('SELECT Identificacion, Monto, Plazo, Tasa, Estado, PlanPagos, Origen, SocioID, TipoPrenda, AvaluoPrendario, ObservacionTecnicaPrenda, ValorCobertura, TipoAprobacion, ActaSesion, Tipo FROM dbo.SolicitudesCredito WHERE SolicitudID = @id');

        if (checkRes.recordset.length === 0) {
          throw new Error('Solicitud de crédito no encontrada');
        }

        const loan = checkRes.recordset[0];
        if (loan.Estado !== 'APROBADO') {
          throw new Error(`La solicitud debe estar en estado APROBADO para ser desembolsada (Estado actual: ${loan.Estado})`);
        }

        const loanAmount = parseFloat(loan.Monto);
        const plazoVal = parseInt(loan.Plazo, 10);
        const rateVal = parseFloat(loan.Tasa);

        // 2. Calcular descuentos iniciales contables (SEPS)
        const comision = parseFloat((loanAmount * 0.01).toFixed(2));       // 1.0% Comisión
        const fondo = parseFloat((loanAmount * 0.005).toFixed(2));         // 0.5% Fondo Irrepartible
        const solca = parseFloat((loanAmount * 0.005).toFixed(2));         // 0.5% Retención SOLCA (Contribución Ley SOLCA)
        const totalDescuentos = parseFloat((comision + fondo + solca).toFixed(2));
        const netoDisbursed = parseFloat((loanAmount - totalDescuentos).toFixed(2));

        // 3. Obtener la cuenta de ahorros del socio
        const accountRes = await transaction.request()
          .input('identificacion', sql.NVarChar(20), loan.Identificacion)
          .query(`
            SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
            FROM dbo.CuentasAhorro c
            INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
            WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @identificacion)
              AND p.EsCertificado = 0
          `);

        if (accountRes.recordset.length === 0) {
          throw new Error('Cuenta de ahorros del socio no encontrada');
        }

        const account = accountRes.recordset[0];
        const newBalance = parseFloat(account.Saldo) + netoDisbursed;

        // 4. Actualizar el saldo de la cuenta de ahorros con el neto desembolsado
        await transaction.request()
          .input('cuentaId', sql.Int, account.CuentaId)
          .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
          .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

        // 5. Insertar el registro formal en dbo.Creditos
        const disburseDate = new Date();
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + plazoVal);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        await transaction.request()
          .input('creditoId', sql.NVarChar(50), loanId)
          .input('solicitudId', sql.NVarChar(50), loanId)
          .input('socioId', sql.BigInt, loan.SocioID)
          .input('monto', sql.Decimal(15, 2), loanAmount)
          .input('saldo', sql.Decimal(15, 2), loanAmount)
          .input('tasa', sql.Decimal(5, 2), rateVal)
          .input('plazo', sql.Int, plazoVal)
          .input('tipo', sql.NVarChar(100), loan.Tipo)
          .input('estado', sql.NVarChar(30), 'VIGENTE')
          .input('fechaVencimiento', sql.NVarChar(50), dueDateStr)
          .input('tipoAprobacion', sql.NVarChar(50), loan.TipoAprobacion)
          .input('actaSesion', sql.NVarChar(100), loan.ActaSesion)
          .input('tipoPrenda', sql.NVarChar(100), loan.TipoPrenda)
          .input('avaluoPrendario', sql.Decimal(15,2), loan.AvaluoPrendario)
          .input('observacionTecnicaPrenda', sql.NVarChar(500), loan.ObservacionTecnicaPrenda)
          .input('valorCobertura', sql.Decimal(10,2), loan.ValorCobertura)
          .query(`
            INSERT INTO dbo.Creditos (
              CreditoID, SolicitudID, SocioID, Monto, Saldo, Tasa, Plazo, Tipo, Estado, 
              FechaDesembolso, FechaVencimiento, TipoAprobacion, ActaSesion, 
              TipoPrenda, AvaluoPrendario, ObservacionTecnicaPrenda, ValorCobertura
            )
            VALUES (
              @creditoId, @solicitudId, @socioId, @monto, @saldo, @tasa, @plazo, @tipo, @estado, 
              SYSDATETIME(), @fechaVencimiento, @tipoAprobacion, @actaSesion, 
              @tipoPrenda, @avaluoPrendario, @observacionTecnicaPrenda, @valorCobertura
            )
          `);

        // 6. Generar e Insertar Tabla de Amortización Relacional y Rubros
        const planPagosText = loan.PlanPagos;
        const planSimulado = planPagosText ? JSON.parse(planPagosText) : [];
        const newPlan = [];
        let runningBalance = loanAmount;

        for (const inst of planSimulado) {
          const cuotaDate = new Date(disburseDate);
          cuotaDate.setMonth(cuotaDate.getMonth() + inst.number);
          const cuotaDateStr = cuotaDate.toISOString().split('T')[0];

          const capital = parseFloat(inst.capital);
          const interest = parseFloat(inst.interest);
          
          // Seguro de desgravamen: 0.08% mensual sobre saldo capital
          const seguroDesgravamen = parseFloat((runningBalance * 0.0008).toFixed(2));
          // SOLCA: 0.5% del monto total dividido entre plazo cuotas
          const solcaRubro = parseFloat(((loanAmount * 0.005) / plazoVal).toFixed(2));
          // Gastos Administrativos: 1.50 USD fijos por cuota
          const gastosAdmin = 1.50;
          const installmentTotal = parseFloat((capital + interest + seguroDesgravamen + solcaRubro + gastosAdmin).toFixed(2));

          // Restar capital para el saldo de la siguiente cuota
          runningBalance = Math.max(0, runningBalance - capital);

          const amortRes = await transaction.request()
            .input('creditoId', sql.NVarChar(50), loanId)
            .input('numeroCuota', sql.Int, inst.number)
            .input('fechaPago', sql.NVarChar(50), cuotaDateStr)
            .input('capital', sql.Decimal(15, 2), capital)
            .input('interes', sql.Decimal(15, 2), interest)
            .input('seguroDesgravamen', sql.Decimal(15, 2), seguroDesgravamen)
            .input('contribucionSOLCA', sql.Decimal(15, 2), solcaRubro)
            .input('gastosAdministrativos', sql.Decimal(15, 2), gastosAdmin)
            .input('total', sql.Decimal(15, 2), installmentTotal)
            .query(`
              INSERT INTO dbo.TablaDeAmortizacion (CreditoID, NumeroCuota, FechaPago, Capital, Interes, SeguroDesgravamen, ContribucionSOLCA, GastosAdministrativos, Total, Estado)
              VALUES (@creditoId, @numeroCuota, @fechaPago, @capital, @interes, @seguroDesgravamen, @contribucionSOLCA, @gastosAdministrativos, @total, 'PENDIENTE');
              SELECT SCOPE_IDENTITY() AS id;
            `);
          
          const amortId = amortRes.recordset[0].id;

          // Guardar rubros detallados
          const rubros = [
            { nombre: 'Capital', monto: capital },
            { nombre: 'Interes', monto: interest },
            { nombre: 'Seguro de Desgravamen', monto: seguroDesgravamen },
            { nombre: 'SOLCA', monto: solcaRubro },
            { nombre: 'Gastos Administrativos', monto: gastosAdmin }
          ];

          for (const r of rubros) {
            await transaction.request()
              .input('amortizacionId', sql.Int, amortId)
              .input('nombreRubro', sql.NVarChar(50), r.nombre)
              .input('monto', sql.Decimal(15, 2), r.monto)
              .query("INSERT INTO dbo.RubrosCreditos (AmortizacionID, NombreRubro, Monto, Estado) VALUES (@amortizacionId, @nombreRubro, @monto, 'PENDIENTE')");
          }

          newPlan.push({
            number: inst.number,
            date: cuotaDateStr,
            capital,
            interest,
            seguroDesgravamen,
            contribucionSOLCA: solcaRubro,
            gastosAdministrativos: gastosAdmin,
            total: installmentTotal,
            status: 'PENDIENTE'
          });
        }

        // 7. Actualizar SolicitudesCredito
        const descuentosObj = { comision, fondo, solca, totalDescuentos, netoDisbursed };
        await transaction.request()
          .input('id', sql.NVarChar(50), loanId)
          .input('descuentos', sql.NVarChar(sql.MAX), JSON.stringify(descuentosObj))
          .input('newPlan', sql.NVarChar(sql.MAX), JSON.stringify(newPlan))
          .input('dueDate', sql.NVarChar(50), dueDateStr)
          .query("UPDATE dbo.SolicitudesCredito SET Estado = 'VIGENTE', FechaSolicitud = SYSDATETIME(), FechaVencimiento = @dueDate, DescuentosDesembolso = @descuentos, PlanPagos = @newPlan WHERE SolicitudID = @id");

        // 8. Partida Contable Contraloría SEPS
        const concept = `DESEMBOLSO CRÉDITO ${loanId}`;
        
        // Asiento 1: Debe en Cartera de Créditos Vigentes (1.2.01) por el capital completo solicitado (Activo)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '1.2.01')
          .input('concepto', sql.NVarChar(200), concept)
          .input('debe', sql.Decimal(18, 2), loanAmount)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), approverId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Asiento 2: Haber en Depósitos de Ahorro del Socio por el neto acreditado (Activo/Pasivo interno)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), account.CuentaActiva)
          .input('concepto', sql.NVarChar(200), concept)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), netoDisbursed)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), approverId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Asiento 3: Haber en Cuenta de Ingreso por Comisión (5.2.01) (Ingreso)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '5.2.01')
          .input('concepto', sql.NVarChar(200), `COMISIÓN DESEMBOLSO CRÉDITO ${loanId}`)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), comision)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), approverId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Asiento 4: Haber en Fondo Irrepartible de Reserva (3.2.01) (Patrimonio)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '3.2.01')
          .input('concepto', sql.NVarChar(200), `FONDO IRREPARTIBLE CRÉDITO ${loanId}`)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), fondo)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), approverId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Asiento 5: Haber en Retenciones por Pagar Ley SOLCA (2.5.04) (Pasivo)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '2.5.04')
          .input('concepto', sql.NVarChar(200), `RETENCIÓN SOLCA CRÉDITO ${loanId}`)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), solca)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), approverId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // 9. Registrar en auditoría
        const auditDetail = `Desembolso de fondos de crédito ${loanId} por $${loanAmount.toFixed(2)} USD (Neto: $${netoDisbursed.toFixed(2)} USD, Comisión: $${comision.toFixed(2)} USD, Fondo: $${fondo.toFixed(2)} USD, SOLCA: $${solca.toFixed(2)} USD). Desembolsado por: ${approverId} (${approverRole})`;
        await transaction.request()
          .input('usuarioId', sql.NVarChar(20), approverId)
          .input('concepto', sql.NVarChar(100), 'Desembolso de Crédito')
          .input('detalle', sql.NVarChar(500), auditDetail)
          .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

        await transaction.commit();
        successes.push({ loanId, balance: newBalance });
      } catch (innerErr) {
        await transaction.rollback();
        failures.push({ loanId, error: innerErr.message });
      }
    }

    return res.json({ ok: true, successes, failures });
  } catch (err) {
    console.error('[disburse loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/:id/scoring ──────────────────────────────────────────────
app.get('/api/socios/:id/scoring', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await sql.connect(sqlConfig);
    
    // 1. Obtener socio y patrimonio
    const socioRes = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query("SELECT SOCIOID, Identificacion, PrimerNombre, Apellidos, PatrimonioIngresos, ValorVivienda FROM dbo.RegistroSocios WHERE Identificacion = @id OR CAST(SOCIOID AS VARCHAR) = @id");
    
    if (socioRes.recordset.length === 0) {
      return res.status(404).json({ ok: false, error: 'Socio no encontrado' });
    }
    
    const socio = socioRes.recordset[0];
    const pat = socio.PatrimonioIngresos ? JSON.parse(socio.PatrimonioIngresos) : {};
    const valorVivienda = parseFloat(socio.ValorVivienda) || 0;
    
    // 2. Obtener créditos de SolicitudesCredito
    const loansRes = await pool.request()
      .input('socioId', sql.BigInt, socio.SOCIOID)
      .query("SELECT SolicitudID, Monto, Saldo, Tasa, Plazo, Estado, PlanPagos FROM dbo.SolicitudesCredito WHERE SocioID = @socioId");
    
    const loans = loansRes.recordset;
    
    // Algoritmo de scoring
    let score = 200; // Puntaje inicial
    
    let totalLoans = loans.length;
    let paidLoansNoMora = 0;
    let totalInstallments = 0;
    let lateInstallments = 0;
    let totalDelayDays = 0;
    
    for (const loan of loans) {
      const plan = loan.PlanPagos ? JSON.parse(loan.PlanPagos) : [];
      let hasMora = false;
      
      for (const inst of plan) {
        totalInstallments++;
        const due = inst.date ? new Date(inst.date) : null;
        
        if (inst.status === 'PAGADO') {
          if (inst.paidDate && due) {
            const paid = new Date(inst.paidDate);
            const delay = Math.max(0, Math.floor((paid - due) / (1000 * 60 * 60 * 24)));
            if (delay > 3) {
              hasMora = true;
              totalDelayDays += delay;
              lateInstallments++;
              score -= (delay - 3) * 5; // penalización de puntualidad
            } else {
              score += 2; // incentivo de puntualidad
            }
          } else {
            score += 2;
          }
        } else if (inst.status === 'PENDIENTE') {
          if (due && new Date() > due) {
            const delay = Math.max(0, Math.floor((new Date() - due) / (1000 * 60 * 60 * 24)));
            if (delay > 3) {
              hasMora = true;
              totalDelayDays += delay;
              lateInstallments++;
              score -= (delay - 3) * 5;
            }
          }
        }
      }
      
      if (loan.Estado === 'PAGADO' && !hasMora) {
        paidLoansNoMora++;
        score += 50; // +50 por cada crédito liquidado sin mora
      }
    }
    
    // 3. Variables de Buró Real
    const ingresoSueldo = parseFloat(pat.ingresoSueldo) || 0;
    const ingresoComercial = parseFloat(pat.ingresoComercial) || 0;
    const ingresoOtros = parseFloat(pat.ingresoOtros) || 0;
    const ingresosTotales = ingresoSueldo + ingresoComercial + ingresoOtros;
    
    const gastosMensuales = parseFloat(pat.gastosMensuales) || (ingresosTotales * 0.4);
    const deudasExternas = parseFloat(pat.deudasExternas) || 0;
    const capacidadPago = ingresosTotales - gastosMensuales - deudasExternas;
    
    // Ajuste por capacidad de pago
    if (capacidadPago > 500) {
      score += Math.min(150, Math.floor(capacidadPago / 10));
    } else if (capacidadPago < 0) {
      score -= Math.min(100, Math.floor(Math.abs(capacidadPago) / 5));
    }
    
    // Morosidad promedio
    const avgDelayDays = lateInstallments > 0 ? (totalDelayDays / lateInstallments) : 0;
    score -= Math.min(150, Math.floor(avgDelayDays * 10));
    
    // Patrimonio (bienes / deuda)
    const totalBienes = valorVivienda + (parseFloat(pat.totalBienes) || (valorVivienda * 0.2) || 5000);
    const activeLocalDebt = loans.filter(l => l.Estado === 'VIGENTE' || l.Estado === 'VENCIDO').reduce((sum, l) => sum + parseFloat(l.Saldo), 0);
    const deudaTotal = deudasExternas + activeLocalDebt;
    const relacionBienesDeuda = deudaTotal > 0 ? (totalBienes / deudaTotal) : 3.0;
    
    if (relacionBienesDeuda > 1.5) {
      score += 100;
    } else if (relacionBienesDeuda < 1.0) {
      score -= 50;
    }
    
    score = Math.max(0, Math.min(1000, score));
    
    let rating = 'REGULAR';
    if (score >= 800) rating = 'EXCELENTE';
    else if (score >= 600) rating = 'BUENO';
    else if (score >= 400) rating = 'REGULAR';
    else if (score >= 200) rating = 'MALO';
    else rating = 'NEGADO';
    
    // Guardar el scoringScore calculado en la base de datos si tiene alguna solicitud activa
    await pool.request()
      .input('socioId', sql.BigInt, socio.SOCIOID)
      .input('score', sql.Int, score)
      .query('UPDATE dbo.SolicitudesCredito SET ScoringScore = @score WHERE SocioID = @socioId AND Estado = \'SOLICITADO\'');

    const result = {
      score,
      rating,
      lastUpdate: new Date().toISOString(),
      totalLoans,
      paidLoansNoMora,
      delinquencyDays: totalDelayDays,
      avgDelayDays,
      capacidadPago,
      ingresosTotales,
      gastosMensuales,
      deudasExternas,
      totalBienes,
      deudaTotal,
      relacionBienesDeuda
    };
    
    return res.json({ ok: true, data: result });
  } catch (err) {
    console.error('[get scoring]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/reject ────────────────────────────────────────────
app.post('/api/socios/loans/reject', async (req, res) => {
  const { id, reason, usuarioId } = req.body || {};
  if (!id || !reason) return res.status(400).json({ ok: false, error: 'id y dictamen técnico son requeridos' });

  const approverId = (usuarioId || 'asesor').trim().toLowerCase();

  try {
    const pool = await sql.connect(sqlConfig);

    // Verificar el rol del usuario rechazador
    const approverRes = await pool.request()
      .input('usuarioId', sql.NVarChar(20), approverId)
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @usuarioId');
    
    const approverRole = approverRes.recordset.length > 0 ? approverRes.recordset[0].Rol : 'CREDIT_OFFICER';

    if (approverRole === 'CREDIT_OFFICER') {
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Los asesores de crédito no tienen permisos para rechazar solicitudes.' });
    }

    const checkRes = await pool.request()
      .input('id', sql.NVarChar(50), id)
      .query('SELECT Estado, Identificacion, Monto FROM dbo.SolicitudesCredito WHERE SolicitudID = @id');

    if (checkRes.recordset.length === 0) {
      return res.status(404).json({ ok: false, error: 'Solicitud de crédito no encontrada' });
    }

    const loan = checkRes.recordset[0];
    if (loan.Estado !== 'SOLICITADO') {
      return res.status(400).json({ ok: false, error: `La solicitud ya no está en estado SOLICITADO (Estado actual: ${loan.Estado})` });
    }

    // Actualizar estado
    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('reason', sql.NVarChar(500), reason)
      .query("UPDATE dbo.SolicitudesCredito SET Estado = 'RECHAZADO', Observaciones = @reason WHERE SolicitudID = @id");

    // Registrar auditoría
    const auditDetail = `Rechazo de solicitud de crédito ${id} por $${parseFloat(loan.Monto).toFixed(2)} USD para el socio ID ${loan.Identificacion}. Obs: ${reason}`;
    await pool.request()
      .input('usuarioId', sql.NVarChar(20), approverId)
      .input('concepto', sql.NVarChar(100), 'Rechazo de Crédito')
      .input('detalle', sql.NVarChar(500), auditDetail)
      .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

    return res.json({ ok: true, message: 'Solicitud de crédito rechazada con éxito' });
  } catch (err) {
    console.error('[reject loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/pay-dividend ───────────────────────────────────────
app.post('/api/socios/loans/pay-dividend', async (req, res) => {
  const { identificacion, loanId, installmentNumber, paymentSource, amount, applyProrating } = req.body || {};
  if (!identificacion || !loanId || !installmentNumber || !paymentSource || !amount) {
    return res.status(400).json({ ok: false, error: 'Datos de pago incompletos' });
  }

  const instNum = parseInt(installmentNumber, 10);
  const socioIdent = identificacion.trim();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // 1. Obtener la solicitud de crédito
      const loanRes = await transaction.request()
        .input('loanId', sql.NVarChar(50), loanId)
        .query('SELECT SolicitudID, Monto, Saldo, Tasa, PlanPagos, Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @loanId');

      if (loanRes.recordset.length === 0) {
        throw new Error('Solicitud de crédito no encontrada');
      }

      const loan = loanRes.recordset[0];
      if (loan.Estado !== 'VIGENTE') {
        throw new Error(`El crédito no se encuentra vigente (Estado: ${loan.Estado})`);
      }

      const planPagosText = loan.PlanPagos;
      if (!planPagosText) {
        throw new Error('El crédito no posee plan de pagos registrado');
      }

      const plan = JSON.parse(planPagosText);
      const targetInst = plan.find(i => i.number === instNum);
      if (!targetInst) {
        throw new Error(`Cuota número ${instNum} no encontrada en el plan de pagos`);
      }

      if (targetInst.status === 'PAGADO') {
        throw new Error(`La cuota número ${instNum} ya fue pagada anteriormente`);
      }

      // Aplicar prorrateo de intereses si el socio paga de forma anticipada (ej: 50% descuento en intereses)
      let interestDiscount = 0.00;
      if (applyProrating) {
        interestDiscount = parseFloat((targetInst.interest * 0.50).toFixed(2));
        targetInst.interest = parseFloat((targetInst.interest - interestDiscount).toFixed(2));
        targetInst.total = parseFloat((targetInst.capital + targetInst.interest).toFixed(2));
      }

      const payAmt = targetInst.total; // El valor real a cobrar

      // 2. Obtener la cuenta de ahorros del socio
      const accountRes = await transaction.request()
        .input('identificacion', sql.NVarChar(20), socioIdent)
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @identificacion)
            AND p.EsCertificado = 0
        `);

      if (accountRes.recordset.length === 0) {
        throw new Error('Cuenta de ahorros del socio no encontrada');
      }

      const account = accountRes.recordset[0];
      let currentSavingsBalance = parseFloat(account.Saldo);

      // Si el pago es debitado de la cuenta del socio, verificar saldo
      if (paymentSource === 'ACCOUNT') {
        if (currentSavingsBalance < payAmt) {
          throw new Error(`Saldo insuficiente en cuenta de ahorros. Disponible: $${currentSavingsBalance.toFixed(2)} USD, Requerido (con prorrateo): $${payAmt.toFixed(2)} USD`);
        }
        currentSavingsBalance -= payAmt;
        
        // Actualizar saldo de cuenta de ahorros en DB
        await transaction.request()
          .input('cuentaId', sql.Int, account.CuentaId)
          .input('nuevoSaldo', sql.Decimal(18, 2), currentSavingsBalance)
          .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');
      }

      // 3. Modificar estado de la cuota a PAGADO en el plan de pagos JSON
      targetInst.status = 'PAGADO';
      const isLastInstallment = plan.every(i => i.status === 'PAGADO');
      const newStatus = isLastInstallment ? 'PAGADO' : 'VIGENTE';
      const newLoanBalance = Math.max(0, parseFloat(loan.Saldo) - targetInst.capital);

      // Actualizar SolicitudesCredito
      await transaction.request()
        .input('loanId', sql.NVarChar(50), loanId)
        .input('saldo', sql.Decimal(15, 2), newLoanBalance)
        .input('estado', sql.NVarChar(20), newStatus)
        .input('planPagos', sql.NVarChar(sql.MAX), JSON.stringify(plan))
        .query('UPDATE dbo.SolicitudesCredito SET Saldo = @saldo, Estado = @estado, PlanPagos = @planPagos WHERE SolicitudID = @loanId');

      // 4. Registro Contable de Partida Doble
      const payConcept = `PAGO CUOTA #${instNum} PRÉSTAMO ${loanId}${applyProrating ? ' (CON PRORRATEO)' : ''}`;
      
      if (paymentSource === 'ACCOUNT') {
        // Asiento 1: Debe en Depósitos de Ahorro del Socio (disminuye pasivo)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), account.CuentaActiva)
          .input('concepto', sql.NVarChar(200), payConcept)
          .input('debe', sql.Decimal(18, 2), payAmt)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), 'caja')
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      } else {
        // Transferencia externa:
        // Asiento 1.1: Ingreso a Caja/Bancos (Debe)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '110105') // Caja Ventanilla
          .input('concepto', sql.NVarChar(200), `DEPÓSITO EXT. PAGO CRÉDITO ${loanId}`)
          .input('debe', sql.Decimal(18, 2), payAmt)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), 'caja')
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Asiento 1.2: Ahorros del Socio disminuye después de debitarse para pagar
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), account.CuentaActiva)
          .input('concepto', sql.NVarChar(200), payConcept)
          .input('debe', sql.Decimal(18, 2), payAmt)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), 'caja')
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      }

      // Asiento 2: Haber en Cartera de Crédito Vigente (disminuye activo) por el capital
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '1.2.01')
        .input('concepto', sql.NVarChar(200), payConcept)
        .input('debe', sql.Decimal(18, 2), 0.00)
        .input('haber', sql.Decimal(18, 2), targetInst.capital)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), 'caja')
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // Asiento 3: Haber en Ingresos por Intereses (aumenta ingresos) por el interés (neto cobrado)
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '5.1.01') // Ingresos por Intereses
        .input('concepto', sql.NVarChar(200), payConcept)
        .input('debe', sql.Decimal(18, 2), 0.00)
        .input('haber', sql.Decimal(18, 2), targetInst.interest)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), 'caja')
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // 5. Registrar en auditoría
      const auditDetail = `Cobro de dividendo #${instNum} del crédito ${loanId}. Pago de $${payAmt.toFixed(2)} USD (Capital: $${targetInst.capital.toFixed(2)}, Interés: $${targetInst.interest.toFixed(2)}${applyProrating ? `, Descuento Prorrateo: $${interestDiscount.toFixed(2)}` : ''}). Canal: Ventanilla`;
      await transaction.request()
        .input('usuarioId', sql.NVarChar(20), 'caja')
        .input('concepto', sql.NVarChar(100), 'Pago de Dividendo')
        .input('detalle', sql.NVarChar(500), auditDetail)
        .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

      await transaction.commit();

      return res.json({
        ok: true,
        message: 'Pago de dividendo procesado con éxito',
        loanBalance: newLoanBalance,
        savingsBalance: currentSavingsBalance,
        installmentPaid: instNum,
        isCompleted: isLastInstallment
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[pay loan installment]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/update-profile ───────────────────────────────────────────
app.post('/api/socios/update-profile', async (req, res) => {
  const { identificacion, email, telefono, direccionDomicilio, lugarTrabajo, estadoCivil } = req.body || {};
  if (!identificacion) {
    return res.status(400).json({ ok: false, error: 'Identificación es requerida' });
  }

  try {
    const pool = await sql.connect(sqlConfig);
    await pool.request()
      .input('id', sql.NVarChar(20), identificacion.trim())
      .input('email', sql.NVarChar(100), email)
      .input('telefono', sql.NVarChar(20), telefono)
      .input('direccionDomicilio', sql.NVarChar(200), direccionDomicilio)
      .input('lugarTrabajo', sql.NVarChar(200), lugarTrabajo)
      .input('estadoCivil', sql.NVarChar(20), estadoCivil)
      .query(`
        UPDATE dbo.RegistroSocios
        SET Email = @email, Telefono = @telefono, DireccionDomicilio = @direccionDomicilio, LugarTrabajo = @lugarTrabajo, EstadoCivil = @estadoCivil
        WHERE Identificacion = @id
      `);

    return res.json({ ok: true, message: 'Perfil del socio actualizado correctamente' });
  } catch (err) {
    console.error('[update profile]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/update-report-profile ────────────────────────────────────
app.post('/api/socios/update-report-profile', async (req, res) => {
  const {
    identificacion,
    direccionDomicilio,
    lugarTrabajo,
    referenciasPersonales,
    cargasFamiliares,
    telefonos,
    profesion,
    autoidentificacion,
    tipoVivienda,
    valorVivienda,
    discapacidad,
    consentimientoDatos,
    peps,
    patrimonioIngresos
  } = req.body || {};

  if (!identificacion) {
    return res.status(400).json({ ok: false, error: 'Identificación es requerida' });
  }

  try {
    const pool = await sql.connect(sqlConfig);
    await pool.request()
      .input('id', sql.NVarChar(20), identificacion.trim())
      .input('direccionDomicilio', sql.NVarChar(200), direccionDomicilio || '')
      .input('lugarTrabajo', sql.NVarChar(200), lugarTrabajo || '')
      .input('referenciasPersonales', sql.NVarChar(sql.MAX), typeof referenciasPersonales === 'string' ? referenciasPersonales : JSON.stringify(referenciasPersonales || []))
      .input('cargasFamiliares', sql.NVarChar(sql.MAX), typeof cargasFamiliares === 'string' ? cargasFamiliares : JSON.stringify(cargasFamiliares || []))
      .input('telefonos', sql.NVarChar(200), telefonos || '')
      .input('profesion', sql.NVarChar(100), profesion || '')
      .input('autoidentificacion', sql.NVarChar(100), autoidentificacion || '')
      .input('tipoVivienda', sql.NVarChar(100), tipoVivienda || '')
      .input('valorVivienda', sql.Decimal(18, 2), valorVivienda ? parseFloat(valorVivienda) : 0.00)
      .input('discapacidad', sql.Bit, discapacidad ? 1 : 0)
      .input('consentimientoDatos', sql.Bit, consentimientoDatos ? 1 : 0)
      .input('peps', sql.Bit, peps ? 1 : 0)
      .input('patrimonioIngresos', sql.NVarChar(sql.MAX), typeof patrimonioIngresos === 'string' ? patrimonioIngresos : JSON.stringify(patrimonioIngresos || {}))
      .query(`
        UPDATE dbo.RegistroSocios
        SET 
          DireccionDomicilio = @direccionDomicilio,
          LugarTrabajo = @lugarTrabajo,
          ReferenciasPersonales = @referenciasPersonales,
          CargasFamiliares = @cargasFamiliares,
          Telefonos = @telefonos,
          Profesion = @profesion,
          Autoidentificacion = @autoidentificacion,
          TipoVivienda = @tipoVivienda,
          ValorVivienda = @valorVivienda,
          Discapacidad = @discapacidad,
          ConsentimientoDatos = @consentimientoDatos,
          PEPS = @peps,
          PatrimonioIngresos = @patrimonioIngresos
        WHERE Identificacion = @id
      `);

    return res.json({ ok: true, message: 'Perfil del socio actualizado correctamente en la ficha de reporte' });
  } catch (err) {
    console.error('[update report profile]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/verificar-email ──────────────────────────────────────────
app.post('/api/socios/verificar-email', async (req, res) => {
  const { identificacion, codigo } = req.body || {};
  if (!identificacion || !codigo) return res.status(400).json({ ok: false, error: 'identificacion y codigo son requeridos' });

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Buscar el código de activación en la nueva tabla ActivacionBancaLinea y en RegistroSocios
    const result = await pool.request()
      .input('id', sql.NVarChar(20), identificacion.trim())
      .query(`
        SELECT 
          rs.SOCIOID, rs.PIN, rs.CodigoActivacion,
          ab.ActivacionId, ab.CodigoVerificacion
        FROM dbo.RegistroSocios rs
        LEFT JOIN dbo.ActivacionBancaLinea ab ON rs.SOCIOID = ab.SocioId
        WHERE rs.Identificacion = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ ok: false, error: 'Socio no encontrado' });
    }
    
    const socio = result.recordset[0];
    const verificationCode = (socio.CodigoVerificacion || socio.CodigoActivacion || '').trim();
    
    if (verificationCode !== codigo.trim()) {
      return res.status(400).json({ ok: false, error: 'Código de activación incorrecto' });
    }
    
    // Actualizar ambas tablas para confirmar
    await pool.request()
      .input('id', sql.NVarChar(20), identificacion.trim())
      .query('UPDATE dbo.RegistroSocios SET EmailConfirmado = 1 WHERE Identificacion = @id');

    if (socio.ActivacionId) {
      await pool.request()
        .input('ActivacionId', sql.Int, socio.ActivacionId)
        .query('UPDATE dbo.ActivacionBancaLinea SET Activo = 1 WHERE ActivacionId = @ActivacionId');
    } else {
      // Por si no existía la fila
      await pool.request()
        .input('SocioId', sql.BigInt, socio.SOCIOID)
        .input('PIN', sql.NVarChar(4), socio.PIN)
        .input('CodigoVerificacion', sql.NVarChar(10), verificationCode)
        .query(`
          INSERT INTO dbo.ActivacionBancaLinea (SocioId, PIN, CodigoVerificacion, FechaRegistro, AceptoDatosPersonales, Activo)
          VALUES (@SocioId, @PIN, @CodigoVerificacion, SYSDATETIME(), 0, 1)
        `);
    }
    
    return res.json({ ok: true, message: 'Correo verificado y cuenta activada con éxito' });
  } catch (err) {
    console.error('[verificar email]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/aceptar-terminos ──────────────────────────────────────────
app.post('/api/socios/aceptar-terminos', async (req, res) => {
  const { identificacion } = req.body || {};
  if (!identificacion) return res.status(400).json({ ok: false, error: 'identificacion es requerida' });

  try {
    const pool = await sql.connect(sqlConfig);
    const socioRes = await pool.request()
      .input('id', sql.NVarChar(20), identificacion.trim())
      .query('SELECT SOCIOID, PIN, CodigoActivacion FROM dbo.RegistroSocios WHERE Identificacion = @id');
    
    if (socioRes.recordset.length === 0) {
      return res.status(404).json({ ok: false, error: 'Socio no encontrado' });
    }
    
    const socio = socioRes.recordset[0];
    const socioId = socio.SOCIOID;

    // Verificar si existe fila en ActivacionBancaLinea
    const checkRes = await pool.request()
      .input('SocioId', sql.BigInt, socioId)
      .query('SELECT ActivacionId FROM dbo.ActivacionBancaLinea WHERE SocioId = @SocioId');

    if (checkRes.recordset.length === 0) {
      // Si no existe, insertar una nueva fila con la aceptación
      await pool.request()
        .input('SocioId', sql.BigInt, socioId)
        .input('PIN', sql.NVarChar(4), socio.PIN)
        .input('CodigoVerificacion', sql.NVarChar(10), socio.CodigoActivacion || '000000')
        .query(`
          INSERT INTO dbo.ActivacionBancaLinea (SocioId, PIN, CodigoVerificacion, FechaRegistro, AceptoDatosPersonales, FechaAceptacionDatos, Activo)
          VALUES (@SocioId, @PIN, @CodigoVerificacion, SYSDATETIME(), 1, SYSDATETIME(), 1)
        `);
    } else {
      // Si ya existe, actualizarla
      await pool.request()
        .input('SocioId', sql.BigInt, socioId)
        .query(`
          UPDATE dbo.ActivacionBancaLinea 
          SET AceptoDatosPersonales = 1, FechaAceptacionDatos = SYSDATETIME()
          WHERE SocioId = @SocioId
        `);
    }

    return res.json({ ok: true, message: 'Términos de protección de datos aceptados correctamente' });
  } catch (err) {
    console.error('[aceptar terminos]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/guardar-mapa ────────────────────────────────────────────
app.post('/api/socios/guardar-mapa', async (req, res) => {
  const { socioId, imagenMapa, coordenadaLat, coordenadaLng, direccionCapturada } = req.body || {};

  if (!socioId) {
    return res.status(400).json({ ok: false, error: 'SOCIOID es requerido' });
  }

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Convertir base64 a buffer e insertar/actualizar ruta física
    let imagenBuffer = null;
    let relativePath = null;
    if (imagenMapa) {
      const base64Data = imagenMapa.replace(/^data:image\/\w+;base64,/, '');
      imagenBuffer = Buffer.from(base64Data, 'base64');
      const filename = `mapa_domicilio_${socioId}.png`;
      writeFileSync(join(uploadsDir, filename), imagenBuffer);
      relativePath = `/uploads/${filename}`;
    }

    await pool.request()
      .input('SOCIOID', sql.BigInt, socioId)
      .input('ImagenMapa', sql.VarBinary(sql.MAX), imagenBuffer)
      .input('CoordenadaLat', sql.NVarChar(50), coordenadaLat)
      .input('CoordenadaLng', sql.NVarChar(50), coordenadaLng)
      .input('DireccionCapturada', sql.NVarChar(200), direccionCapturada)
      .input('RutaImagen', sql.NVarChar(250), relativePath)
      .execute('dbo.usp_GuardarMapaUbicacion');

    await pool.close();

    return res.json({ ok: true, message: 'Mapa de ubicación guardado exitosamente' });
  } catch (err) {
    console.error('[guardar mapa]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/guardar-croquis ──────────────────────────────────────────
app.post('/api/socios/guardar-croquis', async (req, res) => {
  const { socioId, imagenCroquis, descripcion } = req.body || {};

  if (!socioId) {
    return res.status(400).json({ ok: false, error: 'SOCIOID es requerido' });
  }

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Convertir base64 a buffer e insertar/actualizar ruta física
    let imagenBuffer = null;
    let relativePath = null;
    if (imagenCroquis) {
      const base64Data = imagenCroquis.replace(/^data:image\/\w+;base64,/, '');
      imagenBuffer = Buffer.from(base64Data, 'base64');
      const filename = `mapa_trabajo_${socioId}.png`;
      writeFileSync(join(uploadsDir, filename), imagenBuffer);
      relativePath = `/uploads/${filename}`;
    }

    await pool.request()
      .input('SOCIOID', sql.BigInt, socioId)
      .input('ImagenCroquis', sql.VarBinary(sql.MAX), imagenBuffer)
      .input('Descripcion', sql.NVarChar(500), descripcion)
      .input('RutaImagen', sql.NVarChar(250), relativePath)
      .execute('dbo.usp_GuardarCroquisTrabajo');

    await pool.close();

    return res.json({ ok: true, message: 'Croquis de trabajo guardado exitosamente' });
  } catch (err) {
    console.error('[guardar croquis]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/consultas ───────────────────────────────────────────────
app.get('/api/socios/consultas', async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .query('SELECT * FROM dbo.vw_RegistroSociosConsultas ORDER BY FechaRegistro DESC');
    await pool.close();

    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    console.error('[consultas socios]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/buscar ───────────────────────────────────────────────────
app.get('/api/socios/buscar', async (req, res) => {
  const q = ((req.query.q || '') + '').trim();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    let searchResult;
    if (q) {
      searchResult = await pool.request()
        .input('q', sql.NVarChar(100), `%${q}%`)
        .input('exactQ', sql.NVarChar(50), q)
        .query(`
          SELECT 
            rs.SOCIOID, rs.TipoPersona, rs.TipoIdentificacion, rs.Identificacion, rs.PrimerNombre, rs.SegundoNombre, rs.PrimerApellido, rs.SegundoApellido, rs.Apellidos, rs.Email, rs.Telefono, rs.FechaNacimiento, rs.EstadoCivil, rs.NumeroSocio, rs.PIN,
            rs.DireccionDomicilio, rs.LugarTrabajo, rs.Etnia, rs.Genero, rs.NivelInstruccion, rs.Profesion, rs.ReferenciasPersonales, rs.CargasFamiliares,
            rs.Telefonos, rs.Autoidentificacion, rs.TipoVivienda, rs.ValorVivienda, rs.Discapacidad, rs.ConsentimientoDatos, rs.PEPS, rs.PatrimonioIngresos,
            rs.CedulaConyuge, rs.NombreConyuge, rs.TelefonoConyuge,
            sm.RutaImagen AS RutaImagenMapa,
            ct.RutaImagen AS RutaImagenCroquis,
            ex.RutaCaraFrontal AS RutaCaraFrontal,
            ex.RutaCaraPosterior AS RutaCaraPosterior
          FROM dbo.RegistroSocios rs
          LEFT JOIN dbo.SocioUbicacionMapa sm ON sm.SOCIOID = rs.SOCIOID
          LEFT JOIN dbo.SocioCroquisTrabajo ct ON ct.SOCIOID = rs.SOCIOID
          LEFT JOIN dbo.SocioDocumentoExcepcion ex ON ex.SOCIOID = rs.SOCIOID
          WHERE (rs.Identificacion = @exactQ OR rs.NumeroSocio = @exactQ OR rs.Apellidos LIKE @q OR rs.PrimerNombre LIKE @q)
            AND rs.Estado = 'ACTIVO'
        `);
    } else {
      searchResult = await pool.request()
        .query(`
          SELECT 
            rs.SOCIOID, rs.TipoPersona, rs.TipoIdentificacion, rs.Identificacion, rs.PrimerNombre, rs.SegundoNombre, rs.PrimerApellido, rs.SegundoApellido, rs.Apellidos, rs.Email, rs.Telefono, rs.FechaNacimiento, rs.EstadoCivil, rs.NumeroSocio, rs.PIN,
            rs.DireccionDomicilio, rs.LugarTrabajo, rs.Etnia, rs.Genero, rs.NivelInstruccion, rs.Profesion, rs.ReferenciasPersonales, rs.CargasFamiliares,
            rs.Telefonos, rs.Autoidentificacion, rs.TipoVivienda, rs.ValorVivienda, rs.Discapacidad, rs.ConsentimientoDatos, rs.PEPS, rs.PatrimonioIngresos,
            rs.CedulaConyuge, rs.NombreConyuge, rs.TelefonoConyuge,
            sm.RutaImagen AS RutaImagenMapa,
            ct.RutaImagen AS RutaImagenCroquis,
            ex.RutaCaraFrontal AS RutaCaraFrontal,
            ex.RutaCaraPosterior AS RutaCaraPosterior
          FROM dbo.RegistroSocios rs
          LEFT JOIN dbo.SocioUbicacionMapa sm ON sm.SOCIOID = rs.SOCIOID
          LEFT JOIN dbo.SocioCroquisTrabajo ct ON ct.SOCIOID = rs.SOCIOID
          LEFT JOIN dbo.SocioDocumentoExcepcion ex ON ex.SOCIOID = rs.SOCIOID
          WHERE rs.Estado = 'ACTIVO'
        `);
    }
      
    if (searchResult.recordset.length === 0) {
      return res.json({ ok: true, data: [] });
    }

    const socios = [];
    for (const r of searchResult.recordset) {
      // Fetch accounts
      const accountsResult = await pool.request()
        .input('socioId', sql.BigInt, r.SOCIOID)
        .query(`
          SELECT 
            'ca-' + CAST(c.CuentaId AS NVARCHAR(10)) AS id, 
            CASE WHEN p.EsCertificado = 1 THEN 'CERTIFICADO_APORTACION' ELSE 'AHORRO_VISTA' END AS type, 
            c.NumeroCuenta AS number, 
            CAST(c.Saldo AS FLOAT) AS balance, 
            'USD' AS currency 
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.SocioId = @socioId
        `);

      // Fetch ledger transactions for this socio
      const txsResult = await pool.request()
        .input('socioId', sql.BigInt, r.SOCIOID)
        .query(`
          SELECT 
            'tx-' + CAST(AsientoId AS NVARCHAR(10)) AS id,
            FORMAT(Fecha, 'yyyy-MM-dd') AS date,
            Concepto AS description,
            CAST(CASE WHEN Debe > 0 THEN -Debe ELSE Haber END AS FLOAT) AS amount,
            CASE WHEN Debe > 0 THEN 'DEBIT' ELSE 'CREDIT' END AS type,
            'Caja' AS category,
            'ca-' + (SELECT CAST(CuentaId AS NVARCHAR(10)) FROM dbo.CuentasAhorro WHERE NumeroCuenta = rc.NumeroCuenta) AS accountId,
            rc.NumeroCuenta AS reference,
            1 AS isCash,
            rc.UsuarioId AS tellerId
          FROM dbo.RegistroContable rc
          WHERE SocioId = @socioId AND CuentaContable != '110105'
          ORDER BY Fecha DESC
        `);

      // Get loans
      const loansResult = await pool.request()
        .input('identificacion', sql.NVarChar(20), r.Identificacion)
        .query(`
          SELECT SolicitudID as id, Identificacion as memberId, Monto as amount, Saldo as balance, Tasa as rate, Plazo as installmentsCount, Tipo as type, Estado as status, FechaSolicitud, FechaVencimiento as dueDate, Observaciones as comments, PlanPagos as installments 
          FROM dbo.SolicitudesCredito 
          WHERE Identificacion = @identificacion 
          ORDER BY FechaSolicitud DESC
        `);

      const loans = loansResult.recordset.map(loan => ({
        ...loan,
        installments: loan.installments ? JSON.parse(loan.installments) : []
      }));

      socios.push({
        id: r.Identificacion,
        socioId: r.SOCIOID,
        name: `${r.PrimerNombre} ${r.SegundoNombre ? r.SegundoNombre + ' ' : ''}${r.Apellidos}`,
        firstName: r.PrimerNombre,
        middleName: r.SegundoNombre || '',
        firstLastName: r.PrimerApellido || '',
        secondLastName: r.SegundoApellido || '',
        pin: r.PIN,
        role: 'MEMBER',
        email: r.Email || '',
        phone: r.Telefono || '',
        address: r.DireccionDomicilio || '',
        birthDate: r.FechaNacimiento ? r.FechaNacimiento.toISOString().split('T')[0] : '',
        memberNumber: r.NumeroSocio,
        personType: r.TipoPersona,
        maritalStatus: r.EstadoCivil || '',
        workAddress: r.LugarTrabajo || '',
        ethnicity: r.Etnia || '',
        gender: r.Genero || '',
        instructionLevel: r.NivelInstruccion || '',
        profession: r.Profesion || '',
        references: r.ReferenciasPersonales ? JSON.parse(r.ReferenciasPersonales) : [],
        dependents: r.CargasFamiliares ? JSON.parse(r.CargasFamiliares) : [],
        telefonos: r.Telefonos || '',
        autoidentificacion: r.Autoidentificacion || '',
        tipoVivienda: r.TipoVivienda || '',
        valorVivienda: r.ValorVivienda ? parseFloat(r.ValorVivienda) : 0,
        discapacidad: r.Discapacidad === true || r.Discapacidad === 1,
        consentimientoDatos: r.ConsentimientoDatos === true || r.ConsentimientoDatos === 1,
        peps: r.PEPS === true || r.PEPS === 1,
        patrimonioIngresos: r.PatrimonioIngresos ? JSON.parse(r.PatrimonioIngresos) : {},
        spouseId: r.CedulaConyuge || '',
        spouseName: r.NombreConyuge || '',
        spousePhone: r.TelefonoConyuge || '',
        rutaImagenMapa: r.RutaImagenMapa || '',
        rutaImagenCroquis: r.RutaImagenCroquis || '',
        rutaCaraFrontal: r.RutaCaraFrontal || '',
        rutaCaraPosterior: r.RutaCaraPosterior || '',
        accounts: accountsResult.recordset,
        transactions: txsResult.recordset,
        loans: loans
      });
    }

    return res.json({ ok: true, data: socios });
  } catch (err) {
    console.error('[buscar socio]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/transaccion ─────────────────────────────────────────────
app.post('/api/socios/transaccion', async (req, res) => {
  const { accountId, opType, amount, description, tellerId, cashDetail } = req.body || {};
  if (!accountId || !opType || !amount || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Datos de transacción inválidos' });
  }

  const cleanAccountId = accountId.replace('ca-', '');
  const numAmount = parseFloat(amount);

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // 1. Obtener la cuenta y el socio
      const accountRequest = new sql.Request(transaction);
      const accountResult = await accountRequest
        .input('cuentaId', sql.Int, parseInt(cleanAccountId, 10))
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, c.Estado, c.CodigoProducto, p.CuentaActiva, p.EsCertificado
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.CuentaId = @cuentaId
        `);

      if (accountResult.recordset.length === 0) {
        throw new Error('Cuenta no encontrada');
      }

      const account = accountResult.recordset[0];
      if (account.Estado !== 'ACTIVA') {
        throw new Error('La cuenta no está activa');
      }

      // Validar regla de negocio de Certificados para retiros
      if (opType === 'WITHDRAW' && account.EsCertificado) {
        throw new Error('No se pueden hacer retiros directos desde Certificados de Aportación.');
      }

      // 2. Calcular nuevo saldo
      let newBalance = parseFloat(account.Saldo);
      const isCredit = (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE');
      if (isCredit) {
        newBalance += numAmount;
      } else {
        if (newBalance < numAmount) {
          throw new Error('Saldo insuficiente para realizar el retiro');
        }
        newBalance -= numAmount;
      }

      // 3. Actualizar saldo en CuentasAhorro
      const updateRequest = new sql.Request(transaction);
      await updateRequest
        .input('cuentaId', sql.Int, account.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
        .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      // 4. Insertar partida doble en RegistroContable (Libro Diario SEPS)
      const ledgerRequest1 = new sql.Request(transaction);
      const ledgerRequest2 = new sql.Request(transaction);

      const productAccountCode = account.CuentaActiva; // Ej: 31030505 o 21013505
      const cashAccountCode = '110105'; // Caja Ventanilla
      let asientoId = null;

      if (isCredit) {
        // Depósito / Nota de Crédito:
        // Caja Ventanilla ingresa dinero (Debe)
        // Cuenta de Ahorro / Certificado aumenta saldo (Haber)
        const result1 = await ledgerRequest1
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), cashAccountCode)
          .input('concepto', sql.NVarChar(200), description)
          .input('debe', sql.Decimal(18, 2), numAmount)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), tellerId || 'caja')
          .query(`
            INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId)
            OUTPUT INSERTED.AsientoId
            VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)
          `);
        asientoId = result1.recordset?.[0]?.AsientoId;

        await ledgerRequest2
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), productAccountCode)
          .input('concepto', sql.NVarChar(200), description)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), numAmount)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), tellerId || 'caja')
          .query(`
            INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId)
            VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)
          `);
      } else {
        // Retiro / Nota de Débito:
        // Cuenta de Ahorro disminuye saldo (Debe)
        // Caja Ventanilla egresa dinero (Haber)
        await ledgerRequest1
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), productAccountCode)
          .input('concepto', sql.NVarChar(200), description)
          .input('debe', sql.Decimal(18, 2), numAmount)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), tellerId || 'caja')
          .query(`
            INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId)
            VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)
          `);

        const result2 = await ledgerRequest2
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), cashAccountCode)
          .input('concepto', sql.NVarChar(200), description)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), numAmount)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), tellerId || 'caja')
          .query(`
            INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId)
            OUTPUT INSERTED.AsientoId
            VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)
          `);
        asientoId = result2.recordset?.[0]?.AsientoId;
      }

      // Guardar desglose de efectivo (Billetes y Monedas)
      if (asientoId && (opType === 'DEPOSIT' || opType === 'WITHDRAW') && cashDetail) {
        if (Array.isArray(cashDetail.bills)) {
          for (const item of cashDetail.bills) {
            if (item.count > 0) {
              let code = '';
              if (item.denomination === 100) code = 'B100';
              else if (item.denomination === 50) code = 'B50';
              else if (item.denomination === 20) code = 'B20';
              else if (item.denomination === 10) code = 'B10';
              else if (item.denomination === 5) code = 'B5';
              else if (item.denomination === 1) code = 'B1';
              
              if (code) {
                const detailRequest = new sql.Request(transaction);
                await detailRequest
                  .input('AsientoId', sql.Int, asientoId)
                  .input('CodigoDenominacion', sql.NVarChar(10), code)
                  .input('Cantidad', sql.Int, item.count)
                  .input('Total', sql.Decimal(18, 2), item.total)
                  .query(`
                    INSERT INTO dbo.DetalleEfectivoTransaccion (AsientoId, CodigoDenominacion, Cantidad, Total)
                    VALUES (@AsientoId, @CodigoDenominacion, @Cantidad, @Total)
                  `);
              }
            }
          }
        }
        if (Array.isArray(cashDetail.coins)) {
          for (const item of cashDetail.coins) {
            if (item.count > 0) {
              let code = '';
              if (item.denomination === 1) code = 'M1';
              else if (item.denomination === 0.50) code = 'M0.50';
              else if (item.denomination === 0.25) code = 'M0.25';
              else if (item.denomination === 0.10) code = 'M0.10';
              else if (item.denomination === 0.05) code = 'M0.05';
              else if (item.denomination === 0.01) code = 'M0.01';
              
              if (code) {
                const detailRequest = new sql.Request(transaction);
                await detailRequest
                  .input('AsientoId', sql.Int, asientoId)
                  .input('CodigoDenominacion', sql.NVarChar(10), code)
                  .input('Cantidad', sql.Int, item.count)
                  .input('Total', sql.Decimal(18, 2), item.total)
                  .query(`
                    INSERT INTO dbo.DetalleEfectivoTransaccion (AsientoId, CodigoDenominacion, Cantidad, Total)
                    VALUES (@AsientoId, @CodigoDenominacion, @Cantidad, @Total)
                  `);
              }
            }
          }
        }
      }

      await transaction.commit();

      const newTxId = asientoId ? `tx-${asientoId}` : `tx-${Date.now()}`;
      return res.json({
        ok: true,
        balance: newBalance,
        transaction: {
          id: newTxId,
          date: new Date().toISOString().split('T')[0],
          description,
          amount: isCredit ? numAmount : -numAmount,
          type: isCredit ? 'CREDIT' : 'DEBIT',
          category: 'Caja',
          accountId: accountId,
          reference: account.NumeroCuenta,
          isCash: opType === 'DEPOSIT' || opType === 'WITHDRAW',
          tellerId: tellerId || 'caja'
        }
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[transaccion contable]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/transaccion/anular ──────────────────────────────────────────
app.post('/api/socios/transaccion/anular', async (req, res) => {
  const { id, role } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'ID de transacción requerido' });
  
  if (role !== 'ADMIN') {
    return res.status(403).json({ ok: false, error: 'PERMISOS INSUFICIENTES: Solo un usuario Administrador puede anular transacciones.' });
  }
  
  const rawAsientoId = id.replace('tx-', '').replace('TX-', '');
  const asientoId = parseInt(rawAsientoId, 10);
  if (isNaN(asientoId)) {
    return res.status(400).json({ ok: false, error: 'ID de transacción inválido' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const checkRequest = new sql.Request(transaction);
      const checkResult = await checkRequest
        .input('asientoId', sql.Int, asientoId)
        .query('SELECT SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId FROM dbo.RegistroContable WHERE AsientoId = @asientoId');
      
      if (checkResult.recordset.length === 0) {
        throw new Error('Transacción no encontrada en el libro diario');
      }

      const original = checkResult.recordset[0];
      if (original.Concepto.startsWith('ANULADO') || original.Concepto.startsWith('ANULACIÓN REVERSO')) {
        throw new Error('Esta transacción ya ha sido anulada anteriormente');
      }

      const accRequest = new sql.Request(transaction);
      const accResult = await accRequest
        .input('numeroCuenta', sql.NVarChar(20), original.NumeroCuenta)
        .query('SELECT CuentaId, Saldo, Estado FROM dbo.CuentasAhorro WHERE NumeroCuenta = @numeroCuenta');
      
      if (accResult.recordset.length === 0) {
        throw new Error('Cuenta asociada no encontrada');
      }

      const account = accResult.recordset[0];
      
      let amountToRevert = 0;
      let isDeposit = false;
      
      if (original.CuentaContable === '110105') {
        isDeposit = original.Debe > 0;
        amountToRevert = isDeposit ? parseFloat(original.Debe) : -parseFloat(original.Haber);
      } else {
        isDeposit = original.Haber > 0;
        amountToRevert = isDeposit ? parseFloat(original.Haber) : -parseFloat(original.Debe);
      }

      let newBalance = parseFloat(account.Saldo);
      if (isDeposit) {
        newBalance -= amountToRevert;
        if (newBalance < 0) {
          throw new Error('No se puede anular porque el socio ya no dispone del saldo suficiente');
        }
      } else {
        newBalance += Math.abs(amountToRevert);
      }

      const updateRequest = new sql.Request(transaction);
      await updateRequest
        .input('cuentaId', sql.Int, account.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
        .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      const prodRes = await transaction.request()
        .input('numeroCuenta', sql.NVarChar(20), original.NumeroCuenta)
        .query('SELECT CuentaActiva FROM dbo.CuentasAhorro c INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto WHERE c.NumeroCuenta = @numeroCuenta');
      const productCode = prodRes.recordset[0]?.CuentaActiva || '21013505';
      const cashCode = '110105';
      const concept = `ANULADO REVERSO: ${original.Concepto} (Ref: tx-${asientoId})`;
      const val = isDeposit ? amountToRevert : Math.abs(amountToRevert);

      const revRequest1 = new sql.Request(transaction);
      const revRequest2 = new sql.Request(transaction);

      if (isDeposit) {
        await revRequest1
          .input('socioId', sql.BigInt, original.SocioId)
          .input('cuentaContable', sql.NVarChar(20), productCode)
          .input('concepto', sql.NVarChar(200), concept)
          .input('debe', sql.Decimal(18, 2), val)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), original.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), original.UsuarioId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        await revRequest2
          .input('socioId', sql.BigInt, original.SocioId)
          .input('cuentaContable', sql.NVarChar(20), cashCode)
          .input('concepto', sql.NVarChar(200), concept)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), val)
          .input('numeroCuenta', sql.NVarChar(20), original.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), original.UsuarioId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      } else {
        await revRequest1
          .input('socioId', sql.BigInt, original.SocioId)
          .input('cuentaContable', sql.NVarChar(20), cashCode)
          .input('concepto', sql.NVarChar(200), concept)
          .input('debe', sql.Decimal(18, 2), val)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), original.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), original.UsuarioId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        await revRequest2
          .input('socioId', sql.BigInt, original.SocioId)
          .input('cuentaContable', sql.NVarChar(20), productCode)
          .input('concepto', sql.NVarChar(200), concept)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), val)
          .input('numeroCuenta', sql.NVarChar(20), original.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), original.UsuarioId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      }

      const markRequest = new sql.Request(transaction);
      await markRequest
        .input('asientoId', sql.Int, asientoId)
        .query("UPDATE dbo.RegistroContable SET Concepto = 'ANULADO: ' + Concepto WHERE AsientoId = @asientoId OR (Concepto = (SELECT Concepto FROM dbo.RegistroContable WHERE AsientoId = @asientoId) AND NumeroCuenta = (SELECT NumeroCuenta FROM dbo.RegistroContable WHERE AsientoId = @asientoId) AND ABS(DATEDIFF(second, Fecha, (SELECT Fecha FROM dbo.RegistroContable WHERE AsientoId = @asientoId))) < 10)");

      await transaction.commit();

      return res.json({ ok: true, message: 'Transacción de base de datos anulada con éxito' });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[anular transaccion]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/admin/productos ──────────────────────────────────────────────────
app.get('/api/admin/productos', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request().query('SELECT * FROM dbo.parametrosproductos ORDER BY CodigoProducto');
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    console.error('[admin productos]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/admin/productos ─────────────────────────────────────────────────
app.post('/api/admin/productos', async (req, res) => {
  const {
    codigoProducto,
    nombre,
    tipoDeposito,
    esCertificado,
    cuentaActiva,
    cuentaInactiva,
    cuentaGasto,
    cuentaProvision,
    cuentaDepositosConfirmar,
    numCtas4Dig,
    permiteDepositos,
    permiteRetiros,
    permiteDebitos,
    permiteCreditos,
    permiteTransferencias,
    tasa,
    formaPago,
    mesesAcreditacion
  } = req.body || {};

  if (!codigoProducto || !nombre || !tipoDeposito || !cuentaActiva || !cuentaInactiva) {
    return res.status(400).json({ ok: false, error: 'Código, nombre, tipo de depósito y cuentas contables activa/inactiva son requeridas' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    // Check if it exists
    const checkResult = await pool.request()
      .input('codigoProducto', sql.Int, codigoProducto)
      .query('SELECT 1 FROM dbo.parametrosproductos WHERE CodigoProducto = @codigoProducto');
      
    if (checkResult.recordset.length > 0) {
      // Update
      await pool.request()
        .input('codigoProducto', sql.Int, codigoProducto)
        .input('nombre', sql.NVarChar(100), nombre)
        .input('tipoDeposito', sql.NVarChar(100), tipoDeposito)
        .input('esCertificado', sql.Bit, esCertificado ? 1 : 0)
        .input('cuentaActiva', sql.NVarChar(20), cuentaActiva)
        .input('cuentaInactiva', sql.NVarChar(20), cuentaInactiva)
        .input('cuentaGasto', sql.NVarChar(20), cuentaGasto || null)
        .input('cuentaProvision', sql.NVarChar(20), cuentaProvision || null)
        .input('cuentaDepositosConfirmar', sql.NVarChar(20), cuentaDepositosConfirmar || null)
        .input('numCtas4Dig', sql.Int, numCtas4Dig || 28)
        .input('permiteDepositos', sql.Bit, permiteDepositos ? 1 : 0)
        .input('permiteRetiros', sql.Bit, permiteRetiros ? 1 : 0)
        .input('permiteDebitos', sql.Bit, permiteDebitos ? 1 : 0)
        .input('permiteCreditos', sql.Bit, permiteCreditos ? 1 : 0)
        .input('permiteTransferencias', sql.Bit, permiteTransferencias ? 1 : 0)
        .input('tasa', sql.NVarChar(50), tasa || 'TASA NOMINAL')
        .input('formaPago', sql.NVarChar(100), formaPago || 'MOVIMIENTO HISTORICO PONDERADO BASE')
        .input('mesesAcreditacion', sql.NVarChar(100), mesesAcreditacion || 'Diciembre')
        .query(`
          UPDATE dbo.parametrosproductos
          SET Nombre = @nombre,
              TipoDeposito = @tipoDeposito,
              EsCertificado = @esCertificado,
              CuentaActiva = @cuentaActiva,
              CuentaInactiva = @cuentaInactiva,
              CuentaGasto = @cuentaGasto,
              CuentaProvision = @cuentaProvision,
              CuentaDepositosConfirmar = @cuentaDepositosConfirmar,
              NumCtas4Dig = @numCtas4Dig,
              PermiteDepositos = @permiteDepositos,
              PermiteRetiros = @permiteRetiros,
              PermiteDebitos = @permiteDebitos,
              PermiteCreditos = @permiteCreditos,
              PermiteTransferencias = @permiteTransferencias,
              Tasa = @tasa,
              FormaPago = @formaPago,
              MesesAcreditacion = @mesesAcreditacion
          WHERE CodigoProducto = @codigoProducto
        `);
      return res.json({ ok: true, message: 'Producto actualizado con éxito' });
    } else {
      // Insert
      await pool.request()
        .input('codigoProducto', sql.Int, codigoProducto)
        .input('nombre', sql.NVarChar(100), nombre)
        .input('tipoDeposito', sql.NVarChar(100), tipoDeposito)
        .input('esCertificado', sql.Bit, esCertificado ? 1 : 0)
        .input('cuentaActiva', sql.NVarChar(20), cuentaActiva)
        .input('cuentaInactiva', sql.NVarChar(20), cuentaInactiva)
        .input('cuentaGasto', sql.NVarChar(20), cuentaGasto || null)
        .input('cuentaProvision', sql.NVarChar(20), cuentaProvision || null)
        .input('cuentaDepositosConfirmar', sql.NVarChar(20), cuentaDepositosConfirmar || null)
        .input('numCtas4Dig', sql.Int, numCtas4Dig || 28)
        .input('permiteDepositos', sql.Bit, permiteDepositos ? 1 : 0)
        .input('permiteRetiros', sql.Bit, permiteRetiros ? 1 : 0)
        .input('permiteDebitos', sql.Bit, permiteDebitos ? 1 : 0)
        .input('permiteCreditos', sql.Bit, permiteCreditos ? 1 : 0)
        .input('permiteTransferencias', sql.Bit, permiteTransferencias ? 1 : 0)
        .input('tasa', sql.NVarChar(50), tasa || 'TASA NOMINAL')
        .input('formaPago', sql.NVarChar(100), formaPago || 'MOVIMIENTO HISTORICO PONDERADO BASE')
        .input('mesesAcreditacion', sql.NVarChar(100), mesesAcreditacion || 'Diciembre')
        .query(`
          INSERT INTO dbo.parametrosproductos (
            CodigoProducto, Nombre, TipoDeposito, EsCertificado,
            CuentaActiva, CuentaInactiva, CuentaGasto, CuentaProvision, CuentaDepositosConfirmar,
            NumCtas4Dig, PermiteDepositos, PermiteRetiros, PermiteDebitos, PermiteCreditos, PermiteTransferencias,
            Tasa, FormaPago, MesesAcreditacion
          ) VALUES (
            @codigoProducto, @nombre, @tipoDeposito, @esCertificado,
            @cuentaActiva, @cuentaInactiva, @cuentaGasto, @cuentaProvision, @cuentaDepositosConfirmar,
            @numCtas4Dig, @permiteDepositos, @permiteRetiros, @permiteDebitos, @permiteCreditos, @permiteTransferencias,
            @tasa, @formaPago, @mesesAcreditacion
          )
        `);
      return res.json({ ok: true, message: 'Producto creado con éxito' });
    }
  } catch (err) {
    console.error('[guardar producto]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/anular ──────────────────────────────────────────
app.post('/api/socios/loans/anular', async (req, res) => {
  const { id, usuarioId } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'El ID de la solicitud es requerido' });

  const userId = (usuarioId || 'asesor').trim().toLowerCase();

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Check if the user has MANAGER or ADMIN role
    const userRes = await pool.request()
      .input('usuarioId', sql.NVarChar(20), userId)
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @usuarioId');
    const userRole = userRes.recordset.length > 0 ? userRes.recordset[0].Rol : 'CREDIT_OFFICER';

    if (userRole !== 'MANAGER' && userRole !== 'ADMIN') {
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Solo los usuarios con rol de Jefe de Crédito o Administrador pueden anular créditos.' });
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Get loan info
      const loanRes = await transaction.request()
        .input('id', sql.NVarChar(50), id)
        .query('SELECT Identificacion, Monto, PlanPagos, Estado, DescuentosDesembolso FROM dbo.SolicitudesCredito WHERE SolicitudID = @id');

      if (loanRes.recordset.length === 0) {
        throw new Error('Solicitud de crédito no encontrada');
      }

      const loan = loanRes.recordset[0];
      if (loan.Estado === 'ANULADO') {
        throw new Error('El crédito ya está anulado');
      }

      // 1. Check if there are any paid installments
      if (loan.PlanPagos) {
        const plan = JSON.parse(loan.PlanPagos);
        const hasPaid = plan.some(i => i.status === 'PAGADO');
        if (hasPaid) {
          throw new Error('No se puede anular el crédito: existen cuotas cobradas. Debe anular primero todos los pagos individuales de este crédito.');
        }
      }

      // If the loan is SOLICITADO or RECHAZADO, we just update status to ANULADO
      if (loan.Estado === 'SOLICITADO' || loan.Estado === 'RECHAZADO') {
        await transaction.request()
          .input('id', sql.NVarChar(50), id)
          .query("UPDATE dbo.SolicitudesCredito SET Estado = 'ANULADO', Saldo = 0.00 WHERE SolicitudID = @id");

        await transaction.commit();
        return res.json({ ok: true, message: 'Solicitud de crédito anulada con éxito' });
      }

      // If the loan is VIGENTE or VENCIDO, it was disbursed, so we need to reverse the disbursement
      const loanAmount = parseFloat(loan.Monto);
      let descuentos = { comision: 0, fondo: 0, totalDescuentos: 0, netoDisbursed: loanAmount };
      if (loan.DescuentosDesembolso) {
        try {
          descuentos = JSON.parse(loan.DescuentosDesembolso);
        } catch (e) {
          descuentos = {
            comision: parseFloat((loanAmount * 0.01).toFixed(2)),
            fondo: parseFloat((loanAmount * 0.005).toFixed(2)),
            totalDescuentos: parseFloat((loanAmount * 0.015).toFixed(2)),
            netoDisbursed: parseFloat((loanAmount - (loanAmount * 0.015)).toFixed(2))
          };
        }
      }

      // Find the member savings account
      const accountRes = await transaction.request()
        .input('identificacion', sql.NVarChar(20), loan.Identificacion)
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @identificacion)
            AND p.EsCertificado = 0
        `);

      if (accountRes.recordset.length === 0) {
        throw new Error('Cuenta de ahorros del socio no encontrada');
      }

      const account = accountRes.recordset[0];
      const currentBalance = parseFloat(account.Saldo);
      const newBalance = currentBalance - descuentos.netoDisbursed;

      if (newBalance < 0) {
        throw new Error(`No se puede anular el crédito porque el socio no dispone del saldo desembolsado suficiente en su cuenta de ahorros. Saldo disponible: $${currentBalance.toFixed(2)} USD, Requerido para reverso: $${descuentos.netoDisbursed.toFixed(2)} USD`);
      }

      // Update the savings account balance
      await transaction.request()
        .input('cuentaId', sql.Int, account.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
        .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      // Update loan status to ANULADO and Saldo = 0
      await transaction.request()
        .input('id', sql.NVarChar(50), id)
        .query("UPDATE dbo.SolicitudesCredito SET Estado = 'ANULADO', Saldo = 0.00 WHERE SolicitudID = @id");

      // Record Reversal Contable entries (Double Entry)
      const concept = `REVERSO DESEMBOLSO ANULADO CRÉDITO ${id}`;
      
      // Revert seat 1: Haber in Cartera de Créditos Vigentes (1.2.01) for Monto (capital)
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '1.2.01')
        .input('concepto', sql.NVarChar(200), concept)
        .input('debe', sql.Decimal(18, 2), 0.00)
        .input('haber', sql.Decimal(18, 2), loanAmount)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), userId)
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // Revert seat 2: Debe in Depósitos de Ahorro del Socio (decreases pasivo) for net disbursed
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), account.CuentaActiva)
        .input('concepto', sql.NVarChar(200), concept)
        .input('debe', sql.Decimal(18, 2), descuentos.netoDisbursed)
        .input('haber', sql.Decimal(18, 2), 0.00)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), userId)
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // Revert seat 3: Debe in Ingreso por Comisión (5.2.01)
      if (descuentos.comision > 0) {
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '5.2.01')
          .input('concepto', sql.NVarChar(200), `REVERSO COMISIÓN CRÉDITO ${id}`)
          .input('debe', sql.Decimal(18, 2), descuentos.comision)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), userId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      }

      // Revert seat 4: Debe in Fondo Irrepartible (3.2.01)
      if (descuentos.fondo > 0) {
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '3.2.01')
          .input('concepto', sql.NVarChar(200), `REVERSO FONDO IRREPARTIBLE CRÉDITO ${id}`)
          .input('debe', sql.Decimal(18, 2), descuentos.fondo)
          .input('haber', sql.Decimal(18, 2), 0.00)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), userId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      }

      // Record Auditoria
      const auditDetail = `Anulación y reverso de desembolso de crédito ${id} por $${loanAmount.toFixed(2)} USD. Reversado por: ${userId} (${userRole})`;
      await transaction.request()
        .input('usuarioId', sql.NVarChar(20), userId)
        .input('concepto', sql.NVarChar(100), 'Anulación de Crédito')
        .input('detalle', sql.NVarChar(500), auditDetail)
        .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

      await transaction.commit();
      return res.json({ ok: true, message: 'Crédito anulado y desembolso reversado con éxito', balance: newBalance });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[anular loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/anular-pago ─────────────────────────────────────
app.post('/api/socios/loans/anular-pago', async (req, res) => {
  const { loanId, installmentNumber, usuarioId } = req.body || {};
  if (!loanId || !installmentNumber) {
    return res.status(400).json({ ok: false, error: 'loanId e installmentNumber son requeridos' });
  }

  const userId = (usuarioId || 'asesor').trim().toLowerCase();
  const instNum = parseInt(installmentNumber, 10);

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Check if the user has MANAGER or ADMIN role
    const userRes = await pool.request()
      .input('usuarioId', sql.NVarChar(20), userId)
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @usuarioId');
    const userRole = userRes.recordset.length > 0 ? userRes.recordset[0].Rol : 'CREDIT_OFFICER';

    if (userRole !== 'MANAGER' && userRole !== 'ADMIN') {
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Solo los usuarios con rol de Jefe de Crédito o Administrador pueden anular pagos.' });
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // 1. Obtener el crédito
      const loanRes = await transaction.request()
        .input('loanId', sql.NVarChar(50), loanId)
        .query('SELECT Identificacion, Monto, Saldo, PlanPagos, Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @loanId');

      if (loanRes.recordset.length === 0) {
        throw new Error('Solicitud de crédito no encontrada');
      }

      const loan = loanRes.recordset[0];
      if (!loan.PlanPagos) {
        throw new Error('El crédito no posee plan de pagos');
      }

      const plan = JSON.parse(loan.PlanPagos);
      const targetInst = plan.find(i => i.number === instNum);
      if (!targetInst) {
        throw new Error(`Cuota número ${instNum} no encontrada en el plan de pagos`);
      }

      if (targetInst.status !== 'PAGADO') {
        throw new Error(`La cuota número ${instNum} no está en estado PAGADO, por lo que no se puede anular`);
      }

      // Check if this payment was prorated
      const ledgerCheck = await transaction.request()
        .input('loanId', sql.NVarChar(50), loanId)
        .input('concept', sql.NVarChar(200), `%PAGO CUOTA #${instNum} PRÉSTAMO ${loanId}%`)
        .query("SELECT Concepto, Debe, Haber FROM dbo.RegistroContable WHERE Concepto LIKE @concept");
      
      let isProrated = false;
      if (ledgerCheck.recordset.length > 0) {
        isProrated = ledgerCheck.recordset.some(r => r.Concepto && r.Concepto.includes('CON PRORRATEO'));
      }

      // Re-calculate or restore interest if it was prorated
      let interestDiscount = 0;
      if (isProrated) {
        const oldInterest = targetInst.interest;
        targetInst.interest = parseFloat((targetInst.interest * 2).toFixed(2));
        interestDiscount = targetInst.interest - oldInterest;
        targetInst.total = parseFloat((targetInst.capital + targetInst.interest).toFixed(2));
      }

      const payAmt = targetInst.total;

      // Find the member savings account
      const accountRes = await transaction.request()
        .input('identificacion', sql.NVarChar(20), loan.Identificacion)
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @identificacion)
            AND p.EsCertificado = 0
        `);

      if (accountRes.recordset.length === 0) {
        throw new Error('Cuenta de ahorros del socio no encontrada');
      }

      const account = accountRes.recordset[0];
      const currentSavingsBalance = parseFloat(account.Saldo);
      let newSavingsBalance = currentSavingsBalance;

      // Determine payment source from the ledger logs
      let isAccountPayment = true;
      if (ledgerCheck.recordset.length > 0) {
        const hasCaja = ledgerCheck.recordset.some(r => r.CuentaContable === '110105');
        if (hasCaja) {
          isAccountPayment = false;
        }
      }

      // Return the money to their savings account if paid via savings
      if (isAccountPayment) {
        newSavingsBalance = currentSavingsBalance + payAmt;
        await transaction.request()
          .input('cuentaId', sql.Int, account.CuentaId)
          .input('nuevoSaldo', sql.Decimal(18, 2), newSavingsBalance)
          .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');
      }

      // Update the installment status to PENDIENTE
      targetInst.status = 'PENDIENTE';

      // Update the loan's balance and status in SolicitudesCredito
      const newLoanBalance = parseFloat(loan.Saldo) + targetInst.capital;
      let newLoanStatus = loan.Estado;
      if (loan.Estado === 'PAGADO') {
        newLoanStatus = 'VIGENTE';
      }

      await transaction.request()
        .input('loanId', sql.NVarChar(50), loanId)
        .input('saldo', sql.Decimal(15, 2), newLoanBalance)
        .input('estado', sql.NVarChar(20), newLoanStatus)
        .input('planPagos', sql.NVarChar(sql.MAX), JSON.stringify(plan))
        .query('UPDATE dbo.SolicitudesCredito SET Saldo = @saldo, Estado = @estado, PlanPagos = @planPagos WHERE SolicitudID = @loanId');

      // 4. Record Contable Reversal Entries
      const revConcept = `REVERSO PAGO CUOTA #${instNum} PRÉSTAMO ${loanId}${isProrated ? ' (CON PRORRATEO)' : ''}`;

      if (isAccountPayment) {
        // Revert Asiento 1: Haber en Depósitos de Ahorro del Socio (aumenta pasivo)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), account.CuentaActiva)
          .input('concepto', sql.NVarChar(200), revConcept)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), payAmt)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), userId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      } else {
        // Revert cash payment:
        // Revert Asiento 1.1: Egreso de Caja/Bancos (Haber)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '110105')
          .input('concepto', sql.NVarChar(200), `REVERSO EFECTIVO PAGO CUOTA #${instNum} ${loanId}`)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), payAmt)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), userId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Revert Asiento 1.2: Ahorros del Socio Haber
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), account.CuentaActiva)
          .input('concepto', sql.NVarChar(200), revConcept)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), payAmt)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), userId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');
      }

      // Revert Asiento 2: Debe en Cartera de Crédito Vigente (aumenta activo) por el capital
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '1.2.01')
        .input('concepto', sql.NVarChar(200), revConcept)
        .input('debe', sql.Decimal(18, 2), targetInst.capital)
        .input('haber', sql.Decimal(18, 2), 0.00)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), userId)
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // Revert Asiento 3: Debe en Ingresos por Intereses (disminuye ingresos) por el interés
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '5.1.01')
        .input('concepto', sql.NVarChar(200), revConcept)
        .input('debe', sql.Decimal(18, 2), targetInst.interest)
        .input('haber', sql.Decimal(18, 2), 0.00)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), userId)
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // 5. Registrar en auditoría
      const auditDetail = `Anulación de dividendo #${instNum} del crédito ${loanId}. Reversado pago de $${payAmt.toFixed(2)} USD (Capital: $${targetInst.capital.toFixed(2)}, Interés: $${targetInst.interest.toFixed(2)}${isProrated ? `, Reverso Prorrateo: $${interestDiscount.toFixed(2)}` : ''}). Aprobado por: ${userId} (${userRole})`;
      await transaction.request()
        .input('usuarioId', sql.NVarChar(20), userId)
        .input('concepto', sql.NVarChar(100), 'Anulación de Pago de Dividendo')
        .input('detalle', sql.NVarChar(500), auditDetail)
        .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

      await transaction.commit();
      return res.json({ ok: true, message: 'Pago de dividendo anulado con éxito', loanBalance: newLoanBalance, savingsBalance: newSavingsBalance });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[anular pago]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/update-status ──────────────────────────────────
app.post('/api/socios/loans/update-status', async (req, res) => {
  const { loanId, status, reason, usuarioId } = req.body || {};
  if (!loanId || !status) {
    return res.status(400).json({ ok: false, error: 'loanId y status son requeridos' });
  }

  const userId = (usuarioId || 'asesor').trim().toLowerCase();
  const upperStatus = status.trim().toUpperCase();

  if (upperStatus !== 'TRAMITE_JUDICIAL' && upperStatus !== 'CASTIGADO' && upperStatus !== 'VIGENTE' && upperStatus !== 'VENCIDO') {
    return res.status(400).json({ ok: false, error: 'Estado de cartera no válido. Debe ser TRAMITE_JUDICIAL, CASTIGADO, VIGENTE o VENCIDO.' });
  }

  try {
    const pool = await sql.connect(sqlConfig);
    
    // Check role - castigo de cartera requires manager or admin
    const userRes = await pool.request()
      .input('usuarioId', sql.NVarChar(20), userId)
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @usuarioId');
    const userRole = userRes.recordset.length > 0 ? userRes.recordset[0].Rol : 'CREDIT_OFFICER';

    if (upperStatus === 'CASTIGADO' && userRole !== 'MANAGER' && userRole !== 'ADMIN') {
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Solo un Jefe de Crédito o Administrador puede castigar cartera.' });
    }

    // Get current loan info
    const loanRes = await pool.request()
      .input('loanId', sql.NVarChar(50), loanId)
      .query('SELECT Estado, Monto, Saldo FROM dbo.SolicitudesCredito WHERE SolicitudID = @loanId');

    if (loanRes.recordset.length === 0) {
      return res.status(404).json({ ok: false, error: 'Crédito no encontrado' });
    }

    const loan = loanRes.recordset[0];

    // castigo de cartera (solo créditos vencidos)
    if (upperStatus === 'CASTIGADO' && loan.Estado !== 'VENCIDO') {
      return res.status(400).json({ ok: false, error: `No se puede castigar la cartera: El crédito debe estar en estado VENCIDO. Estado actual: ${loan.Estado}` });
    }

    // Update status in SolicitudesCredito
    let updateQuery = "UPDATE dbo.SolicitudesCredito SET Estado = @status";
    if (reason) {
      updateQuery += ", Observaciones = ISNULL(Observaciones, '') + ' | Cambio Estado: ' + @reason";
    }
    updateQuery += " WHERE SolicitudID = @loanId";

    await pool.request()
      .input('loanId', sql.NVarChar(50), loanId)
      .input('status', sql.NVarChar(20), upperStatus)
      .input('reason', sql.NVarChar(500), reason || '')
      .query(updateQuery);

    // Record Auditoria
    const auditDetail = `Cambio de estado de cartera para crédito ${loanId} a ${upperStatus}. Razón/Acuerdo: ${reason || 'Ninguna especificada'}. Usuario: ${userId} (${userRole})`;
    await pool.request()
      .input('usuarioId', sql.NVarChar(20), userId)
      .input('concepto', sql.NVarChar(100), 'Cambio Estado Cartera')
      .input('detalle', sql.NVarChar(500), auditDetail)
      .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

    return res.json({ ok: true, message: `Estado del crédito actualizado a ${upperStatus} con éxito` });
  } catch (err) {
    console.error('[update loan status]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/engrams/:clave ──────────────────────────────────────────────────
app.get('/api/engrams/:clave', async (req, res) => {
  const { clave } = req.params;
  if (!clave) {
    return res.status(400).json({ ok: false, error: 'La clave del engrama es requerida' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('clave', sql.NVarChar(100), clave.trim())
      .query('SELECT Clave, Modulo, Contenido, FechaActualizacion, UsuarioModificacion FROM dbo.AgenteEngrams WHERE Clave = @clave');
    
    if (result.recordset.length === 0) {
      return res.json({ ok: true, data: null });
    }

    const row = result.recordset[0];
    let parsedContent;
    try {
      parsedContent = JSON.parse(row.Contenido);
    } catch (_) {
      parsedContent = row.Contenido;
    }

    return res.json({
      ok: true,
      data: {
        clave: row.Clave,
        modulo: row.Modulo,
        contenido: parsedContent,
        fechaActualizacion: row.FechaActualizacion,
        usuarioModificacion: row.UsuarioModificacion
      }
    });
  } catch (err) {
    console.error('[get engram]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/engrams ────────────────────────────────────────────────────────
app.post('/api/engrams', async (req, res) => {
  const { clave, modulo, contenido, usuario } = req.body || {};
  if (!clave || !modulo || !contenido) {
    return res.status(400).json({ ok: false, error: 'clave, modulo y contenido son requeridos' });
  }

  const stringifiedContent = typeof contenido === 'object' ? JSON.stringify(contenido) : String(contenido);

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    await pool.request()
      .input('clave', sql.NVarChar(100), clave.trim())
      .input('modulo', sql.NVarChar(50), modulo.trim())
      .input('contenido', sql.NVarChar(sql.MAX), stringifiedContent)
      .input('usuario', sql.NVarChar(50), usuario ? usuario.trim() : null)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.AgenteEngrams WHERE Clave = @clave)
        BEGIN
            UPDATE dbo.AgenteEngrams
            SET Modulo = @modulo,
                Contenido = @contenido,
                FechaActualizacion = SYSDATETIME(),
                UsuarioModificacion = @usuario
            WHERE Clave = @clave;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.AgenteEngrams (Clave, Modulo, Contenido, UsuarioModificacion)
            VALUES (@clave, @modulo, @contenido, @usuario);
        END
      `);

    return res.json({ ok: true, message: 'Engram guardado con éxito' });
  } catch (err) {
    console.error('[post engram]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/server-date ──────────────────────────────────────────────────────
app.get('/api/server-date', (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return res.json({ ok: true, date: `${year}-${month}-${day}` });
});

// ── GET /api/socios/siguiente-numero ──────────────────────────────────────────
app.get('/api/socios/siguiente-numero', async (req, res) => {
  const tipo = (req.query.tipo || 'SOCIO').toUpperCase();
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const countRes = await pool.request()
      .input('tipo', sql.NVarChar(20), tipo)
      .query('SELECT COUNT(*) as count FROM dbo.RegistroSocios WHERE TipoPersona = @tipo');
    const count = countRes.recordset[0].count;
    
    let prefix = 'S-00';
    if (tipo === 'CLIENTE') prefix = 'CL-00';
    else if (tipo === 'CLIENTE_EXTERNO') prefix = 'CE-00';
    
    const siguiente = prefix + (count + 1);
    await pool.close();
    return res.json({ ok: true, siguiente });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[siguiente-numero]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/caja/control/estado ──────────────────────────────────────────────
app.get('/api/caja/control/estado', async (req, res) => {
  const { usuarioId, fecha } = req.query;
  if (!usuarioId || !fecha) {
    return res.status(400).json({ ok: false, error: 'usuarioId y fecha son requeridos' });
  }
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('UsuarioId', sql.NVarChar(50), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .query('SELECT Estado, SaldoApertura, SaldoCierre FROM dbo.ControlCaja WHERE UsuarioId = @UsuarioId AND Fecha = @Fecha');
    
    await pool.close();
    if (result.recordset.length === 0) {
      return res.json({ ok: true, estado: 'NO_INICIADA', openingBalance: 0 });
    }
    const row = result.recordset[0];
    return res.json({ ok: true, estado: row.Estado, openingBalance: parseFloat(row.SaldoApertura || 0), closingBalance: parseFloat(row.SaldoCierre || 0) });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[caja-control-estado]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/caja/control/abrir ──────────────────────────────────────────────
app.post('/api/caja/control/abrir', async (req, res) => {
  const { usuarioId, fecha, saldoApertura } = req.body || {};
  if (!usuarioId || !fecha || saldoApertura === undefined) {
    return res.status(400).json({ ok: false, error: 'usuarioId, fecha y saldoApertura son requeridos' });
  }
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    // Check if duplicate control exists for this user and date
    const check = await pool.request()
      .input('UsuarioId', sql.NVarChar(50), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .query('SELECT COUNT(*) as count FROM dbo.ControlCaja WHERE UsuarioId = @UsuarioId AND Fecha = @Fecha');
    
    if (check.recordset[0].count > 0) {
      await pool.close();
      return res.status(400).json({ ok: false, error: 'Ya existe un registro de caja para este usuario en el día de hoy.' });
    }

    await pool.request()
      .input('UsuarioId', sql.NVarChar(50), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .input('SaldoApertura', sql.Decimal(18,2), saldoApertura)
      .query(`
        INSERT INTO dbo.ControlCaja (UsuarioId, Fecha, HoraApertura, SaldoApertura, Estado)
        VALUES (@UsuarioId, @Fecha, SYSDATETIME(), @SaldoApertura, 'ABIERTO')
      `);
      
    await pool.close();
    return res.json({ ok: true, message: 'Caja abierta correctamente en el servidor' });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[caja-control-abrir]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/caja/control/cerrar ─────────────────────────────────────────────
app.post('/api/caja/control/cerrar', async (req, res) => {
  const { usuarioId, fecha, saldoCierre } = req.body || {};
  if (!usuarioId || !fecha || saldoCierre === undefined) {
    return res.status(400).json({ ok: false, error: 'usuarioId, fecha y saldoCierre son requeridos' });
  }
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    // Verify if it is currently open
    const check = await pool.request()
      .input('UsuarioId', sql.NVarChar(50), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .query('SELECT Estado FROM dbo.ControlCaja WHERE UsuarioId = @UsuarioId AND Fecha = @Fecha');
      
    if (check.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'No se encontró un registro de caja abierto para el día de hoy.' });
    }
    
    if (check.recordset[0].Estado === 'CERRADO') {
      await pool.close();
      return res.status(400).json({ ok: false, error: 'La caja ya se encuentra cerrada para el día de hoy.' });
    }

    await pool.request()
      .input('UsuarioId', sql.NVarChar(50), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .input('SaldoCierre', sql.Decimal(18,2), saldoCierre)
      .query(`
        UPDATE dbo.ControlCaja
        SET Estado = 'CERRADO', HoraCierre = SYSDATETIME(), SaldoCierre = @SaldoCierre
        WHERE UsuarioId = @UsuarioId AND Fecha = @Fecha
      `);
      
    await pool.close();
    return res.json({ ok: true, message: 'Caja cerrada correctamente en el servidor' });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[caja-control-cerrar]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/caja/control/historial ──────────────────────────────────────────
app.get('/api/caja/control/historial', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .query('SELECT ControlID, UsuarioId, Fecha, HoraApertura, HoraCierre, SaldoApertura, SaldoCierre, Estado FROM dbo.ControlCaja ORDER BY Fecha DESC, HoraApertura DESC');
    await pool.close();
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[caja-control-historial]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/reportes/situacion-general ──────────────────────────────────────
app.get('/api/reportes/situacion-general', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    // 1. Total socios
    const totalSociosRes = await pool.request()
      .query("SELECT COUNT(*) AS total FROM dbo.RegistroSocios WHERE Estado = 'ACTIVO'");
    const totalSocios = totalSociosRes.recordset[0].total;

    // 2. Socios por tipo
    const sociosPorTipoRes = await pool.request()
      .query("SELECT TipoPersona, COUNT(*) AS cantidad FROM dbo.RegistroSocios WHERE Estado = 'ACTIVO' GROUP BY TipoPersona");
    const sociosPorTipo = sociosPorTipoRes.recordset;

    // 3. Totales globales de cuentas (Ahorro vista y Certificados)
    const balancesRes = await pool.request()
      .query(`
        SELECT 
          SUM(CASE WHEN p.EsCertificado = 0 THEN c.Saldo ELSE 0 END) AS saldoAhorroVista,
          SUM(CASE WHEN p.EsCertificado = 1 THEN c.Saldo ELSE 0 END) AS saldoCertificados,
          COUNT(CASE WHEN p.EsCertificado = 0 THEN 1 END) AS numAhorroVista,
          COUNT(CASE WHEN p.EsCertificado = 1 THEN 1 END) AS numCertificados
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
      `);
    const balances = balancesRes.recordset[0];

    await pool.close();

    return res.json({
      ok: true,
      data: {
        totalSocios,
        sociosPorTipo,
        saldoAhorroVista: parseFloat(balances.saldoAhorroVista || 0),
        saldoCertificados: parseFloat(balances.saldoCertificados || 0),
        numAhorroVista: balances.numAhorroVista || 0,
        numCertificados: balances.numCertificados || 0
      }
    });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[situacion-general]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO 7: DEPÓSITOS A PLAZO FIJO (DPF) — NORMATIVA SEPS
// Plan de Cuentas: 2103 Depósitos a Plazo | 4103 Int.Causados | 2503 Int.x Pagar
// Retención Art.37 LORTI: 2% sobre rendimientos financieros
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/dpf/tasas', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
      SELECT TasaID, CodigoRango, DescripcionRango, DiasDesde, DiasHasta,
             TasaNominalAnual, TasaMaximaBCE, MontoMinimo, MontoMaximo,
             CuentaContableDPF, PorcentajePenalizacion, Activo,
             CONVERT(NVARCHAR(10), FechaVigencia, 103) AS FechaVigencia, UsuarioConfigID
      FROM dbo.TasasPlazoFijo ORDER BY DiasDesde ASC
    `);
    await pool.close();
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/dpf/tasas/:id', async (req, res) => {
  let pool;
  const { tasaNominalAnual, montoMinimo, montoMaximo, porcentajePenalizacion, activo, usuarioID } = req.body;
  try {
    if (tasaNominalAnual === undefined || tasaNominalAnual < 0)
      return res.status(400).json({ ok: false, error: 'Tasa nominal inválida.' });
    pool = await sql.connect(sqlConfig);
    const row = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT TasaMaximaBCE FROM dbo.TasasPlazoFijo WHERE TasaID = @id');
    if (row.recordset.length === 0) { await pool.close(); return res.status(404).json({ ok: false, error: 'Tramo no encontrado.' }); }
    const techoMax = parseFloat(row.recordset[0].TasaMaximaBCE);
    if (parseFloat(tasaNominalAnual) > techoMax + 0.001)
      return res.status(400).json({ ok: false, error: `La tasa ${tasaNominalAnual}% supera el techo BCE de ${techoMax}%.` });
    await pool.request()
      .input('id',       sql.Int,          req.params.id)
      .input('tna',      sql.Decimal(5,2), tasaNominalAnual)
      .input('minMonto', sql.Decimal(15,2),montoMinimo ?? 200)
      .input('maxMonto', sql.Decimal(15,2),montoMaximo ?? null)
      .input('penal',    sql.Decimal(5,2), porcentajePenalizacion ?? 50)
      .input('activo',   sql.Bit,          activo !== undefined ? activo : 1)
      .input('usuID',    sql.NVarChar(50), usuarioID || 'SISTEMA')
      .query(`UPDATE dbo.TasasPlazoFijo SET
                TasaNominalAnual=@tna, MontoMinimo=@minMonto, MontoMaximo=@maxMonto,
                PorcentajePenalizacion=@penal, Activo=@activo,
                FechaVigencia=CAST(SYSDATETIME() AS DATE), UsuarioConfigID=@usuID
              WHERE TasaID=@id`);
    await pool.close();
    return res.json({ ok: true, message: 'Tasa actualizada correctamente.' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/dpf/resumen', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const r = await pool.request().query(`
      SELECT
        COUNT(*) AS totalDPF,
        SUM(CASE WHEN Estado='ACTIVO'    THEN 1 ELSE 0 END) AS activos,
        SUM(CASE WHEN Estado='VENCIDO'   THEN 1 ELSE 0 END) AS vencidos,
        SUM(CASE WHEN Estado='LIQUIDADO' THEN 1 ELSE 0 END) AS liquidados,
        SUM(CASE WHEN Estado='CANCELADO' THEN 1 ELSE 0 END) AS cancelados,
        ISNULL(SUM(CASE WHEN Estado='ACTIVO' THEN MontoCapital ELSE 0 END),0) AS capitalActivo,
        ISNULL(SUM(CASE WHEN Estado='ACTIVO' THEN InteresProyectado ELSE 0 END),0) AS interesProyectadoTotal,
        SUM(CASE WHEN Estado IN ('ACTIVO','VENCIDO') AND CAST(FechaVencimiento AS DATE)<=CAST(SYSDATETIME() AS DATE) THEN 1 ELSE 0 END) AS vencimientosHoy
      FROM dbo.DepositosPlazo
    `);
    await pool.close();
    return res.json({ ok: true, data: r.recordset[0] });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/dpf/vencimientos', async (req, res) => {
  let pool;
  const dias = parseInt(req.query.dias) || 7;
  try {
    pool = await sql.connect(sqlConfig);
    const r = await pool.request().input('dias', sql.Int, dias).query(`
      SELECT d.DepositoID, d.Identificacion, d.NombreSocio, d.MontoCapital,
             d.TasaNominalAnual, d.PlazosDias, d.InteresProyectado,
             d.RetencionProyectada, d.InteresNetoProyectado, d.Estado, d.TipoRenovacion,
             CONVERT(NVARCHAR(10), d.FechaApertura,   103) AS FechaApertura,
             CONVERT(NVARCHAR(10), d.FechaVencimiento, 103) AS FechaVencimiento,
             DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), CAST(d.FechaVencimiento AS DATE)) AS DiasRestantes,
             t.DescripcionRango, t.PorcentajePenalizacion
      FROM dbo.DepositosPlazo d
      INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID = t.TasaID
      WHERE d.Estado IN ('ACTIVO','VENCIDO')
        AND CAST(d.FechaVencimiento AS DATE) <= DATEADD(DAY, @dias, CAST(SYSDATETIME() AS DATE))
      ORDER BY d.FechaVencimiento ASC
    `);
    await pool.close();
    return res.json({ ok: true, data: r.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/dpf', async (req, res) => {
  let pool;
  const { estado, busqueda, desde, hasta } = req.query;
  try {
    pool = await sql.connect(sqlConfig);
    let where = 'WHERE 1=1';
    const request = pool.request();
    if (estado)   { where += ' AND d.Estado=@estado';   request.input('estado', sql.NVarChar(20), estado); }
    if (busqueda) { where += ' AND (d.Identificacion LIKE @bus OR d.NombreSocio LIKE @bus OR d.DepositoID LIKE @bus)'; request.input('bus', sql.NVarChar(100), `%${busqueda}%`); }
    if (desde)    { where += ' AND CAST(d.FechaApertura AS DATE)>=@desde'; request.input('desde', sql.Date, desde); }
    if (hasta)    { where += ' AND CAST(d.FechaApertura AS DATE)<=@hasta'; request.input('hasta', sql.Date, hasta); }
    const r = await request.query(`
      SELECT d.DepositoID, d.Identificacion, d.NombreSocio, d.MontoCapital,
             d.TasaNominalAnual, d.PlazosDias, d.InteresProyectado, d.RetencionProyectada,
             d.InteresNetoProyectado, d.Estado, d.TipoRenovacion, d.ModalidadPago,
             d.CuentaContableDPF, d.NumCertificado, d.NumeroRenovacion, d.UsuarioAperturaID,
             d.InteresLiquidado, d.RetencionAplicada, d.InteresNetoLiquidado, d.PenalizacionAplicada,
             CONVERT(NVARCHAR(10), d.FechaApertura,   103) AS FechaApertura,
             CONVERT(NVARCHAR(10), d.FechaVencimiento, 103) AS FechaVencimiento,
             CONVERT(NVARCHAR(10), d.FechaLiquidacion, 103) AS FechaLiquidacion,
             DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), CAST(d.FechaVencimiento AS DATE)) AS DiasRestantes,
             t.DescripcionRango, t.PorcentajePenalizacion
      FROM dbo.DepositosPlazo d
      INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID = t.TasaID
      ${where}
      ORDER BY d.FechaCreacion DESC
    `);
    await pool.close();
    return res.json({ ok: true, data: r.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/dpf/:id', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const dpf = await pool.request().input('id', sql.NVarChar(20), req.params.id).query(`
      SELECT d.*, t.DescripcionRango, t.PorcentajePenalizacion,
             CONVERT(NVARCHAR(10), d.FechaApertura,   103) AS FechaAperturaFmt,
             CONVERT(NVARCHAR(10), d.FechaVencimiento,103) AS FechaVencimientoFmt,
             CONVERT(NVARCHAR(10), d.FechaLiquidacion,103) AS FechaLiquidacionFmt,
             DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), CAST(d.FechaVencimiento AS DATE)) AS DiasRestantes
      FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID
      WHERE d.DepositoID=@id
    `);
    if (dpf.recordset.length === 0) { await pool.close(); return res.status(404).json({ ok: false, error: 'DPF no encontrado.' }); }
    const asientos = await pool.request().input('id', sql.NVarChar(20), req.params.id).query(`
      SELECT AsientoID, TipoOperacion, CuentaContable, NombreCuenta,
             DebeAmount, HaberAmount, Concepto, UsuarioID,
             CONVERT(NVARCHAR(19), FechaAsiento, 120) AS FechaAsiento
      FROM dbo.AsientosContablesDPF WHERE DepositoID=@id ORDER BY AsientoID ASC
    `);
    await pool.close();
    return res.json({ ok: true, data: dpf.recordset[0], asientos: asientos.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/dpf', async (req, res) => {
  let pool;
  const { socioid, identificacion, nombreSocio, tasaID, montoCapital, plazosDias,
          tipoRenovacion, modalidadPago, cuentaAhorrosRelacionada, observaciones, usuarioID } = req.body;
  try {
    if (!socioid || !identificacion || !montoCapital || !plazosDias || !tasaID)
      return res.status(400).json({ ok: false, error: 'Campos obligatorios: socioid, identificacion, montoCapital, plazosDias, tasaID.' });
    if (parseFloat(montoCapital) <= 0) return res.status(400).json({ ok: false, error: 'Monto debe ser mayor a cero.' });
    if (parseInt(plazosDias) < 1) return res.status(400).json({ ok: false, error: 'Plazo mínimo 1 día.' });
    pool = await sql.connect(sqlConfig);
    const tasaRow = await pool.request().input('tid', sql.Int, tasaID)
      .query('SELECT * FROM dbo.TasasPlazoFijo WHERE TasaID=@tid AND Activo=1');
    if (tasaRow.recordset.length === 0) { await pool.close(); return res.status(400).json({ ok: false, error: 'Tramo de tasa no válido.' }); }
    const tasa = tasaRow.recordset[0];
    const monto = parseFloat(montoCapital), dias = parseInt(plazosDias);
    if (monto < parseFloat(tasa.MontoMinimo)) return res.status(400).json({ ok: false, error: `Monto mínimo para este tramo: $${tasa.MontoMinimo}.` });
    if (tasa.MontoMaximo && monto > parseFloat(tasa.MontoMaximo)) return res.status(400).json({ ok: false, error: `Monto máximo: $${tasa.MontoMaximo}.` });
    if (dias < tasa.DiasDesde || (tasa.DiasHasta < 9999 && dias > tasa.DiasHasta))
      return res.status(400).json({ ok: false, error: `Plazo debe ser entre ${tasa.DiasDesde} y ${tasa.DiasHasta} días.` });
    const tna = parseFloat(tasa.TasaNominalAnual);
    const interesProyectado     = monto * (tna / 100) * (dias / 365);
    const retencionProyectada   = interesProyectado * 0.02;
    const interesNetoProyectado = interesProyectado - retencionProyectada;
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + dias);
    const idResult = await pool.request().output('NuevoID', sql.NVarChar(20)).execute('dbo.usp_GenerarIDDepositoPlazo');
    const depositoID = idResult.output.NuevoID;
    await pool.request()
      .input('depositoID',             sql.NVarChar(20),  depositoID)
      .input('socioid',                sql.BigInt,         socioid)
      .input('identificacion',         sql.NVarChar(20),  identificacion)
      .input('nombreSocio',            sql.NVarChar(200), nombreSocio)
      .input('tasaID',                 sql.Int,           tasaID)
      .input('tasaNominalAnual',       sql.Decimal(5,2),  tna)
      .input('plazosDias',             sql.Int,           dias)
      .input('montoCapital',           sql.Decimal(15,2), monto)
      .input('interesProyectado',      sql.Decimal(15,2), interesProyectado)
      .input('retencionProyectada',    sql.Decimal(15,2), retencionProyectada)
      .input('interesNetoProyectado',  sql.Decimal(15,2), interesNetoProyectado)
      .input('fechaVencimiento',       sql.DateTime2,     fechaVencimiento)
      .input('tipoRenovacion',         sql.NVarChar(20),  tipoRenovacion  || 'NO_RENOVAR')
      .input('modalidadPago',          sql.NVarChar(20),  modalidadPago   || 'AL_VENCIMIENTO')
      .input('cuentaAhorros',          sql.NVarChar(20),  cuentaAhorrosRelacionada || null)
      .input('cuentaContableDPF',      sql.NVarChar(10),  tasa.CuentaContableDPF)
      .input('usuarioAperturaID',      sql.NVarChar(50),  usuarioID || 'SISTEMA')
      .input('observaciones',          sql.NVarChar(500), observaciones || null)
      .query(`INSERT INTO dbo.DepositosPlazo
                (DepositoID,SOCIOID,Identificacion,NombreSocio,NumCertificado,TasaID,TasaNominalAnual,PlazosDias,MontoCapital,
                 InteresProyectado,RetencionProyectada,InteresNetoProyectado,FechaVencimiento,TipoRenovacion,ModalidadPago,
                 CuentaAhorrosRelacionada,CuentaContableDPF,UsuarioAperturaID,Observaciones)
              VALUES(@depositoID,@socioid,@identificacion,@nombreSocio,@depositoID,@tasaID,@tasaNominalAnual,@plazosDias,@montoCapital,
                     @interesProyectado,@retencionProyectada,@interesNetoProyectado,@fechaVencimiento,@tipoRenovacion,@modalidadPago,
                     @cuentaAhorros,@cuentaContableDPF,@usuarioAperturaID,@observaciones)`);
    const asApertura = [
      { cuenta: '2.1.01.05', nombre: 'Depósitos Ahorro Vista (Débito Apertura DPF)', debe: monto,    haber: 0 },
      { cuenta: tasa.CuentaContableDPF, nombre: `Depósitos a Plazo — ${tasa.DescripcionRango}`, debe: 0, haber: monto }
    ];
    for (const a of asApertura) {
      await pool.request()
        .input('depositoID', sql.NVarChar(20), depositoID).input('tipoOp', sql.NVarChar(30), 'APERTURA')
        .input('cuenta', sql.NVarChar(15), a.cuenta).input('nombre', sql.NVarChar(120), a.nombre)
        .input('debe', sql.Decimal(15,2), a.debe).input('haber', sql.Decimal(15,2), a.haber)
        .input('concepto', sql.NVarChar(300), `APERTURA DPF ${depositoID} - ${nombreSocio}`)
        .input('usuarioID', sql.NVarChar(50), usuarioID || 'SISTEMA')
        .query(`INSERT INTO dbo.AsientosContablesDPF (DepositoID,TipoOperacion,CuentaContable,NombreCuenta,DebeAmount,HaberAmount,Concepto,UsuarioID) VALUES(@depositoID,@tipoOp,@cuenta,@nombre,@debe,@haber,@concepto,@usuarioID)`);
    }
    await pool.close();
    return res.status(201).json({
      ok: true, depositoID, numCertificado: depositoID,
      interesProyectado:     parseFloat(interesProyectado.toFixed(2)),
      retencionProyectada:   parseFloat(retencionProyectada.toFixed(2)),
      interesNetoProyectado: parseFloat(interesNetoProyectado.toFixed(2)),
      fechaVencimiento: fechaVencimiento.toISOString().split('T')[0],
      message: `DPF aperturado. Certificado: ${depositoID}`
    });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[dpf-apertura]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/dpf/:id/liquidar', async (req, res) => {
  let pool;
  const { usuarioID } = req.body;
  try {
    pool = await sql.connect(sqlConfig);
    const dpfRow = await pool.request().input('id', sql.NVarChar(20), req.params.id).query(`
      SELECT d.*, t.DescripcionRango FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID WHERE d.DepositoID=@id
    `);
    if (dpfRow.recordset.length === 0) { await pool.close(); return res.status(404).json({ ok: false, error: 'DPF no encontrado.' }); }
    const dpf = dpfRow.recordset[0];
    if (!['ACTIVO','VENCIDO'].includes(dpf.Estado)) return res.status(400).json({ ok: false, error: `No se puede liquidar DPF en estado ${dpf.Estado}.` });
    const interesLiquidado    = parseFloat(dpf.MontoCapital) * (parseFloat(dpf.TasaNominalAnual) / 100) * (dpf.PlazosDias / 365);
    const retencionAplicada   = interesLiquidado * 0.02;
    const interesNetoLiquidado = interesLiquidado - retencionAplicada;
    await pool.request()
      .input('id', sql.NVarChar(20), req.params.id).input('iL', sql.Decimal(15,2), interesLiquidado)
      .input('rA', sql.Decimal(15,2), retencionAplicada).input('iN', sql.Decimal(15,2), interesNetoLiquidado)
      .input('uL', sql.NVarChar(50), usuarioID || 'SISTEMA')
      .query(`UPDATE dbo.DepositosPlazo SET Estado='LIQUIDADO',FechaLiquidacion=SYSDATETIME(),InteresLiquidado=@iL,RetencionAplicada=@rA,InteresNetoLiquidado=@iN,PenalizacionAplicada=0,UsuarioLiquidacionID=@uL,FechaModificacion=SYSDATETIME() WHERE DepositoID=@id`);
    const capital = parseFloat(dpf.MontoCapital);
    const asLiq = [
      { cuenta: dpf.CuentaContableDPF, nombre: `Depósitos a Plazo (${dpf.DescripcionRango})`, debe: capital,            haber: 0 },
      { cuenta: '4.1.03.05',           nombre: 'Intereses Causados DPF',                        debe: interesLiquidado,   haber: 0 },
      { cuenta: '2.1.01.05',           nombre: 'Ahorro Vista — Capital + Interés Neto',          debe: 0,                 haber: capital + interesNetoLiquidado },
      { cuenta: '2.5.03.05',           nombre: 'Retención Rendimientos Financieros 2% (LORTI)', debe: 0,                 haber: retencionAplicada }
    ];
    for (const a of asLiq) {
      await pool.request()
        .input('depositoID', sql.NVarChar(20), req.params.id).input('tipoOp', sql.NVarChar(30), 'LIQUIDACION')
        .input('cuenta', sql.NVarChar(15), a.cuenta).input('nombre', sql.NVarChar(120), a.nombre)
        .input('debe', sql.Decimal(15,2), a.debe).input('haber', sql.Decimal(15,2), a.haber)
        .input('concepto', sql.NVarChar(300), `LIQUIDACIÓN DPF ${req.params.id} - ${dpf.NombreSocio}`)
        .input('usuarioID', sql.NVarChar(50), usuarioID || 'SISTEMA')
        .query(`INSERT INTO dbo.AsientosContablesDPF (DepositoID,TipoOperacion,CuentaContable,NombreCuenta,DebeAmount,HaberAmount,Concepto,UsuarioID) VALUES(@depositoID,@tipoOp,@cuenta,@nombre,@debe,@haber,@concepto,@usuarioID)`);
    }
    await pool.close();
    return res.json({ ok: true, interesLiquidado: parseFloat(interesLiquidado.toFixed(2)), retencionAplicada: parseFloat(retencionAplicada.toFixed(2)), interesNetoLiquidado: parseFloat(interesNetoLiquidado.toFixed(2)), totalAcreditado: parseFloat((capital + interesNetoLiquidado).toFixed(2)), message: `DPF ${req.params.id} liquidado.` });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[dpf-liquidar]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/dpf/:id/cancelar', async (req, res) => {
  let pool;
  const { usuarioID, motivo } = req.body;
  try {
    pool = await sql.connect(sqlConfig);
    const dpfRow = await pool.request().input('id', sql.NVarChar(20), req.params.id).query(`
      SELECT d.*, t.PorcentajePenalizacion, t.DescripcionRango FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID WHERE d.DepositoID=@id
    `);
    if (dpfRow.recordset.length === 0) { await pool.close(); return res.status(404).json({ ok: false, error: 'DPF no encontrado.' }); }
    const dpf = dpfRow.recordset[0];
    if (dpf.Estado !== 'ACTIVO') return res.status(400).json({ ok: false, error: `Solo se cancelan DPFs ACTIVOS. Estado: ${dpf.Estado}.` });
    const hoy = new Date(), apertura = new Date(dpf.FechaApertura);
    const diasTranscurridos = Math.max(0, Math.floor((hoy - apertura) / 86400000));
    const interesBruto   = parseFloat(dpf.MontoCapital) * (parseFloat(dpf.TasaNominalAnual) / 100) * (diasTranscurridos / 365);
    const penalizacion   = interesBruto * (parseFloat(dpf.PorcentajePenalizacion) / 100);
    const interesNeto    = Math.max(0, interesBruto - penalizacion);
    const retencion      = interesNeto * 0.02;
    const interesNetoFinal = interesNeto - retencion;
    await pool.request()
      .input('id', sql.NVarChar(20), req.params.id).input('iL', sql.Decimal(15,2), interesNeto)
      .input('rA', sql.Decimal(15,2), retencion).input('iNF', sql.Decimal(15,2), interesNetoFinal)
      .input('pen', sql.Decimal(15,2), penalizacion).input('mot', sql.NVarChar(400), motivo || 'Cancelación anticipada solicitada por el socio.')
      .input('uL', sql.NVarChar(50), usuarioID || 'SISTEMA')
      .query(`UPDATE dbo.DepositosPlazo SET Estado='CANCELADO',FechaLiquidacion=SYSDATETIME(),InteresLiquidado=@iL,RetencionAplicada=@rA,InteresNetoLiquidado=@iNF,PenalizacionAplicada=@pen,MotivosCancelacion=@mot,UsuarioLiquidacionID=@uL,FechaModificacion=SYSDATETIME() WHERE DepositoID=@id`);
    const capital = parseFloat(dpf.MontoCapital);
    const asCan = [
      { cuenta: dpf.CuentaContableDPF, nombre: `Depósitos a Plazo (${dpf.DescripcionRango})`,   debe: capital,        haber: 0 },
      { cuenta: '4.1.03.05',           nombre: 'Intereses Causados (Cancelación Anticipada)',     debe: interesNeto,    haber: 0 },
      { cuenta: '2.1.01.05',           nombre: 'Ahorro Vista — Devolución Neta',                  debe: 0,             haber: capital + interesNetoFinal },
      { cuenta: '2.5.03.05',           nombre: 'Retención 2% Rendimientos Financieros',           debe: 0,             haber: retencion },
      { cuenta: '5.4.90.90',           nombre: 'Penalización por Cancelación Anticipada DPF',     debe: 0,             haber: penalizacion }
    ];
    for (const a of asCan) {
      await pool.request()
        .input('depositoID', sql.NVarChar(20), req.params.id).input('tipoOp', sql.NVarChar(30), 'CANCELACION_ANTICIPADA')
        .input('cuenta', sql.NVarChar(15), a.cuenta).input('nombre', sql.NVarChar(120), a.nombre)
        .input('debe', sql.Decimal(15,2), a.debe).input('haber', sql.Decimal(15,2), a.haber)
        .input('concepto', sql.NVarChar(300), `CANCELACIÓN ANTICIPADA ${req.params.id} - ${dpf.NombreSocio}`)
        .input('usuarioID', sql.NVarChar(50), usuarioID || 'SISTEMA')
        .query(`INSERT INTO dbo.AsientosContablesDPF (DepositoID,TipoOperacion,CuentaContable,NombreCuenta,DebeAmount,HaberAmount,Concepto,UsuarioID) VALUES(@depositoID,@tipoOp,@cuenta,@nombre,@debe,@haber,@concepto,@usuarioID)`);
    }
    await pool.close();
    return res.json({ ok: true, diasTranscurridos, interesAcumuladoBruto: parseFloat(interesBruto.toFixed(2)), penalizacionAplicada: parseFloat(penalizacion.toFixed(2)), interesNetoFinal: parseFloat(interesNetoFinal.toFixed(2)), retencionAplicada: parseFloat(retencion.toFixed(2)), totalDevuelto: parseFloat((capital + interesNetoFinal).toFixed(2)), message: `DPF cancelado anticipadamente.` });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[dpf-cancelar]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/dpf/:id/renovar', async (req, res) => {
  let pool;
  const { tasaID, plazosDias, usuarioID, tipoRenovacion } = req.body;
  try {
    pool = await sql.connect(sqlConfig);
    const dpfRow = await pool.request().input('id', sql.NVarChar(20), req.params.id).query(`
      SELECT d.*, t.DescripcionRango FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID WHERE d.DepositoID=@id
    `);
    if (dpfRow.recordset.length === 0) { await pool.close(); return res.status(404).json({ ok: false, error: 'DPF no encontrado.' }); }
    const dpf = dpfRow.recordset[0];
    if (!['ACTIVO','VENCIDO'].includes(dpf.Estado)) return res.status(400).json({ ok: false, error: `Solo se renuevan DPFs ACTIVOS o VENCIDOS.` });
    const interesLiq   = parseFloat(dpf.MontoCapital) * (parseFloat(dpf.TasaNominalAnual) / 100) * (dpf.PlazosDias / 365);
    const retenLiq     = interesLiq * 0.02;
    const interesNetoLiq = interesLiq - retenLiq;
    await pool.request()
      .input('id', sql.NVarChar(20), req.params.id).input('iL', sql.Decimal(15,2), interesLiq)
      .input('rA', sql.Decimal(15,2), retenLiq).input('iN', sql.Decimal(15,2), interesNetoLiq).input('uL', sql.NVarChar(50), usuarioID || 'SISTEMA')
      .query(`UPDATE dbo.DepositosPlazo SET Estado='RENOVADO',FechaLiquidacion=SYSDATETIME(),InteresLiquidado=@iL,RetencionAplicada=@rA,InteresNetoLiquidado=@iN,UsuarioLiquidacionID=@uL,FechaModificacion=SYSDATETIME() WHERE DepositoID=@id`);
    const asRen = [
      { cuenta: dpf.CuentaContableDPF, nombre: `Depósitos a Plazo (${dpf.DescripcionRango})`, debe: parseFloat(dpf.MontoCapital), haber: 0 },
      { cuenta: '4.1.03.05',           nombre: 'Intereses Causados DPF — Renovación',          debe: interesLiq,                  haber: 0 },
      { cuenta: '2.1.01.05',           nombre: 'Ahorro Vista — Interés Neto Renovación',        debe: 0,                          haber: interesNetoLiq },
      { cuenta: '2.5.03.05',           nombre: 'Retención 2% Rendimientos',                     debe: 0,                          haber: retenLiq }
    ];
    for (const a of asRen) {
      await pool.request()
        .input('depositoID', sql.NVarChar(20), req.params.id).input('tipoOp', sql.NVarChar(30), 'RENOVACION')
        .input('cuenta', sql.NVarChar(15), a.cuenta).input('nombre', sql.NVarChar(120), a.nombre)
        .input('debe', sql.Decimal(15,2), a.debe).input('haber', sql.Decimal(15,2), a.haber)
        .input('concepto', sql.NVarChar(300), `RENOVACIÓN DPF ${req.params.id}`)
        .input('usuarioID', sql.NVarChar(50), usuarioID || 'SISTEMA')
        .query(`INSERT INTO dbo.AsientosContablesDPF (DepositoID,TipoOperacion,CuentaContable,NombreCuenta,DebeAmount,HaberAmount,Concepto,UsuarioID) VALUES(@depositoID,@tipoOp,@cuenta,@nombre,@debe,@haber,@concepto,@usuarioID)`);
    }
    const nuevaTasaID  = tasaID || dpf.TasaID;
    const nuevoPlazo   = parseInt(plazosDias) || dpf.PlazosDias;
    const ntRow = await pool.request().input('tid', sql.Int, nuevaTasaID).query('SELECT * FROM dbo.TasasPlazoFijo WHERE TasaID=@tid AND Activo=1');
    if (ntRow.recordset.length === 0) { await pool.close(); return res.status(400).json({ ok: false, error: 'Tramo de tasa para renovación no válido.' }); }
    const nt = ntRow.recordset[0];
    const nTNA = parseFloat(nt.TasaNominalAnual);
    const nInt = parseFloat(dpf.MontoCapital) * (nTNA / 100) * (nuevoPlazo / 365);
    const nRet = nInt * 0.02;
    const nFechaVenc = new Date(); nFechaVenc.setDate(nFechaVenc.getDate() + nuevoPlazo);
    const nuevoIDResult = await pool.request().output('NuevoID', sql.NVarChar(20)).execute('dbo.usp_GenerarIDDepositoPlazo');
    const nuevoDepositoID = nuevoIDResult.output.NuevoID;
    await pool.request()
      .input('dID', sql.NVarChar(20), nuevoDepositoID).input('sID', sql.BigInt, dpf.SOCIOID)
      .input('idf', sql.NVarChar(20), dpf.Identificacion).input('nom', sql.NVarChar(200), dpf.NombreSocio)
      .input('tID', sql.Int, nuevaTasaID).input('tna', sql.Decimal(5,2), nTNA)
      .input('pdias', sql.Int, nuevoPlazo).input('cap', sql.Decimal(15,2), parseFloat(dpf.MontoCapital))
      .input('ip', sql.Decimal(15,2), nInt).input('rp', sql.Decimal(15,2), nRet).input('inp', sql.Decimal(15,2), nInt - nRet)
      .input('fv', sql.DateTime2, nFechaVenc).input('tr', sql.NVarChar(20), tipoRenovacion || 'NO_RENOVAR')
      .input('ca', sql.NVarChar(20), dpf.CuentaAhorrosRelacionada).input('cc', sql.NVarChar(10), nt.CuentaContableDPF)
      .input('nr', sql.Int, (dpf.NumeroRenovacion || 0) + 1).input('dOrig', sql.NVarChar(20), req.params.id)
      .input('uAp', sql.NVarChar(50), usuarioID || 'SISTEMA')
      .query(`INSERT INTO dbo.DepositosPlazo (DepositoID,SOCIOID,Identificacion,NombreSocio,NumCertificado,TasaID,TasaNominalAnual,PlazosDias,MontoCapital,InteresProyectado,RetencionProyectada,InteresNetoProyectado,FechaVencimiento,TipoRenovacion,ModalidadPago,CuentaAhorrosRelacionada,CuentaContableDPF,NumeroRenovacion,DepositoOrigenID,UsuarioAperturaID) VALUES(@dID,@sID,@idf,@nom,@dID,@tID,@tna,@pdias,@cap,@ip,@rp,@inp,@fv,@tr,'AL_VENCIMIENTO',@ca,@cc,@nr,@dOrig,@uAp)`);
    await pool.close();
    return res.json({ ok: true, depositoIDAnterior: req.params.id, nuevoDepositoID, interesLiquidadoAnterior: parseFloat(interesNetoLiq.toFixed(2)), nuevoInteresProyectado: parseFloat((nInt - nRet).toFixed(2)), nuevaFechaVencimiento: nFechaVenc.toISOString().split('T')[0], message: `DPF renovado. Nuevo certificado: ${nuevoDepositoID}` });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[dpf-renovar]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/transferir ───────────────────────────────────────────────
app.post('/api/socios/transferir', async (req, res) => {
  const { cuentaOrigenId, cuentaDestinoId, monto, descripcion, usuarioId } = req.body || {};

  if (!cuentaOrigenId || !cuentaDestinoId || !monto || parseFloat(monto) <= 0) {
    return res.status(400).json({ ok: false, error: 'Datos de transferencia inválidos' });
  }
  if (String(cuentaOrigenId) === String(cuentaDestinoId)) {
    return res.status(400).json({ ok: false, error: 'La cuenta origen y destino no pueden ser la misma' });
  }

  const numMonto = parseFloat(monto);
  const concepto = descripcion?.trim() || 'TRANSFERENCIA ENTRE SOCIOS';

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // 1. Obtener cuenta origen
      const origenResult = await new sql.Request(transaction)
        .input('cuentaId', sql.NVarChar(50), String(cuentaOrigenId).replace('ca-', ''))
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, c.Estado, p.PermiteTransferencias
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.CuentaId = @cuentaId OR c.NumeroCuenta = @cuentaId
        `);
      if (origenResult.recordset.length === 0) throw new Error('Cuenta origen no encontrada');

      const origen = origenResult.recordset[0];
      if (origen.Estado !== 'ACTIVA') throw new Error('La cuenta origen no está activa');
      if (!origen.PermiteTransferencias) throw new Error('La cuenta origen no tiene habilitadas las transferencias');
      if (parseFloat(origen.Saldo) < numMonto) throw new Error('Saldo insuficiente en cuenta origen');

      // 2. Obtener cuenta destino
      const destinoResult = await new sql.Request(transaction)
        .input('cuentaId', sql.NVarChar(50), String(cuentaDestinoId).replace('ca-', ''))
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, c.Estado, p.PermiteTransferencias
          FROM dbo.CuentasAhorro c
          INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
          WHERE c.CuentaId = @cuentaId OR c.NumeroCuenta = @cuentaId
        `);
      if (destinoResult.recordset.length === 0) throw new Error('Cuenta destino no encontrada');

      const destino = destinoResult.recordset[0];
      if (destino.Estado !== 'ACTIVA') throw new Error('La cuenta destino no está activa');

      // 3. Débito cuenta origen
      await new sql.Request(transaction)
        .input('cuentaId', sql.Int, origen.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), parseFloat(origen.Saldo) - numMonto)
        .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      // 4. Crédito cuenta destino
      await new sql.Request(transaction)
        .input('cuentaId', sql.Int, destino.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), parseFloat(destino.Saldo) + numMonto)
        .query('UPDATE dbo.CuentasAhorro SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      // 5. Asientos contables (partida doble) — cuenta 210101 = Depósitos a la Vista
      const asientoOrigen = await new sql.Request(transaction)
        .input('socioId', sql.BigInt, origen.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '210101')
        .input('concepto', sql.NVarChar(200), `DÉBITO TRANSFERENCIA: ${concepto}`)
        .input('debe', sql.Decimal(18, 2), numMonto)
        .input('haber', sql.Decimal(18, 2), 0)
        .input('numeroCuenta', sql.NVarChar(20), origen.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(20), usuarioId || 'SISTEMA')
        .query(`
          INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId)
          OUTPUT INSERTED.AsientoId
          VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)
        `);

      await new sql.Request(transaction)
        .input('socioId', sql.BigInt, destino.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '210101')
        .input('concepto', sql.NVarChar(200), `CRÉDITO TRANSFERENCIA: ${concepto}`)
        .input('debe', sql.Decimal(18, 2), 0)
        .input('haber', sql.Decimal(18, 2), numMonto)
        .input('numeroCuenta', sql.NVarChar(20), destino.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(20), usuarioId || 'SISTEMA')
        .query(`
          INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId)
          VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)
        `);

      await transaction.commit();

      return res.json({
        ok: true,
        asientoId: asientoOrigen.recordset[0]?.AsientoID,
        monto: numMonto,
        origenNumeroCuenta: origen.NumeroCuenta,
        destinoNumeroCuenta: destino.NumeroCuenta,
        nuevoSaldoOrigen: parseFloat(origen.Saldo) - numMonto,
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.error('[transferir]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ── GET /api/contabilidad/libro-diario ────────────────────────────────────────
app.get('/api/contabilidad/libro-diario', async (req, res) => {
  const limite = Math.min(parseInt(req.query.limite || '100', 10), 500);
  const desde  = req.query.desde || null;
  const hasta  = req.query.hasta || null;

  try {
    const pool = await sql.connect(sqlConfig);
    let query = `
      SELECT TOP (@limite) rc.AsientoId, rc.SocioId, rc.CuentaContable, rc.Concepto,
        rc.Debe, rc.Haber, rc.NumeroCuenta, rc.UsuarioId,
        CONVERT(NVARCHAR(19), rc.Fecha, 120) AS FechaAsiento,
        ISNULL(rs.PrimerNombre + ' ' + rs.PrimerApellido, 'Sistema') AS NombreSocio
      FROM dbo.RegistroContable rc
      LEFT JOIN dbo.RegistroSocios rs ON rc.SocioId = rs.SocioId
      WHERE 1=1
    `;
    const request = pool.request().input('limite', sql.Int, limite);
    if (desde) { query += ' AND rc.Fecha >= @desde'; request.input('desde', sql.DateTime, new Date(desde)); }
    if (hasta) { query += ' AND rc.Fecha <= @hasta'; request.input('hasta', sql.DateTime, new Date(hasta)); }
    query += ' ORDER BY rc.AsientoId DESC';

    const result = await request.query(query);
    return res.json({ ok: true, asientos: result.recordset });
  } catch (err) {
    console.error('[libro-diario]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/contabilidad/balance-comprobacion ────────────────────────────────
app.get('/api/contabilidad/balance-comprobacion', async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
      SELECT CuentaContable,
        SUM(Debe)  AS TotalDebe,
        SUM(Haber) AS TotalHaber,
        SUM(Debe) - SUM(Haber) AS Saldo,
        COUNT(*)   AS NumAsientos
      FROM dbo.RegistroContable
      GROUP BY CuentaContable
      ORDER BY CuentaContable
    `);
    const totalDebe  = result.recordset.reduce((s, r) => s + parseFloat(r.TotalDebe  || 0), 0);
    const totalHaber = result.recordset.reduce((s, r) => s + parseFloat(r.TotalHaber || 0), 0);
    return res.json({ ok: true, cuentas: result.recordset, totalDebe, totalHaber });
  } catch (err) {
    console.error('[balance-comprobacion]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── 8. Iniciar servidor ──────────────────────────────────────────────────
const PORT = parseInt(process.env.API_PORT || '5005', 10);
app.listen(PORT, () => {
  console.log('');
  console.log('════════════════════════════════════════════════════');
  console.log('  🏦  Gutt System - API Server');
  console.log(`  📡  http://localhost:${PORT}/api/health`);
  console.log(`  🗄️   Informix: ${process.env.INFORMIX_HOST}:${process.env.INFORMIX_PORT}/${process.env.INFORMIX_DATABASE}`);
  console.log('  🔌  Bridge: PowerShell 32-bit → IBM Informix ODBC x86');
  console.log('════════════════════════════════════════════════════');
  console.log('');
});
