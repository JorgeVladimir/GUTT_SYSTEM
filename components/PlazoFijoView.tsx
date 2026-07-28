import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, PiggyBank, TrendingUp, CheckCircle2, AlertTriangle, XCircle,
  Search, Plus, RefreshCw, FileText, Settings, Calendar, DollarSign,
  ChevronDown, Printer, RotateCcw, Info, X, Banknote, Shield, UserCheck
} from 'lucide-react';
import { UserRole } from '../types';

// ─── Paleta: Rojo vitalidad · Dorado claridad · Naranja prosperidad ───────────
const P = {
  crimson:   '#8B1A1A',  // vitalidad, fuerza
  crimsonHov:'#A52020',
  gold:      '#C9921A',  // claridad, iluminación
  goldLight: '#E8B040',
  orange:    '#D4620A',  // abundancia, prosperidad
  amber:     '#C8960A',  // sabiduría, claridad mental
};

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface TasaPlazoFijo {
  TasaID: number; CodigoRango: string; DescripcionRango: string;
  DiasDesde: number; DiasHasta: number; TasaNominalAnual: number;
  TasaMaximaBCE: number; MontoMinimo: number; MontoMaximo: number | null;
  CuentaContableDPF: string; PorcentajePenalizacion: number;
  Activo: boolean; FechaVigencia: string;
}

interface DepositoPlazo {
  DepositoID: string; Identificacion: string; NombreSocio: string;
  MontoCapital: number; TasaNominalAnual: number; PlazosDias: number;
  InteresProyectado: number; RetencionProyectada: number; InteresNetoProyectado: number;
  Estado: 'ACTIVO' | 'VENCIDO' | 'LIQUIDADO' | 'CANCELADO' | 'RENOVADO';
  TipoRenovacion: string; ModalidadPago: string; CuentaContableDPF: string;
  NumCertificado: string; NumeroRenovacion: number;
  FechaApertura: string; FechaVencimiento: string;
  FechaAperturaFmt?: string; FechaVencimientoFmt?: string; FechaLiquidacion?: string;
  DiasRestantes: number; DescripcionRango: string; PorcentajePenalizacion: number;
  InteresLiquidado?: number; RetencionAplicada?: number;
  InteresNetoLiquidado?: number; PenalizacionAplicada?: number; UsuarioAperturaID: string;
}

interface AsientoContable {
  AsientoID: number; TipoOperacion: string; CuentaContable: string;
  NombreCuenta: string; DebeAmount: number; HaberAmount: number;
  Concepto: string; FechaAsiento: string; UsuarioID: string;
}

interface SocioResult {
  SOCIOID: number; Identificacion: string; NombreCompleto: string;
  NumeroSocio?: string; NroCuenta?: string; SaldoAhorro?: number;
}

interface Props {
  currentUser?: { id: string; role: UserRole; name: string };
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt    = (n: number) => new Intl.NumberFormat('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
const fmtUSD = (n: number) => `$${fmt(n)}`;

const mapSocioFromApi = (s: any): SocioResult => ({
  SOCIOID:       parseInt(s.socioId || s.SOCIOID || '0'),
  Identificacion: s.id || s.Identificacion || '',
  NombreCompleto: s.name || `${s.PrimerNombre || ''} ${s.Apellidos || s.PrimerApellido || ''}`.trim(),
  NumeroSocio:   s.memberNumber || s.NumeroSocio || '',
  NroCuenta:     (s.accounts || []).find((a: any) => a.type === 'AHORRO_VISTA')?.number,
  SaldoAhorro:   (s.accounts || []).find((a: any) => a.type === 'AHORRO_VISTA')?.balance ?? 0,
});

const ESTADO_CONFIG = {
  ACTIVO:    { label: 'ACTIVO',    bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  VENCIDO:   { label: 'VENCIDO',   bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  LIQUIDADO: { label: 'LIQUIDADO', bg: 'bg-slate-100',  text: 'text-slate-500', dot: 'bg-slate-400'  },
  CANCELADO: { label: 'CANCELADO', bg: 'bg-red-50',     text: 'text-red-700',   dot: 'bg-red-500'    },
  RENOVADO:  { label: 'RENOVADO',  bg: 'bg-amber-50',   text: 'text-amber-700', dot: 'bg-amber-500'  },
};

const EstadoBadge = ({ estado }: { estado: string }) => {
  const c = ESTADO_CONFIG[estado as keyof typeof ESTADO_CONFIG] || { label: estado, bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-300' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />{c.label}
    </span>
  );
};

const TABS = [
  { id: 'GESTION',      label: 'Gestión DPF',    icon: <PiggyBank size={15} />  },
  { id: 'NUEVA',        label: 'Nueva Inversión', icon: <Plus size={15} />       },
  { id: 'VENCIMIENTOS', label: 'Vencimientos',    icon: <Calendar size={15} />   },
  { id: 'TASAS',        label: 'Config. Tasas',   icon: <Settings size={15} />   },
  { id: 'CONTABILIDAD', label: 'Contabilidad',    icon: <FileText size={15} />   },
];

// ─── Componente principal ──────────────────────────────────────────────────────
export const PlazoFijoView: React.FC<Props> = ({ currentUser, activeTab, onActiveTabChange }) => {
  const isAdmin    = currentUser?.role === UserRole.ADMIN || currentUser?.role === UserRole.SUPER_USER;
  const canOperate = isAdmin || currentUser?.role === UserRole.TELLER || currentUser?.role === UserRole.MANAGER;

  // Estado global
  const [tasas, setTasas]                 = useState<TasaPlazoFijo[]>([]);
  const [depositos, setDepositos]         = useState<DepositoPlazo[]>([]);
  const [vencimientos, setVencimientos]   = useState<DepositoPlazo[]>([]);
  const [resumen, setResumen]             = useState<any>(null);
  const [loading, setLoading]             = useState(false);
  const [alerta, setAlerta]               = useState<{ tipo: 'ok' | 'error' | 'warn'; msg: string } | null>(null);
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [detalleDPF, setDetalleDPF]       = useState<{ dpf: DepositoPlazo; asientos: AsientoContable[] } | null>(null);

  // Formulario nueva inversión
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [buscandoSocio, setBuscandoSocio]     = useState(false);
  const [resultadosSocio, setResultadosSocio] = useState<SocioResult[]>([]);
  const [socioSeleccionado, setSocioSeleccionado] = useState<SocioResult | null>(null);
  const [formTasaID, setFormTasaID]         = useState('');
  const [formMonto, setFormMonto]           = useState('');
  const [formPlazo, setFormPlazo]           = useState('');
  const [formRenovacion, setFormRenovacion] = useState('NO_RENOVAR');
  const [formModalidad, setFormModalidad]   = useState('AL_VENCIMIENTO');
  const [formObs, setFormObs]               = useState('');
  const [preview, setPreview]               = useState<any>(null);
  const [confirmOpen, setConfirmOpen]       = useState(false);
  const [confirmData, setConfirmData]       = useState<{ titulo: string; msg: string; accion: () => void } | null>(null);

  // Config tasas
  const [editTasas, setEditTasas]   = useState<Record<number, Partial<TasaPlazoFijo>>>({});
  const [savingTasa, setSavingTasa] = useState<number | null>(null);

  // Modal renovación
  const [renovarDPF, setRenovarDPF]     = useState<DepositoPlazo | null>(null);
  const [renovarTasaID, setRenovarTasaID] = useState('');
  const [renovarPlazo, setRenovarPlazo] = useState('');

  const mostrarAlerta = (tipo: 'ok' | 'error' | 'warn', msg: string) => {
    setAlerta({ tipo, msg });
    setTimeout(() => setAlerta(null), 7000);
  };

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const cargarTasas = useCallback(async () => {
    try { const r = await fetch('/api/dpf/tasas'); const d = await r.json(); if (d.ok) setTasas(d.data); } catch {}
  }, []);

  const cargarDepositos = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filtroEstado)   p.set('estado', filtroEstado);
      if (filtroBusqueda) p.set('busqueda', filtroBusqueda);
      const r = await fetch(`/api/dpf?${p.toString()}`);
      const d = await r.json();
      if (d.ok) setDepositos(d.data);
    } catch {}
    setLoading(false);
  }, [filtroEstado, filtroBusqueda]);

