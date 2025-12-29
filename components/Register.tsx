
import React, { useState } from 'react';
import { ArrowLeft, UserPlus, Shield, Check } from 'lucide-react';

interface RegisterProps {
  onRegister: (name: string, userId: string, pin: string) => void;
  onBack: () => void;
}

const CAPLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const dimensions = size === "sm" ? "w-14 h-10" : size === "lg" ? "w-28 h-20" : "w-20 h-14";
  const textSize = size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <div className={`${dimensions} bg-[#14532D] flex flex-col items-center justify-center relative rounded-xl shadow-xl shrink-0`}>
      <span className={`font-black text-white ${textSize} tracking-tight mb-1 italic pr-1.5`}>CAP</span>
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#FACC15] rounded-b-xl"></div>
    </div>
  );
};

export const Register: React.FC<RegisterProps> = ({ onRegister, onBack }) => {
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && userId && pin) {
      onRegister(name, userId, pin);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#14532D]/5 rounded-full -mr-48 -mt-48 blur-3xl"></div>
      
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button 
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-[#14532D] transition-colors"
        >
          <ArrowLeft size={18} /> Volver al Inicio
        </button>

        <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10 border border-slate-100 relative z-10">
          <div className="flex flex-col items-center mb-8 text-center">
            <CAPLogo size="md" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-6">Únete a Caja Patate</h1>
            <p className="text-slate-400 font-medium text-xs mt-1">Crea tu cuenta de socio en la Caja de Ahorro Patate.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
              <input 
                required
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Juan Pérez"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] transition-all font-medium"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Cédula de Identidad</label>
              <input 
                required
                type="text" 
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Ej. 1712345678"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] transition-all font-medium"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">PIN de Acceso (4 dígitos)</label>
              <input 
                required
                type="password" 
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="****"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#14532D]/10 focus:border-[#14532D] transition-all font-medium text-center text-2xl tracking-widest"
              />
            </div>
            
            <div className="bg-emerald-50 p-3 rounded-xl flex gap-3 items-start border border-emerald-100">
               <Shield size={16} className="text-emerald-600 shrink-0 mt-0.5" />
               <p className="text-[10px] text-emerald-800 font-medium">Tus datos están protegidos por la Caja de Ahorro Patate.</p>
            </div>

            <button 
              type="submit"
              className="w-full py-5 bg-[#14532D] text-white rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 hover:bg-[#1b5e20] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
            >
              CREAR CUENTA PATATE <Check size={20} className="text-[#FACC15]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
