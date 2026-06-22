/**
 * CAJA PATATE — Runner Maestro de Pruebas
 * Uso: node test-all.js
 * Corre todas las suites en secuencia y muestra un dashboard consolidado.
 * Sale con código 0 si todo pasa, 1 si hay fallos.
 */

import { runTests as testConectividad  } from './test-connectivity.js';
import { runTests as testIntegracion   } from './test-integration-flows.js';
import { runTests as testCreditos      } from './test-credit-workflow.js';
import { runTests as testSeguridad     } from './security_test_suite.js';
import { runTests as testDPF           } from './test-dpf-workflow.js';
import { runTests as testCaja          } from './test-caja.js';

const API_HEALTH = 'http://localhost:5005/api/health';

const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const GRAY   = '\x1b[90m';

function pad(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

async function verificarBackend() {
  try {
    const r = await fetch(API_HEALTH, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function correrSuite(nombre, fn) {
  const inicio = Date.now();
  let resultado;
  try {
    resultado = await fn();
  } catch (err) {
    resultado = { passed: 0, failed: 1, errors: [err.message] };
  }
  const ms = Date.now() - inicio;
  return { nombre, ...resultado, ms };
}

async function main() {
  console.log('\n');
  console.log(`${BOLD}${CYAN}${'═'.repeat(55)}${RESET}`);
  console.log(`${BOLD}${CYAN}  CAJA PATATE — Suite Integral de Pruebas${RESET}`);
  console.log(`${CYAN}${'═'.repeat(55)}${RESET}`);
  console.log(`${GRAY}  Verificando backend en ${API_HEALTH}...${RESET}`);

  const backendActivo = await verificarBackend();
  if (!backendActivo) {
    console.log(`\n${RED}${BOLD}  ✗ BACKEND NO DISPONIBLE${RESET}`);
    console.log(`${RED}  El servidor debe estar corriendo en http://localhost:5005${RESET}`);
    console.log(`${YELLOW}  Ejecuta primero: node server.js${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}  ✓ Backend activo${RESET}\n`);

  const suites = [
    { nombre: 'Conectividad',  fn: testConectividad },
    { nombre: 'Registro/Login', fn: testIntegracion  },
    { nombre: 'Créditos',      fn: testCreditos      },
    { nombre: 'Seguridad',     fn: testSeguridad     },
    { nombre: 'DPF',           fn: testDPF           },
    { nombre: 'Caja',          fn: testCaja          },
  ];

  const resultados = [];
  const tiempoTotal = Date.now();

  for (const suite of suites) {
    const r = await correrSuite(suite.nombre, suite.fn);
    resultados.push(r);
  }

  const elapsed = ((Date.now() - tiempoTotal) / 1000).toFixed(2);

  // ── Dashboard ─────────────────────────────────────────────────────────
  console.log(`\n${BOLD}${CYAN}${'═'.repeat(55)}${RESET}`);
  console.log(`${BOLD}${CYAN}  RESULTADO FINAL${RESET}`);
  console.log(`${CYAN}${'─'.repeat(55)}${RESET}`);

  let totalPassed = 0;
  let totalFailed = 0;

  for (const r of resultados) {
    const total  = r.passed + r.failed;
    const icon   = r.failed === 0 ? `${GREEN}✅${RESET}` : r.passed > 0 ? `${YELLOW}⚠️ ${RESET}` : `${RED}❌${RESET}`;
    const counts = r.failed === 0
      ? `${GREEN}${r.passed}/${total}${RESET}`
      : `${RED}${r.passed}/${total}${RESET}`;
    const tiempo = `${GRAY}(${r.ms}ms)${RESET}`;
    console.log(`  ${icon} ${pad(r.nombre, 16)} ${counts}  ${tiempo}`);

    if (r.errors && r.errors.length > 0) {
      for (const e of r.errors) {
        console.log(`${GRAY}     ✗ ${e.substring(0, 80)}${RESET}`);
      }
    }

    totalPassed += r.passed;
    totalFailed += r.failed;
  }

  const totalTests = totalPassed + totalFailed;
  console.log(`${CYAN}${'─'.repeat(55)}${RESET}`);

  if (totalFailed === 0) {
    console.log(`${BOLD}${GREEN}  ✅ RESULTADO: ${totalPassed}/${totalTests} pruebas pasaron${RESET}`);
  } else {
    console.log(`${BOLD}${RED}  ❌ RESULTADO: ${totalFailed} fallo(s) — ${totalPassed}/${totalTests} pasaron${RESET}`);
  }
  console.log(`${GRAY}  Tiempo total: ${elapsed}s${RESET}`);
  console.log(`${CYAN}${'═'.repeat(55)}${RESET}\n`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
