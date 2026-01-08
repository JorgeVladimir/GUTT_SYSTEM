
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
  ChevronRight,
  ChevronDown,
  Info
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
      { id: 'sp_r_bal_compro', label: 'Balance de Comprobación Integral' },
      { id: 'sp_r_situa_gene', label: 'Estado de Situación General' },
      { id: 'sp_r_bal_pergan_c', label: 'Pérdidas y Ganancias (P&G)' },
      { id: 'sp_presupuesto', label: 'Ejecución Presupuestaria Anual' }
    ],
    CARTERA: [
      { id: 'sp_cartera_indicemorosidad', label: 'Índice de Morosidad Global' },
      { id: 'sp_cartera_creditos_concedidos', label: 'Créditos Concedidos del Periodo' },
      { id: 'sp_cartera_reporte_recuperacion', label: 'Reporte de Recuperación de Cartera' },
      { id: 'sp_consulta_garantes', label: 'Mapa de Riesgos y Garantes' }
    ],
    CAPTACIONES: [
      { id: 'sp_reportes_movimientocaja', label: 'Arqueo Consolidado de Caja' },
      { id: 'sp_cuentas_inmobilizadas', label: 'Reporte de Cuentas Inactivas' },
      { id: 'sp_reporte_ahorro_cert', label: 'Resumen de Capital Social' }
    ],
    REGULATORIO: [
      { id: 'sp_sepsb11', label: 'Estructura Oficial SEPS B11' },
      { id: 'sp_sepsd01', label: 'Estructura Oficial SEPS D01' },
      { id: 'sp_sepsc01', label: 'Estructura Oficial SEPS C01' },
      { id: 'sp_uaf_matriz', label: 'Matriz Transaccional UAF' }
    ]
  };

  const runReport = async () => {
    setLoading(true);
    try {
      const results = await DataService.getFinancialReport(reportType, {});
      setData(results || []);
    } catch (e) {
      alert("Error al procesar la solicitud en el núcleo bancario.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">
      {/* Header Banner - Diseño Premium */}
      <div className="bg-gradient-to-r from-[#14532D] to-[#1b5e20] p-10 lg:p-14 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden border-b-[14px] border-[#FACC15]">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-6">
             <div className="p-4 bg-white/10 rounded-[2rem] backdrop-blur-md shadow-inner border border-white/20">
               <FileBarChart size={40} className="text-[#FACC15] animate-pulse" />
             </div>
             <div>
               <h2 className="text-4xl font-black tracking-tighter leading-none mb-2">Centro de Inteligencia Financiera</h2>
               <div className="flex items-center gap-2">
                 <span className="w-2 h-2 bg-[#FACC15] rounded-full"></span>
                 <p className="text-emerald-100/60 font-bold text-xs uppercase tracking-[0.3em]">Gestión Oficial de Datos • Caja Patate</p>
               </div>
             </div>
          </div>
          <div className="hidden xl:flex items-center gap-4 bg-black/20 p-4 rounded-3xl border border-white/5">
             <Info size={20} className="text-[#FACC15]" />
             <p className="text-[10px] font-bold text-emerald-50 max-w-[180px] leading-tight">Los reportes generados cumplen con la normativa vigente de la SEPS.</p>
          </div>
        </div>
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-[#FACC15]/10 rounded-full blur-[120px]"></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 lg:gap-12">
        {/* Navegación de Módulos */}
        <div className="lg:col-span-1 space-y-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] ml-6 mb-4">Seleccione un Módulo</p>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setCategory(cat.id as ReportCategory);
                setReportType(reports[cat.id as ReportCategory][0].id);
              }}
              className={`w-full flex items-center justify-between p-6 rounded-[2.2rem] transition-all duration-500 group border-2 ${
                category === cat.id 
                ? 'bg-white shadow-2xl border-[#14532D] -translate-y-1' 
                : 'bg-white/50 border-transparent hover:bg-white hover:border-slate-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3.5 rounded-2xl transition-all duration-500 ${category === cat.id ? 'bg-[#14532D] text-white rotate-6' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                  {cat.icon}
                </div>
                <span className={`text-sm font-black transition-colors ${category === cat.id ? 'text-slate-900' : 'text-slate-400'}`}>
                  {cat.label}
                </span>
              </div>
              <ChevronRight size={18} className={category === cat.id ? 'text-[#14532D] translate-x-1' : 'text-slate-200'} />
            </button>
          ))}
        </div>

        {/* Panel Central de Generación */}
        <div className="lg:col-span-3 space-y-8">
          <div className="bg-white p-10 lg:p-12 rounded-[4rem] shadow-2xl border border-slate-100 relative overflow-hidden">
             {/* Indicadores de Pasos */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 ml-2">
                    <span className="w-6 h-6 rounded-full bg-[#14532D] text-white flex items-center justify-center text-[10px] font-black">1</span>
                    <label className="text-[11px] font-black text-[#14532D] uppercase tracking-widest">Formulario del Reporte</label>
                  </div>
                  <div className="relative group">
                    <select 
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-slate-800 outline-none focus:border-[#14532D] focus:bg-white transition-all shadow-inner appearance-none cursor-pointer"
                    >
                      {reports[category].map(r => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown size={24} />
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 ml-2">
                      <span className="w-6 h-6 rounded-full bg-[#14532D] text-white flex items-center justify-center text-[10px] font-black">2</span>
                      <label className="text-[11px] font-black text-[#14532D] uppercase tracking-widest">Desde</label>
                    </div>
                    <div className="relative group">
                      <Calendar size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#14532D] transition-colors" />
                      <input 
                        type="date" 
                        className="w-full pl-14 pr-4 py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-slate-800 outline-none focus:border-[#14532D] focus:bg-white shadow-inner transition-all appearance-none" 
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 ml-2">
                      <span className="w-6 h-6 rounded-full bg-[#14532D] text-white flex items-center justify-center text-[10px] font-black">3</span>
                      <label className="text-[11px] font-black text-[#14532D] uppercase tracking-widest">Hasta</label>
                    </div>
                    <div className="relative group">
                      <Calendar size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#14532D] transition-colors" />
                      <input 
                        type="date" 
                        className="w-full pl-14 pr-4 py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl font-black text-slate-800 outline-none focus:border-[#14532D] focus:bg-white shadow-inner transition-all appearance-none" 
                      />
                    </div>
                  </div>
                </div>
             </div>

             <button 
               onClick={runReport}
               disabled={loading}
               className="group relative w-full py-7 bg-[#14532D] text-white rounded-[2.5rem] font-black text-2xl shadow-2xl hover:bg-emerald-900 transition-all flex items-center justify-center gap-6 border-b-[10px] border-[#0a2f1a] active:translate-y-2 active:border-b-0 disabled:opacity-50 overflow-hidden"
             >
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
               {loading ? (
                  <div className="flex items-center gap-4">
                    <div className="w-6 h-6 border-4 border-[#FACC15] border-t-transparent rounded-full animate-spin"></div>
                    <span>PROCESANDO EN NÚCLEO...</span>
                  </div>
               ) : (
                  <>
                    <span>GENERAR REPORTE OFICIAL</span>
                    <Search size={32} className="text-[#FACC15] group-hover:scale-125 transition-transform" />
                  </>
               )}
             </button>
          </div>

          {/* Área de Visualización de Resultados */}
          <div className="bg-white rounded-[4rem] border border-slate-100 shadow-2xl overflow-hidden min-h-[500px] flex flex-col relative">
            <div className="absolute top-0 left-0 right-0 h-2 bg-slate-50"></div>
            {data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50/80 border-b-2 border-slate-100">
                    <tr className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">
                      <th className="px-10 py-7 text-left">Referencia Contable</th>
                      <th className="px-10 py-7 text-left">Denominación del Ítem</th>
                      <th className="px-10 py-7 text-right">Monto Consolidado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-10 py-6 font-black text-[#14532D] text-base">{row.account || row.code || i + 100}</td>
                        <td className="px-10 py-6 font-bold text-slate-700 text-base">{row.name || 'Fila de Registro de Auditoría'}</td>
                        <td className="px-10 py-6 text-right font-black text-slate-900 text-lg">
                          <span className="text-slate-300 mr-2">$</span>
                          {(row.balance || row.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-300">
                <div className="w-32 h-32 bg-slate-50 rounded-full flex items-center justify-center mb-8 shadow-inner">
                  <TableIcon size={56} strokeWidth={1} className="opacity-40" />
                </div>
                <h3 className="text-lg font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Resultados en Espera</h3>
                <p className="text-sm font-medium text-slate-300">Configure los filtros superiores para procesar los datos.</p>
              </div>
            )}
            
            {/* Pie de Tabla con Acciones */}
            {data.length > 0 && (
              <div className="p-10 bg-slate-50/80 border-t flex flex-col sm:flex-row justify-between items-center gap-6 no-print">
                 <div className="flex items-center gap-3">
                   <div className="w-3 h-3 bg-[#14532D] rounded-full animate-pulse"></div>
                   <p className="text-[10px] font-black text-[#14532D] uppercase tracking-widest">Reporte Generado: {new Date().toLocaleDateString()}</p>
                 </div>
                 <div className="flex gap-4 w-full sm:w-auto">
                    <button className="flex-1 px-8 py-5 bg-white border-2 border-slate-200 rounded-[1.8rem] font-black text-slate-500 hover:bg-slate-100 transition-all flex items-center justify-center gap-3 shadow-md">
                      <Download size={20} /> DESCARGAR CSV
                    </button>
                    <button onClick={() => window.print()} className="flex-1 px-10 py-5 bg-[#FACC15] text-[#14532D] rounded-[1.8rem] font-black shadow-xl hover:bg-yellow-400 transition-all flex items-center justify-center gap-3 border-b-4 border-yellow-600 active:translate-y-1 active:border-b-0">
                      <Printer size={22} /> IMPRIMIR PDF OFICIAL
                    </button>
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
