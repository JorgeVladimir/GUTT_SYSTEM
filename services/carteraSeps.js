// ─────────────────────────────────────────────────────────────────────────────
// services/carteraSeps.js
//
// Motor de clasificacion de cartera y de solvencia regulatoria. Lo usan tanto el
// proceso mensual de reclasificacion (POST /api/cartera/reclasificar) como los
// reportes SEPS (sp_sepsb11, sp_indicadores_perlas), para que no puedan
// desincronizarse: una sola definicion de "que es cartera vencida" en todo el
// sistema.
//
// Dos decisiones que NO son obvias y ya costaron un bug real:
//
// 1. LAS BANDAS DE ANTIGUEDAD SE LEEN DE dbo.PlanCuentas, NO SE ASUMEN.
//    No son simetricas entre familias. Ejemplos reales del Catalogo Unico:
//      1402 (consumo por vencer)   -> 1-30 | 31-90 | 91-180 | 181-360 | >360
//      1422 (consumo vencida)      -> 1-30 | 31-90 | 91-180 | 181-270 | >270
//      1423 (vivienda vencida)     -> 1-30 | 31-90 | 91-270 | 271-360 | 361-720 | >720  (SEIS bandas)
//    Hardcodear una sola tabla de bandas manda saldo a cuentas que no existen.
//
// 2. LA CARTERA SE MAPEA POR PREFIJO NUMERICO, NUNCA POR NOMBRE DE CUENTA.
//    Emparejar por similitud de nombre ya produjo una morosidad del 0% con la
//    cartera 100% en mora.
//
// Codigos contables siempre concatenados SIN PUNTOS: '140205', no '1.4.02.05'.
// ─────────────────────────────────────────────────────────────────────────────
import sql from 'mssql';

// Estado de cartera -> familia de 4 digitos, por segmento de credito.
// Fuente: Catalogo Unico de Cuentas SEPS cargado en dbo.PlanCuentas.
export const FAMILIA_CARTERA = {
  COMERCIAL:    { 'POR VENCER': '1401', 'NO DEVENGA INTERESES': '1411', 'VENCIDA': '1421' },
  CONSUMO:      { 'POR VENCER': '1402', 'NO DEVENGA INTERESES': '1412', 'VENCIDA': '1422' },
  VIVIENDA:     { 'POR VENCER': '1403', 'NO DEVENGA INTERESES': '1413', 'VENCIDA': '1423' },
  MICROEMPRESA: { 'POR VENCER': '1404', 'NO DEVENGA INTERESES': '1414', 'VENCIDA': '1424' },
};

// Cuenta de GASTO por provision, por segmento (Catalogo Unico, familia 4402).
export const GASTO_PROVISION = {
  COMERCIAL: '440205', CONSUMO: '440210', VIVIENDA: '440215', MICROEMPRESA: '440220',
};

// Reversion de provision constituida en exceso (ingreso).
export const CUENTA_REVERSION_PROVISION = '560410';

// Todas las familias de cartera del Catalogo Unico (incluye reestructurada y
// refinanciada, 1405-1408 / 1415-1418 / 1425-1428). El proceso las lee para
// saber que saldo contable hay hoy, aunque este sistema solo origine 140x-142x.
export const PREFIJOS_CARTERA = [
  '1401','1402','1403','1404','1405','1406','1407','1408',
  '1411','1412','1413','1414','1415','1416','1417','1418',
  '1421','1422','1423','1424','1425','1426','1427','1428',
];

/** Segmento SEPS a partir del texto libre de SolicitudesCredito.Tipo. */
export function segmentoDeTipo(tipo) {
  const t = String(tipo || '').toUpperCase();
  if (t.includes('MICRO')) return 'MICROEMPRESA';
  if (t.includes('VIVIENDA') || t.includes('INMOBIL')) return 'VIVIENDA';
  if (t.includes('COMERCIAL') || t.includes('PRODUCTIVO')) return 'COMERCIAL';
  return 'CONSUMO';
}

