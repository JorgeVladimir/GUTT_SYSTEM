
import React, { useState, useRef, useMemo } from 'react';
import { User, AccountType, InterestRate, GlobalConfig, UserRole, Loan, PersonalReference, Dependent } from '../types';
import { SEPS_CATALOGS } from '../constants';
import { 
  Users, 
  TrendingUp, 
  PieChart, 
  ShieldCheck,
  Save,
  Database,
  Upload,
  Settings,
  Edit2,
  X,
  User as UserIcon,
  MapPin,
  Briefcase,
  FileText,
  Fingerprint,
  Globe,
  Lock,
  Download,
  ShieldAlert,
  Percent,
  Info,
  ChevronRight,
  ChevronDown,
  Activity,
  History,
  ShieldQuestion,
  Search,
  Check,
  Mail,
  Smartphone,
  Hash,
  DollarSign,
  FileJson,
  RotateCcw,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Image as ImageIcon,
  Map as MapIcon,
  Baby,
  Users2,
  Phone,
  BarChart3,
  Calendar,
  Trash2,
  PlusCircle,
  Loader2
} from 'lucide-react';

interface AdminViewProps {
  users: User[];
  rates: InterestRate[];
  config: GlobalConfig;
  onUpdateRates: (rates: InterestRate[]) => void;
  onUpdateConfig: (config: GlobalConfig) => void;
  onRestoreDatabase: (data: { users: User[], rates: InterestRate[], config?: GlobalConfig }) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({ users, rates, config, onUpdateRates, onUpdateConfig, onRestoreDatabase }) => {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'MEMBERS' | 'TASAS' | 'SEGURIDAD'>('SUMMARY');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editorSubTab, setEditorSubTab] = useState<'IDENTIDAD' | 'LOCALIZACIÓN' | 'ACTIVIDAD' | 'OTROS'>('IDENTIDAD');
  const [isSaving, setIsSaving] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sketchInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const members = users.filter(u => u.role === UserRole.MEMBER);
    const totalSavings = members.reduce((acc, u) => acc + (u.accounts.find(a => a.type === AccountType.SAVINGS)?.balance || 0), 0);
    const totalCertificates = members.reduce((acc, u) => acc + (u.accounts.find(a => a.type === AccountType.CERTIFICATE)?.balance || 0), 0);
    const activeLoans = members.flatMap(u => (u.loans || []).filter(l => l.status === 'VIGENTE'));
    const totalPortfolio = activeLoans.reduce((acc, l) => acc + l.balance, 0);
    
