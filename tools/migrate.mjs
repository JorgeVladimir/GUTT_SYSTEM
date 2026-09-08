// Aplica los scripts de db/sqlserver/ que todavia no estan en la base, en orden.
//
//   node tools/migrate.mjs            -> muestra el estado (pendientes, aplicados, alterados)
//   node tools/migrate.mjs --aplicar  -> ejecuta los pendientes y los registra
//
// POR QUE EXISTE
// 20_ice_seps.sql estuvo commiteado semanas sin ejecutarse nunca. server.js escribia
// columnas que no existian y la aprobacion de creditos estaba caida sin que nadie lo
// supiera. No habia forma de preguntar "que scripts estan aplicados en esta base".
//
// Cada script se aplica DENTRO DE UNA TRANSACCION junto con su registro: si el script
// falla a mitad, no queda ni el cambio parcial ni la marca de aplicado. Es la unica forma
// de que el estado registrado y el estado real no se separen.
//
// Los scripts .js de db/sqlserver/ (22_, 23_crear_usuario_revisor_externo, 25_, 27_) NO
// los toca este runner: son cargadores de datos con logica propia y se corren aparte.
import sql from 'mssql';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { sqlConfig, REPO_ROOT } from './_env.mjs';

const DIR = join(REPO_ROOT, 'db', 'sqlserver');
const VERDE = '\x1b[32m', ROJO = '\x1b[31m', AMARILLO = '\x1b[33m', GRIS = '\x1b[90m', RESET = '\x1b[0m';

const aplicar = process.argv.includes('--aplicar');

const archivos = readdirSync(DIR)
  .filter(f => f.toLowerCase().endsWith('.sql'))
  .sort((a, b) => {
    // Orden numerico por prefijo: '9_x.sql' debe ir antes que '10_x.sql'.
    const na = parseInt(a, 10), nb = parseInt(b, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });

const hashDe = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

let pool;
try {
  pool = await sql.connect(sqlConfig());

  const existeRegistro = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('dbo.MigracionesAplicadas', 'U') IS NULL THEN 0 ELSE 1 END AS existe
  `);
  if (!existeRegistro.recordset[0].existe) {
    console.error(`${ROJO}No existe dbo.MigracionesAplicadas.${RESET}`);
    console.error('Cree el registro primero:  node tools/run-sql.mjs db/sqlserver/33_registro_migraciones.sql');
    process.exit(2);
  }

  const registro = await pool.request().query(`
    SELECT Archivo, HashContenido, CONVERT(NVARCHAR(19), FechaAplicada, 120) AS FechaAplicada
    FROM dbo.MigracionesAplicadas
  `);
  const aplicadas = new Map(registro.recordset.map(r => [r.Archivo, r]));

  const pendientes = [];
  const alteradas = [];
  for (const archivo of archivos) {
    const contenido = readFileSync(join(DIR, archivo), 'utf8');
    const hash = hashDe(contenido);
    const previa = aplicadas.get(archivo);
    if (!previa) { pendientes.push({ archivo, contenido, hash }); continue; }
    // 'PREEXISTENTE' = se marco aplicada al crear el registro, sin sellar hash.
    if (previa.HashContenido !== 'PREEXISTENTE' && previa.HashContenido !== hash) {
      alteradas.push({ archivo, fecha: previa.FechaAplicada });
    }
  }

  console.log('');
  console.log(`  Migraciones de db/sqlserver — ${archivos.length} script(s) .sql`);
  console.log(`  ${'-'.repeat(64)}`);
  console.log(`  ${VERDE}Aplicadas:${RESET}  ${archivos.length - pendientes.length}`);
  console.log(`  ${pendientes.length ? AMARILLO : GRIS}Pendientes:${RESET} ${pendientes.length}`);
  for (const p of pendientes) console.log(`    ${AMARILLO}·${RESET} ${p.archivo}`);

  if (alteradas.length) {
    console.log('');
    console.log(`  ${ROJO}ALTERADAS DESPUES DE APLICARSE:${RESET} ${alteradas.length}`);
    console.log(`  ${GRIS}El archivo del repo ya no coincide con lo que se ejecuto en esta base.${RESET}`);
    for (const a of alteradas) console.log(`    ${ROJO}!${RESET} ${a.archivo} ${GRIS}(aplicada ${a.fecha})${RESET}`);
  }

  if (!pendientes.length) {
    console.log('');
    console.log(`  ${VERDE}El esquema esta al dia.${RESET}`);
    console.log('');
    process.exit(alteradas.length ? 1 : 0);
  }

  if (!aplicar) {
    console.log('');
    console.log(`  Para aplicarlas:  node tools/migrate.mjs --aplicar`);
    console.log('');
    process.exit(1);
  }

  console.log('');
  for (const { archivo, contenido, hash } of pendientes) {
    const lotes = contenido.split(/^\s*GO\s*$/gim).map(b => b.trim()).filter(Boolean);
    const inicio = Date.now();
    // Una transaccion por script: el cambio y su registro entran o no entran juntos.
    const transaccion = new sql.Transaction(pool);
    await transaccion.begin();
    try {
      for (const lote of lotes) await new sql.Request(transaccion).batch(lote);
      const ms = Date.now() - inicio;
      await new sql.Request(transaccion)
        .input('Archivo', sql.NVarChar(200), archivo)
        .input('Hash', sql.NVarChar(64), hash)
        .input('Por', sql.NVarChar(100), 'tools/migrate.mjs')
        .input('Ms', sql.Int, ms)
        .query(`
          MERGE dbo.MigracionesAplicadas AS d
          USING (SELECT @Archivo AS Archivo) AS o ON d.Archivo = o.Archivo
          WHEN MATCHED THEN UPDATE SET HashContenido = @Hash, FechaAplicada = SYSDATETIME(), AplicadaPor = @Por, DuracionMs = @Ms
          WHEN NOT MATCHED THEN INSERT (Archivo, HashContenido, AplicadaPor, DuracionMs)
                                VALUES (@Archivo, @Hash, @Por, @Ms);
        `);
      await transaccion.commit();
      console.log(`  ${VERDE}OK${RESET}    ${archivo} ${GRIS}(${lotes.length} lote(s), ${ms} ms)${RESET}`);
    } catch (err) {
      await transaccion.rollback();
      console.log(`  ${ROJO}FALLA${RESET} ${archivo}`);
      console.log(`        ${err.message}`);
      console.log('');
      console.log(`  ${ROJO}Se detiene aqui: las migraciones siguientes pueden depender de esta.${RESET}`);
      console.log('');
      process.exit(1);
    }
  }

  console.log('');
  console.log(`  ${VERDE}${pendientes.length} migracion(es) aplicada(s).${RESET}`);
  console.log('');
} catch (err) {
  console.error(`${ROJO}ERROR:${RESET}`, err.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool.close();
}
