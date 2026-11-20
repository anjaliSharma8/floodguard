import React, { useState, useRef, useEffect } from 'react';
import { Language } from '../types';
import { getAssistantErrorCategory, readAssistantResponse } from '../services/assistantStream';
import { speakText, startSpeechRecognition, isSpeechRecognitionSupported } from '../utils/speech';
import {
  Bot,
  Send,
  Volume2,
  Mic,
  Sparkles,
  X
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  source?: string;
  errorCategory?: string;
  aiStatus?: 'available' | 'unavailable';
}

interface ChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  token?: string | null;
}

const SAMPLE_QUESTIONS = [
  'Is Sinhagad Road currently flooded?',
  'Where is the nearest high-ground shelter?',
  'Which roads are officially closed right now?',
  'What are the 24x7 Pune disaster helplines?',
  'What is the safest route from Shivajinagar to Kothrud?'
];

function getWelcomeText(lang: Language): string {
  if (lang === 'mr') {
    return 'नमस्कार! मी संकेतसेतू (SanketSetu) आपत्कालीन सहाय्यक आहे. मी तुम्हाला पुणे आणि पिंपरी-चिंचवडमधील रस्ते स्थिती, पर्जन्यमान, मदत केंद्रे आणि सुरक्षित मार्गांची अचूक माहिती देऊ शकेन.';
  }
  if (lang === 'hi') {
    return 'नमस्ते! मैं संकेतसेतु (SanketSetu) आपातकालीन सहायक हूँ। पुणे व पिंपरी-चिंचवड़ में बाढ़ जोखिम, बंद सड़कों, आश्रयों और सुरक्षित मार्गों की लाइव जानकारी के लिए पूछें।';
  }
  return 'Hello! I am SanketSetu Emergency Assistant. Ask me about live Pune/PCMC road status, Open-Meteo rainfall telemetry, verified hazards, safe routes, or nearby shelters.';
}

export const ChatbotModal: React.FC<ChatbotModalProps> = ({ isOpen, onClose, lang, token }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: getWelcomeText(lang),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'SanketSetu Live Telemetry & Tool Engine'
    }
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [retryPrompt, setRetryPrompt] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    setMessages(prev =>
      prev.map(m => (m.id === 'welcome' ? { ...m, text: getWelcomeText(lang) } : m))
    );
  }, [lang]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const sendMessage = async (textToSend: string, retry = false) => {
    const text = textToSend.trim();
    if (!text || loading || requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    const streamId = `bot_stream_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    const pendingMsg: ChatMessage = {
      id: streamId,
      sender: 'bot',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: 'Waiting for Gemini'
    };
    setMessages(prev => [...prev, ...(retry ? [] : [userMsg]), pendingMsg]);
    if (!retry) setRetryPrompt(null);
    setInput('');
    setLoading(true);
    let streamedText = '';
    const endpoint = '/api/chatbot/message';
    const startedAt = Date.now();
    let response: Response | undefined;
    let requestId: string | undefined;

    try {
      const historyMessages = messages.filter(message => message.id !== 'welcome');
      if (retry) {
        let lastUserIndex = -1;
        historyMessages.forEach((message, index) => {
          if (message.sender === 'user') lastUserIndex = index;
        });
        if (lastUserIndex >= 0) historyMessages.splice(lastUserIndex);
      }
      const history = historyMessages
        .slice(-20)
        .map(message => ({
          role: message.sender === 'user' ? 'user' : 'model',
          text: message.text
        }));
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: text, lang, history, stream: true })
      });
      requestId = response.headers.get('x-request-id') || undefined;
      const payload = await readAssistantResponse(
        response,
        delta => {
          streamedText += delta;
          setMessages(previous => previous.map(message =>
            message.id === streamId ? { ...message, text: streamedText } : message
          ));
        },
        () => {
          streamedText = '';
          setMessages(previous => previous.map(message =>
            message.id === streamId ? { ...message, text: '' } : message
          ));
        }
      );
      requestId = payload.requestId || requestId;
      setMessages(previous => previous.map(message =>
        message.id === streamId
          ? {
              ...message,
              text: payload.reply,
              timestamp: payload.timestamp
                ? new Date(payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : message.timestamp,
              source: payload.source,
              errorCategory: payload.errorCategory,
              aiStatus: payload.aiStatus
            }
          : message
      ));
      setRetryPrompt(payload.aiStatus === 'unavailable' ? text : null);
    } catch (error) {
      const category = getAssistantErrorCategory(error);
      const errorRequestId = error && typeof error === 'object' && 'requestId' in error &&
        typeof error.requestId === 'string' ? error.requestId : requestId;
      const errorName = error instanceof Error
        ? error.name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40)
        : 'UnknownError';
      console.warn('[SanketSetu] Assistant request failed.', {
        requestId: errorRequestId,
        endpoint,
        status: response?.status ?? null,
        durationMs: Date.now() - startedAt,
        category,
        errorName
      });
      setMessages(previous => previous.map(message =>
        message.id === streamId
          ? {
              ...message,
              text: 'The assistant could not complete its response. No partial answer is being treated as verified; retry when connected.',
              source: 'No complete backend response',
              errorCategory: category,
              aiStatus: 'unavailable'
            }
          : message
      ));
      setRetryPrompt(text);
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleVoiceDictate = () => {
    setVoiceNotice(null);
    if (!isSpeechRecognitionSupported()) {
      setVoiceNotice('Voice recognition unavailable in this browser. Please type your question.');
      return;
    }
    setIsListening(true);
    startSpeechRecognition(lang, {
      onResult: transcript => {
        setIsListening(false);
        setInput(transcript);
        sendMessage(transcript);
      },
      onError: err => {
        setIsListening(false);
        setVoiceNotice(err);
      },
      onEnd: () => {
        setIsListening(false);
      }
    });
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
                <span>SanketSetu Emergency Assistant</span>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded font-mono">
                  Backend-grounded
                </span>
              </h3>
              <p className="text-[11px] text-slate-300">Queries live Pune/PCMC roads, weather, shelters & reports</p>
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
                    <div className="flex items-center gap-2">
                      {msg.errorCategory && <span className="text-amber-300">{msg.errorCategory}</span>}
                      {msg.aiStatus !== 'unavailable' && (
                        <button
                          onClick={() => speakText(msg.text, lang)}
                          className="text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 shrink-0 font-medium"
                          title="Read aloud"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
              {msg.errorCategory && retryPrompt && msg.id === messages[messages.length - 1]?.id && (
                <button
                  type="button"
                  onClick={() => { void sendMessage(retryPrompt, true); }}
                  className="mt-1 px-1 text-[10px] font-semibold text-cyan-300 underline"
                  disabled={loading}
                >
                  Retry
                </button>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center space-x-2 text-xs text-cyan-400 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700 w-fit">
              <Sparkles className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Querying live SanketSetu hydrological state...</span>
            </div>
          )}

          {voiceNotice && (
            <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800 px-3 py-1.5 rounded-xl">
              {voiceNotice}
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
          <button
            type="button"
            onClick={handleVoiceDictate}
            aria-label="Speak question"
            title="Speak question"
            className={`p-2 rounded-xl border transition-all ${
              isListening
                ? 'bg-red-600 border-red-500 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-cyan-400'
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
            placeholder="Ask about Pune flood zones, shelters, or road closures..."
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
