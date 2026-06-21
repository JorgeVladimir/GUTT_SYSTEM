
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { User, Transaction, AccountType, UserRole, Dependent, PersonalReference, CashDetail, PersonType, InterbankTransfer } from '../types';
import { SEPS_CATALOGS as CATALOGS } from '../constants';
import { MapSelector } from './MapSelector';
import { 
  Search, 
  Banknote, 
  UserPlus, 
  Plus,
  Minus,
  X,
  User as UserIcon,
  DollarSign,
  Receipt,
  Loader2,
  CheckCircle2,
  MapPin,
  Globe,
  Calendar as CalendarIcon,
  Mail,
  Briefcase,
  Users2,
  Heart,
  ImageIcon,
  Map as MapIcon,
  Trash2,
  Info,
  Lock,
  Eye,
  EyeOff,
  Building2,
  ArrowRightLeft,
  FileText,
  Calculator,
  Printer
} from 'lucide-react';

import { DataService } from '../services/dataService';

interface TellerViewProps {
  users: User[];
  onUpdateUser: (user: User) => void;
  currentUserRole?: UserRole;
  currentUser?: User;
  activeTab?: TellerTab;
  onActiveTabChange?: (tab: TellerTab) => void;
}

type TellerTab = 'OPERATIONS' | 'CONSULTAS' | 'REGISTER' | 'CASH_CLOSE' | 'TX_SEARCH';
type OperationType = 'DEPOSIT' | 'WITHDRAW' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'INTERBANK_TRANSFER' | 'ACCOUNT_TRANSFER';

