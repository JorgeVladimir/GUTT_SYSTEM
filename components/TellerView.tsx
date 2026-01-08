
import React, { useState, useMemo } from 'react';
import { User, Transaction, AccountType, UserRole, Account } from '../types';
import { SEPS_CATALOGS } from '../constants';
import { 
  Search, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Banknote, 
  UserPlus, 
  Save, 
  Calculator,
  Plus,
  Minus,
  Coins,
  Edit2,
  X,
  FileText,
  MapPin,
  Briefcase,
  Fingerprint,
  User as UserIcon,
  CheckCircle2,
  Globe,
  Lock,
  Mail,
  Smartphone,
  ChevronDown,
  DollarSign,
  UserCheck
} from 'lucide-react';

interface TellerViewProps {
  users: User[];
  onUpdateUser: (user: User) => void;
  currentUserRole?: UserRole;
}

export const TellerView: React.FC<TellerViewProps> = ({ users, onUpdateUser, currentUserRole }) => {
  const [activeTab, setActiveTab] = useState<'OPERATIONS' | 'REGISTER' | 'CONSULTAS'>('OPERATIONS');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [opType, setOpType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  
  // Estado para Nuevo Socio en Ventanilla
  const [newMember, setNewMember] = useState<Partial<User>>({
    id: '',
    firstName: '',
    middleName: '',
    lastName: '',
    onlyOneName: false,
    email: '',
    phone: '',
    address: '',
    residenceCountry: 'ECUADOR',
    profession: 'SIN ACTIVIDAD ECONÓMICA',
    instructionLevel: 'SIN INSTRUCCIÓN',
    role: UserRole.MEMBER
  });

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editorSubTab, setEditorSubTab] = useState<'IDENTIDAD' | 'LOCALIZACIÓN' | 'ACTIVIDAD' | 'OTROS'>('IDENTIDAD');
  const [querySearch, setQuerySearch] = useState('');

  const [denominations, setDenominations] = useState<Record<string, number>>({
    "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0, "0.50": 0, "0.25": 0, "0.10": 0, "0.05": 0, "0.01": 0
  });

  const filteredUsersForQuery = useMemo(() => {
    const q = querySearch.trim().toLowerCase();
    return users.filter(u => 
      u.role === UserRole.MEMBER && 
      (u.id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    );
  }, [users, querySearch]);

  const totalDenominations = useMemo(() => {
    return Object.entries(denominations).reduce((acc: number, [denom, count]: [string, number]) => acc + (parseFloat(denom) * count), 0);
  }, [denominations]);

  const diff = useMemo(() => (parseFloat(amount) || 0) - totalDenominations, [amount, totalDenominations]);

  const handleSearch = () => {
    const cleanSearch = search.trim().toLowerCase();
    const found = users.find(u => u.id === cleanSearch || u.name.toLowerCase().includes(cleanSearch));
    if (found) {
      setSelectedUser(found);
      setDenominations({ "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0, "0.50": 0, "0.25": 0, "0.10": 0, "0.05": 0, "0.01": 0 });
    } else alert("Socio no encontrado.");
  };

  const handleCreateMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.id || !newMember.firstName || !newMember.lastName) return alert("Complete los campos obligatorios.");
    
    if (users.some(u => u.id === newMember.id)) return alert("El socio ya se encuentra registrado en el sistema.");

    const fullName = `${newMember.firstName.trim()} ${newMember.onlyOneName ? '' : (newMember.middleName || '').trim()} ${newMember.lastName.trim()}`.replace(/\s+/g, ' ').toUpperCase();
    
    const savAcc = { 
      id: `sav-${newMember.id}`, 
      type: AccountType.SAVINGS, 
      number: `01${Math.floor(100000 + Math.random()*899999)}`, 
      balance: 0, 
      currency: 'USD' 
    };
    const certAcc = { 
      id: `cert-${newMember.id}`, 
      type: AccountType.CERTIFICATE, 
      number: `02${Math.floor(100000 + Math.random()*899999)}`, 
      balance: 0, 
      currency: 'USD' 
    };

    const newUser: User = { 
      ...newMember,
      id: newMember.id!, 
      name: fullName, 
      pin: '1234', // PIN por defecto para primer ingreso
      role: UserRole.MEMBER, 
      accounts: [savAcc, certAcc], 
      transactions: [], 
      loans: [],
      needsPinChange: true, // Forzar cambio de PIN en primer acceso
      registrationDate: new Date().toLocaleDateString('es-EC')
    } as User;

    onUpdateUser(newUser);
    setNewMember({ id: '', firstName: '', middleName: '', lastName: '', onlyOneName: false, residenceCountry: 'ECUADOR', profession: 'SIN ACTIVIDAD ECONÓMICA', role: UserRole.MEMBER });
    setActiveTab('CONSULTAS');
    alert(`Socio ${fullName} registrado con éxito. Su PIN temporal es 1234.`);
  };

  const handleUpdateUserInCore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    let finalUser = { ...editingUser };
    if (finalUser.firstName && finalUser.lastName) {
      finalUser.name = `${finalUser.firstName.trim()} ${finalUser.onlyOneName ? '' : (finalUser.middleName || '').trim()} ${finalUser.lastName.trim()}`.replace(/\s+/g, ' ').toUpperCase();
    }
    onUpdateUser(finalUser);
    setEditingUser(null);
    alert("Socio actualizado en el núcleo central.");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 no-print">
      <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 flex gap-2 overflow-x-auto sticky top-0 z-20">
        <button onClick={() => setActiveTab('OPERATIONS')} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${activeTab === 'OPERATIONS' ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}><Banknote size={18} /> OPERACIONES CAJA</button>
        <button onClick={() => setActiveTab('CONSULTAS')} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${activeTab === 'CONSULTAS' ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}><Search size={18} /> CONSULTAS / MODIFICAR</button>
        <button onClick={() => setActiveTab('REGISTER')} className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${activeTab === 'REGISTER' ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}><UserPlus size={18} /> NUEVO SOCIO</button>
      </div>

      {activeTab === 'OPERATIONS' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-xl font-black text-[#14532D] mb-6 flex items-center gap-2"><Search size={20} /> Buscar Socio</h3>
              <div className="flex gap-2">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cédula o Nombre..." className="flex-1 px-6 py-4 bg-slate-100 border-2 border-slate-200 rounded-2xl focus:border-[#14532D] outline-none font-black text-[#14532D]" />
                <button onClick={handleSearch} className="p-4 bg-[#14532D] text-white rounded-2xl transition-transform active:scale-95"><Search size={20}/></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'REGISTER' && (
        <div className="bg-white rounded-[4rem] shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
          <div className="p-10 border-b bg-slate-50/50 flex items-center gap-6">
            <div className="w-16 h-16 bg-emerald-50 text-[#14532D] rounded-[2rem] flex items-center justify-center shadow-inner">
               <UserPlus size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Apertura de Cuenta</h3>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Nuevo Registro de Socio Patate</p>
            </div>
          </div>
          
          <form onSubmit={handleCreateMember} className="p-12 space-y-12">
            {/* Sección: Identidad */}
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-6 bg-[#14532D] rounded-full"></span>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Datos de Identidad</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Cédula Identidad</label>
                  <input required type="text" maxLength={10} value={newMember.id} onChange={e => setNewMember({...newMember, id: e.target.value.replace(/\D/g, '')})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] text-lg focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" placeholder="000000000-0" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Primer Nombre</label>
                  <input required type="text" value={newMember.firstName} onChange={e => setNewMember({...newMember, firstName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" />
                </div>
                {!newMember.onlyOneName && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Segundo Nombre</label>
                    <input type="text" value={newMember.middleName} onChange={e => setNewMember({...newMember, middleName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" />
                  </div>
                )}
                <div className="col-span-full space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Apellidos Completos</label>
                  <input required type="text" value={newMember.lastName} onChange={e => setNewMember({...newMember, lastName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" />
                </div>
                <div className="col-span-full flex items-center gap-3 ml-2">
                  <input type="checkbox" id="teller_onlyOne" checked={newMember.onlyOneName} onChange={e => setNewMember({...newMember, onlyOneName: e.target.checked, middleName: e.target.checked ? '' : newMember.middleName})} className="w-5 h-5 accent-[#14532D] cursor-pointer" />
                  <label htmlFor="teller_onlyOne" className="text-[10px] font-black text-slate-400 uppercase cursor-pointer">El socio posee un solo nombre legal</label>
                </div>
              </div>
            </div>

            {/* Sección: Actividad SEPS */}
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-6 bg-[#14532D] rounded-full"></span>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Actividad Económica (Manual SEPS)</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">ACTIVIDAD PRINCIPAL</label>
                  <div className="relative">
                    <select value={newMember.profession} onChange={e => setNewMember({...newMember, profession: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase appearance-none focus:ring-4 focus:ring-[#14532D]/10 outline-none cursor-pointer shadow-inner">
                      {SEPS_CATALOGS.OCCUPATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={20} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Ingresos Mensuales Promedio</label>
                  <div className="relative">
                    <DollarSign size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input type="number" placeholder="0.00" className="w-full pl-14 pr-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" />
                  </div>
                </div>
                <div className="col-span-full space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Nombre Empresa / Empleador</label>
                  <input type="text" className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" placeholder="TRABAJO ACTUAL O PROPIO" />
                </div>
              </div>
            </div>

            {/* Sección: Localización y Otros */}
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-6 bg-[#14532D] rounded-full"></span>
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Ubicación y Contacto</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Dirección Principal</label>
                  <div className="relative">
                    <MapPin size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input type="text" value={newMember.address} onChange={e => setNewMember({...newMember, address: e.target.value.toUpperCase()})} className="w-full pl-14 pr-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" placeholder="CALLES Y NÚMERO DE CASA" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Celular Contacto</label>
                  <div className="relative">
                    <Smartphone size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input type="text" value={newMember.phone} onChange={e => setNewMember({...newMember, phone: e.target.value})} className="w-full pl-14 pr-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" placeholder="099-000-0000" />
                  </div>
                </div>
              </div>
            </div>

            {/* Resumen de Seguridad */}
            <div className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100 flex items-center gap-6">
               <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm">
                 <Lock size={24} />
               </div>
               <div>
                 <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Seguridad Inicial</p>
                 <p className="text-sm font-bold text-emerald-900 leading-tight">El socio se creará con el PIN <span className="underline font-black">1234</span>. Se le solicitará cambio obligatorio en su primer ingreso a la Banca en Línea.</p>
               </div>
            </div>

            {/* Botones de Acción Estilo Produbanco */}
            <div className="pt-10 border-t flex gap-6">
              <button type="submit" className="flex-[2] py-6 bg-[#14532D] text-white rounded-full font-black text-xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-2 active:border-b-0 transition-all uppercase tracking-tighter flex items-center justify-center gap-4">
                REGISTRAR SOCIO PATATE <UserCheck size={28} />
              </button>
              <button type="button" onClick={() => setActiveTab('OPERATIONS')} className="flex-1 py-6 bg-slate-100 text-slate-500 rounded-full font-black text-xl uppercase tracking-tighter hover:bg-slate-200 transition-colors">
                CANCELAR
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'CONSULTAS' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
              <h3 className="text-2xl font-black text-slate-800">Directorio de Socios</h3>
              <div className="relative w-full md:w-96">
                <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={querySearch} onChange={e => setQuerySearch(e.target.value)} placeholder="Nombre o Cédula..." className="w-full pl-14 pr-6 py-4 bg-slate-100 border-2 border-slate-100 rounded-2xl outline-none font-bold text-[#14532D] focus:border-[#14532D] shadow-inner" />
              </div>
           </div>
           <div className="overflow-x-auto rounded-3xl border border-slate-50">
             <table className="w-full text-sm">
               <thead className="bg-slate-50 border-b">
                 <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                   <th className="px-8 py-5 text-left">Nro Socio</th>
                   <th className="px-8 py-5 text-left">Nombres</th>
                   <th className="px-8 py-5 text-right">Saldo</th>
                   <th className="px-8 py-5 text-center">Ficha</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {filteredUsersForQuery.map(u => (
                   <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                     <td className="px-8 py-5 font-black text-slate-300">#{u.memberNumber || 'S/N'}</td>
                     <td className="px-8 py-5 font-bold text-slate-800 uppercase">{u.name}</td>
                     <td className="px-8 py-5 text-right font-black text-slate-900">${(u.accounts[0]?.balance || 0).toFixed(2)}</td>
                     <td className="px-8 py-5 text-center">
                       <button onClick={() => { 
                         const parts = u.name.split(' '); 
                         setEditingUser({
                           ...u, 
                           firstName: u.firstName || parts[0], 
                           middleName: u.middleName || (parts.length > 2 ? parts[1] : ''), 
                           lastName: u.lastName || (parts.length > 2 ? parts.slice(2).join(' ') : parts[1]), 
                           onlyOneName: u.onlyOneName ?? (parts.length <= 2)
                         }); 
                         setEditorSubTab('IDENTIDAD'); 
                       }} className="p-3 bg-emerald-50 text-[#14532D] rounded-xl hover:bg-[#14532D] hover:text-white transition-all">
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
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setEditingUser(null)}></div>
          <div className="relative w-full max-w-4xl bg-white rounded-[4.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-500 border-2 border-slate-100">
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

            <form onSubmit={handleUpdateUserInCore} className="flex-1 overflow-y-auto p-12 space-y-10">
              {editorSubTab === 'IDENTIDAD' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primer Nombre</label>
                    <input type="text" value={editingUser.firstName || ''} onChange={e => setEditingUser({...editingUser, firstName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner" />
                  </div>
                  {!editingUser.onlyOneName && (
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Segundo Nombre</label>
                      <input type="text" value={editingUser.middleName || ''} onChange={e => setEditingUser({...editingUser, middleName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner" />
                    </div>
                  )}
                  <div className="col-span-full flex items-center gap-3">
                    <input type="checkbox" id="edit_onlyOne" checked={editingUser.onlyOneName} onChange={e => setEditingUser({...editingUser, onlyOneName: e.target.checked, middleName: e.target.checked ? '' : editingUser.middleName})} className="w-5 h-5 accent-[#14532D]" />
                    <label htmlFor="edit_onlyOne" className="text-[10px] font-black text-slate-600 uppercase">POSEO UN SOLO NOMBRE</label>
                  </div>
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Apellidos Completos</label>
                    <input type="text" value={editingUser.lastName || ''} onChange={e => setEditingUser({...editingUser, lastName: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase text-lg focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner" />
                  </div>
                </div>
              )}

              {editorSubTab === 'LOCALIZACIÓN' && (
                <div className="grid grid-cols-1 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">País</label>
                    <select value={editingUser.residenceCountry || 'ECUADOR'} onChange={e => setEditingUser({...editingUser, residenceCountry: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase appearance-none focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner">
                      {SEPS_CATALOGS.COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección Calles</label>
                    <input type="text" value={editingUser.address || ''} onChange={e => setEditingUser({...editingUser, address: e.target.value.toUpperCase()})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner" />
                  </div>
                </div>
              )}
              
              {editorSubTab === 'ACTIVIDAD' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="col-span-full space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ACTIVIDAD PRINCIPAL (SEPS)</label>
                    <div className="relative">
                      <select value={editingUser.profession || 'SIN ACTIVIDAD ECONÓMICA'} onChange={e => setEditingUser({...editingUser, profession: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase appearance-none focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner">
                        {SEPS_CATALOGS.OCCUPATIONS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <ChevronDown size={20} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nivel de Instrucción</label>
                    <select value={editingUser.instructionLevel || 'SIN INSTRUCCIÓN'} onChange={e => setEditingUser({...editingUser, instructionLevel: e.target.value})} className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] uppercase appearance-none focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner">
                      {SEPS_CATALOGS.INSTRUCTION.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Ingresos Mensuales</label>
                    <input type="number" placeholder="0.00" className="w-full px-8 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] focus:ring-2 focus:ring-[#14532D]/20 outline-none shadow-inner" />
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
