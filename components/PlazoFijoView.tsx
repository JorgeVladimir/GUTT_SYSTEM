import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, PiggyBank, TrendingUp, CheckCircle2, AlertTriangle, XCircle,
  Search, Plus, RefreshCw, FileText, Settings, Calendar, DollarSign,
  ChevronDown, ChevronUp, Printer, RotateCcw, Info, X, Banknote, Shield
} from 'lucide-react';
import { UserRole } from '../types';

interface TasaPlazoFijo {
  TasaID: number;
  CodigoRango: string;
  DescripcionRango: string;
  DiasDesde: number;
  DiasHasta: number;
  TasaNominalAnual: number;
  TasaMaximaBCE: number;
  MontoMinimo: number;
  MontoMaximo: number | null;
  CuentaContableDPF: string;
  PorcentajePenalizacion: number;
  Activo: boolean;
  FechaVigencia: string;
}

interface DepositoPlazo {
  DepositoID: string;
  Identificacion: string;
  NombreSocio: string;
  MontoCapital: number;
  TasaNominalAnual: number;
  PlazosDias: number;
  InteresProyectado: number;
  RetencionProyectada: number;
  InteresNetoProyectado: number;
  Estado: 'ACTIVO' | 'VENCIDO' | 'LIQUIDADO' | 'CANCELADO' | 'RENOVADO';
  TipoRenovacion: string;
  ModalidadPago: string;
  CuentaContableDPF: string;
  NumCertificado: string;
  NumeroRenovacion: number;
  FechaApertura: string;
  FechaVencimiento: string;
  FechaAperturaFmt?: string;
  FechaVencimientoFmt?: string;
  FechaLiquidacion?: string;
  DiasRestantes: number;
  DescripcionRango: string;
  PorcentajePenalizacion: number;
  InteresLiquidado?: number;
  RetencionAplicada?: number;
  InteresNetoLiquidado?: number;
  PenalizacionAplicada?: number;
  UsuarioAperturaID: string;
}

interface AsientoContable {
  AsientoID: number;
  TipoOperacion: string;
  CuentaContable: string;
  NombreCuenta: string;
  DebeAmount: number;
  HaberAmount: number;
  Concepto: string;
  FechaAsiento: string;
  UsuarioID: string;
}

interface SocioResult {
  SOCIOID: number;
  Identificacion: string;
  NombreCompleto: string;
  NroCuenta?: string;
  SaldoAhorro?: number;
}

interface Props {
  currentUser?: { id: string; role: UserRole; name: string };
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
}

const fmt = (n: number) => new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtUSD = (n: number) => `$${fmt(n)}`;

const ESTADO_CONFIG = {
  ACTIVO:    { label: 'ACTIVO',    bg: 'bg-emerald-100',  text: 'text-emerald-700',  dot: 'bg-emerald-500'  },
  VENCIDO:   { label: 'VENCIDO',   bg: 'bg-amber-100',    text: 'text-amber-700',    dot: 'bg-amber-500'    },
  LIQUIDADO: { label: 'LIQUIDADO', bg: 'bg-blue-100',     text: 'text-blue-700',     dot: 'bg-blue-500'     },
  CANCELADO: { label: 'CANCELADO', bg: 'bg-red-100',      text: 'text-red-700',      dot: 'bg-red-500'      },
  RENOVADO:  { label: 'RENOVADO',  bg: 'bg-purple-100',   text: 'text-purple-700',   dot: 'bg-purple-500'   },
};

