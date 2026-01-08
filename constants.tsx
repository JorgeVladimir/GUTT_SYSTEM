
import React from 'react';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  PiggyBank, 
  CreditCard, 
  ShieldCheck, 
  Briefcase,
  TrendingUp,
  FileCheck,
  FileBarChart
} from 'lucide-react';
import { UserRole, GlobalConfig } from './types';

export const COLORS = {
  primary: '#14532D', 
  secondary: '#FACC15',
  background: '#F8FAFC',
  text: '#1E293B'
};

export const SEPS_CATALOGS = {
  PROVINCES: [
    "AZUAY", "BOLIVAR", "CAÑAR", "CARCHI", "CHIMBORAZO", "COTOPAXI", "EL ORO", "ESMERALDAS", 
    "GALAPAGOS", "GUAYAS", "IMBABURA", "LOJA", "LOS RIOS", "MANABI", "MORONA SANTIAGO", 
    "NAPO", "ORELLANA", "PASTAZA", "PICHINCHA", "SANTA ELENA", "SANTO DOMINGO DE LOS TSÁCHILAS", 
    "SUCUMBIOS", "TUNGURAHUA", "ZAMORA CHINCHIPE"
  ],
  CITIES: {
    "TUNGURAHUA": ["AMBATO", "BAÑOS DE AGUA SANTA", "CEVALLOS", "MOCHA", "PATATE", "PELILEO", "PILLARO", "QUERO", "TISALEO"],
    "PICHINCHA": ["QUITO", "CAYAMBE", "MEJIA", "PEDRO MONCAYO", "PEDRO VICENTE MALDONADO", "PUERTO QUITO", "RUMIÑAHUI", "SAN MIGUEL DE LOS BANCOS"],
    "GUAYAS": ["GUAYAQUIL", "ALFREDO BAQUERIZO MORENO", "BALAO", "BALZAR", "COLIMES", "DAULE", "DURAN", "EL EMPALME", "EL TRIUNFO", "MILAGRO", "SAMBORONDON", "SANTA LUCIA"],
    "NAPO": ["TENA", "ARCHIDONA", "CARLOS JULIO AROSEMENA TOLA", "EL CHACO", "QUIJOS"]
  },
  PARISHES: {
    "PATATE": ["PATATE (CENTRO)", "EL TRIUNFO", "LOS ANDES", "SUCRE"],
    "AMBATO": ["AMBATO (MATRIZ)", "ATOCHA-FICOA", "HUACHI CHICO", "HUACHI LORETO", "LA MERCED", "LA PENINSULA", "PISHILATA", "SAN FRANCISCO", "IZAMBA", "PICAIGUA", "QUISAPINCHA", "TOTORAS"],
    "QUITO": ["ALANGASI", "AMAGUAÑA", "CHILLOGALLO", "COTOCOLLAO", "GUAMANI", "IÑAQUITO", "LA MAGDALENA", "TUMBACO"],
    "TENA": ["TENA (MATRIZ)", "AHUANO", "CHONTAPUNTA", "PANO", "PUERTO MISAHUALLI", "TALAG"]
  },
  INSTRUCTION: [
    "SIN INSTRUCCIÓN", 
    "PRIMARIA / EDUCACIÓN BÁSICA", 
    "SECUNDARIA / BACHILLERATO", 
    "TÉCNICA / TECNOLÓGICA", 
    "SUPERIOR / TERCER NIVEL", 
    "POSGRADO / CUARTO NIVEL (MAESTRÍA)", 
    "PHD / DOCTORADO"
  ],
  OCCUPATIONS: [
    "EMPLEADO PÚBLICO",
    "EMPLEADO PRIVADO",
    "PROFESIONAL INDEPENDIENTE",
    "COMERCIANTE / TRABAJADOR AUTÓNOMO",
    "MICROEMPRESARIO (RÉGIMEN RIMPE)",
    "ARTESANO",
    "AGRICULTOR / GANADERO",
    "ESTUDIANTE",
    "JUBILADO / PENSIONISTA",
    "QUEHACERES DOMÉSTICOS",
    "SIN ACTIVIDAD ECONÓMICA",
    "TRANSPORTISTA",
    "TRABAJADOR NO REMUNERADO",
    "EMPLEADA DOMÉSTICA",
    "MIEMBRO DE LAS FUERZAS ARMADAS",
    "SOCIO EN RELACIÓN DE DEPENDENCIA",
    "TRABAJADOR POR CUENTA PROPIA"
  ],
  COUNTRIES: ["ECUADOR", "ESTADOS UNIDOS", "ESPAÑA", "COLOMBIA", "PERÚ", "ITALIA", "OTROS"]
};

export const NAV_BY_ROLE: Record<string, any[]> = {
  MEMBER: [
    { id: 'DASHBOARD', label: 'Resumen Patate', icon: <LayoutDashboard size={20} /> },
    { id: 'TRANSFERS', label: 'Transferencias', icon: <ArrowRightLeft size={20} /> },
    { id: 'CREDITS', label: 'Créditos y Simulador', icon: <TrendingUp size={20} /> },
  ],
  ADMIN: [
    { id: 'ADMIN_HUB', label: 'Panel Administrativo', icon: <ShieldCheck size={20} /> },
    { id: 'REPORTS', label: 'Reportes y SEPS', icon: <FileBarChart size={20} /> },
    { id: 'DASHBOARD', label: 'Panel Socios', icon: <LayoutDashboard size={20} /> },
    { id: 'TELLER_OPERATIONS', label: 'Caja y Ventanilla', icon: <CreditCard size={20} /> },
    { id: 'CHART_OF_ACCOUNTS', label: 'Contabilidad Central', icon: <Briefcase size={20} /> },
    { id: 'CREDIT_OFFICER_HUB', label: 'Aprobación de Créditos', icon: <FileCheck size={20} /> },
  ],
  TELLER: [
    { id: 'TELLER_OPERATIONS', label: 'Caja y Ventanilla', icon: <CreditCard size={20} /> },
  ],
  ACCOUNTANT: [
    { id: 'CHART_OF_ACCOUNTS', label: 'Plan Contable', icon: <Briefcase size={20} /> },
    { id: 'REPORTS', label: 'Reportes Financieros', icon: <FileBarChart size={20} /> },
  ],
  CREDIT_OFFICER: [
    { id: 'CREDIT_OFFICER_HUB', label: 'Aprobación de Créditos', icon: <FileCheck size={20} /> },
    { id: 'REPORTS', label: 'Reportes de Riesgo', icon: <FileBarChart size={20} /> },
  ]
};

export const INITIAL_RATES = [
  { id: 'R1', category: 'Consumo Ordinario', rate: 16.06, maxTerm: 48 },
  { id: 'R2', category: 'Microcrédito Minorista', rate: 28.23, maxTerm: 24 },
  { id: 'R3', category: 'Inversión Inmobiliaria', rate: 9.50, maxTerm: 72 },
  { id: 'R4', category: 'Emergente/Salud', rate: 12.00, maxTerm: 12 },
];

export const DEFAULT_CONFIG: GlobalConfig = {
  minLoanAmount: 100,
  maxLoanAmount: 100000,
  maxGlobalTerm: 72
};
