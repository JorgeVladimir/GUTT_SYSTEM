
import React from 'react';
import { ChartOfAccountEntry } from '../types';
import { Book, FileText, ChevronDown, Plus, TrendingUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface AccountantViewProps {
  chart: ChartOfAccountEntry[];
}

export const AccountantView: React.FC<AccountantViewProps> = ({ chart }) => {
  const totals = {
    assets: chart.filter(c => c.code.startsWith('1') && c.level === 1).reduce((acc, c) => acc + c.balance, 0),
    liabilities: chart.filter(c => c.code.startsWith('2') && c.level === 1).reduce((acc, c) => acc + c.balance, 0),
    equity: chart.filter(c => c.code.startsWith('3') && c.level === 1).reduce((acc, c) => acc + c.balance, 0),
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Plan de Cuentas Nacional</h2>
          <p className="text-sm text-slate-500 font-medium">Saldos dinámicos basados en operaciones de Caja y Crédito.</p>
        </div>
        <div className="flex gap-2">
          <button className="bg-[#14532D] text-white px-6 py-3 rounded-2xl font-black text-xs uppercase shadow-xl flex items-center gap-2 border-b-4 border-emerald-900 active:translate-y-1 transition-all">
            <Plus size={16} /> Agregar Subcuenta
          </button>
        </div>
      </div>

      {/* Mini Dashboard Contable */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <ArrowDownLeft size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Activos (1)</p>
            <p className="text-2xl font-black text-slate-900">${totals.assets.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
            <ArrowUpRight size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pasivos (2)</p>
            <p className="text-2xl font-black text-slate-900">${Math.abs(totals.liabilities).toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-[#14532D] p-6 rounded-[2.5rem] shadow-2xl text-white flex items-center gap-4 border-b-8 border-[#FACC15]">
          <div className="w-12 h-12 bg-white/10 text-[#FACC15] rounded-2xl flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black text-emerald-300 uppercase tracking-widest">Patrimonio (3)</p>
            <p className="text-2xl font-black">${totals.equity.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <input type="text" placeholder="Buscar en el catálogo contable..." className="w-full pl-12 pr-6 py-4 bg-white border-2 border-slate-200 rounded-2xl focus:border-[#14532D] outline-none font-bold text-slate-700 transition-all" />
            <Book size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100">
                <th className="px-8 py-6 text-left">Código</th>
                <th className="px-8 py-6 text-left">Denominación</th>
                <th className="px-8 py-6 text-center">Tipo</th>
                <th className="px-8 py-6 text-right">Saldo Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {chart.map((entry) => (
                <tr key={entry.code} className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                  <td className="px-8 py-5 font-black text-[#14532D] text-sm">{entry.code}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3" style={{ marginLeft: `${(entry.level - 1) * 24}px` }}>
                      {entry.level < 3 && <ChevronDown size={16} className="text-slate-400" />}
                      <span className={`text-sm ${entry.level === 1 ? 'font-black text-slate-900 text-base' : 'font-bold text-slate-600'}`}>
                        {entry.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter ${
                      entry.type === 'ASSET' ? 'bg-emerald-100 text-emerald-700' :
                      entry.type === 'LIABILITY' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right font-black text-slate-900">
                    ${entry.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
