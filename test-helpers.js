// Utilidades compartidas por las suites de prueba.
//
// Existe porque el sistema ganó autenticación por JWT (requireAuth/requireSelf/requireAdmin)
// después de que se escribieran las suites, y estas seguían llamando a los endpoints sin
// cabecera Authorization. El resultado era engañoso: fallaban con 401 y parecían un bug del
// producto, cuando en realidad el producto había mejorado y la prueba se quedó atrás.
//
// Las pruebas deben ejercitar las DOS capas por separado:
//   401 = no autenticado  (no hay token, o el token no valida)
//   403 = autenticado pero sin autorización para esa acción
// Confundirlas hace que una regresión de permisos pase inadvertida detrás de un 401.
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function cargarEnv() {
  const ruta = join(__dirname, 'api', '.env');
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf-8').split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const clave = t.slice(0, i).trim();
    const valor = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (clave && !(clave in process.env)) process.env[clave] = valor;
  }
}
cargarEnv();

/** JWT válido, firmado con el mismo secreto que usa server.js. */
export function token(usuarioId, rol) {
  if (!process.env.JWT_SECRET) throw new Error('Falta JWT_SECRET en api/.env');
  return jwt.sign({ usuarioId, rol }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

/** Cabeceras con sesión válida. */
export function conSesion(usuarioId, rol) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token(usuarioId, rol)}` };
}

/** Cabeceras sin sesión: el servidor debe responder 401. */
export const sinSesion = { 'Content-Type': 'application/json' };

/** Token firmado con un secreto equivocado: el servidor debe responder 401, no 403. */
export function tokenFalsificado(usuarioId, rol) {
  return jwt.sign({ usuarioId, rol }, 'secreto-que-el-servidor-no-conoce', { expiresIn: '15m' });
}
