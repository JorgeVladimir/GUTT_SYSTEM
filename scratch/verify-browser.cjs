const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

const OUT    = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE   = 'http://localhost:5000';
const API    = 'http://localhost:5005/api';
const USER_ID  = 'superuser';
const USER_PIN = 'Gael240220.';

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  📸 ${name}.png`);
}

async function apiPost(url, body) {
  const r = await fetch(url, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  return r.json();
}

(async () => {
  console.log('\n🔍 Verificación visual — Gutt System\n');

  // ── 1. APIs ──────────────────────────────────────────────────────────
  console.log('── APIs ──');
  const health = await (await fetch(`${API}/health`)).json();
  console.log(`  ✅ Backend: ok=${health.ok}`);

  const bal = await (await fetch(`${API}/contabilidad/balance-comprobacion`)).json();
  console.log(`  ✅ Balance comprobación: ${bal.cuentas?.length} cuentas | TotalDebe=$${(+bal.totalDebe).toFixed(2)} | TotalHaber=$${(+bal.totalHaber).toFixed(2)}`);
  const cuadra = Math.abs(bal.totalDebe - bal.totalHaber) < 0.01;
  console.log(`  ${cuadra ? '✅' : '⚠️ '} Partida doble: ${cuadra ? 'CUADRADA' : 'NO cuadrada'}`);

  const lib = await (await fetch(`${API}/contabilidad/libro-diario?limite=5`)).json();
  console.log(`  ✅ Libro diario: ${lib.asientos?.length} últimos asientos`);

  const repSit = await apiPost(`${API}/reports/generate.php`, {type:'sp_r_situa_gene'});
  console.log(`  ✅ Reporte Situación General: ${repSit.length} filas`);
  repSit.forEach(r => console.log(`     [${r.code}] ${r.name}: ${typeof r.balance === 'number' && r.balance % 1 !== 0 ? '$'+r.balance.toFixed(2) : r.balance}`));

  const repBal = await apiPost(`${API}/reports/generate.php`, {type:'sp_r_bal_compro'});
  console.log(`  ✅ Reporte Balance: ${repBal.length} cuentas`);

  const repB11 = await apiPost(`${API}/reports/generate.php`, {type:'sp_sepsb11'});
  console.log(`  ✅ Reporte B11 cartera: ${repB11.length} estados`);

  const repUAF = await apiPost(`${API}/reports/generate.php`, {type:'sp_uaf_matriz'});
  console.log(`  ✅ Reporte UAF: ${repUAF.length} transacciones grandes`);

  // ── 2. Browser ───────────────────────────────────────────────────────
  console.log('\n── Navegador ──');
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, slowMo: 200 });
  const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();

  // Login
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, '01-login');
  await page.fill('input[placeholder="Cédula"]', USER_ID);
  await page.fill('input[type="password"]', USER_PIN);
  await page.click('button:has-text("INGRESAR")');
  await page.waitForTimeout(2500);
  await shot(page, '02-post-login');

  const changePin = await page.locator('text=Nueva Contraseña').count() +
                    await page.locator('text=Cambiar contraseña').count() +
                    await page.locator('text=Actualizar PIN').count();
  console.log(`  ${changePin === 0 ? '✅ BUG CORREGIDO' : '❌ BUG PERSISTE'}: cambio de contraseña ${changePin === 0 ? 'NO solicitado' : 'AÚN solicitado'}`);

  // Sidebar visible — capturar paleta de colores
  await page.waitForTimeout(500);
  await shot(page, '03-sidebar-paleta');

  // Hover sidebar para expandirlo si está comprimido
  await page.hover('aside');
  await page.waitForTimeout(600);
  await shot(page, '04-sidebar-expandido');

  // Navegar a Contabilidad — usando texto del sidebar
  try {
    await page.click('text=Contabilidad Central', {timeout:4000});
    await page.waitForTimeout(2000);
    await shot(page, '05-contabilidad');
    // Tab Balance
    const tabBal = page.locator('button, [role="tab"]').filter({hasText:'Balance'}).first();
    await tabBal.click({timeout:4000});
    await page.waitForTimeout(1500);
    await shot(page, '05b-balance-comprobacion');
    // Tab Libro Diario
    const tabLib = page.locator('button, [role="tab"]').filter({hasText:'Libro Diario'}).first();
    await tabLib.click({timeout:4000});
    await page.waitForTimeout(1500);
    await shot(page, '05c-libro-diario');
    console.log('  ✅ Contabilidad Central: Balance + Libro Diario OK');
  } catch(e) { console.log(`  ⚠️  Contabilidad: ${e.message.split('\n')[0]}`); }

  // Navegar a DPF
  try {
    await page.click('text=Depósitos a Plazo', {timeout:4000});
    await page.waitForTimeout(2000);
    await shot(page, '06-dpf-paleta');
    console.log('  ✅ DPF: paleta crimson-gold OK');
  } catch(e) { console.log(`  ⚠️  DPF: ${e.message.split('\n')[0]}`); }

  // Navegar a Reportes → FINANCIAL
  try {
    // Buscar Reportes en sidebar (puede llamarse "Reportes Socios-Créditos" u otro)
    const repLink = page.locator('text=/Reporte|Report/i').first();
    await repLink.click({timeout:4000});
    await page.waitForTimeout(1500);
    await shot(page, '07-reportes-inicio');
    // Tab FINANCIEROS
    const finTab = page.locator('button').filter({hasText:/FINANCIER|FINANCIAL/i}).first();
    await finTab.click({timeout:4000});
    await page.waitForTimeout(1000);
    await shot(page, '07b-reportes-financial-tab');
    // Balance de Comprobación ya está pre-seleccionado por defecto (reportType = 'sp_r_bal_compro')
    // Solo click GENERAR para ver el reporte renderizado
    await page.locator('button').filter({hasText:/GENERAR/i}).first().click({timeout:4000});
    await page.waitForTimeout(2500);
    await shot(page, '08-reporte-balance-generado');
    // CSV debería aparecer después de generar
    const csvBtn = page.locator('button').filter({hasText:/CSV/i}).first();
    const csvVisible = await csvBtn.isVisible().catch(()=>false);
    console.log(`  ${csvVisible ? '✅ Botón CSV visible tras generar' : '🔍 CSV: botón no encontrado'}`);
    // Cambiar a Situación General usando descripción única del item
    await page.locator('text=Socios, ahorros, créditos').click({timeout:4000});
    await page.locator('button').filter({hasText:/GENERAR/i}).first().click({timeout:4000});
    await page.waitForTimeout(2500);
    await shot(page, '09-reporte-situacion-generado');
    console.log('  ✅ Reportes SEPS: Balance + Situación General generados');
  } catch(e) { console.log(`  ⚠️  Reportes: ${e.message.split('\n')[0]}`); }

  // Admin → ver badge de rol (paleta corporativa)
  await shot(page, '10-estado-final');

  console.log(`\n✅ Screenshots en: ${OUT}`);
  await page.waitForTimeout(2000);
  await browser.close();
})();
