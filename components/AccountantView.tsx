
import React, { useState, useEffect, useCallback } from 'react';
import { ChartOfAccountEntry } from '../types';
import {
  Book, FileText, TrendingUp, ArrowDownLeft, ArrowUpRight,
  RefreshCw, Calendar, Search, Loader2, AlertCircle
} from 'lucide-react';

interface AccountantViewProps {
  chart: ChartOfAccountEntry[];
}

interface AsientoContable {
  AsientoID: number;
  CuentaContable: string;
  Concepto: string;
  Debe: number;
  Haber: number;
  NumeroCuenta: string;
  UsuarioID: string;
  FechaAsiento: string;
  NombreSocio: string;
}

interface CuentaBalance {
  CuentaContable: string;
  TotalDebe: number;
  TotalHaber: number;
  Saldo: number;
  NumAsientos: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtUSD = (n: number) => `$${fmt(n)}`;

const TABS = [
  { id: 'balance',    label: 'Balance de Comprobación', icon: <TrendingUp size={15} />    },
  { id: 'diario',     label: 'Libro Diario',             icon: <Book size={15} />          },
  { id: 'catalogo',   label: 'Plan de Cuentas',          icon: <FileText size={15} />      },
];

export const AccountantView: React.FC<AccountantViewProps> = ({ chart }) => {
  const [activeTab, setActiveTab]             = useState('balance');
  const [asientos, setAsientos]               = useState<AsientoContable[]>([]);
  const [cuentas, setCuentas]                 = useState<CuentaBalance[]>([]);
  const [totalDebe, setTotalDebe]             = useState(0);
  const [totalHaber, setTotalHaber]           = useState(0);
  const [loadingDiario, setLoadingDiario]     = useState(false);
  const [loadingBalance, setLoadingBalance]   = useState(false);
  const [error, setError]                     = useState('');
  const [searchCuenta, setSearchCuenta]       = useState('');
  const [searchDiario, setSearchDiario]       = useState('');
  const [desde, setDesde]                     = useState('');
  const [hasta, setHasta]                     = useState('');

  const fetchBalance = useCallback(async () => {
    setLoadingBalance(true);
    setError('');
    try {
      const res  = await fetch('/api/contabilidad/balance-comprobacion');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setCuentas(data.cuentas || []);
      setTotalDebe(data.totalDebe || 0);
      setTotalHaber(data.totalHaber || 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  const fetchDiario = useCallback(async () => {
    setLoadingDiario(true);
    setError('');
    try {
      const params = new URLSearchParams({ limite: '200' });
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const res  = await fetch(`/api/contabilidad/libro-diario?${params}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setAsientos(data.asientos || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingDiario(false);
    }
  }, [desde, hasta]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  useEffect(() => { if (activeTab === 'diario') fetchDiario(); }, [activeTab, fetchDiario]);

  // Totales del catálogo de cuentas (props)
  const totals = {
    assets:      chart.filter(c => c.code.startsWith('1') && c.level === 1).reduce((s, c) => s + c.balance, 0),
    liabilities: chart.filter(c => c.code.startsWith('2') && c.level === 1).reduce((s, c) => s + c.balance, 0),
    equity:      chart.filter(c => c.code.startsWith('3') && c.level === 1).reduce((s, c) => s + c.balance, 0),
  };

  const cuentasFiltradas = cuentas.filter(c =>
    !searchCuenta || c.CuentaContable.includes(searchCuenta)
  );
  const asientosFiltrados = asientos.filter(a =>
    !searchDiario ||
    a.Concepto?.toLowerCase().includes(searchDiario.toLowerCase()) ||
    a.CuentaContable?.includes(searchDiario) ||
    a.NombreSocio?.toLowerCase().includes(searchDiario.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Contabilidad Central</h2>
          <p className="text-sm text-slate-500 font-medium">Libro diario y balance SEPS en tiempo real.</p>
        </div>
        <button
          onClick={() => { fetchBalance(); if (activeTab === 'diario') fetchDiario(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#14532D] text-white rounded-xl font-bold text-xs hover:bg-[#1b5e20] transition-colors"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
            <ArrowDownLeft size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Debe</p>
            <p className="text-xl font-black text-slate-900">{fmtUSD(totalDebe)}</p>
            <p className="text-[9px] text-slate-400 font-medium">{cuentas.length} cuentas</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center shrink-0">
            <ArrowUpRight size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Haber</p>
            <p className="text-xl font-black text-slate-900">{fmtUSD(totalHaber)}</p>
            <p className={`text-[9px] font-black ${Math.abs(totalDebe - totalHaber) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
              {Math.abs(totalDebe - totalHaber) < 0.01 ? '✓ Partida doble cuadrada' : `Diferencia: ${fmtUSD(Math.abs(totalDebe - totalHaber))}`}
            </p>
          </div>
        </div>
        <div className="bg-[#14532D] p-5 rounded-[2rem] shadow-2xl text-white flex items-center gap-4 border-b-8 border-[#FACC15]">
          <div className="w-12 h-12 bg-white/10 text-[#FACC15] rounded-2xl flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-[10px] font-black text-[#FACC15]/80 uppercase tracking-widest">Patrimonio</p>
            <p className="text-xl font-black">{fmtUSD(totals.equity)}</p>
            <p className="text-[9px] text-white/50 font-medium">Plan de cuentas</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-100 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-black uppercase tracking-wider rounded-t-xl transition-all border-b-2 ${
              activeTab === t.id
                ? 'bg-white border-[#14532D] text-[#14532D] shadow-sm'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm font-medium">
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Balance de Comprobación */}
      {activeTab === 'balance' && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                placeholder="Filtrar por código de cuenta..."
                value={searchCuenta}
                onChange={e => setSearchCuenta(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:border-[#14532D] outline-none"
              />
            </div>
          </div>

          {loadingBalance ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">Cargando balance...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-4 text-left">Cuenta</th>
                    <th className="px-6 py-4 text-right">Debe</th>
                    <th className="px-6 py-4 text-right">Haber</th>
                    <th className="px-6 py-4 text-right">Saldo</th>
                    <th className="px-6 py-4 text-center">Asientos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cuentasFiltradas.map(c => (
                    <tr key={c.CuentaContable} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-black text-[#14532D] text-sm">{c.CuentaContable}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">{fmtUSD(parseFloat(String(c.TotalDebe)))}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-slate-700">{fmtUSD(parseFloat(String(c.TotalHaber)))}</td>
                      <td className={`px-6 py-3 text-right text-sm font-black ${parseFloat(String(c.Saldo)) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmtUSD(parseFloat(String(c.Saldo)))}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className="text-[10px] font-black bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{c.NumAsientos}</span>
                      </td>
                    </tr>
                  ))}
                  {cuentasFiltradas.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-12 text-slate-400 text-sm">Sin asientos contables registrados.</td></tr>
                  )}
                </tbody>
                {cuentasFiltradas.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[#14532D] bg-emerald-50">
                      <td className="px-6 py-4 font-black text-[#14532D] text-sm uppercase">TOTALES</td>
                      <td className="px-6 py-4 text-right font-black text-[#14532D]">{fmtUSD(totalDebe)}</td>
                      <td className="px-6 py-4 text-right font-black text-[#14532D]">{fmtUSD(totalHaber)}</td>
                      <td className={`px-6 py-4 text-right font-black text-sm ${Math.abs(totalDebe - totalHaber) < 0.01 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {fmtUSD(totalDebe - totalHaber)}
                      </td>
                      <td className="px-6 py-4 text-center font-black text-slate-600 text-xs">
                        {cuentas.reduce((s, c) => s + c.NumAsientos, 0)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* Libro Diario */}
      {activeTab === 'diario' && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="text"
                placeholder="Buscar por concepto, cuenta o socio..."
                value={searchDiario}
                onChange={e => setSearchDiario(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:border-[#14532D] outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-slate-400" />
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:border-[#14532D] outline-none" />
              <span className="text-slate-300 text-xs">—</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:border-[#14532D] outline-none" />
              <button onClick={fetchDiario} className="px-3 py-2 bg-[#14532D] text-white rounded-xl text-xs font-bold hover:bg-[#1b5e20] transition-colors">Filtrar</button>
            </div>
          </div>

          {loadingDiario ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm font-medium">Cargando libro diario...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-4 text-left">ID</th>
                    <th className="px-4 py-4 text-left">Fecha</th>
                    <th className="px-4 py-4 text-left">Cuenta</th>
                    <th className="px-4 py-4 text-left">Concepto</th>
                    <th className="px-4 py-4 text-left">Socio</th>
                    <th className="px-4 py-4 text-right">Debe</th>
                    <th className="px-4 py-4 text-right">Haber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {asientosFiltrados.map(a => (
                    <tr key={a.AsientoID} className="hover:bg-slate-50 transition-colors text-sm">
                      <td className="px-4 py-3 font-black text-slate-400 text-[11px]">#{a.AsientoID}</td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] whitespace-nowrap">
                        {new Date(a.FechaAsiento).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 font-black text-[#14532D] text-[11px]">{a.CuentaContable}</td>
                      <td className="px-4 py-3 text-slate-600 font-medium text-xs max-w-[220px] truncate">{a.Concepto}</td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] max-w-[140px] truncate">{a.NombreSocio}</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700 text-[11px]">
                        {parseFloat(String(a.Debe)) > 0 ? fmtUSD(parseFloat(String(a.Debe))) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-red-600 text-[11px]">
                        {parseFloat(String(a.Haber)) > 0 ? fmtUSD(parseFloat(String(a.Haber))) : '—'}
                      </td>
                    </tr>
                  ))}
                  {asientosFiltrados.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-sm">Sin asientos en el período seleccionado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Plan de Cuentas (catálogo estático) */}
      {activeTab === 'catalogo' && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-8 py-5 text-left">Código</th>
                  <th className="px-8 py-5 text-left">Denominación</th>
                  <th className="px-8 py-5 text-center">Tipo</th>
                  <th className="px-8 py-5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {chart.map(entry => (
                  <tr key={entry.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-4 font-black text-[#14532D] text-sm">{entry.code}</td>
                    <td className="px-8 py-4">
                      <div style={{ marginLeft: `${(entry.level - 1) * 20}px` }}>
                        <span className={`text-sm ${entry.level === 1 ? 'font-black text-slate-900' : 'font-bold text-slate-600'}`}>
                          {entry.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-center">
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase ${
                        entry.type === 'ASSET' ? 'bg-emerald-100 text-emerald-700' :
                        entry.type === 'LIABILITY' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>{entry.type}</span>
                    </td>
                    <td className="px-8 py-4 text-right font-black text-slate-900 text-sm">
                      {fmtUSD(entry.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
