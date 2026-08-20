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
import { createInterface } from 'readline';
import sql from 'mssql';
import pg from 'pg';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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

// ─── 3.5 Pool PostgreSQL → espejo legacy en Neon.tech (solo lectura) ──────
// Fuente de datos correcta de Caja Patate para búsquedas de socios/créditos que aún no
// migraron a SQL Server. Reemplaza al fallback que antes consultaba Informix EN VIVO vía
// buildConnString()/queryInformix(): ese bridge usa INFORMIX_HOST/DATABASE de este mismo
// .env, que apuntan a 192.168.1.199/afccajacrediapoyo -- la VM de pruebas de OTRA entidad
// (Crediapoyo), no Caja Patate (confirmado con GET /api/health, 2026-08-02). El espejo
// `legacy.*` en Neon (proyecto postgres-mirror) SÍ es la base correcta de Caja Patate:
// verificado con paridad de conteos y sumas de control contra Informix real (N1/N2, 0
// discrepancias abiertas en legacy.sync_discrepancia). Ver
// postgres-mirror/ALCANCE.md y postgres-mirror/SINCRONIZACION.md.
//
// Los tipos DATE de Postgres se parsean por defecto a un objeto Date de JS; se fuerza aquí
// a que lleguen como el string 'YYYY-MM-DD' tal cual (oid 1082), igual que el bridge ODBC
// de Informix ya entregaba, para no cambiar el contrato de fecha que consume el frontend.
pg.types.setTypeParser(1082, val => val);

const legacyPgPool = process.env.LEGACY_PG_HOST
  ? new pg.Pool({
      host: process.env.LEGACY_PG_HOST,
      port: parseInt(process.env.LEGACY_PG_PORT || '5432', 10),
      database: process.env.LEGACY_PG_DATABASE,
      user: process.env.LEGACY_PG_USER,
      password: process.env.LEGACY_PG_PASSWORD,
      ssl: (process.env.LEGACY_PG_SSLMODE || 'require') === 'disable' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

if (!legacyPgPool) {
  console.error('⚠️  LEGACY_PG_HOST no está definido en api/.env: el fallback de búsqueda de socios/créditos legacy (espejo Neon) quedará deshabilitado y devolverá listas vacías.');
}

legacyPgPool?.on('error', err => {
  // Error en un cliente inactivo del pool (ej. conexión caída por idle de Neon); no debe tumbar el proceso.
  console.error('[legacy pg pool] error en cliente inactivo:', err.message);
});

function queryLegacyPg(text, params = []) {
  if (!legacyPgPool) return Promise.reject(new Error('Pool Postgres legacy no configurado (falta LEGACY_PG_HOST en api/.env)'));
  return legacyPgPool.query(text, params);
}

// ─── 4. PowerShell 32-bit bridge → Informix (proceso persistente) ────────
// El bridge antiguo (informix-bridge.ps1) abría un proceso PowerShell + una conexión
// ODBC nueva por cada consulta (costo de spawn + connect en cada llamada, ~1-2s).
// informix-bridge-daemon.ps1 se lanza UNA vez, mantiene la conexión ODBC abierta y
// atiende consultas por un protocolo NDJSON (una línea de request -> una línea de
// response) sobre stdin/stdout. queryInformix() ya no genera un proceso por llamada.
const PS32            = 'C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
const PS_BRIDGE_DAEMON = join(__dirname, 'api', 'informix-bridge-daemon.ps1');
const INFORMIX_QUERY_TIMEOUT_MS = 25000;

let informixDaemon  = null;
let informixReqId   = 0;
const informixPending = new Map(); // id -> { resolve, reject, timer }

function rejectAllInformixPending(err) {
  for (const pending of informixPending.values()) {
    clearTimeout(pending.timer);
    pending.reject(err);
  }
  informixPending.clear();
}

function startInformixDaemon() {
  const proc = spawn(PS32, [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', PS_BRIDGE_DAEMON,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  createInterface({ input: proc.stdout }).on('line', line => {
    line = line.trim();
    if (!line) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    const pending = informixPending.get(msg.id);
    if (!pending) return;
    informixPending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.ok) {
      const rows = msg.rows;
      // PowerShell colapsa arrays de un solo elemento a un objeto plano al pasar por ConvertTo-Json
      pending.resolve(rows == null ? [] : (Array.isArray(rows) ? rows : [rows]));
    } else {
      pending.reject(new Error(msg.error || 'Error desconocido en bridge Informix'));
    }
  });

  let stderrBuf = '';
  proc.stderr.on('data', d => { stderrBuf += d.toString('utf8'); });

  proc.on('exit', code => {
    console.error(`[informix bridge] proceso terminado (code ${code}), se reiniciará en la próxima consulta.${stderrBuf ? ' stderr: ' + stderrBuf.replace(/\s+/g, ' ').trim().substring(0, 300) : ''}`);
    rejectAllInformixPending(new Error('Bridge Informix se cerró inesperadamente'));
    if (informixDaemon === proc) informixDaemon = null;
  });

  proc.stdin.write(buildConnString() + '\n', 'utf8');
  informixDaemon = proc;
  return proc;
}

function queryInformix(sql, params = []) {
  if (!informixDaemon) startInformixDaemon();

  return new Promise((resolve, reject) => {
    const id = ++informixReqId;
    const timer = setTimeout(() => {
      informixPending.delete(id);
      reject(new Error('Informix query timeout (25s)'));
    }, INFORMIX_QUERY_TIMEOUT_MS);

    informixPending.set(id, { resolve, reject, timer });

    try {
      informixDaemon.stdin.write(JSON.stringify({ id, sql, params }) + '\n', 'utf8');
    } catch (err) {
      informixPending.delete(id);
      clearTimeout(timer);
      reject(err);
    }
  });
}

process.on('exit', () => {
  if (informixDaemon) informixDaemon.kill();
});

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

// ─── 4.6 Autenticación (JWT) ──────────────────────────────────────────────
// Antes ningún endpoint verificaba que el usuarioId/actorId/tellerId enviado en el body
// realmente correspondía a quien había iniciado sesión (no había sesión/token en absoluto):
// cualquiera podía llamar la API directamente afirmando ser cualquier usuario. `requireAuth`
// exige un JWT válido (emitido por /api/auth/login.php); `requireSelf` rechaza la petición si
// el usuario que el body dice ser no coincide con el usuario autenticado en el token.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Falta JWT_SECRET en api/.env. Defínelo (ej. con `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`) antes de iniciar el servidor.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '10h'; // duración típica de un turno de trabajo

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return res.status(401).json({ ok: false, error: 'No autenticado: falta token de sesión' });
  try {
    req.actor = jwt.verify(token, JWT_SECRET); // { usuarioId, rol, iat, exp }
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada, inicie sesión nuevamente' });
  }
}

function requireSelf(bodyField) {
  return (req, res, next) => {
    const claimed = ((req.body || {})[bodyField] || '').toString().trim().toLowerCase();
    if (claimed && claimed !== req.actor.usuarioId.toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'El usuario autenticado no coincide con el usuario declarado en la petición' });
    }
    next();
  };
}

// Restringe un endpoint a usuarios con Rol ADMIN o SUPER_USER (gestión de usuarios del sistema,
// asignación de permisos por módulo). Debe usarse siempre después de requireAuth.
function requireAdmin(req, res, next) {
  const rol = ((req.actor || {}).rol || '').toUpperCase();
  if (rol !== 'ADMIN' && rol !== 'SUPER_USER') {
    return res.status(403).json({ ok: false, error: 'Esta acción requiere rol de administrador' });
  }
  next();
}

// ─── 4.5 Auditoría estructurada por proceso (dbo.AuditoriaProcesos, ver db/sqlserver/23_auditoria_procesos.sql) ──
// Complementa (no reemplaza) dbo.AuditoriaUsuarios: captura entidad/campo/valor anterior-nuevo por
// proceso de negocio (CREDITOS, CAJA, AHORROS, PLAZO_FIJO, CONTABILIDAD, SOCIOS, SEGURIDAD, REPORTES_SEPS).
// `execTarget` es una sql.Transaction o el pool: se pasa a `new sql.Request(execTarget)` igual que el
// resto de inserts del endpoint, para que la auditoría viva en la misma transacción atómica.
async function registrarAuditoriaProceso(execTarget, {
  proceso, accion, entidadTipo, entidadId = null, usuarioId,
  campoAfectado = null, valorAnterior = null, valorNuevo = null, detalle = null, ip = null,
}) {
  const request = new sql.Request(execTarget);
  await request
    .input('Proceso', sql.NVarChar(50), proceso)
    .input('Accion', sql.NVarChar(50), accion)
    .input('EntidadTipo', sql.NVarChar(50), entidadTipo)
    .input('EntidadId', sql.NVarChar(50), entidadId !== null ? String(entidadId) : null)
    .input('UsuarioId', sql.NVarChar(20), usuarioId || 'sistema')
    .input('CampoAfectado', sql.NVarChar(100), campoAfectado)
    .input('ValorAnterior', sql.NVarChar(sql.MAX), valorAnterior !== null ? String(valorAnterior) : null)
    .input('ValorNuevo', sql.NVarChar(sql.MAX), valorNuevo !== null ? String(valorNuevo) : null)
    .input('Detalle', sql.NVarChar(500), detalle)
    .input('IPOrigen', sql.NVarChar(45), ip)
    .query(`
      INSERT INTO dbo.AuditoriaProcesos (Proceso, Accion, EntidadTipo, EntidadId, UsuarioId, CampoAfectado, ValorAnterior, ValorNuevo, Detalle, IPOrigen)
      VALUES (@Proceso, @Accion, @EntidadTipo, @EntidadId, @UsuarioId, @CampoAfectado, @ValorAnterior, @ValorNuevo, @Detalle, @IPOrigen)
    `);
}

// ─── 5.5 Búsqueda en el espejo Postgres legacy (legacy.bcaclie) de clientes que no ──
// existen aún en SQL Server. Antes esto era buscarClienteInformix(), en vivo contra la VM
// equivocada (ver nota en la sección 3.5). Mismo criterio de búsqueda y mismo contrato de
// salida que la versión anterior (mismas claves del objeto que consume el frontend).
//
// Decisión de diseño: NO se seleccionan ni descifran clie_hue_dact/clie_ban_peps/
// clie_cod_disc (las 3 columnas cifradas con pgcrypto). No es una omisión silenciosa: el
// SELECT original contra Informix tampoco las incluía y el objeto que este fallback arma
// para el frontend nunca tuvo esas 3 claves -- a diferencia del socio que sí viene de SQL
// Server (dbo.RegistroSocios), que expone `discapacidad`/`peps` como columnas propias del
// registro nuevo. Ampliar el contrato de este fallback para incluirlas sería un cambio de
// alcance no pedido; si se necesita en el futuro, descifrar con
// pgp_sym_decrypt(columna, $N) usando LEGACY_PG_ENCRYPTION_KEY (mismo valor que
// db.legacy.encryption.key en postgres-mirror/config).
async function buscarClienteLegacyPg(q) {
  if (!q || !legacyPgPool) return [];
  try {
    const { rows } = await queryLegacyPg(
      `SELECT
         clie_cod_clie,
         TRIM(clie_cod_tide) AS clie_cod_tide,
         TRIM(clie_ide_clie) AS clie_ide_clie,
         TRIM(clie_ape_clie) AS clie_ape_clie,
         TRIM(clie_nom_clie) AS clie_nom_clie,
         clie_fec_nac,
         TRIM(clie_dir_domi) AS clie_dir_domi,
         TRIM(clie_ema_clie) AS clie_ema_clie,
         clie_est_clie
       FROM legacy.bcaclie
       WHERE TRIM(clie_ide_clie) = $1 OR TRIM(clie_ape_clie) ILIKE $2 OR TRIM(clie_nom_clie) ILIKE $2`,
      [q, `%${q}%`]
    );
    return rows.map(r => ({
      id: r.clie_ide_clie,
      socioId: null,
      name: `${r.clie_nom_clie || ''} ${r.clie_ape_clie || ''}`.trim(),
      firstName: r.clie_nom_clie || '',
      middleName: '',
      firstLastName: r.clie_ape_clie || '',
      secondLastName: '',
      pin: null,
      role: 'MEMBER',
      email: r.clie_ema_clie || '',
      phone: '',
      address: r.clie_dir_domi || '',
      birthDate: r.clie_fec_nac || '',
      memberNumber: r.clie_cod_clie,
      personType: r.clie_cod_tide,
      origen: 'LEGACY_PG',
      accounts: [],
      transactions: [],
      loans: []
    }));
  } catch (err) {
    console.error('[buscar cliente legacy pg]', err.message);
    return [];
  }
}

