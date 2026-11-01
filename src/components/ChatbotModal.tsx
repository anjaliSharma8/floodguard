import React, { useState, useRef, useEffect } from 'react';
import { Language } from '../types';
import { speakText } from '../utils/speech';
import { 
  Bot, 
  Send, 
  Volume2, 
  Mic, 
  Sparkles, 
  X, 
  AlertCircle, 
  ShieldCheck,
  RotateCcw
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  source?: string;
}

interface ChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

const SAMPLE_QUESTIONS = [
  'Is Sinhagad Road currently flooded?',
  'Where is the nearest high-ground shelter?',
  'How do I report an animal stranded in water?',
  'What are the 24x7 Pune disaster helplines?',
  'Is FC Road passable right now?'
];

export const ChatbotModal: React.FC<ChatbotModalProps> = ({ isOpen, onClose, lang }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: lang === 'mr' 
        ? 'नमस्कार! मी फ्लडगार्ड आपत्कालीन एआय सहाय्यक आहे. मी तुम्हाला पुणे आणि पिंपरी-चिंचवडमधील पूर परिस्थिती, सुरक्षित रस्ते आणि मदत केंद्रांची माहिती देऊ शकेन.'
        : (lang === 'hi'
          ? 'नमस्ते! मैं फ्लडगार्ड आपातकालीन एआई सहायक हूँ। पुणे व पिंपरी-चिंचवड़ में बाढ़ जोखिम, सुरक्षित मार्ग एवं आश्रयों की सहायता के लिए मुझसे पूछें।'
          : 'Hello! I am FloodGuard Emergency AI Assistant. Ask me about current Pune road passability, Khadakwasla dam discharge, high-ground shelters, or animal rescue.'),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'Verified FloodGuard RAG Engine'
    }
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const sendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, lang })
      });

      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();

      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: data.source
      };

      setMessages(prev => [...prev, botMsg]);
    } catch {
      // Deterministic Offline Fallback
      const fallbackMsg: ChatMessage = {
        id: `bot_err_${Date.now()}`,
        sender: 'bot',
        text: 'FloodGuard Emergency Protocol: For immediate rescue in Pune call PMC Disaster Management (+91-20-25501269), Fire Brigade (101), or RESQ Animal (+91-9890999111). Avoid low riverside corridors near Mutha basin.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        source: 'Offline Emergency Cache'
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSpeak = (text: string) => {
    speakText(text, lang);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full h-[600px] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 px-4 py-3.5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center space-x-1.5">
                <span>FloodGuard Emergency AI</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded font-mono">
                  RAG Grounded
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">Live Pune Flood Intelligence & Precautions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close Chat"
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-line">{msg.text}</p>
                {msg.sender === 'bot' && (
                  <div className="mt-2 pt-1 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span className="italic truncate pr-2">{msg.source}</span>
                    <button
                      onClick={() => handleSpeak(msg.text)}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 shrink-0 font-medium"
                      title="Read aloud"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Listen</span>
                    </button>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
            </div>
          ))}

          {loading && (
            <div className="flex items-center space-x-2 text-xs text-cyan-400 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700 w-fit">
              <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Analyzing live Pune hydrological sensors...</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Quick Sample Prompts */}
        <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex overflow-x-auto space-x-2">
          {SAMPLE_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              onClick={() => sendMessage(q)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg whitespace-nowrap border border-slate-700 shrink-0 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
            placeholder="Ask about Pune flood zones, shelters, or road status..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            aria-label="Send message"
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2 rounded-xl transition-all shadow"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
