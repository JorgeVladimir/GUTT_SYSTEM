
export enum AppView {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  TRANSFERS = 'TRANSFERS',
  SAVINGS = 'SAVINGS',
  SERVICES = 'SERVICES',
  PROFILE = 'PROFILE'
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  category: string;
}

export interface Account {
  id: string;
  type: string;
  number: string;
  balance: number;
  currency: string;
}

export interface User {
  name: string;
  lastLogin: string;
  accounts: Account[];
}
