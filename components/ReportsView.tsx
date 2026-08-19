
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
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const COLORS = ['#14532D', '#FACC15', '#2563EB', '#7C3AED', '#EC4899'];

interface ReportsViewProps {
  users?: User[];
  onUpdateUser?: (user: User) => void;
  currentUser?: User;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ users = [], onUpdateUser, currentUser }) => {
  const isMember = currentUser?.role === UserRole.MEMBER;
  const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER;
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
  const [liveSearchResults, setLiveSearchResults] = useState<User[]>([]);
  const [searchingLive, setSearchingLive] = useState(false);

  const targetUser = isMember ? currentUser : selectedS01User;

  const [editForm, setEditForm] = useState<any>(null);
  const [showPrintView, setShowPrintView] = useState(false);

  // Estados y funciones para Estado de Situación General Consolidado
  const [situacionGeneral, setSituacionGeneral] = useState<{
    totalSocios: number;
    sociosPorTipo: { TipoPersona: string; cantidad: number }[];
    saldoAhorroVista: number;
    saldoCertificados: number;
    numAhorroVista: number;
    numCertificados: number;
  } | null>(null);
  const [loadingSituacion, setLoadingSituacion] = useState(false);

  const loadSituacionGeneral = async () => {
    setLoadingSituacion(true);
    try {
      const response = await fetch('/api/reportes/situacion-general');
      const resData = await response.json();
      if (resData.ok) {
        setSituacionGeneral(resData.data);
      }
    } catch (error) {
      console.error('Error loading general situation report:', error);
    } finally {
      setLoadingSituacion(false);
    }
  };

  useEffect(() => {
    if (activeMasterTab === 'SITUACION') {
      void loadSituacionGeneral();
    }
  }, [activeMasterTab]);

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
        headers: {
          'Content-Type': 'application/json',
          ...(DataService.getToken() ? { Authorization: `Bearer ${DataService.getToken()}` } : {}),
        },
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
      alert("Error al generar el reporte. Verifique la conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (data.length === 0) return;
    const REPORT_LABELS: Record<string, string> = {
      sp_r_bal_compro: 'Balance_Comprobacion',
      sp_r_situa_gene: 'Situacion_General',
      sp_sepsb11:      'Estructura_B11',
      sp_uaf_matriz:   'Matriz_UAF',
    };
    const cols = Object.keys(data[0]);
    const header = cols.join(';');
    const rows = data.map(row => cols.map(c => String(row[c] ?? '').replace(/;/g, ',')).join(';'));
    const csv = '﻿' + [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${REPORT_LABELS[reportType] || 'Reporte'}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const localFilteredUsers = useMemo(() => {
    if (!searchQuery || isMember) return [];
    const q = searchQuery.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.id.includes(q)).slice(0, 5);
  }, [users, searchQuery, isMember]);

  // Búsqueda en vivo (SQL Server + fallback Informix legacy) cuando el filtro local no encuentra nada.
  useEffect(() => {
    if (isMember || !searchQuery || searchQuery.trim().length < 3 || localFilteredUsers.length > 0) {
      setLiveSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchingLive(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/socios/buscar?q=${encodeURIComponent(searchQuery.trim())}`);
        const d = await res.json();
        if (!cancelled && d.ok && Array.isArray(d.data)) {
          setLiveSearchResults(d.data);
        }
      } catch {
        if (!cancelled) setLiveSearchResults([]);
      } finally {
        if (!cancelled) setSearchingLive(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, localFilteredUsers.length, isMember]);

  const filteredUsers = localFilteredUsers.length > 0 ? localFilteredUsers : liveSearchResults;



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
          // RESTRICCIÓN: BI solo visible para roles administrativos (no socios, no cajeros)
          isAdmin && { id: 'BI', label: 'REPORTERÍA GENERAL (BI)', icon: <BarChart3 size={18} /> },
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
               {searchingLive && filteredUsers.length === 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-20">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Buscando en espejo legacy...</p>
                 </div>
               )}
               {filteredUsers.length > 0 && (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-20">
                    {filteredUsers.map(u => (
                      <button key={u.id} onClick={() => setSelectedS01User(u)} className="w-full p-6 text-left hover:bg-slate-50 flex items-center justify-between group transition-all">
                         <div>
                           <p className="font-black text-slate-800 uppercase text-xs">{u.name}</p>
                           <p className="text-[10px] font-bold text-slate-400">{u.id}{(u as any).origen === 'LEGACY_PG' ? ' · Legacy (espejo Postgres)' : ''}</p>
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

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="font-bold border-b pb-1 text-[#14532D] uppercase tracking-wider text-[10px]">7. Capturas de Pantalla y Croquis Geográficos</h4>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <p className="font-bold text-[10.5px] text-slate-700 uppercase">A. Croquis Domiciliario (Mapa de Ubicación):</p>
                      {targetUser.rutaImagenMapa ? (
                        <div className="border-2 border-slate-200 rounded-3xl overflow-hidden shadow-sm max-w-sm">
                          <img src={targetUser.rutaImagenMapa} alt="Mapa Domicilio" className="w-full h-48 object-cover" />
                        </div>
                      ) : (
                        <p className="italic text-slate-400 text-xs">Sin captura de mapa domiciliario registrada.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="font-bold text-[10.5px] text-slate-700 uppercase">B. Croquis Laboral (Lugar de Trabajo):</p>
                      {targetUser.rutaImagenCroquis ? (
                        <div className="border-2 border-slate-200 rounded-3xl overflow-hidden shadow-sm max-w-sm">
                          <img src={targetUser.rutaImagenCroquis} alt="Croquis Trabajo" className="w-full h-48 object-cover" />
                        </div>
                      ) : (
                        <p className="italic text-slate-400 text-xs">Sin croquis laboral registrado.</p>
                      )}
                    </div>
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

                {/* SECCIÓN 7: CROQUIS Y MAPAS GEOGRÁFICOS */}
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100/60 space-y-6">
                  <div className="flex items-center gap-2 border-l-4 border-emerald-500 pl-3">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Croquis y Mapas Registrados</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase block">Mapa Domicilio</span>
                      {targetUser.rutaImagenMapa ? (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-w-sm">
                          <img src={targetUser.rutaImagenMapa} alt="Mapa Domicilio" className="w-full h-40 object-cover" />
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Sin mapa domiciliario registrado.</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[9px] font-black text-slate-400 uppercase block">Croquis Trabajo</span>
                      {targetUser.rutaImagenCroquis ? (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-w-sm">
                          <img src={targetUser.rutaImagenCroquis} alt="Croquis Trabajo" className="w-full h-40 object-cover" />
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Sin croquis laboral registrado.</p>
                      )}
                    </div>
                  </div>
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

      {activeMasterTab === 'SITUACION' && (
        <div className="animate-in slide-in-from-right-4 space-y-8 pb-10">
          <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100 space-y-12 printable-area">
            {/* Cabecera */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b pb-10">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-2xl flex items-center justify-center font-black italic text-3xl border-b-6 border-[#FACC15] overflow-hidden">
                  <span className="text-white">G</span>
                </div>
                <div>
                  <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Estado de Situación General</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Análisis Consolidado de Socios e Indicadores Financieros Globales</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase">Fecha de Visualización</p>
                <p className="text-lg font-black text-slate-800">{new Date().toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>

            {loadingSituacion || !situacionGeneral ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-10 h-10 border-4 border-[#14532D] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Cargando Indicadores Globales...</p>
              </div>
            ) : (
              <div className="space-y-12">
                {/* Indicadores Clave en Tarjetas */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  <div className="p-8 bg-emerald-50 rounded-3xl border border-emerald-100 flex flex-col justify-between shadow-sm">
                    <div>
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-2">Socios Registrados</p>
                      <h4 className="text-4xl font-black text-[#14532D]">{situacionGeneral.totalSocios}</h4>
                    </div>
                    <p className="text-[8px] font-bold text-emerald-700/60 uppercase tracking-widest mt-6">Cuentas activas en la COAC</p>
                  </div>

                  <div className="p-8 bg-blue-50 rounded-3xl border border-blue-100 flex flex-col justify-between shadow-sm">
                    <div>
                      <p className="text-[9px] font-black text-blue-600 uppercase tracking-wider mb-2">Ahorro a la Vista Global</p>
                      <h4 className="text-3xl font-black text-blue-900">${situacionGeneral.saldoAhorroVista.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h4>
                    </div>
                    <p className="text-[8px] font-bold text-blue-800/60 uppercase tracking-widest mt-6">Depósitos a la vista a nivel global</p>
                  </div>

                  <div className="p-8 bg-amber-50 rounded-3xl border border-amber-100 flex flex-col justify-between shadow-sm">
                    <div>
                      <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-2">Cuentas de Ahorro Creadas</p>
                      <h4 className="text-4xl font-black text-amber-900">{situacionGeneral.numAhorroVista}</h4>
                    </div>
                    <p className="text-[8px] font-bold text-amber-800/60 uppercase tracking-widest mt-6">Cuentas de ahorro generadas</p>
                  </div>

                  <div className="p-8 bg-purple-50 rounded-3xl border border-purple-100 flex flex-col justify-between shadow-sm">
                    <div>
                      <p className="text-[9px] font-black text-purple-600 uppercase tracking-wider mb-2">Certificados de Aportación</p>
                      <h4 className="text-4xl font-black text-purple-900">{situacionGeneral.numCertificados}</h4>
                    </div>
                    <p className="text-[8px] font-bold text-purple-800/60 uppercase tracking-widest mt-6">Certificados de aportación emitidos</p>
                  </div>
                </div>

                {/* Gráfico y Distribución */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                  {/* Gráfico de Tarta (Pie Chart) */}
                  <div className="space-y-6">
                    <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4">Distribución de Socios por Tipo</h4>
                    <div className="h-[300px] flex items-center justify-center bg-slate-50 border border-slate-100 rounded-[2.5rem] p-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={situacionGeneral.sociosPorTipo.map(item => ({
                              name: item.TipoPersona === 'SOCIO' ? 'Socio Coac' : item.TipoPersona === 'CLIENTE' ? 'Cliente Directo' : 'Cliente Externo',
                              value: item.cantidad
                            }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {situacionGeneral.sociosPorTipo.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value) => [`${value} miembros`, 'Cantidad']}
                            contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontFamily: 'sans-serif', fontWeight: 'bold' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase', fontFamily: 'sans-serif' }} />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Detalle y Certificados Financieros */}
                  <div className="space-y-6">
                    <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest border-l-4 border-[#FACC15] pl-4">Resumen de Patrimonio e Integridad</h4>
                    <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-6">
                      <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Total Certificados Aportación (Patrimonio)</span>
                        <span className="text-lg font-black text-slate-800">${situacionGeneral.saldoCertificados.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Fondos Totales Custodiados (Global)</span>
                        <span className="text-xl font-black text-[#14532D]">${(situacionGeneral.saldoAhorroVista + situacionGeneral.saldoCertificados).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Promedio Ahorro por Socio</span>
                        <span className="text-lg font-black text-slate-800">
                          ${situacionGeneral.totalSocios > 0 ? ((situacionGeneral.saldoAhorroVista + situacionGeneral.saldoCertificados) / situacionGeneral.totalSocios).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'} USD
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t flex gap-4 no-print">
                  <button onClick={() => window.print()} className="flex-1 py-5 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl transition-all"><Printer size={20} /> IMPRIMIR ESTADO DE SITUACIÓN GENERAL</button>
                </div>
              </div>
            )}
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
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">Reportes SEPS</h3>
              <div className="space-y-2">
                {[
                  { id: 'sp_r_bal_compro', label: 'Balance de Comprobación',  desc: 'Debe / Haber por cuenta' },
                  { id: 'sp_r_situa_gene', label: 'Situación General',         desc: 'Socios, ahorros, créditos' },
                  { id: 'sp_sepsb11',      label: 'Estructura B11',             desc: 'Cartera por estado' },
                  { id: 'sp_uaf_matriz',   label: 'Matriz UAF',                 desc: 'Transacciones ≥ $5,000' },
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setReportType(r.id); setData([]); }}
                    className={`w-full p-4 rounded-2xl text-left transition-all ${reportType === r.id ? 'bg-emerald-50 text-[#14532D] border border-emerald-100' : 'text-slate-400 hover:bg-slate-50'}`}
                  >
                    <p className="text-[10px] font-black uppercase">{r.label}</p>
                    <p className="text-[9px] font-medium opacity-60 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={runReport}
                disabled={loading}
                className="w-full py-4 bg-[#14532D] text-white rounded-2xl font-black text-[10px] uppercase shadow-xl active:scale-95 transition-all disabled:opacity-60"
              >
                {loading ? 'GENERANDO...' : 'GENERAR REPORTE'}
              </button>
              {data.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={downloadCSV}
                    className="flex-1 py-3 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-[10px] uppercase transition-all"
                  >
                    <Download size={13} /> CSV
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex-1 py-3 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-[10px] uppercase transition-all"
                  >
                    <Printer size={13} /> PDF
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 overflow-hidden min-h-[500px]">
              {data.length > 0 ? (
                <div className="overflow-x-auto">
                  <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                        {{ sp_r_bal_compro: 'Balance de Comprobación', sp_r_situa_gene: 'Situación General', sp_sepsb11: 'Estructura B11 — Cartera', sp_uaf_matriz: 'Matriz UAF' }[reportType]}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{data.length} registros · {new Date().toLocaleDateString('es-EC')}</p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-6 py-4 text-left">Código</th>
                        <th className="px-6 py-4 text-left">Denominación</th>
                        {reportType === 'sp_r_bal_compro' && <>
                          <th className="px-6 py-4 text-right">Debe</th>
                          <th className="px-6 py-4 text-right">Haber</th>
                        </>}
                        <th className="px-6 py-4 text-right">{reportType === 'sp_r_situa_gene' ? 'Valor' : 'Saldo'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-black text-[#14532D] text-[11px]">{row.code ?? i + 1}</td>
                          <td className="px-6 py-4 font-bold text-slate-700 text-xs">
                            {row.name}
                            {reportType === 'sp_r_bal_compro' && row.tipoCuenta && (
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-500">{row.tipoCuenta}</span>
                            )}
                            {reportType === 'sp_r_bal_compro' && row.sinCatalogar && (
                              <span className="ml-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-700">Sin catalogar</span>
                            )}
                          </td>
                          {reportType === 'sp_r_bal_compro' && <>
                            <td className="px-6 py-4 text-right font-bold text-emerald-700 text-[11px]">${(row.debe || 0).toFixed(2)}</td>
                            <td className="px-6 py-4 text-right font-bold text-red-600 text-[11px]">${(row.haber || 0).toFixed(2)}</td>
                          </>}
                          <td className="px-6 py-4 text-right font-black text-slate-900 text-[11px]">
                            {typeof row.balance === 'number' && row.balance % 1 !== 0
                              ? `$${row.balance.toFixed(2)}`
                              : row.balance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {reportType === 'sp_r_bal_compro' && data.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-[#14532D] bg-emerald-50 font-black">
                          <td className="px-6 py-4 text-[#14532D] text-[11px]" colSpan={2}>TOTALES</td>
                          <td className="px-6 py-4 text-right text-emerald-700 text-[11px]">${data.reduce((s: number, r: any) => s + (r.debe || 0), 0).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right text-red-600 text-[11px]">${data.reduce((s: number, r: any) => s + (r.haber || 0), 0).toFixed(2)}</td>
                          <td className="px-6 py-4 text-right text-slate-900 text-[11px]">${data.reduce((s: number, r: any) => s + (r.balance || 0), 0).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {reportType === 'sp_r_bal_compro' && data.length > 0 && (() => {
                    const totalDebe  = data.reduce((s: number, r: any) => s + (r.debe  || 0), 0);
                    const totalHaber = data.reduce((s: number, r: any) => s + (r.haber || 0), 0);
                    const descuadre  = Math.round((totalDebe - totalHaber) * 100) / 100;
                    const cuadrado   = Math.abs(descuadre) < 0.01;
                    const sinCatalogarCount = data.filter((r: any) => r.sinCatalogar).length;
                    return (
                      <div className="px-8 py-5 border-t border-slate-100 flex flex-wrap items-center gap-4">
                        <span className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${cuadrado ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                          {cuadrado ? '✓ Partida Doble Cuadrada' : `⚠ Descuadre: $${descuadre.toFixed(2)}`}
                        </span>
                        {sinCatalogarCount > 0 && (
                          <span className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700">
                            ⚠ {sinCatalogarCount} cuenta(s) fuera del Catálogo Único SEPS
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-20 text-slate-200">
                  <FileBarChart size={80} className="mb-4 opacity-20" />
                  <p className="font-black uppercase tracking-widest text-xs">Seleccione un reporte y presione GENERAR</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
