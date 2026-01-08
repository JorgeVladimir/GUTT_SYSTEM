
import React, { useState } from 'react';
import { User, Loan } from '../types';
import { CheckCircle2, XCircle, FileText, Calendar, ArrowLeft, MessageSquareText, Loader2, Printer } from 'lucide-react';

interface CreditOfficerApprovalProps {
  users: User[];
  onApprove: (loanId: string, memberId: string, reason: string) => void;
  onReject: (loanId: string, memberId: string, reason: string) => void;
}

export const CreditOfficerApproval: React.FC<CreditOfficerApprovalProps> = ({ users, onApprove, onReject }) => {
  const [selectedLoan, setSelectedLoan] = useState<{loan: Loan, member: User} | null>(null);
  const [officerReason, setOfficerReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const pendingLoans = users.flatMap(u => 
    (u.loans || []).filter(l => l.status === 'SOLICITADO').map(l => ({ loan: l, member: u }))
  );

  const handleDecision = async (isApproval: boolean) => {
    const reasonText = officerReason.trim();
    
    if (!reasonText) {
      alert("Es obligatorio escribir un dictamen técnico para proceder.");
      return;
    }

    if (isProcessing) return;

    const confirmMsg = isApproval 
      ? `¿CONFIRMA la aprobación oficial y el desembolso de $${selectedLoan?.loan.amount.toLocaleString()}?` 
      : "¿Está seguro de que desea RECHAZAR esta solicitud?";

    if (window.confirm(confirmMsg)) {
      setIsProcessing(true);
      try {
        if (selectedLoan) {
          if (isApproval) {
            onApprove(selectedLoan.loan.id, selectedLoan.member.id, reasonText);
          } else {
            onReject(selectedLoan.loan.id, selectedLoan.member.id, reasonText);
          }
          // Limpiar estado tras éxito
          setSelectedLoan(null);
          setOfficerReason('');
        }
      } catch (error) {
        alert("Error de conexión con el núcleo bancario.");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  if (selectedLoan) {
    const { loan, member } = selectedLoan;
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300">
        <button 
          disabled={isProcessing}
          onClick={() => { setSelectedLoan(null); setOfficerReason(''); }}
          className="flex items-center gap-2 text-slate-500 font-bold hover:text-[#14532D] transition-colors disabled:opacity-30"
        >
          <ArrowLeft size={20} /> Volver al listado de trámites
        </button>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="bg-[#14532D] p-10 text-white flex justify-between items-center relative border-b-[12px] border-[#FACC15]">
            <div className="relative z-10">
              <h2 className="text-3xl font-black italic">CAP</h2>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#FACC15]">Caja de Ahorro Patate</p>
              <div className="mt-6">
                <p className="text-sm font-bold opacity-80">Expediente de Crédito</p>
                <p className="text-2xl font-black">{loan.id}</p>
              </div>
            </div>
            <div className="text-right relative z-10">
              <p className="text-4xl font-black">${loan.amount.toLocaleString()}</p>
              <p className="text-xs font-bold opacity-70">Capital a Desembolsar</p>
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400 text-[#14532D] text-[10px] font-black uppercase">
                <Calendar size={12} /> Solicitado: {loan.startDate}
              </div>
            </div>
          </div>

          <div className="p-10 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8 bg-slate-50 rounded-3xl border border-slate-100">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Socio</p>
                <p className="font-black text-[#14532D] text-lg uppercase">{member.name}</p>
                <p className="text-xs font-bold text-slate-500">CI: {member.id}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Condiciones</p>
                <p className="font-black text-slate-800">{loan.rate}% Tasa Nominal</p>
                <p className="text-xs font-bold text-slate-500">{loan.installmentsCount} Meses • {loan.type}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</p>
                <p className="font-black text-amber-600 uppercase">PENDIENTE DICTAMEN</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MessageSquareText size={20} className="text-[#14532D]" />
                  <h3 className="text-lg font-black text-slate-800">Dictamen del Asesor <span className="text-red-500">*</span></h3>
                </div>
                {officerReason.length < 10 && <span className="text-[10px] font-black text-red-400 uppercase">Mínimo 10 caracteres</span>}
              </div>
              <textarea 
                value={officerReason}
                onChange={(e) => setOfficerReason(e.target.value)}
                placeholder="Explique aquí los motivos técnicos de la aprobación o rechazo..."
                className={`w-full p-8 bg-slate-50 border-4 rounded-[2rem] outline-none font-bold text-slate-700 h-48 transition-all resize-none shadow-inner ${officerReason.trim().length > 0 ? 'border-[#14532D]' : 'border-slate-100 focus:border-amber-400'}`}
              ></textarea>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-6">
              <button 
                disabled={isProcessing || !officerReason.trim()}
                onClick={() => handleDecision(false)}
                className="flex-1 py-5 bg-white border-4 border-red-50 text-red-600 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-red-50 transition-all disabled:opacity-30"
              >
                <XCircle size={24} /> RECHAZAR
              </button>
              <button 
                disabled={isProcessing || officerReason.trim().length < 5}
                onClick={() => handleDecision(true)}
                className="flex-[2] py-5 bg-[#14532D] text-white rounded-2xl font-black flex items-center justify-center gap-3 shadow-2xl hover:bg-[#1b5e20] transition-all border-b-8 border-[#FACC15] active:translate-y-2 active:border-b-0 disabled:opacity-20 disabled:grayscale"
              >
                {isProcessing ? (
                  <><Loader2 size={24} className="animate-spin" /> PROCESANDO...</>
                ) : (
                  <><CheckCircle2 size={24} className="text-[#FACC15]" /> APROBAR Y DESEMBOLSAR</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="bg-[#14532D] p-10 rounded-[3rem] shadow-xl text-white relative border-b-[12px] border-[#FACC15]">
        <h2 className="text-4xl font-black tracking-tighter">Bandeja de Aprobaciones</h2>
        <p className="text-emerald-100/70 font-bold text-sm mt-2">
          Pendientes por dictaminar: <span className="text-[#FACC15] text-xl font-black">{pendingLoans.length}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pendingLoans.map(({ loan, member }) => (
          <div key={loan.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 hover:shadow-2xl transition-all group flex flex-col justify-between h-full border-t-8 border-[#14532D]">
            <div>
              <div className="flex justify-between items-start mb-6">
                <div className="p-3 bg-emerald-50 text-[#14532D] rounded-xl"><FileText size={24} /></div>
                <span className="px-3 py-1 bg-amber-50 text-amber-600 text-[9px] font-black rounded-full uppercase">Solicitud Nueva</span>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Socio</p>
              <p className="text-lg font-black text-slate-800 truncate uppercase mb-4">{member.name}</p>
              <div className="flex justify-between items-end border-t border-slate-50 pt-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto</p>
                  <p className="text-2xl font-black text-[#14532D]">${loan.amount.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Plazo</p>
                  <p className="text-lg font-black text-slate-800">{loan.installmentsCount} m.</p>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setSelectedLoan({ loan, member })}
              className="mt-6 w-full py-4 bg-slate-50 text-[#14532D] rounded-2xl font-black text-xs uppercase hover:bg-[#14532D] hover:text-white transition-all border-2 border-transparent hover:border-[#FACC15]"
            >
              GESTIONAR TRÁMITE
            </button>
          </div>
        ))}

        {pendingLoans.length === 0 && (
          <div className="col-span-full py-40 flex flex-col items-center justify-center bg-slate-50/50 rounded-[4rem] border-4 border-dashed border-slate-100 text-slate-300">
             <CheckCircle2 size={80} className="mb-6 opacity-10" />
             <p className="font-black uppercase tracking-[0.4em] text-sm">Sin pendientes</p>
          </div>
        )}
      </div>
    </div>
  );
};
