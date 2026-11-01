import React from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../utils/i18n';
import { 
  WifiOff, 
  X, 
  ShieldCheck, 
  FileText, 
  HardDrive, 
  AlertTriangle, 
  CheckCircle2, 
  PhoneCall 
} from 'lucide-react';

interface OfflineGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const OfflineGuideModal: React.FC<OfflineGuideModalProps> = ({ isOpen, onClose, lang }) => {
  const t = TRANSLATIONS[lang];
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 text-xs">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-900 px-4 py-3.5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-600 rounded-xl text-slate-950 shadow">
              <WifiOff className="w-5 h-5 font-bold" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm flex items-center space-x-1.5">
                <span>{t.offlineGuide}</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono">
                  PWA Ready
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Cached Pune Geographical Graph & Emergency Handbook</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Warning banner */}
          <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-200 leading-relaxed">
            <div className="flex items-center space-x-1.5 font-bold text-amber-300 mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Offline Mode Active</span>
            </div>
            Route information is computed locally using your previously cached road graph. Live telemetry updates and newly emerging road blockages cannot be verified until cellular connectivity resumes.
          </div>

          {/* Local Cache Audit */}
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700 space-y-2">
            <span className="font-bold text-slate-200 block text-xs flex items-center space-x-1.5">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Locally Cached Assets for Pune & PCMC:</span>
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Road Graph (13 Nodes, 16 Edges)</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>6 Emergency Shelters & Contacts</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>6 Major Hospitals & Trauma Units</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>RESQ Animal Flood Helpline</span>
              </div>
            </div>
          </div>

          {/* Offline Survival Protocol */}
          <div className="space-y-2">
            <span className="font-bold text-slate-200 block text-xs flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Critical Offline Flood Actions:</span>
            </span>

            <div className="space-y-1.5 text-slate-300">
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">1. Electrical Isolation:</strong> Turn off main power MCBs immediately if ground floor water enters your premise. Do not touch wet inverters or transformers.
              </div>
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">2. High Ground Relocation:</strong> If near Sinhagad Road (Ekta Nagari / Anand Nagar), move to the 2nd floor or proceed uphill towards Kothrud or Katraj ridge (585m+).
              </div>
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">3. Turn Around, Don't Drown:</strong> 15 cm (6 inches) of moving floodwater can knock an adult off their feet; 30 cm (1 ft) will float a small car.
              </div>
              <div className="p-2.5 bg-slate-800/40 rounded-lg border border-slate-700/60">
                <strong className="text-white">4. Keep Animals Unchained:</strong> Stranded dogs, cattle, and goats can swim to safety if free. Unfasten all leashes.
              </div>
            </div>
          </div>

          {/* Essential Direct Helplines */}
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-1.5">
            <span className="font-bold text-slate-200 block">Dial Directly via Carrier Network:</span>
            <div className="flex justify-between text-slate-300 font-mono text-[11px]">
              <span>PMC Disaster: <strong>020-25501269</strong></span>
              <span>Fire: <strong>101</strong></span>
              <span>Ambulance: <strong>108</strong></span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
