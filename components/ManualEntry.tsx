
import React, { useState } from 'react';
import { X, Plus, Minus, Check } from 'lucide-react';
import { Transaction } from '../types';

interface ManualEntryProps {
  onAdd: (transaction: Transaction) => void;
  onClose: () => void;
  // Added accountId to props to satisfy Transaction interface requirement
  accountId: string;
}

export const ManualEntry: React.FC<ManualEntryProps> = ({ onAdd, onClose, accountId }) => {
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [category, setCategory] = useState('Ahorro');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !desc) return;

    // Fixed: Added missing accountId property to match Transaction interface
    const newTx: Transaction = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('es-EC'),
      description: desc,
      amount: parseFloat(amount) * (type === 'DEBIT' ? -1 : 1),
      type: type,
      category: category,
      accountId: accountId
    };

    onAdd(newTx);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-lg bg-white rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="absolute top-0 left-0 right-0 h-2 bg-[#FACC15]"></div>
        
        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-[#14532D]">Patate: Nuevo Registro</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operación del Socio Patate</p>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="flex gap-3 p-1.5 bg-slate-100 rounded-2xl">
            <button 
              type="button"
              onClick={() => setType('CREDIT')}
              className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${type === 'CREDIT' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-500'}`}
            >
              <Plus size={16} className={type === 'CREDIT' ? 'text-[#FACC15]' : ''} /> Aporte
            </button>
            <button 
              type="button"
              onClick={() => setType('DEBIT')}
              className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${type === 'DEBIT' ? 'bg-[#14532D] text-white shadow-xl' : 'text-slate-500'}`}
            >
              <Minus size={16} className={type === 'DEBIT' ? 'text-red-400' : ''} /> Gasto
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Monto Patate ($)</label>
              <input 
                autoFocus
                type="number" 
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-6 py-5 bg-white border border-slate-300 rounded-2xl text-4xl font-black text-[#14532D] focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] outline-none transition-all text-center placeholder:text-slate-200"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Descripción</label>
              <input 
                type="text" 
                required
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Ej. Aporte Mensual Patate"
                className="w-full px-6 py-4 bg-white border border-slate-300 rounded-2xl font-bold text-[#14532D] focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] outline-none transition-all placeholder:text-slate-300"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Clasificación</label>
              <select 
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-6 py-4 bg-white border border-slate-300 rounded-2xl font-bold text-[#14532D] focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] outline-none transition-all appearance-none cursor-pointer"
              >
                <option>Aportación Patate</option>
                <option>Depósito Voluntario</option>
                <option>Pago de Préstamo</option>
                <option>Retiro Efectivo</option>
                <option>Otros</option>
              </select>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-5 bg-[#14532D] text-white rounded-2xl font-black text-lg shadow-2xl shadow-emerald-200 hover:bg-[#1b5e20] transition-all flex items-center justify-center gap-2 group"
          >
            REGISTRAR EN PATATE <Check size={24} className="text-[#FACC15] group-hover:scale-125 transition-transform" />
          </button>
        </form>
      </div>
    </div>
  );
};