  const cargarVencimientos = useCallback(async () => {
    try { const r = await fetch('/api/dpf/vencimientos?dias=30'); const d = await r.json(); if (d.ok) setVencimientos(d.data); } catch {}
  }, []);

  const cargarResumen = useCallback(async () => {
    try { const r = await fetch('/api/dpf/resumen'); const d = await r.json(); if (d.ok) setResumen(d.data); } catch {}
  }, []);

  useEffect(() => { cargarTasas(); cargarResumen(); }, []);
  useEffect(() => { if (activeTab === 'GESTION' || activeTab === 'CONTABILIDAD') cargarDepositos(); }, [activeTab, filtroEstado, filtroBusqueda]);
  useEffect(() => { if (activeTab === 'VENCIMIENTOS') cargarVencimientos(); }, [activeTab]);

  // Cálculo de preview (solo cuando hay socio seleccionado)
  useEffect(() => {
    if (!formTasaID || !formMonto || !formPlazo || !socioSeleccionado) { setPreview(null); return; }
    const tasa = tasas.find(t => t.TasaID === parseInt(formTasaID));
    if (!tasa) { setPreview(null); return; }
    const monto = parseFloat(formMonto), dias = parseInt(formPlazo);
    if (isNaN(monto) || isNaN(dias) || monto <= 0 || dias < 1) { setPreview(null); return; }
    const interesBruto = monto * (tasa.TasaNominalAnual / 100) * (dias / 365);
    const retencion    = interesBruto * 0.02;
    const interesNeto  = interesBruto - retencion;
    const fechaVenc    = new Date(); fechaVenc.setDate(fechaVenc.getDate() + dias);
    const tea          = (Math.pow(1 + (tasa.TasaNominalAnual / 100) * (dias / 365), 365 / dias) - 1) * 100;
    setPreview({ interesBruto, retencion, interesNeto, fechaVenc: fechaVenc.toLocaleDateString('es-EC'), tea, tasa, monto, dias });
  }, [formTasaID, formMonto, formPlazo, tasas, socioSeleccionado]);

