import React, { useState, useEffect } from 'react';
import { NAV_BY_ROLE } from '../constants';
import { AppView, UserRole } from '../types';
import {
  User as UserIcon,
  LogOut,
  Menu,
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
  TrendingUp,
  Bell,
  ChevronRight,
  Clock,
  Landmark
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onLogout: () => void;
  userName: string;
  role: UserRole;
  tellerTab?: string;
  onTellerTabChange?: (tab: 'OPERATIONS' | 'REGISTER' | 'TX_SEARCH' | 'CONSULTAS' | 'CASH_CLOSE') => void;
  activeSubView?: string;
  onSubViewChange?: (subView: string) => void;
}

const ROLE_TRANSLATIONS: Record<string, string> = {
  ADMIN: 'Administrador',
  ACCOUNTANT: 'Contador',
  TELLER: 'Cajero',
  CREDIT_OFFICER: 'Asesor de Crédito',
  MEMBER: 'Socio',
  SUPER_USER: 'Super Usuario',
  MANAGER: 'Gerente'
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN:          'from-[#FACC15] to-[#D97706]',
  SUPER_USER:     'from-[#FACC15] to-[#14532D]',
  MANAGER:        'from-[#14532D] to-[#166534]',
  ACCOUNTANT:     'from-[#14532D] to-[#15803D]',
  TELLER:         'from-[#14532D] to-[#16A34A]',
  CREDIT_OFFICER: 'from-[#8B1A1A] to-[#C9921A]',
  MEMBER:         'from-[#1E3A2F] to-[#2D5A3D]',
};

