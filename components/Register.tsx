
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Mail, Shield, Check, Loader2, AlertCircle, CheckCircle2, FileText, Send, Info, Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';

interface RegisterProps {
  onRegister: (name: string, userId: string, pin: string, email: string, authorizeSavings: boolean) => void;
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
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authorize, setAuthorize] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [idStatus, setIdStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [isSuccess, setIsSuccess] = useState(false);

  const validateEcuadorianId = (id: string): boolean => {
    if (id.length !== 10) return false;
    const province = parseInt(id.substring(0, 2), 10);
    if (province < 1 || province > 24) return false;
    const thirdDigit = parseInt(id.substring(2, 3), 10);
    if (thirdDigit >= 6) return false;
    const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let total = 0;
    for (let i = 0; i < 9; i++) {
      let val = parseInt(id[i], 10) * coefficients[i];
      if (val >= 10) val -= 9;
      total += val;
    }
    const checkDigit = parseInt(id[9], 10);
    const calculatedCheckDigit = (total % 10 === 0) ? 0 : 10 - (total % 10);
    return checkDigit === calculatedCheckDigit;
  };

  useEffect(() => {
    if (userId.length === 10) {
      setIsValidating(true);
      setIdStatus('idle');
      const timer = setTimeout(() => {
        const valid = validateEcuadorianId(userId);
        setIdStatus(valid ? 'valid' : 'invalid');
        setIsValidating(false);
      }, 1200);
      return () => clearTimeout(timer);
    } else {
      setIdStatus('idle');
    }
  }, [userId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idStatus !== 'valid') return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert("Por favor, ingrese un correo electrónico válido.");
      return;
    }

    if (pin.length !== 4) {
      alert("El PIN debe ser de exactamente 4 dígitos.");
      return;
    }

    if (name && userId && pin && authorize) {
      setIsSuccess(true);
      setTimeout(() => {
        onRegister(name, userId, pin, email, authorize);
      }, 3500);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#14532D] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[3rem] p-10 text-center space-y-8 animate-in zoom-in duration-500 shadow-2xl">
          <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
            <Send size={48} />
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-black text-slate-900 leading-tight">¡Bienvenido a la Caja, {name.split(' ')[0]}!</h2>
            <p className="text-slate-500 font-medium text-sm">
              Estamos enviando tu <span className="text-[#14532D] font-bold">Certificado de Apertura</span> y contrato digital a:
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-center gap-2">
              <Mail size={16} className="text-slate-400" />
              <span className="font-black text-slate-800 text-xs truncate">{email.toLowerCase()}</span>
            </div>
          </div>
          <div className="space-y-2 pt-4">
            <div className="flex items-center gap-3 text-emerald-600 text-xs font-bold justify-center">
              <Loader2 size={16} className="animate-spin" /> Configurando Banca Móvil...
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Espera un momento por favor</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 relative overflow-y-auto">
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#14532D]/5 rounded-full -mr-48 -mt-48 blur-3xl"></div>
      
      <div className="w-full max-w-lg my-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button 
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-[#14532D] transition-colors"
        >
          <ArrowLeft size={18} /> Cancelar y Volver
        </button>

        <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 relative z-10 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[#14532D] via-[#FACC15] to-[#14532D]"></div>
          
          <div className="p-8 md:p-12">
            <div className="flex flex-col items-center mb-10 text-center">
              <CAPLogo size="md" />
              <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-6">Apertura de Cuenta Digital</h1>
              <p className="text-slate-400 font-medium text-xs mt-1">Regístrate en la Caja de Ahorro Patate en pocos minutos.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* CAMPO: IDENTIFICACIÓN */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1.5 block">Número de Cédula (10 dígitos)</label>
                <div className="relative">
                  <UserIcon size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input 
                    required
                    type="text" 
                    maxLength={10}
                    value={userId}
                    onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ej: 180XXXXXXX"
                    className={`w-full pl-14 pr-12 py-4 bg-slate-50 border-2 rounded-2xl focus:outline-none transition-all font-black text-[#14532D] ${
                      idStatus === 'valid' ? 'border-emerald-500 bg-emerald-50/20' : 
                      idStatus === 'invalid' ? 'border-red-500 bg-red-50/20' : 'border-slate-100 focus:border-[#14532D]'
                    }`}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {isValidating && <Loader2 size={18} className="animate-spin text-slate-400" />}
                    {idStatus === 'valid' && <CheckCircle2 size={20} className="text-emerald-500" />}
                    {idStatus === 'invalid' && <AlertCircle size={20} className="text-red-500" />}
                  </div>
                </div>
                {idStatus === 'valid' && <p className="text-[10px] text-emerald-600 font-bold mt-2 ml-1">✓ Documento validado correctamente.</p>}
                {idStatus === 'invalid' && <p className="text-[10px] text-red-500 font-bold mt-2 ml-1">⚠ La cédula no es válida o tiene errores.</p>}
              </div>

              {/* CAMPO: NOMBRE */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1.5 block">Nombres y Apellidos Completos</label>
                <input 
                  required
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="NOMBRE COMO CONSTA EN CÉDULA"
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-[#14532D] outline-none font-bold text-[#14532D] uppercase placeholder:text-slate-300"
                />
              </div>

              {/* CAMPO: CORREO */}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1.5 block">Correo Electrónico Personal</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input 
                    required
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full pl-14 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-[#14532D] outline-none font-bold text-[#14532D] lowercase"
                  />
                </div>
              </div>

              {/* CAMPO: PIN */}
              <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 space-y-3">
                <label className="text-[10px] font-black text-[#14532D] uppercase tracking-widest block text-center">Define tu PIN de Seguridad (4 dígitos)</label>
                <div className="relative max-w-[200px] mx-auto">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input 
                    required
                    type={showPin ? "text" : "password"} 
                    maxLength={4}
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="****"
                    className="w-full pl-10 pr-12 py-4 bg-white border-2 border-[#14532D]/20 rounded-2xl focus:border-[#14532D] outline-none font-black text-center text-2xl tracking-[0.5em] text-[#14532D]"
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#14532D] transition-colors"
                  >
                    {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 font-bold text-center italic">Este código será necesario para ingresar a tu banca móvil.</p>
              </div>

              {/* AUTORIZACIÓN (RESTAURADA CON TEXTO FINANCIERO) */}
              <div className="p-5 bg-amber-50 rounded-[1.5rem] border border-amber-100">
                <div className="flex gap-4">
                  <div className="pt-1">
                    <input 
                      required
                      type="checkbox" 
                      id="auth_savings" 
                      checked={authorize}
                      onChange={(e) => setAuthorize(e.target.checked)}
                      className="w-5 h-5 accent-[#14532D] cursor-pointer"
                    />
                  </div>
                  <label htmlFor="auth_savings" className="text-[11px] font-bold text-amber-900 cursor-pointer leading-tight">
                    Autorizo a la Caja de Ahorro Patate el débito inicial de <span className="text-[#14532D] font-black">$5.00</span> para activación de cuenta y el ahorro programado mensual automático de <span className="text-[#14532D] font-black">$5.00</span>.
                  </label>
                </div>
              </div>
              
              {/* BOTÓN FINAL */}
              <button 
                type="submit"
                disabled={idStatus !== 'valid' || !authorize || !email || pin.length < 4}
                className="w-full py-5 bg-[#14532D] text-white rounded-2xl font-black text-lg shadow-xl hover:bg-[#1b5e20] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale group"
              >
                REGISTRARME AHORA <Check size={24} className="text-[#FACC15]" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
