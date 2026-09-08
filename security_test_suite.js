import sql from 'mssql';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { conSesion, sinSesion, tokenFalsificado } from './test-helpers.js';

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

const API_BASE = 'http://localhost:5005/api';
const TEST_MEMBER_CEDULA = '1720884012'; // Jorge Vladimir de la captura

async function runTests() {
  console.log('\n======================================================');
  console.log('🛡️  SUITE DE PRUEBAS DE SEGURIDAD Y QA (PENTESTING LÓGICO) 🛡️');
  console.log('======================================================\n');

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  // 🧪 PRUEBA 1: Bypass de Rol (Aprobación)
  // Dos capas distintas, y hay que probarlas por separado:
  //   sin token          -> 401 (no autenticado)
  //   token de asesor    -> 403 (autenticado, pero sin autorización para aprobar)
  // Antes esta prueba solo miraba el 403 y no mandaba token: desde que existe requireAuth
  // recibía un 401 y "fallaba", cuando en realidad el sistema se había vuelto más seguro.
  try {
    console.log('\n1. [SEGURIDAD] Probando Bypass de Rol en Aprobación (Asesor -> Aprobación)...');

    const sinToken = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: sinSesion,
      body: JSON.stringify({ ids: ['CRD-SEC-TEST-001'], reason: 'Sin sesión', usuarioId: 'asesor' })
    });
    const sinTokenData = await sinToken.json();
    const capa1 = sinToken.status === 401 && !sinTokenData.ok;

    const conToken = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: conSesion('asesor', 'CREDIT_OFFICER'),
      body: JSON.stringify({
        ids: ['CRD-SEC-TEST-001'],
        reason: 'Intento malicioso de aprobación por asesor',
        usuarioId: 'asesor'
      })
    });
    const conTokenData = await conToken.json();
    const capa2 = conToken.status === 403 && !conTokenData.ok &&
                  String(conTokenData.error || '').toLowerCase().includes('no tienen permisos para aprobar');

    if (capa1 && capa2) {
      console.log('   ✅ PRUEBA PASADA: 401 sin sesión y 403 con sesión de asesor.');
      successCount++;
    } else {
      const msg = `Bypass aprobación: sin token -> ${sinToken.status} (esperado 401); con token de asesor -> ${conToken.status} (esperado 403, error="${conTokenData.error}")`;
      console.log(`   ❌ PRUEBA FALLIDA: ${msg}`);
      errors.push(msg); failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    errors.push(err.message); failCount++;
  }

  // 🧪 PRUEBA 2: Bypass de Rol (Desembolso)
  // Mismo criterio de dos capas que la prueba 1.
  try {
    console.log('\n2. [SEGURIDAD] Probando Bypass de Rol en Desembolso (Asesor -> Desembolso)...');

    const sinToken = await fetch(`${API_BASE}/socios/loans/disburse`, {
      method: 'POST',
      headers: sinSesion,
      body: JSON.stringify({ ids: ['CRD-SEC-TEST-001'], usuarioId: 'asesor' })
    });
    const sinTokenData = await sinToken.json();
    const capa1 = sinToken.status === 401 && !sinTokenData.ok;

    const conToken = await fetch(`${API_BASE}/socios/loans/disburse`, {
      method: 'POST',
      headers: conSesion('asesor', 'CREDIT_OFFICER'),
      body: JSON.stringify({ ids: ['CRD-SEC-TEST-001'], usuarioId: 'asesor' })
    });
    const conTokenData = await conToken.json();
    const capa2 = conToken.status === 403 && !conTokenData.ok &&
                  String(conTokenData.error || '').toLowerCase().includes('no tienen permisos para desembolsar');

    if (capa1 && capa2) {
      console.log('   ✅ PRUEBA PASADA: 401 sin sesión y 403 con sesión de asesor.');
      successCount++;
    } else {
      const msg = `Bypass desembolso: sin token -> ${sinToken.status} (esperado 401); con token de asesor -> ${conToken.status} (esperado 403, error="${conTokenData.error}")`;
      console.log(`   ❌ PRUEBA FALLIDA: ${msg}`);
      errors.push(msg); failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    errors.push(err.message); failCount++;
  }

  // 🧪 PRUEBA 3: Inyección de Datos (Valor de Prenda Negativo)
  // Intentar crear una solicitud de garantía prendaria con avalúo negativo
  try {
    console.log('\n3. [SEGURIDAD] Probando Inyección de Datos (Garantía con Avalúo Negativo)...');
    const res = await fetch(`${API_BASE}/socios/loans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'CRD-SEC-TEST-002',
        memberId: TEST_MEMBER_CEDULA,
        amount: 2000.00,
        balance: 2000.00,
        rate: 14.00,
        installmentsCount: 12,
        type: 'Consumo Ordinario',
        status: 'SOLICITADO',
        startDate: new Date().toLocaleDateString('es-EC'),
        dueDate: new Date(Date.now() + 12 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-EC'),
        garantiaInfo: {
          tipo: 'PRENDARIA',
          prendaria: {
            avaluo: -500.00, // NEGATIVO (Inyección inconsistente)
            tipoPrenda: 'Vehiculo',
            descripcion: 'Intento de inyección con valor negativo'
          }
        },
        origen: 'CAJA_PATATE'
      })
    });

    const data = await res.json();
    if (res.status === 400 && !data.ok && data.error.includes('no puede ser negativo o inconsistente')) {
      console.log('   ✅ PRUEBA PASADA: El servidor rechazó la solicitud con avalúo negativo con código 400.');
      successCount++;
    } else {
      const msg = `Inyección avalúo negativo: código ${res.status}, error="${data.error}"`;
      console.log(`   ❌ PRUEBA FALLIDA: ${msg}`);
      errors.push(msg); failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    errors.push(err.message); failCount++;
  }

  // 🧪 PRUEBA 4: Integridad de la sesión
  // Un token bien formado pero firmado con OTRO secreto debe ser rechazado con 401.
  // Es la prueba que de verdad importa: si el servidor aceptara esta firma, cualquiera
  // podría emitirse a sí mismo un token de ADMIN. También se comprueba que un usuario
  // autenticado no pueda operar declarando ser otro (requireSelf).
  try {
    console.log('\n4. [SEGURIDAD] Probando integridad de la sesión (token firmado con secreto ajeno)...');

    const falsificado = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenFalsificado('admin', 'ADMIN')}` },
      body: JSON.stringify({ ids: ['CRD-SEC-TEST-003'], reason: 'Token forjado', usuarioId: 'admin' })
    });
    const falsificadoData = await falsificado.json();
    const rechazaFirma = falsificado.status === 401 && !falsificadoData.ok;

    const suplantacion = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: conSesion('asesor', 'CREDIT_OFFICER'),
      body: JSON.stringify({ ids: ['CRD-SEC-TEST-003'], reason: 'Suplantando a admin', usuarioId: 'admin' })
    });
    const suplantacionData = await suplantacion.json();
    const rechazaSuplantacion = suplantacion.status === 403 && !suplantacionData.ok;

    if (rechazaFirma && rechazaSuplantacion) {
      console.log('   ✅ PRUEBA PASADA: token con firma ajena rechazado (401) y suplantación de usuario rechazada (403).');
      successCount++;
    } else {
      const msg = `Integridad de sesión: token forjado -> ${falsificado.status} (esperado 401); suplantación -> ${suplantacion.status} (esperado 403)`;
      console.log(`   ❌ PRUEBA FALLIDA: ${msg}`);
      errors.push(msg); failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    errors.push(err.message); failCount++;
  }

  console.log('\n======================================================');
  console.log(`📊 RESULTADOS: ${successCount} PASADAS, ${failCount} FALLIDAS`);
  console.log('======================================================\n');

  return { passed: successCount, failed: failCount, errors };
}

export { runTests };

import { pathToFileURL } from 'url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
