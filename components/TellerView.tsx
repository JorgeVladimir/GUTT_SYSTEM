
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Transaction, AccountType, UserRole, Dependent, PersonalReference } from '../types';
import { SEPS_CATALOGS as CATALOGS } from '../constants';
import { 
  Search, 
  Banknote, 
  UserPlus, 
  Plus,
  Minus,
  X,
  User as UserIcon,
  DollarSign,
  Receipt,
  Loader2,
  CheckCircle2,
  MapPin,
  Globe,
  Calendar as CalendarIcon,
  Mail,
  Briefcase,
  Users2,
  Heart,
  ImageIcon,
  Map as MapIcon,
  Trash2,
  Info,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';

interface TellerViewProps {
  users: User[];
  onUpdateUser: (user: User) => void;
  currentUserRole?: UserRole;
}

type TellerTab = 'OPERATIONS' | 'CONSULTAS' | 'REGISTER';

export const TellerView: React.FC<TellerViewProps> = ({ users, onUpdateUser, currentUserRole }) => {
  const [activeTab, setActiveTab] = useState<TellerTab>('OPERATIONS');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [opType, setOpType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [generalFilter, setGeneralFilter] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [mapModal, setMapModal] = useState<{ isOpen: boolean; type: 'home' | 'work' }>({ isOpen: false, type: 'home' });

  // Estado para Nuevo Socio (Estructura S01 Completa - Manual 28.0)
  const [newMember, setNewMember] = useState<Partial<User>>({
    id: '', 
    idType: 'CÉDULA', 
    firstName: '', 
    middleName: '', 
    lastName: '', 
    onlyOneName: false,
    email: '', 
    phone: '', 
    address: '', 
    residenceCountry: '593 - ECUADOR',
    birthCountry: '593 - ECUADOR',
    birthProvince: '', 
    birthCity: '', 
    birthParish: '', 
    ethnicity: 'MESTIZO',
    gender: 'MASCULINO', 
    maritalStatus: 'SOLTERO',
    province: '', 
    city: '', 
    parish: '',
    profession: 'SIN ACTIVIDAD ECONÓMICA', 
    instructionLevel: 'SIN INSTRUCCIÓN', 
    role: UserRole.MEMBER,
    dependents: [],
    references: [],
    homeSketch: [],
    workAddress: '',
    workProvince: '',
    workCity: '',
    workParish: '',
    spouseId: '',
    spouseName: '',
    spousePhone: '',
    pin: '1234', // PIN por defecto
    needsPinChange: true
  });

  const [idStatus, setIdStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [isValidating, setIsValidating] = useState(false);
  const sketchInputRef = useRef<HTMLInputElement>(null);

  const validateEcuadorianId = (id: string): boolean => {
    if (id.length !== 10) return false;
    const province = parseInt(id.substring(0, 2), 10);
    if (province < 1 || province > 24) return false;
    const thirdDigit = parseInt(id.substring(2, 3), 10);
    if (thirdDigit >= 6) return false;
    const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let total = 0;
    for (let i = 0; i < 9; i++) {
      let val = parseInt(id[i], 10) * coefficients[i];
      if (val >= 10) val -= 9;
      total += val;
    }
    const checkDigit = parseInt(id[9], 10);
    const calculatedCheckDigit = (total % 10 === 0) ? 0 : 10 - (total % 10);
    return checkDigit === calculatedCheckDigit;
  };

  useEffect(() => {
    if (newMember.id?.length === 10 && newMember.idType === 'CÉDULA') {
      setIsValidating(true);
      setTimeout(() => {
        setIdStatus(validateEcuadorianId(newMember.id!) ? 'valid' : 'invalid');
        setIsValidating(false);
      }, 600);
    }
  }, [newMember.id]);

  const handleSearch = () => {
    const found = users.find(u => u.id === search || u.name.toLowerCase().includes(search.toLowerCase()));
    if (found) {
      setSelectedUser(found);
      setSelectedAccountId(found.accounts[0]?.id || '');
    } else alert("Socio no encontrado.");
  };

  const handleOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !amount) return;
    const numAmount = parseFloat(amount);
    
    const updatedAccounts = selectedUser.accounts.map(acc => {
      if (acc.id === selectedAccountId) {
        return { ...acc, balance: opType === 'DEPOSIT' ? acc.balance + numAmount : acc.balance - numAmount };
      }
      return acc;
    });

    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
      date: new Date().toLocaleDateString('es-EC'),
      description: `${opType === 'DEPOSIT' ? 'DEPÓSITO' : 'RETIRO'} VENTANILLA`,
      amount: opType === 'DEPOSIT' ? numAmount : -numAmount,
      type: opType === 'DEPOSIT' ? 'CREDIT' : 'DEBIT',
      category: 'Caja',
      accountId: selectedAccountId,
      isCash: true
    };

    onUpdateUser({ ...selectedUser, accounts: updatedAccounts, transactions: [newTx, ...(selectedUser.transactions || [])] });
    alert("Operación exitosa.");
    setSelectedUser(null);
    setAmount('');
  };

  const filteredUsers = useMemo(() => {
    const q = generalFilter.toLowerCase();
    return users.filter(u => u.role === UserRole.MEMBER && (u.id.includes(q) || u.name.toLowerCase().includes(q)));
  }, [users, generalFilter]);

  // Auxiliares para catálogos dinámicos
  const birthCities = newMember.birthProvince ? (CATALOGS.CITIES as any)[newMember.birthProvince] || [] : [];
  const birthParishes = newMember.birthCity ? (CATALOGS.PARISHES as any)[newMember.birthCity] || [] : [];
  const resCities = newMember.province ? (CATALOGS.CITIES as any)[newMember.province] || [] : [];
  const resParishes = newMember.city ? (CATALOGS.PARISHES as any)[newMember.city] || [] : [];
  const workCities = newMember.workProvince ? (CATALOGS.CITIES as any)[newMember.workProvince] || [] : [];
  const workParishes = newMember.workCity ? (CATALOGS.PARISHES as any)[newMember.workCity] || [] : [];

  // Handlers para Referencias y Cargas
  const handleAddReference = () => setNewMember(p => ({ ...p, references: [...(p.references || []), { name: '', phone: '', relationship: 'OTRO' }] }));
  const handleAddDependent = () => setNewMember(p => ({ ...p, dependents: [...(p.dependents || []), { id: '', name: '', relationship: 'HIJO/A' }] }));

  // Fix: Replaced Array.from(files).forEach with a standard for loop for better type inference of 'file' as a Blob/File
  const handleUploadSketch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          setNewMember(p => ({ ...p, homeSketch: [...(p.homeSketch || []), base64] }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const openMapSelector = (type: 'home' | 'work') => {
    setMapModal({ isOpen: true, type });
  };

  const handleMapSelect = (address: string) => {
    if (mapModal.type === 'home') {
      setNewMember(p => ({ ...p, address: address.toUpperCase() }));
    } else {
      setNewMember(p => ({ ...p, workAddress: address.toUpperCase() }));
    }
    setMapModal({ isOpen: false, type: 'home' });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20 no-print">
      {/* Modal Mapa Falso */}
      {mapModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
              <div className="p-6 bg-[#14532D] text-white flex justify-between items-center">
                 <h4 className="font-black uppercase text-xs tracking-widest flex items-center gap-2"><MapIcon size={16}/> Localizador {mapModal.type === 'home' ? 'Domicilio' : 'Trabajo'}</h4>
                 <button onClick={() => setMapModal({isOpen: false, type: 'home'})}><X size={20}/></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="aspect-video bg-slate-100 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200 text-slate-400">
                    <p className="text-[10px] font-black uppercase text-center">Interfase de Google Maps Activa<br/><span className="text-[8px]">Seleccione ubicación en el visor</span></p>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dirección Capturada:</label>
                    <input autoFocus type="text" id="mapInput" placeholder="Calle Principal y Secundaria..." className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700" />
                 </div>
                 <button onClick={() => {
                   const val = (document.getElementById('mapInput') as HTMLInputElement).value;
                   handleMapSelect(val || "Dirección desde mapa");
                 }} className="w-full py-4 bg-[#14532D] text-white rounded-xl font-black text-xs uppercase shadow-xl">Confirmar Ubicación</button>
              </div>
           </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 flex gap-2 overflow-x-auto no-scrollbar sticky top-0 z-40">
        {[
          { id: 'OPERATIONS', label: 'OPERACIONES', icon: <Banknote size={18} /> },
          { id: 'REGISTER', label: 'APERTURA DE SOCIO', icon: <UserPlus size={18} /> },
          { id: 'CONSULTAS', label: 'DIRECTORIO', icon: <Search size={18} /> }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)} 
            className={`flex items-center gap-2 px-8 py-4 rounded-2xl text-[10px] font-black tracking-widest transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'OPERATIONS' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1 space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <h3 className="text-xl font-black text-[#14532D] mb-6 uppercase tracking-tighter">Buscar Socio</h3>
               <div className="flex gap-2">
                 <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ID o Nombre..." className="flex-1 px-6 py-4 bg-slate-100 border-none rounded-2xl outline-none font-black text-[#14532D] shadow-inner" />
                 <button onClick={handleSearch} className="p-4 bg-[#14532D] text-white rounded-2xl shadow-lg active:scale-95 transition-all"><Search size={20}/></button>
               </div>
            </div>
            {selectedUser && (
              <div className="bg-[#14532D] p-8 rounded-[2.5rem] text-white shadow-2xl animate-in zoom-in-95 duration-500 border-b-[8px] border-[#FACC15]">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-2">Socio Seleccionado</p>
                <h4 className="text-2xl font-black uppercase tracking-tighter mb-4">{selectedUser.name}</h4>
                <div className="space-y-4 pt-4 border-t border-white/10">
                  {selectedUser.accounts.map(acc => (
                    <div key={acc.id} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all cursor-pointer" onClick={() => setSelectedAccountId(acc.id)}>
                      <div>
                        <p className="text-[9px] font-black text-emerald-300 uppercase">{acc.type.replace('_', ' ')}</p>
                        <p className={`font-bold text-xs ${selectedAccountId === acc.id ? 'text-[#FACC15]' : 'opacity-70'}`}>#{acc.number}</p>
                      </div>
                      <p className="text-lg font-black">${acc.balance.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="xl:col-span-2">
            {selectedUser ? (
              <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100 animate-in slide-in-from-right-4">
                <form onSubmit={handleOperation} className="space-y-10">
                  <div className="flex gap-4 p-2 bg-slate-50 rounded-[2rem]">
                    <button type="button" onClick={() => setOpType('DEPOSIT')} className={`flex-1 py-5 rounded-[1.5rem] font-black text-sm uppercase transition-all flex items-center justify-center gap-3 ${opType === 'DEPOSIT' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>DEPÓSITO</button>
                    <button type="button" onClick={() => setOpType('WITHDRAW')} className={`flex-1 py-5 rounded-[1.5rem] font-black text-sm uppercase transition-all flex items-center justify-center gap-3 ${opType === 'WITHDRAW' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>RETIRO</button>
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto de Operación ($)</label>
                     <div className="relative">
                       <DollarSign size={24} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                       <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full pl-16 pr-8 py-5 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] text-2xl focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" />
                     </div>
                  </div>
                  <button type="submit" className="w-full py-7 bg-[#14532D] text-white rounded-full font-black text-2xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-2 transition-all uppercase tracking-tighter">CONFIRMAR TRANSACCIÓN</button>
                </form>
              </div>
            ) : (
              <div className="h-full bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center p-20 text-center opacity-50">
                <Banknote size={80} className="mb-6 text-slate-300" />
                <h4 className="text-lg font-black text-slate-400 uppercase tracking-widest italic">Esperando socio en ventanilla</h4>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'REGISTER' && (
        <div className="bg-white rounded-[4rem] shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
          <div className="p-10 border-b bg-emerald-50/50 flex items-center gap-6">
            <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center shadow-lg">
               <UserPlus size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Apertura de Socio Integral</h3>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Sincronización Automática SEPS S01 • Manual 28.0</p>
            </div>
          </div>
          
          <form className="p-12 space-y-12" onSubmit={e => {
             e.preventDefault();
             if(idStatus === 'invalid') return alert("Cédula inválida.");
             const fullName = `${newMember.firstName} ${newMember.middleName || ''} ${newMember.lastName}`.replace(/\s+/g, ' ').toUpperCase();
             const cleanId = newMember.id!;
             const savAcc = { id: `sav-${cleanId}`, type: AccountType.SAVINGS, number: `01${Math.floor(100000 + Math.random()*899999)}`, balance: 0, currency: 'USD' };
             const certAcc = { id: `cert-${cleanId}`, type: AccountType.CERTIFICATE, number: `02${Math.floor(100000 + Math.random()*899999)}`, balance: 5, currency: 'USD' };
             
             onUpdateUser({ 
               ...newMember, 
               id: cleanId, 
               name: fullName, 
               accounts: [savAcc, certAcc], 
               transactions: [], 
               loans: [], 
               role: UserRole.MEMBER, 
               needsPinChange: true, 
               pin: newMember.pin || '1234',
               memberNumber: `P${Math.floor(1000+Math.random()*9000)}`,
               registrationDate: new Date().toLocaleDateString('es-EC')
             } as User);
             alert("¡Socio registrado con éxito en el Core Bancario!");
             setActiveTab('CONSULTAS');
          }}>
            {/* Sección 1: Identidad */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-[#14532D] pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Información Personal y de Identidad</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cédula / Pasaporte</label>
                    <div className="relative">
                      <input required type="text" maxLength={10} value={newMember.id} onChange={e => setNewMember({...newMember, id: e.target.value})} className={`w-full px-6 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none transition-all ${idStatus === 'valid' ? 'bg-emerald-50' : idStatus === 'invalid' ? 'bg-red-50' : ''}`} />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {isValidating && <Loader2 size={16} className="animate-spin text-[#14532D]" />}
                        {idStatus === 'valid' && <CheckCircle2 size={16} className="text-emerald-500" />}
                      </div>
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Primer Nombre</label>
                    <input required type="text" value={newMember.firstName} onChange={e => setNewMember({...newMember, firstName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Segundo Nombre</label>
                    <input type="text" value={newMember.middleName} onChange={e => setNewMember({...newMember, middleName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Apellidos Completos</label>
                    <input required type="text" value={newMember.lastName} onChange={e => setNewMember({...newMember, lastName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Mail size={14} className="text-[#14532D]" /> Correo Electrónico
                    </label>
                    <input required type="email" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value.toLowerCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <CalendarIcon size={14} className="text-[#14532D]" /> Fecha de Nacimiento
                    </label>
                    <input 
                      required 
                      type="date" 
                      value={newMember.birthDate} 
                      onChange={e => setNewMember({...newMember, birthDate: e.target.value})} 
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none cursor-pointer appearance-none relative" 
                      style={{ colorScheme: 'light', minHeight: '3rem', display: 'block' }}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado Civil</label>
                    <select value={newMember.maritalStatus} onChange={e => setNewMember({...newMember, maritalStatus: e.target.value as any})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                      {CATALOGS.MARITAL_STATUS.map(ms => <option key={ms} value={ms}>{ms}</option>)}
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Lock size={14}/> PIN Inicial</label>
                    <div className="relative">
                       <input required type={showPin ? "text" : "password"} maxLength={4} value={newMember.pin} onChange={e => setNewMember({...newMember, pin: e.target.value.replace(/\D/g, '')})} className="w-full pl-6 pr-12 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-center text-xl tracking-[0.3em]" />
                       <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">{showPin ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    </div>
                 </div>
              </div>
            </div>

            {/* Sección 2: Datos del Cónyuge (Condicional) */}
            {(newMember.maritalStatus === 'CASADO' || newMember.maritalStatus === 'UNIÓN DE HECHO') && (
              <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-2 border-l-4 border-pink-500 pl-4">
                  <h4 className="text-xs font-black text-pink-600 uppercase tracking-widest">Datos del Cónyuge</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cédula Cónyuge</label>
                    <input type="text" value={newMember.spouseId} onChange={e => setNewMember({...newMember, spouseId: e.target.value})} className="w-full px-6 py-4 bg-pink-50/50 border-none rounded-2xl font-black text-pink-900 shadow-inner outline-none" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo Cónyuge</label>
                    <input type="text" value={newMember.spouseName} onChange={e => setNewMember({...newMember, spouseName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-pink-50/50 border-none rounded-2xl font-black text-pink-900 shadow-inner outline-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Sección 3: Lugar de Nacimiento (S01 Requerido) */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-[#FACC15] pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Lugar de Nacimiento (S01)</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">País de Nacimiento</label>
                  <select value={newMember.birthCountry} onChange={e => {
                    const country = e.target.value;
                    setNewMember({
                      ...newMember, 
                      birthCountry: country,
                      birthProvince: country.includes('593') ? newMember.birthProvince : '',
                      birthCity: country.includes('593') ? newMember.birthCity : '',
                      birthParish: country.includes('593') ? newMember.birthParish : ''
                    });
                  }} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                    {CATALOGS.COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Provincia (Nac.)</label>
                  <select disabled={!newMember.birthCountry?.includes('593')} value={newMember.birthProvince} onChange={e => setNewMember({...newMember, birthProvince: e.target.value, birthCity: '', birthParish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {CATALOGS.PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cantón (Nac.)</label>
                  <select disabled={!newMember.birthProvince || !newMember.birthCountry?.includes('593')} value={newMember.birthCity} onChange={e => setNewMember({...newMember, birthCity: e.target.value, birthParish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {birthCities.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Parroquia (Nac.)</label>
                  <select disabled={!newMember.birthCity || !newMember.birthCountry?.includes('593')} value={newMember.birthParish} onChange={e => setNewMember({...newMember, birthParish: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {birthParishes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Sección 4: Ubicación de Residencia y Croquis */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-blue-500 pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Ubicación de Residencia y Croquis</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Provincia Residencia</label>
                  <select value={newMember.province} onChange={e => setNewMember({...newMember, province: e.target.value, city: '', parish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                    <option value="">Seleccione...</option>
                    {CATALOGS.PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cantón Residencia</label>
                  <select disabled={!newMember.province} value={newMember.city} onChange={e => setNewMember({...newMember, city: e.target.value, parish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {resCities.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Parroquia Residencia</label>
                  <select disabled={!newMember.city} value={newMember.parish} onChange={e => setNewMember({...newMember, parish: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {resParishes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dirección Exacta (Domicilio)</label>
                  <div className="flex gap-2">
                    <input required type="text" value={newMember.address} onChange={e => setNewMember({...newMember, address: e.target.value.toUpperCase()})} className="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                    <button type="button" onClick={() => openMapSelector('home')} className="p-4 bg-white border-2 border-slate-100 text-blue-600 rounded-2xl shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2">
                       <MapIcon size={20} /> <span className="text-[10px] font-black uppercase">Mapa</span>
                    </button>
                  </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <ImageIcon size={14} className="text-[#14532D]" /> Cargar Croquis del Domicilio (Imágenes)
                </label>
                <div className="flex flex-wrap gap-4">
                   <button type="button" onClick={() => sketchInputRef.current?.click()} className="w-24 h-24 bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-[#14532D] hover:text-[#14532D] transition-all">
                      <Plus size={24} />
                      <span className="text-[8px] font-black uppercase mt-1">Adjuntar</span>
                   </button>
                   <input type="file" multiple accept="image/*" ref={sketchInputRef} onChange={handleUploadSketch} className="hidden" />
                   {newMember.homeSketch?.map((img, i) => (
                     <div key={i} className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#FACC15] shadow-lg group">
                        <img src={img} alt="Sketch" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setNewMember(p => ({...p, homeSketch: p.homeSketch?.filter((_, idx) => idx !== i)}))} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <Trash2 size={20} />
                        </button>
                     </div>
                   ))}
                </div>
              </div>
            </div>

            {/* Sección 5: Dirección de Trabajo */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-emerald-500 pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Información Laboral</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-2 lg:col-span-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Lugar de Trabajo / Nombre Empresa</label>
                  <div className="flex gap-2">
                    <input type="text" value={newMember.workAddress} onChange={e => setNewMember({...newMember, workAddress: e.target.value.toUpperCase()})} className="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                    <button type="button" onClick={() => openMapSelector('work')} className="p-4 bg-white border-2 border-slate-100 text-emerald-600 rounded-2xl shadow-sm hover:bg-emerald-50 transition-all flex items-center gap-2">
                       <MapIcon size={20} /> <span className="text-[10px] font-black uppercase">Mapa</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Provincia (Trabajo)</label>
                  <select value={newMember.workProvince} onChange={e => setNewMember({...newMember, workProvince: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                    <option value="">Provincia...</option>
                    {CATALOGS.PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Parroquia (Trabajo)</label>
                  <select value={newMember.workParish} onChange={e => setNewMember({...newMember, workParish: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                    <option value="">Parroquia...</option>
                    {/* Reutilización del catálogo patate como fallback */}
                    {CATALOGS.PARISHES["1805 - PATATE"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Sección 6: Referencias y Cargas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
               <div className="space-y-6">
                  <div className="flex justify-between items-center border-l-4 border-amber-500 pl-4">
                     <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest">Referencias Personales</h4>
                     <button type="button" onClick={handleAddReference} className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-all"><Plus size={18} /></button>
                  </div>
                  <div className="space-y-4">
                     {newMember.references?.map((ref, i) => (
                       <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                          <input placeholder="Nombre" value={ref.name} onChange={e => {
                            const refs = [...(newMember.references || [])];
                            refs[i].name = e.target.value.toUpperCase();
                            setNewMember({...newMember, references: refs});
                          }} className="px-4 py-2 rounded-xl border font-bold text-[10px]" />
                          <input placeholder="Teléfono" value={ref.phone} onChange={e => {
                            const refs = [...(newMember.references || [])];
                            refs[i].phone = e.target.value;
                            setNewMember({...newMember, references: refs});
                          }} className="px-4 py-2 rounded-xl border font-bold text-[10px]" />
                       </div>
                     ))}
                  </div>
               </div>
               <div className="space-y-6">
                  <div className="flex justify-between items-center border-l-4 border-purple-500 pl-4">
                     <h4 className="text-xs font-black text-purple-700 uppercase tracking-widest">Cargas Familiares</h4>
                     <button type="button" onClick={handleAddDependent} className="p-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-all"><Plus size={18} /></button>
                  </div>
                  <div className="space-y-4">
                     {newMember.dependents?.map((dep, i) => (
                       <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                          <input placeholder="ID / Cédula" value={dep.id} onChange={e => {
                            const deps = [...(newMember.dependents || [])];
                            deps[i].id = e.target.value;
                            setNewMember({...newMember, dependents: deps});
                          }} className="px-4 py-2 rounded-xl border font-bold text-[10px]" />
                          <input placeholder="Nombre Carga" value={dep.name} onChange={e => {
                            const deps = [...(newMember.dependents || [])];
                            deps[i].name = dep.name.toUpperCase();
                            setNewMember({...newMember, dependents: deps});
                          }} className="px-4 py-2 rounded-xl border font-bold text-[10px]" />
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            <button type="submit" disabled={idStatus === 'invalid'} className="w-full py-7 bg-[#14532D] text-white rounded-full font-black text-xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-2 transition-all uppercase tracking-tighter disabled:opacity-50">REGISTRAR SOCIO PATATE (S01)</button>
          </form>
        </div>
      )}

      {activeTab === 'CONSULTAS' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
              <h3 className="text-2xl font-black text-slate-800">Directorio de Socios</h3>
              <div className="relative w-full md:w-96">
                <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={generalFilter} onChange={e => setGeneralFilter(e.target.value)} placeholder="Nombre o Cédula..." className="w-full pl-14 pr-6 py-4 bg-slate-100 border-2 border-slate-100 rounded-2xl outline-none font-bold text-[#14532D] focus:border-[#14532D] shadow-inner" />
              </div>
           </div>
           <div className="overflow-x-auto rounded-3xl border border-slate-50">
             <table className="w-full text-sm">
               <thead className="bg-slate-50 border-b">
                 <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                   <th className="px-8 py-5 text-left">Nro Socio</th>
                   <th className="px-8 py-5 text-left">Nombres</th>
                   <th className="px-8 py-5 text-right">Saldo Vista</th>
                   <th className="px-8 py-5 text-center">Acciones</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                 {filteredUsers.map(u => (
                   <tr key={u.id} className="hover:bg-slate-50 transition-colors group">
                     <td className="px-8 py-5 font-black text-slate-300 italic">#{u.memberNumber || 'S/N'}</td>
                     <td className="px-8 py-5 font-bold text-slate-800 uppercase text-xs">{u.name}</td>
                     <td className="px-8 py-5 text-right font-black text-slate-900">${(u.accounts[0]?.balance || 0).toFixed(2)}</td>
                     <td className="px-8 py-5 text-center">
                        <button onClick={() => { setSelectedUser(u); setActiveTab('OPERATIONS'); }} className="p-3 bg-emerald-50 text-[#14532D] rounded-xl hover:bg-[#14532D] hover:text-white transition-all shadow-sm"><Banknote size={16}/></button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      )}
    </div>
  );
};
