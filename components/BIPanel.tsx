
import React, { useState, useMemo } from 'react';
import { User, UserRole, Loan, FixedAsset, CreditRating, AccountType } from '../types';
import { 
  BarChart3, 
  Settings2, 
  Users, 
  Briefcase, 
  TrendingUp, 
  ShieldCheck, 
  Download, 
  Search, 
  Filter, 
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  Activity,
  Award,
  AlertTriangle,
  FileSpreadsheet,
  Printer,
  Boxes,
  PieChart,
  Check,
  Lock
} from 'lucide-react';

interface BIPanelProps {
  users: User[];
  assets?: FixedAsset[];
  currentUserRole?: UserRole;
}

export const BIPanel: React.FC<BIPanelProps> = ({ users, assets = [], currentUserRole }) => {
  const isAdmin = currentUserRole === UserRole.ADMIN;
  
  // Si no es admin, forzar pestaña de rentabilidad/buró y ocultar constructor
  const [activeSubTab, setActiveSubTab] = useState<'BUILDER' | 'PROFITABILITY' | 'BUREAU'>(isAdmin ? 'BUILDER' : 'PROFITABILITY');
  const [reportConfig, setReportConfig] = useState({
    entity: 'SOCIOS',
    fields: ['ID', 'Nombre', 'Email'] as string[],
    filter: ''
  });
  const [generatedData, setGeneratedData] = useState<any[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  const availableFields: Record<string, string[]> = {
    'SOCIOS': ['ID', 'Nombre', 'Email', 'Profesión', 'Provincia', 'Fecha Registro', 'Saldo Ahorros'],
    'CARTERA': ['ID Préstamo', 'Socio', 'Monto Original', 'Saldo Pendiente', 'Tasa (%)', 'Estado', 'Cuotas Totales'],
    'ACTIVOS': ['ID Activo', 'Nombre', 'Categoría', 'Valor Compra', 'Depreciación Acum.'],
    'CONTABILIDAD': ['Cuenta', 'Nombre Cuenta', 'Saldo', 'Nivel']
  };

  const members = useMemo(() => users.filter(u => u.role === UserRole.MEMBER), [users]);
  const portfolio = useMemo(() => members.flatMap(u => (u.loans || []).map(l => ({...l, memberName: u.name}))), [members]);

  const handleGenerateReport = () => {
    let data: any[] = [];
    const q = reportConfig.filter.toLowerCase();

    if (reportConfig.entity === 'SOCIOS') {
      data = members.map(u => ({
        'ID': u.id,
        'Nombre': u.name,
        'Email': u.email || 'N/A',
        'Profesión': u.profession || 'N/A',
        'Provincia': u.province || 'N/A',
        'Fecha Registro': u.registrationDate || 'N/A',
        'Saldo Ahorros': `$${(u.accounts.find(a => a.type === AccountType.SAVINGS)?.balance || 0).toFixed(2)}`
      }));
    } else if (reportConfig.entity === 'CARTERA') {
      data = portfolio.map(l => ({
        'ID Préstamo': l.id,
        'Socio': l.memberName,
        'Monto Original': `$${l.amount.toFixed(2)}`,
        'Saldo Pendiente': `$${l.balance.toFixed(2)}`,
        'Tasa (%)': `${l.rate}%`,
        'Estado': l.status,
        'Cuotas Totales': l.installmentsCount
      }));
    } else if (reportConfig.entity === 'ACTIVOS') {
      data = assets.map(a => ({
        'ID Activo': a.id,
        'Nombre': a.name,
        'Categoría': a.category,
        'Valor Compra': `$${a.value.toFixed(2)}`,
        'Depreciación Acum.': `$${a.depreciation.toFixed(2)}`
      }));
    }

    if (q) {
      data = data.filter(item => 
        Object.values(item).some(val => String(val).toLowerCase().includes(q))
      );
    }

    setGeneratedData(data);
    setIsGenerated(true);
  };

  const profitability = useMemo(() => {
    const interestIncome = portfolio.reduce((acc, l) => acc + (l.amount * (l.rate / 100)), 0);
    const operatingExpenses = interestIncome * 0.35; 
    return {
      income: interestIncome,
      expense: operatingExpenses,
      net: interestIncome - operatingExpenses,
      margin: interestIncome > 0 ? ((interestIncome - operatingExpenses) / interestIncome * 100).toFixed(2) : "0.00"
    };
  }, [portfolio]);

  const getRatingStyle = (rating: CreditRating) => {
    switch (rating) {
      case 'EXCELENTE': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'BUENO': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'REGULAR': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'MALO': return 'bg-red-100 text-red-700 border-red-200';
      case 'NEGADO': return 'bg-slate-900 text-white border-slate-700';
      default: return 'bg-slate-100 text-slate-500';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-7xl mx-auto">
      {/* Header BI */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center shadow-lg">
            <BarChart3 size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Business Intelligence Patate</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generador de Reportes y Análisis de Riesgo</p>
          </div>
        </div>

        <div className="bg-slate-50 p-2 rounded-2xl flex gap-1">
          {isAdmin && (
             <button onClick={() => setActiveSubTab('BUILDER')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeSubTab === 'BUILDER' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}>Constructor</button>
          )}
          <button onClick={() => setActiveSubTab('PROFITABILITY')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeSubTab === 'PROFITABILITY' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}>Rentabilidad</button>
          <button onClick={() => setActiveSubTab('BUREAU')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeSubTab === 'BUREAU' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}>Buró Interno</button>
        </div>
      </div>

      {activeSubTab === 'BUILDER' && isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Configuración estilo ICG */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-2">Entidad Fuente</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(availableFields).map(ent => (
                    <button key={ent} onClick={() => {setReportConfig({entity: ent, fields: availableFields[ent].slice(0, 3), filter: ''}); setIsGenerated(false);}} className={`py-4 rounded-xl font-black text-[10px] border-2 transition-all ${reportConfig.entity === ent ? 'border-[#14532D] bg-emerald-50 text-[#14532D]' : 'border-slate-50 text-slate-400'}`}>{ent}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-2">Campos a Incluir</label>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 no-scrollbar">
                  {availableFields[reportConfig.entity].map(field => (
                    <label key={field} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={reportConfig.fields.includes(field)}
                        onChange={(e) => {
                          const newFields = e.target.checked 
                            ? [...reportConfig.fields, field] 
                            : reportConfig.fields.filter(f => f !== field);
                          setReportConfig({...reportConfig, fields: newFields});
                          setIsGenerated(false);
                        }}
                        className="w-5 h-5 accent-[#14532D]" 
                      />
                      <span className="text-[11px] font-black text-slate-600 uppercase">{field}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-2">Filtro de Texto</label>
                <div className="relative">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input 
                    type="text" 
                    placeholder="Buscar..." 
                    value={reportConfig.filter}
                    onChange={(e) => {setReportConfig({...reportConfig, filter: e.target.value}); setIsGenerated(false);}}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <button 
                onClick={handleGenerateReport}
                className="w-full py-5 bg-[#14532D] text-white rounded-2xl font-black text-sm uppercase shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
              >
                GENERAR REPORTE <FileSpreadsheet size={20} />
              </button>
            </div>
          </div>

          {/* Vista Previa / Resultados */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 h-full flex flex-col overflow-hidden min-h-[600px]">
               <div className="p-8 border-b flex justify-between items-center bg-slate-50/50">
                 <div>
                   <h3 className="text-xl font-black text-slate-900 tracking-tighter">Resultados del Reporte</h3>
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{reportConfig.entity} • {reportConfig.fields.length} columnas • {isGenerated ? generatedData.length : 0} registros</p>
                 </div>
                 <div className="flex gap-2">
                   <button onClick={() => window.print()} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-[#14532D] transition-colors"><Printer size={20} /></button>
                   <button className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-[#14532D] transition-colors"><Download size={20} /></button>
                 </div>
               </div>
               
               {isGenerated ? (
                 <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b sticky top-0 z-10">
                        <tr>
                          {reportConfig.fields.map(f => (
                            <th key={f} className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{f}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {generatedData.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            {reportConfig.fields.map(f => (
                              <td key={f} className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">{row[f]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {generatedData.length === 0 && (
                      <div className="p-20 text-center text-slate-300">
                        <AlertTriangle size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="font-black uppercase text-xs">No se encontraron datos con los criterios actuales</p>
                      </div>
                    )}
                 </div>
               ) : (
                 <div className="flex-1 flex flex-col items-center justify-center p-20 text-center opacity-20">
                   <Settings2 size={64} className="mb-4" />
                   <p className="font-black uppercase tracking-widest text-xs">Haga clic en Generar para visualizar los datos</p>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'PROFITABILITY' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-8">
           <div className="lg:col-span-2 bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100">
             <div className="flex justify-between items-center mb-10">
               <h3 className="text-2xl font-black text-slate-900">Análisis de Margen Neto</h3>
               <div className="px-6 py-2 bg-emerald-100 text-emerald-700 rounded-full font-black text-xs uppercase">Margen: {profitability.margin}%</div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Ingresos Financieros</p>
                  <p className="text-4xl font-black text-[#14532D]">${profitability.income.toLocaleString()}</p>
                  <p className="text-xs text-emerald-600 font-bold mt-2">Por intereses devengados</p>
                </div>
                <div className="p-8 bg-red-50 rounded-3xl border border-red-100">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-4">Egresos Operativos</p>
                  <p className="text-4xl font-black text-red-600">${profitability.expense.toLocaleString()}</p>
                  <p className="text-xs text-red-400 font-bold mt-2">Costo de administración</p>
                </div>
                <div className="col-span-full p-8 bg-[#14532D] text-white rounded-[3rem] shadow-2xl relative overflow-hidden">
                  <div className="relative z-10">
                    <p className="text-[#FACC15] font-black text-[10px] uppercase tracking-[0.3em] mb-4">Utilidad Institucional (Neto)</p>
                    <p className="text-5xl font-black tracking-tighter">${profitability.net.toLocaleString()}</p>
                  </div>
                  <PieChart className="absolute right-[-20px] bottom-[-20px] text-white/5" size={160} />
                </div>
             </div>
           </div>

           <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100 flex flex-col">
              <h3 className="text-xl font-black text-slate-900 mb-8">Composición Activos</h3>
              <div className="space-y-6 flex-1">
                 {[
                   {label: 'Cartera Vigente', val: '72%', color: 'bg-emerald-500'},
                   {label: 'Disponibles', val: '15%', color: 'bg-[#FACC15]'},
                   {label: 'Activos Fijos', val: '8%', color: 'bg-blue-500'},
                   {label: 'Inversiones', val: '5%', color: 'bg-purple-500'},
                 ].map(item => (
                   <div key={item.label} className="space-y-2">
                     <div className="flex justify-between text-[10px] font-black uppercase">
                       <span className="text-slate-500">{item.label}</span>
                       <span className="text-slate-900">{item.val}</span>
                     </div>
                     <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                       <div className={`h-full ${item.color}`} style={{width: item.val}}></div>
                     </div>
                   </div>
                 ))}
              </div>
              {isAdmin && (
                 <button className="mt-10 w-full py-5 border-2 border-[#14532D] text-[#14532D] rounded-2xl font-black text-xs uppercase hover:bg-emerald-50 transition-all">Exportar Balance Proyectado</button>
              )}
           </div>
        </div>
      )}

      {activeSubTab === 'BUREAU' && (
        <div className="bg-white rounded-[4rem] shadow-sm border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95">
          <div className="p-10 border-b bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-emerald-50 text-[#14532D] rounded-2xl flex items-center justify-center">
                <ShieldCheck size={28} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900">Buró de Crédito Interno</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calificación Dinámica de Pago de Dividendos</p>
              </div>
            </div>
            
            {isAdmin && (
              <div className="relative w-full md:w-80">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input type="text" placeholder="Buscar socio..." className="w-full pl-12 pr-6 py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-sm focus:border-[#14532D] outline-none" />
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                  <th className="px-10 py-7 text-left">Socio</th>
                  <th className="px-10 py-7 text-center">Score</th>
                  <th className="px-10 py-7 text-center">Calificación</th>
                  <th className="px-10 py-7 text-center">Estatus Pago</th>
                  <th className="px-10 py-7 text-right">Riesgo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {members.map(member => {
                  const hasLoans = (member.loans || []).length > 0;
                  const rating: CreditRating = hasLoans ? (member.bureau?.rating || 'EXCELENTE') : 'EXCELENTE';
                  const score = member.bureau?.score || 950;
                  
                  return (
                    <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-10 py-6">
                        <p className="font-black text-slate-800 uppercase text-sm">{member.name}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase">{member.id}</p>
                      </td>
                      <td className="px-10 py-6 text-center">
                        <div className="flex flex-col items-center">
                           <span className="text-xl font-black text-slate-900">{score}</span>
                           <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <div className={`h-full ${score > 800 ? 'bg-emerald-500' : score > 500 ? 'bg-amber-400' : 'bg-red-500'}`} style={{width: `${(score/1000)*100}%`}}></div>
                           </div>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black border-2 uppercase ${getRatingStyle(rating)}`}>
                          {rating}
                        </span>
                      </td>
                      <td className="px-10 py-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                           <Activity size={14} className={rating === 'EXCELENTE' ? 'text-emerald-500' : 'text-amber-500'} />
                           <span className="text-[10px] font-black text-slate-600 uppercase">A tiempo</span>
                        </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-[10px] font-black uppercase ${rating === 'EXCELENTE' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {rating === 'EXCELENTE' ? 'MÍNIMO' : 'MODERADO'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isAdmin && activeSubTab === 'BUILDER' && (
        <div className="bg-white p-20 rounded-[4rem] shadow-sm border border-slate-100 text-center opacity-40">
           <Lock size={64} className="mx-auto mb-4" />
           <p className="font-black uppercase tracking-widest text-xs">Acceso restringido a configuración global</p>
        </div>
      )}
    </div>
  );
};