/**
 * Lee del Catalogo Unico las bandas reales de cada familia de cartera.
 * Devuelve { '1402': [{ codigo:'140205', desde:1, hasta:30, nombre:'De 1 a 30 dias' }, ...], ... }
 * ordenadas por `desde`. La ultima banda de cada familia trae hasta = null.
 */
export async function cargarBandasCartera(execTarget) {
  const request = new sql.Request(execTarget);
  const res = await request.query(`
    SELECT Codigo, Nombre
    FROM dbo.PlanCuentas
    WHERE LEN(Codigo) = 6 AND Codigo >= '1401' AND Codigo < '1429'
    ORDER BY Codigo
  `);

  // "De 1 a 30 dias" / "De mas de 360 dias" — con o sin tildes, el Catalogo real
  // las trae con tilde ("dias" -> "días", "mas" -> "más").
  const RANGO = /De\s+(\d+)\s+a\s+(\d+)/i;
  const ABIERTO = /De\s+m[aá]s\s+de\s+(\d+)/i;

  const bandas = {};
  for (const row of res.recordset) {
    const familia = row.Codigo.slice(0, 4);
    const nombre = String(row.Nombre || '').trim();
    let desde = null, hasta = null;

    const rango = nombre.match(RANGO);
    const abierto = nombre.match(ABIERTO);
    if (rango) { desde = parseInt(rango[1], 10); hasta = parseInt(rango[2], 10); }
    else if (abierto) { desde = parseInt(abierto[1], 10) + 1; hasta = null; }
    else continue; // subcuenta que no es una banda de antiguedad

    (bandas[familia] = bandas[familia] || []).push({ codigo: row.Codigo, desde, hasta, nombre });
  }
  for (const familia of Object.keys(bandas)) {
    bandas[familia].sort((a, b) => a.desde - b.desde);
  }
  return bandas;
}

/**
 * Cuenta de 6 digitos para una familia y una antiguedad en dias.
 * `dias` es dias de mora en cartera vencida, o dias que faltan para el
 * vencimiento en cartera por vencer / que no devenga.
 * Devuelve null si la familia no tiene bandas cargadas (no inventa una cuenta).
 */
export function cuentaPorBanda(bandas, familia, dias) {
  const lista = bandas[familia];
  if (!lista || !lista.length) return null;
  const d = Math.max(1, Math.ceil(dias)); // la banda mas baja del catalogo arranca en 1
  for (const b of lista) {
    if (d >= b.desde && (b.hasta === null || d <= b.hasta)) return b;
  }
  return lista[lista.length - 1]; // por encima de la ultima banda cerrada
}

/** Parametros de calificacion/provision por segmento (dbo.ParametrosProvisionCartera). */
export async function cargarParametrosProvision(execTarget) {
  const request = new sql.Request(execTarget);
  const res = await request.query(`
    SELECT Segmento, Calificacion, DiasMoraDesde, DiasMoraHasta, PorcentajeProvision, CuentaProvision
    FROM dbo.ParametrosProvisionCartera
    WHERE Activo = 1
    ORDER BY Segmento, DiasMoraDesde
  `);
  const porSegmento = {};
  for (const r of res.recordset) {
    (porSegmento[r.Segmento] = porSegmento[r.Segmento] || []).push({
      calificacion: r.Calificacion,
      desde: r.DiasMoraDesde,
      hasta: r.DiasMoraHasta,
      pct: parseFloat(r.PorcentajeProvision),
      cuentaProvision: r.CuentaProvision,
    });
  }
  return porSegmento;
}

