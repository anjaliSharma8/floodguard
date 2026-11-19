import React from 'react';
import {
  ShieldAlert,
  User,
  ShieldCheck,
  ArrowRight,
  MapPin,
  SlidersHorizontal,
  KeyRound,
  Sparkles,
  PhoneCall,
  Activity
} from 'lucide-react';
import { Language } from '../types';

interface WelcomePortalProps {
  onSelectRole: (selectedType: 'CITIZEN' | 'EXPERT') => void;
  onQuickDevLogin: (account: 'citizen' | 'expert' | 'pending_expert') => void;
  lang: Language;
}

export const WelcomePortal: React.FC<WelcomePortalProps> = ({
  onSelectRole,
  onQuickDevLogin
}) => {
  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="max-w-7xl w-full mx-auto flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-2xl shadow-lg flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center space-x-2">
              <span>SanketSetu</span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono">
                Pune &amp; PCMC
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Smart Flood Risk Assessment &amp; Emergency Safe-Route Management System
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-semibold text-slate-300 hidden sm:inline">Live Monitoring Online</span>
        </div>
      </header>

      {/* Main Welcome Content */}
      <main className="max-w-4xl w-full mx-auto my-auto py-10 z-10 text-center space-y-8">
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3.5 py-1.5 rounded-full inline-block">
            Two-Role Emergency Access Portal
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            Welcome to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-300">
              SanketSetu
            </span>
          </h2>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Real-time flood risk assessment, directed OpenStreetMap safe-route navigation, and verified hazard reporting for Pune and Pimpri-Chinchwad.
          </p>
        </div>

        {/* Two Role Portals: Strictly CITIZEN & EXPERT */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-3xl mx-auto">
          {/* Card 1: Citizen Mode */}
          <div className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/80 rounded-3xl p-6 sm:p-7 shadow-2xl transition-all duration-300 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-md">
                <User className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1">
                  Public Emergency Access
                </span>
                <h3 className="text-xl font-bold text-white">Continue as Citizen</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Plan safest, fastest, or shortest routes on Pune/PCMC roads, inspect flood risks, report waterlogging, and locate shelters &amp; SOS helplines.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Shortest, Fastest &amp; Safest Road-Graph Routes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <PhoneCall className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Emergency Shelters, Hospitals &amp; RESQ Helplines</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Multilingual Voice &amp; Grounded AI Assistant (EN/HI/MR)</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectRole('CITIZEN')}
              className="mt-6 w-full bg-blue-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-md"
            >
              <span>Enter Citizen Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: Expert Mode */}
          <div className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/80 rounded-3xl p-6 sm:p-7 shadow-2xl transition-all duration-300 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                  Verified Operations Personnel
                </span>
                <h3 className="text-xl font-bold text-white">Continue as Expert</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Authorized disaster command desk for civic hydrologists, PMC/PCMC engineers, and rescue coordinators. New applications require active Expert approval.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center space-x-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Verify Citizen Hazards &amp; Manage Official Closures</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>What-If Rainfall Stress Testing &amp; Data Telemetry</span>
                </div>
                <div className="flex items-center space-x-2">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Peer Expert Approvals &amp; Persistent Audit Logs</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectRole('EXPERT')}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-md"
            >
              <span>Enter Expert Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Development-only Quick Login (zero passwords in client bundle; disabled in production builds) */}
        {isDev && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 max-w-3xl mx-auto text-left text-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-300 flex items-center space-x-1.5">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                <span>Development Mode Quick Sign-In</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Server-Issued Token • Disabled in Prod</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => onQuickDevLogin('citizen')}
                className="p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700 text-left transition-colors"
              >
                <strong className="text-cyan-300 block">Citizen Demo</strong>
                <span className="text-slate-400 block truncate">Anjali Sharma (CITIZEN)</span>
                <span className="text-emerald-400 text-[10px] font-semibold">Active Public Access</span>
              </button>

              <button
                type="button"
                onClick={() => onQuickDevLogin('expert')}
                className="p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700 text-left transition-colors"
              >
                <strong className="text-indigo-300 block">Approved Expert Demo</strong>
                <span className="text-slate-400 block truncate">Dr. Rajiv Kulkarni (EXPERT)</span>
                <span className="text-emerald-400 text-[10px] font-semibold">Active Operational Desk</span>
              </button>

              <button
                type="button"
                onClick={() => onQuickDevLogin('pending_expert')}
                className="p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700 text-left transition-colors"
              >
                <strong className="text-amber-300 block">Pending Expert</strong>
                <span className="text-slate-400 block truncate">Capt. Vikram Deshmukh</span>
                <span className="text-amber-400 text-[10px] font-semibold">Tests Approval Guard</span>
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-7xl w-full mx-auto text-center text-xs text-slate-500 py-4 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2 z-10">
        <div>SanketSetu • Smart Flood Risk Assessment &amp; Emergency Safe-Route System</div>
        <div className="text-[11px] text-slate-400">
          Pune &amp; Pimpri-Chinchwad, Maharashtra • Strictly Two Roles (Citizen &amp; Expert)
        </div>
      </footer>
    </div>
  );
};
