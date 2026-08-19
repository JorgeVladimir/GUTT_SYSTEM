
import React, { useEffect, useMemo, useState } from 'react';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  Gavel,
  Ban,
  Landmark,
  Download,
  Printer,
  RefreshCw,
  Search,
  Calendar,
  Lock,
  ShieldAlert,
  Wallet,
  FileBarChart,
  LayoutList,
  Info,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { DataService } from '../services/dataService';

// Paleta reutilizada de ReportsView.tsx (misma identidad visual en toda la app)
const COLORS = ['#14532D', '#FACC15', '#2563EB', '#7C3AED', '#EC4899'];

// Forma exacta de fila devuelta por CarteraJsonRunner (jdbc-informix), sin transformar montos
// con aritmética adicional: se pasan tal cual llegan de Informix (DECIMAL) y solo se formatean
// (toFixed/toLocaleString) al momento de renderizar.
interface CarteraCreditoRow {
  num_socio: string | number;
  identificacion: string;
  nombres: string;
  num_operacion: string | number;
  cap_concedido: number;
  fec_concesion: string | null;
  fec_vencimiento: string | null;
  plazo_dias: number | null;
  tasa: number;
  calificacion: string;
  saldo_vigente: number;
  saldo_vencido: number;
  saldo_demandado: number;
  saldo_castigado: number;
  saldo_total: number;
  cap_recuperado: number;
  int_recuperado: number;
  mora_recuperada: number;
  provision_requerida: number;
  linea_credito: string | null;
  // Rubros adicionales (ver sql/cartera_credito_template.sql en jdbc-informix, sección
  // "AMPLIADO 2026-08-02"): comisión de desembolso 3% (única, capitalizada en
  // cap_concedido) y cargo fijo de $1 por letra/cuota (recurrente, bcarubr código 18
  // "AHORRO PROGRAMADO" -- pese al nombre del catálogo, es un cargo de ingreso, no un
  // ahorro; postea a la cuenta 549.00.5.12 "Ingreso por Gestión").
  cap_solicitado: number;
  comision_desembolso_3pct: number;
  cargo_letra_recuperado: number;
}

// Fila cruda de ReportQueries.carteraPorLineaAntiguedad() (jdbc-informix), una por
// crédito calificado a la fecha de corte. El agrupamiento por OBL (línea+situación) y
// por bucket de antigüedad se hace en el frontend, ver useMemo `porLineaAntiguedad`
// más abajo. Ver sql/cartera_credito_linea_antiguedad_template.sql para el detalle de
// qué es "OBL" (código de cuenta CUC por línea/situación, no bcaccre.ccre_cod_ccre).
interface LineaAntiguedadRow {
  num_cred: number | string;
  cod_linea: number | string;
  linea_nombre: string;
  obl_normal: string;
  obl_vencida: string;
  obl_no_devenga: string;
  obl_demandada: string;
  obl_reest_venc: string;
  obl_reest_no_dev: string;
  val_normal: number;
  val_vencida: number;
  val_no_devenga: number;
  val_demandada: number;
  val_castigada: number;
  dias_vencido: number | null;
  provision: number;
  interes_mora: number;
  prox_vencimiento: string | null;
}

type BucketAntiguedad = 'Hasta 30d' | 'Hasta 90d' | 'Hasta 180d' | 'Hasta 360d' | 'Más de 360d' | 'Sin plazo';

const bucketPorDias = (dias: number | null): BucketAntiguedad => {
  if (dias === null || dias === undefined || isNaN(dias)) return 'Sin plazo';
  if (dias <= 30) return 'Hasta 30d';
  if (dias <= 90) return 'Hasta 90d';
  if (dias <= 180) return 'Hasta 180d';
  if (dias <= 360) return 'Hasta 360d';
  return 'Más de 360d';
};

export interface CarteraCreditoCache {
  fechaCorte: string;
  operaciones: CarteraCreditoRow[];
  porLineaAntiguedad: LineaAntiguedadRow[];
}