/** Calificacion de riesgo (A1..E) y % de provision de una operacion. */
export function calificarOperacion(parametros, segmento, diasMora) {
  const tabla = parametros[segmento] || parametros.CONSUMO || [];
  const d = Math.max(0, Math.round(diasMora));
  for (const p of tabla) {
    if (d >= p.desde && (p.hasta === null || d <= p.hasta)) return p;
  }
  return tabla[tabla.length - 1] || null;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Clasifica TODA la cartera vigente a una fecha de corte.
 *
 * Regla contable aplicada (tratamiento SEPS estandar): si una operacion tiene al
 * menos una cuota vencida, sus cuotas aun no vencidas dejan de devengar interes y
 * se reclasifican a 141x; NO se quedan en "por vencer".
 *
 * La CALIFICACION de riesgo y la PROVISION se aplican sobre el saldo TOTAL de la
 * operacion (no solo sobre las cuotas vencidas), que es lo que exige la norma.
 */
export async function clasificarCartera(execTarget, fechaCorte) {
  const [bandas, parametros] = await Promise.all([
    cargarBandasCartera(execTarget),
    cargarParametrosProvision(execTarget),
  ]);

  const request = new sql.Request(execTarget);
  const res = await request
    .input('FechaCorte', sql.Date, fechaCorte)
    .query(`
      SELECT c.CreditoID, c.SocioID, s.Tipo,
             j.number AS Cuota, j.capital AS Capital,
             CAST(DATEADD(MONTH, j.number, c.FechaDesembolso) AS DATE) AS FechaVenceCuota,
             DATEDIFF(DAY, CAST(DATEADD(MONTH, j.number, c.FechaDesembolso) AS DATE), @FechaCorte) AS DiasMora
      FROM dbo.Creditos c
      JOIN dbo.SolicitudesCredito s ON s.SolicitudID = c.SolicitudID
      CROSS APPLY OPENJSON(s.PlanPagos) WITH (
        number  INT           '$.number',
        capital DECIMAL(15,2) '$.capital',
        status  NVARCHAR(20)  '$.status'
      ) j
      WHERE c.Estado = 'VIGENTE' AND ISNULL(j.status, '') <> 'PAGADO'
      ORDER BY c.CreditoID, j.number
    `);

  // Agrupar cuotas por operacion.
  const operaciones = new Map();
  for (const r of res.recordset) {
    let op = operaciones.get(r.CreditoID);
    if (!op) {
      op = {
        creditoId: r.CreditoID, socioId: r.SocioID,
        segmento: segmentoDeTipo(r.Tipo),
        cuotas: [], saldo: 0, diasMoraMax: 0,
      };
      operaciones.set(r.CreditoID, op);
    }
    const capital = parseFloat(r.Capital || 0);
    const diasMora = Number(r.DiasMora || 0);
    op.cuotas.push({ numero: r.Cuota, capital, diasMora });
    op.saldo += capital;
    if (diasMora > op.diasMoraMax) op.diasMoraMax = diasMora;
  }

  const porCuenta = {};   // codigo 6 digitos -> { saldo, operaciones:Set, estado, banda, segmento }
  const provisionPorSegmento = {};
  const detalleOperaciones = [];

  const acumular = (codigo, meta, monto, creditoId) => {
    if (!codigo) return;
    const slot = porCuenta[codigo] || (porCuenta[codigo] = {
      cuenta: codigo, segmento: meta.segmento, estado: meta.estado,
      banda: meta.banda, saldo: 0, operaciones: new Set(),
    });
    slot.saldo += monto;
    slot.operaciones.add(creditoId);
  };

  for (const op of operaciones.values()) {
    const enMora = op.diasMoraMax > 0;
    const calif = calificarOperacion(parametros, op.segmento, enMora ? op.diasMoraMax : 0);

    for (const cuota of op.cuotas) {
      const vencida = cuota.diasMora > 0;
      const estado = vencida ? 'VENCIDA' : (enMora ? 'NO DEVENGA INTERESES' : 'POR VENCER');
      const familia = (FAMILIA_CARTERA[op.segmento] || {})[estado];
      // Cartera vencida se banda por dias de MORA; por vencer / no devenga, por los
      // dias que FALTAN para el vencimiento (DiasMora viene negativo en ese caso).
      const dias = vencida ? cuota.diasMora : -cuota.diasMora;
      const banda = cuentaPorBanda(bandas, familia, dias);
      acumular(banda && banda.codigo, { segmento: op.segmento, estado, banda: banda && banda.nombre }, cuota.capital, op.creditoId);
    }

    const pct = calif ? calif.pct : 0;
    const provision = op.saldo * pct;
    const cuentaProv = calif ? calif.cuentaProvision : null;
    if (cuentaProv) {
      const slot = provisionPorSegmento[op.segmento] || (provisionPorSegmento[op.segmento] = {
        segmento: op.segmento, cuentaProvision: cuentaProv,
        cuentaGasto: GASTO_PROVISION[op.segmento], requerida: 0, operaciones: 0,
      });
      slot.requerida += provision;
      slot.operaciones += 1;
    }

    detalleOperaciones.push({
      creditoId: op.creditoId, socioId: op.socioId, segmento: op.segmento,
      saldo: round2(op.saldo), diasMora: Math.max(0, op.diasMoraMax),
      calificacion: calif ? calif.calificacion : null,
      porcentajeProvision: pct,
      provisionRequerida: round2(provision),
      estado: enMora ? 'EN MORA' : 'AL DIA',
    });
  }

  const filas = Object.values(porCuenta)
    .map(s => ({
      cuenta: s.cuenta, segmento: s.segmento, estado: s.estado, banda: s.banda,
      operaciones: s.operaciones.size, saldo: round2(s.saldo),
    }))
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta));

  const suma = (pred) => round2(filas.filter(pred).reduce((s, f) => s + f.saldo, 0));
  const carteraBruta = suma(() => true);
  const vencida = suma(f => f.estado === 'VENCIDA');
  const noDevenga = suma(f => f.estado === 'NO DEVENGA INTERESES');
  const porVencer = suma(f => f.estado === 'POR VENCER');

  const provisiones = Object.values(provisionPorSegmento).map(p => ({
    ...p, requerida: round2(p.requerida),
  }));

  return {
    fechaCorte,
    filas,
    operaciones: detalleOperaciones,
    provisiones,
    totales: {
      operaciones: operaciones.size,
      carteraBruta,
      porVencer,
      noDevenga,
      vencida,
      improductiva: round2(noDevenga + vencida),
      morosidadPct: carteraBruta > 0 ? round2(((noDevenga + vencida) / carteraBruta) * 100) : 0,
      provisionRequerida: round2(provisiones.reduce((s, p) => s + p.requerida, 0)),
    },
  };
}

