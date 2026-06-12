
import React, { useState, useMemo, useEffect } from 'react';
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
  PieChart,
  Plus,
  Trash2,
  Map,
  PlusCircle
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

  const targetUser = isMember ? currentUser : selectedS01User;

  const [editForm, setEditForm] = useState<any>(null);
  const [showPrintView, setShowPrintView] = useState(false);

  useEffect(() => {
    if (targetUser) {
      const pat = targetUser.patrimonioIngresos || {};
      setEditForm({
        direccionDomicilio: targetUser.address || '',
        lugarTrabajo: targetUser.workAddress || '',
        referenciasPersonales: targetUser.references || [],
        cargasFamiliares: targetUser.dependents || [],
        telefonos: targetUser.telefonos || '',
        profesion: targetUser.profession || 'SIN ACTIVIDAD ECONÓMICA',
        autoidentificacion: targetUser.autoidentificacion || 'MESTIZO',
        tipoVivienda: targetUser.tipoVivienda || 'PROPIA',
        valorVivienda: targetUser.valorVivienda || 0,
        discapacidad: targetUser.discapacidad || false,
        consentimientoDatos: targetUser.consentimientoDatos || false,
        peps: targetUser.peps || false,
        ingresoSueldo: pat.ingresoSueldo || 0,
        ingresoComercial: pat.ingresoComercial || 0,
        ingresoOtros: pat.ingresoOtros || 0
      });
      setShowPrintView(false);
    } else {
      setEditForm(null);
    }
  }, [targetUser]);

  const handleAddReference = () => {
    if (!editForm) return;
    setEditForm((prev: any) => ({
      ...prev,
      referenciasPersonales: [...prev.referenciasPersonales, { name: '', phone: '', relationship: 'OTRO' }]
    }));
  };

  const handleUpdateReference = (index: number, field: string, value: string) => {
    if (!editForm) return;
    const updated = [...editForm.referenciasPersonales];
    updated[index] = { ...updated[index], [field]: value };
    setEditForm((prev: any) => ({ ...prev, referenciasPersonales: updated }));
  };

  const handleRemoveReference = (index: number) => {
    if (!editForm) return;
    setEditForm((prev: any) => ({
      ...prev,
      referenciasPersonales: prev.referenciasPersonales.filter((_: any, i: number) => i !== index)
    }));
  };

  const handleAddDependent = () => {
    if (!editForm) return;
    setEditForm((prev: any) => ({
      ...prev,
      cargasFamiliares: [...prev.cargasFamiliares, { id: '', name: '', relationship: 'HIJO/A' }]
    }));
  };

  const handleUpdateDependent = (index: number, field: string, value: string) => {
    if (!editForm) return;
    const updated = [...editForm.cargasFamiliares];
    updated[index] = { ...updated[index], [field]: value };
    setEditForm((prev: any) => ({ ...prev, cargasFamiliares: updated }));
  };

  const handleRemoveDependent = (index: number) => {
    if (!editForm) return;
    setEditForm((prev: any) => ({
      ...prev,
      cargasFamiliares: prev.cargasFamiliares.filter((_: any, i: number) => i !== index)
    }));
  };

  const handleSaveReportProfile = async () => {
    if (!targetUser || !editForm) return;
    setLoading(true);
    try {
      const response = await fetch('/api/socios/update-report-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identificacion: targetUser.id,
          direccionDomicilio: editForm.direccionDomicilio,
          lugarTrabajo: editForm.lugarTrabajo,
          referenciasPersonales: editForm.referenciasPersonales,
          cargasFamiliares: editForm.cargasFamiliares,
          telefonos: editForm.telefonos,
          profesion: editForm.profesion,
          autoidentificacion: editForm.autoidentificacion,
          tipoVivienda: editForm.tipoVivienda,
          valorVivienda: parseFloat(editForm.valorVivienda) || 0,
          discapacidad: editForm.discapacidad,
          consentimientoDatos: editForm.consentimientoDatos,
          peps: editForm.peps,
          patrimonioIngresos: {
            ingresoSueldo: parseFloat(editForm.ingresoSueldo) || 0,
            ingresoComercial: parseFloat(editForm.ingresoComercial) || 0,
            ingresoOtros: parseFloat(editForm.ingresoOtros) || 0
          }
        })
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Error al guardar cambios');
      }
      
      if (onUpdateUser) {
        onUpdateUser({
          ...targetUser,
          address: editForm.direccionDomicilio,
          workAddress: editForm.lugarTrabajo,
          references: editForm.referenciasPersonales,
          dependents: editForm.cargasFamiliares,
          telefonos: editForm.telefonos,
          profession: editForm.profesion,
          autoidentificacion: editForm.autoidentificacion,
          tipoVivienda: editForm.tipoVivienda,
          valorVivienda: parseFloat(editForm.valorVivienda) || 0,
          discapacidad: editForm.discapacidad,
          consentimientoDatos: editForm.consentimientoDatos,
          peps: editForm.peps,
          patrimonioIngresos: {
            ingresoSueldo: parseFloat(editForm.ingresoSueldo) || 0,
            ingresoComercial: parseFloat(editForm.ingresoComercial) || 0,
            ingresoOtros: parseFloat(editForm.ingresoOtros) || 0
          }
        });
      }
      
      alert("¡Cambios guardados con éxito en la ficha de reporte del socio!");
    } catch (e: any) {
      alert("Error al guardar cambios: " + e.message);
    } finally {
      setLoading(false);
    }
  };

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



  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1400px] mx-auto">
      <div className="flex justify-between items-center no-print">
        <div>
           <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Reporte de Cajas y Socios</h2>
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gutt System</p>
        </div>
      </div>

      {/* Selector Maestro de Reportería */}
      <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 flex gap-2 no-print overflow-x-auto no-scrollbar">
        {[
          { id: 'FICHA', label: 'RECUPERAR FICHA DE SOCIO', icon: <FileText size={18} /> },
          { id: 'SITUACION', label: 'ESTADO DE SITUACIÓN GENERAL', icon: <PieChart size={18} /> },
          // RESTRICCIÓN: BI solo visible para roles administrativos (no socios)
          !isMember && { id: 'BI', label: 'REPORTERÍA GENERAL (BI)', icon: <BarChart3 size={18} /> },
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

      {activeMasterTab === 'FICHA' && targetUser && editForm && (
        <div className="animate-in slide-in-from-bottom-4 space-y-8">
           {!isMember && !showPrintView && (
             <button onClick={() => setSelectedS01User(null)} className="mb-2 flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase hover:text-[#14532D] transition-all px-6 no-print">
               <Search size={14} /> Nueva Búsqueda
             </button>
           )}

           {showPrintView ? (
             /* VISTA DE REPORTE PARA IMPRIMIR */
             <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100 space-y-8 printable-area relative">
               <div className="flex justify-between items-center pb-6 border-b-2 border-slate-900">
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-[#14532D] rounded-xl flex flex-col items-center justify-center text-white font-black italic shadow-md border-b-4 border-[#FACC15] overflow-hidden">
                     <span className="text-2xl leading-none">G</span>
                   </div>
                   <div>
                     <h2 className="text-2xl font-black tracking-tight uppercase">Ficha Oficial de Socio</h2>
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Gutt System • SEPS</p>
                   </div>
                 </div>
                 <div className="text-right">
                   <p className="text-[9px] font-black text-slate-400 uppercase">Número de Socio</p>
                   <p className="text-lg font-black text-[#14532D]">{targetUser.memberNumber || 'N/A'}</p>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-8 text-xs font-serif leading-relaxed text-slate-800">
                 <div className="space-y-4">
                   <h4 className="font-bold border-b pb-1 text-[#14532D] uppercase tracking-wider text-[10px]">1. Datos Personales (Fichados)</h4>
                   <p><strong>Identificación:</strong> {targetUser.id}</p>
                   <p><strong>Nombres Completos:</strong> {targetUser.name}</p>
                   <p><strong>Fecha Nacimiento:</strong> {targetUser.birthDate || 'N/A'}</p>
                   <p><strong>Estado Civil:</strong> {targetUser.maritalStatus || 'N/A'}</p>
                   {targetUser.spouseId && (
                     <div className="bg-pink-50/20 p-3 rounded-xl border border-pink-100/40">
                       <p className="text-[10px] font-bold text-pink-700">Relación Cónyuge:</p>
                       <p><strong>Nombres:</strong> {targetUser.spouseName}</p>
                       <p><strong>Cédula:</strong> {targetUser.spouseId}</p>
                       <p><strong>Teléfono:</strong> {targetUser.spousePhone || 'N/A'}</p>
                     </div>
                   )}
                 </div>

                 <div className="space-y-4">
                   <h4 className="font-bold border-b pb-1 text-[#14532D] uppercase tracking-wider text-[10px]">2. Información de Contacto y Vivienda</h4>
                   <p><strong>E-mail Principal:</strong> {targetUser.email || 'N/A'}</p>
                   <p><strong>Teléfono Principal:</strong> {targetUser.phone || 'N/A'}</p>
                   <p><strong>Teléfonos Adicionales:</strong> {editForm.telefonos || 'N/A'}</p>
                   <p><strong>Tipo de Vivienda:</strong> {editForm.tipoVivienda}</p>
                   <p><strong>Valor Estimado Vivienda:</strong> ${parseFloat(editForm.valorVivienda).toFixed(2)} USD</p>
                   <p><strong>Dirección Domiciliaria:</strong> {editForm.direccionDomicilio || 'N/A'}</p>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-8 text-xs font-serif leading-relaxed text-slate-800">
                 <div className="space-y-4">
                   <h4 className="font-bold border-b pb-1 text-[#14532D] uppercase tracking-wider text-[10px]">3. Aspectos Profesionales, Sociales y PEPS</h4>
                   <p><strong>Profesión / Ocupación:</strong> {editForm.profession}</p>
                   <p><strong>Autoidentificación Étnica:</strong> {editForm.autoidentificacion}</p>
                   <p><strong>Persona Políticamente Expuesta (PEPS):</strong> {editForm.peps ? 'SÍ (REQUERIDO CONTROL UAFE)' : 'NO'}</p>
                   <p><strong>Persona con Discapacidad:</strong> {editForm.discapacidad ? 'SÍ' : 'NO'}</p>
                   <p><strong>Tratamiento Datos Personales:</strong> {editForm.consentimientoDatos ? 'AUTORIZADO Y FIRMADO' : 'PENDIENTE'}</p>
                 </div>

                 <div className="space-y-4">
                   <h4 className="font-bold border-b pb-1 text-[#14532D] uppercase tracking-wider text-[10px]">4. Información Laboral y Domiciliaria</h4>
                   <p><strong>Lugar de Trabajo / Empresa:</strong> {editForm.lugarTrabajo || 'N/A'}</p>
                   <p><strong>Patrimonio / Ingresos Mensuales:</strong></p>
                   <ul className="list-disc list-inside pl-2 space-y-1 text-[11px]">
                     <li>Ingresos por Sueldo: ${parseFloat(editForm.ingresoSueldo).toFixed(2)} USD</li>
                     <li>Ingresos Comerciales: ${parseFloat(editForm.ingresoComercial).toFixed(2)} USD</li>
                     <li>Otros Ingresos: ${parseFloat(editForm.ingresoOtros).toFixed(2)} USD</li>
                     <li className="font-bold">TOTAL ESTIMADO: ${(parseFloat(editForm.ingresoSueldo) + parseFloat(editForm.ingresoComercial) + parseFloat(editForm.ingresoOtros)).toFixed(2)} USD</li>
                   </ul>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-8 text-xs font-serif leading-relaxed text-slate-800">
                 <div className="space-y-4">
                   <h4 className="font-bold border-b pb-1 text-[#14532D] uppercase tracking-wider text-[10px]">5. Referencias Personales</h4>
                   {editForm.referenciasPersonales.length > 0 ? (
                     <div className="space-y-1">
                       {editForm.referenciasPersonales.map((ref: any, idx: number) => (
                         <p key={idx}>• {ref.name} ({ref.phone}) - {ref.relationship || 'REF'}</p>
                       ))}
                     </div>
                   ) : (
                     <p className="italic text-slate-400">No declaradas.</p>
                   )}
                 </div>

                 <div className="space-y-4">
                   <h4 className="font-bold border-b pb-1 text-[#14532D] uppercase tracking-wider text-[10px]">6. Cargas Familiares</h4>
                   {editForm.cargasFamiliares.length > 0 ? (
                     <div className="space-y-1">
                       {editForm.cargasFamiliares.map((dep: any, idx: number) => (
                         <p key={idx}>• {dep.name} - {dep.relationship}</p>
                       ))}
                     </div>
                   ) : (
                     <p className="italic text-slate-400">Sin cargas declaradas.</p>
                   )}
                 </div>
               </div>

               <div className="pt-16 grid grid-cols-2 gap-12 text-center text-xs font-serif pt-20 border-t border-slate-200">
                 <div className="space-y-1">
                   <div className="border-b border-slate-950 h-10"></div>
                   <p className="font-bold uppercase">Firma del Socio</p>
                   <p className="text-[10px] text-slate-400">C.C. {targetUser.id}</p>
                 </div>
                 <div className="space-y-1">
                   <div className="border-b border-slate-950 h-10"></div>
                   <p className="font-bold uppercase">Responsable de Registro</p>
                   <p className="text-[10px] text-slate-400">Portal de Operaciones Gutt System</p>
                 </div>
               </div>

               <div className="pt-10 border-t border-slate-200 flex gap-4 no-print justify-end">
                 <button onClick={() => setShowPrintView(false)} className="px-6 py-3 bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-300 transition-colors">Volver a Edición</button>
                 <button onClick={() => window.print()} className="px-8 py-3 bg-[#14532D] text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-emerald-800 transition-colors flex items-center gap-2"><Printer size={16} /> Imprimir Ficha Oficial</button>
               </div>
             </div>
           ) : (
             /* FORMULARIO DE EDICIÓN CON OPCIONES LIMITADAS */
             <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 space-y-8">
               <div className="flex justify-between items-center border-b pb-4">
                 <div>
                   <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Modificar Socio / Reporte</h3>
                   <p className="text-[9px] font-black text-[#14532D] uppercase tracking-widest mt-1">Campos restringidos por políticas de seguridad SEPS</p>
                 </div>
                 <button onClick={() => setShowPrintView(true)} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-[#14532D] rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2"><Printer size={16} /> Ficha de Socio</button>
               </div>

               {/* SECCIÓN 1: DATOS BÁSICOS BLOQUEADOS */}
               <div className="space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100/50">
                 <div className="flex items-center gap-2 border-l-4 border-slate-400 pl-3">
                   <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Información Personal (Bloqueada)</h4>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   <div className="space-y-1">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Cédula / Identificación</span>
                     <input disabled type="text" value={targetUser.id} className="w-full px-4 py-3 bg-slate-100/80 text-slate-500 border-none rounded-xl font-bold text-xs outline-none cursor-not-allowed" />
                   </div>
                   <div className="space-y-1 md:col-span-2">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Nombres Completos</span>
                     <input disabled type="text" value={targetUser.name} className="w-full px-4 py-3 bg-slate-100/80 text-slate-500 border-none rounded-xl font-bold text-xs outline-none cursor-not-allowed uppercase" />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Estado Civil</span>
                     <input disabled type="text" value={targetUser.maritalStatus || 'N/A'} className="w-full px-4 py-3 bg-slate-100/80 text-slate-500 border-none rounded-xl font-bold text-xs outline-none cursor-not-allowed uppercase" />
                   </div>
                   {targetUser.spouseId && (
                     <div className="lg:col-span-4 p-4 bg-pink-50/10 rounded-2xl border border-pink-100/30 grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div className="space-y-1">
                         <span className="text-[9px] font-black text-pink-400 uppercase">Cédula Cónyuge</span>
                         <input disabled type="text" value={targetUser.spouseId} className="w-full px-4 py-3 bg-pink-50/20 text-pink-800/60 border-none rounded-xl font-bold text-xs cursor-not-allowed" />
                       </div>
                       <div className="space-y-1 md:col-span-2">
                         <span className="text-[9px] font-black text-pink-400 uppercase">Nombre Completo Cónyuge</span>
                         <input disabled type="text" value={targetUser.spouseName} className="w-full px-4 py-3 bg-pink-50/20 text-pink-800/60 border-none rounded-xl font-bold text-xs cursor-not-allowed uppercase" />
                       </div>
                     </div>
                   )}
                 </div>
               </div>

               {/* SECCIÓN 2: COMPLEMENTOS DE IDENTIDAD Y SALUD */}
               <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-b pb-6">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Profesión</label>
                   <input type="text" value={editForm.profesion} onChange={e => setEditForm({...editForm, profesion: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-xs" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Autoidentificación Étnica</label>
                   <select value={editForm.autoidentificacion} onChange={e => setEditForm({...editForm, autoidentificacion: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-xs">
                     {['MESTIZO', 'INDÍGENA', 'AFROECUATORIANO', 'BLANCO', 'MONTUBIO', 'MULATO', 'OTRO'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                   </select>
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Teléfonos de Contacto</label>
                   <input type="text" value={editForm.telefonos} onChange={e => setEditForm({...editForm, telefonos: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-xs" />
                 </div>
               </div>

               {/* SECCIÓN 3: INFORMACIÓN DOMICILIARIA Y LABORAL */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b pb-6">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dirección Domicilio (Modificable)</label>
                   <input type="text" value={editForm.direccionDomicilio} onChange={e => setEditForm({...editForm, direccionDomicilio: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-xs" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Lugar de Trabajo / Nombre Empresa (Modificable)</label>
                   <input type="text" value={editForm.lugarTrabajo} onChange={e => setEditForm({...editForm, lugarTrabajo: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-xs" />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Vivienda</label>
                   <select value={editForm.tipoVivienda} onChange={e => setEditForm({...editForm, tipoVivienda: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-xs">
                     {['PROPIA', 'ARRENDADA', 'FAMILIAR', 'COMPARTIDA', 'ANTICRESIS', 'OTROS'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                   </select>
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Valor Comercial Vivienda ($)</label>
                   <input type="number" step="0.01" value={editForm.valorVivienda} onChange={e => setEditForm({...editForm, valorVivienda: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-xs" />
                 </div>
               </div>

               {/* SECCIÓN 4: PATRIMONIO E INGRESOS */}
               <div className="space-y-4 border-b pb-6">
                 <div className="flex items-center gap-2 border-l-4 border-[#14532D] pl-3">
                   <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Patrimonio y Flujo de Ingresos Mensuales</h4>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                   <div className="space-y-1">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Ingresos Sueldo ($)</span>
                     <input type="number" step="0.01" value={editForm.ingresoSueldo} onChange={e => setEditForm({...editForm, ingresoSueldo: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none text-[#14532D]" />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Ingresos Comerciales ($)</span>
                     <input type="number" step="0.01" value={editForm.ingresoComercial} onChange={e => setEditForm({...editForm, ingresoComercial: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none text-[#14532D]" />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Otros Ingresos ($)</span>
                     <input type="number" step="0.01" value={editForm.ingresoOtros} onChange={e => setEditForm({...editForm, ingresoOtros: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs outline-none text-[#14532D]" />
                   </div>
                   <div className="space-y-1">
                     <span className="text-[9px] font-black text-slate-400 uppercase">Total de Ingresos ($)</span>
                     <input disabled type="text" value={`$ ${(parseFloat(editForm.ingresoSueldo || '0') + parseFloat(editForm.ingresoComercial || '0') + parseFloat(editForm.ingresoOtros || '0')).toFixed(2)}`} className="w-full px-4 py-3 bg-emerald-50 text-emerald-800 border-none rounded-xl font-black text-xs cursor-not-allowed" />
                   </div>
                 </div>
               </div>

               {/* SECCIÓN 5: REFERENCIAS Y CARGAS */}
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 border-b pb-6">
                 {/* Referencias */}
                 <div className="space-y-4">
                   <div className="flex justify-between items-center border-l-4 border-amber-500 pl-3">
                     <h4 className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Referencias Personales</h4>
                     <button type="button" onClick={handleAddReference} className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-all"><Plus size={16} /></button>
                   </div>
                   <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
                     {editForm.referenciasPersonales.map((ref: any, idx: number) => (
                       <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/50 flex gap-2 relative">
                         <input placeholder="Nombre" value={ref.name} onChange={e => handleUpdateReference(idx, 'name', e.target.value.toUpperCase())} className="flex-1 px-3 py-2 border rounded-xl font-bold text-[10px]" />
                         <input placeholder="Teléfono" value={ref.phone} onChange={e => handleUpdateReference(idx, 'phone', e.target.value)} className="w-32 px-3 py-2 border rounded-xl font-bold text-[10px]" />
                         <button type="button" onClick={() => handleRemoveReference(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={14} /></button>
                       </div>
                     ))}
                     {editForm.referenciasPersonales.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-4">No se han registrado referencias.</p>}
                   </div>
                 </div>

                 {/* Cargas familiares */}
                 <div className="space-y-4">
                   <div className="flex justify-between items-center border-l-4 border-purple-500 pl-3">
                     <h4 className="text-[10px] font-black text-purple-700 uppercase tracking-widest">Cargas Familiares</h4>
                     <button type="button" onClick={handleAddDependent} className="p-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-all"><Plus size={16} /></button>
                   </div>
                   <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2">
                     {editForm.cargasFamiliares.map((dep: any, idx: number) => (
                       <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/50 flex gap-2 relative">
                         <input placeholder="Nombre Completo Carga" value={dep.name} onChange={e => handleUpdateDependent(idx, 'name', e.target.value.toUpperCase())} className="flex-1 px-3 py-2 border rounded-xl font-bold text-[10px]" />
                         <select value={dep.relationship} onChange={e => handleUpdateDependent(idx, 'relationship', e.target.value)} className="w-32 px-3 py-2 border rounded-xl font-bold text-[10px]">
                           {['HIJO/A', 'PADRE/MADRE', 'CÓNYUGE', 'HERMANO/A', 'OTROS'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                         </select>
                         <button type="button" onClick={() => handleRemoveDependent(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><Trash2 size={14} /></button>
                       </div>
                     ))}
                     {editForm.cargasFamiliares.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-4">No se han registrado cargas.</p>}
                   </div>
                 </div>
               </div>

               {/* SECCIÓN 6: DECLARACIONES Y PEPS */}
               <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100/60 grid grid-cols-1 md:grid-cols-3 gap-6 font-bold text-xs text-slate-700">
                 <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={editForm.discapacidad} onChange={e => setEditForm({...editForm, discapacidad: e.target.checked})} className="w-5 h-5 border-2 border-slate-300 rounded text-[#14532D] focus:ring-0" />
                   <span className="uppercase text-[9px] font-black text-slate-600">Persona con Discapacidad</span>
                 </label>
                 <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={editForm.peps} onChange={e => setEditForm({...editForm, peps: e.target.checked})} className="w-5 h-5 border-2 border-slate-300 rounded text-red-600 focus:ring-0" />
                   <span className="uppercase text-[9px] font-black text-slate-600 text-red-600">Persona Expuesta (PEPS)</span>
                 </label>
                 <label className="flex items-center gap-3 cursor-pointer">
                   <input type="checkbox" checked={editForm.consentimientoDatos} onChange={e => setEditForm({...editForm, consentimientoDatos: e.target.checked})} className="w-5 h-5 border-2 border-slate-300 rounded text-[#14532D] focus:ring-0" />
                   <span className="uppercase text-[9px] font-black text-slate-600">Consentimiento de Datos</span>
                 </label>
               </div>

               {/* CONTROLES FINALES DE EDICIÓN */}
               <div className="flex gap-4 pt-4">
                 <button onClick={handleSaveReportProfile} disabled={loading} className="flex-1 py-5 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                   {loading ? 'Guardando...' : 'Modificar / Guardar Cambios'}
                 </button>
               </div>
             </div>
           )}
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
                    <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-2xl flex items-center justify-center font-black italic text-3xl border-b-6 border-[#FACC15] overflow-hidden">
                       <span className="text-white">G</span>
                    </div>
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