// ─── 5.6 Búsqueda en el espejo Postgres legacy (legacy.bcacred) de créditos que el socio ──
// no tiene aún migrados a SQL Server. Antes era buscarCreditosInformix(), mismo origen del
// bug que la 5.5.
//
// Gap conocido y documentado (no inventado): el alcance del espejo `postgres-mirror` son
// 10 tablas (ver ALCANCE.md) y NO incluye `bcatcre` (catálogo de tipo de crédito), que el
// query original usaba en un LEFT JOIN solo para obtener `tipo_desc` (texto legible del
// tipo). Se omite ese JOIN aquí; `type` cae directo en el mismo fallback por código numérico
// (`cred_cod_tcre` 0=INDIVIDUAL/1=SOLIDARIO) que el código original ya traía para cuando
// `tipo_desc` venía null -- no se pierde información nueva, solo dejamos de tener el texto
// descriptivo del catálogo en los casos con otros códigos.
async function buscarCreditosLegacyPg(cedulaOTitular) {
  if (!cedulaOTitular || !legacyPgPool) return [];
  try {
    const { rows } = await queryLegacyPg(
      `SELECT
         cred_num_cred,
         cred_cod_clie,
         TRIM(cred_ide_titu) AS cred_ide_titu,
         TRIM(cred_nom_titu) AS cred_nom_titu,
         cred_cap_cred,
         cred_tas_cred,
         cred_fec_inic,
         cred_fec_venc,
         cred_num_cuot,
         cred_cod_ecre,
         cred_cod_tcre,
         cred_por_mora,
         cred_con_mora
       FROM legacy.bcacred
       WHERE TRIM(cred_ide_titu) = $1 OR TRIM(cred_nom_titu) ILIKE $2`,
      [cedulaOTitular, `%${cedulaOTitular}%`]
    );
    return rows.map(r => ({
      id: r.cred_num_cred,
      memberId: r.cred_ide_titu,
      amount: r.cred_cap_cred !== null ? parseFloat(r.cred_cap_cred) : null,
      balance: null, // el espejo legacy no expone saldo vigente en bcacred, solo capital original (igual que Informix)
      rate: r.cred_tas_cred !== null ? parseFloat(r.cred_tas_cred) : null,
      installmentsCount: r.cred_num_cuot !== null ? parseInt(r.cred_num_cuot, 10) : null,
      type: r.cred_cod_tcre === 0 ? 'INDIVIDUAL' : r.cred_cod_tcre === 1 ? 'SOLIDARIO' : null,
      status: r.cred_cod_ecre, // catálogo no confirmado, se expone el código crudo (igual que antes)
      FechaSolicitud: r.cred_fec_inic || '',
      dueDate: r.cred_fec_venc || '',
      comments: '',
      installments: [], // no hay plan de cuotas detallado disponible en el espejo legacy
      planDisponible: false,
      moraPorc: r.cred_por_mora !== null ? parseFloat(r.cred_por_mora) : null,
      moraDias: r.cred_con_mora !== null ? parseInt(r.cred_con_mora, 10) : null,
      origen: 'LEGACY_PG'
    }));
  } catch (err) {
    console.error('[buscar creditos legacy pg]', err.message);
    return [];
  }
}

// ─── 5.7 Búsqueda en el espejo Postgres legacy (legacy.bcadpfi) de depósitos a plazo fijo ──
// que aún no existen en SQL Server. Antes era buscarDPFInformix(), en vivo contra la VM
// equivocada (mismo bug que 5.5/5.6, ver nota en la sección 3.5). Espejo cargado en
// postgres-mirror/migraciones/005_legacy_plazo_fijo.up.sql (2026-08-02): bcadpfi (99 filas)
// + su catálogo bcaedpf (8 filas), N1/N2 verificados contra Informix (804.704,87 = 804.704,87).
//
// Mejora sobre el original: el catálogo bcaedpf ahora está espejado completo (8 estados), así
// que el Estado sale de un JOIN real en vez del mapa parcial hardcodeado que el bridge ODBC
// traía (DPF_ESTADOS_INFORMIX solo cubría 1/2/3 de los 8 códigos reales del catálogo). Mismo
// fallback `LEGACY_${codigo}` si el código no tiene descripción (no debería pasar: 0 huérfanos
// dpfi_cod_edpf -> bcaedpf verificado, pero se mantiene por seguridad ante datos futuros).
async function buscarDPFLegacyPg(cedulaOTitular) {
  if (!cedulaOTitular || !legacyPgPool) return [];
  try {
    const { rows } = await queryLegacyPg(
      `SELECT
         d.dpfi_num_dpfi,
         d.dpfi_cod_clie,
         TRIM(cl.clie_ide_clie) AS ced,
         TRIM(cl.clie_nom_clie) AS nom,
         TRIM(cl.clie_ape_clie) AS ape,
         d.dpfi_val_dpfi,
         d.dpfi_tas_dpfi,
         d.dpfi_plz_dpfi,
         d.dpfi_fec_inic,
         d.dpfi_fec_deve,
         d.dpfi_cod_edpf,
         TRIM(e.edpf_des_edpf) AS estado_desc,
         TRIM(d.dpfi_nom_bene) AS bene,
         TRIM(d.dpfi_det_dpfi) AS det
       FROM legacy.bcadpfi d
       LEFT JOIN legacy.bcaclie cl ON d.dpfi_cod_clie = cl.clie_cod_clie
       LEFT JOIN legacy.bcaedpf e ON e.edpf_cod_edpf = d.dpfi_cod_edpf
       WHERE TRIM(cl.clie_ide_clie) = $1 OR TRIM(cl.clie_nom_clie) ILIKE $2 OR TRIM(cl.clie_ape_clie) ILIKE $2`,
      [cedulaOTitular, `%${cedulaOTitular}%`]
    );
    return rows.map(r => ({
      DepositoID: r.dpfi_num_dpfi,
      Identificacion: r.ced || '',
      NombreSocio: `${r.nom || ''} ${r.ape || ''}`.trim(),
      MontoCapital: r.dpfi_val_dpfi !== null ? parseFloat(r.dpfi_val_dpfi) : null,
      TasaNominalAnual: r.dpfi_tas_dpfi !== null ? parseFloat(r.dpfi_tas_dpfi) : null,
      PlazosDias: r.dpfi_plz_dpfi !== null ? parseInt(r.dpfi_plz_dpfi, 10) : null,
      Estado: r.estado_desc || `LEGACY_${r.dpfi_cod_edpf}`,
      FechaApertura: r.dpfi_fec_inic || '',
      FechaVencimiento: r.dpfi_fec_deve || '',
      beneficiario: r.bene || '',
      detalle: r.det || '',
      origen: 'LEGACY_PG'
    }));
  } catch (err) {
    console.error('[buscar dpf legacy pg]', err.message);
    return [];
  }
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

// ─── 6.6 Enviar Correo de Recuperación de Contraseña ────────────────────────
// Toda solicitud de "olvidé mi contraseña" (sea cual sea el usuario del sistema que la pide)
// se envía a una única casilla de autorización -- no al correo del propio usuario -- porque
// hoy no hay un flujo de verificación de identidad por usuario. El administrador de esa casilla
// abre el enlace y define la nueva contraseña.
const PASSWORD_RECOVERY_EMAIL = process.env.PASSWORD_RECOVERY_EMAIL || 'vladitituana20@gmail.com';
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || 'https://cony-desarrollo.tail0441f8.ts.net').replace(/\/$/, '');