/** Saldos contables actuales por cuenta, para un conjunto de prefijos. */
export async function saldosContablesPorCuenta(execTarget, prefijos, fechaCorte) {
  const request = new sql.Request(execTarget);
  const filtro = prefijos.map((p, i) => `rc.CuentaContable LIKE @p${i} + '%'`).join(' OR ');
  prefijos.forEach((p, i) => request.input(`p${i}`, sql.NVarChar(15), p));
  request.input('FechaCorte', sql.Date, fechaCorte);
  const res = await request.query(`
    SELECT rc.CuentaContable AS cuenta,
           SUM(ISNULL(rc.Debe, 0))  AS debe,
           SUM(ISNULL(rc.Haber, 0)) AS haber
    FROM dbo.RegistroContable rc
    WHERE CAST(rc.Fecha AS DATE) <= @FechaCorte AND (${filtro})
    GROUP BY rc.CuentaContable
  `);
  const mapa = {};
  for (const r of res.recordset) {
    mapa[r.cuenta] = round2(parseFloat(r.debe || 0) - parseFloat(r.haber || 0));
  }
  return mapa;
}

// Tolerancia del descuadre entre la cartera contable y la cartera segun la tabla
// de amortizacion. Existe por una razon concreta: la suma de `capital` del plan de
// pagos no cierra al centavo contra el monto desembolsado (3 creditos de $5.000
// suman $14.999,97). Dentro de la tolerancia el residuo se absorbe y el asiento
// cuadra; fuera de ella el proceso se NIEGA a aplicarse, porque un descuadre
// grande es un problema real de contabilidad que reclasificar solo taparia.
export const TOLERANCIA_DESCUADRE_ABS = 1.00;   // dolares
export const TOLERANCIA_DESCUADRE_PCT = 0.001;  // 0,1% de la cartera contable

