
export enum UserRole {
  SUPER_USER = 'SUPER_USER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  TELLER = 'TELLER',
  MEMBER = 'MEMBER',
  CREDIT_OFFICER = 'CREDIT_OFFICER',
  CARTERA = 'CARTERA'
}

export enum AccountType {
  SAVINGS = 'AHORRO_VISTA',
  CERTIFICATE = 'CERTIFICADO_APORTACION',
  LOAN = 'PRESTAMO'
}

export type CreditRating = 'EXCELENTE' | 'BUENO' | 'REGULAR' | 'MALO' | 'NEGADO';

export interface CreditBureauProfile {
  score: number; // 0 - 1000
  rating: CreditRating;
  lastUpdate: string;
  totalLoans: number;
  delinquencyDays: number;
}

export interface FixedAsset {
  id: string;
  name: string;
  category: string;
  purchaseDate: string;
  value: number;
  depreciation: number;
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
  status: 'VIGENTE' | 'VENCIDO' | 'PAGADO' | 'SOLICITADO' | 'RECHAZADO' | 'APROBADO';
  type: string;
  startDate: string;
  dueDate: string;
  comments?: string;
  garantiaInfo?: any;
  origen?: string;
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

export interface PersonalReference {
  name: string;
  phone: string;
  relationship: string;
}

export interface Dependent {
  id: string;
  name: string;
  firstName?: string;
  middleName?: string;
  firstLastName?: string;
  secondLastName?: string;
  onlyOneName?: boolean;
  onlyOneLastName?: boolean;
  relationship: string;
}

export interface User {
  id: string;
  name: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  firstLastName?: string;
  secondLastName?: string;
  onlyOneName?: boolean;
  onlyOneLastName?: boolean;
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
  memberNumber?: string;
  office?: string;
  // Localización actual (Residencia)
  residenceCountry?: string;
  province?: string;
  city?: string;
  parish?: string;
  // Identidad y Nacimiento (S01)
  idType?: string;
  birthCountry?: string;
  birthProvince?: string;
  birthCity?: string;
  birthParish?: string;
  ethnicity?: string;
  gender?: 'MASCULINO' | 'FEMENINO' | 'OTRO';
  maritalStatus?: 'SOLTERO' | 'CASADO' | 'DIVORCIADO' | 'VIUDO' | 'UNIÓN DE HECHO';
  // Datos Cónyuge
  spouseId?: string;
  spouseName?: string;
  spousePhone?: string;
  // Dirección Trabajo
  workAddress?: string;
  workProvince?: string;
  workCity?: string;
  workParish?: string;
  // Complementarios
  dependentsCount?: number;
  dependents?: Dependent[];
  instructionLevel?: string;
  homeCoordinates?: { lat: string; lng: string };
  workCoordinates?: { lat: string; lng: string };
  homeSketch?: string[]; // Array para múltiples imágenes base64
  workSketch?: string; // base64
  references?: PersonalReference[];
  bureau?: CreditBureauProfile;
  personType?: PersonType;
  rutaImagenMapa?: string;
  rutaImagenCroquis?: string;
  // null/undefined = acceso completo por defecto de su Rol. Array = solo esos ids de módulo
  // (ver NAV_BY_ROLE en constants.tsx), asignados desde el panel Admin > Usuarios del Sistema.
  permisosModulos?: string[] | null;
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
  CREDIT_OFFICER_HUB = 'CREDIT_OFFICER_HUB',
  REPORTS = 'REPORTS',
  REPORTS_SOCIOS_CREDITOS = 'REPORTS_SOCIOS_CREDITOS',
  CARTERA_CREDITO = 'CARTERA_CREDITO',
  CARTERA_MENSUAL = 'CARTERA_MENSUAL',
  CARTERA_PLAZO_FIJO = 'CARTERA_PLAZO_FIJO',
  UTILIDAD_RENTABILIDAD = 'UTILIDAD_RENTABILIDAD',
  BI_PANEL = 'BI_PANEL',
  PROFILE = 'PROFILE',
  CHANGE_PIN = 'CHANGE_PIN',
  PLAZO_FIJO = 'PLAZO_FIJO',
  RESET_PASSWORD = 'RESET_PASSWORD'
}

export interface ChartOfAccountEntry {
  code: string;
  name: string;
  level: number;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  balance: number;
}

export interface CashDetail {
  bills: {
    denomination: number;
    count: number;
    total: number;
  }[];
  coins: {
    denomination: number;
    count: number;
    total: number;
  }[];
  total: number;
}

export interface CashClose {
  tellerId: string;
  tellerName: string;
  date: string;
  openingBalance: number;
  closingBalance: number;
  cashDetail: CashDetail;
  transactions: Transaction[];
  discrepancies?: number;
  status: 'OPEN' | 'CLOSED';
}

export type PersonType = 'SOCIO' | 'CLIENTE' | 'CLIENTE_EXTERNO';

export interface InterbankTransfer {
  id: string;
  fromAccount: string;
  toBank: string;
  toAccount: string;
  toAccountName: string;
  amount: number;
  reference: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}
