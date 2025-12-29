
import React, { useState, useRef, useEffect } from 'react';
import { FinancialAssistant } from '../services/geminiService';
import { Bot, X, Send, User, Sparkles, Minus, Maximize2 } from 'lucide-react';
import { MOCK_USER } from '../constants';
import { Transaction } from '../types';

interface ChatAssistantProps {
  currentBalance?: number;
  transactions?: Transaction[];
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ currentBalance, transactions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: `¡Hola! Soy tu asesor IA de la Caja de Ahorro Patate. He analizado tus aportaciones. ¿En qué puedo orientarte hoy?` }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistant = useRef(new FinancialAssistant());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    const context = `Usuario: ${MOCK_USER.name}, Saldo Real: ${currentBalance?.toFixed(2)} USD, Últimos Movimientos: ${transactions?.slice(0, 5).map(t => `${t.description} (${t.amount} USD)`).join(', ')}. Entidad: Caja de Ahorro Patate.`;
    
    const response = await assistant.current.getAdvice(userMessage, context);
    
    setMessages(prev => [...prev, { role: 'assistant', content: response || 'No pude procesar tu solicitud.' }]);
    setIsLoading(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-amber-400 text-slate-900 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95 group z-50 border-4 border-white"
      >
        <Bot size={28} />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 w-[350px] max-w-[90vw] bg-white rounded-3xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden z-50 transition-all duration-300 ${isMinimized ? 'h-16' : 'h-[500px]'}`}>
      <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-slate-900">
            <Bot size={18} />
          </div>
          <div>
            <p className="text-sm font-bold">Asesor IA Patate</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-slate-800 rounded">
            {isMinimized ? <Maximize2 size={16} /> : <Minus size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-slate-800 rounded">
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-amber-400 text-slate-900 font-medium rounded-tr-none' 
                    : 'bg-white text-slate-700 shadow-sm border border-slate-100 rounded-tl-none'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-tl-none p-3 shadow-sm border border-slate-100 flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce delay-100"></span>
                  <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce delay-200"></span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="relative">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Pregunta sobre Patate..."
                className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-all"
              />
              <button 
                onClick={handleSend}
                disabled={isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-amber-400 text-slate-900 rounded-lg disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