  // ── Buscar socios (por cédula, nombre, apellido, número de socio) ───────────
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
  };

  const limpiarSocio = () => {
    setSocioSeleccionado(null);
    setResultadosSocio([]);
    setTerminoBusqueda('');
    setFormTasaID(''); setFormMonto(''); setFormPlazo(''); setFormObs(''); setPreview(null);
  };

  // ── Apertura DPF ────────────────────────────────────────────────────────────
  const abrirConfirm = () => {
    if (!socioSeleccionado || !preview) return;
    const tasa = tasas.find(t => t.TasaID === parseInt(formTasaID))!;
    setConfirmData({
      titulo: 'Confirmar Apertura de DPF',
      msg: `Socio: ${socioSeleccionado.NombreCompleto}\nCédula: ${socioSeleccionado.Identificacion}${socioSeleccionado.NumeroSocio ? `\nN° Socio: ${socioSeleccionado.NumeroSocio}` : ''}\n\nMonto: ${fmtUSD(preview.monto)}\nPlazo: ${preview.dias} días (${tasa.DescripcionRango})\nTasa: ${tasa.TasaNominalAnual}% TNA · TEA: ${preview.tea.toFixed(2)}%\nInterés bruto: ${fmtUSD(preview.interesBruto)}\nRetención 2% (LORTI Art.37): -${fmtUSD(preview.retencion)}\nInterés neto al vencimiento: ${fmtUSD(preview.interesNeto)}\nVence: ${preview.fechaVenc}\n\n¿Desea aperturar este DPF?`,
      accion: aperturarDPF,
    });
    setConfirmOpen(true);
  };

  const aperturarDPF = async () => {
    setConfirmOpen(false);
    if (!socioSeleccionado || !preview) return;
    setLoading(true);
    try {
      const r = await fetch('/api/dpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          socioid:                  socioSeleccionado.SOCIOID,
          identificacion:           socioSeleccionado.Identificacion,
          nombreSocio:              socioSeleccionado.NombreCompleto,
          tasaID:                   parseInt(formTasaID),
          montoCapital:             parseFloat(formMonto),
          plazosDias:               parseInt(formPlazo),
          tipoRenovacion:           formRenovacion,
          modalidadPago:            formModalidad,
          cuentaAhorrosRelacionada: socioSeleccionado.NroCuenta || null,
          observaciones:            formObs || null,
          usuarioID:                currentUser?.id,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        mostrarAlerta('ok', `✓ DPF aperturado con éxito.\nCertificado: ${d.depositoID}\nInterés neto proyectado: ${fmtUSD(d.interesNetoProyectado)}\nVencimiento: ${d.fechaVencimiento}`);
        limpiarSocio();
        cargarResumen(); cargarDepositos();
        onActiveTabChange('GESTION');
      } else {
        mostrarAlerta('error', d.error || 'Error al aperturar el DPF.');
      }
    } catch { mostrarAlerta('error', 'Error de conexión.'); }
    setLoading(false);
  };

  // ── Liquidar DPF ────────────────────────────────────────────────────────────
  const liquidarDPF = (dpf: DepositoPlazo) => {
    const intEst = dpf.MontoCapital * (dpf.TasaNominalAnual / 100) * (dpf.PlazosDias / 365);
    const retEst = intEst * 0.02;
    setConfirmData({
      titulo: 'Confirmar Liquidación al Vencimiento',
      msg: `Certificado: ${dpf.DepositoID}\nSocio: ${dpf.NombreSocio}\nCapital: ${fmtUSD(dpf.MontoCapital)}\nInterés bruto: ${fmtUSD(intEst)}\nRetención 2% LORTI: -${fmtUSD(retEst)}\nInterés neto: ${fmtUSD(intEst - retEst)}\nTotal a acreditar: ${fmtUSD(dpf.MontoCapital + intEst - retEst)}\n\nSe generarán 4 asientos contables SEPS. ¿Confirma?`,
      accion: async () => {
        setConfirmOpen(false);
        try {
          const r = await fetch(`/api/dpf/${dpf.DepositoID}/liquidar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioID: currentUser?.id }) });
          const d = await r.json();
          if (d.ok) { mostrarAlerta('ok', `DPF ${dpf.DepositoID} liquidado.\nInterés neto: ${fmtUSD(d.interesNetoLiquidado)}\nTotal acreditado: ${fmtUSD(d.totalAcreditado)}`); cargarDepositos(); cargarVencimientos(); cargarResumen(); }
          else mostrarAlerta('error', d.error || 'Error al liquidar.');
        } catch { mostrarAlerta('error', 'Error de conexión.'); }
      },
    });
    setConfirmOpen(true);
  };

  // ── Cancelar DPF ────────────────────────────────────────────────────────────
  const cancelarDPF = (dpf: DepositoPlazo) => {
    const hoy = new Date(), apertura = new Date(dpf.FechaApertura.split('/').reverse().join('-'));
    const diasTrans  = Math.max(0, Math.floor((hoy.getTime() - apertura.getTime()) / 86400000));
    const intBruto   = dpf.MontoCapital * (dpf.TasaNominalAnual / 100) * (diasTrans / 365);
    const penalizacion = intBruto * (dpf.PorcentajePenalizacion / 100);
    const interesNeto  = Math.max(0, intBruto - penalizacion);
    setConfirmData({
      titulo: 'Confirmar Cancelación Anticipada',
      msg: `Certificado: ${dpf.DepositoID}\nSocio: ${dpf.NombreSocio}\nDías transcurridos: ${diasTrans}\nInterés bruto acumulado: ${fmtUSD(intBruto)}\nPenalización ${dpf.PorcentajePenalizacion}%: -${fmtUSD(penalizacion)}\nInterés neto efectivo: ${fmtUSD(interesNeto - interesNeto * 0.02)}\nCapital a devolver: ${fmtUSD(dpf.MontoCapital)}\n\n⚠ Aplica penalización por cancelación anticipada. ¿Confirma?`,
      accion: async () => {
        setConfirmOpen(false);
        try {
          const r = await fetch(`/api/dpf/${dpf.DepositoID}/cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuarioID: currentUser?.id, motivo: 'Cancelación anticipada solicitada por el socio.' }) });
          const d = await r.json();
          if (d.ok) { mostrarAlerta('ok', `DPF cancelado.\nPenalización: ${fmtUSD(d.penalizacionAplicada)}\nTotal devuelto: ${fmtUSD(d.totalDevuelto)}`); cargarDepositos(); cargarResumen(); }
          else mostrarAlerta('error', d.error || 'Error al cancelar.');
        } catch { mostrarAlerta('error', 'Error de conexión.'); }
      },
    });
    setConfirmOpen(true);
  };

  // ── Renovar DPF ─────────────────────────────────────────────────────────────
  const ejecutarRenovacion = async () => {
    if (!renovarDPF) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/dpf/${renovarDPF.DepositoID}/renovar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasaID: renovarTasaID ? parseInt(renovarTasaID) : undefined, plazosDias: renovarPlazo ? parseInt(renovarPlazo) : undefined, usuarioID: currentUser?.id, tipoRenovacion: 'MANUAL' }),
      });
      const d = await r.json();
      if (d.ok) {
        mostrarAlerta('ok', `DPF renovado.\nNuevo certificado: ${d.nuevoDepositoID}\nInterés anterior acreditado: ${fmtUSD(d.interesLiquidadoAnterior)}\nNuevo interés proyectado: ${fmtUSD(d.nuevoInteresProyectado)}`);
        setRenovarDPF(null); cargarDepositos(); cargarResumen();
      } else mostrarAlerta('error', d.error || 'Error al renovar.');
    } catch { mostrarAlerta('error', 'Error de conexión.'); }
    setLoading(false);
  };

  // ── Guardar tasa ─────────────────────────────────────────────────────────────
  const guardarTasa = async (tasaID: number) => {
    const cambios = editTasas[tasaID]; if (!cambios) return;
    setSavingTasa(tasaID);
    try {
      const r = await fetch(`/api/dpf/tasas/${tasaID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cambios, usuarioID: currentUser?.id }) });
      const d = await r.json();
      if (d.ok) { mostrarAlerta('ok', 'Tasa actualizada.'); cargarTasas(); setEditTasas(p => { const n = { ...p }; delete n[tasaID]; return n; }); }
      else mostrarAlerta('error', d.error || 'Error al guardar tasa.');
    } catch { mostrarAlerta('error', 'Error de conexión.'); }
    setSavingTasa(null);
  };

  const verDetalle = async (id: string) => {
    try {
      const r = await fetch(`/api/dpf/${id}`);
      const d = await r.json();
      if (d.ok) setDetalleDPF({ dpf: d.data, asientos: d.asientos });
    } catch { mostrarAlerta('error', 'Error al cargar detalle.'); }
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 min-h-full bg-transparent">

      {/* ── KPIs ── */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Capital Captado',    value: fmtUSD(resumen.capitalActivo || 0),         icon: <Banknote size={18} />,      color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
            { label: 'DPF Activos',        value: resumen.activos || 0,                        icon: <PiggyBank size={18} />,     color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
            { label: 'Vencen Hoy',         value: resumen.vencimientosHoy || 0,                icon: <AlertTriangle size={18} />, color: resumen.vencimientosHoy > 0 ? 'text-red-600' : 'text-slate-300', bg: resumen.vencimientosHoy > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100' },
            { label: 'Interés Proyectado', value: fmtUSD(resumen.interesProyectadoTotal || 0), icon: <TrendingUp size={18} />,    color: 'text-amber-700', bg: 'bg-red-50 border-red-200' },
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
      )}

      {/* ── Alerta global ── */}
      {alerta && (
        <div className={`rounded-2xl p-4 flex items-start gap-3 border ${
          alerta.tipo === 'ok'   ? 'bg-amber-50 border-amber-200 text-amber-700' :
          alerta.tipo === 'warn' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                   'bg-red-50 border-red-200 text-red-700'}`}>
          {alerta.tipo === 'ok' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : alerta.tipo === 'warn' ? <AlertTriangle size={18} className="shrink-0 mt-0.5" /> : <XCircle size={18} className="shrink-0 mt-0.5" />}
          <p className="text-sm font-bold whitespace-pre-line flex-1">{alerta.msg}</p>
          <button onClick={() => setAlerta(null)}><X size={16} /></button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="flex overflow-x-auto border-b border-slate-200">
          {TABS.filter(t => t.id !== 'TASAS' || isAdmin).map(tab => (
            <button key={tab.id} onClick={() => onActiveTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-700 bg-amber-50'
                  : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">

          {/* ──────── GESTIÓN ──────── */}
          {activeTab === 'GESTION' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={filtroBusqueda} onChange={e => setFiltroBusqueda(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && cargarDepositos()}
                    placeholder="Buscar por cédula, nombre o código..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-400 font-medium" />
                </div>
                <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                  className="px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white font-bold text-slate-700 focus:outline-none focus:border-amber-400">
                  <option value="">Todos los estados</option>
                  {['ACTIVO','VENCIDO','LIQUIDADO','CANCELADO','RENOVADO'].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <button onClick={cargarDepositos}
                  className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-black rounded-xl transition-all shadow-lg"
                  style={{ background: P.crimson }}>
                  <RefreshCw size={15} /> Actualizar
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16"><RefreshCw size={24} className="animate-spin text-amber-600" /></div>
              ) : depositos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <PiggyBank size={40} className="mb-3 opacity-40" />
                  <p className="font-bold text-sm">No se encontraron Depósitos a Plazo Fijo</p>
                  <button onClick={() => onActiveTabChange('NUEVA')}
                    className="mt-4 px-4 py-2 text-white text-xs font-black rounded-xl transition-all flex items-center gap-2 shadow-lg"
                    style={{ background: P.crimson }}>
                    <Plus size={14} />Nueva Inversión
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        {['Certificado','Socio / Cédula','Capital','Tasa / Plazo','Int. Neto Proy.','Vencimiento','Estado','Acciones'].map(h => (
                          <th key={h} className={`px-3 py-3 ${['Capital','Int. Neto Proy.'].includes(h) ? 'text-right' : 'text-center' === h ? 'text-center' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {depositos.map(d => (
                        <tr key={d.DepositoID} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-3">
                            <p className="font-black text-amber-700 text-xs">{d.DepositoID}</p>
                            {d.NumeroRenovacion > 0 && <span className="text-[9px] text-orange-600 font-bold">Renovación #{d.NumeroRenovacion}</span>}
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-bold text-slate-800 text-xs truncate max-w-[150px]">{d.NombreSocio}</p>
                            <p className="text-[10px] text-slate-400">{d.Identificacion}</p>
                          </td>
                          <td className="px-3 py-3 text-right font-black text-slate-800 tabular-nums">{fmtUSD(d.MontoCapital)}</td>
                          <td className="px-3 py-3 text-center">
                            <p className="font-black text-amber-700 text-xs">{d.TasaNominalAnual}% TNA</p>
                            <p className="text-[10px] text-slate-400">{d.PlazosDias} días</p>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <p className="font-black text-amber-700 text-xs tabular-nums">{fmtUSD(d.InteresNetoProyectado)}</p>
                            <p className="text-[9px] text-slate-400">Ret. {fmtUSD(d.RetencionProyectada)}</p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <p className="font-bold text-xs text-slate-600">{d.FechaVencimiento}</p>
                            {d.Estado === 'ACTIVO' && (
                              <p className={`text-[9px] font-black ${d.DiasRestantes <= 0 ? 'text-red-600' : d.DiasRestantes <= 7 ? 'text-orange-600' : 'text-slate-400'}`}>
                                {d.DiasRestantes <= 0 ? 'VENCIDO' : `${d.DiasRestantes}d restantes`}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center"><EstadoBadge estado={d.Estado} /></td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => verDetalle(d.DepositoID)} title="Ver detalle"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-all"><FileText size={14} /></button>
                              {canOperate && ['ACTIVO','VENCIDO'].includes(d.Estado) && (
                                <>
                                  <button onClick={() => liquidarDPF(d)} title="Liquidar"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-all"><CheckCircle2 size={14} /></button>
                                  {d.Estado === 'ACTIVO' && (
                                    <button onClick={() => cancelarDPF(d)} title="Cancelar anticipado"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"><XCircle size={14} /></button>
                                  )}
                                  <button onClick={() => { setRenovarDPF(d); setRenovarTasaID(''); setRenovarPlazo(d.PlazosDias.toString()); }} title="Renovar"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-all"><RotateCcw size={14} /></button>
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

          {/* ──────── NUEVA INVERSIÓN ──────── */}
          {activeTab === 'NUEVA' && (
            <div className="space-y-6">

              {/* PASO 1: Búsqueda de socio */}
              <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: socioSeleccionado ? '#C9921A' : '#e2e8f0', background: socioSeleccionado ? '#FEF3C7' : '#ffffff' }}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: P.crimson }}>1</div>
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Buscar Socio Inversionista</h3>
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
                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm font-bold focus:outline-none focus:border-amber-400"
                      />
                      <button onClick={buscarSocio} disabled={buscandoSocio || !terminoBusqueda.trim()}
                        className="px-5 py-3 text-white rounded-xl font-black text-sm transition-all disabled:opacity-40 flex items-center gap-2 shadow-lg"
                        style={{ background: P.crimson }}>
                        {buscandoSocio ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
                        Buscar
                      </button>
                    </div>

                    {/* Lista de resultados */}
                    {resultadosSocio.length > 0 && (
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{resultadosSocio.length} resultado(s) — seleccione el socio:</p>
                        {resultadosSocio.map((s, i) => (
                          <button key={i} onClick={() => seleccionarSocio(s)}
                            className="w-full rounded-xl border border-slate-200 bg-white hover:border-amber-400 hover:bg-amber-50 transition-all p-4 text-left shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white shrink-0"
                                style={{ background: P.crimson }}>
                                {s.NombreCompleto.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-slate-800 text-sm truncate">{s.NombreCompleto}</p>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                                  <span className="text-[10px] text-slate-500 font-bold">CI: {s.Identificacion}</span>
                                  {s.NumeroSocio && <span className="text-[10px] text-amber-700 font-bold">N° Socio: {s.NumeroSocio}</span>}
                                  {s.SaldoAhorro !== undefined && <span className="text-[10px] text-slate-400 font-bold">Saldo: {fmtUSD(s.SaldoAhorro)}</span>}
                                </div>
                              </div>
                              <UserCheck size={16} className="text-amber-600 shrink-0 opacity-70" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  /* Socio seleccionado */
                  <div className="rounded-xl border p-4 flex items-center gap-4" style={{ borderColor: '#C9921A', background: '#FEF9EC' }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-lg text-white shrink-0 shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${P.crimson}, ${P.gold})` }}>
                      {socioSeleccionado.NombreCompleto.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-amber-700 text-base truncate">{socioSeleccionado.NombreCompleto}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        <span className="text-xs text-slate-600 font-bold">Cédula: <span className="text-slate-800">{socioSeleccionado.Identificacion}</span></span>
                        {socioSeleccionado.NumeroSocio && (
                          <span className="text-xs text-slate-600 font-bold">N° Socio: <span className="text-amber-700">{socioSeleccionado.NumeroSocio}</span></span>
                        )}
                        {socioSeleccionado.NroCuenta && (
                          <span className="text-xs text-slate-600 font-bold">Cta. Ahorro: <span className="text-slate-700">{socioSeleccionado.NroCuenta}</span></span>
                        )}
                        {socioSeleccionado.SaldoAhorro !== undefined && (
                          <span className="text-xs text-slate-600 font-bold">Saldo: <span className="text-amber-700 tabular-nums">{fmtUSD(socioSeleccionado.SaldoAhorro)}</span></span>
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

              {/* PASO 2: Configuración del depósito (solo si hay socio) */}
              {socioSeleccionado && (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Formulario */}
                  <div className="space-y-5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: P.gold }}>2</div>
                      <h3 className="font-black text-amber-700 text-sm uppercase tracking-wide">Configurar Inversión</h3>
                    </div>

                    {/* Tramo */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tramo de Plazo *</label>
                      <select value={formTasaID} onChange={e => setFormTasaID(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold focus:outline-none focus:border-amber-400">
                        <option value="">— Seleccione tramo —</option>
                        {tasas.filter(t => t.Activo).map(t => (
                          <option key={t.TasaID} value={t.TasaID}>
                            {t.DescripcionRango} → {t.TasaNominalAnual}% TNA (Mín: {fmtUSD(t.MontoMinimo)})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Monto */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Monto a Invertir (USD) *</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                        <input type="number" min="0" step="0.01" value={formMonto} onChange={e => setFormMonto(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm font-bold focus:outline-none focus:border-amber-400" />
                      </div>
                    </div>

                    {/* Plazo */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Plazo en Días *</label>
                      <input type="number" min="1" value={formPlazo} onChange={e => setFormPlazo(e.target.value)}
                        placeholder="Ej: 90, 180, 360..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm font-bold focus:outline-none focus:border-amber-400" />
                    </div>

                    {/* Renovación y Modalidad */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Al Vencimiento</label>
                        <select value={formRenovacion} onChange={e => setFormRenovacion(e.target.value)}
                          className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold focus:outline-none focus:border-amber-400">
                          <option value="NO_RENOVAR">No Renovar</option>
                          <option value="AUTOMATICO">Auto-Renovar</option>
                          <option value="MANUAL">Renovación Manual</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pago de Interés</label>
                        <select value={formModalidad} onChange={e => setFormModalidad(e.target.value)}
                          className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold focus:outline-none focus:border-amber-400">
                          <option value="AL_VENCIMIENTO">Al Vencimiento</option>
                          <option value="MENSUAL">Mensual</option>
                          <option value="TRIMESTRAL">Trimestral</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Observaciones (opcional)</label>
                      <textarea value={formObs} onChange={e => setFormObs(e.target.value)} rows={2}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 placeholder-slate-400 text-sm font-medium focus:outline-none focus:border-amber-400 resize-none"
                        placeholder="Instrucciones especiales, procedencia de fondos, etc." />
                    </div>

                    <button onClick={abrirConfirm} disabled={!preview || loading}
                      className="w-full py-4 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-30 flex items-center justify-center gap-3 shadow-xl"
                      style={{ background: `linear-gradient(135deg, ${P.crimson}, #6B1010)` }}>
                      <PiggyBank size={18} /> APERTURAR DEPÓSITO A PLAZO FIJO
                    </button>
                  </div>

                  {/* Simulador */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: P.orange }}>3</div>
                      <h3 className="font-black text-orange-700 text-sm uppercase tracking-wide">Simulación de Rendimiento</h3>
                    </div>
                    {preview ? (
                      <div className="rounded-2xl border-2 p-6 space-y-4 shadow-lg bg-white" style={{ borderColor: P.crimson }}>
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-[10px] font-black uppercase tracking-widest"
                            style={{ background: `linear-gradient(135deg, ${P.crimson}, ${P.gold})` }}>
                            <Shield size={13} /> Certificado de Depósito
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div><p className="text-[10px] font-bold text-slate-400 uppercase">Capital</p><p className="text-2xl font-black text-slate-800 tabular-nums">{fmtUSD(preview.monto)}</p></div>
                          <div><p className="text-[10px] font-bold text-slate-400 uppercase">Plazo</p><p className="text-2xl font-black text-slate-800">{preview.dias} días</p></div>
                        </div>
                        <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-3 text-sm">
                          <div><p className="text-[10px] font-bold text-slate-400 uppercase">TNA</p><p className="font-black" style={{ color: P.gold }}>{preview.tasa.TasaNominalAnual}%</p></div>
                          <div><p className="text-[10px] font-bold text-slate-400 uppercase">TEA</p><p className="font-black" style={{ color: P.gold }}>{preview.tea.toFixed(3)}%</p></div>
                          <div><p className="text-[10px] font-bold text-slate-400 uppercase">Interés Bruto</p><p className="font-black text-slate-800 tabular-nums">{fmtUSD(preview.interesBruto)}</p></div>
                          <div><p className="text-[10px] font-bold text-slate-400 uppercase">Ret. 2% LORTI</p><p className="font-black text-red-600 tabular-nums">-{fmtUSD(preview.retencion)}</p></div>
                        </div>
                        <div className="border-t border-slate-100 pt-4">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Interés Neto al Vencimiento</p>
                          <p className="text-3xl font-black tabular-nums" style={{ color: P.gold }}>{fmtUSD(preview.interesNeto)}</p>
                        </div>
                        <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                          <div><p className="text-[10px] font-bold text-slate-400 uppercase">Total a Recibir</p><p className="text-xl font-black text-slate-800 tabular-nums">{fmtUSD(preview.monto + preview.interesNeto)}</p></div>
                          <div className="text-right"><p className="text-[10px] font-bold text-slate-400 uppercase">Vence</p><p className="font-black text-sm text-slate-800">{preview.fechaVenc}</p></div>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[10px] font-bold text-slate-500">
                          <p>Cuenta SEPS: {preview.tasa.CuentaContableDPF} — {preview.tasa.DescripcionRango}</p>
                          <p>Penalización cancelación anticipada: {preview.tasa.PorcentajePenalizacion}%</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-slate-400 border-2 border-dashed border-slate-200 bg-slate-50/50 min-h-[300px]">
                        <TrendingUp size={36} className="opacity-40" />
                        <p className="font-bold text-sm">Complete los datos para ver la simulación</p>
                      </div>
                    )}

                    {/* Tabla tasas vigentes */}
                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-4 py-3 border-b border-slate-200">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tasas Vigentes — Plan Contable SEPS</p>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[9px] font-black text-slate-400 uppercase">
                            {['Tramo','TNA','Cuenta SEPS'].map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {tasas.filter(t => t.Activo).map(t => (
                            <tr key={t.TasaID} className={`border-t border-slate-100 ${formTasaID === t.TasaID.toString() ? 'bg-amber-50' : ''}`}>
                              <td className="px-3 py-2 font-medium text-slate-600">{t.DescripcionRango}</td>
                              <td className="px-3 py-2 font-black text-amber-700">{t.TasaNominalAnual}%</td>
                              <td className="px-3 py-2 font-mono text-slate-400">{t.CuentaContableDPF}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ──────── VENCIMIENTOS ──────── */}
          {activeTab === 'VENCIMIENTOS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                  <Calendar size={16} className="text-orange-600" />DPF por Vencer (próximos 30 días)
                </h3>
                <button onClick={cargarVencimientos}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-500 text-xs font-black rounded-xl hover:bg-slate-200 transition-all">
                  <RefreshCw size={13} />Actualizar
                </button>
              </div>
              {vencimientos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <CheckCircle2 size={40} className="mb-3 opacity-40 text-amber-600" />
                  <p className="font-bold text-sm">No hay DPF por vencer en los próximos 30 días</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {vencimientos.map(d => {
                    const urgente = d.DiasRestantes <= 0, proximo = d.DiasRestantes <= 7 && d.DiasRestantes > 0;
                    return (
                      <div key={d.DepositoID} className={`rounded-2xl border p-4 ${urgente ? 'bg-red-50 border-red-200' : proximo ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${urgente ? 'bg-red-100 text-red-700' : proximo ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                                {urgente ? '¡VENCIDO!' : `${d.DiasRestantes}d`}
                              </span>
                              <span className="font-black text-amber-700 text-sm">{d.DepositoID}</span>
                              <EstadoBadge estado={d.Estado} />
                            </div>
                            <p className="font-bold text-slate-800 text-sm">{d.NombreSocio}</p>
                            <p className="text-xs text-slate-500">{d.Identificacion} · {d.DescripcionRango}</p>
                            <div className="grid grid-cols-3 gap-3 mt-3">
                              <div><p className="text-[9px] text-slate-400 font-bold uppercase">Capital</p><p className="font-black text-slate-800 tabular-nums">{fmtUSD(d.MontoCapital)}</p></div>
                              <div><p className="text-[9px] text-slate-400 font-bold uppercase">Tasa / Plazo</p><p className="font-black text-amber-700">{d.TasaNominalAnual}% / {d.PlazosDias}d</p></div>
                              <div><p className="text-[9px] text-slate-400 font-bold uppercase">Int. Neto</p><p className="font-black text-amber-700 tabular-nums">{fmtUSD(d.InteresNetoProyectado)}</p></div>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-2">Apertura: {d.FechaApertura} · Vence: <strong className="text-slate-700">{d.FechaVencimiento}</strong></p>
                          </div>
                          {canOperate && (
                            <div className="flex flex-col gap-2 shrink-0">
                              <button onClick={() => liquidarDPF(d)}
                                className="px-3 py-2 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5"
                                style={{ background: P.gold }}>
                                <CheckCircle2 size={13} />Liquidar
                              </button>
                              <button onClick={() => { setRenovarDPF(d); setRenovarTasaID(''); setRenovarPlazo(d.PlazosDias.toString()); }}
                                className="px-3 py-2 text-white text-xs font-black rounded-xl transition-all flex items-center gap-1.5"
                                style={{ background: P.orange }}>
                                <RotateCcw size={13} />Renovar
                              </button>
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

          {/* ──────── CONFIGURACIÓN TASAS (admin) ──────── */}
          {activeTab === 'TASAS' && isAdmin && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Settings size={18} className="text-amber-600" />
                <div>
                  <h3 className="font-black text-slate-800 text-sm uppercase">Configuración de Tasas SEPS</h3>
                  <p className="text-[10px] text-slate-500">Las tasas no pueden superar el techo BCE referencial. Retención 2% LORTI es fija por ley.</p>
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2">
                <Info size={15} className="text-orange-600 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-700 font-bold">Las tasas pasivas son reguladas por el BCE. La tasa máxima por tramo se muestra en la columna "Techo BCE". Superarla bloquea el guardado.</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      {['Tramo / Cuenta SEPS','Días','Techo BCE','Tasa Activa %','Monto Mín.','Penaliz. %','Activo',''].map(h => <th key={h} className="px-3 py-3 text-left">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tasas.map(t => {
                      const e = editTasas[t.TasaID] || {};
                      const tna = e.TasaNominalAnual !== undefined ? e.TasaNominalAnual : t.TasaNominalAnual;
                      const changed = Object.keys(e).length > 0;
                      return (
                        <tr key={t.TasaID} className={`border-t border-slate-100 ${changed ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
                          <td className="px-3 py-3"><p className="font-black text-slate-800 text-xs">{t.DescripcionRango}</p><p className="font-mono text-[10px] text-slate-400">{t.CuentaContableDPF}</p></td>
                          <td className="px-3 py-3 text-xs text-slate-500 font-bold">{t.DiasDesde}–{t.DiasHasta >= 9999 ? '∞' : t.DiasHasta}</td>
                          <td className="px-3 py-3 text-xs font-black text-red-600">{t.TasaMaximaBCE}%</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <input type="number" min="0" max={t.TasaMaximaBCE} step="0.01" value={tna}
                                onChange={ev => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], TasaNominalAnual: parseFloat(ev.target.value) } }))}
                                className={`w-20 px-2 py-1.5 rounded-lg border text-xs font-black focus:outline-none ${parseFloat(tna as any) > t.TasaMaximaBCE ? 'border-red-300 bg-red-50 text-red-600' : 'border-slate-200 bg-white text-slate-800'}`} />
                              <span className="text-xs text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-400">$</span>
                              <input type="number" min="0" step="1" value={e.MontoMinimo !== undefined ? e.MontoMinimo : t.MontoMinimo}
                                onChange={ev => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], MontoMinimo: parseFloat(ev.target.value) } }))}
                                className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-bold focus:outline-none" />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <input type="number" min="0" max="100" step="1" value={e.PorcentajePenalizacion !== undefined ? e.PorcentajePenalizacion : t.PorcentajePenalizacion}
                                onChange={ev => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], PorcentajePenalizacion: parseFloat(ev.target.value) } }))}
                                className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-bold focus:outline-none" />
                              <span className="text-xs text-slate-400">%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <button onClick={() => setEditTasas(p => ({ ...p, [t.TasaID]: { ...p[t.TasaID], Activo: !(e.Activo !== undefined ? e.Activo : t.Activo) } }))}
                              className={`w-10 h-5 rounded-full transition-all relative`}
                              style={{ background: (e.Activo !== undefined ? e.Activo : t.Activo) ? P.gold : '#CBD5E1' }}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${(e.Activo !== undefined ? e.Activo : t.Activo) ? 'left-5' : 'left-0.5'}`} />
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            {changed && (
                              <button onClick={() => guardarTasa(t.TasaID)} disabled={savingTasa === t.TasaID}
                                className="px-3 py-1.5 text-white text-xs font-black rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                                style={{ background: P.crimson }}>
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
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 font-bold space-y-1">
                <p className="font-black text-slate-700 uppercase text-[10px] tracking-widest mb-2">Cuentas del Plan Contable SEPS — Módulo DPF</p>
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

          {/* ──────── CONTABILIDAD ──────── */}
          {activeTab === 'CONTABILIDAD' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-amber-600" />
                <h3 className="font-black text-slate-800 text-sm uppercase">Registro Contable DPF</h3>
              </div>
              {depositos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400"><FileText size={40} className="mb-3 opacity-40" /><p className="font-bold text-sm">Sin registros para mostrar</p></div>
              ) : (
                <div className="space-y-3">
                  {depositos.slice(0, 20).map(d => (
                    <button key={d.DepositoID} onClick={() => verDetalle(d.DepositoID)}
                      className="w-full bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between hover:border-amber-300 hover:bg-amber-50 transition-all text-left shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 border border-amber-200">
                          <FileText size={18} className="text-amber-600" />
                        </div>
                        <div>
                          <p className="font-black text-amber-700 text-sm">{d.DepositoID}</p>
                          <p className="text-xs text-slate-500">{d.NombreSocio} · {d.FechaApertura}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-black text-slate-800 tabular-nums">{fmtUSD(d.MontoCapital)}</p>
                          <p className="text-xs text-slate-400">{d.CuentaContableDPF}</p>
                        </div>
                        <EstadoBadge estado={d.Estado} />
                        <ChevronDown size={16} className="text-slate-300" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Modal: Detalle DPF + Asientos ── */}
      {detalleDPF && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm rounded-t-3xl border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div>
                <p className="font-black text-amber-700 text-lg">{detalleDPF.dpf.DepositoID}</p>
                <p className="text-xs text-slate-500">{detalleDPF.dpf.NombreSocio} · {detalleDPF.dpf.Identificacion}</p>
              </div>
              <div className="flex items-center gap-3">
                <EstadoBadge estado={detalleDPF.dpf.Estado} />
                <button onClick={() => setDetalleDPF(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"><X size={18} /></button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Capital',        value: fmtUSD(detalleDPF.dpf.MontoCapital) },
                  { label: 'Tasa TNA',       value: `${detalleDPF.dpf.TasaNominalAnual}%` },
                  { label: 'Plazo',          value: `${detalleDPF.dpf.PlazosDias} días` },
                  { label: 'Tramo',          value: detalleDPF.dpf.DescripcionRango },
                  { label: 'Apertura',       value: detalleDPF.dpf.FechaAperturaFmt || detalleDPF.dpf.FechaApertura },
                  { label: 'Vencimiento',    value: detalleDPF.dpf.FechaVencimientoFmt || detalleDPF.dpf.FechaVencimiento },
                  { label: 'Int. Bruto',     value: fmtUSD(detalleDPF.dpf.InteresProyectado) },
                  { label: 'Ret. 2% LORTI', value: fmtUSD(detalleDPF.dpf.RetencionProyectada) },
                  { label: 'Int. Neto',      value: fmtUSD(detalleDPF.dpf.InteresNetoProyectado) },
                  { label: 'Cuenta SEPS',    value: detalleDPF.dpf.CuentaContableDPF },
                  { label: 'Aperturado por', value: detalleDPF.dpf.UsuarioAperturaID },
                  { label: 'Renovaciones',   value: detalleDPF.dpf.NumeroRenovacion.toString() },
                ].map((f, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{f.label}</p>
                    <p className="font-black text-slate-800 text-sm mt-0.5">{f.value}</p>
                  </div>
                ))}
              </div>
              {detalleDPF.asientos.length > 0 && (
                <div>
                  <p className="font-black text-slate-700 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                    <FileText size={15} className="text-amber-600" />Asientos Contables SEPS
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase">
                          {['Tipo','Cuenta','Nombre','Debe','Haber','Concepto','Fecha'].map(h => <th key={h} className="px-3 py-2 text-left">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {detalleDPF.asientos.map(a => (
                          <tr key={a.AsientoID} className="border-t border-slate-100">
                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-600">{a.TipoOperacion.replace('_',' ')}</span></td>
                            <td className="px-3 py-2 font-mono text-amber-700 font-bold">{a.CuentaContable}</td>
                            <td className="px-3 py-2 text-slate-500 max-w-[150px] truncate">{a.NombreCuenta}</td>
                            <td className="px-3 py-2 font-black text-right text-slate-700 tabular-nums">{a.DebeAmount > 0 ? fmtUSD(a.DebeAmount) : '-'}</td>
                            <td className="px-3 py-2 font-black text-right text-amber-700 tabular-nums">{a.HaberAmount > 0 ? fmtUSD(a.HaberAmount) : '-'}</td>
                            <td className="px-3 py-2 text-slate-400 max-w-[180px] truncate">{a.Concepto}</td>
                            <td className="px-3 py-2 text-slate-400">{a.FechaAsiento.slice(0, 10)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-slate-200 bg-slate-50">
                          <td colSpan={3} className="px-3 py-2 font-black text-slate-600 uppercase text-[10px] tracking-widest">TOTALES</td>
                          <td className="px-3 py-2 font-black text-right text-slate-800 tabular-nums">{fmtUSD(detalleDPF.asientos.reduce((s, a) => s + a.DebeAmount, 0))}</td>
                          <td className="px-3 py-2 font-black text-right text-amber-700 tabular-nums">{fmtUSD(detalleDPF.asientos.reduce((s, a) => s + a.HaberAmount, 0))}</td>
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

      {/* ── Modal: Renovar DPF ── */}
      {renovarDPF && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-amber-700 text-lg flex items-center gap-2"><RotateCcw size={20} />Renovar DPF</h3>
              <button onClick={() => setRenovarDPF(null)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"><X size={18} /></button>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="font-black text-amber-700 text-sm">{renovarDPF.DepositoID}</p>
              <p className="text-xs text-slate-600">{renovarDPF.NombreSocio} · Capital: {fmtUSD(renovarDPF.MontoCapital)}</p>
              <p className="text-xs text-slate-400">Tasa anterior: {renovarDPF.TasaNominalAnual}% / {renovarDPF.PlazosDias} días</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nuevo Tramo (vacío = mismo tramo)</label>
              <select value={renovarTasaID} onChange={e => setRenovarTasaID(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold focus:outline-none">
                <option value="">— Mantener tramo actual —</option>
                {tasas.filter(t => t.Activo).map(t => <option key={t.TasaID} value={t.TasaID}>{t.DescripcionRango} → {t.TasaNominalAnual}% TNA</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nuevo Plazo en Días</label>
              <input type="number" min="1" value={renovarPlazo} onChange={e => setRenovarPlazo(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold focus:outline-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRenovarDPF(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={ejecutarRenovacion} disabled={loading}
                className="flex-1 py-3 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
                style={{ background: P.orange }}>
                {loading ? <RefreshCw size={15} className="animate-spin" /> : <RotateCcw size={15} />} Confirmar Renovación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmación genérica ── */}
      {confirmOpen && confirmData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-inner bg-amber-50 border border-amber-200">
                <AlertTriangle size={28} className="text-amber-600" />
              </div>
              <h3 className="font-black text-slate-800 text-base uppercase tracking-tight">{confirmData.titulo}</h3>
              <p className="text-sm text-slate-500 font-bold whitespace-pre-line leading-relaxed">{confirmData.msg}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={confirmData.accion}
                className="flex-1 py-4 text-white rounded-2xl font-black text-sm transition-all shadow-lg"
                style={{ background: `linear-gradient(135deg, ${P.crimson}, ${P.gold})` }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
