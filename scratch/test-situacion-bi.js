// scratch/test-situacion-bi.js
// Script de prueba para validar las APIs de Situación General y Historial de Cajas.

const API_BASE = 'http://localhost:8080/api';

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 CORRIENDO PRUEBAS PARA SITUACIÓN GENERAL Y BI (CONTROL CAJA)');
  console.log('======================================================\n');

  try {
    // 1. Probar Historial de Caja (BI)
    console.log('Testing GET /api/caja/control/historial ...');
    const histRes = await fetch(`${API_BASE}/caja/control/historial`);
    if (!histRes.ok) {
      throw new Error(`HTTP Error ${histRes.status} calling /api/caja/control/historial`);
    }
    const histData = await histRes.json();
    console.log('Historial API response:', JSON.stringify(histData).substring(0, 300) + '...');
    if (!histData.ok || !Array.isArray(histData.data)) {
      throw new Error('Historial API response is missing or data is not an array.');
    }
    console.log('✅ Historial de Cajas API is functional.\n');

    // 2. Probar Estado de Situación General (Dashboard)
    console.log('Testing GET /api/reportes/situacion-general ...');
    const sitRes = await fetch(`${API_BASE}/reportes/situacion-general`);
    if (!sitRes.ok) {
      throw new Error(`HTTP Error ${sitRes.status} calling /api/reportes/situacion-general`);
    }
    const sitData = await sitRes.json();
    console.log('Situación General response:', JSON.stringify(sitData, null, 2));
    if (!sitData.ok || !sitData.data) {
      throw new Error('Situación General API response is missing or invalid.');
    }
    const d = sitData.data;
    if (typeof d.totalSocios !== 'number') throw new Error('totalSocios must be a number');
    if (!Array.isArray(d.sociosPorTipo)) throw new Error('sociosPorTipo must be an array');
    if (typeof d.saldoAhorroVista !== 'number') throw new Error('saldoAhorroVista must be a number');
    if (typeof d.saldoCertificados !== 'number') throw new Error('saldoCertificados must be a number');
    if (typeof d.numAhorroVista !== 'number') throw new Error('numAhorroVista must be a number');
    if (typeof d.numCertificados !== 'number') throw new Error('numCertificados must be a number');

    console.log('✅ Estado de Situación General API is functional.\n');

    console.log('======================================================');
    console.log('🎉 TODAS LAS NUEVAS APIS VERIFICADAS CON ÉXITO (100% PASS)');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR EN LAS PRUEBAS DE APIS NUEVAS:', err.message);
    process.exit(1);
  }
}

runTests();
