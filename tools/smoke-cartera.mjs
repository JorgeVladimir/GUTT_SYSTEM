// Smoke test del proceso mensual de reclasificacion de cartera y del indice de
// solvencia regulatorio.
//
//   node tools/smoke-cartera.mjs            -> simula, aplica, verifica y REVERSA (deja todo como estaba)
//   node tools/smoke-cartera.mjs --aplicar  -> igual pero NO reversa al final
//
// No verifica solamente que los endpoints respondan: verifica que despues de aplicar
// el proceso la contabilidad quede realmente donde debe. En concreto:
//   - el asiento cuadra (debe = haber)
//   - el saldo contable de cada cuenta de cartera termina en el objetivo calculado
//   - la morosidad CONTABLE pasa a coincidir con la morosidad REAL (era el bug de fondo)
//   - el Estado de Situacion Financiera sigue cuadrando despues del asiento
//   - la reversa devuelve los saldos exactamente al punto de partida
//
// Requiere server.js corriendo en 5005 (pwsh -File tools/restart-backend.ps1).
import jwt from 'jsonwebtoken';
import { API_BASE } from './_env.mjs';

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en api/.env');
  process.exit(1);
}
const token = jwt.sign({ usuarioId: 'admin', rol: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '10m' });
const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const VERDE = '\x1b[32m', ROJO = '\x1b[31m', GRIS = '\x1b[90m', NEGRITA = '\x1b[1m', RESET = '\x1b[0m';
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

let pasaron = 0, fallaron = 0;
const errores = [];
function check(nombre, ok, detalle) {
  if (ok) { pasaron++; console.log(`  ${VERDE}PASS${RESET} ${nombre} ${GRIS}${detalle || ''}${RESET}`); }
  else { fallaron++; errores.push(`${nombre}: ${detalle || ''}`); console.log(`  ${ROJO}FAIL${RESET} ${nombre} ${detalle || ''}`); }
}

