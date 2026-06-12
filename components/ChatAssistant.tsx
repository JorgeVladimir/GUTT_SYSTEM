import React, { useState, useRef, useEffect } from 'react';
import { FinancialAssistant } from '../services/geminiService';
import { Bot, X, Send, Minus, Maximize2, History, MessageSquare, Plus } from 'lucide-react';
import { Transaction, User as UserType } from '../types';

interface ChatAssistantProps {
  user: UserType | null;
  currentBalance?: number;
  transactions?: Transaction[];
}

interface Conversation {
  id: string;
  title: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

const PRELOADED_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    title: 'Consulta de Ahorros e Intereses',
    messages: [
      { role: 'assistant', content: '¡Hola! Soy tu asesor IA de Gutt System. ¿En qué puedo ayudarte con tus finanzas hoy?' },
      { role: 'user', content: '¿Qué tasas de interés ofrecen para las cuentas de ahorro?' },
      { role: 'assistant', content: 'Hola. En Gutt System, la cuenta de ahorros tradicional genera intereses diarios sobre tu saldo disponible. Las tasas específicas dependen del monto y del tipo de cuenta, pero puedes de igual manera incrementarlo con aportaciones mensuales o certificados de aportación. ¿Te gustaría saber más sobre algún producto?' },
      { role: 'user', content: 'Sí, ¿cómo puedo maximizar mis rendimientos?' },
      { role: 'assistant', content: 'Para maximizar tus rendimientos, te recomiendo programar depósitos mensuales constantes en tu cuenta de ahorros o considerar abrir un certificado de aportación para participar activamente en los excedentes de la cooperativa.' }
    ]
  },
  {
    id: 'conv-2',
    title: 'Requisitos de Crédito de Consumo',
    messages: [
      { role: 'assistant', content: '¡Hola! Soy tu asesor IA de Gutt System. ¿En qué puedo ayudarte con tus finanzas hoy?' },
      { role: 'user', content: 'Quiero solicitar un crédito de consumo. ¿Cuáles son los requisitos?' },
      { role: 'assistant', content: 'Para un Crédito de Consumo Ordinario o Prioritario, los requisitos generales incluyen: cédula de identidad, planilla de servicio básico reciente, justificación de ingresos (roles de pago o facturas) y tener una cuenta activa con nosotros. La tasa de interés es del 16.06% con plazos de hasta 48 o 60 meses. ¿Deseas que te ayude a calcular una cuota estimada?' },
      { role: 'user', content: '¿Cuál es el plazo máximo para consumo prioritario?' },
      { role: 'assistant', content: 'Para consumo prioritario el plazo máximo es de 60 meses (5 años), y para consumo ordinario es de 48 meses (4 años).' }
    ]
  }
];

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ user, currentBalance, transactions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([
    {
      id: 'conv-active',
      title: 'Nueva Consulta (Gemini IA)',
      messages: [
        { role: 'assistant', content: `¡Hola! Soy tu asesor IA de Gutt System. ¿En qué puedo ayudarte con tus finanzas hoy?` }
      ]
    },
    ...PRELOADED_CONVERSATIONS
  ]);
  const [activeConvId, setActiveConvId] = useState<string>('conv-active');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const assistant = useRef(new FinancialAssistant());

  const activeConv = conversations.find(c => c.id === activeConvId) || conversations[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConv.messages, isOpen, showHistory]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const userMessage = input.trim();
    setInput('');

    // Agregar mensaje del usuario a la conversación activa
    setConversations(prev => prev.map(c => {
      if (c.id === activeConvId) {
        return {
          ...c,
          messages: [...c.messages, { role: 'user', content: userMessage }]
        };
      }
      return c;
    }));
    
    setIsLoading(true);

    const context = `Socio: ${user.name}, Cédula: ${user.id}, Saldo Actual: ${currentBalance?.toFixed(2)} USD, Historial: ${transactions?.slice(0, 5).map(t => `${t.description} ($${t.amount})`).join(', ')}. Entidad: Gutt System.`;
    
    const response = await assistant.current.getAdvice(userMessage, context);
    
    // Agregar respuesta del asistente a la conversación activa
    setConversations(prev => prev.map(c => {
      if (c.id === activeConvId) {
        return {
          ...c,
          messages: [...c.messages, { role: 'assistant', content: response || 'Lo siento, no pude procesar tu consulta en este momento.' }]
        };
      }
      return c;
    }));
    setIsLoading(false);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 lg:left-72 w-14 h-14 bg-amber-400 text-slate-900 rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform active:scale-95 group z-50 border-4 border-white"
      >
        <Bot size={28} />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 left-6 lg:left-72 w-[350px] max-w-[90vw] bg-white rounded-3xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden z-50 transition-all duration-300 ${isMinimized ? 'h-16' : 'h-[500px]'}`}>
      <div className="bg-[#14532D] p-4 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 text-left">
          <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-slate-900 shrink-0">
            <Bot size={18} />
          </div>
          <div className="overflow-hidden max-w-[120px]">
            <p className="text-sm font-bold truncate">Asesor IA Gutt System</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => !isMinimized && setShowHistory(!showHistory)} 
            disabled={isMinimized}
            className={`p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50 ${showHistory ? 'bg-white/10 text-amber-400' : ''}`}
            title="Historial de Conversaciones"
          >
            <History size={16} />
          </button>
          <button onClick={() => setIsMinimized(!isMinimized)} className="p-1 hover:bg-white/10 rounded">
            {isMinimized ? <Maximize2 size={16} /> : <Minus size={16} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded">
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {showHistory ? (
            <div className="flex-1 flex flex-col p-4 space-y-3 bg-slate-50 overflow-y-auto">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-left">Conversaciones Recientes</p>
              <div className="space-y-2 flex-1 overflow-y-auto">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setActiveConvId(conv.id);
                      setShowHistory(false);
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                      activeConvId === conv.id 
                        ? 'border-[#14532D] bg-emerald-50 text-[#14532D] shadow-sm' 
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <MessageSquare size={16} className="shrink-0 mt-0.5 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{conv.title}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                        {conv.messages.length} mensajes
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const newId = `conv-${Date.now()}`;
                  const newConv: Conversation = {
                    id: newId,
                    title: `Consulta ${conversations.filter(c => c.id.startsWith('conv-active') || c.id.startsWith('conv-new-') || c.id.startsWith('conv-1') || c.id.startsWith('conv-2')).length - 1}`,
                    messages: [
                      { role: 'assistant', content: '¡Hola! Soy tu asesor IA de Gutt System. ¿En qué puedo ayudarte con tus finanzas hoy?' }
                    ]
                  };
                  setConversations(prev => [newConv, ...prev]);
                  setActiveConvId(newId);
                  setShowHistory(false);
                }}
                className="w-full py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-2xl font-black text-xs uppercase hover:border-[#14532D] hover:text-[#14532D] hover:bg-white flex items-center justify-center gap-2 transition-all mt-4 shrink-0"
              >
                <Plus size={16} /> Nueva Consulta
              </button>
            </div>
          ) : (
            <>
              <div className="bg-emerald-50 px-4 py-2 border-b border-slate-100 flex items-center justify-between shrink-0">
                <span className="text-[9px] font-black text-[#14532D] uppercase tracking-widest truncate">{activeConv.title}</span>
                {activeConvId !== 'conv-active' && activeConvId !== 'conv-1' && activeConvId !== 'conv-2' && (
                  <button 
                    onClick={() => {
                      setConversations(prev => prev.filter(c => c.id !== activeConvId));
                      setActiveConvId('conv-active');
                    }}
                    className="text-[9px] font-bold text-red-600 hover:text-red-800 uppercase shrink-0"
                  >
                    Eliminar
                  </button>
                )}
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {activeConv.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-sm text-left ${
                      msg.role === 'user' 
                        ? 'bg-amber-400 text-slate-900 font-medium rounded-tr-none shadow-sm' 
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
                    placeholder="Escribe tu consulta..."
                    className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#14532D] transition-all"
                  />
                  <button 
                    onClick={handleSend}
                    disabled={isLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#14532D] text-white rounded-lg disabled:opacity-50"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
