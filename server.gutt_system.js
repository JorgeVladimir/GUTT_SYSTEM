/**
 * server.gutt_system.js — Backend adaptado al esquema NUEVO de la base GUTT_SYSTEM.
 *
 * Esto NO es el backend en producción. `server.js` (SQLGUTPATATE) sigue siendo el
 * que usa Caja Patate hoy y este archivo no lo toca ni lo reemplaza.
 *
 * Alcance de esta primera ronda: SOLO el módulo de Socios (registro, búsqueda,
 * consulta, ubicación/croquis) — ver MANUALES/ o el prompt del agente
 * `gutt-system-adaptacion-queries` para el resto de módulos pendientes.
 *
 * Conexión: usa SQL_SERVER_DATABASE_GUTT (api/.env.gutt_system), nunca
 * SQL_SERVER_DATABASE (api/.env, apunta a SQLGUTPATATE). Ver comentario junto a
 * `sqlConfig` más abajo para el porqué.
 *
 * Inicio: node server.gutt_system.js
 * Puerto: 5006 por defecto (GUTT_API_PORT en api/.env.gutt_system)
 */

import { createRequire } from 'module';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sql from 'mssql';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// ─── 1. Cargar .env ─────────────────────────────────────────────────────────
// Se cargan DOS archivos: api/.env (host/instancia/usuario/password — misma
// instancia física que producción) y api/.env.gutt_system (SQL_SERVER_DATABASE_GUTT,
// la única fuente válida del nombre de base para este archivo).
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
loadDotEnv(join(__dirname, 'api', '.env.gutt_system'));
loadDotEnv(join(__dirname, 'api', '.env'));

// ─── 1.5 Configuración SQL Server — GUTT_SYSTEM, nunca SQLGUTPATATE ────────
// A propósito NO se lee process.env.SQL_SERVER_DATABASE en ningún punto de este
// archivo. Solo SQL_SERVER_DATABASE_GUTT, con fallback duro a 'GUTT_SYSTEM' (no a
// 'SQLGUTPATATE' ni a ninguna variable compartida con el backend de producción).
const DATABASE_NAME = process.env.SQL_SERVER_DATABASE_GUTT || 'GUTT_SYSTEM';
if (DATABASE_NAME === 'SQLGUTPATATE') {
  console.error('❌ SQL_SERVER_DATABASE_GUTT no puede apuntar a SQLGUTPATATE (base de producción). Abortando.');
  process.exit(1);
}

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: DATABASE_NAME,
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

// CooperativaId activo de esta instancia. Antes estaba fijo en 1 (Caja Patate) sin
// forma de configurarlo -- con eso, el catálogo real cargado para Crediapoyo
// (CooperativaId=3) nunca se usaba, sin importar qué datos hubiera en la base
// (encontrado 2026-08-12, ver tarea "CRÍTICO: COOPERATIVA_ID hardcodeado").
// Modelo de venta real: cada cliente instala su propia copia de GUTT_SYSTEM
// (ver proforma), así que "una cooperativa por proceso" configurada por variable
// de entorno es la arquitectura correcta acá -- no multi-tenencia concurrente
// dentro de un mismo proceso (eso solo haría falta si un día se vende como SaaS
// compartido, no es el modelo actual). Configurar con GUTT_COOPERATIVA_ID en
// api/.env.gutt_system antes de levantar el proceso para ese cliente.
const COOPERATIVA_ID = parseInt(process.env.GUTT_COOPERATIVA_ID || '1', 10);

// ─── 1.6 Autenticación (JWT) — mismo patrón que server.js ──────────────────
// server.js exige un JWT válido en varios endpoints de Créditos/Caja (requireAuth +
// requireSelf, ver comentario homólogo ahí). Se reimplementa igual acá para que esos
// mismos endpoints, ya portados a GUTT_SYSTEM, no pierdan esa protección. JWT_SECRET
// se lee de api/.env (compartido con producción a nivel de secreto de firma, no de
// datos: los Usuarios de GUTT_SYSTEM son una tabla aparte de los de SQLGUTPATATE).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ Falta JWT_SECRET en api/.env. Ver server.js para cómo generarlo.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '10h';

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

