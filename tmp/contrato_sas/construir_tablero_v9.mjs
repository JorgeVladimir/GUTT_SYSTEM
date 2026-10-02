// Tablero v9 (20-sep-2026): de contrato a desarrollo. Parte de la version viva (tablero_vivo_1789573386.html).
// Cambia: marca TECNIFIN, pestanas Desarrollo / Dinero / Contrato y socios, hitos H0 y H1, desembolsos completos con brecha
// de financiamiento calculada, fechas re-basadas al 1-oct-2026. No toca los paneles "Diseno GUTT Movil" ni "Pagina Web".
import fs from 'node:fs';

const DIR = 'C:/GUTT_SYSTEM/tmp/contrato_sas';
let t = fs.readFileSync(`${DIR}/tablero_vivo_1789573386.html`, 'utf8');

const uno = (desde, hacia) => {
  const n = t.split(desde).length - 1;
  if (n !== 1) throw new Error(`se esperaba 1 coincidencia y hubo ${n}: ${desde.slice(0, 70)}`);
  t = t.replace(desde, () => hacia);
};
const entre = (ini, fin, nuevo) => {
  const a = t.indexOf(ini);
  if (a < 0 || t.indexOf(ini, a + 1) >= 0) throw new Error(`marcador inicial no unico: ${ini.slice(0, 60)}`);
  const b = t.indexOf(fin, a);
  if (b < 0) throw new Error(`marcador final no hallado: ${fin.slice(0, 60)}`);
  t = t.slice(0, a) + nuevo + t.slice(b + fin.length);
};

// ---------- marca y pestanas ----------
uno('<title>Tablero de Avance</title>', '<title>Tablero TECNIFIN</title>');
uno('<div><b>Tablero de Avance</b><span>SISTEMA FINANCIERO EPS</span></div>',
    '<div><b>TECNIFIN · Tablero de Avance</b><span>SISTEMA FINANCIERO EPS · alterna GUTT COMPANY</span></div>');
uno(`      <button type="button" class="tabbtn is-on" id="tabBtnAvance" role="tab" aria-selected="true" aria-controls="panelAvance">Avance del proyecto</button>`,
`      <button type="button" class="tabbtn is-on" id="tabBtnAvance" role="tab" aria-selected="true" aria-controls="panelAvance">Desarrollo</button>
      <button type="button" class="tabbtn" id="tabBtnDinero" role="tab" aria-selected="false" aria-controls="panelDinero">Dinero</button>
      <button type="button" class="tabbtn" id="tabBtnContrato" role="tab" aria-selected="false" aria-controls="panelContrato">Contrato y socios</button>`);

// ---------- estilos nuevos (antes del cierre del <style> principal) ----------
uno('[hidden]{display:none!important}\n</style>', `[hidden]{display:none!important}

/* ── v9: hitos, dinero y contrato ───────────────────── */
.tabbar{flex-wrap:wrap}
.hitoc{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--panel-2);margin-bottom:12px}
.hitoc:last-child{margin-bottom:0}
.hito__top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.hito__cod{font-family:var(--mono);font-size:10.5px;color:var(--cyan-dark);letter-spacing:.06em;text-transform:uppercase}
.hito__name{font-size:13.5px;font-weight:600;color:var(--ink);margin:2px 0 0;line-height:1.4}
.hito__meta{font-family:var(--mono);font-size:10.5px;color:var(--ink-3)}
.hito__bar{height:8px;border-radius:99px;background:var(--slate-50);border:1px solid var(--line-soft);overflow:hidden;margin:10px 0 6px}
.hito__bar i{display:block;height:100%;background:var(--cyan-dark);border-radius:99px;transition:width .4s ease}
.chk{display:flex;gap:9px;align-items:flex-start;padding:6px 0;font-size:12px;color:var(--ink-2);line-height:1.45;cursor:pointer}
.chk input{margin-top:2px;width:15px;height:15px;accent-color:var(--cyan-dark);flex:none;cursor:pointer}
.chk.hecho span{color:var(--ink-3);text-decoration:line-through;text-decoration-color:var(--line)}
.des__cat{font-family:var(--mono);font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3);margin-left:6px}
.des.condicional{background:var(--amber-50);margin:2px -20px;padding:9px 20px;border-radius:8px;border-bottom:none}
.des.condicional .des__monto{color:var(--amber)}
.gap{margin-top:6px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.gap div{display:flex;justify-content:space-between;gap:12px;padding:9px 14px;font-size:12px;color:var(--ink-2);border-bottom:1px solid var(--line-soft)}
.gap div:last-child{border-bottom:0;background:var(--amber-50);color:var(--ink)}
.gap b{font-family:var(--mono);font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
.lista{margin:0;padding-left:18px;font-size:12px;color:var(--ink-2);line-height:1.85}
.aviso{margin-top:14px;background:var(--navy-50);border-left:3px solid var(--navy);border-radius:0 10px 10px 0;padding:11px 14px;font-size:12px;line-height:1.55;color:var(--ink)}
.dos{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
@media (max-width:900px){.dos{grid-template-columns:1fr}}
</style>`);

uno(`El dominio y el hosting van aparte del contrato — ver Track D en "Otros frentes del
      proyecto", en la pestaña Avance del proyecto.`, `El dominio (tecnifin.com) y el hosting se contratan con un tope conjunto de USD 150 — ver Track D en "Otros frentes del
      proyecto", en la pestaña Desarrollo.`);
uno('<div><dt>Dominio</dt><dd>por definir</dd></div>', '<div><dt>Dominio</dt><dd>tecnifin.com (a contratar)</dd></div>');

