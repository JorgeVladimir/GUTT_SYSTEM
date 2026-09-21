// Corre la cola inicial de Codex a una hora fija SIN depender de la sesion de Claude (que puede estar en su limite).
//
//   node tools/codex-cola-nocturna.mjs 22:12        # espera hasta esa hora local y ejecuta: smoke -> revision cruzada de DAT-01/02
//
// Si el smoke falla (por ejemplo por limite de uso), NO reintenta y NO lanza el trabajo pesado: deja el motivo en
// C:\TECNIFIN\var\codex\RESUMEN.md. Cada paso guarda su informe en C:\TECNIFIN\var\codex\ (lo unico que Claude necesita leer).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [hh, mm] = (process.argv[2] || '22:12').split(':').map(Number);
const salida = 'C:\\TECNIFIN\\var\\codex';
mkdirSync(salida, { recursive: true });
const resumen = join(salida, 'RESUMEN.md');
const log = (t) => writeFileSync(resumen, t + '\n', { flag: 'a' });
const delegar = (args) => spawnSync(process.execPath, ['tools/codex-delegar.mjs', ...args],
  { cwd: 'C:\\GUTT_SYSTEM', encoding: 'utf8', maxBuffer: 1 << 28 });

const objetivo = new Date(); objetivo.setHours(hh, mm, 0, 0);
if (objetivo < new Date()) objetivo.setDate(objetivo.getDate() + 1);
writeFileSync(resumen, `# Cola nocturna de Codex\nProgramada para ${objetivo.toLocaleString('es-EC')}\n`);
while (Date.now() < objetivo.getTime()) await new Promise((r) => setTimeout(r, 20000));

const smoke = delegar(['--smoke']);
log(`\n## Smoke (${new Date().toLocaleTimeString('es-EC')}) codigo ${smoke.status}\n${(smoke.stdout || '').split('\n').slice(0, 14).join('\n')}`);
if (smoke.status !== 0 || !/smoke ok/i.test(smoke.stdout || '')) {
  log('\n**Detenido:** el smoke no salio bien; no se lanzo la revision. Ver el motivo arriba.');
  process.exit(1);
}
const rev = delegar(['--perfil', 'revision', '--encargo', 'revision-cruzada-dat01-02']);
log(`\n## Revision cruzada de DAT-01/02 (${new Date().toLocaleTimeString('es-EC')}) codigo ${rev.status}\n${(rev.stdout || '').split('\n').slice(0, 45).join('\n')}`);
process.exit(rev.status ?? 1);
