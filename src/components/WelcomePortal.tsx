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
  onQuickDemoLogin: (email: string, pass: string, role: 'CITIZEN' | 'EXPERT') => void;
  lang: Language;
}

export const WelcomePortal: React.FC<WelcomePortalProps> = ({
  onSelectRole,
  onQuickDemoLogin,
  lang
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 lg:p-8 font-sans relative overflow-hidden">
      {/* Background Hydrological Glow Elements */}
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
              <span>FloodGuard</span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono">
                Katathon 6.0 • Prob 103
              </span>
            </h1>
            <p className="text-xs text-slate-400">Pune & Pimpri-Chinchwad Flood Risk Intelligence</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-semibold text-slate-300 hidden sm:inline">Disaster Command Online</span>
        </div>
      </header>

      {/* Main Welcome Content */}
      <main className="max-w-4xl w-full mx-auto my-auto py-12 z-10 text-center space-y-8">
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-3.5 py-1.5 rounded-full inline-block">
            Mandatory Authentication System
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-300">FloodGuard</span>
          </h2>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            AI-powered, community-driven flood risk intelligence and emergency safe-route management system. Choose your account type to proceed.
          </p>
        </div>

        {/* Two Separate Interfaces Selection (Section 3 & 4) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left max-w-3xl mx-auto">
          {/* Card 1: Citizen Mode */}
          <div 
            onClick={() => onSelectRole('CITIZEN')}
            className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/80 rounded-3xl p-6 sm:p-7 shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between hover:shadow-cyan-500/10 hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                <User className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1">
                  Public Emergency Access
                </span>
                <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors">
                  Continue as Citizen
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Personal safe-route navigation, real-time waterlogging warnings, nearby shelter finder, crowdsourced reporting, and 1-click SOS helplines.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center space-x-2">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Dijkstra Shortest vs Safest Route Planner</span>
                </div>
                <div className="flex items-center space-x-2">
                  <PhoneCall className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>Emergency Helplines & RESQ Animal Rescue</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>AI Guard Grounded Chatbot (EN, HI, MR)</span>
                </div>
              </div>
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); onSelectRole('CITIZEN'); }}
              className="mt-6 w-full bg-blue-600 group-hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-md"
            >
              <span>Enter Citizen Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Card 2: Expert Mode */}
          <div 
            onClick={() => onSelectRole('EXPERT')}
            className="group relative bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/80 rounded-3xl p-6 sm:p-7 shadow-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between hover:shadow-indigo-500/10 hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                  Authorised Personnel Only
                </span>
                <h3 className="text-xl font-bold text-white group-hover:text-indigo-300 transition-colors">
                  Continue as Expert
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Secure disaster-response command desk for municipal authorities, NDRF, and emergency coordinators. Requires verified agency credentials.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center space-x-2">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>Incident Verification & Official Road Blockages</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Activity className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>Pre-Flood What-If Cloudburst Simulation</span>
                </div>
                <div className="flex items-center space-x-2">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Admin Clearance Approval & Immutable Audit Logs</span>
                </div>
              </div>
            </div>

            <button 
              onClick={(e) => { e.stopPropagation(); onSelectRole('EXPERT'); }}
              className="mt-6 w-full bg-indigo-600 group-hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center space-x-2 transition-all shadow-md"
            >
              <span>Enter Expert Portal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hackathon Quick-Login Seed Desk (Section 4.E) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 max-w-3xl mx-auto text-left text-xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-300 flex items-center space-x-1.5">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              <span>Hackathon Evaluation Demo Credentials (1-Click Authenticate)</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Real Backend Auth Active</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <button
              onClick={() => onQuickDemoLogin('citizen@pune.in', 'Citizen@123', 'CITIZEN')}
              className="p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700 text-left transition-colors"
            >
              <strong className="text-cyan-300 block">Citizen Account</strong>
              <span className="text-slate-400 block truncate">citizen@pune.in</span>
              <span className="text-emerald-400 text-[10px] font-semibold">Active Citizen Mode</span>
            </button>

            <button
              onClick={() => onQuickDemoLogin('officer.kulkarni@pmc.gov.in', 'Expert@123', 'EXPERT')}
              className="p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700 text-left transition-colors"
            >
              <strong className="text-indigo-300 block">PMC Expert Officer</strong>
              <span className="text-slate-400 block truncate">officer.kulkarni@pmc.gov.in</span>
              <span className="text-emerald-400 text-[10px] font-semibold">Active Operational Desk</span>
            </button>

            <button
              onClick={() => onQuickDemoLogin('admin@floodguard.pune.gov.in', 'Admin@FloodGuard2026', 'EXPERT')}
              className="p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700 text-left transition-colors"
            >
              <strong className="text-amber-300 block">Chief Administrator</strong>
              <span className="text-slate-400 block truncate">admin@floodguard...</span>
              <span className="text-amber-400 text-[10px] font-semibold">Full Authority & Approvals</span>
            </button>

            <button
              onClick={() => onQuickDemoLogin('deshmukh@ndrf.gov.in', 'Expert@123', 'EXPERT')}
              className="p-2.5 bg-slate-800 hover:bg-slate-700/80 rounded-xl border border-slate-700 text-left transition-colors"
            >
              <strong className="text-purple-300 block">Pending Expert</strong>
              <span className="text-slate-400 block truncate">deshmukh@ndrf.gov.in</span>
              <span className="text-amber-400 text-[10px] font-semibold">Tests Approval Guard</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl w-full mx-auto text-center text-xs text-slate-500 py-4 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2 z-10">
        <div>
          FloodGuard • Katathon 6.0 Problem 103 • Pune & Pimpri-Chinchwad Region
        </div>
        <div className="text-[11px] text-slate-400">
          Strict Zero-Guest Architecture: Every user authenticates to their dedicated portal.
        </div>
      </footer>
    </div>
  );
};
