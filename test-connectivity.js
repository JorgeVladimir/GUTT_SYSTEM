import { pathToFileURL } from 'url';

const API_BASE = 'http://localhost:5005/api';

async function check(name, fn) {
  try {
    const result = await fn();
    if (result.ok) {
      console.log(`   ✅ ${name}`);
      return { ok: true };
    } else {
      console.log(`   ❌ ${name} — ${result.reason}`);
      return { ok: false, error: result.reason };
    }
  } catch (err) {
    console.log(`   ❌ ${name} — ${err.message}`);
    return { ok: false, error: err.message };
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🔌 SUITE DE CONECTIVIDAD Y SALUD DEL SISTEMA');
  console.log('======================================================\n');

  const results = [];

  // 1. Health check
  results.push(await check('GET /health — backend activo', async () => {
    const r = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    if (d.ok || d.status === 'ok') return { ok: true };
    return { ok: false, reason: `status=${r.status} body=${JSON.stringify(d)}` };
  }));

  // 2. Fecha del servidor
  results.push(await check('GET /server-date — reloj del servidor', async () => {
    const r = await fetch(`${API_BASE}/server-date`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    if (d.fecha || d.date || d.serverDate || r.ok) return { ok: true };
    return { ok: false, reason: `sin campo fecha: ${JSON.stringify(d)}` };
  }));

  // 3. Tasas DPF — valida conexión SQL Server
  results.push(await check('GET /dpf/tasas — conexión SQL Server (≥1 tasa activa)', async () => {
    const r = await fetch(`${API_BASE}/dpf/tasas`, { signal: AbortSignal.timeout(10000) });
    const d = await r.json();
    if (!d.ok) return { ok: false, reason: d.error || 'ok=false' };
    if (!Array.isArray(d.data) || d.data.length === 0) return { ok: false, reason: 'Sin tasas configuradas en BD' };
    const activas = d.data.filter(t => t.Activo);
    if (activas.length === 0) return { ok: false, reason: 'Sin tasas ACTIVAS (verifique TasasDPF en BD)' };
    return { ok: true };
  }));

  // 4. Búsqueda de socios — valida endpoint y parámetro ?q=
  results.push(await check('GET /socios/buscar?q=test — endpoint de búsqueda', async () => {
    const r = await fetch(`${API_BASE}/socios/buscar?q=test`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    if (!r.ok && r.status >= 500) return { ok: false, reason: `HTTP ${r.status} — error interno` };
    if (d.ok !== undefined) return { ok: true };
    return { ok: false, reason: 'Respuesta no tiene campo ok' };
  }));

  // 5. Loans/all — valida tabla SolicitudesCredito
  results.push(await check('GET /socios/loans/all — tabla de créditos', async () => {
    const r = await fetch(`${API_BASE}/socios/loans/all`, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    if (d.ok && Array.isArray(d.loans)) return { ok: true };
    return { ok: false, reason: d.error || 'estructura inesperada' };
  }));

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  const errors = results.filter(r => !r.ok).map(r => r.error);

  console.log('\n======================================================');
  console.log(`📊 Conectividad: ${passed}/${results.length} comprobaciones pasadas`);
  console.log('======================================================\n');

  return { passed, failed, errors };
}

export { runTests };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTests().then(r => process.exit(r.failed > 0 ? 1 : 0));
}