/**
 * Calcula el asiento de reclasificacion: la diferencia entre donde ESTA
 * contabilizada la cartera hoy y donde DEBERIA estar segun los vencimientos
 * reales a la fecha de corte.
 *
 * El proceso REDISTRIBUYE el saldo contable, no lo crea ni lo destruye: la
 * estructura de bandas sale de la tabla de amortizacion, pero el monto total
 * repartido es el que la contabilidad ya tiene registrado. Por eso el asiento
 * siempre cuadra (total debe == total haber) cuando es aplicable.
 *
 * No se aplica nada aqui: solo se calcula. El endpoint decide si simula o graba.
 */
export async function calcularReclasificacion(execTarget, fechaCorte) {
  const clasificacion = await clasificarCartera(execTarget, fechaCorte);
  const contable = await saldosContablesPorCuenta(execTarget, PREFIJOS_CARTERA, fechaCorte);

  const carteraOperativa = clasificacion.totales.carteraBruta;
  const carteraContable = round2(Object.values(contable).reduce((s, v) => s + v, 0));
  const descuadre = round2(carteraOperativa - carteraContable);
  const tolerancia = Math.max(TOLERANCIA_DESCUADRE_ABS, round2(Math.abs(carteraContable) * TOLERANCIA_DESCUADRE_PCT));
  const dentroDeTolerancia = Math.abs(descuadre) <= tolerancia;

  // Reparto del saldo contable con la estructura de bandas real. El factor corrige
  // el redondeo del plan de pagos; el residuo de centavos que sobrevive al redondeo
  // se carga a la banda de mayor saldo para que el asiento cuadre exacto.
  const objetivo = {};
  const factor = (dentroDeTolerancia && carteraOperativa > 0.001) ? (carteraContable / carteraOperativa) : 1;
  for (const f of clasificacion.filas) objetivo[f.cuenta] = round2(f.saldo * factor);
  if (dentroDeTolerancia && clasificacion.filas.length) {
    const asignado = round2(Object.values(objetivo).reduce((s, v) => s + v, 0));
    const residuo = round2(carteraContable - asignado);
    if (Math.abs(residuo) >= 0.01) {
      const mayor = clasificacion.filas.reduce((a, b) => (objetivo[b.cuenta] > objetivo[a.cuenta] ? b : a));
      objetivo[mayor.cuenta] = round2(objetivo[mayor.cuenta] + residuo);
    }
  }

  const cuentas = new Set([...Object.keys(objetivo), ...Object.keys(contable)]);
  const movimientos = [];
  for (const cuenta of [...cuentas].sort()) {
    const destino = round2(objetivo[cuenta] || 0);
    const actual = round2(contable[cuenta] || 0);
    const delta = round2(destino - actual);
    if (Math.abs(delta) < 0.01) continue;
    const fila = clasificacion.filas.find(f => f.cuenta === cuenta);
    movimientos.push({
      cuenta,
      saldoActual: actual,
      saldoObjetivo: destino,
      delta,
      debe: delta > 0 ? delta : 0,
      haber: delta < 0 ? -delta : 0,
      segmento: fila ? fila.segmento : null,
      estado: fila ? fila.estado : null,
      banda: fila ? fila.banda : null,
    });
  }

  const totalDebe = round2(movimientos.reduce((s, m) => s + m.debe, 0));
  const totalHaber = round2(movimientos.reduce((s, m) => s + m.haber, 0));
  const cuadrado = Math.abs(round2(totalDebe - totalHaber)) < 0.01;

  const bloqueos = [];
  if (!dentroDeTolerancia) {
    bloqueos.push(
      `La cartera registrada en contabilidad ($${carteraContable.toFixed(2)}) no coincide con la cartera ` +
      `de la tabla de amortizacion ($${carteraOperativa.toFixed(2)}): diferencia $${descuadre.toFixed(2)}, ` +
      `sobre una tolerancia de $${tolerancia.toFixed(2)}. Reclasificar sin resolver esa diferencia la ocultaria ` +
      `en las bandas en vez de corregirla.`
    );
  }
  if (!cuadrado) {
    bloqueos.push(`El asiento de reclasificacion no cuadra: debe $${totalDebe.toFixed(2)} contra haber $${totalHaber.toFixed(2)}.`);
  }

  return {
    fechaCorte,
    clasificacion,
    movimientos,
    aplicable: bloqueos.length === 0,
    bloqueos,
    totales: {
      carteraContable,
      carteraOperativa,
      descuadre,
      tolerancia,
      totalDebe,
      totalHaber,
      cuadrado,
    },
  };
}

