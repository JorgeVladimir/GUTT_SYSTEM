
import React from 'react';
import { Transaction } from '../types';
import { Wallet, ArrowUpRight, ArrowDownLeft, ChevronRight, RefreshCcw, PiggyBank, TrendingUp, Plus } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  transactions: Transaction[];
  totalBalance: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ transactions, totalBalance }) => {
  const chartData = transactions.slice(0, 7).reverse().map((tx, idx) => ({
    name: tx.date.split('/')[0],
    value: Math.abs(tx.amount)
  }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20 sm:pb-8">
      {/* Patate Welcome Banner */}
      <div className="bg-[#14532D] rounded-[2.5rem] p-6 lg:p-10 text-white relative overflow-hidden shadow-2xl border-b-8 border-[#FACC15]">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <span className="bg-[#FACC15] text-[#14532D] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 inline-block shadow-lg">Socio Patate</span>
            <h1 className="text-3xl md:text-4xl font-black mb-2 tracking-tight">Caja de Ahorro Patate</h1>
            <p className="text-emerald-100/70 text-sm max-w-md font-medium">Llevas un excelente historial de aportaciones en nuestra caja. Sigue creciendo con nosotros.</p>
          </div>
          <div className="flex gap-4">
            <button className="bg-[#FACC15] hover:bg-yellow-300 text-[#14532D] px-8 py-3.5 rounded-2xl font-black text-sm transition-all shadow-xl hover:-translate-y-1">
              Simular Crédito
            </button>
          </div>
        </div>
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-white/5 rounded-full blur-3xl"></div>
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-[#FACC15]/5 rounded-full blur-2xl"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 group relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                 <TrendingUp size={24} className="text-emerald-500/20" />
              </div>
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 rounded-2xl bg-emerald-50 text-[#14532D]">
                  <Wallet size={24} />
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aportación Social</p>
                  <p className="text-3xl font-black text-slate-900 mt-1">
                    <span className="text-sm font-bold text-slate-400 align-top mr-1">$</span>
                    {totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-800">Mi Cuenta de Socio Patate</p>
              <p className="text-[10px] text-emerald-600 font-bold mt-1 uppercase tracking-tighter">Generando 6.5% interés</p>
            </div>
            
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-[#14532D] hover:text-[#14532D] transition-all cursor-pointer">
               <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-2">
                 <Plus size={24} />
               </div>
               <p className="text-[10px] font-black uppercase tracking-widest">Nueva Inversión Patate</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-lg font-black text-slate-800">Crecimiento Patrimonial</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Tendencia últimos registros</p>
              </div>
              <RefreshCcw size={18} className="text-slate-300 animate-spin-slow" />
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData.length > 0 ? chartData : [{name: '0', value: 0}]}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14532D" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#14532D" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 'bold'}} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontSize: '12px'}} 
                  />
                  <Area type="monotone" dataKey="value" stroke="#14532D" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 h-full flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-slate-800">Mis Movimientos</h3>
                <span className="text-[10px] bg-slate-900 text-white px-3 py-1 rounded-full font-black uppercase tracking-tighter">{transactions.length}</span>
              </div>
              
              <div className="space-y-4 flex-1">
                {transactions.length > 0 ? transactions.slice(0, 7).map((t) => (
                  <div key={t.id} className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50 p-2 rounded-2xl transition-all">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      t.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {t.type === 'CREDIT' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate leading-none">{t.description}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">{t.date}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-black ${t.type === 'CREDIT' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {t.type === 'CREDIT' ? '+' : ''}{t.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center py-20 opacity-20 text-center">
                    <PiggyBank size={48} className="mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">Sin registros</p>
                  </div>
                )}
              </div>
              
              <div className="mt-8 bg-[#14532D] rounded-[2rem] p-5 relative overflow-hidden group shadow-xl">
                 <div className="relative z-10">
                   <p className="text-[#FACC15] font-black text-[10px] uppercase tracking-widest mb-1">Capacidad Patate</p>
                   <p className="text-white text-xs font-medium mb-3">Tus aportes en nuestra caja están asegurados por el fondo común.</p>
                   <button className="text-[10px] font-black text-white flex items-center gap-1 group-hover:gap-2 transition-all">
                     MÁS INFORMACIÓN <ChevronRight size={14} className="text-[#FACC15]" />
                   </button>
                 </div>
                 <div className="absolute -right-4 -bottom-4 text-white/5 w-24 h-24 transform rotate-12">
                   <PiggyBank size={96} />
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
