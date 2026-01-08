
import React, { useState } from 'react';
import { User, AccountType } from '../types';
import { Search, UserPlus, CreditCard, ArrowRight, ShieldCheck, Info } from 'lucide-react';

interface TransfersProps {
  user: User | null;
}

export const Transfers: React.FC<TransfersProps> = ({ user }) => {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [beneficiary, setBeneficiary] = useState('');

  if (!user) return null;

  const savingsAccount = user.accounts.find(a => a.type === AccountType.SAVINGS);
  const currentBalance = savingsAccount?.balance || 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-black text-slate-900 mb-6">Realizar Transferencia</h2>
        
        {/* Stepper */}
        <div className="flex items-center gap-4 mb-10">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[#14532D]' : 'text-slate-400'}`}>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 1 ? 'bg-emerald-100' : 'bg-slate-100'}`}>1</span>
            <span className="font-bold text-sm hidden sm:inline">Destino</span>
          </div>
          <div className="h-[1px] flex-1 bg-slate-100"></div>
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[#14532D]' : 'text-slate-400'}`}>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 2 ? 'bg-emerald-100' : 'bg-slate-100'}`}>2</span>
            <span className="font-bold text-sm hidden sm:inline">Monto</span>
          </div>
          <div className="h-[1px] flex-1 bg-slate-100"></div>
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-[#14532D]' : 'text-slate-400'}`}>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= 3 ? 'bg-emerald-100' : 'bg-slate-100'}`}>3</span>
            <span className="font-bold text-sm hidden sm:inline">Confirmar</span>
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">¿Hacia dónde envías?</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-[#14532D] bg-emerald-50 text-[#14532D] group">
                  <UserPlus className="mb-2" size={32} />
                  <span className="font-bold">Nuevo Beneficiario</span>
                  <span className="text-xs text-emerald-700/60 font-medium">Otros socios o bancos</span>
                </button>
                <button className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-slate-100 bg-white hover:border-slate-200 transition-colors">
                  <CreditCard className="mb-2 text-slate-400" size={32} />
                  <span className="font-bold text-slate-700">Entre mis cuentas</span>
                  <span className="text-xs text-slate-400 font-medium">Ahorros y créditos</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-3">Sugeridos Recientes</label>
              <div className="space-y-3">
                {[
                  { name: 'María Solís', bank: 'Caja Patate', acc: '**** 2910' },
                  { name: 'Carlos Arcos', bank: 'Banco Pichincha', acc: '**** 8822' },
                ].map((b, i) => (
                  <button 
                    key={i} 
                    onClick={() => { setBeneficiary(b.name); setStep(2); }}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-transparent hover:border-slate-200 group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-bold text-slate-400 shadow-sm">
                        {b.name[0]}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800">{b.name}</p>
                        <p className="text-[10px] text-slate-500 font-medium">{b.bank} • {b.acc}</p>
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 group-hover:text-[#14532D] transform group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
              <p className="text-xs font-bold text-emerald-600 uppercase mb-4">Cuenta de Origen</p>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-bold text-[#14532D]">{savingsAccount?.number || '01000000'}</p>
                  <p className="text-xs text-emerald-800">Saldo Disponible: ${currentBalance.toFixed(2)}</p>
                </div>
                <div className="bg-white px-3 py-1 rounded-full text-[10px] font-black text-[#14532D] border border-emerald-100">AHORROS</div>
              </div>
            </div>

            <div className="text-center py-10">
              <label className="block text-sm font-bold text-slate-400 uppercase mb-2 tracking-widest">Monto de la Transferencia</label>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-bold text-slate-300">$</span>
                <input 
                  autoFocus
                  type="number" 
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-48 text-5xl font-black text-[#14532D] bg-transparent border-none focus:ring-0 text-center placeholder:text-slate-100"
                />
              </div>
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

        {step === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
             <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldCheck size={32} />
             </div>
             <h3 className="text-xl font-black text-slate-900">Validar Transferencia</h3>
             
             <div className="max-w-xs mx-auto space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div className="flex justify-between text-sm">
                   <span className="text-slate-500 font-medium">Monto:</span>
                   <span className="text-[#14532D] font-black">${parseFloat(amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span className="text-slate-500 font-medium">Beneficiario:</span>
                   <span className="text-slate-900 font-bold">{beneficiary}</span>
                </div>
                <div className="flex justify-between text-sm">
                   <span className="text-slate-500 font-medium">Costo de Transacción:</span>
                   <span className="text-emerald-600 font-bold">Gratis</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between">
                   <span className="text-slate-900 font-black">Total a Debitar:</span>
                   <span className="text-[#14532D] font-black text-lg">${parseFloat(amount).toFixed(2)}</span>
                </div>
             </div>

             <div className="flex flex-col gap-3">
                <button 
                  onClick={() => alert("Transferencia procesada. El comprobante ha sido generado.")}
                  className="w-full py-4 font-bold text-white bg-[#14532D] rounded-2xl hover:bg-[#1b5e20] transition-all shadow-lg"
                >
                  Confirmar Envío
                </button>
                <button onClick={() => setStep(2)} className="w-full py-2 font-bold text-slate-400 hover:text-slate-600">Modificar monto</button>
             </div>
          </div>
        )}
      </div>

      <div className="bg-amber-50 p-4 rounded-2xl flex gap-4 items-start border border-amber-100">
         <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
           <Info size={20} />
         </div>
         <div>
           <p className="text-sm font-bold text-amber-900">Seguridad Patate</p>
           <p className="text-xs text-amber-800/70">Nunca compartas tu PIN con nadie. Caja Patate jamás te pedirá datos sensibles por teléfono o correo electrónico.</p>
         </div>
      </div>
    </div>
  );
};
