import React, { useState, useMemo, useEffect } from 'react';
import { InterestRate, Loan, LoanInstallment, GlobalConfig, AccountType } from '../types';
import { DataService } from '../services/dataService';
import { Calculator, CheckCircle2, AlertCircle, Calendar, Info, FileText, Ban, TrendingUp, X, ArrowLeft, Printer, MessageSquareText, ShieldAlert } from 'lucide-react';

interface CreditsViewProps {
  rates: InterestRate[];
  config: GlobalConfig;
  onApply: (loan: Loan) => void;
  existingLoans: Loan[];
  memberName: string;
  memberId: string;
}

export const CreditsView: React.FC<CreditsViewProps> = ({ rates, config, onApply, existingLoans, memberName, memberId }) => {
  const [amount, setAmount] = useState<string>('');
  const [term, setTerm] = useState<number>(12);
  const [selectedRateId, setSelectedRateId] = useState<string>(rates[0]?.id || '');
  const [selectedLoanForTable, setSelectedLoanForTable] = useState<Loan | null>(null);

  // Warranty States
  const [warrantyType, setWarrantyType] = useState<'SOLIDARIA' | 'PRENDARIA'>('SOLIDARIA');
  const [solidariaGuarantorName, setSolidariaGuarantorName] = useState<string>('');
  const [solidariaGuarantorId, setSolidariaGuarantorId] = useState<string>('');
  const [prendariaValuation, setPrendariaValuation] = useState<string>('');
  const [prendariaInsurance, setPrendariaInsurance] = useState<string>('');

  // Certificados de Aportación balance
  const [certBalance, setCertBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!memberId) return;
    const fetchCertBalance = async () => {
      try {
        const user = await DataService.getUserFullData(memberId);
        const certAcc = user.accounts?.find(acc => 
          acc.type === AccountType.CERTIFICATE || 
          (acc.type as any) === 'CERTIFICADO_APORTACION'
        );
        if (certAcc) {
          setCertBalance(Number(certAcc.balance));
        } else {
          setCertBalance(0);
        }
      } catch (err) {
        console.error('Error fetching member certificates balance:', err);
        setCertBalance(0);
      }
    };
    fetchCertBalance();
  }, [memberId]);

  const { minLoanAmount, maxLoanAmount, maxGlobalTerm } = config;

  const selectedRate = useMemo(() => 
    rates.find(r => r.id === selectedRateId) || rates[0], 
  [selectedRateId, rates]);

  const numAmount = parseFloat(amount);
  const isAmountValid = !isNaN(numAmount) && numAmount >= minLoanAmount && numAmount <= maxLoanAmount;

  const simulation = useMemo(() => {
    if (!isAmountValid) return null;
    const p = numAmount;
    const r = (selectedRate.rate / 100) / 12;
    const n = Math.min(term, selectedRate.maxTerm, maxGlobalTerm);
    const monthlyPayment = p * (r / (1 - Math.pow(1 + r, -n)));
    
    let balance = p;
    const installments: LoanInstallment[] = [];
    
    for (let i = 1; i <= n; i++) {
      const interest = balance * r;
      const capital = monthlyPayment - interest;
      balance -= capital;
      installments.push({
        number: i,
        date: `Mes ${i}`,
        capital: Math.max(0, capital),
        interest: Math.max(0, interest),
        total: monthlyPayment,
        status: 'PENDIENTE'
      });
    }

    return { monthlyPayment, totalInterest: (monthlyPayment * n) - p, totalPayable: monthlyPayment * n, installments };
  }, [numAmount, isAmountValid, term, selectedRate, maxGlobalTerm]);

  const handleApply = async () => {
    if (!simulation || !isAmountValid) return;

    if (certBalance !== null && certBalance < 1.00) {
      alert(`No puede solicitar crédito: El socio debe poseer al menos $1.00 USD en Certificados de Aportación. Saldo actual: $${certBalance.toFixed(2)} USD.`);
      return;
    }

    const maxRateLimit = (selectedRate as any).maxRate || selectedRate.rate;
    if (selectedRate.rate > maxRateLimit) {
      alert(`La tasa seleccionada (${selectedRate.rate}%) supera el límite legal para esta línea de crédito (${maxRateLimit}%).`);
      return;
    }

    const garantiaInfo = warrantyType === 'SOLIDARIA'
      ? { tipo: 'SOLIDARIA', garanteNombre: solidariaGuarantorName, garanteCedula: solidariaGuarantorId }
      : { tipo: 'PRENDARIA', avaluoMonto: parseFloat(prendariaValuation) || 0, aseguradora: prendariaInsurance };

    const newLoan: Loan = {
      id: `CRD-${Date.now()}`,
      memberId,
      memberName,
      amount: numAmount,
      balance: numAmount,
      rate: selectedRate.rate,
      installmentsCount: term,
      installments: simulation.installments,
      status: 'SOLICITADO',
      type: selectedRate.category,
      startDate: new Date().toLocaleDateString('es-EC'),
      dueDate: new Date(Date.now() + term * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-EC'),
      garantiaInfo: garantiaInfo as any,
      origen: 'CAJA_PATATE'
    };

    const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === 'true';

    if (useRemoteApi) {
      try {
        const response = await fetch('/api/socios/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newLoan)
        });
        const data = await response.json();
        if (data.ok) {
          onApply(newLoan);
          setAmount('');
          setSolidariaGuarantorName('');
          setSolidariaGuarantorId('');
          setPrendariaValuation('');
          setPrendariaInsurance('');
          alert("Solicitud de crédito registrada con éxito en el servidor.");
        } else {
          alert("Error al registrar solicitud: " + (data.error || ''));
        }
      } catch (err) {
        console.error(err);
        alert("Error de conexión al registrar solicitud.");
      }
    } else {
      onApply(newLoan);
      setAmount('');
      setSolidariaGuarantorName('');
      setSolidariaGuarantorId('');
      setPrendariaValuation('');
      setPrendariaInsurance('');
      alert("Solicitud de crédito enviada con éxito.");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (selectedLoanForTable) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-10">
        <button onClick={() => setSelectedLoanForTable(null)} className="flex items-center gap-2 text-slate-500 font-bold hover:text-[#14532D] transition-colors mb-4 no-print">
          <ArrowLeft size={20} /> Volver a mis créditos
        </button>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden printable-area">
          <div className="bg-[#14532D] p-10 text-white flex justify-between items-center relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-3xl font-black italic">G</h2>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#FACC15]">Gutt System</p>
              <div className="mt-6 space-y-1">
                <p className="text-sm font-bold opacity-80 uppercase">Tabla de Amortización Oficial</p>
                <p className="text-2xl font-black">Operación: {selectedLoanForTable.id}</p>
              </div>
            </div>
            <div className="text-right relative z-10">
              <p className="text-4xl font-black">${selectedLoanForTable.amount.toLocaleString()}</p>
              <p className="text-xs font-bold opacity-70">Monto del Crédito</p>
              <span className={`mt-4 inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${
                selectedLoanForTable.status === 'SOLICITADO' ? 'bg-amber-400 text-[#14532D]' : 
                selectedLoanForTable.status === 'RECHAZADO' ? 'bg-red-500 text-white' : 'bg-[#FACC15] text-[#14532D]'
              }`}>
                Estado: {selectedLoanForTable.status}
              </span>
            </div>
          </div>

          <div className="p-10 space-y-8">
            {selectedLoanForTable.comments && (
              <div className={`p-6 rounded-3xl border-2 flex gap-4 ${
                selectedLoanForTable.status === 'RECHAZADO' ? 'bg-red-50 border-red-100 text-red-900' : 'bg-emerald-50 border-emerald-100 text-emerald-900'
              }`}>
                <MessageSquareText size={24} className="shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Observaciones del Asesor:</p>
                  <p className="font-bold">{selectedLoanForTable.comments}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-8 rounded-3xl border border-slate-100">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Titular</p>
                <p className="font-black text-slate-800 uppercase text-lg">{memberName}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Costo Financiero</p>
                <p className="font-black text-slate-800">{selectedLoanForTable.rate}% Anual</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Duración</p>
                <p className="font-black text-slate-800">{selectedLoanForTable.installmentsCount} Meses</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-5 text-left font-black text-slate-400 uppercase text-[10px]"># Cuota</th>
                    <th className="px-6 py-5 text-right font-black text-slate-400 uppercase text-[10px]">Capital</th>
                    <th className="px-6 py-5 text-right font-black text-slate-400 uppercase text-[10px]">Interés</th>
                    <th className="px-6 py-5 text-right font-black text-slate-400 uppercase text-[10px]">Cuota Mensual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {selectedLoanForTable.installments.map((inst) => (
                    <tr key={inst.number} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-black text-[#14532D]">{inst.number}</td>
                      <td className="px-6 py-4 text-right font-medium text-slate-600">${inst.capital.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-medium text-slate-600">${inst.interest.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-black text-slate-900">${inst.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-4 no-print">
              <button onClick={handlePrint} className="flex-1 py-5 bg-[#14532D] text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-[#1b5e20] transition-all">
                <Printer size={20} /> IMPRIMIR MI TABLA
              </button>
              <button onClick={() => setSelectedLoanForTable(null)} className="flex-1 py-5 border-2 border-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-50 transition-all">
                CERRAR VISTA
              </button>
            </div>
            <div className="text-center pt-8 border-t border-slate-100 mt-8 opacity-50 text-[10px] font-bold uppercase tracking-widest hidden print:block">
              © Gutt System - Documento Electrónico no Negociable
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="bg-white p-8 lg:p-12 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex items-center gap-6 mb-10">
           <div className="w-16 h-16 bg-emerald-50 text-[#14532D] rounded-3xl flex items-center justify-center shadow-inner">
             <Calculator size={36} />
           </div>
           <div>
             <h2 className="text-3xl font-black text-slate-900 leading-tight">Simulador de Crédito Gutt System</h2>
             <p className="text-slate-500 font-medium">Conoce tu cuota y proyecta tu crecimiento financiero.</p>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Categoría de Crédito</label>
              <div className="grid grid-cols-1 gap-3">
                {rates.map(r => (
                  <button key={r.id} onClick={() => setSelectedRateId(r.id)} className={`p-5 rounded-2xl border-2 text-left transition-all flex justify-between items-center group ${selectedRateId === r.id ? 'border-[#14532D] bg-emerald-50/50 shadow-md' : 'border-slate-50 hover:border-slate-100'}`}>
                    <div>
                      <p className="text-sm font-black text-slate-800 group-hover:text-[#14532D] transition-colors">{r.category}</p>
                      <p className="text-[10px] text-slate-400 font-bold">PLAZO HASTA {Math.min(r.maxTerm, maxGlobalTerm)} MESES</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-[#14532D]">{r.rate}%</p>
                      <p className="text-[9px] text-emerald-600 font-black uppercase tracking-tighter">Anual Efectiva</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Monto Solicitado ($)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-300 text-xl">$</span>
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`w-full pl-10 pr-5 py-4 bg-slate-50 border-2 rounded-2xl focus:border-[#14532D] outline-none font-black text-xl transition-all ${amount && !isAmountValid ? 'border-red-200 text-red-500' : 'border-slate-50 text-[#14532D]'}`} />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Plazo (Meses)</label>
                <select value={term} onChange={(e) => setTerm(parseInt(e.target.value))} className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl focus:border-[#14532D] outline-none font-black text-xl text-[#14532D] cursor-pointer appearance-none">
                  {[6, 12, 18, 24, 36, 48, 60, 72].filter(m => m <= Math.min(selectedRate.maxTerm, maxGlobalTerm)).map(m => (
                    <option key={m} value={m}>{m} meses</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Certificados de Aportación Status */}
            <div className={`p-5 rounded-2xl flex gap-4 items-start border transition-all ${
              certBalance === null ? 'bg-slate-50 border-slate-100' :
              certBalance < 1.00 ? 'bg-red-50 border-red-100 text-red-900 animate-pulse' :
              'bg-emerald-50 border-emerald-100 text-emerald-900'
            }`}>
              {certBalance === null ? (
                <Info size={20} className="text-slate-400 shrink-0 mt-0.5 animate-spin" />
              ) : certBalance < 1.00 ? (
                <ShieldAlert size={20} className="text-red-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 size={20} className="text-[#14532D] shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-xs font-black uppercase tracking-wider">
                  {certBalance === null ? 'Validando Aportaciones...' :
                   certBalance < 1.00 ? 'Fondo de Aportación Insuficiente' :
                   'Certificados de Aportación Validados'}
                </p>
                <p className="text-[10px] font-bold opacity-80 mt-0.5">
                  {certBalance === null ? 'Verificando saldo mínimo requerido en cooperativa...' :
                   certBalance < 1.00 ? `El socio posee $${certBalance.toFixed(2)} USD. Requiere al menos $1.00 USD para calificar a un crédito.` :
                   `Saldo actual: $${certBalance.toFixed(2)} USD (Cumple con el requisito mínimo de $1.00 USD).`}
                </p>
              </div>
            </div>

            {/* Selector de Garantía */}
            <div className="space-y-4 p-6 bg-slate-50/50 rounded-3xl border border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block">Garantía y Respaldo del Crédito</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setWarrantyType('SOLIDARIA')}
                  className={`py-3 px-4 rounded-xl border-2 font-bold text-xs transition-all ${warrantyType === 'SOLIDARIA' ? 'border-[#14532D] bg-emerald-50 text-[#14532D]' : 'border-slate-200 hover:border-slate-300 text-slate-500'}`}
                >
                  Solidaria (Garante)
                </button>
                <button
                  type="button"
                  onClick={() => setWarrantyType('PRENDARIA')}
                  className={`py-3 px-4 rounded-xl border-2 font-bold text-xs transition-all ${warrantyType === 'PRENDARIA' ? 'border-[#14532D] bg-emerald-50 text-[#14532D]' : 'border-slate-200 hover:border-slate-300 text-slate-500'}`}
                >
                  Prendaria (Avalúo/Seguro)
                </button>
              </div>

              {warrantyType === 'SOLIDARIA' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nombre del Garante</label>
                    <input
                      type="text"
                      value={solidariaGuarantorName}
                      onChange={(e) => setSolidariaGuarantorName(e.target.value)}
                      placeholder="Ej: Juan Pérez"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-bold text-xs text-[#14532D]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cédula del Garante</label>
                    <input
                      type="text"
                      value={solidariaGuarantorId}
                      onChange={(e) => setSolidariaGuarantorId(e.target.value)}
                      placeholder="Ej: 1801234567"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-bold text-xs text-[#14532D]"
                    />
                  </div>
                </div>
              )}

              {warrantyType === 'PRENDARIA' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 animate-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Valor de Avalúo ($)</label>
                    <input
                      type="number"
                      value={prendariaValuation}
                      onChange={(e) => setPrendariaValuation(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-bold text-xs text-[#14532D]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Compañía Aseguradora</label>
                    <input
                      type="text"
                      value={prendariaInsurance}
                      onChange={(e) => setPrendariaInsurance(e.target.value)}
                      placeholder="Ej: Seguros Equinoccial"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-bold text-xs text-[#14532D]"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative">
            {simulation ? (
              <div className="bg-[#14532D] rounded-[2.5rem] p-10 text-white shadow-2xl animate-in zoom-in-95 duration-500 h-full flex flex-col justify-between overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-8"><TrendingUp size={16} className="text-[#FACC15]" /><span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#FACC15]">Proyección de Cuota</span></div>
                  <div className="space-y-8">
                    <div className="border-b border-white/10 pb-6">
                      <p className="text-emerald-100/60 font-bold text-xs uppercase mb-1">Pago Mensual Estimado</p>
                      <p className="text-5xl font-black tracking-tighter"><span className="text-2xl font-bold text-emerald-200 align-top mr-1">$</span>{simulation.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest">Total Intereses</p>
                          <p className="text-xl font-black">${simulation.totalInterest.toFixed(2)}</p>
                       </div>
                       <div className="text-right">
                          <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest">Total a Pagar</p>
                          <p className="text-xl font-black">${simulation.totalPayable.toFixed(2)}</p>
                       </div>
                    </div>
                  </div>
                </div>
                <div className="mt-12 space-y-4 relative z-10">
                  <button 
                    onClick={handleApply}
                    disabled={certBalance !== null && certBalance < 1.00}
                    className={`w-full py-5 rounded-2xl font-black text-xl shadow-xl transition-all flex items-center justify-center gap-3 ${
                      certBalance !== null && certBalance < 1.00
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                        : 'bg-[#FACC15] text-[#14532D] hover:scale-[1.02] active:scale-95'
                    }`}
                  >
                    ENVIAR SOLICITUD <CheckCircle2 size={24} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full bg-slate-50 border-4 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center p-12 text-center text-slate-400 group">
                <AlertCircle size={64} className="mb-6 opacity-20" />
                <p className="font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Simulación Pendiente</p>
                <p className="text-[10px] font-bold">Ingrese monto y plazo para calcular</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {existingLoans.length > 0 && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-slate-800">Estado de mis Créditos</h3>
            <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-4 py-1.5 rounded-full uppercase tracking-tighter">{existingLoans.length} OPERACIONES</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {existingLoans.map(loan => (
              <div key={loan.id} className="group p-6 rounded-[2.5rem] border border-slate-100 bg-slate-50/30 hover:bg-white hover:shadow-2xl transition-all duration-300">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-2xl ${
                      loan.status === 'SOLICITADO' ? 'bg-amber-100 text-amber-600' : 
                      loan.status === 'RECHAZADO' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{loan.type}</p>
                      <p className="font-black text-slate-900 leading-none mt-1">{loan.id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Monto</p>
                    <p className="text-xl font-black text-[#14532D]">${loan.amount.toLocaleString()}</p>
                  </div>
                </div>
                
                <div className="flex flex-col gap-3">
                  <span className={`w-full py-2.5 rounded-xl text-[10px] font-black uppercase flex items-center justify-center border-b-4 ${
                    loan.status === 'SOLICITADO' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    loan.status === 'RECHAZADO' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {loan.status}
                  </span>
                  
                  {loan.status !== 'RECHAZADO' && (
                    <button 
                      onClick={() => setSelectedLoanForTable(loan)} 
                      className="w-full py-4 bg-white border border-slate-200 rounded-2xl text-[11px] font-black text-[#14532D] hover:bg-[#14532D] hover:text-white flex items-center justify-center gap-2 transition-all shadow-sm"
                    >
                      <FileText size={16} /> VER TABLA DE PAGOS
                    </button>
                  )}

                  {loan.status === 'RECHAZADO' && loan.comments && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                      <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1">Motivo del rechazo:</p>
                      <p className="text-xs font-bold text-red-800">{loan.comments}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
