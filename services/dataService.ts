
import { User, InterestRate, GlobalConfig, Transaction, Loan } from '../types';

/**
 * DataService: Realiza llamadas fetch a los scripts PHP.
 * El backend PHP debe actuar como proxy para la base de datos Informix.
 */
export class DataService {
  private static API_URL = import.meta.env.VITE_API_URL || '/api';

  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const baseUrl = this.API_URL.replace(/\/$/, '');
      const cleanEndpoint = endpoint.replace(/^\//, '');
      const response = await fetch(`${baseUrl}/${cleanEndpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });
      if (!response.ok) throw new Error(`Error en API: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error(`Error llamando a ${endpoint}:`, error);
      throw error;
    }
  }

  static async login(id: string, pin: string): Promise<User | null> {
    // Llama a login.php que consulta bcausua o bcasoci
    return this.request<User>('auth/login.php', {
      method: 'POST',
      body: JSON.stringify({ id, pin })
    });
  }

  static async getUserFullData(userId: string): Promise<User> {
    // Une datos de bcaclie, bcadpvi (cuentas) y bcacred (préstamos)
    return this.request<User>(`users/get_profile.php?id=${userId}`);
  }

  static async getFinancialReport(type: string, params: any): Promise<any[]> {
    // Mapea a procedimientos como sp_r_bal_compro o sp_sepsb11
    return this.request<any[]>('reports/generate.php', {
      method: 'POST',
      body: JSON.stringify({ type, ...params })
    });
  }

  // Métodos de respaldo para desarrollo (si el API no responde)
  static async getUsers(): Promise<User[]> {
    const saved = localStorage.getItem('cap_core_users');
    return saved ? JSON.parse(saved) : [];
  }

  static async saveUsers(users: User[]): Promise<void> {
    localStorage.setItem('cap_core_users', JSON.stringify(users));
  }

  // Added missing method to retrieve interest rates from local storage fallback
  static async getRates(): Promise<InterestRate[]> {
    const saved = localStorage.getItem('cap_interest_rates');
    return saved ? JSON.parse(saved) : [];
  }

  // Added missing method to retrieve global configuration from local storage fallback
  static async getConfig(): Promise<GlobalConfig> {
    const saved = localStorage.getItem('cap_global_config');
    return saved ? JSON.parse(saved) : {} as GlobalConfig;
  }
}
