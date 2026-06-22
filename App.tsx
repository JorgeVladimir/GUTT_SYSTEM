
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppView, Transaction, User, UserRole, AccountType, InterestRate, GlobalConfig, ChartOfAccountEntry, Loan } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Transfers } from './components/Transfers';
import { ChatAssistant } from './components/ChatAssistant';
import { Register } from './components/Register';
import { AccountantView } from './components/AccountantView';
import { TellerView } from './components/TellerView';
import { AdminView } from './components/AdminView';
import { BIPanel } from './components/BIPanel';
import { CreditsView } from './components/CreditsView';
import { CreditOfficerApproval } from './components/CreditOfficerApproval';
import { PlazoFijoView } from './components/PlazoFijoView';
import { ReportsView } from './components/ReportsView';
import { ProfileView } from './components/ProfileView';
import { ReportsSociosCreditos } from './components/ReportsSociosCreditos';
import { INITIAL_RATES, DEFAULT_CONFIG } from './constants';
import { DataService } from './services/dataService';
import { ArrowRight, ShieldCheck, Lock, User as UserIcon, Eye, EyeOff, UserPlus, KeyRound, Check, RefreshCw, CheckCircle2, Info, X } from 'lucide-react';

const INITIAL_CHART: ChartOfAccountEntry[] = [
  { code: '1', name: 'ACTIVOS', level: 1, type: 'ASSET', balance: 0 },
  { code: '1.1', name: 'DISPONIBLE', level: 2, type: 'ASSET', balance: 0 },
  { code: '1.1.01', name: 'Caja Ventanilla', level: 3, type: 'ASSET', balance: 0 },
  { code: '1.2', name: 'CARTERA DE CRÉDITO', level: 2, type: 'ASSET', balance: 0 },
  { code: '1.2.01', name: 'Créditos Vigentes', level: 3, type: 'ASSET', balance: 0 },
  { code: '2', name: 'PASIVOS', level: 1, type: 'LIABILITY', balance: 0 },
  { code: '2.1', name: 'OBLIGACIONES CON EL PÚBLICO', level: 2, type: 'LIABILITY', balance: 0 },
  { code: '2.1.01', name: 'Depósitos a la Vista (Ahorros)', level: 3, type: 'LIABILITY', balance: 0 },
  { code: '3', name: 'PATRIMONIO', level: 1, type: 'EQUITY', balance: 0 },
  { code: '3.1', name: 'CAPITAL SOCIAL', level: 2, type: 'EQUITY', balance: 0 },
  { code: '3.1.01', name: 'Certificados de Aportación', level: 3, type: 'EQUITY', balance: 0 },
];

const CAPLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const dimensions = size === "sm" ? "w-10 h-10" : size === "lg" ? "w-24 h-24" : "w-16 h-16";
  const textSize = size === "sm" ? "text-xl" : size === "lg" ? "text-5xl" : "text-3xl";
  const radius = size === "sm" ? "rounded-xl" : size === "lg" ? "rounded-[2rem]" : "rounded-2xl";
  const borderBottom = size === "sm" ? "border-b-4" : size === "lg" ? "border-b-8" : "border-b-6";
  return (
    <div className={`${dimensions} bg-[#14532D] flex items-center justify-center relative ${radius} shadow-2xl shrink-0 ${borderBottom} border-[#FACC15] overflow-hidden group`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <span className={`font-black text-white ${textSize} italic pr-0.5 relative z-10`}>G</span>
    </div>
  );
};

