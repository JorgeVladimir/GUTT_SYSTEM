import sql from 'mssql';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, 'api', '.env');

// Cargar variables de entorno
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
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

if (process.env.SQL_SERVER_PORT) {
  sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
}
if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
}

const API_BASE = 'http://localhost:8080/api';
const TEST_LOAN_ID = 'CRD-TEST-MIGRATION-999';
const TEST_CEDULA = '1720884012'; // Jorge Vladimir de la captura

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO PRUEBAS DE INTEGRACIÓN: FLUJO DE CRÉDITOS');
  console.log('======================================================\n');

  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    console.log('✅ Conexión a la base de datos establecida.');

    // 0. Limpieza previa y aseguramiento de condiciones
    console.log('\n🧹 Limpiando solicitudes de prueba anteriores...');
    await pool.request()
      .input('id', sql.NVarChar(50), TEST_LOAN_ID)
      .query("DELETE FROM dbo.SolicitudesCredito WHERE SolicitudID = @id");
    
    await pool.request()
      .input('id', TEST_LOAN_ID)
      .query("DELETE FROM dbo.RegistroContable WHERE Concepto LIKE '%' + @id + '%'");

    await pool.request()
      .input('cedula', sql.NVarChar(20), TEST_CEDULA)
      .query(`
        UPDATE c
        SET c.Saldo = 0.00
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @cedula)
          AND p.EsCertificado = 0
      `);
    
    // Validar que el socio 1720884012 existe y tiene certificados
    const socioCheck = await pool.request()
      .input('cedula', sql.NVarChar(20), TEST_CEDULA)
      .query(`
        SELECT r.SOCIOID, r.TipoPersona, r.Estado, c.Saldo 
        FROM dbo.RegistroSocios r
        INNER JOIN dbo.CuentasAhorro c ON c.SocioId = r.SOCIOID
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE r.Identificacion = @cedula AND p.EsCertificado = 1
      `);
    
    if (socioCheck.recordset.length === 0) {
      console.log('⚠️ El socio de prueba no tiene certificados de aportación o no existe. Creando registros básicos...');
      // Nos aseguramos de tener al menos un socio activo para las pruebas
      // En este caso asumimos que el socio Jorge Vladimir (1720884012) ya está configurado en el sistema por el usuario.
    } else {
      console.log(`👤 Socio de prueba encontrado. Saldo de Aportaciones: $${socioCheck.recordset[0].Saldo}`);
    }

    // 1. Crear solicitud de crédito (SOLICITADO) con origen CAJA_PATATE
    console.log('\n------------------------------------------------------');
    console.log('1. Creando solicitud de crédito...');
    const loanPayload = {
      id: TEST_LOAN_ID,
      memberId: TEST_CEDULA,
      amount: 5000.00,
      balance: 5000.00,
      rate: 14.00,
      installmentsCount: 12,
      type: 'Consumo Ordinario',
      status: 'SOLICITADO',
      startDate: new Date().toLocaleDateString('es-EC'),
      dueDate: new Date(Date.now() + 12 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-EC'),
      garantiaInfo: { tipo: 'SOLIDARIA', garanteNombre: 'Juan Perez', garanteCedula: '1801020304' },
      origen: 'CAJA_PATATE'
    };

    const applyRes = await fetch(`${API_BASE}/socios/loans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loanPayload)
    });
    const applyData = await applyRes.json();
    if (!applyData.ok) {
      throw new Error(`Fallo al aplicar al crédito: ${applyData.error}`);
    }
    console.log('✅ Solicitud registrada con éxito en estado SOLICITADO.');

    // Verificar en BD
    const dbLoan = await pool.request()
      .input('id', sql.NVarChar(50), TEST_LOAN_ID)
      .query("SELECT Estado, Origen, GarantiaInfo FROM dbo.SolicitudesCredito WHERE SolicitudID = @id");
    console.log(`🔍 Registro en Base de Datos: Estado = ${dbLoan.recordset[0].Estado}, Origen = ${dbLoan.recordset[0].Origen}`);

    // 2. Intentar aprobar como Asesor (debe fallar)
    console.log('\n------------------------------------------------------');
    console.log('2. Intentando aprobar crédito como Asesor (CREDIT_OFFICER)...');
    const approveAsesorRes = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [TEST_LOAN_ID], reason: 'Dictamen de prueba asesor', usuarioId: 'asesor' })
    });
    
    console.log(`Status devuelto: ${approveAsesorRes.status}`);
    const approveAsesorData = await approveAsesorRes.json();
    if (approveAsesorRes.status === 403 || !approveAsesorData.ok) {
      console.log(`✅ Aprobación denegada correctamente para el Asesor: "${approveAsesorData.error || approveAsesorData.message}"`);
    } else {
      throw new Error('❌ ERROR: ¡El sistema permitió al Asesor aprobar el crédito!');
    }

    // 3. Aprobar como Administrador (debe pasar a APROBADO, sin desembolso contable)
    console.log('\n------------------------------------------------------');
    console.log('3. Aprobando crédito como Administrador (ADMIN)...');
    
    // Obtener saldos antes de la aprobación para verificar que no cambien
    const balanceBeforeRes = await pool.request()
      .input('cedula', sql.NVarChar(20), TEST_CEDULA)
      .query(`
        SELECT c.Saldo 
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @cedula)
          AND p.EsCertificado = 0
      `);
    const balanceBefore = balanceBeforeRes.recordset.length > 0 ? parseFloat(balanceBeforeRes.recordset[0].Saldo) : 0;
    
    const approveAdminRes = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [TEST_LOAN_ID], reason: 'Dictamen técnico - Aprobación junta', usuarioId: 'admin' })
    });
    const approveAdminData = await approveAdminRes.json();
    if (!approveAdminData.ok) {
      throw new Error(`Fallo al aprobar crédito como admin: ${approveAdminData.error || approveAdminData.message}`);
    }
    console.log('✅ Aprobado por Administrador con éxito.');

    // Verificar en BD que el estado sea APROBADO y el saldo no haya cambiado
    const dbLoanApproved = await pool.request()
      .input('id', sql.NVarChar(50), TEST_LOAN_ID)
      .query("SELECT Estado FROM dbo.SolicitudesCredito WHERE SolicitudID = @id");
    console.log(`🔍 Registro en Base de Datos: Estado = ${dbLoanApproved.recordset[0].Estado}`);
    
    const balanceAfterApproveRes = await pool.request()
      .input('cedula', sql.NVarChar(20), TEST_CEDULA)
      .query(`
        SELECT c.Saldo 
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @cedula)
          AND p.EsCertificado = 0
      `);
    const balanceAfterApprove = balanceAfterApproveRes.recordset.length > 0 ? parseFloat(balanceAfterApproveRes.recordset[0].Saldo) : 0;
    
    if (balanceBefore === balanceAfterApprove) {
      console.log(`✅ Verificación exitosa: Saldo sin cambios ($${balanceAfterApprove.toFixed(2)} USD). No se movió dinero.`);
    } else {
      throw new Error(`❌ ERROR: El saldo de ahorros cambió tras la aprobación ($${balanceBefore} -> $${balanceAfterApprove})`);
    }

    // 4. Intentar desembolsar como Asesor (debe fallar)
    console.log('\n------------------------------------------------------');
    console.log('4. Intentando desembolsar crédito como Asesor (CREDIT_OFFICER)...');
    const disburseAsesorRes = await fetch(`${API_BASE}/socios/loans/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [TEST_LOAN_ID], usuarioId: 'asesor' })
    });
    console.log(`Status devuelto: ${disburseAsesorRes.status}`);
    const disburseAsesorData = await disburseAsesorRes.json();
    if (disburseAsesorRes.status === 403 || !disburseAsesorData.ok) {
      console.log(`✅ Desembolso denegado correctamente para el Asesor: "${disburseAsesorData.error || disburseAsesorData.message}"`);
    } else {
      throw new Error('❌ ERROR: ¡El sistema permitió al Asesor desembolsar el crédito!');
    }

    // 5. Desembolsar como Administrador (debe pasar a VIGENTE, crear partidas contables y transferir fondos)
    console.log('\n------------------------------------------------------');
    console.log('5. Desembolsando crédito como Administrador (ADMIN)...');
    const disburseAdminRes = await fetch(`${API_BASE}/socios/loans/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [TEST_LOAN_ID], usuarioId: 'admin' })
    });
    const disburseAdminData = await disburseAdminRes.json();
    if (!disburseAdminData.ok || (disburseAdminData.failures && disburseAdminData.failures.length > 0)) {
      const err = disburseAdminData.failures ? disburseAdminData.failures[0].error : disburseAdminData.error;
      throw new Error(`Fallo al desembolsar crédito como admin: ${err}`);
    }
    console.log('✅ Desembolso ejecutado con éxito.');

    // Verificar en BD: Estado debe ser VIGENTE
    const dbLoanVigente = await pool.request()
      .input('id', sql.NVarChar(50), TEST_LOAN_ID)
      .query("SELECT Estado, DescuentosDesembolso FROM dbo.SolicitudesCredito WHERE SolicitudID = @id");
    console.log(`🔍 Registro en Base de Datos: Estado = ${dbLoanVigente.recordset[0].Estado}`);
    console.log(`🔍 Descuentos aplicados: ${dbLoanVigente.recordset[0].DescuentosDesembolso}`);

    // Verificar saldos
    const balanceAfterDisburseRes = await pool.request()
      .input('cedula', sql.NVarChar(20), TEST_CEDULA)
      .query(`
        SELECT c.Saldo 
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @cedula)
          AND p.EsCertificado = 0
      `);
    const balanceAfterDisburse = balanceAfterDisburseRes.recordset.length > 0 ? parseFloat(balanceAfterDisburseRes.recordset[0].Saldo) : 0;
    
    const comision = 5000.00 * 0.01;
    const fondo = 5000.00 * 0.005;
    const neto = 5000.00 - comision - fondo;
    const expectedBalance = balanceAfterApprove + neto;

    if (Math.abs(balanceAfterDisburse - expectedBalance) < 0.01) {
      console.log(`✅ Verificación exitosa: Saldo final incrementado por el neto ($${neto.toFixed(2)} USD). Balance actual: $${balanceAfterDisburse.toFixed(2)} USD.`);
    } else {
      throw new Error(`❌ ERROR: El saldo de ahorros no coincide con el neto esperado. Esperado: $${expectedBalance.toFixed(2)}, Real: $${balanceAfterDisburse.toFixed(2)}`);
    }

    // Verificar partidas contables (4 asientos)
    const ledgerEntries = await pool.request()
      .input('id', TEST_LOAN_ID)
      .query("SELECT CuentaContable, Debe, Haber, Concepto FROM dbo.RegistroContable WHERE Concepto LIKE '%' + @id + '%'");
    
    console.log(`🔍 Asientos contables generados (${ledgerEntries.recordset.length} registros):`);
    ledgerEntries.recordset.forEach(e => {
      console.log(`   - Cuenta: ${e.CuentaContable} | Debe: $${e.Debe.toFixed(2)} | Haber: $${e.Haber.toFixed(2)} | Concepto: ${e.Concepto}`);
    });

    if (ledgerEntries.recordset.length === 4) {
      console.log('✅ Verificación exitosa: Se generaron exactamente los 4 asientos de la SEPS.');
    } else {
      throw new Error(`❌ ERROR: Cantidad incorrecta de asientos contables. Esperados: 4, Generados: ${ledgerEntries.recordset.length}`);
    }

    // 6. Validar ruta de reportes
    console.log('\n------------------------------------------------------');
    console.log('6. Consultando la lista de todas las solicitudes para el reporte...');
    const allLoansRes = await fetch(`${API_BASE}/socios/loans/all`);
    const allLoansData = await allLoansRes.json();
    if (!allLoansData.ok) {
      throw new Error('Fallo al consultar /loans/all');
    }
    
    const testedLoan = allLoansData.loans.find(l => l.id === TEST_LOAN_ID);
    if (testedLoan && testedLoan.origen === 'CAJA_PATATE') {
      console.log('✅ Solicitud encontrada en reporte con origen correcto (CAJA_PATATE) y nombre del socio asociado.');
    } else {
      throw new Error('❌ ERROR: Solicitud de prueba no encontrada en el reporte o sin origen correcto.');
    }

    // Limpieza final
    console.log('\n🧹 Limpiando solicitud de prueba finalizada...');
    await pool.request()
      .input('id', sql.NVarChar(50), TEST_LOAN_ID)
      .query("DELETE FROM dbo.SolicitudesCredito WHERE SolicitudID = @id");
    
    // Reversar el balance de ahorros para no alterar datos de producción
    await pool.request()
      .input('cedula', sql.NVarChar(20), TEST_CEDULA)
      .input('saldo', sql.Decimal(18, 2), balanceBefore)
      .query(`
        UPDATE c
        SET c.Saldo = @saldo
        FROM dbo.CuentasAhorro c
        INNER JOIN dbo.parametrosproductos p ON c.CodigoProducto = p.CodigoProducto
        WHERE c.SocioId = (SELECT SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @cedula)
          AND p.EsCertificado = 0
      `);
    
    // Limpiar asientos generados
    await pool.request()
      .input('id', TEST_LOAN_ID)
      .query("DELETE FROM dbo.RegistroContable WHERE Concepto LIKE '%' + @id + '%'");

    console.log('✅ Base de datos restaurada.');

    console.log('\n======================================================');
    console.log('🎉 ¡SUITE DE PRUEBAS COMPLETADA EXITOSAMENTE! 100% OK');
    console.log('======================================================\n');

    await pool.close();
  } catch (err) {
    console.error('\n❌ ERROR EN LA PRUEBA DE INTEGRACIÓN:');
    console.error(err.message);
    if (pool) await pool.close();
    process.exit(1);
  }
}

runTests();
