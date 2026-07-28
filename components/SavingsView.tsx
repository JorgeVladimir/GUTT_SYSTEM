import React, { useState, useEffect, useCallback } from 'react';
import {
  PiggyBank, Wallet, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, XCircle,
  Search, RefreshCw, FileText, BarChart3, UserCheck, X, ArrowDownCircle, ArrowUpCircle,
  Banknote, Info, Users, Clock
} from 'lucide-react';
import { UserRole, AccountType, Account } from '../types';
import { DataService } from '../services/dataService';

// ─── Paleta: verde marca (ahorro/crecimiento) · dorado (valor) ────────────────
const P = {
  green:     '#14532D',
  greenHov:  '#1b5e20',
  greenLite: '#166534',
  gold:      '#B8860B',   // dorado sobre fondo blanco (contraste)
  goldBright:'#FACC15',
};

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface CuentaAhorro {
  id: string;             // 'ca-123'
  CuentaId?: number;
  NumeroCuenta: string;
  Saldo: number;
  Estado: 'ACTIVA' | 'INACTIVA' | string;
  NombreProducto?: string;
  Identificacion?: string;
  NumeroSocio?: string;
  NombreSocio?: string;
  FechaApertura?: string;
}

interface SocioResult {
  SOCIOID: number; Identificacion: string; NombreCompleto: string;
  NumeroSocio?: string;
  cuentaAhorro?: CuentaAhorro;
}

interface Movimiento {
  id: string; AsientoId: number; fecha: string; descripcion: string;
  monto: number; tipo: 'CREDIT' | 'DEBIT'; usuarioId: string;
}

interface ResumenAhorros {
  totalCuentas: number; cuentasActivas: number; cuentasInactivas: number;
  totalCaptado: number; sociosConCuenta: number;
  depositosHoy: number; retirosHoy: number; movimientosHoy: number;
}