// ---------- paneles de contenido ----------
const PANELES = `<div class="wrap" id="panelAvance">
  <header class="hero">
    <p class="eyebrow">Desarrollo · Proyecto TECNIFIN</p>
    <h1>Primer entregable: el modelo de base de datos multi-tenant en PostgreSQL</h1>
    <p class="lede">Meta 30-oct-2026, aceptado por acta. Después vienen el núcleo multi-tenant, los ocho módulos y,
      en marzo, la migración de los datos reales. El proyecto nuevo vive en C:\\TECNIFIN y este tablero lo sigue.
      El comité marca lo suyo y se ve en vivo para todos.</p>
  </header>

  <div class="stats">
    <div class="stat">
      <div class="stat__head"><span class="stat__lab">Hito H1 · Modelo de BD</span><span class="stat__num" id="numH1">0 / 0</span></div>
      <div class="stat__bar"><i id="barH1" style="width:0%"></i></div>
      <div class="stat__foot" id="footH1">Cargando…</div>
    </div>
    <div class="stat">
      <div class="stat__head"><span class="stat__lab">Migración a PostgreSQL</span><span class="stat__num" id="numMod">0 / 8 módulos</span></div>
      <div class="stat__bar"><i id="barMod" style="width:0%"></i></div>
      <div class="stat__foot" id="footMod">Cargando…</div>
    </div>
    <div class="stat">
      <div class="stat__head"><span class="stat__lab">Fases del contrato</span><span class="stat__num" id="numFases">0 / 7 fases</span></div>
      <div class="stat__bar"><i id="barFases" style="width:0%"></i></div>
      <div class="stat__foot" id="footFases">Cargando…</div>
    </div>
  </div>

  <section class="panel" style="margin-bottom:20px">
    <div class="panel__head">
      <h2>Hitos: crear el proyecto y el modelo de datos</h2>
      <p>Marca cada punto cuando esté verificado. Los de la Fase 0 ya hechos se comprobaron con pruebas, no de palabra.</p>
    </div>
    <div class="panel__body" id="listaHitos">
      <p style="padding:16px 0;color:var(--ink-3);font-size:12px">Cargando hitos…</p>
    </div>
  </section>

  <section class="panel" style="margin-bottom:20px">
    <div class="panel__head">
      <h2>Cronograma del proyecto</h2>
      <p>Las obligaciones de trabajo y de pago corren desde el 1-oct-2026 (reunión de socios del 19-sep-2026). Fechas de fase re-basadas desde esa fecha.</p>
    </div>
    <div class="panel__body">
      <div class="crono">
        <div class="crono-item hoy"><div class="fecha">30-SEP-2026</div><div class="hito">Fase 0 · Proyecto creado, dominio contratado</div></div>
        <div class="crono-item"><div class="fecha">01-OCT-2026</div><div class="hito">Arranque de las obligaciones</div></div>
        <div class="crono-item"><div class="fecha">30-OCT-2026</div><div class="hito">H1 · Modelo de BD aceptado</div></div>
        <div class="crono-item"><div class="fecha">30-NOV-2026</div><div class="hito">Fase 1 · Núcleo multi-tenant</div></div>
        <div class="crono-item"><div class="fecha">28-FEB-2027</div><div class="hito">Fase 2 · Módulos adaptados</div></div>
        <div class="crono-item"><div class="fecha">31-MAR-2027</div><div class="hito">Fase 3 · Migración de datos reales</div></div>
        <div class="crono-item"><div class="fecha">30-ABR-2027</div><div class="hito">Fase 4 · Servidor instalado</div></div>
        <div class="crono-item"><div class="fecha">31-MAY-2027</div><div class="hito">Fase 5 · Hardening y continuidad</div></div>
        <div class="crono-item"><div class="fecha">30-JUN-2027</div><div class="hito">Fase 6 · Capacitación</div></div>
        <div class="crono-item"><div class="fecha">31-JUL-2027</div><div class="hito">Fase 7 · Entrega final</div></div>
      </div>
    </div>
  </section>

  <section class="panel" style="margin-bottom:20px">
    <div class="panel__head">
      <h2>Fases del proyecto</h2>
      <p>Pulsa el estado para avanzarlo. La casilla es el acta de aceptación firmada (cláusula 8 del contrato: nada se acepta por silencio).</p>
    </div>
    <div class="panel__body" id="listaFases">
      <p style="padding:16px 0;color:var(--ink-3);font-size:12px">Cargando fases…</p>
    </div>
    <div class="panel__body" style="padding-top:0">
      <div class="risk">
        <div class="risk__lab">Riesgo principal</div>
        <p>La ADR de aislamiento necesita la revisión expresa de Christian (cláusula 6.3): sin ella H1 se atrasa.
          El borrador se le envía el 2-oct. Alerta si al 16-oct el esquema no está en migraciones versionadas.</p>
      </div>
    </div>
  </section>

  <section class="panel" style="margin-bottom:20px">
    <div class="panel__head">
      <h2>Cómo se ejecuta: agentes con skills</h2>
      <p>Cada procedimiento repetible se escribe una vez en una skill; un modelo más capaz decide el patrón y uno más económico lo repite.</p>
    </div>
    <div class="panel__body">
      <div class="roles">
        <div class="rolecard">
          <div class="rolecard__who"><b>tecnifin-postgres-arquitecto</b><span>Modelo Opus</span></div>
          <p>Abre cada módulo: redacta las ADR, porta los primeros 2-3 endpoints contra el esquema renombrado
            (Socios, Cuentas, AsientosContables + DetalleAsiento, CooperativaId), deja escrito el patrón en
            <code>C:\\TECNIFIN\\docs\\patrones\\</code> y hace la revisión de cierre. En créditos, cartera y contabilidad
            compara los números contra SQL Server.</p>
          <ul>
            <li>Un módulo a la vez, solo el inicio</li>
            <li>Resuelve la ambigüedad de negocio real</li>
            <li>Cierra el módulo — nadie más lo acepta</li>
          </ul>
        </div>
        <div class="rolecard">
          <div class="rolecard__who"><b>tecnifin-postgres-ejecutor</b><span>Modelo Sonnet · worktree propio en TECNIFIN</span></div>
          <p>Entra después del arquitecto, nunca antes. Lee el patrón ya escrito y lo repite en el resto de los
            endpoints, uno por uno, con su prueba. Si algo no encaja en el patrón, para y lo reporta.</p>
          <ul>
            <li>Solo empieza si ya existe el patrón</li>
            <li>No toca nada de la copia principal hasta la revisión</li>
            <li>Todo pasa por <code>withTenant</code>: nadie filtra la cooperativa a mano</li>
          </ul>
        </div>
      </div>
      <div class="aviso">
        <strong>Decisión del 20-sep-2026.</strong> El trabajo nuevo no se hace dentro de GUTT_SYSTEM: nace el proyecto
        <b>TECNIFIN</b> (C:\\TECNIFIN), limpio desde el primer commit, con 14 reglas nacidas de los errores del sistema
        anterior y 6 de ellas comprobadas por pruebas automáticas. GUTT_SYSTEM sigue sirviendo la demo y a la COAC 20 de
        Febrero, y orquesta el plan. La base PostgreSQL es nueva y usa nombres TECNIFIN (<code>tecnifin_dev</code>).
      </div>
    </div>
  </section>

  <section class="panel" style="margin-top:20px">
    <div class="panel__head">
      <h2>Migración a PostgreSQL · módulos</h2>
      <p>Cada módulo se porta ya sobre PostgreSQL multi-tenant. Tamaño medido en server.js, no estimado. "Etapa" agrupa los módulos que no dependen entre sí y pueden portarse a la vez. Fechas propuestas a confirmar tras H1.</p>
    </div>
    <div class="panel__body" id="listaModulos">
      <p style="padding:16px 0;color:var(--ink-3);font-size:12px">Cargando módulos…</p>
    </div>
  </section>

  <section class="panel" style="margin-top:20px">
    <div class="panel__head">
      <h2>Otros frentes del proyecto</h2>
      <p>Corren en paralelo. Sin fecha todavía — dimensionarlos con números reales, no a ojo, es el paso pendiente de cada uno.</p>
    </div>
    <div class="panel__body" id="listaTracks">
      <p style="padding:16px 0;color:var(--ink-3);font-size:12px">Cargando…</p>
    </div>
  </section>

  <footer class="pie">
    <span>TECNIFIN S.A.S. · alterna GUTT COMPANY S.A.S. · contrato interno de socios</span>
    <span>Desarrollado por Jorge Tuquinga</span>
  </footer>
</div>

<div class="wrap" id="panelDinero" hidden>
  <header class="hero">
    <p class="eyebrow">Dinero</p>
    <h1>Todos los desembolsos del proyecto y cuánto falta por financiar</h1>
    <p class="lede">Las cifras salen del contrato interno v3 y de la reunión del 19-sep-2026. Pagos el día 1 de cada mes.
      Marca lo que ya se pagó. Las filas en ámbar están por confirmar o sin fecha firme.</p>
  </header>

  <div class="stats">
    <div class="stat">
      <div class="stat__head"><span class="stat__lab">Pagado</span><span class="stat__num" id="numPresu">$0,00</span></div>
      <div class="stat__bar"><i id="barPresu" style="width:0%"></i></div>
      <div class="stat__foot" id="footPresu">Cargando…</div>
    </div>
    <div class="stat">
      <div class="stat__head"><span class="stat__lab">Cuantificado</span><span class="stat__num" id="numTotal">$0,00</span></div>
      <div class="stat__foot" id="footTotal">Cargando…</div>
    </div>
    <div class="stat">
      <div class="stat__head"><span class="stat__lab">Brecha contra el numerario</span><span class="stat__num" id="numGap">$0,00</span></div>
      <div class="stat__foot" id="footGap">Cargando…</div>
    </div>
  </div>

  <div class="dos">
    <section class="panel">
      <div class="panel__head">
        <h2>Calendario de desembolsos</h2>
        <p>Ordenado por fecha. Desarrolladores: USD 700 c/u los meses 1-5 y USD 350 c/u los meses 6-10.</p>
      </div>
      <div class="panel__body" id="listaDesembolsos">
        <p style="padding:16px 0;color:var(--ink-3);font-size:12px">Cargando desembolsos…</p>
      </div>
    </section>

    <div>
      <section class="panel" style="margin-bottom:20px">
        <div class="panel__head">
          <h2>Financiamiento</h2>
          <p>Lo comprometido frente a lo cuantificado. Se recalcula con los datos de la izquierda.</p>
        </div>
        <div class="panel__body"><div class="gap" id="boxBrecha"></div>
          <div class="aviso">La cláusula 10.9 del contrato v3 obliga a los cinco accionistas a aportar en partes iguales lo que
            falte para cubrir gastos, una vez incorporado el quinto accionista.</div>
        </div>
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2>Sin cuantificar o por conciliar</h2>
          <p>No entran en los totales hasta tener monto y fecha.</p>
        </div>
        <div class="panel__body">
          <ul class="lista">
            <li><b>Capital de trabajo</b> (constitución, marketing, movilización, hospedaje, postproducción): hasta USD 40.000 de referencia; quién administra el fondo, sin definir.</li>
            <li><b>Soporte posterior al mes 10:</b> USD 700 mensuales entre ambos en la proforma; la cláusula 13.1 dice que ninguna remuneración queda garantizada. Decidir.</li>
            <li><b>Servidor básico con traslado desde EE.UU.:</b> estimación pendiente (Jorge), antes del flujo de caja.</li>
            <li><b>Sin costear:</b> internet redundante, flete real del T630, trámites de constitución de la SAS.</li>
            <li><b>Conciliar:</b> infraestructura 10.569,45 (proforma) contra 10.595,45 (informe de la reunión, probable error de transcripción); «≈ 6.000 en pagos» de la reunión contra 10.500 + 4.970 de este cálculo.</li>
            <li><b>Pagos a Christian:</b> la reunión habló de ≈ 4.970 en 10 meses; la cláusula 10.5 del contrato dice «sin pago». Aclarar en acta.</li>
          </ul>
        </div>
      </section>
    </div>
  </div>

  <footer class="pie">
    <span>TECNIFIN S.A.S. · flujo de caja (Anexo I) a cargo de Víctor Cuenca</span>
    <span>Desarrollado por Jorge Tuquinga</span>
  </footer>
</div>

<div class="wrap" id="panelContrato" hidden>
  <header class="hero">
    <p class="eyebrow">Contrato y socios</p>
    <h1>Contrato interno de socios: en revisión, sin frenar el desarrollo</h1>
    <p class="lede">Contrato interno de compromisos previo a la constitución de la sociedad. No forma parte de los
      estatutos ni requiere necesariamente notarización. Denominación principal <b>TECNIFIN S.A.S.</b>, alterna
      <b>GUTT COMPANY S.A.S.</b> (se presentan en ese orden para la reserva de nombre). Las obligaciones de trabajo y de pago
      comienzan el 1-oct-2026.</p>
  </header>

  <div class="dos">
    <section class="panel">
      <div class="panel__head">
        <h2>Estado</h2>
        <p>Versión 3, generada el 19-sep-2026 con lo acordado en la reunión de socios.</p>
      </div>
      <div class="panel__body">
        <ul class="lista">
          <li><b>Lunes 21-sep, tarde:</b> Christian completa la revisión del contrato.</li>
          <li><b>Lunes 21-sep:</b> Víctor entrega el flujo de caja de 10 meses (Anexo I).</li>
          <li><b>Miércoles 23-sep:</b> se presenta el contrato revisado para la aprobación de los cuatro participantes.</li>
          <li><b>Aportes:</b> USD 25.250 por desarrollador (20.000 de trabajo histórico + 5.250 prorrateados). Franklin completa con trabajo adicional los 4.100 de diferencia.</li>
          <li><b>Participación:</b> cinco socios con 20 % cada uno, sujeto a inventario y valoración de aportes.</li>
        </ul>
      </div>
    </section>
    <section class="panel">
      <div class="panel__head">
        <h2>Pendientes de acta</h2>
        <p>Puntos que el contrato deja abiertos a propósito.</p>
      </div>
      <div class="panel__body">
        <ul class="lista">
          <li>Pagos a Christian frente a la cláusula 10.5.</li>
          <li>Retrasos imputables (7.5) y aceptación por silencio (8.2): redacción.</li>
          <li>Funciones del quinto socio (socialización, cabildeo, comercialización) y su tabla.</li>
          <li>Servicios adicionales y ampliación de los objetivos del contrato.</li>
          <li>Administración del fondo de capital de trabajo.</li>
          <li>Uso de cada nombre: razón social, nombre comercial o marca del producto.</li>
        </ul>
      </div>
    </section>
  </div>

  <section class="panel" style="margin-top:20px">
    <div class="panel__head">
      <h2>Roles y responsabilidades</h2>
      <p>Fijados en el contrato (cláusulas 4.6 y 7.6): los dos desarrolladores tienen responsabilidades y actividades equivalentes; la distribución interna se registra en este tablero.</p>
    </div>
    <div class="panel__body">
      <div class="roles">
        <div class="rolecard">
          <div class="rolecard__who"><b>Jorge Tuquinga</b><span>Backend · BD · Infraestructura</span></div>
          <p>Ejecución técnica de todo lo que toca el servidor y la base de datos.</p>
          <ul>
            <li><b>Modelo de datos</b> — ADR, esquema PostgreSQL y núcleo multi-tenant</li>
            <li><b>Migración</b> — porta cada módulo y ensaya la migración de datos</li>
            <li><b>Web</b> — dominio, hosting e infraestructura del sitio</li>
          </ul>
        </div>
        <div class="rolecard">
          <div class="rolecard__who"><b>Franklin Lechon</b><span>Frontend · Pruebas · Soporte a cliente</span></div>
          <p>Verificación de que lo que Jorge construye funciona de verdad, y todo lo de cara al usuario.</p>
          <ul>
            <li><b>Pruebas</b> — paridad numérica de cada módulo</li>
            <li><b>Reportes SEPS</b> — su módulo por contrato</li>
            <li><b>App móvil y web</b> — construcción de las pantallas</li>
          </ul>
        </div>
        <div class="rolecard">
          <div class="rolecard__who"><b>Christian Cuenca</b><span>Jefe de Proyecto · Infraestructura y Seguridad</span></div>
          <p>Coordina actas y cronograma; revisa toda decisión que toca aislamiento, seguridad, respaldo o capacidad.</p>
          <ul>
            <li><b>ADR</b> — revisión expresa de las críticas (cláusula 6.3)</li>
            <li><b>Servidor</b> — proveedores, especificación y compra desde enero</li>
          </ul>
        </div>
        <div class="rolecard">
          <div class="rolecard__who"><b>Víctor Cuenca</b><span>Gerente</span></div>
          <p>Aporte en numerario y administración de la caja.</p>
          <ul>
            <li><b>Flujo de caja</b> — Anexo I, diez meses desde el 1-oct</li>
            <li><b>Contabilidad</b> — tratamiento del software, aportes y cuentas por pagar</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <footer class="pie">
    <span>TECNIFIN S.A.S. · alterna GUTT COMPANY S.A.S.</span>
    <span>Desarrollado por Jorge Tuquinga</span>
  </footer>
</div>

`;
entre('<div class="wrap" id="panelAvance">', '</footer>\n</div>\n\n', PANELES);

