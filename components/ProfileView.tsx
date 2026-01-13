
import React, { useState, useRef, useEffect } from 'react';
import { User, Dependent, PersonalReference } from '../types';
import { SEPS_CATALOGS as CATALOGS } from '../constants';
import { 
  User as UserIcon,
  MapPin,
  Fingerprint,
  Info,
  Printer,
  FileText,
  Calendar,
  Baby,
  Users2,
  Trash2,
  PlusCircle,
  UserPlus,
  Loader2,
  Briefcase,
  Map as MapIcon,
  X,
  Phone,
  Heart,
  ImageIcon
} from 'lucide-react';

interface ProfileViewProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'IDENTIDAD' | 'LOCALIZACIÓN' | 'ACTIVIDAD' | 'OTROS' | 'REPORTE'>('IDENTIDAD');
  const [editingUser, setEditingUser] = useState<User>(() => ({ 
    ...user, 
    dependents: user.dependents || [],
    references: user.references || [],
    homeSketch: user.homeSketch || []
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [mapModal, setMapModal] = useState<{ isOpen: boolean; type: 'home' | 'work' }>({ isOpen: false, type: 'home' });
  const sketchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditingUser({ 
      ...user, 
      dependents: user.dependents || [],
      references: user.references || [],
      homeSketch: user.homeSketch || []
    });
  }, [user]);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    setTimeout(() => {
      onUpdateUser(editingUser);
      setIsSaving(false);
      alert("¡Perfil actualizado con éxito en el núcleo bancario!");
    }, 1000);
  };

  const handleAddDependent = () => {
    setEditingUser(prev => ({
      ...prev,
      dependents: [...(prev.dependents || []), { id: '', name: '', relationship: 'HIJO/A' }]
    }));
  };

  const handleUpdateDependent = (index: number, field: keyof Dependent, value: string) => {
    const updated = [...(editingUser.dependents || [])];
    updated[index] = { ...updated[index], [field]: value };
    setEditingUser(prev => ({ ...prev, dependents: updated }));
  };

  const handleRemoveDependent = (index: number) => {
    setEditingUser(prev => ({
      ...prev,
      dependents: prev.dependents?.filter((_, i) => i !== index)
    }));
  };

  const handleAddReference = () => {
    setEditingUser(prev => ({
      ...prev,
      references: [...(prev.references || []), { name: '', phone: '', relationship: 'OTRO' }]
    }));
  };

  const handleUpdateReference = (index: number, field: keyof PersonalReference, value: string) => {
    const updated = [...(editingUser.references || [])];
    updated[index] = { ...updated[index], [field]: value };
    setEditingUser(prev => ({ ...prev, references: updated }));
  };

  const handleRemoveReference = (index: number) => {
    setEditingUser(prev => ({
      ...prev,
      references: prev.references?.filter((_, i) => i !== index)
    }));
  };

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
          setEditingUser(p => ({ ...p, homeSketch: [...(p.homeSketch || []), base64] }));
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
      setEditingUser(p => ({ ...p, address: address.toUpperCase() }));
    } else {
      setEditingUser(p => ({ ...p, workAddress: address.toUpperCase() }));
    }
    setMapModal({ isOpen: false, type: 'home' });
  };

  const birthCities = editingUser.birthProvince ? (CATALOGS.CITIES as any)[editingUser.birthProvince] || [] : [];
  const birthParishes = editingUser.birthCity ? (CATALOGS.PARISHES as any)[editingUser.birthCity] || [] : [];
  const resCities = editingUser.province ? (CATALOGS.CITIES as any)[editingUser.province] || [] : [];
  const resParishes = editingUser.city ? (CATALOGS.PARISHES as any)[editingUser.city] || [] : [];

  const FichaDeSocio = () => (
    <div id="ficha-printable" className="bg-white p-12 space-y-10 text-slate-900 printable-area border-2 border-slate-200 rounded-[3rem]">
      <div className="flex justify-between items-start border-b-4 border-[#14532D] pb-8">
        <div className="flex items-center gap-6">
          <div className="w-20 h-16 bg-[#14532D] rounded-xl flex flex-col items-center justify-center text-white font-black italic shadow-lg">
             <span className="text-2xl leading-none">CAP</span>
             <div className="w-full h-1 bg-[#FACC15] mt-1"></div>
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tighter uppercase">Ficha Integral de Socio</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Caja de Ahorro Patate • Estructura S01 SEPS</p>
          </div>
        </div>
        <div className="text-right">
           <p className="text-2xl font-black text-[#14532D]">#{editingUser.memberNumber || 'PROV-001'}</p>
           <p className="text-[10px] font-bold text-slate-400">REGISTRO: {editingUser.registrationDate}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-12">
        <section className="space-y-4">
          <h3 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-3">Identidad</h3>
          <div className="space-y-2">
             <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Nombres:</span> <span className="text-sm font-black uppercase">{editingUser.name}</span></div>
             <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-bold text-slate-400 uppercase">ID:</span> <span className="text-sm font-black uppercase">{editingUser.idType} {editingUser.id}</span></div>
             <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-bold text-slate-400 uppercase">E-mail:</span> <span className="text-sm font-black lowercase">{editingUser.email}</span></div>
             <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Cónyuge:</span> <span className="text-[11px] font-black uppercase">{editingUser.spouseName || 'N/A'}</span></div>
          </div>
        </section>
        <section className="space-y-4">
          <h3 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-3">Residencia y Trabajo</h3>
          <div className="space-y-2">
             <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Provincia:</span> <span className="text-sm font-black uppercase">{editingUser.province}</span></div>
             <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Dirección Domicilio:</span> <span className="text-[10px] font-black uppercase">{editingUser.address}</span></div>
             <div className="flex justify-between border-b pb-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Empresa:</span> <span className="text-[10px] font-black uppercase">{editingUser.workAddress || 'N/A'}</span></div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <section className="space-y-4">
          <h3 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-3">Referencias y Cargas</h3>
          <div className="grid grid-cols-2 gap-4">
             <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Cargas Familiares: {editingUser.dependents?.length || 0}</p>
                {editingUser.dependents?.map((d, i) => <p key={i} className="text-[10px] font-bold">{d.name} ({d.relationship})</p>)}
             </div>
             <div className="p-4 bg-slate-50 rounded-2xl">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Referencias: {editingUser.references?.length || 0}</p>
                {editingUser.references?.map((r, i) => <p key={i} className="text-[10px] font-bold">{r.name} - {r.phone}</p>)}
             </div>
          </div>
        </section>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto pb-20 animate-in fade-in duration-700">
      {/* Modal Mapa */}
      {mapModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="p-6 bg-[#14532D] text-white flex justify-between items-center">
                 <h4 className="font-black uppercase text-xs tracking-widest flex items-center gap-2"><MapIcon size={16}/> Localizador {mapModal.type === 'home' ? 'Domicilio' : 'Trabajo'}</h4>
                 <button onClick={() => setMapModal({isOpen: false, type: 'home'})}><X size={20}/></button>
              </div>
              <div className="p-8 space-y-6">
                 <div className="aspect-video bg-slate-100 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200 text-slate-400">
                    <p className="text-[10px] font-black uppercase text-center">Buscador Satelital Activo</p>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Calle / Intersección:</label>
                    <input autoFocus type="text" id="profMapInput" placeholder="Ingrese nueva dirección..." className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold" />
                 </div>
                 <button onClick={() => {
                   const val = (document.getElementById('profMapInput') as HTMLInputElement).value;
                   handleMapSelect(val || "Dirección editada");
                 }} className="w-full py-4 bg-[#14532D] text-white rounded-xl font-black text-xs uppercase shadow-xl">Confirmar y Actualizar</button>
              </div>
           </div>
        </div>
      )}

      <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        {/* Header Perfil */}
        <div className="p-10 flex flex-col md:flex-row justify-between items-center bg-[#14532D] text-white border-b-[12px] border-[#FACC15] no-print">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center backdrop-blur-md shadow-inner border border-white/20">
              <UserIcon size={40} className="text-[#FACC15]" />
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">{editingUser.name}</h2>
              <p className="text-[10px] font-black text-emerald-300 uppercase tracking-[0.3em] mt-2">Socio Patate #<span className="text-white">{editingUser.memberNumber || 'S/N'}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-6 md:mt-0">
             <div className="px-5 py-2 bg-white/10 rounded-full border border-white/20 text-[10px] font-black uppercase flex items-center gap-2">
                <Fingerprint size={14} className="text-[#FACC15]" /> Verificado S01
             </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-slate-50 p-3 flex gap-1 border-b overflow-x-auto no-scrollbar no-print">
          {['IDENTIDAD', 'LOCALIZACIÓN', 'ACTIVIDAD', 'OTROS', 'REPORTE'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-8 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 shrink-0 ${
                activeTab === tab ? 'bg-[#14532D] text-white shadow-lg scale-105' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab === 'REPORTE' && <FileText size={14} className="inline mr-2" />}
              {tab}
            </button>
          ))}
        </div>

        {activeTab !== 'REPORTE' ? (
          <form onSubmit={handleUpdate} className="p-10 space-y-12 no-print">
            {activeTab === 'IDENTIDAD' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="col-span-full p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex gap-4">
                  <Info size={24} className="text-[#14532D] shrink-0" />
                  <p className="text-xs font-bold text-emerald-900 leading-tight">Campos mandatorios conforme Manual de Tablas 28.0 SEPS.</p>
                </div>
                
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Primer Nombre</label>
                  <input type="text" value={editingUser.firstName} onChange={e => setEditingUser({...editingUser, firstName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[#14532D]" />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Segundo Nombre</label>
                  <input type="text" value={editingUser.middleName} onChange={e => setEditingUser({...editingUser, middleName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[#14532D]" />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Apellidos</label>
                  <input type="text" value={editingUser.lastName} onChange={e => setEditingUser({...editingUser, lastName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[#14532D]" />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                  <input type="email" value={editingUser.email} onChange={e => setEditingUser({...editingUser, email: e.target.value.toLowerCase()})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[#14532D]" />
                </div>
                {(editingUser.maritalStatus === 'CASADO' || editingUser.maritalStatus === 'UNIÓN DE HECHO') && (
                  <div className="space-y-4 col-span-full md:col-span-2 p-6 bg-pink-50 rounded-[2rem] border border-pink-100">
                    <p className="text-[10px] font-black text-pink-600 uppercase mb-4 flex items-center gap-2"><Heart size={14}/> Datos Cónyuge</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input placeholder="Cédula Cónyuge" value={editingUser.spouseId} onChange={e => setEditingUser({...editingUser, spouseId: e.target.value})} className="px-4 py-3 rounded-xl border border-pink-200" />
                      <input placeholder="Nombre Cónyuge" value={editingUser.spouseName} onChange={e => setEditingUser({...editingUser, spouseName: e.target.value.toUpperCase()})} className="px-4 py-3 rounded-xl border border-pink-200" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'LOCALIZACIÓN' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="col-span-full p-6 bg-blue-50 rounded-2xl border border-blue-100 flex gap-4">
                  <MapPin size={24} className="text-blue-600 shrink-0" />
                  <p className="text-xs font-bold text-blue-900 leading-tight">Dirección residencial validada por coordenadas y croquis.</p>
                </div>
                <div className="space-y-4 col-span-full">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección Exacta Domicilio</label>
                  <div className="flex gap-2">
                    <textarea value={editingUser.address || ''} onChange={e => setEditingUser({ ...editingUser, address: e.target.value.toUpperCase() })} className="flex-1 px-6 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] h-20 outline-none resize-none focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={() => openMapSelector('home')} className="p-4 bg-white border-2 border-slate-100 text-blue-600 rounded-2xl shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2">
                       <MapIcon size={20} /> <span className="text-[10px] font-black uppercase">Mapa</span>
                    </button>
                  </div>
                </div>
                <div className="col-span-full space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><ImageIcon size={14}/> Croquis Digitalizados</label>
                  <div className="flex flex-wrap gap-4">
                     <button type="button" onClick={() => sketchInputRef.current?.click()} className="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-300">
                       <PlusCircle size={24}/>
                       <span className="text-[8px] font-black uppercase mt-1">Nuevo</span>
                     </button>
                     <input type="file" multiple accept="image/*" ref={sketchInputRef} onChange={handleUploadSketch} className="hidden" />
                     {editingUser.homeSketch?.map((img, i) => (
                       <div key={i} className="relative w-24 h-24 rounded-2xl overflow-hidden shadow-md group">
                         <img src={img} className="w-full h-full object-cover" />
                         <button type="button" onClick={() => setEditingUser(p => ({...p, homeSketch: p.homeSketch?.filter((_, idx) => idx !== i)}))} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={18}/></button>
                       </div>
                     ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ACTIVIDAD' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="col-span-full p-6 bg-emerald-50 rounded-2xl border border-emerald-100 flex gap-4">
                   <Briefcase size={24} className="text-[#14532D]"/>
                   <p className="text-xs font-bold text-[#14532D]">Información laboral para análisis de capacidad de pago.</p>
                </div>
                <div className="space-y-4 col-span-full">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Lugar de Trabajo / Empresa</label>
                  <div className="flex gap-2">
                    <input type="text" value={editingUser.workAddress} onChange={e => setEditingUser({...editingUser, workAddress: e.target.value.toUpperCase()})} className="flex-1 px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[#14532D]" />
                    <button type="button" onClick={() => openMapSelector('work')} className="p-4 bg-white border-2 border-slate-100 text-emerald-600 rounded-2xl shadow-sm hover:bg-emerald-50 transition-all flex items-center gap-2">
                       <MapIcon size={20} /> <span className="text-[10px] font-black uppercase">Mapa</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cargo / Profesión</label>
                  <input type="text" value={editingUser.profession} onChange={e => setEditingUser({...editingUser, profession: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-[#14532D]" />
                </div>
              </div>
            )}

            {activeTab === 'OTROS' && (
              <div className="space-y-12 animate-in slide-in-from-bottom-4 duration-500">
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6">
                  <div className="flex justify-between items-center border-l-4 border-purple-500 pl-4">
                    <h4 className="text-[11px] font-black text-purple-700 uppercase tracking-widest flex items-center gap-2"><Baby size={18} /> Cargas Familiares</h4>
                    <button type="button" onClick={handleAddDependent} className="p-2 bg-purple-100 text-purple-700 rounded-xl transition-all"><PlusCircle size={18}/></button>
                  </div>
                  <div className="space-y-4">
                    {editingUser.dependents?.map((dep, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end relative group shadow-sm">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Cédula</label>
                          <input type="text" value={dep.id} onChange={e => handleUpdateDependent(idx, 'id', e.target.value)} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Nombre</label>
                          <input type="text" value={dep.name} onChange={e => handleUpdateDependent(idx, 'name', dep.name.toUpperCase())} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                        </div>
                        <button type="button" onClick={() => handleRemoveDependent(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6">
                  <div className="flex justify-between items-center border-l-4 border-amber-500 pl-4">
                    <h4 className="text-[11px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-2"><Phone size={18} /> Referencias Personales</h4>
                    <button type="button" onClick={handleAddReference} className="p-2 bg-amber-100 text-amber-700 rounded-xl transition-all"><PlusCircle size={18}/></button>
                  </div>
                  <div className="space-y-4">
                    {editingUser.references?.map((ref, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 items-end relative group shadow-sm">
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Nombre Referencia</label>
                          <input type="text" value={ref.name} onChange={e => handleUpdateReference(idx, 'name', ref.name.toUpperCase())} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Teléfono</label>
                          <input type="text" value={ref.phone} onChange={e => handleUpdateReference(idx, 'phone', e.target.value)} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs" />
                        </div>
                        <button type="button" onClick={() => handleRemoveReference(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="pt-10 border-t sticky bottom-0 bg-white z-10 py-6">
              <button 
                type="submit" 
                disabled={isSaving}
                className="w-full py-6 bg-[#14532D] text-white rounded-full font-black text-xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-1 transition-all uppercase tracking-tighter flex items-center justify-center gap-3"
              >
                {isSaving ? <><Loader2 className="animate-spin" /> PROCESANDO...</> : "GUARDAR CAMBIOS SEPS"}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-10">
            <FichaDeSocio />
            <div className="mt-10 flex gap-4 no-print">
               <button onClick={() => window.print()} className="flex-1 py-5 bg-[#14532D] text-white rounded-full font-black flex items-center justify-center gap-3 shadow-xl">
                 <Printer size={20} /> IMPRIMIR FICHA OFICIAL
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