interface Props {
  currentUser?: { id: string; role: UserRole; name: string; accounts?: Account[] };
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt    = (n: number) => new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtUSD = (n: number) => `$${fmt(n)}`;

const mapSocioFromApi = (s: any): SocioResult => {
  const cuenta = (s.accounts || []).find((a: any) => a.type === 'AHORRO_VISTA');
  return {
    SOCIOID: parseInt(s.socioId || s.SOCIOID || '0'),
    Identificacion: s.id || s.Identificacion || '',
    NombreCompleto: s.name || `${s.PrimerNombre || ''} ${s.Apellidos || s.PrimerApellido || ''}`.trim(),
    NumeroSocio: s.memberNumber || s.NumeroSocio || '',
    cuentaAhorro: cuenta ? {
      id: cuenta.id,
      NumeroCuenta: cuenta.number,
      Saldo: cuenta.balance ?? 0,
      Estado: 'ACTIVA',
    } : undefined,
  };
};

const ESTADO_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVA:   { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  INACTIVA: { bg: 'bg-slate-100',  text: 'text-slate-500',   dot: 'bg-slate-400'  },
};

const EstadoBadge = ({ estado }: { estado: string }) => {
  const c = ESTADO_CONFIG[estado] || { bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{estado}
    </span>
  );
};

const STAFF_TABS = [
  { id: 'RESUMEN',     label: 'Resumen',            icon: <BarChart3 size={15} /> },
  { id: 'GESTION',     label: 'Gestión de Cuentas',  icon: <PiggyBank size={15} /> },
  { id: 'MOVIMIENTOS', label: 'Movimientos',         icon: <FileText size={15} /> },
];
const MEMBER_TABS = [
  { id: 'MIS_CUENTAS', label: 'Mi Cuenta de Ahorros', icon: <Wallet size={15} /> },
];

// ─── Componente principal ─────────────────────────────────────────────────────
export const SavingsView: React.FC<Props> = ({ currentUser, activeTab, onActiveTabChange }) => {
  const isMember  = currentUser?.role === UserRole.MEMBER;
  const canOperate = !isMember && (
    currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER ||
    currentUser?.role === UserRole.MANAGER || currentUser?.role === UserRole.TELLER
  );

  // Para socios, ignoramos el sub-tab del padre: solo existe una vista de autoservicio.
  const tab = isMember ? 'MIS_CUENTAS' : activeTab;
  const TABS = isMember ? MEMBER_TABS : STAFF_TABS;

  const [loading, setLoading] = useState(false);
  const [alerta, setAlerta]   = useState<{ tipo: 'ok' | 'error' | 'warn'; msg: string } | null>(null);

  // Staff: resumen
  const [resumen, setResumen] = useState<ResumenAhorros | null>(null);

  // Staff: búsqueda / gestión
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [buscandoSocio, setBuscandoSocio]     = useState(false);
  const [resultadosSocio, setResultadosSocio] = useState<SocioResult[]>([]);
  const [socioSeleccionado, setSocioSeleccionado] = useState<SocioResult | null>(null);
  const [opType, setOpType]           = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [montoOp, setMontoOp]         = useState('');
  const [descripcionOp, setDescripcionOp] = useState('');
  const [procesando, setProcesando]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Movimientos (compartido entre GESTIÓN → "ver movimientos" y la pestaña MOVIMIENTOS,
  // y también usado en modo autoservicio de MEMBER)
  const [cuentaEnFoco, setCuentaEnFoco]   = useState<CuentaAhorro | null>(null);
  const [movimientos, setMovimientos]     = useState<Movimiento[]>([]);
  const [loadingMovs, setLoadingMovs]     = useState(false);

  const mostrarAlerta = (tipo: 'ok' | 'error' | 'warn', msg: string) => {
    setAlerta({ tipo, msg });
    setTimeout(() => setAlerta(null), 6000);
  };

  // ── Carga de datos (staff) ──────────────────────────────────────────────────
  const cargarResumen = useCallback(async () => {
    try { const r = await fetch('/api/ahorros/resumen'); const d = await r.json(); if (d.ok) setResumen(d.data); } catch {}
  }, []);

  useEffect(() => { if (!isMember) cargarResumen(); }, [isMember]);

  const cargarMovimientos = useCallback(async (cuentaId: string) => {
    setLoadingMovs(true);
    try {
      const r = await fetch(`/api/ahorros/${cuentaId}/movimientos?limit=100`);
      const d = await r.json();
      if (d.ok) {
        setCuentaEnFoco(d.data.account);
        setMovimientos(d.data.movimientos);
      } else {
        mostrarAlerta('error', d.error || 'Error al cargar movimientos.');
      }
    } catch { mostrarAlerta('error', 'Error de conexión al cargar movimientos.'); }
    setLoadingMovs(false);
  }, []);

  // ── Autoservicio (MEMBER): cargar mi propia cuenta y mis movimientos ────────
  useEffect(() => {
    if (!isMember) return;
    const miCuenta = (currentUser?.accounts || []).find(a => a.type === AccountType.SAVINGS);
    if (miCuenta) cargarMovimientos(miCuenta.id);
  }, [isMember, currentUser?.accounts, cargarMovimientos]);

  // ── Buscar socios (staff) ────────────────────────────────────────────────────
  const buscarSocio = async () => {
    const q = terminoBusqueda.trim();
    if (!q) return;
    setBuscandoSocio(true);
    setResultadosSocio([]);
    setSocioSeleccionado(null);
    try {
      const r = await fetch(`/api/socios/buscar?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (d.ok && Array.isArray(d.data) && d.data.length > 0) {
        setResultadosSocio(d.data.map(mapSocioFromApi));
      } else {
        mostrarAlerta('warn', 'No se encontraron socios con ese término. Intente con cédula, apellido o número de socio.');
      }
    } catch { mostrarAlerta('error', 'Error de conexión al buscar el socio.'); }
    setBuscandoSocio(false);
  };

  const seleccionarSocio = (socio: SocioResult) => {
    setSocioSeleccionado(socio);
    setResultadosSocio([]);
    setMontoOp(''); setDescripcionOp(''); setOpType('DEPOSIT');
    if (socio.cuentaAhorro) cargarMovimientos(socio.cuentaAhorro.id);
  };

  const limpiarSocio = () => {
    setSocioSeleccionado(null);
    setResultadosSocio([]);
    setTerminoBusqueda('');
    setMontoOp(''); setDescripcionOp('');
    setCuentaEnFoco(null); setMovimientos([]);
  };

  // ── Operación de depósito / retiro ───────────────────────────────────────────
  const validarOperacion = (): string | null => {
    if (!socioSeleccionado?.cuentaAhorro) return 'No hay una cuenta de ahorros seleccionada.';
    const monto = parseFloat(montoOp);
    if (isNaN(monto) || monto <= 0) return 'Ingrese un monto válido mayor a cero.';
    if (opType === 'WITHDRAW' && monto > socioSeleccionado.cuentaAhorro.Saldo) return 'El monto excede el saldo disponible.';
    if (!descripcionOp.trim()) return 'Ingrese una descripción para el movimiento.';
    return null;
  };

  const abrirConfirmOperacion = () => {
    const err = validarOperacion();
    if (err) { mostrarAlerta('warn', err); return; }
    setConfirmOpen(true);
  };

  const ejecutarOperacion = async () => {
    setConfirmOpen(false);
    if (!socioSeleccionado?.cuentaAhorro) return;
    setProcesando(true);
    try {
      const r = await fetch('/api/socios/transaccion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(DataService.getToken() ? { Authorization: `Bearer ${DataService.getToken()}` } : {}),
        },
        body: JSON.stringify({
          accountId: socioSeleccionado.cuentaAhorro.id,
          opType,
          amount: parseFloat(montoOp),
          description: descripcionOp.trim(),
          tellerId: currentUser?.id,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        mostrarAlerta('ok', `${opType === 'DEPOSIT' ? 'Depósito' : 'Retiro'} registrado con éxito.\nNuevo saldo: ${fmtUSD(d.balance)}`);
        setSocioSeleccionado(prev => prev && prev.cuentaAhorro ? { ...prev, cuentaAhorro: { ...prev.cuentaAhorro, Saldo: d.balance } } : prev);
        setMontoOp(''); setDescripcionOp('');
        cargarMovimientos(socioSeleccionado.cuentaAhorro.id);
        cargarResumen();
      } else {
        mostrarAlerta('error', d.error || 'Error al procesar la operación.');
      }
    } catch { mostrarAlerta('error', 'Error de conexión.'); }
    setProcesando(false);
  };

  // ── Mi cuenta (MEMBER) ───────────────────────────────────────────────────────
  const miCuentaProp = (currentUser?.accounts || []).find(a => a.type === AccountType.SAVINGS);
  const miSaldo = cuentaEnFoco ? cuentaEnFoco.Saldo : (miCuentaProp?.balance ?? 0);
  const miNumeroCuenta = cuentaEnFoco ? cuentaEnFoco.NumeroCuenta : (miCuentaProp?.number ?? '');
  const miEstado = cuentaEnFoco ? cuentaEnFoco.Estado : 'ACTIVA';

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 min-h-full bg-transparent">

      {/* ── Alerta global ── */}
      {alerta && (
        <div className={`rounded-2xl p-4 flex items-start gap-3 border ${
          alerta.tipo === 'ok'   ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
          alerta.tipo === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                   'bg-red-50 border-red-200 text-red-700'}`}>
          {alerta.tipo === 'ok' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : alerta.tipo === 'warn' ? <AlertTriangle size={18} className="shrink-0 mt-0.5" /> : <XCircle size={18} className="shrink-0 mt-0.5" />}
          <p className="text-sm font-bold whitespace-pre-line flex-1">{alerta.msg}</p>
          <button onClick={() => setAlerta(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {TABS.length > 1 && (
          <div className="flex overflow-x-auto border-b border-slate-200">
            {TABS.map(t => (
              <button key={t.id} onClick={() => onActiveTabChange(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${
                  tab === t.id
                    ? 'border-[#14532D] text-[#14532D] bg-emerald-50'
                    : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        )}

        <div className="p-4">

          {/* ──────── RESUMEN (staff) ──────── */}
          {tab === 'RESUMEN' && !isMember && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                  <PiggyBank size={16} className="text-[#14532D]" />Ahorro a la Vista — Indicadores
                </h3>
                <button onClick={cargarResumen}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl hover:bg-slate-200 transition-all">
                  <RefreshCw size={13} />Actualizar
                </button>
              </div>
              {resumen ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Captado',      value: fmtUSD(resumen.totalCaptado || 0),  icon: <Banknote size={18} />,   color: 'text-[#14532D]', bg: 'bg-emerald-50 border-emerald-200' },
                    { label: 'Cuentas Activas',    value: resumen.cuentasActivas || 0,          icon: <PiggyBank size={18} />,  color: 'text-[#14532D]', bg: 'bg-emerald-50 border-emerald-200' },
                    { label: 'Socios con Cuenta',  value: resumen.sociosConCuenta || 0,         icon: <Users size={18} />,      color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
                    { label: 'Movimientos Hoy',    value: resumen.movimientosHoy || 0,          icon: <Clock size={18} />,      color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
                    { label: 'Depósitos Hoy',      value: fmtUSD(resumen.depositosHoy || 0),    icon: <ArrowDownCircle size={18} />, color: 'text-[#14532D]', bg: 'bg-emerald-50 border-emerald-200' },
                    { label: 'Retiros Hoy',        value: fmtUSD(resumen.retirosHoy || 0),      icon: <ArrowUpCircle size={18} />,   color: 'text-red-600',   bg: 'bg-red-50 border-red-200' },
                    { label: 'Cuentas Inactivas',  value: resumen.cuentasInactivas || 0,        icon: <XCircle size={18} />,    color: 'text-slate-400', bg: 'bg-slate-50 border-slate-100' },
                    { label: 'Total de Cuentas',   value: resumen.totalCuentas || 0,            icon: <Wallet size={18} />,     color: 'text-[#14532D]', bg: 'bg-emerald-50 border-emerald-200' },
                  ].map((k, i) => (
                    <div key={i} className={`rounded-2xl border p-4 flex items-center gap-3 ${k.bg}`}>
                      <div className={`p-2 rounded-xl bg-white/70 shadow-sm ${k.color}`}>{k.icon}</div>
                      <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-wide">{k.label}</p>
                        <p className={`text-xl font-black tabular-nums ${k.color}`}>{k.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-16"><RefreshCw size={24} className="animate-spin text-[#14532D]" /></div>
              )}
            </div>
          )}

          {/* ──────── GESTIÓN (staff) ──────── */}
          {tab === 'GESTION' && !isMember && (
            <div className="space-y-6">

              {/* PASO 1: Búsqueda de socio */}
              <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: socioSeleccionado ? P.gold : '#e2e8f0', background: socioSeleccionado ? '#FEF9EC' : '#ffffff' }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: P.green }}>1</div>
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Buscar Socio</h3>
                </div>

                {!socioSeleccionado ? (
                  <>
                    <p className="text-[11px] text-slate-500 font-medium">Busque por cédula, nombres, apellidos o número de socio</p>
                    <div className="flex gap-2">
                      <input
                        value={terminoBusqueda}
                        onChange={e => setTerminoBusqueda(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && buscarSocio()}
                        placeholder="Ej: 1720884012 · TUQUINGA · P1000"
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm font-bold focus:outline-none focus:border-[#14532D]"
                      />
                      <button onClick={buscarSocio} disabled={buscandoSocio || !terminoBusqueda.trim()}
                        className="px-5 py-3 text-white rounded-xl font-black text-sm transition-all disabled:opacity-40 flex items-center gap-2 shadow-lg"
                        style={{ background: P.green }}>
                        {buscandoSocio ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                        Buscar
                      </button>
                    </div>

                    {resultadosSocio.length > 0 && (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{resultadosSocio.length} resultado(s) — seleccione el socio:</p>
                        {resultadosSocio.map((s, i) => (
                          <button key={i} onClick={() => seleccionarSocio(s)}
                            className="w-full rounded-xl border border-slate-200 bg-white hover:border-[#14532D] hover:bg-emerald-50 transition-all p-4 text-left shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0"
                                style={{ background: P.green }}>
                                {s.NombreCompleto.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-slate-800 text-sm truncate">{s.NombreCompleto}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                                  <span className="text-[10px] text-slate-500 font-bold">CI: {s.Identificacion}</span>
                                  {s.NumeroSocio && <span className="text-[10px] text-amber-700 font-bold">N° Socio: {s.NumeroSocio}</span>}
                                  {s.cuentaAhorro ? (
                                    <span className="text-[10px] text-[#14532D] font-bold">Saldo Ahorros: {fmtUSD(s.cuentaAhorro.Saldo)}</span>
                                  ) : (
                                    <span className="text-[10px] text-red-500 font-bold">Sin cuenta de ahorros</span>
                                  )}
                                </div>
                              </div>
                              <UserCheck size={16} className="text-[#14532D] shrink-0 opacity-70" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border p-4 flex items-center gap-4" style={{ borderColor: P.gold, background: '#FEF9EC' }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg text-white shrink-0 shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${P.green}, ${P.gold})` }}>
                      {socioSeleccionado.NombreCompleto.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-[#14532D] text-base truncate">{socioSeleccionado.NombreCompleto}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        <span className="text-xs text-slate-600 font-bold">Cédula: <span className="text-slate-800">{socioSeleccionado.Identificacion}</span></span>
                        {socioSeleccionado.NumeroSocio && (
                          <span className="text-xs text-slate-600 font-bold">N° Socio: <span className="text-amber-700">{socioSeleccionado.NumeroSocio}</span></span>
                        )}
                      </div>
                    </div>
                    <button onClick={limpiarSocio} title="Cambiar socio"
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0">
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* PASO 2: Cuenta y operación */}
              {socioSeleccionado && !socioSeleccionado.cuentaAhorro && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex items-center gap-3">
                  <AlertTriangle size={20} className="text-red-600 shrink-0" />
                  <p className="text-sm font-bold text-red-700">Este socio no tiene una cuenta de Ahorro a la Vista registrada.</p>
                </div>
              )}

              {socioSeleccionado?.cuentaAhorro && (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Info de cuenta + operación */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: P.gold }}>2</div>
                      <h3 className="font-black text-[#14532D] text-sm uppercase tracking-wide">Cuenta de Ahorros</h3>
                    </div>

                    <div className="rounded-2xl border-2 p-5 bg-white space-y-1" style={{ borderColor: P.green }}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">N° Cuenta</p>
                        <EstadoBadge estado={socioSeleccionado.cuentaAhorro.Estado} />
                      </div>
                      <p className="font-mono font-black text-slate-700 text-sm">{socioSeleccionado.cuentaAhorro.NumeroCuenta}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3">Saldo Disponible</p>
                      <p className="text-3xl font-black tabular-nums" style={{ color: P.green }}>{fmtUSD(socioSeleccionado.cuentaAhorro.Saldo)}</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-5 space-y-4 bg-white">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setOpType('DEPOSIT')}
                          className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${opType === 'DEPOSIT' ? 'text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
                          style={opType === 'DEPOSIT' ? { background: P.green } : {}}>
                          <ArrowDownCircle size={14} />Depósito
                        </button>
                        <button type="button" onClick={() => setOpType('WITHDRAW')}
                          className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 ${opType === 'WITHDRAW' ? 'text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}
                          style={opType === 'WITHDRAW' ? { background: '#B91C1C' } : {}}>
                          <ArrowUpCircle size={14} />Retiro
                        </button>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Monto (USD) *</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                          <input type="number" min="0" step="0.01" value={montoOp} onChange={e => setMontoOp(e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm font-bold focus:outline-none focus:border-[#14532D]" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Descripción *</label>
                        <input value={descripcionOp} onChange={e => setDescripcionOp(e.target.value)}
                          placeholder={opType === 'DEPOSIT' ? 'Ej: Depósito ventanilla' : 'Ej: Retiro ventanilla'}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400 text-sm font-medium focus:outline-none focus:border-[#14532D]" />
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[10px] font-bold text-slate-500 flex items-start gap-2">
                        <Info size={13} className="shrink-0 mt-0.5" />
                        <p>Operación rápida sin desglose de billetes/monedas. Para arqueo de efectivo detallado use <strong>Caja y Ventanilla</strong>.</p>
                      </div>

                      <button onClick={abrirConfirmOperacion} disabled={procesando}
                        className="w-full py-4 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-40 flex items-center justify-center gap-3 shadow-xl"
                        style={{ background: opType === 'DEPOSIT' ? `linear-gradient(135deg, ${P.green}, ${P.greenHov})` : 'linear-gradient(135deg, #B91C1C, #7F1D1D)' }}>
                        {procesando ? <RefreshCw size={18} className="animate-spin" /> : (opType === 'DEPOSIT' ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />)}
                        CONFIRMAR {opType === 'DEPOSIT' ? 'DEPÓSITO' : 'RETIRO'}
                      </button>
                    </div>
                  </div>

                  {/* Movimientos recientes de la cuenta seleccionada */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                        <FileText size={15} className="text-[#14532D]" />Últimos Movimientos
                      </h3>
                      <button onClick={() => onActiveTabChange('MOVIMIENTOS')}
                        className="text-[10px] font-black text-[#14532D] uppercase tracking-widest hover:underline">
                        Ver todo
                      </button>
                    </div>
                    <MovimientosTable movimientos={movimientos.slice(0, 8)} loading={loadingMovs} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────── MOVIMIENTOS (staff) ──────── */}
          {tab === 'MOVIMIENTOS' && !isMember && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                  <FileText size={16} className="text-[#14532D]" />Historial de Movimientos
                </h3>
                {cuentaEnFoco && (
                  <button onClick={() => cargarMovimientos(cuentaEnFoco.id)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl hover:bg-slate-200 transition-all">
                    <RefreshCw size={13} />Actualizar
                  </button>
                )}
              </div>

              {!cuentaEnFoco ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Search size={40} className="mb-3 opacity-40" />
                  <p className="font-bold text-sm">Seleccione un socio en la pestaña "Gestión de Cuentas" para ver su historial.</p>
                  <button onClick={() => onActiveTabChange('GESTION')}
                    className="mt-4 px-4 py-2 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 shadow-lg"
                    style={{ background: P.green }}>
                    <PiggyBank size={14} />Ir a Gestión
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border p-4 bg-white flex flex-wrap items-center justify-between gap-3" style={{ borderColor: P.green }}>
                    <div>
                      <p className="font-black text-slate-800 text-sm">{cuentaEnFoco.NombreSocio}</p>
                      <p className="text-[11px] text-slate-500 font-bold">{cuentaEnFoco.Identificacion} · Cta. {cuentaEnFoco.NumeroCuenta}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase">Saldo Actual</p>
                      <p className="text-xl font-black tabular-nums" style={{ color: P.green }}>{fmtUSD(cuentaEnFoco.Saldo)}</p>
                    </div>
                  </div>
                  <MovimientosTable movimientos={movimientos} loading={loadingMovs} />
                </>
              )}
            </div>
          )}

          {/* ──────── MIS CUENTAS (member — autoservicio de solo consulta) ──────── */}
          {tab === 'MIS_CUENTAS' && isMember && (
            <div className="space-y-6">
              {!miCuentaProp ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <AlertTriangle size={40} className="mb-3 opacity-40" />
                  <p className="font-bold text-sm">No se encontró una cuenta de ahorros asociada a su usuario.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-3xl border-2 p-6 shadow-lg bg-white space-y-4" style={{ borderColor: P.green }}>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-[10px] font-black uppercase tracking-widest"
                        style={{ background: `linear-gradient(135deg, ${P.green}, ${P.gold})` }}>
                        <PiggyBank size={13} /> Ahorro a la Vista
                      </span>
                      <EstadoBadge estado={miEstado} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">N° de Cuenta</p>
                      <p className="font-mono font-black text-slate-700">{miNumeroCuenta}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Disponible</p>
                      <p className="text-4xl font-black tabular-nums" style={{ color: P.green }}>{fmtUSD(miSaldo)}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] font-bold text-emerald-700 flex items-start gap-2">
                      <Info size={14} className="shrink-0 mt-0.5" />
                      <p>Esta es una vista de consulta. Para depósitos o retiros en efectivo, acérquese a ventanilla con su cédula.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                        <FileText size={15} className="text-[#14532D]" />Movimientos Recientes
                      </h3>
                      <button onClick={() => miCuentaProp && cargarMovimientos(miCuentaProp.id)}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl hover:bg-slate-200 transition-all">
                        <RefreshCw size={13} />Actualizar
                      </button>
                    </div>
                    <MovimientosTable movimientos={movimientos} loading={loadingMovs} />
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Modal: Confirmación de operación ── */}
      {confirmOpen && socioSeleccionado?.cuentaAhorro && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-inner bg-emerald-50 border border-emerald-200">
                <AlertTriangle size={28} className="text-[#14532D]" />
              </div>
              <h3 className="font-black text-slate-800 text-base uppercase tracking-tight">
                Confirmar {opType === 'DEPOSIT' ? 'Depósito' : 'Retiro'}
              </h3>
              <p className="text-sm text-slate-500 font-bold whitespace-pre-line leading-relaxed">
                {`Socio: ${socioSeleccionado.NombreCompleto}\nCuenta: ${socioSeleccionado.cuentaAhorro.NumeroCuenta}\nMonto: ${fmtUSD(parseFloat(montoOp) || 0)}\nDescripción: ${descripcionOp}\n\nSaldo actual: ${fmtUSD(socioSeleccionado.cuentaAhorro.Saldo)}\nSaldo resultante: ${fmtUSD(opType === 'DEPOSIT' ? socioSeleccionado.cuentaAhorro.Saldo + (parseFloat(montoOp) || 0) : socioSeleccionado.cuentaAhorro.Saldo - (parseFloat(montoOp) || 0))}`}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={ejecutarOperacion}
                className="flex-1 py-4 text-white rounded-2xl font-black text-sm transition-all shadow-lg"
                style={{ background: opType === 'DEPOSIT' ? `linear-gradient(135deg, ${P.green}, ${P.gold})` : 'linear-gradient(135deg, #B91C1C, #7F1D1D)' }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ─── Subcomponente: tabla de movimientos ───────────────────────────────────────
const MovimientosTable: React.FC<{ movimientos: Movimiento[]; loading: boolean }> = ({ movimientos, loading }) => {
  if (loading) {
    return <div className="flex items-center justify-center py-12"><RefreshCw size={22} className="animate-spin text-[#14532D]" /></div>;
  }
  if (movimientos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-slate-200 rounded-xl bg-slate-50/50">
        <FileText size={32} className="mb-2 opacity-40" />
        <p className="font-bold text-sm">Sin movimientos registrados</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider">
            {['Fecha', 'Descripción', 'Monto', 'Usuario'].map(h => (
              <th key={h} className={`px-3 py-3 ${h === 'Monto' ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {movimientos.map(m => (
            <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="px-3 py-3 text-xs text-slate-500 font-bold whitespace-nowrap">{m.fecha}</td>
              <td className="px-3 py-3 text-xs text-slate-700 font-medium max-w-[220px] truncate">{m.descripcion}</td>
              <td className={`px-3 py-3 text-right font-black tabular-nums text-xs ${m.tipo === 'CREDIT' ? 'text-[#14532D]' : 'text-red-600'}`}>
                {m.tipo === 'CREDIT' ? '+' : '−'}{fmtUSD(Math.abs(m.monto))}
              </td>
              <td className="px-3 py-3 text-[10px] text-slate-400 font-bold">{m.usuarioId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
