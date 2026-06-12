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

sqlConfig.port = 1433;

const API_BASE = 'http://localhost:8080/api';
const TEST_CEDULA = '9999999999';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DE INTEGRACIÓN DIGITAL');
  console.log('======================================================\n');
  
  let pool;
  try {
    pool = await sql.connect(sqlConfig);
    
    // 0. Limpiar datos de pruebas previas
    console.log('🧹 Limpiando registros anteriores de pruebas...');
    await pool.request()
      .input('id', sql.NVarChar(20), TEST_CEDULA)
      .query(`
        DECLARE @SocioId BIGINT;
        SELECT @SocioId = SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @id;
        IF @SocioId IS NOT NULL
        BEGIN
          DELETE FROM dbo.CuentasAhorro WHERE SocioId = @SocioId;
          DELETE FROM dbo.ActivacionBancaLinea WHERE SocioId = @SocioId;
          DELETE FROM dbo.RegistroSocios WHERE SOCIOID = @SocioId;
        END
      `);
    console.log('✅ Base de datos limpia.');

    // 1. Registro de Socio
    console.log('\n------------------------------------------------------');
    console.log('Paso 1: Registro de nuevo socio...');
    const registerResponse = await fetch(`${API_BASE}/socios/registrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipoPersona: 'SOCIO',
        tipoIdentificacion: 'CÉDULA',
        identificacion: TEST_CEDULA,
        primerNombre: 'TEST',
        segundoNombre: 'AUTOMATED',
        primerApellido: 'REGRESSION',
        segundoApellido: 'FLOW',
        soloUnNombre: false,
        soloUnApellido: false,
        email: 'test-automated@example.com',
        telefono: '0999999999',
        fechaNacimiento: '1990-01-01',
        estadoCivil: 'SOLTERO(A)',
        pin: '4321',
        paisNacimiento: 'ECUADOR',
        provinciaNacimiento: 'TUNGURAHUA',
        cantonNacimiento: 'PATATE',
        parroquiaNacimiento: 'PATATE',
        paisResidencia: 'ECUADOR',
        provinciaResidencia: 'TUNGURAHUA',
        cantonResidencia: 'PATATE',
        parroquiaResidencia: 'PATATE',
        direccionDomicilio: 'Calle Principal S/N',
        lugarTrabajo: 'Oficinas Patate',
        provinciaTrabajo: 'TUNGURAHUA',
        cantonTrabajo: 'PATATE',
        parroquiaTrabajo: 'PATATE',
        etnia: 'MESTIZO',
        genero: 'MASCULINO',
        nivelInstruccion: 'SUPERIOR',
        profesion: 'INGENIERO',
        usuarioRegistro: 'test-runner',
        emailConfirmado: false
      })
    });

    const registerData = await registerResponse.json();
    if (!registerResponse.ok || !registerData.ok) {
      throw new Error(`Fallo el registro del socio: ${registerData.error}`);
    }
    console.log(`✅ Socio registrado exitosamente. Nro Socio: ${registerData.numeroSocio}`);
    
    // Verificar en DB
    const dbSocioRes = await pool.request()
      .input('SocioId', sql.BigInt, registerData.socioId)
      .query('SELECT PIN, CodigoVerificacion, Activo, AceptoDatosPersonales FROM dbo.ActivacionBancaLinea WHERE SocioId = @SocioId');
    
    const dbSocio = dbSocioRes.recordset[0];
    if (!dbSocio) {
      throw new Error('La tabla ActivacionBancaLinea no registró la fila de activación.');
    }
    
    if (dbSocio.PIN !== '4321' || dbSocio.Activo !== false || dbSocio.AceptoDatosPersonales !== false) {
      throw new Error('Los valores iniciales en ActivacionBancaLinea son incorrectos.');
    }
    console.log('✅ Registro en tabla dbo.ActivacionBancaLinea validado correctamente.');

    // 2. Intento de login de socio bloqueado (requiere verificar correo)
    console.log('\n------------------------------------------------------');
    console.log('Paso 2: Intentando ingresar sin verificación...');
    const loginResponse1 = await fetch(`${API_BASE}/auth/socio-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: TEST_CEDULA, pin: '4321' })
    });
    const loginData1 = await loginResponse1.json();
    
    if (!loginResponse1.ok || !loginData1.ok) {
      throw new Error(`Error en el login inicial: ${loginData1.error}`);
    }
    
    if (loginData1.emailConfirmed !== false) {
      throw new Error('El estado emailConfirmed debería ser false.');
    }
    const sentCode = loginData1.activationCode;
    console.log(`✅ Login denegado correctamente (Banca bloqueada). Código requerido: ${sentCode}`);

    // 3. Confirmación de correo electrónico / Activación de banca
    console.log('\n------------------------------------------------------');
    console.log('Paso 3: Verificando correo con el código recibido...');
    const verifyResponse = await fetch(`${API_BASE}/socios/verificar-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificacion: TEST_CEDULA, codigo: sentCode })
    });
    const verifyData = await verifyResponse.json();
    if (!verifyResponse.ok || !verifyData.ok) {
      throw new Error(`Fallo la verificación del correo: ${verifyData.error}`);
    }
    
    // Validar en DB
    const dbVerifyRes = await pool.request()
      .input('SocioId', sql.BigInt, registerData.socioId)
      .query('SELECT Activo FROM dbo.ActivacionBancaLinea WHERE SocioId = @SocioId');
    if (dbVerifyRes.recordset[0].Activo !== true) {
      throw new Error('La banca en línea no se marcó como activa en la base de datos.');
    }
    console.log('✅ Correo verificado y banca en línea activada en base de datos.');

    // 4. Intento de login posterior a activación (debe pedir aceptar términos)
    console.log('\n------------------------------------------------------');
    console.log('Paso 4: Ingresando con correo verificado (Verificación de Modal de Ley)...');
    const loginResponse2 = await fetch(`${API_BASE}/auth/socio-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: TEST_CEDULA, pin: '4321' })
    });
    const loginData2 = await loginResponse2.json();
    if (loginData2.emailConfirmed !== true || loginData2.aceptoDatosPersonales !== false) {
      throw new Error('El socio debería estar verificado pero no haber aceptado la ley de datos.');
    }
    console.log('✅ Banca móvil desbloqueada. Modal de Ley de Datos Personales requerido correctamente.');

    // 5. Aceptación de la Ley de Protección de Datos Personales
    console.log('\n------------------------------------------------------');
    console.log('Paso 5: Aceptando Ley de Protección de Datos Personales...');
    const termsResponse = await fetch(`${API_BASE}/socios/aceptar-terminos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identificacion: TEST_CEDULA })
    });
    const termsData = await termsResponse.json();
    if (!termsResponse.ok || !termsData.ok) {
      throw new Error(`Error al aceptar los términos: ${termsData.error}`);
    }
    
    // Validar en DB
    const dbTermsRes = await pool.request()
      .input('SocioId', sql.BigInt, registerData.socioId)
      .query('SELECT AceptoDatosPersonales, FechaAceptacionDatos FROM dbo.ActivacionBancaLinea WHERE SocioId = @SocioId');
    const dbTerms = dbTermsRes.recordset[0];
    if (dbTerms.AceptoDatosPersonales !== true || !dbTerms.FechaAceptacionDatos) {
      throw new Error('No se registró la fecha ni el estado de aceptación en la base de datos.');
    }
    console.log('✅ Aceptación registrada y fecha registrada en base de datos.');

    // 6. Login final (acceso directo al dashboard)
    console.log('\n------------------------------------------------------');
    console.log('Paso 6: Login final de socio activo...');
    const loginResponse3 = await fetch(`${API_BASE}/auth/socio-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: TEST_CEDULA, pin: '4321' })
    });
    const loginData3 = await loginResponse3.json();
    if (loginData3.emailConfirmed !== true || loginData3.aceptoDatosPersonales !== true) {
      throw new Error('El socio debería ingresar directo sin modal ni bloqueos.');
    }
    console.log('✅ Acceso directo al Dashboard concedido. Flujo completo validado.');

    // 7. Limpieza de datos de pruebas final
    console.log('\n------------------------------------------------------');
    console.log('Limpiando registros de pruebas de la base de datos...');
    await pool.request()
      .input('id', sql.NVarChar(20), TEST_CEDULA)
      .query(`
        DECLARE @SocioId BIGINT;
        SELECT @SocioId = SOCIOID FROM dbo.RegistroSocios WHERE Identificacion = @id;
        IF @SocioId IS NOT NULL
        BEGIN
          DELETE FROM dbo.CuentasAhorro WHERE SocioId = @SocioId;
          DELETE FROM dbo.ActivacionBancaLinea WHERE SocioId = @SocioId;
          DELETE FROM dbo.RegistroSocios WHERE SOCIOID = @SocioId;
        END
      `);
    console.log('✅ Base de datos limpia de registros de prueba.');

    console.log('\n======================================================');
    console.log('🎉 ¡TODAS LAS PRUEBAS SE COMPLETARON CON ÉXITO! (100% OK)');
    console.log('======================================================\n');
    
    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR EN LA SUITE DE PRUEBAS DE INTEGRACIÓN:');
    console.error(err.message);
    console.log('======================================================\n');
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
    process.exit(1);
  }
}

runTests();