export default function App() {
  const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === 'true';
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [tellerTab, setTellerTab] = useState<'OPERATIONS' | 'REGISTER' | 'TX_SEARCH' | 'CONSULTAS' | 'CASH_CLOSE'>('OPERATIONS');
  const [adminTab, setAdminTab] = useState<'SUMMARY' | 'MEMBERS' | 'TASAS' | 'PRODUCTOS' | 'SEGURIDAD'>('SUMMARY');
  const [biTab, setBiTab] = useState<'BUILDER' | 'PROFITABILITY' | 'BUREAU'>('PROFITABILITY');
  const [creditOfficerTab, setCreditOfficerTab] = useState<'APPROVALS' | 'COLLECTIONS' | 'NEW_LOAN' | 'CARTERA'>('APPROVALS');
  const [plazoFijoTab, setPlazoFijoTab] = useState<'GESTION' | 'NUEVA' | 'VENCIMIENTOS' | 'TASAS' | 'CONTABILIDAD'>('GESTION');
  const [reportsSocioTab, setReportsSocioTab] = useState<'GENERAL' | 'SOCIO_SEARCH' | 'PROFITABILITY' | 'ORIGINS'>('GENERAL');
  const [interestRates, setInterestRates] = useState<InterestRate[]>(INITIAL_RATES);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(DEFAULT_CONFIG);
  const [users, setUsers] = useState<User[]>([]);

  // Custom Alert & Confirm Modals
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
    isConfirm: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const showCustomAlert = (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info', title: string = 'Aviso') => {
    return new Promise<void>((resolve) => {
      setAlertConfig({
        isOpen: true,
        title,
        message,
        type,
        isConfirm: false,
        onConfirm: () => {
          setAlertConfig(null);
          resolve();
        }
      });
    });
  };

  const showCustomConfirm = (message: string, title: string = 'Confirmar') => {
    return new Promise<boolean>((resolve) => {
      setAlertConfig({
        isOpen: true,
        title,
        message,
        type: 'warning',
        isConfirm: true,
        onConfirm: () => {
          setAlertConfig(null);
          resolve(true);
        },
        onCancel: () => {
          setAlertConfig(null);
          resolve(false);
        }
      });
    });
  };

  // Timer de inactividad
  const IDLE_TIMEOUT  = 30 * 60 * 1000; // 30 minutos
  const WARN_COUNTDOWN = 30;             // 30 segundos de cuenta regresiva
  const [idleWarning, setIdleWarning]   = useState(false);
  const [countdown, setCountdown]       = useState(WARN_COUNTDOWN);
  const idleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current)    clearTimeout(idleTimerRef.current);
    if (countdownRef.current)    clearInterval(countdownRef.current);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (!currentUser || idleWarning) return;
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      setIdleWarning(true);
      setCountdown(WARN_COUNTDOWN);
    }, IDLE_TIMEOUT);
  }, [currentUser, idleWarning, clearIdleTimer]);

  // Arrancar/detener el timer según sesión activa
  useEffect(() => {
    if (currentUser && view !== AppView.LOGIN && view !== AppView.CHANGE_PIN) {
      resetIdleTimer();
      const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
      events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive: true }));
      return () => {
        clearIdleTimer();
        events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      };
    } else {
      clearIdleTimer();
      setIdleWarning(false);
    }
  }, [currentUser, view, resetIdleTimer, clearIdleTimer]);

  // Cuenta regresiva cuando el warning está activo
  useEffect(() => {
    if (!idleWarning) return;
    setCountdown(WARN_COUNTDOWN);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [idleWarning]);

  // Auto-logout cuando el contador llega a 0
  useEffect(() => {
    if (idleWarning && countdown === 0) {
      clearIdleTimer();
      setIdleWarning(false);
      handleIdleLogout();
    }
  }, [countdown, idleWarning]);

  const handleIdleLogout = () => {
    setCurrentUser(null);
    setView(AppView.LOGIN);
    setNewPin('');
    setConfirmPin('');
    setIdleWarning(false);
    clearIdleTimer();
  };

  // Estados para cambio de PIN
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const getDefaultUsers = (): User[] => [
    { id: 'admin', name: 'Administrador General', pin: '1234', role: UserRole.ADMIN, accounts: [], transactions: [], loans: [] },
    { id: 'superuser', name: 'Super Usuario del Sistema', pin: '1234', role: UserRole.SUPER_USER, accounts: [], transactions: [], loans: [] },
    { id: 'cont', name: 'Contador Institucional', pin: '1234', role: UserRole.ACCOUNTANT, accounts: [], transactions: [], loans: [] },
    { id: 'caja', name: 'Cajero Matriz', pin: '1234', role: UserRole.TELLER, accounts: [], transactions: [], loans: [] },
    { id: 'asesor', name: 'Asesor de Crédito', pin: '1234', role: UserRole.CREDIT_OFFICER, accounts: [], transactions: [], loans: [] }
  ];

  const chartOfAccounts = useMemo(() => {
    const chart = INITIAL_CHART.map(c => ({ ...c, balance: 0 }));
    users.forEach(u => {
      const savings = u.accounts.find(a => a.type === AccountType.SAVINGS)?.balance || 0;
      const certs = u.accounts.find(a => a.type === AccountType.CERTIFICATE)?.balance || 0;
      const loanPrincipal = (u.loans || []).filter(l => l.status === 'VIGENTE').reduce((acc, l) => acc + l.balance, 0);

      const node2101 = chart.find(c => c.code === '2.1.01');
      if (node2101) node2101.balance += savings;
      const node3101 = chart.find(c => c.code === '3.1.01');
      if (node3101) node3101.balance += certs;
      const node1201 = chart.find(c => c.code === '1.2.01');
      if (node1201) node1201.balance += loanPrincipal;
    });

    const cashFlow = users.flatMap(u => u.transactions || [])
      .filter(tx => tx.isCash)
      .reduce((acc, tx) => acc + tx.amount, 0);
    
    const node1101 = chart.find(c => c.code === '1.1.01');
    if (node1101) node1101.balance = Math.max(0, cashFlow + 5000);

    chart.forEach(node => {
      if (node.level === 2) node.balance = chart.filter(c => c.level === 3 && c.code.startsWith(node.code)).reduce((acc, c) => acc + c.balance, 0);
    });
    chart.forEach(node => {
      if (node.level === 1) node.balance = chart.filter(c => c.level === 2 && c.code.startsWith(node.code)).reduce((acc, c) => acc + c.balance, 0);
    });
    return chart;
  }, [users]);

  const reloadAllUsers = async () => {
    if (useRemoteApi) {
      try {
        const response = await fetch('/api/socios/buscar');
        const data = await response.json();
        if (data.ok && Array.isArray(data.data)) {
          const defaultEmployees = getDefaultUsers();
          setUsers([...defaultEmployees, ...data.data]);
        }
      } catch (error) {
        console.error('Error al recargar socios desde base de datos:', error);
      }
    } else {
      const savedUsers = await DataService.getUsers();
      if (savedUsers.length > 0) setUsers(savedUsers);
      else setUsers(getDefaultUsers());
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      await reloadAllUsers();

      const savedRates = await DataService.getRates();
      if (savedRates.length > 0) setInterestRates(savedRates);

      const savedConfig = await DataService.getConfig();
      if (savedConfig.minLoanAmount) setGlobalConfig(savedConfig);
    };
    loadInitialData();
  }, [useRemoteApi]);

  useEffect(() => {
    if (!useRemoteApi && users.length > 0) {
      DataService.saveUsers(users);
    }
  }, [users, useRemoteApi]);

  useEffect(() => {
    if (currentUser) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [users]);

  const navigateByRole = (user: User) => {
    if (user.needsPinChange) setView(AppView.CHANGE_PIN);
    else {
      if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_USER) setView(AppView.ADMIN_HUB);
      else if (user.role === UserRole.ACCOUNTANT) setView(AppView.CHART_OF_ACCOUNTS);
      else if (user.role === UserRole.TELLER) setView(AppView.TELLER_OPERATIONS);
      else if (user.role === UserRole.CREDIT_OFFICER) setView(AppView.CREDIT_OFFICER_HUB);
      else setView(AppView.DASHBOARD);
    }
  };

  const handleLogin = async (id: string, pin: string) => {
    const cleanId = id.trim().toLowerCase();
    const cleanPin = pin.trim();

    if (useRemoteApi) {
      try {
        const loginResult = await DataService.login(cleanId, cleanPin);
        if (loginResult) {
          const profile = await DataService.getUserFullData(loginResult.id).catch(() => loginResult);
          setCurrentUser(profile);
          setLoginError('');
          navigateByRole(profile);
          return;
        }
      } catch (error) {
        console.error('Login remoto fallido, se usa respaldo local:', error);
      }
    }

    const found = users.find(u => u.id.toLowerCase() === cleanId && u.pin === cleanPin);
    
    if (found) {
      setCurrentUser(found);
      navigateByRole(found);
      setLoginError('');
    } else {
      setLoginError('Identificación o PIN incorrectos.');
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (newPin.length < 4) {
      await showCustomAlert("La contraseña debe tener al menos 4 caracteres.", "warning", "Contraseña Corta");
      return;
    }
    if (newPin !== confirmPin) {
      await showCustomAlert("Las contraseñas no coinciden.", "error", "Validación");
      return;
    }
    if (newPin === '1234') {
      await showCustomAlert("Debe elegir una contraseña distinta a la inicial por seguridad.", "warning", "Contraseña Insegura");
      return;
    }

    try {
      if (useRemoteApi) {
        const res = await DataService.updatePassword(currentUser.id, newPin);
        if (!res.ok) {
          await showCustomAlert("Error al actualizar la contraseña en el servidor.", "error", "Error Servidor");
          return;
        }
      }
      const updatedUser: User = { ...currentUser, pin: newPin, needsPinChange: false };
      handleUpdateUser(updatedUser);
      setCurrentUser(updatedUser);
      navigateByRole(updatedUser);
      await showCustomAlert("¡Contraseña actualizada con éxito! Bienvenido a su banca virtual.", "success", "Éxito");
    } catch (err) {
      console.error(err);
      await showCustomAlert("Ocurrió un error al actualizar la contraseña.", "error", "Error");
    }
  };

  const handleRegister = async (name: string, id: string, pin: string, email: string, authorize: boolean) => {
    const cleanId = id.trim();
    if (users.some(u => u.id === cleanId)) {
      await showCustomAlert("Socio ya existe.", "warning", "Registro");
      return;
    }
    
    if (useRemoteApi) {
      try {
        const nameParts = name.trim().split(/\s+/);
        const primerNombre = nameParts[0] || 'Socio';
        const primerApellido = nameParts.slice(1).join(' ') || 'Gutt';

        const response = await fetch('/api/socios/registrar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipoPersona: 'SOCIO',
            tipoIdentificacion: 'CÉDULA',
            identificacion: cleanId,
            primerNombre,
            primerApellido,
            pin,
            email,
            emailConfirmado: 1,
            soloUnNombre: 1,
            soloUnApellido: 1,
            telefono: '',
            fechaNacimiento: new Date().toISOString().split('T')[0],
            estadoCivil: 'SOLTERO'
          })
        });

        const data = await response.json();
        if (data.ok) {
          const profile = await DataService.getUserFullData(cleanId).catch(() => null);
          if (profile) {
            setCurrentUser(profile);
            await reloadAllUsers();
            setView(AppView.DASHBOARD);
            await showCustomAlert("¡Registro exitoso! Bienvenido al sistema.", "success", "Registro");
          } else {
            throw new Error("No se pudo obtener el perfil registrado");
          }
        } else {
          await showCustomAlert("Error al registrar: " + (data.error || ''), "error", "Error");
        }
      } catch (err) {
        console.error(err);
        await showCustomAlert("Error de conexión al registrar socio.", "error", "Error");
      }
    } else {
      const savAcc = { 
        id: `sav-${cleanId}`, 
        type: AccountType.SAVINGS, 
        number: `01${Math.floor(100000 + Math.random()*899999)}`, 
        balance: 0, 
        currency: 'USD' 
      };
      const certAcc = { 
        id: `cert-${cleanId}`, 
        type: AccountType.CERTIFICATE, 
        number: `02${Math.floor(100000 + Math.random()*899999)}`, 
        balance: authorize ? 5 : 0, 
        currency: 'USD' 
      };

      const newUser: User = { 
        id: cleanId, 
        name, 
        pin, 
        email, 
        role: UserRole.MEMBER, 
        accounts: [savAcc, certAcc], 
        transactions: [], 
        loans: [],
        registrationDate: new Date().toLocaleDateString('es-EC')
      };

      setUsers([...users, newUser]);
      setCurrentUser(newUser);
      setView(AppView.DASHBOARD);
    }
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsers(prev => {
      const exists = prev.some(u => u.id === updatedUser.id);
      if (exists) {
        return prev.map(u => u.id === updatedUser.id ? updatedUser : u);
      } else {
        return [...prev, updatedUser];
      }
    });
  };

  const handleApplyLoan = async (loan: Loan) => {
    if (useRemoteApi) {
      await reloadAllUsers();
    } else {
      setUsers(prev => prev.map(u => u.id === loan.memberId ? {...u, loans: [...(u.loans || []), loan]} : u));
    }
  };

  const handleApproveLoan = async (
    loanId: string,
    memberId: string,
    reason: string,
    tipoAprobacion?: string,
    actaSesion?: string,
    proposedAmount?: number,
    icePorcentaje?: number,
    iceEstado?: string,
    iceCuotaMensual?: number,
    iceIngresoNeto?: number,
    iceDeudaExterna?: number
  ) => {
    if (useRemoteApi) {
      try {
        const res = await DataService.approveLoan(loanId, reason, currentUser?.id, tipoAprobacion, actaSesion, proposedAmount, icePorcentaje, iceEstado, iceCuotaMensual, iceIngresoNeto, iceDeudaExterna);
        if (res.ok) {
          await showCustomAlert("¡SOLICITUD APROBADA!\nLa solicitud ha sido aprobada con éxito. Proceda al desembolso de fondos.", "success", "Crédito Aprobado");
          await reloadAllUsers();
        } else {
          await showCustomAlert("Error al aprobar el crédito: " + (res.message || ''), "error", "Error");
        }
      } catch (err) {
        console.error(err);
        await showCustomAlert("Error de conexión al aprobar el crédito.", "error", "Error");
      }
    } else {
      setUsers(prevUsers => {
        return prevUsers.map(u => {
          if (u.id === memberId) {
            const loans = (u.loans || []).map(l => 
              l.id === loanId ? { ...l, status: 'VIGENTE' as const, comments: reason } : l
            );
            
            const targetLoan = loans.find(l => l.id === loanId);
            if (!targetLoan) return u;

            const accounts = u.accounts.map(a => {
              if (a.type === AccountType.SAVINGS) return { ...a, balance: a.balance + targetLoan.amount };
              return a;
            });
            
            const savAcc = accounts.find(a => a.type === AccountType.SAVINGS);
            const newTx: Transaction = {
              id: `DSB-${Date.now()}`,
              date: new Date().toLocaleDateString('es-EC'),
              description: `DESEMBOLSO CRÉDITO ${loanId}`,
              amount: targetLoan.amount,
              type: 'CREDIT',
              category: 'Préstamos',
              accountId: savAcc?.id || 'unknown'
            };

            return { ...u, loans, accounts, transactions: [newTx, ...(u.transactions || [])] };
          }
          return u;
        });
      });

      await showCustomAlert("¡DESEMBOLSO EXITOSO!\nEl crédito ha sido aprobado y el dinero acreditado.", "success", "Crédito Aprobado");
    }
  };

  const handleRejectLoan = async (loanId: string, memberId: string, reason: string) => {
    if (useRemoteApi) {
      try {
        const res = await DataService.rejectLoan(loanId, reason, currentUser?.id);
        if (res.ok) {
          await showCustomAlert("La solicitud de crédito ha sido rechazada.", "success", "Crédito Rechazado");
          await reloadAllUsers();
        } else {
          await showCustomAlert("Error al rechazar el crédito: " + (res.message || ''), "error", "Error");
        }
      } catch (err) {
        console.error(err);
        await showCustomAlert("Error de conexión al rechazar el crédito.", "error", "Error");
      }
    } else {
      setUsers(prev => prev.map(u => u.id === memberId ? {
        ...u,
        loans: (u.loans || []).map(l => l.id === loanId ? { ...l, status: 'RECHAZADO' as const, comments: reason } : l)
      } : u));
      await showCustomAlert("La solicitud de crédito ha sido rechazada.", "success", "Crédito Rechazado");
    }
  };

  const handleLogout = () => { setCurrentUser(null); setView(AppView.LOGIN); setNewPin(''); setConfirmPin(''); };

  // Map active subtabs for sidebar submenu sync
  const activeSubView = useMemo(() => {
    switch (view) {
      case AppView.TELLER_OPERATIONS: return tellerTab;
      case AppView.ADMIN_HUB: return adminTab;
      case AppView.BI_PANEL: return biTab;
      case AppView.CREDIT_OFFICER_HUB: return creditOfficerTab;
      case AppView.PLAZO_FIJO: return plazoFijoTab;
      case AppView.REPORTS_SOCIOS_CREDITOS: return reportsSocioTab;
      default: return undefined;
    }
  }, [view, tellerTab, adminTab, biTab, creditOfficerTab, reportsSocioTab]);

  const handleSubViewChange = (sub: string) => {
    switch (view) {
      case AppView.TELLER_OPERATIONS: setTellerTab(sub as any); break;
      case AppView.ADMIN_HUB: setAdminTab(sub as any); break;
      case AppView.BI_PANEL: setBiTab(sub as any); break;
      case AppView.CREDIT_OFFICER_HUB: setCreditOfficerTab(sub as any); break;
      case AppView.PLAZO_FIJO: setPlazoFijoTab(sub as any); break;
      case AppView.REPORTS_SOCIOS_CREDITOS: setReportsSocioTab(sub as any); break;
    }
  };

  if (view === AppView.REGISTER) return <Register onRegister={handleRegister} onBack={() => setView(AppView.LOGIN)} />;
  
  if (view === AppView.CHANGE_PIN) return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4">
      <div className="w-full max-w-[450px] animate-in slide-in-from-bottom duration-700">
        <div className="bg-white rounded-[3.5rem] shadow-2xl p-12 border-t-[12px] border-[#14532D]">
          <div className="flex flex-col items-center mb-10 text-center">
            <CAPLogo size="lg" />
            <h2 className="text-2xl font-black text-[#14532D] tracking-tight mt-8 uppercase">Cambio de Contraseña</h2>
            <p className="text-slate-400 font-bold text-xs mt-2 leading-relaxed">Por su seguridad, debe actualizar la contraseña temporal antes de continuar.</p>
          </div>
          <form className="space-y-6" onSubmit={handleChangePin}>
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nueva Contraseña</label>
              <div className="relative">
                <Lock size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input required type="password" minLength={4} value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Contraseña" className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-[#14532D] outline-none font-bold text-[#14532D] text-center text-xl" />
              </div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Confirmar Contraseña</label>
              <div className="relative">
                <RefreshCw size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input required type="password" minLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Confirmar" className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-[#14532D] outline-none font-bold text-[#14532D] text-center text-xl" />
              </div>
            </div>
            <button className="w-full py-5 bg-[#14532D] text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-[#1b5e20] transition-all flex items-center justify-center gap-4 group mt-8">
              ACTUALIZAR CONTRASEÑA <Check size={24} className="text-[#FACC15]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  if (view === AppView.LOGIN) return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-[450px] animate-in fade-in zoom-in duration-700 relative z-10">
        <div className="bg-white rounded-[3.5rem] shadow-2xl p-12 border border-white/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-[#14532D] via-[#FACC15] to-[#14532D]"></div>
          <div className="flex flex-col items-center mb-10 text-center">
            <CAPLogo size="lg" />
            <h1 className="text-4xl font-black text-[#14532D] tracking-tight mt-8 mb-2 leading-none uppercase">Gutt System</h1>
            <div className="h-1 w-12 bg-[#FACC15] rounded-full mb-4"></div>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em]">Portal Bancario Oficial</p>
          </div>
          <form className="space-y-6" onSubmit={(e) => {
            e.preventDefault();
            const f = e.target as any;
            void handleLogin(f.uid.value, f.pin.value);
          }}>
            {loginError && <div className="bg-red-50 p-4 rounded-2xl border border-red-100"><p className="text-center text-red-600 text-xs font-bold">{loginError}</p></div>}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block">Identificación</label>
              <div className="relative">
                <UserIcon size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input name="uid" required type="text" placeholder="Cédula" className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-[#14532D] outline-none font-bold text-[#14532D] text-lg" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block">Contraseña de Acceso</label>
              <div className="relative">
                <Lock size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input name="pin" required type={showPin ? "text" : "password"} placeholder="Contraseña" className="w-full pl-14 pr-14 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-[#14532D] outline-none font-bold text-[#14532D] text-center text-lg" />
                <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300">{showPin ? <EyeOff size={20} /> : <Eye size={20} />}</button>
              </div>
            </div>
            <button className="w-full py-5 bg-[#14532D] text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-[#1b5e20] transition-all flex items-center justify-center gap-4 group mt-8">
              INGRESAR AHORA <ArrowRight size={24} className="text-[#FACC15] group-hover:translate-x-2 transition-transform" />
            </button>
          </form>
          <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col items-center gap-6">
             <button onClick={() => setView(AppView.REGISTER)} className="flex items-center gap-3 text-[#14532D] font-black text-sm hover:text-emerald-700 transition-colors group">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-[#14532D] group-hover:bg-[#14532D] group-hover:text-white transition-all"><UserPlus size={16} /></div>
                REGÍSTRATE COMO NUEVO SOCIO
             </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Layout activeView={view as any} onViewChange={setView as any} onLogout={handleLogout} userName={currentUser?.name || ''} role={currentUser?.role || UserRole.MEMBER} activeSubView={activeSubView} onSubViewChange={handleSubViewChange}>
        {view === AppView.ADMIN_HUB && <AdminView users={users} rates={interestRates} config={globalConfig} onUpdateRates={setInterestRates} onUpdateConfig={setGlobalConfig} onRestoreDatabase={(d) => setUsers(d.users)} activeTab={adminTab} onActiveTabChange={setAdminTab} />}
        {view === AppView.BI_PANEL && <BIPanel users={users} currentUserRole={currentUser?.role} activeTab={biTab} onActiveTabChange={setBiTab} />}
        {view === AppView.TELLER_OPERATIONS && <TellerView users={users} onUpdateUser={handleUpdateUser} currentUserRole={currentUser?.role} currentUser={currentUser || undefined} activeTab={tellerTab} onActiveTabChange={setTellerTab} />}
        {view === AppView.DASHBOARD && <Dashboard transactions={currentUser?.transactions || []} totalBalance={currentUser?.accounts[0]?.balance || 0} onNavigate={setView} />}
        {view === AppView.TRANSFERS && <Transfers user={currentUser} />}
        {view === AppView.CREDITS && <CreditsView rates={interestRates} config={globalConfig} onApply={handleApplyLoan} existingLoans={currentUser?.loans || []} memberName={currentUser?.name || ''} memberId={currentUser?.id || ''} />}
        {view === AppView.CHART_OF_ACCOUNTS && <AccountantView chart={chartOfAccounts} />}
        {view === AppView.CREDIT_OFFICER_HUB && <CreditOfficerApproval users={users} currentUser={currentUser || undefined} onUpdateUser={handleUpdateUser} onApprove={handleApproveLoan} onReject={handleRejectLoan} activeTab={creditOfficerTab} onActiveTabChange={setCreditOfficerTab} />}
        {view === AppView.PLAZO_FIJO && <PlazoFijoView currentUser={currentUser || undefined} activeTab={plazoFijoTab} onActiveTabChange={setPlazoFijoTab} />}
        {view === AppView.REPORTS && <ReportsView users={users} onUpdateUser={handleUpdateUser} currentUser={currentUser || undefined} />}
        {view === AppView.REPORTS_SOCIOS_CREDITOS && <ReportsSociosCreditos users={users} currentUser={currentUser || undefined} activeTab={reportsSocioTab} onActiveTabChange={setReportsSocioTab} />}
        {view === AppView.PROFILE && currentUser && <ProfileView user={currentUser} onUpdateUser={(updated) => { handleUpdateUser(updated); setCurrentUser(updated); }} />}
        {currentUser?.role === UserRole.MEMBER && <ChatAssistant user={currentUser} currentBalance={currentUser.accounts[0]?.balance} transactions={currentUser.transactions} />}
      </Layout>

      {/* ── Modal de inactividad ─────────────────────────────────── */}
      {idleWarning && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-[#0D1B0F] border border-amber-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-5">
              {/* Ícono + cuenta regresiva */}
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="6" />
                  <circle
                    cx="48" cy="48" r="44"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    strokeDashoffset={`${2 * Math.PI * 44 * (1 - countdown / WARN_COUNTDOWN)}`}
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-3xl font-black text-amber-400 tabular-nums leading-none">{countdown}</span>
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-wider">seg</span>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-black text-white/90 uppercase tracking-tight">Sesión por expirar</h3>
                <p className="text-sm font-bold text-white/50 mt-2 leading-relaxed">
                  Por inactividad, su sesión se cerrará automáticamente<br />
                  en <span className="text-amber-400 font-black">{countdown} segundo{countdown !== 1 ? 's' : ''}</span>.
                </p>
                <p className="text-xs font-bold text-white/30 mt-2">
                  Haga clic en <span className="text-amber-300">Aceptar</span> para cerrar ahora,<br />
                  o mueva el mouse para continuar.
                </p>
              </div>

              <button
                onClick={handleIdleLogout}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-amber-900/30"
              >
                Aceptar — Cerrar sesión ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {alertConfig && alertConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200 font-sans">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner ${
                alertConfig.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                alertConfig.type === 'error' ? 'bg-red-50 text-red-600' :
                alertConfig.type === 'warning' ? 'bg-amber-50 text-amber-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {alertConfig.type === 'success' ? <CheckCircle2 size={32} /> :
                 alertConfig.type === 'error' ? <X size={32} /> :
                 alertConfig.type === 'warning' ? <Info size={32} /> :
                 <Info size={32} />}
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{alertConfig.title}</h3>
              <p className="text-sm font-bold text-slate-500 leading-relaxed whitespace-pre-line">{alertConfig.message}</p>
            </div>
            <div className="flex gap-4 mt-8">
              {alertConfig.isConfirm ? (
                <>
                  <button onClick={() => alertConfig.onCancel?.()} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                    Cancelar
                  </button>
                  <button onClick={() => alertConfig.onConfirm()} className="flex-1 py-4 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                    Aceptar
                  </button>
                </>
              ) : (
                <button onClick={() => alertConfig.onConfirm()} className="w-full py-4 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                  Aceptar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
