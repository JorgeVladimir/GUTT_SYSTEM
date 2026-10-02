// Crea (o rota la contraseña de) un usuario de DEMOSTRACIÓN COMERCIAL, rol ADMIN: acceso de
// solo-recorrido a Caja, Socios/Cuentas, Créditos, Cartera SEPS, Plazo Fijo y Reportes/Balance
// para grabar un video de la demo destinado a un contacto externo. No usar para trabajo real:
// es una cuenta de exhibición sobre datos de la base de demo (SQLGUTPATATE), no de un cliente.
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv(filePath) {
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
loadDotEnv(join(__dirname, '..', '..', 'api', '.env'));

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: true },
};
if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
} else {
  sqlConfig.port = process.env.SQL_SERVER_PORT ? parseInt(process.env.SQL_SERVER_PORT, 10) : 1433;
}

const USER_ID = 'demo_ventas';
const NOMBRE = 'Demostración Comercial';
const plainPassword = crypto.randomBytes(9).toString('base64url'); // legible, ~12 chars
const hash = bcrypt.hashSync(plainPassword, 10);

const pool = await sql.connect(sqlConfig);
const existing = await pool.request()
  .input('id', sql.NVarChar(50), USER_ID)
  .query('SELECT UsuarioId FROM dbo.Usuarios WHERE UsuarioId = @id');

if (existing.recordset.length > 0) {
  await pool.request()
    .input('id', sql.NVarChar(50), USER_ID)
    .input('hash', sql.NVarChar(100), hash)
    .query(`UPDATE dbo.Usuarios SET Rol = 'ADMIN', PasswordHash = @hash, Activo = 1, RequiereCambioPin = 0, FechaActualizacion = SYSDATETIME() WHERE UsuarioId = @id`);
  console.log('Usuario existente, actualizado a rol ADMIN y contraseña rotada.');
} else {
  await pool.request()
    .input('id', sql.NVarChar(50), USER_ID)
    .input('nombre', sql.NVarChar(100), NOMBRE)
    .input('hash', sql.NVarChar(100), hash)
    .query(`INSERT INTO dbo.Usuarios (UsuarioId, NombreCompleto, Pin, Rol, Activo, PasswordHash, RequiereCambioPin, FechaRegistro, FechaCreacion, FechaActualizacion)
            VALUES (@id, @nombre, '0000', 'ADMIN', 1, @hash, 0, CAST(GETDATE() AS DATE), SYSDATETIME(), SYSDATETIME())`);
  console.log('Usuario creado.');
}

console.log('USUARIO=' + USER_ID);
console.log('PASSWORD=' + plainPassword);
await pool.close();
