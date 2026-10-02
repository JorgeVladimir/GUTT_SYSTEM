// Contrato de socios v3: integra las observaciones de la reunion del 19-sep-2026 sobre v2_limpio.html.
// Genera v3_marcado.html (cambios v3 resaltados) y v3_limpio.html (texto final sin marcas).
import fs from 'node:fs';

const DIR = 'C:/GUTT_SYSTEM/tmp/contrato_sas';
let t = fs.readFileSync(`${DIR}/v2_limpio.html`, 'utf8');

const uno = (desde, hacia) => {
  const n = t.split(desde).length - 1;
  if (n !== 1) throw new Error(`se esperaba 1 coincidencia y hubo ${n}: ${desde.slice(0, 70)}`);
  t = t.replace(desde, () => hacia);
};
const N = (html) => html.replace(/<\/(p|h3)>$/, '<span class="nuevo-tag">NUEVO v3</span></$1>');
const nuevoP = (txt) => `<p class="nuevo">${txt}<span class="nuevo-tag">NUEVO v3</span></p>`;

// 1. Limpiar las marcas de v2: v3 marca solo lo suyo.
t = t.replace('Marcado de cambios v2', 'Marcado de cambios v3');
t = t.replace(/<span class="nuevo-tag">(NUEVO|MODIFICADO) v2<\/span>/g, '');
t = t.replace(/<div class="nuevo">/g, '<div>').replace(/<p class="nuevo">/g, '<p>');

// 2. Fuera toda referencia a "documento de trabajo / borrador / observaciones".
uno('<title>Contrato de Socios GUTT COMPANY S.A.S. v2</title>', '<title>Contrato de Socios TECNIFIN S.A.S.</title>');
// TECNIFIN es la denominacion principal; GUTT COMPANY la alterna. El token @@ALT@@ protege las menciones
// intencionales de la alterna del reemplazo global del final.
uno('<td>GUTT COMPANY S.A.S. - CONTRATO DE SOCIOS Y COMPROMISO DE EJECUCIÓN</td>', '<td>TECNIFIN S.A.S. - CONTRATO DE SOCIOS Y COMPROMISO DE EJECUCIÓN</td>');
uno('<td>Borrador para negociación v2 - Quito, septiembre de 2026</td>', '<td>Quito, septiembre de 2026</td>');
uno('<p>Documento de trabajo para negociación. La redacción', '<p>La redacción');
t = t.replace(/<p><b>Versión 2\.<\/b>[^\n]*<\/p>\n/, nuevoP(
  '<b>Naturaleza del documento.</b> Este es un contrato interno de compromisos entre los socios, previo a la constitución de la sociedad. No forma parte de los estatutos ni requiere necesariamente notarización, sin perjuicio de su carácter vinculante entre los comparecientes desde su suscripción. Las obligaciones de trabajo y de pago que contiene rigen desde el 1 de octubre de 2026, aunque la legalización de la sociedad esté pendiente.') + '\n');
if (t.includes('Versión 2')) throw new Error('quedo "Versión 2"');
uno('este borrador y sus anexos vinculantes, comprender su contenido y alcance, y manifiestan que cualquier versión destinada a firma deberá incorporar los datos pendientes, porcentajes definitivos, instrumentos de propiedad intelectual y validación jurídica correspondiente.',
    'este contrato y sus anexos vinculantes, comprender su contenido y alcance, y manifiestan que, antes de la firma, se completarán los datos pendientes, los porcentajes definitivos, los instrumentos de propiedad intelectual y la validación jurídica correspondiente.');
uno('<p class="center" style="margin-top:14px"><b>BORRADOR PARA NEGOCIACIÓN - VERSIÓN 2</b></p>\n', '');

// 3. Dos nombres: GUTT COMPANY y TECNIFIN.
uno('bajo la denominación tentativa GUTT COMPANY S.A.S., cuyo giro',
    'bajo la denominación tentativa TECNIFIN S.A.S., con @@ALT@@ como denominación alterna conforme a la cláusula 4.1, cuyo giro');
