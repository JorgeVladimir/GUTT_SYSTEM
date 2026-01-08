
import React, { useState, useMemo } from 'react';
import { User, Transaction, AccountType, UserRole } from '../types';
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
  History,
  X,
  FileText,
  MapPin,
  Briefcase,
  Fingerprint,
  User as UserIcon,
  CheckCircle2,
  ShieldCheck
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
  
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editorSubTab, setEditorSubTab] = useState<'GENERAL' | 'UBICACION' | 'TRABAJO' | 'OTROS'>('GENERAL');
  const [querySearch, setQuerySearch] = useState('');

  const [denominations, setDenominations] = useState<Record<string, number>>({
    "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0, "0.50": 0, "0.25": 0, "0.10": 0, "0.05": 0, "0.01": 0
  });

  const totalDenominations = useMemo(() => {
    return Object.entries(denominations).reduce((acc: number, [denom, count]: [string, number]) => acc + (parseFloat(denom) * count), 0);
  }, [denominations]);

  const diff = useMemo(() => (parseFloat(amount) || 0) - totalDenominations, [amount, totalDenominations]);

  const updateDenom = (denom: string, val: number) => setDenominations(prev => ({ ...prev, [denom]: Math.max(0, val) }));

  const handleSearch = () => {
    const found = users.find(u => u.id === search);
    if (found) {
      setSelectedUser(found);
      setDenominations({ "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0, "0.50": 0, "0.25": 0, "0.10": 0, "0.05": 0, "0.01": 0 });
    } else alert("Socio no encontrado");
  };

  const processTransaction = () => {
    if (!selectedUser) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return alert("Ingrese un monto válido");
    if (Math.abs(diff) > 0.001) return alert(`Diferencia en arqueo: $${diff.toFixed(2)}`);

    const updatedUser = { ...selectedUser };
    const acc = updatedUser.accounts.find(a => a.type === AccountType.SAVINGS);
    if (!acc) return;
    if (opType === 'WITHDRAW' && acc.balance < val) return alert("Saldo insuficiente");

    const newTx: Transaction = {
      id: `TLL-${Date.now()}`,
      date: new Date().toLocaleDateString('es-EC'),
      description: `${opType === 'DEPOSIT' ? 'DEPÓSITO' : 'RETIRO'} EFECTIVO VENTANILLA`,
      amount: opType === 'DEPOSIT' ? val : -val,
      type: opType === 'DEPOSIT' ? 'CREDIT' : 'DEBIT',
      category: 'Caja Ventanilla',
      accountId: acc.id,
      isCash: true
    };

    const newBalance = acc.balance + newTx.amount;
    const updatedAccounts = updatedUser.accounts.map(a => a.id === acc.id ? { ...a, balance: newBalance } : a);
    
    onUpdateUser({ ...updatedUser, accounts: updatedAccounts, transactions: [newTx, ...(updatedUser.transactions || [])] });
    setAmount(''); setSelectedUser(null); setSearch('');
    alert("Transacción registrada con éxito.");
  };

  const filteredUsers = useMemo(() => {
    if (!querySearch) return users.filter(u => u.role === UserRole.MEMBER);
    return users.filter(u => 
      u.role === UserRole.MEMBER && 
      (u.name.toLowerCase().includes(querySearch.toLowerCase()) || u.id.includes(querySearch))
    );
  }, [users, querySearch]);

  const handleUpdateUserInCore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    onUpdateUser(editingUser);
    setEditingUser(null);
    alert("Datos de socio actualizados en la base central.");
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
              <h3 className="text-xl font-black text-[#14532D] mb-6 flex items-center gap-2"><Search size={20} /> Identificar Socio</h3>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cédula..." className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-[#14532D] outline-none font-black text-xl text-[#14532D]" />
              <button onClick={handleSearch} className="w-full mt-4 py-4 bg-[#14532D] text-white rounded-2xl font-black shadow-lg">BUSCAR SOCIO</button>

              {selectedUser && (
                <div className="mt-8 p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 animate-in slide-in-from-top-4">
                  <p className="text-[10px] font-black text-emerald-600 uppercase mb-2">Información del Socio</p>
                  <p className="text-lg font-black text-[#14532D] uppercase leading-tight">{selectedUser.name}</p>
                  <p className="text-sm font-bold text-emerald-700/60 mb-4">CI: {selectedUser.id}</p>
                  <div className="bg-white p-4 rounded-xl border border-emerald-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase">Saldo Disponible</p>
                    <p className="text-2xl font-black text-[#14532D]">${selectedUser.accounts[0].balance.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </div>

            {selectedUser && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <h3 className="text-xl font-black text-slate-800">Transacción de Ventanilla</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setOpType('DEPOSIT')} className={`py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 border-2 ${opType === 'DEPOSIT' ? 'bg-[#14532D] text-white border-[#14532D] shadow-lg' : 'bg-white text-slate-400 border-slate-100'}`}><ArrowDownLeft size={18} /> DEPÓSITO</button>
                  <button onClick={() => setOpType('WITHDRAW')} className={`py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 border-2 ${opType === 'WITHDRAW' ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-white text-slate-400 border-slate-100'}`}><ArrowUpRight size={18} /> RETIRO</button>
                </div>
                <div className="relative">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 font-black text-slate-300 text-3xl">$</span>
                  <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full py-6 bg-slate-50 border-2 border-slate-100 rounded-3xl text-4xl font-black text-center text-[#14532D] outline-none focus:border-[#14532D]" />
                </div>
              </div>
            )}
          </div>

          <div className="xl:col-span-2">
            {!selectedUser ? (
              <div className="bg-slate-50 border-4 border-dashed border-slate-200 rounded-[3rem] h-full flex flex-col items-center justify-center p-12 text-slate-300">
                <Calculator size={80} className="mb-4 opacity-20" />
                <p className="font-black uppercase tracking-[0.2em] text-sm">Seleccione un socio para iniciar</p>
              </div>
            ) : (
              <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl">
                <div className="flex justify-between items-center mb-10">
                  <h3 className="text-2xl font-black text-slate-800">Detalle de Efectivo (Arqueo)</h3>
                  <div className={`px-8 py-4 rounded-2xl flex flex-col items-end ${Math.abs(diff) < 0.01 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    <p className="text-[10px] font-black uppercase">Total Arqueado</p>
                    <p className="text-4xl font-black">${totalDenominations.toFixed(2)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                   <div className="space-y-4">
                     {["100", "50", "20", "10", "5", "1"].map(d => (
                       <div key={d} className="flex items-center gap-4">
                         <div className="w-20 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center font-black">${d}</div>
                         <div className="flex-1 flex items-center bg-slate-50 rounded-xl border p-1">
                           <button onClick={() => updateDenom(d, denominations[d] - 1)} className="p-2"><Minus size={16} /></button>
                           <input type="number" value={denominations[d] || ''} onChange={e => updateDenom(d, parseInt(e.target.value) || 0)} className="w-full bg-transparent text-center font-black text-slate-900" placeholder="0" />
                           <button onClick={() => updateDenom(d, denominations[d] + 1)} className="p-2"><Plus size={16} /></button>
                         </div>
                       </div>
                     ))}
                   </div>
                   <div className="space-y-4">
                     {["0.50", "0.25", "0.10", "0.05", "0.01"].map(d => (
                       <div key={d} className="flex items-center gap-4">
                         <div className="w-20 h-10 rounded-full border-2 border-slate-200 flex items-center justify-center font-black text-slate-500">{d}¢</div>
                         <div className="flex-1 flex items-center bg-slate-50 rounded-xl border p-1">
                           <button onClick={() => updateDenom(d, denominations[d] - 1)} className="p-2"><Minus size={16} /></button>
                           <input type="number" value={denominations[d] || ''} onChange={e => updateDenom(d, parseInt(e.target.value) || 0)} className="w-full bg-transparent text-center font-black text-slate-900" placeholder="0" />
                           <button onClick={() => updateDenom(d, denominations[d] + 1)} className="p-2"><Plus size={16} /></button>
                         </div>
                       </div>
                     ))}
                   </div>
                </div>

                <button onClick={processTransaction} disabled={Math.abs(diff) > 0.01 || !amount} className="w-full mt-12 py-6 bg-[#14532D] text-white rounded-[2rem] font-black text-xl shadow-2xl hover:bg-emerald-900 transition-all border-b-8 border-[#FACC15] disabled:opacity-30">REGISTRAR OPERACIÓN</button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'CONSULTAS' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
              <div>
                <h3 className="text-2xl font-black text-slate-800">Consultas y Gestión Core</h3>
                <p className="text-sm text-slate-400 font-medium">Búsqueda avanzada de socios y actualización de fichas técnicas.</p>
              </div>
              <div className="relative w-full md:w-96">
                <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={querySearch} onChange={e => setQuerySearch(e.target.value)} placeholder="Nombre o Cédula..." className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 rounded-2xl focus:border-[#14532D] outline-none font-bold text-slate-700" />
              </div>
           </div>

           <div className="overflow-x-auto rounded-3xl border">
             <table className="w-full">
               <thead className="bg-slate-50 border-b">
                 <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                   <th className="px-8 py-5 text-left">CI / RUC</th>
                   <th className="px-8 py-5 text-left">Socio de la Caja</th>
                   <th className="px-8 py-5 text-right">Saldo Vista</th>
                   <th className="px-8 py-5 text-center">Gestión</th>
                 </tr>
               </thead>
               <tbody className="divide-y">
                 {filteredUsers.map(u => (
                   <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                     <td className="px-8 py-5 font-black text-[#14532D]">{u.id}</td>
                     <td className="px-8 py-5">
                       <p className="font-bold text-slate-800 uppercase leading-none mb-1">{u.name}</p>
                       <p className="text-[10px] text-slate-400 font-bold">{u.profession || 'SIN OCUPACIÓN DEFINIDA'}</p>
                     </td>
                     <td className="px-8 py-5 text-right font-black text-slate-900">
                       ${u.accounts[0].balance.toLocaleString()}
                     </td>
                     <td className="px-8 py-5 text-center flex justify-center gap-2">
                        <button onClick={() => setEditingUser(u)} className="p-3 bg-emerald-50 text-[#14532D] rounded-xl hover:bg-[#14532D] hover:text-white transition-all shadow-sm" title="Editar Ficha">
                          <Edit2 size={18} />
                        </button>
                        <button className="p-3 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-100 transition-all shadow-sm" title="Ver Historial">
                          <History size={18} />
                        </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      )}

      {/* MODAL EDITOR INTEGRAL PARA CAJA (IDÉNTICO AL ADMIN PARA CONSISTENCIA) */}
      {editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md" onClick={() => setEditingUser(null)}></div>
          <div className="relative w-full max-w-5xl bg-white rounded-[3.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[90vh]">
            
            <div className="p-8 border-b flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-emerald-50 text-[#14532D] rounded-2xl">
                  <UserIcon size={32} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800">Módulo de Actualización de Socio</h3>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Portal Cajero - Gestión Core Bancaria</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-3 hover:bg-slate-100 rounded-2xl transition-all">
                <X size={28} />
              </button>
            </div>

            <div className="bg-slate-100/50 p-2 flex gap-1 border-b">
              {['GENERAL', 'UBICACION', 'TRABAJO', 'OTROS'].map(t => (
                <button key={t} onClick={() => setEditorSubTab(t as any)} className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${editorSubTab === t ? 'bg-white text-[#14532D] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                  {t === 'GENERAL' ? '1. Datos Socio' : t === 'UBICACION' ? '2. Residencia' : t === 'TRABAJO' ? '3. Laboral' : '4. Otros'}
                </button>
              ))}
            </div>

            <form onSubmit={handleUpdateUserInCore} className="flex-1 overflow-y-auto p-10 space-y-8">
              
              {editorSubTab === 'GENERAL' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in">
                  <div className="col-span-full grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Número de Socio</label>
                      <input type="text" value={editingUser.memberNumber || ''} onChange={e => setEditingUser({...editingUser, memberNumber: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-xl font-black text-slate-900" placeholder="0" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Estado Civil</label>
                      <select value={editingUser.civilStatus || ''} onChange={e => setEditingUser({...editingUser, civilStatus: e.target.value})} className="w-full p-4 bg-white border border-slate-200 rounded-xl font-black text-slate-900">
                        <option value="SOLTERO">SOLTERO/A</option><option value="CASADO">CASADO/A</option><option value="DIVORCIADO">DIVORCIADO/A</option><option value="VIUDO">VIUDO/A</option>
                      </select>
                    </div>
                  </div>
                  <div className="col-span-full">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Nombres Completos</label>
                    <input type="text" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value.toUpperCase()})} className="w-full p-5 bg-white border border-slate-200 rounded-2xl font-black text-slate-900 uppercase text-lg" />
                  </div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Cédula</label><input readOnly value={editingUser.id} className="w-full p-4 bg-slate-50 border rounded-xl font-black text-slate-900" /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Correo</label><input type="email" value={editingUser.email || ''} onChange={e => setEditingUser({...editingUser, email: e.target.value})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900" /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Teléfono</label><input type="text" value={editingUser.phone || ''} onChange={e => setEditingUser({...editingUser, phone: e.target.value})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900" /></div>
                </div>
              )}

              {editorSubTab === 'UBICACION' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Provincia</label><input type="text" value={editingUser.province || ''} onChange={e => setEditingUser({...editingUser, province: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900" /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Ciudad</label><input type="text" value={editingUser.city || ''} onChange={e => setEditingUser({...editingUser, city: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900" /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Parroquia</label><input type="text" value={editingUser.parish || ''} onChange={e => setEditingUser({...editingUser, parish: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900" /></div>
                  <div className="col-span-full"><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Dirección Principal</label><input type="text" value={editingUser.address || ''} onChange={e => setEditingUser({...editingUser, address: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900" /></div>
                  <div className="col-span-full"><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Referencia de Ubicación</label><textarea value={editingUser.addressReference || ''} onChange={e => setEditingUser({...editingUser, addressReference: e.target.value.toUpperCase()})} className="w-full p-5 bg-white border rounded-2xl font-black text-slate-900 h-24" /></div>
                </div>
              )}

              {editorSubTab === 'TRABAJO' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
                  <div className="col-span-full"><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Ocupación / Profesión</label><input type="text" value={editingUser.profession || ''} onChange={e => setEditingUser({...editingUser, profession: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900 uppercase" /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Lugar de Trabajo</label><input type="text" value={editingUser.dependency || ''} onChange={e => setEditingUser({...editingUser, dependency: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900 uppercase" /></div>
                  <div className="col-span-full"><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Dirección Laboral</label><input type="text" value={editingUser.workAddress || ''} onChange={e => setEditingUser({...editingUser, workAddress: e.target.value.toUpperCase()})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900 uppercase" /></div>
                </div>
              )}

              {editorSubTab === 'OTROS' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Nivel Instrucción</label><select value={editingUser.instructionLevel || ''} onChange={e => setEditingUser({...editingUser, instructionLevel: e.target.value})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900"><option value="PRIMARIA">PRIMARIA</option><option value="SECUNDARIA">SECUNDARIA</option><option value="SUPERIOR">SUPERIOR</option></select></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Género</label><select value={editingUser.gender || ''} onChange={e => setEditingUser({...editingUser, gender: e.target.value})} className="w-full p-4 bg-white border rounded-xl font-black text-slate-900"><option value="MASCULINO">MASCULINO</option><option value="FEMENINO">FEMENINO</option></select></div>
                  <div className="col-span-full p-6 bg-slate-50 rounded-3xl border space-y-4">
                    <div className="flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Validación Huella</span><input type="checkbox" checked={editingUser.hasFingerprint || false} onChange={e => setEditingUser({...editingUser, hasFingerprint: e.target.checked})} className="w-6 h-6 accent-[#14532D]" /></div>
                    <div className="flex justify-between items-center border-t pt-4"><span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Persona PEPs</span><input type="checkbox" checked={editingUser.isPeps || false} onChange={e => setEditingUser({...editingUser, isPeps: e.target.checked})} className="w-6 h-6 accent-[#14532D]" /></div>
                  </div>
                </div>
              )}

              <div className="sticky bottom-0 bg-white py-10 border-t flex gap-4">
                <button type="submit" className="flex-1 py-6 bg-[#14532D] text-white rounded-[2rem] font-black text-xl shadow-2xl border-b-8 border-[#FACC15]">CONFIRMAR ACTUALIZACIÓN EN CORE</button>
                <button type="button" onClick={() => setEditingUser(null)} className="px-10 py-6 bg-slate-100 text-slate-500 rounded-[2rem] font-black text-xl">SALIR</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
