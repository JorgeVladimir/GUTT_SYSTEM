import React, { useState, useEffect, useMemo } from 'react';
import { DataService } from '../services/dataService';
import { User, Loan, UserRole } from '../types';
import { 
  TrendingUp, 
  Search, 
  RefreshCw, 
  BarChart3, 
  FileText, 
  Layers, 
  Smartphone, 
  Building2, 
  DollarSign, 
  UserCheck, 
  CheckCircle,
  HelpCircle,
  AlertCircle
} from 'lucide-react';

interface ReportsSociosCreditosProps {
  users: User[];
  currentUser?: User;
  activeTab?: 'GENERAL' | 'SOCIO_SEARCH' | 'PROFITABILITY' | 'ORIGINS';
  onActiveTabChange?: (tab: 'GENERAL' | 'SOCIO_SEARCH' | 'PROFITABILITY' | 'ORIGINS') => void;
}

export const ReportsSociosCreditos: React.FC<ReportsSociosCreditosProps> = ({ 
  users, 
  currentUser,
  activeTab: propActiveTab,
  onActiveTabChange
}) => {
  const [internalActiveSubTab, setInternalActiveSubTab] = useState<'GENERAL' | 'SOCIO_SEARCH' | 'PROFITABILITY' | 'ORIGINS'>('GENERAL');
  const activeSubTab = propActiveTab !== undefined ? propActiveTab : internalActiveSubTab;
  const setActiveSubTab = onActiveTabChange !== undefined ? onActiveTabChange : setInternalActiveSubTab;
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [socioQuery, setSocioQuery] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const allLoans = await DataService.getAllLoans();
      setLoans(allLoans);
    } catch (err: any) {
      console.error('Error fetching all loans:', err);
      setError('Error al recuperar las solicitudes de crédito del servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 1. Submódulo General: Conteo y estados
  const stats = useMemo(() => {
    const total = loans.length;
    const pendingApproval = loans.filter(l => l.status === 'SOLICITADO').length;
    const pendingDisbursment = loans.filter(l => l.status === 'APROBADO').length;
    const active = loans.filter(l => l.status === 'VIGENTE').length;
    const rejected = loans.filter(l => l.status === 'RECHAZADO').length;
    const overdue = loans.filter(l => l.status === 'VENCIDO').length;
    const paid = loans.filter(l => l.status === 'PAGADO').length;

    const totalAmount = loans.reduce((acc, l) => acc + l.amount, 0);
    const activeAmount = loans.filter(l => l.status === 'VIGENTE').reduce((acc, l) => acc + l.amount, 0);

    return {
      total,
      pendingApproval,
      pendingDisbursment,
      active,
      rejected,
      overdue,
      paid,
      totalAmount,
      activeAmount
    };
  }, [loans]);

  // 2. Submódulo Socio Search: Solicitudes por socio
  const searchResults = useMemo(() => {
    const q = socioQuery.trim().toLowerCase();
    if (!q) return [];

    // Agrupar solicitudes por socio para contar
    const socioMap: Record<string, { memberId: string, memberName: string, loans: any[], count: number }> = {};

    loans.forEach(loan => {
      const matchName = (loan.memberName || '').toLowerCase().includes(q);
      const matchId = (loan.memberId || '').toLowerCase().includes(q);

      if (matchName || matchId) {
        const key = loan.memberId;
        if (!socioMap[key]) {
          socioMap[key] = {
            memberId: loan.memberId,
            memberName: loan.memberName || 'Socio Desconocido',
            loans: [],
            count: 0
          };
        }
        socioMap[key].loans.push(loan);
        socioMap[key].count += 1;
      }
    });

    return Object.values(socioMap);
  }, [loans, socioQuery]);

  // 3. Submódulo Análisis de Rentabilidad (Individual y Global)
  // Rentabilidad = Interés Proyectado + 1% Comisión
  const profitabilityAnalysis = useMemo(() => {
    let globalCommission = 0;
    let globalInterest = 0;
    let globalProfitability = 0;
    let globalVolume = 0;

    const items = loans.map(loan => {
      const commission = loan.amount * 0.01;
      // Suma de interés proyectado en la tabla presuntiva de dividendos
      const interestSum = Array.isArray(loan.installments)
        ? loan.installments.reduce((acc: number, inst: any) => acc + (inst.interest || 0), 0)
        : 0;
      
      const totalProfit = commission + interestSum;

      globalCommission += commission;
      globalInterest += interestSum;
      globalProfitability += totalProfit;
      globalVolume += loan.amount;

      return {
        ...loan,
        commission,
        interestSum,
        totalProfit
      };
    });

    return {
      items,
      globalCommission,
      globalInterest,
      globalProfitability,
      globalVolume,
      averageProfitabilityPercent: globalVolume > 0 ? (globalProfitability / globalVolume) * 100 : 0
    };
  }, [loans]);

  // 4. Submódulo Diferenciación de Origen
  const originStats = useMemo(() => {
    const patate = loans.filter(l => l.origen === 'CAJA_PATATE' || !l.origen);
    const movil = loans.filter(l => l.origen === 'GUTT_MOVIL');

    const patateCount = patate.length;
    const patateAmount = patate.reduce((acc, l) => acc + l.amount, 0);

    const movilCount = movil.length;
    const movilAmount = movil.reduce((acc, l) => acc + l.amount, 0);

    const total = patateCount + movilCount;
    const patatePercent = total > 0 ? (patateCount / total) * 100 : 0;
    const movilPercent = total > 0 ? (movilCount / total) * 100 : 0;

    return {
      patateCount,
      patateAmount,
      movilCount,
      movilAmount,
      patatePercent,
      movilPercent
    };
  }, [loans]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500 font-sans">
      {/* Encabezado */}
      <div className="bg-gradient-to-r from-[#14532D] via-[#1b5e20] to-[#14532D] p-10 rounded-[3rem] shadow-xl text-white flex flex-col xl:flex-row justify-between items-center gap-6 relative overflow-hidden border-b-[8px] border-[#FACC15]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent"></div>
        <div className="relative z-10">
          <h2 className="text-4xl font-black tracking-tighter">Reportes Socios-Créditos</h2>
          <p className="text-emerald-100/70 font-bold text-sm mt-1">Análisis Regulatorio, Rentabilidad y Control del Origen de Solicitudes</p>
        </div>
        {/* Submenús consolidados en la barra lateral vertical */}
      </div>

      {error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-3xl text-red-800 flex gap-4 items-center">
          <AlertCircle size={24} className="text-red-500 shrink-0" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {/* Submódulo 1: GENERAL */}
      {activeSubTab === 'GENERAL' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Solicitudes Registradas</p>
                <p className="text-3xl font-black text-slate-800 mt-2">{stats.total}</p>
                <p className="text-[10px] font-semibold text-slate-400 mt-1">Monto global: ${stats.totalAmount.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#14532D] flex items-center justify-center"><FileText size={24} /></div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pendientes Aprobación</p>
                <p className="text-3xl font-black text-amber-600 mt-2">{stats.pendingApproval}</p>
                <p className="text-[10px] font-semibold text-slate-400 mt-1">Estado: SOLICITADO</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center"><HelpCircle size={24} /></div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Aprobados por Desembolsar</p>
                <p className="text-3xl font-black text-blue-600 mt-2">{stats.pendingDisbursment}</p>
                <p className="text-[10px] font-semibold text-slate-400 mt-1">Estado: APROBADO</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><UserCheck size={24} /></div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Créditos Desembolsados</p>
                <p className="text-3xl font-black text-emerald-600 mt-2">{stats.active}</p>
                <p className="text-[10px] font-semibold text-slate-400 mt-1">Monto colocado: ${stats.activeAmount.toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle size={24} /></div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex justify-between items-center border-b pb-6">
              <div>
                <h3 className="text-xl font-black text-slate-800">Desglose Detallado por Estado</h3>
                <p className="text-slate-500 font-medium text-xs">Monitoreo del estatus regulatorio del portafolio</p>
              </div>
              <button onClick={loadData} disabled={loading} className="p-3 border rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 font-bold text-xs uppercase text-slate-600">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>

            {loading ? (
              <div className="py-20 text-center text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
                Cargando datos del servidor...
              </div>
            ) : loans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                      <th className="p-4">Código</th>
                      <th className="p-4">Socio</th>
                      <th className="p-4">Monto</th>
                      <th className="p-4">Plazo</th>
                      <th className="p-4">Tasa</th>
                      <th className="p-4">Garantía</th>
                      <th className="p-4">Origen</th>
                      <th className="p-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs font-bold text-slate-700">
                    {loans.map(loan => (
                      <tr key={loan.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-black text-slate-800">{loan.id}</td>
                        <td className="p-4 uppercase truncate max-w-[200px]">{loan.memberName}</td>
                        <td className="p-4 text-[#14532D] font-black">${loan.amount.toLocaleString()}</td>
                        <td className="p-4">{loan.installmentsCount} meses</td>
                        <td className="p-4">{loan.rate}%</td>
                        <td className="p-4">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[9px] font-black uppercase text-slate-500">
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
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                            loan.status === 'VIGENTE' ? 'bg-emerald-50 text-emerald-700' :
                            loan.status === 'APROBADO' ? 'bg-blue-50 text-blue-700' :
                            loan.status === 'SOLICITADO' ? 'bg-amber-50 text-amber-700' :
                            loan.status === 'RECHAZADO' ? 'bg-red-50 text-red-700' :
                            loan.status === 'PAGADO' ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {loan.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                No existen registros de crédito en el sistema.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submódulo 2: SOCIO SEARCH */}
      {activeSubTab === 'SOCIO_SEARCH' && (
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
          <div>
            <h3 className="text-xl font-black text-slate-800">Recuperación de Solicitudes por Socio</h3>
            <p className="text-slate-500 font-medium text-xs">Busque un socio para auditar cuántas solicitudes ha generado y sus estados correspondientes</p>
          </div>

          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input 
              type="text" 
              placeholder="Buscar socio por nombre o número de identificación/cédula..." 
              value={socioQuery} 
              onChange={e => setSocioQuery(e.target.value)} 
              className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-slate-50 rounded-2xl outline-none font-bold text-sm focus:border-[#14532D] transition-all"
            />
          </div>

          {searchResults.length > 0 ? (
            <div className="space-y-6">
              {searchResults.map(group => (
                <div key={group.memberId} className="border border-slate-100 rounded-3xl p-6 bg-slate-50/30 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-4">
                    <div>
                      <p className="text-md font-black text-slate-800 uppercase leading-none">{group.memberName}</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">Identificación: {group.memberId}</p>
                    </div>
                    <span className="bg-[#14532D] text-white px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">
                      {group.count} {group.count === 1 ? 'SOLICITUD' : 'SOLICITUDES'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {group.loans.map(loan => (
                      <div key={loan.id} className="bg-white p-5 rounded-2xl border flex flex-col justify-between shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-black text-slate-800 text-xs">{loan.id}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{loan.type} • {loan.installmentsCount} meses</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase ${
                            loan.status === 'VIGENTE' ? 'bg-emerald-50 text-emerald-700' :
                            loan.status === 'APROBADO' ? 'bg-blue-50 text-blue-700' :
                            loan.status === 'SOLICITADO' ? 'bg-amber-50 text-amber-700' :
                            loan.status === 'RECHAZADO' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {loan.status}
                          </span>
                        </div>
                        <div className="border-t mt-4 pt-3 flex justify-between items-center">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">Monto Solicitado</p>
                            <p className="text-lg font-black text-[#14532D]">${loan.amount.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Origen</p>
                            <span className="text-[10px] font-black text-slate-700">{loan.origen || 'GUTT_MOVIL'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : socioQuery.trim() ? (
            <div className="py-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
              No se encontraron socios con solicitudes bajo ese término de búsqueda.
            </div>
          ) : (
            <div className="py-12 text-center text-slate-300 font-black uppercase tracking-widest text-xs border border-dashed rounded-3xl">
              Ingrese el nombre o cédula del socio para recuperar sus datos
            </div>
          )}
        </div>
      )}

      {/* Submódulo 3: PROFITABILITY */}
      {activeSubTab === 'PROFITABILITY' && (
        <div className="space-y-8">
          {/* Indicadores globales de rentabilidad */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-[#14532D] text-white p-6 rounded-[2rem] shadow-md flex items-center justify-between border-b-4 border-[#FACC15]">
              <div>
                <p className="text-[10px] font-black text-emerald-300 uppercase tracking-wider">Cartera Global Evaluada</p>
                <p className="text-3xl font-black mt-2">${profitabilityAnalysis.globalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center"><Layers size={24} /></div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Rentabilidad Proyectada Global</p>
                <p className="text-3xl font-black text-[#14532D] mt-2">${profitabilityAnalysis.globalProfitability.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#14532D] flex items-center justify-center"><TrendingUp size={24} /></div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Comisiones Totales (1%)</p>
                <p className="text-3xl font-black text-slate-800 mt-2">${profitabilityAnalysis.globalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center"><DollarSign size={24} /></div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Intereses Proyectados</p>
                <p className="text-3xl font-black text-slate-800 mt-2">${profitabilityAnalysis.globalInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center"><DollarSign size={24} /></div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div>
              <h3 className="text-xl font-black text-slate-800">Análisis de Rentabilidad por Operación</h3>
              <p className="text-slate-500 font-medium text-xs">Cálculo individual de rentabilidad compuesto por la comisión de desembolso (1.0% del capital) más los intereses de la amortización</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                    <th className="p-4">Código</th>
                    <th className="p-4">Socio</th>
                    <th className="p-4">Monto Capital</th>
                    <th className="p-4">Comisión (1%)</th>
                    <th className="p-4">Intereses Totales</th>
                    <th className="p-4 text-right">Rentabilidad Operación</th>
                    <th className="p-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs font-bold text-slate-700">
                  {profitabilityAnalysis.items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-black text-slate-800">{item.id}</td>
                      <td className="p-4 uppercase truncate max-w-[200px]">{item.memberName}</td>
                      <td className="p-4 text-slate-600 font-semibold">${item.amount.toLocaleString()}</td>
                      <td className="p-4 text-slate-400">${item.commission.toFixed(2)}</td>
                      <td className="p-4 text-slate-400">${item.interestSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-right text-[#14532D] font-black">${item.totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                          item.status === 'VIGENTE' ? 'bg-emerald-50 text-emerald-700' :
                          item.status === 'APROBADO' ? 'bg-blue-50 text-blue-700' :
                          item.status === 'SOLICITADO' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {profitabilityAnalysis.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400 font-bold uppercase">
                        No hay operaciones para evaluar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Submódulo 4: ORIGINS */}
      {activeSubTab === 'ORIGINS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 space-y-8 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#14532D] flex items-center justify-center"><Building2 size={24} /></div>
              <div>
                <h4 className="text-xl font-black text-slate-800">Origen: APP-CAJA-PATATE</h4>
                <p className="text-slate-400 font-semibold text-xs uppercase mt-0.5">Operaciones radicadas en Ventanilla / Asesoría Interna</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-t pt-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Solicitudes Generadas</p>
                <p className="text-3xl font-black text-[#14532D] mt-1">{originStats.patateCount}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">({originStats.patatePercent.toFixed(1)}% del total)</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Monto Total Evaluado</p>
                <p className="text-2xl font-black text-slate-800 mt-1">${originStats.patateAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 space-y-8 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><Smartphone size={24} /></div>
              <div>
                <h4 className="text-xl font-black text-slate-800">Origen: APP-GUTT-MOVIL</h4>
                <p className="text-slate-400 font-semibold text-xs uppercase mt-0.5">Operaciones radicadas vía aplicativo móvil transaccional</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-t pt-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Solicitudes Generadas</p>
                <p className="text-3xl font-black text-blue-600 mt-1">{originStats.movilCount}</p>
                <p className="text-[10px] font-bold text-slate-400 mt-0.5">({originStats.movilPercent.toFixed(1)}% del total)</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase">Monto Total Evaluado</p>
                <p className="text-2xl font-black text-slate-800 mt-1">${originStats.movilAmount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Gráfico de barra simple para contraste visual */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 col-span-full space-y-6">
            <div>
              <h4 className="text-lg font-black text-slate-800">Contraste Relativo de Canales de Radicación</h4>
              <p className="text-slate-500 font-semibold text-xs">Porcentaje del volumen total de solicitudes ingresadas por canal</p>
            </div>
            
            <div className="space-y-4">
              <div className="h-8 w-full rounded-2xl overflow-hidden flex shadow-inner">
                {originStats.patatePercent > 0 && (
                  <div 
                    style={{ width: `${originStats.patatePercent}%` }} 
                    className="bg-[#14532D] text-white flex items-center justify-center text-[10px] font-black uppercase transition-all"
                  >
                    {originStats.patatePercent.toFixed(0)}% Patate
                  </div>
                )}
                {originStats.movilPercent > 0 && (
                  <div 
                    style={{ width: `${originStats.movilPercent}%` }} 
                    className="bg-blue-600 text-white flex items-center justify-center text-[10px] font-black uppercase transition-all"
                  >
                    {originStats.movilPercent.toFixed(0)}% Móvil
                  </div>
                )}
                {originStats.patatePercent === 0 && originStats.movilPercent === 0 && (
                  <div className="w-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] font-black uppercase">
                    Sin operaciones registradas
                  </div>
                )}
              </div>

              <div className="flex justify-between text-[10px] font-black uppercase tracking-wider pt-2">
                <div className="flex items-center gap-2 text-[#14532D]">
                  <div className="w-3.5 h-3.5 bg-[#14532D] rounded-full"></div>
                  APP-CAJA-PATATE ({originStats.patateCount} ops)
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-3.5 h-3.5 bg-blue-600 rounded-full"></div>
                  APP-GUTT-MOVIL ({originStats.movilCount} ops)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
