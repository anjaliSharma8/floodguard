import React from 'react';
import {
  ShieldAlert,
  User,
  ShieldCheck,
  ArrowRight,
  MapPin,
  SlidersHorizontal,
  KeyRound,
  PhoneCall,
  Activity,
  Users
} from 'lucide-react';
import { Language } from '../types';

interface WelcomePortalProps {
  onSelectRole: (selectedType: 'CITIZEN' | 'EXPERT' | 'AUTHORITY_ADMIN') => void;
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
              <span>SankatSetu</span>
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
      <main className="max-w-screen-2xl w-full mx-auto my-8 lg:my-auto py-6 sm:py-8 z-10 text-center space-y-8 lg:space-y-10">
        <div className="space-y-4">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3.5 py-1.5 rounded-full inline-block">
            Emergency Access Portal
          </span>
          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight">
            Welcome to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-300">
              SankatSetu
            </span>
          </h2>
          <p className="text-slate-300 text-base sm:text-lg max-w-3xl mx-auto leading-relaxed">
            Real-time flood risk assessment, directed OpenStreetMap safe-route navigation, and verified hazard reporting for Pune and Pimpri-Chinchwad.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-7 text-left items-stretch">
          <div className="group min-h-[390px] bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/80 rounded-3xl p-7 sm:p-8 shadow-xl transition-all duration-300 flex flex-col">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-md mb-5">
              <User className="w-7 h-7" />
            </div>
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-1">Public Emergency Access</span>
            <h3 className="text-2xl font-bold text-white">Citizen Portal</h3>
            <p className="text-base text-slate-400 mt-3 leading-relaxed">
              Plan safe routes, check local flood risks, report hazards, and find shelters and emergency help.
            </p>
            <div className="space-y-3 mt-5 pt-5 border-t border-slate-800 text-sm text-slate-300">
              <div className="flex items-center space-x-3">
                <MapPin className="w-5 h-5 text-cyan-400 shrink-0" />
                <span>Live route and flood-risk guidance</span>
              </div>
              <div className="flex items-center space-x-3">
                <PhoneCall className="w-5 h-5 text-blue-400 shrink-0" />
                <span>Shelters, SOS and multilingual assistance</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectRole('CITIZEN')}
              className="mt-auto w-full bg-blue-600 hover:bg-cyan-500 text-white font-bold py-4 px-5 rounded-xl text-sm uppercase tracking-wider flex items-center justify-center space-x-2.5 transition-all shadow-md"
            >
              <span>Enter Citizen Portal</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <div className="group min-h-[390px] bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-teal-500/80 rounded-3xl p-7 sm:p-8 shadow-xl transition-all duration-300 flex flex-col">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-700 flex items-center justify-center text-white shadow-md mb-5">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <span className="text-xs font-bold text-teal-300 uppercase tracking-wider mb-1">Restricted Government Access</span>
            <h3 className="text-2xl font-bold text-white">Authority Admin</h3>
            <p className="text-base text-slate-400 mt-3 leading-relaxed">
              Manage your authority’s experts, applications, invitations, permissions, and audit activity.
            </p>
            <div className="space-y-3 mt-5 pt-5 border-t border-slate-800 text-sm text-slate-300">
              <div className="flex items-center space-x-3">
                <Users className="w-5 h-5 text-teal-400 shrink-0" />
                <span>Authority-scoped member management</span>
              </div>
              <div className="flex items-center space-x-3">
                <Activity className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Administrative activity and audit logs</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectRole('AUTHORITY_ADMIN')}
              className="mt-auto w-full bg-teal-700 hover:bg-teal-600 text-white font-bold py-4 px-5 rounded-xl text-sm uppercase tracking-wider flex items-center justify-center space-x-2.5 transition-all shadow-md"
            >
              <span>Authority Admin Sign In</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <div className="group min-h-[390px] bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/80 rounded-3xl p-7 sm:p-8 shadow-xl transition-all duration-300 flex flex-col">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md mb-5">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Verified Operations Personnel</span>
            <h3 className="text-2xl font-bold text-white">Expert Portal</h3>
            <p className="text-base text-slate-400 mt-3 leading-relaxed">
              Review citizen hazards and support flood response. New expert applications require Authority Admin approval.
            </p>
            <div className="space-y-3 mt-5 pt-5 border-t border-slate-800 text-sm text-slate-300">
              <div className="flex items-center space-x-3">
                <SlidersHorizontal className="w-5 h-5 text-indigo-400 shrink-0" />
                <span>Verify hazards and manage road status</span>
              </div>
              <div className="flex items-center space-x-3">
                <KeyRound className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Authority-assigned permissions and audit access</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectRole('EXPERT')}
              className="mt-auto w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 px-5 rounded-xl text-sm uppercase tracking-wider flex items-center justify-center space-x-2.5 transition-all shadow-md"
            >
              <span>Expert Sign In</span>
              <ArrowRight className="w-5 h-5" />
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
        <div>SankatSetu • Smart Flood Risk Assessment &amp; Emergency Safe-Route System</div>
        <div className="text-[11px] text-slate-400">
          Pune &amp; Pimpri-Chinchwad, Maharashtra • Citizen, Authority Admin &amp; Expert access
        </div>
      </footer>
    </div>
  );
};
