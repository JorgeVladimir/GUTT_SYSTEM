// Programa un encargo de Codex a una hora fija, sin depender de la sesion de Claude.
//   node tools/codex-programar.mjs 10:55 --perfil ejecutor-dinero --encargo <nombre> --rama wip/<tarea>
// Espera hasta la hora, lanza tools/codex-delegar.mjs y deja el resumen en C:\TECNIFIN\var\codex\PROGRAMADO.md.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [hh, mm] = process.argv[2].split(':').map(Number);
const resto = process.argv.slice(3);
const objetivo = new Date(); objetivo.setHours(hh, mm, 0, 0);
if (objetivo < new Date()) objetivo.setDate(objetivo.getDate() + 1);
mkdirSync('C:\\TECNIFIN\\var\\codex', { recursive: true });
const salida = 'C:\\TECNIFIN\\var\\codex\\PROGRAMADO.md';
writeFileSync(salida, `Programado para ${objetivo.toLocaleString('es-EC')}: ${resto.join(' ')}\n`);
while (Date.now() < objetivo.getTime()) await new Promise((r) => setTimeout(r, 20000));
const r = spawnSync(process.execPath, ['tools/codex-delegar.mjs', ...resto], { cwd: 'C:\\GUTT_SYSTEM', encoding: 'utf8', maxBuffer: 1 << 28 });
writeFileSync(salida, `\n## Ejecutado ${new Date().toLocaleString('es-EC')} (codigo ${r.status})\n${(r.stdout || r.stderr || '').split('\n').slice(0, 45).join('\n')}\n`, { flag: 'a' });
