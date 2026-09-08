import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Lock, ShieldAlert, Info, Play, CheckCircle2, Undo2,
  Layers, Percent, ScrollText, TriangleAlert, Scale,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { DataService } from '../services/dataService';

// ─────────────────────────────────────────────────────────────────────────────
// Proceso mensual de reclasificación de cartera.
//
// Es el cierre del hueco que los indicadores PERLAS venían denunciando: la
// clasificación contable quedaba congelada en la cuenta con la que se desembolsó
// el crédito, así que una cartera 100% en mora reportaba morosidad contable 0%.
//
// La pantalla obliga al camino seguro: primero SIMULA (no toca nada) y solo
// después permite aplicar. Aplicar exige confirmación explícita, y toda corrida
// aplicada se puede reversar dejando los saldos exactamente como estaban.
// ─────────────────────────────────────────────────────────────────────────────

interface Movimiento {
  cuenta: string;
  saldoActual: number;
  saldoObjetivo: number;
  delta: number;
  debe: number;
  haber: number;
  segmento: string | null;
  estado: string | null;
  banda: string | null;
}

interface AjusteProvision {
  segmento: string;
  cuentaProvision: string;
  cuentaGasto: string;
  operaciones: number;
  requerida: number;
  constituida: number;
  ajuste: number;
}

interface OperacionClasificada {
  creditoId: string;
  socioId: number | string;
  segmento: string;
  saldo: number;
  diasMora: number;
  calificacion: string | null;
  porcentajeProvision: number;
  provisionRequerida: number;
  estado: string;
}

interface Resultado {
  ok: boolean;
  estado?: 'SIMULADO' | 'APLICADO' | 'BLOQUEADO' | 'DUPLICADO' | 'SIN_CAMBIOS';
  procesoId?: number;
  fechaCorte: string;
  aplicable?: boolean;
  bloqueos?: string[];
  error?: string;
  mensaje?: string;
  totales?: {
    operaciones: number; carteraBruta: number; porVencer: number; noDevenga: number;
    vencida: number; improductiva: number; morosidadPct: number; provisionRequerida: number;
  };
  control?: {
    carteraContable: number; carteraOperativa: number; descuadre: number;
    tolerancia: number; totalDebe: number; totalHaber: number; cuadrado: boolean;
  };
  filas?: { cuenta: string; segmento: string; estado: string; banda: string; operaciones: number; saldo: number }[];
  movimientos?: Movimiento[];
  operaciones?: OperacionClasificada[];
  provisiones?: { ajustes: AjusteProvision[]; totalRequerida: number; totalConstituida: number; totalAjuste: number };
}

interface ProcesoHistorial {
  procesoId: number;
  fechaCorte: string;
  estado: string;
  usuarioId: string;
  fechaEjecucion: string;
  operacionesEvaluadas: number;
  montoReclasificado: number;
  carteraBruta: number;
  carteraImproductiva: number;
  morosidadPct: number;
  provisionRequerida: number;
  ajusteProvision: number;
  reversaDeProcesoId: number | null;
  observaciones: string | null;
  detalle: { tipo: string; segmento: string | null; cuentaOrigen: string | null; cuentaDestino: string | null; estadoDestino: string | null; bandaDestino: string | null; operaciones: number; monto: number }[];
}

interface Solvencia {
  solvencia: { indicePct: number | null; minimoPct: number; cumple: boolean | null; excedenteDeficit: number | null; formula: string; baseNormativa: string };
  apr: { activoContable: number; activosPonderados: number; categorias: { categoria: string; ponderacion: number; saldo: number; ponderado: number; cuentas: number }[]; cuentasSinPonderar: { cuenta: string; nombre: string; saldo: number }[] };
  patrimonioTecnico: { primario: number; secundario: number; secundarioComputable: number; secundarioExcluido: number; deducciones: number; constituido: number; resultadoEjercicio: number };
}

const money = (n: number | null | undefined) =>
  `$${Number(n ?? 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(2)}%`);

