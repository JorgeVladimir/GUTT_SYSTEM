
import React, { useState, useEffect, useMemo } from 'react';
import { AppView, Transaction, User, UserRole, AccountType, InterestRate, Loan, GlobalConfig, ChartOfAccountEntry } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Transfers } from './components/Transfers';
import { ChatAssistant } from './components/ChatAssistant';
import { Register } from './components/Register';
import { AccountantView } from './components/AccountantView';
import { TellerView } from './components/TellerView';
import { AdminView } from './components/AdminView';
import { CreditsView } from './components/CreditsView';
import { CreditOfficerApproval } from './components/CreditOfficerApproval';
import { ReportsView } from './components/ReportsView';
import { INITIAL_RATES, DEFAULT_CONFIG } from './constants';
import { DataService } from './services/dataService';
import { ArrowRight, ShieldCheck, Lock, User as UserIcon, Eye, EyeOff, UserPlus, KeyRound, Check } from 'lucide-react';

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
  const dimensions = size === "sm" ? "w-14 h-10" : size === "lg" ? "w-32 h-20" : "w-24 h-16";
  const textSize = size === "sm" ? "text-xl" : size === "lg" ? "text-5xl" : "text-3xl";
  return (
    <div className={`${dimensions} bg-[#14532D] flex flex-col items-center justify-center relative rounded-2xl shadow-2xl shrink-0 border border-emerald-800/30 overflow-hidden group`}>
      <div className="absolute inset-0 bg-gradient-to-tr from-emerald-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      <span className={`font-black text-white ${textSize} tracking-tighter mb-1 italic pr-2 relative z-10`}>CAP</span>
      <div className="absolute bottom-0 left-0 right-0 h-2.5 bg-[#FACC15] rounded-b-2xl shadow-[0_-2px_10px_rgba(250,204,21,0.3)]"></div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [interestRates, setInterestRates] = useState<InterestRate[]>(INITIAL_RATES);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(DEFAULT_CONFIG);
  const [users, setUsers] = useState<User[]>([]);

  const getDefaultUsers = (): User[] => [
    { id: 'admin', name: 'Administrador General', pin: '1234', role: UserRole.ADMIN, accounts: [], transactions: [], loans: [] },
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

  useEffect(() => {
    const loadInitialData = async () => {
      const savedUsers = await DataService.getUsers();
      if (savedUsers.length > 0) setUsers(savedUsers);
      else setUsers(getDefaultUsers());

      const savedRates = await DataService.getRates();
      if (savedRates.length > 0) setInterestRates(savedRates);

      const savedConfig = await DataService.getConfig();
      if (savedConfig.minLoanAmount) setGlobalConfig(savedConfig);
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (users.length > 0) DataService.saveUsers(users);
  }, [users]);

  useEffect(() => {
    if (currentUser) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [users]);

  const handleLogin = (id: string, pin: string) => {
    const cleanId = id.trim().toLowerCase();
    const cleanPin = pin.trim();
    const found = users.find(u => u.id.toLowerCase() === cleanId && u.pin === cleanPin);
    
    if (found) {
      setCurrentUser(found);
      if (found.needsPinChange) setView(AppView.CHANGE_PIN);
      else {
        if (found.role === UserRole.ADMIN) setView(AppView.ADMIN_HUB);
        else if (found.role === UserRole.ACCOUNTANT) setView(AppView.CHART_OF_ACCOUNTS);
        else if (found.role === UserRole.TELLER) setView(AppView.TELLER_OPERATIONS);
        else if (found.role === UserRole.CREDIT_OFFICER) setView(AppView.CREDIT_OFFICER_HUB);
        else setView(AppView.DASHBOARD);
      }
      setLoginError('');
    } else {
      setLoginError('Identificación o PIN incorrectos.');
    }
  };

  const handleRegister = (name: string, id: string, pin: string, email: string, authorize: boolean) => {
    const cleanId = id.trim();
    if (users.some(u => u.id === cleanId)) return alert("Socio ya existe.");
    
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

  const handleApproveLoan = (loanId: string, memberId: string, reason: string) => {
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

    alert("¡DESEMBOLSO EXITOSO!\nEl crédito ha sido aprobado y el dinero acreditado.");
  };

  const handleLogout = () => { setCurrentUser(null); setView(AppView.LOGIN); };

  if (view === AppView.REGISTER) return <Register onRegister={handleRegister} onBack={() => setView(AppView.LOGIN)} />;
  if (view === AppView.LOGIN) return (
    <div className="min-h-screen bg-[#f1f5f9] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-[450px] animate-in fade-in zoom-in duration-700 relative z-10">
        <div className="bg-white rounded-[3.5rem] shadow-2xl p-12 border border-white/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-[#14532D] via-[#FACC15] to-[#14532D]"></div>
          <div className="flex flex-col items-center mb-10 text-center">
            <CAPLogo size="lg" />
            <h1 className="text-4xl font-black text-[#14532D] tracking-tight mt-8 leading-none">Caja de Ahorro</h1>
            <h2 className="text-3xl font-black text-[#14532D] tracking-tight mb-2">Patate</h2>
            <div className="h-1 w-12 bg-[#FACC15] rounded-full mb-4"></div>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em]">Portal Bancario Oficial</p>
          </div>
          <form className="space-y-6" onSubmit={(e) => {
            e.preventDefault();
            const f = e.target as any;
            handleLogin(f.uid.value, f.pin.value);
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
              <label className="text-[10px] font-black text-slate-500 uppercase ml-1 block">PIN de Acceso</label>
              <div className="relative">
                <Lock size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                <input name="pin" required type={showPin ? "text" : "password"} maxLength={4} placeholder="••••" className="w-full pl-14 pr-14 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-[#14532D] outline-none font-black text-[#14532D] text-center text-3xl tracking-[0.4em]" />
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
    <Layout activeView={view as any} onViewChange={setView as any} onLogout={handleLogout} userName={currentUser?.name || ''} role={currentUser?.role || UserRole.MEMBER}>
      {view === AppView.ADMIN_HUB && <AdminView users={users} rates={interestRates} config={globalConfig} onUpdateRates={setInterestRates} onUpdateConfig={setGlobalConfig} onRestoreDatabase={(d) => setUsers(d.users)} />}
      {view === AppView.TELLER_OPERATIONS && <TellerView users={users} onUpdateUser={handleUpdateUser} currentUserRole={currentUser?.role} />}
      {view === AppView.DASHBOARD && <Dashboard transactions={currentUser?.transactions || []} totalBalance={currentUser?.accounts[0]?.balance || 0} onNavigate={setView} />}
      {view === AppView.TRANSFERS && <Transfers user={currentUser} />}
      {view === AppView.CREDITS && <CreditsView rates={interestRates} config={globalConfig} onApply={(l) => setUsers(prev => prev.map(u => u.id === l.memberId ? {...u, loans: [...(u.loans || []), l]} : u))} existingLoans={currentUser?.loans || []} memberName={currentUser?.name || ''} memberId={currentUser?.id || ''} />}
      {view === AppView.CHART_OF_ACCOUNTS && <AccountantView chart={chartOfAccounts} />}
      {view === AppView.CREDIT_OFFICER_HUB && <CreditOfficerApproval users={users} onApprove={handleApproveLoan} onReject={(lid, mid, r) => setUsers(prev => prev.map(u => u.id === mid ? {...u, loans: (u.loans || []).map(l => l.id === lid ? {...l, status: 'RECHAZADO', comments: r} : l)} : u))} />}
      {view === AppView.REPORTS && <ReportsView />}
      {currentUser?.role === UserRole.MEMBER && <ChatAssistant user={currentUser} currentBalance={currentUser.accounts[0]?.balance} transactions={currentUser.transactions} />}
    </Layout>
  );
}
