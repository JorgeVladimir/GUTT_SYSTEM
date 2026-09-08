/**
 * db/gutt_system/tools/onboarding_cooperativa.js
 *
 * Alta de una cooperativa cliente nueva en GUTT_SYSTEM: crea la fila en
 * dbo.Cooperativas, un usuario administrador inicial, los 2 productos financieros
 * por defecto (Certificados de Aportación + Ahorro a la Vista, mismos códigos que
 * usa el resto del sistema), y opcionalmente carga un plan de cuentas real desde
 * un JSON con la misma forma que exporta bcaccco (Informix): un array de
 * { ccco_cod_ccon, ccco_nom_ccon, ccco_cod_tcue, ccco_cod_mone }.
 *
 * Reemplaza tener que hacer cada alta a mano en SQL como se hizo para Crediapoyo
 * el 2026-08-12 (ver db/gutt_system/20_seed_cooperativa_crediapoyo.sql,
 * 22_cargar_plan_cuentas_crediapoyo.sql — este script generaliza esa lógica).
 *
 * Uso:
 *   node db/gutt_system/tools/onboarding_cooperativa.js --config ruta/a/config.json
 *
 * Forma de config.json:
 * {
 *   "razonSocial": "Caja de Ahorro Ejemplo",
 *   "ruc": "1234567890001",
 *   "nombreComercial": "Ejemplo",
 *   "colorPrimario": "#14532D",
 *   "colorAcento": "#FACC15",
 *   "adminUsuarioId": "admin.ejemplo",
 *   "adminNombreCompleto": "Administrador Ejemplo",
 *   "adminPasswordInicial": "cambiar-en-primer-login",
 *   "planCuentasJson": "ruta/opcional/a/plan_cuentas.json"
 * }
 *
 * No migra datos reales de socios/créditos -- eso es un proceso aparte, deliberado,
 * nunca automático (ver no-negociables de gutt-system-adaptacion-queries).
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import sql from 'mssql';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv(join(REPO_ROOT, 'api', '.env.gutt_system'));
loadDotEnv(join(REPO_ROOT, 'api', '.env'));

const DATABASE_NAME = process.env.SQL_SERVER_DATABASE_GUTT || 'GUTT_SYSTEM';
if (DATABASE_NAME === 'SQLGUTPATATE') {
  console.error('❌ SQL_SERVER_DATABASE_GUTT no puede apuntar a SQLGUTPATATE. Abortando.');
  process.exit(1);
}

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: DATABASE_NAME,
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};
if (process.env.SQL_SERVER_PORT) sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
else if (process.env.SQL_SERVER_INSTANCE) sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
else sqlConfig.port = 1433;

const TIPO_POR_DIGITO = { '1': 'ACTIVO', '2': 'PASIVO', '3': 'PATRIMONIO', '4': 'GASTO', '5': 'INGRESO', '6': 'CONTINGENTE', '7': 'ORDEN' };

function padreDe(codigo, codigosSet) {
  for (let len = codigo.length - 1; len >= 1; len--) {
    const prefijo = codigo.slice(0, len);
    if (codigosSet.has(prefijo) && prefijo !== codigo) return prefijo;
  }
  return null;
}

async function main() {
  const configArgIdx = process.argv.indexOf('--config');
  if (configArgIdx === -1 || !process.argv[configArgIdx + 1]) {
    console.error('Uso: node onboarding_cooperativa.js --config ruta/a/config.json');
    process.exit(1);
  }
  const configPath = resolve(process.argv[configArgIdx + 1]);
  const cfg = JSON.parse(readFileSync(configPath, 'utf-8'));

  const required = ['razonSocial', 'ruc', 'nombreComercial', 'adminUsuarioId', 'adminNombreCompleto', 'adminPasswordInicial'];
  for (const campo of required) {
    if (!cfg[campo]) {
      console.error(`❌ Falta el campo obligatorio "${campo}" en ${configPath}`);
      process.exit(1);
    }
  }
  // dbo.Usuarios.UsuarioId es NVARCHAR(20) -- sin este chequeo, un valor más largo
  // produce un error TDS críptico ("Data type 0xE7 has an invalid data length") en
  // vez de decir claramente cuál es el problema (encontrado probando este script).
  if (cfg.adminUsuarioId.length > 20) {
    console.error(`❌ adminUsuarioId "${cfg.adminUsuarioId}" tiene ${cfg.adminUsuarioId.length} caracteres, el máximo es 20 (dbo.Usuarios.UsuarioId).`);
    process.exit(1);
  }
  if (cfg.ruc.length > 13) {
    console.error(`❌ ruc "${cfg.ruc}" tiene ${cfg.ruc.length} caracteres, el máximo es 13.`);
    process.exit(1);
  }

  const pool = await sql.connect(sqlConfig);
  console.log(`Conectado a ${sqlConfig.server}/${DATABASE_NAME}.`);

  try {
    // 1. Cooperativa
    let coopId;
    const existing = await pool.request().input('ruc', sql.NVarChar(13), cfg.ruc)
      .query('SELECT CooperativaId FROM dbo.Cooperativas WHERE RUC = @ruc');
    if (existing.recordset.length > 0) {
      coopId = existing.recordset[0].CooperativaId;
      console.log(`Cooperativa con RUC ${cfg.ruc} ya existe (CooperativaId=${coopId}), se reutiliza.`);
    } else {
      const ins = await pool.request()
        .input('razonSocial', sql.NVarChar(200), cfg.razonSocial)
        .input('ruc', sql.NVarChar(13), cfg.ruc)
        .input('nombreComercial', sql.NVarChar(100), cfg.nombreComercial)
        .input('colorPrimario', sql.NVarChar(9), cfg.colorPrimario || '#14532D')
        .input('colorAcento', sql.NVarChar(9), cfg.colorAcento || '#FACC15')
        .query(`
          INSERT INTO dbo.Cooperativas (RazonSocial, RUC, NombreComercial, ColorPrimario, ColorAcento, Activa)
          OUTPUT INSERTED.CooperativaId
          VALUES (@razonSocial, @ruc, @nombreComercial, @colorPrimario, @colorAcento, 1)
        `);
      coopId = ins.recordset[0].CooperativaId;
      console.log(`✅ Cooperativa creada: CooperativaId=${coopId}.`);
    }

    // 2. Usuario administrador inicial
    const usuarioExiste = await pool.request().input('id', sql.NVarChar(20), cfg.adminUsuarioId)
      .query('SELECT 1 FROM dbo.Usuarios WHERE UsuarioId = @id');
    if (usuarioExiste.recordset.length === 0) {
      await pool.request()
        .input('id', sql.NVarChar(20), cfg.adminUsuarioId)
        .input('coopId', sql.Int, coopId)
        .input('nombre', sql.NVarChar(150), cfg.adminNombreCompleto)
        .input('pass', sql.NVarChar(200), cfg.adminPasswordInicial)
        .query(`
          INSERT INTO dbo.Usuarios (UsuarioId, CooperativaId, NombreCompleto, PasswordHash, Rol, Activo, RequiereCambioPin)
          VALUES (@id, @coopId, @nombre, @pass, 'ADMIN', 1, 1)
        `);
      console.log(`✅ Usuario admin "${cfg.adminUsuarioId}" creado (RequiereCambioPin=1 — la contraseña inicial se hashea sola en el primer login).`);
    } else {
      console.log(`Usuario "${cfg.adminUsuarioId}" ya existe, no se modifica.`);
    }

    // 3. Plan de cuentas real (opcional) -- va ANTES de Productos Financieros a propósito:
    // ProductosFinancieros.CuentaActiva/CuentaInactiva tienen FK real a PlanCuentas
    // (agregada en 18_fix_formato_codigo_contable.sql), así que el producto no se
    // puede crear si su cuenta contable todavía no existe. Encontrado probando este
    // script contra una cooperativa sin plan de cuentas: el INSERT de productos
    // fallaba por violación de FK, no por un bug de este tool.
    if (cfg.planCuentasJson) {
      const pcPath = resolve(dirname(configPath), cfg.planCuentasJson);
      const filas = JSON.parse(readFileSync(pcPath, 'utf-8'));
      const codigos = new Set(filas.map(r => r.ccco_cod_ccon));
      let insertados = 0, conPadre = 0;

      for (const r of filas) {
        const codigo = r.ccco_cod_ccon;
        const existeCuenta = await pool.request().input('coopId', sql.Int, coopId).input('cod', sql.NVarChar(15), codigo)
          .query('SELECT 1 FROM dbo.PlanCuentas WHERE CooperativaId = @coopId AND Codigo = @cod');
        if (existeCuenta.recordset.length === 0) {
          await pool.request()
            .input('coopId', sql.Int, coopId)
            .input('cod', sql.NVarChar(15), codigo)
            .input('nombre', sql.NVarChar(150), r.ccco_nom_ccon)
            .input('tipo', sql.NVarChar(20), TIPO_POR_DIGITO[codigo[0]] || 'ACTIVO')
            .input('esAgr', sql.Bit, r.ccco_cod_tcue === 'A' ? 1 : 0)
            .query('INSERT INTO dbo.PlanCuentas (CooperativaId, Codigo, Nombre, TipoCuenta, EsAgrupador) VALUES (@coopId, @cod, @nombre, @tipo, @esAgr)');
          insertados++;
        }
      }
      for (const r of filas) {
        const codigo = r.ccco_cod_ccon;
        const padre = padreDe(codigo, codigos);
        if (padre) {
          await pool.request().input('coopId', sql.Int, coopId).input('cod', sql.NVarChar(15), codigo).input('padre', sql.NVarChar(15), padre)
            .query(`
              UPDATE h SET h.CuentaPadreId = p.CuentaContableId
              FROM dbo.PlanCuentas h JOIN dbo.PlanCuentas p ON p.CooperativaId = @coopId AND p.Codigo = @padre
              WHERE h.CooperativaId = @coopId AND h.Codigo = @cod AND h.CuentaPadreId IS NULL
            `);
          conPadre++;
        }
      }
      console.log(`✅ Plan de cuentas: ${insertados} cuentas insertadas, ${conPadre} con jerarquía enlazada.`);
    } else {
      console.log('ℹ️  Sin plan de cuentas provisto — cargarlo después con el mismo formato (ver db/gutt_system/22_cargar_plan_cuentas_crediapoyo.sql como referencia). Los productos financieros por defecto quedarán sin crear hasta entonces (dependen de cuentas contables reales por FK).');
    }

    // 4. Productos financieros por defecto (mismos códigos que ya usa el resto del sistema)
    const productosDefault = [
      { codigo: 1, nombre: 'CERTIFICADOS DE APORTACION', tipo: 'AHORRO A LA VISTA', esCertificado: 1, cuentaActiva: '31030505', cuentaInactiva: '31030505', permiteRetiros: 0 },
      { codigo: 2, nombre: 'AHORRO A LA VISTA', tipo: 'AHORRO A LA VISTA', esCertificado: 0, cuentaActiva: '21013505', cuentaInactiva: '21013505', permiteRetiros: 1 },
    ];
    for (const p of productosDefault) {
      const existeProd = await pool.request().input('coopId', sql.Int, coopId).input('cod', sql.Int, p.codigo)
        .query('SELECT 1 FROM dbo.ProductosFinancieros WHERE CooperativaId = @coopId AND CodigoProducto = @cod');
      if (existeProd.recordset.length > 0) continue;
      try {
        await pool.request()
          .input('coopId', sql.Int, coopId)
          .input('cod', sql.Int, p.codigo)
          .input('nombre', sql.NVarChar(100), p.nombre)
          .input('tipo', sql.NVarChar(100), p.tipo)
          .input('esCert', sql.Bit, p.esCertificado)
          .input('cActiva', sql.NVarChar(20), p.cuentaActiva)
          .input('cInactiva', sql.NVarChar(20), p.cuentaInactiva)
          .input('permRet', sql.Bit, p.permiteRetiros)
          .query(`
            INSERT INTO dbo.ProductosFinancieros
              (CooperativaId, CodigoProducto, Nombre, TipoDeposito, EsCertificado, CuentaActiva, CuentaInactiva, PermiteRetiros)
            VALUES (@coopId, @cod, @nombre, @tipo, @esCert, @cActiva, @cInactiva, @permRet)
          `);
        console.log(`✅ Producto financiero "${p.nombre}" creado.`);
      } catch (err) {
        console.warn(`⚠️  No se pudo crear el producto "${p.nombre}" (cuenta contable ${p.cuentaActiva} no existe en el plan de cuentas de esta cooperativa) -- cargá el plan de cuentas primero, o creá este producto a mano después desde /api/admin/productos. Detalle: ${err.message}`);
      }
    }

    console.log(`\n=== Onboarding completo. CooperativaId=${coopId}, RUC=${cfg.ruc} ===`);
  } finally {
    await pool.close();
  }
}

main().catch(err => {
  console.error('❌ Error en onboarding:', err.message);
  process.exit(1);
});