/** Último día del mes anterior: el corte natural de un proceso mensual. */
const corteSugerido = () => {
  const hoy = new Date();
  const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`;
};

const COLOR_ESTADO: Record<string, string> = {
  'POR VENCER': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'NO DEVENGA INTERESES': 'bg-amber-50 text-amber-700 border-amber-200',
  'VENCIDA': 'bg-red-50 text-red-700 border-red-200',
};

const COLOR_CALIFICACION: Record<string, string> = {
  A1: 'bg-emerald-100 text-emerald-800', A2: 'bg-emerald-100 text-emerald-800', A3: 'bg-emerald-100 text-emerald-800',
  B1: 'bg-amber-100 text-amber-800', B2: 'bg-amber-100 text-amber-800',
  C1: 'bg-orange-100 text-orange-800', C2: 'bg-orange-100 text-orange-800',
  D: 'bg-red-100 text-red-800', E: 'bg-red-200 text-red-900',
};

interface Props { currentUser?: User; }

export const ReclasificacionCarteraView: React.FC<Props> = ({ currentUser }) => {
  const rol = currentUser?.role;
  // Solo lectura para quien puede ver contabilidad; ejecutar exige uno de los roles
  // que la lista blanca del backend acepta (requireRoles en server.js).
  const puedeVer = rol === UserRole.ADMIN || rol === UserRole.SUPER_USER || rol === UserRole.ACCOUNTANT
    || rol === UserRole.CARTERA || rol === UserRole.MANAGER;
  const puedeEjecutar = rol === UserRole.ADMIN || rol === UserRole.SUPER_USER
    || rol === UserRole.ACCOUNTANT || rol === UserRole.CARTERA;
  const puedeReversar = rol === UserRole.ADMIN || rol === UserRole.SUPER_USER || rol === UserRole.ACCOUNTANT;

  const [fechaCorte, setFechaCorte] = useState<string>(corteSugerido());
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historial, setHistorial] = useState<ProcesoHistorial[]>([]);
  const [solvencia, setSolvencia] = useState<Solvencia | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pestana, setPestana] = useState<'movimientos' | 'clasificacion' | 'operaciones' | 'solvencia' | 'historial'>('movimientos');

  const headers = () => ({ 'Content-Type': 'application/json', ...DataService.authHeaders() });

  const cargarHistorial = async () => {
    try {
      const res = await fetch('/api/cartera/reclasificaciones', { headers: headers() });
      const d = await res.json();
      if (d.ok) setHistorial(d.procesos || []);
    } catch { /* el historial es complementario: su fallo no bloquea la pantalla */ }
  };

  const cargarSolvencia = async () => {
    try {
      const res = await fetch('/api/reportes/solvencia', { headers: headers() });
      const d = await res.json();
      if (d.ok) setSolvencia(d);
    } catch { /* idem */ }
  };

  const simular = async () => {
    setCargando(true); setError(null); setAviso(null); setConfirmando(false);
    try {
      const res = await fetch('/api/cartera/reclasificar', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ fechaCorte, simular: true }),
      });
      const d: Resultado = await res.json();
      if (!d.ok) { setError(d.error || 'No se pudo simular el proceso.'); setResultado(null); }
      else setResultado(d);
    } catch {
      setError('Error de conexión al simular la reclasificación.');
    } finally { setCargando(false); }
  };

  const aplicar = async () => {
    setAplicando(true); setError(null); setAviso(null);
    try {
      const res = await fetch('/api/cartera/reclasificar', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ fechaCorte, simular: false, observaciones: `Proceso mensual al corte ${fechaCorte}` }),
      });
      const d: Resultado = await res.json();
      if (!d.ok) {
        setError(d.error || `El proceso no se aplicó (${d.estado || 'error'}).`);
      } else if (d.estado === 'SIN_CAMBIOS') {
        setAviso(d.mensaje || 'No había nada que reclasificar.');
        setResultado(d);
      } else {
        setAviso(`Reclasificación aplicada — proceso #${d.procesoId}. ${money(d.control?.totalDebe)} movidos entre bandas.`);
        setResultado(d);
        await Promise.all([cargarHistorial(), cargarSolvencia()]);
      }
    } catch {
      setError('Error de conexión al aplicar la reclasificación.');
    } finally { setAplicando(false); setConfirmando(false); }
  };

  const reversar = async (procesoId: number) => {
    const motivo = window.prompt(`Motivo de la reversa del proceso #${procesoId} (mínimo 5 caracteres):`);
    if (!motivo || motivo.trim().length < 5) return;
    setError(null); setAviso(null);
    try {
      const res = await fetch(`/api/cartera/reclasificar/${procesoId}/reversar`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const d = await res.json();
      if (!d.ok) setError(d.error || 'No se pudo reversar el proceso.');
      else {
        setAviso(`Proceso #${procesoId} reversado (reversa #${d.reversaId}). Los saldos volvieron al estado anterior.`);
        await Promise.all([cargarHistorial(), cargarSolvencia()]);
      }
    } catch {
      setError('Error de conexión al reversar el proceso.');
    }
  };

  useEffect(() => {
    if (!puedeVer) return;
    void cargarHistorial();
    void cargarSolvencia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeVer]);

  const movimientos = resultado?.movimientos || [];
  const ajustes = resultado?.provisiones?.ajustes || [];
  const aplicado = resultado?.estado === 'APLICADO';

  const resumenOperaciones = useMemo(() => {
    const ops = resultado?.operaciones || [];
    const porCalificacion: Record<string, { operaciones: number; saldo: number; provision: number }> = {};
    for (const o of ops) {
      const k = o.calificacion || '—';
      const slot = porCalificacion[k] || (porCalificacion[k] = { operaciones: 0, saldo: 0, provision: 0 });
      slot.operaciones += 1; slot.saldo += o.saldo; slot.provision += o.provisionRequerida;
    }
    return Object.entries(porCalificacion).sort(([a], [b]) => a.localeCompare(b));
  }, [resultado]);

  if (!puedeVer) {
    return (
      <div className="max-w-3xl mx-auto py-20">
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center opacity-40">
          <Lock size={64} className="mx-auto mb-4" />
          <p className="font-black uppercase tracking-widest text-xs">Acceso restringido a procesos de cartera</p>
        </div>
      </div>
    );
  }

  const Tarjeta: React.FC<{ titulo: string; valor: string; sub?: string; tono?: string }> = ({ titulo, valor, sub, tono }) => (
    <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{titulo}</p>
      <p className={`text-2xl font-black tracking-tighter mt-1 ${tono || 'text-slate-900'}`}>{valor}</p>
      {sub && <p className="text-[10px] font-bold text-slate-400 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">

      {/* Cabecera y controles */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Reclasificación de Cartera</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            GUTT SYSTEM · Proceso mensual · Bandas, calificación y provisión SEPS
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={fechaCorte}
            onChange={e => setFechaCorte(e.target.value)}
            className="px-4 py-3 bg-white border-2 border-slate-100 rounded-2xl font-black text-[#14532D] text-xs outline-none focus:border-[#14532D] shadow-sm"
          />
          <button
            onClick={simular}
            disabled={cargando || aplicando}
            className="flex items-center gap-2 px-5 py-3 bg-white border-2 border-[#14532D] text-[#14532D] rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#14532D] hover:text-white transition disabled:opacity-40"
          >
            {cargando ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
            Simular
          </button>
          {puedeEjecutar && (
            <button
              onClick={() => (confirmando ? void aplicar() : setConfirmando(true))}
              disabled={!resultado || !resultado.aplicable || aplicado || aplicando || cargando}
              className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition disabled:opacity-30 ${
                confirmando ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#14532D] text-white hover:bg-[#0f3d21]'
              }`}
            >
              {aplicando ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {confirmando ? 'Confirmar y asentar' : 'Aplicar'}
            </button>
          )}
        </div>
      </div>

      {/* La simulación es obligatoria antes de aplicar: el botón nace deshabilitado */}
      {confirmando && (
        <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-5 flex items-start gap-3">
          <TriangleAlert size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div className="text-xs font-bold text-red-800">
            Va a asentar {money(resultado?.control?.totalDebe)} en {movimientos.length} cuenta(s) de cartera
            {ajustes.length > 0 && <> y a ajustar la provisión en {money(resultado?.provisiones?.totalAjuste)}</>}, con fecha {fechaCorte}.
            El proceso queda registrado y es reversable. Pulse “Confirmar y asentar” de nuevo para continuar, o cambie la fecha para cancelar.
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-5 flex items-start gap-3">
          <ShieldAlert size={18} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs font-bold text-red-800">{error}</p>
        </div>
      )}
      {aviso && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-3xl p-5 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-xs font-bold text-emerald-800">{aviso}</p>
        </div>
      )}
      {resultado && !resultado.aplicable && (resultado.bloqueos || []).length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5 space-y-2">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">El proceso no puede aplicarse</p>
          {(resultado.bloqueos || []).map((b, i) => (
            <p key={i} className="text-xs font-bold text-amber-900">{b}</p>
          ))}
        </div>
      )}

      {/* Resumen de la clasificación */}
      {resultado?.totales && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tarjeta titulo="Cartera bruta" valor={money(resultado.totales.carteraBruta)} sub={`${resultado.totales.operaciones} operación(es)`} />
          <Tarjeta titulo="Por vencer" valor={money(resultado.totales.porVencer)} tono="text-emerald-700" />
          <Tarjeta titulo="No devenga" valor={money(resultado.totales.noDevenga)} tono="text-amber-600" />
          <Tarjeta titulo="Vencida" valor={money(resultado.totales.vencida)} tono="text-red-600" />
          <Tarjeta titulo="Morosidad ampliada" valor={pct(resultado.totales.morosidadPct)}
            tono={resultado.totales.morosidadPct > 5 ? 'text-red-600' : 'text-[#14532D]'} sub="(vencida + no devenga) / bruta" />
          <Tarjeta titulo="Provisión requerida" valor={money(resultado.totales.provisionRequerida)}
            sub={resultado.provisiones ? `constituida ${money(resultado.provisiones.totalConstituida)}` : undefined} />
        </div>
      )}

      {/* Control de cuadre */}
      {resultado?.control && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Scale size={14} className="text-slate-400" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Control de cuadre</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
            <div><p className="text-[9px] font-black text-slate-400 uppercase">Cartera contable</p><p className="font-black text-slate-900">{money(resultado.control.carteraContable)}</p></div>
            <div><p className="text-[9px] font-black text-slate-400 uppercase">Cartera operativa</p><p className="font-black text-slate-900">{money(resultado.control.carteraOperativa)}</p></div>
            <div><p className="text-[9px] font-black text-slate-400 uppercase">Descuadre</p><p className="font-black text-slate-900">{money(resultado.control.descuadre)} <span className="text-slate-400 font-bold">/ tol. {money(resultado.control.tolerancia)}</span></p></div>
            <div><p className="text-[9px] font-black text-slate-400 uppercase">Total debe</p><p className="font-black text-slate-900">{money(resultado.control.totalDebe)}</p></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase">Asiento</p>
              <p className={`font-black ${resultado.control.cuadrado ? 'text-emerald-700' : 'text-red-600'}`}>
                {resultado.control.cuadrado ? 'Cuadrado' : 'Descuadrado'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pestañas */}
      <div className="flex flex-wrap gap-2 no-print">
        {([
          ['movimientos', 'Movimientos contables', <Layers size={13} key="l" />],
          ['clasificacion', 'Clasificación por banda', <ScrollText size={13} key="s" />],
          ['operaciones', 'Calificación y provisión', <Percent size={13} key="p" />],
          ['solvencia', 'Solvencia', <Scale size={13} key="c" />],
          ['historial', 'Historial del proceso', <Undo2 size={13} key="u" />],
        ] as const).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setPestana(id as typeof pestana)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition ${
              pestana === id ? 'bg-[#14532D] text-white' : 'bg-white text-slate-500 border border-slate-100 hover:border-[#14532D]'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Movimientos contables */}
      {pestana === 'movimientos' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          {movimientos.length === 0 ? (
            <p className="p-8 text-center text-xs font-bold text-slate-400">
              {resultado ? 'La clasificación contable ya coincide con los vencimientos reales.' : 'Simule el proceso para ver los movimientos.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-4 py-3 text-left">Cuenta</th>
                    <th className="px-4 py-3 text-left">Estado / banda</th>
                    <th className="px-4 py-3 text-right">Saldo actual</th>
                    <th className="px-4 py-3 text-right">Saldo objetivo</th>
                    <th className="px-4 py-3 text-right">Debe</th>
                    <th className="px-4 py-3 text-right">Haber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movimientos.map(m => (
                    <tr key={m.cuenta} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-black text-slate-900">{m.cuenta}</td>
                      <td className="px-4 py-3">
                        {m.estado ? (
                          <span className={`inline-block px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase ${COLOR_ESTADO[m.estado] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {m.estado}
                          </span>
                        ) : <span className="text-[9px] font-black text-slate-400 uppercase">Origen</span>}
                        {m.banda && <span className="ml-2 text-slate-500 font-bold">{m.banda}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-500">{money(m.saldoActual)}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{money(m.saldoObjetivo)}</td>
                      <td className="px-4 py-3 text-right font-black text-[#14532D]">{m.debe > 0 ? money(m.debe) : ''}</td>
                      <td className="px-4 py-3 text-right font-black text-red-600">{m.haber > 0 ? money(m.haber) : ''}</td>
                    </tr>
                  ))}
                  {ajustes.map(a => (
                    <tr key={`prov-${a.segmento}`} className="bg-amber-50/40">
                      <td className="px-4 py-3 font-black text-slate-900">{a.ajuste > 0 ? a.cuentaGasto : a.cuentaProvision}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-[9px] font-black uppercase">
                          Provisión {a.segmento}
                        </span>
                        <span className="ml-2 text-slate-500 font-bold">
                          requerida {money(a.requerida)} · constituida {money(a.constituida)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-400">—</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{money(a.requerida)}</td>
                      <td className="px-4 py-3 text-right font-black text-[#14532D]">{a.ajuste > 0 ? money(a.ajuste) : ''}</td>
                      <td className="px-4 py-3 text-right font-black text-red-600">{a.ajuste < 0 ? money(-a.ajuste) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr className="text-xs font-black text-slate-900">
                    <td className="px-4 py-3" colSpan={4}>TOTAL RECLASIFICADO</td>
                    <td className="px-4 py-3 text-right">{money(resultado?.control?.totalDebe)}</td>
                    <td className="px-4 py-3 text-right">{money(resultado?.control?.totalHaber)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Clasificación por banda */}
      {pestana === 'clasificacion' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 flex items-center gap-2">
            <Info size={12} className="text-slate-400" />
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Las bandas se leen del Catálogo Único (dbo.PlanCuentas), no están escritas en el código: no son iguales entre familias
            </p>
          </div>
          {(resultado?.filas || []).length === 0 ? (
            <p className="p-8 text-center text-xs font-bold text-slate-400">Simule el proceso para ver la clasificación.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-4 py-3 text-left">Cuenta SEPS</th>
                    <th className="px-4 py-3 text-left">Segmento</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Banda de antigüedad</th>
                    <th className="px-4 py-3 text-right">Operaciones</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(resultado?.filas || []).map(f => (
                    <tr key={f.cuenta} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-black text-slate-900">{f.cuenta}</td>
                      <td className="px-4 py-3 font-bold text-slate-600">{f.segmento}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase ${COLOR_ESTADO[f.estado] || ''}`}>{f.estado}</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-600">{f.banda}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-600">{f.operaciones}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{money(f.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Calificación y provisión */}
      {pestana === 'operaciones' && (
        <div className="space-y-4">
          {resumenOperaciones.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-50">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Resumen por calificación de riesgo · Resolución 128-2015-F (JPRMF)
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-4 py-3 text-left">Calificación</th>
                      <th className="px-4 py-3 text-right">Operaciones</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-right">Provisión requerida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {resumenOperaciones.map(([calif, v]) => (
                      <tr key={calif}>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-black ${COLOR_CALIFICACION[calif] || 'bg-slate-100 text-slate-700'}`}>{calif}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-600">{v.operaciones}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">{money(v.saldo)}</td>
                        <td className="px-4 py-3 text-right font-black text-amber-700">{money(v.provision)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {(resultado?.operaciones || []).length === 0 ? (
              <p className="p-8 text-center text-xs font-bold text-slate-400">Simule el proceso para ver el detalle por operación.</p>
            ) : (
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-4 py-3 text-left">Crédito</th>
                      <th className="px-4 py-3 text-left">Socio</th>
                      <th className="px-4 py-3 text-left">Segmento</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-right">Días mora</th>
                      <th className="px-4 py-3 text-center">Calificación</th>
                      <th className="px-4 py-3 text-right">% provisión</th>
                      <th className="px-4 py-3 text-right">Provisión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(resultado?.operaciones || []).map(o => (
                      <tr key={o.creditoId} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-black text-slate-900">{o.creditoId}</td>
                        <td className="px-4 py-3 font-bold text-slate-600">{o.socioId}</td>
                        <td className="px-4 py-3 font-bold text-slate-600">{o.segmento}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">{money(o.saldo)}</td>
                        <td className={`px-4 py-3 text-right font-black ${o.diasMora > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{o.diasMora}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-lg text-[10px] font-black ${COLOR_CALIFICACION[o.calificacion || ''] || 'bg-slate-100 text-slate-700'}`}>{o.calificacion || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-600">{(o.porcentajeProvision * 100).toFixed(2)}%</td>
                        <td className="px-4 py-3 text-right font-black text-amber-700">{money(o.provisionRequerida)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Solvencia */}
      {pestana === 'solvencia' && (
        <div className="space-y-4">
          {!solvencia ? (
            <p className="p-8 text-center text-xs font-bold text-slate-400 bg-white rounded-3xl border border-slate-100">Cargando el índice de solvencia…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tarjeta titulo="Índice de solvencia" valor={pct(solvencia.solvencia.indicePct)}
                  tono={solvencia.solvencia.cumple ? 'text-[#14532D]' : 'text-red-600'}
                  sub={`mínimo ${pct(solvencia.solvencia.minimoPct)}`} />
                <Tarjeta titulo="Patrimonio técnico" valor={money(solvencia.patrimonioTecnico.constituido)}
                  sub={`primario ${money(solvencia.patrimonioTecnico.primario)} · secundario ${money(solvencia.patrimonioTecnico.secundarioComputable)}`} />
                <Tarjeta titulo="Activos ponderados" valor={money(solvencia.apr.activosPonderados)}
                  sub={`activo contable ${money(solvencia.apr.activoContable)}`} />
                <Tarjeta titulo={solvencia.solvencia.cumple ? 'Excedente' : 'Déficit'}
                  valor={money(Math.abs(solvencia.solvencia.excedenteDeficit ?? 0))}
                  tono={solvencia.solvencia.cumple ? 'text-[#14532D]' : 'text-red-600'} />
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Activos ponderados por riesgo · {solvencia.solvencia.baseNormativa}
                  </p>
                </div>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-4 py-3 text-left">Categoría</th>
                      <th className="px-4 py-3 text-right">Cuentas</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-right">Ponderado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {solvencia.apr.categorias.map(c => (
                      <tr key={c.categoria}>
                        <td className="px-4 py-3 font-black text-slate-900">{c.categoria}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-500">{c.cuentas}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-600">{money(c.saldo)}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">{money(c.ponderado)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr className="font-black text-slate-900">
                      <td className="px-4 py-3" colSpan={3}>TOTAL ACTIVOS PONDERADOS POR RIESGO</td>
                      <td className="px-4 py-3 text-right">{money(solvencia.apr.activosPonderados)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {solvencia.apr.cuentasSinPonderar.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-5">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2">Cuentas de activo sin ponderación asignada</p>
                  <p className="text-xs font-bold text-amber-900">
                    No entran en los activos ponderados, así que la solvencia queda sobreestimada:{' '}
                    {solvencia.apr.cuentasSinPonderar.map(c => `${c.cuenta} (${money(c.saldo)})`).join(', ')}.
                    Agréguelas a dbo.PonderacionesRiesgo.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Historial */}
      {pestana === 'historial' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          {historial.length === 0 ? (
            <p className="p-8 text-center text-xs font-bold text-slate-400">Todavía no se ha corrido el proceso.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-4 py-3 text-left">#</th>
                    <th className="px-4 py-3 text-left">Corte</th>
                    <th className="px-4 py-3 text-left">Estado</th>
                    <th className="px-4 py-3 text-left">Ejecutó</th>
                    <th className="px-4 py-3 text-right">Reclasificado</th>
                    <th className="px-4 py-3 text-right">Morosidad</th>
                    <th className="px-4 py-3 text-right">Ajuste provisión</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historial.map(p => (
                    <tr key={p.procesoId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-black text-slate-900">
                        {p.procesoId}
                        {p.reversaDeProcesoId && <span className="ml-1 text-[9px] font-bold text-slate-400">(rev. de #{p.reversaDeProcesoId})</span>}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-600">{p.fechaCorte}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                          p.estado === 'APLICADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>{p.estado}</span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-600">{p.usuarioId}<span className="block text-[9px] text-slate-400">{p.fechaEjecucion}</span></td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{money(p.montoReclasificado)}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">{pct(p.morosidadPct)}</td>
                      <td className="px-4 py-3 text-right font-black text-amber-700">{money(p.ajusteProvision)}</td>
                      <td className="px-4 py-3 text-right">
                        {p.estado === 'APLICADO' && puedeReversar && (
                          <button
                            onClick={() => void reversar(p.procesoId)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-red-600 font-black text-[9px] uppercase tracking-widest hover:bg-red-50 transition"
                          >
                            <Undo2 size={11} /> Reversar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReclasificacionCarteraView;
