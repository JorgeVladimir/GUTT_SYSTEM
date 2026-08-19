
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import {
  CalendarRange,
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  RefreshCw,
  Lock,
  ShieldAlert,
  Info,
  ListChecks,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { DataService } from '../services/dataService';

// Forma exacta del objeto devuelto por CarteraMensualJsonRunner (jdbc-informix), sin
// transformar montos con aritmética adicional en el backend: se pasan tal cual llegan de
// Informix (BigDecimal -> número), solo se formatean (toFixed/toLocaleString) al renderizar.
interface CarteraMensualResumen {
  numCuotasVencidas: number;
  capitalEsperado: number;
  interesEsperado: number;
  totalEsperado: number;
  capitalRecuperado: number;
  interesRecuperado: number;
  moraRecuperada: number;
  totalRecuperadoSinMora: number;
  totalRecuperadoConMora: number;
  numCuotasConAbonoCapital: number;
  tasaRecuperacionConMoraPct: number | null;
  tasaRecuperacionSinMoraPct: number | null;
}

interface CarteraMensualPorLinea {
  codLinea: string | number;
  lineaNombre: string;
  numCuotasEsperadas: number;
  capitalEsperado: number;
  interesEsperado: number;
  totalEsperado: number;
  capitalRecuperado: number;
  interesRecuperado: number;
  moraRecuperada: number;
  totalRecuperado: number;
  tasaRecuperacionPct: number | null;
}

export interface CarteraMensualData {
  anio: number;
  mes: number;
  fechaInicioMes: string;
  fechaFinMes: string;
  resumen: CarteraMensualResumen;
  porLinea: CarteraMensualPorLinea[];
  metodologia: string;
}

export interface CarteraMensualCache {
  anio: number;
  mes: number;
  data: CarteraMensualData;
}

interface CarteraMensualViewProps {
  currentUser?: User;
  // Mismo patrón de caché a nivel de App.tsx que el resto de reportes de cartera (la vista
  // se desmonta al cambiar de menú -- ver CarteraCreditoView.tsx / memoria de agente
  // "caja-patate-cache-mobile-layout").
  cachedData?: CarteraMensualCache | null;
  onDataLoaded?: (data: CarteraMensualCache) => void;
}

const money = (v: unknown) =>
  `$${(Number(v) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'N/A' : `${Number(v).toFixed(2)}%`);

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const defaultAnioMes = (): { anio: number; mes: number } => {
  const hoy = new Date();
  // Por defecto, mes calendario anterior al actual (mismo criterio que el backend): el mes
  // en curso normalmente no ha terminado, así que "recuperación del mes" es parcial por
  // definición si no ha cerrado.
  const ref = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return { anio: ref.getFullYear(), mes: ref.getMonth() + 1 };
};

export const CarteraMensualView: React.FC<CarteraMensualViewProps> = ({ currentUser, cachedData, onDataLoaded }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER;
  const isManager = currentUser?.role === UserRole.MANAGER;
  const isAccountant = currentUser?.role === UserRole.ACCOUNTANT;
  const isCreditOfficer = currentUser?.role === UserRole.CREDIT_OFFICER;
  // Mismo criterio de acceso que Cartera de Crédito: información financiera agregada de
  // toda la cooperativa sobre recuperación de cartera.
  const hasAccess = isAdmin || isManager || isAccountant || isCreditOfficer;

  const initial = cachedData || null;
  const [data, setData] = useState<CarteraMensualData | null>(initial?.data || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anioInput, setAnioInput] = useState<number>(initial?.anio || defaultAnioMes().anio);
  const [mesInput, setMesInput] = useState<number>(initial?.mes || defaultAnioMes().mes);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!!cachedData);

  const loadCarteraMensual = async (anio?: number, mes?: number) => {
    const a = anio ?? anioInput;
    const m = mes ?? mesInput;
    setLoading(true);
    setError(null);
    try {
      const res = await DataService.getCarteraMensual(a, m);
      if (res && res.ok && res.data) {
        setData(res.data);
        setAnioInput(res.data.anio ?? a);
        setMesInput(res.data.mes ?? m);
        onDataLoaded?.({ anio: res.data.anio ?? a, mes: res.data.mes ?? m, data: res.data });
      } else {
        setError(res?.error || 'No se pudo obtener la cartera mensual.');
      }
    } catch (e) {
      setError('Error de conexión al consultar Informix. La consulta puede tardar hasta 40 segundos por ser en vivo sobre el core bancario legado; intente nuevamente.');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    if (hasAccess && !cachedData) void loadCarteraMensual();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Capital', Esperado: data.resumen.capitalEsperado, Recuperado: data.resumen.capitalRecuperado },
      { name: 'Interés', Esperado: data.resumen.interesEsperado, Recuperado: data.resumen.interesRecuperado },
      { name: 'Mora', Esperado: 0, Recuperado: data.resumen.moraRecuperada },
    ];
  }, [data]);

  const tasaColor = (t: number | null | undefined) => {
    if (t === null || t === undefined) return 'text-slate-400';
    if (t >= 95) return 'text-[#14532D]';
    if (t >= 80) return 'text-amber-600';
    return 'text-red-600';
  };

  if (!hasAccess) {
    return (
      <div className="max-w-3xl mx-auto py-20">
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center opacity-40">
          <Lock size={64} className="mx-auto mb-4" />
          <p className="font-black uppercase tracking-widest text-xs">Acceso restringido a Cartera Mensual</p>
        </div>
      </div>
    );
  }

  const anios = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Cartera Mensual</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GUTT SYSTEM · Recuperación del mes (esperado vs. recuperado)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <CalendarRange size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
            <select
              value={mesInput}
              onChange={e => setMesInput(Number(e.target.value))}
              className="pl-11 pr-8 py-3 bg-white border-2 border-slate-100 rounded-2xl font-black text-[#14532D] text-xs outline-none focus:border-[#14532D] shadow-sm appearance-none cursor-pointer"
            >
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>{nombre}</option>
              ))}
            </select>
          </div>
          <select
            value={anioInput}
            onChange={e => setAnioInput(Number(e.target.value))}
            className="px-4 py-3 bg-white border-2 border-slate-100 rounded-2xl font-black text-[#14532D] text-xs outline-none focus:border-[#14532D] shadow-sm appearance-none cursor-pointer"
          >
            {anios.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            onClick={() => void loadCarteraMensual(anioInput, mesInput)}
            disabled={loading}
            className="px-6 py-3 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Consultando...' : 'Consultar'}
          </button>
        </div>
      </div>

      {loading && !hasLoadedOnce && (
        <div className="bg-white p-8 sm:p-16 rounded-[2rem] sm:rounded-[4rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 border-4 border-[#14532D] border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Consultando Informix en vivo</p>
          <p className="text-[11px] font-bold text-slate-400 mt-2 text-center max-w-md">
            Esta es una consulta real sobre el core bancario legado a través del túnel Tailscale.
            Puede tardar hasta 40 segundos, por favor espere.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 p-8 rounded-[2.5rem] flex items-center gap-6 no-print">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
            <ShieldAlert size={28} />
          </div>
          <div className="flex-1">
            <p className="font-black text-red-700 text-sm uppercase tracking-wide">No se pudo cargar la cartera mensual</p>
            <p className="text-xs font-bold text-red-500 mt-1">{error}</p>
          </div>
          <button onClick={() => void loadCarteraMensual(anioInput, mesInput)} className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {!error && hasLoadedOnce && data && (
        <>
          <div className="flex items-center justify-between px-2 no-print">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Periodo: <span className="text-[#14532D]">{MESES[data.mes - 1]} {data.anio}</span> ({data.fechaInicioMes} a {data.fechaFinMes}) · {data.resumen.numCuotasVencidas} cuotas vencieron ese mes
            </p>
          </div>

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-[#14532D] text-white rounded-2xl flex items-center justify-center mb-4 shadow-md">
                  <Target size={22} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Esperado del Mes</p>
                <h4 className="text-2xl font-black text-slate-900">{money(data.resumen.totalEsperado)}</h4>
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-6">Capital + interés programado de cuotas que vencían este mes</p>
            </div>

            <div className="p-8 bg-emerald-50 rounded-3xl border border-emerald-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-[#14532D] rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <Wallet size={22} />
                </div>
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1">Recuperado del Mes</p>
                <h4 className="text-2xl font-black text-[#14532D]">{money(data.resumen.totalRecuperadoConMora)}</h4>
              </div>
              <p className="text-[8px] font-bold text-emerald-700/60 uppercase tracking-widest mt-6">Capital + interés + mora efectivamente cobrados este mes</p>
            </div>

            <div className={`p-8 rounded-3xl border shadow-sm flex flex-col justify-between ${(data.resumen.tasaRecuperacionConMoraPct ?? 0) >= 95 ? 'bg-emerald-50 border-emerald-100' : (data.resumen.tasaRecuperacionConMoraPct ?? 0) >= 80 ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
              <div>
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  {(data.resumen.tasaRecuperacionConMoraPct ?? 0) >= 95 ? (
                    <TrendingUp size={22} className="text-[#14532D]" />
                  ) : (
                    <TrendingDown size={22} className="text-amber-600" />
                  )}
                </div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Tasa de Recuperación</p>
                <h4 className={`text-2xl font-black ${tasaColor(data.resumen.tasaRecuperacionConMoraPct)}`}>{pct(data.resumen.tasaRecuperacionConMoraPct)}</h4>
              </div>
              <p className="text-[8px] font-bold text-slate-500/70 uppercase tracking-widest mt-6">Recuperado / Esperado · incluye mora</p>
            </div>

            <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <ListChecks size={22} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Cuotas con Abono de Capital</p>
                <h4 className="text-2xl font-black text-slate-900">{data.resumen.numCuotasConAbonoCapital}</h4>
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-6">de {data.resumen.numCuotasVencidas} cuotas que vencieron este mes</p>
            </div>
          </div>

          {/* Nota metodológica -- transparencia obligatoria: esperado y recuperado son
              poblaciones distintas por diseño, no la misma cuota necesariamente. */}
          <div className="bg-blue-50 border border-blue-100 rounded-[2rem] p-6 sm:p-8 flex items-start gap-4">
            <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-blue-700 leading-relaxed">{data.metodologia}</p>
          </div>

          {/* Gráfico comparativo */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
            <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4 mb-6">Esperado vs. Recuperado por Rubro</h4>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 700 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value: any) => [money(value), '']} contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontFamily: 'sans-serif', fontWeight: 'bold' }} />
                  <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase', fontFamily: 'sans-serif' }} />
                  <Bar dataKey="Esperado" fill="#94A3B8" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="Recuperado" fill="#14532D" radius={[8, 8, 0, 0]} />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla por línea de crédito */}
          <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden printable-area">
            <div className="px-4 sm:px-8 py-6 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Recuperación por Línea de Crédito</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{MESES[data.mes - 1]} {data.anio}</p>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b sticky top-0 z-10">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-5 py-4 text-left">Línea</th>
                    <th className="px-5 py-4 text-right"># Cuotas</th>
                    <th className="px-5 py-4 text-right">Esperado</th>
                    <th className="px-5 py-4 text-right">Recuperado</th>
                    <th className="px-5 py-4 text-right">Mora Recuperada</th>
                    <th className="px-5 py-4 text-right">Tasa de Recuperación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.porLinea.map((l, i) => (
                    <tr key={`${l.codLinea}-${i}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4 font-black text-slate-800 text-[11px] uppercase whitespace-nowrap">{l.lineaNombre}</td>
                      <td className="px-5 py-4 text-right font-bold text-slate-500 text-[11px]">{l.numCuotasEsperadas}</td>
                      <td className="px-5 py-4 text-right font-bold text-slate-700 text-[11px] whitespace-nowrap">{money(l.totalEsperado)}</td>
                      <td className="px-5 py-4 text-right font-black text-[#14532D] text-[11px] whitespace-nowrap">{money(l.totalRecuperado)}</td>
                      <td className="px-5 py-4 text-right font-bold text-amber-700 text-[11px] whitespace-nowrap">{money(l.moraRecuperada)}</td>
                      <td className={`px-5 py-4 text-right font-black text-[11px] ${tasaColor(l.tasaRecuperacionPct)}`}>{pct(l.tasaRecuperacionPct)}</td>
                    </tr>
                  ))}
                  {data.porLinea.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-slate-300">
                        <CalendarRange size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-black uppercase tracking-widest text-xs">Sin cuotas ni abonos para este periodo</p>
                      </td>
                    </tr>
                  )}
                </tbody>
                {data.porLinea.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#14532D] bg-emerald-50 font-black sticky bottom-0">
                      <td className="px-5 py-4 text-[#14532D] text-[10px] uppercase" colSpan={2}>Total ({data.resumen.numCuotasVencidas} cuotas)</td>
                      <td className="px-5 py-4 text-right text-slate-900 text-[11px]">{money(data.resumen.totalEsperado)}</td>
                      <td className="px-5 py-4 text-right text-[#14532D] text-[11px]">{money(data.resumen.totalRecuperadoConMora)}</td>
                      <td className="px-5 py-4 text-right text-amber-700 text-[11px]">{money(data.resumen.moraRecuperada)}</td>
                      <td className={`px-5 py-4 text-right text-[11px] ${tasaColor(data.resumen.tasaRecuperacionConMoraPct)}`}>{pct(data.resumen.tasaRecuperacionConMoraPct)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
