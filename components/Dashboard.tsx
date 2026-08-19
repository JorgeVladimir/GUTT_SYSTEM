
import React, { useMemo } from 'react';
import { Transaction, AppView } from '../types';
import { Wallet, ArrowUpRight, ArrowDownLeft, ChevronRight, RefreshCcw, PiggyBank, TrendingUp, Plus } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  transactions: Transaction[];
  totalBalance: number;
  onNavigate: (view: AppView) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ transactions, totalBalance, onNavigate }) => {
  // Use useMemo to calculate chart data from transactions
  const chartData = useMemo(() => {
    return transactions.slice(0, 7).reverse().map((tx, idx) => ({
      name: tx.date.split('/')[0],
      value: Math.abs(tx.amount)
    }));
  }, [transactions]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20 sm:pb-8 animate-in fade-in duration-700">
      {/* Welcome Banner */}
      <div className="bg-[#14532D] rounded-[2.5rem] p-8 lg:p-12 text-white relative overflow-hidden shadow-2xl border-b-[12px] border-[#FACC15]">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <div className="bg-[#FACC15] text-[#14532D] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-6 inline-block shadow-xl">
              Socio Activo
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-3 tracking-tighter">Bienvenido a tu Caja</h1>
            <p className="text-emerald-100/70 text-sm max-w-lg font-medium leading-relaxed">
              Tu futuro está asegurado. Revisa tus ahorros, realiza transferencias seguras o solicita un crédito inmediato con las mejores tasas del mercado local.
            </p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button 
              onClick={() => onNavigate(AppView.CREDITS)}
              className="flex-1 md:flex-none bg-[#FACC15] hover:bg-yellow-300 text-[#14532D] px-10 py-4 rounded-2xl font-black text-sm transition-all shadow-2xl hover:-translate-y-1 active:scale-95 whitespace-nowrap"
            >
              SIMULAR CRÉDITO
            </button>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute -right-20 -top-20 w-96 h-96 bg-white/5 rounded-full blur-[100px]"></div>
        <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-[#FACC15]/10 rounded-full blur-[60px]"></div>
        <div className="absolute right-10 bottom-10 opacity-5">
           <PiggyBank size={180} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Saldo Card */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 group relative overflow-hidden hover:shadow-xl transition-all duration-300">
              <div className="absolute top-0 right-0 p-6">
                 <TrendingUp size={32} className="text-emerald-500/10 group-hover:scale-125 transition-transform" />
              </div>
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="p-4 rounded-2xl bg-emerald-50 text-[#14532D] inline-block mb-6 shadow-inner">
                    <Wallet size={28} />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Disponible Hoy</p>
                  <p className="text-4xl font-black text-slate-900">
                    <span className="text-lg font-bold text-slate-300 align-top mr-1">$</span>
                    {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="mt-8 pt-6 border-t border-slate-50">
                  <p className="text-xs font-bold text-slate-800">Cuenta de Ahorros</p>
                  <p className="text-[10px] text-emerald-600 font-bold mt-1 uppercase tracking-tighter">Generando intereses diarios</p>
                </div>
              </div>
            </div>
            
            {/* Action Card */}
            <div 
              onClick={() => onNavigate(AppView.CREDITS)}
              className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-[#14532D] hover:text-[#14532D] hover:bg-white hover:shadow-xl transition-all cursor-pointer group"
            >
               <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center mb-4 group-hover:bg-emerald-50 shadow-sm transition-all group-hover:scale-110">
                 <Plus size={32} />
               </div>
               <p className="text-[10px] font-black uppercase tracking-[0.2em] text-center">Solicitar Nuevo<br/>Crédito</p>
            </div>
          </div>

          {/* Activity Chart */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 min-h-[400px]">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-xl font-black text-slate-800">Actividad Mensual</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Resumen de transacciones</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <RefreshCcw size={20} className="text-[#14532D]" />
              </div>
            </div>
            <div className="h-[250px] w-full" style={{ minWidth: '100%' }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={chartData.length > 0 ? chartData : [{name: 'Ene', value: 0}, {name: 'Feb', value: 10}]}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14532D" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#14532D" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 'bold'}} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ stroke: '#14532D', strokeWidth: 1 }}
                    contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', fontSize: '12px', fontWeight: 'bold'}} 
                  />
                  <Area type="monotone" dataKey="value" stroke="#14532D" strokeWidth={5} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Historial Corto Side */}
        <div className="space-y-8">
           <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-full flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-black text-slate-800">Movimientos</h3>
                <span className="text-[10px] bg-slate-900 text-white px-3 py-1 rounded-full font-black uppercase tracking-widest">{transactions.length}</span>
              </div>
              
              <div className="space-y-5 flex-1 overflow-y-auto max-h-[400px] pr-2 scrollbar-hide">
                {transactions.length > 0 ? transactions.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50 p-3 rounded-2xl transition-all border border-transparent hover:border-slate-100">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                      t.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {t.type === 'CREDIT' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate leading-none mb-1">{t.description}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{t.date}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${t.type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {t.type === 'CREDIT' ? '+' : '-'}${Math.abs(t.amount).toFixed(2)}
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-20 opacity-20 text-center">
                    <PiggyBank size={64} className="mb-4" />
                    <p className="text-xs font-black uppercase tracking-widest">Esperando Actividad...</p>
                  </div>
                )}
              </div>
              
              <div className="mt-10 bg-[#14532D] rounded-[2.5rem] p-6 relative overflow-hidden group shadow-2xl border-b-4 border-[#FACC15]">
                 <div className="relative z-10">
                   <p className="text-[#FACC15] font-black text-[10px] uppercase tracking-[0.2em] mb-2">Tu Patrimonio</p>
                   <p className="text-white text-[11px] font-medium mb-4 leading-relaxed">Tus aportes están protegidos y respaldados por la caja central.</p>
                   <button className="text-[10px] font-black text-white flex items-center gap-2 group-hover:gap-3 transition-all bg-white/10 px-4 py-2 rounded-full border border-white/5">
                     VER BENEFICIOS <ChevronRight size={14} className="text-[#FACC15]" />
                   </button>
                 </div>
                 <div className="absolute -right-8 -bottom-8 text-white/5 w-32 h-32 transform rotate-12">
                   <PiggyBank size={120} />
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