interface CarteraCreditoViewProps {
  currentUser?: User;
  // Caché a nivel de App.tsx (no dentro de esta vista, que se desmonta al cambiar de
  // menú): si ya hay datos cargados para esta sesión, no se vuelve a consultar
  // Informix al reentrar -- solo con el botón "Actualizar".
  cachedData?: CarteraCreditoCache | null;
  onDataLoaded?: (data: CarteraCreditoCache) => void;
}

const money = (v: unknown) =>
  `$${(Number(v) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatFecha = (v: string | null) => {
  if (!v) return 'N/A';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
};

const CALIFICACION_STYLES: Record<string, string> = {
  A: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  B: 'bg-blue-50 text-blue-700 border-blue-200',
  C: 'bg-amber-50 text-amber-700 border-amber-200',
  D: 'bg-orange-50 text-orange-700 border-orange-200',
  E: 'bg-red-50 text-red-700 border-red-200',
};

const todayEC = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

export const CarteraCreditoView: React.FC<CarteraCreditoViewProps> = ({ currentUser, cachedData, onDataLoaded }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER;
  const isManager = currentUser?.role === UserRole.MANAGER;
  const isAccountant = currentUser?.role === UserRole.ACCOUNTANT;
  const isCreditOfficer = currentUser?.role === UserRole.CREDIT_OFFICER;
  // Cartera de crédito es información financiera agregada de toda la cooperativa: solo roles con
  // responsabilidad institucional/de riesgo la ven (no socios, no cajeros de ventanilla).
  const hasAccess = isAdmin || isManager || isAccountant || isCreditOfficer;

  const [rows, setRows] = useState<CarteraCreditoRow[]>(cachedData?.operaciones || []);
  const [lineaRows, setLineaRows] = useState<LineaAntiguedadRow[]>(cachedData?.porLineaAntiguedad || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fechaCorte, setFechaCorte] = useState<string>(cachedData?.fechaCorte || '');
  const [fechaInput, setFechaInput] = useState<string>(cachedData?.fechaCorte || todayEC());
  const [searchQuery, setSearchQuery] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!!cachedData);
  const [vistaTabla, setVistaTabla] = useState<'CALIFICACION' | 'LINEA_ANTIGUEDAD'>('CALIFICACION');

  const loadCartera = async (fecha?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await DataService.getCarteraCredito(fecha);
      if (res && res.ok) {
        const operaciones = Array.isArray(res.data?.operaciones) ? res.data.operaciones : [];
        const porLineaAntiguedad = Array.isArray(res.data?.porLineaAntiguedad) ? res.data.porLineaAntiguedad : [];
        const fc = res.fecha || res.data?.fechaCorte || fecha || todayEC();
        setRows(operaciones);
        setLineaRows(porLineaAntiguedad);
        setFechaCorte(fc);
        onDataLoaded?.({ fechaCorte: fc, operaciones, porLineaAntiguedad });
      } else {
        setError(res?.error || 'No se pudo obtener la cartera de crédito.');
      }
    } catch (e) {
      setError('Error de conexión al consultar Informix. La consulta puede tardar hasta 40 segundos por ser en vivo sobre el core bancario legado; intente nuevamente.');
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    // Si App.tsx ya tiene datos en caché de una visita anterior a esta pantalla en esta
    // misma sesión, no se vuelve a consultar Informix -- solo con el botón "Actualizar".
    if (hasAccess && !cachedData) void loadCartera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.vigente += Number(r.saldo_vigente) || 0;
        acc.vencido += Number(r.saldo_vencido) || 0;
        acc.demandado += Number(r.saldo_demandado) || 0;
        acc.castigado += Number(r.saldo_castigado) || 0;
        acc.total += Number(r.saldo_total) || 0;
        acc.provision += Number(r.provision_requerida) || 0;
        acc.capRecuperado += Number(r.cap_recuperado) || 0;
        acc.intRecuperado += Number(r.int_recuperado) || 0;
        acc.moraRecuperada += Number(r.mora_recuperada) || 0;
        acc.comisionDesembolso += Number(r.comision_desembolso_3pct) || 0;
        acc.cargoLetraRecuperado += Number(r.cargo_letra_recuperado) || 0;
        return acc;
      },
      {
        vigente: 0, vencido: 0, demandado: 0, castigado: 0, total: 0, provision: 0,
        capRecuperado: 0, intRecuperado: 0, moraRecuperada: 0,
        comisionDesembolso: 0, cargoLetraRecuperado: 0,
      }
    );
  }, [rows]);

  const chartData = useMemo(
    () =>
      [
        { name: 'Vigente', value: summary.vigente, color: COLORS[0] },
        { name: 'Vencido', value: summary.vencido, color: COLORS[1] },
        { name: 'Demandado', value: summary.demandado, color: COLORS[2] },
        { name: 'Castigado', value: summary.castigado, color: COLORS[3] },
      ].filter(d => d.value > 0),
    [summary]
  );

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(
      r =>
        String(r.nombres || '').toLowerCase().includes(q) ||
        String(r.identificacion || '').toLowerCase().includes(q) ||
        String(r.num_socio || '').toLowerCase().includes(q) ||
        String(r.num_operacion || '').toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  // Vista "por línea (OBL) y antigüedad", réplica del reporte legado "ANEXO LINEAS" --
  // ver sql/cartera_credito_linea_antiguedad_template.sql para qué es "OBL". Cada crédito
  // puede aportar a más de un OBL/bucket (ej. capital por vencer + capital en mora del
  // mismo crédito son montos distintos), por eso se recorren los 5 campos de valor por
  // separado en vez de asumir un solo bucket por fila.
  const diasEntre = (desde: string, hasta: string | null): number | null => {
    if (!hasta) return null;
    const a = new Date(desde).getTime();
    const b = new Date(hasta).getTime();
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  };

  const porLineaAntiguedad = useMemo(() => {
    const grupos = new Map<string, {
      obl: string; situacion: string; linea: string; bucket: BucketAntiguedad;
      capital: number; provision: number; interesMora: number; nOperaciones: number;
    }>();

    const acumular = (obl: string, situacion: string, linea: string, bucket: BucketAntiguedad, capital: number, provision: number, interesMora: number) => {
      if (capital <= 0) return;
      const key = `${obl}__${bucket}`;
      const prev = grupos.get(key);
      if (prev) {
        prev.capital += capital;
        prev.provision += provision;
        prev.interesMora += interesMora;
        prev.nOperaciones += 1;
      } else {
        grupos.set(key, { obl, situacion, linea, bucket, capital, provision, interesMora, nOperaciones: 1 });
      }
    };

    for (const r of lineaRows) {
      const dias = diasEntre(fechaCorte || todayEC(), r.prox_vencimiento);
      const bucketPorVencer = bucketPorDias(dias);
      const bucketVencido = bucketPorDias(r.dias_vencido);

      acumular(r.obl_normal, 'Por Vencer', r.linea_nombre, bucketPorVencer, Number(r.val_normal) || 0, Number(r.provision) || 0, 0);
      acumular(r.obl_no_devenga, 'No Devenga Interés', r.linea_nombre, bucketPorVencer, Number(r.val_no_devenga) || 0, Number(r.provision) || 0, 0);
      acumular(r.obl_vencida, 'Vencida', r.linea_nombre, bucketVencido, Number(r.val_vencida) || 0, Number(r.provision) || 0, Number(r.interes_mora) || 0);
      acumular(r.obl_demandada, 'Demandada', r.linea_nombre, 'Sin plazo', Number(r.val_demandada) || 0, Number(r.provision) || 0, 0);
      acumular('N/A', 'Castigada', r.linea_nombre, 'Sin plazo', Number(r.val_castigada) || 0, 0, 0);
    }

    return Array.from(grupos.values()).sort((a, b) => a.obl.localeCompare(b.obl) || a.bucket.localeCompare(b.bucket));
  }, [lineaRows, fechaCorte]);

  const totalesLineaAntiguedad = useMemo(() => {
    return porLineaAntiguedad.reduce(
      (acc, g) => {
        acc.capital += g.capital;
        acc.provision += g.provision;
        acc.interesMora += g.interesMora;
        return acc;
      },
      { capital: 0, provision: 0, interesMora: 0 }
    );
  }, [porLineaAntiguedad]);

  const downloadCSV = () => {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const header = cols.join(';');
    const csvRows = rows.map(row => cols.map(c => String((row as any)[c] ?? '').replace(/;/g, ',')).join(';'));
    const csv = '﻿' + [header, ...csvRows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Cartera_Credito_${fechaCorte || todayEC()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasAccess) {
    return (
      <div className="max-w-3xl mx-auto py-20">
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center opacity-40">
          <Lock size={64} className="mx-auto mb-4" />
          <p className="font-black uppercase tracking-widest text-xs">Acceso restringido a Cartera de Crédito</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Cartera de Crédito</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GUTT SYSTEM · Vigente / Vencido / Demandado / Castigado</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
            <input
              type="date"
              value={fechaInput}
              onChange={e => setFechaInput(e.target.value)}
              className="pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl font-black text-[#14532D] text-xs outline-none focus:border-[#14532D] shadow-sm"
            />
          </div>
          <button
            onClick={() => void loadCartera(fechaInput)}
            disabled={loading}
            className="px-6 py-3 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Consultando...' : 'Actualizar'}
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
            <p className="font-black text-red-700 text-sm uppercase tracking-wide">No se pudo cargar la cartera</p>
            <p className="text-xs font-bold text-red-500 mt-1">{error}</p>
          </div>
          <button onClick={() => void loadCartera(fechaInput)} className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {!error && hasLoadedOnce && rows.length > 0 && (
        <>
          {/* Fecha de corte y conteo */}
          <div className="flex items-center justify-between px-2 no-print">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Fecha de corte: <span className="text-[#14532D]">{formatFecha(fechaCorte)}</span> · {rows.length} operaciones
            </p>
          </div>

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-[#14532D] text-white rounded-2xl flex items-center justify-center mb-4 shadow-md">
                  <Landmark size={22} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Total Cartera</p>
                <h4 className="text-2xl font-black text-slate-900">{money(summary.total)}</h4>
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-6">Suma de saldos vigente + vencido + demandado + castigado</p>
            </div>

            <div className="p-8 bg-emerald-50 rounded-3xl border border-emerald-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-[#14532D] rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <TrendingUp size={22} />
                </div>
                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1">Cartera Vigente</p>
                <h4 className="text-2xl font-black text-[#14532D]">{money(summary.vigente)}</h4>
              </div>
              <p className="text-[8px] font-bold text-emerald-700/60 uppercase tracking-widest mt-6">
                {summary.total > 0 ? ((summary.vigente / summary.total) * 100).toFixed(1) : '0.0'}% de la cartera total
              </p>
            </div>

            <div className="p-8 bg-amber-50 rounded-3xl border border-amber-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-amber-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <TrendingDown size={22} />
                </div>
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-1">Cartera Vencida</p>
                <h4 className="text-2xl font-black text-amber-900">{money(summary.vencido)}</h4>
              </div>
              <p className="text-[8px] font-bold text-amber-800/60 uppercase tracking-widest mt-6">
                {summary.total > 0 ? ((summary.vencido / summary.total) * 100).toFixed(1) : '0.0'}% de la cartera total
              </p>
            </div>

            <div className="p-8 bg-red-50 rounded-3xl border border-red-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-red-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <Ban size={22} />
                </div>
                <p className="text-[9px] font-black text-red-600 uppercase tracking-wider mb-1">Cartera Castigada</p>
                <h4 className="text-2xl font-black text-red-900">{money(summary.castigado)}</h4>
              </div>
              <p className="text-[8px] font-bold text-red-800/60 uppercase tracking-widest mt-6">
                {summary.total > 0 ? ((summary.castigado / summary.total) * 100).toFixed(1) : '0.0'}% de la cartera total
              </p>
            </div>
          </div>

          {/* Fila secundaria de indicadores */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cartera Demandada</p>
                <p className="text-lg font-black text-blue-700">{money(summary.demandado)}</p>
              </div>
              <Gavel size={20} className="text-blue-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Provisión Requerida</p>
                <p className="text-lg font-black text-slate-800">{money(summary.provision)}</p>
              </div>
              <ShieldAlert size={20} className="text-slate-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Capital + Interés Recuperado</p>
                <p className="text-lg font-black text-slate-800">{money(summary.capRecuperado + summary.intRecuperado)}</p>
              </div>
              <Wallet size={20} className="text-slate-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Mora Recuperada</p>
                <p className="text-lg font-black text-slate-800">{money(summary.moraRecuperada)}</p>
              </div>
              <FileBarChart size={20} className="text-slate-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Comisión Desembolso (3%)</p>
                <p className="text-lg font-black text-slate-800">{money(summary.comisionDesembolso)}</p>
              </div>
              <Wallet size={20} className="text-slate-200" />
            </div>
            <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cargo por Letra ($1) Recuperado</p>
                <p className="text-lg font-black text-slate-800">{money(summary.cargoLetraRecuperado)}</p>
              </div>
              <FileBarChart size={20} className="text-slate-200" />
            </div>
          </div>

          {/* Gráfico de composición */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4 flex items-center gap-2">
                  <PieChart size={16} /> Composición de la Cartera
                </h4>
                <div className="h-[300px] flex items-center justify-center bg-slate-50 border border-slate-100 rounded-[2.5rem] p-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) => [money(value), 'Saldo']}
                        contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontFamily: 'sans-serif', fontWeight: 'bold' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase', fontFamily: 'sans-serif' }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4">Detalle de Riesgo de Cartera</h4>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-5">
                  {[
                    { label: 'Vigente', value: summary.vigente, color: COLORS[0] },
                    { label: 'Vencido', value: summary.vencido, color: COLORS[1] },
                    { label: 'Demandado', value: summary.demandado, color: COLORS[2] },
                    { label: 'Castigado', value: summary.castigado, color: COLORS[3] },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center py-2 border-b border-slate-200/50 last:border-0">
                      <span className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </span>
                      <span className="text-sm font-black text-slate-800">{money(item.value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-3">
                    <span className="text-[10px] font-black text-slate-700 uppercase">Índice de Morosidad</span>
                    <span className="text-lg font-black text-[#14532D]">
                      {summary.total > 0 ? (((summary.vencido + summary.demandado + summary.castigado) / summary.total) * 100).toFixed(2) : '0.00'}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Selector de vista de tabla: por calificación (A-1/A-2/...) o por línea (OBL) +
              antigüedad, réplica del reporte legado "ANEXO LINEAS" -- ver
              sql/cartera_credito_linea_antiguedad_template.sql. No dispara nueva consulta a
              Informix, es la misma data ya cargada agrupada distinto. */}
          <div className="flex items-center gap-2 no-print px-2">
            <button
              onClick={() => setVistaTabla('CALIFICACION')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                vistaTabla === 'CALIFICACION' ? 'bg-[#14532D] text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              Por Calificación
            </button>
            <button
              onClick={() => setVistaTabla('LINEA_ANTIGUEDAD')}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                vistaTabla === 'LINEA_ANTIGUEDAD' ? 'bg-[#14532D] text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              <LayoutList size={12} /> Por Línea y Antigüedad
            </button>
          </div>

          {vistaTabla === 'LINEA_ANTIGUEDAD' && (
            <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden printable-area">
              <div className="px-4 sm:px-8 py-6 border-b border-slate-100">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Cartera por Línea (OBL) y Antigüedad</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                  Fecha de calificación {formatFecha(fechaCorte)} · réplica del reporte legado "ANEXO LINEAS"
                </p>
              </div>
              <div className="p-4 sm:p-6 bg-blue-50 border-b border-blue-100 flex items-start gap-3">
                <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-blue-700 leading-relaxed">
                  "OBL" es el código de cuenta contable (CUC) asociado a la línea de crédito y su situación
                  (bcaccre.ccre_nor_ccon / ccre_ven_ccon / ccre_rie_ccon / ccre_rel_ccon), no un catálogo aparte.
                  El total de capital reconstruido con esta agrupación coincidió exacto con el total operativo
                  del Anexo Líneas al verificar este módulo. Ver MANUALES/09_CARTERA_CREDITO.md sección de
                  reconciliación para el detalle y el contraste contra el saldo de las cuentas contables.
                </p>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b sticky top-0 z-10">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-5 py-4 text-left">OBL</th>
                      <th className="px-5 py-4 text-left">Línea</th>
                      <th className="px-5 py-4 text-left">Situación</th>
                      <th className="px-5 py-4 text-left">Antigüedad</th>
                      <th className="px-5 py-4 text-right"># Créditos</th>
                      <th className="px-5 py-4 text-right">Capital</th>
                      <th className="px-5 py-4 text-right">Provisión</th>
                      <th className="px-5 py-4 text-right">Interés en Mora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {porLineaAntiguedad.map((g, i) => (
                      <tr key={`${g.obl}-${g.bucket}-${i}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 font-black text-[#14532D] text-[11px] whitespace-nowrap">{g.obl}</td>
                        <td className="px-5 py-3 font-bold text-slate-600 text-[10px] whitespace-nowrap max-w-[160px] truncate">{g.linea}</td>
                        <td className="px-5 py-3 font-bold text-slate-500 text-[10px] whitespace-nowrap">{g.situacion}</td>
                        <td className="px-5 py-3 font-bold text-slate-500 text-[10px] whitespace-nowrap">{g.bucket}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-500 text-[11px]">{g.nOperaciones}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-900 text-[11px] whitespace-nowrap">{money(g.capital)}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-500 text-[11px] whitespace-nowrap">{money(g.provision)}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-500 text-[11px] whitespace-nowrap">{money(g.interesMora)}</td>
                      </tr>
                    ))}
                    {porLineaAntiguedad.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-5 py-16 text-center text-slate-300">
                          <LayoutList size={40} className="mx-auto mb-3 opacity-30" />
                          <p className="font-black uppercase tracking-widest text-xs">Sin datos para esta fecha de corte</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {porLineaAntiguedad.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-[#14532D] bg-emerald-50 font-black sticky bottom-0">
                        <td className="px-5 py-4 text-[#14532D] text-[10px] uppercase" colSpan={5}>Total</td>
                        <td className="px-5 py-4 text-right text-slate-900 text-[11px]">{money(totalesLineaAntiguedad.capital)}</td>
                        <td className="px-5 py-4 text-right text-slate-700 text-[11px]">{money(totalesLineaAntiguedad.provision)}</td>
                        <td className="px-5 py-4 text-right text-slate-700 text-[11px]">{money(totalesLineaAntiguedad.interesMora)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Tabla de operaciones (por calificación) */}
          {vistaTabla === 'CALIFICACION' && (
          <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden printable-area">
            <div className="px-4 sm:px-8 py-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Detalle de Operaciones de Crédito</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                  {filteredRows.length} de {rows.length} operaciones · Fecha de corte {formatFecha(fechaCorte)}
                </p>
              </div>
              <div className="flex items-center gap-2 no-print w-full md:w-auto">
                <div className="relative flex-1 md:flex-none">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar socio, cédula u operación..."
                    className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#14532D] w-full md:w-64"
                  />
                </div>
                <button
                  onClick={downloadCSV}
                  className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
                  title="Descargar CSV"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => window.print()}
                  className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all"
                  title="Imprimir / PDF"
                >
                  <Printer size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b sticky top-0 z-10">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-5 py-4 text-left">Socio</th>
                    <th className="px-5 py-4 text-left">Identificación</th>
                    <th className="px-5 py-4 text-left">Operación</th>
                    <th className="px-5 py-4 text-left">Línea</th>
                    <th className="px-5 py-4 text-center">Calif.</th>
                    <th className="px-5 py-4 text-right">Concesión</th>
                    <th className="px-5 py-4 text-right">Vencimiento</th>
                    <th className="px-5 py-4 text-right">Capital</th>
                    <th className="px-5 py-4 text-right">Comisión 3%</th>
                    <th className="px-5 py-4 text-right">Tasa</th>
                    <th className="px-5 py-4 text-right">Vigente</th>
                    <th className="px-5 py-4 text-right">Vencido</th>
                    <th className="px-5 py-4 text-right">Demandado</th>
                    <th className="px-5 py-4 text-right">Castigado</th>
                    <th className="px-5 py-4 text-right">Total</th>
                    <th className="px-5 py-4 text-right">Cargo Letra ($1)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRows.map((r, i) => {
                    const calif = (r.calificacion || '').toString().trim().toUpperCase();
                    return (
                      <tr key={`${r.num_operacion}-${i}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-800 text-[11px] uppercase whitespace-nowrap">{r.nombres}</p>
                          <p className="text-[9px] font-bold text-slate-400">Socio #{r.num_socio}</p>
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-600 text-[11px] whitespace-nowrap">{String(r.identificacion || '').trim()}</td>
                        <td className="px-5 py-4 font-black text-[#14532D] text-[11px] whitespace-nowrap">{r.num_operacion}</td>
                        <td className="px-5 py-4 font-bold text-slate-500 text-[10px] whitespace-nowrap max-w-[160px] truncate">{r.linea_credito || 'N/A'}</td>
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg border font-black text-[10px] ${CALIFICACION_STYLES[calif] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {calif || 'N/A'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[10px] whitespace-nowrap">{formatFecha(r.fec_concesion)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[10px] whitespace-nowrap">{formatFecha(r.fec_vencimiento)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-700 text-[11px] whitespace-nowrap">{money(r.cap_concedido)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[11px] whitespace-nowrap">{money(r.comision_desembolso_3pct)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[11px] whitespace-nowrap">{(Number(r.tasa) || 0).toFixed(2)}%</td>
                        <td className="px-5 py-4 text-right font-black text-emerald-700 text-[11px] whitespace-nowrap">{money(r.saldo_vigente)}</td>
                        <td className="px-5 py-4 text-right font-black text-amber-700 text-[11px] whitespace-nowrap">{money(r.saldo_vencido)}</td>
                        <td className="px-5 py-4 text-right font-black text-blue-700 text-[11px] whitespace-nowrap">{money(r.saldo_demandado)}</td>
                        <td className="px-5 py-4 text-right font-black text-red-700 text-[11px] whitespace-nowrap">{money(r.saldo_castigado)}</td>
                        <td className="px-5 py-4 text-right font-black text-slate-900 text-[11px] whitespace-nowrap">{money(r.saldo_total)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[11px] whitespace-nowrap">{money(r.cargo_letra_recuperado)}</td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={16} className="px-5 py-16 text-center text-slate-300">
                        <Search size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-black uppercase tracking-widest text-xs">Sin resultados para la búsqueda actual</p>
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#14532D] bg-emerald-50 font-black sticky bottom-0">
                      <td className="px-5 py-4 text-[#14532D] text-[10px] uppercase" colSpan={8}>Totales (todas las operaciones)</td>
                      <td className="px-5 py-4 text-right text-slate-700 text-[11px]">{money(summary.comisionDesembolso)}</td>
                      <td className="px-5 py-4 text-right text-slate-400 text-[11px]"></td>
                      <td className="px-5 py-4 text-right text-emerald-700 text-[11px]">{money(summary.vigente)}</td>
                      <td className="px-5 py-4 text-right text-amber-700 text-[11px]">{money(summary.vencido)}</td>
                      <td className="px-5 py-4 text-right text-blue-700 text-[11px]">{money(summary.demandado)}</td>
                      <td className="px-5 py-4 text-right text-red-700 text-[11px]">{money(summary.castigado)}</td>
                      <td className="px-5 py-4 text-right text-slate-900 text-[11px]">{money(summary.total)}</td>
                      <td className="px-5 py-4 text-right text-slate-700 text-[11px]">{money(summary.cargoLetraRecuperado)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          )}
        </>
      )}

      {!error && hasLoadedOnce && rows.length === 0 && (
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center">
          <Landmark size={64} className="mx-auto mb-4 text-slate-200" />
          <p className="font-black uppercase tracking-widest text-xs text-slate-400">No hay operaciones de crédito para la fecha de corte seleccionada</p>
        </div>
      )}
    </div>
  );
};