    return {
      memberCount: members.length,
      totalSavings,
      totalCertificates,
      totalPortfolio,
      solvency: totalCertificates > 0 ? ((totalCertificates / totalSavings) * 100).toFixed(2) : "0.00"
    };
  }, [users]);

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSaving(true);
    
    setTimeout(() => {
      let finalUser = { ...editingUser };
      if (finalUser.firstName && finalUser.lastName) {
        finalUser.name = `${finalUser.firstName.trim()} ${finalUser.onlyOneName ? '' : (finalUser.middleName || '').trim()} ${finalUser.lastName.trim()}`.replace(/\s+/g, ' ').toUpperCase();
      }

      const updatedUsers = users.map(u => u.id === finalUser.id ? finalUser : u);
      onRestoreDatabase({ users: updatedUsers, rates, config });
      setEditingUser(null);
      setIsSaving(false);
      alert("Socio actualizado con éxito en el Core.");
    }, 800);
  };

  const exportDatabase = () => {
    const dataStr = JSON.stringify({ users, rates, config }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `BAK_PATATE_CORE_${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importDatabase = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.users && json.rates) {
          onRestoreDatabase(json);
          alert("Base de Datos restaurada correctamente.");
        } else alert("Formato de archivo no válido para el Core Patate.");
      } catch (err) { alert("Error crítico al procesar el archivo de respaldo."); }
    };
    reader.readAsText(file);
  };

  const handleSketchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && editingUser) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          setEditingUser(p => p ? { ...p, homeSketch: [...(p.homeSketch || []), base64] } : null);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 animate-in fade-in duration-700">
      {/* Header Administrativo Premium */}
      <div className="bg-white rounded-[4rem] p-10 lg:p-14 shadow-2xl border border-slate-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-gradient-to-l from-emerald-50 to-transparent"></div>
        <div className="relative z-10 flex flex-col xl:flex-row justify-between items-center gap-10">
          <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
             <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full"></div>
                <div className="w-24 h-24 bg-[#14532D] text-white rounded-[2.5rem] flex items-center justify-center shadow-inner relative border-2 border-white">
                  <ShieldCheck size={48} strokeWidth={1.5} />
                </div>
             </div>
             <div>
               <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                 <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                 <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em]">Sistema de Control Central</p>
               </div>
               <h2 className="text-5xl font-black text-slate-900 tracking-tighter leading-none mb-3">Portal Administrativo</h2>
               <p className="text-slate-400 font-medium max-w-md">Gestión de Core Bancario, Tasas de Interés y Seguridad.</p>
             </div>
          </div>
          
          <div className="bg-slate-50 p-2 rounded-[2.5rem] border border-slate-100 flex gap-1 shadow-inner overflow-x-auto max-w-full no-scrollbar">
            {[
              { id: 'SUMMARY', label: 'Dashboard', icon: <BarChart3 size={18} /> },
              { id: 'MEMBERS', label: 'Socios', icon: <Users size={18} /> },
              { id: 'TASAS', label: 'Tasas BCE', icon: <Percent size={18} /> },
              { id: 'SEGURIDAD', label: 'Seguridad', icon: <Database size={18} /> }
            ].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex items-center gap-3 px-8 py-4 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${activeTab === tab.id ? 'bg-[#14532D] text-white shadow-xl scale-105' : 'text-slate-400 hover:text-[#14532D] hover:bg-white'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'SUMMARY' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 animate-in slide-in-from-bottom-8 duration-700">
           {[
             { label: 'SOCIOS ACTIVOS', val: stats.memberCount, icon: <Users size={28} />, color: 'bg-emerald-500', detail: 'Registrados en Core' },
             { label: 'PATRIMONIO AHORRO', val: `$${stats.totalSavings.toLocaleString()}`, icon: <Wallet size={28} />, color: 'bg-emerald-600', detail: 'Cuentas a la Vista' },
             { label: 'CARTERA VIGENTE', val: `$${stats.totalPortfolio.toLocaleString()}`, icon: <TrendingUp size={28} />, color: 'bg-blue-600', detail: 'Colocación Total' },
             { label: 'INDICE SOLVENCIA', val: `${stats.solvency}%`, icon: <Activity size={28} />, color: 'bg-emerald-800', detail: 'Certificados vs Ahorros' }
           ].map((item, i) => (
             <div key={i} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-2xl transition-all">
                <div className={`absolute top-0 right-0 p-8 opacity-5 transition-transform group-hover:scale-125 ${item.color.replace('bg-', 'text-')}`}>
                  {item.icon}
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
                <p className="text-3xl font-black text-slate-900 mb-6">{item.val}</p>
                <div className="flex items-center gap-2">
                   <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase">{item.detail}</p>
                </div>
             </div>
           ))}
        </div>
      )}

      {activeTab === 'MEMBERS' && (
        <div className="bg-white rounded-[4rem] border border-slate-100 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-12 duration-700">
          <div className="p-10 border-b flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/50">
             <div>
               <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Directorio de Socios Patate</h3>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gestión de Cuentas y Fichas SEPS</p>
             </div>
             <div className="relative w-full md:w-80">
                <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input type="text" placeholder="Filtrar socio..." className="w-full pl-14 pr-6 py-4 bg-white border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-[#14532D] text-sm focus:border-[#14532D] shadow-inner" />
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-10 py-7 text-left">Nro Socio</th>
                  <th className="px-10 py-7 text-left">Identificación</th>
                  <th className="px-10 py-7 text-left">Nombres Completos</th>
                  <th className="px-10 py-7 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.filter(u => u.role === UserRole.MEMBER).map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-10 py-6 font-black text-slate-300 italic text-base">#{u.memberNumber || 'S/N'}</td>
                    <td className="px-10 py-6 font-black text-[#14532D] text-lg">{u.id}</td>
                    <td className="px-10 py-6 font-black text-slate-700 uppercase">{u.name}</td>
                    <td className="px-10 py-6 text-right">
                      <button 
                        onClick={() => setEditingUser({ ...u, references: u.references || [], dependents: u.dependents || [], homeSketch: u.homeSketch || [] })} 
                        className="p-4 bg-emerald-50 text-[#14532D] rounded-2xl hover:bg-[#14532D] hover:text-white transition-all shadow-sm group-hover:scale-110"
                      >
                        <Edit2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'TASAS' && (
        <div className="bg-white rounded-[4rem] border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in duration-700">
           <div className="p-10 border-b bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-6">
             <div>
               <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Política de Tasas de Interés (BCE)</h3>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ajuste de Productos Financieros</p>
             </div>
             <div className="px-6 py-3 bg-blue-50 text-blue-700 rounded-2xl text-[10px] font-black uppercase flex items-center gap-2">
                <Info size={16} /> Tasas vigentes del Banco Central
             </div>
           </div>
           <div className="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {rates.map((rate, idx) => (
                <div key={rate.id} className="p-8 bg-slate-50 rounded-3xl border border-slate-100 space-y-6 group hover:bg-white hover:shadow-xl transition-all border-b-4 border-b-transparent hover:border-b-[#14532D]">
                   <div className="flex justify-between items-start">
                      <h4 className="font-black text-slate-800 uppercase tracking-tight leading-tight max-w-[160px]">{rate.category}</h4>
                      <span className="p-2 bg-[#14532D] text-white rounded-lg text-[10px] font-black">{rate.id}</span>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase">Anual (%)</label>
                         <input 
                           type="number" step="0.01" value={rate.rate} 
                           onChange={e => {
                             const newRates = [...rates];
                             newRates[idx] = { ...rate, rate: parseFloat(e.target.value) };
                             onUpdateRates(newRates);
                           }}
                           className="w-full p-4 bg-white border border-slate-200 rounded-xl font-black text-[#14532D] shadow-inner outline-none focus:border-[#14532D] transition-all" 
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[9px] font-black text-slate-400 uppercase">Plazo (M)</label>
                         <input 
                           type="number" value={rate.maxTerm} 
                           onChange={e => {
                             const newRates = [...rates];
                             newRates[idx] = { ...rate, maxTerm: parseInt(e.target.value) };
                             onUpdateRates(newRates);
                           }}
                           className="w-full p-4 bg-white border border-slate-200 rounded-xl font-black text-[#14532D] shadow-inner outline-none focus:border-[#14532D] transition-all" 
                         />
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}

      {activeTab === 'SEGURIDAD' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in zoom-in-95 duration-700">
           <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100 space-y-10">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
                  <Database size={24} className="text-[#14532D]" /> Mantenimiento del Core
                </h3>
                <p className="text-slate-400 text-xs mt-2">Gestione respaldos y recuperación de desastres.</p>
              </div>
              <div className="space-y-6">
                 <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between group cursor-pointer hover:bg-emerald-50 transition-all shadow-sm" onClick={exportDatabase}>
                    <div className="flex items-center gap-4">
                       <div className="p-4 bg-white rounded-2xl text-emerald-600 shadow-sm border border-emerald-50 group-hover:scale-110 transition-transform"><Download size={24} /></div>
                       <div>
                          <p className="text-sm font-black text-slate-800">Exportar Base de Datos</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Respaldo Integral .JSON</p>
                       </div>
                    </div>
                    <ChevronRight size={20} className="text-slate-200 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                 </div>
                 
                 <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between group cursor-pointer hover:bg-blue-50 transition-all shadow-sm" onClick={() => fileInputRef.current?.click()}>
                    <div className="flex items-center gap-4">
                       <div className="p-4 bg-white rounded-2xl text-blue-600 shadow-sm border border-blue-50 group-hover:scale-110 transition-transform"><Upload size={24} /></div>
                       <div>
                          <p className="text-sm font-black text-slate-800">Restauración de Sistema</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Cargar backup externo</p>
                       </div>
                    </div>
                    <ChevronRight size={20} className="text-slate-200 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                    <input type="file" ref={fileInputRef} onChange={importDatabase} className="hidden" accept=".json" />
                 </div>
              </div>
           </div>

           <div className="bg-[#14532D] p-10 rounded-[4rem] shadow-2xl text-white relative overflow-hidden flex flex-col justify-between">
              <div className="relative z-10">
                <div className="flex justify-between items-start">
                   <div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter">Parámetros de Crédito</h3>
                      <p className="text-emerald-300 text-xs font-bold uppercase tracking-widest mt-1">Configuración Global de Montos</p>
                   </div>
                   <Settings className="text-[#FACC15] animate-spin-slow" size={32} />
                </div>
                <div className="grid grid-cols-2 gap-8 mt-12">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Crédito Mínimo ($)</label>
                      <input type="number" value={config.minLoanAmount} onChange={e => onUpdateConfig({...config, minLoanAmount: parseFloat(e.target.value)})} className="w-full p-5 bg-white/10 border border-white/20 rounded-2xl font-black text-2xl text-white outline-none focus:bg-white/20 transition-all text-center" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Crédito Máximo ($)</label>
                      <input type="number" value={config.maxLoanAmount} onChange={e => onUpdateConfig({...config, maxLoanAmount: parseFloat(e.target.value)})} className="w-full p-5 bg-white/10 border border-white/20 rounded-2xl font-black text-2xl text-white outline-none focus:bg-white/20 transition-all text-center" />
                   </div>
                </div>
                <div className="mt-10 p-5 bg-black/20 rounded-3xl border border-white/10 flex gap-4 items-center">
                   <ShieldAlert size={28} className="text-[#FACC15] shrink-0" />
                   <p className="text-[10px] font-bold text-emerald-50/80 leading-relaxed uppercase">La modificación de estos rangos restringe automáticamente el simulador de los socios.</p>
                </div>
              </div>
              <ShieldCheck className="absolute right-[-40px] bottom-[-40px] text-white/5" size={240} />
           </div>
        </div>
      )}

      {/* Modal Ficha Integral de Socio */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setEditingUser(null)}></div>
          <div className="relative w-full max-w-5xl bg-white rounded-[4rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-500 border border-slate-100">
            <div className="p-10 flex justify-between items-center bg-white sticky top-0 z-10 border-b border-slate-50">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-emerald-50 text-[#14532D] rounded-3xl flex items-center justify-center shadow-inner">
                  <UserIcon size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                    FICHA SOCIO #<span className="text-[#14532D]">{editingUser.memberNumber || 'S/N'}</span>
                  </h3>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mt-1">NÚCLEO SEPS S01</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-4 hover:bg-slate-50 text-slate-300 hover:text-slate-600 rounded-full transition-all">
                <X size={28} />
              </button>
            </div>

            <div className="bg-slate-50/50 p-3 flex gap-1 border-b">
              {['IDENTIDAD', 'LOCALIZACIÓN', 'ACTIVIDAD', 'OTROS'].map(st => (
                <button 
                  key={st} 
                  onClick={() => setEditorSubTab(st as any)} 
                  className={`px-8 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${editorSubTab === st ? 'bg-white text-[#14532D] shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {st}
                </button>
              ))}
            </div>

            <form onSubmit={handleUpdateUser} className="flex-1 overflow-y-auto p-12 space-y-12">
              {editorSubTab === 'IDENTIDAD' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primer Nombre</label>
                    <input required type="text" value={editingUser.firstName || ''} onChange={e => setEditingUser({...editingUser, firstName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-4 focus:ring-[#14532D]/10 outline-none" />
                  </div>
                  {!editingUser.onlyOneName && (
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Segundo Nombre</label>
                      <input type="text" value={editingUser.middleName || ''} onChange={e => setEditingUser({...editingUser, middleName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-4 focus:ring-[#14532D]/10 outline-none" />
                    </div>
                  )}
                  <div className="col-span-full flex items-center gap-3">
                    <input type="checkbox" id="onlyOneEdit" checked={editingUser.onlyOneName} onChange={e => setEditingUser({...editingUser, onlyOneName: e.target.checked, middleName: e.target.checked ? '' : editingUser.middleName})} className="w-5 h-5 accent-[#14532D]" />
                    <label htmlFor="onlyOneEdit" className="text-[10px] font-black text-slate-600 uppercase">POSEE UN SOLO NOMBRE LEGAL</label>
                  </div>
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Apellidos Completos</label>
                    <input required type="text" value={editingUser.lastName || ''} onChange={e => setEditingUser({...editingUser, lastName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-4 focus:ring-[#14532D]/10 outline-none" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado Civil</label>
                    <select value={editingUser.maritalStatus || 'SOLTERO'} onChange={e => setEditingUser({...editingUser, maritalStatus: e.target.value as any})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase outline-none focus:ring-4 focus:ring-[#14532D]/10">
                      {SEPS_CATALOGS.MARITAL_STATUS.map(ms => <option key={ms} value={ms}>{ms}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Género</label>
                    <select value={editingUser.gender || 'MASCULINO'} onChange={e => setEditingUser({...editingUser, gender: e.target.value as any})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase outline-none focus:ring-4 focus:ring-[#14532D]/10">
                      {SEPS_CATALOGS.GENDER.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {editorSubTab === 'LOCALIZACIÓN' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="col-span-full p-6 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4">
                    <MapPin size={24} className="text-blue-600 shrink-0" />
                    <p className="text-xs font-bold text-blue-900 leading-tight">Dirección residencial validada por coordenadas y croquis.</p>
                  </div>
                  <div className="space-y-4 col-span-full">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección Exacta Domicilio</label>
                    <textarea value={editingUser.address || ''} onChange={e => setEditingUser({ ...editingUser, address: e.target.value.toUpperCase() })} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] h-24 outline-none resize-none focus:ring-4 focus:ring-blue-500/10" />
                  </div>
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><ImageIcon size={14}/> Croquis Digitalizados</label>
                    <div className="flex flex-wrap gap-4">
                      <button type="button" onClick={() => sketchInputRef.current?.click()} className="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300">
                        <PlusCircle size={24}/>
                        <span className="text-[8px] font-black uppercase mt-1">Nuevo</span>
                      </button>
                      <input type="file" multiple accept="image/*" ref={sketchInputRef} onChange={handleSketchUpload} className="hidden" />
                      {editingUser.homeSketch?.map((img, i) => (
                        <div key={i} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-md group">
                          <img src={img} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setEditingUser(p => p ? {...p, homeSketch: p.homeSketch?.filter((_, idx) => idx !== i)} : null)} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={18}/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {editorSubTab === 'OTROS' && (
                <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6">
                    <div className="flex justify-between items-center border-l-4 border-purple-500 pl-4">
                      <h4 className="text-[11px] font-black text-purple-700 uppercase tracking-widest flex items-center gap-2"><Baby size={18} /> Cargas Familiares</h4>
                      <button type="button" onClick={() => setEditingUser(p => p ? {...p, dependents: [...(p.dependents || []), {id: '', name: '', relationship: 'OTRO'}]} : null)} className="p-2 bg-purple-100 text-purple-700 rounded-xl transition-all"><PlusCircle size={18}/></button>
                    </div>
                    <div className="space-y-4">
                      {editingUser.dependents?.map((dep, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end relative group shadow-sm">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase">Cédula</label>
                            <input type="text" value={dep.id} onChange={e => {
                              const updated = [...(editingUser.dependents || [])];
                              updated[idx] = {...updated[idx], id: e.target.value};
                              setEditingUser({...editingUser, dependents: updated});
                            }} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase">Nombre</label>
                            <input type="text" value={dep.name} onChange={e => {
                              const updated = [...(editingUser.dependents || [])];
                              updated[idx] = {...updated[idx], name: e.target.value.toUpperCase()};
                              setEditingUser({...editingUser, dependents: updated});
                            }} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                          </div>
                          <button type="button" onClick={() => setEditingUser(p => p ? {...p, dependents: p.dependents?.filter((_, i) => i !== idx)} : null)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6">
                    <div className="flex justify-between items-center border-l-4 border-amber-500 pl-4">
                      <h4 className="text-[11px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2"><Phone size={18} /> Referencias Personales</h4>
                      <button type="button" onClick={() => setEditingUser(p => p ? {...p, references: [...(p.references || []), {name: '', phone: '', relationship: 'OTRO'}]} : null)} className="p-2 bg-amber-100 text-amber-700 rounded-xl transition-all"><PlusCircle size={18}/></button>
                    </div>
                    <div className="space-y-4">
                      {editingUser.references?.map((ref, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end relative group shadow-sm">
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase">Nombre Referencia</label>
                            <input type="text" value={ref.name} onChange={e => {
                              const updated = [...(editingUser.references || [])];
                              updated[idx] = {...updated[idx], name: e.target.value.toUpperCase()};
                              setEditingUser({...editingUser, references: updated});
                            }} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase">Teléfono</label>
                            <input type="text" value={ref.phone} onChange={e => {
                              const updated = [...(editingUser.references || [])];
                              updated[idx] = {...updated[idx], phone: e.target.value};
                              setEditingUser({...editingUser, references: updated});
                            }} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                          </div>
                          <button type="button" onClick={() => setEditingUser(p => p ? {...p, references: p.references?.filter((_, i) => i !== idx)} : null)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="sticky bottom-0 bg-white py-10 border-t flex gap-6 mt-10">
                <button type="submit" disabled={isSaving} className="flex-[2] py-6 bg-[#14532D] text-white rounded-full font-black text-xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-1 active:border-b-0 transition-all uppercase tracking-tighter flex items-center justify-center gap-3 group">
                  {isSaving ? <Loader2 className="animate-spin" /> : <><Save size={24} className="group-hover:scale-125 transition-transform" /> SINCRONIZAR CORE PATATE</>}
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-6 bg-slate-100 text-slate-500 rounded-full font-black text-xl uppercase tracking-tighter hover:bg-slate-200 transition-colors">
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
