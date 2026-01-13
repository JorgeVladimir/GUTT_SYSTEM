
import React, { useState, useMemo } from 'react';
import { User, Loan, Transaction, AccountType, LoanInstallment } from '../types';
import { 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Calendar, 
  ArrowLeft, 
  MessageSquareText, 
  Loader2, 
  Printer, 
  HandCoins, 
  Wallet, 
  CreditCard, 
  Search,
  Check,
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

interface CreditOfficerApprovalProps {
  users: User[];
  onUpdateUser: (user: User) => void;
  onApprove: (loanId: string, memberId: string, reason: string) => void;
  onReject: (loanId: string, memberId: string, reason: string) => void;
}

export const CreditOfficerApproval: React.FC<CreditOfficerApprovalProps> = ({ users, onUpdateUser, onApprove, onReject }) => {
  const [activeTab, setActiveTab] = useState<'APPROVALS' | 'COLLECTIONS'>('APPROVALS');
  const [selectedLoan, setSelectedLoan] = useState<{loan: Loan, member: User} | null>(null);
  const [officerReason, setOfficerReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Estados para Cobros
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentSource, setPaymentSource] = useState<'ACCOUNT' | 'TRANSFER'>('ACCOUNT');

  const pendingLoans = useMemo(() => users.flatMap(u => 
    (u.loans || []).filter(l => l.status === 'SOLICITADO').map(l => ({ loan: l, member: u }))
  ), [users]);

  const activeLoansForCollection = useMemo(() => {
    const q = paymentSearch.toLowerCase();
    return users.flatMap(u => 
      (u.loans || []).filter(l => l.status === 'VIGENTE' && (u.name.toLowerCase().includes(q) || u.id.includes(q)))
      .map(l => ({ loan: l, member: u }))
    );
  }, [users, paymentSearch]);

  const handleDecision = async (isApproval: boolean) => {
    const reasonText = officerReason.trim();
    if (!reasonText) return alert("Es obligatorio escribir un dictamen técnico.");
    if (isProcessing) return;

    if (window.confirm(isApproval ? "¿CONFIRMA la aprobación y desembolso?" : "¿RECHAZA esta solicitud?")) {
      setIsProcessing(true);
      if (selectedLoan) {
        if (isApproval) onApprove(selectedLoan.loan.id, selectedLoan.member.id, reasonText);
        else onReject(selectedLoan.loan.id, selectedLoan.member.id, reasonText);
        setSelectedLoan(null);
        setOfficerReason('');
      }
      setIsProcessing(false);
    }
  };

  const handlePayInstallment = (member: User, loan: Loan, installment: LoanInstallment) => {
    const savAcc = member.accounts.find(a => a.type === AccountType.SAVINGS);
    if (paymentSource === 'ACCOUNT' && (!savAcc || savAcc.balance < installment.total)) {
      return alert("El socio no posee saldo suficiente en su cuenta de ahorros para el débito.");
    }

    if (!confirm(`¿Desea procesar el pago de la Cuota #${installment.number} por $${installment.total.toFixed(2)} vía ${paymentSource === 'ACCOUNT' ? 'DÉBITO DIRECTO' : 'TRANSFERENCIA EXTERNA'}?`)) return;

    const updatedInstallments = loan.installments.map(inst => 
      inst.number === installment.number ? { ...inst, status: 'PAGADO' as const } : inst
    );

    const isLastInstallment = updatedInstallments.every(i => i.status === 'PAGADO');
    
    const updatedLoans = member.loans.map(l => 
      l.id === loan.id ? { 
        ...l, 
        balance: l.balance - installment.capital, 
        status: isLastInstallment ? 'PAGADO' as const : l.status,
        installments: updatedInstallments 
      } : l
    );

    let updatedAccounts = [...member.accounts];
    const newTransactions = [...(member.transactions || [])];

    if (paymentSource === 'ACCOUNT') {
      updatedAccounts = member.accounts.map(a => 
        a.type === AccountType.SAVINGS ? { ...a, balance: a.balance - installment.total } : a
      );
      newTransactions.unshift({
        id: `PAY-${Date.now()}`,
        date: new Date().toLocaleDateString('es-EC'),
        description: `PAGO CUOTA #${installment.number} PRÉSTAMO ${loan.id}`,
        amount: -installment.total,
        type: 'DEBIT',
        category: 'Pagos Crédito',
        accountId: savAcc?.id || 'unknown'
      });
    } else {
      // Transferencia externa: Primero entra el dinero a la cuenta y luego se paga
      newTransactions.unshift({
        id: `INFLOW-${Date.now()}`,
        date: new Date().toLocaleDateString('es-EC'),
        description: `DEPÓSITO EXT. PAGO CRÉDITO ${loan.id}`,
        amount: installment.total,
        type: 'CREDIT',
        category: 'Transferencia Externa',
        accountId: savAcc?.id || 'unknown'
      });
      newTransactions.unshift({
        id: `PAY-${Date.now() + 1}`,
        date: new Date().toLocaleDateString('es-EC'),
        description: `PAGO CUOTA #${installment.number} PRÉSTAMO ${loan.id}`,
        amount: -installment.total,
        type: 'DEBIT',
        category: 'Pagos Crédito',
        accountId: savAcc?.id || 'unknown'
      });
    }

    // Actualizar Buró (Mejora de Score por pago)
    const currentScore = member.bureau?.score || 800;
    const newScore = Math.min(1000, currentScore + 10);
    const updatedUser: User = {
      ...member,
      loans: updatedLoans,
      accounts: updatedAccounts,
      transactions: newTransactions,
      bureau: {
        score: newScore,
        rating: newScore > 900 ? 'EXCELENTE' : newScore > 750 ? 'BUENO' : 'REGULAR',
        lastUpdate: new Date().toLocaleDateString('es-EC'),
        totalLoans: member.loans.length,
        delinquencyDays: 0
      }
    };

    onUpdateUser(updatedUser);
    alert("¡Pago procesado con éxito! El Buró de Crédito del socio ha sido actualizado.");
  };

  if (selectedLoan) {
    const { loan, member } = selectedLoan;
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300 pb-10">
        <button onClick={() => setSelectedLoan(null)} className="flex items-center gap-2 text-slate-500 font-bold hover:text-[#14532D]"><ArrowLeft size={20} /> Volver</button>
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="bg-[#14532D] p-10 text-white flex justify-between items-center border-b-[12px] border-[#FACC15]">
            <div>
              <h2 className="text-3xl font-black italic">CAP</h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#FACC15]">Aprobación de Crédito</p>
              <p className="text-2xl font-black mt-4">{loan.id}</p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-black">${loan.amount.toLocaleString()}</p>
              <p className="text-xs font-bold opacity-70">Capital Solicitado</p>
            </div>
          </div>
          <div className="p-10 space-y-10">
            <div className="p-8 bg-slate-50 rounded-3xl border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Socio</p><p className="font-black text-[#14532D] text-lg">{member.name}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Condiciones</p><p className="font-black text-slate-800">{loan.rate}% • {loan.installmentsCount} Meses</p></div>
            </div>
            <textarea value={officerReason} onChange={e => setOfficerReason(e.target.value)} placeholder="Dictamen técnico..." className="w-full p-8 bg-slate-50 border-4 border-slate-100 rounded-[2rem] h-40 outline-none focus:border-[#14532D] font-bold" />
            <div className="flex gap-4">
              <button onClick={() => handleDecision(false)} className="flex-1 py-5 border-4 border-red-50 text-red-600 rounded-2xl font-black">RECHAZAR</button>
              <button onClick={() => handleDecision(true)} className="flex-[2] py-5 bg-[#14532D] text-white rounded-2xl font-black border-b-8 border-[#FACC15]">APROBAR Y DESEMBOLSAR</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="bg-[#14532D] p-10 rounded-[3rem] shadow-xl text-white flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter">Oficial de Crédito</h2>
          <p className="text-emerald-100/70 font-bold text-sm">Gestión de Trámites y Cobro de Dividendos</p>
        </div>
        <div className="bg-white/10 p-1.5 rounded-2xl flex gap-1">
          <button onClick={() => setActiveTab('APPROVALS')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'APPROVALS' ? 'bg-[#FACC15] text-[#14532D]' : 'text-emerald-100 hover:bg-white/5'}`}>Aprobaciones</button>
          <button onClick={() => setActiveTab('COLLECTIONS')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'COLLECTIONS' ? 'bg-[#FACC15] text-[#14532D]' : 'text-emerald-100 hover:bg-white/5'}`}>Gestión Cobros</button>
        </div>
      </div>

      {activeTab === 'APPROVALS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pendingLoans.map(({ loan, member }) => (
            <div key={loan.id} className="bg-white p-6 rounded-[2.5rem] border-t-8 border-[#14532D] shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Socio</p>
                <p className="text-lg font-black text-slate-800 uppercase mb-4 truncate">{member.name}</p>
                <div className="flex justify-between border-t pt-4">
                  <div><p className="text-[10px] font-black text-slate-400 uppercase">Monto</p><p className="text-2xl font-black text-[#14532D]">${loan.amount.toLocaleString()}</p></div>
                  <div className="text-right"><p className="text-[10px] font-black text-slate-400 uppercase">Plazo</p><p className="text-lg font-black text-slate-800">{loan.installmentsCount} m.</p></div>
                </div>
              </div>
              <button onClick={() => setSelectedLoan({ loan, member })} className="mt-6 w-full py-4 bg-slate-50 text-[#14532D] rounded-2xl font-black text-xs uppercase hover:bg-[#14532D] hover:text-white transition-all">GESTIONAR TRÁMITE</button>
            </div>
          ))}
          {pendingLoans.length === 0 && <div className="col-span-full py-20 text-center opacity-20"><ShieldCheck size={80} className="mx-auto mb-4" /><p className="font-black uppercase tracking-widest">Sin solicitudes pendientes</p></div>}
        </div>
      )}

      {activeTab === 'COLLECTIONS' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              <input type="text" placeholder="Buscar por Nombre o Cédula..." value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl outline-none font-bold focus:border-[#14532D] transition-all" />
            </div>
            <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border w-full md:w-auto">
              <button onClick={() => setPaymentSource('ACCOUNT')} className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all flex items-center gap-2 ${paymentSource === 'ACCOUNT' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}><Wallet size={16} /> Débito Cuenta</button>
              <button onClick={() => setPaymentSource('TRANSFER')} className={`flex-1 md:flex-none px-6 py-3 rounded-xl font-black text-[10px] uppercase transition-all flex items-center gap-2 ${paymentSource === 'TRANSFER' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}><CreditCard size={16} /> Transferencia</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {activeLoansForCollection.map(({ loan, member }) => {
              const pendingInst = loan.installments.find(i => i.status === 'PENDIENTE');
              return (
                <div key={loan.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 text-[#14532D] rounded-full flex items-center justify-center font-black">{member.name[0]}</div>
                      <div>
                        <p className="font-black text-slate-800 uppercase leading-none">{member.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{loan.id} • {loan.type}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 pt-2">
                       <div className="px-3 py-1 bg-slate-50 rounded-lg text-[9px] font-black text-slate-500 uppercase">Saldo: ${loan.balance.toFixed(2)}</div>
                       <div className="px-3 py-1 bg-emerald-50 rounded-lg text-[9px] font-black text-emerald-600 uppercase">Buró: {member.bureau?.score || 800} pts</div>
                    </div>
                  </div>

                  {pendingInst ? (
                    <div className="flex flex-col md:flex-row items-center gap-6 w-full md:w-auto border-t md:border-t-0 md:border-l pt-6 md:pt-0 md:pl-8 border-slate-100">
                      <div className="text-center md:text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Próximo Dividendo (Cuota #{pendingInst.number})</p>
                        <p className="text-3xl font-black text-[#14532D]">${pendingInst.total.toFixed(2)}</p>
                      </div>
                      <button 
                        onClick={() => handlePayInstallment(member, loan, pendingInst)}
                        className="w-full md:w-auto px-10 py-4 bg-[#14532D] text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                        COBRAR AHORA <HandCoins size={20} className="text-[#FACC15]" />
                      </button>
                    </div>
                  ) : (
                    <div className="px-8 py-3 bg-emerald-100 text-emerald-700 rounded-2xl font-black text-[10px] uppercase">✓ PRÉSTAMO CANCELADO</div>
                  )}
                </div>
              );
            })}
            {activeLoansForCollection.length === 0 && <div className="py-20 text-center opacity-20"><Search size={80} className="mx-auto mb-4" /><p className="font-black uppercase tracking-widest">No se encontraron créditos vigentes</p></div>}
          </div>
        </div>
      )}
    </div>
  );
};
