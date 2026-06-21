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

const API_BASE = 'http://localhost:5005/api';
const TEST_MEMBER_CEDULA = '1720884012'; // Jorge Vladimir de la captura

async function runSecurityTests() {
  console.log('\n======================================================');
  console.log('🛡️  SUITE DE PRUEBAS DE SEGURIDAD Y QA (PENTESTING LÓGICO) 🛡️');
  console.log('======================================================\n');

  let successCount = 0;
  let failCount = 0;

  // 🧪 PRUEBA 1: Bypass de Rol (Aprobación)
  // Un asesor intenta enviar un POST para aprobar un crédito
  try {
    console.log('1. [SEGURIDAD] Probando Bypass de Rol en Aprobación (Asesor -> Aprobación)...');
    const res = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['CRD-SEC-TEST-001'],
        reason: 'Intento malicioso de aprobación por asesor',
        usuarioId: 'asesor'
      })
    });
    
    const data = await res.json();
    if (res.status === 403 && !data.ok && data.error.toLowerCase().includes('no tienen permisos para aprobar')) {
      console.log('   ✅ PRUEBA PASADA: El servidor denegó la aprobación del Asesor con código 403.');
      successCount++;
    } else {
      console.log(`   ❌ PRUEBA FALLIDA: El servidor devolvió código ${res.status} y respuesta:`, data);
      failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    failCount++;
  }

  // 🧪 PRUEBA 2: Bypass de Rol (Desembolso)
  // Un asesor intenta enviar un POST para desembolsar un crédito
  try {
    console.log('\n2. [SEGURIDAD] Probando Bypass de Rol en Desembolso (Asesor -> Desembolso)...');
    const res = await fetch(`${API_BASE}/socios/loans/disburse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['CRD-SEC-TEST-001'],
        usuarioId: 'asesor'
      })
    });
    
    const data = await res.json();
    if (res.status === 403 && !data.ok && data.error.toLowerCase().includes('no tienen permisos para desembolsar')) {
      console.log('   ✅ PRUEBA PASADA: El servidor denegó el desembolso del Asesor con código 403.');
      successCount++;
    } else {
      console.log(`   ❌ PRUEBA FALLIDA: El servidor devolvió código ${res.status} y respuesta:`, data);
      failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    failCount++;
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
      console.log(`   ❌ PRUEBA FALLIDA: El servidor devolvió código ${res.status} y respuesta:`, data);
      failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    failCount++;
  }

  // 🧪 PRUEBA 4: Seguridad de Sesión (Denegación por Defecto)
  // Intentar operar sin enviar usuarioId (debe caer en rol por defecto de 'asesor' y denegar)
  try {
    console.log('\n4. [SEGURIDAD] Probando Seguridad de Sesión (Petición sin credenciales de usuario)...');
    const res = await fetch(`${API_BASE}/socios/loans/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['CRD-SEC-TEST-003'],
        reason: 'Prueba sin usuarioId'
      })
    });
    
    const data = await res.json();
    // Debe fallar con 403 al caer en rol de asesor por defecto
    if (res.status === 403 && !data.ok && data.error.toLowerCase().includes('no tienen permisos para aprobar')) {
      console.log('   ✅ PRUEBA PASADA: El servidor denegó la operación al no contar con un usuarioId válido (cae a rol restrictivo por defecto).');
      successCount++;
    } else {
      console.log(`   ❌ PRUEBA FALLIDA: El servidor devolvió código ${res.status} y respuesta:`, data);
      failCount++;
    }
  } catch (err) {
    console.log('   ❌ PRUEBA CON ERROR:', err.message);
    failCount++;
  }

  console.log('\n======================================================');
  console.log(`📊 RESULTADOS: ${successCount} PASADAS, ${failCount} FALLIDAS`);
  console.log('======================================================\n');
}

runSecurityTests();
