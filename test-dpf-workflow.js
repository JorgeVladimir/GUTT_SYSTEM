import sql from 'mssql';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, 'api', '.env');

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
loadDotEnv(envPath);

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: true }
};
if (process.env.SQL_SERVER_PORT) sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
if (process.env.SQL_SERVER_INSTANCE) sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;

const API_BASE = 'http://localhost:5005/api';
let testDepositoID = null;

async function runTests() {
  console.log('\n======================================================');
  console.log('💰 SUITE DE PRUEBAS: DEPÓSITOS A PLAZO FIJO (DPF)');
  console.log('======================================================\n');

  let passed = 0;
  const errors = [];
  let pool;

  try {
    pool = await sql.connect(sqlConfig);
    console.log('✅ Conexión BD establecida.');

    // Obtener primer socio activo para las pruebas
    const socioRes = await pool.request().query(`
      SELECT TOP 1 r.SOCIOID, r.Identificacion, r.PrimerNombre + ' ' + r.PrimerApellido AS Nombre,
             r.NumeroSocio
      FROM dbo.RegistroSocios r
      WHERE r.Estado = 'ACTIVO'
      ORDER BY r.SOCIOID ASC
    `);
    if (socioRes.recordset.length === 0) throw new Error('No hay socios activos en la BD para ejecutar las pruebas DPF.');
    const socio = socioRes.recordset[0];
    console.log(`👤 Socio de prueba: ${socio.Nombre} (CI: ${socio.Identificacion}, ID: ${socio.SOCIOID})\n`);

    // ── TEST 1: Obtener tasas DPF ──────────────────────────────────────────
    console.log('------------------------------------------------------');
    console.log('1. GET /dpf/tasas — configuración de tramos...');
    const tasasRes = await fetch(`${API_BASE}/dpf/tasas`);
    const tasasData = await tasasRes.json();
    if (!tasasData.ok || !Array.isArray(tasasData.data) || tasasData.data.length === 0) {
      throw new Error(`Sin tasas DPF configuradas: ${tasasData.error || 'array vacío'}`);
    }
    const tasaActiva = tasasData.data.find(t => t.Activo);
    if (!tasaActiva) throw new Error('No hay ninguna tasa DPF activa configurada.');
    console.log(`   ✅ ${tasasData.data.length} tramos encontrados. Usando: ${tasaActiva.DescripcionRango} @ ${tasaActiva.TasaNominalAnual}% TNA`);
    passed++;

    // ── TEST 2: Resumen DPF ────────────────────────────────────────────────
    console.log('\n------------------------------------------------------');
    console.log('2. GET /dpf/resumen — estadísticas globales...');
    const resumenRes = await fetch(`${API_BASE}/dpf/resumen`);
    const resumenData = await resumenRes.json();
    if (!resumenData.ok) throw new Error(`Fallo /dpf/resumen: ${resumenData.error}`);
    const r = resumenData.data;
    if (r.capitalActivo === undefined || r.activos === undefined) {
      throw new Error(`Estructura de resumen incorrecta: ${JSON.stringify(r)}`);
    }
    console.log(`   ✅ Resumen OK — Capital activo: $${r.capitalActivo?.toFixed(2) || 0}, DPFs activos: ${r.activos}`);
    passed++;

    // ── TEST 3: Apertura de DPF ────────────────────────────────────────────
    console.log('\n------------------------------------------------------');
    console.log('3. POST /dpf — apertura de nuevo depósito...');
    const montoTest = tasaActiva.MontoMinimo + 100; // mínimo + $100 de margen
    const plazoTest = tasaActiva.DiasDesde + Math.floor((tasaActiva.DiasHasta - tasaActiva.DiasDesde) / 2);
    const dpfPayload = {
      socioid:                  socio.SOCIOID,
      identificacion:           socio.Identificacion,
      nombreSocio:              socio.Nombre,
      tasaID:                   tasaActiva.TasaID,
      montoCapital:             montoTest,
      plazosDias:               Math.max(plazoTest, tasaActiva.DiasDesde),
      tipoRenovacion:           'NO_RENOVAR',
      modalidadPago:            'AL_VENCIMIENTO',
      cuentaAhorrosRelacionada: null,
      observaciones:            'PRUEBA AUTOMATIZADA — eliminar',
      usuarioID:                'test-runner',
    };

    const aperturaRes = await fetch(`${API_BASE}/dpf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dpfPayload),
    });
    const aperturaData = await aperturaRes.json();
    if (!aperturaData.ok) throw new Error(`Fallo apertura DPF: ${aperturaData.error}`);
    testDepositoID = aperturaData.depositoID;
    console.log(`   ✅ DPF aperturado: ${testDepositoID}`);
    console.log(`   💰 Monto: $${montoTest} | Interés neto proyectado: $${aperturaData.interesNetoProyectado?.toFixed(2)}`);
    console.log(`   📅 Vencimiento: ${aperturaData.fechaVencimiento}`);
    passed++;

    // ── TEST 4: Obtener DPF creado ─────────────────────────────────────────
    console.log('\n------------------------------------------------------');
    console.log(`4. GET /dpf/${testDepositoID} — detalle del depósito...`);
    const detalleRes = await fetch(`${API_BASE}/dpf/${testDepositoID}`);
    const detalleData = await detalleRes.json();
    if (!detalleData.ok) throw new Error(`Fallo GET /dpf/:id: ${detalleData.error}`);
    const dpf = detalleData.data;
    if (dpf.Estado !== 'ACTIVO') throw new Error(`Estado incorrecto: ${dpf.Estado} (esperado ACTIVO)`);
    if (Math.abs(dpf.MontoCapital - montoTest) > 0.01) throw new Error(`Monto incorrecto: ${dpf.MontoCapital}`);
    if (dpf.TasaNominalAnual !== tasaActiva.TasaNominalAnual) throw new Error(`Tasa incorrecta: ${dpf.TasaNominalAnual}`);
    console.log(`   ✅ DPF obtenido correctamente — Estado: ${dpf.Estado}, Monto: $${dpf.MontoCapital}`);
    console.log(`   📋 Cuenta SEPS: ${dpf.CuentaContableDPF}, Asientos: ${detalleData.asientos?.length || 0}`);
    passed++;

    // ── TEST 5: Liquidar DPF ───────────────────────────────────────────────
    console.log('\n------------------------------------------------------');
    console.log(`5. POST /dpf/${testDepositoID}/liquidar — liquidación al vencimiento...`);
    const liquidarRes = await fetch(`${API_BASE}/dpf/${testDepositoID}/liquidar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuarioID: 'test-runner' }),
    });
    const liquidarData = await liquidarRes.json();
    if (!liquidarData.ok) throw new Error(`Fallo liquidación: ${liquidarData.error}`);
    console.log(`   ✅ DPF liquidado — Interés neto: $${liquidarData.interesNetoLiquidado?.toFixed(2)}`);
    console.log(`   💳 Total acreditado: $${liquidarData.totalAcreditado?.toFixed(2)}`);
    passed++;

    // ── TEST 6: Verificar estado LIQUIDADO ────────────────────────────────
    console.log('\n------------------------------------------------------');
    console.log('6. Verificando estado LIQUIDADO en BD...');
    const dbCheck = await pool.request()
      .input('id', sql.NVarChar(50), testDepositoID)
      .query("SELECT Estado, FechaLiquidacion FROM dbo.DepositosPlazo WHERE DepositoID = @id");
    if (dbCheck.recordset.length === 0) throw new Error('DPF no encontrado en BD tras liquidación.');
    if (dbCheck.recordset[0].Estado !== 'LIQUIDADO') throw new Error(`Estado en BD: ${dbCheck.recordset[0].Estado}`);
    console.log(`   ✅ Estado en BD: LIQUIDADO | Fecha: ${dbCheck.recordset[0].FechaLiquidacion}`);
    passed++;

    // ── LIMPIEZA ───────────────────────────────────────────────────────────
    console.log('\n------------------------------------------------------');
    console.log('Limpiando DPF de prueba...');
    await pool.request()
      .input('id', sql.NVarChar(50), testDepositoID)
      .query(`
        DELETE FROM dbo.AsientosContablesDPF WHERE DepositoID = @id;
        DELETE FROM dbo.DepositosPlazo WHERE DepositoID = @id;
      `);
    console.log('   ✅ BD limpia.');
    testDepositoID = null;

    console.log('\n======================================================');
    console.log(`🎉 DPF: ${passed}/6 pruebas completadas exitosamente`);
    console.log('======================================================\n');

    await pool.close();
    return { passed, failed: 0, errors: [] };

  } catch (err) {
    console.error('\n❌ ERROR EN SUITE DPF:', err.message);

    // Intentar limpiar si quedó un DPF huérfano
    if (testDepositoID && pool) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(50), testDepositoID)
          .query(`
            DELETE FROM dbo.AsientosContablesDPF WHERE DepositoID = @id;
            DELETE FROM dbo.DepositosPlazoFijo WHERE DepositoID = @id;
          `);
        console.log(`   🧹 DPF de prueba ${testDepositoID} eliminado en limpieza de error.`);
      } catch (_) {}
    }

    if (pool) { try { await pool.close(); } catch (_) {} }
    errors.push(err.message);
    return { passed, failed: 1, errors };
  }
}

export { runTests };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
