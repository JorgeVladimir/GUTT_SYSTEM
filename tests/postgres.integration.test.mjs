// Base efimera exclusiva: aplica migraciones reales y elimina solo esa base al finalizar.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import pg from 'pg';
import '../tools/_env.mjs';
import { REPO_ROOT } from '../tools/_env.mjs';
import { connectPostgres, postgresConfig } from '../services/postgres.js';

const run = promisify(execFile);
const name = `gutt_pg_test_${randomBytes(8).toString('hex')}`;
let admin, db, created = false;
const env = { ...process.env, GUTT_PG_DATABASE: name };
const person = (id, type = 'SOCIO') => ({
  TipoPersona: type, TipoIdentificacion: 'CEDULA', Identificacion: id,
  PrimerNombre: 'PRUEBA', PrimerApellido: 'MIGRACION', PIN: '1234',
});
const register = data => db.query('SELECT * FROM dbo."usp_RegistrarSocio"(@data::jsonb)', { data: JSON.stringify(data) });

before(async () => {
  const config = postgresConfig();
  if (!['127.0.0.1', 'localhost'].includes(config.host)) throw new Error('Prueba permitida solo en PostgreSQL local');
  admin = new pg.Client({ ...config, user: 'postgres', password: process.env.GUTT_PG_ADMIN_PASSWORD, database: 'postgres' });
  await admin.connect();
  const owner = '"' + config.user.replaceAll('"', '""') + '"';
  await admin.query(`CREATE DATABASE "${name}" OWNER ${owner} TEMPLATE template0 ENCODING 'UTF8'`);
  created = true;
  // Dos runners simultaneos deben serializarse sin duplicar esquema ni catalogos.
  await Promise.all([1, 2].map(() => run(process.execPath, ['tools/migrate-postgres.mjs', '--aplicar'], {
    cwd: REPO_ROOT, env, windowsHide: true,
  })));
  db = connectPostgres(env);
});
after(async () => {
  if (db) await db.close();
  if (admin) {
    try { if (created) await admin.query(`DROP DATABASE "${name}"`); }
    finally { await admin.end(); }
  }
});

test('esquema real, vistas y catalogo DPF consistente', async () => {
  const views = await db.query("SELECT count(*)::int AS n FROM information_schema.views WHERE table_schema='dbo'");
  assert.equal(views.rows[0].n, 12);
  const log = await db.query('SELECT count(*)::int AS n FROM public.gutt_schema_migrations');
  assert.equal(log.rows[0].n, 5);
  const invalid = await db.query(`SELECT count(*)::int AS n FROM dbo."TasasPlazoFijo" t
    LEFT JOIN dbo."PlanCuentas" p ON p."Codigo"=t."CuentaContableDPF"
    WHERE t."Activo" AND p."Codigo" IS NULL`);
  assert.equal(invalid.rows[0].n, 0);
});
test('registro concurrente genera numeros de socio y cuentas unicos', async () => {
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => register(person(`PGSOCIO${i}`))));
  assert.equal(new Set(results.map(r => r.rows[0].NumeroSocio)).size, 12);
  const accounts = await db.query('SELECT count(*)::int AS n, count(DISTINCT "NumeroCuenta")::int AS unique_n FROM dbo."CuentasAhorro"');
  assert.equal(accounts.rows[0].n, 24);
  assert.equal(accounts.rows[0].unique_n, 24);
});
test('cliente recibe solo productos de ahorro', async () => {
  const result = await register(person('PGCLIENTE', 'CLIENTE'));
  const accounts = await db.query('SELECT count(*)::int AS n FROM dbo."CuentasAhorro" WHERE "SocioId"=@id', { id: result.rows[0].SOCIOID });
  assert.equal(accounts.rows[0].n, 1);
});
test('error al registrar revierte tambien contador y cuentas', async () => {
  const before = await db.query('SELECT "UltimoN" FROM dbo."SecuenciaPersona" WHERE "TipoPersona"=\'SOCIO\'');
  await assert.rejects(register(person('PGSOCIO0')), { code: '23505' });
  const after = await db.query('SELECT "UltimoN" FROM dbo."SecuenciaPersona" WHERE "TipoPersona"=\'SOCIO\'');
  assert.deepEqual(after.rows, before.rows);
});
test('guardar mapas y croquis actualiza una fila y conserva ruta omitida', async () => {
  const id = (await register(person('PGMAPA'))).rows[0].SOCIOID;
  const params = { id, image: Buffer.from('mapa') };
  await db.query(`SELECT dbo."usp_GuardarMapaUbicacion"(@id, @image, '1', '2', 'direccion', 'mapa.png')`, params);
  await db.query(`SELECT dbo."usp_GuardarMapaUbicacion"(@id, @image, '3', '4', 'otra')`, params);
  await db.query(`SELECT dbo."usp_GuardarCroquisTrabajo"(@id, @image, 'trabajo', 'croquis.png')`, params);
  await db.query(`SELECT dbo."usp_GuardarCroquisTrabajo"(@id, @image, 'otro')`, params);
  const map = await db.query('SELECT "RutaImagen", "CoordenadaLat" FROM dbo."SocioUbicacionMapa" WHERE "SOCIOID"=@id', { id });
  assert.deepEqual(map.rows, [{ RutaImagen: 'mapa.png', CoordenadaLat: '3' }]);
  const croquis = await db.query('SELECT "RutaImagen" FROM dbo."SocioCroquisTrabajo" WHERE "SOCIOID"=@id', { id });
  assert.deepEqual(croquis.rows, [{ RutaImagen: 'croquis.png' }]);
});
test('DPF concurrente y salto de 9999 mantienen IDs unicos', async () => {
  const ids = await Promise.all(Array.from({ length: 30 }, () => db.transaction(tx => tx.query('SELECT dbo."usp_GenerarIDDepositoPlazo"() AS id'))));
  assert.equal(new Set(ids.map(r => r.rows[0].id)).size, 30);
  await db.query('UPDATE dbo."SecuenciaDPF" SET "UltimoN"=9999');
  const next = await db.query('SELECT dbo."usp_GenerarIDDepositoPlazo"() AS id');
  assert.match(next.rows[0].id, /-10000$/);
  assert.equal(db.stats().total - db.stats().idle, 0);
});
test('migrador detecta hash alterado y no continua', async () => {
  await db.query("UPDATE public.gutt_schema_migrations SET content_hash='alterado' WHERE file_name='001_schema.sql'");
  await assert.rejects(run(process.execPath, ['tools/migrate-postgres.mjs', '--aplicar'], {
    cwd: REPO_ROOT, env, windowsHide: true,
  }), error => error.stderr.includes('Migracion ALTERADA: 001_schema.sql'));
});
