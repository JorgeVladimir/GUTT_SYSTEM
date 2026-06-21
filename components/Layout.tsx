import React, { useState } from 'react';
import { NAV_BY_ROLE } from '../constants';
import { AppView, UserRole } from '../types';
import { 
  User as UserIcon, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  Banknote,
  UserPlus,
  Search,
  Calculator,
  FileText,
  Pin,
  PinOff,
  CheckCircle2,
  Coins,
  BarChart3,
  Percent,
  Wallet,
  Database,
  DollarSign,
  Layers,
  Settings2,
  TrendingUp
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onLogout: () => void;
  userName: string;
  role: UserRole;
  // Compatibility props
  tellerTab?: string;
  onTellerTabChange?: (tab: 'OPERATIONS' | 'REGISTER' | 'TX_SEARCH' | 'CONSULTAS' | 'CASH_CLOSE') => void;
  // Unified sub-view navigation
  activeSubView?: string;
  onSubViewChange?: (subView: string) => void;
}

const ROLE_TRANSLATIONS: Record<string, string> = {
  ADMIN: 'Administrador',
  ACCOUNTANT: 'Contador',
  TELLER: 'Cajero',
  CREDIT_OFFICER: 'Asesor de Crédito',
  MEMBER: 'Socio',
  SUPER_USER: 'Super Usuario'
};

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeView, 
  onViewChange, 
  onLogout, 
  userName, 
  role,
  tellerTab,
  onTellerTabChange,
  activeSubView: propActiveSubView,
  onSubViewChange: propOnSubViewChange
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(() => localStorage.getItem('sidebar_pinned') !== 'false');
  const [isHovered, setIsHovered] = useState(false);

  // Unificamos las variables de subpestaña activa y manejador de cambio
  const activeSubView = propActiveSubView !== undefined ? propActiveSubView : tellerTab;
  const onSubViewChange = (sub: string) => {
    if (propOnSubViewChange) {
      propOnSubViewChange(sub);
    } else if (onTellerTabChange) {
      onTellerTabChange(sub as any);
    }
  };

  const isExpanded = isPinned || isHovered;
  const navItems = NAV_BY_ROLE[role] || NAV_BY_ROLE.MEMBER;

  const getSubmenuItems = (): { id: string; label: string; icon: React.ReactNode }[] => {
    switch (activeView) {
      case AppView.TELLER_OPERATIONS:
        return [
          { id: 'OPERATIONS', label: 'OPERACIONES', icon: <Banknote size={14} /> },
          { id: 'REGISTER', label: 'APERTURA DE SOCIO', icon: <UserPlus size={14} /> },
          { id: 'TX_SEARCH', label: 'CONSULTA TRANSACCIONES', icon: <FileText size={14} /> },
          { id: 'CONSULTAS', label: 'DIRECTORIO', icon: <Search size={14} /> },
          { id: 'CASH_CLOSE', label: 'CIERRE DE CAJA', icon: <Calculator size={14} /> }
        ];
      case AppView.CREDIT_OFFICER_HUB:
        return [
          { id: 'APPROVALS', label: 'APROBACIONES', icon: <CheckCircle2 size={14} /> },
          { id: 'NEW_LOAN', label: 'GENERAR SOLICITUD', icon: <UserPlus size={14} /> },
          { id: 'COLLECTIONS', label: 'COBRO DIVIDENDOS', icon: <Coins size={14} /> },
          { id: 'CARTERA', label: 'CARTERA & ANULACIONES', icon: <FileText size={14} /> }
        ];
      case AppView.ADMIN_HUB:
        return [
          { id: 'SUMMARY', label: 'RESUMEN GENERAL', icon: <BarChart3 size={14} /> },
          { id: 'MEMBERS', label: 'REGISTRO DE SOCIOS', icon: <UserIcon size={14} /> },
          { id: 'TASAS', label: 'TASAS DE INTERÉS', icon: <Percent size={14} /> },
          { id: 'PRODUCTOS', label: 'PRODUCTOS & CUENTAS', icon: <Wallet size={14} /> },
          { id: 'SEGURIDAD', label: 'SEGURIDAD', icon: <Database size={14} /> }
        ];
      case AppView.REPORTS_SOCIOS_CREDITOS:
        return [
          { id: 'GENERAL', label: 'ESTADO GENERAL', icon: <BarChart3 size={14} /> },
          { id: 'SOCIO_SEARCH', label: 'BÚSQUEDA POR SOCIO', icon: <Search size={14} /> },
          { id: 'PROFITABILITY', label: 'RENTABILIDAD', icon: <DollarSign size={14} /> },
          { id: 'ORIGINS', label: 'DIFERENCIACIÓN DE ORIGEN', icon: <Layers size={14} /> }
        ];
      case AppView.BI_PANEL:
        const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_USER;
        const items = [];
        if (isAdmin) {
          items.push({ id: 'BUILDER', label: 'CONSTRUCTOR', icon: <Settings2 size={14} /> });
        }
        items.push({ id: 'PROFITABILITY', label: 'RENTABILIDAD', icon: <TrendingUp size={14} /> });
        items.push({ id: 'BUREAU', label: 'BURÓ INTERNO', icon: <ShieldCheck size={14} /> });
        return items;
      case AppView.PLAZO_FIJO:
        return [
          { id: 'GESTION',      label: 'GESTIÓN DPF',      icon: <Wallet size={14} /> },
          { id: 'NUEVA',        label: 'NUEVA INVERSIÓN',   icon: <DollarSign size={14} /> },
          { id: 'VENCIMIENTOS', label: 'VENCIMIENTOS',      icon: <Layers size={14} /> },
          { id: 'TASAS',        label: 'CONFIG. TASAS',     icon: <Settings2 size={14} /> },
          { id: 'CONTABILIDAD', label: 'CONTABILIDAD',      icon: <FileText size={14} /> },
        ];
      default:
        return [];
    }
  };

  const subMenuItems = getSubmenuItems();
  const hasSubmenu = subMenuItems.length > 0;

  const CAPLogo = ({ size = "sm" }: { size?: "sm" | "md" | "lg" }) => {
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

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside 
        onMouseEnter={() => !isPinned && setIsHovered(true)}
        onMouseLeave={() => !isPinned && setIsHovered(false)}
        className={`
          fixed inset-y-0 left-0 z-30 bg-white shadow-xl transition-all duration-300 transform 
          lg:relative lg:translate-x-0
          ${isPinned ? 'w-64 relative translate-x-0' : (isHovered ? 'w-64 absolute translate-x-0 shadow-2xl z-50' : 'w-20 absolute')}
          ${isSidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 h-16">
            <div className={`flex items-center gap-3 transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'}`}>
              <CAPLogo size="sm" />
              <div className="overflow-hidden whitespace-nowrap">
                <h1 className="text-sm font-black text-[#14532D] leading-tight uppercase tracking-tighter">Gutt System</h1>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block">Portal Bancario</span>
              </div>
            </div>
            
            {!isExpanded && (
              <div className="lg:flex justify-center w-full hidden">
                <CAPLogo size="sm" />
              </div>
            )}

            <button 
              type="button"
              onClick={() => {
                const newPinned = !isPinned;
                setIsPinned(newPinned);
                if (!newPinned) setIsHovered(false);
                localStorage.setItem('sidebar_pinned', String(newPinned));
              }}
              className="text-slate-400 hover:text-[#14532D] p-1.5 hover:bg-slate-100 rounded-lg transition-colors lg:block hidden shrink-0"
              title={isPinned ? "Desanclar barra lateral" : "Anclar barra lateral"}
            >
              {isPinned ? <Pin size={16} className="rotate-45" /> : <PinOff size={16} />}
            </button>
          </div>

          {/* Menú de Navegación */}
          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto no-scrollbar">
            {navItems.map((item) => {
              const isActive = activeView === item.id;
              const showSubmenu = isActive && hasSubmenu;

              return (
                <div key={item.id} className="space-y-1">
                  <button
                    onClick={() => {
                      onViewChange(item.id as AppView);
                      setIsSidebarOpen(false);
                    }}
                    className={`
                      w-full flex items-center rounded-xl transition-all duration-200 py-3 relative group
                      ${isExpanded ? 'gap-3 px-4 justify-start' : 'justify-center px-0'}
                      ${isActive 
                        ? 'bg-[#14532D] text-white font-semibold shadow-md' 
                        : 'text-slate-600 hover:bg-slate-50 hover:text-[#14532D]'}
                    `}
                    title={!isExpanded ? item.label : undefined}
                  >
                    <div className="shrink-0">{item.icon}</div>
                    
                    <span className={`text-sm transition-all duration-300 truncate whitespace-nowrap ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none'}`}>
                      {item.label}
                    </span>

                    {/* Tooltip flotante en hover para versión colapsada */}
                    {!isExpanded && (
                      <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg whitespace-nowrap">
                        {item.label}
                      </div>
                    )}
                  </button>

                  {/* Submenú Vertical expandido */}
                  {showSubmenu && isExpanded && (
                    <div className="pl-6 space-y-1 py-1 border-l border-slate-100 ml-5 animate-in fade-in duration-300">
                      {subMenuItems.map(sub => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => onSubViewChange(sub.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] transition-all font-black uppercase tracking-wider text-left ${
                            activeSubView === sub.id
                              ? 'bg-[#14532D]/10 text-[#14532D] font-black border-l-2 border-[#14532D]'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                          }`}
                        >
                          <div className="shrink-0 opacity-70">{sub.icon}</div>
                          <span className="truncate">{sub.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer Perfil de Usuario */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
            {isExpanded ? (
              <div className="flex items-center gap-3 p-3 mb-2 rounded-xl bg-white shadow-sm border border-slate-100 animate-in fade-in duration-300">
                 <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                   <UserIcon size={16} className="text-slate-500" />
                 </div>
                 <div className="flex-1 overflow-hidden">
                   <p className="text-xs font-bold text-slate-800 truncate">{userName}</p>
                   <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-tighter truncate">
                     {ROLE_TRANSLATIONS[role] || role}
                   </p>
                 </div>
              </div>
            ) : (
              <div className="flex justify-center p-2 mb-2 bg-white rounded-xl shadow-sm border border-slate-100" title={`${userName} (${ROLE_TRANSLATIONS[role] || role})`}>
                 <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                   <UserIcon size={16} className="text-slate-500" />
                 </div>
              </div>
            )}
            
            <button 
              onClick={onLogout}
              className={`
                w-full flex items-center text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors py-3
                ${isExpanded ? 'gap-3 px-4 justify-start' : 'justify-center px-0'}
              `}
              title={!isExpanded ? "Salir" : undefined}
            >
              <LogOut size={20} className="shrink-0" />
              <span className={`text-sm font-medium transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 hidden'}`}>
                Salir
              </span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Layout Content Area */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${!isPinned ? 'lg:pl-20' : ''}`}>
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg lg:hidden">
              <Menu size={24} />
            </button>
            <h2 className="text-lg font-bold text-slate-800 hidden sm:block">
              Portal {ROLE_TRANSLATIONS[role] || role.replace('_', ' ')}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-[#FACC15]/20 text-[#14532D] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#FACC15]/40 flex items-center gap-2">
              <ShieldCheck size={14} /> SEGURIDAD ACTIVA
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-100">
           {children}
        </div>
      </main>
    </div>
  );
};
