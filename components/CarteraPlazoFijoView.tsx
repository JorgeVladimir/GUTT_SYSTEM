
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
  Ban,
  Landmark,
  Download,
  Printer,
  RefreshCw,
  Search,
  Lock,
  ShieldAlert,
  Percent,
  CalendarClock,
  Scale,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { User, UserRole } from '../types';
import { DataService } from '../services/dataService';

// Misma paleta que CarteraCreditoView.tsx / ReportsView.tsx (identidad visual única)
const COLORS = ['#14532D', '#FACC15', '#94A3B8', '#EF4444'];

// Forma exacta de fila devuelta por PlazoFijoJsonRunner (jdbc-informix), sin
// aritmética adicional: los montos se pasan tal cual llegan de Informix (DECIMAL) y
// solo se formatean al momento de renderizar.
interface PlazoFijoRow {
  id_dpf: number;
  num_dpf: number | string;
  num_socio: number | string;
  identificacion: string;
  nombres: string;
  fec_apertura: string | null;
  fec_vencimiento: string | null;
  plazo_dias: number | null;
  tasa: number;
  monto: number;
  porc_retencion: number;
  plazo_reclamo: number | null;
  num_pago_interes: number | null;
  cod_estado: number;
  estado: string;
  beneficiario: string | null;
  detalle: string | null;
  cod_oficina: number | string;
  cod_caja: string;
  cod_moneda: number | string;
}

// Reconciliación inventario (bcadpfi ACTIVO) vs contable (CUC real, familias 210136 +
// 2103), calculada en el backend por PlazoFijoReconciliacionQueries.java. Ver
// MANUALES/RECONCILIACION_PLAZO_FIJO.md para la evidencia completa de por qué se suman
// dos familias de cuentas (cambio de parámetro del sistema legado durante 2026).
interface SubcuentaSaldo {
  cuenta: string;
  saldoContable: number;
}
interface FamiliaContable {
  cuenta: string;
  nombre: string;
  saldoContable: number;
  subcuentas: SubcuentaSaldo[];
}
interface CambioParametro {
  ultimoComprobante2103: number | string | null;
  ultimaFecha2103: string | null;
  primerComprobante210136: number | string | null;
  primeraFecha210136: string | null;
  descripcion: string;
}
interface ComprobanteAnuladoDpf {
  comprobante: number | string;
  fecha: string;
  detalle: string;
  cuenta: string;
  nombreCuenta: string | null;
  tipoAsiento: string;
  valor: number;
}
interface ReconciliacionPlazoFijo {
  ejercicio: number;
  totalInventarioActivo: number;
  totalContable: number;
  diferencia: number;
  diferenciaPct: number | null;
  familiaAhorroFijo: FamiliaContable;
  familiaDepositosPlazo: FamiliaContable;
  cambioParametro: CambioParametro;
  comprobantesAnuladosConLineasPosteadas: ComprobanteAnuladoDpf[];
  nota: string;
}

export interface CarteraPlazoFijoCache {
  polizas: PlazoFijoRow[];
  reconciliacion: ReconciliacionPlazoFijo;
}

interface CarteraPlazoFijoViewProps {
  currentUser?: User;
  // Caché a nivel de App.tsx (no dentro de esta vista, que se desmonta al cambiar de
  // menú): si ya hay datos cargados, no se vuelve a consultar Informix al reentrar a
  // esta pantalla -- solo con el botón "Actualizar".
  cachedData?: CarteraPlazoFijoCache | null;
  onDataLoaded?: (data: CarteraPlazoFijoCache) => void;
}