const VIEW_TITLES: Record<string, string> = {
  ADMIN_HUB:           'Panel Administrativo',
  BI_PANEL:            'Business Intelligence',
  REPORTS:             'Reportes',
  REPORTS_SOCIOS_CREDITOS: 'Socios & Créditos',
  DASHBOARD:           'Panel de Socios',
  TELLER_OPERATIONS:   'Caja y Ventanilla',
  CHART_OF_ACCOUNTS:   'Contabilidad Central',
  CREDIT_OFFICER_HUB:  'Aprobación de Créditos',
  PROFILE:             'Mi Perfil',
  PLAZO_FIJO:          'Depósitos a Plazo Fijo',
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
  const [isSidebarOpen, setIsSidebarOpen]   = useState(false);
  const [isPinned, setIsPinned]             = useState(() => localStorage.getItem('sidebar_pinned') !== 'false');
  const [isHovered, setIsHovered]           = useState(false);
  const [currentTime, setCurrentTime]       = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const activeSubView = propActiveSubView !== undefined ? propActiveSubView : tellerTab;
  const onSubViewChange = (sub: string) => {
    if (propOnSubViewChange) propOnSubViewChange(sub);
    else if (onTellerTabChange) onTellerTabChange(sub as any);
  };

  const isExpanded = isPinned || isHovered;
  const navItems   = NAV_BY_ROLE[role] || NAV_BY_ROLE.MEMBER;

  const getSubmenuItems = (): { id: string; label: string; icon: React.ReactNode }[] => {
    switch (activeView) {
      case AppView.TELLER_OPERATIONS:
        return [
          { id: 'OPERATIONS',  label: 'OPERACIONES',          icon: <Banknote size={13} />    },
          { id: 'REGISTER',    label: 'APERTURA DE SOCIO',    icon: <UserPlus size={13} />    },
          { id: 'TX_SEARCH',   label: 'CONSULTA TX',          icon: <FileText size={13} />    },
          { id: 'CONSULTAS',   label: 'DIRECTORIO',           icon: <Search size={13} />      },
          { id: 'CASH_CLOSE',  label: 'CIERRE DE CAJA',       icon: <Calculator size={13} />  },
        ];
      case AppView.CREDIT_OFFICER_HUB:
        return [
          { id: 'APPROVALS',   label: 'APROBACIONES',         icon: <CheckCircle2 size={13} /> },
          { id: 'NEW_LOAN',    label: 'GENERAR SOLICITUD',    icon: <UserPlus size={13} />     },
          { id: 'COLLECTIONS', label: 'COBRO DIVIDENDOS',     icon: <Coins size={13} />        },
          { id: 'CARTERA',     label: 'CARTERA',              icon: <FileText size={13} />     },
        ];
      case AppView.ADMIN_HUB:
        return [
          { id: 'SUMMARY',   label: 'RESUMEN GENERAL',        icon: <BarChart3 size={13} />   },
          { id: 'MEMBERS',   label: 'REGISTRO DE SOCIOS',     icon: <UserIcon size={13} />    },
          { id: 'TASAS',     label: 'TASAS DE INTERÉS',       icon: <Percent size={13} />     },
          { id: 'PRODUCTOS', label: 'PRODUCTOS & CUENTAS',    icon: <Wallet size={13} />      },
          { id: 'SEGURIDAD', label: 'SEGURIDAD',              icon: <Database size={13} />    },
        ];
      case AppView.REPORTS_SOCIOS_CREDITOS:
        return [
          { id: 'GENERAL',       label: 'ESTADO GENERAL',       icon: <BarChart3 size={13} />  },
          { id: 'SOCIO_SEARCH',  label: 'BÚSQUEDA POR SOCIO',   icon: <Search size={13} />     },
          { id: 'PROFITABILITY', label: 'RENTABILIDAD',          icon: <DollarSign size={13} /> },
          { id: 'ORIGINS',       label: 'DIFERENCIACIÓN',        icon: <Layers size={13} />     },
        ];
      case AppView.BI_PANEL: {
        const isAdmin = role === UserRole.ADMIN || role === UserRole.SUPER_USER;
        const items: { id: string; label: string; icon: React.ReactNode }[] = [];
        if (isAdmin) items.push({ id: 'BUILDER', label: 'CONSTRUCTOR', icon: <Settings2 size={13} /> });
        items.push({ id: 'PROFITABILITY', label: 'RENTABILIDAD', icon: <TrendingUp size={13} /> });
        items.push({ id: 'BUREAU',        label: 'BURÓ INTERNO',  icon: <ShieldCheck size={13} /> });
        return items;
      }
      case AppView.PLAZO_FIJO:
        return [
          { id: 'GESTION',      label: 'GESTIÓN DPF',      icon: <Landmark size={13} />   },
          { id: 'NUEVA',        label: 'NUEVA INVERSIÓN',  icon: <DollarSign size={13} /> },
          { id: 'VENCIMIENTOS', label: 'VENCIMIENTOS',     icon: <Clock size={13} />      },
          { id: 'TASAS',        label: 'CONFIG. TASAS',    icon: <Settings2 size={13} />  },
          { id: 'CONTABILIDAD', label: 'CONTABILIDAD',     icon: <FileText size={13} />   },
        ];
      default:
        return [];
    }
  };

  const subMenuItems = getSubmenuItems();
  const hasSubmenu   = subMenuItems.length > 0;

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  const gradientRole = ROLE_COLORS[role] || ROLE_COLORS.MEMBER;
  const viewTitle    = VIEW_TITLES[activeView] || '';

  const timeStr = currentTime.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  const dateStr = currentTime.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="flex h-screen bg-[#0F1410] overflow-hidden">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-20 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* ── SIDEBAR DARK PREMIUM ──────────────────────────────────── */}
      <aside
        onMouseEnter={() => !isPinned && setIsHovered(true)}
        onMouseLeave={() => !isPinned && setIsHovered(false)}
        className={`
          fixed inset-y-0 left-0 z-30 transition-all duration-300 transform flex flex-col
          bg-gradient-to-b from-[#0D1B0F] via-[#0F2012] to-[#0A1A0C]
          border-r border-white/[0.06] shadow-2xl
          lg:relative lg:translate-x-0
          ${isPinned
            ? 'w-64 relative translate-x-0'
            : isHovered
              ? 'w-64 absolute translate-x-0 shadow-[0_0_60px_rgba(20,83,45,0.4)] z-50'
              : 'w-[72px] absolute'}
          ${isSidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo header */}
        <div className="h-16 flex items-center justify-between px-4 shrink-0 border-b border-white/[0.06]">
          <div className={`flex items-center gap-3 transition-all duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none w-0'}`}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#14532D] to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-900/50 shrink-0">
              <span className="font-black text-white text-lg italic">G</span>
            </div>
            <div className="overflow-hidden whitespace-nowrap">
              <p className="text-[13px] font-black text-white leading-none tracking-tight">Gutt System</p>
              <p className="text-[9px] font-bold text-emerald-400/70 uppercase tracking-[0.15em] mt-0.5">Portal Financiero SEPS</p>
            </div>
          </div>

          {!isExpanded && (
            <div className="flex justify-center w-full">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#14532D] to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-900/50">
                <span className="font-black text-white text-lg italic">G</span>
              </div>
            </div>
          )}

          {isExpanded && (
            <button
              onClick={() => { const n = !isPinned; setIsPinned(n); if (!n) setIsHovered(false); localStorage.setItem('sidebar_pinned', String(n)); }}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/10 transition-all shrink-0 lg:block hidden"
              title={isPinned ? 'Desanclar' : 'Anclar'}
            >
              {isPinned ? <Pin size={14} className="rotate-45" /> : <PinOff size={14} />}
            </button>
          )}
        </div>

        {/* Date/time strip — only when expanded */}
        {isExpanded && (
          <div className="px-4 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-white/40">
              <Clock size={11} />
              <span className="text-[10px] font-bold uppercase tracking-wider">{dateStr}</span>
            </div>
            <span className="text-[11px] font-black text-[#FACC15]/80 tabular-nums">{timeStr}</span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden scrollbar-none">
          {navItems.map((item: any) => {
            const isActive    = activeView === item.id;
            const showSub     = isActive && hasSubmenu && isExpanded;

            return (
              <div key={item.id}>
                <button
                  onClick={() => { onViewChange(item.id as AppView); setIsSidebarOpen(false); }}
                  title={!isExpanded ? item.label : undefined}
                  className={`
                    relative w-full flex items-center py-2.5 rounded-xl transition-all duration-200 group
                    ${isExpanded ? 'gap-3 px-3 justify-start' : 'justify-center px-0'}
                    ${isActive
                      ? 'bg-emerald-500/15 text-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,0.2)]'
                      : 'text-white/50 hover:text-white/90 hover:bg-white/[0.06]'}
                  `}
                >
                  {/* Active left accent */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-emerald-400 rounded-r-full shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                  )}

                  <div className={`shrink-0 transition-colors ${isActive ? 'text-emerald-400' : ''}`}>
                    {item.icon}
                  </div>

                  <span className={`text-[12px] font-bold truncate whitespace-nowrap transition-all duration-200 ${isExpanded ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0 pointer-events-none'}`}>
                    {item.label}
                  </span>

                  {isActive && isExpanded && (
                    <ChevronRight size={12} className="ml-auto shrink-0 text-emerald-400/60" />
                  )}

                  {/* Tooltip */}
                  {!isExpanded && (
                    <div className="absolute left-full ml-3 px-3 py-2 bg-[#1A2E1C] border border-white/10 text-white text-[11px] font-bold rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 whitespace-nowrap shadow-2xl">
                      {item.label}
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-[#1A2E1C] border-l border-b border-white/10 rotate-45" />
                    </div>
                  )}
                </button>

                {/* Submenu */}
                {showSub && (
                  <div className="mt-1 mb-2 ml-4 pl-3 border-l border-emerald-500/20 space-y-0.5">
                    {subMenuItems.map(sub => {
                      const subActive = activeSubView === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => onSubViewChange(sub.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all text-left ${
                            subActive
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'text-white/35 hover:text-white/70 hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className={subActive ? 'text-emerald-400' : 'text-white/30'}>{sub.icon}</span>
                          <span className="truncate">{sub.label}</span>
                          {subActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div className="shrink-0 border-t border-white/[0.06] p-3 space-y-2">
          {isExpanded ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.06]">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${gradientRole} flex items-center justify-center shrink-0 shadow-lg`}>
                <span className="text-white font-black text-xs">{initials || <UserIcon size={14} />}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white/80 truncate leading-none">{userName}</p>
                <p className="text-[9px] font-bold text-[#FACC15]/70 uppercase tracking-wider mt-0.5">{ROLE_TRANSLATIONS[role] || role}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center" title={`${userName} · ${ROLE_TRANSLATIONS[role] || role}`}>
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradientRole} flex items-center justify-center shadow-lg`}>
                <span className="text-white font-black text-xs">{initials || <UserIcon size={14} />}</span>
              </div>
            </div>
          )}

          <button
            onClick={onLogout}
            className={`w-full flex items-center text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all py-2.5
              ${isExpanded ? 'gap-3 px-3 justify-start' : 'justify-center'}`}
            title={!isExpanded ? 'Cerrar Sesión' : undefined}
          >
            <LogOut size={16} className="shrink-0" />
            {isExpanded && <span className="text-[11px] font-bold">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
      <main className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${!isPinned ? 'lg:pl-[72px]' : ''}`}>

        {/* Top header bar */}
        <header className="h-14 bg-white/[0.03] border-b border-white/[0.06] backdrop-blur-sm flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-white/40 hover:text-white/80 hover:bg-white/10 rounded-lg transition-all lg:hidden">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              {viewTitle && (
                <>
                  <span className="text-white/25 text-xs">Gutt System</span>
                  <ChevronRight size={12} className="text-white/15" />
                  <span className="text-[13px] font-bold text-white/70">{viewTitle}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1.5 rounded-full">
              <ShieldCheck size={12} />
              <span className="text-[10px] font-black uppercase tracking-widest">SEPS Activo</span>
            </div>
            <button className="relative p-2 text-white/30 hover:text-white/70 hover:bg-white/10 rounded-xl transition-all">
              <Bell size={16} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto bg-[#111A12]">
          {children}
        </div>
      </main>
    </div>
  );
};
