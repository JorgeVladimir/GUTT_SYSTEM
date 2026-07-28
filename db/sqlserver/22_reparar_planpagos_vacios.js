/**
 * 22_reparar_planpagos_vacios.js
 *
 * Repara créditos VIGENTE cuyo PlanPagos quedó NULL o "[]" por el bug descrito en
 * server.js (POST /api/socios/loans no exigía `installments`, y POST
 * /api/socios/loans/disburse no regeneraba el plan si venía vacío, dejando el
 * crédito en VIGENTE sin tabla de amortización ni PlanPagos).
 *
 * Este script:
 *   1. Lista los créditos afectados en dbo.SolicitudesCredito
 *      (Estado = 'VIGENTE' AND PlanPagos IS NULL/''/'[]').
 *   2. Recalcula el plan de pagos con la MISMA fórmula server-side que ya usa
 *      server.js (función `generarPlanAmortizacion`, sistema francés / cuota fija),
 *      duplicada aquí a propósito porque importar server.js arrancaría el servidor
 *      Express completo (efecto secundario de `app.listen` al final del archivo).
 *      Si cambias la fórmula en server.js, replica el cambio aquí.
 *   3. Por defecto corre en modo DRY-RUN (solo imprime lo que haría). Para escribir
 *      en la base de datos hay que pasar explícitamente --apply.
 *   4. Con --apply, actualiza SolicitudesCredito.PlanPagos únicamente. NO toca
 *      dbo.TablaDeAmortizacion ni dbo.RubrosCreditos por defecto (para minimizar
 *      riesgo); si se quiere también regenerar esas tablas (necesarias para que
 *      /api/socios/loans/pay-dividend funcione correctamente sobre estos créditos
 *      históricos), pasar además --include-amortizacion-table. Esa parte solo
 *      inserta si el crédito no tiene YA filas en TablaDeAmortizacion (idempotente,
 *      seguro de re-ejecutar).
 *
 * NO SE HA EJECUTADO CONTRA LA BASE DE DATOS REAL. Revisar la salida en modo
 * dry-run antes de decidir aplicar cambios.
 *
 * Uso:
 *   node db/sqlserver/22_reparar_planpagos_vacios.js                 (dry-run, solo lista)
 *   node db/sqlserver/22_reparar_planpagos_vacios.js --apply         (corrige PlanPagos)
 *   node db/sqlserver/22_reparar_planpagos_vacios.js --apply --include-amortizacion-table
 *                                                                     (corrige PlanPagos +
 *                                                                      backfill de TablaDeAmortizacion/RubrosCreditos
 *                                                                      solo si no existen filas previas)
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import sql from 'mssql';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// ─── Cargar api/.env (misma lógica que server.js) ───────────────────────────
function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIdx = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv(join(REPO_ROOT, 'api', '.env'));

const sqlConfig = {
  server: process.env.SQL_SERVER_HOST || 'localhost',
  database: process.env.SQL_SERVER_DATABASE || 'SQLGUTPATATE',
  user: process.env.SQL_SERVER_USER || 'sa',
  password: process.env.SQL_SERVER_PASSWORD || '',
  options: {
    encrypt: true,
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

if (process.env.SQL_SERVER_PORT) {
  sqlConfig.port = parseInt(process.env.SQL_SERVER_PORT, 10);
} else if (process.env.SQL_SERVER_INSTANCE) {
  sqlConfig.options.instanceName = process.env.SQL_SERVER_INSTANCE;
} else {
  sqlConfig.port = 1433;
}

// ─── Misma fórmula que server.js: generarPlanAmortizacion() ────────────────
// (Sistema francés / cuota fija — ver components/CreditsView.tsx líneas ~62-87
// y server.js función `generarPlanAmortizacion` justo antes de POST /api/socios/loans)
function generarPlanAmortizacion(monto, tasaAnual, plazoMeses) {
  const p = parseFloat(monto);
  const tasaVal = parseFloat(tasaAnual);
  const n = parseInt(plazoMeses, 10);

  if (!p || !n || n <= 0) return [];

  const r = (tasaVal / 100) / 12;
  const monthlyPayment = r === 0
    ? p / n
    : p * (r / (1 - Math.pow(1 + r, -n)));

  let balance = p;
  const installments = [];

  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const capital = monthlyPayment - interest;
    balance -= capital;
    installments.push({
      number: i,
      date: `Mes ${i}`,
      capital: Math.max(0, parseFloat(capital.toFixed(2))),
      interest: Math.max(0, parseFloat(interest.toFixed(2))),
      total: parseFloat(monthlyPayment.toFixed(2)),
      status: 'PENDIENTE'
    });
  }

  return installments;
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const INCLUDE_AMORT_TABLE = args.includes('--include-amortizacion-table');

async function main() {
  console.log(`Modo: ${APPLY ? 'APLICAR CAMBIOS' : 'DRY-RUN (solo lectura, no se escribe nada)'}`);
  if (APPLY) {
    console.log(`Backfill de TablaDeAmortizacion/RubrosCreditos: ${INCLUDE_AMORT_TABLE ? 'SI' : 'NO'}`);
  }
  console.log(`Conectando a ${sqlConfig.server}/${sqlConfig.database}...`);

  const pool = await sql.connect(sqlConfig);

  // 1. Listar créditos afectados
  const affectedRes = await pool.request().query(`
    SELECT SolicitudID, SocioID, Identificacion, Monto, Tasa, Plazo, Estado, PlanPagos, FechaVencimiento
    FROM dbo.SolicitudesCredito
    WHERE Estado = 'VIGENTE'
      AND (
        PlanPagos IS NULL
        OR LTRIM(RTRIM(PlanPagos)) = ''
        OR LTRIM(RTRIM(PlanPagos)) = '[]'
      )
    ORDER BY SolicitudID
  `);

  const affected = affectedRes.recordset;
  console.log(`\nCréditos VIGENTE con PlanPagos vacío/NULL encontrados: ${affected.length}`);

  if (affected.length === 0) {
    console.log('No hay nada que reparar.');
    await pool.close();
    return;
  }

  let repaired = 0;
  let skipped = 0;
  let amortBackfilled = 0;

  for (const loan of affected) {
    const id = loan.SolicitudID;
    const monto = parseFloat(loan.Monto);
    const tasa = parseFloat(loan.Tasa);
    const plazo = parseInt(loan.Plazo, 10);

    console.log(`\n--- ${id} (Socio ${loan.Identificacion}) ---`);
    console.log(`  Monto=${monto} Tasa=${tasa}% Plazo=${plazo} meses  PlanPagos actual=${JSON.stringify(loan.PlanPagos)}`);

    if (!monto || !tasa || !plazo) {
      console.warn(`  OMITIDO: datos insuficientes para recalcular (Monto/Tasa/Plazo inválidos).`);
      skipped++;
      continue;
    }

    const nuevoPlan = generarPlanAmortizacion(monto, tasa, plazo);
    if (nuevoPlan.length === 0) {
      console.warn(`  OMITIDO: generarPlanAmortizacion devolvió un plan vacío.`);
      skipped++;
      continue;
    }

    const cuotaMensual = nuevoPlan[0].total;
    const totalPagar = parseFloat((cuotaMensual * plazo).toFixed(2));
    console.log(`  Plan recalculado: ${nuevoPlan.length} cuotas, cuota mensual=${cuotaMensual}, total a pagar=${totalPagar}`);

    if (!APPLY) {
      console.log('  (dry-run) No se escribió nada.');
      continue;
    }

    const transaction = pool.transaction();
    try {
      await transaction.begin();

      await transaction.request()
        .input('id', sql.NVarChar(50), id)
        .input('planPagos', sql.NVarChar(sql.MAX), JSON.stringify(nuevoPlan))
        .query('UPDATE dbo.SolicitudesCredito SET PlanPagos = @planPagos WHERE SolicitudID = @id');

      console.log('  PlanPagos actualizado en SolicitudesCredito.');
      repaired++;

      if (INCLUDE_AMORT_TABLE) {
        // Solo genera filas si el crédito (dbo.Creditos, mismo ID que SolicitudID)
        // todavía no tiene NINGUNA fila en TablaDeAmortizacion (idempotente).
        const creditoRes = await transaction.request()
          .input('id', sql.NVarChar(50), id)
          .query('SELECT CreditoID, FechaDesembolso FROM dbo.Creditos WHERE CreditoID = @id');

        if (creditoRes.recordset.length === 0) {
          console.warn(`  AVISO: no existe dbo.Creditos para ${id}; no se puede hacer backfill de TablaDeAmortizacion.`);
        } else {
          const credito = creditoRes.recordset[0];
          const existingAmortRes = await transaction.request()
            .input('id', sql.NVarChar(50), id)
            .query('SELECT COUNT(*) AS cnt FROM dbo.TablaDeAmortizacion WHERE CreditoID = @id');

          if (existingAmortRes.recordset[0].cnt > 0) {
            console.log('  TablaDeAmortizacion ya tiene filas para este crédito; no se duplica.');
          } else {
            const disburseDate = credito.FechaDesembolso ? new Date(credito.FechaDesembolso) : new Date();
            let runningBalance = monto;

            for (const inst of nuevoPlan) {
              const cuotaDate = new Date(disburseDate);
              cuotaDate.setMonth(cuotaDate.getMonth() + inst.number);
              const cuotaDateStr = cuotaDate.toISOString().split('T')[0];

              const capital = inst.capital;
              const interest = inst.interest;
              const seguroDesgravamen = parseFloat((runningBalance * 0.0008).toFixed(2));
              const solcaRubro = parseFloat(((monto * 0.005) / plazo).toFixed(2));
              const gastosAdmin = 1.50;
              const installmentTotal = parseFloat((capital + interest + seguroDesgravamen + solcaRubro + gastosAdmin).toFixed(2));
              runningBalance = Math.max(0, runningBalance - capital);

              const amortRes = await transaction.request()
                .input('creditoId', sql.NVarChar(50), id)
                .input('numeroCuota', sql.Int, inst.number)
                .input('fechaPago', sql.NVarChar(50), cuotaDateStr)
                .input('capital', sql.Decimal(15, 2), capital)
                .input('interes', sql.Decimal(15, 2), interest)
                .input('seguroDesgravamen', sql.Decimal(15, 2), seguroDesgravamen)
                .input('contribucionSOLCA', sql.Decimal(15, 2), solcaRubro)
                .input('gastosAdministrativos', sql.Decimal(15, 2), gastosAdmin)
                .input('total', sql.Decimal(15, 2), installmentTotal)
                .query(`
                  INSERT INTO dbo.TablaDeAmortizacion (CreditoID, NumeroCuota, FechaPago, Capital, Interes, SeguroDesgravamen, ContribucionSOLCA, GastosAdministrativos, Total, Estado)
                  VALUES (@creditoId, @numeroCuota, @fechaPago, @capital, @interes, @seguroDesgravamen, @contribucionSOLCA, @gastosAdministrativos, @total, 'PENDIENTE');
                  SELECT SCOPE_IDENTITY() AS id;
                `);

              const amortId = amortRes.recordset[0].id;
              const rubros = [
                { nombre: 'Capital', monto: capital },
                { nombre: 'Interes', monto: interest },
                { nombre: 'Seguro de Desgravamen', monto: seguroDesgravamen },
                { nombre: 'SOLCA', monto: solcaRubro },
                { nombre: 'Gastos Administrativos', monto: gastosAdmin }
              ];

              for (const r of rubros) {
                await transaction.request()
                  .input('amortizacionId', sql.Int, amortId)
                  .input('nombreRubro', sql.NVarChar(50), r.nombre)
                  .input('monto', sql.Decimal(15, 2), r.monto)
                  .query("INSERT INTO dbo.RubrosCreditos (AmortizacionID, NombreRubro, Monto, Estado) VALUES (@amortizacionId, @nombreRubro, @monto, 'PENDIENTE')");
              }
            }

            console.log(`  Backfill de TablaDeAmortizacion/RubrosCreditos completado (${nuevoPlan.length} cuotas).`);
            amortBackfilled++;
          }
        }
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      console.error(`  ERROR reparando ${id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\n=== Resumen ===`);
  console.log(`Afectados encontrados: ${affected.length}`);
  console.log(`Reparados: ${repaired}`);
  console.log(`Omitidos/errores: ${skipped}`);
  if (APPLY && INCLUDE_AMORT_TABLE) {
    console.log(`Con backfill de TablaDeAmortizacion: ${amortBackfilled}`);
  }
  if (!APPLY) {
    console.log('\nEsto fue un DRY-RUN. Para aplicar los cambios, vuelve a correr con --apply.');
  }

  await pool.close();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
