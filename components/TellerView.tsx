
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Transaction, AccountType, UserRole, Dependent, PersonalReference, CashDetail, PersonType, InterbankTransfer } from '../types';
import { SEPS_CATALOGS as CATALOGS } from '../constants';
import { MapSelector } from './MapSelector';
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
  EyeOff,
  Building2,
  ArrowRightLeft,
  FileText,
  Calculator,
  Printer
} from 'lucide-react';

interface TellerViewProps {
  users: User[];
  onUpdateUser: (user: User) => void;
  currentUserRole?: UserRole;
}

type TellerTab = 'OPERATIONS' | 'CONSULTAS' | 'REGISTER' | 'CASH_CLOSE';
type OperationType = 'DEPOSIT' | 'WITHDRAW' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'INTERBANK_TRANSFER';

export const TellerView: React.FC<TellerViewProps> = ({ users, onUpdateUser, currentUserRole }) => {
  const [activeTab, setActiveTab] = useState<TellerTab>('OPERATIONS');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [opType, setOpType] = useState<OperationType>('DEPOSIT');
  const [generalFilter, setGeneralFilter] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [mapModal, setMapModal] = useState<{ isOpen: boolean; type: 'home' | 'work' }>({ isOpen: false, type: 'home' });

  // Estados para funcionalidades nuevas
  const [showCashDetail, setShowCashDetail] = useState(false);
  const [cashDetail, setCashDetail] = useState<CashDetail>({
    bills: [
      { denomination: 100, count: 0, total: 0 },
      { denomination: 50, count: 0, total: 0 },
      { denomination: 20, count: 0, total: 0 },
      { denomination: 10, count: 0, total: 0 },
      { denomination: 5, count: 0, total: 0 },
      { denomination: 1, count: 0, total: 0 },
    ],
    coins: [
      { denomination: 0.50, count: 0, total: 0 },
      { denomination: 0.25, count: 0, total: 0 },
      { denomination: 0.10, count: 0, total: 0 },
      { denomination: 0.05, count: 0, total: 0 },
      { denomination: 0.01, count: 0, total: 0 },
    ],
    total: 0
  });
  const [personType, setPersonType] = useState<PersonType>('SOCIO');
  const [interbankTransfer, setInterbankTransfer] = useState<Partial<InterbankTransfer>>({
    toBank: '',
    toAccount: '',
    toAccountName: '',
    reference: ''
  });
  const [showCashCloseModal, setShowCashCloseModal] = useState(false);

  // Estados para integración SQL Server
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [mapSelectorType, setMapSelectorType] = useState<'home' | 'work'>('home');
  const [capturedMapImage, setCapturedMapImage] = useState<string>('');
  const [capturedWorkMapImage, setCapturedWorkMapImage] = useState<string>('');
  const [mapCoordinates, setMapCoordinates] = useState<{ lat: string; lng: string } | null>(null);
  const [workMapCoordinates, setWorkMapCoordinates] = useState<{ lat: string; lng: string } | null>(null);
  const [isFormLocked, setIsFormLocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sociosConsultas, setSociosConsultas] = useState<any[]>([]);
  const [loadingConsultas, setLoadingConsultas] = useState(false);

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

  // Función para abrir el selector de mapa real
  const openRealMapSelector = (type: 'home' | 'work') => {
    setMapSelectorType(type);
    setShowMapSelector(true);
  };

  // Función para manejar la selección de ubicación del mapa
  const handleMapLocationSelect = (lat: string, lng: string, address: string, image: string) => {
    if (mapSelectorType === 'home') {
      setNewMember(p => ({ ...p, address: address.toUpperCase() }));
      setCapturedMapImage(image);
      setMapCoordinates({ lat, lng });
    } else {
      setNewMember(p => ({ ...p, workAddress: address.toUpperCase() }));
      setCapturedWorkMapImage(image);
      setWorkMapCoordinates({ lat, lng });
    }
  };

  // Función para cerrar el formulario sin guardar
  const handleCloseForm = () => {
    if (isFormLocked) {
      if (confirm('¿Está seguro de cerrar el formulario? Los datos no guardados se perderán.')) {
        resetForm();
      }
    } else {
      resetForm();
    }
  };

  // Función para resetear el formulario
  const resetForm = () => {
    setNewMember({
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
      pin: '1234',
      needsPinChange: true
    });
    setPersonType('SOCIO');
    setCapturedMapImage('');
    setCapturedWorkMapImage('');
    setMapCoordinates(null);
    setWorkMapCoordinates(null);
    setIsFormLocked(false);
    setIdStatus('idle');
  };

  // Función para registrar socio en SQL Server
  const handleRegisterSocioSQL = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (idStatus === 'invalid') {
      return alert('Cédula inválida.');
    }

    if (!newMember.id || !newMember.firstName || !newMember.lastName || !newMember.pin) {
      return alert('Por favor complete los campos obligatorios.');
    }

    setIsSaving(true);

    try {
      // Registrar socio en SQL Server
      const response = await fetch('/api/socios/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoPersona: personType,
          tipoIdentificacion: newMember.idType,
          identificacion: newMember.id,
          primerNombre: newMember.firstName,
          segundoNombre: newMember.middleName,
          apellidos: newMember.lastName,
          email: newMember.email,
          telefono: newMember.phone,
          fechaNacimiento: newMember.birthDate,
          estadoCivil: newMember.maritalStatus,
          pin: newMember.pin,
          paisNacimiento: newMember.birthCountry,
          provinciaNacimiento: newMember.birthProvince,
          cantonNacimiento: newMember.birthCity,
          parroquiaNacimiento: newMember.birthParish,
          paisResidencia: newMember.residenceCountry,
          provinciaResidencia: newMember.province,
          cantonResidencia: newMember.city,
          parroquiaResidencia: newMember.parish,
          direccionDomicilio: newMember.address,
          lugarTrabajo: newMember.workAddress,
          provinciaTrabajo: newMember.workProvince,
          cantonTrabajo: newMember.workCity,
          parroquiaTrabajo: newMember.workParish,
          cedulaConyuge: newMember.spouseId,
          nombreConyuge: newMember.spouseName,
          telefonoConyuge: newMember.spousePhone,
          etnia: newMember.ethnicity,
          genero: newMember.gender,
          nivelInstruccion: newMember.instructionLevel,
          profesion: newMember.profession,
          referenciasPersonales: newMember.references,
          cargasFamiliares: newMember.dependents,
          usuarioRegistro: currentUserRole === UserRole.TELLER ? 'caja' : 'admin'
        })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Error al registrar socio');
      }

      // Guardar imagen del mapa de ubicación si existe
      if (capturedMapImage && data.socioId) {
        await fetch('/api/socios/guardar-mapa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socioId: data.socioId,
            imagenMapa: capturedMapImage,
            coordenadaLat: mapCoordinates?.lat,
            coordenadaLng: mapCoordinates?.lng,
            direccionCapturada: newMember.address
          })
        });
      }

      // Guardar imagen del croquis de trabajo si existe
      if (capturedWorkMapImage && data.socioId) {
        await fetch('/api/socios/guardar-croquis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socioId: data.socioId,
            imagenCroquis: capturedWorkMapImage,
            descripcion: 'Croquis del lugar de trabajo'
          })
        });
      }

      alert(`¡${personType.replace('_', ' ')} registrado exitosamente!\nNúmero de Socio: ${data.numeroSocio}\nID de Socio: ${data.socioId}`);

      // Resetear formulario y cambiar a consultas
      resetForm();
      setActiveTab('CONSULTAS');
      // Cargar datos actualizados
      loadSociosConsultas();

    } catch (error) {
      console.error('Error registrando socio:', error);
      alert('Error al registrar el socio. Por favor intente nuevamente.');
    } finally {
      setIsSaving(false);
    }
  };

  // Función para cargar socios desde SQL Server
  const loadSociosConsultas = async () => {
    setLoadingConsultas(true);
    try {
      const response = await fetch('/api/socios/consultas');
      const data = await response.json();
      if (data.ok) {
        setSociosConsultas(data.data);
      }
    } catch (error) {
      console.error('Error cargando consultas:', error);
    } finally {
      setLoadingConsultas(false);
    }
  };

  // Cargar datos cuando se cambia a la pestaña CONSULTAS
  useEffect(() => {
    if (activeTab === 'CONSULTAS') {
      loadSociosConsultas();
    }
  }, [activeTab]);

  // Funciones para manejo de efectivo
  const updateCashDetail = (type: 'bills' | 'coins', index: number, count: number) => {
    const updated = { ...cashDetail };
    updated[type][index].count = count;
    updated[type][index].total = updated[type][index].denomination * count;
    updated.total = updated.bills.reduce((sum, b) => sum + b.total, 0) + updated.coins.reduce((sum, c) => sum + c.total, 0);
    setCashDetail(updated);
    setAmount(updated.total.toString());
  };

  const calculateCashTotal = () => {
    const total = cashDetail.bills.reduce((sum, b) => sum + b.total, 0) + cashDetail.coins.reduce((sum, c) => sum + c.total, 0);
    setCashDetail({ ...cashDetail, total });
    setAmount(total.toString());
  };

  // Modificar handleOperation para incluir nuevas operaciones
  const handleOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !amount) return;
    const numAmount = parseFloat(amount);

    let description = '';
    let category = '';

    switch (opType) {
      case 'DEPOSIT':
        description = showCashDetail ? 'DEPÓSITO VENTANILLA CON DETALLE' : 'DEPÓSITO VENTANILLA';
        category = 'Caja';
        break;
      case 'WITHDRAW':
        description = 'RETIRO VENTANILLA';
        category = 'Caja';
        break;
      case 'CREDIT_NOTE':
        description = 'NOTA DE CRÉDITO';
        category = 'Ajustes';
        break;
      case 'DEBIT_NOTE':
        description = 'NOTA DE DÉBITO';
        category = 'Ajustes';
        break;
      case 'INTERBANK_TRANSFER':
        description = `TRANSFERENCIA INTERBANCARIA A ${interbankTransfer.toBank}`;
        category = 'Transferencias';
        break;
    }

    const updatedAccounts = selectedUser.accounts.map(acc => {
      if (acc.id === selectedAccountId) {
        if (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE') {
          return { ...acc, balance: acc.balance + numAmount };
        } else {
          return { ...acc, balance: acc.balance - numAmount };
        }
      }
      return acc;
    });

    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
      date: new Date().toLocaleDateString('es-EC'),
      description,
      amount: (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE') ? numAmount : -numAmount,
      type: (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE') ? 'CREDIT' : 'DEBIT',
      category,
      accountId: selectedAccountId,
      isCash: opType === 'DEPOSIT' || opType === 'WITHDRAW',
      tellerId: currentUserRole === UserRole.TELLER ? 'caja' : undefined
    };

    onUpdateUser({ ...selectedUser, accounts: updatedAccounts, transactions: [newTx, ...(selectedUser.transactions || [])] });
    alert("Operación exitosa.");

    // Preguntar si desea cerrar caja después del depósito
    if (opType === 'DEPOSIT' && !showCashCloseModal) {
      if (confirm('¿Desea realizar el cierre de caja?')) {
        setShowCashCloseModal(true);
      }
    }

    // Resetear estados
    setSelectedUser(null);
    setAmount('');
    setCashDetail({
      bills: cashDetail.bills.map(b => ({ ...b, count: 0, total: 0 })),
      coins: cashDetail.coins.map(c => ({ ...c, count: 0, total: 0 })),
      total: 0
    });
    setShowCashDetail(false);
    setInterbankTransfer({ toBank: '', toAccount: '', toAccountName: '', reference: '' });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20 no-print">
      {/* Modal Mapa Real con Captura */}
      {showMapSelector && (
        <MapSelector
          onLocationSelect={handleMapLocationSelect}
          onClose={() => setShowMapSelector(false)}
          initialPosition={mapSelectorType === 'home' ? { lat: -1.5923, lng: -78.9044 } : { lat: -1.5923, lng: -78.9044 }}
          title={mapSelectorType === 'home' ? 'Seleccionar Ubicación de Domicilio' : 'Seleccionar Ubicación de Trabajo'}
        />
      )}

      <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 flex gap-2 overflow-x-auto no-scrollbar sticky top-0 z-40">
        {[
          { id: 'OPERATIONS', label: 'OPERACIONES', icon: <Banknote size={18} /> },
          { id: 'REGISTER', label: 'APERTURA DE SOCIO', icon: <UserPlus size={18} /> },
          { id: 'CONSULTAS', label: 'DIRECTORIO', icon: <Search size={18} /> },
          { id: 'CASH_CLOSE', label: 'CIERRE DE CAJA', icon: <Calculator size={18} /> }
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
                  <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-[2rem]">
                    <button type="button" onClick={() => { setOpType('DEPOSIT'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'DEPOSIT' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>DEPÓSITO</button>
                    <button type="button" onClick={() => { setOpType('WITHDRAW'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'WITHDRAW' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>RETIRO</button>
                    <button type="button" onClick={() => { setOpType('CREDIT_NOTE'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'CREDIT_NOTE' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>NOTA CRÉDITO</button>
                    <button type="button" onClick={() => { setOpType('DEBIT_NOTE'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'DEBIT_NOTE' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>NOTA DÉBITO</button>
                    <button type="button" onClick={() => { setOpType('INTERBANK_TRANSFER'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'INTERBANK_TRANSFER' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>TRANSFERENCIA</button>
                  </div>

                  {opType === 'INTERBANK_TRANSFER' && (
                    <div className="space-y-4 animate-in slide-in-from-top-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Banco Destino</label>
                          <select required value={interbankTransfer.toBank} onChange={e => setInterbankTransfer({...interbankTransfer, toBank: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                            <option value="">Seleccione...</option>
                            <option value="BANCO PICHINCHA">BANCO PICHINCHA</option>
                            <option value="BANCO GUAYAQUIL">BANCO GUAYAQUIL</option>
                            <option value="BANCO PACÍFICO">BANCO PACÍFICO</option>
                            <option value="BANCO AMAZONAS">BANCO AMAZONAS</option>
                            <option value="BANCO BOLIVARIANO">BANCO BOLIVARIANO</option>
                            <option value="BANCO DEL AUSTRO">BANCO DEL AUSTRO</option>
                            <option value="BANCO INTERNACIONAL">BANCO INTERNACIONAL</option>
                            <option value="BANCO PRODUBANCO">BANCO PRODUBANCO</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cuenta Destino</label>
                          <input required type="text" value={interbankTransfer.toAccount} onChange={e => setInterbankTransfer({...interbankTransfer, toAccount: e.target.value})} placeholder="Número de cuenta" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Beneficiario</label>
                        <input required type="text" value={interbankTransfer.toAccountName} onChange={e => setInterbankTransfer({...interbankTransfer, toAccountName: e.target.value.toUpperCase()})} placeholder="Nombre completo" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Referencia</label>
                        <input type="text" value={interbankTransfer.reference} onChange={e => setInterbankTransfer({...interbankTransfer, reference: e.target.value})} placeholder="Referencia opcional" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto de Operación ($)</label>
                     <div className="relative">
                       <DollarSign size={24} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                       <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full pl-16 pr-8 py-5 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] text-2xl focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" />
                     </div>
                  </div>

                  {opType === 'DEPOSIT' && (
                    <div className="space-y-4">
                      <button type="button" onClick={() => setShowCashDetail(!showCashDetail)} className="flex items-center gap-2 text-[10px] font-black text-[#14532D] uppercase tracking-widest hover:underline">
                        <Calculator size={16} /> {showCashDetail ? 'Ocultar' : 'Mostrar'} detalle de billetes y monedas
                      </button>

                      {showCashDetail && (
                        <div className="space-y-6 animate-in slide-in-from-top-4 p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                          <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest">Detalle de Billetes</h4>
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                            {cashDetail.bills.map((bill, i) => (
                              <div key={i} className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase block text-center">${bill.denomination}</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={bill.count}
                                  onChange={e => updateCashDetail('bills', i, parseInt(e.target.value) || 0)}
                                  className="w-full px-3 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-center text-[#14532D] focus:border-[#14532D] outline-none"
                                />
                                <p className="text-[9px] font-bold text-center text-slate-400">${bill.total.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>

                          <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest pt-4 border-t border-emerald-200">Detalle de Monedas</h4>
                          <div className="grid grid-cols-5 gap-4">
                            {cashDetail.coins.map((coin, i) => (
                              <div key={i} className="space-y-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase block text-center">${coin.denomination}</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={coin.count}
                                  onChange={e => updateCashDetail('coins', i, parseInt(e.target.value) || 0)}
                                  className="w-full px-3 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-center text-[#14532D] focus:border-[#14532D] outline-none"
                                />
                                <p className="text-[9px] font-bold text-center text-slate-400">${coin.total.toFixed(2)}</p>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-between items-center pt-4 border-t border-emerald-200 bg-emerald-100 p-4 rounded-2xl">
                            <span className="text-sm font-black text-[#14532D] uppercase">Total Efectivo:</span>
                            <span className="text-2xl font-black text-[#14532D]">${cashDetail.total.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
          <div className="p-10 border-b bg-emerald-50/50 flex items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center shadow-lg">
                 <UserPlus size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Apertura de Socio Integral</h3>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Sincronización Automática SEPS S01 • Manual 28.0</p>
              </div>
            </div>
            <div className="flex gap-2 p-2 bg-white rounded-2xl border border-emerald-200">
              <button
                type="button"
                onClick={() => setPersonType('SOCIO')}
                disabled={isFormLocked && personType !== 'SOCIO'}
                className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${personType === 'SOCIO' ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'} ${isFormLocked && personType !== 'SOCIO' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                SOCIO
              </button>
              <button
                type="button"
                onClick={() => setPersonType('CLIENTE')}
                disabled={isFormLocked && personType !== 'CLIENTE'}
                className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${personType === 'CLIENTE' ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'} ${isFormLocked && personType !== 'CLIENTE' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                CLIENTE
              </button>
              <button
                type="button"
                onClick={() => setPersonType('CLIENTE_EXTERNO')}
                disabled={isFormLocked && personType !== 'CLIENTE_EXTERNO'}
                className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${personType === 'CLIENTE_EXTERNO' ? 'bg-[#14532D] text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'} ${isFormLocked && personType !== 'CLIENTE_EXTERNO' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                CLIENTE EXTERNO
              </button>
            </div>
          </div>
          
          <form className="p-12 space-y-8" onSubmit={handleRegisterSocioSQL}>
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
                    <button type="button" onClick={() => openRealMapSelector('home')} className="p-4 bg-white border-2 border-slate-100 text-blue-600 rounded-2xl shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2">
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
                    <button type="button" onClick={() => openRealMapSelector('work')} className="p-4 bg-white border-2 border-slate-100 text-emerald-600 rounded-2xl shadow-sm hover:bg-emerald-50 transition-all flex items-center gap-2">
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

            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleCloseForm}
                className="flex-1 py-7 bg-slate-200 text-slate-600 rounded-full font-black text-xl shadow-lg border-b-[6px] border-slate-300 active:translate-y-2 transition-all uppercase tracking-tighter hover:bg-slate-300"
              >
                CERRAR
              </button>
              <button
                type="submit"
                disabled={idStatus === 'invalid' || isSaving}
                className="flex-1 py-7 bg-[#14532D] text-white rounded-full font-black text-xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-2 transition-all uppercase tracking-tighter disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    GUARDANDO...
                  </>
                ) : (
                  'REGISTRO SOCIO PATATE'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'CONSULTAS' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500">
           <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-10">
              <div>
                <h3 className="text-2xl font-black text-slate-800">Consultas de Socio y Fichas</h3>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Registros SQL Server SQLGUTPATATE</p>
              </div>
              <div className="relative w-full md:w-96">
                <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  value={generalFilter} 
                  onChange={e => setGeneralFilter(e.target.value)} 
                  placeholder="Nombre o Cédula..." 
                  className="w-full pl-14 pr-6 py-4 bg-slate-100 border-2 border-slate-100 rounded-2xl outline-none font-bold text-[#14532D] focus:border-[#14532D] shadow-inner" 
                />
              </div>
           </div>
           
           {loadingConsultas ? (
             <div className="flex items-center justify-center py-20">
               <Loader2 size={32} className="animate-spin text-[#14532D]" />
               <span className="ml-4 text-[10px] font-black text-slate-400 uppercase">Cargando datos de SQL Server...</span>
             </div>
           ) : (
             <div className="overflow-x-auto rounded-3xl border border-slate-50">
               <table className="w-full text-sm">
                 <thead className="bg-slate-50 border-b">
                   <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <th className="px-8 py-5 text-left">Nro Socio</th>
                     <th className="px-8 py-5 text-left">Tipo</th>
                     <th className="px-8 py-5 text-left">Identificación</th>
                     <th className="px-8 py-5 text-left">Nombres Completos</th>
                     <th className="px-8 py-5 text-left">Fecha Registro</th>
                     <th className="px-8 py-5 text-center">Mapa</th>
                     <th className="px-8 py-5 text-center">Croquis</th>
                     <th className="px-8 py-5 text-center">Estado</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {sociosConsultas
                     .filter(s => 
                       s.NombreCompleto?.toLowerCase().includes(generalFilter.toLowerCase()) ||
                       s.Identificacion?.includes(generalFilter)
                     )
                     .map(s => (
                     <tr key={s.SOCIOID} className="hover:bg-slate-50 transition-colors group">
                       <td className="px-8 py-5 font-black text-[#14532D]">{s.NumeroSocio || 'S/N'}</td>
                       <td className="px-8 py-5">
                         <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                           s.TipoPersona === 'SOCIO' ? 'bg-emerald-100 text-emerald-700' : 
                           s.TipoPersona === 'CLIENTE' ? 'bg-blue-100 text-blue-700' : 
                           'bg-purple-100 text-purple-700'
                         }`}>
                           {s.TipoPersona.replace('_', ' ')}
                         </span>
                       </td>
                       <td className="px-8 py-5 font-bold text-slate-800 text-xs">{s.Identificacion}</td>
                       <td className="px-8 py-5 font-bold text-slate-800 uppercase text-xs">{s.NombreCompleto}</td>
                       <td className="px-8 py-5 text-[10px] font-black text-slate-400">
                         {s.FechaRegistro ? new Date(s.FechaRegistro).toLocaleDateString('es-EC') : 'N/A'}
                       </td>
                       <td className="px-8 py-5 text-center">
                         {s.TieneMapaUbicacion ? (
                           <CheckCircle2 size={16} className="text-emerald-600 mx-auto" />
                         ) : (
                           <span className="text-slate-300">—</span>
                         )}
                       </td>
                       <td className="px-8 py-5 text-center">
                         {s.TieneCroquisTrabajo ? (
                           <CheckCircle2 size={16} className="text-emerald-600 mx-auto" />
                         ) : (
                           <span className="text-slate-300">—</span>
                         )}
                       </td>
                       <td className="px-8 py-5 text-center">
                         <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                           s.Estado === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                         }`}>
                           {s.Estado}
                         </span>
                       </td>
                     </tr>
                   ))}
                   {sociosConsultas.filter(s => 
                     s.NombreCompleto?.toLowerCase().includes(generalFilter.toLowerCase()) ||
                     s.Identificacion?.includes(generalFilter)
                   ).length === 0 && (
                     <tr>
                       <td colSpan={8} className="px-8 py-20 text-center">
                         <div className="flex flex-col items-center gap-4">
                           <Search size={48} className="text-slate-200" />
                           <p className="text-[10px] font-black text-slate-400 uppercase">No se encontraron registros</p>
                         </div>
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
           )}
        </div>
      )}

      {activeTab === 'CASH_CLOSE' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500">
          <div className="flex items-center gap-6 mb-10">
            <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center shadow-lg">
              <Calculator size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Cierre de Caja</h3>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Arqueo de efectivo y consolidación de operaciones</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest mb-4">Detalle de Billetes</h4>
                <div className="grid grid-cols-3 gap-4">
                  {cashDetail.bills.map((bill, i) => (
                    <div key={i} className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase block text-center">${bill.denomination}</label>
                      <input
                        type="number"
                        min="0"
                        value={bill.count}
                        onChange={e => updateCashDetail('bills', i, parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-center text-[#14532D] focus:border-[#14532D] outline-none"
                      />
                      <p className="text-[9px] font-bold text-center text-slate-400">${bill.total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest mb-4">Detalle de Monedas</h4>
                <div className="grid grid-cols-5 gap-4">
                  {cashDetail.coins.map((coin, i) => (
                    <div key={i} className="space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase block text-center">${coin.denomination}</label>
                      <input
                        type="number"
                        min="0"
                        value={coin.count}
                        onChange={e => updateCashDetail('coins', i, parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-center text-[#14532D] focus:border-[#14532D] outline-none"
                      />
                      <p className="text-[9px] font-bold text-center text-slate-400">${coin.total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-[#14532D] p-8 rounded-3xl text-white shadow-2xl">
                <h4 className="text-sm font-black text-emerald-300 uppercase tracking-widest mb-6">Resumen del Cierre</h4>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-white/10">
                    <span className="text-sm font-bold">Fecha de Cierre</span>
                    <span className="text-sm font-black">{new Date().toLocaleDateString('es-EC')}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/10">
                    <span className="text-sm font-bold">Cajero</span>
                    <span className="text-sm font-black">Cajero Matriz</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/10">
                    <span className="text-sm font-bold">Total Efectivo</span>
                    <span className="text-2xl font-black text-[#FACC15]">${cashDetail.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/10">
                    <span className="text-sm font-bold">Total Transacciones</span>
                    <span className="text-sm font-black">{users.reduce((acc, u) => acc + (u.transactions?.length || 0), 0)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Operaciones del Día</h4>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {users.flatMap(u => u.transactions || []).slice(-10).reverse().map((tx, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-white rounded-xl border border-slate-100">
                      <div>
                        <p className="text-[10px] font-black text-slate-500">{tx.date}</p>
                        <p className="text-xs font-bold text-slate-800">{tx.description}</p>
                      </div>
                      <p className={`text-sm font-black ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  alert(`Cierre de caja completado exitosamente.\nTotal: $${cashDetail.total.toFixed(2)}\nFecha: ${new Date().toLocaleDateString('es-EC')}`);
                  setCashDetail({
                    bills: cashDetail.bills.map(b => ({ ...b, count: 0, total: 0 })),
                    coins: cashDetail.coins.map(c => ({ ...c, count: 0, total: 0 })),
                    total: 0
                  });
                }}
                className="w-full py-6 bg-[#14532D] text-white rounded-2xl font-black text-xl shadow-2xl border-b-[4px] border-[#FACC15] active:translate-y-2 transition-all uppercase tracking-tighter flex items-center justify-center gap-3"
              >
                <Printer size={24} /> CONFIRMAR CIERRE DE CAJA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