// ---------- script del tablero ----------
const SCRIPT = `<script>
(function(){
  "use strict";

  var MONEY = new Intl.NumberFormat('es-EC', {minimumFractionDigits:2, maximumFractionDigits:2});
  var fmt = function(n){ return '$ ' + MONEY.format(n); };
  var fmtFecha = function(iso){
    var d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-EC', {day:'2-digit', month:'short', year:'numeric'}).replace('.', '');
  };
  var $ = function(id){ return document.getElementById(id); };

  var ESTADOS = ['pendiente','en-curso','aceptada','observada'];
  var ESTADO_TXT = {pendiente:'Pendiente', 'en-curso':'En curso', aceptada:'Aceptada', observada:'Observada'};

  // Fechas re-basadas: el contrato corre desde el 1-oct-2026 (reunion del 19-sep-2026).
  var FASES_SEED = [
    {id:'f1', numero:1, nombre:'Arquitectura y núcleo multi-tenant (H1: modelo de BD el 30-oct)', meses:'1–2', entrega:'2026-11-30'},
    {id:'f2', numero:2, nombre:'Módulos de negocio adaptados al esquema multi-tenant', meses:'3–5', entrega:'2027-02-28'},
    {id:'f3', numero:3, nombre:'Migración de datos reales e integración probada de punta a punta', meses:'6', entrega:'2027-03-31'},
    {id:'f4', numero:4, nombre:'Servidor instalado, aprovisionado y primeras empresas activas', meses:'7', entrega:'2027-04-30'},
    {id:'f5', numero:5, nombre:'Hardening, monitoreo y prueba de recuperación superada', meses:'8', entrega:'2027-05-31'},
    {id:'f6', numero:6, nombre:'Manuales entregados y capacitación impartida', meses:'9', entrega:'2027-06-30'},
    {id:'f7', numero:7, nombre:'Sistema en producción para las diez empresas y acta de cierre', meses:'10', entrega:'2027-07-31'}
  ];

  // Hitos con lista de verificacion. Nada nace marcado en el HTML: lo hecho vive en la base (hitos/<id>.hechos).
  var HITOS_SEED = [
    {id:'h0', codigo:'Fase 0', nombre:'Crear el proyecto TECNIFIN sin repetir los errores de GUTT_SYSTEM', meta:'2026-09-30', items:[
      {id:'a', t:'Repositorio C:\\\\TECNIFIN creado con las reglas 1-14 y sus pruebas de higiene'},
      {id:'b', t:'Base tecnifin_dev creada y migrador con SHA-256 verificado'},
      {id:'c', t:'Agentes tecnifin-postgres-* y skills creados; orquestación desde GUTT_SYSTEM verificada'},
      {id:'d', t:'Primer commit y repositorio remoto en GitHub (con confirmación de Jorge)'},
      {id:'e', t:'CI verde en GitHub (solo pruebas, sin despliegue)'},
      {id:'f', t:'Dominio tecnifin.com y hosting contratados (tope USD 150)'},
      {id:'g', t:'Línea base de GUTT_SYSTEM: npm test (55) y migración 34 aplicada'}
    ]},
    {id:'h1', codigo:'H1', nombre:'Modelo de base de datos multi-tenant en PostgreSQL', meta:'2026-10-30', items:[
      {id:'a', t:'ADR-001 · identificación del tenant'},
      {id:'b', t:'ADR-002 · aislamiento de datos (revisión expresa de Christian, sin aprobación por silencio)'},
      {id:'c', t:'ADR-003 · modelo y nomenclatura (tipos, collation, roles con prefijo TECNIFIN)'},
      {id:'d', t:'ARQ-01 · documento de arquitectura multi-tenant'},
      {id:'e', t:'DAT-01 · esquema en db/migrations con SHA-256, todo aplica limpio'},
      {id:'f', t:'Catálogos: Plan de Cuentas SEPS, ponderaciones y parámetros regulatorios'},
      {id:'g', t:'Prueba de aislamiento entre dos cooperativas sin filtración'},
      {id:'h', t:'Prueba de partida doble: asientos cuadrados'},
      {id:'i', t:'Acta de aceptación de H1 firmada'}
    ]}
  ];

  // Desembolsos: el total sale de la suma, nunca de una constante.
  var NUMERARIO = 20000;          // aporte en numerario comprometido por Victor (cláusula 10.4, "hasta")
  var DESEMB_SEED = [
    {id:'dom', categoria:'dominio', etiqueta:'Dominio tecnifin.com + hosting (tope conjunto)', fecha:'2026-09-30', monto:150, tipo:'mensual'},
    {id:'chr', categoria:'christian', etiqueta:'Christian · pagos prorrateados, ≈ 497 al mes durante 10 meses — por confirmar en acta', fecha:'2026-10-01', fechaTxt:'oct-2026 → jul-2027', monto:4970, tipo:'condicional'},
    {id:'nav', categoria:'otros', etiqueta:'Reunión navideña de los cinco accionistas (aprox.)', fecha:'2026-12-15', monto:100, tipo:'mensual'},
    {id:'srv', categoria:'servidor', etiqueta:'Servidor e infraestructura T630 (proforma) — fecha por fijar en el flujo de caja', fecha:'2027-01-31', monto:10569.45, tipo:'equipo'}
  ];
  ['2026-10-01','2026-11-01','2026-12-01','2027-01-01','2027-02-01','2027-03-01','2027-04-01','2027-05-01','2027-06-01','2027-07-01']
    .forEach(function(f, i){
      DESEMB_SEED.push({id:'dv' + (i + 1), categoria:'desarrolladores',
        etiqueta:'Desarrolladores · mes ' + (i + 1) + ' (USD ' + (i < 5 ? '700' : '350') + ' cada uno)',
        fecha:f, monto:(i < 5 ? 1400 : 700), tipo:'mensual'});
    });
  DESEMB_SEED.sort(function(a, b){ return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  var TOTAL = DESEMB_SEED.reduce(function(s, d){ return s + d.monto; }, 0);
  var CAT_TXT = {desarrolladores:'desarrolladores', christian:'christian', dominio:'dominio', servidor:'servidor', otros:'otros'};

  var TRACK_ESTADOS = ['sin-dimensionar','dimensionando','dimensionado'];
  var TRACK_ESTADO_TXT = {'sin-dimensionar':'Sin dimensionar', 'dimensionando':'Dimensionando', 'dimensionado':'Dimensionado'};

  var TRACKS_SEED = [
    {id:'trackB', nombre:'Integración y dureza operativa',
      meta:'Medido: server.gutt_system.js le faltan 25 endpoints frente a server.js (Plataforma 8, Socios 4, Créditos 1, Contabilidad 1, Cartera SEPS 5/5, Reportes SEPS 3, Infra 3). Desde el 20-sep el backend multi-tenant nuevo vive en el proyecto TECNIFIN y server.gutt_system.js queda como referencia. server.js: 76/76 endpoints, 55/55 pruebas — aquí toca verificar en operación real, no reconstruir.',
      responsable:'Jorge (backend nuevo) · Franklin (server.js, verificación y pruebas)'},
    {id:'trackC', nombre:'App móvil — construcción',
      meta:'El diseño ya existe (17 pantallas, ver el lienzo GUTT Móvil). Falta construirlo de verdad contra el backend nuevo. Depende de qué módulos del Track A ya estén listos.',
      responsable:'Franklin (frontend por contrato) · Jorge (endpoints de cada pantalla)'},
    {id:'trackD', nombre:'Página web de TECNIFIN (alterna: GUTT COMPANY)',
      meta:'Actualizado el 19-sep: el dominio y el hosting ya no son un costo aparte — se contratan antes de fin de septiembre con un tope conjunto de USD 150 (dominio ≈ 45-50 al año, hosting ≈ 60-70), incluidos en el flujo de caja desde octubre, para publicar la web y un tablero privado de avances. El desarrollo del sitio sigue dentro del presupuesto y del tiempo del contrato; parte del trabajo adicional de igualación de Franklin (USD 4.100) podría cubrirse con esta página. No existe ningún archivo del sitio todavía — falta medir el alcance real. Primer bosquejo de estructura y contenido (4 páginas: Inicio, Producto, Nosotros, Contacto) ya publicado en la pestaña "Página Web" — pendiente de aprobación del comité.',
      responsable:'Franklin (frontend/soporte a cliente por contrato) · Jorge (dominio e infraestructura)'}
  ];

  var MODULOS_SEED = [
    {id:'m0', numero:0, etapa:0, nombre:'Modelo de BD multi-tenant y núcleo (H1 y APP-01)', responsable:'tecnifin-postgres-arquitecto (opus)',
      endpoints:12, lineas:553, params:29, rango:'1-oct → 30-nov (H1: 30-oct)', dep:'—'},
    {id:'m1', numero:1, etapa:1, nombre:'Socios y cuentas', responsable:'arquitecto (opus) → ejecutor (sonnet)',
      endpoints:18, lineas:1598, params:233, rango:'16-nov → 11-dic (a confirmar)', dep:'Módulo 0'},
    {id:'m2', numero:2, etapa:2, nombre:'Caja y ventanilla', responsable:'arquitecto (opus) → ejecutor (sonnet)',
      endpoints:4, lineas:135, params:12, rango:'14-dic → 29-ene (a confirmar)', dep:'Módulo 1'},
    {id:'m3', numero:3, etapa:2, nombre:'Créditos', responsable:'arquitecto (opus) → ejecutor (sonnet)',
      endpoints:13, lineas:1521, params:270, rango:'14-dic → 29-ene (a confirmar)', dep:'Módulo 1'},
    {id:'m4', numero:4, etapa:2, nombre:'Plazo fijo (DPF)', responsable:'arquitecto (opus) → ejecutor (sonnet)',
      endpoints:10, lineas:435, params:112, rango:'14-dic → 29-ene (a confirmar)', dep:'Módulo 1'},
    {id:'m5', numero:5, etapa:3, nombre:'Contabilidad (verificación cruzada)', responsable:'arquitecto (opus) → ejecutor (sonnet)',
      endpoints:3, lineas:128, params:3, rango:'1-feb → 19-feb (a confirmar)', dep:'Módulos 1, 3, 4'},
    {id:'m6', numero:6, etapa:3, nombre:'Cartera SEPS', responsable:'arquitecto (opus) → ejecutor (sonnet)',
      endpoints:6, lineas:459, params:37, rango:'1-feb → 19-feb (a confirmar)', dep:'Módulo 3'},
    {id:'m7', numero:7, etapa:4, nombre:'Reportes SEPS', responsable:'Franklin (su módulo por contrato) + ejecutor',
      endpoints:6, lineas:820, params:2, rango:'22-feb → 28-feb (a confirmar)', dep:'Módulos 5, 6'}
  ];

  var db = null;
  var toastTimer = null;
  function aviso(msg){
    var t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.classList.remove('on'); }, 2200);
  }
  function marcarVivo(){ $('live').innerHTML = '<i></i>en vivo'; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function guardar(col, id, seedList, porId, cambio, msg){
    if (!db) { aviso('Sin conexión al tablero todavía.'); return; }
    var seed = seedList.find(function(x){ return x.id === id; });
    db.collection(col).doc(id).set(Object.assign({}, seed, porId[id] || {}, cambio))
      .catch(function(){ aviso(msg); });
  }

  function pintarHitos(porId){
    var cont = $('listaHitos');
    cont.innerHTML = '';
    HITOS_SEED.forEach(function(seed){
      var doc = porId[seed.id] || {};
      var hechos = doc.hechos || {};
      var n = seed.items.filter(function(it){ return hechos[it.id]; }).length;
      var pct = Math.round(n / seed.items.length * 100);
      var card = document.createElement('div');
      card.className = 'hitoc';
      card.innerHTML =
        '<div class="hito__top"><div><span class="hito__cod">' + seed.codigo + '</span>' +
          '<p class="hito__name">' + esc(seed.nombre) + '</p></div>' +
          '<span class="hito__meta">meta ' + fmtFecha(seed.meta) + ' · ' + n + ' / ' + seed.items.length + '</span></div>' +
        '<div class="hito__bar"><i style="width:' + pct + '%"></i></div>' +
        seed.items.map(function(it){
          return '<label class="chk' + (hechos[it.id] ? ' hecho' : '') + '"><input type="checkbox" data-hito="' + seed.id + '" data-item="' + it.id + '"' +
            (hechos[it.id] ? ' checked' : '') + '><span>' + esc(it.t) + '</span></label>';
        }).join('');
      cont.appendChild(card);
      if (seed.id === 'h1') {
        $('numH1').textContent = n + ' / ' + seed.items.length;
        $('barH1').style.width = pct + '%';
        $('footH1').textContent = pct + '% de la lista de verificación de H1 · meta ' + fmtFecha(seed.meta);
      }
    });
    cont.querySelectorAll('[data-hito]').forEach(function(chk){
      chk.addEventListener('change', function(){
        var id = chk.getAttribute('data-hito');
        var hechos = Object.assign({}, (porId[id] || {}).hechos || {});
        hechos[chk.getAttribute('data-item')] = chk.checked;
        guardar('hitos', id, HITOS_SEED, porId, {hechos: hechos}, 'No se pudo guardar el hito.');
      });
    });
  }

  function pintarFases(porId){
    var cont = $('listaFases');
    cont.innerHTML = '';
    var aceptadas = 0;
    FASES_SEED.forEach(function(seed){
      var doc = porId[seed.id] || {};
      var estado = doc.estado || 'pendiente';
      var acta = !!doc.acta;
      var nota = doc.nota || '';
      if (estado === 'aceptada') aceptadas++;
      var row = document.createElement('div');
      row.className = 'fase';
      row.innerHTML =
        '<div class="fase__rail"><div class="fase__num">' + seed.numero + '</div><div class="fase__line"></div></div>' +
        '<div class="fase__body">' +
          '<div class="fase__top">' +
            '<p class="fase__name">' + seed.nombre + '</p>' +
            '<button type="button" class="pill pill--' + estado + '" data-fase="' + seed.id + '">' + ESTADO_TXT[estado] + '</button>' +
          '</div>' +
          '<div class="fase__meta">Meses ' + seed.meses + ' · entrega máxima ' + fmtFecha(seed.entrega) + '</div>' +
          '<div class="fase__row2">' +
            '<label class="acta"><input type="checkbox" data-acta="' + seed.id + '"' + (acta ? ' checked' : '') + '> Acta firmada</label>' +
            '<textarea class="nota" rows="1" placeholder="Nota de avance…" data-nota="' + seed.id + '">' + esc(nota) + '</textarea>' +
          '</div>' +
        '</div>';
      cont.appendChild(row);
    });
    var pct = Math.round(aceptadas / FASES_SEED.length * 100);
    $('numFases').textContent = aceptadas + ' / ' + FASES_SEED.length + ' fases';
    $('barFases').style.width = pct + '%';
    $('footFases').textContent = pct + '% de las fases aceptadas por el Jefe de Proyecto';

    cont.querySelectorAll('[data-fase]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-fase');
        var actual = (porId[id] || {}).estado || 'pendiente';
        guardar('fases', id, FASES_SEED, porId, {estado: ESTADOS[(ESTADOS.indexOf(actual) + 1) % ESTADOS.length]}, 'No se pudo guardar el estado.');
      });
    });
    cont.querySelectorAll('[data-acta]').forEach(function(chk){
      chk.addEventListener('change', function(){
        guardar('fases', chk.getAttribute('data-acta'), FASES_SEED, porId, {acta: chk.checked}, 'No se pudo guardar el acta.');
      });
    });
    cont.querySelectorAll('[data-nota]').forEach(function(area){
      var id = area.getAttribute('data-nota');
      var previo = area.value;
      area.addEventListener('blur', function(){
        if (area.value === previo) return;
        previo = area.value;
        guardar('fases', id, FASES_SEED, porId, {nota: area.value}, 'No se pudo guardar la nota.');
      });
    });
  }

  function pintarModulos(porId){
    var cont = $('listaModulos');
    cont.innerHTML = '';
    var aceptados = 0;
    MODULOS_SEED.forEach(function(seed){
      var doc = porId[seed.id] || {};
      var estado = doc.estado || 'pendiente';
      var nota = doc.nota || '';
      if (estado === 'aceptada') aceptados++;
      var row = document.createElement('div');
      row.className = 'mod';
      row.innerHTML =
        '<div class="mod__num">' + seed.numero + '</div>' +
        '<div class="mod__body">' +
          '<div class="mod__top">' +
            '<span class="chip chip--fase" style="flex:none">Etapa ' + seed.etapa + '</span>' +
            '<p class="mod__name" style="flex:1">' + seed.nombre + '</p>' +
            '<button type="button" class="pill pill--' + estado + '" data-mod="' + seed.id + '">' + ESTADO_TXT[estado] + '</button>' +
          '</div>' +
          '<div class="mod__meta">' + seed.endpoints + ' endpoints · ' + seed.lineas + ' líneas · ' + seed.params + ' parámetros a traducir · ' + seed.rango + '</div>' +
          '<div class="mod__row2">' +
            '<span class="owner">' + seed.responsable + '</span>' +
            '<span class="dep">Depende de: ' + seed.dep + '</span>' +
          '</div>' +
          '<textarea class="nota" rows="1" style="margin-top:7px" placeholder="Nota de avance…" data-modnota="' + seed.id + '">' + esc(nota) + '</textarea>' +
        '</div>';
      cont.appendChild(row);
    });
    var pct = Math.round(aceptados / MODULOS_SEED.length * 100);
    $('numMod').textContent = aceptados + ' / ' + MODULOS_SEED.length + ' módulos';
    $('barMod').style.width = pct + '%';
    $('footMod').textContent = pct + '% portados y con prueba de paridad en verde';

    cont.querySelectorAll('[data-mod]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-mod');
        var actual = (porId[id] || {}).estado || 'pendiente';
        guardar('modulos', id, MODULOS_SEED, porId, {estado: ESTADOS[(ESTADOS.indexOf(actual) + 1) % ESTADOS.length]}, 'No se pudo guardar el estado.');
      });
    });
    cont.querySelectorAll('[data-modnota]').forEach(function(area){
      var id = area.getAttribute('data-modnota');
      var previo = area.value;
      area.addEventListener('blur', function(){
        if (area.value === previo) return;
        previo = area.value;
        guardar('modulos', id, MODULOS_SEED, porId, {nota: area.value}, 'No se pudo guardar la nota.');
      });
    });
  }

  function pintarTracks(porId){
    var cont = $('listaTracks');
    cont.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'tracks';
    TRACKS_SEED.forEach(function(seed){
      var doc = porId[seed.id] || {};
      var estado = doc.estado || 'sin-dimensionar';
      var nota = doc.nota || '';
      var card = document.createElement('div');
      card.className = 'track';
      card.innerHTML =
        '<div class="track__top">' +
          '<p class="track__name">' + seed.nombre + '</p>' +
          '<button type="button" class="pill pill--' + estado + '" data-track="' + seed.id + '">' + TRACK_ESTADO_TXT[estado] + '</button>' +
        '</div>' +
        '<p class="track__meta">' + seed.meta + '</p>' +
        '<div class="owner" style="margin-top:8px">' + seed.responsable + '</div>' +
        '<textarea class="nota" rows="1" placeholder="Nota…" data-tracknota="' + seed.id + '">' + esc(nota) + '</textarea>';
      wrap.appendChild(card);
    });
    cont.appendChild(wrap);
    cont.querySelectorAll('[data-track]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = btn.getAttribute('data-track');
        var actual = (porId[id] || {}).estado || 'sin-dimensionar';
        guardar('tracks', id, TRACKS_SEED, porId, {estado: TRACK_ESTADOS[(TRACK_ESTADOS.indexOf(actual) + 1) % TRACK_ESTADOS.length]}, 'No se pudo guardar el estado.');
      });
    });
    cont.querySelectorAll('[data-tracknota]').forEach(function(area){
      var id = area.getAttribute('data-tracknota');
      var previo = area.value;
      area.addEventListener('blur', function(){
        if (area.value === previo) return;
        previo = area.value;
        guardar('tracks', id, TRACKS_SEED, porId, {nota: area.value}, 'No se pudo guardar la nota.');
      });
    });
  }

  function pintarDesembolsos(porId){
    var cont = $('listaDesembolsos');
    cont.innerHTML = '';
    var ejecutado = 0;
    DESEMB_SEED.forEach(function(seed){
      var hecho = !!(porId[seed.id] || {}).ejecutado;
      if (hecho) ejecutado += seed.monto;
      var row = document.createElement('div');
      row.className = 'des' + (seed.tipo === 'equipo' ? ' equipo' : seed.tipo === 'condicional' ? ' condicional' : '');
      row.innerHTML =
        '<span class="des__chk"><input type="checkbox" data-des="' + seed.id + '"' + (hecho ? ' checked' : '') + '></span>' +
        '<span class="des__body">' +
          '<div class="des__lab' + (hecho ? ' done' : '') + '">' + seed.etiqueta + '</div>' +
          '<div class="des__fecha">' + (seed.fechaTxt || fmtFecha(seed.fecha)) + '<span class="des__cat">' + CAT_TXT[seed.categoria] + '</span></div>' +
        '</span>' +
        '<span class="des__monto">' + fmt(seed.monto) + '</span>';
      cont.appendChild(row);
    });
    var total = document.createElement('div');
    total.className = 'des__total';
    total.innerHTML = '<span>Pagado sobre ' + fmt(TOTAL) + '</span><b>' + fmt(ejecutado) + '</b>';
    cont.appendChild(total);

    var pct = Math.round(ejecutado / TOTAL * 100);
    $('numPresu').textContent = fmt(ejecutado);
    $('barPresu').style.width = pct + '%';
    $('footPresu').textContent = pct + '% de lo cuantificado (' + fmt(TOTAL) + ')';
    cont.querySelectorAll('[data-des]').forEach(function(chk){
      chk.addEventListener('change', function(){
        guardar('desembolsos', chk.getAttribute('data-des'), DESEMB_SEED, porId, {ejecutado: chk.checked}, 'No se pudo guardar el desembolso.');
      });
    });
  }

  // Brecha: todo sale de DESEMB_SEED, nada escrito a mano.
  function pintarBrecha(){
    var christian = DESEMB_SEED.filter(function(d){ return d.tipo === 'condicional'; })
      .reduce(function(s, d){ return s + d.monto; }, 0);
    var sinChristian = TOTAL - christian;
    var brechaMax = Math.max(0, TOTAL - NUMERARIO);
    var brechaMin = Math.max(0, sinChristian - NUMERARIO);
    $('numTotal').textContent = fmt(TOTAL);
    $('footTotal').textContent = fmt(sinChristian) + ' si Christian no cobra';
    $('numGap').textContent = fmt(brechaMax);
    $('footGap').textContent = 'entre ' + fmt(brechaMin) + ' y ' + fmt(brechaMax) + ' antes de constitución y marketing';
    $('boxBrecha').innerHTML =
      '<div><span>Numerario comprometido por Víctor (hasta)</span><b>' + fmt(NUMERARIO) + '</b></div>' +
      '<div><span>Cuantificado, con pagos a Christian</span><b>' + fmt(TOTAL) + '</b></div>' +
      '<div><span>Cuantificado, sin pagos a Christian</span><b>' + fmt(sinChristian) + '</b></div>' +
      '<div><span>Falta por financiar (rango)</span><b>' + fmt(brechaMin) + ' – ' + fmt(brechaMax) + '</b></div>';
  }

  function suscribir(col, pintar, msg, guardarMapa){
    db.collection(col).onSnapshot(function(snap){
      var map = {};
      snap.docs.forEach(function(doc){ map[doc.id] = doc.data(); });
      guardarMapa(map);
      pintar(map);
    }, function(){ aviso(msg); });
  }

  function arrancar(){
    // Estado local por si aún no hay conexión a la base
    var fases = {}, desemb = {}, modulos = {}, tracks = {}, hitos = {};
    pintarBrecha();
    pintarHitos(hitos);
    pintarFases(fases);
    pintarDesembolsos(desemb);
    pintarModulos(modulos);
    pintarTracks(tracks);

    if (!(window.claude && window.claude.use)) return;
    window.claude.use('db').then(function(d){
      if (!d) { aviso('El tablero abrió sin conexión a datos compartidos.'); return; }
      db = d;
      marcarVivo();
      suscribir('hitos', pintarHitos, 'Se perdió la conexión en vivo de los hitos.', function(m){ hitos = m; });
      suscribir('fases', pintarFases, 'Se perdió la conexión en vivo de las fases.', function(m){ fases = m; });
      suscribir('desembolsos', pintarDesembolsos, 'Se perdió la conexión en vivo de los desembolsos.', function(m){ desemb = m; });
      suscribir('modulos', pintarModulos, 'Se perdió la conexión en vivo de los módulos.', function(m){ modulos = m; });
      suscribir('tracks', pintarTracks, 'Se perdió la conexión en vivo de los otros frentes.', function(m){ tracks = m; });
    }).catch(function(){ aviso('No se pudo abrir la conexión de datos.'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }
})();
</script>`;
entre('<script>\n(function(){\n  "use strict";\n\n  var MONEY', '  arrancar();\n  }\n})();\n</script>', SCRIPT);