uno('<p>4.1. Denominación. GUTT COMPANY S.A.S., sujeta a reserva y constitución ante la autoridad competente. Si no estuviere disponible, los socios adoptarán una denominación alternativa sin alterar las demás obligaciones.</p>',
    nuevoP('4.1. Denominación. La sociedad tendrá como denominación principal TECNIFIN S.A.S. y como denominación alterna @@ALT@@. Ambas se presentarán, en ese orden, para la reserva de nombre y la constitución ante la autoridad competente; si la principal no estuviere disponible, se adoptará la alterna sin alterar las demás obligaciones. El uso de cada nombre (razón social, nombre comercial o marca del producto) se fijará por acta de los socios antes de la constitución.'));

// 4. Inicio de obligaciones el 1 de octubre.
uno('serán formalizadas oportunamente.</p>\n',
    'serán formalizadas oportunamente. Las obligaciones de trabajo y de pago previstas en este contrato comienzan el 1 de octubre de 2026, aunque la legalización de la sociedad esté pendiente; este contrato es un acuerdo interno entre los socios y no forma parte de los estatutos.<span class="nuevo-tag">NUEVO v3</span></p>\n');

// 5. 4.6 en un solo literal comun + 4.7 funciones de Victor.
uno('<p>Ambos responden en conjunto frente a la sociedad',
    '<p>Las responsabilidades y actividades de desarrollo descritas en este literal son comunes e idénticas para ambos socios desarrolladores. Ambos responden en conjunto frente a la sociedad');
uno('la valoración de sus aportes establecida en la cláusula 10.6.</p>\n</div>',
    'la valoración de sus aportes establecida en la cláusula 10.6.<span class="nuevo-tag">NUEVO v3</span></p>\n</div>\n' +
    '<div class="nuevo">\n<h3>4.7. Gerencia, flujo de caja y aporte en numerario<span class="nuevo-tag">NUEVO v3</span></h3>\n' +
    '<p>Víctor Cuenca, como GERENTE, será responsable de: la elaboración y actualización del flujo de caja de la cláusula 10.8 (Anexo I); la administración del capital de trabajo de la cláusula 10.9; el tratamiento contable de los aportes, del software y de las cuentas por pagar durante la constitución de la sociedad; el aporte en numerario de la cláusula 10.4; y el espacio físico de la cláusula 12.</p>\n</div>');

// 6. Servidor: la gestion de compra empieza en enero de 2027.
uno('<p>Las credenciales, contraseñas, claves privadas',
    nuevoP('La gestión de compra del servidor y demás equipos iniciará en enero de 2027, conforme al calendario y a los valores referenciales del Anexo I, de modo que su adquisición no retrase la Fase 4.') + '\n<p>Las credenciales, contraseñas, claves privadas');

