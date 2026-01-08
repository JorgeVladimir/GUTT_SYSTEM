
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  TELLER = 'TELLER',
  MEMBER = 'MEMBER',
  CREDIT_OFFICER = 'CREDIT_OFFICER'
}

export enum AccountType {
  SAVINGS = 'AHORRO_VISTA',
  CERTIFICATE = 'CERTIFICADO_APORTACION',
  LOAN = 'PRESTAMO'
}

export interface InterestRate {
  id: string;
  category: string;
  rate: number; 
  maxTerm: number;
}

export interface GlobalConfig {
  minLoanAmount: number;
  maxLoanAmount: number;
  maxGlobalTerm: number;
}

export interface LoanInstallment {
  number: number;
  date: string;
  capital: number;
  interest: number;
  total: number;
  status: 'PENDIENTE' | 'PAGADO';
}

export interface Loan {
  id: string;
  memberId: string;
  memberName: string;
  amount: number;
  balance: number;
  rate: number;
  installmentsCount: number;
  installments: LoanInstallment[];
  status: 'VIGENTE' | 'VENCIDO' | 'PAGADO' | 'SOLICITADO' | 'RECHAZADO';
  type: string;
  startDate: string;
  dueDate: string;
  comments?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category: string;
  accountId: string;
  reference?: string;
  isCash?: boolean;
  tellerId?: string;
}

export interface User {
  id: string; 
  name: string;
  pin: string;
  role: UserRole;
  accounts: Account[];
  transactions: Transaction[];
  loans: Loan[];
  registrationDate?: string;
  needsPinChange?: boolean;
  email?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  profession?: string;
  // Campos técnicos Imagen 2
  memberNumber?: string;
  office?: string;
  residenceType?: 'LOCAL' | 'NACIONAL' | 'EXTERIOR';
  nationality?: string;
  province?: string;
  city?: string;
  parish?: string;
  addressReference?: string;
  instructionLevel?: string;
  civilStatus?: string;
  gender?: string;
  isPeps?: boolean;
  hasFingerprint?: boolean;
  workAddress?: string;
  workProvince?: string;
  workCity?: string;
  workSector?: string;
  dependency?: string;
  familyCharges?: number;
  disability?: boolean;
}

export interface Account {
  id: string;
  type: AccountType;
  number: string;
  balance: number;
  currency: string;
}

export enum AppView {
  LOGIN = 'LOGIN',
  REGISTER = 'REGISTER',
  DASHBOARD = 'DASHBOARD',
  TRANSFERS = 'TRANSFERS',
  SAVINGS = 'SAVINGS',
  CREDITS = 'CREDITS',
  TELLER_OPERATIONS = 'TELLER_OPERATIONS',
  CHART_OF_ACCOUNTS = 'CHART_OF_ACCOUNTS',
  ADMIN_HUB = 'ADMIN_HUB',
  // Fix: Renamed CREDIT_OFF_HUB to CREDIT_OFFICER_HUB to fix errors in App.tsx and match usage
  CREDIT_OFFICER_HUB = 'CREDIT_OFFICER_HUB',
  REPORTS = 'REPORTS',
  CHANGE_PIN = 'CHANGE_PIN'
}

export interface ChartOfAccountEntry {
  code: string;
  name: string;
  level: number;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balance: number;
}
