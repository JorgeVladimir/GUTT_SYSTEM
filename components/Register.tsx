
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Mail, Check, Loader2, CheckCircle2, Send, Lock, User as UserIcon, Eye, EyeOff, ShieldCheck, BadgeCheck } from 'lucide-react';

interface RegisterProps {
  onRegister: (name: string, userId: string, pin: string, email: string, authorizeSavings: boolean) => void;
  onBack: () => void;
}

const CAPLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const dimensions = size === "sm" ? "w-12 h-8" : size === "lg" ? "w-24 h-16" : "w-16 h-12";
  const textSize = size === "sm" ? "text-lg" : size === "lg" ? "text-3xl" : "text-xl";
  return (
    <div className={`${dimensions} bg-[#14532D] flex flex-col items-center justify-center relative rounded-xl shadow-lg shrink-0 overflow-hidden`}>
      <span className={`font-black text-white ${textSize} tracking-tighter mb-1 italic pr-1`}>CAP</span>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#FACC15]"></div>
    </div>
  );
};

export const Register: React.FC<RegisterProps> = ({ onRegister, onBack }) => {
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [onlyOneName, setOnlyOneName] = useState(false);
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authorize, setAuthorize] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [idStatus, setIdStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [isSuccess, setIsSuccess] = useState(false);
  const [progress, setProgress] = useState(0);

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
      }, 8000); // Simulación de consulta a Registro Civil
      return () => clearTimeout(timer);
    } else {
      setIdStatus('idle');
    }
  }, [userId]);

  useEffect(() => {
    if (isSuccess) {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 1;
        });
      }, 25);
      return () => clearInterval(interval);
    }
  }, [isSuccess]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idStatus !== 'valid') return;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return;
    if (pin.length !== 4) return;

    if (firstName && lastName && userId && pin && authorize) {
      const fullName = `${firstName.trim()} ${onlyOneName ? '' : middleName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ').toUpperCase();
      setIsSuccess(true);
      setTimeout(() => {
        onRegister(fullName, userId, pin, email, authorize);
      }, 4000);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#14532D] flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#ffffff_2px,transparent_2px)] [background-size:24px_24px]"></div>
        </div>

        <div className="max-w-[420px] w-full bg-white rounded-[3.5rem] p-12 text-center space-y-10 animate-in zoom-in-95 fade-in duration-1000 ease-out shadow-2xl">
          <div className="flex justify-center">
            <div className="w-28 h-28 bg-emerald-50 rounded-full flex items-center justify-center relative">
               <div className="absolute inset-0 bg-[#14532D]/5 animate-ping rounded-full"></div>
               <BadgeCheck size={56} className="text-[#14532D]" />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-3xl font-black tracking-tighter text-slate-900 leading-tight">
              ¡Bienvenido,<br/>
              <span className="text-[#14532D] lowercase italic">{firstName}!</span>
            </h2>
            <p className="text-slate-400 font-bold text-sm leading-relaxed px-4">
              Tu acceso a la banca digital de Patate ha sido configurado con éxito.
            </p>
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between text-[9px] font-black text-slate-400 uppercase tracking-[0.3em]">
               <span>Sincronizando Core Bancario</span>
               <span className="text-[#14532D]">{progress}%</span>
            </div>
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#14532D] transition-all duration-75 ease-linear"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 relative overflow-y-auto">
      <div className="w-full max-w-xl my-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="bg-white rounded-[2.5rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#14532D] via-[#FACC15] to-[#14532D]"></div>
          
          <div className="p-8 md:p-10">
            <div className="flex justify-between items-start mb-10">
              <div className="flex items-center gap-4">
                <CAPLogo size="sm" />
                <div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Nueva Cuenta</h1>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Patate • Banca Solidaria</p>
                </div>
              </div>
              <button onClick={onBack} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                <ArrowLeft size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Bloque Identidad */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-4 bg-[#14532D] rounded-full"></span>
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Identificación y Nombres</h3>
                </div>
                
                <div className="relative">
                  <UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input 
                    required type="text" maxLength={10} value={userId}
                    onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
                    className={`w-full pl-12 pr-12 py-3.5 bg-slate-50 border rounded-xl focus:outline-none transition-all font-black text-[#14532D] ${idStatus === 'valid' ? 'border-emerald-500 bg-emerald-50/20' : idStatus === 'invalid' ? 'border-red-500 bg-red-50/20' : 'border-slate-200 focus:border-[#14532D]'}`}
                    placeholder="Cédula (10 dígitos)"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {isValidating && <Loader2 size={16} className="animate-spin text-[#14532D]" />}
                    {idStatus === 'valid' && <CheckCircle2 size={18} className="text-emerald-500" />}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input required type="text" value={firstName} onChange={(e) => setFirstName(e.target.value.toUpperCase())} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-black text-xs text-[#14532D]" placeholder="PRIMER NOMBRE" />
                  {!onlyOneName && (
                    <input type="text" value={middleName} onChange={(e) => setMiddleName(e.target.value.toUpperCase())} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-black text-xs text-[#14532D]" placeholder="SEGUNDO NOMBRE" />
                  )}
                  <div className="col-span-full flex items-center gap-2 ml-1">
                    <input type="checkbox" id="onlyOne" checked={onlyOneName} onChange={(e) => { setOnlyOneName(e.target.checked); if (e.target.checked) setMiddleName(''); }} className="w-4 h-4 accent-[#14532D] cursor-pointer" />
                    <label htmlFor="onlyOne" className="text-[9px] font-black text-slate-400 cursor-pointer uppercase tracking-tight">Poseo un solo nombre legal</label>
                  </div>
                  <input required type="text" value={lastName} onChange={(e) => setLastName(e.target.value.toUpperCase())} className="col-span-full w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-black text-xs text-[#14532D]" placeholder="APELLIDOS COMPLETOS" />
                </div>
              </div>

              {/* Bloque Contacto y Seguridad */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-4 bg-[#14532D] rounded-full"></span>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Contacto</h3>
                  </div>
                  <div className="relative">
                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input required type="email" value={email} onChange={(e) => setEmail(e.target.value.toLowerCase())} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-bold text-xs text-[#14532D]" placeholder="Email personal" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-4 bg-[#14532D] rounded-full"></span>
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">PIN Digital</h3>
                  </div>
                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                    <input required type={showPin ? "text" : "password"} maxLength={4} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#14532D] outline-none font-black text-center text-lg tracking-[0.4em] text-[#14532D]" placeholder="****" />
                    <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">{showPin ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </div>
              </div>

              {/* Bloque Legal */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex gap-4">
                  <input required type="checkbox" id="auth_v5" checked={authorize} onChange={(e) => setAuthorize(e.target.checked)} className="w-5 h-5 accent-[#14532D] cursor-pointer mt-0.5" />
                  <label htmlFor="auth_v5" className="text-[10px] font-bold text-slate-600 cursor-pointer leading-snug">
                    Autorizo el débito automático de <span className="text-[#14532D] font-black underline">$5.00</span> para la activación de mi cuenta y emisión de Certificados de Aportación iniciales conforme a los estatutos institucionales.
                  </label>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={idStatus !== 'valid' || !authorize || !email || pin.length < 4} 
                className="w-full py-4 bg-[#14532D] text-white rounded-xl font-black text-sm shadow-xl hover:bg-[#0a2f1a] transition-all flex items-center justify-center gap-3 disabled:opacity-30 uppercase tracking-widest"
              >
                SOLICITAR ACTIVACIÓN <Check size={18} className="text-[#FACC15]" />
              </button>
            </form>
          </div>
        </div>
        <p className="text-center mt-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Caja de Ahorro Patate • Seguridad Certificada</p>
      </div>
    </div>
  );
};
