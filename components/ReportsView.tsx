
import React, { useState } from 'react';
import { 
  FileBarChart, 
  Printer, 
  Download, 
  Search, 
  Table as TableIcon, 
  Calendar,
  Briefcase,
  TrendingUp,
  ShieldAlert,
  Users,
  PieChart,
  ChevronRight
} from 'lucide-react';
import { DataService } from '../services/dataService';

type ReportCategory = 'CONTABILIDAD' | 'CARTERA' | 'CAPTACIONES' | 'REGULATORIO';

export const ReportsView: React.FC = () => {
  const [category, setCategory] = useState<ReportCategory>('CONTABILIDAD');
  const [reportType, setReportType] = useState('sp_r_bal_compro');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  const categories = [
    { id: 'CONTABILIDAD', label: 'Finanzas y Libros', icon: <Briefcase size={20} />, color: 'bg-emerald-500' },
    { id: 'CARTERA', label: 'Créditos y Cobranza', icon: <TrendingUp size={20} />, color: 'bg-blue-500' },
    { id: 'CAPTACIONES', label: 'Ahorros e Inversión', icon: <PieChart size={20} />, color: 'bg-purple-500' },
    { id: 'REGULATORIO', label: 'SEPS y UAF', icon: <ShieldAlert size={20} />, color: 'bg-red-500' },
  ];

  const reports = {
    CONTABILIDAD: [
      { id: 'sp_r_bal_compro', label: 'Balance de Comprobación' },
      { id: 'sp_r_situa_gene', label: 'Estado de Situación General' },
      { id: 'sp_r_bal_pergan_c', label: 'Pérdidas y Ganancias (P&G)' },
      { id: 'sp_presupuesto', label: 'Ejecución Presupuestaria' }
    ],
    CARTERA: [
      { id: 'sp_cartera_indicemorosidad', label: 'Índice de Morosidad Global' },
      { id: 'sp_cartera_creditos_concedidos', label: 'Créditos Concedidos' },
      { id: 'sp_cartera_reporte_recuperacion', label: 'Reporte de Recuperación' },
      { id: 'sp_consulta_garantes', label: 'Mapa de Garantes y Riesgo' }
    ],
    CAPTACIONES: [
      { id: 'sp_reportes_movimientocaja', label: 'Movimiento Diario de Caja' },
      { id: 'sp_cuentas_inmobilizadas', label: 'Cuentas Inmovilizadas' },
      { id: 'sp_reporte_ahorro_cert', label: 'Resumen de Aportaciones' }
    ],
    REGULATORIO: [
      { id: 'sp_sepsb11', label: 'Estructura B11 (Balance)' },
      { id: 'sp_sepsd01', label: 'Estructura D01 (Depósitos)' },
      { id: 'sp_sepsc01', label: 'Estructura C01 (Cartera)' },
      { id: 'sp_uaf_matriz', label: 'Matriz Lavado de Activos UAF' }
    ]
  };

  const runReport = async () => {
    setLoading(true);
    try {
      const results = await DataService.getFinancialReport(reportType, {});
      setData(results || []);
    } catch (e) {
      alert("Error al procesar la solicitud en Informix.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header Estilo Pichincha */}
      <div className="bg-[#14532D] p-8 lg:p-12 rounded-[3rem] text-white shadow-2xl relative overflow-hidden border-b-[12px] border-[#FACC15]">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
             <div className="p-3 bg-white/10 rounded-2xl">
               <FileBarChart size={32} className="text-[#FACC15]" />
             </div>
             <div>
               <h2 className="text-3xl font-black tracking-tighter">Centro de Inteligencia Financiera</h2>
               <p className="text-emerald-100/60 font-bold text-xs uppercase tracking-widest">Información Oficial Caja Patate</p>
             </div>
          </div>
        </div>
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Categorías a la Izquierda */}
        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4 mb-4">Módulos de Reporte</p>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id as ReportCategory);
                setReportType(reports[cat.id as ReportCategory][0].id);
              }}
              className={`w-full flex items-center justify-between p-5 rounded-[1.8rem] transition-all duration-300 group ${
                category === cat.id 
                ? 'bg-white shadow-xl border-l-8 border-[#14532D] translate-x-2' 
                : 'bg-white/50 border border-slate-100 hover:bg-white'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl text-white shadow-lg ${category === cat.id ? 'bg-[#14532D]' : 'bg-slate-300'}`}>
                  {cat.icon}
                </div>
                <span className={`text-sm font-black ${category === cat.id ? 'text-slate-900' : 'text-slate-400'}`}>
                  {cat.label}
                </span>
              </div>
              <ChevronRight size={18} className={category === cat.id ? 'text-[#14532D]' : 'text-slate-200'} />
            </button>
          ))}
        </div>

        {/* Panel de Filtros y Resultados */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border-4 border-[#14532D]/20">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-[#14532D] uppercase tracking-[0.2em] ml-2 block">
                    1. Selección de Formulario
                  </label>
                  <div className="relative group">
                    <select 
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      className="w-full p-5 bg-slate-50 border-4 border-[#14532D] rounded-2xl font-black text-slate-800 outline-none focus:ring-8 focus:ring-[#FACC15]/20 transition-all shadow-xl cursor-pointer appearance-none"
                    >
                      {reports[category].map(r => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#14532D]">
                      <ChevronRight size={24} className="rotate-90" />
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-[#14532D] uppercase tracking-[0.2em] ml-2 block">
                      2. Fecha Inicio
                    </label>
                    <div className="relative">
                      <Calendar size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#14532D]" />
                      <input 
                        type="date" 
                        className="w-full pl-12 pr-4 py-5 bg-slate-50 border-4 border-[#14532D] rounded-2xl font-black text-slate-800 outline-none focus:ring-8 focus:ring-[#FACC15]/20 shadow-xl transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-[#14532D] uppercase tracking-[0.2em] ml-2 block">
                      3. Fecha Corte
                    </label>
                    <div className="relative">
                      <Calendar size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#14532D]" />
                      <input 
                        type="date" 
                        className="w-full pl-12 pr-4 py-5 bg-slate-50 border-4 border-[#14532D] rounded-2xl font-black text-slate-800 outline-none focus:ring-8 focus:ring-[#FACC15]/20 shadow-xl transition-all" 
                      />
                    </div>
                  </div>
                </div>
             </div>

             <button 
               onClick={runReport}
               disabled={loading}
               className="w-full py-6 bg-[#14532D] text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-[#1b5e20] transition-all flex items-center justify-center gap-4 border-b-8 border-[#FACC15] active:translate-y-2 active:border-b-0 disabled:opacity-50"
             >
               {loading ? 'PROCESANDO EN NUCLEO...' : 'GENERAR REPORTE OFICIAL'}
               {!loading && <Search size={28} className="text-[#FACC15]" />}
             </button>
          </div>

          {/* Tabla de Resultados */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px]">
            {data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 border-b border-slate-100">
                    <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-8 py-5 text-left italic">Código Contable</th>
                      <th className="px-8 py-5 text-left">Detalle de Cuenta</th>
                      <th className="px-8 py-5 text-right">Monto Procesado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-8 py-5 font-black text-[#14532D]">{row.account || row.code || i + 100}</td>
                        <td className="px-8 py-5 font-bold text-slate-700">{row.name || 'Registro del Procedimiento'}</td>
                        <td className="px-8 py-5 text-right font-black text-slate-900">${(row.balance || row.amount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-40 text-slate-300 opacity-30">
                <TableIcon size={80} strokeWidth={1} className="mb-6" />
                <p className="font-black uppercase tracking-[0.3em] text-xs">Aún no se han procesado datos para este módulo</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-4 no-print">
             <button className="px-8 py-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-slate-500 hover:bg-slate-50 transition-all flex items-center gap-2">
               <Download size={20} /> CSV
             </button>
             <button onClick={() => window.print()} className="px-10 py-4 bg-[#FACC15] text-[#14532D] rounded-2xl font-black shadow-xl hover:bg-yellow-400 transition-all flex items-center gap-2">
               <Printer size={20} /> IMPRIMIR PDF OFICIAL
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