export const TellerView: React.FC<TellerViewProps> = ({ 
  users, 
  onUpdateUser, 
  currentUserRole, 
  currentUser,
  activeTab: propActiveTab,
  onActiveTabChange
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState<TellerTab>('OPERATIONS');
  const activeTab = propActiveTab !== undefined ? propActiveTab : internalActiveTab;
  const setActiveTab = onActiveTabChange !== undefined ? onActiveTabChange : setInternalActiveTab;
  
  // Custom Alert & Confirm Modals
  const [alertConfig, setAlertConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'error' | 'info';
    isConfirm: boolean;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const showCustomAlert = (message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info', title: string = 'Aviso') => {
    return new Promise<void>((resolve) => {
      setAlertConfig({
        isOpen: true,
        title,
        message,
        type,
        isConfirm: false,
        onConfirm: () => {
          setAlertConfig(null);
          resolve();
        }
      });
    });
  };

  const showCustomConfirm = (message: string, title: string = 'Confirmar') => {
    return new Promise<boolean>((resolve) => {
      setAlertConfig({
        isOpen: true,
        title,
        message,
        type: 'warning',
        isConfirm: true,
        onConfirm: () => {
          setAlertConfig(null);
          resolve(true);
        },
        onCancel: () => {
          setAlertConfig(null);
          resolve(false);
        }
      });
    });
  };

  // Estados de Caja Ventanilla
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(() => {
    return localStorage.getItem(`caja_is_open_${currentUser?.id || 'caja'}`) === 'true';
  });
  const [openingBalance, setOpeningBalance] = useState<number>(() => {
    return parseFloat(localStorage.getItem(`caja_opening_balance_${currentUser?.id || 'caja'}`) || '0');
  });
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => {
    return localStorage.getItem(`caja_printer_${currentUser?.id || 'caja'}`) || currentUser?.impresora || 'Impresora Térmica Ventanilla (EPSON TM-T88VI)';
  });
  const [drawerTransactions, setDrawerTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem(`caja_transactions_${currentUser?.id || 'caja'}`);
    return saved ? JSON.parse(saved) : [];
  });

  // Saldo de cierre anterior para validación
  const [lastCloseTotal, setLastCloseTotal] = useState<number | null>(() => {
    const totalVal = localStorage.getItem(`caja_last_close_total_${currentUser?.id || 'caja'}`);
    return totalVal ? parseFloat(totalVal) : null;
  });
  const [lastCloseDetail, setLastCloseDetail] = useState<CashDetail | null>(() => {
    const detailVal = localStorage.getItem(`caja_last_close_detail_${currentUser?.id || 'caja'}`);
    return detailVal ? JSON.parse(detailVal) : null;
  });
  const [balanceInput, setBalanceInput] = useState('');
  const [showPrevCloseDetail, setShowPrevCloseDetail] = useState(false);

  // Email Verification Modal State
  const [emailVerifyModal, setEmailVerifyModal] = useState<{
    isOpen: boolean;
    identificacion: string;
    email: string;
    expectedCode: string;
    socioId: string;
    numeroSocio: string;
  } | null>(null);
  const [verificationInput, setVerificationInput] = useState('');

  // Modal Éxito Registro
  const [registrationSuccessModal, setRegistrationSuccessModal] = useState<{
    isOpen: boolean;
    numeroSocio: string;
    cedula: string;
    name: string;
    email: string;
    userObj: any;
  } | null>(null);

  // Modal Recibo
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<Transaction | null>(null);
  const [selectedReceiptUser, setSelectedReceiptUser] = useState<User | null>(null);

  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [opType, setOpType] = useState<OperationType>('DEPOSIT');
  const [generalFilter, setGeneralFilter] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [mapModal, setMapModal] = useState<{ isOpen: boolean; type: 'home' | 'work' }>({ isOpen: false, type: 'home' });

  // Estados para Transferencia Interna
  const [destAccountId, setDestAccountId] = useState<string>('');
  const [transferType, setTransferType] = useState<'OWN' | 'OTHER'>('OWN');
  const [destMemberUser, setDestMemberUser] = useState<User | null>(null);

  // Estados para Consulta Transacciones
  const [txSearchInput, setTxSearchInput] = useState('');
  const [txSearchSocio, setTxSearchSocio] = useState<User | null>(null);
  const [txIsSearching, setTxIsSearching] = useState(false);

  // Guardar estado de caja en localStorage para persistencia
  useEffect(() => {
    localStorage.setItem(`caja_is_open_${currentUser?.id || 'caja'}`, isDrawerOpen.toString());
  }, [isDrawerOpen, currentUser]);

  useEffect(() => {
    localStorage.setItem(`caja_opening_balance_${currentUser?.id || 'caja'}`, openingBalance.toString());
  }, [openingBalance, currentUser]);

  useEffect(() => {
    localStorage.setItem(`caja_printer_${currentUser?.id || 'caja'}`, selectedPrinter);
  }, [selectedPrinter, currentUser]);

  useEffect(() => {
    localStorage.setItem(`caja_transactions_${currentUser?.id || 'caja'}`, JSON.stringify(drawerTransactions));
  }, [drawerTransactions, currentUser]);

  // Cálculos consolidados para Cierre de Caja y Reportes
  const totals = useMemo(() => {
    let dep = 0;
    let wit = 0;
    let nd = 0;
    let nc = 0;
    let transf = 0;

    let depCount = 0;
    let witCount = 0;
    let ndCount = 0;
    let ncCount = 0;
    let transfCount = 0;

    drawerTransactions.forEach(tx => {
      if (tx.description.startsWith('ANULADO')) return;
      const amt = Math.abs(tx.amount);
      if (tx.description.includes('DEPÓSITO')) {
        dep += amt;
        depCount++;
      } else if (tx.description.includes('RETIRO')) {
        wit += amt;
        witCount++;
      } else if (tx.description.includes('NOTA DE DÉBITO')) {
        nd += amt;
        ndCount++;
      } else if (tx.description.includes('NOTA DE CRÉDITO')) {
        nc += amt;
        ncCount++;
      } else if (tx.description.includes('TRANSFERENCIA')) {
        transf += amt;
        transfCount++;
      }
    });

    const expected = openingBalance + dep - wit;
    return {
      deposits: dep,
      withdrawals: wit,
      creditNotes: nc,
      debitNotes: nd,
      transfers: transf,
      depositsCount: depCount,
      withdrawalsCount: witCount,
      creditNotesCount: ncCount,
      debitNotesCount: ndCount,
      transfersCount: transfCount,
      expected
    };
  }, [drawerTransactions, openingBalance]);

  // Handler de Anulaciones
  const handleAnnulTransaction = async (tx: Transaction) => {
    if (tx.description.startsWith('ANULADO')) return;
    const confirmed = await showCustomConfirm('¿Está seguro de anular esta transacción? Se revertirá el saldo de la cuenta del socio.', 'Confirmar Anulación');
    if (!confirmed) return;

    if (currentUserRole !== UserRole.ADMIN) {
      await showCustomAlert("PERMISOS INSUFICIENTES: Solo un usuario Administrador puede anular transacciones.", 'error', 'Error');
      return;
    }

    try {
      const response = await fetch('/api/socios/transaccion/anular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tx.id,
          role: currentUserRole
        })
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || 'Error en la respuesta del servidor');
      }

      // Buscar el socio dueño de la cuenta
      const member = users.find(u => u.accounts.some(acc => acc.id === tx.accountId));
      if (!member) {
        await showCustomAlert("No se encontró al socio titular de esta transacción para actualización visual.", 'warning', 'Aviso');
        return;
      }

      const amountToRevert = tx.amount; // Si fue deposito es positivo, si retiro es negativo
      const updatedAccounts = member.accounts.map(acc => {
        if (acc.id === tx.accountId) {
          return { ...acc, balance: acc.balance - amountToRevert };
        }
        return acc;
      });

      const annulmentTx: Transaction = {
        id: data.asientoId ? `tx-${data.asientoId}` : `TX-ANUL-${Date.now()}`,
        date: new Date().toLocaleDateString('es-EC'),
        description: `ANULACIÓN REVERSO: ${tx.description} (Ref: ${tx.id})`,
        amount: -amountToRevert,
        type: amountToRevert > 0 ? 'DEBIT' : 'CREDIT',
        category: 'Anulaciones',
        accountId: tx.accountId,
        isCash: tx.isCash,
        tellerId: currentUser?.id || 'caja'
      };

      onUpdateUser({
        ...member,
        accounts: updatedAccounts,
        transactions: [annulmentTx, ...(member.transactions || [])]
      });

      // Marcar la transacción de caja como anulada para restar del arqueo
      setDrawerTransactions(prev => prev.map(item => {
        if (item.id === tx.id) {
          return { ...item, description: `ANULADO: ${item.description}` };
        }
        return item;
      }));

      await showCustomAlert("Transacción anulada con éxito.", 'success', 'Transacción Anulada');
    } catch (err: any) {
      await showCustomAlert(err.message || "Error al anular la transacción.", 'error', 'Error');
    }
  };

  const handleConfirmClose = async () => {
    const difference = cashDetail.total - totals.expected;
    let statusMsg = '';
    if (difference === 0) {
      statusMsg = 'CAJA CUADRADA';
    } else if (difference > 0) {
      statusMsg = `SOBRANTE DE CAJA por $${difference.toFixed(2)}`;
    } else {
      statusMsg = `FALTANTE DE CAJA por $${Math.abs(difference).toFixed(2)}`;
    }
    
    const confirmed = await showCustomConfirm(`¿Está seguro de realizar el Cierre de Caja?\nEstado: ${statusMsg}\nTotal Físico: $${cashDetail.total.toFixed(2)}`, 'Confirmar Cierre de Caja');
    if (!confirmed) {
      return;
    }
    
    const userId = currentUser?.id || 'caja';
    const fDate = serverDate || new Date().toISOString().split('T')[0];

    try {
      const res = await fetch('/api/caja/control/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId: userId,
          fecha: fDate,
          saldoCierre: cashDetail.total
        })
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Error al cerrar caja');
      }

      // Save report data for printing
      const reportData = {
        status: statusMsg,
        openingBalance: openingBalance,
        totalDeposits: totals.deposits,
        totalWithdrawals: totals.withdrawals,
        totalCreditNotes: totals.creditNotes,
        totalDebitNotes: totals.debitNotes,
        expectedBalance: totals.expected,
        physicalBalance: cashDetail.total,
        difference: difference,
        depositsCount: totals.depositsCount,
        withdrawalsCount: totals.withdrawalsCount,
        creditNotesCount: totals.creditNotesCount,
        debitNotesCount: totals.debitNotesCount,
        cashDetail: JSON.parse(JSON.stringify(cashDetail))
      };
      
      setCloseReportData(reportData);
      setShowCloseReportModal(true);

      localStorage.setItem(`caja_last_close_total_${userId}`, cashDetail.total.toString());
      localStorage.setItem(`caja_last_close_detail_${userId}`, JSON.stringify(cashDetail));
      localStorage.setItem(`caja_last_close_date_${userId}`, fDate);
      
      setLastCloseTotal(cashDetail.total);
      setLastCloseDetail(cashDetail);
      setBalanceInput('');
      
      localStorage.removeItem(`caja_is_open_${userId}`);
      localStorage.removeItem(`caja_opening_balance_${userId}`);
      localStorage.removeItem(`caja_transactions_${userId}`);
      
      setIsDrawerOpen(false);
      setOpeningBalance(0);
      setDrawerTransactions([]);
      setCashDetail({
        bills: [
          { denomination: 100, count: 0, total: 0 },
          { denomination: 50, count: 0, total: 0 },
          { denomination: 20, count: 0, total: 0 },
          { denomination: 10, count: 0, total: 0 },
          { denomination: 5, count: 0, total: 0 },
          { denomination: 1, count: 0, total: 0 },
        ],
        coins: [
          { denomination: 1.00, count: 0, total: 0 },
          { denomination: 0.50, count: 0, total: 0 },
          { denomination: 0.25, count: 0, total: 0 },
          { denomination: 0.10, count: 0, total: 0 },
          { denomination: 0.05, count: 0, total: 0 },
          { denomination: 0.01, count: 0, total: 0 },
        ],
        total: 0
      });
      setAmount('');
      
      await showCustomAlert(`Cierre de caja completado exitosamente.\nEstado: ${statusMsg}\nJornada finalizada.`, 'success', 'Cierre Completado');
      setActiveTab('OPERATIONS');
    } catch (err: any) {
      await showCustomAlert(err.message || 'Error al cerrar caja en el servidor.', 'error', 'Error');
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailVerifyModal || !verificationInput) return;
    
    try {
      const response = await fetch('/api/socios/verificar-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identificacion: emailVerifyModal.identificacion,
          codigo: verificationInput
        })
      });
      const data = await response.json();
      if (data.ok) {
        await showCustomAlert(`¡Verificación de correo exitosa!\nCuenta del socio activada correctamente.\nNúmero de Socio: ${emailVerifyModal.numeroSocio}`, 'success', 'Correo Verificado');
        setEmailVerifyModal(null);
        setVerificationInput('');
        resetForm();
        setActiveTab('CONSULTAS');
        loadSociosConsultas();
      } else {
        await showCustomAlert(data.error || 'Código incorrecto.', 'error', 'Error de Código');
      }
    } catch (err: any) {
      await showCustomAlert('Ocurrió un error al verificar el código.', 'error', 'Error');
    }
  };

  const handleSkipVerify = async () => {
    if (!emailVerifyModal) return;
    await showCustomAlert(`El socio ha sido registrado pero su correo NO ha sido verificado.\nDeberá activar su cuenta usando el código ${emailVerifyModal.expectedCode} para poder acceder a su portal en línea.`, 'warning', 'Verificación Pendiente');
    setEmailVerifyModal(null);
    setVerificationInput('');
    resetForm();
    setActiveTab('CONSULTAS');
    loadSociosConsultas();
  };

  const renderReceiptModal = () => {
    if (!showReceiptModal || !selectedReceiptTx) return null;
    const isCredit = selectedReceiptTx.amount > 0;
    const formattedAmount = Math.abs(selectedReceiptTx.amount).toFixed(2);
    
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-[3rem] p-10 max-w-lg w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="border-4 border-slate-900 p-8 rounded-2xl font-mono text-xs text-slate-800 space-y-4 print-receipt">
            <div className="text-center space-y-1">
              <h4 className="font-bold text-sm">GUTT SYSTEM</h4>
              <p>PORTAL BANCARIO OFICIAL</p>
              <p>RUC: 1891782392001</p>
              <p>Impresora: {selectedPrinter}</p>
            </div>
            
            <div className="border-t-2 border-dashed border-slate-900 pt-4 space-y-1">
              <p><strong>TRANSACCIÓN:</strong> {selectedReceiptTx.id}</p>
              <p><strong>FECHA:</strong> {selectedReceiptTx.date}</p>
              <p><strong>CAJERO:</strong> {currentUser?.name || 'Cajero Matriz'} ({currentUser?.id})</p>
            </div>

            <div className="border-t border-dashed border-slate-900 pt-4 space-y-1">
              <p><strong>SOCIO:</strong> {selectedReceiptUser?.name || 'Socio Ventanilla'}</p>
              <p><strong>ID/CÉDULA:</strong> {selectedReceiptUser?.id || ''}</p>
              <p><strong>CUENTA:</strong> {selectedReceiptTx.accountId}</p>
            </div>

            <div className="border-t-2 border-dashed border-slate-900 pt-4 space-y-2">
              <div className="flex justify-between font-bold text-sm">
                <span>OPERACIÓN:</span>
                <span>{isCredit ? 'DEPÓSITO' : 'RETIRO'}</span>
              </div>
              <div className="flex justify-between font-bold text-sm bg-slate-100 p-2">
                <span>MONTO:</span>
                <span>${formattedAmount} USD</span>
              </div>
              <p className="text-[10px] italic">Monto procesado bajo conformidad del socio.</p>
            </div>

            <div className="border-t-2 border-dashed border-slate-900 pt-10 grid grid-cols-2 gap-8 text-center">
              <div className="space-y-1">
                <div className="border-b border-slate-900 h-10"></div>
                <p className="text-[9px]">Firma Socio</p>
              </div>
              <div className="space-y-1">
                <div className="border-b border-slate-900 h-10"></div>
                <p className="text-[9px]">Firma Cajero</p>
              </div>
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <button onClick={() => { window.print(); }} className="flex-1 py-4 bg-[#14532D] text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-800 transition-all flex items-center justify-center gap-2">
              <Printer size={16}/> Imprimir Recibo
            </button>
            <button onClick={() => { setShowReceiptModal(false); setSelectedReceiptTx(null); setSelectedReceiptUser(null); }} className="flex-1 py-4 bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-300 transition-all">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Estados para funcionalidades nuevas
  const [showCashDetail, setShowCashDetail] = useState(false);
  const [cashDetail, setCashDetail] = useState<CashDetail>({
    bills: [
      { denomination: 100, count: 0, total: 0 },
      { denomination: 50, count: 0, total: 0 },
      { denomination: 20, count: 0, total: 0 },
      { denomination: 10, count: 0, total: 0 },
      { denomination: 5, count: 0, total: 0 },
      { denomination: 1, count: 0, total: 0 },
    ],
    coins: [
      { denomination: 1.00, count: 0, total: 0 },
      { denomination: 0.50, count: 0, total: 0 },
      { denomination: 0.25, count: 0, total: 0 },
      { denomination: 0.10, count: 0, total: 0 },
      { denomination: 0.05, count: 0, total: 0 },
      { denomination: 0.01, count: 0, total: 0 },
    ],
    total: 0
  });
  const [personType, setPersonType] = useState<PersonType>('SOCIO');
  const [hasChosenType, setHasChosenType] = useState(false);
  const [siguienteNumero, setSiguienteNumero] = useState<string>('');
  const [idError, setIdError] = useState('');
  const [interbankTransfer, setInterbankTransfer] = useState<Partial<InterbankTransfer>>({
    toBank: '',
    toAccount: '',
    toAccountName: '',
    reference: ''
  });
  const [showCashCloseModal, setShowCashCloseModal] = useState(false);

  // Estados para integración SQL Server
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [mapSelectorType, setMapSelectorType] = useState<'home' | 'work'>('home');
  const [capturedMapImage, setCapturedMapImage] = useState<string>('');
  const [capturedWorkMapImage, setCapturedWorkMapImage] = useState<string>('');
  const [mapCoordinates, setMapCoordinates] = useState<{ lat: string; lng: string } | null>(null);
  const [workMapCoordinates, setWorkMapCoordinates] = useState<{ lat: string; lng: string } | null>(null);
  const [isFormLocked, setIsFormLocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sociosConsultas, setSociosConsultas] = useState<any[]>([]);
  const [loadingConsultas, setLoadingConsultas] = useState(false);
  const [skipExtraInfo, setSkipExtraInfo] = useState(false);
  const [closeReportData, setCloseReportData] = useState<any>(null);
  const [showCloseReportModal, setShowCloseReportModal] = useState(false);

  // Estados para excepción de cédula
  const [idConExcepcion, setIdConExcepcion] = useState(false);
  const [showDocUploadModal, setShowDocUploadModal] = useState(false);
  const [imgFrontalBase64, setImgFrontalBase64] = useState('');
  const [imgPosteriorBase64, setImgPosteriorBase64] = useState('');

  // Estado para Nuevo Socio (Estructura S01 Completa - Manual 28.0)
  const [newMember, setNewMember] = useState<Partial<User>>({
    id: '', 
    idType: 'CÉDULA', 
    firstName: '', 
    middleName: '', 
    firstLastName: '',
    secondLastName: '',
    onlyOneName: false,
    onlyOneLastName: false,
    email: '', 
    phone: '', 
    address: '', 
    residenceCountry: '593 - ECUADOR',
    birthCountry: '593 - ECUADOR',
    birthProvince: '', 
    birthCity: '', 
    birthParish: '', 
    ethnicity: 'MESTIZO',
    gender: 'MASCULINO', 
    maritalStatus: 'SOLTERO',
    province: '', 
    city: '', 
    parish: '',
    profession: 'SIN ACTIVIDAD ECONÓMICA', 
    instructionLevel: 'SIN INSTRUCCIÓN', 
    role: UserRole.MEMBER,
    dependents: [],
    references: [
      { name: '', phone: '', relationship: 'FAMILIAR' },
      { name: '', phone: '', relationship: 'CONOCIDO' }
    ],
    homeSketch: [],
    workAddress: '',
    workProvince: '',
    workCity: '',
    workParish: '',
    spouseId: '',
    spouseName: '',
    spousePhone: '',
    pin: '1234', // PIN por defecto
    needsPinChange: true
  });

  const [idStatus, setIdStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [isValidating, setIsValidating] = useState(false);
  const sketchInputRef = useRef<HTMLInputElement>(null);

  const validateEcuadorianId = (id: string): boolean => {
    if (id.length !== 10) return false;
    const province = parseInt(id.substring(0, 2), 10);
    if (province < 1 || province > 24) return false;
    const thirdDigit = parseInt(id.substring(2, 3), 10);
    if (thirdDigit >= 6) return false;
    const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let total = 0;
    for (let i = 0; i < 9; i++) {
      let val = parseInt(id[i], 10) * coefficients[i];
      if (val >= 10) val -= 9;
      total += val;
    }
    const checkDigit = parseInt(id[9], 10);
    const calculatedCheckDigit = (total % 10 === 0) ? 0 : 10 - (total % 10);
    return checkDigit === calculatedCheckDigit;
  };

  const [serverDate, setServerDate] = useState<string>('');
  const [isCajaLoading, setIsCajaLoading] = useState<boolean>(true);

  const syncCajaState = async () => {
    if (!currentUser?.id) return;
    setIsCajaLoading(true);
    try {
      const dateRes = await fetch('/api/server-date');
      const dateData = await dateRes.json();
      if (!dateData.ok) throw new Error(dateData.error || 'Error fetching server date');
      const sDate = dateData.date;
      setServerDate(sDate);

      const statusRes = await fetch(`/api/caja/control/estado?usuarioId=${currentUser.id}&fecha=${sDate}`);
      const statusData = await statusRes.json();
      if (statusData.ok) {
        if (statusData.estado === 'ABIERTO') {
          setIsDrawerOpen(true);
          setOpeningBalance(statusData.openingBalance);
        } else if (statusData.estado === 'CERRADO') {
          setIsDrawerOpen(false);
          localStorage.setItem(`caja_last_close_date_${currentUser.id}`, sDate);
        } else {
          setIsDrawerOpen(false);
        }
      }
    } catch (err) {
      console.error('Error synchronizing caja state with server:', err);
    } finally {
      setIsCajaLoading(false);
    }
  };

  useEffect(() => {
    syncCajaState();
  }, [currentUser]);

  useEffect(() => {
    if (activeTab === 'CASH_CLOSE' || activeTab === 'OPERATIONS') {
      syncCajaState();
    }
  }, [activeTab]);

  const handleChooseType = async (type: PersonType) => {
    setPersonType(type);
    setIsFormLocked(true);
    try {
      const response = await fetch(`/api/socios/siguiente-numero?tipo=${type}`);
      const data = await response.json();
      if (data.ok) {
        setSiguienteNumero(data.siguiente);
      }
    } catch (err) {
      console.error('Error fetching sequence number:', err);
    }
    setHasChosenType(true);
  };

  const calculatedAge = useMemo(() => {
    if (!newMember.birthDate) return null;
    const birth = new Date(newMember.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }, [newMember.birthDate]);

  const isFormValid = useMemo(() => {
    // Basic fields validation
    if (!(newMember.id || '').trim()) return false;
    if (idStatus !== 'valid') return false;

    if (!(newMember.firstName || '').trim()) return false;
    if (!newMember.onlyOneName && !(newMember.middleName || '').trim()) return false;
    
    if (!(newMember.firstLastName || '').trim()) return false;
    if (!newMember.onlyOneLastName && !(newMember.secondLastName || '').trim()) return false;

    if (!(newMember.email || '').trim()) return false;
    if (!(newMember.birthDate || '').trim()) return false;
    
    // Geographical residence fields
    if (!(newMember.province || '').trim()) return false;
    if (!(newMember.city || '').trim()) return false;
    if (!(newMember.parish || '').trim()) return false;
    if (!(newMember.address || '').trim()) return false;

    // PIN check (must be modified and not default 1234)
    const pinVal = (newMember.pin || '').trim();
    if (pinVal.length !== 4) return false;
    if (pinVal === '1234') return false;

    // References validation - form has at least 2 references initialized
    if (!newMember.references || newMember.references.length < 2) return false;
    for (const ref of newMember.references) {
      if (!ref.name?.trim() || !ref.phone?.trim()) return false;
    }

    // Exception documents check
    if (idConExcepcion) {
      if (!imgFrontalBase64 || !imgPosteriorBase64) return false;
    }

    // Age validation
    if (personType === 'SOCIO' && calculatedAge !== null && calculatedAge < 18) {
      return false;
    }

    return true;
  }, [newMember, idStatus, idConExcepcion, imgFrontalBase64, imgPosteriorBase64, personType, calculatedAge]);

  useEffect(() => {
    const checkId = async () => {
      const idVal = (newMember.id || '').trim();
      if (!idVal) {
        setIdStatus('idle');
        setIdError('');
        return;
      }
      
      if (newMember.idType === 'CÉDULA') {
        if (idConExcepcion) {
          if (idVal.length !== 10) {
            setIdStatus('invalid');
            setIdError('La cédula debe tener exactamente 10 dígitos.');
            return;
          }
        } else {
          if (idVal.length !== 10 || !validateEcuadorianId(idVal)) {
            setIdStatus('invalid');
            setIdError('Cédula ecuatoriana inválida.');
            return;
          }
        }
      } else if (newMember.idType === 'RUC') {
        if (idVal.length !== 13) {
          setIdStatus('invalid');
          setIdError('El RUC debe tener 13 dígitos.');
          return;
        }
      } else {
        if (idVal.length < 5) {
          setIdStatus('invalid');
          setIdError('Pasaporte demasiado corto.');
          return;
        }
      }

      setIsValidating(true);
      try {
        const response = await fetch(`/api/socios/buscar?q=${encodeURIComponent(idVal)}`);
        const data = await response.json();
        if (data.ok && data.data && data.data.length > 0) {
          const match = data.data.find((s: any) => s.id === idVal);
          if (match) {
            setIdStatus('invalid');
            setIdError('Esta identificación ya está registrada en el sistema.');
            setIsValidating(false);
            return;
          }
        }
        setIdStatus('valid');
        setIdError('');
      } catch (err) {
        console.error('Error validating ID duplicate:', err);
      } finally {
        setIsValidating(false);
      }
    };

    checkId();
  }, [newMember.id, newMember.idType, idConExcepcion]);

  useEffect(() => {
    const cId = (newMember.spouseId || '').trim();
    if (cId.length === 10 && (newMember.maritalStatus === 'CASADO' || newMember.maritalStatus === 'UNIÓN DE HECHO')) {
      handleSpouseSearch(cId);
    }
  }, [newMember.spouseId, newMember.maritalStatus]);

  const handleSpouseSearch = async (spouseIdVal: string) => {
    const cleanId = (spouseIdVal || '').trim();
    if (cleanId.length === 10) {
      try {
        const response = await fetch(`/api/socios/buscar?q=${cleanId}`);
        const result = await response.json();
        if (result.ok && result.data && result.data.length > 0) {
          const spouse = result.data.find((s: any) => s.id === cleanId);
          if (spouse) {
            if (spouse.maritalStatus && spouse.maritalStatus.toUpperCase().includes('CASAD')) {
              setNewMember(prev => ({
                ...prev,
                spouseName: spouse.name,
                spousePhone: spouse.phone || ''
              }));
              await showCustomAlert(`Cónyuge encontrado: ${spouse.name}`, 'success', 'Cónyuge Encontrado');
            } else {
              setNewMember(prev => ({
                ...prev,
                spouseName: '',
                spousePhone: ''
              }));
              await showCustomAlert(`La cédula del cónyuge ingresada (${cleanId}) se encuentra registrada en el sistema pero su estado civil no es CASAD@ (es: ${spouse.maritalStatus}).`, 'warning', 'Validación de Cónyuge');
            }
          }
        }
      } catch (err) {
        console.error('Error al buscar cónyuge:', err);
      }
    }
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    try {
      const response = await fetch(`/api/socios/buscar?q=${encodeURIComponent(search.trim())}`);
      const data = await response.json();
      if (data.ok && data.data && data.data.length > 0) {
        const dbUser = data.data[0];
        setSelectedUser(dbUser);
        
        // Auto-select preferred account: CERTIFICADO_APORTACION if exists, else first account
        const certAcc = dbUser.accounts.find((a: any) => a.type === 'CERTIFICADO_APORTACION');
        const firstAcc = certAcc || dbUser.accounts[0];
        setSelectedAccountId(firstAcc?.id || '');
        return;
      }
    } catch (err) {
      console.warn("Búsqueda en base de datos falló, usando fallback local:", err);
    }

    const found = users.find(u => u.id === search || u.name.toLowerCase().includes(search.toLowerCase()));
    if (found) {
      setSelectedUser(found);
      setSelectedAccountId(found.accounts[0]?.id || '');
    } else {
      await showCustomAlert("Socio no encontrado en la base de datos ni localmente.", 'error', 'Búsqueda');
    }
  };

  const handleTxSearch = async () => {
    if (!txSearchInput.trim()) return;
    setTxIsSearching(true);
    try {
      const response = await fetch(`/api/socios/buscar?q=${encodeURIComponent(txSearchInput.trim())}`);
      const data = await response.json();
      if (data && data.ok) {
        if (data.data && data.data.length > 0) {
          const dbUser = data.data[0];
          setTxSearchSocio(dbUser);
        } else {
          const found = users.find(u => u.id === txSearchInput.trim() || u.name.toLowerCase().includes(txSearchInput.trim().toLowerCase()));
          if (found) {
            setTxSearchSocio(found);
          } else {
            setTxSearchSocio(null);
            await showCustomAlert("Socio no encontrado para la consulta de transacciones.", "error", "Búsqueda");
          }
        }
      } else {
        throw new Error(data.error || "Error en búsqueda");
      }
    } catch (err) {
      console.warn("Búsqueda remota falló, usando local:", err);
      const found = users.find(u => u.id === txSearchInput.trim() || u.name.toLowerCase().includes(txSearchInput.trim().toLowerCase()));
      if (found) {
        setTxSearchSocio(found);
      } else {
        setTxSearchSocio(null);
        await showCustomAlert("Socio no encontrado para la consulta de transacciones.", "error", "Búsqueda");
      }
    } finally {
      setTxIsSearching(false);
    }
  };


  const filteredUsers = useMemo(() => {
    const q = generalFilter.toLowerCase();
    return users.filter(u => u.role === UserRole.MEMBER && (u.id.includes(q) || u.name.toLowerCase().includes(q)));
  }, [users, generalFilter]);

  // Auxiliares para catálogos dinámicos
  const birthCities = newMember.birthProvince ? (CATALOGS.CITIES as any)[newMember.birthProvince] || [] : [];
  const birthParishes = newMember.birthCity ? (CATALOGS.PARISHES as any)[newMember.birthCity] || [] : [];
  const resCities = newMember.province ? (CATALOGS.CITIES as any)[newMember.province] || [] : [];
  const resParishes = newMember.city ? (CATALOGS.PARISHES as any)[newMember.city] || [] : [];
  const workCities = newMember.workProvince ? (CATALOGS.CITIES as any)[newMember.workProvince] || [] : [];
  const workParishes = newMember.workCity ? (CATALOGS.PARISHES as any)[newMember.workCity] || [] : [];

  // Helper to compute full name for dependent
  const computeDependentFullName = (dep: any) => {
    const parts = [
      dep.firstName || '',
      dep.onlyOneName ? '' : (dep.middleName || ''),
      dep.firstLastName || '',
      dep.onlyOneLastName ? '' : (dep.secondLastName || '')
    ].map(p => p.trim()).filter(Boolean);
    return parts.join(' ').toUpperCase();
  };

  // Handlers para Referencias y Cargas
  const handleAddReference = () => setNewMember(p => ({ ...p, references: [...(p.references || []), { name: '', phone: '', relationship: 'OTRO' }] }));
  const handleAddDependent = () => setNewMember(p => ({
    ...p,
    dependents: [
      ...(p.dependents || []),
      {
        id: '',
        name: '',
        firstName: '',
        middleName: '',
        firstLastName: '',
        secondLastName: '',
        onlyOneName: false,
        onlyOneLastName: false,
        relationship: 'HIJO/A'
      }
    ]
  }));

  // Fix: Replaced Array.from(files).forEach with a standard for loop for better type inference of 'file' as a Blob/File
  const handleUploadSketch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          setNewMember(p => ({ ...p, homeSketch: [...(p.homeSketch || []), base64] }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const openMapSelector = (type: 'home' | 'work') => {
    setMapModal({ isOpen: true, type });
  };

  const handleMapSelect = (address: string) => {
    if (mapModal.type === 'home') {
      setNewMember(p => ({ ...p, address: address.toUpperCase() }));
    } else {
      setNewMember(p => ({ ...p, workAddress: address.toUpperCase() }));
    }
    setMapModal({ isOpen: false, type: 'home' });
  };

  // Función para abrir el selector de mapa real
  const openRealMapSelector = (type: 'home' | 'work') => {
    setMapSelectorType(type);
    setShowMapSelector(true);
  };

  // Función para manejar la selección de ubicación del mapa
  const handleMapLocationSelect = (lat: string, lng: string, address: string, image: string) => {
    if (mapSelectorType === 'home') {
      setNewMember(p => ({ ...p, address: address.toUpperCase() }));
      setCapturedMapImage(image);
      setMapCoordinates({ lat, lng });
    } else {
      setNewMember(p => ({ ...p, workAddress: address.toUpperCase() }));
      setCapturedWorkMapImage(image);
      setWorkMapCoordinates({ lat, lng });
    }
  };

  // Función para cerrar el formulario sin guardar
  const handleCloseForm = () => {
    if (isFormLocked) {
      if (confirm('¿Está seguro de cerrar el formulario? Los datos no guardados se perderán.')) {
        resetForm();
      }
    } else {
      resetForm();
    }
  };

  // Función para resetear el formulario
  const resetForm = () => {
    setNewMember({
      id: '',
      idType: 'CÉDULA',
      firstName: '',
      middleName: '',
      firstLastName: '',
      secondLastName: '',
      onlyOneName: false,
      onlyOneLastName: false,
      email: '',
      phone: '',
      address: '',
      residenceCountry: '593 - ECUADOR',
      birthCountry: '593 - ECUADOR',
      birthProvince: '',
      birthCity: '',
      birthParish: '',
      ethnicity: 'MESTIZO',
      gender: 'MASCULINO',
      maritalStatus: 'SOLTERO',
      province: '',
      city: '',
      parish: '',
      profession: 'SIN ACTIVIDAD ECONÓMICA',
      instructionLevel: 'SIN INSTRUCCIÓN',
      role: UserRole.MEMBER,
      dependents: [],
      references: [
        { name: '', phone: '', relationship: 'FAMILIAR' },
        { name: '', phone: '', relationship: 'CONOCIDO' }
      ],
      homeSketch: [],
      workAddress: '',
      workProvince: '',
      workCity: '',
      workParish: '',
      spouseId: '',
      spouseName: '',
      spousePhone: '',
      pin: '1234',
      needsPinChange: true
    });
    setPersonType('SOCIO');
    setCapturedMapImage('');
    setCapturedWorkMapImage('');
    setMapCoordinates(null);
    setWorkMapCoordinates(null);
    setIsFormLocked(false);
    setIdStatus('idle');
    setHasChosenType(false);
    setSiguienteNumero('');
    setIdError('');
    setIdConExcepcion(false);
    setImgFrontalBase64('');
    setImgPosteriorBase64('');
  };

  // Función para registrar socio en SQL Server
  const handleRegisterSocioSQL = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (idStatus === 'invalid') {
      await showCustomAlert(`No se puede proceder con el registro: ${idError || 'La identificación es inválida o está duplicada.'}`, 'error', 'Validación');
      return;
    }

    if (personType === 'SOCIO' && calculatedAge !== null && calculatedAge < 18) {
      await showCustomAlert('REGLA DE SEGURIDAD: No se puede registrar a un menor de edad como Socio. Debe registrarlo como Cliente o Cliente Externo.', 'error', 'Error de Edad');
      return;
    }

    if (!newMember.id || !newMember.firstName || !newMember.firstLastName || !newMember.pin) {
      await showCustomAlert('Por favor complete todos los campos obligatorios (Identificación, Primer Nombre, Primer Apellido y PIN).', 'warning', 'Campos Incompletos');
      return;
    }

    if (!newMember.onlyOneName && !newMember.middleName) {
      await showCustomAlert('Debe ingresar el Segundo Nombre o marcar la opción "Tiene un solo nombre".', 'warning', 'Campos Incompletos');
      return;
    }

    if (!newMember.onlyOneLastName && !newMember.secondLastName) {
      await showCustomAlert('Debe ingresar el Segundo Apellido o marcar la opción "Tiene un solo apellido".', 'warning', 'Campos Incompletos');
      return;
    }

    setIsSaving(true);

    try {
      // Registrar socio en SQL Server
      const response = await fetch('/api/socios/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoPersona: personType,
          tipoIdentificacion: newMember.idType,
          identificacion: newMember.id,
          primerNombre: newMember.firstName,
          segundoNombre: newMember.onlyOneName ? '' : newMember.middleName,
          primerApellido: newMember.firstLastName,
          segundoApellido: newMember.onlyOneLastName ? '' : newMember.secondLastName,
          soloUnNombre: newMember.onlyOneName ? 1 : 0,
          soloUnApellido: newMember.onlyOneLastName ? 1 : 0,
          email: newMember.email,
          telefono: newMember.phone,
          fechaNacimiento: newMember.birthDate,
          estadoCivil: newMember.maritalStatus,
          pin: newMember.pin,
          paisNacimiento: newMember.birthCountry,
          provinciaNacimiento: newMember.birthProvince,
          cantonNacimiento: newMember.birthCity,
          parroquiaNacimiento: newMember.birthParish,
          paisResidencia: newMember.residenceCountry,
          provinciaResidencia: newMember.province,
          cantonResidencia: newMember.city,
          parroquiaResidencia: newMember.parish,
          direccionDomicilio: newMember.address,
          lugarTrabajo: newMember.workAddress,
          provinciaTrabajo: newMember.workProvince,
          cantonTrabajo: newMember.workCity,
          parroquiaTrabajo: newMember.workParish,
          cedulaConyuge: newMember.spouseId,
          nombreConyuge: newMember.spouseName,
          telefonoConyuge: newMember.spousePhone,
          etnia: newMember.ethnicity,
          genero: newMember.gender,
          nivelInstruccion: newMember.instructionLevel,
          profesion: newMember.profession,
          referenciasPersonales: newMember.references,
          cargasFamiliares: newMember.dependents,
          usuarioRegistro: currentUserRole === UserRole.TELLER ? 'caja' : 'admin',
          idConExcepcion: idConExcepcion,
          caraFrontal: idConExcepcion ? imgFrontalBase64 : null,
          caraPosterior: idConExcepcion ? imgPosteriorBase64 : null
        })
      });

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Error al registrar socio');
      }

      // Guardar imagen del mapa de ubicación si existe
      if (capturedMapImage && data.socioId) {
        await fetch('/api/socios/guardar-mapa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socioId: data.socioId,
            imagenMapa: capturedMapImage,
            coordenadaLat: mapCoordinates?.lat,
            coordenadaLng: mapCoordinates?.lng,
            direccionCapturada: newMember.address
          })
        });
      }

      // Guardar imagen del croquis de trabajo si existe
      if (capturedWorkMapImage && data.socioId) {
        await fetch('/api/socios/guardar-croquis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            socioId: data.socioId,
            imagenCroquis: capturedWorkMapImage,
            descripcion: 'Croquis del lugar de trabajo'
          })
        });
      }

      // Buscar el socio recién creado en la base de datos para obtener su objeto completo (con cuentas reales de la DB)
      let dbUserObj = null;
      try {
        const searchRes = await fetch(`/api/socios/buscar?q=${encodeURIComponent(newMember.id!)}`);
        const searchData = await searchRes.json();
        if (searchData.ok && searchData.data && searchData.data.length > 0) {
          dbUserObj = searchData.data[0];
        }
      } catch (searchErr) {
        console.error('Error al recuperar socio registrado de la DB:', searchErr);
      }

      const completeName = `${newMember.firstName} ${newMember.middleName ? newMember.middleName + ' ' : ''}${newMember.firstLastName} ${newMember.onlyOneLastName ? '' : (newMember.secondLastName || '')}`.trim();

      // Abrir modal de validación de datos del socio recién registrado
      setRegistrationSuccessModal({
        isOpen: true,
        numeroSocio: data.numeroSocio || '',
        cedula: newMember.id || '',
        name: completeName,
        email: newMember.email || '',
        userObj: dbUserObj
      });

    } catch (error: any) {
      console.error('Error registrando socio:', error);
      await showCustomAlert(error.message || 'Error al registrar el socio. Por favor intente nuevamente.', 'error', 'Error');
    } finally {
      setIsSaving(false);
    }
  };

  // Función para cargar socios desde SQL Server
  const loadSociosConsultas = async () => {
    setLoadingConsultas(true);
    try {
      const response = await fetch('/api/socios/consultas');
      const data = await response.json();
      if (data.ok) {
        setSociosConsultas(data.data);
      }
    } catch (error) {
      console.error('Error cargando consultas:', error);
    } finally {
      setLoadingConsultas(false);
    }
  };

  // Cargar datos cuando se cambia a la pestaña CONSULTAS
  useEffect(() => {
    if (activeTab === 'CONSULTAS') {
      loadSociosConsultas();
    }
  }, [activeTab]);

  // Funciones para manejo de efectivo
  const updateCashDetail = (type: 'bills' | 'coins', index: number, count: number) => {
    const updated = { ...cashDetail };
    updated[type][index].count = count;
    updated[type][index].total = updated[type][index].denomination * count;
    updated.total = updated.bills.reduce((sum, b) => sum + b.total, 0) + updated.coins.reduce((sum, c) => sum + c.total, 0);
    setCashDetail(updated);
  };

  const calculateCashTotal = () => {
    const total = cashDetail.bills.reduce((sum, b) => sum + b.total, 0) + cashDetail.coins.reduce((sum, c) => sum + c.total, 0);
    setCashDetail({ ...cashDetail, total });
  };

  // Modificar handleOperation para incluir nuevas operaciones
  const handleOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !amount) return;
    const numAmount = parseFloat(amount);

    // Verificar saldo suficiente para operaciones de débito
    if (opType === 'WITHDRAW' || opType === 'DEBIT_NOTE' || opType === 'ACCOUNT_TRANSFER' || opType === 'INTERBANK_TRANSFER') {
      const selectedAcc = selectedUser.accounts.find(a => a.id === selectedAccountId);
      if (!selectedAcc) {
        return alert("Debe seleccionar una cuenta.");
      }
      if (selectedAcc.balance <= 0) {
        return alert("REGLA DE SEGURIDAD: El saldo de la cuenta es cero ($0.00). No se pueden realizar retiros, notas de débito o transferencias.");
      }
      if (selectedAcc.balance < numAmount) {
        return alert(`REGLA DE SEGURIDAD: Saldo insuficiente. El saldo disponible es $${selectedAcc.balance.toFixed(2)} y el monto solicitado es $${numAmount.toFixed(2)}.`);
      }
    }

    // Validar regla de negocio de Certificados de Aportación para retiros
    if (opType === 'WITHDRAW') {
      const selectedAcc = selectedUser.accounts.find(a => a.id === selectedAccountId);
      if (selectedAcc && selectedAcc.type === AccountType.CERTIFICATE) {
        return alert("REGLA DE NEGOCIO: No se pueden hacer retiros directos desde Certificados de Aportación. El dinero debe transferirse primero a una cuenta de ahorros para poder retirarse en efectivo.");
      }
    }

    if (opType === 'ACCOUNT_TRANSFER') {
      if (!destAccountId) {
        return alert("Debe seleccionar una cuenta de destino.");
      }
      if (selectedAccountId === destAccountId) {
        return alert("La cuenta de origen y de destino no pueden ser la misma.");
      }

      // Validar saldo suficiente en la cuenta de origen
      const sourceAcc = selectedUser.accounts.find(a => a.id === selectedAccountId);
      if (!sourceAcc || sourceAcc.balance < numAmount) {
        return alert("Saldo insuficiente en la cuenta de origen para realizar la transferencia.");
      }

      // Buscar el socio dueño de la cuenta de destino (puede ser el socio actual u otro)
      let destUser = users.find(u => u.accounts.some(acc => acc.id === destAccountId));
      if (!destUser) {
        if (selectedUser.accounts.some(acc => acc.id === destAccountId)) {
          destUser = selectedUser;
        }
      }
      if (!destUser) {
        return alert("No se pudo identificar al titular de la cuenta de destino.");
      }

      const txId = `TX-${Date.now()}`;

      // Transacción de Débito (Socio Origen)
      const debitTx: Transaction = {
        id: `${txId}-D`,
        date: new Date().toLocaleDateString('es-EC'),
        description: `TRANSFERENCIA INTERNA ENVIADA A ${destUser.name}`,
        amount: -numAmount,
        type: 'DEBIT',
        category: 'Transferencias',
        accountId: selectedAccountId,
        isCash: false,
        tellerId: currentUser?.id || 'caja'
      };

      // Transacción de Crédito (Socio Destino)
      const creditTx: Transaction = {
        id: `${txId}-C`,
        date: new Date().toLocaleDateString('es-EC'),
        description: `TRANSFERENCIA INTERNA RECIBIDA DE ${selectedUser.name}`,
        amount: numAmount,
        type: 'CREDIT',
        category: 'Transferencias',
        accountId: destAccountId,
        isCash: false,
        tellerId: currentUser?.id || 'caja'
      };

      // Actualizar cuentas del socio origen
      const updatedSourceAccounts = selectedUser.accounts.map(acc => {
        if (acc.id === selectedAccountId) {
          return { ...acc, balance: acc.balance - numAmount };
        }
        if (destUser.id === selectedUser.id && acc.id === destAccountId) {
          return { ...acc, balance: acc.balance + numAmount };
        }
        return acc;
      });

      const sourceTxs = [debitTx, ...(selectedUser.transactions || [])];
      if (destUser.id === selectedUser.id) {
        sourceTxs.unshift(creditTx);
      }

      const updatedSourceUser = {
        ...selectedUser,
        accounts: updatedSourceAccounts,
        transactions: sourceTxs
      };

      onUpdateUser(updatedSourceUser);

      // Si es otro socio, actualizar su información también
      if (destUser.id !== selectedUser.id) {
        const updatedDestAccounts = destUser.accounts.map(acc => {
          if (acc.id === destAccountId) {
            return { ...acc, balance: acc.balance + numAmount };
          }
          return acc;
        });

        onUpdateUser({
          ...destUser,
          accounts: updatedDestAccounts,
          transactions: [creditTx, ...(destUser.transactions || [])]
        });
      }

      // Registrar transacciones locales para el cajero
      setDrawerTransactions(prev => [debitTx, creditTx, ...prev]);

      // Abrir recibo del débito
      setSelectedReceiptTx(debitTx);
      setSelectedReceiptUser(updatedSourceUser);
      setShowReceiptModal(true);

      // Resetear estados
      setSelectedUser(null);
      setAmount('');
      setDestAccountId('');
      setDestMemberUser(null);
      return;
    }

    let description = '';
    let category = '';

    switch (opType) {
      case 'DEPOSIT':
        description = showCashDetail ? 'DEPÓSITO VENTANILLA CON DETALLE' : 'DEPÓSITO VENTANILLA';
        category = 'Caja';
        break;
      case 'WITHDRAW':
        description = 'RETIRO VENTANILLA';
        category = 'Caja';
        break;
      case 'CREDIT_NOTE':
        description = 'NOTA DE CRÉDITO';
        category = 'Ajustes';
        break;
      case 'DEBIT_NOTE':
        description = 'NOTA DE DÉBITO';
        category = 'Ajustes';
        break;
      case 'INTERBANK_TRANSFER':
        description = `TRANSFERENCIA INTERBANCARIA A ${interbankTransfer.toBank}`;
        category = 'Transferencias';
        break;
    }

    const isDbAccount = selectedAccountId.startsWith('ca-');

    if (isDbAccount) {
      setIsSaving(true);
      fetch('/api/socios/transaccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          opType,
          amount: numAmount,
          description,
          tellerId: currentUser?.id || 'caja'
        })
      })
      .then(res => res.json())
      .then(async txData => {
        if (!txData.ok) {
          throw new Error(txData.error || 'Error al procesar la transacción en la base de datos');
        }

        const dbTx: Transaction = txData.transaction;
        const updatedAccounts = selectedUser.accounts.map(acc => {
          if (acc.id === selectedAccountId) {
            return { ...acc, balance: txData.balance };
          }
          return acc;
        });

        const updatedUserObj = {
          ...selectedUser,
          accounts: updatedAccounts,
          transactions: [dbTx, ...(selectedUser.transactions || [])]
        };

        onUpdateUser(updatedUserObj);
        setDrawerTransactions(prev => [dbTx, ...prev]);

        setSelectedReceiptTx(dbTx);
        setSelectedReceiptUser(updatedUserObj);
        setShowReceiptModal(true);

        // Reset state
        setSelectedUser(null);
        setAmount('');
        setCashDetail({
          bills: cashDetail.bills.map(b => ({ ...b, count: 0, total: 0 })),
          coins: cashDetail.coins.map(c => ({ ...c, count: 0, total: 0 })),
          total: 0
        });
        setShowCashDetail(false);
        setInterbankTransfer({ toBank: '', toAccount: '', toAccountName: '', reference: '' });
      })
      .catch(async err => {
        console.error('Error al procesar transacción DB:', err);
        await showCustomAlert(err.message || 'Error al procesar la transacción contable.', 'error', 'Error');
      })
      .finally(() => {
        setIsSaving(false);
      });
      return;
    }

    const updatedAccounts = selectedUser.accounts.map(acc => {
      if (acc.id === selectedAccountId) {
        if (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE') {
          return { ...acc, balance: acc.balance + numAmount };
        } else {
          return { ...acc, balance: acc.balance - numAmount };
        }
      }
      return acc;
    });

    const newTx: Transaction = {
      id: `TX-${Date.now()}`,
      date: new Date().toLocaleDateString('es-EC'),
      description,
      amount: (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE') ? numAmount : -numAmount,
      type: (opType === 'DEPOSIT' || opType === 'CREDIT_NOTE') ? 'CREDIT' : 'DEBIT',
      category,
      accountId: selectedAccountId,
      isCash: opType === 'DEPOSIT' || opType === 'WITHDRAW',
      tellerId: currentUser?.id || 'caja'
    };

    const updatedUserObj = { ...selectedUser, accounts: updatedAccounts, transactions: [newTx, ...(selectedUser.transactions || [])] };
    onUpdateUser(updatedUserObj);
    
    // Registrar la transacción localmente para el arqueo de esta sesión
    setDrawerTransactions(prev => [newTx, ...prev]);

    // Abrir modal de recibo para impresión
    setSelectedReceiptTx(newTx);
    setSelectedReceiptUser(updatedUserObj);
    setShowReceiptModal(true);

    // Resetear estados de operación
    setSelectedUser(null);
    setAmount('');
    setCashDetail({
      bills: cashDetail.bills.map(b => ({ ...b, count: 0, total: 0 })),
      coins: cashDetail.coins.map(c => ({ ...c, count: 0, total: 0 })),
      total: 0
    });
    setShowCashDetail(false);
    setInterbankTransfer({ toBank: '', toAccount: '', toAccountName: '', reference: '' });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20 no-print">
      {/* Modal de Recibo para Impresión */}
      {renderReceiptModal()}

      {!isDrawerOpen ? (
        (() => {
          const closedDate = localStorage.getItem(`caja_last_close_date_${currentUser?.id || 'caja'}`);
          const isTodayClosed = closedDate === serverDate && serverDate !== '';
          
          if (isTodayClosed) {
            return (
              <div className="max-w-md mx-auto space-y-8 animate-in fade-in duration-700 pb-20 pt-10">
                <div className="bg-white rounded-[3.5rem] shadow-2xl p-12 border-t-[12px] border-red-500 text-center">
                  <div className="w-20 h-20 bg-red-50 text-red-500 rounded-[2.5rem] flex items-center justify-center mb-6 mx-auto shadow-inner animate-pulse">
                    <Calculator size={40} />
                  </div>
                  <h2 className="text-3xl font-black text-red-600 tracking-tight uppercase leading-none">Caja Cerrada</h2>
                  <p className="text-slate-500 font-bold text-sm mt-6 uppercase tracking-wider leading-relaxed">
                    Usted ya realizó el cierre de caja por el día de hoy.
                  </p>
                  <p className="text-slate-400 text-[10px] mt-2 font-bold leading-normal">
                    No se permite realizar más transacciones hasta la próxima jornada de trabajo.
                  </p>
                </div>
              </div>
            );
          }
          
          return (
            <div className="max-w-md mx-auto space-y-8 animate-in fade-in duration-700 pb-20 pt-10">
              <div className="bg-white rounded-[3.5rem] shadow-2xl p-12 border-t-[12px] border-[#14532D]">
                <div className="flex flex-col items-center mb-10 text-center">
                  <div className="w-20 h-20 bg-emerald-50 text-[#14532D] rounded-[2.5rem] flex items-center justify-center mb-6 shadow-inner">
                    <Calculator size={40} />
                  </div>
                  <h2 className="text-3xl font-black text-[#14532D] tracking-tight uppercase leading-none">Inicio de Caja</h2>
                  <p className="text-slate-400 font-bold text-xs mt-2 uppercase tracking-widest leading-relaxed">
                    Declare su saldo de apertura
                  </p>
                </div>
                
                {lastCloseTotal !== null && lastCloseDetail && (
                  <div className="mb-6 p-6 bg-slate-50 rounded-3xl border border-slate-200/60 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                      Efectivo del Cierre Anterior
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-700">
                      <div className="space-y-1">
                        <span className="text-[9px] text-slate-400">Total del Cierre:</span>
                        <p className="text-lg font-black text-[#14532D]">${lastCloseTotal.toFixed(2)} USD</p>
                      </div>
                      <div className="space-y-1 text-right flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setShowPrevCloseDetail(!showPrevCloseDetail)}
                          className="text-[9px] bg-emerald-50 hover:bg-emerald-100 text-[#14532D] px-3 py-1.5 rounded-lg border border-emerald-200/30 transition-colors uppercase tracking-wider font-black"
                        >
                          {showPrevCloseDetail ? 'Ocultar Detalle' : 'Ver Detalle'}
                        </button>
                      </div>
                    </div>

                    {showPrevCloseDetail && (
                      <div className="pt-3 border-t border-slate-200 space-y-3 animate-in fade-in duration-200 max-h-[150px] overflow-y-auto no-scrollbar">
                        <div className="grid grid-cols-2 gap-4 text-[10px] leading-relaxed">
                          <div>
                            <p className="font-black text-slate-400 mb-1 uppercase tracking-wider">Billetes:</p>
                            {lastCloseDetail.bills.filter(b => b.count > 0).map(b => (
                              <div key={b.denomination} className="flex justify-between border-b border-slate-100 py-1">
                                <span className="text-slate-500 font-bold">${b.denomination} x {b.count}</span>
                                <span className="text-slate-800 font-black">${b.total.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="font-black text-slate-400 mb-1 uppercase tracking-wider">Monedas:</p>
                            {lastCloseDetail.coins.filter(c => c.count > 0).map(c => (
                              <div key={c.denomination} className="flex justify-between border-b border-slate-100 py-1">
                                <span className="text-slate-500 font-bold">${c.denomination.toFixed(2)} x {c.count}</span>
                                <span className="text-slate-800 font-black">${c.total.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <form className="space-y-6" onSubmit={async (e) => {
                  e.preventDefault();
                  const balance = parseFloat(balanceInput) || 0;
                  
                  if (lastCloseTotal !== null && Math.abs(balance - lastCloseTotal) > 0.009) {
                    await showCustomAlert(`El saldo de apertura ($${balance.toFixed(2)}) debe coincidir exactamente con el saldo del cierre anterior ($${lastCloseTotal.toFixed(2)}) para poder habilitar la caja.`, 'error', 'Error de Validación');
                    return;
                  }

                  try {
                    const res = await fetch('/api/caja/control/abrir', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        usuarioId: currentUser?.id || 'caja',
                        fecha: serverDate || new Date().toISOString().split('T')[0],
                        saldoApertura: balance
                      })
                    });
                    const data = await res.json();
                    if (!data.ok) {
                      throw new Error(data.error || 'Error al abrir caja');
                    }
                    setOpeningBalance(balance);
                    setIsDrawerOpen(true);
                    setDrawerTransactions([]);
                    await showCustomAlert("¡Caja iniciada correctamente! Jornada abierta.", 'success', 'Caja Iniciada');
                  } catch (err: any) {
                    await showCustomAlert(err.message || 'Error al registrar la apertura de caja en el servidor.', 'error', 'Error');
                  }
                }}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Dinero en Caja (Saldo de Apertura)</label>
                      <div className="relative">
                        <DollarSign size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                        <input
                          name="startingCash"
                          required
                          type="number"
                          step="0.01"
                          min="0"
                          value={balanceInput}
                          onChange={e => setBalanceInput(e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-14 pr-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-[#14532D] outline-none font-black text-[#14532D] text-2xl shadow-inner"
                        />
                      </div>
                      {lastCloseTotal !== null && (
                        <p className={`text-[10px] font-black ml-1 ${Math.abs((parseFloat(balanceInput) || 0) - lastCloseTotal) < 0.009 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {Math.abs((parseFloat(balanceInput) || 0) - lastCloseTotal) < 0.009
                            ? '✓ El saldo coincide con el cierre anterior.'
                            : `✗ Debe ingresar exactamente $${lastCloseTotal.toFixed(2)} USD.`}
                        </p>
                      )}
                      {lastCloseTotal === null && (
                        <p className="text-[9px] font-bold text-slate-400 ml-1">Declare el remanente de efectivo disponible en la gaveta.</p>
                      )}
                    </div>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={lastCloseTotal !== null && Math.abs((parseFloat(balanceInput) || 0) - lastCloseTotal) > 0.009}
                    className="w-full py-5 bg-[#14532D] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-[2rem] font-black text-xl shadow-xl hover:bg-[#1b5e20] transition-all flex items-center justify-center gap-4 group mt-8 uppercase tracking-wider"
                  >
                    ABRIR CAJA VENTANILLA <ArrowRightLeft size={20} className="text-[#FACC15]" />
                  </button>
                </form>
              </div>
            </div>
          );
        })()
      ) : (
        <>
          {/* Modal Mapa Real con Captura */}
          {showMapSelector && (
            <MapSelector
          onLocationSelect={handleMapLocationSelect}
          onClose={() => setShowMapSelector(false)}
          initialPosition={mapSelectorType === 'home' ? { lat: -1.5923, lng: -78.9044 } : { lat: -1.5923, lng: -78.9044 }}
          title={mapSelectorType === 'home' ? 'Seleccionar Ubicación de Domicilio' : 'Seleccionar Ubicación de Trabajo'}
        />
      )}

      <div className="flex flex-col gap-8 w-full transition-all duration-500">

        {/* Contenedor del Contenido Activo */}
        <div className="flex-1 w-full space-y-8">

      {activeTab === 'OPERATIONS' && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-1 space-y-6">
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                 <h3 className="text-xl font-black text-[#14532D] mb-6 uppercase tracking-tighter">Buscar Socio</h3>
                 <div className="flex gap-2">
                   <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ID o Nombre..." className="flex-1 px-6 py-4 bg-slate-100 border-none rounded-2xl outline-none font-black text-[#14532D] shadow-inner" />
                   <button onClick={handleSearch} className="p-4 bg-[#14532D] text-white rounded-2xl shadow-lg active:scale-95 transition-all"><Search size={20}/></button>
                 </div>
              </div>
              {selectedUser && (
                <div className="bg-[#14532D] p-8 rounded-[2.5rem] text-white shadow-2xl animate-in zoom-in-95 duration-500 border-b-[8px] border-[#FACC15]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-2">Socio Seleccionado</p>
                  <h4 className="text-2xl font-black uppercase tracking-tighter mb-4">{selectedUser.name}</h4>
                  <div className="space-y-4 pt-4 border-t border-white/10">
                    {selectedUser.accounts.map(acc => (
                      <div key={acc.id} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5 hover:bg-white/10 transition-all cursor-pointer" onClick={() => setSelectedAccountId(acc.id)}>
                        <div>
                          <p className="text-[9px] font-black text-emerald-300 uppercase">{acc.type.replace('_', ' ')}</p>
                          <p className={`font-bold text-xs ${selectedAccountId === acc.id ? 'text-[#FACC15]' : 'opacity-70'}`}>#{acc.number}</p>
                        </div>
                        <p className="text-lg font-black">${acc.balance.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="xl:col-span-2">
              {selectedUser ? (
                <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100 animate-in slide-in-from-right-4">
                  <form onSubmit={handleOperation} className="space-y-10">
                    <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-[2rem]">
                      <button type="button" onClick={() => { setOpType('DEPOSIT'); setShowCashDetail(true); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'DEPOSIT' ? 'bg-[#14532D] text-[#FACC15] shadow-xl border border-[#FACC15]' : 'text-slate-400'}`}>DEPÓSITO</button>
                      <button type="button" onClick={() => { setOpType('WITHDRAW'); setShowCashDetail(true); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'WITHDRAW' ? 'bg-[#14532D] text-[#FACC15] shadow-xl border border-[#FACC15]' : 'text-slate-400'}`}>RETIRO</button>
                      <button type="button" onClick={() => { setOpType('CREDIT_NOTE'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'CREDIT_NOTE' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>NOTA CRÉDITO</button>
                      <button type="button" onClick={() => { setOpType('DEBIT_NOTE'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'DEBIT_NOTE' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>NOTA DÉBITO</button>
                      <button type="button" onClick={() => { setOpType('ACCOUNT_TRANSFER'); setShowCashDetail(false); setDestAccountId(''); setDestMemberUser(null); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'ACCOUNT_TRANSFER' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>TRANS. INTERNA</button>
                      <button type="button" onClick={() => { setOpType('INTERBANK_TRANSFER'); setShowCashDetail(false); }} className={`flex-1 min-w-[120px] py-4 rounded-[1.5rem] font-black text-[10px] uppercase transition-all flex items-center justify-center gap-2 ${opType === 'INTERBANK_TRANSFER' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-400'}`}>TRANS. INTERBANCARIA</button>
                    </div>

                    {opType === 'ACCOUNT_TRANSFER' && (
                      <div className="space-y-4 animate-in slide-in-from-top-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Destinatario</label>
                          <div className="flex gap-4 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                            <button
                              type="button"
                              onClick={() => { setTransferType('OWN'); setDestMemberUser(null); setDestAccountId(''); }}
                              className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${transferType === 'OWN' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}
                            >
                              Cuentas Propias
                            </button>
                            <button
                              type="button"
                              onClick={() => { setTransferType('OTHER'); setDestAccountId(''); }}
                              className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase transition-all ${transferType === 'OTHER' ? 'bg-[#14532D] text-white shadow-md' : 'text-slate-400'}`}
                            >
                              Otro Socio (Interna)
                            </button>
                          </div>
                        </div>

                        {transferType === 'OTHER' && (
                          <div className="space-y-2 animate-in slide-in-from-top-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Socio Destinatario</label>
                            <select
                              required
                              value={destMemberUser?.id || ''}
                              onChange={e => {
                                const found = users.find(u => u.id === e.target.value);
                                setDestMemberUser(found || null);
                                setDestAccountId(found?.accounts[0]?.id || '');
                              }}
                              className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none"
                            >
                              <option value="">Seleccione Socio Destinatario...</option>
                              {users.filter(u => u.id !== selectedUser.id && u.role === UserRole.MEMBER).map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.id})</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {transferType === 'OWN' && (
                          <div className="space-y-2 animate-in slide-in-from-top-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Cuenta de Destino</label>
                            <select
                              required
                              value={destAccountId}
                              onChange={e => setDestAccountId(e.target.value)}
                              className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none"
                            >
                              <option value="">Seleccione Cuenta Destino...</option>
                              {selectedUser.accounts.filter(acc => acc.id !== selectedAccountId).map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.type.replace('_', ' ')} - #{acc.number} (${acc.balance.toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {transferType === 'OTHER' && destMemberUser && (
                          <div className="space-y-2 animate-in slide-in-from-top-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Cuenta de Destino (del Socio Seleccionado)</label>
                            <select
                              required
                              value={destAccountId}
                              onChange={e => setDestAccountId(e.target.value)}
                              className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none"
                            >
                              <option value="">Seleccione Cuenta Destino...</option>
                              {destMemberUser.accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.type.replace('_', ' ')} - #{acc.number} (${acc.balance.toFixed(2)})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}

                    {opType === 'INTERBANK_TRANSFER' && (
                      <div className="space-y-4 animate-in slide-in-from-top-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Banco Destino</label>
                            <select required value={interbankTransfer.toBank} onChange={e => setInterbankTransfer({...interbankTransfer, toBank: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                              <option value="">Seleccione...</option>
                              <option value="BANCO PICHINCHA">BANCO PICHINCHA</option>
                              <option value="BANCO GUAYAQUIL">BANCO GUAYAQUIL</option>
                              <option value="BANCO PACÍFICO">BANCO PACÍFICO</option>
                              <option value="BANCO AMAZONAS">BANCO AMAZONAS</option>
                              <option value="BANCO BOLIVARIANO">BANCO BOLIVARIANO</option>
                              <option value="BANCO DEL AUSTRO">BANCO DEL AUSTRO</option>
                              <option value="BANCO INTERNACIONAL">BANCO INTERNACIONAL</option>
                              <option value="BANCO PRODUBANCO">BANCO PRODUBANCO</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cuenta Destino</label>
                            <input required type="text" value={interbankTransfer.toAccount} onChange={e => setInterbankTransfer({...interbankTransfer, toAccount: e.target.value})} placeholder="Número de cuenta" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Beneficiario</label>
                          <input required type="text" value={interbankTransfer.toAccountName} onChange={e => setInterbankTransfer({...interbankTransfer, toAccountName: e.target.value.toUpperCase()})} placeholder="Nombre completo" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Referencia</label>
                          <input type="text" value={interbankTransfer.reference} onChange={e => setInterbankTransfer({...interbankTransfer, reference: e.target.value})} placeholder="Referencia opcional" className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto de Operación ($)</label>
                       <div className="relative">
                         <DollarSign size={24} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" />
                         <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="w-full pl-16 pr-8 py-5 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] text-2xl focus:ring-4 focus:ring-[#14532D]/10 outline-none shadow-inner" />
                       </div>
                    </div>

                    {(opType === 'DEPOSIT' || opType === 'WITHDRAW') && (
                      <div className="space-y-4">
                        <button type="button" onClick={() => setShowCashDetail(!showCashDetail)} className="flex items-center gap-2 text-[10px] font-black text-[#14532D] uppercase tracking-widest hover:underline">
                          <Calculator size={16} /> {showCashDetail ? 'Ocultar' : 'Mostrar'} detalle de billetes y monedas
                        </button>

                        {showCashDetail && (
                          <div className="space-y-6 animate-in slide-in-from-top-4 p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
                            <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest">Detalle de Billetes</h4>
                            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                              {cashDetail.bills.map((bill, i) => (
                                <div key={i} className="space-y-2">
                                  <label className="text-[9px] font-black text-slate-500 uppercase block text-center">${bill.denomination}</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={bill.count}
                                    onChange={e => updateCashDetail('bills', i, parseInt(e.target.value) || 0)}
                                    className="w-full px-3 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-center text-[#14532D] focus:border-[#14532D] outline-none"
                                  />
                                  <p className="text-[9px] font-bold text-center text-slate-400">${bill.total.toFixed(2)}</p>
                                </div>
                              ))}
                            </div>

                            <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest pt-4 border-t border-emerald-200">Detalle de Monedas</h4>
                            <div className="grid grid-cols-5 gap-4">
                              {cashDetail.coins.map((coin, i) => (
                                <div key={i} className="space-y-2">
                                  <label className="text-[9px] font-black text-slate-500 uppercase block text-center">${coin.denomination}</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={coin.count}
                                    onChange={e => updateCashDetail('coins', i, parseInt(e.target.value) || 0)}
                                    className="w-full px-3 py-3 bg-white border-2 border-slate-200 rounded-xl font-black text-center text-[#14532D] focus:border-[#14532D] outline-none"
                                  />
                                  <p className="text-[9px] font-bold text-center text-slate-400">${coin.total.toFixed(2)}</p>
                                </div>
                              ))}
                            </div>

                            <div className="flex justify-between items-center pt-4 border-t border-emerald-200 bg-emerald-100 p-4 rounded-2xl">
                              <span className="text-sm font-black text-[#14532D] uppercase">Total Efectivo:</span>
                              <span className="text-2xl font-black text-[#14532D]">${cashDetail.total.toFixed(2)}</span>
                            </div>

                            {(() => {
                              const opAmt = parseFloat(amount || '0');
                              const diff = cashDetail.total - opAmt;
                              if (isNaN(opAmt) || opAmt <= 0) return null;
                              if (Math.abs(diff) < 0.009) {
                                return (
                                  <div className="mt-4 p-3 bg-emerald-500 text-white font-black text-[10px] rounded-xl text-center uppercase tracking-widest">
                                    ✓ El detalle de efectivo coincide exactamente con el monto de operación
                                  </div>
                                );
                              } else if (diff < 0) {
                                return (
                                  <div className="mt-4 p-3 bg-red-500 text-white font-black text-[10px] rounded-xl text-center uppercase tracking-widest">
                                    ⚠ Diferencia: -${Math.abs(diff).toFixed(2)} USD (Falta detallar efectivo)
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="mt-4 p-3 bg-amber-500 text-white font-black text-[10px] rounded-xl text-center uppercase tracking-widest">
                                    ⚠ Diferencia: +${diff.toFixed(2)} USD (Exceso en efectivo detallado)
                                  </div>
                                );
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {(() => {
                      const isCashOp = opType === 'DEPOSIT' || opType === 'WITHDRAW';
                      const isCashDetailValid = !isCashOp || (Math.abs(cashDetail.total - parseFloat(amount || '0')) < 0.009 && cashDetail.total > 0);
                      const isConfirmDisabled = isSaving || !amount || parseFloat(amount) <= 0 || (isCashOp && !isCashDetailValid);
                      
                      return (
                        <button
                          type="submit"
                          disabled={isConfirmDisabled}
                          className={`w-full py-7 font-black text-2xl shadow-2xl border-b-[6px] transition-all uppercase tracking-tighter rounded-full ${
                            isConfirmDisabled
                              ? 'bg-slate-300 border-slate-400 text-slate-400 cursor-not-allowed opacity-50 border-b-[6px]'
                              : 'bg-[#14532D] text-white border-[#FACC15] active:translate-y-2 hover:bg-emerald-800'
                          }`}
                        >
                          CONFIRMAR TRANSACCIÓN
                        </button>
                      );
                    })()}
                  </form>
                </div>
              ) : (
                <div className="h-full bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem] flex flex-col items-center justify-center p-20 text-center opacity-50">
                  <Banknote size={80} className="mb-6 text-slate-300" />
                  <h4 className="text-lg font-black text-slate-400 uppercase tracking-widest italic">Esperando socio en ventanilla</h4>
                </div>
              )}
            </div>
          </div>

          {/* Historial de transacciones de la sesión del cajero */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-6">Papeletas y Transacciones del Día</h3>
            {drawerTransactions.length === 0 ? (
              <p className="text-xs font-bold text-slate-400 italic">No ha realizado transacciones en esta jornada.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      <th className="px-6 py-4 text-left">Hora / Ref</th>
                      <th className="px-6 py-4 text-left">Cuenta</th>
                      <th className="px-6 py-4 text-left">Descripción</th>
                      <th className="px-6 py-4 text-right">Monto ($)</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drawerTransactions.map((tx, idx) => {
                      const isAnnulled = tx.description.startsWith('ANULADO');
                      return (
                        <tr key={idx} className={`hover:bg-slate-50 transition-colors ${isAnnulled ? 'opacity-40 line-through bg-red-50/20' : ''}`}>
                          <td className="px-6 py-4 font-mono text-xs">{tx.id}</td>
                          <td className="px-6 py-4 font-bold text-slate-600 text-xs">{tx.accountId}</td>
                          <td className="px-6 py-4 text-xs font-bold">{tx.description}</td>
                          <td className={`px-6 py-4 text-right font-black text-xs ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-center space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                const member = users.find(u => u.accounts.some(acc => acc.id === tx.accountId));
                                setSelectedReceiptTx(tx);
                                setSelectedReceiptUser(member || null);
                                setShowReceiptModal(true);
                              }}
                              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black hover:bg-slate-200 transition-all"
                            >
                              RECIBO
                            </button>
                            {!isAnnulled && (
                              <button
                                type="button"
                                onClick={() => handleAnnulTransaction(tx)}
                                className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black hover:bg-red-100 transition-all"
                              >
                                ANULAR
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'REGISTER' && !hasChosenType && (
        <div className="bg-white rounded-[4rem] shadow-xl border border-slate-100 p-12 space-y-10 animate-in fade-in duration-500 text-center">
          <div className="space-y-4">
            <div className="w-20 h-20 bg-emerald-50 text-[#14532D] rounded-[2.5rem] flex items-center justify-center mx-auto shadow-inner">
              <UserPlus size={40} />
            </div>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight uppercase leading-none">Apertura de Socio / Cliente</h3>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-widest max-w-md mx-auto leading-relaxed">
              Seleccione el tipo de cliente para iniciar el registro e iniciar el secuencial de base de datos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Tarjeta 1: SOCIO */}
            <button
              type="button"
              onClick={() => handleChooseType('SOCIO')}
              className="bg-white hover:bg-emerald-50/30 border-2 border-slate-100 hover:border-[#14532D] p-8 rounded-[3rem] text-left transition-all duration-300 shadow-sm hover:shadow-xl group flex flex-col justify-between h-80 relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-emerald-50 text-[#14532D] group-hover:bg-[#14532D] group-hover:text-white rounded-2xl flex items-center justify-center transition-all duration-300">
                  <UserIcon size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-[#14532D] uppercase tracking-tight">Socio Coac</h4>
                  <p className="text-xs text-slate-400 font-bold mt-2 leading-relaxed">
                    Apertura de cuenta de ahorros, certificados de aportación obligatorios y acceso completo a créditos.
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 w-full flex justify-between items-center">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider bg-emerald-100 px-3 py-1 rounded-full">Prefijo S-00</span>
                <span className="text-xs font-black text-slate-300 group-hover:text-[#14532D] transition-colors">Iniciar →</span>
              </div>
            </button>

            {/* Tarjeta 2: CLIENTE */}
            <button
              type="button"
              onClick={() => handleChooseType('CLIENTE')}
              className="bg-white hover:bg-emerald-50/30 border-2 border-slate-100 hover:border-[#14532D] p-8 rounded-[3rem] text-left transition-all duration-300 shadow-sm hover:shadow-xl group flex flex-col justify-between h-80 relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white rounded-2xl flex items-center justify-center transition-all duration-300">
                  <Users2 size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-blue-600 uppercase tracking-tight">Cliente Directo</h4>
                  <p className="text-xs text-slate-400 font-bold mt-2 leading-relaxed">
                    Ahorros a la vista, depósitos a plazo fijo y servicios de ventanilla. No requiere certificados de aportación.
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 w-full flex justify-between items-center">
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider bg-blue-100 px-3 py-1 rounded-full">Prefijo CL-00</span>
                <span className="text-xs font-black text-slate-300 group-hover:text-blue-600 transition-colors">Iniciar →</span>
              </div>
            </button>

            {/* Tarjeta 3: CLIENTE EXTERNO */}
            <button
              type="button"
              onClick={() => handleChooseType('CLIENTE_EXTERNO')}
              className="bg-white hover:bg-emerald-50/30 border-2 border-slate-100 hover:border-[#14532D] p-8 rounded-[3rem] text-left transition-all duration-300 shadow-sm hover:shadow-xl group flex flex-col justify-between h-80 relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white rounded-2xl flex items-center justify-center transition-all duration-300">
                  <Globe size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-black text-purple-600 uppercase tracking-tight">Cliente Externo</h4>
                  <p className="text-xs text-slate-400 font-bold mt-2 leading-relaxed">
                    Cobro de remesas, giros interbancarios, pago de servicios básicos y consultas rápidas por ventanilla.
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100 w-full flex justify-between items-center">
                <span className="text-[10px] font-black text-purple-600 uppercase tracking-wider bg-purple-100 px-3 py-1 rounded-full">Prefijo CE-00</span>
                <span className="text-xs font-black text-slate-300 group-hover:text-purple-600 transition-colors">Iniciar →</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'REGISTER' && hasChosenType && (
        <div className="bg-white rounded-[4rem] shadow-xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
          {/* Header del Formulario de Registro */}
          <div className="p-8 bg-slate-50 border-b flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white ${
                personType === 'SOCIO' ? 'bg-[#14532D]' : personType === 'CLIENTE' ? 'bg-blue-600' : 'bg-purple-600'
              }`}>
                <UserPlus size={24} />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight leading-none">
                  Registro de {personType === 'SOCIO' ? 'Socio' : personType === 'CLIENTE' ? 'Cliente' : 'Cliente Externo'}
                </h4>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1.5">
                  Llene el formulario obligatorio para la asignación definitiva del ID
                </p>
              </div>
            </div>
            <div className="bg-white border border-slate-200 px-6 py-3 rounded-2xl text-right shadow-sm">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">ID Socio Asignado Estimado</span>
              <span className={`text-lg font-black ${
                personType === 'SOCIO' ? 'text-[#14532D]' : personType === 'CLIENTE' ? 'text-blue-600' : 'text-purple-600'
              }`}>
                {siguienteNumero || 'Calculando...'}
              </span>
            </div>
          </div>
          
          <form className="p-12 space-y-10" onSubmit={handleRegisterSocioSQL}>
            {/* Sección 1: Identidad */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-[#14532D] pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Información Personal y de Identidad</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Identificación</label>
                    <select
                      value={newMember.idType}
                      onChange={e => setNewMember({...newMember, idType: e.target.value as any, id: ''})}
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none"
                    >
                      <option value="CÉDULA">CÉDULA</option>
                      <option value="RUC">RUC</option>
                      <option value="PASAPORTE">PASAPORTE</option>
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Número de Identificación</label>
                    <div className="relative">
                      <input
                        required
                        type="text"
                        maxLength={newMember.idType === 'CÉDULA' ? 10 : newMember.idType === 'RUC' ? 13 : 20}
                        value={newMember.id}
                        onChange={e => setNewMember({...newMember, id: e.target.value.replace(/\D/g, '')})}
                        className={`w-full px-6 py-4 bg-slate-100 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none transition-all ${idStatus === 'valid' ? 'bg-emerald-50' : idStatus === 'invalid' ? 'bg-red-50' : ''}`}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        {isValidating && <Loader2 size={16} className="animate-spin text-[#14532D]" />}
                        {idStatus === 'valid' && <CheckCircle2 size={16} className="text-emerald-500" />}
                        {idStatus === 'invalid' && <X size={16} className="text-rose-500" />}
                      </div>
                    </div>
                    {idError && <p className="text-[10px] font-bold text-rose-500 mt-1 ml-1">{idError}</p>}
                    {newMember.idType === 'CÉDULA' && (
                      <div className="mt-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={idConExcepcion}
                            onChange={e => {
                              setIdConExcepcion(e.target.checked);
                              if (e.target.checked) {
                                setShowDocUploadModal(true);
                              } else {
                                setImgFrontalBase64('');
                                setImgPosteriorBase64('');
                              }
                            }}
                            className="rounded text-[#14532D] focus:ring-[#14532D] w-4 h-4"
                          />
                          <span className="text-[9px] font-black text-slate-600 uppercase tracking-wider">
                            CEDULAS REALES PERO NO VALIDAS
                          </span>
                        </label>
                        {idConExcepcion && (
                          <div className="flex flex-col gap-2 pt-1.5 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setShowDocUploadModal(true)}
                              className="w-full py-2 bg-[#14532D]/10 hover:bg-[#14532D]/20 text-[#14532D] text-[9px] font-black rounded-xl border border-[#14532D]/20 uppercase tracking-widest transition-all text-center"
                            >
                              {imgFrontalBase64 && imgPosteriorBase64 ? '✓ Ver Documentos Cargados' : '⚠️ Subir Fotos del Documento'}
                            </button>
                            {(!imgFrontalBase64 || !imgPosteriorBase64) && (
                              <p className="text-[8px] font-bold text-rose-500 uppercase leading-none">
                                * Debe subir ambas caras para poder registrar al socio.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Primer Nombre</label>
                    <input required type="text" value={newMember.firstName} onChange={e => setNewMember({...newMember, firstName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Segundo Nombre</label>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={newMember.onlyOneName} onChange={e => setNewMember({...newMember, onlyOneName: e.target.checked, middleName: e.target.checked ? '' : newMember.middleName})} className="rounded text-[#14532D] focus:ring-[#14532D]" />
                        Un solo nombre
                      </label>
                    </div>
                    <input disabled={newMember.onlyOneName} required={!newMember.onlyOneName} type="text" value={newMember.onlyOneName ? '' : newMember.middleName} onChange={e => setNewMember({...newMember, middleName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50 disabled:bg-slate-100" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Primer Apellido</label>
                    <input required type="text" value={newMember.firstLastName} onChange={e => setNewMember({...newMember, firstLastName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Segundo Apellido</label>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" checked={newMember.onlyOneLastName} onChange={e => setNewMember({...newMember, onlyOneLastName: e.target.checked, secondLastName: e.target.checked ? '' : newMember.secondLastName})} className="rounded text-[#14532D] focus:ring-[#14532D]" />
                        Un solo apellido
                      </label>
                    </div>
                    <input disabled={newMember.onlyOneLastName} required={!newMember.onlyOneLastName} type="text" value={newMember.onlyOneLastName ? '' : newMember.secondLastName} onChange={e => setNewMember({...newMember, secondLastName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50 disabled:bg-slate-100" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <Mail size={14} className="text-[#14532D]" /> Correo Electrónico
                    </label>
                    <input required type="email" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value.toLowerCase()})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                      <CalendarIcon size={14} className="text-[#14532D]" /> Fecha de Nacimiento
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        required 
                        type="date" 
                        value={newMember.birthDate} 
                        onChange={e => setNewMember({...newMember, birthDate: e.target.value})} 
                        className="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none cursor-pointer appearance-none relative" 
                        style={{ colorScheme: 'light', minHeight: '3rem' }}
                      />
                      {calculatedAge !== null && (
                        <span className={`px-3 py-2.5 rounded-xl text-xs font-black shrink-0 ${
                          calculatedAge < 18 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {calculatedAge} AÑOS
                        </span>
                      )}
                    </div>
                    {calculatedAge !== null && calculatedAge < 18 && (
                      <div className="mt-1">
                        {personType === 'SOCIO' ? (
                          <p className="text-[10px] font-bold text-rose-500 leading-normal">
                            ⚠️ REGLA DE SEGURIDAD: Los menores de 18 años no pueden ser registrados como SOCIO, cambie a CLIENTE o CLIENTE EXTERNO.
                          </p>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full uppercase tracking-wider mt-1">
                            👶 MENOR DE EDAD
                          </span>
                        )}
                      </div>
                    )}
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado Civil</label>
                    <select value={newMember.maritalStatus} onChange={e => setNewMember({...newMember, maritalStatus: e.target.value as any})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                      {CATALOGS.MARITAL_STATUS.map(ms => <option key={ms} value={ms}>{ms}</option>)}
                    </select>
                 </div>
                 <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2"><Lock size={14}/> PIN Inicial (Debe ser modificado)</label>
                     <div className="relative">
                        <input required type={showPin ? "text" : "password"} maxLength={4} value={newMember.pin} onChange={e => setNewMember({...newMember, pin: e.target.value.replace(/\D/g, '')})} className="w-full pl-6 pr-12 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none text-center text-xl tracking-[0.3em]" />
                        <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">{showPin ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                     </div>
                     {newMember.pin === '1234' && (
                       <p className="text-[9px] font-bold text-rose-500 mt-1 ml-1 uppercase">
                         ⚠️ Debe modificar el PIN por defecto "1234" para habilitar el registro.
                       </p>
                     )}
                     {newMember.pin && newMember.pin.length !== 4 && (
                       <p className="text-[9px] font-bold text-rose-500 mt-1 ml-1 uppercase">
                         ⚠️ El PIN debe tener exactamente 4 dígitos.
                       </p>
                     )}
                  </div>
              </div>
            </div>

            {/* Sección 2: Datos del Cónyuge (Condicional) */}
            {(newMember.maritalStatus === 'CASADO' || newMember.maritalStatus === 'UNIÓN DE HECHO') && (
              <div className="space-y-6 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-2 border-l-4 border-pink-500 pl-4">
                  <h4 className="text-xs font-black text-pink-600 uppercase tracking-widest">Datos del Cónyuge</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cédula Cónyuge</label>
                    <input type="text" maxLength={10} value={newMember.spouseId} onChange={e => setNewMember({...newMember, spouseId: e.target.value.replace(/\D/g, '')})} className="w-full px-6 py-4 bg-pink-50/50 border-none rounded-2xl font-black text-pink-900 shadow-inner outline-none" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo Cónyuge</label>
                    <input type="text" value={newMember.spouseName} onChange={e => setNewMember({...newMember, spouseName: e.target.value.toUpperCase()})} className="w-full px-6 py-4 bg-pink-50/50 border-none rounded-2xl font-black text-pink-900 shadow-inner outline-none" />
                  </div>
                </div>
              </div>
            )}

            {/* Sección 3: Lugar de Nacimiento (S01 Requerido) */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-[#FACC15] pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Lugar de Nacimiento (S01)</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">País de Nacimiento</label>
                  <select value={newMember.birthCountry} onChange={e => {
                    const country = e.target.value;
                    setNewMember({
                      ...newMember, 
                      birthCountry: country,
                      birthProvince: country.includes('593') ? newMember.birthProvince : '',
                      birthCity: country.includes('593') ? newMember.birthCity : '',
                      birthParish: country.includes('593') ? newMember.birthParish : ''
                    });
                  }} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                    {CATALOGS.COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Provincia (Nac.)</label>
                  <select disabled={!newMember.birthCountry?.includes('593')} value={newMember.birthProvince} onChange={e => setNewMember({...newMember, birthProvince: e.target.value, birthCity: '', birthParish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {CATALOGS.PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cantón (Nac.)</label>
                  <select disabled={!newMember.birthProvince || !newMember.birthCountry?.includes('593')} value={newMember.birthCity} onChange={e => setNewMember({...newMember, birthCity: e.target.value, birthParish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {birthCities.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Parroquia (Nac.)</label>
                  <select disabled={!newMember.birthCity || !newMember.birthCountry?.includes('593')} value={newMember.birthParish} onChange={e => setNewMember({...newMember, birthParish: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {birthParishes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Sección 4: Ubicación de Residencia y Croquis */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-blue-500 pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Ubicación de Residencia y Croquis</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Provincia Residencia</label>
                  <select value={newMember.province} onChange={e => setNewMember({...newMember, province: e.target.value, city: '', parish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                    <option value="">Seleccione...</option>
                    {CATALOGS.PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cantón Residencia</label>
                  <select disabled={!newMember.province} value={newMember.city} onChange={e => setNewMember({...newMember, city: e.target.value, parish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {resCities.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Parroquia Residencia</label>
                  <select disabled={!newMember.city} value={newMember.parish} onChange={e => setNewMember({...newMember, parish: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Seleccione...</option>
                    {resParishes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Dirección Exacta (Domicilio)</label>
                  <div className="flex gap-2">
                    <input required type="text" value={newMember.address} onChange={e => setNewMember({...newMember, address: e.target.value.toUpperCase()})} className="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                    <button type="button" onClick={() => openRealMapSelector('home')} className="p-4 bg-white border-2 border-slate-100 text-blue-600 rounded-2xl shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2">
                       <MapIcon size={20} /> <span className="text-[10px] font-black uppercase">Mapa</span>
                    </button>
                  </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <ImageIcon size={14} className="text-[#14532D]" /> Croquis del Domicilio (Previsualización de Captura)
                </label>
                <div className="flex flex-wrap gap-4">
                  {capturedMapImage ? (
                    <div className="relative w-64 h-48 rounded-2xl overflow-hidden border-2 border-[#14532D] shadow-lg group">
                      <img src={capturedMapImage} alt="Captura del Mapa" className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-[#14532D]/90 px-3 py-2 text-center">
                        <span className="text-[9px] font-black text-white uppercase tracking-wider">Captura del Domicilio</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => {
                          setCapturedMapImage('');
                          setMapCoordinates(null);
                        }} 
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-md opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-64 h-48 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                      <MapIcon size={28} className="text-slate-300 mb-2" />
                      <span className="text-[9px] font-black uppercase text-slate-400">Sin captura del mapa</span>
                      <p className="text-[8px] text-slate-400 mt-1">Haga clic en el botón 'Mapa' de arriba para ubicar y capturar el domicilio.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sección 5: Dirección de Trabajo */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-l-4 border-emerald-550 pl-4">
                <h4 className="text-xs font-black text-[#14532D] uppercase tracking-widest">Información Laboral</h4>
              </div>
              
              {/* Fila 1: Selección geográfica */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Provincia (Trabajo)</label>
                  <select value={newMember.workProvince} onChange={e => setNewMember({...newMember, workProvince: e.target.value, workCity: '', workParish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none">
                    <option value="">Provincia...</option>
                    {CATALOGS.PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cantón (Trabajo)</label>
                  <select disabled={!newMember.workProvince} value={newMember.workCity} onChange={e => setNewMember({...newMember, workCity: e.target.value, workParish: ''})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Cantón...</option>
                    {workCities.map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Parroquia (Trabajo)</label>
                  <select disabled={!newMember.workCity} value={newMember.workParish} onChange={e => setNewMember({...newMember, workParish: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none disabled:opacity-50">
                    <option value="">Parroquia...</option>
                    {workParishes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Fila 2: Dirección y botón Mapa */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Lugar de Trabajo / Nombre Empresa (Dirección)</label>
                <div className="flex gap-2">
                  <input type="text" value={newMember.workAddress} onChange={e => setNewMember({...newMember, workAddress: e.target.value.toUpperCase()})} className="flex-1 px-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-[#14532D] shadow-inner outline-none" />
                  <button type="button" onClick={() => openRealMapSelector('work')} className="p-4 bg-white border-2 border-slate-100 text-emerald-600 rounded-2xl shadow-sm hover:bg-emerald-50 transition-all flex items-center gap-2">
                     <MapIcon size={20} /> <span className="text-[10px] font-black uppercase">Mapa</span>
                  </button>
                </div>
              </div>

              {/* Croquis de Trabajo Preview */}
              <div className="space-y-4 pt-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                  <ImageIcon size={14} className="text-[#14532D]" /> Croquis del Lugar de Trabajo (Previsualización de Captura)
                </label>
                <div className="flex flex-wrap gap-4">
                  {capturedWorkMapImage ? (
                    <div className="relative w-64 h-48 rounded-2xl overflow-hidden border-2 border-[#14532D] shadow-lg group">
                      <img src={capturedWorkMapImage} alt="Croquis de Trabajo" className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-[#14532D]/90 px-3 py-2 text-center">
                        <span className="text-[9px] font-black text-white uppercase tracking-wider">Croquis de Trabajo</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => {
                          setCapturedWorkMapImage('');
                          setWorkMapCoordinates(null);
                        }} 
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-md opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-64 h-48 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                      <MapIcon size={28} className="text-slate-300 mb-2" />
                      <span className="text-[9px] font-black uppercase text-slate-400">Sin croquis de trabajo</span>
                      <p className="text-[8px] text-slate-400 mt-1">Haga clic en el botón 'Mapa' de arriba para ubicar y capturar el lugar de trabajo.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sección 6: Referencias y Cargas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
               <div className="space-y-6">
                  <div className="flex justify-between items-center border-l-4 border-amber-500 pl-4">
                     <h4 className="text-xs font-black text-amber-700 uppercase tracking-widest">Referencias Personales</h4>
                     <button type="button" onClick={handleAddReference} className="p-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-100 transition-all flex items-center gap-1">
                       <Plus size={16} /> <span className="text-[8px] font-black uppercase">Añadir</span>
                     </button>
                  </div>
                  <div className="space-y-4">
                     {newMember.references?.map((ref, i) => (
                       <div key={i} className="p-5 bg-slate-50 rounded-2xl border border-slate-250 space-y-3 relative group shadow-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Referencia #{i + 1}</span>
                            {newMember.references!.length > 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const refs = newMember.references!.filter((_, idx) => idx !== i);
                                  setNewMember({...newMember, references: refs});
                                }}
                                className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Nombre Completo</label>
                              <input required placeholder="Nombres y Apellidos" value={ref.name} onChange={e => {
                                const refs = [...(newMember.references || [])];
                                refs[i].name = e.target.value.toUpperCase();
                                setNewMember({...newMember, references: refs});
                              }} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase text-[#14532D] focus:border-[#14532D] outline-none" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Teléfono de Contacto</label>
                              <input required placeholder="09XXXXXXXX" value={ref.phone} onChange={e => {
                                const refs = [...(newMember.references || [])];
                                refs[i].phone = e.target.value.replace(/\D/g, '');
                                setNewMember({...newMember, references: refs});
                              }} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-[#14532D] focus:border-[#14532D] outline-none" />
                            </div>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
               
               <div className="space-y-6">
                    <div className="flex justify-between items-center border-l-4 border-purple-500 pl-4">
                       <h4 className="text-xs font-black text-purple-700 uppercase tracking-widest">Cargas Familiares</h4>
                       <button type="button" onClick={handleAddDependent} className="p-2 bg-purple-50 text-purple-600 rounded-xl hover:bg-purple-100 transition-all"><Plus size={18} /></button>
                    </div>
                    <div className="space-y-6">
                       {newMember.dependents?.map((dep, i) => (
                         <div key={i} className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4 relative group shadow-sm">
                            <button 
                              type="button" 
                              onClick={() => {
                                const deps = (newMember.dependents || []).filter((_, idx) => idx !== i);
                                setNewMember({...newMember, dependents: deps});
                              }} 
                              className="absolute top-4 right-4 p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 size={16} />
                            </button>

                            <div className="flex items-center gap-2 mb-2">
                              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                              <span className="text-[10px] font-black text-purple-700 uppercase tracking-widest">Carga Familiar #{i + 1}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Primer Nombre</label>
                                <input 
                                  required 
                                  type="text" 
                                  placeholder="PRIMER NOMBRE"
                                  value={dep.firstName || ''} 
                                  onChange={e => {
                                    const deps = [...(newMember.dependents || [])];
                                    deps[i] = { ...deps[i], firstName: e.target.value.toUpperCase() };
                                    deps[i].name = computeDependentFullName(deps[i]);
                                    setNewMember({...newMember, dependents: deps});
                                  }} 
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase text-[#14532D] focus:border-[#14532D] outline-none" 
                                />
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Segundo Nombre</label>
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      checked={!!dep.onlyOneName} 
                                      onChange={e => {
                                        const deps = [...(newMember.dependents || [])];
                                        deps[i] = { 
                                          ...deps[i], 
                                          onlyOneName: e.target.checked,
                                          middleName: e.target.checked ? '' : (deps[i].middleName || '') 
                                        };
                                        deps[i].name = computeDependentFullName(deps[i]);
                                        setNewMember({...newMember, dependents: deps});
                                      }} 
                                      className="rounded text-[#14532D] focus:ring-[#14532D] w-3 h-3" 
                                    />
                                    Un solo nombre
                                  </label>
                                </div>
                                <input 
                                  disabled={dep.onlyOneName}
                                  required={!dep.onlyOneName}
                                  type="text" 
                                  placeholder="SEGUNDO NOMBRE"
                                  value={dep.onlyOneName ? '' : (dep.middleName || '')} 
                                  onChange={e => {
                                    const deps = [...(newMember.dependents || [])];
                                    deps[i] = { ...deps[i], middleName: e.target.value.toUpperCase() };
                                    deps[i].name = computeDependentFullName(deps[i]);
                                    setNewMember({...newMember, dependents: deps});
                                  }} 
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase text-[#14532D] focus:border-[#14532D] outline-none disabled:opacity-50 disabled:bg-slate-100" 
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Primer Apellido</label>
                                <input 
                                  required 
                                  type="text" 
                                  placeholder="PRIMER APELLIDO"
                                  value={dep.firstLastName || ''} 
                                  onChange={e => {
                                    const deps = [...(newMember.dependents || [])];
                                    deps[i] = { ...deps[i], firstLastName: e.target.value.toUpperCase() };
                                    deps[i].name = computeDependentFullName(deps[i]);
                                    setNewMember({...newMember, dependents: deps});
                                  }} 
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase text-[#14532D] focus:border-[#14532D] outline-none" 
                                />
                              </div>

                              <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Segundo Apellido</label>
                                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 cursor-pointer">
                                    <input 
                                      type="checkbox" 
                                      checked={!!dep.onlyOneLastName} 
                                      onChange={e => {
                                        const deps = [...(newMember.dependents || [])];
                                        deps[i] = { 
                                          ...deps[i], 
                                          onlyOneLastName: e.target.checked,
                                          secondLastName: e.target.checked ? '' : (deps[i].secondLastName || '') 
                                        };
                                        deps[i].name = computeDependentFullName(deps[i]);
                                        setNewMember({...newMember, dependents: deps});
                                      }} 
                                      className="rounded text-[#14532D] focus:ring-[#14532D] w-3 h-3" 
                                    />
                                    Un solo apellido
                                  </label>
                                </div>
                                <input 
                                  disabled={dep.onlyOneLastName}
                                  required={!dep.onlyOneLastName}
                                  type="text" 
                                  placeholder="SEGUNDO APELLIDO"
                                  value={dep.onlyOneLastName ? '' : (dep.secondLastName || '')} 
                                  onChange={e => {
                                    const deps = [...(newMember.dependents || [])];
                                    deps[i] = { ...deps[i], secondLastName: e.target.value.toUpperCase() };
                                    deps[i].name = computeDependentFullName(deps[i]);
                                    setNewMember({...newMember, dependents: deps});
                                  }} 
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs uppercase text-[#14532D] focus:border-[#14532D] outline-none disabled:opacity-50 disabled:bg-slate-100" 
                                />
                              </div>

                              <div className="space-y-1 md:col-span-2">
                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Parentesco</label>
                                <select 
                                  value={dep.relationship || 'HIJO/A'} 
                                  onChange={e => {
                                    const deps = [...(newMember.dependents || [])];
                                    deps[i] = { ...deps[i], relationship: e.target.value };
                                    setNewMember({...newMember, dependents: deps});
                                  }} 
                                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-[#14532D] focus:border-[#14532D] outline-none"
                                >
                                  <option value="HIJO/A">HIJO/A</option>
                                  <option value="CÓNYUGE">CÓNYUGE</option>
                                  <option value="PADRE/MADRE">PADRE/MADRE</option>
                                  <option value="HERMANO/A">HERMANO/A</option>
                                  <option value="OTRO">OTRO</option>
                                </select>
                              </div>
                            </div>
                         </div>
                       ))}
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleCloseForm}
                className="flex-1 py-7 bg-slate-200 text-slate-600 rounded-full font-black text-xl shadow-lg border-b-[6px] border-slate-300 active:translate-y-2 transition-all uppercase tracking-tighter hover:bg-slate-300"
              >
                CERRAR
              </button>
              <button
                type="submit"
                disabled={!isFormValid || isSaving}
                className="flex-1 py-7 bg-[#14532D] text-white rounded-full font-black text-xl shadow-2xl border-b-[6px] border-[#FACC15] active:translate-y-2 transition-all uppercase tracking-tighter disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    GUARDANDO...
                  </>
                ) : (
                  'REGISTRO DE SOCIO'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'CONSULTAS' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500 font-sans">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center shadow-lg flex-shrink-0">
                <Users2 size={32} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Directorio de Socios</h3>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Registros de Clientes y Fichas SQL Server SQLGUTPATATE</p>
              </div>
            </div>
            <div className="relative w-full md:w-96">
              <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={generalFilter} 
                onChange={e => setGeneralFilter(e.target.value)} 
                placeholder="Nombre o Cédula..." 
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-[#14532D] focus:border-[#14532D] focus:bg-white transition-all shadow-sm" 
              />
            </div>
          </div>
           
           {loadingConsultas ? (
             <div className="flex items-center justify-center py-20">
               <Loader2 size={32} className="animate-spin text-[#14532D]" />
               <span className="ml-4 text-[10px] font-black text-slate-400 uppercase">Cargando datos de SQL Server...</span>
             </div>
           ) : (
             <div className="overflow-x-auto rounded-[2rem] border border-slate-100 shadow-sm">
               <table className="w-full text-sm">
                 <thead className="bg-slate-50/80 border-b border-slate-100">
                   <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                     <th className="px-8 py-5 text-left">Nro Socio</th>
                     <th className="px-8 py-5 text-left">Tipo</th>
                     <th className="px-8 py-5 text-left">Identificación</th>
                     <th className="px-8 py-5 text-left">Nombres Completos</th>
                     <th className="px-8 py-5 text-left">Fecha Registro</th>
                     <th className="px-8 py-5 text-center">Mapa</th>
                     <th className="px-8 py-5 text-center">Croquis</th>
                     <th className="px-8 py-5 text-center">Estado</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 bg-white">
                   {sociosConsultas
                     .filter(s => 
                       s.NombreCompleto?.toLowerCase().includes(generalFilter.toLowerCase()) ||
                       s.Identificacion?.includes(generalFilter)
                     )
                     .map(s => (
                     <tr key={s.SOCIOID} className="hover:bg-slate-50/50 transition-colors group">
                       <td className="px-8 py-5">
                         <span className="font-mono font-black text-[#14532D] bg-emerald-50 border border-emerald-100/30 px-3 py-1.5 rounded-xl text-xs">
                           {s.NumeroSocio || 'S/N'}
                         </span>
                       </td>
                       <td className="px-8 py-5">
                         <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                           s.TipoPersona === 'SOCIO' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                           s.TipoPersona === 'CLIENTE' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
                           'bg-purple-50 text-purple-700 border-purple-100'
                         }`}>
                           {s.TipoPersona.replace('_', ' ')}
                         </span>
                       </td>
                       <td className="px-8 py-5 font-bold text-slate-800 text-xs tracking-tight">{s.Identificacion}</td>
                       <td className="px-8 py-5 font-bold text-slate-800 uppercase text-xs tracking-tight">{s.NombreCompleto}</td>
                       <td className="px-8 py-5 text-[10px] font-black text-slate-400">
                         {s.FechaRegistro ? new Date(s.FechaRegistro).toLocaleDateString('es-EC') : 'N/A'}
                       </td>
                       <td className="px-8 py-5 text-center">
                         {s.TieneMapaUbicacion ? (
                           <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100/50">
                             <CheckCircle2 size={12} /> Ubicado
                           </span>
                         ) : (
                           <span className="text-slate-300 font-bold text-xs">—</span>
                         )}
                       </td>
                       <td className="px-8 py-5 text-center">
                         {s.TieneCroquisTrabajo ? (
                           <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#14532D] uppercase bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100/50">
                             <CheckCircle2 size={12} /> Croquis
                           </span>
                         ) : (
                           <span className="text-slate-300 font-bold text-xs">—</span>
                         )}
                       </td>
                       <td className="px-8 py-5 text-center">
                         <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                           s.Estado === 'ACTIVO' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
                         }`}>
                           {s.Estado}
                         </span>
                       </td>
                     </tr>
                   ))}
                   {sociosConsultas.filter(s => 
                     s.NombreCompleto?.toLowerCase().includes(generalFilter.toLowerCase()) ||
                     s.Identificacion?.includes(generalFilter)
                   ).length === 0 && (
                     <tr>
                       <td colSpan={8} className="px-8 py-20 text-center">
                         <div className="flex flex-col items-center gap-4">
                           <Search size={48} className="text-slate-200 animate-pulse" />
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No se encontraron registros</p>
                         </div>
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
           )}
        </div>
      )}

      {activeTab === 'CASH_CLOSE' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500 font-sans">
          <div className="flex items-center gap-6 mb-10">
            <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center shadow-lg">
              <Calculator size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Cierre de Caja</h3>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Arqueo de efectivo y consolidación de operaciones</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Lado Izquierdo: Desglose Físico */}
            <div className="space-y-6">
              <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100">
                <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Banknote size={16} /> Detalle de Billetes en Gaveta
                </h4>
                <div className="grid grid-cols-3 gap-4">
                  {cashDetail.bills.map((bill, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase block text-center">${bill.denomination}</label>
                      <input
                        type="number"
                        min="0"
                        value={bill.count === 0 ? '' : bill.count}
                        onChange={e => updateCashDetail('bills', i, parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-black text-center text-[#14532D] focus:border-[#14532D] outline-none"
                      />
                      <p className="text-[10px] font-bold text-center text-slate-400">${bill.total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100">
                <h4 className="text-sm font-black text-[#14532D] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <DollarSign size={16} /> Detalle de Monedas en Gaveta
                </h4>
                <div className="grid grid-cols-5 gap-3">
                  {cashDetail.coins.map((coin, i) => (
                    <div key={i} className="bg-white p-3 rounded-xl border border-slate-100 space-y-2">
                      <label className="text-[9px] font-black text-slate-500 uppercase block text-center">${coin.denomination.toFixed(2)}</label>
                      <input
                        type="number"
                        min="0"
                        value={coin.count === 0 ? '' : coin.count}
                        onChange={e => updateCashDetail('coins', i, parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-1 py-2 bg-slate-50 border border-slate-200 rounded-lg font-black text-center text-[#14532D] focus:border-[#14532D] outline-none text-xs"
                      />
                      <p className="text-[9px] font-bold text-center text-slate-400">${coin.total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Lado Derecho: Resúmenes y Reportes */}
            <div className="space-y-8">
              {/* Resumen Diario por Papeletas */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest border-b pb-3 flex items-center gap-2">
                  <FileText size={18} className="text-[#14532D]" /> Resumen Diario por Papeletas
                </h4>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b">
                        <th className="py-2 text-left">Tipo de Documento / Papeleta</th>
                        <th className="py-2 text-center">Cantidad</th>
                        <th className="py-2 text-right font-black">Monto Procesado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      <tr>
                        <td className="py-3 text-slate-800 font-black">PAPELETAS DE DEPÓSITO</td>
                        <td className="py-3 text-center">{totals.depositsCount}</td>
                        <td className="py-3 text-right text-emerald-600 font-black">${totals.deposits.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-800 font-black">PAPELETAS DE RETIRO</td>
                        <td className="py-3 text-center">{totals.withdrawalsCount}</td>
                        <td className="py-3 text-right text-red-600 font-black">${totals.withdrawals.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-800 font-black">NOTAS DE CRÉDITO</td>
                        <td className="py-3 text-center">{totals.creditNotesCount}</td>
                        <td className="py-3 text-right text-emerald-600">${totals.creditNotes.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-800 font-black">NOTAS DE DÉBITO</td>
                        <td className="py-3 text-center">{totals.debitNotesCount}</td>
                        <td className="py-3 text-right text-red-600">${totals.debitNotes.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-slate-800 font-black">TRANSFERENCIAS INTERBANCARIAS</td>
                        <td className="py-3 text-center">{totals.transfersCount}</td>
                        <td className="py-3 text-right text-slate-500">${totals.transfers.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Resumen de Movimiento de Caja (Comparación Contable vs Físico) */}
              <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200/60 space-y-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-3 flex items-center gap-2">
                  <ArrowRightLeft size={18} className="text-[#14532D]" /> Resumen de Movimiento de Caja
                </h4>

                <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-600">
                  <div className="space-y-1">
                    <span>Saldo de Apertura:</span>
                    <p className="text-sm font-black text-[#14532D]">${openingBalance.toFixed(2)}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <span>Usuario Cajero:</span>
                    <p className="text-sm font-black text-[#14532D]">{currentUser?.name || 'Cajero Matriz'} ({currentUser?.id})</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Saldo Contable Esperado</span>
                    <span className="text-xl font-black text-slate-800 block mt-1">${totals.expected.toFixed(2)}</span>
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Saldo Físico Contado</span>
                    <span className="text-xl font-black text-[#14532D] block mt-1">${cashDetail.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Cálculo de diferencia y alerta */}
                {(() => {
                  const difference = cashDetail.total - totals.expected;
                  const absDiff = Math.abs(difference);
                  
                  if (Math.abs(difference) < 0.009) {
                    return (
                      <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200 flex items-start gap-3 text-xs font-bold">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-black text-emerald-950 uppercase tracking-wide">Caja Cuadrada (OK)</p>
                          <p className="mt-1 text-emerald-700/90 font-normal leading-relaxed">
                            El arqueo físico coincide perfectamente con la contabilidad del sistema. No se registran descuadres.
                          </p>
                        </div>
                      </div>
                    );
                  } else if (difference > 0) {
                    return (
                      <div className="p-4 bg-amber-50 text-amber-800 rounded-2xl border border-amber-200 flex items-start gap-3 text-xs font-bold">
                        <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-black text-amber-950 uppercase tracking-wide">Caja con Sobrante</p>
                          <p className="mt-1 text-xl font-black text-amber-600">+${absDiff.toFixed(2)}</p>
                          <p className="mt-1 text-amber-700/90 font-normal leading-relaxed">
                            Existe un excedente de dinero físico en caja en comparación con el saldo esperado. Reporte este sobrante.
                          </p>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div className="p-4 bg-red-50 text-red-800 rounded-2xl border border-red-200 flex items-start gap-3 text-xs font-bold">
                        <Info size={18} className="text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-black text-red-950 uppercase tracking-wide">Caja con Faltante</p>
                          <p className="mt-1 text-xl font-black text-red-600">-${absDiff.toFixed(2)}</p>
                          <p className="mt-1 text-red-700/90 font-normal leading-relaxed">
                            Existe un faltante de efectivo en caja. El cajero es responsable de reponer la diferencia antes de confirmar el cierre.
                          </p>
                        </div>
                      </div>
                    );
                  }
                })()}

                <button
                  type="button"
                  onClick={handleConfirmClose}
                  className="w-full py-6 bg-[#14532D] text-white rounded-2xl font-black text-xl shadow-2xl border-b-[4px] border-[#FACC15] active:translate-y-1 transition-all uppercase tracking-tighter flex items-center justify-center gap-3 hover:bg-emerald-800"
                >
                  <Printer size={22} /> CONFIRMAR Y CERRAR JORNADA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'TX_SEARCH' && (
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 animate-in fade-in duration-500 font-sans space-y-8">
          <div className="flex items-center gap-6 mb-2">
            <div className="w-16 h-16 bg-[#14532D] text-[#FACC15] rounded-[2rem] flex items-center justify-center shadow-lg">
              <FileText size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase leading-none">Consulta Transacciones</h3>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Búsqueda histórica de transacciones y reimpresión de recibos</p>
            </div>
          </div>

          {/* Buscador de socio */}
          <div className="max-w-md bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block mb-2">Buscar Socio</label>
            <form onSubmit={e => { e.preventDefault(); handleTxSearch(); }} className="flex gap-2">
              <input
                type="text"
                value={txSearchInput}
                onChange={e => setTxSearchInput(e.target.value)}
                placeholder="ID o Cédula..."
                className="flex-1 px-6 py-4 bg-white border-none rounded-2xl outline-none font-black text-[#14532D] shadow-inner text-sm"
              />
              <button
                type="submit"
                disabled={txIsSearching}
                className="p-4 bg-[#14532D] text-white rounded-2xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
              >
                {txIsSearching ? <Search size={20} className="animate-spin" /> : <Search size={20} />}
              </button>
            </form>
          </div>

          {/* Detalle del Socio y cuentas */}
          {txSearchSocio ? (
            <div className="space-y-8 animate-in slide-in-from-top-4 duration-300">
              {/* Información del Socio */}
              <div className="bg-[#14532D] p-8 rounded-[2.5rem] text-white shadow-xl border-b-[8px] border-[#FACC15] grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300 mb-1">Cédula / Identificación</p>
                  <p className="text-lg font-black">{txSearchSocio.id}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300 mb-1">Nombres Completos</p>
                  <p className="text-xl font-black uppercase">{txSearchSocio.name}</p>
                </div>
              </div>

              {/* Información de la Cuenta y sus transacciones */}
              <div className="space-y-6">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider pl-1">Cuentas y Transacciones</h4>
                
                {txSearchSocio.accounts && txSearchSocio.accounts.length > 0 ? (
                  txSearchSocio.accounts.map(acc => {
                    // Filtrar transacciones para esta cuenta
                    const accTxs = (txSearchSocio.transactions || []).filter(
                      tx => tx.accountId === acc.id || tx.reference === acc.number
                    );

                    return (
                      <div key={acc.id} className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                        {/* Cabecera de la Cuenta */}
                        <div className="bg-slate-50 px-8 py-5 border-b flex justify-between items-center flex-wrap gap-4">
                          <div>
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full uppercase tracking-wider">
                              {acc.type.replace('_', ' ')}
                            </span>
                            <span className="ml-3 font-bold text-slate-700 text-sm">#{acc.number}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black text-slate-400 uppercase block tracking-wider">Saldo</span>
                            <span className="text-lg font-black text-[#14532D]">${acc.balance.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Listado de transacciones de la cuenta */}
                        <div className="p-6">
                          {accTxs.length === 0 ? (
                            <p className="text-xs font-bold text-slate-400 italic text-center py-6">No hay transacciones registradas para esta cuenta.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm animate-in fade-in duration-300">
                                <thead>
                                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b text-left">
                                    <th className="pb-3 pl-4">ID Transacción</th>
                                    <th className="pb-3">Fecha</th>
                                    <th className="pb-3">Descripción</th>
                                    <th className="pb-3 text-right">Monto</th>
                                    <th className="pb-3 text-center pr-4">Acción</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {accTxs.map(tx => {
                                    const isCredit = tx.amount > 0;
                                    return (
                                      <tr key={tx.id} className="hover:bg-slate-50/50">
                                        <td className="py-4 pl-4 font-mono text-xs font-bold text-slate-600">{tx.id}</td>
                                        <td className="py-4 text-xs font-bold text-slate-500">{tx.date}</td>
                                        <td className="py-4 text-xs font-bold text-slate-700">{tx.description}</td>
                                        <td className={`py-4 text-right font-black ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                                          {isCredit ? '+' : ''}${Math.abs(tx.amount).toFixed(2)}
                                        </td>
                                        <td className="py-4 text-center pr-4">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedReceiptTx(tx);
                                              setSelectedReceiptUser(txSearchSocio);
                                              setShowReceiptModal(true);
                                            }}
                                            className="p-2 bg-slate-100 hover:bg-[#14532D] hover:text-white rounded-lg transition-all text-[#14532D]"
                                            title="Reimprimir Recibo"
                                          >
                                            <Printer size={14} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs font-bold text-slate-400 italic">El socio no tiene cuentas registradas.</p>
                )}
              </div>
            </div>
          ) : (
            txSearchInput && !txIsSearching && (
              <div className="py-12 text-center text-slate-400 font-bold text-xs">
                Realice una búsqueda para cargar la ficha del socio.
              </div>
            )
          )}
        </div>
      )}
        </div>
      </div>
        </>
      )}

      {registrationSuccessModal && registrationSuccessModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[3rem] p-10 max-w-lg w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-2xl font-black text-[#14532D] tracking-tight uppercase">Socio Registrado con Éxito</h3>
              <p className="text-sm font-bold text-slate-500 max-w-sm leading-relaxed">
                Por favor, valide los datos del socio para continuar con la apertura de su cuenta y primer depósito:
              </p>
            </div>

            <div className="mt-8 space-y-4 bg-slate-50 p-6 rounded-[2rem] border border-slate-100 font-sans">
              <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Número de Socio</span>
                <span className="text-sm font-black text-[#14532D]">{registrationSuccessModal.numeroSocio}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Identificación / Cédula</span>
                <span className="text-sm font-black text-slate-800">{registrationSuccessModal.cedula}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-200/50">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nombres Completos</span>
                <span className="text-sm font-black text-slate-800 uppercase">{registrationSuccessModal.name}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Correo Electrónico</span>
                <span className="text-sm font-black text-slate-800">{registrationSuccessModal.email || 'N/A'}</span>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => {
                  const { userObj } = registrationSuccessModal;
                  setRegistrationSuccessModal(null);
                  resetForm();
                  if (userObj) {
                    setSelectedUser(userObj);
                    
                    // Auto-seleccionar cuenta preferida: Certificados primero si existe, si no Ahorros
                    const certAcc = userObj.accounts?.find((a: any) => a.type === 'CERTIFICADO_APORTACION');
                    const firstAcc = certAcc || userObj.accounts?.[0];
                    setSelectedAccountId(firstAcc?.id || '');
                    
                    setSearch(userObj.id);
                    setOpType('DEPOSIT');
                    setActiveTab('OPERATIONS');
                  }
                }}
                className="w-full py-4 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg active:scale-[0.98] transition-all"
              >
                Aceptar y Proceder al Primer Depósito
              </button>
            </div>
          </div>
        </div>
      )}

      {emailVerifyModal && emailVerifyModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[90] p-4">
          <div className="bg-white rounded-[3rem] p-10 max-w-md w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center shadow-inner">
                <Mail size={32} />
              </div>
              <h3 className="text-2xl font-black text-[#14532D] tracking-tight uppercase">Confirmación de Correo</h3>
              <p className="text-sm font-bold text-slate-500 leading-relaxed">
                Se ha enviado un código de activación de 6 dígitos al correo electrónico del socio:
              </p>
              <p className="text-sm font-black text-slate-800 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                {emailVerifyModal.email}
              </p>
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 w-full">
                <span className="text-[10px] font-black text-emerald-800 tracking-wider block uppercase">Caja Demo - Código de Activación Generado</span>
                <span className="text-2xl font-black text-emerald-600 block mt-1 tracking-widest">{emailVerifyModal.expectedCode}</span>
              </div>
            </div>

            <form onSubmit={handleVerifyEmail} className="mt-8 space-y-4 font-sans">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Ingrese el Código de 6 dígitos</label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  value={verificationInput}
                  onChange={e => setVerificationInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-[#14532D] outline-none font-black text-[#14532D] text-center text-2xl tracking-[0.3em] shadow-inner"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleSkipVerify}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-colors"
                >
                  Omitir
                </button>
                <button
                  type="submit"
                  className="flex-1 py-4 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-colors"
                >
                  Confirmar Código
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDocUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[90] p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 font-sans">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b p-6 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none">Cédula por Excepción Legal</h4>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                    Carga obligatoria de ambas caras del documento de identidad
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  if (!imgFrontalBase64 || !imgPosteriorBase64) {
                    setIdConExcepcion(false);
                    setImgFrontalBase64('');
                    setImgPosteriorBase64('');
                  }
                  setShowDocUploadModal(false);
                }} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 space-y-6">
              <p className="text-xs font-bold text-slate-500 leading-relaxed">
                Según la normativa, para registrar un socio con una cédula que no supera la validación estándar, debe adjuntar una captura legible de ambas caras del documento físico original.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Cara Frontal */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">CARA FRONTAL</label>
                  {imgFrontalBase64 ? (
                    <div className="relative h-48 rounded-2xl overflow-hidden border-2 border-blue-500 shadow-md group">
                      <img src={imgFrontalBase64} alt="Cédula Frontal" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setImgFrontalBase64('')}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="h-48 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-blue-50/20">
                      <Plus size={24} className="text-slate-400 mb-1" />
                      <span className="text-[9px] font-black uppercase text-slate-500">Subir Cara Frontal</span>
                      <span className="text-[8px] text-slate-400 mt-1">Haga clic para seleccionar</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImgFrontalBase64(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }} 
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>

                {/* Cara Posterior */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">CARA POSTERIOR</label>
                  {imgPosteriorBase64 ? (
                    <div className="relative h-48 rounded-2xl overflow-hidden border-2 border-blue-500 shadow-md group">
                      <img src={imgPosteriorBase64} alt="Cédula Posterior" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setImgPosteriorBase64('')}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <label className="h-48 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors bg-slate-50 hover:bg-blue-50/20">
                      <Plus size={24} className="text-slate-400 mb-1" />
                      <span className="text-[9px] font-black uppercase text-slate-500">Subir Cara Posterior</span>
                      <span className="text-[8px] text-slate-400 mt-1">Haga clic para seleccionar</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setImgPosteriorBase64(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }} 
                        className="hidden" 
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 bg-slate-50 border-t flex gap-4">
              <button
                type="button"
                onClick={() => {
                  setIdConExcepcion(false);
                  setImgFrontalBase64('');
                  setImgPosteriorBase64('');
                  setShowDocUploadModal(false);
                }}
                className="flex-1 py-3 bg-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!imgFrontalBase64 || !imgPosteriorBase64}
                onClick={() => {
                  setShowDocUploadModal(false);
                }}
                className="flex-1 py-3 bg-[#14532D] text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-emerald-800 transition-colors"
              >
                Aceptar y Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {alertConfig && alertConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner ${
                alertConfig.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                alertConfig.type === 'error' ? 'bg-red-50 text-red-600' :
                alertConfig.type === 'warning' ? 'bg-amber-50 text-amber-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {alertConfig.type === 'success' ? <CheckCircle2 size={32} /> :
                 alertConfig.type === 'error' ? <X size={32} /> :
                 alertConfig.type === 'warning' ? <Info size={32} /> :
                 <Info size={32} />}
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{alertConfig.title}</h3>
              <p className="text-sm font-bold text-slate-500 leading-relaxed whitespace-pre-line">{alertConfig.message}</p>
            </div>
            <div className="flex gap-4 mt-8">
              {alertConfig.isConfirm ? (
                <>
                  <button onClick={() => alertConfig.onCancel?.()} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                    Cancelar
                  </button>
                  <button onClick={() => alertConfig.onConfirm()} className="flex-1 py-4 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                    Aceptar
                  </button>
                </>
              ) : (
                <button onClick={() => alertConfig.onConfirm()} className="w-full py-4 bg-[#14532D] hover:bg-emerald-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
                  Aceptar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
