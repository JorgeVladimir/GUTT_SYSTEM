
import React, { useState, useMemo } from 'react';
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
  BarChart3,
  ChevronRight,
  Info,
  LayoutGrid,
  FileText,
  CreditCard,
  User as UserIcon,
  PieChart
} from 'lucide-react';
import { DataService } from '../services/dataService';
import { BIPanel } from './BIPanel';
import { ProfileView } from './ProfileView';
import { User, UserRole } from '../types';

interface ReportsViewProps {
  users?: User[];
  onUpdateUser?: (user: User) => void;
  currentUser?: User;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ users = [], onUpdateUser, currentUser }) => {
  const isMember = currentUser?.role === UserRole.MEMBER;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isAccountant = currentUser?.role === UserRole.ACCOUNTANT;
  
  // Acceso restringido a reportes financieros (Solo Admin y Contabilidad)
  const hasFinancialAccess = isAdmin || isAccountant;
  
  // Si es socio, auto-seleccionar su perfil y limitar opciones
  const [activeMasterTab, setActiveMasterTab] = useState<'FICHA' | 'SITUACION' | 'BI' | 'FINANCIAL'>(isMember ? 'SITUACION' : 'FICHA');
  const [reportType, setReportType] = useState('sp_r_bal_compro');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [selectedS01User, setSelectedS01User] = useState<User | null>(isMember ? (currentUser || null) : null);
  const [searchQuery, setSearchQuery] = useState('');

  const runReport = async () => {
    if (!hasFinancialAccess) return;
    setLoading(true);
    try {
      const results = await DataService.getFinancialReport(reportType, {});
      setData(results || []);
    } catch (e) {
      alert("Error en el núcleo bancario.");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery || isMember) return [];
    const q = searchQuery.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.id.includes(q)).slice(0, 5);
  }, [users, searchQuery, isMember]);

  const targetUser = isMember ? currentUser : selectedS01User;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center no-print">
        <div>
           <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Reporte de Cajas y Socios</h2>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Institución Financiera Patate</p>
        </div>
      </div>

      {/* Selector Maestro de Reportería */}
      <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 flex gap-2 no-print overflow-x-auto no-scrollbar">
        {[
          { id: 'FICHA', label: 'RECUPERAR FICHA DE SOCIO', icon: <FileText size={18} /> },
          { id: 'SITUACION', label: 'ESTADO DE SITUACIÓN GENERAL', icon: <PieChart size={18} /> },
          { id: 'BI', label: 'REPORTERÍA GENERAL (BI)', icon: <BarChart3 size={18} /> },
          // RESTRICCIÓN DE ACCESO: Solo Admin/Contabilidad ve reportes financieros
          hasFinancialAccess && { id: 'FINANCIAL', label: 'REPORTES FINANCIEROS', icon: <FileBarChart size={18} /> }
        ].filter(Boolean).map((tab: any) => (
          <button 
            key={tab.id}
            onClick={() => setActiveMasterTab(tab.id as any)}
            className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${activeMasterTab === tab.id ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {(activeMasterTab === 'FICHA' || activeMasterTab === 'SITUACION') && !targetUser && !isMember && (
        <div className="bg-white p-16 rounded-[4rem] shadow-sm border border-slate-100 text-center space-y-8">
          <div className="w-24 h-24 bg-emerald-50 text-[#14532D] rounded-2.5rem flex items-center justify-center mx-auto shadow-inner">
            <Search size={48} />
          </div>
          <div className="max-w-md mx-auto space-y-4">
            <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Localizar Socio</h3>
            <div className="relative">
               <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
               <input 
                 type="text" 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 placeholder="Buscar por Nombre o ID..." 
                 className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl outline-none font-black text-[#14532D] focus:border-[#14532D] shadow-inner" 
               />
               {filteredUsers.length > 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-20">
                    {filteredUsers.map(u => (
                      <button key={u.id} onClick={() => setSelectedS01User(u)} className="w-full p-6 text-left hover:bg-slate-50 flex items-center justify-between group transition-all">
                         <div>
                           <p className="font-black text-slate-800 uppercase text-xs">{u.name}</p>
                           <p className="text-[10px] font-bold text-slate-400">{u.id}</p>
                         </div>
                         <ChevronRight size={18} className="text-slate-200 group-hover:text-[#14532D] group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {activeMasterTab === 'FICHA' && targetUser && (
        <div className="animate-in slide-in-from-bottom-4">
           {!isMember && (
             <button onClick={() => setSelectedS01User(null)} className="mb-6 flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase hover:text-[#14532D] transition-all px-6 no-print">
               <Search size={14} /> Nueva Búsqueda
             </button>
           )}
           <ProfileView user={targetUser} onUpdateUser={onUpdateUser || (() => {})} />
        </div>
      )}

      {activeMasterTab === 'SITUACION' && targetUser && (
        <div className="animate-in slide-in-from-right-4 space-y-8 pb-10">
           {!isMember && (
             <button onClick={() => setSelectedS01User(null)} className="flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase hover:text-[#14532D] transition-all px-6 no-print">
               <Search size={14} /> Nueva Búsqueda
             </button>
           )}
           
           <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100 space-y-12 printable-area">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-10">
                 <div className="flex items-center gap-6">
                    <div className="w-20 h-20 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center font-black italic text-3xl">CAP</div>
                    <div>
                      <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Estado de Situación</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen Integral de Obligaciones</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Socio ID</p>
                    <p className="text-xl font-black text-slate-800">{targetUser.id}</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                 <div className="space-y-6">
                    <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4">Información del Socio</h4>
                    <div className="space-y-3 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                       <div className="flex justify-between text-sm"><span className="font-bold text-slate-400 uppercase text-[10px]">Nombre:</span> <span className="font-black text-slate-800 uppercase">{targetUser.name}</span></div>
                       <div className="flex justify-between text-sm"><span className="font-bold text-slate-400 uppercase text-[10px]">E-mail:</span> <span className="font-bold text-slate-800 lowercase">{targetUser.email || 'N/A'}</span></div>
                       <div className="flex justify-between text-sm"><span className="font-bold text-slate-400 uppercase text-[10px]">Teléfono:</span> <span className="font-bold text-slate-800">{targetUser.phone || 'N/A'}</span></div>
                       <div className="flex justify-between text-sm"><span className="font-bold text-slate-400 uppercase text-[10px]">Profesión:</span> <span className="font-bold text-slate-800 uppercase">{targetUser.profession || 'N/A'}</span></div>
                    </div>
                 </div>

                 <div className="space-y-6">
                    <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4">Obligaciones Financieras</h4>
                    <div className="grid grid-cols-1 gap-4">
                       <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                          <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">Ahorros a la Vista</p>
                          <p className="text-3xl font-black text-[#14532D]">${(targetUser.accounts[0]?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                       </div>
                       <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100">
                          <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Certificados Aportación</p>
                          <p className="text-2xl font-black text-blue-900">${(targetUser.accounts[1]?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="space-y-6">
                 <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4">Créditos y Colocaciones</h4>
                 <div className="overflow-x-auto rounded-3xl border border-slate-100">
                    <table className="w-full">
                       <thead className="bg-slate-50 border-b">
                          <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                             <th className="px-8 py-5 text-left">Nro Crédito</th>
                             <th className="px-8 py-5 text-left">Tipo</th>
                             <th className="px-8 py-5 text-center">Estado</th>
                             <th className="px-8 py-5 text-right">Saldo Deudor</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {targetUser.loans && targetUser.loans.length > 0 ? targetUser.loans.map(loan => (
                             <tr key={loan.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-8 py-5 font-black text-slate-800">{loan.id}</td>
                                <td className="px-8 py-5 font-bold text-slate-500 uppercase text-xs">{loan.type}</td>
                                <td className="px-8 py-5 text-center">
                                   <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${
                                      loan.status === 'VIGENTE' ? 'bg-emerald-100 text-emerald-700' : 
                                      loan.status === 'SOLICITADO' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                   }`}>{loan.status}</span>
                                </td>
                                <td className="px-8 py-5 text-right font-black text-slate-900">${loan.balance.toFixed(2)}</td>
                             </tr>
                          )) : (
                             <tr><td colSpan={4} className="px-8 py-10 text-center opacity-30 font-bold uppercase text-xs">No posee obligaciones crediticias activas</td></tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>
              <div className="pt-10 border-t flex gap-4 no-print">
                 <button onClick={() => window.print()} className="flex-1 py-5 bg-[#14532D] text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl"><Printer size={20} /> IMPRIMIR ESTADO DE SITUACIÓN</button>
              </div>
           </div>
        </div>
      )}

      {activeMasterTab === 'BI' && (
        <div className="animate-in slide-in-from-right-4">
           <BIPanel 
             users={isMember ? [currentUser!] : users} 
             currentUserRole={currentUser?.role}
           />
        </div>
      )}

      {activeMasterTab === 'FINANCIAL' && hasFinancialAccess && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
             <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 space-y-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Catálogo Contable</h3>
                <div className="space-y-2">
                  {[
                    { id: 'sp_r_bal_compro', label: 'Balance Comprobación' },
                    { id: 'sp_r_situa_gene', label: 'Situación General' },
                    { id: 'sp_sepsb11', label: 'Estructura B11' },
                    { id: 'sp_uaf_matriz', label: 'Matriz UAF' }
                  ].map(r => (
                    <button key={r.id} onClick={() => setReportType(r.id)} className={`w-full p-4 rounded-2xl text-[10px] font-black text-left uppercase transition-all ${reportType === r.id ? 'bg-emerald-50 text-[#14532D] border border-emerald-100' : 'text-slate-400 hover:bg-slate-50'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <button onClick={runReport} disabled={loading} className="w-full py-4 bg-[#14532D] text-white rounded-2xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all">
                  {loading ? 'GENERANDO...' : 'GENERAR REPORTE'}
                </button>
             </div>
          </div>

          <div className="lg:col-span-3">
             <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[500px]">
                {data.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="px-10 py-6 text-left">Código</th>
                          <th className="px-10 py-6 text-left">Denominación</th>
                          <th className="px-10 py-6 text-right">Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-10 py-5 font-black text-[#14532D]">{row.code || i+100}</td>
                            <td className="px-10 py-5 font-bold text-slate-700 uppercase">{row.name || 'Registro del Core'}</td>
                            <td className="px-10 py-5 text-right font-black">${(row.balance || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-20 text-slate-200">
                    <FileBarChart size={80} className="mb-4 opacity-20" />
                    <p className="font-black uppercase tracking-widest text-xs">Aún no se han generado datos</p>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};
