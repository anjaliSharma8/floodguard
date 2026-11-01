import React from 'react';
import { 
  ShieldAlert, 
  MapPin, 
  Users, 
  Flame, 
  Radio, 
  Database, 
  Wifi, 
  WifiOff, 
  Volume2, 
  VolumeX, 
  Mic, 
  Languages, 
  PhoneCall, 
  SlidersHorizontal 
} from 'lucide-react';
import { Language, UserRole } from '../types';
import { TRANSLATIONS } from '../utils/i18n';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  role: UserRole;
  setRole: (role: UserRole) => void;
  isOffline: boolean;
  setIsOffline: (offline: boolean) => void;
  onOpenChat: () => void;
  onOpenOfflineGuide: () => void;
  onTriggerVoice: () => void;
  isVoiceListening: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  lang,
  setLang,
  role,
  setRole,
  isOffline,
  setIsOffline,
  onOpenChat,
  onOpenOfflineGuide,
  onTriggerVoice,
  isVoiceListening
}) => {
  const t = TRANSLATIONS[lang];

  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 text-white shadow-lg">
      {/* Alert Ticker */}
      <div className="bg-amber-600 text-slate-950 px-4 py-1.5 text-xs font-semibold flex items-center justify-between overflow-hidden">
        <div className="flex items-center space-x-2 truncate">
          <span className="bg-red-700 text-white px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold animate-pulse">
            LIVE ADVISORY
          </span>
          <span className="truncate">{t.weatherAlert}</span>
        </div>
        <div className="hidden md:flex items-center space-x-3 text-xs pl-4 shrink-0">
          <span>Khadakwasla Dam: 18,400 cfs</span>
          <span>•</span>
          <span>Pavana Dam: 92% Full</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Region */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setCurrentTab('map')}>
            <div className="p-2 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl shadow-md flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-white">{t.appTitle}</span>
                <span className="text-[10px] bg-blue-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-full font-mono">
                  v2.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">{t.regionTag}</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="hidden lg:flex items-center space-x-1" aria-label="Main Navigation">
            <button
              onClick={() => setCurrentTab('map')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentTab === 'map' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Map & Routes</span>
            </button>

            <button
              onClick={() => setCurrentTab('community')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentTab === 'community' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Community & Polls</span>
            </button>

            <button
              onClick={() => setCurrentTab('resources')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentTab === 'resources' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <PhoneCall className="w-4 h-4" />
              <span>Emergency SOS</span>
            </button>

            <button
              onClick={() => setCurrentTab('expert')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentTab === 'expert' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Authority Desk</span>
            </button>

            <button
              onClick={() => setCurrentTab('data')}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-1.5 ${
                currentTab === 'data' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Datasets</span>
            </button>
          </nav>

          {/* Right Action Controls: Voice, Language, Offline, Chat, Role */}
          <div className="flex items-center space-x-2">
            {/* Voice Assistant Button */}
            <button
              onClick={onTriggerVoice}
              title={t.voiceAssistant}
              className={`p-2 rounded-lg border transition-all flex items-center space-x-1 text-xs font-semibold ${
                isVoiceListening
                  ? 'bg-red-600 border-red-500 text-white animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-cyan-400'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span className="hidden sm:inline">{isVoiceListening ? 'Listening...' : 'Voice'}</span>
            </button>

            {/* Language Selector */}
            <div className="relative inline-block text-left">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
                aria-label="Select language"
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="mr">मराठी</option>
              </select>
            </div>

            {/* Offline Mode Toggle Button */}
            <button
              onClick={() => {
                const next = !isOffline;
                setIsOffline(next);
                if (next) onOpenOfflineGuide();
              }}
              title={isOffline ? 'Offline Mode Active' : 'Online Connection Active'}
              className={`p-2 rounded-lg border transition-colors ${
                isOffline 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                  : 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {isOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
            </button>

            {/* AI Emergency Chatbot Trigger */}
            <button
              onClick={onOpenChat}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-lg shadow flex items-center space-x-1.5 transition-all"
            >
              <Radio className="w-3.5 h-3.5 text-cyan-300 animate-spin" />
              <span>AI Guard</span>
            </button>

            {/* Role Switcher Pill */}
            <button
              onClick={() => {
                const newRole: UserRole = role === 'CITIZEN' ? 'EXPERT' : 'CITIZEN';
                setRole(newRole);
                if (newRole === 'EXPERT') setCurrentTab('expert');
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white"
            >
              Role: <span className="font-semibold text-cyan-400 capitalize">{role.toLowerCase()}</span>
            </button>
          </div>
        </div>

        {/* Mobile Submenu Bar */}
        <div className="flex lg:hidden overflow-x-auto py-2 space-x-1 border-t border-slate-800">
          <button
            onClick={() => setCurrentTab('map')}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${currentTab === 'map' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
          >
            Map & Routes
          </button>
          <button
            onClick={() => setCurrentTab('community')}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${currentTab === 'community' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
          >
            Community & Polls
          </button>
          <button
            onClick={() => setCurrentTab('resources')}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${currentTab === 'resources' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
          >
            Emergency SOS
          </button>
          <button
            onClick={() => setCurrentTab('expert')}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${currentTab === 'expert' ? 'bg-indigo-600 text-white' : 'text-slate-300'}`}
          >
            Authority Desk
          </button>
          <button
            onClick={() => setCurrentTab('data')}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${currentTab === 'data' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
          >
            Datasets
          </button>
        </div>
      </div>
    </header>
  );
};