// ---------- selector de pestanas ----------
const TABS = `<script>
(function(){
  "use strict";
  var nombres = ['avance','dinero','contrato','movil','web'];
  var ids = {avance:'Avance', dinero:'Dinero', contrato:'Contrato', movil:'Movil', web:'Web'};
  var btns = {}, panels = {};
  nombres.forEach(function(k){
    btns[k] = document.getElementById('tabBtn' + ids[k]);
    panels[k] = document.getElementById('panel' + ids[k]);
  });
  if (nombres.some(function(k){ return !btns[k] || !panels[k]; })) return;

  function activar(nombre){
    nombres.forEach(function(k){
      var esEste = k === nombre;
      panels[k].hidden = !esEste;
      btns[k].classList.toggle('is-on', esEste);
      btns[k].setAttribute('aria-selected', String(esEste));
    });
    try { localStorage.setItem('gutt-dashboard-tab', nombre); } catch(e){}
  }
  nombres.forEach(function(k){
    btns[k].addEventListener('click', function(){ activar(k); });
  });
  var recordado = null;
  try { recordado = localStorage.getItem('gutt-dashboard-tab'); } catch(e){}
  if (nombres.indexOf(recordado) !== -1) activar(recordado);
})();

</script>`;
entre('<script>\n(function(){\n  "use strict";\n  var btns = {', "  if (nombres.indexOf(recordado) !== -1) activar(recordado);\n})();\n\n</script>", TABS);

fs.writeFileSync(`${DIR}/tablero_v9.html`, t);
console.log('tablero_v9.html', t.length, 'bytes,', t.split('\n').length, 'lineas');
