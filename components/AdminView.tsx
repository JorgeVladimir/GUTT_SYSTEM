
import React, { useState, useRef } from 'react';
import { User, AccountType, InterestRate, GlobalConfig, UserRole } from '../types';
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
  DollarSign
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getNextMemberNumber = () => {
    const memberUsers = users.filter(u => u.role === UserRole.MEMBER && u.memberNumber);
    if (memberUsers.length === 0) return "1";
    const maxNum = Math.max(...memberUsers.map(u => parseInt(u.memberNumber || "0")));
    return (maxNum + 1).toString();
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    let finalUser = { ...editingUser };
    if (!finalUser.memberNumber && finalUser.role === UserRole.MEMBER) {
      finalUser.memberNumber = getNextMemberNumber();
    }

    if (finalUser.firstName && finalUser.lastName) {
      finalUser.name = `${finalUser.firstName.trim()} ${finalUser.onlyOneName ? '' : (finalUser.middleName || '').trim()} ${finalUser.lastName.trim()}`.replace(/\s+/g, ' ').toUpperCase();
    }

    const updatedUsers = users.map(u => u.id === finalUser.id ? finalUser : u);
    onRestoreDatabase({ users: updatedUsers, rates, config });
    setEditingUser(null);
    alert("Socio actualizado con éxito en el núcleo central.");
  };

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 animate-in fade-in duration-700">
      {/* Admin Hero Header */}
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
               <p className="text-slate-400 font-medium max-w-md">Gestión integral de socios y políticas crediticias.</p>
             </div>
          </div>

          <div className="bg-slate-50 p-2 rounded-[2.5rem] border border-slate-100 flex gap-1 shadow-inner overflow-x-auto max-w-full no-scrollbar">
            {[
              { id: 'SUMMARY', label: 'Dashboard', icon: <PieChart size={18} /> },
              { id: 'MEMBERS', label: 'Gestión Socios', icon: <Users size={18} /> },
              { id: 'TASAS', label: 'Políticas Tasas', icon: <Percent size={18} /> },
              { id: 'SEGURIDAD', label: 'Seguridad', icon: <Database size={18} /> },
            ].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id as any)} 
                className={`flex items-center gap-3 px-8 py-4 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 whitespace-nowrap ${
                  activeTab === tab.id 
                  ? 'bg-[#14532D] text-white shadow-xl scale-105' 
                  : 'text-slate-400 hover:text-[#14532D] hover:bg-white'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'MEMBERS' && (
        <div className="bg-white rounded-[4rem] border border-slate-100 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-12 duration-700">
          <div className="p-10 border-b flex flex-col md:flex-row justify-between items-center gap-6 bg-slate-50/50">
             <div>
               <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Gestión Social Core</h3>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base de Datos de Socios Registrados</p>
             </div>
             <div className="relative w-full md:w-80">
                <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input type="text" placeholder="Filtrar por cédula o nombre..." className="w-full pl-14 pr-6 py-4 bg-white border-2 border-slate-100 rounded-[2rem] outline-none font-bold text-[#14532D] text-sm focus:border-[#14532D] shadow-inner" />
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="px-10 py-7 text-left">Nro Socio</th>
                  <th className="px-10 py-7 text-left">Identificación</th>
                  <th className="px-10 py-7 text-left">Titular</th>
                  <th className="px-10 py-7 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.filter(u => u.role === UserRole.MEMBER).map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors group cursor-default">
                    <td className="px-10 py-6 font-black text-slate-300 italic text-base">#{u.memberNumber || 'S/N'}</td>
                    <td className="px-10 py-6 font-black text-[#14532D] text-lg">{u.id}</td>
                    <td className="px-10 py-6">
                      <p className="font-black text-slate-700 uppercase">{u.name}</p>
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter">{u.email}</p>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <button 
                        onClick={() => {
                          const parts = u.name.split(' ');
                          setEditingUser({
                            ...u,
                            firstName: u.firstName || parts[0] || '',
                            middleName: u.middleName || (parts.length > 2 ? parts[1] : ''),
                            lastName: u.lastName || (parts.length > 2 ? parts.slice(2).join(' ') : parts[1] || ''),
                            onlyOneName: u.onlyOneName ?? (parts.length <= 2)
                          });
                          setEditorSubTab('IDENTIDAD');
                        }} 
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

      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setEditingUser(null)}></div>
          
          <div className="relative w-full max-w-4xl bg-white rounded-[4.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-500 border-2 border-slate-100">
            {/* Header */}
            <div className="p-10 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-emerald-50 text-[#14532D] rounded-3xl flex items-center justify-center shadow-inner">
                  <UserIcon size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">
                    FICHA SOCIO #<span className="text-[#14532D]">{editingUser.memberNumber || 'S/N'}</span>
                  </h3>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em] mt-1">GESTIÓN ADMINISTRATIVA</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-4 hover:bg-slate-50 text-slate-300 hover:text-slate-600 rounded-full transition-all">
                <X size={28} />
              </button>
            </div>

            {/* Sub-Navegación Pill-Tabs */}
            <div className="bg-slate-50/50 p-3 flex gap-1 border-y">
              {['IDENTIDAD', 'LOCALIZACIÓN', 'ACTIVIDAD', 'OTROS'].map(st => (
                <button 
                  key={st} 
                  onClick={() => setEditorSubTab(st as any)} 
                  className={`px-8 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                    editorSubTab === st 
                    ? 'bg-white text-[#14532D] shadow-md' 
                    : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <form onSubmit={handleUpdateUser} className="flex-1 overflow-y-auto p-12 space-y-10">
              {editorSubTab === 'IDENTIDAD' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primer Nombre</label>
                    <input type="text" value={editingUser.firstName || ''} onChange={e => setEditingUser({...editingUser, firstName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                  </div>
                  {!editingUser.onlyOneName && (
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Segundo Nombre</label>
                      <input type="text" value={editingUser.middleName || ''} onChange={e => setEditingUser({...editingUser, middleName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                    </div>
                  )}
                  <div className="col-span-full flex items-center gap-3">
                    <input type="checkbox" id="onlyOne" checked={editingUser.onlyOneName} onChange={e => setEditingUser({...editingUser, onlyOneName: e.target.checked, middleName: e.target.checked ? '' : editingUser.middleName})} className="w-5 h-5 accent-[#14532D]" />
                    <label htmlFor="onlyOne" className="text-[10px] font-black text-slate-600 uppercase">POSEO UN SOLO NOMBRE</label>
                  </div>
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Apellidos Completos</label>
                    <input type="text" value={editingUser.lastName || ''} onChange={e => setEditingUser({...editingUser, lastName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                  </div>
                </div>
              )}

              {editorSubTab === 'LOCALIZACIÓN' && (
                <div className="grid grid-cols-1 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">País de Residencia</label>
                    <select value={editingUser.residenceCountry || 'ECUADOR'} onChange={e => setEditingUser({...editingUser, residenceCountry: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase appearance-none focus:ring-2 focus:ring-[#14532D]/20 outline-none">
                      {SEPS_CATALOGS.COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección Domiciliaria</label>
                    <input type="text" value={editingUser.address || ''} onChange={e => setEditingUser({...editingUser, address: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                  </div>
                </div>
              )}

              {editorSubTab === 'ACTIVIDAD' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-300">
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ACTIVIDAD PRINCIPAL (SEPS)</label>
                    <div className="relative">
                      <select value={editingUser.profession || 'SIN ACTIVIDAD'} onChange={e => setEditingUser({...editingUser, profession: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-[1.5rem] font-black text-[#14532D] uppercase appearance-none focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-sm cursor-pointer">
                        {SEPS_CATALOGS.OCCUPATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={24} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nivel de Instrucción</label>
                    <select value={editingUser.instructionLevel || 'SIN INSTRUCCIÓN'} onChange={e => setEditingUser({...editingUser, instructionLevel: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase appearance-none focus:ring-2 focus:ring-[#14532D]/20 outline-none">
                      {SEPS_CATALOGS.INSTRUCTION.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ingresos Mensuales Promedio</label>
                    <div className="relative">
                       <DollarSign size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                       <input type="number" placeholder="0.00" className="w-full pl-14 pr-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                    </div>
                  </div>

                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Lugar de Trabajo / Razón Social</label>
                    <input type="text" placeholder="NOMBRE DE LA EMPRESA O NEGOCIO" className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                  </div>
                </div>
              )}

              {editorSubTab === 'OTROS' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico</label>
                    <input type="email" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value.toLowerCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] lowercase focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono Contacto</label>
                    <input type="text" value={editingUser.phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] focus:ring-2 focus:ring-[#14532D]/20 outline-none" />
                  </div>
                </div>
              )}

              {/* Botones Estilo Produbanco */}
              <div className="sticky bottom-0 bg-white py-10 border-t flex gap-6 mt-10">
                <button type="submit" className="flex-[2] py-6 bg-[#14532D] text-white rounded-full font-black text-xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-1 active:border-b-0 transition-all uppercase tracking-tighter">
                  GUARDAR CAMBIOS
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
