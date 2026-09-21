// Delegar un encargo a Codex desde el orquestador y devolver SOLO el resumen (ahorra tokens de Claude).
//
//   node tools/codex-delegar.mjs --perfil revision --encargo revision-cruzada-dat01-02 [--repo C:\TECNIFIN] [--sandbox workspace-write]
//   node tools/codex-delegar.mjs --smoke                # prueba minima de conexion, sin tocar nada
//
// El encargo vive en <repo>/docs/handoff/encargos/<nombre>.md. Perfiles: ~/.codex/<perfil>.config.toml (arquitecto, ejecutor,
// ejecutor-dinero, mecanico, revision). Se guarda el ultimo mensaje de Codex en <repo>/var/codex/<nombre>.md y el registro completo
// en <repo>/var/codex/<nombre>.log; por pantalla salen solo las primeras 40 lineas del ultimo mensaje.
// No hace push, no pasa secretos por el prompt y limita la escritura a la carpeta del repo (sandbox workspace-write).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, def) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : def; };
const smoke = process.argv.includes('--smoke');
const repo = arg('repo', 'C:\\TECNIFIN');
const perfil = arg('perfil', smoke ? 'mecanico' : 'ejecutor');
const encargo = arg('encargo', smoke ? 'smoke' : null);
const sandbox = arg('sandbox', 'workspace-write');
if (!encargo) { console.error('Falta --encargo <nombre> (o --smoke)'); process.exit(2); }

const codexJs = join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
if (!existsSync(codexJs)) { console.error(`No encuentro Codex en ${codexJs}`); process.exit(3); }
if (!existsSync(join(process.env.USERPROFILE || process.env.HOME || '', '.codex', `${perfil}.config.toml`))) {
  console.error(`No existe el perfil de Codex "${perfil}" (~/.codex/${perfil}.config.toml)`); process.exit(4);
}

const salida = join(repo, 'var', 'codex');
mkdirSync(salida, { recursive: true });
const ultimo = join(salida, `${encargo}.md`);
const registro = join(salida, `${encargo}.log`);

const prompt = smoke
  ? 'Prueba de conexion. Lee AGENTS.md del repo y responde EXACTAMENTE con dos lineas: (1) "smoke ok" y (2) el nombre del modelo con el que estas corriendo. No modifiques ningun archivo.'
  : `Lee AGENTS.md y docs/handoff/ESTADO.md. Ejecuta el encargo docs/handoff/encargos/${encargo}.md siguiendo tu rol en docs/roles/. ` +
    'Cierra con npm run verificar. Tu ultimo mensaje es el informe: maximo 25 lineas, sin volcar codigo ni logs.';

const t0 = Date.now();
const r = spawnSync(process.execPath, [codexJs, 'exec', '-p', perfil, '-C', repo, '-s', sandbox, '-o', ultimo, '-'],
  { input: prompt, encoding: 'utf8', maxBuffer: 1 << 28 });
writeFileSync(registro, `${r.stdout || ''}\n--- stderr ---\n${r.stderr || ''}`);

const seg = Math.round((Date.now() - t0) / 1000);
console.log(`codex exec -p ${perfil} | encargo ${encargo} | codigo ${r.status} | ${seg} s | registro: ${registro}`);
if (existsSync(ultimo)) console.log(readFileSync(ultimo, 'utf8').split('\n').slice(0, 40).join('\n'));
else console.log((r.stderr || r.stdout || '(sin salida)').split('\n').slice(-12).join('\n'));
process.exit(r.status ?? 1);