const money = (v: unknown) =>
  `$${(Number(v) || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatFecha = (v: string | null) => {
  if (!v) return 'N/A';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Clasificación de negocio pedida explícitamente: vigente = ACTIVO + PACTADO + RENOVADO
// (no vencidos), vencida = VENCIDO, cancelada = CANCELADO. El resto (ANULADO, PENDIENTE
// EFECTIVIZAR, PENDIENTE DE PAGO) se muestra aparte como "Otros estados" -- no se oculta,
// aunque no fue parte de los 3 buckets pedidos (ej. ANULADO representa $48,300 real).
const bucketDeEstado = (estado: string): 'vigente' | 'vencida' | 'cancelada' | 'otros' => {
  const e = (estado || '').toUpperCase().trim();
  if (e === 'ACTIVO' || e === 'PACTADO' || e === 'RENOVADO') return 'vigente';
  if (e === 'VENCIDO') return 'vencida';
  if (e === 'CANCELADO') return 'cancelada';
  return 'otros';
};

const ESTADO_STYLES: Record<string, string> = {
  ACTIVO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PACTADO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RENOVADO: 'bg-blue-50 text-blue-700 border-blue-200',
  VENCIDO: 'bg-amber-50 text-amber-700 border-amber-200',
  CANCELADO: 'bg-slate-100 text-slate-500 border-slate-200',
  ANULADO: 'bg-red-50 text-red-700 border-red-200',
  'PENDIENTE EFECTIVIZAR': 'bg-purple-50 text-purple-700 border-purple-200',
  'PENDIENTE DE PAGO': 'bg-purple-50 text-purple-700 border-purple-200',
};

export const CarteraPlazoFijoView: React.FC<CarteraPlazoFijoViewProps> = ({ currentUser, cachedData, onDataLoaded }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER;
  const isManager = currentUser?.role === UserRole.MANAGER;
  const isAccountant = currentUser?.role === UserRole.ACCOUNTANT;
  // Cartera de plazo fijo es información financiera agregada de toda la cooperativa
  // (captaciones), no de un socio individual: mismo criterio de acceso que Cartera de
  // Crédito, sin CREDIT_OFFICER (no le corresponde captaciones) ni TELLER.
  const hasAccess = isAdmin || isManager || isAccountant;

  const [rows, setRows] = useState<PlazoFijoRow[]>(cachedData?.polizas || []);
  const [reconciliacion, setReconciliacion] = useState<ReconciliacionPlazoFijo | null>(cachedData?.reconciliacion || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!!cachedData);

  const loadCartera = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await DataService.getCarteraPlazoFijo();
      if (res && res.ok) {
        const polizas = Array.isArray(res.data?.polizas) ? res.data.polizas : [];
        const rec = res.data?.reconciliacion || null;
        setRows(polizas);
        setReconciliacion(rec);
        if (rec) onDataLoaded?.({ polizas, reconciliacion: rec });
      } else {
        setError(res?.error || 'No se pudo obtener la cartera de plazo fijo.');
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
    const acc = {
      vigente: 0, vencida: 0, cancelada: 0, otros: 0, total: 0,
      vigenteN: 0, vencidaN: 0, canceladaN: 0, otrosN: 0,
      vigenteTasaXMonto: 0, vencidaTasaXMonto: 0, canceladaTasaXMonto: 0,
    };
    for (const r of rows) {
      const monto = Number(r.monto) || 0;
      const tasa = Number(r.tasa) || 0;
      acc.total += monto;
      const b = bucketDeEstado(r.estado);
      if (b === 'vigente') { acc.vigente += monto; acc.vigenteN++; acc.vigenteTasaXMonto += monto * tasa; }
      else if (b === 'vencida') { acc.vencida += monto; acc.vencidaN++; acc.vencidaTasaXMonto += monto * tasa; }
      else if (b === 'cancelada') { acc.cancelada += monto; acc.canceladaN++; acc.canceladaTasaXMonto += monto * tasa; }
      else { acc.otros += monto; acc.otrosN++; }
    }
    return {
      ...acc,
      tasaPromVigente: acc.vigente > 0 ? acc.vigenteTasaXMonto / acc.vigente : 0,
      tasaPromVencida: acc.vencida > 0 ? acc.vencidaTasaXMonto / acc.vencida : 0,
      tasaPromCancelada: acc.cancelada > 0 ? acc.canceladaTasaXMonto / acc.cancelada : 0,
    };
  }, [rows]);

  const chartData = useMemo(
    () =>
      [
        { name: 'Vigente', value: summary.vigente, color: COLORS[0] },
        { name: 'Vencida', value: summary.vencida, color: COLORS[1] },
        { name: 'Cancelada', value: summary.cancelada, color: COLORS[2] },
        { name: 'Otros (Anulado/Pendiente)', value: summary.otros, color: COLORS[3] },
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
        String(r.num_dpf || '').toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

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
    a.download = `Cartera_Plazo_Fijo_${new Date().toLocaleDateString('en-CA')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!hasAccess) {
    return (
      <div className="max-w-3xl mx-auto py-20">
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center opacity-40">
          <Lock size={64} className="mx-auto mb-4" />
          <p className="font-black uppercase tracking-widest text-xs">Acceso restringido a Cartera de Plazo Fijo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Cartera de Plazo Fijo</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">GUTT SYSTEM · Depósitos a Plazo Fijo (bcadpfi) · Vigente / Vencida / Cancelada</p>
        </div>
        <button
          onClick={() => void loadCartera()}
          disabled={loading}
          className="px-6 py-3 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Consultando...' : 'Actualizar'}
        </button>
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
          <button onClick={() => void loadCartera()} className="px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shrink-0">
            Reintentar
          </button>
        </div>
      )}

      {!error && hasLoadedOnce && rows.length > 0 && (
        <>
          <div className="flex items-center justify-between px-2 no-print">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {rows.length} pólizas de depósito a plazo fijo
            </p>
          </div>

          {/* Tarjetas resumen */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="p-8 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-[#14532D] text-white rounded-2xl flex items-center justify-center mb-4 shadow-md">
                  <Landmark size={22} />
                </div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Total Captado (todas las pólizas)</p>
                <h4 className="text-2xl font-black text-slate-900">{money(summary.total)}</h4>
              </div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-6">{rows.length} pólizas de depósito a plazo fijo</p>
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
                {summary.vigenteN} pólizas · tasa prom. ponderada {summary.tasaPromVigente.toFixed(2)}%
              </p>
            </div>

            <div className="p-8 bg-amber-50 rounded-3xl border border-amber-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-amber-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <TrendingDown size={22} />
                </div>
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-1">Cartera Vencida</p>
                <h4 className="text-2xl font-black text-amber-900">{money(summary.vencida)}</h4>
              </div>
              <p className="text-[8px] font-bold text-amber-800/60 uppercase tracking-widest mt-6">
                {summary.vencidaN} pólizas · tasa prom. ponderada {summary.tasaPromVencida.toFixed(2)}%
              </p>
            </div>

            <div className="p-8 bg-slate-100 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-white text-slate-500 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <Ban size={22} />
                </div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Cartera Cancelada</p>
                <h4 className="text-2xl font-black text-slate-700">{money(summary.cancelada)}</h4>
              </div>
              <p className="text-[8px] font-bold text-slate-500/70 uppercase tracking-widest mt-6">
                {summary.canceladaN} pólizas · tasa prom. ponderada {summary.tasaPromCancelada.toFixed(2)}%
              </p>
            </div>
          </div>

          {summary.otros > 0 && (
            <div className="p-6 bg-red-50 rounded-2xl border border-red-100 shadow-sm flex items-center justify-between no-print">
              <div>
                <p className="text-[9px] font-black text-red-600 uppercase tracking-wider">Otros estados (Anulado / Pendiente Efectivizar / Pendiente de Pago)</p>
                <p className="text-lg font-black text-red-800">{money(summary.otros)} · {summary.otrosN} pólizas</p>
                <p className="text-[9px] font-bold text-red-500/70 mt-1">No forman parte de vigente/vencida/cancelada; se muestran aparte para no ocultar el dato.</p>
              </div>
              <ShieldAlert size={20} className="text-red-200" />
            </div>
          )}

          {/* Reconciliación Inventario vs Contable -- nunca se oculta, igual que el resto
              de bandas de validación del sistema (ver Utilidad y Rentabilidad). Compara el
              inventario vigente (bcadpfi ACTIVO) contra la SUMA de las cuentas contables
              210136 (Ahorro Fijo) + 2103 (Depósitos a Plazo), porque un cambio de parámetro
              del sistema legado migró el posteo de una familia a la otra durante 2026 --
              ver MANUALES/RECONCILIACION_PLAZO_FIJO.md para la evidencia completa. */}
          {reconciliacion && (
            <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 printable-area">
              <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4 flex items-center gap-2 mb-6">
                <Scale size={16} /> Reconciliación: Inventario vs. Contabilidad
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">Inventario (bcadpfi, estado ACTIVO)</p>
                  <p className="text-xl font-black text-slate-800">{money(reconciliacion.totalInventarioActivo)}</p>
                </div>
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-1">
                    Contable (210136 Ahorro Fijo + 2103 Dep. a Plazo)
                  </p>
                  <p className="text-xl font-black text-slate-800">{money(reconciliacion.totalContable)}</p>
                  <p className="text-[9px] font-bold text-slate-400 mt-1">
                    {money(reconciliacion.familiaAhorroFijo.saldoContable)} + {money(reconciliacion.familiaDepositosPlazo.saldoContable)}
                  </p>
                </div>
                <div className={`p-6 rounded-2xl border ${Math.abs(reconciliacion.diferencia) < 0.01 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${Math.abs(reconciliacion.diferencia) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    Diferencia (Contable − Inventario)
                  </p>
                  <p className={`text-xl font-black ${Math.abs(reconciliacion.diferencia) < 0.01 ? 'text-emerald-800' : 'text-amber-900'}`}>
                    {money(reconciliacion.diferencia)}
                    {reconciliacion.diferenciaPct !== null && (
                      <span className="text-xs font-bold ml-2">({reconciliacion.diferenciaPct.toFixed(2)}%)</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Evidencia del cambio de parámetro */}
              <div className="p-5 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3 mb-6">
                <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <div className="text-[11px] font-bold text-blue-700 leading-relaxed">
                  <p className="mb-1">{reconciliacion.cambioParametro.descripcion}</p>
                  <p className="text-[10px] text-blue-600/80">
                    Último posteo a 2103: comprobante {reconciliacion.cambioParametro.ultimoComprobante2103} ·{' '}
                    {formatFecha(reconciliacion.cambioParametro.ultimaFecha2103)} — Primer posteo a 210136: comprobante{' '}
                    {reconciliacion.cambioParametro.primerComprobante210136} · {formatFecha(reconciliacion.cambioParametro.primeraFecha210136)}
                  </p>
                </div>
              </div>

              {Math.abs(reconciliacion.diferencia) >= 0.01 && (
                <div className="p-5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3 mb-6">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] font-bold text-amber-700 leading-relaxed">{reconciliacion.nota}</p>
                </div>
              )}

              {/* Desglose por subcuenta (plazo) de ambas familias */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[reconciliacion.familiaAhorroFijo, reconciliacion.familiaDepositosPlazo].map(fam => (
                  <div key={fam.cuenta} className="border border-slate-100 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{fam.cuenta} · {fam.nombre}</p>
                      <p className="text-xs font-black text-slate-800">{money(fam.saldoContable)}</p>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {fam.subcuentas.map(sub => (
                        <div key={sub.cuenta} className="px-4 py-2 flex items-center justify-between text-[10px]">
                          <span className="font-bold text-slate-400">{sub.cuenta}</span>
                          <span className={`font-black ${sub.saldoContable < 0 ? 'text-red-600' : 'text-slate-700'}`}>{money(sub.saldoContable)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Comprobantes anulados pero mayorizados -- hallazgo de calidad de datos, siempre visible */}
              {reconciliacion.comprobantesAnuladosConLineasPosteadas.length > 0 && (
                <div className="mt-6 p-5 bg-red-50 border border-red-100 rounded-2xl">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShieldAlert size={14} /> Comprobantes anulados con líneas aún mayorizadas ({reconciliacion.comprobantesAnuladosConLineasPosteadas.length})
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-left text-red-400 uppercase font-black">
                          <th className="py-1 pr-3">Comprobante</th>
                          <th className="py-1 pr-3">Fecha</th>
                          <th className="py-1 pr-3">Cuenta</th>
                          <th className="py-1 pr-3 text-center">D/C</th>
                          <th className="py-1 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciliacion.comprobantesAnuladosConLineasPosteadas.map((c, i) => (
                          <tr key={i} className="text-red-800 font-bold">
                            <td className="py-1 pr-3">{c.comprobante}</td>
                            <td className="py-1 pr-3 whitespace-nowrap">{formatFecha(c.fecha)}</td>
                            <td className="py-1 pr-3">{c.cuenta.trim()} · {(c.nombreCuenta || '').trim()}</td>
                            <td className="py-1 pr-3 text-center">{c.tipoAsiento}</td>
                            <td className="py-1 text-right">{money(c.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[9px] font-bold text-red-500/70 mt-2">
                    Reclasificación entre subcuentas de la misma familia (neto cero a nivel total), pero distorsiona el desglose por plazo mostrado arriba.
                  </p>
                </div>
              )}
            </div>
          )}

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
                        formatter={(value: any) => [money(value), 'Monto']}
                        contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontFamily: 'sans-serif', fontWeight: 'bold' }}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase', fontFamily: 'sans-serif' }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4 flex items-center gap-2">
                  <Percent size={16} /> Tasas Promedio Ponderadas por Monto
                </h4>
                <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-5">
                  {[
                    { label: 'Vigente', value: summary.tasaPromVigente, color: COLORS[0] },
                    { label: 'Vencida', value: summary.tasaPromVencida, color: COLORS[1] },
                    { label: 'Cancelada', value: summary.tasaPromCancelada, color: COLORS[2] },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between items-center py-2 border-b border-slate-200/50 last:border-0">
                      <span className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </span>
                      <span className="text-sm font-black text-slate-800">{item.value.toFixed(2)}%</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-3">
                    <span className="text-[10px] font-black text-slate-700 uppercase flex items-center gap-1">
                      <CalendarClock size={14} /> % Vigente sobre Total
                    </span>
                    <span className="text-lg font-black text-[#14532D]">
                      {summary.total > 0 ? ((summary.vigente / summary.total) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de pólizas */}
          <div className="bg-white rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-slate-100 overflow-hidden printable-area">
            <div className="px-4 sm:px-8 py-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Detalle de Pólizas de Depósito a Plazo Fijo</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                  {filteredRows.length} de {rows.length} pólizas
                </p>
              </div>
              <div className="flex items-center gap-2 no-print w-full md:w-auto">
                <div className="relative flex-1 md:flex-none">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Buscar socio, cédula o póliza..."
                    className="pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#14532D] w-full md:w-64"
                  />
                </div>
                <button onClick={downloadCSV} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all" title="Descargar CSV">
                  <Download size={16} />
                </button>
                <button onClick={() => window.print()} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all" title="Imprimir / PDF">
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
                    <th className="px-5 py-4 text-left">Póliza</th>
                    <th className="px-5 py-4 text-center">Estado</th>
                    <th className="px-5 py-4 text-right">Apertura</th>
                    <th className="px-5 py-4 text-right">Vencimiento</th>
                    <th className="px-5 py-4 text-right">Plazo (días)</th>
                    <th className="px-5 py-4 text-right">Tasa</th>
                    <th className="px-5 py-4 text-right">Monto</th>
                    <th className="px-5 py-4 text-right">% Retención</th>
                    <th className="px-5 py-4 text-left">Beneficiario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredRows.map((r, i) => {
                    const estado = (r.estado || '').toString().trim().toUpperCase();
                    return (
                      <tr key={`${r.id_dpf}-${i}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-black text-slate-800 text-[11px] uppercase whitespace-nowrap">{r.nombres}</p>
                          <p className="text-[9px] font-bold text-slate-400">Socio #{r.num_socio}</p>
                        </td>
                        <td className="px-5 py-4 font-bold text-slate-600 text-[11px] whitespace-nowrap">{String(r.identificacion || '').trim()}</td>
                        <td className="px-5 py-4 font-black text-[#14532D] text-[11px] whitespace-nowrap">{r.num_dpf}</td>
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-lg border font-black text-[9px] whitespace-nowrap ${ESTADO_STYLES[estado] || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {estado || 'N/A'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[10px] whitespace-nowrap">{formatFecha(r.fec_apertura)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[10px] whitespace-nowrap">{formatFecha(r.fec_vencimiento)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-600 text-[11px] whitespace-nowrap">{r.plazo_dias ?? 'N/A'}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[11px] whitespace-nowrap">{(Number(r.tasa) || 0).toFixed(2)}%</td>
                        <td className="px-5 py-4 text-right font-black text-slate-900 text-[11px] whitespace-nowrap">{money(r.monto)}</td>
                        <td className="px-5 py-4 text-right font-bold text-slate-500 text-[11px] whitespace-nowrap">{(Number(r.porc_retencion) || 0).toFixed(2)}%</td>
                        <td className="px-5 py-4 font-bold text-slate-500 text-[10px] max-w-[180px] truncate">{r.beneficiario || 'N/A'}</td>
                      </tr>
                    );
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-5 py-16 text-center text-slate-300">
                        <Search size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-black uppercase tracking-widest text-xs">Sin resultados para la búsqueda actual</p>
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#14532D] bg-emerald-50 font-black sticky bottom-0">
                      <td className="px-5 py-4 text-[#14532D] text-[10px] uppercase" colSpan={8}>Total (todas las pólizas)</td>
                      <td className="px-5 py-4 text-right text-slate-900 text-[11px]">{money(summary.total)}</td>
                      <td className="px-5 py-4" colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {!error && hasLoadedOnce && rows.length === 0 && (
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center">
          <Landmark size={64} className="mx-auto mb-4 text-slate-200" />
          <p className="font-black uppercase tracking-widest text-xs text-slate-400">No hay pólizas de depósito a plazo fijo registradas</p>
        </div>
      )}
    </div>
  );
};