// 7. 10.6: una sola tabla para ambos desarrolladores (Franklin igualado a 20.000).
const lineas = t.split('\n');
const i0 = lineas.findIndex((l) => l.startsWith('<p>10.6. El trabajo especializado de Franklin'));
const i1 = lineas.findIndex((l) => l.startsWith('<p>La diferencia entre las partes A'));
if (i0 < 0 || i1 < 0 || i1 < i0) throw new Error('no se ubico el bloque 10.6');
const usd = (n) => 'USD ' + n.toLocaleString('de-DE');
const fila = (c, f, j, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><td>${c}</td><td class="n">${f}</td><td class="n">${j}</td></tr>`;
const bloque106 = [
  '<p>10.6. El trabajo especializado de Franklin Lechon y de Jorge Vladimir Tuquinga Tituaña será registrado desde el primer día mediante horas y entregables. Como referencia de negociación, ambos socios desarrolladores tienen la misma valoración: USD 25.250 cada uno, compuesta por: (a) USD 20.000 de trabajo histórico ya realizado en la plataforma antes de la constitución de la sociedad, que constituye su aporte en trabajo para la participación accionaria y no será pagado en efectivo; y (b) USD 5.250 de compensación prorrateada por el trabajo pendiente de los diez meses del proyecto contados desde el 1 de octubre de 2026, pagadera a razón de USD 700 mensuales durante los meses 1 a 5 y USD 350 mensuales durante los meses 6 a 10. Se distribuye así:<span class="nuevo-tag">NUEVO v3</span></p>',
  '<div class="keep">',
  '<p class="cap">Cuadro 10.6. Compromisos de los socios desarrolladores</p>',
  '<table class="t">',
  '<tr><th>Concepto</th><th style="width:19%">Franklin Lechon</th><th style="width:19%">Jorge V. Tuquinga T.</th></tr>',
  fila('A. Trabajo histórico. Aporte en trabajo, no pagado en efectivo', '', '', 'sec'),
  fila('Trabajo histórico ya realizado y documentado', usd(15900), usd(20000)),
  fila('Trabajo adicional de igualación (cláusula 10.6-A)', usd(4100), '—'),
  fila('Subtotal A. Aporte en trabajo', usd(20000), usd(20000), 'tot'),
  fila('B. Trabajo pendiente del proyecto. Compensación prorrateada en efectivo', '', '', 'sec'),
  fila('Fases 1 y 2: arquitectura multi-tenant y adaptación de módulos (meses 1 a 5, USD 700/mes)', usd(3500), usd(3500)),
  fila('Fases 3 a 7: migración, hardening de aplicación, documentación, capacitación y producción (meses 6 a 10, USD 350/mes)', usd(1750), usd(1750)),
  fila('Subtotal B. Compensación prorrateada (10 meses)', usd(5250), usd(5250), 'tot'),
  fila('TOTAL', usd(25250), usd(25250), 'tot'),
  '</table>',
  '</div>',
  nuevoP('10.6-A. Igualación del aporte histórico. Para mantener participaciones accionarias iguales, el trabajo histórico de cada socio desarrollador se lleva a USD 20.000. La diferencia de USD 4.100 en el aporte de Franklin Lechon se completará mediante trabajo adicional no pagado en efectivo, que podrá incluir el desarrollo del sitio web de la compañía y otras actividades acordadas por acta, con registro de horas y entregables. Si no se completare, la participación se ajustará conforme a la cláusula 10.7.'),
  '<p>Esta valoración es referencial para negociación societaria y registro de aportes; la parte A no constituye obligación de pago, salario ni factura. La parte B se pagará mensualmente según el calendario indicado, con cargo a los aportes en numerario de la sociedad. Este pago mensual es independiente del trámite de actas de aceptación de la cláusula 8, que documenta la entrega técnica, sin perjuicio de la obligación de subsanar sin pagos adicionales prevista en la cláusula 7.5. Las horas y entregables reales deberán registrarse periódicamente.</p>',
];
lineas.splice(i0, i1 - i0 + 1, ...bloque106);
t = lineas.join('\n');
uno('la parte A de los cuadros de la cláusula 10.6', 'la parte A del cuadro de la cláusula 10.6');

// 8. 10.8 flujo de caja y 10.9 capital de trabajo (tras 10.7).
const m107 = t.match(/<p>10\.7\. [^\n]*<\/p>\n/);
if (!m107) throw new Error('no se ubico 10.7');
t = t.replace(m107[0], () => m107[0] +
  nuevoP('10.8. Flujo de caja. Los socios aprueban como Anexo I un flujo de caja de diez meses contados desde el 1 de octubre de 2026, que detalla mes a mes los pagos a los socios desarrolladores, las compras de servidor y equipos con sus fechas y valores referenciales, el dominio, el hosting y los demás gastos necesarios, y los fondos que cada socio deberá aportar en cada mes. El incumplimiento de un aporte en el mes indicado, cuando retrase el proyecto, se tratará conforme a la cláusula 16.5.') + '\n' +
  nuevoP('10.9. Capital de trabajo. Los socios mantendrán un capital de trabajo, de hasta USD 40.000 como referencia, para gastos de constitución, postproducción, comercialización y contingencias; no podrá utilizarse como remuneración indiscriminada de los socios. La cuenta o fondo donde se custodie y la forma de administrarlo se definirán por acta antes de que nazca la primera obligación de aporte a dicho fondo. Si el capital de trabajo no alcanzare para cubrir los gastos o las remuneraciones posteriores a la entrega del sistema, los cinco accionistas aportarán los recursos faltantes en partes iguales, una vez incorporado el quinto accionista conforme a la cláusula 14.') + '\n');

// 9. 12.5 dominio y hosting (tras 12.4).
const m124 = t.match(/<p>12\.4\. [^\n]*<\/p>\n/);
if (!m124) throw new Error('no se ubico 12.4');
t = t.replace(m124[0], () => m124[0] +
  nuevoP('12.5. Dominio y hosting. La sociedad contratará antes de finalizar septiembre de 2026 el dominio y el servicio de alojamiento institucionales, para publicar el sitio web de la compañía y un tablero privado de avances, con un presupuesto máximo conjunto de USD 150 que se incluirá en el flujo de caja del Anexo I desde octubre de 2026. Ambos quedarán bajo control institucional conforme a la cláusula 15.2.') + '\n');

// 10. 14.4 tabla del quinto accionista.
uno('sin consentimiento expreso de los socios afectados.</p>\n',
    'sin consentimiento expreso de los socios afectados.</p>\n<div class="nuevo keep">\n' +
    '<p>14.4. Mientras su nombre esté pendiente de definir, se reserva para el quinto inversionista la siguiente tabla, que se completará por acta antes de que nazca obligación alguna a su cargo:<span class="nuevo-tag">NUEVO v3</span></p>\n' +
    '<table class="t">\n<tr><th style="width:34%">Dato</th><th>Detalle</th></tr>\n' +
    '<tr><td>Nombre</td><td>Por designar</td></tr>\n<tr><td>Cédula / RUC</td><td>____________</td></tr>\n' +
    '<tr><td>Monto del aporte</td><td>____________</td></tr>\n<tr><td>Calendario de desembolsos</td><td>____________</td></tr>\n' +
    '<tr><td>Participación</td><td>____________</td></tr>\n' +
    '<tr><td>Funciones (referencia)</td><td>Socialización, cabildeo y apoyo a la comercialización del producto</td></tr>\n</table>\n</div>\n');

// 11. 16.5 incumplimiento de aportes y cronograma.
const m164 = t.match(/<p>16\.4\. [^\n]*<\/p>\n/);
if (!m164) throw new Error('no se ubico 16.4');
t = t.replace(m164[0], () => m164[0] +
  nuevoP('16.5. Aportes y cronograma. El socio que incumpla un aporte o un entregable en la fecha prevista en el flujo de caja (Anexo I) o en el cronograma, y con ello retrase el proyecto, será notificado por escrito y tendrá el plazo de subsanación de la cláusula 16.1. Las consecuencias adicionales se definirán en el Anexo I y en el instrumento definitivo.') + '\n');

// 12. Anexo I.
uno('<tr><td>H</td><td>Matriz de valoración de aportes</td></tr>',
    '<tr><td>H</td><td>Matriz de valoración de aportes</td></tr>\n<tr class="nuevo"><td>I</td><td>Flujo de caja de diez meses desde el 1 de octubre de 2026, calendario de compras y valores referenciales</td></tr>');

// Principal = TECNIFIN: toda otra mencion de la sociedad pasa a TECNIFIN; la alterna solo donde se protegio.
t = t.replaceAll('GUTT COMPANY S.A.S.', 'TECNIFIN S.A.S.').replaceAll('@@ALT@@.', 'GUTT COMPANY S.A.S.').replaceAll('@@ALT@@', 'GUTT COMPANY S.A.S.');

for (const bad of ['borrador', 'Borrador', 'BORRADOR', 'Documento de trabajo', 'observaciones de la reunión', 'v2']) {
  if (t.includes(bad)) throw new Error(`queda referencia a "${bad}"`);
}

fs.writeFileSync(`${DIR}/v3_limpio.html`, t);
fs.writeFileSync(`${DIR}/v3_marcado.html`, t.replace('<body class="limpio">', '<body class="marcado">'));
console.log('v3_marcado.html y v3_limpio.html generados,', t.length, 'bytes');
