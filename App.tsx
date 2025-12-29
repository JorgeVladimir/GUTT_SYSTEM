
import React, { useState, useEffect } from 'react';
import { AppView, Transaction } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Transfers } from './components/Transfers';
import { ChatAssistant } from './components/ChatAssistant';
import { ManualEntry } from './components/ManualEntry';
import { Register } from './components/Register';
import { MOCK_TRANSACTIONS } from './constants';
import { ShieldCheck, ArrowRight, Wallet, ChevronRight, Plus, UserPlus } from 'lucide-react';

interface AppUser {
  id: string;
  name: string;
  pin: string;
  transactions: Transaction[];
}

const CAPLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  // Using rectangular dimensions to prevent text clipping
  const dimensions = size === "sm" ? "w-14 h-10" : size === "lg" ? "w-32 h-20" : "w-24 h-16";
  const textSize = size === "sm" ? "text-xl" : size === "lg" ? "text-5xl" : "text-3xl";
  return (
    <div className={`${dimensions} bg-[#14532D] flex flex-col items-center justify-center relative rounded-xl shadow-2xl shrink-0`}>
      {/* Added pr-2 to handle the italic slant of the 'P' */}
      <span className={`font-black text-white ${textSize} tracking-tight mb-1 italic pr-2`}>CAP</span>
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#FACC15] rounded-b-xl"></div>
    </div>
  );
};

const LoginPage: React.FC<{ 
  onLogin: (userId: string, pin: string) => void, 
  onGoToRegister: () => void,
  error?: string 
}> = ({ onLogin, onGoToRegister, error }) => {
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      onLogin(userId, pin);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#14532D]/5 rounded-full -mr-48 -mt-48 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#FACC15]/5 rounded-full -ml-32 -mb-32 blur-2xl"></div>

      <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 border border-slate-100 relative z-10 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-[#FACC15]"></div>
          
          <div className="flex flex-col items-center mb-10 text-center">
            <CAPLogo size="lg" />
            <h1 className="text-3xl font-black text-[#14532D] tracking-tight mt-6">Caja Patate</h1>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.2em] mt-1">Caja de Ahorro Patate</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && <p className="text-center text-red-500 text-xs font-bold bg-red-50 p-2 rounded-lg">{error}</p>}
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Usuario / Cédula</label>
              <input 
                required 
                type="text" 
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="1712345678" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] transition-all font-medium" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">PIN de Acceso</label>
              <input 
                required 
                type="password" 
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****" 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] transition-all font-medium text-center text-xl tracking-widest" 
              />
            </div>
            
            <button 
              disabled={loading} 
              className="w-full py-5 bg-[#14532D] text-white rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 hover:bg-[#1b5e20] hover:-translate-y-0.5 transition-all active:translate-y-0 disabled:opacity-70 flex items-center justify-center gap-2 group"
            >
              {loading ? (
                <div className="w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>ENTRAR <ArrowRight size={20} className="text-[#FACC15] group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-slate-50 flex flex-col items-center gap-4">
             <button 
               onClick={onGoToRegister}
               className="flex items-center gap-2 text-[#14532D] font-black text-xs hover:underline"
             >
               <UserPlus size={16} className="text-[#FACC15]" /> REGISTRARSE COMO SOCIO
             </button>
             <div className="flex items-center gap-2 text-slate-300 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest">
                <ShieldCheck size={14} /> Sitio Seguro Caja Patate
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<AppView | 'REGISTER'>(AppView.LOGIN);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showEntry, setShowEntry] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Initial Load
  useEffect(() => {
    const savedUsers = localStorage.getItem('cap_users');
    if (savedUsers) {
      setUsers(JSON.parse(savedUsers));
    }
  }, []);

  // Save Users
  useEffect(() => {
    if (users.length > 0) {
      localStorage.setItem('cap_users', JSON.stringify(users));
    }
  }, [users]);

  // Handle Login
  const handleLogin = (id: string, pin: string) => {
    const found = users.find(u => u.id === id && u.pin === pin);
    if (found) {
      setCurrentUser(found);
      setView(AppView.DASHBOARD);
      setLoginError('');
    } else {
      setLoginError('Usuario o PIN incorrectos');
    }
  };

  // Handle Register
  const handleRegister = (name: string, id: string, pin: string) => {
    if (users.some(u => u.id === id)) {
      alert("Este usuario ya existe.");
      return;
    }
    const newUser: AppUser = {
      id,
      name,
      pin,
      transactions: []
    };
    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    setView(AppView.DASHBOARD);
  };

  const handleAddTransaction = (newTx: Transaction) => {
    if (!currentUser) return;
    const updatedUser = {
      ...currentUser,
      transactions: [newTx, ...currentUser.transactions]
    };
    setCurrentUser(updatedUser);
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView(AppView.LOGIN);
  };

  // Calculations
  const transactions = currentUser?.transactions || [];
  const totalBalance = transactions.reduce((acc, tx) => acc + tx.amount, 0) + 1000;

  if (view === AppView.LOGIN) {
    return <LoginPage onLogin={handleLogin} onGoToRegister={() => setView('REGISTER')} error={loginError} />;
  }

  if (view === 'REGISTER') {
    return <Register onRegister={handleRegister} onBack={() => setView(AppView.LOGIN)} />;
  }

  return (
    <Layout activeView={view as AppView} onViewChange={setView} onLogout={handleLogout} userName={currentUser?.name || ''}>
      {view === AppView.DASHBOARD && (
        <Dashboard transactions={transactions} totalBalance={totalBalance} />
      )}
      {view === AppView.TRANSFERS && <Transfers />}
      {view === AppView.SAVINGS && (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
           <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center text-[#14532D]">
             <Wallet size={40} />
           </div>
           <h2 className="text-2xl font-black text-slate-900">Aportaciones Patate</h2>
           <p className="text-slate-500 max-w-md">Tu capital social acumulado: <span className="font-bold text-[#14532D]">${totalBalance.toFixed(2)}</span></p>
        </div>
      )}
      
      <button 
        onClick={() => setShowEntry(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-[#14532D] text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95 z-40 border-4 border-white"
      >
        <Plus size={28} className="text-[#FACC15]" />
      </button>

      {showEntry && (
        <ManualEntry 
          onAdd={handleAddTransaction} 
          onClose={() => setShowEntry(false)} 
        />
      )}

      <ChatAssistant currentBalance={totalBalance} transactions={transactions} />
    </Layout>
  );
}