const EstadoBadge = ({ estado }: { estado: string }) => {
  const c = ESTADO_CONFIG[estado as keyof typeof ESTADO_CONFIG] || { label: estado, bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
};

const TABS = [
  { id: 'GESTION',       label: 'Gestión DPF',       icon: <PiggyBank size={15} />    },
  { id: 'NUEVA',         label: 'Nueva Inversión',    icon: <Plus size={15} />         },
  { id: 'VENCIMIENTOS',  label: 'Vencimientos',       icon: <Calendar size={15} />     },
  { id: 'TASAS',         label: 'Config. Tasas',      icon: <Settings size={15} />     },
  { id: 'CONTABILIDAD',  label: 'Contabilidad',       icon: <FileText size={15} />     },
];

export const PlazoFijoView: React.FC<Props> = ({ currentUser, activeTab, onActiveTabChange }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER;
  const canOperate = isAdmin || currentUser?.role === UserRole.TELLER || currentUser?.role === UserRole.MANAGER;

  // ── Estado global ──────────────────────────────────────────────────────────
  const [tasas, setTasas]             = useState<TasaPlazoFijo[]>([]);
  const [depositos, setDepositos]     = useState<DepositoPlazo[]>([]);
  const [vencimientos, setVencimientos] = useState<DepositoPlazo[]>([]);
  const [resumen, setResumen]         = useState<any>(null);
  const [loading, setLoading]         = useState(false);
  const [alerta, setAlerta]           = useState<{ tipo: 'ok' | 'error' | 'warn'; msg: string } | null>(null);

  // ── Filtros de búsqueda ────────────────────────────────────────────────────
  const [filtroEstado, setFiltroEstado]     = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [detalleDPF, setDetalleDPF]         = useState<{ dpf: DepositoPlazo; asientos: AsientoContable[] } | null>(null);

  // ── Formulario nueva inversión ─────────────────────────────────────────────
  const [buscandoSocio, setBuscandoSocio]   = useState(false);
  const [cedulaBuscar, setCedulaBuscar]     = useState('');
  const [socioEncontrado, setSocioEncontrado] = useState<SocioResult | null>(null);
  const [formTasaID, setFormTasaID]         = useState('');
  const [formMonto, setFormMonto]           = useState('');
  const [formPlazo, setFormPlazo]           = useState('');
  const [formRenovacion, setFormRenovacion] = useState('NO_RENOVAR');
  const [formModalidad, setFormModalidad]   = useState('AL_VENCIMIENTO');
  const [formObs, setFormObs]               = useState('');
  const [preview, setPreview]               = useState<any>(null);
  const [confirmOpen, setConfirmOpen]       = useState(false);
  const [confirmData, setConfirmData]       = useState<{ titulo: string; msg: string; accion: () => void } | null>(null);

  // ── Config tasas ───────────────────────────────────────────────────────────
  const [editTasas, setEditTasas]           = useState<Record<number, Partial<TasaPlazoFijo>>>({});
  const [savingTasa, setSavingTasa]         = useState<number | null>(null);

  // ── Modal renovación ───────────────────────────────────────────────────────
  const [renovarDPF, setRenovarDPF]         = useState<DepositoPlazo | null>(null);
  const [renovarTasaID, setRenovarTasaID]   = useState('');
  const [renovarPlazo, setRenovarPlazo]     = useState('');

  const mostrarAlerta = (tipo: 'ok' | 'error' | 'warn', msg: string) => {
    setAlerta({ tipo, msg });
    setTimeout(() => setAlerta(null), 6000);
  };

  // ── Carga de datos ─────────────────────────────────────────────────────────
  const cargarTasas = useCallback(async () => {
    try {
      const r = await fetch('/api/dpf/tasas');
      const d = await r.json();
      if (d.ok) setTasas(d.data);
    } catch {}
  }, []);

  const cargarDepositos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado)   params.set('estado', filtroEstado);
      if (filtroBusqueda) params.set('busqueda', filtroBusqueda);
      const r = await fetch(`/api/dpf?${params.toString()}`);
      const d = await r.json();
      if (d.ok) setDepositos(d.data);
    } catch {}
    setLoading(false);
  }, [filtroEstado, filtroBusqueda]);

  const cargarVencimientos = useCallback(async () => {
    try {
      const r = await fetch('/api/dpf/vencimientos?dias=30');
      const d = await r.json();
      if (d.ok) setVencimientos(d.data);
    } catch {}
  }, []);

  const cargarResumen = useCallback(async () => {
    try {
      const r = await fetch('/api/dpf/resumen');
      const d = await r.json();
      if (d.ok) setResumen(d.data);
    } catch {}
  }, []);

  useEffect(() => {
    cargarTasas();
    cargarResumen();
  }, []);

  useEffect(() => {
    if (activeTab === 'GESTION' || activeTab === 'CONTABILIDAD') cargarDepositos();
  }, [activeTab, filtroEstado, filtroBusqueda]);

  useEffect(() => {
    if (activeTab === 'VENCIMIENTOS') cargarVencimientos();
  }, [activeTab]);

  // ── Cálculo de preview ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!formTasaID || !formMonto || !formPlazo) { setPreview(null); return; }
    const tasa = tasas.find(t => t.TasaID === parseInt(formTasaID));
    if (!tasa) { setPreview(null); return; }
    const monto = parseFloat(formMonto);
    const dias  = parseInt(formPlazo);
    if (isNaN(monto) || isNaN(dias) || monto <= 0 || dias < 1) { setPreview(null); return; }
    const interesBruto   = monto * (tasa.TasaNominalAnual / 100) * (dias / 365);
    const retencion      = interesBruto * 0.02;
    const interesNeto    = interesBruto - retencion;
    const fechaVenc      = new Date(); fechaVenc.setDate(fechaVenc.getDate() + dias);
    const tea            = (Math.pow(1 + (tasa.TasaNominalAnual / 100) * (dias / 365), 365 / dias) - 1) * 100;
    setPreview({ interesBruto, retencion, interesNeto, fechaVenc: fechaVenc.toLocaleDateString('es-EC'), tea, tasa, monto, dias });
  }, [formTasaID, formMonto, formPlazo, tasas]);

  // ── Buscar socio ───────────────────────────────────────────────────────────
  const buscarSocio = async () => {
    if (!cedulaBuscar.trim()) return;
    setBuscandoSocio(true);
    setSocioEncontrado(null);
    try {
      const r = await fetch(`/api/socios/buscar?identificacion=${cedulaBuscar.trim()}`);
      const d = await r.json();
      if (d.ok && d.data?.length > 0) {
        const s = d.data[0];
        setSocioEncontrado({ SOCIOID: s.SOCIOID, Identificacion: s.Identificacion, NombreCompleto: `${s.PrimerNombre || ''} ${s.PrimerApellido || ''}`.trim(), NroCuenta: s.NroCuenta, SaldoAhorro: s.SaldoAhorro });
      } else {
        mostrarAlerta('warn', 'Socio no encontrado. Verifique la cédula/RUC.');
      }
    } catch { mostrarAlerta('error', 'Error de conexión al buscar el socio.'); }
    setBuscandoSocio(false);
  };

  // ── Apertura DPF ───────────────────────────────────────────────────────────
  const abrirConfirm = () => {
    if (!socioEncontrado || !preview) return;
    const tasa = tasas.find(t => t.TasaID === parseInt(formTasaID))!;
    setConfirmData({
      titulo: 'Confirmar Apertura de DPF',
      msg: `Socio: ${socioEncontrado.NombreCompleto}\nMonto: ${fmtUSD(preview.monto)}\nPlazo: ${preview.dias} días (${tasa.DescripcionRango})\nTasa: ${tasa.TasaNominalAnual}% TNA | TEA: ${preview.tea.toFixed(2)}%\nInterés bruto: ${fmtUSD(preview.interesBruto)}\nRetención 2% (LORTI): -${fmtUSD(preview.retencion)}\nInterés neto al vencimiento: ${fmtUSD(preview.interesNeto)}\nVence: ${preview.fechaVenc}\n\n¿Desea aperturar este DPF?`,
      accion: aperturarDPF
    });
    setConfirmOpen(true);
  };

  const aperturarDPF = async () => {
    setConfirmOpen(false);
    if (!socioEncontrado || !preview) return;
    setLoading(true);
    try {
      const r = await fetch('/api/dpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socioid: socioEncontrado.SOCIOID,
          identificacion: socioEncontrado.Identificacion,
          nombreSocio: socioEncontrado.NombreCompleto,
          tasaID: parseInt(formTasaID),
          montoCapital: parseFloat(formMonto),
          plazosDias: parseInt(formPlazo),
          tipoRenovacion: formRenovacion,
          modalidadPago: formModalidad,
          cuentaAhorrosRelacionada: socioEncontrado.NroCuenta || null,
          observaciones: formObs || null,
          usuarioID: currentUser?.id
        })
      });
      const d = await r.json();
      if (d.ok) {
        mostrarAlerta('ok', `DPF aperturado con éxito.\nCertificado: ${d.depositoID}\nInterés neto proyectado: ${fmtUSD(d.interesNetoProyectado)}\nVencimiento: ${d.fechaVencimiento}`);
        setSocioEncontrado(null); setCedulaBuscar(''); setFormTasaID(''); setFormMonto(''); setFormPlazo(''); setFormObs(''); setPreview(null);
        cargarResumen(); cargarDepositos();
        onActiveTabChange('GESTION');
      } else {
        mostrarAlerta('error', d.error || 'Error al aperturar el DPF.');
      }
    } catch { mostrarAlerta('error', 'Error de conexión.'); }
    setLoading(false);
  };

  // ── Liquidar DPF ───────────────────────────────────────────────────────────
  const liquidarDPF = (dpf: DepositoPlazo) => {
    const intEst = parseFloat(dpf.MontoCapital.toString()) * (dpf.TasaNominalAnual / 100) * (dpf.PlazosDias / 365);
    const retEst = intEst * 0.02;
    setConfirmData({
      titulo: 'Confirmar Liquidación al Vencimiento',
      msg: `Certificado: ${dpf.DepositoID}\nSocio: ${dpf.NombreSocio}\nCapital: ${fmtUSD(dpf.MontoCapital)}\nInterés bruto estimado: ${fmtUSD(intEst)}\nRetención 2% LORTI: -${fmtUSD(retEst)}\nInterés neto: ${fmtUSD(intEst - retEst)}\nTotal a acreditar: ${fmtUSD(dpf.MontoCapital + intEst - retEst)}\n\nSe generarán 4 asientos contables SEPS. ¿Confirma?`,
      accion: async () => {
        setConfirmOpen(false);
        try {
          const r = await fetch(`/api/dpf/${dpf.DepositoID}/liquidar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioID: currentUser?.id }) });
          const d = await r.json();
          if (d.ok) {
            mostrarAlerta('ok', `DPF ${dpf.DepositoID} liquidado.\nInterés neto acreditado: ${fmtUSD(d.interesNetoLiquidado)}\nRetención aplicada: ${fmtUSD(d.retencionAplicada)}\nTotal en cuenta del socio: ${fmtUSD(d.totalAcreditado)}`);
            cargarDepositos(); cargarVencimientos(); cargarResumen();
          } else { mostrarAlerta('error', d.error || 'Error al liquidar.'); }
        } catch { mostrarAlerta('error', 'Error de conexión.'); }
      }
    });
    setConfirmOpen(true);
  };

  // ── Cancelar DPF ───────────────────────────────────────────────────────────
  const cancelarDPF = (dpf: DepositoPlazo) => {
    const hoy = new Date(), apertura = new Date(dpf.FechaApertura.split('/').reverse().join('-'));
    const diasTrans = Math.max(0, Math.floor((hoy.getTime() - apertura.getTime()) / 86400000));
    const intBruto  = dpf.MontoCapital * (dpf.TasaNominalAnual / 100) * (diasTrans / 365);
    const penalizacion = intBruto * (dpf.PorcentajePenalizacion / 100);
    const interesNeto  = Math.max(0, intBruto - penalizacion);
    setConfirmData({
      titulo: 'Confirmar Cancelación Anticipada',
      msg: `Certificado: ${dpf.DepositoID}\nSocio: ${dpf.NombreSocio}\nDías transcurridos: ${diasTrans}\nInterés acumulado bruto: ${fmtUSD(intBruto)}\nPenalización ${dpf.PorcentajePenalizacion}%: -${fmtUSD(penalizacion)}\nInterés neto efectivo: ${fmtUSD(interesNeto - interesNeto * 0.02)}\nCapital a devolver: ${fmtUSD(dpf.MontoCapital)}\n\n⚠️ Esta operación aplica penalización por cancelación anticipada. ¿Confirma?`,
      accion: async () => {
        setConfirmOpen(false);
        try {
          const r = await fetch(`/api/dpf/${dpf.DepositoID}/cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioID: currentUser?.id, motivo: 'Cancelación anticipada solicitada por el socio.' }) });
          const d = await r.json();
          if (d.ok) { mostrarAlerta('ok', `DPF cancelado.\nDías transcurridos: ${d.diasTranscurridos}\nPenalización: ${fmtUSD(d.penalizacionAplicada)}\nTotal devuelto: ${fmtUSD(d.totalDevuelto)}`); cargarDepositos(); cargarResumen(); }
          else mostrarAlerta('error', d.error || 'Error al cancelar.');
        } catch { mostrarAlerta('error', 'Error de conexión.'); }
      }
    });
    setConfirmOpen(true);
  };

  // ── Renovar DPF ────────────────────────────────────────────────────────────
  const ejecutarRenovacion = async () => {
    if (!renovarDPF) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/dpf/${renovarDPF.DepositoID}/renovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasaID: renovarTasaID ? parseInt(renovarTasaID) : undefined, plazosDias: renovarPlazo ? parseInt(renovarPlazo) : undefined, usuarioID: currentUser?.id, tipoRenovacion: 'MANUAL' })
      });
      const d = await r.json();
      if (d.ok) {
        mostrarAlerta('ok', `DPF renovado.\nNuevo certificado: ${d.nuevoDepositoID}\nInterés neto anterior acreditado: ${fmtUSD(d.interesLiquidadoAnterior)}\nNuevo interés proyectado: ${fmtUSD(d.nuevoInteresProyectado)}\nNuevo vencimiento: ${d.nuevaFechaVencimiento}`);
        setRenovarDPF(null); cargarDepositos(); cargarResumen();
      } else mostrarAlerta('error', d.error || 'Error al renovar.');
    } catch { mostrarAlerta('error', 'Error de conexión.'); }
    setLoading(false);
  };

  // ── Guardar tasa ───────────────────────────────────────────────────────────
  const guardarTasa = async (tasaID: number) => {
    const cambios = editTasas[tasaID];
    if (!cambios) return;
    setSavingTasa(tasaID);
    try {
      const r = await fetch(`/api/dpf/tasas/${tasaID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cambios, usuarioID: currentUser?.id })
      });
      const d = await r.json();
      if (d.ok) { mostrarAlerta('ok', 'Tasa actualizada correctamente.'); cargarTasas(); setEditTasas(p => { const n = { ...p }; delete n[tasaID]; return n; }); }
      else mostrarAlerta('error', d.error || 'Error al guardar tasa.');
    } catch { mostrarAlerta('error', 'Error de conexión.'); }
    setSavingTasa(null);
  };

  // ── VER DETALLE ────────────────────────────────────────────────────────────
  const verDetalle = async (id: string) => {
    try {
      const r = await fetch(`/api/dpf/${id}`);
      const d = await r.json();
      if (d.ok) setDetalleDPF({ dpf: d.data, asientos: d.asientos });
    } catch { mostrarAlerta('error', 'Error al cargar detalle.'); }
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 min-h-full bg-transparent">

      {/* Header KPIs */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Capital Captado',    value: fmtUSD(resumen.capitalActivo || 0),           icon: <Banknote size={18} />,      color: 'text-emerald-400', glow: 'shadow-emerald-900/50', bg: 'bg-white/[0.05] border-emerald-500/20' },
            { label: 'DPF Activos',        value: resumen.activos || 0,                          icon: <PiggyBank size={18} />,     color: 'text-blue-400',    glow: 'shadow-blue-900/50',    bg: 'bg-white/[0.05] border-blue-500/20'    },
            { label: 'Vencen Hoy',         value: resumen.vencimientosHoy || 0,                  icon: <AlertTriangle size={18} />, color: resumen.vencimientosHoy > 0 ? 'text-amber-400' : 'text-white/20', glow: 'shadow-amber-900/50', bg: resumen.vencimientosHoy > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.03] border-white/[0.06]' },
            { label: 'Interés Proyectado', value: fmtUSD(resumen.interesProyectadoTotal || 0),   icon: <TrendingUp size={18} />,    color: 'text-violet-400',  glow: 'shadow-violet-900/50',  bg: 'bg-white/[0.05] border-violet-500/20' },
          ].map((k, i) => (
            <div key={i} className={`rounded-2xl border p-4 flex items-center gap-3 ${k.bg}`}>
              <div className={`p-2 rounded-xl bg-white/10 shadow-lg ${k.glow} ${k.color}`}>{k.icon}</div>
              <div>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-wide">{k.label}</p>
                <p className={`text-xl font-black tabular-nums ${k.color}`}>{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alerta global */}
      {alerta && (
        <div className={`rounded-2xl p-4 flex items-start gap-3 border ${alerta.tipo === 'ok' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : alerta.tipo === 'warn' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' : 'bg-red-500/15 border-red-500/30 text-red-300'}`}>
          {alerta.tipo === 'ok' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : alerta.tipo === 'warn' ? <AlertTriangle size={18} className="shrink-0 mt-0.5" /> : <XCircle size={18} className="shrink-0 mt-0.5" />}
          <p className="text-sm font-bold whitespace-pre-line">{alerta.msg}</p>
          <button onClick={() => setAlerta(null)} className="ml-auto shrink-0"><X size={16} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white/[0.04] rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl">
        <div className="flex overflow-x-auto border-b border-white/[0.07]">
          {TABS.filter(t => t.id !== 'TASAS' || isAdmin).map(tab => (
            <button key={tab.id} onClick={() => onActiveTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${activeTab === tab.id ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10' : 'border-transparent text-white/35 hover:text-white/70 hover:bg-white/[0.04]'}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">

          {/* ──────────── TAB: GESTIÓN ──────────── */}
          {activeTab === 'GESTION' && (
            <div className="space-y-4">
              {/* Filtros */}
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargarDepositos()} placeholder="Buscar por cédula, nombre o código..." className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/80 placeholder-white/25 focus:outline-none focus:border-emerald-500/50 font-medium" />
                </div>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="px-3 py-2.5 text-sm rounded-xl border border-white/[0.1] bg-white/[0.06] font-bold text-white/70 focus:outline-none focus:border-emerald-500/50">
                  <option value="" className="bg-[#1A2E1C]">Todos los estados</option>
                  {['ACTIVO','VENCIDO','LIQUIDADO','CANCELADO','RENOVADO'].map(e => <option key={e} value={e} className="bg-[#1A2E1C]">{e}</option>)}
                </select>
                <button onClick={cargarDepositos} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600/80 hover:bg-emerald-500 text-white text-sm font-black rounded-xl transition-all shadow-lg shadow-emerald-900/30">
                  <RefreshCw size={15} /> Actualizar
                </button>
              </div>

              {/* Tabla */}
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-300"><RefreshCw size={24} className="animate-spin" /></div>
              ) : depositos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/25">
                  <PiggyBank size={40} className="mb-3 opacity-30" />
                  <p className="font-bold text-sm">No se encontraron Depósitos a Plazo Fijo</p>
                  <button onClick={() => onActiveTabChange('NUEVA')} className="mt-4 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/30"><Plus size={14} />Nueva Inversión</button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/[0.04] text-[10px] font-black text-white/40 uppercase tracking-wider">
                        <th className="px-3 py-3 text-left">Certificado</th>
                        <th className="px-3 py-3 text-left">Socio / Cédula</th>
                        <th className="px-3 py-3 text-right">Capital</th>
                        <th className="px-3 py-3 text-center">Tasa / Plazo</th>
                        <th className="px-3 py-3 text-right">Int. Neto Proy.</th>
                        <th className="px-3 py-3 text-center">Vencimiento</th>
                        <th className="px-3 py-3 text-center">Estado</th>
                        <th className="px-3 py-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depositos.map(d => (
                        <tr key={d.DepositoID} className="border-t border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                          <td className="px-3 py-3">
                            <p className="font-black text-emerald-400 text-xs">{d.DepositoID}</p>
                            {d.NumeroRenovacion > 0 && <span className="text-[9px] text-violet-400 font-bold">Renovación #{d.NumeroRenovacion}</span>}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-bold text-white/80 text-xs truncate max-w-[150px]">{d.NombreSocio}</p>
                            <p className="text-[10px] text-white/35">{d.Identificacion}</p>
                          </td>
                          <td className="px-3 py-3 text-right font-black text-white/80 tabular-nums">{fmtUSD(d.MontoCapital)}</td>
                          <td className="px-3 py-3 text-center">
                            <p className="font-black text-emerald-400 text-xs">{d.TasaNominalAnual}% TNA</p>
                            <p className="text-[10px] text-white/35">{d.PlazosDias} días</p>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-black text-emerald-300 text-xs tabular-nums">{fmtUSD(d.InteresNetoProyectado)}</p>
                            <p className="text-[9px] text-white/30">Ret. {fmtUSD(d.RetencionProyectada)}</p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <p className="font-bold text-xs text-white/60">{d.FechaVencimiento}</p>
                            {d.Estado === 'ACTIVO' && (
                              <p className={`text-[9px] font-black ${d.DiasRestantes <= 0 ? 'text-red-400' : d.DiasRestantes <= 7 ? 'text-amber-400' : 'text-white/30'}`}>
                                {d.DiasRestantes <= 0 ? 'VENCIDO' : `${d.DiasRestantes}d restantes`}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center"><EstadoBadge estado={d.Estado} /></td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => verDetalle(d.DepositoID)} title="Ver detalle" className="p-1.5 rounded-lg text-white/30 hover:text-blue-400 hover:bg-blue-500/10 transition-all"><FileText size={14} /></button>
                              {canOperate && ['ACTIVO','VENCIDO'].includes(d.Estado) && (
                                <>
                                  <button onClick={() => liquidarDPF(d)} title="Liquidar" className="p-1.5 rounded-lg text-white/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"><CheckCircle2 size={14} /></button>
                                  {d.Estado === 'ACTIVO' && <button onClick={() => cancelarDPF(d)} title="Cancelar anticipado" className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"><XCircle size={14} /></button>}
                                  <button onClick={() => { setRenovarDPF(d); setRenovarTasaID(''); setRenovarPlazo(d.PlazosDias.toString()); }} title="Renovar" className="p-1.5 rounded-lg text-white/30 hover:text-violet-400 hover:bg-violet-500/10 transition-all"><RotateCcw size={14} /></button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ──────────── TAB: NUEVA INVERSIÓN ──────────── */}
          {activeTab === 'NUEVA' && (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Formulario */}
              <div className="space-y-5">
                <h3 className="font-black text-emerald-400 text-sm uppercase tracking-wide flex items-center gap-2"><Plus size={16} />Datos del Depósito</h3>

                {/* Búsqueda de socio */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Socio Inversionista</label>
                  <div className="flex gap-2">
                    <input value={cedulaBuscar} onChange={e => setCedulaBuscar(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarSocio()} placeholder="Cédula / RUC del socio" className="flex-1 px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/80 placeholder-white/25 text-sm font-bold focus:outline-none focus:border-emerald-500/50" />
                    <button onClick={buscarSocio} disabled={buscandoSocio} className="px-4 py-3 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-xl font-black text-sm transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-900/30">
                      {buscandoSocio ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                    </button>
                  </div>
                  {socioEncontrado && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                      <div>
                        <p className="font-black text-emerald-300 text-sm">{socioEncontrado.NombreCompleto}</p>
                        <p className="text-xs text-emerald-500/80">CI: {socioEncontrado.Identificacion} {socioEncontrado.SaldoAhorro !== undefined && `· Saldo: ${fmtUSD(socioEncontrado.SaldoAhorro)}`}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tramo de tasa */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Tramo de Plazo</label>
                  <select value={formTasaID} onChange={e => setFormTasaID(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/80 text-sm font-bold focus:outline-none focus:border-emerald-500/50">
                    <option value="" className="bg-[#1A2E1C]">— Seleccione tramo —</option>
                    {tasas.filter(t => t.Activo).map(t => (
                      <option key={t.TasaID} value={t.TasaID} className="bg-[#1A2E1C]">{t.DescripcionRango} → {t.TasaNominalAnual}% TNA (Mín: {fmtUSD(t.MontoMinimo)})</option>
                    ))}
                  </select>
                </div>

                {/* Monto */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Monto a Invertir (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-white/30">$</span>
                    <input type="number" min="0" step="0.01" value={formMonto} onChange={e => setFormMonto(e.target.value)} placeholder="0.00" className="w-full pl-8 pr-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/80 placeholder-white/20 text-sm font-bold focus:outline-none focus:border-emerald-500/50" />
                  </div>
                </div>

                {/* Plazo */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Plazo en Días</label>
                  <input type="number" min="1" value={formPlazo} onChange={e => setFormPlazo(e.target.value)} placeholder="Ej: 90, 180, 360..." className="w-full px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/80 placeholder-white/20 text-sm font-bold focus:outline-none focus:border-emerald-500/50" />
                </div>

                {/* Renovación y Modalidad */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Al Vencimiento</label>
                    <select value={formRenovacion} onChange={e => setFormRenovacion(e.target.value)} className="w-full px-3 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/70 text-sm font-bold focus:outline-none focus:border-emerald-500/50">
                      <option value="NO_RENOVAR" className="bg-[#1A2E1C]">No Renovar</option>
                      <option value="AUTOMATICO" className="bg-[#1A2E1C]">Auto-Renovar</option>
                      <option value="MANUAL" className="bg-[#1A2E1C]">Renovación Manual</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Pago de Interés</label>
                    <select value={formModalidad} onChange={e => setFormModalidad(e.target.value)} className="w-full px-3 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/70 text-sm font-bold focus:outline-none focus:border-emerald-500/50">
                      <option value="AL_VENCIMIENTO" className="bg-[#1A2E1C]">Al Vencimiento</option>
                      <option value="MENSUAL" className="bg-[#1A2E1C]">Mensual</option>
                      <option value="TRIMESTRAL" className="bg-[#1A2E1C]">Trimestral</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Observaciones (opcional)</label>
                  <textarea value={formObs} onChange={e => setFormObs(e.target.value)} rows={2} className="w-full px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/70 placeholder-white/20 text-sm font-medium focus:outline-none focus:border-emerald-500/50 resize-none" placeholder="Instrucciones especiales, procedencia de fondos, etc." />
                </div>

                <button onClick={abrirConfirm} disabled={!socioEncontrado || !preview || loading}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-30 flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/40">
                  <PiggyBank size={18} /> APERTURAR DEPÓSITO A PLAZO FIJO
                </button>
              </div>

              {/* Preview / Simulador */}
              <div className="space-y-4">
                <h3 className="font-black text-white/60 text-sm uppercase tracking-wide flex items-center gap-2"><TrendingUp size={16} className="text-amber-400" />Simulación de Rendimiento</h3>
                {preview ? (
                  <div className="bg-gradient-to-br from-[#14532D] to-emerald-700 rounded-2xl p-6 text-white space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-widest opacity-70">Certificado de Depósito</p>
                      <Shield size={20} className="opacity-50" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-[10px] font-bold opacity-60 uppercase">Capital</p><p className="text-2xl font-black">{fmtUSD(preview.monto)}</p></div>
                      <div><p className="text-[10px] font-bold opacity-60 uppercase">Plazo</p><p className="text-2xl font-black">{preview.dias} días</p></div>
                    </div>
                    <div className="border-t border-white/20 pt-4 grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-[10px] font-bold opacity-60 uppercase">TNA</p><p className="font-black text-[#FACC15]">{preview.tasa.TasaNominalAnual}%</p></div>
                      <div><p className="text-[10px] font-bold opacity-60 uppercase">TEA</p><p className="font-black text-[#FACC15]">{preview.tea.toFixed(3)}%</p></div>
                      <div><p className="text-[10px] font-bold opacity-60 uppercase">Interés Bruto</p><p className="font-black">{fmtUSD(preview.interesBruto)}</p></div>
                      <div><p className="text-[10px] font-bold opacity-60 uppercase">Ret. 2% LORTI</p><p className="font-black text-red-300">-{fmtUSD(preview.retencion)}</p></div>
                    </div>
                    <div className="border-t border-white/20 pt-4">
                      <p className="text-[10px] font-black uppercase opacity-70 mb-1">Interés Neto al Vencimiento</p>
                      <p className="text-3xl font-black text-[#FACC15]">{fmtUSD(preview.interesNeto)}</p>
                    </div>
                    <div className="border-t border-white/20 pt-4 flex items-center justify-between">
                      <div><p className="text-[10px] font-bold opacity-60 uppercase">Total a Recibir</p><p className="text-xl font-black">{fmtUSD(preview.monto + preview.interesNeto)}</p></div>
                      <div className="text-right"><p className="text-[10px] font-bold opacity-60 uppercase">Vence</p><p className="font-black text-sm">{preview.fechaVenc}</p></div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-3 text-[10px] font-bold opacity-80">
                      <p>Cuenta SEPS: {preview.tasa.CuentaContableDPF} — {preview.tasa.DescripcionRango}</p>
                      <p>Penalización cancelación anticipada: {preview.tasa.PorcentajePenalizacion}%</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/[0.03] rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-white/25 border-2 border-dashed border-white/[0.08] min-h-[350px]">
                    <TrendingUp size={36} className="opacity-30" />
                    <p className="font-bold text-sm">Complete los datos para ver la simulación</p>
                  </div>
                )}

                {/* Tabla de tasas vigentes */}
                <div className="bg-white/[0.04] rounded-xl border border-white/[0.07] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Tasas Vigentes — Plan de Cuentas SEPS</p>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="text-[9px] font-black text-white/30 uppercase">{['Tramo','TNA','Cuenta SEPS'].map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
                    <tbody>
                      {tasas.filter(t => t.Activo).map(t => (
                        <tr key={t.TasaID} className={`border-t border-white/[0.04] ${formTasaID === t.TasaID.toString() ? 'bg-emerald-500/10' : ''}`}>
                          <td className="px-3 py-2 font-medium text-white/60">{t.DescripcionRango}</td>
                          <td className="px-3 py-2 font-black text-emerald-400">{t.TasaNominalAnual}%</td>
                          <td className="px-3 py-2 font-mono text-white/35">{t.CuentaContableDPF}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ──────────── TAB: VENCIMIENTOS ──────────── */}
          {activeTab === 'VENCIMIENTOS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-white/70 text-sm uppercase tracking-wide flex items-center gap-2"><Calendar size={16} className="text-amber-400" />DPF por Vencer (próximos 30 días)</h3>
                <button onClick={cargarVencimientos} className="flex items-center gap-2 px-3 py-2 bg-white/[0.06] text-white/50 text-xs font-black rounded-xl hover:bg-white/10 transition-all"><RefreshCw size={13} />Actualizar</button>
              </div>
              {vencimientos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/25">
                  <CheckCircle2 size={40} className="mb-3 opacity-30 text-emerald-400" />
                  <p className="font-bold text-sm">No hay DPF por vencer en los próximos 30 días</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {vencimientos.map(d => {
                    const urgente = d.DiasRestantes <= 0;
                    const proximo = d.DiasRestantes <= 7 && d.DiasRestantes > 0;
                    return (
                      <div key={d.DepositoID} className={`rounded-2xl border p-4 ${urgente ? 'bg-red-500/10 border-red-500/30' : proximo ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.04] border-white/[0.07]'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${urgente ? 'bg-red-500/20 text-red-400' : proximo ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-white/50'}`}>
                                {urgente ? '¡VENCIDO!' : proximo ? `${d.DiasRestantes}d` : `${d.DiasRestantes}d`}
                              </span>
                              <span className="font-black text-[#14532D] text-sm">{d.DepositoID}</span>
                              <EstadoBadge estado={d.Estado} />
                            </div>
                            <p className="font-bold text-white/80 text-sm">{d.NombreSocio}</p>
                            <p className="text-xs text-white/40">{d.Identificacion} · {d.DescripcionRango}</p>
                            <div className="grid grid-cols-3 gap-3 mt-3">
                              <div><p className="text-[9px] text-white/35 font-bold uppercase">Capital</p><p className="font-black text-white/80 tabular-nums">{fmtUSD(d.MontoCapital)}</p></div>
                              <div><p className="text-[9px] text-white/35 font-bold uppercase">Tasa / Plazo</p><p className="font-black text-emerald-400">{d.TasaNominalAnual}% / {d.PlazosDias}d</p></div>
                              <div><p className="text-[9px] text-white/35 font-bold uppercase">Int. Neto</p><p className="font-black text-emerald-300 tabular-nums">{fmtUSD(d.InteresNetoProyectado)}</p></div>
                            </div>
                            <p className="text-[10px] text-white/35 mt-2">Apertura: {d.FechaApertura} · Vence: <strong className="text-white/60">{d.FechaVencimiento}</strong></p>
                          </div>
                          {canOperate && (
                            <div className="flex flex-col gap-2">
                              <button onClick={() => liquidarDPF(d)} className="px-3 py-2 bg-emerald-600 text-white text-xs font-black rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-1.5"><CheckCircle2 size={13} />Liquidar</button>
                              <button onClick={() => { setRenovarDPF(d); setRenovarTasaID(''); setRenovarPlazo(d.PlazosDias.toString()); }} className="px-3 py-2 bg-purple-600 text-white text-xs font-black rounded-xl hover:bg-purple-700 transition-all flex items-center gap-1.5"><RotateCcw size={13} />Renovar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ──────────── TAB: CONFIGURACIÓN TASAS (admin) ──────────── */}
          {activeTab === 'TASAS' && isAdmin && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Settings size={18} className="text-emerald-400" />
                <div>
                  <h3 className="font-black text-white/80 text-sm uppercase">Configuración de Tasas SEPS</h3>
                  <p className="text-[10px] text-white/35">Las tasas no pueden superar el techo BCE referencial. Retención 2% LORTI es fija por ley.</p>
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                <Info size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300/80 font-bold">Las tasas pasivas son reguladas por el BCE (Banco Central del Ecuador). La tasa máxima permitida por tramo se muestra en la columna "Techo BCE". Superarla bloquea el guardado.</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white/[0.04] text-[10px] font-black text-white/40 uppercase tracking-wider">
                      {['Tramo / Cuenta SEPS','Días','Techo BCE','Tasa Activa %','Monto Mín.','Penaliz. %','Activo',''].map(h => <th key={h} className="px-3 py-3 text-left">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tasas.map(t => {
                      const e = editTasas[t.TasaID] || {};
                      const tna = e.TasaNominalAnual !== undefined ? e.TasaNominalAnual : t.TasaNominalAnual;
                      const changed = Object.keys(e).length > 0;
                      return (
                        <tr key={t.TasaID} className={`border-t border-white/[0.04] ${changed ? 'bg-emerald-500/10' : 'hover:bg-white/[0.03]'}`}>
                          <td className="px-3 py-3">
                            <p className="font-black text-white/80 text-xs">{t.DescripcionRango}</p>
                            <p className="font-mono text-[10px] text-white/35">{t.CuentaContableDPF}</p>
                          </td>
                          <td className="px-3 py-3 text-xs text-white/50 font-bold">{t.DiasDesde}–{t.DiasHasta >= 9999 ? '∞' : t.DiasHasta}</td>
                          <td className="px-3 py-3 text-xs font-black text-red-400">{t.TasaMaximaBCE}%</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <input type="number" min="0" max={t.TasaMaximaBCE} step="0.01"
                                value={tna}
                                onChange={ev => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], TasaNominalAnual: parseFloat(ev.target.value) } }))}
                                className={`w-20 px-2 py-1.5 rounded-lg border text-xs font-black focus:outline-none ${parseFloat(tna as any) > t.TasaMaximaBCE ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-white/[0.1] bg-white/[0.06] text-white/80 focus:border-emerald-500/50'}`} />
                              <span className="text-xs text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-400">$</span>
                              <input type="number" min="0" step="1"
                                value={e.MontoMinimo !== undefined ? e.MontoMinimo : t.MontoMinimo}
                                onChange={ev => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], MontoMinimo: parseFloat(ev.target.value) } }))}
                                className="w-20 px-2 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.06] text-white/80 text-xs font-bold focus:outline-none focus:border-emerald-500/50" />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <input type="number" min="0" max="100" step="1"
                                value={e.PorcentajePenalizacion !== undefined ? e.PorcentajePenalizacion : t.PorcentajePenalizacion}
                                onChange={ev => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], PorcentajePenalizacion: parseFloat(ev.target.value) } }))}
                                className="w-16 px-2 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.06] text-white/80 text-xs font-bold focus:outline-none focus:border-emerald-500/50" />
                              <span className="text-xs text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <button onClick={() => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], Activo: !(e.Activo !== undefined ? e.Activo : t.Activo) } }))}
                              className={`w-10 h-5 rounded-full transition-all ${(e.Activo !== undefined ? e.Activo : t.Activo) ? 'bg-emerald-500' : 'bg-slate-200'} relative`}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${(e.Activo !== undefined ? e.Activo : t.Activo) ? 'left-5' : 'left-0.5'}`} />
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            {changed && (
                              <button onClick={() => guardarTasa(t.TasaID)} disabled={savingTasa === t.TasaID}
                                className="px-3 py-1.5 bg-[#14532D] text-white text-xs font-black rounded-lg hover:bg-emerald-800 transition-all disabled:opacity-50 flex items-center gap-1">
                                {savingTasa === t.TasaID ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                Guardar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-4 text-xs text-white/40 font-bold space-y-1">
                <p className="font-black text-white/60 uppercase text-[10px] tracking-widest mb-2">Cuentas del Plan Contable SEPS — Módulo DPF</p>
                <p>2.1.03.05 · Depósitos a Plazo de 1 a 30 días</p>
                <p>2.1.03.10 · Depósitos a Plazo de 31 a 90 días</p>
                <p>2.1.03.15 · Depósitos a Plazo de 91 a 180 días</p>
                <p>2.1.03.20 · Depósitos a Plazo de 181 a 360 días</p>
                <p>2.1.03.25 · Depósitos a Plazo de más de 360 días</p>
                <p>4.1.03.05 · Intereses Causados en Depósitos a Plazo</p>
                <p>2.5.03.05 · Retención 2% Rendimientos Financieros (Art.37 LORTI)</p>
                <p>5.4.90.90 · Penalización por Cancelación Anticipada DPF</p>
              </div>
            </div>
          )}

          {/* ──────────── TAB: CONTABILIDAD ──────────── */}
          {activeTab === 'CONTABILIDAD' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-emerald-400" />
                <h3 className="font-black text-white/80 text-sm uppercase">Registro Contable DPF</h3>
              </div>
              {depositos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-white/25"><FileText size={40} className="mb-3 opacity-30" /><p className="font-bold text-sm">Sin registros para mostrar</p></div>
              ) : (
                <div className="space-y-3">
                  {depositos.filter(d => ['LIQUIDADO','CANCELADO','RENOVADO'].includes(d.Estado) || d.Estado === 'ACTIVO').slice(0, 20).map(d => (
                    <button key={d.DepositoID} onClick={() => verDetalle(d.DepositoID)}
                      className="w-full bg-white/[0.04] rounded-xl border border-white/[0.07] p-4 flex items-center justify-between hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"><FileText size={18} className="text-emerald-400" /></div>
                        <div>
                          <p className="font-black text-emerald-400 text-sm">{d.DepositoID}</p>
                          <p className="text-xs text-white/40">{d.NombreSocio} · {d.FechaApertura}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-black text-white/80 tabular-nums">{fmtUSD(d.MontoCapital)}</p>
                          <p className="text-xs text-white/30">{d.CuentaContableDPF}</p>
                        </div>
                        <EstadoBadge estado={d.Estado} />
                        <ChevronDown size={16} className="text-white/20" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Modal: Detalle DPF + Asientos Contables */}
      {detalleDPF && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2012] border border-white/[0.1] rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-[#0F2012]/95 backdrop-blur-sm rounded-t-3xl border-b border-white/[0.07] px-6 py-4 flex items-center justify-between">
              <div>
                <p className="font-black text-emerald-400 text-lg">{detalleDPF.dpf.DepositoID}</p>
                <p className="text-xs text-white/40">{detalleDPF.dpf.NombreSocio} · {detalleDPF.dpf.Identificacion}</p>
              </div>
              <div className="flex items-center gap-3">
                <EstadoBadge estado={detalleDPF.dpf.Estado} />
                <button onClick={() => setDetalleDPF(null)} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"><X size={18} /></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* Datos del DPF */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Capital', value: fmtUSD(detalleDPF.dpf.MontoCapital) },
                  { label: 'Tasa TNA', value: `${detalleDPF.dpf.TasaNominalAnual}%` },
                  { label: 'Plazo', value: `${detalleDPF.dpf.PlazosDias} días` },
                  { label: 'Tramo', value: detalleDPF.dpf.DescripcionRango },
                  { label: 'Apertura', value: detalleDPF.dpf.FechaAperturaFmt || detalleDPF.dpf.FechaApertura },
                  { label: 'Vencimiento', value: detalleDPF.dpf.FechaVencimientoFmt || detalleDPF.dpf.FechaVencimiento },
                  { label: 'Int. Bruto Proy.', value: fmtUSD(detalleDPF.dpf.InteresProyectado) },
                  { label: 'Ret. 2% LORTI', value: fmtUSD(detalleDPF.dpf.RetencionProyectada) },
                  { label: 'Int. Neto Proy.', value: fmtUSD(detalleDPF.dpf.InteresNetoProyectado) },
                  { label: 'Cuenta SEPS', value: detalleDPF.dpf.CuentaContableDPF },
                  { label: 'Aperturado por', value: detalleDPF.dpf.UsuarioAperturaID },
                  { label: 'Renovaciones', value: detalleDPF.dpf.NumeroRenovacion.toString() },
                ].map((f, i) => (
                  <div key={i} className="bg-white/[0.05] border border-white/[0.07] rounded-xl p-3">
                    <p className="text-[9px] font-black text-white/35 uppercase tracking-widest">{f.label}</p>
                    <p className="font-black text-white/80 text-sm mt-0.5">{f.value}</p>
                  </div>
                ))}
              </div>

              {/* Asientos contables */}
              {detalleDPF.asientos.length > 0 && (
                <div>
                  <p className="font-black text-white/60 text-sm uppercase tracking-wide mb-3 flex items-center gap-2"><FileText size={15} className="text-emerald-400" />Asientos Contables SEPS</p>
                  <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-white/[0.04] text-[9px] font-black text-white/35 uppercase">{['Tipo','Cuenta','Nombre','Debe','Haber','Concepto','Fecha'].map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
                      <tbody>
                        {detalleDPF.asientos.map(a => (
                          <tr key={a.AsientoID} className="border-t border-white/[0.04]">
                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-white/10 text-white/50">{a.TipoOperacion.replace('_', ' ')}</span></td>
                            <td className="px-3 py-2 font-mono text-emerald-400 font-bold">{a.CuentaContable}</td>
                            <td className="px-3 py-2 text-white/50 max-w-[150px] truncate">{a.NombreCuenta}</td>
                            <td className="px-3 py-2 font-black text-right text-white/70 tabular-nums">{a.DebeAmount > 0 ? fmtUSD(a.DebeAmount) : '-'}</td>
                            <td className="px-3 py-2 font-black text-right text-emerald-400 tabular-nums">{a.HaberAmount > 0 ? fmtUSD(a.HaberAmount) : '-'}</td>
                            <td className="px-3 py-2 text-white/35 max-w-[180px] truncate">{a.Concepto}</td>
                            <td className="px-3 py-2 text-white/30">{a.FechaAsiento.slice(0, 10)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-white/[0.1] bg-white/[0.04]">
                          <td colSpan={3} className="px-3 py-2 font-black text-white/50 uppercase text-[10px] tracking-widest">TOTALES</td>
                          <td className="px-3 py-2 font-black text-right text-white/80 tabular-nums">{fmtUSD(detalleDPF.asientos.reduce((s, a) => s + a.DebeAmount, 0))}</td>
                          <td className="px-3 py-2 font-black text-right text-emerald-400 tabular-nums">{fmtUSD(detalleDPF.asientos.reduce((s, a) => s + a.HaberAmount, 0))}</td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Renovar DPF */}
      {renovarDPF && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F2012] border border-white/[0.1] rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-emerald-400 text-lg flex items-center gap-2"><RotateCcw size={20} />Renovar DPF</h3>
              <button onClick={() => setRenovarDPF(null)} className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/80 transition-all"><X size={18} /></button>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="font-black text-emerald-400 text-sm">{renovarDPF.DepositoID}</p>
              <p className="text-xs text-white/50">{renovarDPF.NombreSocio} · Capital: {fmtUSD(renovarDPF.MontoCapital)}</p>
              <p className="text-xs text-white/35">Tasa anterior: {renovarDPF.TasaNominalAnual}% / {renovarDPF.PlazosDias} días</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Nuevo Tramo (vacío = mismo tramo)</label>
              <select value={renovarTasaID} onChange={e => setRenovarTasaID(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/70 text-sm font-bold focus:outline-none focus:border-emerald-500/50">
                <option value="" className="bg-[#1A2E1C]">— Mantener tramo actual —</option>
                {tasas.filter(t => t.Activo).map(t => <option key={t.TasaID} value={t.TasaID} className="bg-[#1A2E1C]">{t.DescripcionRango} → {t.TasaNominalAnual}% TNA</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Nuevo Plazo en Días (vacío = mismo plazo)</label>
              <input type="number" min="1" value={renovarPlazo} onChange={e => setRenovarPlazo(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/80 text-sm font-bold focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRenovarDPF(null)} className="flex-1 py-3 bg-white/[0.06] text-white/60 rounded-2xl font-black text-sm hover:bg-white/10 transition-all">Cancelar</button>
              <button onClick={ejecutarRenovacion} disabled={loading} className="flex-1 py-3 bg-violet-600/80 hover:bg-violet-500 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30">
                {loading ? <RefreshCw size={15} className="animate-spin" /> : <RotateCcw size={15} />} Confirmar Renovación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmación genérica */}
      {confirmOpen && confirmData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-[#0F2012] border border-white/[0.1] rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-900/30"><AlertTriangle size={28} className="text-amber-400" /></div>
              <h3 className="font-black text-white/90 text-base uppercase tracking-tight">{confirmData.titulo}</h3>
              <p className="text-sm text-white/50 font-bold whitespace-pre-line leading-relaxed">{confirmData.msg}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 py-4 bg-white/[0.06] text-white/60 rounded-2xl font-black text-sm hover:bg-white/10 transition-all">Cancelar</button>
              <button onClick={confirmData.accion} className="flex-1 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-2xl font-black text-sm transition-all shadow-lg shadow-emerald-900/40">Confirmar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
