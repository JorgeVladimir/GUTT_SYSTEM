
import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  Scale,
  Percent,
  RefreshCw,
  Lock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  CalendarClock,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { DataService } from '../services/dataService';

interface CruceClase {
  saldoDiario: number;
  saldoBcasact: number;
  diferencia: number;
  coincide: boolean;
}

interface Validaciones {
  partidaDobleCuadra: boolean;
  partidaDobleTotalDebe: number;
  partidaDobleTotalHaber: number;
  partidaDobleLineasDebe: number;
  partidaDobleLineasHaber: number;
  ecuacionContableCuadra: boolean;
  ecuacionContableDiferencia: number;
  bcasactCuadraConDiario: boolean;
  cruceBcasact: { clase4: CruceClase; clase5: CruceClase; ultimoPeriodoConDatos: number };
}

interface ComprobanteAnuladoPosteado {
  comprobante: number | string;
  fecha: string;
  detalle: string;
  cuenta: string;
  nombreCuenta: string;
  tipoAsiento: string;
  valor: number;
}

interface CalidadDatos {
  lineasNoMayorizadas: number;
  montoNoMayorizado: number;
  comprobantesAnuladosConLineasPosteadas: number;
  detalleComprobantesAnuladosPosteados: ComprobanteAnuladoPosteado[];
}

// Utilidad REGISTRADA EN LIBROS (cuenta 3.6.03.05 "Utilidad del Ejercicio") vs. la
// utilidad CALCULADA (Ingresos - Gastos, arriba). Ver
// UtilidadRentabilidadQueries.calcular() sección 8 y MANUALES/11_UTILIDAD_RENTABILIDAD.md
// sección 9: la cuenta 360305 solo se actualiza en el cierre mensual/anual del sistema
// legado, que no se ha corrido para ningún periodo del ejercicio en curso -- por eso
// difiere del cálculo directo Ingresos-Gastos, y es un comportamiento normal, no un error.
interface UtilidadEnLibros {
  saldoCuenta360305: number;
  utilidadCalculada: number;
  diferencia: number;
  periodosDelEjercicio: number;
  periodosCerrados: number;
  hayCierreMensualPendiente: boolean;
  explicacion: string;
}

interface UtilidadData {
  ejercicio: number;
  anioCalendario: number;
  fechaCorte: string | null;
  mesesTranscurridos: number;
  ingresos: number;
  gastos: number;
  utilidadNeta: number;
  utilidadAnualizada: number;
  activosTotales: number;
  pasivosTotales: number;
  patrimonio: number;
  patrimonioMasUtilidad: number;
  roaAnualizadoPct: number | null;
  roeEstrictoAnualizadoPct: number | null;
  roeAjustadoAnualizadoPct: number | null;
  validaciones: Validaciones;
  calidadDatos: CalidadDatos;
  utilidadEnLibros: UtilidadEnLibros;
}

interface UtilidadRentabilidadViewProps {
  currentUser?: User;
  // Caché a nivel de App.tsx (no dentro de esta vista, que se desmonta al cambiar de
  // menú): si ya hay datos cargados para esta sesión, no se vuelve a consultar Informix
  // al reentrar -- solo con el botón "Actualizar".
  cachedData?: UtilidadData | null;
  onDataLoaded?: (data: UtilidadData) => void;
}

