// Carga de api/.env y configuración de conexión compartida por los scripts de tools/.
// Mismo loader manual que usa server.js (el repo no tiene el paquete "dotenv" instalado).
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..');

export function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv(join(REPO_ROOT, 'api', '.env'));

// Conexión a SQLGUTPATATE (la base que sirve server.js). Nunca hardcodear credenciales:
// salen de api/.env, que no se commitea.
export function sqlConfig() {
  const cfg = {
    server: process.env.SQL_SERVER_HOST || 'localhost',
    database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
    user: process.env.SQL_SERVER_USER,
    password: process.env.SQL_SERVER_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
  };
  if (process.env.SQL_SERVER_PORT) {
    cfg.port = parseInt(process.env.SQL_SERVER_PORT, 10);
  } else if (process.env.SQL_SERVER_INSTANCE) {
    cfg.options.instanceName = process.env.SQL_SERVER_INSTANCE;
  }
  if (!cfg.user || !cfg.password) {
    throw new Error('Faltan SQL_SERVER_USER / SQL_SERVER_PASSWORD en api/.env');
  }
  return cfg;
}

export const API_BASE = `http://127.0.0.1:${process.env.API_PORT || 5005}`;
