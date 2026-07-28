
import { User, InterestRate, GlobalConfig, Transaction, Loan } from '../types';

/**
 * DataService: Realiza llamadas fetch a los scripts PHP.
 * El backend PHP debe actuar como proxy para la base de datos Informix.
 */
export class DataService {
  private static API_URL = import.meta.env.VITE_API_URL || '/api';
  private static TOKEN_KEY = 'cap_auth_token';

  // Token de sesión (JWT) emitido por /api/auth/login.php. Se adjunta automáticamente a toda
  // llamada hecha vía `request()`; los fetch() directos fuera de este servicio deben adjuntarlo
  // a mano leyendo DataService.getToken().
  static getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  static setToken(token: string | null): void {
    if (token) localStorage.setItem(this.TOKEN_KEY, token);
    else localStorage.removeItem(this.TOKEN_KEY);
  }

  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const baseUrl = this.API_URL.replace(/\/$/, '');
      const cleanEndpoint = endpoint.replace(/^\//, '');
      const token = this.getToken();
      const response = await fetch(`${baseUrl}/${cleanEndpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    const result = await this.request<User & { token?: string }>('auth/login.php', {
      method: 'POST',
      body: JSON.stringify({ id, pin })
    });
    this.setToken((result as any)?.token || null);
    return result;
  }

  static logout(): void {
    this.setToken(null);
  }

  static async updatePassword(id: string, password: string): Promise<{ ok: boolean, message?: string }> {
    return this.request<{ ok: boolean, message?: string }>('auth/update_password', {
      method: 'POST',
      body: JSON.stringify({ id, password })
    });
  }

  static async updatePrinter(id: string, printer: string): Promise<{ ok: boolean, message?: string }> {
    return this.request<{ ok: boolean, message?: string }>('users/update_printer', {
      method: 'POST',
      body: JSON.stringify({ id, printer })
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

  static async applyLoan(loan: any): Promise<{ ok: boolean, message?: string }> {
    return this.request<{ ok: boolean, message?: string }>('socios/loans', {
      method: 'POST',
      body: JSON.stringify(loan)
    });
  }
  static async approveLoan(
    loanId: string,
    reason: string,
    usuarioId?: string,
    tipoAprobacion?: string,
    actaSesion?: string,
    proposedAmount?: number,
    icePorcentaje?: number,
    iceEstado?: string,
    iceCuotaMensual?: number,
    iceIngresoNeto?: number,
    iceDeudaExterna?: number
  ): Promise<{ ok: boolean, message?: string }> {
    return this.request<{ ok: boolean, message?: string }>('socios/loans/approve', {
      method: 'POST',
      body: JSON.stringify({
        ids: [loanId], reason, usuarioId, tipoAprobacion, actaSesion, proposedAmount,
        icePorcentaje, iceEstado, iceCuotaMensual, iceIngresoNeto, iceDeudaExterna
      })
    });
  }
  static async approveLoans(loanIds: string[], reason: string, usuarioId?: string): Promise<{ ok: boolean, message?: string }> {
    return this.request<{ ok: boolean, message?: string }>('socios/loans/approve', {
      method: 'POST',
      body: JSON.stringify({ ids: loanIds, reason, usuarioId })
    });
  }

  static async disburseLoans(loanIds: string[], usuarioId?: string): Promise<{ ok: boolean, message?: string, successes?: any[], failures?: any[] }> {
    return this.request<{ ok: boolean, message?: string, successes?: any[], failures?: any[] }>('socios/loans/disburse', {
      method: 'POST',
      body: JSON.stringify({ ids: loanIds, usuarioId })
    });
  }

  static async getAllLoans(): Promise<any[]> {
    const res = await this.request<{ ok: boolean, loans: any[] }>('socios/loans/all');
    return res.ok ? res.loans : [];
  }

  static async rejectLoan(loanId: string, reason: string, usuarioId?: string): Promise<{ ok: boolean, message?: string }> {
    return this.request<{ ok: boolean, message?: string }>('socios/loans/reject', {
      method: 'POST',
      body: JSON.stringify({ id: loanId, reason, usuarioId })
    });
  }

  static async payInstallment(identificacion: string, loanId: string, installmentNumber: number, paymentSource: 'ACCOUNT' | 'TRANSFER', amount: number, applyProrating?: boolean): Promise<{ ok: boolean, message?: string, loanBalance?: number, savingsBalance?: number, installmentPaid?: number, isCompleted?: boolean }> {
    return this.request<{ ok: boolean, message?: string, loanBalance?: number, savingsBalance?: number, installmentPaid?: number, isCompleted?: boolean }>('socios/loans/pay-dividend', {
      method: 'POST',
      body: JSON.stringify({ identificacion, loanId, installmentNumber, paymentSource, amount, applyProrating })
    });
  }

  static async anularLoan(loanId: string, usuarioId?: string): Promise<{ ok: boolean, message?: string, balance?: number }> {
    return this.request<{ ok: boolean, message?: string, balance?: number }>('socios/loans/anular', {
      method: 'POST',
      body: JSON.stringify({ id: loanId, usuarioId })
    });
  }

  static async anularPayment(loanId: string, installmentNumber: number, usuarioId?: string): Promise<{ ok: boolean, message?: string, loanBalance?: number, savingsBalance?: number }> {
    return this.request<{ ok: boolean, message?: string, loanBalance?: number, savingsBalance?: number }>('socios/loans/anular-pago', {
      method: 'POST',
      body: JSON.stringify({ loanId, installmentNumber, usuarioId })
    });
  }

  static async updateLoanStatus(loanId: string, status: string, reason: string, usuarioId?: string): Promise<{ ok: boolean, message?: string }> {
    return this.request<{ ok: boolean, message?: string }>('socios/loans/update-status', {
      method: 'POST',
      body: JSON.stringify({ loanId, status, reason, usuarioId })
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

  // Fetch from DB if available, fallback to local storage
  static async getRates(): Promise<InterestRate[]> {
    try {
      const res = await this.request<{ ok: boolean, rates: any[] }>('socios/rates');
      if (res && res.ok && res.rates) {
        return res.rates.map(r => ({
          id: r.id,
          category: r.category,
          rate: Number(r.rate),
          maxTerm: Number(r.maxTerm),
          class: r.class,
          minAmount: Number(r.minAmount),
          maxAmount: Number(r.maxAmount),
          minTerm: Number(r.minTerm),
          maxRate: Number(r.maxRate)
        }));
      }
    } catch (err) {
      console.warn('Error fetching rates from DB API, using local storage:', err);
    }
    const saved = localStorage.getItem('cap_interest_rates');
    return saved ? JSON.parse(saved) : [];
  }

  // Added missing method to retrieve global configuration from local storage fallback
  static async getConfig(): Promise<GlobalConfig> {
    const saved = localStorage.getItem('cap_global_config');
    return saved ? JSON.parse(saved) : {} as GlobalConfig;
  }
}
