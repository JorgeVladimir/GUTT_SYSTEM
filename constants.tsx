
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
  FileBarChart,
  BarChart3,
  User as UserIcon
} from 'lucide-react';
import { UserRole, GlobalConfig } from './types';

export const COLORS = {
  primary: '#14532D', 
  secondary: '#FACC15',
  background: '#F8FAFC',
  text: '#1E293B'
};

export const SEPS_CATALOGS = {
  ID_TYPES: ["CÉDULA", "PASAPORTE", "RUC"],
  ETHNICITY: ["MESTIZO", "MONTUBIO", "AFROECUATORIANO", "INDÍGENA", "BLANCO", "OTRO"],
  PROVINCES: [
    "01 - AZUAY", "02 - BOLIVAR", "03 - CAÑAR", "04 - CARCHI", "05 - CHIMBORAZO", "06 - COTOPAXI", "07 - EL ORO", "08 - ESMERALDAS", 
    "09 - GUAYAS", "10 - IMBABURA", "11 - LOJA", "12 - LOS RIOS", "13 - MANABI", "14 - MORONA SANTIAGO", 
    "15 - NAPO", "16 - PASTAZA", "17 - PICHINCHA", "18 - TUNGURAHUA", "19 - ZAMORA CHINCHIPE", "20 - GALAPAGOS", 
    "21 - SUCUMBIOS", "22 - ORELLANA", "23 - SANTO DOMINGO DE LOS TSÁCHILAS", "24 - SANTA ELENA"
  ],
  CITIES: {
    "18 - TUNGURAHUA": ["1801 - AMBATO", "1802 - BAÑOS DE AGUA SANTA", "1803 - CEVALLOS", "1804 - MOCHA", "1805 - PATATE", "1806 - PELILEO", "1807 - PILLARO", "1808 - QUERO", "1809 - TISALEO"],
    "17 - PICHINCHA": ["1701 - QUITO", "1702 - CAYAMBE", "1703 - MEJIA", "1704 - PEDRO MONCAYO", "1705 - PEDRO VICENTE MALDONADO", "1706 - PUERTO QUITO", "1707 - RUMIÑAHUI", "1708 - SAN MIGUEL DE LOS BANCOS"],
    "09 - GUAYAS": ["0901 - GUAYAQUIL", "0902 - ALFREDO BAQUERIZO MORENO", "0903 - BALAO", "0904 - BALZAR", "0905 - COLIMES", "0906 - DAULE", "0907 - DURAN", "0908 - EL EMPALME", "0909 - EL TRIUNFO", "0910 - MILAGRO", "0911 - SAMBORONDON", "0912 - SANTA LUCIA", "0913 - SALITRE", "0914 - PLAYAS"],
    "15 - NAPO": ["1501 - TENA", "1502 - ARCHIDONA", "1503 - CARLOS JULIO AROSEMENA TOLA", "1504 - EL CHACO", "1505 - QUIJOS"],
    "01 - AZUAY": ["0101 - CUENCA", "0102 - GUALACEO", "0103 - PAUTE", "0104 - SIGSIG", "0105 - CHORDELEG", "0106 - NABÓN", "0107 - SANTA ISABEL"],
    "11 - LOJA": ["1101 - LOJA", "1102 - CATAMAYO", "1103 - CALVAS", "1104 - SARAGURO", "1105 - MACARÁ", "1106 - ZAPOTILLO"]
  },
  PARISHES: {
    "1805 - PATATE": ["180550 - PATATE (CENTRO)", "180551 - EL TRIUNFO", "180552 - LOS ANDES", "180553 - SUCRE"],
    "1801 - AMBATO": ["180150 - AMBATO (MATRIZ)", "180151 - ATOCHA-FICOA", "180152 - HUACHI CHICO", "180153 - HUACHI LORETO", "180154 - LA MERCED", "180155 - LA PENINSULA", "180156 - PISHILATA", "180157 - SAN FRANCISCO", "180158 - IZAMBA", "180159 - PICAIGUA", "180160 - QUISAPINCHA", "180161 - TOTORAS", "180162 - SANTA ROSA", "180163 - UNAMUNCHO"],
    "1802 - BAÑOS DE AGUA SANTA": ["180250 - BAÑOS (MATRIZ)", "180251 - LLIGUA", "180252 - RÍO NEGRO", "180253 - RÍO VERDE", "180254 - ULBA"],
    "1806 - PELILEO": ["180650 - PELILEO (MATRIZ)", "180651 - BENÍTEZ", "180652 - BOLÍVAR", "180653 - CHIQUICHA", "180654 - EL ROSARIO", "180655 - GARCÍA MORENO", "180656 - HUAMBALÓ", "180657 - SALASACA"],
    "1701 - QUITO": ["170150 - QUITO (CENTRO)", "170151 - ALANGASI", "170152 - AMAGUAÑA", "170153 - CHILLOGALLO", "170154 - COTOCOLLAO", "170155 - GUAMANI", "170156 - IÑAQUITO", "170157 - LA MAGDALENA", "170158 - TUMBACO", "170159 - CONOCOTO", "170160 - CALDERÓN", "170161 - PUMASQUI", "170162 - NAYÓN", "170163 - LLANO CHICO", "170164 - ZAMBIZA"],
    "1501 - TENA": ["150150 - TENA (MATRIZ)", "150151 - AHUANO", "150152 - CHONTAPUNTA", "150153 - PANO", "150154 - PUERTO MISAHUALLI", "150155 - TALAG"],
    "0101 - CUENCA": ["010150 - CUENCA (MATRIZ)", "010151 - BAÑOS", "010152 - CHAUCHA", "010153 - CHECA", "010154 - CHIQUINTAD", "010155 - LLACAO", "010156 - RICAURTE", "010157 - SAYAUSÍ", "010158 - TARQUI", "010159 - TOTORACOCHA", "010160 - EL VALLE", "010161 - TURI", "010162 - PACCHA"],
    "0901 - GUAYAQUIL": ["090150 - GUAYAQUIL (MATRIZ)", "090151 - AYACUCHO", "090152 - BOLÍVAR", "090153 - CARBO", "090154 - FEBRES CORDERO", "090155 - GARCÍA MORENO", "090156 - LETAMENDI", "090157 - ROCA", "090158 - ROCAFUERTE", "090159 - TARQUI", "090160 - URDANETA", "090161 - XIMENA", "090162 - PASCUALES", "090163 - CHONGÓN", "090164 - POSORJA"]
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
  MARITAL_STATUS: [
    "SOLTERO",
    "CASADO",
    "DIVORCIADO",
    "VIUDO",
    "UNIÓN DE HECHO"
  ],
  GENDER: [
    "MASCULINO",
    "FEMENINO",
    "OTRO"
  ],
  COUNTRIES: [
    "593 - ECUADOR",
    "001 - ESTADOS UNIDOS",
    "034 - ESPAÑA",
    "057 - COLOMBIA",
    "051 - PERÚ",
    "039 - ITALIA",
    "058 - VENEZUELA",
    "056 - CHILE",
    "054 - ARGENTINA",
    "052 - MÉXICO",
    "002 - CANADÁ",
    "044 - REINO UNIDO",
    "033 - FRANCIA",
    "049 - ALEMANIA",
    "031 - PAÍSES BAJOS",
    "351 - PORTUGAL",
    "041 - SUIZA",
    "032 - BÉLGICA",
    "081 - JAPÓN",
    "086 - CHINA",
    "061 - AUSTRALIA"
  ]
};

export const NAV_BY_ROLE: Record<string, any[]> = {
  MEMBER: [
    { id: 'DASHBOARD', label: 'Resumen Patate', icon: <LayoutDashboard size={20} /> },
    { id: 'REPORTS', label: 'Reporte de Cajas y Socios', icon: <FileBarChart size={20} /> },
    { id: 'PROFILE', label: 'Mi Perfil', icon: <UserIcon size={20} /> },
    { id: 'TRANSFERS', label: 'Transferencias', icon: <ArrowRightLeft size={20} /> },
    { id: 'CREDITS', label: 'Créditos y Simulador', icon: <TrendingUp size={20} /> },
  ],
  ADMIN: [
    { id: 'ADMIN_HUB', label: 'Panel Administrativo', icon: <ShieldCheck size={20} /> },
    { id: 'BI_PANEL', label: 'Business Intelligence', icon: <BarChart3 size={20} /> },
    { id: 'REPORTS', label: 'Reporte de Cajas y Socios', icon: <FileBarChart size={20} /> },
    { id: 'DASHBOARD', label: 'Panel Socios', icon: <LayoutDashboard size={20} /> },
    { id: 'TELLER_OPERATIONS', label: 'Caja y Ventanilla', icon: <CreditCard size={20} /> },
    { id: 'CHART_OF_ACCOUNTS', label: 'Contabilidad Central', icon: <Briefcase size={20} /> },
    { id: 'CREDIT_OFFICER_HUB', label: 'Aprobación de Créditos', icon: <FileCheck size={20} /> },
  ],
  TELLER: [
    { id: 'TELLER_OPERATIONS', label: 'Caja y Ventanilla', icon: <CreditCard size={20} /> },
    { id: 'REPORTS', label: 'Reporte de Cajas y Socios', icon: <FileBarChart size={20} /> },
  ],
  ACCOUNTANT: [
    { id: 'CHART_OF_ACCOUNTS', label: 'Plan Contable', icon: <Briefcase size={20} /> },
    { id: 'BI_PANEL', label: 'Reportes ICG BI', icon: <BarChart3 size={20} /> },
    { id: 'REPORTS', label: 'Reporte de Cajas y Socios', icon: <FileBarChart size={20} /> },
  ],
  CREDIT_OFFICER: [
    { id: 'CREDIT_OFFICER_HUB', label: 'Aprobación de Créditos', icon: <FileCheck size={20} /> },
    { id: 'REPORTS', label: 'Reporte de Cajas y Socios', icon: <FileBarChart size={20} /> },
  ]
};

export const INITIAL_RATES = [
  { id: 'R1', category: 'Consumo Ordinario', rate: 16.06, maxTerm: 48 },
  { id: 'R2', category: 'Consumo Prioritario', rate: 16.06, maxTerm: 60 },
  { id: 'R3', category: 'Microcrédito Minorista', rate: 28.23, maxTerm: 24 },
  { id: 'R4', category: 'Microcrédito Acumulación Simple', rate: 24.89, maxTerm: 36 },
  { id: 'R5', category: 'Microcrédito Acumulación Ampliada', rate: 22.05, maxTerm: 48 },
  { id: 'R6', category: 'Inversión Inmobiliaria', rate: 9.50, maxTerm: 120 },
  { id: 'R7', category: 'Productivo PYMES', rate: 11.83, maxTerm: 60 },
  { id: 'R8', category: 'Educativo', rate: 9.00, maxTerm: 48 },
  { id: 'R9', category: 'Emergente / Salud', rate: 12.00, maxTerm: 12 },
];

export const DEFAULT_CONFIG: GlobalConfig = {
  minLoanAmount: 100,
  maxLoanAmount: 100000,
  maxGlobalTerm: 120
};