const money = (v: unknown) =>
  `$${(Number(v) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'N/A' : `${Number(v).toFixed(2)}%`);

const formatFecha = (v: string | null) => {
  if (!v) return 'N/A';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const UtilidadRentabilidadView: React.FC<UtilidadRentabilidadViewProps> = ({ currentUser, cachedData, onDataLoaded }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER;
  const isManager = currentUser?.role === UserRole.MANAGER;
  const isAccountant = currentUser?.role === UserRole.ACCOUNTANT;
  // Información contable/financiera sensible (utilidad neta y rentabilidad de toda la
  // cooperativa): mismo criterio restringido que server.js (UTILIDAD_ROLES).
  const hasAccess = isAdmin || isManager || isAccountant;

  const [data, setData] = useState<UtilidadData | null>(cachedData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!!cachedData);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await DataService.getUtilidadRentabilidad();
      if (res && res.ok) {
        const d = res.data as UtilidadData;
        setData(d);
        onDataLoaded?.(d);
      } else {
        setError(res?.error || 'No se pudo calcular utilidad y rentabilidad.');
      }
    } catch (e) {
      setError('Error de conexión al consultar Informix. El cálculo puede tardar hasta 40 segundos por ser en vivo sobre el core bancario legado; intente nuevamente.');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    // Si App.tsx ya tiene datos en caché de una visita anterior a esta pantalla en esta
    // misma sesión, no se vuelve a consultar Informix -- solo con el botón "Actualizar".
    if (hasAccess && !cachedData) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  if (!hasAccess) {
    return (
      <div className="max-w-3xl mx-auto py-20">
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center opacity-40">
          <Lock size={64} className="mx-auto mb-4" />
          <p className="font-black uppercase tracking-widest text-xs">Acceso restringido a Utilidad y Rentabilidad</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Utilidad y Rentabilidad</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GUTT SYSTEM · Catálogo Único de Cuentas (CUC-SEPS)</p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="px-6 py-3 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Calculando...' : 'Actualizar'}
        </button>
      </div>

      {loading && !hasLoadedOnce && (
        <div className="bg-white p-8 sm:p-16 rounded-[2rem] sm:rounded-[4rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 border-4 border-[#14532D] border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Calculando sobre Informix en vivo</p>
          <p className="text-[11px] font-bold text-slate-400 mt-2 text-center max-w-md">
            Se está verificando partida doble, calculando ingresos/gastos del ejercicio y cruzando contra el
            balance materializado. Puede tardar hasta 40 segundos.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 p-8 rounded-[2.5rem] flex items-center gap-6 no-print">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
            <ShieldAlert size={28} />
          </div>
          <div className="flex-1">
            <p className="font-black text-red-700 text-sm uppercase tracking-wide">No se pudo calcular</p>
            <p className="text-xs font-bold text-red-500 mt-1">{error}</p>
          </div>
          <button onClick={() => void load()} className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {!error && data && (
        <>
          <div className="flex items-center justify-between px-2 no-print">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <CalendarClock size={14} /> Ejercicio {data.anioCalendario} · datos al <span className="text-[#14532D]">{formatFecha(data.fechaCorte)}</span> · {data.mesesTranscurridos} meses transcurridos
            </p>
          </div>

          {/* Banda de validaciones -- nunca se oculta, aunque cuadre o no */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ValidacionBadge
              ok={data.validaciones.partidaDobleCuadra}
              titulo="Partida Doble"
              detalleOk={`Debe = Haber = ${money(data.validaciones.partidaDobleTotalDebe)}`}
              detalleFalla={`Debe ${money(data.validaciones.partidaDobleTotalDebe)} ≠ Haber ${money(data.validaciones.partidaDobleTotalHaber)}`}
            />
            <ValidacionBadge
              ok={data.validaciones.ecuacionContableCuadra}
              titulo="Ecuación Contable"
              detalleOk="Activos = Pasivos + Patrimonio + Utilidad del ejercicio"
              detalleFalla={`Diferencia de ${money(data.validaciones.ecuacionContableDiferencia)}`}
            />
            <ValidacionBadge
              ok={data.validaciones.bcasactCuadraConDiario}
              titulo="bcasact vs. Diario"
              detalleOk="El saldo materializado coincide con el diario mayorizado"
              detalleFalla="bcasact NO coincide con el diario -- ver detalle abajo"
            />
          </div>

          {/* Tarjetas de resultado */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-8 bg-emerald-50 rounded-3xl border border-emerald-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-[#14532D] rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <TrendingUp size={22} />
                </div>
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1">Ingresos (Clase 5)</p>
                <h4 className="text-2xl font-black text-[#14532D]">{money(data.ingresos)}</h4>
              </div>
              <p className="text-[8px] font-bold text-emerald-700/60 uppercase tracking-widest mt-6">Acumulado {data.mesesTranscurridos} meses del ejercicio {data.anioCalendario}</p>
            </div>

            <div className="p-8 bg-red-50 rounded-3xl border border-red-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-red-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <TrendingDown size={22} />
                </div>
                <p className="text-[9px] font-black text-red-600 uppercase tracking-wider mb-1">Gastos (Clase 4)</p>
                <h4 className="text-2xl font-black text-red-900">{money(data.gastos)}</h4>
              </div>
              <p className="text-[8px] font-bold text-red-800/60 uppercase tracking-widest mt-6">Acumulado {data.mesesTranscurridos} meses del ejercicio {data.anioCalendario}</p>
            </div>

            <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-[#14532D] text-white rounded-2xl flex items-center justify-center mb-4 shadow-md">
                  <Wallet size={22} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Utilidad Neta (real, a la fecha)</p>
                <h4 className="text-2xl font-black text-slate-900">{money(data.utilidadNeta)}</h4>
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-6">Ingresos − Gastos, sin anualizar</p>
            </div>

            <div className="p-8 bg-blue-50 rounded-3xl border border-blue-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-blue-700 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <Scale size={22} />
                </div>
                <p className="text-[9px] font-black text-blue-600 uppercase tracking-wider mb-1">Utilidad Anualizada (estimada)</p>
                <h4 className="text-2xl font-black text-blue-900">{money(data.utilidadAnualizada)}</h4>
              </div>
              <p className="text-[8px] font-bold text-blue-700/60 uppercase tracking-widest mt-6">= Utilidad Neta × 12 / {data.mesesTranscurridos} meses</p>
            </div>
          </div>

          {/* Utilidad calculada vs. registrada en libros (cuenta 3.6.03.05) -- nunca se
              oculta, muestra ambos números lado a lado con la explicación real del
              descuadre (proceso de cierre mensual/anual pendiente). Ver
              UtilidadRentabilidadQueries.calcular() sección 8 y
              MANUALES/11_UTILIDAD_RENTABILIDAD.md sección 9. */}
          <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 printable-area">
            <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4 flex items-center gap-2 mb-6">
              <Scale size={16} /> Utilidad Calculada vs. Registrada en Libros (cuenta 3.6.03.05)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Calculada (Ingresos − Gastos)</p>
                <p className="text-xl font-black text-slate-800">{money(data.utilidadEnLibros.utilidadCalculada)}</p>
              </div>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Registrada en libros (cta. 3.6.03.05)</p>
                <p className="text-xl font-black text-slate-800">{money(data.utilidadEnLibros.saldoCuenta360305)}</p>
              </div>
              <div className={`p-6 rounded-2xl border ${data.utilidadEnLibros.hayCierreMensualPendiente ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${data.utilidadEnLibros.hayCierreMensualPendiente ? 'text-amber-600' : 'text-emerald-600'}`}>Diferencia</p>
                <p className={`text-xl font-black ${data.utilidadEnLibros.hayCierreMensualPendiente ? 'text-amber-900' : 'text-emerald-800'}`}>{money(data.utilidadEnLibros.diferencia)}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-1">
                  {data.utilidadEnLibros.periodosCerrados} de {data.utilidadEnLibros.periodosDelEjercicio} periodos mensuales cerrados
                </p>
              </div>
            </div>
            <div className={`p-5 rounded-xl flex items-start gap-3 border ${data.utilidadEnLibros.hayCierreMensualPendiente ? 'bg-blue-50 border-blue-100' : 'bg-emerald-50 border-emerald-100'}`}>
              {data.utilidadEnLibros.hayCierreMensualPendiente
                ? <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                : <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />}
              <p className={`text-[11px] font-bold leading-relaxed ${data.utilidadEnLibros.hayCierreMensualPendiente ? 'text-blue-700' : 'text-emerald-700'}`}>
                {data.utilidadEnLibros.explicacion}
              </p>
            </div>
          </div>

          {/* Balance */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Activos Totales (Clase 1)</p>
                <p className="text-lg font-black text-slate-800">{money(data.activosTotales)}</p>
              </div>
              <Landmark size={20} className="text-slate-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Pasivos Totales (Clase 2)</p>
                <p className="text-lg font-black text-slate-800">{money(data.pasivosTotales)}</p>
              </div>
              <Scale size={20} className="text-slate-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Patrimonio (Clase 3)</p>
                <p className="text-lg font-black text-slate-800">{money(data.patrimonio)}</p>
              </div>
              <Wallet size={20} className="text-slate-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Patrimonio + Utilidad No Distribuida</p>
                <p className="text-lg font-black text-slate-800">{money(data.patrimonioMasUtilidad)}</p>
              </div>
              <Wallet size={20} className="text-slate-200" />
            </div>
          </div>

          {/* ROA / ROE */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
            <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4 flex items-center gap-2 mb-6">
              <Percent size={16} /> Rentabilidad Aproximada (anualizada)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">ROA aproximado</p>
                <p className="text-2xl font-black text-[#14532D]">{pct(data.roaAnualizadoPct)}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-2">Utilidad anualizada / Activos totales</p>
              </div>
              <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-1">ROE estricto (Clase 3 solamente)</p>
                <p className="text-2xl font-black text-amber-800">{pct(data.roeEstrictoAnualizadoPct)}</p>
                <p className="text-[9px] font-bold text-amber-700/70 mt-2 flex items-start gap-1">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                  Patrimonio contable muy bajo ({money(data.patrimonio)}) frente a los activos -- este % no es representativo, revisar con contador.
                </p>
              </div>
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">ROE ajustado (Patrimonio + Utilidad)</p>
                <p className="text-2xl font-black text-slate-800">{pct(data.roeAjustadoAnualizadoPct)}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-2">Utilidad anualizada / (Patrimonio + Utilidad no distribuida)</p>
              </div>
            </div>
            <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
              <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[10px] font-bold text-blue-700 leading-relaxed">
                Cifras autogeneradas a partir del Catálogo Único de Cuentas (CUC-SEPS) real, no validadas aún
                por un contador/auditor externo. ROA y ROE son <strong>anualizaciones simples</strong>
                (× 12 / meses transcurridos) sobre datos parciales del ejercicio ({data.mesesTranscurridos} de
                12 meses) -- pueden variar significativamente al cierre del año. Ver metodología completa en
                MANUALES/11_UTILIDAD_RENTABILIDAD.md.
              </p>
            </div>
          </div>

          {/* Calidad de datos -- siempre visible, no se oculta */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 printable-area">
            <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4 flex items-center gap-2 mb-6">
              <ShieldAlert size={16} /> Hallazgos de Calidad de Datos
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Líneas de diario aún no mayorizadas</p>
                <p className="text-xl font-black text-slate-800">{data.calidadDatos.lineasNoMayorizadas} líneas · {money(data.calidadDatos.montoNoMayorizado)}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-2">Excluidas del cálculo de utilidad (no son saldo en firme)</p>
              </div>
              <div className="p-6 bg-red-50 rounded-2xl border border-red-100">
                <p className="text-[9px] font-black text-red-600 uppercase tracking-wider mb-1">Comprobantes anulados con líneas aún mayorizadas</p>
                <p className="text-xl font-black text-red-800">{data.calidadDatos.detalleComprobantesAnuladosPosteados.length} líneas</p>
                <p className="text-[9px] font-bold text-red-500/70 mt-2">No afecta la utilidad (no tocan clase 4/5) pero sí podría distorsionar saldos de balance -- ver detalle</p>
              </div>
            </div>

            {data.calidadDatos.detalleComprobantesAnuladosPosteados.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-4 py-3 text-left">Comprobante</th>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-left">Detalle</th>
                      <th className="px-4 py-3 text-left">Cuenta</th>
                      <th className="px-4 py-3 text-center">D/C</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.calidadDatos.detalleComprobantesAnuladosPosteados.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-black text-red-700 text-[11px]">{c.comprobante}</td>
                        <td className="px-4 py-3 font-bold text-slate-500 text-[10px] whitespace-nowrap">{formatFecha(c.fecha)}</td>
                        <td className="px-4 py-3 font-bold text-slate-600 text-[10px] max-w-[220px] truncate">{c.detalle}</td>
                        <td className="px-4 py-3 font-bold text-slate-500 text-[10px]">{c.cuenta.trim()} · {c.nombreCuenta.trim()}</td>
                        <td className="px-4 py-3 text-center font-black text-[10px]">{c.tipoAsiento}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-800 text-[11px]">{money(c.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const ValidacionBadge: React.FC<{ ok: boolean; titulo: string; detalleOk: string; detalleFalla: string }> = ({ ok, titulo, detalleOk, detalleFalla }) => (
  <div className={`p-6 rounded-2xl border shadow-sm flex items-start gap-4 ${ok ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${ok ? 'bg-white text-emerald-600' : 'bg-white text-red-600'}`}>
      {ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
    </div>
    <div>
      <p className={`text-[10px] font-black uppercase tracking-widest ${ok ? 'text-emerald-700' : 'text-red-700'}`}>{titulo} {ok ? 'OK' : 'DESCUADRE'}</p>
      <p className={`text-[10px] font-bold mt-1 ${ok ? 'text-emerald-600/80' : 'text-red-600/80'}`}>{ok ? detalleOk : detalleFalla}</p>
    </div>
  </div>
);