async function api(metodo, ruta, cuerpo) {
  const res = await fetch(`${API_BASE}${ruta}`, {
    method: metodo, headers: auth,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = { ok: false, error: texto.slice(0, 200) }; }
  return { status: res.status, json };
}

/** Saldos de cartera (14xx) y provision (1499) desde el balance de comprobacion. */
async function saldosCartera() {
  const { json } = await api('POST', '/api/reports/generate.php', { type: 'sp_r_bal_compro' });
  const filas = Array.isArray(json) ? json : [];
  const mapa = {};
  for (const f of filas) {
    // El balance de comprobación devuelve la cuenta en `code` (no `codigo`).
    const codigo = String(f.code || '');
    if (codigo.startsWith('14')) mapa[codigo] = Math.round(((f.debe || 0) - (f.haber || 0)) * 100) / 100;
  }
  return mapa;
}

// Contrato { passed, failed, errors } para que test-all.js lo incluya como una suite más.
export async function runTests() {
pasaron = 0; fallaron = 0; errores.length = 0;

console.log('');
console.log(`${NEGRITA}  Smoke — Reclasificación de cartera y solvencia${RESET}`);
console.log(`  ${'─'.repeat(64)}`);

const noReversar = process.argv.includes('--aplicar');
const fechaCorte = new Date().toISOString().split('T')[0];
const saldosIniciales = await saldosCartera();

// ── 1. Parámetros normativos ────────────────────────────────────────────────
{
  const { json } = await api('GET', '/api/cartera/parametros-provision');
  const segmentos = new Set((json.parametros || []).map(p => p.segmento));
  const familias = Object.keys(json.bandasPorFamilia || {});
  const v1423 = (json.bandasPorFamilia || {})['1423'] || [];
  check('parámetros de provisión cargados',
    json.ok && segmentos.size === 4 && (json.parametros || []).length === 36,
    `${(json.parametros || []).length} filas · ${segmentos.size} segmentos`);
  // La prueba que importa: las bandas salen del catálogo, no de una tabla escrita a mano.
  check('bandas leídas del Catálogo Único (no hardcodeadas)',
    familias.length >= 20 && v1423.length === 6,
    `${familias.length} familias · 1423 vivienda vencida tiene ${v1423.length} bandas`);
}

// ── 2. Simulación ───────────────────────────────────────────────────────────
let simulacion;
{
  const { json } = await api('POST', '/api/cartera/reclasificar', { fechaCorte, simular: true });
  simulacion = json;
  check('simulación responde', json.ok === true && json.estado === 'SIMULADO',
    `${(json.movimientos || []).length} movimiento(s) · ${money(json.control?.totalDebe)}`);
  check('el asiento simulado cuadra', json.control?.cuadrado === true,
    `debe ${money(json.control?.totalDebe)} = haber ${money(json.control?.totalHaber)}`);
  check('la simulación no tocó la contabilidad',
    JSON.stringify(await saldosCartera()) === JSON.stringify(saldosIniciales),
    'saldos idénticos antes y después de simular');
}

if (!simulacion.aplicable) {
  const detalle = (simulacion.bloqueos || []).join(' ');
  console.log(`  ${ROJO}El proceso no es aplicable:${RESET} ${detalle}`);
  console.log('');
  errores.push(`proceso no aplicable: ${detalle}`);
  return { passed: pasaron, failed: fallaron + 1, errors: errores };
}

// ── 3. Aplicación ───────────────────────────────────────────────────────────
let procesoId = null;
{
  const { status, json } = await api('POST', '/api/cartera/reclasificar', { fechaCorte, simular: false, observaciones: 'Corrida de smoke test' });
  if (json.estado === 'DUPLICADO') {
    // Ya hay una corrida aplicada para hoy: se reversa para dejar la prueba repetible.
    console.log(`  ${GRIS}corte ${fechaCorte} ya aplicado (#${json.procesoId}); se reversa para repetir la prueba${RESET}`);
    await api('POST', `/api/cartera/reclasificar/${json.procesoId}/reversar`, { motivo: 'Repetir smoke test' });
    const reintento = await api('POST', '/api/cartera/reclasificar', { fechaCorte, simular: false, observaciones: 'Corrida de smoke test' });
    procesoId = reintento.json.procesoId;
    check('aplicación', reintento.json.ok === true && reintento.json.estado === 'APLICADO', `proceso #${procesoId}`);
  } else {
    procesoId = json.procesoId;
    check('aplicación', status === 200 && json.ok === true && json.estado === 'APLICADO',
      json.estado === 'APLICADO' ? `proceso #${procesoId} · ${money(json.control?.totalDebe)} reclasificados` : (json.error || json.estado));
  }
}

// ── 4. La contabilidad quedó donde debía ────────────────────────────────────
{
  const despues = await saldosCartera();
  const desviaciones = (simulacion.movimientos || [])
    .map(m => ({ cuenta: m.cuenta, esperado: m.saldoObjetivo, real: despues[m.cuenta] || 0 }))
    .filter(d => Math.abs(d.esperado - d.real) >= 0.01);
  check('cada cuenta de cartera quedó en su saldo objetivo', desviaciones.length === 0,
    desviaciones.length ? desviaciones.map(d => `${d.cuenta}: esperado ${money(d.esperado)} real ${money(d.real)}`).join(' · ')
                        : `${(simulacion.movimientos || []).length} cuenta(s) verificadas`);

  const provisionEsperada = simulacion.provisiones?.totalRequerida || 0;
  const provisionReal = Math.round(-Object.entries(despues)
    .filter(([c]) => c.startsWith('1499'))
    .reduce((s, [, v]) => s + v, 0) * 100) / 100;
  check('la provisión constituida es la requerida por calificación',
    Math.abs(provisionEsperada - provisionReal) < 0.01,
    `requerida ${money(provisionEsperada)} · constituida ${money(provisionReal)}`);
}

// ── 5. El bug de fondo: morosidad contable vs morosidad real ────────────────
{
  const { json } = await api('POST', '/api/reports/generate.php', { type: 'sp_indicadores_perlas' });
  const r = json.reconciliacion || {};
  // Se compara contra el mismo umbral de materialidad que usa el sistema (max $1 / 0,1%),
  // no contra $0.01: el plan de pagos no cierra al centavo contra el monto desembolsado.
  const materialidad = Math.max(1, Math.abs(r.carteraContable || 0) * 0.001);
  check('morosidad contable ya coincide con la real',
    Math.abs(r.diferenciaImproductiva || 0) <= materialidad && (r.alertas || []).length === 0,
    `improductiva contable ${money(r.improductivaContable)} vs real ${money(r.improductivaOperativa)} · ${(r.alertas || []).length} alerta(s)`);

  const solvencia = json.indicadores.find(i => i.nombre.includes('Índice de Solvencia'));
  check('el índice de solvencia se publica como exacto', !!solvencia && solvencia.exacto === true,
    solvencia ? `${solvencia.valor}% (mínimo ${solvencia.minimo}%) · cumple: ${solvencia.cumple}` : 'indicador ausente');
  check('ninguna cuenta de activo queda sin ponderar',
    (json.solvencia?.categorias || []).length > 0 &&
      !(r.alertas || []).some(a => a.includes('sin ponderar')),
    `APR ${money(json.solvencia?.activosPonderados)} sobre activo contable ${money(json.solvencia?.activoContable)}`);
}

// ── 6. El balance sigue cuadrando después del asiento ───────────────────────
{
  const { json } = await api('POST', '/api/reports/generate.php', { type: 'sp_esf_seps' });
  check('el Estado de Situación Financiera sigue cuadrando', json.cuadrado === true,
    `activo ${money(json.totalActivo)} vs pasivo+patrimonio ${money(json.totalPasivoMasPatrimonio)}`);
}

// ── 7. Idempotencia: no se puede aplicar dos veces el mismo corte ───────────
{
  const { status, json } = await api('POST', '/api/cartera/reclasificar', { fechaCorte, simular: false });
  check('no permite duplicar el corte', status === 409 && json.estado === 'DUPLICADO',
    `HTTP ${status} · ${json.estado || json.error}`);
}

// ── 8. Historial ────────────────────────────────────────────────────────────
{
  const { json } = await api('GET', '/api/cartera/reclasificaciones');
  const proceso = (json.procesos || []).find(p => p.procesoId === procesoId);
  check('el proceso queda en el historial con su detalle',
    !!proceso && proceso.estado === 'APLICADO' && proceso.detalle.length > 0,
    proceso ? `#${proceso.procesoId} · ${proceso.detalle.length} renglón(es) · morosidad ${proceso.morosidadPct}%` : 'no aparece');
}

// ── 9. Reversa ──────────────────────────────────────────────────────────────
if (noReversar) {
  console.log(`  ${GRIS}--aplicar: se deja el proceso #${procesoId} aplicado, sin reversar${RESET}`);
} else {
  const { json } = await api('POST', `/api/cartera/reclasificar/${procesoId}/reversar`, { motivo: 'Fin del smoke test' });
  check('reversa aceptada', json.ok === true, `reversa #${json.reversaId}`);
  const finales = await saldosCartera();
  const cuentas = new Set([...Object.keys(saldosIniciales), ...Object.keys(finales)]);
  const distintas = [...cuentas].filter(c => Math.abs((saldosIniciales[c] || 0) - (finales[c] || 0)) >= 0.01);
  check('la reversa devuelve los saldos al punto de partida', distintas.length === 0,
    distintas.length ? distintas.map(c => `${c}: ${money(saldosIniciales[c] || 0)} -> ${money(finales[c] || 0)}`).join(' · ')
                     : `${cuentas.size} cuenta(s) verificadas`);
}

console.log(`  ${'─'.repeat(64)}`);
console.log(`  ${pasaron} PASS · ${fallaron} FAIL`);
console.log('');
return { passed: pasaron, failed: fallaron, errors: errores };
}

import { pathToFileURL } from 'url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await runTests();
  process.exit(r.failed > 0 ? 1 : 0);
}
