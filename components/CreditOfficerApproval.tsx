import React, { useState, useMemo, useEffect } from 'react';
import { DataService } from '../services/dataService';
import { User, Loan, Transaction, AccountType, LoanInstallment, InterestRate, GlobalConfig, UserRole } from '../types';
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
  ShieldCheck,
  ShieldAlert,
  Scale,
  Ban,
  Coins,
  History,
  TrendingUp,
  AlertTriangle,
  UserCheck
} from 'lucide-react';

interface CreditOfficerApprovalProps {
  users: User[];
  currentUser?: User;
  onUpdateUser: (user: User) => void;
  onApprove: (loanId: string, memberId: string, reason: string) => void;
  onReject: (loanId: string, memberId: string, reason: string) => void;
  activeTab?: 'APPROVALS' | 'COLLECTIONS' | 'NEW_LOAN' | 'CARTERA';
  onActiveTabChange?: (tab: 'APPROVALS' | 'COLLECTIONS' | 'NEW_LOAN' | 'CARTERA') => void;
}

export const CreditOfficerApproval: React.FC<CreditOfficerApprovalProps> = ({ 
  users, 
  currentUser, 
  onUpdateUser, 
  onApprove, 
  onReject,
  activeTab: propActiveTab,
  onActiveTabChange
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState<'APPROVALS' | 'COLLECTIONS' | 'NEW_LOAN' | 'CARTERA'>('APPROVALS');
  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab;
  const setActiveTab = onActiveTabChange !== undefined ? onActiveTabChange : setInternalActiveTab;
  const [selectedLoan, setSelectedLoan] = useState<{loan: Loan, member: User} | null>(null);
  const [officerReason, setOfficerReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Dynamic Rates and Config
  const [rates, setRates] = useState<InterestRate[]>([]);
  const [config, setConfig] = useState<GlobalConfig>({ minLoanAmount: 100, maxLoanAmount: 1000000, maxGlobalTerm: 360 });

  useEffect(() => {
    const fetchRatesAndConfig = async () => {
      try {
        const fetchedRates = await DataService.getRates();
        setRates(fetchedRates);
        const fetchedConfig = await DataService.getConfig();
        if (fetchedConfig && fetchedConfig.minLoanAmount) {
          setConfig(fetchedConfig);
        }
      } catch (err) {
        console.error('Error fetching rates/config in officer hub:', err);
      }
    };
    fetchRatesAndConfig();
  }, []);

  // ── ESTADOS PARA COBROS ──
  const [paymentSearch, setPaymentSearch] = useState('');
  const [paymentSource, setPaymentSource] = useState<'ACCOUNT' | 'TRANSFER'>('ACCOUNT');
  const [applyProrating, setApplyProrating] = useState(false);

  // ── ESTADOS PARA NUEVA SOLICITUD DESDE ASESOR ──
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUserForLoan, setSelectedUserForLoan] = useState<User | null>(null);
  const [newLoanAmount, setNewLoanAmount] = useState('');
  const [newLoanTerm, setNewLoanTerm] = useState(12);
  const [selectedRateId, setSelectedRateId] = useState('');
  const [customRate, setCustomRate] = useState('');
  const [newLoanWarrantyType, setNewLoanWarrantyType] = useState<'SOLIDARIA' | 'PRENDARIA' | 'HIPOTECARIA' | 'DEPOSITO_PLAZO' | 'GRUPO_SOLIDARIO'>('SOLIDARIA');
  const [newLoanSolidariaGuarantorName, setNewLoanSolidariaGuarantorName] = useState('');
  const [newLoanSolidariaGuarantorId, setNewLoanSolidariaGuarantorId] = useState('');
  const [newLoanPrendariaValuation, setNewLoanPrendariaValuation] = useState('');
  const [newLoanPrendariaInsurance, setNewLoanPrendariaInsurance] = useState('');
  const [newLoanPrendariaDescription, setNewLoanPrendariaDescription] = useState('');
  const [newLoanHipotecariaInmueble, setNewLoanHipotecariaInmueble] = useState('');
  const [newLoanHipotecariaAvaluo, setNewLoanHipotecariaAvaluo] = useState('');
  const [newLoanHipotecariaRegistro, setNewLoanHipotecariaRegistro] = useState('');
  const [newLoanDpfNumero, setNewLoanDpfNumero] = useState('');
  const [newLoanDpfValor, setNewLoanDpfValor] = useState('');
  const [newLoanGrupoNombre, setNewLoanGrupoNombre] = useState('');
  const [newLoanGrupoIntegrantes, setNewLoanGrupoIntegrantes] = useState('');

  // Estados para operaciones en lote
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [selectedApprovedIds, setSelectedApprovedIds] = useState<string[]>([]);
  const [bulkReason, setBulkReason] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // ── ESTADOS PARA CARTERA Y ANULACIONES ──
  const [carteraSearch, setCarteraSearch] = useState('');
  const [selectedLoanForStatusChange, setSelectedLoanForStatusChange] = useState<{ loan: Loan, member: User } | null>(null);
  const [newLoanStatus, setNewLoanStatus] = useState<'TRAMITE_JUDICIAL' | 'CASTIGADO' | 'VIGENTE'>('TRAMITE_JUDICIAL');
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [selectedLoanForPayments, setSelectedLoanForPayments] = useState<{ loan: Loan, member: User } | null>(null);

  // Dynamic search state
  const [searchedMembers, setSearchedMembers] = useState<User[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);

  // Load engram state on mount
  useEffect(() => {
    const loadEngramState = async () => {
      const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === 'true';
      if (!useRemoteApi) return;
      try {
        const res = await fetch('/api/engrams/credit-officer-loan-state');
        const data = await res.json();
        if (data.ok && data.data && data.data.contenido) {
          const state = data.data.contenido;
          if (state.selectedUserForLoan) setSelectedUserForLoan(state.selectedUserForLoan);
          if (state.newLoanAmount) setNewLoanAmount(state.newLoanAmount);
          if (state.newLoanTerm) setNewLoanTerm(state.newLoanTerm);
          if (state.selectedRateId) setSelectedRateId(state.selectedRateId);
          if (state.customRate) setCustomRate(state.customRate);
          if (state.newLoanWarrantyType) setNewLoanWarrantyType(state.newLoanWarrantyType);
          if (state.newLoanSolidariaGuarantorName) setNewLoanSolidariaGuarantorName(state.newLoanSolidariaGuarantorName);
          if (state.newLoanSolidariaGuarantorId) setNewLoanSolidariaGuarantorId(state.newLoanSolidariaGuarantorId);
          if (state.newLoanPrendariaValuation) setNewLoanPrendariaValuation(state.newLoanPrendariaValuation);
          if (state.newLoanPrendariaInsurance) setNewLoanPrendariaInsurance(state.newLoanPrendariaInsurance);
          if (state.newLoanPrendariaDescription) setNewLoanPrendariaDescription(state.newLoanPrendariaDescription);
          if (state.newLoanHipotecariaInmueble) setNewLoanHipotecariaInmueble(state.newLoanHipotecariaInmueble);
          if (state.newLoanHipotecariaAvaluo) setNewLoanHipotecariaAvaluo(state.newLoanHipotecariaAvaluo);
          if (state.newLoanHipotecariaRegistro) setNewLoanHipotecariaRegistro(state.newLoanHipotecariaRegistro);
          if (state.newLoanDpfNumero) setNewLoanDpfNumero(state.newLoanDpfNumero);
          if (state.newLoanDpfValor) setNewLoanDpfValor(state.newLoanDpfValor);
          if (state.newLoanGrupoNombre) setNewLoanGrupoNombre(state.newLoanGrupoNombre);
          if (state.newLoanGrupoIntegrantes) setNewLoanGrupoIntegrantes(state.newLoanGrupoIntegrantes);
          if (state.memberSearch) setMemberSearch(state.memberSearch);
        }
      } catch (err) {
        console.error('Error loading engram state:', err);
      }
    };
    loadEngramState();
  }, []);

  // Save engram state on state change (1s debounce)
  useEffect(() => {
    const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === 'true';
    if (!useRemoteApi) return;

    const delayDebounce = setTimeout(async () => {
      // Don't save if all core fields are empty to avoid overwriting on initial load
      if (!selectedUserForLoan && !newLoanAmount && !memberSearch) return;

      const payload = {
        clave: 'credit-officer-loan-state',
        modulo: 'CreditOfficer',
        contenido: {
          selectedUserForLoan,
          newLoanAmount,
          newLoanTerm,
          selectedRateId,
          customRate,
          newLoanWarrantyType,
          newLoanSolidariaGuarantorName,
          newLoanSolidariaGuarantorId,
          newLoanPrendariaValuation,
          newLoanPrendariaInsurance,
          newLoanPrendariaDescription,
          newLoanHipotecariaInmueble,
          newLoanHipotecariaAvaluo,
          newLoanHipotecariaRegistro,
          newLoanDpfNumero,
          newLoanDpfValor,
          newLoanGrupoNombre,
          newLoanGrupoIntegrantes,
          memberSearch
        },
        usuario: 'asesor'
      };

      try {
        await fetch('/api/engrams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('Error saving engram state:', err);
      }
    }, 1000);

    return () => clearTimeout(delayDebounce);
  }, [
    selectedUserForLoan,
    newLoanAmount,
    newLoanTerm,
    selectedRateId,
    customRate,
    newLoanWarrantyType,
    newLoanSolidariaGuarantorName,
    newLoanSolidariaGuarantorId,
    newLoanPrendariaValuation,
    newLoanPrendariaInsurance,
    newLoanPrendariaDescription,
    newLoanHipotecariaInmueble,
    newLoanHipotecariaAvaluo,
    newLoanHipotecariaRegistro,
    newLoanDpfNumero,
    newLoanDpfValor,
    newLoanGrupoNombre,
    newLoanGrupoIntegrantes,
    memberSearch
  ]);

  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      const trimmed = memberSearch.trim();
      if (!trimmed) {
        setSearchedMembers([]);
        return;
      }
      
      const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === 'true';
      if (useRemoteApi) {
        setIsSearchingMembers(true);
        try {
          const res = await fetch(`/api/socios/buscar?q=${encodeURIComponent(trimmed)}`);
          const data = await res.json();
          if (data.ok && Array.isArray(data.data)) {
            // Relacionar socio dentro de la tabla RegistroSocio, este como "SOCIO" en el campo TIPOPERSONA
            const sociosOnly = data.data.filter((u: any) => u.personType === 'SOCIO');
            setSearchedMembers(sociosOnly);
          } else {
            setSearchedMembers([]);
          }
        } catch (err) {
          console.error('Error searching members:', err);
          setSearchedMembers([]);
        } finally {
          setIsSearchingMembers(false);
        }
      } else {
        // Fallback to local users list
        const q = trimmed.toLowerCase();
        const localResults = users.filter(u => 
          (u.personType === 'SOCIO' || u.role === UserRole.MEMBER) && 
          (u.name.toLowerCase().includes(q) || u.id.includes(q))
        );
        setSearchedMembers(localResults);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [memberSearch, users]);

  const selectedRate = useMemo(() => {
    if (rates.length === 0) return null;
    return rates.find(r => r.id === selectedRateId) || rates[0];
  }, [selectedRateId, rates]);

  // Set default selected rate on rates load
  useEffect(() => {
    if (rates.length > 0 && !selectedRateId) {
      setSelectedRateId(rates[0].id);
    }
  }, [rates]);

  // Update custom rate when rate selection changes
  useEffect(() => {
    if (selectedRate) {
      setCustomRate(selectedRate.rate.toString());
    }
  }, [selectedRate]);

  const numNewLoanAmount = parseFloat(newLoanAmount);
  const isNewLoanAmountValid = !isNaN(numNewLoanAmount) && numNewLoanAmount >= config.minLoanAmount && numNewLoanAmount <= config.maxLoanAmount;

  // Selected member's certificates balance (Linked CuentasAhorro relation with min $1.00 validation)
  const memberCertBalance = useMemo(() => {
    if (!selectedUserForLoan) return 0;
    const certAcc = selectedUserForLoan.accounts.find(a => 
      a.type === AccountType.CERTIFICATE || 
      (a.type as any) === 'CERTIFICADO_APORTACION'
    );
    return certAcc ? certAcc.balance : 0;
  }, [selectedUserForLoan]);

  // Advisor Amortization Simulation
  const simulation = useMemo(() => {
    if (!isNewLoanAmountValid || !selectedRate) return null;
    const rateVal = parseFloat(customRate) || selectedRate.rate;
    const p = numNewLoanAmount;
    const r = (rateVal / 100) / 12;
    const n = Math.min(newLoanTerm, selectedRate.maxTerm, config.maxGlobalTerm);
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
  }, [numNewLoanAmount, isNewLoanAmountValid, newLoanTerm, selectedRate, customRate, config]);

  const pendingLoans = useMemo(() => users.flatMap(u => 
    (u.loans || []).filter(l => l.status === 'SOLICITADO').map(l => ({ loan: l, member: u }))
  ), [users]);

  const approvedLoans = useMemo(() => users.flatMap(u => 
    (u.loans || []).filter(l => l.status === 'APROBADO').map(l => ({ loan: l, member: u }))
  ), [users]);

  const activeLoansForCollection = useMemo(() => {
    const q = paymentSearch.toLowerCase();
    return users.flatMap(u => 
      (u.loans || []).filter(l => l.status === 'VIGENTE' && (u.name.toLowerCase().includes(q) || u.id.includes(q)))
      .map(l => ({ loan: l, member: u }))
    );
  }, [users, paymentSearch]);

  const allActiveLoansForCartera = useMemo(() => {
    const q = carteraSearch.toLowerCase();
    return users.flatMap(u => 
      (u.loans || []).filter(l => l.status !== 'SOLICITADO' && l.status !== 'APROBADO' && (u.name.toLowerCase().includes(q) || u.id.includes(q)))
      .map(l => ({ loan: l, member: u }))
    );
  }, [users, carteraSearch]);

  // Role details
  const currentUserRole = currentUser?.role || UserRole.CREDIT_OFFICER;

  const refreshMembers = async (memberIds: string[]) => {
    const uniqueIds = Array.from(new Set(memberIds));
    for (const id of uniqueIds) {
      try {
        const searchRes = await fetch(`/api/socios/buscar?q=${encodeURIComponent(id)}`);
        const data = await searchRes.json();
        if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
          onUpdateUser(data.data[0]);
        }
      } catch (err) {
        console.error('Error refreshing member:', id, err);
      }
    }
  };

  const handleDecision = async (isApproval: boolean) => {
    const reasonText = officerReason.trim();
    if (!reasonText) return alert("Es obligatorio escribir un dictamen técnico.");
    if (isProcessing) return;

    if (selectedLoan) {
      const loanAmount = selectedLoan.loan.amount;

      // Role check limit enforcement
      if (currentUserRole === UserRole.CREDIT_OFFICER) {
        return alert("Acceso Denegado: Los asesores de crédito no tienen permisos para aprobar o rechazar solicitudes.");
      }

      if (isApproval) {
        if (currentUserRole === UserRole.MANAGER && loanAmount > 50000.00) {
          return alert(`Límite Excedido: Como Jefe de Crédito, su límite de aprobación es de $50,000.00 USD. Esta operación de $${loanAmount.toFixed(2)} USD requiere ser aprobada por un Administrador.`);
        }
      }

      if (window.confirm(isApproval ? "¿CONFIRMA la aprobación de la solicitud?" : "¿RECHAZA esta solicitud?")) {
        setIsProcessing(true);
        try {
          if (isApproval) {
            onApprove(selectedLoan.loan.id, selectedLoan.member.id, reasonText);
          } else {
            onReject(selectedLoan.loan.id, selectedLoan.member.id, reasonText);
          }
          setSelectedLoan(null);
          setOfficerReason('');
        } catch (err) {
          console.error(err);
        } finally {
          setIsProcessing(false);
        }
      }
    }
  };

  const handleBulkApprove = async () => {
    if (selectedPendingIds.length === 0) return alert("Seleccione al menos una solicitud.");
    const reasonText = bulkReason.trim();
    if (!reasonText) return alert("Es obligatorio escribir un dictamen técnico para aprobar masivamente.");
    
    if (currentUserRole === UserRole.CREDIT_OFFICER) {
      return alert("Acceso Denegado: Los asesores de crédito no tienen permisos para aprobar solicitudes.");
    }

    if (!confirm(`¿Confirma la aprobación de las ${selectedPendingIds.length} solicitudes seleccionadas?`)) return;

    setIsBulkProcessing(true);
    try {
      const res = await DataService.approveLoans(selectedPendingIds, reasonText, currentUser?.id);
      if (res.ok) {
        alert("¡Solicitudes aprobadas con éxito! (Estado: APROBADO)");
        const affectedMembers = pendingLoans
          .filter(pl => selectedPendingIds.includes(pl.loan.id))
          .map(pl => pl.member.id);

        await refreshMembers(affectedMembers);
        setSelectedPendingIds([]);
        setBulkReason('');
      } else {
        alert("Error al aprobar: " + (res.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al procesar la aprobación masiva.");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDisburse = async () => {
    if (selectedApprovedIds.length === 0) return alert("Seleccione al menos un crédito para desembolsar.");
    
    if (currentUserRole === UserRole.CREDIT_OFFICER) {
      return alert("Acceso Denegado: Los asesores de crédito no tienen permisos para desembolsar fondos.");
    }

    if (!confirm(`¿Confirma el desembolso contable de los ${selectedApprovedIds.length} créditos seleccionados? Se transferirán los fondos y se generarán los asientos contables.`)) return;

    setIsBulkProcessing(true);
    try {
      const res = await DataService.disburseLoans(selectedApprovedIds, currentUser?.id);
      if (res.ok) {
        let msg = "¡Créditos desembolsados con éxito!";
        if (res.failures && res.failures.length > 0) {
          msg += `\nExitosos: ${res.successes?.length || 0}, Fallidos: ${res.failures.length}.`;
          res.failures.forEach((f: any) => {
            msg += `\n- ${f.loanId}: ${f.error}`;
          });
        }
        alert(msg);

        const affectedMembers = approvedLoans
          .filter(al => selectedApprovedIds.includes(al.loan.id))
          .map(al => al.member.id);

        await refreshMembers(affectedMembers);
        setSelectedApprovedIds([]);
      } else {
        alert("Error al desembolsar: " + (res.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al procesar el desembolso masivo.");
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handlePayInstallment = async (member: User, loan: Loan, installment: LoanInstallment) => {
    const savAcc = member.accounts.find(a => a.type === AccountType.SAVINGS);
    
    // Recalculate if prorating is checked (50% interest discount)
    let totalToPay = installment.total;
    let interestPaid = installment.interest;
    if (applyProrating) {
      const discount = parseFloat((installment.interest * 0.50).toFixed(2));
      interestPaid = parseFloat((installment.interest - discount).toFixed(2));
      totalToPay = parseFloat((installment.capital + interestPaid).toFixed(2));
    }

    if (paymentSource === 'ACCOUNT' && (!savAcc || savAcc.balance < totalToPay)) {
      return alert(`El socio no posee saldo suficiente en su cuenta de ahorros. Requerido: $${totalToPay.toFixed(2)} USD (Saldo: $${savAcc?.balance.toFixed(2) || '0.00'} USD).`);
    }

    const prMsg = applyProrating ? " (CON PRORRATEO del 50% de interés)" : "";
    if (!confirm(`¿Desea procesar el pago de la Cuota #${installment.number} por $${totalToPay.toFixed(2)} USD${prMsg} vía ${paymentSource === 'ACCOUNT' ? 'DÉBITO DE CUENTA' : 'EFECTIVO / CAJA'}?`)) return;

    setIsProcessing(true);
    try {
      const res = await DataService.payInstallment(member.id, loan.id, installment.number, paymentSource, totalToPay, applyProrating);
      if (res.ok) {
        alert("¡Cobro de dividendo procesado con éxito!");
        // Reload users list
        const searchRes = await fetch(`/api/socios/buscar?q=${member.id}`);
        const data = await searchRes.json();
        if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
          onUpdateUser(data.data[0]);
        }
        setApplyProrating(false);
      } else {
        alert("Error al procesar el cobro: " + (res.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Error al procesar el pago de dividendo.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Advisor loan request creation
  const handleCreateLoanRequest = async () => {
    if (!selectedUserForLoan || !simulation || !selectedRate) return;

    if (memberCertBalance < 1.00) {
      return alert(`No se puede radicar crédito: El socio debe poseer al menos $1.00 USD en Certificados de Aportación. Saldo actual: $${memberCertBalance.toFixed(2)} USD.`);
    }

    const rateVal = parseFloat(customRate) || selectedRate.rate;
    const maxRateLimit = (selectedRate as any).maxRate || selectedRate.rate;
    if (rateVal > maxRateLimit) {
      return alert(`La Tasa Efectiva Anual (${rateVal}%) supera el techo regulatorio máximo permitido para esta línea (${maxRateLimit}%).`);
    }

    const warrantyInfo = {
      tipo: newLoanWarrantyType,
      solidaria: newLoanWarrantyType === 'SOLIDARIA' ? { garanteNombre: newLoanSolidariaGuarantorName, garanteCedula: newLoanSolidariaGuarantorId } : null,
      prendaria: newLoanWarrantyType === 'PRENDARIA' ? { descripcion: newLoanPrendariaDescription, avaluo: parseFloat(newLoanPrendariaValuation) || 0, aseguradora: newLoanPrendariaInsurance } : null,
      hipotecaria: newLoanWarrantyType === 'HIPOTECARIA' ? { inmueble: newLoanHipotecariaInmueble, avaluo: parseFloat(newLoanHipotecariaAvaluo) || 0, registro: newLoanHipotecariaRegistro } : null,
      depositoPlazo: newLoanWarrantyType === 'DEPOSITO_PLAZO' ? { dpfNumero: newLoanDpfNumero, dpfValor: parseFloat(newLoanDpfValor) || 0 } : null,
      grupoSolidario: newLoanWarrantyType === 'GRUPO_SOLIDARIO' ? { grupoNombre: newLoanGrupoNombre, integrantes: parseInt(newLoanGrupoIntegrantes) || 0 } : null
    };

    const newLoan: Loan = {
      id: `CRD-${Date.now()}`,
      memberId: selectedUserForLoan.id,
      memberName: selectedUserForLoan.name,
      amount: numNewLoanAmount,
      balance: numNewLoanAmount,
      rate: rateVal,
      installmentsCount: newLoanTerm,
      installments: simulation.installments,
      status: 'SOLICITADO',
      type: selectedRate.category,
      startDate: new Date().toLocaleDateString('es-EC'),
      dueDate: new Date(Date.now() + newLoanTerm * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-EC'),
      garantiaInfo: warrantyInfo as any,
      origen: 'CAJA_PATATE'
    };

    setIsProcessing(true);
    try {
      const res = await DataService.applyLoan(newLoan);
      if (res.ok) {
        alert("¡Solicitud de crédito creada e ingresada con éxito!");
        
        // Clear the engram store
        const useRemoteApi = import.meta.env.VITE_USE_REMOTE_API === 'true';
        if (useRemoteApi) {
          fetch('/api/engrams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clave: 'credit-officer-loan-state',
              modulo: 'CreditOfficer',
              contenido: {},
              usuario: 'asesor'
            })
          }).catch(console.error);
        }

        // Reload member
        const searchRes = await fetch(`/api/socios/buscar?q=${selectedUserForLoan.id}`);
        const data = await searchRes.json();
        if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
          onUpdateUser(data.data[0]);
        }
        setSelectedUserForLoan(null);
        setNewLoanAmount('');
        setMemberSearch('');
        setNewLoanSolidariaGuarantorName('');
        setNewLoanSolidariaGuarantorId('');
        setNewLoanPrendariaValuation('');
        setNewLoanPrendariaInsurance('');
      } else {
        alert("Error al guardar solicitud: " + (res.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al radicar crédito.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Cartera: Update status transition
  const handleUpdateStatus = async () => {
    if (!selectedLoanForStatusChange) return;
    const { loan, member } = selectedLoanForStatusChange;

    if (newLoanStatus === 'CASTIGADO' && loan.status !== 'VENCIDO') {
      return alert("El castigo de cartera solo es permitido para créditos con estado VENCIDO.");
    }

    if (newLoanStatus === 'CASTIGADO' && currentUserRole !== UserRole.MANAGER && currentUserRole !== UserRole.ADMIN) {
      return alert("Acceso Denegado: Solo usuarios con rango de Jefe de Crédito (MANAGER) o Administrador (ADMIN) pueden castigar cartera.");
    }

    const prMsg = newLoanStatus === 'VIGENTE' ? "Acuerdo de Reactivación" : "Cambio de Estado";
    if (!confirm(`¿Confirma cambiar el estado del crédito ${loan.id} a ${newLoanStatus}?`)) return;

    setIsProcessing(true);
    try {
      const res = await DataService.updateLoanStatus(loan.id, newLoanStatus, statusChangeReason, currentUser?.id);
      if (res.ok) {
        alert(`¡Crédito actualizado a ${newLoanStatus} con éxito!`);
        const searchRes = await fetch(`/api/socios/buscar?q=${member.id}`);
        const data = await searchRes.json();
        if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
          onUpdateUser(data.data[0]);
        }
        setSelectedLoanForStatusChange(null);
        setStatusChangeReason('');
      } else {
        alert("Error al actualizar estado: " + (res.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Error al actualizar estado de cartera.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Cartera: Void/Anular credit
  const handleAnularLoan = async (loan: Loan, member: User) => {
    if (currentUserRole !== UserRole.MANAGER && currentUserRole !== UserRole.ADMIN) {
      return alert("Acceso Denegado: La anulación de créditos requiere permisos de nivel Jefe de Crédito (MANAGER) o Administrador.");
    }

    // Check if there are paid installments
    const hasPaid = loan.installments.some(i => i.status === 'PAGADO');
    if (hasPaid) {
      return alert("No se puede anular el crédito porque tiene dividendos cobrados. Debe reversar primero todos los cobros de cuotas.");
    }

    if (!confirm(`¿CONFIRMA la anulación completa del crédito ${loan.id}? Se reversará el desembolso y todos los cobros contables asociados en la cuenta del socio.`)) return;

    setIsProcessing(true);
    try {
      const res = await DataService.anularLoan(loan.id, currentUser?.id);
      if (res.ok) {
        alert("¡El crédito ha sido ANULADO exitosamente y el reverso contable completado!");
        const searchRes = await fetch(`/api/socios/buscar?q=${member.id}`);
        const data = await searchRes.json();
        if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
          onUpdateUser(data.data[0]);
        }
      } else {
        alert("Error al anular crédito: " + (res.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al anular crédito.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Cartera: Void payment (revert cuota to PENDIENTE)
  const handleAnularPayment = async (member: User, loan: Loan, installment: LoanInstallment) => {
    if (currentUserRole !== UserRole.MANAGER && currentUserRole !== UserRole.ADMIN) {
      return alert("Acceso Denegado: La anulación de cobros requiere permisos de nivel Jefe de Crédito (MANAGER) o Administrador.");
    }

    if (!confirm(`¿Desea ANULAR el cobro de la Cuota #${installment.number} por $${installment.total.toFixed(2)} USD? Esta cuota retornará al estado PENDIENTE, se restará del saldo pagado y se debitará/reversará la transacción contable.`)) return;

    setIsProcessing(true);
    try {
      const res = await DataService.anularPayment(loan.id, installment.number, currentUser?.id);
      if (res.ok) {
        alert("¡El cobro del dividendo ha sido anulado con éxito!");
        const searchRes = await fetch(`/api/socios/buscar?q=${member.id}`);
        const data = await searchRes.json();
        if (data.ok && Array.isArray(data.data) && data.data.length > 0) {
          onUpdateUser(data.data[0]);
          // Refresh selected loan in payments viewer
          const updatedUser = data.data[0];
          const updatedLoan = updatedUser.loans.find((l: any) => l.id === loan.id);
          if (updatedLoan) {
            setSelectedLoanForPayments({ loan: updatedLoan, member: updatedUser });
          } else {
            setSelectedLoanForPayments(null);
          }
        }
      } else {
        alert("Error al anular el pago: " + (res.message || ''));
      }
    } catch (err) {
      console.error(err);
      alert("Error de red al anular cobro.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Layout selection back to overview
  if (selectedLoan) {
    const { loan, member } = selectedLoan;
    const isOfficerLimited = currentUserRole === UserRole.CREDIT_OFFICER && loan.amount > 20000.00;
    const isManagerLimited = currentUserRole === UserRole.MANAGER && loan.amount > 50000.00;
    const isApprovalBlocked = isOfficerLimited || isManagerLimited;

    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in zoom-in duration-300 pb-10">
        <button onClick={() => setSelectedLoan(null)} className="flex items-center gap-2 text-slate-500 font-bold hover:text-[#14532D]"><ArrowLeft size={20} /> Volver</button>
        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
          <div className="bg-[#14532D] p-10 text-white flex justify-between items-center border-b-[12px] border-[#FACC15]">
            <div>
              <h2 className="text-3xl font-black italic text-[#FACC15]">G</h2>
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
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Socio</p><p className="font-black text-[#14532D] text-lg uppercase">{member.name}</p></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase">Condiciones</p><p className="font-black text-slate-800">{loan.rate}% • {loan.installmentsCount} Meses</p></div>
            </div>

            {/* Warnings regarding limits */}
            {isApprovalBlocked && (
              <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 flex gap-4 items-start">
                <AlertTriangle size={24} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black uppercase">Aprobación Restringida por Rol</p>
                  <p className="text-[11px] font-semibold mt-1">
                    {isOfficerLimited ? 'Como Asesor de Crédito (CREDIT_OFFICER), su límite máximo es de $20,000.00 USD.' : ''}
                    {isManagerLimited ? 'Como Jefe de Crédito (MANAGER), su límite máximo es de $50,000.00 USD.' : ''}
                    {' Para aprobar este crédito de $'}{loan.amount.toLocaleString()}{' USD se requiere que un perfil con rol superior apruebe la solicitud.'}
                  </p>
                </div>
              </div>
            )}

            <textarea value={officerReason} onChange={e => setOfficerReason(e.target.value)} placeholder="Escriba el dictamen técnico o justificación para la aprobación/rechazo..." className="w-full p-8 bg-slate-50 border-4 border-slate-100 rounded-[2rem] h-40 outline-none focus:border-[#14532D] font-bold text-slate-800" />
            <div className="flex gap-4">
              <button onClick={() => handleDecision(false)} className="flex-1 py-5 border-4 border-red-50 hover:bg-red-50 text-red-600 rounded-2xl font-black transition-all">RECHAZAR</button>
              <button 
                onClick={() => handleDecision(true)} 
                disabled={isApprovalBlocked}
                className={`flex-[2] py-5 text-white rounded-2xl font-black transition-all ${
                  isApprovalBlocked ? 'bg-slate-300 border-none cursor-not-allowed text-slate-500' : 'bg-[#14532D] hover:bg-emerald-800 border-b-8 border-[#FACC15]'
                }`}
              >
                APROBAR SOLICITUD
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="bg-[#14532D] p-10 rounded-[3rem] shadow-xl text-white flex flex-col xl:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tighter">Portal Cartera & Crédito</h2>
          <p className="text-emerald-100/70 font-bold text-sm">Administración Integral del Ciclo de Vida de Préstamos</p>
        </div>
        {/* Submenús consolidados en la barra lateral vertical */}
      </div>

      {/* TABA 1: APROBACIONES */}
      {activeTab === 'APPROVALS' && (
        <div className="space-y-10">
          {currentUserRole === UserRole.CREDIT_OFFICER && (
            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 flex gap-4 items-start">
              <AlertTriangle size={24} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-black uppercase">Restricción de Perfil</p>
                <p className="text-[11px] font-semibold mt-1">
                  Como Asesor de Crédito, no posee permisos para aprobar o desembolsar préstamos en el sistema. Las solicitudes creadas deben ser aprobadas y desembolsadas por el Administrador o un Jefe de Crédito.
                </p>
              </div>
            </div>
          )}

          {/* SUBPANEL 1: Solicitudes por Aprobar */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
              <div>
                <h3 className="text-xl font-black text-slate-800">1. Solicitudes de Crédito Pendientes</h3>
                <p className="text-slate-500 font-medium text-xs">Aprobación inicial de solicitudes (SOLICITADO → APROBADO)</p>
              </div>
              {currentUserRole !== UserRole.CREDIT_OFFICER && pendingLoans.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-stretch sm:items-center">
                  <input
                    type="text"
                    placeholder="Dictamen técnico para lote..."
                    value={bulkReason}
                    onChange={e => setBulkReason(e.target.value)}
                    className="px-4 py-2 bg-slate-50 border rounded-xl font-bold text-xs outline-none focus:border-[#14532D]"
                  />
                  <button
                    onClick={handleBulkApprove}
                    disabled={selectedPendingIds.length === 0 || isBulkProcessing}
                    className="px-5 py-3 bg-[#14532D] hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-black text-[10px] uppercase transition-all"
                  >
                    Aprobar Lote ({selectedPendingIds.length})
                  </button>
                </div>
              )}
            </div>

            {pendingLoans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                      {currentUserRole !== UserRole.CREDIT_OFFICER && (
                        <th className="p-4 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={selectedPendingIds.length === pendingLoans.length}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedPendingIds(pendingLoans.map(p => p.loan.id));
                              } else {
                                setSelectedPendingIds([]);
                              }
                            }}
                            className="accent-[#14532D] w-4 h-4 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="p-4">Código</th>
                      <th className="p-4">Socio</th>
                      <th className="p-4">Monto</th>
                      <th className="p-4">Plazo</th>
                      <th className="p-4">Tasa</th>
                      <th className="p-4">Garantía</th>
                      <th className="p-4">Origen</th>
                      <th className="p-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs font-bold text-slate-700">
                    {pendingLoans.map(({ loan, member }) => (
                      <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                        {currentUserRole !== UserRole.CREDIT_OFFICER && (
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              checked={selectedPendingIds.includes(loan.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedPendingIds([...selectedPendingIds, loan.id]);
                                } else {
                                  setSelectedPendingIds(selectedPendingIds.filter(id => id !== loan.id));
                                }
                              }}
                              className="accent-[#14532D] w-4 h-4 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="p-4 font-black text-slate-800">{loan.id}</td>
                        <td className="p-4 uppercase truncate max-w-[200px]">{member.name}</td>
                        <td className="p-4 text-[#14532D] font-black">${loan.amount.toLocaleString()}</td>
                        <td className="p-4">{loan.installmentsCount} meses</td>
                        <td className="p-4">{loan.rate}%</td>
                        <td className="p-4">
                          <span className="bg-slate-100 px-2.5 py-1 rounded text-[9px] font-black uppercase text-slate-500">
                            {loan.garantiaInfo?.tipo || 'SOLIDARIA'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black ${
                            loan.origen === 'CAJA_PATATE' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {loan.origen || 'GUTT_MOVIL'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => setSelectedLoan({ loan, member })}
                            className="px-4 py-2 bg-slate-50 hover:bg-[#14532D] hover:text-white text-[#14532D] rounded-xl font-black text-[10px] uppercase transition-all"
                          >
                            Gestionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center opacity-25">
                <ShieldCheck size={48} className="mx-auto mb-3" />
                <p className="font-black uppercase tracking-widest text-xs">Sin solicitudes pendientes</p>
              </div>
            )}
          </div>

          {/* SUBPANEL 2: Créditos por Desembolsar */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
              <div>
                <h3 className="text-xl font-black text-slate-800">2. Créditos Aprobados por Desembolsar</h3>
                <p className="text-slate-500 font-medium text-xs">Ejecutar transferencia contable de fondos (APROBADO → VIGENTE)</p>
              </div>
              {currentUserRole !== UserRole.CREDIT_OFFICER && approvedLoans.length > 0 && (
                <button
                  onClick={handleBulkDisburse}
                  disabled={selectedApprovedIds.length === 0 || isBulkProcessing}
                  className="px-5 py-3 bg-[#FACC15] hover:bg-yellow-500 disabled:bg-slate-200 disabled:text-slate-400 text-[#14532D] rounded-xl font-black text-[10px] uppercase tracking-wider transition-all"
                >
                  Desembolsar Lote ({selectedApprovedIds.length})
                </button>
              )}
            </div>

            {approvedLoans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                      {currentUserRole !== UserRole.CREDIT_OFFICER && (
                        <th className="p-4 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={selectedApprovedIds.length === approvedLoans.length}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedApprovedIds(approvedLoans.map(a => a.loan.id));
                              } else {
                                setSelectedApprovedIds([]);
                              }
                            }}
                            className="accent-[#14532D] w-4 h-4 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="p-4">Código</th>
                      <th className="p-4">Socio</th>
                      <th className="p-4">Monto Solicitado</th>
                      <th className="p-4">Comisión (1%)</th>
                      <th className="p-4">Fondo (0.5%)</th>
                      <th className="p-4">Neto a Acreditar</th>
                      <th className="p-4">Origen</th>
                      <th className="p-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs font-bold text-slate-700">
                    {approvedLoans.map(({ loan, member }) => {
                      const comision = loan.amount * 0.01;
                      const fondo = loan.amount * 0.005;
                      const neto = loan.amount - comision - fondo;
                      return (
                        <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                          {currentUserRole !== UserRole.CREDIT_OFFICER && (
                            <td className="p-4 text-center">
                              <input
                                type="checkbox"
                                checked={selectedApprovedIds.includes(loan.id)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSelectedApprovedIds([...selectedApprovedIds, loan.id]);
                                  } else {
                                    setSelectedApprovedIds(selectedApprovedIds.filter(id => id !== loan.id));
                                  }
                                }}
                                className="accent-[#14532D] w-4 h-4 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="p-4 font-black text-slate-800">{loan.id}</td>
                          <td className="p-4 uppercase truncate max-w-[200px]">{member.name}</td>
                          <td className="p-4 text-slate-500 font-bold">${loan.amount.toLocaleString()}</td>
                          <td className="p-4 text-slate-400">${comision.toFixed(2)}</td>
                          <td className="p-4 text-slate-400">${fondo.toFixed(2)}</td>
                          <td className="p-4 text-[#14532D] font-black">${neto.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black ${
                              loan.origen === 'CAJA_PATATE' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                            }`}>
                              {loan.origen || 'GUTT_MOVIL'}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full text-[9px] font-black uppercase">
                              APROBADO
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center opacity-25">
                <CheckCircle2 size={48} className="mx-auto mb-3" />
                <p className="font-black uppercase tracking-widest text-xs">Sin créditos pendientes de desembolsar</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GENERAR SOLICITUD DE CREDITO */}
      {activeTab === 'NEW_LOAN' && (
        <div className="bg-white p-8 lg:p-12 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
          <div className="flex items-center gap-6 border-b pb-6">
            <div className="w-12 h-12 bg-emerald-50 text-[#14532D] rounded-2xl flex items-center justify-center"><UserCheck size={24} /></div>
            <div>
              <h3 className="text-xl font-black text-slate-800">Radicar Solicitud desde Asesor</h3>
              <p className="text-slate-500 font-medium text-xs">Cree y registre una solicitud directamente en nombre de un socio.</p>
            </div>
          </div>

          {!selectedUserForLoan ? (
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Seleccionar Socio Destinatario</label>
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                <input type="text" placeholder="Escriba el nombre o cédula del socio..." value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl outline-none font-bold focus:border-[#14532D] transition-all" />
              </div>

              {isSearchingMembers && (
                <div className="flex items-center gap-2 text-[10px] text-slate-400 pl-4 py-2 font-black uppercase tracking-widest">
                  <Loader2 size={16} className="animate-spin text-[#14532D]" />
                  Buscando socio en la base de datos...
                </div>
              )}

              {!isSearchingMembers && searchedMembers.length > 0 && (
                <div className="border border-slate-100 rounded-2xl divide-y overflow-hidden bg-slate-50/20 max-h-60 overflow-y-auto">
                  {searchedMembers.map(u => (
                    <button key={u.id} onClick={() => setSelectedUserForLoan(u)} className="w-full px-6 py-4 hover:bg-emerald-50/50 flex justify-between items-center text-left transition-all">
                      <div>
                        <p className="font-bold text-slate-800 uppercase text-sm">{u.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{u.id} • Socio</p>
                      </div>
                      <ChevronRight size={18} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              )}

              {!isSearchingMembers && memberSearch.trim() && searchedMembers.length === 0 && (
                <div className="p-5 bg-slate-50 border border-slate-100 text-slate-400 text-center rounded-2xl text-[10px] font-black uppercase tracking-widest">
                  No se encontró ningún socio activo con ese nombre o cédula
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in duration-300">
              <div className="space-y-6">
                {/* Selected Member Header */}
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-black bg-emerald-100 text-[#14532D] px-2.5 py-1 rounded-full uppercase tracking-tighter">Socio Seleccionado</span>
                    <p className="font-black text-slate-800 uppercase text-lg mt-2">{selectedUserForLoan.name}</p>
                    <p className="text-[10px] text-slate-400 font-bold">{selectedUserForLoan.id}</p>
                  </div>
                  <button onClick={() => setSelectedUserForLoan(null)} className="p-2 border border-slate-200 rounded-xl text-slate-400 hover:bg-slate-100">Cambiar</button>
                </div>

                {/* Certificados balance Validation */}
                <div className={`p-5 rounded-2xl flex gap-4 items-start border transition-all ${
                  memberCertBalance < 1.00 ? 'bg-red-50 border-red-100 text-red-900 animate-pulse' : 'bg-emerald-50 border-emerald-100 text-emerald-900'
                }`}>
                  {memberCertBalance < 1.00 ? (
                    <ShieldAlert size={20} className="text-red-500 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 size={20} className="text-[#14532D] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-xs font-black uppercase">
                      {memberCertBalance < 1.00 ? 'Fondo de Aportación Insuficiente' : 'Certificados de Aportación Validados'}
                    </p>
                    <p className="text-[10px] font-bold opacity-80 mt-0.5">
                      {memberCertBalance < 1.00 
                        ? `El socio posee $${memberCertBalance.toFixed(2)} USD en Certificados. Debe tener al menos $1.00 USD para calificar.`
                        : `Saldo actual: $${memberCertBalance.toFixed(2)} USD (Cumple con el requisito mínimo de $1.00 USD).`}
                    </p>
                  </div>
                </div>

                {/* Category selectors */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Categoría de Crédito</label>
                  <div className="grid grid-cols-1 gap-2.5 max-h-52 overflow-y-auto pr-1">
                    {rates.map(r => (
                      <button key={r.id} disabled={memberCertBalance < 1.00} onClick={() => setSelectedRateId(r.id)} className={`p-4 rounded-xl border-2 text-left transition-all flex justify-between items-center group ${memberCertBalance < 1.00 ? 'opacity-50 cursor-not-allowed border-slate-100' : selectedRateId === r.id ? 'border-[#14532D] bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200'}`}>
                        <div>
                          <p className="text-xs font-black text-slate-800">{r.category}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase">Techo TEA: {(r as any).maxRate || r.rate}% • Plazo Max: {r.maxTerm} m.</p>
                        </div>
                        <p className="text-lg font-black text-[#14532D]">{r.rate}%</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount / Term / Rate Grid */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Monto ($)</label>
                    <input type="number" disabled={memberCertBalance < 1.00} value={newLoanAmount} onChange={e => setNewLoanAmount(e.target.value)} placeholder="Monto" className="w-full px-4 py-3 bg-slate-50 border rounded-xl font-bold text-sm text-[#14532D] focus:border-[#14532D] outline-none disabled:opacity-50 disabled:cursor-not-allowed" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Plazo (m)</label>
                    <select disabled={memberCertBalance < 1.00} value={newLoanTerm} onChange={e => setNewLoanTerm(parseInt(e.target.value))} className="w-full px-4 py-3 bg-slate-50 border rounded-xl font-bold text-sm text-[#14532D] focus:border-[#14532D] outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                      {[6, 12, 18, 24, 36, 48, 60, 72, 120, 180, 240, 360].filter(m => selectedRate ? m <= selectedRate.maxTerm : true).map(m => (
                        <option key={m} value={m}>{m} meses</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Tasa Anual (%)</label>
                    <input type="number" disabled={memberCertBalance < 1.00} value={customRate} onChange={e => setCustomRate(e.target.value)} placeholder="Tasa" className="w-full px-4 py-3 bg-slate-50 border rounded-xl font-bold text-sm text-[#14532D] focus:border-[#14532D] outline-none disabled:opacity-50 disabled:cursor-not-allowed" />
                  </div>
                </div>

                {/* Warranty inputs */}
                <div className="space-y-4 p-5 bg-slate-50/50 rounded-2xl border">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Garantía / Respaldo</label>
                  <div className="grid grid-cols-1 gap-3">
                    <select
                      disabled={memberCertBalance < 1.00}
                      value={newLoanWarrantyType}
                      onChange={e => setNewLoanWarrantyType(e.target.value as any)}
                      className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl font-bold text-xs text-slate-700 focus:border-[#14532D] outline-none"
                    >
                      <option value="SOLIDARIA">Garantía Personal / Solidaria (Firma Garante)</option>
                      <option value="PRENDARIA">Garantía Prendaria (Bienes Muebles / Vehículos)</option>
                      <option value="HIPOTECARIA">Garantía Hipotecaria (Casas / Terrenos / Locales)</option>
                      <option value="DEPOSITO_PLAZO">Garantía Auto-liquidable (Depósito a Plazo Fijo / DPF)</option>
                      <option value="GRUPO_SOLIDARIO">Garantía Grupal / Fianza Colectiva</option>
                    </select>
                  </div>

                  {newLoanWarrantyType === 'SOLIDARIA' && (
                    <div className="grid grid-cols-2 gap-3 pt-2 animate-in fade-in duration-300">
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Nombre Completo Garante" value={newLoanSolidariaGuarantorName} onChange={e => setNewLoanSolidariaGuarantorName(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white" />
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Cédula del Garante" value={newLoanSolidariaGuarantorId} onChange={e => setNewLoanSolidariaGuarantorId(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white" />
                    </div>
                  )}

                  {newLoanWarrantyType === 'PRENDARIA' && (
                    <div className="grid grid-cols-3 gap-3 pt-2 animate-in fade-in duration-300">
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Descripción del Bien (Marca/Modelo/Año)" value={newLoanPrendariaDescription} onChange={e => setNewLoanPrendariaDescription(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white col-span-1" />
                      <input type="number" disabled={memberCertBalance < 1.00} placeholder="Monto Avalúo ($)" value={newLoanPrendariaValuation} onChange={e => setNewLoanPrendariaValuation(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white col-span-1" />
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Compañía Aseguradora" value={newLoanPrendariaInsurance} onChange={e => setNewLoanPrendariaInsurance(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white col-span-1" />
                    </div>
                  )}

                  {newLoanWarrantyType === 'HIPOTECARIA' && (
                    <div className="grid grid-cols-3 gap-3 pt-2 animate-in fade-in duration-300">
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Detalle Inmueble (Finca/Clave Catastral)" value={newLoanHipotecariaInmueble} onChange={e => setNewLoanHipotecariaInmueble(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white col-span-1" />
                      <input type="number" disabled={memberCertBalance < 1.00} placeholder="Avalúo Comercial ($)" value={newLoanHipotecariaAvaluo} onChange={e => setNewLoanHipotecariaAvaluo(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white col-span-1" />
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Detalle Registro de la Propiedad" value={newLoanHipotecariaRegistro} onChange={e => setNewLoanHipotecariaRegistro(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white col-span-1" />
                    </div>
                  )}

                  {newLoanWarrantyType === 'DEPOSITO_PLAZO' && (
                    <div className="grid grid-cols-2 gap-3 pt-2 animate-in fade-in duration-300">
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Número de Cuenta o DPF" value={newLoanDpfNumero} onChange={e => setNewLoanDpfNumero(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white" />
                      <input type="number" disabled={memberCertBalance < 1.00} placeholder="Fondos Pignorados ($)" value={newLoanDpfValor} onChange={e => setNewLoanDpfValor(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white" />
                    </div>
                  )}

                  {newLoanWarrantyType === 'GRUPO_SOLIDARIO' && (
                    <div className="grid grid-cols-2 gap-3 pt-2 animate-in fade-in duration-300">
                      <input type="text" disabled={memberCertBalance < 1.00} placeholder="Nombre del Grupo Solidario" value={newLoanGrupoNombre} onChange={e => setNewLoanGrupoNombre(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white" />
                      <input type="number" disabled={memberCertBalance < 1.00} placeholder="Número de Integrantes" value={newLoanGrupoIntegrantes} onChange={e => setNewLoanGrupoIntegrantes(e.target.value)} className="px-3 py-2 border rounded-lg text-xs font-semibold focus:border-[#14532D] outline-none bg-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Simulation Result Column */}
              <div className="flex flex-col justify-between">
                {simulation ? (
                  <div className="bg-[#14532D] rounded-[2.5rem] p-8 text-white shadow-xl flex flex-col justify-between h-full relative overflow-hidden min-h-[350px]">
                    <div>
                      <div className="flex items-center gap-2 mb-6"><TrendingUp size={16} className="text-[#FACC15]" /><span className="text-[10px] font-black uppercase tracking-widest text-[#FACC15]">Proyección Oficial Asesor</span></div>
                      <div className="space-y-6">
                        <div className="border-b border-white/10 pb-4">
                          <p className="text-emerald-100/60 font-bold text-xs uppercase mb-1">Pago Mensual Estimado</p>
                          <p className="text-4xl font-black tracking-tight"><span className="text-xl font-bold text-emerald-200 align-top mr-0.5">$</span>{simulation.monthlyPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[9px] font-black text-emerald-300 uppercase">Total Intereses</p>
                            <p className="text-lg font-black">${simulation.totalInterest.toFixed(2)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black text-emerald-300 uppercase">Total a Pagar</p>
                            <p className="text-lg font-black">${simulation.totalPayable.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={handleCreateLoanRequest}
                      disabled={memberCertBalance < 1.00 || isProcessing}
                      className={`w-full py-4 mt-8 rounded-xl font-black text-md transition-all flex items-center justify-center gap-2 shadow-lg ${
                        memberCertBalance < 1.00 
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                          : 'bg-[#FACC15] text-[#14532D] hover:scale-[1.02] active:scale-95'
                      }`}
                    >
                      {isProcessing ? 'Procesando...' : 'CREAR SOLICITUD DE CRÉDITO'}
                    </button>
                  </div>
                ) : (
                  <div className="h-full bg-slate-50 border-4 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center p-12 text-center text-slate-400">
                    <FileText size={48} className="mb-4 opacity-20" />
                    <p className="font-black text-slate-400 uppercase tracking-widest text-xs">Simulación Oficial Pendiente</p>
                    <p className="text-[9px] font-bold">Ingrese valores de monto, plazo y tasa para simular</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GESTION DE COBROS */}
      {activeTab === 'COLLECTIONS' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              <input type="text" placeholder="Buscar por Nombre o Cédula..." value={paymentSearch} onChange={e => setPaymentSearch(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl outline-none font-bold focus:border-[#14532D] transition-all text-slate-800" />
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-center w-full md:w-auto">
              {/* Prorrating selector */}
              <label className="flex items-center gap-3 p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-[#14532D] cursor-pointer w-full sm:w-auto">
                <input type="checkbox" checked={applyProrating} onChange={e => setApplyProrating(e.target.checked)} className="accent-[#14532D] w-5 h-5 rounded" />
                <span className="text-[10px] font-black uppercase tracking-wider">Prorrateo (-50% Interés)</span>
              </label>

              <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border w-full sm:w-auto">
                <button onClick={() => setPaymentSource('ACCOUNT')} className={`flex-1 md:flex-none px-5 py-3 rounded-xl font-black text-[10px] uppercase transition-all flex items-center gap-2 ${paymentSource === 'ACCOUNT' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}><Wallet size={16} /> Débito Cuenta</button>
                <button onClick={() => setPaymentSource('TRANSFER')} className={`flex-1 md:flex-none px-5 py-3 rounded-xl font-black text-[10px] uppercase transition-all flex items-center gap-2 ${paymentSource === 'TRANSFER' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}><CreditCard size={16} /> Efectivo</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {activeLoansForCollection.map(({ loan, member }) => {
              const pendingInst = loan.installments.find(i => i.status === 'PENDIENTE');
              let totalToPay = pendingInst ? pendingInst.total : 0;
              let interestPaid = pendingInst ? pendingInst.interest : 0;
              if (pendingInst && applyProrating) {
                const discount = parseFloat((pendingInst.interest * 0.50).toFixed(2));
                interestPaid = parseFloat((pendingInst.interest - discount).toFixed(2));
                totalToPay = parseFloat((pendingInst.capital + interestPaid).toFixed(2));
              }

              return (
                <div key={loan.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8 hover:shadow-lg transition-all">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 text-[#14532D] rounded-full flex items-center justify-center font-black">{member.name[0]}</div>
                      <div>
                        <p className="font-black text-slate-800 uppercase leading-none">{member.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{loan.id} • {loan.type}</p>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                       <div className="px-3 py-1 bg-slate-50 rounded-lg text-[9px] font-black text-slate-500 uppercase">Saldo: ${loan.balance.toFixed(2)}</div>
                       <div className="px-3 py-1 bg-emerald-50 rounded-lg text-[9px] font-black text-emerald-600 uppercase">Buró: {member.bureau?.score || 800} pts</div>
                    </div>
                  </div>

                  {pendingInst ? (
                    <div className="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto border-t md:border-t-0 md:border-l pt-6 md:pt-0 md:pl-8 border-slate-100">
                      <div className="text-center md:text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">
                          Próxima Cuota #{pendingInst.number} {applyProrating ? '(Prorrateado)' : ''}
                        </p>
                        <p className="text-3xl font-black text-[#14532D]">
                          ${totalToPay.toFixed(2)}
                        </p>
                        {applyProrating && (
                          <p className="text-[9px] text-[#FACC15] font-black uppercase tracking-widest">Ahorro: ${(pendingInst.total - totalToPay).toFixed(2)} USD</p>
                        )}
                      </div>
                      <button 
                        onClick={() => handlePayInstallment(member, loan, pendingInst)}
                        disabled={isProcessing}
                        className="w-full md:w-auto px-8 py-4 bg-[#14532D] text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                        {isProcessing ? 'Cobrando...' : 'COBRAR AHORA'} <HandCoins size={20} className="text-[#FACC15]" />
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

      {/* TAB 4: CARTERA Y ANULACIONES */}
      {activeTab === 'CARTERA' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              <input type="text" placeholder="Buscar cartera por Nombre o Cédula..." value={carteraSearch} onChange={e => setCarteraSearch(e.target.value)} className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl outline-none font-bold focus:border-[#14532D] transition-all text-slate-800" />
            </div>
          </div>

          {/* Subview for Voiding Payments */}
          {selectedLoanForPayments && (
            <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-6 animate-in slide-in-from-top duration-300 relative">
              <button onClick={() => setSelectedLoanForPayments(null)} className="absolute right-6 top-6 p-2 text-slate-400 hover:text-slate-600 font-bold">Cerrar</button>
              <div>
                <h4 className="text-lg font-black text-slate-800 uppercase leading-none">Reversar Dividendos Cobrados</h4>
                <p className="text-xs font-semibold text-[#14532D] mt-1">{selectedLoanForPayments.loan.id} • {selectedLoanForPayments.member.name}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {selectedLoanForPayments.loan.installments.map(inst => (
                  <div key={inst.number} className="bg-white p-5 rounded-2xl border flex justify-between items-center shadow-sm">
                    <div>
                      <p className="font-bold text-slate-800 text-xs">Cuota #{inst.number}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">${inst.total.toFixed(2)} USD</p>
                      <span className={`inline-block mt-2 px-2.5 py-0.5 rounded text-[8px] font-black ${inst.status === 'PAGADO' ? 'bg-emerald-100 text-[#14532D]' : 'bg-slate-100 text-slate-400'}`}>
                        {inst.status}
                      </span>
                    </div>

                    {inst.status === 'PAGADO' && (currentUserRole === 'MANAGER' || currentUserRole === 'ADMIN') && (
                      <button 
                        onClick={() => handleAnularPayment(selectedLoanForPayments.member, selectedLoanForPayments.loan, inst)}
                        disabled={isProcessing}
                        className="py-2 px-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 text-[10px] font-black transition-all"
                      >
                        REVERSAR
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subview for Status Transitions */}
          {selectedLoanForStatusChange && (
            <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 space-y-6 animate-in slide-in-from-top duration-300 relative">
              <button onClick={() => setSelectedLoanForStatusChange(null)} className="absolute right-6 top-6 p-2 text-slate-400 hover:text-slate-600 font-bold">Cerrar</button>
              <div>
                <h4 className="text-lg font-black text-slate-800 uppercase leading-none">Transiciones de Cartera</h4>
                <p className="text-xs font-semibold text-[#14532D] mt-1">{selectedLoanForStatusChange.loan.id} • {selectedLoanForStatusChange.member.name}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Seleccionar Nuevo Estado</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button type="button" onClick={() => setNewLoanStatus('TRAMITE_JUDICIAL')} className={`py-3 px-4 rounded-xl border-2 font-bold text-xs transition-all ${newLoanStatus === 'TRAMITE_JUDICIAL' ? 'border-[#14532D] bg-emerald-50 text-[#14532D]' : 'border-slate-200 hover:border-slate-300 text-slate-500'}`}>
                      Trámite Judicial
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setNewLoanStatus('CASTIGADO')} 
                      disabled={selectedLoanForStatusChange.loan.status !== 'VENCIDO'}
                      className={`py-3 px-4 rounded-xl border-2 font-bold text-xs transition-all ${
                        selectedLoanForStatusChange.loan.status !== 'VENCIDO' 
                          ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                          : newLoanStatus === 'CASTIGADO' 
                            ? 'border-[#14532D] bg-emerald-50 text-[#14532D]' 
                            : 'border-slate-200 hover:border-slate-300 text-slate-500'
                      }`}
                    >
                      Castigo (Overdue)
                    </button>
                    <button type="button" onClick={() => setNewLoanStatus('VIGENTE')} className={`py-3 px-4 rounded-xl border-2 font-bold text-xs transition-all ${newLoanStatus === 'VIGENTE' ? 'border-[#14532D] bg-emerald-50 text-[#14532D]' : 'border-slate-200 hover:border-slate-300 text-slate-500'}`}>
                      Acuerdo Reactivación
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Detalle o Convenio de Pago</label>
                  <div className="flex gap-4">
                    <input 
                      type="text" 
                      placeholder="Ej: Firma de acuerdo de pagos / Asignación a juzgado..." 
                      value={statusChangeReason} 
                      onChange={e => setStatusChangeReason(e.target.value)} 
                      className="flex-1 px-4 py-3 bg-white border rounded-xl font-bold text-xs outline-none focus:border-[#14532D]" 
                    />
                    <button 
                      onClick={handleUpdateStatus}
                      disabled={isProcessing}
                      className="py-3 px-6 bg-[#14532D] hover:bg-emerald-800 text-white font-black text-xs uppercase rounded-xl transition-all"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cartera list */}
          <div className="grid grid-cols-1 gap-6">
            {allActiveLoansForCartera.map(({ loan, member }) => {
              const hasPaid = loan.installments.some(i => i.status === 'PAGADO');

              return (
                <div key={loan.id} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col lg:flex-row justify-between items-center gap-8 hover:shadow-lg transition-all">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-50 text-[#14532D] rounded-full flex items-center justify-center font-black">{member.name[0]}</div>
                      <div>
                        <p className="font-black text-slate-800 uppercase leading-none">{member.name}</p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{loan.id} • {loan.type}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                       <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${
                         loan.status === 'VIGENTE' ? 'bg-emerald-50 text-emerald-700' :
                         loan.status === 'VENCIDO' ? 'bg-amber-50 text-amber-700' :
                         loan.status === 'PAGADO' ? 'bg-blue-50 text-blue-700' :
                         loan.status === 'TRAMITE_JUDICIAL' ? 'bg-purple-50 text-purple-700' :
                         loan.status === 'CASTIGADO' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
                       }`}>
                         Cartera: {loan.status}
                       </span>
                       <div className="px-3 py-1 bg-slate-50 rounded-lg text-[9px] font-black text-slate-500 uppercase">Monto: ${loan.amount.toFixed(2)}</div>
                       <div className="px-3 py-1 bg-slate-50 rounded-lg text-[9px] font-black text-slate-500 uppercase">Saldo Pendiente: ${loan.balance.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 w-full lg:w-auto border-t lg:border-t-0 lg:border-l pt-6 lg:pt-0 lg:pl-8 border-slate-100 justify-end">
                    <button 
                      onClick={() => setSelectedLoanForStatusChange({ loan, member })}
                      className="px-5 py-3 border border-slate-200 rounded-xl font-black text-[10px] text-slate-600 hover:bg-slate-50 uppercase tracking-wider transition-all"
                    >
                      Transición Cartera
                    </button>

                    <button 
                      onClick={() => setSelectedLoanForPayments({ loan, member })}
                      className="px-5 py-3 border border-slate-200 rounded-xl font-black text-[10px] text-[#14532D] hover:bg-[#14532D] hover:text-white uppercase tracking-wider transition-all"
                    >
                      Reversar Dividendos
                    </button>

                    {(currentUserRole === UserRole.MANAGER || currentUserRole === UserRole.ADMIN) && (
                      <button 
                        onClick={() => handleAnularLoan(loan, member)}
                        disabled={hasPaid}
                        className={`px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all ${
                          hasPaid 
                            ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                            : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                      >
                        ANULAR CRÉDITO
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {allActiveLoansForCartera.length === 0 && <div className="py-20 text-center opacity-20"><Search size={80} className="mx-auto mb-4" /><p className="font-black uppercase tracking-widest">No se encontraron créditos registrados</p></div>}
          </div>
        </div>
      )}
    </div>
  );
};