/**
 * Provisiones: compara la provision REQUERIDA por calificacion contra la
 * CONSTITUIDA en las cuentas 1499xx. Las 1499xx son cuentas de activo de
 * naturaleza ACREEDORA (reducen la cartera), asi que su saldo se lee Haber-Debe.
 */
export async function calcularProvisiones(execTarget, clasificacion, fechaCorte) {
  const saldos = await saldosContablesPorCuenta(execTarget, ['1499'], fechaCorte);
  const constituidaPorCuenta = {};
  for (const [cuenta, saldoDeudor] of Object.entries(saldos)) {
    constituidaPorCuenta[cuenta] = round2(-saldoDeudor); // Haber - Debe
  }

  const ajustes = clasificacion.provisiones.map(p => {
    const constituida = round2(constituidaPorCuenta[p.cuentaProvision] || 0);
    const ajuste = round2(p.requerida - constituida);
    return {
      segmento: p.segmento,
      cuentaProvision: p.cuentaProvision,
      cuentaGasto: p.cuentaGasto,
      operaciones: p.operaciones,
      requerida: p.requerida,
      constituida,
      ajuste,                       // > 0 constituir mas (gasto); < 0 reversar (ingreso)
    };
  }).filter(a => Math.abs(a.ajuste) >= 0.01);

  return {
    ajustes,
    totalRequerida: round2(clasificacion.provisiones.reduce((s, p) => s + p.requerida, 0)),
    totalConstituida: round2(Object.values(constituidaPorCuenta).reduce((s, v) => s + v, 0)),
    totalAjuste: round2(ajustes.reduce((s, a) => s + a.ajuste, 0)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOLVENCIA REGULATORIA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Activos Ponderados por Riesgo + Patrimonio Tecnico Constituido + indice de
 * solvencia, todo leido de las tablas parametricas (db/sqlserver/31_*.sql).
 *
 * Reemplaza la aproximacion Patrimonio/Activo que se publicaba antes. La
 * ponderacion de cada cuenta la resuelve el PREFIJO MAS LARGO que haga match,
 * de modo que 149915 (provision de vivienda) pondere 40% mientras el resto de
 * 1499 pondera 100%.
 */
export async function calcularSolvencia(execTarget, fechaCorte = null) {
  const request = new sql.Request(execTarget);
  if (fechaCorte) request.input('FechaCorte', sql.Date, fechaCorte);
  const filtroFecha = fechaCorte ? 'WHERE CAST(rc.Fecha AS DATE) <= @FechaCorte' : '';

  const [saldos, ponderaciones, componentes, limites] = await Promise.all([
    request.query(`
      SELECT rc.CuentaContable AS cuenta, pc.Nombre AS nombre, pc.TipoCuenta AS tipo,
             SUM(ISNULL(rc.Debe, 0)) AS debe, SUM(ISNULL(rc.Haber, 0)) AS haber
      FROM dbo.RegistroContable rc
      JOIN dbo.PlanCuentas pc ON pc.Codigo = rc.CuentaContable
      ${filtroFecha}
      GROUP BY rc.CuentaContable, pc.Nombre, pc.TipoCuenta
    `),
    new sql.Request(execTarget).query(`
      SELECT PrefijoCuenta, Ponderacion, Categoria, Descripcion
      FROM dbo.PonderacionesRiesgo WHERE Activo = 1
    `),
    new sql.Request(execTarget).query(`
      SELECT Componente, PrefijoCuenta, Factor, SaldoComo, LimitePctAPR, Descripcion
      FROM dbo.ParametrosPatrimonioTecnico WHERE Activo = 1
    `),
    new sql.Request(execTarget).query(`
      SELECT Clave, Valor FROM dbo.ParametrosRegulatorios
    `),
  ]);

  const limite = (clave, porDefecto) => {
    const row = limites.recordset.find(r => r.Clave === clave);
    return row ? parseFloat(row.Valor) : porDefecto;
  };
  const SOLVENCIA_MINIMA = limite('SOLVENCIA_MINIMA', 0.09);
  const TOPE_SECUNDARIO = limite('PT_SECUNDARIO_TOPE_PRIMARIO', 1);
  const TOPE_PROV_GENERAL = limite('PROVISION_GENERAL_TOPE_APR', 0.0125);

  // Prefijo mas largo gana.
  const pesos = ponderaciones.recordset
    .map(p => ({ prefijo: p.PrefijoCuenta, pond: parseFloat(p.Ponderacion), categoria: p.Categoria }))
    .sort((a, b) => b.prefijo.length - a.prefijo.length);

  const porCategoria = {};
  const sinPonderar = [];
  let activoContable = 0, apr = 0;

  for (const r of saldos.recordset) {
    if (r.tipo !== 'ACTIVO') continue;
    const saldo = round2(parseFloat(r.debe || 0) - parseFloat(r.haber || 0)); // activo: Debe-Haber
    activoContable += saldo;
    const peso = pesos.find(p => r.cuenta.startsWith(p.prefijo));
    if (!peso) { sinPonderar.push({ cuenta: r.cuenta, nombre: r.nombre, saldo }); continue; }
    const ponderado = round2(saldo * peso.pond);
    apr += ponderado;
    const slot = porCategoria[peso.categoria] || (porCategoria[peso.categoria] = {
      categoria: peso.categoria, ponderacion: peso.pond, saldo: 0, ponderado: 0, cuentas: 0,
    });
    slot.saldo += saldo;
    slot.ponderado += ponderado;
    slot.cuentas += 1;
  }
  activoContable = round2(activoContable);
  apr = round2(apr);

  // Patrimonio tecnico. `SaldoComo` evita el error de contar dos veces una
  // perdida: las deducciones se leen con saldo DEUDOR y no aparecen en el primario.
  const saldoComponente = (prefijo, saldoComo) => {
    let total = 0;
    for (const r of saldos.recordset) {
      if (!r.cuenta.startsWith(prefijo)) continue;
      const debe = parseFloat(r.debe || 0), haber = parseFloat(r.haber || 0);
      total += saldoComo === 'DEUDOR' ? (debe - haber) : (haber - debe);
    }
    return round2(total);
  };

  const detallePT = { PRIMARIO: [], SECUNDARIO: [], DEDUCCION: [] };
  let primario = 0, secundario = 0, deducciones = 0;

  for (const c of componentes.recordset) {
    const bruto = saldoComponente(c.PrefijoCuenta, c.SaldoComo);
    const factor = parseFloat(c.Factor);
    let valor = round2(bruto * factor);
    let topeAplicado = null;

    if (c.LimitePctAPR !== null && c.LimitePctAPR !== undefined) {
      const tope = round2(apr * parseFloat(c.LimitePctAPR));
      if (valor > tope) { topeAplicado = tope; valor = tope; }
    }
    // Un componente con saldo negativo no suma patrimonio: se ignora en vez de
    // restar por la puerta de atras (las deducciones tienen su propio componente).
    if (c.Componente !== 'DEDUCCION' && valor < 0) valor = 0;
    if (c.Componente === 'DEDUCCION' && valor < 0) valor = 0;

    detallePT[c.Componente].push({
      prefijo: c.PrefijoCuenta, descripcion: c.Descripcion, factor,
      saldo: bruto, valor, topeAplicado,
    });
    if (c.Componente === 'PRIMARIO') primario += valor;
    else if (c.Componente === 'SECUNDARIO') secundario += valor;
    else deducciones += valor;
  }

  // Resultado del periodo aun no cerrado. Mientras no exista el asiento de cierre,
  // 3603/3604 estan en cero y el patrimonio tecnico quedaria subestimado (o
  // sobreestimado, si el periodo va en perdida). Se incorpora con la MISMA
  // convencion que ya usan el ESF y los indicadores PERLAS: resultado = {5} - {4}.
  // Utilidad -> patrimonio secundario; perdida -> deduccion.
  const porTipo = (tipo) => round2(saldos.recordset
    .filter(r => r.tipo === tipo)
    .reduce((s, r) => s + (parseFloat(r.haber || 0) - parseFloat(r.debe || 0)), 0));
  const ingresos = porTipo('INGRESO');
  const gastos = -porTipo('GASTO');            // gasto: saldo natural deudor
  const resultadoEjercicio = round2(ingresos - gastos);
  if (resultadoEjercicio >= 0) {
    detallePT.SECUNDARIO.push({
      prefijo: '5-4', descripcion: 'Resultado del ejercicio no cerrado (ingresos {5} - gastos {4})',
      factor: 1, saldo: resultadoEjercicio, valor: resultadoEjercicio, topeAplicado: null,
    });
    secundario += resultadoEjercicio;
  } else {
    detallePT.DEDUCCION.push({
      prefijo: '5-4', descripcion: 'Perdida del ejercicio no cerrada (ingresos {5} - gastos {4})',
      factor: 1, saldo: resultadoEjercicio, valor: -resultadoEjercicio, topeAplicado: null,
    });
    deducciones += -resultadoEjercicio;
  }

  primario = round2(primario);
  secundario = round2(secundario);
  deducciones = round2(deducciones);

  // El patrimonio secundario no puede exceder al primario.
  const secundarioComputable = round2(Math.min(secundario, primario * TOPE_SECUNDARIO));
  const secundarioExcluido = round2(secundario - secundarioComputable);
  const patrimonioTecnico = round2(primario + secundarioComputable - deducciones);

  const indice = apr > 0.001 ? round2((patrimonioTecnico / apr) * 100) : null;
  const minimoPct = round2(SOLVENCIA_MINIMA * 100);
  const excedente = indice === null ? null : round2(patrimonioTecnico - apr * SOLVENCIA_MINIMA);

  return {
    fechaCorte: fechaCorte || new Date().toISOString().split('T')[0],
    apr: {
      activoContable,
      activosPonderados: apr,
      categorias: Object.values(porCategoria)
        .map(c => ({ ...c, saldo: round2(c.saldo), ponderado: round2(c.ponderado) }))
        .sort((a, b) => a.ponderacion - b.ponderacion),
      cuentasSinPonderar: sinPonderar,
    },
    patrimonioTecnico: {
      primario, secundario, secundarioComputable, secundarioExcluido,
      deducciones, constituido: patrimonioTecnico,
      resultadoEjercicio,
      detalle: detallePT,
      topeProvisionGeneralPct: round2(TOPE_PROV_GENERAL * 100),
    },
    solvencia: {
      indicePct: indice,
      minimoPct,
      cumple: indice === null ? null : indice >= minimoPct,
      excedenteDeficit: excedente,
      formula: 'Patrimonio Tecnico Constituido / Activos Ponderados por Riesgo',
      baseNormativa: 'Resolucion 127-2015-F (JPRMF) - Norma para la determinacion del patrimonio tecnico de las COAC',
    },
  };
}
