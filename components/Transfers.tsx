
import React, { useState } from 'react';
import { User, AccountType } from '../types';
import { Search, UserPlus, CreditCard, ArrowRight, ShieldCheck, Info, CheckCircle2, Loader2 } from 'lucide-react';

interface TransfersProps {
  user: User | null;
}

interface BeneficiarioEncontrado {
  id: string;
  nombre: string;
  numeroCuenta: string;
  cuentaId: string;
}

export const Transfers: React.FC<TransfersProps> = ({ user }) => {
  const [step, setStep]                   = useState(1);
  const [amount, setAmount]               = useState('');
  const [descripcion, setDescripcion]     = useState('');
  const [searchQuery, setSearchQuery]     = useState('');
  const [searching, setSearching]         = useState(false);
  const [resultados, setResultados]       = useState<BeneficiarioEncontrado[]>([]);
  const [beneficiario, setBeneficiario]   = useState<BeneficiarioEncontrado | null>(null);
  const [loading, setLoading]             = useState(false);
  const [exito, setExito]                 = useState<{ asientoId: number; nuevoSaldo: number } | null>(null);
  const [error, setError]                 = useState('');

  if (!user) return null;

  const savingsAccount = user.accounts.find(a => a.type === AccountType.SAVINGS);
  const currentBalance = savingsAccount?.balance || 0;
  const cuentaOrigenId = savingsAccount?.number || '';

  const handleBuscarSocio = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setResultados([]);
    setError('');
    try {
      const res = await fetch(`/api/socios/buscar?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      const socios: BeneficiarioEncontrado[] = (data || [])
        .filter((s: any) => s.id !== user.id)
        .flatMap((s: any) =>
          (s.accounts || [])
            .filter((a: any) => a.type === 'AHORRO_VISTA')
            .map((a: any) => ({
              id: s.id,
              nombre: s.name || `${s.PrimerNombre || ''} ${s.Apellidos || ''}`.trim(),
              numeroCuenta: a.number,
              cuentaId: a.number,
            }))
        );
      setResultados(socios);
      if (socios.length === 0) setError('No se encontraron socios con esa búsqueda.');
    } catch {
      setError('Error al buscar socios. Verifique la conexión.');
    } finally {
      setSearching(false);
    }
  };

  const handleConfirmar = async () => {
    if (!beneficiario || !savingsAccount) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/socios/transferir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuentaOrigenId,
          cuentaDestinoId: beneficiario.cuentaId,
          monto: parseFloat(amount),
          descripcion: descripcion || 'TRANSFERENCIA ENTRE SOCIOS',
          usuarioId: user.id,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Error al procesar la transferencia');
      setExito({ asientoId: data.asientoId, nuevoSaldo: data.nuevoSaldoOrigen });
      setStep(4);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNuevaTransferencia = () => {
    setStep(1); setAmount(''); setDescripcion(''); setSearchQuery('');
    setResultados([]); setBeneficiario(null); setExito(null); setError('');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-black text-slate-900 mb-6">Realizar Transferencia</h2>

        {/* Stepper */}
        {step < 4 && (
          <div className="flex items-center gap-4 mb-10">
            {[{ n: 1, label: 'Destino' }, { n: 2, label: 'Monto' }, { n: 3, label: 'Confirmar' }].map((s, i, arr) => (
              <React.Fragment key={s.n}>
                <div className={`flex items-center gap-2 ${step >= s.n ? 'text-[#14532D]' : 'text-slate-400'}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= s.n ? 'bg-emerald-100' : 'bg-slate-100'}`}>{s.n}</span>
                  <span className="font-bold text-sm hidden sm:inline">{s.label}</span>
                </div>
                {i < arr.length - 1 && <div className="h-[1px] flex-1 bg-slate-100" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Paso 1: Buscar beneficiario */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">Buscar socio beneficiario</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nombre, número de socio o cédula..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleBuscarSocio()}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:border-[#14532D] focus:ring-2 focus:ring-[#14532D]/20 outline-none"
                />
                <button
                  onClick={handleBuscarSocio}
                  disabled={searching || !searchQuery.trim()}
                  className="px-5 py-3 bg-[#14532D] text-white rounded-xl font-bold text-sm hover:bg-[#1b5e20] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  Buscar
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">{error}</div>
            )}

            {resultados.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{resultados.length} resultado(s)</p>
                {resultados.map((b, i) => (
                  <button
                    key={i}
                    onClick={() => { setBeneficiario(b); setStep(2); }}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-emerald-50 rounded-xl transition-colors border border-transparent hover:border-emerald-200 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#14532D] flex items-center justify-center font-bold text-white shadow-sm text-sm">
                        {b.nombre[0]}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800">{b.nombre}</p>
                        <p className="text-[10px] text-slate-500 font-medium">Gutt System • {b.numeroCuenta}</p>
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 group-hover:text-[#14532D] transform group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <CreditCard size={20} className="text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-700">Transferencias solo dentro de Gutt System</p>
                <p className="text-[10px] text-slate-400">Busque al socio por nombre o cédula para enviarle fondos</p>
              </div>
            </div>
          </div>
        )}

        {/* Paso 2: Ingresar monto */}
        {step === 2 && beneficiario && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Beneficiario</p>
                <p className="text-sm font-black text-[#14532D]">{beneficiario.nombre}</p>
                <p className="text-xs text-emerald-800 font-medium">Cta: {beneficiario.numeroCuenta}</p>
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-slate-400 hover:text-slate-600 font-bold underline">Cambiar</button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Tu cuenta origen</p>
              <p className="text-sm font-bold text-slate-700">{savingsAccount?.number}</p>
              <p className="text-xs text-slate-500">Saldo disponible: <span className="font-black text-[#14532D]">${currentBalance.toFixed(2)}</span></p>
            </div>

            <div className="text-center py-6">
              <label className="block text-sm font-bold text-slate-400 uppercase mb-2 tracking-widest">Monto a transferir</label>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-bold text-slate-300">$</span>
                <input
                  autoFocus
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-48 text-5xl font-black text-[#14532D] bg-transparent border-none focus:ring-0 text-center placeholder:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Concepto (opcional)</label>
              <input
                type="text"
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Ej: Pago de cuota, alquiler..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:border-[#14532D] outline-none"
              />
            </div>

            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="flex-1 py-4 font-bold text-slate-600 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors">Atrás</button>
              <button
                onClick={() => setStep(3)}
                disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > currentBalance}
                className="flex-[2] py-4 font-bold text-white bg-[#14532D] rounded-2xl hover:bg-[#1b5e20] transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
              >
                {parseFloat(amount) > currentBalance ? 'Saldo insuficiente' : 'Continuar'}
              </button>
            </div>
          </div>
        )}

        {/* Paso 3: Confirmar */}
        {step === 3 && beneficiario && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <ShieldCheck size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-900">Confirmar Transferencia</h3>

            <div className="max-w-xs mx-auto space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100 text-left">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Monto:</span>
                <span className="text-[#14532D] font-black">${parseFloat(amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Beneficiario:</span>
                <span className="text-slate-900 font-bold text-right">{beneficiario.nombre}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Cta destino:</span>
                <span className="text-slate-700 font-medium">{beneficiario.numeroCuenta}</span>
              </div>
              {descripcion && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Concepto:</span>
                  <span className="text-slate-700 font-medium text-right">{descripcion}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-medium">Costo:</span>
                <span className="text-emerald-600 font-bold">Gratis</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between">
                <span className="text-slate-900 font-black">Total a debitar:</span>
                <span className="text-[#14532D] font-black text-lg">${parseFloat(amount).toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100">{error}</div>
            )}

            <div className="flex flex-col gap-3">
              <button
                onClick={handleConfirmar}
                disabled={loading}
                className="w-full py-4 font-bold text-white bg-[#14532D] rounded-2xl hover:bg-[#1b5e20] transition-all shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 size={18} className="animate-spin" /> Procesando...</> : 'Confirmar Envío'}
              </button>
              <button onClick={() => setStep(2)} className="w-full py-2 font-bold text-slate-400 hover:text-slate-600">Modificar monto</button>
            </div>
          </div>
        )}

        {/* Paso 4: Éxito */}
        {step === 4 && exito && beneficiario && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-500 text-center">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} />
            </div>
            <h3 className="text-2xl font-black text-slate-900">¡Transferencia Exitosa!</h3>
            <p className="text-slate-500 text-sm">Se enviaron <span className="font-black text-[#14532D]">${parseFloat(amount).toFixed(2)}</span> a <span className="font-bold">{beneficiario.nombre}</span></p>

            <div className="max-w-xs mx-auto bg-slate-50 p-5 rounded-2xl border border-slate-100 text-left space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">N° Asiento:</span>
                <span className="font-black text-slate-800">#{exito.asientoId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Nuevo saldo:</span>
                <span className="font-black text-[#14532D]">${exito.nuevoSaldo.toFixed(2)}</span>
              </div>
            </div>

            <button onClick={handleNuevaTransferencia} className="w-full py-4 font-bold text-white bg-[#14532D] rounded-2xl hover:bg-[#1b5e20] transition-all shadow-lg">
              Nueva Transferencia
            </button>
          </div>
        )}
      </div>

      <div className="bg-amber-50 p-4 rounded-2xl flex gap-4 items-start border border-amber-100">
        <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
          <Info size={20} />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-900">Seguridad Gutt System</p>
          <p className="text-xs text-amber-800/70">Nunca compartas tu PIN con nadie. Gutt System jamás te pedirá datos sensibles por teléfono o correo electrónico.</p>
        </div>
      </div>
    </div>
  );
};
