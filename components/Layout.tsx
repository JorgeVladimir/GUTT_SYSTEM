
import React, { useState } from 'react';
import { NAV_ITEMS, COLORS } from '../constants';
import { AppView } from '../types';
import { 
  Bell, 
  User as UserIcon, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  ChevronDown,
  Info
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onLogout: () => void;
  userName: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange, onLogout, userName }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Improved CSS Logo component to match the rectangular shape of the uploaded logo
  const CAPLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
    // Increased width to prevent clipping and better match the official logo's aspect ratio
    const dimensions = size === "sm" ? "w-14 h-10" : size === "lg" ? "w-28 h-20" : "w-20 h-14";
    const textSize = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl";
    return (
      <div className={`${dimensions} bg-[#14532D] flex flex-col items-center justify-center relative rounded-md shadow-md shrink-0`}>
        {/* Added pr-1.5 to provide space for the italicized 'P' which often overflows containers */}
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
              <h1 className="text-lg font-black text-[#14532D] leading-none">PATATE</h1>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Caja de Ahorro</span>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 mt-4">
            {NAV_ITEMS.map((item) => (
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
                 <p className="text-[10px] text-emerald-600 font-bold uppercase">Socio Patate</p>
               </div>
            </div>
            <button 
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <LogOut size={20} />
              <span className="text-sm font-medium">Cerrar Sesión</span>
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
              {NAV_ITEMS.find(i => i.id === activeView)?.label || 'Caja Patate Online'}
            </h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden md:flex items-center gap-2 bg-[#FACC15]/20 text-[#854d0e] px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border border-[#FACC15]/30">
              <ShieldCheck size={14} />
              <span>Seguridad Patate</span>
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-100 rounded-full relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#FACC15] rounded-full border-2 border-white"></span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
           {children}
        </div>
      </main>
    </div>
  );
};
