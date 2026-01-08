
import React, { useState } from 'react';
import { NAV_BY_ROLE, COLORS } from '../constants';
import { AppView, UserRole } from '../types';
import { 
  Bell, 
  User as UserIcon, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  ChevronDown
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onLogout: () => void;
  userName: string;
  role: UserRole;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange, onLogout, userName, role }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Filtramos los items del menú basándonos estrictamente en el rol para seguridad de interfaz
  const navItems = NAV_BY_ROLE[role] || NAV_BY_ROLE.MEMBER;

  const CAPLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
    const dimensions = size === "sm" ? "w-14 h-10" : size === "lg" ? "w-28 h-20" : "w-20 h-14";
    const textSize = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl";
    return (
      <div className={`${dimensions} bg-[#14532D] flex flex-col items-center justify-center relative rounded-md shadow-md shrink-0`}>
        <span className={`font-black text-white ${textSize} tracking-tight mb-1 italic pr-1.5`}>CAP</span>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#FACC15] rounded-b-md"></div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-xl transition-transform duration-300 transform 
        lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3 bg-white">
            <CAPLogo size="sm" />
            <div>
              <h1 className="text-xs font-black text-[#14532D] leading-tight uppercase tracking-tighter">Caja de Ahorro<br/>Patate</h1>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Institucional</span>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 mt-4">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id as AppView);
                  setIsSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                  ${activeView === item.id 
                    ? 'bg-[#14532D] text-white font-semibold shadow-md' 
                    : 'text-slate-600 hover:bg-slate-50 hover:text-[#14532D]'}
                `}
              >
                {item.icon}
                <span className="text-sm">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3 p-3 mb-2 rounded-xl bg-white shadow-sm border border-slate-100">
               <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                 <UserIcon size={16} className="text-slate-500" />
               </div>
               <div className="flex-1 overflow-hidden">
                 <p className="text-xs font-bold text-slate-800 truncate">{userName}</p>
                 <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tighter">{role}</p>
               </div>
            </div>
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut size={20} />
              <span className="text-sm font-medium">Salir</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg lg:hidden">
              <Menu size={24} />
            </button>
            <h2 className="text-lg font-bold text-slate-800 hidden sm:block">
              Portal {role.replace('_', ' ')}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-[#FACC15]/20 text-[#14532D] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#FACC15]/40 flex items-center gap-2">
              <ShieldCheck size={14} /> SEGURIDAD ACTIVA
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50">
           {children}
        </div>
      </main>
    </div>
  );
};
