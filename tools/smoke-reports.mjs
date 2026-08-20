// Smoke test de la reportería SEPS: golpea los 6 reportes de /api/reports/generate.php y
// verifica no solo que respondan, sino que CUADREN donde tienen que cuadrar.
//
//   node tools/smoke-reports.mjs
//
// Imprime ~10 líneas PASS/FAIL en vez de ~600 de JSON. Requiere server.js corriendo en 5005
// (levantarlo con: pwsh -File tools/restart-backend.ps1).
import jwt from 'jsonwebtoken';
import { API_BASE } from './_env.mjs';

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en api/.env');
  process.exit(1);
}
const token = jwt.sign({ usuarioId: 'admin', rol: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '10m' });

async function run(type) {
  const res = await fetch(`${API_BASE}/api/reports/generate.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// Cada check devuelve { ok, detalle }. El detalle es una línea, no un volcado.
const checks = {
  async sp_esf_seps() {
    const d = await run('sp_esf_seps');
    const ok = d.ok && d.cuadrado === true;
    return { ok, detalle: `Activo ${money(d.totalActivo)} vs Pasivo+Patrimonio ${money(d.totalPasivoMasPatrimonio)}${d.cuadrado ? ' — cuadra' : ` — DESCUADRE ${money(d.diferencia)}`}` };
  },
  async sp_r_bal_compro() {
    const rows = await run('sp_r_bal_compro');
    if (!Array.isArray(rows)) return { ok: false, detalle: 'respuesta no es arreglo' };
    const debe = rows.reduce((s, r) => s + (r.debe || 0), 0);
    const haber = rows.reduce((s, r) => s + (r.haber || 0), 0);
    const sinCat = rows.filter(r => r.sinCatalogar).length;
    const cuadra = Math.abs(debe - haber) < 0.01;
    return { ok: cuadra && sinCat === 0, detalle: `${rows.length} cuentas · Debe ${money(debe)} = Haber ${money(haber)}${cuadra ? '' : ' — DESCUADRE'}${sinCat ? ` · ${sinCat} fuera de catálogo` : ''}` };
  },
  async sp_indicadores_perlas() {
    const d = await run('sp_indicadores_perlas');
    if (!d.ok) return { ok: false, detalle: 'respuesta sin ok' };
    const nulos = d.indicadores.filter(i => i.valor === null).map(i => i.nombre);
    const alertas = d.reconciliacion?.alertas?.length || 0;
    return { ok: d.indicadores.length > 0, detalle: `${d.indicadores.length} indicadores${nulos.length ? ` · ${nulos.length} sin dato` : ''} · ${alertas} alerta(s) de reconciliación` };
  },
  async sp_sepsb11() {
    const d = await run('sp_sepsb11');
    if (!d.ok) return { ok: false, detalle: 'respuesta sin ok' };
    const suma = d.filas.reduce((s, f) => s + f.saldo, 0);
    const cuadra = Math.abs(suma - d.totales.carteraBruta) < 0.01;
    const sinCuenta = d.filas.filter(f => !f.cuentaSeps).length;
    return { ok: cuadra && sinCuenta === 0, detalle: `${d.filas.length} filas · cartera bruta ${money(d.totales.carteraBruta)} · morosidad ${d.totales.morosidadPct}%${cuadra ? '' : ' — filas no suman el total'}` };
  },
  async sp_uaf_matriz() {
    const d = await run('sp_uaf_matriz');
    if (!d.ok) return { ok: false, detalle: 'respuesta sin ok' };
    return { ok: true, detalle: `${d.individuales.length} individuales (≥${money(d.umbrales.individual)}) · ${d.acumuladas.length} acumulados (≥${money(d.umbrales.acumuladoMensual)})` };
  },
  async sp_r_situa_gene() {
    const rows = await run('sp_r_situa_gene');
    return { ok: Array.isArray(rows) && rows.length > 0, detalle: `${Array.isArray(rows) ? rows.length : 0} indicadores generales` };
  },
};

let fallos = 0;
console.log(`Smoke test reportería SEPS — ${API_BASE}\n`);
for (const [type, fn] of Object.entries(checks)) {
  try {
    const { ok, detalle } = await fn();
    if (!ok) fallos++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${type.padEnd(22)} ${detalle}`);
  } catch (err) {
    fallos++;
    console.log(`FAIL  ${type.padEnd(22)} ${err.message}`);
  }
}
console.log(`\n${Object.keys(checks).length - fallos}/${Object.keys(checks).length} PASS`);
process.exitCode = fallos ? 1 : 0;