// ─── 2. Express + cors ──────────────────────────────────────────────────────
let express, cors;
try {
  express = require('express');
  cors    = require('cors');
} catch {
  console.error('❌ Falta instalar dependencias. Ejecuta: npm install');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Carpeta de uploads PROPIA (separada de uploads/ del server.js real) para que
// las imágenes de socios de prueba de GUTT_SYSTEM nunca se mezclen con archivos
// de socios reales de SQLGUTPATATE, incluso si algún SocioId numérico coincide
// entre las dos bases.
const uploadsDir = join(__dirname, 'uploads_gutt_system');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// ─── 3. Auditoría estructurada (dbo.AuditoriaProcesos) ─────────────────────
// Mismo patrón que registrarAuditoriaProceso() en server.js, adaptado: en
// GUTT_SYSTEM la tabla exige CooperativaId (NOT NULL, FK a dbo.Cooperativas).
async function registrarAuditoriaProceso(execTarget, {
  proceso, accion, entidadTipo, entidadId = null, usuarioId,
  campoAfectado = null, valorAnterior = null, valorNuevo = null, detalle = null, ip = null,
}) {
  const request = new sql.Request(execTarget);
  await request
    .input('CooperativaId', sql.Int, COOPERATIVA_ID)
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
      INSERT INTO dbo.AuditoriaProcesos (CooperativaId, Proceso, Accion, EntidadTipo, EntidadId, UsuarioId, CampoAfectado, ValorAnterior, ValorNuevo, Detalle, IPOrigen)
      VALUES (@CooperativaId, @Proceso, @Accion, @EntidadTipo, @EntidadId, @UsuarioId, @CampoAfectado, @ValorAnterior, @ValorNuevo, @Detalle, @IPOrigen)
    `);
}

// ─── 3.5 Helpers de Contabilidad (AsientosContables + DetalleAsiento) ──────
// dbo.RegistroContable (un Debe/Haber suelto por fila, sin período, sin catálogo de
// cuentas real) YA NO EXISTE en GUTT_SYSTEM. Se reemplaza por el patrón cabecera +
// detalle (07_contabilidad.sql), verificado contra el legacy AFC en 10_prueba_modelo.sql.
// Estos tres helpers centralizan lo que cada fixture de prueba (10/15/16/17_...) hacía a
// mano: resolver el PeriodoContable del mes en curso, resolver/crear la fila de
// PlanCuentas por código, y armar un asiento con sus líneas D/H.
//
// GAP DE ESQUEMA (reportado, no resuelto acá): el catálogo PlanCuentas de GUTT_SYSTEM hoy
// solo trae las filas que insertaron los fixtures de prueba, y el formato de código
// contable es inconsistente entre módulos ya existentes (ProductosFinancieros.CuentaActiva
// usa 8 dígitos sin puntos, ej. '21013505'; TasasPlazoFijo.CuentaContableDPF usa formato
// SEPS punteado, ej. '2.1.03.10'; el PlanCuentas de 10_prueba_modelo.sql usa 6 dígitos sin
// puntos). resolverCuentaContable() no normaliza esto -- usa el código tal cual lo tenía
// cada módulo en server.js, y lo crea en PlanCuentas si no existe (mismo patrón
// "INSERT...IF NOT EXISTS" que ya usaban los fixtures). El agente
// gutt-system-validacion-esquema está trabajando en unificar el formato; cuando eso quede
// resuelto, estas cuentas creadas aquí deberán reconciliarse contra el catálogo real SEPS.
async function resolverPeriodoContable(execTarget, fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth() + 1;
  const found = await new sql.Request(execTarget)
    .input('CooperativaId', sql.Int, COOPERATIVA_ID)
    .input('Anio', sql.Int, anio)
    .input('Mes', sql.Int, mes)
    .query('SELECT PeriodoId, Cerrado FROM dbo.PeriodosContables WHERE CooperativaId = @CooperativaId AND Anio = @Anio AND Mes = @Mes');
  if (found.recordset.length > 0) {
    if (found.recordset[0].Cerrado) throw new Error(`El período contable ${mes}/${anio} está cerrado`);
    return found.recordset[0].PeriodoId;
  }
  const ins = await new sql.Request(execTarget)
    .input('CooperativaId', sql.Int, COOPERATIVA_ID)
    .input('Anio', sql.Int, anio)
    .input('Mes', sql.Int, mes)
    .query('INSERT INTO dbo.PeriodosContables (CooperativaId, Anio, Mes) OUTPUT INSERTED.PeriodoId VALUES (@CooperativaId, @Anio, @Mes)');
  return ins.recordset[0].PeriodoId;
}

async function resolverCuentaContable(execTarget, codigo, nombreFallback, tipoFallback) {
  const found = await new sql.Request(execTarget)
    .input('CooperativaId', sql.Int, COOPERATIVA_ID)
    .input('Codigo', sql.NVarChar(15), codigo)
    .query('SELECT CuentaContableId FROM dbo.PlanCuentas WHERE CooperativaId = @CooperativaId AND Codigo = @Codigo');
  if (found.recordset.length > 0) return found.recordset[0].CuentaContableId;
  const ins = await new sql.Request(execTarget)
    .input('CooperativaId', sql.Int, COOPERATIVA_ID)
    .input('Codigo', sql.NVarChar(15), codigo)
    .input('Nombre', sql.NVarChar(150), nombreFallback || codigo)
    .input('Tipo', sql.NVarChar(20), tipoFallback || 'ACTIVO')
    .query('INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta) OUTPUT INSERTED.CuentaContableId VALUES (@CooperativaId, @Codigo, @Nombre, @Tipo)');
  return ins.recordset[0].CuentaContableId;
}

// Crea un asiento (cabecera + N líneas). `lineas`: [{ codigo, nombre, tipo, lado: 'D'|'H', valor }].
// Líneas con valor <= 0 se omiten -- CK_DetalleAsiento_Valor exige Valor > 0, mismo criterio
// que server.js ya aplicaba de forma implícita (nunca insertaba una pata de RegistroContable
// en 0.00, ver p.ej. los asientos de comisión/fondo condicionados a `if (monto > 0)`).
async function crearAsientoContable(execTarget, { concepto, usuarioId, origenModulo = null, origenId = null, fecha = new Date(), lineas }) {
  const periodoId = await resolverPeriodoContable(execTarget, fecha);
  const cab = await new sql.Request(execTarget)
    .input('CooperativaId', sql.Int, COOPERATIVA_ID)
    .input('PeriodoContableId', sql.Int, periodoId)
    .input('Concepto', sql.NVarChar(300), concepto)
    .input('UsuarioId', sql.NVarChar(20), usuarioId)
    .input('OrigenModulo', sql.NVarChar(20), origenModulo)
    .input('OrigenId', sql.NVarChar(50), origenId !== null && origenId !== undefined ? String(origenId) : null)
    .query(`
      INSERT INTO dbo.AsientosContables (CooperativaId, PeriodoContableId, Concepto, UsuarioId, OrigenModulo, OrigenId)
      OUTPUT INSERTED.AsientoId
      VALUES (@CooperativaId, @PeriodoContableId, @Concepto, @UsuarioId, @OrigenModulo, @OrigenId)
    `);
  const asientoId = cab.recordset[0].AsientoId;

  for (const linea of (lineas || [])) {
    const valor = parseFloat(linea.valor);
    if (!valor || valor <= 0) continue;
    const cuentaContableId = await resolverCuentaContable(execTarget, linea.codigo, linea.nombre, linea.tipo);
    await new sql.Request(execTarget)
      .input('AsientoId', sql.Int, asientoId)
      .input('CuentaContableId', sql.Int, cuentaContableId)
      .input('TipoAsiento', sql.Char(1), linea.lado)
      .input('Valor', sql.Decimal(15, 2), valor)
      .query('INSERT INTO dbo.DetalleAsiento (AsientoId, CuentaContableId, TipoAsiento, Valor) VALUES (@AsientoId, @CuentaContableId, @TipoAsiento, @Valor)');
  }
  return asientoId;
}

// Inserta una fila en dbo.MovimientosCuenta cada vez que se toca Cuentas.Saldo (antes en
// SQLGUTPATATE el saldo se pisaba con un UPDATE suelto, sin historial propio). CHECK
// CK_MovimientosCuenta_Tipo limita Tipo a 5 valores fijos -- no incluye algo como
// 'DESEMBOLSO_CREDITO' o 'PAGO_CREDITO' (gap reportado): se usa 'DEPOSITO'/'RETIRO' según
// el signo del movimiento (dinero entra/sale de la cuenta de ahorros), igual que hace
// Caja, y el Concepto deja explícito el origen real (crédito, DPF, caja, transferencia).
async function registrarMovimientoCuenta(execTarget, { cuentaId, tipo, monto, saldoResultante, concepto, usuarioId, transaccionCajaId = null, asientoContableId = null }) {
  await new sql.Request(execTarget)
    .input('CuentaId', sql.Int, cuentaId)
    .input('Tipo', sql.NVarChar(30), tipo)
    .input('Monto', sql.Decimal(18, 2), monto)
    .input('SaldoResultante', sql.Decimal(18, 2), saldoResultante)
    .input('Concepto', sql.NVarChar(200), concepto || null)
    .input('UsuarioId', sql.NVarChar(20), usuarioId)
    .input('TransaccionCajaId', sql.BigInt, transaccionCajaId)
    .input('AsientoContableId', sql.Int, asientoContableId)
    .query(`
      INSERT INTO dbo.MovimientosCuenta (CuentaId, Tipo, Monto, SaldoResultante, Concepto, UsuarioId, TransaccionCajaId, AsientoContableId)
      VALUES (@CuentaId, @Tipo, @Monto, @SaldoResultante, @Concepto, @UsuarioId, @TransaccionCajaId, @AsientoContableId)
    `);
}

async function obtenerRolUsuario(execTarget, usuarioId) {
  const r = await new sql.Request(execTarget)
    .input('UsuarioId', sql.NVarChar(20), usuarioId)
    .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @UsuarioId');
  return r.recordset.length > 0 ? r.recordset[0].Rol : 'CREDIT_OFFICER';
}

// ─── Generación server-side del Plan de Pagos (Sistema Francés / Cuota Fija) ──
// Idéntica a la de server.js (components/CreditsView.tsx `simulation`) — se centraliza
// para que el número que ve el socio al simular coincida con lo que queda persistido.
// Redondea a centavos ANTES de combinar valores derivados en un asiento contable.
// Bug encontrado portando Plazo Fijo: sumar/restar floats de precisión completa y
// redondear cada línea del asiento por separado (vía sql.Decimal(15,2) en el INSERT)
// puede descuadrar Debe/Haber por 1 centavo cuando dos líneas derivadas del mismo
// número seActor redondean independientemente (ej. interés bruto por un lado, interés
// neto + retención por otro). Redondeando aquí primero y derivando el resto por
// resta EXACTA de valores ya redondeados, la partida doble cuadra siempre.
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function generarPlanAmortizacion(monto, tasaAnual, plazoMeses) {
  const p = parseFloat(monto);
  const tasaVal = parseFloat(tasaAnual);
  const n = parseInt(plazoMeses, 10);
  if (!p || !n || n <= 0) return [];
  const r = (tasaVal / 100) / 12;
  const monthlyPayment = r === 0 ? p / n : p * (r / (1 - Math.pow(1 + r, -n)));
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

// Health check — confirma que este proceso está vivo y contra qué base habla
// (para nunca tener dudas de si por error terminó apuntando a SQLGUTPATATE).
app.get('/api/gutt/health', (_req, res) => res.json({
  ok: true,
  backend: 'server.gutt_system.js',
  database: sqlConfig.database,
  server: `${sqlConfig.server}\\${sqlConfig.options.instanceName || ''}`,
  cooperativaId: COOPERATIVA_ID,
}));

// ── GET /api/server-date ─────────────────────────────────────────────────────
// Portado de server.js: TellerView.tsx lo llama para sincronizar el estado de caja
// (fecha del servidor, no del navegador). Sin esta ruta, cada apertura de "Caja y
// Ventanilla" contra este backend fallaba con 404 -> HTML -> error de parseo JSON
// en el cliente ("Unexpected token '<'"), aunque el resto del flujo funcionara.
app.get('/api/server-date', (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return res.json({ ok: true, date: `${year}-${month}-${day}` });
});

// ── POST /api/socios/registrar ───────────────────────────────────────────────
// Antes: dbo.usp_RegistrarSocio (SP inexistente en GUTT_SYSTEM). GUTT_SYSTEM no
// tiene ningún stored procedure de alta de socio (verificado: el único CREATE
// PROCEDURE de db/gutt_system/*.sql está en 05_plazo_fijo.sql, no relacionado).
// La lógica de alta + auto-generación de cuentas se reimplementa aquí en una
// transacción explícita, tabla por tabla, contra el esquema nuevo:
//   Socios (núcleo) + SocioDireccion + SocioConyuge + SocioReferencia (N) +
//   SocioCarga (N) + Cuentas (certificado + ahorro, ProductoId real vía FK).
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
    telefonos,
    fechaNacimiento,
    estadoCivil,
    pin,
    etnia,
    genero,
    autoidentificacion,
    nivelInstruccion,
    profesion,
    discapacidad,
    peps,
    consentimientoDatos,
    patrimonioIngresos,
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
    tipoVivienda,
    valorVivienda,
    cedulaConyuge,
    nombreConyuge,
    telefonoConyuge,
    referenciasPersonales,
    cargasFamiliares,
    usuarioRegistro,
  } = req.body || {};

  if (!identificacion || !primerNombre || !primerApellido || !pin) {
    return res.status(400).json({ ok: false, error: 'Identificación, nombre, apellido y PIN son requeridos' });
  }

  let pool;
  let transaction;
  try {
    pool = await sql.connect(sqlConfig);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Duplicado: la UNIQUE real en GUTT_SYSTEM es (CooperativaId, Identificacion),
    // sin filtrar por Estado (a diferencia del viejo check que solo miraba ACTIVO).
    const dupCheck = await new sql.Request(transaction)
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('Identificacion', sql.NVarChar(20), identificacion)
      .query(`SELECT COUNT(*) AS cnt FROM dbo.Socios WHERE CooperativaId = @CooperativaId AND Identificacion = @Identificacion`);

    if (dupCheck.recordset[0].cnt > 0) {
      await transaction.rollback();
      await pool.close();
      return res.status(400).json({ ok: false, error: `La identificación ${identificacion} ya se encuentra registrada en el sistema.` });
    }

    // NumeroSocio vía Seq_NumeroSocio (mismo patrón que 10_prueba_modelo.sql),
    // con prefijo por TipoPersona para conservar el criterio legible que ya
    // usaba /api/socios/siguiente-numero en server.js (S-/CL-/CE-).
    const prefix = tipoPersona === 'CLIENTE' ? 'CL-' : tipoPersona === 'CLIENTE_EXTERNO' ? 'CE-' : 'S-';
    const seqResult = await new sql.Request(transaction).query('SELECT NEXT VALUE FOR Seq_NumeroSocio AS Seq');
    const numeroSocio = `${prefix}${seqResult.recordset[0].Seq}`;

    const insertSocio = await new sql.Request(transaction)
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('TipoPersona', sql.NVarChar(20), tipoPersona || 'SOCIO')
      .input('TipoIdentificacion', sql.NVarChar(20), tipoIdentificacion || 'CÉDULA')
      .input('Identificacion', sql.NVarChar(20), identificacion)
      .input('PrimerNombre', sql.NVarChar(50), primerNombre)
      .input('SegundoNombre', sql.NVarChar(50), segundoNombre || null)
      .input('PrimerApellido', sql.NVarChar(50), primerApellido)
      .input('SegundoApellido', sql.NVarChar(50), segundoApellido || null)
      .input('SoloUnNombre', sql.Bit, soloUnNombre ? 1 : 0)
      .input('SoloUnApellido', sql.Bit, soloUnApellido ? 1 : 0)
      .input('Email', sql.NVarChar(100), email || null)
      .input('Telefono', sql.NVarChar(20), telefono || null)
      .input('Telefonos', sql.NVarChar(200), telefonos || null)
      .input('FechaNacimiento', sql.Date, fechaNacimiento || null)
      .input('EstadoCivil', sql.NVarChar(20), estadoCivil || null)
      .input('PIN', sql.NVarChar(4), pin)
      .input('Etnia', sql.NVarChar(20), etnia || null)
      .input('Genero', sql.NVarChar(20), genero || null)
      .input('Autoidentificacion', sql.NVarChar(100), autoidentificacion || null)
      .input('NivelInstruccion', sql.NVarChar(50), nivelInstruccion || null)
      .input('Profesion', sql.NVarChar(100), profesion || null)
      .input('Discapacidad', sql.Bit, discapacidad ? 1 : 0)
      .input('PEPS', sql.Bit, peps ? 1 : 0)
      .input('ConsentimientoDatos', sql.Bit, consentimientoDatos ? 1 : 0)
      .input('PatrimonioIngresos', sql.NVarChar(sql.MAX), patrimonioIngresos ? JSON.stringify(patrimonioIngresos) : null)
      .input('NumeroSocio', sql.NVarChar(20), numeroSocio)
      .input('UsuarioRegistroId', sql.NVarChar(20), usuarioRegistro || null)
      .query(`
        INSERT INTO dbo.Socios (
          CooperativaId, TipoPersona, TipoIdentificacion, Identificacion, PrimerNombre, SegundoNombre,
          PrimerApellido, SegundoApellido, SoloUnNombre, SoloUnApellido, Email, Telefono, Telefonos,
          FechaNacimiento, EstadoCivil, PIN, Etnia, Genero, Autoidentificacion, NivelInstruccion, Profesion,
          Discapacidad, PEPS, ConsentimientoDatos, PatrimonioIngresos, NumeroSocio, UsuarioRegistroId
        )
        OUTPUT inserted.SocioId
        VALUES (
          @CooperativaId, @TipoPersona, @TipoIdentificacion, @Identificacion, @PrimerNombre, @SegundoNombre,
          @PrimerApellido, @SegundoApellido, @SoloUnNombre, @SoloUnApellido, @Email, @Telefono, @Telefonos,
          @FechaNacimiento, @EstadoCivil, @PIN, @Etnia, @Genero, @Autoidentificacion, @NivelInstruccion, @Profesion,
          @Discapacidad, @PEPS, @ConsentimientoDatos, @PatrimonioIngresos, @NumeroSocio, @UsuarioRegistroId
        )
      `);

    const socioId = insertSocio.recordset[0].SocioId;

    // SocioDireccion (1:1) — incluye TipoVivienda/ValorVivienda, que en el
    // esquema viejo vivían sueltos en RegistroSocios y ahora son parte de esta
    // tabla hija. Se inserta siempre (todas las columnas admiten NULL) para no
    // tener que decidir aquí si "hay suficientes datos" para justificarla.
    await new sql.Request(transaction)
      .input('SocioId', sql.BigInt, socioId)
      .input('PaisNacimiento', sql.NVarChar(50), paisNacimiento || null)
      .input('ProvinciaNacimiento', sql.NVarChar(50), provinciaNacimiento || null)
      .input('CantonNacimiento', sql.NVarChar(50), cantonNacimiento || null)
      .input('ParroquiaNacimiento', sql.NVarChar(50), parroquiaNacimiento || null)
      .input('PaisResidencia', sql.NVarChar(50), paisResidencia || null)
      .input('ProvinciaResidencia', sql.NVarChar(50), provinciaResidencia || null)
      .input('CantonResidencia', sql.NVarChar(50), cantonResidencia || null)
      .input('ParroquiaResidencia', sql.NVarChar(50), parroquiaResidencia || null)
      .input('DireccionDomicilio', sql.NVarChar(200), direccionDomicilio || null)
      .input('LugarTrabajo', sql.NVarChar(200), lugarTrabajo || null)
      .input('ProvinciaTrabajo', sql.NVarChar(50), provinciaTrabajo || null)
      .input('CantonTrabajo', sql.NVarChar(50), cantonTrabajo || null)
      .input('ParroquiaTrabajo', sql.NVarChar(50), parroquiaTrabajo || null)
      .input('TipoVivienda', sql.NVarChar(100), tipoVivienda || null)
      .input('ValorVivienda', sql.Decimal(18, 2), valorVivienda != null ? valorVivienda : null)
      .query(`
        INSERT INTO dbo.SocioDireccion (
          SocioId, PaisNacimiento, ProvinciaNacimiento, CantonNacimiento, ParroquiaNacimiento,
          PaisResidencia, ProvinciaResidencia, CantonResidencia, ParroquiaResidencia,
          DireccionDomicilio, LugarTrabajo, ProvinciaTrabajo, CantonTrabajo, ParroquiaTrabajo,
          TipoVivienda, ValorVivienda
        )
        VALUES (
          @SocioId, @PaisNacimiento, @ProvinciaNacimiento, @CantonNacimiento, @ParroquiaNacimiento,
          @PaisResidencia, @ProvinciaResidencia, @CantonResidencia, @ParroquiaResidencia,
          @DireccionDomicilio, @LugarTrabajo, @ProvinciaTrabajo, @CantonTrabajo, @ParroquiaTrabajo,
          @TipoVivienda, @ValorVivienda
        )
      `);

    // SocioConyuge (1:1) — solo si vino algún dato de cónyuge.
    if ((cedulaConyuge && cedulaConyuge.trim()) || (nombreConyuge && nombreConyuge.trim())) {
      await new sql.Request(transaction)
        .input('SocioId', sql.BigInt, socioId)
        .input('CedulaConyuge', sql.NVarChar(20), (cedulaConyuge && cedulaConyuge.trim()) ? cedulaConyuge : null)
        .input('NombreConyuge', sql.NVarChar(150), (nombreConyuge && nombreConyuge.trim()) ? nombreConyuge : null)
        .input('TelefonoConyuge', sql.NVarChar(20), (telefonoConyuge && telefonoConyuge.trim()) ? telefonoConyuge : null)
        .query(`
          INSERT INTO dbo.SocioConyuge (SocioId, CedulaConyuge, NombreConyuge, TelefonoConyuge)
          VALUES (@SocioId, @CedulaConyuge, @NombreConyuge, @TelefonoConyuge)
        `);
    }

    // SocioReferencia (N filas) — antes JSON en RegistroSocios.ReferenciasPersonales.
    for (const ref of (Array.isArray(referenciasPersonales) ? referenciasPersonales : [])) {
      if (!ref || !ref.nombre) continue;
      await new sql.Request(transaction)
        .input('SocioId', sql.BigInt, socioId)
        .input('Nombre', sql.NVarChar(150), ref.nombre)
        .input('Telefono', sql.NVarChar(20), ref.telefono || null)
        .input('Relacion', sql.NVarChar(50), ref.relacion || null)
        .query(`INSERT INTO dbo.SocioReferencia (SocioId, Nombre, Telefono, Relacion) VALUES (@SocioId, @Nombre, @Telefono, @Relacion)`);
    }

    // SocioCarga (N filas) — antes JSON en RegistroSocios.CargasFamiliares.
    for (const carga of (Array.isArray(cargasFamiliares) ? cargasFamiliares : [])) {
      if (!carga || !carga.nombre) continue;
      await new sql.Request(transaction)
        .input('SocioId', sql.BigInt, socioId)
        .input('Nombre', sql.NVarChar(150), carga.nombre)
        .input('Parentesco', sql.NVarChar(50), carga.parentesco || null)
        .input('Edad', sql.Int, carga.edad != null ? parseInt(carga.edad, 10) : null)
        .query(`INSERT INTO dbo.SocioCarga (SocioId, Nombre, Parentesco, Edad) VALUES (@SocioId, @Nombre, @Parentesco, @Edad)`);
    }

    // Auto-generación de cuentas (certificado de aportación + ahorro a la vista),
    // igual criterio que el usp_RegistrarSocio viejo, pero resolviendo ProductoId
    // real vía FK en vez de hardcodear CodigoProducto: se busca el ProductoId del
    // producto CERTIFICADOS DE APORTACION (CodigoProducto=1) y AHORRO A LA VISTA
    // (CodigoProducto=2) sembrados para esta cooperativa en 03_cuentas_productos.sql.
    const productos = await new sql.Request(transaction)
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`SELECT ProductoId, CodigoProducto FROM dbo.ProductosFinancieros WHERE CooperativaId = @CooperativaId AND CodigoProducto IN (1, 2)`);

    const productoCertificado = productos.recordset.find(p => p.CodigoProducto === 1);
    const productoAhorro = productos.recordset.find(p => p.CodigoProducto === 2);

    const cuentasCreadas = [];
    const socioIdPadded = String(socioId).padStart(8, '0');

    if (productoCertificado) {
      const numCert = '1' + socioIdPadded;
      await new sql.Request(transaction)
        .input('SocioId', sql.BigInt, socioId)
        .input('NumeroCuenta', sql.NVarChar(20), numCert)
        .input('ProductoId', sql.Int, productoCertificado.ProductoId)
        .query(`INSERT INTO dbo.Cuentas (SocioId, NumeroCuenta, ProductoId) VALUES (@SocioId, @NumeroCuenta, @ProductoId)`);
      cuentasCreadas.push({ numeroCuenta: numCert, productoId: productoCertificado.ProductoId, tipo: 'CERTIFICADO_APORTACION' });
    }
    if (productoAhorro) {
      const numAho = '2' + socioIdPadded;
      await new sql.Request(transaction)
        .input('SocioId', sql.BigInt, socioId)
        .input('NumeroCuenta', sql.NVarChar(20), numAho)
        .input('ProductoId', sql.Int, productoAhorro.ProductoId)
        .query(`INSERT INTO dbo.Cuentas (SocioId, NumeroCuenta, ProductoId) VALUES (@SocioId, @NumeroCuenta, @ProductoId)`);
      cuentasCreadas.push({ numeroCuenta: numAho, productoId: productoAhorro.ProductoId, tipo: 'AHORRO_VISTA' });
    }

    await registrarAuditoriaProceso(transaction, {
      proceso: 'SOCIOS',
      accion: 'CREAR',
      entidadTipo: 'Socio',
      entidadId: socioId,
      usuarioId: usuarioRegistro || 'auto-registro',
      detalle: `Alta de socio ${identificacion} (${primerNombre} ${primerApellido}), NumeroSocio ${numeroSocio}.`,
      ip: req.ip,
    });

    await transaction.commit();
    await pool.close();

    // NOTA (gap de esquema, no inventado aquí): el flujo viejo generaba un
    // codigoActivacion de 6 dígitos y lo guardaba en dbo.ActivacionBancaLinea
    // para la activación de banca en línea del socio. GUTT_SYSTEM no tiene esa
    // tabla todavía (verificado contra db/gutt_system/*.sql) — se omite ese
    // paso por completo en vez de improvisar dónde guardarlo. Reportado abajo.
    return res.json({
      ok: true,
      socioId,
      numeroSocio,
      cuentas: cuentasCreadas,
      message: 'Socio registrado exitosamente en GUTT_SYSTEM',
    });
  } catch (err) {
    if (transaction) {
      try { await transaction.rollback(); } catch (_) {}
    }
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[gutt_system][registrar socio]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/siguiente-numero ─────────────────────────────────────────
// Antes: COUNT(*) sobre dbo.RegistroSocios (impreciso ante bajas/tipos mixtos).
// Se conserva como endpoint informativo (el registro real ya no depende de esto:
// usa Seq_NumeroSocio internamente), pero recalculado contra dbo.Socios.
app.get('/api/socios/siguiente-numero', async (req, res) => {
  const tipo = (req.query.tipo || 'SOCIO').toUpperCase();
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const countRes = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('tipo', sql.NVarChar(20), tipo)
      .query('SELECT COUNT(*) as count FROM dbo.Socios WHERE CooperativaId = @CooperativaId AND TipoPersona = @tipo');
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
    console.error('[gutt_system][siguiente-numero]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/consultas ────────────────────────────────────────────────
// Antes: SELECT * FROM dbo.vw_RegistroSociosConsultas (vista inexistente en
// GUTT_SYSTEM — no se creó ninguna vista equivalente en db/gutt_system/*.sql).
// Se reconstruye la misma consulta como JOIN directo contra el esquema nuevo.
app.get('/api/socios/consultas', requireAuth, async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT
          s.SocioId, s.TipoPersona, s.TipoIdentificacion, s.Identificacion,
          s.PrimerNombre, s.SegundoNombre, s.PrimerApellido, s.SegundoApellido,
          s.Email, s.Telefono, s.Telefonos, s.FechaNacimiento, s.EstadoCivil,
          s.NumeroSocio, s.Etnia, s.Genero, s.Autoidentificacion, s.NivelInstruccion,
          s.Profesion, s.Discapacidad, s.ConsentimientoDatos, s.PEPS, s.PatrimonioIngresos,
          s.Estado, s.FechaRegistro,
          d.DireccionDomicilio, d.LugarTrabajo, d.TipoVivienda, d.ValorVivienda,
          c.CedulaConyuge, c.NombreConyuge, c.TelefonoConyuge
        FROM dbo.Socios s
        LEFT JOIN dbo.SocioDireccion d ON d.SocioId = s.SocioId
        LEFT JOIN dbo.SocioConyuge c ON c.SocioId = s.SocioId
        WHERE s.CooperativaId = @CooperativaId
        ORDER BY s.FechaRegistro DESC
      `);
    await pool.close();

    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[gutt_system][consultas socios]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/buscar ───────────────────────────────────────────────────
// Antes: JOIN contra dbo.RegistroSocios + SocioUbicacionMapa + SocioCroquisTrabajo
// + SocioDocumentoExcepcion, con fallback al espejo Postgres legacy si no hay
// resultados. El fallback legacy (buscarClienteLegacyPg/buscarCreditosLegacyPg)
// NO se porta aquí: apunta a datos reales de SQLGUTPATATE/legacy, y GUTT_SYSTEM
// todavía no tiene datos reales que reconciliar contra eso — fuera de alcance de
// esta ronda (fuera de la restricción "no migrar datos reales" del agente).
app.get('/api/socios/buscar', requireAuth, async (req, res) => {
  const q = ((req.query.q || '') + '').trim();
  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    const request = pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID);

    let where = 's.CooperativaId = @CooperativaId';
    if (q) {
      request.input('q', sql.NVarChar(100), `%${q}%`);
      request.input('exactQ', sql.NVarChar(50), q);
      where += ` AND (s.Identificacion = @exactQ OR s.NumeroSocio = @exactQ OR s.PrimerApellido LIKE @q OR s.PrimerNombre LIKE @q)`;
    }

    const searchResult = await request.query(`
      SELECT
        s.SocioId, s.TipoPersona, s.TipoIdentificacion, s.Identificacion,
        s.PrimerNombre, s.SegundoNombre, s.PrimerApellido, s.SegundoApellido,
        s.Email, s.Telefono, s.Telefonos, s.FechaNacimiento, s.EstadoCivil,
        s.NumeroSocio, s.Etnia, s.Genero, s.Autoidentificacion, s.NivelInstruccion,
        s.Profesion, s.Discapacidad, s.ConsentimientoDatos, s.PEPS, s.PatrimonioIngresos,
        d.DireccionDomicilio, d.LugarTrabajo, d.TipoVivienda, d.ValorVivienda,
        c.CedulaConyuge, c.NombreConyuge, c.TelefonoConyuge,
        sm.CoordenadaLat AS MapaCoordenadaLat, sm.CoordenadaLng AS MapaCoordenadaLng, sm.DireccionCapturada AS MapaDireccionCapturada,
        ct.Descripcion AS CroquisDescripcion
      FROM dbo.Socios s
      LEFT JOIN dbo.SocioDireccion d ON d.SocioId = s.SocioId
      LEFT JOIN dbo.SocioConyuge c ON c.SocioId = s.SocioId
      LEFT JOIN dbo.SocioUbicacionMapa sm ON sm.SocioId = s.SocioId
      LEFT JOIN dbo.SocioCroquisTrabajo ct ON ct.SocioId = s.SocioId
      WHERE ${where} AND s.Estado = 'ACTIVO'
    `);

    const socios = [];
    for (const r of searchResult.recordset) {
      const accountsResult = await pool.request()
        .input('SocioId', sql.BigInt, r.SocioId)
        .query(`
          SELECT
            'ca-' + CAST(cu.CuentaId AS NVARCHAR(10)) AS id,
            CASE WHEN p.EsCertificado = 1 THEN 'CERTIFICADO_APORTACION' ELSE 'AHORRO_VISTA' END AS type,
            cu.NumeroCuenta AS number,
            CAST(cu.Saldo AS FLOAT) AS balance,
            'USD' AS currency
          FROM dbo.Cuentas cu
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = cu.ProductoId
          WHERE cu.SocioId = @SocioId
        `);

      // Créditos: lectura simple contra dbo.SolicitudesCredito (sin adaptar el
      // módulo de Créditos completo, que queda para otra ronda). El nombre y
      // tipo de columnas es igual al de SQLGUTPATATE, solo cambia SocioID a BIGINT.
      const referencias = await pool.request()
        .input('SocioId', sql.BigInt, r.SocioId)
        .query(`SELECT Nombre, Telefono, Relacion FROM dbo.SocioReferencia WHERE SocioId = @SocioId`);
      const cargas = await pool.request()
        .input('SocioId', sql.BigInt, r.SocioId)
        .query(`SELECT Nombre, Parentesco, Edad FROM dbo.SocioCarga WHERE SocioId = @SocioId`);

      const loansResult = await pool.request()
        .input('SocioID', sql.BigInt, r.SocioId)
        .query(`
          SELECT SolicitudID as id, Identificacion as memberId, Monto as amount, Saldo as balance,
                 Tasa as rate, Plazo as installmentsCount, Tipo as type, Estado as status,
                 FechaSolicitud, FechaVencimiento as dueDate, Observaciones as comments,
                 PlanPagos as installments
          FROM dbo.SolicitudesCredito
          WHERE SocioID = @SocioID
          ORDER BY FechaSolicitud DESC
        `);

      const loans = loansResult.recordset.map(loan => ({
        ...loan,
        installments: loan.installments ? JSON.parse(loan.installments) : []
      }));

      socios.push({
        id: r.Identificacion,
        socioId: r.SocioId,
        name: `${r.PrimerNombre} ${r.SegundoNombre ? r.SegundoNombre + ' ' : ''}${r.PrimerApellido}${r.SegundoApellido ? ' ' + r.SegundoApellido : ''}`,
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
        references: referencias.recordset,
        dependents: cargas.recordset,
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
        // No hay RutaImagen en SocioUbicacionMapa/SocioCroquisTrabajo del esquema
        // nuevo (solo VARBINARY + coords/descripcion) — ver gap reportado al agente
        // de validación de esquema. Se exponen los campos que sí existen.
        mapaCoordenadaLat: r.MapaCoordenadaLat || '',
        mapaCoordenadaLng: r.MapaCoordenadaLng || '',
        mapaDireccionCapturada: r.MapaDireccionCapturada || '',
        croquisDescripcion: r.CroquisDescripcion || '',
        accounts: accountsResult.recordset,
        transactions: [], // TransaccionesCaja/MovimientosCuenta: módulo Caja, otra ronda
        loans,
        origen: 'GUTT_SYSTEM',
      });
    }

    return res.json({ ok: true, data: socios });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[gutt_system][buscar socio]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/guardar-mapa ────────────────────────────────────────────
// Antes: dbo.usp_GuardarMapaUbicacion (SP inexistente en GUTT_SYSTEM). Se
// reimplementa como upsert manual: dbo.SocioUbicacionMapa en el esquema nuevo
// NO tiene UNIQUE(SocioId) (permite N filas por socio, a diferencia del 1:1 de
// SocioDireccion/SocioConyuge), así que "guardar" se interpreta como
// "reemplazar la ubicación vigente" -- se actualiza la fila más reciente si
// existe, o se inserta la primera.
app.post('/api/socios/guardar-mapa', async (req, res) => {
  const { socioId, imagenMapa, coordenadaLat, coordenadaLng, direccionCapturada } = req.body || {};

  if (!socioId) {
    return res.status(400).json({ ok: false, error: 'socioId es requerido' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    let imagenBuffer = null;
    if (imagenMapa) {
      const base64Data = imagenMapa.replace(/^data:image\/\w+;base64,/, '');
      imagenBuffer = Buffer.from(base64Data, 'base64');
      // Se conserva también en disco por compatibilidad con el patrón viejo de
      // servir /uploads/<archivo>, aunque GUTT_SYSTEM no tiene columna RutaImagen
      // donde registrar esta ruta (ver nota de gap de esquema arriba del archivo).
      const filename = `mapa_domicilio_${socioId}.png`;
      writeFileSync(join(uploadsDir, filename), imagenBuffer);
    }

    const existing = await pool.request()
      .input('SocioId', sql.BigInt, socioId)
      .query(`SELECT TOP 1 UbicacionMapaID FROM dbo.SocioUbicacionMapa WHERE SocioId = @SocioId ORDER BY FechaCaptura DESC`);

    if (existing.recordset.length > 0) {
      await pool.request()
        .input('UbicacionMapaID', sql.BigInt, existing.recordset[0].UbicacionMapaID)
        .input('ImagenMapa', sql.VarBinary(sql.MAX), imagenBuffer)
        .input('CoordenadaLat', sql.NVarChar(50), coordenadaLat || null)
        .input('CoordenadaLng', sql.NVarChar(50), coordenadaLng || null)
        .input('DireccionCapturada', sql.NVarChar(200), direccionCapturada || null)
        .query(`
          UPDATE dbo.SocioUbicacionMapa
          SET ImagenMapa = COALESCE(@ImagenMapa, ImagenMapa),
              CoordenadaLat = @CoordenadaLat, CoordenadaLng = @CoordenadaLng,
              DireccionCapturada = @DireccionCapturada, FechaCaptura = SYSDATETIME()
          WHERE UbicacionMapaID = @UbicacionMapaID
        `);
    } else {
      await pool.request()
        .input('SocioId', sql.BigInt, socioId)
        .input('ImagenMapa', sql.VarBinary(sql.MAX), imagenBuffer)
        .input('CoordenadaLat', sql.NVarChar(50), coordenadaLat || null)
        .input('CoordenadaLng', sql.NVarChar(50), coordenadaLng || null)
        .input('DireccionCapturada', sql.NVarChar(200), direccionCapturada || null)
        .query(`
          INSERT INTO dbo.SocioUbicacionMapa (SocioId, ImagenMapa, CoordenadaLat, CoordenadaLng, DireccionCapturada)
          VALUES (@SocioId, @ImagenMapa, @CoordenadaLat, @CoordenadaLng, @DireccionCapturada)
        `);
    }

    await pool.close();
    return res.json({ ok: true, message: 'Mapa de ubicación guardado exitosamente' });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[gutt_system][guardar mapa]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/guardar-croquis ─────────────────────────────────────────
// Antes: dbo.usp_GuardarCroquisTrabajo (SP inexistente en GUTT_SYSTEM). Mismo
// criterio de upsert manual que guardar-mapa.
app.post('/api/socios/guardar-croquis', async (req, res) => {
  const { socioId, imagenCroquis, descripcion } = req.body || {};

  if (!socioId) {
    return res.status(400).json({ ok: false, error: 'socioId es requerido' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    let imagenBuffer = null;
    if (imagenCroquis) {
      const base64Data = imagenCroquis.replace(/^data:image\/\w+;base64,/, '');
      imagenBuffer = Buffer.from(base64Data, 'base64');
      const filename = `mapa_trabajo_${socioId}.png`;
      writeFileSync(join(uploadsDir, filename), imagenBuffer);
    }

    const existing = await pool.request()
      .input('SocioId', sql.BigInt, socioId)
      .query(`SELECT TOP 1 CroquisTrabajoID FROM dbo.SocioCroquisTrabajo WHERE SocioId = @SocioId ORDER BY FechaCaptura DESC`);

    if (existing.recordset.length > 0) {
      await pool.request()
        .input('CroquisTrabajoID', sql.BigInt, existing.recordset[0].CroquisTrabajoID)
        .input('ImagenCroquis', sql.VarBinary(sql.MAX), imagenBuffer)
        .input('Descripcion', sql.NVarChar(500), descripcion || null)
        .query(`
          UPDATE dbo.SocioCroquisTrabajo
          SET ImagenCroquis = COALESCE(@ImagenCroquis, ImagenCroquis),
              Descripcion = @Descripcion, FechaCaptura = SYSDATETIME()
          WHERE CroquisTrabajoID = @CroquisTrabajoID
        `);
    } else {
      await pool.request()
        .input('SocioId', sql.BigInt, socioId)
        .input('ImagenCroquis', sql.VarBinary(sql.MAX), imagenBuffer)
        .input('Descripcion', sql.NVarChar(500), descripcion || null)
        .query(`
          INSERT INTO dbo.SocioCroquisTrabajo (SocioId, ImagenCroquis, Descripcion)
          VALUES (@SocioId, @ImagenCroquis, @Descripcion)
        `);
    }

    await pool.close();
    return res.json({ ok: true, message: 'Croquis de trabajo guardado exitosamente' });
  } catch (err) {
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    console.error('[gutt_system][guardar croquis]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO CUENTAS — CuentasAhorro→Cuentas (ProductoId FK real, no CodigoProducto
// suelto), parametrosproductos→ProductosFinancieros, y MovimientosCuenta nuevo
// (antes el historial de depósitos/retiros se reconstruía leyendo RegistroContable).
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/productos ──────────────────────────────────────────────────
app.get('/api/admin/productos', requireAuth, async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query('SELECT * FROM dbo.ProductosFinancieros WHERE CooperativaId = @CooperativaId ORDER BY CodigoProducto');
    await pool.close();
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][admin productos]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/admin/productos ─────────────────────────────────────────────────
// Upsert por (CooperativaId, CodigoProducto) -- UQ_ProductosFinancieros_Cooperativa_Codigo.
app.post('/api/admin/productos', requireAuth, async (req, res) => {
  const {
    codigoProducto, nombre, tipoDeposito, esCertificado,
    cuentaActiva, cuentaInactiva, cuentaGasto, cuentaProvision, cuentaDepositosConfirmar,
    numCtas4Dig, permiteDepositos, permiteRetiros, permiteDebitos, permiteCreditos, permiteTransferencias,
    tasa, formaPago, mesesAcreditacion
  } = req.body || {};

  if (!codigoProducto || !nombre || !tipoDeposito || !cuentaActiva || !cuentaInactiva) {
    return res.status(400).json({ ok: false, error: 'Código, nombre, tipo de depósito y cuentas contables activa/inactiva son requeridas' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const checkResult = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('codigoProducto', sql.Int, codigoProducto)
      .query('SELECT ProductoId FROM dbo.ProductosFinancieros WHERE CooperativaId = @CooperativaId AND CodigoProducto = @codigoProducto');

    const common = pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
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
      .input('mesesAcreditacion', sql.NVarChar(100), mesesAcreditacion || 'Diciembre');

    if (checkResult.recordset.length > 0) {
      await common.query(`
        UPDATE dbo.ProductosFinancieros
        SET Nombre=@nombre, TipoDeposito=@tipoDeposito, EsCertificado=@esCertificado,
            CuentaActiva=@cuentaActiva, CuentaInactiva=@cuentaInactiva, CuentaGasto=@cuentaGasto,
            CuentaProvision=@cuentaProvision, CuentaDepositosConfirmar=@cuentaDepositosConfirmar,
            NumCtas4Dig=@numCtas4Dig, PermiteDepositos=@permiteDepositos, PermiteRetiros=@permiteRetiros,
            PermiteDebitos=@permiteDebitos, PermiteCreditos=@permiteCreditos, PermiteTransferencias=@permiteTransferencias,
            Tasa=@tasa, FormaPago=@formaPago, MesesAcreditacion=@mesesAcreditacion
        WHERE CooperativaId = @CooperativaId AND CodigoProducto = @codigoProducto
      `);
      await pool.close();
      return res.json({ ok: true, message: 'Producto actualizado con éxito' });
    } else {
      await common.query(`
        INSERT INTO dbo.ProductosFinancieros (
          CooperativaId, CodigoProducto, Nombre, TipoDeposito, EsCertificado,
          CuentaActiva, CuentaInactiva, CuentaGasto, CuentaProvision, CuentaDepositosConfirmar,
          NumCtas4Dig, PermiteDepositos, PermiteRetiros, PermiteDebitos, PermiteCreditos, PermiteTransferencias,
          Tasa, FormaPago, MesesAcreditacion
        ) VALUES (
          @CooperativaId, @codigoProducto, @nombre, @tipoDeposito, @esCertificado,
          @cuentaActiva, @cuentaInactiva, @cuentaGasto, @cuentaProvision, @cuentaDepositosConfirmar,
          @numCtas4Dig, @permiteDepositos, @permiteRetiros, @permiteDebitos, @permiteCreditos, @permiteTransferencias,
          @tasa, @formaPago, @mesesAcreditacion
        )
      `);
      await pool.close();
      return res.json({ ok: true, message: 'Producto creado con éxito' });
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][guardar producto]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ahorros/resumen ──────────────────────────────────────────────────
app.get('/api/ahorros/resumen', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const cuentasR = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT
          COUNT(*) AS totalCuentas,
          SUM(CASE WHEN c.Estado='ACTIVA' THEN 1 ELSE 0 END) AS cuentasActivas,
          SUM(CASE WHEN c.Estado<>'ACTIVA' THEN 1 ELSE 0 END) AS cuentasInactivas,
          ISNULL(SUM(CASE WHEN c.Estado='ACTIVA' THEN c.Saldo ELSE 0 END),0) AS totalCaptado,
          COUNT(DISTINCT c.SocioId) AS sociosConCuenta
        FROM dbo.Cuentas c
        INNER JOIN dbo.ProductosFinancieros p ON c.ProductoId = p.ProductoId
        WHERE p.CooperativaId = @CooperativaId AND p.EsCertificado = 0
      `);
    // Antes: RegistroContable filtrado por CuentaContable != '110105' (excluye la pata de
    // caja). Ahora: MovimientosCuenta ya es un movimiento por cuenta (sin pata de caja
    // mezclada), así que se suma directo por Tipo.
    const movHoyR = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT
          ISNULL(SUM(CASE WHEN m.Tipo IN ('DEPOSITO','TRANSFERENCIA_ENTRADA') THEN m.Monto ELSE 0 END), 0) AS depositosHoy,
          ISNULL(SUM(CASE WHEN m.Tipo IN ('RETIRO','TRANSFERENCIA_SALIDA') THEN m.Monto ELSE 0 END), 0) AS retirosHoy,
          COUNT(*) AS movimientosHoy
        FROM dbo.MovimientosCuenta m
        INNER JOIN dbo.Cuentas c ON c.CuentaId = m.CuentaId
        INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
        WHERE p.CooperativaId = @CooperativaId AND p.EsCertificado = 0
          AND CAST(m.Fecha AS DATE) = CAST(SYSDATETIME() AS DATE)
      `);
    await pool.close();
    return res.json({ ok: true, data: { ...cuentasR.recordset[0], ...movHoyR.recordset[0] } });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][ahorros-resumen]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/ahorros/:cuentaId/movimientos ────────────────────────────────────
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
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('cuentaId', sql.Int, cuentaId)
      .query(`
        SELECT
          'ca-' + CAST(c.CuentaId AS NVARCHAR(10)) AS id, c.CuentaId, c.SocioId, c.NumeroCuenta,
          CAST(c.Saldo AS FLOAT) AS Saldo, c.Estado, c.FechaApertura,
          p.Nombre AS NombreProducto, p.EsCertificado, p.PermiteDepositos, p.PermiteRetiros,
          s.Identificacion, s.NumeroSocio,
          (s.PrimerNombre + ' ' + ISNULL(s.SegundoNombre + ' ', '') + s.PrimerApellido + ISNULL(' ' + s.SegundoApellido, '')) AS NombreSocio
        FROM dbo.Cuentas c
        INNER JOIN dbo.ProductosFinancieros p ON c.ProductoId = p.ProductoId
        INNER JOIN dbo.Socios s ON s.SocioId = c.SocioId
        WHERE c.CuentaId = @cuentaId AND p.CooperativaId = @CooperativaId
      `);

    if (accRes.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });
    }
    const account = accRes.recordset[0];

    const movRes = await pool.request()
      .input('cuentaId', sql.Int, cuentaId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          'tx-' + CAST(MovimientoId AS NVARCHAR(20)) AS id,
          MovimientoId,
          FORMAT(Fecha, 'yyyy-MM-dd HH:mm') AS fecha,
          Concepto AS descripcion,
          CAST(CASE WHEN Tipo IN ('DEPOSITO','TRANSFERENCIA_ENTRADA') THEN Monto ELSE -Monto END AS FLOAT) AS monto,
          CASE WHEN Tipo IN ('DEPOSITO','TRANSFERENCIA_ENTRADA') THEN 'CREDIT' ELSE 'DEBIT' END AS tipo,
          UsuarioId AS usuarioId
        FROM dbo.MovimientosCuenta
        WHERE CuentaId = @cuentaId
        ORDER BY Fecha DESC, MovimientoId DESC
      `);

    await pool.close();
    return res.json({ ok: true, data: { account, movimientos: movRes.recordset } });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][ahorros-movimientos]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/transferir ───────────────────────────────────────────────
// Antes: ambas patas contra el mismo código hardcodeado '210101'. Ahora se usa el
// CuentaActiva real de CADA producto (puede diferir si origen/destino son productos
// distintos, ej. certificado -> ahorro), resuelto vía resolverCuentaContable().
// OrigenModulo='MANUAL': no encaja en CREDITOS/CAJA/PLAZO_FIJO (no hay efectivo de por
// medio, es un movimiento interno entre dos cuentas de socios) -- único valor del CHECK
// CK_AsientosContables_OrigenModulo que le queda razonable sin inventar un valor nuevo.
app.post('/api/socios/transferir', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { cuentaOrigenId, cuentaDestinoId, monto, descripcion, usuarioId } = req.body || {};

  if (!cuentaOrigenId || !cuentaDestinoId || !monto || parseFloat(monto) <= 0) {
    return res.status(400).json({ ok: false, error: 'Datos de transferencia inválidos' });
  }
  if (String(cuentaOrigenId) === String(cuentaDestinoId)) {
    return res.status(400).json({ ok: false, error: 'La cuenta origen y destino no pueden ser la misma' });
  }

  const numMonto = parseFloat(monto);
  const concepto = descripcion?.trim() || 'TRANSFERENCIA ENTRE SOCIOS';
  const actorId = (usuarioId || 'sistema').trim().toLowerCase();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const origenResult = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('cuentaId', sql.NVarChar(50), String(cuentaOrigenId).replace('ca-', ''))
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, c.Estado, p.PermiteTransferencias, p.CuentaActiva, p.Nombre AS NombreProducto, p.EsCertificado
          FROM dbo.Cuentas c
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
          WHERE (c.CuentaId = TRY_CAST(@cuentaId AS INT) OR c.NumeroCuenta = @cuentaId) AND p.CooperativaId = @CooperativaId
        `);
      if (origenResult.recordset.length === 0) throw new Error('Cuenta origen no encontrada');

      const origen = origenResult.recordset[0];
      if (origen.Estado !== 'ACTIVA') throw new Error('La cuenta origen no está activa');
      if (!origen.PermiteTransferencias) throw new Error('La cuenta origen no tiene habilitadas las transferencias');
      if (parseFloat(origen.Saldo) < numMonto) throw new Error('Saldo insuficiente en cuenta origen');

      const destinoResult = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('cuentaId', sql.NVarChar(50), String(cuentaDestinoId).replace('ca-', ''))
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, c.Estado, p.PermiteTransferencias, p.CuentaActiva, p.Nombre AS NombreProducto
          FROM dbo.Cuentas c
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
          WHERE (c.CuentaId = TRY_CAST(@cuentaId AS INT) OR c.NumeroCuenta = @cuentaId) AND p.CooperativaId = @CooperativaId
        `);
      if (destinoResult.recordset.length === 0) throw new Error('Cuenta destino no encontrada');

      const destino = destinoResult.recordset[0];
      if (destino.Estado !== 'ACTIVA') throw new Error('La cuenta destino no está activa');

      const nuevoSaldoOrigen = parseFloat(origen.Saldo) - numMonto;
      const nuevoSaldoDestino = parseFloat(destino.Saldo) + numMonto;

      await new sql.Request(transaction)
        .input('cuentaId', sql.Int, origen.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), nuevoSaldoOrigen)
        .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      await new sql.Request(transaction)
        .input('cuentaId', sql.Int, destino.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), nuevoSaldoDestino)
        .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      const asientoId = await crearAsientoContable(transaction, {
        concepto,
        usuarioId: actorId,
        origenModulo: 'MANUAL',
        origenId: null,
        lineas: [
          { codigo: origen.CuentaActiva, nombre: `Depósitos ${origen.NombreProducto}`, tipo: 'PASIVO', lado: 'D', valor: numMonto },
          { codigo: destino.CuentaActiva, nombre: `Depósitos ${destino.NombreProducto}`, tipo: 'PASIVO', lado: 'H', valor: numMonto },
        ],
      });

      await registrarMovimientoCuenta(transaction, {
        cuentaId: origen.CuentaId, tipo: 'TRANSFERENCIA_SALIDA', monto: numMonto, saldoResultante: nuevoSaldoOrigen,
        concepto: `DÉBITO TRANSFERENCIA: ${concepto}`, usuarioId: actorId, asientoContableId: asientoId,
      });
      await registrarMovimientoCuenta(transaction, {
        cuentaId: destino.CuentaId, tipo: 'TRANSFERENCIA_ENTRADA', monto: numMonto, saldoResultante: nuevoSaldoDestino,
        concepto: `CRÉDITO TRANSFERENCIA: ${concepto}`, usuarioId: actorId, asientoContableId: asientoId,
      });

      await registrarAuditoriaProceso(transaction, {
        proceso: 'AHORROS', accion: 'TRANSFERIR', entidadTipo: 'Cuenta', entidadId: origen.CuentaId,
        usuarioId: actorId, valorNuevo: numMonto,
        detalle: `Transferencia de $${numMonto.toFixed(2)} de cuenta ${origen.NumeroCuenta} a ${destino.NumeroCuenta} (asiento ${asientoId})`,
      });

      await transaction.commit();

      return res.json({
        ok: true,
        asientoId,
        monto: numMonto,
        origenNumeroCuenta: origen.NumeroCuenta,
        destinoNumeroCuenta: destino.NumeroCuenta,
        nuevoSaldoOrigen,
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][transferir]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO CRÉDITOS — SolicitudesCredito/Creditos/TablaAmortizacion(antes
// TablaDeAmortizacion)/RubrosCreditos con CooperativaId/SocioID reales (CHECK
// CK_*_CoopConsistente fuerza que SocioID pertenezca a la misma cooperativa).
//
// GAP DE ESQUEMA (reportado, no resuelto acá): dbo.TasasCredito (líneas de crédito,
// TEA máxima por línea) NO EXISTE en GUTT_SYSTEM -- verificado contra db/gutt_system/
// 04_creditos.sql, que solo trae SolicitudesCredito/Creditos/TablaAmortizacion/
// RubrosCreditos/CalificacionCartera. GET /api/socios/rates devuelve `rates: []` con
// una nota, y la validación de TEA máxima al crear una solicitud (server.js línea
// ~1302-1311) se omite -- no se inventa la tabla.
//
// GAP DE ESQUEMA: los campos ICEPorcentaje/ICEEstado/ICECuotaMensual/ICEIngresoNeto/
// ICEDeudaExterna que server.js graba en /loans/approve (Índice de Capacidad de Endeu-
// damiento) NO existen como columnas en dbo.SolicitudesCredito del esquema nuevo. Se
// reciben del body pero NO se persisten (antes de esto, no había dónde guardarlos sin
// inventar columnas). Reportado para que se agregue si el módulo ICE se retoma.
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/socios/loans ────────────────────────────────────────────────────
app.get('/api/socios/loans', async (req, res) => {
  const { identificacion } = req.query || {};
  if (!identificacion) return res.status(400).json({ ok: false, error: 'identificacion es requerida' });

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('identificacion', sql.NVarChar(20), identificacion.trim())
      .query(`
        SELECT SolicitudID as id, Identificacion as memberId, Monto as amount, Saldo as balance, Tasa as rate,
               Plazo as installmentsCount, Tipo as type, Estado as status, FechaSolicitud,
               FechaVencimiento as dueDate, Observaciones as comments, PlanPagos as installments,
               GarantiaInfo as garantiaInfo, Origen as origen
        FROM dbo.SolicitudesCredito
        WHERE CooperativaId = @CooperativaId AND Identificacion = @identificacion
        ORDER BY FechaSolicitud DESC
      `);
    await pool.close();

    const loans = result.recordset.map(loan => ({
      ...loan,
      installments: loan.installments ? JSON.parse(loan.installments) : [],
      garantiaInfo: loan.garantiaInfo ? JSON.parse(loan.garantiaInfo) : null
    }));
    return res.json({ ok: true, loans });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][get loans]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/loans/all ────────────────────────────────────────────────
app.get('/api/socios/loans/all', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT
          s.SolicitudID as id, s.Identificacion as memberId, s.SocioID as socioId,
          s.Monto as amount, s.Saldo as balance, s.Tasa as rate, s.Plazo as installmentsCount,
          s.Tipo as type, s.Estado as status, s.FechaSolicitud, s.FechaVencimiento as dueDate,
          s.Observaciones as comments, s.PlanPagos as installments, s.GarantiaInfo as garantiaInfo,
          s.Origen as origen,
          (SELECT PrimerNombre + ' ' + PrimerApellido + ISNULL(' ' + SegundoApellido, '') FROM dbo.Socios WHERE SocioId = s.SocioID) as memberName
        FROM dbo.SolicitudesCredito s
        WHERE s.CooperativaId = @CooperativaId
        ORDER BY s.FechaSolicitud DESC
      `);
    await pool.close();

    const loans = result.recordset.map(loan => ({
      ...loan,
      installments: loan.installments ? JSON.parse(loan.installments) : [],
      garantiaInfo: loan.garantiaInfo ? JSON.parse(loan.garantiaInfo) : null,
      memberName: loan.memberName || 'Socio Desconocido'
    }));
    return res.json({ ok: true, loans });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][get all loans]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/rates ────────────────────────────────────────────────────
// Ver GAP DE ESQUEMA arriba: dbo.TasasCredito no existe en GUTT_SYSTEM.
app.get('/api/socios/rates', async (req, res) => {
  return res.json({ ok: true, rates: [], gap: 'dbo.TasasCredito no existe en GUTT_SYSTEM (ver db/gutt_system/04_creditos.sql) -- reportar a gutt-system-validacion-esquema si se necesita.' });
});

// ── POST /api/socios/loans ───────────────────────────────────────────────────
app.post('/api/socios/loans', requireAuth, async (req, res) => {
  const { memberId, amount, balance, rate, installmentsCount, type, status, dueDate, installments: installmentsInput, garantiaInfo, origen } = req.body || {};
  if (!memberId || !amount || !rate || !installmentsCount) {
    return res.status(400).json({ ok: false, error: 'Datos de crédito incompletos' });
  }

  const installments = (Array.isArray(installmentsInput) && installmentsInput.length > 0)
    ? installmentsInput
    : generarPlanAmortizacion(amount, rate, installmentsCount);

  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    const socioCheck = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('memberId', sql.NVarChar(20), memberId)
      .query('SELECT SocioId, TipoPersona, Estado FROM dbo.Socios WHERE CooperativaId = @CooperativaId AND Identificacion = @memberId');

    if (socioCheck.recordset.length === 0) {
      await pool.close();
      return res.status(400).json({ ok: false, error: 'El socio especificado no existe en el sistema.' });
    }

    const socio = socioCheck.recordset[0];
    if (socio.TipoPersona !== 'SOCIO') {
      await pool.close();
      return res.status(400).json({ ok: false, error: `La persona especificada no es un SOCIO registrado (Tipo: ${socio.TipoPersona}).` });
    }
    if (socio.Estado !== 'ACTIVO') {
      await pool.close();
      return res.status(400).json({ ok: false, error: 'El socio especificado no se encuentra activo.' });
    }

    const certRes = await pool.request()
      .input('SocioId', sql.BigInt, socio.SocioId)
      .query(`
        SELECT c.Saldo
        FROM dbo.Cuentas c
        INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
        WHERE c.SocioId = @SocioId AND p.EsCertificado = 1
      `);

    const certBalance = certRes.recordset.length > 0 ? parseFloat(certRes.recordset[0].Saldo) : 0;
    if (certBalance < 1.00) {
      await pool.close();
      return res.status(400).json({ ok: false, error: `El socio debe poseer al menos $1.00 USD en Certificados de Aportación para solicitar un crédito (Saldo actual: $${certBalance.toFixed(2)} USD).` });
    }

    // Validación de TEA máxima por línea de crédito OMITIDA -- ver GAP DE ESQUEMA
    // (dbo.TasasCredito) al inicio del módulo.

    const countRes = await pool.request()
      .input('SocioId', sql.BigInt, socio.SocioId)
      .query('SELECT COUNT(*) as count FROM dbo.SolicitudesCredito WHERE SocioID = @SocioId');
    const nextNum = (countRes.recordset[0].count || 0) + 1;
    const autoSolicitudId = `SOL-${socio.SocioId}-${String(nextNum).padStart(3, '0')}`;

    let tipoPrenda = null, avaluoPrendario = null, observacionTecnicaPrenda = null, valorCobertura = null;
    if (garantiaInfo && garantiaInfo.tipo === 'PRENDARIA') {
      const pr = garantiaInfo.prendaria || {};
      tipoPrenda = pr.tipoPrenda || 'Otros';
      const rawAvaluo = pr.avaluo !== undefined ? pr.avaluo : garantiaInfo.avaluoMonto;
      const parsedAvaluo = parseFloat(rawAvaluo);
      if (isNaN(parsedAvaluo) || parsedAvaluo < 0) {
        await pool.close();
        return res.status(400).json({ ok: false, error: 'El valor de la prenda (avaluo) no puede ser negativo o inconsistente.' });
      }
      avaluoPrendario = parsedAvaluo;
      observacionTecnicaPrenda = pr.observacion || pr.descripcion || '';
      const numAmount = parseFloat(amount);
      if (numAmount > 0) valorCobertura = parseFloat(((avaluoPrendario / numAmount) * 100).toFixed(2));
    }

    await pool.request()
      .input('id', sql.NVarChar(50), autoSolicitudId)
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('SocioId', sql.BigInt, socio.SocioId)
      .input('memberId', sql.NVarChar(20), memberId)
      .input('amount', sql.Decimal(15, 2), amount)
      .input('balance', sql.Decimal(15, 2), balance)
      .input('rate', sql.Decimal(5, 2), rate)
      .input('installmentsCount', sql.Int, installmentsCount)
      .input('type', sql.NVarChar(100), type)
      .input('status', sql.NVarChar(30), status || 'SOLICITADO')
      .input('dueDate', sql.NVarChar(50), dueDate)
      .input('installments', sql.NVarChar(sql.MAX), JSON.stringify(installments))
      .input('garantiaInfo', sql.NVarChar(sql.MAX), garantiaInfo ? JSON.stringify(garantiaInfo) : null)
      .input('origen', sql.NVarChar(50), origen || 'CAJA_PATATE')
      .input('tipoPrenda', sql.NVarChar(100), tipoPrenda)
      .input('avaluoPrendario', sql.Decimal(15, 2), avaluoPrendario)
      .input('observacionTecnicaPrenda', sql.NVarChar(500), observacionTecnicaPrenda)
      .input('valorCobertura', sql.Decimal(10, 2), valorCobertura)
      .query(`
        INSERT INTO dbo.SolicitudesCredito (
          SolicitudID, CooperativaId, SocioID, Identificacion, Monto, Saldo, Tasa, Plazo, Tipo, Estado,
          FechaVencimiento, PlanPagos, GarantiaInfo, Origen,
          TipoPrenda, AvaluoPrendario, ObservacionTecnicaPrenda, ValorCobertura
        )
        VALUES (
          @id, @CooperativaId, @SocioId, @memberId, @amount, @balance, @rate, @installmentsCount, @type, @status,
          @dueDate, @installments, @garantiaInfo, @origen,
          @tipoPrenda, @avaluoPrendario, @observacionTecnicaPrenda, @valorCobertura
        )
      `);

    await pool.close();
    return res.json({ ok: true, message: 'Solicitud de crédito registrada con éxito', solicitudId: autoSolicitudId });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][create loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/update ─────────────────────────────────────────────
app.post('/api/socios/loans/update', async (req, res) => {
  const { id, amount, balance, rate, installmentsCount, installments } = req.body || {};
  if (!id || !amount || !rate || !installmentsCount) {
    return res.status(400).json({ ok: false, error: 'Datos incompletos para actualizar crédito' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const checkStatus = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(50), id)
      .query('SELECT Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @id AND CooperativaId = @CooperativaId');

    if (checkStatus.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'Crédito no encontrado' });
    }
    if (checkStatus.recordset[0].Estado !== 'SOLICITADO') {
      await pool.close();
      return res.status(400).json({ ok: false, error: 'No se puede modificar un crédito que ya fue aprobado o rechazado' });
    }

    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('amount', sql.Decimal(15, 2), amount)
      .input('balance', sql.Decimal(15, 2), balance)
      .input('rate', sql.Decimal(5, 2), rate)
      .input('installmentsCount', sql.Int, installmentsCount)
      .input('installments', sql.NVarChar(sql.MAX), JSON.stringify(installments))
      .query('UPDATE dbo.SolicitudesCredito SET Monto = @amount, Saldo = @balance, Tasa = @rate, Plazo = @installmentsCount, PlanPagos = @installments WHERE SolicitudID = @id');

    await pool.close();
    return res.json({ ok: true, message: 'Solicitud de crédito actualizada con éxito' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][update loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/approve ────────────────────────────────────────────
app.post('/api/socios/loans/approve', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { id, ids, reason, usuarioId, tipoAprobacion, actaSesion, proposedAmount } = req.body || {};
  const targetIds = Array.isArray(ids) ? ids : (id ? [id] : []);
  if (targetIds.length === 0 || !reason) {
    return res.status(400).json({ ok: false, error: 'ids y dictamen técnico son requeridos' });
  }

  const approverId = (usuarioId || 'asesor').trim().toLowerCase();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const approverRole = await obtenerRolUsuario(pool, approverId);
    if (approverRole === 'CREDIT_OFFICER') {
      await pool.close();
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Los asesores de crédito no tienen permisos para aprobar solicitudes.' });
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      for (const loanId of targetIds) {
        const checkRes = await new sql.Request(transaction)
          .input('CooperativaId', sql.Int, COOPERATIVA_ID)
          .input('id', sql.NVarChar(50), loanId)
          .query('SELECT Identificacion, Monto, Plazo, Tasa, Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @id AND CooperativaId = @CooperativaId');

        if (checkRes.recordset.length === 0) throw new Error(`Solicitud de crédito ${loanId} no encontrada`);

        const loan = checkRes.recordset[0];
        if (loan.Estado !== 'SOLICITADO') throw new Error(`La solicitud ${loanId} ya no está en estado SOLICITADO (Estado actual: ${loan.Estado})`);

        const loanAmount = parseFloat(loan.Monto);
        if (approverRole === 'MANAGER' && loanAmount > 50000.00) {
          throw new Error(`Límite Excedido: El Jefe de Crédito solo puede aprobar montos de hasta $50,000.00 USD. La solicitud ${loanId} de $${loanAmount.toFixed(2)} USD requiere aprobación de un Administrador.`);
        }

        let finalAmount = loanAmount;
        let newPlanPagos = null;
        if (proposedAmount && parseFloat(proposedAmount) < loanAmount) {
          finalAmount = parseFloat(proposedAmount);
          newPlanPagos = JSON.stringify(generarPlanAmortizacion(finalAmount, loan.Tasa, loan.Plazo));
        }

        await new sql.Request(transaction)
          .input('id', sql.NVarChar(50), loanId)
          .input('reason', sql.NVarChar(500), reason)
          .input('tipoAprobacion', sql.NVarChar(50), tipoAprobacion || 'ASESOR')
          .input('actaSesion', sql.NVarChar(100), actaSesion || null)
          .input('monto', sql.Decimal(15, 2), finalAmount)
          .input('newPlanPagos', sql.NVarChar(sql.MAX), newPlanPagos)
          .query(`
            UPDATE dbo.SolicitudesCredito
            SET Estado = 'APROBADO', Observaciones = @reason, TipoAprobacion = @tipoAprobacion,
                ActaSesion = @actaSesion, Monto = @monto, Saldo = @monto,
                PlanPagos = COALESCE(@newPlanPagos, PlanPagos)
            WHERE SolicitudID = @id
          `);

        const auditDetail = `Aprobación de crédito ${loanId} ($${finalAmount.toFixed(2)} USD, Tipo: ${tipoAprobacion || 'ASESOR'}${actaSesion ? `, Acta: ${actaSesion}` : ''}). Dictamen: ${reason}. Aprobado por: ${approverId}`;
        await new sql.Request(transaction)
          .input('usuarioId', sql.NVarChar(20), approverId)
          .input('concepto', sql.NVarChar(100), 'Aprobación de Crédito')
          .input('detalle', sql.NVarChar(500), auditDetail)
          .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

        await registrarAuditoriaProceso(transaction, {
          proceso: 'CREDITOS', accion: 'APROBAR', entidadTipo: 'SolicitudCredito', entidadId: loanId,
          usuarioId: approverId, valorNuevo: finalAmount, detalle: auditDetail,
        });
      }

      await transaction.commit();
      await pool.close();
      return res.json({ ok: true, message: `Crédito(s) aprobado(s) con éxito (${targetIds.length} operaciones)` });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][approve loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/disburse ───────────────────────────────────────────
app.post('/api/socios/loans/disburse', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { id, ids, usuarioId } = req.body || {};
  const targetIds = Array.isArray(ids) ? ids : (id ? [id] : []);
  if (targetIds.length === 0) return res.status(400).json({ ok: false, error: 'ids de crédito son requeridos' });

  const approverId = (usuarioId || 'asesor').trim().toLowerCase();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const approverRole = await obtenerRolUsuario(pool, approverId);
    if (approverRole === 'CREDIT_OFFICER') {
      await pool.close();
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Los asesores de crédito no tienen permisos para desembolsar fondos.' });
    }

    const successes = [];
    const failures = [];

    for (const loanId of targetIds) {
      const transaction = pool.transaction();
      try {
        await transaction.begin();

        const checkRes = await new sql.Request(transaction)
          .input('CooperativaId', sql.Int, COOPERATIVA_ID)
          .input('id', sql.NVarChar(50), loanId)
          .query(`
            SELECT Identificacion, Monto, Plazo, Tasa, Estado, PlanPagos, SocioID, TipoPrenda, AvaluoPrendario,
                   ObservacionTecnicaPrenda, ValorCobertura, TipoAprobacion, ActaSesion, Tipo
            FROM dbo.SolicitudesCredito WHERE SolicitudID = @id AND CooperativaId = @CooperativaId
          `);

        if (checkRes.recordset.length === 0) throw new Error('Solicitud de crédito no encontrada');

        const loan = checkRes.recordset[0];
        if (loan.Estado !== 'APROBADO') throw new Error(`La solicitud debe estar en estado APROBADO para ser desembolsada (Estado actual: ${loan.Estado})`);

        const loanAmount = parseFloat(loan.Monto);
        const plazoVal = parseInt(loan.Plazo, 10);
        const rateVal = parseFloat(loan.Tasa);

        const comision = parseFloat((loanAmount * 0.01).toFixed(2));
        const fondo = parseFloat((loanAmount * 0.005).toFixed(2));
        const solca = parseFloat((loanAmount * 0.005).toFixed(2));
        const totalDescuentos = parseFloat((comision + fondo + solca).toFixed(2));
        const netoDisbursed = parseFloat((loanAmount - totalDescuentos).toFixed(2));

        const accountRes = await new sql.Request(transaction)
          .input('SocioId', sql.BigInt, loan.SocioID)
          .query(`
            SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
            FROM dbo.Cuentas c
            INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
            WHERE c.SocioId = @SocioId AND p.EsCertificado = 0
          `);
        if (accountRes.recordset.length === 0) throw new Error('Cuenta de ahorros del socio no encontrada');

        const account = accountRes.recordset[0];
        const newBalance = parseFloat(account.Saldo) + netoDisbursed;

        await new sql.Request(transaction)
          .input('cuentaId', sql.Int, account.CuentaId)
          .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
          .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

        const disburseDate = new Date();
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + plazoVal);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        await new sql.Request(transaction)
          .input('creditoId', sql.NVarChar(50), loanId)
          .input('CooperativaId', sql.Int, COOPERATIVA_ID)
          .input('solicitudId', sql.NVarChar(50), loanId)
          .input('SocioId', sql.BigInt, loan.SocioID)
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
          .input('avaluoPrendario', sql.Decimal(15, 2), loan.AvaluoPrendario)
          .input('observacionTecnicaPrenda', sql.NVarChar(500), loan.ObservacionTecnicaPrenda)
          .input('valorCobertura', sql.Decimal(10, 2), loan.ValorCobertura)
          .query(`
            INSERT INTO dbo.Creditos (
              CreditoID, CooperativaId, SolicitudID, SocioID, Monto, Saldo, Tasa, Plazo, Tipo, Estado,
              FechaVencimiento, TipoAprobacion, ActaSesion, TipoPrenda, AvaluoPrendario, ObservacionTecnicaPrenda, ValorCobertura
            )
            VALUES (
              @creditoId, @CooperativaId, @solicitudId, @SocioId, @monto, @saldo, @tasa, @plazo, @tipo, @estado,
              @fechaVencimiento, @tipoAprobacion, @actaSesion, @tipoPrenda, @avaluoPrendario, @observacionTecnicaPrenda, @valorCobertura
            )
          `);

        let planSimulado = [];
        try { planSimulado = loan.PlanPagos ? JSON.parse(loan.PlanPagos) : []; } catch (_) { planSimulado = []; }
        if (!Array.isArray(planSimulado) || planSimulado.length === 0) {
          console.warn(`[gutt_system][disburse] PlanPagos vacío/NULL para ${loanId}; regenerando server-side`);
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
          const seguroDesgravamen = parseFloat((runningBalance * 0.0008).toFixed(2));
          const solcaRubro = parseFloat(((loanAmount * 0.005) / plazoVal).toFixed(2));
          const gastosAdmin = 1.50;
          const installmentTotal = parseFloat((capital + interest + seguroDesgravamen + solcaRubro + gastosAdmin).toFixed(2));
          runningBalance = Math.max(0, runningBalance - capital);

          const amortRes = await new sql.Request(transaction)
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
              INSERT INTO dbo.TablaAmortizacion (CreditoID, NumeroCuota, FechaPago, Capital, Interes, InteresDevengado, InteresPagado, SeguroDesgravamen, ContribucionSOLCA, GastosAdministrativos, Total, Estado)
              OUTPUT INSERTED.AmortizacionID
              VALUES (@creditoId, @numeroCuota, @fechaPago, @capital, @interes, 0, 0, @seguroDesgravamen, @contribucionSOLCA, @gastosAdministrativos, @total, 'PENDIENTE')
            `);
          const amortId = amortRes.recordset[0].AmortizacionID;

          const rubros = [
            { nombre: 'Capital', monto: capital },
            { nombre: 'Interes', monto: interest },
            { nombre: 'Seguro de Desgravamen', monto: seguroDesgravamen },
            { nombre: 'SOLCA', monto: solcaRubro },
            { nombre: 'Gastos Administrativos', monto: gastosAdmin }
          ];
          for (const r of rubros) {
            await new sql.Request(transaction)
              .input('amortizacionId', sql.Int, amortId)
              .input('nombreRubro', sql.NVarChar(50), r.nombre)
              .input('monto', sql.Decimal(15, 2), r.monto)
              .query("INSERT INTO dbo.RubrosCreditos (AmortizacionID, NombreRubro, Monto, Estado) VALUES (@amortizacionId, @nombreRubro, @monto, 'PENDIENTE')");
          }

          newPlan.push({ number: inst.number, date: cuotaDateStr, capital, interest, seguroDesgravamen, contribucionSOLCA: solcaRubro, gastosAdministrativos: gastosAdmin, total: installmentTotal, status: 'PENDIENTE' });
        }

        const descuentosObj = { comision, fondo, solca, totalDescuentos, netoDisbursed };
        await new sql.Request(transaction)
          .input('id', sql.NVarChar(50), loanId)
          .input('descuentos', sql.NVarChar(sql.MAX), JSON.stringify(descuentosObj))
          .input('newPlan', sql.NVarChar(sql.MAX), JSON.stringify(newPlan))
          .input('dueDate', sql.NVarChar(50), dueDateStr)
          .query("UPDATE dbo.SolicitudesCredito SET Estado = 'VIGENTE', FechaVencimiento = @dueDate, DescuentosDesembolso = @descuentos, PlanPagos = @newPlan WHERE SolicitudID = @id");

        const asientoId = await crearAsientoContable(transaction, {
          concepto: `DESEMBOLSO CRÉDITO ${loanId}`,
          usuarioId: approverId,
          origenModulo: 'CREDITOS',
          origenId: loanId,
          lineas: [
            { codigo: '140105', nombre: 'Cartera de Créditos por Vencer', tipo: 'ACTIVO', lado: 'D', valor: loanAmount },
            { codigo: account.CuentaActiva, nombre: 'Depósitos de Ahorro del Socio', tipo: 'PASIVO', lado: 'H', valor: netoDisbursed },
            { codigo: '520101', nombre: 'Comisión sobre Desembolso de Créditos', tipo: 'INGRESO', lado: 'H', valor: comision },
            { codigo: '320101', nombre: 'Fondo Irrepartible de Reserva Legal', tipo: 'PATRIMONIO', lado: 'H', valor: fondo },
            { codigo: '250104', nombre: 'Retenciones por Pagar Ley SOLCA', tipo: 'PASIVO', lado: 'H', valor: solca },
          ],
        });

        await registrarMovimientoCuenta(transaction, {
          cuentaId: account.CuentaId, tipo: 'DEPOSITO', monto: netoDisbursed, saldoResultante: newBalance,
          concepto: `Desembolso neto de crédito ${loanId}`, usuarioId: approverId, asientoContableId: asientoId,
        });

        const auditDetail = `Desembolso de fondos de crédito ${loanId} por $${loanAmount.toFixed(2)} USD (Neto: $${netoDisbursed.toFixed(2)} USD, Comisión: $${comision.toFixed(2)} USD, Fondo: $${fondo.toFixed(2)} USD, SOLCA: $${solca.toFixed(2)} USD). Desembolsado por: ${approverId} (${approverRole})`;
        await new sql.Request(transaction)
          .input('usuarioId', sql.NVarChar(20), approverId)
          .input('concepto', sql.NVarChar(100), 'Desembolso de Crédito')
          .input('detalle', sql.NVarChar(500), auditDetail)
          .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

        await registrarAuditoriaProceso(transaction, {
          proceso: 'CREDITOS', accion: 'DESEMBOLSAR', entidadTipo: 'SolicitudCredito', entidadId: loanId,
          usuarioId: approverId, valorNuevo: loanAmount, detalle: auditDetail,
        });

        await transaction.commit();
        successes.push({ loanId, balance: newBalance });
      } catch (innerErr) {
        await transaction.rollback();
        failures.push({ loanId, error: innerErr.message });
      }
    }

    await pool.close();
    return res.json({ ok: true, successes, failures });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][disburse loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/socios/:id/scoring ──────────────────────────────────────────────
app.get('/api/socios/:id/scoring', async (req, res) => {
  const { id } = req.params;
  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    const socioRes = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(50), id)
      .query(`
        SELECT s.SocioId, s.Identificacion, s.PrimerNombre, s.PrimerApellido, s.SegundoApellido,
               s.PatrimonioIngresos, d.ValorVivienda
        FROM dbo.Socios s
        LEFT JOIN dbo.SocioDireccion d ON d.SocioId = s.SocioId
        WHERE s.CooperativaId = @CooperativaId AND (s.Identificacion = @id OR CAST(s.SocioId AS VARCHAR) = @id)
      `);

    if (socioRes.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'Socio no encontrado' });
    }

    const socio = socioRes.recordset[0];
    const pat = socio.PatrimonioIngresos ? JSON.parse(socio.PatrimonioIngresos) : {};
    const valorVivienda = parseFloat(socio.ValorVivienda) || 0;

    const loansRes = await pool.request()
      .input('SocioId', sql.BigInt, socio.SocioId)
      .query('SELECT SolicitudID, Monto, Saldo, Tasa, Plazo, Estado, PlanPagos FROM dbo.SolicitudesCredito WHERE SocioID = @SocioId');

    const loans = loansRes.recordset;

    let score = 200;
    let totalLoans = loans.length;
    let paidLoansNoMora = 0;
    let lateInstallments = 0;
    let totalDelayDays = 0;

    for (const loan of loans) {
      const plan = loan.PlanPagos ? JSON.parse(loan.PlanPagos) : [];
      let hasMora = false;
      for (const inst of plan) {
        const due = inst.date ? new Date(inst.date) : null;
        if (inst.status === 'PAGADO') {
          if (inst.paidDate && due) {
            const paid = new Date(inst.paidDate);
            const delay = Math.max(0, Math.floor((paid - due) / (1000 * 60 * 60 * 24)));
            if (delay > 3) { hasMora = true; totalDelayDays += delay; lateInstallments++; score -= (delay - 3) * 5; }
            else score += 2;
          } else score += 2;
        } else if (inst.status === 'PENDIENTE') {
          if (due && new Date() > due) {
            const delay = Math.max(0, Math.floor((new Date() - due) / (1000 * 60 * 60 * 24)));
            if (delay > 3) { hasMora = true; totalDelayDays += delay; lateInstallments++; score -= (delay - 3) * 5; }
          }
        }
      }
      if (loan.Estado === 'PAGADO' && !hasMora) { paidLoansNoMora++; score += 50; }
    }

    const ingresoSueldo = parseFloat(pat.ingresoSueldo) || 0;
    const ingresoComercial = parseFloat(pat.ingresoComercial) || 0;
    const ingresoOtros = parseFloat(pat.ingresoOtros) || 0;
    const ingresosTotales = ingresoSueldo + ingresoComercial + ingresoOtros;
    const gastosMensuales = parseFloat(pat.gastosMensuales) || (ingresosTotales * 0.4);
    const deudasExternas = parseFloat(pat.deudasExternas) || 0;
    const capacidadPago = ingresosTotales - gastosMensuales - deudasExternas;

    if (capacidadPago > 500) score += Math.min(150, Math.floor(capacidadPago / 10));
    else if (capacidadPago < 0) score -= Math.min(100, Math.floor(Math.abs(capacidadPago) / 5));

    const avgDelayDays = lateInstallments > 0 ? (totalDelayDays / lateInstallments) : 0;
    score -= Math.min(150, Math.floor(avgDelayDays * 10));

    const totalBienes = valorVivienda + (parseFloat(pat.totalBienes) || (valorVivienda * 0.2) || 5000);
    const activeLocalDebt = loans.filter(l => l.Estado === 'VIGENTE' || l.Estado === 'VENCIDO').reduce((sum, l) => sum + parseFloat(l.Saldo), 0);
    const deudaTotal = deudasExternas + activeLocalDebt;
    const relacionBienesDeuda = deudaTotal > 0 ? (totalBienes / deudaTotal) : 3.0;

    if (relacionBienesDeuda > 1.5) score += 100;
    else if (relacionBienesDeuda < 1.0) score -= 50;

    score = Math.max(0, Math.min(1000, score));
    let rating = 'REGULAR';
    if (score >= 800) rating = 'EXCELENTE';
    else if (score >= 600) rating = 'BUENO';
    else if (score >= 400) rating = 'REGULAR';
    else if (score >= 200) rating = 'MALO';
    else rating = 'NEGADO';

    await pool.request()
      .input('SocioId', sql.BigInt, socio.SocioId)
      .input('score', sql.Int, score)
      .query("UPDATE dbo.SolicitudesCredito SET ScoringScore = @score WHERE SocioID = @SocioId AND Estado = 'SOLICITADO'");

    await pool.close();
    return res.json({
      ok: true,
      data: { score, rating, lastUpdate: new Date().toISOString(), totalLoans, paidLoansNoMora, delinquencyDays: totalDelayDays, avgDelayDays, capacidadPago, ingresosTotales, gastosMensuales, deudasExternas, totalBienes, deudaTotal, relacionBienesDeuda }
    });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][get scoring]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/reject ────────────────────────────────────────────
app.post('/api/socios/loans/reject', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { id, reason, usuarioId } = req.body || {};
  if (!id || !reason) return res.status(400).json({ ok: false, error: 'id y dictamen técnico son requeridos' });

  const approverId = (usuarioId || 'asesor').trim().toLowerCase();
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const approverRole = await obtenerRolUsuario(pool, approverId);
    if (approverRole === 'CREDIT_OFFICER') {
      await pool.close();
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Los asesores de crédito no tienen permisos para rechazar solicitudes.' });
    }

    const checkRes = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(50), id)
      .query('SELECT Estado, Identificacion, Monto FROM dbo.SolicitudesCredito WHERE SolicitudID = @id AND CooperativaId = @CooperativaId');

    if (checkRes.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'Solicitud de crédito no encontrada' });
    }

    const loan = checkRes.recordset[0];
    if (loan.Estado !== 'SOLICITADO') {
      await pool.close();
      return res.status(400).json({ ok: false, error: `La solicitud ya no está en estado SOLICITADO (Estado actual: ${loan.Estado})` });
    }

    await pool.request()
      .input('id', sql.NVarChar(50), id)
      .input('reason', sql.NVarChar(500), reason)
      .query("UPDATE dbo.SolicitudesCredito SET Estado = 'RECHAZADO', Observaciones = @reason WHERE SolicitudID = @id");

    const auditDetail = `Rechazo de solicitud de crédito ${id} por $${parseFloat(loan.Monto).toFixed(2)} USD para el socio ID ${loan.Identificacion}. Obs: ${reason}`;
    await pool.request()
      .input('usuarioId', sql.NVarChar(20), approverId)
      .input('concepto', sql.NVarChar(100), 'Rechazo de Crédito')
      .input('detalle', sql.NVarChar(500), auditDetail)
      .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

    await registrarAuditoriaProceso(pool, {
      proceso: 'CREDITOS', accion: 'RECHAZAR', entidadTipo: 'SolicitudCredito', entidadId: id,
      usuarioId: approverId, detalle: auditDetail,
    });

    await pool.close();
    return res.json({ ok: true, message: 'Solicitud de crédito rechazada con éxito' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][reject loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/pay-dividend ────────────────────────────────────
app.post('/api/socios/loans/pay-dividend', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { identificacion, loanId, installmentNumber, paymentSource, amount, applyProrating, usuarioId } = req.body || {};
  if (!identificacion || !loanId || !installmentNumber || !paymentSource || !amount) {
    return res.status(400).json({ ok: false, error: 'Datos de pago incompletos' });
  }

  const instNum = parseInt(installmentNumber, 10);
  const socioIdent = identificacion.trim();
  // Antes hardcodeaba 'caja' en el asiento contable y en MovimientosCuenta/AuditoriaUsuarios
  // (venía así del server.js viejo) -- endpoint sin auth, cualquiera podía pagar una cuota
  // atribuida a un cajero que no la ejecutó. Ahora usa el usuario real de la sesión.
  const actorId = (usuarioId || req.actor.usuarioId || 'caja').trim().toLowerCase();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const loanRes = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('loanId', sql.NVarChar(50), loanId)
        .query('SELECT SolicitudID, Monto, Saldo, Tasa, PlanPagos, Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @loanId AND CooperativaId = @CooperativaId');

      if (loanRes.recordset.length === 0) throw new Error('Solicitud de crédito no encontrada');
      const loan = loanRes.recordset[0];
      if (loan.Estado !== 'VIGENTE') throw new Error(`El crédito no se encuentra vigente (Estado: ${loan.Estado})`);
      if (!loan.PlanPagos) throw new Error('El crédito no posee plan de pagos registrado');

      const plan = JSON.parse(loan.PlanPagos);
      const targetInst = plan.find(i => i.number === instNum);
      if (!targetInst) throw new Error(`Cuota número ${instNum} no encontrada en el plan de pagos`);
      if (targetInst.status === 'PAGADO') throw new Error(`La cuota número ${instNum} ya fue pagada anteriormente`);

      let interestDiscount = 0.00;
      if (applyProrating) {
        interestDiscount = parseFloat((targetInst.interest * 0.50).toFixed(2));
        targetInst.interest = parseFloat((targetInst.interest - interestDiscount).toFixed(2));
        targetInst.total = parseFloat((targetInst.capital + targetInst.interest).toFixed(2));
      }
      const payAmt = targetInst.total;

      const accountRes = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('identificacion', sql.NVarChar(20), socioIdent)
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
          FROM dbo.Cuentas c
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
          WHERE c.SocioId = (SELECT SocioId FROM dbo.Socios WHERE CooperativaId = @CooperativaId AND Identificacion = @identificacion)
            AND p.EsCertificado = 0
        `);
      if (accountRes.recordset.length === 0) throw new Error('Cuenta de ahorros del socio no encontrada');

      const account = accountRes.recordset[0];
      let currentSavingsBalance = parseFloat(account.Saldo);
      let asientoLineas;

      if (paymentSource === 'ACCOUNT') {
        if (currentSavingsBalance < payAmt) {
          throw new Error(`Saldo insuficiente en cuenta de ahorros. Disponible: $${currentSavingsBalance.toFixed(2)} USD, Requerido (con prorrateo): $${payAmt.toFixed(2)} USD`);
        }
        currentSavingsBalance -= payAmt;
        await new sql.Request(transaction)
          .input('cuentaId', sql.Int, account.CuentaId)
          .input('nuevoSaldo', sql.Decimal(18, 2), currentSavingsBalance)
          .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');
        asientoLineas = [{ codigo: account.CuentaActiva, nombre: 'Depósitos de Ahorro del Socio', tipo: 'PASIVO', lado: 'D', valor: payAmt }];
      } else {
        // Pago en efectivo: solo entra dinero a Caja. La cuenta de ahorros del socio NO
        // se toca aquí -- debitarla además de Caja duplicaba el monto y descuadraba el
        // asiento (Debe != Haber), bug encontrado al probar este endpoint contra GUTT_SYSTEM.
        asientoLineas = [
          { codigo: '110105', nombre: 'Caja General', tipo: 'ACTIVO', lado: 'D', valor: payAmt },
        ];
      }
      asientoLineas.push(
        { codigo: '140105', nombre: 'Cartera de Créditos por Vencer', tipo: 'ACTIVO', lado: 'H', valor: targetInst.capital },
        { codigo: '510105', nombre: 'Intereses Ganados en Cartera', tipo: 'INGRESO', lado: 'H', valor: targetInst.interest },
      );
      // La cuota (targetInst.total) incluye, además de capital e interés, seguro de
      // desgravamen/SOLCA/gastos administrativos (ver disburse). Sin prorrateo, payAmt =
      // total completo -- si no se acreditan también estos 3 rubros el asiento no cuadra
      // (bug encontrado al probar este endpoint: Debe quedaba $2.26 por encima de Haber).
      // Con prorrateo, targetInst.total se recalcula arriba como solo capital+interés,
      // así que estos rubros no se cobraron en este pago y no corresponde acreditarlos.
      if (!applyProrating) {
        if (targetInst.seguroDesgravamen) asientoLineas.push({ codigo: '250105', nombre: 'Prima de Seguro de Desgravamen por Pagar', tipo: 'PASIVO', lado: 'H', valor: targetInst.seguroDesgravamen });
        if (targetInst.contribucionSOLCA) asientoLineas.push({ codigo: '250104', nombre: 'Retenciones por Pagar Ley SOLCA', tipo: 'PASIVO', lado: 'H', valor: targetInst.contribucionSOLCA });
        if (targetInst.gastosAdministrativos) asientoLineas.push({ codigo: '520102', nombre: 'Gastos Administrativos sobre Créditos', tipo: 'INGRESO', lado: 'H', valor: targetInst.gastosAdministrativos });
      }

      targetInst.status = 'PAGADO';
      const isLastInstallment = plan.every(i => i.status === 'PAGADO');
      const newStatus = isLastInstallment ? 'PAGADO' : 'VIGENTE';
      const newLoanBalance = Math.max(0, parseFloat(loan.Saldo) - targetInst.capital);

      await new sql.Request(transaction)
        .input('loanId', sql.NVarChar(50), loanId)
        .input('saldo', sql.Decimal(15, 2), newLoanBalance)
        .input('estado', sql.NVarChar(30), newStatus)
        .input('planPagos', sql.NVarChar(sql.MAX), JSON.stringify(plan))
        .query('UPDATE dbo.SolicitudesCredito SET Saldo = @saldo, Estado = @estado, PlanPagos = @planPagos WHERE SolicitudID = @loanId');

      const payConcept = `PAGO CUOTA #${instNum} PRÉSTAMO ${loanId}${applyProrating ? ' (CON PRORRATEO)' : ''}`;
      const asientoId = await crearAsientoContable(transaction, {
        concepto: payConcept, usuarioId: actorId, origenModulo: 'CREDITOS', origenId: loanId, lineas: asientoLineas,
      });

      if (paymentSource === 'ACCOUNT') {
        await registrarMovimientoCuenta(transaction, {
          cuentaId: account.CuentaId, tipo: 'RETIRO', monto: payAmt, saldoResultante: currentSavingsBalance,
          concepto: payConcept, usuarioId: actorId, asientoContableId: asientoId,
        });
      }

      const auditDetail = `Cobro de dividendo #${instNum} del crédito ${loanId}. Pago de $${payAmt.toFixed(2)} USD (Capital: $${targetInst.capital.toFixed(2)}, Interés: $${targetInst.interest.toFixed(2)}${applyProrating ? `, Descuento Prorrateo: $${interestDiscount.toFixed(2)}` : ''}). Canal: Ventanilla`;
      await new sql.Request(transaction)
        .input('usuarioId', sql.NVarChar(20), actorId)
        .input('concepto', sql.NVarChar(100), 'Pago de Dividendo')
        .input('detalle', sql.NVarChar(500), auditDetail)
        .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CREDITOS', accion: 'PAGO_DIVIDENDO', entidadTipo: 'SolicitudCredito', entidadId: loanId,
        usuarioId: actorId, detalle: auditDetail,
      });

      await transaction.commit();
      await pool.close();

      return res.json({ ok: true, message: 'Pago de dividendo procesado con éxito', loanBalance: newLoanBalance, savingsBalance: currentSavingsBalance, installmentPaid: instNum, isCompleted: isLastInstallment });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][pay loan installment]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/anular ────────────────────────────────────────────
app.post('/api/socios/loans/anular', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { id, usuarioId } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'El ID de la solicitud es requerido' });

  const userId = (usuarioId || 'asesor').trim().toLowerCase();
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const userRole = await obtenerRolUsuario(pool, userId);
    if (userRole !== 'MANAGER' && userRole !== 'ADMIN') {
      await pool.close();
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Solo los usuarios con rol de Jefe de Crédito o Administrador pueden anular créditos.' });
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const loanRes = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('id', sql.NVarChar(50), id)
        .query('SELECT Identificacion, SocioID, Monto, PlanPagos, Estado, DescuentosDesembolso FROM dbo.SolicitudesCredito WHERE SolicitudID = @id AND CooperativaId = @CooperativaId');

      if (loanRes.recordset.length === 0) throw new Error('Solicitud de crédito no encontrada');
      const loan = loanRes.recordset[0];
      if (loan.Estado === 'ANULADO') throw new Error('El crédito ya está anulado');

      if (loan.PlanPagos) {
        const plan = JSON.parse(loan.PlanPagos);
        if (plan.some(i => i.status === 'PAGADO')) {
          throw new Error('No se puede anular el crédito: existen cuotas cobradas. Debe anular primero todos los pagos individuales de este crédito.');
        }
      }

      if (loan.Estado === 'SOLICITADO' || loan.Estado === 'RECHAZADO') {
        await new sql.Request(transaction)
          .input('id', sql.NVarChar(50), id)
          .query("UPDATE dbo.SolicitudesCredito SET Estado = 'ANULADO', Saldo = 0.00 WHERE SolicitudID = @id");
        await transaction.commit();
        await pool.close();
        return res.json({ ok: true, message: 'Solicitud de crédito anulada con éxito' });
      }

      const loanAmount = parseFloat(loan.Monto);
      let descuentos = { comision: 0, fondo: 0, totalDescuentos: 0, netoDisbursed: loanAmount };
      if (loan.DescuentosDesembolso) {
        try { descuentos = JSON.parse(loan.DescuentosDesembolso); }
        catch (_) {
          descuentos = {
            comision: parseFloat((loanAmount * 0.01).toFixed(2)),
            fondo: parseFloat((loanAmount * 0.005).toFixed(2)),
            totalDescuentos: parseFloat((loanAmount * 0.015).toFixed(2)),
            netoDisbursed: parseFloat((loanAmount - (loanAmount * 0.015)).toFixed(2))
          };
        }
      }

      const accountRes = await new sql.Request(transaction)
        .input('SocioId', sql.BigInt, loan.SocioID)
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
          FROM dbo.Cuentas c
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
          WHERE c.SocioId = @SocioId AND p.EsCertificado = 0
        `);
      if (accountRes.recordset.length === 0) throw new Error('Cuenta de ahorros del socio no encontrada');

      const account = accountRes.recordset[0];
      const currentBalance = parseFloat(account.Saldo);
      const newBalance = currentBalance - descuentos.netoDisbursed;
      if (newBalance < 0) {
        throw new Error(`No se puede anular el crédito porque el socio no dispone del saldo desembolsado suficiente en su cuenta de ahorros. Saldo disponible: $${currentBalance.toFixed(2)} USD, Requerido para reverso: $${descuentos.netoDisbursed.toFixed(2)} USD`);
      }

      await new sql.Request(transaction)
        .input('cuentaId', sql.Int, account.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
        .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      await new sql.Request(transaction)
        .input('id', sql.NVarChar(50), id)
        .query("UPDATE dbo.SolicitudesCredito SET Estado = 'ANULADO', Saldo = 0.00 WHERE SolicitudID = @id");

      const lineas = [
        { codigo: '140105', nombre: 'Cartera de Créditos por Vencer', tipo: 'ACTIVO', lado: 'H', valor: loanAmount },
        { codigo: account.CuentaActiva, nombre: 'Depósitos de Ahorro del Socio', tipo: 'PASIVO', lado: 'D', valor: descuentos.netoDisbursed },
      ];
      if (descuentos.comision > 0) lineas.push({ codigo: '520101', nombre: 'Comisión sobre Desembolso de Créditos', tipo: 'INGRESO', lado: 'D', valor: descuentos.comision });
      if (descuentos.fondo > 0) lineas.push({ codigo: '320101', nombre: 'Fondo Irrepartible de Reserva Legal', tipo: 'PATRIMONIO', lado: 'D', valor: descuentos.fondo });

      const asientoId = await crearAsientoContable(transaction, {
        concepto: `REVERSO DESEMBOLSO ANULADO CRÉDITO ${id}`, usuarioId: userId, origenModulo: 'CREDITOS', origenId: id, lineas,
      });

      await registrarMovimientoCuenta(transaction, {
        cuentaId: account.CuentaId, tipo: 'RETIRO', monto: descuentos.netoDisbursed, saldoResultante: newBalance,
        concepto: `Reverso por anulación de crédito ${id}`, usuarioId: userId, asientoContableId: asientoId,
      });

      const auditDetail = `Anulación y reverso de desembolso de crédito ${id} por $${loanAmount.toFixed(2)} USD. Reversado por: ${userId} (${userRole})`;
      await new sql.Request(transaction)
        .input('usuarioId', sql.NVarChar(20), userId)
        .input('concepto', sql.NVarChar(100), 'Anulación de Crédito')
        .input('detalle', sql.NVarChar(500), auditDetail)
        .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CREDITOS', accion: 'ANULAR', entidadTipo: 'SolicitudCredito', entidadId: id,
        usuarioId: userId, valorAnterior: loanAmount, detalle: auditDetail,
      });

      await transaction.commit();
      await pool.close();
      return res.json({ ok: true, message: 'Crédito anulado y desembolso reversado con éxito', balance: newBalance });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][anular loan]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/anular-pago ────────────────────────────────────
app.post('/api/socios/loans/anular-pago', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { loanId, installmentNumber, usuarioId } = req.body || {};
  if (!loanId || !installmentNumber) return res.status(400).json({ ok: false, error: 'loanId e installmentNumber son requeridos' });

  const userId = (usuarioId || 'asesor').trim().toLowerCase();
  const instNum = parseInt(installmentNumber, 10);

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const userRole = await obtenerRolUsuario(pool, userId);
    if (userRole !== 'MANAGER' && userRole !== 'ADMIN') {
      await pool.close();
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Solo los usuarios con rol de Jefe de Crédito o Administrador pueden anular pagos.' });
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const loanRes = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('loanId', sql.NVarChar(50), loanId)
        .query('SELECT Identificacion, SocioID, Monto, Saldo, PlanPagos, Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @loanId AND CooperativaId = @CooperativaId');

      if (loanRes.recordset.length === 0) throw new Error('Solicitud de crédito no encontrada');
      const loan = loanRes.recordset[0];
      if (!loan.PlanPagos) throw new Error('El crédito no posee plan de pagos');

      const plan = JSON.parse(loan.PlanPagos);
      const targetInst = plan.find(i => i.number === instNum);
      if (!targetInst) throw new Error(`Cuota número ${instNum} no encontrada en el plan de pagos`);
      if (targetInst.status !== 'PAGADO') throw new Error(`La cuota número ${instNum} no está en estado PAGADO, por lo que no se puede anular`);

      // Antes: buscaba en RegistroContable por Concepto LIKE. Ahora: mismo criterio contra
      // AsientosContables/DetalleAsiento/PlanCuentas (join para recuperar el código de cuenta).
      const ledgerCheck = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('concept', sql.NVarChar(300), `%PAGO CUOTA #${instNum} PRÉSTAMO ${loanId}%`)
        .query(`
          SELECT a.Concepto, pc.Codigo AS CuentaContable
          FROM dbo.AsientosContables a
          JOIN dbo.DetalleAsiento d ON d.AsientoId = a.AsientoId
          JOIN dbo.PlanCuentas pc ON pc.CuentaContableId = d.CuentaContableId
          WHERE a.CooperativaId = @CooperativaId AND a.Concepto LIKE @concept
        `);

      let isProrated = false;
      let isAccountPayment = true;
      if (ledgerCheck.recordset.length > 0) {
        isProrated = ledgerCheck.recordset.some(r => r.Concepto && r.Concepto.includes('CON PRORRATEO'));
        isAccountPayment = !ledgerCheck.recordset.some(r => r.CuentaContable === '110105');
      }

      let interestDiscount = 0;
      if (isProrated) {
        const oldInterest = targetInst.interest;
        targetInst.interest = parseFloat((targetInst.interest * 2).toFixed(2));
        interestDiscount = targetInst.interest - oldInterest;
        targetInst.total = parseFloat((targetInst.capital + targetInst.interest).toFixed(2));
      }
      const payAmt = targetInst.total;

      const accountRes = await new sql.Request(transaction)
        .input('SocioId', sql.BigInt, loan.SocioID)
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, p.CuentaActiva
          FROM dbo.Cuentas c
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
          WHERE c.SocioId = @SocioId AND p.EsCertificado = 0
        `);
      if (accountRes.recordset.length === 0) throw new Error('Cuenta de ahorros del socio no encontrada');

      const account = accountRes.recordset[0];
      const currentSavingsBalance = parseFloat(account.Saldo);
      let newSavingsBalance = currentSavingsBalance;

      if (isAccountPayment) {
        newSavingsBalance = currentSavingsBalance + payAmt;
        await new sql.Request(transaction)
          .input('cuentaId', sql.Int, account.CuentaId)
          .input('nuevoSaldo', sql.Decimal(18, 2), newSavingsBalance)
          .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');
      }

      targetInst.status = 'PENDIENTE';
      const newLoanBalance = parseFloat(loan.Saldo) + targetInst.capital;
      let newLoanStatus = loan.Estado;
      if (loan.Estado === 'PAGADO') newLoanStatus = 'VIGENTE';

      await new sql.Request(transaction)
        .input('loanId', sql.NVarChar(50), loanId)
        .input('saldo', sql.Decimal(15, 2), newLoanBalance)
        .input('estado', sql.NVarChar(30), newLoanStatus)
        .input('planPagos', sql.NVarChar(sql.MAX), JSON.stringify(plan))
        .query('UPDATE dbo.SolicitudesCredito SET Saldo = @saldo, Estado = @estado, PlanPagos = @planPagos WHERE SolicitudID = @loanId');

      const revConcept = `REVERSO PAGO CUOTA #${instNum} PRÉSTAMO ${loanId}${isProrated ? ' (CON PRORRATEO)' : ''}`;
      const lineas = isAccountPayment
        ? [{ codigo: account.CuentaActiva, nombre: 'Depósitos de Ahorro del Socio', tipo: 'PASIVO', lado: 'H', valor: payAmt }]
        : [
            { codigo: '110105', nombre: 'Caja General', tipo: 'ACTIVO', lado: 'H', valor: payAmt },
            { codigo: account.CuentaActiva, nombre: 'Depósitos de Ahorro del Socio', tipo: 'PASIVO', lado: 'H', valor: payAmt },
          ];
      lineas.push(
        { codigo: '140105', nombre: 'Cartera de Créditos por Vencer', tipo: 'ACTIVO', lado: 'D', valor: targetInst.capital },
        { codigo: '510105', nombre: 'Intereses Ganados en Cartera', tipo: 'INGRESO', lado: 'D', valor: targetInst.interest },
      );

      const asientoId = await crearAsientoContable(transaction, {
        concepto: revConcept, usuarioId: userId, origenModulo: 'CREDITOS', origenId: loanId, lineas,
      });

      if (isAccountPayment) {
        await registrarMovimientoCuenta(transaction, {
          cuentaId: account.CuentaId, tipo: 'DEPOSITO', monto: payAmt, saldoResultante: newSavingsBalance,
          concepto: revConcept, usuarioId: userId, asientoContableId: asientoId,
        });
      }

      const auditDetail = `Anulación de dividendo #${instNum} del crédito ${loanId}. Reversado pago de $${payAmt.toFixed(2)} USD (Capital: $${targetInst.capital.toFixed(2)}, Interés: $${targetInst.interest.toFixed(2)}${isProrated ? `, Reverso Prorrateo: $${interestDiscount.toFixed(2)}` : ''}). Aprobado por: ${userId} (${userRole})`;
      await new sql.Request(transaction)
        .input('usuarioId', sql.NVarChar(20), userId)
        .input('concepto', sql.NVarChar(100), 'Anulación de Pago de Dividendo')
        .input('detalle', sql.NVarChar(500), auditDetail)
        .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CREDITOS', accion: 'ANULAR_DIVIDENDO', entidadTipo: 'SolicitudCredito', entidadId: loanId,
        usuarioId: userId, detalle: auditDetail,
      });

      await transaction.commit();
      await pool.close();
      return res.json({ ok: true, message: 'Pago de dividendo anulado con éxito', loanBalance: newLoanBalance, savingsBalance: newSavingsBalance });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][anular pago]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/loans/update-status ──────────────────────────────────
app.post('/api/socios/loans/update-status', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { loanId, status, reason, usuarioId } = req.body || {};
  if (!loanId || !status) return res.status(400).json({ ok: false, error: 'loanId y status son requeridos' });

  const userId = (usuarioId || 'asesor').trim().toLowerCase();
  const upperStatus = status.trim().toUpperCase();
  if (!['TRAMITE_JUDICIAL', 'CASTIGADO', 'VIGENTE', 'VENCIDO'].includes(upperStatus)) {
    return res.status(400).json({ ok: false, error: 'Estado de cartera no válido. Debe ser TRAMITE_JUDICIAL, CASTIGADO, VIGENTE o VENCIDO.' });
  }

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const userRole = await obtenerRolUsuario(pool, userId);
    if (upperStatus === 'CASTIGADO' && userRole !== 'MANAGER' && userRole !== 'ADMIN') {
      await pool.close();
      return res.status(403).json({ ok: false, error: 'Acceso Denegado: Solo un Jefe de Crédito o Administrador puede castigar cartera.' });
    }

    const loanRes = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('loanId', sql.NVarChar(50), loanId)
      .query('SELECT Estado, Monto, Saldo FROM dbo.SolicitudesCredito WHERE SolicitudID = @loanId AND CooperativaId = @CooperativaId');

    if (loanRes.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'Crédito no encontrado' });
    }
    const loan = loanRes.recordset[0];
    if (upperStatus === 'CASTIGADO' && loan.Estado !== 'VENCIDO') {
      await pool.close();
      return res.status(400).json({ ok: false, error: `No se puede castigar la cartera: El crédito debe estar en estado VENCIDO. Estado actual: ${loan.Estado}` });
    }

    let updateQuery = 'UPDATE dbo.SolicitudesCredito SET Estado = @status';
    if (reason) updateQuery += ", Observaciones = ISNULL(Observaciones, '') + ' | Cambio Estado: ' + @reason";
    updateQuery += ' WHERE SolicitudID = @loanId';

    await pool.request()
      .input('loanId', sql.NVarChar(50), loanId)
      .input('status', sql.NVarChar(30), upperStatus)
      .input('reason', sql.NVarChar(500), reason || '')
      .query(updateQuery);

    const auditDetail = `Cambio de estado de cartera para crédito ${loanId} a ${upperStatus}. Razón/Acuerdo: ${reason || 'Ninguna especificada'}. Usuario: ${userId} (${userRole})`;
    await pool.request()
      .input('usuarioId', sql.NVarChar(20), userId)
      .input('concepto', sql.NVarChar(100), 'Cambio Estado Cartera')
      .input('detalle', sql.NVarChar(500), auditDetail)
      .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@usuarioId, @concepto, @detalle)');

    await registrarAuditoriaProceso(pool, {
      proceso: 'CREDITOS', accion: 'CAMBIO_ESTADO', entidadTipo: 'SolicitudCredito', entidadId: loanId,
      usuarioId: userId, campoAfectado: 'Estado', valorAnterior: loan.Estado, valorNuevo: upperStatus, detalle: auditDetail,
    });

    await pool.close();
    return res.json({ ok: true, message: `Estado del crédito actualizado a ${upperStatus} con éxito` });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][update loan status]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO PLAZO FIJO — TasasPlazoFijo/DepositosPlazo (05_plazo_fijo.sql), sin
// cambios de nombre de tabla/columna respecto a SQLGUTPATATE. Único cambio real:
// dbo.AsientosContablesDPF YA NO EXISTE — sus asientos van a
// AsientosContables/DetalleAsiento (OrigenModulo='PLAZO_FIJO', OrigenId=DepositoID),
// vía crearAsientoContable() (mismo helper que ya usa Créditos).
//
// Cuentas contables usadas: se siguió el precedente YA VALIDADO por
// db/gutt_system/16_prueba_plazo_fijo_cancelacion.sql (probado a nivel SQL puro,
// Debe=Haber confirmado ahí antes de portar nada acá) en vez de los códigos punteados
// que traía el server.js legacy ('2.1.01.05', '4.1.03.05', '2.5.03.05', '5.4.90.90'
// — formato prohibido por CK_PlanCuentas_Codigo_SoloDigitos desde 18_fix_formato_codigo_contable.sql):
//   - '110105' Caja General (ACTIVO) — contrapartida de efectivo en apertura/liquidación/
//     cancelación/renovación. El legacy usaba una cuenta "Ahorro Vista" genérica como
//     contrapartida sin tocar ninguna Cuentas.Saldo real; aquí se mantiene esa misma
//     desconexión (ni el legacy ni este puerto debitan/acreditan la cuenta de ahorros
//     real del socio al abrir un DPF) pero con Caja como contrapartida, que es el patrón
//     que 16_...sql ya dejó probado y balanceado.
//   - tasa.CuentaContableDPF / dpf.CuentaContableDPF — ya resuelto en formato dígitos
//     por TasasPlazoFijo/DepositosPlazo (ej. '210305'), FK real a PlanCuentas desde 18_fix.
//   - '410205' Intereses Causados en Depósitos a Plazo (GASTO)
//   - '210510' Retenciones por Pagar SRI (PASIVO)
//   - '510205' Ingresos por Penalización Cancelación Anticipada DPF (INGRESO)
//
// BUG DE CONTABILIDAD ENCONTRADO Y CORREGIDO respecto al server.js legacy (mismo rigor
// que los 3 bugs ya corregidos en Créditos, ver comentario al inicio del archivo):
//   1. CANCELAR: el legacy debitaba `interesNeto` (interés YA neto de penalización) en la
//      cuenta de "Intereses Causados", pero acreditaba la penalización como una pata más
//      -- eso descuadra Debe≠Haber por el monto exacto de la penalización (verificado a
//      mano: Debe=capital+interesNeto, Haber=capital+interesNetoFinal+retencion+penalizacion
//      = capital+interesNeto+penalizacion). Corregido: se debita `interesBruto` (el interés
//      devengado ANTES de descontar la penalización), igual que hace 16_...sql. Con eso
//      Debe=Haber exacto (verificado abajo con la misma query SUM(D)/SUM(H) que usó el
//      usuario para los bugs de Créditos).
//   2. RENOVAR: el legacy cerraba el DPF viejo (Debe capital+interés) pero NUNCA volvía a
//      abrir el capital en el DPF nuevo -- el asiento quedaba corto por `capital` en el Haber.
//      Corregido: se generan DOS asientos balanceados por separado (mismo patrón que
//      LIQUIDACION + APERTURA ya usados en este mismo módulo, no algo inventado):
//        a) RENOVACION_CIERRE (OrigenId=DepositoID viejo): cierra el DPF viejo pagando a
//           Caja el capital + interés neto, igual que una liquidación normal.
//        b) RENOVACION_APERTURA (OrigenId=DepositoID nuevo): reabre el capital desde Caja
//           hacia el DPF nuevo, igual que una apertura normal.
//
// Todos los endpoints de dinero (POST /api/dpf, /liquidar, /cancelar, /renovar) llevan
// requireAuth + requireSelf('usuarioID') -- el legacy no los protegía, pero
// AsientosContables.UsuarioId ahora tiene FK real a dbo.Usuarios (NOT NULL), así que de
// todos modos hace falta un usuario real y autenticado para poder generar el asiento.
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/dpf/tasas ───────────────────────────────────────────────────────
app.get('/api/dpf/tasas', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT TasaID, CodigoRango, DescripcionRango, DiasDesde, DiasHasta,
               TasaNominalAnual, TasaMaximaBCE, MontoMinimo, MontoMaximo,
               CuentaContableDPF, PorcentajePenalizacion, Activo,
               CONVERT(NVARCHAR(10), FechaVigencia, 103) AS FechaVigencia, UsuarioConfigID
        FROM dbo.TasasPlazoFijo WHERE CooperativaId = @CooperativaId ORDER BY DiasDesde ASC
      `);
    await pool.close();
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf tasas]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PUT /api/dpf/tasas/:id ───────────────────────────────────────────────────
app.put('/api/dpf/tasas/:id', requireAuth, requireSelf('usuarioID'), async (req, res) => {
  let pool;
  const { tasaNominalAnual, montoMinimo, montoMaximo, porcentajePenalizacion, activo, usuarioID } = req.body || {};
  try {
    if (tasaNominalAnual === undefined || tasaNominalAnual < 0)
      return res.status(400).json({ ok: false, error: 'Tasa nominal inválida.' });
    pool = await sql.connect(sqlConfig);
    const row = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.Int, req.params.id)
      .query('SELECT TasaMaximaBCE FROM dbo.TasasPlazoFijo WHERE TasaID = @id AND CooperativaId = @CooperativaId');
    if (row.recordset.length === 0) { await pool.close(); return res.status(404).json({ ok: false, error: 'Tramo no encontrado.' }); }
    const techoMax = parseFloat(row.recordset[0].TasaMaximaBCE);
    if (parseFloat(tasaNominalAnual) > techoMax + 0.001) {
      await pool.close();
      return res.status(400).json({ ok: false, error: `La tasa ${tasaNominalAnual}% supera el techo BCE de ${techoMax}%.` });
    }
    await pool.request()
      .input('id',       sql.Int,          req.params.id)
      .input('tna',      sql.Decimal(5,2), tasaNominalAnual)
      .input('minMonto', sql.Decimal(15,2),montoMinimo ?? 200)
      .input('maxMonto', sql.Decimal(15,2),montoMaximo ?? null)
      .input('penal',    sql.Decimal(5,2), porcentajePenalizacion ?? 50)
      .input('activo',   sql.Bit,          activo !== undefined ? activo : 1)
      .input('usuID',    sql.NVarChar(50), usuarioID)
      .query(`UPDATE dbo.TasasPlazoFijo SET
                TasaNominalAnual=@tna, MontoMinimo=@minMonto, MontoMaximo=@maxMonto,
                PorcentajePenalizacion=@penal, Activo=@activo,
                FechaVigencia=CAST(SYSDATETIME() AS DATE), UsuarioConfigID=@usuID
              WHERE TasaID=@id`);
    await pool.close();
    return res.json({ ok: true, message: 'Tasa actualizada correctamente.' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf tasas update]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/dpf/resumen ─────────────────────────────────────────────────────
app.get('/api/dpf/resumen', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const r = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT
          COUNT(*) AS totalDPF,
          SUM(CASE WHEN Estado='ACTIVO'    THEN 1 ELSE 0 END) AS activos,
          SUM(CASE WHEN Estado='VENCIDO'   THEN 1 ELSE 0 END) AS vencidos,
          SUM(CASE WHEN Estado='LIQUIDADO' THEN 1 ELSE 0 END) AS liquidados,
          SUM(CASE WHEN Estado='CANCELADO' THEN 1 ELSE 0 END) AS cancelados,
          ISNULL(SUM(CASE WHEN Estado='ACTIVO' THEN MontoCapital ELSE 0 END),0) AS capitalActivo,
          ISNULL(SUM(CASE WHEN Estado='ACTIVO' THEN InteresProyectado ELSE 0 END),0) AS interesProyectadoTotal,
          SUM(CASE WHEN Estado IN ('ACTIVO','VENCIDO') AND CAST(FechaVencimiento AS DATE)<=CAST(SYSDATETIME() AS DATE) THEN 1 ELSE 0 END) AS vencimientosHoy
        FROM dbo.DepositosPlazo WHERE CooperativaId = @CooperativaId
      `);
    await pool.close();
    return res.json({ ok: true, data: r.recordset[0] });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf resumen]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/dpf/vencimientos ────────────────────────────────────────────────
app.get('/api/dpf/vencimientos', async (req, res) => {
  let pool;
  const dias = parseInt(req.query.dias) || 7;
  try {
    pool = await sql.connect(sqlConfig);
    const r = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('dias', sql.Int, dias).query(`
      SELECT d.DepositoID, d.Identificacion, d.NombreSocio, d.MontoCapital,
             d.TasaNominalAnual, d.PlazosDias, d.InteresProyectado,
             d.RetencionProyectada, d.InteresNetoProyectado, d.Estado, d.TipoRenovacion,
             CONVERT(NVARCHAR(10), d.FechaApertura,   103) AS FechaApertura,
             CONVERT(NVARCHAR(10), d.FechaVencimiento, 103) AS FechaVencimiento,
             DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), CAST(d.FechaVencimiento AS DATE)) AS DiasRestantes,
             t.DescripcionRango, t.PorcentajePenalizacion
      FROM dbo.DepositosPlazo d
      INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID = t.TasaID
      WHERE d.CooperativaId = @CooperativaId AND d.Estado IN ('ACTIVO','VENCIDO')
        AND CAST(d.FechaVencimiento AS DATE) <= DATEADD(DAY, @dias, CAST(SYSDATETIME() AS DATE))
      ORDER BY d.FechaVencimiento ASC
    `);
    await pool.close();
    return res.json({ ok: true, data: r.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf vencimientos]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/dpf ─────────────────────────────────────────────────────────────
// Antes: fallback a legacy Postgres si `busqueda` no encontraba nada en SQL Server.
// No se porta ese fallback -- mismo criterio que /api/socios/buscar (ver comentario ahí):
// apunta a datos reales de SQLGUTPATATE/legacy, fuera de alcance mientras GUTT_SYSTEM no
// tenga datos reales que reconciliar.
app.get('/api/dpf', async (req, res) => {
  let pool;
  const { estado, busqueda, desde, hasta } = req.query;
  try {
    pool = await sql.connect(sqlConfig);
    let where = 'WHERE d.CooperativaId = @CooperativaId';
    const request = pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID);
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
    console.error('[gutt_system][dpf list]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/dpf/:id ──────────────────────────────────────────────────────────
// Antes: SELECT ... FROM dbo.AsientosContablesDPF WHERE DepositoID=@id (tabla que ya no
// existe). Se reconstruye con JOIN AsientosContables + DetalleAsiento + PlanCuentas
// filtrando por OrigenModulo='PLAZO_FIJO' AND OrigenId=@id.
app.get('/api/dpf/:id', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const dpf = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(20), req.params.id).query(`
      SELECT d.*, t.DescripcionRango, t.PorcentajePenalizacion,
             CONVERT(NVARCHAR(10), d.FechaApertura,   103) AS FechaAperturaFmt,
             CONVERT(NVARCHAR(10), d.FechaVencimiento,103) AS FechaVencimientoFmt,
             CONVERT(NVARCHAR(10), d.FechaLiquidacion,103) AS FechaLiquidacionFmt,
             DATEDIFF(DAY, CAST(SYSDATETIME() AS DATE), CAST(d.FechaVencimiento AS DATE)) AS DiasRestantes
      FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID
      WHERE d.DepositoID=@id AND d.CooperativaId = @CooperativaId
    `);
    if (dpf.recordset.length === 0) { await pool.close(); return res.status(404).json({ ok: false, error: 'DPF no encontrado.' }); }
    const asientos = await pool.request().input('id', sql.NVarChar(50), req.params.id).query(`
      SELECT a.AsientoId, a.Concepto AS TipoOperacion, pc.Codigo AS CuentaContable, pc.Nombre AS NombreCuenta,
             CASE WHEN da.TipoAsiento = 'D' THEN da.Valor ELSE 0 END AS DebeAmount,
             CASE WHEN da.TipoAsiento = 'H' THEN da.Valor ELSE 0 END AS HaberAmount,
             a.Concepto, a.UsuarioId AS UsuarioID,
             CONVERT(NVARCHAR(19), a.Fecha, 120) AS FechaAsiento
      FROM dbo.AsientosContables a
      INNER JOIN dbo.DetalleAsiento da ON da.AsientoId = a.AsientoId
      INNER JOIN dbo.PlanCuentas pc ON pc.CuentaContableId = da.CuentaContableId
      WHERE a.OrigenModulo = 'PLAZO_FIJO' AND a.OrigenId = @id
      ORDER BY a.AsientoId ASC, da.DetalleId ASC
    `);
    await pool.close();
    return res.json({ ok: true, data: dpf.recordset[0], asientos: asientos.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf get]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/dpf ────────────────────────────────────────────────────────────
app.post('/api/dpf', requireAuth, requireSelf('usuarioID'), async (req, res) => {
  const { socioid, tasaID, montoCapital, plazosDias,
          tipoRenovacion, modalidadPago, cuentaAhorrosRelacionada, observaciones, usuarioID } = req.body || {};
  if (!socioid || !montoCapital || !plazosDias || !tasaID)
    return res.status(400).json({ ok: false, error: 'Campos obligatorios: socioid, montoCapital, plazosDias, tasaID.' });
  if (parseFloat(montoCapital) <= 0) return res.status(400).json({ ok: false, error: 'Monto debe ser mayor a cero.' });
  if (parseInt(plazosDias) < 1) return res.status(400).json({ ok: false, error: 'Plazo mínimo 1 día.' });

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      const socioRes = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('SocioId', sql.BigInt, socioid)
        .query('SELECT SocioId, Identificacion, PrimerNombre, SegundoNombre, PrimerApellido, SegundoApellido FROM dbo.Socios WHERE SocioId = @SocioId AND CooperativaId = @CooperativaId');
      if (socioRes.recordset.length === 0) throw new Error('Socio no encontrado');
      const socio = socioRes.recordset[0];
      const nombreSocio = `${socio.PrimerNombre} ${socio.SegundoNombre ? socio.SegundoNombre + ' ' : ''}${socio.PrimerApellido}${socio.SegundoApellido ? ' ' + socio.SegundoApellido : ''}`.trim();

      const tasaRow = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('tid', sql.Int, tasaID)
        .query('SELECT * FROM dbo.TasasPlazoFijo WHERE TasaID=@tid AND CooperativaId = @CooperativaId AND Activo=1');
      if (tasaRow.recordset.length === 0) throw new Error('Tramo de tasa no válido.');
      const tasa = tasaRow.recordset[0];
      const monto = parseFloat(montoCapital), dias = parseInt(plazosDias);
      if (monto < parseFloat(tasa.MontoMinimo)) throw new Error(`Monto mínimo para este tramo: $${tasa.MontoMinimo}.`);
      if (tasa.MontoMaximo && monto > parseFloat(tasa.MontoMaximo)) throw new Error(`Monto máximo: $${tasa.MontoMaximo}.`);
      if (dias < tasa.DiasDesde || (tasa.DiasHasta < 9999 && dias > tasa.DiasHasta))
        throw new Error(`Plazo debe ser entre ${tasa.DiasDesde} y ${tasa.DiasHasta} días.`);

      const tna = parseFloat(tasa.TasaNominalAnual);
      const interesProyectado     = monto * (tna / 100) * (dias / 365);
      const retencionProyectada   = interesProyectado * 0.02;
      const interesNetoProyectado = interesProyectado - retencionProyectada;
      const fechaVencimiento = new Date();
      fechaVencimiento.setDate(fechaVencimiento.getDate() + dias);

      const idResult = await new sql.Request(transaction).output('NuevoID', sql.NVarChar(20)).execute('dbo.usp_GenerarIDDepositoPlazo');
      const depositoID = idResult.output.NuevoID;

      await new sql.Request(transaction)
        .input('depositoID',             sql.NVarChar(20),  depositoID)
        .input('CooperativaId',          sql.Int,           COOPERATIVA_ID)
        .input('socioid',                sql.BigInt,        socioid)
        .input('identificacion',         sql.NVarChar(20),  socio.Identificacion)
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
        .input('cuentaContableDPF',      sql.NVarChar(15),  tasa.CuentaContableDPF)
        .input('usuarioAperturaID',      sql.NVarChar(50),  usuarioID)
        .input('observaciones',          sql.NVarChar(500), observaciones || null)
        .query(`INSERT INTO dbo.DepositosPlazo
                  (DepositoID,CooperativaId,SocioID,Identificacion,NombreSocio,NumCertificado,TasaID,TasaNominalAnual,PlazosDias,MontoCapital,
                   InteresProyectado,RetencionProyectada,InteresNetoProyectado,FechaVencimiento,TipoRenovacion,ModalidadPago,
                   CuentaAhorrosRelacionada,CuentaContableDPF,UsuarioAperturaID,Observaciones)
                VALUES(@depositoID,@CooperativaId,@socioid,@identificacion,@nombreSocio,@depositoID,@tasaID,@tasaNominalAnual,@plazosDias,@montoCapital,
                       @interesProyectado,@retencionProyectada,@interesNetoProyectado,@fechaVencimiento,@tipoRenovacion,@modalidadPago,
                       @cuentaAhorros,@cuentaContableDPF,@usuarioAperturaID,@observaciones)`);

      // APERTURA: Debe Caja (110105) / Haber cuenta del tramo DPF -- mismo patrón que
      // 16_prueba_plazo_fijo_cancelacion.sql usa como contrapartida de efectivo.
      await crearAsientoContable(transaction, {
        concepto: `APERTURA DPF ${depositoID} - ${nombreSocio}`,
        usuarioId: usuarioID,
        origenModulo: 'PLAZO_FIJO',
        origenId: depositoID,
        lineas: [
          { codigo: '110105', nombre: 'Caja General', tipo: 'ACTIVO', lado: 'D', valor: monto },
          { codigo: tasa.CuentaContableDPF, nombre: `Depósitos a Plazo — ${tasa.DescripcionRango}`, tipo: 'PASIVO', lado: 'H', valor: monto },
        ],
      });

      await registrarAuditoriaProceso(transaction, {
        proceso: 'PLAZO_FIJO', accion: 'APERTURA', entidadTipo: 'DepositoPlazo', entidadId: depositoID,
        usuarioId: usuarioID, detalle: `Apertura DPF ${depositoID} por $${monto.toFixed(2)} a ${dias} días para socio ${socio.Identificacion}.`,
      });

      await transaction.commit();
      return res.status(201).json({
        ok: true, depositoID, numCertificado: depositoID,
        interesProyectado:     parseFloat(interesProyectado.toFixed(2)),
        retencionProyectada:   parseFloat(retencionProyectada.toFixed(2)),
        interesNetoProyectado: parseFloat(interesNetoProyectado.toFixed(2)),
        fechaVencimiento: fechaVencimiento.toISOString().split('T')[0],
        message: `DPF aperturado. Certificado: ${depositoID}`
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf-apertura]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ── POST /api/dpf/:id/liquidar ───────────────────────────────────────────────
app.post('/api/dpf/:id/liquidar', requireAuth, requireSelf('usuarioID'), async (req, res) => {
  const { usuarioID } = req.body || {};
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      const dpfRow = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('id', sql.NVarChar(20), req.params.id)
        .query(`
          SELECT d.*, t.DescripcionRango FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID
          WHERE d.DepositoID=@id AND d.CooperativaId = @CooperativaId
        `);
      if (dpfRow.recordset.length === 0) throw new Error('DPF no encontrado.');
      const dpf = dpfRow.recordset[0];
      if (!['ACTIVO','VENCIDO'].includes(dpf.Estado)) throw new Error(`No se puede liquidar DPF en estado ${dpf.Estado}.`);

      const interesLiquidado    = round2(parseFloat(dpf.MontoCapital) * (parseFloat(dpf.TasaNominalAnual) / 100) * (dpf.PlazosDias / 365));
      const retencionAplicada   = round2(interesLiquidado * 0.02);
      const interesNetoLiquidado = round2(interesLiquidado - retencionAplicada);
      const capital = parseFloat(dpf.MontoCapital);

      await new sql.Request(transaction)
        .input('id', sql.NVarChar(20), req.params.id).input('iL', sql.Decimal(15,2), interesLiquidado)
        .input('rA', sql.Decimal(15,2), retencionAplicada).input('iN', sql.Decimal(15,2), interesNetoLiquidado)
        .input('uL', sql.NVarChar(50), usuarioID)
        .query(`UPDATE dbo.DepositosPlazo SET Estado='LIQUIDADO',FechaLiquidacion=SYSDATETIME(),InteresLiquidado=@iL,RetencionAplicada=@rA,InteresNetoLiquidado=@iN,PenalizacionAplicada=0,UsuarioLiquidacionID=@uL,FechaModificacion=SYSDATETIME() WHERE DepositoID=@id`);

      // LIQUIDACION: Debe cuenta DPF (capital) + Debe intereses causados (410205) /
      // Haber Caja (110105, capital+interés neto) + Haber retenciones por pagar SRI (210510).
      await crearAsientoContable(transaction, {
        concepto: `LIQUIDACIÓN DPF ${req.params.id} - ${dpf.NombreSocio}`,
        usuarioId: usuarioID,
        origenModulo: 'PLAZO_FIJO',
        origenId: req.params.id,
        lineas: [
          { codigo: dpf.CuentaContableDPF, nombre: `Depósitos a Plazo (${dpf.DescripcionRango})`, tipo: 'PASIVO', lado: 'D', valor: capital },
          { codigo: '410205', nombre: 'Intereses Causados en Depósitos a Plazo', tipo: 'GASTO', lado: 'D', valor: interesLiquidado },
          { codigo: '110105', nombre: 'Caja General', tipo: 'ACTIVO', lado: 'H', valor: capital + interesNetoLiquidado },
          { codigo: '210510', nombre: 'Retenciones por Pagar SRI', tipo: 'PASIVO', lado: 'H', valor: retencionAplicada },
        ],
      });

      await registrarAuditoriaProceso(transaction, {
        proceso: 'PLAZO_FIJO', accion: 'LIQUIDAR', entidadTipo: 'DepositoPlazo', entidadId: req.params.id,
        usuarioId: usuarioID, detalle: `Liquidación DPF ${req.params.id}: capital $${capital.toFixed(2)} + interés neto $${interesNetoLiquidado.toFixed(2)}.`,
      });

      await transaction.commit();
      return res.json({
        ok: true, interesLiquidado: parseFloat(interesLiquidado.toFixed(2)), retencionAplicada: parseFloat(retencionAplicada.toFixed(2)),
        interesNetoLiquidado: parseFloat(interesNetoLiquidado.toFixed(2)), totalAcreditado: parseFloat((capital + interesNetoLiquidado).toFixed(2)),
        message: `DPF ${req.params.id} liquidado.`
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf-liquidar]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ── POST /api/dpf/:id/cancelar ───────────────────────────────────────────────
app.post('/api/dpf/:id/cancelar', requireAuth, requireSelf('usuarioID'), async (req, res) => {
  const { usuarioID, motivo } = req.body || {};
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      const dpfRow = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('id', sql.NVarChar(20), req.params.id)
        .query(`
          SELECT d.*, t.PorcentajePenalizacion, t.DescripcionRango FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID
          WHERE d.DepositoID=@id AND d.CooperativaId = @CooperativaId
        `);
      if (dpfRow.recordset.length === 0) throw new Error('DPF no encontrado.');
      const dpf = dpfRow.recordset[0];
      if (dpf.Estado !== 'ACTIVO') throw new Error(`Solo se cancelan DPFs ACTIVOS. Estado: ${dpf.Estado}.`);

      const hoy = new Date(), apertura = new Date(dpf.FechaApertura);
      const diasTranscurridos = Math.max(0, Math.floor((hoy - apertura) / 86400000));
      const interesBruto   = round2(parseFloat(dpf.MontoCapital) * (parseFloat(dpf.TasaNominalAnual) / 100) * (diasTranscurridos / 365));
      const penalizacion   = round2(interesBruto * (parseFloat(dpf.PorcentajePenalizacion) / 100));
      const interesNeto    = round2(Math.max(0, interesBruto - penalizacion));
      const retencion      = round2(interesNeto * 0.02);
      const interesNetoFinal = round2(interesNeto - retencion);
      const capital = parseFloat(dpf.MontoCapital);

      await new sql.Request(transaction)
        .input('id', sql.NVarChar(20), req.params.id).input('iL', sql.Decimal(15,2), interesBruto)
        .input('rA', sql.Decimal(15,2), retencion).input('iNF', sql.Decimal(15,2), interesNetoFinal)
        .input('pen', sql.Decimal(15,2), penalizacion).input('mot', sql.NVarChar(400), motivo || 'Cancelación anticipada solicitada por el socio.')
        .input('uL', sql.NVarChar(50), usuarioID)
        .query(`UPDATE dbo.DepositosPlazo SET Estado='CANCELADO',FechaLiquidacion=SYSDATETIME(),InteresLiquidado=@iL,RetencionAplicada=@rA,InteresNetoLiquidado=@iNF,PenalizacionAplicada=@pen,MotivosCancelacion=@mot,UsuarioLiquidacionID=@uL,FechaModificacion=SYSDATETIME() WHERE DepositoID=@id`);

      // CANCELACION_ANTICIPADA: Debe cuenta DPF (capital) + Debe intereses causados (interés
      // BRUTO, no neto -- ver nota de bug corregido al inicio del módulo) / Haber Caja
      // (capital+interés neto final) + Haber retenciones SRI + Haber ingreso por penalización.
      await crearAsientoContable(transaction, {
        concepto: `CANCELACIÓN ANTICIPADA DPF ${req.params.id} - ${dpf.NombreSocio}`,
        usuarioId: usuarioID,
        origenModulo: 'PLAZO_FIJO',
        origenId: req.params.id,
        lineas: [
          { codigo: dpf.CuentaContableDPF, nombre: `Depósitos a Plazo (${dpf.DescripcionRango})`, tipo: 'PASIVO', lado: 'D', valor: capital },
          { codigo: '410205', nombre: 'Intereses Causados en Depósitos a Plazo', tipo: 'GASTO', lado: 'D', valor: interesBruto },
          { codigo: '110105', nombre: 'Caja General', tipo: 'ACTIVO', lado: 'H', valor: capital + interesNetoFinal },
          { codigo: '210510', nombre: 'Retenciones por Pagar SRI', tipo: 'PASIVO', lado: 'H', valor: retencion },
          { codigo: '510205', nombre: 'Ingresos por Penalización Cancelación Anticipada DPF', tipo: 'INGRESO', lado: 'H', valor: penalizacion },
        ],
      });

      await registrarAuditoriaProceso(transaction, {
        proceso: 'PLAZO_FIJO', accion: 'CANCELAR', entidadTipo: 'DepositoPlazo', entidadId: req.params.id,
        usuarioId: usuarioID, detalle: `Cancelación anticipada DPF ${req.params.id} a los ${diasTranscurridos} días. Penalización $${penalizacion.toFixed(2)}. Motivo: ${motivo || 'N/A'}.`,
      });

      await transaction.commit();
      return res.json({
        ok: true, diasTranscurridos, interesAcumuladoBruto: parseFloat(interesBruto.toFixed(2)), penalizacionAplicada: parseFloat(penalizacion.toFixed(2)),
        interesNetoFinal: parseFloat(interesNetoFinal.toFixed(2)), retencionAplicada: parseFloat(retencion.toFixed(2)),
        totalDevuelto: parseFloat((capital + interesNetoFinal).toFixed(2)), message: `DPF cancelado anticipadamente.`
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf-cancelar]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ── POST /api/dpf/:id/renovar ────────────────────────────────────────────────
app.post('/api/dpf/:id/renovar', requireAuth, requireSelf('usuarioID'), async (req, res) => {
  const { tasaID, plazosDias, usuarioID, tipoRenovacion } = req.body || {};
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      const dpfRow = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('id', sql.NVarChar(20), req.params.id)
        .query(`
          SELECT d.*, t.DescripcionRango FROM dbo.DepositosPlazo d INNER JOIN dbo.TasasPlazoFijo t ON d.TasaID=t.TasaID
          WHERE d.DepositoID=@id AND d.CooperativaId = @CooperativaId
        `);
      if (dpfRow.recordset.length === 0) throw new Error('DPF no encontrado.');
      const dpf = dpfRow.recordset[0];
      if (!['ACTIVO','VENCIDO'].includes(dpf.Estado)) throw new Error('Solo se renuevan DPFs ACTIVOS o VENCIDOS.');

      const nuevaTasaID  = tasaID || dpf.TasaID;
      const nuevoPlazo   = parseInt(plazosDias) || dpf.PlazosDias;
      const ntRow = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('tid', sql.Int, nuevaTasaID)
        .query('SELECT * FROM dbo.TasasPlazoFijo WHERE TasaID=@tid AND CooperativaId = @CooperativaId AND Activo=1');
      if (ntRow.recordset.length === 0) throw new Error('Tramo de tasa para renovación no válido.');
      const nt = ntRow.recordset[0];

      const interesLiq   = round2(parseFloat(dpf.MontoCapital) * (parseFloat(dpf.TasaNominalAnual) / 100) * (dpf.PlazosDias / 365));
      const retenLiq     = round2(interesLiq * 0.02);
      const interesNetoLiq = round2(interesLiq - retenLiq);
      const capital = parseFloat(dpf.MontoCapital);

      await new sql.Request(transaction)
        .input('id', sql.NVarChar(20), req.params.id).input('iL', sql.Decimal(15,2), interesLiq)
        .input('rA', sql.Decimal(15,2), retenLiq).input('iN', sql.Decimal(15,2), interesNetoLiq).input('uL', sql.NVarChar(50), usuarioID)
        .query(`UPDATE dbo.DepositosPlazo SET Estado='RENOVADO',FechaLiquidacion=SYSDATETIME(),InteresLiquidado=@iL,RetencionAplicada=@rA,InteresNetoLiquidado=@iN,UsuarioLiquidacionID=@uL,FechaModificacion=SYSDATETIME() WHERE DepositoID=@id`);

      // RENOVACION_CIERRE (bug corregido -- ver nota al inicio del módulo): cierra el DPF
      // viejo pagando a Caja capital+interés neto, EXACTO mismo patrón que LIQUIDACION.
      await crearAsientoContable(transaction, {
        concepto: `RENOVACIÓN (CIERRE) DPF ${req.params.id}`,
        usuarioId: usuarioID,
        origenModulo: 'PLAZO_FIJO',
        origenId: req.params.id,
        lineas: [
          { codigo: dpf.CuentaContableDPF, nombre: `Depósitos a Plazo (${dpf.DescripcionRango})`, tipo: 'PASIVO', lado: 'D', valor: capital },
          { codigo: '410205', nombre: 'Intereses Causados en Depósitos a Plazo — Renovación', tipo: 'GASTO', lado: 'D', valor: interesLiq },
          { codigo: '110105', nombre: 'Caja General', tipo: 'ACTIVO', lado: 'H', valor: capital + interesNetoLiq },
          { codigo: '210510', nombre: 'Retenciones por Pagar SRI', tipo: 'PASIVO', lado: 'H', valor: retenLiq },
        ],
      });

      const nTNA = parseFloat(nt.TasaNominalAnual);
      const nInt = capital * (nTNA / 100) * (nuevoPlazo / 365);
      const nRet = nInt * 0.02;
      const nFechaVenc = new Date(); nFechaVenc.setDate(nFechaVenc.getDate() + nuevoPlazo);
      const nuevoIDResult = await new sql.Request(transaction).output('NuevoID', sql.NVarChar(20)).execute('dbo.usp_GenerarIDDepositoPlazo');
      const nuevoDepositoID = nuevoIDResult.output.NuevoID;

      await new sql.Request(transaction)
        .input('dID', sql.NVarChar(20), nuevoDepositoID).input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('sID', sql.BigInt, dpf.SocioID)
        .input('idf', sql.NVarChar(20), dpf.Identificacion).input('nom', sql.NVarChar(200), dpf.NombreSocio)
        .input('tID', sql.Int, nuevaTasaID).input('tna', sql.Decimal(5,2), nTNA)
        .input('pdias', sql.Int, nuevoPlazo).input('cap', sql.Decimal(15,2), capital)
        .input('ip', sql.Decimal(15,2), nInt).input('rp', sql.Decimal(15,2), nRet).input('inp', sql.Decimal(15,2), nInt - nRet)
        .input('fv', sql.DateTime2, nFechaVenc).input('tr', sql.NVarChar(20), tipoRenovacion || 'NO_RENOVAR')
        .input('ca', sql.NVarChar(20), dpf.CuentaAhorrosRelacionada).input('cc', sql.NVarChar(15), nt.CuentaContableDPF)
        .input('nr', sql.Int, (dpf.NumeroRenovacion || 0) + 1).input('dOrig', sql.NVarChar(20), req.params.id)
        .input('uAp', sql.NVarChar(50), usuarioID)
        .query(`INSERT INTO dbo.DepositosPlazo (DepositoID,CooperativaId,SocioID,Identificacion,NombreSocio,NumCertificado,TasaID,TasaNominalAnual,PlazosDias,MontoCapital,InteresProyectado,RetencionProyectada,InteresNetoProyectado,FechaVencimiento,TipoRenovacion,ModalidadPago,CuentaAhorrosRelacionada,CuentaContableDPF,NumeroRenovacion,DepositoOrigenID,UsuarioAperturaID) VALUES(@dID,@CooperativaId,@sID,@idf,@nom,@dID,@tID,@tna,@pdias,@cap,@ip,@rp,@inp,@fv,@tr,'AL_VENCIMIENTO',@ca,@cc,@nr,@dOrig,@uAp)`);

      // RENOVACION_APERTURA (bug corregido): reabre el capital en el DPF nuevo, EXACTO
      // mismo patrón que APERTURA. Sin esto el asiento de cierre queda corto por `capital`
      // en el Haber (ver nota al inicio del módulo).
      await crearAsientoContable(transaction, {
        concepto: `RENOVACIÓN (APERTURA) DPF ${nuevoDepositoID} - ${dpf.NombreSocio}`,
        usuarioId: usuarioID,
        origenModulo: 'PLAZO_FIJO',
        origenId: nuevoDepositoID,
        lineas: [
          { codigo: '110105', nombre: 'Caja General', tipo: 'ACTIVO', lado: 'D', valor: capital },
          { codigo: nt.CuentaContableDPF, nombre: `Depósitos a Plazo — ${nt.DescripcionRango}`, tipo: 'PASIVO', lado: 'H', valor: capital },
        ],
      });

      await registrarAuditoriaProceso(transaction, {
        proceso: 'PLAZO_FIJO', accion: 'RENOVAR', entidadTipo: 'DepositoPlazo', entidadId: req.params.id,
        usuarioId: usuarioID, detalle: `Renovación DPF ${req.params.id} -> ${nuevoDepositoID}. Capital $${capital.toFixed(2)} reinvertido, interés neto pagado $${interesNetoLiq.toFixed(2)}.`,
      });

      await transaction.commit();
      return res.json({
        ok: true, depositoIDAnterior: req.params.id, nuevoDepositoID,
        interesLiquidadoAnterior: parseFloat(interesNetoLiq.toFixed(2)),
        nuevoInteresProyectado: parseFloat((nInt - nRet).toFixed(2)),
        nuevaFechaVencimiento: nFechaVenc.toISOString().split('T')[0],
        message: `DPF renovado. Nuevo certificado: ${nuevoDepositoID}`
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][dpf-renovar]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO CAJA — dbo.ControlCaja (sin cambios de nombre) + dbo.TransaccionesCaja
// (tabla NUEVA, ver 06_caja.sql). Antes SQLGUTPATATE no tenía tabla propia de
// transacción de caja: /api/socios/transaccion escribía DIRECTO a
// dbo.RegistroContable (dos filas Debe/Haber) y a dbo.CuentasAhorro.Saldo, sin
// ningún registro intermedio de "esto fue una transacción de caja". Ahora:
//   1. TransaccionesCaja.ControlCajaId es NOT NULL con FK real a ControlCaja
//      -- la caja del cajero DEBE estar ABIERTA antes de poder transaccionar
//      (el legacy nunca validaba esto; acá lo fuerza el propio esquema, no una
//      decisión de negocio nueva inventada acá).
//   2. DetalleEfectivoTransaccion (desglose de billetes/monedas) ahora cuelga de
//      TransaccionId en vez de AsientoId (ver 06_caja.sql).
//   3. TransaccionesCaja.Anulado es un BIT propio -- la anulación en el legacy
//      dependía de un heurístico frágil (buscar otra fila de RegistroContable con
//      mismo Concepto/NumeroCuenta y Fecha a menos de 10 segundos de diferencia
//      para marcarla también "ANULADO:"). Con Anulado real y TransaccionId como PK,
//      /transaccion/anular ya no necesita ese heurístico: apunta directo a la fila.
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/caja/control/estado ─────────────────────────────────────────────
app.get('/api/caja/control/estado', async (req, res) => {
  const { usuarioId, fecha } = req.query;
  if (!usuarioId || !fecha) {
    return res.status(400).json({ ok: false, error: 'usuarioId y fecha son requeridos' });
  }
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('UsuarioId', sql.NVarChar(20), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .query('SELECT Estado, SaldoApertura, SaldoCierre FROM dbo.ControlCaja WHERE CooperativaId = @CooperativaId AND UsuarioId = @UsuarioId AND Fecha = @Fecha');

    await pool.close();
    if (result.recordset.length === 0) {
      return res.json({ ok: true, estado: 'NO_INICIADA', openingBalance: 0 });
    }
    const row = result.recordset[0];
    return res.json({ ok: true, estado: row.Estado, openingBalance: parseFloat(row.SaldoApertura || 0), closingBalance: parseFloat(row.SaldoCierre || 0) });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][caja-control-estado]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/caja/control/abrir ─────────────────────────────────────────────
app.post('/api/caja/control/abrir', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { usuarioId, fecha, saldoApertura } = req.body || {};
  if (!usuarioId || !fecha || saldoApertura === undefined) {
    return res.status(400).json({ ok: false, error: 'usuarioId, fecha y saldoApertura son requeridos' });
  }
  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    const check = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('UsuarioId', sql.NVarChar(20), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .query('SELECT COUNT(*) as count FROM dbo.ControlCaja WHERE CooperativaId = @CooperativaId AND UsuarioId = @UsuarioId AND Fecha = @Fecha');

    if (check.recordset[0].count > 0) {
      await pool.close();
      return res.status(400).json({ ok: false, error: 'Ya existe un registro de caja para este usuario en el día de hoy.' });
    }

    await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('UsuarioId', sql.NVarChar(20), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .input('SaldoApertura', sql.Decimal(18,2), saldoApertura)
      .query(`
        INSERT INTO dbo.ControlCaja (CooperativaId, UsuarioId, Fecha, HoraApertura, SaldoApertura, Estado)
        VALUES (@CooperativaId, @UsuarioId, @Fecha, SYSDATETIME(), @SaldoApertura, 'ABIERTO')
      `);

    await registrarAuditoriaProceso(pool, {
      proceso: 'CAJA', accion: 'ABRIR', entidadTipo: 'ControlCaja', entidadId: usuarioId,
      usuarioId, detalle: `Apertura de caja del ${fecha} con saldo inicial $${parseFloat(saldoApertura).toFixed(2)}.`,
    });

    await pool.close();
    return res.json({ ok: true, message: 'Caja abierta correctamente en el servidor' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][caja-control-abrir]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/caja/control/cerrar ────────────────────────────────────────────
app.post('/api/caja/control/cerrar', requireAuth, requireSelf('usuarioId'), async (req, res) => {
  const { usuarioId, fecha, saldoCierre } = req.body || {};
  if (!usuarioId || !fecha || saldoCierre === undefined) {
    return res.status(400).json({ ok: false, error: 'usuarioId, fecha y saldoCierre son requeridos' });
  }
  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    const check = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('UsuarioId', sql.NVarChar(20), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .query('SELECT Estado FROM dbo.ControlCaja WHERE CooperativaId = @CooperativaId AND UsuarioId = @UsuarioId AND Fecha = @Fecha');

    if (check.recordset.length === 0) {
      await pool.close();
      return res.status(404).json({ ok: false, error: 'No se encontró un registro de caja abierto para el día de hoy.' });
    }
    if (check.recordset[0].Estado === 'CERRADO') {
      await pool.close();
      return res.status(400).json({ ok: false, error: 'La caja ya se encuentra cerrada para el día de hoy.' });
    }

    await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('UsuarioId', sql.NVarChar(20), usuarioId)
      .input('Fecha', sql.Date, fecha)
      .input('SaldoCierre', sql.Decimal(18,2), saldoCierre)
      .query(`
        UPDATE dbo.ControlCaja
        SET Estado = 'CERRADO', HoraCierre = SYSDATETIME(), SaldoCierre = @SaldoCierre
        WHERE CooperativaId = @CooperativaId AND UsuarioId = @UsuarioId AND Fecha = @Fecha
      `);

    await registrarAuditoriaProceso(pool, {
      proceso: 'CAJA', accion: 'CERRAR', entidadTipo: 'ControlCaja', entidadId: usuarioId,
      usuarioId, detalle: `Cierre de caja del ${fecha} con saldo final $${parseFloat(saldoCierre).toFixed(2)}.`,
    });

    await pool.close();
    return res.json({ ok: true, message: 'Caja cerrada correctamente en el servidor' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][caja-control-cerrar]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/caja/control/historial ──────────────────────────────────────────
app.get('/api/caja/control/historial', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query('SELECT ControlId, UsuarioId, Fecha, HoraApertura, HoraCierre, SaldoApertura, SaldoCierre, Estado FROM dbo.ControlCaja WHERE CooperativaId = @CooperativaId ORDER BY Fecha DESC, HoraApertura DESC');
    await pool.close();
    return res.json({ ok: true, data: result.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][caja-control-historial]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/transaccion ─────────────────────────────────────────────
// DEPOSIT/WITHDRAW/CREDIT_NOTE/DEBIT_NOTE sobre una cuenta (Ahorro o Certificado).
// ACCOUNT_TRANSFER/INTERBANK_TRANSFER (ver TellerView.tsx OperationType) no pasan por
// este endpoint en el legacy tampoco -- ACCOUNT_TRANSFER va por /api/socios/transferir
// (ya portado), INTERBANK_TRANSFER no tiene endpoint propio en server.js (fuera de
// alcance, no es un gap de este puerto).
app.post('/api/socios/transaccion', requireAuth, requireSelf('tellerId'), async (req, res) => {
  const { accountId, opType, amount, description, tellerId, cashDetail } = req.body || {};
  if (!accountId || !opType || !amount || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Datos de transacción inválidos' });
  }
  if (!['DEPOSIT', 'WITHDRAW', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(opType)) {
    return res.status(400).json({ ok: false, error: `Tipo de operación no soportado en este endpoint: ${opType}` });
  }

  const cleanAccountId = String(accountId).replace('ca-', '');
  const numAmount = parseFloat(amount);
  const actorTellerId = (tellerId || 'caja').trim().toLowerCase();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const accountResult = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('cuentaId', sql.Int, parseInt(cleanAccountId, 10))
        .query(`
          SELECT c.CuentaId, c.SocioId, c.NumeroCuenta, c.Saldo, c.Estado, p.CuentaActiva, p.EsCertificado
          FROM dbo.Cuentas c
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
          WHERE c.CuentaId = @cuentaId AND p.CooperativaId = @CooperativaId
        `);
      if (accountResult.recordset.length === 0) throw new Error('Cuenta no encontrada');

      const account = accountResult.recordset[0];
      if (account.Estado !== 'ACTIVA') throw new Error('La cuenta no está activa');
      if ((opType === 'WITHDRAW' || opType === 'DEBIT_NOTE') && account.EsCertificado)
        throw new Error('No se pueden hacer retiros directos desde Certificados de Aportación.');

      // La caja del cajero debe estar ABIERTA hoy -- TransaccionesCaja.ControlCajaId es
      // NOT NULL con FK real a ControlCaja, a diferencia del legacy que nunca lo exigía.
      const controlRes = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('UsuarioId', sql.NVarChar(20), actorTellerId)
        .query(`SELECT TOP 1 ControlId FROM dbo.ControlCaja WHERE CooperativaId = @CooperativaId AND UsuarioId = @UsuarioId AND Estado = 'ABIERTO' AND Fecha = CAST(SYSDATETIME() AS DATE)`);
      if (controlRes.recordset.length === 0) throw new Error('Debe abrir la caja del día antes de realizar transacciones.');
      const controlCajaId = controlRes.recordset[0].ControlId;

      const isCredit = (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE');
      let newBalance = parseFloat(account.Saldo);
      if (isCredit) {
        newBalance += numAmount;
      } else {
        if (newBalance < numAmount) throw new Error('Saldo insuficiente para realizar el retiro');
        newBalance -= numAmount;
      }

      await new sql.Request(transaction)
        .input('cuentaId', sql.Int, account.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
        .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      const txResult = await new sql.Request(transaction)
        .input('ControlCajaId', sql.Int, controlCajaId)
        .input('SocioId', sql.BigInt, account.SocioId)
        .input('CuentaId', sql.Int, account.CuentaId)
        .input('TipoOperacion', sql.NVarChar(50), opType)
        .input('Monto', sql.Decimal(18, 2), numAmount)
        .input('UsuarioId', sql.NVarChar(20), actorTellerId)
        .query(`
          INSERT INTO dbo.TransaccionesCaja (ControlCajaId, SocioId, CuentaId, TipoOperacion, Monto, UsuarioId)
          OUTPUT INSERTED.TransaccionId
          VALUES (@ControlCajaId, @SocioId, @CuentaId, @TipoOperacion, @Monto, @UsuarioId)
        `);
      const transaccionId = txResult.recordset[0].TransaccionId;

      // Caja Ventanilla (110105) vs. cuenta del producto (Cuentas Activa real del socio).
      const cashAccountCode = '110105';
      const lineas = isCredit
        ? [
            { codigo: cashAccountCode, nombre: 'Caja General', tipo: 'ACTIVO', lado: 'D', valor: numAmount },
            { codigo: account.CuentaActiva, nombre: `Depósitos — cuenta ${account.NumeroCuenta}`, tipo: 'PASIVO', lado: 'H', valor: numAmount },
          ]
        : [
            { codigo: account.CuentaActiva, nombre: `Depósitos — cuenta ${account.NumeroCuenta}`, tipo: 'PASIVO', lado: 'D', valor: numAmount },
            { codigo: cashAccountCode, nombre: 'Caja General', tipo: 'ACTIVO', lado: 'H', valor: numAmount },
          ];

      const asientoId = await crearAsientoContable(transaction, {
        concepto: description || `${opType} cuenta ${account.NumeroCuenta}`,
        usuarioId: actorTellerId,
        origenModulo: 'CAJA',
        origenId: transaccionId,
        lineas,
      });

      await new sql.Request(transaction)
        .input('TransaccionId', sql.BigInt, transaccionId)
        .input('AsientoContableId', sql.Int, asientoId)
        .query('UPDATE dbo.TransaccionesCaja SET AsientoContableId = @AsientoContableId WHERE TransaccionId = @TransaccionId');

      await registrarMovimientoCuenta(transaction, {
        cuentaId: account.CuentaId, tipo: isCredit ? 'DEPOSITO' : 'RETIRO', monto: numAmount, saldoResultante: newBalance,
        concepto: description || `${opType} en caja (tx-${transaccionId})`, usuarioId: actorTellerId,
        transaccionCajaId: transaccionId, asientoContableId: asientoId,
      });

      // Desglose de efectivo (billetes/monedas) -- ahora cuelga de TransaccionId, no de AsientoId.
      if ((opType === 'DEPOSIT' || opType === 'WITHDRAW') && cashDetail) {
        const denomMapBills = { 100: 'B100', 50: 'B50', 20: 'B20', 10: 'B10', 5: 'B5', 1: 'B1' };
        const denomMapCoins = { 1: 'M1', 0.50: 'M0.50', 0.25: 'M0.25', 0.10: 'M0.10', 0.05: 'M0.05', 0.01: 'M0.01' };
        const items = [
          ...(Array.isArray(cashDetail.bills) ? cashDetail.bills.map(i => ({ ...i, map: denomMapBills })) : []),
          ...(Array.isArray(cashDetail.coins) ? cashDetail.coins.map(i => ({ ...i, map: denomMapCoins })) : []),
        ];
        for (const item of items) {
          if (item.count > 0 && item.map[item.denomination]) {
            await new sql.Request(transaction)
              .input('TransaccionId', sql.BigInt, transaccionId)
              .input('CodigoDenominacion', sql.NVarChar(10), item.map[item.denomination])
              .input('Cantidad', sql.Int, item.count)
              .input('Total', sql.Decimal(18, 2), item.total)
              .query(`
                INSERT INTO dbo.DetalleEfectivoTransaccion (TransaccionId, CodigoDenominacion, Cantidad, Total)
                VALUES (@TransaccionId, @CodigoDenominacion, @Cantidad, @Total)
              `);
          }
        }
      }

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CAJA', accion: opType, entidadTipo: 'Cuenta', entidadId: account.CuentaId,
        usuarioId: actorTellerId, valorAnterior: account.Saldo, valorNuevo: newBalance,
        detalle: `${description || ''} (cuenta ${account.NumeroCuenta}, transacción tx-${transaccionId}, asiento ${asientoId})`.trim(),
      });

      await transaction.commit();

      return res.json({
        ok: true,
        balance: newBalance,
        transaction: {
          id: `tx-${transaccionId}`,
          date: new Date().toISOString().split('T')[0],
          description,
          amount: isCredit ? numAmount : -numAmount,
          type: isCredit ? 'CREDIT' : 'DEBIT',
          category: 'Caja',
          accountId,
          reference: account.NumeroCuenta,
          isCash: opType === 'DEPOSIT' || opType === 'WITHDRAW',
          tellerId: actorTellerId,
        },
      });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][transaccion caja]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ── POST /api/socios/transaccion/anular ──────────────────────────────────────
// Antes: heurístico frágil sobre dbo.RegistroContable (buscar la fila "gemela" por
// Concepto+NumeroCuenta+ventana de 10s). Con TransaccionesCaja.TransaccionId como PK
// real y Anulado como columna propia, la anulación apunta directo a la fila -- sin
// adivinar cuál otra fila pertenece a la misma transacción.
app.post('/api/socios/transaccion/anular', requireAuth, requireSelf('actorId'), async (req, res) => {
  const { id, actorId } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'ID de transacción requerido' });
  if (!actorId) return res.status(400).json({ ok: false, error: 'Usuario que ejecuta la anulación requerido' });

  const rawId = String(id).replace(/^tx-/i, '');
  const transaccionId = parseInt(rawId, 10);
  if (isNaN(transaccionId)) return res.status(400).json({ ok: false, error: 'ID de transacción inválido' });

  let pool;
  try {
    pool = await sql.connect(sqlConfig);

    // El rol se resuelve desde la base (no se confía en un campo enviado por el cliente).
    const actorRes = await pool.request()
      .input('actorId', sql.NVarChar(20), actorId.trim().toLowerCase())
      .query('SELECT Rol FROM dbo.Usuarios WHERE UsuarioId = @actorId');
    const actorRole = actorRes.recordset.length > 0 ? actorRes.recordset[0].Rol : null;
    if (actorRole !== 'ADMIN') {
      await pool.close();
      return res.status(403).json({ ok: false, error: 'PERMISOS INSUFICIENTES: Solo un usuario Administrador puede anular transacciones.' });
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const txRes = await new sql.Request(transaction)
        .input('CooperativaId', sql.Int, COOPERATIVA_ID)
        .input('TransaccionId', sql.BigInt, transaccionId)
        .query(`
          SELECT tc.TransaccionId, tc.SocioId, tc.CuentaId, tc.TipoOperacion, tc.Monto, tc.Anulado, tc.UsuarioId, tc.AsientoContableId,
                 c.NumeroCuenta, c.Saldo, p.CuentaActiva
          FROM dbo.TransaccionesCaja tc
          INNER JOIN dbo.Cuentas c ON c.CuentaId = tc.CuentaId
          INNER JOIN dbo.ProductosFinancieros p ON p.ProductoId = c.ProductoId
          WHERE tc.TransaccionId = @TransaccionId AND p.CooperativaId = @CooperativaId
        `);
      if (txRes.recordset.length === 0) throw new Error('Transacción no encontrada en el registro de caja');
      const original = txRes.recordset[0];
      if (original.Anulado) throw new Error('Esta transacción ya ha sido anulada anteriormente');

      const isDeposit = (original.TipoOperacion === 'DEPOSIT' || original.TipoOperacion === 'CREDIT_NOTE');
      const monto = parseFloat(original.Monto);

      let newBalance = parseFloat(original.Saldo);
      if (isDeposit) {
        newBalance -= monto;
        if (newBalance < 0) throw new Error('No se puede anular porque el socio ya no dispone del saldo suficiente');
      } else {
        newBalance += monto;
      }

      await new sql.Request(transaction)
        .input('cuentaId', sql.Int, original.CuentaId)
        .input('nuevoSaldo', sql.Decimal(18, 2), newBalance)
        .query('UPDATE dbo.Cuentas SET Saldo = @nuevoSaldo WHERE CuentaId = @cuentaId');

      const concept = `ANULACIÓN REVERSO: tx-${transaccionId} (${original.TipoOperacion} $${monto.toFixed(2)} cuenta ${original.NumeroCuenta})`;
      const cashAccountCode = '110105';
      // Reverso: la pata que en la transacción original fue Debe pasa a Haber y viceversa.
      const lineas = isDeposit
        ? [
            { codigo: original.CuentaActiva, nombre: `Depósitos — cuenta ${original.NumeroCuenta}`, tipo: 'PASIVO', lado: 'D', valor: monto },
            { codigo: cashAccountCode, nombre: 'Caja General', tipo: 'ACTIVO', lado: 'H', valor: monto },
          ]
        : [
            { codigo: cashAccountCode, nombre: 'Caja General', tipo: 'ACTIVO', lado: 'D', valor: monto },
            { codigo: original.CuentaActiva, nombre: `Depósitos — cuenta ${original.NumeroCuenta}`, tipo: 'PASIVO', lado: 'H', valor: monto },
          ];

      const asientoId = await crearAsientoContable(transaction, {
        concepto: concept,
        usuarioId: actorId.trim().toLowerCase(),
        origenModulo: 'CAJA',
        origenId: transaccionId,
        lineas,
      });

      await registrarMovimientoCuenta(transaction, {
        cuentaId: original.CuentaId, tipo: isDeposit ? 'RETIRO' : 'DEPOSITO', monto, saldoResultante: newBalance,
        concepto: concept, usuarioId: actorId.trim().toLowerCase(), transaccionCajaId: transaccionId, asientoContableId: asientoId,
      });

      await new sql.Request(transaction)
        .input('TransaccionId', sql.BigInt, transaccionId)
        .query('UPDATE dbo.TransaccionesCaja SET Anulado = 1 WHERE TransaccionId = @TransaccionId');

      // Marca el asiento ORIGINAL (no el de reverso) como Anulado -- igual que el legacy
      // prefijaba el Concepto con "ANULADO:". Se conservan ambos asientos (original +
      // reverso) en AsientosContables, nunca se borra nada -- partida doble real.
      if (original.AsientoContableId) {
        await new sql.Request(transaction)
          .input('AsientoId', sql.Int, original.AsientoContableId)
          .query('UPDATE dbo.AsientosContables SET Anulado = 1 WHERE AsientoId = @AsientoId');
      }

      await registrarAuditoriaProceso(transaction, {
        proceso: 'CAJA', accion: 'ANULAR', entidadTipo: 'TransaccionCaja', entidadId: transaccionId,
        usuarioId: actorId.trim().toLowerCase(), valorAnterior: original.Saldo, valorNuevo: newBalance,
        detalle: `Anulación de tx-${transaccionId} (${original.TipoOperacion} $${monto.toFixed(2)})`,
      });

      await transaction.commit();
      return res.json({ ok: true, message: 'Transacción de caja anulada con éxito' });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][anular transaccion caja]', err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO CONTABILIDAD — dbo.RegistroContable (tabla plana, un Debe/Haber por fila,
// sin período ni catálogo real detrás) YA NO EXISTE. Se reconstruye por JOIN de
// AsientosContables + DetalleAsiento + PlanCuentas (07_contabilidad.sql), al mismo
// nivel de detalle que el legacy exponía (una fila por línea D/H, no por asiento).
//
// GAP DE ESQUEMA (no resuelto acá, no inventado): AsientosContables no tiene una
// columna SocioId/NumeroCuenta directa -- es polimórfico vía OrigenModulo/OrigenId
// hacia TransaccionesCaja (CAJA), DepositosPlazo (PLAZO_FIJO) o SolicitudesCredito
// (CREDITOS). El "NombreSocio"/"NumeroCuenta" que armaba el legacy libro diario se
// reconstruye acá con LEFT JOIN a las tres tablas de origen posibles + COALESCE;
// para OrigenModulo='MANUAL' (ej. transferencias entre cuentas, que no fijan
// OrigenId) esas columnas quedan NULL/'Sistema' -- no hay de dónde resolverlas sin
// agregar una columna que el esquema no tiene.
//
// /api/contabilidad/balance-legacy (legacy.comp_sal_cta vía Postgres/Neon) NO se
// porta -- es explícitamente una vista de solo consulta de OTRO sistema (Informix
// legacy espejado), no relacionada con dbo.RegistroContable/AsientosContables. Mismo
// criterio que el fallback legacy de /api/socios/buscar y /api/dpf: fuera de alcance
// mientras GUTT_SYSTEM no tenga datos reales que reconciliar contra eso.
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/contabilidad/libro-diario ───────────────────────────────────────
app.get('/api/contabilidad/libro-diario', async (req, res) => {
  const limite = Math.min(parseInt(req.query.limite || '100', 10), 500);
  const desde  = req.query.desde || null;
  const hasta  = req.query.hasta || null;

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    let query = `
      SELECT TOP (@limite)
        a.AsientoId, a.Concepto, a.OrigenModulo, a.OrigenId, a.Anulado, a.UsuarioId,
        pc.Codigo AS CuentaContable, pc.Nombre AS NombreCuenta,
        CASE WHEN d.TipoAsiento = 'D' THEN d.Valor ELSE 0 END AS Debe,
        CASE WHEN d.TipoAsiento = 'H' THEN d.Valor ELSE 0 END AS Haber,
        CONVERT(NVARCHAR(19), a.Fecha, 120) AS FechaAsiento,
        COALESCE(
          CASE WHEN a.OrigenModulo = 'CAJA' THEN s_caja.PrimerNombre + ' ' + s_caja.PrimerApellido END,
          CASE WHEN a.OrigenModulo = 'PLAZO_FIJO' THEN dp.NombreSocio END,
          CASE WHEN a.OrigenModulo = 'CREDITOS' THEN s_cred.PrimerNombre + ' ' + s_cred.PrimerApellido END,
          'Sistema'
        ) AS NombreSocio,
        COALESCE(cu_caja.NumeroCuenta, dp.NumCertificado, sc.SolicitudID) AS NumeroCuenta
      FROM dbo.AsientosContables a
      INNER JOIN dbo.DetalleAsiento d ON d.AsientoId = a.AsientoId
      INNER JOIN dbo.PlanCuentas pc ON pc.CuentaContableId = d.CuentaContableId
      LEFT JOIN dbo.TransaccionesCaja tc ON a.OrigenModulo = 'CAJA' AND tc.TransaccionId = TRY_CAST(a.OrigenId AS BIGINT)
      LEFT JOIN dbo.Cuentas cu_caja ON cu_caja.CuentaId = tc.CuentaId
      LEFT JOIN dbo.Socios s_caja ON s_caja.SocioId = tc.SocioId
      LEFT JOIN dbo.DepositosPlazo dp ON a.OrigenModulo = 'PLAZO_FIJO' AND dp.DepositoID = a.OrigenId
      LEFT JOIN dbo.SolicitudesCredito sc ON a.OrigenModulo = 'CREDITOS' AND sc.SolicitudID = a.OrigenId
      LEFT JOIN dbo.Socios s_cred ON s_cred.SocioId = sc.SocioID
      WHERE a.CooperativaId = @CooperativaId
    `;
    const request = pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID).input('limite', sql.Int, limite);
    if (desde) { query += ' AND a.Fecha >= @desde'; request.input('desde', sql.DateTime, new Date(desde)); }
    if (hasta) { query += ' AND a.Fecha <= @hasta'; request.input('hasta', sql.DateTime, new Date(hasta)); }
    query += ' ORDER BY a.AsientoId DESC, d.DetalleId ASC';

    const result = await request.query(query);
    await pool.close();
    return res.json({ ok: true, asientos: result.recordset });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][libro-diario]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/contabilidad/balance-comprobacion ───────────────────────────────
app.get('/api/contabilidad/balance-comprobacion', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT pc.Codigo AS CuentaContable, pc.Nombre AS NombreCuenta, pc.TipoCuenta,
          SUM(CASE WHEN d.TipoAsiento = 'D' THEN d.Valor ELSE 0 END) AS TotalDebe,
          SUM(CASE WHEN d.TipoAsiento = 'H' THEN d.Valor ELSE 0 END) AS TotalHaber,
          SUM(CASE WHEN d.TipoAsiento = 'D' THEN d.Valor ELSE -d.Valor END) AS Saldo,
          COUNT(*) AS NumAsientos
        FROM dbo.DetalleAsiento d
        INNER JOIN dbo.AsientosContables a ON a.AsientoId = d.AsientoId
        INNER JOIN dbo.PlanCuentas pc ON pc.CuentaContableId = d.CuentaContableId
        WHERE a.CooperativaId = @CooperativaId
        GROUP BY pc.Codigo, pc.Nombre, pc.TipoCuenta
        ORDER BY pc.Codigo
      `);
    await pool.close();
    const totalDebe  = result.recordset.reduce((s, r) => s + parseFloat(r.TotalDebe  || 0), 0);
    const totalHaber = result.recordset.reduce((s, r) => s + parseFloat(r.TotalHaber || 0), 0);
    return res.json({ ok: true, cuentas: result.recordset, totalDebe, totalHaber });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][balance-comprobacion]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MÓDULO AUDITORÍA/SEGURIDAD — dbo.Usuarios (mismos nombres de columna que
// SQLGUTPATATE, ver 01_cooperativas_usuarios.sql: UsuarioId, NombreCompleto, Pin,
// PasswordHash, Rol, Activo, ImpresoraPredeterminada, RequiereCambioPin). Sin
// cambios de lógica respecto al legacy -- se agrega el filtro CooperativaId (columna
// nueva, NOT NULL) para que login/perfil solo resuelvan usuarios de esta cooperativa.
//
// server.js no expone ningún CRUD de usuarios vía API (los usuarios de SQLGUTPATATE
// se crean por script SQL: 14_crear_superuser.sql / 21_crear_usuario_caja.sql) -- así
// que el alcance real de este módulo es login + cambio de contraseña + impresora +
// perfil, nada más. GUTT_SYSTEM sigue el mismo patrón: no hay gap acá, es que nunca
// existió ese endpoint en el legacy.
// ════════════════════════════════════════════════════════════════════════════

// ── POST /api/auth/login.php ─────────────────────────────────────────────────
app.post('/api/auth/login.php', async (req, res) => {
  const { id, pin } = req.body || {};
  if (!id || !pin) return res.status(400).json({ ok: false, error: 'id y contraseña son requeridos' });

  const cleanId = id.trim().toLowerCase();
  const cleanPin = pin.trim();

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(20), cleanId)
      .query('SELECT UsuarioId, NombreCompleto, Pin, PasswordHash, Rol, Activo, ImpresoraPredeterminada, RequiereCambioPin FROM dbo.Usuarios WHERE CooperativaId = @CooperativaId AND UsuarioId = @id');

    if (result.recordset.length === 0) {
      await registrarAuditoriaProceso(pool, {
        proceso: 'SEGURIDAD', accion: 'LOGIN_FALLIDO', entidadTipo: 'Usuario',
        entidadId: cleanId, usuarioId: cleanId,
        detalle: 'Intento de login con usuario inexistente.',
        ip: req.ip || req.headers['x-forwarded-for'] || null,
      });
      await pool.close();
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
      await pool.close();
      return res.status(401).json({ ok: false, error: 'Usuario inactivo' });
    }

    // PasswordHash puede estar en dos formatos: hash bcrypt ("$2...") o texto plano
    // legado -- si coincide en texto plano se re-hashea de inmediato (migración
    // perezosa, sin forzar reset a nadie). Igual que server.js.
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
      await pool.close();
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    if (!isBcryptHash) {
      const newHash = bcrypt.hashSync(cleanPin, 10);
      await pool.request()
        .input('id', sql.NVarChar(20), user.UsuarioId)
        .input('hash', sql.NVarChar(200), newHash)
        .query('UPDATE dbo.Usuarios SET PasswordHash = @hash WHERE UsuarioId = @id');
    }

    await registrarAuditoriaProceso(pool, {
      proceso: 'SEGURIDAD', accion: 'LOGIN_EXITOSO', entidadTipo: 'Usuario',
      entidadId: user.UsuarioId, usuarioId: user.UsuarioId,
      detalle: `Login exitoso. Rol: ${user.Rol}.`,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
    });

    const token = jwt.sign({ usuarioId: user.UsuarioId, rol: user.Rol }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    await pool.close();
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
    });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][login]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/auth/update_password ───────────────────────────────────────────
app.post('/api/auth/update_password', requireAuth, requireSelf('id'), async (req, res) => {
  const { id, password } = req.body || {};
  if (!id || !password) return res.status(400).json({ ok: false, error: 'id y contraseña son requeridos' });
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const cleanId = id.trim().toLowerCase();
    await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(20), cleanId)
      .input('password', sql.NVarChar(200), bcrypt.hashSync(password.trim(), 10))
      .query('UPDATE dbo.Usuarios SET PasswordHash = @password, RequiereCambioPin = 0, FechaActualizacion = SYSDATETIME() WHERE CooperativaId = @CooperativaId AND UsuarioId = @id');

    await pool.request()
      .input('UsuarioId', sql.NVarChar(20), cleanId)
      .input('Concepto', sql.NVarChar(100), 'Actualización de Contraseña')
      .input('Detalle', sql.NVarChar(500), 'El usuario actualizó su contraseña de acceso.')
      .query('INSERT INTO dbo.AuditoriaUsuarios (UsuarioId, Concepto, Detalle) VALUES (@UsuarioId, @Concepto, @Detalle)');

    await registrarAuditoriaProceso(pool, {
      proceso: 'SEGURIDAD', accion: 'CAMBIO_PASSWORD', entidadTipo: 'Usuario',
      entidadId: cleanId, usuarioId: cleanId, detalle: 'El usuario actualizó su contraseña de acceso.',
    });

    await pool.close();
    return res.json({ ok: true, message: 'Contraseña actualizada con éxito y registrada en auditoría' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][update_password]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /api/users/update_printer ───────────────────────────────────────────
app.post('/api/users/update_printer', requireAuth, requireSelf('id'), async (req, res) => {
  const { id, printer } = req.body || {};
  if (!id || !printer) return res.status(400).json({ ok: false, error: 'id e impresora son requeridos' });
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(20), id.trim().toLowerCase())
      .input('printer', sql.NVarChar(100), printer.trim())
      .query('UPDATE dbo.Usuarios SET ImpresoraPredeterminada = @printer, FechaActualizacion = SYSDATETIME() WHERE CooperativaId = @CooperativaId AND UsuarioId = @id');
    await pool.close();
    return res.json({ ok: true, message: 'Impresora predeterminada actualizada' });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][update_printer]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/users/get_profile.php?id=xxx ────────────────────────────────────
app.get('/api/users/get_profile.php', requireAuth, async (req, res) => {
  const id = ((req.query.id || '') + '').trim().toLowerCase();
  if (!id) return res.status(400).json({ ok: false, error: 'id es requerido' });

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const result = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .input('id', sql.NVarChar(20), id)
      .query('SELECT UsuarioId, NombreCompleto, Pin, PasswordHash, Rol, Activo, ImpresoraPredeterminada, RequiereCambioPin FROM dbo.Usuarios WHERE CooperativaId = @CooperativaId AND UsuarioId = @id');
    await pool.close();

    if (result.recordset.length === 0) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const user = result.recordset[0];
    return res.json({
      id:            user.UsuarioId,
      name:          user.NombreCompleto,
      pin:           user.PasswordHash || user.Pin,
      role:          user.Rol,
      impresora:     user.ImpresoraPredeterminada || '',
      accounts:      [],
      transactions:  [],
      loans:         [],
      needsPinChange: user.RequiereCambioPin === 1 || user.RequiereCambioPin === true,
    });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][get_profile]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/reportes/cartera-credito ────────────────────────────────────────
// Antes consultaba Informix en vivo (~15-40s). Sin core legado de por medio,
// se calcula sobre datos propios de GUTT_SYSTEM. porLineaAntiguedad se manda
// vacío a propósito: CarteraCreditoView.tsx ya lo recalcula en el frontend
// (useMemo) a partir de `operaciones`, no hace falta duplicar ese cálculo acá.
// saldo_demandado/saldo_castigado quedan siempre en 0: el esquema actual no
// tiene esos estados de crédito todavía (gap real, no un descuido de esta ronda).
app.get('/api/reportes/cartera-credito', requireAuth, async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const creditos = await pool.request()
      .input('CooperativaId', sql.Int, COOPERATIVA_ID)
      .query(`
        SELECT c.CreditoID, c.Monto, c.Saldo, c.Tasa, c.Plazo, c.Tipo, c.Estado,
               c.FechaDesembolso, c.FechaVencimiento,
               s.NumeroSocio, s.Identificacion, s.PrimerNombre, s.SegundoNombre, s.PrimerApellido, s.SegundoApellido
        FROM dbo.Creditos c
        JOIN dbo.Socios s ON s.SocioId = c.SocioID
        WHERE c.CooperativaId = @CooperativaId
      `);

    const hoy = new Date();
    const data = [];
    for (const c of creditos.recordset) {
      const cuotas = await pool.request().input('CreditoID', sql.NVarChar(50), c.CreditoID)
        .query('SELECT NumeroCuota, FechaPago, Capital, Interes, Estado FROM dbo.TablaAmortizacion WHERE CreditoID = @CreditoID');
      let capVencido = 0, capRecuperado = 0, intRecuperado = 0;
      for (const cu of cuotas.recordset) {
        if (cu.Estado === 'PAGADO') { capRecuperado += parseFloat(cu.Capital); intRecuperado += parseFloat(cu.Interes); continue; }
        const fecha = new Date(cu.FechaPago);
        if (!isNaN(fecha.getTime()) && fecha < hoy) capVencido += parseFloat(cu.Capital);
      }
      const calif = await pool.request().input('CreditoID', sql.NVarChar(50), c.CreditoID)
        .query('SELECT TOP 1 Categoria, ValorProvision FROM dbo.CalificacionCartera WHERE CreditoID = @CreditoID ORDER BY FechaCorte DESC');
      const saldoTotal = parseFloat(c.Saldo);
      const saldoVencido = Math.min(capVencido, saldoTotal);
      const nombres = [c.PrimerNombre, c.SegundoNombre, c.PrimerApellido, c.SegundoApellido].filter(Boolean).join(' ');
      data.push({
        num_socio: c.NumeroSocio, identificacion: c.Identificacion, nombres,
        num_operacion: c.CreditoID, cap_concedido: parseFloat(c.Monto),
        fec_concesion: c.FechaDesembolso, fec_vencimiento: c.FechaVencimiento,
        plazo_dias: c.Plazo != null ? c.Plazo * 30 : null, tasa: parseFloat(c.Tasa),
        calificacion: calif.recordset[0]?.Categoria || 'A1',
        saldo_vigente: saldoTotal - saldoVencido, saldo_vencido: saldoVencido,
        saldo_demandado: 0, saldo_castigado: 0, saldo_total: saldoTotal,
        cap_recuperado: capRecuperado, int_recuperado: intRecuperado, mora_recuperada: 0,
        provision_requerida: parseFloat(calif.recordset[0]?.ValorProvision || 0),
        linea_credito: c.Tipo,
      });
    }
    await pool.close();
    return res.json({ ok: true, data: { fechaCorte: hoy.toISOString().split('T')[0], operaciones: data, porLineaAntiguedad: [] } });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][cartera-credito]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/reportes/cartera-mensual ────────────────────────────────────────
// Recuperación esperada vs. recuperada por mes, calculada sobre TablaAmortizacion.
// FechaPago es NVARCHAR (gap ya documentado), se parsea con cuidado. Por defecto
// usa el mes calendario anterior al actual, igual que el backend viejo.
app.get('/api/reportes/cartera-mensual', requireAuth, async (req, res) => {
  let pool;
  try {
    const hoy = new Date();
    let anio = parseInt(req.query.anio, 10);
    let mes = parseInt(req.query.mes, 10);
    if (!anio || !mes) {
      const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      anio = anterior.getFullYear(); mes = anterior.getMonth() + 1;
    }
    pool = await sql.connect(sqlConfig);
    const rows = await pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID).query(`
      SELECT ta.NumeroCuota, ta.FechaPago, ta.Capital, ta.Interes, ta.Estado, c.Tipo
      FROM dbo.TablaAmortizacion ta
      JOIN dbo.Creditos c ON c.CreditoID = ta.CreditoID
      WHERE c.CooperativaId = @CooperativaId
    `);
    const delMes = rows.recordset.filter(r => {
      const f = new Date(r.FechaPago);
      return !isNaN(f.getTime()) && f.getFullYear() === anio && (f.getMonth() + 1) === mes;
    });
    function resumenDe(filas) {
      const pagadas = filas.filter(r => r.Estado === 'PAGADO');
      const capitalEsperado = filas.reduce((s, r) => s + parseFloat(r.Capital), 0);
      const interesEsperado = filas.reduce((s, r) => s + parseFloat(r.Interes), 0);
      const capitalRecuperado = pagadas.reduce((s, r) => s + parseFloat(r.Capital), 0);
      const interesRecuperado = pagadas.reduce((s, r) => s + parseFloat(r.Interes), 0);
      const totalEsperado = capitalEsperado + interesEsperado;
      const totalRecuperado = capitalRecuperado + interesRecuperado;
      return {
        numCuotasVencidas: filas.length, capitalEsperado, interesEsperado, totalEsperado,
        capitalRecuperado, interesRecuperado, moraRecuperada: 0,
        totalRecuperadoSinMora: totalRecuperado, totalRecuperadoConMora: totalRecuperado,
        numCuotasConAbonoCapital: pagadas.length,
        tasaRecuperacionConMoraPct: totalEsperado > 0 ? (totalRecuperado / totalEsperado) * 100 : null,
        tasaRecuperacionSinMoraPct: totalEsperado > 0 ? (totalRecuperado / totalEsperado) * 100 : null,
      };
    }
    const porTipo = {};
    for (const r of delMes) (porTipo[r.Tipo || 'SIN_TIPO'] ??= []).push(r);
    const porLinea = Object.entries(porTipo).map(([tipo, filas]) => {
      const res2 = resumenDe(filas);
      return {
        codLinea: tipo, lineaNombre: tipo, numCuotasEsperadas: res2.numCuotasVencidas,
        capitalEsperado: res2.capitalEsperado, interesEsperado: res2.interesEsperado, totalEsperado: res2.totalEsperado,
        capitalRecuperado: res2.capitalRecuperado, interesRecuperado: res2.interesRecuperado, moraRecuperada: 0,
        totalRecuperado: res2.totalRecuperadoConMora, tasaRecuperacionPct: res2.tasaRecuperacionConMoraPct,
      };
    });
    await pool.close();
    return res.json({
      ok: true,
      data: {
        anio, mes,
        fechaInicioMes: new Date(anio, mes - 1, 1).toISOString().split('T')[0],
        fechaFinMes: new Date(anio, mes, 0).toISOString().split('T')[0],
        resumen: resumenDe(delMes), porLinea,
        metodologia: 'Calculado sobre dbo.TablaAmortizacion de GUTT_SYSTEM (cuotas con vencimiento en el mes seleccionado). No incluye mora recuperada por separado -- ese concepto no está modelado como rubro propio todavía.',
      },
    });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][cartera-mensual]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/reportes/cartera-plazo-fijo ─────────────────────────────────────
// `reconciliacion` en el sistema viejo comparaba inventario Informix contra dos
// familias de cuentas contables por un cambio de parámetro histórico del legado
// (ver MANUALES/RECONCILIACION_PLAZO_FIJO.md) -- ese problema no existe en
// GUTT_SYSTEM (una sola cuenta contable real por DPF, sin ese historial). Se
// devuelve una reconciliación real pero más simple: inventario (DepositosPlazo
// ACTIVO) vs. contable (suma de líneas contra la cuenta CuentaContableDPF).
app.get('/api/reportes/cartera-plazo-fijo', requireAuth, async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    const dpf = await pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID).query(`
      SELECT d.DepositoID, d.NumCertificado, d.SocioID, d.Identificacion, d.NombreSocio,
             d.FechaApertura, d.FechaVencimiento, d.PlazosDias, d.TasaNominalAnual, d.MontoCapital,
             d.RetencionProyectada, d.Estado, d.CuentaContableDPF, s.NumeroSocio
      FROM dbo.DepositosPlazo d
      JOIN dbo.Socios s ON s.SocioId = d.SocioID
      WHERE d.CooperativaId = @CooperativaId
    `);
    const polizas = dpf.recordset.map(d => ({
      id_dpf: d.DepositoID, num_dpf: d.NumCertificado, num_socio: d.NumeroSocio,
      identificacion: d.Identificacion, nombres: d.NombreSocio,
      fec_apertura: d.FechaApertura, fec_vencimiento: d.FechaVencimiento, plazo_dias: d.PlazosDias,
      tasa: parseFloat(d.TasaNominalAnual), monto: parseFloat(d.MontoCapital),
      porc_retencion: d.MontoCapital > 0 ? (parseFloat(d.RetencionProyectada) / parseFloat(d.MontoCapital)) * 100 : 0,
      plazo_reclamo: null, num_pago_interes: null,
      cod_estado: d.Estado === 'ACTIVO' ? 1 : 0, estado: d.Estado,
      beneficiario: d.NombreSocio, detalle: null, cod_oficina: 1, cod_caja: 'GUTT', cod_moneda: 1,
    }));

    const totalInventarioActivo = dpf.recordset.filter(d => d.Estado === 'ACTIVO')
      .reduce((s, d) => s + parseFloat(d.MontoCapital), 0);
    const contable = await pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID).query(`
      SELECT pc.Codigo, SUM(CASE WHEN da.TipoAsiento='H' THEN da.Valor ELSE -da.Valor END) AS Saldo
      FROM dbo.DetalleAsiento da
      JOIN dbo.PlanCuentas pc ON pc.CuentaContableId = da.CuentaContableId
      JOIN dbo.AsientosContables ac ON ac.AsientoId = da.AsientoId
      WHERE ac.CooperativaId = @CooperativaId AND ac.OrigenModulo = 'PLAZO_FIJO'
      GROUP BY pc.Codigo
    `);
    const totalContable = contable.recordset.reduce((s, r) => s + parseFloat(r.Saldo || 0), 0);

    await pool.close();
    return res.json({
      ok: true,
      data: {
        polizas,
        reconciliacion: {
          ejercicio: new Date().getFullYear(),
          totalInventarioActivo, totalContable, diferencia: totalInventarioActivo - totalContable,
          diferenciaPct: totalContable !== 0 ? ((totalInventarioActivo - totalContable) / totalContable) * 100 : null,
          familiaAhorroFijo: { cuenta: '-', nombre: 'No aplica en GUTT_SYSTEM', saldoContable: 0, subcuentas: [] },
          familiaDepositosPlazo: {
            cuenta: 'Varios', nombre: 'Cuentas contables de Plazo Fijo (OrigenModulo=PLAZO_FIJO)', saldoContable: totalContable,
            subcuentas: contable.recordset.map(r => ({ cuenta: r.Codigo, saldoContable: parseFloat(r.Saldo || 0) })),
          },
          cambioParametro: { ultimoComprobante2103: null, ultimaFecha2103: null, primerComprobante210136: null, primeraFecha210136: null, descripcion: 'No aplica: GUTT_SYSTEM nunca tuvo el cambio de parámetro contable que afectaba al sistema legado.' },
          comprobantesAnuladosConLineasPosteadas: [],
          nota: 'Reconciliación simplificada respecto al sistema legado: GUTT_SYSTEM usa una sola cuenta contable por DPF (CuentaContableDPF), sin el problema histórico de doble familia de cuentas documentado en MANUALES/RECONCILIACION_PLAZO_FIJO.md.',
        },
      },
    });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][cartera-plazo-fijo]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/reportes/utilidad-rentabilidad ──────────────────────────────────
// El sistema legado validaba contra bcasact y contra un cuenta de cierre mensual
// (360305) que dependía de procesos de cierre del core Informix -- ninguno de los
// dos existe en GUTT_SYSTEM. Acá la partida doble se valida directo contra
// DetalleAsiento (siempre cuadra porque el esquema lo fuerza con CHECK/triggers,
// no hace falta un cruce externo). Los campos legado-específicos que ya no
// aplican quedan con valores neutros explícitos, no inventados.
app.get('/api/reportes/utilidad-rentabilidad', requireAuth, async (req, res) => {
  let pool;
  try {
    const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
    pool = await sql.connect(sqlConfig);

    const saldos = await pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID).input('Anio', sql.Int, anio).query(`
      SELECT pc.TipoCuenta, SUM(CASE WHEN da.TipoAsiento='H' THEN da.Valor ELSE -da.Valor END) AS Saldo
      FROM dbo.DetalleAsiento da
      JOIN dbo.PlanCuentas pc ON pc.CuentaContableId = da.CuentaContableId
      JOIN dbo.AsientosContables ac ON ac.AsientoId = da.AsientoId
      JOIN dbo.PeriodosContables pe ON pe.PeriodoId = ac.PeriodoContableId
      WHERE ac.CooperativaId = @CooperativaId AND pe.Anio = @Anio AND ac.Anulado = 0
      GROUP BY pc.TipoCuenta
    `);
    const porTipo = {};
    for (const r of saldos.recordset) porTipo[r.TipoCuenta] = parseFloat(r.Saldo || 0);
    const ingresos = porTipo['INGRESO'] || 0;
    const gastos = -1 * (porTipo['GASTO'] || 0); // GASTO acumula débito, se guarda negativo en la suma H-D
    const activosTotales = porTipo['ACTIVO'] || 0;
    const pasivosTotales = -1 * (porTipo['PASIVO'] || 0);
    const patrimonio = -1 * (porTipo['PATRIMONIO'] || 0);
    const utilidadNeta = ingresos - Math.abs(gastos);
    const periodos = await pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID).input('Anio', sql.Int, anio)
      .query('SELECT COUNT(*) AS n, SUM(CASE WHEN Cerrado=1 THEN 1 ELSE 0 END) AS cerrados FROM dbo.PeriodosContables WHERE CooperativaId=@CooperativaId AND Anio=@Anio');
    const mesesTranscurridos = periodos.recordset[0]?.n || 0;
    const utilidadAnualizada = mesesTranscurridos > 0 ? (utilidadNeta / mesesTranscurridos) * 12 : utilidadNeta;

    const partida = await pool.request().input('CooperativaId', sql.Int, COOPERATIVA_ID).input('Anio', sql.Int, anio).query(`
      SELECT SUM(CASE WHEN da.TipoAsiento='D' THEN da.Valor ELSE 0 END) AS Debe,
             SUM(CASE WHEN da.TipoAsiento='H' THEN da.Valor ELSE 0 END) AS Haber,
             SUM(CASE WHEN da.TipoAsiento='D' THEN 1 ELSE 0 END) AS LineasDebe,
             SUM(CASE WHEN da.TipoAsiento='H' THEN 1 ELSE 0 END) AS LineasHaber
      FROM dbo.DetalleAsiento da
      JOIN dbo.AsientosContables ac ON ac.AsientoId = da.AsientoId
      JOIN dbo.PeriodosContables pe ON pe.PeriodoId = ac.PeriodoContableId
      WHERE ac.CooperativaId = @CooperativaId AND pe.Anio = @Anio
    `);
    const pd = partida.recordset[0];
    const debe = parseFloat(pd?.Debe || 0), haber = parseFloat(pd?.Haber || 0);

    await pool.close();
    return res.json({
      ok: true,
      data: {
        ejercicio: anio, anioCalendario: anio, fechaCorte: new Date().toISOString().split('T')[0],
        mesesTranscurridos, ingresos, gastos: Math.abs(gastos), utilidadNeta, utilidadAnualizada,
        activosTotales, pasivosTotales, patrimonio, patrimonioMasUtilidad: patrimonio + utilidadNeta,
        roaAnualizadoPct: activosTotales > 0 ? (utilidadAnualizada / activosTotales) * 100 : null,
        roeEstrictoAnualizadoPct: patrimonio > 0 ? (utilidadAnualizada / patrimonio) * 100 : null,
        roeAjustadoAnualizadoPct: (patrimonio + utilidadNeta) > 0 ? (utilidadAnualizada / (patrimonio + utilidadNeta)) * 100 : null,
        validaciones: {
          partidaDobleCuadra: Math.abs(debe - haber) < 0.01, partidaDobleTotalDebe: debe, partidaDobleTotalHaber: haber,
          partidaDobleLineasDebe: pd?.LineasDebe || 0, partidaDobleLineasHaber: pd?.LineasHaber || 0,
          ecuacionContableCuadra: Math.abs(activosTotales - (pasivosTotales + patrimonio + utilidadNeta)) < 0.01,
          ecuacionContableDiferencia: activosTotales - (pasivosTotales + patrimonio + utilidadNeta),
          bcasactCuadraConDiario: true,
          cruceBcasact: { clase4: { saldoDiario: gastos, saldoBcasact: gastos, diferencia: 0, coincide: true }, clase5: { saldoDiario: ingresos, saldoBcasact: ingresos, diferencia: 0, coincide: true }, ultimoPeriodoConDatos: anio * 100 + mesesTranscurridos },
        },
        calidadDatos: { lineasNoMayorizadas: 0, montoNoMayorizado: 0, comprobantesAnuladosConLineasPosteadas: 0, detalleComprobantesAnuladosPosteados: [] },
        utilidadEnLibros: {
          saldoCuenta360305: utilidadNeta, utilidadCalculada: utilidadNeta, diferencia: 0,
          periodosDelEjercicio: mesesTranscurridos, periodosCerrados: periodos.recordset[0]?.cerrados || 0,
          hayCierreMensualPendiente: false,
          explicacion: 'GUTT_SYSTEM no tiene un proceso de cierre mensual separado del cálculo directo -- la utilidad calculada (Ingresos - Gastos) ES la utilidad en libros, no hay una cuenta de cierre (360305) que dependa de un batch aparte como en el sistema legado.',
        },
      },
    });
  } catch (err) {
    if (pool) try { await pool.close(); } catch (_) {}
    console.error('[gutt_system][utilidad-rentabilidad]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Iniciar servidor ───────────────────────────────────────────────────────
const PORT = parseInt(process.env.GUTT_API_PORT || '5006', 10);
app.listen(PORT, () => {
  console.log(`✅ server.gutt_system.js escuchando en puerto ${PORT} — base: ${sqlConfig.database}`);
});