async function sendPasswordResetEmail(usuarioId, nombre, token) {
  const resetLink = `${PUBLIC_APP_URL}/?resetToken=${encodeURIComponent(token)}`;

  console.log('================================================================');
  console.log(`🔑 [SOLICITUD DE RECUPERACIÓN DE CONTRASEÑA]`);
  console.log(`Usuario: ${usuarioId} (${nombre})`);
  console.log(`Autorizar en: ${resetLink}`);
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
        to: PASSWORD_RECOVERY_EMAIL,
        subject: `Solicitud de recuperación de contraseña - Usuario ${usuarioId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #14532D; text-align: center;">GUTT SYSTEM</h2>
            <p>Se solicitó restablecer la contraseña del usuario:</p>
            <div style="background-color: #ecfdf5; border: 1px solid #d1fae5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Usuario:</strong> ${usuarioId}</p>
              <p style="margin: 0;"><strong>Nombre:</strong> ${nombre}</p>
            </div>
            <p>Para autorizar y definir la nueva contraseña, ingrese al siguiente enlace (válido por 1 hora):</p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${resetLink}" style="background-color: #14532D; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: bold;">Restablecer Contraseña</a>
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
              Si usted no solicitó este cambio, ignore este mensaje. Este es un correo automático, por favor no responda.
            </p>
          </div>
        `
      });
      console.log(`✅ Correo de recuperación enviado a ${PASSWORD_RECOVERY_EMAIL}`);
    } catch (err) {
      console.error(`❌ Error al enviar correo de recuperación:`, err.message);
    }
  } else {
    console.log(`ℹ️ SMTP no configurado. El enlace de recuperación se simuló en consola (ver arriba).`);
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
      .query('SELECT UsuarioId, NombreCompleto, Pin, PasswordHash, Rol, Activo, ImpresoraPredeterminada, RequiereCambioPin, PermisosModulos FROM dbo.Usuarios WHERE UsuarioId = @id');

    if (result.recordset.length === 0) {
      await registrarAuditoriaProceso(pool, {
        proceso: 'SEGURIDAD', accion: 'LOGIN_FALLIDO', entidadTipo: 'Usuario',
        entidadId: cleanId, usuarioId: cleanId,
        detalle: 'Intento de login con usuario inexistente.',
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      });
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    const user = result.recordset[0];
    if (!user.Activo) {
      await registrarAuditoriaProceso(pool, {
        proceso: 'SEGURIDAD', accion: 'LOGIN_FALLIDO', entidadTipo: 'Usuario',
        entidadId: user.UsuarioId, usuarioId: user.UsuarioId,
        detalle: 'Intento de login en usuario inactivo.',
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      });
      return res.status(401).json({ ok: false, error: 'Usuario inactivo' });
    }

    // Verificar contraseña. PasswordHash puede estar en dos formatos:
    //  - hash bcrypt (arranca con "$2"): comparación segura con bcrypt.compare.
    //  - texto plano legado (contraseñas nunca migradas): comparación directa, y si coincide
    //    se re-hashea de inmediato con bcrypt (migración perezosa, sin forzar reset a nadie).
    const storedPassword = user.PasswordHash || user.Pin;
    const isBcryptHash = typeof storedPassword === 'string' && storedPassword.startsWith('$2');
    const passwordMatches = isBcryptHash
      ? bcrypt.compareSync(cleanPin, storedPassword)
      : storedPassword === cleanPin;

    if (!passwordMatches) {
      await registrarAuditoriaProceso(pool, {
        proceso: 'SEGURIDAD', accion: 'LOGIN_FALLIDO', entidadTipo: 'Usuario',
        entidadId: user.UsuarioId, usuarioId: user.UsuarioId,
        detalle: 'Intento de login con contraseña incorrecta.',
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      });
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    if (!isBcryptHash) {
      const newHash = bcrypt.hashSync(cleanPin, 10);
      await pool.request()
        .input('id', sql.NVarChar(20), user.UsuarioId)
        .input('hash', sql.NVarChar(100), newHash)
        .query('UPDATE dbo.Usuarios SET PasswordHash = @hash WHERE UsuarioId = @id');
    }

    await registrarAuditoriaProceso(pool, {
      proceso: 'SEGURIDAD',
      accion: 'LOGIN_EXITOSO',
      entidadTipo: 'Usuario',
      entidadId: user.UsuarioId,
      usuarioId: user.UsuarioId,
      detalle: `Login exitoso. Rol: ${user.Rol}.`,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
    });

    const token = jwt.sign({ usuarioId: user.UsuarioId, rol: user.Rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({
      id:            user.UsuarioId,
      name:          user.NombreCompleto,
      role:          user.Rol,
      token,
      impresora:     user.ImpresoraPredeterminada || '',
      accounts:      [],
      transactions:  [],
      loans:         [],
      needsPinChange: user.RequiereCambioPin === 1 || user.RequiereCambioPin === true,
      permisosModulos: user.PermisosModulos ? JSON.parse(user.PermisosModulos) : null,
    });
  } catch (err) {
    console.error('[login]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/auth/update_password ──────────────────────────────────────────
app.post('/api/auth/update_password', requireAuth, requireSelf('id'), async (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ ok: false, error: 'id y contraseña son requeridos' });
  try {
    const pool = await sql.connect(sqlConfig);
    await pool.request()
      .input('id', sql.NVarChar(20), id.trim().toLowerCase())
      .input('password', sql.NVarChar(100), bcrypt.hashSync(password.trim(), 10))
      .query('UPDATE dbo.Usuarios SET PasswordHash = @password, RequiereCambioPin = 0, FechaActualizacion = SYSDATETIME() WHERE UsuarioId = @id');
    
    // Inserción en tabla de auditoría
    await pool.request()
      .input('UsuarioId', sql.NVarChar(20), id.trim().toLowerCase())
      .input('Concepto', sql.NVarChar(100), 'Actualización de Contraseña')
      .input('Detalle', sql.NVarChar(500), 'El usuario actualizó su contraseña de acceso.')
      .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@UsuarioId, @Concepto, @Detalle)');

    await registrarAuditoriaProceso(pool, {
      proceso: 'SEGURIDAD',
      accion: 'CAMBIO_PASSWORD',
      entidadTipo: 'Usuario',
      entidadId: id.trim().toLowerCase(),
      usuarioId: id.trim().toLowerCase(),
      detalle: 'El usuario actualizó su contraseña de acceso.',
    });

    return res.json({ ok: true, message: 'Contraseña actualizada con éxito y registrada en auditoría' });
  } catch (err) {
    console.error('[update_password]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────
// Público (sin login: quien lo pide todavía no puede entrar). Genera un token de un solo uso
// y lo envía por correo a PASSWORD_RECOVERY_EMAIL para que un administrador lo autorice.
// Responde ok:true siempre exista o no el usuario, para no filtrar qué usuarios existen.
app.post('/api/auth/forgot-password', async (req, res) => {
  const usuarioId = ((req.body || {}).usuarioId || '').toString().trim().toLowerCase();
  if (!usuarioId) return res.status(400).json({ ok: false, error: 'usuarioId es requerido' });

  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('id', sql.NVarChar(20), usuarioId)
      .query('SELECT UsuarioId, NombreCompleto, Activo FROM dbo.Usuarios WHERE UsuarioId = @id');

    if (result.recordset.length > 0 && result.recordset[0].Activo) {
      const user = result.recordset[0];
      const token = crypto.randomBytes(32).toString('hex');
      const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await pool.request()
        .input('id', sql.NVarChar(20), user.UsuarioId)
        .input('token', sql.NVarChar(200), token)
        .input('expira', sql.DateTime2, expira)
        .query('UPDATE dbo.Usuarios SET ResetToken = @token, ResetTokenExpira = @expira WHERE UsuarioId = @id');

      await registrarAuditoriaProceso(pool, {
        proceso: 'SEGURIDAD', accion: 'SOLICITUD_RECUPERACION_PASSWORD', entidadTipo: 'Usuario',
        entidadId: user.UsuarioId, usuarioId: user.UsuarioId,
        detalle: 'Se solicitó recuperación de contraseña por correo.',
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      });

      await sendPasswordResetEmail(user.UsuarioId, user.NombreCompleto, token);
    }

    return res.json({ ok: true, message: 'Si el usuario existe, se envió una solicitud de autorización.' });
  } catch (err) {
    console.error('[forgot-password]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────
// Público: quien tiene el enlace del correo (el autorizador) define la nueva contraseña.
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ ok: false, error: 'token y newPassword son requeridos' });
  if (newPassword.trim().length < 4) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 4 caracteres' });

  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('token', sql.NVarChar(200), token)
      .query('SELECT UsuarioId, ResetTokenExpira FROM dbo.Usuarios WHERE ResetToken = @token');

    if (result.recordset.length === 0) {
      return res.status(400).json({ ok: false, error: 'Enlace de recuperación inválido' });
    }
    const user = result.recordset[0];
    if (!user.ResetTokenExpira || new Date(user.ResetTokenExpira) < new Date()) {
      return res.status(400).json({ ok: false, error: 'El enlace de recuperación expiró, solicite uno nuevo' });
    }

    await pool.request()
      .input('id', sql.NVarChar(20), user.UsuarioId)
      .input('hash', sql.NVarChar(100), bcrypt.hashSync(newPassword.trim(), 10))
      .query(`UPDATE dbo.Usuarios
              SET PasswordHash = @hash, RequiereCambioPin = 0, ResetToken = NULL, ResetTokenExpira = NULL, FechaActualizacion = SYSDATETIME()
              WHERE UsuarioId = @id`);

    await registrarAuditoriaProceso(pool, {
      proceso: 'SEGURIDAD', accion: 'PASSWORD_RESTABLECIDA', entidadTipo: 'Usuario',
      entidadId: user.UsuarioId, usuarioId: user.UsuarioId,
      detalle: 'Contraseña restablecida vía enlace de recuperación por correo.',
      ip: req.ip || req.headers['x-forwarded-for'] || null,
    });

    return res.json({ ok: true, message: 'Contraseña restablecida con éxito' });
  } catch (err) {
    console.error('[reset-password]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/admin/usuarios ────────────────────────────────────────────────
// Directorio de usuarios INTERNOS del sistema (no socios) para el submenú de administración.
app.get('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query(`
      SELECT UsuarioId, NombreCompleto, Rol, Activo, PermisosModulos, RequiereCambioPin, FechaCreacion
      FROM dbo.Usuarios ORDER BY NombreCompleto`);

    const usuarios = result.recordset.map(u => ({
      id: u.UsuarioId,
      nombre: u.NombreCompleto,
      rol: u.Rol,
      activo: !!u.Activo,
      requiereCambioPin: !!u.RequiereCambioPin,
      fechaCreacion: u.FechaCreacion,
      permisosModulos: u.PermisosModulos ? JSON.parse(u.PermisosModulos) : null, // null = todos los del rol
    }));

    return res.json({ ok: true, usuarios });
  } catch (err) {
    console.error('[admin/usuarios]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /api/admin/usuarios/:id/permisos ───────────────────────────────────
// Body: { modulos: string[] | null }. null/[] restaura el acceso completo por defecto del Rol.
app.put('/api/admin/usuarios/:id/permisos', requireAuth, requireAdmin, async (req, res) => {
  const id = (req.params.id || '').trim().toLowerCase();
  const { modulos } = req.body || {};
  if (modulos !== null && !Array.isArray(modulos)) {
    return res.status(400).json({ ok: false, error: 'modulos debe ser un arreglo de ids de módulo o null' });
  }

  try {
    const pool = await sql.connect(sqlConfig);
    const json = (modulos && modulos.length > 0) ? JSON.stringify(modulos) : null;

    const result = await pool.request()
      .input('id', sql.NVarChar(20), id)
      .input('permisos', sql.NVarChar(sql.MAX), json)
      .query('UPDATE dbo.Usuarios SET PermisosModulos = @permisos, FechaActualizacion = SYSDATETIME() WHERE UsuarioId = @id');

    if (result.rowsAffected[0] === 0) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await registrarAuditoriaProceso(pool, {
      proceso: 'SEGURIDAD', accion: 'PERMISOS_MODULOS_ACTUALIZADOS', entidadTipo: 'Usuario',
      entidadId: id, usuarioId: req.actor.usuarioId,
      detalle: `Permisos de módulo actualizados: ${json || 'ACCESO COMPLETO POR ROL'}`,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
    });

    return res.json({ ok: true, message: 'Permisos actualizados' });
  } catch (err) {
    console.error('[admin/usuarios/permisos]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/admin/usuarios/:id/reset-password ────────────────────────────
// Camino directo (sin correo): el administrador define/genera una contraseña temporal de una vez.
app.post('/api/admin/usuarios/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const id = (req.params.id || '').trim().toLowerCase();
  let { newPassword } = req.body || {};
  const generated = !newPassword;
  if (generated) newPassword = crypto.randomBytes(6).toString('hex'); // 12 chars, entregar al usuario fuera de banda

  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('id', sql.NVarChar(20), id)
      .input('hash', sql.NVarChar(100), bcrypt.hashSync(newPassword.trim(), 10))
      .query(`UPDATE dbo.Usuarios
              SET PasswordHash = @hash, RequiereCambioPin = 1, ResetToken = NULL, ResetTokenExpira = NULL, FechaActualizacion = SYSDATETIME()
              WHERE UsuarioId = @id`);

    if (result.rowsAffected[0] === 0) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await registrarAuditoriaProceso(pool, {
      proceso: 'SEGURIDAD', accion: 'PASSWORD_RESETEADA_POR_ADMIN', entidadTipo: 'Usuario',
      entidadId: id, usuarioId: req.actor.usuarioId,
      detalle: 'Contraseña reseteada directamente por un administrador.',
      ip: req.ip || req.headers['x-forwarded-for'] || null,
    });

    return res.json({ ok: true, message: 'Contraseña reseteada', temporalPassword: generated ? newPassword : undefined });
  } catch (err) {
    console.error('[admin/usuarios/reset-password]', err.message);
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
      .query('SELECT UsuarioId, NombreCompleto, Pin, PasswordHash, Rol, Activo, ImpresoraPredeterminada, RequiereCambioPin, PermisosModulos FROM dbo.Usuarios WHERE UsuarioId = @id');

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
      permisosModulos: user.PermisosModulos ? JSON.parse(user.PermisosModulos) : null,
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
      // Balance de Comprobación — desde RegistroContable real, enriquecido con el Catálogo
      // Único de Cuentas SEPS (dbo.PlanCuentas, ver db/sqlserver/26-27) para mostrar nombre y
      // tipo de cuenta reales en vez del código crudo. LEFT JOIN a propósito: una cuenta usada
      // en el libro diario que no existe en el catálogo es un hallazgo real (sinCatalogar=1),
      // no algo que deba desaparecer silenciosamente de la fila.
      const result = await pool.request().query(`
        SELECT rc.CuentaContable AS code,
               COALESCE(pc.Nombre, rc.CuentaContable) AS name,
               pc.TipoCuenta AS tipoCuenta,
               CASE WHEN pc.CuentaContableId IS NULL THEN 1 ELSE 0 END AS sinCatalogar,
               SUM(rc.Debe) AS debe, SUM(rc.Haber) AS haber,
               SUM(rc.Debe) - SUM(rc.Haber) AS balance,
               COUNT(*) AS movimientos
        FROM dbo.RegistroContable rc
        LEFT JOIN dbo.PlanCuentas pc ON pc.Codigo = rc.CuentaContable
        GROUP BY rc.CuentaContable, pc.Nombre, pc.TipoCuenta, pc.CuentaContableId
        ORDER BY rc.CuentaContable
      `);
      return res.json(result.recordset.map(r => ({
        code:    r.code,
        name:    r.name,
        tipoCuenta: r.tipoCuenta || null,
        sinCatalogar: !!r.sinCatalogar,
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
      // Estructura B11 — cartera por segmento y estado de vencimiento, con bandas de
      // antigüedad. Reemplaza el stub anterior (GROUP BY Estado sobre un string), que no
      // reproducía ningún entregable SEPS real.
      //
      // Estructura verificada contra el Catálogo Único cargado en dbo.PlanCuentas:
      //   1401/1402/1403/1404 = COMERCIAL/CONSUMO/VIVIENDA/MICROEMPRESA **POR VENCER**
      //   1411..1414          = las mismas **QUE NO DEVENGAN INTERESES**
      //   1421..1424          = las mismas **VENCIDA**
      // Ojo: las bandas de antigüedad NO son iguales en ambos estados (dato real del
      // catálogo, no asumido): "Por vencer" corta en 181-360 / >360 (1402 05..25) mientras
      // "Vencida" corta en 181-270 / >270 (1422 05..25).
      //
      // Regla contable aplicada: si una operación tiene al menos una cuota vencida, sus
      // cuotas aún no vencidas dejan de devengar interés y se reclasifican a 141x -- no se
      // quedan en "por vencer". Es el tratamiento SEPS estándar de la cartera en mora.
      const result = await pool.request().query(`
        ;WITH Cuotas AS (
          SELECT c.CreditoID, c.Tipo,
                 j.number, j.capital,
                 DATEADD(MONTH, j.number, c.FechaDesembolso) AS FechaVenceCuota
          FROM dbo.Creditos c
          JOIN dbo.SolicitudesCredito s ON s.SolicitudID = c.SolicitudID
          CROSS APPLY OPENJSON(s.PlanPagos) WITH (
            number  INT            '$.number',
            capital DECIMAL(15,2)  '$.capital',
            status  NVARCHAR(20)   '$.status'
          ) j
          WHERE c.Estado = 'VIGENTE' AND ISNULL(j.status,'') <> 'PAGADO'
        ),
        Clasificadas AS (
          SELECT CreditoID, Tipo, capital,
                 DATEDIFF(DAY, FechaVenceCuota, CAST(GETDATE() AS DATE)) AS DiasMora,
                 MAX(CASE WHEN FechaVenceCuota < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END)
                   OVER (PARTITION BY CreditoID) AS OperacionEnMora
          FROM Cuotas
        )
        SELECT
          CASE
            WHEN UPPER(Tipo) LIKE '%MICRO%'                              THEN 'MICROEMPRESA'
            WHEN UPPER(Tipo) LIKE '%VIVIENDA%' OR UPPER(Tipo) LIKE '%INMOBIL%' THEN 'VIVIENDA'
            WHEN UPPER(Tipo) LIKE '%COMERCIAL%' OR UPPER(Tipo) LIKE '%PRODUCTIVO%' THEN 'COMERCIAL'
            ELSE 'CONSUMO'
          END AS segmento,
          CASE
            WHEN DiasMora > 0            THEN 'VENCIDA'
            WHEN OperacionEnMora = 1     THEN 'NO DEVENGA INTERESES'
            ELSE 'POR VENCER'
          END AS estadoCartera,
          CASE
            WHEN DiasMora > 0 THEN
              CASE WHEN DiasMora <= 30  THEN 'De 1 a 30 días'
                   WHEN DiasMora <= 90  THEN 'De 31 a 90 días'
                   WHEN DiasMora <= 180 THEN 'De 91 a 180 días'
                   WHEN DiasMora <= 270 THEN 'De 181 a 270 días'
                   ELSE 'De más de 270 días' END
            WHEN OperacionEnMora = 1 THEN 'No devenga'
            ELSE
              CASE WHEN -DiasMora <= 30  THEN 'De 1 a 30 días'
                   WHEN -DiasMora <= 90  THEN 'De 31 a 90 días'
                   WHEN -DiasMora <= 180 THEN 'De 91 a 180 días'
                   WHEN -DiasMora <= 360 THEN 'De 181 a 360 días'
                   ELSE 'De más de 360 días' END
          END AS banda,
          COUNT(DISTINCT CreditoID) AS operaciones,
          SUM(capital) AS saldo
        FROM Clasificadas
        GROUP BY
          CASE
            WHEN UPPER(Tipo) LIKE '%MICRO%'                              THEN 'MICROEMPRESA'
            WHEN UPPER(Tipo) LIKE '%VIVIENDA%' OR UPPER(Tipo) LIKE '%INMOBIL%' THEN 'VIVIENDA'
            WHEN UPPER(Tipo) LIKE '%COMERCIAL%' OR UPPER(Tipo) LIKE '%PRODUCTIVO%' THEN 'COMERCIAL'
            ELSE 'CONSUMO'
          END,
          CASE
            WHEN DiasMora > 0            THEN 'VENCIDA'
            WHEN OperacionEnMora = 1     THEN 'NO DEVENGA INTERESES'
            ELSE 'POR VENCER'
          END,
          CASE
            WHEN DiasMora > 0 THEN
              CASE WHEN DiasMora <= 30  THEN 'De 1 a 30 días'
                   WHEN DiasMora <= 90  THEN 'De 31 a 90 días'
                   WHEN DiasMora <= 180 THEN 'De 91 a 180 días'
                   WHEN DiasMora <= 270 THEN 'De 181 a 270 días'
                   ELSE 'De más de 270 días' END
            WHEN OperacionEnMora = 1 THEN 'No devenga'
            ELSE
              CASE WHEN -DiasMora <= 30  THEN 'De 1 a 30 días'
                   WHEN -DiasMora <= 90  THEN 'De 31 a 90 días'
                   WHEN -DiasMora <= 180 THEN 'De 91 a 180 días'
                   WHEN -DiasMora <= 360 THEN 'De 181 a 360 días'
                   ELSE 'De más de 360 días' END
          END
        ORDER BY segmento, estadoCartera, banda
      `);

      // Código de cuenta SEPS por segmento y estado (mismo mapeo del Catálogo Único).
      const CUENTA_SEPS = {
        'COMERCIAL':    { 'POR VENCER': '1401', 'NO DEVENGA INTERESES': '1411', 'VENCIDA': '1421' },
        'CONSUMO':      { 'POR VENCER': '1402', 'NO DEVENGA INTERESES': '1412', 'VENCIDA': '1422' },
        'VIVIENDA':     { 'POR VENCER': '1403', 'NO DEVENGA INTERESES': '1413', 'VENCIDA': '1423' },
        'MICROEMPRESA': { 'POR VENCER': '1404', 'NO DEVENGA INTERESES': '1414', 'VENCIDA': '1424' },
      };

      const filas = result.recordset.map(r => ({
        segmento: r.segmento,
        estadoCartera: r.estadoCartera,
        banda: r.banda,
        cuentaSeps: (CUENTA_SEPS[r.segmento] || {})[r.estadoCartera] || null,
        operaciones: r.operaciones,
        saldo: parseFloat(r.saldo || 0),
      }));

      const carteraBruta   = filas.reduce((s, f) => s + f.saldo, 0);
      const carteraVencida = filas.filter(f => f.estadoCartera === 'VENCIDA').reduce((s, f) => s + f.saldo, 0);
      const noDevenga      = filas.filter(f => f.estadoCartera === 'NO DEVENGA INTERESES').reduce((s, f) => s + f.saldo, 0);
      const porVencer      = filas.filter(f => f.estadoCartera === 'POR VENCER').reduce((s, f) => s + f.saldo, 0);
      // Morosidad ampliada SEPS = (vencida + no devenga intereses) / cartera bruta
      const morosidad = carteraBruta > 0 ? ((carteraVencida + noDevenga) / carteraBruta) * 100 : 0;

      return res.json({
        ok: true,
        fecha: new Date().toISOString().split('T')[0],
        filas,
        totales: {
          porVencer:      Math.round(porVencer * 100) / 100,
          noDevenga:      Math.round(noDevenga * 100) / 100,
          vencida:        Math.round(carteraVencida * 100) / 100,
          carteraBruta:   Math.round(carteraBruta * 100) / 100,
          morosidadPct:   Math.round(morosidad * 100) / 100,
        },
      });
    }

    if (type === 'sp_uaf_matriz') {
      // Matriz UAFE — operaciones en EFECTIVO sobre los umbrales de reporte obligatorio.
      // Reemplaza la aproximación anterior, que tomaba cualquier asiento >= $5000 de
      // RegistroContable: eso incluía desembolsos de crédito y acreditaciones que NO son
      // movimientos de efectivo, es decir, sobre-reportaba y a la vez no identificaba al
      // socio ni acumulaba por mes (las dos cosas que la UAFE exige).
      //
      // Criterio de efectivo: el asiento toca la cuenta de Caja del Catálogo SEPS (110105
      // Efectivo). Es el mismo criterio contable que usa el cierre de caja, así que no puede
      // desincronizarse de lo que el cajero realmente recibió/entregó.
      // Umbrales (Ecuador): individual >= $5,000; acumulado mensual por socio >= $10,000.
      const UMBRAL_INDIVIDUAL = 5000;
      const UMBRAL_ACUMULADO  = 10000;

      const [individuales, acumuladas] = await Promise.all([
        pool.request()
          .input('umbral', sql.Decimal(15, 2), UMBRAL_INDIVIDUAL)
          .query(`
            SELECT rc.AsientoId, CONVERT(NVARCHAR(10), rc.Fecha, 23) AS fecha,
                   s.Identificacion, s.TipoIdentificacion,
                   LTRIM(RTRIM(ISNULL(s.PrimerNombre,'') + ' ' + ISNULL(s.Apellidos,''))) AS socio,
                   rc.Concepto, rc.UsuarioId,
                   CASE WHEN rc.Debe > 0 THEN 'INGRESO' ELSE 'EGRESO' END AS sentido,
                   (rc.Debe + rc.Haber) AS monto
            FROM dbo.RegistroContable rc
            LEFT JOIN dbo.RegistroSocios s ON s.SOCIOID = rc.SocioId
            WHERE rc.CuentaContable = '110105'
              AND (rc.Debe + rc.Haber) >= @umbral
            ORDER BY rc.Fecha DESC, rc.AsientoId DESC
          `),
        pool.request()
          .input('umbral', sql.Decimal(15, 2), UMBRAL_ACUMULADO)
          .query(`
            SELECT anio, mes, Identificacion, TipoIdentificacion, socio, operaciones, montoAcumulado
            FROM (
              SELECT YEAR(rc.Fecha) AS anio, MONTH(rc.Fecha) AS mes,
                     s.Identificacion, s.TipoIdentificacion,
                     LTRIM(RTRIM(ISNULL(s.PrimerNombre,'') + ' ' + ISNULL(s.Apellidos,''))) AS socio,
                     COUNT(*) AS operaciones,
                     SUM(rc.Debe + rc.Haber) AS montoAcumulado
              FROM dbo.RegistroContable rc
              LEFT JOIN dbo.RegistroSocios s ON s.SOCIOID = rc.SocioId
              WHERE rc.CuentaContable = '110105' AND rc.SocioId IS NOT NULL
              GROUP BY YEAR(rc.Fecha), MONTH(rc.Fecha), s.Identificacion, s.TipoIdentificacion,
                       LTRIM(RTRIM(ISNULL(s.PrimerNombre,'') + ' ' + ISNULL(s.Apellidos,'')))
            ) t
            WHERE montoAcumulado >= @umbral
            ORDER BY anio DESC, mes DESC, montoAcumulado DESC
          `),
      ]);

      return res.json({
        ok: true,
        fecha: new Date().toISOString().split('T')[0],
        umbrales: { individual: UMBRAL_INDIVIDUAL, acumuladoMensual: UMBRAL_ACUMULADO },
        individuales: individuales.recordset.map(r => ({
          asientoId: r.AsientoId,
          fecha: r.fecha,
          identificacion: r.Identificacion || null,
          tipoIdentificacion: r.TipoIdentificacion || null,
          socio: (r.socio || '').trim() || null,
          concepto: r.Concepto,
          usuarioId: r.UsuarioId,
          sentido: r.sentido,
          monto: parseFloat(r.monto || 0),
        })),
        acumuladas: acumuladas.recordset.map(r => ({
          periodo: `${r.anio}-${String(r.mes).padStart(2, '0')}`,
          identificacion: r.Identificacion || null,
          tipoIdentificacion: r.TipoIdentificacion || null,
          socio: (r.socio || '').trim() || null,
          operaciones: r.operaciones,
          montoAcumulado: parseFloat(r.montoAcumulado || 0),
        })),
      });
    }

    if (type === 'sp_esf_seps') {
      // Estado de Situación Financiera (ESF) — agrupado por rubro (nivel de 2 dígitos del
      // Catálogo Único SEPS: 11 Fondos Disponibles, 14 Cartera de Créditos, 21 Obligaciones
      // con el Público, 31 Capital Social, etc.). Estructura verificada contra la jerarquía
      // real del catálogo cargado en dbo.PlanCuentas (ver db/sqlserver/26-27), que es la
      // organización oficial SEPS (Activo 1/11-19, Pasivo 2/21-29, Patrimonio 3/31-36).
      // Cuentas de provisión (contra-activo, ej. 149910) quedan dentro del mismo rubro de su
      // grupo (14) y se netean automáticamente al sumar Debe-Haber de todas las cuentas del
      // rubro -- no requieren tratamiento especial.
      const [rubros, huerfanas] = await Promise.all([
        pool.request().query(`
          ;WITH Saldos AS (
            SELECT LEFT(pc.Codigo, 2) AS GrupoCodigo, pc.TipoCuenta,
                   SUM(rc.Debe) AS Debe, SUM(rc.Haber) AS Haber
            FROM dbo.RegistroContable rc
            JOIN dbo.PlanCuentas pc ON pc.Codigo = rc.CuentaContable
            WHERE pc.TipoCuenta IN ('ACTIVO','PASIVO','PATRIMONIO','INGRESO','GASTO')
            GROUP BY LEFT(pc.Codigo, 2), pc.TipoCuenta
          )
          SELECT s.GrupoCodigo AS codigo, g.Nombre AS nombre, s.TipoCuenta AS tipoCuenta,
                 s.Debe AS debe, s.Haber AS haber
          FROM Saldos s
          JOIN dbo.PlanCuentas g ON g.Codigo = s.GrupoCodigo
          ORDER BY s.GrupoCodigo
        `),
        pool.request().query(`
          SELECT DISTINCT rc.CuentaContable
          FROM dbo.RegistroContable rc
          LEFT JOIN dbo.PlanCuentas pc ON pc.Codigo = rc.CuentaContable
          WHERE pc.CuentaContableId IS NULL
        `),
      ]);

      const activo = [], pasivo = [], patrimonio = [];
      let totalActivo = 0, totalPasivo = 0, totalPatrimonio = 0, totalIngresos = 0, totalGastos = 0;

      for (const r of rubros.recordset) {
        const debe = parseFloat(r.debe || 0), haber = parseFloat(r.haber || 0);
        if (r.tipoCuenta === 'ACTIVO') {
          const monto = debe - haber;
          activo.push({ codigo: r.codigo, nombre: r.nombre, monto });
          totalActivo += monto;
        } else if (r.tipoCuenta === 'PASIVO') {
          const monto = haber - debe;
          pasivo.push({ codigo: r.codigo, nombre: r.nombre, monto });
          totalPasivo += monto;
        } else if (r.tipoCuenta === 'PATRIMONIO') {
          const monto = haber - debe;
          patrimonio.push({ codigo: r.codigo, nombre: r.nombre, monto });
          totalPatrimonio += monto;
        } else if (r.tipoCuenta === 'INGRESO') {
          totalIngresos += (haber - debe);
        } else if (r.tipoCuenta === 'GASTO') {
          totalGastos += (debe - haber);
        }
      }

      // Resultado del ejercicio (utilidad/pérdida no distribuida) se muestra como línea de
      // Patrimonio aunque todavía no haya un asiento formal de cierre de período -- es la
      // misma convención que usa la fórmula PERLAS de Patrimonio Técnico ({5}-{4}).
      const resultadoEjercicio = totalIngresos - totalGastos;
      totalPatrimonio += resultadoEjercicio;

      const totalPasivoMasPatrimonio = totalPasivo + totalPatrimonio;
      const diferencia = Math.round((totalActivo - totalPasivoMasPatrimonio) * 100) / 100;

      return res.json({
        ok: true,
        fecha: new Date().toISOString().split('T')[0],
        activo, totalActivo,
        pasivo, totalPasivo,
        patrimonio, resultadoEjercicio, totalPatrimonio,
        totalPasivoMasPatrimonio,
        cuadrado: Math.abs(diferencia) < 0.01,
        diferencia,
        cuentasSinCatalogar: huerfanas.recordset.map(r => r.CuentaContable),
      });
    }

    if (type === 'sp_indicadores_perlas') {
      // Indicadores financieros SEPS ("Límites de Riesgo", alineados con la metodología
      // PERLAS de WOCCU). Las fórmulas marcadas `exacto: true` son las mismas que están
      // escritas en el motor de indicadores del core real (bcaindi), expresadas sobre saldos
      // del Catálogo Único: p.ej. LIQUIDEZ = ({11}+{13}) / ({2101}+{2103}), ROA = ({5}-{4})/{1}.
      //
      // SOLVENCIA se marca `exacto: false` a propósito: el indicador regulatorio real es
      // Patrimonio Técnico Constituido / Activos Ponderados por Riesgo, y la ponderación por
      // riesgo de cada familia de activo no está parametrizada todavía en este sistema. Se
      // publica la razón Patrimonio/Activo como aproximación DECLARADA, nunca presentándola
      // como el índice de solvencia regulatorio -- reportar un número de solvencia mal
      // calculado sería peor que declararlo pendiente.
      const saldos = await pool.request().query(`
        SELECT LEFT(pc.Codigo, 4) AS c4, LEFT(pc.Codigo, 2) AS c2, LEFT(pc.Codigo, 1) AS c1,
               pc.TipoCuenta, SUM(rc.Debe) AS Debe, SUM(rc.Haber) AS Haber
        FROM dbo.RegistroContable rc
        JOIN dbo.PlanCuentas pc ON pc.Codigo = rc.CuentaContable
        GROUP BY LEFT(pc.Codigo, 4), LEFT(pc.Codigo, 2), LEFT(pc.Codigo, 1), pc.TipoCuenta
      `);

      // Saldo natural por prefijo: activo/gasto = Debe-Haber; pasivo/patrimonio/ingreso = Haber-Debe.
      const saldoPrefijo = (prefijo) => {
        let total = 0;
        for (const r of saldos.recordset) {
          const codigo = prefijo.length <= 1 ? r.c1 : (prefijo.length <= 2 ? r.c2 : r.c4);
          if (codigo !== prefijo) continue;
          const debe = parseFloat(r.Debe || 0), haber = parseFloat(r.Haber || 0);
          total += (r.TipoCuenta === 'ACTIVO' || r.TipoCuenta === 'GASTO') ? (debe - haber) : (haber - debe);
        }
        return total;
      };

      const activoTotal    = saldoPrefijo('1');
      const patrimonio     = saldoPrefijo('3');
      const ingresos       = saldoPrefijo('5');
      const gastos         = saldoPrefijo('4');
      const resultado      = ingresos - gastos;
      const fondosDisp     = saldoPrefijo('11');
      const inversiones    = saldoPrefijo('13');
      const cartera        = saldoPrefijo('14');
      const depVista       = saldoPrefijo('2101');
      const depPlazo       = saldoPrefijo('2103');
      // Cartera improductiva según CONTABILIDAD = no devenga intereses (141x) + vencida (142x).
      const carteraImprodContable = ['1411','1412','1413','1414','1415','1416','1417','1418',
                                     '1421','1422','1423','1424','1425','1426','1427','1428']
                                     .reduce((s, p) => s + saldoPrefijo(p), 0);

      // Cartera improductiva según OPERACIÓN (tabla de amortización real): cuotas efectivamente
      // vencidas + saldo de operaciones en mora que dejó de devengar. Esta es la fuente de
      // verdad de la morosidad mientras no exista el proceso mensual de reclasificación
      // contable de cartera entre bandas/estados (ver db/sqlserver/29_...sql). Si sólo se
      // leyera contabilidad, una cartera 100% en mora podría reportar 0% de morosidad.
      const opRes = await pool.request().query(`
        ;WITH Cuotas AS (
          SELECT c.CreditoID, j.number, j.capital,
                 DATEADD(MONTH, j.number, c.FechaDesembolso) AS FechaVenceCuota
          FROM dbo.Creditos c
          JOIN dbo.SolicitudesCredito s ON s.SolicitudID = c.SolicitudID
          CROSS APPLY OPENJSON(s.PlanPagos) WITH (
            number INT '$.number', capital DECIMAL(15,2) '$.capital', status NVARCHAR(20) '$.status'
          ) j
          WHERE c.Estado = 'VIGENTE' AND ISNULL(j.status,'') <> 'PAGADO'
        ),
        Clasificadas AS (
          SELECT capital,
                 DATEDIFF(DAY, FechaVenceCuota, CAST(GETDATE() AS DATE)) AS DiasMora,
                 MAX(CASE WHEN FechaVenceCuota < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END)
                   OVER (PARTITION BY CreditoID) AS OperacionEnMora
          FROM Cuotas
        )
        SELECT
          SUM(capital) AS carteraBruta,
          SUM(CASE WHEN DiasMora > 0 OR OperacionEnMora = 1 THEN capital ELSE 0 END) AS improductiva
        FROM Clasificadas
      `);
      const carteraBrutaOp = parseFloat((opRes.recordset[0] || {}).carteraBruta || 0);
      const carteraImprod  = parseFloat((opRes.recordset[0] || {}).improductiva || 0);
      // El patrimonio contable todavía no incorpora el resultado del período (no hay asiento
      // de cierre), así que se le suma para los ratios -- misma convención que el ESF.
      const patrimonioConResultado = patrimonio + resultado;

      const ratio = (num, den) => (den && Math.abs(den) > 0.001) ? (num / den) * 100 : null;
      const r2 = (v) => v === null ? null : Math.round(v * 100) / 100;

      const indicadores = [
        { categoria: 'LIQUIDEZ', nombre: 'Indicador de Liquidez',
          formula: '(Fondos disponibles {11} + Inversiones {13}) / (Depósitos a la vista {2101} + Depósitos a plazo {2103})',
          valor: r2(ratio(fondosDisp + inversiones, depVista + depPlazo)), unidad: '%', exacto: true },
        { categoria: 'CALIDAD DE ACTIVOS', nombre: 'Morosidad Ampliada',
          formula: 'Cartera improductiva (cuotas vencidas + saldo que dejó de devengar) / Cartera bruta. Calculada sobre la tabla de amortización real, no sobre la clasificación contable, porque el proceso mensual de reclasificación de cartera aún no existe.',
          valor: r2(ratio(carteraImprod, carteraBrutaOp)), unidad: '%', exacto: true },
        { categoria: 'CALIDAD DE ACTIVOS', nombre: 'Participación de Cartera en el Activo',
          formula: 'Cartera de créditos {14} / Activo total {1}',
          valor: r2(ratio(cartera, activoTotal)), unidad: '%', exacto: true },
        { categoria: 'RENTABILIDAD', nombre: 'ROA (Rendimiento sobre Activos)',
          formula: '(Ingresos {5} − Gastos {4}) / Activo total {1}',
          valor: r2(ratio(resultado, activoTotal)), unidad: '%', exacto: true },
        { categoria: 'RENTABILIDAD', nombre: 'ROE (Rendimiento sobre Patrimonio)',
          formula: '(Ingresos {5} − Gastos {4}) / Patrimonio {3}',
          valor: r2(ratio(resultado, patrimonioConResultado)), unidad: '%', exacto: true },
        { categoria: 'RENTABILIDAD', nombre: 'Grado de Absorción del Margen Financiero',
          formula: 'Gastos de operación {45} / Margen financiero (Ingresos {5} − Intereses causados {41})',
          valor: r2(ratio(saldoPrefijo('45'), ingresos - saldoPrefijo('41'))), unidad: '%', exacto: true },
        { categoria: 'SOLVENCIA', nombre: 'Patrimonio sobre Activo (aproximación)',
          formula: 'Patrimonio {3} / Activo total {1}. NO es el índice regulatorio de solvencia: ese exige Patrimonio Técnico Constituido sobre Activos Ponderados por Riesgo, cuyas ponderaciones aún no están parametrizadas.',
          valor: r2(ratio(patrimonioConResultado, activoTotal)), unidad: '%', exacto: false },
      ];

      // Control de reconciliación cartera contable vs cartera operativa. Se publica siempre,
      // aunque cuadre, porque es justamente el control que una revisión SEPS pide ver.
      const difCartera = Math.round((cartera - carteraBrutaOp) * 100) / 100;
      const difImprod  = Math.round((carteraImprodContable - carteraImprod) * 100) / 100;
      const alertas = [];
      if (Math.abs(difCartera) >= 0.01) {
        alertas.push(`El saldo de cartera contable ($${cartera.toFixed(2)}) no coincide con el saldo de cartera de la tabla de amortización ($${carteraBrutaOp.toFixed(2)}): diferencia $${difCartera.toFixed(2)}.`);
      }
      if (Math.abs(difImprod) >= 0.01) {
        alertas.push(`La cartera improductiva registrada en contabilidad ($${carteraImprodContable.toFixed(2)}) no coincide con la real según vencimientos ($${carteraImprod.toFixed(2)}). Falta el proceso mensual de reclasificación de cartera entre por vencer / no devenga / vencida.`);
      }

      return res.json({
        ok: true,
        fecha: new Date().toISOString().split('T')[0],
        indicadores,
        reconciliacion: {
          carteraContable: Math.round(cartera * 100) / 100,
          carteraOperativa: Math.round(carteraBrutaOp * 100) / 100,
          diferenciaCartera: difCartera,
          improductivaContable: Math.round(carteraImprodContable * 100) / 100,
          improductivaOperativa: Math.round(carteraImprod * 100) / 100,
          diferenciaImproductiva: difImprod,
          alertas,
        },
        insumos: {
          activoTotal: Math.round(activoTotal * 100) / 100,
          patrimonio: Math.round(patrimonioConResultado * 100) / 100,
          cartera: Math.round(cartera * 100) / 100,
          carteraImproductiva: Math.round(carteraImprod * 100) / 100,
          fondosDisponibles: Math.round(fondosDisp * 100) / 100,
          inversiones: Math.round(inversiones * 100) / 100,
          depositosVista: Math.round(depVista * 100) / 100,
          depositosPlazo: Math.round(depPlazo * 100) / 100,
          ingresos: Math.round(ingresos * 100) / 100,
          gastos: Math.round(gastos * 100) / 100,
          resultadoEjercicio: Math.round(resultado * 100) / 100,
        },
      });
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

    await registrarAuditoriaProceso(pool, {
      proceso: 'SOCIOS',
      accion: 'CREAR',
      entidadTipo: 'RegistroSocio',
      entidadId: socioId,
      usuarioId: usuarioRegistro || 'auto-registro',
      detalle: `Alta de socio ${identificacion} (${primerNombre} ${primerApellido}), NumeroSocio ${numeroSocio}.`,
      ip: req.ip,
    });

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

// ─── Generación server-side del Plan de Pagos (Sistema Francés / Cuota Fija) ──
// Replica EXACTAMENTE la fórmula usada en el frontend (components/CreditsView.tsx,
// función `simulation` ~líneas 62-87) y la que ya se calculaba inline para el
// análisis de sensibilidad en /api/socios/loans/approve (~líneas 1090-1110).
// Se centraliza aquí para no duplicar la fórmula y garantizar que los números
// que ve el socio al simular coincidan siempre con lo que queda persistido.
function generarPlanAmortizacion(monto, tasaAnual, plazoMeses) {
  const p = parseFloat(monto);
  const tasaVal = parseFloat(tasaAnual);
  const n = parseInt(plazoMeses, 10);

  if (!p || !n || n <= 0) return [];

  const r = (tasaVal / 100) / 12;
  const monthlyPayment = r === 0
    ? p / n
    : p * (r / (1 - Math.pow(1 + r, -n)));

  let balance = p;
  const installments = [];

  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const capital = monthlyPayment - interest;
    balance -= capital;
    installments.push({
      number: i,
      date: `Mes ${i}`,
      capital: Math.max(0, parseFloat(capital.toFixed(2))),
      interest: Math.max(0, parseFloat(interest.toFixed(2))),
      total: parseFloat(monthlyPayment.toFixed(2)),
      status: 'PENDIENTE'
    });
  }

  return installments;
}

// ── POST /api/socios/loans ───────────────────────────────────────────────────
app.post('/api/socios/loans', async (req, res) => {
  const { id, memberId, amount, balance, rate, installmentsCount, type, status, startDate, dueDate, installments: installmentsInput, garantiaInfo, origen } = req.body || {};
  if (!memberId || !amount || !rate || !installmentsCount) {
    return res.status(400).json({ ok: false, error: 'Datos de crédito incompletos' });
  }

  // Si el cliente no envió el plan de pagos simulado (o vino vacío), lo generamos
  // server-side con la misma fórmula del frontend, para no persistir PlanPagos = NULL/"[]".
  const installments = (Array.isArray(installmentsInput) && installmentsInput.length > 0)
    ? installmentsInput
    : generarPlanAmortizacion(amount, rate, installmentsCount);

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

app.post('/api/socios/loans/approve', requireAuth, requireSelf('usuarioId'), async (req, res) => {
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

        await registrarAuditoriaProceso(transaction, {
          proceso: 'CREDITOS',
          accion: 'APROBAR',
          entidadTipo: 'SolicitudCredito',
          entidadId: loanId,
          usuarioId: approverId,
          valorNuevo: finalAmount,
          detalle: auditDetail,
        });
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
app.post('/api/socios/loans/disburse', requireAuth, requireSelf('usuarioId'), async (req, res) => {
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
        let planSimulado = [];
        try {
          planSimulado = planPagosText ? JSON.parse(planPagosText) : [];
        } catch (parseErr) {
          planSimulado = [];
        }
        if (!Array.isArray(planSimulado) || planSimulado.length === 0) {
          // PlanPagos venía NULL o "[]" (bug histórico: la solicitud nunca guardó el
          // plan simulado). Lo regeneramos aquí con la misma fórmula server-side para
          // no desembolsar un crédito VIGENTE sin tabla de amortización.
          console.warn(`[disburse] PlanPagos vacío/NULL para ${loanId}; regenerando server-side con Monto=${loanAmount}, Tasa=${rateVal}, Plazo=${plazoVal}`);
          planSimulado = generarPlanAmortizacion(loanAmount, rateVal, plazoVal);
        }
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
          .input('cuentaContable', sql.NVarChar(20), '140205')
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
          .input('cuentaContable', sql.NVarChar(20), '529010')
          .input('concepto', sql.NVarChar(200), `COMISIÓN DESEMBOLSO CRÉDITO ${loanId}`)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), comision)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), approverId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Asiento 4: Haber en Fondo Irrepartible de Reserva (3.2.01) (Patrimonio)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '330105')
          .input('concepto', sql.NVarChar(200), `FONDO IRREPARTIBLE CRÉDITO ${loanId}`)
          .input('debe', sql.Decimal(18, 2), 0.00)
          .input('haber', sql.Decimal(18, 2), fondo)
          .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
          .input('usuarioId', sql.NVarChar(50), approverId)
          .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

        // Asiento 5: Haber en Retenciones por Pagar Ley SOLCA (2.5.04) (Pasivo)
        await transaction.request()
          .input('socioId', sql.BigInt, account.SocioId)
          .input('cuentaContable', sql.NVarChar(20), '25049005')
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

        await registrarAuditoriaProceso(transaction, {
          proceso: 'CREDITOS',
          accion: 'DESEMBOLSAR',
          entidadTipo: 'SolicitudCredito',
          entidadId: loanId,
          usuarioId: approverId,
          valorNuevo: loanAmount,
          detalle: auditDetail,
        });

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
app.post('/api/socios/loans/reject', requireAuth, requireSelf('usuarioId'), async (req, res) => {
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

    await registrarAuditoriaProceso(pool, {
      proceso: 'CREDITOS',
      accion: 'RECHAZAR',
      entidadTipo: 'SolicitudCredito',
      entidadId: id,
      usuarioId: approverId,
      detalle: auditDetail,
    });

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
        .input('cuentaContable', sql.NVarChar(20), '140205')
        .input('concepto', sql.NVarChar(200), payConcept)
        .input('debe', sql.Decimal(18, 2), 0.00)
        .input('haber', sql.Decimal(18, 2), targetInst.capital)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), 'caja')
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // Asiento 3: Haber en Ingresos por Intereses (aumenta ingresos) por el interés (neto cobrado)
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '510410') // Intereses cartera de créditos de consumo
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

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CREDITOS',
        accion: 'PAGO_DIVIDENDO',
        entidadTipo: 'SolicitudCredito',
        entidadId: loanId,
        usuarioId: 'caja',
        detalle: auditDetail,
      });

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

    await registrarAuditoriaProceso(pool, {
      proceso: 'SOCIOS',
      accion: 'MODIFICAR',
      entidadTipo: 'RegistroSocio',
      entidadId: identificacion.trim(),
      usuarioId: identificacion.trim(),
      detalle: 'Actualización de perfil (email/teléfono/dirección/lugar de trabajo/estado civil).',
      ip: req.ip,
    });

    return res.json({ ok: true, message: 'Perfil del socio actualizado correctamente' });
  } catch (err) {
    console.error('[update profile]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/update-report-profile ────────────────────────────────────
app.post('/api/socios/update-report-profile', requireAuth, async (req, res) => {
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

    await registrarAuditoriaProceso(pool, {
      proceso: 'SOCIOS',
      accion: 'MODIFICAR',
      entidadTipo: 'RegistroSocio',
      entidadId: identificacion.trim(),
      usuarioId: req.actor.usuarioId,
      campoAfectado: 'PEPS',
      valorNuevo: peps ? 'SI' : 'NO',
      detalle: `Actualización de ficha SEPS ampliada (PEPS, patrimonio/ingresos, vivienda, discapacidad, autoidentificación) del socio ${identificacion.trim()}.`,
      ip: req.ip,
    });

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
            rs.SOCIOID, rs.TipoPersona, rs.TipoIdentificacion, rs.Identificacion, rs.PrimerNombre, rs.SegundoNombre, rs.PrimerApellido, rs.SegundoApellido, rs.Apellidos, rs.Email, rs.Telefono, rs.FechaNacimiento, rs.EstadoCivil, rs.NumeroSocio,
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
            rs.SOCIOID, rs.TipoPersona, rs.TipoIdentificacion, rs.Identificacion, rs.PrimerNombre, rs.SegundoNombre, rs.PrimerApellido, rs.SegundoApellido, rs.Apellidos, rs.Email, rs.Telefono, rs.FechaNacimiento, rs.EstadoCivil, rs.NumeroSocio,
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
      // No existe todavía en la base nueva: buscar en el espejo Postgres legacy (Neon) sin migrar nada.
      const legacyData = await buscarClienteLegacyPg(q);
      // El socio también puede tener créditos legacy en bcacred: fallback por cédula.
      for (const socio of legacyData) {
        if (!socio.loans || socio.loans.length === 0) {
          socio.loans = await buscarCreditosLegacyPg(socio.id);
        }
      }
      return res.json({ ok: true, data: legacyData });
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

      let loans = loansResult.recordset.map(loan => ({
        ...loan,
        installments: loan.installments ? JSON.parse(loan.installments) : []
      }));

      // El socio existe en SQL Server pero puede no tener créditos migrados aún: fallback al espejo legacy.
      if (loans.length === 0) {
        loans = await buscarCreditosLegacyPg(r.Identificacion);
      }

      socios.push({
        id: r.Identificacion,
        socioId: r.SOCIOID,
        name: `${r.PrimerNombre} ${r.SegundoNombre ? r.SegundoNombre + ' ' : ''}${r.Apellidos}`,
        firstName: r.PrimerNombre,
        middleName: r.SegundoNombre || '',
        firstLastName: r.PrimerApellido || '',
        secondLastName: r.SegundoApellido || '',
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
        loans: loans,
        origen: 'NUEVO'
      });
    }

    return res.json({ ok: true, data: socios });
  } catch (err) {
    console.error('[buscar socio]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/transaccion ─────────────────────────────────────────────
app.post('/api/socios/transaccion', requireAuth, requireSelf('tellerId'), async (req, res) => {
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

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CAJA',
        accion: opType,
        entidadTipo: 'CuentaAhorro',
        entidadId: account.CuentaId,
        usuarioId: tellerId || 'caja',
        valorAnterior: account.Saldo,
        valorNuevo: newBalance,
        detalle: `${description || ''} (cuenta ${account.NumeroCuenta}, asiento ${asientoId ?? 'N/A'})`.trim(),
      });

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
app.post('/api/socios/transaccion/anular', requireAuth, requireSelf('actorId'), async (req, res) => {
  const { id, actorId } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'ID de transacción requerido' });
  if (!actorId) return res.status(400).json({ ok: false, error: 'Usuario que ejecuta la anulación requerido' });

  const rawAsientoId = id.replace('tx-', '').replace('TX-', '');
  const asientoId = parseInt(rawAsientoId, 10);
  if (isNaN(asientoId)) {
    return res.status(400).json({ ok: false, error: 'ID de transacción inválido' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    // El rol se resuelve desde la base (no se confía en un campo enviado por el cliente,
    // que era trivialmente falsificable: cualquiera podía mandar { role: 'ADMIN' }).
    const actorRes = await pool.request()
      .input('actorId', sql.NVarChar(20), actorId.trim().toLowerCase())
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @actorId');
    const actorRole = actorRes.recordset.length > 0 ? actorRes.recordset[0].Rol : null;

    if (actorRole !== 'ADMIN') {
      return res.status(403).json({ ok: false, error: 'PERMISOS INSUFICIENTES: Solo un usuario Administrador puede anular transacciones.' });
    }

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

      // NOTA: el body de este endpoint solo trae {id, role}, no el usuario que ejecuta la anulación
      // (pendiente: el frontend debería enviar el userId real de quien anula, no solo el rol).
      await registrarAuditoriaProceso(transaction, {
        proceso: 'CAJA',
        accion: 'ANULAR',
        entidadTipo: 'AsientoContable',
        entidadId: asientoId,
        usuarioId: actorId,
        valorAnterior: account.Saldo,
        valorNuevo: newBalance,
        detalle: `Anulación de tx-${asientoId} (${original.Concepto})`,
      });

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
app.post('/api/socios/loans/anular', requireAuth, requireSelf('usuarioId'), async (req, res) => {
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
        .input('cuentaContable', sql.NVarChar(20), '140205')
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
          .input('cuentaContable', sql.NVarChar(20), '529010')
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
          .input('cuentaContable', sql.NVarChar(20), '330105')
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

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CREDITOS',
        accion: 'ANULAR',
        entidadTipo: 'SolicitudCredito',
        entidadId: id,
        usuarioId: userId,
        valorAnterior: loanAmount,
        detalle: auditDetail,
      });

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
app.post('/api/socios/loans/anular-pago', requireAuth, requireSelf('usuarioId'), async (req, res) => {
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
        .input('cuentaContable', sql.NVarChar(20), '140205')
        .input('concepto', sql.NVarChar(200), revConcept)
        .input('debe', sql.Decimal(18, 2), targetInst.capital)
        .input('haber', sql.Decimal(18, 2), 0.00)
        .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
        .input('usuarioId', sql.NVarChar(50), userId)
        .query('INSERT INTO dbo.RegistroContable (SocioId, CuentaContable, Concepto, Debe, Haber, NumeroCuenta, UsuarioId) VALUES (@socioId, @cuentaContable, @concepto, @debe, @haber, @numeroCuenta, @usuarioId)');

      // Revert Asiento 3: Debe en Ingresos por Intereses (disminuye ingresos) por el interés
      await transaction.request()
        .input('socioId', sql.BigInt, account.SocioId)
        .input('cuentaContable', sql.NVarChar(20), '510410')
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

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CREDITOS',
        accion: 'ANULAR_DIVIDENDO',
        entidadTipo: 'SolicitudCredito',
        entidadId: loanId,
        usuarioId: userId,
        detalle: auditDetail,
      });

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
app.post('/api/socios/loans/update-status', requireAuth, requireSelf('usuarioId'), async (req, res) => {
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

    await registrarAuditoriaProceso(pool, {
      proceso: 'CREDITOS',
      accion: 'CAMBIO_ESTADO',
      entidadTipo: 'SolicitudCredito',
      entidadId: loanId,
      usuarioId: userId,
      campoAfectado: 'Estado',
      valorAnterior: loan.Estado,
      valorNuevo: upperStatus,
      detalle: auditDetail,
    });

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

// ── GET /api/reportes/cartera-credito ─────────────────────────────────────
// Cartera de crédito (vigente/vencido/demandado/castigado) a fecha de corte, en vivo contra
// Informix (afccajapatate). No reimplementa la consulta: delega a la herramienta Java ya
// construida y validada en el proyecto hermano C:\GUTT_CONEXION_CAJA_PATATE\jdbc-informix
// (CarteraJsonRunner, que resuelve config/db.properties y sql/cartera_credito_template.sql como
// rutas relativas a ese directorio — por eso `cwd` es obligatorio). Puede tardar 15-40s: es una
// consulta real sobre el core bancario legacy a través del túnel Tailscale, no un mock; por eso el
// timeout generoso (60s) y por lo que el frontend debe mostrar un estado de carga, no asumir
// respuesta rápida.
const CARTERA_CREDITO_JAVA_CWD = 'C:\\GUTT_CONEXION_CAJA_PATATE\\jdbc-informix';
const CARTERA_CREDITO_CLASSPATH = [
  join(CARTERA_CREDITO_JAVA_CWD, 'target', 'classes'),
  'C:\\AFCJORGE\\razorsql\\razorsql\\drivers\\informix\\ifxjdbc.jar',
].join(';');
const CARTERA_CREDITO_TIMEOUT_MS = 60000;
// Solo roles con responsabilidad sobre cartera/finanzas institucionales ven este reporte
// (TELLER y MEMBER quedan fuera: es información financiera agregada de toda la cooperativa).
const CARTERA_CREDITO_ROLES = new Set(['ADMIN', 'MANAGER', 'ACCOUNTANT', 'CREDIT_OFFICER']);

app.get('/api/reportes/cartera-credito', requireAuth, (req, res) => {
  const actorRol = (req.actor.rol || '').toString().toUpperCase().trim();
  if (!CARTERA_CREDITO_ROLES.has(actorRol)) {
    return res.status(403).json({ ok: false, error: 'No autorizado para ver la cartera de crédito' });
  }

  const fechaParam = typeof req.query.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha)
    ? req.query.fecha
    // Fecha de corte por defecto: hoy en zona horaria de Ecuador (el server puede correr en UTC).
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

  let settled = false;
  const proc = spawn('java', ['-cp', CARTERA_CREDITO_CLASSPATH, 'com.cajapatate.informix.CarteraJsonRunner', fechaParam], {
    cwd: CARTERA_CREDITO_JAVA_CWD,
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    proc.kill();
    console.error(`[cartera-credito] proceso Java excedió ${CARTERA_CREDITO_TIMEOUT_MS}ms, se terminó.`);
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'La consulta de cartera de crédito tardó demasiado (Informix/VPN). Intente nuevamente.' });
  }, CARTERA_CREDITO_TIMEOUT_MS);

  proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
  proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

  proc.on('error', err => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    console.error('[cartera-credito] no se pudo iniciar el proceso Java:', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'No se pudo iniciar la consulta de cartera de crédito (¿java no está en PATH?)' });
  });

  proc.on('close', code => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (code !== 0) {
      console.error(`[cartera-credito] CarteraJsonRunner terminó con código ${code}. stderr: ${stderr.replace(/\s+/g, ' ').trim().substring(0, 500)}`);
      return res.status(502).json({ ok: false, error: 'Error al consultar la cartera de crédito en Informix' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.json({ ok: true, data, fecha: fechaParam });
    } catch (e) {
      console.error('[cartera-credito] respuesta no es JSON válido:', e.message, stdout.substring(0, 300));
      return res.status(502).json({ ok: false, error: 'Respuesta inválida del motor de cartera de crédito' });
    }
  });
});

// ── GET /api/reportes/cartera-mensual ──────────────────────────────────────
// Reporte de Cartera Mensual (recuperación del mes): compara lo que se esperaba recuperar
// en un mes dado (cuotas de bcadivc que vencieron ese mes) contra lo que se recuperó
// realmente (abonos de bcaabdv capturados ese mes), con una tasa de recuperación mensual.
// DISTINTO de /api/reportes/cartera-credito (que es una foto a fecha de corte de
// vigente/vencido/demandado/castigado, no un análisis de recuperación por mes). Delega en
// el subproceso Java CarteraMensualJsonRunner (proyecto hermano jdbc-informix) -- mismo
// patrón que el resto de reportes de cartera. Ver sql/cartera_mensual_resumen.sql en ese
// proyecto para la metodología completa (por qué "esperado" y "recuperado" son dos
// poblaciones distintas por diseño, y por qué se usa divc_cap_proy/divc_int_proy en vez de
// divc_cap_divc/divc_int_plaz).
const CARTERA_MENSUAL_JAVA_CWD = 'C:\\GUTT_CONEXION_CAJA_PATATE\\jdbc-informix';
const CARTERA_MENSUAL_CLASSPATH = [
  join(CARTERA_MENSUAL_JAVA_CWD, 'target', 'classes'),
  'C:\\AFCJORGE\\razorsql\\razorsql\\drivers\\informix\\ifxjdbc.jar',
].join(';');
const CARTERA_MENSUAL_TIMEOUT_MS = 60000;
// Mismo criterio que Cartera de Crédito: información financiera agregada de toda la
// cooperativa sobre recuperación de cartera.
const CARTERA_MENSUAL_ROLES = new Set(['ADMIN', 'MANAGER', 'ACCOUNTANT', 'CREDIT_OFFICER']);

app.get('/api/reportes/cartera-mensual', requireAuth, (req, res) => {
  const actorRol = (req.actor.rol || '').toString().toUpperCase().trim();
  if (!CARTERA_MENSUAL_ROLES.has(actorRol)) {
    return res.status(403).json({ ok: false, error: 'No autorizado para ver la cartera mensual' });
  }

  const hoy = new Date();
  const mesAnteriorRef = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const anioParam = /^\d{4}$/.test(String(req.query.anio || '')) ? String(req.query.anio) : String(mesAnteriorRef.getFullYear());
  const mesParam = /^([1-9]|1[0-2])$/.test(String(req.query.mes || '')) ? String(req.query.mes) : String(mesAnteriorRef.getMonth() + 1);

  let settled = false;
  const proc = spawn('java', ['-cp', CARTERA_MENSUAL_CLASSPATH, 'com.cajapatate.informix.CarteraMensualJsonRunner', anioParam, mesParam], {
    cwd: CARTERA_MENSUAL_JAVA_CWD,
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    proc.kill();
    console.error(`[cartera-mensual] proceso Java excedió ${CARTERA_MENSUAL_TIMEOUT_MS}ms, se terminó.`);
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'La consulta de cartera mensual tardó demasiado (Informix/VPN). Intente nuevamente.' });
  }, CARTERA_MENSUAL_TIMEOUT_MS);

  proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
  proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

  proc.on('error', err => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    console.error('[cartera-mensual] no se pudo iniciar el proceso Java:', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'No se pudo iniciar la consulta de cartera mensual (¿java no está en PATH?)' });
  });

  proc.on('close', code => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (code !== 0) {
      console.error(`[cartera-mensual] CarteraMensualJsonRunner terminó con código ${code}. stderr: ${stderr.replace(/\s+/g, ' ').trim().substring(0, 500)}`);
      return res.status(502).json({ ok: false, error: 'Error al consultar la cartera mensual en Informix' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.json({ ok: true, data });
    } catch (e) {
      console.error('[cartera-mensual] respuesta no es JSON válida:', e.message, stdout.substring(0, 300));
      return res.status(502).json({ ok: false, error: 'Respuesta inválida del motor de cartera mensual' });
    }
  });
});

// ── GET /api/reportes/cartera-plazo-fijo ───────────────────────────────────
// Cartera de Depósitos a Plazo Fijo (bcadpfi) en vivo contra Informix (afccajapatate),
// mismo patrón que /api/reportes/cartera-credito: delega en un subproceso Java del
// proyecto hermano jdbc-informix (PlazoFijoJsonRunner). No requiere fecha de corte:
// bcadpfi ya refleja el estado vigente de cada póliza. Ver MANUALES/10_PLAZO_FIJO.md.
const PLAZO_FIJO_JAVA_CWD = 'C:\\GUTT_CONEXION_CAJA_PATATE\\jdbc-informix';
const PLAZO_FIJO_CLASSPATH = [
  join(PLAZO_FIJO_JAVA_CWD, 'target', 'classes'),
  'C:\\AFCJORGE\\razorsql\\razorsql\\drivers\\informix\\ifxjdbc.jar',
].join(';');
const PLAZO_FIJO_TIMEOUT_MS = 60000;
// Mismo criterio que Cartera de Crédito: información financiera agregada de toda la
// cooperativa, no de un socio individual. CREDIT_OFFICER queda fuera aquí (es cartera
// de captaciones, no de créditos).
const PLAZO_FIJO_ROLES = new Set(['ADMIN', 'MANAGER', 'ACCOUNTANT']);

app.get('/api/reportes/cartera-plazo-fijo', requireAuth, (req, res) => {
  const actorRol = (req.actor.rol || '').toString().toUpperCase().trim();
  if (!PLAZO_FIJO_ROLES.has(actorRol)) {
    return res.status(403).json({ ok: false, error: 'No autorizado para ver la cartera de plazo fijo' });
  }

  let settled = false;
  const proc = spawn('java', ['-cp', PLAZO_FIJO_CLASSPATH, 'com.cajapatate.informix.PlazoFijoJsonRunner'], {
    cwd: PLAZO_FIJO_JAVA_CWD,
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    proc.kill();
    console.error(`[cartera-plazo-fijo] proceso Java excedió ${PLAZO_FIJO_TIMEOUT_MS}ms, se terminó.`);
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'La consulta de cartera de plazo fijo tardó demasiado (Informix/VPN). Intente nuevamente.' });
  }, PLAZO_FIJO_TIMEOUT_MS);

  proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
  proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

  proc.on('error', err => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    console.error('[cartera-plazo-fijo] no se pudo iniciar el proceso Java:', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'No se pudo iniciar la consulta de cartera de plazo fijo (¿java no está en PATH?)' });
  });

  proc.on('close', code => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (code !== 0) {
      console.error(`[cartera-plazo-fijo] PlazoFijoJsonRunner terminó con código ${code}. stderr: ${stderr.replace(/\s+/g, ' ').trim().substring(0, 500)}`);
      return res.status(502).json({ ok: false, error: 'Error al consultar la cartera de plazo fijo en Informix' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.json({ ok: true, data });
    } catch (e) {
      console.error('[cartera-plazo-fijo] respuesta no es JSON válido:', e.message, stdout.substring(0, 300));
      return res.status(502).json({ ok: false, error: 'Respuesta inválida del motor de cartera de plazo fijo' });
    }
  });
});

// ── GET /api/reportes/utilidad-rentabilidad ─────────────────────────────────
// Utilidad neta y rentabilidad (ROA/ROE aproximados) calculados en vivo contra el
// Catálogo Único de Cuentas (CUC-SEPS) real de Informix (afccajapatate), delegando en
// el subproceso Java UtilidadRentabilidadJsonRunner (proyecto jdbc-informix). Verifica
// partida doble, cruza contra bcasact y reporta hallazgos de calidad de datos de forma
// explícita (nunca los oculta). Ver MANUALES/11_UTILIDAD_RENTABILIDAD.md.
const UTILIDAD_JAVA_CWD = 'C:\\GUTT_CONEXION_CAJA_PATATE\\jdbc-informix';
const UTILIDAD_CLASSPATH = [
  join(UTILIDAD_JAVA_CWD, 'target', 'classes'),
  'C:\\AFCJORGE\\razorsql\\razorsql\\drivers\\informix\\ifxjdbc.jar',
].join(';');
const UTILIDAD_TIMEOUT_MS = 60000;
// Información contable/financiera sensible (utilidad neta, ROA/ROE de toda la
// cooperativa): solo roles con responsabilidad gerencial o contable.
const UTILIDAD_ROLES = new Set(['ADMIN', 'MANAGER', 'ACCOUNTANT']);

app.get('/api/reportes/utilidad-rentabilidad', requireAuth, (req, res) => {
  const actorRol = (req.actor.rol || '').toString().toUpperCase().trim();
  if (!UTILIDAD_ROLES.has(actorRol)) {
    return res.status(403).json({ ok: false, error: 'No autorizado para ver utilidad y rentabilidad' });
  }

  const ejercicioParam = /^\d{1,3}$/.test(String(req.query.ejercicio || '')) ? String(req.query.ejercicio) : '12';
  const anioParam = /^\d{4}$/.test(String(req.query.anio || '')) ? String(req.query.anio) : '2026';

  let settled = false;
  const proc = spawn('java', ['-cp', UTILIDAD_CLASSPATH, 'com.cajapatate.informix.UtilidadRentabilidadJsonRunner', ejercicioParam, anioParam], {
    cwd: UTILIDAD_JAVA_CWD,
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    proc.kill();
    console.error(`[utilidad-rentabilidad] proceso Java excedió ${UTILIDAD_TIMEOUT_MS}ms, se terminó.`);
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'El cálculo de utilidad y rentabilidad tardó demasiado (Informix/VPN). Intente nuevamente.' });
  }, UTILIDAD_TIMEOUT_MS);

  proc.stdout.on('data', d => { stdout += d.toString('utf8'); });
  proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

  proc.on('error', err => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    console.error('[utilidad-rentabilidad] no se pudo iniciar el proceso Java:', err.message);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'No se pudo iniciar el cálculo de utilidad y rentabilidad (¿java no está en PATH?)' });
  });

  proc.on('close', code => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (code !== 0) {
      console.error(`[utilidad-rentabilidad] UtilidadRentabilidadJsonRunner terminó con código ${code}. stderr: ${stderr.replace(/\s+/g, ' ').trim().substring(0, 500)}`);
      return res.status(502).json({ ok: false, error: 'Error al calcular utilidad y rentabilidad en Informix' });
    }
    try {
      const data = JSON.parse(stdout);
      return res.json({ ok: true, data });
    } catch (e) {
      console.error('[utilidad-rentabilidad] respuesta no es JSON válida:', e.message, stdout.substring(0, 300));
      return res.status(502).json({ ok: false, error: 'Respuesta inválida del motor de utilidad y rentabilidad' });
    }
  });
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

    // Si la búsqueda por cédula/nombre no encontró nada en SQL Server, hacer fallback al
    // espejo legacy Postgres (legacy.bcadpfi), sin migrar nada — solo cuando hay un término
    // de búsqueda concreto. Antes leía Informix en vivo desde la VM equivocada (Crediapoyo,
    // ver sección 3.5) vía buscarDPFInformix(); ahora usa buscarDPFLegacyPg().
    if (r.recordset.length === 0 && busqueda) {
      const legacyDPF = await buscarDPFLegacyPg(busqueda);
      return res.json({ ok: true, data: legacyDPF });
    }

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

// ── GET /api/ahorros/resumen ──────────────────────────────────────────────────
// KPIs agregados de cuentas de Ahorro a la Vista (excluye Certificados de Aportación).
app.get('/api/ahorros/resumen', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const cuentasR = await pool.request().query(`
      SELECT
        COUNT(*) AS totalCuentas,
        SUM(CASE WHEN c.Estado='ACTIVA' THEN 1 ELSE 0 END) AS cuentasActivas,
        SUM(CASE WHEN c.Estado<>'ACTIVA' THEN 1 ELSE 0 END) AS cuentasInactivas,
        ISNULL(SUM(CASE WHEN c.Estado='ACTIVA' THEN c.Saldo ELSE 0 END),0) AS totalCaptado,
        COUNT(DISTINCT c.SocioId) AS sociosConCuenta
      FROM dbo.CuentasAhorro c
      INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
      WHERE p.EsCertificado = 0
    `);
    const movHoyR = await pool.request().query(`
      SELECT
        ISNULL(SUM(CASE WHEN rc.Haber > 0 THEN rc.Haber ELSE 0 END), 0) AS depositosHoy,
        ISNULL(SUM(CASE WHEN rc.Debe  > 0 THEN rc.Debe  ELSE 0 END), 0) AS retirosHoy,
        COUNT(*) AS movimientosHoy
      FROM dbo.RegistroContable rc
      INNER JOIN dbo.CuentasAhorro c ON c.NumeroCuenta = rc.NumeroCuenta
      INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
      WHERE p.EsCertificado = 0
        AND rc.CuentaContable != '110105'
        AND CAST(rc.Fecha AS DATE) = CAST(SYSDATETIME() AS DATE)
    `);
    await pool.close();
    return res.json({ ok: true, data: { ...cuentasR.recordset[0], ...movHoyR.recordset[0] } });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[ahorros-resumen]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ahorros/:cuentaId/movimientos ────────────────────────────────────
// Historial de movimientos (Libro Diario) de una cuenta de ahorro puntual.
// Solo lectura — no muta saldo ni contabilidad. Filtra la pata de "Caja Ventanilla"
// (110105) para mostrar una fila por transacción, igual que /api/socios/buscar.
app.get('/api/ahorros/:cuentaId/movimientos', async (req, res) => {
  const cleanId = ((req.params.cuentaId || '') + '').replace('ca-', '');
  const cuentaId = parseInt(cleanId, 10);
  if (isNaN(cuentaId)) {
    return res.status(400).json({ ok: false, error: 'ID de cuenta inválido' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    const accRes = await pool.request()
      .input('cuentaId', sql.Int, cuentaId)
      .query(`
        SELECT
          'ca-' + CAST(c.CuentaId AS NVARCHAR(10)) AS id, c.CuentaId, c.SocioId, c.NumeroCuenta,
          CAST(c.Saldo AS FLOAT) AS Saldo, c.Estado, c.FechaApertura,
          p.Nombre AS NombreProducto, p.EsCertificado, p.PermiteDepositos, p.PermiteRetiros,
          rs.Identificacion, rs.NumeroSocio,
          (rs.PrimerNombre + ' ' + ISNULL(rs.SegundoNombre + ' ', '') + rs.Apellidos) AS NombreSocio
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        INNER JOIN dbo.RegistroSocios rs ON rs.SOCIOID = c.SocioId
        WHERE c.CuentaId = @cuentaId
      `);

    if (accRes.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });
    }
    const account = accRes.recordset[0];

    const movRes = await pool.request()
      .input('numeroCuenta', sql.NVarChar(20), account.NumeroCuenta)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          'tx-' + CAST(AsientoId AS NVARCHAR(10)) AS id,
          AsientoId,
          FORMAT(Fecha, 'yyyy-MM-dd HH:mm') AS fecha,
          Concepto AS descripcion,
          CAST(CASE WHEN Haber > 0 THEN Haber ELSE -Debe END AS FLOAT) AS monto,
          CASE WHEN Haber > 0 THEN 'CREDIT' ELSE 'DEBIT' END AS tipo,
          UsuarioId AS usuarioId
        FROM dbo.RegistroContable
        WHERE NumeroCuenta = @numeroCuenta AND CuentaContable != '110105'
        ORDER BY Fecha DESC, AsientoId DESC
      `);

    await pool.close();
    return res.json({ ok: true, data: { account, movimientos: movRes.recordset } });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[ahorros-movimientos]', err.message);
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

// ── GET /api/contabilidad/balance-legacy ──────────────────────────────────────
// Vista de SOLO CONSULTA de saldos agregados por cuenta contable. Antes leía en vivo
// vía queryInformix()/comp_sal_cta -- mismo bug de raíz que 5.5/5.6/5.7 (ver sección
// 3.5): el bridge ODBC de este .env apunta a INFORMIX_HOST=192.168.1.199 /
// INFORMIX_DATABASE=afccajacrediapoyo, la VM de Crediapoyo, no Caja Patate. Ahora lee
// de legacy.comp_sal_cta en el espejo Postgres (Neon), igual que buscarClienteLegacyPg/
// buscarCreditosLegacyPg/buscarDPFLegacyPg. La tabla no estaba en el espejo (faltaba en
// las migraciones 001-019) -- se agregó en postgres-mirror/migraciones/020_legacy_comp_sal_cta,
// cargada y verificada 145/145 filas contra Informix real el 2026-08-04.
//
// comp_sal_cta es una FOTO del balance vigente (sin dimensión de período/fecha propia,
// confirmado por introspección en vivo de syscolumns -- ver comentario de la migración
// 020): NO existe libro diario/asientos transaccional en Informix para este dominio.
// Este endpoint expone el balance de comprobación tal cual vive en el sistema legacy.
// NO es un fallback de /api/contabilidad/libro-diario ni de
// /api/contabilidad/balance-comprobacion: dbo.RegistroContable en SQL Server sigue
// siendo la única fuente de verdad para contabilidad nueva/transaccional.
app.get('/api/contabilidad/balance-legacy', async (req, res) => {
  const cuenta  = (req.query.cuenta  || '').trim();
  const periodo = (req.query.periodo || '').trim(); // reservado: comp_sal_cta no tiene columna de período/fecha (confirmado en vivo, ver migración 020) -- no se aplica todavía

  if (!legacyPgPool) {
    return res.status(503).json({ ok: false, error: 'Pool Postgres legacy no configurado (falta LEGACY_PG_HOST en api/.env)' });
  }

  try {
    let query = `SELECT cod_ctas, nom_ccon, cod_tcue, sal_peri, sal_mes_debe, sal_mes_cred, cod_ofic FROM legacy.comp_sal_cta`;
    const params = [];
    if (cuenta) {
      query += ` WHERE cod_ctas = $1`;
      params.push(cuenta);
    }
    query += ` ORDER BY cod_ctas`;
    const { rows } = await queryLegacyPg(query, params);
    const cuentas = rows.map(r => ({
      cuenta: r.cod_ctas,
      nombreConcepto: (r.nom_ccon || '').trim(),
      tipoCuenta: (r.cod_tcue || '').trim(),
      saldoPeriodoAnterior: r.sal_peri !== null ? parseFloat(r.sal_peri) : 0,
      saldoMesDebe: r.sal_mes_debe !== null ? parseFloat(r.sal_mes_debe) : 0,
      saldoMesHaber: r.sal_mes_cred !== null ? parseFloat(r.sal_mes_cred) : 0,
      oficina: r.cod_ofic,
      origen: 'LEGACY_PG'
    }));
    const totalDebe  = cuentas.reduce((s, c) => s + c.saldoMesDebe, 0);
    const totalHaber = cuentas.reduce((s, c) => s + c.saldoMesHaber, 0);
    return res.json({ ok: true, cuentas, totalDebe, totalHaber, origen: 'LEGACY_PG', nota: 'Saldos agregados legacy de solo consulta (espejo Postgres). No reemplaza dbo.RegistroContable.' });
  } catch (err) {
    console.error('[balance-legacy]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── 8. Servir el build de producción del frontend (npm run build) ────────
// En desarrollo el frontend corre aparte con Vite (ver script "dev:full");
// esto solo aplica cuando existe dist/ (build de producción), para poder
// exponer todo en un único puerto (necesario para compartir por Funnel).
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
}

// ─── 9. Iniciar servidor ──────────────────────────────────────────────────
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
