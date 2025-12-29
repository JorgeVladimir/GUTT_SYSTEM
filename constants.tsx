
import React from 'react';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  PiggyBank, 
  CreditCard, 
  User, 
  LogOut,
  Bell,
  Search,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Wallet,
  UserPlus
} from 'lucide-react';

export const COLORS = {
  primary: '#14532D', // Patate Deep Green
  secondary: '#FACC15', // Patate Yellow Accent
  background: '#F8FAFC',
  text: '#1E293B'
};

export const NAV_ITEMS = [
  { id: 'DASHBOARD', label: 'Resumen Patate', icon: <LayoutDashboard size={20} /> },
  { id: 'TRANSFERS', label: 'Transferencias', icon: <ArrowRightLeft size={20} /> },
  { id: 'SAVINGS', label: 'Ahorros y Aportes', icon: <PiggyBank size={20} /> },
  { id: 'SERVICES', label: 'Pagos Patate', icon: <CreditCard size={20} /> },
];

export const MOCK_USER = {
  name: 'Socio Patate',
  lastLogin: '2023-10-27 10:30',
  accounts: [
    {
      id: '1',
      type: 'Cuenta de Aportes',
      number: '1792****1234',
      balance: 1250.50,
      currency: 'USD'
    }
  ]
};

export const MOCK_TRANSACTIONS = [
  {
    id: '1',
    date: '27/10/2023',
    description: 'Aporte Inicial de Capital',
    amount: 1000.00,
    type: 'CREDIT',
    category: 'Aportación Mensual'
  }
];
